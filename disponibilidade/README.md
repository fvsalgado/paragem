<!--
SPDX-FileCopyrightText: 2026 Fábio Salgado <fvsalgado@gmail.com>
SPDX-License-Identifier: AGPL-3.0-only
-->

# O que é ao vivo

Duas leituras que um sítio estático não consegue fazer sozinho, num serviço só.

**As bicicletas.** Lê a página que um sistema de bicicletas publica — onde o
estado de cada estação (bicicletas e docas) vem escrito no HTML pelo servidor —
e devolve-a como GBFS `station_status`, **com a hora a que a leu**.

**Os expressos.** Pergunta ao operador, por um par origem→destino de cada vez,
que viagens há hoje, quanto custam e se ainda há lugar. Ver
[a secção própria](#os-expressos-preços-e-lugares) mais abaixo.

**Cada uma é opcional, e basta uma.** Há regiões com bicicletas e nenhum
expresso, e o contrário. O serviço arranca com qualquer das duas configurada e
responde `501` no caminho da que faltar — exigir as duas obrigava a inventar um
endereço para a que não existe, e um endereço inventado é uma leitura errada à
espera de acontecer.

## Porque é que não faz parte do sítio

O sítio é estático de propósito (CLAUDE.md §7): sai da construção como
ficheiros, para uma autoridade de transportes o poder alojar onde quiser. Um
ficheiro parado não consegue ir buscar as contagens no momento em que alguém
abre a página, e um número de há uma semana é pior do que número nenhum. Por
isso a leitura é feita aqui, à parte — como o planeador fala com o motor de
viagens, do lado do cliente.

## Duas maneiras de o pôr a correr

O trabalho está todo no **`nucleo.mjs`**. Por cima dele há dois invólucros
finos, e a escolha entre eles é só de alojamento — dão a mesma resposta, e é
para isso que o núcleo tem testes próprios.

### A. Como rota do próprio sítio

Não é preciso servidor, nem Docker, nem um segundo projeto. A rota é
`web/src/app/api/station_status/route.js`: um invólucro fino sobre o
`nucleo.mjs`, que importa daqui pelo caminho relativo. A Vercel constrói o
sítio a partir do Git e serve a rota como função — não há nada a copiar.

Viveu na raiz, em `api/`, enquanto o sítio era exportação estática e não podia
ter rotas dentro; o fluxo copiava-a para dentro do que se publicava, e um dia
uma função ficou escrita, testada e a dar 404 em produção porque ninguém a
tinha acrescentado à cópia. Entrou para dentro do Next quando o sítio deixou
de ser estático (CLAUDE.md §11.7), e a cópia deixou de existir.

O que falta são **duas variáveis, no mesmo sítio** — o painel da Vercel —,
porque é lá que o sítio se constrói e corre:

| chave | valor | quando é lida |
| --- | --- | --- |
| `PARAGEM_PAINEL_URL` | a página de estações do sistema | quando alguém pede, já em produção |
| `NEXT_PUBLIC_PARAGEM_DISPONIBILIDADE_<REGIAO>` | `/api/station_status/` | na construção — o Next crava os `NEXT_PUBLIC_*` no JavaScript |

**E repara no valor: um caminho, não um domínio.** A rota é servida pelo
mesmo deployment que o sítio, por isso `/api/station_status/` chega — e é
melhor do que um domínio, porque o endereço das pré-visualizações muda a cada
publicação. Sendo a mesma origem, não há CORS nenhum pelo meio: por isso
`PARAGEM_ORIGEM` **não é preciso** aqui. A barra no fim também não é enfeite:
o sítio redireciona `/api/station_status` para `/api/station_status/`, e
escrevê-la poupa a viagem.

Publicado, abrir `<o-sítio>/api/station_status/` deve dar JSON com as estações.

Os testes da rota estão aqui ao lado (`funcao.test.mjs`): um só `node --test`
cobre os dois invólucros, porque o que se testa é o mesmo núcleo.

### B. Como contentor, numa máquina qualquer

Serve quem licencie o produto e não queira depender de uma plataforma com
funções — e serve bem ao lado do motor de viagens, que precisa de máquina de
qualquer maneira.

```sh
PARAGEM_PAINEL_URL=https://…/mapa-rede/ \
PARAGEM_ORIGEM=https://o-dominio-do-sitio \
  docker compose -f disponibilidade/docker-compose.yml up
```

Responde em `/station_status.json`, `/gbfs.json` e `/saude`.

## O que faz, e o que não faz

- **Não inventa.** Uma contagem que não conseguiu ler fica de fora, e o sítio
  mostra a estação sem número em vez de um palpite. Um zero, esse, é um zero —
  «não há bicicletas aqui agora» poupa a caminhada.
- **Não promete frescura que não tem.** A página não carimba a hora; a que vai
  no feed é a da LEITURA. O sítio mostra-a («há 40 s») e deixa de mostrar o
  número quando envelhece.
- **Não esconde que a fonte pode falhar.** As contagens são do operador, e há
  quem chegue à estação e não encontre a bicicleta que a página contava. O
  sítio di-lo a quem lê.
- **É gentil com a fonte.** Guarda a leitura `PARAGEM_CACHE_S` segundos (60 por
  omissão) e só lê a pedido: cem visitantes no mesmo minuto são uma leitura, e
  zero quando ninguém está a ver. Na Vercel quem guarda é a rede da
  plataforma (`s-maxage`); no contentor é o processo.
- **A fonte em baixo não o derruba.** Enquanto houver uma leitura boa, é essa
  que serve, com a hora dela — e é o navegador que decide se ainda vale.

## Agnóstico à marca

Nem o código nem o `compose` nem a função dizem o nome de nenhum sistema ou
região (CLAUDE.md §11.1): o endereço da página é um **valor**, que entra pelo
ambiente. O analisador conhece uma FORMA — o cartão que o tema deste
fornecedor gera — como o leitor de cartazes conhece a forma de um horário
afixado, e não uma câmara em particular.

## Variáveis

| variável | para quê |
| --- | --- |
| `PARAGEM_PAINEL_URL` | a página de estações a ler (**obrigatória**) |
| `PARAGEM_ORIGEM` | o domínio que pode chamar o serviço de FORA. Sem ela não vai cabeçalho de CORS nenhum e só a mesma origem lê — que é o mais fechado, e o que serve quando a função é servida ao lado do sítio. Nunca `*` |
| `PARAGEM_EXCLUIR` | sistemas a deixar de fora, por vírgula, quando a página lista mais do que um |
| `PARAGEM_CACHE_S` | segundos entre leituras da página (60 por omissão) |
| `PARAGEM_PORTA` | só no contentor: a porta do serviço (8080 por omissão) |

## Testes

```sh
cd disponibilidade && node --test
```

Não vão à rede: o analisador corre contra um excerto fiel em `fixtures/`, e o
núcleo contra um `fetch` de mentira. Se o fornecedor mudar a forma do cartão,
é aqui que se dá por isso — e não numa página em produção a mostrar contagens
em branco. Correm no CI, no fluxo do sítio.


## Os expressos: preços e lugares

O horário que o sítio publica é **planeado**: sai do GTFS e diz a que horas o
autocarro devia partir. Para um expresso isso não chega — quem vai daqui a uma
cidade grande quer saber quanto custa amanhã e se ainda há lugar, e nenhuma das
duas coisas está num GTFS.

### As três regras

**Consultar não é republicar.** A resposta é atravessada e entregue a quem
perguntou. Não se guarda, não se serve como dado nosso, não entra em feed
nenhum. A cache é curta e existe para ser gentil com a fonte — cem pessoas no
mesmo minuto fazem uma pergunta, não cem —, não para acumular preços. Os termos
de reutilização do operador estão por confirmar (`data/sources.yaml`), e até
estarem é assim que fica.

**A pedido, um par de cada vez.** O feed conhece dezenas de destinos por
paragem. Perguntar todos ao abrir uma página era martelar a fonte para mostrar
números que quase ninguém ia ler.

**Degrada em silêncio.** A pesquisa do operador não é documentada: pode mudar
sem aviso. Quando não responde, o serviço devolve `200` com lista vazia e
`falhou: true`, e a página fica com o horário planeado. Um `503` aqui punha uma
mensagem de avaria à frente de quem só queria um horário.

### As chaves

| onde | chave | valor |
| --- | --- | --- |
| **plataforma** → Environment Variables | `PARAGEM_EXPRESSOS_URL` | o endereço da pesquisa do operador |
| **plataforma** (opcional) | `PARAGEM_EXPRESSOS_CACHE_S` | segundos de cache; por omissão `300` |
| **GitHub** → Secrets → Actions | `NEXT_PUBLIC_PARAGEM_EXPRESSOS_<REGIAO>` | `/api/expressos` |

A terceira é cravada no JavaScript **na construção**, como a da
disponibilidade, e pela mesma razão: o Next troca os `NEXT_PUBLIC_*` por texto
em tempo de construção, e a construção é no GitHub. Sem ela o formulário não
aparece — e a página dos expressos fica exatamente como está hoje, com as
linhas que o feed declara.

### O caminho

```
GET /expressos.json?de=<uuid>&para=<uuid>[&data=AAAA-MM-DD]
→ { data, viagens: [...], lido, falhou }
```

Os dois identificadores são os `stop_id` do feed do operador — **medido, não
suposto**: são exatamente os que a pesquisa dele aceita, e por isso não há
tabela de correspondência nenhuma a manter. Um pedido com outra coisa leva
`400` antes de se tocar na fonte; isto é aberto a quem abre a página.
