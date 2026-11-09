// A série dos suprimentos (spec impressoras-por-snmp, "Série dos suprimentos"; change
// suprimentos-rostos-e-backups, design, decisão 2): o último percentual válido de cada dia de São
// Paulo, nos últimos 30 dias, com o acesso da ficha do ativo.
import { randomUUID } from 'node:crypto';
import { ativos, campos, leituras, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CofreDeTeste, montarCofre } from '../../test/cofre.ts';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';
import { criarColetor } from '../coleta/coletores.ts';

const host = 'grafite.suprimentos-serie.local';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';
const ids: Record<string, string> = {};
const id = (nome: string) => ids[nome] ?? '';
const HORA = 3_600_000;

async function tipo(nome: string, capacidades: string[], configuracao: Record<string, unknown>) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        icone: 'impressora',
        capacidades,
        configuracaoDasCapacidades: configuracao,
      })
      .returning({ id: tiposDeAtivo.id });
    return linha?.id ?? '';
  });
}

async function ativo(tipoId: string) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(ativos)
      .values({ orgId: org, tipoId, busca: '', valores: {} } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    return linha?.id ?? '';
  });
}

beforeAll(async () => {
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
  await naOrganizacao(api.banco, org, async (tx) => {
    const [ip] = await tx
      .insert(campos)
      .values({
        orgId: org,
        rotulo: 'IP',
        rotuloNormalizado: 'ip',
        tipo: 'ip',
        configuracao: {},
      } as typeof campos.$inferInsert)
      .returning({ id: campos.id });
    ids.ip = ip?.id ?? '';
  });
  ids.impressora = await tipo('Impressora', ['snmp.suprimentos'], {
    'snmp.suprimentos': { campoDoIp: id('ip'), versao: '2c', segredoId: null },
  });
  ids.semCapacidade = await tipo('Monitor', [], {});
  ids.pat412 = await ativo(id('impressora'));
  ids.monitor = await ativo(id('semCapacidade'));
  const agora = api.relogio.agora();
  await naOrganizacao(api.banco, org, async (tx) => {
    const coletor = await criarColetor(tx, {
      nome: 'Coletor da matriz',
      faixas: ['10.0.5.0/24'],
      token: `token-do-coletor-da-matriz-${'x'.repeat(40)}`,
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: agora,
    });
    // O toner preto cai 1,5 ponto por dia, lido a cada 6 horas por 35 dias; o cilindro diz só que
    // há suprimento, e uma leitura do toner veio fora da faixa.
    const linhas: (typeof leituras.$inferInsert)[] = [];
    for (let hora = 35 * 24; hora >= 0; hora -= 6) {
      const momento = new Date(agora.getTime() - hora * HORA);
      linhas.push({
        orgId: org,
        ativoId: id('pat412'),
        metrica: 'impressora.suprimento',
        item: '1',
        momento,
        valorNumero: Math.round((95 - ((35 * 24 - hora) / 24) * 1.5) * 10) / 10,
        situacao: 'valida',
        detalhes: { descricao: 'Black Toner Cartridge', capacidade: 1000, nivel: 0 },
        coletorId: coletor.id,
      });
      linhas.push({
        orgId: org,
        ativoId: id('pat412'),
        metrica: 'impressora.suprimento',
        item: '2',
        momento,
        valorNumero: null,
        situacao: 'valida',
        detalhes: { descricao: 'Imaging Drum', capacidade: -3, nivel: -3 },
        coletorId: coletor.id,
      });
    }
    linhas.push({
      orgId: org,
      ativoId: id('pat412'),
      metrica: 'impressora.suprimento',
      item: '1',
      momento: new Date(agora.getTime() - 1000),
      valorNumero: 140,
      situacao: 'inconsistente',
      detalhes: { descricao: 'Black Toner Cartridge', capacidade: 1000, nivel: 1400 },
      coletorId: coletor.id,
    });
    await tx.insert(leituras).values(linhas);
  });
});

afterAll(async () => {
  await api?.fechar();
});

const serie = (ativoId: string, usuario: 'ana' | 'bruno' = 'ana') =>
  cofre.cliente.consultar(`/ativos/${ativoId}/suprimentos/serie`, cofre.como(usuario));

describe('a série dos suprimentos', () => {
  it('série de 30 dias: um ponto por dia, com o último percentual válido do dia', async () => {
    const r = await serie(id('pat412'));
    expect(r.statusCode, r.body).toBe(200);
    const { itens } = r.json() as {
      itens: {
        item: string;
        descricao: string;
        pontos: { dia: string; momento: string; percentual: number }[];
      }[];
    };
    expect(itens.map((item) => item.item)).toEqual(['1']);
    const [toner] = itens;
    expect(toner?.descricao).toBe('Black Toner Cartridge');
    expect(toner?.pontos).toHaveLength(30);
    const dias = toner?.pontos.map((ponto) => ponto.dia) ?? [];
    expect([...dias].sort()).toEqual(dias);
    expect(new Set(dias).size).toBe(30);
    const ultimo = toner?.pontos.at(-1);
    expect(ultimo?.percentual).toBe(42.5);
    expect(toner?.pontos.every((ponto) => ponto.percentual <= 100)).toBe(true);
  });

  it('o tipo sem a capacidade dá a lista vazia', async () => {
    const r = await serie(id('monitor'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ itens: [] });
  });

  it('pede ativos.ver, e o que não existe responde 404', async () => {
    expect((await serie(id('pat412'), 'bruno')).statusCode).toBe(403);
    expect((await serie(randomUUID())).statusCode).toBe(404);
  });
});
