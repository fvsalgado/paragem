/**
 * A prosa que o sítio escreve com números e com nomes.
 *
 * Cada caso aqui foi lido no sítio: «1 paragens perto», «Os outros 1 são obra
 * da casa», «Demonstração. a Serra da Pedra Alta não existe», «Rede Rede Alta
 * gerida por Comunidade Intermunicipal…», «é do Comunidade Intermunicipal».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aAutoridade,
  aRede,
  fraseDaProposta,
  linhasNumaFrase,
  lista,
  nomeDaRede,
  numero,
  plural,
  redeEQuemAGere,
  regiaoNoInicio,
} from '../src/lib/prosa.ts';

test('o número e o nome concordam, e os milhares separam-se como a casa os escreve', () => {
  assert.equal(plural(1, 'paragem perto', 'paragens perto'), '1 paragem perto');
  assert.equal(plural(3, 'paragem perto', 'paragens perto'), '3 paragens perto');
  assert.equal(plural(0, 'viagem', 'viagens'), '0 viagens');
  // «2573» sem separador; a casa escreve «1 931 paragens». Inquebrável, para o
  // número não se partir no fim de uma linha.
  assert.equal(numero(2573), '2 573');
  assert.equal(numero(999), '999');
});

test('uma lista diz «e» antes do último', () => {
  assert.equal(lista([]), '');
  assert.equal(lista(['A']), 'A');
  assert.equal(lista(['A', 'B']), 'A e B');
  assert.equal(lista(['A', 'B', 'C']), 'A, B e C');
});

test('o nome da região abre a frase com maiúscula, venha ou não feito', () => {
  assert.equal(
    regiaoNoInicio({
      nome_com_artigo: 'a Serra da Pedra Alta',
      nome_com_artigo_no_inicio: 'A Serra da Pedra Alta',
    }),
    'A Serra da Pedra Alta',
  );
  // Dados construídos antes do campo existir: faz-se aqui.
  assert.equal(regiaoNoInicio({ nome_com_artigo: 'o Baixo Sável' }), 'O Baixo Sável');
});

test('a rede não se chama «Rede Rede Alta»', () => {
  assert.equal(nomeDaRede({ rede: { nome: 'Sável Bus' } }), 'Rede Sável Bus');
  assert.equal(nomeDaRede({ rede: { nome: 'Rede Alta' } }), 'Rede Alta');
  assert.equal(nomeDaRede({ rede: {} }), 'A rede');
});

test('a rede como complemento: «a rede Sável Bus», «a Rede Alta»', () => {
  // «O Município de Sável gere a rede Sável Bus» — e não «gere Rede Sável
  // Bus», nem «a rede Rede Alta».
  assert.equal(aRede({ rede: { nome: 'Sável Bus' } }), 'a rede Sável Bus');
  assert.equal(aRede({ rede: { nome: 'Rede Alta' } }), 'a Rede Alta');
  assert.equal(aRede({ rede: {} }), 'a rede');
});

test('com os artigos declarados, a frase do rodapé sai com as contrações certas', () => {
  const r = {
    rede: {
      nome: 'Rede Alta',
      operador: 'Alta Transportes',
      operador_por: 'pela Alta Transportes',
    },
    autoridade: {
      nome: 'Comunidade Intermunicipal da Serra da Pedra Alta',
      por: 'pela Comunidade Intermunicipal da Serra da Pedra Alta',
    },
  };
  assert.equal(
    redeEQuemAGere(r),
    'Rede Alta, gerida pela Comunidade Intermunicipal da Serra da Pedra Alta e operada pela Alta Transportes',
  );
});

test('sem os artigos declarados, a frase não adivinha nenhum', () => {
  // Era «Rede Sável Bus gerida por Município de Sável, com operação de Câmara
  // Municipal de Sável» — sem artigo nenhum. Sem a declaração, diz o mesmo
  // sem contrações.
  const r = {
    rede: { nome: 'Sável Bus', operador: 'Câmara Municipal de Sável' },
    autoridade: { nome: 'Município de Sável' },
  };
  assert.equal(
    redeEQuemAGere(r),
    'Rede Sável Bus — gestão: Município de Sável; operação: Câmara Municipal de Sável',
  );
  // Com o da autoridade e sem o do operador, também não se mistura.
  assert.equal(
    redeEQuemAGere({ ...r, autoridade: { ...r.autoridade, por: 'pelo Município de Sável' } }),
    'Rede Sável Bus — gestão: Município de Sável; operação: Câmara Municipal de Sável',
  );
});

test('a autoridade numa frase: feita do pipeline, ou com o substantivo comum à frente', () => {
  // «O contacto … é do Comunidade Intermunicipal»: o artigo da REGIÃO no nome
  // da AUTORIDADE. Sem o artigo dela declarado, a contração fica com
  // «autoridade de transportes», que tem género conhecido.
  const semArtigo = { autoridade: { nome: 'Comunidade Intermunicipal X' } };
  assert.equal(
    aAutoridade(semArtigo, 'de'),
    'da autoridade de transportes (Comunidade Intermunicipal X)',
  );
  assert.equal(aAutoridade({ autoridade: {} }, 'por'), 'pela autoridade de transportes');
  const comArtigo = { autoridade: { nome: 'Município de Sável', de: 'do Município de Sável' } };
  assert.equal(aAutoridade(comArtigo, 'de'), 'do Município de Sável');
});

test('as linhas de uma paragem cabem numa frase, também num terminal com dezenas', () => {
  assert.equal(linhasNumaFrase([]), '');
  assert.equal(linhasNumaFrase(['1']), 'linha 1');
  assert.equal(linhasNumaFrase(['1', '2']), 'linhas 1 e 2');
  assert.equal(linhasNumaFrase(['1', '2', '3']), 'linhas 1, 2 e 3');
  const muitas = Array.from({ length: 20 }, (_, i) => String(i + 1));
  assert.equal(linhasNumaFrase(muitas), 'linhas 1, 2, 3, 4, 5 e mais 15');
});

test('a faixa de uma proposta contrai a autoridade como a região a declara', () => {
  const comArtigo = fraseDaProposta({
    autoridade: {
      nome: 'Comunidade Intermunicipal da Serra',
      de: 'da Comunidade Intermunicipal da Serra',
    },
  });
  assert.equal(comArtigo.titulo, 'Proposta independente.');
  assert.equal(comArtigo.texto, 'Ainda não é um serviço da Comunidade Intermunicipal da Serra.');

  // O município é «o»: «do Município», e não «da Município».
  const municipio = fraseDaProposta({
    autoridade: { nome: 'Município de Sável', de: 'do Município de Sável' },
  });
  assert.equal(municipio.texto, 'Ainda não é um serviço do Município de Sável.');

  // Sem artigo declarado, o substantivo comum leva a contração e o nome não.
  const semArtigo = fraseDaProposta({ autoridade: { nome: 'Comunidade X' } });
  assert.equal(
    semArtigo.texto,
    'Ainda não é um serviço da autoridade de transportes (Comunidade X).',
  );
});

test('a faixa de uma proposta é a que a região declara, quando a declara', () => {
  // A relação com a autoridade é da região: o produto escreve-a tal e qual.
  const autoridade = {
    nome: 'Comunidade Intermunicipal da Serra',
    de: 'da Comunidade Intermunicipal da Serra',
  };
  const declarada = fraseDaProposta({
    autoridade,
    faixa_da_proposta: {
      titulo: 'Proposta à Comunidade da Serra.',
      texto: 'Ainda não é um serviço oficial.',
    },
  });
  assert.equal(declarada.titulo, 'Proposta à Comunidade da Serra.');
  assert.equal(declarada.texto, 'Ainda não é um serviço oficial.');

  // Sem ela — ou a meio, de dados de antes —, a genérica de sempre.
  for (const faixa of [undefined, null, { titulo: 'Proposta.', texto: ' ' }]) {
    const generica = fraseDaProposta({ autoridade, faixa_da_proposta: faixa });
    assert.equal(generica.titulo, 'Proposta independente.');
    assert.equal(generica.texto, 'Ainda não é um serviço da Comunidade Intermunicipal da Serra.');
  }
});

test('a faixa de uma proposta é curta: está em todas as páginas', () => {
  // Num telemóvel eram quatro linhas antes do mapa (1/11/2026). Com o nome de
  // autoridade mais comprido que uma região de prova declara, cabe em duas
  // linhas de um ecrã de 360 px — uns 45 carateres cada.
  const { titulo, texto } = fraseDaProposta({
    autoridade: {
      nome: 'Comunidade Intermunicipal da Serra da Pedra Alta',
      de: 'da Comunidade Intermunicipal da Serra da Pedra Alta',
    },
  });
  assert.ok(`${titulo} ${texto}`.length <= 100, `${titulo} ${texto}`);
});

test('um nome do sistema de reservas escreve-se sem o traço baixo', async () => {
  const { nomeDoSistema } = await import('../src/lib/prosa.ts');
  assert.equal(nomeDoSistema('Circuito Norte_Reforço'), 'Circuito Norte — Reforço');
  assert.equal(nomeDoSistema('Pedra Alta_Lote 2'), 'Pedra Alta — Lote 2');
  assert.equal(nomeDoSistema('Vale Escuro'), 'Vale Escuro');
});

test('uma regra de cartaz escreve-se como o resto do sítio, e diz o mesmo', async () => {
  const { regraLegivel } = await import('../src/lib/prosa.ts');
  assert.equal(
    regraLegivel('horários em vigor a partir de 1 de fevereiro de 2021'),
    'Horários em vigor a partir de 1 de fevereiro de 2021',
  );
  assert.equal(
    regraLegivel('Sábados, exceto feriados, até às 13h58m'),
    'Sábados, exceto feriados, até às 13:58',
  );
  assert.equal(
    regraLegivel('Sábados, exceto Feriados, até às 13h 50m'),
    'Sábados, exceto feriados, até às 13:50',
  );
  assert.equal(
    regraLegivel('(3) Até sairem todos os passageiros'),
    '(3) Até saírem todos os passageiros',
  );
  assert.equal(
    regraLegivel('(1) realiza-se apenas no período escolar'),
    '(1) Realiza-se apenas no período escolar',
  );
  // O que já está bem fica como está — e um nome próprio a meio não se toca.
  const certa = 'Restantes horários efetuam-se nos dias úteis exceto terças-feiras e feriados';
  assert.equal(regraLegivel(certa), certa);
  assert.equal(regraLegivel('Só em Porto Ameno, aos Domingos'), 'Só em Porto Ameno, aos domingos');
});

test('uma estação não repete o concelho nem o sistema que o título já diz', async () => {
  const { semPrefixos } = await import('../src/lib/prosa.ts');
  assert.equal(
    semPrefixos('Porto Ameno - Escola Secundária', ['Porto Ameno', 'Bici Ameno']),
    'Escola Secundária',
  );
  assert.equal(
    semPrefixos('BA - Porto Ameno - Praça da República', ['Porto Ameno', 'BA']),
    'Praça da República',
  );
  // Sem acentos nem maiúsculas a separar: «ALMEAO» é «Almeão».
  assert.equal(semPrefixos('ALMEAO – Piscina Municipal', ['Almeão']), 'Piscina Municipal');
  // O que não é prefixo do título fica; e um nome que ficasse vazio também.
  assert.equal(semPrefixos('Almeão - Estação', ['Porto Ameno']), 'Almeão - Estação');
  assert.equal(semPrefixos('Praça - Norte', ['Praça']), 'Norte');
  assert.equal(semPrefixos('Almeão', ['Almeão']), 'Almeão');
});
