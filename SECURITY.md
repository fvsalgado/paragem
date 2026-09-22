# Segurança

## Comunicar uma vulnerabilidade

Por email para **fvsalgado@gmail.com**, com «Paragem.pt» no assunto. Não abras
um issue público para uma falha explorável.

Diz o que conseguires: o que viste, como se reproduz, e o que achas que é
possível fazer com isso. Um relato imperfeito é melhor do que nenhum, e não é
preciso trazer uma exploração pronta.

Respondo em dias, não em semanas. Se não tiver resposta em uma semana, insiste
— não foi por falta de interesse.

## O que este projeto tem, e não tem

Hoje, na Fase 0/1, o Paragem.pt é um pipeline de dados que lê ficheiros
públicos e escreve outros ficheiros. **Não há contas de utilizador, não há base
de dados e não se recolhe nada sobre ninguém.** O que há para proteger são três
coisas:

- **a integridade dos dados** — um horário errado põe alguém à chuva, e uma
  paragem inventada põe-na no sítio errado. É por isso que o validador com zero
  erros é obrigatório e que nada entra sem proveniência;
- **a cadeia de fornecimento** — o pipeline descarrega ficheiros de terceiros.
  Cada fonte está registada em `data/sources.yaml` com a soma de verificação do
  que se descarregou, e uma soma diferente é um aviso no relatório, não um
  silêncio;
- **os segredos que ainda não existem** — nenhum. Quando existirem (Fase 4, com
  o Supabase), vão para variáveis de ambiente e nunca para o repositório.

## Não raspar, e porquê aqui é também segurança

Há sítios de autoridades de transportes e de operadoras que bloqueiam acesso
automático no `robots.txt`, e sistemas de reserva que só se automatizam com
autorização escrita de quem os gere. Isto está no [`CLAUDE.md`](CLAUDE.md) §4
como regra de âmbito,
e repete-se aqui porque um pipeline que desobedeça a isto deixa de ser um
problema de boas maneiras e passa a ser um incidente do lado de lá.

Se encontrares no código um caminho que peça a um desses sítios, isso é um
defeito para comunicar como qualquer outro.
