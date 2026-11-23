import { describe, expect, it } from 'vitest';
import { comandoDoAtivo } from './cartao-do-ativo.ts';

describe('o "/ativo" no campo de escrever', () => {
  it('Cartão pelo /ativo: o comando seguido do patrimônio, sozinho na linha', () => {
    expect(comandoDoAtivo('/ativo PAT-00137')).toEqual({
      patrimonio: 'PAT-00137',
      semOComando: '',
      naUltimaLinha: true,
    });
  });

  it('o "/ativo" sozinho pede o ativo ligado ao chamado', () => {
    expect(comandoDoAtivo('/ativo')).toEqual({
      patrimonio: null,
      semOComando: '',
      naUltimaLinha: true,
    });
    expect(comandoDoAtivo('/ativo   ')?.patrimonio).toBeNull();
  });

  it('diz se o comando está na última linha, onde ainda se escreve', () => {
    // O "/ativo" sozinho, na última linha, ainda pode ganhar o patrimônio; com a linha de baixo, a
    // dele acabou.
    expect(comandoDoAtivo('Olá.\n/ativo')?.naUltimaLinha).toBe(true);
    expect(comandoDoAtivo('Olá.\n/ativo\n')?.naUltimaLinha).toBe(false);
    expect(comandoDoAtivo('/ativo\r\nVeja.')?.naUltimaLinha).toBe(false);
  });

  it('o comando numa das linhas sai do texto, e as outras ficam', () => {
    expect(comandoDoAtivo('Olá, Fernanda.\n/ativo PAT-00137\nO toner está em 6%.')).toEqual({
      patrimonio: 'PAT-00137',
      semOComando: 'Olá, Fernanda.\nO toner está em 6%.',
      naUltimaLinha: false,
    });
    expect(comandoDoAtivo('Olá\r\n/ativo PAT-00137')).toEqual({
      patrimonio: 'PAT-00137',
      semOComando: 'Olá',
      naUltimaLinha: true,
    });
  });

  it('aceita o comando em maiúsculas e o patrimônio com espaços, até o fim da linha', () => {
    expect(comandoDoAtivo('/Ativo pat-00137')?.patrimonio).toBe('pat-00137');
    expect(comandoDoAtivo('  /ativo   PAT 00137  ')?.patrimonio).toBe('PAT 00137');
  });

  it('o "/ativo" no meio da linha ou colado noutra palavra não é comando', () => {
    expect(comandoDoAtivo('veja o /ativo PAT-00137')).toBeNull();
    expect(comandoDoAtivo('/ativos')).toBeNull();
    expect(comandoDoAtivo('/ativoPAT-00137')).toBeNull();
    expect(comandoDoAtivo('Sem comando aqui.')).toBeNull();
  });

  it('com dois comandos, vale o primeiro, e o segundo fica no texto', () => {
    expect(comandoDoAtivo('/ativo PAT-00137\n/ativo PAT-00200')).toEqual({
      patrimonio: 'PAT-00137',
      semOComando: '/ativo PAT-00200',
      naUltimaLinha: false,
    });
  });
});
