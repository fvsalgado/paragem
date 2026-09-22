"""O validador da MobilityData, corrido pelo pipeline.

A opinião que conta sobre um GTFS é a desta ferramenta, que é a que o resto do
mundo usa. Reimplementá-la em Python era ter duas opiniões e não saber qual
delas está desatualizada.

**Zero erros é obrigatório** (CLAUDE.md §9): um erro do validador entra no
relatório como lacuna que BLOQUEIA, e a construção sai com código ≠ 0.

**E não correr o validador nunca é silêncio.** Se o jar não estiver disponível
— sem rede, sem Java, sem ficheiro —, fica um aviso no relatório a dizer que a
verificação não se fez. Um relatório sem erros porque ninguém verificou parece
exatamente igual a um relatório sem erros porque está tudo bem.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

# Avisos que não são defeito nosso e que já têm lacuna própria no relatório.
# Repeti-los é ruído, e ruído esconde o que interessa.
JA_CONTADOS = {
    "missing_recommended_file",
    "trip_coverage_not_active_for_next7_days",
}

# A VERSÃO ESTÁ FIXADA, pela mesma razão do poppler: as regras do validador
# mudam entre versões, e um validador que se atualiza sozinho faz o CI mudar de
# opinião sem que nada no repositório tenha mudado. O CLAUDE.md §5 pede a
# v8.0.1 ou mais recente; subir é uma decisão, tomada com o relatório antes e
# depois à frente.
#
# O nome do ficheiro leva a versão — não há alias sem versão nas descargas do
# projeto —, por isso não se pode simplesmente pedir «a mais recente».
#
# ATENÇÃO à assimetria do `v`: a ETIQUETA leva-o (`/download/v8.0.1/`) e o
# NOME DO FICHEIRO não (`gtfs-validator-8.0.1-cli.jar`). O README do projeto
# diz que o ficheiro «looks like gtfs-validator-vX.X.X-cli.jar», e está errado:
# a workflow de publicação deles usa `version-without-v` no nome. Escrevi o
# endereço a partir do README, deu 404, e o CI ficou verde na mesma a dizer que
# o validador não tinha corrido — que é o motivo de existir o
# `--exigir-validador`.
VERSAO = "8.0.1"
ENDERECO = (
    "https://github.com/MobilityData/gtfs-validator/releases/download/"
    "v{versao}/gtfs-validator-{versao}-cli.jar"
)


class ValidadorIndisponivel(Exception):
    pass


def jar(raiz: Path) -> Path:
    """Onde está o validador. Por esta ordem: ambiente, cache, descarregado."""
    do_ambiente = os.environ.get("GTFS_VALIDATOR_JAR")
    if do_ambiente and Path(do_ambiente).exists():
        return Path(do_ambiente)

    guardado = Path(raiz) / ".cache" / "gtfs-validator.jar"
    if guardado.exists():
        return guardado

    import httpx

    versao = os.environ.get("GTFS_VALIDATOR_VERSAO", VERSAO)
    endereco = ENDERECO.format(versao=versao)
    try:
        guardado.parent.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", endereco, follow_redirects=True, timeout=300.0) as r:
            r.raise_for_status()
            with open(guardado, "wb") as f:
                for pedaco in r.iter_bytes(chunk_size=1 << 20):
                    f.write(pedaco)
        return guardado
    except Exception as e:  # noqa: BLE001 — a razão interessa toda, para o aviso
        guardado.unlink(missing_ok=True)
        raise ValidadorIndisponivel(
            f"não há validador v{versao}: {type(e).__name__}: {e}. Põe o caminho do jar em "
            "GTFS_VALIDATOR_JAR, ou guarda-o em .cache/gtfs-validator.jar. "
            "(O ambiente de construção não chega às descargas do GitHub; o CI chega.)"
        ) from e


def java() -> str:
    for candidato in (
        os.environ.get("JAVA_HOME", "") + "/bin/java",
        "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
        shutil.which("java") or "",
    ):
        if candidato and Path(candidato).exists():
            return candidato
    raise ValidadorIndisponivel("não há Java. O validador precisa de Java 17 ou mais recente.")


def validar(raiz: Path, feed: Path) -> dict[str, Any]:
    """Corre o validador e devolve o relatório, já lido."""
    executavel = java()
    caminho_do_jar = jar(raiz)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            [executavel, "-jar", str(caminho_do_jar), "-i", str(feed), "-o", tmp],
            check=True,
            capture_output=True,
            # O JAVA_TOOL_OPTIONS do ambiente escreve para o stderr e suja a
            # saída; aqui não é preciso proxy nenhum.
            env={**os.environ, "JAVA_TOOL_OPTIONS": ""},
        )
        with open(Path(tmp) / "report.json", encoding="utf-8") as f:
            return json.load(f)


def registar(
    ctx, feed: Path, rotulo: str, *, proprio: bool = True, exigir: bool = False
) -> dict[str, int]:
    """Valida e escreve o resultado no relatório de lacunas.

    `proprio` distingue um feed que nós construímos de um que apenas passa por
    aqui. Os 275 avisos do feed da CP e os 5095 do da FlixBus são deles: nós
    não lhes tocámos, e não os podemos corrigir. Contá-los como lacunas nossas
    enterrava as que são — e uma lista de lacunas em que a maioria não é para
    fazer nada deixa de se ler.

    **Os erros continuam a bloquear em qualquer caso.** Um feed que publicamos
    com erros é um problema nosso mesmo quando a culpa é de quem o produziu —
    e às vezes a culpa é nossa: as 415 referências penduradas do feed da
    FlixBus vieram do nosso filtro, não dela.
    """
    try:
        relatorio = validar(ctx.raiz, feed)
    except (ValidadorIndisponivel, subprocess.CalledProcessError, FileNotFoundError) as e:
        # Onde o validador É PRECISO — no CI —, não o conseguir correr é um
        # bloqueio e não um aviso. Um aviso deixa a corrida verde, e uma
        # corrida verde em que a verificação que interessa não aconteceu é
        # pior do que uma vermelha: parece que está tudo bem.
        registar_como = ctx.relatorio.bloqueia if exigir else ctx.relatorio.aviso
        registar_como(
            id=f"validador.{rotulo}.nao-correu",
            o_que=f"O validador não correu sobre {rotulo}",
            onde=str(feed.relative_to(ctx.raiz)),
            porque_importa=(
                "Um relatório sem erros porque ninguém verificou parece exatamente igual a um "
                "relatório sem erros porque está tudo bem. Fica dito qual dos dois é."
            ),
            o_que_fazer=str(e),
        )
        return {}

    contagens: dict[str, int] = {}
    for aviso in relatorio.get("notices", []):
        codigo = aviso["code"]
        severidade = aviso["severity"]
        total = aviso["totalNotices"]
        contagens[f"validador.{rotulo}.{severidade.lower()}.{codigo}"] = total

        if severidade == "ERROR":
            ctx.relatorio.bloqueia(
                id=f"validador.{rotulo}.{codigo}",
                o_que=f"Validador: {codigo}",
                onde=str(feed.relative_to(ctx.raiz)),
                porque_importa=(
                    "Zero erros do validador é obrigatório (CLAUDE.md §9). Um feed com erros "
                    "é recusado por quem o consome, e o que o consome são as aplicações onde "
                    "as pessoas procuram o autocarro."
                ),
                o_que_fazer="Ver as amostras no relatório completo do validador.",
                quantos=total,
                quais=_amostras(aviso),
            )
        elif severidade == "WARNING" and codigo not in JA_CONTADOS:
            registar_como = ctx.relatorio.lacuna if proprio else ctx.relatorio.aviso
            registar_como(
                id=f"validador.{rotulo}.{codigo}",
                o_que=f"Validador: {codigo}" + ("" if proprio else f" (no feed de {rotulo})"),
                onde=str(feed.relative_to(ctx.raiz)),
                porque_importa=(
                    "Aviso do validador. Não trava o feed; trava a confiança nele."
                    if proprio
                    else (
                        "É um aviso do feed de origem, que passa por aqui tal e qual. Não lhe "
                        "tocamos — reescrever o feed de outra operadora fazia com que ninguém "
                        "conseguisse dizer se uma diferença veio dela ou de nós."
                    )
                ),
                o_que_fazer=(
                    "Ver as amostras." if proprio else "Nenhuma ação nossa. Fica contado."
                ),
                quantos=total,
                quais=_amostras(aviso),
            )
    return contagens


def _amostras(aviso: dict[str, Any], quantas: int = 8) -> list[str]:
    saida = []
    for a in aviso.get("sampleNotices", [])[:quantas]:
        saida.append(" ".join(f"{k}={v}" for k, v in a.items() if k not in ("csvRowNumber",))[:220])
    return saida
