"""A GRELHA HORÁRIA QUE VAI NO TELEMÓVEL.

O planeador de viagens corria num servidor — um OpenTripPlanner com o grafo de
ruas de 104 MB. Para esta região isso é uma máquina a manter e a pagar para
responder a uma pergunta que **cabe no telemóvel de quem a faz**.

Medido nesta região: 28 461 horas, 903 viagens, 4 634 paragens, e as 159
viagens de comboio que tocam a região. Tudo junto, na forma que sai daqui, são
cerca de 250 kB comprimidos — menos do que os mosaicos do mapa que a página
inicial já descarrega.

**O QUE ISTO NÃO FAZ.** Não sabe ruas. O troço a pé entre um ponto qualquer e a
paragem mais perto passa a ser uma estimativa, e a interface tem de o dizer.
O que NÃO é estimativa são os transbordos entre paragens: esses vêm do OTP, que
deixa de ser servidor e passa a ser ferramenta de construção (ver
`transbordos.py`).

**PORQUE É QUE OS CAMPOS VÃO EM LISTAS E NÃO EM OBJETOS.** Uma viagem com 31
paragens em objetos `{"paragem": …, "chegada": …, "partida": …}` repete os
nomes das chaves 93 vezes. Em listas paralelas o `gzip` do servidor faz o
resto. Medido: 862 kB em bruto, 196 kB comprimido.

**E AS HORAS VÃO EM SEGUNDOS.** Não em minutos: a reconstrução interpola as
paragens intermédias (§6.2) e isso produz segundos a sério — 28 046 das horas
desta rede não caem num minuto redondo. Arredondá-las era inventar um horário
que ninguém publicou. Os segundos contam-se desde a meia-noite do dia de
serviço e passam das 24 h de propósito: há viagens que acabam às 42:35 no feed
dos expressos, e é assim que o GTFS diz «no dia seguinte».
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .gtfs import Gtfs


def segundos(hora: str) -> int | None:
    """`25:47:00` → 92 820. Depois da meia-noite continua a contar."""
    partes = (hora or "").strip().split(":")
    if len(partes) != 3:
        return None
    try:
        h, m, s = (int(p) for p in partes)
    except ValueError:
        return None
    return h * 3600 + m * 60 + s


# Os `route_type` do GTFS traduzidos para os modos que o produto usa.
#
# O `3` NÃO ESTÁ AQUI, e é de propósito. É o código de «autocarro» e é o mais
# usado de todos — a rede regional usa-o, e a FlixBus também. Traduzi-lo aqui
# punha os expressos internacionais a aparecer como carreiras da região, com a
# cor da marca e tudo, quando o §8 manda dar-lhes cartão neutro por serem
# serviço privado.
#
# Quando o tipo é genérico, quem decide é a REGIÃO: cada feed já declara o seu
# `modo` na receita. O tipo específico ganha à declaração, porque um feed que
# diga `modo: autocarro` e traga um elétrico está a descrever a operadora, não
# aquela linha.
MODO_POR_TIPO = {
    "0": "urbano-municipal",  # elétrico
    "1": "metro",
    "2": "comboio",
    "4": "barco",
    "200": "expresso",
    "900": "urbano-municipal",
    "1100": "aviao",
}


@dataclass
class Grelha:
    """O que o navegador recebe. Uma lista por coisa, e os índices a ligá-las."""

    paragens: list[list[Any]] = field(default_factory=list)
    linhas: list[list[Any]] = field(default_factory=list)
    fusos: list[str] = field(default_factory=list)
    viagens: list[list[Any]] = field(default_factory=list)
    servicos: list[str] = field(default_factory=list)
    datas: dict[str, list[int]] = field(default_factory=dict)

    def para_json(self, fuso: str) -> dict[str, Any]:
        return {
            # Os campos vão declarados para que ler isto não obrigue a ler
            # este ficheiro. Custam 200 bytes e poupam uma ida ao código.
            "campos": {
                "paragens": ["id", "lat", "lon", "nome"],
                "linhas": ["codigo", "nome", "cor", "modo", "fuso"],
                "viagens": ["linha", "servico", "horas"],
                "horas": "trios (paragem, chegada, partida), em segundos desde a meia-noite",
            },
            "fuso": fuso,
            # OS FUSOS SÃO POR LINHA, e isto não é preciosismo: custou uma
            # divergência de 103 minutos ao oráculo.
            #
            # O GTFS diz que as horas de uma viagem se leem no fuso da AGÊNCIA
            # dela. O feed da rede e o da CP declaram `Europe/Lisbon`; o dos
            # expressos declara `UTC`, que é uma escolha legítima num feed
            # pan-europeu. Tratar as horas dele como locais adiantava-as uma
            # hora no verão — e um planeador que adianta uma hora manda alguém
            # correr atrás de um autocarro que ainda não chegou, ou perder o
            # que já passou.
            #
            # Não se converte aqui: o desvio muda com o horário de verão, e um
            # serviço que corra de março a novembro teria dois desvios. Guarda-
            # se o fuso de cada linha e converte-se no dia em que se pergunta.
            "fusos": self.fusos,
            "paragens": self.paragens,
            "linhas": self.linhas,
            "viagens": self.viagens,
            "servicos": self.servicos,
            "datas": self.datas,
        }


def _datas_de_servico(feed: Gtfs) -> dict[str, set[str]]:
    """Que serviços correm em que dia, do `calendar.txt` e do `calendar_dates.txt`.

    Os dois contam. O `calendar.txt` dá a regra semanal e o intervalo; o
    `calendar_dates.txt` acrescenta e retira dias soltos — e um feriado
    municipal é exatamente um dia solto. Ler só um deles perde metade do
    calendário, e o pior é que perde em silêncio.
    """
    import datetime as dt

    por_data: dict[str, set[str]] = {}
    dias = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")

    for c in feed.obter("calendar.txt"):
        inicio, fim = c.get("start_date"), c.get("end_date")
        if not inicio or not fim:
            continue
        try:
            d = dt.datetime.strptime(inicio, "%Y%m%d").date()
            ate = dt.datetime.strptime(fim, "%Y%m%d").date()
        except ValueError:
            continue
        while d <= ate:
            if c.get(dias[d.weekday()]) == "1":
                por_data.setdefault(d.strftime("%Y%m%d"), set()).add(c["service_id"])
            d += dt.timedelta(days=1)

    for e in feed.obter("calendar_dates.txt"):
        data, sid = e.get("date"), e.get("service_id")
        if not data or not sid:
            continue
        if e.get("exception_type") == "2":
            por_data.get(data, set()).discard(sid)
        else:
            por_data.setdefault(data, set()).add(sid)
    return por_data


def _fuso_da_linha(
    g: Grelha,
    r: dict[str, Any],
    agencias: dict[str, Any],
    unica: dict[str, Any],
    omissao: str,
) -> int:
    """O índice do fuso desta linha, registando-o se for a primeira vez.

    ESTAVA DEFINIDA DENTRO DO CICLO dos feeds, a apanhar `agencias` e `unica`
    do ciclo. Funcionava — é chamada na mesma volta — e é uma armadilha
    conhecida: basta alguém guardar a função para a usar depois e ela passa a
    ler as agências do ÚLTIMO feed. Recebe tudo por argumento, e deixa de
    poder acontecer.
    """
    a = agencias.get(r.get("agency_id") or "") or unica
    nome = (a.get("agency_timezone") or omissao).strip() or omissao
    if nome not in g.fusos:
        g.fusos.append(nome)
    return g.fusos.index(nome)


def construir(
    feeds: dict[str, Gtfs],
    fuso: str,
    dentro: dict[str, set[str] | None] | None = None,
    modos: dict[str, str] | None = None,
    paragens_partilhadas: dict[str, str] | None = None,
) -> Grelha:
    """Junta os feeds declarados pela região numa só grelha.

    **Os identificadores levam o nome do feed à frente.** Dois feeds de
    operadores diferentes usam `1` como `route_id` sem se conhecerem, e juntá-los
    sem prefixo funde duas linhas que não têm nada a ver uma com a outra — a
    viagem sai com o nome errado e ninguém dá por isso.

    **`dentro` DECIDE O TAMANHO DO FICHEIRO.** Para cada feed, as paragens que
    ficam dentro da região; `None` quer dizer «todas», que é o caso do feed da
    própria rede. Os feeds de terceiros vêm com o país inteiro: o da CP tem
    1 857 viagens e 29 799 horas, e só 159 viagens tocam esta região — 18 kB
    em vez de uns 200.

    A viagem que toca a região entra INTEIRA, e não o troço. Quem apanha o
    comboio em Tomar vai para Lisboa, e cortar a viagem na fronteira era
    esconder-lhe o destino (é o que o §5 já manda fazer aos expressos).

    **`paragens_partilhadas` É A EXCEÇÃO AO PREFIXO, e só para as paragens.**
    Dois operadores que servem o mesmo cais declaram-no cada um com o seu
    código, e prefixar separa-os — o que está certo para as LINHAS e errado
    para o cais: fica um ponto no mapa por operador, cada um com metade dos
    autocarros. Um feed que declare que as suas paragens vivem no espaço de
    nomes de outro passa a partilhar a chave com ele. As linhas continuam
    prefixadas: são mesmo de operadores diferentes.
    """
    dentro = dentro or {}
    modos = modos or {}
    paragens_partilhadas = paragens_partilhadas or {}
    g = Grelha()
    idx_paragem: dict[str, int] = {}
    idx_linha: dict[str, int] = {}
    idx_servico: dict[str, int] = {}
    datas: dict[str, set[int]] = {}

    for nome_feed, feed in feeds.items():
        pref = f"{nome_feed}:"
        pref_paragem = f"{paragens_partilhadas.get(nome_feed, nome_feed)}:"

        for s in feed.stops:
            try:
                lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
            except (KeyError, ValueError):
                continue
            chave = pref_paragem + s["stop_id"]
            if chave in idx_paragem:
                continue
            idx_paragem[chave] = len(g.paragens)
            g.paragens.append(
                [chave, round(lat, 5), round(lon, 5), (s.get("stop_name") or "").strip()]
            )

        # O fuso de cada agência do feed, e o da única agência quando as
        # linhas não dizem a qual pertencem (o GTFS permite omiti-lo quando há
        # uma só).
        agencias = {a.get("agency_id") or "": a for a in feed.obter("agency.txt")}
        unica = next(iter(agencias.values()), {})

        for r in feed.routes:
            chave = pref + r["route_id"]
            if chave in idx_linha:
                continue
            idx_linha[chave] = len(g.linhas)
            cor = (r.get("route_color") or "").strip()
            g.linhas.append(
                [
                    (r.get("route_short_name") or "").strip(),
                    (r.get("route_long_name") or "").strip(),
                    f"#{cor}" if cor else None,
                    MODO_POR_TIPO.get(
                        (r.get("route_type") or "").strip(),
                        modos.get(nome_feed, "autocarro"),
                    ),
                    _fuso_da_linha(g, r, agencias, unica, fuso),
                ]
            )

        # OS SERVIÇOS NUMERAM-SE POR ORDEM ALFABÉTICA, NUMA PASSAGEM À PARTE.
        #
        # Estiveram a ser numerados pela ordem em que apareciam ao percorrer
        # os dias — e os serviços de cada dia vivem num `set`. Iterar um `set`
        # de texto dá uma ordem diferente em cada processo, porque o Python
        # baralha o `hash` das cadeias de propósito. Resultado: o ficheiro
        # saía DIFERENTE a cada construção, com as horas e as paragens iguais
        # e os índices dos serviços trocados.
        #
        # Descobriu-se a comparar duas construções seguidas. Um ficheiro que
        # muda sozinho estraga a cache do CI e torna qualquer diferença
        # ilegível — a mudança a sério fica escondida no meio do ruído. O §4.6
        # pede reprodutibilidade, e reprodutibilidade é isto.
        por_data_feed = _datas_de_servico(feed)
        for sid in sorted({s for sids in por_data_feed.values() for s in sids}):
            chave = pref + sid
            if chave not in idx_servico:
                idx_servico[chave] = len(g.servicos)
                g.servicos.append(chave)
        for data, sids in sorted(por_data_feed.items()):
            for sid in sorted(sids):
                datas.setdefault(data, set()).add(idx_servico[pref + sid])

        linha_de_viagem = {t["trip_id"]: t.get("route_id") for t in feed.trips}
        servico_de_viagem = {t["trip_id"]: t.get("service_id") for t in feed.trips}

        # As viagens que tocam a região, decididas ANTES de ler as horas: ler
        # 29 799 horas para deitar fora 27 083 é trabalho e memória por nada.
        na_regiao = dentro.get(nome_feed)
        if na_regiao is not None:
            tocam: set[str] = set()
            for h in feed.stop_times:
                if h.get("stop_id") in na_regiao:
                    tocam.add(h.get("trip_id", ""))
        else:
            tocam = None  # type: ignore[assignment]

        horas_por_viagem: dict[str, list[tuple[int, int, int, int]]] = {}
        for h in feed.stop_times:
            if tocam is not None and h.get("trip_id") not in tocam:
                continue
            p = idx_paragem.get(pref_paragem + h.get("stop_id", ""))
            if p is None:
                continue
            chega = segundos(h.get("arrival_time", ""))
            parte = segundos(h.get("departure_time", ""))
            # Uma das duas basta: há feeds que só escrevem a partida nas
            # paragens intermédias, e o GTFS permite-o. Se faltarem as duas, a
            # linha não diz nada e não entra.
            if chega is None and parte is None:
                continue
            chegada: int = chega if chega is not None else int(parte or 0)
            partida: int = parte if parte is not None else chegada
            try:
                ordem = int(h.get("stop_sequence") or 0)
            except ValueError:
                ordem = 0
            horas_por_viagem.setdefault(h["trip_id"], []).append((ordem, p, chegada, partida))

        for tid, pontos in horas_por_viagem.items():
            # UMA VIAGEM COM UM PONTO SÓ NÃO É UMA VIAGEM. Entra no ficheiro,
            # ocupa espaço e nunca serve de nada — e no algoritmo é um caso
            # especial a mais para esquecer de tratar.
            if len(pontos) < 2:
                continue
            li = idx_linha.get(pref + (linha_de_viagem.get(tid) or ""))
            si = idx_servico.get(pref + (servico_de_viagem.get(tid) or ""))
            if li is None or si is None:
                continue
            pontos.sort()
            plano: list[int] = []
            for _, p, c, d in pontos:
                plano += [p, c, d]
            g.viagens.append([li, si, plano])

    # Uma paragem que nenhuma viagem serve não faz falta ao planeador: entra na
    # procura pelo `procura.json`, que é outro ficheiro e outra pergunta.
    usadas = {p for v in g.viagens for p in v[2][0::3]}
    if len(usadas) < len(g.paragens):
        remap: dict[int, int] = {}
        novas: list[list[Any]] = []
        for antigo in sorted(usadas):
            remap[antigo] = len(novas)
            novas.append(g.paragens[antigo])
        for v in g.viagens:
            v[2][0::3] = [remap[p] for p in v[2][0::3]]
        g.paragens = novas

    g.datas = {d: sorted(s) for d, s in sorted(datas.items())}
    return g


def escrever(destino: Path, grelha: Grelha, fuso: str) -> int:
    destino.parent.mkdir(parents=True, exist_ok=True)
    texto = json.dumps(grelha.para_json(fuso), ensure_ascii=False, separators=(",", ":"))
    destino.write_text(texto + "\n", encoding="utf-8")
    return len(texto) + 1
