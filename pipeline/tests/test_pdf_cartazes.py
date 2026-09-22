"""O leitor dos cartazes de horários das câmaras, contra os cinco desta região.

Os números aqui são MEDIDOS nos ficheiros de `data/manual/`, não estimados. É
o mesmo contrato do §6.1 para o PDF da concessão: se um deles mudar sem o
ficheiro mudar, alguém partiu a leitura — e um horário desalinhado é um
horário errado que parece certo.

Os cinco cartazes trazem, entre eles, as quatro armadilhas que o módulo
descreve: quadros lado a lado (Vermelha), um nome separado das horas (Azul),
quadros empilhados nas mesmas colunas (TURE) e colunas com dias diferentes na
mesma grelha (TURE, outra vez).
"""

from __future__ import annotations

import inspect
import json
import subprocess
import tempfile
from pathlib import Path

import pytest

from paragem.leitores import horarios_manuais as manuais
from paragem.leitores import horarios_pdf_cartaz as horarios
from paragem.leitores import pdf_cartazes as cartazes

RAIZ = Path(__file__).resolve().parents[2]
MANUAL = RAIZ / "data" / "manual" / "medio-tejo"

# Os parâmetros com que a região lê o desdobrável do TURE. Estão aqui
# repetidos de propósito: o teste tem de falhar se o `fontes.yaml` mudar sem
# alguém medir outra vez.
TURE = {
    "numera_paragens": True,
    "quebra_de_quadro": r"CARREIRA\s+\d",
    "rotulo_de_coluna": r"DIAS ÚTEIS|SÁBADOS|HORÁRIOS ESPECIAIS",
    "vao_entre_quadros": 40.0,
}


def _ler(nome: str, **kw):
    caminho = MANUAL / f"{nome}.pdf"
    if not caminho.exists():  # pragma: no cover — só num repositório sem os PDF
        pytest.skip(f"falta {caminho}")
    with tempfile.TemporaryDirectory() as pasta:
        saida = Path(pasta) / "cartaz.xml"
        subprocess.run(
            ["pdftotext", "-bbox-layout", str(caminho), str(saida)],
            capture_output=True,
            check=True,
        )
        return cartazes.ler(saida.read_text(encoding="utf-8"), **kw)


# ---------------------------------------------------------------------------
# os números
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("nome", "quadros", "paragens", "viagens"),
    [
        ("tut-linha-azul", 1, [47], 26),
        ("tut-linha-vermelha", 2, [49, 49], 24),
        ("tut-linha-verde", 1, [53], 10),
        ("tut-linha-verde-express", 1, [12], 13),
    ],
)
def test_os_quatro_cartazes_dos_tut_dao_os_numeros_medidos(nome, quadros, paragens, viagens):
    c = _ler(nome)
    assert [len(q.paragens) for q in c.quadros] == paragens
    assert len(c.quadros) == quadros
    assert len(cartazes.viagens(c)) == viagens


def test_nenhuma_viagem_recua_no_tempo():
    """Uma viagem que chega antes de partir é uma coluna mal lida.

    É a mesma verificação do §6.1, e é a que apanha o desalinhamento: um
    horário lido pela ordem errada dá horas a descer a meio.

    O cartaz do TURE é o único que passa da meia-noite? Não passa — nenhum
    destes urbanos circula depois das 20h30. Por isso aqui uma hora a recuar é
    sempre defeito, e não uma viagem que atravessa o dia.
    """
    for nome in (
        "tut-linha-azul",
        "tut-linha-vermelha",
        "tut-linha-verde",
        "tut-linha-verde-express",
    ):
        for v in cartazes.viagens(_ler(nome)):
            horas = [p.hora for p in v.passagens]
            assert horas == sorted(horas), f"{nome}: viagem a recuar — {horas[:6]}"


def test_nenhuma_viagem_tem_menos_de_duas_paragens():
    """Uma coluna com uma paragem só não é uma viagem: é um resto de leitura."""
    for nome in ("tut-linha-azul", "tut-linha-verde"):
        for v in cartazes.viagens(_ler(nome)):
            assert len(v.passagens) >= 2


# ---------------------------------------------------------------------------
# as quatro armadilhas
# ---------------------------------------------------------------------------


def test_a_linha_vermelha_tem_dois_quadros_e_o_segundo_e_de_terca_feira():
    """Dia de mercado em Torres Novas, com oferta diferente.

    Lidos como um só quadro, os dois horários juntavam-se numa grelha de 24
    colunas em que metade das viagens não existe nos dias em que a outra
    metade circula.
    """
    c = _ler("tut-linha-vermelha")
    assert len(c.quadros) == 2
    assert c.quadros[0].viagens == 11
    assert c.quadros[1].viagens == 13
    # Os dois começam na mesma paragem: é a mesma linha, horários diferentes.
    assert c.quadros[0].paragens[0] == c.quadros[1].paragens[0] == "Bairro da Cabrita"


def test_a_linha_azul_recupera_o_nome_que_o_titulo_separou():
    """Nenhuma linha de horário fica sem paragem.

    O título «linha azul», desenhado por cima da grelha, empurra o nome de uma
    paragem para outra altura da página. Sem o emparelhamento ficava uma linha
    de 26 horas sem paragem nenhuma — 26 horas que ninguém saberia onde são.
    """
    c = _ler("tut-linha-azul")
    q = c.quadros[0]
    assert q.sem_nome == 0
    assert all(p for p in q.paragens)


def test_a_paragem_com_horario_proprio_fica_de_fora_e_nomeada():
    """«R. de Santo António» é servida de 15 em 15 numa linha de 30 em 30.

    As 26 colunas dela assentam nas da grelha — mesmo passo, mesmos x — mas os
    valores não são os daquelas viagens: na segunda coluna a paragem seguinte
    marca 08:08 e esta marca 07:52. Encaixá-la dava a 25 viagens uma hora que
    não é a delas.

    Fica de fora, e fica NOMEADA. A diferença importa: uma paragem que
    desaparece em silêncio não se conserta, e esta sabe-se que falta e
    sabe-se qual é.
    """
    q = _ler("tut-linha-azul").quadros[0]
    assert q.desalinhadas == ["R. de Santo António"]
    assert "R. de Santo António" not in q.paragens


def test_as_carreiras_do_ture_nao_se_colam_numa_so():
    """Cada carreira é um quadro, mesmo ocupando as mesmas colunas.

    São cinco carreiras empilhadas na mesma folha, alinhadas nos mesmos x.
    Pela posição são indistinguíveis; o que as separa é o cabeçalho pelo meio.
    Sem a quebra, as duas da Linha Azul saíam coladas numa grelha do dobro do
    percurso, com viagens que começam no horário de uma e acabam no da outra.
    """
    c = _ler("ture-horarios", **TURE)
    assert len(c.quadros) >= 5
    assert c.quadros[0].paragens[-1] == c.quadros[1].paragens[0] == "CEMITÉRIO"


def test_o_ture_sabe_que_colunas_sao_de_sabado():
    """Os sábados estão na mesma grelha dos dias úteis, à direita.

    Sem os rótulos, as viagens de sábado da Linha Azul saíam como se
    circulassem todos os dias — e alguém ia esperar por elas a uma terça.
    """
    q = _ler("ture-horarios", **TURE).quadros[0]
    # Há colunas sem rótulo nenhum, e ficam vazias em vez de herdarem um: um
    # dia herdado é um dia inventado.
    assert set(q.rotulos) - {""} == {"DIAS ÚTEIS", "SÁBADOS"}
    # E os sábados são as ÚLTIMAS colunas, não as primeiras: o cartaz escreve
    # os dias úteis à esquerda.
    assert q.rotulos[-1] == "SÁBADOS"
    rotulados = [r for r in q.rotulos if r]
    assert rotulados[0] == "DIAS ÚTEIS"


def test_as_horas_fora_de_ordem_do_ture_sao_gralhas_do_cartaz():
    """A MEDIÇÃO QUE DESBLOQUEOU CINCO CARREIRAS DO ENTRONCAMENTO.

    Quatro viagens deste desdobrável saem com horas a recuar, e durante um
    tempo isso foi dado como «colunas lidas na paragem errada» — o que manda
    recusar o cartaz inteiro (§4.4: uma hora errada é pior do que uma hora em
    falta). Com esse juízo, o TURE não teve horário nenhum publicado.

    O juízo estava errado, e é isto que o mostra. Na carreira 2 da Linha
    Azul, NA MESMA COLUNA, três paragens seguidas imprimem 08:04, 08:35 e
    08:06 — e na coluna a seguir imprimem 08:35, 08:36 e 08:37. Se a grelha
    estivesse desalinhada, a coluna seguinte também estaria; está alinhada ao
    minuto. O que a folha tem é um 08:35 escrito onde devia estar 08:05.

    Este teste é a prova, escrita em código, para não voltar a ser uma
    opinião. Se um dia falhar, ou a folha foi corrigida — e aí atualiza-se —
    ou a leitura mudou, e aí o cartaz volta a merecer desconfiança.
    """
    c = _ler("ture-horarios", **TURE)
    trio = ["ESCOLA ANTÓNIO GEDEÃO", "ESCOLA EB 2/3 DR. RUY D'ANDRADE", "COFERPOR"]
    # O quadro da CARREIRA 2, onde as três são seguidas e por esta ordem. Na
    # carreira 1 as mesmas três aparecem noutra ordem, porque é a volta.
    q = next(
        x
        for x in c.quadros
        if all(n in x.paragens for n in trio)
        and [x.paragens.index(n) for n in trio]
        == list(range(x.paragens.index(trio[0]), x.paragens.index(trio[0]) + 3))
    )
    linhas = [q.horas[q.paragens.index(n)] for n in trio]

    coluna = next(j for j, h in enumerate(linhas[0]) if h == "08:04")
    assert [linha[coluna] for linha in linhas] == ["08:04", "08:35", "08:06"]
    # E A COLUNA SEGUINTE ESTÁ CERTA. É este par que distingue uma gralha de
    # uma grelha torta: uma grelha torta erra nas duas.
    assert [linha[coluna + 1] for linha in linhas] == ["08:35", "08:36", "08:37"]


def test_cada_viagem_a_recuar_do_ture_tem_UMA_hora_a_mais():
    """Uma gralha tira uma hora; uma leitura errada tira metade da viagem.

    É a diferença que o `tolera_gralhas` da região precisa que seja verdade —
    e por isso mede-se aqui, e não se assume. As quatro viagens do TURE
    perdem uma passagem cada; a viagem mais curta das quatro tem 17.
    """
    viagens = cartazes.viagens(_ler("ture-horarios", **TURE))
    recuam = [
        v for v in viagens if [p.hora for p in v.passagens] != sorted(p.hora for p in v.passagens)
    ]
    assert len(recuam) == 4
    for v in recuam:
        horas = [p.hora for p in v.passagens]
        salvas = len(horarios._mais_longa_nao_decrescente(horas))
        assert len(horas) - salvas == 1, f"a viagem das {horas[0]} perde {len(horas) - salvas}"


def test_os_cartazes_sem_rotulos_nao_inventam_nenhum():
    """Os dos TUT não rotulam as colunas, e a leitura não lhes põe um dia.

    A regra deles está no rodapé, em prosa — «Sábados, exceto feriados, até às
    13h58m» —, e é dali que sai, não de um valor por omissão.
    """
    for nome in ("tut-linha-azul", "tut-linha-verde"):
        for q in _ler(nome).quadros:
            assert q.rotulos == []


# ---------------------------------------------------------------------------
# as regras de serviço
# ---------------------------------------------------------------------------


def test_as_regras_do_rodape_vao_como_estao_escritas():
    """Quem escreveu «exceto terças-feiras» sabe melhor do que nós o que quis dizer.

    A Linha Verde é a única das quatro com essa regra, e é a diferença entre
    quem apanha o autocarro e quem fica na paragem numa terça.
    """
    notas = _ler("tut-linha-verde").notas
    assert any("terças-feiras" in n for n in notas)
    assert any("Sábados" in n for n in notas)


def test_o_rodape_nao_entra_como_paragem():
    """O aviso do rodapé começa por maiúscula e tem tamanho de nome comprido.

    Sem o filtro, era candidato a nome de paragem — e, sendo dois candidatos,
    deixava de haver ligação única e a Linha Azul perdia uma paragem.
    """
    for q in _ler("tut-linha-azul").quadros:
        assert not any("Sábados" in p for p in q.paragens)


# ---------------------------------------------------------------------------
# as brochuras do transporte a pedido
# ---------------------------------------------------------------------------

# Os parâmetros com que a região lê cada brochura. Foram MEDIDOS: correu-se
# cada combinação e ficou a que lê o documento inteiro sem uma única hora a
# recuar. Estão aqui repetidos de propósito — o teste tem de falhar se o
# `fontes.yaml` mudar sem alguém medir outra vez.
TAP_ROT = r"DIAS ÚTEIS|SÁBADOS|DOMINGOS|FERIADOS|IDA|VOLTA"
TAP = {
    "abrantes": (True, 15.0, 2, 7, 157, 18),
    "abrantes-mouriscas": (True, 15.0, 2, 1, 22, 2),
    "alcanena": (True, 15.0, 2, 4, 52, 16),
    "fzz-laranja": (True, 30.0, 2, 1, 14, 6),
    "fzz-lilas": (True, 30.0, 2, 1, 30, 6),
    "fzz-verde": (True, 30.0, 2, 1, 26, 6),
    "fzz-vermelho": (True, 30.0, 2, 1, 20, 6),
    "macao": (True, 60.0, 2, 3, 14, 26),
    "ourem": (False, 60.0, 3, 3, 121, 12),
    "sardoal": (False, 30.0, 2, 3, 49, 14),
    "serta": (True, 30.0, 3, 1, 22, 4),
    "torres-novas": (True, 15.0, 2, 6, 111, 12),
    "vnb": (True, 60.0, 3, 1, 27, 6),
}


def _ler_tap(nome: str):
    direita, vao, minimo, *_ = TAP[nome]
    caminho = MANUAL / "tap" / f"{nome}.pdf"
    if not caminho.exists():  # pragma: no cover
        pytest.skip(f"falta {caminho}")
    with tempfile.TemporaryDirectory() as pasta:
        saida = Path(pasta) / "cartaz.xml"
        subprocess.run(
            ["pdftotext", "-bbox-layout", str(caminho), str(saida)],
            capture_output=True,
            check=True,
        )
        return cartazes.ler(
            saida.read_text(encoding="utf-8"),
            rotulo_de_coluna=TAP_ROT,
            nome_a_direita=direita,
            vao_entre_quadros=vao,
            minimo_para_abrir=minimo,
        )


@pytest.mark.parametrize("nome", sorted(TAP))
def test_as_brochuras_do_a_pedido_dao_os_numeros_medidos(nome):
    *_, quadros, paragens, viagens = TAP[nome]
    c = _ler_tap(nome)
    assert len(c.quadros) == quadros
    assert len({n for q in c.quadros for n in q.paragens}) == paragens
    assert len(cartazes.viagens(c)) == viagens


@pytest.mark.parametrize("nome", sorted(TAP))
def test_nenhuma_viagem_a_pedido_recua_no_tempo(nome):
    """É a condição para a brochura se publicar, e vale para as treze.

    Uma hora a recuar é uma coluna lida na paragem errada. Numa brochura onde
    metade das colunas se lê de baixo para cima, é também a verificação de que
    a direção foi bem decidida: uma coluna de VOLTA tomada por IDA sai com o
    tempo todo ao contrário.
    """
    for v in cartazes.viagens(_ler_tap(nome)):
        horas = [p.hora for p in v.passagens]
        assert horas == sorted(horas), f"{nome}: {horas[:4]}"


def test_a_volta_le_se_de_baixo_para_cima():
    """Metade das colunas destas brochuras desce, e não é defeito.

    A lista de paragens é a da IDA; a VOLTA percorre-a ao contrário, e por
    isso as horas dela descem pela folha abaixo. Lida como se subisse, a
    viagem saía com a última paragem primeiro — e quem a lesse ia esperar o
    autocarro na ponta errada do percurso.
    """
    q = _ler_tap("fzz-vermelho").quadros[0]
    assert q.descendentes == [False, True, False, True, False, True]
    assert q.rotulos[0].endswith("IDA")
    assert q.rotulos[1].endswith("VOLTA")

    # E a viagem de volta sai na ordem em que se anda.
    ida, volta = cartazes.viagens(_ler_tap("fzz-vermelho"))[:2]
    assert ida.passagens[0].paragem == q.paragens[0]
    assert volta.passagens[0].paragem == q.paragens[-1]


def test_os_nomes_nao_levam_o_enfeite_do_cartaz():
    """O «▶» marca a paragem na lista; não faz parte do nome.

    Deixá-lo lá dava «▶ Alagoa» na interface, na procura e no dia em que estes
    nomes forem casados com coordenadas.
    """
    for nome in ("abrantes", "torres-novas", "vnb"):
        for q in _ler_tap(nome).quadros:
            assert not any(p.startswith("▶") or p.startswith("►") for p in q.paragens)


def test_um_livro_de_circuitos_nao_mistura_paginas():
    """Cada página do livro de Abrantes é um circuito, com a sua lista.

    Sem o corte por página, as palavras de oito páginas sobrepunham-se — a
    linha a 473 pontos da página 2 e a da página 3 são linhas diferentes — e
    saíam paragens chamadas «às às às». Com o corte, saem sete circuitos.
    """
    c = _ler_tap("abrantes")
    assert len(c.quadros) == 7
    # Cada circuito começa numa paragem diferente: são sete percursos, não um
    # partido em sete.
    primeiras = [q.paragens[0] for q in c.quadros]
    assert len(set(primeiras)) >= 6


def test_a_receita_da_regiao_chega_toda_ao_leitor():
    """Um parâmetro que o `pdf_cartazes` aceita tem de ter caminho desde o YAML.

    Isto não é zelo: aconteceu duas vezes. O `nome_a_direita` e depois o
    `excluir_linhas` estavam declarados na receita do Médio Tejo e o leitor
    nunca os passava. Não rebenta nada — o cartaz lê-se com a afinação por
    omissão e sai um horário errado com ar de certo. De Vila de Rei saíram
    oito viagens a recuar, porque o painel das ligações intermunicipais
    continuava a entrar na grelha.

    Uma afinação nova no `pdf_cartazes.ler` falha aqui, e não num relatório
    meses depois.
    """
    from paragem.leitores import horarios_pdf_cartaz as plugin

    aceites = set(inspect.signature(cartazes.ler).parameters) - {"xml"}
    assert aceites == set(plugin.AFINACOES), (
        "o leitor de cartazes aceita afinações que a receita da região não "
        "consegue dar (ou o contrário)"
    )


def test_uma_afinacao_ausente_fica_com_a_omissao():
    """A receita só diz o que é diferente; o resto está escrito uma vez só."""
    from paragem.leitores import horarios_pdf_cartaz as plugin

    assert plugin._afinacao({}) == {}
    assert plugin._afinacao({"vao_entre_quadros": 15, "excluir_linhas": r"-feira\b"}) == {
        "vao_entre_quadros": 15.0,
        "excluir_linhas": r"-feira\b",
    }


# --- o que uma folha DESENHADA faz a quem a lê de margem a margem ----------

REGRAS_DO_TURE = [
    "(1) - REALIZA-SE APENAS NO PERÍODO ESCOLAR",
    "(2) - TERMINA NA ESTAÇÃO/CP",
    "(3) - ATÉ SAIREM TODOS OS PASSAGEIROS",
]


def test_uma_regra_de_servico_nao_sao_duas_caixas_coladas():
    """Metade do defeito que chegou a uma página pública.

    O desdobrável do TURE tem o preçário numa caixa e os locais de venda
    noutra, lado a lado. Lidas de margem a margem, davam «regras de serviço»
    como estas, publicadas como regras de uma carreira de autocarro:

        preencher um formulário SERVIÇOS SOCIAIS 3.ª Feira a Sábado
        a partir dos 30 anos de 1h para transbordo. cm-entroncamento.pt …

    Cada uma é meia frase de uma caixa colada a meia frase da outra. Partir a
    linha nos vãos acaba com isso — e é SÓ isso que este teste prova.

    O que a leitura automática não consegue, numa folha desenhada assim, é
    distinguir uma caixa que é regra de uma que não é: «SERVIÇOS SOCIAIS 3.ª
    Feira a Sábado» está toda dentro da mesma caixa e continua a sair daqui.
    Para isso existe o outro mecanismo — as regras declaradas na receita, com
    guarda contra o PDF — e é o teste a seguir que o cobre.
    """
    notas = _ler("ture-horarios", **TURE).notas
    for colada in ("preencher um formulário", "cm-entroncamento.pt", "para transbordo"):
        assert not any(colada in n for n in notas), f"«{colada}» é de outra caixa da folha"


def test_as_regras_declaradas_do_ture_estao_mesmo_no_cartaz():
    """O guarda que torna uma regra declarada defensável.

    As regras deste cartaz vêm da receita da região, porque o extrator não as
    apanha numa folha desenhada assim. Isso só não é «alguém escreveu o que
    quis» porque cada uma é conferida contra o texto do PDF — e é essa
    comparação que aqui se prova, incluindo o caso em que falha.
    """
    caminho = MANUAL / "ture-horarios.pdf"
    if not caminho.exists():  # pragma: no cover — só num repositório sem os PDF
        pytest.skip(f"falta {caminho}")

    # E O QUE SE PUBLICA são estas, e não o que o extrator apanhou.
    construido = RAIZ / "build" / "medio-tejo" / "urbanos" / "ture.json"
    if construido.exists():
        d = json.loads(construido.read_text(encoding="utf-8"))
        assert d["regras"] == REGRAS_DO_TURE
        for proibida in ("SERVIÇOS SOCIAIS", "Tarifas em vigor"):
            assert not any(proibida in r for r in d["regras"])

    cru = manuais._simples(manuais._texto(caminho))
    for regra in REGRAS_DO_TURE:
        assert manuais._simples(regra) in cru, regra
    # E uma regra plausível que o cartaz NÃO tem é apanhada.
    assert manuais._simples("(4) - SÓ CIRCULA ÀS TERÇAS-FEIRAS") not in cru


def test_cada_grelha_do_ture_sabe_de_que_carreira_e():
    """Cinco carreiras numa folha, e cada grelha com o nome da sua.

    Sem isto eram seis grelhas anónimas debaixo de um título «TURE», e quem
    procurasse a Linha Verde do Entroncamento tinha de as abrir uma a uma.

    E os títulos vêm POR POSIÇÃO: as carreiras 3 e 4 estão lado a lado na
    folha, com os cabeçalhos na mesma linha de texto. Lidos de margem a
    margem, as duas grelhas ficavam com «CARREIRA 3 LINHA VERDE … CARREIRA 4
    LINHA VERMELHA» em cima — o mesmo tropeço das regras de serviço.
    """
    titulos = [q.titulo for q in _ler("ture-horarios", **TURE).quadros]
    assert titulos[:5] == [
        "CARREIRA 1 LINHA AZUL",
        "CARREIRA 2 LINHA AZUL",
        "CARREIRA 3 LINHA VERDE",
        "CARREIRA 4 LINHA VERMELHA",
        "CARREIRA 5 LINHA RÁPIDA AMARELA",
    ]
    # Os dias e as chamadas de rodapé não entram no nome: os dias já vão nos
    # rótulos das colunas, que é onde o cartaz os põe.
    assert not any("(1)" in t or "DIAS ÚTEIS" in t for t in titulos)
