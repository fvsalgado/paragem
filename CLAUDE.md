# Paragem.pt — informação de transportes de uma região, num sítio só

Este ficheiro é o briefing do produto. Lê-o inteiro antes de começar e volta a
ele sempre que tiveres dúvidas de âmbito. A interface é em **português europeu**
(nunca português do Brasil).

## 1. Objetivo

Um site mobile-first que reúna **todos os transportes que circulam no
território de uma autoridade de transportes**, seja qual for a entidade que os
gere: um planeador de viagens multimodal, páginas de paragem, linha, estação e
concelho, tarifário, transporte a pedido, bicicletas partilhadas, avisos e
dados abertos.

O princípio de desenho é **uma só porta de entrada**: quem viaja não precisa de
saber quem gere cada serviço. A navegação organiza-se por modo de transporte
(autocarros, a pedido, comboios, bicicletas, expressos, táxis). A entidade
responsável aparece como informação secundária («Gerido por …»).

O produto é **multi-região**. Uma região nova entra **sem um commit de código**
— e isso não é uma aspiração, é verificado em todas as corridas do CI.

## 2. Uma região é uma autoridade de transportes

Pela Lei n.º 52/2015 (RJSPTP) são autoridades de transportes os municípios, as
comunidades intermunicipais e as áreas metropolitanas — a citação fica **por
confirmar** antes de ir para prosa pública. O campo chama-se
`autoridade_de_transportes` e tem um `tipo`, o que permite licenciar o produto
a uma câmara sozinha.

Uma região declara **dois números, e não uma exceção**:
`municipios_membros` e `concelhos_servidos`. Não são o mesmo: há territórios
que uma concessão serve e que não são membros da autoridade que a contratou, e
o contrário também acontece. Tratar isso como caso especial no código era
garantir que a região seguinte não encaixava.

**Nunca cortar linhas na fronteira.** Há carreiras que atravessam para fora da
região, e servir meia viagem a quem a faz inteira é pior do que não a servir.
O recorte do OpenStreetMap leva margem, e o filtro dos feeds nacionais fica-se
pela *viagem* e não pelo troço.

## 3. Modos a cobrir

| Modo | O que é | Fonte típica |
|---|---|---|
| Autocarro regular e urbano | A rede da concessão da autoridade de transportes | GTFS, quando existe; PDF de horários quando não |
| A pedido | Circuitos com reserva prévia | Sítio público de reservas, ou brochuras |
| Comboio | O operador ferroviário nacional | GTFS público |
| Urbano municipal | Redes das câmaras, à margem da concessão | Cartazes das câmaras + OpenStreetMap |
| Bicicleta partilhada | Sistemas municipais ou intermunicipais | OpenStreetMap (localização) + sítio do sistema |
| Expresso | Operadores privados | GTFS público onde exista |
| Táxi | Praças por concelho | OpenStreetMap + câmaras |

Nem toda a região tem todos. **Um modo ausente não desenha secção nenhuma** —
uma secção vazia à espera de dados que não vêm é pior do que secção nenhuma, e
a região de prova existe em parte para verificar isso.

## 4. Regras não negociáveis

1. **Só dados públicos e abertos.** Cada conjunto de dados fica registado em
   `data/sources.yaml` com URL, data de obtenção, licença e atribuição exigida.
   OpenStreetMap: atribuição ODbL obrigatória, **embutida no próprio ficheiro**.
2. **Nada de fornecedores privados de dados.** Sem APIs privadas (Google,
   Moovit e afins). Um ficheiro arquivado publicamente pode servir de base,
   mesmo que tenha sido produzido por um privado para uma operadora — o que
   conta é estar público, e a licença dele fica declarada como o que for.
3. **Não fazer scraping de sítios que o proíbem.** Há sítios de autoridades de
   transportes e de operadoras que bloqueiam no `robots.txt`, e sistemas de
   reserva que só se automatizam com autorização escrita. Esses ficheiros
   entram à mão em `data/manual/<regiao>/`, com a data e a origem anotadas. A
   regra está **executável** em `pipeline/src/paragem/fontes.py`: uma fonte
   marcada `manual` ou `proibido-sem-autorizacao` levanta exceção se alguém a
   tentar descarregar.
4. **Nunca inventar dados.** O que falta fica explícito: marcas visíveis na
   interface («[destino a confirmar]», «Horários planeados» com a data dos
   dados) e uma entrada no relatório de lacunas. Quando há uma leitura
   defensável mas não uma certeza, declara-se `por_confirmar:` na receita e a
   pergunta sai no relatório — em vez de ficar num comentário que ninguém lê.
5. **Acessibilidade WCAG 2.1 AA** (DL 83/2018): HTML semântico,
   `<button>`/`<a>`/`<label>` reais, contraste ≥ 4,5:1, alvos táteis ≥ 44 px,
   foco visível, `aria-label` em botões só com ícone. Página de declaração de
   acessibilidade.
6. **Reprodutibilidade.** Todo o processamento corre com um comando, a partir
   das fontes e dos ficheiros manuais. Nada de passos à mão fora do pipeline.
7. **O domínio é de quem licencia.** Não o fixar no código; usar variáveis de
   ambiente.

## 5. Arquitetura

```
paragem/
  CLAUDE.md
  data/
    sources.yaml        # o registo de proveniência DESTA raiz
    manual/<regiao>/    # PDF, YAML e CSV introduzidos à mão
    reference/<regiao>/ # números de referência, só para comparação
  regioes/<id>/         # a declaração de uma região e a receita de construção
  pipeline/             # Python (uv): fetch, build, validate, report
  build/                # gerado, fora do git
  otp/                  # OpenTripPlanner 2 em Docker
  disponibilidade/      # a função que lê a disponibilidade de bicicletas
  web/                  # Next.js (App Router)
  .github/workflows/
```

- **Dados:** comando único `uv run pipeline build` que descarrega, processa,
  valida e escreve relatórios em `build/reports/`. O CI falha se o validador
  de GTFS der erros.
- **Motor de viagens:** OpenTripPlanner 2, num contentor próprio. O planeador
  do navegador funciona **sem ele** — sai da grelha horária, e os transbordos a
  pé saem em linha reta em vez de saírem das ruas. Quem licencie isto pode
  alojar ficheiros e mais nada.
- **Site:** Next.js, estático. As páginas de paragem, linha, estação e concelho
  são geradas a partir dos feeds: funcionam com o motor em baixo, e são
  indexáveis.
- **Mapa:** MapLibre GL com mosaicos vetoriais PMTiles gerados do mesmo
  OpenStreetMap e alojados por nós — sem serviços de mapas privados.

### 5.1 Uma região pode viver noutra raiz

O código é público; a compilação de dados de um cliente quase sempre não é. A
variável `PARAGEM_RAIZES` aponta raízes de fora, separadas por `:` como o
`PATH`, e cada uma tem a forma desta. Os pormenores estão em
[`docs/RAIZES.md`](docs/RAIZES.md) e é lá que se vai quando se precisa deles.

O que isto impõe, e que vale a pena ter na cabeça:

- **o `data/sources.yaml` é a soma** dos de todas as raízes, e uma fonte
  declarada em duas rebenta em vez de uma ganhar em silêncio;
- **a documentação viaja com os dados** — cada raiz tem o seu
  `docs/TERCEIROS.md`, o seu `REUSE.toml`, o seu `data/manual/<id>/LEIA.md`;
- **um caminho declarado numa receita resolve-se na raiz da região**, não nesta;
- **os testes não nomeiam as fontes de um cliente.** Procuram a fonte *pela
  propriedade* que estão a testar, e saltam com a razão escrita quando a região
  não está nesta raiz.

### 5.2 As duas regiões de prova

`regioes/prova/` (a **Serra da Pedra Alta**) e `regioes/prova-municipio/` (o
**Baixo Sável**) são inventadas de fio a pavio e constroem-se sem rede. Fazem
três coisas ao mesmo tempo: são a demonstração pública do produto sem pedir uma
linha a ninguém, são a prova executável de que uma região nova entra sem um
commit de código, e são o par que permite verificar o multi-região **sem dados
de ninguém**.

São duas de propósito, e diferentes de propósito:

- **artigos diferentes** — «a» Serra e «o» Baixo Sável. Com dois no CI, nenhuma
  contração fica cravada no código;
- **tipos diferentes de autoridade** — uma CIM e um **município**. O produto
  licencia-se a uma câmara sozinha, e isso tem de estar provado;
- **caixas disjuntas**, para que uma coordenada trocada entre regiões falhe em
  vez de cair nas duas;
- a Serra tem quatro modos, o Sável tem um. A ausência é a prova.

### 5.3 O sítio deixa de ser exportação estática; uma região por domínio; um painel

Decidido a 22/09/2026, depois de se ler o Coreto de ponta a ponta.

O sítio saía com `output: 'export'`, construído no CI e enviado pronto.
Aguenta uma região e não aguenta a segunda: uma região a sério são mais de dez
mil ficheiros num envio, quase todos páginas de paragem, e as línguas do §6
multiplicam isso. E um painel que liga e desliga regiões e módulos não pode
esperar por uma reconstrução.

A arquitetura passa a ser a do Coreto:

- **Revalidação a pedido, não exportação estática.** As páginas continuam a
  ser servidas da cache como ficheiros — `revalidate` e `unstable_cache` com
  etiquetas por região — e invalidam-se por sinal.
- **Uma região por domínio.** Um middleware lê o `Host`, pergunta a um mapa
  qual é a região, e reescreve para `/<regiao>/…` por dentro. Host
  desconhecido → página do produto, nunca a região de outro cliente. Alias →
  308.
- **O subdomínio é declarado, não adivinhado** — `dominio:` no `regiao.yaml`
  da região. A base guarda uma cópia e o CI confere.
- **O conteúdo continua a ser construído pelo pipeline.** Não há horários em
  Postgres. O pipeline sobe `build/<regiao>/sitio/` para o Storage e avisa o
  sítio; o sítio publica separado dos dados.
- **A base guarda só o que o painel governa** — regiões, alias, módulos
  desligados, licenças, auditoria (`docs/BASE-DE-DADOS.md`). As migrações
  semeiam só as regiões de prova; uma região real nasce no painel. Nenhuma
  escrita toca nas tabelas: funções SQL com rasto.
- **Um módulo é um modo.** Desligar um módulo é desligar `comboio`,
  `expresso`, o que for; que fonte alimenta cada modo é da receita da região.

Por esta ordem, um PR de cada vez: (0) a base, provada num Postgres real;
(1) sair da exportação estática; (2) uma região por domínio; (3) o painel;
(4) os módulos a fazerem efeito.

## 6. Design

- Tipografia: **Atkinson Hyperlegible** (Google Fonts), fallback
  `'Segoe UI', system-ui, sans-serif`.
- Cores:
  - fundo `#F5F7F4`, texto `#102C3F`, texto secundário `#4A5C66`;
  - linhas `#D5DDD9`, borda de campos `#6F858F`;
  - marca / autocarros da rede `#0A5C7A` (hover `#063F54`);
  - a pedido `#8A5300` sobre `#FBF1E1`;
  - bicicletas `#2D6A3E` sobre `#E6F0E9`;
  - comboio `#3F4852`;
  - urbanos municipais `#5B3A8E`;
  - alerta `#A3261B` sobre `#FBE9E6`;
  - foco `#F2B705` (contorno de 3 px);
  - linhas da rede: usar `route_color` do GTFS, garantindo contraste.
- Expressos e táxis (serviços privados) usam cartões neutros — borda, sem cor
  de modo.
- Estrutura da página inicial (telemóvel): «Para onde vais?»; faixa de avisos;
  «Perto de ti»; bloco do transporte a pedido; grelha dos modos; «Que título me
  serve?»; concelhos; rodapé.
- Resultados de viagem: cartões por opção com linha do tempo colorida por modo.
  As opções a pedido mostram a regra de reserva e os botões de reservar.
- Línguas: PT primeiro; estrutura pronta para EN, ES e FR.
- **Evitar:** emojis, gradientes decorativos, rótulos em maiúsculas, cartões
  todos iguais com sombra.

## 7. Licenciamento

AGPL-3.0-only. `LICENSE`, `AUTORIA.md`, `REUSE.toml`, `CONTRIBUTING.md` com
cláusula de entrada, `SECURITY.md` e `docs/TERCEIROS.md`.

**Os feeds construídos não levam licença declarada.** Há fontes que não
declaram licença nenhuma, outras com termos por confirmar, e o que deriva do
OpenStreetMap é ODbL com atribuição obrigatória. Publicá-los com licença aberta
depende de a autoridade de transportes autorizar a reutilização.

**«Paragem.pt» é o nome do produto e não é coberto pela licença do código.**

Uma consequência executável: **nada fora de `regioes/<id>/` e de
`data/manual/<id>/` pode dizer o nome de uma região ou de uma rede.** O
`uv run pipeline check-regioes` varre as saídas de cada região à procura dos
nomes das outras.

## 8. Como trabalhar

- Antes de cada fase, propõe um plano curto e espera confirmação.
- Commits pequenos e descritivos. Não fazer push para `main` sem pedir.
- Quando uma fonte falhar ou mudar, **regista-o no relatório de lacunas** em
  vez de contornar com dados inventados.
- Se precisares de um ficheiro que só se obtém à mão, diz exatamente **qual, de
  onde e para que pasta**.
- **Número exato onde a fonte está congelada, invariante onde a fonte está
  viva.** Um PDF publicado não muda: afirma-se a contagem exata. O
  OpenStreetMap muda todos os dias: afirma-se o que tem de ser verdade sempre.
  Um número cravado sobre uma fonte viva é um teste que parte sozinho daqui a
  uma semana, num sítio onde partir bloqueia a publicação.

## 9. Fases

**Fase 0 — Repositório.** A estrutura acima, `sources.yaml` preenchido, CI com
lint e testes.

**Fase 1 — Dados.** `pipeline build` produz os feeds da região, o recorte do
OpenStreetMap, o GBFS estático dos sistemas de bicicletas, o GeoJSON dos táxis
e dos urbanos municipais, e um relatório de lacunas. Zero erros no validador de
GTFS. Testes unitários dos leitores.

**Fase 2 — Motor.** OTP local com `docker compose up`, e as viagens de prova
que a região declara a devolver itinerários plausíveis.

**Fase 3 — Site mínimo.** Início, planeador, paragem, linha, estação, concelho,
tarifário, avisos, dados abertos, acessibilidade. Testes de acessibilidade
(axe) sem violações graves; Lighthouse ≥ 95 em telemóvel.

**Fase 4 — A pedido e municipais.** GTFS-Flex do transporte a pedido — primeiro
por introdução manual assistida, e só automatizado com autorização escrita.
GTFS dos urbanos municipais a partir dos dados das câmaras. Táxis por concelho.
Gestão de avisos com GTFS-RT Alerts.

**Fase 5 — Abertura.** Publicação dos feeds com licença aberta, depois de a
autoridade de transportes autorizar. Widget para as câmaras.
