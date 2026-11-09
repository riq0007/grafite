// O comando gravar-control-id (change p2c-saude-do-control-id, design, decisão 5): lê um controle,
// com a senha pela variável de ambiente, e grava a resposta das informações do sistema, sem a
// sessão. Conferido contra o simulador: a gravação tem a mesma resposta da que alimenta o simulador,
// e o simulador alimentado por ela responde à sondagem igual. A senha não vai à gravação.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { sondarControle } from '../src/control-id.ts';
import {
  iniciarSimuladorControlId,
  lerGravacaoDoControle,
  type ModoDoSimulador,
  type SimuladorControlId,
} from '../test/simulador-control-id.ts';
import { gravarControle } from './gravar-control-id.ts';

const GRAVACOES = join(import.meta.dirname, '..', 'test', 'gravacoes', 'control-id');
const USUARIO = 'admin';
const SENHA = 'senha-da-gravacao';
const MOMENTO = new Date('2026-10-14T13:22:00.000Z');
const ESPERAS = { espera: 1000, esperaDaTentativa: 50 };

const simuladores: SimuladorControlId[] = [];

afterEach(async () => {
  await Promise.all(simuladores.splice(0).map((simulador) => simulador.fechar()));
});

async function simulador(
  gravacao: { arquivo: string } | { texto: string },
  modo?: ModoDoSimulador,
) {
  const iniciado = await iniciarSimuladorControlId({
    gravacao,
    usuario: USUARIO,
    senha: SENHA,
    modo,
  });
  simuladores.push(iniciado);
  return iniciado;
}

const gravar = (porta: number) =>
  gravarControle({
    ip: '127.0.0.1',
    porta,
    usuario: USUARIO,
    senha: SENHA,
    momento: MOMENTO,
    ...ESPERAS,
  });

describe('o comando gravar-control-id', () => {
  for (const arquivo of ['idaccess-pro.json', 'idflex.json', 'so-firmware.json']) {
    it(`grava a ${arquivo}, e o simulador da gravação responde igual`, async () => {
      const original = await readFile(join(GRAVACOES, arquivo), 'utf8');
      const doOriginal = await simulador({ texto: original });
      const gravada = await gravar(doOriginal.porta);
      expect(lerGravacaoDoControle(gravada)).toEqual(lerGravacaoDoControle(original));
      expect(gravada).not.toContain(SENHA);
      expect(doOriginal.sessoesAbertas()).toBe(0);
      const daGravada = await simulador({ texto: gravada });
      const sondar = (porta: number) =>
        sondarControle({ ip: '127.0.0.1', porta, usuario: USUARIO, senha: SENHA, ...ESPERAS });
      expect(await sondar(daGravada.porta)).toEqual(await sondar(doOriginal.porta));
    });
  }

  it('diz de onde veio a gravação, em JSON legível', async () => {
    const doOriginal = await simulador({ arquivo: join(GRAVACOES, 'idaccess-pro.json') });
    const gravada = await gravar(doOriginal.porta);
    expect((JSON.parse(gravada) as { _origem: string })._origem).toBe(
      'Gravada de um controle pelo comando gravar-control-id, em 2026-10-14.',
    );
    expect(gravada).toContain('\n  "firmware": "6.12.2",\n');
    expect(gravada.endsWith('\n')).toBe(true);
    for (const pedido of doOriginal.pedidos()) {
      expect(JSON.stringify(gravada)).not.toContain(pedido.sessao ?? 'sem-sessao-no-pedido');
    }
  });

  it('o controle que não responde, que recusa o login ou que não é um Control iD não vira gravação', async () => {
    const recusas: [ModoDoSimulador, string][] = [
      ['cala', 'O controle não respondeu. Confira o IP e a porta.'],
      [
        'recusa',
        'O controle recusou o login. Confira o usuário e a senha em GRAFITE_SENHA_DO_CONTROLE.',
      ],
      ['outro', 'O endereço respondeu, mas não como um Control iD (login: HTTP 404).'],
    ];
    for (const [modo, mensagem] of recusas) {
      const controle = await simulador({ arquivo: join(GRAVACOES, 'idaccess-pro.json') }, modo);
      await expect(
        gravarControle({
          ip: '127.0.0.1',
          porta: controle.porta,
          usuario: USUARIO,
          senha: SENHA,
          espera: 200,
          esperaDaTentativa: 10,
        }),
      ).rejects.toThrow(mensagem);
    }
  });

  it('pela linha de comando, com a senha pela variável de ambiente, grava o arquivo pedido', async () => {
    const pasta = await mkdtemp(join(tmpdir(), 'grafite-gravar-control-id-'));
    try {
      const original = await readFile(join(GRAVACOES, 'idflex.json'), 'utf8');
      const doOriginal = await simulador({ texto: original });
      const saida = join(pasta, 'idflex.json');
      const comando = [
        join(import.meta.dirname, 'gravar-control-id.ts'),
        '--ip',
        '127.0.0.1',
        '--porta',
        String(doOriginal.porta),
        '--usuario',
        USUARIO,
        '--saida',
        saida,
      ];
      const { stdout } = await promisify(execFile)(process.execPath, comando, {
        env: { ...process.env, GRAFITE_SENHA_DO_CONTROLE: SENHA },
      });
      expect(stdout.trim()).toBe(`Gravação do controle em ${saida}.`);
      expect(lerGravacaoDoControle(await readFile(saida, 'utf8'))).toEqual(
        lerGravacaoDoControle(original),
      );
      const semSenha = promisify(execFile)(process.execPath, comando, {
        env: { ...process.env, GRAFITE_SENHA_DO_CONTROLE: '' },
      });
      await expect(semSenha).rejects.toMatchObject({
        code: 2,
        stderr: expect.stringContaining('GRAFITE_SENHA_DO_CONTROLE'),
      });
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});
