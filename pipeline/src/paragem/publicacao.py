"""Publicar o que o sítio lê: ``build/<id>/sitio/`` → o armazém, e avisar o sítio.

O sítio deixou de ser exportação estática (CLAUDE.md §11.7). As páginas
continuam a sair dos ficheiros que o ``pipeline sitio`` escreve, mas já não
os leem do disco na construção: leem-nos, a pedido, de um armazém público —
o Storage do projeto Supabase, num balde chamado ``sitio`` — e guardam a
página rendida em cache até alguém lhes dizer que os dados mudaram.

Este módulo é a metade de quem diz. Faz três coisas, por esta ordem, e a
ordem é o que torna a publicação segura:

1. **Envia o que mudou.** Compara o MD5 de cada ficheiro local com a etiqueta
   do que está no armazém e só envia o que é diferente ou novo — os mosaicos
   do mapa são 60 MB e mudam uma vez por semana, se tanto. Apaga o que
   sobra: a página de uma linha suprimida não pode continuar a existir só
   porque ninguém a foi apagar.
2. **Escreve o inventário no fim.** ``<regiao>/inventario.json`` é a lista do
   que foi publicado, com o tamanho e o MD5 de cada ficheiro. É o último a
   subir, de propósito: é o sinal de que o resto está completo, e é por ele
   que o sítio sabe, por exemplo, se a região tem mosaicos.
3. **Avisa o sítio.** ``POST /api/revalidate`` com a região, e o sítio deita
   fora as páginas dessa região. Sem aviso, as páginas continuam válidas até
   o prazo de uma hora passar — não é uma avaria, é só mais lento.

**O que isto NÃO garante.** Um pedido que chegue a meio do envio pode ler um
ficheiro novo e outro velho. A janela é a duração do envio — segundos, tirando
os mosaicos —, e as páginas só se refazem quando o aviso chega, depois de
tudo estar no ar. Uma publicação versionada, com o inventário a apontar para
a versão, fecharia a janela de vez; fica para quando fizer falta.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

import httpx

BALDE = "sitio"
INVENTARIO = "inventario.json"
MOSAICOS = "regiao.pmtiles"

#: Quanto tempo o navegador e a rede de distribuição podem guardar um ficheiro.
#: Os dados mudam por semana; uma hora é o mesmo prazo das páginas no sítio.
VALIDADE_S = 3600

TIPOS = {
    ".json": "application/json",
    ".geojson": "application/geo+json",
    ".pmtiles": "application/vnd.pmtiles",
    ".csv": "text/csv; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".zip": "application/zip",
    ".pdf": "application/pdf",
}


class ErroDePublicacao(RuntimeError):
    """Uma publicação que não se pode fazer, com a razão escrita."""


@dataclass(frozen=True)
class Ficheiro:
    """Um ficheiro a publicar: onde está aqui, e como se chama lá."""

    caminho: str  # dentro do balde: «<regiao>/partidas/tomar.json»
    origem: Path
    bytes: int
    md5: str
    tipo: str


def tipo_de(nome: str) -> str:
    """O ``Content-Type`` pela extensão. O que não se conhece vai como binário."""
    return TIPOS.get(Path(nome).suffix.lower(), "application/octet-stream")


def _md5(caminho: Path) -> str:
    h = hashlib.md5()  # uma etiqueta de conteúdo, não segurança
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def _ficheiro(regiao_id: str, relativo: str, origem: Path) -> Ficheiro:
    return Ficheiro(
        caminho=f"{regiao_id}/{relativo}",
        origem=origem,
        bytes=origem.stat().st_size,
        md5=_md5(origem),
        tipo=tipo_de(relativo),
    )


def inventariar(raiz: Path, regiao_id: str) -> list[Ficheiro]:
    """Tudo o que o sítio lê de uma região, com o nome que vai ter no balde.

    É ``build/<id>/sitio/**`` tal e qual, mais os mosaicos do mapa, que o
    ``pipeline mosaicos`` escreve noutra pasta e o mapa vai buscar como
    ``<regiao>/regiao.pmtiles``. Uma região sem mosaicos publica-se na mesma,
    e o inventário diz que não os tem.
    """
    base = raiz / "build" / regiao_id / "sitio"
    if not (base / "regiao.json").exists():
        raise ErroDePublicacao(
            f"não há nada para publicar em {base}: corre primeiro "
            f"`uv run pipeline build --regiao {regiao_id}` e "
            f"`uv run pipeline sitio --regiao {regiao_id}`"
        )
    ficheiros = [
        _ficheiro(regiao_id, p.relative_to(base).as_posix(), p)
        for p in sorted(base.rglob("*"))
        if p.is_file() and p.name != INVENTARIO
    ]
    mosaicos = raiz / "build" / regiao_id / "mosaicos" / MOSAICOS
    if mosaicos.exists():
        ficheiros.append(_ficheiro(regiao_id, MOSAICOS, mosaicos))
    return ficheiros


class Armazem(Protocol):
    """O que a publicação pede a um armazém. O Supabase é um; os testes têm outro."""

    def listar(self, prefixo: str) -> dict[str, str | None]:
        """Caminho → MD5 (ou ``None`` quando o armazém não o sabe) de tudo sob o prefixo."""

    def enviar(self, ficheiro: Ficheiro) -> None: ...

    def enviar_bytes(self, caminho: str, conteudo: bytes, tipo: str) -> None: ...

    def apagar(self, caminhos: list[str]) -> None: ...


@dataclass(frozen=True)
class Plano:
    enviar: list[Ficheiro]
    iguais: list[Ficheiro]
    apagar: list[str]


def planear(locais: list[Ficheiro], remotos: dict[str, str | None]) -> Plano:
    """O que enviar, o que já lá está igual, e o que sobra no armazém.

    Um ficheiro remoto sem MD5 conhecido envia-se outra vez: na dúvida,
    publica-se — o custo é largura de banda, e o custo do contrário é uma
    página com dados velhos que ninguém sabe que são velhos.
    """
    enviar, iguais = [], []
    for f in locais:
        if remotos.get(f.caminho) == f.md5:
            iguais.append(f)
        else:
            enviar.append(f)
    nossos = {f.caminho for f in locais}
    apagar = sorted(c for c in remotos if c not in nossos and not c.endswith("/" + INVENTARIO))
    return Plano(enviar=enviar, iguais=iguais, apagar=apagar)


@dataclass(frozen=True)
class Resultado:
    regiao: str
    enviados: int
    iguais: int
    apagados: int
    bytes_enviados: int
    #: ``None`` quando não se avisou ninguém (sem endereço do sítio);
    #: senão, se o sítio aceitou o aviso.
    avisado: bool | None


def inventario(regiao_id: str, ficheiros: list[Ficheiro], agora: datetime) -> dict[str, Any]:
    return {
        "regiao": regiao_id,
        "publicado_em": agora.astimezone(UTC).isoformat(timespec="seconds"),
        "ficheiros": {
            f.caminho.removeprefix(regiao_id + "/"): {"bytes": f.bytes, "md5": f.md5}
            for f in ficheiros
        },
    }


def publicar(
    raiz: Path,
    regiao_id: str,
    armazem: Armazem,
    avisar: Callable[[str], bool] | None = None,
    agora: datetime | None = None,
    trabalhadores: int = 8,
) -> Resultado:
    """Envia, apaga, escreve o inventário e avisa — por esta ordem."""
    locais = inventariar(raiz, regiao_id)
    plano = planear(locais, armazem.listar(regiao_id))
    # Em paralelo: são milhares de ficheiros pequenos — uma ficha por paragem —
    # e o tempo de cada envio é quase todo latência. Oito de cada vez.
    with ThreadPoolExecutor(max_workers=trabalhadores) as pool:
        for _ in pool.map(armazem.enviar, plano.enviar):
            pass
    if plano.apagar:
        armazem.apagar(plano.apagar)
    texto = json.dumps(
        inventario(regiao_id, locais, agora or datetime.now(UTC)), ensure_ascii=False, indent=1
    )
    armazem.enviar_bytes(
        f"{regiao_id}/{INVENTARIO}", (texto + "\n").encode("utf-8"), TIPOS[".json"]
    )
    avisado = avisar(regiao_id) if avisar is not None else None
    return Resultado(
        regiao=regiao_id,
        enviados=len(plano.enviar),
        iguais=len(plano.iguais),
        apagados=len(plano.apagar),
        bytes_enviados=sum(f.bytes for f in plano.enviar),
        avisado=avisado,
    )


# ---------------------------------------------------------------------------
# O Supabase Storage, pela API de objetos
# ---------------------------------------------------------------------------


class ArmazemSupabase:
    """Um balde do Storage do Supabase, falado pela API REST com a chave de serviço.

    A chave de serviço ignora as políticas de acesso: só aqui, só no pipeline,
    nunca no sítio. O sítio lê o balde pela porta pública, sem chave nenhuma.
    """

    def __init__(
        self,
        url: str,
        chave: str,
        balde: str = BALDE,
        cliente: httpx.Client | None = None,
    ) -> None:
        self.url = url.rstrip("/")
        self.balde = balde
        self.cliente = cliente or httpx.Client(timeout=httpx.Timeout(300.0, connect=30.0))
        self.cabecalhos = {"authorization": f"Bearer {chave}", "apikey": chave}

    def _falhou(self, r: httpx.Response, o_que: str) -> None:
        if r.status_code >= 400:
            raise ErroDePublicacao(f"{o_que}: HTTP {r.status_code} — {r.text[:300]}")

    def listar(self, prefixo: str) -> dict[str, str | None]:
        """Tudo sob o prefixo, pasta a pasta: a API lista um nível de cada vez."""
        achados: dict[str, str | None] = {}
        por_visitar = [prefixo.strip("/")]
        while por_visitar:
            pasta = por_visitar.pop()
            desde = 0
            while True:
                r = self.cliente.post(
                    f"{self.url}/storage/v1/object/list/{self.balde}",
                    headers=self.cabecalhos,
                    json={
                        "prefix": pasta,
                        "limit": 1000,
                        "offset": desde,
                        "sortBy": {"column": "name", "order": "asc"},
                    },
                )
                self._falhou(r, f"listar {pasta!r}")
                itens = r.json()
                for item in itens:
                    caminho = f"{pasta}/{item['name']}" if pasta else item["name"]
                    if item.get("id") is None:  # uma pasta
                        por_visitar.append(caminho)
                        continue
                    etiqueta = ((item.get("metadata") or {}).get("eTag") or "").strip('"')
                    # Um envio simples deixa o MD5 como etiqueta; um envio por
                    # partes deixa outra coisa, e aí não se sabe.
                    achados[caminho] = etiqueta if len(etiqueta) == 32 else None
                if len(itens) < 1000:
                    break
                desde += len(itens)
        return achados

    def _enviar(self, caminho: str, conteudo: Any, tipo: str) -> None:
        r = self.cliente.post(
            f"{self.url}/storage/v1/object/{self.balde}/{caminho}",
            headers={
                **self.cabecalhos,
                "content-type": tipo,
                "x-upsert": "true",
                "cache-control": f"max-age={VALIDADE_S}",
            },
            content=conteudo,
        )
        self._falhou(r, f"enviar {caminho!r}")

    def enviar(self, ficheiro: Ficheiro) -> None:
        with ficheiro.origem.open("rb") as f:
            self._enviar(ficheiro.caminho, f, ficheiro.tipo)

    def enviar_bytes(self, caminho: str, conteudo: bytes, tipo: str) -> None:
        self._enviar(caminho, conteudo, tipo)

    def apagar(self, caminhos: list[str]) -> None:
        r = self.cliente.request(
            "DELETE",
            f"{self.url}/storage/v1/object/{self.balde}",
            headers=self.cabecalhos,
            json={"prefixes": caminhos},
        )
        self._falhou(r, f"apagar {len(caminhos)} ficheiros")


def avisador_do_sitio(
    sitio: str, segredo: str, cliente: httpx.Client | None = None
) -> Callable[[str], bool]:
    """Quem chama ``/api/revalidate`` do sítio com a região que acabou de subir."""
    c = cliente or httpx.Client(timeout=30.0)
    endereco = sitio.rstrip("/") + "/api/revalidate/"

    def avisar(regiao_id: str) -> bool:
        try:
            r = c.post(
                endereco,
                headers={"authorization": f"Bearer {segredo}"},
                json={"regioes": [regiao_id]},
            )
        except httpx.HTTPError as e:
            print(f"     o sítio não respondeu ao aviso: {e}")
            return False
        if r.status_code != 200:
            print(f"     o sítio recusou o aviso: HTTP {r.status_code} — {r.text[:200]}")
            return False
        return True

    return avisar
