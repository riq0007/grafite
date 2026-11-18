// As contas que o editor do tipo oferece em quem atende por padrão (spec tipos-de-chamado, "Prazo e
// atendimento do tipo"; change chamados-da-ti, design, decisão 18, "As contas de quem atende
// (tarefa 5.19)"): a quem configura, também sem a lista das contas da Administração, as contas
// ativas que atendem os chamados em algum local, pelo nome, sem as que só veem.
import { contas, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import { type ChamadosDeTeste, montarChamados } from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarPerfil,
  criarRelogio,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.chamados-tipos-contas.local';
const DAS_CONTAS = '/chamados/tipos/contas';

let api: ApiDeTeste;
let c: ChamadosDeTeste;
/** Gabriel só configura os chamados, sem os atender e sem ver as contas da Administração. */
let gabriel: Entrada;

type Usuario = Parameters<ChamadosDeTeste['como']>[0];

const ler = (usuario: Usuario | Entrada = gabriel) =>
  c.cliente.consultar(DAS_CONTAS, typeof usuario === 'string' ? c.como(usuario) : usuario);

/** Os nomes das contas que o editor oferece, como o usuário os lê. */
async function nomes(usuario: Usuario | Entrada = gabriel): Promise<string[]> {
  const r = await ler(usuario);
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { contas: { nome: string }[] }).contas.map(({ nome }) => nome);
}

const situacaoDaConta = (usuario: Usuario, situacao: 'ativa' | 'inativa') =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .update(contas)
      .set({ situacao })
      .where(eq(contas.id, c.conta(usuario as Exclude<Usuario, 'ninguem'>))),
  );

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-18T12:00:00.000Z')) });
  c = await montarChamados(api, host);
  await c.entrar();

  const configura = await criarPerfil(api, c.org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const conta = await criarConta(api, c.org, { usuario: 'gabriel', nome: 'Gabriel Torres' });
  await atribuir(api, c.org, { perfilId: configura, contaId: conta.id });
  gabriel = await c.cliente.entrar('gabriel');
});

describe('as contas de quem atende por padrão', () => {
  it('Gabriel, que só configura, lê as contas que atendem, pelo nome, com o id', async () => {
    const r = await ler();
    expect(r.statusCode, r.body).toBe(200);
    const lidas = (r.json() as { contas: { id: string; nome: string }[] }).contas;
    // Ana, Diego e Elisa atendem, em toda a organização ou num local; Lívia administra. Bruno e
    // Carla só veem os chamados, e Gabriel só os configura.
    expect(lidas).toEqual([
      { id: c.conta('ana'), nome: 'Ana Souza' },
      { id: c.conta('diego'), nome: 'Diego Ramos' },
      { id: c.conta('elisa'), nome: 'Elisa Prado' },
      { id: c.conta('livia'), nome: 'Lívia Prates' },
    ]);
  });

  it('a conta desativada sai da lista e volta ao ser reativada', async () => {
    await situacaoDaConta('diego', 'inativa');
    try {
      expect(await nomes()).toEqual(['Ana Souza', 'Elisa Prado', 'Lívia Prates']);
    } finally {
      await situacaoDaConta('diego', 'ativa');
    }
    expect(await nomes()).toEqual(['Ana Souza', 'Diego Ramos', 'Elisa Prado', 'Lívia Prates']);
  });

  it('pede chamados.configurar: quem atende sem configurar e quem só vê são recusados', async () => {
    expect(await nomes('livia')).toEqual([
      'Ana Souza',
      'Diego Ramos',
      'Elisa Prado',
      'Lívia Prates',
    ]);
    expect((await ler('ana')).statusCode).toBe(403);
    expect((await ler('diego')).statusCode).toBe(403);
    expect((await ler('carla')).statusCode).toBe(403);
    expect((await ler('ninguem')).statusCode).toBe(401);
  });

  it('com o módulo desligado, a leitura é recusada', async () => {
    await desligarModulos(api, c.org, ['chamados']);
    try {
      const r = await ler();
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:modulo-desligado' });
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });
});
