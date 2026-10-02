"""O guarda das fugas, e o mesmo concelho em duas regiões.

Duas coisas que o `check-regioes` passou a fazer, e o que NÃO pode fazer:

- procura os NOMES DOS CONCELHOS das outras regiões — mas só nas saídas de uma
  região inventada, que saem de ficheiros nossos e congelados. As de uma
  região real saem de fontes vivas, onde qualquer terra pode aparecer com toda
  a razão;
- aceita o MESMO CONCELHO em duas regiões: servido pela concessão de uma e
  membro da autoridade de outra é o território, e não uma colisão.

As regiões são inventadas aqui, com o mínimo que o guarda lê.
"""

from types import SimpleNamespace

from paragem.regiao import Concelho
from paragem.verificacoes import _concelhos_de_outras, _concelhos_em_conflito, _procurar


def _concelho(id: str, nome: str, dico: str, membro: bool = True) -> Concelho:
    return Concelho(id=id, nome=nome, distrito="D", dico=dico, membro=membro)


def _regiao(id: str, concelhos: list[Concelho], demonstracao: bool = True):
    return SimpleNamespace(id=id, concelhos=concelhos, demonstracao=demonstracao)


VALE = _concelho("vale-fundo", "Vale Fundo", "9991")
CUME = _concelho("cume-largo", "Cume Largo", "9992")
FOZ = _concelho("foz-mansa", "Foz Mansa", "9993")


def test_o_mesmo_concelho_em_duas_regioes_nao_e_colisao():
    # Membro de uma, servido pela outra: as duas declaram-no, com o mesmo dico.
    uma = _regiao("uma", [VALE, CUME])
    outra = _regiao("outra", [FOZ, _concelho("cume-largo", "Cume Largo", "9992", membro=False)])
    assert _concelhos_em_conflito([uma, outra]) == []


def test_o_mesmo_identificador_para_dois_concelhos_reprova():
    uma = _regiao("uma", [VALE])
    outra = _regiao("outra", [_concelho("vale-fundo", "Vale Fundo de Baixo", "9994")])
    falhas = _concelhos_em_conflito([uma, outra])
    assert len(falhas) == 1 and "vale-fundo" in falhas[0]


def test_o_mesmo_concelho_com_dois_identificadores_reprova():
    uma = _regiao("uma", [VALE])
    outra = _regiao("outra", [_concelho("valefundo", "Vale Fundo", "9991")])
    falhas = _concelhos_em_conflito([uma, outra])
    assert len(falhas) == 1 and "9991" in falhas[0]


def test_os_concelhos_das_outras_procuram_se_numa_inventada():
    alvo = _regiao("alvo", [VALE])
    outra = _regiao("outra", [CUME, FOZ], demonstracao=False)
    assert _concelhos_de_outras(alvo, [alvo, outra]) == ["Cume Largo", "Foz Mansa"]


def test_um_concelho_que_o_alvo_tambem_declara_nao_e_fuga():
    # Pelo dico — o mesmo concelho servido por um e membro do outro — ou pelo
    # nome, quando a outra região não o codificou igual.
    alvo = _regiao("alvo", [VALE, _concelho("cume", "Cume Largo", "")])
    outra = _regiao("outra", [_concelho("vale-fundo", "Vale Fundo", "9991"), CUME, FOZ])
    assert _concelhos_de_outras(alvo, [alvo, outra]) == ["Foz Mansa"]


def test_nas_saidas_de_uma_regiao_real_nao_se_procuram_terras():
    # O feed nacional do comboio traz as estações do país inteiro, e há
    # carreiras que atravessam a fronteira: o nome de uma terra de outra região
    # numa saída real não é fuga nenhuma.
    real = _regiao("real", [VALE], demonstracao=False)
    inventada = _regiao("inventada", [CUME])
    assert _concelhos_de_outras(real, [real, inventada]) == []


def test_um_nome_de_concelho_so_conta_como_palavra_inteira(tmp_path):
    (tmp_path / "a.json").write_text('{"x": "Foz Mansa (Centro)"}', encoding="utf-8")
    (tmp_path / "b.json").write_text('{"x": "Foz Mansarda"}', encoding="utf-8")
    achados = _procurar(tmp_path, ["Foz Mansa"], palavra_inteira=True)
    assert achados == ["a.json: 'Foz Mansa'"]
