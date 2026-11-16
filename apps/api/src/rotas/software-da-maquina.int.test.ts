// O software na ficha da máquina pela API (spec inventario-pelo-agente, "Softwares na ficha do ativo";
// change software-por-pacote, design, decisão 13): os instalados do último inventário, para quem vê o
// ativo; e, para quem distribui no local dele, a comparação com a base na ordem "ação primeiro", a
// origem de cada programa, os mandados pelo Grafite e a relação de cada pacote ativo com a máquina;
// e o agente sem contato.
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  pacotesDeSoftware,
  softwaresDosAtivos,
  tiposDeAtivo,
} from '@grafite/db';
import { explicarOCodigoDeSaida, normalizarTexto } from '@grafite/domain';
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

const host = 'grafite.software-da-maquina.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const locais: Record<string, string> = {};
const pacotes: Record<string, string> = {};
const maquinas: Record<string, string> = {};
const daDistribuicao: Record<string, string> = {};
const naDistribuicao: Record<string, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

type Programa = [nome: string, versao: string, editor: string | null, doSistema: boolean];

const MAQUINAS: {
  chave: string;
  ultimoContato: string | null;
  inventariadoEm: string;
  programas: Programa[];
}[] = [
  {
    chave: 'f17',
    ultimoContato: '2026-10-02T09:00:00.000Z',
    inventariadoEm: '2026-10-01T12:00:00.000Z',
    programas: [
      ['Google Chrome', '129.0.6668.101', 'Google LLC', false],
      ['7-Zip 23.01 (x64)', '23.01', 'Igor Pavlov', false],
      ['VLC media player', '3.0.20', 'VideoLAN', false],
      ['SumatraPDF', '3.5', null, false],
      ['Agente de backup', '12.0', 'Backup Ltda', false],
      ['Calculadora Fiscal 2.1', '2.1', null, false],
      ['Microsoft Edge', '131.0.2903.70', 'Microsoft Corporation', true],
    ],
  },
  {
    chave: 'f18',
    ultimoContato: '2026-09-29T09:00:00.000Z',
    inventariadoEm: '2026-09-29T09:00:00.000Z',
    programas: [['Google Chrome', '130.0.6723.117', 'Google LLC', false]],
  },
  { chave: 'f19', ultimoContato: null, inventariadoEm: '', programas: [] },
];

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
    permissoes: ['software.distribuir'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Vê', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administra, contaId: ana.id });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: distribui, contaId: carla.id, localId: locais.comercial });
  await atribuir(api, org, { perfilId: ve, contaId: carla.id, localId: locais.matriz });
  const dani = await criarConta(api, org, { usuario: 'dani', nome: 'Daniela Reis' });
  await atribuir(api, org, { perfilId: ve, contaId: dani.id, localId: locais.financeiro });
  const edu = await criarConta(api, org, { usuario: 'edu', nome: 'Eduardo Prado' });
  await atribuir(api, org, { perfilId: ve, contaId: edu.id, localId: locais.filial });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Lima' });
  for (const usuario of ['ana', 'carla', 'dani', 'edu']) {
    entradas[usuario] = await cliente.entrar(usuario);
  }
  for (const [nome, versao, nomeNoInventario] of [
    ['Google Chrome', '131', null],
    ['7-Zip', '24.08', '7-Zip'],
    ['VLC', '3.0.21', 'VLC media player'],
    ['SumatraPDF', '3.5', null],
    ['Agente de backup', '12.0', null],
    ['Chromium de testes', '130', null],
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
    // O pacote inativo não entra na comparação nem na lista para instalar.
    await tx.insert(pacotesDeSoftware).values({
      orgId: org,
      nome: 'Calculadora Fiscal',
      nomeNormalizado: normalizarTexto('Calculadora Fiscal'),
      nomeNoInventarioNormalizado: normalizarTexto('Calculadora Fiscal'),
      versao: '3.0',
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
      const [ativo] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: '',
          nome: `Estação ${maquina.chave.toUpperCase()}`,
          localId: locais.financeiro ?? null,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const ativoId = ativo?.id ?? '';
      maquinas[maquina.chave] = ativoId;
      if (maquina.ultimoContato) {
        const [agente] = await tx
          .insert(agentes)
          .values({
            orgId: org,
            deviceid: `${maquina.chave}-2024`,
            nome: maquina.chave,
            ativoId,
            ultimoContato: new Date(maquina.ultimoContato),
          })
          .returning({ id: agentes.id });
        agentesDasMaquinas[maquina.chave] = agente?.id ?? '';
      }
      for (const [nome, versao, editor, doSistema] of maquina.programas) {
        await tx.insert(softwaresDosAtivos).values({
          orgId: org,
          ativoId,
          nome,
          nomeNormalizado: normalizarTexto(nome),
          versao,
          editor,
          doSistema,
          inventariadoEm: new Date(maquina.inventariadoEm),
        });
      }
    }
    for (const [chave, pacote, criadaPor, criadaEm, paraQuem, nasMaquinas] of [
      [
        'sumatra',
        'SumatraPDF',
        ana.id,
        '2026-09-02T13:21:00.000Z',
        'Estação F17',
        [['f17', 'concluida', 0, '2026-09-02T13:30:00.000Z']],
      ],
      [
        'backup',
        'Agente de backup',
        bruno.id,
        '2026-09-19T22:03:00.000Z',
        'Financeiro',
        [['f17', 'concluida', 0, '2026-09-19T22:10:00.000Z']],
      ],
      [
        'chrome',
        'Google Chrome',
        carla.id,
        '2026-10-02T11:02:00.000Z',
        'Financeiro',
        [
          ['f17', 'falhou', 1603, '2026-10-02T11:13:00.000Z'],
          ['f18', 'aguardando', null, null],
        ],
      ],
    ] as const) {
      const [distribuicao] = await tx
        .insert(distribuicoes)
        .values({
          orgId: org,
          pacoteId: pacotes[pacote] ?? '',
          criadaPor,
          criadaEm: new Date(criadaEm),
          paraQuem,
        })
        .returning({ id: distribuicoes.id });
      daDistribuicao[chave] = distribuicao?.id ?? '';
      for (const [maquina, situacao, codigoDeSaida, terminadaEm] of nasMaquinas) {
        const [linha] = await tx
          .insert(maquinasDasDistribuicoes)
          .values({
            orgId: org,
            distribuicaoId: distribuicao?.id ?? '',
            ativoId: maquinas[maquina] ?? '',
            agenteId: agentesDasMaquinas[maquina] ?? '',
            situacao,
            codigoDeSaida,
            terminadaEm: terminadaEm ? new Date(terminadaEm) : null,
          })
          .returning({ id: maquinasDasDistribuicoes.id });
        naDistribuicao[`${chave}:${maquina}`] = linha?.id ?? '';
      }
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

const daMaquina = (chave: string, usuario: string) =>
  cliente.consultar(`/ativos/${maquinas[chave]}/software`, como(usuario));

const nomes = (lista: { nome: string }[]) => lista.map(({ nome }) => nome);

describe('o software na ficha da máquina', () => {
  it('Ação primeiro: os instalados frente à base, com a origem de cada um', async () => {
    const r = await daMaquina('f17', 'ana');
    expect(r.statusCode, r.body).toBe(200);
    const software = r.json();
    expect(software.inventariadoEm).toBe('2026-10-01T12:00:00.000Z');
    expect(software.agente).toEqual({
      ultimoContato: '2026-10-02T09:00:00.000Z',
      semContato: null,
    });
    expect(nomes(software.instalados)).toEqual([
      '7-Zip 23.01 (x64)',
      'Google Chrome',
      'VLC media player',
      'Agente de backup',
      'SumatraPDF',
      'Calculadora Fiscal 2.1',
      'Microsoft Edge',
    ]);
    const [zip, chrome, vlc, backup, sumatra, calculadora, edge] = software.instalados;
    expect(chrome).toEqual({
      nome: 'Google Chrome',
      versao: '129.0.6668.101',
      editor: 'Google LLC',
      instaladoEm: null,
      doSistema: false,
      base: {
        comparacao: 'ha-na-base',
        texto: 'Há a 131 na base',
        pacote: { id: pacotes['Google Chrome'], nome: 'Google Chrome', versao: '131' },
        origem: null,
      },
    });
    expect(zip.base).toMatchObject({ comparacao: 'ha-na-base', texto: 'Há a 24.08 na base' });
    expect(vlc.base).toMatchObject({ comparacao: 'ha-na-base', texto: 'Há a 3.0.21 na base' });
    expect(backup.base).toMatchObject({
      comparacao: 'na-versao',
      texto: 'Na versão da base',
      origem: { distribuicaoId: daDistribuicao.backup, por: 'Bruno Lima' },
    });
    expect(sumatra.base).toMatchObject({
      comparacao: 'na-versao',
      origem: { distribuicaoId: daDistribuicao.sumatra, por: 'Ana Souza' },
    });
    expect(calculadora.base).toEqual({
      comparacao: 'fora-da-base',
      texto: 'Não está na base',
      pacote: null,
      origem: null,
    });
    expect(edge).toMatchObject({
      doSistema: true,
      base: {
        comparacao: 'do-windows',
        texto: 'Do Windows, não se distribui',
        pacote: null,
        origem: null,
      },
    });
  });

  it('os mandados pelo Grafite e a relação de cada pacote ativo com a máquina', async () => {
    const { distribuir } = (await daMaquina('f17', 'ana')).json();
    expect(distribuir.mandados).toEqual([
      {
        distribuicaoId: daDistribuicao.chrome,
        maquinaId: naDistribuicao['chrome:f17'],
        pacote: {
          id: pacotes['Google Chrome'],
          nome: 'Google Chrome',
          versao: '131',
          situacao: 'ativo',
        },
        paraQuem: 'Financeiro',
        situacao: expect.objectContaining({ chave: 'falhou', texto: 'Falhou' }),
        codigo: { numero: 1603, explicacao: explicarOCodigoDeSaida(1603) },
        etapa: null,
        criadaEm: '2026-10-02T11:02:00.000Z',
        criadaPor: 'Carla Dias',
        enviadaEm: null,
        terminadaEm: '2026-10-02T11:13:00.000Z',
        aguardaNoutra: null,
      },
      expect.objectContaining({
        distribuicaoId: daDistribuicao.backup,
        situacao: expect.objectContaining({ chave: 'concluida' }),
        criadaPor: 'Bruno Lima',
        terminadaEm: '2026-09-19T22:10:00.000Z',
      }),
      expect.objectContaining({
        distribuicaoId: daDistribuicao.sumatra,
        paraQuem: 'Estação F17',
        criadaPor: 'Ana Souza',
      }),
    ]);
    expect(
      distribuir.pacotes.map(
        ({
          pacote,
          situacao,
          versao,
          naFila,
        }: {
          pacote: { nome: string };
          situacao: string;
          versao: string | null;
          naFila: boolean;
        }) => [pacote.nome, situacao, versao, naFila],
      ),
    ).toEqual([
      ['7-Zip', 'desatualizada', '23.01', false],
      ['Agente de backup', 'na-versao', '12.0', false],
      ['Chromium de testes', 'sem-o-programa', null, false],
      // A F17 falhou no Chrome e não aguarda noutra distribuição: o pacote não está na fila dela.
      ['Google Chrome', 'desatualizada', '129.0.6668.101', false],
      ['SumatraPDF', 'na-versao', '3.5', false],
      ['VLC', 'desatualizada', '3.0.20', false],
    ]);
    expect(distribuir.pacotes[0].pacote).toMatchObject({
      id: pacotes['7-Zip'],
      versao: '24.08',
      situacao: 'ativo',
    });
  });

  it('o agente sem contato e o pedido que espera a máquina voltar', async () => {
    const software = (await daMaquina('f18', 'ana')).json();
    expect(software.agente).toEqual({
      ultimoContato: '2026-09-29T09:00:00.000Z',
      semContato: { dias: 3, texto: 'Sem contato · há 3 dias' },
    });
    expect(software.inventariadoEm).toBe('2026-09-29T09:00:00.000Z');
    expect(software.distribuir.mandados).toEqual([
      expect.objectContaining({
        distribuicaoId: daDistribuicao.chrome,
        maquinaId: naDistribuicao['chrome:f18'],
        situacao: expect.objectContaining({ chave: 'aguardando' }),
        criadaPor: 'Carla Dias',
        terminadaEm: null,
        aguardaNoutra: null,
      }),
    ]);
    // O Chrome aguarda o agente da F18: a camada o mostra já na fila, e os outros pacotes, não.
    expect(
      software.distribuir.pacotes
        .filter(({ naFila }: { naFila: boolean }) => naFila)
        .map(({ pacote }: { pacote: { nome: string } }) => pacote.nome),
    ).toEqual(['Google Chrome']);
  });

  it('sem nenhum software nem agente', async () => {
    const software = (await daMaquina('f19', 'ana')).json();
    expect(software).toMatchObject({
      instalados: [],
      inventariadoEm: null,
      agente: null,
      distribuir: { mandados: [] },
    });
    expect(
      software.distribuir.pacotes.every(
        ({ situacao }: { situacao: string }) => situacao === 'sem-o-programa',
      ),
    ).toBe(true);
  });

  it('a permissão de cada parte', async () => {
    // Quem só vê o ativo recebe os instalados pelo nome, sem a base e sem os mandados.
    const soVe = await daMaquina('f17', 'dani');
    expect(soVe.statusCode, soVe.body).toBe(200);
    const visto = soVe.json();
    expect(nomes(visto.instalados)).toEqual([
      '7-Zip 23.01 (x64)',
      'Agente de backup',
      'Calculadora Fiscal 2.1',
      'Google Chrome',
      'Microsoft Edge',
      'SumatraPDF',
      'VLC media player',
    ]);
    expect(visto.instalados.every(({ base }: { base: unknown }) => base === null)).toBe(true);
    expect(visto.distribuir).toBeNull();
    expect(visto.agente).toMatchObject({ semContato: null });
    // Quem distribui em outro local, também.
    const deOutroLocal = (await daMaquina('f17', 'carla')).json();
    expect(deOutroLocal.distribuir).toBeNull();
    expect(deOutroLocal.instalados[0].base).toBeNull();
    // Quem não vê o ativo no local dele não recebe nada.
    expect((await daMaquina('f17', 'edu')).statusCode).toBe(403);
    expect(
      (
        await cliente.consultar(
          '/ativos/0192f5a0-0000-7000-8000-000000000000/software',
          como('ana'),
        )
      ).statusCode,
    ).toBe(404);
  });
});
