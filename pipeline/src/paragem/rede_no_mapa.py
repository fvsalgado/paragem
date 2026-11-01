"""A REDE NO MAPA: por onde passam as linhas, e quantas vezes por dia útil.

O mapa da região era um mapa de transportes sem rede. Mostrava os pontos — um
disco por paragem, umas centenas numa cidade a z13 — e nenhum traço entre
eles: os traçados existiam (`percursos/<linha>.json`), mas só se desenhavam
para a viagem escolhida no planeador. Quem abria o mapa via onde se apanha o
autocarro e não por onde ele vai, que é o que um mapa de transportes diz antes
de qualquer outra coisa.

Este módulo escreve UM ficheiro, `rede-no-mapa.json`, com um traço por troço da
rede e o número de viagens que lá passam num dia útil. O mapa desenha-o por
baixo das paragens, mais grosso onde passa mais.

**A ESPESSURA É UMA CONTA SOBRE OS HORÁRIOS, e não um palpite.** Conta-se num
dia útil de referência — por feed, o conjunto de serviços que mais dias úteis
se repete na tabela, que numa rede com calendário escolar é o dia de aulas
corrente —, e as viagens dos dois sentidos somam-se quando o troço é o mesmo
(ver `PARECIDOS_METROS`). Uma linha que nesse dia não anda (só ao sábado, só
nas férias) continua no mapa, com zero viagens e o traço mais fino: um mapa da
rede que esconde uma linha por ela não andar à terça é um mapa que mente sobre
a rede.

**O QUE ENTRA.** As linhas da grelha do planeador cujo modo é da rede de
transporte público regular (`MODOS`). Os expressos ficam de fora: são serviço
privado (§6, cartão neutro), atravessam a região pela autoestrada sem parar
entre os nós, e um traço deles por cima da rede lia-se como mais uma carreira
regional. Os urbanos municipais que só existem como traçado do OpenStreetMap
(`osm-rotas`) entram com `viagens` desconhecidas — e desenham-se com o traço
mínimo, que é não afirmar uma frequência que não se conhece (§4.4).

**O QUE SE CORTA.** O comboio que toca a região entra inteiro na grelha (até
Lisboa, se for o caso), e desenhar a viagem toda punha no mapa da região uma
reta de duzentos quilómetros. Fica cada troço com pelo menos uma ponta dentro
da caixa de recorte da região — a fronteira atravessa-se, um troço para lá
dela, e não mais (§2: nunca cortar a linha NA fronteira).

**O TAMANHO.** Os troços que seguem uns aos outros com o mesmo modo e as mesmas
viagens juntam-se num traço só, e a geometria vai em polilinha do Google, que o
navegador já sabe ler (`descodificarLinha`). A forma é a do traçado da
operadora a 8 m (`TOLERANCIA_FINA`), e não a dos percursos do planeador, a 25.
Medido numa região real de 145 linhas: 1 607 traços, 113 kB comprimidos.

Não sabe o que é uma região: recebe a grelha, a pasta dos percursos e uma
caixa, e devolve o que desenhar.
"""

from __future__ import annotations

import gzip
import json
import math
from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

from .percursos import codificar

FICHEIRO = "rede-no-mapa.json"
FORMATO = "rede/1"

#: Os modos que se desenham como rede, pela ordem em que se empilham (o último
#: fica por cima). O expresso não está, de propósito — ver acima.
MODOS = ("autocarro", "urbano-municipal", "comboio")

#: Duas paragens a menos disto uma da outra são o MESMO SÍTIO para a rede: os
#: dois lados da mesma rua, os cais de um terminal. É o que deixa somar os dois
#: sentidos de um troço que a operadora serve com uma paragem de cada lado.
JUNTAS_METROS = 40.0

#: Dois traçados entre os mesmos dois sítios são o mesmo troço se nenhum ponto
#: de um se afastar disto do outro. Os percursos vêm simplificados a 25 m
#: (`percursos.TOLERANCIA_METROS`): abaixo disso a simplificação sozinha já os
#: separava. Acima de 50 m é outra rua — o sentido único de um centro de vila,
#: em que a ida e a volta passam por ruas diferentes e têm de ficar as duas.
PARECIDOS_METROS = 50.0

#: A que distância a forma de um troço pode afastar-se do traçado da operadora.
#:
#: Os percursos do planeador vêm a 25 m (`percursos.TOLERANCIA_METROS`), e para
#: desenhar uma viagem chega; para desenhar a REDE de perto não: a z16 vinte e
#: cinco metros são vinte e sete píxeis, e os traços atravessavam quarteirões a
#: direito. A 8 m são nove píxeis, e a forma segue a rua. Medido numa região
#: real de 145 linhas: 76 kB comprimidos a 25 m, 113 kB a 8 m — e o ficheiro é
#: um só, pedido uma vez.
TOLERANCIA_FINA = 8.0

#: Um troço por desenhar: (modo, viagens, sítio de partida, sítio de chegada, [(lat, lon)…]).
Aresta = tuple[str, int | None, int, int, list[tuple[float, float]]]


# --- o dia de referência ---------------------------------------------------


def _feed_do_servico(servico: str) -> str:
    return servico.split(":", 1)[0]


def dias_de_referencia(grelha: dict[str, Any]) -> dict[str, tuple[str, frozenset[int]]]:
    """Por feed, o dia útil típico: a data e os serviços que andam nela.

    O conjunto de serviços que mais dias úteis se repete — num calendário
    escolar é o das aulas, que são três quartos do ano —, e entre dois que se
    repitam o mesmo número de vezes, o de mais viagens e depois o mais cedo.
    Um feed sem dia útil nenhum (só fins de semana) conta com os dias que tem:
    um serviço de sábado continua a ser rede.
    """
    servicos: list[str] = grelha.get("servicos") or []
    feed_de = [_feed_do_servico(s) for s in servicos]
    viagens_do_servico = Counter(v[1] for v in grelha.get("viagens") or [])

    def contar(so_uteis: bool) -> dict[str, dict[frozenset[int], list[Any]]]:
        por_feed: dict[str, dict[frozenset[int], list[Any]]] = defaultdict(dict)
        for data, indices in sorted((grelha.get("datas") or {}).items()):
            if so_uteis and datetime.strptime(data, "%Y%m%d").weekday() >= 5:
                continue
            grupos: dict[str, set[int]] = defaultdict(set)
            for i in indices:
                grupos[feed_de[i]].add(i)
            for feed, conjunto in grupos.items():
                chave = frozenset(conjunto)
                registo = por_feed[feed].setdefault(chave, [0, data])
                registo[0] += 1
        return por_feed

    uteis = contar(True)
    todos = contar(False)
    escolha: dict[str, tuple[str, frozenset[int]]] = {}
    for feed in sorted(todos):
        candidatos = uteis.get(feed) or todos[feed]
        # Os candidatos estão pela ordem do primeiro dia em que aparecem, e o
        # `max` devolve o primeiro dos empatados: entre iguais, o mais cedo.
        conjunto, (_, data) = max(
            candidatos.items(),
            key=lambda item: (item[1][0], sum(viagens_do_servico[i] for i in item[0])),
        )
        escolha[feed] = (data, conjunto)
    return escolha


# --- geometria -------------------------------------------------------------


def _metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distância plana local entre dois (lat, lon), em metros."""
    dy = (a[0] - b[0]) * 110_540
    dx = (a[1] - b[1]) * 111_320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


def _ao_segmento(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distância de `p` ao segmento a–b, em metros (projeção plana à volta de `p`)."""
    k = math.cos(math.radians(p[0]))
    ax, ay = (a[1] - p[1]) * 111_320 * k, (a[0] - p[0]) * 110_540
    bx, by = (b[1] - p[1]) * 111_320 * k, (b[0] - p[0]) * 110_540
    dx, dy = bx - ax, by - ay
    comp = dx * dx + dy * dy
    t = 0.0 if comp == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / comp))
    return math.hypot(ax + t * dx, ay + t * dy)


def _a_linha(p: tuple[float, float], linha: list[tuple[float, float]]) -> float:
    if len(linha) == 1:
        return _metros(p, linha[0])
    return min(_ao_segmento(p, a, b) for a, b in zip(linha, linha[1:], strict=False))


def _pontos_ao_longo(linha: list[tuple[float, float]], fracoes: Iterable[float]):
    """Os pontos a cada fração do comprimento da linha."""
    trocos = [_metros(a, b) for a, b in zip(linha, linha[1:], strict=False)]
    total = sum(trocos)
    for f in fracoes:
        alvo, andado = f * total, 0.0
        for (a, b), d in zip(zip(linha, linha[1:], strict=False), trocos, strict=False):
            if andado + d >= alvo and d > 0:
                t = (alvo - andado) / d
                yield (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
                break
            andado += d
        else:
            yield linha[-1]


def parecidos(a: list[tuple[float, float]], b: list[tuple[float, float]]) -> bool:
    """Os dois traçados são o mesmo troço — ver `PARECIDOS_METROS`."""
    fracoes = (0.25, 0.5, 0.75)
    return all(_a_linha(p, b) <= PARECIDOS_METROS for p in _pontos_ao_longo(a, fracoes)) and all(
        _a_linha(p, a) <= PARECIDOS_METROS for p in _pontos_ao_longo(b, fracoes)
    )


def _descodificar(texto: str) -> list[tuple[float, float]]:
    """O par de `percursos.codificar`: polilinha → [(lat, lon)]."""
    pontos: list[tuple[float, float]] = []
    i = lat = lon = 0
    while i < len(texto):
        valores = []
        for _ in range(2):
            resultado = desvio = 0
            while True:
                byte = ord(texto[i]) - 63
                i += 1
                resultado |= (byte & 0x1F) << desvio
                desvio += 5
                if byte < 0x20:
                    break
            valores.append(~(resultado >> 1) if resultado & 1 else resultado >> 1)
        lat += valores[0]
        lon += valores[1]
        pontos.append((lat / 1e5, lon / 1e5))
    return pontos


# --- os sítios: paragens juntas -------------------------------------------


def _juntar_paragens(coordenadas: dict[int, tuple[float, float]]) -> dict[int, int]:
    """Cada paragem → o sítio a que pertence (o menor índice do grupo).

    União de vizinhas a menos de `JUNTAS_METROS`, numa grelha de células desse
    tamanho: cada paragem só se compara com as das nove células à volta.
    """
    pai = {i: i for i in coordenadas}

    def raiz(i: int) -> int:
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i

    if not coordenadas:
        return {}
    lat0 = sum(lat for lat, _ in coordenadas.values()) / len(coordenadas)
    lado_lat = JUNTAS_METROS / 110_540
    lado_lon = JUNTAS_METROS / (111_320 * math.cos(math.radians(lat0)))
    celulas: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, (lat, lon) in coordenadas.items():
        celulas[(int(lat // lado_lat), int(lon // lado_lon))].append(i)
    for (cy, cx), membros in celulas.items():
        vizinhos = [
            j for dy in (-1, 0, 1) for dx in (-1, 0, 1) for j in celulas.get((cy + dy, cx + dx), [])
        ]
        for i in membros:
            for j in vizinhos:
                if j <= i or raiz(i) == raiz(j):
                    continue
                if _metros(coordenadas[i], coordenadas[j]) <= JUNTAS_METROS:
                    a, b = raiz(i), raiz(j)
                    pai[max(a, b)] = min(a, b)
    return {i: raiz(i) for i in coordenadas}


# --- a rede ----------------------------------------------------------------


def _percursos_por_linha(pasta: Path | None, linhas: list[list[Any]]) -> dict[int, dict[str, str]]:
    """Os troços com forma de cada linha, de `percursos/<linha>.json`.

    O ficheiro diz o código da linha lá dentro, e confere-se: um índice de
    outra construção apontava para a linha errada, e aí desenha-se a direito
    em vez de desenhar mentira — a mesma regra do navegador.
    """
    saida: dict[int, dict[str, str]] = {}
    if pasta is None or not pasta.is_dir():
        return saida
    for i, linha in enumerate(linhas):
        caminho = pasta / f"{i}.json"
        if not caminho.exists():
            continue
        dados = json.loads(caminho.read_text(encoding="utf-8"))
        if dados.get("linha") == linha[0]:
            saida[i] = dados.get("trocos") or {}
    return saida


def construir(
    grelha: dict[str, Any],
    percursos: Path | None,
    caixa: tuple[float, float, float, float] | None = None,
    outros: Iterable[tuple[str, list[tuple[float, float]]]] = (),
    finas: dict[tuple[str, str], list[tuple[float, float]]] | None = None,
) -> dict[str, Any]:
    """O que o mapa desenha: um traço por troço, com o modo e as viagens.

    `caixa` é (lat_min, lat_max, lon_min, lon_max): fica cada troço com pelo
    menos uma ponta dentro dela. `outros` são traçados sem horário — (modo,
    [(lat, lon)…]) —, que entram com `viagens` desconhecidas. `finas` são as
    formas dos troços com mais pormenor do que as dos percursos, pelas chaves
    da grelha (`TOLERANCIA_FINA`); onde não houver, vale a do percurso.
    """
    paragens = grelha.get("paragens") or []
    linhas = grelha.get("linhas") or []
    referencia = dias_de_referencia(grelha)
    ativos = frozenset().union(*(c for _, c in referencia.values())) if referencia else frozenset()
    formas = _percursos_por_linha(percursos, linhas)

    def dentro(i: int) -> bool:
        if caixa is None:
            return True
        lat, lon = paragens[i][1], paragens[i][2]
        return caixa[0] <= lat <= caixa[1] and caixa[2] <= lon <= caixa[3]

    # Cada troço dirigido (modo, a, b): quantas viagens no dia de referência,
    # e que linhas o percorrem — para lhe ir buscar a forma.
    viagens: Counter[tuple[str, int, int]] = Counter()
    por_onde: dict[tuple[str, int, int], list[int]] = defaultdict(list)
    servicos = grelha.get("servicos") or []
    feeds_desenhados: set[str] = set()
    for linha, servico, horas in grelha.get("viagens") or []:
        modo = linhas[linha][3]
        if modo not in MODOS:
            continue
        feeds_desenhados.add(_feed_do_servico(servicos[servico]))
        seq = horas[0::3]
        for a, b in zip(seq, seq[1:], strict=False):
            if a == b or not (dentro(a) or dentro(b)):
                continue
            chave = (modo, a, b)
            if servico in ativos:
                viagens[chave] += 1
            else:
                viagens.setdefault(chave, 0)
            if linha not in por_onde[chave]:
                por_onde[chave].append(linha)

    usadas = {p for _, a, b in viagens for p in (a, b)}
    coord = {i: (float(paragens[i][1]), float(paragens[i][2])) for i in usadas}
    sitio = _juntar_paragens(coord)
    somas: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    for i, (lat, lon) in coord.items():
        acc = somas[sitio[i]]
        acc[0] += lat
        acc[1] += lon
        acc[2] += 1
    centro = {s: (a[0] / a[2], a[1] / a[2]) for s, a in somas.items()}

    # Os dois sentidos do mesmo troço, juntos: chave sem direção, entre sítios.
    grupos: dict[tuple[str, int, int], list[tuple[int, list[tuple[float, float]]]]] = defaultdict(
        list
    )
    for (modo, a, b), n in sorted(viagens.items()):
        sa, sb = sitio[a], sitio[b]
        if sa == sb:
            continue  # dentro do mesmo sítio: não se vê, e não liga nada
        forma: list[tuple[float, float]] | None = (finas or {}).get(
            (str(paragens[a][0]), str(paragens[b][0]))
        )
        for linha in [] if forma else por_onde[(modo, a, b)]:
            texto = formas.get(linha, {}).get(f"{a}>{b}")
            if texto:
                forma = _descodificar(texto)
                break
        if not forma or len(forma) < 2:
            forma = [coord[a], coord[b]]
        if sa > sb:
            sa, sb, forma = sb, sa, forma[::-1]
        grupos[(modo, sa, sb)].append((n, forma))

    arestas: list[Aresta] = []
    for (modo, sa, sb), membros in grupos.items():
        membros.sort(key=lambda m: (-m[0], len(m[1])))
        juntos: list[list[Any]] = []  # [viagens, forma]
        for n, forma in membros:
            for j in juntos:
                if parecidos(j[1], forma):
                    j[0] += n
                    break
            else:
                juntos.append([n, forma])
        for n, forma in juntos:
            # As pontas vão ao meio do sítio: dois troços que se seguem
            # encontram-se, em vez de ficarem a vinte metros um do outro, cada
            # um do seu lado da rua.
            linha = [centro[sa], *forma, centro[sb]]
            arestas.append((modo, n, sa, sb, _sem_repetidos(linha)))

    for modo, forma in outros:
        if len(forma) >= 2:
            arestas.append((modo, None, -1, -2, _sem_repetidos(list(forma))))

    trocos = _encadear(arestas)
    ordem_dos_modos = [m for m in MODOS if any(t[0] == m for t in trocos)]
    saida = sorted(
        ([ordem_dos_modos.index(modo), n, codificar(forma)] for modo, n, forma in trocos),
        key=lambda t: (t[0], -1 if t[1] is None else t[1], t[2]),
    )
    return {
        "formato": FORMATO,
        "campos": ["modo", "viagens", "polilinha"],
        "modos": ordem_dos_modos,
        # De que dia é a conta, por feed. A interface pode dizê-lo; quem
        # confere os números precisa dele.
        "dias": {
            feed: data for feed, (data, _) in sorted(referencia.items()) if feed in feeds_desenhados
        },
        "trocos": saida,
    }


def _sem_repetidos(linha: list[tuple[float, float]]) -> list[tuple[float, float]]:
    saida = [linha[0]]
    for p in linha[1:]:
        if _metros(p, saida[-1]) > 0.5:
            saida.append(p)
    if len(saida) == 1:
        saida.append(linha[-1])
    return saida


def _seguir(
    no: int,
    vindo_de: int,
    incidentes: dict[int, list[int]],
    usada: set[int],
    arestas: list[Aresta],
) -> list[tuple[int, int]]:
    """As arestas que se seguem a `no`, saindo pela que não é `vindo_de`, e por que nó se entra.

    Anda enquanto o nó tiver exatamente duas arestas iguais; marca-as como usadas.
    """
    cadeia = []
    while len(incidentes[no]) == 2:
        proxima = next((j for j in incidentes[no] if j != vindo_de), None)
        if proxima is None or proxima in usada:
            break
        cadeia.append((proxima, no))
        usada.add(proxima)
        _, _, u, v, _ = arestas[proxima]
        no, vindo_de = (v if u == no else u), proxima
    return cadeia


def _encadear(
    arestas: list[Aresta],
) -> list[tuple[str, int | None, list[tuple[float, float]]]]:
    """Junta os troços que se seguem, com o mesmo modo e as mesmas viagens, num traço só.

    É o que faz o ficheiro caber: uma linha de vinte paragens sem outras por
    cima é um traço, e não dezanove. E desenha melhor — a junta entre dois
    pedaços do mesmo traço é uma curva, e não duas pontas redondas sobrepostas.
    Só se junta através de um sítio onde se encontram EXATAMENTE dois troços
    iguais: num cruzamento de três, qualquer escolha seria arbitrária.
    """
    por_atributo: dict[tuple[str, int | None], list[int]] = defaultdict(list)
    for i, (modo, n, *_rest) in enumerate(arestas):
        por_atributo[(modo, n)].append(i)

    saida: list[tuple[str, int | None, list[tuple[float, float]]]] = []
    for (modo, n), indices in por_atributo.items():
        incidentes: dict[int, list[int]] = defaultdict(list)
        for i in indices:
            _, _, u, v, _ = arestas[i]
            if u < 0:
                continue  # os traçados sem horário não se encadeiam
            incidentes[u].append(i)
            incidentes[v].append(i)
        usada: set[int] = set()

        for i in sorted(indices):
            if i in usada:
                continue
            usada.add(i)
            _, _, u, v, forma = arestas[i]
            if u < 0:
                saida.append((modo, n, forma))
                continue
            linha = list(forma)
            for j, entrada in _seguir(v, i, incidentes, usada, arestas):
                _, _, uj, vj, fj = arestas[j]
                linha += (fj if uj == entrada else fj[::-1])[1:]
            antes: list[tuple[float, float]] = []
            for j, entrada in _seguir(u, i, incidentes, usada, arestas):
                _, _, uj, vj, fj = arestas[j]
                pedaco = fj[::-1] if uj == entrada else fj
                antes = pedaco[:-1] + antes
            saida.append((modo, n, antes + linha))
    return saida


# --- escrever --------------------------------------------------------------


def escrever_em(destino: Path, rede: dict[str, Any]) -> int:
    """Escreve o ficheiro, compacto e sempre igual para os mesmos dados."""
    texto = json.dumps(rede, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    (destino / FICHEIRO).write_text(texto + "\n", encoding="utf-8")
    return len(texto) + 1


def _tracados_sem_horario(s: Any, modos_com_horario: set[str]) -> list[tuple[str, list]]:
    """Os traçados `osm-rotas` de um modo que a grelha não traz — os urbanos municipais.

    Só de um modo SEM linhas na grelha: a região de prova declara o autocarro
    duas vezes, o feed e um traçado, e desenhar os dois era pôr a mesma linha
    duas vezes no mapa.
    """
    saida: list[tuple[str, list]] = []
    for decl in s.regiao.saidas:
        if decl.leitor != "osm-rotas" or decl.modo not in MODOS or not decl.saida:
            continue
        if decl.modo in modos_com_horario:
            continue
        caminho = s.destino.parent / decl.saida
        if not caminho.exists():
            continue
        for f in json.loads(caminho.read_text(encoding="utf-8")).get("features", []):
            g = f.get("geometry") or {}
            partes = (
                [g.get("coordinates") or []]
                if g.get("type") == "LineString"
                else (g.get("coordinates") or [])
                if g.get("type") == "MultiLineString"
                else []
            )
            for parte in partes:
                saida.append((decl.modo, [(float(lat), float(lon)) for lon, lat, *_ in parte]))
    return saida


def _formas_finas(s: Any) -> dict[tuple[str, str], list[tuple[float, float]]]:
    """As formas dos troços a `TOLERANCIA_FINA`, dos feeds que trazem traçado.

    Pelas chaves da grelha, com o prefixo de cada feed — o mesmo que o
    `sitio._percursos` usa —, e a rede própria primeiro: um troço que dois
    ficheiros desenhem fica com o dela.
    """
    from .percursos import _trocos_do_feed

    partilha = s.paragens_partilhadas
    nomes = [str(n).split("/")[-1] for n in ((s.regiao.motor or {}).get("gtfs") or [])]
    nomes.sort(key=lambda nome: nome != s.feed_proprio)
    finas: dict[tuple[str, str], list[tuple[float, float]]] = {}
    for nome in nomes:
        feed = s._feed(nome)
        if feed is None or "shapes.txt" not in feed:
            continue
        chave = nome.removesuffix(".zip")
        prefixo = f"{partilha.get(chave, chave)}:"
        for (a, b), forma in _trocos_do_feed(feed, TOLERANCIA_FINA).items():
            finas.setdefault((prefixo + a, prefixo + b), forma)
    return finas


def escrever(s: Any, g: Any) -> None:
    """A chamada do `pipeline sitio`: lê o que ele já escreveu e junta a rede.

    `s` é o `Sitio` (o destino, a região, as saídas e as notas), `g` a grelha
    que ele acabou de escrever. Os percursos lêem-se do disco, de onde o
    `_percursos` os pôs; as formas finas, dos mesmos feeds que ele leu.
    """
    from .sitio import Saida

    grelha = g.para_json((s.regiao.motor or {}).get("fuso", "UTC"))
    c = s.regiao.caixa_de_recorte
    com_horario = {linha[3] for linha in grelha.get("linhas") or []}
    rede = construir(
        grelha,
        s.destino / "percursos",
        (c.lat_min, c.lat_max, c.lon_min, c.lon_max),
        _tracados_sem_horario(s, com_horario),
        _formas_finas(s),
    )
    if not rede["trocos"]:
        return
    n = escrever_em(s.destino, rede)
    s.saidas.append(Saida(s.destino / FICHEIRO, n, len(rede["trocos"])))
    comprimido = len(gzip.compress((s.destino / FICHEIRO).read_bytes(), 9))
    s.notas.append(
        f"rede no mapa: {len(rede['trocos'])} traços, {comprimido // 1024} kB comprimido"
        + "".join(f" · {feed} conta a {data}" for feed, data in rede["dias"].items())
    )
