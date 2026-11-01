"""A rede no mapa: um traço por troço, mais grosso onde passa mais.

Cada regra com um caso pequeno e inventado. O que estes testes guardam é a
CONTA — que dia conta, que viagens somam, o que se junta e o que se corta —,
porque o desenho vê-se no ecrã e a conta não.
"""

from __future__ import annotations

import json
from pathlib import Path

from paragem.percursos import codificar
from paragem.rede_no_mapa import (
    _descodificar,
    construir,
    dias_de_referencia,
    escrever_em,
    parecidos,
)

# Uma terra a 39° N: 0,001° de latitude são ~110 m.
LAT, LON = 39.5, -8.5


def _grelha(paragens, linhas, viagens, datas, servicos=("rede:U", "rede:S")):
    """Uma grelha como a do planeador: (lat, lon) por paragem, (código, modo) por linha."""
    return {
        "paragens": [[f"rede:p{i}", lat, lon, f"P{i}"] for i, (lat, lon) in enumerate(paragens)],
        "linhas": [[codigo, codigo, None, modo, 0] for codigo, modo in linhas],
        "viagens": [
            [linha, servico, [x for p in seq for x in (p, 0, 0)]] for linha, servico, seq in viagens
        ],
        "servicos": list(servicos),
        "datas": datas,
    }


# Segunda a sábado de uma semana qualquer: o serviço 0 anda nos dias úteis, o 1
# ao sábado.
SEMANA = {
    "20261102": [0],
    "20261103": [0],
    "20261104": [0],
    "20261105": [0],
    "20261106": [0],
    "20261107": [1],
}


def _em_linha(n: int, passo: float = 0.003) -> list[tuple[float, float]]:
    """N paragens em fila para norte, a ~330 m umas das outras."""
    return [(LAT + i * passo, LON) for i in range(n)]


def test_o_dia_de_referencia_e_o_dia_util_que_mais_se_repete():
    datas = {
        **SEMANA,
        # Uma sexta-feira com um serviço a mais (um feriado municipal ao
        # contrário) não passa a ser o dia típico por ter mais viagens.
        "20261113": [0, 1],
    }
    g = _grelha(_em_linha(2), [("1", "autocarro")], [(0, 0, [0, 1]), (0, 1, [0, 1])], datas)
    ((feed, (data, servicos)),) = dias_de_referencia(g).items()
    assert feed == "rede"
    assert servicos == frozenset({0})
    assert data == "20261102", "entre empates, o primeiro dia"


def test_um_feed_so_de_fins_de_semana_conta_com_os_dias_que_tem():
    g = _grelha(
        _em_linha(2), [("1", "autocarro")], [(0, 0, [0, 1])], {"20261107": [0]}, ("rede:S",)
    )
    assert dias_de_referencia(g)["rede"] == ("20261107", frozenset({0}))


def test_conta_as_viagens_do_dia_util_e_mantem_a_linha_que_nao_anda_nele():
    g = _grelha(
        _em_linha(4),
        [("1", "autocarro"), ("2", "autocarro")],
        [
            (0, 0, [0, 1]),
            (0, 0, [0, 1]),
            (0, 0, [0, 1]),
            # A linha 2 só anda ao sábado: fica no mapa, com zero.
            (1, 1, [2, 3]),
        ],
        SEMANA,
    )
    rede = construir(g, None)
    assert sorted(n for _, n, _ in rede["trocos"]) == [0, 3]


def test_os_dois_sentidos_somam_quando_e_o_mesmo_troco():
    # A ida pára do lado nascente da rua, a volta do lado poente: paragens
    # diferentes a 15 m uma da outra. São o mesmo troço, e somam.
    nascente = [(LAT, LON + 0.0001), (LAT + 0.003, LON + 0.0001)]
    poente = [(LAT, LON - 0.0001), (LAT + 0.003, LON - 0.0001)]
    g = _grelha(
        nascente + poente,
        [("1", "autocarro")],
        [(0, 0, [0, 1])] * 7 + [(0, 0, [3, 2])] * 6,
        SEMANA,
    )
    rede = construir(g, None)
    assert [n for _, n, _ in rede["trocos"]] == [13]


def test_um_sentido_unico_por_outra_rua_fica_com_o_seu_traco(tmp_path: Path):
    # A ida vai pela rua de cima, a volta pela de baixo, a 300 m: as duas ruas
    # ficam desenhadas, cada uma com a sua viagem — e não se somam.
    a, b = (LAT, LON), (LAT, LON + 0.01)
    ida = [a, (LAT + 0.0027, LON + 0.005), b]
    volta = [b, (LAT - 0.0027, LON + 0.005), a]
    pasta = tmp_path / "percursos"
    pasta.mkdir()
    (pasta / "0.json").write_text(
        json.dumps({"linha": "1", "trocos": {"0>1": codificar(ida), "1>0": codificar(volta)}})
    )
    g = _grelha([a, b], [("1", "autocarro")], [(0, 0, [0, 1]), (0, 0, [1, 0])], SEMANA)
    rede = construir(g, pasta)
    assert {n for _, n, _ in rede["trocos"]} == {1}
    pontos = [p for _, _, poli in rede["trocos"] for p in _descodificar(poli)]
    assert max(lat for lat, _ in pontos) > LAT + 0.002, "a rua de cima perdeu-se"
    assert min(lat for lat, _ in pontos) < LAT - 0.002, "a rua de baixo perdeu-se"


def test_a_forma_vem_do_percurso_da_linha_e_nao_de_outra(tmp_path: Path):
    a, b = (LAT, LON), (LAT, LON + 0.01)
    curva = [a, (LAT + 0.004, LON + 0.005), b]
    pasta = tmp_path / "percursos"
    pasta.mkdir()
    # O ficheiro diz que é da linha «9»: não é desta, desenha-se a direito.
    (pasta / "0.json").write_text(json.dumps({"linha": "9", "trocos": {"0>1": codificar(curva)}}))
    g = _grelha([a, b], [("1", "autocarro")], [(0, 0, [0, 1])], SEMANA)
    ((_, _, poli),) = construir(g, pasta)["trocos"]
    assert len(_descodificar(poli)) == 2

    (pasta / "0.json").write_text(json.dumps({"linha": "1", "trocos": {"0>1": codificar(curva)}}))
    ((_, _, poli),) = construir(g, pasta)["trocos"]
    assert max(lat for lat, _ in _descodificar(poli)) > LAT + 0.003, "a curva perdeu-se"


def test_as_formas_finas_ganham_aos_percursos(tmp_path: Path):
    a, b = (LAT, LON), (LAT, LON + 0.01)
    pasta = tmp_path / "percursos"
    pasta.mkdir()
    grossa = [a, b]
    fina = [a, (LAT + 0.0005, LON + 0.003), (LAT + 0.0005, LON + 0.007), b]
    (pasta / "0.json").write_text(json.dumps({"linha": "1", "trocos": {"0>1": codificar(grossa)}}))
    g = _grelha([a, b], [("1", "autocarro")], [(0, 0, [0, 1])], SEMANA)
    ((_, _, poli),) = construir(g, pasta, finas={("rede:p0", "rede:p1"): fina})["trocos"]
    assert len(_descodificar(poli)) == 4


def test_os_trocos_seguidos_iguais_sao_um_traco_e_partem_onde_outra_linha_entra():
    # Linha 1: p0→p1→p2→p3, duas viagens. Linha 2 junta-se em p2→p3, com uma.
    g = _grelha(
        _em_linha(4) + [(LAT + 0.006, LON + 0.004)],
        [("1", "autocarro"), ("2", "autocarro")],
        [(0, 0, [0, 1, 2, 3]), (0, 0, [0, 1, 2, 3]), (1, 0, [4, 2, 3])],
        SEMANA,
    )
    rede = construir(g, None)
    por_viagens = sorted((n, len(_descodificar(p))) for _, n, p in rede["trocos"])
    # p0→p2 é um traço só (2 viagens), p2→p3 tem 3, p4→p2 tem 1.
    assert [n for n, _ in por_viagens] == [1, 2, 3]
    assert por_viagens[1][1] >= 3, "p0→p1→p2 devia ser um traço, e não dois"


def test_corta_o_que_fica_todo_fora_da_caixa_e_deixa_o_que_atravessa():
    dentro, fronteira, longe = (LAT, LON), (LAT + 0.2, LON), (LAT + 2.0, LON)
    g = _grelha([dentro, fronteira, longe], [("R", "comboio")], [(0, 0, [0, 1, 2])], SEMANA)
    caixa = (LAT - 0.1, LAT + 0.1, LON - 0.1, LON + 0.1)
    rede = construir(g, None, caixa)
    ((_, n, poli),) = rede["trocos"]
    assert n == 1
    assert max(lat for lat, _ in _descodificar(poli)) < LAT + 0.3, "a viagem não pára na fronteira"
    assert rede["modos"] == ["comboio"]


def test_os_expressos_nao_entram():
    g = _grelha(
        _em_linha(3),
        [("1", "autocarro"), ("E", "expresso")],
        [(0, 0, [0, 1]), (1, 0, [1, 2])],
        SEMANA,
    )
    rede = construir(g, None)
    assert rede["modos"] == ["autocarro"]
    assert len(rede["trocos"]) == 1


def test_os_tracados_sem_horario_entram_sem_viagens():
    g = _grelha(_em_linha(2), [("1", "autocarro")], [(0, 0, [0, 1])], SEMANA)
    rede = construir(g, None, outros=[("urbano-municipal", [(LAT, LON), (LAT, LON + 0.01)])])
    assert rede["modos"] == ["autocarro", "urbano-municipal"]
    sem = [t for t in rede["trocos"] if rede["modos"][t[0]] == "urbano-municipal"]
    assert [n for _, n, _ in sem] == [None]


def test_parecidos_tolera_a_simplificacao_e_separa_outra_rua():
    reta = [(LAT, LON), (LAT, LON + 0.01)]
    perto = [(LAT, LON), (LAT + 0.0003, LON + 0.005), (LAT, LON + 0.01)]  # ~33 m
    longe = [(LAT, LON), (LAT + 0.003, LON + 0.005), (LAT, LON + 0.01)]  # ~330 m
    assert parecidos(reta, perto)
    assert not parecidos(reta, longe)


def test_o_ficheiro_sai_igual_duas_vezes(tmp_path: Path):
    g = _grelha(_em_linha(5), [("1", "autocarro")], [(0, 0, [0, 1, 2, 3, 4])], SEMANA)
    escrever_em(tmp_path, construir(g, None))
    primeiro = (tmp_path / "rede-no-mapa.json").read_bytes()
    escrever_em(tmp_path, construir(g, None))
    assert (tmp_path / "rede-no-mapa.json").read_bytes() == primeiro
    dados = json.loads(primeiro)
    assert dados["formato"] == "rede/1"
    assert dados["campos"] == ["modo", "viagens", "polilinha"]
    assert dados["dias"] == {"rede": "20261102"}
