"""`horarios-pdf-cartaz` — o cartaz de horários de uma câmara, em dados.

Os urbanos municipais não estão em GTFS nenhum. O que existe é o cartaz que a
câmara publica: uma folha com o nome da paragem à esquerda e uma coluna por
viagem. Este leitor transforma-o no que a página da linha precisa — a
sequência de paragens, as viagens, as horas e as regras de serviço escritas no
rodapé.

**Não produz GTFS, e é de propósito.** Um feed precisa de coordenadas para
cada paragem, e estes cartazes não as têm: dos 94 nomes distintos dos quatro
cartazes dos TUT, 39 casam com uma paragem que já conhecemos e 55 não casam
com nada. Inventar as que faltam era pôr paragens no sítio errado no mapa e no
planeador (§4.4). Enquanto elas não vierem — do STePP, do OpenStreetMap ou da
própria câmara —, o que se publica é o HORÁRIO, que é o que responde à
pergunta que se faz numa paragem: «a que horas passa?».

O papel lê-se no `pdf_cartazes.py`, que não sabe nada disto.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from ..regiao import Saida
from . import pdf_cartazes as cartazes
from .base import Contexto, Resultado, verificar_esperado

# O MESMO guarda das transcrições à mão, e de propósito: uma regra declarada
# na receita é uma transcrição como outra qualquer, e confere-se contra o PDF.
from .horarios_manuais import _simples, _texto

nome = "horarios-pdf-cartaz"

# Quanto de uma viagem pode ser impossível antes de a viagem inteira deixar de
# se publicar. Uma gralha numa hora entre quarenta e seis é uma gralha; um
# quinto das horas fora de ordem é a leitura a estar errada.
QUOTA_DE_HORAS_IMPOSSIVEIS = 0.1


# COMO SE LÊ UM PARÂMETRO DO `fontes.yaml`, E PORQUE ESTÁ NUMA TABELA.
#
# Já aconteceu duas vezes: um parâmetro declarado na receita da região que o
# leitor nunca passava ao `pdf_cartazes`. Não rebenta — o cartaz lê-se na
# mesma, com a afinação por omissão, e sai um horário errado com ar de certo.
# Do `excluir_linhas` de Vila de Rei saíram as oito viagens a recuar, porque o
# painel das ligações intermunicipais continuava a entrar na grelha.
#
# Com a tabela, um parâmetro novo no `pdf_cartazes.ler` que aqui falte é
# apanhado por um teste que compara os dois — e não por um relatório meses
# depois.
AFINACOES: dict[str, Any] = {
    "numera_paragens": bool,
    "quebra_de_quadro": None,
    "rotulo_de_coluna": None,
    "vao_entre_quadros": float,
    "nome_a_direita": bool,
    "minimo_para_abrir": int,
    "excluir_linhas": None,
}


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    caminho = ctx.caminho_da_fonte(saida.fonte)
    p = saida.params

    cartaz = cartazes.ler(_bbox(caminho), **_afinacao(p))
    viagens = cartazes.viagens(cartaz)
    # A LIMPEZA DE GRALHAS É OPT-IN, e tem de ser.
    #
    # Tirar uma hora impossível de uma viagem salva o resto dela — mas só
    # quando a hora é mesmo uma gralha de quem compôs o cartaz. Ligada a
    # tudo, esta limpeza faria passar documentos que estão é MAL LIDOS: um
    # cartaz com as colunas desalinhadas publicava-se como se estivesse
    # conferido, e uma hora errada é pior do que uma hora em falta.
    #
    # Por isso declara-se onde alguém OLHOU PARA A FOLHA. E olhar é medir: o
    # desdobrável do TURE esteve aqui de fora com a nota de que as quatro
    # horas fora de ordem dele «não são gralhas, são colunas desalinhadas».
    # Não eram. As colunas batem certo ao ponto do papel — x=220 dá 8.04,
    # 8.35 e 8.06 em três paragens seguidas, e x=236 dá 8.35, 8.36 e 8.37 nas
    # mesmas três. A folha imprime 8.35 onde devia estar 8.05. Foi um juízo
    # à vista, e custou cinco carreiras do Entroncamento sem horário.
    impossiveis: list[str] = []
    if p.get("tolera_gralhas"):
        viagens, impossiveis = _limpar(viagens)
    if impossiveis:
        ctx.relatorio.lacuna(
            id=f"cartaz.{saida.fonte}.hora-impossivel",
            o_que=f"Horas impossíveis no cartaz de {p.get('linha', saida.fonte)}",
            onde=f"data/manual/{ctx.regiao.id}/",
            porque_importa=(
                "Estão escritas assim no cartaz: uma hora que faz a viagem recuar e "
                "voltar a andar. São gralhas de quem o compôs — no Circuito Amarelo há "
                "um «14:59» entre um «13:55» e um «14:00», que só pode ser 13:59. "
                "Corrigi-las era inventar (CLAUDE.md §4.4); publicá-las era mandar "
                "alguém à paragem a uma hora que não existe."
            ),
            o_que_fazer=(
                "A paragem sai da viagem, e fica nomeada aqui para a autoridade de "
                "transportes poder corrigir o cartaz. Quem more ali continua a ver as "
                "outras viagens do circuito."
            ),
            quantos=len(impossiveis),
            quais=impossiveis,
        )

    # AS REGRAS DE SERVIÇO: as do cartaz, ou as que alguém leu do cartaz.
    #
    # O extrator procura prosa com «sábados», «feriados», «dias úteis». Num
    # cartaz com a regra sozinha no rodapé — os dos TUT — acerta. Numa FOLHA
    # DESENHADA não: o desdobrável do TURE tem uma caixa de preçário e outra
    # de locais de venda, e delas saíam «SERVIÇOS SOCIAIS 3.ª Feira a Sábado»
    # e «Tarifas em vigor» publicadas como regras da carreira. As regras a
    # sério dele estão numa legenda de rodapé que o extrator nem via.
    #
    # Por isso a região pode DECLARÁ-LAS. E não é confiar em quem escreve: a
    # mesma guarda das transcrições à mão (§9, «introdução manual assistida»)
    # confere cada uma contra o texto do PDF, sem espaços nem acentos. Uma
    # regra que não esteja no cartaz BLOQUEIA a construção.
    regras = list(p.get("regras") or []) or cartaz.notas
    cru = _simples(_texto(caminho)) if p.get("regras") else ""
    se_declaradas = [r for r in (p.get("regras") or []) if _simples(r) not in cru]
    if se_declaradas:
        ctx.relatorio.bloqueia(
            id=f"cartaz.{saida.fonte}.regra-inventada",
            o_que=f"Regra declarada que não está no cartaz de {p.get('linha', saida.fonte)}",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml → {saida.fonte} → regras",
            porque_importa=(
                "Estas regras estão na receita da região e NÃO estão no PDF de onde ela diz "
                "que vêm. Uma regra de serviço inventada manda alguém esperar num dia em que "
                "não há autocarro, e o CLAUDE.md §4.4 não o permite."
            ),
            o_que_fazer="Conferir cada regra contra o cartaz, palavra a palavra.",
            quantos=len(se_declaradas),
            quais=se_declaradas,
        )
        return Resultado(contagens={f"{saida.fonte}.regras_por_conferir": len(se_declaradas)})

    # A VERIFICAÇÃO QUE DECIDE SE ISTO SE PUBLICA.
    #
    # Uma viagem cujas horas recuam foi lida com uma coluna trocada — é a
    # regra do §6.1 — e uma hora errada é pior do que uma hora em falta: quem
    # a lê perde o autocarro e fica a achar que leu bem. Um cartaz com
    # viagens assim não sai daqui.
    recuam = [v for v in viagens if not _sobe(v)]
    if recuam:
        ctx.relatorio.lacuna(
            id=f"cartaz.{saida.fonte}.desalinhado",
            o_que=f"O cartaz de {p.get('linha', saida.fonte)} não se lê com confiança",
            onde=f"data/manual/{ctx.regiao.id}/",
            porque_importa=(
                "Estas viagens saem com horas a recuar, o que só acontece quando uma "
                "coluna foi lida na paragem errada. As outras do mesmo cartaz podem "
                "estar certas — e podem não estar, e não há como saber sem as "
                "conferir uma a uma. Publicar uma hora que ninguém verificou é o que "
                "o CLAUDE.md §4.4 proíbe."
            ),
            o_que_fazer=(
                "Pedir o horário à câmara em formato de dados — uma folha de cálculo "
                "chega — em vez de o ler de um cartaz desenhado para ser afixado."
            ),
            quantos=len(recuam),
            quais=[f"viagem das {v.partida}" for v in recuam[:10]],
        )
        return Resultado(
            contagens={
                f"{saida.fonte}.viagens_lidas": len(viagens),
                f"{saida.fonte}.viagens_a_recuar": len(recuam),
                f"{saida.fonte}.publicado": 0,
            },
            notas=[f"{saida.fonte}: lido, não publicado — {len(recuam)} viagens a recuar."],
        )

    linha = _linha(saida, cartaz, viagens, regras)
    caidos = len(cartaz.quadros) - len(linha["quadros"])
    if caidos:
        ctx.relatorio.lacuna(
            id=f"cartaz.{saida.fonte}.quadro-sem-viagens",
            o_que=f"Grelhas do cartaz de {p.get('linha', saida.fonte)} sem viagens que cheguem",
            onde=f"data/manual/{ctx.regiao.id}/",
            porque_importa=(
                "Uma grelha que fica com menos de duas viagens depois de se tirarem as "
                "horas impossíveis não é um horário: é um pedaço mal lido da folha. "
                "Publicá-la dava a alguém uma hora que ninguém escreveu."
            ),
            o_que_fazer=(
                "Conferir estas grelhas no cartaz. Se forem horário a sério, é a leitura "
                "que precisa de um parâmetro; se não forem, está certo ficarem de fora."
            ),
            quantos=caidos,
        )
    destino = ctx.caminho_de_saida(saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps(linha, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    paragens = {n for q in cartaz.quadros for n in q.paragens}
    fora = [n for q in cartaz.quadros for n in q.desalinhadas]
    if fora:
        ctx.relatorio.lacuna(
            id=f"cartaz.{saida.fonte}.paragem-fora",
            o_que=f"Paragens do cartaz de {p.get('linha', saida.fonte)} que ficaram de fora",
            onde=f"data/manual/{ctx.regiao.id}/",
            porque_importa=(
                "O cartaz imprime estas paragens com um horário próprio, mais denso do "
                "que o da linha — as colunas assentam, os valores não são os daquelas "
                "viagens. Encaixá-las dava a cada viagem uma hora que não é a dela."
            ),
            o_que_fazer="Pedir à câmara o horário destas paragens em separado.",
            quantos=len(fora),
            quais=fora,
        )

    verificar_esperado(ctx, saida, "viagens", len(viagens), p.get("esperado_viagens"))
    verificar_esperado(ctx, saida, "paragens", len(paragens), p.get("esperado_paragens"))

    return Resultado(
        contagens={
            f"{saida.fonte}.viagens": len(viagens),
            f"{saida.fonte}.paragens": len(paragens),
            f"{saida.fonte}.quadros": len(cartaz.quadros),
        },
        saidas={saida.saida or "": str(destino.relative_to(ctx.raiz))},
    )


def _afinacao(p: dict[str, Any]) -> dict[str, Any]:
    """Os parâmetros da receita, com o tipo que o leitor espera.

    Só passa os que a receita declara: o que falta fica com a omissão do
    `pdf_cartazes`, que é onde ela está escrita uma só vez.
    """
    return {
        chave: (tipo(p[chave]) if tipo else p[chave])
        for chave, tipo in AFINACOES.items()
        if p.get(chave) is not None
    }


def _bbox(pdf: Path) -> str:
    """A saída `-bbox-layout`, que dá a posição de cada palavra em pontos.

    Escreve para ficheiro porque é assim que o pdftotext a produz — `-` só
    serve para a saída de texto.
    """
    with tempfile.TemporaryDirectory() as pasta:
        xml = Path(pasta) / "cartaz.xml"
        subprocess.run(
            ["pdftotext", "-bbox-layout", str(pdf), str(xml)],
            capture_output=True,
            check=True,
        )
        return xml.read_text(encoding="utf-8")


def _sobe(v: cartazes.Viagem) -> bool:
    horas = [p.hora for p in v.passagens]
    return horas == sorted(horas)


def _limpar(viagens: list[cartazes.Viagem]) -> tuple[list[cartazes.Viagem], list[str]]:
    """Tira de cada viagem as horas que não podem estar certas.

    **O que se tira é o mínimo.** De «13:55, 14:59, 14:00, 14:02» há duas
    leituras possíveis — deitar fora o 14:59, ou deitar fora o 14:00 e o
    14:02 — e a certa é a que salva mais horas. É a subsequência não
    decrescente mais longa, e não um varrimento da esquerda para a direita:
    esse tirava o 14:00 e o 14:02, que são os dois que estão certos.

    Uma viagem com demasiadas horas assim não é uma gralha, é a leitura a
    estar errada — essa sai inteira, e o leitor trata dela a seguir.
    """
    limpas: list[cartazes.Viagem] = []
    fora: list[str] = []
    for v in viagens:
        manter = _mais_longa_nao_decrescente([p.hora for p in v.passagens])
        if len(manter) == len(v.passagens):
            limpas.append(v)
            continue
        perdidas = [p for i, p in enumerate(v.passagens) if i not in manter]
        if len(perdidas) > len(v.passagens) * QUOTA_DE_HORAS_IMPOSSIVEIS:
            limpas.append(v)  # não é gralha: vai a jogo com a verificação de cima
            continue
        fora += [f"{p.paragem} às {p.hora}" for p in perdidas]
        limpas.append(
            cartazes.Viagem(
                v.quadro, v.coluna, [p for i, p in enumerate(v.passagens) if i in manter]
            )
        )
    return limpas, fora


def _mais_longa_nao_decrescente(horas: list[str]) -> set[int]:
    """Os índices da subsequência não decrescente mais longa."""
    melhor: list[list[int]] = []
    mais_longa: list[int] = []
    for i, h in enumerate(horas):
        atual = [i]
        for j in range(i):
            if horas[j] <= h and len(melhor[j]) + 1 > len(atual):
                atual = [*melhor[j], i]
        melhor.append(atual)
        if len(atual) > len(mais_longa):
            mais_longa = atual
    return set(mais_longa)


def _linha(
    saida: Saida,
    cartaz: cartazes.Cartaz,
    viagens: list[cartazes.Viagem],
    regras: list[str],
) -> dict[str, Any]:
    p = saida.params
    return {
        "id": p.get("id", saida.fonte),
        "nome": p.get("linha", saida.fonte),
        "operador": p.get("operador", ""),
        "rede": p.get("rede", ""),
        "cor": p.get("cor", ""),
        "modo": saida.modo or "urbano-municipal",
        # As regras de serviço, como o cartaz as escreve. Não se interpretam:
        # quem escreveu «exceto terças-feiras» sabe melhor do que nós o que
        # quis dizer, e uma tradução para código de serviço perdia-o.
        "regras": regras,
        # UM QUADRO QUE FICOU COM UMA VIAGEM NÃO É UM HORÁRIO.
        #
        # O mínimo de viagens já existia, mas media as COLUNAS da grelha —
        # antes de se tirarem as horas impossíveis e as viagens que não se
        # leem. Do cartaz do TURE saía assim uma sexta grelha com uma viagem
        # e uma paragem chamada «CASAIS CASAL FORMIGOS VIDIGAL 06», que são
        # três nomes e um número de ordem colados: um pedaço mal lido do
        # regresso da Linha Amarela, a caminho de uma página pública.
        #
        # O mínimo passa a medir o que SE PUBLICA. O que cai fica contado no
        # relatório — não desaparece em silêncio.
        "quadros": [
            {
                # O nome da carreira, quando o cartaz empilha várias. Chama-se
                # `nome` porque é o campo que o sítio já lê — as brochuras do
                # transporte a pedido usam-no para o mesmo, e duas chaves para
                # a mesma coisa acabam sempre com uma delas esquecida.
                "nome": q.titulo,
                "paragens": q.paragens,
                "rotulos": q.rotulos,
                # Uma viagem por coluna, na ordem em que o cartaz as imprime.
                "viagens": [
                    {
                        "rotulo": q.rotulo(v.coluna),
                        "passagens": [[pa.paragem, pa.hora] for pa in v.passagens],
                    }
                    for v in viagens
                    if v.quadro == iq
                ],
            }
            for iq, q in enumerate(cartaz.quadros)
            if sum(1 for v in viagens if v.quadro == iq) >= cartazes.MINIMO_DE_VIAGENS
        ],
    }
