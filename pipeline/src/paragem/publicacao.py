"""Publicar o que o sítio lê: ``build/<id>/sitio/`` → o armazém, e avisar o sítio.

O sítio deixou de ser exportação estática (CLAUDE.md §11.7). As páginas
continuam a sair dos ficheiros que o ``pipeline sitio`` escreve, mas já não
os leem do disco na construção: leem-nos, a pedido, de um armazém público —
o Storage do projeto Supabase, num balde chamado ``sitio`` — e guardam a
página rendida em cache até alguém lhes dizer que os dados mudaram.

Este módulo é a metade de quem diz. Faz quatro coisas, por esta ordem, e a
ordem é o que torna a publicação segura:

1. **Envia o que mudou.** Compara o MD5 de cada ficheiro local com a etiqueta
   do que está no armazém e só envia o que é diferente ou novo — os mosaicos
   do mapa são 60 MB e mudam uma vez por semana, se tanto. Apaga o que
   sobra: a página de uma linha suprimida não pode continuar a existir só
   porque ninguém a foi apagar.
2. **Escreve o inventário.** ``<regiao>/inventario.json`` é a lista do que
   foi publicado, com o tamanho e o MD5 de cada ficheiro. De tudo o que o
   sítio lê, é o último a subir, de propósito: é o sinal de que o resto está
   completo, e é por ele que o sítio sabe, por exemplo, se a região tem
   mosaicos.
3. **Avisa o sítio.** ``POST /api/revalidate`` com a região, e o sítio deita
   fora as páginas dessa região. Sem aviso, as páginas continuam válidas até
   o prazo de uma hora passar — não é uma avaria, é só mais lento.
4. **Escreve o estado.** ``<regiao>/estado.json`` é o que esta publicação
   diz de si a quem a vigia de fora: quando foi, e umas contagens (``estado``).
   Vai no fim, depois do aviso: diz que a publicação se fez, e só se diz
   depois de feita — e um painel por atualizar não atrasa as páginas de
   quem viaja.

**O que isto NÃO garante.** Um pedido que chegue a meio do envio pode ler um
ficheiro novo e outro velho. A janela é a duração do envio — segundos, tirando
os mosaicos —, e as páginas só se refazem quando o aviso chega, depois de
tudo estar no ar. Uma publicação versionada, com o inventário a apontar para
a versão, fecharia a janela de vez; fica para quando fizer falta.
"""

from __future__ import annotations

import base64
import hashlib
import json
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

import httpx

from .relatorio import BLOQUEIA, LACUNA

BALDE = "sitio"
INVENTARIO = "inventario.json"
ESTADO = "estado.json"
MOSAICOS = "regiao.pmtiles"

#: O que a publicação escreve ela própria, e não vem de ``build/<id>/sitio/``.
#: Não entra no inventário, e não se apaga do armazém por não estar no disco:
#: reescreve-se. Sem isto, o estado da semana passada era apagado a meio de
#: cada publicação — e contado nos «apagados» — para voltar a subir no fim.
ESCRITOS_NA_PUBLICACAO = (INVENTARIO, ESTADO)

#: Quanto tempo o navegador e a rede de distribuição podem guardar um ficheiro.
#: Os dados mudam por semana; uma hora é o mesmo prazo das páginas no sítio.
VALIDADE_S = 3600

TIPOS = {
    ".json": "application/json",
    ".geojson": "application/geo+json",
    ".pmtiles": "application/vnd.pmtiles",
    ".csv": "text/csv; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".zip": "application/zip",
    ".pdf": "application/pdf",
    # O logótipo da região (`marca.py`). Com o tipo genérico, o navegador não o
    # desenhava num `<img>`: um SVG só é imagem quando o servidor o diz.
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
}


class ErroDePublicacao(RuntimeError):
    """Uma publicação que não se pode fazer, com a razão escrita."""


@dataclass(frozen=True)
class Ficheiro:
    """Um ficheiro a publicar: onde está aqui, e como se chama lá."""

    caminho: str  # dentro do balde: «<regiao>/partidas/<concelho>.json»
    origem: Path
    bytes: int
    md5: str
    tipo: str


def tipo_de(nome: str) -> str:
    """O ``Content-Type`` pela extensão. O que não se conhece vai como binário."""
    return TIPOS.get(Path(nome).suffix.lower(), "application/octet-stream")


def _md5(caminho: Path) -> str:
    h = hashlib.md5()  # uma etiqueta de conteúdo, não segurança
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def _ficheiro(regiao_id: str, relativo: str, origem: Path) -> Ficheiro:
    return Ficheiro(
        caminho=f"{regiao_id}/{relativo}",
        origem=origem,
        bytes=origem.stat().st_size,
        md5=_md5(origem),
        tipo=tipo_de(relativo),
    )


def inventariar(raiz: Path, regiao_id: str) -> list[Ficheiro]:
    """Tudo o que o sítio lê de uma região, com o nome que vai ter no balde.

    É ``build/<id>/sitio/**`` tal e qual, mais os mosaicos do mapa, que o
    ``pipeline mosaicos`` escreve noutra pasta e o mapa vai buscar como
    ``<regiao>/regiao.pmtiles``. Uma região sem mosaicos publica-se na mesma,
    e o inventário diz que não os tem.
    """
    base = raiz / "build" / regiao_id / "sitio"
    if not (base / "regiao.json").exists():
        raise ErroDePublicacao(
            f"não há nada para publicar em {base}: corre primeiro "
            f"`uv run pipeline build --regiao {regiao_id}` e "
            f"`uv run pipeline sitio --regiao {regiao_id}`"
        )
    ficheiros = [
        _ficheiro(regiao_id, p.relative_to(base).as_posix(), p)
        for p in sorted(base.rglob("*"))
        if p.is_file() and p.relative_to(base).as_posix() not in ESCRITOS_NA_PUBLICACAO
    ]
    mosaicos = raiz / "build" / regiao_id / "mosaicos" / MOSAICOS
    if mosaicos.exists():
        ficheiros.append(_ficheiro(regiao_id, MOSAICOS, mosaicos))
    return ficheiros


class Armazem(Protocol):
    """O que a publicação pede a um armazém. O Supabase é um; os testes têm outro."""

    def listar(self, prefixo: str) -> dict[str, str | None]:
        """Caminho → MD5 (ou ``None`` quando o armazém não o sabe) de tudo sob o prefixo."""

    def enviar(self, ficheiro: Ficheiro) -> None: ...

    def enviar_bytes(self, caminho: str, conteudo: bytes, tipo: str) -> None: ...

    def apagar(self, caminhos: list[str]) -> None: ...


@dataclass(frozen=True)
class Plano:
    enviar: list[Ficheiro]
    iguais: list[Ficheiro]
    apagar: list[str]


def planear(locais: list[Ficheiro], remotos: dict[str, str | None]) -> Plano:
    """O que enviar, o que já lá está igual, e o que sobra no armazém.

    Um ficheiro remoto sem MD5 conhecido envia-se outra vez: na dúvida,
    publica-se — o custo é largura de banda, e o custo do contrário é uma
    página com dados velhos que ninguém sabe que são velhos.
    """
    enviar, iguais = [], []
    for f in locais:
        if remotos.get(f.caminho) == f.md5:
            iguais.append(f)
        else:
            enviar.append(f)
    nossos = {f.caminho for f in locais}
    apagar = sorted(
        c for c in remotos if c not in nossos and c.split("/", 1)[-1] not in ESCRITOS_NA_PUBLICACAO
    )
    return Plano(enviar=enviar, iguais=iguais, apagar=apagar)


@dataclass(frozen=True)
class Resultado:
    regiao: str
    enviados: int
    iguais: int
    apagados: int
    bytes_enviados: int
    #: ``None`` quando não se avisou ninguém (sem endereço do sítio);
    #: senão, se o sítio aceitou o aviso.
    avisado: bool | None
    #: O que foi para o ``estado.json``, para quem publica o ver no registo.
    estado: dict[str, Any] = field(default_factory=dict)


def _instante(agora: datetime) -> str:
    return agora.astimezone(UTC).isoformat(timespec="seconds")


def inventario(regiao_id: str, ficheiros: list[Ficheiro], agora: datetime) -> dict[str, Any]:
    return {
        "regiao": regiao_id,
        "publicado_em": _instante(agora),
        "ficheiros": {
            f.caminho.removeprefix(regiao_id + "/"): {"bytes": f.bytes, "md5": f.md5}
            for f in ficheiros
        },
    }


# --- o estado público de uma região ----------------------------------------
#
# QUEM O LÊ é quem vigia de fora — um painel que pergunta de hora a hora se os
# dados desta região se publicam, e com que saúde —, pela porta pública do
# balde, sem chave: ``<balde>/<regiao>/estado.json``.
#
# O QUE LEVA É UMA LISTA FECHADA: contagens, a data e mais nada. Nem nomes de
# paragens, nem de linhas, nem de pessoas, nem de documentos — só o que a
# autoridade de transportes aceitaria ver público, e uma contagem de lacunas
# aceita-se onde a lista delas não se aceitaria. O estado diz quantas; quais
# são, di-lo o relatório.
#
#   ultima_publicacao  o instante desta publicação — o mesmo do inventário
#   ficheiros          quantos tem o sítio publicado da região: os do
#                      inventário (o inventário e o estado não se contam)
#   bloqueios          as contagens do relatório da construção, pela
#   lacunas            gravidade; os avisos dele não entram
#   descargas          quantos ficheiros a página de dados abertos oferece
#
# O QUE NÃO SE SABE FICA DE FORA, e não vai a zero: sem relatório não há
# bloqueios nem lacunas, e zero diria que não há nenhum. Há dois que ficam
# sempre de fora pela mesma razão: os AVISOS EM VIGOR e se a região tem
# CONTACTOS. Vivem na base do painel (`public.avisos`, `region_contactos`) e
# leem-se de lá em direto (`web/src/lib/avisos.ts`, `web/src/lib/contactos.ts`);
# o pipeline não lê a base, e o `regiao.yaml` não declara contactos. Escrever
# aqui um valor que não se leu era inventá-lo — e um `false` nos contactos
# diria que a região não os tem quando só não se perguntou.


def _ler_json(caminho: Path) -> Any:
    """O JSON de um ficheiro, ou ``None`` se não existir ou não se ler."""
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def estado(
    raiz: Path, regiao_id: str, ficheiros: list[Ficheiro], agora: datetime
) -> dict[str, Any]:
    """O ``estado.json`` de uma região: a lista fechada lá de cima, e só ela."""
    e: dict[str, Any] = {"ultima_publicacao": _instante(agora), "ficheiros": len(ficheiros)}

    relatorio = _ler_json(raiz / "build" / "reports" / f"{regiao_id}.json")
    if isinstance(relatorio, dict) and isinstance(relatorio.get("lacunas"), list):
        gravidades = [x.get("gravidade") for x in relatorio["lacunas"] if isinstance(x, dict)]
        e["bloqueios"] = gravidades.count(BLOQUEIA)
        e["lacunas"] = gravidades.count(LACUNA)

    # O MANIFESTO QUE SE PUBLICOU, e não o que estiver no disco: conta-se o que
    # a página vai listar.
    manifesto = next(
        (f.origem for f in ficheiros if f.caminho == f"{regiao_id}/dados-abertos.json"), None
    )
    descargas = _ler_json(manifesto) if manifesto else None
    if isinstance(descargas, list):
        e["descargas"] = sum(1 for d in descargas if isinstance(d, dict) and d.get("existe", True))
    return e


def publicar(
    raiz: Path,
    regiao_id: str,
    armazem: Armazem,
    avisar: Callable[[str], bool] | None = None,
    agora: datetime | None = None,
    trabalhadores: int = 8,
) -> Resultado:
    """Envia, apaga, escreve o inventário, avisa e escreve o estado — por esta ordem."""
    locais = inventariar(raiz, regiao_id)
    plano = planear(locais, armazem.listar(regiao_id))
    # Em paralelo: são milhares de ficheiros pequenos — uma ficha por paragem —
    # e o tempo de cada envio é quase todo latência. Oito de cada vez.
    with ThreadPoolExecutor(max_workers=trabalhadores) as pool:
        for _ in pool.map(armazem.enviar, plano.enviar):
            pass
    if plano.apagar:
        armazem.apagar(plano.apagar)
    # O MESMO INSTANTE NOS DOIS: o estado diz a hora que o inventário diz.
    quando = agora or datetime.now(UTC)
    _enviar_json(armazem, f"{regiao_id}/{INVENTARIO}", inventario(regiao_id, locais, quando))
    avisado = avisar(regiao_id) if avisar is not None else None
    e = estado(raiz, regiao_id, locais, quando)
    _enviar_json(armazem, f"{regiao_id}/{ESTADO}", e)
    return Resultado(
        regiao=regiao_id,
        enviados=len(plano.enviar),
        iguais=len(plano.iguais),
        apagados=len(plano.apagar),
        bytes_enviados=sum(f.bytes for f in plano.enviar),
        avisado=avisado,
        estado=e,
    )


def _enviar_json(armazem: Armazem, caminho: str, dados: dict[str, Any]) -> None:
    texto = json.dumps(dados, ensure_ascii=False, indent=1)
    armazem.enviar_bytes(caminho, (texto + "\n").encode("utf-8"), TIPOS[".json"])


# ---------------------------------------------------------------------------
# O Supabase Storage, pela API de objetos
# ---------------------------------------------------------------------------


def tipo_da_chave(chave: str) -> str:
    """Que chave do Supabase é esta, sem a mostrar a ninguém.

    Devolve ``secreta`` (``sb_secret_…``), ``publica`` (``sb_publishable_…``),
    ``servico`` (o JWT antigo ``service_role``), ``anonima`` (o JWT antigo
    ``anon``) ou ``desconhecida``. Do JWT lê-se só o papel que ele declara,
    sem o validar: é para dizer a quem a pôs que pôs a errada, não para
    decidir acesso nenhum — isso é o Supabase que decide.
    """
    if chave.startswith("sb_secret_"):
        return "secreta"
    if chave.startswith("sb_publishable_"):
        return "publica"
    partes = chave.split(".")
    if len(partes) == 3:
        try:
            corpo = partes[1] + "=" * (-len(partes[1]) % 4)
            papel = json.loads(base64.urlsafe_b64decode(corpo)).get("role")
        except (ValueError, AttributeError):
            papel = None
        if papel == "service_role":
            return "servico"
        if papel == "anon":
            return "anonima"
    return "desconhecida"


def cabecalhos_da_chave(chave: str) -> dict[str, str]:
    """Como a chave vai em cada pedido, conforme o tipo dela.

    AS CHAVES NOVAS NÃO SÃO JWT. Uma ``sb_secret_…`` vai só no ``apikey``:
    posta também num ``Authorization: Bearer``, o Supabase tenta lê-la como
    JWT e o pedido segue sem o papel de serviço. A listagem do balde passava
    (o balde é público) e cada escrita era recusada pelas políticas de acesso
    — «new row violates row-level security policy» —, que foi como falhou a
    primeira publicação feita com uma chave nova. A documentação do Supabase
    di-lo nas limitações conhecidas das chaves novas.

    A chave antiga, ``service_role``, é um JWT, e vai nos dois, como sempre foi.
    """
    if chave.startswith("sb_"):
        return {"apikey": chave}
    return {"authorization": f"Bearer {chave}", "apikey": chave}


class ArmazemSupabase:
    """Um balde do Storage do Supabase, falado pela API REST com a chave de serviço.

    A chave de serviço ignora as políticas de acesso: só aqui, só no pipeline,
    nunca no sítio. O sítio lê o balde pela porta pública, sem chave nenhuma.
    """

    def __init__(
        self,
        url: str,
        chave: str,
        balde: str = BALDE,
        cliente: httpx.Client | None = None,
    ) -> None:
        self.url = url.rstrip("/")
        self.balde = balde
        self.cliente = cliente or httpx.Client(timeout=httpx.Timeout(300.0, connect=30.0))
        self.cabecalhos = cabecalhos_da_chave(chave)

    def _falhou(self, r: httpx.Response, o_que: str) -> None:
        if r.status_code >= 400:
            raise ErroDePublicacao(f"{o_que}: HTTP {r.status_code} — {r.text[:300]}")

    def listar(self, prefixo: str) -> dict[str, str | None]:
        """Tudo sob o prefixo, pasta a pasta: a API lista um nível de cada vez."""
        achados: dict[str, str | None] = {}
        por_visitar = [prefixo.strip("/")]
        while por_visitar:
            pasta = por_visitar.pop()
            desde = 0
            while True:
                r = self.cliente.post(
                    f"{self.url}/storage/v1/object/list/{self.balde}",
                    headers=self.cabecalhos,
                    json={
                        "prefix": pasta,
                        "limit": 1000,
                        "offset": desde,
                        "sortBy": {"column": "name", "order": "asc"},
                    },
                )
                self._falhou(r, f"listar {pasta!r}")
                itens = r.json()
                for item in itens:
                    caminho = f"{pasta}/{item['name']}" if pasta else item["name"]
                    if item.get("id") is None:  # uma pasta
                        por_visitar.append(caminho)
                        continue
                    etiqueta = ((item.get("metadata") or {}).get("eTag") or "").strip('"')
                    # Um envio simples deixa o MD5 como etiqueta; um envio por
                    # partes deixa outra coisa, e aí não se sabe.
                    achados[caminho] = etiqueta if len(etiqueta) == 32 else None
                if len(itens) < 1000:
                    break
                desde += len(itens)
        return achados

    def _enviar(self, caminho: str, conteudo: Any, tipo: str) -> None:
        r = self.cliente.post(
            f"{self.url}/storage/v1/object/{self.balde}/{caminho}",
            headers={
                **self.cabecalhos,
                "content-type": tipo,
                "x-upsert": "true",
                "cache-control": f"max-age={VALIDADE_S}",
            },
            content=conteudo,
        )
        self._falhou(r, f"enviar {caminho!r}")

    def enviar(self, ficheiro: Ficheiro) -> None:
        with ficheiro.origem.open("rb") as f:
            self._enviar(ficheiro.caminho, f, ficheiro.tipo)

    def enviar_bytes(self, caminho: str, conteudo: bytes, tipo: str) -> None:
        self._enviar(caminho, conteudo, tipo)

    def apagar(self, caminhos: list[str]) -> None:
        r = self.cliente.request(
            "DELETE",
            f"{self.url}/storage/v1/object/{self.balde}",
            headers=self.cabecalhos,
            json={"prefixes": caminhos},
        )
        self._falhou(r, f"apagar {len(caminhos)} ficheiros")


def avisador_do_sitio(
    sitio: str, segredo: str, cliente: httpx.Client | None = None
) -> Callable[[str], bool]:
    """Quem chama ``/api/revalidate`` do sítio com a região que acabou de subir."""
    c = cliente or httpx.Client(timeout=30.0)
    endereco = sitio.rstrip("/") + "/api/revalidate/"

    def avisar(regiao_id: str) -> bool:
        try:
            r = c.post(
                endereco,
                headers={"authorization": f"Bearer {segredo}"},
                json={"regioes": [regiao_id]},
            )
        except httpx.HTTPError as e:
            print(f"     o sítio não respondeu ao aviso: {e}")
            return False
        if r.status_code != 200:
            print(f"     o sítio recusou o aviso: HTTP {r.status_code} — {r.text[:200]}")
            return False
        return True

    return avisar
