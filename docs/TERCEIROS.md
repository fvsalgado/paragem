# O que é de terceiros

O inventário do que vai dentro deste repositório, ou sai do pipeline, e **não é
nosso**. A prosa sobre direitos está em [`AUTORIA.md`](../AUTORIA.md); a
declaração legível por máquina está em [`REUSE.toml`](../REUSE.toml); o registo
de proveniência dos dados, fonte a fonte, está em
[`data/sources.yaml`](../data/sources.yaml).

**Se estes três divergirem, um deles está errado** — e é isso que o
`uv run pipeline check-proveniencia` verifica em todas as corridas do CI.

**Uma região que viva noutra raiz traz o seu próprio inventário.** Esta folha
cobre o que está *nesta* raiz. Quando a compilação de dados de uma região vive
noutra — o caso normal, enquanto a autoridade de transportes não autorizar a
reutilização —, o que ela tem de seu está declarado no `docs/TERCEIROS.md`
dela, e a verificação procura-o lá, raiz a raiz. Ver [`docs/RAIZES.md`](RAIZES.md).

Levantado a 19 de setembro de 2026.

---

## Dados

Cada linha corresponde a um `id` de `data/sources.yaml`, e o identificador tem
de aparecer aqui — a verificação de proveniência procura-o por nome.

**A tabela abaixo é gerada**, e não se edita aqui: sai do inventário do
repositório de onde este esqueleto veio, cortado às fontes que ficam. Foi
copiada à mão uma vez e ficou quatro fontes para trás.

| `id` | o quê | de quem | licença |
| --- | --- | --- | --- |
| `calendario-escolar-despacho` | Despacho n.º 8368/2024 (com o n.º 10430/2026) — calendário escolar de 2024/2025 a 2027/2028 | Diário da República — Ministério da Educação | documento público — PDF da 2.ª série em `data/manual/` |
| `cp-gtfs` | GTFS da CP | CP — Comboios de Portugal | por confirmar |
| `flixbus-gtfs` | GTFS genérico europeu | FlixBus | por confirmar |
| `nap-portugal` | Ponto de Acesso Nacional para dados de mobilidade | IMT — Instituto da Mobilidade e dos Transportes | por confirmar — **por fornecimento, declarada no próprio Ponto** |
| `ip-partidas-chegadas` | Partidas e chegadas em tempo real, de toda a rede | Infraestruturas de Portugal | por confirmar — **o robots.txt proíbe estes endereços por nome** |
| `cp-tempo-real` | Quadro de estação e percurso de comboio, em direto | CP — Comboios de Portugal | por confirmar — **API privada, e só com autorização escrita da CP** |
| `flixbus-pesquisa` | Pesquisa de viagens, com preço e lugares | FlixBus | por confirmar — **sem autenticação, mas os termos de republicação por confirmar** |
| `osm-portugal` | Extrato de Portugal | contribuidores do OpenStreetMap | **ODbL 1.0 — atribuição obrigatória** |
| `caop` | CAOP 2025 — Carta Administrativa Oficial de Portugal (continente) | Direção-Geral do Território | **CC BY 4.0 — atribuição obrigatória** |

O que é nosso e está nesta lista por completude: `prova-gtfs-rede-alta`,
`prova-osm` e `prova-gtfs-savel`, que são as duas regiões de prova — inventados
de fio a pavio, AGPL-3.0-only como o resto. São duas porque uma só não prova
multi-região: não há com que a comparar.

## O que não são dados

| o quê | onde | de quem | licença |
| --- | --- | --- | --- |
| Atkinson Hyperlegible, normal e negrito | `web/src/fontes/`, inteira (versão 1.006), para os cartões de partilha; `web/public/glifos/`, em glifos, para as etiquetas do mapa | Braille Institute of America | **SIL OFL 1.1** — o texto vai ao lado, em `web/src/fontes/OFL.txt` |

A letra foi tirada do repositório público das letras do Google
(`github.com/google/fonts`, pasta `ofl/atkinsonhyperlegible`) a 24 de setembro
de 2026. A OFL permite redistribuí-la com o software, desde que a licença vá
com ela. Os glifos do mapa são, nos termos da OFL, uma **versão modificada** —
a licença conta a mudança de formato como modificação —, e por isso continuam
sob OFL; esta letra não declara nenhum nome reservado, e não há nome a
mudar.

## As duas obrigações que não são negociáveis

### A atribuição do OpenStreetMap

Tudo o que sai dos leitores `osm-*` é **obra derivada de uma base de dados sob
ODbL**, e a ODbL segue-a. Por isso a atribuição não fica para o rodapé de uma
página que ainda não existe: vai **embutida no próprio ficheiro** —
`attribution` no GeoJSON, `attribution_organization_name` e `license_url` no
GBFS. Um rodapé esquece-se numa refatoração; um campo do ficheiro viaja com o
ficheiro.

### A atribuição da Carta Administrativa

A CAOP sai sob **CC BY 4.0** — permissiva, e com atribuição obrigatória. É dela
que vem a fronteira de cada concelho, e portanto a resposta a «em que concelho
está esta paragem?». A atribuição devida é **«Direção-Geral do Território»**, e
está declarada em `data/sources.yaml` com `atribuicao_obrigatoria: true`.

Ao contrário do OpenStreetMap, a CAOP não viaja dentro dos ficheiros de saída:
o que sai daqui é o resultado da pergunta (o nome do concelho), não a
geometria. A atribuição vive na página de dados abertos do produto — e no dia
em que sair um ficheiro com os limites lá dentro, tem de passar a viajar com
ele, como a do OSM.

### Os sítios que proíbem acesso automático

Há sítios de autoridades de transportes e de operadoras que bloqueiam no
`robots.txt`, e sistemas de reserva que só se automatizam com autorização
escrita de quem os gere. Quais são, caso a caso, é matéria do inventário de
cada região — e é por isso que ele viaja com ela. Esta
regra está **executável** em `pipeline/src/paragem/fontes.py`: uma fonte marcada
`manual` ou `proibido-sem-autorizacao` levanta uma exceção quando alguém tenta
descarregá-la, com a razão escrita. Uma regra que vive só em prosa quebra-se por
distração, meses depois, por quem nunca leu a prosa.

## O que está por esclarecer

Isto está aqui por ser diferente de «não há».

- **A licença das camadas do geoportal.** O serviço responde a quem o peça —
  não tem `robots.txt` (verificado a 22/09/2026) — e o `copyrightText` está
  vazio. «Público» e «reutilizável» não são a mesma coisa, e a diferença
  decide-se com quem o publicou.
- **A licença do GTFS da CP e do da FlixBus.** Publicados abertamente, sem
  declaração encontrada.
- **Se a marca «Paragem.pt» está registada.** Não se procurou no INPI. É
  matéria de um advogado — ver [`AUTORIA.md`](../AUTORIA.md).

Enquanto estiverem assim, **os feeds produzidos não se republicam com licença
aberta**. É a Fase 5, e depende da autorização da autoridade de transportes.
