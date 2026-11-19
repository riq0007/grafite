// O selo do prazo (spec modulo-chamados, "Quem está com o quê"; change chamados-da-ti, design,
// decisão 22): a situação inteira do prazo, com a primeira letra maiúscula, na marca do grupo, como
// na prévia do quadrado.
import { describe, expect, it } from 'vitest';
import {
  AGORA_DOS_MOCKUPS,
  CHAMADOS_DOS_MOCKUPS,
  FUSO_DOS_MOCKUPS,
  HORARIO_DOS_MOCKUPS,
} from '../../teste/chamados.ts';
import { contadorDoPrazo, seloDoPrazo } from './prazo.ts';

describe('seloDoPrazo', () => {
  const contar = contadorDoPrazo(AGORA_DOS_MOCKUPS, FUSO_DOS_MOCKUPS);
  const situacao = (numero: number) => {
    const relogio = CHAMADOS_DOS_MOCKUPS.find((chamado) => chamado.numero === numero)?.relogio;
    if (!relogio) throw new Error(`Sem o relógio do #${numero}.`);
    return contar(relogio, HORARIO_DOS_MOCKUPS);
  };

  it('a situação inteira, com a primeira letra maiúscula, na marca do grupo', () => {
    expect(seloDoPrazo(situacao(1033))).toEqual({
      texto: 'Estourado há 20 min',
      marca: 'critico',
    });
    expect(seloDoPrazo(situacao(1038))).toEqual({ texto: 'Vence em 2 h', marca: 'atencao' });
    expect(seloDoPrazo(situacao(1040))).toEqual({ texto: 'Vence em 5 h', marca: 'neutra' });
    expect(seloDoPrazo(situacao(1041))).toEqual({ texto: 'Relógio parado', marca: 'neutra' });
    expect(seloDoPrazo(null)).toEqual({ texto: 'Prazo ilegível', marca: 'neutra' });
  });
});
