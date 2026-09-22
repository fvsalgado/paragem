"""O que todos os testes precisam de saber: onde está a raiz, e que regiões há.

UMA REGIÃO PODE NÃO ESTAR AQUI. O código é público; a compilação de dados de
uma região quase sempre não é, enquanto a autoridade de transportes não
autorizar a reutilização — e por isso vive noutra raiz, apontada por
`PARAGEM_RAIZES` (ver `docs/RAIZES.md`).

Isso muda o que um teste pode afirmar. Quem clona só o repositório do produto
tem a região de prova e mais nada, e um teste que exija o Médio Tejo tem de
SALTAR e dizer porquê — não falhar. Falhar dava uma suite vermelha a quem não
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

    A razão importa: «não há região 'medio-tejo'» sem mais nada manda alguém
    procurar um defeito que não existe.
    """
    try:
        return carregar(RAIZ, id)
    except ErroDeRegiao as e:
        pytest.skip(f"{e} — se ela vive noutra raiz, aponta-a com PARAGEM_RAIZES (docs/RAIZES.md)")


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
