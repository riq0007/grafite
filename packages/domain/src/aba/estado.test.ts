import { describe, expect, it } from 'vitest';
import {
  avisoDaAba,
  chegouAs,
  FRASES_SEM_CONEXAO,
  larguraDoPainel,
  RETOMADA_DO_MOTIVO,
  respostasNovas,
  tamanhoDaAbaFechada,
} from './estado.ts';

const FUSO = 'America/Sao_Paulo';
const as = (hora: string) => new Date(`2026-11-11T${hora}:00-03:00`);

describe('tamanho da aba fechada', () => {
  it('a pílula de fábrica tem 162×34, e 160×32 até 1366 px', () => {
    expect(tamanhoDaAbaFechada('pilula', 1920)).toEqual({
      forma: 'pilula',
      largura: 162,
      altura: 34,
    });
    expect(tamanhoDaAbaFechada('pilula', 1366)).toEqual({
      forma: 'pilula',
      largura: 160,
      altura: 32,
    });
  });

  it('o entalhe tem 184×32 em qualquer tela', () => {
    expect(tamanhoDaAbaFechada('entalhe', 1920)).toEqual({
      forma: 'entalhe',
      largura: 184,
      altura: 32,
    });
    expect(tamanhoDaAbaFechada('entalhe', 1280)).toEqual({
      forma: 'entalhe',
      largura: 184,
      altura: 32,
    });
  });
});

describe('largura do painel', () => {
  it('293 de fábrica, e 372 com a linha da resposta ou sem conexão', () => {
    expect(larguraDoPainel('de-fabrica', 1920)).toBe(293);
    expect(larguraDoPainel('com-resposta', 1920)).toBe(372);
    expect(larguraDoPainel('sem-conexao', 1920)).toBe(372);
  });

  it('225 e 300 no notebook de 1366', () => {
    expect(larguraDoPainel('de-fabrica', 1366)).toBe(225);
    expect(larguraDoPainel('com-resposta', 1366)).toBe(300);
    expect(larguraDoPainel('sem-conexao', 1366)).toBe(300);
  });
});

describe('aviso', () => {
  it('uma resposta leva quem respondeu', () => {
    expect(avisoDaAba(1, 'Ana Souza')).toEqual({ contagem: '1 resposta nova', quem: 'Ana Souza' });
  });

  it('mais de uma leva só a contagem', () => {
    expect(avisoDaAba(3, 'Ana Souza')).toEqual({ contagem: '3 respostas novas', quem: null });
  });

  it('sem resposta por ver, não há aviso', () => {
    expect(avisoDaAba(0, null)).toBeNull();
  });

  it('a contagem no singular e no plural', () => {
    expect(respostasNovas(1)).toBe('1 resposta nova');
    expect(respostasNovas(2)).toBe('2 respostas novas');
  });
});

describe('chegou às', () => {
  it('uma resposta da apresentação diz a hora em que chegou, por 1 minuto', () => {
    const pedido = { chegadas: [as('09:21')], fimDaApresentacao: as('09:34'), fuso: FUSO };
    expect(chegouAs({ ...pedido, agora: as('09:34') })).toBe('1 resposta nova · chegou às 09:21');
    expect(chegouAs({ ...pedido, agora: new Date(as('09:34').getTime() + 59_000) })).toBe(
      '1 resposta nova · chegou às 09:21',
    );
    expect(chegouAs({ ...pedido, agora: as('09:35') })).toBeNull();
  });

  it('várias dizem a hora da última', () => {
    expect(
      chegouAs({
        chegadas: [as('09:30'), as('09:12'), as('09:21')],
        fimDaApresentacao: as('09:34'),
        agora: as('09:34'),
        fuso: FUSO,
      }),
    ).toBe('3 respostas novas · a última às 09:30');
  });

  it('nada chegou, ou a apresentação não acabou', () => {
    expect(
      chegouAs({ chegadas: [], fimDaApresentacao: as('09:34'), agora: as('09:34'), fuso: FUSO }),
    ).toBeNull();
    expect(
      chegouAs({
        chegadas: [as('09:21')],
        fimDaApresentacao: as('09:34'),
        agora: as('09:30'),
        fuso: FUSO,
      }),
    ).toBeNull();
  });
});

describe('sem conexão', () => {
  it('cada motivo tem a frase da spec', () => {
    expect(FRASES_SEM_CONEXAO['nao-configurada']).toBe('A aba não foi configurada. Fale com a TI.');
    expect(FRASES_SEM_CONEXAO['aparelho-bloqueado']).toBe(
      'Este computador foi bloqueado na aba. Fale com a TI.',
    );
    expect(FRASES_SEM_CONEXAO['sem-rede']).toBe('Sem conexão com o Grafite.');
    expect(FRASES_SEM_CONEXAO['usuario-de-fora']).toBe(
      'Entre no Windows com o seu usuário da empresa para usar a aba.',
    );
  });

  it('a rede e o AD tentam logo, a pessoa recusada a cada 10 minutos, e o aparelho pelo serviço', () => {
    const de = (retomada: string) =>
      Object.entries(RETOMADA_DO_MOTIVO)
        .filter(([, quem]) => quem === retomada)
        .map(([motivo]) => motivo)
        .sort();
    expect(de('aba')).toEqual(['sem-rede', 'ti-fora-do-alcance']);
    expect(de('aba-devagar')).toEqual([
      'conta-inativa',
      'conta-local',
      'sem-grupo',
      'teto-do-aparelho',
      'usuario-de-fora',
    ]);
    expect(de('servico')).toEqual([
      'aparelho-bloqueado',
      'chave-recusada',
      'nao-configurada',
      'registrar-de-novo',
    ]);
    expect(de('pessoa')).toEqual(['cadastrar-o-codigo']);
  });
});
