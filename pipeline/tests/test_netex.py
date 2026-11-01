"""O NeTEx: o mesmo que o GTFS diz, no perfil europeu, e válido contra o esquema.

Três perguntas, e por esta ordem de importância:

1. **diz o mesmo que o GTFS?** As mesmas viagens, pelas mesmas paragens, às
   mesmas horas, nos mesmos dias. Um segundo formato que diverge do primeiro é
   pior do que nenhum — e isto confere-se sem esquema nenhum, com o próprio
   ficheiro;
2. **diz o que não sabe?** Uma hora estimada continua estimada, e o que fica
   de fora fica escrito;
3. **passa no esquema?** O oficial e o do perfil. Os esquemas não vivem neste
   repositório (`netex.py` diz porquê): sem eles, estes testes saltam com a
   razão escrita — exceto no CI, que os vai buscar antes
   (`PARAGEM_EXIGIR_ESQUEMAS_NETEX`), porque um teste que salta lá não
   verificou nada.

Corre com as duas regiões de prova, que são inventadas e constroem-se sem
rede. As contas exatas são delas, que são ficheiros nossos e não mudam.
"""

from __future__ import annotations

import json
import shutil
from collections import defaultdict
from datetime import date
from pathlib import Path

import pytest
from lxml import etree

from conftest import RAIZ, regiao_ou_salta
from paragem import netex, validador
from paragem.construcao import construir
from paragem.grelha import _datas_de_servico
from paragem.gtfs import Gtfs
from paragem.regiao import carregar

N = {"n": netex.NS}
HOJE = date(2026, 11, 1)


def _copiar_repo(destino: Path) -> None:
    for p in ("regioes", "data", "pyproject.toml", "REUSE.toml", "docs"):
        origem = RAIZ / p
        if origem.is_dir():
            shutil.copytree(origem, destino / p)
        else:
            shutil.copy(origem, destino / p)
    (destino / "build").mkdir(exist_ok=True)


def _sem_validador_de_gtfs(mp: pytest.MonkeyPatch) -> None:
    """O validador de GTFS não é o que aqui se testa, e descarrega 40 MB."""

    def recusar(*_a, **_k):
        raise validador.ValidadorIndisponivel("fora destes testes")

    mp.setattr(validador, "validar", recusar)


def _construir(raiz: Path, id_regiao: str, **kw):
    with pytest.MonkeyPatch.context() as mp:
        _sem_validador_de_gtfs(mp)
        for esquema in netex.ESQUEMAS:
            mp.delenv(esquema.variavel, raising=False)
        return construir(raiz, carregar(raiz, id_regiao), descarregar=False, **kw)


@pytest.fixture(scope="module", params=["prova", "prova-municipio"])
def construida(request, tmp_path_factory):
    """Uma região de prova construída numa raiz temporária, com o NeTEx dela."""
    regiao_ou_salta(request.param)
    raiz = tmp_path_factory.mktemp(request.param)
    _copiar_repo(raiz)
    c = _construir(raiz, request.param)
    feed_rel = next(s.saida for s in netex.feeds_a_exportar(c.regiao))
    feed = Gtfs.ler(c.destino / feed_rel)
    alvo = c.destino / "netex" / Path(feed_rel).name
    xml = netex.ler_xml(alvo)
    return {
        "raiz": raiz,
        "construcao": c,
        "feed": feed,
        "alvo": alvo,
        "xml": xml,
        "doc": etree.fromstring(xml),
    }


# --- 1. diz o mesmo que o GTFS ---------------------------------------------


def _por_id(doc) -> dict[str, etree._Element]:
    return {e.get("id"): e for e in doc.iter() if e.get("id")}


def _sufixo(ident: str) -> str:
    return ident.split(":", 2)[2]


def test_as_viagens_sao_as_do_gtfs_paragem_a_paragem(construida):
    """Cada viagem do GTFS está no NeTEx, pelas mesmas paragens, às mesmas horas.

    Reconstrói-se a viagem pelo caminho que um leitor de NeTEx faz — da viagem
    ao padrão, do padrão aos pontos, dos pontos às paragens — e compara-se com
    o `stop_times.txt`, linha a linha.
    """
    feed, doc = construida["feed"], construida["doc"]
    objetos = _por_id(doc)
    horas = defaultdict(list)
    for st in feed.stop_times:
        horas[st["trip_id"]].append(st)

    viagens = doc.findall(".//n:ServiceJourney", N)
    assert {_sufixo(v.get("id")) for v in viagens} == {t["trip_id"] for t in feed.trips}
    for v in viagens:
        tid = _sufixo(v.get("id"))
        padrao = objetos[v.find("n:ServiceJourneyPatternRef", N).get("ref")]
        pontos = {
            p.get("id"): _sufixo(p.find("n:ScheduledStopPointRef", N).get("ref"))
            for p in padrao.findall(".//n:StopPointInJourneyPattern", N)
        }
        lido = []
        for tpt in v.findall(".//n:TimetabledPassingTime", N):
            sid = pontos[tpt.find("n:StopPointInJourneyPatternRef", N).get("ref")]
            lido.append(
                (
                    sid,
                    tpt.findtext("n:ArrivalTime", namespaces=N),
                    tpt.findtext("n:DepartureTime", namespaces=N),
                )
            )
        esperado = [
            (st["stop_id"], st["arrival_time"], st["departure_time"])
            for st in sorted(horas[tid], key=lambda x: int(x["stop_sequence"]))
        ]
        assert lido == esperado, tid


def test_as_linhas_e_as_paragens_sao_as_do_gtfs(construida):
    feed, doc = construida["feed"], construida["doc"]
    linhas = {_sufixo(e.get("id")): e for e in doc.findall(".//n:Line", N)}
    assert set(linhas) == {r["route_id"] for r in feed.routes}
    for r in feed.routes:
        li = linhas[r["route_id"]]
        assert li.findtext("n:PublicCode", namespaces=N) == r["route_short_name"]
        assert li.findtext("n:Name", namespaces=N) == r["route_long_name"]
        assert li.findtext("n:Presentation/n:Colour", namespaces=N) == r["route_color"]
    pontos = {_sufixo(e.get("id")): e for e in doc.findall(".//n:ScheduledStopPoint", N)}
    assert set(pontos) == {s["stop_id"] for s in feed.stop_times}
    for s in feed.stops:
        p = pontos[s["stop_id"]]
        assert p.findtext("n:Name", namespaces=N) == s["stop_name"]
        assert p.findtext("n:Location/n:Latitude", namespaces=N) == s["stop_lat"]
        assert p.findtext("n:Location/n:Longitude", namespaces=N) == s["stop_lon"]
    # E cada ponto está atribuído ao cais que o representa no sítio.
    atribuidos = {
        _sufixo(a.find("n:ScheduledStopPointRef", N).get("ref"))
        for a in doc.findall(".//n:PassengerStopAssignment", N)
    }
    assert atribuidos == set(pontos)


def test_os_dias_sao_os_do_gtfs(construida):
    """Os dias de cada serviço, um a um — e não uma regra que os resuma."""
    feed, doc = construida["feed"], construida["doc"]
    esperado: dict[str, set[str]] = defaultdict(set)
    for data, servicos in _datas_de_servico(feed).items():
        for sid in servicos:
            esperado[sid].add(f"{data[:4]}-{data[4:6]}-{data[6:]}")
    lido: dict[str, set[str]] = defaultdict(set)
    for a in doc.findall(".//n:DayTypeAssignment", N):
        lido[_sufixo(a.find("n:DayTypeRef", N).get("ref"))].add(a.findtext("n:Date", namespaces=N))
    usados = {t["service_id"] for t in feed.trips}
    assert dict(lido) == {sid: d for sid, d in esperado.items() if sid in usados}


def test_cada_referencia_aponta_para_um_objeto_do_ficheiro(construida):
    """Sem o esquema também se sabe isto: nenhuma referência fica pendurada.

    As chaves do NeTEx são pares `id` + `version`, e o esquema oficial só
    confere as referências que levam versão — por isso todas as internas a
    levam. As que apontam para o perfil (`TypeOfFrameRef`) são externas e
    levam `versionRef`.
    """
    doc = construida["doc"]
    definidos: dict[str, set[str]] = defaultdict(set)
    for e in doc.iter():
        if e.get("id"):
            definidos[e.get("id")].add(e.get("version") or "")
    for e in doc.iter():
        if e.get("ref") is None:
            continue
        nome = etree.QName(e).localname
        if nome == "TypeOfFrameRef":
            assert e.get("versionRef") == netex.VERSAO_DO_PERFIL
            continue
        if nome == "DefaultCodespaceRef":
            continue
        assert e.get("version") == netex.VERSAO, nome
        assert e.get("ref") in definidos, f"{nome} → {e.get('ref')}"
        assert netex.VERSAO in definidos[e.get("ref")]
    # E nenhum identificador se repete.
    todos = [
        e.get("id") for e in doc.iter() if e.get("id") and etree.QName(e).localname != "Codespace"
    ]
    assert len(todos) == len(set(todos))


def test_os_quadros_sao_os_do_perfil(construida):
    doc = construida["doc"]
    assert doc.tag == f"{{{netex.NS}}}PublicationDelivery"
    assert doc.get("version") == netex.VERSAO_NETEX_ESCRITA
    composto = doc.find("n:dataObjects/n:CompositeFrame", N)
    assert composto.find("n:TypeOfFrameRef", N).get("ref") == "epip:EU_PI_NETWORK_OFFER"
    quadros = {
        etree.QName(q).localname: q.find("n:TypeOfFrameRef", N).get("ref")
        for q in composto.find("n:frames", N)
    }
    assert quadros == {
        "ResourceFrame": "epip:EU_PI_COMMON",
        "SiteFrame": "epip:EU_PI_STOP",
        "ServiceFrame": "epip:EU_PI_NETWORK",
        "ServiceCalendarFrame": "epip:EU_PI_CALENDAR",
        "TimetableFrame": "epip:EU_PI_TIMETABLE",
    }


def test_a_autoridade_e_a_da_regiao_e_o_ficheiro_diz_quem_o_fez(construida):
    """A autoridade vem do `regiao.yaml`; o ficheiro não fala em nome dela."""
    c, doc = construida["construcao"], construida["doc"]
    autoridade = doc.find(".//n:Authority", N)
    assert autoridade.findtext("n:Name", namespaces=N) == c.regiao.autoridade["nome"]
    descricao = doc.findtext("n:Description", namespaces=N)
    assert "Paragem.pt" in descricao
    assert "não é uma publicação da autoridade de transportes" in descricao


def test_duas_escritas_dao_o_mesmo_ficheiro(construida, tmp_path):
    """Determinista: a mesma rede no mesmo dia dá os mesmos bytes."""
    c, feed = construida["construcao"], construida["feed"]
    ident = netex.identidade_da_regiao(c.regiao, feed)
    a, b = tmp_path / "a" / "x.zip", tmp_path / "b" / "x.zip"
    netex.escrever(feed, a, ident, hoje=HOJE)
    netex.escrever(feed, b, ident, hoje=HOJE)
    assert a.read_bytes() == b.read_bytes()


def test_o_relatorio_conta_o_que_saiu(construida):
    c, doc = construida["construcao"], construida["doc"]
    rotulo = construida["alvo"].stem
    contagens = c.relatorio.contagens
    assert contagens[f"netex.{rotulo}.viagens"] == len(doc.findall(".//n:ServiceJourney", N))
    assert contagens[f"netex.{rotulo}.linhas"] == len(doc.findall(".//n:Line", N))
    assert f"netex/{construida['alvo'].name}" in c.relatorio.saidas


# --- 2. diz o que não sabe -------------------------------------------------


def _feed_pequeno() -> Gtfs:
    """Um feed à medida do que as regiões de prova não têm.

    Uma hora estimada (`timepoint=0`), uma paragem onde não se entra e outra
    onde não se sai, uma a pedido, uma viagem que passa da meia-noite, um
    destino que muda a meio, traçados que não seguem, e uma viagem sem dias.
    """
    g = Gtfs()
    g.definir(
        "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
        [
            {
                "agency_id": "A",
                "agency_name": "Operadora Inventada",
                "agency_url": "https://exemplo.invalid",
                "agency_timezone": "Europe/Lisbon",
                "agency_lang": "pt",
            }
        ],
    )
    g.definir(
        "stops.txt",
        ["stop_id", "stop_name", "stop_lat", "stop_lon", "location_type", "parent_station"],
        [
            {
                "stop_id": "est",
                "stop_name": "Vila (Estação)",
                "stop_lat": "40.0",
                "stop_lon": "-8.0",
                "location_type": "1",
            },
            {
                "stop_id": "est-1",
                "stop_name": "Vila (Estação) cais 1",
                "stop_lat": "40.0001",
                "stop_lon": "-8.0",
                "location_type": "0",
                "parent_station": "est",
            },
            {
                "stop_id": "b",
                "stop_name": "Vila (Escola)",
                "stop_lat": "40.01",
                "stop_lon": "-8.01",
            },
            {"stop_id": "c", "stop_name": "Aldeia", "stop_lat": "40.02", "stop_lon": "-8.02"},
            {"stop_id": "d", "stop_name": "Monte", "stop_lat": "40.03", "stop_lon": "-8.03"},
        ],
    )
    g.definir(
        "routes.txt",
        [
            "route_id",
            "agency_id",
            "route_short_name",
            "route_long_name",
            "route_type",
            "route_color",
        ],
        [
            {
                "route_id": "L1",
                "agency_id": "A",
                "route_short_name": "1",
                "route_long_name": "Vila - Monte",
                "route_type": "3",
                "route_color": "0A5C7A",
            }
        ],
    )
    g.definir(
        "trips.txt",
        ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"],
        [
            {
                "route_id": "L1",
                "service_id": "S",
                "trip_id": "t1",
                "trip_headsign": "Monte",
                "direction_id": "0",
            },
            {
                "route_id": "L1",
                "service_id": "NUNCA",
                "trip_id": "t2",
                "trip_headsign": "Monte",
                "direction_id": "0",
            },
        ],
    )
    st = ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"]
    st += ["pickup_type", "drop_off_type", "timepoint", "stop_headsign"]
    linhas = [
        ("t1", "23:50:00", "23:50:00", "est-1", "1", "0", "1", "1", ""),
        ("t1", "23:58:00", "23:58:00", "b", "2", "0", "0", "0", ""),
        ("t1", "24:05:00", "24:06:00", "c", "3", "3", "0", "1", "Monte (Largo)"),
        ("t1", "24:15:00", "24:15:00", "d", "4", "1", "0", "1", ""),
        ("t2", "08:00:00", "08:00:00", "est-1", "1", "0", "0", "1", ""),
        ("t2", "08:10:00", "08:10:00", "d", "2", "0", "0", "1", ""),
    ]
    g.definir("stop_times.txt", st, [dict(zip(st, x, strict=True)) for x in linhas])
    g.definir(
        "calendar_dates.txt",
        ["service_id", "date", "exception_type"],
        [{"service_id": "S", "date": d, "exception_type": "1"} for d in ("20261102", "20261103")],
    )
    g.definir(
        "shapes.txt",
        ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
        [{"shape_id": "s", "shape_pt_lat": "40", "shape_pt_lon": "-8", "shape_pt_sequence": "1"}],
    )
    return g


IDENTIDADE = netex.Identidade(
    codigo="inventada",
    url="https://inventada.invalid/",
    nome_da_rede="Rede Inventada",
    autoridade={"nome": "Câmara Municipal Inventada", "sigla": "CMI", "url": "https://cmi.invalid"},
)


@pytest.fixture(scope="module")
def pequeno():
    raiz, resumo = netex.construir_xml(_feed_pequeno(), IDENTIDADE, hoje=HOJE)
    return raiz, resumo, netex.serializar(raiz)


def _ponto(raiz, ordem: int):
    return raiz.findall(".//n:StopPointInJourneyPattern", N)[ordem - 1]


def test_a_hora_estimada_continua_estimada(pequeno):
    """`timepoint=0` não passa a hora certa: o ponto leva a nota, e só ele.

    O perfil tirou ao ponto do padrão o `TimingPointStatus` que o NeTEx
    inteiro lhe dá; o que deixa é uma nota atribuída ao ponto, e é essa que
    vai — com um código que se lê sem interpretar o texto.
    """
    raiz, _, _ = pequeno
    nota = raiz.find(".//n:notices/n:Notice", N)
    assert nota.findtext("n:PublicCode", namespaces=N) == netex.NOTA_DA_HORA_ESTIMADA
    com_nota = [
        int(p.get("order"))
        for p in raiz.findall(".//n:StopPointInJourneyPattern", N)
        if p.find("n:noticeAssignments/n:NoticeAssignment/n:NoticeRef", N) is not None
    ]
    assert com_nota == [2]
    ref = _ponto(raiz, 2).find(".//n:NoticeRef", N).get("ref")
    assert ref == nota.get("id")
    # E o ficheiro di-lo à cabeça, para quem o abre sem saber procurar a nota.
    assert netex.NOTA_DA_HORA_ESTIMADA in raiz.findtext("n:Description", namespaces=N)


def test_sem_horas_estimadas_nao_ha_nota(construida):
    """As regiões de prova não têm `timepoint=0`: nem nota, nem frase sobre ela."""
    doc = construida["doc"]
    assert doc.find(".//n:Notice", N) is None
    assert netex.NOTA_DA_HORA_ESTIMADA not in doc.findtext("n:Description", namespaces=N)


def test_entrar_sair_a_pedido_e_o_destino_que_muda(pequeno):
    raiz, _, _ = pequeno
    assert _ponto(raiz, 1).findtext("n:ForAlighting", namespaces=N) == "false"
    assert _ponto(raiz, 1).find("n:ForBoarding", N) is None
    assert _ponto(raiz, 4).findtext("n:ForBoarding", namespaces=N) == "false"
    assert _ponto(raiz, 3).findtext("n:RequestStop", namespaces=N) == "true"
    destinos = {
        d.get("id"): d.findtext("n:FrontText", namespaces=N)
        for d in raiz.findall(".//n:DestinationDisplay", N)
    }
    padrao = raiz.find(".//n:ServiceJourneyPattern", N)
    assert destinos[padrao.find("n:DestinationDisplayRef", N).get("ref")] == "Monte"
    assert destinos[_ponto(raiz, 3).find("n:DestinationDisplayRef", N).get("ref")] == (
        "Monte (Largo)"
    )
    assert _ponto(raiz, 4).find("n:DestinationDisplayRef", N) is None


def test_uma_viagem_sem_destino_nao_cria_um_destino_vazio():
    """Sem `trip_headsign` nem `stop_headsign`, não há DestinationDisplay nenhum."""
    g = _feed_pequeno()
    for t in g.trips:
        t["trip_headsign"] = ""
    for st in g.stop_times:
        st["stop_headsign"] = ""
    raiz, _ = netex.construir_xml(g, IDENTIDADE, hoje=HOJE)
    assert raiz.find(".//n:DestinationDisplay", N) is None
    assert raiz.find(".//n:DestinationDisplayRef", N) is None


def test_a_meia_noite_passa_para_o_dia_seguinte(pequeno):
    """`24:05:00` no GTFS é `00:05:00` com um dia de diferença no NeTEx."""
    raiz, _, _ = pequeno
    passagens = raiz.findall(".//n:TimetabledPassingTime", N)
    assert passagens[0].findtext("n:DepartureTime", namespaces=N) == "23:50:00"
    assert passagens[0].find("n:DepartureDayOffset", N) is None
    assert passagens[2].findtext("n:ArrivalTime", namespaces=N) == "00:05:00"
    assert passagens[2].findtext("n:ArrivalDayOffset", namespaces=N) == "1"
    assert passagens[2].findtext("n:DepartureTime", namespaces=N) == "00:06:00"


def test_a_estacao_e_um_lugar_com_os_seus_cais(pequeno):
    raiz, _, _ = pequeno
    lugares = {_sufixo(s.get("id")): s for s in raiz.findall(".//n:StopPlace", N)}
    assert set(lugares) == {"est", "b", "c", "d"}
    cais = [_sufixo(q.get("id")) for q in lugares["est"].findall(".//n:Quay", N)]
    assert cais == ["est-1"]
    assert lugares["b"].findtext("n:StopPlaceType", namespaces=N) == "onstreetBus"


def test_o_que_fica_de_fora_fica_contado(pequeno):
    """A viagem sem dias não entra; os traçados também não — e os dois contam-se."""
    raiz, resumo, _ = pequeno
    assert [_sufixo(v.get("id")) for v in raiz.findall(".//n:ServiceJourney", N)] == ["t1"]
    assert dict(resumo.viagens_de_fora) == {"sem nenhum dia de serviço": 1}
    assert resumo.tabelas_de_fora == {"shapes.txt": 1}


def test_um_modo_desconhecido_nao_vira_autocarro():
    assert netex.modo_de("3") == "bus"
    assert netex.modo_de("2") == "rail"
    assert netex.modo_de("715") == "bus"
    assert netex.modo_de("109") == "rail"
    assert netex.modo_de("1700") == "other"
    assert netex.modo_de("") == "other"


# --- 3. passa no esquema ---------------------------------------------------


def _esquema_ou_salta(esquema: netex.Esquema) -> Path:
    try:
        return netex.caminho_do_esquema(RAIZ, esquema, descarregar=False)
    except netex.EsquemaIndisponivel as e:
        if netex.exigir_esquemas():
            pytest.fail(f"PARAGEM_EXIGIR_ESQUEMAS_NETEX está ligado e {e}")
        pytest.skip(f"sem o esquema {esquema.nome}: {e}")


@pytest.mark.parametrize("esquema", netex.ESQUEMAS, ids=lambda e: e.nome)
def test_a_regiao_de_prova_passa_no_esquema(construida, esquema):
    _esquema_ou_salta(esquema)
    v = netex.validar(construida["xml"], RAIZ, esquema, descarregar=False)
    assert v.valido, v.erros[:5]


@pytest.mark.parametrize("esquema", netex.ESQUEMAS, ids=lambda e: e.nome)
def test_o_feed_a_medida_passa_no_esquema(pequeno, esquema):
    """As regiões de prova não têm horas estimadas nem paragens a pedido; este tem."""
    _esquema_ou_salta(esquema)
    v = netex.validar(pequeno[2], RAIZ, esquema, descarregar=False)
    assert v.valido, v.erros[:5]


def test_o_esquema_recusa_uma_referencia_pendurada(pequeno):
    """A validação morde: uma referência a um objeto que não existe reprova."""
    _esquema_ou_salta(netex.OFICIAL)
    xml = pequeno[2].replace(
        b'<DayTypeRef ref="inventada:DayType:S"', b'<DayTypeRef ref="inventada:DayType:X"', 1
    )
    assert xml != pequeno[2]
    v = netex.validar(xml, RAIZ, netex.OFICIAL, descarregar=False)
    assert not v.valido


def test_sem_esquema_fica_dito_e_no_ci_bloqueia(tmp_path):
    """Não validar nunca é silêncio: um aviso, e um bloqueio onde se exige."""
    regiao_ou_salta("prova-municipio")
    _copiar_repo(tmp_path)
    tolerante = _construir(tmp_path, "prova-municipio")
    ids = {x.id: x.gravidade for x in tolerante.relatorio.lacunas}
    assert ids["netex.savel-bus.netex.nao-correu"] == "aviso"
    assert ids["netex.savel-bus.epip.nao-correu"] == "aviso"

    exigente = _construir(tmp_path, "prova-municipio", exigir_validador=True)
    ids = {x.id: x.gravidade for x in exigente.relatorio.lacunas}
    assert ids["netex.savel-bus.netex.nao-correu"] == "bloqueia"
    # O do perfil não é normativo: nem no CI bloqueia.
    assert ids["netex.savel-bus.epip.nao-correu"] == "aviso"


def test_um_caminho_de_esquema_que_nao_existe_nao_passa(monkeypatch, tmp_path):
    monkeypatch.setenv(netex.OFICIAL.variavel, str(tmp_path / "nao-existe.xsd"))
    with pytest.raises(netex.EsquemaIndisponivel):
        netex.caminho_do_esquema(tmp_path, netex.OFICIAL, descarregar=False)


# --- nos dados abertos -----------------------------------------------------


@pytest.mark.parametrize("licenca", ["AGPL-3.0-only", "por-confirmar"])
def test_nos_dados_abertos_o_netex_tem_os_termos_do_gtfs(tmp_path, licenca):
    """Os termos do NeTEx são os do GTFS de onde sai, pela mesma `_termos`.

    Com a licença da região de prova dá obra da casa; com uma fonte sem
    licença aberta declarada — o caso de uma autoridade de transportes — dá
    «para consulta». Um formato não muda o que se pode fazer com os dados.
    """
    from paragem import sitio

    regiao_ou_salta("prova")
    _copiar_repo(tmp_path)
    if licenca != "AGPL-3.0-only":
        fontes = tmp_path / "data" / "sources.yaml"
        texto = fontes.read_text(encoding="utf-8")
        inicio = texto.index("id: prova-gtfs-rede-alta")
        fim = texto.index("licenca:", inicio)
        linha = texto[fim : texto.index("\n", fim)]
        fontes.write_text(
            texto[:fim] + f"licenca: {licenca}" + texto[fim + len(linha) :], encoding="utf-8"
        )
    c = _construir(tmp_path, "prova")
    sitio.construir(tmp_path, c.regiao, c.destino)
    descargas = json.loads((c.destino / "sitio" / "dados-abertos.json").read_text())
    por_caminho = {d["caminho"]: d for d in descargas}
    gtfs, nx = por_caminho["gtfs/rede-alta.zip"], por_caminho["netex/rede-alta.zip"]
    assert nx["grupo"] == "netex"
    for campo in ("termos", "licenca", "fonte", "partes_odbl", "atribuicao", "modo"):
        assert nx[campo] == gtfs[campo], campo
    assert nx["termos"] == ("nosso" if licenca == "AGPL-3.0-only" else "consulta")
    assert (c.destino / "sitio" / "descargas" / "netex" / "rede-alta.zip").is_file()
