import Link from 'next/link';
import { exigirRegiao, url } from '@/lib/dados';

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
        <p>
          Horários planeados. {r.rede?.nome ? `Rede ${r.rede.nome}` : 'Rede'} gerida por{' '}
          {r.autoridade?.nome ?? 'a autoridade de transportes'}
          {r.rede?.operador ? `, com operação de ${r.rede.operador}` : ''}.
        </p>
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
