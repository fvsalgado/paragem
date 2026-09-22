"""O transporte a pedido, das brochuras a um feed que uma máquina lê.

O QUE É DIFERENTE AQUI, E PORQUÊ ISTO NÃO É O MESMO QUE A REDE REGULAR
======================================================================

Um circuito a pedido **não circula se ninguém o chamar**. A hora da brochura
não é uma promessa: é a hora a que passa *se* alguém tiver reservado até à
véspera. Um feed que escreva estas horas como escreve as de uma carreira está
a mentir a quem o ler — e quem o lê, hoje, é um planeador de viagens que vai
mandar alguém para a berma.

O GTFS tem a resposta desde 2023: o **GTFS-Flex**. Cada passagem leva
`pickup_type=2` e `drop_off_type=2` («é preciso telefonar para o operador») e
aponta para uma REGRA DE RESERVA (`booking_rules.txt`) que diz até quando, por
que telefone e em que sítio. É isso que este módulo constrói.

AS TRÊS PERGUNTAS QUE ISTO RESPONDE
-----------------------------------

1. **Que circuito é este quadro?** A brochura de cada concelho dá quadros com
   um nome («Circuito do Amioso»); o levantamento de paragens da autoridade dá
   circuitos com um código (`SRT01`) e os dias em que andam. Ligam-se pelo
   nome, com as exceções declaradas na região — e são exceções a sério: três
   quadros da mesma brochura são três RAMOS do mesmo circuito, e um quadro
   pode não ter circuito nenhum no levantamento.

2. **Que paragem é este nome?** O mesmo problema da rede regular, com uma
   diferença que facilita: aqui os candidatos são as paragens DO CIRCUITO, que
   são vinte e não duas mil. As regras estão em `_decidir`, por ordem de
   confiança, e por cima de todas está a tabela de decisões manuais — entrada
   humana, que o pipeline lê e nunca escreve.

3. **Em que dias anda?** O levantamento dá uma coluna por dia da semana, em
   período escolar e em férias; o rótulo da coluna da brochura diz a qual dos
   dois se refere. O calendário da região transforma isso em datas.

O que não se resolve fica escrito e fora do feed: uma paragem sem coordenada
não entra numa viagem, e uma viagem com menos de duas paragens não entra no
feed. Nunca se inventa um ponto (CLAUDE.md §4.4).

**E uma paragem pode não ser um ponto.** O GTFS-Flex também sabe dizer «apanha-
se em qualquer sítio desta zona», com um polígono em `locations.geojson`. Aqui
não há nenhuma: todos os nomes das brochuras desta região acabaram num ponto, e
inventar uma zona à volta de uma povoação para os que faltassem seria pior do
que dizer que faltam.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from .geo import metros
from .nomes import sim

# --- o que entra -----------------------------------------------------------


@dataclass(frozen=True)
class Circuito:
    """Um circuito do levantamento: o serviço, e os dias em que anda."""

    id: str
    nome: str
    concelho: str
    horario: str
    #: segunda a sexta e sábado, em período escolar e em férias escolares.
    dias_escolar: tuple[bool, ...]
    dias_ferias: tuple[bool, ...]
    paragens: tuple[str, ...]
    #: Os códigos do calendário, quando a região os declara em vez dos dias.
    #: É o caso de um circuito que o levantamento não tem — um que só ande em
    #: fins de semana de verão, por exemplo — e que a região descreve como
    #: descreve os da rede regular.
    codigos: tuple[str, ...] = ()


@dataclass
class Quadro:
    """Um quadro de horário de uma brochura, como o leitor a transcreveu."""

    ficheiro: str
    nome: str
    tipo: str
    paragens: list[str] = field(default_factory=list)
    viagens: list[dict[str, Any]] = field(default_factory=list)
    rotulos: list[str] = field(default_factory=list)
    regras: list[str] = field(default_factory=list)
    horas: list[list[str]] = field(default_factory=list)


@dataclass(frozen=True)
class Decisao:
    """Que paragem é um nome da brochura — e como é que se soube."""

    escolha: str
    metodo: str
    nota: str = ""
    nome_oficial: str = ""


# --- o circuito de cada quadro ---------------------------------------------


def _normal(texto: str | None) -> str:
    s = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def circuitos_dos_quadros(
    quadros: list[Quadro],
    circuitos: dict[str, Circuito],
    *,
    catalogo: dict[tuple[str, str], str],
    declarado: dict[tuple[str, str], str],
    limiar: float = 0.6,
) -> dict[tuple[str, str], str | None]:
    """Liga cada quadro a um circuito do levantamento.

    Três caminhos, por ordem: o que a região DECLARA (`levantamento:` no
    `a-pedido.yaml`), o nome que o catálogo de reservas dá ao circuito deste
    quadro, e o nome do próprio quadro. Os dois últimos comparam-se com o nome
    do circuito no levantamento — que às vezes traz duas alternativas separadas
    por `|`, e aí vale a melhor.

    Sem correspondência acima do limiar, o quadro fica SEM circuito: entra no
    relatório e não entra no feed. É melhor do que atribuí-lo ao circuito
    errado, que muda os dias em que ele anda.
    """
    por_quadro: dict[tuple[str, str], str | None] = {}
    for q in quadros:
        chave = (q.ficheiro, q.nome)
        if chave in declarado:
            por_quadro[chave] = declarado[chave] or None
            continue
        nome = catalogo.get(chave) or q.nome
        melhor, pontos = None, 0.0
        for c in circuitos.values():
            for alternativa in [c.nome, *[x.strip() for x in (c.nome or "").split("|")]]:
                s = sim(nome, alternativa)
                if s > pontos:
                    melhor, pontos = c.id, s
        por_quadro[chave] = melhor if pontos >= limiar else None
    return por_quadro


# --- que paragem é cada nome -----------------------------------------------


#: `Amioso (P2)` → («amioso», «2»). O número do poste distingue dois lados da
#: mesma rua, e é a única parte do nome que NUNCA se pode ignorar.
def chave_de_nome(nome: str | None) -> tuple[str, str]:
    s = str(nome or "")
    m = re.search(r"\(?\bP\s*(\d)\b\)?", s)
    poste = m.group(1) if m else ""
    base = re.split(r"\s[-–]\s|\(", s)[0]
    return _normal(re.sub(r"\bP\s*\d\b", "", base)), poste


@dataclass
class Parametros:
    """Os limiares da resolução. Medidos, não escolhidos — ver o commit."""

    #: Acima disto, dois nomes são o mesmo sítio.
    nome_forte: float = 0.8
    #: E isto é o que se exige a um nome de OUTRO circuito do mesmo concelho.
    nome_noutro_circuito: float = 0.9
    #: Dois candidatos a esta distância um do outro são a mesma paragem vista
    #: duas vezes; mais longe, são dois sítios e não se escolhe nenhum.
    mesmo_sitio_m: float = 300.0


def resolver(
    quadros: list[Quadro],
    circuito_de: dict[tuple[str, str], str | None],
    circuitos: dict[str, Circuito],
    paragens: dict[str, dict[str, Any]],
    *,
    manual: dict[tuple[str, str, str], Decisao] | None = None,
    p: Parametros | None = None,
) -> dict[tuple[str, str, str], Decisao]:
    """Decide, para cada (ficheiro, quadro, nome), que paragem é.

    A tabela manual vale por cima de tudo: é entrada humana, com a razão
    escrita, e existe precisamente para os casos em que nenhuma regra chega.
    """
    p = p or Parametros()
    manual = manual or {}
    por_concelho: dict[str, list[dict[str, Any]]] = {}
    for x in paragens.values():
        por_concelho.setdefault(_normal(x.get("concelho")), []).append(x)

    decisoes: dict[tuple[str, str, str], Decisao] = {}
    for q in quadros:
        if q.tipo != "percurso":
            continue
        cid = circuito_de.get((q.ficheiro, q.nome))
        circuito = circuitos.get(cid or "")
        do_circuito = [
            paragens[i] for i in (circuito.paragens if circuito else ()) if i in paragens
        ]
        concelho = _normal(circuito.concelho if circuito else "")
        for nome in q.paragens:
            chave = (q.ficheiro, q.nome, nome)
            if chave in manual:
                decisoes[chave] = manual[chave]
                continue
            decisoes[chave] = _decidir(
                nome, do_circuito, por_concelho.get(concelho, []), cid, p
            ) or Decisao("sem", "sem-paragem", "nenhuma regra decidiu")
    return decisoes


def _iguais(candidatos: list[dict[str, Any]], p: Parametros) -> bool:
    """São todos a mesma paragem vista de sítios diferentes do levantamento?"""
    if len(candidatos) <= 1:
        return True
    a = (candidatos[0]["lat"], candidatos[0]["lon"])
    return all(metros(a, (x["lat"], x["lon"])) <= p.mesmo_sitio_m for x in candidatos[1:])


def _decidir(
    nome: str,
    do_circuito: list[dict[str, Any]],
    do_concelho: list[dict[str, Any]],
    cid: str | None,
    p: Parametros,
) -> Decisao | None:
    """As regras, por ordem de confiança. A primeira que decide, decide."""
    chave = chave_de_nome(nome)

    # 1. A CHAVE, dentro do circuito. O nome sem o que vem entre parênteses,
    #    mais o número do poste: é o que a brochura e o levantamento têm
    #    sempre em comum, e é o que não confunde dois lados da mesma rua.
    mesma = [
        x
        for x in do_circuito
        if chave_de_nome(x["nome"]) == chave
        or (chave[1] and chave_de_nome(x.get("nome_alternativo") or "") == chave)
    ]
    if mesma and _iguais(mesma, p):
        return Decisao(mesma[0]["id"], "circuito-chave")

    # 2. A BASE DO NOME, quando é única no circuito e não há poste a distinguir.
    if chave[0] and not chave[1]:
        base = [x for x in do_circuito if chave_de_nome(x["nome"])[0] == chave[0]]
        if len(base) == 1:
            return Decisao(base[0]["id"], "circuito-base-unica")

    # 3. A SEMELHANÇA, dentro do circuito.
    fortes = [x for x in do_circuito if sim(nome, x["nome"]) >= p.nome_forte]
    fortes.sort(key=lambda x: -sim(nome, x["nome"]))
    if fortes and _iguais(fortes, p):
        return Decisao(fortes[0]["id"], "circuito-nome")

    # 4. SEM CIRCUITO, a chave dentro do concelho. É o caso de um quadro que o
    #    levantamento não tem: as paragens existem, o circuito é que não.
    if not do_circuito:
        mesma = [x for x in do_concelho if chave_de_nome(x["nome"]) == chave]
        if mesma and _iguais(mesma, p):
            return Decisao(mesma[0]["id"], "concelho-chave")

    # 5. O NOME QUASE EXATO NOUTRO CIRCUITO do mesmo concelho. Dois circuitos
    #    vizinhos partilham paragens e o levantamento numera-as uma vez por
    #    circuito; exige-se mais parecença porque já não há o circuito a
    #    limitar o engano.
    outros = [
        x
        for x in do_concelho
        if x.get("circuito") != cid and sim(nome, x["nome"]) >= p.nome_noutro_circuito
    ]
    outros.sort(key=lambda x: -sim(nome, x["nome"]))
    if outros and _iguais(outros, p):
        return Decisao(outros[0]["id"], "concelho-nome-exato")
    return None


# --- os dias em que cada coluna anda ---------------------------------------

# O que o rótulo de uma coluna diz sobre o período e sobre os dias.
#
# AS FRONTEIRAS DE PALAVRA NÃO SÃO ZELO: «férias» e «feriados» começam pelas
# mesmas cinco letras, e quase toda a coluna de dias úteis destas brochuras diz
# «exceto feriados». Sem o `\b` final, «Dias úteis (exceto feriados)» lia-se
# como férias escolares — e um circuito que anda o ano inteiro passava a andar
# só nas férias. Custou 190 dias de serviço numa única brochura.
_FERIAS = re.compile(r"\bf[\u00e9e]rias\b")
_ESCOLAR = re.compile(r"\bescolar(es)?\b")
_SABADO = re.compile(r"\bs[\u00e1a]bados?\b")
_UTEIS = re.compile(r"\b[\u00fau]teis\b")
_VOLTA = re.compile(r"\b(volta|regresso)\b")


def classificar_rotulo(rotulo: str | None) -> tuple[str, str | None, str]:
    """`Férias Escolares — Sábado (volta)` → («FE», «sab», «1»).

    O período é o do calendário da região: `E` escolar, `FE` férias, `A` os
    dois. Os dias limitam o que o levantamento declara — uma coluna que diga
    «sábado» não anda à segunda, mesmo que o circuito ande.
    """
    r = (rotulo or "").lower()
    if _FERIAS.search(r):
        periodo = "FE"
    elif _ESCOLAR.search(r):
        periodo = "E"
    else:
        periodo = "A"
    so_dias = "sab" if _SABADO.search(r) else "uteis" if _UTEIS.search(r) else None
    return periodo, so_dias, "1" if _VOLTA.search(r) else "0"


def codigos_de_servico(circuito: Circuito, periodo: str, so_dias: str | None) -> list[str]:
    """Os códigos do calendário que um circuito usa, neste período.

    O levantamento diz que dias da semana o circuito anda; o calendário da
    região sabe que datas é que isso dá. Os códigos são os mesmos da rede
    regular (`E-U`, `FE-246`, `A-S`…), o que quer dizer que o calendário não
    precisa de saber que isto é transporte a pedido.
    """
    # O QUE A REGIÃO DECLARA VALE POR CIMA DOS DIAS DO LEVANTAMENTO: é o caso
    # de um circuito que o levantamento não tem.
    if circuito.codigos:
        return list(circuito.codigos)

    periodos = ["E", "FE"] if periodo == "A" else [periodo]
    codigos: list[str] = []
    for pe in periodos:
        dias = list(circuito.dias_escolar if pe == "E" else circuito.dias_ferias)
        if not dias:
            continue
        uteis = dias[:5]
        sabado = dias[5] if len(dias) > 5 else False
        if so_dias == "sab":
            uteis = [False] * 5
        if so_dias == "uteis":
            sabado = False
        quais = [str(i + 2) for i, anda in enumerate(uteis) if anda]
        if quais:
            codigos.append(f"{pe}-U" if len(quais) == 5 else f"{pe}-{''.join(quais)}")
        if sabado:
            codigos.append(f"{pe}-S")
    return codigos
