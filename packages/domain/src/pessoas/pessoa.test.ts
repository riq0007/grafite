import { describe, expect, it } from 'vitest';
import { limparPessoa, textoDeBusca, validarPessoa } from './pessoa.ts';

const pessoa = (dados: Partial<Parameters<typeof validarPessoa>[0]> = {}) => ({
  nome: 'João da Silva',
  email: null,
  matricula: null,
  telefone: null,
  ...dados,
});

describe('validarPessoa', () => {
  it('aceita só o nome', () => {
    expect(validarPessoa(pessoa())).toEqual({});
  });

  it('aceita todos os campos preenchidos', () => {
    expect(
      validarPessoa(
        pessoa({
          email: 'joao.silva@empresa.com.br',
          matricula: 'RH-004/512',
          telefone: '+55 (11) 4000-0000',
        }),
      ),
    ).toEqual({});
  });

  it.each([
    ['', 'Informe o nome.'],
    ['   ', 'Informe o nome.'],
    ['a'.repeat(121), 'Use até 120 caracteres.'],
  ])('recusa o nome %j', (nome, motivo) => {
    expect(validarPessoa(pessoa({ nome }))).toEqual({ nome: motivo });
  });

  it.each(['joao', 'joao@', '@empresa.com', 'joao silva@empresa.com', 'joao@empresa'])(
    'recusa o e-mail %j',
    (email) => {
      expect(validarPessoa(pessoa({ email }))).toEqual({
        email: 'Informe um e-mail válido, como nome@empresa.com.br.',
      });
    },
  );

  it('recusa a matrícula longa ou com outros caracteres', () => {
    expect(validarPessoa(pessoa({ matricula: '1'.repeat(33) }))).toEqual({
      matricula: 'Use até 32 caracteres.',
    });
    expect(validarPessoa(pessoa({ matricula: '004 512' }))).toEqual({
      matricula: 'Use só letras, números, ponto, hífen e barra.',
    });
  });

  it.each(['ramal 2040', '(  )', '2040#'])('recusa o telefone %j', (telefone) => {
    expect(validarPessoa(pessoa({ telefone }))).toEqual({
      telefone: 'Use só números, espaços, parênteses, + e hífen.',
    });
  });

  it('recusa o telefone longo', () => {
    expect(validarPessoa(pessoa({ telefone: '1'.repeat(33) }))).toEqual({
      telefone: 'Use até 32 caracteres.',
    });
  });

  it('confere os campos sem os espaços das pontas', () => {
    expect(validarPessoa(pessoa({ email: '  ana@empresa.com ', matricula: ' 12 ' }))).toEqual({});
  });
});

describe('limparPessoa', () => {
  it('tira os espaços das pontas e troca o vazio por nulo', () => {
    expect(
      limparPessoa({ nome: '  João  da Silva ', email: '  ', matricula: ' 12 ', telefone: '' }),
    ).toEqual({ nome: 'João da Silva', email: null, matricula: '12', telefone: null });
  });
});

describe('textoDeBusca', () => {
  it('junta nome, matrícula e e-mail sem acento e em minúsculas', () => {
    expect(
      textoDeBusca({ nome: 'João da Silva', matricula: '004512', email: 'Joao@Empresa.com' }),
    ).toBe('joao da silva 004512 joao@empresa.com');
  });

  it('deixa de fora o que não há', () => {
    expect(textoDeBusca({ nome: 'Ana Souza', matricula: null, email: null })).toBe('ana souza');
  });
});
