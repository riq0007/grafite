// O comando gravar (change p2b-impressoras-por-snmp, design, decisão 6): lê a impressora nas
// subárvores da leitura do coletor, com a descrição do sistema, e grava a gravação no formato do
// snmpsim. Conferido contra o simulador: a gravação tem as mesmas linhas da que alimenta o simulador,
// e o simulador alimentado por ela responde à leitura igual. A comunidade não vai à gravação.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { lerImpressora } from '../src/snmp.ts';
import { iniciarSimuladorSnmp, lerGravacao, type SimuladorSnmp } from '../test/simulador-snmp.ts';
import { gravarImpressora } from './gravar.ts';

const GRAVACOES = join(import.meta.dirname, '..', 'test', 'gravacoes');
const COMUNIDADE = 'comunidade-da-gravacao';
const MOMENTO = new Date('2026-10-14T13:22:00.000Z');

const simuladores: SimuladorSnmp[] = [];

async function simulador(texto: string) {
  const iniciado = await iniciarSimuladorSnmp({ gravacao: { texto }, comunidade: COMUNIDADE });
  simuladores.push(iniciado);
  return iniciado;
}

afterAll(async () => {
  await Promise.all(simuladores.map((iniciado) => iniciado.fechar()));
});

const original = (arquivo: string) => readFile(join(GRAVACOES, arquivo), 'utf8');

/** As linhas da gravação como o simulador as lê: o OID e o valor em BER. */
const linhas = (texto: string) =>
  lerGravacao(texto).map(({ oid, valor }) => `${oid.join('.')}=${valor.toString('hex')}`);

const gravar = (porta: number, versao: '1' | '2c', comunidade = COMUNIDADE) =>
  gravarImpressora({
    ip: '127.0.0.1',
    porta,
    versao,
    comunidade,
    espera: 1000,
    momento: MOMENTO,
  });

describe('o comando gravar', () => {
  for (const [arquivo, versao] of [
    ['multifuncional-colorida.snmprec', '2c'],
    ['laser-de-uma-cor.snmprec', '1'],
    ['termica.snmprec', '2c'],
  ] as const) {
    it(`grava a ${arquivo} pelo SNMP ${versao}, e o simulador da gravação responde igual`, async () => {
      const texto = await original(arquivo);
      const doOriginal = await simulador(texto);
      const gravada = await gravar(doOriginal.porta, versao);
      expect(linhas(gravada)).toEqual(linhas(texto));
      expect(gravada).not.toContain(COMUNIDADE);
      const daGravada = await simulador(gravada);
      const ler = (porta: number) =>
        lerImpressora({ ip: '127.0.0.1', porta, versao, comunidade: COMUNIDADE, espera: 1000 });
      expect(await ler(daGravada.porta)).toEqual(await ler(doOriginal.porta));
    });
  }

  it('escreve o cabeçalho com a data e a versão, o texto legível e o campo de bits em hexadecimal', async () => {
    const doOriginal = await simulador(await original('multifuncional-colorida.snmprec'));
    const gravada = await gravar(doOriginal.porta, '2c');
    expect(gravada.split('\n')[0]).toMatch(
      /^# Gravação lida de uma impressora pelo comando gravar, em 2026-10-14, pelo SNMP v2c/,
    );
    expect(gravada).toContain('\n1.3.6.1.2.1.1.1.0|4|Ricoh IM C3000\n');
    expect(gravada).toContain('\n1.3.6.1.2.1.25.3.5.1.2.1|4x|40\n');
    expect(gravada).toContain('\n1.3.6.1.2.1.43.10.2.1.4.1.1|65|48210\n');
    expect(gravada).toContain('\n1.3.6.1.2.1.43.11.1.1.9.1.2|2|-3\n');
    expect(gravada).toContain('\n1.3.6.1.2.1.43.18.1.1.8.1.1|4|Sem papel na bandeja 2\n');
    expect(gravada.endsWith('\n')).toBe(true);
  });

  it('a impressora que não responde não vira gravação', async () => {
    const doOriginal = await simulador(await original('termica.snmprec'));
    await expect(
      gravarImpressora({
        ip: '127.0.0.1',
        porta: doOriginal.porta,
        versao: '2c',
        comunidade: 'public',
        espera: 200,
        tentativasAMais: 0,
      }),
    ).rejects.toThrow('A impressora não respondeu ao SNMP. Confira o IP, a versão e a comunidade.');
  });

  it('pela linha de comando, grava o arquivo pedido', async () => {
    const pasta = await mkdtemp(join(tmpdir(), 'grafite-gravar-'));
    try {
      const texto = await original('termica.snmprec');
      const doOriginal = await simulador(texto);
      const saida = join(pasta, 'termica.snmprec');
      const { stdout } = await promisify(execFile)(process.execPath, [
        join(import.meta.dirname, 'gravar.ts'),
        '--ip',
        '127.0.0.1',
        '--porta',
        String(doOriginal.porta),
        '--comunidade',
        COMUNIDADE,
        '--saida',
        saida,
      ]);
      expect(stdout.trim()).toBe(`Gravação com ${linhas(texto).length} linhas em ${saida}.`);
      expect(linhas(await readFile(saida, 'utf8'))).toEqual(linhas(texto));
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});
