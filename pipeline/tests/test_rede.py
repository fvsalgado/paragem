"""A construção da rede a partir do papel e dos levantamentos.

Cada regra tem aqui um caso pequeno, inventado, que se lê numa vez. Os números
da construção a sério estão em `data/reference/<regiao>/numeros.yaml` e
verificam-se na corrida que constrói os dados; estes testes são para quando uma
regra se partir, que é quando é preciso saber QUAL.
"""

from __future__ import annotations

import json
import zipfile

import pytest

from paragem.alinhamento import Alinhamento, alinhar, emparelhar
from paragem.leitores.pdf_horarios import Paragem as PontoDoPapel
from paragem.leitores.pdf_horarios import Viagem
from paragem.nomes import limpo, sim, titulo, tokens
from paragem.paragens import Paragem, Universo
from paragem.resolucao import ErroDaTabelaManual, Parametros, resolver

# --- nomes -----------------------------------------------------------------


def test_as_abreviaturas_do_papel_abrem():
    assert tokens("R. dos Oleiros (X Tv. dos Oleiros)") == [
        "rua",
        "oleiros",
        "x",
        "travessa",
        "oleiros",
    ]


def test_o_mesmo_sitio_escrito_de_duas_maneiras_e_o_mesmo():
    # Foi esta diferença — «Tv.» contra «Travessa» — que fez oito paragens
    # parecerem em falta quando as coordenadas já cá estavam.
    assert sim("Alvito (Tv. Casal Pinhão)", "ALVITO TRAVESSA CASAL PINHAO") == 1.0


def test_lugares_diferentes_nao_se_confundem():
    assert sim("Casal do Rio", "Casal da Serra") < 0.6


def test_o_nome_escreve_se_como_se_lê():
    assert titulo("CASAL DOS BERNARDOS") == "Casal dos Bernardos"
    assert titulo("SOUDOS-VILA NOVA") == "Soudos-Vila Nova"
    # Um nome que já vem em caixa mista fica como está: quem o escreveu sabia.
    assert titulo("Casal dos Bernardos") == "Casal dos Bernardos"
    assert limpo("Pedra Alta\r\n  (Terminal)") == "Pedra Alta (Terminal)"


def test_um_cartaz_em_caixa_alta_escreve_se_como_se_le():
    """«da INSTITUTO DE LÍNGUAS» e «(1) - REALIZA-SE APENAS NO PERÍODO ESCOLAR»."""
    from paragem.nomes import frase_de_cartaz, nome_de_cartaz

    assert nome_de_cartaz("INSTITUTO DE LÍNGUAS") == "Instituto de Línguas"
    # As siglas ficam siglas: «Estação / Cp» lia-se como um erro.
    assert nome_de_cartaz("ESTAÇÃO / CP") == "Estação / CP"
    assert nome_de_cartaz("ESCOLA EB 2/3 DR. RUY D'ANDRADE") == "Escola EB 2/3 Dr. Ruy D'Andrade"
    # Caixa mista fica como está: quem a escreveu sabia.
    assert nome_de_cartaz("Av. Nogueiral (Gare)") == "Av. Nogueiral (Gare)"
    assert frase_de_cartaz("(1) - REALIZA-SE APENAS NO PERÍODO ESCOLAR") == (
        "(1) Realiza-se apenas no período escolar"
    )
    assert frase_de_cartaz("(2) - TERMINA NA ESTAÇÃO/CP") == "(2) Termina na estação/CP"
    # A grafia de hoje, e nada mais: a frase continua a ser a do cartaz.
    assert frase_de_cartaz("Sábados, excepto Feriados, até às 13h 50m") == (
        "Sábados, exceto Feriados, até às 13h 50m"
    )


# --- universo --------------------------------------------------------------


def _universo(*paragens: Paragem) -> Universo:
    u = Universo()
    for p in paragens:
        u.juntar(p)
    return u


def test_a_primeira_fonte_a_trazer_um_identificador_fica_com_ele():
    u = _universo(
        Paragem("g19:1", "TERMINAL", 39.6, -8.4, "geoportal-19"),
        Paragem("g19:1", "OUTRA COISA", 39.9, -8.9, "geoportal-15"),
    )
    assert u["g19:1"].nome == "TERMINAL"


def test_entre_iguais_ganha_a_fonte_declarada_primeiro():
    u = _universo(
        Paragem("g19:1", "FONTE NOVA", 39.6, -8.4, "geoportal-19"),
        Paragem("g15:7", "FONTE NOVA", 39.6001, -8.4001, "geoportal-15"),
    )
    assert [c for _, c in u.candidatos("Fonte Nova")] == ["g19:1", "g15:7"]


def test_uma_paragem_so_por_decisao_manual_nao_entra_nas_regras():
    u = _universo(Paragem("g13:9", "FONTE NOVA", 39.6, -8.4, "tap", so_por_decisao_manual=True))
    assert u.candidatos("Fonte Nova") == []
    assert "g13:9" in u  # mas pode ser escolhida à mão


def test_um_ponto_marcado_a_mao_serve_o_par_que_o_marcou_e_mais_nenhum():
    u = Universo()
    ident = u.ponto_manual(39.61, -8.41, "Rotunda Sul", "OpenStreetMap (ODbL)")
    assert ident == "pt:39.610000,-8.410000"
    assert u.candidatos("Rotunda Sul") == []


# --- alinhamento -----------------------------------------------------------


def test_o_emparelhamento_nao_troca_a_ordem():
    pares = emparelhar(
        ["Pedra Alta", "Vale Escuro", "Ribeira Branca"],
        ["Ribeira Branca", "Pedra Alta", "Vale Escuro"],
    )
    indices_a = [i for i, _, _ in pares]
    indices_b = [j for _, j, _ in pares]
    assert indices_a == sorted(indices_a)
    assert indices_b == sorted(indices_b)


def _viagem(linha: str, nomes_e_horas: list[tuple[str, str]], sentido: str | None = None) -> Viagem:
    return Viagem(
        linha=linha,
        nome_da_linha="",
        servico="A-U",
        sentido=sentido,
        pagina=1,
        coluna=0,
        paragens=[PontoDoPapel(nome=n, chegada=h, partida=h) for n, h in nomes_e_horas],
    )


def _sequencia(viagem: str, linha: str, pontos: list[tuple[str, str]], sentido: str = "0"):
    return {
        "viagem": viagem,
        "linha": linha,
        "sentido": sentido,
        "pontos": [
            {"id": i, "ordem": n, "hora": h, "ponto_de_horario": False}
            for n, (i, h) in enumerate(pontos)
        ],
    }


NOMES = {"g19:1": "PEDRA ALTA TERMINAL", "g19:2": "RIBEIRA BRANCA", "g19:3": "CACARAO"}


def test_uma_viagem_alinha_com_a_sequencia_da_mesma_linha():
    viagens = [_viagem("8", [("Pedra Alta (Terminal)", "08:00:00"), ("Caçarão", "09:00:00")])]
    sequencias = [
        _sequencia("v1", "8", [("g19:1", "08:00:00"), ("g19:2", "08:30:00"), ("g19:3", "09:00:00")])
    ]
    (a,) = alinhar(viagens, sequencias, NOMES)
    assert a.alinhou
    assert [ident for _, ident, _ in a.pares] == ["g19:1", "g19:3"]


def test_o_sentido_contrario_afasta():
    """A mesma linha ao contrário tem os mesmos nomes pela ordem inversa."""
    viagens = [
        _viagem(
            "8", [("Pedra Alta (Terminal)", "08:00:00"), ("Caçarão", "09:00:00")], sentido="ida"
        )
    ]
    ida = _sequencia("ida", "8", [("g19:1", "08:00:00"), ("g19:3", "09:00:00")], sentido="0")
    volta = _sequencia("volta", "8", [("g19:1", "08:01:00"), ("g19:3", "09:01:00")], sentido="1")
    (a,) = alinhar(viagens, [volta, ida], NOMES, sentidos={"0": "ida", "1": "volta"})
    assert a.viagem == "ida"


def test_uma_viagem_sem_correspondencia_fica_sem_alinhamento():
    viagens = [_viagem("99", [("Sítio Nenhum", "08:00:00"), ("Outro Sítio", "09:00:00")])]
    (a,) = alinhar(viagens, [_sequencia("v1", "8", [("g19:1", "08:00:00")])], NOMES)
    assert not a.alinhou


# --- resolução -------------------------------------------------------------


def test_o_alinhamento_decide_mesmo_com_o_nome_diferente():
    viagens = [_viagem("8", [("Pedra Alta (Terminal)", "08:00:00")])]
    alinhamentos = [
        Alinhamento(indice=0, linha="8", viagem="v1", pontuacao=0.9, pares=[(0, "g19:1", 0.8)])
    ]
    u = _universo(Paragem("g19:1", "PEDRA ALTA TERMINAL", 39.46, -8.2, "geoportal-19"))
    r = resolver(viagens, alinhamentos, u)
    d = r.de("8", "Pedra Alta (Terminal)")
    assert (d.metodo, d.id) == ("alinhamento", "g19:1")


def test_um_alinhamento_com_nome_muito_diferente_fica_assinalado():
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    alinhamentos = [
        Alinhamento(indice=0, linha="8", viagem="v1", pontuacao=0.5, pares=[(0, "g19:1", 0.4)])
    ]
    u = _universo(Paragem("g19:1", "QUINTA DO VALE", 39.46, -8.2, "geoportal-19"))
    r = resolver(viagens, alinhamentos, u)
    assert r.de("8", "Fonte Nova").metodo == "alinhamento-fraco"


def test_um_nome_quase_igual_ali_ao_lado_sobrepoe_se_ao_alinhamento():
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    alinhamentos = [
        Alinhamento(indice=0, linha="8", viagem="v1", pontuacao=0.5, pares=[(0, "g19:1", 0.4)])
    ]
    u = _universo(
        Paragem("g19:1", "QUINTA DO VALE", 39.4600, -8.2000, "geoportal-19"),
        Paragem("g15:5", "FONTE NOVA", 39.4605, -8.2005, "geoportal-15"),
    )
    d = resolver(viagens, alinhamentos, u).de("8", "Fonte Nova")
    assert (d.metodo, d.id) == ("nome-sobrepoe-alinhamento", "g15:5")


def test_um_nome_exato_e_unico_decide_se_sozinho():
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    u = _universo(Paragem("g19:1", "FONTE NOVA", 39.46, -8.2, "geoportal-19"))
    d = resolver(viagens, [], u).de("8", "Fonte Nova")
    assert (d.metodo, d.id) == ("nome-exato-unico", "g19:1")


def test_uma_homonima_do_outro_lado_do_distrito_nao_entra():
    """A guarda dos 25 km: o nome bate certo, o sítio não pode ser.

    Sem ela, uma «Fonte Nova» a oitenta quilómetros entrava numa linha que
    nunca lá vai, e o percurso passava a atravessar o distrito e a voltar.
    """
    viagens = [_viagem("8", [("Pedra Alta (Terminal)", "08:00:00"), ("Fonte Nova", "08:10:00")])]
    alinhamentos = [
        Alinhamento(indice=0, linha="8", viagem="v1", pontuacao=0.9, pares=[(0, "g19:1", 0.9)])
    ]
    u = _universo(
        Paragem("g19:1", "PEDRA ALTA TERMINAL", 39.46, -8.20, "geoportal-19"),
        Paragem("g19:9", "FONTE NOVA", 39.46, -9.15, "geoportal-19"),  # a ~82 km
    )
    assert resolver(viagens, alinhamentos, u).de("8", "Fonte Nova").id is None


def test_dois_candidatos_igualmente_parecidos_em_sitios_diferentes_nao_se_decidem():
    viagens = [_viagem("8", [("Pedra Alta (Terminal)", "08:00:00"), ("Casal", "08:10:00")])]
    alinhamentos = [
        Alinhamento(indice=0, linha="8", viagem="v1", pontuacao=0.9, pares=[(0, "g19:1", 0.9)])
    ]
    u = _universo(
        Paragem("g19:1", "PEDRA ALTA TERMINAL", 39.460, -8.200, "geoportal-19"),
        Paragem("g19:2", "CASAL DO RIO", 39.470, -8.210, "geoportal-19"),
        Paragem("g19:3", "CASAL DA SERRA", 39.465, -8.210, "geoportal-19"),
    )
    assert resolver(viagens, alinhamentos, u).de("8", "Casal").id is None


def test_a_decisao_manual_ganha_a_todas_as_regras():
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    u = _universo(
        Paragem("g19:1", "FONTE NOVA", 39.46, -8.20, "geoportal-19"),
        Paragem("g13:7", "FONTE NOVA", 39.47, -8.21, "tap", so_por_decisao_manual=True),
    )
    manual = [{"linha": "8", "nome": "Fonte Nova", "escolha": "g13:7", "metodo": "tap-homonima"}]
    d = resolver(viagens, [], u, manual).de("8", "Fonte Nova")
    assert (d.metodo, d.id) == ("manual:tap-homonima", "g13:7")


def test_sem_e_uma_decisao_como_as_outras():
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    u = _universo(Paragem("g19:1", "FONTE NOVA", 39.46, -8.2, "geoportal-19"))
    manual = [
        {"linha": "8", "nome": "Fonte Nova", "escolha": "sem", "metodo": "sem", "nota": "duas"}
    ]
    d = resolver(viagens, [], u, manual).de("8", "Fonte Nova")
    assert (d.metodo, d.id, d.nota) == ("manual:sem", None, "duas")


def test_um_ponto_marcado_a_mao_entra_com_o_nome_oficial_que_a_decisao_escreveu():
    viagens = [_viagem("8", [("Rotunda Sul", "08:00:00")])]
    manual = [
        {
            "linha": "8",
            "nome": "Rotunda Sul",
            "escolha": "ponto:39.611664,-8.659677",
            "metodo": "osm-rotunda",
            "nome_oficial": "Rotunda de Nossa Senhora do Rosário",
            "fonte": "OpenStreetMap (ODbL)",
        }
    ]
    r = resolver(viagens, [], Universo(), manual)
    d = r.de("8", "Rotunda Sul")
    assert d.id == "pt:39.611664,-8.659677"
    assert r.universo[d.id].nome == "Rotunda de Nossa Senhora do Rosário"


def test_uma_decisao_sobre_um_par_que_ja_nao_existe_rebenta():
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    manual = [{"linha": "8", "nome": "Fonte Velha", "escolha": "sem"}]
    with pytest.raises(ErroDaTabelaManual, match="não corresponde a nenhum par"):
        resolver(viagens, [], Universo(), manual)


def test_uma_decisao_que_aponta_para_uma_paragem_que_saiu_rebenta():
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    manual = [{"linha": "8", "nome": "Fonte Nova", "escolha": "g19:404"}]
    with pytest.raises(ErroDaTabelaManual, match="não existe no universo"):
        resolver(viagens, [], Universo(), manual)


def test_os_limiares_vêm_da_receita():
    """Um limiar é um número medido, não uma constante escondida no código."""
    viagens = [_viagem("8", [("Pedra Alta (Terminal)", "08:00:00"), ("Fonte Nova", "08:10:00")])]
    alinhamentos = [
        Alinhamento(indice=0, linha="8", viagem="v1", pontuacao=0.9, pares=[(0, "g19:1", 0.9)])
    ]
    u = _universo(
        Paragem("g19:1", "PEDRA ALTA TERMINAL", 39.46, -8.20, "geoportal-19"),
        Paragem("g19:9", "FONTE NOVA", 39.46, -9.15, "geoportal-19"),
    )
    largo = Parametros(guarda_da_linha_m=200_000)
    assert resolver(viagens, alinhamentos, u, None, largo).de("8", "Fonte Nova").id == "g19:9"


# --- perguntas na tabela manual ----------------------------------------------


def test_uma_entrada_so_com_pergunta_nao_decide_e_a_pergunta_fica():
    """`por_confirmar` sem `escolha`: as regras decidem, e a dúvida chega ao relatório."""
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    u = _universo(Paragem("g19:1", "FONTE NOVA", 39.46, -8.2, "geoportal-19"))
    manual = [{"linha": "8", "nome": "Fonte Nova", "por_confirmar": "Qual dos postes?"}]
    r = resolver(viagens, [], u, manual)
    assert r.de("8", "Fonte Nova").metodo == "nome-exato-unico"
    assert r.perguntas == {("8", "Fonte Nova"): "Qual dos postes?"}


def test_uma_entrada_que_nao_decide_nem_pergunta_rebenta():
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    with pytest.raises(ErroDaTabelaManual, match="não decide nem pergunta"):
        resolver(viagens, [], Universo(), [{"linha": "8", "nome": "Fonte Nova"}])


def test_o_mesmo_par_duas_vezes_na_tabela_rebenta():
    viagens = [_viagem("8", [("Fonte Nova", "08:00:00")])]
    manual = [
        {"linha": "8", "nome": "Fonte Nova", "escolha": "sem"},
        {"linha": "8", "nome": "Fonte Nova", "escolha": "sem"},
    ]
    with pytest.raises(ErroDaTabelaManual, match="duas vezes"):
        resolver(viagens, [], Universo(), manual)


# --- o mesmo nome em paragens diferentes -------------------------------------


def _terminal_partido(metodo_da_terceira: str = "alinhamento"):
    """O padrão que partiu um terminal: três linhas, o mesmo nome, dois sítios.

    Duas linhas ficam no terminal; a terceira, alinhada com uma edição antiga
    da rede, fica no cruzamento da estrada nacional a dois quilómetros e meio —
    e no mesmo concelho.
    """
    from paragem.resolucao import Decisao, Resolucao

    u = _universo(
        Paragem("g19:1", "TERMINAL PEDRA ALTA", 39.6317, -8.6803, "geoportal-19"),
        Paragem("g15:7", "TERMINAL PEDRA ALTA", 39.6322, -8.6809, "geoportal-15"),
        Paragem("g19:9", "PEDRA ALTA", 39.6205, -8.6576, "geoportal-19"),
    )
    nome = "Pedra Alta (Terminal)"
    decisoes = {
        ("1", nome): Decisao("1", nome, "g19:1", "alinhamento", 0.65),
        ("2", nome): Decisao("2", nome, "g15:7", "nome-exato-unico", 1.0),
        ("3", nome): Decisao("3", nome, "g19:9", metodo_da_terceira, 0.65),
    }
    return Resolucao(decisoes=decisoes, universo=u)


def test_um_terminal_partido_no_mesmo_concelho_aparece():
    from paragem.resolucao import nomes_em_paragens_diferentes

    (d,) = nomes_em_paragens_diferentes(_terminal_partido(), lambda lat, lon: "pedra-alta")
    assert d.nome == "Pedra Alta (Terminal)"
    assert d.concelho == "pedra-alta"
    assert 2300 < d.distancia_m < 2500
    assert {ident for ident, _, _ in d.sitios} == {"g19:1", "g15:7", "g19:9"}
    assert "Pedra Alta (Terminal)" in d.em_texto("Pedra Alta")


def test_duas_povoacoes_homonimas_em_concelhos_diferentes_nao_aparecem():
    from paragem.resolucao import nomes_em_paragens_diferentes

    # O ponto de longe cai noutro concelho: é outra terra com o mesmo nome.
    def concelho(lat, lon):
        return "outro" if lat < 39.625 else "pedra-alta"

    assert nomes_em_paragens_diferentes(_terminal_partido(), concelho) == []


def test_os_dois_lados_da_estrada_nao_contam():
    from paragem.resolucao import nomes_em_paragens_diferentes

    r = _terminal_partido()
    del r.decisoes[("3", "Pedra Alta (Terminal)")]
    # Sobram os dois postes do terminal, a 70 m: abaixo do raio.
    assert nomes_em_paragens_diferentes(r, lambda lat, lon: "pedra-alta") == []


def test_o_que_foi_decidido_a_mao_nao_volta_e_o_que_tem_pergunta_volta():
    from paragem.resolucao import Decisao, nomes_em_paragens_diferentes

    r = _terminal_partido()
    nome = "Pedra Alta (Terminal)"
    for (linha, n), d in list(r.decisoes.items()):
        r.decisoes[(linha, n)] = Decisao(linha, n, d.id, "manual:oficial", 1.0)
    assert nomes_em_paragens_diferentes(r, lambda lat, lon: "x") == []

    r.perguntas[("3", nome)] = "A linha 3 entra no terminal?"
    (d,) = nomes_em_paragens_diferentes(r, lambda lat, lon: "x")
    assert d.perguntas == ("A linha 3 entra no terminal?",)
    assert "por confirmar" in d.em_texto()


def test_sem_carta_administrativa_compara_se_tudo():
    """Sem concelho conhecido, é o lado que mostra mais — e não o que esconde."""
    from paragem.resolucao import nomes_em_paragens_diferentes

    assert len(nomes_em_paragens_diferentes(_terminal_partido(), lambda lat, lon: None)) == 1


# --- o leitor das camadas --------------------------------------------------


def _zip_de_camadas(tmp_path):
    paragens = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-8.2, 39.46]},
                "properties": {
                    "stop_id": 1070.0,  # vem como número, e não pode ficar «1070.0»
                    "stop_name": "PEDRA ALTA TERMINAL",
                    "stop_code": "None",  # o portal escreve os vazios assim
                    "trip_id": "v1",
                    "stop_sequence": 1,
                    "route_short_name": "8",
                    "arrival_time": "08:00:00",
                    "direction_id": 0,
                    "timepoint": 1,
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-8.1, 39.50]},
                "properties": {
                    "stop_id": 1071,
                    "stop_name": "RIBEIRA BRANCA",
                    "stop_code": "5215",
                    "trip_id": "v1",
                    "stop_sequence": 2,
                    "route_short_name": "8",
                    "arrival_time": "08:10:00",
                    "direction_id": 0,
                    "timepoint": 0,
                },
            },
        ],
    }
    carreiras = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-8.2, 39.46], [-8.15, 39.48], [-8.1, 39.50]],
                },
                "properties": {"trip_id": "v1", "route_short_name": "8", "route_color": "0A5C7A"},
            }
        ],
    }
    caminho = tmp_path / "camadas.zip"
    with zipfile.ZipFile(caminho, "w") as z:
        z.writestr("19-paragens.geojson", json.dumps(paragens))
        z.writestr("20-carreiras.geojson", json.dumps(carreiras))
    return caminho


def test_as_camadas_normalizam_se_pelo_que_a_receita_declara(tmp_path):
    from paragem.leitores.camadas_geojson import _feicoes, _ler_paragens, _ler_sequencias

    caminho = _zip_de_camadas(tmp_path)
    camada = {
        "ficheiro": "19-paragens.geojson",
        "prefixo": "g19",
        "fonte": "portal-19",
        "campos": {"id": "stop_id", "nome": "stop_name", "codigo": "stop_code"},
        "sequencias": {
            "viagem": "trip_id",
            "ordem": "stop_sequence",
            "linha": "route_short_name",
            "hora": "arrival_time",
            "ponto_de_horario": "timepoint",
        },
    }
    feicoes = _feicoes(caminho, "19-paragens.geojson")
    paragens: dict = {}
    _ler_paragens(feicoes, camada, paragens)
    assert list(paragens) == ["g19:1070", "g19:1071"]
    assert paragens["g19:1070"]["codigo"] == ""  # «None» é vazio, não é um código
    sequencias: list = []
    assert _ler_sequencias(feicoes, camada, sequencias) == 1
    assert [p["id"] for p in sequencias[0]["pontos"]] == ["g19:1070", "g19:1071"]
    assert sequencias[0]["pontos"][0]["ponto_de_horario"] is True


def test_uma_camada_que_falta_diz_quais_existem(tmp_path):
    from paragem.leitores.camadas_geojson import _feicoes

    with pytest.raises(ValueError, match="19-paragens.geojson"):
        _feicoes(_zip_de_camadas(tmp_path), "13-outra-coisa.geojson")


# --- intermédias -----------------------------------------------------------


def _resolucao_simples(viagens, universo, manual=None):
    return resolver(viagens, [], universo, manual)


def test_as_intermedias_entram_sem_hora_e_com_a_estimativa_por_dentro():
    """O papel marca duas paragens; o levantamento sabe a do meio."""
    from paragem.alinhamento import Alinhamento
    from paragem.intermedias import preencher

    viagens = [_viagem("8", [("Pedra Alta (Terminal)", "08:00:00"), ("Caçarão", "09:00:00")])]
    u = _universo(
        Paragem("g19:1", "PEDRA ALTA TERMINAL", 39.46, -8.20, "geoportal-19"),
        Paragem("g19:2", "RIBEIRA BRANCA", 39.50, -8.15, "geoportal-19"),
        Paragem("g19:3", "CACARAO", 39.55, -8.00, "geoportal-19"),
    )
    alinhamentos = [
        Alinhamento(
            indice=0,
            linha="8",
            viagem="v1",
            pontuacao=0.9,
            pares=[(0, "g19:1", 1.0), (1, "g19:3", 1.0)],
        )
    ]
    sequencias = [
        _sequencia("v1", "8", [("g19:1", "08:00:00"), ("g19:2", "08:30:00"), ("g19:3", "09:00:00")])
    ]
    for p in sequencias[0]["pontos"]:
        p["hora_de_partida"] = p["hora"]
    r = resolver(viagens, alinhamentos, u)
    (completa,), segmentos = preencher(viagens, alinhamentos, r, sequencias)
    assert [p.id for p in completa.pontos] == ["g19:1", "g19:2", "g19:3"]
    meio = completa.pontos[1]
    assert (meio.origem, meio.chegada, meio.partida, meio.marcada) == ("intermedia", "", "", False)
    # A estimativa existe, e não vai para o feed.
    assert meio.tempo_estimado == "08:30:00"
    assert segmentos[0]["n_intermedias"] == 1


def test_um_segmento_com_tempos_incoerentes_nao_herda_nada():
    """Dez minutos no papel contra uma hora no levantamento não é o mesmo percurso."""
    from paragem.alinhamento import Alinhamento
    from paragem.intermedias import preencher

    viagens = [_viagem("8", [("Pedra Alta (Terminal)", "08:00:00"), ("Caçarão", "08:10:00")])]
    u = _universo(
        Paragem("g19:1", "PEDRA ALTA TERMINAL", 39.46, -8.20, "geoportal-19"),
        Paragem("g19:2", "RIBEIRA BRANCA", 39.50, -8.15, "geoportal-19"),
        Paragem("g19:3", "CACARAO", 39.55, -8.00, "geoportal-19"),
    )
    alinhamentos = [
        Alinhamento(
            indice=0,
            linha="8",
            viagem="v1",
            pontuacao=0.9,
            pares=[(0, "g19:1", 1.0), (1, "g19:3", 1.0)],
        )
    ]
    sequencias = [
        _sequencia("v1", "8", [("g19:1", "08:00:00"), ("g19:2", "08:30:00"), ("g19:3", "09:00:00")])
    ]
    for p in sequencias[0]["pontos"]:
        p["hora_de_partida"] = p["hora"]
    r = resolver(viagens, alinhamentos, u)
    (completa,), segmentos = preencher(viagens, alinhamentos, r, sequencias)
    assert [p.id for p in completa.pontos] == ["g19:1", "g19:3"]
    assert "tempos incoerentes" in segmentos[0]["motivo"]


def test_uma_intermedia_em_cima_de_uma_paragem_do_papel_nao_se_repete():
    from paragem.alinhamento import Alinhamento
    from paragem.intermedias import preencher

    viagens = [_viagem("8", [("Pedra Alta (Terminal)", "08:00:00"), ("Caçarão", "09:00:00")])]
    u = _universo(
        Paragem("g19:1", "PEDRA ALTA TERMINAL", 39.46, -8.20, "geoportal-19"),
        # a 30 m da primeira: é a mesma paragem com outro nome
        Paragem("g19:2", "TERMINAL RODOVIARIO", 39.46027, -8.20, "geoportal-19"),
        Paragem("g19:3", "CACARAO", 39.55, -8.00, "geoportal-19"),
    )
    alinhamentos = [
        Alinhamento(
            indice=0,
            linha="8",
            viagem="v1",
            pontuacao=0.9,
            pares=[(0, "g19:1", 1.0), (1, "g19:3", 1.0)],
        )
    ]
    sequencias = [
        _sequencia("v1", "8", [("g19:1", "08:00:00"), ("g19:2", "08:02:00"), ("g19:3", "09:00:00")])
    ]
    for p in sequencias[0]["pontos"]:
        p["hora_de_partida"] = p["hora"]
    r = resolver(viagens, alinhamentos, u)
    (completa,), _ = preencher(viagens, alinhamentos, r, sequencias)
    assert [p.id for p in completa.pontos] == ["g19:1", "g19:3"]


# --- traçados --------------------------------------------------------------


def test_o_tracado_do_levantamento_serve_se_as_paragens_ficarem_em_cima_dele():
    from paragem.intermedias import Ponto, ViagemCompleta
    from paragem.tracados import desenhar, numerar

    pontos = [[39.46, -8.20], [39.50, -8.15], [39.55, -8.10]]
    completa = ViagemCompleta(
        indice=0,
        viagem=_viagem("8", []),
        alinhada="v1",
        pontos=[
            Ponto(nome="A", id="g19:1", nome_oficial="A", lat=39.46, lon=-8.20),
            Ponto(nome="B", id="g19:3", nome_oficial="B", lat=39.55, lon=-8.10),
        ],
    )
    desenhos = desenhar([completa], {"v1": pontos}, None)
    assert desenhos[0].metodo == "camada"
    assert desenhos[0].max_dist_paragem_m == 0
    formas, de_cada = numerar(desenhos)
    assert de_cada[0] == "tr0001"
    assert len(formas) == 1


def test_um_tracado_que_passa_longe_de_uma_paragem_e_recusado():
    """Um traçado plausível e errado é pior do que traçado nenhum."""
    from paragem.intermedias import Ponto, ViagemCompleta
    from paragem.tracados import desenhar

    pontos = [[39.46, -8.20], [39.50, -8.15]]
    completa = ViagemCompleta(
        indice=0,
        viagem=_viagem("8", []),
        alinhada="v1",
        pontos=[
            Ponto(nome="A", id="g19:1", nome_oficial="A", lat=39.46, lon=-8.20),
            # a 5 km da linha
            Ponto(nome="B", id="g19:9", nome_oficial="B", lat=39.55, lon=-8.20),
        ],
    )
    desenhos = desenhar([completa], {"v1": pontos}, None)
    assert desenhos[0].metodo == "sem-tracado"
    assert "rejeitado" in desenhos[0].nota


def test_dois_traçados_iguais_partilham_o_identificador():
    from paragem.intermedias import Ponto, ViagemCompleta
    from paragem.tracados import desenhar, numerar

    pontos = [[39.46, -8.20], [39.50, -8.15]]

    def completa(i):
        return ViagemCompleta(
            indice=i,
            viagem=_viagem("8", []),
            alinhada="v1",
            pontos=[
                Ponto(nome="A", id="g19:1", nome_oficial="A", lat=39.46, lon=-8.20),
                Ponto(nome="B", id="g19:2", nome_oficial="B", lat=39.50, lon=-8.15),
            ],
        )

    desenhos = desenhar([completa(0), completa(1)], {"v1": pontos}, None)
    formas, de_cada = numerar(desenhos)
    assert len(formas) == 1
    assert de_cada[0] == de_cada[1] == "tr0001"
