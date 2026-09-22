"""`stepp-servicos` — o que um operador declarou ao regulador, lido como horário.

O STePP é o registo do IMT onde cada operador rodoviário deposita os serviços
que está autorizado a fazer. Até aqui usávamo-lo só para coordenadas em falta.
Tem mais do que isso, e a diferença é grande:

- `paragens` — a sequência de paragens de cada sentido, com coordenadas;
- `segmentos` — o tempo que o operador DECLARA em cada troço, em minutos;
- `circulacoes` — a hora de saída da origem, com o código de dias e o período;
- `servicos` — quem opera, sob que autoridade, com que lotação e acessibilidade.

Somar os tempos declarados à hora de saída dá a hora em cada paragem. Isso não
é interpolação nossa nem é adivinhar: são os números que a operadora depositou
no regulador, com a aritmética que eles pedem. O que se perde é a precisão ao
segundo — e é por isso que só a primeira paragem sai com `timepoint=1`.

**PARA QUE SERVE, e não era o que se esperava.** Serve para mostrar os
autocarros de operadores que não são o da concessão da região e que entram
nela. Uma região é uma autoridade de transportes (CLAUDE.md §11.3) e a
fronteira dela não é a fronteira de quem lá circula: há concessões vizinhas
cujas carreiras atravessam o território todos os dias e que, sem isto, não
existem no sítio — não porque falte o dado, mas porque ninguém foi vê-lo.

**O RECORTE, e a regra do §2.** Entra o serviço que tenha pelo menos uma
paragem dentro da região, e entra INTEIRO. Cortar na fronteira esconderia o
destino a quem embarca cá, que é a razão pela qual se apanha o autocarro.

**O QUE ISTO NÃO É.** Não é o horário publicado pela operadora: é o que ela
declarou ao regulador, na edição que a exportação trouxer. Pode estar
desatualizado, e o sítio tem de dizer de onde vem e de quando é. A `licenca`
da fonte continua `por-confirmar` e a publicação dos ficheiros é Fase 5.

**O QUE NEM TODOS OS OPERADORES DÃO, e é por onde isto falha.** O campo
`frequencia` devia trazer um código (`A-U`, `E-2356`) e há operadores que
trazem prosa livre — «Dias Uteis (periodos escolares)», com gralhas e com
duzentas redações para a mesma coisa. Nesses casos o calendário não se
resolve, e a máscara de dias que vem ao lado (`tipo_frequencia`) não salva:
medida contra a prosa na exportação de 21/09/2026, **discorda dela** — «Dias
úteis (periodo nao escolar)» traz a máscara de sábado. Com as duas fontes a
discordar, datar era adivinhar, e o §4.4 não o permite.

O leitor não tenta: deixa cair as viagens desses códigos e escreve a lacuna
com os códigos listados. Quem tiver a legenda do operador transcreve-a no
`calendario.yaml` da região, como já está feito para os outros — e aí as
viagens entram sem tocar neste ficheiro.
"""

from __future__ import annotations

import collections
import html
import math
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from ..calendario import Calendario
from ..gtfs import Gtfs
from ..regiao import Saida
from .base import Contexto, Resultado, verificar_esperado

nome = "stepp-servicos"

# O mesmo horizonte do leitor do horário da operadora: um ano. Projetar mais
# longe é escrever datas para um calendário escolar que ainda não existe.
JANELA_DIAS = 365

# O STePP exporta em Web Mercator. Tudo o resto no pipeline está em graus.
CRS_STEPP = "EPSG:3857"
CRS_GRAUS = "EPSG:4326"

# Ida e Volta são os dois sentidos do STePP; o GTFS quer 0 e 1.
SENTIDOS = {"Ida": ("1", "0"), "Volta": ("2", "1")}

# O CRUZAMENTO VIAGEM A VIAGEM, e os três números que o afinam. Medidos: com
# quatro paragens comuns e 60 % das horas a bater, 863 viagens dão nove pares;
# baixar para duas paragens dá centenas, que é o ruído de quem se cruza num
# terminal. Três minutos é a folga de um horário arredondado ao minuto.
MINIMO_DE_PARAGENS_COMUNS = 4
FRACAO_QUE_BATE = 0.6
TOLERANCIA_MINUTOS = 3


@dataclass(frozen=True)
class Paragem:
    codigo: str
    nome: str
    lat: float
    lon: float

    @property
    def chave(self) -> str:
        """O que identifica esta paragem dentro do operador.

        **O `codigo` do registo NÃO serve sempre.** Num operador vem
        preenchido e é perfeito — medido: 4 344 códigos, nenhum com dois nomes,
        dispersão máxima de 0,0 m. Noutro vem VAZIO em todas as paragens: 197
        registos, um só código, 63 designações diferentes.

        Com a chave a colapsar, o feed sai com duas paragens onde há sessenta e
        três, todas as viagens a começar e a acabar no mesmo sítio — e passa no
        validador, porque um feed pequeno é estruturalmente válido. Foi assim
        que saiu à primeira, e o `_conferir_paragens` existe para que não volte
        a sair em silêncio.

        Sem código, a identidade é o sítio mais o nome: dois registos no mesmo
        ponto com o mesmo nome são a mesma paragem, e é tudo o que se pode
        afirmar sem inventar.
        """
        if self.codigo.strip():
            return self.codigo.strip()
        return f"{self.lat:.5f},{self.lon:.5f},{_chave(self.nome)}"


def _abrir(caminho: Path) -> str:
    """O caminho que o GDAL entende, sem descomprimir nada.

    A exportação chega num zip com o `.gdb` lá dentro. O GDAL lê zips por
    dentro (`/vsizip/`), e isso poupa 21 MB de disco e alguns segundos em
    cada construção. Uma pasta `.gdb` já aberta também serve.
    """
    if caminho.is_dir():
        return str(caminho)
    import zipfile

    with zipfile.ZipFile(caminho) as z:
        dentro = sorted({n.split(".gdb/")[0] + ".gdb" for n in z.namelist() if ".gdb/" in n})
    if not dentro:
        raise ValueError(f"{caminho.name} não tem nenhuma `.gdb` lá dentro.")
    return f"/vsizip/{caminho}/{dentro[0]}"


def _camada(fonte: str, camada: str, colunas: list[str], *, geometria: bool = False):
    """Uma camada da geodatabase, como colunas de `numpy`.

    `pyogrio.raw.read` e não `read_arrow`: a segunda exige `pyarrow`, que são
    mais 100 MB de dependência para ler quatro tabelas.
    """
    from pyogrio.raw import read

    meta, _, geom, campos = read(fonte, layer=camada, read_geometry=geometria, columns=colunas)
    d: dict[str, Any] = {str(n): campos[i] for i, n in enumerate(meta["fields"])}
    return d, geom


def _graus(geom) -> tuple[list[float], list[float]]:
    import shapely
    from pyproj import Transformer

    pontos = shapely.from_wkb(list(geom))
    tr = Transformer.from_crs(CRS_STEPP, CRS_GRAUS, always_xy=True)
    lons, lats = tr.transform([p.x for p in pontos], [p.y for p in pontos])
    return [float(x) for x in lats], [float(y) for y in lons]


def paragens_do_registo(caminho: Path) -> list[tuple[str, str, float, float, str]]:
    """As paragens de uma exportação, todas: `(codigo, designacao, lat, lon, local)`.

    Sem filtrar por operador e sem as agrupar por serviço — é outra pergunta.
    Aqui o registo serve de LEVANTAMENTO: dá coordenadas e designações a
    sítios que outra fonte nomeia sem situar.

    A mesma paragem aparece uma vez por sentido que a serve; quem consome
    junta-as pelo identificador, que leva o código e o ponto.
    """
    fonte = _abrir(caminho)
    pg, geom = _camada(fonte, "paragens", ["codigo", "designacao", "localidade"], geometria=True)
    lats, lons = _graus(geom)
    saida: list[tuple[str, str, float, float, str]] = []
    vistos: set[tuple[str, float, float]] = set()
    for i in range(len(pg["codigo"])):
        codigo = str(pg["codigo"][i]).strip()
        chave = (codigo, round(lats[i], 5), round(lons[i], 5))
        if chave in vistos:
            continue
        vistos.add(chave)
        saida.append(
            (
                codigo,
                str(pg["designacao"][i]).strip(),
                lats[i],
                lons[i],
                str(pg["localidade"][i]).strip(),
            )
        )
    return saida


def _minutos(hora: Any) -> int | None:
    partes = str(hora or "").split(":")
    if len(partes) < 2 or not partes[0].strip().isdigit():
        return None
    return int(partes[0]) * 60 + int(partes[1])


def _hhmmss(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}:00"


@dataclass
class Referencia:
    """O feed com que este se compara: paragens, números de carreira, viagens.

    Andava tudo solto em quatro argumentos, e três deles só existiam quando o
    quarto existia. Junto, há um sítio para perguntar «há referência?» e a
    assinatura do escritor volta a caber numa linha.
    """

    feed: Gtfs
    conhecidas: Conhecidas
    codigos: set[str]
    raio: float = 100.0


@dataclass(frozen=True)
class Conhecidas:
    """As paragens de um feed já construído, prontas a reconhecer as mesmas.

    MEDIDO antes de se escolher o raio, sobre 1 207 paragens de uma concessão
    vizinha contra as 4 673 da própria rede: abaixo de 100 m há 468 pares e o
    nome bate nos 468, sem uma exceção. Entre 100 e 200 m há 12 pares e o nome
    bate num. Acima de 200, em nenhum.

    Por isso a regra é 100 m E o mesmo nome, e não uma das duas. Aos 100 m as
    duas condições dizem o mesmo, o que quer dizer que a segunda não custa
    nada hoje — e é a que apanha o dia em que a exportação mudar de forma e as
    duas deixarem de concordar.
    """

    pontos: list[tuple[float, float, str, str, dict[str, str]]]
    grelha: dict[tuple[float, float], list[int]]

    @classmethod
    def de(cls, feed: Gtfs) -> Conhecidas:
        pontos: list[tuple[float, float, str, str, dict[str, str]]] = []
        grelha: dict[tuple[float, float], list[int]] = collections.defaultdict(list)
        for s in feed.stops:
            try:
                lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
            except (KeyError, ValueError):
                continue
            pontos.append((lat, lon, str(s["stop_id"]), _chave(s.get("stop_name", "")), dict(s)))
            grelha[(round(lat, 2), round(lon, 2))].append(len(pontos) - 1)
        return cls(pontos, dict(grelha))

    def mesma(self, par: Paragem, raio: float):
        """A paragem já conhecida que É esta, ou `None`."""
        alvo = _chave(par.nome)
        melhor, dm = None, raio
        for dla in (-0.01, 0.0, 0.01):
            for dlo in (-0.01, 0.0, 0.01):
                for i in self.grelha.get((round(par.lat + dla, 2), round(par.lon + dlo, 2)), ()):
                    lat, lon, sid, nome, linha = self.pontos[i]
                    if nome != alvo:
                        continue
                    d = math.hypot(
                        (par.lat - lat) * 111320,
                        (par.lon - lon) * 111320 * math.cos(math.radians(par.lat)),
                    )
                    if d <= dm:
                        melhor, dm = (sid, linha), d
        return melhor


def _chave(nome: Any) -> str:
    import re
    import unicodedata

    x = unicodedata.normalize("NFKD", str(nome or ""))
    x = "".join(c for c in x if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]", "", x)


# A MÁSCARA DE DIAS, que é o que torna a tradução da prosa verificável.
#
# O `tipo_frequencia` são catorze bits. Os sete da direita são os dias, do
# domingo (posição 8) à segunda (posição 14) — decifrado por comparação com os
# códigos que o mesmo ficheiro traz escritos: `A-U` dá `00000000011111`, `E-S`
# dá `00000000100000`, `A-DF` dá `00000001000000`, `A-2` dá `00000000000001`.
# Os sete da esquerda aparecem ligados nalguns operadores e não estão
# documentados em lado nenhum que se tenha encontrado; ignoram-se, e é por isso
# que a conferência é só sobre os dias da semana.
_BIT_DO_DIA = {14: 1, 13: 2, 12: 3, 11: 4, 10: 5, 9: 6, 8: 7}


def _dias_da_mascara(mascara: str) -> set[int] | None:
    """Os dias da semana que a máscara liga, em ISO (1 = segunda).

    `None` quando a máscara não tem a forma esperada — e aí não se confere
    nada, em vez de se confiar numa leitura que não se sabe ler.
    """
    m = str(mascara or "").strip()
    if len(m) != 14 or set(m) - {"0", "1"}:
        return None
    return {d for pos, d in _BIT_DO_DIA.items() if m[pos - 1] == "1"}


def _conferir_frequencias(ctx: Contexto, saida: Saida, traducao, ci, do_operador) -> None:
    """A prosa traduzida bate com a máscara de dias do próprio ficheiro?

    **Isto é o que separa traduzir de adivinhar.** Há operadores que escrevem a
    frequência por extenso em vez de a codificarem — «Anual - Dias Uteis.» onde
    outro escreve `A-U`. Traduzir isso à mão seria confiar em quem traduz; mas
    o ficheiro traz, ao lado da prosa, uma máscara de bits com os dias da
    semana, e essa é dado estruturado. Se a tradução disser «dias úteis» e a
    máscara disser «terças e quintas», alguém se enganou — e bloqueia.

    Não confere o PERÍODO (anual, escolar, férias): esse não está na máscara, e
    é a parte que continua a depender de quem lê. O que isto garante é que os
    DIAS não se inventam.
    """
    from ..calendario import Calendario

    cal = Calendario(ctx.regiao.calendario, [c.id for c in ctx.regiao.concelhos])
    hoje = date.today()
    erros: list[str] = []
    vistos: set[tuple[str, str]] = set()
    for i in range(len(ci["id_servico"])):
        if int(ci["id_servico"][i]) not in do_operador:
            continue
        bruta = str(ci["frequencia"][i]).strip()
        codigo = traducao.get(bruta)
        if not codigo:
            continue
        mascara = str(ci["tipo_frequencia"][i])
        chave = (bruta, mascara)
        if chave in vistos:
            continue
        vistos.add(chave)
        esperados = _dias_da_mascara(mascara)
        if esperados is None:
            continue
        base = codigo.split("_", 1)[1] if "_" in codigo else codigo
        res = cal.resolver(base, hoje, hoje + timedelta(days=90))
        obtidos = {d.isoweekday() for d in res.datas}
        # Só se compara o que a regra SABE produzir: um código sem datas
        # nenhumas já se queixa noutro sítio, e um feriado a cair numa
        # segunda-feira não faz da máscara uma mentira. Por isso a conferência
        # é «não produzir dias que a máscara não tem».
        if obtidos and not obtidos <= esperados:
            erros.append(
                f"«{bruta}» → {codigo}: a regra corre em {sorted(obtidos)} e a máscara "
                f"{mascara} diz {sorted(esperados)}"
            )
    if erros:
        ctx.relatorio.bloqueia(
            id=f"{saida.saida or saida.fonte}.traducao-de-frequencias",
            o_que=f"{len(erros)} traduções de frequência que a máscara de dias desmente",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml → {nome} → frequencias",
            porque_importa=(
                "A tradução da prosa para um código de calendário é escrita à mão, e a "
                "máscara de bits do próprio ficheiro é o que a confere. Quando as duas "
                "discordam, o horário vai para o dia errado — e um autocarro publicado num "
                "dia em que não passa é pior do que autocarro nenhum."
            ),
            o_que_fazer="Corrigir a tradução, ou tirá-la se a prosa não for legível.",
            quantos=len(erros),
            quais=erros[:20],
        )


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    p = saida.params
    operador = str(p.get("operador") or "").strip()
    if not operador:
        raise ValueError(f"{nome}: a receita tem de dizer que `operador` ler da exportação.")
    prefixo = str(p.get("prefixo_id") or "").strip()
    if not prefixo:
        raise ValueError(f"{nome}: a receita tem de dar um `prefixo_id` aos identificadores.")
    # O GTFS exige o fuso da AGÊNCIA, e é por ele que as horas se leem. Vem do
    # motor da região, que já o declara; uma região sem motor tem de o dizer
    # aqui. Não se assume nenhum: um fuso errado desloca o feed inteiro.
    fuso = str(p.get("fuso") or ctx.regiao.motor.get("fuso") or "").strip()
    if not fuso:
        raise ValueError(
            f"{nome}: nem a receita nem o motor da região declaram `fuso` "
            "(por exemplo «Europe/Lisbon»)."
        )

    # O nome por que este passo se conta e se queixa: a SAÍDA, não a fonte.
    # A mesma exportação do registo serve vários operadores, e a chave da
    # fonte fazia o segundo passo apagar o primeiro no relatório.
    quem = (saida.saida or saida.fonte).split("/")[-1].removesuffix(".zip")
    fonte = _abrir(ctx.caminho_da_fonte(saida.fonte))

    # --- que serviços são deste operador -----------------------------------
    sv, _ = _camada(
        fonte,
        "servicos",
        ["operador", "id_servico", "servico", "origem", "destino", "tipo_servico", "autoridade"],
    )
    disponiveis = sorted({str(o) for o in sv["operador"]})
    do_operador = {
        int(sv["id_servico"][i]) for i, o in enumerate(sv["operador"]) if str(o) == operador
    }
    if not do_operador:
        ctx.relatorio.bloqueia(
            id=f"{quem}.operador-sem-servicos",
            o_que=f"A exportação não tem serviços do operador «{operador}»",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml → {nome}",
            porque_importa=(
                "O nome do operador escreve-se na receita e tem de bater com o que a "
                "exportação traz, letra por letra. Sem isso este passo produz um feed vazio "
                "em silêncio, e um feed vazio é indistinguível de um serviço que acabou."
            ),
            o_que_fazer=f"Usar um destes: {'; '.join(disponiveis)}",
            quantos=len(disponiveis),
            quais=disponiveis,
        )
        return Resultado(contagens={f"{quem}.servicos": 0})

    meta_servico = {
        int(sv["id_servico"][i]): {
            "codigo": str(sv["servico"][i]),
            "origem": str(sv["origem"][i]),
            "destino": str(sv["destino"][i]),
            "tipo": str(sv["tipo_servico"][i]),
            "autoridade": str(sv["autoridade"][i]).strip(),
        }
        for i in range(len(sv["id_servico"]))
        if int(sv["id_servico"][i]) in do_operador
    }

    # --- as paragens de cada sentido ---------------------------------------
    pg, geom = _camada(
        fonte,
        "paragens",
        ["id_servico", "id_sentido", "ordem", "designacao", "codigo"],
        geometria=True,
    )
    lats, lons = _graus(geom)
    percursos: dict[tuple[int, int], list[tuple[int, Paragem]]] = collections.defaultdict(list)
    toca_a_regiao: set[int] = set()
    for i in range(len(pg["id_servico"])):
        sid = int(pg["id_servico"][i])
        if sid not in do_operador:
            continue
        # O registo guarda as designações com entidades HTML por dentro —
        # «Vale D&#39;Urso» por «Vale D'Urso». Publicá-las assim punha o código
        # da entidade no painel de partidas.
        par = Paragem(
            str(pg["codigo"][i]),
            html.unescape(str(pg["designacao"][i])).strip(),
            lats[i],
            lons[i],
        )
        percursos[(sid, int(pg["id_sentido"][i]))].append((int(pg["ordem"][i]), par))
        if ctx.dentro(par.lat, par.lon):
            toca_a_regiao.add(sid)
    for v in percursos.values():
        v.sort(key=lambda x: x[0])

    # --- os tempos declarados em cada troço --------------------------------
    sg, _ = _camada(
        fonte, "segmentos", ["id_servico", "id_sentido", "ordem", "tempo_medio_percurso"]
    )
    trocos: dict[tuple[int, int], list[tuple[int, int]]] = collections.defaultdict(list)
    for i in range(len(sg["id_servico"])):
        sid = int(sg["id_servico"][i])
        if sid in toca_a_regiao:
            m = sg["tempo_medio_percurso"][i]
            vazio = m is None or (isinstance(m, float) and math.isnan(m))
            trocos[(sid, int(sg["id_sentido"][i]))].append(
                (int(sg["ordem"][i]), 0 if vazio else int(m))
            )
    for w in trocos.values():
        w.sort(key=lambda x: x[0])

    # --- as saídas ---------------------------------------------------------
    ci, _ = _camada(
        fonte,
        "circulacoes",
        ["id_servico", "sentido", "partida", "frequencia", "tipo_frequencia", "ano_frequencia"],
    )
    ci, repetidas = _so_a_edicao_mais_recente(ci)

    _conferir_paragens(ctx, saida, percursos, toca_a_regiao)

    # A PROSA TRADUZIDA, quando o operador não codifica a frequência. A
    # tradução é escrita na receita e conferida contra a máscara de dias do
    # próprio ficheiro — ver `_conferir_frequencias`.
    traducao = {str(k).strip(): str(v).strip() for k, v in (p.get("frequencias") or {}).items()}
    if traducao:
        _conferir_frequencias(ctx, saida, traducao, ci, do_operador)

    # AS PARAGENS QUE JÁ SÃO NOSSAS, e é aqui que se decide se o terminal fica
    # com uma ficha ou com duas. Sem isto, o mesmo cais de Fátima aparece duas
    # vezes no mapa, cada um com metade dos autocarros — que é pior do que não
    # ter nenhum, porque parece completo.
    ref: Referencia | None = None
    declarada = str(p.get("paragens_de") or "").strip()
    if declarada:
        caminho = ctx.destino / declarada
        if not caminho.exists():
            raise ValueError(
                f"{nome}: `paragens_de: {declarada}` ainda não existe em {ctx.destino} — "
                "declara este passo DEPOIS do que constrói esse feed."
            )
        vizinho = Gtfs.ler(caminho)
        ref = Referencia(
            feed=vizinho,
            conhecidas=Conhecidas.de(vizinho),
            codigos={
                str(r.get("route_short_name") or "").strip()
                for r in vizinho.routes
                if str(r.get("route_short_name") or "").strip()
            },
            raio=float(p.get("raio_m") or 100),
        )

    return _escrever(
        ctx,
        saida,
        prefixo,
        fuso,
        operador,
        meta_servico,
        percursos,
        trocos,
        ci,
        toca_a_regiao,
        ref,
        traducao,
        repetidas,  # as edições antigas que se deixaram cair
    )


def _so_a_edicao_mais_recente(ci):
    """Uma circulação depositada todos os anos é UM autocarro, não três.

    O registo do regulador é histórico: quando um operador volta a depositar a
    mesma partida no ano seguinte, a linha antiga fica lá. Um operador cujas
    circulações são todas do mesmo ano não dá por isto — foi o caso do
    primeiro que se leu, todo de 2024. O seguinte tinha a mesma partida em
    2023, 2024 e 2025, e o feed saiu com a viagem das 19:05 três vezes.

    Publicar assim não é só feio: quem olha para o painel vê três autocarros
    onde há um, e conta com uma alternativa que não existe.

    Fica a mais recente de cada (serviço, sentido, código de dias, partida).
    Não se apagam anos: o que se apaga é a repetição da MESMA partida.
    """
    chave_de = {}
    for i in range(len(ci["id_servico"])):
        k = (
            int(ci["id_servico"][i]),
            str(ci["sentido"][i]),
            str(ci["frequencia"][i]).strip(),
            str(ci["partida"][i]),
        )
        ano = int(ci["ano_frequencia"][i])
        anterior = chave_de.get(k)
        if anterior is None or ano > anterior[0]:
            chave_de[k] = (ano, i)
    manter = sorted(i for _, i in chave_de.values())
    if len(manter) == len(ci["id_servico"]):
        return ci, 0
    return {c: [v[i] for i in manter] for c, v in ci.items()}, len(ci["id_servico"]) - len(manter)


def _conferir_paragens(ctx: Contexto, saida: Saida, percursos, toca_a_regiao) -> None:
    """As paragens de um percurso colapsaram todas numa?

    **O validador não apanha isto, e é essa a razão de existir.** Um feed com
    duas paragens onde deviam estar sessenta e três é estruturalmente válido:
    as chaves estrangeiras batem, as horas não recuam, não há erro nenhum. O
    que há é uma viagem que parte de Proença-a-Nova e chega a Proença-a-Nova,
    a passar dezanove vezes pelo mesmo sítio.

    A invariante é simples e não depende de saber quantas paragens deve ter
    nenhum percurso: **o número de paragens distintas tem de ser o número de
    NOMES distintos.** Se a chave colapsar mais do que os nomes, a chave está
    errada. Não se compara com o número de registos, que num percurso circular
    é legitimamente maior.
    """
    maus: list[str] = []
    for (sid, _), pontos in sorted(percursos.items()):
        if sid not in toca_a_regiao:
            continue
        nomes = {_chave(par.nome) for _, par in pontos}
        chaves = {par.chave for _, par in pontos}
        if len(chaves) < len(nomes):
            maus.append(
                f"serviço {sid}: {len(pontos)} registos, {len(nomes)} nomes distintos e "
                f"só {len(chaves)} paragens distintas"
            )
    if maus:
        ctx.relatorio.bloqueia(
            id=f"{saida.saida or saida.fonte}.paragens-colapsadas",
            o_que=f"{len(maus)} percursos cujas paragens colapsaram numas poucas",
            onde=ctx.caminho_curto(ctx.caminho_da_fonte(saida.fonte)),
            porque_importa=(
                "O que identifica uma paragem neste registo não está a servir — há "
                "operadores que deixam o campo do código vazio. O feed sai com um punhado "
                "de paragens onde estão dezenas, e PASSA NO VALIDADOR, porque um feed "
                "pequeno é estruturalmente válido. Publicado assim, manda toda a gente "
                "para o mesmo sítio."
            ),
            o_que_fazer=(
                "Ver que campo identifica a paragem nesta exportação. Sem código, a "
                "identidade é a coordenada mais o nome — é o que `Paragem.chave` faz."
            ),
            quantos=len(maus),
            quais=maus[:20],
        )


def _escrever(
    ctx,
    saida,
    prefixo,
    fuso,
    operador,
    meta_servico,
    percursos,
    trocos,
    ci,
    toca_a_regiao,
    ref,
    traducao=None,
    edicoes_repetidas=0,
):
    # O nome por que este passo se conta e se queixa. Ver a nota das contagens
    # mais abaixo: com a chave da fonte, dois operadores da mesma exportação
    # escreviam um por cima do outro.
    quem = (saida.saida or saida.fonte).split("/")[-1].removesuffix(".zip")
    feed = Gtfs()
    agencia = f"{prefixo}"
    autoridades = sorted({m["autoridade"] for s, m in meta_servico.items() if s in toca_a_regiao})

    paragens: dict[str, Paragem] = {}
    # As paragens que se reconheceram como já nossas saem com o identificador
    # e a linha do outro feed — cada ficheiro continua válido sozinho, e o
    # sítio junta-os pela chave, que passa a ser a mesma.
    emprestadas: dict[str, dict[str, str]] = {}
    de_par: dict[tuple[str, float, float], str] = {}
    reconhecidas = 0
    viagens: list[dict[str, str]] = []
    horarios: list[dict[str, str]] = []
    rotas: dict[str, dict[str, str]] = {}
    servicos_usados: set[str] = set()
    sem_tempos: list[str] = []
    ja: set[str] = set()

    for i in range(len(ci["id_servico"])):
        sid = int(ci["id_servico"][i])
        if sid not in toca_a_regiao:
            continue
        sentido = str(ci["sentido"][i])
        if sentido not in SENTIDOS:
            continue
        id_sentido, direcao = SENTIDOS[sentido]
        chave = (sid, int(id_sentido))
        pontos = [par for _, par in percursos.get(chave, [])]
        tempos = [m for _, m in trocos.get(chave, [])]
        codigo = meta_servico[sid]["codigo"]
        if len(pontos) < 2 or len(tempos) != len(pontos) - 1:
            # Sem um tempo por troço não há hora em nenhuma paragem a não ser
            # a primeira, e uma viagem com uma paragem só não é uma viagem.
            sem_tempos.append(f"{codigo} {sentido}: {len(pontos)} paragens, {len(tempos)} troços")
            continue
        partida = _minutos(ci["partida"][i])
        if partida is None:
            sem_tempos.append(f"{codigo} {sentido}: partida ilegível «{ci['partida'][i]}»")
            continue

        bruta = str(ci["frequencia"][i]).strip()
        # A tradução ganha à prosa: o `service_id` do feed tem de ser um código
        # que o calendário saiba resolver. Sem tradução declarada fica a prosa
        # tal e qual, e o calendário queixa-se dela pelo nome.
        servico = (traducao or {}).get(bruta, bruta)
        servicos_usados.add(servico)
        rota = f"{prefixo}-{codigo}"
        if rota not in rotas:
            base = meta_servico[sid]
            rotas[rota] = {
                "route_id": rota,
                "agency_id": agencia,
                "route_short_name": codigo,
                "route_long_name": f"{base['origem']} - {base['destino']}",
                "route_type": "3",
            }

        viagem = f"{rota}-{direcao}-{servico}-{partida:04d}"
        # Duas circulações podem partir à mesma hora, no mesmo sentido, com o
        # mesmo código de dias, por percursos diferentes (é o que «Variante»
        # quer dizer). O identificador tem de as separar, ou o feed perde uma.
        n = 1
        while viagem in ja:
            n += 1
            viagem = f"{rota}-{direcao}-{servico}-{partida:04d}-{n}"
        ja.add(viagem)

        viagens.append(
            {
                "route_id": rota,
                "service_id": servico,
                "trip_id": viagem,
                "trip_headsign": pontos[-1].nome,
                "direction_id": direcao,
            }
        )
        relogio = partida
        for ordem, par in enumerate(pontos, start=1):
            if ordem > 1:
                relogio += tempos[ordem - 2]
            memo = (par.chave, par.lat, par.lon)
            pid = de_par.get(memo)
            if pid is None:
                achada = ref.conhecidas.mesma(par, ref.raio) if ref else None
                if achada:
                    pid, linha = achada
                    if pid not in emprestadas:
                        emprestadas[pid] = linha
                        reconhecidas += 1
                else:
                    pid = f"{prefixo}-{par.chave}"
                    paragens.setdefault(pid, par)
                de_par[memo] = pid
            horarios.append(
                {
                    "trip_id": viagem,
                    "arrival_time": _hhmmss(relogio),
                    "departure_time": _hhmmss(relogio),
                    "stop_id": pid,
                    "stop_sequence": str(ordem),
                    # SÓ A PRIMEIRA É EXATA. As outras saem da soma dos tempos
                    # declarados, e `timepoint=0` é o que o GTFS tem para dizer
                    # «isto é aproximado». Marcá-las todas como exatas seria
                    # prometer uma precisão que a fonte não dá.
                    "timepoint": "1" if ordem == 1 else "0",
                }
            )

    feed.definir(
        "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
        [
            {
                "agency_id": agencia,
                "agency_name": operador,
                "agency_url": "https://www.stepp.pt/sigweb/",
                "agency_timezone": fuso,
                "agency_lang": "pt",
            }
        ],
    )
    feed.definir(
        "routes.txt",
        ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"],
        [rotas[k] for k in sorted(rotas)],
    )
    feed.definir(
        "trips.txt",
        ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"],
        viagens,
    )
    feed.definir(
        "stop_times.txt",
        ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence", "timepoint"],
        horarios,
    )
    colunas_de_paragem = ["stop_id", "stop_code", "stop_name", "stop_lat", "stop_lon"]
    linhas_de_paragem = [
        {
            "stop_id": pid,
            "stop_code": paragens[pid].codigo,
            "stop_name": paragens[pid].nome,
            "stop_lat": f"{paragens[pid].lat:.6f}",
            "stop_lon": f"{paragens[pid].lon:.6f}",
        }
        for pid in sorted(paragens)
    ]
    # A paragem emprestada entra com a linha do outro feed tal e qual. Não é
    # zelo: um GTFS tem de definir as paragens a que se refere, e copiar a
    # linha em vez de a reescrever garante que a coordenada é a MESMA nos dois
    # ficheiros — se fosse aproximada, o mapa mostrava dois pontos a 3 m.
    for pid in sorted(emprestadas):
        linhas_de_paragem.append({c: emprestadas[pid].get(c, "") for c in colunas_de_paragem})
    linhas_de_paragem.sort(key=lambda x: x["stop_id"])
    feed.definir("stops.txt", colunas_de_paragem, linhas_de_paragem)

    datas, por_confirmar, sem_datas = _calendario(ctx, servicos_usados)
    feed.definir("calendar_dates.txt", ["service_id", "date", "exception_type"], datas)

    # As viagens de um serviço que não se consegue situar em data nenhuma não
    # se publicam: ficariam no feed sem nunca correr, e o validador diz que o
    # `service_id` não existe. Saem, e a lacuna diz quantas e porquê.
    if sem_datas:
        orfas = {v["trip_id"] for v in viagens if v["service_id"] in sem_datas}
        feed.trips.filtrar(lambda t: t.get("trip_id", "") not in orfas)
        feed.stop_times.filtrar(lambda h: h.get("trip_id", "") not in orfas)
        usados = feed.stop_times.valores("stop_id")
        feed.stops.filtrar(lambda s: s.get("stop_id", "") in usados)
        vivas = feed.trips.valores("route_id")
        feed.routes.filtrar(lambda r: r.get("route_id", "") in vivas)
        ctx.relatorio.lacuna(
            id=f"{quem}.codigos-de-dias-por-ler",
            o_que=f"{len(sem_datas)} códigos de dias do STePP sem regra declarada",
            onde=f"regioes/{ctx.regiao.id}/calendario.yaml → codigos",
            porque_importa=(
                "Um código cujo significado não está escrito não se adivinha (CLAUDE.md §4.4): "
                "projetá-lo para o dia errado põe no sítio um autocarro que não passa. As "
                f"viagens com estes códigos ficam de fora — são {len(orfas)}."
            ),
            o_que_fazer=(
                "Pedir a legenda ao operador ou à autoridade de transportes e transcrevê-la, "
                "com a citação ao lado, como já está feito para os outros códigos."
            ),
            quantos=len(orfas),
            quais=sorted(sem_datas),
        )
    if por_confirmar:
        ctx.relatorio.lacuna(
            id=f"{quem}.calendario-por-confirmar",
            o_que=f"{len(por_confirmar)} códigos com datas por confirmar",
            onde=f"regioes/{ctx.regiao.id}/calendario.yaml",
            porque_importa=(
                "As viagens correm, mas o calendário que as situa ainda não tem o carimbo de "
                "quem as opera."
            ),
            o_que_fazer="Confirmar os períodos com a autoridade de transportes.",
            quantos=len(por_confirmar),
            quais=sorted(por_confirmar)[:20],
        )
    # DOIS OPERADORES COM O MESMO NÚMERO DE CARREIRA. Hoje não acontece, e é
    # por isso que isto é um guarda e não uma correção: no dia em que
    # acontecer, o índice de linhas mostra dois «300» e quem escolhe um não
    # sabe qual apanhou. O identificador leva prefixo e não colide — o que
    # colide é o que a pessoa lê.
    repetidos = sorted(
        {r.get("route_short_name", "") for r in feed.routes} & (ref.codigos if ref else set())
    )
    if repetidos:
        ctx.relatorio.lacuna(
            id=f"{quem}.codigos-repetidos",
            o_que=f"{len(repetidos)} números de carreira usados pelos dois operadores",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml → {nome}",
            porque_importa=(
                "O índice de linhas mostra o número, não o operador. Dois «300» lado a lado "
                "são duas carreiras que quem lê não consegue distinguir."
            ),
            o_que_fazer=(
                "Mostrar o operador ao lado do número nestes casos, ou dar-lhes um sufixo "
                "visível. O identificador já não colide — o que colide é o rótulo."
            ),
            quantos=len(repetidos),
            quais=repetidos,
        )

    talvez_o_mesmo = _o_mesmo_autocarro_duas_vezes(feed, datas, ref) if ref else []
    if talvez_o_mesmo:
        ctx.relatorio.lacuna(
            id=f"{quem}.talvez-o-mesmo-autocarro",
            o_que=f"{len(talvez_o_mesmo)} pares de carreiras que podem ser a mesma viagem",
            onde=ctx.caminho_curto(ctx.caminho_de_saida(saida)),
            porque_importa=(
                "Estas carreiras coincidem em quatro ou mais paragens à mesma hora, em dias que "
                "se sobrepõem. Ou são duas carreiras a sério no mesmo corredor — que é o normal "
                "num eixo com procura —, ou é uma carreira repartida entre as duas operadoras e "
                "declarada pelas duas. No segundo caso o painel mostra o dobro dos autocarros "
                "que existem, e quem conta com o segundo espera por nada."
            ),
            o_que_fazer=(
                "Confirmar com as duas operadoras, par a par. Enquanto não se souber, ficam as "
                "duas: esconder uma à sorte era apagar uma carreira que existe."
            ),
            quantos=len(talvez_o_mesmo),
            quais=talvez_o_mesmo,
        )

    if sem_tempos:
        ctx.relatorio.lacuna(
            id=f"{quem}.sentidos-sem-tempos",
            o_que=f"{len(sem_tempos)} sentidos sem um tempo declarado por troço",
            onde=ctx.caminho_curto(ctx.caminho_da_fonte(saida.fonte)),
            porque_importa=(
                "Sem um tempo por troço só se sabe a hora da primeira paragem, e uma viagem "
                "com uma paragem só não é uma viagem. Estas ficam de fora."
            ),
            o_que_fazer="Pedir a exportação outra vez, ou o horário publicado do serviço.",
            quantos=len(sem_tempos),
            quais=sem_tempos[:20],
        )

    # ESTE FEED É NOSSO, e o `feed_info` tem de o dizer. O editor não é o
    # operador nem o regulador: é quem somou os tempos declarados e projetou o
    # calendário — e é a quem se há de queixar quem encontrar um erro. O
    # `feed_version` carrega a origem por extenso para que uma hora errada se
    # consiga ir buscar ao sítio de onde veio.
    hoje = date.today()
    fim = hoje + timedelta(days=JANELA_DIAS)
    feed.definir(
        "feed_info.txt",
        [
            "feed_publisher_name",
            "feed_publisher_url",
            "feed_lang",
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
                "feed_start_date": hoje.strftime("%Y%m%d"),
                "feed_end_date": fim.strftime("%Y%m%d"),
                "feed_version": (
                    f"paragem-{hoje.isoformat()} · horários: STePP/IMT, serviços declarados "
                    f"por {operador} · horas calculadas do tempo declarado em cada troço"
                ),
                "feed_contact_url": "https://github.com/fvsalgado/paragem/issues",
            }
        ],
    )

    destino = ctx.caminho_de_saida(saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    feed.escrever(destino)

    esperado = saida.params.get("esperado") or {}
    # AS CONTAGENS LEVAM O NOME DA SAÍDA, não o da fonte. Uma exportação do
    # registo traz vários operadores, e a mesma fonte dá tantos passos quantos
    # os que a região quiser — com a chave da fonte, o segundo apagava as
    # contagens do primeiro e o relatório mostrava só um. Não é hipotético:
    # aconteceu à primeira tentativa de trazer um segundo operador.
    contagens = {
        f"{quem}.servicos": len(toca_a_regiao),
        f"{quem}.rotas": len(feed.routes),
        f"{quem}.viagens": len(feed.trips),
        f"{quem}.paragens": len(feed.stops),
        f"{quem}.paragens_que_ja_eram_nossas": reconhecidas,
        f"{quem}.circulacoes_repetidas_de_anos_anteriores": edicoes_repetidas,
    }
    for chave, obtido in (
        ("servicos", len(toca_a_regiao)),
        ("rotas", len(feed.routes)),
        ("viagens", len(feed.trips)),
        ("paragens", len(feed.stops)),
    ):
        verificar_esperado(ctx, saida, chave, obtido, esperado.get(chave))

    return Resultado(
        contagens=contagens,
        saidas={saida.saida or "": str(destino)},
        notas=[f"autoridade de transportes declarada: {', '.join(autoridades) or '—'}"],
    )


def _o_mesmo_autocarro_duas_vezes(feed: Gtfs, datas: list[dict[str, str]], ref: Referencia):
    """Os pares de viagens que podem ser a MESMA, declarada pelos dois operadores.

    É a pergunta que decide se este feed se publica. Quando duas concessões
    repartem uma carreira interurbana, cada uma declara-a ao regulador — e
    somá-las põe no painel autocarros que não existem. Quem confia neles
    aparece na paragem para nada.

    **O que distingue não é a paragem: é a VIAGEM.** Duas carreiras que se
    cruzam num terminal coincidem numa hora e mais nada; a mesma viagem
    declarada duas vezes coincide ao longo de quase todas as paragens que
    partilha. Medido sobre 863 viagens, o teste por paragem dava 352 pares
    (ruído de terminal) e o teste por viagem dá nove.

    **E o calendário desempata.** Uma viagem de sábado e uma de dia útil
    escolar não podem ser o mesmo autocarro, por muito que as horas batam.
    Dos nove, quatro caem aqui.

    O que sobra não se apaga nem se funde: é uma dúvida de quem opera o quê, e
    quem a resolve é quem opera. Sai no relatório de lacunas com os pares
    escritos.
    """
    dias: dict[str, set[str]] = collections.defaultdict(set)
    for tabela in (datas, list(ref.feed.obter("calendar_dates.txt"))):
        for e in tabela:
            if str(e.get("exception_type", "1")) == "1":
                dias[str(e.get("service_id", ""))].add(str(e.get("date", "")))

    def horas_por_viagem(f: Gtfs) -> dict[str, dict[str, int]]:
        d: dict[str, dict[str, int]] = collections.defaultdict(dict)
        for h in f.stop_times:
            m = _minutos(h.get("departure_time"))
            if m is not None:
                d[str(h.get("trip_id"))][str(h.get("stop_id"))] = m
        return d

    nossas = horas_por_viagem(feed)
    deles = horas_por_viagem(ref.feed)
    servico_de = {str(x["trip_id"]): str(x.get("service_id", "")) for x in feed.trips}
    servico_deles = {str(x["trip_id"]): str(x.get("service_id", "")) for x in ref.feed.trips}
    linha_de = {str(x["trip_id"]): str(x.get("route_id", "")) for x in feed.trips}
    linha_deles = {str(x["trip_id"]): str(x.get("route_id", "")) for x in ref.feed.trips}

    onde: dict[str, list[str]] = collections.defaultdict(list)
    for tid, paragens in deles.items():
        for sid in paragens:
            onde[sid].append(tid)

    suspeitos: set[tuple[str, str]] = set()
    for tid, paragens in nossas.items():
        candidatos: collections.Counter[str] = collections.Counter()
        for sid in paragens:
            for outro in onde.get(sid, ()):
                candidatos[outro] += 1
        for outro, comuns in candidatos.items():
            if comuns < MINIMO_DE_PARAGENS_COMUNS:
                continue
            # Calendários disjuntos: não pode ser o mesmo autocarro.
            if not (
                dias.get(servico_de.get(tid, ""), set())
                & dias.get(servico_deles.get(outro, ""), set())
            ):
                continue
            iguais = sum(
                1
                for sid, m in paragens.items()
                if sid in deles[outro] and abs(m - deles[outro][sid]) <= TOLERANCIA_MINUTOS
            )
            if iguais >= MINIMO_DE_PARAGENS_COMUNS and iguais / comuns >= FRACAO_QUE_BATE:
                suspeitos.add((linha_de.get(tid, tid), linha_deles.get(outro, outro)))
    return sorted(f"{a} ~ {b}" for a, b in suspeitos)


def _calendario(ctx: Contexto, servicos: set[str]):
    """Os dias em que cada código corre, pelas regras da região.

    O STePP traz o código (`PBL_E-U`) e traz também as datas de 2024 em que
    ele correu. Vale o código e não as datas: as datas são de um ano que já
    passou, e o §6.3 diz que o calendário se gera por regras e não se projeta
    de um ano para o outro.

    O prefixo é o do calendário escolar do concelho de origem e tira-se, como
    já se tira no feed da concessão — a regra do período é a mesma, e o que o
    prefixo distingue é qual dos calendários locais a usar.
    """
    hoje = date.today()
    fim = hoje + timedelta(days=JANELA_DIAS)
    cal = Calendario(ctx.regiao.calendario, [c.id for c in ctx.regiao.concelhos])

    datas: list[dict[str, str]] = []
    por_confirmar: list[str] = []
    sem_datas: set[str] = set()
    for servico in sorted(servicos):
        base = servico.split("_", 1)[1] if "_" in servico else servico
        try:
            res = cal.resolver(base, hoje, fim)
        except Exception as erro:  # um código sem a forma PERÍODO-DIAS
            sem_datas.add(servico)
            por_confirmar.append(f"{servico}: {erro}")
            continue
        if not res.datas:
            sem_datas.add(servico)
            continue
        if not res.confiavel:
            por_confirmar.append(f"{servico}: {'; '.join(res.por_confirmar)}")
        for d in res.datas:
            datas.append(
                {"service_id": servico, "date": d.strftime("%Y%m%d"), "exception_type": "1"}
            )
    return datas, por_confirmar, sem_datas
