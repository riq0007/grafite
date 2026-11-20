// O fechamento do chamado (spec chamados, "Fechamento do chamado"; change chat-com-chamados, design,
// decisão 7, e tarefa 3.11): a tarefa fecha o resolvido vencido na meia-noite que começa o oitavo dia
// depois do dia da resolução, no fuso do horário da TI, com o evento `fechou` sem autor e o evento em
// tempo real, sem auditoria e sem notificação; o do dia e o reaberto ficam abertos, contando da
// última resolução; o resolvido antes desta versão fecha pela data dele; os lotes e duas execuções ao
// mesmo tempo fecham cada um uma vez; e as ações da TI no fechado são recusadas.
import { auditoria, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import { type ChamadosDeTeste, montarChamados } from '../../test/chamados.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';
import { type DefinicaoDeTarefa, tarefasDaApi } from '../fila/tarefas.ts';
import { fecharOsVencidos, TAREFA_DO_FECHAMENTO } from './fechamento.ts';

const host = 'grafite.chamados-fechamento.local';
/** A quarta, 11 de novembro de 2026, às 09:00 em São Paulo. */
const ABERTURA = new Date('2026-11-11T12:00:00.000Z');
/** O #1045 é resolvido em 11/11 às 11:20 e se reabre até 18/11. */
const RESOLUCAO = new Date('2026-11-11T14:20:00.000Z');
/** A meia-noite que começa 19/11 em São Paulo. */
const MEIA_NOITE_DO_DIA_19 = new Date('2026-11-19T03:00:00.000Z');
const HORA = 3_600_000;

let api: ApiDeTeste;
let c: ChamadosDeTeste;

/** Resolve o chamado direto no banco, como o resolver, no momento dado. */
const resolver = (numero: number, em: Date, de: ChamadosDeTeste = c) =>
  de.mudarChamado(numero, {
    situacao: 'resolvido',
    resolvidoEm: em,
    resolvidoPor: de.conta('ana'),
    relogioDesde: null,
  });

/** Reabre o chamado direto no banco, como o reabrir, que volta com Ana e o relógio contando. */
const reabrir = (numero: number, em: Date) =>
  c.mudarChamado(numero, {
    situacao: 'em-atendimento',
    resolvidoEm: null,
    resolvidoPor: null,
    relogioDesde: em,
  });

/** Abre o chamado de Marina e o resolve no momento dado. */
async function resolvidoEm(em: Date, de: ChamadosDeTeste = c): Promise<number> {
  const numero = await de.abrir(de.relato('marina'));
  await resolver(numero, em, de);
  return numero;
}

/** Os eventos `fechou` da conversa do chamado. */
const fechouNa = async (numero: number, de: ChamadosDeTeste = c) =>
  (await de.conversaDo(numero)).filter(({ evento }) => evento === 'fechou');

const fechar = (agora: Date, opcoes: { lote?: number } = {}) =>
  fecharOsVencidos(api.banco, c.org, { agora, ...opcoes });

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  c = await montarChamados(api, host);
  await c.entrar('ana');
});

describe('o fechamento', () => {
  it('o vencido fecha na meia-noite que começa o oitavo dia, com o fechou, sem auditoria e sem notificação', async () => {
    const numero = await resolvidoEm(RESOLUCAO);
    const antes = await c.lerChamado(numero);
    const notificacoes = await c.notificacoesDo(numero);
    const eventos = await c.eventosDo(numero);

    // Até 18/11 às 23:59:59.999, ainda se reabre.
    expect(await fechar(new Date(MEIA_NOITE_DO_DIA_19.getTime() - 1))).toEqual({ fechados: 0 });
    expect((await c.lerChamado(numero)).fechadoEm).toBeNull();

    // A tarefa que roda às 00:00:30 fecha com a meia-noite, e não com a hora em que rodou.
    expect(await fechar(new Date(MEIA_NOITE_DO_DIA_19.getTime() + 30_000))).toEqual({
      fechados: 1,
    });
    const depois = await c.lerChamado(numero);
    expect(depois).toMatchObject({
      situacao: 'resolvido',
      resolvidoEm: RESOLUCAO,
      fechadoEm: MEIA_NOITE_DO_DIA_19,
      // O fechamento não é uma ação: a versão fica.
      versao: antes.versao,
    });
    expect(await fechouNa(numero)).toEqual([
      expect.objectContaining({
        especie: 'evento',
        evento: 'fechou',
        autorConta: null,
        autorPessoa: null,
        dados: {},
        criadaEm: MEIA_NOITE_DO_DIA_19,
      }),
    ]);
    // O evento em tempo real a quem vê o chamado; nenhuma notificação, nenhuma auditoria.
    expect((await c.eventosDo(numero)).slice(eventos.length)).toEqual([
      {
        tipo: 'chamados.mudaram',
        alvoTipo: 'chamado',
        permissao: 'chamados.ver',
        locais: [c.locais.recepcao],
      },
    ]);
    expect(await c.notificacoesDo(numero)).toEqual(notificacoes);
    const auditado = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select({ acao: auditoria.acao })
        .from(auditoria)
        .where(eq(auditoria.alvoId, c.chamadoId(numero))),
    );
    expect(auditado.filter(({ acao }) => acao.includes('fech'))).toEqual([]);

    // A tarefa do minuto seguinte não fecha de novo.
    expect(await fechar(new Date(MEIA_NOITE_DO_DIA_19.getTime() + 90_000))).toEqual({
      fechados: 0,
    });
    expect(await fechouNa(numero)).toHaveLength(1);
  });

  it('o do dia e o reaberto ficam abertos, e o resolvido de novo conta da última resolução', async () => {
    // Resolvido em 18/11 às 11:00: fecha só no começo de 26/11.
    const doDia = await resolvidoEm(new Date('2026-11-18T14:00:00.000Z'));
    // Resolvido em 11/11 e reaberto: em atendimento, não fecha.
    const reaberto = await resolvidoEm(RESOLUCAO);
    await reabrir(reaberto, new Date(RESOLUCAO.getTime() + HORA));
    // Resolvido em 11/11, reaberto e resolvido de novo em 13/11: fecha no começo de 21/11.
    const deNovo = await resolvidoEm(RESOLUCAO);
    await reabrir(deNovo, new Date(RESOLUCAO.getTime() + HORA));
    await resolver(deNovo, new Date('2026-11-13T14:00:00.000Z'));

    await fechar(MEIA_NOITE_DO_DIA_19);
    for (const numero of [doDia, reaberto, deNovo]) {
      expect((await c.lerChamado(numero)).fechadoEm, `#${numero}`).toBeNull();
    }

    const comecoDo21 = new Date('2026-11-21T03:00:00.000Z');
    await fechar(comecoDo21);
    expect((await c.lerChamado(deNovo)).fechadoEm).toEqual(comecoDo21);
    expect((await c.lerChamado(doDia)).fechadoEm).toBeNull();

    const comecoDo26 = new Date('2026-11-26T03:00:00.000Z');
    await fechar(new Date(comecoDo26.getTime() - 1));
    expect((await c.lerChamado(doDia)).fechadoEm).toBeNull();
    await fechar(comecoDo26);
    expect((await c.lerChamado(doDia)).fechadoEm).toEqual(comecoDo26);
    expect(await c.lerChamado(reaberto)).toMatchObject({
      situacao: 'em-atendimento',
      fechadoEm: null,
    });
    expect(await fechouNa(reaberto)).toEqual([]);
  });

  it('o resolvido antes desta versão fecha pela data dele, sem migração', async () => {
    // Resolvido em 1º/9 às 09:00: fechou no começo de 9/9, e a tarefa o fecha com essa data.
    const antigo = await resolvidoEm(new Date('2026-09-01T12:00:00.000Z'));
    await fechar(ABERTURA);
    const noDia9 = new Date('2026-09-09T03:00:00.000Z');
    expect((await c.lerChamado(antigo)).fechadoEm).toEqual(noDia9);
    expect(await fechouNa(antigo)).toEqual([expect.objectContaining({ criadaEm: noDia9 })]);
  });
});

describe('os lotes', () => {
  let outra: ChamadosDeTeste;
  const fecharNaOutra = (agora: Date, lote?: number) =>
    fecharOsVencidos(api.banco, outra.org, { agora, ...(lote ? { lote } : {}) });

  beforeAll(async () => {
    outra = await montarChamados(api, 'grafite.chamados-fechamento-lotes.local');
    await outra.entrar('ana');
  });

  it('fecha todos os vencidos, de lote em lote', async () => {
    const numeros: number[] = [];
    for (let i = 0; i < 5; i++) numeros.push(await resolvidoEm(RESOLUCAO, outra));
    expect(await fecharNaOutra(MEIA_NOITE_DO_DIA_19, 2)).toEqual({ fechados: 5 });
    for (const numero of numeros) {
      expect((await outra.lerChamado(numero)).fechadoEm, `#${numero}`).toEqual(
        MEIA_NOITE_DO_DIA_19,
      );
      expect(await fechouNa(numero, outra)).toHaveLength(1);
    }
  });

  it('duas execuções ao mesmo tempo fecham cada chamado uma vez', async () => {
    const numeros: number[] = [];
    for (let i = 0; i < 4; i++) numeros.push(await resolvidoEm(RESOLUCAO, outra));
    const [uma, outraVez] = await Promise.all([
      fecharNaOutra(MEIA_NOITE_DO_DIA_19, 1),
      fecharNaOutra(MEIA_NOITE_DO_DIA_19, 1),
    ]);
    expect(uma.fechados + outraVez.fechados).toBe(4);
    for (const numero of numeros) {
      expect(await fechouNa(numero, outra), `#${numero}`).toHaveLength(1);
    }
  });
});

describe('a tarefa do fechamento', () => {
  const contexto = { tarefaId: 't', tentativa: 0, sinal: new AbortController().signal };

  /** A tarefa do catálogo da API, com o relógio dado, e os erros do log. */
  function tarefaAs(agora: Date) {
    const erros: unknown[] = [];
    const tarefa = tarefasDaApi({
      banco: api.banco,
      armazenamento: api.armazenamento,
      agora: () => agora,
      log: { info: () => {}, warn: () => {}, error: (dados) => erros.push(dados) },
      enviar: async () => null,
    }).find(({ nome }) => nome === TAREFA_DO_FECHAMENTO) as DefinicaoDeTarefa;
    return { tarefa, erros };
  }

  it('roda a cada minuto, na tela das rotinas, e fecha os vencidos de cada organização', async () => {
    const { tarefa, erros } = tarefaAs(new Date('2026-12-01T03:00:00.000Z'));
    expect(tarefa).toMatchObject({
      nome: TAREFA_DO_FECHAMENTO,
      agenda: { cron: '* * * * *', fuso: 'America/Sao_Paulo' },
      rotina: { nome: 'Fechamento dos chamados' },
    });
    expect(TAREFA_DO_FECHAMENTO).toBe('chamados.fechamento');
    const numero = await resolvidoEm(new Date('2026-11-20T14:00:00.000Z'));
    await tarefa.trabalho(undefined, contexto);
    expect(erros).toEqual([]);
    expect((await c.lerChamado(numero)).fechadoEm).toEqual(new Date('2026-11-28T03:00:00.000Z'));
  });

  it('pula a organização com o módulo Chamados desligado e fecha ao religar', async () => {
    const numero = await resolvidoEm(new Date('2026-11-21T14:00:00.000Z'));
    const noDia29 = new Date('2026-11-29T03:00:00.000Z');
    await desligarModulos(api, c.org, ['chamados']);
    try {
      await tarefaAs(new Date('2026-12-02T03:00:00.000Z')).tarefa.trabalho(undefined, contexto);
      expect((await c.lerChamado(numero)).fechadoEm).toBeNull();
      expect(await fecharOsVencidos(api.banco, c.org, { agora: noDia29 })).toEqual({
        fechados: 0,
      });
    } finally {
      await desligarModulos(api, c.org, []);
    }
    await tarefaAs(new Date('2026-12-02T03:01:00.000Z')).tarefa.trabalho(undefined, contexto);
    // Fecha com a data dele, e não com a do religar.
    expect((await c.lerChamado(numero)).fechadoEm).toEqual(noDia29);
  });
});

describe('as ações da TI no fechado', () => {
  it('o reabrir, a mensagem e a nota são recusados, também no vencido que a tarefa não fechou', async () => {
    const fechado = await resolvidoEm(RESOLUCAO);
    await fechar(MEIA_NOITE_DO_DIA_19);
    // Resolvido na mesma hora, depois da tarefa: vencido, sem o `fechado_em`, fechado pelo
    // `estaFechado`.
    const vencido = await resolvidoEm(RESOLUCAO);

    api.relogio.avancar(MEIA_NOITE_DO_DIA_19.getTime() + HORA - api.relogio.agora().getTime());
    await c.entrar('ana');
    for (const numero of [vencido, fechado]) {
      const versao = (await c.lerChamado(numero)).versao;
      for (const [acao, corpo] of [
        ['reabrir', { versao }],
        ['mensagem', { texto: 'Voltou a falhar?' }],
        ['nota', { texto: 'Só da TI.' }],
      ] as const) {
        const r = await c.cliente.enviar(
          'POST',
          `/chamados/${numero}/${acao}`,
          c.como('ana'),
          corpo,
        );
        expect(r.statusCode, `${acao} no #${numero}: ${r.body}`).toBe(409);
        expect(r.json().detail).toBe(`O chamado #${numero} está fechado.`);
      }
      expect(await c.lerChamado(numero)).toMatchObject({ situacao: 'resolvido', versao });
    }

    // A ficha diz Fechado e mostra o fechou, sem autor, com o último dia de reabrir.
    const ficha = await c.cliente.consultar(`/chamados/${fechado}`, c.como('ana'));
    expect(ficha.statusCode, ficha.body).toBe(200);
    expect(ficha.json()).toMatchObject({ fechado: true, reabrirAte: '2026-11-18' });
    expect(ficha.json().conversa.at(-1)).toMatchObject({
      especie: 'evento',
      evento: 'fechou',
      autor: null,
      em: MEIA_NOITE_DO_DIA_19.toISOString(),
    });
    expect((await c.cliente.consultar(`/chamados/${vencido}`, c.como('ana'))).json()).toMatchObject(
      { fechado: true, reabrirAte: '2026-11-18' },
    );
    expect((await c.lerChamado(vencido)).fechadoEm).toBeNull();
  });
});
