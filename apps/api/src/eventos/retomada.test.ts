// A linha do evento como o distribuidor e a conexão a entendem (spec eventos-em-tempo-real; design do
// F2c, decisão 11): o público volta com cada parte que a linha tem, e só com elas. As permissões
// (change chamados-da-ti, design, decisão 13) são a parte de quem tem uma delas.
import type { eventos } from '@grafite/db';
import { describe, expect, it } from 'vitest';
import { eventoDaLinha } from './retomada.ts';

const ORG = '019a8000-0000-7000-8000-0000000000a1';
const ALVO = '019a8000-0000-7000-8000-0000000000b1';
const LOCAL = '019a8000-0000-7000-8000-0000000000c1';
const CONTA = '019a8000-0000-7000-8000-0000000000d1';
const SESSAO = '019a8000-0000-7000-8000-0000000000e1';

const linha = (publico: Partial<typeof eventos.$inferSelect>): typeof eventos.$inferSelect => ({
  id: '019a8000-0000-7000-8000-000000000001',
  orgId: ORG,
  momento: new Date('2026-11-16T12:00:00.000Z'),
  tipo: 'ajustes-dos-chamados.mudaram',
  alvoTipo: 'tipo-de-chamado',
  alvoId: ALVO,
  todas: false,
  permissao: null,
  permissoes: null,
  locais: null,
  contas: null,
  sessoes: null,
  ...publico,
});

describe('eventoDaLinha', () => {
  it('o evento de uma das permissões volta com elas no público', () => {
    expect(eventoDaLinha(linha({ permissoes: ['chamados.ver', 'chamados.configurar'] }))).toEqual({
      id: '019a8000-0000-7000-8000-000000000001',
      orgId: ORG,
      momento: '2026-11-16T12:00:00.000Z',
      tipo: 'ajustes-dos-chamados.mudaram',
      alvo: { tipo: 'tipo-de-chamado', id: ALVO },
      publico: { permissoes: ['chamados.ver', 'chamados.configurar'] },
    });
  });

  it('o público leva cada parte que a linha tem, e só elas', () => {
    expect(
      eventoDaLinha(
        linha({
          todas: true,
          permissao: 'pessoas.ver',
          // O registro sem local volta como null no meio da lista, que o tipo do Drizzle não mostra.
          locais: [LOCAL, null] as string[],
          contas: [CONTA],
          sessoes: [SESSAO],
        }),
      ).publico,
    ).toEqual({
      todas: true,
      permissao: 'pessoas.ver',
      locais: [LOCAL, null],
      contas: [CONTA],
      sessoes: [SESSAO],
    });
    expect(eventoDaLinha(linha({ alvoTipo: null, alvoId: null, todas: true }))).toMatchObject({
      alvo: null,
      publico: { todas: true },
    });
  });
});
