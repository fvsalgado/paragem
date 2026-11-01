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


def test_os_membros_e_os_servidos_batem_com_a_lista_de_concelhos(raiz):
    """Os dois números podem ser diferentes, e é preciso que possam.

    Medido numa região real: a comunidade intermunicipal tem 11 municípios e a
    rede serve 13, porque dois concelhos saíram para outra comunidade e
    continuam servidos pela concessão. Em TODAS as regiões, os dois números
    têm de bater com a lista: os membros com os marcados como membros, os
    servidos com a lista inteira.
    """
    for r in carregar_todas(raiz):
        membros = [c for c in r.concelhos if c.membro]
        assert r.municipios_membros == len(membros), r.id
        assert r.concelhos_servidos == len(r.concelhos), r.id
        assert {c.id for c in r.concelhos_servidos_nao_membros} == {
            c.id for c in r.concelhos if not c.membro
        }, r.id


def test_contracoes(raiz):
    municipio = regiao_ou_salta("prova-municipio")
    prova = regiao_ou_salta("prova")
    assert municipio.com("de") == "do Baixo Sável"
    assert municipio.com("em") == "no Baixo Sável"
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
    """Uma coordenada trocada entre regiões tem de falhar, não cair nas duas.

    Todas as regiões que a raiz vê, duas a duas — e não um par escolhido pelo
    nome.
    """
    regioes = carregar_todas(raiz)
    for i, a in enumerate(regioes):
        for b in regioes[i + 1 :]:
            assert not a.caixa.sobrepoe(b.caixa), f"{a.id} e {b.id}"


def test_margem_de_recorte_alarga_a_caixa(raiz):
    """Há linhas que atravessam a fronteira. Cortá-las era servir meia viagem.

    Medido numa região real: a margem traz para dentro do recorte uma vila da
    costa a 0,22° a oeste do limite da área de serviço, onde uma carreira da
    região acaba.
    """
    for r in carregar_todas(raiz):
        if not r.margem_recorte_graus:
            continue
        c, recorte = r.caixa, r.caixa_de_recorte
        assert recorte.lon_min < c.lon_min and recorte.lon_max > c.lon_max, r.id
        assert recorte.lat_min < c.lat_min and recorte.lat_max > c.lat_max, r.id
        fora = (c.lat_min + c.lat_max) / 2, c.lon_min - r.margem_recorte_graus / 2
        assert recorte.contem(*fora) and not c.contem(*fora), r.id


def test_caixa_contem():
    c = Caixa(39.0, 40.0, -9.0, -8.0)
    assert c.contem(39.5, -8.5)
    assert not c.contem(41.0, -8.5)


def test_cada_prefixo_de_paragem_e_de_um_concelho(raiz):
    """Os prefixos do `stop_id` dizem o concelho; cada um tem de ser de um só.

    Em todas as regiões que os declaram — e um prefixo que nenhum concelho tem
    não é de concelho nenhum, em vez de cair no primeiro.
    """
    vistos = 0
    for r in carregar_todas(raiz):
        prefixos = [c.prefixo_stop_id for c in r.concelhos if c.prefixo_stop_id]
        assert len(prefixos) == len(set(prefixos)), f"{r.id}: um prefixo em dois concelhos"
        for c in r.concelhos:
            if c.prefixo_stop_id:
                vistos += 1
                assert r.concelho_por_prefixo(c.prefixo_stop_id).id == c.id, r.id
        assert r.concelho_por_prefixo("xxx-que-ninguem-tem") is None, r.id
    assert vistos, "nenhuma região declara prefixos — o teste deixou de afirmar"


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
    assert prova.prosa_do_operador == {
        "operador_por": "pela Alta Transportes",
        "operador_de": "da Alta Transportes",
    }
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


def _regiao_minima(pasta, **extra):
    pasta.mkdir()
    (pasta / "regiao.yaml").write_text(
        yaml.safe_dump(
            {
                "id": pasta.name,
                "nome": "X",
                "artigo": "a",
                "territorio": {"caixa": {"lat_min": 1, "lat_max": 2, "lon_min": 1, "lon_max": 2}},
                "modos": [],
                **extra,
            }
        ),
        encoding="utf-8",
    )
    return pasta


def test_uma_proposta_declara_se_e_por_omissao_nao_e(tmp_path):
    """A rede é real e o sítio não é da autoridade: tem de o dizer em todas as páginas."""
    assert Regiao.carregar(_regiao_minima(tmp_path / "proposta", proposta=True)).proposta is True
    assert Regiao.carregar(_regiao_minima(tmp_path / "sem-nada")).proposta is False


def test_a_faixa_da_proposta_declara_se_na_regiao_ou_fica_a_generica(tmp_path):
    """A relação com a autoridade é da região: o produto não a escreve por ela."""
    generica = Regiao.carregar(_regiao_minima(tmp_path / "generica", proposta=True))
    assert generica.faixa_da_proposta is None

    faixa = {"titulo": "Proposta à Comunidade X.", "texto": "Ainda não é um serviço oficial."}
    declarada = Regiao.carregar(_regiao_minima(tmp_path / "declarada", proposta=faixa))
    assert declarada.proposta is True
    assert declarada.faixa_da_proposta == faixa


def test_a_faixa_da_proposta_chega_ao_sitio_tal_e_qual(raiz, tmp_path):
    """O sítio escreve-a como a região a declara; sem ela, `None` e a frase genérica."""
    import dataclasses

    from paragem.sitio import Sitio

    prova = regiao_ou_salta("prova")
    faixa = {"titulo": "Proposta à Comunidade X.", "texto": "Ainda não é um serviço oficial."}
    proposta = dataclasses.replace(
        prova, demonstracao=False, proposta=True, faixa_da_proposta=faixa
    )
    j = Sitio(raiz, proposta, tmp_path).regiao_json()
    assert j["proposta"] is True
    assert j["faixa_da_proposta"] == faixa
    assert Sitio(raiz, prova, tmp_path).regiao_json()["faixa_da_proposta"] is None


@pytest.mark.parametrize(
    "faixa",
    [
        {"titulo": "Proposta à Comunidade X."},
        {"texto": "Ainda não é um serviço oficial."},
        {"titulo": "Proposta.", "texto": "  "},
        # Uma chave mal escrita passava a frase genérica sem ninguém dar por isso.
        {"title": "Proposta.", "texto": "Ainda não é um serviço oficial."},
        {"titulo": "Proposta.", "texto": "Ainda não.", "ligacao": "/contacto/"},
    ],
)
def test_a_faixa_da_proposta_a_meio_recusa_se(tmp_path, faixa):
    pasta = _regiao_minima(tmp_path / "a-meio", proposta=faixa)
    with pytest.raises(ErroDeRegiao, match="`titulo` e `texto`"):
        Regiao.carregar(pasta)


def _com_concelhos(pasta, **extra):
    """Uma região mínima com um concelho e o modo dos urbanos, para os urbanos da rede."""
    pasta = _regiao_minima(
        pasta,
        modos=["autocarro", "urbano-municipal"],
        inclui={"concelhos": "concelhos.yaml"},
        **extra,
    )
    (pasta / "concelhos.yaml").write_text(
        yaml.safe_dump(
            {"concelhos": [{"id": "vila", "nome": "Vila", "distrito": "D", "dico": "0001"}]}
        ),
        encoding="utf-8",
    )
    return pasta


def test_os_urbanos_da_rede_declaram_se_e_saem_do_que_vai_tal_e_qual(tmp_path):
    rede = {
        "nome": "Rede X",
        "urbanos": [{"nome": "Urbano da Vila", "concelho": "vila", "linhas": ["0101", "12"]}],
    }
    r = Regiao.carregar(_com_concelhos(tmp_path / "x", rede=rede))
    assert [(u.nome, u.concelho, u.linhas) for u in r.urbanos_da_rede] == [
        ("Urbano da Vila", "vila", ("0101", "12"))
    ]
    # O `rede` vai tal e qual para o sítio; os urbanos vão validados, à parte.
    assert "urbanos" not in r.rede
    assert Regiao.carregar(_regiao_minima(tmp_path / "sem")).urbanos_da_rede == []


@pytest.mark.parametrize(
    ("urbanos", "modos", "erro"),
    [
        ([{"nome": "U", "concelho": "outra", "linhas": ["1"]}], None, "concelhos que a região"),
        ([{"nome": "U", "concelho": "vila", "linhas": []}], None, "pelo menos um"),
        ([{"nome": "U", "concelho": "vila"}], None, "os três e mais nada"),
        ([{"nome": "U", "concelho": "vila", "linhas": [101]}], None, "entre aspas"),
        (
            [
                {"nome": "U", "concelho": "vila", "linhas": ["1"]},
                {"nome": "V", "concelho": "vila", "linhas": ["1"]},
            ],
            None,
            "a mesma linha",
        ),
        ([{"nome": "U", "concelho": "vila", "linhas": ["1"]}], ["autocarro"], "urbano-municipal"),
    ],
)
def test_os_urbanos_da_rede_mal_declarados_recusam_se(tmp_path, urbanos, modos, erro):
    extra = {"rede": {"nome": "Rede X", "urbanos": urbanos}}
    pasta = _com_concelhos(tmp_path / "x", **extra)
    if modos is not None:
        d = yaml.safe_load((pasta / "regiao.yaml").read_text(encoding="utf-8"))
        d["modos"] = modos
        (pasta / "regiao.yaml").write_text(yaml.safe_dump(d), encoding="utf-8")
    with pytest.raises(ErroDeRegiao, match=erro):
        Regiao.carregar(pasta)


def test_uma_demonstracao_nao_pode_ser_tambem_uma_proposta(tmp_path):
    pasta = _regiao_minima(tmp_path / "as-duas", proposta=True, demonstracao=True)
    with pytest.raises(ErroDeRegiao, match="ao mesmo tempo"):
        Regiao.carregar(pasta)


def test_as_regioes_de_prova_nao_sao_propostas(raiz):
    """São inventadas: a faixa delas é a da demonstração, e não esta."""
    for r in carregar_todas(raiz):
        if r.demonstracao:
            assert not r.proposta, r.id


def _com_a_pedido(pasta, zonas_do_horario):
    """Uma região com duas zonas a pedido e um horário que diz de que zonas é."""
    pasta = _regiao_minima(
        pasta,
        modos=["a-pedido"],
        inclui={"a_pedido": "a-pedido.yaml", "fontes": "fontes.yaml"},
    )
    (pasta / "a-pedido.yaml").write_text(
        yaml.safe_dump(
            {
                "zonas": [
                    {"id": "norte", "nome": "Norte", "concelho": None, "reserva_online": True},
                    {"id": "sul", "nome": "Sul", "concelho": None},
                ]
            }
        ),
        encoding="utf-8",
    )
    (pasta / "fontes.yaml").write_text(
        yaml.safe_dump(
            {
                "saidas": [
                    {
                        "fonte": "x",
                        "leitor": "horarios-manuais",
                        "saida": "tap/ligacoes.json",
                        "modo": "a-pedido",
                        "params": {"id": "ligacoes", "zonas": zonas_do_horario},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    return pasta


def test_um_horario_a_pedido_pode_dizer_de_que_zonas_e(tmp_path):
    """Um folheto de ligações não é de concelho nenhum: diz-se de que zonas é."""
    r = Regiao.carregar(_com_a_pedido(tmp_path / "x", ["norte"]))
    assert r.saidas[0].params["zonas"] == ["norte"]


def test_um_horario_a_pedido_nao_pode_apontar_para_uma_zona_que_nao_ha(tmp_path):
    """Um nome trocado tirava à página o botão de reservar, em silêncio."""
    with pytest.raises(ErroDeRegiao, match="nordeste"):
        Regiao.carregar(_com_a_pedido(tmp_path / "x", ["norte", "nordeste"]))
