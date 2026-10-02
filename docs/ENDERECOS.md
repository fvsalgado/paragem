# Ligar ao planeador de fora

O planeador lê a viagem do endereço. Qualquer página — a agenda cultural da
mesma casa, o sítio de uma câmara, uma mensagem — pode abrir uma viagem já
preenchida, sem conta nem chave: é uma ligação, e mais nada.

O endereço é também o que o sítio escreve à medida que a viagem muda, e por
isso o «voltar» do telemóvel fecha uma camada de cada vez e o que se copia da
barra é sempre a viagem que está à frente. A forma é uma só, para quem lê e
para quem escreve: [`web/src/lib/endereco-da-viagem.ts`](../web/src/lib/endereco-da-viagem.ts).

## A forma

```
https://<domínio da região>/viagem/?de=<ponta>&para=<ponta>&dia=AAAA-MM-DD&hora=HH:MM
```

Todos os parâmetros são opcionais. Sem `de`, a partida fica por escolher — e a
primeira sugestão é «A minha localização», que só se pede com um toque.

| parâmetro | o que é |
| --- | --- |
| `para` | o destino: uma ponta (ver abaixo) |
| `nome` | o nome a mostrar no destino, quando ele vem por coordenadas |
| `de` | a partida: uma ponta |
| `nome_de` | o nome a mostrar na partida, quando ela vem por coordenadas |
| `dia` | `AAAA-MM-DD`; sem ele, a viagem é «agora» |
| `hora` | `HH:MM`, só com `dia`; um dia sem hora começa à meia-noite e mostra as ligações desse dia |

Uma **ponta** lê-se por esta ordem:

1. **coordenadas**, `latitude,longitude` em graus decimais, com ponto — um
   ponto qualquer, que o planeador trata como trata uma rua: a pé até à
   paragem mais perto. O nome que se mostra vem de `nome` (ou `nome_de`), e
   **nunca vira uma paragem**: não aparece na lista das paragens, não ganha
   página, não entra nos dados;
2. **o identificador de uma paragem ou de uma estação** — é o que o próprio
   sítio escreve, porque um nome muda quando a operadora o reescreve e o
   identificador não;
3. **o nome exato** de uma paragem, tal como a página dela o escreve — a forma
   antiga, que continua a valer para não partir ligações que já andam por aí.

## Exemplo

Uma feira no largo de Porto Ameno, na demonstração (as Terras do Ameno, que
são inventadas e ficam no meio do Atlântico):

```
https://demo.paragem.pt/viagem/?para=39.47020,-10.53859&nome=Feira%20do%20Livro&dia=2026-10-03&hora=09:00
```

Abre o planeador com «Feira do Livro» no destino, sábado às 9h, e a partida por
escolher. Sem `dia` e `hora`, é «partir agora» — que é o que serve a quem lê a
ficha de um evento no dia dele.

E de uma paragem para outra, pelos identificadores:

```
https://demo.paragem.pt/viagem/?de=alm_pinhal&para=pam_terminal
```

## O que se valida

- **As coordenadas têm de cair na região**: dentro da caixa dela, com uma
  margem de 0,1° (a do recorte do mapa) — há carreiras que atravessam a
  fronteira, e um evento na vila do lado continua a ter quem lá chegue. Fora
  disso, o planeador **diz-o** («O destino pedido, «…», fica longe de mais:
  este planeador só conhece os transportes …»), em vez de responder «sem
  viagem», que esconderia que o problema é o sítio e não o horário.
- **O nome mostra-se como texto, nunca como HTML.** Tiram-se os carateres de
  controlo e os que viram o texto ao contrário, os espaços seguidos passam a um,
  e corta-se aos 80 carateres.
- **Uma ponta que não se reconhece diz-se pelo nome**, para quem mandou a
  ligação a poder corrigir — e o campo fica por preencher.
- **Um dia que não existe** (`2026-02-31`) ou uma hora fora do relógio
  ignoram-se: a viagem fica «agora».

## O que o sítio não escreve

**«A minha localização» nunca vai para o endereço.** É a coordenada de quem
procura: ficava no histórico do navegador, e numa ligação partilhada ia parar ao
telemóvel de outra pessoa. Uma viagem a partir daqui partilha-se com o destino e
a hora, e quem a recebe parte de onde estiver.

## No mapa

O início da região (`/`) lê a mesma forma — `?de=`, `?para=`, `nome`, `dia`,
`hora` — e abre as direções por cima do mapa. Lê também `?ponto=<id>`, que abre
o cartão de uma paragem, de uma estação ou de um ponto de outro modo: é o «Ver
no mapa» das páginas de cada um.
