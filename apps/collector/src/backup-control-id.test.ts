// O backup do Control iD no coletor (spec backup-do-control-id, "Resultado do backup"; change
// p5a-backup-do-control-id, design, decisão 4), contra o simulador da API do Control iD: o backup
// completo, com as categorias e a foto; a biometria que falha sem parar as outras; e o login
// recusado, sem arquivo. A sessão sempre sai.
import { join } from 'node:path';
import { resultadoDoBackup } from '@grafite/domain';
import { afterEach, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import {
  iniciarSimuladorControlId,
  type SimuladorControlId,
} from '../test/simulador-control-id.ts';
import { fazerBackup, type PedidoDeBackup } from './backup-control-id.ts';

const GRAVACOES = join(import.meta.dirname, '..', 'test', 'gravacoes', 'control-id');
const USUARIO = 'admin';
const SENHA = 'senha-do-controle';
const FOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const ESPERAS = { espera: 5_000, esperaDasFotos: 5_000, esperaDaTentativa: 50 };

const abertos: SimuladorControlId[] = [];

afterEach(async () => {
  await Promise.all(abertos.splice(0).map((aberto) => aberto.fechar()));
});

const OBJETOS = {
  users: [
    { id: 1, name: 'Marina Alves', registration: '4821' },
    { id: 2, name: 'Rafael Costa', registration: '4822' },
  ],
  groups: [{ id: 10, name: 'Expedição' }],
  user_groups: [{ user_id: 1, group_id: 10 }],
  cards: [{ id: 100, value: 1234567, user_id: 1 }],
  templates: [{ id: 7, user_id: 1, finger_position: 1 }],
};

async function simulador(opcoes: { falhar?: string[]; modo?: 'aceita' | 'recusa' } = {}) {
  const iniciado = await iniciarSimuladorControlId({
    gravacao: { arquivo: join(GRAVACOES, 'idaccess-pro.json') },
    usuario: USUARIO,
    senha: SENHA,
    objetos: OBJETOS,
    fotos: { 1: FOTO },
    ...opcoes,
  });
  abertos.push(iniciado);
  return iniciado;
}

const pedido = (porta: number): PedidoDeBackup => ({
  id: '0199d3a0-0000-7000-8000-0000000000b1',
  ativoId: '0199d3a0-0000-7000-8000-0000000000d1',
  rotulo: 'Controle da portaria',
  ip: '127.0.0.1',
  porta,
  usuario: USUARIO,
  senha: SENHA,
});

/** As entradas do ZIP, pelo caminho. */
async function entradas(conteudo: Buffer): Promise<Map<string, Buffer>> {
  const zip = await yauzl.fromBufferPromise(conteudo, { lazyEntries: true });
  const lidas = new Map<string, Buffer>();
  await new Promise<void>((pronto, recusar) => {
    zip.on('end', () => pronto());
    zip.on('error', recusar);
    zip.on('entry', (entrada: yauzl.Entry) => {
      zip.openReadStreamPromise(entrada).then((leitura) => {
        const partes: Buffer[] = [];
        leitura.on('data', (parte: Buffer) => partes.push(parte));
        leitura.on('end', () => {
          lidas.set(entrada.fileName, Buffer.concat(partes));
          zip.readEntry();
        });
      }, recusar);
    });
    zip.readEntry();
  });
  return lidas;
}

/** As categorias do `metadata.json`, como a API as lê. */
const categoriasDo = (metadados: {
  categories: { category: string; status: string; count: number }[];
}) =>
  metadados.categories.map(({ category, status, count }) => ({
    categoria: category,
    situacao: status === 'OK' ? ('ok' as const) : ('erro' as const),
    quantidade: count,
  }));

describe('o backup do Control iD no coletor', () => {
  it('Backup completo: as categorias, as fotos e a sessão que sai', async () => {
    const controle = await simulador();
    const feito = await fazerBackup(pedido(controle.porta), ESPERAS);
    expect(feito.tipo).toBe('zip');
    if (feito.tipo !== 'zip') return;
    const lidas = await entradas(feito.conteudo);
    expect([...lidas.keys()]).toEqual(
      expect.arrayContaining([
        'metadata.json',
        'device_info.json',
        'users.json',
        'face_images/user_1.jpg',
      ]),
    );
    expect(lidas.has('face_images/user_2.jpg')).toBe(false);
    expect(JSON.parse(lidas.get('users.json')?.toString('utf8') ?? '')).toEqual(OBJETOS.users);
    const metadados = JSON.parse(lidas.get('metadata.json')?.toString('utf8') ?? '{}');
    expect(metadados.status).toBe('SUCESSO');
    expect(resultadoDoBackup(categoriasDo(metadados))).toMatchObject({
      situacao: 'sucesso',
      registros: 6,
      fotos: 1,
    });
    expect(controle.sessoesAbertas()).toBe(0);
  });

  it('Biometria que falha: a categoria fica com o erro, e as outras são lidas', async () => {
    const controle = await simulador({ falhar: ['templates'] });
    const feito = await fazerBackup(pedido(controle.porta), ESPERAS);
    if (feito.tipo !== 'zip') throw new Error('o backup não saiu');
    const metadados = JSON.parse(
      (await entradas(feito.conteudo)).get('metadata.json')?.toString('utf8') ?? '{}',
    );
    expect(metadados.status).toBe('PARCIAL');
    expect(metadados.categories).toContainEqual({
      category: 'templates',
      status: 'ERRO',
      count: 0,
      error: 'O controle respondeu 500.',
    });
    expect(resultadoDoBackup(categoriasDo(metadados)).situacao).toBe('parcial');
  });

  it('Login recusado: a falha, sem arquivo', async () => {
    const controle = await simulador({ modo: 'recusa' });
    expect(await fazerBackup(pedido(controle.porta), ESPERAS)).toEqual({
      tipo: 'falha',
      mensagem: 'O controle recusou o login do cofre.',
    });
  });
});
