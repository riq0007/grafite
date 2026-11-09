// O estoque no domínio (spec estoque, "Movimentação do estoque", "Saldo que nunca fica negativo",
// "Mínimo do consumível no local" e "Contador de páginas na saída"; spec modulo-operacao, "Estoque
// abaixo do mínimo no Início"; change p4c-estoque, design, decisão 1).
import { describe, expect, it } from 'vitest';
import {
  abaixoDesdeDepois,
  abaixoDoMinimo,
  consumivelPrecisaEstarAtivo,
  type DadosDoLancamento,
  efeitoNosSaldos,
  LIMITES_DO_ESTOQUE,
  lerQuantidade,
  limparLancamento,
  locaisDoLancamento,
  MOTIVOS_DO_AJUSTE,
  mensagemDoSaldo,
  ROTULOS_DAS_DIRECOES_DO_AJUSTE,
  ROTULOS_DAS_SITUACOES_DO_SALDO,
  ROTULOS_DOS_MOTIVOS_DO_AJUSTE,
  ROTULOS_DOS_TIPOS_DE_MOVIMENTO,
  situacaoDoSaldo,
  TIPOS_DE_MOVIMENTO,
  textoDaOcorrencia,
  textoDoContador,
  validarLancamento,
  validarMinimo,
} from './estoque.ts';

const entrada: DadosDoLancamento = {
  tipo: 'entrada',
  consumivel: 'cf258a',
  quantidade: 10,
  destino: 'almoxarifado',
  fornecedor: 'hp-brasil',
  notaFiscal: '12345',
  observacao: null,
};

const saida: DadosDoLancamento = {
  tipo: 'saida',
  consumivel: 'cf258a',
  quantidade: 1,
  origem: 'almoxarifado',
  ativo: 'pat-00412',
  observacao: null,
};

const transferencia: DadosDoLancamento = {
  tipo: 'transferencia',
  consumivel: 'cf258a',
  quantidade: 3,
  origem: 'almoxarifado',
  destino: 'expedicao',
  observacao: null,
};

const ajuste: DadosDoLancamento = {
  tipo: 'ajuste',
  consumivel: 'cf258a',
  quantidade: 1,
  local: 'almoxarifado',
  direcao: 'retirar',
  motivo: 'inventario',
  observacao: null,
};

describe('as listas do estoque', () => {
  it('os tipos da movimentação e os motivos do ajuste têm os rótulos da spec', () => {
    expect(TIPOS_DE_MOVIMENTO.map((tipo) => ROTULOS_DOS_TIPOS_DE_MOVIMENTO[tipo])).toEqual([
      'Entrada',
      'Saída',
      'Transferência',
      'Ajuste',
    ]);
    expect(MOTIVOS_DO_AJUSTE.map((motivo) => ROTULOS_DOS_MOTIVOS_DO_AJUSTE[motivo])).toEqual([
      'Inventário',
      'Perda',
      'Avaria',
      'Devolução ao fornecedor',
      'Outro',
    ]);
    expect(ROTULOS_DAS_DIRECOES_DO_AJUSTE).toEqual({
      acrescentar: 'Acrescentar',
      retirar: 'Retirar',
    });
    expect(LIMITES_DO_ESTOQUE).toMatchObject({
      quantidadeMaxima: 100_000,
      notaFiscal: 40,
      observacao: 200,
      minimoMaximo: 100_000,
    });
  });
});

describe('a quantidade digitada', () => {
  it('lê o número inteiro com ou sem o ponto dos milhares, e o resto vira NaN', () => {
    expect(lerQuantidade('3')).toBe(3);
    expect(lerQuantidade(' 1.000 ')).toBe(1000);
    expect(lerQuantidade('')).toBeNull();
    expect(lerQuantidade('1,5')).toBeNaN();
    expect(lerQuantidade('dez')).toBeNaN();
  });
});

describe('a conferência do lançamento', () => {
  it('os quatro lançamentos completos passam', () => {
    for (const dados of [entrada, saida, transferencia, ajuste]) {
      expect(validarLancamento(dados), dados.tipo).toEqual({});
    }
  });

  it('a entrada pede o consumível, o destino, o fornecedor e a nota, com até 40 caracteres', () => {
    expect(
      validarLancamento({
        ...entrada,
        consumivel: null,
        destino: null,
        fornecedor: null,
        notaFiscal: '  ',
      }),
    ).toEqual({
      consumivel: 'Escolha o consumível.',
      destino: 'Escolha o local.',
      fornecedor: 'Escolha o fornecedor.',
      notaFiscal: 'Informe o número da nota fiscal.',
    });
    expect(validarLancamento({ ...entrada, notaFiscal: 'N'.repeat(41) })).toEqual({
      notaFiscal: 'Use até 40 caracteres.',
    });
  });

  it('a quantidade é um número inteiro de 1 a 100.000', () => {
    for (const quantidade of [null, 0, 100_001, 1.5, Number.NaN]) {
      expect(validarLancamento({ ...saida, quantidade }), String(quantidade)).toEqual({
        quantidade: 'Use um número inteiro de 1 a 100.000.',
      });
    }
    expect(validarLancamento({ ...saida, quantidade: 100_000 })).toEqual({});
  });

  it('a saída pede a origem e o ativo', () => {
    expect(validarLancamento({ ...saida, origem: null, ativo: null })).toEqual({
      origem: 'Escolha o local.',
      ativo: 'Escolha o ativo.',
    });
  });

  it('a transferência pede um destino diferente da origem', () => {
    expect(validarLancamento({ ...transferencia, destino: 'almoxarifado' })).toEqual({
      destino: 'Escolha um destino diferente da origem.',
    });
  });

  it('o ajuste pede o local, a direção e o motivo', () => {
    expect(validarLancamento({ ...ajuste, local: null, direcao: null, motivo: null })).toEqual({
      local: 'Escolha o local.',
      direcao: 'Escolha se o ajuste acrescenta ou retira.',
      motivo: 'Escolha o motivo.',
    });
  });

  it('cenário "Ajuste sem a observação": o motivo Outro pede a observação', () => {
    expect(validarLancamento({ ...ajuste, motivo: 'outro', observacao: '   ' })).toEqual({
      observacao: 'Descreva o motivo na observação.',
    });
    expect(
      validarLancamento({ ...ajuste, motivo: 'outro', observacao: 'Caixa achada no CPD' }),
    ).toEqual({});
  });

  it('a observação tem até 200 caracteres', () => {
    expect(validarLancamento({ ...entrada, observacao: 'x'.repeat(201) })).toEqual({
      observacao: 'Use até 200 caracteres.',
    });
  });

  it('limpa os espaços das pontas da nota e da observação, e o vazio vira nulo', () => {
    expect(limparLancamento({ ...entrada, notaFiscal: ' 12345 ', observacao: '  ' })).toEqual({
      ...entrada,
      notaFiscal: '12345',
      observacao: null,
    });
  });
});

describe('o efeito no saldo', () => {
  it('a entrada soma no destino, a saída tira da origem e a transferência faz os dois', () => {
    expect(efeitoNosSaldos(entrada)).toEqual([{ local: 'almoxarifado', diferenca: 10 }]);
    expect(efeitoNosSaldos(saida)).toEqual([{ local: 'almoxarifado', diferenca: -1 }]);
    expect(efeitoNosSaldos(transferencia)).toEqual([
      { local: 'almoxarifado', diferenca: -3 },
      { local: 'expedicao', diferenca: 3 },
    ]);
  });

  it('o ajuste soma ou tira do local, pela direção', () => {
    expect(efeitoNosSaldos(ajuste)).toEqual([{ local: 'almoxarifado', diferenca: -1 }]);
    expect(efeitoNosSaldos({ ...ajuste, direcao: 'acrescentar' })).toEqual([
      { local: 'almoxarifado', diferenca: 1 },
    ]);
  });

  it('diz os locais que recebem o saldo e os de onde ele sai', () => {
    expect(locaisDoLancamento(entrada)).toEqual({ recebem: ['almoxarifado'], saem: [] });
    expect(locaisDoLancamento(saida)).toEqual({ recebem: [], saem: ['almoxarifado'] });
    expect(locaisDoLancamento(transferencia)).toEqual({
      recebem: ['expedicao'],
      saem: ['almoxarifado'],
    });
    expect(locaisDoLancamento({ ...ajuste, direcao: 'acrescentar' })).toEqual({
      recebem: ['almoxarifado'],
      saem: [],
    });
  });

  it('cenário "Toner que saiu de linha": só o lançamento que recebe o saldo pede o consumível ativo', () => {
    expect(consumivelPrecisaEstarAtivo(entrada)).toBe(true);
    expect(consumivelPrecisaEstarAtivo(transferencia)).toBe(true);
    expect(consumivelPrecisaEstarAtivo({ ...ajuste, direcao: 'acrescentar' })).toBe(true);
    expect(consumivelPrecisaEstarAtivo(saida)).toBe(false);
    expect(consumivelPrecisaEstarAtivo(ajuste)).toBe(false);
  });

  it('a recusa do saldo diz o saldo do consumível no local', () => {
    expect(mensagemDoSaldo('CF258A', 'Jundiaí › Almoxarifado', 2)).toBe(
      'O saldo do CF258A em Jundiaí › Almoxarifado é 2.',
    );
  });
});

describe('o saldo e o mínimo', () => {
  it('a situação vem do saldo e do mínimo', () => {
    expect(situacaoDoSaldo(0, 5)).toBe('sem-estoque');
    expect(situacaoDoSaldo(0, 0)).toBe('sem-estoque');
    expect(situacaoDoSaldo(2, 5)).toBe('abaixo-do-minimo');
    expect(situacaoDoSaldo(5, 5)).toBe('em-estoque');
    expect(situacaoDoSaldo(3, 0)).toBe('em-estoque');
    expect(ROTULOS_DAS_SITUACOES_DO_SALDO).toEqual({
      'sem-estoque': 'Sem estoque',
      'abaixo-do-minimo': 'Abaixo do mínimo',
      'em-estoque': 'Em estoque',
    });
  });

  it('fica abaixo do mínimo com o mínimo maior que 0 e o saldo menor, também com o saldo 0', () => {
    expect(abaixoDoMinimo(2, 5)).toBe(true);
    expect(abaixoDoMinimo(0, 5)).toBe(true);
    expect(abaixoDoMinimo(5, 5)).toBe(false);
    expect(abaixoDoMinimo(0, 0)).toBe(false);
  });

  it('cenário "Abaixo do mínimo pela saída": o momento é o da mudança que o pôs abaixo', () => {
    const saida = new Date('2026-10-21T14:32:00Z');
    expect(abaixoDesdeDepois({ antes: null, saldo: 4, minimo: 5, momento: saida })).toBe(saida);
    const desde = new Date('2026-10-20T09:00:00Z');
    expect(abaixoDesdeDepois({ antes: desde, saldo: 3, minimo: 5, momento: saida })).toBe(desde);
    expect(abaixoDesdeDepois({ antes: desde, saldo: 5, minimo: 5, momento: saida })).toBeNull();
  });

  it('cenário "Mínimo zerado": o mínimo 0 tira o consumível de abaixo do mínimo', () => {
    const desde = new Date('2026-10-20T09:00:00Z');
    expect(
      abaixoDesdeDepois({ antes: desde, saldo: 0, minimo: 0, momento: new Date() }),
    ).toBeNull();
  });

  it('o mínimo é um número inteiro de 0 a 100.000', () => {
    expect(validarMinimo(0)).toBeNull();
    expect(validarMinimo(100_000)).toBeNull();
    for (const minimo of [null, -1, 100_001, 1.5, Number.NaN]) {
      expect(validarMinimo(minimo), String(minimo)).toBe('Use um número inteiro de 0 a 100.000.');
    }
  });
});

describe('os textos do estoque', () => {
  it('cenário "Toner acabando": o texto da ocorrência do Início', () => {
    expect(
      textoDaOcorrencia({ codigo: 'CF258A', local: 'Jundiaí › Almoxarifado', saldo: 2, minimo: 5 }),
    ).toBe('CF258A abaixo do mínimo em Jundiaí › Almoxarifado: 2 de 5');
    expect(
      textoDaOcorrencia({ codigo: 'CF258A', local: 'Jundiaí › Expedição', saldo: 0, minimo: 1200 }),
    ).toBe('Sem CF258A em Jundiaí › Expedição: mínimo 1.200');
  });

  it('o contador de páginas da saída', () => {
    expect(textoDoContador(45_210, '21/10 14:32')).toBe(
      'Total de páginas: 45.210, lido em 21/10 14:32',
    );
  });
});
