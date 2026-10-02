"""`horarios-tabela` — um horário que quem gere o serviço entrega já em tabela.

O `horarios-manuais` existe para o papel: alguém lê uma folha e escreve o que
lá está, e um guarda confere cada hora contra o PDF de onde veio. Há horários
que não chegam em papel nenhum — a câmara que manda a folha de cálculo do seu
urbano, a autoridade que escreve os circuitos do transporte a pedido num
ficheiro —, e aí não há o que transcrever nem contra o que conferir: **a
tabela é a fonte**, e a proveniência dela vai no `data/sources.yaml` como a de
qualquer outra.

A forma da tabela é a mesma das transcrições, de propósito, e a saída também:
o sítio não distingue um horário lido de uma folha de um entregue em tabela,
e não tem de distinguir — para quem está na paragem é o mesmo horário. O que
muda é que aqui não se diz que alguém o transcreveu, porque ninguém o fez.

Duas coisas que a transcrição não tem:

- **uma fonte pode ser uma pasta de tabelas**, e a receita diz qual
  (`params.tabela`). Uma autoridade que entregue os circuitos de cada concelho
  numa folha tem uma fonte, não seis;
- **a tabela pode trazer as coordenadas** de cada paragem (`coordenadas:`,
  por nome). Um cartaz dá o nome e a hora, nunca o sítio, e por isso o leitor
  dos cartazes vai procurá-lo ao OpenStreetMap; quem entrega a tabela sabe
  onde fica o poste, e diz. A que não tiver coordenada fica nomeada como tal,
  e a página di-lo — não se põe no centro da vila.

É também o que deixa uma região INVENTADA ter horários de urbanos e de
transporte a pedido sem fingir um PDF: a região de demonstração declara-os
assim, e diz no registo de fontes que são inventados.
"""

from __future__ import annotations

import json
from typing import Any

import yaml

from ..regiao import Saida
from .base import Contexto, Resultado, verificar_esperado
from .horarios_manuais import _linha

nome = "horarios-tabela"


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    p = saida.params
    tabela = ctx.caminho_da_fonte(saida.fonte)
    if tabela.is_dir():
        qual = str(p.get("tabela") or "")
        if not qual:
            raise ValueError(
                f"a fonte {saida.fonte} é uma pasta de tabelas, e a receita não diz qual "
                "(`params.tabela`)"
            )
        tabela = tabela / qual
    d = yaml.safe_load(tabela.read_text(encoding="utf-8")) or {}
    if not d.get("circuitos"):
        raise ValueError(
            f"{ctx.caminho_curto(tabela)} não tem `circuitos:` — não há horário nenhum na tabela"
        )
    # Ninguém transcreveu nada: a tabela é o original. Os dois campos que uma
    # transcrição traz saem vazios, e a página não diz que houve transcrição.
    d = {**d, "transcrito_por": "", "transcrito_em": ""}

    linha = _linha(saida, d)
    coordenadas, sem = _coordenadas(d, saida.fonte)
    if coordenadas:
        linha["coordenadas"] = coordenadas
        linha["sem_coordenada"] = sem
    destino = ctx.caminho_de_saida(saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps(linha, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    paragens = {n for q in linha["quadros"] for n in q["paragens"]}
    viagens = sum(len(q["viagens"]) for q in linha["quadros"])
    verificar_esperado(ctx, saida, "viagens", viagens, p.get("esperado_viagens"))
    verificar_esperado(ctx, saida, "paragens", len(paragens), p.get("esperado_paragens"))
    return Resultado(
        contagens={
            f"{saida.fonte}.viagens": viagens,
            f"{saida.fonte}.paragens": len(paragens),
            f"{saida.fonte}.quadros": len(linha["quadros"]),
        },
        saidas={saida.saida or "": str(destino.relative_to(ctx.raiz))},
    )


def _coordenadas(d: dict[str, Any], fonte: str) -> tuple[dict[str, dict], list[str]]:
    """As coordenadas que a tabela traz, por nome — e as paragens que ficam sem.

    Na forma que o leitor dos cartazes escreve, para o sítio as ler da mesma
    maneira; a `fonte` de cada uma é a própria tabela.
    """
    dadas: dict[str, dict] = {}
    for circuito in d.get("circuitos") or []:
        for nome_paragem, par in (circuito.get("coordenadas") or {}).items():
            lat, lon = float(par[0]), float(par[1])
            dadas[str(nome_paragem)] = {"lat": lat, "lon": lon, "fonte": fonte}
    if not dadas:
        return {}, []
    todas = [
        str(item[0])
        for circuito in d.get("circuitos") or []
        for item in circuito.get("paragens") or []
    ]
    sem = sorted({n for n in todas if n not in dadas})
    return dadas, sem
