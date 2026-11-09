// O comando no servidor que cria uma conta e redefine um acesso perdido (spec contas-de-acesso): a
// redefinição troca a senha por uma temporária nova, encerra todas as sessões, zera a contagem de
// tentativas e, se pedido, remove os dois passos.
import { randomBytes } from 'node:crypto';
import {
  atribuicoes,
  auditoria,
  codigosDeRecuperacao,
  contas,
  doisPassos,
  naOrganizacao,
  perfis,
  pessoas,
  sessoes,
  tentativasDeEntrada,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';
import { organizacaoDoEndereco } from '../acesso/organizacao.ts';
import { conferirSenha } from '../acesso/senhas.ts';
import { AJUDA, executarComando } from './executar.ts';

let api: ApiDeTeste;
let org = '';
let saida: string[] = [];
let erros: string[] = [];
const endereco = 'grafite.contas.local';

const executar = (...argumentos: string[]) =>
  executarComando(argumentos, {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => erros.push(texto),
  });

const senhaDaSaida = () => /Senha temporária: (\S+)/.exec(saida.join('\n'))?.[1] ?? '';
const naOrg = <T>(fn: Parameters<typeof naOrganizacao<T>>[2]) => naOrganizacao(api.banco, org, fn);
const contaDo = async (usuario: string) =>
  (await naOrg((tx) => tx.select().from(contas).where(eq(contas.usuario, usuario))))[0];

beforeAll(async () => {
  api = await abrirApi();
  await executarComando(
    [
      'organizacao',
      'criar',
      '--nome',
      'Empresa',
      '--endereco',
      endereco,
      '--pessoa',
      'Ana Souza',
      '--usuario',
      'admin',
    ],
    {
      banco: () => api.banco,
      agora: api.relogio.agora,
      escrever: () => {},
      escreverErro: () => {},
    },
  );
  org = (await organizacaoDoEndereco(api.banco, endereco)) ?? '';
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  saida = [];
  erros = [];
});

describe('grafite conta criar', () => {
  it('cria a pessoa e a conta, sem exigir os dois passos, com a senha temporária e a auditoria', async () => {
    const codigo = await executar(
      'conta',
      'criar',
      '--endereco',
      endereco,
      '--pessoa',
      'Bruno Lima',
      '--usuario',
      'Bruno.Lima',
      '--email',
      'bruno@empresa.com',
    );
    expect(erros).toEqual([]);
    expect(codigo).toBe(0);
    const conta = await contaDo('bruno.lima');
    expect(conta).toMatchObject({
      senhaTemporaria: true,
      exigeDoisPassos: false,
      situacao: 'ativa',
    });
    expect(await conferirSenha(senhaDaSaida(), conta?.hashSenha ?? '')).toBe(true);
    const [pessoa] = await naOrg((tx) =>
      tx
        .select()
        .from(pessoas)
        .where(eq(pessoas.id, conta?.pessoaId ?? '')),
    );
    expect(pessoa).toMatchObject({
      nome: 'Bruno Lima',
      email: 'bruno@empresa.com',
      busca: 'bruno lima bruno@empresa.com',
    });
    const registros = await naOrg((tx) =>
      tx
        .select()
        .from(auditoria)
        .where(eq(auditoria.atorDescricao, 'comando no servidor: conta criar')),
    );
    expect(registros.map((r) => r.acao)).toEqual(['pessoa.criada', 'conta.criada']);
  });

  it('com --exigir-dois-passos, a conta exige a verificação', async () => {
    await executar(
      'conta',
      'criar',
      '--endereco',
      endereco,
      '--pessoa',
      'Carla Dias',
      '--usuario',
      'carla',
      '--exigir-dois-passos',
    );
    expect((await contaDo('carla'))?.exigeDoisPassos).toBe(true);
  });

  it('com --administrador, a conta recebe o Administrador para a organização inteira', async () => {
    const codigo = await executar(
      'conta',
      'criar',
      '--endereco',
      endereco,
      '--pessoa',
      'Carla Lima',
      '--usuario',
      'carla.lima',
      '--administrador',
    );
    expect(erros).toEqual([]);
    expect(codigo).toBe(0);
    expect(saida.join('\n')).toContain('com o perfil Administrador');
    const conta = await contaDo('carla.lima');
    const [atribuicao] = await naOrg((tx) =>
      tx
        .select({ perfil: perfis.nome, localId: atribuicoes.localId })
        .from(atribuicoes)
        .innerJoin(perfis, eq(perfis.id, atribuicoes.perfilId))
        .where(eq(atribuicoes.contaId, conta?.id ?? '')),
    );
    expect(atribuicao).toEqual({ perfil: 'Administrador', localId: null });
    const registros = await naOrg((tx) =>
      tx
        .select()
        .from(auditoria)
        .where(eq(auditoria.atorDescricao, 'comando no servidor: conta criar'))
        .orderBy(auditoria.id),
    );
    expect(registros.slice(-3).map((r) => r.acao)).toEqual([
      'pessoa.criada',
      'conta.criada',
      'atribuicao.criada',
    ]);
  });

  it('sem --administrador, a conta não recebe perfil', async () => {
    const conta = await contaDo('carla');
    const atribuidas = await naOrg((tx) =>
      tx
        .select()
        .from(atribuicoes)
        .where(eq(atribuicoes.contaId, conta?.id ?? '')),
    );
    expect(atribuidas).toEqual([]);
  });

  it('a ajuda mostra a opção --administrador', () => {
    expect(AJUDA).toContain('--administrador');
  });

  it('recusa o usuário que já existe, sem criar a pessoa', async () => {
    const antes = (await naOrg((tx) => tx.select().from(pessoas))).length;
    const codigo = await executar(
      'conta',
      'criar',
      '--endereco',
      endereco,
      '--pessoa',
      'Outro Admin',
      '--usuario',
      'ADMIN',
    );
    expect(codigo).toBe(1);
    expect(erros.join('\n')).toContain('O usuário admin já existe nesta organização.');
    expect((await naOrg((tx) => tx.select().from(pessoas))).length).toBe(antes);
  });

  it('recusa o endereço que nenhuma organização registrou', async () => {
    const codigo = await executar(
      'conta',
      'criar',
      '--endereco',
      'grafite.ninguem.local',
      '--pessoa',
      'Davi Reis',
      '--usuario',
      'davi',
    );
    expect(codigo).toBe(1);
    expect(erros.join('\n')).toContain('Nenhuma organização tem o endereço grafite.ninguem.local.');
  });
});

describe('grafite conta redefinir', () => {
  async function prepararAcessoEmUso(usuario: string) {
    await executar(
      'conta',
      'criar',
      '--endereco',
      endereco,
      '--pessoa',
      usuario,
      '--usuario',
      usuario,
    );
    const conta = await contaDo(usuario);
    const contaId = conta?.id ?? '';
    await naOrg(async (tx) => {
      for (let i = 0; i < 2; i++) {
        await tx.insert(sessoes).values({
          orgId: org,
          contaId,
          tokenHash: randomBytes(32),
          tokenCsrf: 'csrf',
          expiraEm: new Date(api.relogio.agora().getTime() + 3_600_000),
          ativadaEm: api.relogio.agora(),
        });
      }
      await tx.insert(doisPassos).values({
        orgId: org,
        contaId,
        segredoCifrado: randomBytes(49),
        ativadoEm: api.relogio.agora(),
      });
      await tx.insert(codigosDeRecuperacao).values({ orgId: org, contaId, hash: randomBytes(32) });
      await tx.insert(tentativasDeEntrada).values({
        orgId: org,
        usuario,
        falhasSeguidas: 5,
        bloqueadaAte: new Date(api.relogio.agora().getTime() + 60_000),
      });
    });
    saida = [];
    return { contaId, hashAntigo: conta?.hashSenha ?? '' };
  }

  it('troca a senha, encerra as sessões, zera as tentativas e remove os dois passos', async () => {
    const { contaId, hashAntigo } = await prepararAcessoEmUso('eva');
    const codigo = await executar(
      'conta',
      'redefinir',
      '--endereco',
      endereco,
      '--usuario',
      'eva',
      '--remover-dois-passos',
    );
    expect(erros).toEqual([]);
    expect(codigo).toBe(0);

    const conta = await contaDo('eva');
    expect(conta?.hashSenha).not.toBe(hashAntigo);
    expect(conta?.senhaTemporaria).toBe(true);
    expect(await conferirSenha(senhaDaSaida(), conta?.hashSenha ?? '')).toBe(true);

    const estado = await naOrg(async (tx) => ({
      sessoes: await tx.select().from(sessoes).where(eq(sessoes.contaId, contaId)),
      doisPassos: await tx.select().from(doisPassos).where(eq(doisPassos.contaId, contaId)),
      codigos: await tx
        .select()
        .from(codigosDeRecuperacao)
        .where(eq(codigosDeRecuperacao.contaId, contaId)),
      tentativas: await tx
        .select()
        .from(tentativasDeEntrada)
        .where(eq(tentativasDeEntrada.usuario, 'eva')),
      registros: await tx
        .select()
        .from(auditoria)
        .where(eq(auditoria.atorDescricao, 'comando no servidor: conta redefinir'))
        .orderBy(auditoria.id),
    }));
    expect(estado.sessoes).toHaveLength(2);
    for (const sessao of estado.sessoes) {
      expect(sessao).toMatchObject({
        encerradaEm: api.relogio.agora(),
        motivoDoFim: 'redefinicao',
      });
    }
    expect(estado.doisPassos).toEqual([]);
    expect(estado.codigos).toEqual([]);
    expect(estado.tentativas).toMatchObject([{ falhasSeguidas: 0, bloqueadaAte: null }]);
    expect(estado.registros.map((r) => r.acao)).toEqual([
      'sessao.encerrada',
      'sessao.encerrada',
      'acesso.redefinido',
    ]);
    expect(estado.registros[2]?.dados).toEqual({ doisPassosRemovidos: true, sessoesEncerradas: 2 });
    expect(saida.join('\n')).toContain('A verificação em dois passos foi removida.');
  });

  it('sem --remover-dois-passos, os dois passos continuam', async () => {
    const { contaId } = await prepararAcessoEmUso('fabio');
    await executar('conta', 'redefinir', '--endereco', endereco, '--usuario', 'fabio');
    const restantes = await naOrg((tx) =>
      tx.select().from(doisPassos).where(eq(doisPassos.contaId, contaId)),
    );
    expect(restantes).toHaveLength(1);
  });

  it('recusa o usuário que não existe na organização', async () => {
    const codigo = await executar('conta', 'redefinir', '--endereco', endereco, '--usuario', 'gil');
    expect(codigo).toBe(1);
    expect(erros.join('\n')).toContain('Nenhuma conta com o usuário gil nesta organização.');
  });
});
