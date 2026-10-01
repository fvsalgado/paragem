import { manifesto, respostaDeManifesto } from '@/lib/manifesto';

/**
 * `GET /manifest.webmanifest` no anfitrião do produto. O de cada região é
 * outro (`app/[regiao]/manifest.webmanifest`): chama-se como ela e abre nela.
 */
export function GET(): Response {
  return respostaDeManifesto(
    manifesto({
      nome: 'Paragem.pt',
      nomeCurto: 'Paragem.pt',
      descricao: 'Os transportes de um território, num sítio só.',
    }),
  );
}
