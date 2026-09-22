"""Onde ficam as paragens dos urbanos municipais.

Os cartazes das câmaras dão o NOME da paragem e a hora. Não dão coordenadas —
e sem coordenadas uma linha não se desenha no mapa nem entra no planeador. Só
responde «a que horas passa», que é muito, mas não é tudo.

Este passo vai procurá-las onde elas existem publicamente, por ordem de
autoridade:

1. **As relações de percurso do OpenStreetMap.** Quando alguém mapeou a linha,
   os membros da relação SÃO as paragens dela — é a fonte mais próxima da
   verdade que há sem pedir nada a ninguém, e a única que liga um nome a uma
   carreira e não só a um sítio.
2. **As paragens de autocarro do OpenStreetMap**, que dizem onde fica sem
   dizer que alguma carreira ali pare.
3. **O feed da própria rede da região**, para as paragens que ela partilha com
   o urbano — um terminal, uma estação.

E NÃO INVENTA NENHUMA (CLAUDE.md §4.4). O que não se resolve fica sem
coordenada e sai NOMEADO no relatório — porque uma paragem que desaparece em
silêncio não se conserta, e uma paragem posta no sítio errado manda alguém
esperar na berma errada.

DUAS REGRAS QUE EVITAM O PIOR
-----------------------------
**O concelho fecha a procura, e não se alarga.** «Centro de Saúde»,
«Bombeiros» e «Continente» existem em todo o país; sem o limite
administrativo, uma paragem de Torres Novas ia parar a Coimbra — o recorte de
OSM desta região tem 2 358 paragens do SMTUC lá dentro. E alargar a procura ao
resto da região quando o concelho não responde é PIOR do que não responder:
havendo um só «Centro de Saúde» na região, e sendo noutro concelho, a procura
alargada devolve-o com toda a confiança.

**Vários candidatos só valem se forem a mesma paragem.** Um nome casa muitas
vezes com dois ou quatro pontos: são os dois lados da estrada, ou as duas
plataformas. Medido nesta região, o par mais afastado está a 56 m. Acima de
`DISPERSAO_MAXIMA_M` deixam de ser a mesma paragem e a resolução é recusada —
é a diferença entre arredondar e adivinhar.

E a regra vale sobre TODAS as fontes, não sobre a que ganhou. A ordem de
autoridade escolhe ENTRE pontos que já se sabe serem o mesmo sítio; não é ela
que decide se o são. Ao contrário, bastava a fonte mais forte ter um homónimo
para a paragem ir parar à outra ponta do concelho — com a dispersão a zero,
porque só se tinha olhado para um lado.
"""

from __future__ import annotations

import collections
import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Any

# Até onde dois candidatos com o mesmo nome ainda são a mesma paragem. Os dois
# lados de uma estrada e as duas plataformas de um terminal cabem nisto; duas
# ruas com o mesmo nome em pontos diferentes da vila, não.
DISPERSAO_MAXIMA_M = 120.0

# As proveniências, POR ORDEM DE AUTORIDADE. Um nome que casa numa não procura
# na seguinte: quem mapeou o percurso da carreira sabe mais do que uma
# coincidência de nomes, e misturar as três num só saco fazia a média de
# pontos que não são o mesmo sítio.
FONTES = ("osm-percurso", "osm-paragem", "rede")


def _simples(s: str) -> str:
    d = unicodedata.normalize("NFD", (s or "").casefold())
    d = "".join(c for c in d if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", d).strip()


# As abreviaturas que um cartaz usa e um mapa não, ou ao contrário. São só
# ortográficas: expandi-las não muda que sítio o nome designa. Ficam de fora
# as ambíguas — `Est.` tanto é «Estrada» como «Estação», e trocar uma pela
# outra põe alguém à espera na berma em vez de na gare.
_ABREVIATURAS = {
    "av": "avenida",
    "r": "rua",
    "lg": "largo",
    "lgo": "largo",
    "pc": "praca",
    "trav": "travessa",
    "tv": "travessa",
    "s": "sao",
    "sta": "santa",
    "sto": "santo",
}

# «de», «do», «da» e companhia são ruído: «Curva Bom Amor» e «Curva do Bom
# Amor» são a mesma curva, e o cartaz e o mapa discordam a toda a hora.
_LIGACOES = {"de", "do", "da", "dos", "das", "e", "o", "a", "os", "as"}


def _canonico(s: str) -> str:
    """«Curva Bom Amor» e «Curva do Bom Amor» → «curvabomamor».

    Só ORTOGRAFIA: expande abreviaturas, deita fora as ligações e junta o que
    sobra. Duas grafias do mesmo nome passam a ser a mesma chave; dois nomes
    diferentes continuam diferentes — «Casal do Pote» e «Casa do Pote» não se
    tocam. Não é uma distância entre palavras nem um palpite: é a mesma frase
    escrita de duas maneiras.
    """
    palavras = [_ABREVIATURAS.get(p, p) for p in _simples(s).split()]
    return "".join(p for p in palavras if p not in _LIGACOES)


def _sem_parenteses(s: str) -> str:
    """«Meia Via (Poço)» → «meia via».

    O cartaz distingue plataformas entre parênteses; o mapa muitas vezes não.
    É a última tentativa, e a mais fraca — «Riachos (Eucaliptos)» e «Riachos
    (Variante)» reduzem-se as duas a «riachos», e é a regra da dispersão que
    as recusa: nove candidatos espalhados por 1,6 km não são uma paragem.
    """
    return _simples(re.sub(r"\(.*?\)", " ", s))


def _metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0])))


class Indice:
    """Os pontos com nome onde uma paragem pode estar, por ordem de autoridade.

    Um índice é sempre de UM concelho: é quem o constrói que fecha a procura.
    """

    def __init__(self) -> None:
        self._exato: dict[str, dict[str, list[dict[str, Any]]]] = {
            f: collections.defaultdict(list) for f in FONTES
        }
        self._canonico: dict[str, dict[str, list[dict[str, Any]]]] = {
            f: collections.defaultdict(list) for f in FONTES
        }
        self._nucleo: dict[str, dict[str, list[dict[str, Any]]]] = {
            f: collections.defaultdict(list) for f in FONTES
        }

    def juntar(self, nome: str, lat: float, lon: float, fonte: str) -> None:
        if not nome or fonte not in self._exato:
            return
        p = {"nome": nome, "lat": lat, "lon": lon, "fonte": fonte}
        self._exato[fonte][_simples(nome)].append(p)
        self._canonico[fonte][_canonico(nome)].append(p)
        self._nucleo[fonte][_sem_parenteses(nome)].append(p)

    def __len__(self) -> int:
        return sum(len(v) for m in self._exato.values() for v in m.values())

    def procurar(self, nome: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str] | None:
        """Os candidatos a este nome: os melhores, TODOS, e por que degrau.

        Por degraus, do mais forte para o mais fraco: o nome inteiro, depois
        as duas grafias do mesmo nome, e só no fim o nome sem parênteses. O
        degrau que respondeu sai no ficheiro, em `como`.

        **Devolve duas listas, e a segunda é a que evita o pior.** A primeira
        é a da fonte mais autoritativa que respondeu, e é ela que dá o ponto.
        A segunda é tudo o que respondeu naquele degrau, em qualquer fonte, e
        serve para `resolver` perguntar se as fontes CONCORDAM.

        Sem a segunda, a ordem de autoridade passava por cima da regra da
        dispersão: um «Centro de Saúde» mapeado numa vila e outro no feed da
        rede a um quilómetro resolviam-se no primeiro, com toda a confiança e
        sem ninguém dar por isso. A autoridade escolhe ENTRE pontos que são o
        mesmo sítio; não decide se o são.
        """
        for mapa, chave, como in (
            (self._exato, _simples(nome), "nome"),
            (self._canonico, _canonico(nome), "ortografia"),
            (self._nucleo, _sem_parenteses(nome), "sem-parenteses"),
        ):
            todos = [p for fonte in FONTES for p in mapa[fonte].get(chave, ())]
            if not todos:
                continue
            melhores = next(c for fonte in FONTES if (c := mapa[fonte].get(chave)))
            return melhores, todos, como
        return None


def resolver(nome: str, indice: Indice) -> dict[str, Any] | None:
    """Onde fica esta paragem — ou nada, quando não se sabe com confiança.

    Devolve o ponto médio dos candidatos, que com a dispersão limitada é o
    meio da estrada entre as duas plataformas. Guarda quantos eram e de onde
    vieram: é isso que deixa alguém conferir mais tarde sem repetir o trabalho.
    """
    achado = indice.procurar(nome)
    if not achado:
        return None
    melhores, todos, como = achado

    # A pergunta é sobre TUDO o que casou, e não só sobre o que vai ser usado:
    # se as fontes apontam para sítios diferentes, não se sabe qual é — e
    # escolher a mais autoritativa era escolher uma das duas à sorte.
    #
    # Por PONTOS e não por entradas: o mesmo nó sai duas vezes quando está num
    # percurso e também tem etiqueta de paragem, e contá-lo duas vezes dizia
    # «dois candidatos» onde há um. A dispersão não mudava; o rasto que fica
    # no ficheiro, para quem for conferir, mudava.
    espalhados = sorted({(c["lat"], c["lon"]) for c in todos})
    disperso = max((_metros(p, q) for p in espalhados for q in espalhados), default=0.0)
    if disperso > DISPERSAO_MAXIMA_M:
        return None

    pontos = sorted({(c["lat"], c["lon"]) for c in melhores})
    return {
        "lat": round(sum(p[0] for p in pontos) / len(pontos), 6),
        "lon": round(sum(p[1] for p in pontos) / len(pontos), 6),
        "fonte": melhores[0]["fonte"],
        "candidatos": len(espalhados),
        "dispersao_m": round(disperso),
        "como": como,
    }


def nomes_de(dados: dict[str, Any]) -> list[str]:
    """As paragens de um cartaz já lido, pela ordem em que aparecem."""
    nomes: list[str] = []
    for q in dados.get("quadros") or []:
        for n in q.get("paragens") or []:
            if n not in nomes:
                nomes.append(n)
    return nomes


def localizar(caminho: Path, indice: Indice) -> dict[str, Any]:
    """Acrescenta as coordenadas a um horário de urbano já construído.

    O ficheiro é reescrito com um mapa `coordenadas` — nome → ponto — e com a
    lista do que ficou por localizar. As paragens sem coordenada CONTINUAM LÁ,
    com o horário delas: o que falta é o sítio, não a hora.
    """
    d = json.loads(caminho.read_text(encoding="utf-8"))
    nomes = nomes_de(d)

    coordenadas = {}
    for n in nomes:
        if ponto := resolver(n, indice):
            coordenadas[n] = ponto
    d["coordenadas"] = coordenadas
    d["sem_coordenada"] = [n for n in nomes if n not in coordenadas]
    caminho.write_text(
        json.dumps(d, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {
        "id": d.get("id", caminho.stem),
        "nome": d.get("nome", caminho.stem),
        "paragens": len(nomes),
        "localizadas": len(coordenadas),
        "sem_coordenada": list(d["sem_coordenada"]),
    }


def geojson(ficheiros: list[Path]) -> dict[str, Any]:
    """As paragens localizadas, em GeoJSON, para o mapa.

    Uma feição por paragem e por linha: a mesma paragem servida por duas
    linhas aparece duas vezes, porque quem procura a linha quer vê-la inteira.
    """
    feicoes = []
    for caminho in ficheiros:
        d = json.loads(caminho.read_text(encoding="utf-8"))
        for nome, p in (d.get("coordenadas") or {}).items():
            feicoes.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
                    "properties": {
                        "nome": nome,
                        "linha": d.get("nome", ""),
                        "linha_id": d.get("id", ""),
                        "rede": d.get("rede", ""),
                        "cor": d.get("cor", ""),
                        "fonte": p["fonte"],
                    },
                }
            )
    return {"type": "FeatureCollection", "features": feicoes}
