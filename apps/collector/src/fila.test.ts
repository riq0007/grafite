import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RespostaDaApi } from './api.ts';
import { criarFila } from './fila.ts';
import type { LoteParaEnviar } from './lotes.ts';

const INICIO = new Date('2026-10-12T12:00:00.000Z').getTime();
const DIA = 24 * 60 * 60_000;

const lote = (n: number): LoteParaEnviar => ({
  chave: `0199d3a0-0000-7000-8000-${String(n).padStart(12, '0')}`,
  leituras: [
    {
      ativoId: '0199d3a0-0000-7000-8000-0000000000a1',
      metrica: 'rede.disponibilidade',
      momento: new Date(INICIO + n * 1_000).toISOString(),
      valor: 'online',
    },
  ],
});

const ok = { tipo: 'ok' as const, dados: { gravadas: 1, ignoradas: 0, repetido: false } };
const fora = { tipo: 'indisponivel' as const, motivo: 'ECONNREFUSED' };

let pasta: string;
let relogio: number;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-fila-'));
  relogio = INICIO;
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

/** A fila com a API de mentira, o relógio do teste e a espera guardada, sem rodar sozinha. */
function filaDeTeste(respostas: RespostaDaApi<unknown>[] = []) {
  const enviados: string[] = [];
  const avisos: { dados: object; mensagem: string }[] = [];
  const esperas: number[] = [];
  let pendente: (() => void) | null = null;
  const aoRecusarToken = vi.fn();
  const api = {
    lote: vi.fn(async (enviado: LoteParaEnviar) => {
      enviados.push(enviado.chave);
      return respostas.shift() ?? ok;
    }),
  };
  const fila = criarFila({
    pasta,
    api,
    agora: () => new Date(relogio),
    log: {
      info: () => {},
      warn: (dados: object, mensagem: string) => avisos.push({ dados, mensagem }),
    },
    agendar: (acao, ms) => {
      esperas.push(ms);
      pendente = acao;
      return () => {
        pendente = null;
      };
    },
    aoRecusarToken,
  });
  /** Roda a tentativa que a fila deixou marcada, como o relógio faria. */
  const tentarDeNovo = async () => {
    const acao = pendente;
    pendente = null;
    acao?.();
    await fila.esvaziar();
  };
  return { fila, api, enviados, avisos, esperas, tentarDeNovo, aoRecusarToken };
}

const arquivos = async () => (await readdir(pasta)).sort();

describe('a fila em disco', () => {
  it('guarda cada lote num arquivo, manda e apaga o arquivo do lote aceito', async () => {
    const { fila, enviados } = filaDeTeste();
    await fila.iniciar();
    await fila.guardar(lote(1));
    await fila.esvaziar();
    expect(enviados).toEqual([lote(1).chave]);
    expect(await arquivos()).toEqual([]);
    expect(fila.estado()).toMatchObject({
      naFila: 0,
      ultimoLoteAceito: new Date(INICIO),
      descartados: 0,
      apiSemResponderDesde: null,
    });
  });

  it('com a API fora, guarda os lotes e reenvia na ordem, o mais antigo primeiro', async () => {
    const { fila, enviados, tentarDeNovo } = filaDeTeste([fora]);
    await fila.iniciar();
    await fila.guardar(lote(1));
    await fila.esvaziar();
    relogio += 1_000;
    await fila.guardar(lote(2));
    relogio += 1_000;
    await fila.guardar(lote(3));
    await fila.esvaziar();
    expect(enviados).toEqual([lote(1).chave]);
    expect(await arquivos()).toHaveLength(3);
    expect(fila.estado()).toMatchObject({ naFila: 3, apiSemResponderDesde: new Date(INICIO) });
    await tentarDeNovo();
    expect(enviados).toEqual([lote(1).chave, lote(1).chave, lote(2).chave, lote(3).chave]);
    expect(await arquivos()).toEqual([]);
    expect(fila.estado()).toMatchObject({ naFila: 0, apiSemResponderDesde: null });
  });

  it('espera 5 s, dobrando até 5 min, e volta aos 5 s depois de um lote aceito', async () => {
    const { fila, esperas, tentarDeNovo } = filaDeTeste([
      ...Array.from({ length: 8 }, () => fora),
      ok,
      fora,
    ]);
    await fila.iniciar();
    await fila.guardar(lote(1));
    await fila.esvaziar();
    for (let i = 0; i < 8; i++) await tentarDeNovo();
    await fila.guardar(lote(2));
    await fila.esvaziar();
    expect(esperas).toEqual([
      5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 5_000,
    ]);
  });

  it('sobrevive ao reinício: a fila nova reenvia os lotes que ficaram na pasta', async () => {
    const antes = filaDeTeste([fora]);
    await antes.fila.iniciar();
    await antes.fila.guardar(lote(1));
    await antes.fila.esvaziar();
    antes.fila.parar();
    const depois = filaDeTeste();
    await depois.fila.iniciar();
    expect(depois.fila.estado().naFila).toBe(1);
    await depois.fila.esvaziar();
    expect(depois.enviados).toEqual([lote(1).chave]);
    expect(await arquivos()).toEqual([]);
  });

  it('descarta o lote com mais de 7 dias, sem mandar, e conta os descartados', async () => {
    const { fila, enviados, avisos, tentarDeNovo } = filaDeTeste([fora]);
    await fila.iniciar();
    await fila.guardar(lote(1));
    await fila.esvaziar();
    relogio += 7 * DIA - 1_000;
    await fila.guardar(lote(2));
    relogio += 1_001;
    await tentarDeNovo();
    expect(enviados).toEqual([lote(1).chave, lote(2).chave]);
    expect(fila.estado()).toMatchObject({ naFila: 0, descartados: 1 });
    expect(avisos.map((aviso) => aviso.mensagem)).toContain(
      'lote com mais de 7 dias descartado da fila',
    );
  });

  it('o lote recusado pela API é descartado, com o motivo no log, e a fila segue', async () => {
    const motivo = 'Leitura 1: o momento está mais de 5 minutos no futuro.';
    const { fila, enviados, avisos } = filaDeTeste([{ tipo: 'recusado', motivo }, ok]);
    await fila.iniciar();
    await fila.guardar(lote(1));
    await fila.guardar(lote(2));
    await fila.esvaziar();
    expect(enviados).toEqual([lote(1).chave, lote(2).chave]);
    expect(await arquivos()).toEqual([]);
    expect(fila.estado().descartados).toBe(1);
    expect(avisos).toContainEqual({
      dados: { chave: lote(1).chave, motivo },
      mensagem: 'lote recusado pela API e descartado',
    });
  });

  it('com o token recusado, para de mandar, guarda os lotes e avisa; retomar manda de novo', async () => {
    const { fila, enviados, aoRecusarToken } = filaDeTeste([{ tipo: 'token-recusado' }]);
    await fila.iniciar();
    await fila.guardar(lote(1));
    await fila.esvaziar();
    expect(aoRecusarToken).toHaveBeenCalledOnce();
    expect(fila.estado()).toMatchObject({ tokenRecusado: true, naFila: 1 });
    await fila.guardar(lote(2));
    await fila.esvaziar();
    expect(enviados).toEqual([lote(1).chave]);
    fila.retomar();
    await fila.esvaziar();
    expect(enviados).toEqual([lote(1).chave, lote(1).chave, lote(2).chave]);
    expect(fila.estado()).toMatchObject({ tokenRecusado: false, naFila: 0 });
  });

  it('descarta o arquivo ilegível e apaga o temporário de uma escrita interrompida', async () => {
    await writeFile(join(pasta, '2026-10-12T11-00-00-000Z-quebrado.json'), '{"chave":');
    await writeFile(join(pasta, '2026-10-12T11-00-01-000Z-meio.json.tmp'), '{');
    const { fila, enviados } = filaDeTeste();
    await fila.iniciar();
    await fila.esvaziar();
    expect(enviados).toEqual([]);
    expect(await arquivos()).toEqual([]);
    expect(fila.estado().descartados).toBe(1);
  });
});
