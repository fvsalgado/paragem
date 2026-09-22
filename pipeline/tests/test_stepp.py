"""O leitor do registo do regulador: o que ele soma, e o que se recusa a somar.

O que este módulo produz são HORAS, e uma hora errada manda alguém esperar
numa berma. Por isso os testes que mais valem aqui são os que provam recusas:
uma paragem que não é a mesma não se funde, um código de dias que não está
escrito não se adivinha, um sentido sem tempos não vira viagem.

**Nenhum teste nomeia um cliente.** Procuram a saída PELA PROPRIEDADE que
estão a verificar — «uma região que declare o leitor `stepp-servicos`» — e
saltam com a razão escrita quando não houver nenhuma nesta raiz. É a regra do
CLAUDE.md §11.6: uma suite pública não escreve a lista dos documentos de
ninguém.
"""

from __future__ import annotations

import zipfile

import pytest

from paragem.gtfs import Gtfs
from paragem.leitores import GENERICOS, LEITORES
from paragem.leitores.stepp import (
    Conhecidas,
    Paragem,
    _chave,
    _dias_da_mascara,
    _hhmmss,
    _minutos,
    _so_a_edicao_mais_recente,
    nome,
)
from paragem.regiao import carregar_todas

RAIO = 100.0


# --- o que não precisa de dados nenhuns ------------------------------------


def test_o_leitor_esta_registado_e_e_generico():
    """Genérico quer dizer: uma região nova usa-o sem um commit (§11.5)."""
    assert nome in LEITORES
    assert nome in GENERICOS


@pytest.mark.parametrize(
    "entrada,esperado",
    [("10:10:00", 610), ("9:05", 545), ("00:00:00", 0), ("", None), ("—", None), (None, None)],
)
def test_le_a_hora_de_partida(entrada, esperado):
    assert _minutos(entrada) == esperado


def test_a_hora_sai_sempre_com_dois_digitos():
    # «6:50» num GTFS é um erro do validador; «06:50:00» não é.
    assert _hhmmss(410) == "06:50:00"
    assert _hhmmss(0) == "00:00:00"


def test_uma_viagem_que_passa_da_meia_noite_nao_volta_ao_principio():
    """25:10 e não 01:10 — é assim que o GTFS diz «no dia seguinte».

    Somar os tempos declarados pode passar das 24h. Reduzir a soma a um
    relógio de 24 horas punha a chegada ANTES da partida, e o validador
    rejeita — com razão, porque a viagem passaria a durar menos 23 horas.
    """
    assert _hhmmss(23 * 60 + 50) == "23:50:00"
    assert _hhmmss(24 * 60 + 70) == "25:10:00"


# --- a fusão de paragens: a regra dos 100 m E do mesmo nome ----------------


def _conhecidas(*pontos) -> Conhecidas:
    feed = Gtfs()
    feed.definir(
        "stops.txt",
        ["stop_id", "stop_name", "stop_lat", "stop_lon"],
        [
            {"stop_id": i, "stop_name": n, "stop_lat": f"{la}", "stop_lon": f"{lo}"}
            for i, n, la, lo in pontos
        ],
    )
    return Conhecidas.de(feed)


def test_a_mesma_paragem_com_o_mesmo_nome_funde_se():
    c = _conhecidas(("orm_357", "Fátima (Terminal)", 39.63115, -8.68067))
    # 30 m a norte, escrita sem acentos e em maiúsculas, como o regulador faz.
    achada = c.mesma(Paragem("1835_34", "FATIMA (TERMINAL)", 39.63142, -8.68067), RAIO)
    assert achada is not None
    assert achada[0] == "orm_357"


def test_perto_mas_com_outro_nome_NAO_funde():
    """A avaria que isto impede, e é a pior deste ficheiro.

    Dois cais a 40 m um do outro numa rotunda são duas paragens, e fundi-los
    põe as partidas de um no outro — a pessoa atravessa a estrada e perde o
    autocarro. A medida diz que abaixo de 100 m o nome bate sempre; o dia em
    que deixar de bater é o dia em que a exportação mudou de forma, e aí a
    regra recusa em vez de adivinhar.
    """
    c = _conhecidas(("tnv_010", "Torres Novas (Terminal)", 39.48000, -8.53500))
    assert c.mesma(Paragem("9_1", "Torres Novas (Hospital)", 39.48027, -8.53500), RAIO) is None


def test_o_mesmo_nome_mas_longe_NAO_funde():
    """«Centro de Saúde» existe em todas as vilas."""
    c = _conhecidas(("acn_001", "Centro de Saúde", 39.48000, -8.53500))
    assert c.mesma(Paragem("1_1", "Centro de Saúde", 39.49200, -8.53500), RAIO) is None


def test_escolhe_a_mais_perto_quando_ha_duas_com_o_mesmo_nome():
    c = _conhecidas(
        ("perto", "Estação", 39.48010, -8.53500),
        ("longe", "Estação", 39.48070, -8.53500),
    )
    achada = c.mesma(Paragem("x", "Estação", 39.48000, -8.53500), RAIO)
    assert achada is not None and achada[0] == "perto"


def test_o_nome_compara_se_sem_acentos_nem_pontuacao():
    assert _chave("FÁTIMA (Cova da Iria)") == _chave("fatima cova da iria")
    assert _chave("Vila Nova da Barquinha") != _chave("Vila Nova de Barquinha")


# --- a região que o usa, se estiver nesta raiz -----------------------------


def _saida_de_stepp(raiz):
    for r in carregar_todas(raiz):
        for s in r.saidas:
            if s.leitor == nome:
                return r, s
    pytest.skip(
        f"nenhuma região nesta raiz declara o leitor {nome!r} — "
        "se ela vive noutra, aponta-a com PARAGEM_RAIZES (docs/RAIZES.md)"
    )


def test_a_receita_diz_de_que_operador_fala(raiz):
    """Sem `operador` o leitor produziria um feed vazio em silêncio."""
    _, s = _saida_de_stepp(raiz)
    assert (s.params or {}).get("operador"), "falta `operador` nos params"
    assert (s.params or {}).get("prefixo_id"), "falta `prefixo_id` nos params"


def test_o_feed_de_referencia_constroi_se_antes(raiz):
    """`paragens_de` aponta para uma saída ANTERIOR, ou a fusão não acontece.

    O leitor rebenta com uma mensagem clara se o ficheiro não existir; este
    teste apanha a troca de ordem na receita antes de ela chegar a correr.
    """
    r, s = _saida_de_stepp(raiz)
    ref = str((s.params or {}).get("paragens_de") or "")
    if not ref:
        pytest.skip("esta região não declara `paragens_de` — a fusão é opcional")
    saidas = [x.saida for x in r.saidas if x.saida]
    assert ref in saidas, f"`paragens_de: {ref}` não é nenhuma saída desta região"
    assert saidas.index(ref) < saidas.index(s.saida), (
        f"{s.saida} lê {ref}, e tem de vir DEPOIS dele na receita"
    )


def test_o_feed_construido_tem_horas_que_nao_recuam(raiz):
    """Sobre o feed real, quando ele existe: nenhuma viagem anda para trás."""
    r, s = _saida_de_stepp(raiz)
    caminho = raiz / "build" / r.id / s.saida
    if not caminho.exists():
        pytest.skip(f"sem {caminho} — corre `uv run pipeline build --regiao {r.id}`")
    feed = Gtfs.ler(caminho)
    por_viagem: dict[str, list[tuple[int, str]]] = {}
    for h in feed.stop_times:
        por_viagem.setdefault(h["trip_id"], []).append(
            (int(h["stop_sequence"]), h["departure_time"])
        )
    assert por_viagem, "o feed não tem uma única hora"
    for tid, paradas in por_viagem.items():
        paradas.sort()
        assert len(paradas) >= 2, f"{tid} tem menos de duas paragens"
        horas = [h for _, h in paradas]
        assert horas == sorted(horas), f"{tid} tem uma hora a recuar"


def test_so_a_primeira_paragem_e_hora_do_horario(raiz):
    """O resto sai da soma dos tempos declarados, e `timepoint=0` di-lo.

    Marcá-las todas como exatas seria prometer uma precisão que a fonte não
    dá — e é a diferença entre «estimar» e «fingir» (§6.2).
    """
    r, s = _saida_de_stepp(raiz)
    caminho = raiz / "build" / r.id / s.saida
    if not caminho.exists():
        pytest.skip(f"sem {caminho}")
    feed = Gtfs.ler(caminho)
    exatas = [h for h in feed.stop_times if h.get("timepoint") == "1"]
    assert exatas, "nenhuma hora exata — a partida da origem tem de o ser"
    assert all(h["stop_sequence"] == "1" for h in exatas)


def test_as_paragens_fundidas_ficam_no_MESMO_sitio_nos_dois_feeds(raiz):
    """Se a coordenada fosse aproximada, o mapa mostrava dois pontos a 3 m."""
    r, s = _saida_de_stepp(raiz)
    ref = str((s.params or {}).get("paragens_de") or "")
    base = raiz / "build" / r.id
    if not ref or not (base / s.saida).exists() or not (base / ref).exists():
        pytest.skip("sem os dois feeds construídos")
    nosso = {x["stop_id"]: (x["stop_lat"], x["stop_lon"]) for x in Gtfs.ler(base / ref).stops}
    fundidas = 0
    for x in Gtfs.ler(base / s.saida).stops:
        if x["stop_id"] in nosso:
            fundidas += 1
            assert (x["stop_lat"], x["stop_lon"]) == nosso[x["stop_id"]], (
                f"{x['stop_id']} tem coordenadas diferentes nos dois feeds"
            )
    assert fundidas > 0, "nenhuma paragem se fundiu — a regra dos 100 m não corre"


def test_o_feed_declara_quem_o_editou_e_de_onde_veio(raiz):
    """Quem encontra uma hora errada tem de saber a quem se queixa."""
    r, s = _saida_de_stepp(raiz)
    caminho = raiz / "build" / r.id / s.saida
    if not caminho.exists():
        pytest.skip(f"sem {caminho}")
    with zipfile.ZipFile(caminho) as z:
        assert "feed_info.txt" in z.namelist()
    info = list(Gtfs.ler(caminho).obter("feed_info.txt"))
    assert info, "feed_info.txt vazio"
    assert info[0].get("feed_contact_url"), "sem contacto: o feed é nosso e tem de o dizer"
    assert "STePP" in info[0].get("feed_version", ""), "a versão não diz de onde vieram as horas"


# --- o que o validador não apanha -------------------------------------------


def test_sem_codigo_a_paragem_identifica_se_pelo_sitio_e_pelo_nome():
    """A corrupção silenciosa que isto impede, e que saiu mesmo.

    Há operadores que deixam o campo do código VAZIO em todas as paragens: um
    deles tinha 197 registos, um só código e 63 designações. Com o código por
    chave, o feed saiu com duas paragens onde estão sessenta e três — e passou
    no validador, porque um feed pequeno é estruturalmente válido. Todas as
    viagens partiam e chegavam ao mesmo sítio.
    """
    a = Paragem("", "Sobreira Formosa", 39.8000, -7.9000)
    b = Paragem("", "Ponte Froia", 39.8100, -7.9100)
    assert a.chave != b.chave
    # O mesmo sítio com o mesmo nome continua a ser a mesma paragem.
    assert a.chave == Paragem("", "SOBREIRA FORMOSA", 39.8000, -7.9000).chave
    # E com código, é o código que manda.
    assert Paragem("1028_1", "X", 39.0, -8.0).chave == "1028_1"


def test_a_mascara_de_dias_le_se_da_direita_para_a_esquerda():
    """Decifrada por comparação com os códigos que o mesmo ficheiro traz."""
    assert _dias_da_mascara("00000000011111") == {1, 2, 3, 4, 5}  # A-U
    assert _dias_da_mascara("00000000100000") == {6}  # E-S
    assert _dias_da_mascara("00000001000000") == {7}  # A-DF
    assert _dias_da_mascara("00000000000001") == {1}  # A-2
    assert _dias_da_mascara("00000000010100") == {3, 5}  # E-46 — quartas e sextas
    # Uma máscara que não se sabe ler não se adivinha: não se confere nada.
    assert _dias_da_mascara("111") is None
    assert _dias_da_mascara("0000000001111X") is None


def test_a_mesma_partida_depositada_todos_os_anos_e_um_autocarro_so():
    """O registo é histórico, e publicá-lo inteiro triplica as viagens.

    Um operador cujas circulações sejam todas do mesmo ano não dá por isto —
    e foi o caso do primeiro que se leu. O seguinte tinha a mesma partida das
    19:05 em 2023, 2024 e 2025, e o feed saiu com ela três vezes.
    """
    ci = {
        "id_servico": [1, 1, 1, 1],
        "sentido": ["Ida", "Ida", "Ida", "Volta"],
        "partida": ["19:05:00", "19:05:00", "19:05:00", "07:00:00"],
        "frequencia": ["A-35", "A-35", "A-35", "A-U"],
        "ano_frequencia": [2023, 2024, 2025, 2024],
    }
    fora, caidas = _so_a_edicao_mais_recente(ci)
    assert caidas == 2
    assert len(fora["id_servico"]) == 2
    assert sorted(fora["ano_frequencia"]) == [2024, 2025]
    # Uma partida diferente NÃO se funde com outra.
    assert set(fora["partida"]) == {"19:05:00", "07:00:00"}


def test_um_registo_sem_repetidos_passa_incolume():
    ci = {
        "id_servico": [1, 1],
        "sentido": ["Ida", "Volta"],
        "partida": ["08:00:00", "09:00:00"],
        "frequencia": ["A-U", "A-U"],
        "ano_frequencia": [2024, 2024],
    }
    fora, caidas = _so_a_edicao_mais_recente(ci)
    assert caidas == 0 and fora is ci
