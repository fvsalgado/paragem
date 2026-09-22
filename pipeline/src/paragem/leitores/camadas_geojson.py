"""`camadas-geojson` — as camadas de um portal de dados geográficos, normalizadas.

Uma autoridade de transportes costuma publicar num servidor de mapas o que
tem: onde ficam as paragens, por onde passam as carreiras, que localidades
existem. Sai em GeoJSON, uma camada por assunto, com os nomes dos campos que
quem desenhou a camada escolheu.

Este leitor não sabe nada disso. A receita da região é que diz **que ficheiro
tem o quê e como se chamam os campos**; aqui só se lê, se normaliza e se conta.
É o que permite que a camada 19 de um portal e a camada 3 de outro entrem pelo
mesmo sítio sem uma linha de código nova.

O que sai é um só ficheiro JSON com listas — `paragens`, `sequencias`,
`tracados`, `localidades` e `circuitos` —, que os módulos da construção leem:

- **paragens**: ponto com nome e um identificador estável (`<prefixo>:<id>`);
- **sequencias**: a ordem das paragens de cada viagem, quando a camada a traz.
  É isto que dá as paragens intermédias que um caderno de horários não marca;
- **tracados**: a linha por onde a viagem passa, quando a camada a traz;
- **localidades**: povoações, que não são paragens — servem o transporte a
  pedido, que serve povoações e não postes;
- **circuitos**: quando cada registo da camada é uma paragem VISTA DE UM
  SERVIÇO, o serviço em si — o nome, o concelho e em que dias anda. É o que
  permite saber que circuitos existem sem os escrever à mão.

## O `so_por_decisao_manual`

Uma camada pode descrever um serviço diferente — as paragens do transporte a
pedido, por exemplo. Os nomes são parecidos com os da rede regular e as
coordenadas são boas, mas uma paragem de um serviço não é a paragem do outro.
Entram no universo para poderem ser ESCOLHIDAS À MÃO, com a razão escrita, e
ficam fora das regras automáticas, que de outra forma as apanhavam pelo nome.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

from ..regiao import Saida
from .base import Contexto, Resultado, verificar_esperado

nome = "camadas-geojson"

# O GeoJSON que sai de um servidor de mapas escreve os vazios como a palavra
# «None». Lida como texto, punha «None» no nome de uma paragem.
_VAZIOS = {"", "none", "null", "<null>"}


def _texto(valor: Any) -> str:
    # Um identificador que venha como número não pode ficar «2790.0»: as
    # decisões manuais escrevem-no «2790», e um ponto decimal no meio de um
    # identificador é uma decisão que deixa de casar.
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    t = str(valor if valor is not None else "").strip()
    return "" if t.lower() in _VAZIOS else t


def _ponto(geometria: dict[str, Any]) -> tuple[float, float] | None:
    if not geometria or geometria.get("type") != "Point":
        return None
    coords = geometria.get("coordinates") or []
    if len(coords) < 2:
        return None
    return round(float(coords[1]), 6), round(float(coords[0]), 6)


def _linha(geometria: dict[str, Any]) -> list[list[float]]:
    """Os pontos de uma geometria de linha, em (lat, lon).

    Uma carreira pode vir como `LineString` ou como `MultiLineString` partida
    em troços; os troços entram por ordem, que é como o desenho se lê.
    """
    tipo = (geometria or {}).get("type")
    if tipo == "LineString":
        partes = [geometria.get("coordinates") or []]
    elif tipo == "MultiLineString":
        partes = geometria.get("coordinates") or []
    else:
        return []
    pontos: list[list[float]] = []
    for parte in partes:
        for x in parte:
            pontos.append([round(float(x[1]), 6), round(float(x[0]), 6)])
    return pontos


def _feicoes(caminho: Path, ficheiro: str) -> list[dict[str, Any]]:
    if caminho.is_dir():
        return json.loads((caminho / ficheiro).read_text(encoding="utf-8"))["features"]
    with zipfile.ZipFile(caminho) as z:
        nomes = {n.rsplit("/", 1)[-1]: n for n in z.namelist()}
        if ficheiro not in nomes:
            raise ValueError(f"{caminho.name} não tem a camada {ficheiro!r}. Tem: {sorted(nomes)}")
        return json.loads(z.read(nomes[ficheiro]))["features"]


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    caminho = ctx.caminho_da_fonte(saida.fonte)
    camadas = saida.params.get("camadas") or []
    if not camadas:
        raise ValueError(f"{nome}: a receita não declara `params.camadas`")

    paragens: dict[str, dict[str, Any]] = {}
    sequencias: list[dict[str, Any]] = []
    tracados: list[dict[str, Any]] = []
    localidades: list[dict[str, Any]] = []
    circuitos: dict[str, dict[str, Any]] = {}
    contagens: dict[str, Any] = {}

    for camada in camadas:
        ficheiro = camada["ficheiro"]
        feicoes = _feicoes(caminho, ficheiro)
        etiqueta = camada.get("etiqueta") or Path(ficheiro).stem
        contagens[f"camadas.{etiqueta}.feicoes"] = len(feicoes)

        if camada.get("tracados"):
            n = _ler_tracados(feicoes, camada, tracados)
            contagens[f"camadas.{etiqueta}.tracados"] = n
            verificar_esperado(
                ctx, saida, f"{etiqueta}.tracados", n, camada.get("esperado_tracados")
            )
            continue

        if camada.get("circuitos"):
            antes_p = len(paragens)
            _ler_paragens(feicoes, camada, paragens)
            contagens[f"camadas.{etiqueta}.paragens"] = len(paragens) - antes_p
            verificar_esperado(
                ctx,
                saida,
                f"{etiqueta}.paragens",
                len(paragens) - antes_p,
                camada.get("esperado_paragens"),
            )
            c = _ler_circuitos(feicoes, camada, circuitos)
            contagens[f"camadas.{etiqueta}.circuitos"] = c
            verificar_esperado(
                ctx, saida, f"{etiqueta}.circuitos", c, camada.get("esperado_circuitos")
            )
            continue

        if camada.get("tipo") == "localidade":
            n = _ler_localidades(feicoes, camada, localidades)
            contagens[f"camadas.{etiqueta}.localidades"] = n
            verificar_esperado(
                ctx, saida, f"{etiqueta}.localidades", n, camada.get("esperado_localidades")
            )
            continue

        antes = len(paragens)
        _ler_paragens(feicoes, camada, paragens)
        n = len(paragens) - antes
        contagens[f"camadas.{etiqueta}.paragens"] = n
        verificar_esperado(ctx, saida, f"{etiqueta}.paragens", n, camada.get("esperado_paragens"))

        if camada.get("sequencias"):
            m = _ler_sequencias(feicoes, camada, sequencias)
            contagens[f"camadas.{etiqueta}.sequencias"] = m
            verificar_esperado(
                ctx, saida, f"{etiqueta}.sequencias", m, camada.get("esperado_sequencias")
            )

    destino = ctx.caminho_de_saida(saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps(
            {
                "paragens": list(paragens.values()),
                "sequencias": sequencias,
                "tracados": tracados,
                "localidades": localidades,
                "circuitos": list(circuitos.values()),
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    contagens["camadas.paragens"] = len(paragens)
    contagens["camadas.sequencias"] = len(sequencias)
    contagens["camadas.tracados"] = len(tracados)
    contagens["camadas.localidades"] = len(localidades)
    contagens["camadas.circuitos"] = len(circuitos)
    return Resultado(contagens=contagens, saidas={saida.saida or "": str(destino)})


def _ler_paragens(
    feicoes: list[dict[str, Any]], camada: dict[str, Any], destino: dict[str, dict[str, Any]]
) -> None:
    """As paragens de uma camada, sem repetidas.

    Uma camada de sequências repete a mesma paragem uma vez por viagem que lá
    passa — 23 866 registos para 1 976 paragens. A primeira ocorrência ganha:
    as outras são a mesma linha do mesmo registo.
    """
    campos = camada.get("campos") or {}
    prefixo = camada["prefixo"]
    fonte = camada.get("fonte") or prefixo
    so_manual = bool(camada.get("so_por_decisao_manual"))
    for f in feicoes:
        p = f.get("properties") or {}
        ident = _texto(p.get(campos.get("id", "id")))
        ponto = _ponto(f.get("geometry") or {})
        if not ident or ponto is None:
            continue
        chave = f"{prefixo}:{ident}"
        if chave in destino:
            continue
        lat, lon = ponto
        destino[chave] = {
            "id": chave,
            "nome": _texto(p.get(campos.get("nome", "nome")))
            or _texto(p.get(campos.get("nome_alternativo", ""))),
            "codigo": _texto(p.get(campos.get("codigo", ""))),
            "local": _texto(p.get(campos.get("local", ""))),
            "concelho": _texto(p.get(campos.get("concelho", ""))),
            "lat": lat,
            "lon": lon,
            "fonte": fonte,
            "so_por_decisao_manual": so_manual,
        }


def _ler_sequencias(
    feicoes: list[dict[str, Any]], camada: dict[str, Any], destino: list[dict[str, Any]]
) -> int:
    campos = camada["sequencias"]
    campos_paragem = camada.get("campos") or {}
    prefixo = camada["prefixo"]
    viagens: dict[str, dict[str, Any]] = {}
    for f in feicoes:
        p = f.get("properties") or {}
        viagem = _texto(p.get(campos.get("viagem", "viagem")))
        ident = _texto(p.get(campos_paragem.get("id", "id")))
        if not viagem or not ident:
            continue
        v = viagens.setdefault(
            viagem,
            {
                "viagem": viagem,
                "linha": _texto(p.get(campos.get("linha", ""))),
                "sentido": _texto(p.get(campos.get("sentido", ""))),
                "pontos": [],
            },
        )
        v["pontos"].append(
            {
                "id": f"{prefixo}:{ident}",
                "ordem": int(float(_texto(p.get(campos.get("ordem", "ordem"))) or 0)),
                "hora": _texto(p.get(campos.get("hora", ""))),
                "hora_de_partida": _texto(p.get(campos.get("hora_de_partida", ""))),
                "ponto_de_horario": _texto(p.get(campos.get("ponto_de_horario", ""))) == "1",
            }
        )
    for v in viagens.values():
        v["pontos"].sort(key=lambda x: x["ordem"])
    destino.extend(viagens.values())
    return len(viagens)


def _ler_tracados(
    feicoes: list[dict[str, Any]], camada: dict[str, Any], destino: list[dict[str, Any]]
) -> int:
    campos = camada["tracados"]
    n = 0
    for f in feicoes:
        p = f.get("properties") or {}
        pontos = _linha(f.get("geometry") or {})
        viagem = _texto(p.get(campos.get("viagem", "viagem")))
        if not pontos or not viagem:
            continue
        destino.append(
            {
                "viagem": viagem,
                "linha": _texto(p.get(campos.get("linha", ""))),
                "cor": _texto(p.get(campos.get("cor", ""))),
                "pontos": pontos,
            }
        )
        n += 1
    return n


def _ler_circuitos(
    feicoes: list[dict[str, Any]], camada: dict[str, Any], destino: dict[str, dict[str, Any]]
) -> int:
    """Os serviços de que esta camada é o levantamento, e os dias em que andam.

    Cada registo da camada é uma paragem vista de um circuito: o mesmo poste
    aparece uma vez por circuito que lá passa, e traz consigo o nome do
    circuito, o concelho e uma coluna por dia da semana. Junta-se aqui, uma vez
    por circuito, com as paragens dele pela ordem em que a camada as traz —
    que não é a ordem por que se passa nelas, e por isso não é uma sequência.

    Os dias vêm como palavras («Sim»/«Não»), e qual é a palavra do «sim»
    declara-se na receita: outro portal escreverá outra coisa.
    """
    campos = camada["circuitos"]
    campos_paragem = camada.get("campos") or {}
    prefixo = camada["prefixo"]
    sim = str(campos.get("sim", "Sim")).strip().lower()

    def dias(p: dict[str, Any], colunas: list[str]) -> list[bool]:
        return [_texto(p.get(c)).lower() == sim for c in colunas]

    for f in feicoes:
        p = f.get("properties") or {}
        ident = _texto(p.get(campos.get("id", "id")))
        paragem = _texto(p.get(campos_paragem.get("id", "id")))
        if not ident:
            continue
        c = destino.setdefault(
            ident,
            {
                "id": ident,
                "nome": _texto(p.get(campos.get("nome", ""))),
                "concelho": _texto(p.get(campos.get("concelho", ""))),
                "horario": _texto(p.get(campos.get("horario", ""))),
                "dias_escolar": dias(p, campos.get("dias_escolar") or []),
                "dias_ferias": dias(p, campos.get("dias_ferias") or []),
                "paragens": [],
            },
        )
        chave = f"{prefixo}:{paragem}"
        if paragem and chave not in c["paragens"]:
            c["paragens"].append(chave)
    return len(destino)


def _ler_localidades(
    feicoes: list[dict[str, Any]], camada: dict[str, Any], destino: list[dict[str, Any]]
) -> int:
    campos = camada.get("campos") or {}
    n = 0
    for f in feicoes:
        p = f.get("properties") or {}
        ponto = _ponto(f.get("geometry") or {})
        nome_local = _texto(p.get(campos.get("nome", "nome")))
        if ponto is None or not nome_local:
            continue
        lat, lon = ponto
        destino.append(
            {
                "nome": nome_local,
                "freguesia": _texto(p.get(campos.get("freguesia", ""))),
                "concelho": _texto(p.get(campos.get("concelho", ""))),
                "lat": lat,
                "lon": lon,
            }
        )
        n += 1
    return n
