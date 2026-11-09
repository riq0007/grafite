// O consumível no domínio (spec consumiveis, "Consumível", "Fornecedores do consumível" e
// "Compatibilidade com os modelos"; spec cadastro-de-ativos, "Aba Dados em cartões"; change
// p4b-consumiveis, design, decisão 1).
import { describe, expect, it } from 'vitest';
import {
  CORES_DE_CONSUMIVEL,
  codigoNormalizado,
  type DadosDoConsumivel,
  LIMITES_DO_CONSUMIVEL,
  lerRendimento,
  limparConsumivel,
  ordenarConsumiveis,
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  rendimentoEscrito,
  resumoDosCompativeis,
  TIPOS_DE_CONSUMIVEL,
  validarConsumivel,
} from './consumivel.ts';

const toner: DadosDoConsumivel = {
  codigo: 'CF258A',
  nome: 'HP 58A',
  tipo: 'toner',
  cor: 'preto',
  rendimento: 3000,
  fornecedores: [],
  modelos: [],
};

const ids = (quantos: number) =>
  Array.from(
    { length: quantos },
    (_, indice) => `00000000-0000-7000-8000-${String(indice).padStart(12, '0')}`,
  );

describe('as listas fixas', () => {
  it('têm os tipos e as cores da spec, com os rótulos em pt-BR', () => {
    expect(TIPOS_DE_CONSUMIVEL.map((tipo) => ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[tipo])).toEqual([
      'Toner',
      'Cilindro',
      'Tinta',
      'Fita',
      'Kit de manutenção',
      'Peça',
      'Outro',
    ]);
    expect(CORES_DE_CONSUMIVEL.map((cor) => ROTULOS_DAS_CORES_DE_CONSUMIVEL[cor])).toEqual([
      'Preto',
      'Ciano',
      'Magenta',
      'Amarelo',
      'Colorido',
    ]);
  });
});

describe('codigoNormalizado', () => {
  it('Código com outra grafia: junta maiúsculas, espaços e hífens', () => {
    expect(codigoNormalizado('tn 2370')).toBe(codigoNormalizado('TN-2370'));
    expect(codigoNormalizado(' cf-258 a ')).toBe('CF258A');
    expect(codigoNormalizado('TN–2370')).toBe('TN2370');
  });

  it('mantém os outros caracteres', () => {
    expect(codigoNormalizado('106R03623')).toBe('106R03623');
    expect(codigoNormalizado('W2110A/X')).toBe('W2110A/X');
  });
});

describe('limparConsumivel', () => {
  it('tira os espaços das pontas, junta os do nome e guarda o vazio como nulo', () => {
    expect(
      limparConsumivel({ ...toner, codigo: '  TN 2370 ', nome: '  Brother   TN-2370 ' }),
    ).toMatchObject({ codigo: 'TN 2370', nome: 'Brother TN-2370' });
    expect(limparConsumivel({ ...toner, nome: '   ' }).nome).toBeNull();
  });

  it('tira os fornecedores e os modelos repetidos', () => {
    const [primeiro = '', segundo = ''] = ids(2);
    expect(
      limparConsumivel({
        ...toner,
        fornecedores: [primeiro, primeiro],
        modelos: [segundo, segundo],
      }),
    ).toMatchObject({ fornecedores: [primeiro], modelos: [segundo] });
  });
});

describe('validarConsumivel', () => {
  it('aceita o consumível completo', () => {
    expect(validarConsumivel(toner)).toEqual({});
  });

  it('Kit sem cor nem rendimento: aceita os opcionais vazios', () => {
    expect(
      validarConsumivel({
        ...toner,
        codigo: 'RM2-5425',
        nome: null,
        tipo: 'kit-de-manutencao',
        cor: null,
        rendimento: null,
      }),
    ).toEqual({});
  });

  it('pede o código e recusa o que só tem espaços e hífens', () => {
    expect(validarConsumivel({ ...toner, codigo: '' }).codigo).toBe(
      'Informe o código do consumível.',
    );
    expect(validarConsumivel({ ...toner, codigo: ' - - ' }).codigo).toBe(
      'Informe o código do consumível.',
    );
  });

  it('recusa o código e o nome compridos', () => {
    expect(validarConsumivel({ ...toner, codigo: 'C'.repeat(41) }).codigo).toBe(
      'Use até 40 caracteres.',
    );
    expect(validarConsumivel({ ...toner, codigo: 'C'.repeat(40) }).codigo).toBeUndefined();
    expect(validarConsumivel({ ...toner, nome: 'N'.repeat(81) }).nome).toBe(
      'Use até 80 caracteres.',
    );
  });

  it('pede o tipo e recusa a cor fora da lista', () => {
    expect(validarConsumivel({ ...toner, tipo: null }).tipo).toBe('Escolha o tipo do consumível.');
    expect(
      validarConsumivel({ ...toner, tipo: 'cartucho' as DadosDoConsumivel['tipo'] }).tipo,
    ).toBe('Escolha o tipo do consumível.');
    expect(validarConsumivel({ ...toner, cor: 'branco' as DadosDoConsumivel['cor'] }).cor).toBe(
      'Escolha uma cor da lista.',
    );
  });

  it('Rendimento fora do limite: recusa o que não é inteiro de 1 a 1.000.000', () => {
    const mensagem = 'Use um número inteiro de páginas, de 1 a 1.000.000.';
    expect(validarConsumivel({ ...toner, rendimento: 0 }).rendimento).toBe(mensagem);
    expect(validarConsumivel({ ...toner, rendimento: 1_000_001 }).rendimento).toBe(mensagem);
    expect(validarConsumivel({ ...toner, rendimento: 1.5 }).rendimento).toBe(mensagem);
    expect(validarConsumivel({ ...toner, rendimento: Number.NaN }).rendimento).toBe(mensagem);
    expect(validarConsumivel({ ...toner, rendimento: 1 }).rendimento).toBeUndefined();
    expect(validarConsumivel({ ...toner, rendimento: 1_000_000 }).rendimento).toBeUndefined();
  });

  it('recusa mais fornecedores e modelos que o limite', () => {
    expect(LIMITES_DO_CONSUMIVEL).toMatchObject({ fornecedores: 50, modelos: 200 });
    expect(validarConsumivel({ ...toner, fornecedores: ids(51) }).fornecedores).toBe(
      'Use até 50 fornecedores.',
    );
    expect(validarConsumivel({ ...toner, fornecedores: ids(50) }).fornecedores).toBeUndefined();
    expect(validarConsumivel({ ...toner, modelos: ids(201) }).modelos).toBe('Use até 200 modelos.');
    expect(validarConsumivel({ ...toner, modelos: ids(200) }).modelos).toBeUndefined();
  });
});

describe('lerRendimento', () => {
  it('lê o número digitado em pt-BR, com ou sem o ponto dos milhares', () => {
    expect(lerRendimento('3.000')).toBe(3000);
    expect(lerRendimento(' 3000 ')).toBe(3000);
    expect(lerRendimento('1.000.000')).toBe(1_000_000);
  });

  it('guarda o vazio como nulo e o que não é inteiro como um número que a conferência recusa', () => {
    expect(lerRendimento('  ')).toBeNull();
    for (const texto of ['3,5', '3.5', 'abc', '-10']) {
      expect(validarConsumivel({ ...toner, rendimento: lerRendimento(texto) }).rendimento).toBe(
        'Use um número inteiro de páginas, de 1 a 1.000.000.',
      );
    }
  });
});

describe('rendimentoEscrito', () => {
  it('escreve o rendimento em páginas, com os milhares', () => {
    expect(rendimentoEscrito(3000)).toBe('3.000 páginas');
    expect(rendimentoEscrito(1_000_000)).toBe('1.000.000 páginas');
    expect(rendimentoEscrito(1)).toBe('1 página');
  });
});

describe('ordenarConsumiveis', () => {
  it('ordena pelo tipo, na ordem da lista, e pelo código sem diferenciar a grafia', () => {
    const ordenados = ordenarConsumiveis([
      { codigo: 'CF232A', tipo: 'cilindro' },
      { codigo: 'cf258x', tipo: 'toner' },
      { codigo: 'RM2-5425', tipo: 'kit-de-manutencao' },
      { codigo: 'CF-258A', tipo: 'toner' },
    ]);
    expect(ordenados.map(({ codigo }) => codigo)).toEqual([
      'CF-258A',
      'cf258x',
      'CF232A',
      'RM2-5425',
    ]);
  });
});

describe('resumoDosCompativeis', () => {
  it('Resumo dos consumíveis compatíveis: os dois primeiros códigos e quantos mais', () => {
    const compativeis = ordenarConsumiveis([
      { codigo: 'CF232A', tipo: 'cilindro' },
      { codigo: 'CF258X', tipo: 'toner' },
      { codigo: 'CF258A', tipo: 'toner' },
    ]);
    expect(resumoDosCompativeis({ temModelo: true, compativeis })).toBe('CF258A · CF258X e mais 1');
    expect(resumoDosCompativeis({ temModelo: true, compativeis: compativeis.slice(0, 2) })).toBe(
      'CF258A · CF258X',
    );
    expect(resumoDosCompativeis({ temModelo: true, compativeis: compativeis.slice(0, 1) })).toBe(
      'CF258A',
    );
  });

  it('diz quando não há nenhum e quando o ativo não tem modelo', () => {
    expect(resumoDosCompativeis({ temModelo: true, compativeis: [] })).toBe('Nenhum compatível');
    expect(resumoDosCompativeis({ temModelo: false, compativeis: [] })).toBe('Sem modelo');
  });
});
