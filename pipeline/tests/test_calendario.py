"""O gerador de calendário — e, sobretudo, o que ele se recusa a adivinhar."""

from copy import deepcopy
from datetime import date, timedelta

from conftest import regiao_ou_salta
from paragem.calendario import Calendario, pascoa


def test_pascoa():
    # Conferidas contra o calendário: são as datas reais.
    assert pascoa(2024) == date(2024, 3, 31)
    assert pascoa(2025) == date(2025, 4, 20)
    assert pascoa(2026) == date(2026, 4, 5)
    assert pascoa(2027) == date(2027, 3, 28)


def test_feriados_nacionais_incluem_os_moveis(raiz):
    cal = Calendario(regiao_ou_salta("prova").calendario)
    f = cal.feriados(2026)
    assert date(2026, 4, 3) in f, "Sexta-feira Santa"
    assert date(2026, 6, 4) in f, "Corpo de Deus"
    assert date(2026, 4, 25) in f, "Dia da Liberdade"
    assert date(2026, 2, 17) not in f, "o Carnaval não é feriado obrigatório"


def test_os_tres_codigos_de_dias_particionam_o_ano(raiz):
    """U, S e DF não se sobrepõem e não deixam dias de fora.

    É a conta que apanha um erro de tratamento de feriados: se um feriado em dia
    útil contasse em U e em DF, a soma passava dos 365.
    """
    cal = Calendario(regiao_ou_salta("prova").calendario)
    inicio, fim = date(2026, 1, 1), date(2026, 12, 31)
    u = set(cal.resolver("A-U", inicio, fim).datas)
    s = set(cal.resolver("A-S", inicio, fim).datas)
    df = set(cal.resolver("A-DF", inicio, fim).datas)
    assert len(u & s) == len(u & df) == len(s & df) == 0
    assert len(u | s | df) == 365


def test_digitos_sao_dias_da_semana(raiz):
    cal = Calendario(regiao_ou_salta("prova").calendario)
    datas = cal.resolver("A-2356", date(2026, 3, 2), date(2026, 3, 8)).datas
    # Segunda, terça, quinta e sexta — sem quarta, sem fim de semana.
    assert [d.isoweekday() for d in datas] == [1, 2, 4, 5]


def test_sem_periodos_nenhuns_nao_se_adivinha():
    """A garantia original, que continua a valer: sem datas, zero datas.

    Deixou de se poder testar com o Médio Tejo — que agora TEM datas —, por
    isso testa-se com uma declaração feita à mão. A garantia é sobre o gerador,
    não sobre o estado de uma região num dia.
    """
    cal = Calendario(
        {
            "ano_letivo": {"periodos": [], "confirmado": False},
            "codigos": {
                "periodo": {"E": {"regra": "periodos-de-aulas"}},
                "dias": {"U": {"dias_da_semana": [1, 2, 3, 4, 5], "exclui_feriados": True}},
            },
        }
    )
    r = cal.resolver("E-U", date(2026, 1, 1), date(2026, 12, 31))
    assert r.datas == []
    assert any("ano letivo" in m for m in r.por_confirmar)


def test_datas_por_confirmar_produzem_datas_e_dizem_que_estao_por_confirmar(raiz):
    """Ter datas boas por confirmar é um estado DIFERENTE de não ter datas.

    Durante um tempo foram a mesma coisa, e isso deixava 587 viagens sem dia
    nenhum por faltar um carimbo. Agora o serviço escolar projeta-se — e a
    resolução diz, em cima, que as datas vêm do despacho e não da operadora.
    """
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)
    assert cal.ano_letivo_tem_datas
    assert not cal.ano_letivo_confirmado

    r = cal.resolver("E-U", date(2026, 10, 1), date(2026, 11, 30))
    assert r.datas, "o período escolar de outubro e novembro tem de dar datas"
    assert not r.confiavel
    assert any("por confirmar" in m for m in r.por_confirmar)


def test_os_dias_que_o_despacho_deixa_em_aberto_ficam_de_fora(raiz):
    """O despacho dá um INTERVALO para o arranque e três datas para o fim.

    Nesses dias não se escolhe por conta própria. Ficar de fora é a direção
    segura: dizer que um autocarro passa e ele não passar deixa alguém à
    espera.
    """
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)

    # 11 e 14 de setembro de 2026: dentro da janela de arranque (11 a 15).
    setembro = cal.resolver("E-U", date(2026, 9, 1), date(2026, 9, 30)).datas
    assert date(2026, 9, 11) not in setembro
    assert date(2026, 9, 14) not in setembro
    assert date(2026, 9, 15) in setembro, "a partir do 15 o arranque é certo"

    # Junho de 2027: o 3.º período acaba a 4, 11 ou 30, conforme o ciclo.
    junho = cal.resolver("E-U", date(2027, 6, 1), date(2027, 6, 30)).datas
    assert date(2027, 6, 4) in junho, "até à primeira das três datas é certo"
    assert not [d for d in junho if d > date(2027, 6, 4)]


def test_ax5_corre_no_carnaval_e_na_pascoa(raiz):
    """«Anual exceto julho, agosto e férias de Natal» exclui o Natal, e só.

    O gerador lia `exceto_periodos` como «férias escolares» em geral e tirava
    ao AX5 três semanas de serviço que existe. O defeito esteve escondido
    enquanto não houve calendário nenhum para o revelar — é o argumento a favor
    de preencher o ficheiro mesmo por confirmar.
    """
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)
    ax5 = set(cal.resolver("AX5-U", date(2026, 12, 1), date(2027, 6, 4)).datas)

    assert date(2027, 2, 8) in ax5, "segunda-feira de Carnaval"
    assert date(2027, 3, 23) in ax5, "interrupção da Páscoa"
    assert date(2026, 12, 28) not in ax5, "dentro da interrupção do Natal"
    assert date(2027, 1, 4) in ax5, "a interrupção acaba a 3; o dia 4 já é de aulas"

    # E continua a excluir o que tem de excluir.
    assert not cal.resolver("AX5-U", date(2027, 7, 1), date(2027, 8, 31)).datas


def test_o_v5_corre_do_fim_de_junho_ao_arranque_declarado(raiz):
    """O V5 corre «de 28 de junho até ao início do ano letivo».

    Com o ano letivo 2027/2028 transcrito do despacho — arranque a 15 de
    setembro de 2027 —, o V5 tem finalmente um fim. Foram estas 19 viagens que
    deram durante um dia os últimos 19 erros do validador.
    """
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)
    datas = cal.resolver("V5-U", date(2027, 6, 1), date(2027, 9, 30)).datas
    assert datas, "com o arranque declarado, o V5 tem de resolver"

    # AS DUAS PONTAS SÃO INTERESSANTES, e nenhuma é a que se escreveria de
    # cabeça.
    #
    # Não começa a 28 de junho, que é o que o código V5 diz: 28, 29 e 30 caem
    # dentro do bloco `incerto` do fim do 3.º período, que o despacho dá em
    # três datas conforme o ciclo. Dias incertos ficam de fora enquanto a
    # operadora não fechar a ponta — o primeiro dia certo é 1 de julho.
    assert min(datas) == date(2027, 7, 1)

    # E não acaba a 14: 13 e 14 de setembro são o intervalo de arranque, também
    # incerto. O último dia certo é a sexta-feira anterior.
    assert max(datas) == date(2027, 9, 10)
    assert date(2027, 9, 15) not in datas, "a 15 já é ano letivo"


def test_o_inicio_do_ano_letivo_tem_de_ser_declarado(raiz):
    """E sem `arranque: true`, o V5 devolve zero datas E DIZ PORQUÊ.

    É a mesma pergunta pelo lado de trás, e continua a ser a que importa: em
    2027 o primeiro período de aulas do ano civil começa a 4 de janeiro, que é
    o regresso do Natal. Tomá-lo por arranque fazia o V5 pedir um intervalo que
    acaba antes de começar e devolver zero datas SEM SE QUEIXAR — que é a falha
    pior de todas, porque não se distingue de «não há serviço».

    O ficheiro real já tem o arranque; aqui tira-se, para o guarda continuar a
    ser testado depois de a lacuna que o revelou estar fechada.
    """
    d = deepcopy(regiao_ou_salta("medio-tejo").calendario)
    for p in d["ano_letivo"]["periodos"]:
        if p.get("arranque") and str(p["inicio"]).startswith("2027"):
            del p["arranque"]
    r = Calendario(d).resolver("V5-U", date(2027, 6, 1), date(2027, 9, 30))
    assert r.datas == []
    assert any("início do ano letivo" in m for m in r.por_confirmar)


def test_codigo_desconhecido_nao_se_adivinha(raiz):
    """Um código sem regra declarada devolve zero datas e a razão.

    É o comportamento que impede um serviço de ser projetado para o dia errado,
    que é pior do que um serviço em falta.
    """
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)
    r = cal.resolver("A-ZZZ", date(2026, 1, 1), date(2026, 12, 31))
    assert r.datas == []
    assert "código de dias 'ZZZ'" in r.por_confirmar


def test_os_codigos_da_legenda_do_pdf(raiz):
    """As três leituras que eu tinha por hipótese estavam erradas.

    A legenda do PDF é normativa, e diz:

      - `DFXN` — domingos e feriados, EXCETO 25 de dezembro **e 1 de janeiro**
        (a hipótese era «exceto Natal», e faltava-lhe metade);
      - `SFXD` — **sábados** e feriados, exceto domingos (a hipótese era
        domingos; a própria tradução inglesa do PDF diz «Sundays», e engana);
      - `TD` — **domingos**, incluindo quando são feriado (a hipótese era
        «todos os dias», e punha autocarros a circular seis dias por semana que
        não circulam).

    É por isto que a regra de não adivinhar não é escrúpulo: era 1 em 3.
    """
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)
    i, f = date(2026, 1, 1), date(2026, 12, 31)

    dfxn = set(cal.resolver("A-DFXN", i, f).datas)
    assert date(2026, 12, 25) not in dfxn
    assert date(2026, 1, 1) not in dfxn
    assert date(2026, 4, 25) in dfxn, "o 25 de Abril continua a contar"

    sfxd = set(cal.resolver("A-SFXD", i, f).datas)
    assert not any(d.isoweekday() == 7 for d in sfxd), "SFXD não corre aos domingos"
    assert any(d.isoweekday() == 6 for d in sfxd), "e corre aos sábados"

    td = set(cal.resolver("A-TD", i, f).datas)
    df = set(cal.resolver("A-DF", i, f).datas)
    assert all(d.isoweekday() == 7 for d in td), "TD é só domingos"
    assert td < df, "DF corre também nos feriados fora de domingo; TD não"


def test_a_prova_nao_tem_feriados_municipais_e_isso_conta(raiz):
    """A região de prova deixa-os por preencher de propósito.

    É a prova de que a lacuna aparece no relatório em vez de desaparecer — se
    um dia alguém «arrumar» o pipeline e as lacunas deixarem de ser contadas,
    é aqui que o CI dá por isso.
    """
    cal = Calendario(regiao_ou_salta("prova").calendario)
    assert set(cal.feriados_municipais_sem_regra()) == {"pedra-alta", "ribeira-do-corvo"}
    assert cal.feriados_municipais(2026) == {}


def test_os_treze_feriados_municipais_tem_regra(raiz):
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)
    assert cal.feriados_municipais_sem_regra() == []
    assert len(cal.feriados_municipais(2026)) == 13


def test_os_feriados_moveis_caem_sempre_no_dia_certo(raiz):
    """Quatro dos treze andam com a Páscoa. É a razão de não serem datas fixas.

    Uma data fixa escrita para um destes fica errada já no ano seguinte — e
    ninguém dá por isso, porque o ficheiro continua preenchido.
    """
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)
    for ano in (2025, 2026, 2027, 2030):
        f = cal.feriados_municipais(ano)
        # Quinta-feira da Ascensão: 39 dias depois da Páscoa, sempre quinta.
        assert f["alcanena"].isoweekday() == 4, ano
        assert f["torres-novas"] == f["alcanena"]
        # Segunda-feira de Páscoa: o dia a seguir, sempre segunda.
        assert f["constancia"].isoweekday() == 1, ano
        assert f["macao"] == f["constancia"]
        assert f["constancia"] == pascoa(ano) + timedelta(days=1)


def test_as_datas_de_2026_batem_com_as_fontes(raiz):
    """Conferidas contra as datas que as próprias fontes dão para 2026."""
    f = Calendario(regiao_ou_salta("medio-tejo").calendario).feriados_municipais(2026)
    assert f["abrantes"] == date(2026, 6, 14)
    assert f["alcanena"] == date(2026, 5, 14)
    assert f["constancia"] == date(2026, 4, 6)
    assert f["entroncamento"] == date(2026, 11, 24)
    assert f["ferreira-do-zezere"] == date(2026, 6, 13)
    assert f["macao"] == date(2026, 4, 6)
    assert f["ourem"] == date(2026, 6, 20)
    assert f["sardoal"] == date(2026, 9, 22)
    assert f["serta"] == date(2026, 6, 24)
    assert f["tomar"] == date(2026, 3, 1)
    assert f["torres-novas"] == date(2026, 5, 14)
    assert f["vila-de-rei"] == date(2026, 9, 19)
    assert f["vila-nova-da-barquinha"] == date(2026, 6, 13)


def test_o_que_falta_confirmar_esta_contado(raiz):
    """«Duas fontes secundárias concordam» não é «a câmara diz»."""
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)
    assert set(cal.feriados_municipais_por_confirmar()) == {
        "abrantes",
        "ferreira-do-zezere",
        "tomar",
        "torres-novas",
        "vila-nova-da-barquinha",
    }


def test_um_feriado_municipal_nao_entra_nos_nacionais(raiz):
    """Vale num concelho, não no território. Misturá-los aplicava o de Tomar a Abrantes."""
    cal = Calendario(regiao_ou_salta("medio-tejo").calendario)
    assert date(2026, 3, 1) not in cal.feriados(2026), "o de Tomar"
    assert date(2026, 9, 19) not in cal.feriados(2026), "o de Vila de Rei"
