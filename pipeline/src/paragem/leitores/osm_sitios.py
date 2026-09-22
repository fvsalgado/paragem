"""Os SÍTIOS do OpenStreetMap: o que se procura quando não se procura uma paragem.

No Google Maps ninguém procura uma paragem de autocarro. Procura o sítio onde
quer ir — o hospital, a escola, o castelo, a aldeia — e o mapa é que descobre a
paragem. Enquanto a caixa de procura só conhecia paragens e estações, a
primeira coisa que alguém escrevia («Hospital de Tomar») não devolvia nada, e
uma caixa que não responde à primeira tentativa parece avariada.

Isto sai do MESMO recorte que o mapa e o motor de viagens usam, sob ODbL com
atribuição obrigatória — as mesmas regras do §4.1, e nem um pedido a mais.

SÃO NÓS E VIAS, e isso não é um detalhe: no OpenStreetMap um hospital, uma
escola ou um centro comercial são quase sempre um POLÍGONO, não um ponto. Um
leitor que só visse nós perdia precisamente os sítios grandes, que são os que
as pessoas procuram.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import osmium

from .base import Contexto, Resultado
from .osm import ATRIBUICAO, _escrever_geojson, _ficheiro

nome = "osm-sitios"

# As etiquetas que fazem de uma coisa com nome um SÍTIO. A ordem é a da
# prioridade: um `amenity=hospital` que também tenha `building=yes` é um
# hospital.
CHAVES = ("amenity", "healthcare", "shop", "tourism", "leisure", "historic", "office", "place")

# O que se mostra por baixo do nome, como no Maps: «Hospital», «Café». É o que
# distingue dois sítios com o mesmo nome, e é a diferença entre uma lista de
# nomes e uma lista de respostas.
#
# O que não estiver aqui mostra a etiqueta crua — feio, e melhor do que nada.
CLASSES = {
    "amenity=hospital": "Hospital",
    "amenity=clinic": "Clínica",
    "amenity=doctors": "Centro de saúde",
    "amenity=pharmacy": "Farmácia",
    "amenity=school": "Escola",
    "amenity=kindergarten": "Jardim de infância",
    "amenity=college": "Escola secundária",
    "amenity=university": "Universidade",
    "amenity=library": "Biblioteca",
    "amenity=townhall": "Câmara municipal",
    "amenity=post_office": "Correios",
    "amenity=police": "Polícia",
    "amenity=fire_station": "Bombeiros",
    "amenity=bank": "Banco",
    "amenity=restaurant": "Restaurante",
    "amenity=cafe": "Café",
    "amenity=bar": "Bar",
    "amenity=fuel": "Posto de combustível",
    "amenity=marketplace": "Mercado",
    "amenity=place_of_worship": "Igreja",
    "amenity=theatre": "Teatro",
    "amenity=cinema": "Cinema",
    "amenity=swimming_pool": "Piscina",
    "amenity=community_centre": "Centro comunitário",
    "healthcare=centre": "Centro de saúde",
    "tourism=museum": "Museu",
    "tourism=attraction": "Ponto de interesse",
    "tourism=hotel": "Hotel",
    "tourism=guest_house": "Alojamento",
    "tourism=information": "Posto de turismo",
    "tourism=viewpoint": "Miradouro",
    "leisure=park": "Parque",
    "leisure=sports_centre": "Pavilhão desportivo",
    "leisure=stadium": "Estádio",
    "leisure=pitch": "Campo de jogos",
    "leisure=garden": "Jardim",
    "historic=castle": "Castelo",
    "historic=monument": "Monumento",
    "historic=ruins": "Ruínas",
    "historic=archaeological_site": "Sítio arqueológico",
    "place=city": "Cidade",
    "place=town": "Vila",
    "place=village": "Aldeia",
    "place=hamlet": "Lugar",
    "place=suburb": "Bairro",
    "place=neighbourhood": "Bairro",
    "place=locality": "Lugar",
    "place=farm": "Quinta",
    "place=isolated_dwelling": "Casal",
    "shop=supermarket": "Supermercado",
    "shop=bakery": "Padaria",
    "shop=convenience": "Mercearia",
    "office=government": "Serviço público",
    "amenity=bicycle_rental": "Bicicletas partilhadas",
    "amenity=fountain": "Fonte",
    "amenity=parking": "Estacionamento",
    "amenity=dentist": "Dentista",
    "amenity=veterinary": "Veterinário",
    "amenity=social_facility": "Apoio social",
    "amenity=nightclub": "Discoteca",
    "amenity=fast_food": "Comida rápida",
    "amenity=pub": "Cervejaria",
    "amenity=car_wash": "Lavagem de automóveis",
    "amenity=driving_school": "Escola de condução",
    "amenity=courthouse": "Tribunal",
    "amenity=prison": "Estabelecimento prisional",
    "amenity=bus_station": "Terminal rodoviário",
    "amenity=taxi": "Praça de táxis",
    "historic=memorial": "Memorial",
    "historic=wayside_cross": "Cruzeiro",
    "historic=tower": "Torre",
    "historic=fort": "Forte",
    "tourism=artwork": "Arte pública",
    "tourism=picnic_site": "Parque de merendas",
    "tourism=camp_site": "Parque de campismo",
    "tourism=apartment": "Alojamento",
    "leisure=fitness_centre": "Ginásio",
    "leisure=playground": "Parque infantil",
    "leisure=nature_reserve": "Reserva natural",
    "leisure=marina": "Marina",
    "shop=hairdresser": "Cabeleireiro",
    "shop=clothes": "Roupa",
    "shop=car_repair": "Oficina",
    "shop=butcher": "Talho",
    "shop=florist": "Florista",
    "shop=hardware": "Ferragens",
    "shop=mall": "Centro comercial",
    "place=square": "Praça",
    "place=islet": "Ilhéu",
    "place=island": "Ilha",
}

# O que NÃO entra, mesmo com nome. São coisas que ninguém escreve numa caixa
# de procura para ir lá de autocarro, e cada uma custa espaço no telemóvel de
# quem procura.
FORA = {
    "amenity=recycling",
    "amenity=charging_station",
    "amenity=waste_disposal",
    "amenity=bench",
    "amenity=drinking_water",
    "amenity=parking_space",
    "amenity=bicycle_parking",
    "amenity=hunting_stand",
    "amenity=shelter",
}

# Valores que não descrevem nada. `shop=yes` diz «é uma loja» e mais nada;
# mostrá-lo por baixo do nome é ruído.
VAZIOS = {"yes", "no"}


class _Sitios(osmium.SimpleHandler):
    """Nós e vias com nome e uma etiqueta que os torne um sítio."""

    def __init__(self, dentro=None) -> None:
        super().__init__()
        self.dentro = dentro
        self.encontrados: list[dict[str, Any]] = []

    def _classe(self, etiquetas: dict[str, str]) -> tuple[str, str] | None:
        for chave in CHAVES:
            valor = etiquetas.get(chave)
            if not valor:
                continue
            crua = f"{chave}={valor}"
            if crua in FORA:
                return None
            # SEM TRADUÇÃO NÃO SE MOSTRA NADA.
            #
            # Havia um recurso que punha a etiqueta crua — «bicycle rental»,
            # «hairdresser» — por baixo do nome, num produto em português
            # europeu. Uma descrição em inglês é pior do que descrição nenhuma:
            # o nome já lá está, e o inglês faz parecer que o sítio é de outra
            # coisa qualquer.
            if valor in VAZIOS:
                return None
            return crua, CLASSES.get(crua, "")
        return None

    def _juntar(self, ident: str, nome_do_sitio: str, lat: float, lon: float, classe) -> None:
        if self.dentro is not None and not self.dentro(lat, lon):
            return
        crua, legivel = classe
        self.encontrados.append(
            {
                "id": ident,
                "nome": nome_do_sitio,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "classe": crua,
                "tipo": legivel,
            }
        )

    def node(self, n) -> None:  # noqa: N802 — nome imposto pelo pyosmium
        # O NÓ SEM ETIQUETAS SAI ANTES DE SE LHE TOCAR.
        #
        # Num ficheiro de OpenStreetMap a esmagadora maioria dos nós é
        # geometria pura: os pontos por onde passa uma estrada. Nenhum deles
        # tem `name`, por isso eram todos deitados fora — mas só DEPOIS de se
        # lhes construir um dicionário de etiquetas vazio, milhões de vezes.
        # Era isso que custava os dois minutos deste leitor.
        if not n.tags:
            return
        # As etiquetas primeiro: o recorte tem milhões de nós e a pergunta
        # geométrica é cara. É a mesma ordem do `osm.py`, pela mesma razão.
        etiquetas = {t.k: t.v for t in n.tags}
        nome_do_sitio = etiquetas.get("name")
        if not nome_do_sitio:
            return
        classe = self._classe(etiquetas)
        if classe is None:
            return
        self._juntar(f"n{n.id}", nome_do_sitio, n.location.lat, n.location.lon, classe)

    def area(self, a) -> None:  # noqa: N802
        """Multipolígonos — e o Castelo de Almourol é um deles.

        Existe por uma ausência que se viu na procura: «Castelo de Almourol»
        devolvia a estação de bicicletas com esse nome e não o castelo. No
        OpenStreetMap o castelo é uma RELAÇÃO, e um leitor que só veja nós e
        vias perde exatamente os sítios grandes — que são os que as pessoas
        procuram.
        """
        if a.from_way():
            return  # já veio pelo `way`; contá-lo outra vez era duplicá-lo
        etiquetas = {t.k: t.v for t in a.tags}
        nome_do_sitio = etiquetas.get("name")
        if not nome_do_sitio:
            return
        classe = self._classe(etiquetas)
        if classe is None:
            return
        # A média do anel exterior, como nas vias. O `WKBFactory` desta versão
        # do pyosmium não calcula centroides, e para pôr um alfinete num
        # castelo a média dos vértices chega.
        pontos: list[tuple[float, float]] = []
        try:
            for anel in a.outer_rings():
                for no in anel:
                    if no.location.valid():
                        pontos.append((no.location.lat, no.location.lon))
        except Exception:  # noqa: BLE001 — geometria inválida acontece no OSM
            return
        if not pontos:
            return
        lat = sum(x[0] for x in pontos) / len(pontos)
        lon = sum(x[1] for x in pontos) / len(pontos)
        self._juntar(f"a{a.id}", nome_do_sitio, lat, lon, classe)

    def way(self, w) -> None:  # noqa: N802
        etiquetas = {t.k: t.v for t in w.tags}
        nome_do_sitio = etiquetas.get("name")
        if not nome_do_sitio:
            return
        classe = self._classe(etiquetas)
        if classe is None:
            return
        # O CENTRO DA VIA, calculado à mão a partir dos nós.
        #
        # O `osmium` sabe calcular centroides, mas isso exige o tratador de
        # áreas e uma segunda passagem pelo ficheiro. Para pôr um alfinete num
        # hospital, a média dos vértices chega — e erra por metros num
        # polígono de um edifício.
        try:
            pontos = [(no.lat, no.lon) for no in w.nodes if no.location.valid()]
        except osmium.InvalidLocationError:
            return
        if not pontos:
            return
        lat = sum(p[0] for p in pontos) / len(pontos)
        lon = sum(p[1] for p in pontos) / len(pontos)
        self._juntar(f"w{w.id}", nome_do_sitio, lat, lon, classe)


def ler(ctx: Contexto, saida) -> Resultado:
    origem: Path = _ficheiro(ctx, saida)
    h = _Sitios(ctx.dentro)
    # `locations=True`: sem isto as vias não sabem onde estão os seus nós, e
    # todos os polígonos — que são os sítios grandes — ficavam de fora.
    h.apply_file(str(origem), locations=True)

    # Um sítio por NOME e classe: o OpenStreetMap tem o mesmo café mapeado
    # como nó e como polígono mais vezes do que se gostaria, e duas respostas
    # iguais numa lista são uma a mais.
    vistos: dict[tuple[str, str], dict[str, Any]] = {}
    for s in h.encontrados:
        vistos.setdefault((s["nome"], s["classe"]), s)
    sitios = sorted(vistos.values(), key=lambda s: (s["nome"], s["id"]))

    destino = ctx.caminho_de_saida(saida)
    _escrever_geojson(
        destino,
        [
            {
                "type": "Feature",
                "id": s["id"],
                "geometry": {"type": "Point", "coordinates": [s["lon"], s["lat"]]},
                "properties": {"nome": s["nome"], "classe": s["classe"], "tipo": s["tipo"]},
            }
            for s in sitios
        ],
    )

    return Resultado(
        contagens={"sitios.total": len(sitios)},
        saidas={saida.saida or "": str(destino.relative_to(ctx.raiz))},
        notas=[ATRIBUICAO],
    )
