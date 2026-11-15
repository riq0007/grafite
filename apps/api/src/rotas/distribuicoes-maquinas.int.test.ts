// As máquinas da distribuição pela API (spec distribuicao-de-software, "Histórico das
// distribuições" e "Tentar de novo e tirar da fila"; change software-por-pacote, design, decisões 6,
// 8a, 9 e 11): a ficha com o código e a explicação, o sem contato, o chamado sem resposta, até
// quando o agente volta e a pessoa; o "Tentar de novo", que acorda o agente; o "Tirar da fila"; o
// progresso com as tiradas à parte; e a permissão pelo local da máquina.
import {
  agentes,
  ativos,
  auditoria,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  pacotesDeSoftware,
  pessoas,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto, textoDeBusca } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { tarefasDaApi } from '../fila/tarefas.ts';
import { TAREFA_DOS_AGENDADOS } from '../software/acordar.ts';

const host = 'grafite.maquinas-da-distribuicao.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const maquinas: Record<string, string> = {};
const chamados: string[] = [];
let distribuicao = '';
let outra = '';
let pacote = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-10-02T12:00:00.000Z');

interface Maquina {
  chave: string;
  local: 'jundiai' | 'campinas';
  ip: string;
  situacao: 'aguardando' | 'em-andamento' | 'concluida' | 'falhou';
  codigo?: number;
  contato?: Date;
  chamada?: { em: Date; respondeu: boolean };
  voltaAte?: Date;
  responsavel?: string;
}

const MAQUINAS: Maquina[] = [
  { chave: 'j1', local: 'jundiai', ip: '10.7.0.1', situacao: 'falhou', codigo: 1603 },
  {
    chave: 'j2',
    local: 'jundiai',
    ip: '10.7.0.2',
    situacao: 'aguardando',
    contato: new Date(AGORA.getTime() - 3 * DIA - 60_000),
  },
  {
    chave: 'j3',
    local: 'jundiai',
    ip: '10.7.0.3',
    situacao: 'aguardando',
    chamada: { em: new Date('2026-10-02T11:00:00.000Z'), respondeu: false },
    voltaAte: new Date('2026-10-02T12:30:00.000Z'),
  },
  {
    chave: 'j4',
    local: 'jundiai',
    ip: '10.7.0.4',
    situacao: 'em-andamento',
    responsavel: 'Marta Lima',
  },
  { chave: 'j5', local: 'jundiai', ip: '10.7.0.5', situacao: 'concluida', codigo: 0 },
  { chave: 'c1', local: 'campinas', ip: '10.7.0.6', situacao: 'falhou', codigo: 1618 },
];

async function esperar(condicao: () => Promise<boolean>) {
  for (let vez = 0; vez < 100; vez++) {
    if (await condicao()) return true;
    await new Promise((pronto) => setTimeout(pronto, 100));
  }
  return false;
}

const naMaquina = (usuario: string, acao: string, chave: string, de = distribuicao) =>
  cliente.enviar(
    'POST',
    `/software/distribuicoes/${de}/maquinas/${maquinas[chave] ?? chave}/${acao}`,
    como(usuario),
  );

const fichaDa = async () => {
  const r = await cliente.consultar(`/software/distribuicoes/${distribuicao}`, como('ana'));
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as {
    progresso: string;
    maquinasDaDistribuicao: { id: string; [campo: string]: unknown }[];
  };
};
const naFicha = async (chave: string) =>
  (await fichaDa()).maquinasDaDistribuicao.find(({ id }) => id === maquinas[chave]);

beforeAll(async () => {
  api = await abrirApi({
    acordarAgente: async (ip) => {
      chamados.push(ip);
      return true;
    },
    tarefas: (contexto) =>
      tarefasDaApi(contexto).filter(({ nome }) => nome !== TAREFA_DOS_AGENDADOS),
    intervaloDaFila: 0.5,
  });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const locais = {
    jundiai: await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' }),
    campinas: await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' }),
  };
  const tudo = await criarPerfil(api, org, {
    nome: 'Software',
    permissoes: ['software.administrar', 'ativos.ver'],
  });
  const distribui = await criarPerfil(api, org, {
    nome: 'Distribui',
    permissoes: ['software.distribuir', 'ativos.ver'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: distribui, contaId: bruno.id, localId: locais.campinas });
  for (const usuario of ['ana', 'bruno']) entradas[usuario] = await cliente.entrar(usuario);
  await naOrg(async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
      })
      .returning({ id: tiposDeAtivo.id });
    const [doPacote] = await tx
      .insert(pacotesDeSoftware)
      .values({
        orgId: org,
        nome: '7-Zip 24.08',
        nomeNormalizado: normalizarTexto('7-Zip 24.08'),
        nomeNoInventarioNormalizado: normalizarTexto('7-Zip'),
        versao: '24.08',
        comando: 'msiexec /i "7z2408-x64.msi" /qn',
      })
      .returning({ id: pacotesDeSoftware.id });
    pacote = doPacote?.id ?? '';
    const criar = async () => {
      const [linha] = await tx
        .insert(distribuicoes)
        .values({
          orgId: org,
          pacoteId: pacote,
          criadaPor: ana.id,
          criadaEm: new Date('2026-10-02T11:30:00.000Z'),
          fuso: 'America/Sao_Paulo',
        })
        .returning({ id: distribuicoes.id });
      return linha?.id ?? '';
    };
    distribuicao = await criar();
    outra = await criar();
    for (const maquina of MAQUINAS) {
      let responsavelId: string | null = null;
      if (maquina.responsavel) {
        const [pessoa] = await tx
          .insert(pessoas)
          .values({
            orgId: org,
            nome: maquina.responsavel,
            busca: textoDeBusca({ nome: maquina.responsavel, email: null, matricula: null }),
          })
          .returning({ id: pessoas.id });
        responsavelId = pessoa?.id ?? null;
      }
      const [ativo] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: '',
          nome: `Estação ${maquina.chave.toUpperCase()}`,
          patrimonio: `PAT-${maquina.chave.toUpperCase()}`,
          localId: locais[maquina.local],
          responsavelId,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const [agente] = await tx
        .insert(agentes)
        .values({
          orgId: org,
          deviceid: `${maquina.chave}-2024`,
          nome: maquina.chave,
          ip: maquina.ip,
          ultimoContato: maquina.contato ?? new Date('2026-10-02T09:00:00.000Z'),
          voltaAte: maquina.voltaAte ?? null,
          ativoId: ativo?.id,
        })
        .returning({ id: agentes.id });
      const terminou = maquina.situacao === 'falhou' || maquina.situacao === 'concluida';
      const [linha] = await tx
        .insert(maquinasDasDistribuicoes)
        .values({
          orgId: org,
          distribuicaoId: distribuicao,
          ativoId: ativo?.id ?? '',
          agenteId: agente?.id ?? '',
          situacao: maquina.situacao,
          etapa: maquina.situacao === 'aguardando' ? null : 'Executando',
          codigoDeSaida: maquina.codigo ?? null,
          log:
            maquina.situacao === 'falhou' ? ['Executando: ko, action #1 processing failure'] : [],
          enviadaEm:
            maquina.situacao === 'aguardando' ? null : new Date('2026-10-02T11:40:00.000Z'),
          terminadaEm: terminou ? new Date('2026-10-02T11:45:00.000Z') : null,
          chamadaEm: maquina.chamada?.em ?? null,
          chamadaRespondeu: maquina.chamada?.respondeu ?? null,
        })
        .returning({ id: maquinasDasDistribuicoes.id });
      maquinas[maquina.chave] = linha?.id ?? '';
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('as máquinas da distribuição', () => {
  it('O que precisa de você: o código com a explicação, o sem contato, o chamado sem resposta, a volta do agente e a pessoa', async () => {
    const ficha = await fichaDa();
    expect(ficha.progresso).toBe('1 de 6 concluídas, 2 falharam');
    expect(await naFicha('j1')).toMatchObject({
      situacao: { chave: 'falhou', texto: 'Falhou' },
      codigo: { numero: 1603, explicacao: expect.stringContaining('Erro fatal') },
      semContato: null,
      chamada: null,
    });
    expect(await naFicha('j2')).toMatchObject({
      semContato: { dias: 3, texto: 'Sem contato · há 3 dias' },
      codigo: null,
    });
    expect(await naFicha('j3')).toMatchObject({
      semContato: null,
      chamada: { em: '2026-10-02T11:00:00.000Z', respondeu: false },
      voltaAte: '2026-10-02T12:30:00.000Z',
    });
    expect(await naFicha('j4')).toMatchObject({ pessoa: 'Marta Lima', etapa: 'Executando' });
    expect(await naFicha('j5')).toMatchObject({ codigo: { numero: 0, explicacao: null } });
    const doPacote = await cliente.consultar(`/software/pacotes/${pacote}`, como('ana'));
    expect(
      doPacote.json().distribuicoes.find(({ id }: { id: string }) => id === distribuicao)
        ?.resultado,
    ).toEqual({
      concluidas: 1,
      emAndamento: 1,
      aguardando: 2,
      falharam: 2,
      tiradas: 0,
      semContato: 1,
    });
  });

  it('Máquina que falhou de novo na fila: o tentar de novo volta a aguardar e acorda o agente', async () => {
    const r = await naMaquina('ana', 'tentar-de-novo', 'j1');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      id: maquinas.j1,
      situacao: { chave: 'aguardando', texto: 'Aguardando o agente' },
      etapa: null,
      codigo: null,
      terminadaEm: null,
      log: ['Executando: ko, action #1 processing failure', 'Tentar de novo, por Ana Souza'],
    });
    const [registro] = await naOrg((tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'distribuicao.maquina-tentada-de-novo')),
    );
    expect(registro?.dados).toMatchObject({
      pacote: '7-Zip 24.08',
      maquina: 'PAT-J1',
      codigoDeSaida: 1603,
    });
    expect(await esperar(async () => chamados.includes('10.7.0.1'))).toBe(true);
    expect(
      await esperar(
        async () =>
          ((await naFicha('j1'))?.log as string[] | undefined)?.includes('Chamado às 09:00') ===
          true,
      ),
    ).toBe(true);
  });

  it('Tirar da fila: a que aguarda passa a "Tirada da fila", com o fim, e o progresso conta à parte', async () => {
    const r = await naMaquina('ana', 'tirar-da-fila', 'j2');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: { chave: 'tirada', texto: 'Tirada da fila' },
      terminadaEm: AGORA.toISOString(),
      semContato: null,
    });
    const [registro] = await naOrg((tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'distribuicao.maquina-tirada-da-fila')),
    );
    expect(registro?.dados).toMatchObject({ pacote: '7-Zip 24.08', maquina: 'PAT-J2' });
    expect((await fichaDa()).progresso).toBe('1 de 6 concluídas, 1 falhou, 1 tirada da fila');
  });

  it('o tentar de novo só na que falhou, e o tirar só a que aguarda', async () => {
    const naoFalhou = await naMaquina('ana', 'tentar-de-novo', 'j5');
    expect(naoFalhou.statusCode).toBe(409);
    expect(naoFalhou.json().detail).toBe('Só a máquina que falhou pode ser tentada de novo.');
    const naoAguarda = await naMaquina('ana', 'tirar-da-fila', 'j4');
    expect(naoAguarda.statusCode).toBe(409);
    expect(naoAguarda.json().detail).toBe('Só a máquina que aguarda o agente sai da fila.');
    expect((await naMaquina('ana', 'tirar-da-fila', 'j3', outra)).statusCode).toBe(404);
    expect(
      (await naMaquina('ana', 'tirar-da-fila', '0192f5a0-0000-7000-8000-000000000000')).statusCode,
    ).toBe(404);
  });

  it('a permissão vem do local da máquina', async () => {
    expect((await naMaquina('bruno', 'tirar-da-fila', 'j3')).statusCode).toBe(403);
    const r = await naMaquina('bruno', 'tentar-de-novo', 'c1');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().log.at(-1)).toBe('Tentar de novo, por Bruno Costa');
  });
});
