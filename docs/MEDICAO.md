# O que se mede

Para uma autoridade de transportes isto não é vaidade. **Os pedidos que não têm
resposta são a lista da procura que a rede não serve** — alguém que escreve
«Covas do Vento → Porto Ameno» e não obtém caminho está a dizer que precisa
dessa ligação. Saber quantos são e para onde é matéria de planeamento de rede,
e é provavelmente o dado mais valioso que este sítio produz.

## A configuração de origem dá MAIS dados e não menos

Sem cookies, sem identificador, sem endereço IP.

Isto parece uma limitação e é o contrário. Um rastreador com identificador é
dado pessoal, e dado pessoal no espaço europeu exige consentimento: um aviso
que metade das pessoas recusa dá metade dos dados. **Sem identificador não há
dado pessoal, não é preciso aviso, e mede-se toda a gente.**

E para o que aqui interessa não faz falta nenhuma saber QUEM procurou — faz
falta saber O QUE se procurou. São perguntas diferentes, e só a segunda planeia
uma rede.

## Os eventos

| evento | o que traz | para que serve |
| --- | --- | --- |
| `$pageview` | `tipo` (paragem, linha, concelho…) e `id` | que paragens e linhas as pessoas consultam |
| `viagem_procurada` | `regiao`, `ligacao` («Covas do Vento → Porto Ameno»), dia, hora, dia da semana, nº de opções, minutos e transbordos da melhor, linhas usadas | a procura, e o que a rede lhe responde |
| **`viagem_sem_resposta`** | `regiao`, `ligacao`, dia, hora, dia da semana | **a procura que a rede não serve** — e o relatório do painel |
| `motor_indisponivel` | a razão | o planeador em baixo — ver `ALOJAMENTO.md` |

O `tipo` e o `id` saem do endereço e vão como propriedades para que um painel
responda «que paragens é que as pessoas mais consultam?» sem ninguém ter de
escrever uma expressão regular sobre URLs.

A viagem sem resposta vai como **evento próprio** e não só como propriedade da
anterior. É de propósito: põe-se num painel sem escrever uma consulta, e isso
aumenta as hipóteses de alguém olhar para ela.

## O que NÃO se mede

- o nome, o email, o telefone de ninguém — nunca são pedidos;
- a localização: o sítio não a pede ao navegador;
- **o que se escreve enquanto se escreve.** O `autocapture` do PostHog está
  desligado: apanharia cliques em elementos com texto lá dentro, e o texto aqui
  são nomes de paragens que a pessoa escreveu;
- a gravação de sessão, desligada;
- o endereço IP;
- **nada nas caixas que as câmaras colam nos sítios delas** (`/widget/…`,
  P4-007). Quem as vê está a visitar o sítio da câmara, e não o nosso: a
  medição nem arranca lá dentro (`Medicao.tsx`). É a promessa da página que
  dá o código — «não mede quem a vê» —, e cumpre-se no código. Uma procura
  feita a partir da caixa «Para onde vais?» abre o planeador no domínio da
  região, e aí mede-se como qualquer outra.

## O relatório no painel (P4-030)

O dado mais valioso — as viagens procuradas sem resposta — ficava no PostHog,
onde a autoridade de transportes não chegava. Quem gere uma região vê-o agora
no painel, em «Procuras sem resposta» (`/admin/regioes/<id>/procuras/`): os
últimos 90 dias, juntos por ligação — «Covas do Vento → Porto Ameno», quantas
vezes, a última —, e quantas das viagens procuradas ficaram sem resposta. Nada
que identifique alguém: só os nomes das paragens, que são públicos, e
contagens.

O painel pergunta ao PostHog pela API de consultas (HogQL), do lado do
servidor, com uma **chave pessoal só de leitura** (`POSTHOG_CHAVE_PESSOAL`,
âmbito `query:read`) e o número do projeto (`POSTHOG_PROJETO`) —
[`ALOJAMENTO.md`](ALOJAMENTO.md). A chave do sítio não serve: só escreve
eventos, e é pública. **Não é um serviço novo**, é a mesma medição lida do
outro lado; sem as duas variáveis, a página diz quais faltam.

Os eventos de uma região reconhecem-se pela propriedade `regiao`, que o
planeador manda desde o lote 8, e pelo domínio de onde vieram (`$host`) — o
principal e os que levam a ele —, para os anteriores. Só o domínio não chegava:
muda quando a região muda de endereço.

## O que a medição custa a quem a usa

Nada no caminho da página. A biblioteca do PostHog (96 kB comprimidos) só se
descarrega quando há chave, e só depois de a página acabar de carregar e de o
navegador ficar livre (`web/src/lib/medicao.ts`); o que se conta antes disso
espera numa fila, com a hora a que aconteceu. E não vai buscar scripts de fora
— nem o dos inquéritos, que não há (`disable_surveys`,
`disable_external_dependency_loading`): no início da região real eram 35 kB
que ninguém usava.

## Se um dia for preciso seguir a mesma pessoa

Funis de conversão, coortes, «quantos dos que procuraram voltaram» — isso exige
um identificador, e o identificador muda tudo:

1. **Aviso de consentimento**, com recusa tão fácil como aceitação. O ePrivacy
   exige-o para guardar seja o que for no dispositivo que não seja estritamente
   necessário, e análise de utilização não é estritamente necessária.
2. **Base legal declarada** na política de privacidade — e para uma entidade
   pública o interesse legítimo é terreno mais escorregadio do que para uma
   empresa.
3. **Contrato de subcontratação** com quem processa.
4. E menos dados: só de quem aceitar.

O interruptor existe e está desligado:

```
NEXT_PUBLIC_PARAGEM_MEDICAO_IDENTIFICADA=1
```

Ligá-lo **sem fazer os três primeiros pontos é ilegal**, e a página de
privacidade passa a dizer que o sítio segue as pessoas entre visitas — o que é
verdade e é o mínimo, mas não substitui o consentimento.

## A configuração

| variável | o que é |
| --- | --- |
| `NEXT_PUBLIC_PARAGEM_POSTHOG` | a chave do projeto (é pública, vai no código do navegador) |
| `NEXT_PUBLIC_PARAGEM_POSTHOG_HOST` | o servidor; por omissão `https://eu.i.posthog.com` |
| `NEXT_PUBLIC_PARAGEM_MEDICAO_IDENTIFICADA` | `1` para seguir pessoas — ver acima |

**Sem a chave, não se mede nada.** Não é uma falha: o sítio funciona igual, e
uma construção local ou de pré-visualização não tem por que sujar os dados de
produção.

## A página que diz isto a quem visita

`/privacidade/` existe **mesmo na configuração sem cookies**, em que não há
dado pessoal e a lei não obrigaria a nada. Dizer o que se recolhe quando não se
é obrigado é o que distingue não recolher dados pessoais de dizer que não se
recolhem.
