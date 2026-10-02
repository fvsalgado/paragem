# Como uma autoridade de transportes entra no Paragem.pt

Este guia é para a **autoridade de transportes** — a câmara, a comunidade
intermunicipal ou a área metropolitana que vai ter o sítio dos transportes do
seu território no Paragem.pt. Diz o que ela nos dá, o que decide, quem trabalha
no painel e por que ordem as coisas acontecem. O lado técnico — os ficheiros,
a construção, o domínio — está em [`NOVA-REGIAO.md`](NOVA-REGIAO.md), e é de
quem gere a instalação.

**Não há prazos neste guia, e é de propósito.** O tempo de entrada depende do
que já existe: uma rede com GTFS publicado entra depressa; uma rede que só tem
horários em PDF tem de ser transcrita, e o relatório de lacunas diz quanto
falta. Um prazo escrito aqui seria inventado.

## O que a autoridade nos dá

- **Os dados da rede que gere**, como os tiver: um GTFS, os PDF dos horários,
  as listas de paragens, o calendário escolar e os feriados municipais. Só
  entra o que é público ou o que a autoridade pode ceder — cada ficheiro fica
  registado com a origem, a data e a licença (`data/sources.yaml`). O que só
  existe em papel, ou num sítio que não deixa recolha automática, entra à mão,
  com a data e a origem anotadas. **Nada se inventa**: o que falta fica escrito
  no relatório de lacunas e marcado no sítio («Horários planeados», «[destino a
  confirmar]»).
- **A marca da rede, se a tiver**: a cor e o logótipo. São da autoridade (ou
  da operadora), e entram na declaração da região — quem os entrega tem de os
  poder usar.
- **Os contactos que a lei pede** — o de acessibilidade (Decreto-Lei
  n.º 83/2018) e quem responde pelos dados das medições. Escrevem-se no painel
  (ver abaixo); até lá, as páginas dizem «Por preencher», e não um contacto
  inventado.
- **As pessoas que vão trabalhar no painel**: o nome e o email de cada uma, e o
  papel de cada uma em cada região.

## O que a autoridade decide

- **O endereço do sítio.** Um subdomínio do produto
  (`<nome>.paragem.pt`) está pronto no dia em que a região entra; um domínio da
  própria autoridade entra quando ela o apontar, e o subdomínio passa a levar a
  ele. O painel não muda o endereço principal para um que ainda não responda.
- **Quem trabalha no painel, e com que papel** (abaixo).
- **Se os ficheiros construídos se distribuem, e sob que licença.** O sítio
  mostra os dados de cada página a quem a visita; distribuir os ficheiros
  inteiros — o GTFS, os catálogos — é outra decisão, e fica registada na
  declaração da região. O que assenta no OpenStreetMap sai sob ODbL, porque a
  licença dele obriga; o resto sai «para consulta» até haver decisão.
- **Que modos aparecem.** Os comboios, os expressos e os operadores vizinhos
  podem aparecer ao lado da rede da autoridade — quem viaja não tem de saber
  quem gere o quê —, e cada modo liga-se e desliga-se no painel. Os avisos são
  só sobre o que a autoridade gere: sobre o serviço de outra entidade, avisa
  quem o gere.

## Quem trabalha no painel

O painel (`/admin`) é onde a autoridade mexe no sítio dela. Cada pessoa entra
com o seu email e a sua palavra-passe, e vê **só as regiões onde tem papel**.
Tudo o que faz fica na auditoria, com o nome e o email de quem o fez.

| papel | o que faz |
| --- | --- |
| **editor** | escreve, publica, corrige, retira e apaga os avisos da região — supressões, desvios, greves |
| **gestor** | o mesmo, e a ficha da região: os modos que aparecem, os contactos da declaração de acessibilidade e da privacidade, o relatório das procuras sem resposta e o rasto do que se mexeu |
| **dono** | quem gere o Paragem.pt: cria e liga as regiões, os endereços, as licenças, as pessoas |

Uma pessoa recebe uma **ligação de ativação**, válida sete dias e de uso único,
e escolhe aí a palavra-passe. Não sai correio do painel: a ligação entrega-se à
mão, a quem a deve receber. Uma pessoa que sai desativa-se, e a sessão aberta
dela cai no clique seguinte.

## Por que ordem

1. **A conversa e o contrato.** O que se vai mostrar, de que dados, com que
   endereço. A licença de utilização fica registada no painel.
2. **Os dados.** A autoridade entrega o que tem; quem gere a instalação
   declara as fontes e constrói. A primeira construção traz o **relatório de
   lacunas**: as paragens sem coordenadas, os serviços sem calendário, as
   linhas sem horário — cada uma com o que falta e a quem pedir.
3. **A revisão.** A autoridade vê a região antes de ela estar no ar — num
   endereço de pré-visualização que quem gere a instalação lhe dá — e confere a
   rede que conhece. O que estiver mal corrige-se nas fontes, e não à mão no
   sítio.
4. **As pessoas.** O dono convida o gestor e os editores; cada um ativa a sua
   conta.
5. **Os contactos.** O gestor preenche, na ficha, o contacto de
   acessibilidade, onde se reclama e quem responde pelos dados.
6. **Ligar.** A região liga-se na ficha quando os dados estiverem publicados —
   o painel não deixa ligar uma região sem dados. Em cinco minutos o endereço
   responde.
7. **Depois.** Os avisos escrevem-se no painel e aparecem onde quem viaja olha:
   no mapa, na página da linha, na da paragem. As câmaras e as juntas levam os
   horários para os sítios delas na página «Para o seu sítio» (`/levar/`). E o
   relatório das procuras sem resposta diz que ligações as pessoas procuram e a
   rede não serve.

## O que fica de cada lado

- **Da autoridade**: os dados dela, a marca dela, os avisos, os contactos, as
  decisões acima. O sítio é dela; «Feito com Paragem.pt» fica discreto no
  rodapé.
- **Do Paragem.pt**: o código, o nome do produto e o desenho, a construção e o
  alojamento. Um produto com o nome de um cliente não se licencia ao seguinte,
  e por isso o produto tem nome próprio ([`AUTORIA.md`](../AUTORIA.md)).
- **De quem visita**: nada que o identifique. O sítio não põe cookies nem segue
  ninguém; mede o que se procura, e não quem procura
  ([`MEDICAO.md`](MEDICAO.md)).
