// Os indicadores da operação pela API (spec indicadores-da-operacao, "Tempo de resolução das OS",
// "OS repetidas", "Páginas por toner" e "Quem vê os indicadores da operação"; change
// p4f-indicadores-da-operacao, design, decisões 1, 2 e 9): as OS e as saídas gravadas no banco,
// calculadas com o que cada conta vê.
import { consumiveis, eventos, naOrganizacao } from '@grafite/db';
import type { Permissao } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gravarEstado } from '../../test/alertas.ts';
import { definirSaldo } from '../../test/estoque.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  criarConta,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';
import { montarOrdens, type OrdensDeTeste } from '../../test/ordens.ts';
import type { UsuarioDasSolicitacoes } from '../../test/solicitacoes.ts';

const host = 'grafite.indicadores-da-operacao.local';

const DIA = 24 * 60 * 60 * 1000;
const MINUTOS_DO_DIA = 24 * 60;

let api: ApiDeTeste;
let s: OrdensDeTeste;
/** Gil atende as OS só em Jundiaí, sem o estoque; Hugo só vê o estoque de Jundiaí. */
const outras: Record<'gil' | 'hugo', Entrada> = {
  gil: { cookie: '', csrf: '' },
  hugo: { cookie: '', csrf: '' },
};

/** As OS do período: duas no NB-0031, uma na PAT-00412 e uma em Campinas, ainda aberta. */
const os = { naoLiga: 0, deNovo: 0, papel: 0, deCampinas: 0 };

const enviar = (caminho: string, corpo: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('POST', caminho, s.entradas[usuario], corpo);

const indicadores = (entrada: Entrada) => s.cliente.consultar('/operacao/indicadores', entrada);

async function abrir(ativo: string, problema: string, usuario: UsuarioDasSolicitacoes = 'carla') {
  return (await enviar('/ordens', { ativo, problema }, usuario)).json().numero as number;
}

async function resolver(numero: number) {
  expect((await enviar(`/ordens/${numero}/resolucao`, { solucao: 'Feito' })).statusCode).toBe(200);
}

/** A troca do toner preto da PAT-00412, com o total de páginas lido na hora. */
async function trocarToner(totalDePaginas: number) {
  await gravarEstado(api, s.org, {
    ativoId: s.ativos.pat00412,
    coletorId: s.coletor,
    metrica: 'impressora.contador',
    item: '1',
    momento: api.relogio.agora(),
    valorNumero: totalDePaginas,
  });
  const r = await enviar('/estoque/saidas', {
    consumivel: s.consumiveis.cf258a,
    quantidade: 1,
    origem: s.locais.almoxarifado,
    ativo: s.ativos.pat00412,
  });
  expect(r.statusCode).toBe(201);
}

/** Avança o relógio e entra de novo, porque a sessão parada expira. */
async function avancar(ms: number) {
  api.relogio.avancar(ms);
  for (const usuario of ['ana', 'carla', 'davi'] as const) {
    s.entradas[usuario] = await s.cliente.entrar(usuario);
  }
  for (const usuario of ['gil', 'hugo'] as const) {
    outras[usuario] = await s.cliente.entrar(usuario);
  }
}

async function contaCom(usuario: 'gil' | 'hugo', permissoes: Permissao[]) {
  const perfil = await criarPerfil(api, s.org, { nome: `Perfil de ${usuario}`, permissoes });
  const { id } = await criarConta(api, s.org, { usuario });
  await atribuir(api, s.org, { perfilId: perfil, contaId: id, localId: s.locais.jundiai });
  outras[usuario] = await s.cliente.entrar(usuario);
}

beforeAll(async () => {
  api = await abrirApi();
  s = await montarOrdens(api, host);
  await contaCom('gil', ['ordens.atender']);
  await contaCom('hugo', ['estoque.ver']);
  await naOrganizacao(api.banco, s.org, (tx) =>
    tx
      .update(consumiveis)
      .set({ rendimento: 3000 })
      .where(eq(consumiveis.id, s.consumiveis.cf258a)),
  );
  await definirSaldo(api, s.org, {
    consumivelId: s.consumiveis.cf258a,
    localId: s.locais.almoxarifado,
    saldo: 10,
  });

  // O primeiro toner entra com 40.000 páginas, e as quatro OS abrem juntas.
  await trocarToner(40_000);
  os.naoLiga = await abrir(s.ativos.nb0031, 'Não liga');
  os.deNovo = await abrir(s.ativos.nb0031, 'Não liga de novo');
  os.papel = await abrir(s.ativos.pat00412, 'Atolando papel');
  os.deCampinas = await abrir(s.ativos.deCampinas, 'Sem rede', 'ana');
  // As resolvidas depois de 1, de 2 e de 6 dias; a de Campinas fica aberta.
  await avancar(DIA);
  await resolver(os.naoLiga);
  await avancar(DIA);
  await resolver(os.deNovo);
  await avancar(4 * DIA);
  await resolver(os.papel);
  // O toner é trocado com 41.850 páginas: rendeu 1.850 das 3.000.
  await trocarToner(41_850);
  // O período vai até antes do momento da consulta: a consulta vem um minuto depois.
  await avancar(60_000);
});

afterAll(async () => {
  await api?.fechar();
});

describe('os indicadores da operação', () => {
  it('Mediana das OS resolvidas: a mediana, a lista com a em aberto e a demorada, e as OS repetidas', async () => {
    const r = await indicadores(s.entradas.ana);
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.permite).toEqual({ mudarMeta: true });
    expect(corpo.indicadores['resolucao-das-os']).toMatchObject({
      meta: 3 * MINUTOS_DO_DIA,
      metaDeFabrica: 3 * MINUTOS_DO_DIA,
      valor: 2 * MINUTOS_DO_DIA,
      base: 3,
      situacao: 'dentro',
      mais: 0,
    });
    expect(
      corpo.indicadores['resolucao-das-os'].itens.map(
        (item: { ordem: { numero: number }; emAberto: boolean; minutos: number }) => [
          item.ordem.numero,
          item.emAberto,
          // A em aberto conta até a consulta, um minuto depois da última resolução.
          Math.round(item.minutos / MINUTOS_DO_DIA),
        ],
      ),
    ).toEqual([
      [os.deCampinas, true, 6],
      [os.papel, false, 6],
    ]);
    expect(corpo.indicadores['resolucao-das-os'].itens[1]).toMatchObject({
      ordem: { problema: 'Atolando papel' },
      ativo: { id: s.ativos.pat00412, patrimonio: 'PAT-00412', local: 'Jundiaí › Expedição' },
      esperaPelaPeca: 0,
      esperaPeloFornecedor: 0,
    });
    expect(corpo.indicadores['os-repetidas']).toMatchObject({
      meta: 2,
      valor: 1,
      situacao: 'fora',
      itens: [
        {
          ativo: { id: s.ativos.nb0031 },
          quantas: 2,
          ordens: [
            { numero: os.naoLiga, problema: 'Não liga' },
            { numero: os.deNovo, problema: 'Não liga de novo' },
          ],
        },
      ],
    });
  });

  it('Toner que rendeu pouco: as páginas da troca sobre o rendimento', async () => {
    const r = await indicadores(s.entradas.ana);
    expect(r.json().indicadores['paginas-por-toner']).toMatchObject({
      meta: 800,
      valor: 1,
      base: 1,
      situacao: 'fora',
      itens: [
        {
          impressora: { id: s.ativos.pat00412, patrimonio: 'PAT-00412' },
          consumivel: { id: s.consumiveis.cf258a, codigo: 'CF258A' },
          paginas: 1850,
          rendimento: 3000,
          porMil: 617,
        },
      ],
    });
  });

  it('Técnico de Jundiaí: as OS de Jundiaí, sem as páginas por toner e sem mudar a meta', async () => {
    const r = await indicadores(outras.gil);
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.permite).toEqual({ mudarMeta: false });
    expect(Object.keys(corpo.indicadores)).toEqual(['resolucao-das-os', 'os-repetidas']);
    expect(
      corpo.indicadores['resolucao-das-os'].itens.map(
        (item: { ordem: { numero: number } }) => item.ordem.numero,
      ),
    ).toEqual([os.papel]);
  });

  it('Almoxarife: só as páginas por toner', async () => {
    const r = await indicadores(outras.hugo);
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json().indicadores)).toEqual(['paginas-por-toner']);
    expect(r.json().indicadores['paginas-por-toner']).toMatchObject({ valor: 1, base: 1 });
  });

  it('a conta sem as OS e sem o estoque é recusada com 403', async () => {
    const r = await indicadores(s.entradas.davi);
    expect(r.statusCode).toBe(403);
  });
});

const mudar = (indicador: string, meta: unknown, entrada: Entrada = s.entradas.ana) =>
  s.cliente.enviar('PUT', `/operacao/indicadores/${indicador}/meta`, entrada, { meta });

const eventosGravados = () =>
  naOrganizacao(api.banco, s.org, (tx) =>
    tx
      .select({
        tipo: eventos.tipo,
        alvoTipo: eventos.alvoTipo,
        permissao: eventos.permissao,
        locais: eventos.locais,
      })
      .from(eventos),
  );

describe('PUT /operacao/indicadores/{indicador}/meta', () => {
  it('Meta mudada: vale nos indicadores, com a auditoria do "antes → depois"', async () => {
    const r = await mudar('os-repetidas', 3);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ indicador: 'os-repetidas', meta: 3, metaDeFabrica: 2 });
    // O NB-0031 tem 2 OS no período: com a meta de 3 OS, nenhum ativo repete.
    expect((await indicadores(s.entradas.ana)).json().indicadores['os-repetidas']).toMatchObject({
      meta: 3,
      valor: 0,
      situacao: 'dentro',
      itens: [],
    });
    // Meta das OS repetidas mudada: a auditoria guarda quem, o indicador e o "antes → depois".
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'meta-de-indicador.alterada',
        atorContaId: s.contas.ana,
        alvoTipo: 'indicador',
        antes: { meta: '2 OS' },
        depois: { meta: '3 OS' },
        dados: { indicador: 'OS repetidas' },
      },
    ]);
  });

  it('Meta das OS mudada: o evento vai para quem vê aquele indicador', async () => {
    await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
    expect((await mudar('resolucao-das-os', 2 * MINUTOS_DO_DIA)).statusCode).toBe(200);
    expect((await mudar('paginas-por-toner', 900)).statusCode).toBe(200);
    expect(await eventosGravados()).toEqual([
      { tipo: 'metas.mudaram', alvoTipo: 'indicador', permissao: 'ordens.ver', locais: null },
      { tipo: 'metas.mudaram', alvoTipo: 'indicador', permissao: 'estoque.ver', locais: null },
    ]);
  });

  it('a mesma meta não grava nada', async () => {
    await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
    const r = await mudar('paginas-por-toner', 900);
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, s.org, r)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('Meta fora dos limites: recusa com a mensagem do limite', async () => {
    const r = await mudar('paginas-por-toner', 400);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ meta: 'A meta deve ficar entre 50% e 100%.' });
    expect((await mudar('os-repetidas', 11)).json().campos).toEqual({
      meta: 'A meta deve ficar entre 2 e 10 OS.',
    });
  });

  it('Quem atende sem administrar: a mudança é recusada com 403', async () => {
    expect((await mudar('os-repetidas', 4, s.entradas.carla)).statusCode).toBe(403);
    expect((await mudar('os-repetidas', 4, outras.gil)).statusCode).toBe(403);
  });

  it('a rota da operação não acha um indicador dos alertas', async () => {
    const r = await mudar('toner', 1440);
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Indicador não encontrado.');
  });
});
