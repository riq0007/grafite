// O retorno das ações do atendimento (spec modulo-chamados, "Quem está com o quê"; spec chamados,
// "Ações do atendimento"; change chamados-da-ti, design, decisão 22): a frase do aviso de cada uma,
// com o primeiro nome de quem ficou com o chamado.
import { describe, expect, it } from 'vitest';
import { BRUNO, depoisDaAcao, RENATO } from '../../teste/chamados.ts';
import { retornoDaAcao } from './acoes.ts';

describe('retornoDaAcao', () => {
  it('assumir, passar e devolver dizem o que a conta fez', () => {
    expect(retornoDaAcao('assumir', depoisDaAcao(1033, 2, 'em-atendimento', null))).toBe(
      'Você assumiu o #1033.',
    );
    expect(retornoDaAcao('passar', depoisDaAcao(1033, 2, 'em-atendimento', BRUNO))).toBe(
      'Você passou o #1033 a Bruno.',
    );
    expect(retornoDaAcao('devolver', depoisDaAcao(1033, 2, 'triagem', null))).toBe(
      'Você devolveu o #1033 à triagem.',
    );
  });

  it('o desfazer diz com quem o chamado ficou de novo', () => {
    expect(retornoDaAcao('desfazer', depoisDaAcao(1033, 3, 'em-atendimento', RENATO))).toBe(
      'O #1033 voltou a Renato.',
    );
    expect(retornoDaAcao('desfazer', depoisDaAcao(1042, 3, 'triagem', null))).toBe(
      'O #1042 voltou à triagem.',
    );
  });
});
