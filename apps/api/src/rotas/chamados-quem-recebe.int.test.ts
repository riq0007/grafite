// Quem recebe o chamado, no "Passar para…" do andamento no chat (spec chamados, "Quem atende pelo
// chat"; change andamento-e-varias-mensagens, design, decisão 3; tarefa 3.2): a permissão, o chamado
// que a conta não vê, a recusa a quem não atende os locais, e quem entra na lista, pelo nome, com os
// abertos contados nos locais que quem pede vê, como a coluna dela no quadro.
import { atribuicoes, contas, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type ChamadosDeTeste,
  montarChamados,
  type UsuarioDosChamados,
} from '../../test/chamados.ts';
import { type ApiDeTeste, abrirApi, atribuir, criarRelogio } from '../../test/integracao.ts';

const CONFLITO = 'urn:grafite:problema:conflito';

let api: ApiDeTeste;
let c: ChamadosDeTeste;
let enderecos = 0;

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T10:40:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChamados(api, `grafite.chamados-quem-recebe-${enderecos}.local`);
  await c.entrar();
});

const pedir = (usuario: UsuarioDosChamados, numero: number) =>
  c.cliente.consultar(`/chamados/${numero}/quem-recebe`, c.como(usuario));

const quemRecebe = async (usuario: UsuarioDosChamados, numero: number) => {
  const r = await pedir(usuario, numero);
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { contas: { conta: string; nome: string; abertos: number }[] }).contas;
};

/**
 * Os chamados, cada um com quem o abriu pelo "Fica comigo": o de Marina, da Recepção, em Jundiaí,
 * com Ana; o de Otávio, da Recepção, com Diego; o de Fernanda, do Administrativo, em Campinas, com
 * Lívia; e o de Paulo, do Administrativo, com Elisa.
 */
async function abrirOsChamados() {
  return {
    daMarina: await c.abrir(c.relato('marina')),
    doOtavio: await c.abrir(c.relato('otavio'), 'diego'),
    daFernanda: await c.abrir(c.relato('fernanda'), 'livia'),
    doPaulo: await c.abrir(c.relato('paulo'), 'elisa'),
  };
}

describe('a permissão', () => {
  it('pede chamados.atender, o chamado que a conta não vê não existe, e quem não atende os locais é recusado', async () => {
    const { daMarina, daFernanda } = await abrirOsChamados();

    // Carla e Bruno só veem os chamados.
    for (const usuario of ['carla', 'bruno'] as const) {
      expect((await pedir(usuario, daMarina)).statusCode, usuario).toBe(403);
    }
    // Diego atende Jundiaí e não vê o de Fernanda, em Campinas; nem o que não existe.
    for (const numero of [daFernanda, 9999]) {
      const r = await pedir('diego', numero);
      expect(r.statusCode, r.body).toBe(404);
      expect(r.json()).toMatchObject({ detail: 'Chamado não encontrado.' });
    }

    // Carla, que vê a organização inteira, passa a atender Campinas: vê o de Marina e não o atende.
    const atribuicao = await atribuir(api, c.org, {
      perfilId: c.perfis.atende,
      contaId: c.conta('carla'),
      localId: c.locais.campinas,
    });
    try {
      const r = await pedir('carla', daMarina);
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json()).toMatchObject({
        type: CONFLITO,
        detail: 'Você não atende os chamados de Jundiaí › Recepção.',
      });
      expect((await pedir('carla', daFernanda)).statusCode).toBe(200);
    } finally {
      await naOrganizacao(api.banco, c.org, (tx) =>
        tx.delete(atribuicoes).where(eq(atribuicoes.id, atribuicao)),
      );
    }
  });
});

describe('quem entra na lista', () => {
  it('as contas ativas que atendem todos os locais, fora quem está com ele, pelo nome, com os abertos', async () => {
    const { daMarina, daFernanda } = await abrirOsChamados();
    const conta = (usuario: UsuarioDosChamados) => c.conta(usuario);

    // O de Marina, com Ana: Diego, que atende Jundiaí, e Lívia, que atende tudo. Elisa atende só
    // Campinas, e Bruno e Carla não atendem.
    expect(await quemRecebe('ana', daMarina)).toEqual([
      { conta: conta('diego'), nome: 'Diego Ramos', abertos: 1 },
      { conta: conta('livia'), nome: 'Lívia Prates', abertos: 1 },
    ]);
    // O de Fernanda, com Lívia: Ana e Elisa.
    expect(await quemRecebe('ana', daFernanda)).toEqual([
      { conta: conta('ana'), nome: 'Ana Souza', abertos: 1 },
      { conta: conta('elisa'), nome: 'Elisa Prado', abertos: 1 },
    ]);
    // Diego vê só Jundiaí: o aberto de Lívia, em Campinas, não conta para ele, e ele mesmo entra.
    expect(await quemRecebe('diego', daMarina)).toEqual([
      { conta: conta('diego'), nome: 'Diego Ramos', abertos: 1 },
      { conta: conta('livia'), nome: 'Lívia Prates', abertos: 0 },
    ]);

    // A conta inativa sai da lista.
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .update(contas)
        .set({ situacao: 'inativa' })
        .where(eq(contas.id, conta('livia'))),
    );
    expect(await quemRecebe('ana', daMarina)).toEqual([
      { conta: conta('diego'), nome: 'Diego Ramos', abertos: 1 },
    ]);
  });
});
