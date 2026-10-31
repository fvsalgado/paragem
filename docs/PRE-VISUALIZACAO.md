<!--
SPDX-FileCopyrightText: 2026 Fábio Salgado <correio@paragem.pt>
SPDX-License-Identifier: AGPL-3.0-only
-->

# Produção e pré-visualização

Há dois sítios a correr, e cada mudança passa pelos dois, por esta ordem:

| ramo | o que é | onde se vê |
| --- | --- | --- |
| `pre` | a **pré-visualização**: o que ainda não está no ar | `pre.<domínio do produto>` e `<região>.pre.<domínio do produto>`, por trás do início de sessão da Vercel |
| `main` | a **produção**: o sítio público | os domínios de cada região e o do produto |

## O caminho de uma mudança

1. A mudança faz-se num ramo de trabalho e abre um PR **para `pre`**. O CI
   corre como corre para o `main`.
2. Fundido, a Vercel publica o `pre`. O dono abre os endereços com a marca e
   confere: as páginas, as regiões, o que mudou.
3. Com o sim do dono, abre-se um PR de `pre` para `main`. Fundido, vai para o
   ar.

Nada chega ao `main` sem ter passado pelo `pre`. Uma correção urgente segue o
mesmo caminho, só mais depressa.

## Os endereços da pré-visualização

A marca é o rótulo `pre`, e tira-se para saber o que o endereço representa
(`web/src/lib/pre-visualizacao.ts`):

- `pre.<domínio do produto>` é a página do produto;
- `<região>.pre.<domínio do produto>` é a região de `<região>.<domínio do produto>`;
- um alias com a marca mostra a região dele em vez de redirecionar — o 308
  levava para o domínio de produção, para fora da pré-visualização. É assim
  que se pré-visualiza uma região que, em produção, vive num domínio da
  autoridade de transportes: pelo alias dela debaixo do domínio do produto.

Não se configura nada por região: uma região nova tem endereço de
pré-visualização no dia em que tem o de produção. A marca só quer dizer
alguma coisa na pré-visualização; em produção, um anfitrião `pre.…` é um
desconhecido como outro qualquer e vê a página do produto.

As ligações para **outras** regiões e para a página do produto continuam a
levar aos domínios de produção: são as que o sítio escreve, e a
pré-visualização não as reescreve.

## O que a pré-visualização não faz

- **Não escreve.** Lê os mesmos dados que a produção — os ficheiros do
  armazém e a base pela porta pública —, porque uma mudança só se confere com
  os horários a sério. Por isso o painel não abre lá («Painel fechado na
  pré-visualização»), e a porta de serviço da base recusa mesmo que o
  alojamento lhe dê a chave (`web/src/lib/painel/base.ts`).
- **Não se indexa.** Todas as respostas levam `X-Robots-Tag: noindex`, além de
  estarem por trás do início de sessão da Vercel.
- **Não mede.** A chave da medição só existe em produção.
- **Diz que é.** Uma faixa no topo de todas as páginas
  (`web/src/componentes/FaixaDePreVisualizacao.tsx`).

Quem decide se um deployment é pré-visualização é a plataforma
(`VERCEL_ENV=preview`). Fora dela, `PARAGEM_PRE_VISUALIZACAO=1` liga o modo à
mão, para o ver a correr numa máquina qualquer.

## O que o alojamento precisa, uma vez

- **Os domínios**, no projeto da Vercel (Settings → Domains), atribuídos ao
  ramo `pre`: `pre.<domínio do produto>` e `*.pre.<domínio do produto>`. Com o
  domínio na Vercel, o DNS e os certificados ficam sozinhos.
- **As variáveis**: as de leitura em «Preview» (`NEXT_PUBLIC_PARAGEM_DADOS`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_PARAGEM_PRODUTO`), e as do painel e de escrita **só** em
  «Production» ([`ALOJAMENTO.md`](ALOJAMENTO.md)).
- **A proteção** das pré-visualizações ligada (Settings → Deployment
  Protection → Vercel Authentication), que é o que as fecha a quem não tem
  conta na equipa.
