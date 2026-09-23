"""Uma região: uma autoridade de transportes e o território que ela serve.

Tudo o que distingue uma região de outra está em ficheiros — `regioes/<id>/` —
e nada disto está em código. É o que permite a uma autoridade de transportes
nova entrar sem um commit, e é o que a região de prova verifica em todas as
corridas do CI.

Uma região NÃO é necessariamente uma CIM. Pela Lei n.º 52/2015 são autoridades
de transportes os municípios, as comunidades intermunicipais e as áreas
metropolitanas — daí `autoridade_de_transportes.tipo`, e daí o produto poder
ser contratado por uma câmara sozinha.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

# As contrações. A prosa do produto pendura toda daqui — «do Médio Tejo», «na
# Serra da Pedra Alta» — e nenhuma heurística acerta nos topónimos
# portugueses. Por isso a região DECLARA o artigo e o resto deriva.
_CONTRACOES: dict[str, dict[str, str]] = {
    "o": {"de": "do", "em": "no", "a": "ao", "por": "pelo", "artigo": "o"},
    "a": {"de": "da", "em": "na", "a": "à", "por": "pela", "artigo": "a"},
    "os": {"de": "dos", "em": "nos", "a": "aos", "por": "pelos", "artigo": "os"},
    "as": {"de": "das", "em": "nas", "a": "às", "por": "pelas", "artigo": "as"},
}


class ErroDeRegiao(Exception):
    """A declaração de uma região está errada ou incompleta."""


@dataclass(frozen=True)
class Caixa:
    """Uma caixa geográfica.

    É um PARÂMETRO de processamento e não um dado sobre o mundo: serve para
    recortar o OpenStreetMap e para decidir que viagens de um feed nacional
    servem esta região. O pipeline verifica que as paragens caem cá dentro e
    queixa-se das que não caem — uma paragem fora da caixa é quase sempre uma
    coordenada trocada, e uma coordenada trocada põe alguém no sítio errado.
    """

    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float

    def com_margem(self, graus: float) -> Caixa:
        return Caixa(
            self.lat_min - graus,
            self.lat_max + graus,
            self.lon_min - graus,
            self.lon_max + graus,
        )

    def contem(self, lat: float, lon: float) -> bool:
        return self.lat_min <= lat <= self.lat_max and self.lon_min <= lon <= self.lon_max

    def sobrepoe(self, outra: Caixa) -> bool:
        return not (
            self.lat_max < outra.lat_min
            or outra.lat_max < self.lat_min
            or self.lon_max < outra.lon_min
            or outra.lon_max < self.lon_min
        )


@dataclass(frozen=True)
class Concelho:
    id: str
    nome: str
    distrito: str
    dico: str
    membro: bool
    prefixo_stop_id: str | None = None
    servido_por: str | None = None


@dataclass(frozen=True)
class Saida:
    """Uma coisa que esta região constrói, e o leitor que a constrói."""

    fonte: str
    leitor: str
    saida: str | None = None
    modo: str | None = None
    papel: str | None = None
    publica: bool = True
    #: A LICENÇA DA SAÍDA, quando não é a da fonte.
    #:
    #: A de uma obra derivada não é a da entrada principal: é a soma de todas
    #: as entradas mais o que lhe pusemos em cima, e a mais exigente ganha.
    #: Um feed cujos traçados se encaminham pelo OpenStreetMap leva a partilha
    #: nos mesmos termos da ODbL, mesmo que o caderno de horários de onde saem
    #: as horas não declare licença nenhuma.
    #:
    #: NÃO SE INFERE, declara-se. Os leitores compostos puxam fontes por dentro
    #: — camadas de um geoportal, um registo do regulador, o próprio
    #: OpenStreetMap — e a declaração da receita só nomeia a principal. Inferir
    #: a partir dela dava a licença errada com ar de automática, que é pior do
    #: que não inferir. Quem constrói a região sabe o que lá entrou, e escreve-o.
    licenca: str | None = None
    leitor_especifico_da_fonte: bool = False
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class Regiao:
    id: str
    nome: str
    artigo: str
    autoridade: dict[str, Any]
    rede: dict[str, Any]
    dominio_env: str | None
    demonstracao: bool
    municipios_membros: int
    concelhos_servidos: int
    caixa: Caixa
    margem_recorte_graus: float
    modos: list[str]
    concelhos: list[Concelho]
    prefixos_externos: dict[str, str]
    tarifas: dict[str, Any]
    calendario: dict[str, Any]
    saidas: list[Saida]
    verificacoes: list[dict[str, Any]]
    # A pasta da região — `<raiz>/regioes/<id>/`.
    raiz: Path
    # Onde estão os limites administrativos desta região, se os houver. Sem
    # eles a atribuição a concelhos é pela caixa — ver `territorio.py`.
    limites: dict[str, Any] = field(default_factory=dict)
    # O transporte a pedido, se a região o declarar. Vazio é legítimo: há
    # regiões sem serviço a pedido, e uma secção vazia à espera de dados que
    # não vêm é pior do que secção nenhuma.
    a_pedido: dict[str, Any] = field(default_factory=dict)
    #: O domínio canónico em que a região responde — `mediotejo.paragem.pt`,
    #: `prova.paragem.pt`. DECLARADO, não adivinhado: «medio-tejo» →
    #: «mediotejo» é uma contração, e este projeto não adivinha contrações. É
    #: identidade da região, por isso vive aqui e não numa variável de
    #: ambiente; a base de dados do painel guarda uma cópia, e o CI confere
    #: que as duas dizem o mesmo (docs/BASE-DE-DADOS.md). Opcional enquanto
    #: o encaminhamento por host não chegar: sem ele, nada muda.
    dominio: str | None = None
    #: Nomes de paragem que os feeds de terceiros escrevem noutra língua.
    #:
    #: A interface é em português europeu (CLAUDE.md, primeira linha) e o feed
    #: pan-europeu dos expressos escreve «Tomar (Bus Station)» e «Fatima» sem
    #: acento — 37 das 91 paragens dele. Isto não é inventar um dado (§4.4): é
    #: escrever em português o nome de uma terra portuguesa, e a correção fica
    #: declarada numa tabela que se revê, não espalhada pelo código.
    nomes: dict[str, Any] = field(default_factory=dict)
    # O que entra no grafo do motor de viagens, e as viagens que esta região
    # exige que ele saiba responder. Vazio = região sem motor, o que é
    # legítimo: um feed publicado já serve para alguma coisa sem planeador.
    motor: dict[str, Any] = field(default_factory=dict)

    # --- prosa -----------------------------------------------------------

    def com(self, preposicao: str) -> str:
        """«do Médio Tejo», «na Serra da Pedra Alta», «ao Médio Tejo»."""
        return f"{_CONTRACOES[self.artigo][preposicao]} {self.nome}"

    @property
    def nome_com_artigo(self) -> str:
        return f"{_CONTRACOES[self.artigo]['artigo']} {self.nome}"

    # --- território ------------------------------------------------------

    @property
    def caixa_de_recorte(self) -> Caixa:
        """A caixa com margem.

        Há linhas que atravessam a fronteira da região. Cortá-las era servir
        meia viagem a quem a faz inteira, por isso o recorte do OSM leva
        margem.
        """
        return self.caixa.com_margem(self.margem_recorte_graus)

    @property
    def raiz_de_dados(self) -> Path:
        """A raiz de onde esta região veio — `<raiz>/regioes/<id>/` menos dois.

        É contra ESTA que os ficheiros manuais dela se resolvem. Uma região que
        viva noutro repositório traz os seus PDF consigo, e procurá-los aqui
        dava «falta data/manual/…» para um ficheiro que existe, noutro sítio.
        """
        return self.raiz.parents[1]

    @property
    def concelhos_membros(self) -> list[Concelho]:
        return [c for c in self.concelhos if c.membro]

    @property
    def concelhos_servidos_nao_membros(self) -> list[Concelho]:
        return [c for c in self.concelhos if not c.membro]

    @property
    def fontes_usadas(self) -> list[str]:
        """Todas as fontes de que esta região precisa, por ordem.

        NÃO é só as das saídas: os limites administrativos são uma fonte que
        não produz ficheiro nenhum e mesmo assim entra no pipeline — tem de
        ser descarregada, tem de ter proveniência e tem de contar para a soma
        de verificação. Esteve fora destes três sítios porque cada um deles
        tinha o seu próprio conjunto por compreensão.
        """
        ids = {s.fonte for s in self.saidas}
        if self.limites.get("fonte"):
            ids.add(str(self.limites["fonte"]))
        return sorted(ids)

    @property
    def dicos(self) -> list[str]:
        """Os códigos de concelho declarados, na ordem em que estão."""
        return [c.dico for c in self.concelhos if c.dico]

    def concelho_por_dico(self, dico: str) -> Concelho | None:
        for c in self.concelhos:
            if c.dico == dico:
                return c
        return None

    def concelho_por_prefixo(self, prefixo: str) -> Concelho | None:
        for c in self.concelhos:
            if c.prefixo_stop_id == prefixo:
                return c
        return None

    # --- carregamento ----------------------------------------------------

    @classmethod
    def carregar(cls, pasta: Path) -> Regiao:
        pasta = Path(pasta)
        d = _ler_yaml(pasta / "regiao.yaml")

        artigo = d.get("artigo")
        if artigo not in _CONTRACOES:
            raise ErroDeRegiao(
                f"{pasta.name}: o artigo tem de ser 'o', 'a', 'os' ou 'as' e é {artigo!r}. "
                "Não se adivinha: é «o» Médio Tejo e «a» Lezíria, e nenhuma regra acerta nos dois."
            )

        inclui = d.get("inclui") or {}

        def incluido(chave: str, omissao: str) -> dict[str, Any]:
            caminho = pasta / (inclui.get(chave) or omissao)
            return _ler_yaml(caminho) if caminho.exists() else {}

        dc = incluido("concelhos", "concelhos.yaml")
        concelhos = [
            Concelho(
                id=c["id"],
                nome=c["nome"],
                distrito=c.get("distrito", ""),
                dico=str(c.get("dico", "")),
                membro=bool(c.get("membro", True)),
                prefixo_stop_id=c.get("prefixo_stop_id"),
                servido_por=c.get("servido_por"),
            )
            for c in (dc.get("concelhos") or [])
        ]

        terr = d.get("territorio") or {}
        cx = terr.get("caixa") or {}
        caixa = Caixa(
            float(cx["lat_min"]), float(cx["lat_max"]), float(cx["lon_min"]), float(cx["lon_max"])
        )

        df = incluido("fontes", "fontes.yaml")
        saidas = [
            Saida(
                fonte=s["fonte"],
                leitor=s["leitor"],
                saida=s.get("saida"),
                modo=s.get("modo"),
                papel=s.get("papel"),
                publica=bool(s.get("publica", True)),
                licenca=s.get("licenca"),
                leitor_especifico_da_fonte=bool(s.get("leitor_especifico_da_fonte", False)),
                params=s.get("params") or {},
            )
            for s in (df.get("saidas") or [])
        ]

        regiao = cls(
            id=d["id"],
            nome=d["nome"],
            artigo=artigo,
            autoridade=d.get("autoridade_de_transportes") or {},
            rede=d.get("rede") or {},
            dominio_env=d.get("dominio_env"),
            dominio=(str(d["dominio"]).strip().lower() or None) if d.get("dominio") else None,
            demonstracao=bool(d.get("demonstracao", False)),
            municipios_membros=int(terr.get("municipios_membros", len(concelhos))),
            concelhos_servidos=int(terr.get("concelhos_servidos", len(concelhos))),
            caixa=caixa,
            margem_recorte_graus=float(terr.get("margem_recorte_graus", 0.0)),
            modos=list(d.get("modos") or []),
            concelhos=concelhos,
            prefixos_externos=dict(dc.get("prefixos_externos") or {}),
            tarifas=incluido("tarifas", "tarifas.yaml"),
            calendario=incluido("calendario", "calendario.yaml"),
            a_pedido=incluido("a_pedido", "a-pedido.yaml"),
            nomes=incluido("nomes", "nomes.yaml"),
            saidas=saidas,
            verificacoes=list(df.get("verificacoes") or []),
            limites=dict(df.get("limites") or {}),
            motor=dict(df.get("motor") or {}),
            raiz=pasta,
        )
        regiao._verificar()
        return regiao

    def _verificar(self) -> None:
        """As contas que não se perdoam.

        Uma contagem declarada que não bate com a lista é sempre um dos dois
        erros errado, e nenhum deles se descobre sozinho: ou a lista está
        incompleta, ou o número que o produto vai anunciar é falso. «Onze
        municípios» impresso ao lado de dez linhas é uma mentira por omissão.
        """
        if len(self.concelhos) != self.concelhos_servidos:
            raise ErroDeRegiao(
                f"{self.id}: declara servir {self.concelhos_servidos} concelhos e a lista tem "
                f"{len(self.concelhos)}."
            )
        membros = len(self.concelhos_membros)
        if membros != self.municipios_membros:
            raise ErroDeRegiao(
                f"{self.id}: declara {self.municipios_membros} municípios membros e a lista tem "
                f"{membros} com `membro: true`."
            )
        ids = [c.id for c in self.concelhos]
        if len(set(ids)) != len(ids):
            repetidos = sorted({i for i in ids if ids.count(i) > 1})
            raise ErroDeRegiao(f"{self.id}: concelhos repetidos — {', '.join(repetidos)}.")

        if self.caixa.lat_min >= self.caixa.lat_max or self.caixa.lon_min >= self.caixa.lon_max:
            raise ErroDeRegiao(f"{self.id}: a caixa geográfica está invertida ou vazia.")

        modos_usados = {s.modo for s in self.saidas if s.modo}
        desconhecidos = modos_usados - set(self.modos)
        if desconhecidos:
            raise ErroDeRegiao(
                f"{self.id}: as fontes constroem {', '.join(sorted(desconhecidos))}, que não está "
                "na lista de modos da região. Um modo que se constrói e não se declara desenha "
                "uma secção que o produto diz não ter."
            )


def _ler_yaml(caminho: Path) -> dict[str, Any]:
    if not caminho.exists():
        raise ErroDeRegiao(f"falta {caminho}")
    with open(caminho, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


# De onde mais se leem regiões, além deste repositório.
#
# UMA REGIÃO PODE NÃO ESTAR AQUI, e é de propósito. O código é livre e é para
# ser público; a compilação dos horários de uma autoridade de transportes não
# é nossa para publicar antes de ela autorizar (§11.2, Fase 5). Por isso uma
# região — a declaração, os ficheiros manuais e a proveniência deles — pode
# viver noutro repositório, privado, e entrar por aqui.
#
# O valor é uma lista de RAÍZES, separadas por `:`, cada uma com a forma
# deste repositório: `regioes/<id>/` e `data/`. Não é um caminho para uma
# pasta de regiões solta — é para que os ficheiros manuais de cada região se
# resolvam contra a raiz de onde ela veio, e não contra esta.
RAIZES_EXTRA = "PARAGEM_RAIZES"


def raizes(raiz: Path) -> list[Path]:
    """Esta raiz, e as que o ambiente acrescentar. Por esta ordem."""
    fora = [
        Path(x).expanduser().resolve()
        for x in os.environ.get(RAIZES_EXTRA, "").split(":")
        if x.strip()
    ]
    return [Path(raiz).resolve(), *[x for x in fora if x != Path(raiz).resolve()]]


def carregar_todas(raiz: Path) -> list[Regiao]:
    """Todas as regiões declaradas, por ordem de identificador.

    De todas as raízes, e não só desta — ver `RAIZES_EXTRA`.
    """
    regioes: list[Regiao] = []
    for base in raizes(raiz):
        pasta = base / "regioes"
        if not pasta.is_dir():
            continue
        regioes += [
            Regiao.carregar(p) for p in sorted(pasta.iterdir()) if (p / "regiao.yaml").exists()
        ]
    regioes.sort(key=lambda r: r.id)

    # Duas raízes com a mesma região é ambiguidade a sério: qual das duas
    # declarações vale? Rebenta em vez de escolher uma — e DIZ ONDE ESTÃO.
    #
    # Dizia só a lista dos identificadores, com os repetidos lá pelo meio. Quem
    # a lia ficava a saber que havia um choque e não onde, que é a única parte
    # que ajuda: numa montagem com raízes de fora, a resposta está num caminho
    # que a mensagem não mostrava.
    onde: dict[str, list[Path]] = {}
    for r in regioes:
        onde.setdefault(r.id, []).append(r.raiz)
    repetidos = {k: v for k, v in onde.items() if len(v) > 1}
    if repetidos:
        detalhe = "; ".join(
            f"{k!r} em {' e '.join(str(x) for x in v)}" for k, v in sorted(repetidos.items())
        )
        raise ErroDeRegiao(
            f"a mesma região está declarada em duas raízes — {detalhe}. "
            "Qual das duas declarações vale? Ver docs/RAIZES.md."
        )
    return regioes


def carregar(raiz: Path, id_regiao: str) -> Regiao:
    for base in raizes(raiz):
        pasta = base / "regioes" / id_regiao
        if (pasta / "regiao.yaml").exists():
            return Regiao.carregar(pasta)
    conhecidas = ", ".join(r.id for r in carregar_todas(raiz)) or "nenhuma"
    raise ErroDeRegiao(f"não há região {id_regiao!r}. Há: {conhecidas}.")
