# O painel

`/admin` é onde quem responde pelo produto liga e desliga o que só faz sentido
em tempo de execução: as regiões, os módulos de cada uma, os domínios, as
licenças. Tudo o que lá se grava passa por uma função da base e deixa linha na
auditoria, com o antes e o depois — nenhuma escrita toca numa tabela por fora
([`BASE-DE-DADOS.md`](BASE-DE-DADOS.md)). É o painel do
[Coreto](https://github.com/fvsalgado/coreto), levantado e reduzido ao que
este produto governa.

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
| `/admin/auditoria/`           | quem fez o quê, quando, com o antes e o depois; recortes por pessoa, ação, tipo e mês; partilhável   | — (lê `admin_actions`)                                      |

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

## Como se entra, e como se guarda

Uma palavra-passe e mais nada. Não há contas nem registo: quem entra é quem
responde pelo produto, e o registo de auditoria escreve `gestor`. Se um dia
houver mais do que uma pessoa, é aí que se acrescentam contas — antes disso,
uma tabela de utilizadores com uma linha era cerimónia.

**Três barreiras, e as três dizem o mesmo** (`web/src/lib/painel/guarda.ts`):

1. **O middleware, à porta.** Sem cookie de sessão válido, `/admin/…` em
   qualquer anfitrião manda para `/admin/entrar/`, com o destino guardado. É
   avaliado antes do encaminhamento por região: o painel é um só e vive fora
   do segmento — `<região>.paragem.pt/admin/` é o painel, não uma página da
   região.
2. **O layout de `app/admin`**, já dentro do servidor, volta a ler a sessão
   antes de servir qualquer leitura. São verificações independentes, de
   propósito: uma apanha o que a outra deixar passar.
3. **Cada ação** volta a exigir a sessão do seu lado, e é o nome dela que vai
   para a auditoria.

A sessão é um cookie assinado (`paragem_admin`, HMAC-SHA256 com o
`ADMIN_SESSION_SECRET`, oito horas, `HttpOnly`, `SameSite=Strict`, só em
`/admin`). O servidor não guarda sessões: trocar o segredo invalida todas de
uma vez, que é o que se quer quando se troca um segredo. A palavra-passe
confere-se com scrypt (32 MiB por verificação) contra o hash em
`ADMIN_PASSWORD_HASH`; a comparação é em tempo constante. Cinco tentativas
falhadas por origem em quinze minutos e a entrada fecha por um quarto de hora
(`rate_limit_hit`, migração 0005) — o endereço nunca se guarda, só um hash
com sal.

**O público degrada, a segurança fecha.** Sem `ADMIN_PASSWORD_HASH` ou
`ADMIN_SESSION_SECRET` o painel não abre — mostra «Painel por configurar» e
mais nada. Sem `SUPABASE_SERVICE_ROLE_KEY` abre e não lê: diz que falta a
chave em vez de mostrar uma lista vazia a fingir que não há regiões. Uma
leitura que falha cai num ecrã que diz «não consegui ler», nunca em «não há
nada» (`app/admin/error.tsx`).

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

As quatro vivem no ambiente do servidor ([`ALOJAMENTO.md`](ALOJAMENTO.md));
nenhuma chega ao navegador. No CI o painel testa-se com uma palavra-passe
gerada por corrida e sem base: o que se prova é o código — as barreiras, a
sessão, os formulários, a acessibilidade —, e a base tem os seus testes no
trabalho `Migrações`.

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
