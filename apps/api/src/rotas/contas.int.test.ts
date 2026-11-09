// As contas pela administração (specs administracao-de-pessoas, contas-de-acesso e
// verificacao-em-dois-passos): a conta criada para uma pessoa com a senha temporária mostrada uma
// vez, a mudança do usuário e da exigência, e os cuidados com a conta de outra pessoa.
import {
  atribuicoes,
  auditoria,
  codigosDeRecuperacao,
  doisPassos,
  naOrganizacao,
  sessoes,
  tentativasDeEntrada,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  type Entrada,
  novoIp,
  SEM_ENTRADA,
  SENHA_DE_TESTE,
} from '../../test/integracao.ts';

const host = 'grafite.administracao-de-contas.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const ids: Record<string, string> = {};
const entradas: Record<string, Entrada> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);

  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  const editor = await criarPerfil(api, org, { nome: 'Editor', permissoes: ['pessoas.editar'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administrador, contaId: ana.id });
  ids.contaDaAna = ana.id;
  const elisa = await criarConta(api, org, { usuario: 'elisa', nome: 'Elisa Prado' });
  await atribuir(api, org, { perfilId: editor, contaId: elisa.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  ids.bruno = bruno.pessoaId;
  ids.contaDoBruno = bruno.id;

  ids.joao = await criarPessoa(api, org, { nome: 'João Pereira' });
  ids.ines = await criarPessoa(api, org, { nome: 'Inês Moura', situacao: 'inativa' });

  for (const usuario of ['ana', 'elisa']) entradas[usuario] = await cliente.entrar(usuario);
});

afterAll(async () => {
  await api?.fechar();
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

const criarAConta = (usuario: string, pessoaId: string, pedido: object) =>
  cliente.enviar('POST', `/pessoas/${pessoaId}/conta`, como(usuario), pedido);

const alterarAConta = (usuario: string, contaId: string, pedido: object) =>
  cliente.enviar('PATCH', `/contas/${contaId}`, como(usuario), pedido);

describe('POST /pessoas/:id/conta', () => {
  let senhaDoJoao = '';

  it('cria a conta com a senha temporária, mostrada uma vez só', async () => {
    const r = await criarAConta('ana', ids.joao ?? '', { usuario: ' Joao.Pereira ' });
    expect(r.statusCode).toBe(201);
    const corpo = r.json();
    senhaDoJoao = corpo.senhaTemporaria;
    expect(senhaDoJoao).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(corpo.conta).toMatchObject({
      id: expect.any(String),
      usuario: 'joao.pereira',
      situacao: 'ativa',
      exigeDoisPassos: false,
      doisPassos: 'desativada',
      senhaTemporaria: true,
      entradaBloqueadaAte: null,
      ultimaEntradaEm: null,
      permite: {
        editar: true,
        redefinir: true,
        removerDoisPassos: false,
        desbloquear: false,
        inativar: true,
        reativar: false,
        encerrarSessoes: true,
      },
    });
    ids.contaDoJoao = corpo.conta.id;

    const ficha = await cliente.consultar(`/pessoas/${ids.joao}`, como('ana'));
    expect(ficha.json().conta).toMatchObject({ usuario: 'joao.pereira', senhaTemporaria: true });
    expect(ficha.body).not.toContain(senhaDoJoao);
  });

  it('faz a primeira entrada pedir a troca da senha temporária', async () => {
    const r = await api.app.inject({
      method: 'POST',
      url: '/sessao',
      headers: { host, 'sec-fetch-site': 'same-origin' },
      payload: { usuario: 'joao.pereira', senha: senhaDoJoao },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().sessao.pendencia).toBe('trocar-senha');
  });

  it('registra a criação na auditoria, sem a senha', async () => {
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(auditoria)
        .where(eq(auditoria.alvoId, ids.contaDoJoao ?? '')),
    );
    expect(registros.find((registro) => registro.acao === 'conta.criada')).toMatchObject({
      atorTipo: 'conta',
      atorContaId: ids.contaDaAna,
      alvoTipo: 'conta',
      depois: {
        usuario: 'joao.pereira',
        pessoaId: ids.joao,
        senhaTemporaria: true,
        exigeDoisPassos: false,
        situacao: 'ativa',
      },
    });
    expect(JSON.stringify(registros)).not.toContain(senhaDoJoao);
  });

  it('recusa a pessoa inativa e a que já tem conta', async () => {
    const inativa = await criarAConta('ana', ids.ines ?? '', { usuario: 'ines' });
    expect(inativa.statusCode).toBe(409);
    expect(inativa.json().detail).toBe('Reative a pessoa antes de criar a conta dela.');
    const comConta = await criarAConta('ana', ids.bruno ?? '', { usuario: 'bruno.costa' });
    expect(comConta.statusCode).toBe(409);
    expect(comConta.json().detail).toBe('Esta pessoa já tem uma conta.');
  });

  it('recusa o usuário fora da regra e o de outra conta, no campo do usuário', async () => {
    const pessoa = await criarPessoa(api, org, { nome: 'Carla Dias' });
    const curto = await criarAConta('ana', pessoa, { usuario: 'cd' });
    expect(curto.statusCode).toBe(400);
    expect(curto.json().campos).toEqual({ usuario: 'Use de 3 a 64 caracteres.' });
    const acento = await criarAConta('ana', pessoa, { usuario: 'cárla' });
    expect(acento.json().campos).toEqual({
      usuario: 'Use só letras sem acento, números, ponto (.), hífen (-) e sublinhado (_).',
    });
    const repetido = await criarAConta('ana', pessoa, { usuario: 'BRUNO' });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ usuario: 'Este usuário já é de outra conta.' });
  });

  it('cria a conta que exige os dois passos', async () => {
    const pessoa = await criarPessoa(api, org, { nome: 'Davi Rocha' });
    const r = await criarAConta('ana', pessoa, { usuario: 'davi', exigeDoisPassos: true });
    expect(r.json().conta).toMatchObject({ exigeDoisPassos: true });
  });

  it('exige contas.administrar', async () => {
    const pessoa = await criarPessoa(api, org, { nome: 'Fábio Mendes' });
    const r = await criarAConta('elisa', pessoa, { usuario: 'fabio' });
    expect(r.statusCode).toBe(403);
    expect(r.json().permissao).toBe('contas.administrar');
  });
});

describe('PATCH /contas/:id', () => {
  it('muda o usuário e a exigência dos dois passos, com o antes → depois', async () => {
    const r = await alterarAConta('ana', ids.contaDoBruno ?? '', {
      usuario: 'bruno.costa',
      exigeDoisPassos: true,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ usuario: 'bruno.costa', exigeDoisPassos: true });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'conta.alterada',
        alvoId: ids.contaDoBruno,
        antes: { usuario: 'bruno', exigeDoisPassos: false },
        depois: { usuario: 'bruno.costa', exigeDoisPassos: true },
      },
    ]);
    const entrada = await cliente.entrar('bruno.costa');
    const sessao = await cliente.consultar('/sessao', entrada);
    expect(sessao.json().sessao.pendencia).toBe('cadastrar-dois-passos');
  });

  it('recusa o usuário fora da regra e o de outra conta', async () => {
    const regra = await alterarAConta('ana', ids.contaDoBruno ?? '', { usuario: '.bruno' });
    expect(regra.json().campos).toEqual({ usuario: 'Comece por uma letra ou um número.' });
    const repetido = await alterarAConta('ana', ids.contaDoBruno ?? '', { usuario: 'elisa' });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ usuario: 'Este usuário já é de outra conta.' });
  });

  it('recusa a própria conta, que se cuida nos Ajustes', async () => {
    const r = await alterarAConta('ana', ids.contaDaAna ?? '', { usuario: 'ana.souza' });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:propria-conta',
      detail: 'Cuide da sua conta na seção Conta dos Ajustes.',
    });
  });

  it('responde 404 à conta que não existe e exige contas.administrar', async () => {
    const inexistente = await alterarAConta('ana', '0199a000-0000-7000-8000-000000000000', {
      usuario: 'qualquer',
    });
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.json().detail).toBe('Conta não encontrada.');
    expect(
      (await alterarAConta('elisa', ids.contaDoJoao ?? '', { usuario: 'joao.p' })).statusCode,
    ).toBe(403);
  });
});

describe('redefinição, remoção dos dois passos e desbloqueio', () => {
  const conta: Record<string, string> = {};

  beforeAll(async () => {
    const exigente = await criarPerfil(api, org, { nome: 'Exigente', exigeDoisPassos: true });
    for (const [usuario, nome] of [
      ['heitor', 'Heitor Lima'],
      ['gil', 'Gil Souza'],
      ['ivo', 'Ivo Ramos'],
      ['jade', 'Jade Nunes'],
    ] as const) {
      conta[usuario] = (await criarConta(api, org, { usuario, nome })).id;
    }
    await ativarDoisPassos(api, org, conta.gil ?? '');
    await ativarDoisPassos(api, org, conta.ivo ?? '');
    await atribuir(api, org, { perfilId: exigente, contaId: conta.ivo });
  });

  const acao = (usuario: string, contaId: string, caminho: string, pedido?: object) =>
    cliente.enviar('POST', `/contas/${contaId}/${caminho}`, como(usuario), pedido);

  const motivosDoFim = (contaId: string) =>
    naOrganizacao(api.banco, org, async (tx) =>
      (
        await tx
          .select({ motivo: sessoes.motivoDoFim })
          .from(sessoes)
          .where(eq(sessoes.contaId, contaId))
      ).map((sessao) => sessao.motivo),
    );

  const entrarCom = (usuario: string, senha: string) =>
    api.app.inject({
      method: 'POST',
      url: '/sessao',
      remoteAddress: novoIp(),
      headers: { host, 'sec-fetch-site': 'same-origin' },
      payload: { usuario, senha },
    });

  it('redefine a senha: temporária nova, sessões encerradas e tentativas zeradas', async () => {
    const sessoesDoHeitor = [await cliente.entrar('heitor'), await cliente.entrar('heitor')];
    expect((await entrarCom('heitor', 'senha errada')).statusCode).toBe(401);

    const r = await acao('ana', conta.heitor ?? '', 'redefinicao', {});
    expect(r.statusCode).toBe(200);
    const { senhaTemporaria } = r.json();
    expect(senhaTemporaria).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(r.json().conta).toMatchObject({ usuario: 'heitor', senhaTemporaria: true });

    for (const entrada of sessoesDoHeitor) {
      expect((await cliente.consultar('/conta', entrada)).statusCode).toBe(401);
    }
    expect(await motivosDoFim(conta.heitor ?? '')).toEqual(['redefinicao', 'redefinicao']);
    const [tentativa] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(tentativasDeEntrada).where(eq(tentativasDeEntrada.usuario, 'heitor')),
    );
    expect(tentativa).toMatchObject({ falhasSeguidas: 0, bloqueadaAte: null });

    expect((await entrarCom('heitor', SENHA_DE_TESTE)).statusCode).toBe(401);
    const nova = await entrarCom('heitor', senhaTemporaria);
    expect(nova.json().sessao.pendencia).toBe('trocar-senha');

    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros.find((registro) => registro.acao === 'acesso.redefinido')).toMatchObject({
      alvoTipo: 'conta',
      alvoId: conta.heitor,
      antes: { senhaTemporaria: false },
      depois: { senhaTemporaria: true },
      dados: { doisPassosRemovidos: false, sessoesEncerradas: 2 },
    });
    expect(JSON.stringify(registros)).not.toContain(senhaTemporaria);
  });

  it('redefine removendo os dois passos, quando pedido', async () => {
    await cliente.entrar('gil');
    const r = await acao('ana', conta.gil ?? '', 'redefinicao', { removerDoisPassos: true });
    expect(r.json().conta).toMatchObject({ doisPassos: 'desativada' });
    const restante = await naOrganizacao(api.banco, org, async (tx) => ({
      chave: await tx
        .select()
        .from(doisPassos)
        .where(eq(doisPassos.contaId, conta.gil ?? '')),
      codigos: await tx
        .select()
        .from(codigosDeRecuperacao)
        .where(eq(codigosDeRecuperacao.contaId, conta.gil ?? '')),
    }));
    expect(restante).toEqual({ chave: [], codigos: [] });
    const nova = await entrarCom('gil', r.json().senhaTemporaria);
    expect(nova.json().sessao.pendencia).toBe('trocar-senha');
    expect(
      (await auditoriaDaRequisicao(api, org, r)).find(
        (registro) => registro.acao === 'acesso.redefinido',
      ),
    ).toMatchObject({ dados: { doisPassosRemovidos: true, sessoesEncerradas: 1 } });
  });

  it('remove os dois passos, e a próxima entrada pede o cadastro de novo quando o perfil exige', async () => {
    const pendente = await entrarCom('ivo', SENHA_DE_TESTE);
    expect(pendente.json().sessao.pendencia).toBe('segundo-passo');

    const r = await acao('ana', conta.ivo ?? '', 'remocao-dos-dois-passos');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      doisPassos: 'desativada',
      permite: { removerDoisPassos: false },
    });
    expect(await motivosDoFim(conta.ivo ?? '')).toEqual(['dois-passos-removidos']);
    const depois = await entrarCom('ivo', SENHA_DE_TESTE);
    expect(depois.json().sessao.pendencia).toBe('cadastrar-dois-passos');
    expect(
      (await auditoriaDaRequisicao(api, org, r)).map((registro) => registro.acao).sort(),
    ).toEqual(['dois-passos.removidos', 'sessao.encerrada']);
  });

  it('desbloqueia a entrada, zerando as tentativas', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(tentativasDeEntrada).values({
        orgId: org,
        usuario: 'jade',
        falhasSeguidas: 6,
        bloqueadaAte: new Date(api.relogio.agora().getTime() + 120_000),
      }),
    );
    expect((await entrarCom('jade', SENHA_DE_TESTE)).statusCode).toBe(429);
    const [jade] = (await cliente.consultar('/pessoas?busca=jade', como('ana'))).json().itens;
    const ficha = (await cliente.consultar(`/pessoas/${jade.id}`, como('ana'))).json();
    expect(ficha.conta).toMatchObject({
      entradaBloqueadaAte: new Date(api.relogio.agora().getTime() + 120_000).toISOString(),
      permite: { desbloquear: true },
    });

    const r = await acao('ana', conta.jade ?? '', 'desbloqueio');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ entradaBloqueadaAte: null, permite: { desbloquear: false } });
    expect((await entrarCom('jade', SENHA_DE_TESTE)).statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'entrada.desbloqueada', alvoTipo: 'conta', alvoId: conta.jade },
    ]);
  });

  it('recusa a própria conta e exige contas.administrar', async () => {
    for (const caminho of ['redefinicao', 'remocao-dos-dois-passos', 'desbloqueio']) {
      const propria = await acao('ana', ids.contaDaAna ?? '', caminho, {});
      expect(propria.statusCode).toBe(409);
      expect(propria.json().type).toBe('urn:grafite:problema:propria-conta');
      expect((await acao('elisa', conta.heitor ?? '', caminho, {})).statusCode).toBe(403);
    }
  });
});

describe('inativação, reativação e sessões da conta', () => {
  const conta: Record<string, string> = {};
  const pessoa: Record<string, string> = {};

  beforeAll(async () => {
    const leitor = await criarPerfil(api, org, { nome: 'Leitor', permissoes: ['pessoas.ver'] });
    const gestor = await criarPerfil(api, org, {
      nome: 'Gestor de contas',
      permissoes: ['contas.administrar'],
    });
    for (const [usuario, nome] of [
      ['leo', 'Léo Prado'],
      ['maria', 'Maria Luz'],
      ['nina', 'Nina Alves'],
    ] as const) {
      const criada = await criarConta(api, org, { usuario, nome });
      conta[usuario] = criada.id;
      pessoa[usuario] = criada.pessoaId;
    }
    ids.atribuicaoDoLeo = await atribuir(api, org, { perfilId: leitor, contaId: conta.leo });
    await atribuir(api, org, { perfilId: gestor, contaId: conta.nina });
    entradas.nina = await cliente.entrar('nina');
    const inativada = await cliente.enviar(
      'POST',
      `/pessoas/${pessoa.maria}/inativacao`,
      como('ana'),
    );
    expect(inativada.statusCode).toBe(200);
  });

  const acao = (usuario: string, contaId: string, caminho: string) =>
    cliente.enviar('POST', `/contas/${contaId}/${caminho}`, como(usuario));

  it('inativa a conta, encerra as sessões e mantém as atribuições', async () => {
    const sessoesDoLeo = [await cliente.entrar('leo'), await cliente.entrar('leo')];
    const r = await acao('ana', conta.leo ?? '', 'inativacao');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'inativa',
      permite: { inativar: false, reativar: true, encerrarSessoes: false },
    });
    for (const entrada of sessoesDoLeo) {
      expect((await cliente.consultar('/conta', entrada)).statusCode).toBe(401);
    }
    const [atribuicao] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ encerradaEm: atribuicoes.encerradaEm })
        .from(atribuicoes)
        .where(eq(atribuicoes.id, ids.atribuicaoDoLeo ?? '')),
    );
    expect(atribuicao?.encerradaEm).toBeNull();
    expect(
      (await auditoriaDaRequisicao(api, org, r)).map((registro) => registro.acao).sort(),
    ).toEqual(['conta.inativada', 'sessao.encerrada', 'sessao.encerrada']);
    await expect(cliente.entrar('leo')).rejects.toThrow('credenciais-invalidas');
  });

  it('reativa a conta da pessoa ativa', async () => {
    const r = await acao('ana', conta.leo ?? '', 'reativacao');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ situacao: 'ativa', permite: { inativar: true } });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'conta.reativada',
        alvoId: conta.leo,
        antes: { situacao: 'inativa' },
        depois: { situacao: 'ativa' },
      },
    ]);
    await expect(cliente.entrar('leo')).resolves.toMatchObject({ csrf: expect.any(String) });
  });

  it('recusa reativar a conta de uma pessoa inativa', async () => {
    const r = await acao('ana', conta.maria ?? '', 'reativacao');
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe('Reative a pessoa antes de reativar a conta dela.');
  });

  it('recusa a própria conta', async () => {
    const r = await acao('ana', ids.contaDaAna ?? '', 'inativacao');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:propria-conta',
      detail: 'Use outra conta para inativar a sua.',
    });
    const sessoes = await cliente.enviar(
      'DELETE',
      `/contas/${ids.contaDaAna}/sessoes`,
      como('ana'),
    );
    expect(sessoes.statusCode).toBe(409);
  });

  it('recusa deixar a organização sem ninguém para administrar os acessos', async () => {
    const r = await acao('nina', ids.contaDaAna ?? '', 'inativacao');
    expect(r.statusCode).toBe(409);
    expect(r.json().type).toBe('urn:grafite:problema:ultimo-administrador');
    expect((await cliente.consultar('/conta', como('ana'))).statusCode).toBe(200);
  });

  it('lista as sessões abertas sem nenhum token e encerra todas', async () => {
    const entradasDoLeo = [await cliente.entrar('leo'), await cliente.entrar('leo')];
    const lista = await cliente.consultar(`/contas/${conta.leo}/sessoes`, como('ana'));
    expect(lista.statusCode).toBe(200);
    const sessoesAbertas = lista.json() as Record<string, unknown>[];
    expect(sessoesAbertas.length).toBeGreaterThanOrEqual(2);
    for (const sessao of sessoesAbertas) {
      expect(Object.keys(sessao).sort()).toEqual([
        'criadaEm',
        'dispositivo',
        'id',
        'ip',
        'ultimoUsoEm',
      ]);
    }
    for (const { csrf } of entradasDoLeo) expect(lista.body).not.toContain(csrf);

    const r = await cliente.enviar('DELETE', `/contas/${conta.leo}/sessoes`, como('ana'));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ encerradas: sessoesAbertas.length });
    for (const entrada of entradasDoLeo) {
      expect((await cliente.consultar('/conta', entrada)).statusCode).toBe(401);
    }
    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros.find((registro) => registro.acao === 'sessoes.encerradas')).toMatchObject({
      alvoTipo: 'conta',
      alvoId: conta.leo,
      dados: { encerradas: sessoesAbertas.length },
    });
    expect(
      registros.filter((registro) => registro.acao === 'sessao.encerrada').map((r) => r.dados),
    ).toEqual(sessoesAbertas.map(() => ({ motivo: 'encerrada-pela-administracao' })));
    expect((await cliente.consultar(`/contas/${conta.leo}/sessoes`, como('ana'))).json()).toEqual(
      [],
    );
  });

  it('exige contas.administrar', async () => {
    expect((await acao('elisa', conta.leo ?? '', 'inativacao')).statusCode).toBe(403);
    expect((await acao('elisa', conta.leo ?? '', 'reativacao')).statusCode).toBe(403);
    expect(
      (await cliente.consultar(`/contas/${conta.leo}/sessoes`, como('elisa'))).statusCode,
    ).toBe(403);
    expect(
      (await cliente.enviar('DELETE', `/contas/${conta.leo}/sessoes`, como('elisa'))).statusCode,
    ).toBe(403);
  });
});
