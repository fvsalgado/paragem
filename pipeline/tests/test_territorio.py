"""A atribuição a concelhos: pela geometria, e não pelo retângulo que a envolve.

O defeito que isto fecha tinha um sintoma mensurável — 19 praças de táxi onde
há 9, 43 estações de comboio onde há 28 — e uma causa só: a pergunta «isto é da
região?» estava a ser respondida por uma caixa. Estes testes são sobre a
pergunta, não sobre os números, que vivem no `numeros.yaml`.
"""

import struct

import pytest

from conftest import regiao_ou_salta
from paragem.territorio import (
    ErroDeTerritorio,
    Limite,
    Territorio,
    _gpkg_srs,
    _gpkg_wkb,
    ler_caop,
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


def test_o_medio_tejo_declara_limites(raiz):
    limites = regiao_ou_salta("medio-tejo").limites
    assert limites.get("fonte") == "caop"
    assert limites.get("campo_codigo") == "dtmn"


def test_todos_os_concelhos_declaram_dico(raiz):
    """Sem `dico` não há como pedir o limite: pede-se por código, não por nome."""
    r = regiao_ou_salta("medio-tejo")
    assert len(r.dicos) == len(r.concelhos) == 13


# --- a carta a sério -------------------------------------------------------


def test_a_caop_responde_pelos_treze_concelhos(raiz):
    """Salta-se quando a carta não está descarregada: são 111 MB, e um teste
    que não pode verificar tem de o dizer em vez de fingir que verificou.
    """
    caop = raiz / ".cache" / "caop.zip"
    if not caop.exists():
        pytest.skip("sem a CAOP em .cache/caop.zip (uv run pipeline fetch --regiao medio-tejo)")

    r = regiao_ou_salta("medio-tejo")
    t = ler_caop(caop, r.dicos, cache=raiz / ".cache" / "caop.gpkg")
    assert len(t) == 13
    assert t.codigos == set(r.dicos)

    # Os nomes da carta são os nomes declarados. Um código trocado dá aqui um
    # concelho com o nome de outro — que é exatamente o erro que ninguém vê.
    for limite in t.limites:
        assert r.concelho_por_dico(limite.codigo).nome == limite.nome

    # Pontos de controlo: dois dentro, um em cada lado da fronteira da região,
    # e dois de fora que a CAIXA apanhava e a geometria não.
    assert t.concelho_de(39.6039, -8.4126).nome == "Tomar"
    assert t.concelho_de(39.6317, -8.6725).nome == "Ourém"  # Fátima
    assert t.concelho_de(39.8064, -8.0972).nome == "Sertã"
    assert t.concelho_de(39.7436, -8.8070) is None, "Leiria não é da região"
    assert t.concelho_de(39.2362, -8.6860) is None, "Santarém não é da região"
