"""A separação parte o repositório em dois, e nada cai no meio.

O `esqueleto-publico.py` responde «o que se pode publicar» e o
`raiz-da-regiao.py` responde «o que é desta região». São a mesma decisão vista
dos dois lados, e por isso podem discordar — e o modo de falhar é sempre o
mesmo: um ficheiro que nenhum dos dois reclama DESAPARECE na separação, sem
mensagem nenhuma, porque cada gerador assume que o outro o levou.

Aconteceu, e foi assim que isto nasceu: o esqueleto excluía `ferramentas/`
inteiro e o `ci.yml` corre de lá o `verificar-seeds.py`. O repositório público
saía com um fluxo a chamar um ficheiro que não estava lá — e reprovava na
primeira corrida, antes de alguém ter escrito uma linha.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys

import pytest

from conftest import RAIZ

ESQUELETO = RAIZ / "ferramentas" / "esqueleto-publico.py"
RAIZ_DA_REGIAO = RAIZ / "ferramentas" / "raiz-da-regiao.py"


# A região cujo corte se verifica: a que existe nesta raiz e não é de prova.
#
# Pela PROPRIEDADE e não pelo nome (§11.6): quando a compilação de dados do
# cliente sair deste repositório, este módulo salta com a razão escrita em vez
# de reprovar — e sem nomear ninguém.
def _regiao_a_cortar() -> str | None:
    sys.path.insert(0, str(RAIZ / "pipeline" / "src"))
    from paragem.regiao import carregar_todas

    reais = [
        r.id
        for r in carregar_todas(RAIZ)
        if not r.id.startswith("prova") and r.raiz.is_relative_to(RAIZ)
    ]
    return reais[0] if reais else None


def _carregar(caminho, nome):
    spec = importlib.util.spec_from_file_location(nome, caminho)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[nome] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def geradores():
    if not (ESQUELETO.exists() and RAIZ_DA_REGIAO.exists()):
        pytest.skip("não há os dois geradores da separação")
    if _regiao_a_cortar() is None:
        pytest.skip("não há região nesta raiz para cortar — a separação já foi feita")
    return _carregar(ESQUELETO, "esqueleto_publico"), _carregar(RAIZ_DA_REGIAO, "raiz_da_regiao")


def _tudo() -> list[str]:
    saida = subprocess.run(
        ["git", "-C", str(RAIZ), "ls-files"], capture_output=True, text=True, check=True
    ).stdout
    return [x for x in saida.split("\n") if x]


def test_nenhum_ficheiro_fica_para_tras(geradores):
    """A soma dos dois lados, mais a maquinaria, é o repositório inteiro."""
    esqueleto, raiz_da_regiao = geradores
    publicos = set(esqueleto.ficheiros())
    da_regiao = set(raiz_da_regiao.ficheiros(_regiao_a_cortar()))
    maquinaria = {x for x in _tudo() if raiz_da_regiao.MAQUINARIA.match(x)}

    perdidos = sorted(set(_tudo()) - publicos - da_regiao - maquinaria)
    assert not perdidos, (
        "estes ficheiros não vão para o repositório público NEM com a região, e\n"
        "nenhum gerador os reclama — desapareciam na separação:\n  " + "\n  ".join(perdidos)
    )


def test_nenhum_ficheiro_vai_aos_dois(geradores):
    """Um ficheiro nos dois lados é uma cópia que diverge na primeira semana."""
    esqueleto, raiz_da_regiao = geradores
    repetidos = sorted(
        set(esqueleto.ficheiros()) & set(raiz_da_regiao.ficheiros(_regiao_a_cortar()))
    )
    assert not repetidos, "vão aos dois lados: " + ", ".join(repetidos)


def test_a_maquinaria_do_corte_nao_vai_a_lado_nenhum(geradores):
    """Os geradores morrem com a separação: o público É o esqueleto."""
    esqueleto, raiz_da_regiao = geradores
    ambos = set(esqueleto.ficheiros()) | set(raiz_da_regiao.ficheiros(_regiao_a_cortar()))
    for f in ("ferramentas/esqueleto-publico.py", "ferramentas/raiz-da-regiao.py"):
        assert f not in ambos, f"{f} é a maquinaria do corte e não sobrevive a ele"


def test_o_ci_do_publico_tem_o_que_chama(geradores):
    """O defeito que deu origem a este módulo, guardado pelo nome.

    Um fluxo do repositório público que chame um ficheiro que não foi é um CI
    que reprova na primeira corrida — e a primeira corrida de um repositório
    público é a primeira coisa que qualquer pessoa vê dele.
    """
    esqueleto, _ = geradores
    publicos = set(esqueleto.ficheiros())
    for fluxo in [x for x in publicos if x.startswith(".github/workflows/")]:
        texto = (RAIZ / fluxo).read_text(encoding="utf-8")
        for chamado in set(__import__("re").findall(r"(ferramentas/[\w.-]+\.py)", texto)):
            assert chamado in publicos, f"{fluxo} corre {chamado}, que não vai para o público"


def test_as_fontes_somam_ao_registo_inteiro(geradores):
    """Uma fonte em nenhum dos dois lados é uma linha de proveniência apagada.

    O §4.1 não admite nenhuma: tudo o que entra tem de ter origem registada, e
    o corte não é desculpa para a perder.
    """
    esqueleto, raiz_da_regiao = geradores
    sys.path.insert(0, str(RAIZ / "pipeline" / "src"))
    from paragem.fontes import Registo

    todas = {f.id for f in Registo.carregar(RAIZ)}
    publicas = esqueleto.fontes_publicas()
    da_raiz = raiz_da_regiao.fontes_da_raiz()
    assert publicas | da_raiz == todas, f"perdidas: {sorted(todas - publicas - da_raiz)}"
    assert not (publicas & da_raiz), f"nos dois registos: {sorted(publicas & da_raiz)}"


def test_uma_regiao_de_prova_nao_se_arranca(geradores, tmp_path):
    """São elas que provam o multi-região e são a demonstração pública."""
    _, raiz_da_regiao = geradores
    with pytest.raises(SystemExit, match="região de prova"):
        sys.argv = ["x", "prova", str(tmp_path / "x")]
        raiz_da_regiao.main()


def test_o_inventario_da_raiz_nao_lista_o_que_e_nosso(geradores):
    """`docs/TERCEIROS.md` é o inventário do que NÃO é nosso.

    As tabelas de decisão manual são entrada da casa, sob a licença do código
    (§11.8). Listá-las ali dizia que eram de outrem.
    """
    _, raiz_da_regiao = geradores
    sys.path.insert(0, str(RAIZ / "pipeline" / "src"))
    from paragem.fontes import Registo

    texto = raiz_da_regiao.terceiros_da_raiz()
    nossas = [
        f.id
        for f in Registo.carregar(RAIZ)
        if f.licenca == "AGPL-3.0-only" and f.id in raiz_da_regiao.fontes_da_raiz()
    ]
    assert nossas, "o caso não se está a testar: nenhuma fonte da raiz é nossa"
    for ident in nossas:
        assert f"| `{ident}` |" not in texto, f"{ident} é nossa e está no inventário de terceiros"
