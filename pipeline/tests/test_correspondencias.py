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
