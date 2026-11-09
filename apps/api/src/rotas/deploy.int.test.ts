// O Deploy do agente do GLPI pela API (spec distribuicao-de-software, "Deploy pelo agente do GLPI";
// change distribuicao-de-software): o agente simulado faz o que o Deploy dele faz, por GET, com os
// argumentos na query string: o `getConfig`, o `getJobs`, as partes no espelho, conferidas pelo
// SHA-512 e montadas pelo gunzip, e o `setStatus` de cada passo. Uma máquina conclui, a outra falha.
import { createHash, randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  pacotesDeSoftware,
  tiposDeAtivo,
  tokensDosAgentes,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';
import { hashDoToken } from '../agentes/agentes.ts';
import { trocarArquivoDoPacote } from '../software/pacotes.ts';

const host = 'grafite.deploy.local';
const TOKEN = 'token-do-deploy-de-teste-0123456789abcdef';
const ENDERECO = `/agentes/glpi/${TOKEN}`;
const ARQUIVO = randomBytes(9 * 1024 * 1024);
let api: ApiDeTeste;
let org = '';
const maquinas: Record<string, string> = {};

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);
const sha512 = (conteudo: Buffer) => createHash('sha512').update(conteudo).digest('hex');

/** O GET do cliente "Fusion" do agente: o hash vira `chave[campo]`, e a lista, `chave[]`. */
function pedir(endereco: string, args: Record<string, string | string[] | Record<string, string>>) {
  const partes = Object.entries(args).flatMap(([chave, valor]) =>
    Array.isArray(valor)
      ? valor.map((item) => `${chave}[]=${encodeURIComponent(item)}`)
      : typeof valor === 'object'
        ? Object.entries(valor).map(
            ([campo, item]) => `${chave}[${campo}]=${encodeURIComponent(item)}`,
          )
        : [`${chave}=${encodeURIComponent(valor)}`],
  );
  return api.app.inject({
    method: 'GET',
    url: `${new URL(endereco).pathname}?${partes.join('&')}`,
    headers: { host },
  });
}

const maquina = (id: string) =>
  naOrg(async (tx) => {
    const [linha] = await tx
      .select()
      .from(maquinasDasDistribuicoes)
      .where(eq(maquinasDasDistribuicoes.id, id));
    return linha;
  });

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
      })
      .returning({ id: tiposDeAtivo.id });
    const [pacote] = await tx
      .insert(pacotesDeSoftware)
      .values({
        orgId: org,
        nome: '7-Zip 23.01',
        nomeNormalizado: normalizarTexto('7-Zip 23.01'),
        comando: 'msiexec /i "7z2301-x64.msi" /qn',
      })
      .returning({ id: pacotesDeSoftware.id });
    await trocarArquivoDoPacote(tx, {
      orgId: org,
      pacoteId: pacote?.id ?? '',
      nome: '7z2301-x64.msi',
      arquivo: ARQUIVO,
      armazenamento: api.armazenamento,
      momento: new Date(),
    });
    const [distribuicao] = await tx
      .insert(distribuicoes)
      .values({ orgId: org, pacoteId: pacote?.id ?? '', criadaPor: ana.id })
      .returning({ id: distribuicoes.id });
    for (const chave of ['recepcao', 'financeiro']) {
      const [ativo] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: '',
          nome: chave,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const [agente] = await tx
        .insert(agentes)
        .values({ orgId: org, deviceid: `${chave}-2024`, nome: chave, ativoId: ativo?.id })
        .returning({ id: agentes.id });
      const [linha] = await tx
        .insert(maquinasDasDistribuicoes)
        .values({
          orgId: org,
          distribuicaoId: distribuicao?.id ?? '',
          ativoId: ativo?.id ?? '',
          agenteId: agente?.id ?? '',
        })
        .returning({ id: maquinasDasDistribuicoes.id });
      maquinas[chave] = linha?.id ?? '';
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('o Deploy do agente', () => {
  it('Instalação concluída: do getConfig ao fim, com o arquivo montado das partes', async () => {
    const config = await pedir(`http://${host}${ENDERECO}`, {
      action: 'getConfig',
      machineid: 'recepcao-2024',
      task: { Deploy: '3.0' },
    });
    expect(config.statusCode, config.body).toBe(200);
    const remote = config.json().schedule[0].remote;
    expect(config.json()).toEqual({
      schedule: [{ task: 'Deploy', remote: `http://${host}/api${ENDERECO}` }],
    });

    const resposta = await pedir(remote, {
      action: 'getJobs',
      machineid: 'recepcao-2024',
      version: '3.0',
    });
    const { jobs, associatedFiles } = resposta.json();
    expect(jobs).toEqual([
      {
        uuid: maquinas.recepcao,
        checks: [],
        actions: [
          {
            cmd: {
              exec: 'msiexec /i "7z2301-x64.msi" /qn',
              retChecks: [{ type: 'okCode', values: [0, 3010] }],
              logLineLimit: 20,
            },
          },
        ],
        associatedFiles: [sha512(ARQUIVO)],
      },
    ]);
    const arquivo = associatedFiles[sha512(ARQUIVO)];
    expect(arquivo).toMatchObject({
      name: '7z2301-x64.msi',
      mirrors: [`${remote}/partes/`],
      p2p: 0,
      'p2p-retention-duration': 0,
      uncompress: 0,
    });
    expect(arquivo.multiparts).toHaveLength(2);
    expect((await maquina(maquinas.recepcao ?? ''))?.situacao).toBe('em-andamento');

    const juntas: Buffer[] = [];
    for (const parte of arquivo.multiparts as string[]) {
      const baixada = await api.app.inject({
        method: 'GET',
        url: new URL(`${arquivo.mirrors[0]}${parte[0]}/${parte.slice(0, 2)}/${parte}`).pathname,
        headers: { host },
      });
      expect(baixada.statusCode).toBe(200);
      expect(sha512(baixada.rawPayload)).toBe(parte);
      juntas.push(gunzipSync(baixada.rawPayload));
    }
    expect(sha512(Buffer.concat(juntas))).toBe(sha512(ARQUIVO));

    const passo = (args: Record<string, string | string[]>) =>
      pedir(remote, {
        action: 'setStatus',
        machineid: 'recepcao-2024',
        part: 'job',
        uuid: maquinas.recepcao ?? '',
        ...args,
      });
    await passo({ msg: 'job received' });
    await passo({ currentStep: 'checking', status: 'ok', msg: 'all checks are ok' });
    await passo({ currentStep: 'downloading', status: 'ok', msg: 'success' });
    await passo({ currentStep: 'prepare', status: 'ok', msg: 'success' });
    await passo({ actionnum: '0', msg: ['Instalado.', "exit status: `0'"] });
    await passo({ currentStep: 'processing', status: 'ok', msg: 'action #1 processing success' });
    expect((await passo({ status: 'ok', msg: 'job successfully completed' })).json()).toEqual({});

    const concluida = await maquina(maquinas.recepcao ?? '');
    expect(concluida).toMatchObject({ situacao: 'concluida', etapa: 'Executando' });
    expect(concluida?.terminadaEm).not.toBeNull();
    expect(concluida?.log).toEqual([
      'Agente: job received',
      'Conferindo: ok, all checks are ok',
      'Baixando: ok, success',
      'Preparando: ok, success',
      'Executando: Instalado.',
      "Executando: exit status: `0'",
      'Executando: ok, action #1 processing success',
      'Fim: ok, job successfully completed',
    ]);
    const outra = await pedir(remote, { action: 'getJobs', machineid: 'recepcao-2024' });
    expect(outra.json()).toEqual({});
  });

  it('Instalação que falhou: o status "ko" leva a "Falhou", com a etapa e a mensagem', async () => {
    await pedir(`http://${host}${ENDERECO}`, { action: 'getJobs', machineid: 'financeiro-2024' });
    await pedir(`http://${host}${ENDERECO}`, {
      action: 'setStatus',
      machineid: 'financeiro-2024',
      part: 'job',
      uuid: maquinas.financeiro ?? '',
      currentStep: 'processing',
      status: 'ko',
      actionnum: '0',
      msg: 'action #1 processing failure',
    });
    expect(await maquina(maquinas.financeiro ?? '')).toMatchObject({
      situacao: 'falhou',
      etapa: 'Executando',
      log: ['Executando: ko, action #1 processing failure'],
    });
  });

  it('o passo de outro agente é ignorado, e a parte de fora, o token e o pedido são recusados', async () => {
    await pedir(`http://${host}${ENDERECO}`, {
      action: 'setStatus',
      machineid: 'financeiro-2024',
      uuid: maquinas.recepcao ?? '',
      status: 'ko',
      msg: 'x',
    });
    expect(await maquina(maquinas.recepcao ?? '')).toMatchObject({
      situacao: 'concluida',
      log: expect.arrayContaining(['Fim: ok, job successfully completed']),
    });
    expect((await maquina(maquinas.recepcao ?? ''))?.log).toHaveLength(8);
    const fora = 'f'.repeat(128);
    expect(
      (
        await api.app.inject({
          method: 'GET',
          url: `${ENDERECO}/partes/f/ff/${fora}`,
          headers: { host },
        })
      ).statusCode,
    ).toBe(404);
    const semToken = await api.app.inject({
      method: 'GET',
      url: '/agentes/glpi/outro-token?action=getConfig&machineid=recepcao-2024',
      headers: { host },
    });
    expect(semToken.statusCode).toBe(403);
    const semMaquina = await api.app.inject({
      method: 'GET',
      url: `${ENDERECO}?action=getConfig`,
      headers: { host },
    });
    expect(semMaquina.statusCode).toBe(400);
  });
});
