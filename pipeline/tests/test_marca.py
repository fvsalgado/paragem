"""A marca de uma região — a cor e o logótipo — e a recusa do que não é cor nem desenho.

As cores dos testes são de exemplo. As regiões que se carregam são cópias das
de prova numa pasta temporária, com a marca mexida: nenhum cliente entra aqui.
"""

import json
import shutil
import struct
import zlib

import pytest

from conftest import regiao_ou_salta
from paragem.marca import (
    COR_DO_PRODUTO,
    MarcaInvalida,
    marca_publicada,
    normalizar,
    proporcao,
    validar_cor,
)
from paragem.regiao import ErroDeRegiao, Regiao


def test_a_cor_escreve_se_de_uma_maneira_so():
    assert normalizar("#5FC2B7") == "#5fc2b7"
    assert normalizar("5fc2b7") == "#5fc2b7"
    assert normalizar("#4cc") == "#44cccc"
    with pytest.raises(MarcaInvalida, match="entre aspas"):
        normalizar("azul")


def test_qualquer_cor_serve_porque_os_tons_se_tiram_dela():
    """Um laranja médio já não é recusado: a faixa que o recusava saiu (3/10/2026).

    Os três tons do feixe tira-os o sítio da cor, e esses leem-se seja qual
    for (`web/tests/marca.test.mts`). O que continua a não passar é o que não é
    cor — e a recusa diz onde está escrito.
    """
    assert validar_cor("#d9643a", "teste") == "#d9643a"
    with pytest.raises(MarcaInvalida, match="^teste: .*entre aspas"):
        validar_cor("laranja", "teste")


def test_sem_cor_declarada_fica_a_do_produto():
    m = marca_publicada(None, None)
    assert m["cor"] == COR_DO_PRODUTO
    assert m["propria"] is False and m["logotipo"] is None
    # A tinta e o contraste eram os da faixa do cabeçalho, que saiu.
    assert "tinta" not in m and "contraste" not in m


def _png(caminho, largura, altura):
    """Um PNG mínimo e válido, só para o cabeçalho dizer as medidas."""

    def bloco(tipo, dados):
        corpo = tipo + dados
        return struct.pack(">I", len(dados)) + corpo + struct.pack(">I", zlib.crc32(corpo))

    ihdr = struct.pack(">IIBBBBB", largura, altura, 8, 2, 0, 0, 0)
    linhas = b"".join(b"\0" + b"\0\0\0" * largura for _ in range(altura))
    caminho.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + bloco(b"IHDR", ihdr)
        + bloco(b"IDAT", zlib.compress(linhas))
        + bloco(b"IEND", b"")
    )
    return caminho


def test_a_proporcao_le_se_do_proprio_ficheiro(tmp_path):
    """Um logótipo comprido não pode ser espremido num quadrado, nem chegar a empurrar."""
    svg = tmp_path / "a.svg"
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"/>')
    assert proporcao(svg) == 3.0
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="64px" height="32px"/>')
    assert proporcao(svg) == 2.0
    assert proporcao(_png(tmp_path / "b.png", 30, 20)) == 1.5


# --- na declaração da região -------------------------------------------------


@pytest.fixture
def prova(tmp_path):
    """Uma cópia da região de prova, para lhe mexer na marca."""
    origem = regiao_ou_salta("prova").raiz
    pasta = tmp_path / "regioes" / "prova"
    shutil.copytree(origem, pasta)
    return pasta


def _com(pasta, linhas: str) -> Regiao:
    yaml = pasta / "regiao.yaml"
    yaml.write_text(yaml.read_text(encoding="utf-8") + "\n" + linhas + "\n", encoding="utf-8")
    return Regiao.carregar(pasta)


def test_as_provas_continuam_sem_marca_propria():
    """É parte da prova: uma região nasce sem marca, e fica com a do produto."""
    for rid in ("prova", "prova-municipio"):
        r = regiao_ou_salta(rid)
        assert r.cor is None and r.logotipo is None


def test_a_cor_da_regiao_entra_na_forma_de_sempre(prova):
    r = _com(prova, 'cor: "#5FC2B7"')
    assert r.cor == "#5fc2b7"
    assert marca_publicada(r.cor, r.logotipo) == {
        "cor": "#5fc2b7",
        "propria": True,
        "logotipo": None,
        "logotipo_proporcao": None,
    }


def test_uma_cor_media_deixa_a_regiao_carregar(prova):
    """Era recusada enquanto pintava uma faixa com texto por cima."""
    assert _com(prova, 'cor: "#d9643a"').cor == "#d9643a"


def test_o_que_nao_e_cor_nao_deixa_a_regiao_carregar(prova):
    with pytest.raises(ErroDeRegiao, match="não é uma cor"):
        _com(prova, 'cor: "laranja"')


def test_uma_cor_sem_aspas_nao_passa_por_cor_nenhuma(prova):
    """`cor: #5fc2b7` é, para o YAML, uma chave vazia e um comentário."""
    with pytest.raises(ErroDeRegiao, match="entre aspas"):
        _com(prova, "cor: #5fc2b7")


def test_o_logotipo_e_um_desenho_da_pasta_da_regiao(prova, tmp_path):
    (prova / "logotipo.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1"/></svg>'
    )
    r = _com(prova, "logotipo: logotipo.svg")
    publicada = marca_publicada(r.cor, r.logotipo)
    assert publicada["logotipo"].startswith("marca/logotipo-")
    assert publicada["logotipo_proporcao"] == 2.0


@pytest.mark.parametrize(
    "conteudo",
    [
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://exemplo.org/a.png"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(//exemplo.org/a.css)</style></svg>',
    ],
)
def test_um_logotipo_com_programas_ou_coisas_de_fora_e_recusado(prova, conteudo):
    (prova / "logotipo.svg").write_text(conteudo)
    with pytest.raises(ErroDeRegiao, match="logótipo"):
        _com(prova, "logotipo: logotipo.svg")


def test_o_logotipo_nao_sai_da_pasta_da_regiao(prova, tmp_path):
    (tmp_path / "fora.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    with pytest.raises(ErroDeRegiao, match="pasta da região"):
        _com(prova, "logotipo: ../../fora.svg")


def test_a_demonstracao_publica_a_sua_marca(raiz, tmp_path):
    """A demonstração mostra a marca branca: a cor dela, e o logótipo ao lado dos dados."""
    from paragem.sitio import construir

    gtfs = raiz / "build" / "demo" / "gtfs"
    if not gtfs.is_dir():
        pytest.skip("sem build/demo — corre `uv run pipeline build --regiao demo`")
    shutil.copytree(gtfs, tmp_path / "gtfs")
    r = regiao_ou_salta("demo")
    construir(raiz, r, tmp_path)
    publicada = json.loads((tmp_path / "sitio" / "regiao.json").read_text(encoding="utf-8"))
    marca = publicada["marca"]
    assert marca["propria"] is True and marca["cor"] == r.cor
    assert (tmp_path / "sitio" / marca["logotipo"]).read_bytes() == r.logotipo.read_bytes()
