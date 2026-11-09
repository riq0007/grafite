// O evento de saída gravado com a mudança (spec eventos-em-tempo-real; design do F2c, decisão 9):
// a auditoria grava o evento da ação na mesma transação, e as mudanças sem auditoria o gravam por
// registrarEvento.
import { eventos, naOrganizacao, pessoas } from '@grafite/db';
import type { AcaoComPublicoDado, AcaoDaAuditoria } from '@grafite/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { registrarEvento } from './saida.ts';

let api: ApiDeTeste;
let org = '';

const ALVO = '0199a3f0-0000-7000-8000-000000000001';

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Organização A', enderecos: ['grafite.saida.local'] });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const gravados = () => naOrganizacao(api.banco, org, (tx) => tx.select().from(eventos));

function auditar(
  acao: Exclude<AcaoDaAuditoria, AcaoComPublicoDado>,
  alvo: { tipo: string; id?: string | null },
) {
  return naOrganizacao(api.banco, org, (tx) =>
    registrarNaAuditoria(tx, {
      acao,
      ator: { tipo: 'sistema', descricao: 'teste' },
      alvo,
      momento: api.relogio.agora(),
    }),
  );
}

describe('o evento gravado pela auditoria', () => {
  it('a sessão encerrada vai só para a própria sessão', async () => {
    await auditar('sessao.encerrada', { tipo: 'sessao', id: ALVO });
    expect(await gravados()).toMatchObject([
      {
        orgId: org,
        tipo: 'sessao.encerrada',
        alvoTipo: 'sessao',
        alvoId: ALVO,
        todas: false,
        permissao: null,
        locais: null,
        contas: null,
        sessoes: [ALVO],
      },
    ]);
  });

  it.each([
    ['local.movido', 'locais.mudaram', 'local'],
    ['perfil.alterado', 'acessos.mudaram', 'perfil'],
    ['atribuicao.criada', 'acessos.mudaram', 'atribuicao'],
    ['padroes.alterados', 'padroes.mudaram', 'organizacao'],
  ] as const)('%s grava %s para todas as sessões', async (acao, tipo, alvoTipo) => {
    await auditar(acao, { tipo: alvoTipo, id: ALVO });
    expect(await gravados()).toMatchObject([
      { tipo, alvoTipo, alvoId: ALVO, todas: true, permissao: null, contas: null, sessoes: null },
    ]);
  });

  it('a ação que não muda o que uma tela mostra não grava evento', async () => {
    await auditar('entrada.recusada', { tipo: 'conta' });
    await auditar('permissao.recusada', { tipo: 'rota' });
    expect(await gravados()).toEqual([]);
  });

  it('a transação desfeita não deixa o evento', async () => {
    await expect(
      naOrganizacao(api.banco, org, async (tx) => {
        await registrarNaAuditoria(tx, {
          acao: 'local.criado',
          ator: { tipo: 'sistema', descricao: 'teste' },
          alvo: { tipo: 'local', id: ALVO },
          momento: api.relogio.agora(),
        });
        await tx.insert(pessoas).values({ orgId: org, nome: '   ' });
      }),
    ).rejects.toThrow();
    expect(await gravados()).toEqual([]);
  });

  it('o público dado por quem grava vale no lugar do deduzido', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      registrarNaAuditoria(tx, {
        acao: 'pessoa.alterada',
        ator: { tipo: 'sistema', descricao: 'teste' },
        alvo: { tipo: 'pessoa', id: ALVO },
        momento: api.relogio.agora(),
        saida: { publico: { permissao: 'pessoas.ver', locais: [null], contas: [ALVO] } },
      }),
    );
    expect(await gravados()).toMatchObject([
      { tipo: 'pessoas.mudaram', permissao: 'pessoas.ver', locais: [null], contas: [ALVO] },
    ]);
  });
});

describe('registrarEvento', () => {
  it('grava o evento de uma mudança sem auditoria', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      registrarEvento(tx, {
        tipo: 'preferencias.mudaram',
        alvo: { tipo: 'conta', id: ALVO },
        publico: { contas: [ALVO] },
      }),
    );
    expect(await gravados()).toMatchObject([
      { tipo: 'preferencias.mudaram', alvoTipo: 'conta', alvoId: ALVO, contas: [ALVO] },
    ]);
  });

  it('recusa o evento sem público', async () => {
    await expect(
      naOrganizacao(api.banco, org, (tx) =>
        registrarEvento(tx, { tipo: 'pessoas.mudaram', alvo: null, publico: {} }),
      ),
    ).rejects.toThrow('O evento pessoas.mudaram não tem público.');
    expect(await gravados()).toEqual([]);
  });
});
