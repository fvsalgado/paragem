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
