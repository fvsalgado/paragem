"""`horarios-pdf-operadora` — o caderno de horários de uma operadora, em GTFS.

É o ÚNICO leitor específico de uma fonte, e está assim por não haver
alternativa. O caso que o obrigou a existir: os horários em vigor de uma rede
só existem num PDF de 129 páginas.

**Porque é que isto é específico e não genérico.** Um caderno de horários não
tem formato: tem uma maquetagem. As colunas alinham-se por posição na página,
há células em branco que não são «não para», há paragens com chegada e partida
em linhas separadas, e há linhas que atravessam várias páginas. Cada operadora
desenha o seu à sua maneira.

O trabalho reparte-se por módulos que se testam sozinhos, e este liga-os:

    pdf_horarios.py   lê o papel: páginas, blocos, colunas, paragens
    alinhamento.py    que viagem do levantamento é esta viagem do papel
    resolucao.py      que paragem é cada nome, por regras e por decisão manual
    intermedias.py    as paragens que o papel não escreve
    tracados.py       por onde o autocarro passa entre elas
    isto              escreve o GTFS

## O que este feed é, e o que não é

É a rede como o papel a descreve, situada no território pelos levantamentos
públicos. **As horas são as do papel**; as paragens intermédias entram sem
hora, com `timepoint=0`, porque interpolar e escrever uma hora certinha seria
apresentar uma estimativa como um facto.

O `feed_info` é NOSSO: quem lê o feed tem de saber a quem se queixa. A
**agência** é a operadora, que é quem põe os autocarros na estrada.
"""

from __future__ import annotations

import collections
import csv
import json
import subprocess
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml

from ..alinhamento import alinhar
from ..calendario import Calendario
from ..gtfs import Gtfs, id_seguro
from ..intermedias import Parametros as ParametrosDasIntermedias
from ..intermedias import ViagemCompleta, preencher
from ..nomes import limpo, titulo
from ..paragens import Universo
from ..regiao import Saida
from ..relatorio import BLOQUEIA
from ..resolucao import Parametros as ParametrosDaResolucao
from ..resolucao import Resolucao, resolver
from ..tracados import Parametros as ParametrosDosTracados
from ..tracados import Tracado, desenhar, ler_rede, numerar
from . import pdf_horarios as pdf
from .base import Contexto, Resultado

nome = "horarios-pdf-operadora"

JANELA_DIAS = 364


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    caminho = ctx.caminho_da_fonte(saida.fonte)
    doc = pdf.ler(_pdftotext(caminho))
    viagens = pdf.viagens(doc)
    _conferir_legenda(ctx, doc)

    camadas = _ler_camadas(ctx, saida)
    universo = Universo.ler(ctx.destino / saida.params["universo"])
    manual = _tabela_manual(ctx, saida)

    alinhamentos = alinhar(
        viagens,
        camadas["sequencias"],
        {ident: p.nome for ident, p in universo.paragens.items()},
        sentidos=saida.params.get("sentidos"),
    )
    resolucao = resolver(
        viagens,
        alinhamentos,
        universo,
        manual,
        ParametrosDaResolucao(**(saida.params.get("resolucao") or {})),
    )
    completas, segmentos = preencher(
        viagens,
        alinhamentos,
        resolucao,
        camadas["sequencias"],
        ParametrosDasIntermedias(**(saida.params.get("intermedias") or {})),
    )
    tracados = _tracar(ctx, saida, completas, camadas)
    formas, forma_de = numerar(tracados)

    feed, contagens, lacunas = _escrever(ctx, doc, completas, resolucao, camadas, formas, forma_de)
    destino = ctx.caminho_de_saida(saida)
    feed.escrever(destino)

    _escrever_decisoes(ctx, resolucao, completas, segmentos, tracados, forma_de)
    contagens.update(
        {
            "meio.pares_linha_nome": len(resolucao.decisoes),
            "meio.pares_resolvidos": len(resolucao.resolvidas),
            "meio.pares_sem_coordenada": len(resolucao.sem_coordenada),
            "meio.viagens_alinhadas": sum(1 for c in completas if c.alinhada),
            "meio.intermedias": sum(c.intermedias for c in completas),
            "meio.tracados": len(formas),
            "meio.tracados_da_camada": sum(1 for t in tracados.values() if t.metodo == "camada"),
            "meio.tracados_encaminhados": sum(
                1 for t in tracados.values() if t.metodo == "encaminhamento"
            ),
        }
    )
    for lac in lacunas:
        ctx.relatorio.lacunas.append(lac)
    return Resultado(
        contagens=contagens,
        saidas={saida.saida or "": str(destino.relative_to(ctx.raiz))},
        notas=[f"{doc.em_vigor_desde}"] if doc.em_vigor_desde else [],
    )


# --- as peças que a receita nomeia ----------------------------------------


def _ler_camadas(ctx: Contexto, saida: Saida) -> dict[str, Any]:
    caminho = ctx.destino / saida.params["camadas"]
    if not caminho.exists():
        raise ValueError(
            f"{nome}: `camadas: {saida.params['camadas']}` ainda não existe em {ctx.destino}. "
            "A saída que a produz tem de vir antes desta na receita."
        )
    return json.loads(caminho.read_text(encoding="utf-8"))


def _tabela_manual(ctx: Contexto, saida: Saida) -> list[dict[str, Any]]:
    """As decisões tomadas à mão, se a região as tiver.

    Não existir não é erro — é o estado de uma região que ainda não precisou
    delas. O que é erro é existirem e apontarem para coisas que já não estão
    lá, e disso trata a validação em `resolucao.py`.
    """
    declarado = saida.params.get("decisoes")
    if not declarado:
        return []
    caminho = ctx.caminho_de_dados(declarado)
    if not caminho.exists():
        return []
    return yaml.safe_load(caminho.read_text(encoding="utf-8")) or []


def _tracar(
    ctx: Contexto, saida: Saida, completas: list[ViagemCompleta], camadas: dict[str, Any]
) -> dict[int, Tracado]:
    params = dict(saida.params.get("tracados") or {})
    caminho_osm = params.pop("osm", None)
    caixa = params.pop("caixa", None)
    grafo = None
    if caminho_osm:
        ficheiro = ctx.destino / caminho_osm
        if ficheiro.exists():
            meio = (ctx.regiao.caixa.lat_min + ctx.regiao.caixa.lat_max) / 2
            grafo = ler_rede(ficheiro, caixa, meio)
            ctx.relatorio.contar("rede_viaria.nos", len(grafo))
            ctx.relatorio.contar("rede_viaria.arcos", grafo.arcos)
        else:
            ctx.relatorio.aviso(
                id="tracados.sem-rede-viaria",
                o_que="O recorte do OpenStreetMap não está construído",
                onde=f"{ctx.destino}/{caminho_osm}",
                porque_importa=(
                    "Sem rede viária, as viagens que o levantamento não cobre ficam sem "
                    "traçado — e uma viagem sem traçado desenha-se em linha reta, por cima "
                    "do que estiver pelo caminho."
                ),
                o_que_fazer="Construir a saída do recorte antes desta.",
            )
    do_levantamento = {x["viagem"]: x["pontos"] for x in camadas.get("tracados", [])}
    return desenhar(completas, do_levantamento, grafo, ParametrosDosTracados(**params))


# --- escrever o feed -------------------------------------------------------


def _segundos(hora: str) -> int:
    partes = (str(hora or "").split(":") + ["0", "0"])[:3]
    if not partes[0].strip().isdigit():
        return 0
    return int(partes[0]) * 3600 + int(partes[1]) * 60 + int(partes[2] or 0)


def _hms(x: int) -> str:
    return f"{x // 3600:02d}:{(x % 3600) // 60:02d}:{x % 60:02d}"


def _depois_da_meia_noite(completas: list[ViagemCompleta]) -> dict[int, int]:
    """As viagens que partem depois da meia-noite pertencem ao dia anterior.

    Na mesma coluna do mesmo bloco, uma viagem que parte às 00:20 a seguir a
    uma que chega às 23:50 é a continuação do mesmo dia de serviço. O GTFS
    escreve-a «24:20:00» — e quem a escrever «00:20:00» põe o autocarro a
    circular vinte e quatro horas antes.
    """
    por_coluna: dict[tuple[str, int, int], list[ViagemCompleta]] = collections.defaultdict(list)
    for c in completas:
        por_coluna[(c.viagem.linha, c.viagem.pagina, c.viagem.coluna)].append(c)
    deslocadas: dict[int, int] = {}
    for lista in por_coluna.values():
        lista.sort(key=lambda c: c.indice)
        for a, b in zip(lista, lista[1:], strict=False):
            if not a.pontos or not b.pontos:
                continue
            if (
                _segundos(b.pontos[0].partida) < 4 * 3600
                and _segundos(a.pontos[-1].chegada) >= 22 * 3600
                and a.viagem.servico == b.viagem.servico
            ):
                deslocadas[b.indice] = 24 * 3600
    return deslocadas


def _escrever(
    ctx: Contexto,
    doc: pdf.Documento,
    completas: list[ViagemCompleta],
    resolucao: Resolucao,
    camadas: dict[str, Any],
    formas: dict[str, list[list[float]]],
    forma_de: dict[int, str],
) -> tuple[Gtfs, dict[str, Any], list[Any]]:
    hoje = date.today()
    fim = hoje + timedelta(days=JANELA_DIAS)
    feed = Gtfs()

    # --- paragens: o nome que o papel lhes dá ----------------------------
    nomes_do_papel: dict[str, collections.Counter[str]] = collections.defaultdict(
        collections.Counter
    )
    for decisao in resolucao.resolvidas:
        if decisao.id:
            nomes_do_papel[decisao.id][decisao.nome] += 1

    paragens: dict[str, dict[str, str]] = {}

    def paragem(ident: str) -> str:
        if ident in paragens:
            return paragens[ident]["stop_id"]
        p = resolucao.universo[ident]
        escolhido = nomes_do_papel.get(ident)
        paragens[ident] = {
            "stop_id": id_seguro(ident),
            "stop_code": p.codigo,
            "stop_name": limpo(escolhido.most_common(1)[0][0] if escolhido else titulo(p.nome)),
            "stop_lat": f"{p.lat:.6f}",
            "stop_lon": f"{p.lon:.6f}",
            "location_type": "0",
        }
        return paragens[ident]["stop_id"]

    # --- viagens e horários ----------------------------------------------
    deslocadas = _depois_da_meia_noite(completas)
    viagens_gtfs: list[dict[str, str]] = []
    horarios: list[dict[str, str]] = []
    servicos: set[str] = set()
    contador: collections.Counter[str] = collections.Counter()
    fundidas = 0

    for completa in completas:
        if len(completa.pontos) < 2:
            continue
        v = completa.viagem
        contador[v.linha] += 1
        trip_id = f"{v.linha}-{contador[v.linha]:03d}-{v.servico}"
        servicos.add(v.servico)
        viagens_gtfs.append(
            {
                "route_id": v.linha,
                "service_id": v.servico,
                "trip_id": trip_id,
                "trip_headsign": completa.pontos[-1].nome,
                "direction_id": {"ida": "0", "volta": "1"}.get(v.sentido or "", ""),
                "shape_id": forma_de.get(completa.indice, ""),
            }
        )
        atraso = deslocadas.get(completa.indice, 0)
        sequencia = 0
        anterior: int | None = None
        for ponto in completa.pontos:
            sequencia += 1
            stop_id = paragem(ponto.id)
            if ponto.origem == "pdf":
                chegada = _segundos(ponto.chegada or ponto.partida) + atraso
                partida = _segundos(ponto.partida or ponto.chegada) + atraso
                if anterior is not None and chegada < anterior:
                    chegada = partida = anterior
                anterior = max(chegada, partida)
                valores = (_hms(chegada), _hms(partida), "1")
            else:
                # A ESTIMATIVA ESCREVE-SE, E DIZ-SE QUE É ESTIMATIVA.
                #
                # O GTFS tem um campo para isto — `timepoint=0` quer dizer «a
                # hora é aproximada» — e deixar a célula vazia não poupa
                # ninguém a uma estimativa: obriga cada leitor a fazer a sua,
                # cada um à sua maneira e nenhum a dizê-lo. 755 das 1 931
                # paragens desta rede só aparecem em pontos sem hora marcada;
                # com a célula vazia, a folha delas não tinha uma única
                # partida para mostrar.
                #
                # E a nossa estimativa é melhor do que a de quem só tem o
                # ficheiro: sai da cadência do levantamento entre as duas
                # paragens com hora, e não de dividir o tempo em partes
                # iguais. A interface marca-a — «hora estimada» —, que é a
                # diferença entre estimar e fingir.
                estimada = _segundos(ponto.tempo_estimado) + atraso
                if anterior is not None and estimada < anterior:
                    estimada = anterior
                anterior = estimada
                valores = (_hms(estimada), _hms(estimada), "0")
            if (
                horarios
                and horarios[-1]["trip_id"] == trip_id
                and horarios[-1]["stop_id"] == stop_id
            ):
                # A mesma paragem duas vezes seguidas: é a chegada e a partida
                # que o papel escreve em linhas separadas, e no feed são um
                # registo só.
                if valores[1]:
                    horarios[-1]["departure_time"] = valores[1]
                    horarios[-1]["timepoint"] = "1"
                if not horarios[-1]["arrival_time"] and valores[0]:
                    horarios[-1]["arrival_time"] = valores[0]
                sequencia -= 1
                fundidas += 1
                continue
            horarios.append(
                {
                    "trip_id": trip_id,
                    "arrival_time": valores[0],
                    "departure_time": valores[1],
                    "stop_id": stop_id,
                    "stop_sequence": str(sequencia),
                    "pickup_type": "0",
                    "drop_off_type": "0",
                    "timepoint": valores[2],
                }
            )

    # --- linhas, com a cor que o levantamento lhes dá --------------------
    cores = {}
    for t in camadas.get("tracados", []):
        if t.get("linha") and t.get("cor"):
            cores[t["linha"]] = t["cor"]
    rotas: list[dict[str, str]] = []
    sem_cor: list[str] = []
    usadas = {v["route_id"] for v in viagens_gtfs}
    for codigo, lin in sorted(doc.linhas.items(), key=lambda kv: _ordem(kv[0])):
        if codigo not in usadas:
            continue
        cor = (cores.get(codigo) or "").upper()
        if not cor:
            sem_cor.append(f"{codigo} {lin.nome}")
        rotas.append(
            {
                "route_id": codigo,
                "agency_id": "1",
                "route_short_name": codigo,
                "route_long_name": lin.nome,
                "route_type": "3",
                "route_color": cor,
                "route_text_color": _cor_do_texto(cor) if cor else "",
            }
        )

    # --- calendário -------------------------------------------------------
    cal = Calendario(ctx.regiao.calendario, [c.id for c in ctx.regiao.concelhos])
    datas: list[dict[str, str]] = []
    por_confirmar: list[str] = []
    sem_datas: list[str] = []
    for servico in sorted(servicos):
        res = cal.resolver(servico, hoje, fim)
        if not res.datas:
            sem_datas.append(f"{servico}: {'; '.join(res.por_confirmar)}")
        elif not res.confiavel:
            por_confirmar.append(f"{servico}: {'; '.join(res.por_confirmar)}")
        for dia in res.datas:
            datas.append(
                {"service_id": servico, "date": dia.strftime("%Y%m%d"), "exception_type": "1"}
            )
    if sem_datas:
        # Uma viagem sem dia nenhum não é uma viagem: é uma linha num ficheiro
        # que o validador recusa. Sai, e a lacuna diz quantas e porquê.
        caidos = {s.split(":", 1)[0] for s in sem_datas}
        viagens_gtfs = [v for v in viagens_gtfs if v["service_id"] not in caidos]
        ficam = {v["trip_id"] for v in viagens_gtfs}
        horarios = [h for h in horarios if h["trip_id"] in ficam]

    # --- traçados ---------------------------------------------------------
    pontos_de_forma: list[dict[str, str]] = []
    usadas_formas = {v["shape_id"] for v in viagens_gtfs if v["shape_id"]}
    for ident in sorted(usadas_formas):
        for i, (lat, lon) in enumerate(formas[ident], start=1):
            pontos_de_forma.append(
                {
                    "shape_id": ident,
                    "shape_pt_lat": f"{lat:.6f}",
                    "shape_pt_lon": f"{lon:.6f}",
                    "shape_pt_sequence": str(i),
                }
            )

    # --- as tabelas -------------------------------------------------------
    feed.definir(
        "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
        [
            {
                "agency_id": "1",
                "agency_name": ctx.regiao.rede.get("operador", ""),
                "agency_url": ctx.regiao.rede.get("url", ""),
                "agency_timezone": "Europe/Lisbon",
                "agency_lang": "pt",
            }
        ],
    )
    feed.definir(
        "stops.txt",
        ["stop_id", "stop_code", "stop_name", "stop_lat", "stop_lon", "location_type"],
        sorted(paragens.values(), key=lambda s: s["stop_id"]),
    )
    feed.definir(
        "routes.txt",
        [
            "route_id",
            "agency_id",
            "route_short_name",
            "route_long_name",
            "route_type",
            "route_color",
            "route_text_color",
        ],
        rotas,
    )
    feed.definir(
        "trips.txt",
        ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id"],
        viagens_gtfs,
    )
    feed.definir(
        "stop_times.txt",
        [
            "trip_id",
            "arrival_time",
            "departure_time",
            "stop_id",
            "stop_sequence",
            "pickup_type",
            "drop_off_type",
            "timepoint",
        ],
        horarios,
    )
    feed.definir("calendar_dates.txt", ["service_id", "date", "exception_type"], datas)
    if pontos_de_forma:
        feed.definir(
            "shapes.txt",
            ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
            pontos_de_forma,
        )
    _tarifario(ctx, feed, rotas)
    _quem_fez(ctx, feed, doc, hoje, fim)

    contagens = {
        "meio.linhas": len(rotas),
        "meio.blocos": len(doc.blocos),
        "meio.viagens": len(viagens_gtfs),
        "meio.paragens": len(paragens),
        "meio.stop_times": len(horarios),
        "meio.stop_times_marcados_no_papel": sum(1 for h in horarios if h["timepoint"] == "1"),
        "meio.stop_times_estimados": sum(1 for h in horarios if h["timepoint"] == "0"),
        "meio.paragens_consecutivas_fundidas": fundidas,
        "meio.servicos": len(servicos),
        "meio.datas_de_servico": len(datas),
        "meio.paragens_por_fonte": dict(collections.Counter(i.split(":")[0] for i in paragens)),
    }
    lacunas = _lacunas(ctx, resolucao, completas, sem_cor, por_confirmar, sem_datas, servicos)
    return feed, contagens, lacunas


def _cor_do_texto(cor: str) -> str:
    """Preto ou branco, o que se ler melhor por cima desta cor (WCAG 2.1 AA)."""

    def canal(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    try:
        r, g, b = (int(cor[i : i + 2], 16) / 255 for i in (0, 2, 4))
    except ValueError:
        return ""
    luz = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
    com_branco = 1.05 / (luz + 0.05)
    com_preto = (luz + 0.05) / 0.05
    return "FFFFFF" if com_branco >= com_preto else "000000"


def _tarifario(ctx: Contexto, feed: Gtfs, rotas: list[dict[str, str]]) -> None:
    """O tarifário, só com os títulos que alguém confirmou na fonte.

    Um preço por confirmar não entra no feed: sai da página de tarifário
    marcado como tal, que é outra coisa. Aqui, um número errado é um número
    que uma aplicação mostra a quem vai pagar.
    """
    tarifas = ctx.regiao.tarifas or {}
    declaracao = tarifas.get("gtfs") or {}
    if not declaracao:
        return
    titulos = {
        t["id"]: t for t in (tarifas.get("titulos") or []) if t.get("confirmado") and t.get("id")
    }
    moeda = tarifas.get("moeda", "EUR")
    urbanas = set(str(x) for x in (declaracao.get("urbanas") or []))

    produtos: list[dict[str, str]] = []
    regras_v1: list[dict[str, str]] = []
    atributos_v1: list[dict[str, str]] = []
    por_produto: dict[str, dict[str, Any]] = {}
    for titulo_id, gtfs in (declaracao.get("titulos") or {}).items():
        t = titulos.get(titulo_id)
        if not t:
            continue
        valor = 0.0 if gtfs.get("gratuito") else float(t["valor"])
        produto = gtfs["produto"]
        por_produto[produto] = gtfs
        produtos.append(
            {
                "fare_product_id": produto,
                "fare_product_name": gtfs.get("nome") or t["nome"],
                "rider_category_id": gtfs.get("categoria", ""),
                "fare_media_id": gtfs.get("media", ""),
                "amount": f"{valor:.2f}",
                "currency": moeda,
            }
        )
        if gtfs.get("v1"):
            atributos_v1.append(
                {
                    "fare_id": produto,
                    "price": f"{valor:.2f}",
                    "currency_type": moeda,
                    "payment_method": "0",
                    "transfers": "0",
                    "agency_id": "1",
                }
            )
    if not produtos:
        return
    for atributo in atributos_v1:
        for r in rotas:
            regras_v1.append({"fare_id": atributo["fare_id"], "route_id": r["route_id"]})

    redes = [
        {"network_id": f"linha-{r['route_id']}", "network_name": f"Linha {r['route_short_name']}"}
        for r in rotas
    ]
    rede_rota = [{"network_id": f"linha-{r['route_id']}", "route_id": r["route_id"]} for r in rotas]
    regras: list[dict[str, str]] = []
    for r in rotas:
        for produto, gtfs in por_produto.items():
            if gtfs.get("so_nas_urbanas") and r["route_id"] not in urbanas:
                continue
            regras.append(
                {
                    "leg_group_id": declaracao.get("grupo", "rede"),
                    "network_id": f"linha-{r['route_id']}",
                    "fare_product_id": produto,
                }
            )

    if atributos_v1:
        feed.definir(
            "fare_attributes.txt",
            ["fare_id", "price", "currency_type", "payment_method", "transfers", "agency_id"],
            atributos_v1,
        )
        feed.definir("fare_rules.txt", ["fare_id", "route_id"], regras_v1)
    feed.definir(
        "fare_media.txt",
        ["fare_media_id", "fare_media_name", "fare_media_type"],
        [
            {
                "fare_media_id": m["id"],
                "fare_media_name": m["nome"],
                "fare_media_type": str(m["tipo"]),
            }
            for m in (declaracao.get("meios") or [])
        ],
    )
    feed.definir(
        "rider_categories.txt",
        ["rider_category_id", "rider_category_name", "is_default_fare_category", "eligibility_url"],
        [
            {
                "rider_category_id": c["id"],
                "rider_category_name": c["nome"],
                "is_default_fare_category": "1" if c.get("por_omissao") else "0",
                "eligibility_url": c.get("url", ""),
            }
            for c in (declaracao.get("categorias") or [])
        ],
    )
    feed.definir(
        "fare_products.txt",
        [
            "fare_product_id",
            "fare_product_name",
            "rider_category_id",
            "fare_media_id",
            "amount",
            "currency",
        ],
        produtos,
    )
    feed.definir("networks.txt", ["network_id", "network_name"], redes)
    feed.definir("route_networks.txt", ["network_id", "route_id"], rede_rota)
    feed.definir("fare_leg_rules.txt", ["leg_group_id", "network_id", "fare_product_id"], regras)


def _quem_fez(ctx: Contexto, feed: Gtfs, doc: pdf.Documento, hoje: date, fim: date) -> None:
    autoridade = ctx.regiao.autoridade or {}
    feed.definir(
        "feed_info.txt",
        [
            "feed_publisher_name",
            "feed_publisher_url",
            "feed_lang",
            "default_lang",
            "feed_start_date",
            "feed_end_date",
            "feed_version",
            "feed_contact_url",
        ],
        [
            {
                "feed_publisher_name": "Paragem.pt",
                "feed_publisher_url": "https://paragem.pt",
                "feed_lang": "pt",
                "default_lang": "pt",
                "feed_start_date": hoje.strftime("%Y%m%d"),
                "feed_end_date": fim.strftime("%Y%m%d"),
                "feed_version": (
                    f"{ctx.regiao.id}-{hoje.isoformat()} · horários: caderno da operadora"
                    + (f" em vigor desde {doc.em_vigor_desde}" if doc.em_vigor_desde else "")
                    + " · paragens e traçados: levantamentos públicos e OpenStreetMap"
                ),
                "feed_contact_url": "https://github.com/fvsalgado/paragem/issues",
            }
        ],
    )
    feed.definir(
        "attributions.txt",
        [
            "attribution_id",
            "organization_name",
            "is_producer",
            "is_operator",
            "is_authority",
            "attribution_url",
        ],
        [
            {
                "attribution_id": "autoridade",
                "organization_name": autoridade.get("nome", ""),
                "is_producer": "0",
                "is_operator": "0",
                "is_authority": "1",
                "attribution_url": autoridade.get("url", ""),
            },
            {
                "attribution_id": "operadora",
                "organization_name": ctx.regiao.rede.get("operador", ""),
                "is_producer": "0",
                "is_operator": "1",
                "is_authority": "0",
                "attribution_url": ctx.regiao.rede.get("url", ""),
            },
            {
                "attribution_id": "osm",
                "organization_name": "© OpenStreetMap contributors (ODbL)",
                "is_producer": "1",
                "is_operator": "0",
                "is_authority": "0",
                "attribution_url": "https://www.openstreetmap.org/copyright",
            },
            {
                "attribution_id": "paragem",
                "organization_name": "Paragem.pt",
                "is_producer": "1",
                "is_operator": "0",
                "is_authority": "0",
                "attribution_url": "https://paragem.pt",
            },
        ],
    )


# --- as decisões, em CSV, para quem as quiser conferir ---------------------


def _escrever_decisoes(
    ctx: Contexto,
    resolucao: Resolucao,
    completas: list[ViagemCompleta],
    segmentos: list[dict[str, Any]],
    tracados: dict[int, Tracado],
    forma_de: dict[int, str],
) -> None:
    pasta = ctx.destino / "decisoes"
    pasta.mkdir(parents=True, exist_ok=True)

    def escrever(ficheiro: str, colunas: list[str], linhas: list[dict[str, Any]]) -> None:
        caminho = pasta / ficheiro
        with open(caminho, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=colunas, extrasaction="ignore", lineterminator="\n")
            w.writeheader()
            w.writerows(linhas)
        ctx.relatorio.saidas[f"decisoes/{ficheiro}"] = str(caminho.relative_to(ctx.raiz))

    escrever(
        "paragens.csv",
        [
            "linha",
            "nome_pdf",
            "id",
            "nome_oficial",
            "fonte",
            "lat",
            "lon",
            "metodo",
            "semelhanca",
            "nota",
        ],
        resolucao.linhas_do_csv(),
    )
    escrever(
        "viagens.csv",
        [
            "viagem",
            "linha",
            "servico",
            "sentido",
            "pagina",
            "coluna",
            "alinhada",
            "n_papel",
            "n_omitidas",
            "n_intermedias",
            "n_total",
            "omitidas",
        ],
        [
            {
                "viagem": c.indice,
                "linha": c.viagem.linha,
                "servico": c.viagem.servico,
                "sentido": c.viagem.sentido or "",
                "pagina": c.viagem.pagina,
                "coluna": c.viagem.coluna,
                "alinhada": c.alinhada or "",
                "n_papel": len(c.viagem.paragens),
                "n_omitidas": len(c.omitidas),
                "n_intermedias": c.intermedias,
                "n_total": len(c.pontos),
                "omitidas": "; ".join(c.omitidas),
            }
            for c in completas
        ],
    )
    escrever(
        "segmentos.csv",
        ["viagem", "linha", "de", "para", "n_intermedias", "decisao", "motivo"],
        segmentos,
    )
    escrever(
        "tracados.csv",
        [
            "viagem",
            "linha",
            "servico",
            "pagina",
            "coluna",
            "metodo",
            "shape_id",
            "comprimento_m",
            "max_dist_paragem_m",
            "nota",
        ],
        [
            {
                "viagem": c.indice,
                "linha": c.viagem.linha,
                "servico": c.viagem.servico,
                "pagina": c.viagem.pagina,
                "coluna": c.viagem.coluna,
                "metodo": tracados[c.indice].metodo,
                "shape_id": forma_de.get(c.indice, ""),
                "comprimento_m": tracados[c.indice].comprimento_m or "",
                "max_dist_paragem_m": tracados[c.indice].max_dist_paragem_m or "",
                "nota": tracados[c.indice].nota,
            }
            for c in completas
        ],
    )


# --- o que fica por saber --------------------------------------------------


def _lacunas(ctx, resolucao, completas, sem_cor, por_confirmar, sem_datas, servicos):
    lacunas = []

    sem_coordenada = resolucao.sem_coordenada
    if sem_coordenada:
        lacunas.append(
            _lac(
                "paragens.sem-coordenadas",
                "Nomes do caderno de horários que ficaram sem paragem",
                onde="data/manual/<regiao>/decisoes/paragens-manual.yaml",
                porque_importa=(
                    "Não se sabe onde ficam, e pô-las no mapa a olho era mandar alguém para o "
                    "sítio errado. Ficam fora das viagens — e as viagens que as serviam mostram "
                    "uma paragem a menos."
                ),
                o_que_fazer=(
                    "Decidir cada uma na tabela manual, com o método e a razão; ou pedir as "
                    "coordenadas a quem gere a rede."
                ),
                quantos=len(sem_coordenada),
                quais=[f"{d.linha} × {d.nome}" for d in sem_coordenada[:30]],
            )
        )

    sem_alinhamento = [c for c in completas if not c.alinhada]
    if sem_alinhamento:
        lacunas.append(
            _lac(
                "viagens.sem-alinhamento",
                "Viagens que saem só com os pontos que o papel marca",
                onde="build/<regiao>/decisoes/viagens.csv",
                porque_importa=(
                    "Não se encontrou no levantamento uma viagem que as explique, por isso não "
                    "se herdaram as paragens intermédias. O percurso fica incompleto e "
                    "verdadeiro, que vale mais do que completo e emprestado à viagem errada."
                ),
                o_que_fazer=(
                    "Uma edição mais recente do levantamento resolve-as. Enquanto não vier, "
                    "ficam assim."
                ),
                quantos=len(sem_alinhamento),
            )
        )

    if sem_datas:
        lacunas.append(
            _lac(
                "calendario.sem-datas",
                "Serviços sem uma única data",
                gravidade=BLOQUEIA,
                onde=f"regioes/{ctx.regiao.id}/calendario.yaml → ano_letivo",
                porque_importa=(
                    f"{len(sem_datas)} dos {len(servicos)} serviços não se conseguem situar em "
                    "dia nenhum, e as viagens deles saíram do feed. É melhor do que o "
                    "contrário: publicar a máscara semanal punha autocarros a circular em "
                    "férias escolares, e alguém ficaria à espera de um que não vem."
                ),
                o_que_fazer="Declarar o período de aulas em falta no calendário da região.",
                quantos=len(sem_datas),
                quais=sem_datas[:30],
            )
        )

    if por_confirmar:
        lacunas.append(
            _lac(
                "calendario.por-confirmar",
                "Serviços com datas do calendário escolar oficial, por confirmar",
                onde=f"regioes/{ctx.regiao.id}/calendario.yaml → ano_letivo",
                porque_importa=(
                    f"{len(por_confirmar)} dos {len(servicos)} serviços correm em dias tirados "
                    "do despacho do calendário escolar, que é lei e é exato nas três "
                    "interrupções. Não é exato no ARRANQUE, nem no fim do 3.º período. Esses "
                    "dias ficam de fora, e a rede aparece mais vazia do que é."
                ),
                o_que_fazer=(
                    "O calendário de funcionamento que a operadora publica todos os anos fecha "
                    "as duas pontas."
                ),
                quantos=len(por_confirmar),
                quais=por_confirmar[:10],
            )
        )

    if sem_cor:
        lacunas.append(
            _lac(
                "linhas.sem-cor",
                "Linhas sem cor no levantamento",
                onde="routes.txt",
                porque_importa=(
                    "Uma linha sem cor sai com a cor de omissão, e duas linhas com a mesma cor "
                    "no mesmo mapa deixam de se distinguir."
                ),
                o_que_fazer=(
                    "Atribuir cor, com contraste conferido, ou herdá-la quando a fonte a tiver."
                ),
                quantos=len(sem_cor),
                quais=sem_cor,
            )
        )
    return lacunas


def _lac(id_, o_que, *, gravidade="lacuna", **kw):
    from ..relatorio import Lacuna

    return Lacuna(id=id_, gravidade=gravidade, o_que=o_que, **kw)


# --- o papel ---------------------------------------------------------------


def _pdftotext(caminho: Path) -> str:
    try:
        r = subprocess.run(
            ["pdftotext", "-layout", str(caminho), "-"], check=True, capture_output=True
        )
    except FileNotFoundError:
        raise RuntimeError(
            "falta o `pdftotext` (pacote poppler-utils). A versão importa: a saída de -layout "
            "muda entre versões do poppler, e é contra ela que os números do §6.1 são "
            "verificados. Ver docs/ARQUITETURA.md."
        ) from None
    return r.stdout.decode("utf-8", "replace")


def _conferir_legenda(ctx: Contexto, doc: pdf.Documento) -> None:
    """A legenda do PDF é normativa; o `calendario.yaml` tem de a respeitar.

    Isto apanhou três leituras erradas de uma vez: `DFXN` não é só «exceto
    Natal» (exclui também o 1 de janeiro), `SFXD` são sábados e não domingos, e
    `TD` não é «todos os dias» — é «domingos, incluindo se feriado».
    """
    declarados = (ctx.regiao.calendario.get("codigos") or {}).get("dias") or {}
    em_falta: list[str] = []
    for codigo in sorted(doc.legendas):
        _, _, dias = codigo.partition("-")
        if dias.isdigit():
            continue
        regra = declarados.get(dias)
        if not regra or not regra.get("dias_da_semana"):
            em_falta.append(f"{codigo} — «{doc.legendas[codigo]}»")
    if em_falta:
        ctx.relatorio.bloqueia(
            id="calendario.codigos-por-ler",
            o_que="Códigos de serviço do PDF sem regra declarada",
            onde=f"regioes/{ctx.regiao.id}/calendario.yaml → codigos.dias",
            porque_importa=(
                "A legenda do PDF é normativa e diz o que cada código quer dizer. Sem a regra "
                "correspondente, as viagens com esse código não se projetam em datas — e "
                "adivinhar põe autocarros a circular em dias em que não circulam."
            ),
            o_que_fazer="Transcrever a regra a partir da legenda, com a citação ao lado.",
            quantos=len(em_falta),
            quais=em_falta,
        )


def _ordem(codigo: str) -> tuple[int, str]:
    return (int(codigo), "") if codigo.isdigit() else (10**9, codigo)


__all__ = ["ler", "nome"]
