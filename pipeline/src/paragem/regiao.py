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

from .marca import MarcaInvalida, validar_cor, validar_logotipo

# As contrações. A prosa do produto pendura toda daqui — «do Baixo Sável», «na
# Serra da Pedra Alta» — e nenhuma heurística acerta nos topónimos
# portugueses. Por isso a região DECLARA o artigo e o resto deriva.
_CONTRACOES: dict[str, dict[str, str]] = {
    "o": {"de": "do", "em": "no", "a": "ao", "por": "pelo", "artigo": "o"},
    "a": {"de": "da", "em": "na", "a": "à", "por": "pela", "artigo": "a"},
    "os": {"de": "dos", "em": "nos", "a": "aos", "por": "pelos", "artigo": "os"},
    "as": {"de": "das", "em": "nas", "a": "às", "por": "pelas", "artigo": "as"},
}


def prosa_de_operador(nome: Any, artigo: Any) -> dict[str, str]:
    """«pela …» e «da …» de um operador, quando o artigo dele está declarado.

    Serve a rede da região (`rede.operador_artigo`) e os feeds de outros
    operadores, que o declaram na receita (`params.operador_artigo`). Sem
    artigo, nada: «Horários de CP» é o que sai de adivinhar.
    """
    if artigo not in _CONTRACOES or not nome:
        return {}
    return {
        "operador_por": f"{_CONTRACOES[artigo]['por']} {nome}",
        "operador_de": f"{_CONTRACOES[artigo]['de']} {nome}",
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
class UrbanoDaRede:
    """Uma rede urbana que a REDE PRÓPRIA opera — os urbanos de uma cidade.

    O modo «urbano municipal» era só o que corria à margem da concessão: as
    redes das câmaras, lidas dos cartazes e do OpenStreetMap. Mas há
    concessões que operam elas próprias os urbanos das cidades, com número de
    linha no caderno como as outras — e para quem mora lá são «o urbano». A
    página do concelho dizia «sem registo neste concelho: urbano municipal» e,
    logo abaixo, listava as linhas do urbano da cidade.

    DECLARADO, não adivinhado (`rede.urbanos` no `regiao.yaml`): o produto não
    decide pelo nome de uma linha que ela é urbana. `linhas` são os números
    das linhas no feed próprio (`route_short_name`), como o público as
    conhece; `concelho` é o da cidade que a rede serve.
    """

    nome: str
    concelho: str
    linhas: tuple[str, ...]


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
    #: A de uma obra derivada não é a da entrada principal. Uma saída que deriva
    #: SÓ do OpenStreetMap, pela mão de um leitor que a fonte não deixa ver —
    #: uma lista de estações em que só a posição vem do mapa, por exemplo —, é
    #: ODbL e declara-o aqui.
    #:
    #: O QUE ISTO NÃO FAZ é relicenciar dados de terceiros. Esteve escrito que
    #: «a partilha nos mesmos termos da ODbL ganha a tudo o que entra», e com
    #: isso feeds com os horários de uma operadora, as paragens de uma
    #: autoridade de transportes e os cartazes de uma câmara saíam rotulados
    #: ODbL. A ODbL obriga quem usa o OpenStreetMap; não dá a ninguém direitos
    #: sobre os dados dos outros, que ninguém nos autorizou a reutilizar. Uma
    #: saída que junta os dois fica «para consulta» (o rótulo por omissão), e a
    #: parte que veio do mapa diz-se em `partes_odbl`.
    #:
    #: NÃO SE INFERE, declara-se. Os leitores compostos puxam fontes por dentro
    #: — camadas de um geoportal, um registo do regulador, o próprio
    #: OpenStreetMap — e a declaração da receita só nomeia a principal. Inferir
    #: a partir dela dava a licença errada com ar de automática, que é pior do
    #: que não inferir. Quem constrói a região sabe o que lá entrou, e escreve-o.
    licenca: str | None = None
    #: A PARTE DO OPENSTREETMAP numa saída que não é toda dele — «os traçados
    #: encaminhados pelo OpenStreetMap», «as coordenadas das estações». A saída
    #: continua para consulta; esta parte é ODbL, e a atribuição vai dentro do
    #: ficheiro e ao lado dele na página de dados abertos. Declara-se, como a
    #: licença: o leitor sabe o que puxou, a receita é que o diz.
    partes_odbl: str | None = None
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
    #: O domínio canónico em que a região responde — `meio.paragem.pt`,
    #: `prova.paragem.pt`. DECLARADO, não adivinhado: do identificador de uma
    #: região real não se tira o subdomínio dela, que foi primeiro o nome da
    #: rede e depois uma contração do território — e este projeto não adivinha
    #: contrações.
    #: É identidade da região, por isso vive aqui e não numa variável de
    #: ambiente: é também o LOGÓTIPO dela, desenhado em feixe (CLAUDE.md, §6).
    #: A base de dados do painel guarda uma cópia, e o CI confere que as duas
    #: dizem o mesmo (docs/BASE-DE-DADOS.md). Sem ele, a região assina com o
    #: nome da rede em texto.
    dominio: str | None = None
    #: Nomes de paragem que os feeds de terceiros escrevem noutra língua.
    #:
    #: A interface é em português europeu (CLAUDE.md, primeira linha) e o feed
    #: pan-europeu dos expressos escreve «<Cidade> (Bus Station)» e nomes sem
    #: acento — 37 das 91 paragens dele. Isto não é inventar um dado (§4.4): é
    #: escrever em português o nome de uma terra portuguesa, e a correção fica
    #: declarada numa tabela que se revê, não espalhada pelo código.
    nomes: dict[str, Any] = field(default_factory=dict)
    # O que entra no grafo do motor de viagens, e as viagens que esta região
    # exige que ele saiba responder. Vazio = região sem motor, o que é
    # legítimo: um feed publicado já serve para alguma coisa sem planeador.
    motor: dict[str, Any] = field(default_factory=dict)
    #: O MAPA DE FUNDO, quando não é o do OpenStreetMap.
    #:
    #: Por omissão o mapa sai do recorte do OpenStreetMap que a região já
    #: declara para o motor (`pipeline mosaicos`, com o Planetiler). Uma região
    #: INVENTADA não tem recorte que sirva — o OpenStreetMap de onde as
    #: coordenadas dela caem mostrava terras reais por baixo de uma rede que
    #: não existe — e declara aqui a sua geografia: `fonte` (um GeoJSON com as
    #: camadas que o estilo desenha) e `atribuicao` (de quem é o desenho, que é
    #: o que aparece no canto do mapa). Vazio = o mapa é o do recorte, ou não há.
    mapa: dict[str, Any] = field(default_factory=dict)
    #: A COR DA MARCA, a da faixa do cabeçalho — `#rrggbb`, já validada para
    #: se ler com texto por cima (`marca.py`). Sem ela, a do §6.
    cor: str | None = None
    #: O LOGÓTIPO da rede ou da autoridade: um ficheiro ao lado do
    #: `regiao.yaml`, publicado com os dados. Sem ele, o nome por extenso.
    logotipo: Path | None = None
    #: UMA PROPOSTA, e não um serviço da autoridade de transportes.
    #:
    #: A região é real, os dados são públicos e a rede existe — mas o sítio foi
    #: feito por nós para mostrar à autoridade o que o produto faz, e ela ainda
    #: não o adotou. Quem o abre tem de o saber antes de mais nada: um sítio com
    #: o nome da rede, as paragens dela e o logótipo dela lê-se como sendo DELA,
    #: e falar em nome de uma autoridade que não nos deu essa voz é o que o
    #: §4.4 e o §7 não deixam. É o irmão do `demonstracao`, que é para uma rede
    #: que não existe; as duas coisas não se juntam.
    proposta: bool = False
    #: O QUE A FAIXA DA PROPOSTA DIZ, quando a região o declara.
    #:
    #: `proposta: true` dá a frase genérica, feita da autoridade («Proposta
    #: independente. Ainda não é um serviço da …»). Mas a relação com uma
    #: autoridade concreta — a quem é proposta, se ela já a viu — é da região,
    #: e há regiões onde a mesma relação já está escrita noutro produto da casa
    #: com outras palavras: duas fórmulas na mesma reunião são uma a mais. Por
    #: isso `proposta:` aceita também `{titulo, texto}`, e o produto escreve-o
    #: tal e qual. O produto não pode dizê-lo por ela: o nome de uma autoridade
    #: só se escreve dentro de `regioes/<id>/` (CLAUDE.md, §7).
    faixa_da_proposta: dict[str, str] | None = None
    #: OS URBANOS QUE A REDE PRÓPRIA OPERA (`UrbanoDaRede`), declarados em
    #: `rede.urbanos`. Contam como urbanos do concelho deles, ao lado das redes
    #: das câmaras. Saem do `rede` — que vai tal e qual para o sítio — e ficam
    #: aqui, validados.
    urbanos_da_rede: list[UrbanoDaRede] = field(default_factory=list)

    # --- prosa -----------------------------------------------------------

    def com(self, preposicao: str) -> str:
        """«do Baixo Sável», «na Serra da Pedra Alta», «ao Baixo Sável»."""
        return f"{_CONTRACOES[self.artigo][preposicao]} {self.nome}"

    @property
    def nome_com_artigo(self) -> str:
        return f"{_CONTRACOES[self.artigo]['artigo']} {self.nome}"

    @property
    def nome_com_artigo_no_inicio(self) -> str:
        """«A Serra da Pedra Alta», «O Baixo Sável» — para ABRIR uma frase.

        O `nome_com_artigo` entrava tal e qual no princípio de frases, e a
        primeira frase da faixa da demonstração era «Demonstração. a Serra da
        Pedra Alta não existe». A maiúscula é tipografia e não contração, mas
        sai daqui pela mesma razão das outras formas: a prosa vem feita, e o
        sítio não decide nada sobre o nome de uma região.
        """
        n = self.nome_com_artigo
        return n[:1].upper() + n[1:]

    # A AUTORIDADE E O OPERADOR TAMBÉM TÊM ARTIGO, e nenhuma regra o adivinha:
    # «a Comunidade Intermunicipal», «o Município de Sável», «a Alta
    # Transportes». Sem ele, a frase que nomeia o cliente — no rodapé de todas
    # as páginas — dizia «gerida por Comunidade Intermunicipal…, com operação
    # de …», sem artigo nenhum. É OPCIONAL: a região que não o declare continua
    # a ter frases certas, noutra forma («pela autoridade de transportes
    # (…)»), e o sítio escolhe pela presença destas chaves.

    @property
    def prosa_da_autoridade(self) -> dict[str, str]:
        """«a …», «da …», «pela …» — só quando a região declara o artigo."""
        artigo, nome = self.autoridade.get("artigo"), self.autoridade.get("nome")
        if artigo not in _CONTRACOES or not nome:
            return {}
        c = _CONTRACOES[artigo]
        return {
            "com_artigo": f"{c['artigo']} {nome}",
            "de": f"{c['de']} {nome}",
            "por": f"{c['por']} {nome}",
        }

    @property
    def prosa_do_operador(self) -> dict[str, str]:
        """«pela Alta Transportes», «da Alta Transportes» — só com o artigo do operador."""
        artigo, nome = self.rede.get("operador_artigo"), self.rede.get("operador")
        return prosa_de_operador(nome, artigo)

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
        if self.mapa.get("fonte"):
            ids.add(str(self.mapa["fonte"]))
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
                "Não se adivinha: é «o» Baixo Sável e «a» Serra da Pedra Alta, e nenhuma regra "
                "acerta nos dois."
            )

        # Os artigos da autoridade e do operador são opcionais — mas, se
        # declarados, têm de ser artigos. Um «A» ou um «da» passava ao sítio
        # como se fosse um, e a frase saía com a contração errada.
        for onde, chave in (
            (d.get("autoridade_de_transportes") or {}, "artigo"),
            (d.get("rede") or {}, "operador_artigo"),
        ):
            if chave in onde and onde[chave] not in _CONTRACOES:
                raise ErroDeRegiao(
                    f"{pasta.name}: `{chave}` tem de ser 'o', 'a', 'os' ou 'as' e é "
                    f"{onde[chave]!r}."
                )

        cor, logotipo = _marca(pasta, d)

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
                partes_odbl=(str(s["partes_odbl"]).strip() or None)
                if s.get("partes_odbl")
                else None,
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
            rede={k: v for k, v in (d.get("rede") or {}).items() if k != "urbanos"},
            dominio_env=d.get("dominio_env"),
            dominio=(str(d["dominio"]).strip().lower() or None) if d.get("dominio") else None,
            demonstracao=bool(d.get("demonstracao", False)),
            proposta=bool(d.get("proposta", False)),
            faixa_da_proposta=_faixa_da_proposta(d["id"], d.get("proposta")),
            urbanos_da_rede=_urbanos_da_rede(d["id"], (d.get("rede") or {}).get("urbanos")),
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
            mapa=dict(df.get("mapa") or {}),
            cor=cor,
            logotipo=logotipo,
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
        if self.demonstracao and self.proposta:
            raise ErroDeRegiao(
                f"{self.id}: declara `demonstracao` e `proposta` ao mesmo tempo. Uma demonstração "
                "é uma rede inventada; uma proposta é uma rede real que a autoridade ainda não "
                "adotou. A faixa de cima de cada página não pode dizer as duas coisas."
            )
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

        if self.urbanos_da_rede:
            if "urbano-municipal" not in self.modos:
                raise ErroDeRegiao(
                    f"{self.id}: declara urbanos na rede (`rede.urbanos`) e não tem "
                    "`urbano-municipal` na lista de modos. São urbanos: sem o modo, não há onde "
                    "os mostrar."
                )
            fora = sorted({u.concelho for u in self.urbanos_da_rede} - set(ids))
            if fora:
                raise ErroDeRegiao(
                    f"{self.id}: `rede.urbanos` aponta para concelhos que a região não tem — "
                    f"{', '.join(fora)}."
                )
            todos = [x for u in self.urbanos_da_rede for x in u.linhas]
            repetidas = sorted({x for x in todos if todos.count(x) > 1})
            if repetidas:
                raise ErroDeRegiao(
                    f"{self.id}: a mesma linha em dois urbanos da rede, ou duas vezes no mesmo — "
                    f"{', '.join(repetidas)}. Uma linha é de uma rede urbana só."
                )


def _marca(pasta: Path, d: dict[str, Any]) -> tuple[str | None, Path | None]:
    """A cor e o logótipo que a região declara — validados, ou a recusa (`marca.py`).

    Os dois são opcionais. O que não pode passar é uma `cor:` VAZIA: é o que o
    YAML faz a `cor: #5fc2b7` sem aspas — o «#» abre um comentário —, e a
    região ficava com a cor do produto sem ninguém dar por isso.
    """
    if "cor" in d and d["cor"] in (None, ""):
        raise ErroDeRegiao(
            f"{pasta.name}: `cor:` está vazia. Se lá escreveste a cor sem aspas, o YAML leu o «#» "
            'como um comentário: escreve-a entre aspas, `cor: "#rrggbb"`.'
        )
    try:
        cor = validar_cor(d["cor"], f"{pasta.name}: `cor`") if d.get("cor") else None
        logotipo = None
        if d.get("logotipo"):
            caminho = (pasta / str(d["logotipo"])).resolve()
            # O ficheiro é DA REGIÃO: fica na pasta dela, e não noutro sítio do disco.
            if pasta.resolve() not in caminho.parents:
                raise MarcaInvalida(
                    f"{pasta.name}: o logótipo tem de estar na pasta da região, ao lado do "
                    f"`regiao.yaml`, e aponta para {d['logotipo']!r}."
                )
            logotipo = validar_logotipo(caminho, f"{pasta.name}: `logotipo`")
    except MarcaInvalida as e:
        raise ErroDeRegiao(str(e)) from None
    return cor, logotipo


def _faixa_da_proposta(id_regiao: str, valor: Any) -> dict[str, str] | None:
    """O que a faixa da proposta diz, quando a região o escreve (`Regiao.faixa_da_proposta`).

    `proposta: true` (ou nada) dá `None`, e o sítio escreve a frase genérica.
    `proposta: {titulo, texto}` dá os dois, e têm de vir os dois: um título sem
    texto, ou o contrário, deixava a faixa a meio em todas as páginas — e uma
    chave mal escrita (`title:`) passava a frase genérica sem ninguém dar por
    isso. Recusa-se em vez de se adivinhar.
    """
    if not isinstance(valor, dict):
        return None
    faixa = {chave: str(valor.get(chave) or "").strip() for chave in ("titulo", "texto")}
    sobra = sorted(set(valor) - set(faixa))
    if sobra or not all(faixa.values()):
        raise ErroDeRegiao(
            f"{id_regiao}: `proposta:` declara a faixa com `titulo` e `texto`, os dois e mais "
            f"nada — tem {sorted(valor)}. Para a frase genérica, `proposta: true`."
        )
    return faixa


def _urbanos_da_rede(id_regiao: str, valor: Any) -> list[UrbanoDaRede]:
    """As redes urbanas que a rede própria opera, como a região as declara.

    Cada uma com `nome`, `concelho` e `linhas` (os números no feed), e nada
    mais. O que se confere aqui é a forma; que o concelho exista confere-o o
    `_verificar`, e que cada número exista no feed confere-o a construção
    (`construcao._urbanos_da_rede`), que é quem tem o feed.
    """
    if valor in (None, []):
        return []
    if not isinstance(valor, list):
        raise ErroDeRegiao(
            f"{id_regiao}: `rede.urbanos` é uma lista de redes, cada uma com `nome`, `concelho` "
            "e `linhas`."
        )
    urbanos: list[UrbanoDaRede] = []
    for i, u in enumerate(valor):
        if not isinstance(u, dict) or sorted(u) != ["concelho", "linhas", "nome"]:
            raise ErroDeRegiao(
                f"{id_regiao}: `rede.urbanos[{i}]` declara-se com `nome`, `concelho` e `linhas`, "
                f"os três e mais nada — tem {sorted(u) if isinstance(u, dict) else u!r}."
            )
        nome = str(u["nome"] or "").strip()
        concelho = str(u["concelho"] or "").strip()
        linhas = u["linhas"] if isinstance(u["linhas"], list) else []
        # OS NÚMEROS SÃO TEXTO, como no feed: «0101» e «101» são linhas
        # diferentes, e um YAML sem aspas lia o primeiro como um inteiro.
        codigos = tuple(str(x).strip() for x in linhas if str(x).strip())
        if not nome or not concelho or not codigos or len(codigos) != len(linhas):
            raise ErroDeRegiao(
                f"{id_regiao}: `rede.urbanos[{i}]` tem de ter `nome`, `concelho` e pelo menos um "
                "número de linha em `linhas`, sem vazios."
            )
        if any(not isinstance(x, str) for x in linhas):
            raise ErroDeRegiao(
                f"{id_regiao}: os números das linhas de `rede.urbanos[{i}]` ({nome}) escrevem-se "
                'entre aspas, como texto — `["0101", "12"]`: sem elas, o YAML lê «0101» como 101.'
            )
        urbanos.append(UrbanoDaRede(nome=nome, concelho=concelho, linhas=codigos))
    return urbanos


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
