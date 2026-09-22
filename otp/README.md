# OpenTripPlanner — a ferramenta de construção

> **O MOTOR DEIXOU DE SERVIR QUEM VIAJA.**
>
> Passou a responder **uma vez por construção**, e o que ele responde é que
> viaja com o sítio. O planeamento de viagens corre agora no navegador de quem
> pergunta, a partir de uma grelha horária de 321 kB — ver
> `web/src/lib/viagens.ts`.
>
> **Porque é que mudou.** O planeador nunca funcionou em produção. A entrega
> cravava `http://127.0.0.1:8801` — o OTP do runner do CI — no JavaScript que
> ia para o telemóvel, e o telemóvel tentava falar consigo próprio. E mesmo
> corrigido, faltava a máquina: para esta região o OTP precisa de 620 MB
> sempre de pé, e isso é um servidor a manter e a pagar para sempre, por cada
> região licenciada.
>
> **O que ele continua a fazer, e é insubstituível:**
>
> 1. **Os transbordos a pé.** `uv run pipeline transbordos` pergunta-lhe quanto
>    se leva a pé entre cada par de paragens vizinhas — 7 172 pares nesta
>    região —, pelas ruas a sério. A resposta são 34 kB e vai com o sítio, por
>    isso os transbordos mantêm precisão de rua sem o grafo de 104 MB.
> 2. **O oráculo.** Em cada corrida responde às viagens de aceitação do §9 e
>    compara-se com o que o planeador do navegador responde
>    (`web/tests/oraculo.mts`). Apanhou logo um erro de 103 minutos: as horas
>    dos expressos vêm em UTC e estavam a ser lidas como se fossem de Lisboa.
> 3. **O fator de desvio.** Da comparação entre o que ele responde e a linha
>    reta sai a mediana — **1,115** nesta região — que é o que se usa para
>    estimar o troço a pé até à primeira paragem. Medido, e não inventado.
>
> E apanhou-se uma coisa que o oráculo **não** podia resolver sozinho: há uma
> viagem Lisboa→Aveiro que passa em Fátima às 10:25 e em Pombal às 11:00, está
> no GTFS, corre nesse dia, e o OTP não a devolve nem pedindo-lhe vinte
> itinerários. Comparar só com outro programa herda os buracos desse programa
> — por isso cada perna é também conferida contra o ficheiro em bruto, no
> `pipeline/tests/test_oraculo.py`.

## Quanta memória é precisa, medido

O `-Xmx6G` que estava escrito nunca tinha sido medido. Com as cinco viagens do
§9, sobre o grafo desta região (104 MB):

| `-Xmx` | arranca | resultado | RSS |
| --- | --- | --- | --- |
| 1 GB | 14 s | as mesmas 19 opções | 1 047 MB |
| 512 MB | 14 s | as mesmas 19 opções | 756 MB |
| 384 MB | 14 s | as mesmas 19 opções | **621 MB** |
| 256 MB | morre a carregar | `OutOfMemoryError` | — |

**Servir cabe em 620 MB, e a memória a mais não compra resposta nenhuma.**
Construir o grafo é outra coisa: chega aos ~4,1 GB de pico, e é por isso que se
constrói no CI e não na máquina que serve.


O OTP 2.6.0, a correr sobre o que o `uv run pipeline build` produz. A versão
está **fixada** aqui e em `pipeline/src/paragem/motor.py`, e há um teste que
confirma que as duas dizem o mesmo — duas versões fixadas em dois sítios
divergem no dia em que uma sobe.

## Como se corre

```bash
uv run pipeline build --regiao <a-tua-regiao>    # os dados
uv run pipeline grafo --regiao <a-tua-regiao>    # o grafo
PARAGEM_REGIAO=<a-tua-regiao> docker compose -f otp/docker-compose.yml up motor
```

O `pipeline grafo` monta a pasta que o OTP lê, escreve as duas configurações e
constrói. Não é um passo à mão guardado no histórico de alguém: é um comando do
pipeline, como o `build` (CLAUDE.md §4.6).

**Os testes não passam pelo Docker.** O `docker-compose.yml` é para quem aloja;
os testes correm o mesmo jar diretamente, porque um teste tem de poder correr
onde não há daemon de Docker — e o ambiente de construção é um desses sítios.

## O que a região declara, e o que o código não sabe

Nada aqui sabe que regiões existem. A receita da região tem um bloco `motor:`
com o fuso, que feeds entram no grafo, e **as viagens que a região exige que o
motor saiba responder** — que são o critério de aceitação da Fase 2 (§9).

As coordenadas dessas viagens vêm das paragens do próprio feed, e há um teste
que o confirma. Não é preciosismo: na primeira versão três das dez estavam
escritas de memória e caíam 69, 156 e 239 m fora da paragem que diziam ser. A
239 m o motor parte de outra paragem e responde uma coisa sobre outra, sem dar
erro nenhum.

## Duas coisas que o OTP ensinou sobre os dados

**Os feeds não concordam no fuso.** O da rede e o da CP declaram
`Europe/Lisbon`; o da FlixBus declara `UTC`, que é uma escolha legítima num
feed pan-europeu — as horas de cada viagem interpretam-se no fuso da agência
dela. Sem `transitModelTimeZone` no `build-config.json`, o OTP recusa-se a
construir:

```
The graph contains agencies with different time zones: [Europe/Lisbon, UTC]
```

A resposta **não** é reescrever o `agency_timezone` da FlixBus. O §5 diz que um
feed de terceiro sai como veio, e mexer-lhe fazia com que ninguém conseguisse
dizer se uma diferença veio dele ou de nós. Diz-se ao motor qual é o fuso de
casa; cada agência mantém o seu, e o OTP converte.

**Uma chave de configuração mal escrita é ignorada em silêncio.** Foi assim que
`osmDefaults.timeZone` pareceu resolver o conflito de fusos e não resolvia. Por
isso a construção corre sempre com `--abortOnUnknownConfig`: uma chave que o
OTP não conheça passa a ser erro, com o nome dela à frente.

## O que responde hoje

Num dia útil, com a janela de doze horas:

| viagem (§9) | resposta |
| --- | --- |
| Fátima (Santuário) → Tomar | 61 min, linha 510, sem transbordo |
| Torres Novas (Terminal) → Entroncamento (Estação) | 22 min, linha 684 |
| Rossio ao Sul do Tejo (Estação) → Abrantes (Hospital) | 4 min, linha 6024 |
| Ourém → Fátima | 21 min, linha 986 |
| Sertã → Tomar | **sem caminho** — ver abaixo |

O grafo: **98 MB, 102 segundos, pico de ~4,1 GB** com `-Xmx6G`.

### A janela de procura, que é a decisão que mais pesa

Por omissão o OTP calcula a janela sozinho. Medido aqui, para Torres Novas →
Entroncamento às 09:00 — uma ligação com **catorze viagens nesse dia**:

```
sem janela declarada   searchWindowUsed = 3000 s (50 min)   0 itinerários
1 h                                                         0
2 h                                                         1
4 h                                                         2
8 h                                                         5
12 h                                                        5
```

Cinquenta minutos é uma janela de cidade: serve onde o autocarro seguinte vem
aí. Numa rede rural devolve «não há caminho» sobre uma ligação que tem catorze
viagens por dia, e isso manda alguém de táxi para uma viagem que existe.

**Quem construir o site tem de saber disto**: a pergunta de quem planeia é «há
ligação hoje?», não «apanho já o próximo». As duas são legítimas e são
perguntas diferentes.

## O proxy

O §7 pede «só a API GraphQL necessária, atrás de um proxy com limites», e são
dois requisitos. O `compose` levanta os dois serviços e **o motor não publica
porta nenhuma**: só o proxy lhe chega.

O que passa: `POST /otp/gtfs/v1` e `/saude`. O que não passa: a interface de
depuração, os mosaicos vetoriais, a API Transmodel, o ficheiro do grafo — 404,
e não 403, que confirmaria que existem.

Os limites: 6 pedidos por segundo por endereço com pico de 12, oito ligações em
simultâneo, corpo até 16 kB, e 20 s de paciência. O pedido prévio do navegador
(`OPTIONS`) **não conta para o limite** — é respondido no proxy sem tocar no
motor, e se levasse 429 o navegador nem chegava a tentar o POST.

As regras estão em [`proxy/nginx.conf`](proxy/nginx.conf) e correm em testes,
com um nginx verdadeiro (`pipeline/tests/test_proxy.py`). Uma configuração de
proxy que nunca correu é uma promessa, não uma proteção — e uma promessa de
segurança por cumprir é pior do que nenhuma.

## O que fica por decidir

- **Onde é que isto vive.** O OTP não corre na Vercel: precisa de contentor
  próprio. Ver [`docs/ALOJAMENTO.md`](../docs/ALOJAMENTO.md).
- **O GTFS-Flex** do Transporte a Pedido é Fase 4.

## O que degrada os itinerários hoje

O calendário escolar ainda não foi transcrito, e por isso **51 dos 68 serviços
não têm datas** — 587 das 903 viagens. O motor não as pode propor, porque não
sabe em que dias existem. Um itinerário que só exista em período escolar não
aparece, e isso não é o motor a falhar: é a lacuna `calendario.sem-datas` a
aparecer do outro lado.
