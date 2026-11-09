import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarSimuladorControlId } from '../test/simulador-control-id.ts';
import { iniciarSimuladorSnmp } from '../test/simulador-snmp.ts';
import type { RespostaDaApi } from './api.ts';
import { criarColetor } from './coletor.ts';
import type { ConfiguracaoDaColeta } from './configuracao.ts';
import { sondarControle } from './control-id.ts';
import type { LoteParaEnviar } from './lotes.ts';
import type { ResultadoDoPing } from './ping.ts';
import { saudeDoColetor } from './saude.ts';
import { lerImpressora } from './snmp.ts';

const ATIVO = '0199d3a0-0000-7000-8000-0000000000a1';
const CONFIGURACAO: ConfiguracaoDaColeta = {
  faixas: ['10.0.0.0/24'],
  alvos: [{ ativoId: ATIVO, ip: '10.0.0.5', coletas: [{ tipo: 'ping', intervalo: 120 }] }],
  proximaEm: 300,
};

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-coletor-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

/** A API de mentira: aceita o token até o teste dizer que não. */
function apiDeMentira() {
  const api = {
    tokenValido: true,
    lotes: [] as LoteParaEnviar[],
    configuracao: async (): Promise<RespostaDaApi<ConfiguracaoDaColeta>> =>
      api.tokenValido ? { tipo: 'ok', dados: CONFIGURACAO } : { tipo: 'token-recusado' },
    lote: async (lote: LoteParaEnviar): Promise<RespostaDaApi<unknown>> => {
      if (!api.tokenValido) return { tipo: 'token-recusado' };
      api.lotes.push(lote);
      return { tipo: 'ok', dados: { gravadas: lote.leituras.length, ignoradas: 0 } };
    },
  };
  return api;
}

function coletorDeTeste(api: ReturnType<typeof apiDeMentira>) {
  const pings: string[] = [];
  const coletor = criarColetor({
    api,
    pasta,
    log: { info: () => {}, warn: () => {} },
    ping: async (ip): Promise<ResultadoDoPing> => {
      pings.push(ip);
      return { resultado: 'online', latencia: 3 };
    },
  });
  return { coletor, pings };
}

describe('o coletor', () => {
  it('pinga os alvos da configuração e manda as leituras num lote', async () => {
    const api = apiDeMentira();
    const { coletor, pings } = coletorDeTeste(api);
    await coletor.iniciar();
    await vi.waitFor(() => expect(pings).toEqual(['10.0.0.5']));
    await coletor.fecharLote();
    await vi.waitFor(() => expect(api.lotes).toHaveLength(1));
    expect(api.lotes[0]?.leituras).toEqual([
      {
        ativoId: ATIVO,
        metrica: 'rede.disponibilidade',
        momento: expect.any(String),
        valor: 'online',
      },
      { ativoId: ATIVO, metrica: 'rede.latencia', momento: expect.any(String), valor: 3 },
    ]);
    await coletor.parar();
  });

  it('o 401 num lote para a coleta e guarda a fila; o coletor volta quando a API aceita o token', async () => {
    const api = apiDeMentira();
    const { coletor, pings } = coletorDeTeste(api);
    await coletor.iniciar();
    await vi.waitFor(() => expect(pings).toHaveLength(1));
    api.tokenValido = false;
    await coletor.fecharLote();
    await vi.waitFor(() => expect(coletor.estado().configuracao.tokenRecusado).toBe(true));
    expect(coletor.estado().agendador.alvos).toBe(0);
    expect(coletor.estado().fila).toMatchObject({ tokenRecusado: true, naFila: 1 });
    expect(api.lotes).toEqual([]);

    api.tokenValido = true;
    await coletor.buscarConfiguracao();
    // A API registra o lote antes de responder, e a fila apaga o arquivo depois da resposta.
    await vi.waitFor(() => {
      expect(api.lotes).toHaveLength(1);
      expect(coletor.estado().fila).toMatchObject({ tokenRecusado: false, naFila: 0 });
    });
    expect(coletor.estado().agendador.alvos).toBe(1);
    await coletor.parar();
  });
});

// A coleta SNMP no coletor (spec impressoras-por-snmp, "Leitura das impressoras"; change
// p2b-impressoras-por-snmp, design, decisão 4): a comunidade vem na configuração e fica só na
// memória, sem ir à fila em disco, ao log nem à saúde.
describe('a coleta SNMP no coletor', () => {
  const COMUNIDADE = 'comunidade-que-nao-sai-da-memoria';

  it('lê a impressora com a comunidade só na memória, fora da fila em disco, do log e da saúde', async () => {
    const simulador = await iniciarSimuladorSnmp({
      gravacao: {
        arquivo: join(
          import.meta.dirname,
          '..',
          'test',
          'gravacoes',
          'multifuncional-colorida.snmprec',
        ),
      },
      comunidade: COMUNIDADE,
    });
    const configuracao: ConfiguracaoDaColeta = {
      faixas: ['127.0.0.0/8'],
      alvos: [
        {
          ativoId: ATIVO,
          ip: '127.0.0.1',
          coletas: [
            { tipo: 'ping', intervalo: 120 },
            { tipo: 'snmp', intervalo: 600, versao: '2c', comunidade: COMUNIDADE },
          ],
        },
      ],
      proximaEm: 300,
    };
    const registros: string[] = [];
    const registrar = (dados: object, mensagem: string) => {
      registros.push(JSON.stringify({ dados, mensagem }));
    };
    const coletor = criarColetor({
      api: {
        configuracao: async (): Promise<RespostaDaApi<ConfiguracaoDaColeta>> => ({
          tipo: 'ok',
          dados: configuracao,
        }),
        // A API fora do ar: o lote fica na fila em disco.
        lote: async (): Promise<RespostaDaApi<unknown>> => ({
          tipo: 'indisponivel',
          motivo: 'conexão recusada',
        }),
      },
      pasta,
      log: { info: registrar, warn: registrar },
      ping: async (): Promise<ResultadoDoPing> => ({ resultado: 'online', latencia: 3 }),
      snmp: (pedido) => lerImpressora({ ...pedido, porta: simulador.porta, espera: 1000 }),
    });
    try {
      await coletor.iniciar();
      await vi.waitFor(() => {
        expect(simulador.respondidos()).toBeGreaterThan(0);
        expect(coletor.estado().agendador).toMatchObject({ alvos: 2, rodando: 0 });
      });
      await coletor.fecharLote();
      // O lote entra na fila, e a fila tenta mandá-lo: a API fora do ar o deixa lá, com o aviso.
      await vi.waitFor(() => {
        expect(coletor.estado().fila.naFila).toBe(1);
        expect(registros.join('\n')).toContain('API indisponível');
      });
      const arquivos = await readdir(pasta, { recursive: true, withFileTypes: true });
      const conteudos = await Promise.all(
        arquivos
          .filter((arquivo) => arquivo.isFile())
          .map((arquivo) => readFile(join(arquivo.parentPath, arquivo.name), 'utf8')),
      );
      const [lote] = conteudos.map((conteudo) => JSON.parse(conteudo) as LoteParaEnviar);
      expect(lote?.leituras.map((leitura) => leitura.metrica)).toEqual(
        expect.arrayContaining(['rede.disponibilidade', 'snmp.resposta', 'impressora.suprimento']),
      );
      for (const conteudo of conteudos) expect(conteudo).not.toContain(COMUNIDADE);
      expect(registros.join('\n')).not.toContain(COMUNIDADE);
      const saude = saudeDoColetor({
        versao: '0.1.0',
        estado: coletor.estado(),
        agora: new Date(),
      });
      expect(JSON.stringify(saude)).not.toContain(COMUNIDADE);
    } finally {
      await coletor.parar();
      await simulador.fechar();
    }
  });
});

// A sondagem do Control iD no coletor (spec saude-do-control-id, "Sondagem dos controles"; change
// p2c-saude-do-control-id, design, decisão 4): o usuário e a senha vêm na configuração e ficam só
// na memória, sem ir à fila em disco, ao log nem à saúde.
describe('a sondagem do Control iD no coletor', () => {
  const USUARIO = 'usuario-que-nao-sai-da-memoria';
  const SENHA = 'senha-que-nao-sai-da-memoria';

  it('sonda o controle com o usuário e a senha só na memória, fora da fila em disco, do log e da saúde', async () => {
    const simulador = await iniciarSimuladorControlId({
      gravacao: {
        arquivo: join(
          import.meta.dirname,
          '..',
          'test',
          'gravacoes',
          'control-id',
          'idaccess-pro.json',
        ),
      },
      usuario: USUARIO,
      senha: SENHA,
    });
    const configuracao: ConfiguracaoDaColeta = {
      faixas: ['127.0.0.0/8'],
      alvos: [
        {
          ativoId: ATIVO,
          ip: '127.0.0.1',
          coletas: [
            {
              tipo: 'controlid',
              intervalo: 300,
              porta: simulador.porta,
              usuario: USUARIO,
              senha: SENHA,
            },
          ],
        },
      ],
      proximaEm: 300,
    };
    const registros: string[] = [];
    const registrar = (dados: object, mensagem: string) => {
      registros.push(JSON.stringify({ dados, mensagem }));
    };
    const coletor = criarColetor({
      api: {
        configuracao: async (): Promise<RespostaDaApi<ConfiguracaoDaColeta>> => ({
          tipo: 'ok',
          dados: configuracao,
        }),
        // A API fora do ar: o lote fica na fila em disco.
        lote: async (): Promise<RespostaDaApi<unknown>> => ({
          tipo: 'indisponivel',
          motivo: 'conexão recusada',
        }),
      },
      pasta,
      log: { info: registrar, warn: registrar },
      controlId: (pedido) => sondarControle({ ...pedido, espera: 2000 }),
    });
    try {
      await coletor.iniciar();
      await vi.waitFor(() => {
        expect(simulador.pedidos().map(({ caminho }) => caminho)).toContain('/logout.fcgi');
        expect(coletor.estado().agendador).toMatchObject({ alvos: 1, rodando: 0 });
      });
      expect(simulador.sessoesAbertas()).toBe(0);
      await coletor.fecharLote();
      await vi.waitFor(() => {
        expect(coletor.estado().fila.naFila).toBe(1);
        expect(registros.join('\n')).toContain('API indisponível');
      });
      const arquivos = await readdir(pasta, { recursive: true, withFileTypes: true });
      const conteudos = await Promise.all(
        arquivos
          .filter((arquivo) => arquivo.isFile())
          .map((arquivo) => readFile(join(arquivo.parentPath, arquivo.name), 'utf8')),
      );
      const [lote] = conteudos.map((conteudo) => JSON.parse(conteudo) as LoteParaEnviar);
      expect(lote?.leituras.map((leitura) => [leitura.metrica, leitura.valor])).toEqual([
        ['controlid.sondagem', 'respondendo'],
        ['controlid.firmware', '6.12.2'],
        ['controlid.serie', '0M0400/123456'],
      ]);
      for (const conteudo of conteudos) {
        expect(conteudo).not.toContain(USUARIO);
        expect(conteudo).not.toContain(SENHA);
      }
      const log = registros.join('\n');
      expect(log).not.toContain(USUARIO);
      expect(log).not.toContain(SENHA);
      const saude = JSON.stringify(
        saudeDoColetor({ versao: '0.1.0', estado: coletor.estado(), agora: new Date() }),
      );
      expect(saude).not.toContain(USUARIO);
      expect(saude).not.toContain(SENHA);
    } finally {
      await coletor.parar();
      await simulador.fechar();
    }
  });
});
