"""Por onde passa cada linha no mapa: os traçados dos feeds e o comboio pelos carris.

O planeador desenha cada perna pelo traçado da linha, quando o há, e a direito
— a tracejado, a dizer que é aproximado — quando não há (P1-038). Estes testes
guardam as duas maneiras de o haver: o `shapes.txt` de QUALQUER feed que o
motor leia, e não só o da rede própria; e o caminho pelos carris do
OpenStreetMap para o comboio cujo ficheiro não traz traçado nenhum.
"""

from __future__ import annotations

from pathlib import Path

from paragem.gtfs import Gtfs
from paragem.percursos import construir_de, metros

# --- os traçados de vários feeds -----------------------------------------------


def _feed(prefixo: str, paragens: list[tuple[str, float, float]], forma: list[tuple[float, float]]):
    """Um feed de uma viagem só, por estas paragens, com este traçado."""
    g = Gtfs()
    g.definir(
        "stops.txt",
        ["stop_id", "stop_name", "stop_lat", "stop_lon"],
        [
            {"stop_id": sid, "stop_name": sid, "stop_lat": str(lat), "stop_lon": str(lon)}
            for sid, lat, lon in paragens
        ],
    )
    g.definir("trips.txt", ["trip_id", "shape_id"], [{"trip_id": "v1", "shape_id": "s1"}])
    g.definir(
        "stop_times.txt",
        ["trip_id", "stop_id", "stop_sequence"],
        [
            {"trip_id": "v1", "stop_id": sid, "stop_sequence": str(i)}
            for i, (sid, _, _) in enumerate(paragens)
        ],
    )
    g.definir(
        "shapes.txt",
        ["shape_id", "shape_pt_sequence", "shape_pt_lat", "shape_pt_lon"],
        [
            {
                "shape_id": "s1",
                "shape_pt_sequence": str(i),
                "shape_pt_lat": str(lat),
                "shape_pt_lon": str(lon),
            }
            for i, (lat, lon) in enumerate(forma)
        ],
    )
    return prefixo, g


def _grelha(paragens: list[str], viagens: list[tuple[int, list[int]]]) -> dict:
    """Uma grelha com estas paragens e estas viagens (linha, índices das paragens)."""
    return {
        "paragens": [[p, 0.0, 0.0, p] for p in paragens],
        "linhas": [[f"L{i}", f"Linha {i}", None, "autocarro", "UTC"] for i in range(5)],
        "viagens": [[linha, 0, [x for p in seq for x in (p, 0, 0)]] for linha, seq in viagens],
    }


def test_o_comboio_com_tracado_no_ficheiro_ganha_o_desenho_e_nao_so_a_rede_propria():
    # Eram só os da rede própria: o comboio e os expressos saíam a direito no
    # mapa, mesmo quando o ficheiro do operador trazia o traçado.
    rede = _feed(
        "rede:",
        [("a", 39.50, -8.20), ("b", 39.51, -8.19)],
        [(39.50, -8.20), (39.505, -8.198), (39.51, -8.19)],
    )
    comboio = _feed(
        "comboio:",
        [("e1", 39.60, -8.30), ("e2", 39.62, -8.25)],
        [(39.60, -8.30), (39.615, -8.29), (39.62, -8.25)],
    )
    grelha = _grelha(
        ["rede:a", "rede:b", "comboio:e1", "comboio:e2"],
        [(0, [0, 1]), (1, [2, 3])],
    )
    r = construir_de([rede, comboio], grelha)
    assert set(r.por_linha) == {0, 1}
    assert r.com_forma == 2 and r.sem_forma == 0


def test_um_troco_que_dois_ficheiros_desenham_fica_com_o_da_rede_propria():
    rede = _feed(
        "rede:", [("a", 39.50, -8.20), ("b", 39.51, -8.19)], [(39.50, -8.20), (39.51, -8.19)]
    )
    # Outro operador no mesmo cais (as paragens no espaço de nomes da rede),
    # com um desenho diferente do mesmo troço.
    vizinho = _feed(
        "rede:",
        [("a", 39.50, -8.20), ("b", 39.51, -8.19)],
        [(39.50, -8.20), (39.50, -8.10), (39.51, -8.19)],
    )
    grelha = _grelha(["rede:a", "rede:b"], [(0, [0, 1])])
    so_a_rede = construir_de([rede], grelha).por_linha[0]
    assert construir_de([rede, vizinho], grelha).por_linha[0] == so_a_rede


def test_um_troco_sem_tracado_em_lado_nenhum_conta_como_sem_forma():
    rede = _feed(
        "rede:", [("a", 39.50, -8.20), ("b", 39.51, -8.19)], [(39.50, -8.20), (39.51, -8.19)]
    )
    grelha = _grelha(["rede:a", "rede:b", "x:c"], [(0, [0, 1, 2])])
    r = construir_de([rede], grelha)
    assert r.com_forma == 1 and r.sem_forma == 1


def test_os_trocos_desenhados_por_nos_entram_com_as_chaves_da_grelha():
    grelha = _grelha(["comboio:e1", "comboio:e2"], [(3, [0, 1])])
    pelos_carris = {("comboio:e1", "comboio:e2"): [(39.60, -8.30), (39.61, -8.30), (39.62, -8.25)]}
    r = construir_de([], grelha, outros=pelos_carris)
    assert list(r.por_linha) == [3]
    assert r.com_forma == 1


# --- o comboio pelos carris --------------------------------------------------------


def _recorte(caminho: Path) -> Path:
    """Um recorte com uma via férrea em L e uma estrada a direito entre as pontas.

    A estação A fica na ponta de cima, a B na ponta da direita, e a via faz a
    curva no canto de baixo à esquerda. A estrada vai de A a B pela diagonal:
    um comboio que a usasse cortava o caminho — e é isso que não pode fazer.
    """
    nos = {
        1: (39.60, -8.30),  # A
        2: (39.58, -8.30),  # o canto
        3: (39.58, -8.27),  # B
        10: (39.60, -8.30),
        11: (39.58, -8.27),
        20: (39.70, -8.10),  # uma linha abandonada, longe
        21: (39.71, -8.10),
    }
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="teste">']
    for i, (lat, lon) in nos.items():
        xml.append(f'<node id="{i}" version="1" lat="{lat}" lon="{lon}"/>')
    xml += [
        '<way id="100" version="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/>',
        '<tag k="railway" v="rail"/></way>',
        '<way id="200" version="1"><nd ref="10"/><nd ref="11"/>',
        '<tag k="highway" v="primary"/></way>',
        '<way id="300" version="1"><nd ref="20"/><nd ref="21"/>',
        '<tag k="railway" v="abandoned"/></way>',
        "</osm>",
    ]
    caminho.write_text("\n".join(xml), encoding="utf-8")
    return caminho


def test_o_comboio_vai_pela_via_e_nao_pela_estrada(tmp_path):
    from paragem.tracados import ler_rede_ferroviaria, pelos_carris

    grafo = ler_rede_ferroviaria(_recorte(tmp_path / "recorte.osm"), None, 39.6)
    assert grafo is not None
    caminhos, recusas = pelos_carris(grafo, {"A>B": ((39.60, -8.30), (39.58, -8.27))})
    assert recusas == []
    pontos = caminhos["A>B"]
    # Passa pelo canto: é a via, e não a diagonal da estrada.
    assert min(metros(p, (39.58, -8.30)) for p in pontos) < 1
    comprimento = sum(metros(pontos[i], pontos[i + 1]) for i in range(len(pontos) - 1))
    assert comprimento > 1.2 * metros((39.60, -8.30), (39.58, -8.27))


def test_uma_estacao_longe_da_via_fica_a_direito_e_diz_porque(tmp_path):
    from paragem.tracados import ler_rede_ferroviaria, pelos_carris

    grafo = ler_rede_ferroviaria(_recorte(tmp_path / "recorte.osm"), None, 39.6)
    assert grafo is not None
    # A segunda estação a uns 2 km da via: não é aquela linha.
    caminhos, recusas = pelos_carris(grafo, {"A>C": ((39.60, -8.30), (39.60, -8.25))})
    assert caminhos == {}
    assert len(recusas) == 1 and "da via" in recusas[0]


def test_um_troco_fora_do_recorte_nao_e_uma_recusa(tmp_path):
    # A viagem entra inteira na grelha, de uma ponta do país à outra, e o
    # recorte é só o da região: o troço lá longe fica a direito, sem queixa.
    from paragem.tracados import ler_rede_ferroviaria, pelos_carris

    grafo = ler_rede_ferroviaria(_recorte(tmp_path / "recorte.osm"), None, 39.6)
    assert grafo is not None
    caminhos, recusas = pelos_carris(grafo, {"X>Y": ((38.72, -9.14), (38.80, -9.10))})
    assert caminhos == {} and recusas == []


def test_um_recorte_sem_carris_nao_tem_rede_ferroviaria(tmp_path):
    from paragem.tracados import ler_rede_ferroviaria

    so_estrada = tmp_path / "estrada.osm"
    so_estrada.write_text(
        '<?xml version="1.0" encoding="UTF-8"?><osm version="0.6">'
        '<node id="1" version="1" lat="39.6" lon="-8.3"/>'
        '<node id="2" version="1" lat="39.7" lon="-8.3"/>'
        '<way id="9" version="1"><nd ref="1"/><nd ref="2"/><tag k="highway" v="primary"/></way>'
        "</osm>",
        encoding="utf-8",
    )
    assert ler_rede_ferroviaria(so_estrada, None, 39.6) is None
