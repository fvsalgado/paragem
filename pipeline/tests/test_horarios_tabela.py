"""Um horário entregue já em tabela: sem papel por trás, e com o sítio de cada paragem.

Os testes não nomeiam a região: procuram, nesta raiz, as saídas que declaram o
leitor `horarios-tabela` e verificam a propriedade em cada uma — e saltam com
a razão escrita quando não houver nenhuma (CLAUDE.md §11.6).
"""

from __future__ import annotations

import json

import pytest

from conftest import RAIZ
from paragem.fontes import Registo
from paragem.leitores import GENERICOS, LEITORES, LEITORES_DE_HORARIO
from paragem.leitores.base import Contexto
from paragem.leitores.horarios_tabela import ler, nome
from paragem.regiao import carregar_todas
from paragem.relatorio import Relatorio

TABELAS = [(r, s) for r in carregar_todas(RAIZ) for s in r.saidas if s.leitor == "horarios-tabela"]


def test_o_leitor_esta_registado_como_generico_e_como_horario():
    assert nome in LEITORES
    assert nome in GENERICOS
    # Sem isto o horário constrói-se e não chega a página nenhuma.
    assert nome in LEITORES_DE_HORARIO


def _ler(regiao, saida, tmp_path):
    ctx = Contexto(
        regiao=regiao,
        registo=Registo.carregar(RAIZ),
        raiz=tmp_path,
        destino=tmp_path / "build",
        relatorio=Relatorio(regiao.id),
        descarregar=False,
    )
    ler(ctx, saida)
    return json.loads((tmp_path / "build" / str(saida.saida)).read_text(encoding="utf-8")), ctx


@pytest.mark.parametrize(
    "regiao,saida", TABELAS or [pytest.param(None, None, marks=pytest.mark.skip(
        reason="nenhuma região desta raiz declara o leitor horarios-tabela"))],
    ids=[f"{r.id}:{s.saida}" for r, s in TABELAS] or None,
)  # fmt: skip
def test_cada_tabela_sai_como_horario_sem_dizer_que_foi_transcrita(regiao, saida, tmp_path):
    """A tabela é a fonte: ninguém a transcreveu, e a página não o pode dizer."""
    d, ctx = _ler(regiao, saida, tmp_path)
    assert d["transcrito_por"] == "" and d["transcrito_em"] == ""
    assert d["quadros"] and all(q["paragens"] for q in d["quadros"])
    # O que a receita espera bate com o que saiu — sem lacunas de contagem.
    assert not [x for x in ctx.relatorio.lacunas if x.id.endswith(".contagem")]


@pytest.mark.parametrize(
    "regiao,saida", TABELAS or [pytest.param(None, None, marks=pytest.mark.skip(
        reason="nenhuma região desta raiz declara o leitor horarios-tabela"))],
    ids=[f"{r.id}:{s.saida}" for r, s in TABELAS] or None,
)  # fmt: skip
def test_as_coordenadas_da_tabela_ficam_e_as_que_faltam_ficam_nomeadas(regiao, saida, tmp_path):
    d, _ = _ler(regiao, saida, tmp_path)
    if "coordenadas" not in d:
        pytest.skip(f"{saida.saida}: a tabela não traz coordenadas")
    nomes = {n for q in d["quadros"] for n in q["paragens"]}
    assert set(d["coordenadas"]) | set(d["sem_coordenada"]) == nomes
    assert not set(d["coordenadas"]) & set(d["sem_coordenada"])
    for p in d["coordenadas"].values():
        assert regiao.caixa_de_recorte.contem(p["lat"], p["lon"])
