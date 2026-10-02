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

O Paragem.pt são três coisas: um pipeline de dados que lê ficheiros públicos e
escreve outros, um sítio que os mostra, e um painel (`/admin`) onde se ligam e
desligam regiões e módulos e onde cada autoridade de transportes escreve os
seus avisos. O que há para proteger:

- **a integridade dos dados** — um horário errado põe alguém à chuva, e uma
  paragem inventada põe-na no sítio errado. É por isso que o validador com zero
  erros é obrigatório e que nada entra sem proveniência;
- **a cadeia de fornecimento** — o pipeline descarrega ficheiros de terceiros.
  Cada fonte está registada em `data/sources.yaml` com a soma de verificação do
  que se descarregou, e uma soma diferente é um aviso no relatório, não um
  silêncio;
- **o painel e as contas dele.** Cada pessoa entra com o seu email e a sua
  palavra-passe, e vê só as regiões onde tem papel; a palavra-passe guarda-se
  como hash scrypt, os tokens das ligações de ativação como sha256, e nem um
  nem outro entram no registo de auditoria. A separação entre regiões é a
  propriedade que mais importa defender: uma pessoa de uma autoridade de
  transportes que consiga ver ou mexer na região de outra é uma falha para
  comunicar já ([`docs/PAINEL.md`](docs/PAINEL.md));
- **os segredos** — a chave de serviço da base, o segredo das sessões, o hash da
  palavra-passe do dono — vivem em variáveis de ambiente do alojamento, e nunca
  no repositório nem no navegador ([`docs/ALOJAMENTO.md`](docs/ALOJAMENTO.md)).

O sítio público não recolhe dado pessoal nenhum: mede o que se procura, sem
cookies, sem identificador e sem endereço IP ([`docs/MEDICAO.md`](docs/MEDICAO.md)).

## Não raspar, e porquê aqui é também segurança

Há sítios de autoridades de transportes e de operadoras que bloqueiam acesso
automático no `robots.txt`, e sistemas de reserva que só se automatizam com
autorização escrita de quem os gere. Isto está no [`CLAUDE.md`](CLAUDE.md) §4
como regra de âmbito,
e repete-se aqui porque um pipeline que desobedeça a isto deixa de ser um
problema de boas maneiras e passa a ser um incidente do lado de lá.

Se encontrares no código um caminho que peça a um desses sítios, isso é um
defeito para comunicar como qualquer outro.
