// A base e a ficha do pacote frente ao inventário pela API (spec distribuicao-de-software, "Pacote
// frente ao inventário", "Tela da base" e "Ficha do pacote"; change software-por-pacote, design,
// decisão 2): as contas de cada pacote nas máquinas da conta (os ativos ativos com o agente ligado,
// nos locais em que ela distribui), com o casamento pelo nome no inventário e a versão mais alta da
// máquina; a ordem de mais desatualizadas primeiro; a última distribuição; e, na ficha, as barras das
// versões e as distribuições do pacote.
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  softwaresDosAtivos,
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

const host = 'grafite.base-de-software.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const pacotes: Record<string, string> = {};
const distribuicoesDoChrome: string[] = [];

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

/** Os programas de cada máquina, pelo nome e pela versão, como o inventário os grava. */
const MAQUINAS = [
  {
    chave: 'c1',
    local: 'financeiro',
    agente: true,
    programas: [
      ['Google Chrome', '131.0.6778.86'],
      ['7-Zip 23.01 (x64)', '23.01'],
      ['Microsoft Office Professional Plus 2019', '16.0.10417'],
    ],
  },
  {
    chave: 'c2',
    local: 'financeiro',
    agente: true,
    programas: [
      ['Google Chrome', '129.0.6668.101'],
      ['Google Chrome', '131.0.6778.69'],
    ],
  },
  {
    chave: 'c3',
    local: 'diretoria',
    agente: true,
    programas: [
      ['Google Chrome', '129.0.6668.101'],
      ['7-Zip 24.08 (x64)', '24.08'],
    ],
  },
  { chave: 'c4', local: 'diretoria', agente: true, programas: [['Google Chrome Beta', '132.0']] },
  { chave: 'c5', local: 'filial', agente: true, programas: [['Google Chrome', '128.0.6613.120']] },
  {
    chave: 'c6',
    local: 'financeiro',
    agente: true,
    inativo: true,
    programas: [['Google Chrome', '120.0']],
  },
  { chave: 'c7', local: 'financeiro', agente: false, programas: [['Google Chrome', '120.0']] },
] as const;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const matriz = await criarLocal(api, org, { nome: 'Matriz', tipo: 'unidade' });
  const locais: Record<string, string> = {
    financeiro: await criarLocal(api, org, { nome: 'Financeiro', paiId: matriz }),
    diretoria: await criarLocal(api, org, { nome: 'Diretoria', paiId: matriz }),
    filial: await criarLocal(api, org, { nome: 'Filial', tipo: 'unidade' }),
  };
  const administra = await criarPerfil(api, org, {
    nome: 'Software',
    permissoes: ['software.administrar', 'software.distribuir'],
  });
  const distribui = await criarPerfil(api, org, {
    nome: 'Distribui',
    permissoes: ['software.distribuir'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administra, contaId: ana.id });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: distribui, contaId: carla.id, localId: matriz });
  for (const usuario of ['ana', 'carla']) entradas[usuario] = await cliente.entrar(usuario);

  for (const [nome, versao, nomeNoInventario] of [
    ['Google Chrome', '131', null],
    ['7-Zip', '24.08', '7-Zip'],
    ['Configuração do Office', null, 'Microsoft Office Professional Plus 2019'],
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
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
      })
      .returning({ id: tiposDeAtivo.id });
    const agentesDasMaquinas: Record<string, { ativoId: string; agenteId: string }> = {};
    for (const [posicao, maquina] of MAQUINAS.entries()) {
      const [ativo] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: normalizarTexto(`Computador ${posicao + 1}`),
          nome: `Computador ${posicao + 1}`,
          localId: locais[maquina.local] ?? null,
          situacao: 'inativo' in maquina ? 'inativo' : 'ativo',
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const ativoId = ativo?.id ?? '';
      if (maquina.agente) {
        const [agente] = await tx
          .insert(agentes)
          .values({ orgId: org, deviceid: `${maquina.chave}-2024`, nome: maquina.chave, ativoId })
          .returning({ id: agentes.id });
        agentesDasMaquinas[maquina.chave] = { ativoId, agenteId: agente?.id ?? '' };
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
    // Duas distribuições do Chrome: a de antes desta change, sem o "Para quem", e a mais nova.
    for (const [criadaEm, paraQuem, situacoes] of [
      ['2026-09-14T13:00:00Z', null, { c3: 'concluida', c4: 'concluida' }],
      ['2026-10-01T12:02:00Z', 'Financeiro', { c1: 'concluida', c2: 'em-andamento', c3: 'falhou' }],
    ] as const) {
      const [distribuicao] = await tx
        .insert(distribuicoes)
        .values({
          orgId: org,
          pacoteId: pacotes['Google Chrome'] ?? '',
          criadaPor: ana.id,
          criadaEm: new Date(criadaEm),
          paraQuem,
        })
        .returning({ id: distribuicoes.id });
      distribuicoesDoChrome.unshift(distribuicao?.id ?? '');
      for (const [chave, situacao] of Object.entries(situacoes)) {
        const maquina = agentesDasMaquinas[chave];
        await tx.insert(maquinasDasDistribuicoes).values({
          orgId: org,
          distribuicaoId: distribuicao?.id ?? '',
          ativoId: maquina?.ativoId ?? '',
          agenteId: maquina?.agenteId ?? '',
          situacao,
        });
      }
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

interface ContasNaResposta {
  nome: string;
  contas: Record<string, number | null>;
}

const contasDe = (pacotesNaResposta: ContasNaResposta[]) =>
  pacotesNaResposta.map(({ nome, contas }) => [nome, contas]);

describe('a base frente ao inventário', () => {
  it('Painel do que precisa de atenção: as contas nas máquinas da conta, com as mais desatualizadas primeiro', async () => {
    const r = await cliente.consultar('/software/pacotes', como('ana'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().maquinas).toBe(5);
    expect(contasDe(r.json().pacotes)).toEqual([
      ['Google Chrome', { maquinas: 5, instalado: 4, naVersao: 2, desatualizadas: 2, sem: 1 }],
      ['7-Zip', { maquinas: 5, instalado: 2, naVersao: 1, desatualizadas: 1, sem: 3 }],
      [
        'Configuração do Office',
        { maquinas: 5, instalado: 1, naVersao: null, desatualizadas: null, sem: 4 },
      ],
      ['SumatraPDF', { maquinas: 5, instalado: 0, naVersao: 0, desatualizadas: 0, sem: 5 }],
    ]);
  });

  it('as máquinas fora dos locais da conta não contam, e o empate vai pelo nome', async () => {
    const r = await cliente.consultar('/software/pacotes', como('carla'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().maquinas).toBe(4);
    expect(contasDe(r.json().pacotes)).toEqual([
      ['7-Zip', { maquinas: 4, instalado: 2, naVersao: 1, desatualizadas: 1, sem: 2 }],
      ['Google Chrome', { maquinas: 4, instalado: 3, naVersao: 2, desatualizadas: 1, sem: 1 }],
      [
        'Configuração do Office',
        { maquinas: 4, instalado: 1, naVersao: null, desatualizadas: null, sem: 3 },
      ],
      ['SumatraPDF', { maquinas: 4, instalado: 0, naVersao: 0, desatualizadas: 0, sem: 4 }],
    ]);
  });

  it('a última distribuição de cada pacote, com o "Para quem"', async () => {
    const r = await cliente.consultar('/software/pacotes', como('ana'));
    const porNome = Object.fromEntries(
      r.json().pacotes.map((pacote: { nome: string }) => [pacote.nome, pacote]),
    );
    expect(porNome['Google Chrome'].ultimaDistribuicao).toEqual({
      id: distribuicoesDoChrome[0],
      criadaEm: '2026-10-01T12:02:00.000Z',
      paraQuem: 'Financeiro',
    });
    expect(porNome.SumatraPDF.ultimaDistribuicao).toBeNull();
  });
});

describe('a ficha do pacote', () => {
  it('As contas fecham: os quatro números, as barras das versões e as distribuições', async () => {
    const r = await cliente.consultar(`/software/pacotes/${pacotes['Google Chrome']}`, como('ana'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      pacote: { nome: 'Google Chrome', versao: '131' },
      partes: 0,
      contas: { maquinas: 5, instalado: 4, naVersao: 2, desatualizadas: 2, sem: 1 },
      versoes: [
        { versao: '131', estado: 'alvo', quantas: 2 },
        { versao: '129', estado: 'abaixo', quantas: 1 },
        { versao: '128', estado: 'abaixo', quantas: 1 },
      ],
      permite: { administrar: true },
    });
    expect(r.json().distribuicoes).toEqual([
      {
        id: distribuicoesDoChrome[0],
        criadaEm: '2026-10-01T12:02:00.000Z',
        paraQuem: 'Financeiro',
        maquinas: 3,
        resultado: {
          concluidas: 1,
          emAndamento: 1,
          aguardando: 0,
          falharam: 1,
          tiradas: 0,
          semContato: 0,
        },
      },
      {
        id: distribuicoesDoChrome[1],
        criadaEm: '2026-09-14T13:00:00.000Z',
        paraQuem: '2 máquinas',
        maquinas: 2,
        resultado: {
          concluidas: 2,
          emAndamento: 0,
          aguardando: 0,
          falharam: 0,
          tiradas: 0,
          semContato: 0,
        },
      },
    ]);
  });

  it('na conta de um local, as barras só com as máquinas dela', async () => {
    const r = await cliente.consultar(
      `/software/pacotes/${pacotes['Google Chrome']}`,
      como('carla'),
    );
    expect(r.json()).toMatchObject({
      contas: { maquinas: 4, instalado: 3, naVersao: 2, desatualizadas: 1, sem: 1 },
      versoes: [
        { versao: '131', estado: 'alvo', quantas: 2 },
        { versao: '129', estado: 'abaixo', quantas: 1 },
      ],
      permite: { administrar: false },
    });
  });

  it('Pacote sem versão: as barras sem o estado, e a versão inteira', async () => {
    const r = await cliente.consultar(
      `/software/pacotes/${pacotes['Configuração do Office']}`,
      como('ana'),
    );
    expect(r.json()).toMatchObject({
      contas: { instalado: 1, naVersao: null, desatualizadas: null, sem: 4 },
      versoes: [{ versao: '16.0.10417', estado: null, quantas: 1 }],
      distribuicoes: [],
    });
  });

  it('o pacote de outra organização, ou que não existe, não é encontrado', async () => {
    const r = await cliente.consultar(
      '/software/pacotes/0199a6e0-0000-7000-8000-0000000000ff',
      como('ana'),
    );
    expect(r.statusCode).toBe(404);
  });
});
