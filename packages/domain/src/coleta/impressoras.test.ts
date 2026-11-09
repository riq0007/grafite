// As regras da impressora (spec impressoras-por-snmp; change p2b-impressoras-por-snmp, design,
// decisão 5): os casos do PMG (src/lib/snmp-rules.js) e as diferenças que a spec pede, como o nível
// que a impressora não mede, que não vira 100%, e a impressora de uma cor, reconhecida pela própria
// impressora.
import { describe, expect, it } from 'vitest';
import {
  CONDICOES_DA_IMPRESSORA,
  condicoesDosBits,
  contadoresDaImpressora,
  NIVEL_HA_SUPRIMENTO,
  nivelDoSuprimento,
  paginasEmPretoEBranco,
  ROTULOS_DOS_TIPOS_DE_SUPRIMENTO,
  tipoDoSuprimento,
} from './impressoras.ts';

describe('o nível do suprimento', () => {
  it('o percentual da capacidade, arredondado, quando a impressora mede', () => {
    expect(nivelDoSuprimento(1000, 80)).toEqual({ tipo: 'medido', percentual: 8 });
    expect(nivelDoSuprimento(3, 2)).toEqual({ tipo: 'medido', percentual: 67 });
    expect(nivelDoSuprimento(1000, 0)).toEqual({ tipo: 'medido', percentual: 0 });
  });

  it('o nível acima da capacidade passa do 100%, para o lote o gravar como inconsistente', () => {
    expect(nivelDoSuprimento(1000, 1200)).toEqual({ tipo: 'medido', percentual: 120 });
  });

  it('"há suprimento" quando a impressora diz só que ainda há, com ou sem a capacidade', () => {
    expect(NIVEL_HA_SUPRIMENTO).toBe(-3);
    expect(nivelDoSuprimento(1000, -3)).toEqual({ tipo: 'ha-suprimento' });
    expect(nivelDoSuprimento(-2, -3)).toEqual({ tipo: 'ha-suprimento' });
  });

  it('"sem dado" quando a impressora informa a capacidade e não o nível, nunca 100%', () => {
    expect(nivelDoSuprimento(20000, -2)).toEqual({ tipo: 'sem-dado' });
    expect(nivelDoSuprimento(20000, -1)).toEqual({ tipo: 'sem-dado' });
  });

  it('o item sem capacidade e sem nenhuma indicação de nível fica fora', () => {
    expect(nivelDoSuprimento(-2, -2)).toBeNull();
    expect(nivelDoSuprimento(0, 50)).toBeNull();
    expect(nivelDoSuprimento(-1, -1)).toBeNull();
  });
});

describe('o tipo do suprimento pela descrição', () => {
  it('toner, cartucho e tinta são Toner; só a cor também', () => {
    for (const descricao of [
      'Black Toner Cartridge',
      'Cartucho de toner preto',
      'Cyan Ink',
      'Black',
      'Ciano',
      'Magenta',
      'Amarelo',
    ]) {
      expect(tipoDoSuprimento(descricao), descricao).toBe('toner');
    }
  });

  it('a peça que não é toner nunca é Toner, mesmo com a cor na descrição', () => {
    expect(tipoDoSuprimento('Imaging Drum Unit')).toBe('cilindro');
    expect(tipoDoSuprimento('Black Drum Cartridge')).toBe('cilindro');
    expect(tipoDoSuprimento('Cilindro fotocondutor')).toBe('cilindro');
    expect(tipoDoSuprimento('Fuser Kit')).toBe('fusor');
    expect(tipoDoSuprimento('Unidade de fusor')).toBe('fusor');
    expect(tipoDoSuprimento('Waste Toner Box')).toBe('outro');
    expect(tipoDoSuprimento('Maintenance Kit')).toBe('outro');
    expect(tipoDoSuprimento('Transfer Roller')).toBe('outro');
    expect(tipoDoSuprimento('ADF Pad')).toBe('outro');
  });

  it('a descrição sem nada conhecido é Outro, e os rótulos são em pt-BR', () => {
    expect(tipoDoSuprimento('Staples')).toBe('outro');
    expect(tipoDoSuprimento('')).toBe('outro');
    expect(ROTULOS_DOS_TIPOS_DE_SUPRIMENTO).toEqual({
      toner: 'Toner',
      cilindro: 'Cilindro',
      fusor: 'Fusor',
      outro: 'Outro',
    });
  });
});

describe('as condições do equipamento', () => {
  it('o bit 0 é o mais alto do primeiro octeto, e cada condição tem o rótulo e a severidade', () => {
    // 0b0100_1000: o bit 1 (sem papel) e o bit 4 (tampa aberta).
    expect(condicoesDosBits([0b0100_1000])).toEqual(['sem-papel', 'tampa-aberta']);
    // O segundo octeto: o bit 13 (bandeja de entrada vazia) é 0b0000_0100.
    expect(condicoesDosBits([0, 0b0000_0100])).toEqual(['bandeja-de-entrada-vazia']);
    const porChave = Object.fromEntries(
      CONDICOES_DA_IMPRESSORA.map((condicao) => [condicao.chave, condicao]),
    );
    expect(porChave['sem-papel']).toMatchObject({ rotulo: 'Sem papel', severidade: 'critico' });
    expect(porChave['tampa-aberta']).toMatchObject({
      rotulo: 'Tampa aberta',
      severidade: 'critico',
    });
  });

  it('as quatorze condições da spec, na ordem dos bits, com as severidades', () => {
    expect(CONDICOES_DA_IMPRESSORA.map(({ rotulo, severidade }) => [rotulo, severidade])).toEqual([
      ['Pouco papel', 'atencao'],
      ['Sem papel', 'critico'],
      ['Toner baixo', 'atencao'],
      ['Sem toner', 'critico'],
      ['Tampa aberta', 'critico'],
      ['Atolamento de papel', 'critico'],
      ['Serviço solicitado', 'critico'],
      ['Bandeja de entrada ausente', 'critico'],
      ['Bandeja de saída ausente', 'atencao'],
      ['Suprimento de impressão ausente', 'critico'],
      ['Bandeja de saída quase cheia', 'atencao'],
      ['Bandeja de saída cheia', 'critico'],
      ['Bandeja de entrada vazia', 'atencao'],
      ['Manutenção preventiva vencida', 'atencao'],
    ]);
  });

  it('"fora de linha" não aparece: a disponibilidade vem do ping', () => {
    // O bit 6 sozinho.
    expect(condicoesDosBits([0b0000_0010])).toEqual([]);
    expect(CONDICOES_DA_IMPRESSORA.map((condicao) => condicao.chave)).not.toContain(
      'fora-de-linha',
    );
  });

  it('sem os octetos, nenhuma condição; o octeto que falta não tem as condições dele', () => {
    expect(condicoesDosBits([])).toEqual([]);
    expect(condicoesDosBits([0b1000_0000])).toEqual(['pouco-papel']);
  });
});

describe('os contadores de páginas', () => {
  it('o primeiro é o total, o segundo, as coloridas, e os outros, "Contador" com o número', () => {
    expect(
      contadoresDaImpressora([
        { item: 3, paginas: 40 },
        { item: 1, paginas: 12500 },
        { item: 2, paginas: 2300 },
      ]),
    ).toEqual([
      { item: 1, rotulo: 'Total de páginas', paginas: 12500 },
      { item: 2, rotulo: 'Páginas coloridas', paginas: 2300 },
      { item: 3, rotulo: 'Contador 3', paginas: 40 },
    ]);
  });

  it('o preto e branco é o total menos as coloridas, quando a impressora informa os dois', () => {
    expect(
      paginasEmPretoEBranco([
        { item: 1, paginas: 12500, cores: 4 },
        { item: 2, paginas: 2300, cores: 4 },
      ]),
    ).toBe(10200);
  });

  it('na impressora de uma cor, sem as coloridas, o total é o preto e branco', () => {
    expect(paginasEmPretoEBranco([{ item: 1, paginas: 8000, cores: 1 }])).toBe(8000);
  });

  it('na colorida sem o contador de cor, nada se infere', () => {
    expect(paginasEmPretoEBranco([{ item: 1, paginas: 8000, cores: 4 }])).toBeNull();
    expect(paginasEmPretoEBranco([{ item: 1, paginas: 8000, cores: null }])).toBeNull();
    expect(paginasEmPretoEBranco([])).toBeNull();
  });

  it('sem o total, ou com as coloridas acima dele, não há preto e branco', () => {
    expect(
      paginasEmPretoEBranco([
        { item: 1, paginas: null, cores: 4 },
        { item: 2, paginas: 2300, cores: 4 },
      ]),
    ).toBeNull();
    expect(
      paginasEmPretoEBranco([
        { item: 1, paginas: 100, cores: 4 },
        { item: 2, paginas: 2300, cores: 4 },
      ]),
    ).toBeNull();
  });
});
