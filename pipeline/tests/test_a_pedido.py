"""O transporte a pedido: o que se declara, e o que se recusa a inventar.

É o modo que mais falta a quem vive fora das vilas — há freguesias nesta
região sem carreira regular nenhuma — e o único em que a REGRA DE RESERVA vale
mais do que o horário: um circuito que ninguém chama não passa.
"""

from pathlib import Path

import pytest

from conftest import regiao_ou_salta
from paragem.sitio import _a_pedido


@pytest.fixture
def raiz() -> Path:
    return Path(__file__).resolve().parents[2]


def test_as_zonas_batem_certo_com_os_concelhos_da_regiao(raiz):
    """Uma zona num concelho que a região não tem é um erro de transcrição.

    E um concelho sem zona NEM declaração de que não a tem é uma omissão
    silenciosa: quem mora lá procura e não encontra, sem saber se o serviço não
    existe ou se nós é que não o pusemos.
    """
    r = regiao_ou_salta("medio-tejo")
    ids = {c.id for c in r.concelhos}
    zonas = r.a_pedido["zonas"]

    com_zona = {z["concelho"] for z in zonas if z.get("concelho")}
    sem_zona = set(r.a_pedido["concelhos_sem_zona"])

    assert not (com_zona - ids), "zona num concelho que a região não declara"
    assert not (sem_zona - ids), "concelho sem zona que a região não declara"
    assert com_zona | sem_zona == ids, "todos os concelhos têm de estar de um lado ou do outro"


def test_o_link_nao_e_de_um_concelho(raiz):
    """O LINK atravessa fronteiras, e são três zonas e não uma.

    O catálogo do sistema de reservas tem «LINK Cidades», «LINK Mação -
    Abrantes - Vila de Rei» e «LINK Sertã - Tomar». Nenhuma é de um concelho:
    atribuí-las a um fazia-as aparecer só numa das pontas, e quem as procurasse
    da outra não as encontrava. A da Sertã atravessa até a fronteira entre duas
    CIM (CLAUDE.md §2).
    """
    r = regiao_ou_salta("medio-tejo")
    links = [z for z in r.a_pedido["zonas"] if z["id"].startswith("link")]
    assert len(links) == 3
    assert all(z["concelho"] is None for z in links)

    serta_tomar = next(z for z in links if z["id"] == "link-serta-tomar")
    assert set(serta_tomar["entre"]) == {"serta", "tomar"}


def test_o_catalogo_tem_as_27_zonas_e_os_75_circuitos(raiz):
    """São os números do instantâneo do sistema de reservas, não estimativas.

    O CLAUDE.md §5 dizia «27 zonas e cerca de 90 circuitos». As zonas batem
    certo; os circuitos são 75. Se algum destes números mudar sem o instantâneo
    mudar, alguém transcreveu mal.
    """
    r = regiao_ou_salta("medio-tejo")
    assert len(r.a_pedido["zonas"]) == 27
    assert len(r.a_pedido["circuitos"]) == 75
    # O número do sistema é o que liga uma zona ao horário dela no dia em que
    # a autorização existir. Sem ele, ficava a casar nomes.
    assert all(z.get("id_no_sistema") for z in r.a_pedido["zonas"])
    assert all(c.get("id_no_sistema") for c in r.a_pedido["circuitos"])


def test_os_circuitos_nao_sao_atribuidos_a_zonas_por_deducao(raiz):
    """A ligação zona→circuito é PROVADA, nunca deduzida do nome.

    Deduzi-la pelos nomes acertava em muitos e errava nalguns — e um circuito
    atribuído ao concelho errado manda alguém reservar onde não deve.

    Este teste já cravou o estado do dia em que foi escrito («só Ferreira do
    Zêzere tem circuitos»), e isso partiu-o no dia em que a ligação apareceu:
    o instantâneo de 21/09/2026, gravado com os resultados abertos, traz os
    dois números do sistema no identificador de cada painel. Cravar um estado
    faz um teste que se opõe ao progresso em vez de o guardar.

    O que se guarda agora são as propriedades que impedem a invenção:

    - um circuito atribuído tem de existir no CATÁLOGO do sistema, com o nome
      que o sistema lhe dá — um nome inventado não passa. Um que não esteja no
      catálogo tem de dizer DE ONDE VEIO: há circuitos na página pública de
      horários que o formulário de reservas não lista, e essa diferença
      declara-se em vez de se esconder;
    - nenhum circuito pode estar em duas zonas, que é como uma dedução por
      semelhança de nome se denuncia.
    """
    r = regiao_ou_salta("medio-tejo")
    catalogo = {_ch(c["nome"]) for c in (r.a_pedido.get("circuitos") or [])}
    assert catalogo, "sem catálogo não há com que comparar"

    onde = {}
    for z in r.a_pedido["zonas"]:
        for c in z.get("circuitos") or []:
            k = _ch(c["nome"])
            assert k in catalogo or c.get("fonte"), (
                f"{z['id']}: «{c['nome']}» não está no catálogo do sistema de reservas "
                "e não diz de onde veio"
            )
            assert k not in onde, (
                f"«{c['nome']}» está em duas zonas ({onde[k]} e {z['id']}) — "
                "é assim que uma dedução por semelhança de nome se denuncia"
            )
            onde[k] = z["id"]
    assert onde, "nenhuma zona tem circuitos — a ligação desapareceu"


def _ch(x: str) -> str:
    import re
    import unicodedata

    y = unicodedata.normalize("NFKD", str(x or ""))
    y = "".join(c for c in y if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]", "", y)


def test_a_regra_de_reserva_vai_junto_das_zonas(raiz):
    """Vivem em ficheiros diferentes e na página não podem estar separadas.

    Uma zona sem a regra de reserva é uma promessa de serviço que não diz como
    se usa, e é assim que alguém fica à espera de um autocarro que ninguém
    chamou.
    """
    d = _a_pedido(regiao_ou_salta("medio-tejo"))
    assert d["reservas"]["telefone"], "sem telefone, a página não serve para nada"
    assert d["reservas"]["prazo"], "sem prazo, ninguém sabe até quando pode reservar"
    # A reserva online NÃO cobre tudo, e dizer que cobre manda alguém a um
    # sítio onde não encontra o que procura.
    assert d["reservas"]["com_reserva_online"], "que serviços têm reserva online"


def test_conta_as_zonas_por_levantar_em_vez_de_as_esconder(raiz):
    """A página diz quantas zonas não têm circuitos, e não mostra só as que têm.

    Uma lista curta a fingir-se de completa é pior do que uma lista curta que
    se declara incompleta.
    """
    d = _a_pedido(regiao_ou_salta("medio-tejo"))
    com = [z for z in d["zonas"] if z["circuitos"]]
    assert d["zonas_sem_circuitos"] == len(d["zonas"]) - len(com)
    assert d["zonas_sem_circuitos"] > 0, "se isto for zero, o número tem de sair da interface"


def test_uma_regiao_sem_a_pedido_nao_gera_pagina(raiz):
    """A prova não tem transporte a pedido, e não deve ganhar uma secção vazia."""
    assert _a_pedido(regiao_ou_salta("prova")) == {}


# ---------------------------------------------------------------------------
# a ordem de uma viagem transcrita à mão
# ---------------------------------------------------------------------------


def _quadro(colunas, paragens):
    from paragem.leitores.horarios_manuais import _linha
    from paragem.regiao import Saida

    d = {"circuitos": [{"nome": "Ensaio", "colunas": colunas, "paragens": paragens}]}
    return _linha(Saida(fonte="ensaio", leitor="horarios-manuais"), d)["quadros"][0]


def test_a_volta_inverte_se_e_a_ida_nao():
    """A coluna da volta desce pela folha abaixo, e lida assim ia ao contrário.

    A lista de paragens é a da ida. A volta percorre-a do fim para o princípio,
    e por isso a hora mais tarde dela está na primeira linha.
    """
    q = _quadro(["Ida", "Volta"], [["A", ["08:00", "13:10"]], ["B", ["08:30", "12:40"]]])
    ida, volta = q["viagens"]
    assert [p[0] for p in ida["passagens"]] == ["A", "B"]
    assert [p[0] for p in volta["passagens"]] == ["B", "A"]


def test_uma_hora_sem_zero_a_frente_nao_inverte_a_viagem():
    """«9:50» é antes de «10:30», e comparadas como texto não era.

    As folhas de Ferreira do Zêzere escrevem a coluna de sábado sem o zero à
    frente. Como `«9» > «1»`, a comparação em texto dava a primeira hora como
    maior do que a última e mandava inverter — a ida do sábado saía a chegar às
    10:30 e a partir às 9:50, uma viagem que acaba antes de começar.

    Aqui não se normaliza a hora de propósito: o que se mostra é o que a folha
    diz. Logo a ORDEM tem de sair do valor e não da grafia.
    """
    q = _quadro(["Ida"], [["A", ["9:50"]], ["B", ["10:00"]], ["C", ["10:30"]]])
    (ida,) = q["viagens"]
    assert [p[0] for p in ida["passagens"]] == ["A", "B", "C"]
    assert [p[1] for p in ida["passagens"]] == ["9:50", "10:00", "10:30"], (
        "a hora mostra-se como a folha a escreve"
    )


def test_a_volta_tambem_inverte_sem_o_zero_a_frente():
    """E o contrário continua a valer: 12:30 depois de 9:50 é uma volta."""
    q = _quadro(["Volta"], [["A", ["13:10"]], ["B", ["12:30"]]])
    (volta,) = q["viagens"]
    assert [p[0] for p in volta["passagens"]] == ["B", "A"]


def test_o_horario_de_um_circuito_aponta_para_um_quadro_que_existe(raiz):
    """Um `horario_em` que não resolve é pior do que não existir.

    A ligação catálogo→brochura foi decidida a olho, e é esse o ponto: as duas
    listas não batiam pelo nome — «Constância Sul» está na brochura como
    «Constância – Constância-Sul e Santa Margarida da Coutada», e «Serra de
    Santo António» como «Serra de S.to António». Decidir pelo nome errava; o
    que decidiu foram as HORAS e as PARAGENS.

    Uma decisão dessas escreve-se uma vez e depois vive. O que a pode partir
    sem ninguém dar por isso é a OUTRA ponta mudar: uma brochura retranscrita
    com o quadro noutro nome, um ficheiro de saída renomeado. Aí o circuito
    fica a apontar para o vazio, e a página do concelho mostra um nome sem
    horas nenhumas — exatamente o que isto veio resolver.

    Não se afirma aqui QUANTOS têm horário. Esse número sobe quando aparecer
    outra gravação, e um teste que o cravasse opunha-se ao progresso em vez de
    o guardar (é a lição que o `test_os_circuitos_nao_sao_atribuidos_...` já
    tinha aprendido à sua custa).
    """
    import json

    r = regiao_ou_salta("medio-tejo")
    construcao = raiz / "build" / "medio-tejo"
    if not construcao.is_dir():
        pytest.skip("sem construção feita, não há quadros contra que verificar")

    quadros: dict[str, set[str]] = {}
    for f in sorted((construcao / "tap").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        quadros[f"tap/{f.name}"] = {q.get("nome", "") for q in d.get("quadros") or []}

    com = [c for c in r.a_pedido["circuitos"] if c.get("horario_em")]
    assert com, "nenhum circuito tem horário — a ligação desapareceu"

    for c in com:
        h = c["horario_em"]
        assert h["saida"] in quadros, (
            f"«{c['nome']}» aponta para {h['saida']}, que a construção não produz"
        )
        assert h["quadro"] in quadros[h["saida"]], (
            f"«{c['nome']}» aponta para o quadro «{h['quadro']}» de {h['saida']}, "
            f"que lá não está. Os que lá estão: {sorted(quadros[h['saida']])}"
        )


def test_onde_o_nome_nao_bate_fica_escrito_porque_e_que_se_decidiu_assim(raiz):
    """Uma decisão a olho sem a razão escrita é indistinguível de um palpite.

    Quem vier a seguir tem de poder discordar de cada uma destas sem ter de
    refazer o cruzamento todo — e para discordar precisa de saber o que me
    convenceu. Onde o nome é o mesmo nos dois lados não há nada a provar, e
    exigir prova aí era ruído.
    """
    import re
    import unicodedata

    def ch(x: str) -> str:
        y = unicodedata.normalize("NFKD", str(x or ""))
        y = "".join(c for c in y if unicodedata.category(c) != "Mn").lower()
        return re.sub(r"[^a-z0-9]+", "", y)

    r = regiao_ou_salta("medio-tejo")
    sem_razao = [
        c["nome"]
        for c in r.a_pedido["circuitos"]
        if c.get("horario_em")
        and ch(c["nome"]) != ch(c["horario_em"]["quadro"])
        and not str(c.get("prova") or "").strip()
    ]
    assert not sem_razao, (
        f"estes circuitos apontam para um quadro com OUTRO nome e não dizem porquê: {sem_razao}"
    )
