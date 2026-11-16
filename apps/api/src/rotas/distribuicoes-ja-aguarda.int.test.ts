// A máquina que já aguarda o pacote (spec distribuicao-de-software, "Distribuição às máquinas" e
// "Tentar de novo e tirar da fila"; spec inventario-pelo-agente, "Softwares na ficha do ativo"; change
// software-por-pacote, design, decisões 10 e 11): a que aguarda ou instala o mesmo pacote noutra
// distribuição é pulada com esse motivo, depois da pulada pela versão e antes da fila, com a outra
// distribuição na prévia; a criação a deixa de fora, conta à parte na auditoria e recusa pelo motivo;
// duas criações ao mesmo tempo passam uma de cada vez; o "Tentar de novo" é recusado na que já aguarda
// noutra, que traz a `aguardaNoutra`; e a ficha da máquina diz o pacote que ela já aguarda. O relógio
// está em 2026-10-02T12:00:00Z, 09:00 em São Paulo.
import {
  agentes,
  ativos,
  auditoria,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  softwaresDosAtivos,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { and, desc, eq } from 'drizzle-orm';
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
} from '../../test/integracao.ts';

const host = 'grafite.ja-aguarda.local';
const FUSO = 'America/Sao_Paulo';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let ana: Entrada;
let financeiro = '';
const pacotes: Record<string, string> = {};
const ids: Record<string, string> = {};
const distribuicao: Record<string, string> = {};
/** A máquina de cada ativo em cada distribuição: `${distribuicao}:${ativo}`. */
const maquinaDa: Record<string, string> = {};

type Situacao = 'aguardando' | 'em-andamento' | 'falhou';

/** As máquinas, no Financeiro sem outro local: o Chrome do inventário e onde aguardam ou falharam. */
const MAQUINAS: {
  chave: string;
  local?: 'comercial';
  semContato?: boolean;
  chrome?: string;
  em?: Partial<Record<'noite' | 'manha' | 'sumatra', Situacao>>;
}[] = [
  { chave: 'f1', chrome: '129.0.6668.90', em: { noite: 'aguardando' } },
  { chave: 'f2', em: { noite: 'aguardando' } },
  // Já na versão-alvo e aguardando: a versão vem primeiro.
  { chave: 'f3', chrome: '131.0.6778.86', em: { noite: 'aguardando' } },
  // Aguarda outro pacote: vai instalar o Chrome.
  { chave: 'f4', em: { sumatra: 'aguardando' } },
  // Sem contato e aguardando: já aguarda vem antes da fila.
  { chave: 'f5', semContato: true, em: { noite: 'aguardando' } },
  { chave: 'f6', em: { manha: 'falhou', noite: 'aguardando' } },
  { chave: 'f7', em: { noite: 'em-andamento' } },
  { chave: 'f8', em: { manha: 'falhou' } },
  { chave: 'f9' },
  // No Comercial: o tentar de novo e a criação ao mesmo tempo.
  { chave: 'f10', local: 'comercial', em: { manha: 'falhou' } },
];

const CRIADAS = {
  noite: { em: '2026-10-02T11:30:00.000Z', quando: 'noite' },
  manha: { em: '2026-10-02T11:00:00.000Z', quando: 'agora' },
  sumatra: { em: '2026-10-02T10:00:00.000Z', quando: 'agora' },
} as const;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  financeiro = await criarLocal(api, org, { nome: 'Financeiro', tipo: 'unidade' });
  const comercial = await criarLocal(api, org, { nome: 'Comercial', tipo: 'unidade' });
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['software.administrar', 'software.distribuir', 'ativos.ver'],
  });
  const conta = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: conta.id });
  ana = await cliente.entrar('ana');
  for (const [nome, versao] of [
    ['Google Chrome', '131'],
    ['SumatraPDF', '3.5'],
  ] as const) {
    const r = await cliente.enviar('POST', '/software/pacotes', ana, {
      nome,
      versao,
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
    for (const [chave, { em, quando }] of Object.entries(CRIADAS)) {
      const [linha] = await tx
        .insert(distribuicoes)
        .values({
          orgId: org,
          pacoteId: (chave === 'sumatra' ? pacotes.SumatraPDF : pacotes['Google Chrome']) ?? '',
          criadaPor: conta.id,
          criadaEm: new Date(em),
          quando,
          fuso: FUSO,
          paraQuem: 'Financeiro',
        })
        .returning({ id: distribuicoes.id });
      distribuicao[chave] = linha?.id ?? '';
    }
    for (const [posicao, maquina] of MAQUINAS.entries()) {
      const hostname = `pc-fin-${maquina.chave.slice(1).padStart(2, '0')}`;
      const nome = `Estação ${maquina.chave.toUpperCase()}`;
      const [ativo] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          nome,
          hostname,
          busca: normalizarTexto(`${nome} ${hostname}`),
          localId: maquina.local === 'comercial' ? comercial : financeiro,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const ativoId = ativo?.id ?? '';
      ids[maquina.chave] = ativoId;
      const [agente] = await tx
        .insert(agentes)
        .values({
          orgId: org,
          deviceid: `${hostname}-2024`,
          nome: hostname,
          ip: `10.18.0.${posicao + 1}`,
          ativoId,
          ultimoContato: new Date(
            maquina.semContato ? '2026-09-29T09:00:00Z' : '2026-10-02T09:00:00Z',
          ),
        })
        .returning({ id: agentes.id });
      if (maquina.chrome) {
        await tx.insert(softwaresDosAtivos).values({
          orgId: org,
          ativoId,
          nome: 'Google Chrome',
          nomeNormalizado: normalizarTexto('Google Chrome'),
          versao: maquina.chrome,
          inventariadoEm: new Date('2026-10-01T12:00:00Z'),
        });
      }
      for (const [chave, situacao] of Object.entries(maquina.em ?? {})) {
        const [linha] = await tx
          .insert(maquinasDasDistribuicoes)
          .values({
            orgId: org,
            distribuicaoId: distribuicao[chave] ?? '',
            ativoId,
            agenteId: agente?.id ?? '',
            situacao,
            codigoDeSaida: situacao === 'falhou' ? 1603 : null,
          })
          .returning({ id: maquinasDasDistribuicoes.id });
        maquinaDa[`${chave}:${maquina.chave}`] = linha?.id ?? '';
      }
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

/** A outra distribuição como a API a escreve: o id, o envio e o quando. */
const outraDa = (chave: keyof typeof CRIADAS) => ({
  id: distribuicao[chave],
  criadaEm: CRIADAS[chave].em,
  quando: { chave: CRIADAS[chave].quando, aPartirDe: null, fuso: FUSO },
});

const distribuir = (alvo: Record<string, unknown>) =>
  cliente.enviar('POST', '/software/distribuicoes', ana, {
    pacoteId: pacotes['Google Chrome'],
    alvo,
    quando: 'agora',
    fuso: FUSO,
  });

describe('a máquina que já aguarda o pacote', () => {
  it('Máquina que já aguarda o pacote: a prévia a põe em "já aguarda", depois da pulada pela versão e antes da fila, com a outra distribuição', async () => {
    const r = await cliente.enviar('POST', '/software/distribuicoes/previa', ana, {
      pacoteId: pacotes['Google Chrome'],
      alvo: { locais: [financeiro] },
    });
    expect(r.statusCode, r.body).toBe(200);
    const corpo = r.json();
    expect(
      corpo.maquinas.map(
        (maquina: { hostname: string; classe: string; outra: unknown; emAndamento: unknown }) => [
          maquina.hostname,
          maquina.classe,
          maquina.outra,
          maquina.emAndamento,
        ],
      ),
    ).toEqual([
      ['pc-fin-01', 'ja-aguarda', outraDa('noite'), null],
      ['pc-fin-02', 'ja-aguarda', outraDa('noite'), null],
      ['pc-fin-03', 'pulada', null, null],
      ['pc-fin-04', 'vai-instalar', null, null],
      ['pc-fin-05', 'ja-aguarda', outraDa('noite'), null],
      ['pc-fin-06', 'ja-aguarda', outraDa('noite'), null],
      ['pc-fin-07', 'ja-aguarda', outraDa('noite'), { pacote: 'Google Chrome' }],
      ['pc-fin-08', 'vai-instalar', null, null],
      ['pc-fin-09', 'vai-instalar', null, null],
    ]);
    expect(corpo.conta).toEqual({
      vaoInstalar: 3,
      puladas: 1,
      jaAguardam: 5,
      naFila: 0,
      primeiraVez: 3,
      porVersao: [],
    });
    expect(corpo.paraQuem).toBe('Financeiro');
  });

  it('o "Para quem" da prévia é o de todas as escolhidas, com as puladas, também sem nenhuma que entra ou com uma só', async () => {
    for (const [alvo, esperado] of [
      [{ ativoIds: [ids.f1, ids.f2] }, 'Financeiro'],
      [{ locais: [financeiro], fora: [ids.f8, ids.f9] }, 'Financeiro'],
      [{ ativoIds: [ids.f1, ids.f10] }, '2 locais'],
    ] as const) {
      const r = await cliente.enviar('POST', '/software/distribuicoes/previa', ana, {
        pacoteId: pacotes['Google Chrome'],
        alvo,
      });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().paraQuem).toBe(esperado);
    }
  });

  it('a criação deixa de fora as que já aguardam, e a auditoria as conta à parte', async () => {
    const r = await distribuir({ locais: [financeiro], fora: [ids.f8, ids.f9] });
    expect(r.statusCode, r.body).toBe(201);
    const criada = r.json();
    expect(
      criada.maquinasDaDistribuicao.map(({ ativo }: { ativo: { rotulo: string } }) => ativo.rotulo),
    ).toEqual(['Estação F4']);
    // A distribuição guarda o "Para quem" só das que entram.
    expect(criada.paraQuem).toBe('Estação F4');
    const [registro] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ dados: auditoria.dados })
        .from(auditoria)
        .where(eq(auditoria.alvoId, criada.id))
        .orderBy(desc(auditoria.id)),
    );
    expect(registro?.dados).toMatchObject({ maquinas: 1, puladas: 1, jaAguardavam: 5 });
  });

  it('as três recusas sem nenhuma que entra: as que já aguardam, as da versão e as duas', async () => {
    for (const [alvo, motivo] of [
      [[ids.f1, ids.f2], 'Todas as máquinas escolhidas já aguardam este pacote.'],
      [[ids.f3], 'Todas as máquinas escolhidas já têm a versão 131.'],
      [
        [ids.f1, ids.f3],
        'Todas as máquinas escolhidas já têm a versão 131 ou já aguardam este pacote.',
      ],
    ] as const) {
      const r = await distribuir({ ativoIds: alvo });
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual({ alvo: motivo });
    }
  });

  it('Duas criações ao mesmo tempo: uma fica com a máquina, e a outra vê a primeira e é recusada', async () => {
    const respostas = await Promise.all([
      distribuir({ ativoIds: [ids.f9] }),
      distribuir({ ativoIds: [ids.f9] }),
    ]);
    expect(respostas.map(({ statusCode }) => statusCode).sort()).toEqual([201, 400]);
    const recusada = respostas.find(({ statusCode }) => statusCode === 400);
    expect(recusada?.json().campos).toEqual({
      alvo: 'Todas as máquinas escolhidas já aguardam este pacote.',
    });
    const naFila = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ id: maquinasDasDistribuicoes.id })
        .from(maquinasDasDistribuicoes)
        .where(
          and(
            eq(maquinasDasDistribuicoes.ativoId, ids.f9 ?? ''),
            eq(maquinasDasDistribuicoes.situacao, 'aguardando'),
          ),
        ),
    );
    expect(naFila).toHaveLength(1);
  });

  it('a ficha da máquina: o pacote que ela já aguarda vem na fila, e o mandado que falhou traz a outra distribuição', async () => {
    const r = await cliente.consultar(`/ativos/${ids.f6}/software`, ana);
    expect(r.statusCode, r.body).toBe(200);
    const { mandados, pacotes: frente } = r.json().distribuir;
    expect(
      mandados.map(
        ({ distribuicaoId, situacao, aguardaNoutra }: Record<string, { chave?: string }>) => [
          distribuicaoId,
          situacao?.chave,
          aguardaNoutra,
        ],
      ),
    ).toEqual([
      [distribuicao.noite, 'aguardando', null],
      [distribuicao.manha, 'falhou', outraDa('noite')],
    ]);
    expect(
      frente.map(({ pacote, naFila }: { pacote: { nome: string }; naFila: boolean }) => [
        pacote.nome,
        naFila,
      ]),
    ).toEqual([
      ['Google Chrome', true],
      ['SumatraPDF', false],
    ]);
  });

  it('Máquina que já aguarda o pacote noutra distribuição: a que falhou traz a outra, e o tentar de novo é recusado até ela sair da fila', async () => {
    const ficha = await cliente.consultar(`/software/distribuicoes/${distribuicao.manha}`, ana);
    expect(ficha.statusCode, ficha.body).toBe(200);
    expect(
      ficha
        .json()
        .maquinasDaDistribuicao.map(
          ({ ativo, aguardaNoutra }: { ativo: { rotulo: string }; aguardaNoutra: unknown }) => [
            ativo.rotulo,
            aguardaNoutra,
          ],
        ),
    ).toEqual([
      ['Estação F10', null],
      ['Estação F6', outraDa('noite')],
      ['Estação F8', null],
    ]);

    const tentar = (chave: string) =>
      cliente.enviar(
        'POST',
        `/software/distribuicoes/${distribuicao.manha}/maquinas/${maquinaDa[`manha:${chave}`]}/tentar-de-novo`,
        ana,
      );
    const recusado = await tentar('f6');
    expect(recusado.statusCode, recusado.body).toBe(409);
    expect(recusado.json().detail).toBe('A máquina já aguarda este pacote noutra distribuição.');
    expect((await tentar('f8')).statusCode).toBe(200);

    // Fora da fila da noite, a da manhã pode tentar de novo.
    const tirada = await cliente.enviar(
      'POST',
      `/software/distribuicoes/${distribuicao.noite}/maquinas/${maquinaDa['noite:f6']}/tirar-da-fila`,
      ana,
    );
    expect(tirada.statusCode, tirada.body).toBe(200);
    const deNovo = await tentar('f6');
    expect(deNovo.statusCode, deNovo.body).toBe(200);
    expect(deNovo.json()).toMatchObject({ situacao: { chave: 'aguardando' }, aguardaNoutra: null });
  });

  it('o tentar de novo e a criação ao mesmo tempo: só um dos dois põe a máquina na fila', async () => {
    const [tentativa, criacao] = await Promise.all([
      cliente.enviar(
        'POST',
        `/software/distribuicoes/${distribuicao.manha}/maquinas/${maquinaDa['manha:f10']}/tentar-de-novo`,
        ana,
      ),
      distribuir({ ativoIds: [ids.f10] }),
    ]);
    // A que passou primeiro pela trava fica com a máquina, e a outra a vê na fila.
    expect([
      [200, 400],
      [409, 201],
    ]).toContainEqual([tentativa.statusCode, criacao.statusCode]);
    const naFila = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ id: maquinasDasDistribuicoes.id })
        .from(maquinasDasDistribuicoes)
        .where(
          and(
            eq(maquinasDasDistribuicoes.ativoId, ids.f10 ?? ''),
            eq(maquinasDasDistribuicoes.situacao, 'aguardando'),
          ),
        ),
    );
    expect(naFila).toHaveLength(1);
  });
});
