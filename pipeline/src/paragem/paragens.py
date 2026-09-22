"""O universo de paragens: tudo o que pode ser a paragem que um horário nomeia.

Um caderno de horários diz «Alvito (Tv. Casal Pinhão)». Não diz onde fica. A
coordenada tem de vir de outro lado — do levantamento da autoridade de
transportes, do registo do regulador, do OpenStreetMap — e a pergunta passa a
ser qual desses pontos é o que o papel nomeia.

Este módulo é o lado fácil dessa pergunta: junta tudo o que pode ser uma
paragem, dá a cada candidato um identificador estável, e sabe responder
depressa a «que candidatos se parecem com este nome?». Quem decide é o
`resolucao.py`.

## Os identificadores

`<prefixo>:<id>`, e o prefixo diz de onde veio: as camadas de um portal
trazem o seu (`g19`, `g15`, `g13`), o registo do regulador identifica-se pela
exportação e pelo código (`st:rod:12345@39.4,-8.2`), o OpenStreetMap e os
pontos marcados à mão pela coordenada (`osm:`, `pt:`).

São **estáveis** de propósito: as decisões manuais apontam para eles, e um
identificador que mude a cada construção torna a decisão de ontem ilegível.
Por isso o ponto entra no identificador onde não há código — dois
levantamentos podem numerar a mesma paragem de maneiras diferentes, mas não a
podem pôr em dois sítios.
"""

from __future__ import annotations

import collections
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .geo import metros
from .nomes import sim, tokens


@dataclass(frozen=True)
class Paragem:
    id: str
    nome: str
    lat: float
    lon: float
    fonte: str
    codigo: str = ""
    local: str = ""
    concelho: str = ""
    # Uma paragem que entra para poder ser escolhida À MÃO, e que as regras
    # automáticas não podem apanhar pelo nome. É o caso das paragens de um
    # serviço diferente — a pedido, por exemplo: o nome é parecido, o sítio é
    # outro, e a semelhança de nomes não sabe a diferença.
    so_por_decisao_manual: bool = False
    # A ordem por que entrou no universo, que é a ordem de autoridade das
    # fontes que a receita declarou. Serve para desempatar: entre dois
    # candidatos com o mesmo nome e a mesma semelhança, ganha o levantamento
    # de quem gere a rede, e não o que a ordem alfabética calhar pôr à frente.
    ordem: int = 0

    @property
    def ponto(self) -> tuple[float, float]:
        return (self.lat, self.lon)


@dataclass
class Universo:
    paragens: dict[str, Paragem] = field(default_factory=dict)
    _indice: dict[str, list[str]] = field(default_factory=dict, repr=False)

    # --- construir --------------------------------------------------------

    def juntar(self, p: Paragem) -> None:
        """Acrescenta uma paragem, se o identificador ainda não existir.

        A primeira ocorrência ganha, e a ordem por que as fontes entram é a
        ordem de autoridade que a receita declarou.
        """
        if p.id not in self.paragens:
            object.__setattr__(p, "ordem", len(self.paragens))
            self.paragens[p.id] = p
            self._indice = {}

    def ponto_manual(self, lat: float, lon: float, nome: str, fonte: str) -> str:
        """Um ponto marcado à mão, com o identificador que a decisão escreveu."""
        ident = f"pt:{lat:.6f},{lon:.6f}"
        # `so_por_decisao_manual` porque é isso que ele é: um ponto que alguém
        # marcou para UM par, com a razão escrita. Deixá-lo entrar nas regras
        # automáticas fazia uma decisão de uma linha espalhar-se às outras que
        # escrevem o mesmo nome, sem ninguém a ter tomado.
        self.juntar(
            Paragem(
                ident,
                nome,
                round(lat, 6),
                round(lon, 6),
                fonte or "manual",
                so_por_decisao_manual=True,
            )
        )
        return ident

    # --- consultar --------------------------------------------------------

    def __contains__(self, ident: str) -> bool:
        return ident in self.paragens

    def __getitem__(self, ident: str) -> Paragem:
        return self.paragens[ident]

    def __len__(self) -> int:
        return len(self.paragens)

    def get(self, ident: str) -> Paragem | None:
        return self.paragens.get(ident)

    @property
    def indice(self) -> dict[str, list[str]]:
        """Palavra → paragens que a têm no nome.

        Sem isto, cada nome do papel compara-se com dezoito mil candidatos, e
        são dois mil nomes. O índice reduz a comparação às que partilham pelo
        menos uma palavra.
        """
        if not self._indice:
            indice: dict[str, list[str]] = collections.defaultdict(list)
            for ident, p in self.paragens.items():
                if p.so_por_decisao_manual:
                    continue
                for t in set(tokens(p.nome)):
                    indice[t].append(ident)
            self._indice = dict(indice)
        return self._indice

    def candidatos(
        self, nome: str, minimo: float = 0.34, quantos: int = 600
    ) -> list[tuple[float, str]]:
        """As paragens que se parecem com este nome, da mais parecida à menos."""
        contagem: collections.Counter[str] = collections.Counter()
        for t in set(tokens(nome)):
            for ident in self.indice.get(t, ()):
                contagem[ident] += 1
        # A ordem de desempate é EXPLÍCITA, e tem de ser. Um nome com palavras
        # comuns — «centro», «escola», «são» — tem milhares de candidatos, e o
        # corte pelos primeiros `quantos` decidia quais ficavam. Com
        # `Counter.most_common` sozinho, a ordem entre iguais vem da ordem de
        # inserção, que vem da iteração de um conjunto de palavras, que em
        # Python varia de processo para processo: duas construções dos mesmos
        # dados davam resoluções diferentes, e a diferença aparecia três
        # paragens à frente, sem nada que a explicasse.
        ordenados = sorted(contagem.items(), key=lambda kv: (-kv[1], self.paragens[kv[0]].ordem))[
            :quantos
        ]
        saida = []
        for ident, _ in ordenados:
            s = sim(nome, self.paragens[ident].nome)
            if s >= minimo:
                saida.append((s, ident))
        saida.sort(key=lambda x: (-x[0], self.paragens[x[1]].ordem))
        return saida

    def perto(self, ponto: tuple[float, float], raio_m: float) -> list[tuple[float, str]]:
        """As paragens a menos de `raio_m` de um ponto, da mais perto à menos."""
        saida = [
            (metros(ponto, p.ponto), ident)
            for ident, p in self.paragens.items()
            if metros(ponto, p.ponto) <= raio_m
        ]
        saida.sort()
        return saida

    # --- guardar e ler ----------------------------------------------------

    def guardar(self, caminho: Path) -> None:
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(
            json.dumps([asdict(p) for p in self.paragens.values()], ensure_ascii=False),
            encoding="utf-8",
        )

    @classmethod
    def ler(cls, caminho: Path) -> Universo:
        dados: list[dict[str, Any]] = json.loads(Path(caminho).read_text(encoding="utf-8"))
        u = cls()
        for d in dados:
            u.paragens[d["id"]] = Paragem(**d)
        return u

    # --- contar -----------------------------------------------------------

    def por_prefixo(self) -> dict[str, int]:
        return dict(collections.Counter(ident.split(":", 1)[0] for ident in self.paragens))
