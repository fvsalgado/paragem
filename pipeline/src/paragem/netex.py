"""A rede em NeTEx, no perfil europeu de informação ao passageiro (EPIP).

O NeTEx (CEN/TS 16614) é o formato que o Regulamento Delegado (UE) 2017/1926
indica para os dados estáticos dos Pontos de Acesso Nacionais, e o EPIP — o
*European Passenger Information Profile*, CEN/TS 16614-4 — é o subconjunto dele
que chega para informar quem viaja: paragens, linhas, percursos, horários e
calendário. É isso que este módulo escreve, e mais nada.

**PARTE DO MESMO GTFS QUE O SÍTIO PUBLICA**, e não de uma segunda leitura das
fontes. Uma segunda leitura era uma segunda opinião sobre a mesma rede, e no dia
em que divergissem ninguém saberia dizer qual estava certa. Aqui a regra é a do
`sitio.py`: há uma construção, e os formatos são maneiras de a escrever. Quem
compara o NeTEx com o GTFS da mesma construção tem de encontrar as mesmas
paragens, as mesmas viagens e as mesmas horas — e há um teste a dizê-lo.

**O QUE O EPIP PEDE, E DE ONDE SAI:**

  ResourceFrame        (EU_PI_COMMON)    a autoridade de transportes (do
                                         `regiao.yaml`) e os operadores (do
                                         `agency.txt`);
  SiteFrame            (EU_PI_STOP)      um StopPlace por estação ou paragem
                                         solta, com os Quay dentro (`stops.txt`);
  ServiceFrame         (EU_PI_NETWORK)   a Network, as Line (`routes.txt`), os
                                         ScheduledStopPoint, a atribuição de
                                         cada um ao seu Quay, os destinos
                                         (`trip_headsign`) e os padrões de
                                         paragens (ServiceJourneyPattern);
  ServiceCalendarFrame (EU_PI_CALENDAR)  um DayType por `service_id`, com os
                                         dias em que anda escritos um a um;
  TimetableFrame       (EU_PI_TIMETABLE) uma ServiceJourney por viagem, com as
                                         horas de passagem (`stop_times.txt`).

Tudo isto dentro de um CompositeFrame do tipo EU_PI_NETWORK_OFFER — a rede
inteira num ficheiro —, que é o que o perfil chama à oferta de uma rede.

**O TRANSPORTE A PEDIDO** sai pelo mesmo caminho, do seu GTFS-Flex: uma linha
com passagens que apontam para uma regra de reserva (`booking_rules.txt`) é
uma `FlexibleLine`, com a regra em `BookingArrangements`, e cada viagem dela
leva `FlexibleServiceProperties`. Ver `_reserva` para o que se traduz e o que
fica só na mensagem.

**A HORA ESTIMADA CONTINUA ESTIMADA.** O caderno de horários de uma operadora
marca cerca de um terço das paragens, e as outras levam no GTFS uma hora
estimada com `timepoint=0`. Escrevê-las aqui como horas certas era inventar uma
precisão que ninguém mediu. O NeTEx inteiro di-lo no ponto do padrão
(`TimingPointStatus`), mas o perfil tirou-lho; o que o perfil deixa é uma nota
(`Notice`, código `hora-estimada`) atribuída a cada ponto onde a hora é
estimada — ver `_padrao`. Como o `timepoint` é da viagem e o ponto do padrão é
de todas as viagens que o partilham, entra na chave do padrão: duas viagens com
as mesmas paragens e horas certas em sítios diferentes têm padrões diferentes.

**O QUE FICA DE FORA, E PORQUÊ** (está também em `FORA`, que o relatório lê):

- os traçados (`shapes.txt`). O EPIP não os exige — o próprio esquema do perfil
  diz que «os dados podem não estar disponíveis» —, e numa rede real são 13 MB
  de pontos em CSV ao lado de 17 MB do XML inteiro: em GML, quase o dobravam.
  Ficam no GTFS, ao lado;
- as tarifas (`fare_*.txt`). O EPIP é de informação ao passageiro e não tem
  tarifas: essas são de outro perfil (o europeu de tarifas), e outro trabalho;
- as frequências (`frequencies.txt`), os transbordos (`transfers.txt`) e os
  percursos dentro das estações (`pathways.txt`, `levels.txt`). As nossas redes
  não os têm; um feed que os traga não os perde em silêncio: o relatório
  di-lo;
- o que o GTFS não tem e o perfil prevê — o lugar de cada paragem na carta
  administrativa (TopographicPlace), os RoutePoint de cada percurso, a
  acessibilidade das paragens e dos veículos. Não se inventa: fica por
  escrever até haver de onde o tirar.

**O QUE ISTO NÃO É:** uma publicação da autoridade de transportes. O ficheiro
diz quem o construiu e a partir de quê (`Description`), e os termos com que se
descarrega são os do feed de onde sai — a página de dados abertos rotula-o pelo
mesmo `_termos` que rotula o GTFS.

**A validação** é contra o esquema OFICIAL do NeTEx (repositório NeTEx-CEN, com
etiqueta e commit fixados), e também contra o esquema do perfil EPIP, que o
próprio repositório dele diz não ser normativo nem mantido — por isso o
primeiro bloqueia e o segundo só avisa. Os esquemas não vivem neste
repositório: descarregam-se, como o validador de GTFS, para `.cache/netex/`.
Ver `docs/NETEX.md`.
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
import zipfile
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from lxml import etree

from .gtfs import Gtfs, Linha, segundos

NS = "http://www.netex.org.uk/netex"
NS_GML = "http://www.opengis.net/gml/3.2"
NSMAP = {None: NS, "gml": NS_GML}

#: Os tipos de quadro do EPIP, como o perfil os declara (`epip_common_profile.xml`
#: no repositório oficial). A referência é EXTERNA — o ficheiro não redefine o
#: perfil —, e por isso leva `versionRef` e não `version`.
TIPO_DE_QUADRO = {
    "oferta": "epip:EU_PI_NETWORK_OFFER",
    "comum": "epip:EU_PI_COMMON",
    "paragens": "epip:EU_PI_STOP",
    "rede": "epip:EU_PI_NETWORK",
    "calendario": "epip:EU_PI_CALENDAR",
    "horario": "epip:EU_PI_TIMETABLE",
}
VERSAO_DO_PERFIL = "epip:1.0"

#: A versão de cada objeto que o ficheiro define. É uma só, e é de propósito:
#: as referências internas levam-na também, e é isso que faz o esquema oficial
#: conferir que cada referência aponta para alguma coisa que existe (as chaves
#: do NeTEx são pares `id` + `version`). Uma referência sem versão não se
#: confere, e uma referência pendurada passava.
VERSAO = "1"

#: O código da nota que marca uma hora estimada (ver `_padrao`).
NOTA_DA_HORA_ESTIMADA = "hora-estimada"

#: O que o GTFS pode ter e este ficheiro não escreve. É lido pelo relatório,
#: que só fala do que o feed TEM: uma tabela vazia não é perda nenhuma.
FORA = {
    "shapes.txt": (
        "os traçados — o EPIP não os exige, e ficam no GTFS ao lado; escrevê-los quase "
        "dobrava o ficheiro"
    ),
    "frequencies.txt": "as viagens por frequência (TemplateServiceJourney) não estão escritas",
    "transfers.txt": "os transbordos entre viagens (ServiceJourneyInterchange) não estão escritos",
    "pathways.txt": "os percursos dentro das estações não fazem parte do EPIP",
    "levels.txt": "os pisos das estações não fazem parte do EPIP",
    "fare_attributes.txt": "as tarifas são de outro perfil (o europeu de tarifas)",
    "fare_rules.txt": "as tarifas são de outro perfil (o europeu de tarifas)",
    "fare_products.txt": "as tarifas são de outro perfil (o europeu de tarifas)",
    "fare_leg_rules.txt": "as tarifas são de outro perfil (o europeu de tarifas)",
    "fare_media.txt": "as tarifas são de outro perfil (o europeu de tarifas)",
    "fare_transfer_rules.txt": "as tarifas são de outro perfil (o europeu de tarifas)",
    "rider_categories.txt": "as tarifas são de outro perfil (o europeu de tarifas)",
    "networks.txt": "as redes tarifárias são de outro perfil (o europeu de tarifas)",
    "route_networks.txt": "as redes tarifárias são de outro perfil (o europeu de tarifas)",
    "location_groups.txt": (
        "as zonas do transporte a pedido (FlexibleArea) ainda não estão escritas; as viagens "
        "que as usam ficam de fora, contadas"
    ),
    "locations.geojson": (
        "as zonas do transporte a pedido (FlexibleArea) ainda não estão escritas; as viagens "
        "que as usam ficam de fora, contadas"
    ),
}


# --- os modos ---------------------------------------------------------------
#
# O `route_type` do GTFS, nos seus dois dialetos (o de base, 0–12, e o alargado,
# em centenas), para o `TransportMode` do NeTEx e o tipo de paragem que lhe
# corresponde. Um tipo que não está aqui sai como `other` — e o relatório diz
# quantos, em vez de os pôr todos no autocarro por omissão.

_MODO_BASE = {
    0: "tram",
    1: "metro",
    2: "rail",
    3: "bus",
    4: "water",
    5: "tram",
    6: "cableway",
    7: "funicular",
    11: "trolleyBus",
    12: "rail",
}
_MODO_ALARGADO = [
    (100, 199, "rail"),
    (200, 299, "coach"),
    (400, 499, "metro"),
    (700, 799, "bus"),
    (800, 899, "trolleyBus"),
    (900, 999, "tram"),
    (1000, 1099, "water"),
    (1200, 1299, "water"),
    (1300, 1399, "cableway"),
    (1400, 1499, "funicular"),
]
_TIPO_DE_PARAGEM = {
    "bus": "onstreetBus",
    "trolleyBus": "onstreetBus",
    "coach": "coachStation",
    "rail": "railStation",
    "metro": "metroStation",
    "tram": "onstreetTram",
    "water": "ferryStop",
    "cableway": "liftStation",
    "funicular": "liftStation",
}


def modo_de(route_type: str) -> str:
    try:
        n = int((route_type or "").strip())
    except ValueError:
        return "other"
    if n in _MODO_BASE:
        return _MODO_BASE[n]
    for inicio, fim, modo in _MODO_ALARGADO:
        if inicio <= n <= fim:
            return modo
    return "other"


# --- o que se escreveu ------------------------------------------------------


@dataclass
class Resumo:
    """O que o ficheiro leva, contado à saída — e o que deixou de fora."""

    linhas: int = 0
    #: Das quais a pedido (`FlexibleLine`).
    linhas_a_pedido: int = 0
    viagens: int = 0
    paragens: int = 0
    lugares: int = 0
    padroes: int = 0
    passagens: int = 0
    tipos_de_dia: int = 0
    dias: int = 0
    bytes_xml: int = 0
    #: Viagens que não se escreveram, e porquê: uma viagem sem duas paragens,
    #: ou sem dia nenhum de serviço, não é uma viagem que se possa apanhar.
    viagens_de_fora: Counter[str] = field(default_factory=Counter)
    #: Tabelas do GTFS que o feed tem e o ficheiro não escreve (`FORA`).
    tabelas_de_fora: dict[str, int] = field(default_factory=dict)
    #: Linhas cujo `route_type` não tem correspondência, e saíram como `other`.
    modos_desconhecidos: Counter[str] = field(default_factory=Counter)


@dataclass(frozen=True)
class Identidade:
    """Quem é a rede, e quem fez o ficheiro — o que não está no GTFS.

    Vem da declaração da região (`regiao.yaml`) e não do feed: o GTFS não diz
    qual é a autoridade de transportes, e o NeTEx quere-a com nome. Tudo aqui
    é dado da região; o código não sabe nenhum.
    """

    #: O espaço de nomes dos identificadores: `<codigo>:Line:<route_id>`.
    codigo: str
    #: O endereço do espaço de nomes — o domínio da região, quando o declara.
    url: str
    nome_da_rede: str
    autoridade: dict[str, Any]
    fuso: str = "Europe/Lisbon"
    lingua: str = "pt"
    #: Se a receita declara que parte da saída de onde isto sai vem do
    #: OpenStreetMap (`partes_odbl`). A nota da ODbL vai então dentro do XML —
    #: e não só num `ATRIBUICAO.txt` ao lado dele no zip, que um Ponto de
    #: Acesso que espera um XML só pode deitar fora.
    com_openstreetmap: bool = False


def identidade_da_regiao(regiao: Any, feed: Gtfs, saida: Any = None) -> Identidade:
    """A identidade de uma região, tirada do que ela declara.

    O transporte a pedido não é «a rede»: é outro serviço, muitas vezes de
    outra entidade. O nome dele vem da agência do próprio feed, quando há uma
    só, e não do `rede.nome` da região — que chamava ao transporte a pedido o
    nome da concessão regular.
    """
    rede = regiao.rede or {}
    url = f"https://{regiao.dominio}/" if regiao.dominio else (rede.get("url") or "")
    agencias = list(feed.obter("agency.txt"))
    fuso = (agencias[0].get("agency_timezone") if agencias else "") or (
        (regiao.motor or {}).get("fuso") or "Europe/Lisbon"
    )
    lingua = (agencias[0].get("agency_lang") if agencias else "") or "pt"
    nome = rede.get("nome") or regiao.nome
    if saida is not None and saida.papel == "feed-proprio-flex":
        nome = (agencias[0].get("agency_name") if len(agencias) == 1 else "") or (
            "Transporte a pedido"
        )
    return Identidade(
        codigo=regiao.id,
        url=url,
        nome_da_rede=nome,
        autoridade=dict(regiao.autoridade or {}),
        fuso=fuso,
        lingua=lingua.lower(),
        com_openstreetmap=bool(saida is not None and getattr(saida, "partes_odbl", None)),
    )


# --- escrever ---------------------------------------------------------------


def _q(tag: str) -> str:
    return f"{{{NS}}}{tag}"


def _el(pai: etree._Element, tag: str, texto: str | None = None, **atributos: str) -> Any:
    e = etree.SubElement(pai, _q(tag), {k: v for k, v in atributos.items() if v is not None})
    if texto is not None:
        e.text = texto
    return e


def _ref(pai: etree._Element, tag: str, ident: str) -> Any:
    """Uma referência INTERNA: com a versão, para o esquema a conferir."""
    return _el(pai, tag, ref=ident, version=VERSAO)


def _objeto(pai: etree._Element, tag: str, ident: str, **atributos: str) -> Any:
    return _el(pai, tag, id=ident, version=VERSAO, **atributos)


def _hora(valor: str) -> tuple[str, int] | None:
    """`25:10:00` → (`01:10:00`, 1). O NeTEx diz a passagem da meia-noite à parte."""
    s = segundos(valor)
    if s is None:
        return None
    dias, resto = divmod(s, 86400)
    h, resto = divmod(resto, 3600)
    m, seg = divmod(resto, 60)
    return f"{h:02d}:{m:02d}:{seg:02d}", dias


def _data_iso(aaaammdd: str) -> str:
    return f"{aaaammdd[:4]}-{aaaammdd[4:6]}-{aaaammdd[6:8]}"


def _cor(valor: str | None) -> str | None:
    v = (valor or "").strip().lstrip("#").upper()
    if len(v) == 6 and all(c in "0123456789ABCDEF" for c in v):
        return v
    return None


def _int(valor: str | None, omissao: int = 0) -> int:
    try:
        return int((valor or "").strip())
    except ValueError:
        return omissao


def construir_xml(
    feed: Gtfs,
    identidade: Identidade,
    *,
    hoje: date,
) -> tuple[etree._Element, Resumo]:
    """O documento inteiro, a partir de um GTFS. Não escreve nada em disco."""
    from .grelha import _datas_de_servico

    r = Resumo()
    cs = identidade.codigo

    def ident(classe: str, valor: str) -> str:
        return f"{cs}:{classe}:{valor}"

    for tabela in FORA:
        if tabela in feed and len(feed[tabela]):
            r.tabelas_de_fora[tabela] = len(feed[tabela])

    # --- o que anda, e em que dias --------------------------------------
    por_data = _datas_de_servico(feed)
    dias_de: dict[str, list[str]] = {}
    for data, servicos in por_data.items():
        for sid in servicos:
            dias_de.setdefault(sid, []).append(data)
    for lista in dias_de.values():
        lista.sort()

    paragens = {s["stop_id"]: s for s in feed.stops if s.get("stop_id")}
    linhas = {x["route_id"]: x for x in feed.routes if x.get("route_id")}
    horas_de: dict[str, list[Linha]] = {}
    for st in feed.stop_times:
        horas_de.setdefault(st.get("trip_id", ""), []).append(st)
    for sequencia in horas_de.values():
        sequencia.sort(key=lambda x: _int(x.get("stop_sequence")))

    viagens: list[Linha] = []
    for t in sorted(feed.trips, key=lambda x: x.get("trip_id", "")):
        tid = t.get("trip_id", "")
        if t.get("route_id") not in linhas:
            r.viagens_de_fora["sem linha no routes.txt"] += 1
            continue
        if len(horas_de.get(tid, [])) < 2:
            r.viagens_de_fora["com menos de duas paragens"] += 1
            continue
        if not dias_de.get(t.get("service_id", "")):
            r.viagens_de_fora["sem nenhum dia de serviço"] += 1
            continue
        if any(
            st.get("start_pickup_drop_off_window") or st.get("end_pickup_drop_off_window")
            for st in horas_de[tid]
        ):
            # O GTFS-Flex por zonas: uma janela em vez de uma hora, e uma zona
            # em vez de uma paragem. O NeTEx tem onde o dizer (FlexibleArea),
            # e está por escrever; até lá, a viagem não entra com horas que
            # não tem.
            r.viagens_de_fora["com janelas de recolha (a pedido por zonas)"] += 1
            continue
        if any(st.get("stop_id") not in paragens for st in horas_de[tid]):
            r.viagens_de_fora["com uma paragem que o stops.txt não tem"] += 1
            continue
        viagens.append(t)

    # --- a pedido: as linhas que só andam com reserva -----------------------
    #
    # Uma linha é A PEDIDO quando alguma passagem dela aponta para uma regra de
    # reserva (`booking_rules.txt`) — é o que o GTFS-Flex escreve, e é o que o
    # leitor das brochuras escreve para o transporte a pedido. Em NeTEx passa
    # a `FlexibleLine`, com a regra em `BookingArrangements`; e cada viagem
    # leva `FlexibleServiceProperties`, que é onde um leitor de NeTEx vai ver
    # que aquela viagem não se faz se ninguém a reservar. A hora da brochura
    # continua a ser a hora a que passa — `fixedPassingTimes` —, se passar.
    regras = {
        b["booking_rule_id"]: b for b in feed.obter("booking_rules.txt") if b.get("booking_rule_id")
    }
    regras_da_viagem: dict[str, Counter[str]] = {}
    juntas: dict[str, Counter[str]] = {}
    toda_a_pedido: dict[str, bool] = {}
    for t in viagens:
        c: Counter[str] = Counter()
        sem_reserva = False
        for st in horas_de[t["trip_id"]]:
            daqui = [
                st[x]
                for x in ("pickup_booking_rule_id", "drop_off_booking_rule_id")
                if st.get(x) in regras
            ]
            c.update(daqui)
            sem_reserva = sem_reserva or not daqui
        regras_da_viagem[t["trip_id"]] = c
        rid = t["route_id"]
        if c:
            juntas.setdefault(rid, Counter()).update(c)
        toda_a_pedido[rid] = toda_a_pedido.get(rid, True) and not sem_reserva
    # A regra da linha é a que as passagens dela mais usam.
    regra_da_linha = {rid: c.most_common(1)[0][0] for rid, c in juntas.items()}

    servicos_usados = sorted({t["service_id"] for t in viagens})
    linhas_usadas = sorted({t["route_id"] for t in viagens}, key=_ordem_natural)
    paragens_usadas = sorted({st["stop_id"] for t in viagens for st in horas_de[t["trip_id"]]})

    # O modo de uma paragem é o das linhas que lá param — o mais frequente,
    # quando há mais do que um. Uma paragem de autocarro em frente a uma
    # estação continua a ser uma paragem de autocarro.
    modo_da_linha = {rid: modo_de(linhas[rid].get("route_type", "")) for rid in linhas_usadas}
    for rid, modo in modo_da_linha.items():
        if modo == "other":
            r.modos_desconhecidos[linhas[rid].get("route_type", "") or "(vazio)"] += 1
    modos_na_paragem: dict[str, Counter[str]] = {}
    for t in viagens:
        for st in horas_de[t["trip_id"]]:
            modos_na_paragem.setdefault(st["stop_id"], Counter())[modo_da_linha[t["route_id"]]] += 1

    todas_as_datas = sorted({d for sid in servicos_usados for d in dias_de[sid]})
    info = next(iter(feed.obter("feed_info.txt")), {})
    inicio = info.get("feed_start_date") or (todas_as_datas[0] if todas_as_datas else "")
    fim = info.get("feed_end_date") or (todas_as_datas[-1] if todas_as_datas else "")

    # --- o envelope -------------------------------------------------------
    raiz = etree.Element(_q("PublicationDelivery"), nsmap=NSMAP, version=VERSAO_NETEX_ESCRITA)
    _el(raiz, "PublicationTimestamp", f"{hoje.isoformat()}T00:00:00")
    _el(raiz, "ParticipantRef", "paragem.pt")
    estimadas = any(
        (st.get("timepoint") or "1") == "0" for t in viagens for st in horas_de[t["trip_id"]]
    )
    _el(
        raiz,
        "Description",
        _descricao(feed, identidade, estimadas=estimadas, a_pedido=bool(regra_da_linha)),
    )
    objetos = _el(raiz, "dataObjects")

    composto = _objeto(objetos, "CompositeFrame", ident("CompositeFrame", "oferta"))
    if inicio and fim:
        vb = _el(composto, "ValidBetween")
        _el(vb, "FromDate", f"{_data_iso(inicio)}T00:00:00")
        _el(vb, "ToDate", f"{_data_iso(fim)}T23:59:59")
    _el(composto, "Name", identidade.nome_da_rede)
    _tipo(composto, "oferta")
    codespaces = _el(composto, "codespaces")
    c = _el(codespaces, "Codespace", id=cs)
    _el(c, "Xmlns", cs)
    if identidade.url:
        _el(c, "XmlnsUrl", identidade.url)
    _el(c, "Description", f"Identificadores da rede {identidade.nome_da_rede}, no Paragem.pt")
    defeitos = _el(composto, "FrameDefaults")
    _el(defeitos, "DefaultCodespaceRef", ref=cs)
    loc = _el(defeitos, "DefaultLocale")
    _el(loc, "TimeZone", identidade.fuso)
    _el(loc, "DefaultLanguage", identidade.lingua)
    # As coordenadas do GTFS são WGS84, e é isso que o perfil recomenda.
    _el(defeitos, "DefaultLocationSystem", "EPSG:4326")
    quadros = _el(composto, "frames")

    # --- comum: quem gere e quem opera ------------------------------------
    comum = _objeto(quadros, "ResourceFrame", ident("ResourceFrame", "comum"))
    _tipo(comum, "comum")
    organizacoes = _el(comum, "organisations")
    autoridade_id = None
    aut = identidade.autoridade
    if aut.get("nome"):
        autoridade_id = ident("Authority", aut.get("sigla") or "autoridade")
        a = _objeto(organizacoes, "Authority", autoridade_id)
        _el(a, "Name", aut["nome"])
        if aut.get("sigla"):
            _el(a, "ShortName", aut["sigla"])
        contacto = _el(a, "ContactDetails")
        if aut.get("url"):
            _el(contacto, "Url", aut["url"])
        _el(a, "OrganisationType", "authority")
    agencias = {a.get("agency_id", "") or "": a for a in feed.obter("agency.txt")}
    operador_de: dict[str, str] = {}
    for aid, a in sorted(agencias.items()):
        oid = ident("Operator", aid or "operador")
        operador_de[aid] = oid
        o = _objeto(organizacoes, "Operator", oid)
        _el(o, "Name", a.get("agency_name") or aid)
        contacto = _el(o, "ContactDetails")
        if a.get("agency_email"):
            _el(contacto, "Email", a["agency_email"])
        if a.get("agency_phone"):
            _el(contacto, "Phone", a["agency_phone"])
        if a.get("agency_url"):
            _el(contacto, "Url", a["agency_url"])
        # O fuso e a língua da agência não vão no operador: o perfil não lhe
        # dá `Locale`. Vão nos valores por omissão do quadro (`FrameDefaults`),
        # que é onde o EPIP os quer, e saem da mesma agência.
        _el(o, "OrganisationType", "operator")
    # Um feed com uma agência só pode deixar o `agency_id` das linhas vazio.
    unica = next(iter(operador_de.values())) if len(operador_de) == 1 else None

    # --- paragens: os lugares onde se espera ------------------------------
    sitio = _objeto(quadros, "SiteFrame", ident("SiteFrame", "paragens"))
    _tipo(sitio, "paragens")
    lugares = _el(sitio, "stopPlaces")
    # Uma estação do GTFS (`location_type=1`) é um StopPlace com os seus cais;
    # uma paragem solta é um StopPlace com um cais só, que é ela. É a leitura
    # que o próprio NeTEx dá do GTFS (exemplos `standards/gtfs` do oficial).
    filhas: dict[str, list[str]] = {}
    for sid in paragens_usadas:
        mae = paragens[sid].get("parent_station") or ""
        if mae and mae in paragens:
            filhas.setdefault(mae, []).append(sid)
    lugar_de: dict[str, str] = {}
    cais_de: dict[str, str] = {}
    soltas = [sid for sid in paragens_usadas if sid not in {f for v in filhas.values() for f in v}]
    for chave in sorted(set(filhas) | set(soltas)):
        membros = sorted(filhas[chave]) if chave in filhas else [chave]
        modos: Counter[str] = Counter()
        for m in membros:
            modos.update(modos_na_paragem.get(m, Counter()))
        modo = modos.most_common(1)[0][0] if modos else "bus"
        p = paragens[chave]
        lid = ident("StopPlace", chave)
        sp = _objeto(lugares, "StopPlace", lid)
        _el(sp, "Name", p.get("stop_name") or chave)
        _centroide(sp, p)
        _el(sp, "TransportMode", modo)
        _el(sp, "StopPlaceType", _TIPO_DE_PARAGEM.get(modo, "other"))
        cais = _el(sp, "quays")
        for m in membros:
            q = paragens[m]
            qid = ident("Quay", m)
            quay = _objeto(cais, "Quay", qid)
            _el(quay, "Name", q.get("stop_name") or m)
            _centroide(quay, q)
            if q.get("stop_code"):
                _el(quay, "PublicCode", q["stop_code"])
            lugar_de[m] = lid
            cais_de[m] = qid
        r.lugares += 1

    # --- a rede ------------------------------------------------------------
    servico = _objeto(quadros, "ServiceFrame", ident("ServiceFrame", "rede"))
    _tipo(servico, "rede")
    rede_id = ident("Network", cs)
    rede = _objeto(servico, "Network", rede_id)
    _el(rede, "Name", identidade.nome_da_rede)
    # AS LINHAS PERTENCEM À REDE PELA LISTA DA REDE, e não por uma referência
    # em cada linha: o perfil não dá à Line o `RepresentedByGroupRef` que o
    # NeTEx inteiro lhe dá. A lista vale nos dois.
    membros = _el(rede, "members")
    for rid in linhas_usadas:
        _ref(membros, "LineRef", ident("Line", rid))
    if autoridade_id:
        _ref(rede, "AuthorityRef", autoridade_id)

    # OS PERCURSOS, um por linha e sentido. O perfil exige que cada padrão de
    # paragens diga de que percurso é (`RouteRef`), e é pelo percurso que uma
    # viagem chega à sua linha — a ServiceJourney do EPIP não tem `LineRef`.
    # Saem SEM os pontos (`pointsInSequence`): os RoutePoint do NeTEx são a
    # geometria do percurso, e a do GTFS são os traçados que ficam de fora
    # (`FORA`). O que um percurso tem de paragens diz-se no padrão.
    percursos = sorted(
        {(t["route_id"], t.get("direction_id") or "") for t in viagens},
        key=lambda x: (_ordem_natural(x[0]), x[1]),
    )
    percurso_de = {
        (rid, sentido): ident("Route", f"{rid}-{sentido}" if sentido else rid)
        for rid, sentido in percursos
    }
    el_percursos = _el(servico, "routes")
    for rid, sentido in percursos:
        x = linhas[rid]
        rt = _objeto(el_percursos, "Route", percurso_de[(rid, sentido)])
        nome = x.get("route_long_name") or x.get("route_short_name") or rid
        _el(rt, "Name", nome + {"0": " (ida)", "1": " (volta)"}.get(sentido, ""))
        _ref(rt, "LineRef", ident("Line", rid))
        if sentido in ("0", "1"):
            _el(rt, "DirectionType", "outbound" if sentido == "0" else "inbound")

    # AS LINHAS A PEDIDO NUMA LISTA À PARTE quando há das duas. O perfil quer
    # numa lista de linhas ou só `Line` ou só `FlexibleLine` — o NeTEx inteiro
    # aceita-as juntas —, e por isso, num feed que misture, as a pedido vão
    # num segundo ServiceFrame do mesmo tipo. As referências valem no
    # documento inteiro, e a rede lista-as na mesma. Os nossos feeds não
    # misturam (a rede regular e o transporte a pedido são dois GTFS); um feed
    # de outra proveniência pode.
    el_linhas = _el(servico, "lines")
    el_flexiveis = el_linhas
    if regra_da_linha and len(regra_da_linha) < len(linhas_usadas):
        outro = _objeto(quadros, "ServiceFrame", ident("ServiceFrame", "rede-a-pedido"))
        _tipo(outro, "rede")
        el_flexiveis = _el(outro, "lines")
    for rid in linhas_usadas:
        x = linhas[rid]
        a_pedido = rid in regra_da_linha
        li = _objeto(
            el_flexiveis if a_pedido else el_linhas,
            "FlexibleLine" if a_pedido else "Line",
            ident("Line", rid),
        )
        _el(li, "Name", x.get("route_long_name") or x.get("route_short_name") or rid)
        if x.get("route_desc"):
            _el(li, "Description", x["route_desc"])
        _el(li, "TransportMode", modo_da_linha[rid])
        if x.get("route_url"):
            _el(li, "Url", x["route_url"])
        # O CÓDIGO PÚBLICO É O QUE O PÚBLICO CONHECE, e não o identificador
        # interno: um circuito a pedido sem número na brochura não ganha um
        # aqui. O `route_id` vai no código privado, que é para isso.
        if x.get("route_short_name"):
            _el(li, "PublicCode", x["route_short_name"])
        _el(li, "PrivateCode", rid)
        operador = operador_de.get(x.get("agency_id", "") or "") or unica
        if operador:
            _ref(li, "OperatorRef", operador)
        cor, texto = _cor(x.get("route_color")), _cor(x.get("route_text_color"))
        if cor or texto:
            apresentacao = _el(li, "Presentation")
            if cor:
                _el(apresentacao, "Colour", cor)
            if texto:
                _el(apresentacao, "TextColour", texto)
        if a_pedido:
            # `fixed`: as paragens e as horas são as da brochura, e o que é
            # flexível é só andar ou não. Uma linha com paragens que não pedem
            # reserva é `mixedFlexibleAndFixed`.
            _el(li, "FlexibleLineType", "fixed" if toda_a_pedido[rid] else "mixedFlexibleAndFixed")
            _reserva(li, regras[regra_da_linha[rid]])
            r.linhas_a_pedido += 1
        r.linhas += 1

    # Os destinos: um por texto distinto, e não um por viagem.
    destinos = sorted(
        (
            {t.get("trip_headsign") or "" for t in viagens}
            | {st.get("stop_headsign") or "" for t in viagens for st in horas_de[t["trip_id"]]}
        )
        - {""}
    )
    destino_de = {
        texto: ident("DestinationDisplay", str(i + 1)) for i, texto in enumerate(destinos)
    }
    if destinos:
        el_destinos = _el(servico, "destinationDisplays")
        for texto in destinos:
            dd = _objeto(el_destinos, "DestinationDisplay", destino_de[texto])
            _el(dd, "FrontText", texto)

    el_pontos = _el(servico, "scheduledStopPoints")
    for sid in paragens_usadas:
        p = paragens[sid]
        ssp = _objeto(el_pontos, "ScheduledStopPoint", ident("ScheduledStopPoint", sid))
        _el(ssp, "Name", p.get("stop_name") or sid)
        _localizacao(ssp, p)
        r.paragens += 1

    el_atribuicoes = _el(servico, "stopAssignments")
    for sid in paragens_usadas:
        psa = _objeto(
            el_atribuicoes,
            "PassengerStopAssignment",
            ident("PassengerStopAssignment", sid),
            order="1",
        )
        _ref(psa, "ScheduledStopPointRef", ident("ScheduledStopPoint", sid))
        _ref(psa, "StopPlaceRef", lugar_de[sid])
        _ref(psa, "QuayRef", cais_de[sid])

    # --- os padrões: a sequência de paragens, partilhada pelas viagens ------
    padrao_de: dict[str, str] = {}
    padroes: dict[tuple, str] = {}
    contador: Counter[str] = Counter()
    el_padroes = _el(servico, "journeyPatterns")
    for t in sorted(viagens, key=lambda x: (_ordem_natural(x["route_id"]), x["trip_id"])):
        pontos = tuple(
            _ponto_do_padrao(st, linha_a_pedido=t["route_id"] in regra_da_linha)
            for st in horas_de[t["trip_id"]]
        )
        do_padrao = (
            t["route_id"],
            t.get("direction_id") or "",
            t.get("trip_headsign") or "",
            pontos,
        )
        if do_padrao not in padroes:
            contador[t["route_id"]] += 1
            pid = ident("ServiceJourneyPattern", f"{t['route_id']}-{contador[t['route_id']]}")
            padroes[do_padrao] = pid
            _padrao(el_padroes, pid, do_padrao, ident, destino_de, percurso_de)
            r.padroes += 1
        padrao_de[t["trip_id"]] = padroes[do_padrao]

    # A NOTA DA HORA ESTIMADA, uma vez, e atribuída a cada ponto onde a hora o
    # é (ver `_padrao`). Só existe se algum ponto a usar.
    if any(p[4] == "notTimingPoint" for padrao in padroes for p in padrao[3]):
        notas = _el(servico, "notices")
        nota = _objeto(notas, "Notice", ident("Notice", NOTA_DA_HORA_ESTIMADA))
        _el(nota, "Name", "Hora estimada")
        _el(
            nota,
            "Text",
            "A hora nesta paragem é estimada: o horário publicado não a marca, e foi calculada "
            "entre as duas paragens com hora mais próximas. No GTFS da mesma construção, é "
            "timepoint=0.",
        )
        _el(nota, "PublicCode", NOTA_DA_HORA_ESTIMADA)

    # --- o calendário: que dias anda cada serviço ---------------------------
    calendario = _objeto(quadros, "ServiceCalendarFrame", ident("ServiceCalendarFrame", "dias"))
    _tipo(calendario, "calendario")
    if todas_as_datas:
        sc = _objeto(calendario, "ServiceCalendar", ident("ServiceCalendar", "dias"))
        _el(sc, "Name", f"Dias de serviço da rede {identidade.nome_da_rede}")
        _el(sc, "FromDate", _data_iso(todas_as_datas[0]))
        _el(sc, "ToDate", _data_iso(todas_as_datas[-1]))
        tipos = _el(sc, "dayTypes")
        for sid in servicos_usados:
            dt = _objeto(tipos, "DayType", ident("DayType", sid))
            _el(dt, "Name", sid)
            r.tipos_de_dia += 1
        # UM DIA DE CADA VEZ, e não uma regra semanal com exceções. A regra
        # seria mais curta, mas o GTFS desta construção já é uma lista de
        # dias (o calendário sai das regras da região, com os feriados e as
        # férias aplicados), e reescrevê-la como regra era inventar uma regra
        # que ninguém escreveu — e que um leitor diferente aplicaria de outra
        # maneira. Dias soltos leem-se de uma só forma.
        atribuicoes = _el(sc, "dayTypeAssignments")
        ordem = 0
        for sid in servicos_usados:
            for data in dias_de[sid]:
                ordem += 1
                dta = _objeto(
                    atribuicoes,
                    "DayTypeAssignment",
                    ident("DayTypeAssignment", f"{sid}-{data}"),
                    order=str(ordem),
                )
                _el(dta, "Date", _data_iso(data))
                _ref(dta, "DayTypeRef", ident("DayType", sid))
                r.dias += 1

    # --- o horário: cada viagem, com as horas -------------------------------
    horario = _objeto(quadros, "TimetableFrame", ident("TimetableFrame", "horario"))
    _tipo(horario, "horario")
    el_viagens = _el(horario, "vehicleJourneys")
    flexiveis: list[tuple[Any, Linha]] = []
    for t in sorted(viagens, key=lambda x: (_ordem_natural(x["route_id"]), x["trip_id"])):
        tid = t["trip_id"]
        sj = _objeto(el_viagens, "ServiceJourney", ident("ServiceJourney", tid))
        # O `trip_id` do GTFS é o fim do identificador, e é assim que uma
        # viagem se encontra nos dois ficheiros. A linha não se repete aqui: o
        # perfil chega-lhe pelo padrão e pelo percurso.
        if t.get("trip_short_name"):
            _el(sj, "Name", t["trip_short_name"])
        dias = _el(sj, "dayTypes")
        _ref(dias, "DayTypeRef", ident("DayType", t["service_id"]))
        _ref(sj, "ServiceJourneyPatternRef", padrao_de[tid])
        operador = operador_de.get(linhas[t["route_id"]].get("agency_id", "") or "") or unica
        if operador:
            _ref(sj, "OperatorRef", operador)
        passagens = _el(sj, "passingTimes")
        if t["route_id"] in regra_da_linha:
            # Vai depois das passagens, porque é aí que o perfil o põe; o
            # esquema escreve-se depois de as escrever (`_flexivel`).
            flexiveis.append((sj, t))
        for ordem, st in enumerate(horas_de[tid], start=1):
            # COM IDENTIFICADOR, que a 2.0 do esquema passou a exigir e a 1.x
            # aceitava sem ele — a viagem e a ordem, como o ponto do padrão.
            tpt = _objeto(
                passagens, "TimetabledPassingTime", ident("TimetabledPassingTime", f"{tid}-{ordem}")
            )
            _ref(
                tpt,
                "StopPointInJourneyPatternRef",
                _id_do_ponto(padrao_de[tid], ordem),
            )
            chegada = _hora(st.get("arrival_time", ""))
            partida = _hora(st.get("departure_time", ""))
            if chegada:
                _el(tpt, "ArrivalTime", chegada[0])
                if chegada[1]:
                    _el(tpt, "ArrivalDayOffset", str(chegada[1]))
            if partida:
                _el(tpt, "DepartureTime", partida[0])
                if partida[1]:
                    _el(tpt, "DepartureDayOffset", str(partida[1]))
            r.passagens += 1
        r.viagens += 1

    for sj, t in flexiveis:
        fsp = _objeto(
            sj, "FlexibleServiceProperties", ident("FlexibleServiceProperties", t["trip_id"])
        )
        _el(fsp, "FlexibleServiceType", "fixedPassingTimes")
        # A regra só se repete na viagem quando não é a da linha: o mesmo
        # circuito pode ter viagens com reservas diferentes.
        propria = regras_da_viagem[t["trip_id"]].most_common(1)
        if propria and propria[0][0] != regra_da_linha[t["route_id"]]:
            _reserva(fsp, regras[propria[0][0]])

    return raiz, r


def _reserva(pai: etree._Element, regra: Linha) -> None:
    """Uma regra de reserva do GTFS-Flex, em `BookingArrangements` do NeTEx.

    O que se traduz e o que fica só no texto:

    - `booking_type=0` (na hora) → `timeOfTravelOnly`;
    - `booking_type=1` (no próprio dia, com antecedência) → `advanceAndDayOfTravel`,
      com a antecedência em `MinimumBookingPeriod`;
    - `booking_type=2` (até ao dia anterior) → `untilPreviousDay` com a hora-limite
      em `LatestBookingTime`, quando é a véspera; `advanceOnly` quando são mais
      dias, que o perfil não sabe contar;
    - o telefone e o endereço, em `BookingContact` e `BookingUrl`, e os métodos
      que eles permitem em `BookingMethods`.

    O «dia ÚTIL anterior» (`prior_notice_service_id`) não tem onde ir no perfil:
    fica na mensagem (`BookingNote`), que vai sempre e diz a regra inteira por
    palavras — que é como quem viaja a lê.
    """
    telefone = (regra.get("phone_number") or "").strip()
    endereco = (regra.get("booking_url") or "").strip()
    informacao = (regra.get("info_url") or "").strip() or endereco
    if telefone or informacao:
        contacto = _el(pai, "BookingContact")
        if telefone:
            _el(contacto, "Phone", telefone)
        if informacao:
            _el(contacto, "Url", informacao)
    metodos = [m for m, ha in (("callOffice", telefone), ("online", endereco)) if ha]
    if metodos:
        _el(pai, "BookingMethods", " ".join(metodos))
    tipo = (regra.get("booking_type") or "").strip()
    dias = _int(regra.get("prior_notice_last_day"), 0)
    if tipo == "0":
        _el(pai, "BookWhen", "timeOfTravelOnly")
    elif tipo == "1":
        _el(pai, "BookWhen", "advanceAndDayOfTravel")
    elif tipo == "2":
        _el(pai, "BookWhen", "untilPreviousDay" if dias <= 1 else "advanceOnly")
        hora = _hora(regra.get("prior_notice_last_time") or "")
        if hora:
            _el(pai, "LatestBookingTime", hora[0])
    if tipo == "1" and _int(regra.get("prior_notice_duration_min"), 0) > 0:
        _el(pai, "MinimumBookingPeriod", f"PT{_int(regra.get('prior_notice_duration_min'))}M")
    if endereco:
        _el(pai, "BookingUrl", endereco)
    if (regra.get("message") or "").strip():
        _el(pai, "BookingNote", regra["message"].strip())


def _ordem_natural(codigo: str) -> tuple:
    """`2` antes de `10`: as linhas pela ordem em que se leem, não a do alfabeto."""
    partes: list[tuple[int, int | str]] = []
    numero = ""
    for c in codigo:
        if c.isdigit():
            numero += c
            continue
        if numero:
            partes.append((0, int(numero)))
            numero = ""
        partes.append((1, c))
    if numero:
        partes.append((0, int(numero)))
    return tuple(partes)


def _ponto_do_padrao(
    st: Linha, *, linha_a_pedido: bool = False
) -> tuple[str, bool, bool, bool, str, str]:
    """O que um ponto do padrão diz: onde, se se entra, se se sai, se a hora é certa."""
    entra = st.get("pickup_type", "") or "0"
    sai = st.get("drop_off_type", "") or "0"
    # `2` (marcar com a operadora) e `3` (combinar com o motorista) são, em
    # NeTEx, uma paragem a pedido: `RequestStop`. O GTFS distingue as duas e
    # distingue a entrada da saída; o NeTEx do perfil não, e fica a mais
    # restritiva das duas. NUMA LINHA A PEDIDO o `2` não se repete paragem a
    # paragem: a reserva é da linha (`BookingArrangements`), e marcar as vinte
    # paragens de um circuito como «a pedido» não dizia nada que a linha não
    # diga — só o `3`, que é outra coisa (fazer sinal ao motorista).
    pedidos = ("3",) if linha_a_pedido else ("2", "3")
    a_pedido = entra in pedidos or sai in pedidos
    certa = (st.get("timepoint", "") or "1") != "0"
    return (
        st["stop_id"],
        entra != "1",
        sai != "1",
        a_pedido,
        "timingPoint" if certa else "notTimingPoint",
        st.get("stop_headsign") or "",
    )


def _id_do_ponto(padrao: str, ordem: int) -> str:
    cs, _, resto = padrao.split(":", 2)
    return f"{cs}:StopPointInJourneyPattern:{resto}-{ordem}"


def _padrao(
    pai: etree._Element,
    pid: str,
    chave: tuple,
    ident,
    destino_de: dict[str, str],
    percurso_de: dict[tuple[str, str], str],
) -> None:
    rid, sentido, destino, pontos = chave
    sjp = _objeto(pai, "ServiceJourneyPattern", pid)
    _ref(sjp, "RouteRef", percurso_de[(rid, sentido)])
    if destino:
        _ref(sjp, "DestinationDisplayRef", destino_de[destino])
    sequencia = _el(sjp, "pointsInSequence")
    anterior = ""
    for ordem, (sid, entra, sai, a_pedido, estado, destino_aqui) in enumerate(pontos, start=1):
        spijp = _objeto(
            sequencia, "StopPointInJourneyPattern", _id_do_ponto(pid, ordem), order=str(ordem)
        )
        _ref(spijp, "ScheduledStopPointRef", ident("ScheduledStopPoint", sid))
        if not sai:
            _el(spijp, "ForAlighting", "false")
        if not entra:
            _el(spijp, "ForBoarding", "false")
        # O destino da paragem só se escreve onde MUDA: o `stop_headsign` do
        # GTFS vale dessa paragem em diante, e no NeTEx o destino escrito num
        # ponto também vale até ao seguinte que o mude.
        if destino_aqui and destino_aqui != anterior:
            _ref(spijp, "DestinationDisplayRef", destino_de[destino_aqui])
        anterior = destino_aqui or anterior
        # A HORA ESTIMADA, DITA NO PONTO. O NeTEx inteiro tem para isto o
        # `TimingPointStatus` do ponto do padrão (`notTimingPoint`); o perfil
        # tirou-o, e deixou-o só na ScheduledStopPoint — que é de todas as
        # viagens que lá param, e não serve: a mesma paragem tem hora marcada
        # numas viagens e estimada noutras. O que o perfil deixa é uma nota
        # atribuída ao ponto, e é isso que vai — com um código (`PublicCode`)
        # que um programa lê sem ter de interpretar o texto.
        if estado == "notTimingPoint":
            atribuicoes = _el(spijp, "noticeAssignments")
            na = _objeto(
                atribuicoes,
                "NoticeAssignment",
                ident("NoticeAssignment", f"{pid.split(':', 2)[2]}-{ordem}"),
                order="1",
            )
            _ref(na, "NoticeRef", ident("Notice", NOTA_DA_HORA_ESTIMADA))
        if a_pedido:
            _el(spijp, "RequestStop", "true")


def _tipo(quadro: etree._Element, qual: str) -> None:
    _el(quadro, "TypeOfFrameRef", ref=TIPO_DE_QUADRO[qual], versionRef=VERSAO_DO_PERFIL)


def _localizacao(pai: etree._Element, paragem: Linha) -> None:
    loc = _el(pai, "Location")
    _el(loc, "Longitude", _grau(paragem.get("stop_lon")))
    _el(loc, "Latitude", _grau(paragem.get("stop_lat")))


def _centroide(pai: etree._Element, paragem: Linha) -> None:
    _localizacao(_el(pai, "Centroid"), paragem)


def _grau(valor: str | None) -> str:
    # Como vem do GTFS, e não reformatado: o mesmo número nas duas descargas.
    return (valor or "").strip() or "0"


def _descricao(feed: Gtfs, identidade: Identidade, *, estimadas: bool, a_pedido: bool) -> str:
    """Quem fez isto, de quê, e a quem se atribui — dentro do ficheiro.

    A atribuição que o GTFS leva no `attributions.txt` vai também aqui,
    incluindo a do OpenStreetMap quando lá está: a ODbL quer a nota com os
    dados, e um ficheiro levado daqui tem de continuar a dizer de onde veio.
    """
    partes = [
        f"A rede {identidade.nome_da_rede} em NeTEx, no perfil europeu de informação ao "
        "passageiro (EPIP, CEN/TS 16614-4). Construído pelo Paragem.pt a partir do GTFS da "
        "mesma construção, que se descarrega ao lado; não é uma publicação da autoridade de "
        "transportes.",
    ]
    info = next(iter(feed.obter("feed_info.txt")), {})
    if info.get("feed_version"):
        partes.append(f"Versão do GTFS: {info['feed_version']}.")
    atribuicoes = [
        a.get("organization_name", "").strip()
        for a in feed.obter("attributions.txt")
        if a.get("organization_name", "").strip()
    ]
    if atribuicoes:
        partes.append("Atribuição: " + "; ".join(atribuicoes) + ".")
    if identidade.com_openstreetmap:
        partes.append(
            "A parte destes dados que deriva do OpenStreetMap está sob a Open Database License "
            "(ODbL) 1.0: © contribuidores do OpenStreetMap, "
            "https://www.openstreetmap.org/copyright. O resto não tem licença aberta declarada."
        )
    if a_pedido:
        partes.append(
            "As linhas a pedido (FlexibleLine) só andam com reserva: a hora é a que o serviço "
            "faz se alguém o reservar, e a regra de reserva vai em BookingArrangements."
        )
    if estimadas:
        partes.append(
            f"Os pontos com a nota «{NOTA_DA_HORA_ESTIMADA}» têm a hora estimada, como os de "
            "timepoint=0 no GTFS: o horário publicado não a marca."
        )
    return " ".join(partes)


def serializar(raiz: etree._Element) -> bytes:
    etree.indent(raiz, space="  ")
    return etree.tostring(raiz, xml_declaration=True, encoding="UTF-8", pretty_print=True)


def escrever(
    feed: Gtfs,
    destino: Path,
    identidade: Identidade,
    *,
    hoje: date,
) -> Resumo:
    """Escreve `<destino>` — um zip com um XML só, com o mesmo nome.

    Num zip, e não o XML solto, pela razão do GTFS: o XML de uma rede real são
    dezenas de MB de texto que comprimem a um vigésimo, e os Pontos de Acesso
    que aceitam NeTEx aceitam-no assim. O zip é determinista — data fixa, sem
    nada da máquina —, como o do `gtfs.py`.
    """
    raiz, resumo = construir_xml(feed, identidade, hoje=hoje)
    xml = serializar(raiz)
    resumo.bytes_xml = len(xml)
    destino.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        info = zipfile.ZipInfo(f"{destino.stem}.xml", date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, xml)
    return resumo


def ler_xml(caminho: Path) -> bytes:
    """O XML de dentro de um zip escrito por `escrever`, ou o próprio ficheiro."""
    if zipfile.is_zipfile(caminho):
        with zipfile.ZipFile(caminho) as z:
            nomes = [n for n in z.namelist() if n.endswith(".xml")]
            if len(nomes) != 1:
                raise ValueError(f"{caminho} devia ter um XML só, e tem {len(nomes)}")
            return z.read(nomes[0])
    return Path(caminho).read_bytes()


# --- os esquemas ------------------------------------------------------------
#
# FIXADOS POR COMMIT, como o validador de GTFS está fixado por versão: um
# esquema que se atualiza sozinho faz a validação mudar de opinião sem que nada
# aqui tenha mudado. Subir de versão é uma decisão, com o relatório à frente.
#
# NÃO VIVEM NESTE REPOSITÓRIO, e foi decidido. O oficial está sob GPL-3.0 — que
# se juntaria a este sem problema —, mas são 458 ficheiros e 7 MB para um teste;
# o do perfil não declara licença nenhuma, e um ficheiro sem licença declarada
# não se redistribui (é a regra do §4.1, aplicada a nós). Descarregam-se para
# `.cache/netex/`, e os testes que precisam deles saltam com a razão escrita
# quando não estão lá — exceto no CI, que os vai buscar antes
# (`PARAGEM_EXIGIR_ESQUEMAS_NETEX`).
#
# PELO GIT, e não por um zip do GitHub: o git confere o commit pelo próprio
# conteúdo, e um arquivo gerado na hora não tem soma que se possa fixar. Só a
# pasta dos esquemas vem (`--filter=blob:none` + `sparse-checkout`): o
# repositório oficial inteiro, com os exemplos, são centenas de MB.


@dataclass(frozen=True)
class Esquema:
    nome: str
    repositorio: str
    etiqueta: str
    commit: str
    pastas: tuple[str, ...]
    entrada: str
    #: Uma variável de ambiente com o caminho do `.xsd` de entrada, para quem já
    #: o tenha noutro sítio.
    variavel: str
    #: Se um erro contra este esquema BLOQUEIA a construção. Só o oficial.
    normativo: bool

    @property
    def pasta(self) -> str:
        return f"{self.nome.lower().replace(' ', '-')}-{self.commit[:12]}"


#: O esquema oficial, na versão estável (a única que o repositório mantém).
#: O ficheiro também valida na 1.2.3 e na 1.3.2 — conferido à mão, e escrito
#: no `docs/NETEX.md` —; fixa-se esta porque é a que vai continuar a receber
#: correções.
OFICIAL = Esquema(
    nome="NeTEx",
    repositorio="https://github.com/NeTEx-CEN/NeTEx",
    etiqueta="v2.0.0",
    commit="a94e5e1752bcc13aabb8a1f3d018dc08e6978f42",
    pastas=("xsd",),
    entrada="xsd/NeTEx_publication.xsd",
    variavel="NETEX_XSD",
    normativo=True,
)

#: O esquema do perfil. O repositório dele diz, no README, que «já não é
#: mantido pelo subgrupo do NeTEx» e, no próprio XSD, que «não é normativo» e
#: deve usar-se ALÉM do oficial e não em vez dele. É o que se faz: um erro
#: aqui é um aviso. Mas é o único esquema que diz o que o perfil deixa de fora
#: — o oficial aceita o NeTEx inteiro —, e por isso vale a pena perguntar-lhe.
PERFIL_EPIP = Esquema(
    nome="EPIP",
    repositorio="https://github.com/NeTEx-CEN/NeTEx-Profile-EPIP",
    etiqueta="master",
    commit="e5eaf83f15f7fd8db7991a4a8323b6ff7905c13a",
    pastas=(),
    entrada="NeTEx_publication_EPIP.xsd",
    variavel="NETEX_XSD_EPIP",
    normativo=False,
)

ESQUEMAS = (OFICIAL, PERFIL_EPIP)

#: A versão do NeTEx que o ficheiro declara no `PublicationDelivery`: a do
#: esquema oficial contra o qual a construção o valida, e nenhuma outra. O
#: atributo é texto livre e o esquema não o confere — por isso mesmo tem de
#: dizer só o que foi verificado.
#:
#: O mesmo ficheiro valida também na 1.2.3 e na 1.3.2 do esquema oficial
#: (conferido à mão a 1/11/2026, com a região de prova, a de demonstração e uma
#: região real; ver `docs/NETEX.md`), porque só usa o que as três têm em comum.
#: Se o Ponto de Acesso Nacional pedir uma 1.x, muda-se o `OFICIAL` e isto
#: segue-o.
VERSAO_NETEX_ESCRITA = ".".join(OFICIAL.etiqueta.lstrip("v").split(".")[:2])


class EsquemaIndisponivel(Exception):
    pass


def caminho_do_esquema(raiz: Path, esquema: Esquema, *, descarregar: bool = True) -> Path:
    """Onde está o `.xsd` de entrada. Por esta ordem: ambiente, cache, descarregado."""
    do_ambiente = os.environ.get(esquema.variavel)
    if do_ambiente:
        if Path(do_ambiente).is_file():
            return Path(do_ambiente)
        raise EsquemaIndisponivel(f"{esquema.variavel}={do_ambiente} não é um ficheiro")

    pasta = Path(raiz).resolve() / ".cache" / "netex" / esquema.pasta
    entrada = pasta / esquema.entrada
    if entrada.is_file():
        return entrada
    if not descarregar:
        try:
            onde = pasta.relative_to(Path(raiz).resolve())
        except ValueError:
            onde = pasta
        raise EsquemaIndisponivel(
            f"não há o esquema {esquema.nome} {esquema.etiqueta} em {onde} — "
            f"`uv run pipeline netex-esquemas` vai buscá-lo, ou aponta {esquema.variavel} "
            "para o .xsd de entrada."
        )
    _obter(esquema, pasta)
    if not entrada.is_file():
        raise EsquemaIndisponivel(f"o commit {esquema.commit[:12]} não tem {esquema.entrada}")
    return entrada


def _obter(esquema: Esquema, pasta: Path) -> None:
    git = shutil.which("git")
    if not git:
        raise EsquemaIndisponivel("não há git, e é pelo git que os esquemas se descarregam")
    pasta.parent.mkdir(parents=True, exist_ok=True)
    temporaria = Path(tempfile.mkdtemp(prefix=f"{esquema.pasta}-", dir=pasta.parent))

    def correr(*args: str) -> str:
        r = subprocess.run(
            [git, "-C", str(temporaria), *args],
            capture_output=True,
            text=True,
            timeout=600,
            env={**os.environ, "GIT_LFS_SKIP_SMUDGE": "1", "GIT_TERMINAL_PROMPT": "0"},
        )
        if r.returncode != 0:
            raise EsquemaIndisponivel(
                f"git {' '.join(args[:2])} falhou: {(r.stderr or r.stdout).strip()[-400:]}"
            )
        return r.stdout.strip()

    try:
        correr("init", "-q")
        correr("remote", "add", "origin", esquema.repositorio)
        if esquema.pastas:
            correr("sparse-checkout", "set", *esquema.pastas)
        correr("fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", esquema.commit)
        correr("checkout", "-q", "FETCH_HEAD")
        obtido = correr("rev-parse", "HEAD")
        if obtido != esquema.commit:
            raise EsquemaIndisponivel(
                f"pedi o commit {esquema.commit[:12]} e veio {obtido[:12]} — não se valida "
                "contra um esquema que não é o fixado"
            )
        shutil.rmtree(temporaria / ".git")
        if pasta.exists():
            shutil.rmtree(pasta)
        temporaria.rename(pasta)
    except subprocess.TimeoutExpired as e:
        raise EsquemaIndisponivel(f"o git não respondeu em {e.timeout:.0f} s") from e
    finally:
        if temporaria.exists():
            shutil.rmtree(temporaria, ignore_errors=True)


_COMPILADOS: dict[Path, etree.XMLSchema] = {}


def esquema_compilado(caminho: Path) -> etree.XMLSchema:
    """O esquema, compilado uma vez por processo.

    O oficial são 458 ficheiros e leva uns vinte segundos a compilar; uma
    construção com várias regiões compila-o uma vez só.
    """
    caminho = Path(caminho).resolve()
    if caminho not in _COMPILADOS:
        _COMPILADOS[caminho] = etree.XMLSchema(etree.parse(str(caminho)))
    return _COMPILADOS[caminho]


@dataclass
class Validacao:
    esquema: Esquema
    caminho: Path
    erros: list[str]

    @property
    def valido(self) -> bool:
        return not self.erros


def validar(xml: bytes, raiz: Path, esquema: Esquema, *, descarregar: bool = True) -> Validacao:
    """Valida um documento contra um esquema. `EsquemaIndisponivel` se não houver."""
    caminho = caminho_do_esquema(raiz, esquema, descarregar=descarregar)
    xsd = esquema_compilado(caminho)
    # `huge_tree`: o XML de uma rede real passa dos 10 MB de texto, que é o
    # limite por omissão do libxml2 para um nó de texto contínuo em alguns
    # casos — e um ficheiro válido recusado por tamanho é um falso negativo.
    documento = etree.parse(io.BytesIO(xml), etree.XMLParser(huge_tree=True))
    xsd.validate(documento)
    erros = [f"linha {e.line}: {e.message}" for e in xsd.error_log]
    return Validacao(esquema=esquema, caminho=caminho, erros=erros)


def exigir_esquemas() -> bool:
    """No CI os esquemas TÊM de estar: um teste que salta lá não verificou nada."""
    return os.environ.get("PARAGEM_EXIGIR_ESQUEMAS_NETEX", "").strip() not in ("", "0")


def resumo_em_texto(r: Resumo) -> str:
    a_pedido = f" ({r.linhas_a_pedido} a pedido)" if r.linhas_a_pedido else ""
    return (
        f"{r.linhas} linhas{a_pedido} · {r.viagens} viagens · {r.paragens} paragens "
        f"({r.lugares} lugares) · {r.padroes} padrões · {r.passagens} passagens · "
        f"{r.tipos_de_dia} tipos de dia em {r.dias} dias"
    )


def contagens(rotulo: str, r: Resumo) -> dict[str, int]:
    return {
        f"netex.{rotulo}.linhas": r.linhas,
        f"netex.{rotulo}.viagens": r.viagens,
        f"netex.{rotulo}.paragens": r.paragens,
        f"netex.{rotulo}.padroes": r.padroes,
        f"netex.{rotulo}.passagens": r.passagens,
        f"netex.{rotulo}.dias": r.dias,
        f"netex.{rotulo}.bytes_xml": r.bytes_xml,
    }


def feeds_a_exportar(regiao: Any) -> Iterable[Any]:
    """As saídas da receita que viram NeTEx: a rede regular da região.

    O que a autoridade de transportes gere e o sítio já distribui em GTFS — a
    rede regular e o transporte a pedido (`feed-proprio-flex`, que sai em
    `FlexibleLine`) — e nada de terceiros, pela razão do `_dados_abertos`: o
    feed de outra entidade não se redistribui daqui, em formato nenhum.
    """
    for s in regiao.saidas:
        if s.papel in PAPEIS_PROPRIOS and (s.saida or "").endswith(".zip"):
            yield s


#: Os papéis das saídas que viram NeTEx: as redes que a região constrói.
PAPEIS_PROPRIOS = ("horarios", "feed-proprio", "feed-proprio-flex")


def destino_de(construcao: Path, saida: Any) -> Path:
    """`gtfs/rede.zip` → `build/<regiao>/netex/rede.zip`."""
    return Path(construcao) / "netex" / Path(saida.saida).name


def hoje_da_construcao() -> date:
    from .calendario import hoje

    return hoje()
