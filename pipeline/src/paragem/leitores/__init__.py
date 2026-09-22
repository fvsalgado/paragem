"""O registo dos leitores.

Um leitor entra aqui e passa a estar disponível a TODAS as regiões. É o que faz
com que uma região nova entre sem um commit — desde que use os que já existem.

`ESPECIFICOS_DA_FONTE` é a lista dos que servem uma fonte só. Está aqui para
ser contada: hoje tem um, e o dia em que tiver seis é o dia em que o produto
deixou de ser genérico sem ninguém ter decidido isso.
"""

from __future__ import annotations

from collections.abc import Callable

from . import (
    a_pedido_flex,
    camadas_geojson,
    gbfs_operadora,
    gtfs_arquivo,
    gtfs_filtrado,
    horarios_manuais,
    horarios_pdf_cartaz,
    horarios_pdf_operadora,
    horarios_reservas,
    osm,
    osm_sitios,
    stepp,
    universo_paragens,
)
from .base import Contexto, Resultado  # noqa: F401 — reexportados de propósito

LEITORES: dict[str, Callable] = {
    a_pedido_flex.nome: a_pedido_flex.ler,
    camadas_geojson.nome: camadas_geojson.ler,
    gbfs_operadora.nome: gbfs_operadora.ler,
    gtfs_arquivo.nome: gtfs_arquivo.ler,
    gtfs_filtrado.nome: gtfs_filtrado.ler,
    osm.nome_recorte: osm.recorte,
    osm.nome_bicicletas: osm.bicicletas,
    osm.nome_taxis: osm.taxis,
    osm.nome_rotas: osm.rotas,
    osm_sitios.nome: osm_sitios.ler,
    horarios_pdf_operadora.nome: horarios_pdf_operadora.ler,
    horarios_pdf_cartaz.nome: horarios_pdf_cartaz.ler,
    horarios_manuais.nome: horarios_manuais.ler,
    horarios_reservas.nome: horarios_reservas.ler,
    stepp.nome: stepp.ler,
    universo_paragens.nome: universo_paragens.ler,
}

GENERICOS = {
    a_pedido_flex.nome,
    camadas_geojson.nome,
    gbfs_operadora.nome,
    gtfs_arquivo.nome,
    gtfs_filtrado.nome,
    osm.nome_recorte,
    osm.nome_bicicletas,
    osm.nome_taxis,
    osm.nome_rotas,
    osm_sitios.nome,
    horarios_pdf_cartaz.nome,
    horarios_manuais.nome,
    horarios_reservas.nome,
    stepp.nome,
    universo_paragens.nome,
}

ESPECIFICOS_DA_FONTE = {horarios_pdf_operadora.nome}

# OS DOIS CAMINHOS ATÉ UM HORÁRIO EM PAPEL, e saem na mesma forma de propósito.
#
# O `horarios-pdf-cartaz` lê a folha sozinho; o `horarios-manuais` é alguém a
# transcrevê-la, quando a folha não se deixa ler sem risco. A diferença
# importa a quem mantém isto — e para quem abre a página é o mesmo horário.
#
# Está aqui, e não em cada sítio que precisa de a saber, porque foi assim que
# se perdeu: o `sitio.py` perguntava pelo `horarios-pdf-cartaz` e as três
# transcrições construíam-se sem chegar a página nenhuma, e a contagem de
# brochuras no relatório dizia catorze onde havia dezassete. Um leitor novo
# com esta forma entra aqui, uma vez.
LEITORES_DE_HORARIO = {horarios_pdf_cartaz.nome, horarios_manuais.nome, horarios_reservas.nome}


def obter(nome: str) -> Callable:
    try:
        return LEITORES[nome]
    except KeyError:
        raise KeyError(f"não há leitor {nome!r}. Há: {', '.join(sorted(LEITORES))}.") from None
