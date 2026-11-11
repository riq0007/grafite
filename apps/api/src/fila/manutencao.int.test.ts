// A manutenção diária (spec fila-de-tarefas; design do F2c, decisão 16): agendada às 3h30 de São
// Paulo, com a execução perdida recuperada uma vez, ela põe uma manutenção por organização, com a
// chave do dia. Cada uma apaga os eventos de mais de 24 h e, do armazenamento, os arquivos removidos,
// que ficam marcados, e guarda os agregados por hora das leituras antes de apagá-las (change
// p2b-impressoras-por-snmp, design, decisão 9). Ela apaga também as notificações de mais de 90 dias
// (change p3b-notificacoes-no-servidor, design, decisão 12), os alertas resolvidos há mais de 13
// meses (change p3d-indicadores, design, decisão 5) e os rascunhos dos cadastros parados há mais
// de 30 dias (change cadastro-em-etapas, design, decisão 10). Nada de auditoria, sessão ou outro
// registro de negócio sai, e rodar de novo dá o mesmo resultado.
import { createHash } from 'node:crypto';
import {
  alertas,
  aparelhosConfiaveis,
  arquivos,
  ativos,
  auditoria,
  coletores,
  contas,
  estadoDosAtivos,
  eventos,
  leituras,
  leiturasPorHora,
  locais,
  lotesDaColeta,
  naOrganizacao,
  notificacoes,
  pessoas,
  rascunhosDeCadastro,
  sessoes,
  tiposDeAtivo,
} from '@grafite/db';
import { asc, eq, sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';
import { criarAlerta, criarColetor, criarRegra } from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
} from '../../test/integracao.ts';
import { chaveDoArquivo, VARIANTES } from '../arquivos/armazenamento.ts';
import { criarFila, type FilaDeTarefas } from './fila.ts';
import { tarefasDaManutencao } from './manutencao.ts';
import { type ContextoDasTarefas, tarefasDaApi } from './tarefas.ts';

const HORA = 60 * 60_000;

let api: ApiDeTeste;
let org = '';
let anaId = '';
/**
 * As filas dos testes, com o catálogo da API, como na partida: a das falhas, que recebe as da
 * manutenção, é criada antes delas, sem depender de outro arquivo de teste no mesmo banco.
 */
const filas: FilaDeTarefas[] = [];

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: ['grafite.manutencao.local'] });
  await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  anaId = (await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' })).id;
  await clienteDaApi(api, 'grafite.manutencao.local').entrar('ana');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

// Cada fila para com o teste dela: nenhuma roda em segundo plano durante os outros.
afterEach(async () => {
  for (const fila of filas.splice(0)) await fila.parar();
});

const silencioso = { info: () => {}, warn: () => {}, error: () => {} };

function contexto(enviar: ContextoDasTarefas['enviar'] = vi.fn(async () => null)) {
  return {
    banco: api.banco,
    armazenamento: api.armazenamento,
    agora: api.relogio.agora,
    log: silencioso,
    enviar,
  } satisfies ContextoDasTarefas;
}

function tarefa(nome: string, de = contexto()) {
  const encontrada = tarefasDaManutencao(de).find((t) => t.nome === nome);
  if (!encontrada) throw new Error(`Falta a tarefa ${nome}.`);
  return encontrada;
}

const sinal = new AbortController().signal;
const manter = (orgId = org) =>
  tarefa('manutencao').trabalho({ orgId }, { tarefaId: 't', tentativa: 0, sinal });

/** Um evento incluído no momento dado. */
const eventoEm = (momento: Date) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(eventos)
      .values({ orgId: org, momento, tipo: 'padroes.mudaram', todas: true })
      .returning({ id: eventos.id });
    return linha?.id ?? '';
  });

/** Um arquivo com as variantes no armazenamento, removido ou não. */
async function arquivoGravado(removidoEm: Date | null) {
  const id = await naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(arquivos)
      .values({
        orgId: org,
        tipo: 'image/webp',
        bytes: 3,
        largura: 1,
        altura: 1,
        variantes: [...VARIANTES],
        removidoEm,
      })
      .returning({ id: arquivos.id });
    return linha?.id ?? '';
  });
  for (const variante of VARIANTES) {
    await api.armazenamento.gravar(chaveDoArquivo(org, id, variante), Buffer.from('img'));
  }
  return id;
}

const noArmazenamento = async (id: string) =>
  (
    await Promise.all(
      VARIANTES.map((variante) => api.armazenamento.abrir(chaveDoArquivo(org, id, variante))),
    )
  ).filter(Boolean).length;

const registro = (id: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx.select().from(arquivos).where(eq(arquivos.id, id));
    return linha;
  });

describe('a manutenção diária', () => {
  it('fica agendada às 3h30 de São Paulo, com a execução perdida recuperada uma vez', async () => {
    const fila = criarFila({
      conexao: inject('urlApp'),
      tarefas: tarefasDaApi(contexto()),
      avisar: () => {},
    });
    filas.push(fila);
    await fila.iniciar();
    const boss = new PgBoss({ connectionString: inject('urlApp'), schema: 'fila', migrate: false });
    await boss.start();
    try {
      expect(await boss.getSchedules('manutencao-diaria')).toMatchObject([
        { cron: '30 3 * * *', timezone: 'America/Sao_Paulo', options: { missed: 'once' } },
      ]);
    } finally {
      await boss.stop({ graceful: false });
    }
  });

  it('põe uma manutenção por organização, com a chave do dia, e não repete no mesmo dia', async () => {
    const enviados: { dados: unknown; chaveUnica?: string; unicaPor?: number }[] = [];
    const diaria = tarefa(
      'manutencao-diaria',
      contexto(async (_nome, dados, opcoes) => {
        enviados.push({ dados, ...opcoes });
        return null;
      }),
    );
    await diaria.trabalho(null, { tarefaId: 't', tentativa: 0, sinal });
    const { rows } = await api.banco.execute<{ id: string }>(
      sql`select id from app.organizacoes_para_tarefas() as t(id)`,
    );
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      api.relogio.agora(),
    );
    expect(enviados).toHaveLength(rows.length);
    expect(enviados).toContainEqual({
      dados: { orgId: org },
      chaveUnica: `${org}:${dia}`,
      unicaPor: 24 * 60 * 60,
    });
  });

  it('a chave do dia vale na fila: a segunda manutenção do dia não entra', async () => {
    let fila: FilaDeTarefas | undefined;
    const enviar: ContextoDasTarefas['enviar'] = (...argumentos) =>
      (fila as FilaDeTarefas).enviar(...argumentos);
    fila = criarFila({
      conexao: inject('urlApp'),
      tarefas: tarefasDaApi(contexto(enviar)),
      avisar: () => {},
    });
    filas.push(fila);
    await fila.iniciar();
    const chave = `${org}:teste-do-dia`;
    const primeira = await fila.enviar(
      'manutencao',
      { orgId: org },
      { chaveUnica: chave, unicaPor: 86_400 },
    );
    const segunda = await fila.enviar(
      'manutencao',
      { orgId: org },
      { chaveUnica: chave, unicaPor: 86_400 },
    );
    expect(primeira).toEqual(expect.any(String));
    expect(segunda).toBeNull();
  });

  it('apaga os eventos de mais de 24 h e deixa os mais novos', async () => {
    const agora = api.relogio.agora().getTime();
    const antigo = await eventoEm(new Date(agora - 25 * HORA));
    const recente = await eventoEm(new Date(agora - 23 * HORA));
    await manter();
    const ficaram = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ id: eventos.id }).from(eventos),
    );
    expect(ficaram.map((e) => e.id)).toEqual([recente]);
    expect(ficaram.map((e) => e.id)).not.toContain(antigo);
  });

  it('apaga do armazenamento os arquivos removidos e marca quando, e deixa os outros', async () => {
    const removido = await arquivoGravado(new Date(api.relogio.agora().getTime() - HORA));
    const emUso = await arquivoGravado(null);
    await manter();
    expect(await noArmazenamento(removido)).toBe(0);
    expect(await registro(removido)).toMatchObject({ apagadoEm: api.relogio.agora() });
    expect(await noArmazenamento(emUso)).toBe(VARIANTES.length);
    expect(await registro(emUso)).toMatchObject({ removidoEm: null, apagadoEm: null });
  });

  it('apaga as leituras e as chaves dos lotes com mais de 30 dias, sem tocar no estado atual', async () => {
    const DIA = 24 * HORA;
    const agora = api.relogio.agora().getTime();
    const { ativoId, coletorId } = await naOrganizacao(api.banco, org, async (tx) => {
      const [tipo] = await tx
        .insert(tiposDeAtivo)
        .values({
          orgId: org,
          nome: 'Impressora',
          nomeNormalizado: 'impressora',
          icone: 'impressora',
        })
        .returning({ id: tiposDeAtivo.id });
      const [ativo] = await tx
        .insert(ativos)
        .values({ orgId: org, tipoId: tipo?.id ?? '', busca: '' })
        .returning({ id: ativos.id });
      const [coletor] = await tx
        .insert(coletores)
        .values({
          orgId: org,
          nome: 'Servidor',
          nomeNormalizado: 'servidor',
          tokenHash: Buffer.from('hash'),
        })
        .returning({ id: coletores.id });
      return { ativoId: ativo?.id ?? '', coletorId: coletor?.id ?? '' };
    });
    const leitura = (dias: number) => ({
      orgId: org,
      ativoId,
      coletorId,
      metrica: 'rede.disponibilidade',
      momento: new Date(agora - dias * DIA),
      valorTexto: 'online',
      situacao: 'valida' as const,
    });
    await naOrganizacao(api.banco, org, async (tx) => {
      await tx.insert(leituras).values([leitura(31), leitura(31), leitura(29)]);
      await tx.insert(lotesDaColeta).values([
        {
          orgId: org,
          coletorId,
          chave: crypto.randomUUID(),
          gravadas: 2,
          ignoradas: 0,
          recebidoEm: new Date(agora - 31 * DIA),
        },
        {
          orgId: org,
          coletorId,
          chave: crypto.randomUUID(),
          gravadas: 1,
          ignoradas: 0,
          recebidoEm: new Date(agora - 29 * DIA),
        },
      ]);
      await tx.insert(estadoDosAtivos).values({
        ...leitura(31),
        desde: new Date(agora - 40 * DIA),
      });
    });
    await manter();
    const ficaram = await naOrganizacao(api.banco, org, async (tx) => ({
      leituras: (await tx.select({ momento: leituras.momento }).from(leituras)).map((l) =>
        l.momento.getTime(),
      ),
      lotes: (await tx.select({ id: lotesDaColeta.id }).from(lotesDaColeta)).length,
      estados: (await tx.select({ id: estadoDosAtivos.id }).from(estadoDosAtivos)).length,
    }));
    expect(ficaram).toEqual({ leituras: [agora - 29 * DIA], lotes: 1, estados: 1 });
  });

  it('apaga os alertas resolvidos há mais de 13 meses e deixa os mais novos, o aberto e a auditoria', async () => {
    const coletorId = await criarColetor(api, org, { nome: 'Coletor da manutenção' });
    const regraId = await criarRegra(api, org, {
      nome: 'Coletor sem contato',
      condicao: 'coletor.sem-contato',
      parametros: { minutos: 10 },
      duracao: 0,
      severidade: 'critico',
      escopo: { tipo: 'organizacao', id: null },
    });
    /** O momento de tantos meses e dias atrás, pelo calendário. */
    const atras = (meses: number, dias = 0) => {
      const momento = new Date(api.relogio.agora());
      momento.setUTCMonth(momento.getUTCMonth() - meses);
      momento.setUTCDate(momento.getUTCDate() - dias);
      return momento;
    };
    const resolvido = (texto: string, terminou: Date) =>
      criarAlerta(api, org, {
        regraId,
        coletorId,
        texto,
        observadoEm: new Date(terminou.getTime() - HORA),
        abertoEm: new Date(terminou.getTime() - HORA),
        situacao: 'resolvido',
        resolvidoEm: terminou,
        comoTerminou: 'voltou-ao-normal',
      });
    // Alerta resolvido há mais de 13 meses: sai, mas o reconhecimento dele fica na auditoria.
    const antigo = await resolvido('Resolvido há 13 meses e 1 dia', atras(13, 1));
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(auditoria).values({
        orgId: org,
        momento: atras(13, 2),
        acao: 'alerta.reconhecido',
        atorTipo: 'conta',
        atorContaId: anaId,
        alvoTipo: 'alerta',
        alvoId: antigo,
      }),
    );
    const recente = await resolvido('Resolvido há 12 meses', atras(12));
    // Alerta aberto há muito tempo: continua aberto.
    const aberto = await criarAlerta(api, org, {
      regraId,
      coletorId,
      texto: 'Aberto há 14 meses',
      observadoEm: atras(14),
      abertoEm: atras(14),
    });

    await manter();
    const ficaram = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ id: alertas.id }).from(alertas),
    );
    expect(ficaram.map(({ id }) => id).sort()).toEqual([recente, aberto].sort());
    const doAntigo = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ acao: auditoria.acao }).from(auditoria).where(eq(auditoria.alvoId, antigo)),
    );
    expect(doAntigo).toEqual([{ acao: 'alerta.reconhecido' }]);

    // Manutenção repetida: nada mais sai.
    await manter();
    const deNovo = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ id: alertas.id }).from(alertas),
    );
    expect(deNovo).toHaveLength(2);
  });

  it('apaga as notificações de mais de 90 dias, lidas ou não, e deixa as mais novas', async () => {
    const agora = api.relogio.agora().getTime();
    const DIA = 24 * HORA;
    const gravar = (titulo: string, dias: number, lida: boolean) =>
      naOrganizacao(api.banco, org, (tx) =>
        tx.insert(notificacoes).values({
          orgId: org,
          contaId: anaId,
          severidade: 'info',
          titulo,
          origem: 'Alertas',
          criadaEm: new Date(agora - dias * DIA),
          lidaEm: lida ? new Date(agora - dias * DIA) : null,
        }),
      );
    await gravar('Antiga lida', 91, true);
    await gravar('Antiga não lida', 91, false);
    await gravar('Recente', 89, false);
    await manter();
    const ficaram = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ titulo: notificacoes.titulo }).from(notificacoes),
    );
    expect(ficaram).toEqual([{ titulo: 'Recente' }]);
  });

  it('apaga os rascunhos dos cadastros parados há mais de 30 dias e deixa os mais novos', async () => {
    const agora = api.relogio.agora().getTime();
    const DIA = 24 * HORA;
    const bia = (await criarConta(api, org, { usuario: 'bia', nome: 'Bia Rocha' })).id;
    const gravar = (contaId: string, dias: number) =>
      naOrganizacao(api.banco, org, (tx) =>
        tx.insert(rascunhosDeCadastro).values({
          orgId: org,
          contaId,
          cadastro: 'ativo',
          conteudo: { etapa: 'tipo' },
          atualizadoEm: new Date(agora - dias * DIA),
        }),
      );
    await gravar(anaId, 31);
    await gravar(bia, 29);
    const restantes = () =>
      naOrganizacao(api.banco, org, (tx) =>
        tx.select({ contaId: rascunhosDeCadastro.contaId }).from(rascunhosDeCadastro),
      );
    await manter();
    expect(await restantes()).toEqual([{ contaId: bia }]);
    await manter();
    expect(await restantes()).toEqual([{ contaId: bia }]);
  });

  // Change aparelho-confiavel, design, decisão 5: o aparelho vale no máximo 90 dias, o teto do
  // prazo, contados da marcação, e o uso não renova.
  it('apaga os aparelhos confiáveis marcados há mais de 90 dias e deixa os mais novos', async () => {
    const agora = api.relogio.agora().getTime();
    const DIA = 24 * HORA;
    const marcar = (dispositivo: string, dias: number) =>
      naOrganizacao(api.banco, org, (tx) =>
        tx.insert(aparelhosConfiaveis).values({
          orgId: org,
          contaId: anaId,
          tokenHash: createHash('sha256').update(dispositivo).digest(),
          dispositivo,
          criadoEm: new Date(agora - dias * DIA),
          usadoEm: new Date(agora - DIA),
        }),
      );
    await marcar('Chrome no Windows', 91);
    await marcar('Edge no Windows', 89);
    const restantes = () =>
      naOrganizacao(api.banco, org, (tx) =>
        tx.select({ dispositivo: aparelhosConfiaveis.dispositivo }).from(aparelhosConfiaveis),
      );
    await manter();
    expect(await restantes()).toEqual([{ dispositivo: 'Edge no Windows' }]);
  });

  it('a segunda execução não dá erro e não muda nada', async () => {
    const removido = await arquivoGravado(api.relogio.agora());
    await manter();
    const depoisDaPrimeira = await registro(removido);
    api.relogio.avancar(HORA);
    await expect(manter()).resolves.toBeUndefined();
    expect(await registro(removido)).toEqual(depoisDaPrimeira);
  });

  it('não apaga auditoria, sessão nem registro de negócio', async () => {
    const contar = () =>
      naOrganizacao(api.banco, org, async (tx) => ({
        auditoria: (await tx.select({ id: auditoria.id }).from(auditoria)).length,
        sessoes: (await tx.select({ id: sessoes.id }).from(sessoes)).length,
        pessoas: (await tx.select({ id: pessoas.id }).from(pessoas)).length,
        contas: (await tx.select({ id: contas.id }).from(contas)).length,
        locais: (await tx.select({ id: locais.id }).from(locais)).length,
      }));
    const antes = await contar();
    expect(antes.auditoria).toBeGreaterThan(0);
    api.relogio.avancar(30 * 24 * HORA);
    await manter();
    expect(await contar()).toEqual(antes);
  });
});

// Os agregados por hora (spec leituras-e-estado, "Agregados por hora", e fila-de-tarefas; change
// p2b-impressoras-por-snmp, design, decisão 9). Cada caso numa organização própria, sem os agregados
// dos outros.
describe('os agregados por hora', () => {
  let nomes = 0;
  /** Uma organização com uma impressora e o coletor dela, sem leituras. */
  async function organizacaoComImpressora() {
    nomes += 1;
    const orgId = await criarOrganizacao(api, {
      nome: `Agregados ${nomes}`,
      enderecos: [`grafite.agregados-${nomes}.local`],
    });
    const ids = await naOrganizacao(api.banco, orgId, async (tx) => {
      const [tipo] = await tx
        .insert(tiposDeAtivo)
        .values({ orgId, nome: 'Impressora', nomeNormalizado: 'impressora', icone: 'impressora' })
        .returning({ id: tiposDeAtivo.id });
      const [ativo] = await tx
        .insert(ativos)
        .values({ orgId, tipoId: tipo?.id ?? '', busca: '' })
        .returning({ id: ativos.id });
      const [coletor] = await tx
        .insert(coletores)
        .values({
          orgId,
          nome: 'Servidor',
          nomeNormalizado: 'servidor',
          tokenHash: Buffer.from(`hash ${nomes}`),
        })
        .returning({ id: coletores.id });
      return { ativoId: ativo?.id ?? '', coletorId: coletor?.id ?? '' };
    });
    /** O começo da hora, `horas` antes da hora em curso. */
    const hora = (horas: number) =>
      new Date(Math.floor(api.relogio.agora().getTime() / HORA) * HORA - horas * HORA);
    const leitura = (
      momento: Date,
      valorNumero: number | null,
      {
        metrica = 'impressora.contador',
        item = '1',
        situacao = 'valida',
      }: { metrica?: string; item?: string; situacao?: 'valida' | 'sem-dado' } = {},
    ) => ({
      orgId,
      ativoId: ids.ativoId,
      coletorId: ids.coletorId,
      metrica,
      item,
      momento,
      valorNumero,
      situacao,
    });
    const gravar = (linhas: ReturnType<typeof leitura>[]) =>
      naOrganizacao(api.banco, orgId, (tx) => tx.insert(leituras).values(linhas));
    const agregados = () =>
      naOrganizacao(api.banco, orgId, (tx) =>
        tx
          .select({
            metrica: leiturasPorHora.metrica,
            item: leiturasPorHora.item,
            hora: leiturasPorHora.hora,
            leituras: leiturasPorHora.leituras,
            validas: leiturasPorHora.validas,
            minimo: leiturasPorHora.minimo,
            maximo: leiturasPorHora.maximo,
            media: leiturasPorHora.media,
            ultimo: leiturasPorHora.ultimo,
            ultimoMomento: leiturasPorHora.ultimoMomento,
          })
          .from(leiturasPorHora)
          .orderBy(asc(leiturasPorHora.hora), asc(leiturasPorHora.metrica)),
      );
    return { orgId, ...ids, hora, leitura, gravar, agregados };
  }

  it('guarda de cada hora completa as contagens, o mínimo, o máximo, a média e o último valor', async () => {
    const { orgId, hora, leitura, gravar, agregados } = await organizacaoComImpressora();
    const inicio = hora(5);
    const minutos = (m: number) => new Date(inicio.getTime() + m * 60_000);
    await gravar(
      [12400, 12420, 12440, 12460, 12480, 12500].map((paginas, i) =>
        leitura(minutos(i * 10), paginas),
      ),
    );
    await manter(orgId);
    expect(await agregados()).toEqual([
      {
        metrica: 'impressora.contador',
        item: '1',
        hora: inicio,
        leituras: 6,
        validas: 6,
        minimo: 12400,
        maximo: 12500,
        media: 12450,
        ultimo: 12500,
        ultimoMomento: minutos(50),
      },
    ]);
  });

  it('a hora sem leitura válida fica sem os valores, nunca com zero', async () => {
    const { orgId, hora, leitura, gravar, agregados } = await organizacaoComImpressora();
    const latencia = { metrica: 'rede.latencia', item: '', situacao: 'sem-dado' as const };
    await gravar([
      leitura(hora(3), null, latencia),
      leitura(new Date(hora(3).getTime() + 120_000), null, latencia),
    ]);
    await manter(orgId);
    expect(await agregados()).toEqual([
      {
        metrica: 'rede.latencia',
        item: '',
        hora: hora(3),
        leituras: 2,
        validas: 0,
        minimo: null,
        maximo: null,
        media: null,
        ultimo: null,
        ultimoMomento: null,
      },
    ]);
  });

  it('a hora em curso fica para depois, e agregar de novo dá o mesmo resultado', async () => {
    const { orgId, hora, leitura, gravar, agregados } = await organizacaoComImpressora();
    await gravar([leitura(hora(2), 100), leitura(new Date(hora(0).getTime() + 60_000), 200)]);
    await manter(orgId);
    const primeira = await agregados();
    expect(primeira.map((agregado) => agregado.hora)).toEqual([hora(2)]);
    await manter(orgId);
    expect(await agregados()).toEqual(primeira);
  });

  it('agrega as leituras de 31 dias antes de apagá-las, e apaga os agregados de mais de 13 meses', async () => {
    const { orgId, ativoId, hora, leitura, gravar, agregados } = await organizacaoComImpressora();
    const DIA = 24 * HORA;
    const antiga = new Date(hora(0).getTime() - 31 * DIA);
    await gravar([leitura(antiga, 10), leitura(new Date(antiga.getTime() + 60_000), 20)]);
    const agregado = (meses: number) => {
      const momento = new Date(hora(0));
      momento.setUTCMonth(momento.getUTCMonth() - meses);
      return {
        orgId,
        ativoId,
        metrica: 'impressora.contador',
        item: '2',
        hora: momento,
        leituras: 1,
        validas: 1,
        minimo: 1,
        maximo: 1,
        media: 1,
        ultimo: 1,
        ultimoMomento: momento,
      };
    };
    await naOrganizacao(api.banco, orgId, (tx) =>
      tx.insert(leiturasPorHora).values([agregado(14), agregado(12)]),
    );
    await manter(orgId);
    const ficaram = await agregados();
    expect(ficaram.map(({ item, hora: daHora }) => [item, daHora])).toEqual([
      ['2', agregado(12).hora],
      ['1', antiga],
    ]);
    expect(ficaram.find((um) => um.item === '1')).toMatchObject({ leituras: 2, ultimo: 20 });
    const restantes = await naOrganizacao(api.banco, orgId, (tx) =>
      tx.select({ id: leituras.id }).from(leituras),
    );
    expect(restantes).toEqual([]);
  });
});
