"""Onde ficam as paragens dos urbanos — e, sobretudo, onde NÃO ficam.

Este módulo resolve nomes em coordenadas, e um nome resolvido no sítio errado
é a pior avaria que este produto pode ter: manda alguém esperar numa berma
onde não passa nada, e não parece uma avaria. Por isso os testes que mais
importam aqui são os que provam que a resolução se RECUSA.

Os números da última parte são MEDIDOS na construção real, como os do §6.1.
Se mudarem sem os dados mudarem, alguém alargou a rede e passou a apanhar
paragens que não são as certas.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from paragem import urbanos

RAIZ = Path(__file__).resolve().parents[2]

# Dois pontos a ~28 m um do outro: os dois lados da mesma rua.
LADO_A = (39.480000, -8.535000)
LADO_B = (39.480250, -8.535000)
# E um a 1,4 km: outro sítio, com o mesmo nome.
LONGE = (39.492000, -8.535000)


def _indice(*pontos: tuple[str, tuple[float, float], str]) -> urbanos.Indice:
    i = urbanos.Indice()
    for nome, (lat, lon), fonte in pontos:
        i.juntar(nome, lat, lon, fonte)
    return i


# --- as duas regras que evitam o pior --------------------------------------


def test_dois_candidatos_perto_sao_a_mesma_paragem_e_dao_o_meio():
    i = _indice(("Bombeiros", LADO_A, "osm-paragem"), ("Bombeiros", LADO_B, "osm-paragem"))
    p = urbanos.resolver("Bombeiros", i)
    assert p is not None
    assert p["candidatos"] == 2
    assert p["dispersao_m"] == 28
    # O meio da rua entre as duas plataformas, e não uma delas à sorte.
    assert p["lat"] == pytest.approx((LADO_A[0] + LADO_B[0]) / 2, abs=1e-6)


def test_dois_candidatos_longe_nao_se_resolvem():
    """A avaria que isto impede: escolher um dos dois era adivinhar.

    `Centro de Saúde` existe em todas as vilas. Se a procura devolvesse o
    primeiro que encontrasse, a paragem ficava a um quilómetro do sítio — e
    ninguém dava por isso, porque a coordenada parece boa.
    """
    i = _indice(
        ("Centro de Saúde", LADO_A, "osm-paragem"), ("Centro de Saúde", LONGE, "osm-paragem")
    )
    assert urbanos.resolver("Centro de Saúde", i) is None


def test_o_limite_da_dispersao_e_o_que_o_modulo_declara():
    assert urbanos.DISPERSAO_MAXIMA_M == 120.0
    quase = (LADO_A[0] + 119 / 111320, LADO_A[1])
    demais = (LADO_A[0] + 121 / 111320, LADO_A[1])
    assert urbanos.resolver("X", _indice(("X", LADO_A, "rede"), ("X", quase, "rede"))) is not None
    assert urbanos.resolver("X", _indice(("X", LADO_A, "rede"), ("X", demais, "rede"))) is None


def test_um_nome_que_nao_existe_nao_se_inventa():
    i = _indice(("Bombeiros", LADO_A, "osm-paragem"))
    assert urbanos.resolver("Mercado do Peixe", i) is None


# --- a ordem de autoridade -------------------------------------------------


def test_o_percurso_mapeado_da_o_ponto_quando_as_fontes_concordam():
    """Quem seguiu a carreira sabe mais — sobre QUAL dos dois lados da rua.

    As duas fontes têm o mesmo sítio; a do percurso é que tem a plataforma
    certa. Sem a ordem de autoridade, saía o meio da rua entre as duas.
    """
    i = _indice(("Bombeiros", LADO_A, "osm-percurso"), ("Bombeiros", LADO_B, "rede"))
    p = urbanos.resolver("Bombeiros", i)
    assert p is not None
    assert p["fonte"] == "osm-percurso"
    assert p["lat"] == pytest.approx(LADO_A[0], abs=1e-6)
    # Mas a dispersão continua a contar as DUAS: é o que diz se concordam.
    assert p["candidatos"] == 2
    assert p["dispersao_m"] == 28


def test_a_autoridade_da_fonte_nao_passa_por_cima_da_dispersao():
    """A avaria que quase entrou, e que só um teste apanhou.

    A ordem de autoridade escolhe ENTRE pontos que são o mesmo sítio. Se a
    deixássemos decidir TAMBÉM se o são, bastava a fonte mais forte ter um
    homónimo para a paragem ir parar à outra ponta do concelho — e com
    `dispersao_m: 0`, porque só se tinha olhado para um lado.
    """
    i = _indice(("Bombeiros", LADO_A, "osm-percurso"), ("Bombeiros", LONGE, "rede"))
    assert urbanos.resolver("Bombeiros", i) is None


def test_um_nome_exato_numa_fonte_fraca_ganha_a_um_aproximado_numa_forte():
    """A qualidade da correspondência manda; a autoridade desempata.

    «Meia Via (Poço)» casa exatamente com a paragem da rede que tem esse nome.
    Reduzi-la a «meia via» só porque o percurso tem um ponto assim chamado era
    trocar a plataforma certa por outra qualquer.
    """
    i = _indice(("Meia Via", LONGE, "osm-percurso"), ("Meia Via (Poço)", LADO_A, "rede"))
    p = urbanos.resolver("Meia Via (Poço)", i)
    assert p is not None
    assert p["fonte"] == "rede"
    assert p["como"] == "nome"


# --- a ortografia, que é ortografia e não palpite --------------------------


def test_as_ligacoes_e_as_abreviaturas_nao_mudam_o_sitio():
    i = _indice(("Curva do Bom Amor", LADO_A, "rede"), ("Avenida Nogueiral", LADO_B, "rede"))
    for cartaz in ("Curva Bom Amor", "Av. Nogueiral"):
        p = urbanos.resolver(cartaz, i)
        assert p is not None, cartaz
        assert p["como"] == "ortografia"


def test_a_ortografia_nao_junta_nomes_diferentes():
    """«Casal do Pote» e «Casa do Pote» são dois sítios, e continuam dois."""
    i = _indice(("Casa do Pote", LADO_A, "rede"))
    assert urbanos.resolver("Casal do Pote", i) is None


def test_est_fica_de_fora_das_abreviaturas():
    """`Est.` tanto é «Estrada» como «Estação». Expandi-la era escolher uma."""
    assert "est" not in urbanos._ABREVIATURAS


def test_sem_parenteses_e_o_ultimo_degrau_e_a_dispersao_trava_o_resto():
    """«Riachos (X)» e «Riachos (Y)» reduzem-se as duas a «riachos».

    O degrau existe porque o cartaz distingue plataformas que o mapa não
    distingue; e é seguro porque, quando a localidade inteira cai na mesma
    chave, os candidatos ficam espalhados e a dispersão recusa-os.
    """
    i = _indice(("Av. Nogueiral (Gare)", LADO_A, "osm-percurso"))
    p = urbanos.resolver("Av. Nogueiral", i)
    assert p is not None
    assert p["como"] == "sem-parenteses"

    espalhados = _indice(
        ("Riachos (Eucaliptos)", LADO_A, "rede"), ("Riachos (Variante)", LONGE, "rede")
    )
    assert urbanos.resolver("Riachos (Centro de Saúde)", espalhados) is None


# --- o ficheiro, e os números medidos --------------------------------------


def test_localizar_deixa_as_paragens_sem_sitio_dentro_do_ficheiro(tmp_path: Path):
    """O que falta é o SÍTIO, não a hora: a paragem não desaparece do horário."""
    caminho = tmp_path / "linha.json"
    caminho.write_text(
        json.dumps(
            {
                "id": "x",
                "nome": "Linha X",
                "quadros": [{"paragens": ["Bombeiros", "Mercado do Peixe"], "viagens": []}],
            }
        ),
        encoding="utf-8",
    )
    fora = urbanos.localizar(caminho, _indice(("Bombeiros", LADO_A, "osm-paragem")))
    assert fora["localizadas"] == 1
    assert fora["sem_coordenada"] == ["Mercado do Peixe"]

    d = json.loads(caminho.read_text(encoding="utf-8"))
    assert list(d["coordenadas"]) == ["Bombeiros"]
    assert d["quadros"][0]["paragens"] == ["Bombeiros", "Mercado do Peixe"]


# QUANTAS PARAGENS TEM CADA LINHA vem do cartaz, que é um PDF arquivado: é um
# número frozen, e crava-se. QUANTAS ESTÃO NO MAPA vem do OpenStreetMap, que
# muda todos os dias — e cravar esse número deu numa publicação reprovada no
# `main`, com a produção parada por causa de uma paragem que alguém mapeou (ou
# desmapeou) entretanto.
#
# A regra que fica: número exato onde a fonte está congelada, INVARIANTE onde
# a fonte está viva.
PARAGENS_DO_CARTAZ = {
    "tut-linha-verde-express": 6,
    "tut-linha-verde": 33,
    "tut-linha-vermelha": 28,
    "tut-linha-azul": 30,
}

# As duas linhas que têm relação de percurso no OpenStreetMap, e as duas que
# não têm. É esta diferença — e não um número — que este módulo existe para
# provar: onde alguém mapeou a carreira, as paragens aparecem; onde não, não.
COM_PERCURSO = ("tut-linha-verde-express", "tut-linha-verde")
SEM_PERCURSO = ("tut-linha-vermelha", "tut-linha-azul")


def _localizadas(ficheiro: str) -> tuple[int, int]:
    caminho = RAIZ / "build" / "medio-tejo" / "urbanos" / f"{ficheiro}.json"
    if not caminho.exists():  # pragma: no cover — só sem construção feita
        pytest.skip(f"falta {caminho}: correr `pipeline build`")
    d = json.loads(caminho.read_text(encoding="utf-8"))
    if "coordenadas" not in d:  # pragma: no cover — construção anterior a este passo
        pytest.skip("a construção é anterior à localização das paragens")
    return len(d["coordenadas"]), len(d["coordenadas"]) + len(d["sem_coordenada"])


@pytest.mark.parametrize(("ficheiro", "quantas"), sorted(PARAGENS_DO_CARTAZ.items()))
def test_as_paragens_do_cartaz_sao_as_que_o_cartaz_tem(ficheiro: str, quantas: int):
    """O cartaz é um PDF arquivado: o número de paragens não muda sozinho."""
    _, todas = _localizadas(ficheiro)
    assert todas == quantas


def test_as_linhas_mapeadas_no_openstreetmap_resolvem_se_muito_melhor():
    """A diferença que este módulo existe para provar, sem cravar contagens.

    Medido a 21/09/2026: Verde Express 6/6 e Verde 25/33, contra Vermelha 7/28
    e Azul 5/30. Os números vão mudar — o OpenStreetMap é vivo — mas a razão
    não: uma relação de percurso É a lista das paragens da carreira, e onde
    ela existe quase tudo casa.

    Se um dia isto falhar sem ninguém ter mexido no leitor, é boa notícia
    disfarçada: quer dizer que alguém mapeou as outras duas linhas.
    """
    com = [_localizadas(f) for f in COM_PERCURSO]
    sem = [_localizadas(f) for f in SEM_PERCURSO]
    fracao = lambda ps: sum(p for p, _ in ps) / sum(t for _, t in ps)  # noqa: E731
    assert fracao(com) > 0.5, "as linhas com percurso mapeado deviam resolver-se quase todas"
    assert fracao(com) > fracao(sem) * 2, "a diferença entre mapeado e não mapeado desapareceu"


def test_nao_se_localiza_mais_do_que_existe():
    """O guarda mais simples, e o que apanha uma contagem a delirar."""
    for ficheiro in PARAGENS_DO_CARTAZ:
        postas, todas = _localizadas(ficheiro)
        assert 0 <= postas <= todas


def test_nenhuma_coordenada_cai_fora_do_concelho_da_linha():
    """A caixa de Torres Novas, medida nos limites da CAOP, com folga.

    É o que trava a avaria maior: «Centro de Saúde» resolver-se em Coimbra,
    que este recorte de OSM também contém — com 2 358 paragens do SMTUC lá
    dentro.
    """
    pasta = RAIZ / "build" / "medio-tejo" / "urbanos"
    ficheiros = sorted(pasta.glob("tut-*.json")) if pasta.exists() else []
    if not ficheiros:  # pragma: no cover — só sem construção feita
        pytest.skip("falta a construção")
    vistos = 0
    for caminho in ficheiros:
        for nome, p in (
            json.loads(caminho.read_text(encoding="utf-8")).get("coordenadas") or {}
        ).items():
            assert 39.40 <= p["lat"] <= 39.56, f"{nome} em {caminho.name}"
            assert -8.63 <= p["lon"] <= -8.44, f"{nome} em {caminho.name}"
            vistos += 1
    assert vistos > 0
