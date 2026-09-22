"""Escolher um Java, e um que sirva.

Duas ferramentas, duas versões mínimas: o validador a partir da 17, o
OpenTripPlanner 2.6 a partir da 21. Num contentor com as duas instaladas,
«o java» dá conforme calha — e o OTP em Java 17 morre com
`UnsupportedClassVersionError`, que não diz a ninguém o que fazer a seguir.
"""

import pytest

from paragem import jvm


def test_encontra_um_java(monkeypatch):
    """Se não houver Java nenhum, o ambiente não serve para nada disto."""
    try:
        caminho = jvm.java(17)
    except jvm.SemJava:
        pytest.skip("este ambiente não tem Java — nada a verificar")
    assert jvm._versao(caminho) is not None


def test_respeita_a_versao_minima():
    try:
        jvm.java(17)
    except jvm.SemJava:
        pytest.skip("este ambiente não tem Java")
    with pytest.raises(jvm.SemJava, match="99"):
        jvm.java(99)


def test_a_mensagem_diz_o_que_encontrou():
    """Um erro que diz «não há Java» quando há três é um erro que engana.

    A mensagem tem de nomear os que encontrou e a versão de cada um, senão
    quem a lê vai instalar um Java que já lá está.
    """
    try:
        jvm.java(17)
    except jvm.SemJava:
        pytest.skip("este ambiente não tem Java")
    with pytest.raises(jvm.SemJava) as e:
        jvm.java(99)
    assert "Java" in str(e.value)
    assert "/" in str(e.value), "tem de nomear os caminhos que encontrou"


@pytest.mark.parametrize(
    ("saida", "esperado"),
    [
        ('openjdk version "21.0.10" 2026-01-20', 21),
        ('openjdk version "17.0.20" 2026-01-20', 17),
        # Antes da 9 a versão dizia-se 1.x, e 1.8 é a 8. Um `int("1")` daria 1,
        # e 1 é menor do que tudo — o Java 8 passaria por «demasiado antigo»
        # pela razão errada, que por acaso dá a resposta certa e um dia não dá.
        ('java version "1.8.0_402"', 8),
        ("isto não é a saída do java", None),
    ],
)
def test_le_a_versao_de_varias_formas(monkeypatch, saida, esperado):
    import subprocess

    class Falsa:
        stderr = saida
        stdout = ""

    monkeypatch.setattr(subprocess, "run", lambda *a, **k: Falsa())
    assert jvm._versao("/qualquer/java") == esperado


def test_java_home_ganha_ao_que_esta_instalado(monkeypatch, tmp_path):
    """Quem põe `JAVA_HOME` está a escolher, e a escolha respeita-se.

    Devolve-se o PRIMEIRO que sirva, não o mais recente — senão uma variável
    de ambiente posta de propósito era ignorada em silêncio.
    """
    escolhido = tmp_path / "bin" / "java"
    escolhido.parent.mkdir(parents=True)
    escolhido.write_text("")
    monkeypatch.setenv("JAVA_HOME", str(tmp_path))
    monkeypatch.setattr(jvm, "_versao", lambda c: 21)
    assert jvm.java(21) == str(escolhido)
