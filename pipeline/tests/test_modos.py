"""Os modos que o catálogo da rede não mostra.

A grelha «Por modo» era uma fila de sete rótulos e quatro deles não levavam a
lado nenhum. Quem toca em «Bicicleta partilhada» à procura da estação mais
perto não estava a pedir uma palavra.

O que estes testes guardam não é a contagem: é a REGRA de quem entra e de quem
não entra, e a promessa de que o que falta fica escrito.
"""

from pathlib import Path

import pytest

from conftest import ids_das_regioes, regiao_ou_salta
from paragem.regiao import carregar
from paragem.sitio import CATALOGO_PROPRIO


@pytest.fixture
def raiz() -> Path:
    return Path(__file__).resolve().parents[2]


def _declaracoes_de_modo(r):
    return [s for s in r.saidas if s.modo and s.saida]


@pytest.mark.parametrize("regiao", ids_das_regioes())
def test_um_modo_com_catalogo_nao_ganha_tambem_pagina_de_modo(raiz, regiao):
    """Duas páginas para a mesma pergunta divergem, e uma delas fica órfã.

    Foi a região de prova que apanhou isto: declara o autocarro duas vezes — o
    feed próprio e um traçado de OpenStreetMap — e a segunda declaração gerava
    `/modos/autocarro/`, que a grelha nunca liga porque o autocarro já tem para
    onde ir. Uma página que ninguém abre é uma página que ninguém corrige.
    """
    r = carregar(raiz, regiao)
    com_catalogo = {
        s.modo for s in r.saidas if s.modo and (s.papel in CATALOGO_PROPRIO or s.modo == "comboio")
    }
    de_modo = {s.modo for s in _declaracoes_de_modo(r)} - com_catalogo
    assert not (de_modo & com_catalogo)
    # E o feed próprio tem de ser de um modo só: dois feeds próprios de modos
    # diferentes seriam duas redes, e o catálogo mostra uma.
    proprios = {s.modo for s in r.saidas if s.papel in {"horarios", "feed-proprio"}}
    assert len(proprios) == 1, f"{regiao} declara {proprios} como rede própria"


@pytest.mark.parametrize("regiao", ids_das_regioes())
def test_todo_o_modo_declarado_tem_de_produzir_alguma_coisa(raiz, regiao):
    """Um modo na lista da região sem nenhuma saída que o produza é uma promessa vazia.

    A grelha mostra-o na mesma — a região declarou-o —, e quem lá chega não
    encontra nada nem uma explicação.
    """
    r = carregar(raiz, regiao)
    produzidos = {s.modo for s in _declaracoes_de_modo(r)}
    if getattr(r, "a_pedido", None) and r.a_pedido.get("zonas"):
        produzidos.add("a-pedido")
    em_falta = set(r.modos) - produzidos
    assert not em_falta, f"{regiao} promete {sorted(em_falta)} e não constrói nada para eles"


@pytest.mark.parametrize("regiao", ids_das_regioes())
def test_o_que_esta_incompleto_tem_de_dizer_o_que_falta(raiz, regiao):
    """`incompleto: true` sem nota é marcar a lacuna e não a explicar.

    A página escreve a nota antes da lista, e sem nota escreveria um aviso
    vazio — que é pior do que aviso nenhum: assusta sem informar.
    """
    r = carregar(raiz, regiao)
    for s in _declaracoes_de_modo(r):
        if s.params.get("incompleto"):
            nota = (s.params.get("incompleto_nota") or "").strip()
            assert nota, f"{regiao}: {s.saida} diz-se incompleto e não diz do quê"
            assert len(nota) > 40, f"{regiao}: {s.saida} explica a lacuna em meia dúzia de palavras"


def test_a_disponibilidade_de_bicicletas_nunca_se_promete(raiz):
    """O `station_status` não é público (§6.4), e prometê-lo manda alguém a uma estação vazia."""
    for regiao in ids_das_regioes():
        r = carregar(raiz, regiao)
        for s in _declaracoes_de_modo(r):
            if s.leitor == "osm-bicicletas":
                assert s.params.get("station_status") is False, (
                    f"{regiao}: {s.saida} promete disponibilidade de bicicletas"
                )


def test_o_filtro_dos_urbanos_nunca_e_pela_rede(raiz):
    """`network=TUT` também é usado a 130 km daqui (§6.4). O filtro é pelo OPERADOR.

    Está declarado na receita como `nunca_filtrar_por: network` — e este teste
    existe para que apagar essa linha não passe despercebido.
    """
    r = regiao_ou_salta("medio-tejo")
    rotas = [s for s in _declaracoes_de_modo(r) if s.leitor == "osm-rotas"]
    assert rotas, "a região deixou de declarar traçados de rotas"
    for s in rotas:
        assert s.params["nunca_filtrar_por"] == "network"
        assert "operator" in s.params["filtro"], f"{s.saida} não filtra pelo operador"
        assert "network" not in s.params["filtro"], f"{s.saida} filtra pela rede"
