// O comando no servidor que cria uma organização (spec contas-de-acesso): a organização, os
// endereços, a pessoa e a primeira conta, com a senha temporária mostrada uma vez e a auditoria
// feita pelo comando.
import {
  atribuicoes,
  auditoria,
  contas,
  naOrganizacao,
  perfis,
  pessoas,
  regrasDeAlerta,
} from '@grafite/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';
import { conferirSenha } from '../acesso/senhas.ts';
import { executarComando } from './executar.ts';

let api: ApiDeTeste;
let saida: string[] = [];
let erros: string[] = [];

beforeAll(async () => {
  api = await abrirApi();
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  saida = [];
  erros = [];
});

const executar = (...argumentos: string[]) =>
  executarComando(argumentos, {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => erros.push(texto),
  });

async function organizacaoDo(endereco: string): Promise<string | null> {
  const { rows } = await api.banco.execute<{ org: string | null }>(
    sql`select app.organizacao_do_endereco(${endereco}) as org`,
  );
  return rows[0]?.org ?? null;
}

const senhaDaSaida = () => /Senha temporária: (\S+)/.exec(saida.join('\n'))?.[1] ?? '';

describe('grafite organizacao criar', () => {
  it('cria a organização, os endereços, a pessoa e a conta, com a senha temporária e os dois passos exigidos', async () => {
    const codigo = await executar(
      'organizacao',
      'criar',
      '--nome',
      'Empresa',
      '--endereco',
      'Grafite.Empresa.Local',
      '--endereco',
      '10.0.0.5',
      '--pessoa',
      'Ana Souza',
      '--usuario',
      'Admin',
      '--email',
      'ana@empresa.com',
    );
    expect(erros).toEqual([]);
    expect(codigo).toBe(0);
    const org = await organizacaoDo('grafite.empresa.local');
    expect(org).not.toBeNull();
    expect(await organizacaoDo('10.0.0.5')).toBe(org);

    const { conta, pessoa, perfil, atribuicao, registros } = await naOrganizacao(
      api.banco,
      org ?? '',
      async (tx) => ({
        conta: (await tx.select().from(contas))[0],
        pessoa: (await tx.select().from(pessoas))[0],
        perfil: (await tx.select().from(perfis))[0],
        atribuicao: (await tx.select().from(atribuicoes))[0],
        registros: await tx.select().from(auditoria).orderBy(auditoria.id),
      }),
    );
    // As regras de fábrica dos alertas nascem com a organização (design do P3a, decisão 4).
    const regras = await naOrganizacao(api.banco, org ?? '', (tx) =>
      tx.select({ fabrica: regrasDeAlerta.fabrica }).from(regrasDeAlerta),
    );
    expect(regras).toHaveLength(8);
    expect(pessoa).toMatchObject({
      nome: 'Ana Souza',
      email: 'ana@empresa.com',
      situacao: 'ativa',
    });
    expect(conta).toMatchObject({
      usuario: 'admin',
      pessoaId: pessoa?.id,
      senhaTemporaria: true,
      exigeDoisPassos: true,
      situacao: 'ativa',
    });
    expect(await conferirSenha(senhaDaSaida(), conta?.hashSenha ?? '')).toBe(true);
    expect(perfil).toMatchObject({
      nome: 'Administrador',
      todasAsPermissoes: true,
      protegido: true,
      exigeDoisPassos: true,
      situacao: 'ativo',
    });
    expect(atribuicao).toMatchObject({
      perfilId: perfil?.id,
      contaId: conta?.id,
      grupoId: null,
      localId: null,
      encerradaEm: null,
    });

    expect(registros.map((r) => r.acao)).toEqual([
      'organizacao.criada',
      'endereco.registrado',
      'endereco.registrado',
      'pessoa.criada',
      'conta.criada',
      'perfil.criado',
      'atribuicao.criada',
      ...Array.from({ length: 8 }, () => 'regra-de-alerta.criada'),
    ]);
    for (const registro of registros) {
      expect(registro).toMatchObject({
        atorTipo: 'sistema',
        atorDescricao: 'comando no servidor: organizacao criar',
        momento: api.relogio.agora(),
      });
    }
    expect(JSON.stringify(registros)).not.toContain(senhaDaSaida());
  });

  it('mostra a senha temporária uma vez só, com o aviso de guardá-la', async () => {
    await executar(
      'organizacao',
      'criar',
      '--nome',
      'Outra Empresa',
      '--endereco',
      'grafite.outra.local',
      '--pessoa',
      'Bruno Lima',
      '--usuario',
      'bruno',
    );
    const texto = saida.join('\n');
    expect(texto.split(senhaDaSaida()).length - 1).toBe(1);
    expect(texto).toContain('ela não aparece de novo');
  });

  it('com um endereço já em uso, nada é criado', async () => {
    await executar(
      'organizacao',
      'criar',
      '--nome',
      'Primeira',
      '--endereco',
      'grafite.ocupado.local',
      '--pessoa',
      'Carla Dias',
      '--usuario',
      'carla',
    );
    saida = [];
    const codigo = await executar(
      'organizacao',
      'criar',
      '--nome',
      'Segunda',
      '--endereco',
      'grafite.novo.local',
      '--endereco',
      'grafite.ocupado.local',
      '--pessoa',
      'Davi Reis',
      '--usuario',
      'davi',
    );
    expect(codigo).toBe(1);
    expect(erros.join('\n')).toContain('O endereço grafite.ocupado.local já está em uso.');
    expect(saida.join('\n')).not.toContain('Senha temporária');
    expect(await organizacaoDo('grafite.novo.local')).toBeNull();
  });

  it('com --se-nao-existir e o endereço já registrado, não faz nada e não mostra senha', async () => {
    const codigo = await executar(
      'organizacao',
      'criar',
      '--se-nao-existir',
      '--nome',
      'Empresa',
      '--endereco',
      'grafite.empresa.local',
      '--pessoa',
      'Ana Souza',
      '--usuario',
      'admin',
    );
    expect(codigo).toBe(0);
    expect(erros).toEqual([]);
    expect(saida.join('\n')).toContain('já existe');
    expect(saida.join('\n')).not.toContain('Senha temporária');
  });

  it('com --sem-exigir-dois-passos, nem a conta nem o Administrador exigem a verificação', async () => {
    await executar(
      'organizacao',
      'criar',
      '--sem-exigir-dois-passos',
      '--nome',
      'Desenvolvimento',
      '--endereco',
      'grafite.dev.local',
      '--pessoa',
      'Administrador',
      '--usuario',
      'admin',
    );
    const org = await organizacaoDo('grafite.dev.local');
    const { conta, perfil } = await naOrganizacao(api.banco, org ?? '', async (tx) => ({
      conta: (await tx.select().from(contas))[0],
      perfil: (await tx.select().from(perfis))[0],
    }));
    expect(conta?.exigeDoisPassos).toBe(false);
    expect(perfil).toMatchObject({ nome: 'Administrador', exigeDoisPassos: false });
  });

  it.each([
    [
      ['--usuario', 'joão silva'],
      'Use só letras sem acento, números, ponto (.), hífen (-) e sublinhado (_).',
    ],
    [['--endereco', 'http://grafite.local/'], 'O endereço http://grafite.local/ não é válido.'],
  ])('recusa a entrada inválida %j sem criar nada', async (troca, mensagem) => {
    const argumentos = {
      '--nome': 'Inválida',
      '--endereco': 'grafite.invalida.local',
      '--pessoa': 'Eva Rocha',
      '--usuario': 'eva',
      [troca[0] ?? '']: troca[1] ?? '',
    };
    const codigo = await executar('organizacao', 'criar', ...Object.entries(argumentos).flat());
    expect(codigo).toBe(2);
    expect(erros.join('\n')).toContain(mensagem);
    expect(await organizacaoDo('grafite.invalida.local')).toBeNull();
  });
});

// Os endereços de acesso da organização depois de criada (change painel-da-operacao, design,
// decisão 8): o comando de operação os acrescenta e os tira por estes comandos, nos dois bancos.
describe('grafite organizacao acrescentar-endereco e tirar-endereco', () => {
  const criar = (nome: string, endereco: string, usuario: string) =>
    executar(
      'organizacao',
      'criar',
      '--nome',
      nome,
      '--endereco',
      endereco,
      '--pessoa',
      'Ana Souza',
      '--usuario',
      usuario,
    );

  it('Endereço acrescentado: entra na organização de um endereço dela, com a auditoria, e sai de novo', async () => {
    await criar('Acme', 'grafite.acme.local', 'ana');
    const org = await organizacaoDo('grafite.acme.local');
    saida = [];
    await expect(
      executar(
        'organizacao',
        'acrescentar-endereco',
        '--endereco',
        'grafite.acme.local',
        '--novo',
        'Grafite.Acme.Example',
      ),
    ).resolves.toBe(0);
    expect(erros).toEqual([]);
    expect(await organizacaoDo('grafite.acme.example')).toBe(org);
    expect(saida).toEqual(['Endereço grafite.acme.example acrescentado à organização "Acme".']);

    // De novo, não muda nada.
    saida = [];
    await expect(
      executar(
        'organizacao',
        'acrescentar-endereco',
        '--endereco',
        'grafite.acme.local',
        '--novo',
        'grafite.acme.example',
      ),
    ).resolves.toBe(0);
    expect(saida).toEqual([
      'O endereço grafite.acme.example já é da organização "Acme"; nada mudou.',
    ]);

    saida = [];
    await expect(
      executar('organizacao', 'tirar-endereco', '--endereco', 'grafite.acme.example'),
    ).resolves.toBe(0);
    expect(await organizacaoDo('grafite.acme.example')).toBeNull();
    expect(await organizacaoDo('grafite.acme.local')).toBe(org);
    expect(saida).toEqual(['Endereço grafite.acme.example tirado da organização "Acme".']);

    const registros = await naOrganizacao(api.banco, org ?? '', (tx) =>
      tx.select().from(auditoria).orderBy(auditoria.id),
    );
    expect(
      registros
        .filter(({ acao }) => acao === 'endereco.registrado' || acao === 'endereco.removido')
        .map(({ acao, atorDescricao, antes, depois }) => ({ acao, atorDescricao, antes, depois })),
    ).toEqual([
      {
        acao: 'endereco.registrado',
        atorDescricao: 'comando no servidor: organizacao criar',
        antes: null,
        depois: { endereco: 'grafite.acme.local' },
      },
      {
        acao: 'endereco.registrado',
        atorDescricao: 'comando no servidor: organizacao acrescentar-endereco',
        antes: null,
        depois: { endereco: 'grafite.acme.example' },
      },
      {
        acao: 'endereco.removido',
        atorDescricao: 'comando no servidor: organizacao tirar-endereco',
        antes: { endereco: 'grafite.acme.example' },
        depois: null,
      },
    ]);
  });

  it('Último endereço: recusa tirar o único e o endereço de outra organização, sem mudar nada', async () => {
    await criar('Primeira', 'grafite.primeira.local', 'bruno');
    await criar('Segunda', 'grafite.segunda.local', 'carla');
    const primeira = await organizacaoDo('grafite.primeira.local');

    await expect(
      executar('organizacao', 'tirar-endereco', '--endereco', 'grafite.primeira.local'),
    ).resolves.toBe(1);
    expect(erros).toEqual([
      'O endereço grafite.primeira.local é o último da organização "Primeira": ela precisa de pelo menos um.',
    ]);
    expect(await organizacaoDo('grafite.primeira.local')).toBe(primeira);

    erros = [];
    await expect(
      executar(
        'organizacao',
        'acrescentar-endereco',
        '--endereco',
        'grafite.primeira.local',
        '--novo',
        'grafite.segunda.local',
      ),
    ).resolves.toBe(1);
    expect(erros).toEqual(['O endereço grafite.segunda.local já está em uso.']);

    erros = [];
    await expect(
      executar('organizacao', 'tirar-endereco', '--endereco', 'grafite.ninguem.local'),
    ).resolves.toBe(1);
    expect(erros).toEqual(['Nenhuma organização tem o endereço grafite.ninguem.local.']);
  });
});
