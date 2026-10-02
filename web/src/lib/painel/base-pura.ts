/**
 * O que se diz da base do painel sem falar com ela — puro, para se testar sem
 * servidor (`base.ts` é `server-only`, e por isso não se importa num teste).
 */

/** O que o PostgREST diz quando recusa: a frase da função, em português. */
export class ErroDaBase extends Error {
  // Campos declarados à mão, e não no construtor: o Node corre os testes
  // tirando os tipos, e não sabe tirar propriedades de parâmetro.
  readonly estado: number;
  readonly codigo?: string;

  constructor(mensagem: string, estado: number, codigo?: string) {
    super(mensagem);
    this.name = 'ErroDaBase';
    this.estado = estado;
    this.codigo = codigo;
  }
}

/**
 * Como a chave vai em cada pedido, conforme o tipo dela — a mesma regra do
 * pipeline (`publicacao.cabecalhos_da_chave`), e pela mesma razão.
 *
 * AS CHAVES NOVAS NÃO SÃO JWT. Uma `sb_secret_…` vai só no `apikey`: posta
 * também num `Authorization: Bearer`, o Supabase tenta lê-la como JWT, e a
 * documentação dele (nas limitações conhecidas das chaves novas) diz que isso
 * não é suportado. Foi assim que a primeira publicação do pipeline com uma
 * chave nova viu as escritas recusadas, com o balde a responder às leituras
 * como se nada fosse. Aqui parecia passar — e era o comportamento que a
 * documentação diz não suportar, à espera do dia em que deixasse de passar.
 *
 * A chave antiga é um JWT e vai nos dois, como sempre foi: é o `Authorization`
 * que diz ao PostgREST com que papel se fala.
 */
export function cabecalhosDaChave(chaveDeServico: string): Record<string, string> {
  if (chaveDeServico.startsWith('sb_')) return { apikey: chaveDeServico };
  return { apikey: chaveDeServico, authorization: `Bearer ${chaveDeServico}` };
}

/**
 * `true` quando a base respondeu que a tabela ou a função NÃO EXISTE — uma
 * migração por aplicar, e não uma avaria.
 *
 * É o que deixa o sítio novo correr antes de a migração chegar à base de
 * produção: as contas por pessoa (0009) faltam, e o painel continua a abrir ao
 * dono como abria, em vez de rebentar. O PostgREST diz «não existe» de duas
 * maneiras conforme a versão — o código do Postgres (`42P01`, `42883`) ou o
 * dele (`PGRST205` para a tabela, `PGRST202` para a função) —, sempre com 404.
 */
export function ehEsquemaPorAplicar(erro: unknown): boolean {
  if (!(erro instanceof ErroDaBase)) return false;
  return (
    erro.estado === 404 && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(erro.codigo ?? '')
  );
}

/**
 * A frase para quem carregou no botão — em português, e a dizer o que fazer.
 *
 * As funções da base já falam assim («não se desliga a última região
 * ligada»). O que escapava eram as RESTRIÇÕES DAS TABELAS, que respondem na
 * língua do Postgres: um domínio colado com «https://» devolvia «new row for
 * relation "region_domain_aliases" violates check constraint …» a um técnico
 * de uma autoridade de transportes (P4-012). O painel já normaliza o que pode
 * antes de enviar; isto traduz o que ainda assim voltar, e deixa passar tal
 * e qual o que já vem em português.
 */
export function traduzirErro(erro: unknown): string {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const codigo = erro instanceof ErroDaBase ? erro.codigo : undefined;
  const estado = erro instanceof ErroDaBase ? erro.estado : undefined;

  if (codigo === '23514' || /violates check constraint/i.test(mensagem)) {
    if (/domain/i.test(mensagem)) {
      return 'o endereço tem de ser só o domínio — por exemplo, transportes.exemplo.pt —, sem https://, sem barras e sem espaços';
    }
    if (/email/i.test(mensagem)) return 'o email não se lê como um endereço de correio';
    if (/telefone/i.test(mensagem)) {
      return 'o telefone só leva algarismos, espaços, o sinal + e parênteses';
    }
    if (/reclamacao/i.test(mensagem)) {
      return 'o endereço de reclamação tem de ser completo, a começar por https://';
    }
    if (/responsavel|outra_tem_nome/i.test(mensagem)) {
      return 'falta o nome de quem responde pelos dados';
    }
    if (/prazo|ends_on|fim/i.test(mensagem)) return 'o fim não pode vir antes do começo';
    if (/titulo|texto/i.test(mensagem)) return 'o título e o texto não podem ficar em branco';
    return 'um dos valores não é aceite — confirma o que escreveste';
  }
  if (codigo === '23505' || /duplicate key/i.test(mensagem)) {
    return 'esse valor já está em uso noutro sítio do painel';
  }
  if (codigo === '22P02' || codigo === '22007' || codigo === '22008') {
    return 'um dos valores não se lê — uma data, um número ou um identificador';
  }
  if (estado === 0 && /SUPABASE_SERVICE_ROLE_KEY/.test(mensagem)) {
    return 'o painel não tem a chave da base configurada';
  }
  if (/fetch failed|timeout|aborted|ECONNREFUSED/i.test(mensagem)) {
    return 'não foi possível falar com a base — tenta outra vez daqui a pouco';
  }
  return mensagem;
}

/**
 * Um domínio como se cola da barra do navegador → o domínio, e só ele.
 *
 * «https://www.Exemplo.pt/horarios/» é o gesto natural de quem copia um
 * endereço, e a base só aceita «www.exemplo.pt». Tira-se o esquema, o caminho,
 * a porta, a barra e os espaços, e baixa-se a caixa; o que sobrar e não for um
 * nome de domínio volta com a frase de `traduzirErro`, e não chega à base.
 */
export function normalizarDominio(entrada: string): string {
  let d = entrada.trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  d = d.split(/[/?#]/)[0] ?? '';
  d = d.replace(/:\d+$/, '').replace(/\.+$/, '');
  return d.trim();
}

/** Um nome de domínio que pode responder na rede: letras, dígitos, hífens e pelo menos um ponto. */
export function dominioValido(d: string): boolean {
  return (
    d.length <= 253 &&
    /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      d,
    )
  );
}
