// A liberação do cofre e o revelar e copiar pela API (spec cofre-de-segredos, "Liberação do cofre
// por 5 minutos", "Revelar e copiar" e "Valor cifrado em duas camadas", e
// verificacao-em-dois-passos, "Verificação no cofre"; design do P6, decisões 4 e 5): o código do
// app libera o cofre na sessão por 5 minutos, a revelação e a cópia pedem o cofre liberado, o
// segredo ativo e o alcance, e cada uma, mesmo recusada, fica na auditoria sem o valor.
import { codigosDeRecuperacao, naOrganizacao, segredos, sessoes } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CofreDeTeste,
  liberar,
  montarCofre,
  mudarSituacaoDoSegredo,
  type UsuarioDoCofre,
} from '../../test/cofre.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  criarPerfil,
} from '../../test/integracao.ts';
import { hashDoCodigo } from '../acesso/codigos.ts';
import { apagarDoisPassos } from '../acesso/dois-passos.ts';
import { gerarCodigoTotp } from '../acesso/totp.ts';
import { impressaoDaChaveMestra } from '../cofre/cifra.ts';

const host = 'grafite.cofre-revelacao.local';
const MINUTO = 60_000;
const CODIGO_INCORRETO =
  'Código incorreto. Confira se o relógio do celular está certo e tente de novo.';
const NAO_ABRE =
  'O cofre não abre este segredo: confira a chave mestra na configuração do servidor.';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';

beforeAll(async () => {
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
});

afterAll(async () => {
  await api?.fechar();
});

const consultar = (url: string, usuario: UsuarioDoCofre) =>
  cofre.cliente.consultar(url, cofre.como(usuario));
const enviar = (url: string, usuario: UsuarioDoCofre, pedido?: object) =>
  cofre.cliente.enviar('POST', url, cofre.como(usuario), pedido);

const codigoDe = (usuario: UsuarioDoCofre, adiante = 0) =>
  gerarCodigoTotp(
    cofre.contas[usuario].chaveDoApp ?? Buffer.alloc(0),
    api.relogio.agora().getTime() + adiante,
  );
const pedirLiberacao = (usuario: UsuarioDoCofre, codigo: string) =>
  enviar('/cofre/liberacao', usuario, { codigo });

/** Libera o cofre com o código do intervalo seguinte, que ainda não foi usado. */
async function liberarCofre(usuario: UsuarioDoCofre) {
  api.relogio.avancar(30_000);
  const r = await pedirLiberacao(usuario, codigoDe(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return r;
}

const revelar = (id: string, usuario: UsuarioDoCofre) =>
  enviar(`/cofre/segredos/${id}/revelacao`, usuario);
const copiar = (id: string, usuario: UsuarioDoCofre) =>
  enviar(`/cofre/segredos/${id}/copia`, usuario);

let nomes = 0;
/** Um segredo cadastrado por quem administra, liberado aos titulares dados. */
async function segredoNovo(
  valor: string,
  titulares: Parameters<typeof liberar>[3][] = [],
  nome = `Segredo ${++nomes}`,
) {
  const r = await enviar('/cofre/segredos', 'ana', {
    nome,
    tipo: 'conta-administrativa',
    classificacao: 'equipamento',
    valor,
  });
  expect(r.statusCode, r.body).toBe(201);
  const id = r.json().id as string;
  for (const titular of titulares) await liberar(api, org, id, titular);
  return id;
}

const liberacaoDaSessao = async (usuario: UsuarioDoCofre) =>
  (await consultar('/cofre/liberacao', usuario)).json().liberadoAte;

describe('liberação do cofre', () => {
  it('o código usado na entrada não libera, e o seguinte libera por 5 minutos', async () => {
    expect(await liberacaoDaSessao('bruno')).toBeNull();
    const usado = await pedirLiberacao('bruno', codigoDe('bruno'));
    expect(usado.statusCode).toBe(401);
    expect(usado.json()).toMatchObject({
      type: 'urn:grafite:problema:codigo-invalido',
      detail: CODIGO_INCORRETO,
    });
    expect(await auditoriaDaRequisicao(api, org, usado)).toMatchObject([
      { acao: 'liberacao-do-cofre.recusada', atorContaId: cofre.contas.bruno.id },
    ]);

    const r = await liberarCofre('bruno');
    const ate = new Date(api.relogio.agora().getTime() + 5 * MINUTO).toISOString();
    expect(r.json()).toEqual({ liberadoAte: ate });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'cofre.liberado', alvoTipo: 'sessao', dados: { ate } },
    ]);
    expect(await liberacaoDaSessao('bruno')).toBe(ate);
  });

  it('o código de recuperação não libera e continua sem uso', async () => {
    const [codigo = ''] = cofre.contas.carla.codigos;
    const r = await pedirLiberacao('carla', codigo);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:codigo-de-recuperacao',
      detail: 'Use o código do app autenticador: os códigos de recuperação não liberam o cofre.',
    });
    const [guardado] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ usadoEm: codigosDeRecuperacao.usadoEm })
        .from(codigosDeRecuperacao)
        .where(eq(codigosDeRecuperacao.hash, hashDoCodigo(codigo))),
    );
    expect(guardado).toEqual({ usadoEm: null });
    expect(await liberacaoDaSessao('carla')).toBeNull();
  });

  it('o código errado é recusado, e a recusa fica na auditoria sem o código', async () => {
    const errado = codigoDe('carla', 10 * MINUTO);
    const r = await pedirLiberacao('carla', errado);
    expect(r.statusCode).toBe(401);
    expect(r.json().detail).toBe(CODIGO_INCORRETO);
    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros).toMatchObject([{ acao: 'liberacao-do-cofre.recusada' }]);
    expect(JSON.stringify(registros)).not.toContain(errado);
  });

  it('o limite de requisições da liberação é o da entrada', async () => {
    const { cookie, csrf } = cofre.como('carla');
    const pedir = () =>
      api.app.inject({
        method: 'POST',
        url: '/cofre/liberacao',
        remoteAddress: '10.77.0.1',
        headers: { host, cookie, 'x-grafite-csrf': csrf, 'sec-fetch-site': 'same-origin' },
        payload: { codigo: '000000' },
      });
    for (let i = 0; i < 20; i++) expect((await pedir()).statusCode).not.toBe(429);
    expect((await pedir()).statusCode).toBe(429);
  });

  it('quem não usa o cofre não o libera', async () => {
    expect((await pedirLiberacao('eva', codigoDe('eva', 30_000))).statusCode).toBe(403);
  });
});

describe('revelar e copiar', () => {
  let switchDoCpd = '';
  let deCarla = '';

  beforeAll(async () => {
    switchDoCpd = await segredoNovo(
      'S3nh@ do switch',
      [{ contaId: cofre.contas.bruno.id }],
      'Switch do CPD',
    );
    deCarla = await segredoNovo('câmera', [{ perfilId: cofre.perfis.tecnico }]);
  });

  it('com o cofre fechado, revelar e copiar são recusados, e a recusa fica na auditoria', async () => {
    const r = await revelar(deCarla, 'carla');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:cofre-fechado',
      detail: 'Confirme o código do app para revelar e copiar.',
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'revelacao-do-segredo.recusada',
        atorContaId: cofre.contas.carla.id,
        alvoTipo: 'segredo',
        alvoId: deCarla,
        dados: { motivo: 'cofre-fechado' },
      },
    ]);
    const c = await copiar(deCarla, 'carla');
    expect(c.statusCode).toBe(403);
    expect(await auditoriaDaRequisicao(api, org, c)).toMatchObject([
      { acao: 'copia-do-segredo.recusada', dados: { motivo: 'cofre-fechado' } },
    ]);
  });

  it('com o cofre liberado, revela e copia sem cache, e a auditoria não leva o valor', async () => {
    await liberarCofre('bruno');
    const r = await revelar(switchDoCpd, 'bruno');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ valor: 'S3nh@ do switch' });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers.pragma).toBe('no-cache');
    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros).toMatchObject([
      {
        acao: 'segredo.revelado',
        atorContaId: cofre.contas.bruno.id,
        alvoTipo: 'segredo',
        alvoId: switchDoCpd,
        ip: expect.any(String),
      },
    ]);
    expect(JSON.stringify(registros)).not.toContain('S3nh@');

    const c = await copiar(switchDoCpd, 'bruno');
    expect(c.statusCode).toBe(200);
    expect(c.json()).toEqual({ valor: 'S3nh@ do switch' });
    expect(c.headers['cache-control']).toBe('no-store');
    expect(await auditoriaDaRequisicao(api, org, c)).toMatchObject([
      { acao: 'segredo.copiado', alvoId: switchDoCpd },
    ]);
  });

  it('a consulta da auditoria mostra a revelação pelo nome do segredo, sem o valor', async () => {
    const leitura = await criarPerfil(api, org, {
      nome: 'Leitura da auditoria',
      permissoes: ['auditoria.ver'],
    });
    await atribuir(api, org, { perfilId: leitura, contaId: cofre.contas.ana.id });
    const r = await consultar('/auditoria?acao=segredo.revelado', 'ana');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().itens).toEqual([
      expect.objectContaining({
        rotulo: 'Segredo revelado',
        alvo: { tipo: 'segredo', id: switchDoCpd, nome: 'Switch do CPD', usuario: null },
      }),
    ]);
    expect(r.body).not.toContain('S3nh@');
  });

  it('o segredo inativo é recusado, com a recusa na auditoria', async () => {
    const id = await segredoNovo('antigo', [{ contaId: cofre.contas.bruno.id }]);
    await mudarSituacaoDoSegredo(api, org, id, 'inativo');
    await liberarCofre('bruno');
    const r = await revelar(id, 'bruno');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:segredo-inativo',
      detail: 'O segredo está inativo.',
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'revelacao-do-segredo.recusada', dados: { motivo: 'segredo-inativo' } },
    ]);
  });

  it('quem administra o cofre sem a liberação do segredo é recusado', async () => {
    const id = await segredoNovo('erp', [], 'Banco do ERP');
    const tirar = await cofre.cliente.enviar(
      'PUT',
      `/cofre/segredos/${id}/acesso`,
      cofre.como('ana'),
      { titulares: [{ tipo: 'grupo', id: cofre.suporte }] },
    );
    expect(tirar.statusCode).toBe(200);
    await liberarCofre('ana');
    const r = await revelar(id, 'ana');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:segredo-nao-liberado',
      detail: 'O segredo não está liberado para você.',
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'revelacao-do-segredo.recusada', dados: { motivo: 'nao-liberado' } },
    ]);
  });

  it('o acesso tirado vale na revelação seguinte, mesmo com o cofre liberado', async () => {
    const id = await segredoNovo('roteador', [{ contaId: cofre.contas.bruno.id }]);
    await liberarCofre('bruno');
    expect((await revelar(id, 'bruno')).statusCode).toBe(200);
    await cofre.cliente.enviar('PUT', `/cofre/segredos/${id}/acesso`, cofre.como('ana'), {
      titulares: [{ tipo: 'conta', id: cofre.contas.ana.id }],
    });
    const r = await revelar(id, 'bruno');
    expect(r.statusCode).toBe(403);
    expect(r.json().detail).toBe('O segredo não está liberado para você.');
  });

  it('o segredo que não existe é 404, sem auditoria', async () => {
    const r = await revelar('0199a3f0-0000-7000-8000-000000000123', 'bruno');
    expect(r.statusCode).toBe(404);
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
  });

  it('o segredo cuja chave não abre é recusado com a frase, sem nenhuma chave', async () => {
    const id = await segredoNovo('de outra chave', [{ contaId: cofre.contas.bruno.id }]);
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(segredos)
        .set({ impressaoDaChaveMestra: impressaoDaChaveMestra(Buffer.alloc(32, 1)) })
        .where(eq(segredos.id, id)),
    );
    await liberarCofre('bruno');
    const r = await revelar(id, 'bruno');
    expect(r.statusCode).toBe(500);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:segredo-nao-abre',
      detail: NAO_ABRE,
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'revelacao-do-segredo.recusada', dados: { motivo: 'segredo-nao-abre' } },
    ]);
  });

  it('o valor copiado no banco para outro segredo não decifra', async () => {
    const origem = await segredoNovo('valor de origem', [{ contaId: cofre.contas.bruno.id }]);
    const destino = await segredoNovo('valor de destino', [{ contaId: cofre.contas.bruno.id }]);
    await naOrganizacao(api.banco, org, async (tx) => {
      const [copiado] = await tx.select().from(segredos).where(eq(segredos.id, origem));
      if (!copiado) throw new Error('O segredo de origem sumiu.');
      await tx
        .update(segredos)
        .set({
          conteudoCifrado: copiado.conteudoCifrado,
          chaveCifrada: copiado.chaveCifrada,
          impressaoDaChaveMestra: copiado.impressaoDaChaveMestra,
        })
        .where(eq(segredos.id, destino));
    });
    await liberarCofre('bruno');
    const r = await revelar(destino, 'bruno');
    expect(r.statusCode).toBe(500);
    expect(r.json().detail).toBe(NAO_ABRE);
    expect(r.body).not.toContain('valor de origem');
  });

  it('a liberação termina depois dos 5 minutos', async () => {
    await liberarCofre('bruno');
    api.relogio.avancar(5 * MINUTO);
    const r = await revelar(switchDoCpd, 'bruno');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:cofre-fechado',
      detail: 'A liberação do cofre terminou. Confirme o código do app de novo.',
    });
    expect(await liberacaoDaSessao('bruno')).toBeNull();
  });
});

describe('fim da liberação pela verificação', () => {
  const liberadoAteDasSessoes = (contaId: string) =>
    naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ ate: sessoes.cofreLiberadoAte })
        .from(sessoes)
        .where(eq(sessoes.contaId, contaId)),
    );

  it('desativar os dois passos fecha o cofre em todas as sessões da conta', async () => {
    const { chaveDoApp } = cofre.contas.carla;
    api.relogio.avancar(30_000);
    const outra = await cofre.cliente.entrarComCodigo('carla', chaveDoApp ?? Buffer.alloc(0));
    await liberarCofre('carla');
    api.relogio.avancar(30_000);
    const naOutra = await cofre.cliente.enviar('POST', '/cofre/liberacao', outra, {
      codigo: codigoDe('carla'),
    });
    expect(naOutra.statusCode).toBe(200);
    expect((await liberadoAteDasSessoes(cofre.contas.carla.id)).filter((s) => s.ate)).toHaveLength(
      2,
    );

    api.relogio.avancar(30_000);
    const desativada = await enviar('/conta/dois-passos/desativacao', 'carla', {
      codigo: codigoDe('carla'),
    });
    expect(desativada.statusCode, desativada.body).toBe(204);
    expect((await liberadoAteDasSessoes(cofre.contas.carla.id)).every((s) => !s.ate)).toBe(true);
    const r = await revelar(deCarlaQualquer(), 'carla');
    expect(r.statusCode).toBe(403);
    expect(r.json().type).toBe('urn:grafite:problema:cofre-sem-dois-passos');
  });

  it('remover os dois passos da conta fecha o cofre dela', async () => {
    await liberarCofre('bruno');
    expect((await liberadoAteDasSessoes(cofre.contas.bruno.id)).some((s) => s.ate)).toBe(true);
    await naOrganizacao(api.banco, org, (tx) => apagarDoisPassos(tx, cofre.contas.bruno.id));
    expect((await liberadoAteDasSessoes(cofre.contas.bruno.id)).every((s) => !s.ate)).toBe(true);
  });
});

/** Um id qualquer: a conta sem os dois passos é recusada antes de o segredo ser lido. */
const deCarlaQualquer = () => '0199a3f0-0000-7000-8000-000000000456';
