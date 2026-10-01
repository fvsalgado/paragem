import Link from 'next/link';
import { exigirRegiao, url } from '@/lib/dados';
import { redeEQuemAGere } from '@/lib/prosa';

export default async function Rodape({ regiao: id }: { regiao: string }) {
  const r = await exigirRegiao(id);
  return (
    <footer className="rodape">
      <div className="interior">
        <nav aria-label="Rodapé">
          <ul>
            <li>
              <Link href={url(id, 'dados-abertos/')}>Dados e licenças</Link>
            </li>
            <li>
              <Link href={url(id, 'acessibilidade/')}>Acessibilidade</Link>
            </li>
            <li>
              <Link href={url(id, 'privacidade/')}>Privacidade</Link>
            </li>
            <li>
              <Link href={url(id, 'avisos/')}>Avisos</Link>
            </li>
          </ul>
        </nav>
        {/* A FRASE QUE NOMEIA O CLIENTE, em todas as páginas. Dizia «Rede Rede
            Alta gerida por Comunidade Intermunicipal…, com operação de …»:
            sem os artigos e com a palavra repetida (`prosa.ts`). */}
        <p>Horários planeados. {redeEQuemAGere(r)}.</p>
        {/* A ODbL não é uma boa maneira: é uma obrigação que segue a obra
            derivada. Os mapas e as estações de bicicletas vêm do
            OpenStreetMap. */}
        <p>
          Mapas e localizações de bicicletas e táxis: © contribuidores do{' '}
          <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, sob ODbL. Limites
          administrativos: Direção-Geral do Território, CC BY 4.0.
        </p>
      </div>
    </footer>
  );
}
