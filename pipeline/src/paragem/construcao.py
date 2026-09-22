"""Construir uma região: descarregar, ler, escrever, verificar, relatar.

Um comando só, a partir das fontes e dos ficheiros manuais (CLAUDE.md §4.6).
Nada de passos à mão fora daqui — não por pureza, mas porque um passo à mão é
um passo que ninguém consegue repetir daqui a seis meses e que ninguém sabe se
correu.
"""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml

from . import urbanos, validador
from .calendario import Calendario
from .fontes import ErroDeFonte, Registo, sha256
from .geo import distancia_km
from .gtfs import Gtfs
from .leitores import ESPECIFICOS_DA_FONTE, GENERICOS, LEITORES_DE_HORARIO, obter, osm
from .leitores.base import Contexto
from .regiao import Regiao, Saida
from .relatorio import Relatorio
from .territorio import Territorio, ler_caop


@dataclass
class Construcao:
    regiao: Regiao
    relatorio: Relatorio
    destino: Path

    def tem_bloqueios_do_validador(self) -> bool:
        """Se o validador não correu, isto diz se isso bloqueou ou passou por aviso."""
        return any(
            x.id.startswith("validador.") and x.id.endswith(".nao-correu")
            for x in self.relatorio.bloqueios
        )


def construir(
    raiz: Path,
    regiao: Regiao,
    *,
    descarregar: bool = True,
    so: set[str] | None = None,
    exigir_validador: bool = False,
) -> Construcao:
    raiz = Path(raiz)
    destino = raiz / "build" / regiao.id
    destino.mkdir(parents=True, exist_ok=True)

    relatorio = Relatorio(regiao=regiao.id)
    registo = Registo.carregar(raiz)
    ctx = Contexto(
        regiao=regiao,
        registo=registo,
        raiz=raiz,
        destino=destino,
        relatorio=relatorio,
        descarregar=descarregar,
    )

    # ONZE MINUTOS SEM UMA LINHA DE SAÍDA é o que isto era.
    #
    # A construção desta região leva perto de onze minutos no CI, e não dizia
    # nada até ao fim. Quem olha para a corrida não consegue distinguir «está
    # a trabalhar» de «está preso», e quem quer saber POR QUE É QUE demora não
    # tem por onde começar — nem eu tinha, quando fui procurar.
    #
    # Cada leitor passa a dizer quanto levou. São duas linhas de código e
    # transformam um bloco opaco numa lista de suspeitos.
    import time as _tempo

    ctx.territorio = _limites(ctx, registo)

    _proveniencia(ctx, registo)
    _somas(ctx, registo)
    _lacunas_de_declaracao(ctx)

    for saida in regiao.saidas:
        if so and saida.leitor not in so:
            continue
        rotulo = f"{saida.leitor} → {saida.saida or saida.papel or saida.fonte}"
        _por_confirmar(ctx, saida, rotulo)
        try:
            leitor = obter(saida.leitor)
        except KeyError as e:
            relatorio.bloqueia(
                id=f"leitor.{saida.leitor}",
                o_que=f"Não há leitor {saida.leitor!r}",
                onde=f"regioes/{regiao.id}/fontes.yaml",
                porque_importa="A região pede uma coisa que o pipeline não sabe construir.",
                o_que_fazer=str(e),
            )
            continue

        comecou = _tempo.monotonic()
        try:
            res = leitor(ctx, saida)
        except NotImplementedError as e:
            relatorio.bloqueia(
                id=f"{saida.leitor}.por-escrever",
                o_que=f"{rotulo}: por escrever",
                onde="pipeline/src/paragem/leitores/",
                porque_importa=str(e),
                o_que_fazer="Escrevê-lo.",
            )
            continue
        except ErroDeFonte as e:
            relatorio.bloqueia(
                id=f"{saida.fonte}.indisponivel",
                o_que=f"{rotulo}: a fonte não está disponível",
                onde=f"data/sources.yaml → {saida.fonte}",
                porque_importa=str(e),
                o_que_fazer="Pôr o ficheiro no sítio indicado, ou corrigir a fonte.",
            )
            continue
        except Exception as e:  # noqa: BLE001 — uma saída que rebenta não pode parar as outras
            relatorio.bloqueia(
                id=f"{saida.leitor}.rebentou",
                o_que=f"{rotulo}: {type(e).__name__}",
                onde=f"regioes/{regiao.id}/fontes.yaml",
                porque_importa=str(e),
                o_que_fazer="Corrigir o leitor ou a receita.",
            )
            continue

        print(f"   {_tempo.monotonic() - comecou:6.1f}s  {rotulo}", flush=True)
        relatorio.contagens.update(res.contagens)
        relatorio.saidas.update(res.saidas)

    passo = _tempo.monotonic()
    _validar_feeds(ctx, destino, exigir=exigir_validador)
    print(f"   {_tempo.monotonic() - passo:6.1f}s  validador", flush=True)

    passo = _tempo.monotonic()
    _correspondencias(ctx, destino)
    print(f"   {_tempo.monotonic() - passo:6.1f}s  correspondências comboio–autocarro", flush=True)

    passo = _tempo.monotonic()
    _localizar_urbanos(ctx, destino, regiao)
    print(f"   {_tempo.monotonic() - passo:6.1f}s  onde ficam as paragens dos urbanos", flush=True)

    relatorio.escrever(raiz / "build" / "reports")
    return Construcao(regiao=regiao, relatorio=relatorio, destino=destino)


def _limites(ctx: Contexto, registo: Registo) -> Territorio | None:
    """Carrega os limites dos concelhos, se a região os declarar.

    Devolver `None` não é falhar: uma região pode não ter carta administrativa
    — a de prova não tem, porque é inventada —, e aí a atribuição volta a ser
    pela caixa. O que não pode acontecer é isso passar em silêncio, e é para
    isso que serve a lacuna `territorio.sem-caop`.
    """
    decl = ctx.regiao.limites
    if not decl:
        return None

    id_fonte = decl.get("fonte")
    if not id_fonte:
        ctx.relatorio.bloqueia(
            id="territorio.limites-sem-fonte",
            o_que="A região declara `limites` sem dizer de que fonte",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml → limites",
            porque_importa="Nada entra no pipeline sem proveniência.",
            o_que_fazer="Pôr `fonte: <id>` e declarar esse id em data/sources.yaml.",
        )
        return None

    dicos = ctx.regiao.dicos
    if len(dicos) != len(ctx.regiao.concelhos):
        ctx.relatorio.lacuna(
            id="territorio.concelhos-sem-dico",
            o_que="Há concelhos sem código `dico`",
            onde=f"regioes/{ctx.regiao.id}/concelhos.yaml",
            porque_importa=(
                "O limite pede-se à carta administrativa pelo código e não pelo nome — um acento "
                "perdido numa codificação não pode fazer desaparecer um concelho."
            ),
            o_que_fazer="Preencher o `dico` de cada concelho.",
            quantos=len(ctx.regiao.concelhos) - len(dicos),
            quais=[c.id for c in ctx.regiao.concelhos if not c.dico],
        )

    try:
        caminho = registo.caminho(id_fonte, descarregar=ctx.descarregar)
        territorio = ler_caop(
            caminho,
            dicos,
            camada=decl.get("camada", "cont_municipios"),
            campo_codigo=decl.get("campo_codigo", "dtmn"),
            campo_nome=decl.get("campo_nome", "municipio"),
            cache=ctx.raiz / ".cache" / f"{id_fonte}.gpkg",
        )
    except Exception as e:  # noqa: BLE001 — os limites são auxiliares; a região constrói na mesma
        # Qualquer razão é razão para voltar à caixa, e nenhuma é razão para a
        # construção inteira morrer: sem rede, sem a carta, com o ficheiro
        # truncado, com a camada de outro nome. O que interessa é que fique
        # ESCRITO que a atribuição voltou a ser por retângulo — o contrário
        # seria uma corrida que parece igual a uma boa.
        ctx.relatorio.lacuna(
            id="territorio.limites-indisponiveis",
            o_que="Não se conseguiu carregar os limites dos concelhos",
            onde=f"data/sources.yaml → {id_fonte}",
            porque_importa=(
                "Sem limites, a atribuição a concelhos é pela caixa geográfica — um retângulo, "
                "que conta a mais tudo o que tem à volta."
            ),
            o_que_fazer=f"{type(e).__name__}: {e}",
        )
        return None

    # A carta é também a autoridade sobre os códigos. Estavam transcritos do
    # esquema de codificação e por verificar; agora ou batem certo com a carta
    # ou o relatório diz quais não batem.
    em_falta = [d for d in dicos if d not in territorio.codigos]
    if em_falta:

        def nomear(dico: str) -> str:
            c = ctx.regiao.concelho_por_dico(dico)
            return f"{c.id if c else '?'} ({dico})"

        ctx.relatorio.lacuna(
            id="territorio.dico-desconhecido",
            o_que="Há códigos `dico` que a carta administrativa não conhece",
            onde=f"regioes/{ctx.regiao.id}/concelhos.yaml",
            porque_importa=(
                "Um concelho cujo código não existe na carta fica sem fronteira, e tudo o que "
                "estiver lá dentro deixa de ser contado como da região."
            ),
            o_que_fazer="Conferir o código na carta administrativa.",
            quantos=len(em_falta),
            quais=[nomear(d) for d in em_falta],
        )

    trocados = []
    for limite in territorio.limites:
        declarado = ctx.regiao.concelho_por_dico(limite.codigo)
        if declarado and _simplificar(declarado.nome) != _simplificar(limite.nome):
            trocados.append(f"{limite.codigo}: declarado {declarado.nome!r}, carta {limite.nome!r}")
    if trocados:
        ctx.relatorio.lacuna(
            id="territorio.nome-diferente-da-carta",
            o_que="Há concelhos cujo nome não é o da carta administrativa",
            onde=f"regioes/{ctx.regiao.id}/concelhos.yaml",
            porque_importa=(
                "O nome que o produto mostra devia ser o nome oficial. Uma diferença aqui é ou "
                "uma gralha nossa, ou um código a apontar para o concelho errado."
            ),
            o_que_fazer="Conferir qual dos dois está certo.",
            quantos=len(trocados),
            quais=trocados,
        )

    ctx.relatorio.contar("territorio.concelhos_com_limite", len(territorio))
    return territorio


def _simplificar(nome: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", nome.casefold()) if unicodedata.category(c) != "Mn"
    )


def _somas(ctx: Contexto, registo: Registo) -> None:
    """A cadeia de fornecimento: o que entrou é o que se esperava?

    O `SECURITY.md` promete isto, e uma promessa de segurança que o código não
    cumpre é pior do que não a fazer — dá a quem lê a ideia de que está coberto.

    Duas verificações, e são diferentes de propósito:

    - **soma declarada** (os ficheiros manuais e de referência): uma diferença é
      uma lacuna. Estes ficheiros não mudam sozinhos, e se mudaram foi porque
      alguém os substituiu ou a origem republicou outra coisa com o mesmo nome.
    - **soma observada** (os automáticos): compara-se com a da última vez e
      conta-se a mudança. A CP e o OpenStreetMap republicam legitimamente todas
      as semanas; tratar isso como defeito era ensinar a ignorar o relatório.
    """
    anterior: dict[str, Any] = {}
    registo_local = ctx.raiz / ".cache" / "obtencoes.yaml"
    if registo_local.exists():
        with open(registo_local, encoding="utf-8") as f:
            anterior = yaml.safe_load(f) or {}

    mudaram: list[str] = []
    for id_fonte in ctx.regiao.fontes_usadas:
        try:
            fonte = registo.obter(id_fonte)
            caminho = registo.caminho(id_fonte, descarregar=False)
        except ErroDeFonte:
            continue
        if caminho.is_dir() or not caminho.exists():
            continue

        agora = sha256(caminho)
        if fonte.sha256 and not fonte.soma_bem_formada:
            ctx.relatorio.lacuna(
                id=f"{id_fonte}.soma-malformada",
                o_que=f"A soma declarada de {fonte.nome} não é um sha256",
                onde=f"data/sources.yaml → {id_fonte}",
                porque_importa=(
                    "Uma soma malformada é pior do que nenhuma: parece proteção e não protege. "
                    "A causa mais provável são aspas em falta — o YAML lê uma soma só de dígitos "
                    "como número, e uma que comece por zero perde o zero."
                ),
                o_que_fazer=f'Escrever `sha256: "{agora}"`, entre aspas.',
                quais=[f"declarada {fonte.sha256!r}", f"encontrada {agora}"],
            )
            continue
        if fonte.sha256:
            if agora != fonte.sha256:
                ctx.relatorio.lacuna(
                    id=f"{id_fonte}.soma",
                    o_que=f"A soma de verificação de {fonte.nome} não é a declarada",
                    onde=f"data/sources.yaml → {id_fonte}",
                    porque_importa=(
                        "Este ficheiro não muda sozinho. Ou alguém o substituiu, ou a origem "
                        "republicou outra coisa com o mesmo nome — e tudo o que daqui sai foi "
                        "reconstruído a partir do que está lá agora, não do que foi verificado."
                    ),
                    o_que_fazer=(
                        f"Conferir o ficheiro. Se a mudança é boa, atualizar `sha256` para "
                        f"{agora} com a data ao lado."
                    ),
                    quais=[f"declarada {fonte.sha256}", f"encontrada {agora}"],
                )
            continue

        visto = (anterior.get(id_fonte) or {}).get("sha256")
        if visto and visto != agora:
            mudaram.append(id_fonte)

    ctx.relatorio.contar("fontes.somas_conferidas", len(ctx.regiao.fontes_usadas))
    if mudaram:
        ctx.relatorio.aviso(
            id="fontes.mudaram",
            o_que="Fontes automáticas que mudaram desde a última construção",
            onde=".cache/obtencoes.yaml",
            porque_importa=(
                "É normal e esperado — a CP, a FlixBus e o OpenStreetMap republicam. Fica "
                "contado para que uma diferença nas saídas se possa explicar por uma diferença "
                "nas entradas, em vez de se procurar um defeito onde não há."
            ),
            o_que_fazer="Nenhuma ação.",
            quantos=len(mudaram),
            quais=mudaram,
        )


def _validar_feeds(ctx: Contexto, destino: Path, *, exigir: bool = False) -> None:
    """Todo o GTFS que sai passa pelo validador. Sem exceções.

    `exigir` é para onde o validador tem de estar disponível — o CI. Aí, não o
    conseguir correr é um bloqueio: uma corrida verde em que a verificação que
    interessa não aconteceu é pior do que uma vermelha.
    """
    de_terceiros = {
        Path(s.saida).stem
        for s in ctx.regiao.saidas
        if s.saida and s.saida.endswith(".zip") and s.papel == "feed-de-terceiro"
    }
    for feed in sorted((destino / "gtfs").glob("*.zip")):
        ctx.relatorio.contagens.update(
            validador.registar(
                ctx, feed, feed.stem, proprio=feed.stem not in de_terceiros, exigir=exigir
            )
        )


def _correspondencias(ctx: Contexto, destino: Path) -> None:
    """Estações de comboio sem paragem de autocarro perto (CLAUDE.md §6.4).

    Não é uma curiosidade: quem chega de comboio a uma estação sem paragem a
    menos de 300 m tem de arranjar outra maneira de sair de lá, e é melhor
    saber isso antes de apanhar o comboio do que depois.
    """
    for verificacao in ctx.regiao.verificacoes:
        if verificacao.get("tipo") != "correspondencias-comboio-autocarro":
            continue
        comboio = destino / "gtfs" / "cp.zip"
        autocarro = destino / "gtfs" / "meio.zip"
        if not (comboio.exists() and autocarro.exists()):
            continue

        raio = float(verificacao.get("raio_metros", 300)) / 1000
        # `ctx.dentro` e não a caixa: a caixa apanhava 43 estações onde a
        # região tem 28, e com elas 15 estações de outros concelhos que
        # apareciam como «sem ligação a autocarro» por não terem paragem Meio
        # perto — coisa que não têm por não serem servidas pela rede Meio.
        estacoes = [
            (s["stop_name"], float(s["stop_lat"]), float(s["stop_lon"]))
            for s in Gtfs.ler(comboio).stops
            if _numero(s.get("stop_lat")) is not None
            and ctx.dentro(float(s["stop_lat"]), float(s["stop_lon"]))
        ]
        paragens = [
            (float(s["stop_lat"]), float(s["stop_lon"]))
            for s in Gtfs.ler(autocarro).stops
            if _numero(s.get("stop_lat")) is not None
        ]

        sozinhas = [
            nome
            for nome, lat, lon in estacoes
            if not any(distancia_km((lat, lon), p) <= raio for p in paragens)
        ]
        ctx.relatorio.contar("correspondencias.estacoes_na_regiao", len(estacoes))
        ctx.relatorio.contar("correspondencias.estacoes_sem_paragem", len(sozinhas))

        if sozinhas:
            ctx.relatorio.lacuna(
                id="correspondencias.estacoes-sem-paragem",
                o_que=f"Estações de comboio sem paragem de autocarro a menos de "
                f"{int(raio * 1000)} m",
                onde="build/<regiao>/gtfs/",
                porque_importa=(
                    (verificacao.get("nota") or "").strip()
                    or "Quem chega de comboio a uma destas estações não tem como sair de lá."
                ),
                o_que_fazer=(
                    "Mostrar esta informação nas páginas de estação, e levá-la à autoridade "
                    "de transportes: é uma lacuna da rede, não dos dados."
                ),
                quantos=len(sozinhas),
                quais=sorted(sozinhas),
            )


def _numero(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _proveniencia(ctx: Contexto, registo: Registo) -> None:
    """Regista de onde veio cada coisa, e reclama do que não se sabe.

    A atribuição do OpenStreetMap não é uma boa maneira: a ODbL exige-a. Uma
    saída derivada do OSM sem atribuição é uma violação de licença, e é por
    isso que o leitor a embute no próprio ficheiro em vez de a deixar para o
    rodapé de uma página que ainda não existe.
    """
    usadas = ctx.regiao.fontes_usadas
    for id_fonte in usadas:
        try:
            f = registo.obter(id_fonte)
        except ErroDeFonte as e:
            ctx.relatorio.bloqueia(
                id=f"{id_fonte}.sem-proveniencia",
                o_que=f"A fonte {id_fonte!r} não tem proveniência",
                onde=f"regioes/{ctx.regiao.id}/fontes.yaml",
                porque_importa=str(e),
                o_que_fazer="Declará-la em data/sources.yaml.",
            )
            continue
        ctx.relatorio.proveniencia.append(
            {
                "id": f.id,
                "nome": f.nome,
                "licenca": f.licenca,
                "atribuicao": f.atribuicao,
                "acesso": f.acesso,
            }
        )
        if f.licenca_por_esclarecer:
            ctx.relatorio.lacuna(
                id=f"{f.id}.licenca",
                o_que=f"Licença por esclarecer: {f.nome}",
                onde=f"data/sources.yaml → {f.id}",
                porque_importa=(
                    (f.licenca_nota or "").strip()
                    or "Uma licença que não se conhece não é uma licença permissiva. Enquanto "
                    "estiver assim, o que daqui deriva não se republica."
                ),
                o_que_fazer="Perguntar a quem publica, e escrever a resposta com a data.",
            )


def _por_confirmar(ctx: Contexto, saida: Saida, rotulo: str) -> None:
    """As perguntas que uma receita deixa por responder, ditas em voz alta.

    Há coisas que se sabem e coisas que se suspeitam, e a diferença entre as
    duas não cabe num comentário de YAML — um comentário não chega ao
    relatório, e o que não chega ao relatório não chega a ninguém.

    Nasceu de um caso concreto: uma brochura do transporte a pedido escreve o
    mesmo poste de duas maneiras, e juntá-los era inventar (§4.4) enquanto
    separá-los era contá-lo duas vezes. Nenhuma das duas é mentira — a mentira
    era o silêncio.
    """
    perguntas = [str(x) for x in (saida.params.get("por_confirmar") or [])]
    if not perguntas:
        return
    ctx.relatorio.lacuna(
        id=f"{saida.leitor}.{saida.saida or saida.fonte}.por-confirmar",
        o_que=f"{rotulo}: por confirmar na fonte",
        onde=f"regioes/{ctx.regiao.id}/fontes.yaml → {saida.fonte}",
        porque_importa=(
            "Isto está construído com uma leitura defensável e não com uma certeza. "
            "Enquanto ninguém confirmar, a interface mostra o que está — e alguém tem "
            "de saber que há aqui uma pergunta em aberto."
        ),
        o_que_fazer="Confirmar com quem publica a fonte, e apagar esta declaração da receita.",
        quantos=len(perguntas),
        quais=perguntas,
    )


def _lacunas_de_declaracao(ctx: Contexto) -> None:
    """As lacunas que se veem sem construir nada: tarifário e calendário."""
    r = ctx.regiao

    por_confirmar = [
        t.get("id", "?") for t in (r.tarifas.get("titulos") or []) if not t.get("confirmado")
    ]
    if por_confirmar:
        ctx.relatorio.lacuna(
            id="tarifas.por-confirmar",
            o_que="Preços por confirmar na fonte",
            onde=f"regioes/{r.id}/tarifas.yaml",
            porque_importa=(
                "Um preço publicado sem confirmação é um preço errado dito a alguém que o vai "
                "pagar. A interface não o mostra sem o marcar como por confirmar."
            ),
            o_que_fazer="Conferir na fonte, escrever a data e a origem ao lado.",
            quantos=len(por_confirmar),
            quais=por_confirmar,
        )

    # O TRANSPORTE A PEDIDO, cujas zonas se conhecem e cujos circuitos não.
    #
    # É a lacuna que mais pesa para quem vive fora das vilas: há freguesias
    # nesta região sem carreira regular nenhuma, e o que lá passa é isto. A
    # zona existir já vale — diz a quem mora lá que tem serviço e que número
    # ligar —, mas sem os circuitos ninguém sabe a que horas.
    zonas = (r.a_pedido or {}).get("zonas") or []
    circuitos = (r.a_pedido or {}).get("circuitos") or []
    sem_circuitos = [z.get("nome", z.get("id", "?")) for z in zonas if not z.get("circuitos")]
    if sem_circuitos:
        ctx.relatorio.lacuna(
            id="a-pedido.circuitos",
            o_que="Zonas de transporte a pedido sem os circuitos atribuídos",
            onde=f"regioes/{r.id}/a-pedido.yaml",
            porque_importa=(
                "Em boa parte das freguesias desta região o transporte a pedido é o único "
                "transporte público que há. A zona e o número de reserva já estão na "
                "interface, e isso é o que evita que alguém fique à espera de um autocarro "
                "que ninguém chamou. Os circuitos também se conhecem pelo nome — o que "
                "falta é saber qual deles serve qual zona."
            ),
            o_que_fazer=(
                "O formulário do sistema de reservas liga as duas listas quando alguém "
                "escolhe uma zona, e o instantâneo guardado à mão tem as listas sem a "
                "ligação. Deduzi-la pelos nomes errava nalguns casos, e um circuito no "
                "concelho errado manda alguém reservar onde não deve. "
                "NÃO é preciso autorização nenhuma para isto: uma gravação da página "
                "feita com os resultados abertos TRAZ a ligação, nos identificadores dos "
                "painéis. A de 21/09/2026 resolveu doze zonas assim. As que faltam não "
                "circulam à segunda-feira — a brochura de Vila de Rei di-lo por extenso, "
                "«cada destino num dia da semana» —, e resolvem-se com outra gravação "
                "noutro dia da semana, guardada na mesma pasta."
            ),
            quantos=len(sem_circuitos),
            quais=sem_circuitos,
        )

    # OS HORÁRIOS. Parte desta lacuna já fechou — as brochuras que a autoridade
    # publica trazem o horário paragem a paragem — e o que sobra é saber QUAIS
    # dos circuitos do catálogo é que elas cobrem.
    com_brochura = sum(
        1 for s in r.saidas if s.leitor in LEITORES_DE_HORARIO and s.modo == "a-pedido" and s.saida
    )
    sem_horario = [c.get("nome", "?") for c in circuitos if not c.get("horario_em")]
    if sem_horario:
        ctx.relatorio.lacuna(
            id="a-pedido.horarios",
            o_que="Circuitos do catálogo de reservas sem horário publicado em lado nenhum",
            onde=f"regioes/{r.id}/a-pedido.yaml",
            porque_importa=(
                f"O catálogo do sistema de reservas tem {len(circuitos)} circuitos pelo "
                f"nome, e {len(circuitos) - len(sem_horario)} deles já têm o horário "
                f"paragem a paragem — das {com_brochura} brochuras publicadas e da "
                "gravação da página de reservas. Estes não têm, e não é por não se saber "
                "qual é qual: é porque não existe fonte nenhuma com as horas deles."
            ),
            o_que_fazer=(
                "São dois grupos, e cada um resolve-se de maneira diferente. Os circuitos "
                "de Tomar não têm brochura publicada — nenhum dos treze separadores da "
                "página pública é de Tomar —, e vêm de uma gravação da página de reservas "
                "feita no dia da semana em que circulam. Os LINK têm horário na página "
                "pública em forma de partidas por cidade, que não é um percurso paragem a "
                "paragem; o percurso vem da mesma gravação."
            ),
            quantos=len(sem_horario),
            quais=sem_horario,
        )

    cal = Calendario(r.calendario, [c.id for c in r.concelhos])
    if not cal.ano_letivo_tem_datas:
        ctx.relatorio.lacuna(
            id="calendario.ano-letivo",
            o_que="O ano letivo não está transcrito",
            onde=f"regioes/{r.id}/calendario.yaml",
            porque_importa=(
                "Sem ele, os códigos E (escolar), FE, V5, VIE e AX5 não se projetam em datas — "
                "e a maioria das viagens da rede tem um destes códigos. O gerador recusa-se a "
                "adivinhar, por isso essas viagens saem sem calendário fiável."
            ),
            o_que_fazer=(
                "Transcrever o calendário de funcionamento que a operadora publica todos os anos."
            ),
        )
    elif not cal.ano_letivo_confirmado:
        # Ter datas boas por confirmar é um estado DIFERENTE de não ter datas,
        # e a lacuna tem de o dizer — senão o relatório continua a pedir a
        # mesma coisa com a mesma urgência depois de metade do problema estar
        # resolvido, e quem o lê deixa de o ler.
        hoje = date.today()
        incertos = cal.dias_incertos(hoje, hoje + timedelta(days=365))
        ctx.relatorio.lacuna(
            id="calendario.ano-letivo-por-confirmar",
            o_que="O ano letivo vem do calendário escolar oficial, não da operadora",
            onde=f"regioes/{r.id}/calendario.yaml",
            porque_importa=(
                "As três interrupções (Natal, Carnaval, Páscoa) têm data exata no despacho e "
                "essas ficam certas. O arranque, não: o despacho dá um INTERVALO e cada "
                "agrupamento escolhe lá dentro. O fim do 3.º período tem três datas, conforme "
                "o ciclo. Nesses dias não se adivinha — ficam de fora dos serviços escolares, "
                "e por isso a rede aparece mais vazia do que é."
            ),
            o_que_fazer=(
                "O calendário de funcionamento da operadora fecha as duas pontas e faz esta "
                "lacuna desaparecer. Até lá, `confirmado: false` no calendario.yaml."
            ),
            quantos=len(incertos),
            quais=[d.isoformat() for d in incertos[:40]],
        )

    sem_regra = cal.feriados_municipais_sem_regra()
    if sem_regra:
        ctx.relatorio.lacuna(
            id="calendario.feriados-municipais",
            o_que="Feriados municipais sem regra nenhuma",
            onde=f"regioes/{r.id}/calendario.yaml",
            porque_importa=(
                "Nestes não se consegue sequer calcular a data. Um feriado municipal em falta "
                "faz o produto anunciar o horário de dia útil num dia em que o concelho inteiro "
                "tem serviço de domingo, e ninguém dá por isso até alguém ficar à espera."
            ),
            o_que_fazer=(
                "Uma data fixa (`data: {mes, dia}`) ou, se andar com a Páscoa, o "
                "`deslocamento_pascoa` — 1 para a Segunda-feira de Páscoa, 39 para a "
                "Quinta-feira da Ascensão."
            ),
            quantos=len(sem_regra),
            quais=sem_regra,
        )

    por_confirmar_fm = cal.feriados_municipais_por_confirmar()
    if por_confirmar_fm:
        ctx.relatorio.lacuna(
            id="calendario.feriados-municipais-por-confirmar",
            o_que="Feriados municipais cuja fonte não é a câmara",
            onde=f"regioes/{r.id}/calendario.yaml",
            porque_importa=(
                "Estes produzem uma data — só não se sabe se é a certa. Duas fontes secundárias "
                "a concordar é melhor do que nada e pior do que a deliberação da câmara, que é "
                "quem decide o feriado e o pode mudar de um ano para o outro."
            ),
            o_que_fazer="Confirmar no sítio de cada câmara e escrever a data da confirmação.",
            quantos=len(por_confirmar_fm),
            quais=por_confirmar_fm,
        )

    # Os feriados municipais já se calculam; o que ainda não acontece é
    # aplicá-los ao calendário de serviço. É uma decisão por tomar, não um
    # esquecimento — ver a lacuna.
    ctx.relatorio.lacuna(
        id="calendario.feriados-municipais-por-aplicar",
        o_que="Os feriados municipais estão levantados mas não afetam os horários",
        onde=f"regioes/{r.id}/calendario.yaml",
        porque_importa=(
            "Um feriado municipal vale num concelho e não no resto do território, e boa parte "
            "das linhas atravessa concelhos. Aplicar o feriado de Tomar a uma linha "
            "Abrantes–Tomar suprimia viagens que existem; não o aplicar anuncia viagens que "
            "não existem. As duas hipóteses erram, em sentidos opostos, e a escolha é de quem "
            "conhece a operação — não do pipeline."
        ),
        o_que_fazer=(
            "Perguntar à operadora o que faz num feriado municipal: suspende a linha inteira, "
            "só o troço do concelho, ou nada. Os `service_id` com prefixo de concelho "
            "(ABT_, ORM_, TMR_ …) dão o caminho para o aplicar assim que a resposta existir."
        ),
        quantos=len(cal.feriados_municipais(2026)),
    )

    especificos = [s for s in r.saidas if s.leitor in ESPECIFICOS_DA_FONTE]
    if especificos:
        ctx.relatorio.aviso(
            id="leitores.especificos",
            o_que="Esta região usa leitores específicos de uma fonte",
            onde=f"regioes/{r.id}/fontes.yaml",
            porque_importa=(
                "Um leitor específico não serve mais nenhuma região. Um ou dois são o custo de "
                "ler o que só existe em PDF; meia dúzia é o produto a deixar de ser genérico sem "
                "ninguém ter decidido isso."
            ),
            o_que_fazer="Nenhuma ação. É para ser contado.",
            quantos=len(especificos),
            quais=[s.leitor for s in especificos],
        )

    # O que se sabe por caixa e não por geometria. É a lacuna que explicava
    # todas as contagens que divergiam do §6.4 de uma só vez — e a explicação
    # separada por cada uma delas era três explicações da mesma coisa.
    #
    # Deixa de aparecer quando a região declara limites administrativos. Não se
    # apagou a lacuna: apagou-se a causa, e a lacuna continua cá para a região
    # que não os tenha.
    if ctx.territorio is None:
        ctx.relatorio.lacuna(
            id="territorio.sem-caop",
            o_que="A atribuição a concelhos é por caixa geográfica, não por carta administrativa",
            onde=f"regioes/{r.id}/fontes.yaml → limites",
            porque_importa=(
                "A caixa é um retângulo e a região não é. Tudo o que se conta por ela conta a "
                "mais: apanha praças de táxi, estações e paragens de concelhos vizinhos que "
                "calham dentro do retângulo. Os números do CLAUDE.md §6.4 — 9 praças de táxi, "
                "28 estações de comboio, 8 sem ligação a autocarro — foram apurados com "
                "atribuição a sério, e é por isso que os que saem daqui são maiores. Nenhum dos "
                "dois está errado: medem coisas diferentes, e só um deles é o que o produto "
                "deve publicar."
            ),
            o_que_fazer=(
                "Declarar `limites:` na receita da região, apontando a uma fonte de limites "
                "administrativos — em Portugal, a CAOP da Direção-Geral do Território, que é "
                "CC BY 4.0 e se descarrega sem registo. Em alternativa, extrair os limites do "
                "próprio recorte do OpenStreetMap (admin_level=7), que já cá está — com a "
                "atribuição ODbL, e dizendo que é o que é."
            ),
        )

    ctx.relatorio.contar("regiao.concelhos", len(r.concelhos))
    ctx.relatorio.contar("regiao.municipios_membros", len(r.concelhos_membros))
    ctx.relatorio.contar("regiao.modos", len(r.modos))
    ctx.relatorio.contar(
        "regiao.leitores_genericos", sum(1 for s in r.saidas if s.leitor in GENERICOS)
    )
    ctx.relatorio.contar("regiao.leitores_especificos", len(especificos))


def _localizar_urbanos(ctx: Contexto, destino: Path, regiao: Regiao) -> None:
    """Onde ficam as paragens dos urbanos municipais (CLAUDE.md §6.4).

    Os cartazes das câmaras dão o nome e a hora, nunca as coordenadas. Sem
    elas a linha responde «a que horas passa» e mais nada: não se desenha no
    mapa nem entra no planeador. Aqui procuram-se onde existem publicamente —
    e o que não se encontra fica NOMEADO, porque é essa lista que se entrega à
    câmara ou se mapeia no OpenStreetMap.

    O que isto NÃO faz é inventar um ponto (§4.4). Está tudo explicado em
    `urbanos.py`, com as duas regras que evitam o pior: o concelho fecha a
    procura, e candidatos demasiado afastados não são a mesma paragem.
    """
    saidas = [
        s
        for s in regiao.saidas
        if s.modo == "urbano-municipal"
        and s.leitor in LEITORES_DE_HORARIO
        and s.saida
        and (destino / s.saida).exists()
    ]
    if not saidas:
        return

    indices = _indices_de_paragens(ctx, destino, regiao, {s.params.get("concelho") for s in saidas})

    linhas = []
    for s in saidas:
        indice = indices.get(s.params.get("concelho")) or urbanos.Indice()
        linhas.append(urbanos.localizar(destino / str(s.saida), indice))

    todas = sum(x["paragens"] for x in linhas)
    postas = sum(x["localizadas"] for x in linhas)
    ctx.relatorio.contar("urbanos.paragens", todas)
    ctx.relatorio.contar("urbanos.paragens_localizadas", postas)
    for x in linhas:
        ctx.relatorio.contar(f"urbanos.{x['id']}.localizadas", x["localizadas"])
        ctx.relatorio.contar(f"urbanos.{x['id']}.paragens", x["paragens"])

    ficheiros = [destino / str(s.saida) for s in saidas]
    saida_geojson = destino / "geojson" / "urbanos-paragens.geojson"
    saida_geojson.parent.mkdir(parents=True, exist_ok=True)
    saida_geojson.write_text(
        json.dumps(urbanos.geojson(ficheiros), ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )

    faltam = [f"{x['nome']}: {n}" for x in linhas for n in x["sem_coordenada"]]
    if faltam:
        ctx.relatorio.lacuna(
            id="urbanos.paragens-sem-coordenada",
            o_que="Paragens dos urbanos municipais que não se sabe onde ficam",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml → modo `urbano-municipal`",
            porque_importa=(
                f"Estão localizadas {postas} de {todas}. As que faltam têm horário e não têm "
                "sítio: não se desenham no mapa nem entram no planeador, e a linha fica pela "
                "metade. A diferença entre linhas é de quem as mapeou — as que têm relação de "
                "percurso no OpenStreetMap estão quase completas, as outras quase vazias. Não "
                "se inventou nenhuma coordenada (CLAUDE.md §4.4)."
            ),
            o_que_fazer=(
                "Mapear estas paragens no OpenStreetMap — é o caminho que serve toda a gente e "
                "não só este produto —, ou pedir à câmara a lista com coordenadas. A exportação "
                "do STePP (§5) também as tem."
            ),
            quantos=len(faltam),
            quais=faltam,
        )


def _indices_de_paragens(
    ctx: Contexto, destino: Path, regiao: Regiao, concelhos: set[str | None]
) -> dict[str | None, urbanos.Indice]:
    """Um índice de pontos POR CONCELHO — é o concelho que fecha a procura.

    Junta o que existe publicamente, por ordem de autoridade: as relações de
    percurso que alguém mapeou, as paragens de autocarro do mapa, e o feed da
    própria rede da região.

    A chave é o `id` do concelho que a receita declara na linha. A entrada
    `None` é a rede toda, e existe para uma linha que não declare concelho:
    com nomes como «Bombeiros» espalhados pela região, a regra da dispersão
    recusa quase tudo — o que é a falha certa, mas é falha à mesma. Declarar o
    concelho é o que faz a linha ser localizada.
    """
    indices: dict[str | None, urbanos.Indice] = {c: urbanos.Indice() for c in concelhos}

    def arrumar(nome: str, lat: float, lon: float, fonte: str) -> None:
        if not ctx.dentro(lat, lon):
            return
        if None in indices:
            indices[None].juntar(nome, lat, lon, fonte)
        if ctx.territorio is None:
            return
        limite = ctx.territorio.concelho_de(lat, lon)
        if limite is None:
            return
        concelho = regiao.concelho_por_dico(limite.codigo)
        if concelho and concelho.id in indices:
            indices[concelho.id].juntar(nome, lat, lon, fonte)

    recorte = next(
        (destino / s.saida for s in regiao.saidas if s.papel == "base-osm" and s.saida), None
    )
    if recorte and recorte.exists():
        for nome, lat, lon, fonte in osm.paragens_e_percursos(recorte):
            arrumar(nome, lat, lon, fonte)

    # `horarios` e `feed-proprio` são os dois nomes que uma região dá à SUA
    # rede: o primeiro quando o feed é reconstruído aqui, o segundo quando já
    # vem feito. Os dois valem — este passo é do produto e não de uma região,
    # e a de prova usa o segundo.
    proprio = next(
        (
            destino / s.saida
            for s in regiao.saidas
            if s.papel in {"horarios", "feed-proprio"} and s.saida
        ),
        None,
    )
    if proprio and proprio.exists():
        for p in Gtfs.ler(proprio).stops:
            try:
                arrumar(p["stop_name"], float(p["stop_lat"]), float(p["stop_lon"]), "rede")
            except (KeyError, TypeError, ValueError):
                continue
    return indices
