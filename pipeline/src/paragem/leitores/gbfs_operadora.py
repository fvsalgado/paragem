"""`gbfs-operadora` — as estações de bicicletas, ditas pelo próprio sistema.

O `osm-bicicletas` tira-as do OpenStreetMap, e o OpenStreetMap é bom nisto:
das 77 estações que o sítio do meioB lista, 77 estão no mapa a menos de 60 m.
O que o mapa NÃO tem é o nome que o sistema lhes dá. Escreve «Bicicletas meioB
- Estação Ferroviária» — uma etiqueta de mapa —, e o sistema escreve «Tomar -
Estação Ferroviária», que é o que está no poste e o que a pessoa procura.

Por isso este leitor existe, e por isso NÃO substitui o outro: corre a seguir,
lê a lista da operadora e CONFRONTA-A com a do mapa. Uma estação que só um dos
dois conheça é uma lacuna nomeada, não uma escolha silenciosa — pode ter
aberto, pode ter fechado, e nenhuma das duas fontes sabe qual.

**Com mapa declarado, o nome é da operadora e a posição é do mapa.** Cada um
dá o que sabe melhor, e é isso que a receita escreve ao declarar a licença: as
coordenadas vêm do OpenStreetMap, e por isso o conjunto é ODbL. Este leitor
escrevia as da página da operadora — que ninguém nos licenciou — num ficheiro
rotulado ODbL, e o rótulo afirmava uma origem que o ficheiro não tinha. Uma
estação que só a operadora conheça fica de fora do ficheiro até entrar no mapa:
a posição dela não é nossa para distribuir, e a lacuna diz qual é.

**Disponibilidade, não.** Nem bicicletas nem docas livres. A página do sistema
não a tem em lado nenhum (o mapa dela é Leaflet com marcadores gerados no
servidor), não há `gbfs.json`, e o sistema não consta do catálogo público da
MobilityData. A única fonte viva é a app do operador — uma API privada de um
fornecedor privado, que o CLAUDE.md §4.2 proíbe. O `station_status` continua a
não sair daqui, e a interface continua a não prometer o que não sabe (§6.4).

O que isto destrava é um PEDIDO, e está escrito na lacuna: o sistema é da
autoridade de transportes e a operação é contratada. Publicar GBFS completo é
uma cláusula, e os dados já existem — a app mostra-os.
"""

from __future__ import annotations

import email
import json
import math
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..regiao import Saida
from .base import Contexto, Resultado, verificar_esperado

nome = "gbfs-operadora"

# Até onde é que duas estações são «a mesma» ao confrontar duas fontes. Sessenta
# metros: uma estação de bicicletas ocupa poucos metros, e a diferença entre
# «marcada no passeio» e «marcada na rotunda ao lado» cabe nisto. Acima disto,
# são duas.
RAIO_DE_CONFRONTO_M = 60.0

# A marcação que o sítio do sistema usa para cada estação. É HTML gerado no
# servidor, sempre com os quatro campos pela mesma ordem — e é por isso que se
# lê com uma expressão e não com um analisador de HTML inteiro: o que se quer é
# falhar barulhentamente se a página mudar de forma, não adivinhar.
_ESTACAO = re.compile(
    r'<div class="station[^"]*">\s*'
    r'<div class="station__name">(?P<nome>.*?)</div>\s*'
    r'<div class="station__lat">(?P<lat>[-\d.]+)</div>\s*'
    r'<div class="station__lon">(?P<lon>[-\d.]+)</div>\s*'
    r'<div class="station__city">(?P<cidade>.*?)</div>',
    re.S,
)


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    p = saida.params
    estacoes = _do_instantaneo(ctx.caminho_da_fonte(saida.fonte))

    # O sítio lista os dois sistemas na mesma página e distingue-os pelo campo
    # «cidade»: o BUE é do Entroncamento e aparece com a cidade «BUE». Uma
    # região que sirva mais sistemas declara o seu filtro aqui.
    so = p.get("cidades")
    excepto = p.get("excepto_cidades")
    if so:
        estacoes = [e for e in estacoes if e["cidade"] in so]
    if excepto:
        estacoes = [e for e in estacoes if e["cidade"] not in excepto]

    sistema = dict(p.get("sistema") or {})
    id_sistema = sistema.get("id", saida.saida or "sistema")
    if not estacoes:
        raise ValueError(
            f"{saida.fonte}: nenhuma estação no instantâneo para {id_sistema}. "
            "Ou o filtro está errado, ou a página mudou de forma."
        )

    # Com o mapa declarado, o que se publica é o nome da operadora na posição
    # do mapa — ver o cimo deste ficheiro. Sem ele, fica tudo como a página diz,
    # e a licença que a receita declarar tem de o saber.
    outra = p.get("confrontar_com")
    mapa = _do_mapa(ctx, saida, outra) if outra else None
    casamento = _casar(estacoes, mapa) if mapa is not None else None
    publicadas = (
        _nas_posicoes_do_mapa(estacoes, mapa, casamento)
        if mapa is not None and casamento is not None
        else estacoes
    )

    pasta = ctx.caminho_de_saida(saida)
    pasta.mkdir(parents=True, exist_ok=True)
    _escrever(pasta, id_sistema, sistema, publicadas, p)

    if mapa is not None and casamento is not None:
        _confrontar(ctx, id_sistema, estacoes, mapa, casamento)
    _pedir_disponibilidade(ctx, saida, id_sistema, sistema, len(publicadas))
    # O esperado é da página, que é um instantâneo e não muda sozinho; o que
    # sai publicado depende também do mapa, que muda todos os dias (§8).
    verificar_esperado(ctx, saida, id_sistema, len(estacoes), p.get("esperado"))

    posicoes = "as posições do mapa" if mapa is not None else "as posições da operadora"
    return Resultado(
        contagens={f"gbfs.{id_sistema}.estacoes": len(publicadas)},
        saidas={saida.saida or "": str(pasta.relative_to(ctx.raiz))},
        notas=[
            f"{id_sistema}: {len(publicadas)} estações com os nomes da operadora e "
            f"{posicoes}. Sem station_status: a disponibilidade não é pública."
        ],
    )


# ---------------------------------------------------------------------------
# ler o papel
# ---------------------------------------------------------------------------


def _do_instantaneo(caminho: Path) -> list[dict[str, Any]]:
    """As estações do instantâneo MHTML da página do sistema."""
    html = _html(caminho)
    fora = []
    for m in _ESTACAO.finditer(html):
        try:
            lat, lon = float(m.group("lat")), float(m.group("lon"))
        except ValueError:  # pragma: no cover — a expressão já exige dígitos
            continue
        fora.append(
            {
                "nome": _texto(m.group("nome")),
                "lat": lat,
                "lon": lon,
                "cidade": _texto(m.group("cidade")),
            }
        )
    return fora


def _html(caminho: Path) -> str:
    """O documento principal de um `.mht`, ou o ficheiro se já for HTML."""
    cru = caminho.read_bytes()
    if not cru.lstrip().lower().startswith(b"from:"):
        return cru.decode("utf-8", "replace")
    msg = email.message_from_bytes(cru)
    for parte in msg.walk():
        if parte.get_content_type() == "text/html":
            corpo = parte.get_payload(decode=True)
            if isinstance(corpo, bytes):
                return corpo.decode("utf-8", "replace")
    raise ValueError(f"{caminho}: o instantâneo não tem documento HTML")


def _texto(s: str) -> str:
    import html as _html_mod

    return _html_mod.unescape(re.sub(r"<[^>]+>", "", s)).strip()


# ---------------------------------------------------------------------------
# escrever o GBFS
# ---------------------------------------------------------------------------


def _escrever(
    pasta: Path,
    id_sistema: str,
    sistema: dict[str, Any],
    estacoes: list[dict[str, Any]],
    p: dict[str, Any],
) -> None:
    agora = int(datetime.now(UTC).timestamp())
    # O `station_id` vem do NOME, e não de um número de ordem: um número de
    # ordem muda quando a página ganha uma estação a meio, e os identificadores
    # de todas as outras mudavam com ele. Quem guardou uma ligação para uma
    # estação continua a chegar lá.
    linhas = [
        {
            "station_id": _chave(e["nome"]),
            "name": e["nome"],
            "lat": round(e["lat"], 6),
            "lon": round(e["lon"], 6),
        }
        for e in estacoes
    ]
    _json(
        pasta / "system_information.json",
        {
            "last_updated": agora,
            "ttl": 0,
            "version": "2.3",
            "data": {
                "system_id": id_sistema,
                "language": "pt",
                "name": sistema.get("nome", id_sistema),
                "operator": sistema.get("operador"),
                "timezone": "Europe/Lisbon",
                **({"url": p["url"]} if p.get("url") else {}),
                "attribution_organization_name": sistema.get("operador") or "",
            },
        },
    )
    _json(
        pasta / "station_information.json",
        {"last_updated": agora, "ttl": 0, "version": "2.3", "data": {"stations": linhas}},
    )
    # O ficheiro de descoberta anuncia SÓ o que existe. Anunciar
    # `station_status` e servir 404 é pior do que não o anunciar.
    _json(
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


def _chave(s: str) -> str:
    import unicodedata

    d = unicodedata.normalize("NFD", s.casefold())
    d = "".join(c for c in d if unicodedata.category(c) != "Mn")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", d)).strip("-")


def _json(caminho: Path, dados: Any) -> None:
    caminho.write_text(
        json.dumps(dados, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# confrontar com o mapa
# ---------------------------------------------------------------------------


def _metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0])))


def _do_mapa(ctx: Contexto, saida: Saida, outra: str) -> list[dict[str, Any]]:
    """As estações do GBFS que a receita declara como o mapa deste sistema.

    Tem de existir. Antes, um mapa em falta calava o confronto e mais nada;
    agora é dele que vêm as posições, e sem ele sairiam as da operadora num
    ficheiro cuja licença diz que são do mapa.
    """
    caminho = ctx.caminho_de_saida(saida).parent.parent / outra.strip("/")
    ficheiro = caminho / "station_information.json"
    if not ficheiro.exists():
        raise ValueError(
            f"{saida.fonte} → {saida.saida}: declara `confrontar_com: {outra}` e esse GBFS "
            "não foi construído. A saída do mapa tem de vir antes desta na receita."
        )
    estacoes: list[dict[str, Any]] = json.loads(ficheiro.read_text(encoding="utf-8"))["data"][
        "stations"
    ]
    return estacoes


def _casar(estacoes: list[dict[str, Any]], mapa: list[dict[str, Any]]) -> list[int | None]:
    """Para cada estação da operadora, a do mapa que é a mesma — ou `None`.

    A mais perto, se estiver a menos de `RAIO_DE_CONFRONTO_M` e nenhuma outra a
    tiver levado antes, pela ordem da página. Duas da operadora que caiam na
    mesma do mapa não passam a ser uma estação só.
    """
    casadas: set[int] = set()
    casamento: list[int | None] = []
    for e in estacoes:
        perto = [
            (_metros((e["lat"], e["lon"]), (o["lat"], o["lon"])), i) for i, o in enumerate(mapa)
        ]
        d, i = min(perto) if perto else (float("inf"), -1)
        if d <= RAIO_DE_CONFRONTO_M and i not in casadas:
            casadas.add(i)
            casamento.append(i)
        else:
            casamento.append(None)
    return casamento


def _nas_posicoes_do_mapa(
    estacoes: list[dict[str, Any]],
    mapa: list[dict[str, Any]],
    casamento: list[int | None],
) -> list[dict[str, Any]]:
    """As da operadora que o mapa conhece: o nome delas, a posição dele."""
    return [
        {**e, "lat": float(mapa[i]["lat"]), "lon": float(mapa[i]["lon"])}
        for e, i in zip(estacoes, casamento, strict=True)
        if i is not None
    ]


def _confrontar(
    ctx: Contexto,
    id_sistema: str,
    estacoes: list[dict[str, Any]],
    mapa: list[dict[str, Any]],
    casamento: list[int | None],
) -> None:
    """Duas fontes para a mesma rede, e o que só uma delas conhece.

    Não decide qual está certa — não há como. Uma estação nova ainda não
    mapeada e uma estação fechada que ninguém apagou do mapa são
    indistinguíveis daqui. O que se faz é NOMEÁ-LA, para quem conhece o
    terreno poder dizer qual é.
    """
    so_na_operadora = [
        f"{e['nome']} ({e['cidade']})"
        for e, i in zip(estacoes, casamento, strict=True)
        if i is None
    ]
    casadas = {i for i in casamento if i is not None}
    so_no_mapa = [o["name"] for i, o in enumerate(mapa) if i not in casadas]

    if not so_na_operadora and not so_no_mapa:
        return
    ctx.relatorio.lacuna(
        id=f"gbfs.{id_sistema}.divergencia",
        o_que=f"Estações de {id_sistema} que só uma das duas fontes conhece",
        onde=f"regioes/{ctx.regiao.id}/fontes.yaml",
        porque_importa=(
            "A lista da operadora e o OpenStreetMap concordam em quase tudo — e onde "
            "não concordam, não há como saber daqui qual tem razão: uma estação nova "
            "ainda não mapeada e uma estação fechada que ninguém apagou do mapa são a "
            "mesma coisa vista de longe. Escolher uma em silêncio era mandar alguém a "
            "um sítio onde talvez não haja bicicletas. As que só a operadora conhece "
            "ficam FORA do ficheiro publicado: a posição que ele publica é a do mapa, "
            "e para essas o mapa não tem nenhuma."
        ),
        o_que_fazer=(
            "Confirmar no terreno ou com a operadora. As que só a operadora tem entram "
            "no OpenStreetMap — e na construção seguinte entram no ficheiro; as que só "
            "o mapa tem, ou se apagam ou se percebe porque é que a operadora não as lista."
        ),
        quantos=len(so_na_operadora) + len(so_no_mapa),
        quais=[f"só a operadora (fica de fora): {x}" for x in so_na_operadora]
        + [f"só o mapa: {x}" for x in so_no_mapa],
    )


def _pedir_disponibilidade(
    ctx: Contexto, saida: Saida, id_sistema: str, sistema: dict[str, Any], quantas: int
) -> None:
    """A lacuna que vale mais do que todas as outras deste modo.

    Está aqui, e não num comentário, porque é um PEDIDO que alguém tem de
    fazer — e um pedido que não aparece no relatório é um pedido que não se
    faz.
    """
    if saida.params.get("disponibilidade_publica"):
        return
    ctx.relatorio.lacuna(
        id=f"gbfs.{id_sistema}.disponibilidade",
        o_que=f"O {sistema.get('nome', id_sistema)} não publica um feed de disponibilidade próprio",
        onde=f"regioes/{ctx.regiao.id}/fontes.yaml",
        porque_importa=(
            "As bicicletas e as docas livres JÁ SE MOSTRAM na interface, lidas da "
            "página que o próprio sistema publica (o serviço em `disponibilidade/` "
            "faz essa leitura e serve-a como GBFS `station_status`, com a hora). Mas "
            "isso é ler o HTML de uma página desenhada para pessoas: muda de forma "
            "sem aviso e parte-se calada. O sistema não serve `gbfs.json` nem consta "
            "do catálogo público da MobilityData — onde hoje há sete sistemas "
            "portugueses e nenhum destes."
        ),
        o_que_fazer=(
            "O sistema é da autoridade de transportes e a operação é contratada: "
            "publicar um GBFS completo — com `station_status` — é uma cláusula, e os "
            "dados já existem, porque a app e a página os mostram. Feito isso, a "
            "leitura da página deixa de ser precisa e o sistema entra no catálogo da "
            "MobilityData. Entretanto, a interface mostra as contagens com a hora e "
            "avisa que o operador pode falhar (§6.4)."
        ),
        quantos=quantas,
    )
