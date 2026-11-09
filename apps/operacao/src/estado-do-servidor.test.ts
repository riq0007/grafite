// O estado do servidor em dados (change painel-da-operacao, design, decisão 5; spec
// painel-da-operacao, "Estado do servidor no painel"): os serviços da declaração, as versões, o
// último backup de cada destino, o último teste de restauração, o vencimento do certificado, o
// disco e a faixa de avisos, com as peças simuladas, sobre uma instalação da 0.4.0.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instalacaoDeExemplo } from '../test/instalacao-de-exemplo.ts';
import type { BackupsDoDestino, RegistrosDoBackup } from './backup.ts';
import { type EstadoDaInstalacao, gravarEstado, lerEstado } from './estado.ts';
import { estadoDoServidor, type PecasDoEstado } from './estado-do-servidor.ts';
import { servicosDaInstalacao } from './layout.ts';
import type { EstadoDoServico, Servicos } from './windows/servicos.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-estado-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const AGORA = new Date('2026-10-28T12:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

function servicosCom(estados: Record<string, EstadoDoServico> = {}): Servicos {
  return {
    registrar: async () => {},
    iniciar: async () => {},
    parar: async () => {},
    estado: async (id) => estados[id] ?? 'rodando',
  };
}

/** As peças do estado sobre a instalação, todas em dia, com o que o teste mudar. */
async function pecas(mudar: Partial<PecasDoEstado> = {}) {
  const { raiz } = await instalacaoDeExemplo(pasta);
  const destino = join(raiz, 'backups');
  const listados: BackupsDoDestino[] = [
    {
      destino,
      backups: [
        {
          nome: '2026-10-28T0500Z',
          criadoEm: new Date('2026-10-28T05:00:00.000Z'),
          versao: '0.4.0',
        },
      ],
    },
  ];
  const registros: RegistrosDoBackup = {
    ultimoBackup: { situacao: 'feito', momento: new Date('2026-10-28T05:00:00.000Z') },
    ultimoTeste: { situacao: 'feito', momento: new Date('2026-10-26T06:00:00.000Z') },
  };
  return {
    raiz,
    pecas: {
      raiz,
      plataforma: { nome: 'windows', nomeDoServico: (id: string) => id },
      servicos: servicosCom(),
      backup: { listar: async () => listados, registros: async () => registros },
      vencimentoDoCertificado: async () => new Date(AGORA.getTime() + 60 * DIA),
      disco: async () => ({ livre: 500e9, total: 1000e9 }),
      agora: () => AGORA,
      ...mudar,
    } satisfies PecasDoEstado,
  };
}

describe('o estado do servidor', () => {
  it('junta os serviços, as versões, os backups, o teste de restauração, o certificado e o disco, sem avisos', async () => {
    const { pecas: dep, raiz } = await pecas();
    const estado = await estadoDoServidor(dep);
    expect(estado.servicos.map(({ nome, estado: situacao }) => `${nome}: ${situacao}`)).toEqual(
      servicosDaInstalacao().map(({ nome }) => `${nome}: rodando`),
    );
    expect(estado.servicos[0]).toEqual({
      id: 'grafite',
      nome: 'Grafite',
      nomeNaPlataforma: 'grafite',
      ambiente: 'producao',
      ligadoPeloAmbiente: true,
      estado: 'rodando',
    });
    expect(estado.ambientes).toEqual({
      producao: { atual: '0.4.0', anterior: null, enderecos: ['grafite.empresa.com.br'] },
      teste: { atual: '0.4.0', anterior: null, enderecos: ['grafite-teste.empresa.com.br'] },
    });
    expect(estado.backups).toEqual([
      {
        destino: join(raiz, 'backups'),
        ultimo: { nome: '2026-10-28T0500Z', momento: '2026-10-28T05:00:00.000Z', versao: '0.4.0' },
      },
    ]);
    expect(estado.ultimoBackup).toEqual({ situacao: 'feito', momento: '2026-10-28T05:00:00.000Z' });
    expect(estado.testeDeRestauracao).toEqual({
      situacao: 'feito',
      momento: '2026-10-26T06:00:00.000Z',
    });
    expect(estado.certificado).toEqual({
      modo: 'interno',
      ac: 'caddy',
      venceEm: new Date(AGORA.getTime() + 60 * DIA).toISOString(),
      dias: 60,
    });
    expect(estado.disco).toEqual({ livre: 500e9, total: 1000e9 });
    expect(estado.avisos).toEqual([]);
  });

  it('Serviço parado: o coletor parado aparece parado, e a faixa de avisos o diz', async () => {
    const { pecas: dep } = await pecas({
      servicos: servicosCom({ 'grafite-coletor': 'parado', 'postgresql-x64-18': 'ausente' }),
    });
    const estado = await estadoDoServidor(dep);
    expect(estado.servicos.find(({ id }) => id === 'grafite-coletor')?.estado).toBe('parado');
    expect(estado.avisos).toEqual([
      'O Grafite Coletor está parado.',
      'O PostgreSQL da produção não está registrado neste servidor.',
    ]);
  });

  it('Certificado perto de vencer: no modo público, o aviso diz em quantos dias ele vence e o que fazer', async () => {
    const { pecas: dep, raiz } = await pecas({
      vencimentoDoCertificado: async () => new Date(AGORA.getTime() + 10 * DIA),
    });
    const instalado = (await lerEstado(raiz)) as EstadoDaInstalacao;
    await gravarEstado({
      ...instalado,
      certificado: { modo: 'publico', email: 'ti@empresa.com.br', provedorDns: 'cloudflare' },
    });
    const estado = await estadoDoServidor(dep);
    expect(estado.certificado).toMatchObject({ modo: 'publico', dias: 10 });
    expect(estado.avisos).toEqual([
      'O certificado do proxy vence em 10 dias. Ele se renova sozinho 30 dias antes: confira o token do DNS e o log do proxy, como diz o runbook ("Certificado").',
    ]);
  });

  it('com a AC do proxy, o certificado de poucas horas se renova sozinho e não vira aviso', async () => {
    const { pecas: dep } = await pecas({
      vencimentoDoCertificado: async () => new Date(AGORA.getTime() + 6 * 60 * 60 * 1000),
    });
    const estado = await estadoDoServidor(dep);
    expect(estado.certificado.dias).toBe(0);
    expect(estado.avisos).toEqual([]);
  });

  it('Serviço novo na instalação: aparece na lista, com o estado dele', async () => {
    const { pecas: dep } = await pecas({
      declaracao: [
        ...servicosDaInstalacao(),
        {
          id: 'grafite-chat',
          noCompose: 'chat',
          nome: 'Grafite Chat',
          ambiente: 'producao',
          ligadoPeloAmbiente: true,
        },
      ],
    });
    const estado = await estadoDoServidor(dep);
    expect(estado.servicos.at(-1)).toMatchObject({ nome: 'Grafite Chat', estado: 'rodando' });
  });

  it('o backup com falha, o de mais de 26 horas, o destino sem o mais novo e o disco cheio viram avisos', async () => {
    const { pecas: dep, raiz } = await pecas({
      disco: async () => ({ livre: 50e9, total: 1000e9 }),
    });
    const outro = join(pasta, 'compartilhamento');
    dep.backup = {
      listar: async () => [
        {
          destino: join(raiz, 'backups'),
          backups: [{ nome: '2026-10-27T0500Z', criadoEm: new Date('2026-10-27T05:00:00.000Z') }],
        },
        { destino: outro, backups: [] },
      ],
      registros: async () => ({
        ultimoBackup: {
          situacao: 'falhou',
          momento: new Date('2026-10-28T05:00:00.000Z'),
          erro: 'O destino não aceitou a gravação.',
        },
        ultimoTeste: null,
      }),
    };
    const estado = await estadoDoServidor(dep);
    expect(estado.avisos).toEqual([
      'O último backup falhou: O destino não aceitou a gravação.',
      'O backup mais novo tem mais de 26 horas.',
      `O destino ${outro} não tem nenhum backup pronto.`,
      'O disco da instalação tem só 5% de espaço livre.',
    ]);
    expect(estado.testeDeRestauracao).toBeNull();
  });

  it('com o banco da produção parado, o teste de restauração fica sem informação, e o resto aparece', async () => {
    const { pecas: dep } = await pecas({
      servicos: servicosCom({ grafite: 'parado', 'grafite-teste': 'parado' }),
    });
    dep.backup = {
      ...dep.backup,
      registros: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      },
    };
    dep.vencimentoDoCertificado = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:443');
    };
    const estado = await estadoDoServidor(dep);
    expect(estado.testeDeRestauracao).toBe('sem-informacao');
    expect(estado.ultimoBackup).toBe('sem-informacao');
    expect(estado.certificado).toEqual({ modo: 'interno', ac: 'caddy', venceEm: null, dias: null });
    expect(estado.avisos).toEqual(['O Grafite está parado.', 'O Grafite Teste está parado.']);
  });
});
