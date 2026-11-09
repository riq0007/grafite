// Os painéis no domínio (spec painel-de-dashboards; change painel-de-dashboards, design, decisões 2 e
// 3): a conferência do painel, a leitura da resposta da verificação e a forma da grade.
import { describe, expect, it } from 'vitest';
import { conferirPainel, formaDaGrade, situacaoDaResposta } from './paineis.ts';

const LOCAL = '0193a0b2-0000-7000-8000-00000000000e';

describe('conferirPainel', () => {
  it('Painel novo: o nome, o endereço, o local e a ordem', () => {
    expect(
      conferirPainel({
        nome: ' Produção da linha 2 ',
        endereco: ' http://10.0.5.21:3000/d/linha2 ',
        localId: LOCAL,
        ordem: 2,
      }),
    ).toEqual({
      ok: true,
      dados: {
        nome: 'Produção da linha 2',
        endereco: 'http://10.0.5.21:3000/d/linha2',
        localId: LOCAL,
        ordem: 2,
      },
    });
  });

  it('a ordem é 100 quando não vem', () => {
    const conferido = conferirPainel({ nome: 'X', endereco: 'https://painel.local' });
    expect(conferido.ok && conferido.dados.ordem).toBe(100);
  });

  it('Endereço sem o protocolo: recusa, como o com senha e o de outro protocolo', () => {
    const MENSAGEM = 'Informe o endereço, como http://10.0.0.20:3000.';
    for (const endereco of [
      '10.0.5.21:3000',
      'ftp://10.0.5.21',
      'http://',
      'http://u:s@10.0.0.1',
    ]) {
      expect(conferirPainel({ nome: 'X', endereco })).toEqual({
        ok: false,
        erros: { endereco: MENSAGEM },
      });
    }
  });

  it('recusa o nome vazio, a ordem fora dos limites e o local que não é um id', () => {
    expect(conferirPainel({ nome: '', endereco: 'http://x', ordem: 0, localId: 'y' })).toEqual({
      ok: false,
      erros: {
        nome: 'Informe o nome.',
        ordem: 'Informe uma ordem de 1 a 999.',
        local: 'Escolha um local ativo.',
      },
    });
  });
});

describe('situacaoDaResposta', () => {
  it('a resposta abaixo de 500 está no ar', () => {
    expect(situacaoDaResposta({ status: 200 })).toEqual({ situacao: 'no-ar', motivo: null });
    expect(situacaoDaResposta({ status: 401 })).toEqual({ situacao: 'no-ar', motivo: null });
  });

  it('Painel com erro do servidor: o 5xx está fora do ar, com o motivo', () => {
    expect(situacaoDaResposta({ status: 502 })).toEqual({
      situacao: 'fora-do-ar',
      motivo: 'Respondeu 502',
    });
  });

  it('Painel que caiu: sem resposta no prazo, ou com a conexão recusada', () => {
    expect(situacaoDaResposta({ falha: 'prazo' })).toEqual({
      situacao: 'fora-do-ar',
      motivo: 'Sem resposta em 5 s',
    });
    expect(situacaoDaResposta({ falha: 'conexao' })).toEqual({
      situacao: 'fora-do-ar',
      motivo: 'A conexão foi recusada',
    });
  });
});

describe('formaDaGrade', () => {
  it('Três painéis: um, dois e três numa linha', () => {
    expect(formaDaGrade(1)).toEqual({ colunas: 1, linhas: 1 });
    expect(formaDaGrade(2)).toEqual({ colunas: 2, linhas: 1 });
    expect(formaDaGrade(3)).toEqual({ colunas: 3, linhas: 1 });
  });

  it('de quatro em diante, quase quadrada', () => {
    expect(formaDaGrade(4)).toEqual({ colunas: 2, linhas: 2 });
    expect(formaDaGrade(5)).toEqual({ colunas: 3, linhas: 2 });
    expect(formaDaGrade(6)).toEqual({ colunas: 3, linhas: 2 });
    expect(formaDaGrade(7)).toEqual({ colunas: 3, linhas: 3 });
    expect(formaDaGrade(10)).toEqual({ colunas: 4, linhas: 3 });
  });

  it('nenhum painel não tem grade', () => {
    expect(formaDaGrade(0)).toEqual({ colunas: 0, linhas: 0 });
  });
});
