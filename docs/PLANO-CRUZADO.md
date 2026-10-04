# Plano cruzado — o Paragem.pt, depois de se medir ao lado dos irmãos

Escrito a **4 de outubro de 2026**, a partir de uma auditoria aos três produtos da casa — o
Paragem.pt e dois irmãos, o Coreto (agenda cultural de um território) e o Em Cada Esquina (percursos
a pé) —, feita em dezanove frentes: documentos, código, saúde técnica, operação, mapa, desenho e
sinalética, experiência e acessibilidade, dados abertos, segurança, licenças, regiões, línguas e
funcionamento sem rede, descoberta e pré-visualizações, correio e contactos. Estado lido: `d913ce6`.

Não substitui o [`CLAUDE.md`](../CLAUDE.md), que é o briefing, nem os documentos de `docs/`. Diz o que
fazer a seguir, por que ordem, e o que o Paragem.pt aprende com os irmãos sem deixar de ser o
Paragem.pt.

Este repositório é público. O que é decisão comercial, contrato, licenciamento de fundo ou
pormenor de segurança foi entregue ao dono à parte; aqui fica o que se faz e como se verifica. Como
manda o §10, a região real não se nomeia: escreve-se «a região real».

## Como ler

- Cada medida tem um código (`XP-nn`), a frase do resultado, a prova (`ficheiro:linha`), o que se
  faz e **Verifica-se:** — o critério de aceitação. Fecha com **tamanho · valor**: P (horas), M
  (dias), G (semanas) · crítico, alto, médio, baixo.
- **Aprende com** diz de onde vem o padrão. Copia-se o mecanismo, nunca a identidade (§8).
- O que é do dono está separado do que é código (§1 e §9). O `CLAUDE.md` não se edita a pedido de
  um agente: as emendas propostas ficam para o dono aprovar.
- Onde a medição contradisse a leitura, ficou a medição. O que não se confirmou diz «por confirmar».

---

## 0. O diagnóstico, numa frase

**O Paragem.pt tem a arquitetura mais limpa dos três, e uma prova pública mais fina do que parece.**
O §5.3 está feito nos cinco passos; uma região é uma declaração; os termos dos dados saem do código;
o planeador corre no navegador e diz sempre porquê; o feixe e o motor de cor conferem-se para
qualquer cor; os cartões de partilha são a referência da casa; o MapLibre desce uma vez. E, ao mesmo
tempo: é o único dos três repositórios que é público, e o menos endurecido; dos 157 testes Python
que saltam, 129 nunca podem correr aqui; o oráculo do motor nunca corre no CI; a documentação
descreve um produto que o código já ultrapassou; e em documentos e configuração públicos ainda há
nomes de lugares e de linhas da região real.

### O que está bem, e não se estraga

- **A proveniência como regra executável**: `data/sources.yaml` com licença, atribuição, datas e
  somas; `fontes.py` levanta exceção para o que é manual ou proibido; uma fonte em duas raízes
  rebenta.
- **Os termos dos dados saem do código** (`_termos`, `pipeline/src/paragem/sitio.py:2408-2461`), a
  atribuição ODbL vai dentro do ficheiro, o relatório de lacunas tem forma (`relatorio.py`) e
  bloqueia o CI.
- **O validador de GTFS fixado e obrigatório**, e o OTP como segunda opinião.
- **As regiões inventadas que se constroem sem rede**, com artigos diferentes, tipos de autoridade
  diferentes e caixas disjuntas, e o `check-regioes` que tira as palavras proibidas das declarações
  das outras regiões.
- **As raízes** (`PARAGEM_RAIZES`): a compilação de um cliente nunca entra aqui.
- **O feixe e o motor de cor** (`web/src/lib/feixe.ts`, `cor.ts`, `marca.ts`): testes de propriedade
  para qualquer cor de região, o ícone e o cartão conferidos píxel a píxel.
- **Os cartões de partilha** (`cartao()` em `lib/metadados.ts`): PNG 1200×630 de cerca de 55 kB, por
  região, paragem e linha, com os metadados completos — medidos no ar, os melhores dos três.
- **O mapa**: o MapLibre fora do empacotador e descarregado uma vez, a folha de estilo só onde há
  mapa, mosaicos próprios gerados do mesmo recorte do motor, glifos com o `OFL.txt` ao lado, cantos
  medidos acima das folhas, erros que nunca deixam uma caixa vazia.
- **O planeador**: estados exemplares — sem horários, motor sem resposta, «hoje já não há» com a
  próxima ligação —, e uma procura que é um combobox ARIA, ignora acentos e perdoa uma letra.
- **Os testes de comportamento**: 30 especificações Playwright escolhidas pelos dados, o rastreio de
  ligações, o axe nos dois temas, o Lighthouse com pisos de peso e de salto.
- **O `decidir()` puro** que encaminha cada anfitrião, as contas por pessoa, a auditoria, os
  módulos que fazem efeito.
- **A medição leve**: a biblioteca de 52 kB, sem cookies, sem gravação de sessão, depois do `load`.
- **A cache na Vercel funciona**: medido a 4/10, a segunda visita a `demo.paragem.pt/rede/` dá `HIT`,
  e o tarifário `STALE` com 87 minutos de idade — a revalidação a pedido como o §5.3 a quer.

---

## 1. Antes de tudo — o que é do dono

1. **`ADMIN_EMAIL`** na Vercel, em produção e em pré-visualização: confirmar que está definido
   (`docs/PAINEL.md:214-220`).
2. **Correio no domínio.** O `paragem.pt` não tem correio: nenhum endereço `@paragem.pt` recebe. O
   contacto publicado — produto, privacidade, acessibilidade, segurança — é uma caixa pessoal,
   escrita no repositório e em todas as páginas do produto. Pôr o domínio no fornecedor de correio
   que o Coreto já usa, com endereços de função (`ola@`, `seguranca@`, `privacidade@`,
   `acessibilidade@`, `dados@`), e o DNS completo (XP-07).
3. **Os contactos da região real.** A declaração de acessibilidade (DL 83/2018) e a privacidade dizem
   «Por preencher»: honesto, mas a região fica sem o mecanismo de contacto que a lei pede. Pedir à
   autoridade o contacto, a via de queixa e o responsável pelos dados (`docs/ENTRADA.md:28-32`); até
   lá, mostrar um contacto do produto, apresentado como tal.
4. **Medição e endereço IP.** Confirmado a 4/10: o projeto de medição descarta o IP
   (`anonymize_ips`). Falta a página de privacidade dizer que é uma definição do projeto, e não do
   código (XP-04).
5. **A base do painel.** Confirmado a 4/10: as dez migrações estão aplicadas em produção, a 0009 e a
   0010 desde 2/10. O que falta é o CI sabê-lo sem ninguém abrir a consola (XP-10).
6. **Os dois testes de ferramentas que não estão no repositório** (`test_esqueleto_publico.py`,
   `test_raiz_da_regiao.py`, 20 casos que saltam sempre): entregar as ferramentas ou retirar os
   testes. Recomendação: retirar — o próprio `test_raiz_da_regiao.py:95-100` diz que «os geradores
   morrem com a separação».
7. **As emendas ao `CLAUDE.md`** (XP-08) e as decisões da §9.
8. **O `robots.txt` da CP** (`data/sources.yaml:60-70`), «decisão por tomar» desde 21/09, e os
   termos da fonte dos expressos, «por confirmar».

---

## 2. Vaga 0 — Nada público que não devia estar, e nada prometido que não se cumpra

### XP-01 · A região real sai dos documentos e da configuração públicos

O §10 diz que um cliente não pode ser nomeado em documentos, configuração ou declarações de região,
«e isso é verificado». Não é: o verificador vivia numa das ferramentas que não estão no repositório.
Hoje ainda há nomes de terras, de estações e de linhas da região real em seis ficheiros de
documentação e configuração — a lista está com o dono, e o verificador desta medida encontra-os
todos. Uma limpeza anterior tirou um desses exemplos de um documento e deixou-o noutro.

- Trocar cada exemplo pelo equivalente inventado, que já existe: a armadilha de rede com dois
  operadores (`data/manual/prova/prova.osm.xml:80-93`) e as viagens da demonstração
  (`regioes/demo/fontes.yaml:169-181`).
- Um verificador de documentos e configuração no CI, com as palavras proibidas tiradas das
  declarações das regiões que existem nas raízes, como o `check-regioes` já faz nas saídas.
- Escrever a exceção das fontes nacionais com atribuição obrigatória (CP, IP, IMT, DGT, FlixBus), que
  a letra do §7 apanha.

**Verifica-se:** o verificador corre em `docs/`, `otp/`, `disponibilidade/`, `data/` e `regioes/`, e
reprova com o nome de qualquer terra de uma região que não seja inventada. — **P/M · crítico**.

### XP-02 · Os testes da região real saem para a raiz dela

O identificador da região real aparece em 58 linhas de 14 ficheiros de `pipeline/tests`, 109 testes
saltam sempre por dependerem dela (`conftest.py:40`, `test_pdf_cartazes.py`, `test_pdf_horarios.py`,
`test_grelha.py:49`), e a razão do salto imprime o identificador. O §5.1 diz que os testes procuram a
fonte pela propriedade.

- Os testes que só fazem sentido com os dados dela passam para a raiz dela, com um `conftest` que
  descobre `tests/` em cada raiz de `PARAGEM_RAIZES`.
- Os que valem para qualquer região reescrevem-se pela propriedade sobre a demonstração, a começar
  pelo determinismo da grelha (`test_grelha.py:49` lê `build/<região real>/sitio/viagens.json`) e
  pelos urbanos.
- Os 20 dos dois testes de ferramentas saem (§1.6).

**Verifica-se:** `pytest -rs` não mostra nenhum salto por falta da região real, e nenhum ficheiro de
`pipeline/tests` nomeia uma região que não esteja neste repositório. — **M · alto**.

### XP-03 · Os dados publicados das regiões inventadas não trazem números de outra

`construcao.py:886-890` escreve, em todas as regiões sem carta administrativa, uma lacuna com os
números de referência de uma região real e um «§6.4» que não existe; isso sai no `lacunas.json` das
regiões de prova, que se publicam — contra o comentário cinquenta linhas acima (`:838-841`). E o
ano dos feriados está cravado (`:854`, `feriados_municipais(2026)`), há lacunas com «(0)», e o
validador produz amostras vazias (`validador.py:200-204`).

- Texto neutro na lacuna; o ano tirado da data da construção; nenhuma lacuna com zero; as amostras
  vazias filtradas.
- Um teste que constrói a prova e procura «§» e números de referência no `lacunas.json`.

**Verifica-se:** o `lacunas.json` das três regiões inventadas só fala delas. — **P · alto**.

### XP-04 · A privacidade diz o que o código faz

- A página de privacidade promete que o sítio «não regista o teu endereço IP»
  (`app/[regiao]/privacidade/page.tsx:60-61,105`; `docs/MEDICAO.md:11,47`; `SECURITY.md:41`). As
  opções `ip:` e `property_denylist: ['$ip']` de `lib/medicao.ts:97-98` não têm efeito na versão
  instalada (a biblioteca di-lo por extenso): quem descarta o IP é a definição do projeto de
  medição, que está ligada (confirmado a 4/10). Tirar as duas opções e dizê-lo como o Coreto o diz —
  o que o código garante e o que depende de uma definição que o repositório não prova.
- A medição só no layout da região, nunca no painel (`<Medicao/>` está no layout de raiz,
  `app/layout.tsx:62`), e um `before_send` que corta a query de `$current_url` e de `$referrer`.
- O `tipo` e o `id` das vistas saem errados em todas as páginas `/rede/…` (`Medicao.tsx:29-30`
  lê `partes[0]` e `partes[1]`): a pergunta «que paragens se consultam» (`docs/MEDICAO.md:26-33`)
  não tem resposta. Corrigir e testar.
- O relatório «Procuras sem resposta» não mostra ligações com uma só ocorrência nem a hora exata da
  última (`admin/regioes/[id]/procuras/page.tsx:125`): numa aldeia, apontam para uma pessoa.
- `docs/MEDICAO.md:79` diz 96 kB; são 52.

**Verifica-se:** um teste das vistas dá `tipo: 'paragens'` e o identificador da paragem; nenhum
evento de medição sai de `/admin`; nenhum endereço enviado leva query. — **P · alto** · aprende com o
Coreto.

### XP-05 · «Horários planeados» diz de quando são os dados

A regra 4 do §4 pede «Horários planeados» com a data dos dados. `MarcaDeDados.tsx:20`,
`AppDoMapa.tsx:961` e `Rodape.tsx:39` dizem «Horários planeados, não em tempo real» sem data; a data
só aparece em `/dados-abertos/`.

- «Horários planeados de 1 de setembro a 31 de dezembro (dados de 28 de setembro)», a partir do
  período (`lib/dias.ts:58-112`) e do `gerado_em`.

**Verifica-se:** a página de uma paragem e a de uma linha mostram a data dos dados no HTML servido
sem JavaScript. — **P · alto**.

### XP-06 · O repositório público fica endurecido como o do irmão

O Paragem.pt é o único dos três que se desenvolve em público, e o que menos se protege. Do Coreto,
sem mudar nada do que o produto faz:

- **Cabeçalhos de segurança globais** em `web/next.config.mjs` — CSP a partir dos anfitriões
  declarados (armazém, motor, medição), `frame-ancestors 'none'` com exceção para `-widget/`,
  `nosniff`, `Permissions-Policy`, `Referrer-Policy` —, começando em *Report-Only*, com um teste aos
  cabeçalhos. O modelo é `coreto/apps/web/next.config.ts:30-173`.
- **A entrada do painel fecha por omissão**: em produção, sem a configuração de que precisa, o
  painel diz «por configurar» em vez de abrir, e o limitador de tentativas e a sessão ficam do lado
  seguro em todos os casos. Os pormenores medidos foram entregues ao dono em privado, como o
  `SECURITY.md` pede para falhas de segurança; os testes puros do limitador já existem.
- **Segredos no CI só no passo que os usa** (`dados.yml` passa a chave de serviço a todo o trabalho,
  `:52-56`); `permissions:` declaradas no `sitio.yml`; ações fixadas por SHA.
- **Dependabot** (npm em `web/` e `disponibilidade/`, uv na raiz, ações), **CodeQL** (gratuito num
  repositório público), **gitleaks** no CI e no pre-commit, `npm audit` e `pip-audit` com limiar.
- **As asserções genéricas da base** do Coreto — RLS em todas as tabelas, nenhuma função
  `security definer` ao alcance do `anon`, nenhuma concessão de escrita — em vez da lista fechada de
  `scripts/schema-checks.sql:216-224`, com as três exceções deliberadas escritas
  (`regiao_publica`, `identificador_de_regiao_valido`, `dominio_normalizado`).
- **O serviço dos expressos** valida o que recebe e limita os pedidos, como o resto do sítio.
- **`security.txt`** por anfitrião, com `Expires`, `Canonical` e uma política de segurança no
  próprio domínio, em vez da página do GitHub.

**Verifica-se:** os cabeçalhos aparecem em `www.paragem.pt`, numa região e em `/admin/entrar/`; o
CodeQL e o gitleaks correm em cada PR; a asserção genérica reprova uma tabela nova sem RLS. —
**M · alto** · aprende com o Coreto.

### XP-07 · O correio do domínio, e as formas de contacto que entregam

Depois do §1.2:

- Endereços de função no `paragem.pt`; `NEXT_PUBLIC_PARAGEM_CONTACTO` definida; a caixa pessoal sai
  de `SECURITY.md`, `AUTORIA.md`, `REUSE.toml`, `pyproject.toml` e `lib/produto.ts:43`, todos ao
  mesmo tempo (o `web/tests/produto.test.mts:22-28` prende-os uns aos outros).
- DNS completo, como o do `coreto.org`: MX, SPF, três DKIM, DMARC começando em `p=none` com
  relatórios e a subir a `p=reject` em quatro semanas, MTA-STS (`mta-sts.paragem.pt` na Vercel e a
  rota copiada do Coreto), TLS-RPT, `iodef` no CAA.
- Uma secção sobre correio no `docs/ALOJAMENTO.md`, e um passo de CI que lê os registos por
  DNS-sobre-HTTPS e falha quando mudam.

**Verifica-se:** um email para `seguranca@paragem.pt` chega; o DMARC publica relatórios; nenhuma
página nem ficheiro do repositório tem a caixa pessoal. — **P · alto** · aprende com o Coreto.

### XP-08 · O briefing e os documentos alcançam o código

O código está à frente da documentação, e o §7 já o disse melhor do que ninguém: «uma frase que o
código desmente é pior do que frase nenhuma».

- **No `CLAUDE.md`**, para o dono aprovar: o §5 diz «Site: Next.js, estático» e que se pode «alojar
  ficheiros e mais nada», o que o §5.3 contraria; o §5.2 e o §10 falam de «duas regiões», e o CI
  constrói três; o §10 diz «um commit», e há 128; o §6 descreve a página inicial como lista, e o
  início é o mapa (a decisão vive só em comentários); o §6 diz «estrutura pronta para EN, ES e FR»,
  e não existe; o §9 pede Lighthouse ≥ 95, e só a acessibilidade o tem (o desempenho tem pisos de
  70 e 40); o §4.7 fala em variáveis de ambiente para o domínio, e o `dominio_env` está morto
  (`regiao.py:376`, `prova/regiao.yaml:58`, `prova-municipio/regiao.yaml:55`); o `#0A5C7A` é «um
  modo e não uma marca», e `web/src/lib/marca.ts:28` chama-lhe `COR_DO_PRODUTO`.
- **73 referências a secções que não existem** («§11.x», «§12», «§6.1»), em 40 ficheiros:
  `ci.yml:20,51,74`, `dados.yml`, `next.config.mjs:2`, `lib/dados.ts:13`, `cli.py:599`, os testes e
  os documentos. Uma correspondência proposta: §11.7 → §5.3; §11.6 → §5.1; §11.5 → §5.2 ou §1;
  §11.3 → §2; §11.1 → §10 ou §7; as do briefing privado retiram-se. E um `check-referencias` no
  pipeline que confirma que cada «§N.M» citado existe.
- **No §7, «de terceiros»**: o rótulo nunca chega a uma descarga, porque `sitio.py:2704` exclui
  todos os `feed-de-terceiro`. Ou se escreve que esses feeds servem o sítio e não se oferecem, ou
  passam a oferecer-se. O mesmo em `README.md:172-173`, `AUTORIA.md:48-49` e
  `-produto/page.tsx:437-439`.
- **Os documentos satélite**: `otp/README.md:3-15` (o motor «deixou de servir» — é opcional e
  responde quando existe); `web/README.md` (`dominio_env`, «a única página que fala com o OTP», «O
  que falta» já feito, sem secção da marca); `disponibilidade/README.md` e `TEMPO-REAL.md:205-208`
  («o sítio são ficheiros estáticos»); `docs/BASE-DE-DADOS.md` (a 0008, «O que vem a seguir» já
  feito); `CONTRIBUTING.md:55` (o comando falha num clone limpo; faltam as verificações da web);
  `SECURITY.md:25-28` (as somas); `docs/NOVA-REGIAO.md` (falta o passo 0, a raiz, e o
  `api-em-direto`); `regioes/prova/regiao.yaml:77` («Três modos» por cima de quatro);
  `ferramentas/verificar-seeds.py:14`; os `LEIA.md` das duas regiões de prova, que o §5.1 exige e
  não existem.
- **O `CONTAS.md`**, citado como «o desenho comum aos dois painéis» (`web/src/lib/painel/entrada.ts:12`,
  a 0010, `docs/BASE-DE-DADOS.md:88`), não existe aqui nem no irmão. Escreve-se uma vez, igual nos
  dois, ou as referências passam a `docs/PAINEL.md`.

**Verifica-se:** o `check-referencias` passa; nenhum documento diz «estático» sobre o sítio. —
**P/M · alto**.

### XP-09 · Os termos dos dados, sem exceções escondidas

- O `_termos` dá «obra da casa» a qualquer `CC-BY*`, `CC0` ou `MIT` **antes** de ver o papel
  (`sitio.py:2457-2459`): um feed alheio em CC BY sairia como «leve-se sem perguntar». Ver o papel
  primeiro.
- Os termos dentro de cada ficheiro, também nos que não são ODbL: o `tap/*.json` da demonstração não
  traz licença nem origem, e o GTFS «para consulta» não traz `attributions.txt`. Um ficheiro levado
  daqui perde a restrição.
- As regiões inventadas são dados, e estão sob uma licença de software (`data/sources.yaml:345,366,396`;
  `REUSE.toml:37-48`): proposta, uma licença de dados (CC0).
- `dados-abertos/[...ficheiro]/route.ts:36-44`: o 302 leva `access-control-allow-origin: *`.
- GTFS-RT: um aviso só de modos sai sem `informed_entity` (`lib/gtfs-rt.ts:83-88`), o que a
  especificação proíbe; preencher com o `agency_id`.
- GBFS: URL absolutos, sem `operator: null`, com `license_url` e a atribuição do OSM quando a saída é
  ODbL (`leitores/gbfs_operadora.py:197-231`), e um validador GBFS no CI.
- `fontes.py:236-241`: com `descarregar=False`, a função descarrega na mesma quando o ficheiro não
  está em cache — numa construção «sem rede» pode puxar o PBF inteiro.

**Verifica-se:** um teste do `_termos` com um feed alheio em CC BY dá «de terceiros»; um `fetch` de
outra origem a um ficheiro de dados abertos funciona. — **P · alto**.

---

## 3. Vaga 1 — A prova pública que corre de verdade

### XP-10 · A base do painel com a disciplina de produção do irmão

As migrações aplicam-se à mão (`db push`), com o carimbo renomeado para a hora a que correu
(`docs/BASE-DE-DADOS.md:150-160`); não há portão, nem cópias, nem ensaio de restauro, nem alarmes de
erro do servidor.

- O `aplicar-migracoes.sh` com somas e registo, o portão «produção em dia» — com uma credencial só
  de leitura — e o fluxo «Publicar», levantados do Coreto (`scripts/aplicar-migracoes.sh`,
  `migracoes-por-aplicar.sh`, `.github/workflows/deploy.yml`).
- Cópia cifrada semanal da base do painel (avisos, contas, auditoria não se reconstroem) e ensaio de
  restauro mensal.
- `instrumentation.ts` com `onRequestError` e um aviso que alguém lê.

**Verifica-se:** o CI responde «a 0010 está aplicada?» sem ninguém abrir a consola; o ensaio de
restauro passa. — **M · alto** · aprende com o Coreto.

### XP-11 · O CI verifica o que diz verificar

- O `pytest` completo corre no trabalho Regiões, depois do `build --sem-rede` (mais cerca de 80 s):
  hoje os testes que precisam de `build/` não correm em sítio nenhum (o Qualidade corre antes da
  construção, `ci.yml:67`; o `dados.yml` só corre três ficheiros).
- `-rs` no `pytest` do `ci.yml:67`, para os saltos aparecerem; `--exigir-validador` no `ci.yml:179`;
  cache do validador de 40 MB no Qualidade.
- **O oráculo volta a correr**: o ciclo (`sitio.yml:286`) percorre `$COM_RUAS`, que vem vazio porque
  nenhuma região desta raiz declara ruas — e o `test_oraculo.py` salta sempre. Dar ruas à
  demonstração. Corrido à mão, o motor diz «sem caminho» nas quatro viagens de aceitação dela.
- O CI avisa alto quando `COM_RUAS` vem vazio ou o `check-numeros` não tem o que conferir (hoje diz
  «sem números de referência» e passa).
- As razões de salto dizem a condição real (`estacao.spec.ts:35` e `modos.spec.ts:163` estão
  erradas), e `procura.spec.ts` salta quando não há mapa em vez de falhar.

**Verifica-se:** o trabalho Regiões corre o oráculo na demonstração e o `pytest` completo, e o
registo mostra cada salto com a razão. — **M · alto**.

### XP-12 · Nenhuma fuga entre anfitriões, provada por HTTP

- Uma guarda de produção para os mapas do ambiente: com `VERCEL_ENV=production`,
  `PARAGEM_DOMINIOS` e os módulos desligados por variável são ignorados (`lib/regiao-host.ts:110-121,
  186-193, 214`; `lib/modulos.ts`) — a lição da escotilha do Coreto.
- O `web/tests/ligacoes.mjs`, que já visita todas as páginas de cada anfitrião, passa a procurar as
  palavras das outras regiões (exportadas pelo `pipeline regioes`) e a conferir que o canónico, o
  sitemap, o manifesto e o cartão de partilha dão a origem do próprio anfitrião.
- A publicação versionada (`publicacao.py:24-28`): um pedido a meio de um envio não lê ficheiros
  novos misturados com velhos.

**Verifica-se:** o rastreio reprova se o nome da demonstração aparecer numa página da prova. —
**P/M · alto** · aprende com o Coreto.

### XP-13 · Next 16, e a cache de página também fora da Vercel

O sítio está no Next 15.5.25, React 19.1.1 e TypeScript 5.7.2, uma versão maior atrás dos irmãos; o
`npm audit` dá um aviso alto no `postcss` embutido no Next (risco de construção, só se corrige no 16).
E, sob `next start`, as páginas de região não ficam em cache de página: o Next decide a ISR com o
caminho de antes da reescrita do middleware. Na Vercel funciona (medido: `MISS` → `HIT`).

- Um PR só de atualização: `middleware.ts` → `proxy.ts`, a assinatura nova de `revalidateTag`,
  `unstable_cache` e as etiquetas por região reconferidos, os `@types` alinhados. A rede de
  segurança são os 221 testes Playwright.
- Um teste que espera `HIT` à segunda visita; repetir a medição depois da atualização; e escrever no
  `docs/ALOJAMENTO.md` o que acontece fora da Vercel.

**Verifica-se:** `npm audit --omit=dev` sem avisos altos; o teste de cache passa. — **M · alto**.

### XP-14 · Um linter de React e de acessibilidade

O projeto não tem ESLint, e o código tem 9 `eslint-disable` que não fazem nada (7 de
`react-hooks/exhaustive-deps`), com componentes de muitos efeitos (`Direccoes.tsx`: 6 `useEffect` e
22 `useState`). ESLint em configuração plana com `react-hooks`, `jsx-a11y` e `@next/eslint-plugin-next`,
a começar em aviso; os `eslint-disable` são o mapa do que rever primeiro. Num produto sujeito ao DL
83/2018, o `jsx-a11y` é barato. — **P/M · médio** · aprende com o Coreto.

### XP-15 · Contratos com esquema

- O JSON que o pipeline escreve e o sítio lê passa por esquemas (zod), em vez de `as T`
  (`lib/dados.ts:93`).
- Um teste de contrato entre as chamadas do painel e as funções SQL: hoje 27 chamadas literais batem
  com as 26 assinaturas, e nada o confere.
- Mais tarde, PostgREST no trabalho Migrações, para os quatro specs `painel-*` que saltam sem base.

— **M · médio**.

---

## 4. Vaga 2 — O que quem viaja sente

### XP-16 · As horas no fuso da região, e não no do telemóvel

`horaDe` e `diaDe` (`lib/otp.ts:185,202`) não passam `timeZone`, e `chaveDoDia` e `horaDoRelogio`
(`lib/dias.ts:177-201`) dizem-no por extenso: «no fuso de quem lê». Tudo isto corre no navegador. Um
telemóvel na hora de Madrid vê as viagens uma hora à frente, e o «Partir agora» procura uma hora
adiante; uma região nos Açores sofreria o mesmo ao contrário. Usar o fuso declarado da região. Há
também dois estilos de hora no produto («10:42» nas viagens, «10h42» nos avisos): escolher um por
contexto e escrevê-lo. — **P · alto**.

### XP-17 · Guardar uma paragem, e funcionar sem rede

O código diz que a rede a falhar na paragem é «o caso normal no interior» (`AppDoMapa.tsx:309`), e o
sítio não tem service worker. A página da paragem já serve o horário completo pelo servidor e
calcula o «A seguir» no navegador, e o planeador corre no navegador a partir da grelha.

- Um service worker escrito à mão, servido por rota em cada anfitrião, como o do Coreto
  (`coreto/apps/web/app/[regiao]/sw.js/route.ts`), instalado só a quem guardou alguma coisa: as
  páginas de paragem e de linha com rede-primeiro e tempo limite; os JSON do planeador em
  *stale-while-revalidate*.
- «Guardar esta paragem» como fotografia datada no aparelho, à maneira do «Guardar para usar sem
  rede» do Em Cada Esquina (sem o mapa), e uma página sem rede que lista o que está guardado, com a
  data e «os avisos podem ter mudado».
- Sem Serwist: o Coreto mostra que um SW à mão chega, e evita as omissões perigosas que o Em Cada
  Esquina encontrou (recarregar quando a rede volta; guardar uma página nova a cada mudança da
  barra de endereços).

**Verifica-se:** um teste Playwright guarda uma paragem, passa a `setOffline(true)`, recarrega e vê o
horário com a data em que foi guardado. — **M/G · alto** · aprende com o Coreto e o Em Cada Esquina.

### XP-18 · O tarifário tem porta, e o início diz o que o §6 pede

- O tarifário só se alcança pelo menu do mapa ou pelo catálogo-início (`CatalogoDaRegiao.tsx:244-251`
  esconde-o atrás de `inicio &&`). Tirar a condição, pô-lo no rodapé, e um «Que bilhete preciso?»
  na paragem, na linha e no concelho.
- Com mosaicos, o início é o mapa, e faltam-lhe o bloco a pedido com o telefone, «Que título me
  serve?» e os concelhos. Uma fila curta na folha de abertura — «Tarifário · Concelhos · A pedido»,
  com o telefone a um toque — e o §6 reescrito com a decisão do mapa (data, razão, o que fica).
- A 404 diz «Ir para o mapa» mesmo onde não há mapa (`not-found.tsx:35-37`) e manda procurar num
  índice sem caixa (`rede/paragens/page.tsx:42-49`): «Ir para o início» e a procura da região ali e
  no índice, como o Coreto faz na 404 dele.

— **P · alto**.

### XP-19 · Partilhar e situar-se

- Partilhar a paragem e a linha (Web Share; os cartões já existem em `[regiao]/cartao/…`), e não só
  a viagem (`Direccoes.tsx:498`).
- Migalhas «A rede › Concelho › Paragem», com o `BreadcrumbList` gerado da mesma trilha, como o
  Coreto (`lib/migalhas.ts`).

— **P · médio** · aprende com o Coreto.

### XP-20 · Acessibilidade: o que os testes ainda não viam

- **O anel de foco** é só um contorno de 3 px em `#F2B705` (`global.css:42,167-170`): dá 1,69:1
  sobre o papel claro (no escuro, 9,7:1). Juntar um halo escuro — o duplo anel do Em Cada Esquina
  (`resistencia/src/app/globais.css:226-231`) —, escrito como acrescento ao §6 e não como troca de
  cor.
- **O traço das linhas no mapa**: `corDoTraco` reutiliza `comContrasteSuficiente`, que devolve sem
  mexer qualquer cor onde o azul-noite passe 4,5:1 (`Distintivo.tsx:77-89,104`); uma linha
  `#FFEB3B` fica a 1,13:1 sobre o fundo, uma `#F2A541` a 1,90:1, e no escuro o `--autocarro` dá
  2,38:1. Medir contra o fundo dos dois temas e garantir 3:1.
- **Tokens de estado próprios**: o aviso «atenção» do cartão do mapa tem o desenho do cartão «a
  pedido» (`global.css:876-886` e `:521-524`), e com deuteranopia `--a-pedido` e `--alerta` ficam a
  ΔE00 2,9. Um `--atencao` separado da cor de modo.
- **A auditoria**: projetos Playwright a 360 e 1280 px nos dois temas (hoje só Pixel 7, 412 px),
  etiquetas `wcag22a/aa` e uma passagem com `label-content-name-mismatch`, e o axe com o menu e o
  cartão de baixo abertos — do `check-a11y.mjs` do Coreto. `forced-colors`.
- **Arrumação**: o `textoSobre` duplicado de `lib/formato.ts:787-807` sai; `MarcaDoProduto` ganha um
  tipo que proíbe duas linhas numa só cor (a regra Optibus só está guardada nas constantes); os
  comentários contraditórios de `global.css:2507-2514`.

**Verifica-se:** um teste mede o anel de foco a ≥ 3:1 nos dois temas; o axe passa nas quatro
combinações. — **P/M · alto** · aprende com o Coreto e o Em Cada Esquina.

### XP-21 · Os avisos chegam a quem não abre o sítio

Os avisos saem em GTFS-RT para máquinas e em `/avisos/` para quem lá vai. Um Atom por região e por
linha, e «Receber no calendário» das alterações planeadas, à maneira do `ReceberNoCalendario` do
Coreto. — **M · médio** · aprende com o Coreto.

### XP-22 · O mapa, por acabar

- A atribuição testada pela visibilidade (`elementFromPoint` no centro de `.maplibregl-ctrl-attrib`),
  e não só pelo texto. A Paragem já a escreve à nascença e a sobe acima das folhas; o Em Cada Esquina
  ensinou a recolhê-la no ecrã estreito sem depender de um arrasto; o Coreto, a dar-lhe 44 px. O
  kit fica completo juntando as três.
- Os mosaicos com versão no endereço (`?v=<md5>`, o inventário já tem o MD5;
  `app/[regiao]/page.tsx:184`, `publicacao.py:52,345`) e cache imutável.
- Um mapa próprio sem atribuição cai na do OSM (`sitio.py:2138-2140`, `Mapa.tsx:387,395`): exigir
  `mapa.atribuicao` em `regiao.py` quando há `mapa.fonte`.
- O crédito «© OpenMapTiles» no mapa e no `docs/TERCEIROS.md`. Os mosaicos seguem o esquema
  OpenMapTiles, que é o que o Planetiler produz (`estilo-mapa.ts:12`), e a licença de desenho dele
  (CC BY 4.0) pede o crédito à vista em quem usa mapas derivados do esquema (confirmado a 4/10 no
  `LICENSE.md` do OpenMapTiles); a atribuição de hoje só nomeia o OpenStreetMap
  (`estilo-mapa.ts:110-111`). O Coreto já o faz (`coreto/apps/web/src/lib/mapa.ts:641-650`).
- Os nomes de água (`estilo-mapa.ts:414-432`: `symbol-placement: line` sobre `water_name` não desenha
  lagos nem albufeiras), e os comentários desmentidos (`estilo-mapa.ts:391-395`, `Mapa.tsx:400-402`).
- O *locale* completo do MapLibre, testado, como o do Coreto (`lib/mapa.ts:609-635`).
- Um teste «o mapa desenha» na demonstração (Chromium com SwiftShader, pedidos `Range` ao PMTiles,
  marcas), à maneira do `check-mapa` do Coreto.

— **P/M · médio** · aprende com o Coreto e o Em Cada Esquina.

### XP-23 · Línguas: decidir, e então fazer a sério

O §6 promete «estrutura pronta para EN, ES e FR», e não há nada: `lang="pt-PT"` fixo, `og:locale`
fixo, cerca de 209 nós de texto português dentro do JSX, nenhum catálogo de frases. E o obstáculo é
estrutural: a região declara a gramática portuguesa (artigos e contrações), e a `prosa.ts` escreve as
frases com ela. Ou se tira a promessa, ou se faz, por esta ordem:

1. as frases da interface para `textos/` com o `porLingua` do Em Cada Esquina (uma frase em falta é
   erro do `tsc`), só em português — já torna a frase do §6 verdade;
2. com o Next 16 (XP-13), `[lingua]` dentro de `[regiao]`, `hreflang` e o que falta traduzir com
   `lang="pt-PT"` e `noindex`;
3. a prosa por língua, e os nomes e artigos da região por língua no pipeline.

Não se traduzem nomes de paragens. As páginas em cache multiplicam-se por quatro. — **G · médio** ·
aprende com o Em Cada Esquina.

### XP-24 · Uma folha para afixar

O horário de uma paragem numa folha A4, com QR para a página, para as câmaras e as juntas afixarem —
à maneira do cartaz semanal do Coreto (`app/[regiao]/cartaz-semanal/[concelho]`, com o QR feito em
casa). — **M · médio** · aprende com o Coreto.

---

## 5. Vaga 3 — Máquinas, descoberta e pontes

### XP-25 · As pré-visualizações chegam a todo o lado

As regiões respondem `Disallow: /` até à Fase 5 (`[regiao]/robots.txt/route.ts:45`). O WhatsApp, o
iMessage e o Signal geram a pré-visualização no telemóvel de quem envia, e por isso o «manda-me o
horário» funciona; mas o X, o LinkedIn e o Slack respeitam o `robots.txt`, e os cartões desenhados
com tanto cuidado não lhes chegam. E um `Disallow` não é um `noindex`: as três regiões inventadas
não têm `noindex` nenhum, e o produto liga para elas.

- Um grupo `Allow` para os pré-visualizadores no `robots.txt` das regiões (`facebookexternalhit`,
  `Twitterbot`, `LinkedInBot`, `Slackbot-LinkExpanding`, `Discordbot`, `TelegramBot`, `WhatsApp`),
  com o teste em `tests/robots.spec.ts`. A decisão do §4 fica intacta.
- `noindex, nofollow` nas três regiões inventadas.
- `og:image:type`; a descrição do produto com 160 caracteres no máximo; `lastmod` no sitemap a
  partir da data dos dados.

**Verifica-se:** o `robots.txt` de uma região deixa ler o `Twitterbot` e mais ninguém; as regiões
inventadas respondem com `noindex`. — **P · alto**.

### XP-26 · O que os modelos de linguagem devem saber antes de responder

Não há `llms.txt` nem política escrita para eles. Um `llms.txt` por região, gerado: os modos que a
região tem e os que não tem, a data dos dados e o período do calendário, «horário planeado, não há
tempo real», os termos de cada ficheiro, e onde está o relatório do que está por confirmar. Outro no
produto. A política no `robots.txt` — separar o treino de modelos da resposta a pedido de uma
pessoa — é decisão do dono (§9). O modelo é o `llms.txt` do Coreto, que diz o que a agenda não
cobre. — **P/M · médio** · aprende com o Coreto.

### XP-27 · Dados estruturados, prontos para a Fase 5

Um `lib/dados-estruturados.ts` à maneira do Coreto (construtores puros e testados, só o que se sabe):
`BusStop`, `TrainStation`, `BusStation` e `TaxiStand` com `geo` e `containedInPlace` (o concelho); a
linha como `ItemList` de paragens; os dados abertos como `Dataset` com a licença de cada ficheiro. Um
catálogo legível por máquina no domínio da região (o `dados-abertos.json` vive só no armazém),
esquemas JSON para `tap/` e `urbanos/`, um `*.csv-metadata.json` ao lado de cada CSV. —
**M · baixo** (sobe na Fase 5) · aprende com o Coreto.

### XP-28 · O planeador aceita «chegar até», e a ponte com a agenda fecha-se

O Coreto já liga as fichas de evento e de espaço ao planeador declarado pela região, pelo contrato
público de `docs/ENDERECOS.md` (`para=lat,lon`, `nome`, `dia`). Falta «chegar até»:

- `chegada=HH:MM` no contrato: no OTP é `arriveBy`; no planeador do navegador pede uma varredura
  inversa (hoje o RAPTOR só procura partidas, `lib/viagens.ts:318`).
- Um teste de contrato com os exemplos do `ENDERECOS.md`, dos dois lados.
- Opcional, declarado por região e nunca no código: «o que há perto» de uma paragem ou de um
  concelho, lido da agenda pública de um território (`agenda_cultural:` no `regiao.yaml`), só com
  factos (título, data, espaço), ligação e atribuição; se a agenda não responder, degrada em
  silêncio.

— **M/G · médio** · ponte entre produtos.

### XP-29 · A recolha identifica-se

- Um `User-Agent` por variável (`Paragem/x (+<produto>/fontes)`) com uma página para quem administra
  as fontes, em vez do agente por omissão (`fontes.py:269`, `validador.py:76`, `motor.py:74`,
  `mosaicos.py:81`).
- Um `pipeline check-robots` que lê o `robots.txt` das fontes automáticas e regista uma lacuna sem
  bloquear: o caso da CP passa a ser medido em cada corrida.
- O domínio cravado no pipeline (`horarios_pdf_operadora.py:670,680,725`, `a_pedido_flex.py:617,642`,
  `stepp.py:908`) e os URL de produção no `dados.yml:246-247` passam a variáveis, como o §4.7 manda.
- O serviço de disponibilidade resolve a região pelo `Host` (`disponibilidade/nucleo.mjs:26-33` lê
  um só `PARAGEM_PAINEL_URL`).

— **P/M · médio** · aprende com o Coreto.

### XP-30 · Leitores registados por pacote

O registo de leitores é uma lista de importações fixas (`leitores/__init__.py:15-70`); o contrato já
existe (`base.py:99-102`) e um leitor em falta já degrada para um bloqueio no relatório
(`construcao.py:91-101`). Uma variável `PARAGEM_LEITORES`, com a semântica de `PARAGEM_RAIZES`:
cada caminho é um pacote com `CONTRATO = 1` e os seus leitores; um nome repetido rebenta; substituir
um leitor do núcleo só com declaração explícita e uma linha no relatório; o `check-regioes` exige que
as regiões inventadas usem só leitores do núcleo. Assim um leitor escrito para a fonte de um cliente
vive na raiz desse cliente, como os dados. O `grelha.py`, o `percursos.py` e o `urbanos.py` são
núcleo: o `sitio.py`, o `verificacoes.py` e o `construcao.py` importam-nos.

**Verifica-se:** com `PARAGEM_LEITORES` vazio, as três regiões inventadas constroem-se e o CI passa.
— **M · médio**.

### XP-31 · Monólitos que concentram o risco

`sitio.py` tem 2827 linhas e 73 funções; `Direccoes.tsx` 1589, `AppDoMapa.tsx` 1219, `viagens.ts`
1199; `global.css` 5141, sem escala tipográfica (24 tamanhos de letra) nem tokens de sombra; as cores
de modo estão escritas em cinco sítios (o CSS, `lib/otp.ts:229-235`, `lib/pontos-no-mapa.ts:27-32`,
`Distintivo.tsx:23`, `Direccoes.tsx:1324`). O `sitio.py` passa a pacote, com um módulo por saída; o
`Direccoes` reparte-se em hooks e componentes de apresentação; as cores de modo vivem num sítio só.
Os 27 testes de direções e os 30 do `test_sitio` seguram a mudança. — **G · médio**.

---

## 6. Licenças

A licença de fundo — a do núcleo, o perímetro do que fica público, a forma dos contributos — tem uma
proposta entregue ao dono. Quando for decidida, escreve-se num `DECISAO-LICENCIAMENTO.md`, com a
ressalva de que o que já saiu fica com a licença com que saiu, e a página do produto («O código e o
nome») diz, com a mesma franqueza do resto do sítio, o que está incluído e o que não está.

O que é seguro fazer já, seja qual for a decisão:

- a pasta `LICENSES/`, com o texto de cada licença referida e das `LicenseRef-*`, e o `reuse lint` no
  CI;
- `"license"` em `web/package.json` e `disponibilidade/package.json`; o `pyproject.toml` com uma
  expressão SPDX (PEP 639);
- um só endereço de autoria, do produto (XP-07);
- o `REUSE.toml` sem a anotação de `pipeline/tests/fixtures/terceiros/**`, que não existe, e com o
  `data/manual/LEIA.md` fora do bloco de terceiros;
- os termos dentro de cada ficheiro de dados e a ordem do `_termos` (XP-09);
- no `AUTORIA.md`, uma secção «Como a obra é feita»: a maior parte dos commits tem um assistente como
  autor e o titular como *committer*, e isso é matéria de titularidade.

---

## 7. As fases do §9 e os passos do §5.3, medidos

| Passo do §5.3 | Estado a 4/10 |
| --- | --- |
| (0) A base, provada num Postgres real | Feito no CI (10 migrações, Postgres 17, cerca de 120 asserções); em produção, as dez aplicadas (confirmado a 4/10; falta o CI sabê-lo, XP-10). |
| (1) Sair da exportação estática | Feito: sem `output`, `revalidate = 3600`, etiquetas por região, `/api/revalidate`. Na Vercel a cache funciona; fora dela, não (XP-13). |
| (2) Uma região por domínio | Feito (`decidir()` puro, alias 308, anfitrião desconhecido → produto). Falta a guarda de produção do ambiente (XP-12). |
| (3) O painel | Feito, com a 0009 e a 0010 aplicadas em produção; falta a autenticação em dois passos. |
| (4) Os módulos a fazerem efeito | Feito, com teste. |

| Fase do §9 | Estado a 4/10 |
| --- | --- |
| 0 Repositório | Feita. |
| 1 Dados | Feita nas três regiões inventadas; o `check-numeros` não confere nada nesta raiz. |
| 2 Motor | Feita do lado privado; aqui o teste de aceitação só conhece a região real e salta; o motor passou a opcional. |
| 3 Sítio mínimo | Feita, com axe e Lighthouse. |
| 4 A pedido e municipais | Feita no essencial; nenhuma região pública exercita o GTFS-Flex. |
| 5 Abertura | O widget está feito; a licença aberta depende da autoridade. |

O §9 não regista o que se fez fora das fases: o painel, as contas, os domínios, a marca, a medição e
o mapa como página inicial.

---

## 8. O que o Paragem.pt ensina, e o que não se transfere

**O que os irmãos copiam daqui:** a proveniência como regra executável; os termos dentro do ficheiro
tirados do código; as regiões inventadas sem rede e o `check-regioes`; as raízes; o motor de cor e as
regras de L*; o `cartao()` e os cartões por entidade; o MapLibre carregado uma vez e os mosaicos
próprios; o Lighthouse com pisos e as especificações de comportamento escolhidas pelos dados; a
procura que perdoa uma letra; o convite que nunca põe o token na barra de endereços.

**O que não se transfere, para o Paragem.pt continuar a ser o Paragem.pt:** o feixe, a régua e o
logótipo-endereço; o tratamento por «tu»; o mapa como página; o tracejado que quer dizer «a pé»; o
rótulo «para consulta» onde esse caso não existe; o amarelo do foco (acrescenta-se-lhe um halo, não
se troca). E o que a Paragem não copia dos irmãos: o cartaz de Abril e o cravo, o toldo e o
lambrequim; a medição zero do Em Cada Esquina não se lhe impõe — é uma decisão diferente.

---

## 9. Decisões do dono

1. Os dois testes de ferramentas (§1.6).
2. As emendas ao `CLAUDE.md` (XP-08), incluindo a página inicial (o mapa) e as línguas.
3. Línguas: tirar a promessa do §6, ou fazê-la (XP-23).
4. A política para modelos de linguagem no `robots.txt`: o treino e a resposta a pedido de uma
   pessoa (XP-26).
5. As regiões indexáveis na Fase 5, e o `noindex` das inventadas (XP-25).
6. Um tema manual além do do sistema (o `EscolherTema` do Em Cada Esquina).
7. A agenda cultural perto da paragem (XP-28), por região.
8. A licença de fundo (§6).

---

## Anexo — A matriz dos três

0 não existe · 1 esboço · 2 funciona com lacunas · 3 sólido · 4 referência a copiar · — não se
aplica.

| Tema | Subtema | Coreto | Paragem | ECE | Quem ensina |
| --- | --- | --- | --- | --- | --- |
| Mapa | Carregamento do MapLibre | 2 | 4 | 3 | Paragem |
| Mapa | Mosaicos próprios | 0 | 4 | 3 | Paragem (geração) e ECE (extração) |
| Mapa | Atribuição | 3 | 3 | 2 | ninguém tem tudo |
| Mapa | Marcas e etiquetas acessíveis | 4 | 4 | 3 | Coreto (DOM) e Paragem (GL) |
| Mapa | Lista sincronizada, ir a pé | 3 | 4 | 4 | ECE |
| Mapa | Teste «o mapa desenha» | 4 | 3 | 2 | Coreto |
| Desenho | Motor de cor testado | 3 | 4 | 2 | Paragem |
| Desenho | Marca por região | 4 | 3 | — | Coreto |
| Desenho | Cartões de partilha | 2 | 4 | 3 | Paragem |
| Experiência | Página inicial | 4 | 3 | 3 | Coreto |
| Experiência | Fluxos | 4 | 4 | 3 | Paragem |
| Experiência | Pesquisa | 3 | 4 | 3 | Paragem |
| Experiência | Estados (vazio, erro, sem rede) | 4 | 3 | 3 | Coreto |
| Experiência | Divulgação progressiva | 3 | 3 | 4 | ECE |
| Experiência | Auditoria de acessibilidade | 4 | 3 | 2 | Coreto |
| Experiência | Testes de comportamento | 1 | 4 | 2 | Paragem |
| Experiência | Línguas | 0 | 0 | 4 | ECE |
| Dados | Termos dentro do ficheiro | 3 | 4 | 3 | Paragem |
| Dados | Registo de fontes e recolha | 4 | 4 | 3 | Paragem (regra) e Coreto (robots) |
| Dados | Saídas para terceiros | 4 | 3 | 1 | Coreto |
| Descoberta | Dados estruturados | 4 | 0 | 0 | Coreto |
| Descoberta | `llms.txt` | 3 | 0 | 0 | Coreto |
| Descoberta | Pré-visualizações | 2 | 4 | 3 | Paragem |
| Engenharia | Qualidade (tipos, lint) | 4 | 2 | 2 | Coreto |
| Engenharia | CI | 4 | 3 | 2 | Coreto |
| Engenharia | Operação (migrações, cópias, alarmes) | 3 | 2 | 1 | Coreto |
| Engenharia | Sem rede (PWA) | 2 | 1 | 3 | ECE |
| Engenharia | Desempenho medido | 3 | 4 | 2 | Paragem |
| Território | Regiões | 4 | 4 | 0 | Coreto (base) e Paragem (ficheiros) |
| Território | Regiões inventadas no CI | 3 | 4 | — | Paragem |
| Correio | Domínio que recebe e se autentica | 4 | 0 | 0 | Coreto |
| Licenças | Cláusula de entrada | 4 | 4 | 1 | Coreto e Paragem |
| Licenças | Reserva de marca | 1 | 4 | 0 | Paragem |
