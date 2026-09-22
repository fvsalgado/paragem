"""`gtfs-filtrado` — um feed grande, recortado às viagens que servem a região.

É o leitor da FlixBus, e serve qualquer feed nacional ou europeu que uma região
queira usar sem arrastar o país inteiro.

A regra que não é óbvia: **guarda-se a viagem inteira, não o troço.** Quem
apanha o expresso em Tomar vai para o Porto, e cortar a viagem na fronteira da
região esconde-lhe o destino. Filtra-se por «que viagens tocam esta região», e
depois leva-se cada uma dessas viagens toda — com as paragens de fora
incluídas, que são precisamente as que interessam a quem embarca cá.
"""

from __future__ import annotations

from ..gtfs import Gtfs
from ..regiao import Saida
from .base import Contexto, Resultado

nome = "gtfs-filtrado"


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    origem = ctx.caminho_da_fonte(saida.fonte)
    feed = Gtfs.ler(origem)
    antes = feed.resumo()

    caixa = ctx.regiao.caixa
    paragens_na_regiao = set()
    for s in feed.stops:
        try:
            lat, lon = float(s.get("stop_lat", "")), float(s.get("stop_lon", ""))
        except ValueError:
            continue
        if caixa.contem(lat, lon):
            paragens_na_regiao.add(s.get("stop_id", ""))

    viagens = {
        st.get("trip_id", "")
        for st in feed.stop_times
        if st.get("stop_id", "") in paragens_na_regiao
    }

    if not viagens:
        ctx.relatorio.lacuna(
            id=f"{saida.fonte}.sem-viagens",
            o_que=f"O feed {saida.fonte} não tem uma única viagem que sirva a região",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml",
            porque_importa=(
                "Ou o operador deixou de servir a região, ou a caixa está errada, ou o feed "
                "mudou de forma. Nenhuma das três se descobre sozinha."
            ),
            o_que_fazer=(
                "Conferir a caixa da região e abrir o feed à procura de uma paragem conhecida."
            ),
        )

    feed.trips.filtrar(lambda t: t.get("trip_id", "") in viagens)
    feed.stop_times.filtrar(lambda st: st.get("trip_id", "") in viagens)

    # A viagem inteira: as paragens que ela serve fora da região ficam.
    paragens_usadas = feed.stop_times.valores("stop_id")
    feed.stops.filtrar(lambda s: s.get("stop_id", "") in paragens_usadas)

    rotas = feed.trips.valores("route_id")
    feed.routes.filtrar(lambda r: r.get("route_id", "") in rotas)

    servicos = feed.trips.valores("service_id")
    for tabela in ("calendar.txt", "calendar_dates.txt"):
        if tabela in feed:
            feed[tabela].filtrar(lambda x: x.get("service_id", "") in servicos)

    formas = {t.get("shape_id", "") for t in feed.trips if t.get("shape_id")}
    if "shapes.txt" in feed:
        feed["shapes.txt"].filtrar(lambda x: x.get("shape_id", "") in formas)

    if "transfers.txt" in feed:
        # Um `transfers.txt` refere paragens, MAS TAMBÉM rotas e viagens
        # (`from_route_id`, `to_trip_id`, …). Filtrar só pelas paragens deixava
        # 415 referências penduradas no ar no feed da FlixBus — e uma
        # referência pendurada é um erro do validador, não um pormenor.
        def inteiro(x: dict[str, str]) -> bool:
            for campo, universo in (
                ("stop_id", paragens_usadas),
                ("route_id", rotas),
                ("trip_id", viagens),
            ):
                for lado in ("from_", "to_"):
                    valor = x.get(lado + campo, "")
                    if valor and valor not in universo:
                        return False
            return True

        feed["transfers.txt"].filtrar(inteiro)
    if "frequencies.txt" in feed:
        feed["frequencies.txt"].filtrar(lambda x: x.get("trip_id", "") in viagens)

    destino = ctx.caminho_de_saida(saida)
    feed.escrever(destino)

    depois = feed.resumo()
    return Resultado(
        contagens={
            f"{saida.fonte}.paragens_na_regiao": len(paragens_na_regiao),
            f"{saida.fonte}.viagens_antes": antes.get("trips.txt", 0),
            f"{saida.fonte}.viagens_depois": depois.get("trips.txt", 0),
            f"{saida.fonte}.paragens_depois": depois.get("stops.txt", 0),
            f"{saida.fonte}.linhas_depois": depois.get("routes.txt", 0),
        },
        saidas={saida.saida or "": str(destino.relative_to(ctx.raiz))},
    )
