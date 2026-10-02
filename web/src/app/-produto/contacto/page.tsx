import { AUTOR, CONTACTO, SEGURANCA, correioPara } from '@/lib/produto';
import { metadadosDoProduto } from '@/lib/metadados';

export const metadata = metadadosDoProduto({
  titulo: 'Contacto',
  descricao:
    'Marcar uma demonstração, pedir uma proposta ou perguntar o que for sobre o Paragem.pt.',
  caminho: '/contacto/',
});

/**
 * Com quem se fala — a página que faltava a quem já está convencido.
 *
 * Dava 404: a montra não tinha contacto nenhum, nem correio, nem telefone, nem
 * formulário (P4-003). O endereço vem do ambiente, com omissão no que o
 * repositório já publica (`lib/produto.ts`).
 *
 * O ENDEREÇO ESTÁ ESCRITO, E NÃO SÓ LIGADO. Um `mailto:` sem programa de
 * correio configurado — quem usa o correio no navegador — não abre nada, e
 * quem carrega fica sem saber para onde escrever. Escrito por extenso, e
 * selecionável de um toque, copia-se para onde se quiser.
 *
 * Sem formulário, de propósito: um formulário guardava o que se escreve num
 * sítio nosso, e isso é um tratamento de dados que esta casa não precisa de
 * fazer para responder a um email.
 */
export default function Contacto() {
  return (
    <div className="produto-texto">
      <h1>Falar connosco</h1>
      <p className="produto-entrada">
        Para marcar uma demonstração, pedir uma proposta ou perguntar o que for sobre o Paragem.pt,
        escreva para:
      </p>
      <p className="correio-por-extenso">
        <span className="endereco-de-correio">{CONTACTO}</span>
      </p>
      <ul className="linha-accoes produto-botoes">
        <li>
          <a className="botao" href={correioPara('Marcar uma demonstração do Paragem.pt')}>
            Marcar uma demonstração
          </a>
        </li>
        <li>
          <a className="botao secundario" href={correioPara('Pedido de proposta do Paragem.pt')}>
            Pedir proposta
          </a>
        </li>
      </ul>
      <p className="secundario">
        Os dois botões abrem o seu programa de correio com o assunto já escrito. Se não abrirem
        nada, copie o endereço acima.
      </p>

      <h2>O que ajuda a responder</h2>
      <ul>
        <li>o território: a comunidade intermunicipal, a área metropolitana ou o concelho;</li>
        <li>os transportes que lá circulam, e quem os opera;</li>
        <li>
          o que já está publicado — horários em GTFS, horários em PDF, o sítio da operadora ou o da
          autoridade;
        </li>
        <li>quem, do vosso lado, vai acompanhar a entrada.</li>
      </ul>
      <p>Não é preciso ter tudo isto à mão para escrever: a primeira conversa serve para o ver.</p>

      <h2>Quem responde</h2>
      <p>{AUTOR.nome}, que desenha e desenvolve o Paragem.pt.</p>

      <h2>Uma falha de segurança</h2>
      <p>
        Comunica-se em privado, como diz a <a href={SEGURANCA}>política de segurança do código</a>,
        e não num pedido público no repositório.
      </p>
    </div>
  );
}
