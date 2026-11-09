// Os módulos opcionais pela API (spec modulos-da-organizacao; design do P1b, decisão 12): quem
// define os padrões da organização liga e desliga o Ativos, com a auditoria e o evento; o estado da
// sessão diz os desligados; e as rotas do catálogo e dos ativos são recusadas com o módulo
// desligado, e voltam ao ligar, com os dados.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.modulos.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
let tipoId = '';

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['organizacao.editar', 'catalogo.administrar', 'ativos.editar', 'modelos.editar'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  for (const usuario of ['ana', 'carla']) entradas[usuario] = await cliente.entrar(usuario);
  const tipo = await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), {
    nome: 'Impressora',
    icone: 'impressora',
  });
  tipoId = tipo.json().id;
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const ligar = (ligado: boolean, modulo = 'ativos') =>
  cliente.enviar('PUT', `/organizacao/modulos/${modulo}`, como('ana'), { ligado });

describe('módulos opcionais', () => {
  it('lista os opcionais, ligados por padrão, para quem define os padrões', async () => {
    const r = await cliente.consultar('/organizacao/modulos', como('ana'));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      modulos: [
        {
          id: 'ativos',
          nome: 'Ativos',
          descricao: 'O catálogo, o cadastro e a lista dos ativos.',
          ligado: true,
        },
        {
          id: 'cofre',
          nome: 'Cofre',
          descricao: 'Os segredos da organização, com o acesso por segredo.',
          ligado: true,
        },
        {
          id: 'alertas',
          nome: 'Alertas',
          descricao: 'As regras de alerta e os alertas dos ativos e dos coletores.',
          ligado: true,
        },
        {
          id: 'operacao',
          nome: 'Operação',
          descricao:
            'Os consumíveis, os modelos em que eles servem, o estoque por local, as solicitações, as ordens de serviço e os indicadores da operação.',
          ligado: true,
        },
        // Os módulos das changes salas-de-reuniao e painel-de-dashboards.
        {
          id: 'salas',
          nome: 'Salas',
          descricao: 'As salas de reunião, a agenda, os pedidos de reserva e os convites.',
          ligado: true,
        },
        {
          id: 'paineis',
          nome: 'Painéis',
          descricao:
            'Os painéis das VMs, a verificação de cada um e a grade que os mostra lado a lado.',
          ligado: true,
        },
      ],
    });
    expect((await cliente.consultar('/organizacao/modulos', como('carla'))).statusCode).toBe(403);
    const sessao = await cliente.consultar('/sessao', como('carla'));
    expect(sessao.json().organizacao.modulosDesligados).toEqual([]);
  });

  it('desliga o Ativos, com a auditoria e o evento, e a repetida não grava nada', async () => {
    const r = await ligar(false);
    expect(r.statusCode).toBe(200);
    expect(r.json().modulos[0]).toMatchObject({ id: 'ativos', ligado: false });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'modulo.desligado', alvoTipo: 'modulo', dados: { modulo: 'Ativos' } },
    ]);
    const gravados = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ tipo: eventos.tipo, todas: eventos.todas }).from(eventos),
    );
    expect(gravados).toEqual([{ tipo: 'modulos.mudaram', todas: true }]);
    const repetida = await ligar(false);
    expect(await auditoriaDaRequisicao(api, org, repetida)).toEqual([]);
    const sessao = await cliente.consultar('/sessao', como('carla'));
    expect(sessao.json().organizacao.modulosDesligados).toEqual(['ativos']);
  });

  it('com o Ativos desligado, as rotas do catálogo e dos ativos são recusadas', async () => {
    for (const [metodo, caminho] of [
      ['GET', '/tipos-de-ativo'],
      ['GET', '/campos'],
      ['GET', '/capacidades'],
      ['GET', '/modelos'],
      ['GET', '/ativos'],
    ] as const) {
      const r = await cliente.consultar(caminho, como('ana'));
      expect(r.statusCode, `${metodo} ${caminho}`).toBe(403);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:modulo-desligado',
        detail: 'O módulo Ativos está desligado nesta organização.',
      });
    }
    const cadastro = await cliente.enviar('POST', '/ativos', como('ana'), { tipoId, valores: {} });
    expect(cadastro.statusCode).toBe(403);
    expect((await cliente.consultar('/ativos', SEM_ENTRADA)).statusCode).toBe(401);
    // O que não é do módulo continua.
    expect((await cliente.consultar('/pessoas/nomes', como('carla'))).statusCode).toBe(200);
  });

  it('ligar de novo traz o módulo como estava', async () => {
    const r = await ligar(true);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'modulo.ligado', dados: { modulo: 'Ativos' } },
    ]);
    const tipos = await cliente.consultar('/tipos-de-ativo', como('ana'));
    expect(tipos.statusCode).toBe(200);
    expect(tipos.json().tipos.map((tipo: { id: string }) => tipo.id)).toEqual([tipoId]);
  });

  it('recusa o módulo que não é opcional', async () => {
    const r = await ligar(false, 'administracao');
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Módulo não encontrado.');
  });
});
