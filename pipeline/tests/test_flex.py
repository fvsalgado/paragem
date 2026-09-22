"""O transporte a pedido: que circuito é cada quadro, que paragem é cada nome.

Os números da construção a sério estão em `data/reference/<regiao>/numeros.yaml`
e verificam-se na corrida que constrói os dados. Estes casos são pequenos e
inventados, e servem para quando uma regra se partir — que é quando é preciso
saber QUAL.
"""

from __future__ import annotations

from paragem.flex import (
    Circuito,
    Decisao,
    Quadro,
    chave_de_nome,
    circuitos_dos_quadros,
    classificar_rotulo,
    codigos_de_servico,
    resolver,
)

# --- o rótulo de uma coluna ------------------------------------------------


def test_feriados_nao_sao_ferias_escolares():
    """A armadilha que custou 190 dias de serviço numa brochura.

    «Dias úteis (exceto feriados)» é a coluna do ano inteiro. Lida como
    «férias», o circuito passava a andar só nas férias escolares.
    """
    assert classificar_rotulo("Dias úteis (exceto feriados) - 1.ª ida") == ("A", "uteis", "0")
    assert classificar_rotulo("Sábados (exceto feriados) - Volta") == ("A", "sab", "1")


def test_o_rotulo_diz_o_periodo_e_o_sentido():
    assert classificar_rotulo("Férias Escolares — Sábado (volta)") == ("FE", "sab", "1")
    assert classificar_rotulo("Período Escolar") == ("E", None, "0")
    assert classificar_rotulo("Dias úteis — regresso") == ("A", "uteis", "1")
    # Sem rótulo nenhum, anda no que o levantamento disser.
    assert classificar_rotulo("") == ("A", None, "0")


# --- os dias em que um circuito anda ---------------------------------------


def _circuito(**kw) -> Circuito:
    base = {
        "id": "X01",
        "nome": "Circuito de Exemplo",
        "concelho": "Exemplo",
        "horario": "Dias úteis",
        "dias_escolar": (True, True, True, True, True, False),
        "dias_ferias": (True, False, True, False, True, False),
        "paragens": (),
    }
    return Circuito(**{**base, **kw})


def test_os_dias_do_levantamento_viram_codigos_do_calendario():
    c = _circuito()
    assert codigos_de_servico(c, "E", None) == ["E-U"]
    # Três dias em férias não são «dias úteis»: são os dias que são.
    assert codigos_de_servico(c, "FE", None) == ["FE-246"]
    # «Anual» é os dois períodos, cada um com os seus dias.
    assert codigos_de_servico(c, "A", None) == ["E-U", "FE-246"]


def test_a_coluna_limita_os_dias_do_levantamento():
    c = _circuito(dias_escolar=(True, True, True, True, True, True))
    assert codigos_de_servico(c, "E", "sab") == ["E-S"]
    assert codigos_de_servico(c, "E", "uteis") == ["E-U"]


def test_um_circuito_sem_dia_nenhum_nao_da_codigo_nenhum():
    c = _circuito(dias_escolar=(False,) * 6, dias_ferias=(False,) * 6)
    assert codigos_de_servico(c, "A", None) == []


def test_os_codigos_declarados_valem_por_cima_do_levantamento():
    """O levantamento tem uma coluna por dia da semana e não sabe dizer
    «sábados da época balnear». Onde a região declara, é a região que manda."""
    c = _circuito(dias_escolar=(False,) * 6, dias_ferias=(False,) * 6, codigos=("V5-S", "V5-DF"))
    assert codigos_de_servico(c, "A", None) == ["V5-S", "V5-DF"]
    assert codigos_de_servico(c, "E", "uteis") == ["V5-S", "V5-DF"]


# --- que circuito é cada quadro --------------------------------------------


def _quadro(ficheiro: str, nome: str, **kw) -> Quadro:
    return Quadro(ficheiro=ficheiro, nome=nome, tipo=kw.pop("tipo", "percurso"), **kw)


def test_o_quadro_liga_se_ao_circuito_pelo_nome():
    circuitos = {"X01": _circuito(nome="Aboboreira"), "X02": _circuito(id="X02", nome="Cumeada")}
    q = _quadro("m.json", "Aboboreira")
    assert circuitos_dos_quadros([q], circuitos, catalogo={}, declarado={}) == {
        ("m.json", "Aboboreira"): "X01"
    }


def test_o_levantamento_pode_dar_duas_alternativas_de_nome():
    """`Alcaravela | Valhascos` é um circuito com dois nomes, não dois circuitos."""
    circuitos = {"X01": _circuito(nome="Alcaravela | Valhascos")}
    q = _quadro("s.json", "Alcaravela - Valhascos")
    assert circuitos_dos_quadros([q], circuitos, catalogo={}, declarado={}) == {
        ("s.json", "Alcaravela - Valhascos"): "X01"
    }


def test_o_nome_do_catalogo_vale_mais_do_que_o_do_quadro():
    circuitos = {"X01": _circuito(nome="Vale Escuro")}
    q = _quadro("c.json", "Circuito 3")
    catalogo = {("c.json", "Circuito 3"): "Vale Escuro"}
    assert circuitos_dos_quadros([q], circuitos, catalogo=catalogo, declarado={}) == {
        ("c.json", "Circuito 3"): "X01"
    }


def test_o_que_a_regiao_declara_vale_mais_do_que_qualquer_nome():
    """Três páginas da mesma brochura podem ser ramos do mesmo circuito."""
    circuitos = {"X01": _circuito(nome="Castelo"), "X09": _circuito(id="X09", nome="Outro")}
    quadros = [
        _quadro("s.json", "Circuito do Castelo — ramo de Pampilhal"),
        _quadro("s.json", "Circuito do Castelo — ramo do Mourisco"),
    ]
    declarado = {
        ("s.json", "Circuito do Castelo — ramo de Pampilhal"): "X09",
        ("s.json", "Circuito do Castelo — ramo do Mourisco"): "X09",
    }
    fora = circuitos_dos_quadros(quadros, circuitos, catalogo={}, declarado=declarado)
    assert set(fora.values()) == {"X09"}


def test_sem_parecenca_suficiente_o_quadro_fica_sem_circuito():
    """Atribuí-lo ao circuito errado mudava os dias em que ele anda."""
    circuitos = {"X01": _circuito(nome="Amioso")}
    q = _quadro("c.json", "Praia Fluvial de Dornes")
    assert circuitos_dos_quadros([q], circuitos, catalogo={}, declarado={}) == {
        ("c.json", "Praia Fluvial de Dornes"): None
    }


# --- que paragem é cada nome -----------------------------------------------


def test_a_chave_separa_o_poste_do_nome():
    assert chave_de_nome("Amioso (P2)") == ("amioso", "2")
    assert chave_de_nome("Falagueiro (P3) (Lar de Idosos)") == ("falagueiro", "3")
    assert chave_de_nome("Casais de Revelhos - Rua da Igreja") == ("casais de revelhos", "")


def _paragem(
    ident: str, nome: str, lat: float = 39.5, lon: float = -8.4, concelho: str = "Exemplo"
):
    return {"id": ident, "nome": nome, "lat": lat, "lon": lon, "concelho": concelho}


def test_a_chave_decide_dentro_do_circuito():
    paragens = {
        "g:1": _paragem("g:1", "Amioso (P1) (Largo)"),
        "g:2": _paragem("g:2", "Amioso (P2) (Escola)", lat=39.51),
    }
    circuitos = {"X01": _circuito(paragens=("g:1", "g:2"))}
    q = _quadro("c.json", "Circuito", paragens=["Amioso (P2)"])
    d = resolver([q], {("c.json", "Circuito"): "X01"}, circuitos, paragens)
    assert d[("c.json", "Circuito", "Amioso (P2)")] == Decisao("g:2", "circuito-chave")


def test_dois_candidatos_longe_um_do_outro_nao_se_escolhem():
    """A mesma paragem vista duas vezes decide-se; dois sítios diferentes não."""
    paragens = {
        "g:1": _paragem("g:1", "Fonte"),
        "g:2": _paragem("g:2", "Fonte", lat=39.9),
    }
    circuitos = {"X01": _circuito(paragens=("g:1", "g:2"))}
    q = _quadro("c.json", "Circuito", paragens=["Fonte"])
    d = resolver([q], {("c.json", "Circuito"): "X01"}, circuitos, paragens)
    assert d[("c.json", "Circuito", "Fonte")].escolha == "sem"


def test_a_mesma_paragem_vista_duas_vezes_decide_se():
    paragens = {
        "g:1": _paragem("g:1", "Fonte"),
        "g:2": _paragem("g:2", "Fonte", lat=39.5005),
    }
    circuitos = {"X01": _circuito(paragens=("g:1", "g:2"))}
    q = _quadro("c.json", "Circuito", paragens=["Fonte"])
    d = resolver([q], {("c.json", "Circuito"): "X01"}, circuitos, paragens)
    assert d[("c.json", "Circuito", "Fonte")].escolha == "g:1"


def test_sem_circuito_procura_se_no_concelho():
    paragens = {"g:9": _paragem("g:9", "Vale Escuro (P1)", concelho="Exemplo")}
    circuitos = {"X01": _circuito(concelho="Exemplo", paragens=())}
    q = _quadro("c.json", "Circuito", paragens=["Vale Escuro (P1)"])
    d = resolver([q], {("c.json", "Circuito"): "X01"}, circuitos, paragens)
    assert d[("c.json", "Circuito", "Vale Escuro (P1)")] == Decisao("g:9", "concelho-chave")


def test_a_tabela_manual_vale_por_cima_de_tudo():
    paragens = {"g:1": _paragem("g:1", "Amioso (P1)")}
    circuitos = {"X01": _circuito(paragens=("g:1",))}
    q = _quadro("c.json", "Circuito", paragens=["Amioso (P1)"])
    manual = {
        ("c.json", "Circuito", "Amioso (P1)"): Decisao("pt:39.5,-8.4", "manual:osm-poi", "o largo")
    }
    d = resolver([q], {("c.json", "Circuito"): "X01"}, circuitos, paragens, manual=manual)
    assert d[("c.json", "Circuito", "Amioso (P1)")].metodo == "manual:osm-poi"


def test_uma_tabela_de_partidas_nao_se_resolve():
    """Não é um percurso: não há por onde passar, e por isso não há o que decidir."""
    paragens = {"g:1": _paragem("g:1", "Abrantes")}
    circuitos = {"X01": _circuito(paragens=("g:1",))}
    q = _quadro("c.json", "Ligações", tipo="partidas", paragens=["Abrantes"])
    assert resolver([q], {("c.json", "Ligações"): "X01"}, circuitos, paragens) == {}
