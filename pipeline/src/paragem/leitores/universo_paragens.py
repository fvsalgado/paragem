"""`universo-de-paragens` — tudo o que pode ser a paragem que um horário nomeia.

Um caderno de horários dá nomes; as coordenadas vêm de outro lado. Este leitor
junta os «outros lados» que a região declarar — as camadas de um portal, as
exportações do registo do regulador, o OpenStreetMap — num só ficheiro, com um
identificador estável por paragem.

A ordem por que as fontes entram é a ordem de AUTORIDADE, e é a receita que a
declara: a primeira que traga um identificador ganha-o. O levantamento de quem
gere a rede antes do registo do regulador, e o registo antes do mapa
colaborativo — não porque o mapa esteja errado, mas porque quem opera sabe
onde pára.

Sai `paragens/universo.json`, que a construção da rede lê e as decisões
manuais nomeiam. É um ficheiro grande e chato de ler, e é para ser: quando uma
decisão parece errada, é aqui que se vê o que havia para escolher.
"""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

from ..paragens import Paragem, Universo
from ..regiao import Saida
from . import osm as leitor_osm
from . import stepp as leitor_stepp
from .base import Contexto, Resultado, verificar_esperado

nome = "universo-de-paragens"


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    universo = Universo()
    contagens: dict[str, Any] = {}

    camadas = saida.params.get("camadas")
    if camadas:
        n = _das_camadas(ctx.destino / camadas, universo)
        contagens["universo.camadas"] = n

    for registo in saida.params.get("registos") or []:
        n = _do_registo(ctx, registo, universo)
        contagens[f"universo.registo.{registo['prefixo']}"] = n

    caminho_osm = saida.params.get("osm")
    if caminho_osm:
        n = _do_osm(ctx.destino / caminho_osm, universo)
        contagens["universo.osm"] = n

    destino = ctx.caminho_de_saida(saida)
    universo.guardar(destino)
    contagens["universo.paragens"] = len(universo)
    for prefixo, quantas in sorted(universo.por_prefixo().items()):
        contagens[f"universo.por_prefixo.{prefixo}"] = quantas
    verificar_esperado(ctx, saida, "paragens", len(universo), saida.params.get("esperado"))
    return Resultado(contagens=contagens, saidas={saida.saida or "": str(destino)})


def _das_camadas(caminho: Path, universo: Universo) -> int:
    dados = json.loads(caminho.read_text(encoding="utf-8"))
    for p in dados.get("paragens", []):
        universo.juntar(
            Paragem(
                id=p["id"],
                nome=p.get("nome", ""),
                lat=p["lat"],
                lon=p["lon"],
                fonte=p.get("fonte", ""),
                codigo=p.get("codigo", ""),
                local=p.get("local", ""),
                concelho=p.get("concelho", ""),
                so_por_decisao_manual=bool(p.get("so_por_decisao_manual")),
            )
        )
    return len(dados.get("paragens", []))


def _do_registo(ctx: Contexto, registo: dict[str, Any], universo: Universo) -> int:
    """As paragens de uma exportação do registo do regulador.

    O identificador leva o código E o ponto: duas exportações dão códigos
    diferentes à mesma paragem, e o código sozinho não distingue duas paragens
    de operadores diferentes no mesmo sítio.
    """
    caminho = ctx.caminho_da_fonte(registo["fonte"])
    if caminho.is_dir():
        caminho = caminho / registo["ficheiro"]
    prefixo = registo["prefixo"]
    n = 0
    for codigo, designacao, lat, lon, local in leitor_stepp.paragens_do_registo(caminho):
        ident = f"st:{prefixo}:{codigo}@{lat:.5f},{lon:.5f}"
        universo.juntar(
            Paragem(
                id=ident,
                nome=html.unescape(designacao).strip(),
                lat=round(lat, 6),
                lon=round(lon, 6),
                fonte=f"stepp:{prefixo}",
                codigo=str(codigo),
                local=local,
            )
        )
        n += 1
    return n


def _do_osm(caminho: Path, universo: Universo) -> int:
    if not caminho.exists():
        return 0
    n = 0
    for nome_paragem, lat, lon in leitor_osm.paragens_com_nome(caminho):
        universo.juntar(
            Paragem(
                id=f"osm:{lat:.6f},{lon:.6f}",
                nome=nome_paragem,
                lat=round(lat, 6),
                lon=round(lon, 6),
                fonte="osm",
            )
        )
        n += 1
    return n
