// A pessoa da máquina nas telas do software (spec distribuicao-de-software, "Pessoa da máquina";
// change software-por-pacote, design, decisão 15): na distribuição aberta, na matriz por máquina e
// na busca do assistente, a pessoa responsável só aparece, e só acha a máquina, para a conta com o
// `pessoas.ver` no local de trabalho dela e com a pessoa não anonimizada, como na ficha do ativo.
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  pacotesDeSoftware,
  pessoas,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto, textoDeBusca } from '@grafite/domain';
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

const host = 'grafite.pessoa-da-maquina.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
let financeiro = '';
let distribuicao = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  financeiro = await criarLocal(api, org, { nome: 'Financeiro' });
  const rh = await criarLocal(api, org, { nome: 'RH' });
  const recrutamento = await criarLocal(api, org, { nome: 'Recrutamento', paiId: rh });
  const distribui = await criarPerfil(api, org, {
    nome: 'Distribui',
    permissoes: ['software.distribuir', 'ativos.ver'],
  });
  const verPessoas = await criarPerfil(api, org, { nome: 'Pessoas', permissoes: ['pessoas.ver'] });
  // A Ana vê as pessoas da organização; o Bruno não vê nenhuma; a Carla vê só as do RH e dos
  // locais de baixo dele.
  const contas: [string, string, string | null | undefined][] = [
    ['ana', 'Ana Souza', null],
    ['bruno', 'Bruno Costa', undefined],
    ['carla', 'Carla Dias', rh],
  ];
  let criadaPor = '';
  for (const [usuario, nome, pessoasEm] of contas) {
    const conta = await criarConta(api, org, { usuario, nome });
    criadaPor ||= conta.id;
    await atribuir(api, org, { perfilId: distribui, contaId: conta.id });
    if (pessoasEm !== undefined) {
      await atribuir(api, org, { perfilId: verPessoas, contaId: conta.id, localId: pessoasEm });
    }
    entradas[usuario] = await cliente.entrar(usuario);
  }
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
    const anonimizada = 'Pessoa anonimizada K7QX';
    // As três máquinas são do Financeiro; a Lia trabalha no Recrutamento, debaixo do RH.
    const [marina, outra, lia] = await tx
      .insert(pessoas)
      .values([
        {
          orgId: org,
          nome: 'Marina Teles',
          busca: textoDeBusca({ nome: 'Marina Teles', email: null, matricula: null }),
          localId: financeiro,
        },
        {
          orgId: org,
          nome: anonimizada,
          busca: textoDeBusca({ nome: anonimizada, email: null, matricula: null }),
          situacao: 'anonimizada',
          anonimizadaEm: new Date(),
        },
        {
          orgId: org,
          nome: 'Lia Moraes',
          busca: textoDeBusca({ nome: 'Lia Moraes', email: null, matricula: null }),
          localId: recrutamento,
        },
      ])
      .returning({ id: pessoas.id });
    const [pacote] = await tx
      .insert(pacotesDeSoftware)
      .values({
        orgId: org,
        nome: '7-Zip',
        nomeNormalizado: normalizarTexto('7-Zip'),
        nomeNoInventarioNormalizado: normalizarTexto('7-Zip'),
        versao: '24.08',
        comando: 'msiexec /i "7z2408-x64.msi" /qn',
      })
      .returning({ id: pacotesDeSoftware.id });
    const [nova] = await tx
      .insert(distribuicoes)
      .values({
        orgId: org,
        pacoteId: pacote?.id ?? '',
        criadaPor,
        criadaEm: new Date(),
        fuso: 'America/Sao_Paulo',
      })
      .returning({ id: distribuicoes.id });
    distribuicao = nova?.id ?? '';
    for (const [numero, responsavelId] of [
      ['17', marina?.id],
      ['18', outra?.id],
      ['19', lia?.id],
    ] as const) {
      const [ativo] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: normalizarTexto(`Estação ${numero} PC-FIN-${numero}`),
          nome: `Estação ${numero}`,
          patrimonio: `PC-FIN-${numero}`,
          localId: financeiro,
          responsavelId,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const [agente] = await tx
        .insert(agentes)
        .values({
          orgId: org,
          deviceid: `pc-fin-${numero}-2024`,
          nome: `pc-fin-${numero}`,
          ip: `10.9.0.${numero}`,
          ultimoContato: new Date(),
          ativoId: ativo?.id,
        })
        .returning({ id: agentes.id });
      await tx.insert(maquinasDasDistribuicoes).values({
        orgId: org,
        distribuicaoId: distribuicao,
        ativoId: ativo?.id ?? '',
        agenteId: agente?.id ?? '',
      });
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

/** A pessoa de cada máquina, pelo patrimônio. */
const porPatrimonio = (linhas: { patrimonio: string | null; pessoa: string | null }[]) =>
  Object.fromEntries(linhas.map(({ patrimonio, pessoa }) => [patrimonio, pessoa]));

async function daDistribuicao(usuario: string) {
  const r = await cliente.consultar(`/software/distribuicoes/${distribuicao}`, como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return porPatrimonio(
    r
      .json()
      .maquinasDaDistribuicao.map(
        (maquina: { ativo: { patrimonio: string | null }; pessoa: string | null }) => ({
          patrimonio: maquina.ativo.patrimonio,
          pessoa: maquina.pessoa,
        }),
      ),
  );
}

async function daMatriz(usuario: string) {
  const r = await cliente.consultar(`/software/matriz?local=${financeiro}`, como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return porPatrimonio(r.json().maquinas);
}

async function buscar(usuario: string, termo: string) {
  const r = await cliente.consultar(
    `/software/maquinas?busca=${encodeURIComponent(termo)}`,
    como(usuario),
  );
  expect(r.statusCode, r.body).toBe(200);
  return r.json().maquinas.map(({ patrimonio }: { patrimonio: string | null }) => patrimonio);
}

describe('a pessoa da máquina', () => {
  it('Com o pessoas.ver no local da pessoa: a distribuição, a matriz e a busca trazem a pessoa', async () => {
    const esperado = { 'PC-FIN-17': 'Marina Teles', 'PC-FIN-18': null, 'PC-FIN-19': 'Lia Moraes' };
    expect(await daDistribuicao('ana')).toEqual(esperado);
    expect(await daMatriz('ana')).toEqual(esperado);
    expect(await buscar('ana', 'marina')).toEqual(['PC-FIN-17']);
  });

  it('Com o pessoas.ver num ramo: vale o local da pessoa, com os de baixo, e não o da máquina', async () => {
    const esperado = { 'PC-FIN-17': null, 'PC-FIN-18': null, 'PC-FIN-19': 'Lia Moraes' };
    expect(await daDistribuicao('carla')).toEqual(esperado);
    expect(await daMatriz('carla')).toEqual(esperado);
    expect(await buscar('carla', 'moraes')).toEqual(['PC-FIN-19']);
    expect(await buscar('carla', 'marina')).toEqual([]);
  });

  it('Técnico sem acesso às pessoas: a máquina vem sem a pessoa, e a busca não a acha por ela', async () => {
    const esperado = { 'PC-FIN-17': null, 'PC-FIN-18': null, 'PC-FIN-19': null };
    expect(await daDistribuicao('bruno')).toEqual(esperado);
    expect(await daMatriz('bruno')).toEqual(esperado);
    expect(await buscar('bruno', 'marina')).toEqual([]);
    expect(await buscar('bruno', 'moraes')).toEqual([]);
    expect(await buscar('bruno', 'pc-fin-17')).toEqual(['PC-FIN-17']);
  });

  it('Pessoa anonimizada: nem quem tem o pessoas.ver acha a máquina por ela', async () => {
    expect(await buscar('ana', 'anonimizada')).toEqual([]);
    expect(await buscar('ana', 'pc-fin-18')).toEqual(['PC-FIN-18']);
  });
});
