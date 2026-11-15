// Os formatos das telas do software (change software-por-pacote): a outra distribuição em que a
// máquina já aguarda o pacote (design, decisões 10 e 11), com o quando dela e a hora do envio.
import { criarDataHora } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import type { OutraDistribuicao } from './consultas.ts';
import { textoDaOutra } from './formatos.ts';

const SAO_PAULO = criarDataHora('America/Sao_Paulo');
/** Segunda, 16/11/2026, às 10:00 em São Paulo. */
const AGORA = new Date('2026-11-16T13:00:00.000Z');

const outra = (
  criadaEm: string,
  quando: OutraDistribuicao['quando'] = { chave: 'noite', aPartirDe: null, fuso: null },
): OutraDistribuicao => ({ id: 'd1', criadaEm, quando });

describe('a outra distribuição em que a máquina já aguarda o pacote', () => {
  it('o quando dela e a hora do envio, de hoje', () => {
    expect(textoDaOutra(outra('2026-11-16T12:02:00.000Z'), AGORA, SAO_PAULO)).toBe(
      'na janela da noite, enviada às 09:02',
    );
    expect(
      textoDaOutra(
        outra('2026-11-16T12:02:00.000Z', { chave: 'agora', aPartirDe: null, fuso: null }),
        AGORA,
        SAO_PAULO,
      ),
    ).toBe('enviada às 09:02');
  });

  it('a enviada ontem e a de outro dia, com o dia marcado no relógio de quem vê', () => {
    expect(textoDaOutra(outra('2026-11-15T21:40:00.000Z'), AGORA, SAO_PAULO)).toBe(
      'na janela da noite, enviada ontem às 18:40',
    );
    expect(
      textoDaOutra(
        outra('2026-11-12T14:30:00.000Z', {
          chave: 'dia',
          aPartirDe: '2026-11-19T11:00:00.000Z',
          fuso: 'America/Manaus',
        }),
        AGORA,
        SAO_PAULO,
      ),
    ).toBe('a partir de qui 19 nov às 08:00, enviada em 12 nov às 11:30');
  });
});
