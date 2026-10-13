"""O que todos os testes precisam de saber: onde está a raiz, e que regiões há.

UMA REGIÃO PODE NÃO ESTAR AQUI. O código é público; a compilação de dados de
uma região quase sempre não é, enquanto a autoridade de transportes não
autorizar a reutilização — e por isso vive noutra raiz, apontada por
`PARAGEM_RAIZES` (ver `docs/RAIZES.md`).

Isso muda o que um teste pode afirmar. Quem clona só o repositório do produto
tem as regiões inventadas e mais nada, e um teste que exija os dados de um
cliente tem de SALTAR e dizer porquê — não falhar. Falhar dava uma suite vermelha a quem não
fez nada de errado, e uma suite que está sempre vermelha deixa de se ler.

O que NÃO se faz é apagar esses testes. Eles continuam a valer para quem tem as
duas raízes — e é aí que correm, no CI que constrói para produção.
"""

from pathlib import Path

import pytest

from paragem.regiao import ErroDeRegiao, carregar, carregar_todas

RAIZ = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def raiz() -> Path:
    return RAIZ


def regiao_ou_salta(id: str):
    """A região, ou um salto com a razão escrita.

    A razão importa: «não há região 'x'» sem mais nada manda alguém procurar um
    defeito que não existe.

    SÓ PARA AS REGIÕES DESTA RAIZ, que são inventadas. Uma de um cliente não se
    pede pelo nome — ver `regiao_que`.
    """
    try:
        return carregar(RAIZ, id)
    except ErroDeRegiao as e:
        pytest.skip(f"{e} — se ela vive noutra raiz, aponta-a com PARAGEM_RAIZES (docs/RAIZES.md)")


def regiao_que(predicado, o_que: str):
    """A primeira região, de qualquer raiz, com a PROPRIEDADE que o teste quer.

    OS TESTES NÃO NOMEIAM A REGIÃO DE UM CLIENTE (CLAUDE.md §5.1 e §10): a
    suite é pública, e um teste que pedisse uma região pelo identificador
    escrevia na suite o nome de quem nos contrata. Pede-se pelo que se está a
    testar — «um calendário com o código AX5», «uma receita com cartazes de
    horários» — e corre onde houver uma região assim; onde não houver, salta
    com a razão escrita.

    `o_que` completa a frase «nenhuma região desta raiz …».
    """
    for r in carregar_todas(RAIZ):
        try:
            if predicado(r):
                return r
        except (AttributeError, KeyError, TypeError):
            continue
    pytest.skip(
        f"nenhuma região desta raiz {o_que} — se ela vive noutra raiz, aponta-a com "
        "PARAGEM_RAIZES (docs/RAIZES.md)"
    )


def construcao_de(r) -> Path:
    """Onde o `pipeline build` deixa as saídas desta região."""
    return RAIZ / "build" / r.id


def dados_de(id: str) -> Path:
    """A raiz de dados da região: é contra ela que os ficheiros dela se resolvem."""
    return regiao_ou_salta(id).raiz_de_dados


def ids_das_regioes() -> list[str]:
    """Os identificadores das regiões que esta raiz vê, por ordem.

    Serve para parametrizar: um teste que tem de valer para TODAS as regiões
    escreve-se uma vez e corre para as que estiverem cá. Cravar a lista dava um
    teste que passa a mentir no dia em que entra uma região nova — que é
    precisamente o dia em que ele tinha de falar.
    """
    return sorted(x.id for x in carregar_todas(RAIZ))
