"""Inventa as Terras do Ameno — a região de demonstração do Paragem.pt.

NADA DISTO EXISTE. Nem uma paragem, nem uma estrada, nem um rio, nem um
horário vem de sítio nenhum: as Terras do Ameno ficam no meio do Atlântico, a
cento e tal quilómetros da costa, onde não há terra nenhuma por baixo que
alguém possa confundir com a verdadeira. Os nomes foram procurados no
OpenStreetMap antes de ficarem — os que coincidiam com um lugar português
saíram.

É a região «no dia 100»: a que se mostra a quem decide, com tudo o que o
produto faz — a rede regular com urbanos e interurbanos, o comboio com
transbordos para o autocarro, o transporte a pedido com zonas e regra de
reserva, os urbanos de uma câmara, as bicicletas partilhadas, os expressos e
os táxis — e um mapa desenhado por nós. As duas regiões de prova são o dia
zero, de propósito mínimas; esta é o contrário.

ESTE FICHEIRO É A ORIGEM, E O QUE ELE ESCREVE É A FONTE. O pipeline não corre
isto: lê os ficheiros que isto escreveu, como lê os de qualquer região, pelos
leitores genéricos — é essa a prova de que uma região nova entra sem uma linha
de código. Quem quiser mudar a demonstração muda aqui e volta a correr:

    uv run python data/manual/demo/inventar.py

e o que muda fica à vista no `git diff` dos ficheiros que saem — tudo é
determinista, com a mesma semente, e corre-se as vezes que se quiser.

O que sai, nesta pasta:

    geografia.geojson     os concelhos, a água, o verde, as estradas, a linha
                          de comboio, os edifícios e os nomes — o mapa e a
                          carta administrativa da região, num ficheiro só
    gtfs-rede/            a rede regular (Rede Ameno), sem `calendar.txt`: os
                          dias saem das regras do calendário da região
    gtfs-comboio/         a linha de comboio (Ferrovia do Poente)
    gtfs-expressos/       um expresso que atravessa a região (Gaivota Expressos)
    demo.osm.xml          bicicletas, táxis, sítios e a rota de um urbano, na
                          forma de um extrato do OpenStreetMap
    tabelas/              os horários do transporte a pedido e do urbano da
                          câmara, já em tabela
"""

from __future__ import annotations

import csv
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import quoteattr

import networkx as nx
from shapely import polygonize, voronoi_polygons
from shapely.geometry import LineString, MultiPoint, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

AQUI = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# onde fica: quilómetros à volta de um ponto no mar
# ---------------------------------------------------------------------------

#: O centro da região. A caixa do `regiao.yaml` vai de 39,30 a 39,62 de
#: latitude e de −10,75 a −10,30 de longitude — mar alto, longe de qualquer
#: território de cliente e das caixas das duas regiões de prova.
LON0, LAT0 = -10.525, 39.46
KM_LAT = 111.0
KM_LON = 111.32 * math.cos(math.radians(LAT0))


def graus(x: float, y: float) -> tuple[float, float]:
    """Quilómetros (leste, norte) a partir do centro → (lon, lat)."""
    return (round(LON0 + x / KM_LON, 6), round(LAT0 + y / KM_LAT, 6))


def dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


SEMENTE = 20261002


def acaso(*chave: object) -> random.Random:
    """Um gerador por coisa, para mudar uma não mudar as outras todas."""
    return random.Random(f"{SEMENTE}:{':'.join(map(str, chave))}")


# ---------------------------------------------------------------------------
# as terras
# ---------------------------------------------------------------------------


@dataclass
class Vila:
    id: str
    nome: str
    x: float
    y: float
    classe: str
    linhas: int
    colunas: int
    passo: float
    angulo: float
    ruas_em_linha: list[str]
    ruas_em_coluna: list[str]
    principal_linha: int
    principal_coluna: int
    fora: bool = False


VILAS = [
    Vila(
        "pa", "Porto Ameno", -1.0, 1.0, "city", 6, 8, 0.28, 12,
        ["Rua do Rio", "Rua da Fonte", "Rua do Comércio", "Rua Direita", "Rua da Câmara",
         "Rua das Escolas"],
        ["Rua do Moinho", "Rua de São Brás", "Rua do Carmo", "Avenida da República",
         "Rua do Mercado", "Rua 25 de Abril", "Rua da Saudade", "Avenida do Hospital"],
        3, 3,
    ),
    Vila(
        "al", "Almeão", 9.0, -2.0, "town", 5, 6, 0.26, -8,
        ["Rua da Ribeira", "Rua da Escola", "Rua Direita", "Rua do Castelo", "Rua da Estação"],
        ["Rua da Fonte", "Rua do Forno", "Avenida da Liberdade", "Rua das Flores", "Rua do Lagar",
         "Rua do Outeiro"],
        2, 2,
    ),
    Vila(
        "sa", "Saramela", -6.0, -9.0, "town", 5, 5, 0.26, 20,
        ["Rua da Igreja", "Rua Direita", "Rua do Mercado", "Rua das Eiras", "Rua do Calvário"],
        ["Rua do Poço", "Avenida dos Combatentes", "Rua da Escola", "Rua do Sol",
         "Rua da Azinhaga"],
        1, 1,
    ),
    Vila(
        "co", "Corvalinho", -8.0, 10.0, "town", 4, 5, 0.25, 5,
        ["Rua do Vale", "Rua Direita", "Rua da Serra", "Rua da Estação"],
        ["Rua do Adro", "Rua Nova", "Rua da Escola", "Rua dos Moinhos", "Rua do Pinhal"],
        1, 2,
    ),
    Vila(
        "mt", "Montelírio", 14.0, -12.0, "town", 4, 5, 0.26, -15,
        ["Rua do Sul", "Rua Direita", "Rua do Lírio", "Rua da Estação"],
        ["Rua do Castelo", "Avenida da Liberdade", "Rua das Escolas", "Rua da Fonte Santa",
         "Rua do Rossio"],
        1, 1,
    ),
    # As duas pontas de fora: a linha de comboio e o expresso continuam para lá
    # da fronteira, como na vida — cortar na fronteira era servir meia viagem.
    Vila(
        "ls", "Lagoa Serena", -11.0, 21.0, "town", 3, 3, 0.25, 0,
        ["Rua do Cais", "Rua Direita", "Rua da Lagoa"],
        ["Rua do Norte", "Avenida da Estação", "Rua do Sul"],
        1, 1, fora=True,
    ),
    Vila(
        "cb", "Cabo Lírio", 17.0, -21.5, "town", 3, 3, 0.25, 10,
        ["Rua do Farol", "Rua Direita", "Rua do Porto"],
        ["Rua da Areia", "Avenida do Mar", "Rua das Redes"],
        1, 1, fora=True,
    ),
]  # fmt: skip
VILA = {v.id: v for v in VILAS}

#: As aldeias: um largo e duas ruas que se cruzam nele.
ALDEIAS = {
    "vs": ("Vale Sereno", 4.0, 0.3, 10),
    "az": ("Azenhas do Ameno", 11.0, -6.8, 30),
    "cv": ("Covas do Vento", -14.0, 4.0, 0),
    "lt": ("Lontral", -12.0, -3.5, 20),
    "va": ("Vau do Ameno", -3.4, -3.8, -30),
    "sb": ("Serrabela", -4.0, 14.0, 15),
    "br": ("Brisalva", 4.6, 8.6, -20),
    "pn": ("Pinhal do Ameno", 16.0, 2.0, 5),
    "cg": ("Cerro da Gralha", -10.5, 14.5, 40),
    "cs": ("Casais do Lírio", 15.9, -7.6, -10),
}

#: Os concelhos: nome, código, se é membro da autoridade, prefixo dos
#: `stop_id`, e os pontos à volta dos quais o território se desenha.
CONCELHOS = {
    "porto-ameno": (
        "Porto Ameno", "9911", True, "pam",
        [(-1, 1), (4.6, 8.6), (-3.4, -3.8), (1.5, 4.5), (4.0, 0.3), (0.5, -3.0)],
    ),
    "almeao": (
        "Almeão", "9912", True, "alm",
        [(9, -2), (16, 2), (12, 6), (14.5, -3.5), (8.5, 4.5)],
    ),
    "saramela": (
        "Saramela", "9913", True, "sar",
        [(-6, -9), (-12, -3.5), (-14, -12), (-1, -13), (-9, -15.5), (-16.5, -6)],
    ),
    "corvalinho": (
        "Corvalinho", "9914", True, "cor",
        [(-8, 10), (-4, 14), (-14, 4), (-10.5, 14.5), (-15.5, 12), (-1, 16), (-16, 0)],
    ),
    "montelirio": (
        "Montelírio", "9915", False, "mon",
        [(14, -12), (11, -6.8), (17, -8), (6.5, -14.5), (17, -16), (4.5, -8.5)],
    ),
}  # fmt: skip

#: O contorno da terra, antes de se deformar: um quadrado de cantos muito
#: redondos, com a margem a ondular — e sempre dentro da caixa da região.
CONTORNO = (-18.4, -17.0, 18.4, 17.0)


def contorno() -> Polygon:
    pontos = []
    for k in range(240):
        t = 2 * math.pi * k / 240
        c, s_ = math.cos(t), math.sin(t)
        # Superelipse (n = 3): mais quadrada do que um círculo, menos do que uma caixa.
        r = 1 / ((abs(c) / 17.4) ** 3 + (abs(s_) / 16.2) ** 3) ** (1 / 3)
        r *= (
            1
            + 0.035 * math.sin(5 * t + 0.7)
            + 0.02 * math.sin(11 * t + 2.1)
            + 0.012 * math.sin(23 * t)
        )
        pontos.append((r * c, r * s_))
    return Polygon(pontos).intersection(box(*CONTORNO))


def deformar(x: float, y: float) -> tuple[float, float]:
    """Uma deformação suave do plano, para as fronteiras não serem retas.

    A derivada nunca passa de 0,83, e por isso a deformação nunca dobra o
    plano sobre si próprio: duas fronteiras que não se cruzavam continuam sem
    se cruzar, e um concelho continua a ser um polígono só.
    """
    dx = 0.45 * math.sin(0.35 * x + 0.80 * y + 1.3) + 0.12 * math.sin(1.3 * x - 1.1 * y + 0.4)
    dy = 0.45 * math.sin(-0.75 * x + 0.30 * y + 2.1) + 0.12 * math.sin(1.2 * x + 1.4 * y + 2.9)
    return x + dx, y + dy


# ---------------------------------------------------------------------------
# geometria pequena
# ---------------------------------------------------------------------------


def catmull_rom(pontos: list[tuple[float, float]], passo: float) -> list[tuple[float, float]]:
    """Uma curva que passa EXATAMENTE por cada ponto dado (centrípeta, α = ½)."""
    if len(pontos) == 2:
        n = max(1, math.ceil(dist(*pontos) / passo))
        (x0, y0), (x1, y1) = pontos
        return [(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(n + 1)]
    p = list(pontos)
    antes = (2 * p[0][0] - p[1][0], 2 * p[0][1] - p[1][1])
    depois = (2 * p[-1][0] - p[-2][0], 2 * p[-1][1] - p[-2][1])
    q = [antes, *p, depois]
    saida = [p[0]]
    for i in range(1, len(q) - 2):
        p0, p1, p2, p3 = q[i - 1], q[i], q[i + 1], q[i + 2]
        t0 = 0.0
        t1 = t0 + max(dist(p0, p1), 1e-6) ** 0.5
        t2 = t1 + max(dist(p1, p2), 1e-6) ** 0.5
        t3 = t2 + max(dist(p2, p3), 1e-6) ** 0.5
        n = max(1, math.ceil(dist(p1, p2) / passo))
        for k in range(1, n):
            t = t1 + (t2 - t1) * k / n

            def mistura(a, b, ta, tb, t=t):
                return (
                    ((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta),
                    ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta),
                )

            a1 = mistura(p0, p1, t0, t1)
            a2 = mistura(p1, p2, t1, t2)
            a3 = mistura(p2, p3, t2, t3)
            b1 = mistura(a1, a2, t0, t2)
            b2 = mistura(a2, a3, t1, t3)
            saida.append(mistura(b1, b2, t1, t2))
        saida.append(p2)
    return saida


def mancha(cx: float, cy: float, raio: float, chave: str, pontos: int = 48) -> Polygon:
    """Uma mancha de forma orgânica: um círculo com o raio a ondular."""
    r = acaso("mancha", chave)
    f1, f2, f3 = r.uniform(0, 6.3), r.uniform(0, 6.3), r.uniform(0, 6.3)
    a1, a2, a3 = r.uniform(0.12, 0.22), r.uniform(0.06, 0.12), r.uniform(0.03, 0.06)
    alongar, rodar = r.uniform(0.8, 1.35), r.uniform(0, math.pi)
    anel = []
    for k in range(pontos):
        t = 2 * math.pi * k / pontos
        rr = raio * (
            1 + a1 * math.sin(2 * t + f1) + a2 * math.sin(3 * t + f2) + a3 * math.sin(7 * t + f3)
        )
        u, v = rr * math.cos(t) * alongar, rr * math.sin(t) / alongar
        anel.append(
            (
                cx + u * math.cos(rodar) - v * math.sin(rodar),
                cy + u * math.sin(rodar) + v * math.cos(rodar),
            )
        )
    return Polygon(anel).buffer(0)


def em_graus(geom):
    from shapely import transform

    def f(c):
        c = c.copy()
        c[:, 0] = LON0 + c[:, 0] / KM_LON
        c[:, 1] = LAT0 + c[:, 1] / KM_LAT
        return c.round(6)

    return transform(geom, f)


# ---------------------------------------------------------------------------
# o grafo das ruas e das estradas
# ---------------------------------------------------------------------------

G = nx.Graph()
POS: dict[str, tuple[float, float]] = {}
#: (coordenadas em km, classe, nome, se é rua de vila) de cada via, para o mapa.
VIAS: list[tuple[list[tuple[float, float]], str, str, bool]] = []

VELOCIDADE = {
    "trunk": 80, "primary": 60, "secondary": 50, "tertiary": 45, "minor": 22, "urbana": 24,
}  # fmt: skip


def ligar(a: str, b: str, classe: str, nome: str, urbana: bool) -> None:
    km = dist(POS[a], POS[b])
    v = VELOCIDADE["urbana" if urbana and classe != "minor" else classe]
    G.add_edge(a, b, km=km, minutos=km / v * 60, classe=classe, nome=nome)


def no_da_vila(v: Vila, i: int, j: int) -> str:
    return f"{v.id}:{i}:{j}"


def construir_vilas() -> None:
    for v in VILAS:
        r = acaso("vila", v.id)
        a = math.radians(v.angulo)
        for i in range(v.linhas):
            for j in range(v.colunas):
                u = (j - (v.colunas - 1) / 2) * v.passo + r.uniform(-0.03, 0.03)
                w = (i - (v.linhas - 1) / 2) * v.passo + r.uniform(-0.03, 0.03)
                POS[no_da_vila(v, i, j)] = (
                    v.x + u * math.cos(a) - w * math.sin(a),
                    v.y + u * math.sin(a) + w * math.cos(a),
                )
        for i in range(v.linhas):
            nos = [no_da_vila(v, i, j) for j in range(v.colunas)]
            classe = "tertiary" if i == v.principal_linha else "minor"
            for a_, b_ in zip(nos, nos[1:], strict=False):
                ligar(a_, b_, classe, v.ruas_em_linha[i], True)
            VIAS.append(([POS[n] for n in nos], classe, v.ruas_em_linha[i], True))
        for j in range(v.colunas):
            nos = [no_da_vila(v, i, j) for i in range(v.linhas)]
            classe = "tertiary" if j == v.principal_coluna else "minor"
            for a_, b_ in zip(nos, nos[1:], strict=False):
                ligar(a_, b_, classe, v.ruas_em_coluna[j], True)
            VIAS.append(([POS[n] for n in nos], classe, v.ruas_em_coluna[j], True))


def construir_aldeias() -> None:
    for aid, (_nome, x, y, angulo) in ALDEIAS.items():
        a = math.radians(angulo)
        centro = f"{aid}:c"
        POS[centro] = (x, y)
        for k, (nome, comp) in enumerate((("Rua da Igreja", 0.22), ("Rua da Fonte", 0.17))):
            ang = a + k * math.pi / 2
            ponta1, ponta2 = f"{aid}:{k}a", f"{aid}:{k}b"
            POS[ponta1] = (x + comp * math.cos(ang), y + comp * math.sin(ang))
            POS[ponta2] = (x - comp * math.cos(ang), y - comp * math.sin(ang))
            ligar(ponta1, centro, "minor", nome, True)
            ligar(centro, ponta2, "minor", nome, True)
            VIAS.append(([POS[ponta1], POS[centro], POS[ponta2]], "minor", nome, True))


#: Nós com nome próprio: os nós da via rápida, e uma paragem à beira da estrada.
NOS_FIXOS = {
    "j:co": (-9.3, 11.4),
    "j:pa": (1.4, 3.6),
    "j:al": (7.2, 0.9),
    "j:mt": (15.2, -10.6),
    "p:alto-da-brisa": (1.6, 5.7),
}

ESTRADAS = [
    ("vr", "Via Rápida do Ameno", "trunk",
     [("ls", 0, 1), (-10.9, 17.5), "j:co", (-6.8, 8.6), (-3.6, 5.6), "j:pa", (4.5, 2.4), "j:al",
      (11.8, -3.2), (13.6, -7.0), "j:mt", (16.3, -15.5), ("cb", 2, 1)]),
    ("r1", "Estrada do Ameno", "primary",
     [("pa", 3, 7), (1.8, 0.95), "vs:c", (6.3, -0.6), ("al", 2, 0)]),
    ("r2", "Estrada de Saramela", "secondary",
     [("pa", 0, 3), (-2.2, -1.6), "va:c", (-4.7, -6.2), ("sa", 4, 2)]),
    ("r3", "Estrada da Serra", "secondary",
     [("pa", 5, 0), (-3.0, 3.6), (-5.6, 6.9), ("co", 0, 4)]),
    ("r4", "Estrada do Lírio", "tertiary",
     [("al", 0, 3), (9.8, -4.6), "az:c", (12.4, -9.4), ("mt", 3, 1)]),
    ("r5", "Estrada das Eiras", "tertiary",
     [("sa", 1, 4), (-2.5, -10.6), (2.5, -11.6), (8.0, -12.6), ("mt", 1, 0)]),
    ("r6", "Estrada das Lontras", "tertiary",
     [("sa", 2, 0), (-9.3, -6.9), "lt:c", (-13.6, 0.2), "cv:c", (-12.6, 7.6), (-10.2, 9.6),
      ("co", 1, 0)]),
    ("r7", "Estrada da Albufeira", "tertiary",
     [("pa", 5, 4), (0.6, 3.9), "p:alto-da-brisa", (3.0, 7.2), "br:c"]),
    ("r8", "Estrada de Serrabela", "tertiary", [("co", 3, 3), (-6.6, 12.0), "sb:c"]),
    ("r9", "Estrada do Pinhal", "tertiary", [("al", 3, 5), (12.5, -0.6), "pn:c"]),
    ("r10", "Estrada do Cerro", "tertiary", [("co", 3, 0), (-9.6, 12.6), "cg:c"]),
    ("r11", "Estrada dos Casais", "tertiary", [("mt", 1, 4), (16.0, -10.0), "cs:c"]),
    ("a1", "Acesso ao Nó de Porto Ameno", "secondary", [("pa", 5, 7), "j:pa"]),
    ("a2", "Acesso ao Nó de Almeão", "secondary", [("al", 4, 0), "j:al"]),
    ("a3", "Acesso ao Nó de Corvalinho", "secondary", [("co", 3, 0), "j:co"]),
    ("a4", "Acesso ao Nó de Montelírio", "secondary", [("mt", 3, 4), "j:mt"]),
]  # fmt: skip


def construir_estradas() -> None:
    for nid, xy in NOS_FIXOS.items():
        POS[nid] = xy
    for eid, nome, classe, ancoras in ESTRADAS:
        nos_ancora: list[str | None] = []
        pontos: list[tuple[float, float]] = []
        for a in ancoras:
            if isinstance(a, str):
                nos_ancora.append(a)
                pontos.append(POS[a])
            elif isinstance(a[0], str):
                n = no_da_vila(VILA[a[0]], a[1], a[2])
                nos_ancora.append(n)
                pontos.append(POS[n])
            else:
                nos_ancora.append(None)
                pontos.append((float(a[0]), float(a[1])))
        curva = catmull_rom(pontos, 0.12)
        # Cada ponto da curva é um nó; as âncoras com nome ficam com o delas.
        nos: list[str] = []
        k_ancora = 0
        for k, p in enumerate(curva):
            if k_ancora < len(pontos) and dist(p, pontos[k_ancora]) < 1e-9:
                n = nos_ancora[k_ancora] or f"{eid}:a{k_ancora}"
                k_ancora += 1
            else:
                n = f"{eid}:{k}"
            POS.setdefault(n, p)
            nos.append(n)
        for a_, b_ in zip(nos, nos[1:], strict=False):
            ligar(a_, b_, classe, nome, False)
        VIAS.append(([POS[n] for n in nos], classe, nome, False))


# --- o caminho de ferro ------------------------------------------------------

#: A Linha do Ameno, de norte para sul. As estações são pontos da linha.
FERROVIA = [
    ("ls", -11.2, 20.6), (None, -10.6, 17.0), (None, -9.6, 13.4), ("co", -8.6, 10.75),
    (None, -6.3, 7.4), (None, -3.3, 4.4), ("pa", -0.5, 2.35), ("vs", 4.0, 0.85),
    ("al", 8.3, -0.9), (None, 10.3, -3.9), ("az", 11.5, -6.4), (None, 12.7, -9.0),
    ("mt", 13.5, -11.0),
]  # fmt: skip
ESTACOES = {
    "ls": "Lagoa Serena", "co": "Corvalinho", "pa": "Porto Ameno", "vs": "Vale Sereno",
    "al": "Almeão", "az": "Azenhas do Ameno", "mt": "Montelírio",
}  # fmt: skip

#: De onde parte a rua que vai dar a cada estação: um nó da vila, ou o largo.
ACESSO_A_ESTACAO = {
    "ls": ("ls:0:0", "Avenida da Estação"),
    "co": ("co:3:1", "Rua da Estação"),
    "pa": ("pa:5:6", "Avenida da Estação"),
    "vs": ("vs:c", "Rua da Estação"),
    "al": ("al:4:1", "Rua da Estação"),
    "az": ("az:c", "Rua da Estação"),
    "mt": ("mt:3:0", "Rua da Estação"),
}
CARRIL: list[tuple[float, float]] = []


def construir_ferrovia() -> None:
    CARRIL.extend(catmull_rom([(x, y) for _, x, y in FERROVIA], 0.1))
    for sid, x, y in FERROVIA:
        if not sid:
            continue
        de, nome = ACESSO_A_ESTACAO[sid]
        ox, oy = POS[de]
        d = dist((x, y), (ox, oy))
        # A paragem de autocarro fica a 70 m da estação, do lado da vila.
        POS[f"e:{sid}"] = (x + (ox - x) * 0.07 / d, y + (oy - y) * 0.07 / d)
        ligar(de, f"e:{sid}", "minor" if sid not in ("pa", "al") else "tertiary", nome, True)
        VIAS.append(([POS[de], POS[f"e:{sid}"]], "minor", nome, True))


# ---------------------------------------------------------------------------
# as paragens e as linhas da rede
# ---------------------------------------------------------------------------

#: id → (nome, nó). O prefixo do id é o do concelho, e confere-se no fim.
PARAGENS = {
    "pam_terminal": ("Porto Ameno (Terminal)", "pa:3:3"),
    "pam_camara": ("Porto Ameno (Câmara Municipal)", "pa:4:4"),
    "pam_mercado": ("Porto Ameno (Mercado)", "pa:3:6"),
    "pam_hospital": ("Porto Ameno (Hospital)", "pa:5:7"),
    "pam_escola": ("Porto Ameno (Escola Secundária)", "pa:0:6"),
    "pam_moinho": ("Porto Ameno (Bairro do Moinho)", "pa:0:0"),
    "pam_piscinas": ("Porto Ameno (Piscinas)", "pa:5:1"),
    "pam_fonte": ("Porto Ameno (Largo da Fonte)", "pa:2:1"),
    "pam_estacao": ("Porto Ameno (Estação)", "e:pa"),
    "pam_vale_sereno": ("Vale Sereno", "vs:c"),
    "pam_vale_sereno_estacao": ("Vale Sereno (Estação)", "e:vs"),
    "pam_vau": ("Vau do Ameno", "va:c"),
    "pam_brisalva": ("Brisalva (Praia Fluvial)", "br:c"),
    "pam_alto_da_brisa": ("Alto da Brisa", "p:alto-da-brisa"),
    "alm_centro": ("Almeão (Centro)", "al:2:2"),
    "alm_estacao": ("Almeão (Estação)", "e:al"),
    "alm_mercado": ("Almeão (Mercado)", "al:3:3"),
    "alm_saude": ("Almeão (Centro de Saúde)", "al:2:5"),
    "alm_escola": ("Almeão (Escola)", "al:0:2"),
    "alm_fonte": ("Almeão (Bairro da Fonte)", "al:0:0"),
    "alm_castelo": ("Almeão (Castelo)", "al:4:4"),
    "alm_pinhal": ("Pinhal do Ameno", "pn:c"),
    "sar_centro": ("Saramela (Centro)", "sa:2:2"),
    "sar_escola": ("Saramela (Escola)", "sa:3:3"),
    "sar_igreja": ("Saramela (Igreja)", "sa:1:1"),
    "sar_mercado": ("Saramela (Mercado)", "sa:2:0"),
    "sar_lontral": ("Lontral", "lt:c"),
    "cor_centro": ("Corvalinho (Centro)", "co:1:2"),
    "cor_estacao": ("Corvalinho (Estação)", "e:co"),
    "cor_escola": ("Corvalinho (Escola)", "co:2:3"),
    "cor_covas": ("Covas do Vento", "cv:c"),
    "cor_serrabela": ("Serrabela", "sb:c"),
    "mon_centro": ("Montelírio (Centro)", "mt:1:1"),
    "mon_estacao": ("Montelírio (Estação)", "e:mt"),
    "mon_mercado": ("Montelírio (Mercado)", "mt:1:2"),
    "mon_escola": ("Montelírio (Escola Secundária)", "mt:0:2"),
    "mon_azenhas": ("Azenhas do Ameno", "az:c"),
    "mon_azenhas_estacao": ("Azenhas do Ameno (Estação)", "e:az"),
}


def caminho(paragens: list[str]) -> tuple[list[str], list[float]]:
    """Os nós por onde se passa, e os minutos até cada paragem."""
    nos = [PARAGENS[paragens[0]][1]]
    minutos = [0.0]
    total = 0.0
    for a, b in zip(paragens, paragens[1:], strict=False):
        troco = nx.shortest_path(G, PARAGENS[a][1], PARAGENS[b][1], weight="minutos")
        for u, v in zip(troco, troco[1:], strict=False):
            total += G.edges[u, v]["minutos"]
        nos += troco[1:]
        # Meio minuto parado em cada paragem.
        total += 0.5
        minutos.append(total)
    return nos, minutos


@dataclass
class Linha:
    id: str
    curto: str
    longo: str
    cor: str
    paragens: list[str]
    #: código de serviço → partidas no sentido da lista, em minutos
    ida: dict[str, list[int]]
    #: código de serviço → partidas no sentido contrário (vazio numa circular)
    volta: dict[str, list[int]]


def cada(inicio: str, fim: str, intervalo: int) -> list[int]:
    h0, m0 = map(int, inicio.split(":"))
    h1, m1 = map(int, fim.split(":"))
    return list(range(h0 * 60 + m0, h1 * 60 + m1 + 1, intervalo))


def em(*horas: str) -> list[int]:
    return [int(h[:-3]) * 60 + int(h[-2:]) for h in horas]


# --- o comboio, primeiro: os autocarros de ligação dependem dele ------------


def tempos_do_comboio() -> dict[str, float]:
    """Minutos desde Lagoa Serena até cada estação, pela linha."""
    linha = LineString(CARRIL)
    saida: dict[str, float] = {}
    paradas = 0
    for sid, x, y in FERROVIA:
        if not sid:
            continue
        km = linha.project(Point(x, y))
        saida[sid] = km / 70 * 60 + paradas
        paradas += 1
    return saida


def horarios_do_comboio() -> dict[str, list[tuple[str, int, int]]]:
    """(sentido, partida da origem, código) — de hora a hora nos dias úteis."""
    viagens = {
        "A-U": [("S", t) for t in cada("05:50", "21:50", 60)]
        + [("N", t) for t in cada("06:10", "22:10", 60)],
        "A-FS": [("S", t) for t in cada("07:50", "21:50", 120)]
        + [("N", t) for t in cada("08:10", "22:10", 120)],
    }
    return viagens  # type: ignore[return-value]


T_COMBOIO = {}  # preenchido no fim de construir_ferrovia


def chegada_do_comboio(sentido: str, partida: int, estacao: str) -> int:
    t = T_COMBOIO
    if sentido == "S":
        return round(partida + t[estacao] - t["ls"])
    return round(partida + t["mt"] - t[estacao])


def linhas_da_rede() -> list[Linha]:
    # A LINHA 2 ESPERA PELO COMBOIO em Porto Ameno: parte sete minutos depois
    # de chegar o que vem do norte, e chega oito minutos antes de partir o que
    # vai para lá. É a ligação que a demonstração mostra no planeador.
    sul_em_pa = [
        chegada_do_comboio("S", p, "pa") for s, p in horarios_do_comboio()["A-U"] if s == "S"
    ]
    norte_em_pa = [
        chegada_do_comboio("N", p, "pa") for s, p in horarios_do_comboio()["A-U"] if s == "N"
    ]
    _, m2 = caminho(
        ["sar_escola", "sar_centro", "pam_vau", "pam_fonte", "pam_terminal", "pam_estacao"]
    )
    duracao_2 = round(m2[-1])
    return [
        Linha(
            "1", "1", "Porto Ameno – Almeão", "0A5C7A",
            ["pam_terminal", "pam_camara", "pam_mercado", "pam_vale_sereno",
             "pam_vale_sereno_estacao", "alm_fonte", "alm_centro", "alm_estacao"],
            {"A-U": cada("06:30", "21:00", 30), "A-S": cada("07:30", "19:30", 60),
             "A-DF": cada("08:30", "18:30", 120)},
            {"A-U": cada("06:45", "21:15", 30), "A-S": cada("08:00", "20:00", 60),
             "A-DF": cada("09:30", "19:30", 120)},
        ),
        Linha(
            "2", "2", "Porto Ameno (Estação) – Saramela", "8C3B2A",
            ["pam_estacao", "pam_terminal", "pam_fonte", "pam_vau", "sar_centro", "sar_escola"],
            {"A-U": [t + 7 for t in sul_em_pa if 6 * 60 <= t <= 20 * 60 + 30],
             "A-S": cada("08:20", "18:20", 120), "A-DF": em("09:20", "13:20", "17:20")},
            {"A-U": [t - 8 - duracao_2 for t in norte_em_pa if 7 * 60 <= t <= 21 * 60 + 30],
             "A-S": cada("09:30", "19:30", 120), "A-DF": em("10:30", "14:30", "18:30")},
        ),
        Linha(
            "3", "3", "Saramela – Montelírio", "5B4E1E",
            ["sar_centro", "sar_igreja", "mon_mercado", "mon_centro", "mon_estacao"],
            {"A-U": em("07:00", "09:30", "13:00", "17:45"), "A-S": em("08:30", "13:30")},
            {"A-U": em("08:10", "11:15", "14:40", "19:00"), "A-S": em("09:40", "16:40")},
        ),
        Linha(
            "4", "4", "Porto Ameno – Corvalinho – Serrabela", "1F5F4A",
            ["pam_terminal", "pam_fonte", "pam_piscinas", "cor_escola", "cor_centro",
             "cor_estacao", "cor_serrabela"],
            {"A-U": cada("06:40", "19:40", 60), "A-S": cada("08:40", "18:40", 120),
             "A-DF": em("09:40", "17:40")},
            {"A-U": cada("07:15", "20:15", 60), "A-S": cada("09:15", "19:15", 120),
             "A-DF": em("10:15", "18:15")},
        ),
        Linha(
            "5", "5", "Almeão – Montelírio", "6A3D7A",
            ["alm_estacao", "alm_centro", "alm_escola", "mon_azenhas_estacao", "mon_azenhas",
             "mon_escola", "mon_centro"],
            {"A-U": cada("06:50", "20:50", 120), "A-S": em("08:50", "12:50", "16:50")},
            {"A-U": cada("07:50", "19:50", 120), "A-S": em("09:50", "13:50", "17:50")},
        ),
        Linha(
            "6", "6", "Almeão – Pinhal do Ameno", "3D5A1E",
            ["alm_estacao", "alm_centro", "alm_saude", "alm_pinhal"],
            {"A-U": em("07:35", "09:35", "12:35", "15:35", "18:35"), "A-S": em("09:35", "12:35")},
            {"A-U": em("08:05", "10:05", "13:05", "16:05", "19:05"), "A-S": em("10:05", "13:05")},
        ),
        Linha(
            "7", "7", "Saramela – Corvalinho, pelas Lontras", "7A4B12",
            ["sar_centro", "sar_mercado", "sar_lontral", "cor_covas", "cor_centro",
             "cor_estacao"],
            {"A-U": em("07:05", "12:35", "17:35"), "E-U": em("15:50")},
            {"A-U": em("08:40", "14:10", "19:10"), "E-U": em("07:10")},
        ),
        Linha(
            "8", "8", "Porto Ameno – Brisalva (Praia Fluvial)", "1C5C6E",
            ["pam_terminal", "pam_camara", "pam_piscinas", "pam_alto_da_brisa", "pam_brisalva"],
            {"A-U": em("07:20", "10:20", "13:20", "17:20"), "A-DF": em("10:00", "15:00")},
            {"A-U": em("07:50", "10:50", "13:50", "17:50"), "A-DF": em("12:30", "18:30")},
        ),
        Linha(
            "11", "11", "Circular de Porto Ameno", "2D6A3E",
            ["pam_terminal", "pam_camara", "pam_piscinas", "pam_estacao", "pam_hospital",
             "pam_mercado", "pam_escola", "pam_moinho", "pam_fonte", "pam_terminal"],
            {"E-U": cada("07:00", "20:00", 20), "FE-U": cada("07:30", "19:30", 30),
             "A-S": cada("08:00", "13:20", 40)},
            {},
        ),
        Linha(
            "21", "21", "Escolar: Covas do Vento – Porto Ameno", "4A5C66",
            ["cor_covas", "cor_centro", "pam_piscinas", "pam_terminal", "pam_escola"],
            {"E-U": em("07:15")},
            {"E-U": em("17:10")},
        ),
    ]  # fmt: skip


# ---------------------------------------------------------------------------
# os ficheiros GTFS
# ---------------------------------------------------------------------------


def hora(minutos: float) -> str:
    m = round(minutos)
    return f"{m // 60:02d}:{m % 60:02d}:00"


def escrever_csv(pasta: Path, nome: str, campos: list[str], linhas: list[dict]) -> None:
    pasta.mkdir(parents=True, exist_ok=True)
    with open(pasta / nome, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos, lineterminator="\n")
        w.writeheader()
        w.writerows(linhas)


def coordenadas_da_paragem(pid: str) -> tuple[float, float]:
    return POS[PARAGENS[pid][1]]


def gtfs_da_rede(linhas: list[Linha]) -> list[tuple[str, list[str]]]:
    pasta = AQUI / "gtfs-rede"
    usadas = sorted({p for li in linhas for p in li.paragens})
    stops = []
    for pid in usadas:
        lon, lat = graus(*coordenadas_da_paragem(pid))
        stops.append(
            {
                "stop_id": pid,
                "stop_name": PARAGENS[pid][0],
                "stop_lat": f"{lat:.6f}",
                "stop_lon": f"{lon:.6f}",
            }
        )
    routes, trips, stop_times, shapes = [], [], [], []
    tracados: list[tuple[str, list[str]]] = []
    for li in linhas:
        routes.append(
            {
                "route_id": f"RA{li.id}",
                "agency_id": "RA",
                "route_short_name": li.curto,
                "route_long_name": li.longo,
                "route_type": "3",
                "route_color": li.cor,
                "route_text_color": "FFFFFF",
            }
        )
        sentidos = [(0, li.paragens, li.ida)]
        if li.volta:
            sentidos.append((1, list(reversed(li.paragens)), li.volta))
        for direcao, seq, partidas in sentidos:
            nos, minutos = caminho(seq)
            forma = f"RA{li.id}-{direcao}"
            tracados.append((forma, nos))
            for k, n in enumerate(nos):
                lon, lat = graus(*POS[n])
                shapes.append(
                    {
                        "shape_id": forma,
                        "shape_pt_lat": f"{lat:.6f}",
                        "shape_pt_lon": f"{lon:.6f}",
                        "shape_pt_sequence": k + 1,
                    }
                )
            destino = PARAGENS[seq[-1]][0]
            for servico, horas in partidas.items():
                for t in sorted(horas):
                    tid = f"RA{li.id}-{servico}-{direcao}-{hora(t)[:5].replace(':', '')}"
                    trips.append(
                        {
                            "route_id": f"RA{li.id}",
                            "service_id": servico,
                            "trip_id": tid,
                            "trip_headsign": destino,
                            "direction_id": direcao,
                            "shape_id": forma,
                        }
                    )
                    for k, (pid, m) in enumerate(zip(seq, minutos, strict=True)):
                        stop_times.append(
                            {
                                "trip_id": tid,
                                "arrival_time": hora(t + m),
                                "departure_time": hora(t + m),
                                "stop_id": pid,
                                "stop_sequence": k + 1,
                            }
                        )
    escrever_csv(
        pasta,
        "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
        [
            {
                "agency_id": "RA",
                "agency_name": "Rede Ameno",
                "agency_url": "https://rede-ameno.example.org",
                "agency_timezone": "Europe/Lisbon",
                "agency_lang": "pt",
            }
        ],
    )
    escrever_csv(pasta, "stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"], stops)
    escrever_csv(
        pasta,
        "routes.txt",
        [
            "route_id",
            "agency_id",
            "route_short_name",
            "route_long_name",
            "route_type",
            "route_color",
            "route_text_color",
        ],
        routes,
    )
    escrever_csv(
        pasta,
        "trips.txt",
        ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id"],
        trips,
    )
    escrever_csv(
        pasta,
        "stop_times.txt",
        ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
        stop_times,
    )
    escrever_csv(
        pasta,
        "shapes.txt",
        ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
        shapes,
    )
    escrever_csv(
        pasta, "feed_info.txt",
        ["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version",
         "feed_contact_url"],
        [{"feed_publisher_name": "Paragem.pt (região de demonstração)",
          "feed_publisher_url": "https://rede-ameno.example.org", "feed_lang": "pt",
          "feed_version": "demo-1", "feed_contact_url": "https://rede-ameno.example.org/contacto"}],
    )  # fmt: skip
    print(f"gtfs-rede: {len(linhas)} linhas, {len(stops)} paragens, {len(trips)} viagens")
    return tracados


def gtfs_do_comboio() -> None:
    pasta = AQUI / "gtfs-comboio"
    ordem = [sid for sid, _, _ in FERROVIA if sid]
    stops = []
    for sid, x, y in FERROVIA:
        if not sid:
            continue
        lon, lat = graus(x, y)
        stops.append(
            {"stop_id": f"fp_{sid}", "stop_name": ESTACOES[sid], "stop_lat": f"{lat:.6f}",
             "stop_lon": f"{lon:.6f}"}
        )  # fmt: skip
    shapes = []
    for direcao, pontos in ((0, CARRIL), (1, list(reversed(CARRIL)))):
        for k, p in enumerate(pontos):
            lon, lat = graus(*p)
            shapes.append(
                {"shape_id": f"FP-{direcao}", "shape_pt_lat": f"{lat:.6f}",
                 "shape_pt_lon": f"{lon:.6f}", "shape_pt_sequence": k + 1}
            )  # fmt: skip
    trips, stop_times = [], []
    for servico, viagens in horarios_do_comboio().items():
        for sentido, partida in viagens:
            seq = ordem if sentido == "S" else list(reversed(ordem))
            direcao = 0 if sentido == "S" else 1
            tid = f"FP-{servico}-{sentido}-{hora(partida)[:5].replace(':', '')}"
            trips.append(
                {"route_id": "FP-AMENO", "service_id": servico, "trip_id": tid,
                 "trip_headsign": ESTACOES[seq[-1]], "direction_id": direcao,
                 "shape_id": f"FP-{direcao}"}
            )  # fmt: skip
            for k, sid in enumerate(seq):
                t = chegada_do_comboio(sentido, partida, sid)
                stop_times.append(
                    {"trip_id": tid, "arrival_time": hora(t), "departure_time": hora(t),
                     "stop_id": f"fp_{sid}", "stop_sequence": k + 1}
                )  # fmt: skip
    escrever_csv(
        pasta, "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
        [{"agency_id": "FP", "agency_name": "Ferrovia do Poente",
          "agency_url": "https://ferrovia-do-poente.example.org",
          "agency_timezone": "Europe/Lisbon", "agency_lang": "pt"}],
    )  # fmt: skip
    escrever_csv(pasta, "stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"], stops)
    escrever_csv(
        pasta, "routes.txt",
        ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type",
         "route_color", "route_text_color"],
        [{"route_id": "FP-AMENO", "agency_id": "FP", "route_short_name": "Regional",
          "route_long_name": "Linha do Ameno: Lagoa Serena – Montelírio", "route_type": "2",
          "route_color": "3F4852", "route_text_color": "FFFFFF"}],
    )  # fmt: skip
    escrever_csv(
        pasta,
        "trips.txt",
        ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id"],
        trips,
    )
    escrever_csv(
        pasta,
        "stop_times.txt",
        ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
        stop_times,
    )
    escrever_csv(
        pasta,
        "shapes.txt",
        ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
        shapes,
    )
    escrever_csv(
        pasta, "feed_info.txt",
        ["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version",
         "feed_contact_url"],
        [{"feed_publisher_name": "Ferrovia do Poente (inventada para a demonstração)",
          "feed_publisher_url": "https://ferrovia-do-poente.example.org", "feed_lang": "pt",
          "feed_version": "demo-1", "feed_contact_url": "https://ferrovia-do-poente.example.org/contacto"}],
    )  # fmt: skip
    print(f"gtfs-comboio: {len(stops)} estações, {len(trips)} viagens")


#: O expresso pára nos nós da via rápida e nos terminais — não nas paragens
#: da rede: é outro operador, com os seus próprios sítios.
EXPRESSO = [
    ("ge_lagoa_serena", "Lagoa Serena (Terminal)", "ls:1:1", 0),
    ("ge_corvalinho", "Corvalinho (Nó da Via Rápida)", "j:co", 0.03),
    ("ge_porto_ameno", "Porto Ameno (Terminal Rodoviário)", "pa:3:3", 0.035),
    ("ge_almeao", "Almeão (Nó da Via Rápida)", "j:al", 0.03),
    ("ge_montelirio", "Montelírio (Nó da Via Rápida)", "j:mt", 0.03),
    ("ge_cabo_lirio", "Cabo Lírio (Terminal)", "cb:1:1", 0),
]


def gtfs_dos_expressos() -> list[tuple[str, list[str]]]:
    pasta = AQUI / "gtfs-expressos"
    ids = [e[0] for e in EXPRESSO]
    nos = {e[0]: e[2] for e in EXPRESSO}
    stops = []
    for sid, nome, n, desvio in EXPRESSO:
        x, y = POS[n]
        lon, lat = graus(x + desvio, y + desvio * 0.6)
        stops.append(
            {"stop_id": sid, "stop_name": nome, "stop_lat": f"{lat:.6f}", "stop_lon": f"{lon:.6f}"}
        )
    tracados = []
    trips, stop_times, shapes = [], [], []
    for direcao, seq in ((0, ids), (1, list(reversed(ids)))):
        percurso = [nos[seq[0]]]
        minutos = [0.0]
        total = 0.0
        for a, b in zip(seq, seq[1:], strict=False):
            troco = nx.shortest_path(G, nos[a], nos[b], weight="minutos")
            total += sum(G.edges[u, v]["minutos"] for u, v in zip(troco, troco[1:], strict=False))
            total += 2  # sobe e desce gente com malas
            percurso += troco[1:]
            minutos.append(total)
        forma = f"GE1-{direcao}"
        tracados.append((forma, percurso))
        for k, n in enumerate(percurso):
            lon, lat = graus(*POS[n])
            shapes.append(
                {"shape_id": forma, "shape_pt_lat": f"{lat:.6f}", "shape_pt_lon": f"{lon:.6f}",
                 "shape_pt_sequence": k + 1}
            )  # fmt: skip
        partidas = em("07:30", "16:30") if direcao == 0 else em("09:15", "18:15")
        for t in partidas:
            tid = f"GE1-{direcao}-{hora(t)[:5].replace(':', '')}"
            trips.append(
                {"route_id": "GE1", "service_id": "A-TD", "trip_id": tid,
                 "trip_headsign": EXPRESSO[-1][1] if direcao == 0 else EXPRESSO[0][1],
                 "direction_id": direcao, "shape_id": forma}
            )  # fmt: skip
            for k, (sid, m) in enumerate(zip(seq, minutos, strict=True)):
                stop_times.append(
                    {"trip_id": tid, "arrival_time": hora(t + m), "departure_time": hora(t + m),
                     "stop_id": sid, "stop_sequence": k + 1}
                )  # fmt: skip
    escrever_csv(
        pasta, "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
        [{"agency_id": "GE", "agency_name": "Gaivota Expressos",
          "agency_url": "https://gaivota-expressos.example.org",
          "agency_timezone": "Europe/Lisbon", "agency_lang": "pt"}],
    )  # fmt: skip
    escrever_csv(pasta, "stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"], stops)
    escrever_csv(
        pasta, "routes.txt",
        ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"],
        [{"route_id": "GE1", "agency_id": "GE", "route_short_name": "E1",
          "route_long_name": "Lagoa Serena – Cabo Lírio", "route_type": "3"}],
    )  # fmt: skip
    escrever_csv(
        pasta,
        "trips.txt",
        ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id"],
        trips,
    )
    escrever_csv(
        pasta,
        "stop_times.txt",
        ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
        stop_times,
    )
    escrever_csv(
        pasta,
        "shapes.txt",
        ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
        shapes,
    )
    escrever_csv(
        pasta, "feed_info.txt",
        ["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version",
         "feed_contact_url"],
        [{"feed_publisher_name": "Gaivota Expressos (inventada para a demonstração)",
          "feed_publisher_url": "https://gaivota-expressos.example.org", "feed_lang": "pt",
          "feed_version": "demo-1", "feed_contact_url": "https://gaivota-expressos.example.org/contacto"}],
    )  # fmt: skip
    print(f"gtfs-expressos: {len(stops)} paragens, {len(trips)} viagens")
    return tracados


# ---------------------------------------------------------------------------
# o extrato à maneira do OpenStreetMap
# ---------------------------------------------------------------------------


class Osm:
    def __init__(self) -> None:
        self.proximo_no = 9_500_000_000
        self.proxima_via = 9_600_000_000
        self.nos: list[str] = []
        self.vias: list[str] = []
        self.relacoes: list[str] = []

    @staticmethod
    def _etiquetas(etiquetas: dict[str, str]) -> str:
        return "".join(
            f"\n    <tag k={quoteattr(k)} v={quoteattr(str(v))}/>" for k, v in etiquetas.items()
        )

    def no(self, x: float, y: float, etiquetas: dict[str, str] | None = None) -> int:
        self.proximo_no += 1
        lon, lat = graus(x, y)
        corpo = self._etiquetas(etiquetas or {})
        fim = f">{corpo}\n  </node>" if corpo else "/>"
        self.nos.append(
            f'  <node id="{self.proximo_no}" lat="{lat:.7f}" lon="{lon:.7f}" version="1" '
            f'timestamp="2026-10-02T00:00:00Z"{fim}'
        )
        return self.proximo_no

    def via(self, pontos: list[tuple[float, float]], etiquetas: dict[str, str]) -> int:
        refs = [self.no(*p) for p in pontos]
        self.proxima_via += 1
        nds = "".join(f'\n    <nd ref="{r}"/>' for r in refs)
        self.vias.append(
            f'  <way id="{self.proxima_via}" version="1" timestamp="2026-10-02T00:00:00Z">'
            f"{nds}{self._etiquetas(etiquetas)}\n  </way>"
        )
        return self.proxima_via

    def relacao(self, vias: list[int], etiquetas: dict[str, str]) -> None:
        membros = "".join(f'\n    <member type="way" ref="{v}" role=""/>' for v in vias)
        self.relacoes.append(
            f'  <relation id="{9_700_000_001 + len(self.relacoes)}" version="1" '
            f'timestamp="2026-10-02T00:00:00Z">{membros}{self._etiquetas(etiquetas)}\n  </relation>'
        )

    def escrever(self, caminho: Path) -> None:
        cabeca = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            "<!--\n"
            "  Extrato INVENTADO, com a forma de um extrato do OpenStreetMap, para a\n"
            "  região de demonstração (as Terras do Ameno). Não tem um único objeto do\n"
            "  OpenStreetMap verdadeiro: os identificadores estão na gama 95xxxxxxxx e\n"
            "  seguintes para ninguém os confundir com objetos reais.\n"
            "\n"
            "  Gerado por data/manual/demo/inventar.py — não se edita à mão.\n"
            "-->\n"
            '<osm version="0.6" generator="paragem-demonstracao">\n'
        )
        corpo = "\n".join(self.nos + self.vias + self.relacoes)
        caminho.write_text(cabeca + corpo + "\n</osm>\n", encoding="utf-8")


#: As estações de bicicletas: (nó, nome, lugares).
BICICLETAS = [
    ("pa:3:3", "Bici Ameno — Terminal", 16),
    ("e:pa", "Bici Ameno — Estação de Porto Ameno", 14),
    ("pa:5:7", "Bici Ameno — Hospital", 10),
    ("pa:0:3", "Bici Ameno — Jardim do Rio", 12),
    ("pa:0:6", "Bici Ameno — Escola Secundária", 10),
    ("e:al", "Bici Ameno — Estação de Almeão", 12),
    ("al:2:2", "Bici Ameno — Centro de Almeão", 10),
    ("al:4:4", "Bici Ameno — Castelo de Almeão", 8),
]

TAXIS = [
    ("pa:3:3", "Praça de táxis do Terminal"),
    ("e:pa", "Praça de táxis da Estação de Porto Ameno"),
    ("al:2:2", "Praça de táxis de Almeão"),
    ("sa:2:2", "Praça de táxis de Saramela"),
    ("co:1:2", "Praça de táxis de Corvalinho"),
    ("mt:1:1", "Praça de táxis de Montelírio"),
]

#: Os sítios que se procuram: (nó, nome, etiquetas).
SITIOS = [
    ("pa:5:7", "Hospital de Porto Ameno", {"amenity": "hospital"}),
    ("pa:4:4", "Câmara Municipal de Porto Ameno", {"amenity": "townhall"}),
    ("pa:0:6", "Escola Secundária de Porto Ameno", {"amenity": "school"}),
    ("pa:3:6", "Mercado Municipal de Porto Ameno", {"amenity": "marketplace"}),
    ("pa:4:3", "Biblioteca Municipal de Porto Ameno", {"amenity": "library"}),
    ("pa:5:1", "Piscinas Municipais de Porto Ameno", {"leisure": "sports_centre"}),
    ("pa:2:5", "Centro de Saúde de Porto Ameno", {"healthcare": "centre"}),
    ("pa:3:3", "Terminal Rodoviário de Porto Ameno", {"amenity": "bus_station"}),
    ("pa:0:4", "Museu do Rio Ameno", {"tourism": "museum"}),
    ("al:2:3", "Câmara Municipal de Almeão", {"amenity": "townhall"}),
    ("al:2:5", "Centro de Saúde de Almeão", {"healthcare": "centre"}),
    ("al:0:2", "Escola Básica de Almeão", {"amenity": "school"}),
    ("al:3:3", "Mercado de Almeão", {"amenity": "marketplace"}),
    ("al:4:4", "Castelo de Almeão", {"historic": "castle"}),
    ("sa:2:3", "Câmara Municipal de Saramela", {"amenity": "townhall"}),
    ("sa:3:1", "Centro de Saúde de Saramela", {"healthcare": "centre"}),
    ("sa:3:3", "Escola Básica de Saramela", {"amenity": "school"}),
    ("sa:1:1", "Igreja Matriz de Saramela", {"amenity": "place_of_worship"}),
    ("co:1:3", "Câmara Municipal de Corvalinho", {"amenity": "townhall"}),
    ("co:0:1", "Centro de Saúde de Corvalinho", {"healthcare": "centre"}),
    ("cg:c", "Miradouro do Cerro da Gralha", {"tourism": "viewpoint"}),
    ("mt:2:2", "Câmara Municipal de Montelírio", {"amenity": "townhall"}),
    ("mt:0:1", "Centro de Saúde de Montelírio", {"healthcare": "centre"}),
    ("mt:0:2", "Escola Secundária de Montelírio", {"amenity": "school"}),
    ("br:c", "Praia Fluvial de Brisalva", {"tourism": "attraction"}),
]

#: O urbano da câmara de Almeão: uma volta pela vila, a partir da estação.
CIRCULAR_DE_ALMEAO = [
    "alm_estacao", "alm_castelo", "alm_mercado", "alm_saude", "alm_centro", "alm_escola",
    "alm_fonte", "alm_estacao",
]  # fmt: skip


def extrato_osm() -> None:
    osm = Osm()
    for n, nome, lugares in BICICLETAS:
        x, y = POS[n]
        osm.no(
            x + 0.02, y + 0.012,
            {"amenity": "bicycle_rental", "brand": "Bici Ameno", "network": "Bici Ameno",
             "operator": "Comunidade Intermunicipal das Terras do Ameno", "name": nome,
             "capacity": str(lugares)},
        )  # fmt: skip
    for n, nome in TAXIS:
        x, y = POS[n]
        osm.no(x - 0.018, y + 0.015, {"amenity": "taxi", "name": nome})
    for n, nome, etiquetas in SITIOS:
        x, y = POS[n]
        osm.no(x + 0.03, y - 0.025, {**etiquetas, "name": nome})
    for v in VILAS:
        classe = "city" if v.classe == "city" else "town"
        osm.no(v.x, v.y, {"place": classe, "name": v.nome})
    for nome, x, y, _ in ALDEIAS.values():
        osm.no(x, y, {"place": "village", "name": nome})

    nos, _ = caminho(CIRCULAR_DE_ALMEAO)
    via = osm.via(
        [POS[n] for n in nos], {"highway": "residential", "name": "Volta da Circular de Almeão"}
    )
    osm.relacao(
        [via],
        {"type": "route", "route": "bus", "ref": "AC", "name": "Almeão Circular",
         "network": "Almeão Circular", "operator": "C.M. Almeão", "colour": "#5B3A8E"},
    )  # fmt: skip
    osm.escrever(AQUI / "demo.osm.xml")
    print(f"demo.osm.xml: {len(BICICLETAS)} estações, {len(TAXIS)} praças, {len(SITIOS)} sítios")


# ---------------------------------------------------------------------------
# as tabelas: o transporte a pedido e o urbano da câmara
# ---------------------------------------------------------------------------

RESERVA = "Reserva até às 15h00 do dia útil anterior"


def h(m: int) -> str:
    return f"{m // 60}:{m % 60:02d}"


def tabela(caminho: Path, cabecalho: str, circuitos: list[dict]) -> None:
    linhas = [f"# {x}".rstrip() for x in cabecalho.strip().splitlines()]
    linhas.append("")
    linhas.append("fonte: inventado para a região de demonstração")
    linhas.append("circuitos:")
    for c in circuitos:
        linhas.append(f"  - nome: {json.dumps(c['nome'], ensure_ascii=False)}")
        if c.get("tipo"):
            linhas.append(f"    tipo: {c['tipo']}")
        linhas.append("    regras:")
        for r in c["regras"]:
            linhas.append(f"      - {json.dumps(r, ensure_ascii=False)}")
        linhas.append(f"    colunas: {json.dumps(c['colunas'], ensure_ascii=False)}")
        if c.get("coordenadas"):
            linhas.append("    coordenadas:")
            for nome, (lat, lon) in c["coordenadas"].items():
                linhas.append(f"      {json.dumps(nome, ensure_ascii=False)}: [{lat}, {lon}]")
        linhas.append("    paragens:")
        for nome, horas in c["paragens"]:
            linhas.append(f"      - [{json.dumps(nome, ensure_ascii=False)}, {json.dumps(horas)}]")
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text("\n".join(linhas) + "\n", encoding="utf-8")


def grelha(paragens: list[tuple[str, list[int]]], partidas: list[int]) -> list:
    """(nome, minutos desde a primeira) × partidas → a grelha em texto."""
    return [[nome, [h(p + m) for p in partidas]] for nome, m in paragens]


def tabelas() -> None:
    pasta = AQUI / "tabelas"
    tabela(
        pasta / "corvalinho.yaml",
        """
O transporte a pedido do concelho de Corvalinho — INVENTADO.

Dois circuitos: o da Serra, que desce de Cerro da Gralha e de Serrabela à
vila, e a ligação de Covas do Vento a Porto Ameno, que atravessa a fronteira
do concelho. Só circulam com reserva.
""",
        [
            {
                "nome": "Circuito da Serra",
                "regras": ["Terças e quintas, exceto feriados", RESERVA],
                "colunas": ["Ida", "Volta"],
                "paragens": [
                    ["Cerro da Gralha (Largo)", ["8:40", "13:25"]],
                    ["Cerro da Gralha (Miradouro)", ["8:44", "13:21"]],
                    ["Serrabela (Igreja)", ["8:56", "13:09"]],
                    ["Serrabela (Fonte)", ["8:59", "13:06"]],
                    ["Corvalinho (Centro de Saúde)", ["9:12", "12:53"]],
                    ["Corvalinho (Mercado)", ["9:15", "12:50"]],
                ],
            },
            {
                "nome": "Ligação Covas do Vento – Porto Ameno",
                "regras": ["Segundas, quartas e sextas, exceto feriados", RESERVA],
                "colunas": ["Ida", "Volta"],
                "paragens": [
                    ["Covas do Vento (Igreja)", ["8:10", "17:40"]],
                    ["Covas do Vento (Escola Velha)", ["8:13", "17:37"]],
                    ["Corvalinho (Centro)", ["8:31", "17:19"]],
                    ["Porto Ameno (Terminal)", ["8:52", "16:58"]],
                    ["Porto Ameno (Hospital)", ["8:58", "16:50"]],
                ],
            },
        ],
    )
    tabela(
        pasta / "saramela.yaml",
        """
O transporte a pedido do concelho de Saramela — INVENTADO.

O circuito das Lontras sobe a ribeira até Lontral e às casas espalhadas à
volta, onde a carreira regular só passa três vezes por dia. Duas épocas: no
período escolar há uma volta à hora de saída da escola.
""",
        [
            {
                "nome": "Circuito das Lontras",
                "regras": ["Segundas, quartas e sextas, exceto feriados", RESERVA],
                "colunas": [
                    "Período escolar - Ida", "Período escolar - Volta",
                    "Férias escolares - Ida", "Férias escolares - Volta",
                ],
                "paragens": [
                    ["Lontral (Largo)", ["8:05", "17:05", "9:05", "12:35"]],
                    ["Lontral (Fonte)", ["8:08", "17:02", "9:08", "12:32"]],
                    ["Casal das Lontras", ["8:14", "16:56", "9:14", "12:26"]],
                    ["Saramela (Igreja)", ["8:27", "16:43", "9:27", "12:13"]],
                    ["Saramela (Centro de Saúde)", ["8:31", "16:39", "9:31", "12:09"]],
                    ["Saramela (Escola)", ["8:34", "16:35", "", ""]],
                ],
            },
        ],
    )  # fmt: skip
    tabela(
        pasta / "montelirio.yaml",
        """
O transporte a pedido do concelho de Montelírio — INVENTADO.

Um circuito ao sábado, que é dia de mercado na vila.
""",
        [
            {
                "nome": "Circuito do Lírio",
                "regras": ["Sábados, exceto feriados", RESERVA],
                "colunas": ["Ida", "Volta"],
                "paragens": [
                    ["Casais do Lírio (Capela)", ["8:30", "12:40"]],
                    ["Casais do Lírio (Escola)", ["8:33", "12:37"]],
                    ["Montelírio (Mercado)", ["8:52", "12:18"]],
                    ["Montelírio (Centro de Saúde)", ["8:56", "12:15"]],
                ],
            },
        ],
    )
    # O URBANO DA CÂMARA, com as coordenadas de cada paragem: as mesmas da
    # rede, porque é a mesma vila e o mesmo poste.
    nos, minutos = caminho(CIRCULAR_DE_ALMEAO)
    seq = [(PARAGENS[p][0], round(m)) for p, m in zip(CIRCULAR_DE_ALMEAO, minutos, strict=True)]
    coordenadas = {}
    for p in CIRCULAR_DE_ALMEAO:
        lon, lat = graus(*POS[PARAGENS[p][1]])
        coordenadas[PARAGENS[p][0]] = (lat, lon)
    uteis = cada("07:30", "19:30", 60)
    sabados = cada("08:30", "12:30", 60)
    tabela(
        pasta / "almeao-circular.yaml",
        """
O urbano da Câmara Municipal de Almeão — INVENTADO.

Uma volta à vila a partir da estação, de hora a hora nos dias úteis e ao
sábado de manhã. É da câmara e não da rede: tem a sua cor, o seu nome e o seu
horário, e o produto mostra-o ao lado do resto sem pedir a ninguém que saiba
quem gere o quê.
""",
        [
            {
                "nome": "Dias úteis",
                "regras": ["Segunda a sexta, exceto feriados", "Gratuito"],
                "colunas": [h(p) for p in uteis],
                "coordenadas": coordenadas,
                "paragens": grelha(seq[:-1], uteis),
            },
            {
                "nome": "Sábados",
                "regras": ["Sábados, exceto feriados", "Gratuito"],
                "colunas": [h(p) for p in sabados],
                "coordenadas": coordenadas,
                "paragens": grelha(seq[:-1], sabados),
            },
        ],
    )
    print("tabelas: corvalinho, saramela, montelirio, almeao-circular")


# ---------------------------------------------------------------------------
# a geografia: o mapa e a carta administrativa
# ---------------------------------------------------------------------------


def concelhos() -> dict[str, Polygon]:
    """Os concelhos, de fronteiras orgânicas e sem buracos nem sobreposições."""
    ancoras: list[tuple[float, float]] = []
    dono: list[str] = []
    for cid, (*_, pontos) in CONCELHOS.items():
        for p in pontos:
            ancoras.append(p)
            dono.append(cid)
    celulas = voronoi_polygons(MultiPoint(ancoras), extend_to=box(-60, -60, 60, 60), ordered=True)
    terra = contorno()
    juntos = {
        cid: unary_union(
            [c.intersection(terra) for c, d in zip(celulas.geoms, dono, strict=True) if d == cid]
        )
        for cid in CONCELHOS
    }
    # A rede das fronteiras, deformada: o mesmo vértice desloca-se da mesma
    # maneira nos dois concelhos que o partilham, e a cobertura fica fechada.
    linhas = unary_union([p.boundary for p in juntos.values()]).segmentize(0.2)

    def torcer(g):
        from shapely import transform

        def f(c):
            c = c.copy()
            for k in range(len(c)):
                c[k, 0], c[k, 1] = deformar(c[k, 0], c[k, 1])
            return c

        return transform(g, f)

    faces = list(polygonize(torcer(linhas).geoms).geoms)
    saida: dict[str, Polygon] = {}
    for cid, p in juntos.items():
        assert p.geom_type == "Polygon", f"{cid} saiu em {p.geom_type}"
        alvo = torcer(p.representative_point())
        dentro = [f for f in faces if f.contains(alvo)]
        assert len(dentro) == 1, cid
        saida[cid] = dentro[0]
    return saida


def rio() -> dict[str, list[tuple[float, float]]]:
    return {
        "Rio Ameno": catmull_rom(
            [(14.0, 16.2), (12.2, 14.0), (10.5, 12.4), (8.4, 10.6), (6.4, 8.4), (4.6, 6.3),
             (3.4, 4.3), (2.4, 2.4), (1.2, 1.0), (0.1, 0.22), (-1.0, -0.08), (-2.3, -0.7),
             (-3.4, -3.8),
             (-5.6, -5.4), (-8.0, -6.0), (-10.5, -6.3), (-13.6, -8.4), (-16.0, -10.6),
             (-18.6, -12.4)],
            0.08,
        ),
        "Ribeira das Lontras": catmull_rom(
            [(-16.2, 10.2), (-15.2, 7.0), (-14.4, 3.2), (-13.0, -0.6), (-12.3, -3.2),
             (-11.4, -5.2), (-10.5, -6.3)],
            0.08,
        ),
    }  # fmt: skip


def predios(ruas: list[tuple[list[tuple[float, float]], str]], proibido) -> list[Polygon]:
    """Casas ao longo das ruas das vilas, de um lado e do outro."""
    r = acaso("predios")
    linhas_das_ruas = [LineString(p) for p, _ in ruas]
    arvore = STRtree(linhas_das_ruas)
    feitos: list[Polygon] = []
    for linha in linhas_das_ruas:
        comp = linha.length
        passo = 0.024
        t = 0.03
        while t < comp - 0.03:
            a = linha.interpolate(t)
            b = linha.interpolate(min(t + 0.001, comp))
            dx, dy = b.x - a.x, b.y - a.y
            n = math.hypot(dx, dy) or 1.0
            ux, uy = dx / n, dy / n
            for lado in (-1, 1):
                if r.random() < 0.12:
                    continue
                largura = r.uniform(0.010, 0.016)
                fundo = r.uniform(0.010, 0.017)
                afast = 0.016 + fundo / 2 + r.uniform(0, 0.004)
                cx, cy = a.x - uy * afast * lado, a.y + ux * afast * lado
                cantos = [
                    (
                        cx + ux * largura / 2 - uy * fundo / 2,
                        cy + uy * largura / 2 + ux * fundo / 2,
                    ),
                    (
                        cx - ux * largura / 2 - uy * fundo / 2,
                        cy - uy * largura / 2 + ux * fundo / 2,
                    ),
                    (
                        cx - ux * largura / 2 + uy * fundo / 2,
                        cy - uy * largura / 2 - ux * fundo / 2,
                    ),
                    (
                        cx + ux * largura / 2 + uy * fundo / 2,
                        cy + uy * largura / 2 - ux * fundo / 2,
                    ),
                ]
                casa = Polygon(cantos)
                perto = arvore.query(casa.buffer(0.011))
                if any(linhas_das_ruas[i].distance(casa) < 0.011 for i in perto):
                    continue
                if proibido.intersects(casa):
                    continue
                feitos.append(casa)
            t += passo
    # Duas casas no mesmo sítio não: fica a primeira.
    finais: list[Polygon] = []
    arvore_casas = STRtree(feitos)
    tirar: set[int] = set()
    for i, c in enumerate(feitos):
        if i in tirar:
            continue
        for j in arvore_casas.query(c):
            if j > i and feitos[j].intersects(c):
                tirar.add(int(j))
        finais.append(c)
    return finais


def geografia(tracados_rede, tracados_expresso) -> None:
    feicoes: list[dict] = []

    def juntar(geom, **props):
        feicoes.append(
            {"type": "Feature", "properties": props, "geometry": em_graus(geom).__geo_interface__}
        )

    # 1. Os concelhos — a carta administrativa e o desenho das fronteiras.
    cs = concelhos()
    for cid, poligono in cs.items():
        nome, dico, membro, _prefixo, _ = CONCELHOS[cid]
        juntar(poligono, camada="concelho", id=cid, nome=nome, dico=dico, membro=membro)
    terra = unary_union(list(cs.values()))

    # 2. A água: o rio, a ribeira e a albufeira.
    rios = rio()
    albufeira = (
        LineString([p for p in rios["Rio Ameno"] if 4.4 <= p[0] <= 10.8 and p[1] > 6.0])
        .buffer(0.55)
        .union(mancha(7.4, 9.3, 1.0, "albufeira"))
        .simplify(0.01)
    )
    leito = LineString(rios["Rio Ameno"]).buffer(0.035)
    agua = albufeira.union(leito).intersection(terra.buffer(0.3))
    juntar(agua, camada="water", **{"class": "lake"})
    for nome, pontos in rios.items():
        classe = "river" if nome.startswith("Rio") else "stream"
        juntar(LineString(pontos), camada="waterway", **{"class": classe, "name": nome})
    juntar(LineString(rios["Rio Ameno"][40:160]), camada="water_name", name="Rio Ameno")
    juntar(
        LineString(rios["Ribeira das Lontras"][30:110]),
        camada="water_name",
        name="Ribeira das Lontras",
    )
    eixo = LineString([(5.2, 7.4), (7.4, 9.4), (9.6, 11.4)])
    juntar(eixo, camada="water_name", name="Albufeira do Ameno")

    # 3. O casario das vilas e das aldeias, e os jardins.
    ruas_das_vilas = [(p, n) for p, _c, n, urbana in VIAS if urbana and len(p) >= 2]
    casario = []
    for v in VILAS:
        ruas = [LineString(p) for p, n in ruas_das_vilas if dist(p[0], (v.x, v.y)) < 2.0]
        casario.append(unary_union(ruas).buffer(0.17 if v.classe == "city" else 0.14).buffer(-0.04))
    for aid, (_n, x, y, _a) in ALDEIAS.items():
        casario.append(mancha(x, y, 0.26, f"aldeia-{aid}"))
    casario_todo = unary_union(casario).difference(agua)
    juntar(casario_todo, camada="landuse", **{"class": "residential"})
    jardins = [
        ("Jardim do Rio", mancha(-0.6, 0.05, 0.26, "jardim-do-rio").difference(agua)),
        ("Parque da Fonte", mancha(8.25, -2.7, 0.2, "parque-da-fonte")),
        ("Parque da Lagoa", mancha(-10.6, 21.4, 0.22, "parque-da-lagoa")),
    ]
    for nome, g in jardins:
        juntar(g, camada="park", **{"class": "public_park", "name": nome})

    # 4. O verde: matas, campos e mato, por fora do casario e da água.
    ocupado = unary_union([casario_todo, agua, *[g for _, g in jardins]])
    verdes = [
        ("forest", -9.0, 15.0, 3.6), ("forest", 15.0, 4.0, 2.8), ("forest", -15.5, -2.0, 2.5),
        ("forest", 2.0, 13.0, 2.2), ("forest", 6.0, -15.0, 2.5), ("forest", -12.5, -13.0, 2.2),
        ("wood", 11.5, 9.5, 1.6), ("wood", -2.5, -12.5, 1.5), ("wood", 17.0, -14.0, 1.4),
        ("farmland", -8.0, -4.2, 2.0), ("farmland", 2.0, -6.0, 2.4), ("farmland", 10.0, -10.0, 2.0),
        ("farmland", -3.0, 8.5, 1.8), ("farmland", 12.0, 1.0, 1.6), ("farmland", -12.0, 6.5, 1.5),
        ("farmland", 6.5, 3.5, 1.4),
        ("scrub", -16.0, 9.0, 1.8), ("scrub", 9.0, 13.5, 2.0), ("scrub", -6.0, -15.0, 1.6),
        ("grass", -4.6, 2.2, 0.9), ("grass", 13.0, -13.5, 0.8),
        ("forest", -6.0, 3.0, 2.0), ("forest", 7.5, -8.0, 2.2), ("forest", -14.5, -8.0, 1.9),
        ("forest", 16.5, -4.0, 1.7), ("forest", 4.0, 15.0, 1.8), ("forest", -1.0, -7.5, 1.6),
        ("farmland", 4.5, -2.5, 1.6), ("farmland", -9.0, 2.5, 1.7), ("farmland", -2.5, -15.0, 1.5),
        ("farmland", 14.0, 9.5, 1.7), ("farmland", -15.5, 14.5, 1.3), ("farmland", 9.0, 6.5, 1.2),
        ("scrub", 1.5, 10.0, 1.5), ("scrub", -11.0, -10.5, 1.6), ("scrub", 15.0, -16.0, 1.2),
        ("wood", -6.5, 15.8, 1.3), ("wood", 11.0, -14.5, 1.4),
    ]  # fmt: skip
    for k, (classe, x, y, raio) in enumerate(verdes):
        g = mancha(x, y, raio, f"verde-{k}").intersection(terra).difference(ocupado)
        if not g.is_empty:
            juntar(g, camada="landcover", **{"class": classe})

    # 5. As estradas, as ruas e a linha de comboio.
    for pontos, classe, nome, _urbana in VIAS:
        juntar(LineString(pontos), camada="transportation", **{"class": classe, "name": nome})
    juntar(
        LineString(CARRIL),
        camada="transportation",
        **{"class": "rail", "name": "Linha do Ameno"},
    )

    # 6. Os edifícios, de perto.
    ruas_para_casas = [(p, n) for p, n in ruas_das_vilas]
    for casa in predios(ruas_para_casas, unary_union([agua, *[g for _, g in jardins]])):
        juntar(casa, camada="building")

    # 7. Os nomes das terras.
    for v in VILAS:
        juntar(Point(v.x, v.y), camada="place", **{"class": v.classe, "name": v.nome})
    for nome, x, y, _ in ALDEIAS.values():
        juntar(Point(x, y), camada="place", **{"class": "village", "name": nome})
    bairros = [("Bairro do Moinho", *POS["pa:0:0"]), ("Alto da Brisa", *POS["p:alto-da-brisa"])]
    for nome, x, y in bairros:
        juntar(Point(x, y), camada="place", **{"class": "suburb", "name": nome})

    texto = (
        '{"type":"FeatureCollection",\n'
        '"name":"As Terras do Ameno — geografia inventada para a demonstração do Paragem.pt",\n'
        '"features":[\n'
        + ",\n".join(json.dumps(f, ensure_ascii=False, separators=(",", ":")) for f in feicoes)
        + "\n]}\n"
    )
    (AQUI / "geografia.geojson").write_text(texto, encoding="utf-8")
    contas: dict[str, int] = {}
    for f in feicoes:
        contas[f["properties"]["camada"]] = contas.get(f["properties"]["camada"], 0) + 1
    print("geografia.geojson:", ", ".join(f"{k} {v}" for k, v in sorted(contas.items())))

    # A CONFERÊNCIA: cada paragem no concelho que o prefixo diz.
    prefixo_de = {cid: c[3] for cid, c in CONCELHOS.items()}
    for pid, (nome, n) in PARAGENS.items():
        p = Point(*POS[n])
        donos = [cid for cid, g in cs.items() if g.contains(p)]
        assert donos, f"{pid} ({nome}) está fora de todos os concelhos"
        assert pid.split("_")[0] == prefixo_de[donos[0]], f"{pid} está em {donos[0]}"


# ---------------------------------------------------------------------------


def somas_no_registo() -> None:
    """Põe no `data/sources.yaml` a soma dos ficheiros únicos que acabou de escrever.

    Um ficheiro de acesso local declara a soma (é o que garante que não muda
    sem se dar por isso), e quem o muda de propósito é este gerador — por
    isso é ele que a atualiza, em vez de a deixar a reprovar no teste seguinte.
    """
    import hashlib
    import re

    registo = AQUI.parents[2] / "data" / "sources.yaml"
    texto = registo.read_text(encoding="utf-8")
    for fonte, ficheiro in (("demo-geografia", "geografia.geojson"), ("demo-osm", "demo.osm.xml")):
        soma = hashlib.sha256((AQUI / ficheiro).read_bytes()).hexdigest()
        bloco = re.search(rf"(?ms)^  - id: {re.escape(fonte)}\n.*?(?=^  - id: |^  # ---|\Z)", texto)
        assert bloco, f"{fonte} não está em data/sources.yaml"
        corpo = bloco.group(0)
        if re.search(r"(?m)^    sha256: ", corpo):
            novo = re.sub(r"(?m)^    sha256: .*$", f'    sha256: "{soma}"', corpo)
        else:
            novo = re.sub(r"(?m)^(    ficheiro: .*)$", rf'\1\n    sha256: "{soma}"', corpo, count=1)
        texto = texto.replace(corpo, novo)
    registo.write_text(texto, encoding="utf-8")


def main() -> None:
    construir_vilas()
    construir_aldeias()
    construir_estradas()
    construir_ferrovia()
    T_COMBOIO.update(tempos_do_comboio())
    linhas = linhas_da_rede()
    tracados_rede = gtfs_da_rede(linhas)
    gtfs_do_comboio()
    tracados_expresso = gtfs_dos_expressos()
    extrato_osm()
    tabelas()
    geografia(tracados_rede, tracados_expresso)
    somas_no_registo()
    # As viagens de prova da receita apontam para estas coordenadas.
    for pid in ("cor_estacao", "sar_centro", "mon_azenhas_estacao", "pam_hospital",
                "pam_terminal", "mon_centro", "cor_covas", "alm_centro"):  # fmt: skip
        lon, lat = graus(*coordenadas_da_paragem(pid))
        print(f"   {PARAGENS[pid][0]}: lat {lat}, lon {lon}")
    for sid in ("pa", "co", "al", "az", "mt", "vs"):
        a = POS[f"e:{sid}"]
        b = next((x, y) for s, x, y in FERROVIA if s == sid)
        assert dist(a, b) < 0.1, sid


if __name__ == "__main__":
    main()
