"""A publicação do que o sítio lê: o inventário, o plano e a ordem dos gestos."""

from __future__ import annotations

import base64
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from paragem import publicacao
from paragem.construcao import construir
from paragem.publicacao import (
    ESTADO,
    INVENTARIO,
    ArmazemSupabase,
    ErroDePublicacao,
    Ficheiro,
    estado,
    inventariar,
    planear,
    publicar,
    tipo_de,
)
from paragem.regiao import carregar


def _construcao(tmp_path: Path, com_mosaicos: bool = True) -> Path:
    sitio = tmp_path / "build" / "prova" / "sitio"
    (sitio / "partidas").mkdir(parents=True)
    (sitio / "regiao.json").write_text('{"id": "prova"}\n', encoding="utf-8")
    (sitio / "paragens.json").write_text("[]\n", encoding="utf-8")
    (sitio / "partidas" / "vila-alta.json").write_text("{}\n", encoding="utf-8")
    if com_mosaicos:
        m = tmp_path / "build" / "prova" / "mosaicos"
        m.mkdir(parents=True)
        (m / "regiao.pmtiles").write_bytes(b"PMTiles\x03" + b"\0" * 64)
    return tmp_path


class ArmazemEmMemoria:
    """Um armazém que só lembra o que lhe fizeram, pela ordem."""

    def __init__(self, existentes: dict[str, str | None] | None = None) -> None:
        self.remoto: dict[str, str | None] = dict(existentes or {})
        self.gestos: list[tuple[str, str]] = []
        self.conteudos: dict[str, bytes] = {}

    def listar(self, prefixo: str) -> dict[str, str | None]:
        self.gestos.append(("listar", prefixo))
        return {c: m for c, m in self.remoto.items() if c.startswith(prefixo + "/")}

    def enviar(self, ficheiro: Ficheiro) -> None:
        self.gestos.append(("enviar", ficheiro.caminho))
        self.remoto[ficheiro.caminho] = ficheiro.md5
        self.conteudos[ficheiro.caminho] = ficheiro.origem.read_bytes()

    def enviar_bytes(self, caminho: str, conteudo: bytes, tipo: str) -> None:
        self.gestos.append(("enviar", caminho))
        self.remoto[caminho] = None
        self.conteudos[caminho] = conteudo

    def apagar(self, caminhos: list[str]) -> None:
        for c in caminhos:
            self.gestos.append(("apagar", c))
            self.remoto.pop(c, None)


def test_inventaria_o_sitio_inteiro_e_os_mosaicos(tmp_path: Path) -> None:
    raiz = _construcao(tmp_path)
    fs = inventariar(raiz, "prova")
    assert [f.caminho for f in fs] == [
        "prova/paragens.json",
        "prova/partidas/vila-alta.json",
        "prova/regiao.json",
        "prova/regiao.pmtiles",
    ]
    por_caminho = {f.caminho: f for f in fs}
    assert por_caminho["prova/regiao.json"].tipo == "application/json"
    assert por_caminho["prova/regiao.pmtiles"].tipo == "application/vnd.pmtiles"
    assert por_caminho["prova/regiao.pmtiles"].bytes == 72
    assert len(por_caminho["prova/regiao.json"].md5) == 32


def test_sem_mosaicos_publica_se_na_mesma(tmp_path: Path) -> None:
    raiz = _construcao(tmp_path, com_mosaicos=False)
    assert "prova/regiao.pmtiles" not in {f.caminho for f in inventariar(raiz, "prova")}


def test_sem_regiao_construida_recusa_com_a_receita(tmp_path: Path) -> None:
    with pytest.raises(ErroDePublicacao, match="pipeline sitio --regiao prova"):
        inventariar(tmp_path, "prova")


def test_tipos_de_conteudo() -> None:
    assert tipo_de("x/partidas/pedra-alta.json") == "application/json"
    assert tipo_de("regiao.pmtiles") == "application/vnd.pmtiles"
    assert tipo_de("qualquer.bin") == "application/octet-stream"


def test_o_plano_envia_o_que_mudou_e_apaga_o_que_sobra(tmp_path: Path) -> None:
    raiz = _construcao(tmp_path)
    locais = inventariar(raiz, "prova")
    igual = next(f for f in locais if f.caminho == "prova/regiao.json")
    remotos = {
        "prova/regiao.json": igual.md5,  # igual: fica
        "prova/paragens.json": "0" * 32,  # mudou: vai
        "prova/regiao.pmtiles": None,  # sem etiqueta: vai, na dúvida
        "prova/linhas/999.json": "f" * 32,  # já não existe cá: apaga-se
        "prova/" + INVENTARIO: None,  # o inventário reescreve-se, não se apaga
        "prova/" + ESTADO: None,  # e o estado também
    }
    plano = planear(locais, remotos)
    assert [f.caminho for f in plano.iguais] == ["prova/regiao.json"]
    assert {f.caminho for f in plano.enviar} == {
        "prova/paragens.json",
        "prova/partidas/vila-alta.json",
        "prova/regiao.pmtiles",
    }
    assert plano.apagar == ["prova/linhas/999.json"]


def test_publica_por_esta_ordem_e_o_inventario_vai_no_fim(tmp_path: Path) -> None:
    raiz = _construcao(tmp_path)
    armazem = ArmazemEmMemoria({"prova/linhas/999.json": "f" * 32})
    avisadas: list[str] = []

    def avisar(regiao: str) -> bool:
        avisadas.append(regiao)
        return True

    agora = datetime(2026, 9, 22, 12, 0, tzinfo=UTC)
    r = publicar(raiz, "prova", armazem, avisar, agora=agora)

    assert (r.enviados, r.iguais, r.apagados) == (4, 0, 1)
    assert r.avisado is True
    assert avisadas == ["prova"]
    # Envia, apaga, e SÓ DEPOIS o inventário — é o sinal de que está completo.
    # O estado vem no fim de tudo: diz que a publicação se fez.
    assert armazem.gestos[0] == ("listar", "prova")
    assert ("apagar", "prova/linhas/999.json") in armazem.gestos
    assert armazem.gestos[-2:] == [
        ("enviar", "prova/" + INVENTARIO),
        ("enviar", "prova/" + ESTADO),
    ]
    assert armazem.gestos.index(("apagar", "prova/linhas/999.json")) < len(armazem.gestos) - 2

    inv = json.loads(armazem.conteudos["prova/" + INVENTARIO])
    assert inv["regiao"] == "prova"
    assert inv["publicado_em"] == "2026-09-22T12:00:00+00:00"
    assert set(inv["ficheiros"]) == {
        "paragens.json",
        "partidas/vila-alta.json",
        "regiao.json",
        "regiao.pmtiles",
    }
    assert inv["ficheiros"]["regiao.pmtiles"]["bytes"] == 72

    # Segunda publicação sem mudanças: nada se envia, o inventário e o estado
    # reescrevem-se — e o estado da primeira não conta como «apagado».
    r2 = publicar(raiz, "prova", armazem, None, agora=agora)
    assert (r2.enviados, r2.iguais, r2.apagados, r2.avisado) == (0, 4, 0, None)
    assert ("apagar", "prova/" + ESTADO) not in armazem.gestos


def test_o_estado_sobe_depois_do_aviso(tmp_path: Path) -> None:
    """Um painel por atualizar não atrasa as páginas de quem viaja."""
    raiz = _construcao(tmp_path)
    armazem = ArmazemEmMemoria()

    def avisar(regiao: str) -> bool:
        armazem.gestos.append(("avisar", regiao))
        return False  # o sítio recusou: o estado escreve-se na mesma

    publicar(raiz, "prova", armazem, avisar)
    assert armazem.gestos[-3:] == [
        ("enviar", "prova/" + INVENTARIO),
        ("avisar", "prova"),
        ("enviar", "prova/" + ESTADO),
    ]


def test_um_estado_json_no_disco_nao_se_publica_como_ficheiro_do_sitio(tmp_path: Path) -> None:
    """Na raiz da região o nome é da publicação; numa subpasta é um ficheiro como outro."""
    raiz = _construcao(tmp_path)
    sitio = raiz / "build" / "prova" / "sitio"
    (sitio / ESTADO).write_text('{"velho": true}\n', encoding="utf-8")
    (sitio / "partidas" / ESTADO).write_text("{}\n", encoding="utf-8")
    caminhos = {f.caminho for f in inventariar(raiz, "prova")}
    assert "prova/" + ESTADO not in caminhos
    assert "prova/partidas/" + ESTADO in caminhos


# --- o estado.json ---------------------------------------------------------

#: A lista fechada. Um campo que entre aqui sem entrar nesta lista parte o teste.
CAMPOS_DO_ESTADO = {"ultima_publicacao", "ficheiros", "bloqueios", "lacunas", "descargas"}

INSTANTE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$")


def _so_contagens(e: dict) -> None:
    """Contagens, a data, e mais nada — nenhum texto que possa trazer um nome."""
    assert set(e) <= CAMPOS_DO_ESTADO, set(e) - CAMPOS_DO_ESTADO
    assert INSTANTE.match(e["ultima_publicacao"]), e["ultima_publicacao"]
    for k, v in e.items():
        if k != "ultima_publicacao":
            assert type(v) is int and v >= 0, f"{k}: {v!r} não é uma contagem"


def _relatorio(raiz: Path, regiao: str, gravidades: list[str]) -> None:
    pasta = raiz / "build" / "reports"
    pasta.mkdir(parents=True, exist_ok=True)
    lacunas = [
        {"id": f"x.{i}", "gravidade": g, "o_que": "a Paragem do Largo não tem coordenadas"}
        for i, g in enumerate(gravidades)
    ]
    (pasta / f"{regiao}.json").write_text(
        json.dumps({"regiao": regiao, "lacunas": lacunas}), encoding="utf-8"
    )


def test_o_estado_conta_o_relatorio_e_as_descargas(tmp_path: Path) -> None:
    raiz = _construcao(tmp_path)
    _relatorio(raiz, "prova", ["bloqueia", "lacuna", "lacuna", "aviso", "aviso", "aviso"])
    (raiz / "build" / "prova" / "sitio" / "dados-abertos.json").write_text(
        json.dumps(
            [
                {"caminho": "gtfs/rede-alta.zip", "existe": True, "fonte": "Caderno da Rede"},
                {"caminho": "relatorios/relatorio.md", "existe": True},
                {"caminho": "gbfs/x.zip", "existe": False},
            ]
        ),
        encoding="utf-8",
    )
    armazem = ArmazemEmMemoria()
    agora = datetime(2026, 10, 26, 11, 32, 59, tzinfo=UTC)
    r = publicar(raiz, "prova", armazem, None, agora=agora)

    e = json.loads(armazem.conteudos["prova/" + ESTADO])
    assert e == {
        "ultima_publicacao": "2026-10-26T11:32:59+00:00",
        # os quatro de `_construcao` mais o manifesto; nem o inventário nem o estado
        "ficheiros": 5,
        "bloqueios": 1,
        "lacunas": 2,  # os avisos do relatório não são lacunas
        "descargas": 2,  # a que não existe não se oferece
    }
    assert r.estado == e
    _so_contagens(e)
    inv = json.loads(armazem.conteudos["prova/" + INVENTARIO])
    assert e["ultima_publicacao"] == inv["publicado_em"]
    assert e["ficheiros"] == len(inv["ficheiros"])
    texto = armazem.conteudos["prova/" + ESTADO].decode("utf-8")
    assert "Largo" not in texto and "Caderno" not in texto


def test_o_que_nao_se_leu_fica_de_fora_e_nao_vai_a_zero(tmp_path: Path) -> None:
    raiz = _construcao(tmp_path)
    agora = datetime(2026, 10, 26, tzinfo=UTC)
    # Sem relatório nem manifesto: sabe-se quando e quantos ficheiros, e mais nada.
    e = estado(raiz, "prova", inventariar(raiz, "prova"), agora)
    assert set(e) == {"ultima_publicacao", "ficheiros"}

    # Um relatório que não se lê não parte a publicação: fica de fora.
    (raiz / "build" / "reports").mkdir(parents=True)
    (raiz / "build" / "reports" / "prova.json").write_text("{ isto não é JSON", encoding="utf-8")
    (raiz / "build" / "prova" / "sitio" / "dados-abertos.json").write_text("[]", encoding="utf-8")
    e = estado(raiz, "prova", inventariar(raiz, "prova"), agora)
    assert set(e) == {"ultima_publicacao", "ficheiros", "descargas"}
    assert e["descargas"] == 0  # um manifesto vazio LÊ-SE: zero é o que lá está


def test_os_avisos_e_os_contactos_nao_se_inventam(tmp_path: Path) -> None:
    """Vivem na base do painel, e o pipeline não a lê: ficam de fora."""
    raiz = _construcao(tmp_path)
    _relatorio(raiz, "prova", [])
    e = estado(raiz, "prova", inventariar(raiz, "prova"), datetime(2026, 10, 26, tzinfo=UTC))
    assert "avisos_em_vigor" not in e
    assert "contactos" not in e
    assert (e["bloqueios"], e["lacunas"]) == (0, 0)


# --- com as regiões de prova, construídas de raiz ---------------------------

PROVAS = ("prova", "prova-municipio")


@pytest.fixture(scope="module")
def provas_construidas(raiz: Path, tmp_path_factory: pytest.TempPathFactory):
    """As duas regiões de prova construídas numa raiz temporária, sem tocar em build/."""
    import shutil

    from paragem import sitio

    tmp = tmp_path_factory.mktemp("raiz")
    for p in ("regioes", "data", "pyproject.toml", "REUSE.toml", "docs"):
        origem = raiz / p
        if origem.is_dir():
            shutil.copytree(origem, tmp / p)
        else:
            shutil.copy(origem, tmp / p)
    construcoes = {}
    for rid in PROVAS:
        r = carregar(tmp, rid)
        construcoes[rid] = (r, construir(tmp, r, descarregar=False))
        sitio.construir(tmp, r, tmp / "build" / rid)
    return tmp, construcoes


@pytest.mark.parametrize("rid", PROVAS)
def test_o_estado_de_uma_regiao_de_prova(provas_construidas, rid: str) -> None:
    raiz, construcoes = provas_construidas
    regiao, c = construcoes[rid]
    armazem = ArmazemEmMemoria()
    r = publicar(raiz, rid, armazem, None)

    assert armazem.gestos[-1] == ("enviar", f"{rid}/{ESTADO}")
    e = json.loads(armazem.conteudos[f"{rid}/{ESTADO}"])
    assert set(e) == CAMPOS_DO_ESTADO
    _so_contagens(e)
    assert r.estado == e

    inv = json.loads(armazem.conteudos[f"{rid}/{INVENTARIO}"])
    assert e["ultima_publicacao"] == inv["publicado_em"]
    assert e["ficheiros"] == len(inv["ficheiros"]) == r.enviados

    cont = c.relatorio.contagem_por_gravidade()
    assert (e["bloqueios"], e["lacunas"]) == (cont["bloqueia"], cont["lacuna"])
    assert e["bloqueios"] == 0, "uma região de prova constrói-se sem bloqueios"

    manifesto = json.loads(
        (raiz / "build" / rid / "sitio" / "dados-abertos.json").read_text(encoding="utf-8")
    )
    assert e["descargas"] == len(manifesto) > 0

    # Nem o nome da região, nem o da rede, nem o de uma paragem.
    texto = armazem.conteudos[f"{rid}/{ESTADO}"].decode("utf-8")
    paragens = json.loads(
        (raiz / "build" / rid / "sitio" / "paragens.json").read_text(encoding="utf-8")
    )
    nomes = [regiao.nome, regiao.rede.get("nome"), *(p["nome"] for p in paragens)]
    assert not [n for n in nomes if n and n in texto]


# --- o armazém a sério, contra uma API de brincar --------------------------


def _api_de_brincar(pedidos: list[httpx.Request]) -> httpx.MockTransport:
    """Um Storage com uma pasta, uma subpasta e uma página de listagem cheia."""

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        if pedido.url.path == "/storage/v1/object/list/sitio":
            corpo = json.loads(pedido.content)
            prefixo, desde = corpo["prefix"], corpo["offset"]
            if prefixo == "prova":
                itens = [
                    {"name": "partidas", "id": None, "metadata": None},
                    {"name": "regiao.json", "id": "1", "metadata": {"eTag": '"' + "a" * 32 + '"'}},
                    {"name": "grande.bin", "id": "2", "metadata": {"eTag": '"abc-3"'}},
                ]
            elif prefixo == "prova/partidas":
                # 1000 na primeira página, 1 na segunda: a paginação tem de andar.
                todos = [
                    {"name": f"{i}.json", "id": str(i), "metadata": {"eTag": '"' + "b" * 32 + '"'}}
                    for i in range(1001)
                ]
                itens = todos[desde : desde + 1000]
            else:
                itens = []
            return httpx.Response(200, json=itens)
        if pedido.method == "POST" and pedido.url.path.startswith("/storage/v1/object/sitio/"):
            return httpx.Response(200, json={"Key": pedido.url.path})
        if pedido.method == "DELETE":
            return httpx.Response(200, json=[])
        return httpx.Response(404, text="não há")

    return httpx.MockTransport(responder)


def test_lista_pasta_a_pasta_e_pagina_a_pagina() -> None:
    pedidos: list[httpx.Request] = []
    armazem = ArmazemSupabase(
        "https://x.supabase.co", "chave", cliente=httpx.Client(transport=_api_de_brincar(pedidos))
    )
    achados = armazem.listar("prova")
    assert achados["prova/regiao.json"] == "a" * 32
    assert achados["prova/grande.bin"] is None  # etiqueta de envio por partes: não se sabe
    assert len([c for c in achados if c.startswith("prova/partidas/")]) == 1001
    assert all(pedido.headers["apikey"] == "chave" for pedido in pedidos)


def test_o_envio_leva_upsert_tipo_e_validade(tmp_path: Path) -> None:
    pedidos: list[httpx.Request] = []
    armazem = ArmazemSupabase(
        "https://x.supabase.co", "chave", cliente=httpx.Client(transport=_api_de_brincar(pedidos))
    )
    raiz = _construcao(tmp_path)
    f = next(x for x in inventariar(raiz, "prova") if x.caminho.endswith("regiao.json"))
    armazem.enviar(f)
    p = pedidos[-1]
    assert p.url.path == "/storage/v1/object/sitio/prova/regiao.json"
    assert p.headers["x-upsert"] == "true"
    assert p.headers["content-type"] == "application/json"
    assert p.headers["cache-control"] == f"max-age={publicacao.VALIDADE_S}"
    assert p.headers["authorization"] == "Bearer chave"
    assert p.content == b'{"id": "prova"}\n'

    armazem.apagar(["prova/linhas/999.json"])
    assert pedidos[-1].method == "DELETE"
    assert json.loads(pedidos[-1].content) == {"prefixes": ["prova/linhas/999.json"]}


def test_uma_chave_nova_vai_so_no_apikey() -> None:
    # Num `Authorization: Bearer`, o Supabase lê-a como JWT, falha, e a escrita
    # é recusada pelas políticas de acesso: foi assim que a primeira
    # publicação com uma chave nova falhou.
    pedidos: list[httpx.Request] = []
    armazem = ArmazemSupabase(
        "https://x.supabase.co",
        "sb_secret_abc",
        cliente=httpx.Client(transport=_api_de_brincar(pedidos)),
    )
    armazem.enviar_bytes("prova/regiao.json", b"{}", "application/json")
    p = pedidos[-1]
    assert p.headers["apikey"] == "sb_secret_abc"
    assert "authorization" not in p.headers


def _jwt(papel: str) -> str:
    corpo = base64.urlsafe_b64encode(json.dumps({"role": papel}).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJIUzI1NiJ9.{corpo}.assinatura"


def test_o_tipo_da_chave_diz_a_publica_por_engano() -> None:
    assert publicacao.tipo_da_chave("sb_secret_abc") == "secreta"
    assert publicacao.tipo_da_chave("sb_publishable_abc") == "publica"
    assert publicacao.tipo_da_chave(_jwt("service_role")) == "servico"
    assert publicacao.tipo_da_chave(_jwt("anon")) == "anonima"
    assert publicacao.tipo_da_chave("chave") == "desconhecida"
    assert publicacao.tipo_da_chave("a.b.c") == "desconhecida"
    # A antiga continua a ir nos dois cabeçalhos, como sempre foi.
    assert set(publicacao.cabecalhos_da_chave(_jwt("service_role"))) == {"apikey", "authorization"}


def test_um_erro_do_armazem_diz_o_que_falhou() -> None:
    def responder(pedido: httpx.Request) -> httpx.Response:
        return httpx.Response(403, text="new row violates row-level security policy")

    armazem = ArmazemSupabase(
        "https://x.supabase.co",
        "chave",
        cliente=httpx.Client(transport=httpx.MockTransport(responder)),
    )
    with pytest.raises(ErroDePublicacao, match="listar 'prova': HTTP 403 — new row"):
        armazem.listar("prova")


def test_o_aviso_ao_sitio_diz_a_regiao_e_leva_o_segredo() -> None:
    pedidos: list[httpx.Request] = []

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        return httpx.Response(200, json={"revalidated": ["regiao:prova"]})

    avisar = publicacao.avisador_do_sitio(
        "https://www.exemplo.pt/",
        "segredo",
        cliente=httpx.Client(transport=httpx.MockTransport(responder)),
    )
    assert avisar("prova") is True
    assert str(pedidos[0].url) == "https://www.exemplo.pt/api/revalidate/"
    assert pedidos[0].headers["authorization"] == "Bearer segredo"
    assert json.loads(pedidos[0].content) == {"regioes": ["prova"]}

    def recusar(pedido: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"erro": "não autorizado"})

    avisar = publicacao.avisador_do_sitio(
        "https://www.exemplo.pt",
        "errado",
        cliente=httpx.Client(transport=httpx.MockTransport(recusar)),
    )
    assert avisar("prova") is False
