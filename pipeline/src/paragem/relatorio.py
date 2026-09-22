"""O relatório de lacunas.

Este ficheiro é o mecanismo que torna a regra de não inventar dados possível de
cumprir. Sem ele, a única forma de um horário incompleto não parecer completo
seria alguém lembrar-se — e ninguém se lembra.

Uma lacuna tem sempre quatro coisas: **o que falta**, **onde**, **porque
importa** e **o que fazer**. As três primeiras são a honestidade; a quarta é o
que distingue um relatório de uma queixa.

Três graus, e são diferentes:

- `bloqueia` — a construção não produz feed. Zero erros do validador é
  obrigatório (CLAUDE.md §9); um erro é isto.
- `lacuna` — o feed sai, e sai incompleto. Doze paragens sem coordenadas são
  isto: o que existe está certo, e falta o que falta.
- `aviso` — vale a pena olhar, não trava nada.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

BLOQUEIA = "bloqueia"
LACUNA = "lacuna"
AVISO = "aviso"

_ORDEM = {BLOQUEIA: 0, LACUNA: 1, AVISO: 2}
_SIMBOLO = {BLOQUEIA: "✗", LACUNA: "▲", AVISO: "·"}


@dataclass
class Lacuna:
    id: str
    gravidade: str
    o_que: str
    onde: str = ""
    porque_importa: str = ""
    o_que_fazer: str = ""
    quantos: int | None = None
    quais: list[str] = field(default_factory=list)


@dataclass
class Relatorio:
    regiao: str
    comecou_em: str = field(default_factory=lambda: datetime.now(UTC).isoformat(timespec="seconds"))
    lacunas: list[Lacuna] = field(default_factory=list)
    contagens: dict[str, Any] = field(default_factory=dict)
    saidas: dict[str, str] = field(default_factory=dict)
    proveniencia: list[dict[str, Any]] = field(default_factory=list)

    # --- registar --------------------------------------------------------

    def lacuna(self, **kw: Any) -> Lacuna:
        kw.setdefault("gravidade", LACUNA)
        lac = Lacuna(**kw)
        self.lacunas.append(lac)
        return lac

    def bloqueia(self, **kw: Any) -> Lacuna:
        kw["gravidade"] = BLOQUEIA
        return self.lacuna(**kw)

    def aviso(self, **kw: Any) -> Lacuna:
        kw["gravidade"] = AVISO
        return self.lacuna(**kw)

    def contar(self, chave: str, valor: Any) -> None:
        self.contagens[chave] = valor

    # --- ler -------------------------------------------------------------

    @property
    def bloqueios(self) -> list[Lacuna]:
        return [x for x in self.lacunas if x.gravidade == BLOQUEIA]

    @property
    def tem_bloqueios(self) -> bool:
        return bool(self.bloqueios)

    def por_gravidade(self) -> list[Lacuna]:
        return sorted(self.lacunas, key=lambda x: (_ORDEM.get(x.gravidade, 9), x.id))

    def contagem_por_gravidade(self) -> dict[str, int]:
        return {
            g: sum(1 for x in self.lacunas if x.gravidade == g) for g in (BLOQUEIA, LACUNA, AVISO)
        }

    # --- escrever --------------------------------------------------------

    def escrever(self, pasta: Path) -> tuple[Path, Path]:
        pasta = Path(pasta)
        pasta.mkdir(parents=True, exist_ok=True)
        j = pasta / f"{self.regiao}.json"
        m = pasta / f"{self.regiao}.md"
        with open(j, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "regiao": self.regiao,
                    "comecou_em": self.comecou_em,
                    "contagens": self.contagens,
                    "saidas": self.saidas,
                    "proveniencia": self.proveniencia,
                    "lacunas": [asdict(x) for x in self.por_gravidade()],
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
        m.write_text(self.markdown(), encoding="utf-8")
        return j, m

    def markdown(self) -> str:
        c = self.contagem_por_gravidade()
        linhas = [
            f"# Relatório de lacunas — {self.regiao}",
            "",
            f"Construído a {self.comecou_em}.",
            "",
            f"**{c[BLOQUEIA]}** que bloqueiam · **{c[LACUNA]}** lacunas · **{c[AVISO]}** avisos.",
            "",
        ]

        if not self.lacunas:
            linhas += ["Nenhuma lacuna registada.", ""]

        for gravidade, titulo, intro in (
            (
                BLOQUEIA,
                "O que bloqueia",
                "A construção não produz um feed utilizável enquanto isto estiver assim.",
            ),
            (
                LACUNA,
                "O que falta",
                "O feed sai, e sai incompleto. O que está cá está certo; isto é o que não está.",
            ),
            (AVISO, "O que vale a pena olhar", ""),
        ):
            desta = [x for x in self.por_gravidade() if x.gravidade == gravidade]
            if not desta:
                continue
            linhas += [f"## {titulo}", ""]
            if intro:
                linhas += [intro, ""]
            for x in desta:
                quantos = f" ({x.quantos})" if x.quantos is not None else ""
                linhas.append(f"### {_SIMBOLO[gravidade]} {x.o_que}{quantos}")
                linhas.append("")
                if x.onde:
                    linhas += [f"**Onde:** {x.onde}", ""]
                if x.porque_importa:
                    linhas += [f"**Porque importa:** {x.porque_importa}", ""]
                if x.o_que_fazer:
                    linhas += [f"**O que fazer:** {x.o_que_fazer}", ""]
                if x.quais:
                    mostra = x.quais[:40]
                    linhas.append("```")
                    linhas += mostra
                    if len(x.quais) > len(mostra):
                        linhas.append(f"… e mais {len(x.quais) - len(mostra)}")
                    linhas += ["```", ""]

        if self.saidas:
            linhas += ["## O que saiu", "", "| ficheiro | onde |", "| --- | --- |"]
            linhas += [f"| {k} | `{v}` |" for k, v in sorted(self.saidas.items())]
            linhas.append("")

        if self.contagens:
            linhas += ["## Contagens", "", "| o quê | quantos |", "| --- | --- |"]
            linhas += [f"| {k} | {v} |" for k, v in sorted(self.contagens.items())]
            linhas.append("")

        if self.proveniencia:
            linhas += [
                "## Proveniência",
                "",
                "De onde veio cada coisa, e sob que termos.",
                "",
                "| fonte | licença | atribuição |",
                "| --- | --- | --- |",
            ]
            for p in self.proveniencia:
                linhas.append(
                    f"| {p.get('nome', p['id'])} | {p.get('licenca') or '—'} "
                    f"| {p.get('atribuicao') or '—'} |"
                )
            linhas.append("")

        return "\n".join(linhas)
