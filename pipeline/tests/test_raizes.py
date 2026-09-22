"""Uma região pode viver fora deste repositório, e o pipeline tem de a encontrar.

É o que permite ao código ser público e à compilação de dados de um cliente não
ser (docs/RAIZES.md). O mecanismo é uma variável — `PARAGEM_RAIZES`, caminhos
separados por `:`, como o `PATH` — e o que estes testes guardam é o contrato
dela, que tem quatro cláusulas e nenhuma é decorativa:

1. a região carrega-se de lá;
2. o registo de proveniência é a **soma** dos de todas as raízes;
3. um ficheiro que a receita nomeia resolve-se **na raiz da região** e não
   nesta — era exatamente isto que bloqueava três circuitos do transporte a
   pedido na primeira construção feita com a região de fora;
4. a mesma região, ou a mesma fonte, declarada em duas raízes é um ERRO e não
   um silêncio: «qual das duas ganhou» não é pergunta que se responda a
   adivinhar.

Provam-se a copiar uma região de prova para um sítio temporário — não o Médio
Tejo, que pode nem estar cá, e que era o erro de fazer a prova com dados de um
cliente.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from conftest import RAIZ
from paragem.fontes import ErroDeFonte, Registo
from paragem.regiao import RAIZES_EXTRA, ErroDeRegiao, carregar, carregar_todas

ID = "prova-municipio"


@pytest.fixture
def raiz_de_fora(tmp_path: Path, monkeypatch) -> Path:
    """Uma raiz com a segunda região de prova lá dentro, e mais nada."""
    fora = tmp_path / "dados-de-fora"
    (fora / "data").mkdir(parents=True)
    shutil.copytree(RAIZ / "regioes" / ID, fora / "regioes" / ID)
    shutil.copytree(RAIZ / "data" / "manual" / ID, fora / "data" / "manual" / ID)

    # Só as fontes desta região: é assim que o registo fica repartido.
    import yaml

    d = yaml.safe_load((RAIZ / "data" / "sources.yaml").read_text(encoding="utf-8"))
    minhas = [f for f in d["fontes"] if f["id"] == "prova-gtfs-savel"]
    assert minhas, "a segunda região de prova deixou de declarar a fonte dela"
    (fora / "data" / "sources.yaml").write_text(
        yaml.safe_dump({**d, "fontes": minhas}, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )

    # E o repositório deixa de a ter: senão isto não prova nada.
    so_codigo = tmp_path / "repositorio"
    (so_codigo / "data").mkdir(parents=True)
    shutil.copytree(RAIZ / "regioes" / "prova", so_codigo / "regioes" / "prova")
    shutil.copytree(RAIZ / "data" / "manual" / "prova", so_codigo / "data" / "manual" / "prova")
    restantes = [f for f in d["fontes"] if f["id"] in {"prova-osm", "prova-gtfs-rede-alta"}]
    (so_codigo / "data" / "sources.yaml").write_text(
        yaml.safe_dump({**d, "fontes": restantes}, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )

    monkeypatch.setenv(RAIZES_EXTRA, str(fora))
    return so_codigo


def test_sem_a_variavel_a_regiao_nao_existe(tmp_path, monkeypatch, raiz_de_fora):
    """E dizê-lo é a resposta certa: ela não está cá.

    Inventar uma região vazia para não falhar seria pior — daria um sítio com
    páginas sem horários nenhuns, que é a pior maneira de não ter dados.
    """
    monkeypatch.delenv(RAIZES_EXTRA, raising=False)
    with pytest.raises(ErroDeRegiao, match=ID):
        carregar(raiz_de_fora, ID)


def test_com_a_variavel_a_regiao_carrega(raiz_de_fora):
    r = carregar(raiz_de_fora, ID)
    assert r.id == ID
    assert r.nome == "Baixo Sável"
    assert {x.id for x in carregar_todas(raiz_de_fora)} == {"prova", ID}


def test_o_registo_e_a_soma_das_raizes(raiz_de_fora):
    """Duas metades, um registo. O §4.1 exige proveniência para tudo o que entra."""
    r = Registo.carregar(raiz_de_fora)
    assert "prova-osm" in r, "perdeu-se a fonte da raiz do código"
    assert "prova-gtfs-savel" in r, "perdeu-se a fonte da raiz de fora"


def test_o_ficheiro_de_uma_fonte_resolve_se_na_raiz_dela(raiz_de_fora):
    """O defeito que isto fecha: «falta o ficheiro» para um ficheiro que existe.

    A fonte declara `data/manual/prova-municipio/gtfs-savel/`, um caminho
    relativo — e relativo a quê é a pergunta toda. Resolvê-lo nesta raiz dava
    uma queixa sobre um ficheiro que está lá, a três centímetros, na outra.
    """
    caminho = Registo.carregar(raiz_de_fora).caminho("prova-gtfs-savel", descarregar=False)
    assert caminho.exists()
    assert (caminho / "stops.txt").is_file()


def test_a_mesma_regiao_em_duas_raizes_rebenta(raiz_de_fora, monkeypatch, tmp_path):
    """Duas declarações da mesma região não se resolvem por precedência."""
    segunda = tmp_path / "outra"
    shutil.copytree(
        raiz_de_fora.parent / "dados-de-fora" / "regioes" / ID, segunda / "regioes" / ID
    )
    monkeypatch.setenv(RAIZES_EXTRA, f"{raiz_de_fora.parent / 'dados-de-fora'}:{segunda}")
    with pytest.raises(ErroDeRegiao, match="duas raízes|duas vezes"):
        carregar_todas(raiz_de_fora)


def test_a_mesma_fonte_em_duas_raizes_rebenta(raiz_de_fora, monkeypatch, tmp_path):
    """Nem o registo de proveniência: duas somas para o mesmo id é ambiguidade."""
    import yaml

    segunda = tmp_path / "outra-fonte"
    (segunda / "data").mkdir(parents=True)
    d = yaml.safe_load(
        (raiz_de_fora.parent / "dados-de-fora" / "data" / "sources.yaml").read_text(
            encoding="utf-8"
        )
    )
    (segunda / "data" / "sources.yaml").write_text(
        yaml.safe_dump(d, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )
    monkeypatch.setenv(RAIZES_EXTRA, f"{raiz_de_fora.parent / 'dados-de-fora'}:{segunda}")
    with pytest.raises(ErroDeFonte, match="duas raízes"):
        Registo.carregar(raiz_de_fora)


# --- e o CI tem de saber quais são, sem as nomear ---------------------------


def test_o_ci_pergunta_quais_sao_as_regioes(raiz_de_fora, capsys):
    """O `pipeline regioes --ids`, que é o que tirou os nomes dos fluxos.

    Os fluxos diziam `--regiao <nome>` em quinze sítios. O §11.5 promete que
    uma região nova entra SEM UM COMMIT DE CÓDIGO — e com os nomes cravados ela
    entrava e não era construída, em silêncio. Isto é a peça que faltava para a
    promessa ser executável, e por isso é verificada nas duas raízes ao mesmo
    tempo: a que o repositório tem e a que a variável acrescenta.
    """
    from paragem.cli import main

    assert main(["--raiz", str(raiz_de_fora), "regioes", "--ids"]) == 0
    assert capsys.readouterr().out.split() == ["prova", ID]


def test_a_rede_viaria_e_que_separa_quem_sabe_responder_a_pe(raiz_de_fora, capsys):
    """E não o motor, que é o que parece.

    Uma região pode declarar `motor:` só com GTFS: o grafo constrói-se e
    responde a viagens, e mesmo assim não há por onde caminhar. Perguntar «tem
    motor?» punha o CI a pedir ao OTP uma caminhada sobre um mapa sem ruas, e a
    receber silêncio — que o comando dos transbordos trata como erro, e bem.
    """
    from paragem.cli import main

    main(["--raiz", str(raiz_de_fora), "regioes", "--ids", "--com-ruas"])
    com = capsys.readouterr().out.split()
    main(["--raiz", str(raiz_de_fora), "regioes", "--ids", "--sem-ruas"])
    sem = capsys.readouterr().out.split()

    assert not com, "nenhuma região de prova declara rede viária"
    assert sem == ["prova", ID]
    assert not set(com) & set(sem), "uma região não pode estar nas duas listas"


def test_a_lista_legivel_diz_de_que_raiz_vem_cada_uma(raiz_de_fora, capsys):
    """A pergunta que se faz ao montar uma raiz de fora: está a apanhar o quê?

    Antes disto, a maneira de saber era provocar um erro e ler a lista na
    mensagem dele.
    """
    from paragem.cli import main

    assert main(["--raiz", str(raiz_de_fora), "regioes"]) == 0
    linhas = {x.split()[0]: x for x in capsys.readouterr().out.strip().split("\n")}
    assert "←" not in linhas["prova"], "a região desta raiz não leva seta"
    assert "←" in linhas[ID], "a região de fora tem de dizer de onde vem"
