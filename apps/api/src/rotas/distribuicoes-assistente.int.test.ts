// O assistente da distribuição pela API (spec distribuicao-de-software, "Distribuição às máquinas",
// "Quando instalar", "Acordar os agentes" e "Assistente da distribuição"; change software-por-pacote,
// design, decisões 7, 8a, 9 e 10). A prévia: a união dos locais, das visões, dos ativos escolhidos e
// da lista colada, sem as tiradas da lista; a classe de cada máquina, na ordem pulada, na fila e vai
// instalar, com o sem contato pelo prazo da organização e a outra instalação em andamento; a
// permissão, com a visão, a busca e a lista no escopo do `ativos.ver` e as máquinas fora dos locais
// do `software.distribuir` de fora em silêncio. As contagens da árvore e das visões, com a visão que
// deixou de valer sem a contagem e recusada pelo nome; a busca das máquinas; e a criação, com a
// mesma conta, o quando, o dia marcado como o instante com o fuso, a auditoria e o acordar na fila.
import {
  agentes,
  ativos,
  auditoria,
  cadastroDosAgentes,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  pessoas,
  softwaresDosAtivos,
  tiposDeAtivo,
  visoes,
} from '@grafite/db';
import { normalizarTexto, textoDeBusca } from '@grafite/domain';
import { desc, eq } from 'drizzle-orm';
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

const host = 'grafite.assistente-da-distribuicao.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const locais: Record<string, string> = {};
const ids: Record<string, string> = {};
const daVisao: Record<string, string> = {};
const pacotes: Record<string, string> = {};
/** Os IPs que a tarefa de acordar chamou; o da F3 não responde. */
const chamados: string[] = [];
const IP_QUE_NAO_RESPONDE = '10.9.0.3';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

/** O relógio da API está em 2026-10-02T12:00:00Z: "em dia" falou há 3 horas, e o outro, há 3 dias. */
const CONTATO = { 'em dia': '2026-10-02T09:00:00Z', 'há 3 dias': '2026-09-29T09:00:00Z' } as const;

const MAQUINAS: {
  chave: string;
  local: string;
  hostname: string;
  patrimonio?: string;
  contato?: keyof typeof CONTATO;
  inativo?: boolean;
  programas?: [string, string][];
  responsavel?: string;
}[] = [
  {
    chave: 'f1',
    local: 'financeiro',
    hostname: 'nb-fin-01',
    contato: 'em dia',
    programas: [['7-Zip 24.08 (x64)', '24.08']],
  },
  {
    chave: 'f2',
    local: 'financeiro',
    hostname: 'pc-fin-02',
    patrimonio: 'PAT-0002',
    contato: 'em dia',
    programas: [['7-Zip 23.01 (x64)', '23.01']],
  },
  { chave: 'f3', local: 'financeiro', hostname: 'pc-fin-03', contato: 'em dia' },
  { chave: 'f4', local: 'financeiro', hostname: 'pc-fin-04', contato: 'há 3 dias' },
  {
    chave: 'f5',
    local: 'financeiro',
    hostname: 'pc-fin-05',
    contato: 'há 3 dias',
    programas: [['7-Zip 24.08 (x64)', '24.08']],
  },
  // Sem o agente, e o inativo com o agente: nunca entram.
  { chave: 'f6', local: 'financeiro', hostname: 'pc-fin-06' },
  { chave: 'f7', local: 'financeiro', hostname: 'pc-fin-07', contato: 'em dia', inativo: true },
  {
    chave: 'c1',
    local: 'comercial',
    hostname: 'nb-com-01',
    contato: 'em dia',
    responsavel: 'Marta Lima',
  },
  { chave: 'x1', local: 'filial', hostname: 'nb-fil-01', contato: 'em dia' },
];

const DEFINICAO = (texto: string | null) => ({
  colunas: [{ chave: 'ativo.rotulo' }],
  ordenacao: null,
  filtros: texto ? [{ chave: 'ativo.hostname', operador: 'contem', texto }] : [],
});

beforeAll(async () => {
  api = await abrirApi({
    acordarAgente: async (ip) => {
      chamados.push(ip);
      return ip !== IP_QUE_NAO_RESPONDE;
    },
    // Sem a periódica, que, na virada do quarto de hora, chamaria as máquinas antes da tarefa de agora.
    tarefas: (contexto) =>
      tarefasDaApi(contexto).filter(({ nome }) => nome !== TAREFA_DOS_AGENDADOS),
    intervaloDaFila: 0.5,
  });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  locais.matriz = await criarLocal(api, org, { nome: 'Matriz', tipo: 'unidade' });
  locais.financeiro = await criarLocal(api, org, { nome: 'Financeiro', paiId: locais.matriz });
  locais.comercial = await criarLocal(api, org, { nome: 'Comercial', paiId: locais.matriz });
  locais.filial = await criarLocal(api, org, { nome: 'Filial', tipo: 'unidade' });
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['software.administrar', 'software.distribuir', 'ativos.ver', 'pessoas.ver'],
  });
  const distribui = await criarPerfil(api, org, {
    nome: 'Distribui',
    permissoes: ['software.distribuir'],
  });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  // Carla distribui só na Matriz e vê tudo; Bruno distribui em tudo e vê só a Matriz.
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: distribui, contaId: carla.id, localId: locais.matriz });
  await atribuir(api, org, { perfilId: ver, contaId: carla.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: distribui, contaId: bruno.id });
  await atribuir(api, org, { perfilId: ver, contaId: bruno.id, localId: locais.matriz });
  for (const usuario of ['ana', 'carla', 'bruno'])
    entradas[usuario] = await cliente.entrar(usuario);

  for (const [nome, versao, nomeNoInventario] of [
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
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
      })
      .returning({ id: tiposDeAtivo.id });
    const agenteDa: Record<string, string> = {};
    for (const [posicao, maquina] of MAQUINAS.entries()) {
      const nome = `Estação ${maquina.chave.toUpperCase()}`;
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
          nome,
          hostname: maquina.hostname,
          patrimonio: maquina.patrimonio ?? null,
          busca: normalizarTexto(`${nome} ${maquina.hostname} ${maquina.patrimonio ?? ''}`),
          localId: locais[maquina.local] ?? null,
          responsavelId,
          situacao: maquina.inativo ? 'inativo' : 'ativo',
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const ativoId = ativo?.id ?? '';
      ids[maquina.chave] = ativoId;
      if (maquina.contato) {
        const [agente] = await tx
          .insert(agentes)
          .values({
            orgId: org,
            deviceid: `${maquina.hostname}-2024`,
            nome: maquina.hostname,
            ip: `10.9.0.${posicao + 1}`,
            ativoId,
            ultimoContato: new Date(CONTATO[maquina.contato]),
          })
          .returning({ id: agentes.id });
        agenteDa[maquina.chave] = agente?.id ?? '';
      }
      for (const [programa, versao] of maquina.programas ?? []) {
        await tx.insert(softwaresDosAtivos).values({
          orgId: org,
          ativoId,
          nome: programa,
          nomeNormalizado: normalizarTexto(programa),
          versao,
          inventariadoEm: new Date('2026-10-01T12:00:00Z'),
        });
      }
    }
    // O SumatraPDF instala agora na F3: a prévia do 7-Zip avisa da outra instalação em andamento.
    const [distribuicao] = await tx
      .insert(distribuicoes)
      .values({
        orgId: org,
        pacoteId: pacotes.SumatraPDF ?? '',
        criadaPor: ana.id,
        criadaEm: new Date('2026-10-02T11:00:00Z'),
        paraQuem: 'Estação F3',
      })
      .returning({ id: distribuicoes.id });
    await tx.insert(maquinasDasDistribuicoes).values({
      orgId: org,
      distribuicaoId: distribuicao?.id ?? '',
      ativoId: ids.f3 ?? '',
      agenteId: agenteDa.f3 ?? '',
      situacao: 'em-andamento',
    });
    for (const [chave, nome, contaId, texto] of [
      ['notebooks', 'Notebooks', null, 'nb-'],
      ['doFinanceiro', 'Do financeiro', carla.id, 'fin'],
      ['daAna', 'Da Ana', ana.id, null],
    ] as const) {
      const [visao] = await tx
        .insert(visoes)
        .values({
          orgId: org,
          tabela: 'ativos',
          contaId,
          nome,
          nomeNormalizado: normalizarTexto(nome),
          definicao: DEFINICAO(texto),
        })
        .returning({ id: visoes.id });
      daVisao[chave] = visao?.id ?? '';
    }
    // As da Ana que deixaram de valer: um filtro que a coluna não aceita e a definição que não se lê.
    for (const [chave, nome, definicao] of [
      [
        'notebooksAntigos',
        'Notebooks antigos',
        { ...DEFINICAO(null), filtros: [{ chave: 'ativo.hostname', operador: 'entre', de: 1 }] },
      ],
      ['impressorasVelhas', 'Impressoras velhas', { ...DEFINICAO(null), filtros: 'todas' }],
    ] as const) {
      const [visao] = await tx
        .insert(visoes)
        .values({
          orgId: org,
          tabela: 'ativos',
          contaId: ana.id,
          nome,
          nomeNormalizado: normalizarTexto(nome),
          definicao,
        })
        .returning({ id: visoes.id });
      daVisao[chave] = visao?.id ?? '';
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

interface MaquinaNaResposta {
  id: string;
  hostname: string | null;
  classe: string;
  versao: string | null;
  semContato: { dias: number; texto: string } | null;
  emAndamento: { pacote: string } | null;
}

const previa = (usuario: string, alvo: Record<string, unknown>) =>
  cliente.enviar('POST', '/software/distribuicoes/previa', como(usuario), {
    pacoteId: pacotes['7-Zip'],
    alvo,
  });

const hostnames = (corpo: { maquinas: MaquinaNaResposta[] }) =>
  corpo.maquinas.map(({ hostname }) => hostname);

describe('POST /software/distribuicoes/previa', () => {
  it('A conta antes de enviar: pulada, na fila e vai instalar, com o sem contato e a outra instalação em andamento', async () => {
    const r = await previa('ana', { locais: [locais.financeiro] });
    expect(r.statusCode, r.body).toBe(200);
    const corpo = r.json();
    expect(
      corpo.maquinas.map((maquina: MaquinaNaResposta) => [
        maquina.hostname,
        maquina.classe,
        maquina.versao,
        maquina.semContato,
        maquina.emAndamento,
      ]),
    ).toEqual([
      ['nb-fin-01', 'pulada', '24.08', null, null],
      ['pc-fin-02', 'vai-instalar', '23.01', null, null],
      ['pc-fin-03', 'vai-instalar', null, null, { pacote: 'SumatraPDF' }],
      ['pc-fin-04', 'na-fila', null, { dias: 3, texto: 'Sem contato · há 3 dias' }, null],
      // Já na versão-alvo, mesmo sem contato: pulada.
      ['pc-fin-05', 'pulada', '24.08', { dias: 3, texto: 'Sem contato · há 3 dias' }, null],
    ]);
    expect(corpo.conta).toEqual({
      vaoInstalar: 2,
      puladas: 2,
      jaAguardam: 0,
      naFila: 1,
      primeiraVez: 1,
      porVersao: [{ versao: '23.01', quantas: 1 }],
    });
    // O "Para quem" das que entram na distribuição.
    expect(corpo.paraQuem).toBe('Financeiro');
    expect(corpo.naoAchados).toEqual([]);
  });

  it('A união das escolhas, sem repetir e sem as tiradas da lista, e o "Para quem" do local que contém todas', async () => {
    const r = await previa('ana', {
      locais: [locais.financeiro],
      ativoIds: [ids.c1, ids.f2],
      fora: [ids.f4],
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(hostnames(r.json())).toEqual([
      'nb-com-01',
      'nb-fin-01',
      'pc-fin-02',
      'pc-fin-03',
      'pc-fin-05',
    ]);
    expect(r.json().paraQuem).toBe('Matriz');
  });

  it('A visão e a lista colada rodam com o ver: fora dos locais em que a conta distribui, ficam de fora, e as da lista não são achadas', async () => {
    const r = await previa('carla', {
      visoes: [daVisao.notebooks],
      lista: 'estacao f3\nPAT-0002, NB-COM-01\nnb-fil-01\npc-fin-06\nnada-01',
    });
    expect(r.statusCode, r.body).toBe(200);
    // A visão acha as três do "nb-", e a da Filial fica de fora; a lista acha pelo nome, pelo
    // patrimônio e pelo hostname.
    expect(hostnames(r.json())).toEqual(['nb-com-01', 'nb-fin-01', 'pc-fin-02', 'pc-fin-03']);
    expect(r.json().naoAchados).toEqual(['nb-fil-01', 'pc-fin-06', 'nada-01']);

    // Bruno distribui em tudo, mas vê só a Matriz: a da Filial também não é achada.
    const b = await previa('bruno', { visoes: [daVisao.notebooks], lista: 'nb-fil-01' });
    expect(b.statusCode, b.body).toBe(200);
    expect(hostnames(b.json())).toEqual(['nb-com-01', 'nb-fin-01']);
    expect(b.json().naoAchados).toEqual(['nb-fil-01']);
  });

  it('O local e o ativo mandados pelo id, fora dos locais em que a conta distribui, dão 403', async () => {
    expect((await previa('carla', { locais: [locais.filial] })).statusCode).toBe(403);
    expect((await previa('carla', { ativoIds: [ids.x1] })).statusCode).toBe(403);
  });

  it('A visão de outra conta, ou que não existe, dá 404; a da própria conta vale', async () => {
    const r = await previa('carla', { visoes: [daVisao.daAna] });
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Visão não encontrada.');
    const outra = await previa('carla', { visoes: ['01900000-0000-7000-8000-000000000000'] });
    expect(outra.statusCode).toBe(404);
    const daConta = await previa('carla', { visoes: [daVisao.doFinanceiro] });
    expect(daConta.statusCode, daConta.body).toBe(200);
    expect(hostnames(daConta.json())).toEqual([
      'nb-fin-01',
      'pc-fin-02',
      'pc-fin-03',
      'pc-fin-04',
      'pc-fin-05',
    ]);
  });

  it('O ativo pelo id sem o agente ou inativo é recusado, como na criação', async () => {
    const semAgente = await previa('ana', { ativoIds: [ids.f6] });
    expect(semAgente.statusCode).toBe(400);
    expect(semAgente.json().campos).toEqual({
      ativoIds: 'O ativo Estação F6 não tem o agente do GLPI ligado.',
    });
    const inativo = await previa('ana', { ativoIds: [ids.f7] });
    expect(inativo.statusCode).toBe(400);
    expect(inativo.json().campos).toEqual({ ativoIds: 'Escolha só ativos ativos.' });
  });

  it('A lista colada aceita até 2.000 máquinas', async () => {
    const lista = (quantas: number) =>
      Array.from({ length: quantas }, (_, posicao) => `PC-${posicao}`).join('\n');
    const demais = await previa('ana', { lista: lista(2001) });
    expect(demais.statusCode).toBe(400);
    expect(demais.json().campos).toEqual({ lista: 'Cole até 2.000 máquinas de uma vez.' });
    const cabem = await previa('ana', { lista: lista(2000) });
    expect(cabem.statusCode, cabem.body).toBe(200);
    expect(cabem.json().naoAchados).toHaveLength(2000);
  });

  it('Sem escolha, a prévia fica vazia', async () => {
    const r = await previa('ana', {});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ maquinas: [], naoAchados: [], paraQuem: '0 máquinas' });
  });

  it('Prazo maior: com 5 dias, a máquina que falou há 3 dias vai instalar', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .insert(cadastroDosAgentes)
        .values({ orgId: org, diasSemContato: 5 })
        .onConflictDoUpdate({ target: cadastroDosAgentes.orgId, set: { diasSemContato: 5 } }),
    );
    try {
      const r = await previa('ana', { ativoIds: [ids.f4, ids.f5] });
      expect(r.statusCode, r.body).toBe(200);
      expect(
        r
          .json()
          .maquinas.map((maquina: MaquinaNaResposta) => [
            maquina.hostname,
            maquina.classe,
            maquina.semContato,
          ]),
      ).toEqual([
        ['pc-fin-04', 'vai-instalar', null],
        ['pc-fin-05', 'pulada', null],
      ]);
    } finally {
      await naOrganizacao(api.banco, org, (tx) =>
        tx.update(cadastroDosAgentes).set({ diasSemContato: 2 }),
      );
    }
  });
});

/** Espera a condição, de 100 em 100 ms, até 10 s. */
async function esperar(condicao: () => Promise<boolean>) {
  for (let vez = 0; vez < 100; vez++) {
    if (await condicao()) return true;
    await new Promise((pronto) => setTimeout(pronto, 100));
  }
  return false;
}

const distribuir = (usuario: string, pedido: Record<string, unknown>) =>
  cliente.enviar('POST', '/software/distribuicoes', como(usuario), {
    pacoteId: pacotes['7-Zip'],
    ...pedido,
  });

/** O chamado de cada máquina da distribuição, pelo rótulo: quando foi, se respondeu e o log. */
const chamadosDa = async (distribuicaoId: string) => {
  const r = await cliente.consultar(`/software/distribuicoes/${distribuicaoId}`, como('ana'));
  const linhas = await naOrganizacao(api.banco, org, (tx) =>
    tx
      .select()
      .from(maquinasDasDistribuicoes)
      .where(eq(maquinasDasDistribuicoes.distribuicaoId, distribuicaoId)),
  );
  return Object.fromEntries(
    r
      .json()
      .maquinasDaDistribuicao.map(
        (maquina: { id: string; ativo: { rotulo: string }; log: string[] }) => {
          const linha = linhas.find(({ id }) => id === maquina.id);
          return [
            maquina.ativo.rotulo,
            {
              chamadaEm: linha?.chamadaEm?.toISOString() ?? null,
              respondeu: linha?.chamadaRespondeu ?? null,
              log: maquina.log,
            },
          ];
        },
      ),
  );
};

const auditoriaDa = async (distribuicaoId: string) => {
  const [registro] = await naOrganizacao(api.banco, org, (tx) =>
    tx
      .select()
      .from(auditoria)
      .where(eq(auditoria.alvoId, distribuicaoId))
      .orderBy(desc(auditoria.id)),
  );
  return registro;
};

describe('POST /software/distribuicoes', () => {
  it('Máquina que já tem a versão: as puladas ficam de fora, a sem contato entra na fila, e o agora acorda os agentes', async () => {
    const r = await distribuir('ana', {
      alvo: { locais: [locais.financeiro] },
      quando: 'agora',
      fuso: 'America/Sao_Paulo',
    });
    expect(r.statusCode, r.body).toBe(201);
    const ficha = r.json();
    expect(ficha).toMatchObject({
      paraQuem: 'Financeiro',
      quando: { chave: 'agora', aPartirDe: null, fuso: 'America/Sao_Paulo' },
      maquinas: 3,
      progresso: '0 de 3 concluídas',
    });
    expect(
      ficha.maquinasDaDistribuicao.map(
        (maquina: { ativo: { rotulo: string }; situacao: { chave: string } }) => [
          maquina.ativo.rotulo,
          maquina.situacao.chave,
        ],
      ),
    ).toEqual([
      ['Estação F2', 'aguardando'],
      ['Estação F3', 'aguardando'],
      ['Estação F4', 'aguardando'],
    ]);
    expect((await auditoriaDa(ficha.id))?.dados).toEqual({
      pacote: '7-Zip',
      versao: '24.08',
      maquinas: 3,
      puladas: 2,
      jaAguardavam: 0,
      paraQuem: 'Financeiro',
      quando: 'agora',
      aPartirDe: null,
      fuso: 'America/Sao_Paulo',
    });
    // A F2 e a F3 são chamadas na hora, às 09:00 de São Paulo; a F4, sem contato, não.
    const chamadas = async () =>
      Object.values(await chamadosDa(ficha.id)).filter(({ chamadaEm }) => chamadaEm).length;
    expect(await esperar(async () => (await chamadas()) === 2)).toBe(true);
    expect(await chamadosDa(ficha.id)).toEqual({
      'Estação F2': {
        chamadaEm: '2026-10-02T12:00:00.000Z',
        respondeu: true,
        log: ['Chamado às 09:00'],
      },
      'Estação F3': {
        chamadaEm: '2026-10-02T12:00:00.000Z',
        respondeu: false,
        log: ['Chamado às 09:00, sem resposta'],
      },
      'Estação F4': { chamadaEm: null, respondeu: null, log: [] },
    });
    expect(chamados).not.toContain('10.9.0.4');
  });

  it('Driver na janela da noite e o dia marcado: guardam o quando e o fuso, sem acordar ninguém na hora', async () => {
    const noite = await distribuir('ana', {
      alvo: { ativoIds: [ids.c1] },
      quando: 'noite',
      fuso: 'America/Sao_Paulo',
    });
    expect(noite.statusCode, noite.body).toBe(201);
    expect(noite.json()).toMatchObject({
      paraQuem: 'Estação C1',
      quando: { chave: 'noite', aPartirDe: null, fuso: 'America/Sao_Paulo' },
    });
    // A C1 sai da fila da noite para entrar na do dia marcado: a que já aguarda o pacote é pulada.
    const tirarDaFila = (ficha: { id: string; maquinasDaDistribuicao: { id: string }[] }) =>
      cliente.enviar(
        'POST',
        `/software/distribuicoes/${ficha.id}/maquinas/${ficha.maquinasDaDistribuicao[0]?.id}/tirar-da-fila`,
        como('ana'),
      );
    expect((await tirarDaFila(noite.json())).statusCode).toBe(200);
    // Amanhã às 22:00 em São Paulo, frente ao relógio da API em 2026-10-02T12:00:00Z.
    const dia = await distribuir('ana', {
      alvo: { ativoIds: [ids.c1] },
      quando: 'dia',
      aPartirDe: '2026-10-04T01:00:00.000Z',
      fuso: 'America/Sao_Paulo',
    });
    expect(dia.statusCode, dia.body).toBe(201);
    expect(dia.json().quando).toEqual({
      chave: 'dia',
      aPartirDe: '2026-10-04T01:00:00.000Z',
      fuso: 'America/Sao_Paulo',
    });
    expect((await auditoriaDa(dia.json().id))?.dados).toMatchObject({
      quando: 'dia',
      aPartirDe: '2026-10-04T01:00:00.000Z',
      fuso: 'America/Sao_Paulo',
    });
    // A da noite e a do dia não chamam ninguém na hora.
    expect((await chamadosDa(noite.json().id))['Estação C1']?.chamadaEm).toBeNull();
    expect((await chamadosDa(dia.json().id))['Estação C1']?.chamadaEm).toBeNull();
    // A C1 fica livre para a distribuição da visão, mais adiante.
    expect((await tirarDaFila(dia.json())).statusCode).toBe(200);
  });

  it('o dia marcado chega como o instante ISO com o fuso e vai até daqui a um ano', async () => {
    const depoisDeUmAno = new Date(Date.now() + 400 * 86_400_000).toISOString();
    for (const [aPartirDe, fuso, motivo] of [
      ['2026-12-05T22:00:00', 'America/Sao_Paulo', 'Escolha o dia e a hora.'],
      ['2026-12-05', 'America/Sao_Paulo', 'Escolha o dia e a hora.'],
      ['5 de dezembro, 22:00', 'America/Sao_Paulo', 'Escolha o dia e a hora.'],
      // O esquema da rota recusa o texto antes de o fuso ser conferido, como os outros campos.
      ['2026-12-05T22:00:00', 'America/Atlantida', 'Escolha o dia e a hora.'],
      [depoisDeUmAno, 'America/Sao_Paulo', 'Escolha um dia até daqui a um ano.'],
    ] as const) {
      const r = await distribuir('ana', {
        alvo: { ativoIds: [ids.c1] },
        quando: 'dia',
        aPartirDe,
        fuso,
      });
      expect(r.statusCode, aPartirDe).toBe(400);
      expect(r.json().campos, `${aPartirDe} ${fuso}`).toEqual({ aPartirDe: motivo });
    }
  });

  it('recusa o dia de hoje, o fuso que não existe e a noite sem o fuso', async () => {
    const hoje = await distribuir('ana', {
      alvo: { ativoIds: [ids.c1] },
      quando: 'dia',
      aPartirDe: '2026-10-02T23:00:00.000Z',
      fuso: 'America/Sao_Paulo',
    });
    expect(hoje.statusCode).toBe(400);
    expect(hoje.json().campos).toEqual({ aPartirDe: 'Escolha um dia de amanhã em diante.' });
    for (const pedido of [
      { quando: 'noite', fuso: 'America/Atlantida' },
      { quando: 'agora', fuso: 'America/Atlantida' },
      { quando: 'noite' },
    ]) {
      const r = await distribuir('ana', { alvo: { ativoIds: [ids.c1] }, ...pedido });
      expect(r.statusCode, JSON.stringify(pedido)).toBe(400);
      expect(r.json().campos).toEqual({ fuso: 'O fuso de quem envia não existe.' });
    }
  });

  it('recusa sem máquinas e com todas as máquinas já na versão-alvo', async () => {
    const sem = await distribuir('ana', { alvo: {} });
    expect(sem.statusCode).toBe(400);
    expect(sem.json().campos).toEqual({ alvo: 'Escolha pelo menos uma máquina.' });
    const todas = await distribuir('ana', { alvo: { ativoIds: [ids.f1, ids.f5] } });
    expect(todas.statusCode).toBe(400);
    expect(todas.json().campos).toEqual({
      alvo: 'Todas as máquinas escolhidas já têm a versão 24.08.',
    });
  });

  it('A mesma permissão da prévia: a visão fica nos locais em que a conta distribui, e o local de fora dá 403', async () => {
    const r = await distribuir('carla', { alvo: { visoes: [daVisao.notebooks] } });
    expect(r.statusCode, r.body).toBe(201);
    // A F1 já tem a 24.08, e a da Filial fica de fora: só a C1 entra.
    expect(r.json()).toMatchObject({ paraQuem: 'Estação C1', maquinas: 1 });
    expect((await distribuir('carla', { alvo: { locais: [locais.filial] } })).statusCode).toBe(403);
  });

  it('a rota do "Pedir agora" saiu', async () => {
    const r = await cliente.enviar('POST', `/software/distribuicoes/${ids.f1}/agora`, como('ana'));
    expect(r.statusCode).toBe(404);
  });
});

describe('GET /software/distribuicoes/alvos', () => {
  it('Os locais em que a conta distribui, com as máquinas do ramo e as sem contato, e as visões dela e da organização', async () => {
    const r = await cliente.consultar('/software/distribuicoes/alvos', como('carla'));
    expect(r.statusCode, r.body).toBe(200);
    const corpo = r.json();
    expect(
      corpo.locais.map((local: { nome: string; maquinas: number; semContato: number }) => [
        local.nome,
        local.maquinas,
        local.semContato,
      ]),
    ).toEqual([
      ['Matriz', 6, 2],
      ['Comercial', 1, 0],
      ['Financeiro', 5, 2],
    ]);
    expect(corpo.locais[1].paiId).toBe(locais.matriz);
    expect(
      corpo.visoes.map((visao: { nome: string; compartilhada: boolean; maquinas: number }) => [
        visao.nome,
        visao.compartilhada,
        visao.maquinas,
      ]),
    ).toEqual([
      ['Do financeiro', false, 5],
      ['Notebooks', true, 2],
    ]);
    expect(
      corpo.visoes.map(({ deixouDeValer }: { deixouDeValer: boolean }) => deixouDeValer),
    ).toEqual([false, false]);
  });

  it('A visão que deixou de valer vem sem a contagem, e a prévia e a criação a recusam pelo nome', async () => {
    const r = await cliente.consultar('/software/distribuicoes/alvos', como('ana'));
    expect(r.statusCode, r.body).toBe(200);
    expect(
      r
        .json()
        .visoes.map((visao: { nome: string; maquinas: number | null; deixouDeValer: boolean }) => [
          visao.nome,
          visao.deixouDeValer,
          visao.maquinas,
        ]),
    ).toEqual([
      ['Da Ana', false, 7],
      ['Impressoras velhas', true, null],
      ['Notebooks', false, 3],
      ['Notebooks antigos', true, null],
    ]);

    const motivo = (nome: string) =>
      `A visão ${nome} deixou de valer. Refaça os filtros dela na tabela do Ativos.`;
    const doFiltro = await previa('ana', {
      visoes: [daVisao.notebooks, daVisao.notebooksAntigos],
    });
    expect(doFiltro.statusCode, doFiltro.body).toBe(400);
    expect(doFiltro.json().campos).toEqual({ visoes: motivo('Notebooks antigos') });
    const daDefinicao = await previa('ana', { visoes: [daVisao.impressorasVelhas] });
    expect(daDefinicao.statusCode, daDefinicao.body).toBe(400);
    expect(daDefinicao.json().campos).toEqual({ visoes: motivo('Impressoras velhas') });

    const antes = await naOrganizacao(api.banco, org, (tx) => tx.select().from(distribuicoes));
    const naCriacao = await distribuir('ana', { alvo: { visoes: [daVisao.notebooksAntigos] } });
    expect(naCriacao.statusCode, naCriacao.body).toBe(400);
    expect(naCriacao.json().campos).toEqual({ visoes: motivo('Notebooks antigos') });
    const depois = await naOrganizacao(api.banco, org, (tx) => tx.select().from(distribuicoes));
    expect(depois).toHaveLength(antes.length);
  });
});

describe('GET /software/maquinas', () => {
  it('A busca roda com o ver, fica nos locais em que a conta distribui e acha pela pessoa', async () => {
    const busca = async (usuario: string, termo: string) => {
      const r = await cliente.consultar(`/software/maquinas?busca=${termo}`, como(usuario));
      expect(r.statusCode, r.body).toBe(200);
      return r.json().maquinas.map((maquina: { rotulo: string }) => maquina.rotulo);
    };
    expect(await busca('ana', 'nb')).toEqual(['Estação C1', 'Estação F1', 'Estação X1']);
    expect(await busca('carla', 'nb')).toEqual(['Estação C1', 'Estação F1']);
    expect(await busca('bruno', 'nb')).toEqual(['Estação C1', 'Estação F1']);
    expect(await busca('ana', 'marta')).toEqual(['Estação C1']);
  });

  it('Cada máquina diz o sem contato', async () => {
    const r = await cliente.consultar('/software/maquinas?busca=pc-fin-04', como('ana'));
    expect(r.json().maquinas).toMatchObject([
      { rotulo: 'Estação F4', semContato: { dias: 3, texto: 'Sem contato · há 3 dias' } },
    ]);
  });
});
