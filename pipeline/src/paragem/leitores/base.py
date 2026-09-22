"""O que um leitor recebe e o que devolve.

Um leitor é um plugin por **formato** — e serve qualquer região que use esse
formato — ou, em último recurso, por **fonte**. A região diz o que tem; o
leitor não sabe onde está.

É esta a regra que faz uma região nova entrar sem um commit, e não é teoria: a
região de prova, que o CI constrói em todas as corridas, usa só leitores
genéricos. No dia em que ela precisar de código próprio para nascer, o
contrato partiu-se.

Um leitor específico de uma fonte — o `horarios-pdf-operadora` é o único — tem de
o declarar na receita da região (`leitor_especifico_da_fonte: true`). Não é
decoração: é o que permite contar quantos existem e reparar quando começam a
crescer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from ..fontes import Registo
from ..regiao import Regiao, Saida
from ..relatorio import Relatorio
from ..territorio import Territorio


@dataclass
class Contexto:
    regiao: Regiao
    registo: Registo
    raiz: Path
    destino: Path
    relatorio: Relatorio
    descarregar: bool = True
    # Os limites dos concelhos, quando a região os declara. É `None` para uma
    # região que não tem carta administrativa — a de prova, por exemplo, que é
    # inventada — e aí a pergunta «isto é da região?» volta a ser respondida
    # pela caixa.
    territorio: Territorio | None = None

    def dentro(self, lat: float, lon: float) -> bool:
        """É da região, este ponto?

        Pela geometria dos concelhos quando ela existe; pela caixa quando não.
        A diferença não é pequena: a caixa é um retângulo e apanha o que está à
        volta. Quem chama isto não precisa de saber qual das duas respondeu — o
        relatório é que diz, com a lacuna `territorio.sem-caop`.
        """
        if self.territorio is not None:
            return self.territorio.contem(lat, lon)
        return self.regiao.caixa.contem(lat, lon)

    def caminho_da_fonte(self, id_fonte: str) -> Path:
        return self.registo.caminho(id_fonte, descarregar=self.descarregar)

    def caminho_de_dados(self, relativo: str) -> Path:
        """Um ficheiro que a RECEITA DA REGIÃO nomeia, resolvido onde a região vive.

        A receita escreve `data/manual/<regiao>/tap/constancia.yaml` e não sabe
        contra o quê isso se resolve — nem deve. Quando a região vive neste
        repositório, é a mesma coisa que `ctx.raiz`; quando vive noutro, é lá
        que estão os PDF, e resolver aqui dava «falta a transcrição» para um
        ficheiro que existe, a três centímetros, noutra raiz.

        Não é hipotético: foi exatamente isto que bloqueou três circuitos do
        transporte a pedido na primeira construção feita com a região de fora.
        """
        return self.regiao.raiz_de_dados / relativo

    def caminho_curto(self, caminho: Path) -> str:
        """O caminho como se escreve num relatório: relativo à raiz a que pertence.

        Um ficheiro pode vir de qualquer uma das raízes, e `relative_to` da
        errada levanta `ValueError`. Um relatório não é sítio para rebentar.
        """
        for raiz in (self.raiz, self.regiao.raiz_de_dados):
            try:
                return str(caminho.relative_to(raiz))
            except ValueError:
                continue
        return str(caminho)

    def caminho_de_saida(self, saida: Saida) -> Path:
        if not saida.saida:
            raise ValueError(f"a saída de {saida.leitor} não declara `saida:`")
        return self.destino / saida.saida


@dataclass
class Resultado:
    contagens: dict[str, Any] = field(default_factory=dict)
    saidas: dict[str, str] = field(default_factory=dict)
    notas: list[str] = field(default_factory=list)


class Leitor(Protocol):
    nome: str

    def __call__(self, ctx: Contexto, saida: Saida) -> Resultado: ...


def verificar_esperado(
    ctx: Contexto, saida: Saida, chave: str, obtido: int, esperado: int | None
) -> None:
    """Um número que a região declara esperar e que não bate é uma lacuna.

    Não é um erro: o mundo muda, e uma estação de bicicletas nova no
    OpenStreetMap não é um defeito do pipeline. Mas também não é silêncio — se
    ninguém der por isso, o dia em que um filtro partir e passar a devolver
    zero é o dia em que o produto deixa de mostrar bicicletas e ninguém repara.
    """
    if esperado is None or obtido == esperado:
        return
    ctx.relatorio.lacuna(
        id=f"{saida.leitor}.{chave}.contagem",
        o_que=f"{chave}: esperava {esperado}, obtive {obtido}",
        onde=f"regioes/{ctx.regiao.id}/fontes.yaml → {saida.leitor} → {saida.saida or chave}",
        porque_importa=(
            "O número esperado veio de uma contagem feita sobre os dados reais. Uma diferença é "
            "ou o mundo a mudar — e então o número é que está velho — ou o filtro a partir-se, e "
            "um filtro partido devolve zero em silêncio."
        ),
        o_que_fazer=(
            "Confirmar qual dos dois mudou. Se foi o mundo, atualizar `esperado` com a data ao "
            "lado. Se foi o filtro, corrigi-lo."
        ),
        quantos=obtido,
    )
