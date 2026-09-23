# A base de dados

O Paragem.pt tem uma base de dados **pequena, de propósito**. O conteúdo — as
paragens, as linhas, os horários, o grafo do motor, os mosaicos — é construído
pelo pipeline a partir das fontes e vive em ficheiros; não há uma linha de
horário em Postgres, e não vai haver. O que a base guarda é o que só faz
sentido em tempo de execução e que o painel muda sem um commit:

| tabela                  | o que é                                                  | quem lê                                              |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `regions`               | se cada região está ligada, e em que domínio responde    | o middleware, com a chave anónima — só vê as ligadas |
| `region_domain_aliases` | os outros endereços de uma região, que só redirecionam   | o middleware                                         |
| `modulos`               | que modos de transporte cada região tem **desligados**   | o sítio, com a chave anónima                         |
| `region_licenses`       | o registo comercial: uma linha por contrato ou renovação | só o painel, com a chave de serviço                  |
| `admin_actions`         | cada gesto do painel, com o antes e o depois             | só o painel                                          |
| `rate_limits`           | as tentativas de entrada no painel, por origem e janela  | só a função `rate_limit_hit`                         |
| `avisos`                | o que a autoridade tem a dizer hoje: supressões, desvios, greves | o sítio e o feed GTFS-RT, com a chave anónima — só os publicados |

É o desenho do [Coreto](https://github.com/fvsalgado/coreto) — a mesma casa, o
mesmo autor, o mesmo problema resolvido primeiro lá —, levantado e reduzido.
Onde o Coreto guarda a identidade inteira de uma região na base, aqui ela
continua em `regioes/<id>/regiao.yaml`, porque é o pipeline que a lê e porque
uma região tem de poder viver noutra raiz (`CLAUDE.md` §11.6).

## Quatro regras que não são de estilo

**As migrações trazem o produto; uma região real é um dado da instalação.** As
migrações semeiam só as duas regiões de prova — que são inventadas e vão para o
repositório público inteiras. A linha de uma região real entra pelo painel, ou
por SQL a partir da raiz onde ela vive ([`NOVA-REGIAO.md`](NOVA-REGIAO.md)),
nunca por uma migração: o esqueleto público leva estas migrações tal e qual, e
o nome de um cliente numa migração era o nome de um cliente publicado.

**Que módulos existem é do código; se estão ligados é da base.** A lista dos
sete modos é do produto; que modos cada região tem é o `modos:` do seu
`regiao.yaml`; a tabela `modulos` só guarda os que estão desligados. Uma região
sem linhas tem tudo ligado.

**Nenhuma escrita toca nas tabelas.** O painel chama funções SQL —
`set_region_enabled`, `set_modulo`, `add_region_license`, `create_region`,
`set_region_domain`, `add_region_alias`, `remove_region_alias` — e são elas
que escrevem e que deixam a linha em `admin_actions`. Uma escrita direta era uma
ação sem rasto, e o rasto é metade do que torna um interruptor confiável.
Quem quer saber «quem desligou o comboio nesta região, e quando» lê a tabela.

**Os avisos são a única coisa que o sítio mostra e o pipeline não constrói.**
Tudo o resto — paragens, linhas, horários, mosaicos — é construído das fontes e
publicado por ficheiro. Um aviso não pode esperar por isso: uma greve marcada
para amanhã de manhã, um desvio que começa daqui a uma hora. Por isso vive na
base, escreve-se no painel, e o sítio lê-o com a chave pública — a policy
`avisos_public_read` só deixa ver o que está publicado, e por isso um rascunho
não existe para quem pergunta de fora. Publicar invalida a etiqueta de cache da
região e a página rende-se de novo à visita seguinte; o minuto de validade é o
que sobra para o caso de o sinal se perder. A forma das colunas é a do GTFS-RT
(`cause`, `effect`, `severity_level`, `active_period`, `informed_entity`), para
o feed sair por tradução direta em vez de por adivinhação, e um valor de fora
da especificação rebenta na ESCRITA — onde há uma pessoa para o corrigir — e
não na leitura, onde há uma aplicação de outra gente.

**O público degrada, a segurança fecha.** Se o sítio não conseguir ler
`modulos`, mostra tudo — assumir tudo desligado por causa de uma falha de rede
fazia desaparecer seis modos. Se o painel não tiver os segredos, não abre.

## O domínio é declarado na região, e a base guarda uma cópia

O domínio canónico de uma região — `<subdominio>.paragem.pt`, ou o domínio
próprio da autoridade quando o tiver — é **identidade da região**, e por isso
vive em `regioes/<id>/regiao.yaml` (`dominio:`), ao lado do nome e do artigo.
É declarado, não adivinhado: um identificador com hífen não diz como se
escreve o subdomínio.

A tabela `regions` repete o nome, o artigo e o domínio: o painel e o
middleware precisam deles sem ir buscar ficheiros. Uma cópia com verificação é
aceitável; uma sem ela é a que diverge em silêncio.
`ferramentas/verificar-seeds.py` compara os dois, região a região, em cada
corrida do CI, e falha com a diferença escrita. Uma região declarada e ainda
sem linha não é uma falha — é uma região que ainda não nasceu no painel — e o
verificador di-lo em vez de reprovar.

## Provar as migrações antes de as aplicar

O CI (`Migrações`) aplica todas as migrações a um Postgres 17 limpo, corre as
asserções de `scripts/schema-checks.sql` — que também exercitam as funções de
escrita, e limpam o que escreveram — e compara os seeds com os `regiao.yaml`.
Localmente é o mesmo comando, contra qualquer instância:

```bash
DATABASE_URL=postgres://postgres@localhost:5432/postgres ./scripts/verify-migrations.sh
DATABASE_URL=postgres://postgres@localhost:5432/postgres uv run python ferramentas/verificar-seeds.py
```

Sem Docker à mão, o pacote `pgserver` (`pip install pgserver`) traz um
Postgres embutido que arranca num diretório qualquer, sem root — foi assim que
estas migrações foram provadas pela primeira vez.

## O projeto gerido

Existe desde 22/09/2026, criado quando o dono disse e não antes: projeto
`paragem`, referência `cingvgokdlvqgoaiatpn`, na organização Supabase da casa,
região `eu-west-3` (Paris), Postgres 17 no canal estável — a mesma escolha do
Coreto: tudo na União Europeia, e a versão maior que o CI já prova. O endereço
é `https://cingvgokdlvqgoaiatpn.supabase.co`. É o quarto projeto da
organização e paga o cómputo da instância mais pequena, por mês, além do plano.

O que já está feito:

- **As seis migrações estão aplicadas**, por ordem — as quatro primeiras no
  dia da criação, a 0005 (o limite de tentativas) e a 0006 (a região nasce no
  painel) com o painel. O histórico do projeto
  (`supabase_migrations.schema_migrations`) tem as versões dos ficheiros de
  `supabase/migrations/` — `20260922100000` a `20260922100500` —, para que um
  `supabase db push` futuro reconheça o estado em vez de tentar aplicar tudo
  outra vez. Uma migração nova entra pelo mesmo
  caminho: ficheiro no repositório, provado no CI, e só depois `db push` — o
  `verify-migrations.sh` **não** serve contra o projeto: o prelúdio cria papéis
  que o Supabase já traz.
- **Verificado depois de aplicar**: as duas regiões de prova com o nome, o
  artigo e o domínio dos `regiao.yaml`; as duas licenças `demo` sem prazo;
  RLS ligada nas cinco tabelas; três policies, todas de leitura pública; as
  cinco funções; `modulos` e `admin_actions` vazias.
- **A palavra-passe da base não ficou guardada em lado nenhum.** Foi gerada ao
  acaso na criação e deitada fora: o sítio vai falar com a base pelas chaves
  de API, não por `psql`. Para uma ligação direta, redefine-se no painel do
  Supabase (Settings → Database → Reset database password) na altura.

O que já lê a base, desde o PR 1 (sair da exportação estática):

- **A lista das regiões ligadas.** `web/src/lib/dados.ts` pergunta a
  `public.regions` com a chave pública — a política de leitura só deixa ver as
  ligadas — e é isso que decide o que a página de produto mostra e que
  regiões respondem. Desligar uma região na base tira-a do ar em cinco
  minutos, sem publicação nenhuma. Sem base configurada vale
  `PARAGEM_REGIOES` no ambiente (é como o CI testa); com a base em baixo, as
  regiões com dados no armazém continuam a responder — o público degrada, não
  desaparece.
- **A primeira região real tem linha**, posta por SQL a partir da raiz onde
  ela vive, com o nome, o artigo e o domínio do `regiao.yaml` dela. Não é
  uma migração: entrou à mão, como o painel a vai pôr.
- **O balde `sitio` do Storage**, público, com limite de 200 MB por ficheiro
  (os mosaicos de uma região são 60 MB): é onde `uv run pipeline publicar`
  põe `build/<regiao>/sitio/`. A chave que escreve lá é uma chave secreta
  criada só para isso («pipeline»); o sítio lê pela porta pública, sem chave.

- **O domínio decide a região** (PR 2): o middleware lê `regions.domain` e
  `region_domain_aliases` pela porta pública e reescreve cada pedido para o
  segmento da sua região (`docs/ALOJAMENTO.md`, «Um domínio por região»).

- **O painel `/admin`** (PR 3) lê tudo isto com a chave de serviço e escreve
  só pelas funções — ligar e desligar regiões e módulos, domínios e alias,
  licenças — com a auditoria à vista ([`PAINEL.md`](PAINEL.md)).
- **Os módulos fazem efeito** (PR 4): o sítio lê `modulos` pela chave
  pública, com a etiqueta da região, e um modo desligado sai das páginas, do
  mapa, da procura, dos dados abertos e do planeador — o que é, e onde, está
  em [`PAINEL.md`](PAINEL.md).

Os cinco PR do plano (`CLAUDE.md` §11.7) estão feitos.

As variáveis que o sítio lê estão no Vercel (`docs/ALOJAMENTO.md`):

| variável                        | onde                             | o que é                                          |
| ------------------------------- | -------------------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Vercel                           | o endereço do projeto                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel                           | a chave anónima — lê só o que a RLS deixa        |
| `SUPABASE_SERVICE_ROLE_KEY`     | Vercel, **nunca** `NEXT_PUBLIC_` | a chave de serviço: ignora a RLS, só no servidor |

São duas chaves secretas, com nomes diferentes de propósito: a «pipeline»
vive no GitHub, nos segredos do fluxo `Dados`, e só escreve no balde; a
«painel» vive na Vercel como `SUPABASE_SERVICE_ROLE_KEY`, e é com ela que o
painel lê as tabelas privadas e chama as funções. Uma chave que se revoga
sem levar a outra atrás.

## O que vem a seguir, por esta ordem

Cada passo é um PR que pode ir ao ar sozinho; o plano inteiro está no
`CLAUDE.md` §11.7.

1. **O sítio deixa de ser exportação estática.** Páginas com revalidação a
   pedido, a ler os ficheiros que o pipeline sobe para o Storage; o pipeline
   avisa o sítio no fim (`/api/revalidate`). O sítio passa a publicar em
   minutos, separado dos dados.
2. **Uma região por domínio.** O middleware lê o `Host`, pergunta a esta base
   qual é a região, e reescreve. Cada região passa a responder no domínio que
   declara.
3. **O painel.** `/admin`, com sessão por senha e segredo, a escrever por estas
   funções. Feito ([`PAINEL.md`](PAINEL.md)).
4. **Os módulos a fazerem efeito**: páginas, grelha, camadas do mapa,
   planeador e dados abertos a lerem `modulos`. Feito.
