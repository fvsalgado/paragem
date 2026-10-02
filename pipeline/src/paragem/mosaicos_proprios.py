"""Os mosaicos de um mapa que a região DECLARA, e não recorta do OpenStreetMap.

O mapa de uma região sai, por omissão, do recorte do OpenStreetMap que ela já
usa para o motor de viagens (`mosaicos.py`, com o Planetiler). Uma região
INVENTADA não tem recorte que sirva: o OpenStreetMap de onde as coordenadas
dela caem — mar alto, no caso da demonstração — mostrava ou nada ou terras
reais por baixo de uma rede que não existe. Declara a sua geografia num
GeoJSON (`mapa.fonte` na receita), e é daqui que o mapa sai.

**O ESQUEMA DAS CAMADAS É O DO OPENMAPTILES**, o mesmo que o Planetiler
escreve: `water`, `landcover`, `transportation`, `place`… É isso que deixa o
estilo do sítio desenhar os dois mapas sem saber qual é qual. Cada feição do
GeoJSON diz em que camada vai (`camada`), com as propriedades que o estilo lê
(`class`, `name`). Duas camadas não se declaram — derivam-se, como o
Planetiler as deriva:

- `boundary`, das fronteiras dos polígonos `concelho` — que são também a carta
  administrativa da região (`limites` na receita): o mapa e a atribuição a
  concelhos saem do mesmo desenho, e não podem discordar;
- `transportation_name`, das estradas com nome.

**SEM DEPENDÊNCIAS NOVAS.** O formato dos mosaicos (Mapbox Vector Tile, um
protobuf) e o do ficheiro (PMTiles v3) escrevem-se em duzentas linhas, e uma
geografia inventada tem umas milhares de feições: corre em segundos, sem Java,
sem rede e sem o Planetiler — que é o que deixa o CI construir o mapa da
demonstração em todas as corridas.

A ATRIBUIÇÃO É A QUE A RECEITA DECLARA (`mapa.atribuicao`), e vai nos
metadados do ficheiro e no `regiao.json` — que é onde o MapLibre a lê. Um mapa
desenhado por nós não é do OpenStreetMap, e escrevê-lo no canto era
atribuir-lhe o que não fez.
"""

from __future__ import annotations

import gzip
import json
import math
import struct
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from .regiao import Regiao

ZOOM_MAXIMO = 14
EXTENSAO = 4096
#: A margem à volta de cada mosaico, em unidades do mosaico: sem ela, uma
#: estrada que passa rente à aresta desenha-se cortada.
MARGEM = 64

#: A partir de que zoom entra cada coisa — o que não se vê não vai.
_ZOOM_DA_CLASSE = {
    "transportation": {
        "motorway": 5, "trunk": 5, "primary": 7, "secondary": 8, "tertiary": 9, "rail": 8,
    },
    "place": {"city": 4, "town": 7, "village": 10, "suburb": 12},
    "waterway": {"river": 7},
}  # fmt: skip
_ZOOM_DA_CAMADA = {
    "transportation": 12,
    "transportation_name": 13,
    "place": 12,
    "waterway": 10,
    "water": 4,
    "water_name": 9,
    "landcover": 6,
    "landuse": 8,
    "park": 10,
    "building": 13,
    "boundary": 4,
}


class ErroDosMosaicosProprios(Exception):
    pass


def construir(raiz: Path, regiao: Regiao):
    """Gera `build/<regiao>/mosaicos/regiao.pmtiles` a partir da geografia declarada."""
    from .fontes import Registo
    from .mosaicos import Mosaicos

    raiz = Path(raiz)
    id_fonte = str(regiao.mapa.get("fonte") or "")
    caminho = Registo.carregar(raiz).caminho(id_fonte, descarregar=False)
    comeco = time.monotonic()

    feicoes = _feicoes(json.loads(caminho.read_text(encoding="utf-8")))
    if not feicoes:
        raise ErroDosMosaicosProprios(f"{caminho.name} não tem feição nenhuma para o mapa")
    mosaicos = _mosaicos(feicoes)

    lon0, lat0, lon1, lat1 = _limites(feicoes)
    camadas = sorted({c for c, *_ in feicoes})
    metadados = {
        "name": f"Mapa {regiao.com('de')}",
        "format": "pbf",
        "attribution": str(regiao.mapa.get("atribuicao") or ""),
        "description": "Geografia declarada pela região, desenhada pelo Paragem.pt.",
        "vector_layers": [
            {"id": c, "fields": {}, "minzoom": 0, "maxzoom": ZOOM_MAXIMO} for c in camadas
        ],
    }
    saida = raiz / "build" / regiao.id / "mosaicos" / "regiao.pmtiles"
    saida.parent.mkdir(parents=True, exist_ok=True)
    _escrever_pmtiles(
        saida,
        mosaicos,
        limites=(lon0, lat0, lon1, lat1),
        metadados=metadados,
    )
    return Mosaicos(
        ficheiro=saida,
        segundos=time.monotonic() - comeco,
        megabytes=saida.stat().st_size / 1_048_576,
    )


# ---------------------------------------------------------------------------
# as feições, em camadas do OpenMapTiles
# ---------------------------------------------------------------------------


def _feicoes(geo: dict[str, Any]) -> list[tuple[str, Any, dict[str, Any], int]]:
    """(camada, geometria em graus, propriedades, zoom mínimo) de cada feição."""
    from shapely.geometry import shape
    from shapely.ops import linemerge, unary_union

    saida: list[tuple[str, Any, dict[str, Any], int]] = []
    concelhos = []
    for f in geo.get("features") or []:
        props = dict(f.get("properties") or {})
        camada = str(props.pop("camada", ""))
        geom = shape(f["geometry"])
        if camada == "concelho":
            concelhos.append(geom)
            continue
        if not camada or geom.is_empty:
            continue
        props = {k: v for k, v in props.items() if isinstance(v, str | int | float | bool)}
        saida.append((camada, geom, props, _zoom_minimo(camada, props)))
        if camada == "transportation" and props.get("name") and props.get("class") != "rail":
            nome = {"name": props["name"], "class": props.get("class", "")}
            saida.append(
                ("transportation_name", geom, nome, _zoom_minimo("transportation_name", nome))
            )

    if concelhos:
        fronteiras: Any = linemerge(unary_union([g.boundary for g in concelhos]))  # type: ignore[arg-type]
        partes = getattr(fronteiras, "geoms", [fronteiras])
        for linha in partes:
            props = {"admin_level": 8}
            saida.append(("boundary", linha, props, _zoom_minimo("boundary", props)))
    return saida


def _zoom_minimo(camada: str, props: dict[str, Any]) -> int:
    por_classe = _ZOOM_DA_CLASSE.get(camada, {})
    classe = str(props.get("class", ""))
    if classe in por_classe:
        return por_classe[classe]
    return _ZOOM_DA_CAMADA.get(camada, 12)


def _limites(feicoes) -> tuple[float, float, float, float]:
    xs0, ys0, xs1, ys1 = zip(*(g.bounds for _, g, _, _ in feicoes), strict=True)
    return min(xs0), min(ys0), max(xs1), max(ys1)


# ---------------------------------------------------------------------------
# o corte em mosaicos
# ---------------------------------------------------------------------------


def _mercator(geom):
    """Graus → coordenadas de Mercator normalizadas (0–1, com o y para baixo)."""
    import numpy as np
    from shapely import transform

    def f(c):
        lon, lat = c[:, 0], np.clip(c[:, 1], -85.05, 85.05)
        x = (lon + 180.0) / 360.0
        y = (1.0 - np.arcsinh(np.tan(np.radians(lat))) / math.pi) / 2.0
        return np.column_stack([x, y])

    return transform(geom, f)


def _mosaicos(feicoes) -> dict[tuple[int, int, int], bytes]:
    from shapely import affinity, clip_by_rect

    normalizadas = [(c, _mercator(g), p, z) for c, g, p, z in feicoes]
    mosaicos: dict[tuple[int, int, int], bytes] = {}
    for z in range(0, ZOOM_MAXIMO + 1):
        escala = (1 << z) * EXTENSAO
        # O que cada mosaico leva, por camada: [(geometria local, propriedades)].
        por_mosaico: dict[tuple[int, int], dict[str, list]] = defaultdict(lambda: defaultdict(list))
        for camada, geom, props, zmin in normalizadas:
            if z < zmin:
                continue
            g = affinity.scale(geom, escala, escala, origin=(0, 0))
            if g.geom_type in ("Polygon", "MultiPolygon", "LineString", "MultiLineString"):
                g = g.simplify(1.0 if z == ZOOM_MAXIMO else 2.0, preserve_topology=True)
                if g.is_empty:
                    continue
                if g.geom_type in ("Polygon", "MultiPolygon") and g.area < 4:
                    continue
            x0, y0, x1, y1 = g.bounds
            margem = 0 if g.geom_type in ("Point", "MultiPoint") else MARGEM
            limite = (1 << z) - 1
            tx0 = max(0, int((x0 - margem) // EXTENSAO))
            tx1 = min(limite, int((x1 + margem) // EXTENSAO))
            ty0 = max(0, int((y0 - margem) // EXTENSAO))
            ty1 = min(limite, int((y1 + margem) // EXTENSAO))
            for tx in range(tx0, tx1 + 1):
                for ty in range(ty0, ty1 + 1):
                    bx, by = tx * EXTENSAO, ty * EXTENSAO
                    if g.geom_type in ("Point", "MultiPoint"):
                        # Um nome num mosaico só: repetido nas margens, a mesma
                        # vila aparecia escrita duas vezes lado a lado.
                        c = g.centroid
                        if not (bx <= c.x < bx + EXTENSAO and by <= c.y < by + EXTENSAO):
                            continue
                        local = affinity.translate(g, -bx, -by)
                    else:
                        cortada = clip_by_rect(
                            g,
                            bx - margem,
                            by - margem,
                            bx + EXTENSAO + margem,
                            by + EXTENSAO + margem,
                        )
                        if cortada.is_empty:
                            continue
                        local = affinity.translate(cortada, -bx, -by)
                    por_mosaico[(tx, ty)][camada].append((local, props))
        for (tx, ty), camadas in por_mosaico.items():
            dados = _mosaico(camadas)
            if dados:
                mosaicos[(z, tx, ty)] = gzip.compress(dados, mtime=0)
    return mosaicos


# ---------------------------------------------------------------------------
# Mapbox Vector Tile 2.1, à mão
# ---------------------------------------------------------------------------


def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _zigzag(n: int) -> int:
    return (n << 1) ^ (n >> 63)


def _chave(numero: int, tipo: int) -> bytes:
    return _varint((numero << 3) | tipo)


def _bloco(numero: int, dados: bytes) -> bytes:
    return _chave(numero, 2) + _varint(len(dados)) + dados


def _valor(v: Any) -> bytes:
    if isinstance(v, bool):
        return _chave(7, 0) + _varint(int(v))
    if isinstance(v, int):
        return _chave(5, 0) + _varint(v) if v >= 0 else _chave(6, 0) + _varint(_zigzag(v))
    if isinstance(v, float):
        return _chave(3, 1) + struct.pack("<d", v)
    return _bloco(1, str(v).encode("utf-8"))


def _comando(ident: int, quantos: int) -> int:
    return (ident & 0x7) | (quantos << 3)


def _pontos_inteiros(coords) -> list[tuple[int, int]]:
    saida: list[tuple[int, int]] = []
    for x, y in coords:
        p = (round(x), round(y))
        if not saida or saida[-1] != p:
            saida.append(p)
    return saida


def _area_assinada(anel: list[tuple[int, int]]) -> int:
    return sum(
        anel[i][0] * anel[(i + 1) % len(anel)][1] - anel[(i + 1) % len(anel)][0] * anel[i][1]
        for i in range(len(anel))
    )


def _geometria(geom) -> tuple[int, list[int]] | None:
    """(tipo, comandos) de uma geometria já em unidades do mosaico."""
    cursor = [0, 0]
    cmds: list[int] = []

    def mover(p: tuple[int, int]) -> None:
        cmds.extend((_zigzag(p[0] - cursor[0]), _zigzag(p[1] - cursor[1])))
        cursor[0], cursor[1] = p

    tipo = geom.geom_type
    if tipo in ("Point", "MultiPoint"):
        pontos = [(round(p.x), round(p.y)) for p in getattr(geom, "geoms", [geom])]
        cmds.append(_comando(1, len(pontos)))
        for p in pontos:
            mover(p)
        return 1, cmds

    if tipo in ("LineString", "MultiLineString", "GeometryCollection"):
        partes = [g for g in getattr(geom, "geoms", [geom]) if g.geom_type == "LineString"]
        for linha in partes:
            pts = _pontos_inteiros(linha.coords)
            if len(pts) < 2:
                continue
            cmds.append(_comando(1, 1))
            mover(pts[0])
            cmds.append(_comando(2, len(pts) - 1))
            for p in pts[1:]:
                mover(p)
        return (2, cmds) if cmds else None

    if tipo in ("Polygon", "MultiPolygon"):
        for poligono in getattr(geom, "geoms", [geom]):
            aneis = [poligono.exterior, *poligono.interiors]
            for k, anel in enumerate(aneis):
                pts = _pontos_inteiros(anel.coords)
                if len(pts) > 1 and pts[0] == pts[-1]:
                    pts = pts[:-1]
                if len(pts) < 3:
                    if k == 0:
                        break
                    continue
                area = _area_assinada(pts)
                if area == 0:
                    if k == 0:
                        break
                    continue
                # Exterior no sentido dos ponteiros (área positiva com o y
                # para baixo), interiores ao contrário — é o que a norma pede.
                if (k == 0) != (area > 0):
                    pts.reverse()
                cmds.append(_comando(1, 1))
                mover(pts[0])
                cmds.append(_comando(2, len(pts) - 1))
                for p in pts[1:]:
                    mover(p)
                cmds.append(_comando(7, 1))
        return (3, cmds) if cmds else None
    return None


def _mosaico(camadas: dict[str, list]) -> bytes:
    from shapely.geometry import GeometryCollection

    saida = bytearray()
    for nome in sorted(camadas):
        chaves: dict[str, int] = {}
        valores: dict[tuple[str, Any], int] = {}
        feicoes = bytearray()
        for geom, props in camadas[nome]:
            if isinstance(geom, GeometryCollection) and not len(geom.geoms):
                continue
            if geom.geom_type == "GeometryCollection":
                # O corte de um polígono pode dar polígonos e linhas soltas; o
                # que interessa é a parte com a forma da feição original.
                poligonos = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
                linhas = [g for g in geom.geoms if g.geom_type in ("LineString", "MultiLineString")]
                from shapely.ops import unary_union

                geom = unary_union(poligonos) if poligonos else unary_union(linhas)
                if geom.is_empty:
                    continue
            r = _geometria(geom)
            if r is None:
                continue
            tipo, cmds = r
            etiquetas: list[int] = []
            for k, v in props.items():
                if k not in chaves:
                    chaves[k] = len(chaves)
                chave_v = (type(v).__name__, v)
                if chave_v not in valores:
                    valores[chave_v] = len(valores)
                etiquetas += [chaves[k], valores[chave_v]]
            f = bytearray()
            if etiquetas:
                f += _bloco(2, b"".join(_varint(e) for e in etiquetas))
            f += _chave(3, 0) + _varint(tipo)
            f += _bloco(4, b"".join(_varint(c) for c in cmds))
            feicoes += _bloco(2, bytes(f))
        if not feicoes:
            continue
        camada = bytearray()
        camada += _chave(15, 0) + _varint(2)
        camada += _bloco(1, nome.encode("utf-8"))
        camada += feicoes
        for k in chaves:
            camada += _bloco(3, k.encode("utf-8"))
        for _tipo, v in valores:
            camada += _bloco(4, _valor(v))
        camada += _chave(5, 0) + _varint(EXTENSAO)
        saida += _bloco(3, bytes(camada))
    return bytes(saida)


# ---------------------------------------------------------------------------
# PMTiles v3
# ---------------------------------------------------------------------------


def id_do_mosaico(z: int, x: int, y: int) -> int:
    """O número de um mosaico na curva de Hilbert, como o PMTiles o conta."""
    acumulado = ((1 << (2 * z)) - 1) // 3
    n = 1 << z
    d = 0
    s = n >> 1
    while s > 0:
        rx = 1 if x & s else 0
        ry = 1 if y & s else 0
        d += s * s * ((3 * rx) ^ ry)
        if ry == 0:
            if rx == 1:
                x = n - 1 - x
                y = n - 1 - y
            x, y = y, x
        s >>= 1
    return acumulado + d


def _diretorio(entradas: list[list[int]]) -> bytes:
    out = bytearray(_varint(len(entradas)))
    anterior = 0
    for e in entradas:
        out += _varint(e[0] - anterior)
        anterior = e[0]
    for e in entradas:
        out += _varint(e[1])
    for e in entradas:
        out += _varint(e[3])
    for i, e in enumerate(entradas):
        seguido = i > 0 and e[2] == entradas[i - 1][2] + entradas[i - 1][3]
        out += _varint(0 if seguido else e[2] + 1)
    return bytes(out)


def _escrever_pmtiles(
    caminho: Path,
    mosaicos: dict[tuple[int, int, int], bytes],
    *,
    limites: tuple[float, float, float, float],
    metadados: dict[str, Any],
) -> None:
    por_id = sorted((id_do_mosaico(z, x, y), dados) for (z, x, y), dados in mosaicos.items())
    dados = bytearray()
    vistos: dict[bytes, tuple[int, int]] = {}
    entradas: list[list[int]] = []
    for tid, conteudo in por_id:
        if conteudo in vistos:
            desvio, comprimento = vistos[conteudo]
        else:
            desvio, comprimento = len(dados), len(conteudo)
            dados += conteudo
            vistos[conteudo] = (desvio, comprimento)
        ultima = entradas[-1] if entradas else None
        if ultima and ultima[2] == desvio and ultima[0] + ultima[1] == tid:
            ultima[1] += 1
        else:
            entradas.append([tid, 1, desvio, comprimento])

    raiz = gzip.compress(_diretorio(entradas), mtime=0)
    if 127 + len(raiz) > 16384:
        # O cabeçalho e a raiz têm de caber nos primeiros 16 kB, que é o que
        # o leitor pede de uma vez. Uma região inventada nem perto lá chega;
        # se chegar, é altura de escrever os diretórios-folha.
        raise ErroDosMosaicosProprios(f"o diretório tem {len(raiz)} bytes e não cabe na raiz")
    meta = gzip.compress(json.dumps(metadados, ensure_ascii=False).encode("utf-8"), mtime=0)

    zooms = [z for z, _, _ in mosaicos]
    lon0, lat0, lon1, lat1 = limites

    def e7(v: float) -> int:
        return round(v * 10_000_000)

    desvio_raiz = 127
    desvio_meta = desvio_raiz + len(raiz)
    desvio_folhas = desvio_meta + len(meta)
    desvio_dados = desvio_folhas
    cabecalho = struct.pack(
        "<7sBQQQQQQQQQQQBBBBBBiiiiBii",
        b"PMTiles",
        3,
        desvio_raiz,
        len(raiz),
        desvio_meta,
        len(meta),
        desvio_folhas,
        0,
        desvio_dados,
        len(dados),
        len(por_id),
        len(entradas),
        len(vistos),
        1,  # agrupado pela ordem dos mosaicos
        2,  # diretórios em gzip
        2,  # mosaicos em gzip
        1,  # vetoriais (MVT)
        min(zooms),
        max(zooms),
        e7(lon0),
        e7(lat0),
        e7(lon1),
        e7(lat1),
        10,
        e7((lon0 + lon1) / 2),
        e7((lat0 + lat1) / 2),
    )
    assert len(cabecalho) == 127
    caminho.write_bytes(cabecalho + raiz + meta + bytes(dados))
