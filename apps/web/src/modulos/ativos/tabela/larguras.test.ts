import { describe, expect, it } from 'vitest';
import { colunasComLarguras } from './larguras.ts';

const PADROES = new Map([
  ['ativo.rotulo', 280],
  ['ativo.local', 220],
  ['ativo.patrimonio', 140],
]);

describe('as larguras do redimensionamento', () => {
  it('guarda só a largura que difere da padrão da coluna', () => {
    expect(
      colunasComLarguras(
        [{ chave: 'ativo.rotulo' }, { chave: 'ativo.local' }, { chave: 'ativo.patrimonio' }],
        new Map([
          ['ativo.rotulo', 280],
          ['ativo.local', 300],
          ['ativo.patrimonio', 140],
        ]),
        PADROES,
      ),
    ).toEqual([
      { chave: 'ativo.rotulo' },
      { chave: 'ativo.local', largura: 300 },
      { chave: 'ativo.patrimonio' },
    ]);
  });

  it('a largura que volta à padrão deixa de ser guardada, e a coluna sem medida fica como estava', () => {
    expect(
      colunasComLarguras(
        [
          { chave: 'ativo.local', largura: 300 },
          { chave: 'ip', largura: 90 },
        ],
        new Map([['ativo.local', 220]]),
        PADROES,
      ),
    ).toEqual([{ chave: 'ativo.local' }, { chave: 'ip', largura: 90 }]);
  });
});
