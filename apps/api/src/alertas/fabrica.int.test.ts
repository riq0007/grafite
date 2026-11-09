// As regras de fábrica (spec alertas, "Regras de fábrica"; change p3a-regras-e-alertas, design,
// decisão 4): a API cria só as que faltam, pela chave, com a auditoria do sistema e o evento; a
// regra editada não volta à de fábrica, e o nome já usado por outra regra não impede as demais.
import { auditoria, eventos, naOrganizacao, regrasDeAlerta } from '@grafite/db';
import { REGRAS_DE_FABRICA } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarRegra } from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { garantirRegrasDeFabrica } from './fabrica.ts';

let api: ApiDeTeste;
let enderecos = 0;

beforeAll(async () => {
  api = await abrirApi();
});

afterAll(async () => {
  await api?.fechar();
});

const novaOrganizacao = () =>
  criarOrganizacao(api, { nome: 'Empresa', enderecos: [`grafite.fabrica-${++enderecos}.local`] });

const ATOR = { tipo: 'sistema', descricao: 'regras de fábrica' } as const;

const garantir = (org: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    garantirRegrasDeFabrica(tx, { ator: ATOR, momento: api.relogio.agora() }),
  );

const regrasDa = (org: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(regrasDeAlerta).orderBy(regrasDeAlerta.criadoEm, regrasDeAlerta.id),
  );

describe('regras de fábrica', () => {
  it('cria as oito, ativas, com a chave, a auditoria do sistema e o evento', async () => {
    const org = await novaOrganizacao();
    expect(await garantir(org)).toBe(8);
    const regras = await regrasDa(org);
    expect(regras.map((regra) => [regra.fabrica, regra.nome, regra.situacao])).toEqual(
      REGRAS_DE_FABRICA.map(({ chave, dados }) => [chave, dados.nome, 'ativa']),
    );
    expect(regras.find((regra) => regra.fabrica === 'toner-10')).toMatchObject({
      condicao: 'toner.nivel',
      parametros: { limite: 10, folga: 5 },
      duracao: 0,
      severidade: 'critico',
      escopo: 'organizacao',
      escopoId: null,
      criadoPor: null,
    });
    const { registros, avisos } = await naOrganizacao(api.banco, org, async (tx) => ({
      registros: await tx.select().from(auditoria),
      avisos: await tx.select().from(eventos),
    }));
    expect(registros).toHaveLength(8);
    for (const registro of registros) {
      expect(registro).toMatchObject({
        acao: 'regra-de-alerta.criada',
        atorTipo: 'sistema',
        atorDescricao: 'regras de fábrica',
        alvoTipo: 'regra-de-alerta',
      });
    }
    expect(avisos.map((aviso) => [aviso.tipo, aviso.permissao])).toEqual(
      Array.from({ length: 8 }, () => ['alertas.mudaram', 'alertas.ver']),
    );
  });

  it('de novo, não cria nem audita nada', async () => {
    const org = await novaOrganizacao();
    await garantir(org);
    expect(await garantir(org)).toBe(0);
    const registros = await naOrganizacao(api.banco, org, (tx) => tx.select().from(auditoria));
    expect(registros).toHaveLength(8);
  });

  it('a regra de fábrica editada não volta, e a que falta volta', async () => {
    const org = await novaOrganizacao();
    await garantir(org);
    await naOrganizacao(api.banco, org, async (tx) => {
      await tx
        .update(regrasDeAlerta)
        .set({ parametros: { limite: 15, folga: 5 } })
        .where(eq(regrasDeAlerta.fabrica, 'toner-10'));
      // Uma regra de fábrica que uma versão nova trouxesse: ainda não existe na organização.
      await tx.delete(regrasDeAlerta).where(eq(regrasDeAlerta.fabrica, 'coletor-sem-contato'));
    });
    expect(await garantir(org)).toBe(1);
    const regras = await regrasDa(org);
    expect(regras.find((regra) => regra.fabrica === 'toner-10')?.parametros).toEqual({
      limite: 15,
      folga: 5,
    });
    expect(regras.filter((regra) => regra.fabrica === 'coletor-sem-contato')).toHaveLength(1);
  });

  it('o nome já usado por outra regra não impede as demais', async () => {
    const org = await novaOrganizacao();
    await criarRegra(api, org, {
      nome: 'Ativo offline',
      condicao: 'rede.offline',
      parametros: {},
      duracao: 1,
      severidade: 'critico',
      escopo: { tipo: 'organizacao', id: null },
    });
    expect(await garantir(org)).toBe(7);
    const regras = await regrasDa(org);
    expect(regras.filter((regra) => regra.nome === 'Ativo offline')).toEqual([
      expect.objectContaining({ fabrica: null, duracao: 1 }),
    ]);
  });
});
