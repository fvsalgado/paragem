"""Que paragem é o nome que o papel escreve.

Um caderno de horários diz «Alvito (Tv. Casal Pinhão)» numa linha e «Alvito»
noutra, e as duas podem ser a mesma paragem ou duas paragens a dois
quilómetros. Este módulo decide, por regras que se escrevem por extenso, e
deixa por decidir o que as regras não resolvem — que é o que a tabela manual
apanha, uma entrada de cada vez, com a razão.

O par é **(linha, nome)** e não o nome sozinho: a mesma palavra nomeia sítios
diferentes em linhas diferentes, e a linha é o contexto que desfaz metade das
dúvidas.

## A ordem das regras, e porque é esta

1. **A decisão manual** ganha sempre. É a única que teve olhos em cima.
2. **O alinhamento**: se a viagem do papel se alinhou com uma sequência do
   levantamento, o ponto correspondente é a paragem. É a prova mais forte que
   há sem ir ao terreno, porque não vem de os nomes se parecerem: vem de a
   ORDEM toda bater certo.
3. **O nome exato e único**: um nome que só existe num sítio é esse sítio. Com
   uma guarda — o candidato tem de ficar perto do resto da linha, senão uma
   homónima do outro lado do distrito entra sem pedir licença.
4. **O nome no corredor**: o que sobra decide-se por semelhança E por
   vizinhança, iterando enquanto houver progresso. Cada paragem resolvida
   aperta o corredor das que lhe ficam ao lado.

O que passa por aqui sem decisão fica sem coordenada e **fora das viagens**.
Não se aproxima, não se usa o centro da povoação, não se inventa.
"""

from __future__ import annotations

import collections
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from .geo import metros
from .nomes import sim
from .paragens import Universo


@dataclass(frozen=True)
class Parametros:
    """Os limiares, todos num sítio e todos com o valor que foi medido.

    Vêm da receita da região; os valores por omissão são os da construção de
    22/09/2026, e mexer neles sem um teste é mexer às cegas.
    """

    raio_do_grupo_m: float = 120
    limiar_do_alinhamento_forte: float = 0.5
    raio_do_nome_sobre_alinhamento_m: float = 1500
    limiar_do_nome_sobre_alinhamento: float = 0.8
    limiar_do_nome_exato: float = 0.95
    raio_do_nome_exato_m: float = 300
    guarda_da_linha_m: float = 25000
    limiar_do_corredor: float = 0.8
    raio_dos_vizinhos_m: float = 6000
    raio_da_linha_m: float = 15000
    limiar_parcial: float = 0.5
    raio_parcial_m: float = 2500
    rondas: int = 6


@dataclass
class Decisao:
    linha: str
    nome: str
    id: str | None
    metodo: str
    semelhanca: float | None = None
    nota: str = ""


@dataclass
class Resolucao:
    decisoes: dict[tuple[str, str], Decisao] = field(default_factory=dict)
    universo: Universo = field(default_factory=Universo)

    @property
    def resolvidas(self) -> list[Decisao]:
        return [d for d in self.decisoes.values() if d.id]

    @property
    def sem_coordenada(self) -> list[Decisao]:
        return [d for d in self.decisoes.values() if not d.id]

    def de(self, linha: str, nome: str) -> Decisao | None:
        return self.decisoes.get((str(linha), nome))

    def por_metodo(self) -> dict[str, int]:
        return dict(collections.Counter(d.metodo for d in self.decisoes.values()))

    def linhas_do_csv(self) -> list[dict[str, Any]]:
        saida = []
        for d in self.decisoes.values():
            p = self.universo.get(d.id) if d.id else None
            saida.append(
                {
                    "linha": d.linha,
                    "nome_pdf": d.nome,
                    "id": d.id or "",
                    "nome_oficial": p.nome if p else "",
                    "fonte": p.fonte if p else "",
                    "lat": p.lat if p else "",
                    "lon": p.lon if p else "",
                    "metodo": d.metodo,
                    "semelhanca": d.semelhanca if d.semelhanca is not None else "",
                    "nota": d.nota,
                }
            )
        return saida


class ErroDaTabelaManual(Exception):
    """A tabela manual fala de uma coisa que não existe.

    Rebenta de propósito, e com o nome à frente: uma decisão que aponta para
    um par que o papel já não tem, ou para uma paragem que saiu do universo,
    deixa de ser uma decisão e passa a ser uma linha que ninguém lê. É assim
    que uma tabela de 304 entradas envelhece a mentir.
    """


def _pares_do_papel(viagens: Iterable[Any]) -> dict[str, list[str]]:
    """Linha → nomes que ela serve, pela ordem em que aparecem no papel."""
    ordem: dict[str, list[str]] = {}
    for v in viagens:
        nomes = ordem.setdefault(str(v.linha), [])
        for p in v.paragens:
            if p.nome not in nomes:
                nomes.append(p.nome)
    return ordem


def validar_tabela_manual(
    manual: list[dict[str, Any]], viagens: Iterable[Any], universo: Universo
) -> None:
    ordem = _pares_do_papel(viagens)
    for entrada in manual:
        linha, nome = str(entrada["linha"]), entrada["nome"]
        if nome not in ordem.get(linha, []):
            raise ErroDaTabelaManual(
                f"a decisão {linha} × {nome!r} não corresponde a nenhum par do horário. "
                "Ou o horário mudou — e a decisão tem de ser revista —, ou o nome está "
                "escrito de outra maneira."
            )
        escolha = str(entrada.get("escolha") or "")
        if escolha in ("", "sem") or escolha.startswith("ponto:"):
            continue
        if escolha not in universo:
            raise ErroDaTabelaManual(
                f"a decisão {linha} × {nome!r} escolhe {escolha!r}, que não existe no "
                "universo de paragens. Ou a fonte mudou de identificadores, ou a "
                "escolha está mal escrita."
            )


def _grupos(
    ids: collections.Counter[str], universo: Universo, raio_m: float
) -> list[tuple[list[str], int]]:
    """Junta identificadores que estão no mesmo sítio.

    O alinhamento de viagens diferentes pode apontar para postes diferentes da
    mesma paragem — o do lado de lá da rua. Contá-los separados fazia parecer
    que havia desacordo onde há um cruzamento com dois postes.
    """
    grupos: list[tuple[list[str], int]] = []
    for ident, _n in ids.most_common():
        ponto = universo[ident].ponto
        for membros, _ in grupos:
            if metros(ponto, universo[membros[0]].ponto) <= raio_m:
                membros.append(ident)
                break
        else:
            grupos.append(([ident], 0))
    # a contagem faz-se depois, para somar tudo o que caiu em cada grupo
    somados = [(membros, sum(ids[i] for i in membros)) for membros, _ in grupos]
    somados.sort(key=lambda g: -g[1])
    return somados


def resolver(
    viagens: list[Any],
    alinhamentos: list[Any],
    universo: Universo,
    manual: list[dict[str, Any]] | None = None,
    parametros: Parametros | None = None,
) -> Resolucao:
    par = parametros or Parametros()
    manual = manual or []
    validar_tabela_manual(manual, viagens, universo)

    ordem = _pares_do_papel(viagens)
    por_linha_nome = {(str(e["linha"]), e["nome"]): e for e in manual}
    r = Resolucao(universo=universo)

    # --- o que o alinhamento aponta, por (linha, nome) ----------------------
    apontados: dict[tuple[str, str], list[tuple[str, float]]] = collections.defaultdict(list)
    for a in alinhamentos:
        if not a.alinhou:
            continue
        v = viagens[a.indice]
        for i, ident, s in a.pares:
            if ident in universo:
                apontados[(str(v.linha), v.paragens[i].nome)].append((ident, s))

    for linha, nomes in ordem.items():
        for nome in nomes:
            chave = (linha, nome)
            if chave in por_linha_nome:
                r.decisoes[chave] = _do_manual(por_linha_nome[chave], linha, nome, universo)
                continue
            if chave in apontados:
                r.decisoes[chave] = _do_alinhamento(apontados[chave], linha, nome, universo, par)

    _por_nome_exato(ordem, r, universo, par)
    _pelo_corredor(ordem, viagens, r, universo, par)

    for linha, nomes in ordem.items():
        for nome in nomes:
            r.decisoes.setdefault(
                (linha, nome), Decisao(linha, nome, None, "sem-candidato", None, "")
            )
    return r


def _do_manual(entrada: dict[str, Any], linha: str, nome: str, universo: Universo) -> Decisao:
    escolha = str(entrada.get("escolha") or "")
    metodo = "manual:" + str(entrada.get("metodo") or "oficial")
    nota = str(entrada.get("nota") or "")
    if escolha == "sem":
        return Decisao(linha, nome, None, "manual:sem", None, nota)
    if escolha.startswith("ponto:"):
        lat, lon = (float(x) for x in escolha[len("ponto:") :].split(","))
        ident = universo.ponto_manual(
            lat, lon, str(entrada.get("nome_oficial") or nome), str(entrada.get("fonte") or "")
        )
        return Decisao(linha, nome, ident, metodo, 1.0, nota)
    return Decisao(linha, nome, escolha, metodo, round(sim(nome, universo[escolha].nome), 2), nota)


def _do_alinhamento(
    apontados: list[tuple[str, float]],
    linha: str,
    nome: str,
    universo: Universo,
    par: Parametros,
) -> Decisao:
    contagem = collections.Counter(ident for ident, _ in apontados)
    melhor_sim: dict[str, float] = {}
    for ident, s in apontados:
        melhor_sim[ident] = max(melhor_sim.get(ident, 0.0), s)
    grupos = _grupos(contagem, universo, par.raio_do_grupo_m)
    membros, _ = grupos[0]
    ident = max(membros, key=lambda g: contagem[g])
    semelhanca = max(melhor_sim[g] for g in membros)
    nota = ""
    if len(grupos) > 1:
        nota = "outros grupos: " + "; ".join(
            f"{universo[g[0][0]].nome}×{g[1]} a "
            f"{metros(universo[ident].ponto, universo[g[0][0]].ponto):.0f} m"
            for g in grupos[1:]
        )
    metodo = "alinhamento"
    if semelhanca < par.limiar_do_alinhamento_forte:
        # O alinhamento pôs aqui uma paragem cujo nome não se parece nada com
        # o do papel. Pode ser a paragem certa com outro nome — acontece — ou
        # um emparelhamento que escorregou. Se houver um nome quase igual ali
        # ao lado, é esse; senão, fica o alinhamento, assinalado como fraco.
        ponto = universo[ident].ponto
        alternativas = [
            (s, c)
            for s, c in universo.candidatos(nome, par.limiar_do_nome_sobre_alinhamento)
            if not c.startswith("osm:")
            and metros(ponto, universo[c].ponto) <= par.raio_do_nome_sobre_alinhamento_m
        ]
        if alternativas:
            s, c = alternativas[0]
            distancia = metros(ponto, universo[c].ponto)
            nota = (nota + " | " if nota else "") + (
                f"alinhado a {universo[ident].nome} (s={semelhanca:.2f}) a {distancia:.0f} m"
            )
            ident, semelhanca, metodo = c, s, "nome-sobrepoe-alinhamento"
        else:
            metodo = "alinhamento-fraco"
    return Decisao(linha, nome, ident, metodo, round(semelhanca, 2), nota)


def _pontos_da_linha(linha: str, r: Resolucao) -> list[tuple[float, float]]:
    return [
        r.universo[d.id].ponto
        for (lin, _), d in r.decisoes.items()
        if lin == linha and d.id and d.id in r.universo
    ]


def _por_nome_exato(
    ordem: dict[str, list[str]], r: Resolucao, universo: Universo, par: Parametros
) -> None:
    for linha, nomes in ordem.items():
        for nome in nomes:
            chave = (linha, nome)
            if chave in r.decisoes:
                continue
            exatos = [
                (s, c)
                for s, c in universo.candidatos(nome, par.limiar_do_nome_exato)
                if not c.startswith("osm:")
            ]
            if not exatos:
                continue
            pontos = [universo[c].ponto for _, c in exatos]
            if any(metros(pontos[0], p) > par.raio_do_nome_exato_m for p in pontos[1:]):
                continue
            # Entre registos iguais, prefere-se o levantamento de quem gere a
            # rede; a ordem dos prefixos é a ordem de autoridade da receita.
            exatos.sort(
                key=lambda a: 0 if a[1].startswith("g19:") else 1 if a[1].startswith("g15:") else 2
            )
            resolvidas = _pontos_da_linha(linha, r)
            candidato = universo[exatos[0][1]].ponto
            if resolvidas and min(metros(candidato, q) for q in resolvidas) > par.guarda_da_linha_m:
                continue
            r.decisoes[chave] = Decisao(
                linha,
                nome,
                exatos[0][1],
                "nome-exato-unico",
                round(exatos[0][0], 2),
                f"{len(exatos)} registos exatos, todos a ≤{par.raio_do_nome_exato_m:.0f} m",
            )


def _vizinhos_resolvidos(
    linha: str, nome: str, viagens: list[Any], r: Resolucao
) -> list[tuple[float, float]]:
    """Onde ficam as paragens que vêm logo antes e logo depois desta, no papel."""
    pontos = []
    for v in viagens:
        if str(v.linha) != linha:
            continue
        nomes = [p.nome for p in v.paragens]
        for i, x in enumerate(nomes):
            if x != nome:
                continue
            for j in (i - 1, i + 1):
                if 0 <= j < len(nomes):
                    d = r.decisoes.get((linha, nomes[j]))
                    if d and d.id and d.id in r.universo:
                        pontos.append(r.universo[d.id].ponto)
    return pontos


def _pelo_corredor(
    ordem: dict[str, list[str]],
    viagens: list[Any],
    r: Resolucao,
    universo: Universo,
    par: Parametros,
) -> None:
    mudou, ronda = True, 0
    while mudou and ronda < par.rondas:
        mudou, ronda = False, ronda + 1
        for linha, nomes in ordem.items():
            for nome in nomes:
                chave = (linha, nome)
                if chave in r.decisoes:
                    continue
                candidatos = universo.candidatos(nome, par.limiar_parcial)
                if not candidatos:
                    continue
                vizinhos = _vizinhos_resolvidos(linha, nome, viagens, r)
                da_linha = _pontos_da_linha(linha, r)
                avaliados = []
                for s, c in candidatos[:60]:
                    ponto = universo[c].ponto
                    dv = min((metros(ponto, q) for q in vizinhos), default=None)
                    dl = min((metros(ponto, q) for q in da_linha), default=None)
                    avaliados.append((s, c, dv, dl))
                escolhidos = [
                    a
                    for a in avaliados
                    if a[0] >= par.limiar_do_corredor
                    and (
                        (a[2] is not None and a[2] <= par.raio_dos_vizinhos_m)
                        or (a[2] is None and a[3] is not None and a[3] <= par.raio_da_linha_m)
                    )
                ]
                metodo = "nome-corredor"
                if not escolhidos:
                    escolhidos = [
                        a
                        for a in avaliados
                        if a[0] >= par.limiar_parcial
                        and a[2] is not None
                        and a[2] <= par.raio_parcial_m
                    ]
                    metodo = "nome-parcial-perto"
                    if escolhidos:
                        escolhidos.sort(key=lambda a: (-a[0], a[2]))
                        # Dois candidatos igualmente parecidos e em sítios
                        # diferentes não se desempatam por acaso: não se
                        # decide nenhum.
                        if (
                            len(escolhidos) > 1
                            and escolhidos[1][0] >= escolhidos[0][0] - 0.05
                            and metros(
                                universo[escolhidos[0][1]].ponto,
                                universo[escolhidos[1][1]].ponto,
                            )
                            > 150
                        ):
                            escolhidos = []
                if not escolhidos:
                    continue
                escolhidos.sort(
                    key=lambda a: (
                        -a[0],
                        1 if a[1].startswith("osm:") else 0,
                        a[2] if a[2] is not None else a[3],
                    )
                )
                s, c, dv, dl = escolhidos[0]
                nota = (
                    f"a {dv:.0f} m dos vizinhos"
                    if dv is not None
                    else f"a {dl:.0f} m da linha (sem vizinhos resolvidos)"
                )
                r.decisoes[chave] = Decisao(linha, nome, c, metodo, round(s, 2), nota)
                mudou = True
