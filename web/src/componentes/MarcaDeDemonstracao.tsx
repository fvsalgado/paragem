import { exigirRegiao } from '@/lib/dados';

/**
 * A faixa que diz que a rede não existe.
 *
 * Enquanto o sítio servia uma região de cada vez, quem o abria sabia o que
 * estava a ver. Agora a demonstração e uma região a sério vivem no mesmo
 * endereço, e distingui-las deixou de ser evidente: os dois sítios têm
 * paragens, linhas, horários e o mesmo aspeto — que é precisamente o objetivo
 * da demonstração.
 *
 * Por isso a marca vai no invólucro e não em cada página: uma marca que se
 * esquece numa página é pior do que nenhuma, porque as outras ensinaram a
 * confiar.
 */
export default async function MarcaDeDemonstracao({ regiao: id }: { regiao: string }) {
  const r = await exigirRegiao(id);
  if (!r.demonstracao) return null;
  return (
    <p className="marca-demonstracao" role="note">
      <strong>Demonstração.</strong> {r.nome_com_artigo} não existe: as paragens, as linhas e os
      horários desta região são inventados, para mostrar o produto sem usar dados de ninguém.
    </p>
  );
}
