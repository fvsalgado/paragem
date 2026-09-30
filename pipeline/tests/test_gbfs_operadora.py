"""As estações de bicicletas ditas pelo próprio sistema, e o confronto com o mapa.

Os números aqui são MEDIDOS no instantâneo de `data/manual/`, não estimados:
77 estações, 67 do meioB e 10 do BUE. Se um deles mudar sem o ficheiro mudar,
alguém partiu a leitura.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from paragem.leitores import gbfs_operadora as leitor

MANUAL = Path(__file__).resolve().parents[2] / "data" / "manual" / "medio-tejo" / "meiob"
INSTANTANEO = MANUAL / "estacoes.mht"


@pytest.fixture(scope="module")
def estacoes():
    if not INSTANTANEO.exists():
        pytest.skip("sem o instantâneo das estações")
    return leitor._do_instantaneo(INSTANTANEO)


def test_o_instantaneo_traz_as_setenta_e_sete(estacoes):
    """As 77 que o sítio lista, com nome, coordenadas e concelho."""
    assert len(estacoes) == 77
    assert all(e["nome"] and e["cidade"] for e in estacoes)
    # A região está entre os 39,4 e os 39,9 de latitude e a poente de -7,9.
    assert all(39.4 < e["lat"] < 40.0 and -8.7 < e["lon"] < -7.9 for e in estacoes)


def test_os_dois_sistemas_distinguem_se_pelo_concelho(estacoes):
    """O sítio lista o meioB e o BUE na mesma página.

    O que os separa é o campo «cidade»: o BUE aparece com a cidade «BUE», e os
    do meioB com o concelho onde estão. Sem isto, os dez do Entroncamento
    saíam como se fossem do sistema intermunicipal, e são de um sistema da
    câmara.
    """
    bue = [e for e in estacoes if e["cidade"] == "BUE"]
    meiob = [e for e in estacoes if e["cidade"] != "BUE"]
    assert len(bue) == 10
    assert len(meiob) == 67
    # O Entroncamento tem os dois sistemas, e é por isso que o filtro não pode
    # ser pelo concelho.
    assert any(e["cidade"] == "Entroncamento" for e in meiob)


def test_os_nomes_sao_os_da_operadora_e_nao_os_do_mapa(estacoes):
    """«Alcanena - Zona Desportiva», e não «Bicicletas meioB - …».

    É a razão de este leitor existir: o OpenStreetMap sabe onde estão as
    estações — casam todas a menos de 60 m — mas escreve-lhes uma etiqueta de
    mapa. Quem procura a estação procura o nome que está no poste.
    """
    nomes = [e["nome"] for e in estacoes]
    assert not any(n.startswith("Bicicletas ") for n in nomes)
    assert "Alcanena - Zona Desportiva" in nomes
    assert len(set(nomes)) == len(nomes), "dois nomes iguais dariam o mesmo station_id"


def test_a_chave_de_uma_estacao_vem_do_nome():
    """O `station_id` não é um número de ordem.

    Um número de ordem muda quando a página ganha uma estação a meio, e os
    identificadores de todas as outras mudavam com ele — quem guardou uma
    ligação para uma estação deixava de lá chegar.
    """
    assert leitor._chave("Alcanena - Zona Desportiva") == "alcanena-zona-desportiva"
    assert leitor._chave("Ourém — Mercado/Câmara") == "ourem-mercado-camara"


def test_o_confronto_mede_em_metros():
    """Sessenta metros separam «a mesma estação» de «duas estações».

    Uma estação ocupa poucos metros; a diferença entre marcá-la no passeio e
    marcá-la na rotunda ao lado cabe nisto.
    """
    tomar = (39.6033, -8.4103)
    assert leitor._metros(tomar, tomar) == 0
    # Um centésimo de grau de latitude são pouco mais de mil metros.
    assert 1100 < leitor._metros(tomar, (39.6133, -8.4103)) < 1120
    assert leitor.RAIO_DE_CONFRONTO_M == 60.0


def test_a_construcao_produz_gbfs_sem_estado():
    """O ficheiro de descoberta anuncia SÓ o que existe.

    Anunciar `station_status` e servir 404 é pior do que não o anunciar — e a
    disponibilidade não é pública (CLAUDE.md §6.4).
    """
    raiz = Path(__file__).resolve().parents[2]
    pasta = raiz / "build" / "medio-tejo" / "gbfs" / "meiob"
    if not (pasta / "gbfs.json").exists():
        pytest.skip("sem build/medio-tejo")
    descoberta = json.loads((pasta / "gbfs.json").read_text(encoding="utf-8"))
    nomes = {f["name"] for f in descoberta["data"]["pt"]["feeds"]}
    assert nomes == {"system_information", "station_information"}
    assert not (pasta / "station_status.json").exists()

    estacoes = json.loads((pasta / "station_information.json").read_text(encoding="utf-8"))
    linhas = estacoes["data"]["stations"]
    # Invariante e não número: o que sai é a lista da operadora (67, um
    # instantâneo) menos as que o mapa não conhece — e o mapa muda todos os
    # dias (CLAUDE.md §8). Nenhuma estação publicada vem de fora da lista.
    assert 0 < len(linhas) <= 67
    if INSTANTANEO.exists():
        da_operadora = {
            e["nome"] for e in leitor._do_instantaneo(INSTANTANEO) if e["cidade"] != "BUE"
        }
        assert {e["name"] for e in linhas} <= da_operadora
    # Nenhuma estação traz um número de bicicletas, nem sequer a zero: um zero
    # publicado é uma afirmação, e não sabemos nada disto.
    assert not any("num_bikes_available" in e or "num_docks_available" in e for e in linhas)


# ---------------------------------------------------------------------------
# a posição é do mapa, o nome é da operadora
# ---------------------------------------------------------------------------
#
# Estes não precisam de região nenhuma: as estações são inventadas, a poucos
# metros umas das outras, e o que se prova é a regra. O ponto é da Serra da
# Pedra Alta, a região de prova, que também é inventada.
_CENTRO = (41.35, -7.30)


def _a_norte(ponto: tuple[float, float], metros: float) -> tuple[float, float]:
    return (ponto[0] + metros / 111320, ponto[1])


def _da_operadora(nome: str, ponto: tuple[float, float]) -> dict:
    return {"nome": nome, "lat": ponto[0], "lon": ponto[1], "cidade": "Pedra Alta"}


def _do_mapa(nome: str, ponto: tuple[float, float]) -> dict:
    return {"station_id": nome, "name": nome, "lat": ponto[0], "lon": ponto[1]}


def test_a_posicao_publicada_e_a_do_mapa_e_o_nome_o_da_operadora():
    """A receita declara ODbL porque as coordenadas vêm do OpenStreetMap.

    Este leitor escrevia as da página da operadora, e o ficheiro dizia uma
    origem que não tinha. Casada a estação, a posição é a do mapa — a que se
    pode distribuir — e o nome continua a ser o que está no poste.
    """
    estacao = _a_norte(_CENTRO, 500)
    operadora = [
        _da_operadora("Pedra Alta - Estação Ferroviária", _CENTRO),
        _da_operadora("Pedra Alta - Mercado", estacao),
    ]
    no_mapa_1 = _a_norte(_CENTRO, 20)
    no_mapa_2 = _a_norte(estacao, 35)
    mapa = [
        _do_mapa("Bicicletas - Mercado", no_mapa_2),
        _do_mapa("Bicicletas - Estação Ferroviária", no_mapa_1),
    ]

    casamento = leitor._casar(operadora, mapa)
    assert casamento == [1, 0]

    publicadas = leitor._nas_posicoes_do_mapa(operadora, mapa, casamento)
    assert [e["nome"] for e in publicadas] == [
        "Pedra Alta - Estação Ferroviária",
        "Pedra Alta - Mercado",
    ]
    assert [(e["lat"], e["lon"]) for e in publicadas] == [no_mapa_1, no_mapa_2]


def test_a_que_o_mapa_nao_conhece_fica_fora_do_ficheiro():
    """A posição dela é só da operadora, e essa não é nossa para distribuir.

    Não se perde em silêncio: a lacuna do confronto nomeia-a, e quando entrar
    no OpenStreetMap entra no ficheiro na construção seguinte.
    """
    operadora = [
        _da_operadora("Pedra Alta - Estação Ferroviária", _CENTRO),
        _da_operadora("Pedra Alta - Nova", _a_norte(_CENTRO, 2000)),
    ]
    mapa = [_do_mapa("Bicicletas - Estação Ferroviária", _a_norte(_CENTRO, 10))]

    casamento = leitor._casar(operadora, mapa)
    assert casamento == [0, None]
    publicadas = leitor._nas_posicoes_do_mapa(operadora, mapa, casamento)
    assert [e["nome"] for e in publicadas] == ["Pedra Alta - Estação Ferroviária"]


def test_duas_da_operadora_nao_levam_a_mesma_do_mapa():
    """Uma estação do mapa é uma estação só.

    Duas da operadora a vinte metros uma da outra caem as duas perto da mesma
    do mapa. A primeira leva-a; a segunda fica por casar, e é nomeada — em vez
    de saírem duas estações publicadas no mesmo ponto.
    """
    operadora = [
        _da_operadora("Pedra Alta - Norte", _a_norte(_CENTRO, 10)),
        _da_operadora("Pedra Alta - Sul", _a_norte(_CENTRO, -10)),
    ]
    mapa = [_do_mapa("Bicicletas", _CENTRO)]
    assert leitor._casar(operadora, mapa) == [0, None]


def test_um_mapa_declarado_e_por_construir_para_a_construcao(tmp_path):
    """Antes calava o confronto; agora é dele que vêm as posições.

    Sem o mapa, sairiam as da operadora num ficheiro cuja licença diz que são
    do mapa — que é exatamente o defeito que isto corrige. Rebenta, e diz qual
    é a saída que falta e onde tem de estar.
    """
    from types import SimpleNamespace

    saida = SimpleNamespace(fonte="meiob-estacoes", saida="gbfs/meiob/")
    ctx = SimpleNamespace(caminho_de_saida=lambda s: tmp_path / "gbfs" / "meiob")
    with pytest.raises(ValueError, match="gbfs/osm/meiob/"):
        leitor._do_mapa(ctx, saida, "gbfs/osm/meiob/")

    mapa = tmp_path / "gbfs" / "osm" / "meiob"
    mapa.mkdir(parents=True)
    (mapa / "station_information.json").write_text(
        json.dumps({"data": {"stations": [_do_mapa("Uma", _CENTRO)]}}), encoding="utf-8"
    )
    assert [e["name"] for e in leitor._do_mapa(ctx, saida, "gbfs/osm/meiob/")] == ["Uma"]
