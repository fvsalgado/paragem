"""A leitura do PDF de horários: páginas, blocos, colunas e paragens.

Está separado do leitor (`horarios_pdf_operadora.py`) de propósito: **isto lê o
papel e não sabe nada de GTFS**. Uma função que faz as duas coisas não se
consegue testar contra os números do §6.1 sem construir um feed inteiro.

A forma do documento, que o §6.1 descreve e que se confirmou página a página:

    10 Abrantes - Tomar                          ← cabeçalho: código + nome

    IDA                       E    FE     E      ← período, com prefixo
    OUTBOUND                  U     U     U      ← dias, com prefixo
    Abrantes (Terminal)     13:45 16:30 17:00    ← ponto de horário
    Escola Sec. M. Fernandes 13:47   -   17:02   ← «-» é «não para aqui»
                          C 10:40 19:20   -      ← chegada
    Fátima (Terminal)                            ← … o nome sozinho …
                          P 10:50 19:30   -      ← … e a partida

    E-U | Escolar - Dias Úteis | School Days     ← legenda, que é normativa

## As duas armadilhas

**As colunas não se contam, medem-se.** Uma linha de paragem pode ter menos
células do que o bloco tem colunas, e nem todas as ausências se escrevem «-» —
há células em branco. Contar tokens da esquerda para a direita desalinha o
horário todo a partir do primeiro buraco, e um horário desalinhado é um horário
errado que parece certo. Por isso cada token é mapeado à coluna pelo **centro
em x**, ancorando no primeiro registo que tenha as colunas todas.

**«FINS DE SEMANA E FERIADOS» tem um «E» que não é o código E.** O prefixo
retira-se antes de se lerem os códigos, senão o bloco ganha uma coluna
fantasma.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Os códigos, tal como a legenda do PDF os define.
PERIODOS = {"E", "A", "FE", "V5", "VIE", "AX5"}
DIAS = {"U", "S", "DF", "DFXN", "SFXD", "TD"}

# Os prefixos que podem preceder as duas linhas de códigos. Ordenados do mais
# longo para o mais curto: «DIAS ÚTEIS» tem de ser tentado antes de «DIAS».
PREFIXOS_PERIODO = [
    "FINS DE SEMANA E FERIADOS",
    "DIAS ÚTEIS",
    "VOLTA",
    "IDA",
]
PREFIXOS_DIAS = [
    "NON-BUSINESS DAYS",
    "BUSINESS DAYS",
    "OUTBOUND",
    "INBOUND",
]

SENTIDO = {"IDA": "ida", "OUTBOUND": "ida", "VOLTA": "volta", "INBOUND": "volta"}

_HORA = re.compile(r"\b(\d{1,2}):(\d{2})\b")
_TRACO = re.compile(r"(?<![\w:-])-(?![\w:-])")
_CABECALHO = re.compile(r"^\s*(\d+)\s+(\S.*?)\s*$")
_LEGENDA = re.compile(r"^\s*([A-Z0-9]+-[A-Z0-9]+)\s*\|\s*([^|]+?)\s*(?:\|\s*(.*?))?\s*$")
_RODAPE = re.compile(r"^\s*Em vigor desde\b")
# A marca pode ser seguida de uma hora OU de um traço: a coluna em que a
# viagem não existe escreve «-» tanto na chegada como na partida.
_MARCA_CP = re.compile(r"^(\s*)([CP])\s+(?=\d{1,2}:\d{2}|-)")


class ErroDePdf(Exception):
    pass


@dataclass
class Ponto:
    """Uma linha de paragem dentro de um bloco."""

    nome: str
    horas: list[str | None]
    marca: str | None = None  # «C» chegada, «P» partida, None quando é só uma


@dataclass
class Bloco:
    linha: str
    sentido: str | None
    periodos: list[str]
    dias: list[str]
    pontos: list[Ponto] = field(default_factory=list)
    pagina: int = 0

    @property
    def servicos(self) -> list[str]:
        """O `service_id` base de cada coluna: PERÍODO-DIAS."""
        return [f"{p}-{d}" for p, d in zip(self.periodos, self.dias, strict=True)]

    @property
    def colunas(self) -> int:
        return len(self.periodos)


@dataclass
class Linha:
    codigo: str
    nome: str
    paginas: list[int] = field(default_factory=list)
    blocos: list[Bloco] = field(default_factory=list)


@dataclass
class Documento:
    linhas: dict[str, Linha] = field(default_factory=dict)
    legendas: dict[str, str] = field(default_factory=dict)
    em_vigor_desde: str | None = None
    avisos: list[str] = field(default_factory=list)

    @property
    def blocos(self) -> list[Bloco]:
        return [b for lin in self.linhas.values() for b in lin.blocos]


# ---------------------------------------------------------------------------
# tokens e colunas
# ---------------------------------------------------------------------------


def _tokens(texto: str) -> list[tuple[float, str]]:
    """As células de uma linha, cada uma com o centro em x.

    O centro, e não o início: «13:45» ocupa cinco colunas de carateres e «-»
    ocupa uma, e o PDF centra as duas na mesma coluna. Ancorar no início punha
    o traço a meia célula de distância do sítio dele.
    """
    saida: list[tuple[float, str]] = []
    for m in _HORA.finditer(texto):
        saida.append(((m.start() + m.end()) / 2, m.group(0)))
    for m in _TRACO.finditer(texto):
        saida.append(((m.start() + m.end()) / 2, "-"))
    return sorted(saida)


def _nome_do_ponto(texto: str) -> str:
    """O que sobra da linha depois de lhe tirar as células e a marca C/P."""
    primeiro = min(
        [m.start() for m in _HORA.finditer(texto)] + [m.start() for m in _TRACO.finditer(texto)],
        default=len(texto),
    )
    corte = re.sub(r"\s+", " ", texto[:primeiro]).strip()
    return re.sub(r"^[CP]$", "", corte).strip()


def _mapear(tokens: list[tuple[float, str]], ancoras: list[float]) -> list[str | None]:
    """Cada token na coluna cujo centro lhe fica mais perto."""
    celulas: list[str | None] = [None] * len(ancoras)
    for x, valor in tokens:
        i = min(range(len(ancoras)), key=lambda k: abs(ancoras[k] - x))
        if celulas[i] is None:
            celulas[i] = valor
    return celulas


# ---------------------------------------------------------------------------
# linhas de códigos
# ---------------------------------------------------------------------------


def _sem_prefixo(texto: str, prefixos: list[str]) -> tuple[str, str | None]:
    """Retira o prefixo e devolve o resto com a mesma indentação.

    A indentação preserva-se porque as posições x dos códigos ainda vão ser
    medidas, e um `lstrip()` aqui desalinhava o bloco inteiro.
    """
    nu = texto.strip()
    for p in prefixos:
        if nu.startswith(p):
            resto = nu[len(p) :]
            return texto.replace(p, " " * len(p), 1), p if resto.strip() or True else p
    return texto, None


def _codigos(texto: str, validos: set[str], prefixos: list[str], digitos: bool):
    """Se esta linha é uma linha de códigos, devolve-os com as posições."""
    limpo, prefixo = _sem_prefixo(texto, prefixos)
    if _HORA.search(limpo):
        return None
    achados = [(m.start(), m.end(), m.group(0)) for m in re.finditer(r"\S+", limpo)]
    if not achados:
        return None
    for _, _, t in achados:
        if t in validos:
            continue
        if digitos and t.isdigit() and set(t) <= set("23456"):
            continue
        return None
    return [((i + f) / 2, t) for i, f, t in achados], prefixo


# ---------------------------------------------------------------------------
# o documento
# ---------------------------------------------------------------------------


def ler(texto: str) -> Documento:
    """Lê o texto de `pdftotext -layout` e devolve o documento inteiro."""
    doc = Documento()
    for numero, pagina in enumerate(texto.split("\f"), start=1):
        _pagina(doc, numero, pagina)
    return doc


def _pagina(doc: Documento, numero: int, pagina: str) -> None:
    linhas_texto = pagina.split("\n")
    cabecalho = next((x for x in linhas_texto if x.strip()), None)
    if cabecalho is None:
        return
    m = _CABECALHO.match(cabecalho)
    if not m:
        return  # a primeira página é o tarifário, e não tem horários
    codigo, nome = m.group(1), m.group(2)

    lin = doc.linhas.get(codigo)
    if lin is None:
        lin = doc.linhas[codigo] = Linha(codigo=codigo, nome=nome)
    elif lin.nome != nome:
        doc.avisos.append(
            f"a linha {codigo} aparece como {lin.nome!r} e como {nome!r}; fica o primeiro"
        )
    lin.paginas.append(numero)

    bloco: Bloco | None = None
    ancoras: list[float] = []
    pendente_periodos: list[tuple[float, str]] | None = None
    pendente_sentido: str | None = None
    nome_orfao: str | None = None

    for bruto in linhas_texto[1:]:
        if not bruto.strip():
            continue

        leg = _LEGENDA.match(bruto)
        if leg:
            doc.legendas.setdefault(leg.group(1), leg.group(2).strip())
            continue

        if _RODAPE.match(bruto):
            doc.em_vigor_desde = doc.em_vigor_desde or bruto.strip()
            continue

        achado = _codigos(bruto, PERIODOS, PREFIXOS_PERIODO, digitos=False)
        if achado and pendente_periodos is None:
            pendente_periodos, prefixo = achado
            pendente_sentido = SENTIDO.get(prefixo or "")
            continue

        achado = _codigos(bruto, DIAS, PREFIXOS_DIAS, digitos=True)
        if achado and pendente_periodos is not None:
            dias, prefixo = achado
            if len(dias) != len(pendente_periodos):
                doc.avisos.append(
                    f"p{numero} linha {codigo}: {len(pendente_periodos)} códigos de período para "
                    f"{len(dias)} de dias; bloco ignorado"
                )
                pendente_periodos = None
                continue
            bloco = Bloco(
                linha=codigo,
                sentido=pendente_sentido or SENTIDO.get(prefixo or ""),
                periodos=[t for _, t in pendente_periodos],
                dias=[t for _, t in dias],
                pagina=numero,
            )
            lin.blocos.append(bloco)
            # As âncoras saem do primeiro ponto com as colunas todas (§6.1); até
            # lá, servem as posições dos próprios códigos.
            ancoras = [x for x, _ in dias]
            pendente_periodos = None
            nome_orfao = None
            continue

        if bloco is None:
            continue

        tokens = _tokens(bruto)
        if not tokens:
            # Um nome sozinho: é a paragem de uma dupla chegada/partida. Vem
            # DEPOIS da linha da chegada e ANTES da linha da partida, por isso
            # também serve para preencher o nome da chegada que ficou atrás.
            nome_orfao = re.sub(r"\s+", " ", bruto).strip()
            if bloco.pontos and bloco.pontos[-1].marca == "C" and not bloco.pontos[-1].nome:
                bloco.pontos[-1].nome = nome_orfao
            continue

        mc = _MARCA_CP.match(bruto)
        marca = mc.group(2) if mc else None

        if len(tokens) == bloco.colunas:
            # Um registo completo: é a melhor âncora que há.
            ancoras = [x for x, _ in tokens]

        celulas = _mapear(tokens, ancoras)
        nome_ponto = _nome_do_ponto(bruto)
        if marca == "P" and not nome_ponto:
            nome_ponto = nome_orfao or ""
        if not marca:
            nome_orfao = None

        bloco.pontos.append(Ponto(nome=nome_ponto, horas=celulas, marca=marca))


# ---------------------------------------------------------------------------
# viagens
# ---------------------------------------------------------------------------


@dataclass
class Paragem:
    nome: str
    chegada: str
    partida: str

    @property
    def marcada(self) -> bool:
        return True


@dataclass
class Viagem:
    linha: str
    nome_da_linha: str
    servico: str
    sentido: str | None
    pagina: int
    coluna: int
    paragens: list[Paragem] = field(default_factory=list)

    @property
    def id(self) -> str:
        return f"{self.linha}_{self.servico}_{self.pagina}_{self.coluna}"


def _celula(valor: str | None) -> str | None:
    """`None` e «-» querem dizer a mesma coisa: aqui não para.

    Não querem dizer o mesmo no papel — «-» é uma afirmação e o branco é uma
    omissão — mas para o horário são a mesma ausência, e distingui-las aqui
    fazia o resto do código carregar uma diferença que não usa.
    """
    if valor is None or valor == "-":
        return None
    return valor


def _normalizar(horas: list[str]) -> list[str]:
    """Horas que atravessam a meia-noite passam a 24:xx, 25:xx, como o GTFS pede.

    Uma viagem que parte às 23h50 e chega às 00h20 do dia seguinte escreve-se
    `24:20:00`. Tratá-la como 00:20 punha a chegada quinze horas antes da
    partida, e o validador — com razão — chamava-lhe erro.
    """
    saida: list[str] = []
    dias = 0
    anterior = -1
    for h in horas:
        hh, mm = (int(x) for x in h.split(":"))
        minutos = hh * 60 + mm
        if minutos + dias * 1440 < anterior:
            dias += 1
        total = minutos + dias * 1440
        anterior = total
        saida.append(f"{total // 60:02d}:{total % 60:02d}:00")
    return saida


def viagens(doc: Documento) -> list[Viagem]:
    """Uma viagem por coluna de cada bloco, com as paragens que ela serve."""
    saida: list[Viagem] = []
    for lin in doc.linhas.values():
        for bloco in lin.blocos:
            for coluna in range(bloco.colunas):
                paragens = _paragens_da_coluna(bloco, coluna)
                if not paragens:
                    continue
                horas = _normalizar([h for p in paragens for h in (p[1], p[2])])
                saida.append(
                    Viagem(
                        linha=bloco.linha,
                        nome_da_linha=lin.nome,
                        servico=bloco.servicos[coluna],
                        sentido=bloco.sentido,
                        pagina=bloco.pagina,
                        coluna=coluna,
                        paragens=[
                            Paragem(nome=p[0], chegada=horas[2 * i], partida=horas[2 * i + 1])
                            for i, p in enumerate(paragens)
                        ],
                    )
                )
    return saida


def _paragens_da_coluna(bloco: Bloco, coluna: int) -> list[tuple[str, str, str]]:
    """As paragens servidas nesta coluna, com chegada e partida por marcar."""
    saida: list[tuple[str, str, str]] = []
    i = 0
    pontos = bloco.pontos
    while i < len(pontos):
        ponto = pontos[i]
        hora = _celula(ponto.horas[coluna]) if coluna < len(ponto.horas) else None

        # Chegada + partida na mesma paragem: duas linhas do papel, uma
        # paragem da viagem.
        if (
            ponto.marca == "C"
            and i + 1 < len(pontos)
            and pontos[i + 1].marca == "P"
            and pontos[i + 1].nome == ponto.nome
        ):
            seguinte = pontos[i + 1]
            partida = _celula(seguinte.horas[coluna]) if coluna < len(seguinte.horas) else None
            if hora and partida:
                saida.append((ponto.nome, hora, partida))
            elif hora or partida:
                so = hora or partida
                saida.append((ponto.nome, so, so))  # type: ignore[arg-type]
            i += 2
            continue

        if hora:
            saida.append((ponto.nome, hora, hora))
        i += 1
    return saida
