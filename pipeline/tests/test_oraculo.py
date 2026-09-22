"""O QUE O PLANEADOR DO NAVEGADOR DIZ, CONFERIDO CONTRA O FICHEIRO.

O planeador de viagens passou a correr no telemóvel. Um erro dele não dá erro
nenhum: dá uma hora de partida, e quem a lê vai para a paragem. **Nenhum teste
de interface apanha isso** — a página pode estar perfeita e a resposta errada.

O primeiro guarda é o `oraculo.mts`, que compara com o OpenTripPlanner. Apanhou
logo um erro a sério: as horas dos expressos vêm em UTC e estavam a ser lidas
como se fossem de Lisboa, 103 minutos adiantadas.

Mas apanhou também um falso alarme, e é isso que este ficheiro existe para
resolver. Uma viagem Lisboa→Aveiro passa em Fátima às 10:25 e em Pombal às
11:00; está no ficheiro, corre nesse dia, vai naquele sentido — e o motor não a
devolve nem pedindo-lhe vinte itinerários. **Comparar com outro programa herda
os buracos desse programa.**

Por isso este teste não compara com nada: pega em cada perna que o planeador
devolveu e vai procurá-la ao GTFS EM BRUTO. Se a viagem não existir, ou não
correr naquele dia, ou não passar por aquelas paragens àquelas horas, falha.
"""

from __future__ import annotations

import json
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from conftest import regiao_ou_salta
from paragem.grelha import _datas_de_servico, segundos
from paragem.gtfs import Gtfs
from paragem.sitio import com_nomes_da_regiao

# A folga com que se aceita uma hora: o planeador arredonda ao segundo e o
# relatório vai em milissegundos. Um minuto é generoso e continua a apanhar
# qualquer erro que interesse — os que interessam são de dezenas de minutos.
TOLERANCIA_SEGUNDOS = 60


@pytest.fixture(scope="module")
def raiz() -> Path:
    return Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def saida(raiz):
    f = raiz / "build" / "medio-tejo" / "oraculo-saida.json"
    if not f.exists():
        pytest.skip("sem saída do oráculo — corre `node web/tests/oraculo.mts` primeiro")
    return json.loads(f.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def feeds(raiz):
    """Cada feed declarado, com o fuso de cada linha e as datas de cada serviço."""
    r = regiao_ou_salta("medio-tejo")
    saida = []
    for caminho in (r.motor or {}).get("gtfs") or []:
        f = raiz / "build" / "medio-tejo" / caminho
        if not f.exists() or not zipfile.is_zipfile(f):
            continue
        # OS NOMES TÊM DE SER OS MESMOS DOS DOIS LADOS.
        #
        # A região corrige nomes de paragem em `nomes.yaml`, e o planeador vê
        # os corrigidos: «Fátima (Terminal)» onde o feed pan-europeu escreve
        # «Fatima (Bus Station)». Este teste lia o ficheiro em bruto e dizia
        # «nenhuma viagem bate certo» de três pernas de expresso que batiam —
        # o que não batia eram as duas grafias do mesmo cais.
        #
        # É a MESMA função que o `sitio.py` usa, de propósito: duas cópias da
        # correção divergem, e a divergência aparece outra vez aqui.
        g = com_nomes_da_regiao(Gtfs.ler(f), r)
        agencias = {a.get("agency_id") or "": a for a in g.obter("agency.txt")}
        unica = next(iter(agencias.values()), {})
        fuso_da_linha = {}
        nome_da_linha = {}
        for rt in g.routes:
            a = agencias.get(rt.get("agency_id") or "") or unica
            fuso_da_linha[rt["route_id"]] = a.get("agency_timezone") or "UTC"
            nome_da_linha[rt["route_id"]] = (rt.get("route_short_name") or "").strip()
        saida.append(
            {
                "gtfs": g,
                "fuso": fuso_da_linha,
                "nome": nome_da_linha,
                "datas": _datas_de_servico(g),
                "paragens": {s["stop_id"]: (s.get("stop_name") or "").strip() for s in g.stops},
            }
        )
    if not saida:
        pytest.skip("sem feeds construídos")
    return saida


def _pernas_de_transporte(saida):
    for viagem in saida["viagens"]:
        for i, it in enumerate(viagem["itinerarios"]):
            for perna in it["legs"]:
                if perna["mode"] != "WALK":
                    yield viagem["nome"], i, perna


def _existe(feeds, dia: str, perna: dict) -> str | None:
    """Devolve `None` se a perna existe mesmo, ou a razão por que não existe."""
    razoes = []
    for f in feeds:
        g: Gtfs = f["gtfs"]
        # As horas do relatório são épocas; leem-se no fuso da AGÊNCIA, que é
        # onde as horas do GTFS estão escritas.
        alvos = [rid for rid, nome in f["nome"].items() if nome and nome == perna["linha"]]
        if not alvos:
            continue
        viagens_da_linha = {t["trip_id"]: t for t in g.trips if t.get("route_id") in alvos}
        if not viagens_da_linha:
            continue
        fuso = ZoneInfo(f["fuso"][alvos[0]])
        for dias in (0, -1, 1):
            base = datetime.strptime(dia, "%Y-%m-%d").date() + timedelta(days=dias)
            chave = base.strftime("%Y%m%d")
            ativos = f["datas"].get(chave, set())
            if not ativos:
                continue
            meia_noite = datetime.combine(base, datetime.min.time(), tzinfo=fuso).timestamp()
            parte = round(perna["startTime"] / 1000 - meia_noite)
            chega = round(perna["endTime"] / 1000 - meia_noite)

            por_viagem: dict[str, list] = {}
            for h in g.stop_times:
                if h["trip_id"] in viagens_da_linha:
                    por_viagem.setdefault(h["trip_id"], []).append(h)

            for tid, horas in por_viagem.items():
                if viagens_da_linha[tid].get("service_id") not in ativos:
                    continue
                horas = sorted(horas, key=lambda x: int(x.get("stop_sequence") or 0))
                iparte = ichega = None
                for k, h in enumerate(horas):
                    nome = f["paragens"].get(h["stop_id"], "")
                    d = segundos(h.get("departure_time", ""))
                    a = segundos(h.get("arrival_time", ""))
                    if (
                        iparte is None
                        and nome == perna["de"]
                        and d is not None
                        and abs(d - parte) <= TOLERANCIA_SEGUNDOS
                    ):
                        iparte = k
                    if (
                        iparte is not None
                        and k > iparte
                        and nome == perna["para"]
                        and a is not None
                        and abs(a - chega) <= TOLERANCIA_SEGUNDOS
                    ):
                        ichega = k
                        break
                if iparte is not None and ichega is not None:
                    return None
            razoes.append(f"{chave}: nenhuma viagem da linha {perna['linha']} bate certo")
    return "; ".join(razoes) or f"nenhum feed tem a linha {perna['linha']}"


def test_toda_a_perna_de_transporte_existe_no_ficheiro(saida, feeds):
    """Cada autocarro e cada comboio que o planeador prometeu tem de existir.

    A verificação é a que quem viaja faria se pudesse: procurar a linha no
    horário, ver se corre naquele dia, e conferir que passa naquelas duas
    paragens àquelas horas, por aquela ordem.
    """
    faltas = []
    for nome, i, perna in _pernas_de_transporte(saida):
        razao = _existe(feeds, saida["dia"], perna)
        if razao:
            faltas.append(
                f"{nome} (opção {i + 1}): {perna['linha']} de «{perna['de']}» para "
                f"«{perna['para']}» — {razao}"
            )
    assert not faltas, "pernas que o ficheiro não confirma:\n  " + "\n  ".join(faltas)


def test_as_pernas_nao_se_atropelam(saida):
    """Não se apanha o seguinte antes de chegar. Parece óbvio; é o erro clássico."""
    problemas = []
    for viagem in saida["viagens"]:
        for i, it in enumerate(viagem["itinerarios"]):
            for a, b in zip(it["legs"], it["legs"][1:], strict=False):
                if b["startTime"] < a["endTime"] - TOLERANCIA_SEGUNDOS * 1000:
                    problemas.append(
                        f"{viagem['nome']} (opção {i + 1}): parte-se de «{b['de']}» "
                        f"antes de se ter chegado a «{a['para']}»"
                    )
            if it["legs"] and it["legs"][-1]["endTime"] < it["legs"][0]["startTime"]:
                problemas.append(f"{viagem['nome']} (opção {i + 1}): acaba antes de começar")
    assert not problemas, "\n  ".join(problemas)


def test_ha_respostas_para_conferir(saida):
    """Um oráculo que não experimentou nada passa sempre, e não prova nada."""
    total = sum(len(v["itinerarios"]) for v in saida["viagens"])
    assert total >= 3, f"só {total} itinerários no relatório — o oráculo não experimentou nada"
