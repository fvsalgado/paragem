import qrcode from 'qrcode-generator';

/**
 * UM CÓDIGO QR EM SVG, feito no servidor: o endereço da página da paragem, na
 * folha que se afixa.
 *
 * Desenha-se como um caminho só (`d`), um quadrado por módulo escuro, sem uma
 * linha de JavaScript no navegador. Correção de erros «M» (15 %): aguenta uma
 * folha riscada ou meio molhada sem fazer o código crescer tanto como o «H».
 * A margem silenciosa de quatro módulos é a da norma, e vai dentro do desenho.
 */
export function codigoQr(texto: string): { lado: number; caminho: string } {
  const qr = qrcode(0, 'M');
  qr.addData(texto, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const margem = 4;
  const partes: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.isDark(y, x)) partes.push(`M${x + margem} ${y + margem}h1v1h-1z`);
    }
  }
  return { lado: n + margem * 2, caminho: partes.join('') };
}
