"""A publicação do que o sítio lê: o inventário, o plano e a ordem dos gestos."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from paragem import publicacao
from paragem.publicacao import (
    INVENTARIO,
    ArmazemSupabase,
    ErroDePublicacao,
    Ficheiro,
    inventariar,
    planear,
    publicar,
    tipo_de,
)


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
    assert tipo_de("x/partidas/tomar.json") == "application/json"
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
    assert armazem.gestos[0] == ("listar", "prova")
    assert ("apagar", "prova/linhas/999.json") in armazem.gestos
    assert armazem.gestos[-1] == ("enviar", "prova/" + INVENTARIO)
    assert armazem.gestos.index(("apagar", "prova/linhas/999.json")) < len(armazem.gestos) - 1

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

    # Segunda publicação sem mudanças: nada se envia, o inventário reescreve-se.
    r2 = publicar(raiz, "prova", armazem, None, agora=agora)
    assert (r2.enviados, r2.iguais, r2.apagados, r2.avisado) == (0, 4, 0, None)


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
