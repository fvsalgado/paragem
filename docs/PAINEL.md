# O painel

`/admin` é onde se liga e desliga o que só faz sentido em tempo de execução:
as regiões, os módulos de cada uma, os domínios, as licenças — e onde a
autoridade de transportes de cada região escreve os seus avisos. Cada pessoa
entra com o seu email e a sua palavra-passe, e vê só as regiões onde tem um
papel. Tudo o que lá se grava passa por uma função da base e deixa linha na
auditoria, com o antes, o depois e o nome de quem o fez — nenhuma escrita toca
numa tabela por fora ([`BASE-DE-DADOS.md`](BASE-DE-DADOS.md)). É o painel do
[Coreto](https://github.com/fvsalgado/coreto), levantado e reduzido ao que
este produto governa, com o mesmo desenho de contas.

**O painel não publica dados.** Os horários, as paragens, os mosaicos são do
pipeline, que os sobe para o armazém e avisa o sítio. O que o painel muda faz
efeito sem publicação nenhuma: em cinco minutos, no máximo, que é a memória do
mapa de domínios no middleware.

## O que se faz lá

| onde                          | o quê                                                                                                | função da base                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `/admin/`                     | as regiões, quantas e em que estado; «Nova região»; «Revalidar o sítio»                              | —                                                           |
| `/admin/regioes/nova/`        | a linha de uma região nova, **desligada** à nascença                                                 | `create_region`                                             |
| `/admin/regioes/<id>/`        | ligar e desligar a região                                                                            | `set_region_enabled`                                        |
|                               | mudar o domínio canónico, com o antigo a ficar como alias                                            | `set_region_domain`                                         |
|                               | acrescentar e retirar alias (redirecionam, nunca servem)                                             | `add_region_alias`, `remove_region_alias`                   |
|                               | ligar e desligar cada um dos sete módulos                                                            | `set_modulo`                                                |
|                               | registar uma licença — uma linha por contrato ou renovação                                           | `add_region_license`                                        |
| `/admin/regioes/<id>/avisos/` | escrever, corrigir, publicar, retirar e apagar avisos                                                | `upsert_aviso`, `set_aviso_publicado`, `delete_aviso`       |
| `/admin/pessoas/`             | convidar uma pessoa, os papéis dela por região, uma ligação nova, desativar                          | `create_pessoa`, `set_papel`, `create_convite`, `set_pessoa_ativa` |
| `/admin/ativar/?t=…`          | quem foi convidado escolhe a palavra-passe e entra                                                   | `ativar_com_convite`                                        |
| `/admin/auditoria/`           | quem fez o quê, quando, com o antes e o depois; recortes por pessoa, ação, tipo e mês; partilhável   | — (lê `admin_actions`; quem gere uma região, por `acoes_das_regioes`) |

Três regras que o painel herda da base e mostra a quem carrega no botão:

- **nunca se desliga a última região ligada** — a base recusa, o painel diz;
- **um alias nunca é um canónico**, nem de outra região; promover um alias a
  canónico tira-o da lista dos alias;
- **o nome e o artigo não se editam** — são identidade da região e vivem no
  `regiao.yaml` dela; a base guarda uma cópia que o CI confere
  (`ferramentas/verificar-seeds.py`). Um módulo que a região não declara no
  `modos:` não tem interruptor: desligar o que não existe é sinal de que alguém
  confundiu regiões.

### Os avisos, e porque é que publicar é um botão à parte

Um aviso — uma supressão, um desvio por obra, uma greve — **nasce por
publicar**. Quem o redige a meio de uma ocorrência não devia ter de escolher
entre gravar a meio e mostrar a meio, e por isso gravar e publicar são dois
gestos, com duas funções e duas linhas diferentes na auditoria. Quem depois
perguntar «porque é que este aviso esteve no ar entre as 7h e as 9h» tem a
resposta separada de uma correção de gralha.

Publicado **e em vigor**, um aviso aparece em três sítios ao mesmo tempo: na
página de avisos da região, na faixa do catálogo, e em
`<dominio>/gtfs-rt/alerts.pb`, que é o feed GTFS-RT Service Alerts que outras
aplicações leem. Publicar invalida a cache da região: a visita seguinte já o
mostra.

**Um aviso é sobre o que esta autoridade GERE.** É a mesma regra que tira os
feeds de terceiros das descargas, e vale pela mesma razão: um modo alimentado
só pelo feed de outra entidade — o operador ferroviário, o de expressos —
aparece no sítio porque quem viaja não tem de saber quem gere o quê, mas um
aviso nosso sobre o serviço dele é republicar informação que ele publica nos
canais dele, por que responde, e que pode desmentir uma hora depois sem nos
dizer. Quem gere o serviço é quem avisa sobre ele.

Sai da receita da região e não de uma lista escrita no código
(`modos_de_terceiros`, em `regiao.json`): o formulário só oferece os modos
próprios, e a ação recusa os outros — e recusa também uma linha de um operador
de fora, ou um identificador de linha que não existe, que é a falha mais
silenciosa desta página (o aviso fica publicado e não aparece a ninguém). Um
modo sem feed nenhum — bicicletas, táxis, urbanos municipais — é compilado por
nós de fontes abertas, e sobre esse a autoridade da região escreve.

Três coisas que o formulário diz e convém saber antes:

- **as horas são de parede, no fuso declarado** (`PARAGEM_FUSO`, por omissão
  `Europe/Lisbon`). O servidor corre em UTC; sem isto um aviso das 8h ficava
  guardado uma hora adiantado no verão, sem erro nenhum;
- **em branco no fim quer dizer «não se sabe quando acaba»**, que é o caso mais
  honesto numa avaria, e é assim que sai no feed. Não se inventa um fim.
  Passado o fim declarado, o aviso deixa de aparecer sozinho;
- **sem linhas, paragens nem modos quer dizer «a rede toda»** — é o que a
  especificação manda, é raro, e convém ser de propósito.

**Retirar não é apagar.** Retirar é «isto deixou de ser verdade»; apagar é
«isto nunca devia ter sido escrito». Apagar guarda o aviso inteiro na
auditoria: apagar não é esquecer.

### O que um módulo desligado tira do sítio

O interruptor é do painel; o efeito é do sítio, e está num sítio só:
`regiao()` em `web/src/lib/dados.ts` devolve os modos da região **já sem** os
desligados, e cada leitor de um modo respeita o dele. Desligar `comboio` numa
região tira, à próxima visita a cada página:

- o cartão da grelha «Por modo», a pílula e os pontos no mapa, os sítios da
  procura e do «Perto de ti» — os do OpenStreetMap ficam, que não são
  transportes;
- a página do modo (`/modos/<modo>/`, `/rede/estacoes/`, `/a-pedido/`), que
  passa a 404 como qualquer página que não existe;
- a contagem e a secção dele na página de cada concelho;
- o ficheiro dele em «Dados e licenças»;
- as viagens das linhas dele no planeador — a rede fica sem elas, em vez de
  se esconderem à saída.

O painel invalida as páginas da região ao mexer no interruptor; sem sinal,
cinco minutos. E o público degrada: com a base em baixo não se desliga nada.
Nos testes, sem base, `PARAGEM_MODULOS_DESLIGADOS=prova=taxi` desliga os
táxis da região de prova e `web/tests/modulos.spec.ts` prova cada uma das
frases acima.

### Uma região nova, passo a passo

1. A declaração em `regioes/<id>/` e a construção
   ([`NOVA-REGIAO.md`](NOVA-REGIAO.md)); o pipeline publica-a no armazém.
2. «Nova região» no painel, com o identificador, o nome, o artigo e o domínio
   **do `regiao.yaml`, letra a letra**. Nasce desligada.
3. O domínio no projeto da plataforma (Settings → Domains), e no DNS se for
   da autoridade ([`ALOJAMENTO.md`](ALOJAMENTO.md), «Um domínio por região»).
4. «Ligar a região» na ficha. Cinco minutos depois o domínio responde.

### O dia em que a autoridade traz o domínio dela

Na ficha, «Mudar o domínio canónico» com «o domínio antigo fica a
redirecionar» ligado: as ligações que andam por aí continuam a chegar (308).
Depois, o `dominio:` do `regiao.yaml` — o CI reprova enquanto os dois
disserem coisas diferentes — e o domínio novo no projeto da plataforma.

## Quem entra, e o que cada um pode

Cada pessoa entra com **o seu email e a sua palavra-passe** (migração 0009), e
tem **papéis por região**. É o mesmo desenho do painel do Coreto:

| papel      | onde        | o que faz                                                                                   |
| ---------- | ----------- | ------------------------------------------------------------------------------------------- |
| **dono**   | tudo        | regiões, domínios e alias, licenças, pessoas, «Atualizar as páginas do sítio», a auditoria inteira |
| **gestor** | uma região  | a ficha dela: os módulos, os avisos, os contactos da declaração e da privacidade, a procura, o rasto dela |
| **editor** | uma região  | os avisos dela — escrever, publicar, retirar, apagar                                         |

Domínios, alias, licenças, criar e desligar regiões e gerir pessoas ficam com
o dono: são decisões comerciais e de infraestrutura. Uma pessoa **só vê as
regiões onde tem papel**: as outras, as licenças, as pessoas e a ficha de uma
região onde só edita avisos respondem 404 — nem se confirma que existem. Quem
tem uma região só entra direto nela (a ficha, se gere; os avisos, se edita);
quem tem várias tem um seletor de região no cabeçalho.

**O dono não muda de chave.** A palavra-passe do ambiente
(`ADMIN_PASSWORD_HASH`) continua a ser a dele, e a porta dele não passa por
tabela nenhuma da 0009 — é isso que garante que ninguém fica trancado fora no
dia em que as contas chegam a produção. Com `ADMIN_EMAIL` definido, entra com
esse email; sem ele, com qualquer email e a palavra-passe dele, como entrava
antes. **Define-o**: é o que tira o dono do caminho de quem escreve outro
email.

### Convidar, ativar, recuperar

1. O dono, em «Pessoas», escreve o nome, o email e o papel em cada região.
2. O painel gera uma **ligação de ativação** de uso único, válida sete dias, e
   mostra-a **uma vez**, com um botão de copiar. A base guarda só o sha256 do
   token. **Não sai correio nenhum do painel**: o dono envia a ligação pelo
   meio que usa com aquela pessoa.
3. A pessoa abre `/admin/ativar/?t=…`, escolhe a palavra-passe (12 caracteres
   ou mais) e entra.
4. Esqueceu-se dela? O dono gera uma ligação nova na ficha da pessoa; a
   palavra-passe antiga vale até a nova ser escolhida, e a ligação anterior
   deixa de servir.

**Desativar não apaga**: a pessoa deixa de entrar no clique seguinte (os
papéis e a pessoa leem-se da base em cada pedido, sem memória), as ligações por
usar caem, e o nome dela fica em tudo o que fez, na auditoria.

### Como se guarda

**Três barreiras, e as três dizem o mesmo** (`web/src/lib/painel/guarda.ts`):

1. **O middleware, à porta.** Sem cookie de sessão válido, `/admin/…` em
   qualquer anfitrião manda para `/admin/entrar/`, com o destino guardado — a
   entrada e a ativação são as duas portas que abrem sem sessão. É avaliado
   antes do encaminhamento por região: o painel é um só e vive fora do
   segmento — `<região>.paragem.pt/admin/` é o painel, não uma página da
   região.
2. **O layout de `app/admin`** — e cada página —, já dentro do servidor, volta
   a ler a sessão, a pessoa e os papéis dela na base antes de servir qualquer
   leitura. São verificações independentes, de propósito: uma apanha o que a
   outra deixar passar.
3. **Cada ação** volta a exigir a sessão **e o papel** do seu lado, antes de
   escrever — a página só mostra o botão a quem pode, mas uma ação de servidor
   recebe o que lhe mandarem. É o nome dela («Ana Silva · ana@…») que vai para
   a auditoria. Um aviso publicado, retirado ou apagado tem ainda de ser da
   região que a ação diz: sem isso, quem edita os avisos de uma região mexia
   nos de outra trocando um identificador.

A sessão é um cookie assinado (`paragem_admin`, HMAC-SHA256 com o
`ADMIN_SESSION_SECRET`, oito horas, `HttpOnly`, `SameSite=Strict`, só em
`/admin`) que diz quem é (`sub`: o identificador da pessoa, ou `dono`) e leva a
**impressão da palavra-passe** em vigor quando se entrou. O servidor confere-a
em cada pedido — contra a base, numa pessoa; contra o ambiente, no dono —, e
por isso **uma palavra-passe nova expulsa quem estava dentro com a antiga**. A
assinatura fica só com o segredo, que é o que o middleware consegue conferir no
edge, sem base. Trocar o segredo invalida todas as sessões de uma vez.

As palavras-passe conferem-se com scrypt (32 MiB por verificação), em tempo
constante; o trabalho é o mesmo exista o email ou não, e a frase de erro também
(«Email ou palavra-passe incorretos.»). O **limite conta só as tentativas
falhadas**, por origem e por email: cinco num quarto de hora e essa origem — ou
esse email, venha de onde vier — espera um quarto de hora; uma entrada certa
limpa a contagem. Nem o endereço nem o email se guardam, só hashes com sal.

**O público degrada, a segurança fecha.** Sem `ADMIN_PASSWORD_HASH` ou
`ADMIN_SESSION_SECRET` o painel não abre — mostra «Painel por configurar» e
mais nada. Sem `SUPABASE_SERVICE_ROLE_KEY` abre só ao dono e não lê: diz que
falta a chave em vez de mostrar uma lista vazia a fingir que não há regiões.
Uma leitura que falha cai num ecrã que diz «não consegui ler», nunca em «não há
nada» (`app/admin/error.tsx`).

### A transição: o sítio antes da migração 0009

O sítio vai para o ar antes de a 0009 ser aplicada à base de produção, e
funciona assim: as tabelas das pessoas não existem, e o painel abre **ao dono,
como hoje** — com a palavra-passe de sempre e qualquer email —, sem erro
nenhum. «Pessoas» diz que a instalação ainda não tem contas; o limite de
tentativas conta como contava (todas, por origem) até as funções novas
existirem. Aplicada a 0009, tudo isto muda sozinho, sem deploy. A 0009 aplica-se
como as outras ([`BASE-DE-DADOS.md`](BASE-DE-DADOS.md)): o ficheiro, o CI
verde, e só depois o `db push`.

## Configurar

```bash
cd web
printf '%s' 'a-palavra-passe' | node scripts/senha.mjs   # dá o ADMIN_PASSWORD_HASH
```

| variável                    | o que é                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD_HASH`       | `scrypt$N$r$p$sal$hash`, do script acima. Cada execução dá um valor diferente — o sal é novo             |
| `ADMIN_SESSION_SECRET`      | 32 caracteres ou mais, ao acaso. Trocar invalida as sessões abertas                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | uma chave **secreta** do projeto Supabase, criada só para o painel («painel»). Nunca `NEXT_PUBLIC_`     |
| `IP_HASH_SALT`              | 16 caracteres ou mais: o sal dos hashes de origem. Sem ele vale um sal escrito no código — que é público |
| `ADMIN_EMAIL`               | opcional, e recomendada: o email do dono. Com ela, a palavra-passe do ambiente só entra com este email   |

Vivem no ambiente do servidor ([`ALOJAMENTO.md`](ALOJAMENTO.md)); nenhuma
chega ao navegador. No CI o painel testa-se com uma palavra-passe gerada por
corrida e sem base: o que se prova é o código — as barreiras, a sessão, os
formulários, a acessibilidade —, e a base tem os seus testes no trabalho
`Migrações`. A prova de ponta a ponta das contas — uma pessoa da região A não
vê nem escreve na B, nem chamando as ações do servidor com o formulário
adulterado — precisa da base, e corre com ela localmente
(`web/tests/painel-contas.spec.ts`); sem base, salta e diz porquê.

## O que o painel NÃO faz, de propósito

- **Não constrói dados.** «Revalidar o sítio» manda deitar fora as páginas em
  cache — o mesmo sinal que o pipeline manda no fim de publicar — para o dia
  em que o aviso se perdeu. Reconstruir é o fluxo `Dados`, à segunda-feira ou
  à mão.
- **Não toca na plataforma.** O domínio no projeto da Vercel e o DNS são
  passos à parte, e o painel di-lo em cada aviso.
- **Não edita a identidade de uma região.** Ver acima.
- **Não inventa avisos.** O painel é onde a autoridade de transportes escreve
  os dela. Um aviso de exemplo publicado é um aviso falso — e uma região sem
  avisos é o estado normal, não uma página por acabar.
