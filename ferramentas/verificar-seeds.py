#!/usr/bin/env python3
"""A base diz o mesmo que os `regiao.yaml`? Confere-se, região a região.

A tabela `regions` repete o nome e o artigo de cada região (migração 0002) —
o painel precisa deles sem ir buscar ficheiros a lado nenhum. Uma cópia com
verificação é aceitável; uma cópia sem ela é a que diverge em silêncio, e é
isto que a verifica.

Corre depois de `scripts/verify-migrations.sh`, sobre a mesma base, no CI. Lê
a base pelo `psql` — que o runner já tem — e as regiões pelo carregador do
pipeline, para que uma região que viva noutra raiz (docs/RAIZES.md) conte na
mesma.

Três perguntas:

1. toda a linha da base corresponde a uma região declarada em `regioes/`. O
   contrário NÃO se exige: uma região declarada e ainda sem linha é uma
   região real que ainda não nasceu no painel — as migrações só semeiam as
   de prova —, e diz-se, sem reprovar;
2. onde há os dois, o nome, o artigo e o domínio batem certo, letra a letra;
3. nenhum módulo desligado na base é um modo que a região nem sequer declara —
   desligar o que não existe é um sinal de que alguém confundiu regiões.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "pipeline" / "src"))

from paragem.regiao import carregar_todas  # noqa: E402


def linhas(sql: str) -> list[list[str]]:
    url = os.environ.get("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/postgres")
    saida = subprocess.run(
        ["psql", url, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return [linha.split("\t") for linha in saida.splitlines() if linha]


def main() -> int:
    declaradas = {r.id: r for r in carregar_todas(RAIZ)}
    na_base = {
        id_: (nome, artigo, dominio)
        for id_, nome, artigo, dominio in linhas(
            "select id, name, article, domain from public.regions order by id"
        )
    }
    falhas: list[str] = []

    for id_ in sorted(set(declaradas) - set(na_base)):
        print(f"  · {id_}: declarada em regioes/ e ainda sem linha — nasce no painel, não aqui")
    for id_ in sorted(set(na_base) - set(declaradas)):
        falhas.append(f"{id_}: tem linha em public.regions e não há regioes/{id_}/regiao.yaml")

    for id_ in sorted(set(declaradas) & set(na_base)):
        r = declaradas[id_]
        nome, artigo, dominio = na_base[id_]
        if nome != r.nome:
            falhas.append(f"{id_}: a base diz «{nome}», o regiao.yaml diz «{r.nome}»")
        if artigo != r.artigo:
            falhas.append(f"{id_}: a base diz artigo «{artigo}», o regiao.yaml diz «{r.artigo}»")
        if dominio != r.dominio:
            falhas.append(f"{id_}: a base diz domínio «{dominio}», o regiao.yaml diz «{r.dominio}»")

    for id_, modulo in linhas("select region_id, id from public.modulos where not is_enabled"):
        regiao = declaradas.get(id_)
        if regiao is not None and modulo not in regiao.modos:
            falhas.append(
                f"{id_}: o módulo «{modulo}» está desligado na base e a região nem o declara"
            )

    for id_ in sorted(set(declaradas) & set(na_base)):
        print(f"  ✓ {id_}: nome, artigo e domínio batem certo")
    if falhas:
        print()
        for f in falhas:
            print(f"  ✗ {f}")
        print(f"\n{len(falhas)} discrepâncias entre a base e os regiao.yaml")
        return 1
    print(f"\n✓ {len(na_base)} regiões, a base e os regiao.yaml dizem o mesmo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
