import { Aviso, Certo, Informacao } from '@/componentes/Icones';

/**
 * UMA PASTILHA DE ESTADO: o ícone e a palavra, e a cor só a confirmar.
 *
 * Os estados diziam-se de três maneiras — uma cápsula cinzenta, um texto a
 * vermelho, um traço à esquerda — e algumas só pela cor, que é o que o
 * critério 1.4.1 não deixa: quem não distingue o laranja do verde ficava sem
 * saber se a estação tinha autocarro à porta. Aqui o ícone tem forma própria
 * em cada estado (o triângulo, o visto, o «i»), e a palavra diz o resto.
 *
 * - `atencao`: pede cuidado sem mudar os planos («sem autocarro perto»);
 * - `alerta`: muda os planos («suprimida», «fechada»);
 * - `certo`: está como devia («com autocarro à porta»);
 * - `informacao`: uma nota («horários planeados»).
 *
 * Para textos de uma linha. Uma frase comprida não vai numa cápsula — fica
 * oval, com o texto encostado à curva (auditoria de 1/11/2026, #167).
 */
export default function Estado({
  tipo,
  children,
}: {
  tipo: 'atencao' | 'alerta' | 'certo' | 'informacao';
  children: React.ReactNode;
}) {
  const Icone = tipo === 'certo' ? Certo : tipo === 'informacao' ? Informacao : Aviso;
  return (
    <span className={`estado estado-${tipo}`}>
      <Icone tamanho={16} />
      <span>{children}</span>
    </span>
  );
}
