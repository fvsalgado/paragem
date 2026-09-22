"""POR ONDE PASSA O AUTOCARRO, entre uma paragem e a seguinte.

O planeador desenha o percurso no mapa. Sem isto, desenha uma LINHA RETA de
paragem em paragem — um autocarro a cortar a direito por cima de campos, de
rios e de encostas.

**O motor não resolvia isto, e vale a pena registar porquê.** Medido: para uma
viagem de 51 paragens o OpenTripPlanner devolvia 100 pontos de geometria,
exatamente 2 por troço. Ou seja, linhas retas também. Ele constrói a forma de
um padrão a partir do `shapes.txt` do GTFS, e o feed reconstruído não tem
nenhum. E a opção `matchBusRoutesToStreets`, que existia no OTP 1, já não
existe no 2.6 — a construção rejeita-a como parâmetro desconhecido.

**A fonte é a operadora, e não um palpite nosso.** O GTFS que serve de base
geométrica à reconstrução (§6.2) traz os traçados que a operadora desenhou.
Corta-se cada traçado nos pontos mais próximos de cada paragem, e guarda-se o
pedaço entre cada par de paragens consecutivas. Medido nesta região: 572
traçados cobrem **97 %** dos troços da rede atual.

Os 3 % que faltam ficam sem forma, e a interface desenha-os a direito — que é
o que sempre fez. Não se inventa uma estrada para tapar o buraco: uma linha
reta vê-se que é esquemática, e uma linha por cima da estrada errada parece
verdade.

**GUARDA-SE POR LINHA, e é uma decisão de dados móveis.** Tudo junto são 170 kB
comprimidos, a 25 m de tolerância. Por linha, o navegador busca só as duas ou
três que vai desenhar — uns poucos kB por viagem, e nada para quem não abre as
direções.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .gtfs import Gtfs

# A que distância a forma pode afastar-se do traçado original.
#
# Vinte e cinco metros é mais do que a largura de uma estrada, e num mapa de
# região não se distingue. Medido: a 0 m são 507 kB comprimidos, a 10 m são
# 238 kB, a 25 m são 170 kB. É o joelho da curva.
TOLERANCIA_METROS = 25.0

# Acima disto o ponto do traçado não é «esta paragem»: é outra coisa. Uma
# paragem que caia longe da forma da própria viagem que a serve quer dizer que
# a forma não é daquela viagem — e cortá-la ali dá um pedaço de estrada que não
# tem nada a ver.
#
# Cem metros, e não trezentos: medido, a mediana da distância entre a ponta do
# traçado e a paragem é 6 m e o 90.º percentil é 10 m. O que passa dos 100 já
# não é imprecisão de desenho.
MAXIMO_DA_PARAGEM_A_FORMA = 100.0

# QUATRO VEZES A LINHA RETA, E DEITA-SE FORA.
#
# Um traçado que passe duas vezes pela mesma rua — o autocarro que entra na
# aldeia e volta a sair — faz o corte apanhar a volta inteira. Medido: 91 dos
# 8 541 troços, 1,1 %, e o pior dava 11,8 km de estrada entre duas paragens a
# 119 m uma da outra.
#
# O que se desenha nesse caso é uma linha reta, como sempre se desenhou. É
# deliberado: uma reta VÊ-SE que é esquemática, e ninguém pensa que o
# autocarro voa por cima dos campos. Uma volta de doze quilómetros desenhada
# por cima de estradas a sério parece verdade, e não é.
#
# A margem é larga de propósito — a mediana é 1,07 e o 90.º percentil 1,47 —,
# para não cortar os desvios que existem mesmo.
MAXIMO_SOBRE_A_LINHA_RETA = 4.0

# Abaixo disto a razão não diz nada: duas paragens a 20 m uma da outra, em
# lados opostos da rua, dão razões enormes sem que nada esteja errado.
RETA_MINIMA_PARA_COMPARAR = 50.0


def metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (a[0] - b[0]) * 111_320
    dx = (a[1] - b[1]) * 111_320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


def simplificar(linha: list[tuple[float, float]], tolerancia: float) -> list[tuple[float, float]]:
    """Douglas-Peucker: tira os pontos que não mudam o desenho."""
    if len(linha) < 3:
        return linha
    a, b = linha[0], linha[-1]
    pior, onde = 0.0, 0
    for i in range(1, len(linha) - 1):
        # Distância do ponto à reta a–b, em metros.
        num = abs((b[0] - a[0]) * (a[1] - linha[i][1]) - (a[0] - linha[i][0]) * (b[1] - a[1]))
        den = math.hypot(b[0] - a[0], b[1] - a[1]) or 1e-12
        d = num / den * 111_320
        if d > pior:
            pior, onde = d, i
    if pior <= tolerancia:
        return [a, b]
    return simplificar(linha[: onde + 1], tolerancia)[:-1] + simplificar(linha[onde:], tolerancia)


def codificar(pontos: list[tuple[float, float]]) -> str:
    """Polilinha do Google, que é o que o mapa já sabe ler."""
    saida = []
    lat_ant = lon_ant = 0
    for lat, lon in pontos:
        for valor, anterior in ((round(lat * 1e5), lat_ant), (round(lon * 1e5), lon_ant)):
            n = valor - anterior
            n = ~(n << 1) if n < 0 else n << 1
            while n >= 0x20:
                saida.append(chr((0x20 | (n & 0x1F)) + 63))
                n >>= 5
            saida.append(chr(n + 63))
        lat_ant, lon_ant = round(lat * 1e5), round(lon * 1e5)
    return "".join(saida)


@dataclass
class Resultado:
    """Os troços com forma, por linha, e o que ficou de fora."""

    por_linha: dict[int, dict[str, str]] = field(default_factory=dict)
    com_forma: int = 0
    sem_forma: int = 0
    pontos: int = 0

    @property
    def cobertura(self) -> float:
        total = self.com_forma + self.sem_forma
        return self.com_forma / total if total else 0.0


def _trocos_do_feed(
    base: Gtfs, tolerancia: float
) -> dict[tuple[str, str], list[tuple[float, float]]]:
    """Cada par de paragens consecutivas, com o pedaço de traçado entre elas."""
    formas: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for p in base.obter("shapes.txt"):
        try:
            formas[p["shape_id"]].append(
                (
                    int(p["shape_pt_sequence"]),
                    float(p["shape_pt_lat"]),
                    float(p["shape_pt_lon"]),
                )
            )
        except (KeyError, ValueError):
            continue
    ordenadas = {k: [(la, lo) for _, la, lo in sorted(v)] for k, v in formas.items()}
    if not ordenadas:
        return {}

    paragens: dict[str, tuple[float, float]] = {}
    for s in base.stops:
        try:
            paragens[s["stop_id"]] = (float(s["stop_lat"]), float(s["stop_lon"]))
        except (KeyError, ValueError):
            continue

    forma_da_viagem = {t["trip_id"]: t.get("shape_id") for t in base.trips}
    horas: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for h in base.stop_times:
        try:
            horas[h["trip_id"]].append((int(h.get("stop_sequence") or 0), h["stop_id"]))
        except (KeyError, ValueError):
            continue

    trocos: dict[tuple[str, str], list[tuple[float, float]]] = {}
    for tid, pontos in horas.items():
        forma = ordenadas.get(forma_da_viagem.get(tid) or "")
        if not forma:
            continue
        sequencia = [sid for _, sid in sorted(pontos)]
        if any(sid not in paragens for sid in sequencia):
            continue

        # O CORTE AVANÇA SEMPRE, e é o que impede uma volta de se comer a si
        # mesma. Numa linha circular a mesma rua aparece duas vezes na forma;
        # procurar o ponto mais próximo desde o princípio devolvia o da
        # primeira passagem para uma paragem da segunda, e o troço saía ao
        # contrário.
        cortes: list[int] = []
        desde = 0
        for sid in sequencia:
            melhor, onde = 1e18, desde
            for i in range(desde, len(forma)):
                d = metros(forma[i], paragens[sid])
                if d < melhor:
                    melhor, onde = d, i
            if melhor > MAXIMO_DA_PARAGEM_A_FORMA:
                cortes.append(-1)
            else:
                cortes.append(onde)
                desde = onde

        for (a, b), (ia, ib) in zip(
            zip(sequencia, sequencia[1:], strict=False),
            zip(cortes, cortes[1:], strict=False),
            strict=False,
        ):
            if (a, b) in trocos or ia < 0 or ib < 0 or ib <= ia:
                continue
            pedaco = forma[ia : ib + 1]
            reta = metros(paragens[a], paragens[b])
            pela_estrada = sum(metros(pedaco[i], pedaco[i + 1]) for i in range(len(pedaco) - 1))
            if reta > RETA_MINIMA_PARA_COMPARAR and pela_estrada > MAXIMO_SOBRE_A_LINHA_RETA * reta:
                continue
            trocos[(a, b)] = simplificar(pedaco, tolerancia)
    return trocos


def construir(
    base: Gtfs,
    grelha: dict[str, Any],
    prefixo: str,
    tolerancia: float = TOLERANCIA_METROS,
) -> Resultado:
    """Junta os troços à grelha horária, agrupados pela linha que os percorre.

    `prefixo` é o do feed da própria rede na grelha (`meio:`, por exemplo): a
    base geométrica é outro ficheiro, mas as paragens são as mesmas, e é assim
    que os dois se encontram.
    """
    trocos = _trocos_do_feed(base, tolerancia)
    r = Resultado()
    if not trocos:
        return r

    ids = [p[0] for p in grelha["paragens"]]
    vistos: set[tuple[int, int, int]] = set()
    for linha, _servico, horas in grelha["viagens"]:
        seq = horas[0::3]
        for a, b in zip(seq, seq[1:], strict=False):
            if (linha, a, b) in vistos:
                continue
            vistos.add((linha, a, b))
            ia, ib = ids[a], ids[b]
            if not (ia.startswith(prefixo) and ib.startswith(prefixo)):
                r.sem_forma += 1
                continue
            forma = trocos.get((ia[len(prefixo) :], ib[len(prefixo) :]))
            if not forma:
                r.sem_forma += 1
                continue
            r.com_forma += 1
            r.pontos += len(forma)
            r.por_linha.setdefault(linha, {})[f"{a}>{b}"] = codificar(forma)
    return r


def escrever(destino: Path, r: Resultado, grelha: dict[str, Any]) -> tuple[int, int]:
    """Um ficheiro por linha, mais um índice que diz quais existem."""
    pasta = destino / "percursos"
    pasta.mkdir(parents=True, exist_ok=True)
    bytes_totais = 0
    for linha, trocos in sorted(r.por_linha.items()):
        # O CÓDIGO DA LINHA VAI DENTRO, e não é enfeite: os ficheiros são
        # nomeados pelo índice, e um índice vindo de outra construção aponta
        # para a linha errada. O navegador confere, e se não bater desenha a
        # direito em vez de desenhar mentira.
        dados = {"linha": grelha["linhas"][linha][0], "trocos": trocos}
        texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
        (pasta / f"{linha}.json").write_text(texto + "\n", encoding="utf-8")
        bytes_totais += len(texto) + 1
    indice = json.dumps(sorted(r.por_linha), separators=(",", ":"))
    (pasta / "indice.json").write_text(indice + "\n", encoding="utf-8")
    return len(r.por_linha), bytes_totais + len(indice) + 1
