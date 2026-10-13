"""O transporte a pedido: o que se declara, e o que se recusa a inventar.

É o modo que mais falta a quem vive fora das vilas — há freguesias nesta
região sem carreira regular nenhuma — e o único em que a REGRA DE RESERVA vale
mais do que o horário: um circuito que ninguém chama não passa.
"""

from pathlib import Path

import pytest

from conftest import RAIZ, construcao_de, regiao_ou_salta
from paragem.regiao import carregar_todas
from paragem.sitio import _a_pedido


@pytest.fixture
def raiz() -> Path:
    return Path(__file__).resolve().parents[2]


def _com_a_pedido():
    """As regiões que declaram transporte a pedido — todas as que esta raiz vê.

    Pela PROPRIEDADE e não pelo nome (`conftest.regiao_que`): estes testes
    valem para qualquer região com zonas, e correm na demonstração, que as tem
    de propósito. Sem nenhuma, saltam e dizem porquê.
    """
    regioes = [r for r in carregar_todas(RAIZ) if (r.a_pedido or {}).get("zonas")]
    if not regioes:
        pytest.skip("nenhuma região desta raiz declara zonas de transporte a pedido")
    return regioes


def test_as_zonas_batem_certo_com_os_concelhos_da_regiao(raiz):
    """Uma zona num concelho que a região não tem é um erro de transcrição.

    E um concelho sem zona NEM declaração de que não a tem é uma omissão
    silenciosa: quem mora lá procura e não encontra, sem saber se o serviço não
    existe ou se nós é que não o pusemos.
    """
    for r in _com_a_pedido():
        ids = {c.id for c in r.concelhos}
        zonas = r.a_pedido["zonas"]

        com_zona = {z["concelho"] for z in zonas if z.get("concelho")}
        sem_zona = set(r.a_pedido.get("concelhos_sem_zona") or [])

        assert not (com_zona - ids), f"{r.id}: zona num concelho que a região não declara"
        assert not (sem_zona - ids), f"{r.id}: concelho sem zona que a região não declara"
        assert com_zona | sem_zona == ids, (
            f"{r.id}: todos os concelhos têm de estar de um lado ou do outro"
        )


def test_uma_zona_que_atravessa_a_fronteira_nao_e_de_um_concelho(raiz):
    """Uma ligação entre concelhos é de todos eles, e não de um.

    Medido numa região real: três zonas de ligação entre cidades, uma delas a
    atravessar até a fronteira entre duas comunidades intermunicipais (CLAUDE.md
    §2). Atribuí-las a um concelho fazia-as aparecer só numa das pontas, e quem
    as procurasse da outra não as encontrava. Por isso uma zona que diz `entre`
    não tem concelho, e as pontas são concelhos que a região tem.
    """
    vistas = 0
    for r in _com_a_pedido():
        ids = {c.id for c in r.concelhos}
        for z in r.a_pedido["zonas"]:
            if not z.get("entre"):
                continue
            vistas += 1
            assert z.get("concelho") is None, f"{r.id}/{z['id']}: é de mais de um concelho"
            assert len(set(z["entre"])) >= 2, f"{r.id}/{z['id']}: uma ligação tem duas pontas"
            assert set(z["entre"]) <= ids, f"{r.id}/{z['id']}: uma ponta que a região não tem"
    if not vistas:
        pytest.skip("nenhuma zona de transporte a pedido atravessa a fronteira de um concelho")


def test_o_numero_do_sistema_de_reservas_vai_em_todas_ou_em_nenhuma(raiz):
    """O número do sistema é o que liga uma zona ao horário dela.

    Sem ele, ficava a casar nomes. Uma região que o transcreveu tem de o ter
    em todas as zonas e em todos os circuitos do catálogo — um que falte é um
    que se casou pelo nome sem ninguém dar por isso.
    """
    com_numeros = [
        r for r in _com_a_pedido() if any(z.get("id_no_sistema") for z in r.a_pedido["zonas"])
    ]
    if not com_numeros:
        pytest.skip("nenhuma região desta raiz transcreveu os números do sistema de reservas")
    for r in com_numeros:
        assert all(z.get("id_no_sistema") for z in r.a_pedido["zonas"]), r.id
        assert all(c.get("id_no_sistema") for c in r.a_pedido.get("circuitos") or []), r.id


def test_os_circuitos_nao_sao_atribuidos_a_zonas_por_deducao(raiz):
    """A ligação zona→circuito é PROVADA, nunca deduzida do nome.

    Deduzi-la pelos nomes acertava em muitos e errava nalguns — e um circuito
    atribuído ao concelho errado manda alguém reservar onde não deve.

    Este teste já cravou o estado do dia em que foi escrito («só um concelho
    tem circuitos»), e isso partiu-o no dia em que a ligação apareceu: o
    instantâneo de 21/09/2026, gravado com os resultados abertos, traz os
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
    for r in _com_a_pedido():
        catalogo = {_ch(c["nome"]) for c in (r.a_pedido.get("circuitos") or [])}
        assert catalogo, f"{r.id}: sem catálogo não há com que comparar"

        onde = {}
        for z in r.a_pedido["zonas"]:
            for c in z.get("circuitos") or []:
                k = _ch(c["nome"])
                assert k in catalogo or c.get("fonte"), (
                    f"{r.id}/{z['id']}: «{c['nome']}» não está no catálogo do sistema de "
                    "reservas e não diz de onde veio"
                )
                assert k not in onde, (
                    f"{r.id}: «{c['nome']}» está em duas zonas ({onde[k]} e {z['id']}) — "
                    "é assim que uma dedução por semelhança de nome se denuncia"
                )
                onde[k] = z["id"]
        assert onde, f"{r.id}: nenhuma zona tem circuitos — a ligação desapareceu"


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
    chamou. Numa região a sério há também um telefone: a demonstração não
    tem, de propósito, para não mandar ninguém ligar para um número que não
    atende.
    """
    for r in _com_a_pedido():
        d = _a_pedido(r)
        declarada = ((r.tarifas or {}).get("reservas") or {}).get("transporte_a_pedido") or {}
        assert d["reservas"] == declarada, f"{r.id}: a regra não chegou à página"
        assert d["reservas"].get("prazo"), (
            f"{r.id}: sem prazo, ninguém sabe até quando pode reservar"
        )
        if not r.demonstracao:
            assert d["reservas"].get("telefone"), (
                f"{r.id}: sem telefone, a página não serve para nada"
            )


def test_conta_as_zonas_por_levantar_em_vez_de_as_esconder(raiz):
    """A página diz quantas zonas não têm circuitos, e não mostra só as que têm.

    Uma lista curta a fingir-se de completa é pior do que uma lista curta que
    se declara incompleta.
    """
    for r in _com_a_pedido():
        d = _a_pedido(r)
        com = [z for z in d["zonas"] if z["circuitos"]]
        assert d["zonas_sem_circuitos"] == len(d["zonas"]) - len(com), r.id


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

    Há folhas que escrevem a coluna de sábado sem o zero à frente. Como `«9» > «1»`, a comparação em texto dava a primeira hora como
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
    listas não batiam pelo nome — o nome curto de uma zona no catálogo é, na
    brochura, o nome da vila seguido das freguesias que o circuito serve, e
    «Santo António» lá é «S.to António». Decidir pelo nome errava; o que
    decidiu foram as HORAS e as PARAGENS.

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

    vistas = 0
    for r in _com_a_pedido():
        com = [c for c in r.a_pedido.get("circuitos") or [] if c.get("horario_em")]
        construcao = construcao_de(r)
        if not com or not construcao.is_dir():
            continue
        vistas += 1
        quadros: dict[str, set[str]] = {}
        for f in sorted((construcao / "tap").glob("*.json")):
            d = json.loads(f.read_text(encoding="utf-8"))
            quadros[f"tap/{f.name}"] = {q.get("nome", "") for q in d.get("quadros") or []}

        for c in com:
            h = c["horario_em"]
            assert h["saida"] in quadros, (
                f"{r.id}: «{c['nome']}» aponta para {h['saida']}, que a construção não produz"
            )
            assert h["quadro"] in quadros[h["saida"]], (
                f"{r.id}: «{c['nome']}» aponta para o quadro «{h['quadro']}» de {h['saida']}, "
                f"que lá não está. Os que lá estão: {sorted(quadros[h['saida']])}"
            )
    if not vistas:
        pytest.skip("nenhuma região com horários no catálogo do a pedido está construída")


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

    for r in _com_a_pedido():
        sem_razao = [
            c["nome"]
            for c in r.a_pedido.get("circuitos") or []
            if c.get("horario_em")
            and ch(c["nome"]) != ch(c["horario_em"]["quadro"])
            and not str(c.get("prova") or "").strip()
        ]
        assert not sem_razao, (
            f"{r.id}: estes circuitos apontam para um quadro com OUTRO nome e não dizem "
            f"porquê: {sem_razao}"
        )
