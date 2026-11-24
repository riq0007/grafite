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

  it('grava o público de uma das permissões (change chamados-da-ti)', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      registrarEvento(tx, {
        tipo: 'ajustes-dos-chamados.mudaram',
        alvo: { tipo: 'tipo-de-chamado', id: ALVO },
        publico: { permissoes: ['chamados.ver', 'chamados.configurar'] },
      }),
    );
    expect(await gravados()).toMatchObject([
      {
        tipo: 'ajustes-dos-chamados.mudaram',
        alvoTipo: 'tipo-de-chamado',
        alvoId: ALVO,
        todas: false,
        permissao: null,
        permissoes: ['chamados.ver', 'chamados.configurar'],
        locais: null,
        contas: null,
        sessoes: null,
      },
    ]);
  });

  // As linhas de 20, o teto do CHECK (change chat-com-chamados, design, decisão 4): o notificar de
  // um canal com muitas contas não é recusado.
  it('divide as contas e as sessões em linhas de 20, com o resto do público na primeira', async () => {
    const ids = (meio: string, quantos: number) =>
      Array.from(
        { length: quantos },
        (_, i) => `0199a3f0-0000-7000-${meio}-${String(i).padStart(12, '0')}`,
      );
    const contas = ids('8000', 45);
    const sessoes = ids('9000', 21);
    const grupo = '0199a3f0-0000-7000-a000-000000000001';
    await naOrganizacao(api.banco, org, (tx) =>
      registrarEvento(tx, {
        tipo: 'chat.mudou',
        alvo: { tipo: 'conversa', id: ALVO },
        publico: { permissao: 'pessoas.ver', grupos: [grupo], contas, sessoes },
      }),
    );
    const linhas = (await gravados()).sort((a, b) => a.id.localeCompare(b.id));
    const comum = { tipo: 'chat.mudou', alvoTipo: 'conversa', alvoId: ALVO, todas: false };
    const semOResto = { ...comum, permissao: null, grupos: null, locais: null, permissoes: null };
    expect(linhas).toMatchObject([
      {
        ...comum,
        permissao: 'pessoas.ver',
        grupos: [grupo],
        contas: contas.slice(0, 20),
        sessoes: sessoes.slice(0, 20),
      },
      { ...semOResto, contas: contas.slice(20, 40), sessoes: sessoes.slice(20) },
      { ...semOResto, contas: contas.slice(40), sessoes: null },
    ]);
  });

  // O público da aba (change aba-dos-colaboradores, design, decisão 6): o evento que só o tem passa
  // no CHECK, e as listas também vão em linhas de 20.
  it('grava o público da aba, só com ele, e divide os aparelhos em linhas de 20', async () => {
    const aparelhos = Array.from(
      { length: 21 },
      (_, i) => `0199a3f0-0000-7000-b000-${String(i).padStart(12, '0')}`,
    );
    const sessaoDaAba = '0199a3f0-0000-7000-c000-000000000001';
    await naOrganizacao(api.banco, org, async (tx) => {
      await registrarEvento(tx, {
        tipo: 'sessao.encerrada',
        alvo: null,
        publico: { sessoesDaAba: [sessaoDaAba] },
      });
      await registrarEvento(tx, { tipo: 'sessao.encerrada', alvo: null, publico: { aparelhos } });
      await registrarEvento(tx, { tipo: 'sessao.encerrada', alvo: null, publico: { abas: true } });
    });
    const linhas = (await gravados()).sort((a, b) => a.id.localeCompare(b.id));
    expect(linhas).toMatchObject([
      { sessoesDaAba: [sessaoDaAba], aparelhosDaAba: null, abas: false },
      { sessoesDaAba: null, aparelhosDaAba: aparelhos.slice(0, 20), abas: false },
      { sessoesDaAba: null, aparelhosDaAba: aparelhos.slice(20), abas: false },
      { sessoesDaAba: null, aparelhosDaAba: null, abas: true },
    ]);
  });

  it('grava os grupos vazios como lista vazia, que não alcança ninguém pela permissão', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      registrarEvento(tx, {
        tipo: 'chat.mudou',
        alvo: { tipo: 'conversa', id: ALVO },
        publico: { permissao: 'pessoas.ver', grupos: [] },
      }),
    );
    expect(await gravados()).toMatchObject([{ permissao: 'pessoas.ver', grupos: [] }]);
  });

  it('recusa o evento sem público, também com as permissões vazias', async () => {
    await expect(
      naOrganizacao(api.banco, org, (tx) =>
        registrarEvento(tx, { tipo: 'pessoas.mudaram', alvo: null, publico: {} }),
      ),
    ).rejects.toThrow('O evento pessoas.mudaram não tem público.');
    await expect(
      naOrganizacao(api.banco, org, (tx) =>
        registrarEvento(tx, {
          tipo: 'ajustes-dos-chamados.mudaram',
          alvo: null,
          publico: { permissoes: [] },
        }),
      ),
    ).rejects.toThrow('O evento ajustes-dos-chamados.mudaram não tem público.');
    expect(await gravados()).toEqual([]);
  });
});
