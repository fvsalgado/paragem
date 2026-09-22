"""Os mosaicos vetoriais do mapa, do MESMO OpenStreetMap que tudo o resto.

O CLAUDE.md §7 pede «mosaicos vetoriais PMTiles gerados a partir do mesmo OSM
e alojados por nós, sem serviços de mapas privados». As três partes são
requisitos separados:

- **do mesmo OSM**: não se descarrega outro recorte. O mapa mostra exatamente o
  território que o motor de viagens conhece — se divergirem, o mapa desenha uma
  estrada por onde o planeador não passa, e quem viaja não tem como saber qual
  dos dois mente;
- **PMTiles**: um ficheiro só, que o navegador lê por intervalos de bytes. Sem
  servidor de mosaicos, sem base de dados, sem processo a manter. É o que
  permite alojar isto onde se alojam ficheiros;
- **por nós**: sem chave de API e sem terceiro a ver quem consultou que
  paragem.

A ferramenta é o Planetiler, com a versão FIXADA pela mesma razão do OTP, do
validador e do poppler: uma ferramenta que se atualiza sozinha muda o mapa sem
que nada no repositório tenha mudado.
"""

from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from .jvm import java
from .regiao import Regiao

VERSAO = "0.9.1"
ENDERECO = "https://github.com/onthegomap/planetiler/releases/download/v{versao}/planetiler.jar"

# O Planetiler corre com o Java 21, como o OTP.
JAVA_MINIMO = 21

# Medido a 20/09/2026, no recorte do Médio Tejo (82 MB de `.osm.pbf`):
#
#     -Xmx4g   ·  2m15s  ·  66 MB de saída  ·  zoom 0 a 14
#
# O zoom máximo fica em 14 de propósito. O 15 multiplicaria o tamanho por
# quatro para mostrar a forma dos passeios, e quem procura um autocarro não
# precisa da forma dos passeios.
MEMORIA = "4g"
ZOOM_MAXIMO = 14

#: O que o estilo do sítio nunca desenha, e que por isso não vai nos mosaicos.
FORA = ("poi", "housenumber", "aerodrome_label", "mountain_peak", "aeroway")


class ErroDeMosaicos(Exception):
    pass


@dataclass
class Mosaicos:
    ficheiro: Path
    segundos: float
    megabytes: float


def jar(raiz: Path) -> Path:
    """Onde está o Planetiler. Por esta ordem: ambiente, cache, descarregado."""
    do_ambiente = os.environ.get("PLANETILER_JAR")
    if do_ambiente and Path(do_ambiente).exists():
        return Path(do_ambiente)

    guardado = Path(raiz) / ".cache" / "planetiler.jar"
    if guardado.exists():
        return guardado

    import httpx

    versao = os.environ.get("PLANETILER_VERSAO", VERSAO)
    endereco = ENDERECO.format(versao=versao)
    try:
        guardado.parent.mkdir(parents=True, exist_ok=True)
        parcial = guardado.with_suffix(".parcial")
        with httpx.stream("GET", endereco, follow_redirects=True, timeout=900.0) as r:
            r.raise_for_status()
            with open(parcial, "wb") as f:
                for pedaco in r.iter_bytes(chunk_size=1 << 20):
                    f.write(pedaco)
        parcial.replace(guardado)
        return guardado
    except Exception as e:  # noqa: BLE001 — a razão interessa toda
        guardado.with_suffix(".parcial").unlink(missing_ok=True)
        raise ErroDeMosaicos(
            f"não há Planetiler v{versao}: {type(e).__name__}: {e}. São 88 MB. "
            "Põe o caminho em PLANETILER_JAR, ou guarda-o em .cache/planetiler.jar."
        ) from e


def construir(raiz: Path, regiao: Regiao, *, memoria: str = MEMORIA) -> Mosaicos:
    """Gera `build/<regiao>/mosaicos/regiao.pmtiles` a partir do recorte OSM."""
    raiz = Path(raiz)
    entrada = raiz / "build" / regiao.id / "osm" / "regiao.osm.pbf"
    if not entrada.exists():
        raise ErroDeMosaicos(
            f"a região {regiao.id!r} não tem recorte OSM em {entrada}. "
            "O mapa vem do MESMO OpenStreetMap que o resto — sem recorte não há mapa. "
            "Declara uma saída `osm/regiao.osm.pbf` em fontes.yaml, ou não haverá mapa "
            "nesta região (e a interface di-lo, em vez de desenhar um mapa vazio)."
        )

    saida = raiz / "build" / regiao.id / "mosaicos" / "regiao.pmtiles"
    saida.parent.mkdir(parents=True, exist_ok=True)

    # AS FONTES AUXILIARES VÃO PARA `.cache/`, e não para `data/`.
    #
    # O Planetiler descarrega 1,4 GB de linhas de costa e dados do Natural
    # Earth. Por omissão põe-nos em `data/sources/` — que neste repositório é
    # a pasta das fontes MANUAIS, versionadas e com proveniência declarada.
    # Misturar 1,4 GB de cache com os PDF que alguém pôs lá à mão é perder a
    # distinção que o §4.1 existe para manter.
    cache = raiz / ".cache" / "planetiler"
    cache.mkdir(parents=True, exist_ok=True)

    comando = [
        str(java(JAVA_MINIMO)),
        f"-Xmx{memoria}",
        "-jar",
        str(jar(raiz)),
        f"--osm-path={entrada}",
        f"--output={saida}",
        f"--download-dir={cache / 'sources'}",
        f"--tmpdir={cache / 'tmp'}",
        f"--maxzoom={ZOOM_MAXIMO}",
        # AS CAMADAS QUE NUNCA SE DESENHAM SAEM DAQUI.
        #
        # O esquema OpenMapTiles traz pontos de interesse, números de porta,
        # picos e aeródromos. O estilo deste sítio não desenha nenhum — os
        # sítios do OpenStreetMap chegam pela procura, num ficheiro à parte, e
        # os números de porta não têm lugar num mapa de transportes.
        #
        # E não é só peso: eram eles que enchiam os mosaicos das vilas densas.
        # O de Tomar no zoom 14 tinha 133 kB e não carregava — o mapa ficava
        # em branco por cima da maior vila da região, sem um erro na consola.
        f"--exclude-layers={','.join(FORA)}",
        "--download",
        "--force",
    ]

    comeco = time.monotonic()
    registo = saida.parent / "construcao.log"
    with open(registo, "w", encoding="utf-8") as f:
        r = subprocess.run(comando, stdout=f, stderr=subprocess.STDOUT, timeout=3600)
    segundos = time.monotonic() - comeco

    if r.returncode != 0 or not saida.exists():
        cauda = "\n".join(registo.read_text(encoding="utf-8", errors="replace").splitlines()[-25:])
        raise ErroDeMosaicos(f"o Planetiler falhou (código {r.returncode}):\n{cauda}")

    return Mosaicos(
        ficheiro=saida,
        segundos=segundos,
        megabytes=saida.stat().st_size / 1_048_576,
    )
