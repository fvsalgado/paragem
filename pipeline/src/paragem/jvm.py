"""Encontrar um Java, e um que sirva.

Duas ferramentas deste pipeline correm em Java e pedem versões diferentes: o
validador da MobilityData a partir da 17, o OpenTripPlanner 2.6 a partir da 21.
Num contentor onde estão as duas instaladas, escolher «o java» dá conforme
calha — e o OTP a arrancar em Java 17 morre com `UnsupportedClassVersionError`,
que não é a mensagem que ajuda quem está a ler o registo.

Por isso aqui pergunta-se a VERSÃO antes de devolver o caminho, e a mensagem de
erro diz qual é que falta.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path


class SemJava(Exception):
    pass


def _versao(executavel: str) -> int | None:
    """A versão maior deste Java, ou `None` se não se conseguir perguntar."""
    try:
        r = subprocess.run(
            [executavel, "-version"],
            capture_output=True,
            text=True,
            timeout=30,
            # O JAVA_TOOL_OPTIONS do ambiente escreve para o stderr e mistura-se
            # com a resposta.
            env={**os.environ, "JAVA_TOOL_OPTIONS": ""},
        )
    except (OSError, subprocess.SubprocessError):
        return None
    # `openjdk version "21.0.10" 2026-01-20` ou `java version "1.8.0_402"`
    m = re.search(r'version "(\d+)(?:\.(\d+))?', r.stderr + r.stdout)
    if not m:
        return None
    maior = int(m.group(1))
    # Antes da 9 a versão dizia-se 1.x — e 1.8 é a 8.
    return int(m.group(2) or 0) if maior == 1 else maior


def _candidatos() -> list[str]:
    vistos: list[str] = []

    def juntar(c: str) -> None:
        if c and c not in vistos and Path(c).exists():
            vistos.append(c)

    # Do mais explícito para o mais casual: uma variável de ambiente é uma
    # decisão de quem corre, e ganha ao que está instalado.
    juntar(os.environ.get("JAVA_HOME", "") + "/bin/java")
    for pasta in sorted(Path("/usr/lib/jvm").glob("*"), reverse=True):
        juntar(str(pasta / "bin" / "java"))
    juntar(shutil.which("java") or "")
    return vistos


def java(minimo: int = 17) -> str:
    """O caminho de um Java com pelo menos esta versão.

    Percorre os candidatos do mais explícito para o mais casual e devolve o
    primeiro que sirva — não o mais recente. Quem põe `JAVA_HOME` está a
    escolher, e a escolha respeita-se enquanto for válida.
    """
    encontrados: list[str] = []
    for c in _candidatos():
        v = _versao(c)
        if v is None:
            continue
        encontrados.append(f"{c} (Java {v})")
        if v >= minimo:
            return c
    if encontrados:
        raise SemJava(
            f"nenhum Java com versão ≥ {minimo}. Encontrei: {', '.join(encontrados)}. "
            f"Instala um JDK {minimo} ou põe o caminho em JAVA_HOME."
        )
    raise SemJava(f"não há Java nenhum. É preciso um JDK {minimo} ou mais recente.")
