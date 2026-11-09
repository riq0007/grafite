// A comparação e a restauração no coletor (spec comparacao-e-restauracao-do-control-id; change
// p5b-comparacao-e-restauracao, design, decisão 4), contra o simulador do Control iD: o controle
// trocado, que recebe tudo na ordem das dependências, com as fotos; o mesmo controle, em que o que
// já existe é ignorado; e a comparação com uma pessoa a menos.
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import yazl from 'yazl';
import { iniciarSimuladorControlId } from '../test/simulador-control-id.ts';
import { executarOperacao, type PedidoDeOperacao } from './operacoes-control-id.ts';

const GRAVACOES = join(import.meta.dirname, '..', 'test', 'gravacoes', 'control-id');
const USUARIO = 'admin';
const SENHA = 'senha-do-controle';
const FOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const ESPERAS = { espera: 5_000, esperaDaTentativa: 50 };

const abertos: { fechar: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(abertos.splice(0).map((aberto) => aberto.fechar()));
});

const TABELAS = {
  users: [
    { id: 1, name: 'Marina Alves', registration: '4821' },
    { id: 2, name: 'Rafael Costa', registration: '4822' },
  ],
  groups: [{ id: 10, name: 'Expedição' }],
  user_groups: [{ user_id: 1, group_id: 10 }],
  cards: [{ id: 100, value: 1234567, user_id: 1 }],
};

/** O ZIP do backup, como o coletor o monta. */
function zipDoBackup(): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [nome, linhas] of Object.entries(TABELAS)) {
    zip.addBuffer(Buffer.from(JSON.stringify(linhas)), `${nome}.json`);
  }
  zip.addBuffer(FOTO, 'face_images/user_1.jpg');
  zip.end();
  return new Promise((pronto) => {
    const partes: Buffer[] = [];
    zip.outputStream.on('data', (parte: Buffer) => partes.push(parte));
    zip.outputStream.on('end', () => pronto(Buffer.concat(partes)));
  });
}

async function simulador(objetos: Record<string, unknown[]> = {}) {
  const iniciado = await iniciarSimuladorControlId({
    gravacao: { arquivo: join(GRAVACOES, 'idaccess-pro.json') },
    usuario: USUARIO,
    senha: SENHA,
    objetos,
  });
  abertos.push(iniciado);
  return iniciado;
}

const pedido = (
  porta: number,
  tipo: PedidoDeOperacao['tipo'],
  categorias: string[] | null = null,
): PedidoDeOperacao => ({
  id: '0199d3a0-0000-7000-8000-0000000000e1',
  tipo,
  backupId: '0199d3a0-0000-7000-8000-0000000000b1',
  categorias,
  ativoId: '0199d3a0-0000-7000-8000-0000000000d1',
  rotulo: 'Controle novo',
  ip: '127.0.0.1',
  porta,
  usuario: USUARIO,
  senha: SENHA,
});

describe('a restauração no coletor', () => {
  it('Controle trocado: cria tudo, na ordem das dependências, com as fotos', async () => {
    const controle = await simulador();
    const feita = await executarOperacao(
      pedido(controle.porta, 'restauracao'),
      await zipDoBackup(),
      ESPERAS,
    );
    if (feita.tipo !== 'resultado') throw new Error(feita.mensagem);
    const criacoes = controle
      .pedidos()
      .filter((recebido) => recebido.caminho === '/create_objects.fcgi')
      .map((recebido) => (recebido.corpo as { object: string }).object);
    expect([...new Set(criacoes)]).toEqual(['users', 'groups', 'user_groups', 'cards']);
    expect(feita.categorias.find((c) => c.categoria === 'users')).toMatchObject({
      situacao: 'ok',
      total: 2,
      criados: 2,
      ignorados: 0,
    });
    expect(feita.categorias.find((c) => c.categoria === 'face_images')).toMatchObject({
      situacao: 'ok',
      criados: 1,
    });
    expect(controle.fotosRecebidas().get(1)).toEqual(FOTO);
    expect(controle.sessoesAbertas()).toBe(0);
  });

  it('Restauração no mesmo controle: o que já existe é ignorado, e as categorias não escolhidas, puladas', async () => {
    const controle = await simulador({ users: [TABELAS.users[0]] });
    const feita = await executarOperacao(
      pedido(controle.porta, 'restauracao', ['users']),
      await zipDoBackup(),
      ESPERAS,
    );
    if (feita.tipo !== 'resultado') throw new Error(feita.mensagem);
    expect(feita.categorias.find((c) => c.categoria === 'users')).toMatchObject({
      criados: 1,
      ignorados: 1,
    });
    expect(feita.categorias.find((c) => c.categoria === 'cards')).toEqual({
      categoria: 'cards',
      situacao: 'pulado',
    });
    expect(controle.objetos().users).toHaveLength(2);
  });
});

describe('a comparação no coletor', () => {
  it('Controle com uma pessoa a menos: 1 só no backup', async () => {
    const controle = await simulador({ users: [TABELAS.users[1]], groups: TABELAS.groups });
    const feita = await executarOperacao(
      pedido(controle.porta, 'comparacao'),
      await zipDoBackup(),
      ESPERAS,
    );
    if (feita.tipo !== 'resultado') throw new Error(feita.mensagem);
    expect(feita.categorias.find((c) => c.categoria === 'users')).toMatchObject({
      situacao: 'ok',
      iguais: 1,
      soNoBackup: 1,
      soNoControle: 0,
      divergentes: 0,
    });
  });
});
