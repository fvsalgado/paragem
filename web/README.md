# O sítio

Next.js (App Router). As páginas de paragem, linha, estação e concelho saem do
que o pipeline escreve, rendem-se na primeira visita e ficam em cache até os
dados mudarem — funcionam com o motor de viagens em baixo, e são indexáveis
(CLAUDE.md §7 e §11.7). Foi exportação estática; deixou de ser quando a segunda
região não coube no envio, e o que mudou está em `src/lib/dados.ts`.

## Como se corre

```bash
uv run pipeline build --regiao <id>    # os dados
uv run pipeline sitio --regiao <id>    # o que o sítio lê, em build/<id>/sitio/
cd web && npm ci
npm run dados                          # serve build/ com a forma do armazém, em :4322
export NEXT_PUBLIC_PARAGEM_DADOS=http://127.0.0.1:4322 PARAGEM_DADOS=http://127.0.0.1:4322
export PARAGEM_DOMINIOS=<id>=<id>.localhost:4321 PARAGEM_ESQUEMA=http
export NEXT_PUBLIC_PARAGEM_PRODUTO=http://127.0.0.1:4321
npm run build && npm run servir        # a região em http://<id>.localhost:4321
```

**Cada região responde no seu anfitrião** (CLAUDE.md §11.7): o middleware lê
o Host e reescreve para `/<id>/…` por dentro. Os `*.localhost` resolvem no
navegador sem tocar no DNS; `127.0.0.1:4321` não é de nenhuma região e mostra
a montra. Em produção não há `build/` nem `PARAGEM_DOMINIOS`: o `uv run
pipeline publicar` sobe a mesma pasta para o balde público `sitio` do Storage,
e quem diz que regiões há e onde respondem é a tabela `regions`
(`docs/ALOJAMENTO.md`).

## O que o sítio NÃO faz

**Não abre GTFS.** O `uv run pipeline sitio` escreve `build/<id>/sitio/`, o
`publicar` põe-no no armazém, e o sítio lê isso. Duas implementações do mesmo formato divergem, e a divergência
aparece como uma paragem que a página diz que a linha serve e o planeador diz
que não — e quem viaja não tem como saber qual das duas mente.

**Não sabe o que é uma região.** Lê `<armazém>/<id>/…` e mostra o que lá
está. Trocar de região é trocar de pasta, não de código; uma região nova entra
sem construção nenhuma — publica-se, liga-se, e a primeira visita rende-a.

**Não fixa o domínio.** Cada região declara o nome da variável de ambiente em
`regiao.yaml` (`dominio_env`); o valor vive no ambiente (§4.7).

## A marca

A bandeirola de uma paragem, desenhada uma vez em `src/lib/marca.ts`, com as
duas cores da faixa: a das regiões (`--marca`) e o azul-noite da montra e do
painel (`--texto`). O cabeçalho desenha-a inline (`componentes/Marca.tsx`); os
cartões de partilha são rotas do sítio (`src/lib/cartao.tsx`); e os ícones —
`favicon.ico`, `icon.svg`, `apple-icon.png` e os do manifesto em
`public/icones/` — são ficheiros versionados, que se geram outra vez quando a
marca ou a cor mudarem:

```bash
CHROMIUM_PATH=… node scripts/gerar-icones.mjs   # sem CHROMIUM_PATH, o do Playwright
```

O `tests/marca.test.mts` confere o `icon.svg` contra os traços, e as cores
contra o CSS: quem mudar uma e se esquecer da outra fica a saber.

## O painel

`/admin` é de quem responde pelo produto: liga e desliga regiões e módulos,
muda domínios, regista licenças, e lê a auditoria. Vive em `src/app/admin/`
e `src/lib/painel/`, guardado três vezes — o middleware, o layout, cada ação
— e escreve só pelas funções da base (`docs/PAINEL.md`). Para o abrir em
local:

```bash
printf '%s' 'uma-palavra-passe' | node scripts/senha.mjs   # o ADMIN_PASSWORD_HASH
export ADMIN_PASSWORD_HASH=… ADMIN_SESSION_SECRET=… # 32+ caracteres ao acaso
npm run servir                                       # http://127.0.0.1:4321/admin/
```

Sem `SUPABASE_SERVICE_ROLE_KEY` entra-se e não se lê nada — e o painel di-lo.
Os testes (`tests/painel.spec.ts`) correm assim, sem base: o que provam é o
código; a base prova-se no CI, no trabalho `Migrações`.

## Acessibilidade

Não é boa prática: é o Decreto-Lei n.º 83/2018. Duas ferramentas, porque
nenhuma chega:

```bash
npm run test:a11y         # axe-core, em Chromium, viewport de telemóvel
npm run test:lighthouse   # a nota do §9: ≥ 95
```

Medido a 19/09/2026, em seis páginas: **axe sem violações, Lighthouse 100**.

E há verificações escritas à mão a seguir às automáticas, porque o axe não vê
tudo: a ordem dos cabeçalhos, o alvo tátil de 44 px, a página a caber a 320 px
sem deslizar para o lado, e a frase que diz que os horários são planeados e não
em tempo real.

**Nada disto substitui uma pessoa que use leitor de ecrã todos os dias**, e a
declaração de acessibilidade diz isso sem rodeios.

### O navegador dos testes

O Playwright usa o que descarregou. Num ambiente que já tenha Chromium —
e cuja versão não bata certo com a build que este Playwright espera —,
`PARAGEM_CHROMIUM` aponta-lhe o caminho:

```bash
PARAGEM_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:a11y
```

## O planeador

É a única página que fala com o OTP, e a única que precisa dele de pé. O
endereço vem do ambiente e não está cravado no código:

```bash
uv run pipeline grafo --regiao <id>
java -jar .cache/otp.jar --load --port 8801 build/<id>/otp &
cd web && NEXT_PUBLIC_PARAGEM_OTP=http://127.0.0.1:8801 npm run build
PARAGEM_OTP=http://127.0.0.1:8801 npx playwright test planeador
```

**Sem motor configurado, a página diz isso** em vez de dizer que não há
viagem. A diferença não é de cortesia: «não há caminho» quando o que há é um
motor desligado manda alguém de táxi para uma viagem que existe.

**A janela de procura é de doze horas**, e é a decisão que mais pesa. Medido na
Fase 2: o OTP, por omissão, escolhe cinquenta minutos, e com cinquenta minutos
a ligação Torres Novas → Entroncamento — que tem catorze viagens por dia —
devolve zero itinerários. Cinquenta minutos é uma janela de cidade.

A procura de paragens usa um índice próprio, `procura.json`: 2419 pontos, um
por nome, 41 kB com gzip. O `paragens.json` tem 843 kB e serve para construir
as páginas — mandá-lo para o telemóvel de quem só quer escrever «Tomar» era
gastar-lhe os dados por nada.

## O que falta

- **O mapa**, com MapLibre GL e PMTiles gerados do mesmo OpenStreetMap e
  alojados por nós. Sem serviços de mapas privados (§7).
- **«Perto de ti»**, que precisa de geolocalização — e uma página que peça a
  localização antes de mostrar seja o que for não serve quem recusa.
