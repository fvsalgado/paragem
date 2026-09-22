"""O instantâneo do sítio de reservas: o que ele dá, e o que se recusa a dar.

O que este leitor produz são HORAS que vão para um painel de partidas, e o
maior risco aqui não é ler mal: é ler bem e **dizer que sabe os dias**. A
página é o horário de uma data. Quem a lê sabe que naquele dia aquelas viagens
existiram, e não sabe mais nada.

Como em todo o resto da suite pública, nenhum teste nomeia um cliente: procuram
a saída pela PROPRIEDADE que estão a verificar — «uma região que declare o
leitor `horarios-reservas`» — e saltam com a razão escrita quando não houver
nenhuma nesta raiz (CLAUDE.md §11.6).
"""

from __future__ import annotations

import datetime as dt
import json

import pytest

from paragem.leitores import GENERICOS, LEITORES, LEITORES_DE_HORARIO
from paragem.leitores.horarios_reservas import (
    DIAS,
    _chave,
    _horas_da_paragem,
    _html_do_mhtml,
    _minutos,
    nome,
)
from paragem.regiao import carregar_todas


def _sopa(html: str):
    from bs4 import BeautifulSoup

    return BeautifulSoup(html, "lxml")


# --- o que não precisa de dados nenhuns ------------------------------------


def test_o_leitor_esta_registado_como_generico_e_como_horario():
    assert nome in LEITORES
    assert nome in GENERICOS
    # Sem isto o horário constrói-se e não chega a página nenhuma — foi
    # exatamente assim que três transcrições se perderam uma vez.
    assert nome in LEITORES_DE_HORARIO


def test_tira_o_html_de_dentro_do_ficheiro_gravado():
    bruto = (
        b"From: <Saved by Blink>\r\n"
        b'Content-Type: multipart/related; boundary="B"\r\n\r\n'
        b"--B\r\nContent-Type: text/html\r\n"
        b"Content-Transfer-Encoding: quoted-printable\r\n\r\n"
        b"<html><body>Ol=C3=A1</body></html>\r\n"
        b"--B\r\nContent-Type: image/png\r\n"
        b"Content-Transfer-Encoding: base64\r\n\r\nAAAA\r\n--B--\r\n"
    )
    assert "Olá" in _html_do_mhtml(bruto)


def test_um_ficheiro_sem_html_diz_o_que_se_passa():
    bruto = (
        b"From: <Saved by Blink>\r\n"
        b'Content-Type: multipart/related; boundary="B"\r\n\r\n'
        b"--B\r\nContent-Type: image/png\r\n\r\nAAAA\r\n--B--\r\n"
    )
    with pytest.raises(ValueError, match="não tem nenhuma parte HTML"):
        _html_do_mhtml(bruto)


# --- as colunas estão ANINHADAS, e é onde isto se parte --------------------

ANINHADO = """
<td>
  <span class="scheduleStations">Rosmaninhal</span><br/>
  <span><span>10:18</span><span><span>17:00</span><span></span></span></span>
</td>
"""


def test_le_as_duas_colunas_de_uma_paragem():
    """A avaria: lidas como irmãs, sai uma coluna só.

    Foi o que aconteceu à primeira leitura — 2 332 paragens todas com uma
    hora, quando 461 delas têm duas. Uma coluna perdida é uma viagem inteira
    que desaparece do painel sem ninguém dar por isso.
    """
    td = _sopa(ANINHADO).find("td")
    assert _horas_da_paragem(td) == ["10:18", "17:00"]


def test_o_traco_de_quem_nao_para_ali_le_se_como_esta():
    td = _sopa(
        '<td><span class="scheduleStations">X</span><br/>'
        "<span><span>-----</span><span><span>13:48</span><span></span></span></span></td>"
    ).find("td")
    assert _horas_da_paragem(td) == ["-----", "13:48"]


# --- horas comparam-se em MINUTOS -------------------------------------------


def test_a_hora_compara_se_pelo_valor_e_nao_pela_grafia():
    """Esta fonte escreve «09:56» e as transcrições escrevem «9:56».

    Comparadas como texto são horas diferentes, e a primeira versão do
    cruzamento disse que 29 das 30 horas de um circuito não batiam — quando
    batiam todas. É o mesmo defeito que o leitor das transcrições já teve.
    """
    assert _minutos("9:56") == _minutos("09:56") == 596
    assert _minutos("-----") is None
    assert _minutos("") is None


def test_o_nome_compara_se_sem_acentos_nem_pontuacao():
    assert _chave("Circuito Azul_Reforço") == _chave("circuito azul reforco")


def test_os_dias_da_semana_estao_na_ordem_do_python():
    """`DIAS[data.weekday()]`, e 21/09/2026 foi uma segunda-feira."""
    assert len(DIAS) == 7
    assert DIAS[dt.date(2026, 9, 21).weekday()] == "segunda-feira"
    assert DIAS[dt.date(2026, 9, 26).weekday()] == "sábado"


# --- a região que o usa, se estiver nesta raiz ------------------------------


def _saida_de_reservas(raiz):
    for r in carregar_todas(raiz):
        for s in r.saidas:
            if s.leitor == nome:
                return r, s
    pytest.skip(
        f"nenhuma região nesta raiz declara o leitor {nome!r} — "
        "se ela vive noutra, aponta-a com PARAGEM_RAIZES (docs/RAIZES.md)"
    )


def test_a_receita_escolhe_os_circuitos_a_mao(raiz):
    """Não se traz tudo: a página repete circuitos que as brochuras já cobrem.

    Decidir por semelhança de nome se dois circuitos são o mesmo é o juízo que
    precisa de olhos, e um engano põe o mesmo circuito duas vezes na página do
    concelho.
    """
    _, s = _saida_de_reservas(raiz)
    assert (s.params or {}).get("circuitos"), "sem `circuitos`, este leitor traz os 44"


def test_diz_que_NAO_sabe_os_dias(raiz):
    """O teste que mais vale aqui.

    Esta fonte é o horário de uma data. Publicá-la com um rótulo que sugira
    uma regra — «dias úteis», porque a data calhou numa segunda — era inventar
    a regra a partir de um exemplo (CLAUDE.md §4.4).
    """
    r, s = _saida_de_reservas(raiz)
    caminho = raiz / "build" / r.id / (s.saida or "")
    if not caminho.exists():
        pytest.skip(f"sem {caminho} — corre `uv run pipeline build --regiao {r.id}`")
    d = json.loads(caminho.read_text(encoding="utf-8"))

    data = d.get("data_do_horario")
    assert data, "o ficheiro tem de dizer de que dia é este horário"
    dia = dt.date.fromisoformat(data)

    proibidas = ("dias úteis", "dias uteis", "período escolar", "periodo escolar", "sábados")
    for q in d["quadros"]:
        regras = " ".join(q.get("regras") or []).lower()
        assert f"{dia:%d/%m/%Y}" in regras, f"{q['nome']}: a regra não diz de que dia é"
        assert "não vêm nesta fonte" in regras, f"{q['nome']}: a regra não diz que faltam os dias"
        for v in q.get("viagens", []):
            rot = str(v.get("rotulo", "")).lower()
            assert not any(x in rot for x in proibidas), (
                f"{q['nome']}: o rótulo {v['rotulo']!r} sugere uma regra que esta fonte não dá"
            )


def test_as_viagens_nao_andam_para_tras(raiz):
    r, s = _saida_de_reservas(raiz)
    caminho = raiz / "build" / r.id / (s.saida or "")
    if not caminho.exists():
        pytest.skip(f"sem {caminho}")
    d = json.loads(caminho.read_text(encoding="utf-8"))
    total = 0
    for q in d["quadros"]:
        for v in q["viagens"]:
            horas = [_minutos(h) for _, h in v["passagens"]]
            assert len(horas) >= 2, f"{q['nome']}: viagem com menos de duas paragens"
            assert all(x is not None for x in horas)
            assert horas == sorted(horas), f"{q['nome']}: {v['rotulo']} tem uma hora a recuar"
            total += 1
    assert total > 0, "o ficheiro não tem uma única viagem"


def test_nenhum_circuito_pedido_e_tambem_de_uma_brochura(raiz):
    """A duplicação que isto impede: o mesmo circuito duas vezes no concelho.

    Compara pelo nome normalizado contra TODAS as outras saídas de horário já
    construídas. Não é infalível — os nomes do sítio e das brochuras diferem
    de propósito —, mas apanha o caso fácil, que é o que alguém faz à pressa.
    """
    import glob
    import os

    r, s = _saida_de_reservas(raiz)
    base = raiz / "build" / r.id / "tap"
    if not base.exists():
        pytest.skip("sem build/<regiao>/tap")
    meu = os.path.basename(s.saida or "")
    outros = set()
    for f in glob.glob(str(base / "*.json")):
        if os.path.basename(f) == meu:
            continue
        with open(f, encoding="utf-8") as fh:
            for q in json.load(fh).get("quadros", []):
                outros.add(_chave(q.get("nome")))
    pedidos = {_chave(x) for x in ((s.params or {}).get("circuitos") or [])}
    repetidos = sorted(pedidos & outros)
    assert not repetidos, f"circuitos pedidos a esta fonte que uma brochura já traz: {repetidos}"


# --- o mesmo circuito com dois nomes ---------------------------------------


def _casa(a: str, b: str) -> bool:
    """A regra que o cruzamento usa: palavras comuns sobre o conjunto MAIOR."""
    from paragem.leitores.horarios_reservas import _palavras

    x, y = _palavras(a), _palavras(b)
    comuns = x & y
    return bool(comuns) and len(comuns) / max(len(x), len(y)) >= 0.5


@pytest.mark.parametrize(
    "a,b",
    [
        ("Intermunicipal Sertã (Moita)", "Circuito de Moita"),
        ("Intermunicipal Sertã (Fundada)", "Circuito de Fundada"),
        ("Intermunicipal Sertã (B. Ribeira)", "Circuito de B. da Ribeira"),
        ("Intermunicipal Sertã (S. J. Peso)", "Circuito de S. J. do Peso"),
        ("Assentis e Paço v/ Paço", "Assentis v/ Paço"),
        ("Assentis e Paço v/ Casais da Igreja", "Assentis v/ Casais da Igreja"),
    ],
)
def test_reconhece_o_mesmo_circuito_com_outro_nome(a, b):
    """Os dois lados não usam o mesmo nome, e nenhum deles está errado.

    O sistema de reservas escreve «Intermunicipal Sertã (Moita)»; a brochura
    escreve «Circuito de Moita». A comparação por igualdade dava seis circuitos
    «que ninguém mostra» — e os seis estavam mostrados.
    """
    assert _casa(a, b)


@pytest.mark.parametrize(
    "a,b",
    [
        # UMA palavra em comum sobre um nome de uma palavra dava 100 % quando a
        # conta era pelo conjunto menor, e punha as horas do «Circuito Azul»
        # como divergentes das da praia fluvial. Pelo maior, dá 25 %.
        ("Circuito Azul", "Praia Fluvial do Lago Azul"),
        ("Vales de Cardigos", "Vale do Rio"),
        ("Circuito Verde", "Circuito Vermelho"),
    ],
)
def test_NAO_confunde_circuitos_que_so_partilham_uma_palavra(a, b):
    assert not _casa(a, b)
