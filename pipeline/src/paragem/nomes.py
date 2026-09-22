"""Comparar nomes de paragem escritos por mãos diferentes.

O mesmo sítio aparece como «R. dos Oleiros (X Tv. dos Oleiros)» no caderno de
horários, «RUA DOS OLEIROS X TRAVESSA DOS OLEIROS» no registo do regulador e
«Rua dos Oleiros» no OpenStreetMap. São o mesmo sítio, e nenhuma comparação de
texto literal o diz.

Isto não é cosmética: foi a comparação de nomes, e não a falta de dados, que
fez uma lacuna apontar para o sítio errado — mandava pedir à operadora oito
coordenadas que já estavam cá dentro, escritas com «Travessa» onde o papel
escreve «Tv.».

As duas funções que interessam são `tokens()`, que reduz um nome às palavras
que o identificam, e `sim()`, que diz quanto dois nomes se parecem. `titulo()`
e `limpo()` são para ESCREVER um nome, e não para o comparar.
"""

from __future__ import annotations

import re
import unicodedata

# As abreviaturas que os cadernos de horários usam. Cada uma esteve a separar
# dois nomes do mesmo sítio.
ABREVIATURAS = {
    "r": "rua",
    "av": "avenida",
    "avª": "avenida",
    "esc": "escola",
    "eb": "escola",
    "eb1": "escola",
    "eb23": "escola",
    "lg": "largo",
    "tv": "travessa",
    "trav": "travessa",
    "st": "santa",
    "sta": "santa",
    "stª": "santa",
    "sto": "santo",
    "s": "sao",
    "sr": "senhor",
    "srª": "senhora",
    "sra": "senhora",
    "n": "n",
    "nº": "n",
    "dr": "doutor",
    "dra": "doutora",
    "eng": "engenheiro",
    "pç": "praca",
    "pc": "praca",
    "ext": "extensao",
    "jf": "junta",
    "cm": "camara",
    "c": "centro",
    "ccd": "ccd",
    "est": "estacao",
    "estr": "estrada",
    "urb": "urbanizacao",
    "zi": "zona",
    "z": "zona",
    "ind": "industrial",
    # Um cruzamento escreve-se de quatro maneiras, e as quatro querem dizer o
    # mesmo sítio. O «x» fica como marca, e não como letra.
    "cruz": "x",
    "cruzamento": "x",
    "entr": "x",
    "entroncamento": "entroncamento",
    "pte": "ponte",
    "qta": "quinta",
    "mte": "monte",
    "bº": "bairro",
    "b": "bairro",
    "fte": "fonte",
    "cel": "centro",
}

# Palavras que ligam e não identificam. Contá-las faz «Casal do Rio» e «Casal
# da Serra» parecerem-se mais do que são.
LIGACOES = {
    "de",
    "do",
    "da",
    "dos",
    "das",
    "e",
    "o",
    "a",
    "os",
    "as",
    "em",
    "no",
    "na",
    "nos",
    "nas",
    "ao",
    "à",
    "the",
    "of",
}

_SEPARADORES = str.maketrans({c: " " for c in "/-.,()'"})


def tokens(nome: str | None) -> list[str]:
    """As palavras que identificam um nome, por ordem.

    Sem acentos, em minúsculas, com as abreviaturas expandidas e as ligações
    fora. A ordem conta porque a primeira palavra costuma ser o lugar, e é
    isso que `sim()` premeia.
    """
    texto = str(nome or "")
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    texto = texto.lower().translate(_SEPARADORES).replace("º", "")
    return [
        ABREVIATURAS.get(t, t)
        for t in re.findall(r"[a-z0-9]+", texto)
        if ABREVIATURAS.get(t, t) not in LIGACOES
    ]


def conjunto(nome: str | None) -> frozenset[str]:
    return frozenset(tokens(nome))


def sim(a: str | None, b: str | None) -> float:
    """Quanto dois nomes se parecem, entre 0 e 1.

    Jaccard sobre as palavras, mais um bónus quando a PRIMEIRA palavra de cada
    um aparece no outro. O bónus não é enfeite: «Alvito (Travessa Casal
    Pinhão)» e «Alvito (Tv. Casal Pinhão)» partilham o lugar, e é o lugar que
    decide se duas paragens podem sequer ser a mesma.
    """
    A, B = conjunto(a), conjunto(b)
    if not A or not B:
        return 0.0
    comuns = len(A & B)
    if comuns == 0:
        return 0.0
    jaccard = comuns / len(A | B)
    ta, tb = tokens(a), tokens(b)
    bonus = 0.15 if ta and tb and ta[0] in B and tb[0] in A else 0.0
    return min(1.0, jaccard + bonus)


def limpo(nome: str | None) -> str:
    """O nome pronto a escrever num ficheiro.

    Sem espaços a mais e sem quebras de linha — uma delas, vinda de um PDF
    como `\\r\\n` no meio de um nome, deu erro no validador.
    """
    return " ".join(str(nome or "").split())


# As palavras que ficam em minúsculas no meio de um nome próprio. «Casal Dos
# Bernardos» não é português; «Casal dos Bernardos» é.
_MINUSCULAS = LIGACOES | {"para", "com", "sob", "sobre", "por"}


_PALAVRA = re.compile(r"\w+", re.UNICODE)


def titulo(nome: str | None) -> str:
    """Um nome em CAIXA ALTA escrito como se escreve.

    Os registos oficiais guardam tudo em maiúsculas. Publicá-lo assim grita ao
    leitor, e o §8 do briefing proíbe rótulos em maiúsculas. Um nome que já
    venha em caixa mista fica como está: quem o escreveu sabia o que queria.

    A conta faz-se palavra a palavra e não pedaço a pedaço entre espaços, e a
    diferença apanhou um defeito real: «L.GROU (ALMINHAS)» partido por espaços
    dá «L.grou», porque o `capitalize` do Python baixa tudo o que vem depois
    da primeira letra. Saía assim para o feed, e o validador reparava antes de
    nós.

    O que fica em maiúsculas é o que só se escreve assim: um «X» de
    cruzamento, uma estrada com número («EN110», «M586»).
    """
    texto = limpo(nome)
    if not texto or texto != texto.upper():
        return texto

    def trocar(m: re.Match[str]) -> str:
        palavra = m.group(0)
        if len(palavra) == 1 or any(c.isdigit() for c in palavra):
            return palavra
        baixa = palavra.lower()
        if m.start() > 0 and baixa in _MINUSCULAS:
            return baixa
        return baixa[:1].upper() + baixa[1:]

    return _PALAVRA.sub(trocar, texto)
