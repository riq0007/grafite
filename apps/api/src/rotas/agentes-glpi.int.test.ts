// O protocolo do agente do GLPI pela API (spec inventario-pelo-agente; change
// inventario-pelo-agente-glpi): o CONTACT com a tarefa e o prazo; o INVENTORY comprimido pelo zlib
// e pelo gzip, ligado ao ativo pela série, com os valores do inventário (o campo travado fica) e os
// softwares; o inventário parcial sem softwares; a máquina sem ativo; e as recusas do token e do
// corpo fora do protocolo.
import { deflateSync, gzipSync } from 'node:zlib';
import {
  agentes,
  ativos,
  auditoria,
  naOrganizacao,
  softwaresDosAtivos,
  tiposDeAtivo,
  tokensDosAgentes,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';
import { hashDoToken } from '../agentes/agentes.ts';

const host = 'grafite.agentes.local';
const TOKEN = 'token-dos-agentes-de-teste-0123456789abcdef';
let api: ApiDeTeste;
let org = '';
let computador = '';

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

const INVENTARIO = {
  hardware: { name: 'RECEPCAO-01', memory: 16_249 },
  bios: { ssn: 'brj 1234567', smanufacturer: 'Dell Inc.', smodel: 'OptiPlex 7070' },
  cpus: [{ name: 'Intel(R) Core(TM) i5-9500 CPU @ 3.00GHz' }],
  storages: [{ model: 'Samsung SSD 860 EVO', disksize: 476_940, type: 'disk' }],
  operatingsystem: { full_name: 'Microsoft Windows 10 Pro', version: '22H2' },
  antivirus: [{ name: 'Windows Defender', enabled: true, uptodate: true }],
  networks: [{ ipaddress: '10.0.5.21' }],
  softwares: [
    { name: 'Microsoft Office Professional Plus 2019', version: '16.0', publisher: 'Microsoft' },
    { name: '7-Zip 23.01 (x64)', version: '23.01', publisher: 'Igor Pavlov' },
  ],
  versionclient: 'GLPI-Agent_v1.7.3',
};

type Compressao = 'zlib' | 'gzip' | 'nenhuma';

function enviar(
  corpo: unknown,
  { compressao = 'nenhuma', token = TOKEN } = {} as {
    compressao?: Compressao;
    token?: string;
  },
) {
  const json = Buffer.from(JSON.stringify(corpo));
  const [tipo, payload] =
    compressao === 'zlib'
      ? ['application/x-compress-zlib', deflateSync(json)]
      : compressao === 'gzip'
        ? ['application/x-compress-gzip', gzipSync(json)]
        : ['application/json', json];
  return api.app.inject({
    method: 'POST',
    url: `/agentes/glpi/${token}`,
    headers: { host, 'content-type': tipo },
    payload,
  });
}

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await naOrg(async (tx) => {
    await tx
      .insert(tokensDosAgentes)
      .values({ orgId: org, hashDoToken: hashDoToken(TOKEN), criadoPor: ana.id });
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
        capacidades: ['hardware.inventario'],
      })
      .returning({ id: tiposDeAtivo.id });
    const [linha] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId: tipo?.id ?? '',
        busca: '',
        nome: 'Estação da recepção',
        patrimonio: 'PAT-00321',
        serie: 'BRJ1234567',
        estado: {
          'hardware.processador': { origem: null, momento: null, autorId: null, trava: true },
        },
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    computador = linha?.id ?? '';
  });
});

afterAll(async () => {
  await api?.fechar();
});

/** O PROLOG como o agente do GLPI 1.21 manda: o XML comprimido com o zlib e o id dele no cabeçalho. */
function prolog(xml: string, token = TOKEN) {
  return api.app.inject({
    method: 'POST',
    url: `/agentes/glpi/${token}`,
    headers: {
      host,
      'content-type': 'application/x-compress-zlib',
      'user-agent': 'GLPI-Agent_v1.21-1',
      'glpi-agent-id': 'ee67f532-5dc0-461a-a106-16c3306e8481',
    },
    payload: deflateSync(Buffer.from(xml)),
  });
}

const XML_DO_PROLOG = `<?xml version="1.0" encoding="UTF-8"?>
<REQUEST>
  <DEVICEID>PC-TESTE-01-2026-10-28-11-46-12</DEVICEID>
  <QUERY>PROLOG</QUERY>
  <TOKEN>12345678</TOKEN>
</REQUEST>
`;

describe('o PROLOG do agente (change prolog-do-agente-glpi)', () => {
  it.each(['application/xml', 'text/xml'])('aceita PROLOG puro como %s', async (tipo) => {
    const r = await api.app.inject({
      method: 'POST',
      url: `/api/agentes/glpi/${TOKEN}`,
      headers: { host, 'content-type': `${tipo}; charset=UTF-8` },
      payload: XML_DO_PROLOG,
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ status: 'ok', expiration: 24 });
  });

  it('recusa o corpo que ultrapassa 20 MB após descompressão', async () => {
    const r = await prolog(`${XML_DO_PROLOG}${' '.repeat(20 * 1024 * 1024)}`);
    expect(r.statusCode).toBe(413);
    expect(r.json()).toMatchObject({ status: 'error' });
  });

  it('Primeiro contato do agente: o PROLOG em XML é respondido em JSON, sem gravar nada', async () => {
    const r = await prolog(XML_DO_PROLOG);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['content-type']).toContain('application/json');
    expect(r.json()).toEqual({ status: 'ok', expiration: 24 });
    const gravados = await naOrg((tx) =>
      tx.select().from(agentes).where(eq(agentes.deviceid, 'PC-TESTE-01-2026-10-28-11-46-12')),
    );
    expect(gravados).toEqual([]);
  });

  it('o PROLOG com o token desconhecido é recusado, e o XML que não é PROLOG, fora do protocolo', async () => {
    expect((await prolog(XML_DO_PROLOG, 'outro-token')).statusCode).toBe(403);
    const outro = await prolog('<?xml version="1.0"?><REQUEST><QUERY>INVENTORY</QUERY></REQUEST>');
    expect(outro.statusCode).toBe(400);
    expect(outro.json()).toMatchObject({ status: 'error' });
  });
});

describe('o protocolo do agente', () => {
  it('Agente com dois servidores e Tarefas anunciadas: o CONTACT recebe as tarefas e o prazo', async () => {
    const r = await enviar(
      {
        action: 'contact',
        deviceid: 'RECEPCAO-01-2024-03-02-10-15-00',
        name: 'GLPI-Agent',
        version: '1.7.3',
        'installed-tasks': ['inventory', 'deploy'],
      },
      { compressao: 'zlib' },
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      status: 'ok',
      expiration: 24,
      tasks: {
        inventory: { server: 'glpi', version: '1.0' },
        deploy: { server: 'glpi', version: '1.0' },
      },
      disabled: ['netdiscovery', 'netinventory', 'esx', 'collect', 'wakeonlan'],
    });
    const [agente] = await naOrg((tx) => tx.select().from(agentes));
    expect(agente).toMatchObject({ nome: 'RECEPCAO-01', versao: '1.7.3', ultimoInventario: null });
  });

  it('Ligado pela série: o inventário entra no ativo, com o campo travado como estava', async () => {
    const r = await enviar(
      { action: 'inventory', deviceid: 'RECEPCAO-01-2024-03-02-10-15-00', content: INVENTARIO },
      { compressao: 'zlib' },
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ status: 'ok', expiration: 24 });
    const [agente] = await naOrg((tx) => tx.select().from(agentes));
    expect(agente).toMatchObject({
      ativoId: computador,
      serie: 'brj 1234567',
      sistema: 'Microsoft Windows 10 Pro',
      ip: '10.0.5.21',
      versao: 'GLPI-Agent_v1.7.3',
    });
    const [ativo] = await naOrg((tx) => tx.select().from(ativos).where(eq(ativos.id, computador)));
    expect(ativo?.hostname).toBe('RECEPCAO-01');
    expect(ativo?.serie).toBe('BRJ1234567');
    expect(ativo?.valores).toMatchObject({
      'hardware.memoria': 16,
      'hardware.discos': 'Samsung SSD 860 EVO (466 GB)',
      'software.sistema': 'Microsoft Windows 10 Pro',
      'software.versao-do-sistema': '22H2',
      'software.antivirus': 'Windows Defender (ativo, atualizado)',
    });
    expect(ativo?.valores).not.toHaveProperty('hardware.processador');
    const estado = (ativo?.estado ?? {}) as Record<string, { origem: string }>;
    expect(estado['hardware.memoria']).toMatchObject({ origem: 'agente', autorId: null });
    const [registro] = await naOrg((tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'ativo.alterado')),
    );
    expect(registro).toMatchObject({ atorTipo: 'sistema', atorDescricao: 'Agente do GLPI' });
    const softwares = await naOrg((tx) =>
      tx.select({ nome: softwaresDosAtivos.nome }).from(softwaresDosAtivos),
    );
    expect(softwares.map(({ nome }) => nome).sort()).toEqual([
      '7-Zip 23.01 (x64)',
      'Microsoft Office Professional Plus 2019',
    ]);
  });

  it('o inventário parcial pelo gzip, sem os softwares, não mexe na lista; o sem mudança não grava', async () => {
    const r = await enviar(
      {
        action: 'inventory',
        deviceid: 'RECEPCAO-01-2024-03-02-10-15-00',
        partial: true,
        content: { hardware: INVENTARIO.hardware, versionclient: 'GLPI-Agent_v1.7.3' },
      },
      { compressao: 'gzip' },
    );
    expect(r.statusCode, r.body).toBe(200);
    const softwares = await naOrg((tx) => tx.select().from(softwaresDosAtivos));
    expect(softwares).toHaveLength(2);
    const alteracoes = await naOrg((tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'ativo.alterado')),
    );
    expect(alteracoes).toHaveLength(1);
  });

  it('Máquina sem ativo: o agente fica sem ativo', async () => {
    const r = await enviar({
      action: 'inventory',
      deviceid: 'ALMOX-07-2024-01-01-00-00-00',
      content: { hardware: { name: 'ALMOX-07' }, bios: { ssn: 'XYZ999' } },
    });
    expect(r.statusCode).toBe(200);
    const [agente] = await naOrg((tx) =>
      tx.select().from(agentes).where(eq(agentes.nome, 'ALMOX-07')),
    );
    expect(agente?.ativoId).toBeNull();
  });

  it('recusa o token desconhecido com 403 e o corpo fora do protocolo com 400, sem gravar', async () => {
    const outro = await enviar(
      { action: 'contact', deviceid: 'INTRUSO-2024-01-01-00-00-00' },
      { token: 'outro-token' },
    );
    expect(outro.statusCode).toBe(403);
    expect(outro.json()).toEqual({
      status: 'error',
      message: 'Endereço dos agentes desconhecido ou desligado.',
    });
    const quebrado = await api.app.inject({
      method: 'POST',
      url: `/agentes/glpi/${TOKEN}`,
      headers: { host, 'content-type': 'application/x-compress-zlib' },
      payload: Buffer.from('não é zlib'),
    });
    expect(quebrado.statusCode).toBe(400);
    expect(quebrado.json().status).toBe('error');
    const intrusos = await naOrg((tx) =>
      tx.select().from(agentes).where(eq(agentes.nome, 'INTRUSO')),
    );
    expect(intrusos).toEqual([]);
  });
});
