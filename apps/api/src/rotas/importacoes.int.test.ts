// As rotas da importação (spec importacao-de-ativos; design do P1e, decisões 1 a 5): o envio da
// planilha, que cria o rascunho com as colunas sugeridas; a lista e o detalhe só da conta; a escolha
// das colunas; a prévia linha a linha, com o casamento, as referências por texto, a trava, os erros,
// o escopo e os totais; e o descarte.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { csvDoExcel, xlsxDeTabela } from '../../test/planilhas.ts';

const host = 'grafite.importacoes.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};
const id = (chave: string) => ids[chave] ?? '';
const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

/** Envia a planilha como a conta dada, para o tipo dado. */
const enviar = (
  conteudo: Buffer,
  { usuario = 'ana', tipo = 'impressora', nome = 'impressoras.csv' } = {},
) =>
  cliente.enviarBytes(
    'POST',
    `/ativos/importacoes?tipoId=${id(tipo)}&nome=${encodeURIComponent(nome)}`,
    como(usuario),
    conteudo,
  );

const previa = (importacaoId: string, consulta = '', usuario = 'ana') =>
  cliente.consultar(`/ativos/importacoes/${importacaoId}/previa${consulta}`, como(usuario));

const TITULOS = [
  'Patrimônio',
  'Série',
  'Hostname',
  'Localização',
  'IP',
  'Responsável',
  'Modelo',
  'Observação',
];

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);

  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.almoxarifado = await criarLocal(api, org, { nome: 'Almoxarifado', paiId: id('jundiai') });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: id('jundiai') });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  ids.expedicaoDeCampinas = await criarLocal(api, org, {
    nome: 'Expedição',
    paiId: id('campinas'),
  });

  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['catalogo.administrar', 'modelos.editar', 'ativos.editar', 'ativos.restritos'],
  });
  const editar = await criarPerfil(api, org, { nome: 'Editar', permissoes: ['ativos.editar'] });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  ids.ana = ana.id;
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: editar, contaId: bruno.id, localId: id('jundiai') });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: ver, contaId: carla.id });
  await criarConta(api, org, { usuario: 'joao', nome: 'João Silva', matricula: '1001' });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);

  const criar = async (caminho: string, pedido: object) =>
    (await cliente.enviar('POST', caminho, como('ana'), pedido)).json().id as string;
  ids.ip = await criar('/campos', { rotulo: 'IP', tipo: 'ip', grupo: 'Rede' });
  ids.custo = await criar('/campos', {
    rotulo: 'Custo do contrato',
    tipo: 'moeda',
    restrito: true,
  });
  ids.impressora = await criar('/tipos-de-ativo', {
    nome: 'Impressora',
    icone: 'impressora',
    campos: [
      { campoId: id('ip'), obrigatorio: false },
      { campoId: id('custo'), obrigatorio: false },
    ],
  });
  ids.switch = await criar('/tipos-de-ativo', { nome: 'Switch', icone: 'switch' });
  ids.nobreak = await criar('/tipos-de-ativo', { nome: 'Nobreak', icone: 'nobreak' });
  await cliente.enviar('POST', `/tipos-de-ativo/${id('nobreak')}/inativacao`, como('ana'));
  ids.m404 = await criar('/modelos', {
    tipoId: id('impressora'),
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });

  ids.pat412 = await criar('/ativos', {
    tipoId: id('impressora'),
    valores: {
      'ativo.patrimonio': 'PAT-00412',
      'ativo.hostname': 'IMP-01',
      'ativo.local': id('almoxarifado'),
    },
    travas: { 'ativo.hostname': true },
  });
  await criar('/ativos', {
    tipoId: id('switch'),
    valores: { 'ativo.patrimonio': 'PAT-00610', 'ativo.local': id('jundiai') },
  });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tipo: eventos.tipo, alvoId: eventos.alvoId, contas: eventos.contas }).from(eventos),
  );

describe('envio da planilha', () => {
  it('cria o rascunho com as colunas sugeridas pelo rótulo e os exemplos, e avisa só quem importou', async () => {
    const r = await enviar(
      csvDoExcel([
        TITULOS,
        ['PAT-00412', '', 'IMP-NOVA', 'Jundiaí > Expedição', '', '', '', 'pintar'],
        ['PAT-00900', 'BRJ1', 'IMP-09', 'Almoxarifado', '10.0.0', '', '', ''],
      ]),
    );
    expect(r.statusCode).toBe(201);
    const importacao = r.json();
    expect(importacao).toMatchObject({
      nomeDoArquivo: 'impressoras.csv',
      tipo: { id: id('impressora'), nome: 'Impressora' },
      situacao: 'rascunho',
      linhas: 2,
      processadas: 0,
      totais: { novos: 0, alterados: 0, semMudanca: 0, comErro: 0 },
      aplicadaEm: null,
      concluidaEm: null,
    });
    expect(importacao.colunas).toEqual([
      { titulo: 'Patrimônio', campo: 'ativo.patrimonio', exemplos: ['PAT-00412', 'PAT-00900'] },
      { titulo: 'Série', campo: 'ativo.serie', exemplos: ['BRJ1'] },
      { titulo: 'Hostname', campo: 'ativo.hostname', exemplos: ['IMP-NOVA', 'IMP-09'] },
      {
        titulo: 'Localização',
        campo: 'ativo.local',
        exemplos: ['Jundiaí > Expedição', 'Almoxarifado'],
      },
      { titulo: 'IP', campo: id('ip'), exemplos: ['10.0.0'] },
      { titulo: 'Responsável', campo: 'ativo.responsavel', exemplos: [] },
      { titulo: 'Modelo', campo: 'ativo.modelo', exemplos: [] },
      { titulo: 'Observação', campo: null, exemplos: ['pintar'] },
    ]);
    expect(importacao.campos).toContainEqual({
      chave: id('custo'),
      rotulo: 'Custo do contrato',
      grupo: 'Outros',
      restrito: true,
    });
    expect(await eventosGravados()).toEqual([
      { tipo: 'importacoes.mudaram', alvoId: importacao.id, contas: [id('ana')] },
    ]);
  });

  it('lê o XLSX, e o nome do arquivo fica com a extensão do formato lido', async () => {
    const r = await enviar(
      xlsxDeTabela([
        ['Patrimônio', 'IP'],
        ['PAT-00412', '10.0.0.5'],
      ]),
      {
        nome: 'C:\\Users\\ana\\inventário',
      },
    );
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ nomeDoArquivo: 'inventário.xlsx', linhas: 1 });
  });

  it('recusa o que não é planilha, o tipo inativo ou desconhecido e quem não edita ativos', async () => {
    const pdf = await enviar(Buffer.from('%PDF-1.4\n%fim\n'));
    expect(pdf.statusCode).toBe(415);
    expect(pdf.json().detail).toBe('Formato não aceito. Envie a planilha em XLSX ou CSV.');

    const inativo = await enviar(csvDoExcel([['Patrimônio'], ['PAT-1']]), { tipo: 'nobreak' });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().detail).toBe('O tipo Nobreak está inativo.');

    const desconhecido = await cliente.enviarBytes(
      'POST',
      '/ativos/importacoes?tipoId=0199a3f0-0000-7000-8000-0000000000ff&nome=x.csv',
      como('ana'),
      csvDoExcel([['Patrimônio'], ['PAT-1']]),
    );
    expect(desconhecido.statusCode).toBe(400);
    expect(desconhecido.json().campos).toEqual({ tipoId: 'Tipo de ativo não encontrado.' });

    const semLinhas = await enviar(csvDoExcel([['Patrimônio']]));
    expect(semLinhas.json().detail).toBe('A planilha não tem linhas para importar.');

    expect(
      (await enviar(csvDoExcel([['Patrimônio'], ['PAT-1']]), { usuario: 'carla' })).statusCode,
    ).toBe(403);
  });

  it('recusa a planilha de mais de 10 MB pelo tamanho do corpo', async () => {
    const r = await enviar(Buffer.alloc(10 * 1024 * 1024 + 1, 0x41));
    expect(r.statusCode).toBe(413);
    expect(r.json().detail).toBe('A planilha passa de 10 MB.');
  });
});

describe('lista e detalhe', () => {
  it('cada conta vê só as próprias importações, da mais nova para a mais antiga', async () => {
    const daAna = (await enviar(csvDoExcel([['Patrimônio'], ['PAT-1']]))).json().id;
    const doBruno = (
      await enviar(csvDoExcel([['Patrimônio'], ['PAT-2']]), { usuario: 'bruno', nome: 'b.csv' })
    ).json().id;

    const lista = await cliente.consultar('/ativos/importacoes', como('bruno'));
    expect(lista.statusCode).toBe(200);
    expect(lista.json().itens.map((item: { id: string }) => item.id)).toEqual([doBruno]);
    expect(lista.json().itens[0]).toMatchObject({
      nomeDoArquivo: 'b.csv',
      tipo: { nome: 'Impressora' },
      situacao: 'rascunho',
      linhas: 1,
    });

    const daAnaPeloBruno = await cliente.consultar(`/ativos/importacoes/${daAna}`, como('bruno'));
    expect(daAnaPeloBruno.statusCode).toBe(404);
    expect(daAnaPeloBruno.json().detail).toBe('Importação não encontrada.');

    const daLista = (await cliente.consultar('/ativos/importacoes?limite=1', como('ana'))).json();
    expect(daLista.itens[0].id).toBe(daAna);
    expect(daLista.proximo).toEqual(expect.any(String));
  });
});

describe('colunas', () => {
  it('recusa um campo em duas colunas e a escolha sem nenhuma coluna, e guarda a escolha válida', async () => {
    const importacao = (
      await enviar(
        csvDoExcel([
          ['Setor', 'Local'],
          ['Jundiaí', 'Campinas'],
        ]),
      )
    ).json();
    const caminho = `/ativos/importacoes/${importacao.id}/colunas`;

    const repetido = await cliente.enviar('PUT', caminho, como('ana'), {
      colunas: ['ativo.local', 'ativo.local'],
    });
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json().campos).toEqual({
      'colunas.0': 'O campo Local está em duas colunas.',
      'colunas.1': 'O campo Local está em duas colunas.',
    });

    const nenhuma = await cliente.enviar('PUT', caminho, como('ana'), { colunas: [null, null] });
    expect(nenhuma.json().campos).toEqual({ colunas: 'Escolha o campo de pelo menos uma coluna.' });

    const certo = await cliente.enviar('PUT', caminho, como('ana'), {
      colunas: ['ativo.local', null],
    });
    expect(certo.statusCode).toBe(200);
    expect(certo.json().colunas.map((coluna: { campo: string | null }) => coluna.campo)).toEqual([
      'ativo.local',
      null,
    ]);
  });

  it('não oferece os restritos a quem não os vê', async () => {
    const importacao = (
      await enviar(csvDoExcel([['Custo do contrato'], ['10,00']]), { usuario: 'bruno' })
    ).json();
    expect(importacao.colunas[0].campo).toBeNull();
    const r = await cliente.enviar(
      'PUT',
      `/ativos/importacoes/${importacao.id}/colunas`,
      como('bruno'),
      { colunas: [id('custo')] },
    );
    expect(r.json().campos).toEqual({ 'colunas.0': 'Este campo não pode ser importado.' });
  });
});

describe('prévia', () => {
  let importacaoId = '';

  beforeAll(async () => {
    const r = await enviar(
      csvDoExcel([
        TITULOS,
        ['PAT-00412', '', 'IMP-NOVA', 'Jundiaí > Expedição', '', '', '', ''],
        ['PAT-00900', 'BRJ1', 'IMP-09', 'Almoxarifado', '10.0.0', '', '', ''],
        ['PAT-00901', '', '', 'Expedição', '10.0.0.8', '', '', ''],
        ['PAT-00610', '', '', '', '', '', '', ''],
        ['PAT-00902', '', '', 'Jundiaí › Almoxarifado', '10.0.0.9', '1001', 'HP LaserJet M404', ''],
      ]),
    );
    importacaoId = r.json().id;
  });

  it('mostra cada linha com a ação, o ativo, o "antes → depois", a trava e os erros, e os totais', async () => {
    const r = await previa(importacaoId);
    expect(r.statusCode).toBe(200);
    expect(r.json().totais).toEqual({ novos: 1, alterados: 1, semMudanca: 0, comErro: 3 });
    expect(r.json().proximo).toBeNull();
    expect(r.json().linhas).toEqual([
      {
        linha: 2,
        acao: 'alterar',
        ativo: { id: id('pat412'), rotulo: 'Impressora', patrimonio: 'PAT-00412' },
        mudancas: [
          { campo: 'Local', antes: 'Jundiaí › Almoxarifado', depois: 'Jundiaí › Expedição' },
        ],
        seguros: [{ campo: 'Hostname', motivo: 'Travado' }],
        erros: [],
      },
      {
        linha: 3,
        acao: 'com-erro',
        ativo: null,
        mudancas: expect.any(Array),
        seguros: [],
        erros: [{ campo: 'IP', mensagem: 'Use um IP, como 192.168.0.10.' }],
      },
      {
        linha: 4,
        acao: 'com-erro',
        ativo: null,
        mudancas: expect.any(Array),
        seguros: [],
        erros: [
          {
            campo: 'Local',
            mensagem: 'Há mais de um local Expedição: use o caminho, como Jundiaí › Expedição.',
          },
        ],
      },
      {
        linha: 5,
        acao: 'com-erro',
        ativo: null,
        mudancas: [],
        seguros: [],
        erros: [{ campo: 'Patrimônio', mensagem: 'O ativo PAT-00610 é do tipo Switch.' }],
      },
      {
        linha: 6,
        acao: 'novo',
        ativo: null,
        mudancas: [
          { campo: 'Patrimônio', antes: null, depois: 'PAT-00902' },
          { campo: 'Modelo', antes: null, depois: 'HP LaserJet M404' },
          { campo: 'Local', antes: null, depois: 'Jundiaí › Almoxarifado' },
          { campo: 'Responsável', antes: null, depois: 'João Silva' },
          { campo: 'IP', antes: null, depois: '10.0.0.9' },
        ],
        seguros: [],
        erros: [],
      },
    ]);
  });

  it('filtra por ação, com os totais da planilha inteira, e pagina pelo número da linha', async () => {
    const comErro = (await previa(importacaoId, '?acao=com-erro&limite=2')).json();
    expect(comErro.totais).toEqual({ novos: 1, alterados: 1, semMudanca: 0, comErro: 3 });
    expect(comErro.linhas.map((linha: { linha: number }) => linha.linha)).toEqual([3, 4]);
    const seguinte = (
      await previa(importacaoId, `?acao=com-erro&limite=2&cursor=${comErro.proximo}`)
    ).json();
    expect(seguinte.linhas.map((linha: { linha: number }) => linha.linha)).toEqual([5]);
    expect(seguinte.proximo).toBeNull();
  });

  it('vale o escopo de quem importa, sem mostrar o ativo de fora', async () => {
    const r = await enviar(
      csvDoExcel([
        ['Patrimônio', 'Local'],
        ['PAT-00412', 'Campinas'],
        ['PAT-00950', ''],
      ]),
      { usuario: 'bruno' },
    );
    const linhas = (await previa(r.json().id, '', 'bruno')).json().linhas;
    expect(linhas).toEqual([
      expect.objectContaining({
        linha: 2,
        acao: 'com-erro',
        mudancas: [],
        erros: [{ campo: null, mensagem: 'Você não edita ativos em Campinas.' }],
      }),
      expect.objectContaining({
        linha: 3,
        acao: 'com-erro',
        erros: [{ campo: null, mensagem: 'Você não edita ativos sem local.' }],
      }),
    ]);
  });

  it('a prévia de outra conta não existe', async () => {
    expect((await previa(importacaoId, '', 'bruno')).statusCode).toBe(404);
  });
});

describe('descarte', () => {
  it('descarta o rascunho, sem o conteúdo, e o descartado não muda mais', async () => {
    const importacao = (await enviar(csvDoExcel([['Patrimônio'], ['PAT-1']]))).json();
    const caminho = `/ativos/importacoes/${importacao.id}`;
    const r = await cliente.enviar('DELETE', caminho, como('ana'));
    expect(r.statusCode).toBe(204);
    expect((await cliente.consultar(caminho, como('ana'))).json()).toMatchObject({
      situacao: 'descartada',
    });
    expect(await eventosGravados()).toContainEqual({
      tipo: 'importacoes.mudaram',
      alvoId: importacao.id,
      contas: [id('ana')],
    });

    const deNovo = await cliente.enviar('DELETE', caminho, como('ana'));
    expect(deNovo.statusCode).toBe(409);
    expect(deNovo.json().detail).toBe('A importação não está mais em rascunho.');
    expect((await previa(importacao.id)).statusCode).toBe(409);
    const colunas = await cliente.enviar('PUT', `${caminho}/colunas`, como('ana'), {
      colunas: ['ativo.patrimonio'],
    });
    expect(colunas.statusCode).toBe(409);
  });
});
