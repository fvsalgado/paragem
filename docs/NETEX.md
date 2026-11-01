# A rede em NeTEx

O GTFS é o formato que as aplicações de transportes leem. O **NeTEx**
(*Network Timetable Exchange*, CEN/TS 16614) é o formato que o **Regulamento
Delegado (UE) 2017/1926** indica para os dados estáticos que cada Estado-Membro
recolhe no seu **Ponto de Acesso Nacional** — em Portugal, o do IMT
(`nap-portugal` em `data/sources.yaml`). Uma autoridade de transportes que
queira cumprir o regulamento com os dados da sua rede precisa deles em NeTEx, e
é isso que o pipeline passa a escrever.

O código está em `pipeline/src/paragem/netex.py`, e os comentários dele dizem o
porquê de cada escolha. Esta página é o resumo, e o que falta.

## O que sai

Para cada rede que a região constrói — as saídas da receita com
`papel: horarios`, `papel: feed-proprio` ou `papel: feed-proprio-flex` (o
transporte a pedido) —, o `pipeline build` escreve:

```
build/<regiao>/netex/<rede>.zip     um zip com um XML só, <rede>.xml
```

Não é preciso pedi-lo na receita: uma região nova tem NeTEx sem um commit, como
tem GTFS. Na página de dados abertos aparece num grupo próprio, «Horários em
NeTEx», em `netex/<rede>.zip`.

**Sai do GTFS da mesma construção, e não das fontes.** Uma segunda leitura das
fontes era uma segunda opinião sobre a mesma rede. Aqui há uma construção e dois
formatos, e os testes conferem que dizem o mesmo: as mesmas viagens, pelas
mesmas paragens, às mesmas horas, nos mesmos dias (`test_netex.py`).

**Os termos são os do GTFS de onde sai**, pela mesma `_termos` de
`pipeline/src/paragem/sitio.py`: obra da casa numa região de prova, «para
consulta» na de uma autoridade de transportes. Um formato não muda o que se pode
fazer com os dados. A atribuição que o GTFS leva no `attributions.txt` vai
dentro do XML, no `Description` do `PublicationDelivery`, e a nota da ODbL
também, quando a receita declara que parte da saída vem do OpenStreetMap
(`partes_odbl`): o zip leva um XML só, e a nota não fica num ficheiro ao lado
que um Ponto de Acesso possa deitar fora.

## O perfil: EPIP

O NeTEx inteiro descreve quase tudo o que um operador gere — turnos, veículos,
tarifas. Para informar quem viaja chega um subconjunto, e o europeu chama-se
**EPIP** (*European Passenger Information Profile*, CEN/TS 16614-4). É o que se
escreve: um `CompositeFrame` do tipo `EU_PI_NETWORK_OFFER` — a rede inteira num
ficheiro — com os cinco quadros que o perfil define.

| Quadro | Tipo EPIP | O que leva | De onde vem |
| --- | --- | --- | --- |
| `ResourceFrame` | `EU_PI_COMMON` | a autoridade de transportes e os operadores | `regiao.yaml` e `agency.txt` |
| `SiteFrame` | `EU_PI_STOP` | um `StopPlace` por estação ou paragem solta, com os `Quay` | `stops.txt` |
| `ServiceFrame` | `EU_PI_NETWORK` | a `Network`, as `Line`, um `Route` por linha e sentido, os destinos, as `ScheduledStopPoint`, a atribuição de cada uma ao seu cais e os padrões de paragens | `routes.txt`, `trips.txt`, `stop_times.txt` |
| `ServiceCalendarFrame` | `EU_PI_CALENDAR` | um `DayType` por serviço, com os dias em que anda, um a um | `calendar.txt` e `calendar_dates.txt` |
| `TimetableFrame` | `EU_PI_TIMETABLE` | uma `ServiceJourney` por viagem, com as horas de passagem | `stop_times.txt` |

Três escolhas que vale a pena conhecer antes de abrir o ficheiro:

- **Os identificadores são os do GTFS**, com o espaço de nomes da região e a
  classe à frente: `<regiao>:Line:<route_id>`, `<regiao>:ServiceJourney:<trip_id>`.
  Uma viagem encontra-se nos dois ficheiros pelo mesmo identificador. Todos os
  objetos levam `version="1"`, e todas as referências internas também — é isso
  que faz o esquema oficial conferir que nenhuma fica pendurada.
- **Os dias vão um a um**, e não como uma regra semanal com exceções. O GTFS
  desta construção já é uma lista de dias, com os feriados e as férias
  aplicados; reescrevê-lo como regra era inventar uma regra que ninguém escreveu,
  e que um leitor diferente aplicaria de outra maneira.
- **A hora estimada continua estimada.** O caderno de horários de uma operadora
  marca cerca de um terço das paragens; as outras têm no GTFS uma hora estimada,
  com `timepoint=0`. O NeTEx inteiro diria isso no ponto do padrão
  (`TimingPointStatus`), mas o EPIP tirou-lho. O que o perfil deixa é uma nota
  (`Notice`, com o código `hora-estimada`) atribuída ao ponto, e é essa que vai.
  Um programa lê o código; uma pessoa lê o texto.

A versão que o `PublicationDelivery` declara é a do esquema oficial contra o
qual a construção valida (hoje `2.0`), e nenhuma outra.

### O transporte a pedido

O GTFS-Flex do transporte a pedido sai também em NeTEx, com o que o perfil tem
para isso:

- **cada circuito é uma `FlexibleLine`** do tipo `fixed` — as paragens e as
  horas são as da brochura, e o que é flexível é só andar ou não —, e
  `mixedFlexibleAndFixed` quando há paragens que não pedem reserva;
- **a regra de reserva vai na linha**, em `BookingArrangements`: o telefone e o
  endereço (`BookingContact`, `BookingUrl`), os métodos que eles permitem
  (`callOffice`, `online`), até quando (`BookWhen` e `LatestBookingTime`, ou
  `MinimumBookingPeriod` para as que se fazem no próprio dia) e a mensagem
  inteira, por palavras, em `BookingNote`. O «dia **útil** anterior» não tem
  onde ir no perfil, e fica na mensagem;
- **cada viagem leva `FlexibleServiceProperties`** (`fixedPassingTimes`), que é
  onde um leitor de NeTEx vê que ela não se faz se ninguém a reservar — e a
  regra dela, se não for a da linha;
- as paragens de um circuito **não** levam `RequestStop` uma a uma: a reserva é
  da linha, e repeti-la em vinte paragens não dizia nada de novo.

Num feed que misture linhas regulares e a pedido, as a pedido vão num segundo
`ServiceFrame`: o perfil quer, em cada lista de linhas, só `Line` ou só
`FlexibleLine`. Os nossos não misturam — são dois GTFS —, mas um importado pode.

O que **não** sai é o a pedido por zonas — `locations.geojson`,
`location_groups.txt`, janelas de recolha em vez de horas. O NeTEx tem onde o
dizer (`FlexibleArea`), e está por escrever; até lá, essas viagens ficam de fora
e o relatório conta-as.

## Como se valida

Contra dois esquemas, por esta ordem de autoridade:

1. **o oficial**, do repositório
   [NeTEx-CEN/NeTEx](https://github.com/NeTEx-CEN/NeTEx), na etiqueta `v2.0.0`
   (commit `a94e5e17`), que é a versão estável e a única que o repositório
   mantém. Um erro aqui **bloqueia** a construção, como um erro do validador de
   GTFS: um ficheiro que um Ponto de Acesso recusa não se publica;
2. **o do perfil**, do repositório
   [NeTEx-CEN/NeTEx-Profile-EPIP](https://github.com/NeTEx-CEN/NeTEx-Profile-EPIP)
   (commit `e5eaf83f`). O próprio README diz que já não é mantido, e o XSD diz
   que não é normativo e que se usa *além* do oficial e não em vez dele. Por
   isso um erro aqui é só um **aviso**. Vale a pena perguntar-lhe na mesma: é o
   único que diz o que o perfil deixa de fora — o oficial aceita o NeTEx
   inteiro, e foi ele que mostrou que o EPIP não dá à `Line` uma referência à
   rede, nem à viagem uma referência à linha, nem ao ponto do padrão o estado da
   hora.

O `pipeline build` valida sozinho, e escreve o resultado no relatório de
lacunas. Para voltar a perguntar sem construir tudo outra vez:

```sh
uv run pipeline netex-esquemas             # vai buscar os dois esquemas, nos commits fixados
uv run pipeline netex --regiao <id>        # volta a escrever e a validar o NeTEx de um build
```

**Os esquemas não vivem neste repositório**, e foi decidido. O oficial está sob
GPL-3.0, que se juntava a este sem problema, mas são 458 ficheiros e 7 MB para
um teste; o do perfil não declara licença nenhuma, e um ficheiro sem licença
declarada não se redistribui. Descarregam-se pelo git — que confere o commit
pelo próprio conteúdo — para `.cache/netex/`, como o validador de GTFS vai para
`.cache/`. Quem os tenha noutro sítio aponta `NETEX_XSD` e `NETEX_XSD_EPIP` para
o `.xsd` de entrada.

**Não validar nunca é silêncio.** Sem os esquemas, fica um aviso no relatório a
dizer que a verificação não se fez; com `--exigir-validador` — o CI de dados —,
o do oficial passa a bloqueio. Nos testes, sem os esquemas, os de validação
saltam com a razão escrita; no CI os esquemas vão-se buscar antes e
`PARAGEM_EXIGIR_ESQUEMAS_NETEX=1` faz os testes falharem em vez de saltarem.
Um teste que salta no CI não verificou nada.

O esquema oficial leva uns vinte segundos a compilar, e uma região real perto
de um minuto a validar. Compila-se uma vez por processo.

### Conferido à mão a 1/11/2026

Além do que o CI confere em cada corrida, o mesmo ficheiro foi validado nas três
versões do esquema oficial que interessam — **1.2.3, 1.3.2 e 2.0.0** — e no do
perfil, para as duas regiões de prova, para a de demonstração e para uma região
real — a rede regular (mais de cem linhas e perto de mil viagens: 17 MB de XML,
0,6 MB em zip) e o transporte a pedido dela (seis dezenas de circuitos: 8 MB de
XML). Passou nas quatro, porque só usa o que as quatro têm em comum. Se o Ponto
de Acesso pedir uma 1.x, muda-se a constante `OFICIAL` e a versão declarada
segue-a.

## O que fica de fora

O relatório diz, para cada rede, o que o GTFS tem e o NeTEx não leva
(`netex.<rede>.fora-do-perfil`), e conta as viagens que não entraram e porquê
(`netex.<rede>.viagens-de-fora`). A lista inteira está em `FORA`, em
`netex.py`. Em resumo:

- **os traçados** (`shapes.txt`). O EPIP não os exige — o esquema do perfil diz
  que «os dados podem não estar disponíveis» —, e numa rede real são 13 MB de
  pontos em CSV ao lado de 17 MB do XML inteiro: em GML, quase o dobravam.
  Ficam no GTFS. Uma nota sobre a licença: a
  página de dados abertos diz, ao lado do NeTEx, a mesma parte do OpenStreetMap
  que diz ao lado do GTFS de onde ele sai — que pode falar dos traçados, que o
  NeTEx não leva. A parte que lá está é a das paragens;
- **as tarifas** (`fare_*.txt`, as redes tarifárias). São de outro perfil, o
  europeu de tarifas, e outro trabalho;
- **as frequências, os transbordos e o interior das estações** (`frequencies.txt`,
  `transfers.txt`, `pathways.txt`, `levels.txt`). As nossas redes não os têm, e
  um feed que os traga não os perde em silêncio;
- **o que o perfil prevê e o GTFS não tem**: o lugar de cada paragem na carta
  administrativa (`TopographicPlace`), os pontos de cada percurso
  (`RoutePoint` — os `Route` saem sem eles), a acessibilidade das paragens e dos
  veículos. Não se inventa: fica por escrever até haver de onde o tirar;
- **a distinção entre entrar e sair a pedido.** O GTFS distingue `pickup_type` de
  `drop_off_type`, e o `2` (marcar com a operadora) do `3` (combinar com o
  motorista). O ponto do padrão do EPIP tem um `RequestStop` só, e fica a mais
  restritiva das duas.

## O que falta para o Ponto de Acesso Nacional

O ficheiro existe e valida. Entregá-lo é outra coisa, e quase tudo o que falta
**não é código**:

1. **Perguntar ao IMT o que o Ponto de Acesso aceita** — e é decisão do dono
   quando e como. As tabelas de referência públicas do Ponto (consultadas a
   1/11/2026) dizem as *categorias* de dados — «Transporte público: informações
   de localização», «informações operacionais» (calendário de funcionamento,
   topologia da rede e linhas, horários estáticos) e «Transporte a pedido» —,
   que são exatamente o que o EPIP cobre. Não dizem os *formatos*. As
   perguntas:
   - que versão do NeTEx (1.x ou 2.0) e que perfil (o EPIP, ou um perfil
     nacional que ainda não conhecemos);
   - um ficheiro por rede, como sai hoje, ou um por linha (`EU_PI_LINE_OFFER`);
   - se aceita GTFS ao lado, e se o NeTEx tem de passar num validador deles;
   - se o carregamento é manual ou se o Ponto vai buscar o ficheiro a um
     endereço — o de dados abertos da região serve (`/dados-abertos/netex/<rede>.zip`);
   - que metadados pede (há um perfil europeu para isso, o mobilityDCAT-AP) e
     de quanto em quanto tempo se atualiza.
2. **A conta no Ponto é da autoridade de transportes.** O regulamento obriga
   quem gere e opera o serviço; o produto faz o ficheiro, mas quem o fornece é a
   autoridade, com a conta dela.
3. **A licença.** O Ponto pede, por fornecimento, a licença dos dados. Hoje o
   ficheiro sai «para consulta», porque é isso que ele é: publicá-lo com licença
   aberta depende de a autoridade autorizar a reutilização (Fase 5, §9). Sem
   isso não há o que declarar.
4. **O transporte a pedido por zonas.** O que tem paragens e horas já sai
   (`FlexibleLine`); o que é por zonas — `FlexibleArea`, com janelas em vez de
   horas — está por escrever. E vale a pena perguntar ao IMT se o Ponto quer o
   transporte a pedido num ficheiro à parte, como sai hoje, ou junto da rede.
