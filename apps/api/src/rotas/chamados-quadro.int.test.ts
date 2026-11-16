// O quadro dos chamados (spec chamados, "Carga de cada pessoa"; spec modulo-chamados, "Início dos
// chamados" e "Quem está com o quê"; change chamados-da-ti, tarefa 4.9): a triagem, as pessoas da TI
// pelo nome, as colunas de quem não atende mais depois delas e os resolvidos hoje, só com os
// chamados que a conta que olha vê, no dia do fuso dela.
import { chamados, contas, horarioDaTi, naOrganizacao, tiposDeChamado } from '@grafite/db';
import { HORARIO_DA_TI_PADRAO, prazoEmMinutos } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  criarRelogio,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { criarTiposDeFabrica } from '../chamados/fabrica.ts';

const host = 'grafite.chamados-quadro.local';
const ATOR = { tipo: 'sistema', descricao: 'teste do quadro dos chamados' } as const;
/** A sexta-feira, 2 de outubro de 2026, às 11:00 em São Paulo. */
const AGORA = new Date('2026-10-02T14:00:00.000Z');
const SAO_PAULO = 'America/Sao_Paulo';
const ONZE_HORAS = 11 * 60 * 60 * 1000;

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const contasDe: Record<string, string> = {};
const ids: Record<string, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const conta = (usuario: string) => contasDe[usuario] ?? '';
const id = (chave: string) => ids[chave] ?? '';

const quadro = (usuario: string, consulta = `fuso=${SAO_PAULO}`) =>
  cliente.consultar(`/chamados/quadro?${consulta}`, como(usuario));

type LocalDoTeste = 'jundiai' | 'campinas' | 'financeiro';

interface ChamadoDoQuadro {
  numero: number;
  /** O local, os locais do chamado de mais de um ou, sem local, nulo. */
  local: LocalDoTeste | LocalDoTeste[] | null;
  situacao: 'triagem' | 'em-atendimento' | 'aguardando' | 'resolvido';
  /** Quem atende, ou quem atendeu e resolveu. */
  com?: string;
  abertoEm: string;
  resolvidoEm?: string;
}

/** Os chamados gravados direto, com a situação, quem atende, os momentos e o local. */
const incluirChamados = (lista: ChamadoDoQuadro[]) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.insert(chamados).values(
      lista.map((chamado) => {
        const abertoEm = new Date(chamado.abertoEm);
        const contando = chamado.situacao === 'triagem' || chamado.situacao === 'em-atendimento';
        return {
          orgId: org,
          numero: chamado.numero,
          tipoId: id('outro'),
          titulo: `Chamado ${chamado.numero}`,
          tituloNormalizado: `chamado ${chamado.numero}`,
          pessoaId: id('marina'),
          origem: 'ti' as const,
          abertoPor: conta('ana'),
          abertoEm,
          formulario: {},
          locais: chamado.local === null ? [] : [chamado.local].flat().map(id),
          semLocal: chamado.local === null,
          situacao: chamado.situacao,
          responsavelId: chamado.com ? conta(chamado.com) : null,
          responsavelDesde: chamado.com ? abertoEm : null,
          prazo: {
            ...prazoEmMinutos(
              {
                modo: 'horario',
                resposta: { valor: 1, unidade: 'h' },
                resolucao: { valor: 8, unidade: 'h' },
              },
              HORARIO_DA_TI_PADRAO,
            ),
          },
          relogioDesde: contando ? abertoEm : null,
          primeiraRespostaEm: abertoEm,
          resolvidoEm: chamado.resolvidoEm ? new Date(chamado.resolvidoEm) : null,
          resolvidoPor: chamado.resolvidoEm && chamado.com ? conta(chamado.com) : null,
        };
      }),
    ),
  );

const antigo = (numero: number, abertoEm: string) => ({ numero, abertoEm });

/** Onde a conta atende: a organização inteira ou as raízes dos ramos. */
const atende = (...locais: string[]) => ({
  organizacao: false,
  locais: locais.map(id).sort(),
});
const NA_ORGANIZACAO = { organizacao: true, locais: [] };

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(AGORA) });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await naOrganizacao(api.banco, org, (tx) =>
    criarTiposDeFabrica(tx, { ator: ATOR, momento: api.relogio.agora() }),
  );
  const [outro] = await naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ id: tiposDeChamado.id })
      .from(tiposDeChamado)
      .where(eq(tiposDeChamado.nome, 'Outro')),
  );
  ids.outro = outro?.id ?? '';
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  ids.financeiro = await criarLocal(api, org, { nome: 'Financeiro', paiId: id('jundiai') });
  ids.marina = await criarPessoa(api, org, { nome: 'Marina Lopes', localId: id('jundiai') });

  // A carga cheia da TI é de 3 chamados.
  await naOrganizacao(api.banco, org, (tx) =>
    tx.insert(horarioDaTi).values({
      orgId: org,
      dias: [1, 2, 3, 4, 5],
      inicio: 480,
      fim: 1080,
      fuso: SAO_PAULO,
      cargaCheia: 3,
    }),
  );

  // Ana atende a organização inteira; Bruno, Campinas; Diego, Jundiaí e Campinas; Fábio, Jundiaí,
  // com um chamado só, do Financeiro, que fica dentro de Jundiaí; Renato, só Campinas, e só vê os de Jundiaí, com um chamado de lá que ficou
  // com ele; Gil atendia Jundiaí, e a conta dele foi desativada com um chamado aberto. Carla só vê
  // os chamados; Hugo não tem mais nenhuma permissão dos chamados, e resolveu um hoje; Lívia só
  // configura.
  cliente = clienteDaApi(api, host);
  const atendeOsChamados = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Vê os chamados', permissoes: ['chamados.ver'] });
  const configura = await criarPerfil(api, org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const nomes = {
    ana: 'Ana Souza',
    bruno: 'Bruno Costa',
    carla: 'Carla Dias',
    diego: 'Diego Ramos',
    fabio: 'Fábio Lima',
    gil: 'Gil Rocha',
    hugo: 'Hugo Matos',
    livia: 'Lívia Prates',
    renato: 'Renato Alves',
  } as const;
  for (const [usuario, nome] of Object.entries(nomes)) {
    contasDe[usuario] = (await criarConta(api, org, { usuario, nome })).id;
  }
  await atribuir(api, org, { perfilId: atendeOsChamados, contaId: conta('ana') });
  for (const [usuario, local] of [
    ['bruno', 'campinas'],
    ['diego', 'jundiai'],
    ['diego', 'campinas'],
    ['fabio', 'jundiai'],
    ['renato', 'campinas'],
    ['gil', 'jundiai'],
  ] as const) {
    await atribuir(api, org, {
      perfilId: atendeOsChamados,
      contaId: conta(usuario),
      localId: id(local),
    });
  }
  await atribuir(api, org, { perfilId: ve, contaId: conta('carla') });
  await atribuir(api, org, { perfilId: ve, contaId: conta('renato'), localId: id('jundiai') });
  await atribuir(api, org, { perfilId: configura, contaId: conta('livia') });
  for (const usuario of ['ana', 'bruno', 'carla', 'fabio', 'livia']) {
    entradas[usuario] = await cliente.entrar(usuario);
  }

  await incluirChamados([
    // A triagem: um de Jundiaí, um de Campinas e um sem local.
    { numero: 1038, local: 'jundiai', situacao: 'triagem', abertoEm: '2026-10-02T10:10:00Z' },
    { numero: 1040, local: 'campinas', situacao: 'triagem', abertoEm: '2026-10-02T10:40:00Z' },
    { numero: 1042, local: null, situacao: 'triagem', abertoEm: '2026-10-02T10:55:00Z' },
    // Os abertos de cada um, também os que aguardam o colaborador.
    {
      numero: 1041,
      local: 'jundiai',
      situacao: 'em-atendimento',
      com: 'ana',
      abertoEm: '2026-10-01T21:00:00Z',
    },
    {
      numero: 1043,
      local: 'campinas',
      situacao: 'aguardando',
      com: 'ana',
      abertoEm: '2026-10-02T12:00:00Z',
    },
    {
      numero: 1044,
      local: 'campinas',
      situacao: 'em-atendimento',
      com: 'bruno',
      abertoEm: '2026-10-02T11:30:00Z',
    },
    {
      numero: 1031,
      local: 'jundiai',
      situacao: 'em-atendimento',
      com: 'diego',
      abertoEm: '2026-10-01T13:00:00Z',
    },
    {
      numero: 1032,
      local: 'jundiai',
      situacao: 'aguardando',
      com: 'diego',
      abertoEm: '2026-10-01T15:00:00Z',
    },
    {
      numero: 1034,
      local: 'campinas',
      situacao: 'aguardando',
      com: 'diego',
      abertoEm: '2026-10-02T11:00:00Z',
    },
    {
      numero: 1037,
      local: 'campinas',
      situacao: 'em-atendimento',
      com: 'diego',
      abertoEm: '2026-10-02T12:00:00Z',
    },
    {
      numero: 1033,
      local: 'jundiai',
      situacao: 'em-atendimento',
      com: 'renato',
      abertoEm: '2026-10-01T18:00:00Z',
    },
    {
      numero: 1036,
      local: 'campinas',
      situacao: 'em-atendimento',
      com: 'renato',
      abertoEm: '2026-10-02T10:00:00Z',
    },
    {
      numero: 1030,
      local: 'jundiai',
      situacao: 'em-atendimento',
      com: 'gil',
      abertoEm: '2026-10-01T12:00:00Z',
    },
    // O #1045, do Financeiro, com Fábio, que atende Jundiaí; e o #1046, de Jundiaí e Campinas,
    // com Diego, que atende os dois.
    {
      numero: 1045,
      local: 'financeiro',
      situacao: 'em-atendimento',
      com: 'fabio',
      abertoEm: '2026-10-02T13:00:00Z',
    },
    {
      numero: 1046,
      local: ['jundiai', 'campinas'],
      situacao: 'em-atendimento',
      com: 'diego',
      abertoEm: '2026-10-02T09:00:00Z',
    },
    // Os resolvidos: hoje, por Ana, Bruno, Renato, Gil e Hugo; o #1029 às 23:00 de ontem em São
    // Paulo, que já é hoje em UTC; e o #1025, há duas semanas.
    {
      numero: 1035,
      local: 'jundiai',
      situacao: 'resolvido',
      com: 'ana',
      abertoEm: '2026-10-02T11:00:00Z',
      resolvidoEm: '2026-10-02T13:30:00Z',
    },
    {
      numero: 1039,
      local: 'campinas',
      situacao: 'resolvido',
      com: 'bruno',
      abertoEm: '2026-10-02T10:30:00Z',
      resolvidoEm: '2026-10-02T12:00:00Z',
    },
    {
      numero: 1026,
      local: 'jundiai',
      situacao: 'resolvido',
      com: 'renato',
      abertoEm: '2026-10-01T11:00:00Z',
      resolvidoEm: '2026-10-02T13:10:00Z',
    },
    {
      numero: 1027,
      local: 'jundiai',
      situacao: 'resolvido',
      com: 'gil',
      abertoEm: '2026-10-01T11:30:00Z',
      resolvidoEm: '2026-10-02T12:30:00Z',
    },
    {
      numero: 1028,
      local: 'jundiai',
      situacao: 'resolvido',
      com: 'hugo',
      abertoEm: '2026-10-01T10:00:00Z',
      resolvidoEm: '2026-10-02T13:00:00Z',
    },
    {
      numero: 1029,
      local: 'jundiai',
      situacao: 'resolvido',
      com: 'ana',
      abertoEm: '2026-10-01T20:00:00Z',
      resolvidoEm: '2026-10-02T02:00:00Z',
    },
    {
      numero: 1025,
      local: 'jundiai',
      situacao: 'resolvido',
      com: 'ana',
      abertoEm: '2026-09-18T15:00:00Z',
      resolvidoEm: '2026-09-20T15:00:00Z',
    },
  ]);

  // Gil foi desativado com o #1030 aberto.
  await naOrganizacao(api.banco, org, (tx) =>
    tx
      .update(contas)
      .set({ situacao: 'inativa' })
      .where(eq(contas.id, conta('gil'))),
  );
});

describe('o quadro', () => {
  it('quem vê a organização inteira: a triagem, as pessoas da TI e quem não atende mais', async () => {
    const r = await quadro('ana');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      triagem: {
        abertos: [1038, 1040, 1042],
        maisAntigo: antigo(1038, '2026-10-02T10:10:00.000Z'),
      },
      colunas: [
        // As pessoas da TI pelo nome, com a barra da carga cheia de 3.
        {
          conta: conta('ana'),
          nome: 'Ana Souza',
          naoAtendeMais: false,
          abertos: [1041, 1043],
          maisAntigo: antigo(1041, '2026-10-01T21:00:00.000Z'),
          pedacos: { total: 3, cheios: 2 },
          resolvidosHoje: [1035],
          atende: NA_ORGANIZACAO,
        },
        {
          conta: conta('bruno'),
          nome: 'Bruno Costa',
          naoAtendeMais: false,
          abertos: [1044],
          maisAntigo: antigo(1044, '2026-10-02T11:30:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [1039],
          atende: atende('campinas'),
        },
        {
          // Cinco abertos na carga cheia de 3: a barra fica cheia.
          conta: conta('diego'),
          nome: 'Diego Ramos',
          naoAtendeMais: false,
          abertos: [1031, 1032, 1034, 1037, 1046],
          maisAntigo: antigo(1031, '2026-10-01T13:00:00.000Z'),
          pedacos: { total: 3, cheios: 3 },
          resolvidosHoje: [],
          atende: atende('jundiai', 'campinas'),
        },
        {
          // O #1045, do Financeiro, é de quem atende Jundiaí; onde ele atende continua só a raiz.
          conta: conta('fabio'),
          nome: 'Fábio Lima',
          naoAtendeMais: false,
          abertos: [1045],
          maisAntigo: antigo(1045, '2026-10-02T13:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [],
          atende: atende('jundiai'),
        },
        {
          // O #1026, de Jundiaí, que Renato resolveu, fica na coluna de pessoa da TI dele.
          conta: conta('renato'),
          nome: 'Renato Alves',
          naoAtendeMais: false,
          abertos: [1036],
          maisAntigo: antigo(1036, '2026-10-02T10:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [1026],
          atende: atende('campinas'),
        },
        // Depois, quem não atende mais, pelo nome: Gil, desativado, com o que resolveu hoje, e o
        // #1033, de Jundiaí, que Renato vê e não atende.
        {
          conta: conta('gil'),
          nome: 'Gil Rocha',
          naoAtendeMais: true,
          abertos: [1030],
          maisAntigo: antigo(1030, '2026-10-01T12:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [1027],
          atende: { organizacao: false, locais: [] },
        },
        {
          conta: conta('renato'),
          nome: 'Renato Alves',
          naoAtendeMais: true,
          abertos: [1033],
          maisAntigo: antigo(1033, '2026-10-01T18:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [],
          atende: atende('campinas'),
        },
      ],
      // O de Hugo, que não tem coluna, conta só no total; o #1029 foi ontem em São Paulo.
      resolvidosHoje: [1026, 1027, 1028, 1035, 1039],
      contandoSoOsLocaisQueVe: false,
    });
  });

  it('quem vê um local só conta só os chamados dele, com o aviso', async () => {
    const r = await quadro('bruno');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      triagem: {
        abertos: [1040],
        maisAntigo: antigo(1040, '2026-10-02T10:40:00.000Z'),
      },
      // As mesmas pessoas da TI, com os chamados de Campinas; sem as colunas de quem não atende
      // mais, que só têm chamados de Jundiaí.
      colunas: [
        {
          conta: conta('ana'),
          nome: 'Ana Souza',
          naoAtendeMais: false,
          abertos: [1043],
          maisAntigo: antigo(1043, '2026-10-02T12:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [],
          atende: NA_ORGANIZACAO,
        },
        {
          conta: conta('bruno'),
          nome: 'Bruno Costa',
          naoAtendeMais: false,
          abertos: [1044],
          maisAntigo: antigo(1044, '2026-10-02T11:30:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [1039],
          atende: atende('campinas'),
        },
        {
          conta: conta('diego'),
          nome: 'Diego Ramos',
          naoAtendeMais: false,
          // O #1046, de Jundiaí e Campinas, entra: basta um dos locais que Bruno vê.
          abertos: [1034, 1037, 1046],
          maisAntigo: antigo(1046, '2026-10-02T09:00:00.000Z'),
          pedacos: { total: 3, cheios: 3 },
          resolvidosHoje: [],
          atende: atende('jundiai', 'campinas'),
        },
        {
          // Sem chamado de Campinas: a coluna fica, com 0 abertos.
          conta: conta('fabio'),
          nome: 'Fábio Lima',
          naoAtendeMais: false,
          abertos: [],
          maisAntigo: null,
          pedacos: { total: 3, cheios: 0 },
          resolvidosHoje: [],
          atende: atende('jundiai'),
        },
        {
          conta: conta('renato'),
          nome: 'Renato Alves',
          naoAtendeMais: false,
          abertos: [1036],
          maisAntigo: antigo(1036, '2026-10-02T10:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [],
          atende: atende('campinas'),
        },
      ],
      resolvidosHoje: [1039],
      contandoSoOsLocaisQueVe: true,
    });
  });

  it('quem vê um local vê também os chamados dos locais de dentro dele', async () => {
    // Fábio atende Jundiaí: vê o #1045, do Financeiro, e o #1046, de Jundiaí e Campinas.
    const r = await quadro('fabio');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      triagem: {
        abertos: [1038],
        maisAntigo: antigo(1038, '2026-10-02T10:10:00.000Z'),
      },
      colunas: [
        {
          conta: conta('ana'),
          nome: 'Ana Souza',
          naoAtendeMais: false,
          abertos: [1041],
          maisAntigo: antigo(1041, '2026-10-01T21:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [1035],
          atende: NA_ORGANIZACAO,
        },
        {
          conta: conta('bruno'),
          nome: 'Bruno Costa',
          naoAtendeMais: false,
          abertos: [],
          maisAntigo: null,
          pedacos: { total: 3, cheios: 0 },
          resolvidosHoje: [],
          atende: atende('campinas'),
        },
        {
          conta: conta('diego'),
          nome: 'Diego Ramos',
          naoAtendeMais: false,
          abertos: [1031, 1032, 1046],
          maisAntigo: antigo(1031, '2026-10-01T13:00:00.000Z'),
          pedacos: { total: 3, cheios: 3 },
          resolvidosHoje: [],
          atende: atende('jundiai', 'campinas'),
        },
        {
          conta: conta('fabio'),
          nome: 'Fábio Lima',
          naoAtendeMais: false,
          abertos: [1045],
          maisAntigo: antigo(1045, '2026-10-02T13:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [],
          atende: atende('jundiai'),
        },
        {
          conta: conta('renato'),
          nome: 'Renato Alves',
          naoAtendeMais: false,
          abertos: [],
          maisAntigo: null,
          pedacos: { total: 3, cheios: 0 },
          resolvidosHoje: [1026],
          atende: atende('campinas'),
        },
        {
          conta: conta('gil'),
          nome: 'Gil Rocha',
          naoAtendeMais: true,
          abertos: [1030],
          maisAntigo: antigo(1030, '2026-10-01T12:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [1027],
          atende: { organizacao: false, locais: [] },
        },
        {
          conta: conta('renato'),
          nome: 'Renato Alves',
          naoAtendeMais: true,
          abertos: [1033],
          maisAntigo: antigo(1033, '2026-10-01T18:00:00.000Z'),
          pedacos: { total: 3, cheios: 1 },
          resolvidosHoje: [],
          atende: atende('campinas'),
        },
      ],
      resolvidosHoje: [1026, 1027, 1028, 1035],
      contandoSoOsLocaisQueVe: true,
    });
  });

  it('o hoje é o do fuso de quem olha', async () => {
    // Em UTC, o #1029, resolvido às 02:00, já é de hoje.
    const r = await quadro('ana', 'fuso=UTC');
    expect(r.statusCode, r.body).toBe(200);
    const corpo = r.json();
    expect(corpo.resolvidosHoje).toEqual([1026, 1027, 1028, 1029, 1035, 1039]);
    expect(corpo.colunas[0]).toMatchObject({ nome: 'Ana Souza', resolvidosHoje: [1029, 1035] });
  });

  it('quem só vê os chamados também lê o quadro, sem coluna própria', async () => {
    const daAna = await quadro('ana');
    const daCarla = await quadro('carla');
    expect(daCarla.statusCode, daCarla.body).toBe(200);
    expect(daCarla.json()).toEqual(daAna.json());
  });

  it('às 22:00 em São Paulo, os resolvidos de hoje ainda são os do dia de lá', async () => {
    // Já é dia 3 em UTC; a entrada é nova, no relógio adiantado.
    api.relogio.avancar(ONZE_HORAS);
    try {
      const entrada = await cliente.entrar('carla');
      const emSaoPaulo = await cliente.consultar(`/chamados/quadro?fuso=${SAO_PAULO}`, entrada);
      expect(emSaoPaulo.statusCode, emSaoPaulo.body).toBe(200);
      expect(emSaoPaulo.json().resolvidosHoje).toEqual([1026, 1027, 1028, 1035, 1039]);
      const emUtc = await cliente.consultar('/chamados/quadro?fuso=UTC', entrada);
      expect(emUtc.json().resolvidosHoje).toEqual([]);
    } finally {
      api.relogio.avancar(-ONZE_HORAS);
    }
  });
});

describe('as recusas do quadro', () => {
  it('o fuso que falta e o desconhecido', async () => {
    const semFuso = await quadro('ana', '');
    expect(semFuso.statusCode).toBe(400);
    expect(semFuso.json()).toMatchObject({
      type: 'urn:grafite:problema:dados-invalidos',
      campos: { fuso: 'Fuso horário desconhecido.' },
    });
    const desconhecido = await quadro('ana', 'fuso=America/Jundiai');
    expect(desconhecido.statusCode).toBe(400);
    expect(desconhecido.json()).toMatchObject({ campos: { fuso: 'Fuso horário desconhecido.' } });
  });

  it('quem não vê os chamados não lê o quadro', async () => {
    const r = await quadro('livia');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:sem-permissao' });
  });

  it('com o módulo desligado, o quadro responde que ele está desligado', async () => {
    await desligarModulos(api, org, ['chamados']);
    const r = await quadro('ana');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:modulo-desligado' });
  });
});
