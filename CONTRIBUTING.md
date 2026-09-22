# Como contribuir

Obrigado pelo interesse. Este documento diz o que é preciso saber antes de
abrir um PR, e algumas regras que aqui não são preferências de estilo — são
invariantes de um produto em que um erro põe alguém à espera de um autocarro
que não vem.

## O que ajuda mais

Por ordem de utilidade real, e não de dificuldade:

1. **Corrigir dados.** Uma paragem que mudou de sítio, um horário que já não é
   o que está no PDF, uma linha suprimida, uma praça de táxis que não existe.
   Abre um issue com o que sabes e com a fonte; não é preciso escrever código
   nenhum. Se souberes as coordenadas de uma das paragens que estão em falta
   (ver o relatório de lacunas), isso vale mais do que quase tudo o resto.
2. **Escrever um leitor** para um formato que ainda não está coberto. É o
   trabalho com melhor relação entre esforço e território que passa a ser
   servido.
3. **Acessibilidade.** Se encontrares alguma coisa que não funciona só com o
   teclado, que o leitor de ecrã anuncia mal ou que não se lê com pouco
   contraste, isso é um defeito, não um pedido de melhoria.
4. **Código.** O resto.

## Antes de começar

Abre um issue antes de um PR grande. Não por burocracia: metade do que este
projeto faz de maneira pouco óbvia está assim por uma razão escrita algures, e
vale a pena encontrá-la antes de escrever trezentas linhas.

## Preparar a máquina

Python 3.11 ou mais recente e [uv](https://docs.astral.sh/uv/). Para o parser
de horários, o `pdftotext` do pacote `poppler-utils`.

```bash
uv sync
uv run pipeline build --regiao prova   # a região fictícia: segundos, sem rede
uv run pytest
```

A região de prova é o caminho mais curto para ver o pipeline inteiro a
funcionar: é inventada, não pede nada a ninguém e corre sem rede.

## Antes de submeter

As mesmas verificações que o CI corre:

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv run pipeline check-proveniencia
uv run pipeline build --regiao prova && uv run pipeline check-regioes
```

## Regras que não são negociáveis

### Língua

Identificadores, nomes de ficheiro, nomes de campo e chaves de configuração em
**inglês** onde o formato o exige (o GTFS e o GBFS têm nomes de coluna fixos) e
em **português** no resto do código desta casa. Texto visível, comentários,
mensagens de erro e documentação em **português de Portugal** — nunca do
Brasil.

### Nunca inventar dados

É a regra que mais vezes se é tentado a quebrar, e sempre com boa intenção: uma
coordenada estimada a olho para uma paragem não ficar de fora, uma hora
interpolada para um horário não ter buracos, um destino adivinhado pelo nome da
linha.

**Não.** O que falta fica em falta, aparece no relatório de lacunas, e na
interface aparece como falta. Uma paragem ausente é um problema visível que
alguém corrige; uma paragem no sítio errado é um problema invisível que manda
uma pessoa para o lado errado da estrada.

Quando o pipeline *tem* de estimar — a interpolação das horas intermédias entre
dois pontos de horário é uma estimativa, e necessária — isso fica marcado no
que sai, não escondido.

### Não raspar quem o proíbe

Há sítios de autoridades de transportes e de operadoras que bloqueiam acesso
automático no `robots.txt`, e sistemas de reserva que só se automatizam com
autorização escrita de quem os gere. O que vem desses sítios entra à mão, em
`data/manual/<regiao>/`, com a origem e a data.

**Um PR que contorne isto não entra, por melhor que seja o código.** A regra
está executável em `pipeline/src/paragem/fontes.py`: uma fonte marcada `manual`
ou `proibido-sem-autorizacao` levanta exceção se alguém a tentar descarregar.

### Um leitor não é um fork por região

Um leitor é um plugin por **formato** ou, em último recurso, por **fonte** — e
serve qualquer região que use esse formato. A região diz o que tem; o leitor
não sabe onde está. É isto que faz uma região nova entrar sem um commit, e é o
que o CI verifica em todas as corridas.

Numa fonte nova experimenta-se por esta ordem: um leitor genérico existente, um
leitor genérico novo, e só depois um leitor específico daquela fonte.

## Direitos: a cláusula de entrada

Isto está aqui antes de haver contribuições de fora, de propósito. Uma licença
de saída — a AGPL — não dá ao projeto título sobre trabalho alheio, e quem
licencia fora da AGPL ou vende exceções tem de deter o copyright.

Ao abrir um PR, declaras e aceitas três coisas:

1. **Que tens o direito de contribuir o que contribuis** — que é teu, ou que
   tens autorização de quem o fez. Se trouxeres código, texto, imagem ou dados
   de outra origem, dizes de onde vêm e sob que licença, e isso entra em
   [`docs/TERCEIROS.md`](docs/TERCEIROS.md) e, sendo dados, em
   [`data/sources.yaml`](data/sources.yaml).
2. **Que o teu contributo é distribuído sob [AGPL-3.0-only](LICENSE)**, como o
   resto do projeto.
3. **Que concedes ao titular** — Fábio Salgado, ver [`AUTORIA.md`](AUTORIA.md) —
   **uma licença perpétua, mundial, irrevogável e isenta de royalties para usar,
   modificar e relicenciar o teu contributo, incluindo sob termos diferentes da
   AGPL.** Sem isto, uma única contribuição de fora impediria para sempre o
   licenciamento do produto a uma autoridade de transportes — não por má-fé de
   ninguém, mas porque a AGPL não se pode levantar sobre trabalho alheio sem
   autorização de quem o fez.

Continuas titular do que escreveste. O ponto 3 é uma licença ao projeto, não
uma cessão: não te tira nada, e permite ao produto ser contratado por uma CIM
sem que o teu leitor tenha de ser arrancado.

A redação definitiva desta cláusula está por confirmar com advogado.
