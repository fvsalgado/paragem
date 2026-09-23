"""O que o sítio lê: dados já mastigados, por região.

**Porque é que isto existe em Python e não em TypeScript.** O sítio podia abrir
os `.zip` do GTFS e lê-los ele próprio. Não o faz, por duas razões que valem
mais do que a conveniência:

1. **Uma só implementação de GTFS.** Duas — uma no pipeline, outra no sítio —
   divergem, e a divergência aparece como uma paragem que a página diz que a
   linha serve e o planeador diz que não. Quem viaja não tem como saber qual
   das duas mente.
2. **O sítio não sabe o que é uma região.** Lê `build/<id>/sitio/` e mostra o
   que lá está. Trocar de região é trocar de pasta, não de código — que é a
   mesma regra dos leitores e do motor.

O que sai daqui é deliberadamente CHATO: JSON simples, sem referências
cruzadas por resolver, com os nomes já escritos em português. O trabalho de
juntar faz-se aqui, uma vez, e não em cada visita de cada pessoa.

**E o que não se sabe sai marcado.** Um preço por confirmar sai com
`confirmado: false` e a página tem de o dizer; um serviço sem datas sai com a
lista de dias vazia e a palavra que o explica. O §4.4 não é só sobre não
inventar: é sobre o que falta ficar visível.
"""

from __future__ import annotations

import collections
import contextlib
import hashlib
import json
import re
import shutil
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from .geo import distancia_km
from .gtfs import Gtfs
from .leitores import LEITORES_DE_HORARIO
from .regiao import Regiao
from .regiao import Saida as SaidaDaReceita

# A que distância é que uma estação de comboio e uma paragem de autocarro são
# «a mesma paragem» para quem transborda. O §6.4 usa 300 m para a verificação
# de cobertura; aqui é a mesma pergunta, feita ao contrário.
RAIO_CORRESPONDENCIA_KM = 0.3


def _json_seguro(o: Any) -> str:
    """Datas em ISO, e nada mais.

    O YAML lê `2026-09-19` como `datetime.date`, e o JSON não sabe escrevê-lo.
    Converte-se aqui, em ISO — que é o que o sítio precisa de mostrar e o que
    qualquer leitor de JSON sabe ler de volta. Tudo o resto que chegue aqui é
    um erro de programação e deve rebentar, não virar texto qualquer.
    """
    import datetime as _dt

    if isinstance(o, _dt.date | _dt.datetime):
        return o.isoformat()
    raise TypeError(f"não sei escrever {type(o).__name__} em JSON: {o!r}")


# Os papéis que dizem «este modo já tem por onde se ver».
#
# `horarios` e `feed-proprio` são a rede própria da região — as linhas e as
# paragens. `catalogo-proprio` é um modo com página só dele, como o transporte
# a pedido, que tem a `/a-pedido/`. Em qualquer dos casos, gerar também uma
# `/modos/<modo>/` dava duas páginas à mesma pergunta.
CATALOGO_PROPRIO = {"horarios", "feed-proprio", "catalogo-proprio"}


def _por_extenso(operador: str) -> str:
    """«C.M. Torres Novas» e «Câmara Municipal de Torres Novas» são a mesma.

    A primeira é a etiqueta `operator` do OpenStreetMap, a segunda é como a
    câmara se escreve nos cartazes dela. Sem isto, a linha «Gerido por» da
    página dos urbanos listava as duas, como se fossem duas entidades — e quem
    a lê fica a achar que há dois operadores no mesmo concelho.

    Expande a abreviatura; não traduz nem adivinha mais nada.
    """
    resto = re.sub(r"^C\.?\s*M\.?\s+(?:de\s+|do\s+|da\s+)?", "", operador)
    return f"Câmara Municipal de {resto}" if resto != operador else operador


def com_nomes_da_regiao(feed, regiao):
    """Reescreve os nomes de paragem que a região declara em `nomes.yaml`.

    **É PÚBLICA PORQUE O ORÁCULO TAMBÉM PRECISA DELA.** O teste que confere
    cada perna contra o GTFS em bruto lia os nomes do ficheiro e comparava-os
    com os que o planeador devolveu — e o planeador já os vê corrigidos. As
    três pernas de expresso de Fátima para Tomar reprovaram com «nenhuma
    viagem bate certo», e batiam: o que não batia eram as duas grafias do
    mesmo cais. Chamar a MESMA função dos dois lados é o que impede as duas
    de voltarem a divergir.

    Aplica-se AO FEED e não à apresentação, e a diferença é o que faz isto
    valer a pena: a fusão de paragens exige mesma distância e MESMO NOME, e
    por isso um nome corrigido aqui funde duas paragens que eram a mesma —
    medido, 19 metros entre a paragem dos expressos e a da rede em Tomar, em
    Fátima e em Torres Novas. Corrigir só à vista deixava-as duas, e a viagem
    continuava a mostrar uma caminhada de «0 min · 19 m» entre elas.

    Uma região sem `nomes.yaml` — as duas de prova não têm — passa incólume.
    """
    mapa = ((regiao.nomes or {}).get("paragens") or {}) if regiao is not None else {}
    if not mapa:
        return feed
    for linha in feed.obter("stops.txt").linhas:
        novo = mapa.get(linha.get("stop_name"))
        if novo:
            linha["stop_name"] = novo
    return feed


def _sem_repetidas(lista: list[dict]) -> list[dict]:
    """A mesma partida escrita duas vezes é uma, e a folha só mostra uma.

    Não é a mesma coisa que o filtro do dia. Estas são partidas iguais em
    TUDO — mesma hora, mesma linha, mesmo destino e mesmo serviço — e vêm de
    duas viagens distintas no feed, que é como uma linha que se divide em dois
    percursos a meio aparece duas vezes no princípio. Medido em Fátima
    (Terminal): sete pares, entre eles «08:40 · 107 · Nazaré (Terminal)» três
    vezes seguidas.

    Guarda-se a PRIMEIRA, e a ordem não muda: a lista já vem ordenada, e
    reordenar aqui trocava a ordem de apresentação por causa de uma limpeza.
    """
    vistas: set[tuple] = set()
    saida = []
    for p in lista:
        chave = (p.get("hora"), p.get("linha"), p.get("destino"), p.get("servico"))
        if chave in vistas:
            continue
        vistas.add(chave)
        saida.append(p)
    return saida


def _simples(s: str) -> str:
    """Para ordenar e procurar: sem acentos, minúsculas.

    NÃO substitui o nome — o nome que se mostra é o que vem do feed, com os
    acentos que tem. Isto é só a chave de ordenação e de busca.
    """
    d = unicodedata.normalize("NFD", (s or "").casefold())
    return "".join(c for c in d if unicodedata.category(c) != "Mn")


@dataclass
class Saida:
    caminho: Path
    bytes: int
    registos: int


class Sitio:
    """Escreve `build/<regiao>/sitio/`."""

    def __init__(self, raiz: Path, regiao: Regiao, destino: Path) -> None:
        self.raiz = Path(raiz)
        self.regiao = regiao
        self.destino = Path(destino) / "sitio"
        self.saidas: list[Saida] = []
        self._feeds: dict[str, Gtfs] = {}

    # --- utilitários ----------------------------------------------------

    def _escrever(self, relativo: str, dados: Any, registos: int | None = None) -> None:
        caminho = self.destino / relativo
        caminho.parent.mkdir(parents=True, exist_ok=True)
        # `sort_keys` e `ensure_ascii=False`: determinista, e legível por quem
        # o abrir. Um JSON com `ç` em vez de `ç` é ilegível para quem
        # precisa de perceber porque é que a página diz o que diz.
        texto = json.dumps(
            dados, ensure_ascii=False, sort_keys=True, indent=None, default=_json_seguro
        )
        caminho.write_text(texto + "\n", encoding="utf-8")
        n = registos if registos is not None else (len(dados) if hasattr(dados, "__len__") else 1)
        self.saidas.append(Saida(caminho, len(texto) + 1, n))

    # OS NOMES DOS FEEDS VÊM DA REGIÃO, e não estão cravados aqui.
    #
    # Estiveram: o `sitio.py` pedia `"meio.zip"` e `"cp.zip"` pelo nome. É
    # exatamente o que o §11.1 proíbe — o produto a saber a marca de um cliente
    # — e o preço apareceu no dia em que a segunda região entrou no mesmo
    # sítio: a demonstração construiu-se com zero paragens e zero linhas, sem
    # um erro, porque o ficheiro dela se chama `rede-alta.zip`.
    #
    # Um sítio vazio sem mensagem nenhuma é a pior maneira de uma suposição
    # falhar. A declaração da região já dizia o que era o quê, em `papel` e
    # `modo`; o que faltava era perguntar.

    def _saida_com(self, *, papeis: set[str] | None = None, modo: str | None = None) -> str | None:
        for s in self.regiao.saidas:
            if not s.saida or not s.saida.endswith(".zip"):
                continue
            if papeis and s.papel not in papeis:
                continue
            if modo and s.modo != modo:
                continue
            return s.saida.split("/")[-1]
        return None

    @property
    def feed_proprio(self) -> str | None:
        """O feed que a região produz da sua própria rede."""
        return self._saida_com(papeis={"horarios", "feed-proprio"})

    @property
    def paragens_partilhadas(self) -> dict[str, str]:
        """Os feeds cujas paragens vivem no espaço de nomes de outro.

        Vem da receita da região (`params.paragens_de`) e não do código: quem
        sabe que dois operadores servem o mesmo cais é quem monta a região, e
        obrigá-la a um commit para o dizer era o contrário do §11.5.
        """
        partilha: dict[str, str] = {}
        for s in self.regiao.saidas:
            outro = str((s.params or {}).get("paragens_de") or "").strip()
            if s.saida and outro:
                partilha[s.saida.split("/")[-1].removesuffix(".zip")] = outro.split("/")[
                    -1
                ].removesuffix(".zip")
        return partilha

    @property
    def feeds_na_mesma_paragem(self) -> list[str]:
        """Os feeds que partilham as paragens do feed da própria rede.

        São os que têm de aparecer no painel de partidas da paragem. Um
        operador vizinho que pára no mesmo cais é um autocarro que quem lá
        está pode apanhar — e o §1 diz que quem viaja não tem de saber quem o
        gere.
        """
        proprio = (self.feed_proprio or "").removesuffix(".zip")
        return [f"{k}.zip" for k, v in sorted(self.paragens_partilhadas.items()) if v == proprio]

    @property
    def feed_de_comboio(self) -> str | None:
        """Uma região pode não ter comboio — a de prova não tem."""
        return self._saida_com(papeis={"feed-de-terceiro"}, modo="comboio")

    def _feed(self, nome: str | None) -> Gtfs | None:
        if not nome:
            return None
        if nome not in self._feeds:
            caminho = self.destino.parent / "gtfs" / nome
            if not caminho.exists():
                return None
            self._feeds[nome] = com_nomes_da_regiao(Gtfs.ler(caminho), self.regiao)
        return self._feeds[nome]

    # --- a região -------------------------------------------------------

    def regiao_json(self) -> dict[str, Any]:
        r = self.regiao
        return {
            "id": r.id,
            "nome": r.nome,
            "artigo": r.artigo,
            # A prosa vem daqui já feita. O sítio não tem regra de contração
            # nenhuma: «do Médio Tejo» e «da Serra da Pedra Alta» vêm
            # escritos, porque nenhuma heurística acerta nos topónimos
            # portugueses.
            "nome_com_artigo": r.nome_com_artigo,
            "de": r.com("de"),
            "em": r.com("em"),
            "a": r.com("a"),
            "autoridade": r.autoridade,
            "rede": r.rede,
            "dominio_env": r.dominio_env,
            # O domínio canónico, declarado na região. É o que o middleware
            # por host vai comparar com a linha da base (docs/BASE-DE-DADOS.md).
            "dominio": r.dominio,
            # Uma rede inventada apresentada como informação de transportes é o
            # que o §4.4 proíbe. O sítio marca-a em todas as páginas.
            "demonstracao": r.demonstracao,
            "modos": r.modos,
            "municipios_membros": r.municipios_membros,
            "concelhos_servidos": r.concelhos_servidos,
            "caixa": {
                "lat_min": r.caixa.lat_min,
                "lat_max": r.caixa.lat_max,
                "lon_min": r.caixa.lon_min,
                "lon_max": r.caixa.lon_max,
            },
        }

    def concelhos_json(self, paragens: list[dict]) -> list[dict[str, Any]]:
        por_concelho: collections.Counter[str] = collections.Counter()
        for p in paragens:
            if p.get("concelho"):
                por_concelho[p["concelho"]] += 1
        return [
            {
                "id": c.id,
                "nome": c.nome,
                "distrito": c.distrito,
                "dico": c.dico,
                # `membro` distingue os municípios da autoridade dos que ela
                # serve sem que sejam dela. A interface nunca os mistura na
                # contagem e nunca os deixa de fora do território (§2).
                "membro": c.membro,
                "servido_por": c.servido_por,
                "paragens": por_concelho.get(c.id, 0),
            }
            for c in self.regiao.concelhos
        ]

    # --- paragens -------------------------------------------------------

    def paragens(self, territorio) -> tuple[list[dict], dict[str, list[dict]]]:
        """O índice de paragens e, por paragem, as partidas planeadas.

        As partidas vêm agrupadas por SERVIÇO e não por data, que é como um
        horário impresso se lê e como a operadora os publica. Uma paragem que
        só tenha partidas em serviços sem datas mostra-as à mesma — com a
        marca de que não se sabe em que dias correm. Escondê-las era pior:
        a paragem parecia não ter serviço nenhum.
        """
        feed = self._feed(self.feed_proprio)
        if feed is None:
            return [], {}

        # MAIS DO QUE UM FEED PARA A MESMA PARAGEM. Quem espera num cais quer
        # saber o que ali passa, não de quem é a camioneta — é o §1. Entram
        # todos os feeds que declaram partilhar as paragens deste, e a marca
        # de quem opera vai em cada partida, para a página a poder dizer.
        partidas: dict[str, list[dict]] = collections.defaultdict(list)
        linhas_da_paragem: dict[str, set[str]] = collections.defaultdict(set)
        for ficheiro in [self.feed_proprio, *self.feeds_na_mesma_paragem]:
            outro = self._feed(ficheiro)
            if outro is not None:
                self._partidas_do_feed(
                    outro, partidas, linhas_da_paragem, (ficheiro or "").removesuffix(".zip")
                )
        for sid, lista in partidas.items():
            lista.sort(key=lambda p: (p["servico_nome"], p["hora"], p["linha"]))
            partidas[sid] = _sem_repetidas(lista)

        # O ÍNDICE TAMBÉM É DE TODOS, e por uma razão que se descobriu partida:
        # a página da linha lista as paragens do percurso e liga a cada uma. Com
        # o índice só do nosso feed, as paragens que só a carreira de fora serve
        # ficavam sem página e a ligação dava 404 — numa página que acabara de
        # ganhar a linha que as serve.
        #
        # É o mesmo critério que o feed da própria rede já usa: ele traz as
        # paragens dele em Leiria e em Santarém, porque o §2 proíbe cortar uma
        # carreira na fronteira, e uma paragem sem página é um corte.
        vistas: dict[str, dict] = {}
        for ficheiro in [self.feed_proprio, *self.feeds_na_mesma_paragem]:
            outro = self._feed(ficheiro)
            if outro is None:
                continue
            for s in outro.stops:
                # O nosso ganha: a paragem fundida tem o nome e a coordenada
                # que a região já publica, e não a grafia do registo.
                vistas.setdefault(str(s["stop_id"]), s)

        indice: list[dict] = []
        detalhe: dict[str, list[dict]] = {}
        for s in vistas.values():
            sid = s["stop_id"]
            try:
                lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
            except (KeyError, ValueError):
                continue
            concelho = None
            if territorio is not None:
                limite = territorio.concelho_de(lat, lon)
                if limite:
                    concelho = self._concelho_por_dico(limite.codigo)
            if concelho is None:
                concelho = self._concelho_por_prefixo(sid)
            indice.append(
                {
                    "id": sid,
                    "nome": s.get("stop_name", ""),
                    "ordem": _simples(s.get("stop_name", "")),
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "concelho": concelho,
                    "linhas": sorted(linhas_da_paragem.get(sid, ()), key=_simples),
                    "partidas": len(partidas.get(sid, ())),
                }
            )
            detalhe[sid] = partidas.get(sid, [])
        indice.sort(key=lambda p: p["ordem"])
        return indice, detalhe

    def _partidas_do_feed(
        self, feed, partidas: dict, linhas_da_paragem: dict, nome_feed: str = ""
    ) -> None:
        """As partidas que um feed põe em cada paragem, acumuladas nos dois mapas."""
        rotas = {r["route_id"]: r for r in feed.routes}
        viagens = {t["trip_id"]: t for t in feed.trips}
        nomes_de_servico = self._nomes_de_servico()
        com_datas = self._servicos_com_datas(feed)
        operador = self._operador_de(feed)
        proprio = operador == self._operador_de(self._feed(self.feed_proprio))

        # O destino de uma viagem é a última paragem DESTE feed, e não do
        # nosso: uma carreira de fora acaba onde ela acaba, que é muitas vezes
        # fora da região — e é precisamente isso que interessa a quem embarca.
        ultima: dict[str, str] = {}
        # Onde a viagem ACABA, pelo identificador: é isto que distingue uma
        # circular de uma carreira que por acaso acaba noutro cais com o mesmo
        # nome. Ver `circular` mais abaixo.
        ultimo_id: dict[str, str] = {}
        por_viagem: dict[str, list] = collections.defaultdict(list)
        for st in feed.stop_times:
            por_viagem[st["trip_id"]].append(st)
        nome_da_paragem = {s["stop_id"]: s.get("stop_name", "") for s in feed.stops}
        for tid, paradas in por_viagem.items():
            paradas.sort(key=lambda x: int(x["stop_sequence"]))
            ultima[tid] = nome_da_paragem.get(paradas[-1]["stop_id"], "")
            ultimo_id[tid] = paradas[-1]["stop_id"]

        for tid, paradas in por_viagem.items():
            t = viagens.get(tid)
            if not t:
                continue
            r = rotas.get(t["route_id"], {})
            codigo = r.get("route_short_name") or r.get("route_long_name") or ""
            servico = t.get("service_id", "")
            for st in paradas[:-1]:  # de uma paragem PARTE-SE; na última chega-se
                sid = st["stop_id"]
                linhas_da_paragem[sid].add(codigo)
                hora = (st.get("departure_time") or "").strip()
                if not hora:
                    continue
                partidas[sid].append(
                    {
                        "linha": codigo,
                        "linha_id": t["route_id"],
                        "destino": ultima.get(tid, ""),
                        "hora": hora[:5],
                        "servico": servico,
                        "servico_nome": nomes_de_servico.get(servico, servico),
                        # A MESMA CHAVE QUE A GRELHA USA, para a página poder
                        # perguntar «isto anda HOJE?».
                        #
                        # Sem ela a folha da paragem mostrava os três tipos de
                        # dia ao mesmo tempo: em Fátima (Terminal) liam-se três
                        # partidas às 19:30 na linha 107 — uma de dias úteis,
                        # uma de sábados e uma de domingos — como se fossem
                        # três autocarros. Quem lá está numa terça-feira vê
                        # dois que não vêm.
                        "servico_id": f"{nome_feed}:{servico}" if nome_feed else servico,
                        "tem_datas": servico in com_datas,
                        # `timepoint=0` é uma hora INTERPOLADA por nós, não uma
                        # hora do horário publicado. A página tem de a marcar —
                        # estimar não é fingir (§6.2).
                        "estimada": st.get("timepoint", "1") == "0",
                        # UMA CIRCULAR VOLTA AO SÍTIO DE ONDE PARTIU, e a
                        # folha tem de o dizer em vez de repetir o nome da
                        # paragem onde a pessoa está. As quatro linhas urbanas
                        # desta região são circulares: no cais delas liam-se
                        # 98 partidas seguidas com o destino igual ao título
                        # da página, o que se lê como um erro e não como uma
                        # volta.
                        #
                        # Não é uma inferência: a viagem acaba no MESMO
                        # `stop_id` de onde parte. Uma carreira que acabe
                        # noutro cais com o mesmo nome não leva a marca.
                        **({"circular": True} if ultimo_id.get(tid) == sid else {}),
                        # QUEM GERE, e só quando não é a rede da casa: o §1
                        # manda que a entidade seja informação secundária, e
                        # repeti-la em 27 mil partidas da própria rede era
                        # ruído a pesar no ficheiro.
                        **({} if proprio else {"operador": operador}),
                    }
                )

    @staticmethod
    def _operador_de(feed) -> str:
        if feed is None:
            return ""
        for a in feed.obter("agency.txt"):
            return str(a.get("agency_name") or "").strip()
        return ""

    def _concelho_por_dico(self, dico: str) -> str | None:
        c = self.regiao.concelho_por_dico(dico)
        return c.id if c else None

    def _concelho_por_prefixo(self, stop_id: str) -> str | None:
        """O prefixo do `stop_id` é INDÍCIO e não prova (§6.4).

        Só se usa quando não há carta administrativa. Fica aqui para a região
        que não a tenha, e para as paragens que caiam fora dos limites — que
        existem: há linhas que atravessam a fronteira, e uma paragem em Leiria
        não é de nenhum dos treze concelhos.
        """
        prefixo = stop_id.split("_")[0]
        c = self.regiao.concelho_por_prefixo(prefixo)
        return c.id if c else None

    def _nomes_de_servico(self) -> dict[str, str]:
        """«A-U» → «Anual · Dias úteis», a partir do calendário declarado."""
        cal = self.regiao.calendario or {}
        codigos = cal.get("codigos") or {}
        periodos = {k: (v or {}).get("nome", k) for k, v in (codigos.get("periodo") or {}).items()}
        dias = {k: (v or {}).get("nome", k) for k, v in (codigos.get("dias") or {}).items()}

        nomes: dict[str, str] = {}
        for p, np_ in periodos.items():
            for d, nd in dias.items():
                nomes[f"{p}-{d}"] = f"{np_} · {nd}"
        # Os `service_id` de junho levam por vezes prefixo de concelho
        # (`ABT_`, `ORM_`…) por causa dos calendários escolares (§6.2). O nome
        # que se mostra é o do código base; o concelho já está na página.
        for chave in list(nomes):
            for c in self.regiao.concelhos:
                if c.prefixo_stop_id:
                    nomes[f"{c.prefixo_stop_id.upper()}_{chave}"] = nomes[chave]
        return nomes

    @staticmethod
    def _servicos_com_datas(feed: Gtfs) -> set[str]:
        if "calendar_dates.txt" not in feed:
            return set()
        return {
            r["service_id"] for r in feed["calendar_dates.txt"] if r.get("exception_type") == "1"
        }

    # --- linhas ---------------------------------------------------------

    def linhas(self) -> tuple[list[dict], dict[str, dict]]:
        """O índice de linhas e, por linha, o percurso em cada sentido.

        Uma linha não tem UM percurso: tem tantos quantos as variantes que
        circulam. Mostrar só o mais comprido escondia as que não passam onde
        quem lê espera; mostrar todos era ilegível. Guarda-se o percurso de
        cada sentido pela variante MAIS SERVIDA, e diz-se quantas variantes há.
        """
        feed = self._feed(self.feed_proprio)
        if feed is None:
            return [], {}

        # AS LINHAS DE QUEM PARTILHA O CAIS TÊM PÁGINA. Não é simetria: sem
        # ela, a partida que o painel mostra aponta para uma página que não
        # existe, e uma ligação partida é pior do que a partida escondida —
        # promete e não cumpre.
        feeds = [
            f
            for f in (self._feed(self.feed_proprio), *map(self._feed, self.feeds_na_mesma_paragem))
            if f
        ]

        nome_da_paragem: dict[str, str] = {}
        viagens: dict[str, dict] = {}
        por_viagem: dict[str, list] = collections.defaultdict(list)
        operador_da_rota: dict[str, str] = {}
        proprio = self._operador_de(feed)
        for f in feeds:
            nome_da_paragem.update({s["stop_id"]: s.get("stop_name", "") for s in f.stops})
            viagens.update({x["trip_id"]: x for x in f.trips})
            for st in f.stop_times:
                por_viagem[st["trip_id"]].append(st)
            quem = self._operador_de(f)
            for r in f.routes:
                operador_da_rota[r["route_id"]] = "" if quem == proprio else quem
        for paradas in por_viagem.values():
            paradas.sort(key=lambda x: int(x["stop_sequence"]))

        # Percursos por (linha, sentido), contados pela frequência.
        percursos: dict[tuple[str, str], collections.Counter] = collections.defaultdict(
            collections.Counter
        )
        viagens_por_linha: collections.Counter[str] = collections.Counter()
        for tid, paradas in por_viagem.items():
            t = viagens.get(tid)
            if not t:
                continue
            chave = (t["route_id"], t.get("direction_id", "0"))
            percursos[chave][tuple(st["stop_id"] for st in paradas)] += 1
            viagens_por_linha[t["route_id"]] += 1

        indice: list[dict] = []
        detalhe: dict[str, dict] = {}
        for r in [x for f in feeds for x in f.routes]:
            rid = r["route_id"]
            codigo = r.get("route_short_name") or ""
            sentidos = []
            for (linha_id, sentido), contagem in sorted(percursos.items()):
                if linha_id != rid:
                    continue
                mais_comum, quantas = contagem.most_common(1)[0]
                sentidos.append(
                    {
                        "sentido": sentido,
                        "variantes": len(contagem),
                        "viagens": sum(contagem.values()),
                        "viagens_deste_percurso": quantas,
                        "paragens": [
                            {"id": sid, "nome": nome_da_paragem.get(sid, "")} for sid in mais_comum
                        ],
                    }
                )
            entrada = {
                "id": rid,
                "codigo": codigo,
                "nome": r.get("route_long_name") or "",
                "ordem": _ordem_de_linha(codigo),
                # A cor vem do feed, e o §8 manda garantir contraste. Quem
                # desenha decide o que fazer com uma cor que não contraste —
                # aqui sai como está, com a marca de que veio de lá.
                "cor": (r.get("route_color") or "").strip() or None,
                "cor_texto": (r.get("route_text_color") or "").strip() or None,
                "modo": _modo_gtfs(r.get("route_type", "3")),
                "viagens": viagens_por_linha.get(rid, 0),
                # Vazio quando é a rede da casa: o §1 diz que quem gere é
                # informação secundária, e escrevê-lo em todas as linhas fazia
                # dele o assunto.
                "operador": operador_da_rota.get(rid, ""),
            }
            indice.append(entrada)
            detalhe[rid] = {**entrada, "sentidos": sentidos}
        indice.sort(key=lambda x: x["ordem"])
        return indice, detalhe

    # --- estações de comboio ---------------------------------------------

    def estacoes(self, territorio, paragens: list[dict]) -> list[dict]:
        """As estações da região, e se têm autocarro à porta.

        É a informação do §6.4 posta do lado de quem viaja: quem chega de
        comboio a uma estação sem paragem a menos de 300 m tem de arranjar
        outra maneira de sair de lá, e é melhor saber isso ANTES de apanhar o
        comboio.
        """
        cp = self._feed(self.feed_de_comboio)
        if cp is None:
            return []

        autocarro = [(p["lat"], p["lon"], p["id"], p["nome"]) for p in paragens]
        saida: list[dict] = []
        for s in cp.stops:
            try:
                lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
            except (KeyError, ValueError):
                continue
            dentro = (
                territorio.contem(lat, lon) if territorio else self.regiao.caixa.contem(lat, lon)
            )
            if not dentro:
                continue
            perto = sorted(
                (
                    (distancia_km((lat, lon), (a, b)), i, n)
                    for a, b, i, n in autocarro
                    if abs(a - lat) < 0.01 and abs(b - lon) < 0.01
                )
            )[:4]
            concelho = None
            if territorio is not None:
                limite = territorio.concelho_de(lat, lon)
                if limite:
                    concelho = self._concelho_por_dico(limite.codigo)
            saida.append(
                {
                    "id": s["stop_id"],
                    "nome": s.get("stop_name", ""),
                    "ordem": _simples(s.get("stop_name", "")),
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "concelho": concelho,
                    "paragens_perto": [
                        {"id": i, "nome": n, "metros": round(d * 1000)}
                        for d, i, n in perto
                        if d <= RAIO_CORRESPONDENCIA_KM
                    ],
                    # A frase que a página tem de dizer, decidida aqui uma vez.
                    "sem_ligacao": not any(d <= RAIO_CORRESPONDENCIA_KM for d, _, _ in perto),
                }
            )
        saida.sort(key=lambda e: e["ordem"])
        return saida

    # --- a grelha horária que vai no telemóvel ----------------------------

    def grelha(self, territorio):
        """A grelha horária compacta, para o planeador que corre no navegador.

        Usa OS MESMOS FEEDS QUE O MOTOR, declarados em `motor.gtfs` pela região.
        Se divergissem, a página e o planeador responderiam coisas diferentes
        sobre a mesma linha — e quem viaja não tem como saber qual das duas
        mente. É a mesma razão de o sítio não abrir GTFS.
        """
        from . import grelha as _grelha

        decl = self.regiao.motor or {}
        nomes = [n for n in (decl.get("gtfs") or [])]
        if not nomes:
            return None, 0

        proprio = self.feed_proprio
        # O modo que a região declarou para cada saída — é ele que decide
        # quando o `route_type` é o genérico «autocarro».
        modo_do_ficheiro = {
            s.saida.split("/")[-1].removesuffix(".zip"): s.modo
            for s in self.regiao.saidas
            if s.saida and s.saida.endswith(".zip") and s.modo
        }
        feeds: dict[str, Gtfs] = {}
        dentro: dict[str, set[str] | None] = {}
        for caminho in nomes:
            ficheiro = caminho.split("/")[-1]
            feed = self._feed(ficheiro)
            if feed is None:
                continue
            chave = ficheiro.removesuffix(".zip")
            feeds[chave] = feed
            # O feed da própria rede entra inteiro: é a rede da região, e
            # recortá-la à caixa cortava linhas na fronteira, que é
            # exatamente o que o §2 proíbe.
            dentro[chave] = None if ficheiro == proprio else self._paragens_dentro(feed, territorio)

        if not feeds:
            return None, 0
        g = _grelha.construir(
            feeds,
            decl.get("fuso", "UTC"),
            dentro,
            modo_do_ficheiro,
            self.paragens_partilhadas,
        )
        return g, len(g.viagens)

    def _paragens_dentro(self, feed: Gtfs, territorio) -> set[str]:
        dentro: set[str] = set()
        for s in feed.stops:
            try:
                lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
            except (KeyError, ValueError):
                continue
            esta = territorio.contem(lat, lon) if territorio else self.regiao.caixa.contem(lat, lon)
            if esta:
                dentro.add(s["stop_id"])
        return dentro

    # --- os modos que o catálogo da rede não mostra ------------------------

    def modos(self, territorio) -> dict[str, Any]:
        """O que existe em cada modo que NÃO tem catálogo próprio.

        A grelha «Por modo» era uma fila de rótulos: sete cartões, e quatro
        deles sem lado nenhum para levar. Quem toca em «Bicicleta partilhada»
        à procura da estação mais perto não estava a pedir um rótulo.

        **O que decide o que entra é a declaração da região, não uma lista
        aqui.** Cada saída já diz o seu `modo` e o seu `leitor`, e o leitor é
        o FORMATO — `osm-bicicletas` dá GBFS, `osm-taxis` dá pontos,
        `osm-rotas` dá percursos, `gtfs-filtrado` dá um feed. Uma região que
        declare um modo que nunca vimos ganha a página na mesma, com o formato
        que declarar; uma que não declare nenhum não ganha página nenhuma.

        Ficam de fora os modos que já têm por onde se ver: a rede própria (as
        linhas e as paragens) e o comboio (as estações). Duplicá-los aqui era
        dar duas páginas à mesma pergunta e deixá-las divergir.
        """
        # OS MODOS COM CATÁLOGO CALCULAM-SE PRIMEIRO, e não à medida que se
        # percorre a lista.
        #
        # Foi a região de prova que apanhou isto. Ela declara o autocarro duas
        # vezes — o feed próprio, e um traçado de OpenStreetMap — e a segunda
        # declaração escapava ao teste, que olhava só para a linha que tinha à
        # frente. Resultado: uma página `/modos/autocarro/` gerada, a duplicar
        # o catálogo das linhas, e que a grelha nunca liga porque o autocarro
        # já tem para onde ir. Uma página órfã que ninguém abre é uma página
        # que ninguém corrige.
        com_catalogo = {
            d.modo
            for d in self.regiao.saidas
            if d.modo and (d.papel in CATALOGO_PROPRIO or d.modo == "comboio")
        }
        por_modo: dict[str, dict[str, Any]] = {}
        for decl in self.regiao.saidas:
            if not decl.modo or not decl.saida:
                continue
            if decl.modo in com_catalogo:
                continue
            peca = self._peca_de_modo(decl, territorio)
            if peca is None:
                continue
            m = por_modo.setdefault(
                decl.modo,
                {
                    "modo": decl.modo,
                    "gerido_por": [],
                    "sistemas": [],
                    "pontos": [],
                    "percursos": [],
                    "paragens": [],
                    "horarios": [],
                    "incompleto": False,
                    "notas": [],
                    "fontes": [],
                },
            )
            for chave, valor in peca.items():
                if chave in {
                    "sistemas",
                    "pontos",
                    "percursos",
                    "paragens",
                    "horarios",
                    "notas",
                    "fontes",
                    "operadores",
                }:
                    m.setdefault(chave, [])
                    m[chave].extend(valor)
                elif chave == "incompleto":
                    m["incompleto"] = m["incompleto"] or valor
                else:
                    m[chave] = valor

        for m in por_modo.values():
            geridos = [s.get("operador") for s in m["sistemas"]]
            geridos += [p.get("operador") for p in m["percursos"]]
            geridos += [h.get("operador") for h in (m.get("horarios") or [])]
            operadores = m.get("operadores") or []
            geridos += [o.get("nome") for o in operadores]
            m["gerido_por"] = sorted({_por_extenso(g) for g in geridos if g}, key=_simples)
            # Um modo declarado que não produziu NADA é uma lacuna, não uma
            # página vazia: a nota di-lo e a contagem fica a zero.
            m["quantos"] = (
                sum(len(s["estacoes"]) for s in m["sistemas"])
                + len(m["pontos"])
                + len(m["percursos"])
                + len(m["paragens"])
                + len(m.get("horarios") or [])
            )
        return por_modo

    def _peca_de_modo(self, decl, territorio) -> dict[str, Any] | None:
        """Uma saída declarada, lida no formato que o seu leitor produz."""
        construtor = {
            "osm-bicicletas": self._modo_bicicletas,
            # As duas fontes de estações de bicicletas saem na mesma forma — o
            # GBFS — e por isso constroem a página pelo mesmo caminho. O que as
            # distingue está na declaração da região, não aqui.
            "gbfs-operadora": self._modo_bicicletas,
            "osm-taxis": self._modo_pontos,
            "osm-rotas": self._modo_percursos,
            "gtfs-filtrado": self._modo_feed,
            "horarios-pdf-cartaz": self._modo_cartaz,
            "horarios-manuais": self._modo_cartaz,
            # O instantâneo do sítio de reservas sai na MESMA forma dos
            # cartazes e das transcrições — o que muda é de onde veio, e isso
            # está na fonte, não aqui.
            "horarios-reservas": self._modo_cartaz,
        }.get(decl.leitor)
        if construtor is None:
            return None
        peca = construtor(decl, territorio)
        if peca is None:
            return None
        peca.setdefault("fontes", [decl.fonte])
        notas = list(peca.get("notas", []))
        # A `esperado_nota` NÃO entra: é uma asserção de construção («esperamos
        # 2 linhas»), escrita para quem mantém a receita. Quem abre a página
        # quer saber o que existe e o que falta, não o que nós contávamos
        # encontrar.
        for chave in ("incompleto_nota", "estado_nota"):
            nota = (decl.params.get(chave) or "").strip()
            if nota and nota not in notas:
                notas.append(nota)
        peca["notas"] = notas
        peca["incompleto"] = bool(peca.get("incompleto") or decl.params.get("incompleto"))
        return peca

    def _modo_bicicletas(self, decl, territorio) -> dict[str, Any] | None:
        """Um sistema de bicicletas partilhadas, a partir do GBFS já construído.

        **Não promete disponibilidade.** O `station_status` não é público
        (§6.4), e uma página que diga «3 bicicletas» sem o saber manda alguém
        a uma estação vazia. Sai `disponibilidade_publica: false`, e a página
        tem de o escrever.
        """
        caminho = self.destino.parent / decl.saida.strip("/") / "station_information.json"
        if not caminho.exists():
            return None
        dados = json.loads(caminho.read_text(encoding="utf-8"))
        sistema = decl.params.get("sistema") or {}
        estacoes = []
        for e in dados.get("data", {}).get("stations", []):
            try:
                lat, lon = float(e["lat"]), float(e["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            estacoes.append(
                {
                    # O `id` é o `station_id` do GBFS — e é por ele que a
                    # contagem ao vivo (o `station_status` que o serviço de
                    # disponibilidade serve) se junta a esta estação no
                    # navegador. Tem de ser o mesmo dos dois lados, e é: vem
                    # daqui, do feed que a construção produziu.
                    "id": e.get("station_id") or None,
                    "nome": e.get("name") or None,
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "concelho": self._concelho_de(territorio, lat, lon),
                }
            )
        estacoes.sort(key=lambda e: _simples(str(e["nome"] or "")))
        return {
            "sistemas": [
                {
                    "id": sistema.get("id") or decl.saida.strip("/").split("/")[-1],
                    "nome": sistema.get("nome") or "",
                    "operador": sistema.get("operador"),
                    "estado": decl.params.get("estado"),
                    "disponibilidade_publica": bool(decl.params.get("station_status")),
                    "estacoes": estacoes,
                }
            ]
        }

    def _modo_pontos(self, decl, territorio) -> dict[str, Any] | None:
        """Pontos soltos num GeoJSON — as praças de táxi, por exemplo."""
        caminho = self.destino.parent / decl.saida
        if not caminho.exists():
            return None
        dados = json.loads(caminho.read_text(encoding="utf-8"))
        pontos = []
        for f in dados.get("features", []):
            coords = (f.get("geometry") or {}).get("coordinates") or []
            if len(coords) < 2:
                continue
            lon, lat = float(coords[0]), float(coords[1])
            p = f.get("properties") or {}
            pontos.append(
                {
                    "id": str(f.get("id") or ""),
                    "nome": p.get("nome") or None,
                    "operador": p.get("operador") or None,
                    "telefone": p.get("telefone") or None,
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "concelho": self._concelho_de(territorio, lat, lon),
                }
            )
        pontos.sort(
            key=lambda p: (_simples(str(p["concelho"] or "~")), _simples(str(p["nome"] or "")))
        )
        return {"pontos": pontos}

    def _modo_percursos(self, decl, territorio) -> dict[str, Any] | None:
        """Percursos de um GeoJSON de rotas — os urbanos municipais.

        Sai o TRAÇADO e mais nada: o OpenStreetMap tem por onde a linha passa,
        não tem as paragens nem as horas. A página diz isso por extenso em vez
        de mostrar um percurso e deixar quem o vê supor que há horário.
        """
        caminho = self.destino.parent / decl.saida
        if not caminho.exists():
            return None
        dados = json.loads(caminho.read_text(encoding="utf-8"))
        percursos = []
        for f in dados.get("features", []):
            p = f.get("properties") or {}
            percursos.append(
                {
                    "nome": p.get("nome") or p.get("ref") or "",
                    "operador": p.get("operador") or None,
                    "rede": p.get("rede") or None,
                    "cor": p.get("cor") or None,
                }
            )
        percursos.sort(key=lambda p: _simples(str(p["nome"])))
        return {
            "percursos": percursos,
            "notas": [
                "O traçado destas linhas vem do OpenStreetMap: é por onde elas "
                "passam. As paragens e as horas não estão lá — quando existem, "
                "vêm dos cartazes de quem as opera."
            ],
        }

    def _modo_cartaz(self, decl, territorio) -> dict[str, Any] | None:
        """Uma linha lida do cartaz da câmara: a sequência das paragens e as horas.

        É a diferença entre a página dos urbanos municipais dizer «pergunte à
        câmara» e dizer «passa às 06:45 na Av. Nogueiral». É um horário, e um
        horário é o que se procura numa paragem.

        As coordenadas existem para PARTE das paragens (ver `urbanos.py`), e
        a parte importa: uma linha com metade das paragens no mapa não é um
        feed, não entra no planeador e não se desenha inteira. Por isso a
        página leva o número — quantas estão no sítio e quantas só têm hora —
        em vez de mostrar meia linha e deixar quem a vê supor que é toda.

        Um cartaz que o leitor se recusou a publicar não tem ficheiro, e aqui
        não aparece: a lacuna é que o nomeia, no relatório.
        """
        caminho = self.destino.parent / decl.saida
        if not caminho.exists():
            return None
        linha = json.loads(caminho.read_text(encoding="utf-8"))
        quadros = linha.get("quadros") or []
        return {
            "horarios": [
                {
                    "id": linha.get("id", ""),
                    "nome": linha.get("nome", ""),
                    "operador": linha.get("operador") or None,
                    "rede": linha.get("rede") or None,
                    "cor": linha.get("cor") or None,
                    "regras": linha.get("regras") or [],
                    # AS PARAGENS DA LINHA, e não as do primeiro quadro.
                    #
                    # O cartaz do TURE tem seis grelhas — cinco carreiras e os
                    # horários especiais — e a primeira tem 25 paragens. A
                    # linha tem 85. O cartão dizia «25 paragens» e, três
                    # linhas abaixo, «as outras 81 têm hora e não têm sítio»:
                    # contradizia-se a si próprio na mesma página.
                    "paragens": list(
                        dict.fromkeys(n for q in quadros for n in q.get("paragens") or [])
                    ),
                    "viagens": sum(len(q.get("viagens") or []) for q in quadros),
                    "quadros": quadros,
                    "transcrito_por": linha.get("transcrito_por", ""),
                    "transcrito_em": linha.get("transcrito_em", ""),
                    "concelho": decl.params.get("concelho") or None,
                    "coordenadas": {
                        nome: {"lat": p["lat"], "lon": p["lon"], "fonte": p["fonte"]}
                        for nome, p in (linha.get("coordenadas") or {}).items()
                    },
                    "sem_coordenada": linha.get("sem_coordenada") or [],
                }
            ],
        }

    def _modo_feed(self, decl, territorio) -> dict[str, Any] | None:
        """Um feed de terceiro — os expressos.

        Interessa o que ele diz DESTA região: onde param, e para onde vão a
        partir daqui. A viagem inteira fica no feed (é o que o `fontes.yaml`
        manda guardar); aqui mostra-se a ponta que serve quem está cá.
        """
        feed = self._feed(decl.saida.split("/")[-1])
        if feed is None:
            return None
        rota_de_viagem = {t["trip_id"]: t.get("route_id") for t in feed.trips}
        rotas = {r["route_id"]: r for r in feed.routes}
        por_paragem: dict[str, set[str]] = collections.defaultdict(set)
        # A sequência de cada viagem, para se saber PARA ONDE se vai daqui.
        sequencia: dict[str, list[tuple[int, str]]] = collections.defaultdict(list)
        for h in feed.stop_times:
            rid = rota_de_viagem.get(h.get("trip_id", ""))
            sid = h.get("stop_id")
            if rid and sid:
                por_paragem[sid].add(str(rid))
            tid = h.get("trip_id")
            if tid and sid:
                try:
                    sequencia[str(tid)].append((int(h.get("stop_sequence", 0)), str(sid)))
                except (TypeError, ValueError):
                    continue

        # PARA ONDE SE VAI DAQUI, paragem a paragem.
        #
        # Um destino é uma paragem que vem DEPOIS desta na mesma viagem — e
        # não qualquer paragem da mesma linha. A diferença não é subtil: a
        # linha que passa em Tomar a caminho de Lisboa também passa em Coimbra,
        # mas quem está em Tomar não vai a Coimbra nesse autocarro. Pôr Coimbra
        # na lista era prometer uma viagem que não existe.
        destinos_de: dict[str, set[str]] = collections.defaultdict(set)
        for ps in sequencia.values():
            percurso = [s for _, s in sorted(ps)]
            for i, origem in enumerate(percurso):
                destinos_de[origem].update(percurso[i + 1 :])

        nomes_das_paragens = {str(s["stop_id"]): s.get("stop_name", "") for s in feed.stops}

        paragens = []
        for s in feed.stops:
            try:
                lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
            except (KeyError, ValueError):
                continue
            dentro = (
                territorio.contem(lat, lon) if territorio else self.regiao.caixa.contem(lat, lon)
            )
            if not dentro:
                continue
            linhas = []
            for rid in sorted(por_paragem.get(str(s["stop_id"]), set())):
                r = rotas.get(rid) or {}
                linhas.append(
                    {
                        "nome": str(r.get("route_short_name") or rid),
                        "destino": r.get("route_long_name") or "",
                    }
                )
            paragens.append(
                {
                    # O IDENTIFICADOR FICA, e é isto que torna possível
                    # perguntar ao operador o que custa hoje. O `stop_id` do
                    # feed dele É o que a pesquisa dele aceita — medido, não
                    # suposto —, por isso não há tabela nenhuma a manter.
                    "id": str(s["stop_id"]),
                    "nome": s.get("stop_name", ""),
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "concelho": self._concelho_de(territorio, lat, lon),
                    "linhas": sorted(linhas, key=lambda x: _simples(x["nome"])),
                    # Os nomes aqui são os do feed, em inglês. Quem pergunta ao
                    # operador recebe de volta o nome como ele o escreve em
                    # português — e é esse que a página mostra a seguir.
                    "destinos": sorted(
                        (
                            {"id": d, "nome": str(nomes_das_paragens.get(d, d))}
                            for d in destinos_de.get(str(s["stop_id"]), set())
                        ),
                        key=lambda x: _simples(x["nome"]),
                    ),
                }
            )
        paragens.sort(key=lambda p: _simples(str(p["nome"])))

        # O OPERADOR SAI DAS ROTAS QUE PARAM AQUI, e não da tabela de agências.
        #
        # O feed da FlixBus traz também a FlixTrain. Tirar o operador de
        # `agency.txt` punha «FlixTrain» na página de uma região onde ela não
        # para — uma frase falsa produzida por um atalho de uma linha.
        servem = {rid for p in paragens for rid in por_paragem.get(str(p["id"]), set())}
        agencias = {a["agency_id"]: a for a in feed.obter("agency.txt")}
        operadores = []
        ids = {(rotas.get(r) or {}).get("agency_id") for r in servem}
        for aid in sorted(str(x) for x in ids if x):
            a = agencias.get(aid) or {}
            operadores.append(
                {
                    "nome": str(a.get("agency_name") or aid).strip(),
                    "sitio": (a.get("agency_url") or "").strip() or None,
                    "bilhetes": (a.get("agency_fare_url") or "").strip() or None,
                }
            )
        return {
            "paragens": paragens,
            "operadores": operadores,
            "notas": [
                "Serviço de um operador privado. Os bilhetes vendem-se no sítio "
                "dele, e os títulos desta região não servem.",
                # A INTERFACE É EM PORTUGUÊS (§1) E ESTES NOMES NÃO SÃO.
                #
                # Vêm do feed do operador, que os escreve em inglês — «Bus
                # Station». Traduzi-los aqui era escrever à mão o nome de uma
                # paragem de terceiro, que é o que o §4.4 não deixa. O próprio
                # operador publica os nomes em português quando se lhe
                # pergunta, e é por isso que a consulta de preços os mostra
                # certos; o que falta é trazê-los para as páginas estáticas.
                "Os nomes das paragens são os que o operador publica no feed "
                "dele, em inglês. Quando se consultam os preços, aparecem "
                "como ele os escreve em português.",
            ],
        }

    def _concelho_de(self, territorio, lat: float, lon: float) -> str | None:
        if territorio is None:
            return None
        limite = territorio.concelho_de(lat, lon)
        return self._concelho_por_dico(limite.codigo) if limite else None


def _ordem_de_linha(codigo: str) -> str:
    """«10» antes de «1001», e ambos antes de «TUA». Ordem de gente, não de ASCII."""
    if codigo.isdigit():
        return f"0{int(codigo):08d}"
    return f"1{_simples(codigo)}"


def _modo_gtfs(route_type: str) -> str:
    """O `route_type` do GTFS, dito em português e pelos modos que a região usa."""
    return {
        "0": "eletrico",
        "1": "metro",
        "2": "comboio",
        "3": "autocarro",
        "4": "barco",
        "5": "eletrico",
        "6": "teleferico",
        "7": "funicular",
        "11": "trolei",
        "715": "a-pedido",
    }.get(str(route_type).strip(), "autocarro")


# ---------------------------------------------------------------------------
# construir tudo
# ---------------------------------------------------------------------------


class SitioVazio(Exception):
    """Um sítio sem paragens nenhumas não é um sítio: é uma suposição partida."""


def construir(raiz: Path, regiao: Regiao, destino: Path, territorio=None) -> Sitio:
    """Escreve `build/<regiao>/sitio/` inteiro."""
    s = Sitio(raiz, regiao, destino)

    # Limpa a saída anterior. Sem isto, um ficheiro que o pipeline deixou de
    # escrever fica lá para sempre: foi o que aconteceu ao `paragens/`, que
    # sobreviveu à mudança para `partidas/` e teria ido para o ar com dados
    # velhos, sem ninguém dar por isso.
    import shutil

    shutil.rmtree(s.destino, ignore_errors=True)

    # ISTO EXISTE PORQUE FALHOU EM SILÊNCIO UMA VEZ.
    #
    # O `sitio.py` pedia o feed pelo nome do ficheiro do Médio Tejo. Quando a
    # segunda região entrou, não encontrou o dela e escreveu um sítio completo
    # e vazio — todas as páginas, zero paragens —, sem um aviso. Um erro que se
    # vê é barato; uma página vazia que parece certa custa a quem a abrir.
    if not s.feed_proprio:
        raise SitioVazio(
            f"a região {regiao.id!r} não declara nenhuma saída com "
            "`papel: horarios` ou `papel: feed-proprio` — sem isso não há rede para mostrar. "
            f"Ver regioes/{regiao.id}/fontes.yaml."
        )

    indice_paragens, partidas = s.paragens(territorio)
    indice_linhas, linhas = s.linhas()
    estacoes = s.estacoes(territorio, indice_paragens)

    if not indice_paragens:
        raise SitioVazio(
            f"a região {regiao.id!r} produziu ZERO paragens a partir de "
            f"{s.feed_proprio!r}. O feed existe mas não deu nada — ou está vazio, "
            "ou o recorte territorial deixou tudo de fora."
        )

    s._escrever("regiao.json", s.regiao_json())
    s._escrever("concelhos.json", s.concelhos_json(indice_paragens))
    s._escrever("paragens.json", indice_paragens)
    s._escrever("linhas.json", indice_linhas)
    # AS CORES DAS LINHAS, E SÓ AS CORES. O distintivo na folha de partidas
    # leva o `route_color` do feed, e a cor não vai dentro de cada partida —
    # são dezenas de milhares, a repetir 122 vezes a mesma coisa. Um mapa de
    # identificador para cor, alguns kB, que o navegador lê uma vez. Era o
    # sítio que o derivava do índice ao construir; passa a ser o pipeline,
    # porque é o pipeline que escreve tudo o que o sítio lê.
    s._escrever(
        "cores-das-linhas.json",
        {str(linha["id"]): linha["cor"] for linha in indice_linhas if linha.get("cor")},
    )
    s._escrever("estacoes.json", estacoes)
    s._escrever("tarifas.json", _tarifas(regiao))
    s._escrever("a-pedido.json", _a_pedido(regiao, s.destino.parent))
    modos = s.modos(territorio)
    s._escrever("modos.json", modos)

    # A GRELHA HORÁRIA, que é o planeador inteiro num ficheiro.
    #
    # Vai à parte e não com a página: só quem abre as direções é que paga o
    # que ela pesa, e quem só quer ver o mapa não paga nada. É a mesma decisão
    # do `sitios.json`.
    from . import grelha as _grelha

    g, quantas = s.grelha(territorio)
    if g is not None:
        # AS VIAGENS DE PROVA, FORA DO SÍTIO.
        #
        # Vão para `build/<regiao>/` e não para `build/<regiao>/sitio/`: são o
        # critério de aceitação do §9, e não têm nada que ser descarregadas por
        # quem só quer apanhar um autocarro. O oráculo do CI lê-as daqui.
        (destino / "oraculo.json").write_text(
            json.dumps(
                {
                    "regiao": regiao.id,
                    "fuso": (regiao.motor or {}).get("fuso", "UTC"),
                    "viagens": (regiao.motor or {}).get("viagens_de_prova") or [],
                },
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
        bytes_escritos = _grelha.escrever(
            s.destino / "viagens.json", g, (regiao.motor or {}).get("fuso", "UTC")
        )
        s.saidas.append(Saida(s.destino / "viagens.json", bytes_escritos, quantas))

        # POR ONDE PASSA O AUTOCARRO entre uma paragem e a seguinte.
        #
        # Sem isto o mapa desenha uma linha reta de paragem em paragem — e o
        # motor de viagens não resolvia: para 51 paragens devolvia 100 pontos,
        # exatamente 2 por troço. A forma vem de quem a desenhou, que é a
        # operadora: o feed que serve de BASE GEOMÉTRICA à reconstrução
        # (§6.2) traz os traçados, e corta-se cada um nas paragens.
        quantas_linhas, bytes_percursos = _percursos(s, regiao, g)
        if quantas_linhas:
            s.saidas.append(Saida(s.destino / "percursos", bytes_percursos, quantas_linhas))
    s._escrever("lacunas.json", _lacunas(raiz, regiao))
    s._escrever("dados-abertos.json", _dados_abertos(raiz, regiao, destino, s.destino))
    indice = _procura(indice_paragens, estacoes, modos)
    s._escrever("procura.json", indice, len(indice["pontos"]))

    # OS SÍTIOS VÃO NUM FICHEIRO À PARTE, e é uma decisão de dados móveis.
    #
    # São 28 mil no Médio Tejo, contra 2 419 paragens. Juntá-los ao
    # `procura.json` multiplicava por dez o que o telemóvel descarrega ao abrir
    # a página — e quem só quer ver o mapa não escreve nada na caixa.
    #
    # Assim: as paragens vêm com a página, os sítios vêm à PRIMEIRA TECLA.
    # Quem procura paga o pedido; quem não procura não paga nada.
    sitios = _sitios(raiz, regiao)
    if sitios["sitios"]:
        s._escrever("sitios.json", sitios, len(sitios["sitios"]))

    # AS PARTIDAS VÃO AGRUPADAS POR CONCELHO, e o número que decidiu isso é
    # 14 394: o total de ficheiros do sítio quando cada paragem tinha o seu.
    # O limite da plataforma são 15 000, e o mapa ainda não tinha entrado —
    # ou seja, o desenho partia na região seguinte.
    #
    # Medido, por concelho: o maior é Tomar com 904 paragens, 1,3 MB em bruto
    # e **50 kB com gzip**. Um pedido. Quem está numa paragem está num
    # concelho, e é esse que o navegador busca.
    #
    # 4 634 ficheiros → 14. E o custo por quem os usa não subiu: antes eram
    # três pedidos pequenos, agora é um pedido pequeno.
    por_concelho: dict[str, dict[str, Any]] = {}
    concelho_de = {p["id"]: (p.get("concelho") or "fora-da-regiao") for p in indice_paragens}
    for sid, lista in partidas.items():
        por_concelho.setdefault(concelho_de.get(sid, "fora-da-regiao"), {})[sid] = lista
    for concelho, mapa in por_concelho.items():
        s._escrever(f"partidas/{_seguro(concelho)}.json", mapa, len(mapa))

    # E UMA FICHA POR PARAGEM, para o servidor do sítio.
    #
    # O ficheiro do concelho é para o NAVEGADOR — o mapa e o «Perto de ti»
    # pedem-no uma vez e servem dezenas de paragens. A página de uma paragem
    # é outra conta: rende-se no servidor e fica em cache, e a cache de dados
    # do Next não guarda respostas acima de 2 MB — Tomar, em base64, passa
    # disso. Uma página que relê 1,6 MB a cada renderização para tirar de lá
    # cinco linhas é o desenho errado. A ficha traz a paragem e as partidas
    # dela: alguns kB, e é só isso que a página lê.
    #
    # O nome do ficheiro é o do endereço da página (`_seguro`): há
    # identificadores com vírgulas e pontos, e um endereço que acaba em ponto
    # parece um ficheiro a quem serve — dava 404 antes de chegar à página.
    ficha_de: dict[str, str] = {}
    pasta = s.destino / "paragens"
    pasta.mkdir(parents=True, exist_ok=True)
    total = 0
    for p in indice_paragens:
        nome = _seguro(p["id"])
        if nome in ficha_de:
            raise SitioVazio(
                f"duas paragens ficam com o mesmo endereço {nome!r}: "
                f"{ficha_de[nome]!r} e {p['id']!r}"
            )
        ficha_de[nome] = p["id"]
        # `sort_keys` como no `_escrever`: determinista, para que o MD5 de uma
        # ficha que não mudou seja o mesmo e o `publicar` a salte.
        texto = json.dumps(
            {"paragem": p, "partidas": partidas.get(p["id"], [])},
            ensure_ascii=False,
            sort_keys=True,
            default=_json_seguro,
        )
        (pasta / f"{nome}.json").write_text(texto + "\n", encoding="utf-8")
        total += len(texto) + 1
    s.saidas.append(Saida(pasta, total, len(indice_paragens)))

    # QUE SERVIÇOS ANDAM EM QUE DIA, para a folha da paragem não mostrar os
    # três tipos de dia ao mesmo tempo.
    #
    # Vive à parte e não dentro das partidas: é o MESMO para os catorze
    # concelhos, e repeti-lo em cada um era pagá-lo catorze vezes. São 46 kB
    # comprimidos ao lado de um ficheiro de partidas que já pesa cinquenta,
    # e busca-se uma vez.
    #
    # É a mesma tabela que a grelha do planeador usa — não uma segunda cópia
    # da verdade. Se divergirem, a paragem e o planeador discordam sobre o
    # mesmo autocarro, e quem lê não tem como saber qual está certo.
    if g is not None:
        s._escrever(
            "servicos.json",
            {"servicos": g.servicos, "datas": {d: sorted(v) for d, v in sorted(g.datas.items())}},
            len(g.servicos),
        )
    for rid, dados in linhas.items():
        s._escrever(f"linhas/{_seguro(rid)}.json", dados)
    return s


def _percursos(s: Sitio, regiao: Regiao, g) -> tuple[int, int]:
    """Os traçados por linha, a partir do `shapes.txt` do feed da própria rede.

    ERA de um feed de terceiro declarado como «base geométrica», e deixou de
    ser (CLAUDE.md §11.8): a rede passou a construir-se com os seus próprios
    traçados, e os do feed são exatamente os percursos destas viagens — não os
    de outra edição da rede, com paragens a mais e a menos.

    Não sabe o que é a região: pergunta-lhe qual é o feed da rede própria. Um
    feed sem `shapes.txt` não tem traçados, e a interface desenha a direito —
    que é o que sempre fez.
    """
    from . import percursos as _mod

    proprio = s.feed_proprio
    if not proprio:
        return 0, 0
    feed = s._feed(proprio)
    if feed is None or "shapes.txt" not in feed:
        return 0, 0
    feito = _mod.construir(
        feed,
        g.para_json((regiao.motor or {}).get("fuso", "UTC")),
        prefixo=f"{proprio.removesuffix('.zip')}:",
    )
    if not feito.por_linha:
        return 0, 0
    return _mod.escrever(s.destino, feito, g.para_json((regiao.motor or {}).get("fuso", "UTC")))


def _procura(
    paragens: list[dict], estacoes: list[dict], modos: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Os pontos do mapa, e o índice de quem escreve na caixa de procura.

    **Vai em listas e não em objetos, de propósito.** O `paragens.json` tem
    843 kB e serve para construir as páginas — carregá-lo no telemóvel de
    alguém que só quer escrever «Tomar» era gastar-lhe os dados por nada. Aqui
    cada paragem é `[nome, lat, lon, tipo]` e as chaves estão no cabeçalho: dá
    cerca de um terço, e o resto faz-se com o `gzip` do servidor.
    """
    # O `id` entrou para o «Perto de ti». O planeador só precisava de
    # coordenadas — manda-as ao motor e acabou —, mas quem vê «a 180 m: Tomar
    # (Hospital)» quer tocar-lhe e ver as horas. Sem o identificador não há
    # ligação para a página, e o bloco ficava a ser uma lista de nomes sem
    # saída.
    campos = ["nome", "lat", "lon", "tipo", "paragens", "id", "concelho"]

    # UM PONTO POR NOME. Uma paragem tem quase sempre duas: uma de cada lado da
    # estrada. Na página fazem falta as duas — são sítios diferentes onde se
    # espera. Na procura são a mesma resposta escrita duas vezes, e quem
    # escreve «Tomar» não quer escolher entre duas linhas iguais.
    #
    # Fica a MAIS SERVIDA de cada nome, que é a que tem mais hipóteses de ser
    # aquela em que a pessoa está a pensar. O motor parte de coordenadas e
    # apanha as vizinhas na mesma, por isso escolher o lado errado da estrada
    # custa uma travessia, não uma viagem.
    melhor: dict[str, list[Any]] = {}
    for p in paragens:
        # Uma paragem sem partidas não é sítio de onde se parta, e só atrapalha
        # quem escreve. Fica de fora da procura — e continua a ter página.
        if not p.get("partidas"):
            continue
        nome = p["nome"]
        anterior = melhor.get(nome)
        if anterior is None or p["partidas"] > anterior[4]:
            melhor[nome] = [
                nome,
                p["lat"],
                p["lon"],
                "paragem",
                p["partidas"],
                p["id"],
                p.get("concelho") or "fora-da-regiao",
            ]

    for e in estacoes:
        # As estações entram sempre, mesmo com o mesmo nome de uma paragem:
        # «Entroncamento» a estação e «Entroncamento (Bombeiros)» a paragem são
        # sítios diferentes, e quem procura a estação procura a estação.
        melhor[f"{e['nome']} (estação)"] = [
            f"{e['nome']} (estação)",
            e["lat"],
            e["lon"],
            "estacao",
            0,
            e["id"],
            e.get("concelho") or "fora-da-regiao",
        ]

    melhor.update(_pontos_dos_modos(modos or {}, campos))

    linhas = sorted(melhor.values(), key=lambda x: _simples(str(x[0])))
    return {"campos": campos, "pontos": linhas}


def _pontos_dos_modos(modos: dict[str, Any], campos: list[str]) -> dict[str, list[Any]]:
    """Os pontos dos outros modos — bicicletas, táxis, urbanos municipais.

    **Vai pela FORMA e não pelo nome do modo.** Cada peça de `modos.json` já
    veio de um leitor que é um formato: um sistema de bicicletas traz
    `sistemas` com estações, um levantamento de pontos traz `pontos`, um
    cartaz traz `horarios` com as coordenadas que se conseguiram resolver.
    Quem trata da forma trata de qualquer região — uma que declare um modo
    que nunca vimos ganha os pontos na mesma, sem um commit (§11.5).

    O `tipo` de cada ponto é o nome do modo tal como a região o declara. É com
    ele que o mapa escolhe a cor e o filtro, e por isso nem a cor nem o filtro
    precisam de conhecer nenhum modo em particular.

    **E aqui NÃO se junta um ponto por nome**, ao contrário das paragens. Duas
    praças de táxi chamam-se as duas «Praça de táxis» — muitas nem nome têm no
    mapa — e juntá-las pelo nome deixava uma no sítio de nove. A chave é o
    identificador.
    """
    saida: dict[str, list[Any]] = {}

    def juntar(tipo: str, ident: str, nome: str, lat: Any, lon: Any, concelho: Any) -> None:
        try:
            lat, lon = float(lat), float(lon)
        except (TypeError, ValueError):
            return
        chave = f"{tipo}:{ident}"
        # `campos` é o cabeçalho, e a ordem dele é o contrato com o navegador.
        valores = {
            "nome": nome,
            "lat": lat,
            "lon": lon,
            "tipo": tipo,
            "paragens": 0,
            "id": ident,
            "concelho": concelho or "fora-da-regiao",
        }
        saida[chave] = [valores[c] for c in campos]

    for modo, peca in modos.items():
        for sistema in peca.get("sistemas") or []:
            for e in sistema.get("estacoes") or []:
                juntar(
                    modo,
                    str(e.get("id") or ""),
                    str(e.get("nome") or ""),
                    e.get("lat"),
                    e.get("lon"),
                    e.get("concelho"),
                )
        # AS PARAGENS DE UM MODO SÃO PONTOS COMO OS OUTROS.
        #
        # Faltava este ramo, e o que faltava no mapa eram os quatro cais dos
        # expressos — Abrantes, Fátima, Tomar e Torres Novas. O leitor sempre
        # os trouxe com coordenadas; ninguém os lia aqui, e o mapa não tinha
        # filtro «Expresso» porque não tinha um único ponto desse tipo. Quem
        # quisesse saber de onde parte a camioneta para Lisboa tinha de
        # adivinhar que era do mesmo cais da rede.
        #
        # É pela FORMA, como o resto desta função: qualquer modo que traga
        # `paragens` com coordenadas ganha pontos, sem que isto saiba o nome
        # de nenhum.
        for paragem in peca.get("paragens") or []:
            juntar(
                modo,
                str(paragem.get("id") or ""),
                str(paragem.get("nome") or ""),
                paragem.get("lat"),
                paragem.get("lon"),
                paragem.get("concelho"),
            )
        for i, ponto in enumerate(peca.get("pontos") or []):
            # Um ponto sem nome no mapa é um ponto na mesma, e tem de se poder
            # tocar nele. O que NÃO se faz é inventar-lhe um nome próprio: o
            # rótulo diz o que é, e a página do modo diz o resto.
            juntar(
                modo,
                str(ponto.get("id") or f"{modo}-{i}"),
                str(ponto.get("nome") or ponto.get("operador") or ""),
                ponto.get("lat"),
                ponto.get("lon"),
                ponto.get("concelho"),
            )
        # UMA PARAGEM PARTILHADA É UM PONTO, e não um por linha. A «Av. 8 de
        # Julho» é da Azul e da Vermelha, e dois círculos no mesmo sítio
        # empilham-se: o de cima tapa o de baixo, e quem toca acerta num ao
        # acaso. A chave é a COORDENADA, e a página do modo é que diz por que
        # linhas ali se passa.
        for h in peca.get("horarios") or []:
            for nome, ponto in (h.get("coordenadas") or {}).items():
                juntar(
                    modo,
                    f"{ponto.get('lat')},{ponto.get('lon')}",
                    nome,
                    ponto.get("lat"),
                    ponto.get("lon"),
                    h.get("concelho"),
                )
    return saida


def _sitios(raiz: Path, regiao: Regiao) -> dict[str, Any]:
    """O índice dos sítios do OpenStreetMap, em listas e não em objetos.

    A mesma economia do `procura.json`: as chaves vão no cabeçalho uma vez, e
    cada sítio é uma lista. Dá cerca de um terço, e o resto faz-se com o gzip.

    A `classe` crua vai junto para a interface poder ordenar: quem escreve
    «Tomar» quer a cidade antes de uma pastelaria com o mesmo nome, e sem a
    classe não há como saber qual é qual.
    """
    caminho = raiz / "build" / regiao.id / "geojson" / "sitios.geojson"
    if not caminho.exists():
        return {"campos": [], "sitios": []}

    dados = json.loads(caminho.read_text(encoding="utf-8"))
    linhas = []
    for f in dados.get("features", []):
        p = f.get("properties") or {}
        lon, lat = (f.get("geometry") or {}).get("coordinates", [None, None])
        if lat is None or not p.get("nome"):
            continue
        linhas.append(
            [
                p["nome"],
                round(float(lat), 6),
                round(float(lon), 6),
                p.get("tipo") or "",
                p.get("classe") or "",
            ]
        )

    linhas.sort(key=lambda x: _simples(str(x[0])))
    return {"campos": ["nome", "lat", "lon", "tipo", "classe"], "sitios": linhas}


def _seguro(identificador: str) -> str:
    """Um `stop_id` vai para um nome de ficheiro e para um endereço.

    Não se inventa um identificador novo — perdia-se a ligação ao GTFS. Só se
    substitui o que não pode ir num caminho.
    """
    # ASCII só, como o `seguro()` do sítio: o `isalnum` de Python aceita «é» e o
    # navegador não, e um nome de ficheiro que os dois escrevam de maneira
    # diferente é uma ligação partida.
    return "".join(c if (c.isascii() and c.isalnum()) or c in "-_" else "-" for c in identificador)


def _tarifas(regiao: Regiao) -> dict[str, Any]:
    t = dict(regiao.tarifas or {})
    titulos = t.get("titulos") or []
    return {
        "moeda": t.get("moeda", "EUR"),
        "titulos": titulos,
        # O número que a página tem de mostrar em cima: quantos preços ainda
        # não foram conferidos na fonte. Um preço errado é dito a alguém que o
        # vai pagar (§4.4).
        "por_confirmar": sum(1 for x in titulos if not x.get("confirmado")),
        "reservas": t.get("reservas") or {},
    }


def _a_pedido(regiao: Regiao, construcao: Path | None = None) -> dict[str, Any]:
    """O transporte a pedido, com a regra de reserva ao lado das zonas.

    As duas coisas vivem em ficheiros diferentes — as zonas em `a-pedido.yaml`,
    a regra de reserva em `tarifas.yaml`, porque é lá que estão os preços — e
    juntam-se aqui. Na página não podem estar separadas: uma zona sem a regra
    de reserva é uma promessa de serviço que não diz como se usa, e é assim
    que alguém fica à espera de um autocarro que ninguém chamou.

    Uma região sem `a-pedido.yaml` devolve `{}`, e a página não se gera.
    """
    d = dict(regiao.a_pedido or {})
    if not d.get("zonas"):
        return {}
    horarios = _horarios_a_pedido(construcao, regiao)
    reservas = (regiao.tarifas or {}).get("reservas") or {}
    nomes = {c.id: c.nome for c in regiao.concelhos}
    catalogo = _catalogo(d.get("circuitos") or [], horarios)
    # O MESMO HORÁRIO, TAMBÉM DENTRO DA ZONA. A lista da zona é onde alguém
    # procura primeiro — procura-se pelo sítio onde se mora, não pelo catálogo
    # todo —, e até aqui dizia «horário por levantar» mesmo quando o horário
    # existia noutra secção da mesma página.
    de_nome = {c["nome"]: c["horario"] for c in catalogo if c.get("horario")}
    zonas = []
    for z in d["zonas"]:
        zonas.append(
            {
                **z,
                # O nome do concelho vem da declaração da região e não do
                # ficheiro do a pedido: dois sítios a escrever «Ferreira do
                # Zêzere» são dois sítios para o escrever de maneiras
                # diferentes.
                "concelho_nome": nomes.get(z.get("concelho") or "", ""),
                "circuitos": [
                    _com_horario(c, de_nome, horarios) for c in (z.get("circuitos") or [])
                ],
            }
        )
    return {
        "zonas": zonas,
        "reservas": reservas.get("transporte_a_pedido") or {},
        "sem_zona": [
            {"id": c, "nome": nomes.get(c, c)} for c in (d.get("concelhos_sem_zona") or [])
        ],
        "contagens_por_conciliar": d.get("contagens_por_conciliar") or {},
        "fonte": d.get("fonte", ""),
        # O CATÁLOGO: os circuitos que se sabe existirem, pelo nome que o
        # sistema de reservas lhes dá. É contra esta lista que se mede quanto
        # falta, em vez de se medir contra uma estimativa.
        #
        # Cada um leva agora o GRUPO onde está o horário dele, quando há: o
        # catálogo divide por zona de operação e a brochura por concelho, e
        # levou a ligação a ser feita à mão, circuito a circuito. Aqui só se
        # traduz o ficheiro de saída para o identificador do grupo, que é o
        # que a página usa para lá chegar.
        "circuitos": catalogo,
        # E OS QUE JÁ TÊM HORÁRIO, lidos das brochuras que a autoridade
        # publica. Agrupados por CONCELHO e não por zona: a brochura diz de
        # que concelho é, e atribuir-lhe uma zona era deduzir — a mesma
        # dedução que este ficheiro se recusa a fazer em todo o lado.
        "horarios": horarios,
        # O que a página tem de dizer em cima, e que é a verdade desta fase:
        # quantas zonas ainda não têm um único circuito levantado.
        "zonas_sem_circuitos": sum(1 for z in zonas if not z["circuitos"]),
    }


def _com_horario(
    c: dict[str, Any], de_nome: dict[str, dict], horarios: list[dict[str, Any]]
) -> dict[str, Any]:
    """Um circuito de uma zona, com o horário dele quando há.

    Dois caminhos, e o próprio ganha ao herdado: um circuito da zona pode
    declarar o seu `horario_em` — é o caso do painel das praias fluviais, que
    a página pública dá como um e o catálogo do sistema dá como três —, e sem
    isso herda o do circuito com o mesmo nome no catálogo.
    """
    if c.get("horario_em"):
        return _catalogo([c], horarios)[0]
    if c.get("nome") in de_nome:
        return {**c, "horario": de_nome[c["nome"]]}
    return c


def _catalogo(circuitos: list[dict[str, Any]], horarios: list[dict[str, Any]]) -> list[dict]:
    """O catálogo com o grupo onde está o horário de cada circuito.

    O `horario_em` da declaração nomeia o FICHEIRO de saída (`tap/sardoal.json`)
    porque é isso que se sabe quando se decide a ligação. A página precisa do
    identificador do grupo, que é o mesmo nome sem a pasta nem a extensão.

    **Uma ligação que não resolve some-se em silêncio**, e por isso não se
    inventa aqui: se o grupo não existe na construção — um ficheiro renomeado,
    uma receita que deixou de correr —, o circuito fica sem horário e volta a
    aparecer no relatório de lacunas, que é onde alguém o vê. É o mesmo que
    fazer de conta que nunca houve ligação, e é o que queremos: o silencioso é
    mostrar um nome de quadro que a página não tem.
    """
    grupos = {h["id"]: h for h in horarios}
    saida = []
    for c in circuitos:
        h = c.get("horario_em") or {}
        gid = str(h.get("saida", "")).removeprefix("tap/").removesuffix(".json")
        grupo = grupos.get(gid)
        # O caminho do ficheiro e a razão da decisão ficam na declaração, que é
        # onde se revêem. A página não precisa de nenhum dos dois.
        limpo = {k: v for k, v in c.items() if k not in ("horario_em", "prova")}
        if grupo and any(q.get("nome") == h.get("quadro") for q in grupo.get("quadros") or []):
            limpo["horario"] = {"grupo": gid, "quadro": h["quadro"]}
        saida.append(limpo)
    return saida


def _horarios_a_pedido(construcao: Path | None, regiao: Regiao) -> list[dict[str, Any]]:
    """Os circuitos que já têm horário, lidos das brochuras.

    Agrupam-se por CONCELHO. A brochura diz de que concelho é; a zona, não —
    e o sistema de reservas divide por zona de operação, que não é a mesma
    coisa. Atribuir uma era deduzir, e uma dedução errada manda alguém
    reservar onde não deve.

    Cada circuito traz a grelha inteira, e SEM COORDENADAS — aqui nem parte
    delas, ao contrário dos urbanos municipais: os pontos de um circuito a
    pedido não estão no mapa de ninguém. O que isto responde é «a que horas
    passa», que é a pergunta que se faz antes de ligar a reservar.
    """
    if construcao is None:
        return []
    nomes = {c.id: c.nome for c in regiao.concelhos}
    saida: list[dict[str, Any]] = []
    for decl in regiao.saidas:
        if decl.leitor not in LEITORES_DE_HORARIO or decl.modo != "a-pedido":
            continue
        caminho = construcao / (decl.saida or "")
        if not decl.saida or not caminho.exists():
            continue
        d = json.loads(caminho.read_text(encoding="utf-8"))
        concelho = decl.params.get("concelho", "")
        quadros = d.get("quadros") or []
        saida.append(
            {
                "id": d.get("id", ""),
                "nome": d.get("nome", ""),
                "concelho": concelho,
                "concelho_nome": nomes.get(concelho, ""),
                "circuito_de": decl.params.get("circuito_de", ""),
                "regras": d.get("regras") or [],
                "paragens": sorted({n for q in quadros for n in q.get("paragens", [])}),
                "viagens": sum(len(q.get("viagens") or []) for q in quadros),
                "quadros": quadros,
                # QUEM TRANSCREVEU, E QUANDO. Vem vazio nos que um leitor
                # leu sozinho, e é essa a diferença que a página mostra: o
                # guarda prova que cada hora está no PDF, mas que ela está
                # na paragem certa mediu-o alguém com os olhos, uma vez.
                # Quem lê tem direito a saber qual dos dois é.
                "transcrito_por": d.get("transcrito_por", ""),
                "transcrito_em": d.get("transcrito_em", ""),
            }
        )
    saida.sort(key=lambda h: (_simples(h["concelho_nome"]), _simples(h["nome"])))
    return saida


# OS AVISOS JÁ NÃO SAEM DAQUI.
#
# Eram um JSON estático que ninguém escrevia, à espera da gestão em Supabase
# que a Fase 4 prometia. Ela chegou: os avisos vivem na tabela `public.avisos`,
# escrevem-se no painel e lêem-se em direto (`web/src/lib/avisos.ts`). Deixar
# aqui um ficheiro a mais só servia para o próximo a mexer nisto procurar os
# avisos no sítio errado.
#
# É a única coisa que o sítio mostra e que o pipeline NÃO constrói, e a razão
# é o relógio: uma greve marcada para amanhã de manhã não pode esperar por uma
# construção.


def _lacunas(raiz: Path, regiao: Regiao) -> dict[str, Any]:
    """O relatório de lacunas, para a interface poder dizer o que não sabe.

    É isto que permite à página escrever «horários planeados, dados de
    dezembro de 2025» em vez de deixar quem lê presumir que é tempo real.
    """
    import json as _json

    ficheiro = raiz / "build" / "reports" / f"{regiao.id}.json"
    if not ficheiro.exists():
        return {"bloqueios": [], "lacunas": [], "avisos": [], "contagens": {}}
    d = _json.loads(ficheiro.read_text(encoding="utf-8"))

    # Só o que a interface precisa: o que falta e porquê. O relatório inteiro
    # tem amostras do validador que não interessam a quem visita.
    def limpar(itens):
        return [
            {k: v for k, v in x.items() if k in ("id", "o_que", "porque_importa", "quantos")}
            for x in itens
        ]

    return {
        "bloqueios": limpar(d.get("bloqueios") or []),
        "lacunas": limpar(d.get("lacunas") or []),
        "contagens": d.get("contagens") or {},
    }


# Os três termos com que um ficheiro pode sair daqui, e o que cada um quer
# dizer a quem o descarrega. Não é jargão: é a diferença entre poder reutilizar
# e poder olhar.
#
#   odbl      deriva SÓ do OpenStreetMap. A ODbL é uma licença aberta com
#             partilha nos mesmos termos, e a atribuição vai dentro do
#             ficheiro.
#   consulta  construído por nós a partir de fontes SEM licença aberta
#             declarada. Está aqui para se ver e conferir; a publicação com
#             licença aberta depende da autoridade de transportes (Fase 5).
#   terceiro  é o ficheiro de outra entidade, filtrado à região. Os termos
#             são os dela, e quem o quiser reutilizar fala com ela.
ODBL = "odbl"
CONSULTA = "consulta"
TERCEIRO = "terceiro"
#   nosso     inventado de propósito por nós, sob a licença do código. É o
#             caso das regiões de prova, e é o único que se pode levar sem
#             perguntar nada a ninguém.
NOSSO = "nosso"

# Por grupo, e por esta ordem: primeiro o que serve para usar a rede, depois o
# que serve para a conferir.
GRUPOS = ("feeds", "catalogos", "bicicletas", "geometria", "decisoes", "relatorios")


def _termos(fonte: Any, papel: str | None, licenca_da_saida: str | None = None) -> str:
    """O rótulo sai da licença da SAÍDA quando ela a declara, e só então da fonte.

    Era só da fonte, e isso estava errado na raiz: a licença de uma obra
    derivada não é a da entrada principal. O feed da rede sai de um caderno de
    horários que não declara licença — e por isso ficava «para consulta» — mas
    74 % dos traçados dele encaminham-se pelo OpenStreetMap, cuja partilha nos
    mesmos termos ganha a tudo o resto. O ficheiro não estava por licenciar:
    estava mal rotulado, e o rótulo era mais restritivo do que a realidade.
    """
    licenca = (licenca_da_saida or fonte.licenca or "").upper()
    if licenca.startswith("ODBL"):
        return ODBL
    if licenca.startswith(("AGPL", "CC-BY", "CC0", "MIT")):
        return NOSSO
    if papel == "feed-de-terceiro":
        return TERCEIRO
    return CONSULTA


def _grupo_de(relativo: str) -> str:
    inicio = relativo.split("/", 1)[0]
    if inicio == "gtfs":
        return "feeds"
    if inicio == "gbfs":
        return "bicicletas"
    if inicio in ("tap", "urbanos"):
        return "catalogos"
    if inicio == "geojson":
        return "geometria"
    if inicio == "decisoes":
        return "decisoes"
    return "relatorios"


def _zipar(pasta: Path, destino: Path) -> None:
    """Uma pasta de ficheiros pequenos vale mais como um ficheiro só.

    O GBFS são cinco JSON de quatro kilobytes; cinco ligações numa página é
    ruído, e quem os quer, quer todos.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for ficheiro in sorted(pasta.rglob("*")):
            if ficheiro.is_file():
                info = zipfile.ZipInfo(
                    str(ficheiro.relative_to(pasta)), date_time=(1980, 1, 1, 0, 0, 0)
                )
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, ficheiro.read_bytes())


def _dados_abertos(raiz: Path, regiao: Regiao, destino: Path, sitio: Path) -> list[dict[str, Any]]:
    """O que se pode descarregar, com o ficheiro à frente e os termos ao lado.

    ERA UMA TABELA SEM LIGAÇÕES — dizia o que existia e não deixava ninguém
    levar nada. Uma página de dados abertos onde não se descarrega nada é uma
    promessa por cumprir; os mesmos dados já estavam no sítio, página a
    página, e quem os quisesse tinha de os copiar à mão.

    **Nem tudo é aberto, e isso escreve-se por ficheiro.** Publicar como
    abertos os que derivam de fontes sem licença declarada era prometer em
    nome de quem as publica (§9, Fase 5; AUTORIA.md); escondê-los era
    esconder o que o sítio já mostra. Cada um sai com os seus termos: `odbl`,
    `consulta` ou `terceiro`.
    """
    from .fontes import Registo

    registo = Registo.carregar(raiz)
    pasta = sitio / "descargas"
    pasta.mkdir(parents=True, exist_ok=True)
    hoje = date.today().isoformat()
    saida: list[dict[str, Any]] = []

    def juntar(
        relativo: str,
        origem: Path,
        fonte: Any,
        *,
        modo: str | None,
        papel: str | None,
        descricao: str,
        licenca_da_saida: str | None = None,
    ) -> None:
        alvo = pasta / relativo
        alvo.parent.mkdir(parents=True, exist_ok=True)
        if origem.is_dir():
            _zipar(origem, alvo)
        else:
            shutil.copyfile(origem, alvo)
        dados = alvo.read_bytes()
        saida.append(
            {
                "caminho": relativo,
                "ficheiro": relativo,
                "grupo": _grupo_de(relativo),
                "modo": modo,
                "existe": True,
                "bytes": len(dados),
                "sha256": hashlib.sha256(dados).hexdigest(),
                "gerado_em": hoje,
                "fonte": fonte.nome,
                "fonte_url": fonte.url,
                "licenca": licenca_da_saida or fonte.licenca,
                "licenca_por_esclarecer": fonte.licenca_por_esclarecer,
                "termos": _termos(fonte, papel, licenca_da_saida),
                "atribuicao": fonte.atribuicao,
                "atribuicao_obrigatoria": fonte.exige_atribuicao,
                "descricao": descricao,
            }
        )

    for s in regiao.saidas:
        if not s.publica or not s.saida:
            continue
        # O FEED DE OUTRA ENTIDADE NÃO SE REDISTRIBUI AQUI.
        #
        # Estes feeds entram na construção e servem quem viaja: aparecem no
        # mapa, nas páginas de paragem e nos itinerários do planeador, que é
        # USAR os dados. Oferecê-los para descarga é outra coisa — é ser
        # espelho do ficheiro de outra entidade, e nem é o nosso papel nem é o
        # nosso direito. Quem quer o feed do operador ferroviário vai buscá-lo
        # ao operador ferroviário, que é quem responde por ele estar certo.
        #
        # O que se distribui daqui é o que a autoridade de transportes desta
        # região gere. Mais nada.
        if s.papel == "feed-de-terceiro":
            continue
        caminho = Path(destino) / s.saida
        if not caminho.exists():
            continue
        try:
            fonte = registo.obter(s.fonte)
        except Exception:  # noqa: BLE001 — a proveniência já é verificada noutro sítio
            continue
        relativo = s.saida if caminho.is_file() else s.saida.rstrip("/") + ".zip"
        juntar(
            relativo,
            caminho,
            fonte,
            modo=s.modo,
            papel=s.papel,
            descricao=_descricao_da_saida(s),
            licenca_da_saida=s.licenca,
        )

    # As DECISÕES, que não são saídas da receita e são o que torna a
    # construção auditável: que paragem é cada nome do papel, que viagem
    # herdou que intermédias, e porque é que um segmento não herdou nenhuma.
    decisoes = Path(destino) / "decisoes"
    proprio = next((x for x in regiao.saidas if x.papel == "horarios"), None)
    # CADA DECISÃO PERTENCE AO SERVIÇO DE QUE DECIDE. As do transporte a pedido
    # saem das brochuras dele e não do caderno da rede regular; atribuí-las
    # todas à mesma fonte dava a proveniência errada a metade do ficheiro.
    flex = next((x for x in regiao.saidas if x.papel == "feed-proprio-flex"), None)
    if decisoes.is_dir():
        for ficheiro in sorted(decisoes.glob("*.csv")):
            dona = flex if (flex and ficheiro.name.startswith("a-pedido-")) else proprio
            if dona is None:
                continue
            try:
                das_decisoes = registo.obter(dona.fonte)
            except Exception:  # noqa: BLE001 — sem proveniência, não se publica
                continue
            juntar(
                f"decisoes/{ficheiro.name}",
                ficheiro,
                das_decisoes,
                modo=dona.modo,
                papel="decisoes",
                descricao=DECISOES.get(ficheiro.name, "uma decisão por linha, com a razão"),
            )

    relatorio = raiz / "build" / "reports" / f"{regiao.id}.md"
    if relatorio.exists() and proprio:
        with contextlib.suppress(Exception):
            juntar(
                "relatorios/relatorio.md",
                relatorio,
                registo.obter(proprio.fonte),
                modo=None,
                papel="relatorio",
                descricao="o relatório da última construção: contagens, lacunas e avisos",
            )

    saida.sort(
        key=lambda d: (GRUPOS.index(d["grupo"]) if d["grupo"] in GRUPOS else 9, d["caminho"])
    )
    return saida


DECISOES = {
    "paragens.csv": (
        "que paragem é cada nome do caderno de horários, por que regra e com que semelhança"
    ),
    "viagens.csv": (
        "cada viagem: com que viagem do levantamento alinhou, e quantas paragens herdou"
    ),
    "segmentos.csv": (
        "entre duas paragens do papel: quantas intermédias entraram, e porquê quando não entrou "
        "nenhuma"
    ),
    "a-pedido-paragens.csv": (
        "que paragem é cada nome das brochuras do transporte a pedido, por que regra"
    ),
    "a-pedido-circuitos.csv": (
        "que circuito do levantamento é cada quadro das brochuras, e em que dias anda"
    ),
    "tracados.csv": (
        "o traçado de cada viagem: por que método, que comprimento, e a paragem mais longe dele"
    ),
}


def _descricao_da_saida(s: SaidaDaReceita) -> str:
    if s.papel == "horarios":
        return "a rede desta região em GTFS, construída dos documentos públicos"
    if s.papel == "feed-proprio-flex":
        return (
            "o transporte a pedido em GTFS-Flex: cada passagem exige reserva, e a regra de "
            "reserva vai no próprio feed (`booking_rules.txt`)"
        )
    if s.papel == "feed-de-terceiro":
        return "o feed de outra entidade, recortado à região"
    if (s.saida or "").startswith("gbfs/"):
        return "as estações de bicicletas partilhadas, em GBFS estático (sem disponibilidade)"
    if (s.saida or "").startswith("geojson/"):
        return "pontos e percursos em GeoJSON, para abrir num mapa"
    if s.papel == "catalogo-proprio":
        return (
            "os horários deste serviço como o sítio os lê, transcritos do que a operadora publica"
        )
    return ""
