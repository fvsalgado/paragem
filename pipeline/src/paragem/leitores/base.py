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

        A receita escreve `data/manual/<regiao>/tap/<circuito>.yaml` e não sabe
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


def concelhos_do_feriado_municipal(
    ctx: Contexto,
    saida: Saida,
    regra: Any,
    servico_da_viagem: dict[str, str],
    concelhos_da_viagem: dict[str, set[str] | None],
    com_feriado: set[str],
) -> dict[str, frozenset[str]]:
    """Os concelhos cujo feriado municipal vale para cada serviço do feed.

    É o que se passa a `Calendario.resolver(..., concelhos=)`, e só tem efeito
    quando a região declara que um feriado municipal se faz como feriado. A
    regra é sobre VIAGENS — as que passam no concelho, ou as que andam só lá
    dentro —, e um calendário de serviço é sobre SERVIÇOS: quando todas as
    viagens de um serviço caem do mesmo lado, aplica-se ao serviço inteiro.

    **Quando caem dos dois lados, não se aplica, e diz-se.** Aplicar o feriado
    ao serviço inteiro suprimia viagens que não passam no concelho; não o
    aplicar anuncia viagens que não andam. O que resolve é partir o serviço
    por concelho, e isso ainda não está feito — fica na lacuna, com os
    serviços que precisam dele, e não escondido numa das duas escolhas erradas.

    O mesmo vale para uma viagem cujas paragens não se sabem situar num
    concelho: sem carta administrativa, ou sem `concelho:` declarado na saída,
    não há a quem aplicar o feriado.
    """
    if getattr(regra, "regra", None) != "como-feriado" or not com_feriado:
        return {}
    so_dentro = regra.ambito == "viagens-so-no-concelho"
    por_servico: dict[str, set[frozenset[str]]] = {}
    sem_concelho: set[str] = set()
    for viagem, servico in servico_da_viagem.items():
        onde = concelhos_da_viagem.get(viagem)
        if onde is None:
            sem_concelho.add(servico)
            continue
        if so_dentro:
            aplica = frozenset(onde) if len(onde) == 1 and onde <= com_feriado else frozenset()
        else:
            aplica = frozenset(onde & com_feriado)
        por_servico.setdefault(servico, set()).add(aplica)

    aplicar: dict[str, frozenset[str]] = {}
    partidos: list[str] = []
    for servico, conjuntos in sorted(por_servico.items()):
        if servico in sem_concelho:
            continue
        if len(conjuntos) == 1:
            (unico,) = conjuntos
            if unico:
                aplicar[servico] = unico
            continue
        quais = sorted({c for x in conjuntos for c in x})
        partidos.append(f"{servico}: só parte das viagens passa em {', '.join(quais)}")

    if partidos or sem_concelho:
        ctx.relatorio.lacuna(
            id=f"{saida.fonte}.feriados-municipais-por-partir",
            o_que="Serviços em que o feriado municipal só apanha parte das viagens",
            onde=f"regioes/{ctx.regiao.id}/calendario.yaml → feriados_municipais_nos_horarios",
            porque_importa=(
                "A regra está declarada e vale para estas viagens, mas não para as outras do "
                "mesmo serviço. Aplicá-la ao serviço inteiro suprimia viagens que não passam "
                "no concelho do feriado; não a aplicar anuncia viagens que não andam. Nestes "
                "serviços ficou como estava, e por isso o feriado não se vê neles."
            ),
            o_que_fazer=(
                "Partir o serviço por concelho no pipeline, ou situar as paragens num concelho "
                "(carta administrativa da região, ou `concelho:` na saída)."
            ),
            quantos=len(partidos) + len(sem_concelho),
            quais=partidos + [f"{s}: viagens sem concelho conhecido" for s in sorted(sem_concelho)],
        )
    return aplicar
