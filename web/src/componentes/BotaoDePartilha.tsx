'use client';

import { useEffect, useState } from 'react';
import IconeDePartilha from '@/componentes/IconeDePartilha';

/**
 * «PARTILHAR», na paragem e na linha: o endereço da página, pela folha de
 * partilha do telemóvel quando ela existe, e copiado quando não existe — e aí
 * diz-se que se copiou, num `role="status"` que o leitor de ecrã lê sem tirar
 * o foco do botão.
 *
 * Quem manda a paragem a alguém mandava-a pelo endereço da barra, quando o
 * encontrava: o navegador do telemóvel esconde-o, e a aplicação instalada nem
 * barra tem.
 *
 * O ENDEREÇO É O CANÓNICO (`caminho`, o mesmo dos metadados da página), na
 * origem onde se está — o domínio da região. Não é o da barra, que traz o
 * que quem chegou trouxe — uma âncora, os parâmetros de uma procura —, e quem
 * recebe a ligação quer a página. O título é o da página, que já diz a
 * paragem ou a linha, e a região.
 *
 * UM BOTÃO COM TEXTO, e não só o ícone: «Partilhar» lê-se, e um ícone sozinho
 * pede a quem o vê que adivinhe.
 */
export default function BotaoDePartilha({ caminho }: { caminho: string }) {
  const [estado, setEstado] = useState('');

  // A frase sai ao fim de uns segundos: ficava a dizer «copiada» muito depois
  // de interessar, e um segundo toque não se anunciava por ser a mesma frase.
  useEffect(() => {
    if (!estado) return;
    const t = setTimeout(() => setEstado(''), 6000);
    return () => clearTimeout(t);
  }, [estado]);

  async function partilhar() {
    const endereco = new URL(caminho, window.location.origin).href;
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url: endereco });
        return;
      } catch (e) {
        // Fechar a folha sem escolher nada não é um erro; outra recusa é, e
        // aí copia-se, como num navegador sem folha.
        if (e instanceof Error && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(endereco);
      setEstado('Ligação copiada');
    } catch {
      setEstado(`Não foi possível copiar. A ligação é: ${endereco}`);
    }
  }

  // O BOTÃO E A FRASE LADO A LADO NO TEXTO, e não numa caixa só: numa caixa,
  // a frase de «copiada» alargava-a, e a caixa inteira — o botão com ela —
  // saltava para a linha de baixo debaixo do dedo. Assim o botão fica onde
  // está, e é só a frase que corre para onde couber.
  return (
    <>
      <button type="button" className="partilhar" onClick={partilhar}>
        <IconeDePartilha />
        Partilhar
      </button>
      <span role="status" className="estado-da-partilha secundario">
        {estado}
      </span>
    </>
  );
}
