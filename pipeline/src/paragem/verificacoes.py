"""Os guardas que o CI corre.

Três, e cada um existe por uma razão que já custou a alguém:

- **proveniência** — três ficheiros dizem de onde vêm os dados
  (`data/sources.yaml`, `REUSE.toml`, `docs/TERCEIROS.md`). Três sítios
  divergem; divergiram no Coreto, que é o projeto irmão, e é de lá que vem a
  ideia de os confrontar por máquina.
- **regiões** — o multi-região é a promessa comercial do produto. Uma promessa
  que o CI não verifica é uma promessa que se parte na primeira refatoração,
  em silêncio, e que só se descobre no dia da demonstração.
- **números** — os números do §6 são o critério de aceitação da Fase 1. Escritos
  à mão, envelhecem a mentir.
"""

from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .fontes import ACESSO_LOCAL, ACESSO_MANUAL, Registo, sha256
from .leitores import GENERICOS
from .regiao import carregar, carregar_todas, raizes


@dataclass
class Resultado:
    nome: str
    passou: list[str] = field(default_factory=list)
    falhou: list[str] = field(default_factory=list)

    def afirmar(self, condicao: bool, mensagem: str) -> None:
        (self.passou if condicao else self.falhou).append(mensagem)

    @property
    def ok(self) -> bool:
        return not self.falhou

    def imprimir(self) -> None:
        print(f"\n{self.nome}")
        for m in self.passou:
            print(f"  ✓ {m}")
        for m in self.falhou:
            print(f"  ✗ {m}")
        print(f"  {len(self.passou)} passaram, {len(self.falhou)} falharam")


# ---------------------------------------------------------------------------


def proveniencia(raiz: Path) -> Resultado:
    raiz = Path(raiz)
    r = Resultado("Proveniência")
    registo = Registo.carregar(raiz)
    regioes = carregar_todas(raiz)

    # 1. Nenhuma região usa uma fonte que não esteja declarada — e «usa» inclui
    #    a dos limites administrativos, que não produz ficheiro nenhum.
    for regiao in regioes:
        for id_fonte in regiao.fontes_usadas:
            r.afirmar(
                id_fonte in registo,
                f"{regiao.id}: a fonte {id_fonte!r} está em data/sources.yaml",
            )

    # 2. Toda a fonte manual ou local aponta a um ficheiro, e diz qual.
    for f in registo:
        if f.acesso in {ACESSO_MANUAL, ACESSO_LOCAL}:
            r.afirmar(
                bool(f.ficheiro),
                f"{f.id}: sendo de acesso {f.acesso}, declara `ficheiro:`",
            )

    # 3. Toda a fonte tem licença dita — mesmo que a licença seja «não sei».
    #    `null` é diferente de `nao-declarada`: o primeiro é esquecimento, o
    #    segundo é uma constatação sobre a fonte.
    for f in registo:
        r.afirmar(f.licenca is not None, f"{f.id}: diz alguma coisa sobre a licença")

    # 4. O que exige atribuição tem atribuição escrita.
    for f in registo:
        if f.atribuicao_obrigatoria:
            r.afirmar(bool(f.atribuicao), f"{f.id}: exige atribuição e diz qual")

    # 5. O REUSE.toml cobre as pastas onde entram ficheiros de terceiros — em
    #    cada raiz que as tenha. Os PDF de uma região viajam com ela, e a
    #    declaração de licença tem de viajar também: um PDF de terceiro numa
    #    raiz sem REUSE.toml é um ficheiro sem licença dita.
    for base in raizes(raiz):
        pastas = [c for c in ("data/manual", "data/reference") if (base / c).is_dir()]
        if not pastas:
            continue
        onde = "REUSE.toml" if base == Path(raiz).resolve() else f"{base.name}/REUSE.toml"
        ficheiro = base / "REUSE.toml"
        if not ficheiro.exists():
            r.afirmar(False, f"{onde} existe")
            continue
        reuse = ficheiro.read_text(encoding="utf-8")
        for pasta in pastas:
            r.afirmar(f'"{pasta}/**"' in reuse, f"{onde} cobre {pasta}/**")

    # 6. O TERCEIROS.md nomeia cada fonte que não é nossa — E É O DA RAIZ DELA.
    #
    #    A atribuição de terceiros documenta o que uma raiz tem, e não o que o
    #    produto sabe que existe. Procurá-la toda num único ficheiro obrigava o
    #    repositório do código a nomear os documentos de cada cliente, um a um,
    #    com endereço — que é precisamente a lista que ele não deve publicar, e
    #    que o §11.1 já proíbe pelo nome.
    #
    #    Uma raiz sem fontes de terceiros não precisa de ficheiro nenhum.
    nossas = {"AGPL-3.0-only"}
    por_raiz: dict[Path, list] = {}
    for f in registo:
        if f.licenca in nossas:
            continue
        por_raiz.setdefault(f.raiz or raiz, []).append(f)

    for base, fontes_da_raiz in sorted(por_raiz.items(), key=lambda kv: str(kv[0])):
        terceiros_md = base / "docs" / "TERCEIROS.md"
        onde = "docs/TERCEIROS.md" if base == raiz else f"{base.name}/docs/TERCEIROS.md"
        if not terceiros_md.exists():
            r.afirmar(False, f"{onde} existe")
            continue
        texto = terceiros_md.read_text(encoding="utf-8")
        for f in fontes_da_raiz:
            r.afirmar(f.id in texto, f"{onde} nomeia {f.id}")

    return r


# ---------------------------------------------------------------------------


def regioes(raiz: Path, *, exigir_construcao: bool = True) -> Resultado:
    """A prova executável do multi-região.

    Duas afirmações, e a segunda é a que interessa a quem compra:

    1. **uma região nova nasce sem código** — a de prova usa só leitores
       genéricos;
    2. **nem um byte de uma região dentro da outra** — as saídas da prova são
       varridas à procura dos nomes do Médio Tejo, e vice-versa.
    """
    raiz = Path(raiz)
    r = Resultado("Regiões")
    todas = carregar_todas(raiz)
    r.afirmar(len(todas) >= 2, f"há pelo menos duas regiões declaradas ({len(todas)})")

    por_id = {x.id: x for x in todas}

    prova = por_id.get("prova")
    if prova is None:
        r.afirmar(False, "existe a região de prova")
        return r

    # 1. A prova nasce sem código novo.
    especificos = [s.leitor for s in prova.saidas if s.leitor not in GENERICOS]
    r.afirmar(
        not especificos,
        "a região de prova usa só leitores genéricos"
        + (f" (usa {', '.join(especificos)})" if especificos else ""),
    )

    # 2. Artigos diferentes entre regiões: é o que impede uma contração de
    #    ficar cravada no código.
    artigos = {x.artigo for x in todas}
    r.afirmar(len(artigos) >= 2, f"as regiões não têm todas o mesmo artigo ({sorted(artigos)})")

    # 3. Caixas disjuntas: uma coordenada trocada entre regiões tem de falhar.
    for i, a in enumerate(todas):
        for b in todas[i + 1 :]:
            r.afirmar(
                not a.caixa.sobrepoe(b.caixa),
                f"as caixas de {a.id} e {b.id} não se sobrepõem",
            )

    # 4. Identificadores de concelho são um espaço global.
    vistos: dict[str, str] = {}
    for x in todas:
        for c in x.concelhos:
            if c.id in vistos:
                r.afirmar(False, f"o concelho {c.id!r} está em {vistos[c.id]} e em {x.id}")
            vistos[c.id] = x.id
    r.afirmar(True, f"os {len(vistos)} identificadores de concelho são únicos entre regiões")

    # 5. Fugas: nada de uma região aparece nas saídas da outra.
    if exigir_construcao:
        for alvo in todas:
            pasta = raiz / "build" / alvo.id
            if not pasta.is_dir():
                r.afirmar(False, f"{alvo.id} está construída em build/{alvo.id}")
                continue
            proibidos = _palavras_de_outras(alvo, todas)
            fugas = _procurar(pasta, proibidos)
            r.afirmar(
                not fugas,
                f"nada das outras regiões em build/{alvo.id}"
                + (f" — encontrei {'; '.join(fugas[:5])}" if fugas else ""),
            )

    return r


def _palavras_de_outras(alvo, todas) -> list[str]:
    """O que nunca pode aparecer nas saídas desta região.

    O nome da região, o da autoridade, o da rede e o domínio das outras. No
    Coreto esta lista chama-se `FUGAS_MT` e existe porque um componente com o
    nome de uma região cravado passa despercebido até alguém abrir a segunda.
    """
    palavras: list[str] = []
    for outra in todas:
        if outra.id == alvo.id:
            continue
        palavras.append(outra.nome)
        for campo in ("nome", "url"):
            if outra.autoridade.get(campo):
                palavras.append(str(outra.autoridade[campo]))
            if outra.rede.get(campo):
                palavras.append(str(outra.rede[campo]))
    # Palavras curtas demais dariam falsos positivos («Meio» é palavra comum).
    return sorted({p for p in palavras if len(p) >= 8})


def _procurar(pasta: Path, palavras: list[str]) -> list[str]:
    if not palavras:
        return []
    achados: list[str] = []
    padrao = re.compile("|".join(re.escape(p) for p in palavras))
    for f in sorted(pasta.rglob("*")):
        if not f.is_file():
            continue
        try:
            if zipfile.is_zipfile(f):
                with zipfile.ZipFile(f) as z:
                    texto = "\n".join(z.read(n).decode("utf-8", "replace") for n in z.namelist())
            else:
                texto = f.read_text(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001 — um binário ilegível não é uma fuga
            continue
        for m in set(padrao.findall(texto)):
            achados.append(f"{f.name}: {m!r}")
    return achados


def _janela_de_servico(r, feed, rotulo: str) -> None:
    """O CALENDÁRIO AFIRMA-SE POR INVARIANTE, E NÃO POR CONTAGEM.

    O `datas_de_servico` era conferido por igualdade contra um número medido —
    1 916 na rede, 11 701 no transporte a pedido. Partiu sozinho na primeira
    madrugada depois de ser escrito, e com ele foi abaixo a publicação: os
    feeds cobrem uma JANELA DESLIZANTE de 364 dias a contar de HOJE, e à
    meia-noite sai um dia atrás e entra outro à frente. Se os dois não tiverem
    os mesmos serviços — e não têm, entre período escolar e férias —, a
    contagem muda sem que nada esteja mal.

    É o §8 do briefing a acontecer: «número exato onde a fonte está congelada,
    invariante onde a fonte está viva». O relógio é a fonte mais viva que há, e
    a contagem estava cravada sobre ele.

    O que se afirma em vez disso é o que tem de ser verdade em qualquer dia:

      - a janela JÁ COMEÇOU e não começou há mais de uma semana. Um feed que
        começa amanhã não serve a quem viaja hoje; um que começou há um mês é
        um feed que ninguém reconstrói;
      - e COBRE MESMO UM ANO, nem menos de 300 dias nem mais de 366. Sem o
        limite de baixo, um calendário que colapsasse para três dias passava em
        todas as outras afirmações — as contagens de linhas, viagens e paragens
        não mudam quando o que desaparece são as datas;
      - NENHUM SERVIÇO FICA SEM DATAS. Este era o que mais falta fazia: estava
        declarado no `numeros.yaml` como `servicos_sem_datas: 0` e não era
        conferido em lado nenhum. Um serviço sem datas é uma linha que existe
        no feed e não corre em dia nenhum — e é assim que uma carreira
        desaparece do sítio sem nada ficar vermelho.
    """
    from datetime import date, datetime, timedelta

    def _d(s: str) -> date:
        return datetime.strptime(s, "%Y%m%d").date()

    linhas = feed.obter("calendar_dates.txt")
    datas = sorted({x.get("date", "") for x in linhas} - {""})
    if not datas:
        r.afirmar(False, f"{rotulo}: o feed tem datas de serviço")
        return

    hoje = date.today()
    primeira, ultima = _d(datas[0]), _d(datas[-1])

    # A JANELA NÃO COMEÇA AMANHÃ, E NÃO COMEÇOU NO MÊS PASSADO.
    #
    # «Começa hoje» seria a afirmação óbvia e estaria errada pela mesma razão
    # que o número exato: uma corrida que atravesse a meia-noite constrói num
    # dia e confere no outro, e uma construção de ontem que se confira hoje é
    # legítima. A folga é de uma semana, que é o ponto a partir do qual um feed
    # velho deixa de ser «de ontem» e passa a ser um feed que ninguém
    # reconstrói.
    r.afirmar(
        primeira <= hoje,
        f"{rotulo}: a janela de serviço já começou ({datas[0]}, hoje é {hoje:%Y%m%d})",
    )
    r.afirmar(
        primeira >= hoje - timedelta(days=7),
        f"{rotulo}: e não começou há mais de uma semana ({datas[0]})",
    )

    # E COBRE MESMO UM ANO. Sem o limite de baixo, um calendário que colapsasse
    # para três dias passava em todas as outras afirmações: as contagens de
    # linhas, viagens e paragens não mudam quando o que desaparece são as datas.
    r.afirmar(
        ultima <= hoje + timedelta(days=366),
        f"{rotulo}: e acaba dentro de um ano ({datas[-1]})",
    )
    r.afirmar(
        ultima >= hoje + timedelta(days=300),
        f"{rotulo}: e cobre o ano quase todo ({datas[-1]})",
    )

    com_datas = {x.get("service_id", "") for x in linhas}
    servicos = {x.get("service_id", "") for x in feed.obter("trips.txt")}
    sem = sorted(servicos - com_datas)
    r.afirmar(
        not sem,
        f"{rotulo}: todos os {len(servicos)} serviços têm datas"
        + (f" — sem datas: {', '.join(sem[:5])}" if sem else ""),
    )


# ---------------------------------------------------------------------------


def bloqueios(raiz: Path, id_regiao: str) -> Resultado:
    """Compara os bloqueios desta construção com os que já se conhecem.

    Nos dois sentidos, e o segundo é o que costuma faltar: um bloqueio novo
    reprova, e um bloqueio conhecido que deixou de acontecer também — senão a
    lista envelhece a proteger coisas que já não existem, e a próxima pessoa
    herda uma lista em que não pode confiar.
    """
    raiz = Path(raiz)
    r = Resultado(f"Bloqueios — {id_regiao}")

    relatorio = raiz / "build" / "reports" / f"{id_regiao}.json"
    if not relatorio.exists():
        r.afirmar(False, f"há relatório em build/reports/{id_regiao}.json (corre `pipeline build`)")
        return r

    with open(relatorio, encoding="utf-8") as f:
        d = json.load(f)
    agora = {x["id"] for x in d.get("lacunas", []) if x["gravidade"] == "bloqueia"}

    # Se o validador não correu, os bloqueios que só ele vê não podem ser
    # julgados: a ausência deles não quer dizer que desapareceram, quer dizer
    # que ninguém olhou. Sem esta ressalva, uma corrida sem Java ou sem rede
    # reprovava com «bloqueio conhecido que já não acontece» — que é
    # exatamente a mensagem errada.
    nao_correu = {
        x["id"].split(".")[1]
        for x in d.get("lacunas", [])
        if x["id"].startswith("validador.") and x["id"].endswith(".nao-correu")
    }
    if nao_correu:
        r.afirmar(
            True,
            "o validador não correu sobre "
            + ", ".join(sorted(nao_correu))
            + "; os bloqueios dele ficam por julgar",
        )

    # A LISTA É DA RAIZ DA REGIÃO, e não desta.
    #
    # Com a região a viver noutra raiz (docs/RAIZES.md), procurá-la aqui
    # devolvia «não existe» — e sem lista de conhecidos TODO o bloqueio passava
    # a novo. Falhava alto, que é o lado certo para falhar, mas falhava por uma
    # razão inventada: a lista está onde a região está.
    ficheiro = (
        carregar(raiz, id_regiao).raiz_de_dados
        / "data"
        / "reference"
        / id_regiao
        / "bloqueios-conhecidos.yaml"
    )
    conhecidos: set[str] = set()
    if ficheiro.exists():
        with open(ficheiro, encoding="utf-8") as f:
            conhecidos = {x["id"] for x in (yaml.safe_load(f) or {}).get("bloqueios") or []}

    for novo in sorted(agora - conhecidos):
        r.afirmar(False, f"bloqueio NOVO: {novo} — resolve-o, ou aceita-o em {ficheiro.name}")
    for ido in sorted(conhecidos - agora):
        if ido.startswith("validador.") and ido.split(".")[1] in nao_correu:
            continue
        r.afirmar(
            False,
            f"bloqueio conhecido que já não acontece: {ido} — tira-o de {ficheiro.name}",
        )
    for igual in sorted(agora & conhecidos):
        r.afirmar(True, f"bloqueio conhecido e aceite: {igual}")
    if not agora and not conhecidos:
        r.afirmar(True, "a construção não tem bloqueios")
    return r


# ---------------------------------------------------------------------------


def _feed_da_regiao(raiz: Path, id_regiao: str, papel: str = "horarios") -> Path | None:
    """Um feed que ESTA região constrói, se já estiver feito.

    O caminho não se escreve aqui: vem da receita (a saída com o papel
    pedido), que é quem sabe como se chama o ficheiro de cada região. São dois
    papéis: `horarios` é a rede própria e `feed-proprio-flex` é o transporte a
    pedido, que é outro serviço e outro ficheiro.
    """
    try:
        regiao = carregar(raiz, id_regiao)
    except Exception:
        return None
    for s in regiao.saidas:
        if s.papel == papel and s.saida:
            caminho = Path(raiz) / "build" / id_regiao / s.saida
            return caminho if caminho.exists() else None
    return None


def numeros(raiz: Path) -> Resultado:
    """Confere o que o repositório sabe contar sozinho, sem rede e sem chaves.

    É essa a fronteira: um guarda obrigatório tem de passar num clone sem
    credenciais e sem ligação à Internet, senão deixa de ser obrigatório na
    prática.
    """
    raiz = Path(raiz)
    r = Resultado("Números")

    # DE TODAS AS RAÍZES, e é aqui que isto quase passou em silêncio.
    #
    # Os números de aceitação de uma região viajam com ela: quando ela vive
    # noutra raiz, este `glob` sobre esta devolvia uma lista vazia — e o fundo
    # da função dizia «não há referências com números para conferir» e punha um
    # visto verde. Um guarda que não encontra nada e passa não é um guarda: é
    # uma linha verde a dizer que está tudo bem sem ter olhado.
    conferidas: list[str] = []
    for base in raizes(raiz):
        for pasta in sorted((base / "data" / "reference").glob("*")):
            f = pasta / "numeros.yaml"
            if not f.exists():
                continue
            conferidas.append(pasta.name)
            _numeros_de(r, raiz, base, pasta, f)

    # E O QUE NÃO SE CONFERIU DIZ-SE PELO NOME.
    #
    # Uma região sem números de referência é legítima — as de prova não os têm,
    # e não faz sentido terem-nos: são inventadas, e o que se compara com elas é
    # o que elas próprias declaram. O que não é legítimo é isso parecer igual a
    # «não encontrei o ficheiro».
    faltam = sorted({x.id for x in carregar_todas(raiz)} - set(conferidas))
    if faltam:
        r.afirmar(True, "sem números de referência para conferir: " + ", ".join(faltam))
    if not r.passou and not r.falhou:
        r.afirmar(True, "não há regiões declaradas")
    return r


def _numeros_de(r: Resultado, raiz: Path, da_referencia: Path, pasta: Path, f: Path) -> None:
    """Os números de uma referência, contra o que a construção produziu.

    SÃO DUAS RAÍZES, e confundi-las compara a coisa errada com a coisa errada:

    - `da_referencia` é a raiz de onde o `numeros.yaml` veio, e é contra ela
      que se resolve o `fonte_da_referencia` — o ficheiro apontado viaja com a
      região, como tudo o resto dela;
    - `raiz` é onde se está a trabalhar, e é lá que está o `build/` com o que
      esta corrida acabou de produzir. O `build/` nunca viaja: é o resultado,
      não a fonte.
    """
    d: dict[str, Any] = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
    ref = d.get("fonte_da_referencia")
    esperado = d.get("sha256")
    if ref and esperado:
        caminho = da_referencia / ref
        if not caminho.exists():
            r.afirmar(False, f"{pasta.name}: {ref} existe")
        else:
            r.afirmar(
                sha256(caminho) == esperado,
                f"{pasta.name}: a referência tem o sha256 declarado",
            )

    # A referência pode NÃO ser um ficheiro deste repositório: desde que a
    # região se constrói dos seus próprios documentos (CLAUDE.md §11.8), a
    # referência é a construção de uma data, identificada por somas. O que
    # se confere então é o feed CONSTRUÍDO, quando ele está à mão — é o
    # caso na corrida que constrói os dados, e não é num clone limpo.
    construcao = d.get("construcao") or {}
    feed_construido = _feed_da_regiao(raiz, pasta.name)
    if construcao and feed_construido is not None:
        from .gtfs import Gtfs

        feito = Gtfs.ler(feed_construido)
        resumo = feito.resumo()
        for chave, tabela in (
            ("linhas", "routes.txt"),
            ("viagens", "trips.txt"),
            ("paragens", "stops.txt"),
            ("registos_de_horario", "stop_times.txt"),
        ):
            if chave in construcao:
                esperado_n = construcao[chave]["valor"]
                r.afirmar(
                    resumo.get(tabela, 0) == esperado_n,
                    f"{pasta.name}: {chave} = {esperado_n} (construído: {resumo.get(tabela, 0)})",
                )
        curtas = sum(1 for n in feito.paragens_por_viagem().values() if n < 2)
        r.afirmar(curtas == 0, f"{pasta.name}: nenhuma viagem com menos de 2 paragens")
        _janela_de_servico(r, feito, pasta.name)

    # O FEED A PEDIDO CONTA-SE COMO O OUTRO, e é preciso contá-lo: é o
    # único transporte público de boa parte das freguesias desta região, e
    # um número que muda sozinho aqui é um circuito que desapareceu.
    a_pedido = d.get("a_pedido") or {}
    flex = _feed_da_regiao(raiz, pasta.name, papel="feed-proprio-flex")
    if a_pedido and flex is not None:
        from .gtfs import Gtfs

        feito = Gtfs.ler(flex)
        resumo = feito.resumo()
        for chave, tabela in (
            ("circuitos", "routes.txt"),
            ("viagens", "trips.txt"),
            ("paragens", "stops.txt"),
            ("registos_de_horario", "stop_times.txt"),
        ):
            if chave in a_pedido:
                esperado_n = a_pedido[chave]["valor"]
                r.afirmar(
                    resumo.get(tabela, 0) == esperado_n,
                    f"{pasta.name}: a pedido, {chave} = {esperado_n}"
                    f" (construído: {resumo.get(tabela, 0)})",
                )
        # A regra de reserva é o que distingue este feed de um horário:
        # sem ela, o que ele diz é uma promessa que ninguém fez.
        _janela_de_servico(r, feito, f"{pasta.name}: a pedido")
        r.afirmar(
            len(feito.obter("booking_rules.txt")) > 0,
            f"{pasta.name}: o feed a pedido tem regras de reserva",
        )
        sem_regra = [
            h
            for h in feito.stop_times
            if not h.get("pickup_booking_rule_id") or h.get("pickup_type") != "2"
        ]
        r.afirmar(
            not sem_regra,
            f"{pasta.name}: todas as passagens do feed a pedido exigem reserva"
            f" ({len(sem_regra)} sem)",
        )

    obs = d.get("observado_no_prototipo") or {}
    if obs and ref and (da_referencia / ref).exists():
        from .gtfs import Gtfs

        feed = Gtfs.ler(da_referencia / ref)
        resumo = feed.resumo()
        mapa = {
            "paragens": "stops.txt",
            "stop_times": "stop_times.txt",
            "calendar_dates": "calendar_dates.txt",
            "transfers": "transfers.txt",
        }
        for chave, tabela in mapa.items():
            if chave in obs:
                r.afirmar(
                    resumo.get(tabela, 0) == obs[chave],
                    f"{pasta.name}: {chave} = {obs[chave]}",
                )
        parser = d.get("parser_do_pdf") or {}
        if "linhas" in parser:
            r.afirmar(
                resumo.get("routes.txt", 0) == parser["linhas"]["valor"],
                f"{pasta.name}: linhas = {parser['linhas']['valor']}",
            )
        if "viagens" in parser:
            r.afirmar(
                resumo.get("trips.txt", 0) == parser["viagens"]["valor"],
                f"{pasta.name}: viagens = {parser['viagens']['valor']}",
            )
        if parser.get("viagens_com_menos_de_2_paragens"):
            pass
        curtas = sum(1 for n in feed.paragens_por_viagem().values() if n < 2)
        r.afirmar(curtas == 0, "a referência não tem viagens com menos de 2 paragens")
