# Tempo real: o que existe, o que se pode usar, e o que falta pedir

Os horários que este produto publica são **planeados**. Dizem a que horas o
autocarro devia passar, e é isso que a interface escreve — «Horários planeados»
com a data dos dados, como o CLAUDE.md §4.4 exige.

O que falta é o outro lado: o comboio que vem com doze minutos de atraso, a
linha que mudou, a viagem suprimida. Quem está na estação quer saber isso, e
não o que estava previsto em dezembro.

Este documento diz o que foi verificado a **21/09/2026** sobre as duas fontes
possíveis, e porque é que uma entra e a outra não.

## O resumo

| | Infraestruturas de Portugal | CP | FlixBus |
| --- | --- | --- | --- |
| Quem é | gestora da infraestrutura, **entidade pública** | operadora | operadora |
| Cobre | **todos os comboios da rede** | os comboios dela | os autocarros dela |
| Autenticação | **nenhuma** | três chaves e origem `cp.pt` | **nenhuma** |
| robots.txt | **proíbe estes endereços, por nome** | o host do GTFS é `Disallow: /` | proíbe `/track/…`, não a pesquisa |
| Pode entrar hoje | **não** — §4.3 | **não** — §4.2 | sim, com uma reserva |

As três falham por razões diferentes, e a diferença é o que decide o que
fazer a seguir. A da IP é a mais frustrante: é a melhor fonte das três,
tecnicamente aberta, e está fechada por um ficheiro de texto.

## Infraestruturas de Portugal — a melhor fonte, e fechada à chave

**Porque é que era a melhor.** A IP gere a circulação: um serviço dela vê
todos os comboios da rede, seja qual for o operador. Onde a CP cobriria os
comboios da CP, a IP cobre tudo — uma fonte em vez de uma por operadora. E
sendo entidade pública, o que publica é informação do setor público, com um
regime de reutilização por trás: pedir-lhe não é pedir um favor.

**Os endereços, que ficam escritos para ninguém repetir a pesquisa.** São no
mesmo domínio do sítio público, devolvem `application/json`, e **não pedem
autenticação nenhuma** — ao contrário do gateway da CP, não há aqui
credenciais de terceiro pelo meio:

```
GET /negocios-e-servicos/estacao-nome/{nome}
    → [{ Distancia, NodeID, Nome }]
GET /negocios-e-servicos/partidas-chegadas/{NodeID}/{DD-MM-AAAA HH:MM}/{DD-MM-AAAA HH:MM}/{tipos}
GET /negocios-e-servicos/horarios-ncombio/…          (o separador «Número do Comboio»)
```

**E porque é que não se usa.** O `robots.txt` da IP tem 36 regras `Disallow`.
Trinta e quatro são as do Drupal de fábrica — `/admin/`, `/user/login`, os
README. As **duas últimas** foram escritas de propósito por alguém, e são
exatamente os horários:

```
Disallow: /negocios-e-servicos/horarios-ncombio/*
Disallow: /negocios-e-servicos/partidas-chegada/*
```

O §4.3 não abre exceções. Não é falta de autorização — é o operador do sítio
a dizer, por escrito, que não quer acesso automático a isto.

**A letra que falta, registada em vez de aproveitada.** A regra diz
`partidas-chegada` e o endereço a sério é `partidas-chegadas`, com S. Um
leitor estrito de robots.txt diria que a regra não apanha o caminho. Seria ler
uma gralha como licença. As duas únicas regras que alguém se deu ao trabalho
de escrever naquele ficheiro são os horários; o que elas querem dizer não tem
dúvida nenhuma.

### E há uma porta da frente — que era onde se devia ter começado

O `/negocios-e-servicos/` do endereço proibido **não quer dizer «uso
comercial»**: é o caminho da secção no sítio da IP, como `/sobre-nos/`. O
`robots.txt` não distingue para que é que se usam os dados — só olha ao
agente e ao caminho —, e a regra é `User-agent: *`. Não há nela uma exceção
para serviço público, porque a linguagem não tem como a exprimir.

Mas o argumento do serviço público é bom. Só que se faz a uma PESSOA, e o
regulamento europeu já disse a que porta: o **Ponto de Acesso Nacional**.

O Regulamento Delegado (UE) 2017/1926 obriga cada Estado-Membro a ter um
sítio onde os dados de viagem — estáticos e dinâmicos — se publicam e se
pedem. Em Portugal é o do IMT, e a API dele responde:

```
GET https://nap-portugal.imt-ip.pt/API/api/MultimodalSupplies/DatasetTypeCategories?local=pt
    → 200 application/json
```

**Sem robots.txt nenhum naquele domínio** — 404, nada declarado. As tabelas de
referência estão abertas. A lista dos fornecimentos dá `401`: é preciso conta.
E a própria API tem `AccessRequest/Submit`, que é o pedido formal de acesso —
o mecanismo que o regulamento desenhou, em vez de se ir buscar por fora.

**O passo que falta é de pessoa, não de código:** registar conta como a
autoridade de transportes ou como o produto. Feito isso, listam-se os
fornecimentos ferroviários e pede-se acesso aos que interessam — e a licença
vem declarada, porque o modelo do Ponto tem campo para ela
(`ContractsOrLicences`). Entrar por aqui resolve de uma vez a pergunta que
ficou por responder nas três fontes: com que licença é que isto se reutiliza.

**O que se pede à IP, se o Ponto não bastar.** É um pedido mais forte do que o da CP: que
confirme se a proibição do `robots.txt` é para valer para uma plataforma de
informação ao passageiro de uma autoridade de transportes, ou se foi escrita
contra rastreadores genéricos; e, se for para valer, por que via é que
disponibiliza os mesmos dados para reutilização — que é a pergunta que o
regime de informação do setor público existe para responder.

## O resumo das outras duas

| | CP | FlixBus |
| --- | --- | --- |
| Endereço | `api-gateway.cp.pt/cp/services/travel-api` | `global.api.flixbus.com/search/service/v4/search` |
| Autenticação | **três chaves** e origem `cp.pt` | **nenhuma** |
| Documentada | não | não |
| robots.txt a proibir | não declara robots | proíbe `/track/…` e `/flux/`, não a pesquisa |
| Alternativa aberta | **não existe** | GTFS estático, já usado |
| Pode entrar hoje | **não** | sim, com uma reserva |

## CP — não entra, e a razão não é de gosto

O gateway exige `X-Api-Key`, `x-cp-connect-id` e `x-cp-connect-secret`, e
recusa pedidos cuja origem não seja `cp.pt`.

Circulam por aí projetos que o consultam à mesma. Fazem-no com **as chaves que
o próprio sítio da CP carrega no navegador**, tiradas do `fe-config.json` dele,
guardadas do lado do servidor e enviadas com uma origem forjada. Funciona. Não
é nosso para fazer, por três razões separadas — e basta uma:

1. **As chaves são da CP.** Estarem ao alcance de quem abre as ferramentas de
   programador não as torna públicas, do mesmo modo que uma porta destrancada
   não é um convite. O §4.2 diz «não usar APIs privadas»; esta é uma, e a
   exigência de origem é a prova de que a CP a quer fechada.
2. **O repositório vai ser público** (§11.6). Um ficheiro com estas chaves lá
   dentro publica-as — e o §11.6 lembra que tirar um ficheiro do `HEAD` não o
   tira do histórico.
3. **O destinatário é uma autoridade de transportes.** O que um painel de
   cozinha faz por sua conta e risco é uma coisa; um organismo público a
   apresentar-se como o sítio da CP é outra.

Não há caminho aberto em alternativa: procurado no `dados.gov.pt` e no Ponto de
Acesso Nacional a 21/09/2026, a CP publica o GTFS estático e **nada de tempo
real**. O único conjunto que aparece com licença aberta — «Comboios
suprimidos», CC BY — é um CSV de 2021 que nunca mais foi atualizado.

### A boa notícia: o trabalho difícil já está feito

O código de estação do gateway é **o mesmo** do GTFS público, com hífen em vez
de underscore:

```
gateway   94-32466
GTFS      94_32466     Riachos - Torres Novas - Golega
```

Não é preciso tabela de correspondência nenhuma. No dia em que houver
autorização e credenciais próprias, o que falta é o fornecedor e o proxy — não
um levantamento de identificadores.

### O que se pede, e a quem

O pedido é da **autoridade de transportes**, não nosso: é ela que tem
legitimidade para o fazer, e a CP serve o território dela. Uma carta curta
chega, e deve pedir estas cinco coisas:

1. acesso ao `travel-api` do `api-gateway.cp.pt`, **com credenciais emitidas
   para a plataforma** — nunca as do sítio;
2. os endereços que interessam: `/stations/{código}/timetable/{data}` e
   `/trains/{número}/timetable/{data}`;
3. os **limites de utilização** que a CP considera aceitáveis (pedidos por
   minuto, cache mínima);
4. autorização para **mostrar** atraso, plataforma e supressão ao público, com
   atribuição à CP;
5. a licença do GTFS estático, que hoje não é declarada em lado nenhum — e a
   posição da CP sobre o `robots.txt` do `publico.cp.pt`, que é
   `Disallow: /` para o host inteiro (ver a `robots_nota` da fonte `cp-gtfs`).

O ponto 5 resolve, de caminho, uma pergunta que já estava aberta desde a
Fase 1.

## FlixBus — pode entrar, com uma reserva escrita

Não pede autenticação nenhuma: é o mesmo endereço que o sítio deles usa, e
responde a qualquer pedido. O `robots.txt` do sítio proíbe as páginas de
seguimento (`/track/ride/`, `/track/station/`, `/track/order/`) e `/flux/`, e
**não** a pesquisa; o host da API não serve robots.txt. Pelo §4.3 não há
impedimento.

Devolve, por viagem: partida e chegada com fuso, o **nome da paragem de cada
ponta**, duração, preço já com taxa de plataforma, lugares disponíveis e se é
direto. O nome da paragem não é pormenor — «Lisboa (Oriente)» e «Lisboa (Sete
Rios)» não são o mesmo sítio para quem vai apanhar o autocarro, e o GTFS
sozinho não diz qual é.

Duas reservas, e ficam escritas:

- **Não é documentada.** Pode mudar sem aviso, e nada nos é prometido. O que
  se construir sobre ela tem de degradar em silêncio para o horário planeado,
  nunca mostrar um erro.
- **Consultar não é republicar.** Mostrar o preço de hoje a quem está a ver a
  página é uma coisa; guardá-lo e servi-lo como dado nosso é outra. Os termos
  de utilização da FlixBus quanto a isto **estão por confirmar**, e até estarem
  só se consulta em direto.

## Onde é que isto vive, quando for construído

**Não numa função da plataforma do sítio.** O `otp/proxy/nginx.conf` já explica
porquê, e vale para aqui: o sítio são ficheiros estáticos de propósito, para
que quem licencie o produto o possa alojar onde quiser. Pôr o tempo real numa
função amarrava o produto a uma plataforma com funções.

Vai para o mesmo proxy que já protege o motor de viagens — que é onde as chaves
podem estar sem irem para o repositório, e onde já existem limites de pedidos.

## O estado, numa linha

As três fontes estão **declaradas** em `data/sources.yaml` e nomeadas no
`docs/TERCEIROS.md`. A da IP está marcada `nao-usar`, que é a
marca de uma fonte que existe e não se toca. A da CP está marcada
`proibido-sem-autorizacao` e fica assim até haver resposta por escrito; a da
FlixBus está marcada `api-em-direto`, que é a marca para uma API que se
pergunta e não se descarrega.

**Das três, só a da FlixBus é consumida**, e desde 21/09/2026: a rota
`web/src/app/api/expressos/route.js` responde ao formulário de preços da página dos expressos,
um par origem→destino de cada vez, com as duas reservas acima por cima. Medido
nesse dia, para 23/09: Tomar → Lisboa (Oriente) às 09:45 por 3,98 € com 46
lugares, e Abrantes → Lisboa (Oriente) às 18:15 por 6,98 € com 25.

E repara na diferença que justifica o trabalho: o feed estático liga estas
paragens a **Lisboa (Oriente)** e não a Sete Rios — perguntar por Sete Rios
devolve lista vazia, corretamente. O nome da paragem de cada ponta vem da
resposta, e é ele que diz a quem vai a que terminal há de ir.
