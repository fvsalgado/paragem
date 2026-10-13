"""A grelha horária que vai no telemóvel.

O planeador de viagens deixou de correr num servidor e passou a correr no
navegador de quem pergunta, a partir deste ficheiro. O que sai daqui é o
planeador inteiro — se estiver errado, quem o lê vai para a paragem à hora
errada, e não há erro nenhum a assinalá-lo.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from conftest import RAIZ, construcao_de
from paragem.grelha import construir, segundos
from paragem.gtfs import Gtfs
from paragem.regiao import carregar_todas


def _grelhas():
    """(região, grelha) de cada região desta raiz que já foi construída.

    Todas, e nenhuma pelo nome (CLAUDE.md §5.1): a regra vale para qualquer uma.
    """
    achadas = []
    for r in carregar_todas(RAIZ):
        f = construcao_de(r) / "sitio" / "viagens.json"
        if f.exists():
            achadas.append((r, json.loads(f.read_text(encoding="utf-8"))))
    if not achadas:
        pytest.skip("sem grelha construída — corre `uv run pipeline sitio`")
    return achadas


@pytest.fixture(scope="module")
def raiz() -> Path:
    return Path(__file__).resolve().parents[2]


def test_as_horas_leem_se_em_segundos_e_passam_da_meia_noite():
    """O GTFS escreve `25:47:00` para dizer «01:47 do dia seguinte»."""
    assert segundos("00:00:00") == 0
    assert segundos("09:25:30") == 9 * 3600 + 25 * 60 + 30
    # 42:35 existe mesmo no feed dos expressos: uma camioneta que anda a noite
    # toda. Cortá-la às 24 h fazia-a chegar antes de partir.
    assert segundos("42:35:00") == 42 * 3600 + 35 * 60
    assert segundos("") is None
    assert segundos("bananas") is None


def test_os_servicos_sao_numerados_por_ordem_e_nao_por_acaso(raiz):
    """ISTO SAIU DIFERENTE EM DUAS CONSTRUÇÕES SEGUIDAS, e é o defeito que
    este teste existe para impedir.

    Os serviços de cada dia vivem num `set`, e iterar um `set` de texto dá uma
    ordem diferente em cada processo — o Python baralha o `hash` das cadeias
    de propósito. Sem ordenar, as horas e as paragens saíam iguais e os
    ÍNDICES DOS SERVIÇOS saíam trocados: o ficheiro mudava sozinho a cada
    corrida.

    Um ficheiro que muda sozinho estraga a cache do CI e torna qualquer
    diferença ilegível — a mudança a sério fica escondida no meio do ruído.
    """
    for r, d in _grelhas():
        # Os identificadores levam o nome do feed à frente. Dentro de cada
        # feed, a ordem tem de ser a alfabética: é a única que não depende do
        # acaso.
        por_feed: dict[str, list[str]] = {}
        for s in d["servicos"]:
            feed = s.split(":", 1)[0]
            por_feed.setdefault(feed, []).append(s)
        for feed, lista in por_feed.items():
            assert lista == sorted(lista), (
                f"{r.id}: os serviços do feed {feed!r} não estão por ordem — "
                "a numeração depende da ordem de iteração de um set"
            )


def test_um_feed_de_terceiro_entra_so_com_as_viagens_que_tocam_a_regiao(raiz):
    """O feed do operador ferroviário tem o país inteiro. Trazê-lo todo eram 200 kB por nada.

    E a viagem que toca a região entra INTEIRA: quem apanha o comboio numa
    estação da região vai para Lisboa, e cortar a viagem na fronteira era
    esconder-lhe o destino.

    O feed procura-se pela propriedade — uma saída `feed-de-terceiro` de
    comboio, já construída — e as estações «da região» são as que caem na
    caixa dela, e não três nomes escritos aqui.
    """
    vistos = 0
    for r in carregar_todas(RAIZ):
        for saida in r.saidas:
            if saida.papel != "feed-de-terceiro" or saida.modo != "comboio" or not saida.saida:
                continue
            ficheiro = construcao_de(r) / saida.saida
            if not ficheiro.exists():
                continue
            feed = Gtfs.ler(ficheiro)
            c = r.caixa
            dentro = {
                st["stop_id"]
                for st in feed.stops
                if c.lat_min <= float(st["stop_lat"]) <= c.lat_max
                and c.lon_min <= float(st["stop_lon"]) <= c.lon_max
            }
            if not dentro:
                continue
            vistos += 1
            todas = {t["trip_id"] for t in feed.trips}
            g = construir({"cp": feed}, "Europe/Lisbon", {"cp": dentro})
            assert 0 < len(g.viagens) <= len(todas), (
                f"{r.id}: {len(g.viagens)} viagens de {len(todas)} — ou não filtrou, ou filtrou tudo"
            )
            # Nenhuma viagem foi cortada: as que passam fora da caixa
            # continuam a ter as paragens de fora.
            com_paragens_de_fora = {
                h["trip_id"] for h in feed.stop_times if h["stop_id"] not in dentro
            } & {h["trip_id"] for h in feed.stop_times if h["stop_id"] in dentro}
            if com_paragens_de_fora:
                # As paragens da grelha levam o feed à frente («cp:…»).
                fora = sum(
                    1
                    for _, _, horas in g.viagens
                    if any(g.paragens[p][0].split(":", 1)[-1] not in dentro for p in horas[0::3])
                )
                assert fora, f"{r.id}: as viagens foram cortadas à região"
    if not vistos:
        pytest.skip("nenhum feed de comboio de terceiros construído com estações na região")


def test_o_fuso_de_cada_linha_e_o_da_agencia_dela(raiz):
    """Custou 103 minutos ao oráculo: os expressos declaram UTC, a rede Lisboa.

    Ler as horas de um feed pan-europeu como se fossem locais adianta-as uma
    hora no verão — e um planeador adiantado manda alguém correr atrás de um
    autocarro que ainda não chegou.
    """
    for r, d in _grelhas():
        fuso = (r.motor or {}).get("fuso")
        if fuso:
            assert fuso in d["fusos"], f"{r.id}: o fuso da região tem de estar lá"
        # Cada linha aponta para um fuso que existe.
        for linha in d["linhas"]:
            assert 0 <= linha[4] < len(d["fusos"]), f"{r.id}: linha com fuso inválido: {linha}"
