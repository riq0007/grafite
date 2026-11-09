// As regras de alerta pela API (spec alertas, "Regras de alerta"; change p3a-regras-e-alertas,
// design, decisão 10): quem administra os alertas lista, cadastra, edita, inativa e reativa as
// regras, com a conferência do domínio, o escopo ativo no banco, a condição que não muda, a
// auditoria e o evento dos alertas.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type AlertasDeTeste,
  criarAtivoDoTipo,
  criarModelo,
  criarTipo,
  desligarModulos,
  montarAlertas,
  type UsuarioDosAlertas,
} from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  auditoriaDaRequisicao,
  criarLocal,
} from '../../test/integracao.ts';

const host = 'grafite.regras.local';

let api: ApiDeTeste;
let alertas: AlertasDeTeste;
let impressora = '';
let tipoInativo = '';
let modelo = '';
let ativo = '';
let localInativo = '';

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
  impressora = await criarTipo(api, alertas.org, {
    nome: 'Impressora',
    capacidades: ['snmp.suprimentos'],
  });
  tipoInativo = await criarTipo(api, alertas.org, { nome: 'Fax', situacao: 'inativo' });
  modelo = await criarModelo(api, alertas.org, {
    tipoId: impressora,
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });
  ativo = await criarAtivoDoTipo(api, alertas.org, {
    tipoId: impressora,
    nome: 'Impressora do RH',
    patrimonio: 'PAT-00412',
  });
  localInativo = await criarLocal(api, alertas.org, { nome: 'Galpão antigo', situacao: 'inativo' });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, alertas.org, (tx) => tx.delete(eventos));
});

const ORGANIZACAO = { tipo: 'organizacao', id: null };

const doToner = (mudancas: Record<string, unknown> = {}) => ({
  nome: 'Toner das impressoras',
  condicao: 'toner.nivel',
  parametros: { limite: 15, folga: 5 },
  duracao: 0,
  severidade: 'critico',
  escopo: { tipo: 'tipo', id: impressora },
  ...mudancas,
});

const cadastrar = (pedido: object, usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.enviar('POST', '/regras-de-alerta', alertas.como(usuario), pedido);
const editar = (id: string, pedido: object) =>
  alertas.cliente.enviar('PATCH', `/regras-de-alerta/${id}`, alertas.como('ana'), pedido);
const acao = (id: string, caminho: string) =>
  alertas.cliente.enviar('POST', `/regras-de-alerta/${id}/${caminho}`, alertas.como('ana'));
const listar = (usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.consultar('/regras-de-alerta', alertas.como(usuario));

const eventosGravados = () =>
  naOrganizacao(api.banco, alertas.org, (tx) =>
    tx
      .select({
        tipo: eventos.tipo,
        alvoTipo: eventos.alvoTipo,
        alvoId: eventos.alvoId,
        permissao: eventos.permissao,
        locais: eventos.locais,
      })
      .from(eventos),
  );

let nomes = 0;
const nomeNovo = () => `Regra ${++nomes}`;

describe('regras de alerta pela API', () => {
  it('cadastra a regra de um tipo, com a auditoria e o evento para quem vê alertas', async () => {
    const r = await cadastrar(doToner());
    expect(r.statusCode).toBe(201);
    const regra = r.json();
    expect(regra).toMatchObject({
      nome: 'Toner das impressoras',
      condicao: 'toner.nivel',
      parametros: { limite: 15, folga: 5 },
      duracao: 0,
      severidade: 'critico',
      escopo: { tipo: 'tipo', id: impressora, nome: 'Impressora' },
      situacao: 'ativa',
      deFabrica: false,
    });
    expect(await auditoriaDaRequisicao(api, alertas.org, r)).toMatchObject([
      {
        acao: 'regra-de-alerta.criada',
        alvoTipo: 'regra-de-alerta',
        alvoId: regra.id,
        depois: {
          nome: 'Toner das impressoras',
          condicao: 'toner.nivel',
          parametros: { limite: 15, folga: 5 },
          severidade: 'critico',
          escopo: { tipo: 'tipo', id: impressora },
        },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      {
        tipo: 'alertas.mudaram',
        alvoTipo: 'regra-de-alerta',
        alvoId: regra.id,
        permissao: 'alertas.ver',
        locais: null,
      },
    ]);
  });

  it('lista as regras pelo nome, com o escopo pelo nome do registro', async () => {
    await cadastrar(doToner({ nome: 'B · do modelo', escopo: { tipo: 'modelo', id: modelo } }));
    await cadastrar(doToner({ nome: 'A · do ativo', escopo: { tipo: 'ativo', id: ativo } }));
    await cadastrar(
      doToner({ nome: 'C · do local', escopo: { tipo: 'local', id: alertas.jundiai } }),
    );
    const r = await listar();
    expect(r.statusCode).toBe(200);
    const { regras, permite } = r.json();
    expect(permite).toEqual({ cadastrar: true });
    const nomesNaOrdem = regras.map((regra: { nome: string }) => regra.nome);
    expect(nomesNaOrdem.indexOf('A · do ativo')).toBeLessThan(
      nomesNaOrdem.indexOf('B · do modelo'),
    );
    const escopo = (nome: string) =>
      regras.find((regra: { nome: string }) => regra.nome === nome)?.escopo;
    expect(escopo('A · do ativo')).toEqual({ tipo: 'ativo', id: ativo, nome: 'Impressora do RH' });
    expect(escopo('B · do modelo')).toEqual({
      tipo: 'modelo',
      id: modelo,
      nome: 'HP LaserJet M404',
    });
    expect(escopo('C · do local')).toEqual({ tipo: 'local', id: alertas.jundiai, nome: 'Jundiaí' });
  });

  it('recusa o que não confere, com a mensagem do domínio no campo', async () => {
    const r = await cadastrar(doToner({ nome: nomeNovo(), parametros: { limite: 120, folga: 5 } }));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ limite: 'Informe um limite de 1 a 99%.' });
    const semNome = await cadastrar(doToner({ nome: '  ' }));
    expect(semNome.json().campos).toEqual({ nome: 'Informe o nome da regra.' });
  });

  it('recusa o nome de outra regra da organização', async () => {
    await cadastrar(doToner({ nome: 'Toner repetido' }));
    const r = await cadastrar(doToner({ nome: 'TONER REPETIDO' }));
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({ nome: 'Já existe uma regra com esse nome.' });
  });

  it('recusa o escopo inativo, de outro registro ou que não existe', async () => {
    const tipoParado = await cadastrar(
      doToner({ nome: nomeNovo(), escopo: { tipo: 'tipo', id: tipoInativo } }),
    );
    expect(tipoParado.statusCode).toBe(400);
    expect(tipoParado.json().campos).toEqual({ escopo: 'Escolha um tipo ativo.' });
    const localParado = await cadastrar(
      doToner({ nome: nomeNovo(), escopo: { tipo: 'local', id: localInativo } }),
    );
    expect(localParado.json().campos).toEqual({ escopo: 'Escolha um local ativo.' });
    // O id de um ativo dado como modelo não é um modelo.
    const trocado = await cadastrar(
      doToner({ nome: nomeNovo(), escopo: { tipo: 'modelo', id: ativo } }),
    );
    expect(trocado.json().campos).toEqual({ escopo: 'Escolha um modelo ativo.' });
  });

  it('Exceção do modelo: cadastra a regra com as exceções, com o nome de cada lugar', async () => {
    const r = await cadastrar(
      doToner({
        nome: nomeNovo(),
        escopo: ORGANIZACAO,
        excecoes: [
          { lugar: { tipo: 'modelo', id: modelo }, efeito: 'outro-limite', limite: 20, folga: 5 },
          { lugar: { tipo: 'ativo', id: ativo }, efeito: 'nao-alertar' },
        ],
      }),
    );
    expect(r.statusCode).toBe(201);
    expect(r.json().excecoes).toEqual([
      {
        lugar: { tipo: 'modelo', id: modelo, nome: 'HP LaserJet M404' },
        efeito: 'outro-limite',
        limite: 20,
        folga: 5,
      },
      { lugar: { tipo: 'ativo', id: ativo, nome: 'Impressora do RH' }, efeito: 'nao-alertar' },
    ]);
    const lida = await alertas.cliente.consultar(
      `/regras-de-alerta/${r.json().id}`,
      alertas.como('ana'),
    );
    expect(lida.json().excecoes).toHaveLength(2);
  });

  it('recusa a exceção num lugar inativo e a exceção na regra do coletor', async () => {
    const parado = await cadastrar(
      doToner({
        nome: nomeNovo(),
        excecoes: [{ lugar: { tipo: 'local', id: localInativo }, efeito: 'nao-alertar' }],
      }),
    );
    expect(parado.statusCode).toBe(400);
    expect(parado.json().campos).toEqual({ 'excecoes.0': 'Escolha um local ativo.' });
    const doColetor = await cadastrar({
      nome: nomeNovo(),
      condicao: 'coletor.sem-contato',
      parametros: { minutos: 10 },
      severidade: 'critico',
      escopo: ORGANIZACAO,
      excecoes: [{ lugar: { tipo: 'ativo', id: ativo }, efeito: 'nao-alertar' }],
    });
    expect(doColetor.statusCode).toBe(400);
    expect(doColetor.json().campos).toEqual({ excecoes: 'A regra do coletor não tem exceções.' });
  });

  it('edita a regra, com o antes e o depois na auditoria, e a condição não muda', async () => {
    const criada = (await cadastrar(doToner({ nome: 'Toner para editar' }))).json();
    const r = await editar(
      criada.id,
      doToner({
        nome: 'Toner editado',
        parametros: { limite: 10, folga: 5 },
        severidade: 'atencao',
        escopo: ORGANIZACAO,
      }),
    );
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      nome: 'Toner editado',
      parametros: { limite: 10, folga: 5 },
      severidade: 'atencao',
      escopo: { tipo: 'organizacao', id: null, nome: null },
    });
    expect(await auditoriaDaRequisicao(api, alertas.org, r)).toMatchObject([
      {
        acao: 'regra-de-alerta.alterada',
        antes: { nome: 'Toner para editar', parametros: { limite: 15, folga: 5 } },
        depois: { nome: 'Toner editado', parametros: { limite: 10, folga: 5 } },
      },
    ]);
    const outra = await editar(
      criada.id,
      doToner({ nome: 'Toner editado', condicao: 'rede.offline', parametros: {} }),
    );
    expect(outra.statusCode).toBe(400);
    expect(outra.json().campos).toEqual({
      condicao: 'A condição de uma regra não muda: cadastre outra regra.',
    });
  });

  it('a edição sem mudança não grava nada', async () => {
    const criada = (await cadastrar(doToner({ nome: 'Toner sem mudança' }))).json();
    await naOrganizacao(api.banco, alertas.org, (tx) => tx.delete(eventos));
    const r = await editar(criada.id, doToner({ nome: 'Toner sem mudança' }));
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, alertas.org, r)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('inativa e reativa, com a auditoria; a repetida não grava nada', async () => {
    const criada = (await cadastrar(doToner({ nome: 'Toner para inativar' }))).json();
    const inativada = await acao(criada.id, 'inativacao');
    expect(inativada.statusCode).toBe(200);
    expect(inativada.json().situacao).toBe('inativa');
    expect(await auditoriaDaRequisicao(api, alertas.org, inativada)).toMatchObject([
      {
        acao: 'regra-de-alerta.inativada',
        antes: { situacao: 'ativa' },
        depois: { situacao: 'inativa' },
      },
    ]);
    const deNovo = await acao(criada.id, 'inativacao');
    expect(await auditoriaDaRequisicao(api, alertas.org, deNovo)).toEqual([]);
    const reativada = await acao(criada.id, 'reativacao');
    expect(reativada.json().situacao).toBe('ativa');
    expect(await auditoriaDaRequisicao(api, alertas.org, reativada)).toMatchObject([
      { acao: 'regra-de-alerta.reativada' },
    ]);
  });

  it('lê uma regra e diz que não acha a de outra organização', async () => {
    const criada = (await cadastrar(doToner({ nome: 'Toner para ler' }))).json();
    const r = await alertas.cliente.consultar(
      `/regras-de-alerta/${criada.id}`,
      alertas.como('ana'),
    );
    expect(r.json()).toMatchObject({ id: criada.id, nome: 'Toner para ler' });
    const outra = await alertas.cliente.consultar(
      '/regras-de-alerta/0199d3a0-0000-7000-8000-000000000999',
      alertas.como('ana'),
    );
    expect(outra.statusCode).toBe(404);
    expect(outra.json().detail).toBe('Regra não encontrada.');
  });

  it('quem só vê os alertas lista as regras, sem cadastrar; quem não os vê, nem isso', async () => {
    const deDavi = await listar('davi');
    expect(deDavi.statusCode).toBe(200);
    expect(deDavi.json().permite).toEqual({ cadastrar: false });
    expect((await cadastrar(doToner({ nome: nomeNovo() }), 'davi')).statusCode).toBe(403);
    expect((await listar('carla')).statusCode).toBe(403);
    expect((await cadastrar(doToner({ nome: nomeNovo() }), 'carla')).statusCode).toBe(403);
  });

  it('com o módulo Alertas desligado, as rotas são recusadas', async () => {
    await desligarModulos(api, alertas.org, ['alertas']);
    try {
      const r = await listar();
      expect(r.statusCode).toBe(403);
      expect(r.json().type).toBe('urn:grafite:problema:modulo-desligado');
    } finally {
      await desligarModulos(api, alertas.org, []);
    }
  });
});
