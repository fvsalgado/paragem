"""O esqueleto público sai limpo, e isso verifica-se aqui e não à mão.

O `ferramentas/esqueleto-publico.py` decide o que vai para um repositório que
qualquer pessoa lê. Um gerador desses, sem teste, é uma coisa que se corre uma
vez com atenção e nunca mais — e o dia em que alguém acrescenta uma fonte e se
engana é o dia em que ela sai publicada sem ninguém dar por isso.

O que estes testes guardam **não é o conteúdo do esqueleto**: é a REGRA. Que a
regra é privado por omissão, que as duas regiões de prova sobrevivem inteiras,
e que uma fonte de um cliente não passa por estar declarada de outra maneira.
"""

from __future__ import annotations

import importlib.util
import sys
import unicodedata

import pytest
import yaml

from conftest import RAIZ

GERADOR = RAIZ / "ferramentas" / "esqueleto-publico.py"


@pytest.fixture(scope="module")
def gerador():
    if not GERADOR.exists():
        pytest.skip("não há gerador do esqueleto público")
    spec = importlib.util.spec_from_file_location("esqueleto_publico", GERADOR)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["esqueleto_publico"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_as_regioes_de_prova_vao_inteiras(gerador):
    """Sem elas o repositório público não tem nada que construir.

    E não é só «alguma coisa»: são elas que provam o multi-região, e são a
    demonstração que se mostra a quem ainda não é cliente.
    """
    caminhos = gerador.ficheiros()
    for regiao in ("prova", "prova-municipio"):
        declaracao = [x for x in caminhos if x.startswith(f"regioes/{regiao}/")]
        dados = [x for x in caminhos if x.startswith(f"data/manual/{regiao}/")]
        assert declaracao, f"a região {regiao} ficou sem declaração"
        assert dados, f"a região {regiao} ficou sem dados"


def test_nenhuma_regiao_real_vai(gerador):
    caminhos = gerador.ficheiros()
    reais = [
        x
        for x in caminhos
        if (
            x.startswith("regioes/")
            or x.startswith("data/manual/")
            or x.startswith("data/reference/")
        )
        and "/prova" not in x
        and not x.endswith("LEIA.md")
        and "despacho-" not in x
    ]
    assert not reais, f"isto é compilação de dados de um cliente: {reais}"


def test_os_fluxos_vao_todos_e_nenhum_nomeia_uma_regiao(gerador):
    """Isto mudou de sentido, e a razão vale mais do que a afirmação.

    Antes os três não iam: dois deles nomeavam uma região real em quinze
    sítios, e um fluxo assim É do cliente tanto como os PDF dele. Depois de
    passarem a construir o que a raiz DECLARAR, são do produto — e um
    repositório público sem o fluxo que constrói as suas próprias regiões de
    demonstração é um repositório que não se sabe construir a si próprio.

    A afirmação que os guarda deixa de ser sobre o NOME do ficheiro e passa a
    ser sobre o CONTEÚDO dele, que é onde o problema estava: nenhum fluxo que
    vá para o público pode nomear uma região que não seja de prova.
    """
    caminhos = set(gerador.ficheiros())
    fluxos = sorted(x for x in caminhos if x.startswith(".github/workflows/"))
    assert len(fluxos) >= 3, f"faltam fluxos no esqueleto: {fluxos}"

    sys.path.insert(0, str(RAIZ / "pipeline" / "src"))
    from paragem.regiao import carregar_todas

    reais = [r.id for r in carregar_todas(RAIZ) if not r.id.startswith("prova")]
    for fluxo in fluxos:
        texto = (RAIZ / fluxo).read_text(encoding="utf-8")
        for ident in reais:
            assert ident not in texto, f"{fluxo} nomeia a região {ident}"


def test_a_regra_das_fontes_e_privado_por_omissao(gerador):
    """Uma fonte que não se declare nacional, e que a prova não use, NÃO passa.

    É a regra que custou duas tentativas a acertar. As duas primeiras eram de
    exclusão — tudo passa menos o que eu me lembrar de barrar —, e as duas
    deixaram passar fontes de um cliente por caminhos diferentes.
    """
    publicas = gerador.fontes_publicas()
    todas = yaml.safe_load((RAIZ / "data" / "sources.yaml").read_text(encoding="utf-8"))["fontes"]
    for f in todas:
        if f["id"] in publicas:
            assert f.get("ambito") == "nacional" or f["id"].startswith("prova-"), (
                f"{f['id']} passou sem ser nacional nem de uma região de prova"
            )


def test_o_registo_cortado_continua_a_ser_yaml_e_traz_a_prosa(gerador):
    """Cortar por linhas é o que preserva os comentários — e o que os pode partir.

    Os comentários deste ficheiro dizem porque é que uma fonte está marcada
    `nao-usar` e o que a licença não autoriza. Um `yaml.safe_dump` dava o mesmo
    YAML e perdia-os todos.
    """
    texto = gerador.registo_publico()
    d = yaml.safe_load(texto)
    assert {f["id"] for f in d["fontes"]} == gerador.fontes_publicas()
    assert sum(1 for x in texto.split("\n") if x.strip().startswith("#")) > 20


def test_o_registo_cortado_nao_nomeia_um_cliente(gerador):
    assert not gerador.MARCAS.search(gerador.registo_publico())


def _grafias(nome: str) -> list[str]:
    """O mesmo nome como sai a quem tem pressa.

    GERADAS, e não escritas à mão. Uma lista à mão tem dois defeitos: esquece-se
    de uma grafia — e é sempre a esquecida que passa —, e escreve o nome de um
    cliente mais uma dúzia de vezes no repositório que existe para o não ter.
    """
    sem = "".join(c for c in unicodedata.normalize("NFD", nome) if not unicodedata.combining(c))
    return [
        nome,
        sem,  # ← a grafia que passou
        nome.upper(),
        sem.upper(),
        nome.lower(),
        sem.lower(),
        sem.replace(" ", "-").lower(),
        sem.replace(" ", "_").upper(),
        sem.replace(" ", "").lower(),
    ]


def test_a_varredura_nao_depende_do_acento(gerador):
    """A grafia à pressa é a que passa — e foi a que passou.

    O `.github/workflows/ci.yml` tinha um comentário que escrevia o nome de um
    cliente sem o acento, num `.yml`, ou seja na categoria que esta varredura
    existe para proteger. Deixou-o ir porque a lista estava escrita só com a
    grafia certa. E a frase que ele continha avisava de um seed escrito sem
    acento: a armadilha estava descrita dentro do ficheiro que caiu nela.

    UMA OCORRÊNCIA LITERAL, e não nove. A primeira versão disto tinha as nove
    grafias escritas à mão, e fazia do ficheiro que guarda o público o segundo
    que mais nomeava o cliente. A segunda ia buscá-las às regiões declaradas —
    e PASSAVA SEM AFIRMAR NADA, porque nesta raiz só há regiões de prova e o
    ciclo saltava-as todas. Verde a verificar zero, que é o defeito que este
    ficheiro inteiro existe para apanhar.

    O nome tem de estar escrito uma vez: não se testa «isto apanha o nome
    seja como for escrito» sem o escrever. Uma é o mínimo, e as outras oito
    saem dela.
    """
    grafias = _grafias("Médio Tejo")
    assert len(grafias) == 9, "as grafias deixaram de se gerar — isto passaria a vazio"
    for grafia in grafias:
        assert gerador.MARCAS.search(grafia), f"a varredura deixa passar {grafia!r}"


def test_a_varredura_nao_apanha_palavra_comum(gerador):
    """«Meio» é palavra portuguesa, e o produto inteiro a usa.

    Pô-la na lista fazia a geração recusar-se a publicar uma página que diga
    «meio bilhete» — e a seguir alguém tirava a lista toda para destrancar a
    publicação. Quem apanha o nome de uma rede é o `check-regioes`, que
    compara as saídas de uma região com o que as OUTRAS declaram, e não um
    texto decorado aqui.
    """
    for inocente in ("meio bilhete", "a meio da viagem", "por meio de", "meio-dia"):
        assert not gerador.MARCAS.search(inocente), f"falso positivo em {inocente!r}"


def test_uma_seccao_que_ficou_sem_fontes_nao_fica_la_o_titulo(gerador):
    """Um título a apontar para o vazio, e que nomeia quem já não está cá.

    Era este o caso: o corte levava as fontes de uma rede e deixava o cabeçalho
    `# --- Rede <nome> (<Região>) ---` sozinho, a dizer exatamente o que o
    corte existe para não dizer.
    """
    linhas = gerador.registo_publico().split("\n")
    secoes = [i for i, x in enumerate(linhas) if x.lstrip().startswith("# --- ")]
    for n, i in enumerate(secoes):
        fim = secoes[n + 1] if n + 1 < len(secoes) else len(linhas)
        assert any(x.startswith("  - id: ") for x in linhas[i:fim]), (
            f"secção sem fontes: {linhas[i].strip()}"
        )


def test_gera_e_o_que_sai_esta_limpo(gerador, tmp_path):
    """De ponta a ponta. É lento e é o único que prova que isto funciona."""
    destino = tmp_path / "esqueleto"
    sys.argv = ["esqueleto-publico.py", str(destino)]
    gerador.main()

    for p in destino.rglob("*"):
        if p.is_file() and p.suffix in {".md", ".yaml", ".yml", ".toml"}:
            assert not gerador.MARCAS.search(p.read_text(encoding="utf-8", errors="ignore")), (
                f"{p.relative_to(destino)} nomeia um cliente"
            )
    # E leva com que trabalhar: sem isto, «limpo» seria uma pasta vazia.
    assert (destino / "pipeline" / "src" / "paragem" / "regiao.py").is_file()
    assert (destino / "regioes" / "prova" / "regiao.yaml").is_file()
    assert (destino / "regioes" / "prova-municipio" / "regiao.yaml").is_file()
    assert (destino / "data" / "sources.yaml").is_file()


def test_recusa_escrever_por_cima(gerador, tmp_path):
    """Isto não apaga nada por si: uma pasta com coisas lá dentro é um engano."""
    (tmp_path / "ja-tem").mkdir()
    (tmp_path / "ja-tem" / "algo.txt").write_text("não me apagues", encoding="utf-8")
    sys.argv = ["esqueleto-publico.py", str(tmp_path / "ja-tem")]
    with pytest.raises(SystemExit, match="não está vazio"):
        gerador.main()
    assert (tmp_path / "ja-tem" / "algo.txt").exists()


def test_o_esqueleto_passa_as_suas_proprias_verificacoes(gerador, tmp_path):
    """Gera-se e verifica-se, em vez de se acreditar que está bem.

    Os testes acima olham para a REGRA — que fontes passam, que regiões ficam.
    Nenhum deles olhava para o resultado, e foi por aí que entrou o defeito: a
    tabela de `docs/TERCEIROS.md` era copiada à mão para a sobreposição, quatro
    fontes entraram no registo depois de ela ter sido escrita, e o
    `check-proveniencia` do repositório público reprovava nas quatro — na
    primeira corrida dele, que é a primeira coisa que qualquer pessoa vê.

    Custa um segundo e cobre tudo o que o CI de lá vai correr sem rede.
    """
    from paragem.verificacoes import proveniencia, regioes

    destino = tmp_path / "esqueleto"
    sys.argv = ["x", str(destino)]
    gerador.main()

    prov = proveniencia(destino)
    assert prov.ok, "proveniência do esqueleto: " + "; ".join(prov.falhou)
    regs = regioes(destino, exigir_construcao=False)
    assert regs.ok, "regiões do esqueleto: " + "; ".join(regs.falhou)


def test_o_inventario_do_esqueleto_nomeia_todas_as_fontes_que_ficam(gerador):
    """A afirmação, dita à parte da verificação que a usa.

    Se a de cima reprovar, esta diz QUAIS faltam sem ser preciso ler uma lista
    de trinta linhas verdes à procura das vermelhas.
    """
    sys.path.insert(0, str(RAIZ / "pipeline" / "src"))
    from paragem.fontes import Registo

    texto = gerador.terceiros_publico()
    registo = {f.id: f for f in Registo.carregar(RAIZ)}
    devem = [
        i
        for i in gerador.fontes_publicas()
        if i in registo and registo[i].licenca != "AGPL-3.0-only"
    ]
    em_falta = [i for i in devem if f"| `{i}` |" not in texto]
    assert not em_falta, "fontes públicas fora do inventário do esqueleto: " + ", ".join(em_falta)
