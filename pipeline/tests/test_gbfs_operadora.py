"""As estações de bicicletas ditas pelo próprio sistema, e o confronto com o mapa.

Os números aqui são os que a RECEITA da região declara (`esperado`), medidos no
instantâneo que ela guarda em `data/manual/`, e não estimados. Se um deles mudar
sem o ficheiro mudar, alguém partiu a leitura.

O instantâneo procura-se pela PROPRIEDADE — uma saída `gbfs-operadora` com o
ficheiro à mão —, e não pelo nome do sistema nem da região (CLAUDE.md §5.1):
numa raiz sem nenhum, os testes que precisam dele saltam e dizem porquê.
"""

from __future__ import annotations

import json

import pytest

from conftest import RAIZ, construcao_de
from paragem.fontes import ACESSO_AUTOMATICO, ErroDeFonte, Registo
from paragem.leitores import gbfs_operadora as leitor
from paragem.regiao import carregar_todas


def _filtradas(saida, estacoes: list[dict]) -> list[dict]:
    """O que a saída tira do instantâneo — o mesmo filtro do leitor."""
    so = saida.params.get("cidades")
    excepto = saida.params.get("excepto_cidades")
    if so:
        estacoes = [e for e in estacoes if e["cidade"] in so]
    if excepto:
        estacoes = [e for e in estacoes if e["cidade"] not in excepto]
    return estacoes


@pytest.fixture(scope="module")
def instantaneos():
    """(região, saída, estações do instantâneo) de cada saída `gbfs-operadora`.

    Só de fontes que não se descarregam: um teste não vai à rede.
    """
    registo = Registo.carregar(RAIZ)
    achados = []
    for r in carregar_todas(RAIZ):
        for s in r.saidas:
            if s.leitor != leitor.nome:
                continue
            try:
                if registo.obter(s.fonte).acesso == ACESSO_AUTOMATICO:
                    continue
                caminho = registo.caminho(s.fonte, descarregar=False)
            except ErroDeFonte:
                continue
            if caminho.exists():
                achados.append((r, s, leitor._do_instantaneo(caminho)))
    if not achados:
        pytest.skip(
            "nenhuma região desta raiz tem o instantâneo de um sistema de bicicletas "
            "(`gbfs-operadora`) — se ela vive noutra raiz, aponta-a com PARAGEM_RAIZES"
        )
    return achados


def test_o_instantaneo_traz_as_estacoes_que_a_receita_espera(instantaneos):
    """Com nome, coordenadas dentro da região e concelho — e quantas a receita diz."""
    for r, s, todas in instantaneos:
        estacoes = _filtradas(s, todas)
        assert estacoes, f"{r.id}/{s.saida}: o filtro não deixa estação nenhuma"
        assert all(e["nome"] and e["cidade"] for e in estacoes), s.saida
        c = r.caixa_de_recorte
        assert all(
            c.lat_min < e["lat"] < c.lat_max and c.lon_min < e["lon"] < c.lon_max for e in estacoes
        ), f"{r.id}/{s.saida}: uma estação fora da região é uma coordenada trocada"
        esperado = s.params.get("esperado")
        if esperado is not None:
            assert len(estacoes) == esperado, f"{r.id}/{s.saida}"


def test_dois_sistemas_na_mesma_pagina_nao_partilham_estacoes(instantaneos):
    """O sítio pode listar dois sistemas na mesma página.

    O que os separa é o filtro que a receita declara sobre o campo «cidade».
    Medido num, as dez estações do sistema de uma câmara saíam como se fossem
    do sistema intermunicipal; e o concelho não serve de filtro, porque há
    concelhos com os dois. Cada estação é de um sistema só.
    """
    por_fonte: dict[str, list] = {}
    for r, s, todas in instantaneos:
        por_fonte.setdefault(f"{r.id}/{s.fonte}", []).append(
            {e["nome"] for e in _filtradas(s, todas)}
        )
    partilhadas = {k: v for k, v in por_fonte.items() if len(v) > 1}
    if not partilhadas:
        pytest.skip("nenhum instantâneo serve mais do que um sistema")
    for fonte, conjuntos in partilhadas.items():
        for i, a in enumerate(conjuntos):
            for b in conjuntos[i + 1 :]:
                assert not (a & b), f"{fonte}: a mesma estação em dois sistemas: {a & b}"


def test_os_nomes_sao_os_da_operadora_e_nao_os_do_mapa(instantaneos):
    """«Pedra Alta - Zona Desportiva», e não «Bicicletas <marca> - …».

    É a razão de este leitor existir: o OpenStreetMap sabe onde estão as
    estações — casam todas a menos de 60 m — mas escreve-lhes uma etiqueta de
    mapa. Quem procura a estação procura o nome que está no poste.
    """
    for r, s, todas in instantaneos:
        nomes = [e["nome"] for e in _filtradas(s, todas)]
        assert not any(n.startswith("Bicicletas ") for n in nomes), f"{r.id}/{s.saida}"
        assert len(set(nomes)) == len(nomes), "dois nomes iguais dariam o mesmo station_id"


def test_a_chave_de_uma_estacao_vem_do_nome():
    """O `station_id` não é um número de ordem.

    Um número de ordem muda quando a página ganha uma estação a meio, e os
    identificadores de todas as outras mudavam com ele — quem guardou uma
    ligação para uma estação deixava de lá chegar.
    """
    assert leitor._chave("Pedra Alta - Zona Desportiva") == "pedra-alta-zona-desportiva"
    assert leitor._chave("Vale Escuro — Mercado/Câmara") == "vale-escuro-mercado-camara"


def test_o_confronto_mede_em_metros():
    """Sessenta metros separam «a mesma estação» de «duas estações».

    Uma estação ocupa poucos metros; a diferença entre marcá-la no passeio e
    marcá-la na rotunda ao lado cabe nisto.
    """
    ponto = (41.35, -7.30)
    assert leitor._metros(ponto, ponto) == 0
    # Um centésimo de grau de latitude são pouco mais de mil metros.
    assert 1100 < leitor._metros(ponto, (41.36, -7.30)) < 1120
    assert leitor.RAIO_DE_CONFRONTO_M == 60.0


def test_a_construcao_produz_gbfs_sem_estado(instantaneos):
    """O ficheiro de descoberta anuncia SÓ o que existe.

    Anunciar `station_status` e servir 404 é pior do que não o anunciar — e a
    disponibilidade não é pública (CLAUDE.md §6.4).
    """
    vistas = 0
    for r, s, todas in instantaneos:
        pasta = construcao_de(r) / (s.saida or "")
        if not (pasta / "gbfs.json").exists():
            continue
        vistas += 1
        descoberta = json.loads((pasta / "gbfs.json").read_text(encoding="utf-8"))
        nomes = {f["name"] for f in descoberta["data"]["pt"]["feeds"]}
        assert nomes == {"system_information", "station_information"}
        assert not (pasta / "station_status.json").exists()

        estacoes = json.loads((pasta / "station_information.json").read_text(encoding="utf-8"))
        linhas = estacoes["data"]["stations"]
        # Invariante e não número: o que sai é a lista da operadora (um
        # instantâneo) menos as que o mapa não conhece — e o mapa muda todos os
        # dias (CLAUDE.md §8). Nenhuma estação publicada vem de fora da lista.
        da_operadora = {e["nome"] for e in _filtradas(s, todas)}
        assert 0 < len(linhas) <= len(da_operadora)
        assert {e["name"] for e in linhas} <= da_operadora
        # Nenhuma estação traz um número de bicicletas, nem sequer a zero: um
        # zero publicado é uma afirmação, e não sabemos nada disto.
        assert not any("num_bikes_available" in e or "num_docks_available" in e for e in linhas)
    if not vistas:
        pytest.skip("nenhuma região com o instantâneo de um sistema de bicicletas está construída")


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

    saida = SimpleNamespace(fonte="sistema-estacoes", saida="gbfs/sistema/")
    ctx = SimpleNamespace(caminho_de_saida=lambda s: tmp_path / "gbfs" / "sistema")
    with pytest.raises(ValueError, match="gbfs/osm/sistema/"):
        leitor._do_mapa(ctx, saida, "gbfs/osm/sistema/")

    mapa = tmp_path / "gbfs" / "osm" / "sistema"
    mapa.mkdir(parents=True)
    (mapa / "station_information.json").write_text(
        json.dumps({"data": {"stations": [_do_mapa("Uma", _CENTRO)]}}), encoding="utf-8"
    )
    assert [e["name"] for e in leitor._do_mapa(ctx, saida, "gbfs/osm/sistema/")] == ["Uma"]
