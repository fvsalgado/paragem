"""O que o sítio lê — escrito pelo `uv run pipeline sitio`."""

import collections
import json
import shutil

import pytest

from conftest import regiao_ou_salta


def test_a_demonstracao_nao_sai_vazia(raiz, tmp_path):
    """A região de prova tem de produzir uma rede, não um sítio vazio.

    Este teste existe por um defeito que nada apanhou: o `sitio.py` pedia o
    feed pelo NOME do ficheiro do Médio Tejo (`meio.zip`), e a região de prova
    — cujo feed se chama `rede-alta.zip` — construiu um sítio completo com zero
    paragens e zero linhas, sem um erro.

    O `check-regioes` não o podia apanhar: ele procura o nome de uma região nas
    saídas de outra, e aqui não havia saída nenhuma onde procurar. Um sítio
    vazio passa em todas as verificações que olham para o que lá está.
    """
    from paragem.sitio import construir

    gtfs = raiz / "build" / "prova" / "gtfs"
    if not (gtfs / "rede-alta.zip").exists():
        pytest.skip("sem build/prova — corre `uv run pipeline build --regiao prova`")
    shutil.copytree(gtfs, tmp_path / "gtfs")

    r = regiao_ou_salta("prova")
    s = construir(raiz, r, tmp_path)

    assert s.feed_proprio == "rede-alta.zip", "o feed vem da declaração, não do nome cravado"

    paragens = json.loads((tmp_path / "sitio" / "paragens.json").read_text(encoding="utf-8"))
    linhas = json.loads((tmp_path / "sitio" / "linhas.json").read_text(encoding="utf-8"))
    assert paragens, "a demonstração tem paragens"
    assert linhas, "a demonstração tem linhas"

    # E não tem comboio, de propósito: prova que um modo ausente não desenha
    # uma secção vazia (ver o cabeçalho de regioes/prova/regiao.yaml).
    assert s.feed_de_comboio is None


def test_um_horario_transcrito_a_mao_chega_ao_sitio(raiz, tmp_path):
    """As folhas que se transcrevem à mão são horários como os outros.

    Há brochuras que nenhum leitor automático lê sem risco — traços que não
    assentam nas colunas, três circuitos empilhados sem cabeçalho — e essas
    passam pelo `horarios-manuais`. Construíam-se e não chegavam à página: o
    `_horarios_a_pedido` só olhava para o `horarios-pdf-cartaz`, e três
    circuitos com horário ficavam de fora sem um aviso.

    Um leitor novo que produza a mesma forma entra em `LEITORES_DE_HORARIO` e
    aparece; um que falte aqui falha.
    """
    from paragem.leitores import LEITORES_DE_HORARIO
    from paragem.sitio import construir

    construcao = raiz / "build" / "medio-tejo"
    if not (construcao / "tap" / "link.json").exists():
        pytest.skip("sem build/medio-tejo — corre `uv run pipeline build --regiao medio-tejo`")

    r = regiao_ou_salta("medio-tejo")
    # O QUE SE MEDE É O CATÁLOGO, e não tudo o que é do modo a pedido: o feed
    # GTFS-Flex também é `modo: a-pedido` e não é um horário para a página —
    # é um ficheiro para máquinas, e vai pela página de dados abertos.
    declarados = {
        s.leitor
        for s in r.saidas
        if s.modo == "a-pedido" and s.papel == "catalogo-proprio" and s.leitor
    }
    assert declarados <= LEITORES_DE_HORARIO, (
        "a região declara horários a pedido com um leitor que o sítio não lê"
    )

    # ESCREVE PARA UM SÍTIO SÓ SEU, e lê o resto por atalho.
    #
    # A primeira versão deste teste chamava o `construir` com a pasta de
    # construção verdadeira, e isso partiu um `next build` que corria ao mesmo
    # tempo: o sítio estava a ler os JSON enquanto o teste os reescrevia, e o
    # que se viu foi uma página de paragem a rebentar sem razão aparente. Um
    # teste não escreve por cima do que outra coisa está a ler.
    for pasta in ("gtfs", "gbfs", "geojson", "tap", "urbanos"):
        if (construcao / pasta).exists():
            (tmp_path / pasta).symlink_to(construcao / pasta)
    construir(raiz, r, tmp_path)
    d = json.loads((tmp_path / "sitio" / "a-pedido.json").read_text(encoding="utf-8"))
    ids = {h["id"] for h in d["horarios"]}
    assert {"constancia", "fzz-praias", "link"} <= ids, "faltam as transcritas à mão"

    # E quem transcreveu fica no ficheiro: o guarda prova que a hora está no
    # PDF; que está na paragem certa mediu-o uma pessoa, uma vez.
    manuais = [h for h in d["horarios"] if h["id"] in {"constancia", "fzz-praias", "link"}]
    assert all(h["transcrito_por"] for h in manuais)


def test_uma_tabela_de_partidas_nao_traz_viagens(raiz):
    """O folheto do LINK é uma tabela de partidas, não um percurso.

    Lista, por cidade, as seis horas a que se parte dela. Lido como percurso
    dava um autocarro que passa por catorze cidades seguidas, e não existe tal
    autocarro. O quadro sai com `tipo: partidas`, zero viagens e a grelha em
    `horas` — e é a página que diz o que a tabela é.
    """
    caminho = raiz / "build" / "medio-tejo" / "tap" / "link.json"
    if not caminho.exists():
        pytest.skip("sem build/medio-tejo")
    d = json.loads(caminho.read_text(encoding="utf-8"))
    q = d["quadros"][0]
    assert q["tipo"] == "partidas"
    assert q["viagens"] == []
    assert len(q["horas"]) == len(q["paragens"]) == 14


# --- duas concessões no mesmo cais -----------------------------------------
#
# Não nomeiam ninguém: procuram uma região que declare `paragens_de` numa
# saída, que é a propriedade que faz a fusão acontecer, e saltam com a razão
# escrita quando não houver nenhuma nesta raiz (CLAUDE.md §11.6).


def _regiao_que_partilha_paragens(raiz):
    from paragem.regiao import carregar_todas

    for r in carregar_todas(raiz):
        for s in r.saidas:
            if (s.params or {}).get("paragens_de"):
                return r, s
    pytest.skip(
        "nenhuma região nesta raiz declara `paragens_de` — "
        "se ela vive noutra, aponta-a com PARAGEM_RAIZES (docs/RAIZES.md)"
    )


def test_a_paragem_partilhada_mostra_as_partidas_DAS_DUAS(raiz):
    """A avaria que isto impede: o terminal com duas fichas, cada uma a meio.

    Quando dois operadores servem o mesmo cais, o feed de cada um declara-o
    com o seu código. Se o sítio os tratar como paragens diferentes, ficam
    dois pontos no mapa com o mesmo nome, cada um com metade dos autocarros —
    e duas metades parecem duas coisas completas. Ninguém dá por isso.
    """
    r, _ = _regiao_que_partilha_paragens(raiz)
    base = raiz / "build" / r.id / "sitio"
    if not (base / "paragens.json").exists():
        pytest.skip(f"sem build/{r.id}/sitio — corre `uv run pipeline sitio --regiao {r.id}`")

    partilhada = None
    for ficheiro in sorted((base / "partidas").glob("*.json")):
        grupo = json.loads(ficheiro.read_text(encoding="utf-8"))
        for sid, lista in grupo.items():
            operadores = {p.get("operador") for p in lista}
            if len(operadores) > 1:
                partilhada = (sid, lista, operadores)
                break
        if partilhada:
            break
    assert partilhada, "nenhuma paragem com partidas de mais do que um operador"

    sid, lista, operadores = partilhada
    # Um dos «operadores» é `None`: é a rede da própria região, que não se
    # anuncia porque o §1 manda que a entidade seja informação secundária.
    assert None in operadores, "a rede da região não devia anunciar operador"
    assert any(p.get("operador") for p in lista), "o operador de fora tem de se identificar"


def test_a_linha_de_fora_tem_pagina_e_diz_quem_a_gere(raiz):
    """Uma partida aponta para a página da linha. Sem página, a ligação parte.

    E com página mas sem «Gerido por», quem lá chega não sabe que título
    precisa de comprar — que é a única coisa para que a entidade interessa a
    quem viaja.
    """
    r, _ = _regiao_que_partilha_paragens(raiz)
    base = raiz / "build" / r.id / "sitio"
    if not (base / "linhas.json").exists():
        pytest.skip(f"sem build/{r.id}/sitio")
    linhas = json.loads((base / "linhas.json").read_text(encoding="utf-8"))
    linhas = linhas.get("linhas", linhas) if isinstance(linhas, dict) else linhas
    conhecidas = {str(x["id"]) for x in linhas}
    de_fora = [x for x in linhas if x.get("operador")]
    assert de_fora, "nenhuma linha declara operador"

    # TODAS as partidas apontam para uma linha que existe no índice.
    apontadas = set()
    for ficheiro in sorted((base / "partidas").glob("*.json")):
        for lista in json.loads(ficheiro.read_text(encoding="utf-8")).values():
            apontadas.update(str(p["linha_id"]) for p in lista)
    orfas = sorted(apontadas - conhecidas)
    assert not orfas, f"partidas a apontar para linhas sem página: {orfas[:10]}"

    # E QUANDO O NÚMERO SE REPETE, alguém tem de se identificar.
    #
    # Isto já exigiu que nenhum número se repetisse, e era uma exigência ao
    # mundo em vez de uma ao produto: a rede da região tem uma carreira 1109 e
    # a concessão vizinha tem outra, e não há nada a fazer quanto a isso. O que
    # o produto controla é a lista deixar de ser ambígua — basta uma das duas
    # dizer de quem é.
    codigos = [str(x["codigo"]) for x in linhas]
    for c in {x for x in codigos if codigos.count(x) > 1 and x}:
        iguais = [x for x in linhas if str(x["codigo"]) == c]
        assert any(x.get("operador") for x in iguais), (
            f"duas linhas com o número {c} e nenhuma diz de quem é: {[x['nome'] for x in iguais]}"
        )


def test_a_pagina_da_linha_nao_liga_para_paragens_que_nao_existem(raiz):
    """A ligação partida que isto guarda foi feita por engano, e vista a 404.

    Dar página às linhas de fora sem dar às paragens delas: a página da linha
    lista o percurso e liga a cada paragem, e as que só ela serve não estavam
    no índice. Compila, passa nos tipos, passa no axe — e clicar dá 404, numa
    página que acabara de ser criada para não ter ligações partidas.

    O `web/tests/ligacoes.mjs` apanha o mesmo, e melhor: segue todos os
    `href` do sítio construído. Este não o substitui — apanha-o **antes**, nos
    dados, sem esperar os dezassete minutos que a construção do sítio demora.
    Uma ligação partida descoberta em segundos custa menos do que a mesma
    descoberta no fim.
    """
    r, _ = _regiao_que_partilha_paragens(raiz)
    base = raiz / "build" / r.id / "sitio"
    if not (base / "linhas.json").exists():
        pytest.skip(f"sem build/{r.id}/sitio")
    paragens = json.loads((base / "paragens.json").read_text(encoding="utf-8"))
    conhecidas = {str(p["id"]) for p in paragens}

    apontadas = set()
    for f in sorted((base / "linhas").glob("*.json")) if (base / "linhas").exists() else []:
        d = json.loads(f.read_text(encoding="utf-8"))
        for s in d.get("sentidos") or []:
            apontadas.update(str(p["id"]) for p in s.get("paragens") or [])
    if not apontadas:
        pytest.skip("as linhas não trazem percurso neste formato")
    orfas = sorted(apontadas - conhecidas)
    assert not orfas, f"a página da linha liga para {len(orfas)} paragens sem página: {orfas[:8]}"


def test_as_paragens_de_um_modo_entram_no_mapa():
    """Um modo que traga `paragens` com coordenadas ganha pontos no mapa.

    Faltava este ramo e o que faltava no mapa eram os cais dos expressos: o
    leitor trazia-os com coordenadas, o `_pontos_dos_modos` só olhava para
    `sistemas`, `pontos` e `horarios`, e o mapa ficava sem o filtro desse modo
    porque não tinha um único ponto desse tipo. Nada falhava — a camada
    deriva do que existe, e o que não existe não dá erro.

    O modo aqui chama-se `terreiro` e não existe em região nenhuma: o que se
    testa é a FORMA (§11.5), e um teste que nomeasse o modo de um cliente
    passaria a valer só onde esse cliente está.
    """
    from paragem.sitio import _pontos_dos_modos

    campos = ["nome", "lat", "lon", "tipo", "paragens", "id", "concelho"]
    pontos = _pontos_dos_modos(
        {
            "terreiro": {
                "paragens": [
                    {"id": "t1", "nome": "Cais de Cima", "lat": 39.6, "lon": -8.4, "concelho": "x"},
                    # Sem coordenadas não entra, e não se inventa nenhuma (§4.4).
                    {"id": "t2", "nome": "Cais por confirmar"},
                ]
            }
        },
        campos,
    )

    assert list(pontos) == ["terreiro:t1"]
    linha = pontos["terreiro:t1"]
    assert linha[campos.index("nome")] == "Cais de Cima"
    assert linha[campos.index("tipo")] == "terreiro", "o tipo é o modo, e é ele que dá a camada"
    assert linha[campos.index("lat")] == 39.6
    assert linha[campos.index("concelho")] == "x"


def test_uma_circular_marca_se_como_circular():
    """Uma viagem que acaba onde começa não repete o nome da paragem.

    As linhas urbanas desta região são circulares: na folha do cais delas
    liam-se 98 partidas seguidas com o destino igual ao título da página, o
    que se lê como um erro e não como uma volta.

    A marca compara IDENTIFICADORES, não nomes: duas paragens com o mesmo
    nome em sítios diferentes não são uma circular, e este teste tem de o
    provar — senão a regra passa a ser sobre nomes sem ninguém dar por isso.
    """
    from paragem.sitio import Sitio

    class FeedFalso:
        routes = [{"route_id": "U1", "route_short_name": "U1"}]
        trips = [
            {"trip_id": "volta", "route_id": "U1", "service_id": "A-U"},
            {"trip_id": "ida", "route_id": "U1", "service_id": "A-U"},
        ]
        stops = [
            {"stop_id": "a1", "stop_name": "Terminal"},
            {"stop_id": "a2", "stop_name": "Mercado"},
            # Mesmo NOME da primeira, outro identificador: outro sítio.
            {"stop_id": "b1", "stop_name": "Terminal"},
        ]
        stop_times = [
            {"trip_id": "volta", "stop_id": "a1", "stop_sequence": "1", "departure_time": "08:00"},
            {"trip_id": "volta", "stop_id": "a2", "stop_sequence": "2", "departure_time": "08:10"},
            {"trip_id": "volta", "stop_id": "a1", "stop_sequence": "3", "departure_time": "08:20"},
            {"trip_id": "ida", "stop_id": "a1", "stop_sequence": "1", "departure_time": "09:00"},
            {"trip_id": "ida", "stop_id": "b1", "stop_sequence": "2", "departure_time": "09:30"},
        ]

        def __contains__(self, _nome):
            return False

        def obter(self, _nome):
            return []

    class SemRegiao(Sitio):
        feed_proprio = None

        def _nomes_de_servico(self):
            return {}

        def _feed(self, _nome):
            return None

    s = SemRegiao.__new__(SemRegiao)
    partidas: dict = collections.defaultdict(list)
    linhas: dict = collections.defaultdict(set)
    s._partidas_do_feed(FeedFalso(), partidas, linhas, "f")

    de_a1 = {p["hora"]: p for p in partidas["a1"]}
    assert de_a1["08:00"].get("circular") is True, "acaba no mesmo stop_id: é circular"
    assert "circular" not in de_a1["09:00"], "acaba noutro stop_id com o mesmo nome: não é"
    assert de_a1["09:00"]["destino"] == "Terminal"


def test_o_que_se_descarrega_sai_com_o_ficheiro_e_os_termos(raiz, tmp_path):
    """A página de dados abertos tem de deixar levar o que mostra.

    Era uma tabela sem ligações: dizia o que existia e não dava nada. Agora
    cada ficheiro é copiado para `sitio/descargas/` e o manifesto diz o
    tamanho, a soma, a origem e — o que mais importa — SOB QUE TERMOS.
    """
    import shutil

    from paragem.sitio import construir

    gtfs = raiz / "build" / "prova" / "gtfs"
    if not (gtfs / "rede-alta.zip").exists():
        pytest.skip("sem build/prova — corre `uv run pipeline build --regiao prova`")
    shutil.copytree(gtfs, tmp_path / "gtfs")
    for pasta in ("geojson", "gbfs"):
        if (raiz / "build" / "prova" / pasta).is_dir():
            shutil.copytree(raiz / "build" / "prova" / pasta, tmp_path / pasta)

    construir(raiz, regiao_ou_salta("prova"), tmp_path)
    manifesto = json.loads((tmp_path / "sitio" / "dados-abertos.json").read_text(encoding="utf-8"))
    assert manifesto, "a região de prova também tem o que descarregar"

    for d in manifesto:
        ficheiro = tmp_path / "sitio" / "descargas" / d["caminho"]
        assert ficheiro.exists(), f"{d['caminho']} está no manifesto e não está em descargas/"
        assert ficheiro.stat().st_size == d["bytes"], f"{d['caminho']}: o tamanho não bate certo"
        assert len(d["sha256"]) == 64
        assert d["termos"] in ("odbl", "consulta", "terceiro", "nosso")
        assert d["grupo"]

    # O que deriva SÓ do OpenStreetMap é reutilizável, e tem de o dizer — com
    # a atribuição, que na ODbL não é opcional.
    de_osm = [d for d in manifesto if d["termos"] == "odbl"]
    for d in de_osm:
        assert d["atribuicao"], f"{d['caminho']}: ODbL sem atribuição escrita"


def test_um_feed_de_outra_entidade_nao_se_apresenta_como_nosso():
    """Os termos de um ficheiro de terceiro são dele, e a página diz isso."""
    from paragem.sitio import _termos

    class Fonte:
        licenca = "por-confirmar"

    assert _termos(Fonte(), "feed-de-terceiro") == "terceiro"
    assert _termos(Fonte(), "horarios") == "consulta"

    class DeOsm:
        licenca = "ODbL-1.0"

    assert _termos(DeOsm(), "base-osm") == "odbl"
