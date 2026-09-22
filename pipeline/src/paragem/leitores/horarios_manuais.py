"""`horarios-manuais` — um horário transcrito à mão de um documento publicado.

É o caminho que o CLAUDE.md §9 chama «introdução manual assistida», e existe
porque há folhas que nenhum leitor automático lê sem risco:

- a brochura de Constância escreve as horas com um traço nas paragens onde a
  viagem não passa, e os traços não assentam nas colunas — a grelha parte-se
  ao meio e uma viagem sai em dois pedaços;
- a das Praias Fluviais tem TRÊS circuitos empilhados na mesma grelha, sem
  cabeçalho entre eles: lida como uma, dá uma viagem que vai à praia, volta,
  e vai a outra praia;
- o folheto do LINK não é um horário de paragens: é uma tabela de PARTIDAS por
  cidade, seis por dia, e forçá-la à forma de um percurso era dizer que um
  autocarro passa por catorze cidades seguidas.

Nestes casos alguém lê o papel e escreve o que lá está. O que torna isto
defensável — e não «o Claude escreveu umas horas» — é o GUARDA:

**Cada hora e cada nome transcritos têm de aparecer no PDF de origem.** A
verificação corre em todas as construções, contra o ficheiro declarado em
`data/sources.yaml` com a soma sha256. Um dígito trocado na transcrição não
passa; um PDF substituído na origem também não.

O que o guarda NÃO pode provar é que a hora está na paragem certa. Isso mede-se
com os olhos, uma vez, por quem transcreve — e é por isso que o ficheiro
transcrito diz quem o fez e quando.
"""

from __future__ import annotations

import json
import re
import subprocess
import unicodedata
from pathlib import Path
from typing import Any

import yaml

from ..regiao import Saida
from .base import Contexto, Resultado, verificar_esperado

nome = "horarios-manuais"


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    p = saida.params
    transcricao = ctx.caminho_de_dados(str(p.get("transcricao", "")))
    if not transcricao.exists():
        raise ValueError(f"falta a transcrição {transcricao}")
    d = yaml.safe_load(transcricao.read_text(encoding="utf-8")) or {}

    original = _texto(ctx.caminho_da_fonte(saida.fonte))
    faltam = _conferir(d, original)
    if faltam:
        ctx.relatorio.bloqueia(
            id=f"transcricao.{saida.fonte}",
            o_que=f"A transcrição de {p.get('linha', saida.fonte)} não bate com o original",
            onde=ctx.caminho_curto(transcricao),
            porque_importa=(
                "Estes valores estão no ficheiro transcrito e NÃO estão no PDF de onde "
                "ele diz vir. Ou alguém se enganou a transcrever, ou a origem publicou "
                "outra coisa. Em qualquer dos casos é uma hora inventada a caminho da "
                "interface, e o CLAUDE.md §4.4 não o permite."
            ),
            o_que_fazer="Conferir a transcrição contra o PDF, valor a valor.",
            quantos=len(faltam),
            quais=faltam[:20],
        )
        return Resultado(contagens={f"{saida.fonte}.transcricao_com_erros": len(faltam)})

    linha = _linha(saida, d)
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


# ---------------------------------------------------------------------------
# o guarda
# ---------------------------------------------------------------------------

_HORA = re.compile(r"^([0-2]?\d):([0-5]\d)$")


def _texto(pdf: Path) -> str:
    return subprocess.run(
        ["pdftotext", "-layout", str(pdf), "-"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout


def _simples(s: str) -> str:
    """O texto reduzido ao que o guarda compara: letras, dígitos e dois-pontos.

    **NFKD e não NFD**, e a diferença custou uma transcrição correta recusada.
    A brochura de Abrantes escreve «Saída Cruciﬁxo» com a LIGADURA tipográfica
    `ﬁ` — um caractere só, que o PDF guarda como tal. Em NFD a ligadura não se
    desfaz, e «Crucifixo» escrito com as duas letras não aparecia no original.

    Um guarda que recusa a grafia certa não protege nada: ensina quem
    transcreve a escrever o que lhe agrada em vez do que está no papel, e a
    partir daí deixa de se saber o que a fonte dizia. O NFKD desfaz as
    ligaduras, as aspas curvas e os espaços que não são espaços, que é
    exatamente a diferença entre como um PDF escreve e como uma pessoa
    escreve.
    """
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9:]", "", s)


def _conferir(d: dict[str, Any], original: str) -> list[str]:
    """Tudo o que está na transcrição e não está no PDF.

    Compara sem espaços nem acentos, de propósito: a brochura de Constância
    escreve «1 7:19» e «Centro de Saú de», partidos a meio pelo PDF. O que se
    quer apanhar é um dígito trocado, não um espaço a mais.
    """
    cru = _simples(original)
    faltam: list[str] = []
    for circuito in d.get("circuitos") or []:
        for item in circuito.get("paragens") or []:
            nome_paragem, horas = item[0], item[1]
            if _simples(nome_paragem) not in cru:
                faltam.append(f"paragem «{nome_paragem}»")
            for h in horas:
                if h and _simples(h) not in cru:
                    faltam.append(f"{nome_paragem} às {h}")
    return faltam


# ---------------------------------------------------------------------------
# a saída, na mesma forma que a dos cartazes
# ---------------------------------------------------------------------------


def _minutos(hora: str) -> int:
    """A hora em minutos desde a meia-noite, para se poder comparar.

    Aceita «9:50» e «09:50», que é a mesma hora escrita de duas maneiras — e
    as folhas desta região escrevem-na das duas, às vezes na mesma página.
    O que não reconhecer fica em -1, que nunca é maior do que nada: na dúvida,
    a viagem não se inverte.
    """
    m = _HORA.match(hora.strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else -1


def _linha(saida: Saida, d: dict[str, Any]) -> dict[str, Any]:
    p = saida.params
    quadros = []
    for circuito in d.get("circuitos") or []:
        paragens = [item[0] for item in circuito.get("paragens") or []]
        horas = [item[1] for item in circuito.get("paragens") or []]
        colunas = circuito.get("colunas") or []
        viagens = []
        # UMA TABELA DE PARTIDAS NÃO É UM PERCURSO.
        #
        # O folheto do LINK lista, para cada cidade, as seis horas a que se
        # pode partir dela. Ler cada coluna como uma viagem dava um autocarro
        # que passa por catorze cidades seguidas, e não existe tal autocarro.
        # Aqui não se constrói viagem nenhuma: a grelha é o que é, e a página
        # diz o que é.
        partidas = circuito.get("tipo") == "partidas"
        for j, rotulo in enumerate([] if partidas else colunas):
            passagens = [
                [paragens[i], horas[i][j]]
                for i in range(len(paragens))
                if j < len(horas[i]) and horas[i][j]
            ]
            # A VOLTA percorre a lista ao contrário, como nos cartazes: a hora
            # desce pela folha abaixo porque a primeira paragem da ida é a
            # última da volta. Invertida, a viagem fica na ordem em que se anda.
            #
            # **EM MINUTOS, E NÃO EM TEXTO.** Uma transcrição escreve a hora
            # como o papel a escreve, e as folhas de Ferreira do Zêzere
            # escrevem a coluna de sábado sem o zero à frente: «9:50», «10:00».
            # Comparadas como texto, «9:50» > «10:30» — porque «9» > «1» — e a
            # ida do sábado saía ao contrário, a chegar às 10:30 e a partir às
            # 9:50. Uma viagem que acaba antes de começar.
            #
            # Os leitores de PDF não davam por isto porque normalizam a hora
            # para «HH:MM» ao lê-la do papel. Aqui não se normaliza de
            # propósito — o que se mostra é o que a folha diz —, e por isso a
            # ordem tem de ser decidida pelo valor e não pela grafia.
            if len(passagens) >= 2 and _minutos(passagens[0][1]) > _minutos(passagens[-1][1]):
                passagens.reverse()
            if len(passagens) >= 2:
                viagens.append({"rotulo": rotulo, "passagens": passagens})
        quadros.append(
            {
                "paragens": paragens,
                "rotulos": list(colunas),
                "viagens": viagens,
                "nome": circuito.get("nome", ""),
                "regras": circuito.get("regras") or [],
                "tipo": circuito.get("tipo", "percurso"),
                # Numa tabela de partidas a grelha é a informação, e não as
                # viagens: a página mostra-a, e não promete percurso nenhum.
                "horas": horas if partidas else [],
            }
        )
    return {
        "id": p.get("id", saida.fonte),
        "nome": p.get("linha", saida.fonte),
        "operador": p.get("operador", ""),
        "rede": p.get("rede", ""),
        "cor": p.get("cor", ""),
        "modo": saida.modo or "a-pedido",
        "regras": d.get("regras") or [],
        "transcrito_por": d.get("transcrito_por", ""),
        "transcrito_em": str(d.get("transcrito_em", "")),
        "quadros": quadros,
    }
