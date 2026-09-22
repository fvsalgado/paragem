# Onde vive uma região

O código deste repositório é público e está sob AGPL-3.0-only. **A compilação
de dados de uma região pode não estar** — e quase sempre não está, enquanto a
autoridade de transportes não autorizar a reutilização (CLAUDE.md §11.2, e a
Fase 5 do §9).

Uma região não é um ramo, nem uma configuração de ambiente: é uma **raiz**. Uma
pasta com a mesma forma que esta, que traz a declaração da região e os
documentos de onde ela sai, e que o pipeline carrega ao lado desta.

```
<raiz>/
  regioes/<id>/          a declaração e a receita de construção
  data/manual/<id>/      os PDF, os YAML e os CSV introduzidos à mão
  data/reference/<id>/   os números do protótipo, só para comparação
  data/sources.yaml      o registo de proveniência DESTA raiz
  docs/TERCEIROS.md      o inventário do que aqui é de terceiros
  REUSE.toml             a declaração de licença legível por máquina
```

## Como se faz uma

Não à mão. Uma cópia feita à mão diverge na primeira semana — alguém corrige um
comentário de um lado e não do outro, e daí a três meses ninguém sabe qual dos
dois é o certo:

```sh
uv run python ferramentas/raiz-da-regiao.py <id> /caminho/para/a/raiz
```

Sai com a forma de cima: a declaração, os ficheiros manuais, os números de
referência, o `data/sources.yaml` cortado às fontes que vêm, o
`docs/TERCEIROS.md` cortado ao que aqui é de terceiros, e o `REUSE.toml` sem as
anotações de pastas que a raiz não tem.

É o **complemento** do `ferramentas/esqueleto-publico.py`, e os dois juntos
partem o repositório: cada ficheiro que o Git conhece vai a um, ao outro, ou à
maquinaria do próprio corte — e nenhum vai aos dois. Isso não se lembra,
verifica-se: `pipeline/tests/test_raiz_da_regiao.py`.

## Como se diz ao pipeline onde estão

A variável `PARAGEM_RAIZES`, com caminhos separados por `:`, como o `PATH`:

```sh
PARAGEM_RAIZES=/caminho/para/dados-da-regiao uv run pipeline build --regiao <id>
```

Sem ela, o pipeline vê só o que está aqui — e responde «não há região
<id>'», que é a resposta certa: ela não está cá.

## As regras que isto impõe

1. **Um `id` de região existe uma vez.** Duas raízes que declarem a mesma
   região é um erro em vez de um silêncio, porque «qual delas ganhou» não é
   pergunta que se responda a adivinhar.
2. **Um `id` de fonte existe uma vez.** O `data/sources.yaml` deixou de ser um
   ficheiro e passou a ser a **soma** dos de todas as raízes. Declarar a mesma
   fonte em duas levanta erro, pela mesma razão.
3. **Um caminho declarado numa receita resolve-se na raiz da região.** A
   receita escreve `data/manual/<id>/tap/constancia.yaml` e não sabe contra o
   quê isso se resolve. O pipeline resolve-o onde a região vive — e não aqui.
4. **A documentação viaja com os dados.** Cada raiz tem o seu
   `docs/TERCEIROS.md`, o seu `REUSE.toml` e o seu `data/manual/<id>/LEIA.md`.
   O `check-proveniencia` verifica cada raiz contra a sua, e não todas contra
   uma. Concentrá-las aqui obrigava este repositório a publicar a lista dos
   documentos de cada cliente — que é exatamente o que a separação evita.

## O que continua público, e porquê

**O que deriva do OpenStreetMap.** A ODbL é uma licença com partilha nos mesmos
termos: as coordenadas das paragens, as praças de táxi, as estações de
bicicletas e os mosaicos do mapa saem de uma base ODbL, e o sítio publica-os.
Fechá-los seria usar o OpenStreetMap sem devolver o que dele deriva. Ficam onde
sempre estiveram, na página de dados abertos, com a atribuição embutida no
próprio ficheiro.

**O código, inteiro.** Nenhum leitor é de uma região: um leitor é de um
formato. A prova está no CI, que constrói em todas as corridas uma região
inventada de fio a pavio — a Serra da Pedra Alta — usando só leitores
genéricos. No dia em que ela precisar de código próprio para nascer, o produto
deixou de ser multi-região e o CI diz isso em voz alta.

## O que NÃO se resolve com isto

Tirar um ficheiro do `HEAD` não o tira do histórico. Um repositório que já
teve os dados lá dentro continua a tê-los em cada commit anterior, e abri-lo
publica-os na mesma. Um repositório que nasce público **nasce com histórico
novo**, e o que tem passado fica do lado privado.
