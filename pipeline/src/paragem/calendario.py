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

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any


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

    # --- feriados --------------------------------------------------------

    def feriados(self, ano: int) -> set[date]:
        """Os feriados nacionais do ano, mais os que a operadora declarar.

        Os MUNICIPAIS ficam de fora daqui de propósito: valem num concelho e
        não no resto do território, e misturá-los com os nacionais era aplicar
        o feriado de Tomar às linhas de Abrantes.
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

        Quatro dos treze concelhos do Médio Tejo têm feriado MÓVEL — dois na
        Segunda-feira de Páscoa e dois na Quinta-feira da Ascensão. Escrever
        uma data fixa para esses fica errado já no ano seguinte, e ninguém dá
        por isso porque o ficheiro continua preenchido. Daí o
        `deslocamento_pascoa`.

        Ficam de fora daqui os NACIONAIS de propósito: um feriado municipal
        vale num concelho e não no resto do território, e misturá-los era
        aplicar o feriado de Tomar às linhas de Abrantes.
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

    def _periodos(self, tipo: str) -> list[tuple[date, date]]:
        out = []
        for p in (self.d.get("ano_letivo") or {}).get("periodos") or []:
            if p.get("tipo") != tipo:
                continue
            out.append((_d(p["inicio"]), _d(p["fim"])))
        return out

    @property
    def ano_letivo_tem_datas(self) -> bool:
        """Há períodos escritos. NÃO diz que estão certos — diz que existem."""
        return bool((self.d.get("ano_letivo") or {}).get("periodos"))

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
        periodos = self._periodos("aulas")
        if not periodos:
            return None
        return any(i <= dia <= f for i, f in periodos)

    def _em_periodos(self, ids: set[str], dia: date) -> bool:
        """Está num destes períodos, pelo `id` declarado.

        Existe porque o `exceto_periodos` do AX5 era lido como «férias
        escolares» em geral quando diz «férias de Natal». O AX5 corre no
        Carnaval e na Páscoa; lê-lo em geral tirava-lhe três semanas de serviço
        que existe — e o defeito esteve escondido enquanto não houve calendário
        nenhum para o revelar.
        """
        for p in (self.d.get("ano_letivo") or {}).get("periodos") or []:
            if p.get("id") in ids and _d(p["inicio"]) <= dia <= _d(p["fim"]):
                return True
        return False

    def _em_ferias_escolares(self, dia: date) -> bool | None:
        periodos = self._periodos("ferias")
        if not periodos:
            return None
        return any(i <= dia <= f for i, f in periodos)

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
        return any(i <= dia <= f for i, f in self._periodos("incerto"))

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
        for p in (self.d.get("ano_letivo") or {}).get("periodos") or []:
            if p.get("tipo") == "aulas" and p.get("arranque") and _d(p["inicio"]).year == ano:
                return _d(p["inicio"])
        return None

    # --- resolver um código ----------------------------------------------

    def resolver(self, codigo: str, inicio: date, fim: date) -> Resolucao:
        """`E-U` → as datas entre `inicio` e `fim` em que esse serviço corre."""
        periodo, _, dias = codigo.partition("-")
        if not dias:
            raise ErroDeCalendario(
                f"o código {codigo!r} não tem a forma PERÍODO-DIAS (por exemplo «E-U»)."
            )

        res = Resolucao()
        regra_dias = self._regra_de_dias(dias, res)
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

    def _regra_de_dias(self, dias: str, res: Resolucao):
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
            return lambda d: (
                d.isoweekday() in semana and not (exclui and d in self.feriados(d.year))
            )

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
            feriado = d in self.feriados(d.year)
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
