"""`gtfs-arquivo` — um feed GTFS, tal e qual.

É o leitor mais simples que existe e o mais usado: qualquer região que receba
um GTFS de alguém entra por aqui, sem uma linha de código novo. A CP entra
assim. A região de prova entra assim.

**Não reescreve o feed de outra operadora.** Copiar as paragens para os nossos
identificadores, traduzir os nomes ou «arrumar» as rotas produz um feed que
diz ser da CP e não é o que a CP publica — e quando a CP mudar alguma coisa,
ninguém vai conseguir dizer se a diferença veio dela ou de nós. O que sai é o
que entrou, com as contagens registadas.
"""

from __future__ import annotations

from ..gtfs import Gtfs
from ..regiao import Saida
from .base import Contexto, Resultado

nome = "gtfs-arquivo"


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    origem = ctx.caminho_da_fonte(saida.fonte)
    feed = Gtfs.ler(origem)

    res = Resultado(contagens={f"{saida.fonte}.{k}": v for k, v in feed.resumo().items()})

    if saida.saida:
        destino = ctx.caminho_de_saida(saida)
        feed.escrever(destino)
        res.saidas[saida.saida] = str(destino.relative_to(ctx.raiz))

    _paragens_fora_da_caixa(ctx, saida, feed)
    return res


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
