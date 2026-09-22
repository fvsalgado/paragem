# Alojamento

Três peças, e são independentes de propósito: cada uma pode estar em baixo sem
levar as outras atrás.

```
    quem visita
         │
         ├──────────────▶  o SÍTIO  ◀──  o ARMAZÉM   páginas em cache, dados
         │                 Vercel         Supabase    publicados pelo pipeline
         │                                            (funcionam sem o motor)
         │
         └──────────────▶  o PROXY  ──▶  o MOTOR
                           nginx         OpenTripPlanner
                           (limites)     (não publica porta nenhuma)
```

**O sítio não precisa do motor.** As páginas de paragem, linha, estação e
concelho saem do que o pipeline publica no armazém, e ficam em cache. O
planeador corre no navegador a partir da grelha horária; o motor só entra no
CI, para calcular os transbordos a pé e para julgar o planeador.

## O sítio

Next.js, construído **pela Vercel a partir do Git**: projeto `paragem`, Root
Directory `web`, funções em `cdg1` (Paris). Cada push a `main` publica em
minutos; cada PR tem uma pré-visualização. Deixou de ser exportação estática a
22/09/2026 (CLAUDE.md §11.7), e o que mudou cabe em três frases:

- **As páginas rendem-se a pedido e ficam em cache.** A primeira visita a uma
  página rende-a com os dados do armazém e guarda-a; as seguintes servem a
  cópia (`Cache-Control: s-maxage=3600`). Uma hora depois, ou quando o
  pipeline avisa, refaz-se. É o que o estático prometia — uma página servida
  como ficheiro, que funciona com o motor em baixo — sem os 12 107 ficheiros
  por envio que não deixavam entrar a segunda região.
- **Os dados não estão no repositório nem na Vercel.** O pipeline escreve
  `build/<regiao>/sitio/` e `uv run pipeline publicar` sobe-o para o balde
  público `sitio` do projeto Supabase (`docs/BASE-DE-DADOS.md`), ficheiro a
  ficheiro e só o que mudou — o MD5 de cada um diz se mudou. O servidor lê de
  lá (`web/src/lib/dados.ts`); o navegador também, sem passar por nós: as
  partidas, os sítios, a grelha horária e os mosaicos do mapa, que são 60 MB
  lidos por intervalos de bytes.
- **O aviso.** No fim de publicar, o pipeline chama `POST /api/revalidate`
  com a região, e o sítio deita fora as páginas dela. Sem aviso, ficam válidas
  até o prazo de uma hora passar.

### Um domínio por região

Cada região responde no domínio que declara — `dominio:` no `regiao.yaml`,
com cópia em `regions.domain`. O middleware (`web/src/middleware.ts`) lê o
Host, traduz pelo mapa da base (`web/src/lib/regiao-host.ts`, cinco minutos
de memória por instância) e reescreve `/…` para `/<regiao>/…` por dentro, sem
o endereço público mudar — é reescrita e nunca `headers()` numa página, para
a cache continuar a valer. Um anfitrião que não é de nenhuma região
(`www.paragem.pt`, um `*.vercel.app`, `localhost`) vê a montra em `/` e um 404
em tudo o resto: **nunca a rede de um cliente** num endereço que ninguém lhe
atribuiu. Um alias (`region_domain_aliases`) redireciona (308) para o
canónico. O caminho antigo `/<regiao>/…` deixou de existir, por decisão do
dono (CLAUDE.md §11.7).

Para uma região nova responder são três coisas, e nenhuma é um deploy:

1. a linha em `regions`, com o domínio — pelo painel, ou por SQL a partir da
   raiz onde ela vive;
2. o domínio no projeto da Vercel (Settings → Domains). Um subdomínio de
   `paragem.pt` fica com DNS e certificado sozinhos, porque o domínio está na
   Vercel; um domínio da autoridade de transportes aponta um CNAME para o que
   a Vercel indicar, e é dela;
3. cinco minutos: o mapa refaz-se por si.

Nas pré-visualizações, `PARAGEM_DOMINIOS` — só nesse ambiente — soma ao mapa
o endereço provisório do ramo, para se poder ver uma região antes de fundir.
Nos testes são os `*.localhost` (`web/tests/anfitrioes.ts`). Em produção a
variável não existe: quem manda é a base.

### O que a Vercel precisa (Environment Variables)

| variável | ambientes | o que é |
| --- | --- | --- |
| `NEXT_PUBLIC_PARAGEM_DADOS` | todos | a porta pública do balde: `https://<ref>.supabase.co/storage/v1/object/public/sitio` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | todos | a base do painel — a lista das regiões ligadas, lida com a chave pública |
| `REVALIDATE_SECRET` | produção e pré-visualização, sensível | o que o pipeline apresenta ao avisar; 16 caracteres ou mais |
| `NEXT_PUBLIC_PARAGEM_PRODUTO` | todos | a montra, `https://www.paragem.pt`: para onde levam a marca e o «Outras regiões» a partir de qualquer região |
| `PARAGEM_DOMINIOS` | só pré-visualização | `id=host,…` somado ao mapa da base; nos testes é o mapa inteiro |
| `PARAGEM_MODULOS_DESLIGADOS` | só nos testes | `id=modo+modo,…` somado ao que a base diz; é como o CI prova que um módulo desligado sai do sítio ([`PAINEL.md`](PAINEL.md)) |
| `NEXT_PUBLIC_PARAGEM_POSTHOG` | produção | a medição ([`MEDICAO.md`](MEDICAO.md)); uma pré-visualização não mede |
| `PARAGEM_OTP_<REGIAO>` | quem tiver motor | o endereço do OpenTripPlanner dessa região. **A chave calcula-se** (`medio` → `PARAGEM_OTP_MEDIO`), lê-se no servidor e segue para o navegador por propriedade: uma região nova entra com uma variável e zero linhas de código. Sem sufixo serve quem aloja uma região só |
| `PARAGEM_DISPONIBILIDADE_<REGIAO>`, `PARAGEM_EXPRESSOS_<REGIAO>` (os nomes com `NEXT_PUBLIC_` continuam a servir) | todos | `/api/station_status/` e `/api/expressos/` — caminhos, não domínios: as rotas são servidas pelo mesmo deployment, e o endereço de uma pré-visualização muda a cada publicação |
| `PARAGEM_PAINEL_URL`, `PARAGEM_EXPRESSOS_URL` | produção | as fontes das duas rotas ([`disponibilidade/README.md`](../disponibilidade/README.md)) |
| `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` | produção e pré-visualização, sensíveis | a porta do painel `/admin` ([`PAINEL.md`](PAINEL.md)): o hash da palavra-passe (`web/scripts/senha.mjs`) e o segredo que assina a sessão, 32 caracteres ou mais. Sem eles o painel não abre |
| `SUPABASE_SERVICE_ROLE_KEY` | produção e pré-visualização, sensível | a chave **secreta** «painel» do projeto Supabase: é com ela que o painel lê e chama as funções da base. Nunca `NEXT_PUBLIC_`; só o servidor a vê |
| `IP_HASH_SALT` | produção e pré-visualização, sensível | o sal dos hashes de origem do painel (limite de tentativas, auditoria); 16 caracteres ou mais |

Os `NEXT_PUBLIC_*` são trocados por texto **na construção** — e a construção
é agora na Vercel, por isso é lá que vivem. Já não há nada a cravar no CI.

### O que o GitHub precisa (Secrets)

| segredo | quem o usa | o que é |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | o fluxo `Dados`, ao publicar | uma chave **secreta** do projeto Supabase — a «pipeline», criada para isto. Só escreve no balde; o sítio nunca a vê |
| `REVALIDATE_SECRET` | o fluxo `Dados`, ao avisar | o mesmo valor que está na Vercel |

**Sem eles o CI não fica vermelho.** O passo de publicação salta e deixa uma
nota; os dados construídos ficam como artefacto da corrida. Um CI vermelho
porque falta uma credencial é um CI vermelho por hábito, e um CI vermelho por
hábito deixa de ser sinal.

### As definições do projeto na Vercel

Estão assim, e quem recriar o projeto tem de as pôr assim:

| definição | valor | porquê |
| --- | --- | --- |
| Framework Preset | Next.js | é o que está em `web/` |
| Root Directory | `web`, com «Include source files outside of the Root Directory» ligado | as duas rotas importam `disponibilidade/*.mjs`, que vive na raiz e é partilhado com o contentor |
| Build, Install e Output | vazios | os da framework; um comando escrito à mão só existiria para divergir |
| Ignored Build Step | vazio | a Vercel **constrói** a partir do Git — foi `exit 0` enquanto o CI enviava o sítio pronto |
| Node.js Version | 22.x | a mesma do CI; duas versões maiores diferentes são um defeito que só aparece em produção |
| Function Region | `cdg1` | Paris; a omissão são os Estados Unidos |

### Quem faz o quê, por ordem

1. **`Dados`** — à segunda-feira, à mão, ou num push a `main` que toque no
   pipeline ou nas regiões — constrói, valida, escreve o que o sítio lê, os
   mosaicos e os transbordos, e **publica**: `uv run pipeline publicar` para
   cada região, que sobe o que mudou, escreve o inventário no fim e avisa.
2. **`Sítio`** — em cada push — constrói o sítio contra os dados da mesma
   corrida, servidos por `web/scripts/servir-dados.mjs` com a forma do balde,
   e prova: tipos, unidade, o rastreio de todas as ligações, o axe, o
   Lighthouse. **Não publica nada.**
3. **A Vercel** constrói o que está no Git — 22 segundos, sem tocar em dados
   — e publica. Uma região nova entra sem construção nenhuma: publica-se no
   balde, liga-se na base, e a primeira visita rende-a.

### O que só se vê depois de publicar

- `<o-sítio>/api/station_status/` dá JSON com as estações;
  `<o-sítio>/api/expressos/?de=…&para=…` dá as viagens; e `POST
  <o-sítio>/api/revalidate/` sem segredo dá 401 — se der 503, a variável não
  está posta.
- Uma página de região pedida duas vezes no seu domínio: `x-vercel-cache: HIT`
  com `x-matched-path: /[regiao]/…` — a cache da rede é por caminho
  reescrito, e é isso que faz o middleware por host não custar nada. (No
  `next start`, que é o que o CI corre, uma página reescrita pelo middleware
  rende a cada pedido: o servidor autónomo do Next não consulta a cache de
  página num pedido reescrito. Medido com e sem middleware na mesma
  construção. Os testes provam o conteúdo; a cache prova-se aqui.)

### O endereço pede autenticação nas pré-visualizações — e a produção não

Os horários são de dezembro de 2025, nove dos quinze preços estão marcados
«por confirmar» e 19 viagens não têm dias declarados. A interface diz tudo
isso a quem a lê; um resultado de pesquisa não diz nada disso a quem só vê o
título e a hora. Enquanto for assim, isto não se abre aos motores de busca —
e abrir é decisão da autoridade de transportes (Fase 5), não nossa.

Dois cadeados, em sítios diferentes de propósito: a **proteção de
pré-visualizações** da Vercel (Vercel Authentication, `preview`), que vive no
painel e se desliga sem deixar rasto; e **`web/public/robots.txt`**, com
`Disallow: /`, que vive no repositório e só muda num commit que alguém
assina. Há um teste que verifica o segundo.

## O motor e o proxy

```bash
uv run pipeline build --regiao <id>
uv run pipeline grafo --regiao <id>

PARAGEM_REGIAO=<id> \
PARAGEM_ORIGEM=https://o-dominio-do-sitio \
  docker compose -f otp/docker-compose.yml up -d
```

O que fica exposto é o **proxy**. O motor não publica porta nenhuma — só o
proxy lhe chega, pela rede interna.

**O proxy não é decoração.** O §7 pede «só a API GraphQL necessária, atrás de
um proxy com limites», e são dois requisitos:

- **só a API necessária**: o OTP serve uma interface de depuração, mosaicos
  vetoriais, a API Transmodel e o ficheiro do grafo. Nada disso é preciso ao
  sítio, e tudo isso é superfície. O proxy responde 404 a tudo o que não seja
  `POST /otp/gtfs/v1`;
- **com limites**: cada pedido é um cálculo de caminhos sobre um grafo de
  97 MB, não um ficheiro servido. Um OTP aberto sem limites derruba-se com um
  portátil.

As regras estão em [`otp/proxy/nginx.conf`](../otp/proxy/nginx.conf), e há
testes que as correm com um nginx verdadeiro contra um motor de brincar
(`pipeline/tests/test_proxy.py`): o que passa, o que não passa, o limite a
apertar, o corpo grande a ser recusado. Uma configuração de proxy que nunca
correu é uma promessa, não uma proteção.

### Quanto é que o motor precisa

Medido a 19/09/2026, nesta região. **São dois números, e a diferença entre
eles é o que decide quanto custa alojar isto.**

| | memória | tempo |
| --- | --- | --- |
| **construir** o grafo | pico de ~4,1 GB; precisa de `-Xmx6G` | 102 s (84 s no CI) |
| **servir** o grafo | arranca com `-Xmx2G`, RSS de 1,4 GB | ~15 s a arrancar |
| `graph.obj` | 97 MB em disco | |

O briefing dizia «2–4 GB deverão chegar; confirmar». Confirmado, e com uma
emenda que muda a conta: 4 GB é o pico da **construção**, não do serviço.

**Construir o grafo e servi-lo podem ser máquinas diferentes**, e provavelmente
devem ser. O CI já constrói o grafo em 84 s; o `graph.obj` tem 97 MB e
copia-se. Uma máquina de 2 GB serve o motor sem nunca precisar dos 6 — o que
tira isto da gama dos €15/mês para a dos €4.

## A medição

PostHog, projeto `Paragem`, em servidores da União Europeia. O que se mede e
porquê está em [`MEDICAO.md`](MEDICAO.md) — e a configuração de origem é sem
cookies, sem identificador e sem IP, que dá **mais** dados e não menos: sem
dado pessoal não é preciso aviso de consentimento, e mede-se toda a gente em
vez de só quem aceita.

| segredo | o que é |
| --- | --- |
| `PARAGEM_POSTHOG` | a chave do projeto |

O segredo chama-se `PARAGEM_POSTHOG` e a variável que chega ao navegador
chama-se `NEXT_PUBLIC_PARAGEM_POSTHOG` — o workflow faz a passagem. São
nomes diferentes de propósito: o prefixo `NEXT_PUBLIC_` é o que diz ao
Next.js «isto vai para dentro do código que o navegador descarrega», e um
segredo de repositório com esse nome convidava a lá pôr um que não devesse ir.

Sem ela não se mede nada, e o sítio funciona igual.

## O que ainda não tem alojamento

- **A gestão de avisos** (Supabase, Fase 4). O projeto Supabase `paragem` já
  existe — é a base do painel, descrita em `docs/BASE-DE-DADOS.md` —, mas o
  esquema dos avisos não está feito, e é deliberado: não há avisos para
  guardar, não há editores para autenticar, e o esquema desenhava-se antes de
  saber o que a autoridade de transportes precisa de publicar.
- **O domínio próprio da autoridade de transportes.** Cada região responde
  hoje num subdomínio do produto; o domínio final é da autoridade (§4.7),
  entra como canónico quando ela o apontar, e o subdomínio passa a alias.
