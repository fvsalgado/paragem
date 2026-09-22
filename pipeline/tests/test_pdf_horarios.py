"""O parser do PDF de horários, contra os números do CLAUDE.md §6.1.

Os números não são decoração: são o critério de aceitação da Fase 1. Se o
parser deixar de os produzir, é o parser que está errado até prova em
contrário — e a prova está no PDF, que está no repositório.

Os testes que não precisam do PDF usam texto escrito à mão com a forma exata do
documento, para correrem em milissegundos e falharem com a razão à vista.
"""

import subprocess
from pathlib import Path

import pytest

from paragem.leitores import pdf_horarios as pdf

PDF = Path("data/manual/medio-tejo/Oferta-RMTejo_Meio.pdf")


@pytest.fixture(scope="module")
def texto(raiz):
    caminho = raiz / PDF
    if not caminho.exists():
        pytest.skip(f"falta {PDF}")
    if not __import__("shutil").which("pdftotext"):
        pytest.skip("falta o pdftotext (poppler-utils)")
    r = subprocess.run(["pdftotext", "-layout", str(caminho), "-"], check=True, capture_output=True)
    return r.stdout.decode("utf-8", "replace")


@pytest.fixture(scope="module")
def doc(texto):
    return pdf.ler(texto)


# --- os números do §6.1 ----------------------------------------------------


def test_122_linhas(doc):
    assert len(doc.linhas) == 122


def test_230_blocos(doc):
    assert len(doc.blocos) == 230


def test_903_viagens(doc):
    assert len(pdf.viagens(doc)) == 903


def test_nenhuma_viagem_com_menos_de_2_paragens(doc):
    curtas = [v for v in pdf.viagens(doc) if len(v.paragens) < 2]
    assert curtas == []


def test_nenhuma_hora_a_recuar(doc):
    """Uma hora que recua é sempre erro nosso, nunca da fonte.

    Quando uma viagem atravessa a meia-noite, o GTFS escreve 24:20 e não 00:20 —
    tratá-la como 00:20 punha a chegada quinze horas antes da partida.
    """
    for v in pdf.viagens(doc):
        horas = [x for p in v.paragens for x in (p.chegada, p.partida)]
        assert horas == sorted(horas), f"{v.linha} {v.servico}"


def test_a_leitura_nao_deixa_avisos(doc):
    assert doc.avisos == []


def test_as_linhas_que_ocupam_varias_paginas(doc):
    """O §6.1 nomeia-as: 10, 1001, 1003, 1095 e 9343."""
    varias = {c for c, lin in doc.linhas.items() if len(lin.paginas) > 1}
    assert varias == {"10", "1001", "1003", "1095", "9343"}


def test_todos_os_pontos_tem_nome(doc):
    sem = [p for b in doc.blocos for p in b.pontos if not p.nome]
    assert sem == []


def test_as_paragens_com_chegada_e_partida_emparelham(doc):
    """`C hh:mm`, o nome sozinho, `P hh:mm` — e a marca pode vir seguida de «-»."""
    marcas = [p.marca for b in doc.blocos for p in b.pontos if p.marca]
    assert marcas.count("C") == marcas.count("P") == 14


def test_a_legenda_cobre_todos_os_servicos_usados(doc):
    """Cada `PERÍODO-DIAS` que aparece num bloco tem de estar na legenda.

    Um serviço sem legenda é um serviço cujo significado ninguém sabe — e
    projetá-lo em datas seria inventar.
    """
    usados = {s for b in doc.blocos for s in b.servicos}
    assert usados <= set(doc.legendas), sorted(usados - set(doc.legendas))


def test_o_rodape_diz_desde_quando(doc):
    assert "5 de dezembro de 2025" in (doc.em_vigor_desde or "")


# --- a forma do documento, sem precisar do PDF -----------------------------

BLOCO = """\
10 Abrantes - Tomar

               IDA                                     E    FE     E
               OUTBOUND                                U     U     U
               Abrantes (Terminal)                   13:45 16:30 17:00
               Escola Secundária Manuel Fernandes    13:47   -   17:02
               Abrantes (Hospital)                   13:51 16:33 17:06

               E-U | Escolar - Dias Úteis | School Days - Business Days
              Em vigor desde 5 de dezembro de 2025 | Valid from 5th December 2025
"""


def test_le_um_bloco_simples():
    d = pdf.ler(BLOCO)
    assert list(d.linhas) == ["10"]
    assert d.linhas["10"].nome == "Abrantes - Tomar"
    b = d.blocos[0]
    assert b.sentido == "ida"
    assert b.servicos == ["E-U", "FE-U", "E-U"]
    assert len(b.pontos) == 3
    assert b.pontos[1].horas == ["13:47", "-", "17:02"]


def test_o_traco_quer_dizer_que_nao_para():
    v = pdf.viagens(pdf.ler(BLOCO))
    meio = [x for x in v if x.coluna == 1][0]
    assert [p.nome for p in meio.paragens] == ["Abrantes (Terminal)", "Abrantes (Hospital)"]


def test_a_coluna_vem_da_posicao_e_nao_da_contagem():
    """Uma célula em branco (nem hora nem «-») não pode deslocar as seguintes.

    Contar tokens da esquerda para a direita desalinha o horário todo a partir
    do primeiro buraco — e um horário desalinhado é um horário errado que
    parece certo.
    """
    com_buraco = BLOCO.replace(
        "               Abrantes (Hospital)                   13:51 16:33 17:06",
        "               Abrantes (Hospital)                   13:51       17:06",
    )
    b = pdf.ler(com_buraco).blocos[0]
    assert b.pontos[2].horas == ["13:51", None, "17:06"]


def test_o_e_de_fins_de_semana_e_feriados_nao_e_o_codigo_E():
    """«FINS DE SEMANA E FERIADOS» tem um «E» que não é o período E.

    Lido como código, o bloco ganhava uma coluna fantasma e todas as horas
    escorregavam uma casa.
    """
    texto = BLOCO.replace("               IDA  ", "               FINS DE SEMANA E FERIADOS  ")
    texto = texto.replace("               OUTBOUND  ", "               NON-BUSINESS DAYS  ")
    b = pdf.ler(texto).blocos[0]
    assert b.periodos == ["E", "FE", "E"]
    assert b.dias == ["U", "U", "U"]


def test_horas_depois_da_meia_noite():
    texto = """\
99 Noite

               IDA                                       A
               OUTBOUND                                  U
               Primeira                                23:50
               Segunda                                 00:20
"""
    v = pdf.viagens(pdf.ler(texto))[0]
    assert [p.partida for p in v.paragens] == ["23:50:00", "24:20:00"]
