"""`horarios-reservas` — o horário como o sítio de reservas o mostra num DIA.

As brochuras do transporte a pedido são o que a autoridade imprime. Isto é
outra coisa: é o que o sítio de reservas responde quando alguém pergunta «o
que circula neste dia». As duas não dizem o mesmo, e a diferença não é
académica — na Ortiga, a brochura tem duas viagens em período escolar e o
sítio, numa segunda-feira de período escolar, tem quatro. As outras duas são
percursos parciais que a folha impressa não mostra.

**O QUE ISTO DÁ, E O QUE NÃO DÁ.** Dá as horas e a sequência de paragens, com
os nomes completos que a operadora usa («Ortiga (Cooperativa) P1» onde a
brochura escreve «Ortiga (P1)»). **Não dá os dias**: a página é o horário de
UMA data — a que a pessoa escreveu na caixa de pesquisa — e não traz regra
nenhuma sobre os outros dias. Por isso o que sai daqui entra com o dia por
confirmar, e o sítio diz que não se sabe em que dias circula. Dizer «dias
úteis» porque a data calhou numa segunda-feira era inventar a regra a partir
de um exemplo, que é o que o CLAUDE.md §4.4 proíbe.

**COMO O DOCUMENTO CHEGA AQUI.** À mão. O sítio de reservas só se automatiza
com autorização escrita da autoridade de transportes (CLAUDE.md §5), e por
isso este leitor lê um FICHEIRO GUARDADO — a página tal como o navegador a
gravou, com a data da gravação no nome. Não há aqui nenhum pedido de rede, e
não pode haver.

**PORQUE É QUE NÃO SUBSTITUI AS BROCHURAS.** Porque as brochuras trazem a
regra («Período Escolar», «Férias Escolares») e isto não. A receita da região
diz, circuito a circuito, quais é que vêm daqui — e são os que nenhuma
brochura cobre. Para os outros, este ficheiro serve de VERIFICAÇÃO: o leitor
compara-se com eles e escreve no relatório o que não bater.
"""

from __future__ import annotations

import datetime as dt
import email
import json
import re
import unicodedata
from typing import Any

from ..regiao import Saida
from .base import Contexto, Resultado, verificar_esperado

nome = "horarios-reservas"

# Os dias da semana por extenso, para o rótulo dizer que dia era aquela data.
DIAS = [
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
]

_HORA = re.compile(r"^([0-2]?\d):([0-5]\d)$")


def _minutos(hora: Any) -> int | None:
    """A hora em minutos, para se poder comparar.

    **NUNCA em texto.** Esta fonte escreve «09:56» e as transcrições escrevem
    «9:56», porque uma copia o sítio e a outra copia o papel. Comparadas como
    texto, são horas diferentes — e a primeira versão deste cruzamento disse
    que 29 das 30 horas de um circuito não batiam, quando batiam todas.

    É o mesmo defeito que o leitor das transcrições teve, noutro sítio e com
    outra consequência: lá invertia viagens, aqui inventava diferenças. Vale
    a pena o comentário: a próxima pessoa que compare horas neste repositório
    vai ter a tentação de as comparar como estão escritas.
    """
    m = _HORA.match(str(hora or "").strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


# Palavras que aparecem em muitos nomes de circuito e não distinguem nenhum.
_PALAVRAS_MUDAS = {
    "circuito",
    "intermunicipal",
    "de",
    "do",
    "da",
    "dos",
    "das",
    "e",
    "a",
    "o",
    "v",
    "via",
}


def _palavras(nome: Any) -> set[str]:
    """As palavras que distinguem um circuito de outro."""
    import unicodedata as _u

    x = _u.normalize("NFKD", str(nome or ""))
    x = "".join(c for c in x if _u.category(c) != "Mn").lower()
    return {w for w in re.split(r"[^a-z0-9]+", x) if w and w not in _PALAVRAS_MUDAS}


def _chave(x: Any) -> str:
    y = unicodedata.normalize("NFKD", str(x or ""))
    y = "".join(c for c in y if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]", "", y)


def _html_do_mhtml(bruto: bytes) -> str:
    """A parte HTML de um ficheiro gravado pelo navegador.

    Um `.mhtml` é MIME: a página e, a seguir, todas as imagens e folhas de
    estilo. Aqui só interessa a primeira parte — as outras noventa e uma são
    mosaicos do mapa.
    """
    msg = email.message_from_bytes(bruto)
    for parte in msg.walk():
        if parte.get_content_type() == "text/html":
            carga = parte.get_payload(decode=True)
            # `get_payload(decode=True)` devolve `bytes` para uma parte
            # simples e `None` para uma composta — o tipo declarado inclui a
            # mensagem inteira, que aqui não acontece.
            if isinstance(carga, bytes):
                return carga.decode("utf-8", "replace")
    raise ValueError("o ficheiro gravado não tem nenhuma parte HTML lá dentro.")


def _horas_da_paragem(td) -> list[str]:
    """As horas de uma paragem, uma por coluna.

    O HTML ANINHA as colunas em vez de as pôr lado a lado: cada nível tem o
    valor desta coluna e, dentro dele, o nível da coluna seguinte. Lido como
    irmãos, sai uma coluna só — e foi assim que a primeira leitura deu 2 332
    paragens todas com uma hora, quando 461 delas têm duas.
    """
    rotulo = td.find("span", class_="scheduleStations")
    atual = rotulo.find_next_sibling("span") if rotulo else None
    fora: list[str] = []
    while atual is not None:
        filhos = atual.find_all("span", recursive=False)
        if not filhos:
            texto = atual.get_text(strip=True)
            if texto:
                fora.append(texto)
            break
        fora.append(filhos[0].get_text(strip=True))
        atual = filhos[1] if len(filhos) > 1 else None
    return fora


def _data_da_pesquisa(sopa) -> dt.date | None:
    campo = sopa.find("input", id="Fecha") or sopa.find("input", attrs={"name": "Fecha"})
    valor = (campo.get("value") if campo else "") or ""
    try:
        return dt.datetime.strptime(valor.strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


def ler(ctx: Contexto, saida: Saida) -> Resultado:
    from bs4 import BeautifulSoup

    p = saida.params
    origem = ctx.caminho_da_fonte(saida.fonte)
    bruto = origem.read_bytes()
    html = _html_do_mhtml(bruto) if bruto[:5] == b"From:" else bruto.decode("utf-8", "replace")
    sopa = BeautifulSoup(html, "lxml")

    data = _data_da_pesquisa(sopa)
    if data is None:
        ctx.relatorio.bloqueia(
            id=f"{saida.fonte}.sem-data",
            o_que="A página guardada não diz a que data se refere",
            onde=ctx.caminho_curto(origem),
            porque_importa=(
                "Esta fonte é o horário de UM dia, e sem saber qual não se sabe o que as "
                "horas querem dizer. Publicá-las assim seria pôr no sítio um horário sem "
                "data nenhuma."
            ),
            o_que_fazer="Voltar a gravar a página com o campo de data preenchido.",
        )
        return Resultado(contagens={f"{saida.fonte}.circuitos": 0})

    zonas = _opcoes(sopa, "DropDownListZona")
    linhas = _opcoes(sopa, "DropDownListRuta")
    resultados = sopa.find(id="scheduleResultsDIV")
    if resultados is None:
        raise ValueError("a página guardada não tem o bloco de resultados (`scheduleResultsDIV`).")

    lidos = _circuitos(resultados, zonas, linhas)
    quais = [str(x) for x in (p.get("circuitos") or [])]
    escolhidos, sem_par = _escolher(lidos, quais)
    if sem_par:
        ctx.relatorio.lacuna(
            id=f"{saida.fonte}.circuito-que-nao-existe",
            o_que=f"{len(sem_par)} circuitos pedidos que a página não tem",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml → {nome} → circuitos",
            porque_importa=(
                "A receita pede estes circuitos a esta fonte e a fonte não os traz. Ou o nome "
                "mudou, ou a gravação é de um dia em que não circulam — e em qualquer dos "
                "casos ninguém os vê no sítio."
            ),
            o_que_fazer="Conferir os nomes na página guardada, ou gravar outro dia.",
            quantos=len(sem_par),
            quais=sem_par,
        )

    linha = _saida(ctx, saida, escolhidos, data)
    destino = ctx.caminho_de_saida(saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps(linha, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8"
    )

    medida = _cruzar(ctx, saida, lidos, {_chave(x) for x in quais})

    viagens = sum(len(q["viagens"]) for q in linha["quadros"])
    paragens = {n for q in linha["quadros"] for n in q["paragens"]}
    contagens = {
        f"{saida.fonte}.circuitos_na_pagina": len(lidos),
        f"{saida.fonte}.circuitos": len(linha["quadros"]),
        f"{saida.fonte}.viagens": viagens,
        f"{saida.fonte}.paragens": len(paragens),
        f"{saida.fonte}.viagens_confirmadas_pelas_brochuras": medida["iguais"],
        f"{saida.fonte}.viagens_com_horas_a_mais": medida["contraditas"],
    }
    esperado = p.get("esperado") or {}
    for chave, obtido in (
        ("circuitos", len(linha["quadros"])),
        ("viagens", viagens),
    ):
        verificar_esperado(ctx, saida, chave, obtido, esperado.get(chave))

    return Resultado(
        contagens=contagens,
        saidas={saida.saida or "": str(destino)},
        notas=[f"horário do sítio de reservas para {data:%d/%m/%Y} ({DIAS[data.weekday()]})"],
    )


def _cruzar(
    ctx: Contexto, saida: Saida, lidos: dict[str, dict], usados: set[str]
) -> dict[str, int]:
    """A página contra as brochuras já construídas, viagem a viagem.

    Vale como VERIFICAÇÃO INDEPENDENTE, e é a única que estas transcrições
    têm: o guarda de transcrição prova que uma hora está no PDF, e não prova
    que o PDF esteja certo nem que esteja completo. Isto compara com o que a
    operadora responde a quem vai reservar.

    O que se conta:

    - **idênticas** — a mesma sequência de horas numa viagem nossa. Quanto
      mais, melhor: é a transcrição confirmada por outra via.
    - **contraditas** — uma hora que esta fonte não tem em viagem nenhuma do
      mesmo circuito. É a que interessa, e é a que bloqueia a atenção de quem
      mantém isto.
    - **só na página** — circuitos que a página traz e a receita não pediu nem
      as brochuras cobrem. É como um circuito novo se anuncia.

    Nada disto muda o que se publica. Uma diferença entre duas fontes resolve-se
    a perguntar a quem as publica, não a escolher uma à sorte.
    """
    import glob
    import os

    nossas: dict[str, list[list[list[str]]]] = {}
    nome_original: dict[str, str] = {}
    for f in sorted(glob.glob(os.path.join(str(ctx.destino), "tap", "*.json"))):
        if os.path.basename(f) == os.path.basename(str(ctx.caminho_de_saida(saida))):
            continue
        try:
            with open(f, encoding="utf-8") as fh:
                j = json.load(fh)
        except (OSError, ValueError):
            continue
        for q in j.get("quadros", []):
            if q.get("tipo") != "percurso":
                continue
            for v in q.get("viagens", []):
                ps = [x for x in v.get("passagens", []) if _HORA.match(str(x[1]).strip())]
                if len(ps) >= 2:
                    chave_nossa = _chave(q.get("nome"))
                    nossas.setdefault(chave_nossa, []).append(ps)
                    # O nome COMO ESTÁ ESCRITO, que é o que tem palavras. A
                    # chave é normalizada sem separadores e não serve para as
                    # comparar — foi assim que a primeira versão disto
                    # comparou «circuitodemoita» consigo própria e mais nada.
                    nome_original[chave_nossa] = str(q.get("nome") or "")

    _palavras_de = {k: _palavras(nome_original.get(k, k)) for k in nossas}

    def parecido(a: str) -> list[list[list[str]]]:
        """As nossas viagens do circuito que TAMBÉM se chama isto.

        Os dois lados não usam o mesmo nome, e não é descuido de ninguém: o
        sistema de reservas escreve «Intermunicipal Sertã (Moita)» onde a
        brochura escreve «Circuito de Moita», e «Assentis e Paço v/ Paço» onde
        ela escreve «Assentis v/ Paço». A comparação por igualdade ou por
        conter dava seis circuitos «que ninguém mostra» — e os seis estavam
        mostrados, com outro nome.

        Passa a comparar pelas PALAVRAS que os dois têm em comum, tirando as
        que não distinguem nada («circuito», «intermunicipal», «de», «e»). Dois
        nomes com metade das palavras próprias em comum são o mesmo circuito.
        Não é infalível, e não precisa de ser: o que está do outro lado é uma
        lacuna a dizer «confirma isto», não uma fusão de dados.
        """
        alvo = _palavras(a)
        fora: list[list[list[str]]] = []
        for k, v in nossas.items():
            ca, ck = _chave(a), k
            if ca == ck or ca in ck or ck in ca:
                fora.extend(v)
                continue
            delas = _palavras_de[k]
            if not alvo or not delas:
                continue
            comuns = alvo & delas
            # PELO CONJUNTO MAIOR, e a diferença não é de gosto: dividir pelo
            # menor fazia «Circuito Azul» casar com «Praia Fluvial do Lago
            # Azul» — uma palavra em comum sobre um nome de uma palavra dá
            # 100 %. Pelo maior, dá 25 %, e as duas ficam separadas como devem.
            if comuns and len(comuns) / max(len(alvo), len(delas)) >= 0.5:
                fora.extend(v)
        return fora

    iguais = contraditas = sem_par = 0
    quais: list[str] = []
    orfaos: list[str] = []
    for nome_circuito, c in sorted(lidos.items()):
        alvo = parecido(nome_circuito)
        if not alvo:
            if _chave(nome_circuito) not in usados:
                orfaos.append(nome_circuito)
            sem_par += len(c["viagens"])
            continue
        horas_nossas = {_minutos(h) for v in alvo for _, h in v}
        for v in c["viagens"]:
            assinatura = [_minutos(h) for _, h in v["passagens"]]
            if any(assinatura == [_minutos(h) for _, h in nv] for nv in alvo):
                iguais += 1
                continue
            faltam = [
                h
                for h, m in zip((x[1] for x in v["passagens"]), assinatura, strict=True)
                if m not in horas_nossas
            ]
            if faltam:
                contraditas += 1
                escritas = [x[1] for x in v["passagens"]]
                quais.append(
                    f"{nome_circuito} {v['sentido']} {escritas[0]}→{escritas[-1]}: "
                    f"{len(faltam)} horas que nenhuma viagem nossa tem ({', '.join(faltam[:4])})"
                )

    if orfaos:
        ctx.relatorio.lacuna(
            id=f"{saida.fonte}.circuitos-que-ninguem-mostra",
            o_que=f"{len(orfaos)} circuitos na página que não estão em lado nenhum",
            onde=f"regioes/{ctx.regiao.id}/fontes.yaml → {nome} → circuitos",
            porque_importa=(
                "A página de reservas tem estes circuitos, nenhuma brochura os cobre e a "
                "receita não os pediu. Ou são novos, ou mudaram de nome — em qualquer dos "
                "casos existem e ninguém os vê."
            ),
            o_que_fazer=(
                "Confirmar se são novos e, se forem, acrescentá-los à lista `circuitos` da "
                "receita; se é o mesmo circuito com outro nome, não há nada a fazer."
            ),
            quantos=len(orfaos),
            quais=sorted(orfaos),
        )
    if quais:
        ctx.relatorio.lacuna(
            id=f"{saida.fonte}.horas-que-nao-batem",
            o_que=f"{len(quais)} viagens da página com horas que as brochuras não têm",
            onde=ctx.caminho_curto(ctx.caminho_da_fonte(saida.fonte)),
            porque_importa=(
                "Estas horas estão no sítio onde as pessoas reservam e não estão na folha "
                "que transcrevemos. Ou a brochura é mais antiga, ou não mostra os percursos "
                "parciais — e nesse caso o nosso horário está a menos."
            ),
            o_que_fazer=(
                "Confirmar com a autoridade de transportes qual das duas está em vigor. "
                "Enquanto não se souber, publica-se a brochura, que é a que traz os dias."
            ),
            quantos=len(quais),
            quais=sorted(quais)[:25],
        )
    return {"iguais": iguais, "contraditas": contraditas, "sem_par": sem_par}


def _opcoes(sopa, ident: str) -> dict[str, str]:
    campo = sopa.find(id=ident)
    if campo is None:
        return {}
    return {
        o.get("value"): o.get_text(strip=True)
        for o in campo.find_all("option")
        if o.get("value") and o.get_text(strip=True) not in ("", "--")
    }


def _circuitos(resultados, zonas: dict[str, str], linhas: dict[str, str]) -> dict[str, dict]:
    """Os circuitos da página, cada um com as suas viagens.

    Um circuito tem um botão por SENTIDO, e cada sentido tantas viagens quantas
    as colunas de horas. Uma coluna onde a paragem tem `-----` é uma viagem que
    não passa ali — é o percurso parcial, e é precisamente o que a brochura
    impressa não mostra.
    """
    fora: dict[str, dict] = {}
    for botao in resultados.find_all("button", class_="accordionParadasList"):
        m = re.match(r"accordion_scheduleMap_(\d+)_(\d+)_(\d+)", botao.get("id", "") or "")
        if not m:
            continue
        zona, circuito, _ = m.groups()
        tabela = botao.find_next("table", class_="scheduleTable")
        if tabela is None:
            continue
        rotulo = re.sub(r"\s+", " ", botao.get_text(" ")).strip()
        sentido = "Volta" if rotulo.lower().rstrip(")").endswith("volta") else "Ida"

        paradas: list[tuple[str, list[str]]] = []
        for tr in tabela.find_all("tr"):
            celulas = tr.find_all("td", recursive=False)
            if len(celulas) < 2:
                continue
            nome_paragem = celulas[1].find("span", class_="scheduleStations")
            if nome_paragem is None:
                continue
            paradas.append((nome_paragem.get_text(strip=True), _horas_da_paragem(celulas[1])))
        if not paradas:
            continue

        chave = linhas.get(circuito) or f"circuito {circuito}"
        entrada = fora.setdefault(
            chave, {"nome": chave, "zona": zonas.get(zona, ""), "viagens": [], "paragens": []}
        )
        for nome_paragem, _ in paradas:
            if nome_paragem not in entrada["paragens"]:
                entrada["paragens"].append(nome_paragem)
        colunas = max((len(h) for _, h in paradas), default=0)
        for i in range(colunas):
            passagens = [
                [nome_paragem, horas[i]]
                for nome_paragem, horas in paradas
                if i < len(horas) and _HORA.match(horas[i].strip())
            ]
            # Uma viagem com uma paragem só não é uma viagem. Acontece quando
            # a coluna existe e está quase toda a `-----`.
            if len(passagens) >= 2:
                entrada["viagens"].append({"sentido": sentido, "passagens": passagens})
    return fora


def _escolher(lidos: dict[str, dict], quais: list[str]) -> tuple[list[dict], list[str]]:
    """Os circuitos que a receita pede, e os que pediu e não existem.

    **A lista é explícita de propósito.** Podia ser «traz tudo o que as
    brochuras não cobrem», e seria pior: decidir por semelhança de nome se dois
    circuitos são o mesmo é exatamente o juízo que precisa de olhos. Quem
    escreve a receita diz quais, e o relatório diz-lhe o que ficou de fora.
    """
    if not quais:
        return list(lidos.values()), []
    escolhidos, sem_par = [], []
    por_chave = {_chave(k): v for k, v in lidos.items()}
    for q in quais:
        achado = por_chave.get(_chave(q))
        if achado is None:
            sem_par.append(q)
        else:
            escolhidos.append(achado)
    return escolhidos, sem_par


def _saida(ctx: Contexto, saida: Saida, circuitos: list[dict], data: dt.date) -> dict:
    p = saida.params
    dia = DIAS[data.weekday()]
    regra = (
        f"Horário que o sítio de reservas mostrava para {data:%d/%m/%Y} ({dia}). "
        "Os dias em que circula não vêm nesta fonte."
    )
    quadros = []
    for c in sorted(circuitos, key=lambda x: _chave(x["nome"])):
        viagens = sorted(c["viagens"], key=lambda v: (v["sentido"] != "Ida", v["passagens"][0][1]))
        quadros.append(
            {
                "nome": c["nome"],
                "tipo": "percurso",
                "paragens": c["paragens"],
                "regras": [regra] + [str(x) for x in (p.get("regras") or [])],
                "rotulos": [f"{v['sentido']} — {data:%d/%m/%Y}" for v in viagens],
                "viagens": [
                    {"rotulo": f"{v['sentido']} — {data:%d/%m/%Y}", "passagens": v["passagens"]}
                    for v in viagens
                ],
                "horas": [],
            }
        )
    return {
        "id": (saida.saida or "reservas").split("/")[-1].removesuffix(".json"),
        "nome": str(p.get("nome") or "Transporte a pedido — horários do sítio de reservas"),
        "modo": saida.modo or "a-pedido",
        "operador": str(p.get("operador") or ctx.regiao.autoridade.get("nome") or ""),
        "cor": "",
        "rede": str(p.get("rede") or ""),
        "regras": [regra],
        "quadros": quadros,
        # NÃO se escreve «transcrito por»: ninguém transcreveu isto. Saiu de
        # uma página gravada, e a diferença importa a quem vier confirmar.
        "lido_de": ctx.caminho_curto(ctx.caminho_da_fonte(saida.fonte)),
        "data_do_horario": data.isoformat(),
    }
