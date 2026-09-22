"""Os limites dos concelhos, para saber em que concelho está um ponto.

O que estava cá antes era a **caixa geográfica**, e uma caixa é um retângulo. A
região não é. Tudo o que se conta por ela conta a mais: apanha praças de táxi,
estações e paragens dos concelhos do lado que calham dentro do retângulo. Era
essa — uma só — a causa das três contagens que divergiam do CLAUDE.md §6.4: 19
praças de táxi onde há 9, 43 estações de comboio onde há 28, 23 estações sem
ligação a autocarro onde há 8.

A caixa continua a existir e continua a ser precisa: é o PARÂMETRO com que se
recorta o OpenStreetMap e se decide que viagens de um feed europeu passam por
aqui, e para isso um retângulo com margem é exatamente o que se quer. O que ela
não é, e estava a ser, é uma resposta à pergunta «isto é da região?».

A resposta a essa pergunta é geométrica e vem da CAOP, que a Direção-Geral do
Território publica em CC BY 4.0 — **a atribuição é obrigatória** e viaja em
`data/sources.yaml`.

Uma região não é obrigada a declarar limites. A de prova não declara: não há
uma CAOP de um sítio inventado. Sem limites declarados, a atribuição volta a
ser pela caixa e o relatório diz que é — que é o que já fazia.
"""

from __future__ import annotations

import sqlite3
import struct
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# O sistema de coordenadas da CAOP: ETRS89 / Portugal TM06, em metros. Tudo o
# resto no pipeline está em graus (WGS84), por isso a conversão faz-se uma vez,
# aqui, sobre os polígonos — e não a cada ponto que se pergunta.
CRS_CAOP = 3763
CRS_GRAUS = 4326


class ErroDeTerritorio(Exception):
    pass


@dataclass(frozen=True)
class Limite:
    """Um concelho, com a fronteira que a CAOP lhe dá."""

    codigo: str
    nome: str
    geometria: Any  # BaseGeometry, em graus

    def contem(self, lat: float, lon: float) -> bool:
        from shapely.geometry import Point

        return bool(self.geometria.covers(Point(lon, lat)))


class Territorio:
    """Os limites dos concelhos de uma região, prontos a responder.

    `covers` e não `contains`: um ponto exatamente em cima da fronteira
    pertence aos dois concelhos e não a nenhum, e `contains` responde `False`
    às duas perguntas. Uma paragem no meio da ponte tem de ficar em algum
    lado.
    """

    def __init__(self, limites: list[Limite]) -> None:
        if not limites:
            raise ErroDeTerritorio("um território sem limites não responde a nada.")
        self.limites = limites
        self._por_codigo = {x.codigo: x for x in limites}
        self._arvore = None
        self._ordem: list[Limite] = []

    def __len__(self) -> int:
        return len(self.limites)

    @property
    def codigos(self) -> set[str]:
        return set(self._por_codigo)

    def _indice(self):
        """Índice espacial, construído à primeira pergunta.

        São 13 polígonos e podia ser uma varredura linear — mas os polígonos da
        CAOP têm dezenas de milhares de vértices cada, e a pergunta faz-se uma
        vez por paragem. Com 4.673 paragens a diferença deixa de ser teórica.
        """
        if self._arvore is None:
            import shapely
            from shapely import STRtree

            self._ordem = list(self.limites)
            # `prepare` constrói o índice interno do polígono UMA vez. Sem
            # isto, cada `covers` reconstrói-o — e a pergunta faz-se uma vez
            # por paragem.
            shapely.prepare([x.geometria for x in self._ordem])
            self._arvore = STRtree([x.geometria for x in self._ordem])
        return self._arvore

    def concelho_de(self, lat: float, lon: float) -> Limite | None:
        from shapely.geometry import Point

        p = Point(lon, lat)
        arvore = self._indice()
        for i in arvore.query(p):
            candidato = self._ordem[int(i)]
            if candidato.geometria.covers(p):
                return candidato
        return None

    def contem(self, lat: float, lon: float) -> bool:
        return self.concelho_de(lat, lon) is not None


# ---------------------------------------------------------------------------
# ler a CAOP
# ---------------------------------------------------------------------------


def _gpkg_wkb(blob: bytes) -> bytes:
    """Tira o cabeçalho GeoPackage de uma geometria e devolve o WKB de dentro.

    O formato está na norma OGC 12-128r19, §2.1.3: `GP`, versão, bandeiras,
    `srs_id`, um envelope de tamanho variável e só depois o WKB. O tamanho do
    envelope vem nos bits 1–3 das bandeiras, e é por isso que não se pode
    simplesmente saltar um número fixo de bytes.
    """
    if len(blob) < 8 or blob[:2] != b"GP":
        raise ErroDeTerritorio("isto não é uma geometria GeoPackage.")
    bandeiras = blob[3]
    envelope = (bandeiras >> 1) & 0b111
    tamanhos = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    if envelope not in tamanhos:
        raise ErroDeTerritorio(f"envelope GeoPackage desconhecido: {envelope}")
    return blob[8 + tamanhos[envelope] :]


def _gpkg_srs(blob: bytes) -> int:
    ordem = "<" if blob[3] & 0b1 else ">"
    return int(struct.unpack(f"{ordem}i", blob[4:8])[0])


def _e_zip(caminho: Path) -> bool:
    with open(caminho, "rb") as f:
        return f.read(2) == b"PK"


def _extrair(zip_da_caop: Path, destino: Path) -> Path:
    """O `.gpkg` de dentro do zip, guardado uma vez.

    São 188 MB descomprimidos. Extrair a cada construção é minutos de disco
    para ler treze polígonos.
    """
    if destino.exists() and destino.stat().st_size > 0:
        return destino
    with zipfile.ZipFile(zip_da_caop) as z:
        nomes = [n for n in z.namelist() if n.lower().endswith(".gpkg")]
        if not nomes:
            raise ErroDeTerritorio(f"{zip_da_caop.name} não tem nenhum .gpkg lá dentro.")
        destino.parent.mkdir(parents=True, exist_ok=True)
        provisorio = destino.with_suffix(".parcial")
        with z.open(nomes[0]) as origem, open(provisorio, "wb") as f:
            while pedaco := origem.read(1 << 22):
                f.write(pedaco)
        provisorio.replace(destino)
    return destino


def ler_caop(
    caminho: Path,
    codigos: list[str],
    *,
    camada: str = "cont_municipios",
    campo_codigo: str = "dtmn",
    campo_nome: str = "municipio",
    cache: Path | None = None,
) -> Territorio:
    """Os limites dos concelhos com estes códigos, já em graus.

    `codigos` são os `dico` declarados pela região. Pedir por código e não por
    nome é deliberado: «Sertã» escreve-se de uma maneira e «Serta» de outra, e
    um acento perdido numa codificação não pode fazer desaparecer um concelho.
    """
    import shapely
    from pyproj import Transformer

    caminho = Path(caminho)
    # Pelos primeiros bytes e não pela extensão. A extensão com que o ficheiro
    # é guardado vem do `formato` declarado na fonte, que descreve o que está
    # LÁ DENTRO — e o que vem pelo fio é um zip. Um pipeline que decida por
    # aí abre o zip como se fosse uma base de dados e diz «file is not a
    # database», que não ajuda ninguém.
    if _e_zip(caminho):
        if cache is None:
            raise ErroDeTerritorio("para extrair o .gpkg do zip é preciso dizer onde o guardar.")
        caminho = _extrair(caminho, cache)

    con = sqlite3.connect(f"file:{caminho}?mode=ro", uri=True)
    try:
        marcas = ",".join("?" * len(codigos))
        linhas = con.execute(
            f"select {campo_codigo}, {campo_nome}, geom from {camada} "  # noqa: S608
            f"where {campo_codigo} in ({marcas})",
            codigos,
        ).fetchall()
    except sqlite3.DatabaseError as e:
        # `DatabaseError` e não só `OperationalError`: um ficheiro truncado a
        # meio de uma descarga dá «file is not a database», que é
        # `DatabaseError`, e rebentava daqui para fora em vez de virar lacuna.
        raise ErroDeTerritorio(f"não se conseguiu ler {camada} de {caminho.name}: {e}") from e
    finally:
        con.close()

    transformador: Transformer | None = None
    limites: list[Limite] = []
    for codigo, nome, blob in linhas:
        srs = _gpkg_srs(blob)
        geometria = shapely.from_wkb(_gpkg_wkb(blob))
        if srs != CRS_GRAUS:
            if transformador is None:
                transformador = Transformer.from_crs(srs, CRS_GRAUS, always_xy=True)
            t = transformador

            def para_graus(coordenadas, _t=t):
                # Escreve-se por cima de uma cópia em vez de montar um array
                # novo: poupa o `import numpy`, que só entrava aqui.
                x, y = _t.transform(coordenadas[:, 0], coordenadas[:, 1])
                saida = coordenadas.copy()
                saida[:, 0] = x
                saida[:, 1] = y
                return saida

            geometria = shapely.transform(geometria, para_graus)
        limites.append(Limite(codigo=str(codigo), nome=str(nome), geometria=geometria))

    return Territorio(sorted(limites, key=lambda x: x.codigo))
