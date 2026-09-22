"""Ler e escrever GTFS, com o mínimo de opinião.

O GTFS é um conjunto de CSV dentro de um zip, e é assim que se trata aqui: sem
esquema, sem validação de tipos, sem modelo de objetos. A validação a sério é
do `gtfs-validator` da MobilityData, que é a ferramenta que o resto do mundo
usa e cuja opinião conta; duplicá-la em Python era ter duas opiniões e não
saber qual delas está desatualizada.

O que esta camada garante é modesto e importante: a ORDEM das colunas
mantém-se, e um campo que uma fonte não tem não passa a existir vazio. Um feed
que muda de forma a cada corrida é um feed cujas diferenças ninguém consegue
ler.
"""

from __future__ import annotations

import csv
import io
import zipfile
from collections.abc import Iterable, Iterator
from pathlib import Path

# A ordem canónica. Ficheiros fora desta lista saem a seguir, por ordem
# alfabética — não se perdem só por serem pouco comuns.
ORDEM = [
    "agency.txt",
    "feed_info.txt",
    "stops.txt",
    "routes.txt",
    "calendar.txt",
    "calendar_dates.txt",
    "shapes.txt",
    "trips.txt",
    "stop_times.txt",
    "frequencies.txt",
    "transfers.txt",
    "pathways.txt",
    "levels.txt",
    "fare_attributes.txt",
    "fare_rules.txt",
]

Linha = dict[str, str]


class ErroDeGtfs(Exception):
    pass


class Tabela:
    """Um ficheiro do feed: as colunas por ordem, e as linhas."""

    def __init__(self, colunas: list[str], linhas: list[Linha]) -> None:
        self.colunas = list(colunas)
        self.linhas = linhas

    def __iter__(self) -> Iterator[Linha]:
        return iter(self.linhas)

    def __len__(self) -> int:
        return len(self.linhas)

    def __getitem__(self, i: int) -> Linha:
        return self.linhas[i]

    def acrescentar_coluna(self, nome: str, omissao: str = "") -> None:
        if nome in self.colunas:
            return
        self.colunas.append(nome)
        for linha in self.linhas:
            linha.setdefault(nome, omissao)

    def filtrar(self, predicado) -> None:
        self.linhas = [linha for linha in self.linhas if predicado(linha)]

    def valores(self, coluna: str) -> set[str]:
        return {linha.get(coluna, "") for linha in self.linhas}


class Gtfs:
    def __init__(self, tabelas: dict[str, Tabela] | None = None) -> None:
        self.tabelas: dict[str, Tabela] = tabelas or {}

    # --- acesso ----------------------------------------------------------

    def __contains__(self, nome: object) -> bool:
        return nome in self.tabelas

    def __getitem__(self, nome: str) -> Tabela:
        if nome not in self.tabelas:
            raise ErroDeGtfs(f"o feed não tem {nome}")
        return self.tabelas[nome]

    def obter(self, nome: str) -> Tabela:
        """Como `[]`, mas devolve uma tabela vazia em vez de rebentar."""
        return self.tabelas.get(nome, Tabela([], []))

    def definir(self, nome: str, colunas: Iterable[str], linhas: list[Linha]) -> Tabela:
        t = Tabela(list(colunas), linhas)
        self.tabelas[nome] = t
        return t

    @property
    def stops(self) -> Tabela:
        return self.obter("stops.txt")

    @property
    def routes(self) -> Tabela:
        return self.obter("routes.txt")

    @property
    def trips(self) -> Tabela:
        return self.obter("trips.txt")

    @property
    def stop_times(self) -> Tabela:
        return self.obter("stop_times.txt")

    # --- ler -------------------------------------------------------------

    @classmethod
    def ler(cls, caminho: Path) -> Gtfs:
        caminho = Path(caminho)
        if caminho.is_dir():
            return cls._ler_pasta(caminho)
        if zipfile.is_zipfile(caminho):
            return cls._ler_zip(caminho)
        raise ErroDeGtfs(f"{caminho} não é nem um zip nem uma pasta de GTFS")

    @classmethod
    def _ler_pasta(cls, pasta: Path) -> Gtfs:
        tabelas = {}
        for f in sorted(pasta.glob("*.txt")):
            with open(f, encoding="utf-8-sig", newline="") as fh:
                tabelas[f.name] = _ler_csv(fh)
        if not tabelas:
            raise ErroDeGtfs(f"{pasta} não tem ficheiros .txt")
        return cls(tabelas)

    @classmethod
    def _ler_zip(cls, caminho: Path) -> Gtfs:
        tabelas = {}
        with zipfile.ZipFile(caminho) as z:
            for nome in sorted(z.namelist()):
                base = Path(nome).name
                if not base.endswith(".txt") or nome.startswith("__MACOSX"):
                    continue
                with z.open(nome) as bruto:
                    texto = io.TextIOWrapper(bruto, encoding="utf-8-sig", newline="")
                    tabelas[base] = _ler_csv(texto)
        if not tabelas:
            raise ErroDeGtfs(f"{caminho} não tem ficheiros .txt")
        return cls(tabelas)

    # --- escrever --------------------------------------------------------

    def escrever(self, destino: Path) -> Path:
        destino = Path(destino)
        destino.parent.mkdir(parents=True, exist_ok=True)
        conhecidos = [n for n in ORDEM if n in self.tabelas]
        outros = sorted(n for n in self.tabelas if n not in ORDEM)
        # `ZIP_DEFLATED` e nada de timestamps do sistema: duas corridas sobre
        # os mesmos dados têm de produzir o mesmo ficheiro, senão não se
        # consegue dizer se uma mudança no feed veio dos dados ou da máquina.
        with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for nome in conhecidos + outros:
                tabela = self.tabelas[nome]
                buffer = io.StringIO(newline="")
                escritor = csv.DictWriter(
                    buffer, fieldnames=tabela.colunas, extrasaction="ignore", lineterminator="\n"
                )
                escritor.writeheader()
                for linha in tabela.linhas:
                    escritor.writerow({c: linha.get(c, "") for c in tabela.colunas})
                info = zipfile.ZipInfo(nome, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, buffer.getvalue())
        return destino

    # --- contas ----------------------------------------------------------

    def resumo(self) -> dict[str, int]:
        return {nome: len(t) for nome, t in sorted(self.tabelas.items())}

    def paragens_por_viagem(self) -> dict[str, int]:
        contagem: dict[str, int] = {}
        for linha in self.stop_times:
            tid = linha.get("trip_id", "")
            contagem[tid] = contagem.get(tid, 0) + 1
        return contagem


def id_seguro(ident: str) -> str:
    """Um identificador nosso, com os carateres que o GTFS não quer.

    Os `:`, `@` e `,` são legítimos num identificador do universo de paragens e
    uma dor de cabeça num ficheiro que vai ser lido por vinte programas
    diferentes. Vive aqui, e não num leitor, porque os feeds de uma região têm
    de dar o MESMO identificador à mesma paragem: quem carregar os dois no
    mesmo motor de viagens tem de os ver como um sítio só.
    """
    return "".join(c if c.isalnum() or c in "._-" else "-" for c in ident)


def _ler_csv(fh) -> Tabela:
    leitor = csv.DictReader(fh)
    colunas = list(leitor.fieldnames or [])
    return Tabela(colunas, [dict(linha) for linha in leitor])


def segundos(hora: str) -> int | None:
    """`25:10:00` → 90600. O GTFS deixa passar das 24h, e é preciso que deixe.

    Uma viagem que parte às 23h50 e chega às 00h20 do dia seguinte escreve-se
    `24:20:00`. Tratá-la como 00:20 punha a chegada antes da partida.
    """
    partes = (hora or "").strip().split(":")
    if len(partes) != 3:
        return None
    try:
        h, m, s = (int(p) for p in partes)
    except ValueError:
        return None
    return h * 3600 + m * 60 + s
