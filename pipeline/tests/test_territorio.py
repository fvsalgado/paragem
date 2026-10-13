"""A atribuição a concelhos: pela geometria, e não pelo retângulo que a envolve.

O defeito que isto fecha tinha um sintoma mensurável — 19 praças de táxi onde
há 9, 43 estações de comboio onde há 28 — e uma causa só: a pergunta «isto é da
região?» estava a ser respondida por uma caixa. Estes testes são sobre a
pergunta, não sobre os números, que vivem no `numeros.yaml`.
"""

import struct

import pytest

from conftest import ids_das_regioes, regiao_ou_salta
from paragem.construcao import _simplificar
from paragem.territorio import (
    ErroDeTerritorio,
    Limite,
    Territorio,
    _gpkg_srs,
    _gpkg_wkb,
    ler_caop,
    ler_limites_geojson,
)

shapely = pytest.importorskip("shapely")


def _quadrado(x0, y0, x1, y1):
    from shapely.geometry import box

    return box(x0, y0, x1, y1)


def _territorio_de_brincar() -> Territorio:
    """Dois concelhos que se tocam numa fronteira, em (1.0, ·)."""
    return Territorio(
        [
            Limite("0001", "Poente", _quadrado(0.0, 0.0, 1.0, 1.0)),
            Limite("0002", "Nascente", _quadrado(1.0, 0.0, 2.0, 1.0)),
        ]
    )


# --- a pergunta ------------------------------------------------------------


def test_um_ponto_de_dentro_sabe_de_que_concelho_e():
    t = _territorio_de_brincar()
    assert t.concelho_de(lat=0.5, lon=0.5).nome == "Poente"
    assert t.concelho_de(lat=0.5, lon=1.5).nome == "Nascente"


def test_um_ponto_de_fora_nao_e_de_nenhum():
    t = _territorio_de_brincar()
    assert t.concelho_de(lat=0.5, lon=9.0) is None
    assert not t.contem(lat=0.5, lon=9.0)


def test_um_ponto_em_cima_da_fronteira_fica_em_algum_lado():
    """`covers` e não `contains`.

    Uma paragem no meio de uma ponte entre dois concelhos está exatamente na
    fronteira. Com `contains`, os dois concelhos respondem «não é minha» e a
    paragem desaparece da região — sem erro nenhum, que é a pior maneira de
    desaparecer.
    """
    t = _territorio_de_brincar()
    assert t.contem(lat=0.5, lon=1.0)
    assert t.concelho_de(lat=0.5, lon=1.0) is not None


def test_um_territorio_sem_limites_recusa_nascer():
    with pytest.raises(ErroDeTerritorio):
        Territorio([])


# --- o formato GeoPackage --------------------------------------------------


def _blob(envelope: int, corpo: bytes = b"WKB") -> bytes:
    tamanhos = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    bandeiras = 0b1 | (envelope << 1)  # little-endian + indicador de envelope
    return (
        b"GP"
        + bytes([0, bandeiras])
        + struct.pack("<i", 3763)
        + b"\x00" * tamanhos[envelope]
        + corpo
    )


def test_o_cabecalho_do_geopackage_tem_tamanho_variavel():
    """Os bits 1–3 das bandeiras dizem quanto envelope vem antes do WKB.

    Saltar um número fixo de bytes funciona com os ficheiros que calham não ter
    envelope e parte silenciosamente nos que têm — e o erro aparece como uma
    geometria mal formada, longe daqui.
    """
    for envelope in (0, 1, 2, 3, 4):
        assert _gpkg_wkb(_blob(envelope)) == b"WKB"


def test_o_srs_le_se_do_cabecalho():
    assert _gpkg_srs(_blob(0)) == 3763


def test_o_que_nao_e_geopackage_da_erro_e_nao_disparate():
    with pytest.raises(ErroDeTerritorio):
        _gpkg_wkb(b"isto nao e uma geometria")


# --- a região sem limites --------------------------------------------------


def test_a_prova_nao_declara_limites_e_isso_e_legitimo(raiz):
    """Não há carta administrativa de um sítio inventado.

    A região de prova tem de continuar a construir-se sem limites — e a pagar
    por isso com a lacuna `territorio.sem-caop` no relatório, que é o preço
    honesto.
    """
    assert not regiao_ou_salta("prova").limites


def _com_limites(id_regiao: str):
    r = regiao_ou_salta(id_regiao)
    if not r.limites:
        pytest.skip(f"{id_regiao} não declara limites — atribui pela caixa")
    return r


@pytest.mark.parametrize("id_regiao", ids_das_regioes())
def test_quem_declara_limites_diz_de_onde_e_por_que_codigo(raiz, id_regiao):
    """A CAOP pede-se pelo código DTMN; um GeoJSON, pelo campo que declarar."""
    r = _com_limites(id_regiao)
    assert r.limites.get("fonte"), "limites sem fonte"
    if r.limites["fonte"] == "caop":
        assert r.limites.get("campo_codigo", "dtmn") == "dtmn"


@pytest.mark.parametrize("id_regiao", ids_das_regioes())
def test_todos_os_concelhos_declaram_dico(raiz, id_regiao):
    """Sem `dico` não há como pedir o limite: pede-se por código, não por nome."""
    r = _com_limites(id_regiao)
    assert r.concelhos, "uma região com limites e sem concelhos"
    assert len(r.dicos) == len(r.concelhos)


# --- a carta a sério -------------------------------------------------------


def _territorio_declarado(raiz, r) -> Territorio:
    """Os limites da região, lidos como a construção os lê — sem ir à rede.

    Salta quando a carta não está em disco: a CAOP são 111 MB, e um teste que
    não pode verificar tem de o dizer em vez de fingir que verificou.
    """
    from paragem.fontes import ACESSO_AUTOMATICO, ErroDeFonte, Registo, _extensao

    decl = r.limites
    registo = Registo.carregar(raiz)
    fonte = registo.obter(decl["fonte"])
    if fonte.acesso == ACESSO_AUTOMATICO:
        caminho = raiz / ".cache" / f"{fonte.id}{_extensao(fonte)}"
        if not caminho.exists():
            pytest.skip(f"sem {caminho.name} em .cache (uv run pipeline fetch --regiao {r.id})")
    else:
        try:
            caminho = registo.caminho(fonte.id, descarregar=False)
        except ErroDeFonte as e:
            pytest.skip(str(e))

    if fonte.formato == "geojson":
        return ler_limites_geojson(
            caminho,
            r.dicos,
            camada=decl.get("camada", "concelho"),
            campo_codigo=decl.get("campo_codigo", "dico"),
            campo_nome=decl.get("campo_nome", "nome"),
        )
    return ler_caop(
        caminho,
        r.dicos,
        camada=decl.get("camada", "cont_municipios"),
        campo_codigo=decl.get("campo_codigo", "dtmn"),
        campo_nome=decl.get("campo_nome", "municipio"),
        cache=raiz / ".cache" / f"{fonte.id}.gpkg",
    )


@pytest.mark.parametrize("id_regiao", ids_das_regioes())
def test_os_limites_respondem_por_todos_os_concelhos_declarados(raiz, id_regiao):
    r = _com_limites(id_regiao)
    t = _territorio_declarado(raiz, r)
    assert len(t) == len(r.dicos)
    assert t.codigos == set(r.dicos)

    # Os nomes da carta são os nomes declarados. Um código trocado dá aqui um
    # concelho com o nome de outro — que é exatamente o erro que ninguém vê.
    for limite in t.limites:
        c = r.concelho_por_dico(limite.codigo)
        assert c is not None and _simplificar(c.nome) == _simplificar(limite.nome), (
            f"{limite.codigo}: declarado {c.nome if c else None!r}, carta {limite.nome!r}"
        )

    # Fora da caixa da região, não há concelho da região. (Os pontos de
    # controlo que a CAIXA apanhava e a geometria não são de cada território:
    # vivem nos testes da raiz que tem os dados dele.)
    cx = r.caixa
    assert t.concelho_de(cx.lat_max + 1.0, cx.lon_min - 1.0) is None
    assert t.concelho_de(cx.lat_min - 1.0, cx.lon_max + 1.0) is None


# --- os limites num GeoJSON ----------------------------------------------------


def test_os_limites_tambem_se_leem_de_um_geojson(tmp_path):
    """Uma região sem carta oficial declara os concelhos num GeoJSON em graus.

    O ficheiro pode trazer mais coisas — a geografia de um mapa traz a água e
    as estradas —, e só contam as feições da camada pedida, pelo código.
    """
    import json

    from paragem.territorio import ler_limites_geojson

    def concelho(dico, nome, x0, x1):
        return {
            "type": "Feature",
            "properties": {"camada": "concelho", "dico": dico, "nome": nome},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[x0, 0.0], [x1, 0.0], [x1, 1.0], [x0, 1.0], [x0, 0.0]]],
            },
        }

    estrada = {
        "type": "Feature",
        "properties": {"camada": "transportation", "dico": "0001"},
        "geometry": {"type": "LineString", "coordinates": [[0.0, 0.0], [2.0, 1.0]]},
    }
    caminho = tmp_path / "geografia.geojson"
    caminho.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    concelho("0001", "Poente", 0.0, 1.0),
                    concelho("0002", "Nascente", 1.0, 2.0),
                    concelho("0003", "De fora", 2.0, 3.0),
                    estrada,
                ],
            }
        ),
        encoding="utf-8",
    )
    t = ler_limites_geojson(caminho, ["0001", "0002"])
    assert t.codigos == {"0001", "0002"}
    assert t.concelho_de(lat=0.5, lon=1.5).nome == "Nascente"
    assert t.concelho_de(lat=0.5, lon=2.5) is None


def test_um_geojson_ilegivel_da_erro_de_territorio(tmp_path):
    from paragem.territorio import ler_limites_geojson

    caminho = tmp_path / "estragado.geojson"
    caminho.write_text("{ não é json", encoding="utf-8")
    with pytest.raises(ErroDeTerritorio):
        ler_limites_geojson(caminho, ["0001"])
