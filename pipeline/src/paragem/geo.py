"""Distâncias entre pontos, com a precisão que o problema pede e não mais.

Duas funções, e a diferença entre elas é deliberada:

- `distancia_km` é haversine sobre a esfera. Serve para decidir se uma
  velocidade é plausível: em linha reta a distância é sempre MENOR do que a
  estrada, e por isso um excesso calculado assim é um excesso a sério.
- `metros` é uma projeção plana local. À escala de uma região — dezenas de
  quilómetros — o erro é de centímetros, e é a que se usa quando há milhões
  de comparações a fazer: dizer se duas paragens são a mesma, ou qual das
  candidatas está mais perto.
"""

from __future__ import annotations

import math

# Metros por grau de latitude, a meio de Portugal continental. A longitude
# encolhe com o cosseno da latitude, e é por isso que ela entra na conta.
_METROS_POR_GRAU_LAT = 110540.0
_METROS_POR_GRAU_LON = 111320.0


def distancia_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Haversine, em quilómetros."""
    r = 6371.0088
    lat1, lon1, lat2, lon2 = (math.radians(x) for x in (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(h))


def metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    """A distância em metros, por projeção plana local."""
    lat1, lon1 = a
    lat2, lon2 = b
    x = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)) * _METROS_POR_GRAU_LON
    y = (lat2 - lat1) * _METROS_POR_GRAU_LAT
    return math.hypot(x, y)
