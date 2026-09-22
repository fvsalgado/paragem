# Paragem.pt

Toda a informação de transportes de um território num sítio só, **um código e
uma região por domínio**. O Paragem.pt reúne os transportes que servem uma
região — os autocarros da concessão, os urbanos municipais, o transporte a
pedido, os comboios, as bicicletas partilhadas, os expressos e os táxis — e
devolve-os em formatos que qualquer um pode voltar a usar: páginas de paragem,
de linha e de concelho, um planeador de viagens, e os dados em GTFS e GBFS.

O princípio de desenho é **uma só porta de entrada**: quem viaja não precisa de
saber quem gere cada serviço. A navegação organiza-se por modo de transporte; a
entidade responsável aparece como informação secundária («Gerido por …»).

Uma região é uma **autoridade de transportes** — um município, uma comunidade
intermunicipal ou uma área metropolitana — e entra por configuração, **sem um
único commit**. O processo está em [`docs/NOVA-REGIAO.md`](docs/NOVA-REGIAO.md).

## Isto prova-se, não se promete

O CI constrói em todas as corridas **duas regiões inventadas de fio a pavio** —
a Serra da Pedra Alta e o Baixo Sável. Não existem: nem uma paragem, nem uma
estrada, nem um horário vêm de sítio nenhum. É isso que lhes permite ser ao
mesmo tempo a demonstração pública do produto, sem pedir uma linha a ninguém, e
a prova executável do que o produto afirma.

São duas porque uma sozinha não prova nada sobre multi-região — não há com que
a comparar. E são diferentes uma da outra de propósito:

| | Serra da Pedra Alta | Baixo Sável |
| --- | --- | --- |
| artigo | «**a** Serra» | «**o** Baixo Sável» |
| autoridade | comunidade intermunicipal | **município sozinho** |
| concelhos | 2 | 1 |
| modos | autocarro, urbano municipal, bicicleta, táxi | autocarro |

Com dois artigos, nenhuma contração fica colada ao código. Com uma câmara
sozinha, fica provado que o produto não precisa de uma CIM. Com caixas
geográficas disjuntas, uma coordenada trocada entre regiões falha em vez de
cair nas duas. E com uma região de um modo só, vê-se que um modo ausente não
desenha uma secção vazia.

## As regiões reais vivem noutra raiz

A compilação de dados de uma região — os percursos, o mapeamento das paragens,
os PDF das operadoras e das câmaras — **não está aqui**, e quase sempre não
pode estar: não é nossa para publicar enquanto a autoridade de transportes não
autorizar a reutilização.

Uma região vive numa raiz própria, que se aponta com `PARAGEM_RAIZES`:

```bash
PARAGEM_RAIZES=/caminho/para/os-dados uv run pipeline build --regiao <id>
```

Como isso funciona, e o que impõe, está em [`docs/RAIZES.md`](docs/RAIZES.md).

## O estado, sem floreados

Há pipeline, há sítio e há planeador. O que **não** há, e é a razão de isto
ainda não estar publicado em nome de ninguém: os feeds não se republicam com
licença aberta enquanto a autoridade de transportes de cada região não
autorizar. É a Fase 5 do plano que está em [`CLAUDE.md`](CLAUDE.md).

O que uma construção produz, região a região:

| saída | o que é |
| --- | --- |
| GTFS da rede | reconstruído a partir do que a operadora publica |
| GTFS do operador ferroviário | tal e qual |
| GTFS dos expressos | recortado às viagens que servem a região |
| Recorte do OpenStreetMap | com margem, para as linhas que atravessam a fronteira |
| GBFS estático | os sistemas de bicicletas, sem prometer disponibilidade que não seja pública |
| GeoJSON | praças de táxi e traçados de urbanos municipais |
| Atribuição a concelhos | pela geometria da CAOP, e não por retângulo |
| Relatório de lacunas | o que falta, onde, e porque é que importa |

## Para quem é

Três públicos, por esta ordem:

- **Quem viaja.** Um horário que se lê no telemóvel, à paragem, com pouca rede
  e sem instalar nada. É para esta pessoa que as páginas são estáticas e
  funcionam mesmo com o motor de viagens em baixo.
- **Quem gere a rede** — a autoridade de transportes e as câmaras. Passam a ter
  o território inteiro numa vista só, e um sítio onde publicar avisos que chegam
  a toda a gente ao mesmo tempo.
- **Quem constrói outra coisa** — quem quer os dados. Saem em GTFS e GBFS, os
  formatos que o resto do mundo lê, com as licenças e as atribuições à vista.

## Regras que não são de estilo

Estão inteiras no [`CLAUDE.md`](CLAUDE.md) §4. As quatro que mais se notam:

1. **Só dados públicos e abertos**, cada um registado em
   [`data/sources.yaml`](data/sources.yaml) com endereço, data, licença e a
   atribuição que exige.
2. **Nunca inventar dados.** O que falta fica explícito — no relatório de
   lacunas e, na interface, com a data a que os horários se referem.
3. **Não raspar sítios que o proíbem.** O que vem desses entra à mão, em
   `data/manual/`, com a origem e a data anotadas.
4. **Acessibilidade WCAG 2.1 AA**, que para uma autoridade de transportes não
   é uma boa prática — é o Decreto-Lei n.º 83/2018.

## Como se corre

Precisa de [uv](https://docs.astral.sh/uv/) e de Python 3.11 ou mais recente.

```bash
uv run pipeline build --regiao prova --sem-rede            # uma região inventada, em segundos
uv run pipeline build --regiao prova-municipio --sem-rede  # a outra
uv run pipeline build --regiao <id>        # uma região real: descarrega, constrói, valida
uv run pipeline validate --regiao <id>     # só o validador, sem reconstruir
uv run pipeline report --regiao <id>       # o relatório de lacunas
uv run pytest
```

E as quatro verificações que o CI corre:

```bash
uv run pipeline check-proveniencia   # sources.yaml × REUSE.toml × TERCEIROS.md
uv run pipeline check-regioes        # duas ou mais regiões, zero fugas
uv run pipeline check-numeros        # os números que cada região declara esperar
uv run pipeline check-bloqueios --todas   # bloqueios novos vs os já aceites
```

Tudo o que sai vai para `build/<regiao>/`, que não está no Git: reconstrói-se
com o comando acima.

O parser de horários precisa do `pdftotext` (pacote `poppler-utils`), o recorte
do OpenStreetMap do `osmium-tool`, e o validador de GTFS de Java 17. As três
versões estão fixadas, e o porquê está em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

### O que corre em tempo real, e vive à parte

O sítio serve páginas em cache, feitas do que o pipeline publica, e funciona
com tudo o resto em baixo. Duas coisas não cabem numa página guardada e
correm à parte:

- **`otp/`** — o motor de viagens, em Docker, atrás de um proxy com limites.
- **`disponibilidade/`** — lê a página que um sistema de bicicletas publica e
  serve as contagens como GBFS, com a hora da leitura. Corre como rota do
  próprio sítio (`web/src/app/api/station_status/route.js`, um invólucro fino
  sobre o mesmo núcleo) ou como contentor, à escolha de quem aloja. Ver
  [`disponibilidade/README.md`](disponibilidade/README.md).

Sem eles o sítio funciona à mesma — mostra o que sabe e diz o que não sabe,
em vez de falhar em silêncio.

## Licença

O **software** é [AGPL-3.0-only](LICENSE). Os **dados** que o pipeline produz
não levam licença declarada — são derivados de fontes de terceiros cujos termos
estão registados um a um em `data/sources.yaml`, e publicá-los sob uma licença
aberta é a Fase 5, depois de a autoridade de transportes a autorizar. O que
deriva do OpenStreetMap é ODbL e leva a atribuição obrigatória.

A marca **Paragem.pt** não é coberta pela licença do código. Os pormenores
estão em [`AUTORIA.md`](AUTORIA.md); a declaração legível por máquina está em
[`REUSE.toml`](REUSE.toml).
