"""O registo de proveniência, e a regra de não raspar quem o proíbe.

Estes testes existem porque a regra do CLAUDE.md §4.3 não pode viver só em
prosa: uma regra em prosa quebra-se por distração, meses depois, por quem nunca
leu a prosa.

**NENHUM DELES NOMEIA UMA FONTE DE UMA REGIÃO**, e isso mudou. Nomeavam: o
`transporte-a-pedido` era o exemplo de «recusa-se a descarregar», o
`meio-horarios-dezembro-2025` o de «manual e presente». Eram bons exemplos e
davam maus testes, por duas razões que só se veem quando as regiões passam a
viver em raízes separadas (docs/RAIZES.md):

- um teste que nomeia a fonte de um cliente **só corre onde esse cliente está**,
  e o repositório do produto passa a ter uma suite que não verifica a regra que
  diz verificar;
- e escreve na suite pública a lista dos documentos desse cliente, que é
  precisamente o que a separação evita.

Passaram a **procurar a fonte pela propriedade** que estão a testar. Encontram
o que houver, em qualquer raiz, e saltam com a razão escrita quando não houver
nenhuma. Ganharam alcance: antes verificavam uma fonte, agora verificam a
regra.
"""

import pytest

from paragem.fontes import ErroDeFonte, Registo


def uma_fonte(r: Registo, condicao, o_que: str):
    """A primeira fonte que cumpre a condição, ou um salto com a razão escrita."""
    for f in sorted(r, key=lambda x: x.id):
        if condicao(f):
            return f
    pytest.skip(f"nenhuma raiz declara {o_que} — ver docs/RAIZES.md")


def test_carrega_o_registo(raiz):
    r = Registo.carregar(raiz)
    assert len(r) >= 5, "o registo está vazio ou quase — falta o data/sources.yaml?"
    assert "osm-portugal" in r


def test_fonte_desconhecida_diz_o_que_fazer(raiz):
    r = Registo.carregar(raiz)
    with pytest.raises(ErroDeFonte, match="não está em data/sources.yaml"):
        r.obter("uma-fonte-que-nao-existe")


def test_recusa_descarregar_o_que_e_proibido(raiz):
    """Um sítio que só se automatiza com autorização escrita não se descarrega.

    A regra é do §4.3 e vale para qualquer região: há autoridades de
    transportes cujos sistemas de reserva proíbem acesso automático, e a
    proibição tem de ser executável e não um parágrafo.
    """
    r = Registo.carregar(raiz)
    f = uma_fonte(r, lambda x: x.acesso == "proibido-sem-autorizacao", "uma fonte proibida")
    with pytest.raises(ErroDeFonte, match="autorização escrita"):
        r.caminho(f.id)


def test_recusa_a_fonte_marcada_nao_usar(raiz):
    """Uma fonte que se sabe imprestável fica registada para ninguém a repetir.

    «Não a usámos» e «não sabíamos que existia» são coisas diferentes, e a
    diferença poupa a alguém o dia que nos custou a nós.
    """
    r = Registo.carregar(raiz)
    f = uma_fonte(r, lambda x: x.acesso == "nao-usar", "uma fonte marcada `nao-usar`")
    with pytest.raises(ErroDeFonte, match="nao-usar|`nao-usar`"):
        r.caminho(f.id)


def test_fonte_manual_em_falta_diz_onde_a_por(raiz):
    """Uma fonte manual que ainda não chegou tem de dizer para onde vai.

    Sem isto, a mensagem é «falta um ficheiro» — e quem a lê fica sem saber
    qual, de onde, nem para que pasta. O CLAUDE.md §10 pede exatamente os três.
    """
    r = Registo.carregar(raiz)
    f = uma_fonte(
        r,
        lambda x: (
            x.acesso == "manual"
            and bool(x.ficheiro)
            and not ((x.raiz or raiz) / x.ficheiro).exists()
        ),
        "uma fonte manual ainda por chegar",
    )
    with pytest.raises(ErroDeFonte, match="data/manual"):
        r.caminho(f.id)


def test_fonte_manual_ja_presente_devolve_o_caminho(raiz):
    """Manual e presente: devolve o caminho em vez de se queixar.

    Não é decoração. Uma fonte manual não se volta a obter sem alguém repetir
    a exportação à mão — se o ficheiro desaparecer, é melhor que um teste o
    diga antes de o pipeline o descobrir a meio de uma construção.
    """
    r = Registo.carregar(raiz)
    f = uma_fonte(
        r,
        lambda x: (
            x.acesso == "manual" and bool(x.ficheiro) and ((x.raiz or raiz) / x.ficheiro).exists()
        ),
        "uma fonte manual já presente",
    )
    assert r.caminho(f.id).exists()


def test_osm_exige_atribuicao(raiz):
    """A ODbL não é uma boa maneira: é uma obrigação que segue a obra derivada."""
    f = Registo.carregar(raiz).obter("osm-portugal")
    assert f.licenca == "ODbL-1.0"
    assert f.exige_atribuicao
    assert "OpenStreetMap" in (f.atribuicao or "")


def test_licenca_desconhecida_nao_e_licenca_permissiva(raiz):
    """«Não declara licença» não é «podes usar». São estados diferentes.

    O `cp-gtfs` está publicado abertamente e sem declaração encontrada — é o
    caso que o produto tem de tratar como por esclarecer, e não como aberto.
    """
    r = Registo.carregar(raiz)
    assert r.obter("cp-gtfs").licenca_por_esclarecer
    assert not r.obter("osm-portugal").licenca_por_esclarecer
    por_esclarecer = [f.id for f in r if f.licenca_por_esclarecer]
    assert por_esclarecer, "nenhuma fonte marcada por esclarecer — a distinção perdeu-se?"


def test_os_ficheiros_que_nao_devem_mudar_declaram_a_soma(raiz):
    """Os manuais e os de referência, sim; os automáticos, não.

    A CP, a FlixBus e o OpenStreetMap republicam legitimamente todas as
    semanas. Uma soma fixa nesses só faria o pipeline reprovar por o mundo ter
    andado — e um guarda que reprova por nada ensina a ignorá-lo.
    """
    r = Registo.carregar(raiz)
    assert r.obter("cp-gtfs").sha256 is None
    assert r.obter("osm-portugal").sha256 is None
    for f in r:
        if f.acesso in {"manual", "local"} and f.ficheiro:
            caminho = (f.raiz or raiz) / f.ficheiro
            if caminho.is_file():
                assert f.sha256, f"{f.id}: é manual, está cá e não declara soma"


def test_o_que_declara_soma_tem_de_estar_ca(raiz):
    """Uma soma declarada é uma promessa de que o ficheiro não muda — nem desaparece.

    Isto era um teste que nomeava a exportação do STePP e contava os dois
    ficheiros dela pelo nome. Guardava a coisa certa — uma exportação feita à
    mão, atrás de proteção anti-robô, que ninguém volta a obter num minuto —
    pela razão errada: só guardava AQUELA, e só onde ela estivesse.

    A regra é a mesma para todas: quem declara soma promete o ficheiro.
    """
    r = Registo.carregar(raiz)
    for f in r:
        if not f.sha256 or not f.ficheiro:
            continue
        assert ((f.raiz or raiz) / f.ficheiro).exists(), (
            f"{f.id}: declara soma e o ficheiro não está cá"
        )


def test_as_somas_declaradas_batem_com_os_ficheiros(raiz):
    """Se isto falhar, alguém substituiu um ficheiro que não devia mudar."""
    from paragem.fontes import sha256

    r = Registo.carregar(raiz)
    for f in r:
        if not f.sha256 or not f.ficheiro:
            continue
        caminho = (f.raiz or raiz) / f.ficheiro
        if not caminho.is_file():
            continue
        assert sha256(caminho) == f.sha256, f.id
