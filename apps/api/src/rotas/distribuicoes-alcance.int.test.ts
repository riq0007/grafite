// O alcance da distribuição (spec distribuicao-de-software, "Histórico das distribuições", cenário
// "Máquinas fora do alcance"; change software-por-pacote, design, decisão 16): a lista, a
// distribuição aberta, as distribuições da ficha do pacote e a última da base mostram e contam só
// as máquinas dos locais em que a conta tem `software.distribuir`, com as de fora no
// `foraDoAlcance`. A distribuição sem nenhuma máquina no alcance fica fora da lista e dá 404, e a
// de antes da change, sem o "Para quem", diz o total das máquinas dela.
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  pacotesDeSoftware,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
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

const host = 'grafite.alcance-da-distribuicao.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
let pacote = '';
/** A de antes da change, sem o "Para quem"; a da Sede; e a só do RH, a mais nova. */
const ids = { antiga: '', sede: '', soDoRh: '' };

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

type Situacao = (typeof maquinasDasDistribuicoes.$inferInsert)['situacao'];

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const sede = await criarLocal(api, org, { nome: 'Sede', tipo: 'unidade' });
  const financeiro = await criarLocal(api, org, { nome: 'Financeiro', paiId: sede });
  const rh = await criarLocal(api, org, { nome: 'RH', paiId: sede });
  const administra = await criarPerfil(api, org, {
    nome: 'Software',
    permissoes: ['software.administrar', 'ativos.ver'],
  });
  const distribui = await criarPerfil(api, org, {
    nome: 'Distribui',
    permissoes: ['software.distribuir', 'ativos.ver'],
  });
  // A Ana distribui na organização inteira; o Bruno, só no Financeiro.
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administra, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: distribui, contaId: bruno.id, localId: financeiro });
  for (const usuario of ['ana', 'bruno']) entradas[usuario] = await cliente.entrar(usuario);

  await naOrganizacao(api.banco, org, async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
      })
      .returning({ id: tiposDeAtivo.id });
    const [criado] = await tx
      .insert(pacotesDeSoftware)
      .values({
        orgId: org,
        nome: 'Google Chrome',
        nomeNormalizado: normalizarTexto('Google Chrome'),
        nomeNoInventarioNormalizado: normalizarTexto('Google Chrome'),
        versao: '131',
        comando: 'msiexec /i "googlechromestandaloneenterprise64.msi" /qn',
      })
      .returning({ id: pacotesDeSoftware.id });
    pacote = criado?.id ?? '';
    let numero = 0;
    const maquina = async (localId: string) => {
      numero += 1;
      const codigo = String(numero).padStart(2, '0');
      const [ativo] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: normalizarTexto(`Estação ${codigo} PC-${codigo}`),
          nome: `Estação ${codigo}`,
          patrimonio: `PC-${codigo}`,
          localId,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const [agente] = await tx
        .insert(agentes)
        .values({
          orgId: org,
          deviceid: `pc-${codigo}-2024`,
          nome: `pc-${codigo}`,
          ip: `10.16.0.${numero}`,
          ultimoContato: new Date(),
          ativoId: ativo?.id,
        })
        .returning({ id: agentes.id });
      return { ativoId: ativo?.id ?? '', agenteId: agente?.id ?? '' };
    };
    const distribuir = async (
      paraQuem: string | null,
      minutosAtras: number,
      maquinas: [string, Situacao][],
    ) => {
      const [nova] = await tx
        .insert(distribuicoes)
        .values({
          orgId: org,
          pacoteId: pacote,
          criadaPor: ana.id,
          criadaEm: new Date(Date.now() - minutosAtras * 60_000),
          paraQuem,
        })
        .returning({ id: distribuicoes.id });
      for (const [localId, situacao] of maquinas) {
        await tx.insert(maquinasDasDistribuicoes).values({
          orgId: org,
          distribuicaoId: nova?.id ?? '',
          ...(await maquina(localId)),
          situacao,
          codigoDeSaida: situacao === 'falhou' ? 1603 : null,
        });
      }
      return nova?.id ?? '';
    };
    ids.antiga = await distribuir(null, 300, [
      [financeiro, 'concluida'],
      [rh, 'concluida'],
      [rh, 'concluida'],
    ]);
    ids.sede = await distribuir('Sede', 120, [
      [financeiro, 'concluida'],
      [financeiro, 'concluida'],
      [financeiro, 'falhou'],
      [rh, 'concluida'],
      [rh, 'aguardando'],
    ]);
    ids.soDoRh = await distribuir('RH', 10, [[rh, 'aguardando']]);
  });
});

afterAll(async () => {
  await api?.fechar();
});

async function consultar(caminho: string, usuario: string) {
  const r = await cliente.consultar(caminho, como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}

/** O resumo de cada distribuição da lista, pela id. */
async function daLista(usuario: string) {
  const { distribuicoes: lista } = await consultar('/software/distribuicoes', usuario);
  return lista.map(
    ({ id, paraQuem, maquinas, foraDoAlcance, progresso }: Record<string, unknown>) => ({
      id,
      paraQuem,
      maquinas,
      foraDoAlcance,
      progresso,
    }),
  );
}

describe('o alcance da distribuição', () => {
  it('A lista: só as distribuições com alguma máquina no alcance, contadas no alcance', async () => {
    expect(await daLista('bruno')).toEqual([
      {
        id: ids.sede,
        paraQuem: 'Sede',
        maquinas: 3,
        foraDoAlcance: 2,
        progresso: '2 de 3 concluídas, 1 falhou',
      },
      // A de antes da change diz o total das máquinas dela, também as de fora do alcance.
      {
        id: ids.antiga,
        paraQuem: '3 máquinas',
        maquinas: 1,
        foraDoAlcance: 2,
        progresso: '1 de 1 concluída',
      },
    ]);
    expect(await daLista('ana')).toEqual([
      {
        id: ids.soDoRh,
        paraQuem: 'RH',
        maquinas: 1,
        foraDoAlcance: 0,
        progresso: '0 de 1 concluída',
      },
      {
        id: ids.sede,
        paraQuem: 'Sede',
        maquinas: 5,
        foraDoAlcance: 0,
        progresso: '3 de 5 concluídas, 1 falhou',
      },
      {
        id: ids.antiga,
        paraQuem: '3 máquinas',
        maquinas: 3,
        foraDoAlcance: 0,
        progresso: '3 de 3 concluídas',
      },
    ]);
  });

  it('Máquinas fora do alcance: a distribuição aberta mostra e conta só as do alcance', async () => {
    const ficha = await consultar(`/software/distribuicoes/${ids.sede}`, 'bruno');
    expect(ficha).toMatchObject({ maquinas: 3, foraDoAlcance: 2 });
    expect(
      ficha.maquinasDaDistribuicao.map(
        ({ ativo }: { ativo: { patrimonio: string } }) => ativo.patrimonio,
      ),
    ).toEqual(['PC-04', 'PC-05', 'PC-06']);
    const daAna = await consultar(`/software/distribuicoes/${ids.sede}`, 'ana');
    expect(daAna).toMatchObject({ maquinas: 5, foraDoAlcance: 0 });
    expect(daAna.maquinasDaDistribuicao).toHaveLength(5);
  });

  it('A distribuição sem nenhuma máquina no alcance dá 404, como a que não existe', async () => {
    const r = await cliente.consultar(`/software/distribuicoes/${ids.soDoRh}`, como('bruno'));
    expect(r.statusCode).toBe(404);
  });

  it('A ficha do pacote e a base: só as distribuições com máquinas no alcance, contadas nele', async () => {
    const doBruno = await consultar(`/software/pacotes/${pacote}`, 'bruno');
    expect(
      doBruno.distribuicoes.map(
        ({ id, paraQuem, maquinas, resultado }: Record<string, unknown>) => ({
          id,
          paraQuem,
          maquinas,
          resultado,
        }),
      ),
    ).toEqual([
      {
        id: ids.sede,
        paraQuem: 'Sede',
        maquinas: 3,
        resultado: {
          concluidas: 2,
          emAndamento: 0,
          aguardando: 0,
          falharam: 1,
          tiradas: 0,
          semContato: 0,
        },
      },
      {
        id: ids.antiga,
        paraQuem: '3 máquinas',
        maquinas: 1,
        resultado: {
          concluidas: 1,
          emAndamento: 0,
          aguardando: 0,
          falharam: 0,
          tiradas: 0,
          semContato: 0,
        },
      },
    ]);
    const daAna = await consultar(`/software/pacotes/${pacote}`, 'ana');
    expect(daAna.distribuicoes.map(({ id }: { id: string }) => id)).toEqual([
      ids.soDoRh,
      ids.sede,
      ids.antiga,
    ]);
    const ultima = async (usuario: string) =>
      (await consultar('/software/pacotes', usuario)).pacotes.find(
        ({ id }: { id: string }) => id === pacote,
      ).ultimaDistribuicao.id;
    expect(await ultima('bruno')).toBe(ids.sede);
    expect(await ultima('ana')).toBe(ids.soDoRh);
  });
});
