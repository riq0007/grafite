import { colunasDosAtivos } from '@grafite/domain';
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

  // As larguras de fábrica das colunas da coleta mudaram na change celulas-numa-linha (design,
  // decisão 4): quem nunca mexeu nelas continua sem nada guardado, e a visão não fica personalizada.
  it('as colunas da coleta na largura de fábrica do domínio não ficam guardadas na visão', () => {
    const daColeta = colunasDosAtivos({
      tipos: [
        {
          situacao: 'ativo',
          capacidades: ['rede.disponibilidade', 'snmp.suprimentos', 'controlid.saude'],
          campos: [],
        },
      ],
      campos: [],
      verRestritos: false,
    }).filter(({ chave }) => chave.startsWith('coleta.'));
    const deFabrica = new Map(daColeta.map(({ chave, largura }) => [chave, largura]));
    expect(daColeta).toHaveLength(4);
    expect(
      colunasComLarguras(
        daColeta.map(({ chave }) => ({ chave })),
        deFabrica,
        deFabrica,
      ),
    ).toEqual(daColeta.map(({ chave }) => ({ chave })));
  });
});
