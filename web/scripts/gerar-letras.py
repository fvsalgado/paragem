"""
Gera o logótipo por extenso — «Paragem.pt» com a placa da paragem a fazer de P
— em contornos, a partir da letra do sítio.

O P não é o da letra: é o desenho de `src/lib/marca.ts` (o poste, a placa
presa a ele e a faixa do número da linha aberta nela), à escala da letra — a
altura das maiúsculas da Atkinson Hyperlegible Bold é a altura do poste, e o
poste fica onde a letra põe a haste do seu próprio P. «aragem» vem da Bold e «.pt» da
Regular, tal como a letra os desenha.

Contornos, e não texto, por duas razões: o logótipo não pode depender de a
letra ter chegado do servidor de letras (sem ela, o P desenhado ficava ao lado
de um «aragem» de outra família, desalinhado), e o cartão de partilha desenha
SVG sem saber de letras. O que se lê continua a estar lá como texto, para
leitores de ecrã — ver `componentes/Marca.tsx`.

Escreve `src/lib/marca-letras.ts`. Corre-se à mão quando a marca ou a letra
mudarem:

    uv run --with fonttools python web/scripts/gerar-letras.py
"""

from __future__ import annotations

import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

WEB = Path(__file__).resolve().parent.parent
FONTES = WEB / "src" / "fontes"
MARCA = WEB / "src" / "lib" / "marca.ts"
DESTINO = WEB / "src" / "lib" / "marca-letras.ts"

negra = TTFont(FONTES / "AtkinsonHyperlegible-Bold.ttf")
normal = TTFont(FONTES / "AtkinsonHyperlegible-Regular.ttf")
ALTURA_DAS_MAIUSCULAS = negra["OS/2"].sCapHeight  # 668 em 1000


def ler_marca() -> dict[str, float]:
    """As medidas do P na grelha, lidas de `marca.ts` — um desenho, um sítio."""
    texto = MARCA.read_text(encoding="utf-8")
    medidas = {}
    for nome in ("maiuscula", "linha_de_base", "haste_esquerda", "placa_direita"):
        m = re.search(rf"\b{nome}: (-?[\d.]+)", texto)
        if not m:
            raise SystemExit(f"falta `{nome}` em MARCA_P, em {MARCA}")
        medidas[nome] = float(m.group(1))
    # O traçado vem em várias cadeias somadas com `+`; juntam-se todas.
    m = re.search(r"export const MARCA_P_TRACADO =(.*?);", texto, re.S)
    if not m:
        raise SystemExit(f"falta MARCA_P_TRACADO em {MARCA}")
    medidas["tracado"] = "".join(re.findall(r"'([^']+)'", m.group(1)))
    return medidas


def main() -> None:
    p = ler_marca()
    # Unidades da letra por unidade da grelha: a altura das maiúsculas na
    # grelha vai da linha de base ao topo da placa.
    escala = ALTURA_DAS_MAIUSCULAS / (p["linha_de_base"] - p["maiuscula"])
    # O ponto mais alto do logótipo é o topo da placa, que é a altura das
    # maiúsculas; é daí que se mede o y, para baixo, como no SVG.
    cimo = ALTURA_DAS_MAIUSCULAS
    # O poste fica onde a letra põe a haste do seu próprio P (x = 44).
    dx = 44 - p["haste_esquerda"] * escala
    dy = -p["maiuscula"] * escala
    p_tracado = transformar_grelha(p["tracado"], escala, dx, dy)

    # Onde acaba o P: a borda da placa, mais o espaço que a letra deixa depois
    # do seu próprio P (626 − 604 = 22).
    direita_do_p = p["placa_direita"] * escala + dx
    avanco = direita_do_p + 22

    def palavra(fonte: TTFont, texto: str, x: float) -> tuple[str, float]:
        glifos = fonte.getGlyphSet()
        mapa = fonte.getBestCmap()
        caneta = SVGPathPen(glifos, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        for ch in texto:
            nome = mapa[ord(ch)]
            # y da letra é para cima; no SVG é para baixo, a partir do cimo.
            glifos[nome].draw(TransformPen(caneta, (1, 0, 0, -1, x, cimo)))
            x += fonte["hmtx"][nome][0]
        return caneta.getCommands(), x

    aragem, depois = palavra(negra, "aragem", avanco)
    pt, fim = palavra(normal, ".pt", depois)

    # A caixa: do começo do P ao fim do «t»; do topo da placa ao fundo do
    # «g», que é o que desce mais.
    fundo = cimo + 203 + 4
    largura = fim + 20

    DESTINO.write_text(
        f"""/**
 * O logótipo por extenso, em contornos. GERADO por `scripts/gerar-letras.py`
 * a partir de `marca.ts` e da letra em `src/fontes/` — não se edita à mão.
 *
 * Unidades da letra (1000 por eme): a altura das maiúsculas é {ALTURA_DAS_MAIUSCULAS}, e a
 * linha de base está em y = {cimo:.1f}.
 */
export const LETRAS_LARGURA = {largura:.1f};
export const LETRAS_ALTURA = {fundo:.1f};
export const LETRAS_LINHA_DE_BASE = {cimo:.1f};

/** O P — a placa da paragem —, com a faixa aberta (`fill-rule: evenodd`). */
export const LETRAS_P = '{p_tracado}';

/** «aragem», na Atkinson Hyperlegible Bold. */
export const LETRAS_ARAGEM = '{aragem}';

/** «.pt», na Regular: faz parte do nome, mas lê-se depois. */
export const LETRAS_PT = '{pt}';
""",
        encoding="utf-8",
    )
    print(f"✓ {DESTINO.relative_to(WEB)} ({largura:.0f} × {fundo:.0f})")


def transformar_grelha(tracado: str, escala: float, dx: float, dy: float) -> str:
    """Leva um traçado da grelha (M, H, V, A, Z absolutos) à escala da letra."""
    partes = re.findall(r"[MHVAZ]|-?[\d.]+", tracado)
    saida: list[str] = []
    i = 0

    def n(v: str, eixo: str) -> str:
        valor = float(v) * escala + (dx if eixo == "x" else dy if eixo == "y" else 0)
        return f"{valor:.1f}".rstrip("0").rstrip(".")

    while i < len(partes):
        c = partes[i]
        i += 1
        if c == "M":
            saida.append(f"M{n(partes[i], 'x')} {n(partes[i + 1], 'y')}")
            i += 2
        elif c == "H":
            saida.append(f"H{n(partes[i], 'x')}")
            i += 1
        elif c == "V":
            saida.append(f"V{n(partes[i], 'y')}")
            i += 1
        elif c == "A":
            rx, ry = n(partes[i], "r"), n(partes[i + 1], "r")
            rot, grande, sentido = partes[i + 2], partes[i + 3], partes[i + 4]
            x, y = n(partes[i + 5], "x"), n(partes[i + 6], "y")
            saida.append(f"A{rx} {ry} {rot} {grande} {sentido} {x} {y}")
            i += 7
        elif c == "Z":
            saida.append("Z")
        else:
            raise SystemExit(f"comando {c} por ler no traçado do P")
    return "".join(saida)


if __name__ == "__main__":
    main()
