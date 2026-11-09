// A aplicação da importação na fila (spec importacao-de-ativos, "Aplicação na fila"; design do P1e,
// decisões 6 a 8): "Importar" põe a importação na fila, com a auditoria; a tarefa grava linha a linha,
// com a origem "planilha" e a conta que importou, confere de novo a trava, continua de onde parou
// depois de interrompida, fica "Com falha" quando falha de vez e conclui sem o conteúdo da planilha.
// A manutenção diária descarta o rascunho esquecido.
import {
  ativos,
  auditoria,
  errosDaImportacao,
  eventos,
  importacoes,
  naOrganizacao,
  tarefasComFalha,
} from '@grafite/db';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { csvDoExcel } from '../../test/planilhas.ts';
import { tarefasDaManutencao } from '../fila/manutencao.ts';
import { type ContextoDasTarefas, tarefasDaApi } from '../fila/tarefas.ts';
import { tarefaDaImportacao } from '../importacao/tarefa.ts';

const host = 'grafite.importacoes-aplicacao.local';
const DIA = 24 * 60 * 60_000;

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};
const id = (chave: string) => ids[chave] ?? '';
const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

const silencioso = { info: () => {}, warn: () => {}, error: () => {} };

/** O contexto das tarefas, para rodá-las direto, sem a fila, nos testes que controlam a execução. */
const contexto = (): ContextoDasTarefas => ({
  banco: api.banco,
  armazenamento: api.armazenamento,
  agora: api.relogio.agora,
  log: silencioso,
  enviar: vi.fn(async () => null),
});

const sinalQueNaoPara = new AbortController().signal;

/** Um sinal que avisa a interrupção depois de `linhas` linhas. */
function sinalQueParaDepoisDe(linhas: number): AbortSignal {
  let consultas = 0;
  return {
    get aborted() {
      consultas += 1;
      return consultas > linhas;
    },
  } as AbortSignal;
}

const enviar = (conteudo: Buffer, usuario = 'ana') =>
  cliente.enviarBytes(
    'POST',
    `/ativos/importacoes?tipoId=${id('impressora')}&nome=impressoras.csv`,
    como(usuario),
    conteudo,
  );

const aplicar = (importacaoId: string, usuario = 'ana') =>
  cliente.enviar('POST', `/ativos/importacoes/${importacaoId}/aplicacao`, como(usuario));

const detalhe = async (importacaoId: string) =>
  (await cliente.consultar(`/ativos/importacoes/${importacaoId}`, como('ana'))).json();

/** Espera a importação chegar à situação dada, pela fila da API. */
const esperar = (importacaoId: string, situacao: string) =>
  vi.waitFor(async () => expect((await detalhe(importacaoId)).situacao).toBe(situacao), {
    timeout: 30_000,
    interval: 200,
  });

const linhaDaImportacao = (importacaoId: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx.select().from(importacoes).where(eq(importacoes.id, importacaoId));
    return linha;
  });

const ativosComPatrimonio = (patrimonios: string[]) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(ativos).where(inArray(ativos.patrimonio, patrimonios)),
  );

/** Põe a importação na fila sem a tarefa, para os testes que rodam a tarefa direto. */
const naFilaSemTarefa = (importacaoId: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.update(importacoes).set({ situacao: 'na-fila' }).where(eq(importacoes.id, importacaoId)),
  );

const rodarATarefa = (importacaoId: string, sinal: AbortSignal = sinalQueNaoPara) =>
  tarefaDaImportacao(contexto()).trabalho(
    { orgId: org, importacaoId },
    { tarefaId: 'teste', tentativa: 0, sinal },
  );

let patrimonios = 0;
const novoPatrimonio = () => `PAT-${String(5000 + ++patrimonios).padStart(5, '0')}`;

beforeAll(async () => {
  api = await abrirApi({ tarefas: (contexto) => tarefasDaApi(contexto), intervaloDaFila: 0.5 });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);

  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.almoxarifado = await criarLocal(api, org, { nome: 'Almoxarifado', paiId: id('jundiai') });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: id('jundiai') });

  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['catalogo.administrar', 'ativos.editar', 'ativos.restritos'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  ids.ana = ana.id;
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  entradas.ana = await cliente.entrar('ana');

  const criar = async (caminho: string, pedido: object) =>
    (await cliente.enviar('POST', caminho, como('ana'), pedido)).json().id as string;
  ids.ip = await criar('/campos', { rotulo: 'IP', tipo: 'ip' });
  ids.impressora = await criar('/tipos-de-ativo', {
    nome: 'Impressora',
    icone: 'impressora',
    campos: [{ campoId: id('ip'), obrigatorio: false }],
  });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

/** Uma impressora cadastrada pela tela, com o hostname travado. */
async function impressoraComHostnameTravado(patrimonio: string) {
  const r = await cliente.enviar('POST', '/ativos', como('ana'), {
    tipoId: id('impressora'),
    valores: {
      'ativo.patrimonio': patrimonio,
      'ativo.hostname': 'IMP-01',
      'ativo.local': id('almoxarifado'),
      [id('ip')]: '10.0.0.5',
    },
    travas: { 'ativo.hostname': true },
  });
  return r.json().id as string;
}

describe('"Importar"', () => {
  it('põe a importação na fila com a auditoria, e a tarefa grava cada linha e conclui', async () => {
    const existente = await impressoraComHostnameTravado('PAT-00412');
    const [novo1, novo2] = [novoPatrimonio(), novoPatrimonio()];
    const importacao = (
      await enviar(
        csvDoExcel([
          ['Patrimônio', 'Hostname', 'Local', 'IP'],
          ['PAT-00412', 'IMP-NOVA', 'Jundiaí › Expedição', ''],
          [novo1, '', 'Almoxarifado', '10.0.1.1'],
          [novo2, '', 'Almoxarifado', '10.0.1.2'],
          [novoPatrimonio(), '', 'Almoxarifado', '10.0.1'],
        ]),
      )
    ).json();

    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const r = await aplicar(importacao.id);
    expect(r.statusCode).toBe(202);
    expect(r.json()).toMatchObject({ situacao: 'na-fila', aplicadaEm: expect.any(String) });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'importacao.aplicada',
        atorContaId: id('ana'),
        alvoTipo: 'importacao',
        alvoId: importacao.id,
        dados: { tipo: 'Impressora', arquivo: 'impressoras.csv', linhas: 4 },
      },
    ]);

    await esperar(importacao.id, 'concluida');
    const concluida = await detalhe(importacao.id);
    expect(concluida).toMatchObject({
      processadas: 4,
      totais: { novos: 2, alterados: 1, semMudanca: 0, comErro: 1 },
      concluidaEm: expect.any(String),
    });
    expect((await linhaDaImportacao(importacao.id))?.conteudo).toBeNull();

    // O local mudou, o hostname travado ficou, e o estado diz a planilha e a conta.
    const [mudado] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(ativos).where(eq(ativos.id, existente)),
    );
    expect(mudado).toMatchObject({ localId: id('expedicao'), hostname: 'IMP-01' });
    expect(mudado?.estado).toMatchObject({
      'ativo.local': { origem: 'planilha', autorId: id('ana'), trava: false },
      'ativo.hostname': { origem: 'manual', trava: true },
    });
    const criados = await ativosComPatrimonio([novo1, novo2]);
    expect(criados).toHaveLength(2);
    expect(criados[0]?.estado).toMatchObject({
      'ativo.patrimonio': { origem: 'planilha', autorId: id('ana') },
    });

    // A auditoria de cada ativo, com a importação, e a da conclusão, com os totais.
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(auditoria)
        .where(eq(auditoria.atorContaId, id('ana'))),
    );
    const daImportacao = registros.filter(
      (registro) =>
        (registro.dados as { importacao?: { id: string } } | null)?.importacao?.id ===
        importacao.id,
    );
    expect(daImportacao.map((registro) => registro.acao).sort()).toEqual([
      'ativo.alterado',
      'ativo.criado',
      'ativo.criado',
    ]);
    expect(registros.find((registro) => registro.acao === 'importacao.concluida')).toMatchObject({
      alvoId: importacao.id,
      dados: {
        tipo: 'Impressora',
        arquivo: 'impressoras.csv',
        totais: { novos: 2, alterados: 1, semMudanca: 0, comErro: 1 },
      },
    });

    // As linhas com erro, pela lista própria.
    const erros = await cliente.consultar(
      `/ativos/importacoes/${importacao.id}/erros`,
      como('ana'),
    );
    expect(erros.json()).toEqual({
      itens: [
        { linha: 5, mensagens: [{ campo: 'IP', mensagem: 'Use um IP, como 192.168.0.10.' }] },
      ],
      proximo: null,
    });

    // Os eventos: o da importação só para quem importou, e o de cada ativo.
    const gravados = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ tipo: eventos.tipo, contas: eventos.contas }).from(eventos),
    );
    expect(gravados.filter((evento) => evento.tipo === 'ativos.mudaram')).toHaveLength(3);
    expect(gravados.filter((evento) => evento.tipo === 'importacoes.mudaram')).toContainEqual({
      tipo: 'importacoes.mudaram',
      contas: [id('ana')],
    });
  });

  it('a trava ligada depois da prévia vale na hora de gravar', async () => {
    const patrimonio = novoPatrimonio();
    const existente = await impressoraComHostnameTravado(patrimonio);
    const importacao = (
      await enviar(
        csvDoExcel([
          ['Patrimônio', 'Local', 'IP'],
          [patrimonio, 'Jundiaí › Expedição', '10.0.9.9'],
        ]),
      )
    ).json();
    const previa = await cliente.consultar(
      `/ativos/importacoes/${importacao.id}/previa`,
      como('ana'),
    );
    expect(
      previa.json().linhas[0].mudancas.map((mudanca: { campo: string }) => mudanca.campo),
    ).toEqual(['Local', 'IP']);
    await cliente.enviar('PATCH', `/ativos/${existente}`, como('ana'), {
      travas: { 'ativo.local': true },
    });

    await aplicar(importacao.id);
    await esperar(importacao.id, 'concluida');
    const [depois] = await ativosComPatrimonio([patrimonio]);
    expect(depois?.localId).toBe(id('almoxarifado'));
    expect(depois?.valores).toMatchObject({ [id('ip')]: '10.0.9.9' });
  });

  it('recusa a importação que não é mais rascunho e a escolha de colunas que deixou de valer', async () => {
    const importacao = (await enviar(csvDoExcel([['Patrimônio'], [novoPatrimonio()]]))).json();
    // A escolha guardada que deixou de valer, como a de um campo que saiu do tipo depois.
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(importacoes)
        .set({ mapeamento: [null] })
        .where(eq(importacoes.id, importacao.id)),
    );
    const semColunas = await aplicar(importacao.id);
    expect(semColunas.statusCode).toBe(400);
    expect(semColunas.json().campos).toEqual({
      colunas: 'Escolha o campo de pelo menos uma coluna.',
    });

    await cliente.enviar('DELETE', `/ativos/importacoes/${importacao.id}`, como('ana'));
    const descartada = await aplicar(importacao.id);
    expect(descartada.statusCode).toBe(409);
    expect(descartada.json().detail).toBe('A importação não está mais em rascunho.');
  });
});

describe('a tarefa', () => {
  it('interrompida, continua da linha seguinte à última gravada, sem cadastrar duas vezes', async () => {
    const lote = Array.from({ length: 5 }, () => novoPatrimonio());
    const importacao = (
      await enviar(
        csvDoExcel([
          ['Patrimônio', 'Local'],
          ...lote.map((patrimonio) => [patrimonio, 'Almoxarifado']),
          // A sexta linha repete a segunda: o casamento das linhas seguintes lembra quem já mudou.
          [lote[1] ?? '', 'Expedição'],
        ]),
      )
    ).json();
    await naFilaSemTarefa(importacao.id);

    await expect(rodarATarefa(importacao.id, sinalQueParaDepoisDe(2))).rejects.toThrow(
      /interrompida/,
    );
    expect(await linhaDaImportacao(importacao.id)).toMatchObject({
      situacao: 'aplicando',
      processadas: 2,
    });
    expect(await ativosComPatrimonio(lote)).toHaveLength(2);

    await rodarATarefa(importacao.id);
    expect(await linhaDaImportacao(importacao.id)).toMatchObject({
      situacao: 'concluida',
      processadas: 6,
      totais: { novos: 5, alterados: 0, semMudanca: 0, comErro: 1 },
    });
    expect(await ativosComPatrimonio(lote)).toHaveLength(5);
    const erros = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ linha: errosDaImportacao.linha, mensagens: errosDaImportacao.mensagens })
        .from(errosDaImportacao)
        .where(eq(errosDaImportacao.importacaoId, importacao.id)),
    );
    expect(erros).toEqual([
      {
        linha: 7,
        mensagens: [{ campo: 'Patrimônio', mensagem: 'A linha 3 já muda este ativo.' }],
      },
    ]);

    // Rodar de novo a concluída não grava nada.
    await rodarATarefa(importacao.id);
    expect(await ativosComPatrimonio(lote)).toHaveLength(5);
  });

  it('falhando em todas as tentativas, fica "Com falha", e "Tentar de novo" continua', async () => {
    const importacao = (
      await enviar(csvDoExcel([['Patrimônio'], [novoPatrimonio()], [novoPatrimonio()]]))
    ).json();
    await naFilaSemTarefa(importacao.id);
    await expect(rodarATarefa(importacao.id, sinalQueParaDepoisDe(1))).rejects.toThrow();

    const falhas = tarefasDaApi(contexto()).find((tarefa) => tarefa.nome === 'tarefas-com-falha');
    await falhas?.trabalho(
      { orgId: org, importacaoId: importacao.id },
      {
        tarefaId: 'falha',
        tentativa: 0,
        sinal: sinalQueNaoPara,
        origem: {
          tarefa: 'importacao-de-ativos',
          codigo: 'codigo-da-tarefa',
          tentativas: 6,
          erro: new Error('O banco não respondeu.'),
        },
      },
    );
    expect(await linhaDaImportacao(importacao.id)).toMatchObject({
      situacao: 'com-falha',
      processadas: 1,
    });
    const lista = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(tarefasComFalha)
        .where(and(eq(tarefasComFalha.tarefa, 'importacao-de-ativos'))),
    );
    expect(lista).toHaveLength(1);
    expect(await detalhe(importacao.id)).toMatchObject({ situacao: 'com-falha' });

    await rodarATarefa(importacao.id);
    expect(await linhaDaImportacao(importacao.id)).toMatchObject({
      situacao: 'concluida',
      processadas: 2,
      totais: { novos: 2, alterados: 0, semMudanca: 0, comErro: 0 },
    });
  });
});

describe('a manutenção diária', () => {
  it('descarta o rascunho com mais de 7 dias, sem o conteúdo, e deixa o mais novo', async () => {
    const velho = (await enviar(csvDoExcel([['Patrimônio'], ['PAT-V']]))).json();
    const novo = (await enviar(csvDoExcel([['Patrimônio'], ['PAT-N']]))).json();
    const agora = api.relogio.agora().getTime();
    await naOrganizacao(api.banco, org, async (tx) => {
      await tx
        .update(importacoes)
        .set({ criadaEm: new Date(agora - 8 * DIA) })
        .where(eq(importacoes.id, velho.id));
      await tx
        .update(importacoes)
        .set({ criadaEm: new Date(agora - 6 * DIA) })
        .where(eq(importacoes.id, novo.id));
    });
    const manutencao = tarefasDaManutencao(contexto()).find(
      (tarefa) => tarefa.nome === 'manutencao',
    );
    await manutencao?.trabalho(
      { orgId: org },
      { tarefaId: 't', tentativa: 0, sinal: sinalQueNaoPara },
    );

    expect(await linhaDaImportacao(velho.id)).toMatchObject({
      situacao: 'descartada',
      conteudo: null,
    });
    expect(await linhaDaImportacao(novo.id)).toMatchObject({ situacao: 'rascunho' });
    const gravados = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ tipo: eventos.tipo, alvoId: eventos.alvoId, contas: eventos.contas })
        .from(eventos),
    );
    expect(gravados).toContainEqual({
      tipo: 'importacoes.mudaram',
      alvoId: velho.id,
      contas: [id('ana')],
    });
  });
});

// O limite pega uma regressão de ordem de grandeza, como um pedido ao banco a mais por linha. Sem
// carga, a aplicação leva uns 2 min no CI; com outros jobs na mesma máquina, passou de 5 min
// (change integracao-sob-carga). O tempo do teste fica acima do limite, para a reprovação vir da
// asserção, com a medida, e não do tempo esgotado.
describe('desempenho', () => {
  it('aplica uma planilha de 5.000 linhas em menos de 8 min', { timeout: 540_000 }, async () => {
    const linhas = Array.from({ length: 5000 }, (_, i) => [
      `GRANDE-${String(i).padStart(5, '0')}`,
      'Almoxarifado',
      `10.1.${Math.floor(i / 250)}.${(i % 250) + 1}`,
    ]);
    const importacao = (
      await enviar(csvDoExcel([['Patrimônio', 'Local', 'IP'], ...linhas]))
    ).json();
    expect(importacao.linhas).toBe(5000);
    await naFilaSemTarefa(importacao.id);
    const inicio = performance.now();
    await rodarATarefa(importacao.id);
    const segundos = (performance.now() - inicio) / 1000;
    console.info(`A aplicação das 5.000 linhas levou ${segundos.toFixed(1)} s.`);
    expect(await linhaDaImportacao(importacao.id)).toMatchObject({
      situacao: 'concluida',
      totais: { novos: 5000, alterados: 0, semMudanca: 0, comErro: 0 },
    });
    expect(segundos).toBeLessThan(480);
  });
});
