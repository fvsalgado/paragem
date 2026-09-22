"""A região de prova: a demonstração, e a prova executável do multi-região.

Se estes testes falharem, o produto deixou de conseguir receber uma autoridade
de transportes nova sem escrever código — que é a promessa comercial inteira.
"""

import json
from pathlib import Path

from conftest import regiao_ou_salta
from paragem.construcao import construir
from paragem.gtfs import Gtfs
from paragem.leitores import ESPECIFICOS_DA_FONTE, GENERICOS
from paragem.regiao import carregar
from paragem.verificacoes import proveniencia, regioes


def _estragar_soma(raiz: Path, id_fonte: str, valor: str) -> None:
    """Troca a soma declarada de uma fonte, para provar que o guarda a apanha."""
    fontes = raiz / "data" / "sources.yaml"
    linhas = fontes.read_text(encoding="utf-8").splitlines()
    alvo = next(
        i
        for i, x in enumerate(linhas)
        if x.strip().startswith("sha256:")
        and any(f"id: {id_fonte}" in y for y in linhas[max(0, i - 10) : i])
    )
    linhas[alvo] = f"    sha256: {valor}"
    fontes.write_text("\n".join(linhas) + "\n", encoding="utf-8")


def _copiar_repo(raiz: Path, destino: Path) -> None:
    import os
    import shutil

    for p in ("regioes", "data", "pyproject.toml", "REUSE.toml", "docs"):
        origem = raiz / p
        if origem.is_dir():
            shutil.copytree(origem, destino / p)
        else:
            shutil.copy(origem, destino / p)
    os.makedirs(destino / "build", exist_ok=True)


def _construir(raiz, tmp_path, monkeypatch):
    """Constrói a prova para uma raiz temporária, sem tocar em build/."""
    _copiar_repo(raiz, tmp_path)
    return construir(tmp_path, carregar(tmp_path, "prova"), descarregar=False)


def test_a_prova_constroi_sem_bloqueios(raiz, tmp_path, monkeypatch):
    c = _construir(raiz, tmp_path, monkeypatch)
    assert not c.relatorio.tem_bloqueios, [x.o_que for x in c.relatorio.bloqueios]


def test_a_prova_nasce_sem_codigo_novo(raiz):
    """O contrato: uma região nova entra sem uma linha de Python."""
    p = regiao_ou_salta("prova")
    assert {s.leitor for s in p.saidas} <= GENERICOS
    assert not {s.leitor for s in p.saidas} & ESPECIFICOS_DA_FONTE


def test_a_prova_produz_as_quatro_saidas(raiz, tmp_path, monkeypatch):
    c = _construir(raiz, tmp_path, monkeypatch)
    assert set(c.relatorio.saidas) == {
        "gtfs/rede-alta.zip",
        "gbfs/altabike/",
        "geojson/taxis.geojson",
        "geojson/urbanos.geojson",
    }


def test_o_gtfs_da_prova_sai_completo(raiz, tmp_path, monkeypatch):
    c = _construir(raiz, tmp_path, monkeypatch)
    feed = Gtfs.ler(c.destino / "gtfs" / "rede-alta.zip")
    assert len(feed.routes) == 2
    assert len(feed.trips) == 5
    assert len(feed.stops) == 8
    assert min(feed.paragens_por_viagem().values()) >= 2


def test_o_gbfs_nao_promete_disponibilidade(raiz, tmp_path, monkeypatch):
    """Sem `station_status`: o que o produto não sabe, não promete."""
    c = _construir(raiz, tmp_path, monkeypatch)
    pasta = c.destino / "gbfs" / "altabike"
    assert not (pasta / "station_status.json").exists()
    descoberta = json.loads((pasta / "gbfs.json").read_text(encoding="utf-8"))
    nomes = {f["name"] for f in descoberta["data"]["pt"]["feeds"]}
    assert nomes == {"system_information", "station_information"}
    estacoes = json.loads((pasta / "station_information.json").read_text(encoding="utf-8"))
    assert len(estacoes["data"]["stations"]) == 3, "a OutraBike não é da rede"


def test_a_atribuicao_do_osm_vai_no_ficheiro(raiz, tmp_path, monkeypatch):
    """Um rodapé esquece-se numa refatoração; um campo viaja com o ficheiro."""
    c = _construir(raiz, tmp_path, monkeypatch)
    for f in ("geojson/taxis.geojson", "geojson/urbanos.geojson"):
        d = json.loads((c.destino / f).read_text(encoding="utf-8"))
        assert "OpenStreetMap" in d["attribution"]
        assert "opendatacommons.org" in d["license"]
    sistema = json.loads(
        (c.destino / "gbfs" / "altabike" / "system_information.json").read_text(encoding="utf-8")
    )
    assert "OpenStreetMap" in sistema["data"]["attribution_organization_name"]


def test_o_filtro_de_rotas_e_pelo_operador(raiz, tmp_path, monkeypatch):
    """Duas relações com a mesma rede, operadores diferentes. Só uma passa.

    É a armadilha do TUT em miniatura: `network=TUT` também é dos urbanos de
    Torres Vedras, a 130 km.
    """
    c = _construir(raiz, tmp_path, monkeypatch)
    d = json.loads((c.destino / "geojson" / "urbanos.geojson").read_text(encoding="utf-8"))
    assert len(d["features"]) == 1
    assert d["features"][0]["properties"]["operador"] == "C.M. Pedra Alta"


def test_a_lacuna_dos_feriados_municipais_aparece(raiz, tmp_path, monkeypatch):
    """Uma lacuna que desaparece do relatório é pior do que uma lacuna."""
    c = _construir(raiz, tmp_path, monkeypatch)
    ids = {x.id for x in c.relatorio.lacunas}
    assert "calendario.feriados-municipais" in ids


def test_as_verificacoes_do_ci_passam(raiz):
    assert proveniencia(raiz).ok
    assert regioes(raiz, exigir_construcao=False).ok


def test_o_feed_da_prova_passa_no_validador(raiz, tmp_path, monkeypatch):
    """A região de prova é a demonstração. Uma demonstração com erros não demonstra nada.

    Este teste existe por um defeito concreto: o `agency_url` da Rede Alta era
    `https://rede-alta.example`, e o validador recusa o `.example` sozinho como
    endereço inválido. A construção passava na mesma — porque sem jar o
    validador não corre e fica só um aviso —, e o defeito só apareceu quando
    alguém correu o `pipeline validate` à mão.

    Salta-se quando não há validador: um teste que não pode verificar tem de o
    dizer, não fingir que verificou.
    """
    import pytest

    from paragem import validador

    try:
        validador.java()
        validador.jar(raiz)
    except Exception as e:  # noqa: BLE001 — qualquer razão é razão para saltar
        pytest.skip(f"sem validador: {e}")

    c = _construir(raiz, tmp_path, monkeypatch)
    relatorio = validador.validar(raiz, c.destino / "gtfs" / "rede-alta.zip")
    erros = [n for n in relatorio.get("notices", []) if n["severity"] == "ERROR"]
    assert erros == [], [(n["code"], n["sampleNotices"][:2]) for n in erros]


def test_uma_soma_diferente_nao_passa_em_silencio(raiz, tmp_path, monkeypatch):
    """O `SECURITY.md` promete isto. Uma promessa de segurança por cumprir é
    pior do que nenhuma: dá a quem a lê a ideia de que está coberto.

    Prova-se estragando a soma declarada de propósito e exigindo que a
    construção dê por isso.
    """
    _copiar_repo(raiz, tmp_path)

    # A soma a estragar tem de ser a de uma fonte que ESTA região usa. A
    # primeira versão deste teste estragava a primeira que encontrava no
    # ficheiro — que é do Médio Tejo — e passava por engano.
    _estragar_soma(tmp_path, "prova-osm", '"' + "f" * 64 + '"')

    c = construir(tmp_path, carregar(tmp_path, "prova"), descarregar=False)
    somas = [x for x in c.relatorio.lacunas if x.id.endswith(".soma")]
    assert somas, "uma soma trocada tem de dar lacuna"
    assert any("ffff" in q for x in somas for q in x.quais)


def test_exigir_validador_transforma_o_silencio_em_bloqueio(raiz, tmp_path, monkeypatch):
    """Sem esta bandeira, o CI ficou verde sem ter validado nada.

    Aconteceu mesmo, na primeira corrida: o endereço do jar estava errado — o
    README do projeto diz `gtfs-validator-vX.X.X-cli.jar` e a workflow de
    publicação deles usa `version-without-v` —, a descarga deu 404, e o único
    sinal foi uma linha no meio do registo a dizer «o validador não correu».
    Tudo o resto ficou verde.

    Uma corrida verde em que a verificação que interessa não aconteceu é pior
    do que uma vermelha: parece que está tudo bem.
    """
    from paragem import validador

    def recusar(*_a, **_k):
        raise validador.ValidadorIndisponivel("a fingir que não há validador")

    monkeypatch.setattr(validador, "validar", recusar)
    _copiar_repo(raiz, tmp_path)

    tolerante = construir(tmp_path, carregar(tmp_path, "prova"), descarregar=False)
    assert not tolerante.tem_bloqueios_do_validador()

    exigente = construir(
        tmp_path, carregar(tmp_path, "prova"), descarregar=False, exigir_validador=True
    )
    assert exigente.tem_bloqueios_do_validador()
