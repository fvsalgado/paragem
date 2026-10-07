import Link from 'next/link';
import { AUTOR, CODIGO, CONTACTO, correioPara } from '@/lib/produto';
import { EscolhaDoTema } from './EscolherTema';

/**
 * O rodapé das páginas do produto: com quem se fala, o que é de quem, e onde
 * está o código.
 *
 * Dizia só «O código é livre, sob AGPL-3.0-only…», sem ligação para o código
 * nem contacto nenhum. Quem chega ao fim da página convencido tem de ter para
 * onde ir — e um endereço escrito por extenso serve também a quem não tem um
 * programa de correio configurado, que é quem fica parado diante de um
 * `mailto:` que não abre nada.
 */
export default function RodapeDoProduto({ origem = '' }: { origem?: string }) {
  const em = (caminho: string) => `${origem}${caminho}`;
  return (
    <footer className="rodape rodape-do-produto">
      <span className="regua-do-feixe" aria-hidden="true" />
      <div className="interior">
        <nav aria-label="Rodapé">
          <ul>
            <li>
              <Link href={em('/contacto/')}>Contacto</Link>
            </li>
            <li>
              <Link href={em('/acessibilidade/')}>Acessibilidade</Link>
            </li>
            <li>
              <Link href={em('/privacidade/')}>Privacidade</Link>
            </li>
            <li>
              <a href={CODIGO}>O código</a>
            </li>
          </ul>
        </nav>
        <EscolhaDoTema />
        <p>
          O Paragem.pt é desenhado e desenvolvido por {AUTOR.nome}. Contacto:{' '}
          <a href={correioPara('Paragem.pt')} className="endereco-de-correio">
            {CONTACTO}
          </a>
          .
        </p>
        <p>
          O código é livre, sob AGPL-3.0-only. «Paragem.pt» é o nome do produto e não é abrangido
          pela licença do código.
        </p>
      </div>
    </footer>
  );
}
