// O fornecedor no domínio (spec fornecedores, "Fornecedor"; change p4a-fornecedores, design,
// decisão 1).
import { describe, expect, it } from 'vitest';
import {
  cnpjComPontuacao,
  type DadosDoFornecedor,
  lerCnpj,
  limparFornecedor,
  nomeNormalizadoDoFornecedor,
  validarFornecedor,
} from './fornecedor.ts';

const vazio: DadosDoFornecedor = {
  nome: 'HP Brasil',
  cnpj: null,
  contato: null,
  email: null,
  telefone: null,
  observacoes: null,
};

describe('lerCnpj', () => {
  it('CNPJ com a pontuação: aceita com e sem a pontuação e guarda os 14 algarismos', () => {
    expect(lerCnpj('12.345.678/0001-95')).toBe('12345678000195');
    expect(lerCnpj('12345678000195')).toBe('12345678000195');
    expect(lerCnpj(' 12 345 678 0001 95 ')).toBe('12345678000195');
  });

  it('CNPJ alfanumérico: aceita letras nos 12 primeiros e guarda em maiúsculas', () => {
    expect(lerCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });

  it('CNPJ com o dígito errado: recusa', () => {
    expect(lerCnpj('12.345.678/0001-96')).toBeNull();
    expect(lerCnpj('12.ABC.345/01DE-36')).toBeNull();
  });

  it('recusa o tamanho errado, a letra nos dígitos verificadores e os algarismos repetidos', () => {
    expect(lerCnpj('1234567800019')).toBeNull();
    expect(lerCnpj('123456780001955')).toBeNull();
    expect(lerCnpj('12ABC34501DEA5')).toBeNull();
    expect(lerCnpj('00000000000000')).toBeNull();
    expect(lerCnpj('11.111.111/1111-11')).toBeNull();
  });
});

describe('cnpjComPontuacao', () => {
  it('escreve o CNPJ guardado com a pontuação', () => {
    expect(cnpjComPontuacao('12345678000195')).toBe('12.345.678/0001-95');
    expect(cnpjComPontuacao('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });
});

describe('nomeNormalizadoDoFornecedor', () => {
  it('Nome repetido: junta acento, maiúsculas e espaços repetidos', () => {
    expect(nomeNormalizadoDoFornecedor('hp  brasil')).toBe(
      nomeNormalizadoDoFornecedor('HP Brasil'),
    );
    expect(nomeNormalizadoDoFornecedor(' Locação  São João ')).toBe('locacao sao joao');
  });
});

describe('limparFornecedor', () => {
  it('tira os espaços das pontas, junta os do nome, guarda o CNPJ lido e o vazio como nulo', () => {
    expect(
      limparFornecedor({
        nome: '  HP   Brasil ',
        cnpj: '12.345.678/0001-95',
        contato: ' ',
        email: ' compras@hp.com.br ',
        telefone: '',
        observacoes: ' Atende em 24 h ',
      }),
    ).toEqual({
      nome: 'HP Brasil',
      cnpj: '12345678000195',
      contato: null,
      email: 'compras@hp.com.br',
      telefone: null,
      observacoes: 'Atende em 24 h',
    });
  });
});

describe('validarFornecedor', () => {
  it('aceita o fornecedor só com o nome', () => {
    expect(validarFornecedor(vazio)).toEqual({});
  });

  it('diz o motivo de cada campo recusado, no campo', () => {
    expect(
      validarFornecedor({
        nome: ' ',
        cnpj: '12.345.678/0001-96',
        contato: 'x'.repeat(121),
        email: 'compras',
        telefone: '9'.repeat(31),
        observacoes: 'x'.repeat(2001),
      }),
    ).toEqual({
      nome: 'Informe o nome do fornecedor.',
      cnpj: 'CNPJ inválido: confira os 14 caracteres.',
      contato: 'Use até 120 caracteres.',
      email: 'Use um e-mail, como compras@empresa.com.br.',
      telefone: 'Use até 30 caracteres.',
      observacoes: 'Use até 2.000 caracteres.',
    });
  });

  it('recusa o nome com mais de 120 caracteres', () => {
    expect(validarFornecedor({ ...vazio, nome: 'x'.repeat(121) })).toEqual({
      nome: 'Use até 120 caracteres.',
    });
  });
});
