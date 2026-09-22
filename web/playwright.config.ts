import { defineConfig, devices } from '@playwright/test';

/**
 * Os testes correm contra o sítio JÁ CONSTRUÍDO, a correr com `next start`,
 * a ler os dados de um servidor local que serve `build/` com a forma do
 * armazém (`scripts/servir-dados.mjs`).
 *
 * Não contra o `next dev`: o que se publica é o que `next build` produz, e um
 * teste que passe em desenvolvimento e falhe no que vai para o ar não prova
 * nada. E não contra o armazém a sério: o CI não tem rede para os dados nem
 * deve ter — o que se testa é o código, com os dados que a mesma corrida
 * acabou de construir.
 *
 * DOIS SERVIDORES, e a ordem importa: os dados primeiro, porque o sítio os
 * lê na primeira visita a cada página. Ambos se reaproveitam quando já estão
 * a correr — é o que o CI faz, que os levanta uma vez para o rastreio das
 * ligações, o axe e o Lighthouse.
 *
 * E UM ANFITRIÃO POR REGIÃO: cada região responde no seu domínio, e nos
 * testes os domínios são `*.localhost` (`tests/anfitrioes.ts`). O `baseURL` é
 * o da região EM TESTE — a que tem dados reais, se esta raiz tiver alguma;
 * senão a demonstração, e os casos que precisam de uma rede a sério saltam
 * com a razão escrita. A construção do sítio tem de ter levado o mesmo
 * `PARAGEM_DOMINIOS` e `NEXT_PUBLIC_PARAGEM_PRODUTO=http://127.0.0.1:4321`.
 *
 * O NAVEGADOR: por omissão o Playwright usa o que descarregou. Num ambiente
 * onde já há um Chromium instalado — e onde a versão dele não bate certo com
 * a build que este Playwright espera —, `PARAGEM_CHROMIUM` aponta-lhe o
 * caminho e evita descarregar 150 MB para usar o que já lá está.
 */
import { BASE, DOMINIOS, PORTA, PRODUTO } from './tests/anfitrioes';

const DADOS = process.env.PARAGEM_DADOS ?? 'http://127.0.0.1:4322';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // A região em teste, no seu anfitrião; ver `tests/anfitrioes.ts`.
    baseURL: BASE,
    trace: 'off',
    launchOptions: {
      // Os `*.localhost` resolvem AQUI, no navegador, e não no DNS da máquina:
      // é o que faz isto correr igual no CI, num portátil e numa caixa sem
      // `systemd-resolved`. O Chromium já trata `localhost` assim; a regra
      // estende-o aos subdomínios.
      args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1'],
      ...(process.env.PARAGEM_CHROMIUM ? { executablePath: process.env.PARAGEM_CHROMIUM } : {}),
    },
  },
  projects: [
    {
      name: 'telemovel',
      // Telemóvel primeiro: o briefing diz mobile-first, e a maior parte de
      // quem procura um autocarro procura-o na paragem.
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/servir-dados.mjs ../build 4322',
      url: 'http://127.0.0.1:4322/',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `npx next start -p ${PORTA}`,
      // A montra responde ao anfitrião que não é de ninguém: é o sinal de vida.
      url: `${PRODUTO}/`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        PARAGEM_DADOS: DADOS,
        PARAGEM_DOMINIOS: process.env.PARAGEM_DOMINIOS ?? DOMINIOS,
        PARAGEM_ESQUEMA: 'http',
        // Um módulo desligado na região de prova, para se provar que o
        // interruptor faz efeito sem base nenhuma (`tests/modulos.spec.ts`).
        PARAGEM_MODULOS_DESLIGADOS: process.env.PARAGEM_MODULOS_DESLIGADOS ?? 'prova=taxi',
      },
    },
  ],
});
