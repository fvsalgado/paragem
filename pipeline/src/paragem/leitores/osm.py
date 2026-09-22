"""Os leitores de OpenStreetMap: recorte, bicicletas, táxis e rotas.

São todos genéricos — o filtro de etiquetas vem da receita da região, não do
código. Uma região que tenha bicicletas partilhadas declara a marca e o número
que espera; nenhuma linha destas sabe o que é o meioB.

**A atribuição é obrigatória e não é negociável.** O OpenStreetMap é uma base
de dados sob ODbL: tudo o que daqui sai é obra derivada, e leva «©
contribuidores do OpenStreetMap» embutido no próprio ficheiro. Não é uma nota
de rodapé que alguém se lembra de pôr na página — vai no JSON e no GeoJSON,
onde não se perde.

**A armadilha do `network`.** No Médio Tejo, `network=TUT` é dos urbanos de
Torres Novas E dos urbanos de Torres Vedras, que ficam a 130 km. Filtrar por
rede traz autocarros de outra terra para dentro da região, e ninguém dá por
isso porque as linhas têm nomes plausíveis. Filtra-se pelo OPERADOR — e a
receita da região pode dizer `nunca_filtrar_por: network` para que esta função
se recuse a fazê-lo.
"""

from __future__ import annotations

import contextlib
import json
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import osmium

from ..regiao import Saida
from .base import Contexto, Resultado, verificar_esperado

ATRIBUICAO = "© contribuidores do OpenStreetMap"
LICENCA_URL = "https://opendatacommons.org/licenses/odbl/1-0/"


# ---------------------------------------------------------------------------
# recorte
# ---------------------------------------------------------------------------

nome_recorte = "osm-recorte"


def recorte(ctx: Contexto, saida: Saida) -> Resultado:
    """Recorta o extrato de Portugal à caixa da região, com margem.

    Vai pelo `osmium extract` da linha de comandos e não pelo pyosmium, de
    propósito: um recorte tem de ficar REFERENCIALMENTE COMPLETO — cada via
    guardada tem de levar os nós que a compõem, e cada relação os membros que
    a formam. O `osmium extract` sabe fazer isso; reimplementá-lo em Python
    era reescrever uma ferramenta madura para a ter meio feita.
    """
    if not shutil.which("osmium"):
        raise RuntimeError(
            "falta o `osmium` (pacote osmium-tool). É dependência de sistema do recorte de OSM, "
            "como o `pdftotext` é do parser de horários."
        )

    origem = ctx.caminho_da_fonte(saida.fonte)
    destino = ctx.caminho_de_saida(saida)
    destino.parent.mkdir(parents=True, exist_ok=True)

    caixa = ctx.regiao.caixa_de_recorte
    caixa_txt = f"{caixa.lon_min},{caixa.lat_min},{caixa.lon_max},{caixa.lat_max}"

    subprocess.run(
        ["osmium", "extract", "--bbox", caixa_txt, "--overwrite", "-o", str(destino), str(origem)],
        check=True,
        capture_output=True,
    )

    return Resultado(
        contagens={
            "osm.recorte_bytes": destino.stat().st_size,
            "osm.recorte_caixa": caixa_txt,
        },
        saidas={saida.saida or "": str(destino.relative_to(ctx.raiz))},
        notas=[f"Recorte com margem de {ctx.regiao.margem_recorte_graus}°. {ATRIBUICAO}."],
    )


# ---------------------------------------------------------------------------
# recolha de nós por etiquetas
# ---------------------------------------------------------------------------


class _NosEtiquetados(osmium.SimpleHandler):
    """Todos os nós COM ETIQUETAS, e mais nada.

    **O nó sem etiquetas sai antes de se lhe tocar.** Num ficheiro de
    OpenStreetMap a esmagadora maioria dos nós é geometria pura — os pontos
    por onde passa uma estrada — e não têm etiqueta nenhuma. Construir-lhes um
    dicionário para depois o deitar fora era o que custava os minutos.
    """

    def __init__(self) -> None:
        super().__init__()
        self.encontrados: list[tuple[int, float, float, dict[str, str]]] = []

    def node(self, n) -> None:  # noqa: N802 — nome imposto pelo pyosmium
        if not n.tags:
            return
        self.encontrados.append(
            (
                n.id,
                round(n.location.lat, 7),
                round(n.location.lon, 7),
                {t.k: t.v for t in n.tags},
            )
        )


# O ficheiro lê-se UMA VEZ por construção, e não uma vez por leitor.
#
# ISTO CUSTAVA DEZ DOS ONZE MINUTOS DA CONSTRUÇÃO. Medido, leitor a leitor:
#
#     20.3s  osm-recorte     →  osm/regiao.osm.pbf
#    122.4s  osm-bicicletas  →  gbfs/meiob/
#    123.3s  osm-bicicletas  →  gbfs/bue/
#    122.6s  osm-bicicletas  →  gbfs/bute/
#    123.0s  osm-taxis       →  geojson/taxis.geojson
#      4.5s  osm-rotas       →  geojson/tut.geojson
#
# Cinco varrimentos do mesmo ficheiro para tirar 68 estações, mais 10, mais 4,
# mais 9 praças. O `osm-rotas` era rápido porque só olha para relações, que são
# poucas — e foi a comparação com ele que deu com isto.
#
# Cabe em memória porque só entram nós com etiquetas: num recorte regional são
# dezenas de milhares, não milhões.
_NOS_POR_FICHEIRO: dict[str, list[tuple[int, float, float, dict[str, str]]]] = {}

# Acima disto NÃO se guarda: a fonte inteira de um país tem nós etiquetados aos
# milhões, e enchê-los em memória troca dez minutos por uma construção que
# rebenta. Na prática este caminho não acontece — o recorte corre primeiro —,
# mas uma receita sem recorte não pode derrubar a máquina.
_LIMITE_PARA_GUARDAR_BYTES = 200 * 1024 * 1024


def _nos_etiquetados(caminho: Path) -> list[tuple[int, float, float, dict[str, str]]]:
    chave = str(Path(caminho).resolve())
    guardado = _NOS_POR_FICHEIRO.get(chave)
    if guardado is not None:
        return guardado
    h = _NosEtiquetados()
    h.apply_file(chave)
    if Path(caminho).stat().st_size <= _LIMITE_PARA_GUARDAR_BYTES:
        _NOS_POR_FICHEIRO[chave] = h.encontrados
    return h.encontrados


def _nos_com(caminho: Path, filtro: dict[str, str], dentro=None) -> list[dict[str, Any]]:
    """Os nós que batem certo com o filtro, e que estão dentro da região.

    **As etiquetas primeiro, e a região depois.** A pergunta «é da região?» é
    um ponto contra polígonos com dezenas de milhares de vértices; as
    etiquetas cortam quase tudo antes de lá se chegar, porque estações de
    bicicletas e praças de táxi são agulhas no palheiro.

    E a pergunta é sobre a ÁREA DE SERVIÇO e não sobre o recorte. O recorte
    leva margem de propósito, para não cortar linhas na fronteira; mas uma
    praça de táxis a 30 km da região não é da região, e contá-la fazia o
    produto anunciar serviços que não serve. Quem responde é o `ctx.dentro`: a
    geometria dos concelhos quando a região declara limites, a caixa quando
    não. Antes era sempre a caixa, e um retângulo apanha os concelhos do lado
    — eram 19 praças de táxi onde há 9.
    """
    saida: list[dict[str, Any]] = []
    for ident, lat, lon, etiquetas in _nos_etiquetados(caminho):
        if not all(etiquetas.get(k) == v for k, v in filtro.items()):
            continue
        if dentro is not None and not dentro(lat, lon):
            continue
        saida.append({"id": f"n{ident}", "lat": lat, "lon": lon, "etiquetas": etiquetas})
    return sorted(saida, key=lambda x: x["id"])


def _ficheiro(ctx: Contexto, saida: Saida) -> Path:
    """O recorte da região, se já existir; senão, a fonte inteira.

    Varrer os 475 MB de Portugal quatro vezes para tirar 68 estações de
    bicicletas demora minutos e não acrescenta nada: uma estação fora da região
    não pertence à região. Quando o `osm-recorte` já correu — e corre antes
    destes, na receita —, é o recorte que se lê.

    O registo de proveniência continua a ser o da fonte original, que é de onde
    os dados vêm. O recorte é um passo de processamento, não outra fonte.
    """
    recorte = ctx.destino / "osm" / "regiao.osm.pbf"
    if recorte.exists():
        return recorte
    return ctx.caminho_da_fonte(saida.fonte)


# ---------------------------------------------------------------------------
# bicicletas → GBFS estático
# ---------------------------------------------------------------------------

nome_bicicletas = "osm-bicicletas"


def bicicletas(ctx: Contexto, saida: Saida) -> Resultado:
    """Gera GBFS estático: `gbfs.json`, `system_information` e `station_information`.

    **Sem `station_status`, e é de propósito.** A disponibilidade de bicicletas
    em cada estação não é pública, e não a temos. Um `station_status` inventado
    — ou copiado de uma capacidade estática — manda alguém a pé até uma doca
    vazia. O que o produto não sabe, não promete (CLAUDE.md §6.4).
    """
    origem = _ficheiro(ctx, saida)
    filtro = dict(saida.params.get("filtro") or {})
    sistema = dict(saida.params.get("sistema") or {})
    nos = _nos_com(origem, filtro, ctx.dentro)

    pasta = ctx.caminho_de_saida(saida)
    pasta.mkdir(parents=True, exist_ok=True)
    agora = int(datetime.now(UTC).timestamp())
    id_sistema = sistema.get("id", saida.saida or "sistema")

    estacoes = [
        {
            "station_id": n["id"],
            "name": n["etiquetas"].get("name") or f"{sistema.get('nome', '')} {n['id']}".strip(),
            "lat": n["lat"],
            "lon": n["lon"],
            **(
                {"capacity": int(n["etiquetas"]["capacity"])}
                if str(n["etiquetas"].get("capacity", "")).isdigit()
                else {}
            ),
        }
        for n in nos
    ]

    info = {
        "last_updated": agora,
        "ttl": 0,
        "version": "2.3",
        "data": {
            "system_id": id_sistema,
            "language": "pt",
            "name": sistema.get("nome", id_sistema),
            "operator": sistema.get("operador"),
            "timezone": "Europe/Lisbon",
            "license_url": LICENCA_URL,
            "attribution_organization_name": ATRIBUICAO,
        },
    }
    _escrever_json(pasta / "system_information.json", info)
    _escrever_json(
        pasta / "station_information.json",
        {"last_updated": agora, "ttl": 0, "version": "2.3", "data": {"stations": estacoes}},
    )
    # O ficheiro de descoberta anuncia SÓ o que existe. Anunciar
    # `station_status` e servir 404 é pior do que não o anunciar.
    _escrever_json(
        pasta / "gbfs.json",
        {
            "last_updated": agora,
            "ttl": 0,
            "version": "2.3",
            "data": {
                "pt": {
                    "feeds": [
                        {"name": "system_information", "url": "system_information.json"},
                        {"name": "station_information", "url": "station_information.json"},
                    ]
                }
            },
        },
    )

    verificar_esperado(ctx, saida, id_sistema, len(estacoes), saida.params.get("esperado"))

    if saida.params.get("estado") == "por-confirmar":
        ctx.relatorio.lacuna(
            id=f"{id_sistema}.estado",
            o_que=f"O sistema {sistema.get('nome', id_sistema)} está por confirmar",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml",
            porque_importa=(
                str(saida.params.get("estado_nota") or "")
                or "Estações no OpenStreetMap não provam que o serviço esteja a funcionar."
            ),
            o_que_fazer="Confirmar com a câmara e, ou ligar o sistema, ou retirá-lo da região.",
            quantos=len(estacoes),
        )

    return Resultado(
        contagens={f"gbfs.{id_sistema}.estacoes": len(estacoes)},
        saidas={saida.saida or "": str(pasta.relative_to(ctx.raiz))},
        notas=[f"{ATRIBUICAO}. Sem station_status: a disponibilidade não é pública."],
    )


# ---------------------------------------------------------------------------
# táxis → GeoJSON
# ---------------------------------------------------------------------------

nome_taxis = "osm-taxis"


def taxis(ctx: Contexto, saida: Saida) -> Resultado:
    origem = _ficheiro(ctx, saida)
    nos = _nos_com(origem, dict(saida.params.get("filtro") or {"amenity": "taxi"}), ctx.dentro)

    destino = ctx.caminho_de_saida(saida)
    _escrever_geojson(
        destino,
        [
            {
                "type": "Feature",
                "id": n["id"],
                "geometry": {"type": "Point", "coordinates": [n["lon"], n["lat"]]},
                "properties": {
                    "nome": n["etiquetas"].get("name"),
                    "operador": n["etiquetas"].get("operator"),
                    "telefone": n["etiquetas"].get("phone"),
                    "lugares": n["etiquetas"].get("capacity"),
                },
            }
            for n in nos
        ],
    )

    verificar_esperado(ctx, saida, "taxis", len(nos), saida.params.get("esperado"))

    if saida.params.get("incompleto"):
        ctx.relatorio.lacuna(
            id="taxis.incompleto",
            o_que="O levantamento de praças de táxi está incompleto",
            onde=str(destino.relative_to(ctx.raiz)),
            porque_importa=(
                str(saida.params.get("incompleto_nota") or "")
                or "O OpenStreetMap tem o que alguém mapeou, e ninguém mapeou as praças todas."
            ),
            o_que_fazer="Levantamento por concelho, com as câmaras, que são quem licencia.",
            quantos=len(nos),
        )

    return Resultado(
        contagens={"taxis.pracas": len(nos)},
        saidas={saida.saida or "": str(destino.relative_to(ctx.raiz))},
        notas=[ATRIBUICAO],
    )


# ---------------------------------------------------------------------------
# rotas → GeoJSON
# ---------------------------------------------------------------------------

nome_rotas = "osm-rotas"


class _Relacoes(osmium.SimpleHandler):
    def __init__(self, filtro: dict[str, str]) -> None:
        super().__init__()
        self.filtro = filtro
        self.rotas: list[dict[str, Any]] = []

    def relation(self, r) -> None:  # noqa: N802 — nome imposto pelo pyosmium
        etiquetas = {t.k: t.v for t in r.tags}
        if not all(etiquetas.get(k) == v for k, v in self.filtro.items()):
            return
        self.rotas.append(
            {
                "id": f"r{r.id}",
                "etiquetas": etiquetas,
                "vias": [m.ref for m in r.members if m.type == "w"],
            }
        )


class _Vias(osmium.SimpleHandler):
    def __init__(self, precisas: set[int]) -> None:
        super().__init__()
        self.precisas = precisas
        self.geometria: dict[int, list[list[float]]] = {}

    def way(self, w) -> None:  # noqa: N802 — nome imposto pelo pyosmium
        if w.id not in self.precisas:
            return
        # Uma via cujos nós ficaram fora do recorte fica de fora inteira, e o
        # relatório conta-a. Não se desenha meia via: parece que o autocarro
        # acaba ali.
        with contextlib.suppress(osmium.InvalidLocationError):
            self.geometria[w.id] = [
                [round(n.location.lon, 7), round(n.location.lat, 7)] for n in w.nodes
            ]


def rotas(ctx: Contexto, saida: Saida) -> Resultado:
    origem = _ficheiro(ctx, saida)
    filtro = dict(saida.params.get("filtro") or {})

    proibido = saida.params.get("nunca_filtrar_por")
    if proibido and proibido in filtro:
        raise ValueError(
            f"a receita de {ctx.regiao.id} filtra rotas por `{proibido}` e declara que nunca o "
            f"deve fazer. No Médio Tejo, `network=TUT` também é dos urbanos de Torres Vedras: um "
            f"filtro por rede traz autocarros de outra terra. Filtra por `operator`."
        )

    hr = _Relacoes(filtro)
    hr.apply_file(str(origem))

    precisas = {w for rota in hr.rotas for w in rota["vias"]}
    hv = _Vias(precisas)
    hv.apply_file(str(origem), locations=True)

    feicoes = []
    sem_geometria: list[str] = []
    for rota in sorted(hr.rotas, key=lambda x: x["id"]):
        troços = [hv.geometria[w] for w in rota["vias"] if hv.geometria.get(w)]
        e = rota["etiquetas"]
        if not troços:
            sem_geometria.append(f"{rota['id']} {e.get('name') or e.get('ref') or ''}".strip())
            continue
        feicoes.append(
            {
                "type": "Feature",
                "id": rota["id"],
                "geometry": {"type": "MultiLineString", "coordinates": troços},
                "properties": {
                    "ref": e.get("ref"),
                    "nome": e.get("name"),
                    "operador": e.get("operator"),
                    "rede": e.get("network"),
                    "cor": e.get("colour"),
                },
            }
        )

    destino = ctx.caminho_de_saida(saida)
    _escrever_geojson(destino, feicoes)

    verificar_esperado(ctx, saida, "rotas", len(feicoes), saida.params.get("esperado_linhas"))

    if sem_geometria:
        ctx.relatorio.lacuna(
            id=f"{saida.saida}.sem-geometria",
            o_que="Rotas encontradas sem geometria utilizável",
            onde=str(destino.relative_to(ctx.raiz)),
            porque_importa=(
                "As vias da relação ficaram fora do recorte, ou a relação não tem vias. Meia "
                "linha desenhada é pior do que nenhuma: parece que o autocarro acaba ali."
            ),
            o_que_fazer="Alargar a margem do recorte, ou corrigir a relação no OpenStreetMap.",
            quantos=len(sem_geometria),
            quais=sem_geometria,
        )

    return Resultado(
        contagens={f"rotas.{saida.saida}": len(feicoes)},
        saidas={saida.saida or "": str(destino.relative_to(ctx.raiz))},
        notas=[ATRIBUICAO],
    )


# ---------------------------------------------------------------------------


def _escrever_json(caminho: Path, dados: Any) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write("\n")


def _escrever_geojson(caminho: Path, feicoes: list[dict[str, Any]]) -> None:
    _escrever_json(
        caminho,
        {
            "type": "FeatureCollection",
            "attribution": ATRIBUICAO,
            "license": LICENCA_URL,
            "features": feicoes,
        },
    )


# ---------------------------------------------------------------------------
# pontos com nome onde um autocarro para
# ---------------------------------------------------------------------------

# As três etiquetas com que o OpenStreetMap marca um sítio onde um autocarro
# para. São três porque o esquema mudou e as três continuam em uso ao mesmo
# tempo: o `highway=bus_stop` de sempre, e o par `platform`/`stop_position` do
# esquema de transporte público. Quem mapeia usa a que aprendeu, e aceitar só
# uma delas deixa de fora paragens que estão lá.
_ETIQUETAS_DE_PARAGEM = (
    ("highway", "bus_stop"),
    ("public_transport", "platform"),
    ("public_transport", "stop_position"),
)


class _NosDeRelacoes(osmium.SimpleHandler):
    """Os nós que são MEMBROS de uma relação de percurso."""

    def __init__(self, filtro: dict[str, str]) -> None:
        super().__init__()
        self.filtro = filtro
        self.nos: set[int] = set()

    def relation(self, r) -> None:  # noqa: N802 — nome imposto pelo pyosmium
        etiquetas = {t.k: t.v for t in r.tags}
        if not all(etiquetas.get(k) == v for k, v in self.filtro.items()):
            return
        self.nos.update(m.ref for m in r.members if m.type == "n")


# As duas etiquetas que marcam o SÍTIO onde se espera o autocarro. O
# `stop_position` fica de fora aqui de propósito: marca o ponto da via onde o
# veículo encosta, a dez metros do passeio, e para «onde fica esta paragem?» a
# plataforma é a resposta certa.
_ETIQUETAS_DE_PLATAFORMA = (
    ("highway", "bus_stop"),
    ("public_transport", "platform"),
)


def paragens_com_nome(caminho: Path) -> list[tuple[str, float, float]]:
    """Os sítios com nome onde um autocarro para: `(nome, lat, lon)`.

    Candidatas, e só isso. Que uma delas seja a paragem que um horário nomeia
    é decisão de quem resolve, não deste leitor.
    """
    pontos: list[tuple[str, float, float]] = []
    for _, lat, lon, etiquetas in _nos_etiquetados(caminho):
        nome = (etiquetas.get("name") or "").strip()
        if not nome:
            continue
        if any(etiquetas.get(k) == v for k, v in _ETIQUETAS_DE_PLATAFORMA):
            pontos.append((nome, lat, lon))
    return pontos


def paragens_e_percursos(
    caminho: Path, filtro: dict[str, str] | None = None
) -> list[tuple[str, float, float, str]]:
    """Os pontos com nome onde um autocarro para, e de onde vieram.

    Serve para responder à pergunta «onde fica a paragem que este cartaz
    chama assim?» — ver `urbanos.py`. Aqui só se recolhe e se DECLARA a
    proveniência; quem consome é que decide o que vale mais.

    Duas proveniências, e a diferença entre elas não é cosmética:

    - **`osm-percurso`** — o nó é membro de uma relação de percurso. Alguém
      seguiu a linha e disse «esta paragem é desta carreira». É a prova mais
      forte que há sem pedir nada a ninguém, e é a única que liga um nome a
      uma LINHA e não só a um sítio.
    - **`osm-paragem`** — o nó tem etiqueta de paragem e tem nome. Diz onde
      fica; não diz que alguma carreira ali pare.

    O mesmo nó pode sair nas duas: é o consumidor que prefere a primeira.
    """
    membros = _NosDeRelacoes(dict(filtro or {"type": "route", "route": "bus"}))
    membros.apply_file(str(caminho))

    pontos: list[tuple[str, float, float, str]] = []
    for ident, lat, lon, etiquetas in _nos_etiquetados(caminho):
        nome = (etiquetas.get("name") or "").strip()
        if not nome:
            continue
        if ident in membros.nos:
            pontos.append((nome, lat, lon, "osm-percurso"))
        if any(etiquetas.get(k) == v for k, v in _ETIQUETAS_DE_PARAGEM):
            pontos.append((nome, lat, lon, "osm-paragem"))
    return pontos
