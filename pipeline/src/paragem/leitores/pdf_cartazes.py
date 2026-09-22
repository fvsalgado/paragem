"""A leitura de um cartaz de horários: paragens em linha, viagens em coluna.

É o formato que as câmaras usam para os urbanos delas — uma folha com o nome
da paragem à esquerda e uma coluna por viagem — e não é o formato do PDF da
concessão, que tem blocos com códigos de período e de dias. Por isso vive
noutro módulo: uma função que lesse os dois não se conseguia testar contra os
números de nenhum.

Como o `pdf_horarios.py`, **isto lê o papel e não sabe nada de GTFS**.

## A forma

    Av. Nogueiral (Gare)     06:45  07:50  09:00  10:00     ← paragem + viagens
    Bombeiros                06:46  07:51  09:01  10:01
    Largo das Forças Armadas 06:47  07:52  09:02  10:02
    …
    Sábados, exceto feriados, até às 13h58m                 ← a regra, no rodapé

## Três armadilhas, e as três apareceram nos cinco cartazes desta região

**Há quadros lado a lado na mesma folha.** A Linha Vermelha dos TUT tem o
horário normal à esquerda e o de terça-feira — dia de mercado, com oferta
diferente — à direita, na mesma linha de texto. Quem ler a linha inteira como
um só quadro junta dois horários num e inventa viagens que não existem. A
linha parte-se onde um NOME começa depois de uma célula: é aí que começa outro
quadro.

**As colunas não se contam, medem-se.** É a mesma regra do §6.1: uma linha
pode ter menos células do que o quadro tem colunas, e uma célula em falta nem
sempre se escreve «-». Contar da esquerda para a direita desalinha o horário
todo a partir do primeiro buraco — e um horário desalinhado é um horário
errado que parece certo. Cada célula vai para a coluna cujo centro lhe fica
mais perto.

**Um nome pode ficar separado das horas dele.** Na Linha Azul dos TUT o
título «linha azul», desenhado por cima do quadro, empurra o nome de uma
paragem para outra altura da página: fica uma linha com 26 horas e sem nome, e
uma linha com nome e sem horas. Juntam-se — mas SÓ quando há exatamente uma de
cada no quadro, o que torna a ligação única em vez de provável. Fora disso, a
linha sem nome fica registada como perdida e não se adivinha.

## Porque é que isto lê a saída `-bbox-layout` e não a `-layout`

A `-layout` desenha o PDF numa grelha de carateres, e é com ela que o
`pdf_horarios.py` lê o PDF da concessão. Aqui não chega, e a razão mediu-se:
o cartaz do TURE escreve as horas como «7.30» e «12.40», com quatro e cinco
carateres. Numa grelha de carateres a mesma coluna fica em sítios diferentes
conforme a linha, e as colunas deixam de existir — medido, treze das oitenta e
três viagens saíam com horas a recuar, e uma delas dava a última paragem três
minutos ANTES da primeira.

A `-bbox-layout` dá a posição de cada palavra em pontos do papel. Aí as
colunas do TURE são exatas: 194, 210, 225, 241 — sempre as mesmas, linha após
linha.

## E uma quarta, que obrigou a um parâmetro

**Dois quadros podem ocupar as mesmas colunas, um por baixo do outro.** O
desdobrável do TURE tem cinco carreiras empilhadas na mesma folha, todas com
as colunas alinhadas nos mesmos x. Pela posição são indistinguíveis; o que as
separa é o cabeçalho «CARREIRA 2 LINHA AZUL . DIAS ÚTEIS .» pelo meio. Juntar
duas carreiras num quadro dá uma viagem que começa no horário de uma e acaba
no da outra — inventada, e com ar de verdadeira.

Esse cabeçalho é do cartaz, não do formato: cada câmara escreve o seu. Por
isso é um PARÂMETRO (`quebra_de_quadro`), declarado pela região, e não uma
expressão cravada aqui. O leitor continua a servir qualquer cartaz.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field

_HORA = re.compile(r"^([0-2]?\d)[:.]([0-5]\d)$")
# Um traço isolado: «não para aqui».
_TRACO = "-"
# Uma chamada de rodapé — «(2)» — no lugar de uma hora. Diz «ver a nota», e a
# nota não é uma hora: fica por saber, e por saber não é o mesmo que não parar.
_CHAMADA = re.compile(r"^\(\d\)$")

# Quanto é que dois centros de coluna podem distar, em PONTOS do papel, e
# continuar a ser a mesma coluna. As colunas do cartaz do TURE distam 16
# pontos; seis dá folga para o arredondamento sem apanhar a coluna ao lado.
TOLERANCIA_COLUNA = 6.0

# Quanto duas palavras podem distar em y e continuar na mesma linha. Metade da
# altura de uma linha de texto destes cartazes.
TOLERANCIA_LINHA = 5.0

# O vão, em pontos, a partir do qual o texto a seguir a uma hora é o nome de
# OUTRO quadro e não parte desta grelha.
VAO_ENTRE_QUADROS = 10.0

# Quanto de um segmento tem de cair nas colunas de um quadro para ser dele.
QUOTA_PARA_SER_O_MESMO_QUADRO = 0.6


@dataclass
class Palavra:
    """Uma palavra do papel, com a caixa onde ela está desenhada."""

    x0: float
    x1: float
    y: float
    texto: str
    # Em que página do documento está. Uma página nova é sempre um quadro
    # novo: num livro de circuitos, cada página é um circuito, e dois
    # circuitos com as colunas no mesmo sítio não são a mesma grelha.
    pagina: int = 0

    @property
    def x(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def celula(self) -> tuple[bool, str | None]:
        """É uma célula de horário? E que valor tem?

        Uma hora vale o que diz. O traço e a chamada de rodapé ocupam uma
        célula e não dão hora nenhuma — o traço porque não para ali, a chamada
        porque manda ler uma nota. Nenhum dos dois é uma hora, e nenhum dos
        dois é «não existe coluna aqui».
        """
        m = _HORA.match(self.texto)
        if m:
            return True, f"{int(m.group(1)):02d}:{m.group(2)}"
        if self.texto == _TRACO or _CHAMADA.match(self.texto):
            return True, None
        return False, None


@dataclass
class Segmento:
    """Uma linha de UM quadro: o nome da paragem e as células dela."""

    nome: str
    celulas: list[Celula]

    @property
    def xs(self) -> list[float]:
        return [c.x for c in self.celulas]


@dataclass
class Celula:
    """Uma célula de horário, com o centro em x."""

    x: float
    valor: str | None


_PALAVRA = re.compile(
    r'<word xMin="([\d.eE+-]+)" yMin="([\d.eE+-]+)" '
    r'xMax="([\d.eE+-]+)" yMax="([\d.eE+-]+)">([^<]*)</word>'
)
_LINHA = re.compile(r"(?s)<line\b[^>]*>(.*?)</line>")
_PAGINA = re.compile(r'(?s)<page\b[^>]*height="([\d.eE+-]+)"[^>]*>(.*?)</page>')


def _palavras_de(xml: str) -> list[Palavra]:
    """As palavras de um `<line>`, com as entidades XML já desfeitas.

    **O `unescape` não é uma formalidade.** Isto lê XML com uma expressão
    regular — de propósito, porque só interessam as posições e o texto —, e
    uma expressão regular não desfaz entidades. Sem isto, a paragem «Escola
    EB 2/3 Dr. Ruy d'Andrade» do Entroncamento chega ao sítio escrita
    «Ruy d&apos;Andrade», e a «Rua Elias Garcia &quot;Altinho&quot;» com as
    aspas por extenso.

    Passou despercebido enquanto nenhum cartaz teve apóstrofo nem aspas no
    nome de uma paragem. O do TURE tem 79 de uns e 20 de outras.
    """
    saida = []
    for x0, y0, x1, y1, texto in _PALAVRA.findall(xml):
        t = html.unescape(texto).strip()
        if t:
            saida.append(Palavra(float(x0), float(x1), (float(y0) + float(y1)) / 2, t))
    return _juntar_horas_partidas(sorted(saida, key=lambda p: p.x0))


# O vão máximo, em pontos, entre dois pedaços da MESMA palavra. Uma letra
# ocupa uns 5 pontos; dois é menos do que um espaço.
COLADAS = 2.0


def _juntar_horas_partidas(ps: list[Palavra]) -> list[Palavra]:
    """«1 7:19» é «17:19».

    A brochura de Constância tem horas partidas a meio — o PDF escreve o
    primeiro dígito como uma palavra e o resto como outra, encostados. Cada
    pedaço sozinho não é hora nenhuma, e a linha ficava com uma coluna a
    menos: o horário todo desalinhado a partir dali.

    Junta-se quando os dois pedaços estão COLADOS e o que resulta é uma hora.
    Nunca junta duas palavras separadas por um espaço a sério.
    """
    saida: list[Palavra] = []
    for p in ps:
        if saida:
            anterior = saida[-1]
            junto = anterior.texto + p.texto
            if (
                0 <= p.x0 - anterior.x1 <= COLADAS
                and abs(anterior.y - p.y) <= TOLERANCIA_LINHA
                and _HORA.match(junto)
                and not _HORA.match(anterior.texto)
            ):
                saida[-1] = Palavra(anterior.x0, p.x1, anterior.y, junto, anterior.pagina)
                continue
        saida.append(p)
    return saida


def linhas(xml: str) -> list[list[Palavra]]:
    """As palavras agrupadas por linha do papel, e ordenadas da esquerda.

    Parte-se dos `<line>` que o pdftotext emite, e não das palavras soltas: um
    `<line>` é um bloco de texto contíguo, e é o que impede que a caixa dos
    preços — desenhada à esquerda, à mesma altura do horário — entre no meio
    de uma linha de paragens.

    Mas um `<line>` também não é uma linha inteira: o pdftotext parte uma
    linha de horário em vários, um por bloco. Por isso juntam-se os que se
    SOBREPÕEM EM Y, que é o que faz deles a mesma linha aos olhos de quem lê.

    **E as páginas empilham-se.** Numa brochura de oito páginas, a linha a 473
    pontos da página 2 e a linha a 473 pontos da página 3 são linhas
    diferentes — e sem isto juntavam-se numa só. O livro do Transporte a
    Pedido de Abrantes saía com paragens chamadas «às às às»: eram palavras de
    oito páginas sobrepostas. Cada página desce a altura das anteriores, e o
    problema desaparece.
    """
    blocos: list[list[Palavra]] = []
    desnivel = 0.0
    paginas = _PAGINA.findall(xml)
    if not paginas:
        paginas = [("0", xml)]
    for n, (altura, conteudo) in enumerate(paginas):
        for m in _LINHA.finditer(conteudo):
            ps = _palavras_de(m.group(1))
            if ps:
                blocos.append([Palavra(p.x0, p.x1, p.y + desnivel, p.texto, n) for p in ps])
        desnivel += float(altura) + TOLERANCIA_LINHA * 2

    blocos.sort(key=lambda b: (min(p.y for p in b), b[0].x0))
    saida: list[list[Palavra]] = []
    for b in blocos:
        y = sum(p.y for p in b) / len(b)
        if saida:
            y_anterior = sum(p.y for p in saida[-1]) / len(saida[-1])
            if abs(y_anterior - y) <= TOLERANCIA_LINHA:
                saida[-1].extend(b)
                continue
        saida.append(list(b))
    for linha in saida:
        linha.sort(key=lambda p: p.x0)
    return saida


def texto_da_linha(linha: list[Palavra]) -> str:
    return " ".join(p.texto for p in linha)


def _segmentos(
    linha: list[Palavra], vao: float = VAO_ENTRE_QUADROS, nome_a_direita: bool = False
) -> list[Segmento]:
    """Parte uma linha do papel em um segmento por quadro.

    **De que lado está o nome da paragem?** Nos cartazes dos urbanos está à
    esquerda das horas; nas brochuras do transporte a pedido está à direita,
    numa coluna chamada «PARAGENS». É a mesma grelha vista ao contrário, e um
    leitor que só soubesse um dos lados servia metade dos documentos.

    Em qualquer dos casos o corte é o mesmo vão em x:

    - com o nome à esquerda, texto DEPOIS das horas começa outro quadro, e
      texto longe delas antes não é nome nenhum — é o que estiver desenhado
      noutra parte da folha à mesma altura (o preçário do TURE, por exemplo);
    - com o nome à direita, é ao contrário: o nome são as palavras encostadas
      à ÚLTIMA hora, e o que vier depois de um vão é outra coisa — na brochura
      do Circuito Amarelo é a coluna do tarifário, que repete os mesmos nomes.
    """
    if nome_a_direita:
        return _segmentos_a_direita(linha, vao)
    segs: list[Segmento] = []
    nome: list[Palavra] = []
    celulas: list[Celula] = []
    ultima: Palavra | None = None
    for p in linha:
        e_celula, valor = p.celula
        if e_celula:
            celulas.append(Celula(p.x, valor))
            ultima = p
            continue
        if celulas and ultima is not None and p.x0 - ultima.x1 > vao:
            segs.append(Segmento(_nome(nome, celulas, vao), celulas))
            nome, celulas, ultima = [p], [], None
        else:
            nome.append(p)
    if celulas:
        segs.append(Segmento(_nome(nome, celulas, vao), celulas))
    return segs


def _segmentos_a_direita(linha: list[Palavra], vao: float) -> list[Segmento]:
    """A mesma leitura, com a coluna dos nomes depois das horas."""
    segs: list[Segmento] = []
    celulas: list[Celula] = []
    nome: list[Palavra] = []
    ultima_celula: Palavra | None = None
    for p in linha:
        e_celula, valor = p.celula
        if e_celula:
            # Horas outra vez depois de um nome: começou outro quadro.
            if nome:
                segs.append(Segmento(_nome_a_direita(nome, ultima_celula, vao), celulas))
                celulas, nome = [], []
            celulas.append(Celula(p.x, valor))
            ultima_celula = p
        elif celulas:
            nome.append(p)
    if celulas:
        segs.append(Segmento(_nome_a_direita(nome, ultima_celula, vao), celulas))
    return segs


def _nome_a_direita(palavras: list[Palavra], ultima: Palavra | None, vao: float) -> str:
    """As palavras encostadas à última hora, da esquerda para a direita."""
    if not palavras or ultima is None:
        return ""
    juntas: list[Palavra] = []
    anterior = ultima
    for p in palavras:
        if p.x0 - anterior.x1 > vao:
            break
        juntas.append(p)
        anterior = p
    return " ".join(p.texto for p in juntas)


def _nome(palavras: list[Palavra], celulas: list[Celula], vao: float) -> str:
    """O nome da paragem: as palavras encostadas à primeira hora, e só essas.

    Lê-se da direita para a esquerda, a partir da primeira célula, e para no
    primeiro vão grande. É o que separa o nome da paragem do que estiver
    desenhado noutra parte da folha à mesma altura.
    """
    if not palavras:
        return ""
    limite = celulas[0].x if celulas else palavras[-1].x1
    juntas: list[Palavra] = []
    for p in reversed(palavras):
        if p.x1 > limite:
            continue
        if juntas and juntas[-1].x0 - p.x1 > vao:
            break
        juntas.append(p)
    return " ".join(p.texto for p in reversed(juntas))


@dataclass
class Quadro:
    """Uma grelha de paragens × viagens.

    `horas[i][j]` é a hora da paragem `i` na viagem `j`, ou `None` quando a
    viagem não para ali — ou quando o cartaz manda ler uma nota de rodapé em
    vez de dar uma hora.
    """

    colunas: list[float]
    paragens: list[str] = field(default_factory=list)
    horas: list[list[str | None]] = field(default_factory=list)
    # Linhas de horário a que o cartaz não deu nome, e que não se conseguiu
    # emparelhar. Ficam contadas para o relatório em vez de desaparecerem.
    sem_nome: int = 0
    # Paragens cujas horas não assentam nas colunas desta grelha — o cartaz
    # meteu-lhes mais viagens do que a grelha tem colunas. Ficam nomeadas
    # para o relatório: sabe-se que existem e sabe-se que faltam.
    desalinhadas: list[str] = field(default_factory=list)
    # O que está escrito por cima de cada coluna — «DIAS ÚTEIS», «SÁBADOS».
    # Vazio quando o cartaz não rotula as colunas, e aí o dia fica por saber
    # em vez de ser assumido como útil.
    rotulos: list[str] = field(default_factory=list)
    # A linha de texto onde o quadro começa. Serve para lhe encontrar os
    # rótulos, que estão sempre por cima.
    primeira_linha: int = 0
    # Que colunas se leem de baixo para cima — as da VOLTA, que percorrem a
    # lista de paragens da ida ao contrário.
    descendentes: list[bool] = field(default_factory=list)
    # O cabeçalho que abriu este quadro — «CARREIRA 3 LINHA VERDE». Vazio nos
    # cartazes de uma grelha só, que não têm cabeçalho nenhum.
    #
    # Sem isto, as cinco carreiras do TURE saíam como seis grelhas sem nome
    # debaixo de um título «TURE», e quem procurasse a Linha Verde do
    # Entroncamento tinha de as abrir uma a uma para a encontrar.
    titulo: str = ""

    @property
    def viagens(self) -> int:
        return len(self.colunas)

    def rotulo(self, coluna: int) -> str:
        return self.rotulos[coluna] if coluna < len(self.rotulos) else ""


@dataclass
class Cartaz:
    quadros: list[Quadro] = field(default_factory=list)
    # O que estiver escrito no rodapé sem ser horário: as regras de serviço.
    # Vai para a interface tal e qual — quem escreveu «exceto terças-feiras»
    # sabe melhor do que nós o que quis dizer.
    notas: list[str] = field(default_factory=list)


def _sao_o_mesmo_quadro(colunas: list[float], xs: list[float]) -> bool:
    """Este segmento cai nas colunas deste quadro?

    Não se exige que caia todo: uma paragem servida por metade das viagens tem
    metade das células. Exige-se que a maior parte do que ele tem esteja onde o
    quadro tem colunas — senão é outro quadro, noutro sítio da folha.
    """
    if not xs:
        return False
    dentro = sum(1 for x in xs if any(abs(x - c) <= TOLERANCIA_COLUNA for c in colunas))
    return dentro / len(xs) >= QUOTA_PARA_SER_O_MESMO_QUADRO


def _mapear(celulas: list[Celula], colunas: list[float]) -> tuple[list[str | None], int]:
    """Cada célula na coluna cujo centro lhe fica mais perto.

    Devolve também quantas células NÃO couberam em coluna nenhuma. Não é
    contabilidade: é o que denuncia uma linha que não é desta grelha.
    """
    linha: list[str | None] = [None] * len(colunas)
    fora = 0
    for c in celulas:
        i = min(range(len(colunas)), key=lambda k: abs(colunas[k] - c.x))
        if abs(colunas[i] - c.x) > TOLERANCIA_COLUNA:
            fora += 1
            continue
        if linha[i] is None:
            linha[i] = c.valor
    return linha, fora


# Um quadro com menos do que isto não é um horário: é o preçário, a legenda,
# ou um resto de leitura. O do TURE tem uma tabela de preços — «3.50 €» lê-se
# como 03:50 e não há forma de o distinguir por si só — e são estes mínimos
# que a mantêm fora.
MINIMO_DE_PARAGENS = 3
MINIMO_DE_VIAGENS = 2

# O comprimento máximo de um nome de paragem. Acima disto é prosa: uma regra
# de serviço, uma legenda, um aviso. O mais comprido dos cinco cartazes desta
# região tem 43 carateres.
LIMITE_DO_NOME = 60

# Quantas células uma linha precisa para ABRIR um quadro novo. Uma linha
# estreita pode juntar-se a um quadro que já existe — há paragens servidas por
# duas viagens —, mas não define as colunas de um.
#
# Três, por omissão, porque numa folha cheia de números dois podem ser
# coincidência. Mas há horários que têm MESMO duas colunas: os circuitos do
# Transporte a Pedido de Abrantes são uma ida e uma volta por dia, e com o
# mínimo em três nenhum deles chegava a abrir grelha. Por isso é parâmetro.
MINIMO_PARA_ABRIR_QUADRO = 3


def ler(
    xml: str,
    numera_paragens: bool = False,
    quebra_de_quadro: str | None = None,
    rotulo_de_coluna: str | None = None,
    vao_entre_quadros: float = VAO_ENTRE_QUADROS,
    nome_a_direita: bool = False,
    minimo_para_abrir: int = MINIMO_PARA_ABRIR_QUADRO,
    excluir_linhas: str | None = None,
) -> Cartaz:
    """O cartaz inteiro: os quadros e as regras de serviço.

    `numera_paragens` é para os cartazes que escrevem o número de ordem a
    seguir ao nome — o do TURE numera as paragens de 01 a 52, e sem isto o
    número entrava no nome e a mesma paragem aparecia com dois nomes.

    `quebra_de_quadro` é a expressão que reconhece o cabeçalho que separa dois
    quadros empilhados nas mesmas colunas. Sem ela, quadros assim juntam-se —
    e uma viagem que começa no horário de uma carreira e acaba no de outra é
    uma viagem inventada.

    `rotulo_de_coluna` reconhece o que está escrito por cima de um grupo de
    colunas — «DIAS ÚTEIS», «SÁBADOS». O cartaz do TURE põe os dias úteis à
    esquerda e os sábados à direita da mesma grelha, e sem isto as viagens de
    sábado saíam como se circulassem todos os dias.

    Recebe a saída de `pdftotext -bbox-layout`, e não a de `-layout`: as
    colunas destes cartazes só existem em pontos do papel. Está explicado no
    cabeçalho do módulo, com os números que o mostraram.
    """
    filas = linhas(xml)
    quebra = re.compile(quebra_de_quadro) if quebra_de_quadro else None
    vao = vao_entre_quadros
    rotulo = re.compile(rotulo_de_coluna) if rotulo_de_coluna else None
    excluir = re.compile(excluir_linhas) if excluir_linhas else None

    # Agrupar os segmentos por quadro. As colunas de um quadro vêm do segmento
    # mais largo dele — que é a regra do §6.1: ancorar no registo que tenha as
    # colunas todas.
    grupos: list[list[Segmento]] = []
    colunas_de: list[list[float]] = []
    inicio_de: list[int] = []
    abertos: list[int] = []  # índices dos quadros que ainda aceitam segmentos
    rotulos: list[tuple[int, float, str]] = []  # (linha, x, texto)
    cabecalhos: list[tuple[int, float, str]] = []  # (linha, x, título)
    pagina_anterior = -1
    for n, fila in enumerate(filas):
        texto = texto_da_linha(fila)
        # PÁGINA NOVA, QUADRO NOVO. Num livro de circuitos — o de Abrantes tem
        # oito páginas, o de Ourém nove — cada página é um circuito, com a sua
        # lista de paragens. Continuar a grelha de uma página na seguinte dava
        # uma viagem que passa por paragens de dois circuitos.
        if fila and fila[0].pagina != pagina_anterior:
            pagina_anterior = fila[0].pagina
            abertos = []
        # Os rótulos procuram-se em TODAS as linhas, e não só nas que não têm
        # horas. No cartaz do TURE a linha que diz «CARREIRA 1 LINHA AZUL .
        # DIAS ÚTEIS .» leva também as chamadas de rodapé «(1)» — e uma
        # chamada conta como célula. Procurar só nas linhas sem células
        # perdia o rótulo exatamente onde ele existe.
        if rotulo:
            rotulos += [(n, x, texto_rotulo) for x, texto_rotulo in _achar(rotulo, fila)]
        # A QUEBRA TAMBÉM SE PROCURA EM TODAS AS LINHAS, e pela mesma razão:
        # a linha que diz «CARREIRA 2 LINHA AZUL» leva chamadas de rodapé, e
        # com elas deixa de ser uma linha «sem células». Foi assim que as duas
        # carreiras da Linha Azul do TURE saíram coladas numa só grelha de 54
        # paragens — que é o dobro do percurso, com viagens que não existem.
        if quebra and quebra.search(texto):
            abertos = []
            # O cabeçalho guarda-se COM A POSIÇÃO, e troço a troço.
            #
            # As carreiras 3 e 4 do TURE estão lado a lado na folha, e os
            # cabeçalhos delas na mesma linha: lida de margem a margem, as
            # duas grelhas ficavam com «CARREIRA 3 LINHA VERDE … CARREIRA 4
            # LINHA VERMELHA» em cima. É o mesmo tropeço das regras de
            # serviço, e a mesma cura — cada caixa é sua, e quem decide qual
            # pertence a que grelha é o x.
            for troço in _troços(fila):
                if quebra.search(texto_da_linha(troço)):
                    cabecalhos.append((n, troço[0].x0, _titulo(texto_da_linha(troço))))
        # LINHAS QUE NÃO SÃO DESTA GRELHA, declaradas pela região.
        #
        # A brochura de Vila de Rei repete em TODAS as páginas um painel de
        # ligações intermunicipais — «▶ Tomar 09:25 12:35 Quarta-feira
        # 10,50€» — desenhado nas mesmas colunas do circuito. Somadas à
        # grelha, davam uma viagem que passa por Tomar a meio de um percurso
        # dentro do concelho, e com a hora a recuar.
        #
        # O que as distingue é o conteúdo, não a posição, e o conteúdo é de
        # cada cartaz: por isso é parâmetro.
        if excluir and excluir.search(texto):
            continue
        segs = _segmentos(fila, vao, nome_a_direita)
        if not segs:
            continue
        for seg in segs:
            for i in abertos:
                if _sao_o_mesmo_quadro(colunas_de[i], seg.xs):
                    grupos[i].append(seg)
                    if len(seg.celulas) > len(colunas_de[i]):
                        colunas_de[i] = seg.xs
                    break
            else:
                # ABRIR um quadro exige uma linha larga. Uma linha com duas
                # células é uma linha de uma grelha que já existe, ou é uma
                # linha de cabeçalho com chamadas de rodapé — e nenhuma das
                # duas define as colunas de nada.
                if len(seg.celulas) < minimo_para_abrir:
                    continue
                grupos.append([seg])
                colunas_de.append(seg.xs)
                inicio_de.append(n)
                abertos.append(len(grupos) - 1)

    cartaz = Cartaz()
    for segs, colunas, inicio in zip(grupos, colunas_de, inicio_de, strict=True):
        q = _quadro(segs, colunas, filas, numera_paragens)
        q.primeira_linha = inicio
        q.rotulos = _rotulos_das_colunas(rotulos, colunas, inicio)
        q.titulo = _titulo_do_quadro(cabecalhos, colunas, inicio)
        if len(q.paragens) >= MINIMO_DE_PARAGENS and q.viagens >= MINIMO_DE_VIAGENS:
            cartaz.quadros.append(q)

    cartaz.notas = _notas(filas, quebra)
    return cartaz


def _titulo(texto: str) -> str:
    """«CARREIRA 1 LINHA AZUL . DIAS ÚTEIS . (1) (1)» → «CARREIRA 1 LINHA AZUL».

    O que fica é o NOME da carreira. Os dias e as chamadas de rodapé saem:
    os dias já vão nos rótulos das colunas — onde são por coluna, que é como
    o cartaz os imprime — e uma chamada de rodapé não é o nome de nada.
    """
    t = re.sub(r"\s+", " ", texto).strip()
    t = re.split(r"\s+\.\s+|\s+\(", t)[0]
    return t.strip(" .·")


def _titulo_do_quadro(
    cabecalhos: list[tuple[int, float, str]], colunas: list[float], inicio: int
) -> str:
    """O cabeçalho que está por cima DESTAS colunas, e não o da caixa ao lado.

    Dos cabeçalhos acima do quadro fica o mais recente; havendo vários à
    mesma altura — duas carreiras lado a lado —, fica o que começa mais à
    esquerda sem passar da primeira coluna da grelha, que é o mesmo critério
    dos rótulos das colunas.
    """
    acima = [(n, x, c) for n, x, c in cabecalhos if n <= inicio]
    if not acima:
        return ""
    ultima_linha = max(n for n, _, _ in acima)
    candidatos = [(x, c) for n, x, c in acima if n == ultima_linha]
    esquerda = [
        (x, c) for x, c in candidatos if x <= (colunas[0] if colunas else x) + TOLERANCIA_COLUNA
    ]
    return (sorted(esquerda or candidatos)[-1])[1]


def _achar(rotulo: re.Pattern[str], fila: list[Palavra]) -> list[tuple[float, str]]:
    """Onde é que um rótulo começa, em pontos do papel.

    A expressão corre sobre o texto da linha inteira — «DIAS ÚTEIS» são duas
    palavras — e a posição é a da primeira palavra que ele apanha.
    """
    saida: list[tuple[float, str]] = []
    posicao = 0
    limites: list[tuple[int, int, Palavra]] = []
    for p in fila:
        limites.append((posicao, posicao + len(p.texto), p))
        posicao += len(p.texto) + 1
    texto = texto_da_linha(fila)
    for m in rotulo.finditer(texto):
        for ini, fim, p in limites:
            if ini <= m.start() < fim:
                saida.append((p.x0, m.group(0)))
                break
    return saida


# Quantas linhas de texto acima de um quadro se procura o rótulo dele. O do
# TURE está a uma ou duas; ir muito mais acima apanhava o do quadro anterior.
JANELA_DO_ROTULO = 4


def _rotulos_das_colunas(
    rotulos: list[tuple[int, float, str]], colunas: list[float], inicio: int
) -> list[str]:
    """O que está escrito por cima de cada coluna.

    Um rótulo vale da posição dele até ao rótulo seguinte, que é como se lê um
    cartaz: «DIAS ÚTEIS» à esquerda cobre as colunas até onde começa
    «SÁBADOS».

    E há rótulos EM VÁRIOS NÍVEIS. A brochura do Circuito Amarelo escreve
    «DIAS ÚTEIS» e «SÁBADOS» numa linha e «IDA» e «VOLTA» na de baixo: são
    seis colunas com dois rótulos cada. Misturados numa lista só, cada coluna
    ficava com o que calhasse ser o mais à esquerda dela — e uma viagem de
    sábado saía como «IDA», sem dia. Agrupam-se POR LINHA, e cada coluna leva
    um rótulo de cada nível.
    """
    niveis: dict[int, list[tuple[float, str]]] = {}
    for n, x, texto in rotulos:
        if inicio - JANELA_DO_ROTULO <= n < inicio:
            niveis.setdefault(n, []).append((x, texto))
    if not niveis:
        return []
    saida: list[str] = []
    for c in colunas:
        partes: list[str] = []
        for n in sorted(niveis):
            perto = sorted(niveis[n])
            anteriores = [t for x, t in perto if x <= c + TOLERANCIA_COLUNA]
            if anteriores:
                partes.append(anteriores[-1])
        saida.append(" · ".join(partes))
    return saida


def _quadro(
    segs: list[Segmento], colunas: list[float], filas: list[list[Palavra]], numera: bool
) -> Quadro:
    q = Quadro(colunas=colunas)
    sem_nome = [s for s in segs if not _limpo(s.nome, numera)]

    # O NOME SEPARADO DAS HORAS. Só se emparelha quando há exatamente um de
    # cada: aí a ligação é única. Com dois seria a mais provável, e o mais
    # provável não chega para pôr um nome numa paragem.
    orfaos = _nomes_sozinhos(filas, colunas, numera)
    emparelhar = orfaos[0] if len(sem_nome) == 1 and len(orfaos) == 1 else None

    for s in segs:
        nome = _limpo(s.nome, numera)
        if not nome:
            if emparelhar is None:
                q.sem_nome += 1
                continue
            nome = emparelhar
        horas, fora = _mapear(s.celulas, colunas)
        # Células que não assentam em coluna nenhuma: a linha não é desta
        # grelha.
        if fora > len(s.celulas) * (1 - QUOTA_PARA_SER_O_MESMO_QUADRO):
            q.desalinhadas.append(nome)
            continue
        q.paragens.append(nome)
        q.horas.append(horas)

    q.descendentes = _direcoes(q)
    _depurar(q)
    return q


def _direcoes(q: Quadro) -> list[bool]:
    """Que colunas se leem de baixo para cima?

    **Metade das colunas de uma brochura do transporte a pedido descem.** A
    lista de paragens é a da IDA, e a VOLTA percorre-a ao contrário — a
    primeira paragem da ida é a última da volta, e por isso a hora dela é a
    mais tarde da coluna. Não é erro de leitura: é como se imprime um
    horário de ida e volta numa lista só.

    Decide-se por MAIORIA dos degraus, e não pelo primeiro: um degrau pode
    ser igual (duas paragens à mesma hora) ou saltar uma paragem que a viagem
    não serve.
    """
    saida: list[bool] = []
    for j in range(len(q.colunas)):
        sobe = desce = 0
        anterior: str | None = None
        for linha in q.horas:
            atual = linha[j]
            if atual is None:
                continue
            if anterior is not None:
                if atual > anterior:
                    sobe += 1
                elif atual < anterior:
                    desce += 1
            anterior = atual
        saida.append(desce > sobe)
    return saida


def _depurar(q: Quadro) -> None:
    """Tira as paragens cujas horas contradizem a direção de cada coluna.

    É a regra do §6.1 — nenhuma hora recua — aplicada coluna a coluna, porque
    numa coluna de VOLTA recuar é o normal e SUBIR é que é o defeito.

    No cartaz da Linha Azul dos TUT há uma paragem, «R. de Santo António»,
    impressa com o horário PRÓPRIO dela: de 15 em 15 minutos, numa linha que
    corre de 30 em 30. As colunas assentam — são 26, com o mesmo passo — mas
    os valores não são os daquelas viagens: na segunda coluna a paragem
    seguinte marca 08:08 e esta marca 07:52.

    Encaixá-la dava a 25 viagens uma hora que não é a delas, e uma hora
    errada é pior do que uma hora em falta: quem a lê perde o autocarro e
    fica a achar que leu bem. Fica de fora, e fica NOMEADA, para o relatório
    poder dizer o que é que não está lá.
    """
    manter: list[int] = []
    ultima: list[str | None] | None = None
    for i, linha in enumerate(q.horas):
        if ultima is not None and _contradiz(ultima, linha, q.descendentes):
            q.desalinhadas.append(q.paragens[i])
            continue
        manter.append(i)
        ultima = linha
    if len(manter) != len(q.horas):
        q.paragens = [q.paragens[i] for i in manter]
        q.horas = [q.horas[i] for i in manter]


def _contradiz(
    anterior: list[str | None], atual: list[str | None], descendentes: list[bool]
) -> bool:
    """Esta linha anda ao contrário da coluna, na maior parte das colunas?

    Compara só onde as duas têm hora. Uma paragem servida por metade das
    viagens tem metade das células, e isso não é contradição nenhuma.
    """
    pares = [
        (a, b, desce) for a, b, desce in zip(anterior, atual, descendentes, strict=True) if a and b
    ]
    if len(pares) < 3:
        return False
    contra = sum(1 for a, b, desce in pares if (b > a if desce else b < a))
    return contra > len(pares) * (1 - QUOTA_PARA_SER_O_MESMO_QUADRO)


# Enfeites que os cartazes põem antes do nome. O «▶» das brochuras do
# Transporte a Pedido marca a paragem na lista; não faz parte do nome, e
# deixá-lo lá dava «▶ Alagoa» na interface e na procura.
_ENFEITES = " .·|▶►•–—\t"


def _limpo(nome: str, numera: bool) -> str:
    """O nome da paragem, sem o número de ordem e sem restos do cartaz."""
    n = nome.strip(_ENFEITES).strip()
    if numera:
        # «HIPERMERCADO 01» e «RUA FERREIRA MESQUITA 04i» — o «i» marca o
        # sentido inverso no cartaz do TURE.
        n = re.sub(r"\s+\d{1,3}i?$", "", n)
        n = re.sub(r"^\d{1,3}i?\s+", "", n)
    return n.strip()


def _nomes_sozinhos(filas: list[list[Palavra]], colunas: list[float], numera: bool) -> list[str]:
    """Linhas com nome e sem uma única hora, à esquerda das colunas deste quadro.

    É o que sobra quando o desenho do cartaz separa um nome das horas dele. Só
    contam as que estão à esquerda da primeira coluna: um texto do lado
    direito da folha é de outro quadro, ou é legenda.
    """
    limite = min(colunas) if colunas else 0.0
    fora: list[str] = []
    for fila in filas:
        if any(p.celula[0] for p in fila):
            continue
        if not fila or fila[0].x0 >= limite:
            continue
        nome = _limpo(texto_da_linha(fila), numera)
        # Uma palavra solta em minúsculas é título do cartaz («linha», «azul»),
        # não uma paragem. As paragens levam maiúscula.
        if not (4 <= len(nome) <= LIMITE_DO_NOME and nome[:1].isupper()):
            continue
        # E o rodapé não é uma paragem. «Sábados, exceto feriados, até às
        # 13h58m» começa por maiúscula e tem o tamanho de um nome comprido —
        # sem isto, ficava a ser um segundo candidato e a ligação deixava de
        # ser única, que é a única condição em que se emparelha.
        if _REGRA.search(nome):
            continue
        fora.append(nome)
    return fora


# As regras de serviço que os cartazes escrevem no rodapé. Reconhecem-se pelo
# vocabulário, e vão para a interface tal e qual.
_REGRA = re.compile(
    r"sábado|sabado|feriado|dias? úte|dias? ute|escolar|terça|terca|"
    r"domingo|exceto|excepto|período|periodo|em vigor",
    re.IGNORECASE,
)


def _notas(filas: list[list[Palavra]], quebra: re.Pattern[str] | None = None) -> list[str]:
    """As regras de serviço escritas em prosa no cartaz.

    **UMA REGRA É UMA FRASE, E NÃO DUAS CAIXAS COLADAS.** Esta função lia a
    linha inteira do papel, da margem esquerda à direita — e num cartaz
    DESENHADO isso junta coisas que só por acaso estão à mesma altura. O
    desdobrável do TURE tem a caixa do preçário à esquerda e os locais de
    venda à direita, e daí saíam «regras de serviço» destas:

        preencher um formulário SERVIÇOS SOCIAIS 3.ª Feira a Sábado
        a partir dos 30 anos de 1h para transbordo. cm-entroncamento.pt …

    Nenhuma delas é uma frase que alguém tenha escrito. São pedaços de duas
    caixas diferentes, e foram parar a uma página pública.

    Agora cada linha parte-se nos VÃOS: um intervalo grande entre duas
    palavras é o espaço entre duas caixas do desenho, e cada troço é julgado
    por si. Os cartazes onde isto já funcionava — os dos TUT, com a regra
    sozinha no rodapé — não mudam: uma linha sem vãos dá um troço só.

    E um CABEÇALHO DE QUADRO não é uma regra, por mais que diga «DIAS ÚTEIS»
    e «SÁBADOS»: é o título da grelha que vem a seguir.
    """
    vistas: list[str] = []
    for fila in filas:
        if any(p.celula[0] for p in fila):
            continue
        for troço in _troços(fila):
            texto = texto_da_linha(troço)
            if quebra and quebra.search(texto):
                continue
            for pedaco in re.split(r"\s*●\s*|\s*\|\s*", texto):
                t = re.sub(r"\s+", " ", pedaco).strip(" .·")
                if len(t) > 12 and _REGRA.search(t) and t not in vistas:
                    vistas.append(t)
    return vistas


# O vão, em pontos do papel, a partir do qual duas palavras deixam de estar na
# mesma caixa. Medido no desdobrável do TURE: dentro de uma frase os espaços
# andam nos 3-4 pontos; entre a caixa do preçário e a dos locais de venda vão
# além dos 60.
VAO_ENTRE_CAIXAS = 40.0


def _troços(fila: list[Palavra]) -> list[list[Palavra]]:
    """A linha partida nos vãos grandes — um troço por caixa do desenho."""
    saida: list[list[Palavra]] = []
    for p in fila:
        if saida and p.x0 - saida[-1][-1].x1 <= VAO_ENTRE_CAIXAS:
            saida[-1].append(p)
        else:
            saida.append([p])
    return saida


# ---------------------------------------------------------------------------
# as viagens
# ---------------------------------------------------------------------------


@dataclass
class Passagem:
    paragem: str
    hora: str


@dataclass
class Viagem:
    """Uma coluna do quadro, lida de cima para baixo."""

    quadro: int
    coluna: int
    passagens: list[Passagem]

    @property
    def partida(self) -> str:
        return self.passagens[0].hora


def viagens(cartaz: Cartaz) -> list[Viagem]:
    """Uma viagem por coluna, com as paragens onde ela para.

    Uma coluna com menos de duas paragens não é uma viagem — é um resto de
    leitura — e não sai daqui.
    """
    saida: list[Viagem] = []
    for iq, q in enumerate(cartaz.quadros):
        for j in range(q.viagens):
            passagens = [
                Passagem(q.paragens[i], hora)
                for i, linha in enumerate(q.horas)
                if (hora := linha[j]) is not None
            ]
            # UMA COLUNA QUE DESCE É A VOLTA, e a volta faz o percurso ao
            # contrário. Invertida, a viagem fica na ordem em que se anda:
            # primeiro a paragem de onde se parte.
            if j < len(q.descendentes) and q.descendentes[j]:
                passagens.reverse()
            if len(passagens) >= 2:
                saida.append(Viagem(iq, j, passagens))
    return saida
