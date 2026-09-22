# Arquitetura

Este documento descreve o que existe e porquê. Não é um plano — o plano está em
[`CLAUDE.md`](../CLAUDE.md) §9. É o estado do código, com as razões das escolhas
menos óbvias. Se alguma delas parecer uma limpeza por fazer, lê o parágrafo
respetivo antes de a fazer.

## Onde vive o quê

| pasta | responsabilidade |
| --- | --- |
| `regioes/<id>/` | o que uma região **é**: território, modos, tarifário, calendário, e a receita do que constrói |
| `data/sources.yaml` | de onde vêm os dados, sob que licença, com que atribuição |
| `data/manual/<regiao>/` | o que não se descarrega — PDF, exportações, correções |
| `data/reference/<regiao>/` | saídas do protótipo, só para comparar |
| `pipeline/src/paragem/` | o código: leitores, calendário, GTFS, relatório, verificações |
| `build/<regiao>/` | tudo o que sai. Fora do Git |
| `otp/`, `web/` | Fases 2 e 3 |

## As três ideias

### Uma região é uma declaração, não código

Uma região é uma **autoridade de transportes** e o território que ela serve.
Tudo o que a distingue de outra está em ficheiros; nada disso está em Python.

Uma região **não é necessariamente uma CIM**. Pela Lei n.º 52/2015 são
autoridades de transportes os municípios, as comunidades intermunicipais e as
áreas metropolitanas — daí o campo se chamar `autoridade_de_transportes` e ter
um `tipo`, e daí o produto poder ser contratado por uma câmara sozinha.

Três coisas que a declaração carrega e que se é tentado a deduzir:

- **o artigo.** «**a** Serra da Pedra Alta», «**o** Baixo Sável». A prosa
  inteira pendura das contrações, e nenhuma heurística acerta nos topónimos
  portugueses. A região declara-o e o resto deriva.
- **membros ≠ servidos.** Uma comunidade intermunicipal tem os seus
  municípios; a área que a concessão dela serve pode não ser a mesma — há
  concelhos que mudam de comunidade e continuam servidos pela concessão
  anterior até ela acabar. São dois campos, não uma exceção no código:
  qualquer autoridade de transportes tem esta distinção mais cedo ou mais
  tarde, e tratá-la como caso especial garantia que a região seguinte não
  encaixava.
- **a caixa geográfica.** É um *parâmetro* de processamento, não um dado sobre
  o mundo: serve para recortar o OSM e para decidir que viagens de um feed
  nacional servem a região. O `_verificar()` de `regiao.py` recusa uma região
  cuja lista de concelhos não bata com a contagem declarada — «onze municípios»
  impresso ao lado de dez linhas é uma mentira por omissão.

### Um leitor é um plugin por formato, nunca um fork por região

A região diz o que tem; o leitor não sabe onde está. Um feed GTFS de outra
operadora entra pelo `gtfs-arquivo`; um feed nacional pelo `gtfs-filtrado`; o
OpenStreetMap pelos `osm-*`.

Numa fonte nova experimenta-se por esta ordem: um leitor genérico existente, um
leitor genérico novo, e só depois um leitor específico daquela fonte. Hoje há
**um** específico — o `horarios-pdf-operadora` — e a lista
`ESPECIFICOS_DA_FONTE` existe para ser contada: o dia em que tiver seis é o dia
em que o produto deixou de ser genérico sem ninguém ter decidido isso.

### Nada entra sem proveniência, e a regra é executável

O CLAUDE.md §4.3 diz que certos sítios não se raspam. Uma regra dessas escrita
só em prosa quebra-se por distração, numa refatoração, por alguém que nunca leu
a prosa.

Aqui, `data/sources.yaml` dá a cada fonte um `acesso`, e
`Registo.caminho()` **levanta uma exceção** quando alguém tenta descarregar uma
fonte marcada `manual`, `nao-usar` ou `proibido-sem-autorizacao` — com a razão
escrita na mensagem. O caminho para dentro do pipeline passa todo por ali.

---

## Invariantes

### Nunca inventar dados, e o relatório é o que o torna possível

É a regra que mais vezes se é tentado a quebrar, e sempre com boa intenção: uma
coordenada estimada a olho para uma paragem não ficar de fora, uma hora
interpolada para um horário não ter buracos.

Sem um sítio onde pôr o que falta, a única alternativa a inventar seria o
silêncio — e o silêncio parece-se com completude. O relatório de lacunas é esse
sítio, e cada lacuna leva quatro coisas: **o que falta**, **onde**, **porque
importa** e **o que fazer**. As três primeiras são a honestidade; a quarta é o
que distingue um relatório de uma queixa.

Três graus, e são diferentes: `bloqueia` não produz feed (zero erros do
validador é obrigatório); `lacuna` produz um feed incompleto e diz onde; `aviso`
é para olhar.

Onde o pipeline *tem* de estimar — a interpolação das horas entre dois pontos de
horário é uma estimativa, e necessária — isso fica marcado no que sai.

### A disponibilidade de bicicletas não se promete

O GBFS que sai tem `system_information` e `station_information` e **não tem
`station_status`**. A disponibilidade em cada doca não é pública e não a temos.
Um `station_status` derivado da capacidade estática manda alguém a pé até uma
doca vazia. O ficheiro de descoberta anuncia só o que existe: anunciar um feed e
servir 404 é pior do que não o anunciar.

### O filtro de rotas é pelo operador, nunca pela rede

`network=TUT` é dos urbanos de Torres Novas **e** dos de Torres Vedras, que
ficam a 130 km. Um filtro por rede traz autocarros de outra terra para dentro da
região, com nomes plausíveis, e ninguém dá por isso. A receita da região pode
declarar `nunca_filtrar_por: network`, e o leitor **recusa-se** a correr se o
filtro o usar.

A região de prova tem esta armadilha em miniatura: duas relações com a mesma
rede e operadores diferentes, e o CI verifica que só uma passa.

### O calendário gera-se de regras, e uma regra que falta não se adivinha

Há quem projete datas — o dia D usa o serviço de D−364 do ano passado, e
pronto. Funciona até deixar de funcionar: um feriado que caia noutro dia da
semana produz horários errados **sem dar erro nenhum**.

O gerador resolve um código (`E-U`, `A-2356`) em datas por regras declaradas. E
quando lhe falta uma regra — o ano letivo por transcrever, a leitura de `DFXN`
por confirmar — devolve **zero datas e a razão**, em vez de arriscar. A forma de
«DFXN» sugere exclusão, mas sugerir não é saber, e um serviço projetado para o
dia errado é pior do que um serviço em falta.

### Duas corridas sobre os mesmos dados produzem o mesmo ficheiro

Os zips saem com timestamp fixo e ordem de colunas estável. Sem isso, não se
consegue dizer se uma diferença entre dois feeds veio dos dados ou da máquina —
e a primeira pergunta a fazer a um feed que mudou é exatamente essa.

---

## O caminho do papel ao GTFS

Os horários em vigor de uma rede regional existem, muitas vezes, num PDF de
centenas de páginas e em mais lado nenhum. O caminho do papel ao GTFS
reparte-se por módulos que se testam sozinhos:

| ficheiro | o que faz |
| --- | --- |
| `leitores/pdf_horarios.py` | lê o papel: páginas, blocos, colunas, paragens |
| `nomes.py` | compara nomes escritos por mãos diferentes |
| `leitores/camadas_geojson.py` | normaliza as camadas de um portal de dados |
| `paragens.py` | o universo: tudo o que pode ser a paragem que o papel nomeia |
| `alinhamento.py` | que viagem do levantamento é esta viagem do papel |
| `resolucao.py` | que paragem é cada nome, por regras e por decisão manual |
| `intermedias.py` | as paragens que o papel não escreve |
| `tracados.py` | por onde o autocarro passa entre elas |
| `leitores/horarios_pdf_operadora.py` | escreve o GTFS |

E o transporte a pedido segue o mesmo caminho até outro feed, porque é outro
serviço: a hora de um circuito a pedido não é uma promessa — é a hora a que
passa *se* alguém tiver reservado. Escreve-se em **GTFS-Flex**, onde cada
passagem aponta para uma regra de reserva.

| ficheiro | o que faz |
| --- | --- |
| `flex.py` | que circuito é cada quadro, que paragem é cada nome, em que dias anda |
| `leitores/a_pedido_flex.py` | escreve o GTFS-Flex, com `booking_rules.txt` |

### As colunas medem-se, não se contam

Uma linha de paragem pode ter menos células do que o bloco tem colunas, e nem
todas as ausências se escrevem «-»: há células em branco. Contar tokens da
esquerda para a direita desalinha o horário todo a partir do primeiro buraco, e
**um horário desalinhado é um horário errado que parece certo**.

Cada célula é mapeada à coluna pelo **centro em x** — o centro, e não o início,
porque «13:45» ocupa cinco colunas de carateres e «-» ocupa uma, e o PDF centra
as duas na mesma coluna. A âncora é o primeiro registo que tenha as colunas
todas preenchidas.

### A legenda do PDF é normativa, e desmentiu três palpites

O PDF traz linhas como `A-DFXN | Anual - Domingos e Feriados (exceto 25
Dezembro e 1 Janeiro) | …`. O parser lê-as e o pipeline **exige** que o
`calendario.yaml` diga o mesmo; um código sem regra declarada é uma lacuna que
bloqueia.

Isto não é cerimónia. Antes de se ler a legenda havia três hipóteses escritas,
e as três estavam erradas:

- `DFXN` era «exceto Natal» — e exclui também o 1 de janeiro;
- `SFXD` era «domingos» — e são **sábados** (a própria tradução inglesa do PDF
  diz «Sundays», e engana);
- `TD` era «todos os dias» — e é **domingos, incluindo se feriado**. Lido como
  «todos os dias», punha autocarros a circular seis dias por semana que não
  circulam.

Uma em três teria passado por acaso. É por isso que a regra de não adivinhar
não é escrúpulo.

### O que se recusa a inventar

A viagem herda a sequência completa de paragens do levantamento que ela
alinhou, e as horas das intermédias saem proporcionais ao **tempo** desse
levantamento — não à distância nem a partes iguais, porque uma viagem não anda
a velocidade constante e as horas do levantamento já sabem onde é que ela
abranda. Vão para o feed com `timepoint=0`, que no GTFS quer dizer «esta hora
é aproximada», e a interface marca-as.

Três travões, e cada um foi posto por um defeito concreto:

1. **Um alinhamento fraco não herda nada.** Um percurso incompleto e
   verdadeiro vale mais do que um percurso completo emprestado à viagem
   errada.
2. **Os tempos têm de bater certo.** Se o papel demora dez minutos entre duas
   paragens e o levantamento demora quarenta, não estamos a falar do mesmo
   percurso: o segmento fica sem intermédias, com o motivo escrito.
3. **Nada de segmentos enormes.** Mais de 25 pontos entre duas paragens do
   papel quer dizer que os extremos foram localizados no sítio errado.

Os 148 avisos `fast_travel` da primeira construção ficaram em **zero**. E uma
hora interpolada sai marcada com `timepoint=0`: estimar não é fingir, e o GTFS
tem um campo para dizer a diferença.

## A verificação é de fora

O validador que conta é o da MobilityData, que é o que o resto do mundo usa.
Reimplementá-lo em Python era ter duas opiniões e não saber qual está
desatualizada. Um erro dele entra no relatório como lacuna que **bloqueia**.

E **não o correr nunca é silêncio**: sem jar, sem Java ou sem rede, fica um
aviso a dizer que a verificação não se fez. Um relatório sem erros porque
ninguém verificou parece exatamente igual a um relatório sem erros porque está
tudo bem.

**No CI, um aviso não chega.** O `--exigir-validador` transforma «não correu»
em bloqueio, e existe por um caso real: na primeira corrida o endereço do jar
estava errado, a descarga deu 404, e a corrida ficou **verde** — com o
critério de aceitação da Fase 1 por verificar e uma única linha no meio do
registo a dizê-lo. Uma corrida verde em que a verificação que interessa não
aconteceu é pior do que uma vermelha.

O endereço tem uma armadilha que vale a pena não voltar a apanhar: a **etiqueta
leva `v`** (`/download/v8.0.1/`) e o **nome do ficheiro não**
(`gtfs-validator-8.0.1-cli.jar`). O README do projeto diz que o ficheiro «looks
like `gtfs-validator-vX.X.X-cli.jar`», e está errado — a workflow de publicação
deles usa `version-without-v`.

### Os avisos de um feed de terceiro são dele

Os 275 avisos do feed da CP e os 5095 do da FlixBus não são nossos: nós não
lhes tocamos, e reescrever o feed de outra operadora fazia com que ninguém
conseguisse dizer se uma diferença veio dela ou de nós. Entram no relatório
como **avisos**, não como lacunas — uma lista de lacunas em que a maioria não é
para fazer nada deixa de se ler, e enterra as que são.

**Os erros continuam a bloquear em qualquer caso**, e às vezes a culpa é nossa
mesmo num feed de terceiro: as 415 referências penduradas do feed da FlixBus
vieram do nosso filtro, que limpava as paragens e esquecia que um
`transfers.txt` também refere rotas e viagens.

### Bloqueios conhecidos

Uma construção com bloqueios sai com código ≠ 0 — é assim que o CI reprova um
feed inutilizável. Mas um CI permanentemente vermelho deixa de ser um sinal: ao
fim de duas semanas ninguém olha.

`data/reference/<regiao>/bloqueios-conhecidos.yaml` é a diferença entre as duas
coisas. Um bloqueio que lá está é conhecido e aceite, com a razão e o que o
resolve. Um bloqueio que **não** está lá reprova — e um que lá está e já não
acontece também, senão a lista envelhece a proteger o que já não existe.

## A cadeia de fornecimento

O `SECURITY.md` promete que uma soma de verificação diferente é um aviso e não
um silêncio. São duas verificações, e a diferença entre elas é deliberada:

- **soma declarada** — nos ficheiros que **não devem mudar sozinhos**: os PDF
  que entram à mão e os de referência. Uma diferença é uma lacuna: ou alguém os
  substituiu, ou a origem republicou outra coisa com o mesmo nome.
- **soma observada** — nos automáticos. A CP, a FlixBus e o OpenStreetMap
  republicam legitimamente todas as semanas; uma soma fixa ali só faria o
  pipeline reprovar por o mundo ter andado. Compara-se com a da última corrida
  e conta-se a mudança, para que uma diferença nas saídas se possa explicar por
  uma diferença nas entradas.

**O `sha256` vai entre aspas no YAML**, e o carregador converte-o para texto e
verifica que tem 64 carateres hexadecimais. Sem isso, uma soma composta só por
dígitos é lida como número — e uma que seja toda zeros passa a ser *falsa*, o
que faz um `if fonte.sha256` saltá-la sem dizer nada. Não é hipotético: foi
exatamente o que este guarda fazia até o teste dele o apanhar a não guardar
nada. Uma soma malformada é agora uma lacuna com nome próprio, porque parece
proteção e não protege.

## O que falta entra por um ficheiro, não por código

Os nomes que o papel escreve e que nenhum levantamento situa não se inventam.
A porta por onde a decisão entra é `data/manual/<regiao>/decisoes/`, declarada
na receita: uma entrada por par (linha × nome), com a paragem escolhida, o
método e a razão. `sem` é uma decisão como as outras — deixa o par sem
coordenada e fora das viagens, em vez de o aproximar de uma paragem parecida.

As decisões, todas, saem em `build/<regiao>/decisoes/`: `paragens.csv` (o que
foi decidido e por que regra), `viagens.csv`, `segmentos.csv` (porque é que um
segmento não herdou intermédias) e `tracados.csv`. Saem como ficheiros e não
só como parágrafos do relatório porque são para ser conferidos, um a um, por
quem conhece o território.

## Dependências de sistema

Duas, e ambas por boas razões:

- **`poppler-utils`** (`pdftotext`), para o parser de horários. **A versão está
  fixada**: a saída de `pdftotext -layout` muda entre versões do poppler, e é
  contra ela que os números do §6 são verificados. Uma atualização silenciosa do
  poppler mudava as contagens sem que nada no repositório tivesse mudado.
- **`osmium-tool`** (`osmium extract`), para o recorte do OSM. Um recorte tem de
  ficar referencialmente completo — cada via com os seus nós, cada relação com
  os seus membros — e reimplementar isso em Python era reescrever uma ferramenta
  madura para a ter meio feita.
- **Java 17** e o **gtfs-validator da MobilityData**, com a versão fixada
  (`8.0.1`) pela mesma razão do poppler: as regras mudam entre versões, e um
  validador que se atualiza sozinho faz o CI mudar de opinião sem que nada no
  repositório tenha mudado.

O resto é Python, instalado pelo `uv`.

Os leitores de pontos do OSM leem o **recorte da região** e não o extrato
nacional, quando ele já existe — varrer 475 MB quatro vezes para tirar 68
estações de bicicletas demora minutos e não acrescenta nada. E filtram pela
caixa da **área de serviço**, não pela do recorte: o recorte leva margem de
propósito, para não cortar linhas na fronteira, mas uma praça de táxis a 30 km
não é da região.
