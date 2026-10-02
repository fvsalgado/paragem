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
        <Atribuicoes r={r} />
      </div>
    </footer>
  );
}

/**
 * O QUE AS FONTES DESTA REGIÃO EXIGEM QUE SE DIGA, e mais nada.
 *
 * A ODbL não é uma boa maneira: é uma obrigação que segue a obra derivada, e o
 * CC BY da carta administrativa também. Mas a frase estava ESCRITA AQUI —
 * «Mapas e localizações de bicicletas e táxis: © contribuidores do
 * OpenStreetMap… Limites administrativos: Direção-Geral do Território» — e
 * saía igual em todas as regiões, incluindo as inventadas, que não usam nem um
 * nem outro. Atribuir a alguém o que não fez é o contrário do que a atribuição
 * existe para garantir.
 *
 * Agora vem dos dados: o pipeline junta as atribuições que as fontes da região
 * marcam como obrigatórias. Dados de antes disso não as trazem, e aí fica a
 * frase de antes — que era a certa para as regiões que havia com mapa.
 */
function Atribuicoes({ r }: { r: Awaited<ReturnType<typeof exigirRegiao>> }) {
  if (!r.atribuicoes) {
    return (
      <p>
        Mapas e localizações de bicicletas e táxis: © contribuidores do{' '}
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, sob ODbL. Limites
        administrativos: Direção-Geral do Território, CC BY 4.0.
      </p>
    );
  }
  if (r.atribuicoes.length === 0) {
    // Uma região inventada não deve nada a ninguém — e di-lo, em vez de
    // deixar a dúvida de onde vieram o mapa e as estações.
    return r.demonstracao ? (
      <p>
        Os dados desta região {r.mapa ? 'e o mapa ' : ''}são inventados pelo Paragem.pt, para a
        demonstração.
      </p>
    ) : null;
  }
  return (
    <p>
      Fontes que pedem atribuição:{' '}
      {r.atribuicoes.map((a, i) => (
        <span key={a.texto}>
          {i > 0 ? '; ' : ''}
          {a.url ? <a href={a.url}>{a.texto}</a> : a.texto}
          {a.licenca ? `, ${a.licenca}` : ''}
        </span>
      ))}
      .
    </p>
  );
}
