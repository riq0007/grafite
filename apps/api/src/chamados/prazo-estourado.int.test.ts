// A verificação do prazo (spec chamados, "Prazo estourado"; change chamados-da-ti, design, decisão 12,
// "A tarefa do prazo (tarefa 4.19)"): o chamado com o relógio contando que passou do vencimento é
// avisado uma vez, a quem atende ou a quem atende os locais, e marcado; o parado e o de prazo
// estragado ficam de fora; o reaberto é avisado de novo; e a tarefa pula a organização com o módulo
// Chamados desligado. Quem recebe em cada caso é do domínio (`notificacoesDoEstouro`).
import { naOrganizacao, notificacoes } from '@grafite/db';
import type { PrazoDoChamado } from '@grafite/domain';
import { and, eq, like } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import { type ChamadosDeTeste, montarChamados } from '../../test/chamados.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';
import { type DefinicaoDeTarefa, tarefasDaApi } from '../fila/tarefas.ts';
import { TAREFA_DA_ENTREGA } from '../notificacoes/entrega.ts';
import { avisarPrazosEstourados, TAREFA_DO_PRAZO } from './prazo-estourado.ts';

const host = 'grafite.chamados-prazo-estourado.local';
/** A terça, 17 de novembro de 2026, às 09:00 em São Paulo. */
const ABERTURA = new Date('2026-11-17T12:00:00.000Z');
const MINUTO = 60_000;
/** 2 h corridas para resolver, que vencem às 11:00. */
const DUAS_HORAS: PrazoDoChamado = {
  modo: 'corridas',
  respostaMin: 30,
  resolucaoMin: 120,
  resposta: { valor: 30, unidade: 'min' },
  resolucao: { valor: 2, unidade: 'h' },
};

let api: ApiDeTeste;
let c: ChamadosDeTeste;

/** O momento a tantos minutos da abertura. */
const aos = (minutos: number) => new Date(ABERTURA.getTime() + minutos * MINUTO);

/** Abre o chamado como Ana, com o relógio de 2 h contando desde a abertura. */
async function abrirComDuasHoras(corpo: object, em: ChamadosDeTeste = c): Promise<number> {
  const numero = await em.abrir(corpo);
  await em.mudarChamado(numero, { prazo: { ...DUAS_HORAS }, contadoS: 0, relogioDesde: ABERTURA });
  return numero;
}

/** A verificação da organização, a tantos minutos da abertura. */
const verificar = (minutos: number) =>
  avisarPrazosEstourados(api.banco, c.org, { agora: aos(minutos) });

/** Os avisos do estouro do chamado, com quem recebeu pelo usuário. */
const avisosDo = async (numero: number, em: ChamadosDeTeste = c) =>
  (await em.notificacoesDo(numero)).filter(({ titulo }) => titulo.includes('passou do prazo'));

const aviso = async (numero: number, usuario: string, em: ChamadosDeTeste = c) => {
  const { titulo } = await em.lerChamado(numero);
  return { usuario, titulo: `Chamado #${numero} passou do prazo: ${titulo}` };
};

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  c = await montarChamados(api, host);
  await c.entrar('ana');
});

describe('a verificação do prazo', () => {
  it('o estourado é avisado uma vez, a quem atende, no vencimento, na severidade Atenção', async () => {
    const numero = await abrirComDuasHoras(c.relato('marina'));
    await verificar(119);
    expect(await avisosDo(numero)).toEqual([]);
    expect((await c.lerChamado(numero)).estouroAvisadoEm).toBeNull();

    expect(await verificar(120)).toEqual({ avisados: 1 });
    expect(await avisosDo(numero)).toEqual([await aviso(numero, 'ana')]);
    expect((await c.lerChamado(numero)).estouroAvisadoEm).toEqual(aos(120));
    const [gravado] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select({
          severidade: notificacoes.severidade,
          origem: notificacoes.origem,
          criadaEm: notificacoes.criadaEm,
        })
        .from(notificacoes)
        .where(
          and(
            eq(notificacoes.destino, `/chamados/${numero}`),
            like(notificacoes.titulo, '%passou do prazo%'),
          ),
        ),
    );
    expect(gravado).toEqual({ severidade: 'atencao', origem: 'Chamados', criadaEm: aos(120) });

    // A verificação do minuto seguinte não avisa de novo.
    expect(await verificar(121)).toEqual({ avisados: 0 });
    expect(await avisosDo(numero)).toHaveLength(1);
  });

  it('duas verificações ao mesmo tempo avisam uma vez', async () => {
    const numero = await abrirComDuasHoras(c.relato('marina'));
    const [uma, outra] = await Promise.all([verificar(120), verificar(120)]);
    expect(uma.avisados + outra.avisados).toBe(1);
    expect(await avisosDo(numero)).toHaveLength(1);
  });

  it('na triagem, ou com quem não atende mais, avisa cada conta que atende os locais', async () => {
    // Fernanda é do Administrativo, em Campinas: Ana, Elisa e Lívia, que administra, atendem;
    // Diego não.
    const naTriagem = await abrirComDuasHoras(c.relato('fernanda', { ficaComigo: false }));
    expect((await c.lerChamado(naTriagem)).situacao).toBe('triagem');
    // Marina é da Recepção, em Jundiaí, e o chamado está com Elisa, que só atende Campinas.
    const comElisa = await abrirComDuasHoras(c.relato('marina'));
    await c.mudarChamado(comElisa, { responsavelId: c.conta('elisa') });
    expect(await verificar(120)).toEqual({ avisados: 2 });
    expect(await avisosDo(naTriagem)).toEqual([
      await aviso(naTriagem, 'ana'),
      await aviso(naTriagem, 'elisa'),
      await aviso(naTriagem, 'livia'),
    ]);
    expect(await avisosDo(comElisa)).toEqual([
      await aviso(comElisa, 'ana'),
      await aviso(comElisa, 'diego'),
      await aviso(comElisa, 'livia'),
    ]);

    // E o de Diego, que atende Jundiaí, com a conta inativa.
    const comDiego = await abrirComDuasHoras(c.relato('otavio'));
    await c.mudarChamado(comDiego, { responsavelId: c.conta('diego') });
    await c.mudarConta('diego', 'inativa');
    try {
      expect(await verificar(121)).toEqual({ avisados: 1 });
    } finally {
      await c.mudarConta('diego', 'ativa');
    }
    expect(await avisosDo(comDiego)).toEqual([
      await aviso(comDiego, 'ana'),
      await aviso(comDiego, 'livia'),
    ]);
  });

  it('o parado não é avisado, e o de prazo estragado é pulado sem derrubar os outros', async () => {
    const parado = await abrirComDuasHoras(c.relato('marina'));
    await c.mudarChamado(parado, {
      situacao: 'aguardando',
      relogioDesde: null,
      contadoS: 3 * 60 * 60,
    });
    const estragado = await abrirComDuasHoras(c.relato('marina'));
    await c.mudarChamado(estragado, { prazo: { modo: 'corridas' } });
    const estourado = await abrirComDuasHoras(c.relato('marina'));

    expect(await verificar(180)).toEqual({ avisados: 1 });
    expect(await avisosDo(parado)).toEqual([]);
    expect(await avisosDo(estragado)).toEqual([]);
    expect((await c.lerChamado(estragado)).estouroAvisadoEm).toBeNull();
    expect(await avisosDo(estourado)).toEqual([await aviso(estourado, 'ana')]);
  });

  it('o reaberto volta a contar já vencido e é avisado de novo', async () => {
    const numero = await abrirComDuasHoras(c.relato('marina'));
    await verificar(120);
    // Ana resolve às 11:05 e reabre às 11:10.
    api.relogio.avancar(125 * MINUTO);
    await c.entrar('ana');
    const resolvido = await c.cliente.enviar(
      'POST',
      `/chamados/${numero}/resolver`,
      c.como('ana'),
      {
        feito: 'Troquei a cadeira.',
      },
    );
    expect(resolvido.statusCode, resolvido.body).toBe(200);
    expect(await verificar(126)).toEqual({ avisados: 0 });
    api.relogio.avancar(5 * MINUTO);
    const reaberto = await c.cliente.enviar('POST', `/chamados/${numero}/reabrir`, c.como('ana'), {
      versao: resolvido.json().versao,
    });
    expect(reaberto.statusCode, reaberto.body).toBe(200);
    expect((await c.lerChamado(numero)).estouroAvisadoEm).toBeNull();

    expect(await verificar(130)).toEqual({ avisados: 1 });
    expect(await avisosDo(numero)).toEqual([
      await aviso(numero, 'ana'),
      await aviso(numero, 'ana'),
    ]);
  });
});

describe('a tarefa do prazo', () => {
  const contexto = { tarefaId: 't', tentativa: 0, sinal: new AbortController().signal };

  /**
   * A tarefa do catálogo da API, com o relógio dado, as tarefas que ela põe na fila e o log; a fila
   * pode falhar.
   */
  function tarefaAos(minutos: number, { falhas = 0 } = {}) {
    const enviadas: string[] = [];
    const erros: unknown[] = [];
    let falta = falhas;
    const tarefa = tarefasDaApi({
      banco: api.banco,
      armazenamento: api.armazenamento,
      agora: () => aos(minutos),
      log: { info: () => {}, warn: () => {}, error: (dados) => erros.push(dados) },
      enviar: async (nome) => {
        if (falta-- > 0) throw new Error('A fila não respondeu.');
        enviadas.push(nome);
        return null;
      },
    }).find(({ nome }) => nome === TAREFA_DO_PRAZO) as DefinicaoDeTarefa;
    return { tarefa, enviadas, erros };
  }

  it('roda a cada minuto, na tela das rotinas, e pede a entrega pelo e-mail e pelo push', async () => {
    const { tarefa, enviadas, erros } = tarefaAos(10_000);
    expect(tarefa).toMatchObject({
      nome: TAREFA_DO_PRAZO,
      agenda: { cron: '* * * * *', fuso: 'America/Sao_Paulo' },
      rotina: { nome: 'Prazo dos chamados' },
    });
    expect(TAREFA_DO_PRAZO).toBe('chamados.prazo');
    const numero = await abrirComDuasHoras(c.relato('marina'));
    await tarefa.trabalho(undefined, contexto);
    expect(erros).toEqual([]);
    expect(await avisosDo(numero)).toEqual([await aviso(numero, 'ana')]);
    expect(enviadas).toContain(TAREFA_DA_ENTREGA);
  });

  it('pula a organização com o módulo Chamados desligado e avisa ao religar', async () => {
    const numero = await abrirComDuasHoras(c.relato('marina'));
    await desligarModulos(api, c.org, ['chamados']);
    try {
      await tarefaAos(20_000).tarefa.trabalho(undefined, contexto);
      expect(await avisosDo(numero)).toEqual([]);
      expect((await c.lerChamado(numero)).estouroAvisadoEm).toBeNull();
    } finally {
      await desligarModulos(api, c.org, []);
    }
    await tarefaAos(20_001).tarefa.trabalho(undefined, contexto);
    expect(await avisosDo(numero)).toEqual([await aviso(numero, 'ana')]);
  });

  it('a falha de uma organização é desfeita e fica no log, sem segurar as outras', async () => {
    const outra = await montarChamados(api, 'grafite.chamados-prazo-estourado-outra.local');
    await outra.entrar('ana');
    const chamados = [
      { em: c, numero: await abrirComDuasHoras(c.relato('marina')) },
      { em: outra, numero: await abrirComDuasHoras(outra.relato('marina'), outra) },
    ];
    // A primeira organização que pede a entrega encontra a fila fora do ar.
    const { tarefa, erros } = tarefaAos(25_000, { falhas: 1 });
    await tarefa.trabalho(undefined, contexto);

    const marcas = await Promise.all(
      chamados.map(async ({ em, numero }) => (await em.lerChamado(numero)).estouroAvisadoEm),
    );
    const falhou = marcas.indexOf(null);
    const avisou = 1 - falhou;
    expect(marcas[avisou]).toEqual(aos(25_000));
    expect(erros).toEqual([
      expect.objectContaining({
        orgId: chamados[falhou]?.em.org,
        err: expect.objectContaining({ message: 'A fila não respondeu.' }),
      }),
    ]);
    const daFalha = chamados[falhou] as (typeof chamados)[number];
    const doAviso = chamados[avisou] as (typeof chamados)[number];
    expect(await avisosDo(daFalha.numero, daFalha.em)).toEqual([]);
    expect(await avisosDo(doAviso.numero, doAviso.em)).toEqual([
      await aviso(doAviso.numero, 'ana', doAviso.em),
    ]);

    // A do minuto seguinte avisa a que falhou.
    await tarefaAos(25_001).tarefa.trabalho(undefined, contexto);
    expect(await avisosDo(daFalha.numero, daFalha.em)).toEqual([
      await aviso(daFalha.numero, 'ana', daFalha.em),
    ]);
  });
});

describe('a marca', () => {
  it('não sobe a versão nem grava na conversa', async () => {
    const numero = await abrirComDuasHoras(c.relato('marina'));
    const antes = await c.lerChamado(numero);
    const conversa = await c.conversaDo(numero);
    const eventos = await c.eventosDo(numero);
    await verificar(30_000);
    expect(await c.lerChamado(numero)).toEqual({ ...antes, estouroAvisadoEm: aos(30_000) });
    expect(await c.conversaDo(numero)).toEqual(conversa);
    expect(await c.eventosDo(numero)).toEqual(eventos);
  });
});
