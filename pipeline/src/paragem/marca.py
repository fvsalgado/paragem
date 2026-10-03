"""A marca de uma região: a cor e o logótipo, quando os declara.

O sítio de uma autoridade de transportes é DELA, e não do fornecedor: a
primeira coisa do cabeçalho era «Paragem.pt», a levar à página de vendas, e o
nome da região vinha a seguir numa pastilha que parecia um rótulo de estado
(P4-008, P1-007). Passou a ser a marca da região — e por isso a cor e o
logótipo são dados da região, declarados no `regiao.yaml` como o resto, e não
um commit no código (o «sem um commit de código» do §1 vale também para a
marca).

**A cor dá o tom, e qualquer cor serve.** O logótipo de uma região é o
endereço dela desenhado em feixe (CLAUDE.md §6), e os três tons do feixe
tira-os o sítio da cor declarada, com as luminosidades do do produto
(`web/src/lib/marca.ts`): leem-se seja qual for a cor, e os testes de lá
conferem-no. A cor tal e qual só vai para a barra do navegador.

Até 3/10/2026 era recusada aqui a cor que não se lesse nem com branco nem com
o azul-escuro do texto por cima, porque pintava uma faixa com o nome da rede.
A faixa saiu. Recusar um laranja médio por causa dela era recusar a marca de
alguém por uma razão que já não existe — e mandar escurecê-la para uma faixa
que ninguém ia ver.

**O logótipo é um ficheiro ao lado do `regiao.yaml`**, na raiz de onde a
região vem — como o resto do que é dela —, e vai para o armazém com os dados.
Mostra-se num `<img>`, mas um SVG também se abre sozinho no domínio do
armazém, e aí correria o que trouxesse: por isso não pode trazer programas,
nem ir buscar nada a outro sítio (o §4 não deixa uma página pedir nada a
terceiros, e um logótipo que carregasse uma letra de fora fazia-o por ela).
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

#: A cor da marca do §6 — a de quem não declara a sua.
COR_DO_PRODUTO = "#0a5c7a"
#: Os formatos que um `<img>` mostra igual em todo o lado, e o tamanho máximo:
#: um logótipo é um desenho, e um de 200 kB já é uma fotografia.
FORMATOS = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp"}
TAMANHO_MAXIMO = 200 * 1024


class MarcaInvalida(ValueError):
    """A cor ou o logótipo de uma região não passam. A mensagem diz porquê e o que fazer."""


def normalizar(cor: Any) -> str:
    """`#5FC2B7`, `5fc2b7` e `#4cc` são todas a mesma forma: `#rrggbb`, em minúsculas."""
    limpa = str(cor or "").strip().lstrip("#").lower()
    if re.fullmatch(r"[0-9a-f]{3}", limpa):
        limpa = "".join(c * 2 for c in limpa)
    if not re.fullmatch(r"[0-9a-f]{6}", limpa):
        raise MarcaInvalida(
            f"a cor {cor!r} não é uma cor: escreve-se como no CSS, «#rrggbb» (por exemplo "
            "«#0a5c7a»), e entre aspas — sem elas, o YAML lê o «#» como um comentário."
        )
    return f"#{limpa}"


def validar_cor(cor: Any, onde: str) -> str:
    """A cor normalizada, ou a recusa — a dizer onde está escrita."""
    try:
        return normalizar(cor)
    except MarcaInvalida as e:
        raise MarcaInvalida(f"{onde}: {e}") from None


_PROIBIDO_NUM_SVG = (
    (re.compile(r"<\s*script", re.I), "um programa (`<script>`)"),
    (re.compile(r"\son[a-z]+\s*=", re.I), "um programa num atributo (`on…=`)"),
    (re.compile(r"<\s*foreignObject", re.I), "HTML embutido (`<foreignObject>`)"),
    (re.compile(r"javascript:", re.I), "um endereço `javascript:`"),
    (re.compile(r"(?:href|src)\s*=\s*[\"']\s*(?:https?:)?//", re.I), "uma ligação para fora"),
    (re.compile(r"@import|url\(\s*[\"']?\s*(?:https?:)?//", re.I), "um recurso de outro sítio"),
)


def validar_logotipo(caminho: Path, onde: str) -> Path:
    """O ficheiro do logótipo, se for um que se pode publicar."""
    if not caminho.is_file():
        raise MarcaInvalida(f"{onde}: o logótipo {caminho} não existe.")
    tipo = caminho.suffix.lower()
    if tipo not in FORMATOS:
        raise MarcaInvalida(
            f"{onde}: o logótipo tem de ser SVG, PNG ou WebP, e é «{caminho.name}». São os "
            "formatos que um navegador mostra igual em todo o lado."
        )
    tamanho = caminho.stat().st_size
    if tamanho > TAMANHO_MAXIMO:
        raise MarcaInvalida(
            f"{onde}: o logótipo tem {tamanho // 1024} kB, e o máximo são "
            f"{TAMANHO_MAXIMO // 1024}: vai em todas as páginas, a quem as abre numa paragem."
        )
    if tipo == ".svg":
        texto = caminho.read_text(encoding="utf-8", errors="replace")
        for padrao, o_que in _PROIBIDO_NUM_SVG:
            if padrao.search(texto):
                raise MarcaInvalida(
                    f"{onde}: o SVG do logótipo traz {o_que}. Um logótipo é um desenho: "
                    "exporta-o outra vez, só com formas e texto convertido em contornos."
                )
    return caminho


def proporcao(caminho: Path) -> float | None:
    """Largura sobre altura do logótipo, lida do próprio ficheiro — ou `None` se não se souber.

    O sítio desenha-o com a altura fixa e esta largura, guardada antes de a
    imagem chegar: sem ela, um logótipo comprido (o nome da rede escrito por
    extenso) aparecia num quadrado, espremido, ou empurrava o cabeçalho para o
    lado quando acabasse de chegar.
    """
    dados = caminho.read_bytes()
    tipo = caminho.suffix.lower()
    largura = altura = 0.0
    if tipo == ".png" and dados[12:16] == b"IHDR":
        largura, altura = (int.from_bytes(dados[i : i + 4], "big") for i in (16, 20))
    elif tipo == ".webp" and dados[:4] == b"RIFF" and dados[8:12] == b"WEBP":
        bloco = dados[12:16]
        if bloco == b"VP8X":
            largura = 1 + int.from_bytes(dados[24:27], "little")
            altura = 1 + int.from_bytes(dados[27:30], "little")
        elif bloco == b"VP8 ":
            largura = int.from_bytes(dados[26:28], "little") & 0x3FFF
            altura = int.from_bytes(dados[28:30], "little") & 0x3FFF
        elif bloco == b"VP8L":
            bits = int.from_bytes(dados[21:25], "little")
            largura, altura = (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    elif tipo == ".svg":
        texto = dados.decode("utf-8", errors="replace")
        raiz = re.search(r"<svg\b[^>]*>", texto, re.I | re.S)
        if raiz:
            caixa = re.search(r"viewBox\s*=\s*[\"']([^\"']+)[\"']", raiz.group(0), re.I)
            numeros = re.findall(r"-?[\d.]+", caixa.group(1)) if caixa else []
            if len(numeros) == 4:
                largura, altura = float(numeros[2]), float(numeros[3])
            else:
                medidas = [
                    re.search(rf"\b{m}\s*=\s*[\"']([\d.]+)(?:px)?[\"']", raiz.group(0))
                    for m in ("width", "height")
                ]
                if all(medidas):
                    largura, altura = (float(x.group(1)) for x in medidas if x)
    return round(largura / altura, 3) if largura > 0 and altura > 0 else None


def nome_publicado(caminho: Path) -> str:
    """`marca/logotipo-<soma>.svg`: a soma no nome, e um logótipo novo não espera pela cache."""
    soma = hashlib.sha256(caminho.read_bytes()).hexdigest()[:10]
    return f"marca/logotipo-{soma}{caminho.suffix.lower()}"


def marca_publicada(cor: str | None, logotipo: Path | None) -> dict[str, Any]:
    """O que vai no `regiao.json`: a cor, se é dela, e onde está o logótipo.

    A tinta e o contraste deixaram de ir: eram os da faixa do cabeçalho, que
    saiu, e o sítio não os lia — media outra vez.
    """
    return {
        "cor": cor or COR_DO_PRODUTO,
        # Se a cor é da região ou é a do produto, por omissão.
        "propria": cor is not None,
        "logotipo": nome_publicado(logotipo) if logotipo else None,
        "logotipo_proporcao": proporcao(logotipo) if logotipo else None,
    }
