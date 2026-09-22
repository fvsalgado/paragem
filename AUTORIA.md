# Autoria e direitos

Copyright © 2026 Fábio Salgado &lt;fvsalgado@gmail.com&gt;

Este é o sítio canónico desta afirmação. Onde houver divergência entre este
ficheiro e qualquer outro texto do repositório, vale este.

## O que é reclamado

O código do pipeline de dados e do sítio, a configuração das regiões, o desenho
do produto, a prosa da documentação, e a **compilação** dos dados — a escolha
das fontes, a reconstrução dos horários a partir delas, a verificação e a
organização.

## O que não é reclamado

Isto vai dentro do repositório, ou sai do pipeline, e **não é nosso**. O
inventário com origem, licença e data está em
[`docs/TERCEIROS.md`](docs/TERCEIROS.md) e em
[`data/sources.yaml`](data/sources.yaml); aqui fica a lista curta:

| o quê                                                    | onde                             |
| -------------------------------------------------------- | -------------------------------- |
| PDF de horários e mapas de rede dos operadores           | `data/manual/<regiao>/`          |
| Saídas do protótipo, guardadas só para comparação        | `data/reference/<regiao>/`       |
| Dados do OpenStreetMap, sob ODbL 1.0                     | tudo o que sai dos leitores `osm-*` |
| GTFS de terceiros (CP, FlixBus, o feed arquivado do Meio) | `build/<regiao>/gtfs/`, e o que dele deriva |
| Marcas das autoridades de transportes e dos operadores   | por região, quando existirem     |

## Três licenças, e o que cada uma cobre

### O software é AGPL-3.0-only

Todo o código — o pipeline, os leitores, o sítio — e a documentação. É o que o
[`LICENSE`](LICENSE) declara.

### Os dados que saem do pipeline **não levam licença declarada**

E isto é diferente de não ter licença: é não a declararmos ainda, de propósito.

O Coreto, que é o projeto irmão, publica a compilação da sua agenda sob CC BY
4.0, e pode fazê-lo porque a compilação é obra da casa e as fontes são páginas
públicas de quem quer ser lido. Aqui a situação é outra, e pior:

- as **camadas do geoportal da autoridade de transportes**, de onde saem as
  paragens e os traçados, são um serviço público **sem licença declarada**
  (`copyrightText` vazio);
- o **GTFS da CP** e o da **FlixBus** são públicos e têm os seus próprios
  termos, que não nos autorizam a relicenciar o que deles deriva;
- o que sai dos leitores de OpenStreetMap é **obra derivada de uma base de
  dados ODbL**, e a ODbL segue-o — a atribuição «© contribuidores do
  OpenStreetMap» é obrigatória e não é negociável;
- e os PDF de horários dos operadores são de quem os publicou.

Declarar uma licença aberta sobre tudo isto seria licenciar o que não é nosso.
**A publicação dos feeds com licença aberta é a Fase 5**, e depende de a
autoridade de transportes autorizar a reutilização do que é dela — está escrito
assim no [`CLAUDE.md`](CLAUDE.md) §9 desde o primeiro dia.

Até lá, o que o pipeline produz é para uso desta instalação, cada ficheiro com
a sua proveniência ao lado, e cada saída derivada do OpenStreetMap com a
atribuição ODbL embutida.

### A marca «Paragem.pt» não é coberta por nenhuma das duas

A licença dá direitos sobre o software, não sobre a identidade com que ele se
apresenta. Uma região que entre no Paragem.pt promove a **sua** rede, com a
marca dela ao lado da assinatura do produto.

O contrário também vale, e é a razão pela qual o produto tem nome próprio: a
marca de uma rede é da autoridade de transportes que a contratou e da
concessionária que a opera, **não é nossa para licenciar a mais ninguém**. Um
produto com o nome de um cliente não se licencia ao cliente seguinte.

## Uma reserva, escrita sem eufemismo

**Este ficheiro não torna ninguém titular de coisa nenhuma.** A titularidade
nasce da criação e da lei, não de um documento no repositório. O que aqui está é
uma posição, datada e verificável por quem a queira contestar.

E fica dito o que não foi verificado: **não se confirmou se «Paragem» ou
«Paragem.pt» está registada como marca**, nem se procurou no INPI. «Paragem» é
nome comum português, o que é matéria de distintividade — e isso é de um
advogado, não deste ficheiro.

A declaração legível por máquina está em [`REUSE.toml`](REUSE.toml), e o
`uv run pipeline check-proveniencia` verifica que ela, o
[`docs/TERCEIROS.md`](docs/TERCEIROS.md) e o
[`data/sources.yaml`](data/sources.yaml) não divergem.

---

Reporta-se ao estado do repositório a 19 de setembro de 2026.
