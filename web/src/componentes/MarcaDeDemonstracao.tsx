import { exigirRegiao } from '@/lib/dados';
import { ORIGEM_DO_PRODUTO } from '@/lib/dados-do-navegador';
import { regiaoNoInicio } from '@/lib/prosa';

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
 *
 * INFORMA, NÃO ALARMA (P4-002). Tinha as cores dos alertas — a borda
 * vermelha, o fundo rosado — e o tom de um erro («não existe»): era a
 * primeira coisa que quem decide lia, e lia-se como uma avaria. O vermelho é
 * dos avisos de serviço, que vão aparecer nesta mesma página; gasto aqui,
 * deixava de dizer «atenção» quando fosse preciso. A faixa passa a ser da
 * marca, diz que é uma demonstração e para que serve, e oferece o caminho a
 * quem a quiser ver a sério.
 */
export default async function MarcaDeDemonstracao({ regiao: id }: { regiao: string }) {
  const r = await exigirRegiao(id);
  if (!r.demonstracao) return null;
  // A MONTRA PELA MORADA DELA, e não por `/`: no domínio desta região, `/` é
  // a própria região. Sem morada declarada não se sabe onde está — e uma
  // ligação que não leva aonde diz é pior do que nenhuma.
  const origem = ORIGEM_DO_PRODUTO === '/' ? null : ORIGEM_DO_PRODUTO;
  // «As Terras … SÃO uma região inventada»: o verbo concorda com o artigo
  // que a região declara, como as contrações.
  const verbo = r.artigo === 'os' || r.artigo === 'as' ? 'são' : 'é';
  return (
    <div className="marca-demonstracao" role="note">
      {/* O NOME ABRE A FRASE, e com maiúscula: era a primeira frase de todas
          as páginas da demonstração, e começava por «Demonstração. a Serra». */}
      <p>
        <strong>Está a ver uma demonstração.</strong> {regiaoNoInicio(r)} {verbo} uma região
        inventada para mostrar o Paragem.pt: as paragens, as linhas e os horários não são reais.
        {origem && (
          <>
            {' '}
            <a href={`${origem}/`}>Conhecer o Paragem.pt</a> ·{' '}
            <a href={`${origem}/contacto/`}>Falar connosco</a>
          </>
        )}
      </p>
    </div>
  );
}
