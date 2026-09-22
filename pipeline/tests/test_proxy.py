"""O proxy do motor, corrido a sério contra um motor de mentira.

O CLAUDE.md §7 pede «só a API GraphQL necessária, atrás de um proxy com
limites». Uma configuração de proxy que nunca correu é uma promessa, não uma
proteção — e as promessas de segurança por cumprir são piores do que nenhuma,
porque dão a quem as lê a ideia de que está coberto. É a mesma razão do teste
das somas de verificação.

Estes testes levantam um nginx com a configuração VERDADEIRA — a mesma que o
`docker-compose.yml` monta — apontada a um servidor de brincar, e verificam o
que ela deixa passar e o que não deixa.

Saltam-se quando não há nginx instalado, a dizer porquê.
"""

from __future__ import annotations

import http.server
import os
import re
import shutil
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

CONF = Path("otp/proxy/nginx.conf")
ORIGEM = "https://exemplo.invalid"


def _porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class _MotorDeMentira(http.server.BaseHTTPRequestHandler):
    """Responde a tudo com 200. O que interessa é o que LÁ CHEGA."""

    recebidos: list[tuple[str, str]] = []

    def do_POST(self) -> None:  # noqa: N802 — nome imposto pelo http.server
        self._registar()
        corpo = b'{"data":{"plan":{"itineraries":[]}}}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self) -> None:  # noqa: N802
        self._registar()
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def _registar(self) -> None:
        type(self).recebidos.append((self.command, self.path))

    def log_message(self, *_a) -> None:
        pass


@pytest.fixture(scope="module")
def proxy(raiz):
    if not shutil.which("nginx"):
        pytest.skip("sem nginx — `apt-get install nginx-light` para correr estes testes")

    conf = raiz / CONF
    if not conf.exists():
        pytest.skip(f"falta {CONF}")

    porta_motor = _porta_livre()
    porta_proxy = _porta_livre()

    servidor = http.server.HTTPServer(("127.0.0.1", porta_motor), _MotorDeMentira)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()

    # A configuração verdadeira, com duas substituições e nenhuma mais: o
    # `upstream`, que no compose é o nome do serviço, e a origem permitida, que
    # vem do ambiente. Se este teste tivesse de mudar mais alguma coisa, deixava
    # de estar a testar o que vai para produção.
    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="proxy-"))
    texto = conf.read_text(encoding="utf-8")
    texto = texto.replace("server motor:8080;", f"server 127.0.0.1:{porta_motor};")
    texto = texto.replace("${PARAGEM_ORIGEM}", ORIGEM)
    texto = texto.replace("listen 8080;", f"listen 127.0.0.1:{porta_proxy};")

    completa = tmp / "nginx.conf"
    completa.write_text(
        "worker_processes 1;\n"
        f"error_log {tmp}/erro.log;\n"
        f"pid {tmp}/nginx.pid;\n"
        "events { worker_connections 64; }\n"
        "http {\n"
        f"  access_log {tmp}/acesso.log;\n"
        f"  client_body_temp_path {tmp}/corpo;\n"
        f"  proxy_temp_path {tmp}/proxy;\n"
        f"  fastcgi_temp_path {tmp}/fastcgi;\n"
        f"  uwsgi_temp_path {tmp}/uwsgi;\n"
        f"  scgi_temp_path {tmp}/scgi;\n"
        f"{texto}\n"
        "}\n",
        encoding="utf-8",
    )

    r = subprocess.run(
        ["nginx", "-t", "-c", str(completa)], capture_output=True, text=True, timeout=30
    )
    assert r.returncode == 0, f"a configuração do proxy não é válida:\n{r.stderr}"

    proc = subprocess.Popen(
        ["nginx", "-c", str(completa), "-g", "daemon off;"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env={**os.environ, "PATH": os.environ.get("PATH", "")},
    )
    base = f"http://127.0.0.1:{porta_proxy}"
    for _ in range(60):
        try:
            urllib.request.urlopen(f"{base}/nada", timeout=1)
            break
        except urllib.error.HTTPError:
            break
        except Exception:  # noqa: BLE001 — ainda não arrancou
            time.sleep(0.2)
    else:
        proc.kill()
        pytest.skip("o nginx não arrancou")

    yield base, _MotorDeMentira
    proc.terminate()
    proc.wait(timeout=10)
    servidor.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)


def _pedir(url: str, metodo: str = "GET", corpo: bytes | None = None) -> tuple[int, dict]:
    pedido = urllib.request.Request(url, data=corpo, method=metodo)
    if corpo is not None:
        pedido.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(pedido, timeout=10) as r:
            return r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers)


# --- o que passa ------------------------------------------------------------


def test_o_planeador_passa(proxy):
    base, motor = proxy
    motor.recebidos.clear()
    codigo, _ = _pedir(f"{base}/otp/gtfs/v1", "POST", b'{"query":"{plan{itineraries{duration}}}"}')
    assert codigo == 200
    assert motor.recebidos, "o pedido tinha de chegar ao motor"


def test_a_saude_passa_e_nao_leva_limite(proxy):
    """O orquestrador consulta isto de trinta em trinta segundos.

    Limitá-lo dava reinícios em cascata precisamente quando há carga — que é
    quando não se quer reiniciar nada.
    """
    base, _ = proxy
    for _ in range(30):
        codigo, _ = _pedir(f"{base}/saude")
        assert codigo == 200


# --- o que NÃO passa --------------------------------------------------------


def test_a_interface_de_depuracao_do_otp_nao_passa(proxy):
    """O OTP serve uma interface de depuração e o ficheiro do grafo.

    Nada disso é preciso ao sítio, e tudo isso é superfície. Responde 404 e não
    403: um 403 confirmava que existe.
    """
    base, motor = proxy
    for caminho in (
        "/otp/routers/default/index/graphql",
        "/otp/debug/",
        "/otp/routers/default/index/graphiql",
        "/otp/transmodel/v3",
        "/graph.obj",
        "/otp/",
    ):
        motor.recebidos.clear()
        codigo, _ = _pedir(f"{base}{caminho}")
        assert codigo == 404, f"{caminho} devia dar 404 e deu {codigo}"
        assert not motor.recebidos, f"{caminho} chegou ao motor — o proxy deixou passar"


def test_um_get_na_api_nao_passa(proxy):
    """Um GET com a consulta no endereço é mais fácil de abusar, e o planeador não o usa.

    405 e não 403: não é uma tentativa de entrar onde não se pode, é o método
    errado num sítio que existe e que o próprio sítio usa.
    """
    base, motor = proxy
    for metodo in ("GET", "PUT", "DELETE"):
        motor.recebidos.clear()
        codigo, _ = _pedir(f"{base}/otp/gtfs/v1", metodo)
        assert codigo == 405, f"{metodo} devia dar 405 e deu {codigo}"
        assert not motor.recebidos, f"{metodo} chegou ao motor"


def test_um_corpo_enorme_nao_passa(proxy):
    """Um pedido do planeador tem ~900 bytes. Um megabyte é um ataque."""
    base, motor = proxy
    motor.recebidos.clear()
    codigo, _ = _pedir(f"{base}/otp/gtfs/v1", "POST", b'{"query":"' + b"x" * 200_000 + b'"}')
    assert codigo == 413, f"esperava 413 (corpo grande demais) e deu {codigo}"
    assert not motor.recebidos


def test_o_limite_de_ritmo_aperta(proxy):
    """Cada pedido é um cálculo de caminhos, não um ficheiro servido.

    Sem limite, um portátil derruba isto. Com ele, quem passa da conta ouve
    429 — «estás a pedir depressa demais» — e não 503, que diria que o serviço
    está em baixo quando não está.
    """
    base, _ = proxy
    corpo = b'{"query":"{plan{itineraries{duration}}}"}'
    codigos = [_pedir(f"{base}/otp/gtfs/v1", "POST", corpo)[0] for _ in range(40)]
    assert 429 in codigos, f"o limite não apertou: {sorted(set(codigos))}"
    assert 200 in codigos, "o limite apertou de mais: nem os primeiros passaram"


# --- a origem ---------------------------------------------------------------


def test_a_origem_permitida_nao_e_um_asterisco(raiz):
    """Um `*` deixa qualquer página do mundo gastar o nosso CPU.

    Não se testa em execução porque o valor vem do ambiente de quem aloja; o
    que se verifica é que a configuração não o crava nem o deixa aberto.
    """
    texto = (raiz / CONF).read_text(encoding="utf-8")
    cabecalhos = re.findall(r"Access-Control-Allow-Origin\s+(\S+)", texto)
    assert cabecalhos, "a configuração tem de tratar de CORS: o sítio vive noutro domínio"
    for valor in cabecalhos:
        assert valor != "*", "a origem não pode ser `*`"
        assert valor.startswith("$"), f"a origem tem de vir do ambiente, e está cravada: {valor}"


def test_o_pedido_previo_responde(proxy):
    """Sem resposta ao OPTIONS, o navegador nem chega a tentar o POST."""
    base, _ = proxy
    codigo, cabecalhos = _pedir(f"{base}/otp/gtfs/v1", "OPTIONS")
    assert codigo == 204
    assert cabecalhos.get("Access-Control-Allow-Origin") == ORIGEM
    assert "POST" in (cabecalhos.get("Access-Control-Allow-Methods") or "")


def test_o_pedido_previo_nao_conta_para_o_limite(proxy):
    """Este teste existe por uma decisão errada que ele próprio apanhou.

    A primeira versão limitava o `OPTIONS` como tudo o resto. O pedido prévio é
    respondido aqui mesmo, sem tocar no motor — não custa nada —, mas o
    navegador manda-o ANTES do pedido a sério. Levar 429 no prévio é ficar sem
    planeador até o navegador esquecer o resultado, que pode ser um dia
    inteiro. É punir quem usa mais do que quem abusa.

    Corre DEPOIS do teste do limite de ritmo de propósito: se os prévios
    contassem, este apanhava a cota já gasta — foi exatamente assim que o
    defeito apareceu.
    """
    base, _ = proxy
    corpo = b'{"query":"{plan{itineraries{duration}}}"}'
    # Gastar a cota primeiro.
    for _ in range(40):
        _pedir(f"{base}/otp/gtfs/v1", "POST", corpo)
    # E o prévio tem de passar na mesma.
    for _ in range(20):
        codigo, _c = _pedir(f"{base}/otp/gtfs/v1", "OPTIONS")
        assert codigo == 204, f"o pedido prévio levou {codigo} com a cota gasta"
