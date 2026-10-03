import Link from '@/componentes/Ligacao';
import { exigirRegiao, url } from '@/lib/dados';
import { redeEQuemAGere } from '@/lib/prosa';
import { ORIGEM_DO_PRODUTO } from '@/lib/dados-do-navegador';

export default async function Rodape({ regiao: id }: { regiao: string }) {
  const r = await exigirRegiao(id);
  return (
    <footer className="rodape">
      <span className="regua-do-feixe" aria-hidden="true" />
      <div className="interior">
        <nav aria-label="Rodapé">
          <ul>
            <li>
              {/* UM NOME POR COISA (P2-042): «Dados abertos» aqui, no menu e no
                  título da página. Eram «Dados e licenças» num sítio e «Dados
                  abertos» noutro, e quem procurava um não achava o outro. */}
              <Link href={url(id, 'dados-abertos/')}>Dados abertos</Link>
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
            <li>
              {/* AS CAIXAS PARA OS SÍTIOS DAS CÂMARAS (P4-007), onde quem gere
                  o sítio de uma câmara ou de uma junta as vai procurar. */}
              <Link href={url(id, 'levar/')}>Para o seu sítio</Link>
            </li>
          </ul>
        </nav>
        {/* A FRASE QUE NOMEIA O CLIENTE, em todas as páginas. Dizia «Rede Rede
            Alta gerida por Comunidade Intermunicipal…, com operação de …»:
            sem os artigos e com a palavra repetida (`prosa.ts`). */}
        <p>Horários planeados. {redeEQuemAGere(r)}.</p>
        <Atribuicoes r={r} />
        {/* A ASSINATURA DO PRODUTO, discreta e no fim (P4-008, P3-029). O
            sítio é da autoridade, e quem o fez assina por baixo — como num
            livro, e não na capa. Leva à página do produto, noutro domínio. */}
        <p className="feito-com">
          Feito com <a href={ORIGEM_DO_PRODUTO}>Paragem.pt</a>
        </p>
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
