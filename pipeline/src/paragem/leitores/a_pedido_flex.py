"""`a-pedido-flex` — o feed GTFS-Flex do transporte a pedido.

As brochuras dos concelhos já estão transcritas e já se mostram no sítio: a
página `/a-pedido/` diz que circuitos há, a que horas passam e como se
reservam. O que não existia era o mesmo em FORMATO DE MÁQUINA — e sem isso o
transporte a pedido não entra num planeador de viagens, nem no da casa nem no
de mais ninguém.

Este leitor junta três coisas que já estão construídas e escreve o feed:

    as brochuras transcritas   `tap/*.json`, um ficheiro por concelho
    o levantamento da autoridade   `paragens/camadas.json` — os circuitos, as
                                   paragens deles e os dias em que andam
    as decisões manuais        uma linha por nome que nenhuma regra decidiu

A lógica está em `paragem.flex`, que não sabe o que é um ficheiro; aqui lê-se,
escreve-se e conta-se.

PORQUE É QUE ISTO É UM FEED À PARTE, e não mais umas linhas no da rede
regular: são dois serviços com regras diferentes. Misturá-los dava um feed em
que metade das viagens circula sempre e a outra metade só se alguém telefonar,
e quem o lesse não teria como saber qual é qual sem olhar linha a linha. São
dois ficheiros, cada um com a sua verdade — e quem quiser os dois carrega os
dois, que é o que um motor de viagens faz todos os dias.
"""

from __future__ import annotations

import collections
import csv
import dataclasses
import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml

from ..calendario import Calendario
from ..flex import (
    Circuito,
    Decisao,
    Quadro,
    circuitos_dos_quadros,
    classificar_rotulo,
    codigos_de_servico,
    resolver,
)
from ..gtfs import Gtfs, id_seguro
from ..nomes import limpo, titulo
from ..paragens import Universo
from ..regiao import Saida
from .base import Contexto, Resultado, verificar_esperado

nome = "a-pedido-flex"

#: Um ano de datas. O mesmo da rede regular: um feed que acabe amanhã é um
#: feed que ninguém pode usar, e um que vá a três anos promete um calendário
#: escolar que ainda não foi publicado.
JANELA_DIAS = 364


def _hhmmss(valor: str | None) -> str:
    """`7:46` → `07:46:00`. O que não for hora nenhuma fica vazio."""
    partes = str(valor or "").strip().split(":")
    if len(partes) < 2 or not partes[0].strip().isdigit():
        return ""
    return f"{int(partes[0]):02d}:{int(partes[1]):02d}:00"


def _minutos(hms: str) -> int:
    return int(hms[:2]) * 60 + int(hms[3:5])


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    params = saida.params or {}
    camadas = _ler_json(ctx.destino / params.get("camadas", "paragens/camadas.json"))
    universo = Universo.ler(ctx.destino / params.get("universo", "paragens/universo.json"))
    quadros = _ler_quadros(ctx.destino / params.get("quadros", "tap"))
    manual = _ler_decisoes(ctx, params.get("decisoes"))

    circuitos = {
        c["id"]: Circuito(
            id=c["id"],
            nome=c.get("nome", ""),
            concelho=c.get("concelho", ""),
            horario=c.get("horario", ""),
            dias_escolar=tuple(c.get("dias_escolar") or ()),
            dias_ferias=tuple(c.get("dias_ferias") or ()),
            paragens=tuple(c.get("paragens") or ()),
        )
        for c in camadas.get("circuitos", [])
    }
    paragens_da_camada = {
        p["id"]: p
        for p in camadas.get("paragens", [])
        if p["id"] in {i for c in circuitos.values() for i in c.paragens}
    }

    declaracao = ctx.regiao.a_pedido or {}
    catalogo, declarado, proprios, codigos_declarados = _mapas_da_declaracao(declaracao)
    circuitos.update(proprios)
    # O levantamento tem uma coluna por dia da semana e não sabe dizer «sábados
    # da época balnear». Onde a região declara os códigos do calendário, são
    # eles que valem — o resto do circuito continua a ser o do levantamento.
    for ident, codigos in codigos_declarados.items():
        if ident in circuitos:
            circuitos[ident] = dataclasses.replace(circuitos[ident], codigos=codigos)
    circuito_de = circuitos_dos_quadros(quadros, circuitos, catalogo=catalogo, declarado=declarado)
    decisoes = resolver(quadros, circuito_de, circuitos, paragens_da_camada, manual=manual)

    feed, numeros, caidas = _construir(
        ctx, quadros, circuito_de, circuitos, universo, decisoes, declaracao
    )
    destino = ctx.caminho_de_saida(saida)
    feed.escrever(destino)

    _escrever_decisoes(ctx, quadros, circuito_de, circuitos, universo, decisoes)
    _relatar(ctx, saida, numeros, caidas, decisoes, circuito_de, quadros)

    contagens = {f"a_pedido.{k}": v for k, v in numeros.items()}
    return Resultado(contagens=contagens, saidas={saida.saida or "": str(destino)})


# --- ler o que já está construído ------------------------------------------


def _ler_json(caminho: Path) -> dict[str, Any]:
    if not caminho.exists():
        raise FileNotFoundError(f"{nome}: falta {caminho} — constrói-o antes desta saída")
    return json.loads(caminho.read_text(encoding="utf-8"))


def _ler_quadros(pasta: Path) -> list[Quadro]:
    """As brochuras transcritas, uma por concelho, pela ordem do nome."""
    if not pasta.is_dir():
        raise FileNotFoundError(f"{nome}: falta a pasta {pasta} com as brochuras transcritas")
    quadros: list[Quadro] = []
    for ficheiro in sorted(pasta.glob("*.json")):
        doc = json.loads(ficheiro.read_text(encoding="utf-8"))
        for q in doc.get("quadros", []):
            quadros.append(
                Quadro(
                    ficheiro=ficheiro.name,
                    nome=q.get("nome", ""),
                    tipo=q.get("tipo", ""),
                    paragens=list(q.get("paragens") or []),
                    viagens=list(q.get("viagens") or []),
                    rotulos=list(q.get("rotulos") or []),
                    regras=list(q.get("regras") or []),
                    horas=list(q.get("horas") or []),
                )
            )
    return quadros


def _ler_decisoes(ctx: Contexto, relativo: str | None) -> dict[tuple[str, str, str], Decisao]:
    """A tabela de decisões manuais: entrada humana, nunca escrita pelo pipeline."""
    if not relativo:
        return {}
    caminho = ctx.caminho_de_dados(relativo)
    if not caminho.exists():
        raise FileNotFoundError(f"{nome}: a receita declara {relativo} e o ficheiro não existe")
    tabela = yaml.safe_load(caminho.read_text(encoding="utf-8")) or []
    fora: dict[tuple[str, str, str], Decisao] = {}
    for i, e in enumerate(tabela, start=1):
        em_falta = [c for c in ("ficheiro", "quadro", "nome", "escolha", "metodo") if not e.get(c)]
        if em_falta:
            raise ValueError(f"{relativo}: entrada {i} sem {', '.join(em_falta)}")
        fora[(e["ficheiro"], e["quadro"], e["nome"])] = Decisao(
            escolha=str(e["escolha"]),
            metodo=f"manual:{e['metodo']}",
            nota=str(e.get("nota") or ""),
            nome_oficial=str(e.get("nome_oficial") or ""),
        )
    return fora


def _mapas_da_declaracao(
    declaracao: dict[str, Any],
) -> tuple[
    dict[tuple[str, str], str],
    dict[tuple[str, str], str],
    dict[str, Circuito],
    dict[str, tuple[str, ...]],
]:
    """O que a região declara sobre cada quadro.

    `catalogo` é o nome que o sistema de reservas dá ao circuito cujo horário
    está naquele quadro — vem do `horario_em`, que já existia para a página.
    `declarado` é a ligação ao levantamento, onde os nomes não chegam. E
    `proprios` são os circuitos que o levantamento NÃO TEM: existem na
    brochura e mais em lado nenhum, e a região descreve-os como descreve os da
    rede regular, por códigos de calendário.
    """
    catalogo: dict[tuple[str, str], str] = {}
    for c in declaracao.get("circuitos") or []:
        h = c.get("horario_em") or {}
        if h.get("saida") and h.get("quadro"):
            catalogo[(Path(str(h["saida"])).name, str(h["quadro"]))] = str(c.get("nome") or "")

    declarado: dict[tuple[str, str], str] = {}
    proprios: dict[str, Circuito] = {}
    codigos_declarados: dict[str, tuple[str, ...]] = {}
    for e in declaracao.get("levantamento") or []:
        chave = (Path(str(e["saida"])).name, str(e["quadro"]))
        proprio = e.get("circuito_proprio")
        if proprio:
            ident = str(proprio["id"])
            proprios[ident] = Circuito(
                id=ident,
                nome=str(proprio.get("nome") or ""),
                concelho=str(proprio.get("concelho") or ""),
                horario=str(proprio.get("horario") or ""),
                dias_escolar=(),
                dias_ferias=(),
                paragens=(),
                codigos=tuple(str(x) for x in (proprio.get("codigos") or ())),
            )
            declarado[chave] = ident
            continue
        declarado[chave] = str(e.get("circuito") or "")
        if e.get("codigos"):
            codigos_declarados[declarado[chave]] = tuple(str(x) for x in e["codigos"])
    return catalogo, declarado, proprios, codigos_declarados


# --- escrever o feed --------------------------------------------------------


def _regras_de_reserva(ctx: Contexto) -> tuple[list[dict[str, str]], str, list[tuple[str, str]]]:
    """As regras de reserva declaradas, a que vale por omissão, e como se escolhem.

    A regra não é um preço, mas vive com os preços (`tarifas.yaml`) porque é a
    mesma pergunta: o que é preciso para poder viajar. Uma brochura que dê
    outro telefone traz outra regra, e o que a distingue é o próprio texto da
    brochura — `quando_a_regra_disser`.
    """
    reservas = ((ctx.regiao.tarifas or {}).get("reservas") or {}).get("transporte_a_pedido") or {}
    declaradas = reservas.get("gtfs") or []
    if not declaradas:
        raise ValueError(
            f"{nome}: a região não declara `reservas.transporte_a_pedido.gtfs` no tarifário — "
            "sem regra de reserva, um feed a pedido é um feed que mente"
        )
    linhas: list[dict[str, str]] = []
    omissao = ""
    escolhas: list[tuple[str, str]] = []
    for r in declaradas:
        ident = str(r["id"])
        telefone = str(r.get("telefone_apresentado") or reservas.get("telefone_apresentado") or "")
        linhas.append(
            {
                "booking_rule_id": ident,
                "booking_type": str(r.get("tipo", "2")),
                "prior_notice_last_day": str(r.get("ultimo_dia", "1")),
                "prior_notice_last_time": _hhmmss(str(r.get("ultima_hora") or "")),
                "message": str(r.get("mensagem") or _mensagem(r, reservas)),
                "phone_number": telefone,
                "booking_url": str(r.get("url") or reservas.get("online") or ""),
            }
        )
        if r.get("por_omissao"):
            omissao = ident
        if r.get("quando_a_regra_disser"):
            escolhas.append((str(r["quando_a_regra_disser"]), ident))
    if not omissao:
        raise ValueError(f"{nome}: nenhuma regra de reserva está declarada `por_omissao: true`")
    return linhas, omissao, escolhas


def _mensagem(regra: dict[str, Any], reservas: dict[str, Any]) -> str:
    """A frase que um leitor mostra a quem vai reservar, feita do que se sabe."""
    telefone = regra.get("telefone_apresentado") or reservas.get("telefone_apresentado") or ""
    nota = regra.get("telefone_nota") or reservas.get("telefone_nota") or ""
    prazo = regra.get("prazo") or reservas.get("prazo") or ""
    url = regra.get("url") or reservas.get("online") or ""
    partes = [f"Reserva obrigatória: {prazo.lower()}" if prazo else "Reserva obrigatória"]
    if url:
        partes.append(f"em {url}")
    if telefone:
        partes.append(f"ou pelo {telefone}" + (f" ({nota})" if nota else ""))
    return ", ".join(partes) + "."


def _construir(
    ctx: Contexto,
    quadros: list[Quadro],
    circuito_de: dict[tuple[str, str], str | None],
    circuitos: dict[str, Circuito],
    universo: Universo,
    decisoes: dict[tuple[str, str, str], Decisao],
    declaracao: dict[str, Any],
) -> tuple[Gtfs, dict[str, Any], list[dict[str, str]]]:
    hoje = date.today()
    fim = hoje + timedelta(days=JANELA_DIAS)
    regras, regra_por_omissao, escolhas_de_regra = _regras_de_reserva(ctx)

    paragens: dict[str, dict[str, str]] = {}
    rotas: dict[str, dict[str, str]] = {}
    viagens: list[dict[str, str]] = []
    horarios: list[dict[str, str]] = []
    caidas: list[dict[str, str]] = []
    contador: collections.Counter[str] = collections.Counter()
    servicos: dict[str, list[str]] = {}

    cal = Calendario(ctx.regiao.calendario, [c.id for c in ctx.regiao.concelhos])
    datas_de: dict[str, list[date]] = {}
    por_confirmar: dict[str, list[str]] = {}

    def datas(codigos: list[str]) -> set[date]:
        fora: set[date] = set()
        for codigo in codigos:
            if codigo not in datas_de:
                res = cal.resolver(codigo, hoje, fim)
                datas_de[codigo] = res.datas
                if res.por_confirmar:
                    por_confirmar[codigo] = res.por_confirmar
            fora |= set(datas_de[codigo])
        return fora

    def paragem(ident: str, nome_da_brochura: str, nome_oficial: str = "") -> str | None:
        """A paragem no feed, criada à primeira vez que uma viagem lá passa."""
        if ident in paragens:
            return paragens[ident]["stop_id"]
        p = universo.get(ident)
        if p is None:
            return None
        # O nome do levantamento do serviço já vem escrito como uma pessoa o
        # lê; o de outras fontes vem em maiúsculas.
        escrito = nome_oficial or (p.nome if ident.startswith("g13:") else titulo(p.nome))
        paragens[ident] = {
            "stop_id": id_seguro(ident),
            "stop_name": limpo(escrito) or limpo(nome_da_brochura),
            "stop_lat": f"{p.lat:.6f}",
            "stop_lon": f"{p.lon:.6f}",
            "location_type": "0",
        }
        return paragens[ident]["stop_id"]

    for q in quadros:
        if q.tipo != "percurso":
            continue
        cid = circuito_de.get((q.ficheiro, q.nome))
        circuito = circuitos.get(cid or "")
        if circuito is None:
            caidas.append(
                {
                    "ficheiro": q.ficheiro,
                    "quadro": q.nome,
                    "rotulo": "",
                    "razao": "o quadro não tem circuito no levantamento",
                }
            )
            continue
        rotas.setdefault(
            circuito.id,
            {
                "route_id": circuito.id,
                "agency_id": _agencia(ctx)["agency_id"],
                "route_short_name": "",
                "route_long_name": (circuito.nome or q.nome).replace(" | ", " / "),
                "route_desc": f"Transporte a pedido — {circuito.concelho}",
                "route_type": "3",
            },
        )
        regra = regra_por_omissao
        for texto, ident in escolhas_de_regra:
            if any(texto in r for r in q.regras):
                regra = ident

        for i, viagem in enumerate(q.viagens):
            rotulo = q.rotulos[i] if i < len(q.rotulos) else ""
            periodo, so_dias, sentido = classificar_rotulo(rotulo)
            codigos = codigos_de_servico(circuito, periodo, so_dias)
            quais = datas(codigos)
            if not quais:
                caidas.append(
                    {
                        "ficheiro": q.ficheiro,
                        "quadro": q.nome,
                        "rotulo": rotulo,
                        "razao": "o circuito não anda em dia nenhum deste período",
                    }
                )
                continue
            servico = f"{circuito.id}-{periodo}" + {"sab": "-S", "uteis": "-U"}.get(
                so_dias or "", ""
            )
            servicos[servico] = sorted(d.strftime("%Y%m%d") for d in quais)

            passagens = [
                (n, _hhmmss(t)) for n, t in (viagem.get("passagens") or []) if n and _hhmmss(t)
            ]
            sequencia: list[tuple[str, str, str]] = []
            omitidas: list[str] = []
            for n, t in passagens:
                d = decisoes.get((q.ficheiro, q.nome, n))
                escolhida = _identificador(d, universo, n)
                sid = paragem(escolhida, n, d.nome_oficial if d else "") if escolhida else None
                if sid is None:
                    omitidas.append(n)
                    continue
                sequencia.append((n, t, sid))

            # UMA HORA QUE RECUA É UM ERRO DE LEITURA, e trunca-se aí: a parte
            # de cima da coluna está certa, a de baixo é de outra viagem.
            minutos = [_minutos(t) for _, t, _ in sequencia]
            corte = next(
                (
                    j + 1
                    for j, (a, b) in enumerate(zip(minutos, minutos[1:], strict=False))
                    if b < a
                ),
                None,
            )
            if corte is not None:
                caidas.append(
                    {
                        "ficheiro": q.ficheiro,
                        "quadro": q.nome,
                        "rotulo": rotulo,
                        "razao": (
                            f"hora a recuar em «{sequencia[corte][0]}» "
                            f"({sequencia[corte][1][:5]} depois de {sequencia[corte - 1][1][:5]}): "
                            f"viagem truncada, {len(sequencia) - corte} passagens omitidas"
                        ),
                    }
                )
                omitidas += [n for n, _, _ in sequencia[corte:]]
                sequencia = sequencia[:corte]

            if len(sequencia) < 2:
                caidas.append(
                    {
                        "ficheiro": q.ficheiro,
                        "quadro": q.nome,
                        "rotulo": rotulo,
                        "razao": f"menos de duas paragens localizadas ({len(sequencia)})",
                    }
                )
                continue

            contador[circuito.id] += 1
            tid = f"{circuito.id}-{contador[circuito.id]:03d}"
            viagens.append(
                {
                    "route_id": circuito.id,
                    "service_id": servico,
                    "trip_id": tid,
                    "trip_headsign": limpo(sequencia[-1][0]),
                    "direction_id": sentido,
                }
            )
            ordem = 0
            anterior = ""
            for _nome_na_brochura, t, sid in sequencia:
                # A MESMA PARAGEM DUAS VEZES SEGUIDAS é o mesmo poste escrito
                # duas vezes na brochura (P1 e P2 do mesmo sítio, ou a chegada
                # e a partida). Uma vez chega.
                if sid == anterior:
                    continue
                ordem += 1
                anterior = sid
                horarios.append(
                    {
                        "trip_id": tid,
                        "arrival_time": t,
                        "departure_time": t,
                        "stop_id": sid,
                        "stop_sequence": str(ordem),
                        "pickup_type": "2",
                        "drop_off_type": "2",
                        "timepoint": "1",
                        "pickup_booking_rule_id": regra,
                        "drop_off_booking_rule_id": regra,
                    }
                )

    feed = _montar(ctx, paragens, rotas, viagens, horarios, servicos, regras, hoje, fim, declaracao)
    numeros = {
        "circuitos": len(feed["routes.txt"]),
        "viagens": len(viagens),
        "registos_de_horario": len(horarios),
        "paragens": len(paragens),
        "datas": len(feed["calendar_dates.txt"]),
        "servicos": len({v["service_id"] for v in viagens}),
        "viagens_caidas": len(caidas),
        "servicos_por_confirmar": {k: v for k, v in sorted(por_confirmar.items())},
    }
    return feed, numeros, caidas


def _identificador(
    decisao: Decisao | None, universo: Universo, nome_da_brochura: str
) -> str | None:
    """O identificador que uma decisão aponta — criando o ponto manual, se for esse o caso."""
    if decisao is None or decisao.escolha in ("", "sem"):
        return None
    escolha = decisao.escolha
    if escolha.startswith("ponto:"):
        lat, _, lon = escolha[len("ponto:") :].partition(",")
        return universo.ponto_manual(
            float(lat), float(lon), decisao.nome_oficial or nome_da_brochura, "decisão manual"
        )
    return escolha if escolha in universo else None


def _agencia(ctx: Contexto) -> dict[str, str]:
    reservas = ((ctx.regiao.tarifas or {}).get("reservas") or {}).get("transporte_a_pedido") or {}
    autoridade = ctx.regiao.autoridade or {}
    return {
        "agency_id": "a-pedido",
        "agency_name": f"{autoridade.get('nome', ctx.regiao.nome)} — Transporte a Pedido",
        "agency_url": str(reservas.get("online") or autoridade.get("url") or ""),
        # O fuso é o do motor de viagens da região, que é quem já o declara.
        "agency_timezone": str((ctx.regiao.motor or {}).get("fuso") or "UTC"),
        "agency_lang": "pt",
        "agency_phone": str(reservas.get("telefone_apresentado") or ""),
        "agency_email": str(reservas.get("email") or ""),
    }


def _montar(
    ctx: Contexto,
    paragens: dict[str, dict[str, str]],
    rotas: dict[str, dict[str, str]],
    viagens: list[dict[str, str]],
    horarios: list[dict[str, str]],
    servicos: dict[str, list[str]],
    regras: list[dict[str, str]],
    hoje: date,
    fim: date,
    declaracao: dict[str, Any],
) -> Gtfs:
    feed = Gtfs()
    agencia = _agencia(ctx)
    feed.definir("agency.txt", list(agencia.keys()), [agencia])
    usadas = {v["route_id"] for v in viagens}
    feed.definir(
        "stops.txt",
        ["stop_id", "stop_name", "stop_lat", "stop_lon", "location_type"],
        sorted(paragens.values(), key=lambda s: s["stop_id"]),
    )
    feed.definir(
        "routes.txt",
        [
            "route_id",
            "agency_id",
            "route_short_name",
            "route_long_name",
            "route_desc",
            "route_type",
        ],
        [rotas[r] for r in sorted(rotas) if r in usadas],
    )
    feed.definir(
        "trips.txt",
        ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"],
        viagens,
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
            "pickup_booking_rule_id",
            "drop_off_booking_rule_id",
        ],
        horarios,
    )
    precisos = {v["service_id"] for v in viagens}
    feed.definir(
        "calendar_dates.txt",
        ["service_id", "date", "exception_type"],
        [
            {"service_id": s, "date": d, "exception_type": "1"}
            for s in sorted(precisos)
            for d in servicos.get(s, [])
        ],
    )
    feed.definir(
        "booking_rules.txt",
        [
            "booking_rule_id",
            "booking_type",
            "prior_notice_last_day",
            "prior_notice_last_time",
            "message",
            "phone_number",
            "booking_url",
        ],
        regras,
    )
    fonte = str(declaracao.get("fonte") or "brochuras dos concelhos")
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
                "feed_version": f"{ctx.regiao.id}-a-pedido-{hoje.isoformat()}",
                "feed_contact_url": "https://github.com/fvsalgado/paragem/issues",
            }
        ],
    )
    fontes = [
        {
            "attribution_id": "autoridade",
            "organization_name": str((ctx.regiao.autoridade or {}).get("nome") or ctx.regiao.nome),
            "is_producer": "0",
            "is_operator": "1",
            "is_authority": "1",
            "attribution_url": str((ctx.regiao.autoridade or {}).get("url") or ""),
        },
        {
            "attribution_id": "paragem",
            "organization_name": f"Paragem.pt — construído de: {fonte[:200]}",
            "is_producer": "1",
            "is_operator": "0",
            "is_authority": "0",
            "attribution_url": "https://paragem.pt",
        },
    ]
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
        fontes,
    )
    return feed


# --- o que ficou escrito ----------------------------------------------------


def _escrever_decisoes(
    ctx: Contexto,
    quadros: list[Quadro],
    circuito_de: dict[tuple[str, str], str | None],
    circuitos: dict[str, Circuito],
    universo: Universo,
    decisoes: dict[tuple[str, str, str], Decisao],
) -> None:
    """Uma linha por decisão, para quem conhece o território poder conferir."""
    pasta = ctx.destino / "decisoes"
    pasta.mkdir(parents=True, exist_ok=True)

    caminho = pasta / "a-pedido-paragens.csv"
    with caminho.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "ficheiro",
                "quadro",
                "circuito",
                "nome_na_brochura",
                "escolha",
                "nome",
                "lat",
                "lon",
                "metodo",
                "nota",
            ]
        )
        for (ficheiro, quadro, nome_brochura), d in sorted(decisoes.items()):
            p = universo.get(d.escolha) if d.escolha not in ("", "sem") else None
            w.writerow(
                [
                    ficheiro,
                    quadro,
                    circuito_de.get((ficheiro, quadro)) or "",
                    nome_brochura,
                    d.escolha,
                    (p.nome if p else d.nome_oficial),
                    (f"{p.lat:.6f}" if p else ""),
                    (f"{p.lon:.6f}" if p else ""),
                    d.metodo,
                    d.nota,
                ]
            )
    ctx.relatorio.saidas["decisoes/a-pedido-paragens.csv"] = ctx.caminho_curto(caminho)

    caminho = pasta / "a-pedido-circuitos.csv"
    with caminho.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "ficheiro",
                "quadro",
                "tipo",
                "circuito",
                "nome_do_circuito",
                "concelho",
                "dias_escolar",
                "dias_ferias",
                "viagens",
                "paragens",
            ]
        )
        for q in quadros:
            c = circuitos.get(circuito_de.get((q.ficheiro, q.nome)) or "")
            w.writerow(
                [
                    q.ficheiro,
                    q.nome,
                    q.tipo,
                    c.id if c else "",
                    c.nome if c else "",
                    c.concelho if c else "",
                    "".join("x" if d else "." for d in (c.dias_escolar if c else ())),
                    "".join("x" if d else "." for d in (c.dias_ferias if c else ())),
                    len(q.viagens),
                    len(q.paragens),
                ]
            )
    ctx.relatorio.saidas["decisoes/a-pedido-circuitos.csv"] = ctx.caminho_curto(caminho)


def _relatar(
    ctx: Contexto,
    saida: Saida,
    numeros: dict[str, Any],
    caidas: list[dict[str, str]],
    decisoes: dict[tuple[str, str, str], Decisao],
    circuito_de: dict[tuple[str, str], str | None],
    quadros: list[Quadro],
) -> None:
    for chave in ("circuitos", "viagens", "registos_de_horario", "paragens"):
        verificar_esperado(
            ctx, saida, chave, numeros[chave], (saida.params or {}).get(f"esperado_{chave}")
        )

    metodos = collections.Counter(d.metodo for d in decisoes.values())
    ctx.relatorio.contar("a_pedido.decisoes", len(decisoes))
    for metodo, quantos in sorted(metodos.items()):
        ctx.relatorio.contar(f"a_pedido.decisoes.{metodo}", quantos)

    sem_paragem = sorted(
        f"{f} · {q} · {n}" for (f, q, n), d in decisoes.items() if d.escolha in ("", "sem")
    )
    if sem_paragem:
        ctx.relatorio.lacuna(
            id="a-pedido.paragens-sem-coordenada",
            o_que=f"{len(sem_paragem)} nomes de brochura sem paragem conhecida",
            onde="decisoes/a-pedido-paragens.csv",
            porque_importa=(
                "Ficam fora das viagens do feed a pedido: sem coordenada não se põe ninguém à "
                "espera num sítio."
            ),
            o_que_fazer="Uma linha na tabela de decisões manuais, com a razão da escolha.",
            quantos=len(sem_paragem),
            quais=sem_paragem[:10],
        )

    sem_circuito = sorted(
        f"{f} · {q}" for (f, q), c in circuito_de.items() if not c and _e_percurso(quadros, f, q)
    )
    if sem_circuito:
        ctx.relatorio.lacuna(
            id="a-pedido.quadros-sem-circuito",
            o_que=f"{len(sem_circuito)} quadros sem circuito no levantamento",
            onde="decisoes/a-pedido-circuitos.csv",
            porque_importa=(
                "Sem circuito não se sabe em que dias o horário anda, e um horário sem dias não "
                "entra no feed."
            ),
            o_que_fazer="Declarar a ligação em `a-pedido.yaml`, na lista `levantamento:`.",
            quantos=len(sem_circuito),
            quais=sem_circuito[:10],
        )

    partidas = sorted(f"{q.ficheiro} · {q.nome}" for q in quadros if q.tipo == "partidas")
    if partidas:
        ctx.relatorio.lacuna(
            id="a-pedido.tabelas-de-partidas",
            o_que=f"{len(partidas)} quadros são tabelas de partidas e não entram no feed",
            onde="decisoes/a-pedido-circuitos.csv",
            porque_importa=(
                "Uma tabela de partidas diz a que horas se pode sair de cada terra, e não a "
                "ordem por que um veículo lhes passa: lida como percurso, dava uma viagem que "
                "não existe. O sítio mostra-as como o que são; o feed não as pode escrever."
            ),
            o_que_fazer=(
                "Levantar o percurso de cada uma — com a operadora, ou de uma brochura que o "
                "traga paragem a paragem."
            ),
            quantos=len(partidas),
            quais=partidas[:10],
        )

    if caidas:
        ctx.relatorio.lacuna(
            id="a-pedido.viagens-fora-do-feed",
            o_que=f"{len(caidas)} viagens transcritas que não entraram no feed",
            onde="decisoes/a-pedido-circuitos.csv",
            porque_importa=(
                "A viagem está na brochura e o sítio mostra-a; no feed não entrou, e quem só ler "
                "o feed não a vê."
            ),
            o_que_fazer="Cada uma com a razão à frente; a maioria resolve-se na transcrição.",
            quantos=len(caidas),
            quais=[f"{c['ficheiro']} · {c['quadro']} · {c['razao']}" for c in caidas[:10]],
        )

    if numeros["servicos_por_confirmar"]:
        ctx.relatorio.lacuna(
            id="a-pedido.calendario-por-confirmar",
            o_que=f"{len(numeros['servicos_por_confirmar'])} serviços com datas por confirmar",
            onde=f"regioes/{ctx.regiao.id}/calendario.yaml",
            porque_importa=(
                "O calendário dá-lhes datas, mas por uma regra que a operadora ainda não "
                "confirmou: as datas podem estar certas e ninguém o garantiu."
            ),
            o_que_fazer="Confirmar com quem publica o calendário de funcionamento.",
            quantos=len(numeros["servicos_por_confirmar"]),
            quais=[
                f"{k}: {'; '.join(v)}"
                for k, v in list(numeros["servicos_por_confirmar"].items())[:5]
            ],
        )


def _e_percurso(quadros: list[Quadro], ficheiro: str, quadro: str) -> bool:
    return any(
        q.ficheiro == ficheiro and q.nome == quadro and q.tipo == "percurso" for q in quadros
    )
