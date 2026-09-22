"""Paragem.pt — o pipeline de dados.

Três ideias arrumam este pacote:

- uma **região** é uma autoridade de transportes e o território que ela serve,
  e é declarada em ficheiros (`regioes/<id>/`), nunca em código;
- um **leitor** é um plugin por formato — ou, em último recurso, por fonte — e
  serve qualquer região que use esse formato;
- nada entra sem **proveniência**: uma fonte que não esteja em
  `data/sources.yaml` não se lê.

É a soma das três que faz uma região nova entrar sem um commit, e é isso que o
CI verifica em todas as corridas construindo a região de prova ao lado da
verdadeira.
"""

__version__ = "0.1.0"
