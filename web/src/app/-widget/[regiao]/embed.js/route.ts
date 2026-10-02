/**
 * `GET /widget/embed.js` — a linha que a câmara cola no sítio dela (P4-007).
 *
 * Põe a caixa num `<iframe>` mesmo a seguir ao `<script>`, com o título que
 * o leitor de ecrã anuncia, e ajusta-lhe a altura quando ela a diz
 * (`AlturaParaOAnfitriao`) — só a mensagem que vem da própria caixa, e só a
 * altura. Não põe cookies, não lê nada da página onde está, não segue
 * ninguém. Um atributo que não se reconheça ignora-se: um erro de escrita do
 * lado da câmara nunca deixa a caixa em branco.
 *
 * O mesmo para todas as regiões: a origem tira-se do próprio `src` do script,
 * e é por ela que a caixa sai do domínio certo.
 */
const CODIGO = `(function () {
  var s = document.currentScript;
  if (!s || !s.src) return;
  var origem = new URL(s.src).origin;
  var d = s.dataset || {};
  var paragem = (d.paragem || '').trim();
  var caminho = paragem
    ? '/widget/paragem/' + encodeURIComponent(paragem) + '/'
    : '/widget/viagem/';
  var quantas = parseInt(d.quantas || '', 10);
  if (paragem && quantas >= 1 && quantas <= 10) caminho += '?quantas=' + quantas;
  var f = document.createElement('iframe');
  f.src = origem + caminho;
  f.title = d.titulo || (paragem ? 'Próximas partidas' : 'Para onde vais?');
  f.loading = 'lazy';
  f.style.border = '0';
  f.style.width = '100%';
  f.style.maxWidth = '30rem';
  f.style.display = 'block';
  f.style.height = (paragem ? 380 : 190) + 'px';
  s.parentNode.insertBefore(f, s.nextSibling);
  window.addEventListener('message', function (e) {
    if (e.origin !== origem || e.source !== f.contentWindow) return;
    var m = e.data;
    if (m && m.paragem === 'altura' && typeof m.altura === 'number' && m.altura > 0) {
      f.style.height = Math.min(Math.ceil(m.altura), 2000) + 'px';
    }
  });
})();
`;

export const dynamic = 'force-static';

/** Uma linha por região, rendida à primeira e servida da cache daí em diante. */
export function generateStaticParams() {
  return [];
}

export function GET(): Response {
  return new Response(CODIGO, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      // Um dia: a linha muda pouco, e quem a colou não tem de esperar por ela.
      'cache-control': 'public, max-age=86400',
    },
  });
}
