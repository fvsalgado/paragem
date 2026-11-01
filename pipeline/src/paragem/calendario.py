"""O gerador de calendário, por regras.

Substitui a projeção de datas do protótipo (o dia D usava o serviço de D−364 no
feed de junho). A projeção funciona até deixar de funcionar, e quando deixa
ninguém dá por isso: um feriado que caia noutro dia da semana produz horários
errados em silêncio, e o silêncio é o problema.

Aqui, um código de serviço — `E-U`, `A-S`, `FE-DF`, `A-2356` — resolve-se em
datas por regras declaradas em `regioes/<id>/calendario.yaml`. E uma regra que
falte NÃO se adivinha: a função devolve o que consegue e diz o que não
conseguiu, para o relatório contar.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any


def hoje() -> date:
    """O dia da construção — de onde parte a janela de serviço de cada feed.

    É uma função, e não um `date.today()` espalhado pelos leitores, por duas
    razões. A primeira é poder perguntar «e se esta região fosse construída
    noutro dia?» sem esperar por esse dia: `PARAGEM_HOJE=2031-03-03` constrói
    como se fosse então, e é assim que se prova que um calendário não
    envelhece — a pergunta que as regiões inventadas falharam a 1 de janeiro
    de 2027, quando os horários delas acabavam a 31 de dezembro. A segunda é
    os testes poderem fazer a mesma pergunta trocando esta função, sem tocar
    no relógio da máquina.

    Um valor que não se leia como data não se adivinha: rebenta, e diz qual.
    """
    valor = os.environ.get("PARAGEM_HOJE", "").strip()
    if not valor:
        return date.today()
    try:
        return date.fromisoformat(valor)
    except ValueError as e:
        raise ErroDeCalendario(
            f"PARAGEM_HOJE={valor!r} não é uma data AAAA-MM-DD — não se constrói «em» que dia."
        ) from e


class ErroDeCalendario(Exception):
    pass


@dataclass
class Resolucao:
    """As datas de um código, e o que ficou por saber."""

    datas: list[date] = field(default_factory=list)
    por_confirmar: list[str] = field(default_factory=list)

    @property
    def confiavel(self) -> bool:
        return not self.por_confirmar


#: O que um feriado municipal faz aos horários, quando alguém com autoridade o
#: disse. São as duas respostas que a pergunta admite; uma terceira — «suspende
#: só o troço do concelho» — não cabe num calendário de serviço, e quem a der
#: está a pedir outra coisa (viagens partidas), que se escreve à parte.
REGRAS_DOS_FERIADOS_MUNICIPAIS = ("como-feriado", "nada-muda")

#: A que viagens se aplica o «como-feriado». A diferença é a que separa um
#: urbano, que anda todo dentro do concelho, de uma carreira que o atravessa.
AMBITOS_DOS_FERIADOS_MUNICIPAIS = ("viagens-que-passam-no-concelho", "viagens-so-no-concelho")


@dataclass(frozen=True)
class RegraDosFeriadosMunicipais:
    """O que muda nos horários num feriado municipal — ou que não se sabe.

    **A regra vem de uma fonte, ou não vem.** Os horários publicados dizem
    «exceto feriados» e «domingos e feriados» sem dizer se um feriado municipal
    conta, e qualquer das leituras é defensável: aplicá-lo a uma linha que sai
    do concelho suprime viagens que existem no resto do percurso; não o
    aplicar anuncia viagens que não existem. Por isso não há omissão que
    escolha por quem opera: sem `regra`, fica por confirmar, e a pergunta que
    a região escreveu vai para o relatório.
    """

    regra: str | None = None
    ambito: str | None = None
    fonte: str | None = None
    pergunta: str | None = None

    @property
    def por_confirmar(self) -> bool:
        return self.regra is None

    @property
    def estado(self) -> str:
        """O que o sítio diz: `por-confirmar`, `como-feriado` ou `nada-muda`."""
        return self.regra or "por-confirmar"

    @classmethod
    def ler(cls, decl: Any) -> RegraDosFeriadosMunicipais:
        """A declaração `feriados_municipais_nos_horarios` do calendario.yaml.

        Uma regra sem fonte rebenta. Não é rigor de formulário: uma regra
        escrita sem fonte é exatamente o palpite que este bloco existe para
        impedir, e escrevê-la à mesma deixava-a valer como se a tivesse.
        """
        if decl is None:
            return cls()
        if not isinstance(decl, Mapping):
            raise ErroDeCalendario(
                "feriados_municipais_nos_horarios tem de ser um mapa (regra, ambito, fonte "
                "ou por_confirmar)."
            )
        regra = decl.get("regra")
        pergunta = decl.get("por_confirmar")
        pergunta = " ".join(str(pergunta).split()) if pergunta else None
        if regra is None:
            return cls(pergunta=pergunta)
        regra = str(regra)
        if regra not in REGRAS_DOS_FERIADOS_MUNICIPAIS:
            raise ErroDeCalendario(
                f"feriados_municipais_nos_horarios: regra {regra!r} desconhecida — é uma de "
                f"{', '.join(REGRAS_DOS_FERIADOS_MUNICIPAIS)}, ou nenhuma (por confirmar)."
            )
        fonte = " ".join(str(decl.get("fonte") or "").split())
        if not fonte:
            raise ErroDeCalendario(
                f"feriados_municipais_nos_horarios: a regra {regra!r} não diz de onde vem. "
                "O que muda num feriado municipal é de quem opera, e não se escreve sem "
                "fonte; enquanto não houver, declara-se `por_confirmar:` com a pergunta."
            )
        ambito = decl.get("ambito")
        if regra == "como-feriado" and ambito not in AMBITOS_DOS_FERIADOS_MUNICIPAIS:
            raise ErroDeCalendario(
                "feriados_municipais_nos_horarios: «como-feriado» precisa do `ambito` — "
                f"{' ou '.join(AMBITOS_DOS_FERIADOS_MUNICIPAIS)}. É a outra metade da "
                "resposta, e é a que separa um urbano de uma carreira que atravessa o concelho."
            )
        return cls(
            regra=regra, ambito=str(ambito) if ambito else None, fonte=fonte, pergunta=pergunta
        )


def pascoa(ano: int) -> date:
    """Domingo de Páscoa, pelo algoritmo anónimo gregoriano (Meeus/Jones/Butcher)."""
    a = ano % 19
    b, c = divmod(ano, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    ll = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ll) // 451
    mes, dia = divmod(h + ll - 7 * m + 114, 31)
    return date(ano, mes, dia + 1)


class Calendario:
    def __init__(self, declaracao: dict[str, Any], concelhos: list[str] | None = None) -> None:
        self.d = declaracao or {}
        self.concelhos = concelhos or []
        self._cache_feriados: dict[int, set[date]] = {}
        self._cache_periodos: dict[int, list[dict[str, Any]]] = {}

    # --- feriados --------------------------------------------------------

    def feriados(self, ano: int) -> set[date]:
        """Os feriados nacionais do ano, mais os que a operadora declarar.

        Os MUNICIPAIS ficam de fora daqui de propósito: valem num concelho e
        não no resto do território, e misturá-los com os nacionais era aplicar
        o feriado de um concelho às linhas do concelho vizinho.
        """
        if ano in self._cache_feriados:
            return self._cache_feriados[ano]

        fn = self.d.get("feriados_nacionais") or {}
        dias = {date(ano, int(f["mes"]), int(f["dia"])) for f in (fn.get("fixos") or [])}
        p = pascoa(ano)
        dias |= {p + timedelta(days=int(f["deslocamento"])) for f in (fn.get("moveis") or [])}
        for f in fn.get("feriados_operadora") or []:
            if f.get("data"):
                d_ = f["data"]
                dias.add(d_ if isinstance(d_, date) else date.fromisoformat(str(d_)))

        self._cache_feriados[ano] = dias
        return dias

    def feriados_municipais(self, ano: int) -> dict[str, date]:
        """O feriado de cada concelho nesse ano, para os que têm regra.

        Há concelhos com feriado MÓVEL — medido numa região real, quatro em
        treze: dois na Segunda-feira de Páscoa e dois na Quinta-feira da
        Ascensão. Escrever uma data fixa para esses fica errado já no ano
        seguinte, e ninguém dá por isso porque o ficheiro continua preenchido.
        Daí o `deslocamento_pascoa`.

        Ficam de fora daqui os NACIONAIS de propósito: um feriado municipal
        vale num concelho e não no resto do território, e misturá-los era
        aplicar o feriado de um concelho às linhas do concelho vizinho.
        """
        p = pascoa(ano)
        saida: dict[str, date] = {}
        for f in self.d.get("feriados_municipais") or []:
            concelho = str(f.get("concelho") or "")
            if not concelho:
                continue
            if f.get("deslocamento_pascoa") is not None:
                saida[concelho] = p + timedelta(days=int(f["deslocamento_pascoa"]))
            elif f.get("data"):
                d_ = f["data"]
                if isinstance(d_, dict):
                    saida[concelho] = date(ano, int(d_["mes"]), int(d_["dia"]))
                else:
                    velha = _d(d_)
                    saida[concelho] = date(ano, velha.month, velha.day)
        return saida

    def feriados_municipais_entre(self, inicio: date, fim: date) -> list[dict[str, Any]]:
        """Os feriados municipais que caem na janela, por data.

        É o que o relatório e o sítio mostram: o dia, o concelho, o nome e se
        a data vem da câmara. Um feriado a 24 de novembro num concelho só
        interessa a quem anda nele nesse dia — mas a esse interessa muito.
        """
        nomes = {str(f.get("concelho") or ""): f for f in (self.d.get("feriados_municipais") or [])}
        saida: list[dict[str, Any]] = []
        for ano in range(inicio.year, fim.year + 1):
            for concelho, dia in self.feriados_municipais(ano).items():
                if inicio <= dia <= fim:
                    f = nomes.get(concelho) or {}
                    saida.append(
                        {
                            "data": dia,
                            "concelho": concelho,
                            "nome": str(f.get("nome") or ""),
                            "confirmado": bool(f.get("confirmado")),
                        }
                    )
        return sorted(saida, key=lambda x: (x["data"], x["concelho"]))

    @property
    def regra_dos_feriados_municipais(self) -> RegraDosFeriadosMunicipais:
        """O que um feriado municipal faz aos horários (`RegraDosFeriadosMunicipais`)."""
        return RegraDosFeriadosMunicipais.ler(self.d.get("feriados_municipais_nos_horarios"))

    def _feriados_municipais_de(self, concelhos: Iterable[str]) -> Callable[[int], set[date]]:
        """Os feriados dos concelhos dados, ano a ano — vazio se a regra não os aplicar.

        Só a regra «como-feriado» os faz contar. Sem regra, ou com «nada-muda»,
        um feriado municipal não toca em dia nenhum: é a mesma resposta de
        antes, e agora é uma resposta declarada em vez de um silêncio.
        """
        quais = frozenset(concelhos)
        if not quais or self.regra_dos_feriados_municipais.regra != "como-feriado":
            return lambda ano: set()
        return lambda ano: {d for c, d in self.feriados_municipais(ano).items() if c in quais}

    def concelhos_com_feriado_municipal(self) -> set[str]:
        """Os concelhos cujo feriado municipal se consegue calcular."""
        return {
            str(f.get("concelho"))
            for f in (self.d.get("feriados_municipais") or [])
            if f.get("concelho") and (f.get("deslocamento_pascoa") is not None or f.get("data"))
        }

    def feriados_municipais_sem_regra(self) -> list[str]:
        """Aqueles cuja data nem sequer se consegue calcular."""
        return [
            str(f.get("concelho"))
            for f in (self.d.get("feriados_municipais") or [])
            if f.get("deslocamento_pascoa") is None and not f.get("data")
        ]

    def feriados_municipais_por_confirmar(self) -> list[str]:
        """Aqueles que se conseguem calcular mas cuja fonte não é a câmara.

        É diferente de não ter regra, e a diferença importa: um destes produz
        uma data — só não se sabe se é a certa.
        """
        return [
            str(f.get("concelho"))
            for f in (self.d.get("feriados_municipais") or [])
            if not f.get("confirmado")
            and (f.get("deslocamento_pascoa") is not None or f.get("data"))
        ]

    # --- períodos escolares ----------------------------------------------
    #
    # DUAS FORMAS DE OS DECLARAR, e a segunda existe para não envelhecer.
    #
    #   `periodos`     datas de um ano letivo concreto — é o que uma região real
    #                  tem, transcrito do despacho e do calendário da operadora,
    #                  e que se volta a transcrever todos os anos;
    #   `regra_anual`  dia e mês, sem ano — o mesmo ano letivo repetido para
    #                  sempre. NÃO é o que uma escola faz (o despacho muda as
    #                  datas de ano para ano) e por isso não serve a uma região
    #                  real; serve a uma região INVENTADA, que não tem despacho
    #                  nenhum e não pode ficar sem aulas no dia em que o ano
    #                  que alguém lá escreveu passar.
    #
    # Um período da regra que acabe «antes» de começar — férias de Natal, de
    # 17 de dezembro a 4 de janeiro — atravessa o ano, e acaba no seguinte.

    def _concretos(self, ano: int) -> list[dict[str, Any]]:
        """Todos os períodos que tocam o ano civil `ano`, já com datas.

        Os escritos com data entram tal e qual; os da regra anual entram para
        o ano anterior e para este — um período que começa em dezembro do ano
        anterior pode ainda estar a correr em janeiro deste.
        """
        if ano in self._cache_periodos:
            return self._cache_periodos[ano]
        ano_letivo = self.d.get("ano_letivo") or {}
        saida: list[dict[str, Any]] = []
        for p in ano_letivo.get("periodos") or []:
            saida.append({**p, "inicio": _d(p["inicio"]), "fim": _d(p["fim"])})
        for p in ano_letivo.get("regra_anual") or []:
            for a in (ano - 1, ano):
                comeca = date(a, int(p["inicio"]["mes"]), int(p["inicio"]["dia"]))
                acaba = date(a, int(p["fim"]["mes"]), int(p["fim"]["dia"]))
                if acaba < comeca:
                    acaba = date(a + 1, acaba.month, acaba.day)
                saida.append({**p, "inicio": comeca, "fim": acaba})
        self._cache_periodos[ano] = saida
        return saida

    def _periodos(self, tipo: str, ano: int) -> list[tuple[date, date]]:
        return [(p["inicio"], p["fim"]) for p in self._concretos(ano) if p.get("tipo") == tipo]

    @property
    def ano_letivo_tem_datas(self) -> bool:
        """Há períodos escritos. NÃO diz que estão certos — diz que existem."""
        ano_letivo = self.d.get("ano_letivo") or {}
        return bool(ano_letivo.get("periodos") or ano_letivo.get("regra_anual"))

    @property
    def ano_letivo_confirmado(self) -> bool:
        """A operadora confirmou estas datas para os SEUS serviços.

        São duas perguntas e durante muito tempo foram uma só, o que deixava
        587 viagens sem dia nenhum por não haver um carimbo. Ter datas boas e
        por confirmar é um estado diferente de não ter datas: com elas o
        planeador responde e a página diz o que ainda não está fechado; sem
        elas não há nada para dizer.
        """
        return bool((self.d.get("ano_letivo") or {}).get("confirmado"))

    def _em_aulas(self, dia: date) -> bool | None:
        if not self.ano_letivo_tem_datas:
            return None
        return any(i <= dia <= f for i, f in self._periodos("aulas", dia.year))

    def _em_periodos(self, ids: set[str], dia: date) -> bool:
        """Está num destes períodos, pelo `id` declarado.

        Existe porque o `exceto_periodos` do AX5 era lido como «férias
        escolares» em geral quando diz «férias de Natal». O AX5 corre no
        Carnaval e na Páscoa; lê-lo em geral tirava-lhe três semanas de serviço
        que existe — e o defeito esteve escondido enquanto não houve calendário
        nenhum para o revelar.
        """
        return any(
            p.get("id") in ids and p["inicio"] <= dia <= p["fim"] for p in self._concretos(dia.year)
        )

    def _em_ferias_escolares(self, dia: date) -> bool | None:
        if not self.ano_letivo_tem_datas:
            return None
        return any(i <= dia <= f for i, f in self._periodos("ferias", dia.year))

    def _incerto(self, dia: date) -> bool:
        """Um dia em que nem sequer se sabe se há aulas.

        O calendário escolar oficial não resolve tudo: dá um INTERVALO para o
        arranque (cada agrupamento escolhe lá dentro) e três datas diferentes
        para o fim do 3.º período, conforme o ciclo. Nesses dias não se escolhe
        por conta própria — declaram-se `tipo: incerto` e ficam de fora dos
        serviços que dependem do período escolar.

        Ficar de fora é a direção segura: dizer que um autocarro passa e ele
        não passar deixa alguém à espera; dizer que não passa manda-o procurar
        outra coisa. Os dois são erros, mas só um deles perde o dia a alguém.
        """
        return any(i <= dia <= f for i, f in self._periodos("incerto", dia.year))

    def dias_incertos(self, inicio: date, fim: date) -> list[date]:
        """Para o relatório de lacunas contar o que isto custa, em dias úteis."""
        dias, d = [], inicio
        while d <= fim:
            if self._incerto(d) and d.isoweekday() <= 5 and d not in self.feriados(d.year):
                dias.append(d)
            d += timedelta(days=1)
        return dias

    def _inicio_do_ano_letivo(self, ano: int) -> date | None:
        """O dia em que ABRE um ano letivo — não o regresso de uma interrupção.

        Tem de ser declarado (`arranque: true`) e não deduzido do primeiro
        período do ano civil: em 2027 o primeiro período de aulas começa a 4 de
        janeiro, que é o regresso do Natal. Tomá-lo por arranque fazia o V5
        («28 de junho até ao início do ano letivo») pedir um intervalo que
        acaba antes de começar, e devolver zero datas sem se queixar.

        Um ano cujo arranque não esteja declarado devolve None, e quem depende
        dele di-lo no relatório em vez de produzir um calendário vazio.
        """
        for p in self._concretos(ano):
            if p.get("tipo") == "aulas" and p.get("arranque") and p["inicio"].year == ano:
                return p["inicio"]
        return None

    # --- resolver um código ----------------------------------------------

    def resolver(
        self, codigo: str, inicio: date, fim: date, concelhos: Iterable[str] = ()
    ) -> Resolucao:
        """`E-U` → as datas entre `inicio` e `fim` em que esse serviço corre.

        `concelhos` são os concelhos cujo feriado municipal vale para ESTE
        serviço — quem chama sabe por onde andam as viagens dele. Só contam se
        a região declarar que um feriado municipal se faz como feriado
        (`feriados_municipais_nos_horarios`); de outro modo não mudam nada.
        """
        periodo, _, dias = codigo.partition("-")
        if not dias:
            raise ErroDeCalendario(
                f"o código {codigo!r} não tem a forma PERÍODO-DIAS (por exemplo «E-U»)."
            )

        res = Resolucao()
        municipais = self._feriados_municipais_de(concelhos)
        cache: dict[int, set[date]] = {}

        def e_feriado(d: date) -> bool:
            if d.year not in cache:
                cache[d.year] = self.feriados(d.year) | municipais(d.year)
            return d in cache[d.year]

        regra_dias = self._regra_de_dias(dias, res, e_feriado)
        if regra_dias is None:
            return res
        regra_periodo = self._regra_de_periodo(periodo, res)
        if regra_periodo is None:
            return res

        dia = inicio
        while dia <= fim:
            if regra_dias(dia) and regra_periodo(dia):
                res.datas.append(dia)
            dia += timedelta(days=1)
        return res

    def _regra_de_dias(self, dias: str, res: Resolucao, e_feriado: Callable[[date], bool]):
        decl = (self.d.get("codigos") or {}).get("dias") or {}
        digitos = (self.d.get("codigos") or {}).get("digitos") or {}

        if dias.isdigit():
            mapa = {str(k): int(v) for k, v in (digitos.get("mapa") or {}).items()}
            desconhecidos = [c for c in dias if c not in mapa]
            if desconhecidos:
                res.por_confirmar.append(
                    f"dígitos {''.join(desconhecidos)} do código de dias {dias!r}"
                )
                return None
            semana = {mapa[c] for c in dias}
            exclui = bool(digitos.get("exclui_feriados", True))
            return lambda d: d.isoweekday() in semana and not (exclui and e_feriado(d))

        regra = decl.get(dias)
        if not regra or not regra.get("dias_da_semana"):
            # Um código cuja leitura não está confirmada NÃO se adivinha. A
            # forma de «DFXN» sugere exclusão, mas sugerir não é saber, e um
            # serviço projetado para o dia errado é pior do que um em falta.
            res.por_confirmar.append(f"código de dias {dias!r}")
            return None

        semana = {int(x) for x in regra["dias_da_semana"]}
        exclui = bool(regra.get("exclui_feriados", False))
        inclui = bool(regra.get("inclui_feriados", False))
        fora_semana = {int(x) for x in (regra.get("excluir_dias_da_semana") or [])}
        fora_datas = {(int(x["mes"]), int(x["dia"])) for x in (regra.get("excluir_datas") or [])}

        def corre(d: date) -> bool:
            # As exclusões vêm primeiro e ganham a tudo. «Sábados e feriados
            # exceto domingos» quer dizer que um feriado ao domingo NÃO conta,
            # apesar de ser feriado — e a ordem é o que faz a diferença.
            if (d.month, d.day) in fora_datas or d.isoweekday() in fora_semana:
                return False
            feriado = e_feriado(d)
            if feriado and inclui:
                return True
            if feriado and exclui:
                return False
            return d.isoweekday() in semana

        return corre

    def _regra_de_periodo(self, periodo: str, res: Resolucao):
        decl = (self.d.get("codigos") or {}).get("periodo") or {}
        regra = decl.get(periodo)
        if not regra or not regra.get("regra"):
            res.por_confirmar.append(f"código de período {periodo!r}")
            return None

        tipo = regra["regra"]

        if tipo == "todo-o-ano":
            return lambda d: True

        if tipo in {"periodos-de-aulas", "periodos-de-ferias"}:
            if not self.ano_letivo_tem_datas:
                res.por_confirmar.append(
                    f"período {periodo!r}: o ano letivo não está transcrito em calendario.yaml"
                )
                return None
            if not self.ano_letivo_confirmado:
                res.por_confirmar.append(
                    f"período {periodo!r}: datas do calendário escolar oficial, "
                    "por confirmar com a operadora"
                )
            f = self._em_aulas if tipo == "periodos-de-aulas" else self._em_ferias_escolares
            return lambda d: not self._incerto(d) and bool(f(d))

        if tipo == "intervalo-anual":
            ini = regra.get("inicio") or {}
            if regra.get("fim") == "inicio-do-ano-letivo":
                if not self.ano_letivo_tem_datas:
                    res.por_confirmar.append(
                        f"período {periodo!r}: acaba no início do ano letivo, "
                        "que não está transcrito"
                    )
                    return None
                if not self.ano_letivo_confirmado:
                    res.por_confirmar.append(
                        f"período {periodo!r}: acaba no início do ano letivo, "
                        "que o despacho dá como intervalo e a operadora ainda não fechou"
                    )

            def dentro(d: date) -> bool:
                if self._incerto(d):
                    return False
                comeca = date(d.year, int(ini["mes"]), int(ini["dia"]))
                acaba = self._inicio_do_ano_letivo(d.year)
                return acaba is not None and comeca <= d < acaba

            return dentro

        if tipo == "todo-o-ano-exceto":
            meses = {int(m) for m in (regra.get("exceto_meses") or [])}
            excluidos = {str(x) for x in (regra.get("exceto_periodos") or [])}
            precisa_ferias = bool(excluidos)
            if precisa_ferias:
                if not self.ano_letivo_tem_datas:
                    res.por_confirmar.append(
                        f"período {periodo!r}: exclui férias escolares, que não estão transcritas"
                    )
                    return None
                if not self.ano_letivo_confirmado:
                    res.por_confirmar.append(
                        f"período {periodo!r}: exclui férias escolares tiradas do calendário "
                        "escolar oficial, por confirmar com a operadora"
                    )

            def fora(d: date) -> bool:
                if d.month in meses or self._incerto(d):
                    return False
                return not (precisa_ferias and self._em_periodos(excluidos, d))

            return fora

        res.por_confirmar.append(f"regra de período desconhecida: {tipo!r}")
        return None


def _d(v: Any) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v))


# --- o nome por extenso de um código --------------------------------------

#: O dia da semana ISO no plural, como se diz «às segundas». É língua, não é
#: dado de nenhuma região: quem diz que «2» é segunda-feira é a declaração
#: (`codigos.digitos.mapa`), e aqui só se escreve o nome do dia que ela aponta.
DIAS_NO_PLURAL = {
    1: "segundas",
    2: "terças",
    3: "quartas",
    4: "quintas",
    5: "sextas",
    6: "sábados",
    7: "domingos",
}


def por_extenso(partes: list[str]) -> str:
    """`["a", "b", "c"]` → «a, b e c». Uma só fica como está."""
    if len(partes) <= 1:
        return "".join(partes)
    return f"{', '.join(partes[:-1])} e {partes[-1]}"


def _maiuscula(texto: str) -> str:
    return texto[:1].upper() + texto[1:]


class NomesDosCodigos:
    """`E-235` → «Escolar · Segundas, terças e quintas, exceto feriados».

    **O código cru chegava a quem viaja.** A página da paragem mais servida da
    região tinha cinco quadros com títulos como «E-235», «E-2356» e «E-46» — e
    um leitor de ecrã anunciava «tabela E-235». O nome era montado só com os
    códigos de dias DECLARADOS UM A UM (`U`, `S`, `DF`…), e os dias por
    algarismos — cada combinação é um código diferente — caíam no código.

    Os algarismos já tinham regra: o `codigos.digitos.mapa` diz que dia da
    semana é cada um, e é com ele que o `resolver` acima lhes dá datas. O nome
    sai da MESMA regra, e por isso não se pode desencontrar das datas: se a
    declaração disser que «2» é segunda-feira, o quadro diz «segundas» e o
    calendário põe-no às segundas.

    O que a declaração não diz não se adivinha: um período desconhecido não
    tem nome (quem chama decide o que mostrar), e uns dias desconhecidos dizem
    «Dias por confirmar» — nunca o código.

    **A ORDEM é a da declaração.** Os quadros saíam por ordem alfabética do
    título, e «E-235» caía entre «Anual» e «Escolar». A ordem em que a região
    escreve os períodos (Anual, Escolar, Férias…) e os dias (úteis, sábados,
    domingos…) é a ordem por que um horário impresso se lê; os dias por
    algarismos vêm depois dos declarados, por ordem do primeiro dia.
    """

    def __init__(self, declaracao: dict[str, Any] | None, prefixos: list[str] | None = None):
        codigos = (declaracao or {}).get("codigos") or {}
        self.periodos: dict[str, Any] = dict(codigos.get("periodo") or {})
        self.dias: dict[str, Any] = dict(codigos.get("dias") or {})
        self.digitos: dict[str, Any] = dict(codigos.get("digitos") or {})
        # Os `service_id` levam por vezes o prefixo do concelho (`ABT_E-U`), por
        # causa dos calendários escolares. O nome é o do código base: o
        # concelho já está na página.
        self.prefixos = {p.upper() for p in (prefixos or []) if p}

    def _base(self, codigo: str) -> str:
        cabeca, sep, resto = codigo.partition("_")
        return resto if sep and cabeca.upper() in self.prefixos else codigo

    def _mapa_dos_digitos(self) -> dict[str, int]:
        return {str(k): int(v) for k, v in (self.digitos.get("mapa") or {}).items()}

    def nome_dos_dias(self, dias: str) -> str | None:
        decl = self.dias.get(dias)
        if decl:
            return (decl or {}).get("nome") or None
        if dias.isdigit():
            mapa = self._mapa_dos_digitos()
            if any(c not in mapa for c in dias):
                return None
            semana = sorted({mapa[c] for c in dias})
            texto = _maiuscula(
                por_extenso([DIAS_NO_PLURAL[d] for d in semana if d in DIAS_NO_PLURAL])
            )
            # Os feriados ficam de fora quando a regra os exclui — é o que o
            # `_regra_de_dias` faz às datas, e o nome tem de dizer o mesmo.
            return (
                f"{texto}, exceto feriados" if self.digitos.get("exclui_feriados", True) else texto
            )
        return None

    def nome(self, codigo: str) -> str | None:
        """O nome por extenso, ou `None` se o código não for desta declaração."""
        periodo, _, dias = self._base(codigo).partition("-")
        if not dias or periodo not in self.periodos:
            return None
        nome_do_periodo = (self.periodos[periodo] or {}).get("nome") or periodo
        return f"{nome_do_periodo} · {self.nome_dos_dias(dias) or 'Dias por confirmar'}"

    def get(self, codigo: str, omissao: str | None = None) -> str | None:
        """A mesma pergunta que se fazia ao dicionário de antes."""
        return self.nome(codigo) or omissao

    def ordem(self, codigo: str) -> tuple[int, int, int, str]:
        """A chave para ordenar quadros: período, dias, e o código para desempatar."""
        periodo, _, dias = self._base(codigo).partition("-")
        periodos = list(self.periodos)
        declarados = list(self.dias)
        i_periodo = periodos.index(periodo) if periodo in periodos else len(periodos)
        if dias in declarados:
            i_dias, primeiro = declarados.index(dias), 0
        elif dias.isdigit():
            mapa = self._mapa_dos_digitos()
            i_dias = len(declarados)
            primeiro = min((mapa.get(c, 9) for c in dias), default=9)
        else:
            i_dias, primeiro = len(declarados) + 1, 0
        return (i_periodo, i_dias, primeiro, codigo)


def nome_pela_semana(linha: dict[str, Any] | None) -> str | None:
    """O nome de um serviço que não segue os códigos da região, pela semana.

    Um feed de outra entidade chama aos serviços o que quiser — «WKD», «S1» —
    e o identificador dele não é um título. O que o `calendar.txt` diz é em
    que dias da semana anda, e é isso que se escreve. Não se diz «dias úteis»:
    o `calendar.txt` não sabe de feriados, e «segunda a sexta» é o que ele
    afirma de facto.
    """
    if not linha:
        return None
    nomes = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    semana = [i + 1 for i, n in enumerate(nomes) if str(linha.get(n, "")).strip() == "1"]
    if not semana:
        return None
    if semana == [1, 2, 3, 4, 5, 6, 7]:
        return "Todos os dias"
    if semana == [1, 2, 3, 4, 5]:
        return "Segunda a sexta"
    return _maiuscula(por_extenso([DIAS_NO_PLURAL[d] for d in semana]))
