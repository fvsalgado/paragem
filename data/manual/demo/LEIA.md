# As Terras do Ameno — o que está aqui

Tudo nesta pasta é **inventado**, e sai de um sítio só: o
[`inventar.py`](inventar.py). É a origem — mudar a demonstração é mudar lá e
voltar a correr:

```bash
uv run python data/manual/demo/inventar.py
```

O que ele escreve é determinista (a mesma semente, os mesmos ficheiros), por
isso uma mudança fica à vista no `git diff` do que sai. Os ficheiros que ele
escreve não se editam à mão.

| ficheiro | o que é | fonte em `data/sources.yaml` |
| --- | --- | --- |
| `geografia.geojson` | o mapa e a carta administrativa: concelhos, água, verde, estradas, a linha de comboio, edifícios, nomes | `demo-geografia` |
| `gtfs-rede/` | a rede regular, sem `calendar.txt` (os dias saem das regras do calendário) | `demo-gtfs-rede` |
| `gtfs-comboio/` | a linha de comboio, de outra entidade | `demo-gtfs-comboio` |
| `gtfs-expressos/` | um expresso de um operador privado | `demo-gtfs-expressos` |
| `demo.osm.xml` | bicicletas, táxis, sítios e a rota do urbano da câmara, com a forma de um extrato do OpenStreetMap | `demo-osm` |
| `tabelas/` | o transporte a pedido (um ficheiro por concelho) e o urbano da câmara, em tabela | `demo-tabelas` |

## O que se prometeu ao inventar

- **Nenhum nome coincide com um lugar português.** Foram todos procurados no
  OpenStreetMap antes de ficarem; dois que existiam saíram.
- **Fica no mar alto**, a mais de cem quilómetros da costa — longe de qualquer
  território de cliente e das caixas das regiões de prova.
- **Sem telefones e sem endereços de ninguém.** Os endereços são do domínio
  `example.org`, que o RFC 2606 reserva para isto; o transporte a pedido não
  tem número de reservas, porque um número inventado é o número de alguém.
- **A ligação ao comboio é de propósito**: a linha 2 parte da estação de Porto
  Ameno sete minutos depois de chegar o comboio de norte, e chega oito antes
  de partir o que vai para lá. É a viagem que a demonstração mostra no
  planeador.
