// A matriz do software pela API (spec distribuicao-de-software, "Matriz do software"; change
// software-por-pacote, design, decisão 12): por máquina, os pacotes ativos frente às máquinas com o
// agente do local escolhido, com a versão, a situação, a pessoa, o sem contato, a distribuição que
// aguarda, instala ou falhou e a última de cada pacote; por local, "N de M" na versão-alvo, com cada
// máquina contada no próprio local; e a permissão pelos locais em que a conta distribui.
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  pacotesDeSoftware,
  pessoas,
  softwaresDosAtivos,
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

const host = 'grafite.matriz-do-software.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const locais: Record<string, string> = {};
const pacotes: Record<string, string> = {};
const maquinas: Record<string, string> = {};
let distribuicao = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

interface Maquina {
  chave: string;
  local: string;
  programas: [string, string][];
  agente?: false;
  semContato?: true;
  responsavel?: string;
}

const MAQUINAS: Maquina[] = [
  {
    chave: 'f1',
    local: 'financeiro',
    programas: [
      ['Google Chrome', '131.0.6778.86'],
      ['7-Zip 23.01 (x64)', '23.01'],
    ],
    responsavel: 'Marta Lima',
  },
  { chave: 'f2', local: 'financeiro', programas: [['Google Chrome', '128.0.6613.120']] },
  { chave: 'f3', local: 'financeiro', programas: [] },
  {
    chave: 'f4',
    local: 'financeiro',
    programas: [['Google Chrome', '130.0.6723.117']],
    semContato: true,
  },
  { chave: 'f5', local: 'financeiro', programas: [['Google Chrome', '131.0']], agente: false },
  { chave: 'c1', local: 'comercial', programas: [['Google Chrome', '131.0.6778.86']] },
  { chave: 'x1', local: 'filial', programas: [['Google Chrome', '129.0.6668.101']] },
];

type Celula = { pacoteId: string; ativoId: string; [campo: string]: unknown };
type CelulaDoLocal = { pacoteId: string; localId: string; naVersao: number; total: number };

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  locais.matriz = await criarLocal(api, org, { nome: 'Matriz', tipo: 'unidade' });
  locais.financeiro = await criarLocal(api, org, { nome: 'Financeiro', paiId: locais.matriz });
  locais.comercial = await criarLocal(api, org, { nome: 'Comercial', paiId: locais.matriz });
  locais.filial = await criarLocal(api, org, { nome: 'Filial', tipo: 'unidade' });
  const administra = await criarPerfil(api, org, {
    nome: 'Software',
    permissoes: ['software.administrar', 'ativos.ver'],
  });
  const distribui = await criarPerfil(api, org, {
    nome: 'Distribui',
    permissoes: ['software.distribuir', 'ativos.ver'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administra, contaId: ana.id });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: distribui, contaId: carla.id, localId: locais.matriz });
  for (const usuario of ['ana', 'carla']) entradas[usuario] = await cliente.entrar(usuario);
  for (const [nome, versao, nomeNoInventario] of [
    ['Google Chrome', '131', null],
    ['7-Zip', '24.08', '7-Zip'],
    ['SumatraPDF', '3.5', null],
  ] as const) {
    const r = await cliente.enviar('POST', '/software/pacotes', como('ana'), {
      nome,
      versao,
      nomeNoInventario,
      comando: 'setup.exe /S',
    });
    if (r.statusCode !== 201) throw new Error(r.body);
    pacotes[nome] = r.json().id;
  }
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.insert(pacotesDeSoftware).values({
      orgId: org,
      nome: 'Antigo',
      nomeNormalizado: 'antigo',
      nomeNoInventarioNormalizado: normalizarTexto('Google Chrome'),
      comando: 'x',
      situacao: 'inativo',
    });
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
      })
      .returning({ id: tiposDeAtivo.id });
    const agentesDasMaquinas: Record<string, string> = {};
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
          localId: locais[maquina.local] ?? null,
          responsavelId,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const ativoId = ativo?.id ?? '';
      maquinas[maquina.chave] = ativoId;
      if (maquina.agente !== false) {
        const [agente] = await tx
          .insert(agentes)
          .values({
            orgId: org,
            deviceid: `${maquina.chave}-2024`,
            nome: maquina.chave,
            ativoId,
            ultimoContato: new Date(
              maquina.semContato ? '2026-09-29T09:00:00.000Z' : '2026-10-02T09:00:00.000Z',
            ),
          })
          .returning({ id: agentes.id });
        agentesDasMaquinas[maquina.chave] = agente?.id ?? '';
      }
      for (const [nome, versao] of maquina.programas) {
        await tx.insert(softwaresDosAtivos).values({
          orgId: org,
          ativoId,
          nome,
          nomeNormalizado: normalizarTexto(nome),
          versao,
          inventariadoEm: new Date('2026-10-01T12:00:00Z'),
        });
      }
    }
    const [doChrome] = await tx
      .insert(distribuicoes)
      .values({
        orgId: org,
        pacoteId: pacotes['Google Chrome'] ?? '',
        criadaPor: ana.id,
        criadaEm: new Date('2026-10-02T12:02:00.000Z'),
        paraQuem: 'Financeiro',
      })
      .returning({ id: distribuicoes.id });
    distribuicao = doChrome?.id ?? '';
    for (const [chave, situacao, codigoDeSaida] of [
      ['f1', 'concluida', 0],
      ['f2', 'em-andamento', null],
      ['f3', 'falhou', 1603],
    ] as const) {
      await tx.insert(maquinasDasDistribuicoes).values({
        orgId: org,
        distribuicaoId: distribuicao,
        ativoId: maquinas[chave] ?? '',
        agenteId: agentesDasMaquinas[chave] ?? '',
        situacao,
        codigoDeSaida,
      });
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

const celula = (celulas: Celula[], pacote: string, chave: string) =>
  celulas.find(
    ({ pacoteId, ativoId }) => pacoteId === pacotes[pacote] && ativoId === maquinas[chave],
  );

describe('a matriz do software', () => {
  it('Por máquina: os pacotes ativos frente às máquinas com o agente do local', async () => {
    const r = await cliente.consultar(`/software/matriz?local=${locais.financeiro}`, como('ana'));
    expect(r.statusCode, r.body).toBe(200);
    const matriz = r.json();
    expect(matriz.por).toBe('maquina');
    expect(matriz.local).toMatchObject({ id: locais.financeiro, nome: 'Financeiro' });
    expect(matriz.pacotes.map(({ nome }: { nome: string }) => nome)).toEqual([
      '7-Zip',
      'Google Chrome',
      'SumatraPDF',
    ]);
    expect(matriz.maquinas.map(({ id }: { id: string }) => id)).toEqual(
      ['f1', 'f2', 'f3', 'f4'].map((chave) => maquinas[chave]),
    );
    expect(matriz.maquinas[0]).toMatchObject({ rotulo: 'Estação F1', pessoa: 'Marta Lima' });
    expect(matriz.maquinas[3]).toMatchObject({
      semContato: { dias: 3, texto: 'Sem contato · há 3 dias' },
    });
    const celulas = matriz.celulas as Celula[];
    expect(celulas).toHaveLength(12);
    expect(celula(celulas, 'Google Chrome', 'f1')).toMatchObject({
      situacao: 'na-versao',
      versao: '131.0.6778.86',
      distribuicao: null,
    });
    expect(celula(celulas, 'Google Chrome', 'f2')).toMatchObject({
      situacao: 'desatualizada',
      versao: '128.0.6613.120',
      distribuicao: {
        id: distribuicao,
        situacao: 'em-andamento',
        texto: 'Em andamento',
        codigo: null,
      },
    });
    expect(celula(celulas, 'Google Chrome', 'f3')).toMatchObject({
      situacao: 'sem-o-programa',
      versao: null,
      distribuicao: { situacao: 'falhou', texto: 'Falhou', codigo: 1603 },
    });
    expect(celula(celulas, '7-Zip', 'f1')).toMatchObject({
      situacao: 'desatualizada',
      versao: '23.01',
    });
    expect(matriz.ultimas).toEqual([
      {
        pacoteId: pacotes['Google Chrome'],
        distribuicaoId: distribuicao,
        criadaEm: '2026-10-02T12:02:00.000Z',
        criadaPor: 'Ana Souza',
      },
    ]);
  });

  it('Local sem nenhuma na versão-alvo: por local, "N de M", com cada máquina no próprio local', async () => {
    const r = await cliente.consultar('/software/matriz?por=local', como('ana'));
    expect(r.statusCode, r.body).toBe(200);
    const matriz = r.json();
    expect(matriz.por).toBe('local');
    // Na ordem da árvore: a Filial e, na Matriz, que não tem máquinas, o Comercial e o Financeiro.
    expect(matriz.locais).toEqual([
      expect.objectContaining({ id: locais.filial, nome: 'Filial', maquinas: 1 }),
      expect.objectContaining({ id: locais.comercial, nome: 'Comercial', maquinas: 1 }),
      expect.objectContaining({ id: locais.financeiro, nome: 'Financeiro', maquinas: 4 }),
    ]);
    const doLocal = (pacote: string, local: string) =>
      (matriz.celulas as CelulaDoLocal[]).find(
        ({ pacoteId, localId }) => pacoteId === pacotes[pacote] && localId === locais[local],
      );
    expect(doLocal('Google Chrome', 'financeiro')).toMatchObject({ naVersao: 1, total: 4 });
    expect(doLocal('Google Chrome', 'comercial')).toMatchObject({ naVersao: 1, total: 1 });
    expect(doLocal('Google Chrome', 'filial')).toMatchObject({ naVersao: 0, total: 1 });
    expect(doLocal('7-Zip', 'financeiro')).toMatchObject({ naVersao: 0, total: 4 });
  });

  it('só os locais em que a conta distribui', async () => {
    const porLocal = await cliente.consultar('/software/matriz?por=local', como('carla'));
    expect(porLocal.json().locais.map(({ id }: { id: string }) => id)).toEqual([
      locais.comercial,
      locais.financeiro,
    ]);
    expect(
      (await cliente.consultar(`/software/matriz?local=${locais.filial}`, como('carla')))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await cliente.consultar(
          '/software/matriz?local=0192f5a0-0000-7000-8000-000000000000',
          como('carla'),
        )
      ).statusCode,
    ).toBe(404);
    const semLocal = await cliente.consultar('/software/matriz', como('carla'));
    expect(semLocal.statusCode).toBe(400);
    expect(semLocal.json().campos).toEqual({ local: 'Escolha o local.' });
  });
});
