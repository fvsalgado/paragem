"""O horário de uma linha, como o de papel — `quadros.py`."""

from paragem.quadros import (
    Passagem,
    ViagemDoSentido,
    com_ocorrencias,
    encaixar,
    fundir,
    quadro_do_sentido,
)


def _viagem(servico, *passagens, destino=""):
    return ViagemDoSentido(
        servico_id=f"f:{servico}",
        servico_nome=servico,
        destino=destino or passagens[-1][0],
        passagens=[Passagem(p, h, m) for p, h, m in passagens],
    )


def test_a_fusao_guarda_a_ordem_das_duas_sequencias():
    a = ["T", "A", "B", "C"]
    b = ["T", "A", "X", "C"]
    f = fundir(a, b)
    assert encaixar(a, f) == sorted(encaixar(a, f))
    assert encaixar(b, f) == sorted(encaixar(b, f))
    assert set(f) == {"T", "A", "B", "X", "C"}
    assert len(f) == 5, "a mais curta que tem as duas lá dentro"


def test_uma_circular_passa_duas_vezes_no_terminal():
    """A partida e a chegada ao mesmo cais são duas linhas do quadro, não uma."""
    assert com_ocorrencias(["T", "A", "T"]) == [("T", 0), ("A", 0), ("T", 1)]
    q = quadro_do_sentido(
        [_viagem("A-U", ("T", "08:00", True), ("A", "08:10", True), ("T", "08:20", True))],
        {"T": "Terminal", "A": "Mercado"},
    )
    assert [p["nome"] for p in q["paragens"]] == ["Terminal", "Mercado", "Terminal"]
    assert q["viagens"][0]["horas"] == ["08:00", "08:10", "08:20"]


def test_so_entram_as_paragens_com_hora_marcada_e_as_estimadas_dizem_se():
    """O caderno marca um terço das paragens; as outras horas são nossas."""
    nomes = {"T": "Terminal", "A": "A", "B": "B", "F": "Fim"}
    v1 = _viagem("A-U", ("T", "07:00", True), ("A", "07:05", False), ("F", "07:30", True))
    v2 = _viagem("A-U", ("T", "09:00", True), ("A", "09:06", True), ("F", "09:30", True))
    v3 = _viagem("A-S", ("T", "10:00", True), ("B", "10:10", False), ("F", "10:30", True))
    q = quadro_do_sentido([v3, v2, v1], nomes)
    # «B» só tem hora estimada em todas as viagens: fica fora do quadro.
    assert [p["id"] for p in q["paragens"]] == ["T", "A", "F"]
    # As colunas pela hora de partida, e cada hora no sítio certo.
    assert [v["horas"] for v in q["viagens"]] == [
        ["07:00", "07:05", "07:30"],
        ["09:00", "09:06", "09:30"],
        ["10:00", "", "10:30"],
    ]
    assert q["viagens"][0]["estimadas"] == [1], "a das 07:05 é estimada"
    assert q["viagens"][1]["estimadas"] == []
    assert q["viagens"][2]["servico_nome"] == "A-S"


def test_uma_variante_que_salta_paragens_fica_com_traco_e_nao_com_a_hora_errada():
    nomes = {k: k for k in "TABCF"}
    longa = _viagem("A-U", ("T", "07:00", True), ("A", "07:10", True), ("F", "07:40", True))
    curta = _viagem("A-U", ("A", "08:10", True), ("F", "08:40", True))
    desvio = _viagem("A-U", ("T", "09:00", True), ("C", "09:20", True), ("F", "09:45", True))
    q = quadro_do_sentido([longa, longa, curta, desvio], nomes)
    ids = [p["id"] for p in q["paragens"]]
    assert ids[0] == "T" and ids[-1] == "F"
    horas = {v["horas"][ids.index("F")]: v["horas"] for v in q["viagens"]}
    assert horas["08:40"][ids.index("T")] == "", "a curta não parte do terminal"
    assert horas["09:45"][ids.index("C")] == "09:20"
    assert horas["07:40"][ids.index("C")] == ""


def test_sem_nenhuma_hora_marcada_nao_ha_quadro():
    """Um quadro só de estimativas seria pior do que nenhum."""
    q = quadro_do_sentido([_viagem("A-U", ("T", "07:00", False), ("F", "07:30", False))], {})
    assert q == {"paragens": [], "viagens": []}
    assert quadro_do_sentido([], {}) == {"paragens": [], "viagens": []}
