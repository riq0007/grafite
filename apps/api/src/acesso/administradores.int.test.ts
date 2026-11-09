// O último administrador (spec perfis-e-grupos; design do F2b, decisão 7): a contagem de quem
// administra os acessos numa consulta só, e a mudança que deixaria a organização sem ninguém
// desfeita por inteiro. As mudanças de acesso rodam uma de cada vez, pela trava `acessos`.
import {
  atribuicoes,
  contas,
  criarBanco,
  membrosDoGrupo,
  naOrganizacao,
  perfis,
  pessoas,
  type Transacao,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarGrupo,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  incluirNoGrupo,
} from '../../test/integracao.ts';
import { ProblemaDaApi } from '../problemas.ts';
import { contarAdministradores, mudarAcessos } from './administradores.ts';

let api: ApiDeTeste;
let organizacoes = 0;

beforeAll(async () => {
  api = await abrirApi();
});

afterAll(async () => {
  await api?.fechar();
});

const novaOrganizacao = () =>
  criarOrganizacao(api, {
    nome: `Empresa ${++organizacoes}`,
    enderecos: [`grafite.administradores-${organizacoes}.local`],
  });

const contar = (org: string) => naOrganizacao(api.banco, org, contarAdministradores);

const encerrar = (atribuicaoId: string) => (tx: Transacao) =>
  tx
    .update(atribuicoes)
    .set({ encerradaEm: api.relogio.agora() })
    .where(eq(atribuicoes.id, atribuicaoId));

async function atribuicaoEmVigor(org: string, atribuicaoId: string) {
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(atribuicoes).where(eq(atribuicoes.id, atribuicaoId)),
  );
  return linha?.encerradaEm === null;
}

describe('contarAdministradores', () => {
  it('conta pelo perfil direto, pelo grupo e por todas as permissões', async () => {
    const org = await novaOrganizacao();
    expect(await contar(org)).toBe(0);

    const gestor = await criarPerfil(api, org, {
      nome: 'Gestor de acessos',
      permissoes: ['acessos.administrar'],
    });
    const ana = await criarConta(api, org, { usuario: 'ana' });
    await atribuir(api, org, { perfilId: gestor, contaId: ana.id });
    expect(await contar(org)).toBe(1);

    const gestores = await criarGrupo(api, org, { nome: 'Gestores' });
    await atribuir(api, org, { perfilId: gestor, grupoId: gestores });
    const carlos = await criarConta(api, org, { usuario: 'carlos' });
    await incluirNoGrupo(api, org, { grupoId: gestores, contaId: carlos.id });
    expect(await contar(org)).toBe(2);

    const administrador = await criarPerfil(api, org, {
      nome: 'Administrador',
      administrador: true,
    });
    const beatriz = await criarConta(api, org, { usuario: 'beatriz' });
    await atribuir(api, org, { perfilId: administrador, contaId: beatriz.id });
    expect(await contar(org)).toBe(3);

    // Com o perfil por dois caminhos, a conta conta uma vez.
    await atribuir(api, org, { perfilId: administrador, contaId: ana.id });
    expect(await contar(org)).toBe(3);
  });

  it('não conta o que não dá a administração dos acessos à organização inteira', async () => {
    const org = await novaOrganizacao();
    const jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
    const administrador = await criarPerfil(api, org, {
      nome: 'Administrador',
      administrador: true,
    });
    const leitor = await criarPerfil(api, org, { nome: 'Leitor', permissoes: ['acessos.ver'] });
    const inativo = await criarPerfil(api, org, {
      nome: 'Inativo',
      permissoes: ['acessos.administrar'],
      situacao: 'inativo',
    });
    const conta = async (usuario: string) => (await criarConta(api, org, { usuario })).id;

    await atribuir(api, org, {
      perfilId: administrador,
      contaId: await conta('num-ramo'),
      localId: jundiai,
    });
    await atribuir(api, org, { perfilId: leitor, contaId: await conta('so-ve') });
    await atribuir(api, org, { perfilId: inativo, contaId: await conta('perfil-inativo') });

    const encerrada = await atribuir(api, org, {
      perfilId: administrador,
      contaId: await conta('encerrada'),
    });
    const grupoInativo = await criarGrupo(api, org, { nome: 'Antigos', situacao: 'inativo' });
    await atribuir(api, org, { perfilId: administrador, grupoId: grupoInativo });
    await incluirNoGrupo(api, org, {
      grupoId: grupoInativo,
      contaId: await conta('grupo-inativo'),
    });
    const gestores = await criarGrupo(api, org, { nome: 'Gestores' });
    await atribuir(api, org, { perfilId: administrador, grupoId: gestores });
    const saiu = await incluirNoGrupo(api, org, {
      grupoId: gestores,
      contaId: await conta('saiu'),
    });

    const pessoaInativa = await criarConta(api, org, { usuario: 'pessoa-inativa' });
    const contaInativa = await criarConta(api, org, { usuario: 'conta-inativa' });
    for (const { id } of [pessoaInativa, contaInativa]) {
      await atribuir(api, org, { perfilId: administrador, contaId: id });
    }

    await naOrganizacao(api.banco, org, async (tx) => {
      const fim = api.relogio.agora();
      await encerrar(encerrada)(tx);
      await tx.update(membrosDoGrupo).set({ encerradaEm: fim }).where(eq(membrosDoGrupo.id, saiu));
      await tx
        .update(pessoas)
        .set({ situacao: 'inativa' })
        .where(eq(pessoas.id, pessoaInativa.pessoaId));
      await tx.update(contas).set({ situacao: 'inativa' }).where(eq(contas.id, contaInativa.id));
    });
    expect(await contar(org)).toBe(0);
  });
});

describe('mudarAcessos', () => {
  async function organizacaoComAdministradores(...usuarios: string[]) {
    const org = await novaOrganizacao();
    const administrador = await criarPerfil(api, org, {
      nome: 'Administrador',
      administrador: true,
    });
    const atribuicoesPorUsuario: Record<string, string> = {};
    for (const usuario of usuarios) {
      const { id } = await criarConta(api, org, { usuario });
      atribuicoesPorUsuario[usuario] = await atribuir(api, org, {
        perfilId: administrador,
        contaId: id,
      });
    }
    return { org, atribuicoes: atribuicoesPorUsuario };
  }

  it('grava a mudança que deixa alguém administrando', async () => {
    const { org, atribuicoes: de } = await organizacaoComAdministradores('ana', 'carlos');
    await mudarAcessos(api.banco, org, encerrar(de.carlos ?? ''));
    expect(await atribuicaoEmVigor(org, de.carlos ?? '')).toBe(false);
    expect(await contar(org)).toBe(1);
  });

  it('recusa com ultimo-administrador a mudança que deixaria a organização sem ninguém e desfaz tudo', async () => {
    const { org, atribuicoes: de } = await organizacaoComAdministradores('ana');
    const mudanca = mudarAcessos(api.banco, org, async (tx) => {
      await tx.insert(perfis).values({
        orgId: org,
        nome: 'Rascunho',
        nomeNormalizado: 'rascunho',
      });
      await encerrar(de.ana ?? '')(tx);
    });
    await expect(mudanca).rejects.toBeInstanceOf(ProblemaDaApi);
    await expect(mudanca).rejects.toMatchObject({
      dados: {
        codigo: 'ultimo-administrador',
        status: 409,
        detalhe: 'A organização ficaria sem ninguém para administrar os acessos.',
      },
    });
    expect(await atribuicaoEmVigor(org, de.ana ?? '')).toBe(true);
    const rascunhos = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(perfis).where(eq(perfis.nome, 'Rascunho')),
    );
    expect(rascunhos).toEqual([]);
    expect(await contar(org)).toBe(1);
  });

  it('roda uma mudança de cada vez: de duas retiradas simultâneas, só uma é gravada', async () => {
    const { org, atribuicoes: de } = await organizacaoComAdministradores('ana', 'carlos');
    const outraConexao = new pg.Pool({ connectionString: inject('urlApp') });
    try {
      let soltarPrimeira = () => {};
      const segurando = new Promise<void>((resolver) => {
        soltarPrimeira = resolver;
      });
      let avisarQueTravou = () => {};
      const travou = new Promise<void>((resolver) => {
        avisarQueTravou = resolver;
      });

      // Ana encerra a atribuição de Carlos e segura a transação aberta, com a trava.
      const primeira = mudarAcessos(api.banco, org, async (tx) => {
        await encerrar(de.carlos ?? '')(tx);
        avisarQueTravou();
        await segurando;
      });
      await travou;

      // Carlos, em outra conexão, tenta encerrar a de Ana ao mesmo tempo, e espera a trava.
      let segundaTerminou = false;
      const segunda = mudarAcessos(criarBanco(outraConexao), org, encerrar(de.ana ?? '')).finally(
        () => {
          segundaTerminou = true;
        },
      );
      await new Promise((resolver) => setTimeout(resolver, 300));
      expect(segundaTerminou).toBe(false);

      soltarPrimeira();
      const [resultadoDaPrimeira, resultadoDaSegunda] = await Promise.allSettled([
        primeira,
        segunda,
      ]);
      expect(resultadoDaPrimeira.status).toBe('fulfilled');
      expect(resultadoDaSegunda).toMatchObject({
        status: 'rejected',
        reason: { dados: { codigo: 'ultimo-administrador' } },
      });
      expect(await atribuicaoEmVigor(org, de.ana ?? '')).toBe(true);
      expect(await atribuicaoEmVigor(org, de.carlos ?? '')).toBe(false);
      expect(await contar(org)).toBe(1);
    } finally {
      await outraConexao.end();
    }
  });

  it('trava só a organização da mudança', async () => {
    const a = await organizacaoComAdministradores('ana', 'carlos');
    const b = await organizacaoComAdministradores('ana', 'carlos');
    let soltar = () => {};
    const segurando = new Promise<void>((resolver) => {
      soltar = resolver;
    });
    let avisar = () => {};
    const travou = new Promise<void>((resolver) => {
      avisar = resolver;
    });
    const emA = mudarAcessos(api.banco, a.org, async () => {
      avisar();
      await segurando;
    });
    await travou;
    await mudarAcessos(api.banco, b.org, encerrar(b.atribuicoes.carlos ?? ''));
    expect(await atribuicaoEmVigor(b.org, b.atribuicoes.carlos ?? '')).toBe(false);
    soltar();
    await emA;
  });
});
