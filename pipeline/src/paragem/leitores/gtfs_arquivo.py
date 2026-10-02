"""`gtfs-arquivo` — um feed GTFS, tal e qual.

É o leitor mais simples que existe e o mais usado: qualquer região que receba
um GTFS de alguém entra por aqui, sem uma linha de código novo. A CP entra
assim. A região de prova entra assim.

**Não reescreve o feed de outra operadora.** Copiar as paragens para os nossos
identificadores, traduzir os nomes ou «arrumar» as rotas produz um feed que
diz ser da CP e não é o que a CP publica — e quando a CP mudar alguma coisa,
ninguém vai conseguir dizer se a diferença veio dela ou de nós. O que sai é o
que entrou, com as contagens registadas.

**A exceção é o calendário de um feed NOSSO, e só quando a receita o pede**
(`params.calendario: regras`). Ver `_calendario_pelas_regras`.
"""

from __future__ import annotations

from datetime import timedelta

from ..calendario import Calendario, hoje
from ..gtfs import Gtfs
from ..regiao import Saida
from .base import Contexto, Resultado

nome = "gtfs-arquivo"

#: Um ano de datas, como os feeds que a casa constrói (`horarios-pdf-operadora`,
#: `a-pedido-flex`): um feed que acabe amanhã ninguém o pode usar, e um que vá a
#: três anos promete o que ninguém decidiu.
JANELA_DIAS = 364


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    origem = ctx.caminho_da_fonte(saida.fonte)
    feed = Gtfs.ler(origem)

    if (saida.params or {}).get("calendario") == "regras":
        _calendario_pelas_regras(ctx, saida, feed)

    res = Resultado(contagens={f"{saida.fonte}.{k}": v for k, v in feed.resumo().items()})

    if saida.saida:
        destino = ctx.caminho_de_saida(saida)
        feed.escrever(destino)
        res.saidas[saida.saida] = str(destino.relative_to(ctx.raiz))

    _paragens_fora_da_caixa(ctx, saida, feed)
    return res


def _calendario_pelas_regras(ctx: Contexto, saida: Saida, feed: Gtfs) -> None:
    """Os dias de cada serviço saem das REGRAS da região, a contar de hoje.

    AS DUAS REGIÕES DE PROVA FICAVAM SEM HORÁRIOS A 1 DE JANEIRO DE 2027. O
    `calendar.txt` delas dizia «de 1/1/2025 a 31/12/2026» — duas datas que
    alguém escreveu num dia e que nenhum dia seguinte mudou —, e a partir daí
    qualquer pergunta ao planeador dava «não temos os horários desse dia», na
    demonstração que se mostra a quem decide e na prova que o CI constrói.
    Ninguém tinha mexido em nada: o calendário envelheceu sozinho.

    Um feed com datas escritas envelhece; um com REGRAS não. Os `service_id`
    destes feeds já eram códigos da região (`A-U`, `A-S`, `E-U`…), e o
    `calendario.yaml` já dizia o que cada código quer dizer — é o mesmo gerador
    que a rede real usa (`Calendario.resolver`). Pedido assim, o feed sai com
    um ano de datas a contar do dia da construção, construa-se quando se
    construir; e os feriados entram certos, ano a ano, em vez de o feed fingir
    que um dia útil é sempre de segunda a sexta.

    Só se faz com a receita a pedi-lo, porque é REESCREVER o calendário de um
    feed: num feed de outra entidade era pôr na boca dela dias que ela não
    disse. Num feed nosso — e numa região inventada, onde a fonte das datas é
    a própria declaração — é a única maneira de não ficar velho.

    Um código que as regras não resolvem não ganha dias inventados: as viagens
    dele saem, e a lacuna diz quais e porquê. Uma viagem sem dia nenhum não é
    uma viagem — é uma linha num ficheiro que o validador recusa.
    """
    inicio = hoje()
    fim = inicio + timedelta(days=JANELA_DIAS)
    cal = Calendario(ctx.regiao.calendario, [c.id for c in ctx.regiao.concelhos])

    datas: list[dict[str, str]] = []
    sem_datas: list[str] = []
    por_confirmar: list[str] = []
    for servico in sorted(feed.trips.valores("service_id") - {""}):
        r = cal.resolver(servico, inicio, fim)
        if not r.datas:
            sem_datas.append(f"{servico}: {'; '.join(r.por_confirmar) or 'nenhum dia na janela'}")
            continue
        if not r.confiavel:
            por_confirmar.append(f"{servico}: {'; '.join(r.por_confirmar)}")
        datas += [
            {"service_id": servico, "date": d.strftime("%Y%m%d"), "exception_type": "1"}
            for d in r.datas
        ]

    # O que o feed trazia escrito sai: as regras substituem-no, não o somam.
    # Deixar o `calendar.txt` era deixar lá as duas datas que envelhecem — e
    # um leitor que o lesse primeiro voltava a ver o calendário de 2026.
    feed.tabelas.pop("calendar.txt", None)
    feed.definir("calendar_dates.txt", ["service_id", "date", "exception_type"], datas)

    if sem_datas:
        caidos = {s.split(":", 1)[0] for s in sem_datas}
        feed.trips.filtrar(lambda t: t.get("service_id", "") not in caidos)
        ficam = feed.trips.valores("trip_id")
        feed.stop_times.filtrar(lambda h: h.get("trip_id", "") in ficam)
        ctx.relatorio.lacuna(
            id=f"{saida.fonte}.servicos-sem-datas",
            o_que="Serviços cujo código as regras do calendário não resolvem",
            onde=f"regioes/{ctx.regiao.id}/calendario.yaml",
            porque_importa=(
                "As viagens destes serviços saíram do feed: sem um único dia em que andem, "
                "não são viagens — e não se lhes inventam dias."
            ),
            o_que_fazer="Declarar o código no calendario.yaml, ou corrigir o service_id no feed.",
            quantos=len(sem_datas),
            quais=sem_datas,
        )
    if por_confirmar:
        ctx.relatorio.lacuna(
            id=f"{saida.fonte}.servicos-por-confirmar",
            o_que="Serviços com dias tirados de regras ainda por confirmar",
            onde=f"regioes/{ctx.regiao.id}/calendario.yaml",
            porque_importa=(
                "Têm dias, e os dias podem não ser os certos — o calendário diz porquê."
            ),
            o_que_fazer="Confirmar as regras com quem publica o calendário.",
            quantos=len(por_confirmar),
            quais=por_confirmar,
        )

    # O `feed_info` diz de quando a quando o feed vale, e tem de dizer o mesmo
    # que as datas: um feed que anuncia acabar em 2026 e corre até 2027 é um
    # feed que se contradiz, e o validador apanha-o. Por isso a validade não
    # se escreve na fonte — escreve-se aqui, com as datas que se geraram.
    if "feed_info.txt" in feed:
        info = feed["feed_info.txt"]
        info.acrescentar_coluna("feed_start_date")
        info.acrescentar_coluna("feed_end_date")
        for linha in info:
            linha["feed_start_date"] = inicio.strftime("%Y%m%d")
            linha["feed_end_date"] = fim.strftime("%Y%m%d")

    ctx.relatorio.contar(f"{saida.fonte}.calendario_desde", inicio.isoformat())
    ctx.relatorio.contar(f"{saida.fonte}.calendario_ate", fim.isoformat())


def _paragens_fora_da_caixa(ctx: Contexto, saida: Saida, feed: Gtfs) -> None:
    """Uma paragem fora da caixa da região é quase sempre uma coordenada trocada.

    Quase sempre, não sempre: um feed de outra operadora cobre o país inteiro e
    é suposto ter paragens em todo o lado. Por isso isto só se verifica quando
    a região declara que o feed é dela (`papel: feed-proprio`), e mesmo aí é
    uma lacuna e não um erro.
    """
    if saida.papel != "feed-proprio":
        return
    caixa = ctx.regiao.caixa_de_recorte
    fora: list[str] = []
    for s in feed.stops:
        try:
            lat, lon = float(s.get("stop_lat", "")), float(s.get("stop_lon", ""))
        except ValueError:
            continue
        if not caixa.contem(lat, lon):
            fora.append(f"{s.get('stop_id', '?')} {s.get('stop_name', '')} ({lat}, {lon})")
    if fora:
        ctx.relatorio.lacuna(
            id=f"{saida.fonte}.paragens-fora-da-caixa",
            o_que="Paragens fora da caixa da região",
            onde=f"{saida.fonte}",
            porque_importa=(
                "Uma coordenada trocada não dá erro nenhum: dá uma paragem no sítio errado, e "
                "manda alguém para o lado errado da estrada."
            ),
            o_que_fazer="Conferir as coordenadas, ou alargar a caixa da região se forem boas.",
            quantos=len(fora),
            quais=fora,
        )
