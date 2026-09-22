"""O registo de proveniência, e o único sítio por onde os dados entram.

Duas coisas acontecem aqui, e é de propósito que acontecem juntas:

1. **nada se lê sem proveniência.** Uma fonte que não esteja em
   `data/sources.yaml` não tem caminho para dentro do pipeline. Não é
   burocracia: um dado sem origem não se consegue defender no dia em que
   alguém pergunte de onde veio, e nós vamos publicar horários que as pessoas
   usam para apanhar autocarros.

2. **o `acesso` de cada fonte é executável.** O CLAUDE.md §4.3 diz que o
   `mediotejo.pt` e o `meiomt.pt` bloqueiam acesso automático e que o site de
   reservas do Transporte a Pedido só se automatiza com autorização escrita da
   CIMT. Uma regra dessas escrita só em prosa quebra-se por distração, numa
   refatoração, meses depois, por alguém que nunca leu a prosa. Aqui, tentar
   descarregar uma fonte marcada `manual` ou `proibido-sem-autorizacao`
   levanta uma exceção com a razão escrita.
"""

from __future__ import annotations

import hashlib
import re
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml

# Só isto se descarrega. Tudo o resto tem de chegar por outro caminho, e a
# mensagem de erro diz qual.
ACESSO_AUTOMATICO = "automatico"
ACESSO_MANUAL = "manual"
ACESSO_LOCAL = "local"
ACESSO_NAO_USAR = "nao-usar"
ACESSO_PROIBIDO = "proibido-sem-autorizacao"
# UMA API NÃO É UM FICHEIRO, e o registo precisava da distinção.
#
# As outras marcas respondem todas à pergunta «como é que este ficheiro chega
# cá». Uma API consultada em direto não chega: é perguntada quando alguém abre
# a página, e o que ela devolve vale um minuto. Não há ficheiro para apontar,
# não há soma sha256 para guardar, e mandá-la descarregar não quer dizer nada.
#
# Fica declarada à mesma — o §4.1 diz que tudo o que entra tem proveniência
# registada, e uma API que ainda não se consome mas já se estudou é
# precisamente o que o registo existe para não deixar cair.
ACESSO_API = "api-em-direto"

_RAZOES = {
    ACESSO_MANUAL: (
        "está marcada como manual — o sítio de origem bloqueia acesso automático, ou o "
        "ficheiro só se obtém no navegador. Põe-no em {ficheiro} e volta a correr."
    ),
    ACESSO_LOCAL: "é um ficheiro local e devia estar em {ficheiro}.",
    ACESSO_NAO_USAR: "está marcada `nao-usar`. A razão está nas notas da fonte.",
    ACESSO_PROIBIDO: (
        "só se automatiza com autorização escrita, e ela não existe. Enquanto não existir, "
        "os dados entram à mão."
    ),
    ACESSO_API: (
        "é uma API consultada em direto e não um ficheiro: não se descarrega na construção. "
        "Quem a consome é o sítio, através do proxy."
    ),
}


class ErroDeFonte(Exception):
    """Uma fonte não existe, não está declarada, ou não se pode ir buscar assim."""


@dataclass(frozen=True)
class Fonte:
    id: str
    nome: str
    formato: str
    acesso: str
    url: str | None = None
    url_alternativo: str | None = None
    url_arquivo: str | None = None
    ficheiro: str | None = None
    sha256: str | None = None
    licenca: str | None = None
    licenca_nota: str | None = None
    atribuicao: str | None = None
    atribuicao_obrigatoria: bool = False
    verificado_em: date | None = None
    obtido_em: date | None = None
    notas: str | None = None
    # NACIONAL ou de uma região, e é o que decide se a declaração desta fonte
    # pode ir para um repositório público. `nacional` quer dizer que serve
    # qualquer região — o OpenStreetMap, a carta administrativa, o operador
    # ferroviário. Vazio quer dizer de uma região, que é o caso seguro: uma
    # fonte por marcar fica do lado privado, e isso vê-se e corrige-se.
    ambito: str | None = None
    # A raiz de onde esta fonte veio. É contra ELA que o `ficheiro` se
    # resolve: com uma região a viver noutro repositório, os PDF dela estão
    # lá, e procurá-los aqui dava «falta o ficheiro» para um que existe.
    raiz: Path | None = None

    @property
    def soma_bem_formada(self) -> bool:
        """Um sha256 tem 64 carateres hexadecimais. O que não tiver não protege nada."""
        return bool(self.sha256) and bool(re.fullmatch(r"[0-9a-f]{64}", self.sha256 or ""))

    @property
    def exige_atribuicao(self) -> bool:
        return bool(self.atribuicao_obrigatoria and self.atribuicao)

    @property
    def licenca_por_esclarecer(self) -> bool:
        """Uma licença que não se conhece não é uma licença permissiva.

        `nao-declarada` e `por-confirmar` dizem coisas diferentes e nenhuma
        delas diz «podes republicar». São as duas uma lacuna, e contam como
        tal no relatório.
        """
        return self.licenca in {None, "nao-declarada", "por-confirmar"}


class Registo:
    """`data/sources.yaml`, carregado."""

    def __init__(self, fontes: dict[str, Fonte], raiz: Path) -> None:
        self._fontes = fontes
        self.raiz = raiz

    def __contains__(self, id_fonte: object) -> bool:
        return id_fonte in self._fontes

    def __iter__(self):
        return iter(self._fontes.values())

    def __len__(self) -> int:
        return len(self._fontes)

    @property
    def ids(self) -> list[str]:
        return list(self._fontes)

    def obter(self, id_fonte: str) -> Fonte:
        try:
            return self._fontes[id_fonte]
        except KeyError:
            raise ErroDeFonte(
                f"a fonte {id_fonte!r} não está em data/sources.yaml. Nada entra no pipeline sem "
                "proveniência — acrescenta-a lá, com o endereço, a data, a licença e a atribuição."
            ) from None

    @classmethod
    def carregar(cls, raiz: Path) -> Registo:
        """A proveniência, de TODAS as raízes — esta e as que o ambiente traz.

        O §11.4 dizia que o `sources.yaml` é um só. Continua a ser um por
        repositório, e a regra que ele serve — NADA ENTRA SEM PROVENIÊNCIA —
        não muda: uma região que viva noutro repositório traz o registo das
        suas fontes consigo, e não entra sem ele. Ver o §11.6.

        Uma fonte declarada em duas raízes é ambiguidade a sério: qual das
        duas somas vale? Rebenta, em vez de escolher a última.
        """
        from .regiao import raizes

        fontes: dict[str, Fonte] = {}
        de_onde: dict[str, Path] = {}
        achou = False
        for base in raizes(raiz):
            caminho = base / "data" / "sources.yaml"
            if not caminho.exists():
                continue
            achou = True
            for ident, f_ in cls._de_um_ficheiro(caminho, base).items():
                if ident in fontes and de_onde[ident] != base:
                    raise ErroDeFonte(
                        f"a fonte {ident!r} está declarada em duas raízes — "
                        f"{de_onde[ident]} e {base}. Qual das duas somas vale?"
                    )
                fontes[ident] = f_
                de_onde[ident] = base
        if not achou:
            raise ErroDeFonte(f"falta {Path(raiz) / 'data' / 'sources.yaml'}")
        return cls(fontes, Path(raiz))

    @classmethod
    def _de_um_ficheiro(cls, caminho: Path, base: Path) -> dict[str, Fonte]:
        with open(caminho, encoding="utf-8") as f:
            d: dict[str, Any] = yaml.safe_load(f) or {}
        fontes: dict[str, Fonte] = {}
        for item in d.get("fontes") or []:
            f_ = Fonte(
                id=item["id"],
                nome=item.get("nome", item["id"]),
                formato=item.get("formato", "desconhecido"),
                acesso=item.get("acesso", ACESSO_MANUAL),
                url=item.get("url"),
                url_alternativo=item.get("url_alternativo"),
                url_arquivo=item.get("url_arquivo"),
                ficheiro=item.get("ficheiro"),
                sha256=_soma(item.get("sha256")),
                licenca=item.get("licenca"),
                licenca_nota=item.get("licenca_nota"),
                atribuicao=item.get("atribuicao"),
                atribuicao_obrigatoria=bool(item.get("atribuicao_obrigatoria", False)),
                verificado_em=_data(item.get("verificado_em")),
                obtido_em=_data(item.get("obtido_em")),
                notas=item.get("notas"),
                ambito=item.get("ambito"),
                raiz=base,
            )
            if f_.id in fontes:
                raise ErroDeFonte(f"a fonte {f_.id!r} está declarada duas vezes.")
            fontes[f_.id] = f_
        return fontes

    # --- ir buscar -------------------------------------------------------

    def caminho(self, id_fonte: str, *, descarregar: bool = True) -> Path:
        """O ficheiro desta fonte, em disco, pronto a ler.

        Descarrega se — e só se — a fonte estiver marcada `automatico`.
        """
        fonte = self.obter(id_fonte)

        if fonte.acesso != ACESSO_AUTOMATICO:
            if fonte.ficheiro:
                destino = (fonte.raiz or self.raiz) / fonte.ficheiro
                if destino.exists():
                    return destino
            razao = _RAZOES.get(fonte.acesso, "não se pode ir buscar automaticamente.")
            raise ErroDeFonte(
                f"a fonte {id_fonte!r} ({fonte.nome}) "
                + razao.format(ficheiro=fonte.ficheiro or "data/manual/<regiao>/")
            )

        destino = self.raiz / ".cache" / f"{id_fonte}{_extensao(fonte)}"
        if destino.exists() and not descarregar:
            return destino
        if destino.exists():
            return destino
        return self.descarregar(id_fonte)

    def descarregar(self, id_fonte: str) -> Path:
        """Vai buscar uma fonte automática, e diz por que endereço a foi buscar.

        O endereço alternativo não é um pormenor: a 19/09/2026 o
        `download.geofabrik.de` não respondeu a partir do ambiente de
        construção e o espelho respondeu. Uma corrida que silenciosamente troca
        de espelho e não o regista é uma corrida cujos dados ninguém consegue
        reproduzir.
        """
        import httpx

        fonte = self.obter(id_fonte)
        if fonte.acesso != ACESSO_AUTOMATICO:
            raise ErroDeFonte(
                f"a fonte {id_fonte!r} não é de acesso automático "
                f"({fonte.acesso}) e não se descarrega."
            )

        destino = self.raiz / ".cache" / f"{id_fonte}{_extensao(fonte)}"
        destino.parent.mkdir(parents=True, exist_ok=True)
        parcial = destino.with_suffix(destino.suffix + ".parcial")

        enderecos = [e for e in (fonte.url, fonte.url_alternativo, fonte.url_arquivo) if e]
        erros: list[str] = []
        for endereco in enderecos:
            try:
                with httpx.stream(
                    "GET", endereco, follow_redirects=True, timeout=300.0
                ) as resposta:
                    resposta.raise_for_status()
                    with open(parcial, "wb") as f:
                        for pedaco in resposta.iter_bytes(chunk_size=1 << 20):
                            f.write(pedaco)
                shutil.move(parcial, destino)
                self._registar_obtencao(id_fonte, endereco, destino)
                return destino
            except Exception as e:  # noqa: BLE001 — a razão de cada endereço interessa toda
                erros.append(f"{endereco}: {type(e).__name__}: {e}")
                parcial.unlink(missing_ok=True)

        raise ErroDeFonte(
            f"não foi possível descarregar {id_fonte!r} por nenhum dos "
            f"{len(enderecos)} endereços:\n  " + "\n  ".join(erros)
        )

    def _registar_obtencao(self, id_fonte: str, endereco: str, destino: Path) -> None:
        registo = self.raiz / ".cache" / "obtencoes.yaml"
        anterior: dict[str, Any] = {}
        if registo.exists():
            with open(registo, encoding="utf-8") as f:
                anterior = yaml.safe_load(f) or {}
        anterior[id_fonte] = {
            "endereco": endereco,
            "obtido_em": date.today().isoformat(),
            "bytes": destino.stat().st_size,
            "sha256": sha256(destino),
        }
        with open(registo, "w", encoding="utf-8") as f:
            yaml.safe_dump(anterior, f, allow_unicode=True, sort_keys=True)


def sha256(caminho: Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for pedaco in iter(lambda: f.read(1 << 20), b""):
            h.update(pedaco)
    return h.hexdigest()


def _extensao(fonte: Fonte) -> str:
    return {
        "gtfs": ".zip",
        "pdf": ".pdf",
        "osm-pbf": ".osm.pbf",
        "osm-xml": ".osm.xml",
        # Um shapefile e um GeoPackage chegam sempre dentro de um zip: a
        # extensão aqui é a do que vem pelo fio, não a do que está lá dentro.
        "shapefile": ".zip",
        "geopackage": ".zip",
    }.get(fonte.formato, "")


def _soma(v: Any) -> str | None:
    """A soma declarada, sempre como texto.

    O YAML lê `0000…0000` como o número zero, e zero é falso: um guarda que
    faça `if fonte.sha256` salta-a sem dizer nada. Converter para texto aqui
    fecha essa porta mesmo que alguém se esqueça das aspas no ficheiro.
    """
    if v is None:
        return None
    return str(v).strip().lower()


def _data(v: Any) -> date | None:
    if v is None:
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v))
