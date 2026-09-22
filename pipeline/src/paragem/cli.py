"""`uv run pipeline …`.

Um comando por coisa, e `build` faz tudo: descarrega, constrói, verifica e
escreve o relatório.

O código de saída importa: `build` sai com 1 se houver lacunas que bloqueiem,
porque é isso que faz o CI reprovar. Lacunas que não bloqueiam saem com 0 e
ficam no relatório — é a diferença entre «não produz um feed utilizável» e
«produz um feed incompleto, e diz onde».
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__, verificacoes
from .construcao import construir
from .regiao import ErroDeRegiao, carregar, carregar_todas
from .relatorio import AVISO, BLOQUEIA, LACUNA


def _raiz(args: argparse.Namespace) -> Path:
    return Path(args.raiz).resolve()


def _regioes(args: argparse.Namespace):
    raiz = _raiz(args)
    if getattr(args, "todas", False):
        return carregar_todas(raiz)
    if not getattr(args, "regiao", None):
        raise SystemExit(
            "diz qual: --regiao <id> ou --todas. Há: "
            + ", ".join(r.id for r in carregar_todas(raiz))
        )
    return [carregar(raiz, args.regiao)]


def _cmd_build(args: argparse.Namespace) -> int:
    raiz = _raiz(args)
    falhou = False
    for regiao in _regioes(args):
        print(f"\n── {regiao.nome_com_artigo} ({regiao.id}) ──")
        c = construir(
            raiz,
            regiao,
            descarregar=not args.sem_rede,
            so={args.leitor} if args.leitor else None,
            exigir_validador=args.exigir_validador,
        )
        rel = c.relatorio
        cont = rel.contagem_por_gravidade()
        for chave, valor in sorted(rel.saidas.items()):
            print(f"   {chave} → {valor}")
        print(
            f"   {cont[BLOQUEIA]} bloqueiam · {cont[LACUNA]} lacunas · {cont[AVISO]} avisos"
            f"  →  build/reports/{regiao.id}.md"
        )
        for lac in rel.bloqueios:
            print(f"   ✗ {lac.o_que}")
            if lac.porque_importa:
                print(f"     {lac.porque_importa}")
        falhou = falhou or rel.tem_bloqueios
    return 1 if falhou else 0


def _cmd_fetch(args: argparse.Namespace) -> int:
    from .fontes import ACESSO_AUTOMATICO, ErroDeFonte, Registo

    raiz = _raiz(args)
    registo = Registo.carregar(raiz)
    precisas = sorted({f for r in _regioes(args) for f in r.fontes_usadas})
    falhou = False
    for id_fonte in precisas:
        fonte = registo.obter(id_fonte)
        if fonte.acesso != ACESSO_AUTOMATICO:
            print(f"   ·  {id_fonte}: {fonte.acesso}, não se descarrega")
            continue
        try:
            caminho = registo.descarregar(id_fonte)
            print(f"   ✓  {id_fonte} → {caminho.relative_to(raiz)}")
        except ErroDeFonte as e:
            print(f"   ✗  {id_fonte}: {e}")
            falhou = True
    return 1 if falhou else 0


def _cmd_validate(args: argparse.Namespace) -> int:
    """Corre o validador sobre os feeds já construídos, sem construir nada.

    O `build` já valida. Isto existe para o caso em que se quer voltar a
    perguntar sem esperar pela construção toda — e porque o §7 do briefing
    prometeu quatro comandos, e um comando prometido que não existe é uma
    promessa por cumprir como qualquer outra.
    """
    from . import validador

    raiz = _raiz(args)
    falhou = False
    for regiao in _regioes(args):
        pasta = raiz / "build" / regiao.id / "gtfs"
        feeds = sorted(pasta.glob("*.zip")) if pasta.is_dir() else []
        print(f"\n── {regiao.nome_com_artigo} ({regiao.id}) ──")
        if not feeds:
            print("   não há feeds construídos. Corre `pipeline build` primeiro.")
            falhou = True
            continue
        for feed in feeds:
            try:
                relatorio = validador.validar(raiz, feed)
            except Exception as e:  # noqa: BLE001 — a razão interessa ao utilizador
                print(f"   ✗ {feed.name}: o validador não correu — {e}")
                falhou = True
                continue
            avisos = relatorio.get("notices", [])
            erros = sum(a["totalNotices"] for a in avisos if a["severity"] == "ERROR")
            atencoes = sum(a["totalNotices"] for a in avisos if a["severity"] == "WARNING")
            marca = "✓" if erros == 0 else "✗"
            print(f"   {marca} {feed.name}: {erros} erros, {atencoes} avisos")
            for a in sorted(avisos, key=lambda x: (x["severity"], -x["totalNotices"])):
                if a["severity"] in ("ERROR", "WARNING"):
                    print(f"       {a['severity']:8s} {a['totalNotices']:6d}  {a['code']}")
            falhou = falhou or erros > 0
    return 1 if falhou else 0


def _cmd_grafo(args: argparse.Namespace) -> int:
    """Constrói o grafo do motor de viagens a partir do que o `build` produziu.

    Existe para que a construção do grafo seja um passo do pipeline e não uma
    linha de comando que alguém guardou no histórico (CLAUDE.md §4.6). O que é
    preciso saber — que feeds entram, que fuso, quanta memória — está declarado
    na receita da região, não aqui.
    """
    from . import motor

    raiz = _raiz(args)
    falhou = False
    for regiao in _regioes(args):
        print(f"\n── {regiao.nome_com_artigo} ({regiao.id}) ──")
        if not regiao.motor:
            print("   não declara `motor:` na receita — região sem grafo, e isso é legítimo.")
            continue
        try:
            g = motor.construir(raiz, regiao, raiz / "build" / regiao.id, memoria=args.memoria)
        except Exception as e:  # noqa: BLE001 — a razão interessa toda a quem corre
            print(f"   ✗ {type(e).__name__}: {e}")
            falhou = True
            continue

        graves = [a for a in g.avisos if "ERROR" in a]
        print(f"   ✓ {g.ficheiro.relative_to(raiz)}  ·  {g.memoria_mb} MB  ·  {g.segundos:.0f}s")
        if g.registo:
            print(f"     registo em {g.registo.relative_to(raiz)}")

        # Os problemas SOBRE OS NOSSOS DADOS primeiro, e separados dos do
        # OpenStreetMap: uma lista em que a maioria não é para fazer nada
        # deixa de se ler, e o que é nosso fica enterrado no que não é.
        problemas = g.problemas()
        nossos = {k: v for k, v in problemas.items() if k in motor.NOSSOS}
        deles = sum(v for k, v in problemas.items() if k not in motor.NOSSOS)
        if nossos:
            print("     o que o OTP levanta sobre os NOSSOS dados:")
            for classe, quantos in nossos.items():
                print(f"       {quantos:6,d}  {classe}")
                print(f"               {motor.NOSSOS[classe]}")
        if deles:
            print(f"     (e {deles:,} sobre o OpenStreetMap — ilhas, viragens, geometria)")
        for a in graves[:10]:
            print(f"       ERRO: {a[:150]}")
    return 1 if falhou else 0


def _cmd_mosaicos(args: argparse.Namespace) -> int:
    """Gera os mosaicos vetoriais do mapa a partir do recorte OSM da região.

    Um passo do pipeline e não uma linha de comando guardada no histórico
    (§4.6) — e do MESMO OpenStreetMap que o motor de viagens usa, para que o
    mapa não desenhe uma estrada por onde o planeador não passa.
    """
    from . import mosaicos

    raiz = _raiz(args)
    falhou = False
    for regiao in _regioes(args):
        print(f"\n── {regiao.nome_com_artigo} ({regiao.id}) ──")
        try:
            m = mosaicos.construir(raiz, regiao, memoria=args.memoria)
        except mosaicos.ErroDeMosaicos as e:
            # Uma região sem recorte OSM não tem mapa, e isso é legítimo: a
            # interface di-lo em vez de desenhar um mapa vazio.
            print(f"   sem mapa: {e}")
            continue
        except Exception as e:  # noqa: BLE001 — a razão interessa toda
            print(f"   ✗ {type(e).__name__}: {e}")
            falhou = True
            continue
        print(f"   ✓ {m.ficheiro.relative_to(raiz)}  ·  {m.megabytes:.0f} MB  ·  {m.segundos:.0f}s")
    return 1 if falhou else 0


def _cmd_sitio(args: argparse.Namespace) -> int:
    """Escreve o que o sítio lê, a partir do que o `build` produziu.

    O sítio não abre GTFS: duas implementações do mesmo formato divergem, e a
    divergência aparece como uma paragem que a página diz que a linha serve e
    o planeador diz que não.
    """
    from . import sitio as mod_sitio
    from .construcao import _limites
    from .fontes import Registo
    from .leitores.base import Contexto
    from .relatorio import Relatorio

    raiz = _raiz(args)
    falhou = False
    for regiao in _regioes(args):
        destino = raiz / "build" / regiao.id
        print(f"\n── {regiao.nome_com_artigo} ({regiao.id}) ──")
        if not (destino / "gtfs").is_dir():
            print("   não há feeds construídos. Corre `pipeline build` primeiro.")
            falhou = True
            continue

        # Os limites servem para atribuir cada paragem ao seu concelho. Sem
        # eles a atribuição é pelo prefixo do `stop_id`, que é indício e não
        # prova — e a página do concelho passa a contar a mais.
        ctx = Contexto(
            regiao=regiao,
            registo=Registo.carregar(raiz),
            raiz=raiz,
            destino=destino,
            relatorio=Relatorio(regiao=regiao.id),
            descarregar=False,
        )
        territorio = _limites(ctx, ctx.registo)

        s = mod_sitio.construir(raiz, regiao, destino, territorio)
        grandes = sorted(s.saidas, key=lambda x: -x.bytes)[:6]
        total = sum(x.bytes for x in s.saidas)
        print(
            f"   ✓ {len(s.saidas)} ficheiros · {total / 1e6:.1f} MB · {s.destino.relative_to(raiz)}"
        )
        for x in grandes:
            print(f"       {x.bytes / 1024:8.0f} kB  {x.caminho.name:24} {x.registos} registos")
        if territorio is None:
            print("     ATENÇÃO: sem carta administrativa — concelhos pelo prefixo do stop_id")
        # O `sitio` LIMPA A PASTA antes de escrever, e os transbordos vivem lá
        # dentro. Quem correr só isto fica com uma grelha horária sem
        # transbordos — e o planeador do navegador não levanta.
        if (destino / "sitio" / "viagens.json").exists() and not (
            destino / "sitio" / "transbordos.json"
        ).exists():
            print(f"     falta correr: uv run pipeline transbordos --regiao {regiao.id}")
    return 1 if falhou else 0


def _cmd_transbordos(args: argparse.Namespace) -> int:
    """Calcula os transbordos a pé com o motor, e guarda-os para o navegador.

    Corre DEPOIS do `sitio` e com o motor levantado: precisa da lista de
    paragens que o `viagens.json` já tem, e do grafo de ruas que só o motor
    sabe percorrer.

    É aqui que o OTP muda de papel. Deixa de ser um servidor que responde a
    quem viaja e passa a ser uma ferramenta que responde uma vez por
    construção — e a resposta é que viaja.
    """
    import json as _json

    from . import transbordos as mod

    raiz = _raiz(args)
    falhou = False
    for regiao in _regioes(args):
        destino = raiz / "build" / regiao.id / "sitio"
        grelha = destino / "viagens.json"
        print(f"\n── {regiao.nome_com_artigo} ({regiao.id}) ──")
        if not grelha.exists():
            print("   não há grelha horária. Corre `pipeline sitio` primeiro.")
            falhou = True
            continue
        paragens = _json.loads(grelha.read_text(encoding="utf-8"))["paragens"]

        # O DIA NÃO MUDA A RESPOSTA A UMA PERGUNTA A PÉ, mas o OTP exige um, e
        # exige que caia dentro do calendário do grafo. Usa-se o primeiro dia
        # que a grelha conhece — que é, por construção, um dia válido.
        dia = min(_json.loads(grelha.read_text(encoding="utf-8"))["datas"])
        dia = f"{dia[:4]}-{dia[4:6]}-{dia[6:]}"

        r = mod.calcular(paragens, args.motor, dia, args.raio, args.trabalhadores)
        bytes_ = mod.escrever(destino / "transbordos.json", r, args.raio)
        print(
            f"   ✓ {len(r.pares)} transbordos · {bytes_ / 1024:.0f} kB · "
            f"fator de desvio {r.fator_de_desvio}"
        )
        print(
            f"     {r.pelo_motor} pelo motor · {r.em_linha_reta} em linha reta "
            f"(sem resposta) · {r.acima_do_teto} acima do teto, deitados fora"
        )
        # SEM MOTOR NÃO SE FINGE QUE HOUVE. Se tudo veio em linha reta, o
        # ficheiro existe mas não vale o que promete, e é melhor falhar já do
        # que publicar transbordos inventados.
        if args.motor and r.pelo_motor == 0:
            print("     ERRO: o motor não respondeu a nenhum par. Está levantado?")
            falhou = True
        elif not args.motor:
            print("     sem motor: os tempos são em linha reta, e o ficheiro di-lo")
    return 1 if falhou else 0


def _cmd_publicar(args: argparse.Namespace) -> int:
    """Envia o que o sítio lê para o armazém e avisa o sítio (CLAUDE.md §11.7).

    As credenciais vêm do ambiente e não de argumentos, para nunca ficarem
    num histórico de shell nem num registo do CI:

      SUPABASE_URL                 https://<ref>.supabase.co
      SUPABASE_SERVICE_ROLE_KEY    a chave de serviço — só aqui, nunca no sítio
      PARAGEM_SITIO_URL            https://www.paragem.pt  (para avisar)
      REVALIDATE_SECRET            o mesmo que o sítio tem  (para avisar)

    Sem as duas primeiras não há publicação. Sem as duas últimas publica-se na
    mesma e não se avisa: as páginas refazem-se sozinhas dentro de uma hora.
    """
    import os

    from . import publicacao

    url = os.environ.get("SUPABASE_URL", "").strip()
    chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not chave:
        print(
            "sem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente não se publica nada",
            file=sys.stderr,
        )
        return 2
    sitio = os.environ.get("PARAGEM_SITIO_URL", "").strip()
    segredo = os.environ.get("REVALIDATE_SECRET", "").strip()
    avisar = None
    if args.sem_avisar:
        print("   --sem-avisar: o sítio não é avisado; as páginas refazem-se dentro de uma hora")
    elif sitio and segredo:
        avisar = publicacao.avisador_do_sitio(sitio, segredo)
    else:
        print(
            "   sem PARAGEM_SITIO_URL e REVALIDATE_SECRET: publica-se sem avisar o sítio, "
            "e as páginas refazem-se dentro de uma hora"
        )

    armazem = publicacao.ArmazemSupabase(url, chave, balde=args.balde)
    raiz = _raiz(args)
    falhou = False
    for regiao in _regioes(args):
        print(f"\n── {regiao.nome_com_artigo} ({regiao.id}) → {args.balde}/{regiao.id}/ ──")
        try:
            r = publicacao.publicar(raiz, regiao.id, armazem, avisar)
        except publicacao.ErroDePublicacao as e:
            print(f"   ERRO: {e}", file=sys.stderr)
            falhou = True
            continue
        mb = r.bytes_enviados / 1048576
        print(
            f"   {r.enviados} enviados ({mb:.1f} MB) · {r.iguais} já iguais · {r.apagados} apagados"
        )
        if r.avisado is True:
            print("   o sítio foi avisado e vai refazer as páginas desta região")
        elif r.avisado is False:
            print("   o sítio NÃO aceitou o aviso; as páginas refazem-se dentro de uma hora")
            falhou = True
    return 1 if falhou else 0


def _cmd_report(args: argparse.Namespace) -> int:
    raiz = _raiz(args)
    vazio = True
    for regiao in _regioes(args):
        caminho = raiz / "build" / "reports" / f"{regiao.id}.md"
        if caminho.exists():
            print(caminho.read_text(encoding="utf-8"))
            vazio = False
        else:
            print(f"{regiao.id}: ainda não há relatório. Corre `pipeline build`.")
    return 0 if not vazio else 1


def _cmd_bloqueios(args: argparse.Namespace) -> int:
    raiz = _raiz(args)
    falhou = False
    for regiao in _regioes(args):
        r = verificacoes.bloqueios(raiz, regiao.id)
        r.imprimir()
        falhou = falhou or not r.ok
    return 1 if falhou else 0


def _cmd_regioes(args: argparse.Namespace) -> int:
    """Que regiões é que estas raízes declaram, e o que cada uma sabe fazer.

    Existe porque o CI precisava de saber, e a alternativa era o CI NOMEÁ-LAS.
    O §11.5 promete que uma região nova entra sem um commit de código; um fluxo
    que diga `--regiao <nome>` quinze vezes quebra essa promessa à primeira, e
    quebrava-a em silêncio — a região nova entrava, e não era construída.

    Também responde à pergunta que se faz quando se monta uma raiz de fora:
    «o `PARAGEM_RAIZES` está a apanhar o que eu penso?». Antes disto, a
    maneira de saber era provocar um erro e ler a lista na mensagem dele.
    """
    raiz = _raiz(args)
    todas = carregar_todas(raiz)

    # A REDE VIÁRIA, E NÃO O MOTOR, É O QUE SEPARA UM TRANSBORDO CALCULADO DE
    # UM EM LINHA RETA. Uma região pode declarar `motor:` só com GTFS — o grafo
    # constrói-se e responde a viagens —, e mesmo assim não ter por onde
    # caminhar. Perguntar «tem motor?» punha o CI a pedir ao OTP uma caminhada
    # sobre um mapa sem ruas, e a receber silêncio.
    if args.com_ruas:
        todas = [r for r in todas if r.motor.get("osm")]
    elif args.sem_ruas:
        todas = [r for r in todas if not r.motor.get("osm")]

    if args.ids:
        for r in todas:
            print(r.id)
        return 0

    if not todas:
        print("nenhuma região declarada. Ver docs/RAIZES.md e PARAGEM_RAIZES.")
        return 0

    largura = max(len(r.id) for r in todas)
    for r in todas:
        # A raiz DE DADOS, e não a pasta da região: o que interessa dizer é de
        # que raiz ela veio — é essa a pergunta quando se monta uma de fora.
        de_fora = r.raiz_de_dados.resolve() != raiz.resolve()
        onde = f"  ← {r.raiz_de_dados}" if de_fora else ""
        sabe = []
        if r.motor:
            sabe.append("motor")
        if r.motor.get("osm"):
            sabe.append("ruas")
        print(f"  {r.id:<{largura}}  {r.nome_com_artigo}  [{', '.join(sabe) or 'catálogo'}]{onde}")
    return 0


def _cmd_verificar(args: argparse.Namespace, qual: str) -> int:
    raiz = _raiz(args)
    if qual == "proveniencia":
        r = verificacoes.proveniencia(raiz)
    elif qual == "regioes":
        r = verificacoes.regioes(raiz, exigir_construcao=not args.sem_construcao)
    else:
        r = verificacoes.numeros(raiz)
    r.imprimir()
    return 0 if r.ok else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="pipeline",
        description="Paragem.pt — o pipeline de dados de transportes, por região.",
    )
    p.add_argument("--version", action="version", version=f"paragem {__version__}")
    p.add_argument("--raiz", default=".", help="a raiz do repositório (por omissão, a pasta atual)")
    sub = p.add_subparsers(dest="comando", required=True)

    def com_regiao(sp):
        sp.add_argument("--regiao", help="o identificador de uma região")
        sp.add_argument("--todas", action="store_true", help="todas as regiões declaradas")
        return sp

    b = com_regiao(sub.add_parser("build", help="descarrega, constrói, verifica e relata"))
    b.add_argument(
        "--sem-rede",
        action="store_true",
        help="usa só o que já está em .cache e em data/manual",
    )
    b.add_argument("--leitor", help="corre só as saídas deste leitor")
    b.add_argument(
        "--exigir-validador",
        action="store_true",
        help=(
            "trata «o validador não correu» como bloqueio em vez de aviso. É para o CI, "
            "onde o validador tem de estar disponível: uma corrida verde em que a verificação "
            "não aconteceu é pior do que uma vermelha."
        ),
    )
    b.set_defaults(func=_cmd_build)

    f = com_regiao(sub.add_parser("fetch", help="descarrega as fontes automáticas"))
    f.set_defaults(func=_cmd_fetch)

    vl = com_regiao(
        sub.add_parser("validate", help="corre o validador sobre os feeds já construídos")
    )
    vl.set_defaults(func=_cmd_validate)

    mo = com_regiao(sub.add_parser("mosaicos", help="gera os mosaicos vetoriais do mapa"))
    mo.add_argument(
        "--memoria",
        default="4g",
        help="memória do Planetiler (medido: 4g chegam para uma região deste tamanho)",
    )
    mo.set_defaults(func=_cmd_mosaicos)

    gr = com_regiao(sub.add_parser("grafo", help="constrói o grafo do motor de viagens"))
    gr.add_argument(
        "--memoria",
        default="6G",
        help=(
            "memória máxima da JVM para a construção (por omissão 6G). O briefing dizia "
            "«2–4 GB deverão chegar; confirmar» — o número medido fica na receita da região."
        ),
    )
    gr.set_defaults(func=_cmd_grafo)

    st = com_regiao(sub.add_parser("sitio", help="escreve os dados que o sítio lê"))
    st.set_defaults(func=_cmd_sitio)

    tr = com_regiao(
        sub.add_parser("transbordos", help="tempos a pé entre paragens vizinhas, pelo motor")
    )
    tr.add_argument("--motor", default="http://127.0.0.1:8801", help="endereço do OTP levantado")
    tr.add_argument("--raio", type=int, default=400, help="metros até onde há transbordo")
    tr.add_argument("--trabalhadores", type=int, default=8, help="pedidos em paralelo")
    tr.set_defaults(func=_cmd_transbordos)

    pb = com_regiao(
        sub.add_parser(
            "publicar",
            help="envia o que o sítio lê para o armazém público e avisa o sítio",
        )
    )
    pb.add_argument("--balde", default="sitio", help="o balde do Storage (por omissão, «sitio»)")
    pb.add_argument(
        "--sem-avisar",
        action="store_true",
        help="não chama /api/revalidate no fim (as páginas refazem-se dentro de uma hora)",
    )
    pb.set_defaults(func=_cmd_publicar)

    rp = com_regiao(sub.add_parser("report", help="mostra o relatório de lacunas"))
    rp.set_defaults(func=_cmd_report)

    cp = sub.add_parser("check-proveniencia", help="sources.yaml × REUSE.toml × TERCEIROS.md")
    cp.set_defaults(func=lambda a: _cmd_verificar(a, "proveniencia"))

    cr = sub.add_parser("check-regioes", help="o multi-região, verificado")
    cr.add_argument(
        "--sem-construcao",
        action="store_true",
        help="salta a busca de fugas nas saídas (que exige build/)",
    )
    cr.set_defaults(func=lambda a: _cmd_verificar(a, "regioes"))

    cb = com_regiao(
        sub.add_parser("check-bloqueios", help="bloqueios desta construção vs os já conhecidos")
    )
    cb.set_defaults(func=_cmd_bloqueios)

    rg = sub.add_parser("regioes", help="que regiões é que estas raízes declaram")
    rg.add_argument("--ids", action="store_true", help="só os identificadores, um por linha")
    rg.add_argument(
        "--com-ruas",
        action="store_true",
        dest="com_ruas",
        help="só as que têm rede viária no motor, logo sabem responder a pé",
    )
    rg.add_argument(
        "--sem-ruas",
        action="store_true",
        dest="sem_ruas",
        help="só as outras",
    )
    rg.set_defaults(func=_cmd_regioes)

    cn = sub.add_parser("check-numeros", help="os números do §6 contra o repositório")
    cn.set_defaults(func=lambda a: _cmd_verificar(a, "numeros"))

    args = p.parse_args(argv)
    try:
        return int(args.func(args))
    except ErroDeRegiao as e:
        print(f"erro na declaração da região: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
