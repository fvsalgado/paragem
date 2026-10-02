/**
 * OS PONTOS DA REGIÃO NO NAVEGADOR — pedidos à parte, e não dentro da página.
 *
 * Iam embutidos no HTML do mapa, das direções e de «A rede»: 2 573 pontos,
 * 410 kB em bruto, numa página de 431 (P3-006). E iam também na carga de cada
 * pré-carregamento dessas páginas, que todas as outras faziam pelo cabeçalho
 * (P3-008). O texto da página esperava por eles para se pintar, e o telemóvel
 * analisava-os outra vez a cada página aberta.
 *
 * Agora são um ficheiro — o `procura.json` que o pipeline já publica —, pedido
 * DEPOIS da primeira pintura e uma vez por visita: as páginas que o usam
 * partilham este pedido, e o navegador guarda a resposta. O mapa pede-o assim
 * que abre (são os pontos que desenha); a procura de «A rede» só quando se
 * escreve; o «Perto de ti» só quando se sabe onde se está.
 *
 * A LEITURA É A MESMA DO SERVIDOR (`pontosDaProcura`), e os módulos que o
 * painel desligou saem daqui como saíam de lá.
 */
import { useEffect, useState } from 'react';
import { enderecoDosDados } from './dados-do-navegador';
import { pontosDaProcura, type Ponto, type ProcuraCrua } from './formato';
import { semModulosDesligados } from './modulos';

const pedidos = new Map<string, Promise<Ponto[]>>();

/**
 * Os pontos desta região, sem os dos módulos desligados.
 *
 * **Uma falha não fica guardada**, como na tabela dos dias: a resposta que não
 * chegou por a rede ter caído não é uma região sem pontos, e o pedido seguinte
 * volta a tentar.
 */
export function pedirPontos(regiao: string, desligados: readonly string[] = []): Promise<Ponto[]> {
  let p = pedidos.get(regiao);
  if (!p) {
    p = fetch(enderecoDosDados(regiao, 'procura.json'))
      .then((r) => {
        // O que não existe é uma região sem pontos — uma resposta. O resto é
        // falta de resposta, e diz-se como tal.
        if (r.status === 404 || r.status === 400) return { campos: [], pontos: [] };
        if (!r.ok) throw new Error(`procura.json: HTTP ${r.status}`);
        return r.json() as Promise<ProcuraCrua>;
      })
      .then(pontosDaProcura)
      .catch((e) => {
        pedidos.delete(regiao);
        throw e;
      });
    pedidos.set(regiao, p);
  }
  return p.then((todos) => semModulosDesligados(todos, desligados));
}

/** Os pontos enquanto chegam: `null` à espera, a lista quando chegam, `falhou` sem resposta. */
export type PontosNoNavegador = Ponto[] | null | 'falhou';

/**
 * Os pontos como estado de um componente. Com `pedir` a falso não se pede
 * nada — é o que deixa a procura e o «Perto de ti» esperarem pelo gesto de
 * quem os usa. `tentar` volta a pedir depois de uma falha.
 */
export function usePontos(
  regiao: string,
  desligados: readonly string[] = [],
  pedir = true,
): { pontos: PontosNoNavegador; tentar: () => void } {
  const [pontos, setPontos] = useState<PontosNoNavegador>(null);
  const [vez, setVez] = useState(0);
  const chave = [...desligados].sort().join('+');
  useEffect(() => {
    if (!pedir) return;
    let vivo = true;
    pedirPontos(regiao, desligados)
      .then((p) => vivo && setPontos(p))
      .catch(() => vivo && setPontos('falhou'));
    return () => {
      vivo = false;
    };
    // `desligados` muda de identidade a cada renderização; o que conta é o conteúdo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regiao, chave, pedir, vez]);
  return {
    pontos,
    tentar: () => {
      setPontos(null);
      setVez((n) => n + 1);
    },
  };
}
