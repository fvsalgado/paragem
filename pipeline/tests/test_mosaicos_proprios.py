"""O mapa de uma região que declara a sua geografia, escrito sem o Planetiler.

Os mosaicos (Mapbox Vector Tile) e o ficheiro (PMTiles v3) escrevem-se à mão,
em `mosaicos_proprios.py`. Um formato binário escrito à mão erra em silêncio:
o mapa fica cinzento e a consola do navegador não diz porquê. Por isso o que
se afirma aqui é o que o leitor do outro lado exige — a numeração dos
mosaicos, o cabeçalho, o diretório e o sentido dos polígonos —, e não que o
ficheiro «existe».
"""

from __future__ import annotations

import gzip
import json
import struct

import pytest

from paragem.mosaicos_proprios import (
    _diretorio,
    _escrever_pmtiles,
    _feicoes,
    _geometria,
    _mosaicos,
    id_do_mosaico,
)

shapely = pytest.importorskip("shapely")


# --- um leitor mínimo de protobuf, para ler o que se escreveu ----------------


def _varint(b: bytes, i: int) -> tuple[int, int]:
    n = s = 0
    while True:
        c = b[i]
        i += 1
        n |= (c & 0x7F) << s
        s += 7
        if not c & 0x80:
            return n, i


def _campos(b: bytes):
    i = 0
    while i < len(b):
        chave, i = _varint(b, i)
        numero, tipo = chave >> 3, chave & 7
        if tipo == 0:
            v, i = _varint(b, i)
        elif tipo == 2:
            n, i = _varint(b, i)
            v, i = b[i : i + n], i + n
        elif tipo == 1:
            v, i = b[i : i + 8], i + 8
        else:
            raise AssertionError(f"tipo de campo inesperado {tipo}")
        yield numero, v


def _camadas(mosaico: bytes) -> dict[str, int]:
    """Nome de cada camada → quantas feições tem."""
    saida = {}
    for numero, camada in _campos(mosaico):
        assert numero == 3
        nome, feicoes = "", 0
        for n, v in _campos(camada):
            if n == 1:
                nome = v.decode("utf-8")
            elif n == 2:
                feicoes += 1
        saida[nome] = feicoes
    return saida


# --- a numeração dos mosaicos ------------------------------------------------


def test_cada_mosaico_tem_o_numero_que_o_pmtiles_lhe_da():
    """Os valores da especificação e da implementação de referência.

    Um número errado não dá erro: dá o mosaico de outro sítio, e o mapa
    desenha a vila no meio do campo.
    """
    assert [id_do_mosaico(0, 0, 0), id_do_mosaico(1, 0, 0), id_do_mosaico(1, 0, 1)] == [0, 1, 2]
    assert [id_do_mosaico(1, 1, 1), id_do_mosaico(1, 1, 0), id_do_mosaico(2, 0, 0)] == [3, 4, 5]
    assert id_do_mosaico(12, 3423, 1763) == 19078479


def test_o_diretorio_encadeia_os_desvios_seguidos():
    """Um desvio igual ao fim do anterior escreve-se 0; os outros, desvio + 1."""
    d = _diretorio([[5, 1, 0, 10], [6, 2, 10, 4], [9, 1, 0, 10]])
    numeros = []
    i = 0
    while i < len(d):
        n, i = _varint(d, i)
        numeros.append(n)
    assert numeros == [3, 5, 1, 3, 1, 2, 1, 10, 4, 10, 1, 0, 1]


# --- a geometria -------------------------------------------------------------


def _area_dos_comandos(cmds: list[int]) -> int:
    """Refaz o anel a partir dos comandos e devolve a área (y para baixo)."""

    def zz(n):
        return (n >> 1) ^ -(n & 1)

    pontos, x, y, i = [], 0, 0, 0
    while i < len(cmds):
        ident, quantos = cmds[i] & 7, cmds[i] >> 3
        i += 1
        if ident == 7:
            break
        for _ in range(quantos):
            x, y = x + zz(cmds[i]), y + zz(cmds[i + 1])
            pontos.append((x, y))
            i += 2
    return sum(
        pontos[k][0] * pontos[(k + 1) % len(pontos)][1]
        - pontos[(k + 1) % len(pontos)][0] * pontos[k][1]
        for k in range(len(pontos))
    )


@pytest.mark.parametrize("sentido", [1, -1])
def test_o_exterior_de_um_poligono_vai_no_sentido_que_a_norma_pede(sentido):
    """Exterior com área positiva (y para baixo), seja qual for o sentido de entrada.

    Ao contrário, o MapLibre lê o polígono como um buraco e não o pinta.
    """
    from shapely.geometry import Polygon

    anel = [(0, 0), (100, 0), (100, 100), (0, 100)][::sentido]
    tipo, cmds = _geometria(Polygon(anel))
    assert tipo == 3
    assert _area_dos_comandos(cmds) > 0


# --- de ponta a ponta --------------------------------------------------------


def _geografia() -> dict:
    def f(camada, geom, **props):
        return {"type": "Feature", "properties": {"camada": camada, **props}, "geometry": geom}

    quadrado = [[[-10.6, 39.4], [-10.5, 39.4], [-10.5, 39.5], [-10.6, 39.5], [-10.6, 39.4]]]
    ao_lado = [[[-10.5, 39.4], [-10.4, 39.4], [-10.4, 39.5], [-10.5, 39.5], [-10.5, 39.4]]]
    return {
        "type": "FeatureCollection",
        "features": [
            f("concelho", {"type": "Polygon", "coordinates": quadrado}, dico="1", nome="Poente"),
            f("concelho", {"type": "Polygon", "coordinates": ao_lado}, dico="2", nome="Nascente"),
            f(
                "transportation",
                {"type": "LineString", "coordinates": [[-10.58, 39.45], [-10.42, 39.46]]},
                **{"class": "primary", "name": "Estrada Velha"},
            ),
            f("place", {"type": "Point", "coordinates": [-10.55, 39.45]}, **{"class": "town", "name": "Vila"}),
        ],
    }  # fmt: skip


def test_uma_geografia_declarada_da_um_pmtiles_que_se_le(tmp_path):
    feicoes = _feicoes(_geografia())
    camadas = {c for c, *_ in feicoes}
    # As duas camadas que não se declaram: derivam-se, como o Planetiler faz.
    assert {"boundary", "transportation_name"} <= camadas
    # E o concelho não vai para o mapa como polígono: vai como fronteira.
    assert "concelho" not in camadas

    mosaicos = _mosaicos(feicoes)
    caminho = tmp_path / "regiao.pmtiles"
    _escrever_pmtiles(
        caminho, mosaicos, limites=(-10.6, 39.4, -10.4, 39.5), metadados={"attribution": "nossa"}
    )
    b = caminho.read_bytes()

    cab = struct.unpack("<7sBQQQQQQQQQQQBBBBBBiiiiBii", b[:127])
    assert cab[0] == b"PMTiles" and cab[1] == 3
    raiz_desvio, raiz_tamanho, meta_desvio, meta_tamanho = cab[2:6]
    assert raiz_desvio == 127 and 127 + raiz_tamanho <= 16384
    assert cab[13:17] == (1, 2, 2, 1)  # agrupado, gzip, gzip, MVT
    assert cab[17] <= 7 and cab[18] == 14

    meta = json.loads(gzip.decompress(b[meta_desvio : meta_desvio + meta_tamanho]))
    assert meta["attribution"] == "nossa"

    diretorio = gzip.decompress(b[raiz_desvio : raiz_desvio + raiz_tamanho])
    quantos, _ = _varint(diretorio, 0)
    assert quantos == cab[11]  # uma entrada por grupo de mosaicos

    # O mosaico de zoom 14 em cima da vila tem a vila, a estrada e o nome dela.
    import math

    z, lon, lat = 14, -10.55, 39.45
    x = int((lon + 180) / 360 * 2**z)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2**z)
    dados_desvio = cab[8]
    do_mosaico = mosaicos[(z, x, y)]
    assert do_mosaico in b[dados_desvio:]
    nomes = _camadas(gzip.decompress(do_mosaico))
    assert nomes["place"] == 1
    assert nomes["transportation"] >= 1 and nomes["transportation_name"] >= 1


def test_os_nomes_das_terras_nao_se_repetem_em_mosaicos_vizinhos():
    """Um ponto vai para o mosaico onde está e só para esse.

    Com a margem dos outros traços, a mesma vila saía escrita duas vezes, lado
    a lado, na aresta entre dois mosaicos.
    """
    mosaicos = _mosaicos(_feicoes(_geografia()))
    com_a_vila = [
        k for k, v in mosaicos.items() if k[0] == 14 and _camadas(gzip.decompress(v)).get("place")
    ]
    assert len(com_a_vila) == 1
