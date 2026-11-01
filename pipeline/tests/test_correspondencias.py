"""As estações de comboio sem autocarro perto, e QUE FEEDS se comparam.

Os feeds estavam cravados no código com os nomes dos ficheiros da primeira
região: numa região com outros nomes, a verificação declarada saltava em
silêncio — nem contagem, nem lacuna, nem uma linha no relatório. Quem decide
que feeds se comparam é a receita; o que faltar diz-se.

Os feeds são inventados, aqui mesmo, com duas estações e três paragens.
"""

from pathlib import Path
from types import SimpleNamespace

from paragem.construcao import _correspondencias
from paragem.gtfs import Gtfs
from paragem.regiao import Saida
from paragem.relatorio import AVISO, LACUNA, Relatorio

#: A estação da vila tem uma paragem a 100 m; a do ermo não tem nada perto.
ESTACOES = [("Vila (Estação)", 40.0, -9.0), ("Ermo", 40.1, -9.1)]
PARAGENS = [("Vila (Largo)", 40.0009, -9.0), ("Outra", 40.05, -9.05)]


def _feed(destino: Path, saida: str, pontos: list[tuple[str, float, float]]) -> None:
    g = Gtfs()
    g.definir(
        "stops.txt",
        ["stop_id", "stop_name", "stop_lat", "stop_lon"],
        [
            {"stop_id": f"p{i}", "stop_name": n, "stop_lat": str(la), "stop_lon": str(lo)}
            for i, (n, la, lo) in enumerate(pontos)
        ],
    )
    (destino / saida).parent.mkdir(parents=True, exist_ok=True)
    g.escrever(destino / saida)


def _ctx(verificacao: dict, saidas=("gtfs/ferro.zip", "gtfs/rede.zip", "gtfs/outra.zip")):
    regiao = SimpleNamespace(
        id="ensaio",
        verificacoes=[{"tipo": "correspondencias-comboio-autocarro", **verificacao}],
        saidas=[Saida(fonte="f", leitor="gtfs-arquivo", saida=s) for s in saidas],
    )
    return SimpleNamespace(
        regiao=regiao, relatorio=Relatorio(regiao="ensaio"), dentro=lambda lat, lon: True
    )


def _ids(ctx) -> dict[str, str]:
    return {x.id: x.gravidade for x in ctx.relatorio.lacunas}


def test_os_feeds_vem_da_receita(tmp_path):
    _feed(tmp_path, "gtfs/ferro.zip", ESTACOES)
    _feed(tmp_path, "gtfs/rede.zip", PARAGENS)
    ctx = _ctx({"comboio": "gtfs/ferro.zip", "autocarro": ["gtfs/rede.zip"]})
    _correspondencias(ctx, tmp_path)
    assert ctx.relatorio.contagens["correspondencias.estacoes_na_regiao"] == 2
    assert ctx.relatorio.contagens["correspondencias.estacoes_sem_paragem"] == 1
    lacuna = next(x for x in ctx.relatorio.lacunas if x.id.endswith("estacoes-sem-paragem"))
    assert lacuna.quais == ["Ermo"]


def test_varios_feeds_de_um_lado_contam_todos(tmp_path):
    # A paragem que serve o ermo vem de OUTRO feed — uma concessão vizinha.
    _feed(tmp_path, "gtfs/ferro.zip", ESTACOES)
    _feed(tmp_path, "gtfs/rede.zip", PARAGENS)
    _feed(tmp_path, "gtfs/outra.zip", [("Ermo (Cruzamento)", 40.1015, -9.1)])
    ctx = _ctx({"comboio": "gtfs/ferro.zip", "autocarro": ["gtfs/rede.zip", "gtfs/outra.zip"]})
    _correspondencias(ctx, tmp_path)
    assert ctx.relatorio.contagens["correspondencias.estacoes_sem_paragem"] == 0
    assert "correspondencias.estacoes-sem-paragem" not in _ids(ctx)


def test_sem_nomes_os_feeds_saem_da_receita_como_nas_paginas_das_estacoes(tmp_path):
    # Uma região que já declarava a verificação sem nomear os feeds continua
    # a correr: o comboio é o modo `comboio`, o autocarro é a rede da própria
    # região. A concessão vizinha, com uma paragem perto do ermo, fica de fora.
    _feed(tmp_path, "gtfs/ferro.zip", ESTACOES)
    _feed(tmp_path, "gtfs/rede.zip", PARAGENS)
    _feed(tmp_path, "gtfs/outra.zip", [("Ermo (Cruzamento)", 40.1015, -9.1)])
    ctx = _ctx({"raio_metros": 300})
    ctx.regiao.saidas = [
        Saida(
            fonte="f",
            leitor="gtfs-arquivo",
            saida="gtfs/ferro.zip",
            modo="comboio",
            papel="feed-de-terceiro",
        ),
        Saida(
            fonte="f",
            leitor="gtfs-arquivo",
            saida="gtfs/rede.zip",
            modo="autocarro",
            papel="horarios",
        ),
        Saida(
            fonte="f",
            leitor="gtfs-arquivo",
            saida="gtfs/outra.zip",
            modo="autocarro",
            papel="feed-de-terceiro",
        ),
    ]
    _correspondencias(ctx, tmp_path)
    assert "correspondencias.sem-feeds" not in _ids(ctx)
    assert ctx.relatorio.contagens["correspondencias.estacoes_sem_paragem"] == 1


def test_declarada_sem_feeds_diz_se_e_nao_salta_em_silencio(tmp_path):
    ctx = _ctx({"raio_metros": 300})
    _correspondencias(ctx, tmp_path)
    assert _ids(ctx) == {"correspondencias.sem-feeds": LACUNA}
    assert ctx.relatorio.lacunas[0].quais == ["comboio", "autocarro"]
    assert "correspondencias.estacoes_na_regiao" not in ctx.relatorio.contagens


def test_um_feed_que_a_receita_nao_tem_diz_se(tmp_path):
    ctx = _ctx({"comboio": "gtfs/ferro.zip", "autocarro": "gtfs/trocado.zip"})
    _correspondencias(ctx, tmp_path)
    assert _ids(ctx) == {"correspondencias.feed-desconhecido": LACUNA}
    assert ctx.relatorio.lacunas[0].quais == ["gtfs/trocado.zip"]


def test_um_feed_que_nao_se_construiu_diz_se(tmp_path):
    _feed(tmp_path, "gtfs/ferro.zip", ESTACOES)
    ctx = _ctx({"comboio": "gtfs/ferro.zip", "autocarro": "gtfs/rede.zip"})
    _correspondencias(ctx, tmp_path)
    assert _ids(ctx) == {"correspondencias.feed-em-falta": LACUNA}
    assert ctx.relatorio.lacunas[0].quais == ["gtfs/rede.zip"]


def test_o_numero_esperado_que_nao_bate_e_um_aviso_e_nao_um_bloqueio(tmp_path):
    # O feed do comboio é de terceiros e está vivo: uma estação que abre muda
    # a conta sem que nada esteja errado deste lado.
    _feed(tmp_path, "gtfs/ferro.zip", ESTACOES)
    _feed(tmp_path, "gtfs/rede.zip", PARAGENS)
    ctx = _ctx(
        {"comboio": "gtfs/ferro.zip", "autocarro": "gtfs/rede.zip", "esperado_sem_ligacao": 3}
    )
    _correspondencias(ctx, tmp_path)
    assert _ids(ctx)["correspondencias.diferente-do-esperado"] == AVISO
    assert not ctx.relatorio.tem_bloqueios


def test_o_numero_esperado_que_bate_nao_diz_nada(tmp_path):
    _feed(tmp_path, "gtfs/ferro.zip", ESTACOES)
    _feed(tmp_path, "gtfs/rede.zip", PARAGENS)
    ctx = _ctx(
        {"comboio": "gtfs/ferro.zip", "autocarro": "gtfs/rede.zip", "esperado_sem_ligacao": 1}
    )
    _correspondencias(ctx, tmp_path)
    assert "correspondencias.diferente-do-esperado" not in _ids(ctx)


# --- o fim dos feeds de outras entidades -------------------------------------


def _feed_com_fim(tmp_path, nome: str, ultimo_dia: str):
    import zipfile

    caminho = tmp_path / "gtfs" / f"{nome}.zip"
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(caminho, "w") as z:
        z.writestr(
            "agency.txt",
            "agency_id,agency_name,agency_url,agency_timezone\na,Comboios da Serra,http://x,UTC\n",
        )
        z.writestr(
            "calendar.txt",
            "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
            f"start_date,end_date\nS,1,1,1,1,1,1,1,20261101,{ultimo_dia}\n",
        )
    return caminho


def _contexto_com(tmp_path, saidas):
    from types import SimpleNamespace

    from paragem.relatorio import Relatorio

    return SimpleNamespace(
        regiao=SimpleNamespace(id="serra", saidas=saidas), relatorio=Relatorio(regiao="serra")
    )


def test_um_feed_de_terceiro_que_acaba_daqui_a_pouco_da_lacuna(tmp_path):
    from datetime import date
    from types import SimpleNamespace

    from paragem.construcao import _validade_dos_feeds_de_terceiros

    _feed_com_fim(tmp_path, "comboio", "20261212")
    saida = SimpleNamespace(
        papel="feed-de-terceiro", saida="gtfs/comboio.zip", fonte="comboio-gtfs", params={}
    )
    ctx = _contexto_com(tmp_path, [saida])
    _validade_dos_feeds_de_terceiros(ctx, tmp_path, hoje=date(2026, 11, 1))
    (lac,) = ctx.relatorio.lacunas
    assert lac.id == "comboio.acaba-em-breve"
    assert "Comboios da Serra" in lac.o_que and "12/12/2026" in lac.o_que
    assert "daqui a 41 dias" in lac.o_que
    assert ctx.relatorio.contagens["comboio.dias_ate_ao_fim"] == 41


def test_um_feed_de_terceiro_com_folga_nao_da_lacuna_e_o_da_casa_nunca(tmp_path):
    from datetime import date
    from types import SimpleNamespace

    from paragem.construcao import _validade_dos_feeds_de_terceiros

    _feed_com_fim(tmp_path, "comboio", "20270301")
    _feed_com_fim(tmp_path, "rede", "20261105")
    saidas = [
        SimpleNamespace(papel="feed-de-terceiro", saida="gtfs/comboio.zip", fonte="c", params={}),
        SimpleNamespace(papel="horarios", saida="gtfs/rede.zip", fonte="r", params={}),
    ]
    ctx = _contexto_com(tmp_path, saidas)
    _validade_dos_feeds_de_terceiros(ctx, tmp_path, hoje=date(2026, 11, 1))
    assert ctx.relatorio.lacunas == []
