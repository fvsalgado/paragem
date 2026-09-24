# Como nasce uma região nova

O contrato do Paragem.pt é este: **uma autoridade de transportes nova entra sem
um único commit de código**. O código é um só para todas as regiões; o que faz
uma região existir são os ficheiros em `regioes/<id>/`.

E não é teoria: o CI faz nascer a **Serra da Pedra Alta** em todas as corridas,
constrói-a ao lado das que já existem e verifica que nasce inteira, sem misturar um
byte com a outra. **Se este guia e a prova divergirem, o CI é que tem razão** —
e o guia é que está errado.

## Antes de começar: o que é preciso ter

- O **identificador**: um slug curto e permanente (`prova-municipio`,
  `leziria-do-tejo`). Entra em caminhos e chaves — não muda depois.
- O **artigo** do nome: «**o** Baixo Sável», «**a** Lezíria do Tejo», «**as**
  Terras de Trás-os-Montes». A prosa inteira pendura das contrações e nenhuma
  heurística acerta nos topónimos portugueses; por isso a região declara-o
  (`o`, `a`, `os` ou `as`) e o resto deriva.
- A **autoridade de transportes** e o seu `tipo`: `cim`, `area-metropolitana`
  ou `municipio`. Não tem de ser uma CIM.
- A **lista de concelhos**, com **dois números à cabeça**: quantos são membros
  da autoridade e quantos são servidos. São diferentes mais vezes do que
  parece — há concelhos servidos por uma concessão sem serem membros da
  autoridade que a contratou — e o carregador recusa uma
  lista que não bata com as contagens declaradas.
- A **caixa geográfica** da área de serviço, e a **margem de recorte**. A caixa
  não é um dado sobre o mundo: é o que recorta o OpenStreetMap e o que decide
  que viagens de um feed nacional servem a região. A margem existe porque há
  linhas que atravessam a fronteira, e cortá-las era servir meia viagem.
- Os **modos** que a região tem. Um modo que não esteja na lista não desenha
  secção nenhuma — melhor do que uma secção vazia à espera de dados que não vêm.

Opcional ao nascer, sem bloquear nada:

- tarifário — sem ele, não se anuncia preço nenhum;
- calendário escolar e feriados municipais — sem eles, o gerador projeta só o
  que consegue e o relatório conta o resto;
- marcas e cartaz social — sem ficheiros, a assinatura sai em texto;
- a cor da região (`cor: "#rrggbb"` no `regiao.yaml`) — sem ela, a faixa do
  cabeçalho, a barra do telemóvel e os cartões de partilha vestem o vermelho do
  produto. A tinta por cima não se declara: o sítio escolhe-a pelo contraste.

## Passo 1 — a declaração

Cria `regioes/<id>/` com cinco ficheiros. O caminho mais curto é copiar os da
**prova**, que são deliberadamente mínimos, e trocar os valores:

```bash
cp -r regioes/prova regioes/leziria-do-tejo
```

| ficheiro | o que declara |
| --- | --- |
| `regiao.yaml` | identidade, autoridade, rede, território, caixa, modos |
| `concelhos.yaml` | um por linha, com distrito, código `dico` e se é membro |
| `tarifas.yaml` | títulos, com `confirmado:` e a fonte de cada um |
| `calendario.yaml` | ano letivo, feriados, e as regras dos códigos de serviço |
| `fontes.yaml` | **a receita**: que leitor lê que fonte, e para onde escreve |

Duas regras que não são de estilo:

- **os identificadores de concelho são um espaço global.** Dois concelhos de
  regiões diferentes não podem partilhar o slug, e o
  `uv run pipeline check-regioes` conta. Os nomes de concelho são únicos em
  Portugal; havendo dúvida, desambigua-se com a terra.
- **as caixas geográficas não se sobrepõem.** Também verificado. É o que faz
  com que uma coordenada trocada entre regiões falhe em vez de cair nas duas.

## Passo 2 — as fontes

Cada fonte que a receita usa tem de estar em
[`data/sources.yaml`](../data/sources.yaml), com endereço, data, licença e
atribuição. O `uv run pipeline check-proveniencia` recusa-se a passar sem isso,
e não é burocracia: um dado sem origem não se consegue defender no dia em que
alguém pergunte de onde veio, e nós publicamos horários que as pessoas usam
para apanhar autocarros.

O campo `acesso` decide o que o pipeline pode fazer:

| `acesso` | o que acontece |
| --- | --- |
| `automatico` | descarrega-se, com o endereço usado registado em `.cache/obtencoes.yaml` |
| `manual` | tem de estar em `ficheiro:`. Tentar descarregar levanta exceção |
| `local` | idem, e não tem endereço nenhum |
| `nao-usar` | levanta exceção, com a razão nas notas |
| `proibido-sem-autorizacao` | levanta exceção. É o do Transporte a Pedido |

## Passo 3 — construir

```bash
uv run pipeline build --regiao leziria-do-tejo
uv run pipeline report --regiao leziria-do-tejo
```

O relatório diz o que saiu, o que falta e porquê. **Uma região acabada de nascer
abre com lacunas**, e é o que se espera: o tarifário por confirmar, o calendário
escolar por transcrever, os feriados municipais por preencher. O que não pode
haver é uma lacuna que **bloqueie** — isso quer dizer que não sai feed nenhum.

## Passo 4 — o domínio

O domínio **não se fixa no código** (CLAUDE.md §4.7) — e também não se
adivinha. Cada região responde num subdomínio do produto,
`<subdominio>.paragem.pt`, ou no domínio próprio da autoridade quando o tiver;
e o subdomínio é **declarado** no `regiao.yaml` (`dominio:`), porque um
identificador com hífen não diz como se escreve. As regiões de prova usam o
identificador tal e qual (`prova.paragem.pt`).

A base de dados do painel guarda uma cópia dessa linha em `public.regions`
(ver [`BASE-DE-DADOS.md`](BASE-DE-DADOS.md)). **As migrações só semeiam as
regiões de prova**: a linha de uma região real entra pelo painel —
`/admin/regioes/nova/`, com o identificador, o nome, o artigo e o domínio do
`regiao.yaml`, letra a letra ([`PAINEL.md`](PAINEL.md)) — ou por SQL a partir
da raiz onde a região vive; nunca por uma migração, que vai para o
repositório público. A região nasce **desligada**, e liga-se na ficha dela
quando os dados estiverem no armazém. O CI confere que a base e o
`regiao.yaml` dizem o mesmo. Um segundo endereço entra como alias, na mesma
ficha, e redireciona (308) para o canónico; nunca serve.

**É esta linha que decide onde a região responde.** O middleware do sítio lê
`regions.domain` pela porta pública e reescreve cada pedido a esse domínio
para o segmento da região; cinco minutos depois de a linha entrar, o domínio
responde — sem deploy. Falta só o domínio no projeto da Vercel (Settings →
Domains): um subdomínio de `paragem.pt` fica com DNS e certificado sozinhos;
um domínio da autoridade aponta um CNAME para o que a Vercel indicar. Ver
`docs/ALOJAMENTO.md`, «Um domínio por região». O `dominio_env` do
`regiao.yaml` já não é lido por nada e sai na próxima arrumação.

## Passo 5 — as marcas, quando existirem

Cada região terá a sua pasta em `web/public/logos/<regiao>/`, com um
`PROVENIENCIA.md` a dizer de onde veio cada ficheiro. É a única parte que passa
pelo repositório — servir imagens do sítio da autoridade violava a regra de não
pedir nada a terceiros para desenhar uma página. **Fase 3.**

## A lista de verificação

- [ ] `regiao.yaml` com o artigo certo e os dois números do território
- [ ] `concelhos.yaml` com os slugs únicos entre regiões e o `dico` de cada um
- [ ] Caixa geográfica que não se sobrepõe a nenhuma outra
- [ ] Cada fonte da receita declarada em `data/sources.yaml`
- [ ] `uv run pipeline check-proveniencia` verde
- [ ] `uv run pipeline build --regiao <id>` sem lacunas que bloqueiem
- [ ] `uv run pipeline check-regioes` verde — inclui a busca de fugas
- [ ] `dominio:` declarado no `regiao.yaml`; a linha em `public.regions` criada em «Nova região» no painel (ou por SQL, na raiz da região); o job `Migrações` do CI verde
- [ ] Os dados publicados no armazém, e a região ligada na ficha dela no painel
- [ ] Relatório lido, e o que falta entregue a quem o pode preencher

## Propriedade e licença

O **Paragem.pt** — o nome, o código e o desenho — é de Fábio Salgado. Uma
autoridade de transportes que entre no Paragem.pt promove a **sua** rede: os
dados dela, a marca *dela* ao lado da assinatura do produto. O software
continua a ser um e do seu autor; o nome «Paragem.pt» não é coberto pela
licença do código ([AGPL-3.0-only](../LICENSE)).

É por isso que o produto tem nome próprio e não o nome de uma rede: a marca de
uma rede é da autoridade de transportes que a contratou e da concessionária que
a opera, e **um produto com o nome de um cliente não se licencia ao seguinte**.
Ver [`AUTORIA.md`](../AUTORIA.md).
