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
    # Os urbanos que a rede própria opera também são urbanos.
    if r.urbanos_da_rede:
        produzidos.add("urbano-municipal")
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
    """A mesma etiqueta `network=` foi medida em duas cidades a 130 km. O filtro é pelo OPERADOR.

    Em TODAS as regiões que declaram traçados de rotas — e não só numa, pelo
    nome: está declarado na receita como `nunca_filtrar_por: network`, e este
    teste existe para que apagar essa linha não passe despercebido.
    """
    vistas = 0
    for regiao in ids_das_regioes():
        r = regiao_ou_salta(regiao)
        for s in (s for s in _declaracoes_de_modo(r) if s.leitor == "osm-rotas"):
            vistas += 1
            assert s.params.get("nunca_filtrar_por") == "network", f"{regiao}: {s.saida}"
            assert "operator" in s.params["filtro"], f"{regiao}: {s.saida} não filtra pelo operador"
            assert "network" not in s.params["filtro"], f"{regiao}: {s.saida} filtra pela rede"
    assert vistas, "nenhuma região declara traçados de rotas — o teste deixou de afirmar"


# --- os urbanos que a rede própria opera ------------------------------------


def _feed_da_demonstracao(raiz: Path, destino: Path) -> None:
    """O feed da rede da demonstração, como a construção o escreve — sem construir nada."""
    import zipfile

    origem = raiz / "data" / "manual" / "demo" / "gtfs-rede"
    (destino / "gtfs").mkdir(parents=True)
    with zipfile.ZipFile(destino / "gtfs" / "rede-ameno.zip", "w") as z:
        for f in sorted(origem.glob("*.txt")):
            z.write(f, f.name)


def test_os_urbanos_da_rede_contam_como_urbanos_do_concelho(raiz, tmp_path):
    """A página de um concelho dizia «sem registo: urbano municipal» por cima das linhas do urbano.

    A demonstração declara a circular de Porto Ameno como o urbano da vila
    (`rede.urbanos`). Tem de chegar ao modo dos urbanos com o concelho, as
    linhas lidas do feed próprio — com o identificador com que a página da
    linha existe —, e a contar na contagem do modo.
    """
    from paragem.sitio import Sitio

    demo = regiao_ou_salta("demo")
    assert demo.urbanos_da_rede, "a demonstração declara o urbano da vila na rede"
    _feed_da_demonstracao(raiz, tmp_path)
    modos = Sitio(raiz, demo, tmp_path).modos(None)

    urbanos = modos["urbano-municipal"]["urbanos_da_rede"]
    assert [(u["nome"], u["concelho"]) for u in urbanos] == [
        ("Circular de Porto Ameno", "porto-ameno")
    ]
    assert [(x["id"], x["codigo"]) for x in urbanos[0]["linhas"]] == [("RA11", "11")]
    assert urbanos[0]["linhas"][0]["nome"] == "Circular de Porto Ameno"
    assert modos["urbano-municipal"]["quantos"] >= 1
    # E as linhas não se duplicam no modo: têm catálogo, e é lá que se vêem.
    assert not any(h.get("id") == "RA11" for h in modos["urbano-municipal"]["horarios"])


def test_uma_linha_urbana_que_o_feed_nao_tem_sai_como_lacuna(raiz, tmp_path):
    """Um caderno que renumera uma linha deixava o urbano com uma a menos, em silêncio."""
    import dataclasses

    from paragem.construcao import _urbanos_da_rede
    from paragem.fontes import Registo
    from paragem.leitores.base import Contexto
    from paragem.regiao import UrbanoDaRede
    from paragem.relatorio import Relatorio
    from paragem.sitio import Sitio

    demo = regiao_ou_salta("demo")
    com_uma_a_mais = dataclasses.replace(
        demo,
        urbanos_da_rede=[
            UrbanoDaRede("Circular de Porto Ameno", "porto-ameno", ("11", "99")),
            UrbanoDaRede("Urbano que não há", "almeao", ("98",)),
        ],
    )
    _feed_da_demonstracao(raiz, tmp_path)
    ctx = Contexto(
        regiao=com_uma_a_mais,
        registo=Registo.carregar(raiz),
        raiz=raiz,
        destino=tmp_path,
        relatorio=Relatorio(regiao="demo"),
    )
    _urbanos_da_rede(ctx, tmp_path)
    (lacuna,) = [x for x in ctx.relatorio.lacunas if x.id == "urbanos-da-rede.linha-em-falta"]
    assert lacuna.quais == ["Circular de Porto Ameno: linha 99", "Urbano que não há: linha 98"]

    # O sítio mostra só o que existe, e um urbano sem nenhuma linha não aparece.
    urbanos = Sitio(raiz, com_uma_a_mais, tmp_path)._urbanos_da_rede()
    assert [(u["nome"], [x["codigo"] for x in u["linhas"]]) for u in urbanos] == [
        ("Circular de Porto Ameno", ["11"])
    ]
