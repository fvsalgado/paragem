"""Ler e escrever GTFS."""

from paragem.gtfs import Gtfs, segundos


def test_ida_e_volta_preserva_tudo(raiz, tmp_path):
    origem = Gtfs.ler(raiz / "data" / "manual" / "prova" / "gtfs-rede-alta")
    destino = tmp_path / "feed.zip"
    origem.escrever(destino)
    assert Gtfs.ler(destino).resumo() == origem.resumo()


def test_duas_escritas_produzem_o_mesmo_ficheiro(raiz, tmp_path):
    """Senão não se consegue dizer se uma diferença veio dos dados ou da máquina."""
    g = Gtfs.ler(raiz / "data" / "manual" / "prova" / "gtfs-rede-alta")
    a, b = tmp_path / "a.zip", tmp_path / "b.zip"
    g.escrever(a)
    g.escrever(b)
    assert a.read_bytes() == b.read_bytes()


def test_horas_depois_da_meia_noite():
    """Uma viagem que parte às 23h50 e chega às 00h20 escreve-se 24:20:00."""
    assert segundos("24:20:00") == 87600
    assert segundos("00:20:00") == 1200
    assert segundos("25:10:00") == 90600
    assert segundos("") is None
    assert segundos("nem por isso") is None
