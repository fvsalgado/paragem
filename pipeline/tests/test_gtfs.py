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


# --- a janela de serviço ----------------------------------------------------
#
# Estas afirmações substituíram uma contagem exata que partiu sozinha na
# primeira madrugada depois de ser escrita. Valem o que apanham, e o que
# apanham está aqui — cada uma com o feed que a faz falhar.


def _feed_com_janela(primeira, ultima, servicos=("A",), sem_datas=(), inicio=None):
    from paragem.gtfs import Gtfs

    feed = Gtfs()
    feed.definir(
        "trips.txt",
        ["trip_id", "service_id"],
        [{"trip_id": f"t{i}", "service_id": s} for i, s in enumerate([*servicos, *sem_datas])],
    )
    feed.definir(
        "calendar_dates.txt",
        ["service_id", "date", "exception_type"],
        [
            {"service_id": s, "date": d.strftime("%Y%m%d"), "exception_type": "1"}
            for s in servicos
            for d in (primeira, ultima)
        ],
    )
    if inicio is not None:
        # O início da janela, como os feeds próprios o declaram: o dia da construção.
        feed.definir(
            "feed_info.txt",
            ["feed_publisher_name", "feed_start_date"],
            [{"feed_publisher_name": "x", "feed_start_date": inicio.strftime("%Y%m%d")}],
        )
    return feed


def _falhas(feed, rotulo="x"):
    from paragem.verificacoes import Resultado, _janela_de_servico

    r = Resultado("janela")
    _janela_de_servico(r, feed, rotulo)
    return r.falhou


def test_uma_janela_de_um_ano_a_comecar_hoje_passa():
    from datetime import date, timedelta

    hoje = date.today()
    assert not _falhas(_feed_com_janela(hoje, hoje + timedelta(days=364)))


def test_uma_construcao_de_ontem_conferida_hoje_passa():
    """O caso que a afirmação óbvia — «começa hoje» — teria reprovado.

    Uma corrida que atravesse a meia-noite constrói num dia e confere no outro.
    """
    from datetime import date, timedelta

    ontem = date.today() - timedelta(days=1)
    assert not _falhas(_feed_com_janela(ontem, ontem + timedelta(days=364)))


def test_um_feed_que_ninguem_reconstroi_reprova():
    from datetime import date, timedelta

    velho = date.today() - timedelta(days=30)
    assert _falhas(_feed_com_janela(velho, velho + timedelta(days=364)))


def test_um_feed_que_so_comeca_para_a_semana_reprova():
    from datetime import date, timedelta

    amanha = date.today() + timedelta(days=7)
    assert _falhas(_feed_com_janela(amanha, amanha + timedelta(days=364)))


def test_um_servico_que_nao_anda_hoje_passa_se_o_feed_comecou_hoje():
    """O caso de 4/10/2026: domingo, e segunda-feira feriado.

    O transporte a pedido só anda em dias úteis, e a primeira data com serviço
    era terça. O feed estava certo — começava no dia da construção, e dizia-o
    no `feed_info` — e a verificação chumbava-o como se começasse daí a dois
    dias.
    """
    from datetime import date, timedelta

    hoje = date.today()
    terca = hoje + timedelta(days=2)
    assert not _falhas(_feed_com_janela(terca, hoje + timedelta(days=364), inicio=hoje))


def test_um_feed_que_diz_comecar_amanha_reprova():
    """O que a verificação existe para apanhar continua apanhado."""
    from datetime import date, timedelta

    amanha = date.today() + timedelta(days=1)
    assert _falhas(_feed_com_janela(amanha, amanha + timedelta(days=364), inicio=amanha))


def test_datas_antes_do_inicio_declarado_reprovam():
    from datetime import date, timedelta

    hoje = date.today()
    ontem = hoje - timedelta(days=1)
    falhas = _falhas(_feed_com_janela(ontem, hoje + timedelta(days=364), inicio=hoje))
    assert any("antes do início declarado" in m for m in falhas)


def test_um_calendario_que_colapsou_reprova():
    """Três dias em vez de um ano.

    É o que as outras afirmações não apanham: as contagens de linhas, viagens e
    paragens não mudam quando o que desaparece são as datas.
    """
    from datetime import date, timedelta

    hoje = date.today()
    assert _falhas(_feed_com_janela(hoje, hoje + timedelta(days=3)))


def test_um_servico_sem_datas_reprova():
    """Uma linha que existe no feed e não corre em dia nenhum.

    Estava declarado no `numeros.yaml` como `servicos_sem_datas: 0` e não era
    conferido em lado nenhum — é assim que uma carreira desaparece do sítio sem
    nada ficar vermelho.
    """
    from datetime import date, timedelta

    hoje = date.today()
    feed = _feed_com_janela(hoje, hoje + timedelta(days=364), servicos=("A",), sem_datas=("B",))
    assert any("têm datas" in m for m in _falhas(feed))


def test_um_feed_sem_datas_nenhumas_reprova():
    from paragem.gtfs import Gtfs

    feed = Gtfs()
    feed.definir("trips.txt", ["trip_id", "service_id"], [])
    feed.definir("calendar_dates.txt", ["service_id", "date"], [])
    assert _falhas(feed)
