"""O motor de viagens: OpenTripPlanner 2, construído a partir do que a Fase 1 produz.

Não há nada aqui que saiba o que é o Médio Tejo. A região declara o que entra no
grafo e as viagens que exige saber responder (`motor:` na receita), e este
módulo lê isso — é a mesma regra dos leitores, pela mesma razão: uma região nova
tem de poder ter motor sem que alguém escreva Python.

**Porquê o OTP e não contas nossas.** Um planeador de viagens multimodal com
transbordos, horários e caminho pedonal é um problema resolvido, e mal
resolvido é um problema que manda alguém para um autocarro que não passa.
Reimplementá-lo era ter duas opiniões e não saber qual está desatualizada — o
mesmo raciocínio do validador.

**E o OTP é uma segunda opinião sobre o feed.** A construção do grafo recusa
coisas que o validador deixa passar: paragens que nenhuma rua alcança, formas
que não fecham, viagens sem percurso possível. Um grafo que constrói sem
queixas diz mais sobre a qualidade dos dados do que qualquer contagem nossa.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .jvm import SemJava, java

# A VERSÃO ESTÁ FIXADA, pela mesma razão do validador e do poppler: um motor que
# se atualiza sozinho faz o CI mudar de opinião sem que nada no repositório
# tenha mudado. Subir é uma decisão, tomada com os itinerários antes e depois à
# frente.
VERSAO = "2.6.0"
ENDERECO = "https://repo1.maven.org/maven2/org/opentripplanner/otp/{versao}/otp-{versao}-shaded.jar"

# O OTP 2.6 é compilado para Java 21. Em Java 17 morre com
# `UnsupportedClassVersionError`, que não diz a ninguém o que fazer a seguir.
JAVA_MINIMO = 21


class ErroDeMotor(Exception):
    pass


# ---------------------------------------------------------------------------
# o jar
# ---------------------------------------------------------------------------


def jar(raiz: Path) -> Path:
    """Onde está o OTP. Por esta ordem: ambiente, cache, descarregado."""
    do_ambiente = os.environ.get("OTP_JAR")
    if do_ambiente and Path(do_ambiente).exists():
        return Path(do_ambiente)

    guardado = Path(raiz) / ".cache" / "otp.jar"
    if guardado.exists():
        return guardado

    import httpx

    versao = os.environ.get("OTP_VERSAO", VERSAO)
    endereco = ENDERECO.format(versao=versao)
    try:
        guardado.parent.mkdir(parents=True, exist_ok=True)
        parcial = guardado.with_suffix(".parcial")
        with httpx.stream("GET", endereco, follow_redirects=True, timeout=900.0) as r:
            r.raise_for_status()
            with open(parcial, "wb") as f:
                for pedaco in r.iter_bytes(chunk_size=1 << 20):
                    f.write(pedaco)
        parcial.replace(guardado)
        return guardado
    except Exception as e:  # noqa: BLE001 — a razão interessa toda, para a mensagem
        guardado.with_suffix(".parcial").unlink(missing_ok=True)
        raise ErroDeMotor(
            f"não há OTP v{versao}: {type(e).__name__}: {e}. São 187 MB do Maven Central. "
            "Põe o caminho do jar em OTP_JAR, ou guarda-o em .cache/otp.jar."
        ) from e


# ---------------------------------------------------------------------------
# a pasta do grafo
# ---------------------------------------------------------------------------


@dataclass
class Grafo:
    pasta: Path
    ficheiro: Path
    segundos: float
    memoria_mb: int
    avisos: list[str] = field(default_factory=list)
    registo: Path | None = None

    def problemas(self) -> dict[str, int]:
        """O «Issue summary» que o OTP escreve no fim da construção.

        É a segunda opinião sobre os dados, e é preciso guardá-la: o validador
        da MobilityData olha para o GTFS sozinho, e o OTP olha para o GTFS
        CONTRA A RUA. Coisas que só se veem assim — uma paragem que nenhuma rua
        alcança, um percurso que passa longe da paragem que diz servir — não
        aparecem em mais lado nenhum.
        """
        if not self.registo or not self.registo.exists():
            return {}
        achados: dict[str, int] = {}
        for linha in self.registo.read_text(encoding="utf-8").splitlines():
            m = re.search(r"DataImportIssueSummary.*?-\s+(\w+)\s+([\d,]+)\s*$", linha)
            if m:
                achados[m.group(1)] = int(m.group(2).replace(",", ""))
        return dict(sorted(achados.items(), key=lambda x: -x[1]))

    def por_tipo(self) -> dict[str, int]:
        """Os avisos agrupados pela classe do OTP que os emitiu.

        Uma lista de 35 linhas não se lê; «14 paragens sem rua perto» lê-se. O
        nome da classe é o que distingue um problema de outro, e vem entre
        parênteses no formato de registo deles: `(StopModelIndex.java:108)`.
        """
        contagem: dict[str, int] = {}
        for linha in self.avisos:
            m = re.search(r"\(([A-Za-z0-9_$]+)\.java:\d+\)", linha)
            chave = m.group(1) if m else "outro"
            contagem[chave] = contagem.get(chave, 0) + 1
        return dict(sorted(contagem.items(), key=lambda x: -x[1]))


def preparar(raiz: Path, regiao, destino: Path) -> Path:
    """Junta numa pasta o que o OTP lê: o recorte do OSM e os feeds.

    O OTP lê uma PASTA, não uma lista de ficheiros — por isso monta-se uma, com
    ligações e não com cópias: os feeds têm dezenas de MB e duplicá-los a cada
    construção é disco e tempo por nada.
    """
    decl = regiao.motor
    if not decl:
        raise ErroDeMotor(
            f"a região {regiao.id!r} não declara `motor:` na receita. Sem isso não há o que "
            "construir — é lá que se diz que feeds entram no grafo."
        )

    pasta = Path(destino) / "otp"
    pasta.mkdir(parents=True, exist_ok=True)
    for velho in pasta.iterdir():
        if velho.is_symlink() or velho.is_file():
            velho.unlink()

    entradas: list[str] = []
    for relativo in [decl.get("osm"), *(decl.get("gtfs") or [])]:
        if not relativo:
            continue
        origem = Path(destino) / relativo
        if not origem.exists():
            raise ErroDeMotor(
                f"falta {origem.relative_to(raiz)} — o grafo constrói-se do que o "
                "`pipeline build` produz, e isso ainda não foi produzido."
            )
        # O nome achatado: `gtfs/meio.zip` → `gtfs-meio.zip`. O OTP não lê
        # subpastas, e dois feeds com o mesmo nome base pisavam-se.
        alvo = pasta / relativo.replace("/", "-")
        alvo.symlink_to(origem.resolve())
        entradas.append(alvo.name)

    (pasta / "build-config.json").write_text(
        json.dumps(_build_config(decl), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (pasta / "router-config.json").write_text(
        json.dumps(_router_config(decl), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return pasta


def _build_config(decl: dict[str, Any]) -> dict[str, Any]:
    fuso = decl.get("fuso", "UTC")
    return {
        "transitServiceStart": "-P1Y",
        "transitServiceEnd": "P2Y",
        # O FUSO DO GRAFO, e é preciso dizê-lo porque os feeds não concordam:
        # o da rede e o da CP declaram `Europe/Lisbon`, o da FlixBus declara
        # `UTC` — que é uma escolha legítima num feed pan-europeu, onde as
        # horas de cada viagem se interpretam no fuso da agência dela. Sem esta
        # chave o OTP recusa-se a construir:
        #
        #     The graph contains agencies with different time zones:
        #     [Europe/Lisbon, UTC]
        #
        # E a resposta NÃO é reescrever o `agency_timezone` da FlixBus: o
        # CLAUDE.md §5 diz que um feed de terceiro sai como veio, e mexer-lhe
        # fazia com que ninguém conseguisse dizer se uma diferença veio dele ou
        # de nós. Diz-se ao motor qual é o fuso de CASA; cada agência mantém o
        # seu, e o OTP converte.
        "transitModelTimeZone": fuso,
        "osmDefaults": {"timeZone": fuso},
        "transitFeeds": [
            {"type": "gtfs", "source": p.replace("/", "-")} for p in (decl.get("gtfs") or [])
        ],
        "osm": [{"source": (decl.get("osm") or "").replace("/", "-")}] if decl.get("osm") else [],
        "maxTransferDuration": "PT30M",
    }


def _router_config(decl: dict[str, Any]) -> dict[str, Any]:
    return {
        "routingDefaults": {
            "numItineraries": int(decl.get("itinerarios", 5)),
            "transferSlack": "PT2M",
        },
        # `server` sem `apiDocumentationPath`: expõe-se o que é preciso e não
        # mais. O proxy com limites é decisão de quem aloja (CLAUDE.md §7).
    }


# Dos problemas que o OTP levanta, estes são SOBRE OS NOSSOS DADOS. Os outros
# — ilhas do grafo de ruas, restrições de viragem, geometria do OSM — são do
# OpenStreetMap, e contá-los como nossos enterrava os que são.
#
# Cada um tem escrito o que significa para quem viaja, porque um nome de classe
# Java não diz a ninguém porque é que aquilo interessa.
NOSSOS = {
    "IsolatedStop": (
        "paragens que nenhuma rua alcança. Quem lá chegar não consegue sair a pé, e o motor "
        "não as propõe — ou propõe uma caminhada que não existe."
    ),
    "ShapeGeometryTooFar": (
        "o percurso desenhado passa longe de uma paragem que a viagem diz servir. Ou a paragem "
        "está no sítio errado, ou o percurso é de outra viagem."
    ),
    "StopNotLinkedForTransfers": (
        "paragens sem ligação a pé a nenhuma outra. Um transbordo entre elas é impossível para "
        "o motor, mesmo que na rua se faça a atravessar a estrada."
    ),
    "RemovedMissingServiceIdTrip": (
        "viagens deitadas fora por o serviço delas não ter uma única data. É a mesma lacuna do "
        "calendário, vista de um terceiro lado — depois do parser e do validador."
    ),
    "TripDegenerate": "viagens com menos de duas paragens, que não são viagem nenhuma.",
    "NegativeHopTime": "uma hora que recua entre duas paragens seguidas.",
    "NegativeDwellTime": "uma paragem onde a partida é anterior à chegada.",
}


# ---------------------------------------------------------------------------
# construir
# ---------------------------------------------------------------------------

# Linhas do registo do OTP que interessam ao relatório. O resto é ruído de
# arranque, e um registo em que tudo interessa é um registo que ninguém lê.
_INTERESSA = ("WARN", "ERROR", "Issue", "graph.obj", "Graph building took")


def construir(
    raiz: Path, regiao, destino: Path, *, memoria: str = "4G", tempo_limite: int = 3600
) -> Grafo:
    """Constrói o grafo e devolve quanto demorou e quanta memória precisou."""
    executavel = java(JAVA_MINIMO)
    caminho_do_jar = jar(raiz)
    pasta = preparar(raiz, regiao, destino)

    comeco = time.monotonic()
    r = subprocess.run(
        [
            executavel,
            f"-Xmx{memoria}",
            "-jar",
            str(caminho_do_jar),
            # Uma chave de configuração mal escrita é IGNORADA em silêncio, e
            # uma configuração que não faz nada parece-se com uma que faz. Com
            # isto, o OTP recusa arrancar e diz qual é a chave que não conhece
            # — foi assim que se descobriu que `osmDefaults.timeZone` não
            # resolvia o conflito de fusos, e `transitModelTimeZone` é que era.
            "--abortOnUnknownConfig",
            "--build",
            "--save",
            str(pasta),
        ],
        capture_output=True,
        text=True,
        timeout=tempo_limite,
        env={**os.environ, "JAVA_TOOL_OPTIONS": ""},
    )
    segundos = time.monotonic() - comeco
    registo = (r.stdout or "") + (r.stderr or "")

    if r.returncode != 0:
        cauda = "\n".join(registo.splitlines()[-25:])
        raise ErroDeMotor(f"a construção do grafo falhou (código {r.returncode}):\n{cauda}")

    ficheiro = pasta / "graph.obj"
    if not ficheiro.exists():
        raise ErroDeMotor("o OTP saiu bem mas não escreveu `graph.obj`.")

    # O REGISTO FICA EM DISCO. A construção do grafo é a segunda opinião sobre
    # o feed — recusa coisas que o validador deixa passar —, e uma segunda
    # opinião que se calcula e se deita fora não é opinião nenhuma. A primeira
    # versão disto imprimia só os ERROR e perdia os 35 avisos.
    ficheiro_do_registo = pasta / "construcao.log"
    ficheiro_do_registo.write_text(registo, encoding="utf-8")

    avisos = [ln.strip() for ln in registo.splitlines() if any(m in ln for m in _INTERESSA)]
    return Grafo(
        pasta=pasta,
        ficheiro=ficheiro,
        segundos=segundos,
        memoria_mb=ficheiro.stat().st_size // (1 << 20),
        avisos=avisos,
        registo=ficheiro_do_registo,
    )


# ---------------------------------------------------------------------------
# servir e perguntar
# ---------------------------------------------------------------------------


class Servidor:
    """O OTP a correr, como gestor de contexto.

    Não usa o Docker de propósito: o `docker compose` existe em `otp/` para
    quem aloja, mas os TESTES têm de poder correr num sítio sem daemon de
    Docker — e o CI é um desses sítios. É o mesmo jar, com o mesmo grafo.
    """

    def __init__(self, raiz: Path, pasta: Path, *, porta: int = 8801, memoria: str = "4G") -> None:
        self.raiz = Path(raiz)
        self.pasta = Path(pasta)
        self.porta = porta
        self.memoria = memoria
        self._proc: subprocess.Popen | None = None
        self._registo: Path = self.pasta / "servidor.log"

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.porta}"

    def __enter__(self) -> Servidor:
        executavel = java(JAVA_MINIMO)
        caminho_do_jar = jar(self.raiz)
        self._registo.parent.mkdir(parents=True, exist_ok=True)
        saida = open(self._registo, "w", encoding="utf-8")
        self._proc = subprocess.Popen(
            [
                executavel,
                f"-Xmx{self.memoria}",
                "-jar",
                str(caminho_do_jar),
                "--load",
                "--port",
                str(self.porta),
                "--bindAddress",
                "127.0.0.1",
                str(self.pasta),
            ],
            stdout=saida,
            stderr=subprocess.STDOUT,
            env={**os.environ, "JAVA_TOOL_OPTIONS": ""},
        )
        self._esperar()
        return self

    def __exit__(self, *_a) -> None:
        if self._proc is None:
            return
        self._proc.terminate()
        try:
            self._proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            self._proc.kill()
            self._proc.wait(timeout=30)

    def _esperar(self, segundos: int = 300) -> None:
        """Espera que responda — e desiste com o registo à frente, não em silêncio."""
        limite = time.monotonic() + segundos
        ultimo = ""
        while time.monotonic() < limite:
            if self._proc is not None and self._proc.poll() is not None:
                raise ErroDeMotor(
                    f"o OTP morreu ao arrancar (código {self._proc.returncode}):\n{self._cauda()}"
                )
            try:
                with urllib.request.urlopen(f"{self.url}/otp", timeout=5) as r:
                    if r.status == 200:
                        return
            except (urllib.error.URLError, OSError, TimeoutError) as e:
                ultimo = f"{type(e).__name__}: {e}"
            time.sleep(2)
        raise ErroDeMotor(f"o OTP não respondeu em {segundos}s ({ultimo}).\n{self._cauda()}")

    def _cauda(self, linhas: int = 25) -> str:
        if not self._registo.exists():
            return "(sem registo)"
        return "\n".join(self._registo.read_text(encoding="utf-8").splitlines()[-linhas:])

    # --- perguntar ------------------------------------------------------

    def graphql(self, consulta: str, variaveis: dict[str, Any] | None = None) -> dict[str, Any]:
        corpo = json.dumps({"query": consulta, "variables": variaveis or {}}).encode()
        pedido = urllib.request.Request(
            f"{self.url}/otp/gtfs/v1",
            data=corpo,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(pedido, timeout=120) as r:
            resposta = json.load(r)
        if resposta.get("errors"):
            raise ErroDeMotor(f"o GraphQL respondeu com erros: {resposta['errors']}")
        return resposta.get("data") or {}


# A JANELA DE PROCURA É EXPLÍCITA, e é a decisão mais importante deste ficheiro.
#
# Por omissão o OTP calcula-a sozinho. Medido para Torres Novas (Terminal) →
# Entroncamento (Estação) às 09:00, DUAS VEZES — e a segunda corrige a
# primeira, por isso ficam as duas:
#
#     janela                    antes do calendário   com o calendário
#     sem declarar (3000 s)       0 itinerários          1 itinerário
#     2 h                         1                      2
#     4 h                         2                      4
#     8 h                         5                      5
#    12 h                         5                      5
#
# O «zero» da primeira coluna era, em boa parte, o calendário escolar em falta:
# só os serviços anuais tinham datas e havia muito menos partidas no dia. Com
# o calendário preenchido, cinquenta minutos já encontram caminho.
#
# O argumento fica mais fraco e continua a ganhar. Cinquenta minutos é uma
# janela de cidade, onde o autocarro seguinte vem aí; aqui mostra UMA opção
# onde há CINCO, e numa rede em que o seguinte pode ser daqui a três horas a
# opção escondida é a que serve.
#
# A pergunta certa aqui é «há viagem HOJE?» e não «há viagem já a seguir».
# Doze horas cobrem um dia de serviço inteiro, e a partir das oito a resposta
# já não muda.
JANELA_SEGUNDOS = 12 * 3600

CONSULTA_VIAGEM = """
query Viagem(
  $de: InputCoordinates!, $para: InputCoordinates!,
  $data: String!, $hora: String!, $janela: Long!
) {
  plan(
    from: $de, to: $para, date: $data, time: $hora,
    numItineraries: 5, searchWindow: $janela,
    transportModes: [{mode: WALK}, {mode: BUS}, {mode: RAIL}]
  ) {
    itineraries {
      duration
      walkDistance
      legs {
        mode
        duration
        distance
        route { shortName longName }
        from { name }
        to { name }
      }
    }
  }
}
"""


@dataclass
class Itinerario:
    segundos: int
    metros_a_pe: float
    pernas: list[dict[str, Any]]

    @property
    def minutos(self) -> int:
        return round(self.segundos / 60)

    @property
    def transbordos(self) -> int:
        return max(0, len([p for p in self.pernas if p["mode"] != "WALK"]) - 1)

    @property
    def linhas(self) -> list[str]:
        return [
            (p.get("route") or {}).get("shortName") or ""
            for p in self.pernas
            if p["mode"] != "WALK" and p.get("route")
        ]


def viajar(
    servidor: Servidor,
    de: dict,
    para: dict,
    data: str,
    hora: str,
    *,
    janela: int = JANELA_SEGUNDOS,
) -> list[Itinerario]:
    dados = servidor.graphql(
        CONSULTA_VIAGEM,
        {
            "de": {"lat": float(de["lat"]), "lon": float(de["lon"])},
            "para": {"lat": float(para["lat"]), "lon": float(para["lon"])},
            "data": data,
            "hora": hora,
            "janela": int(janela),
        },
    )
    plano = (dados.get("plan") or {}).get("itineraries") or []
    return [
        Itinerario(
            segundos=int(i["duration"]),
            metros_a_pe=float(i.get("walkDistance") or 0.0),
            pernas=i.get("legs") or [],
        )
        for i in plano
    ]


def disponivel(raiz: Path) -> str | None:
    """Porque é que o motor NÃO se pode correr aqui, ou `None` se se puder.

    Serve para um teste saltar a dizer porquê, em vez de fingir que verificou.
    """
    try:
        java(JAVA_MINIMO)
    except SemJava as e:
        return str(e)
    if os.environ.get("OTP_JAR") and Path(os.environ["OTP_JAR"]).exists():
        return None
    if (Path(raiz) / ".cache" / "otp.jar").exists():
        return None
    if not shutil.which("curl") and not os.environ.get("PARAGEM_DESCARREGA_OTP"):
        return "o jar do OTP não está em .cache/otp.jar"
    return None
