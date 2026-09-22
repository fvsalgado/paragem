"""A Fase 2: o motor responde às viagens que a região exige.

As cinco viagens do CLAUDE.md §9 não estão aqui — estão declaradas em
`regioes/medio-tejo/fontes.yaml`, e estes testes leem-nas. É a mesma regra dos
leitores: uma região nova tem de poder exigir as suas viagens sem que alguém
escreva Python.

**Não passam pelo Docker, de propósito.** O `otp/docker-compose.yml` existe
para quem aloja, mas um teste tem de poder correr onde não há daemon de Docker
— e o ambiente de construção é um desses sítios. Corre-se o mesmo jar, com o
mesmo grafo.

Saltam-se quando não há Java 21, nem jar, nem grafo construído. Um teste que
não pode verificar tem de o dizer em vez de fingir que verificou.
"""

from __future__ import annotations

import collections
import datetime as dt
from pathlib import Path

import pytest

from conftest import regiao_ou_salta
from paragem.gtfs import Gtfs
from paragem.motor import Servidor, disponivel, viajar
from paragem.regiao import carregar

GRAFO = Path("build/medio-tejo/otp/graph.obj")
FEED = Path("build/medio-tejo/gtfs/meio.zip")


@pytest.fixture(scope="session")
def regiao(raiz):
    return regiao_ou_salta("medio-tejo")


@pytest.fixture(scope="session")
def dia_com_servico(raiz) -> str:
    """Um dia em que o feed tem mesmo viagens, escolhido pelos dados.

    Não se crava uma data: 51 dos 68 serviços ainda não têm datas — falta o
    calendário escolar — e uma data escolhida à sorte podia cair num dia sem
    nada e fazer o teste falhar por uma razão que não é a do teste.
    """
    if not (raiz / FEED).exists():
        pytest.skip("sem feed construído")
    feed = Gtfs.ler(raiz / FEED)
    por_servico = collections.Counter(t["service_id"] for t in feed.trips)
    por_dia: collections.Counter[str] = collections.Counter()
    for r in feed["calendar_dates.txt"]:
        if r.get("exception_type") == "1":
            por_dia[r["date"]] += por_servico.get(r["service_id"], 0)

    hoje = dt.date.today().strftime("%Y%m%d")
    futuros = sorted(d for d in por_dia if d >= hoje)
    if not futuros:
        pytest.skip("o feed não tem nenhum dia de serviço a partir de hoje")
    # O melhor dos próximos catorze: um dia útil tem mais serviço do que um
    # domingo, e queremos perguntar ao motor num dia em que há o que responder.
    janela = futuros[:14]
    melhor = max(janela, key=lambda d: por_dia[d])
    return f"{melhor[:4]}-{melhor[4:6]}-{melhor[6:]}"


@pytest.fixture(scope="session")
def servidor(raiz):
    razao = disponivel(raiz)
    if razao:
        pytest.skip(f"sem motor: {razao}")
    if not (raiz / GRAFO).exists():
        pytest.skip(f"sem grafo em {GRAFO} — corre `uv run pipeline grafo --regiao medio-tejo`")
    with Servidor(raiz, raiz / GRAFO.parent) as s:
        yield s


def _viagens(raiz):
    """As viagens declaradas, para o `parametrize` — sem levantar o servidor.

    Aqui NÃO se usa o `regiao_ou_salta`: isto corre na recolha dos testes, e um
    `pytest.skip` fora de um teste salta o módulo inteiro em vez de saltar o
    que depende dele. A região pode não estar nesta raiz — e nesse caso não há
    viagens para parametrizar, o que é uma lista vazia e não um erro.
    """
    try:
        return carregar(raiz, "medio-tejo").motor.get("viagens_de_prova") or []
    except Exception:  # noqa: BLE001 — na recolha de testes, um erro aqui é «não há viagens»
        return []


RAIZ = Path(__file__).resolve().parents[2]
VIAGENS = _viagens(RAIZ)


def test_a_regiao_declara_as_cinco_viagens_do_briefing(regiao):
    """O §9 nomeia cinco. Se alguém apagar uma, isto diz.

    O número deixou de ser exatamente cinco porque acrescentar viagens de
    prova é uma coisa que se quer que aconteça: cada lacuna que se fecha deixa
    aqui a viagem que a provava, e é isso que impede que volte em silêncio. O
    que não pode faltar são as cinco do briefing, e é isso que se verifica.
    """
    nomes = [v["nome"] for v in regiao.motor["viagens_de_prova"]]
    assert len(nomes) >= 5
    for pedaco in ("Fátima", "Torres Novas", "Rossio ao Sul do Tejo", "Sertã", "Ourém"):
        assert any(pedaco in n for n in nomes), f"falta a viagem de {pedaco}"


def test_as_coordenadas_das_viagens_sao_de_paragens_do_feed(raiz, regiao):
    """Um ponto escrito de cabeça põe o motor a partir de onde não está escrito.

    Aconteceu na primeira versão deste ficheiro: três das dez coordenadas
    estavam tiradas de memória e caíam 69, 156 e 239 m fora da paragem que
    diziam ser. A 239 m, o motor parte de outra paragem e responde uma coisa
    sobre outra — sem dar erro nenhum.
    """
    if not (raiz / FEED).exists():
        pytest.skip("sem feed construído")
    from paragem.geo import distancia_km

    # OS FEEDS VÊM DA RECEITA, e não de uma lista escrita aqui. Estavam dois
    # cravados, e no dia em que a região passou a trazer uma concessão vizinha
    # este teste passou a recusar uma coordenada que É de uma paragem — só
    # que de um feed que ele não conhecia. Um teste que recusa o que está
    # certo ensina a desligá-lo.
    paragens = []
    for caminho in (regiao.motor or {}).get("gtfs") or []:
        f = raiz / "build" / "medio-tejo" / caminho
        if f.exists():
            paragens += [
                (float(s["stop_lat"]), float(s["stop_lon"]))
                for s in Gtfs.ler(f).stops
                if s.get("stop_lat")
            ]
    assert paragens, "nenhum feed do motor construído — não há com que comparar"

    for v in regiao.motor["viagens_de_prova"]:
        for lado in ("de", "para"):
            p = v[lado]
            perto = min(distancia_km((p["lat"], p["lon"]), q) for q in paragens)
            assert perto * 1000 < 60, (
                f"{v['nome']} ({lado}): {p['nome']!r} está a {perto * 1000:.0f} m da paragem "
                "mais próxima do feed. As coordenadas vêm do feed, não da memória."
            )


def _servicos_sem_datas(feed: Gtfs) -> set[str]:
    com = {r["service_id"] for r in feed["calendar_dates.txt"] if r.get("exception_type") == "1"}
    return {t["service_id"] for t in feed.trips} - com


def _depende_do_calendario(feed: Gtfs, de: dict, para: dict):
    """Se não há itinerário, isto diz se a culpa é do calendário ou nossa.

    A pergunta é concreta: há alguma viagem no feed que vá do concelho de
    partida ao de chegada? Se houver e TODAS correrem em serviços sem datas, o
    motor não pode propor nada e a culpa é da lacuna `calendario.sem-datas` —
    não do motor nem dos dados geométricos.

    Sem isto, uma viagem que falha por falta de calendário e uma que falha por
    defeito nosso dão exatamente a mesma mensagem, e a segunda passa
    despercebida atrás da primeira.
    """
    import collections

    from paragem.geo import distancia_km

    paragens = [s for s in feed.stops if s.get("stop_lat")]

    def perto(p) -> set[str]:
        """As paragens a menos de 400 m do ponto, ou a mais próxima se nenhuma.

        ERA pelo PREFIXO do identificador — o feed de junho punha o código do
        concelho à frente (`srt_1234`), e isso dava a pergunta de graça. Os
        identificadores do feed próprio não trazem concelho nenhum, e nem
        tinham de trazer: quem responde «é aqui ao lado?» é a distância, não
        uma convenção de nomes de outro ficheiro.
        """
        alvo = (float(p["lat"]), float(p["lon"]))

        def dist(s):
            return distancia_km(alvo, (float(s["stop_lat"]), float(s["stop_lon"])))

        vizinhas = {s["stop_id"] for s in paragens if dist(s) <= 0.4}
        return vizinhas or {min(paragens, key=dist)["stop_id"]}

    pa, pb = perto(de), perto(para)
    if not pa or not pb or pa & pb:
        return [], pa, pb

    seq = collections.defaultdict(list)
    for st in feed.stop_times:
        seq[st["trip_id"]].append((int(st["stop_sequence"]), st["stop_id"]))

    servico = {t["trip_id"]: t["service_id"] for t in feed.trips}
    ligam = []
    for tid, paradas in seq.items():
        ids = [s for _, s in sorted(paradas)]
        a = [i for i, s in enumerate(ids) if s in pa]
        b = [i for i, s in enumerate(ids) if s in pb]
        if a and b and min(a) < max(b):
            ligam.append((tid, servico[tid]))
    return ligam, pa, pb


def _quando_a_ligacao_corre(feed, ligam, pa: set[str], a_partir_de: str):
    """O primeiro dia E A HORA em que uma destas ligações circula.

    Existe por duas coisas que o calendário preenchido destapou de seguida.

    A primeira: a ligação Sertã→Tomar tem UMA viagem, e ela corre em `FE-U` —
    férias escolares. Enquanto nenhum serviço tinha datas isso era invisível;
    com datas, o teste passou a perguntar numa sexta-feira de aulas, em que
    aquela viagem legitimamente não existe.

    A segunda, depois de corrigida a primeira: essa viagem sai da Sertã às
    07:20 e chega a Tomar às 08:55. O teste perguntava às 09:00 — cinco
    minutos DEPOIS de o único autocarro do dia ter chegado. Um motor que não
    encontra um autocarro que já passou está certo.

    A resposta que isto dá — «esta ligação existe uma vez por dia, de manhã, e
    só em férias» — é, por si só, informação que uma autoridade de transportes
    tem interesse em ver.
    """
    servicos = {s for _, s in ligam}
    dias = sorted(
        {
            r["date"]
            for r in feed["calendar_dates.txt"]
            if r.get("exception_type") == "1"
            and r["service_id"] in servicos
            and r["date"] >= a_partir_de
        }
    )
    if not dias:
        return None, None
    dia = dias[0]
    ativos = {s for _, s in ligam if s in servicos}

    # A hora de partida mais cedo, no lado de origem, entre as viagens que
    # correm nesse dia. Pergunta-se meia hora antes — apanha-a sem fingir que
    # alguém está na paragem à hora exata.
    partidas = []
    for tid, sid in ligam:
        if sid not in ativos:
            continue
        for st in feed.stop_times:
            if st["trip_id"] == tid and st["stop_id"] in pa:
                partidas.append(st["departure_time"])
    if not partidas:
        return dia, None
    h, m, _ = min(partidas).split(":")
    minutos = max(0, int(h) * 60 + int(m) - 30)
    return dia, f"{minutos // 60:02d}:{minutos % 60:02d}"


def _dia_em_que_a_ligacao_corre(feed, servicos: list[str], a_partir_de: str) -> str | None:
    """O primeiro dia, daqui a um ano, em que uma destas ligações circula.

    Existe por uma coisa que o calendário destapou. A ligação Sertã→Tomar tem
    UMA viagem, e ela corre em `FE-U` — férias escolares, dias úteis. Enquanto
    nenhum serviço tinha datas, isso era invisível; com datas, o teste passou a
    perguntar numa sexta-feira de período escolar, em que aquela viagem
    legitimamente não existe.

    Perguntar num dia em que não há serviço e concluir que o motor está mal é o
    erro que este ajudante evita. E a resposta que ele dá — «esta ligação só
    existe em férias» — é, por si só, informação que a autoridade de
    transportes tem interesse em ver.
    """
    alvo = set(servicos)
    dias = sorted(
        {
            r["date"]
            for r in feed["calendar_dates.txt"]
            if r.get("exception_type") == "1"
            and r["service_id"] in alvo
            and r["date"] >= a_partir_de
        }
    )
    return dias[0] if dias else None


@pytest.mark.parametrize("viagem", VIAGENS, ids=[v["nome"] for v in VIAGENS])
def test_a_viagem_devolve_itinerario_plausivel(raiz, servidor, dia_com_servico, viagem):
    """Plausível, e não «existe»: um itinerário todo a pé também é um itinerário.

    O que se exige: que haja pelo menos um itinerário, que use transporte
    público, que não demore um dia, e que a linha que usa exista mesmo.
    """
    dia = dia_com_servico
    itinerarios = viajar(servidor, viagem["de"], viagem["para"], dia, "09:00")

    # SEM CAMINHO NÃO É O MESMO QUE SEM SERVIÇO NESSE DIA.
    #
    # O dia partilhado é o de mais serviço da rede — um dia útil de período
    # escolar. Nem todas as ligações correm nesse dia: a Sertã→Tomar tem UMA
    # viagem e ela é de FÉRIAS escolares. Perguntar-lhe numa sexta-feira de
    # aulas e chamar-lhe defeito era culpar o motor do horário.
    #
    # Tenta-se o dia partilhado primeiro, de propósito: quem já responde não
    # muda de dia, e só quem não responde é que ganha uma segunda pergunta.
    feed = Gtfs.ler(raiz / FEED)
    ligam, pa, pb = _depende_do_calendario(feed, viagem["de"], viagem["para"])
    if not itinerarios and ligam:
        outro, hora = _quando_a_ligacao_corre(feed, ligam, pa, dia.replace("-", ""))
        if outro:
            dia = f"{outro[:4]}-{outro[4:6]}-{outro[6:]}"
            itinerarios = viajar(servidor, viagem["de"], viagem["para"], dia, hora or "09:00")

    if not itinerarios:
        # Antes de falhar, perguntar porquê. Uma ligação sem uma única data é
        # uma lacuna conhecida; uma com datas que mesmo assim não dá caminho é
        # defeito nosso, e tratá-las igual esconde a segunda.
        sem_datas = _servicos_sem_datas(feed)
        if ligam and {s for _, s in ligam} <= sem_datas:
            pytest.xfail(
                f"{viagem['nome']}: as {len(ligam)} viagens que ligam {pa}→{pb} correm "
                "todas em serviços SEM DATAS (lacuna `calendario.sem-datas`)."
            )
        pytest.fail(
            f"{viagem['nome']}: sem itinerário a {dia} às 09:00, e NÃO é do "
            "calendário — há viagens com datas a ligar estes dois sítios. É defeito nosso."
        )

    com_transporte = [i for i in itinerarios if i.linhas]
    assert com_transporte, f"{viagem['nome']}: todos os itinerários são a pé"

    melhor = min(com_transporte, key=lambda i: i.segundos)
    assert 1 <= melhor.minutos <= 240, f"{viagem['nome']}: {melhor.minutos} min não é plausível"
    assert melhor.metros_a_pe < 8000, (
        f"{viagem['nome']}: {melhor.metros_a_pe:.0f} m a pé é de mais para uma viagem de "
        "transporte público"
    )


def test_a_janela_de_procura_cobre_um_dia_de_servico(raiz, servidor, dia_com_servico):
    """Numa rede rural, perguntar «há viagem já a seguir» é perguntar mal.

    Torres Novas → Entroncamento, às 09:00. Medido duas vezes, e a segunda
    medição corrige a primeira — vale a pena guardar as duas:

        janela        antes do calendário     com o calendário
        50 min (OTP)        0 itinerários          1 itinerário
        2 h                 1                      2
        4 h                 2                      4
        8 h                 5                      5
        12 h                5                      5

    O «ZERO» da primeira coluna era, em boa parte, o calendário em falta: só os
    serviços anuais tinham datas, e as partidas do dia eram muito menos. Com o
    calendário preenchido, a janela de cinquenta minutos já encontra caminho.

    O argumento fica mais fraco e continua a ganhar: mostrar UMA opção onde há
    CINCO é esconder quatro, e numa rede em que o autocarro seguinte pode ser
    daqui a três horas a opção escondida é a que serve. Uma janela de cidade
    responde bem onde o próximo vem aí; aqui não vem.
    """
    from paragem.motor import JANELA_SEGUNDOS

    assert JANELA_SEGUNDOS >= 8 * 3600, "a janela tem de cobrir um dia de serviço"

    tnv = {"lat": 39.477905, "lon": -8.536428}
    ent = {"lat": 39.46171, "lon": -8.473885}

    curta = viajar(servidor, tnv, ent, dia_com_servico, "09:00", janela=3000)
    larga = viajar(servidor, tnv, ent, dia_com_servico, "09:00")

    assert len(larga) >= 2, "com a janela do dia inteiro tem de haver mais do que um caminho"
    assert len(larga) >= 2 * len(curta) or len(curta) == 0, (
        f"a janela larga devolveu {len(larga)} e a do OTP {len(curta)}. Se a diferença "
        "desaparecer, a janela de doze horas deixou de se justificar e o comentário que a "
        "defende passou a mentir — vale a pena medir outra vez antes de a manter."
    )


def test_a_hora_da_pergunta_nao_decide_a_resposta(servidor, dia_com_servico):
    """Com a janela do dia, perguntar às 06:00 ou às 15:00 dá o mesmo.

    É o que distingue «há ligação entre estes dois sítios» de «apanho já o
    próximo». A primeira é a pergunta de quem planeia; a segunda é a de quem
    está na paragem, e essa é uma funcionalidade do site, não do motor.
    """
    tnv = {"lat": 39.477905, "lon": -8.536428}
    ent = {"lat": 39.46171, "lon": -8.473885}
    for hora in ("06:00", "09:00", "15:00"):
        assert viajar(servidor, tnv, ent, dia_com_servico, hora), f"sem caminho às {hora}"


def test_o_docker_compose_usa_a_versao_que_o_codigo_fixa(raiz):
    """Duas versões fixadas em dois sítios divergem no dia em que uma sobe.

    O `compose` é o que aloja; o `motor.py` é o que os testes correm. Se forem
    versões diferentes, os testes passam a provar uma coisa sobre um motor que
    ninguém põe em produção.
    """
    from paragem import motor

    compose = (raiz / "otp" / "docker-compose.yml").read_text(encoding="utf-8")
    assert f"opentripplanner:{motor.VERSAO}" in compose, (
        f"o compose não usa a versão {motor.VERSAO} que o motor.py fixa"
    )
