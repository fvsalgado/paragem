"""A declaração de uma região, e o que ela recusa."""

import pytest
import yaml

from conftest import regiao_ou_salta
from paragem.regiao import Caixa, ErroDeRegiao, Regiao, carregar_todas


def test_carrega_pelo_menos_a_prova_e_mais_uma(raiz):
    """Duas regiões, e uma delas é a de prova.

    QUAIS são não se crava. A prova está sempre cá — é o que garante que o
    multi-região se verifica em todas as corridas, sem pedir dados a ninguém.
    As outras vivem em raízes suas e entram por `PARAGEM_RAIZES`, e uma região
    nova é para entrar sem tocar num teste (docs/RAIZES.md).
    """
    ids = {r.id for r in carregar_todas(raiz)}
    assert "prova" in ids, "a região de prova tem de estar sempre presente"
    assert len(ids) >= 2, f"são precisas duas regiões para o multi-região se provar: {ids}"


def test_medio_tejo_tem_11_membros_e_13_servidos(raiz):
    """Os dois números são diferentes, e é preciso que sejam.

    A CIMT tem 11 municípios; a rede serve 13, porque a Sertã e Vila de Rei
    saíram para a CIM da Beira Baixa e continuam servidas pela concessão.
    """
    r = regiao_ou_salta("medio-tejo")
    assert r.municipios_membros == 11
    assert r.concelhos_servidos == 13
    assert len(r.concelhos) == 13
    assert {c.id for c in r.concelhos_servidos_nao_membros} == {"serta", "vila-de-rei"}


def test_contracoes(raiz):
    mt = regiao_ou_salta("medio-tejo")
    prova = regiao_ou_salta("prova")
    assert mt.com("de") == "do Médio Tejo"
    assert mt.com("em") == "no Médio Tejo"
    assert prova.com("de") == "da Serra da Pedra Alta"
    assert prova.com("em") == "na Serra da Pedra Alta"
    assert prova.com("a") == "à Serra da Pedra Alta"


def test_as_regioes_nao_usam_todas_o_mesmo_artigo(raiz):
    """Com dois artigos no CI, nenhuma contração fica cravada no código.

    Dois artigos DIFERENTES é o que interessa, e não quais: a prova é «a» de
    propósito para que uma contração colada ao código falhe em vez de passar.
    """
    artigos = {r.artigo for r in carregar_todas(raiz)}
    assert len(artigos) >= 2, f"todas as regiões usam o artigo {artigos}"


def test_recusa_contagem_que_nao_bate(raiz, tmp_path):
    """«Onze municípios» impresso ao lado de dez linhas é uma mentira por omissão."""
    pasta = tmp_path / "inventada"
    pasta.mkdir()
    (pasta / "regiao.yaml").write_text(
        yaml.safe_dump(
            {
                "id": "inventada",
                "nome": "Inventada",
                "artigo": "a",
                "territorio": {
                    "municipios_membros": 3,
                    "concelhos_servidos": 3,
                    "caixa": {"lat_min": 1, "lat_max": 2, "lon_min": 1, "lon_max": 2},
                },
                "modos": ["autocarro"],
            }
        ),
        encoding="utf-8",
    )
    (pasta / "concelhos.yaml").write_text(
        yaml.safe_dump({"concelhos": [{"id": "a", "nome": "A", "membro": True}]}),
        encoding="utf-8",
    )
    with pytest.raises(ErroDeRegiao, match="3 concelhos e a lista tem 1"):
        Regiao.carregar(pasta)


def test_recusa_artigo_adivinhado(raiz, tmp_path):
    pasta = tmp_path / "sem-artigo"
    pasta.mkdir()
    (pasta / "regiao.yaml").write_text(
        yaml.safe_dump({"id": "x", "nome": "X", "territorio": {}, "modos": []}), encoding="utf-8"
    )
    with pytest.raises(ErroDeRegiao, match="artigo"):
        Regiao.carregar(pasta)


def test_caixas_nao_se_sobrepoem(raiz):
    """Uma coordenada trocada entre regiões tem de falhar, não cair nas duas."""
    mt, prova = regiao_ou_salta("medio-tejo"), regiao_ou_salta("prova")
    assert not mt.caixa.sobrepoe(prova.caixa)


def test_margem_de_recorte_alarga_a_caixa(raiz):
    """Há linhas que atravessam a fronteira. Cortá-las era servir meia viagem."""
    mt = regiao_ou_salta("medio-tejo")
    assert mt.caixa_de_recorte.lon_min < mt.caixa.lon_min
    # A Nazaré está a −9,07 — 0,22° a oeste do limite da área de serviço.
    assert mt.caixa_de_recorte.contem(39.60, -9.07)
    assert not mt.caixa.contem(39.60, -9.07)


def test_caixa_contem():
    c = Caixa(39.0, 40.0, -9.0, -8.0)
    assert c.contem(39.5, -8.5)
    assert not c.contem(41.0, -8.5)


def test_prefixos_de_paragem_sao_os_13_concelhos(raiz):
    """O §6.4 lista os prefixos; cada um tem de corresponder a um concelho."""
    r = regiao_ou_salta("medio-tejo")
    prefixos = {c.prefixo_stop_id for c in r.concelhos}
    assert prefixos == {
        "abt",
        "acn",
        "cns",
        "ent",
        "fzz",
        "mac",
        "orm",
        "srd",
        "srt",
        "tmr",
        "tnv",
        "vlr",
        "vnb",
    }
    assert r.concelho_por_prefixo("srt").id == "serta"
    assert r.concelho_por_prefixo("xxx") is None


def test_o_nome_abre_a_frase_com_maiuscula(raiz):
    """«Demonstração. a Serra da Pedra Alta não existe» era a primeira frase da
    demonstração. A forma para abrir uma frase vem feita, como as contrações."""
    for r in carregar_todas(raiz):
        assert r.nome_com_artigo_no_inicio[0].isupper(), r.id
        assert r.nome_com_artigo_no_inicio.lower() == r.nome_com_artigo.lower()


def test_a_autoridade_e_o_operador_com_o_artigo_declarado(raiz):
    """«gerida por Comunidade Intermunicipal…» era a frase que nomeia o cliente,
    no rodapé de todas as páginas. Com o artigo declarado, sai «pela»."""
    prova = regiao_ou_salta("prova")
    assert prova.prosa_da_autoridade == {
        "com_artigo": "a Comunidade Intermunicipal da Serra da Pedra Alta",
        "de": "da Comunidade Intermunicipal da Serra da Pedra Alta",
        "por": "pela Comunidade Intermunicipal da Serra da Pedra Alta",
    }
    assert prova.prosa_do_operador == {"operador_por": "pela Alta Transportes"}
    # O município é «o»: é a outra metade do par, e a que apanha uma contração
    # cravada no feminino.
    municipio = regiao_ou_salta("prova-municipio")
    assert municipio.prosa_da_autoridade["por"] == "pelo Município de Sável"


def test_sem_artigo_declarado_nao_ha_frases_feitas(raiz, tmp_path):
    """O artigo da autoridade é opcional: sem ele o sítio usa outra forma da
    frase, e aqui não se inventa nenhum."""
    pasta = tmp_path / "sem-artigos"
    pasta.mkdir()
    (pasta / "regiao.yaml").write_text(
        yaml.safe_dump(
            {
                "id": "sem-artigos",
                "nome": "Sem Artigos",
                "artigo": "a",
                "autoridade_de_transportes": {"nome": "Comunidade X"},
                "rede": {"nome": "X", "operador": "Y"},
                "territorio": {"caixa": {"lat_min": 1, "lat_max": 2, "lon_min": 1, "lon_max": 2}},
                "modos": [],
            }
        ),
        encoding="utf-8",
    )
    r = Regiao.carregar(pasta)
    assert r.prosa_da_autoridade == {}
    assert r.prosa_do_operador == {}


def test_recusa_artigo_da_autoridade_que_nao_e_artigo(raiz, tmp_path):
    pasta = tmp_path / "artigo-errado"
    pasta.mkdir()
    (pasta / "regiao.yaml").write_text(
        yaml.safe_dump(
            {
                "id": "artigo-errado",
                "nome": "X",
                "artigo": "a",
                "autoridade_de_transportes": {"nome": "Comunidade X", "artigo": "da"},
                "territorio": {"caixa": {"lat_min": 1, "lat_max": 2, "lon_min": 1, "lon_max": 2}},
                "modos": [],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ErroDeRegiao, match="`artigo` tem de ser"):
        Regiao.carregar(pasta)
