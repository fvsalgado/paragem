"""Descobrir que viagem de um levantamento é a viagem que o papel descreve.

O caderno de horários de uma operadora marca a hora em cerca de um terço dos
pontos de um percurso interurbano. As outras duas terças partes existem — o
autocarro pára lá — mas o papel não as escreve, porque um quadro com sessenta
linhas não cabe numa página.

Quem as sabe é um levantamento que traga a SEQUÊNCIA de cada viagem. Para o
usar, é preciso primeiro dizer qual das viagens do levantamento é esta viagem
do papel. É isso que este módulo faz, e faz por nomes: alinha as duas
sequências como se alinham duas versões de um texto, ficando com o
emparelhamento que maximiza a semelhança **sem trocar a ordem**.

A ordem é a parte que interessa. Um emparelhamento que trocasse a ordem podia
casar nomes mais parecidos, e produzia uma viagem que passa duas vezes no
mesmo sítio ao contrário — que é exatamente o defeito que, noutra construção,
pôs um autocarro a 708 km/h.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from .nomes import sim

# Abaixo desta semelhança dois nomes não se emparelham, por mais que o resto
# da sequência peça. É o travão contra alinhar «Fonte Nova» com «Fontainhas»
# só porque ficam no mesmo sítio da lista.
LIMIAR_DO_PAR = 0.34

# Uma viagem só se dá por alinhada acima disto, e com pelo menos metade dos
# pontos do papel emparelhados. Um alinhamento fraco herda a sequência errada,
# e uma sequência errada é pior do que sequência nenhuma.
LIMIAR_DA_VIAGEM = 0.45


class TemNome(Protocol):
    nome: str


@dataclass
class Alinhamento:
    """O que se soube de uma viagem do papel."""

    indice: int
    linha: str
    viagem: str | None = None
    pontuacao: float | None = None
    # (índice no papel, identificador do ponto no levantamento, semelhança)
    pares: list[tuple[int, str, float]] = field(default_factory=list)
    n_papel: int = 0
    n_levantamento: int | None = None

    @property
    def alinhou(self) -> bool:
        return self.viagem is not None


def emparelhar(
    nomes_a: list[str], nomes_b: list[str], limiar: float = LIMIAR_DO_PAR
) -> list[tuple[int, int, float]]:
    """O melhor emparelhamento monótono entre duas listas de nomes.

    Programação dinâmica, como o alinhamento de duas sequências: em cada
    posição decide-se saltar de um lado, saltar do outro, ou casar os dois. O
    que se maximiza é a soma das semelhanças.
    """
    n, m = len(nomes_a), len(nomes_b)
    semelhanca = [[sim(a, b) for b in nomes_b] for a in nomes_a]
    melhor = [[0.0] * (m + 1) for _ in range(n + 1)]
    veio_de: list[list[tuple[Any, ...]]] = [[()] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            valor = melhor[i - 1][j]
            origem: tuple[Any, ...] = ("i",)
            if melhor[i][j - 1] > valor:
                valor, origem = melhor[i][j - 1], ("j",)
            s = semelhanca[i - 1][j - 1]
            if s >= limiar and melhor[i - 1][j - 1] + s > valor:
                valor, origem = melhor[i - 1][j - 1] + s, ("d", s)
            melhor[i][j], veio_de[i][j] = valor, origem
    pares: list[tuple[int, int, float]] = []
    i, j = n, m
    while i > 0 and j > 0:
        origem = veio_de[i][j]
        if not origem:
            break
        if origem[0] == "d":
            pares.append((i - 1, j - 1, origem[1]))
            i, j = i - 1, j - 1
        elif origem[0] == "i":
            i -= 1
        else:
            j -= 1
    return pares[::-1]


def _segundos(hora: str | None) -> int | None:
    partes = str(hora or "").split(":")
    if len(partes) < 2 or not partes[0].strip().isdigit():
        return None
    return int(partes[0]) * 3600 + int(partes[1]) * 60 + (int(partes[2]) if len(partes) > 2 else 0)


def _pontuar(
    viagem_do_papel: Any,
    sequencia: dict[str, Any],
    pares: list[tuple[int, int, float]],
    sentidos: Mapping[str, str] | None = None,
) -> float:
    """Quanto esta sequência explica esta viagem.

    A semelhança dos nomes é o grosso. Por cima vêm dois ajustes que já
    decidiram casos reais:

    - **o tempo tem de correr do mesmo modo**: entre dois pontos emparelhados,
      se um lado demora três vezes mais do que o outro, ou são viagens
      diferentes ou o emparelhamento saltou meio percurso;
    - **a hora de partida aproxima**: duas viagens da mesma linha à mesma hora
      são quase sempre a mesma; à distância de horas, não são;
    - **o sentido afasta**: uma linha e a sua inversa têm os mesmos nomes pela
      ordem contrária, e um percurso que sobe emparelha com um que desce se
      ninguém disser que são coisas diferentes. Só conta quando os dois lados
      declaram sentido — e a leitura do sentido do levantamento vem da receita,
      que é quem sabe o que «0» quer dizer naquele portal.
    """
    if not pares:
        return 0.0
    pontos_da_sequencia = sequencia["pontos"]
    pontos = sum(s for _, _, s in pares) / max(1, len(viagem_do_papel.paragens))
    castigo = 0.0
    for (i1, j1, _), (i2, j2, _) in zip(pares, pares[1:], strict=False):
        t1 = _segundos(viagem_do_papel.paragens[i1].partida)
        t2 = _segundos(viagem_do_papel.paragens[i2].partida)
        u1 = _segundos(pontos_da_sequencia[j1].get("hora"))
        u2 = _segundos(pontos_da_sequencia[j2].get("hora"))
        if None in (t1, t2, u1, u2):
            continue
        dp, dl = t2 - t1, u2 - u1  # type: ignore[operator]
        if dl > 0 and dp > 0 and (dp / dl > 2.5 or dl / dp > 2.5) and abs(dp - dl) > 420:
            castigo += 0.05
    partida_papel = _segundos(viagem_do_papel.paragens[0].partida)
    partida_seq = _segundos(pontos_da_sequencia[0].get("hora"))
    premio = 0.0
    if partida_papel is not None and partida_seq is not None:
        diferenca = abs(partida_papel - partida_seq)
        premio = 0.08 if diferenca <= 300 else (0.04 if diferenca <= 1800 else 0.0)
    sentido_papel = getattr(viagem_do_papel, "sentido", None)
    sentido_seq = (sentidos or {}).get(str(sequencia.get("sentido") or ""))
    if sentido_papel and sentido_seq and sentido_papel != sentido_seq:
        castigo += 0.15
    return pontos - castigo + premio


def alinhar(
    viagens: list[Any],
    sequencias: list[dict[str, Any]],
    nomes: Mapping[str, str],
    *,
    sentidos: Mapping[str, str] | None = None,
    limiar_da_viagem: float = LIMIAR_DA_VIAGEM,
    limiar_do_par: float = LIMIAR_DO_PAR,
) -> list[Alinhamento]:
    """Para cada viagem do papel, a sequência da mesma linha que melhor a explica.

    `nomes` diz como se chama cada ponto do levantamento — os pontos vêm por
    identificador, e o nome vive no universo de paragens. Passá-lo de fora é o
    que deixa este módulo testar-se com meia dúzia de nomes inventados.
    """
    por_linha: dict[str, list[dict[str, Any]]] = {}
    for s in sequencias:
        por_linha.setdefault(str(s.get("linha") or ""), []).append(s)

    saida: list[Alinhamento] = []
    for indice, viagem in enumerate(viagens):
        nomes_papel = [p.nome for p in viagem.paragens]
        melhor: tuple[float, dict[str, Any], list[tuple[int, int, float]]] | None = None
        for sequencia in por_linha.get(str(viagem.linha), []):
            pontos = sequencia["pontos"]
            pares = emparelhar(nomes_papel, [nomes.get(p["id"], "") for p in pontos], limiar_do_par)
            if not pares:
                continue
            pontuacao = _pontuar(viagem, sequencia, pares, sentidos)
            if melhor is None or pontuacao > melhor[0]:
                melhor = (pontuacao, sequencia, pares)
        alinhamento = Alinhamento(indice=indice, linha=str(viagem.linha), n_papel=len(nomes_papel))
        if (
            melhor
            and melhor[0] >= limiar_da_viagem
            and len(melhor[2]) >= max(2, 0.5 * len(nomes_papel))
        ):
            pontuacao, sequencia, pares = melhor
            alinhamento.viagem = sequencia["viagem"]
            alinhamento.pontuacao = round(pontuacao, 3)
            alinhamento.pares = [
                (i, sequencia["pontos"][j]["id"], round(s, 2)) for i, j, s in pares
            ]
            alinhamento.n_levantamento = len(sequencia["pontos"])
        elif melhor:
            alinhamento.pontuacao = round(melhor[0], 3)
        saida.append(alinhamento)
    return saida
