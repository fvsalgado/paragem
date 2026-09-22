/**
 * O que uma página do painel mostra sem `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * O estado «por configurar» tem a mesma estrutura que qualquer outro: o
 * título da página, e a razão de não haver mais nada debaixo dele. Vive num
 * sítio só para as páginas não divergirem.
 */
export default function SemChaveDeServico({ titulo }: { titulo: string }) {
  return (
    <>
      <h1>{titulo}</h1>
      <p className="faixa alerta">
        Falta <code>SUPABASE_SERVICE_ROLE_KEY</code> no ambiente do servidor. Sem ela o painel não
        lê nem escreve nada — e é o comportamento pretendido: a chave de serviço ignora a proteção
        por linha, e só existe onde há quem responda por ela (<code>docs/ALOJAMENTO.md</code>).
      </p>
    </>
  );
}
