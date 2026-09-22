# O que entra aqui, e como

Esta pasta é a porta de entrada do que **não se descarrega**: PDF de horários,
mapas de rede, exportações de cadastros oficiais, folhas de cálculo das
câmaras.

Há duas razões para um ficheiro entrar por aqui em vez de entrar pelo pipeline,
e as duas estão no [`CLAUDE.md`](../../CLAUDE.md) §4:

- **o sítio de origem proíbe acesso automático** — há sítios de autoridades de
  transportes e de operadoras que bloqueiam no `robots.txt`, e sites de reserva
  que só se automatizam com autorização escrita de quem os gere;
- **o ficheiro só se obtém à mão** — há cadastros com proteção anti-robô, cuja
  exportação se faz no navegador.

## As regras

1. **Um ficheiro por aqui tem de ter entrada em
   [`data/sources.yaml`](../sources.yaml)**, com o endereço de origem, a data em
   que foi obtido, a licença e a atribuição que impõe. O
   `uv run pipeline check-proveniencia` recusa-se a passar sem isso.
2. **O caminho é `data/manual/<regiao>/`.** Um ficheiro solto na raiz desta
   pasta não pertence a região nenhuma e o pipeline não o vai ler.
3. **Não se edita o original.** Se um PDF precisar de correções, elas entram
   num ficheiro ao lado (um `.csv` ou um `.yaml`) que o pipeline aplica por
   cima — e que fica a dizer o que corrigiu e porquê. Editar o original
   destrói a única cópia do que a fonte realmente publicou.
4. **O inventário de uma região fica com a região.** Esta folha diz as regras;
   a lista do que está cá por cada região vive em
   `data/manual/<regiao>/LEIA.md`, e viaja com ela quando a região vive noutra
   raiz (ver [`docs/RAIZES.md`](../../docs/RAIZES.md)).

## O que está cá hoje

### `prova/`

Inventado de fio a pavio, para a região de prova. Não vem de lado nenhum e é
essa a questão — ver [`regioes/prova/regiao.yaml`](../../regioes/prova/regiao.yaml).

### Fora de qualquer região

| ficheiro | origem | obtido |
| --- | --- | --- |
| `despacho-8368-2024.pdf` | Diário da República — calendário escolar, que não é de região nenhuma | 20/09/2026 |
