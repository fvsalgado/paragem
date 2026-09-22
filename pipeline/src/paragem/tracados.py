"""Por onde é que o autocarro passa entre duas paragens.

Um feed sem traçados desenha linhas retas no mapa, e uma reta entre duas
paragens passa por cima de casas, de um rio e de uma serra. Quem olha vê um
percurso que não existe.

Há duas maneiras de saber o caminho verdadeiro, e usam-se por esta ordem:

1. **O traçado que o levantamento já tem.** Se a viagem alinhou com uma viagem
   do levantamento, e se todas as paragens caem em cima dessa linha e pela
   ordem certa, é essa — recortada entre a primeira e a última paragem.
2. **Encaminhar na rede viária do OpenStreetMap.** Caminho mais curto entre
   paragens consecutivas, respeitando os sentidos únicos.

O que **não** se faz é a terceira: unir os pontos com retas. Um traçado
plausível e errado é pior do que traçado nenhum, porque ninguém desconfia dele.

## A rede por onde se encaminha

Entram as classes por onde um autocarro anda. Ficam de fora `track`, `path` e
`footway`: um atalho por um caminho agrícola dá um percurso mais curto, e
completamente falso.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# A projeção plana local: à escala de uma região o erro é de centímetros, e
# poupa uma reprojeção por cada um dos milhões de pontos que se comparam.
_METROS_POR_GRAU_LAT = 110540.0

CLASSES = (
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "living_street",
    "service",
    "busway",
    "motorway_link",
    "trunk_link",
    "primary_link",
    "secondary_link",
    "tertiary_link",
)


@dataclass(frozen=True)
class Parametros:
    tolerancia_da_camada_m: float = 100
    recuo_tolerado_m: float = 60
    nos_vizinhos: int = 40
    aviso_de_paragem_longe_m: float = 400
    aviso_de_desvio: float = 3.0
    aviso_de_desvio_m: float = 2000


@dataclass
class Tracado:
    metodo: str
    pontos: list[list[float]] = field(default_factory=list)
    comprimento_m: int = 0
    max_dist_paragem_m: int = 0
    nota: str = ""


class _Vias:
    """As vias por onde um autocarro anda, lidas do recorte.

    Escrito à mão e não com `osmium.SimpleHandler` genérico porque a caixa
    importa: o recorte da região leva margem para as linhas que atravessam a
    fronteira, e encaminhar sobre essa margem toda é memória que não se usa.
    """

    def __init__(self, caixa: dict[str, float] | None, classes: tuple[str, ...]) -> None:
        import osmium

        self.caixa = caixa
        self.classes = set(classes)
        self.vias: list[tuple[list[tuple[float, float]], bool, bool]] = []
        handler = self

        class Leitor(osmium.SimpleHandler):
            def way(self, w) -> None:  # noqa: N802 — nome imposto pelo pyosmium
                handler._via(w)

        self._leitor = Leitor()

    def _dentro(self, lat: float, lon: float) -> bool:
        c = self.caixa
        if not c:
            return True
        return c["lat_min"] <= lat <= c["lat_max"] and c["lon_min"] <= lon <= c["lon_max"]

    def _via(self, w: Any) -> None:
        import osmium

        etiquetas = {t.k: t.v for t in w.tags}
        classe = etiquetas.get("highway")
        if classe not in self.classes:
            return
        # Uma via de serviço fechada ao público não é caminho: é o parque de
        # uma fábrica, e encaminhar por lá dá um percurso que ninguém faz.
        if classe == "service" and etiquetas.get("access") in ("private", "no"):
            return
        try:
            pontos = [(n.location.lat, n.location.lon) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        if not any(self._dentro(lat, lon) for lat, lon in pontos):
            return
        sentido = etiquetas.get("oneway")
        rotunda = etiquetas.get("junction") == "roundabout"
        so_em_frente = sentido in ("yes", "1", "true") or rotunda
        ao_contrario = sentido == "-1"
        self.vias.append((pontos, so_em_frente, ao_contrario))

    def ler(self, caminho: Path) -> list[tuple[list[tuple[float, float]], bool, bool]]:
        self._leitor.apply_file(str(caminho), locations=True)
        return self.vias


class Grafo:
    """A rede viária, pronta a encaminhar.

    Um nó é uma coordenada; um arco é um troço de via, com o comprimento em
    metros. Uma paragem não é um nó: projeta-se no arco mais próximo, e é daí
    que o caminho parte — senão o percurso começava a cem metros da paragem,
    no primeiro cruzamento.
    """

    def __init__(self, vias: list[tuple[list[tuple[float, float]], bool, bool]], lat0: float):
        import networkx as nx

        self.kx = 111320.0 * math.cos(math.radians(lat0))
        self.ky = _METROS_POR_GRAU_LAT
        self.g = nx.DiGraph()
        for pontos, so_em_frente, ao_contrario in vias:
            for a, b in zip(pontos, pontos[1:], strict=False):
                ka, kb = self._chave(a), self._chave(b)
                if ka == kb:
                    continue
                d = math.hypot((b[1] - a[1]) * self.kx, (b[0] - a[0]) * self.ky)
                if ao_contrario:
                    self.g.add_edge(kb, ka, w=d)
                else:
                    self.g.add_edge(ka, kb, w=d)
                    if not so_em_frente:
                        self.g.add_edge(kb, ka, w=d)
        self._indexar()
        self._projetadas: dict[tuple[float, float], tuple[Any, float]] = {}
        self._caminhos: dict[tuple[Any, Any], list[Any] | None] = {}

    @staticmethod
    def _chave(ponto: tuple[float, float]) -> tuple[float, float]:
        return (round(ponto[0], 7), round(ponto[1], 7))

    def _indexar(self) -> None:
        from scipy.spatial import cKDTree

        self._nos = list(self.g.nodes)
        self._arvore = cKDTree([(lon * self.kx, lat * self.ky) for lat, lon in self._nos])
        self._sem_sentido = self.g.to_undirected(as_view=True)

    def __len__(self) -> int:
        return self.g.number_of_nodes()

    @property
    def arcos(self) -> int:
        return self.g.number_of_edges()

    def _coordenada(self, no: Any) -> tuple[float, float]:
        if isinstance(no, tuple) and len(no) == 2 and no[0] == "p":
            return self.g.nodes[no]["ponto"]
        return no

    def _metros(self, a: Any, b: Any) -> float:
        (la1, lo1), (la2, lo2) = self._coordenada(a), self._coordenada(b)
        return math.hypot((lo2 - lo1) * self.kx, (la2 - la1) * self.ky)

    def projetar(self, lat: float, lon: float, vizinhos: int = 40) -> tuple[Any, float]:
        """O ponto da rede mais próximo desta paragem, e a que distância fica."""
        chave = (round(lat, 6), round(lon, 6))
        if chave in self._projetadas:
            return self._projetadas[chave]
        px, py = lon * self.kx, lat * self.ky
        _, indices = self._arvore.query((px, py), k=min(vizinhos, len(self._nos)))
        melhor = None
        for i in indices if hasattr(indices, "__iter__") else [indices]:
            u = self._nos[int(i)]
            ux, uy = u[1] * self.kx, u[0] * self.ky
            for v in self._sem_sentido[u]:
                # Um nó de paragem já projetado não é um troço de via: saltá-lo
                # evita projetar uma paragem em cima de outra.
                if not isinstance(v[0], float):
                    continue
                vx, vy = v[1] * self.kx, v[0] * self.ky
                dx, dy = vx - ux, vy - uy
                quadrado = dx * dx + dy * dy
                t = (
                    0.0
                    if quadrado == 0
                    else max(0, min(1, ((px - ux) * dx + (py - uy) * dy) / quadrado))
                )
                qx, qy = ux + t * dx, uy + t * dy
                d = math.hypot(px - qx, py - qy)
                if melhor is None or d < melhor[0]:
                    melhor = (d, u, v, (qy / self.ky, qx / self.kx))
        if melhor is None:
            raise ValueError("a rede viária está vazia")
        d, u, v, ponto = melhor
        no = ("p", chave)
        self.g.add_node(no, ponto=ponto)
        du = self._metros(ponto, u)
        dv = self._metros(ponto, v)
        if self.g.has_edge(u, v):
            self.g.add_edge(u, no, w=du)
            self.g.add_edge(no, v, w=dv)
        if self.g.has_edge(v, u):
            self.g.add_edge(v, no, w=dv)
            self.g.add_edge(no, u, w=du)
        self._projetadas[chave] = (no, d)
        return self._projetadas[chave]

    def caminho(self, a: Any, b: Any) -> list[Any] | None:
        import networkx as nx

        if (a, b) in self._caminhos:
            return self._caminhos[(a, b)]
        try:
            p = nx.astar_path(self.g, a, b, heuristic=self._metros, weight="w")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            p = None
        self._caminhos[(a, b)] = p
        return p

    def comprimento(self, caminho: list[Any]) -> float:
        return sum(self.g[u][v]["w"] for u, v in zip(caminho, caminho[1:], strict=False))

    def pontos(self, caminho: list[Any]) -> list[tuple[float, float]]:
        return [self._coordenada(n) for n in caminho]

    def em_linha_reta(self, a: Any, b: Any) -> float:
        return self._metros(a, b)


def ler_rede(caminho: Path, caixa: dict[str, float] | None, lat0: float) -> Grafo:
    return Grafo(_Vias(caixa, CLASSES).ler(caminho), lat0)


def _projetar(lat: float, lon: float, kx: float, ky: float) -> tuple[float, float]:
    return (lon * kx, lat * ky)


def da_camada(
    pontos: list[list[float]],
    paragens: list[Any],
    kx: float,
    ky: float,
    par: Parametros,
) -> tuple[list[float], float] | None:
    """O traçado do levantamento serve esta viagem?

    Serve se todas as paragens ficarem a menos da tolerância da linha E se as
    projeções forem para a frente. O recuo tolerado existe porque uma paragem
    de ida e outra de volta, na mesma rua, projetam-se quase no mesmo sítio, e
    a ordem entre elas pode inverter-se por metros.
    """
    from shapely.geometry import LineString, Point
    from shapely.ops import substring

    linha = LineString([_projetar(lat, lon, kx, ky) for lat, lon in pontos])
    posicao = 0.0
    maxima = 0.0
    projecoes: list[float] = []
    for paragem in paragens:
        p = Point(*_projetar(paragem.lat, paragem.lon, kx, ky))
        recuo = max(posicao - par.recuo_tolerado_m, 0)
        resto = substring(linha, recuo, linha.length) if posicao > 0 else linha
        d = resto.distance(p)
        if d > par.tolerancia_da_camada_m:
            return None
        maxima = max(maxima, d)
        posicao = resto.project(p) + recuo
        projecoes.append(posicao)
    return projecoes, maxima


def desenhar(
    completas: list[Any],
    tracados_do_levantamento: dict[str, list[list[float]]],
    grafo: Grafo | None,
    parametros: Parametros | None = None,
) -> dict[int, Tracado]:
    """Um traçado por viagem, pelo melhor método que der."""
    from shapely.geometry import LineString
    from shapely.ops import substring

    par = parametros or Parametros()
    kx = grafo.kx if grafo else 111320.0 * math.cos(math.radians(39.6))
    ky = _METROS_POR_GRAU_LAT
    saida: dict[int, Tracado] = {}

    for completa in completas:
        pontos = tracados_do_levantamento.get(completa.alinhada or "")
        if pontos and len(completa.pontos) >= 2:
            avaliacao = da_camada(pontos, completa.pontos, kx, ky, par)
            if avaliacao:
                projecoes, maxima = avaliacao
                linha = LineString([_projetar(lat, lon, kx, ky) for lat, lon in pontos])
                recorte = substring(linha, projecoes[0], projecoes[-1])
                saida[completa.indice] = Tracado(
                    metodo="camada",
                    pontos=[[round(y / ky, 6), round(x / kx, 6)] for x, y in recorte.coords],
                    comprimento_m=round(recorte.length),
                    max_dist_paragem_m=round(maxima),
                    nota="traçado do levantamento, recortado entre a primeira e a última paragem",
                )
                continue
            nota = "traçado do levantamento rejeitado: paragem longe da linha ou fora de ordem"
        else:
            nota = (
                "sem viagem alinhada no levantamento"
                if not completa.alinhada
                else "viagem alinhada sem traçado no levantamento"
            )
        saida[completa.indice] = Tracado(metodo="", nota=nota)

    if grafo is None:
        for t in saida.values():
            if not t.metodo:
                t.metodo = "sem-tracado"
                t.nota += "; sem rede viária para encaminhar"
        return saida

    for completa in completas:
        t = saida[completa.indice]
        if t.metodo:
            continue
        _encaminhar(completa, t, grafo, par)
    return saida


def _encaminhar(completa: Any, t: Tracado, grafo: Grafo, par: Parametros) -> None:
    paragens = completa.pontos
    if len(paragens) < 2:
        t.metodo = "sem-tracado"
        t.nota += "; viagem com menos de 2 paragens"
        return
    projetadas = [grafo.projetar(p.lat, p.lon, par.nos_vizinhos) for p in paragens]
    longe = [
        (p.nome, round(d))
        for p, (_, d) in zip(paragens, projetadas, strict=False)
        if d > par.aviso_de_paragem_longe_m
    ]
    pontos: list[tuple[float, float]] = []
    total = 0.0
    desvios: list[str] = []
    for i in range(len(paragens) - 1):
        a, b = projetadas[i][0], projetadas[i + 1][0]
        if a == b:
            continue
        caminho = grafo.caminho(a, b)
        if caminho is None:
            t.metodo = "sem-tracado"
            t.nota += (
                f'; sem caminho na rede viária entre "{paragens[i].nome}" e '
                f'"{paragens[i + 1].nome}"'
            )
            return
        comprimento = grafo.comprimento(caminho)
        reta = grafo.em_linha_reta(a, b)
        total += comprimento
        if comprimento > par.aviso_de_desvio * reta + par.aviso_de_desvio_m:
            desvios.append(
                f"{paragens[i].nome}→{paragens[i + 1].nome} "
                f"{comprimento / 1000:.1f} km contra {reta / 1000:.1f} km em reta"
            )
        troco = grafo.pontos(caminho)
        if pontos and pontos[-1] == troco[0]:
            troco = troco[1:]
        pontos.extend(troco)
    t.metodo = "encaminhamento"
    t.pontos = [[round(lat, 6), round(lon, 6)] for lat, lon in pontos]
    t.comprimento_m = round(total)
    t.max_dist_paragem_m = round(max(d for _, d in projetadas))
    t.nota += "; encaminhado na rede viária, respeitando os sentidos únicos"
    if longe:
        t.nota += "; paragens longe da rede: " + ", ".join(f"{n} ({d} m)" for n, d in longe)
    if desvios:
        t.nota += "; desvios grandes: " + " | ".join(desvios)


def numerar(tracados: dict[int, Tracado]) -> tuple[dict[str, list[list[float]]], dict[int, str]]:
    """Dá um identificador a cada desenho distinto, e diz qual é o de cada viagem.

    Viagens diferentes da mesma linha percorrem o mesmo caminho: guardar o
    desenho uma vez por viagem multiplicava por quatro o tamanho do ficheiro.
    """
    formas: dict[str, str] = {}
    de_cada: dict[int, str] = {}
    for indice in sorted(tracados):
        t = tracados[indice]
        if not t.pontos:
            continue
        chave = json.dumps(t.pontos)
        if chave not in formas:
            formas[chave] = f"tr{len(formas) + 1:04d}"
        de_cada[indice] = formas[chave]
    return {ident: json.loads(chave) for chave, ident in formas.items()}, de_cada
