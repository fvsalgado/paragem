import type { Metadata } from 'next';
import Link from 'next/link';
import { NAO_ENCONTRADA } from '@/lib/formato';

export const metadata: Metadata = { title: NAO_ENCONTRADA };

/**
 * A página que não existe, DENTRO DE UMA REGIÃO — com a casa à volta.
 *
 * Era a do Next.js: «404 | This page could not be found.», em inglês, em letra
 * de sistema, sem cabeçalho e sem caminho de volta. Num serviço público
 * português, e com outro aspeto, parecia um sítio partido.
 *
 * E é das páginas mais visitadas de quem chega de fora: os identificadores das
 * paragens vêm dos dados de quem publica a rede, e uma republicação pode
 * renumerá-los. Uma ligação guardada nos favoritos, partilhada numa
 * mensagem ou impressa num cartaz na paragem passa a dar aqui. Quem chega tem
 * de ter para onde ir, e são três sítios: o mapa (onde se procura), a lista
 * das paragens e a rede.
 *
 * Não sabe que região é — a convenção do Next não lhe passa os parâmetros —,
 * e não precisa: vive dentro do invólucro da região, que já pôs o cabeçalho, a
 * marca da demonstração e o rodapé; e a região é o anfitrião, por isso `/` é
 * o início dela. O estado HTTP continua a ser 404.
 */
export default function PaginaQueNaoExiste() {
  return (
    <>
      <h1>Esta página não existe</h1>
      <p>
        Pode ter mudado de endereço quando os horários foram atualizados: as paragens e as linhas
        mudam de identificador de tempos a tempos, e as ligações antigas deixam de levar aqui.
      </p>
      <p className="cartao-accoes">
        <Link className="botao" href="/">
          Ir para o mapa
        </Link>
        <Link href="/rede/paragens/">Procurar uma paragem</Link>
        <Link href="/rede/">Ver a rede</Link>
      </p>
    </>
  );
}
