// As ligações livres pela API (spec ligacoes-de-ativos, "Ligação livre" e "Acesso às ligações";
// design do P1d, decisão 3): ligar e desfazer com `ativos.editar` nos locais dos dois ativos, com as
// duas linhas travadas, o limite de cada um, as recusas, um registro de auditoria e um evento em cada
// ativo; e o par em ordem, que não entra duas vezes, de nenhum dos lados.
import { ativos, eventos, ligacoesDeAtivos, naOrganizacao } from '@grafite/db';
import { eq, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const host = 'grafite.ativos-ligacoes.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};
const id = (chave: string) => ids[chave] ?? '';
const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['ativos.editar', 'catalogo.administrar'],
  });
  const editar = await criarPerfil(api, org, { nome: 'Editar', permissoes: ['ativos.editar'] });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  ids.contaDoBruno = bruno.id;
  await atribuir(api, org, { perfilId: editar, contaId: bruno.id, localId: id('jundiai') });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: ver, contaId: carla.id });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);

  const tipo = async (nome: string, icone: string) =>
    (await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), { nome, icone })).json()
      .id as string;
  ids.tipoNobreak = await tipo('Nobreak', 'nobreak');
  ids.tipoSwitch = await tipo('Switch', 'switch');
  const ativo = async (tipoId: string, nome: string, localId: string) =>
    (
      await cliente.enviar('POST', '/ativos', como('ana'), {
        tipoId,
        valores: { 'ativo.nome': nome, 'ativo.local': localId },
      })
    ).json().id as string;
  ids.nobreak = await ativo(id('tipoNobreak'), 'Nobreak do rack', id('jundiai'));
  ids.switch = await ativo(id('tipoSwitch'), 'Switch do rack', id('jundiai'));
  ids.emCampinas = await ativo(id('tipoSwitch'), 'Switch de Campinas', id('campinas'));
  ids.parado = await ativo(id('tipoSwitch'), 'Switch parado', id('jundiai'));
  await cliente.enviar('POST', `/ativos/${id('parado')}/inativacao`, como('ana'));
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const ligar = (esteId: string, outroId: string, usuario = 'bruno') =>
  cliente.enviar('POST', `/ativos/${esteId}/ligacoes`, como(usuario), { outroId });
const desfazer = (esteId: string, ligacaoId: string, usuario = 'bruno') =>
  cliente.enviar('DELETE', `/ativos/${esteId}/ligacoes/${ligacaoId}`, como(usuario));

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tipo: eventos.tipo, alvoId: eventos.alvoId, locais: eventos.locais }).from(eventos),
  );

/** As ligações de um ativo, de qualquer lado do par. */
const ligacoesDe = (ativoId: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select()
      .from(ligacoesDeAtivos)
      .where(or(eq(ligacoesDeAtivos.ativoA, ativoId), eq(ligacoesDeAtivos.ativoB, ativoId))),
  );

const porAlvo = <T extends { alvoId: string | null }>(registros: T[]) =>
  [...registros].sort((a, b) => String(a.alvoId).localeCompare(String(b.alvoId)));

/** Os registros da auditoria da requisição: um em cada ativo, em qualquer ordem. */
async function registrosNosDois(
  resposta: { headers: Record<string, unknown> },
  esperados: unknown[],
) {
  const registros = await auditoriaDaRequisicao(api, org, resposta);
  expect(registros).toHaveLength(esperados.length);
  expect(registros).toEqual(expect.arrayContaining(esperados));
}

describe('ligar', () => {
  it('liga dois ativos, com um registro de auditoria e um evento em cada um', async () => {
    const r = await ligar(id('nobreak'), id('switch'));
    expect(r.statusCode).toBe(201);
    const ligacao = r.json();
    ids.ligacao = ligacao.id;
    expect(ligacao.outro).toMatchObject({ id: ids.switch, rotulo: 'Switch do rack' });

    const [gravada] = await ligacoesDe(id('nobreak'));
    const par = [id('nobreak'), id('switch')].sort();
    expect(gravada).toMatchObject({
      id: ligacao.id,
      ativoA: par[0],
      ativoB: par[1],
      criadoPor: ids.contaDoBruno,
    });

    await registrosNosDois(r, [
      expect.objectContaining({
        acao: 'ativo.ligado',
        alvoTipo: 'ativo',
        alvoId: id('nobreak'),
        dados: { ligacaoId: ligacao.id, outro: { id: ids.switch, rotulo: 'Switch do rack' } },
      }),
      expect.objectContaining({
        acao: 'ativo.ligado',
        alvoId: id('switch'),
        dados: { ligacaoId: ligacao.id, outro: { id: ids.nobreak, rotulo: 'Nobreak do rack' } },
      }),
    ]);
    expect(porAlvo(await eventosGravados())).toEqual(
      porAlvo([
        { tipo: 'ativos.mudaram', alvoId: id('nobreak'), locais: [id('jundiai')] },
        { tipo: 'ativos.mudaram', alvoId: id('switch'), locais: [id('jundiai')] },
      ]),
    );
  });

  it('recusa o par repetido nos dois sentidos, o ativo com ele mesmo e o que não existe', async () => {
    for (const [este, outro] of [
      [id('nobreak'), id('switch')],
      [id('switch'), id('nobreak')],
    ] as const) {
      const repetida = await ligar(este, outro);
      expect(repetida.statusCode).toBe(409);
      expect(repetida.json().detail).toBe('Os dois ativos já estão ligados.');
    }
    const ele = await ligar(id('nobreak'), id('nobreak'));
    expect(ele.statusCode).toBe(400);
    expect(ele.json().campos).toEqual({ outroId: 'Um ativo não se liga a ele mesmo.' });
    const inexistente = await ligar(id('nobreak'), '0199a6e0-0000-7000-8000-000000000999');
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.json().detail).toBe('Ativo não encontrado.');
    expect(await ligacoesDe(id('nobreak'))).toHaveLength(1);
  });

  it('recusa ligar um ativo inativo, dos dois lados', async () => {
    const este = await ligar(id('parado'), id('nobreak'));
    expect(este.statusCode).toBe(409);
    expect(este.json().detail).toBe('Este ativo está inativo.');
    const outro = await ligar(id('nobreak'), id('parado'));
    expect(outro.statusCode).toBe(409);
    expect(outro.json().detail).toBe('O ativo escolhido está inativo.');
  });

  it('pede ativos.editar nos locais dos dois ativos, e a recusa vai para a auditoria', async () => {
    const fora = await ligar(id('nobreak'), id('emCampinas'));
    expect(fora.statusCode).toBe(403);
    expect(await auditoriaDaRequisicao(api, org, fora)).toMatchObject([
      { acao: 'permissao.recusada' },
    ]);
    expect((await ligar(id('emCampinas'), id('nobreak'))).statusCode).toBe(403);
    expect((await ligar(id('nobreak'), id('switch'), 'carla')).statusCode).toBe(403);
    expect(await ligacoesDe(id('emCampinas'))).toEqual([]);
  });
});

describe('desfazer', () => {
  it('desfaz pela ficha de qualquer dos dois, com um registro e um evento em cada um', async () => {
    const r = await desfazer(id('switch'), id('ligacao'));
    expect(r.statusCode).toBe(204);
    expect(await ligacoesDe(id('nobreak'))).toEqual([]);
    await registrosNosDois(r, [
      expect.objectContaining({
        acao: 'ativo.desligado',
        alvoId: id('switch'),
        dados: { ligacaoId: ids.ligacao, outro: { id: ids.nobreak, rotulo: 'Nobreak do rack' } },
      }),
      expect.objectContaining({
        acao: 'ativo.desligado',
        alvoId: id('nobreak'),
        dados: { ligacaoId: ids.ligacao, outro: { id: ids.switch, rotulo: 'Switch do rack' } },
      }),
    ]);
    expect(await eventosGravados()).toHaveLength(2);
    const outraVez = await desfazer(id('switch'), id('ligacao'));
    expect(outraVez.statusCode).toBe(404);
    expect(outraVez.json().detail).toBe('Ligação não encontrada.');
  });

  it('a ligação de outro ativo não se desfaz por este, e a de fora do acesso pede o acesso', async () => {
    const entreRacks = (await ligar(id('nobreak'), id('switch'))).json().id;
    expect((await desfazer(id('parado'), entreRacks)).statusCode).toBe(404);
    const comCampinas = (await ligar(id('nobreak'), id('emCampinas'), 'ana')).json().id;
    const negado = await desfazer(id('nobreak'), comCampinas);
    expect(negado.statusCode).toBe(403);
    expect(await ligacoesDe(id('emCampinas'))).toHaveLength(1);
    // Desfazer vale também com um dos dois inativo.
    await cliente.enviar('POST', `/ativos/${id('emCampinas')}/inativacao`, como('ana'));
    expect((await desfazer(id('nobreak'), comCampinas, 'ana')).statusCode).toBe(204);
  });
});

describe('limite', () => {
  it('duas ligações ao mesmo tempo não passam de 100, e o escolhido também tem limite', async () => {
    // Um ativo com 99 ligações, gravadas direto no banco.
    const [cheio, ...outros] = await naOrganizacao(api.banco, org, async (tx) => {
      const criados = await tx
        .insert(ativos)
        .values(
          Array.from({ length: 102 }, () => ({
            orgId: org,
            tipoId: id('tipoSwitch'),
            localId: id('jundiai'),
            busca: '',
          })),
        )
        .returning({ id: ativos.id });
      return criados.map((criado) => criado.id);
    });
    if (!cheio) throw new Error('O ativo não foi criado.');
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(ligacoesDeAtivos).values(
        outros.slice(0, 99).map((outro) => ({
          orgId: org,
          ativoA: sql`least(${cheio}::uuid, ${outro}::uuid)`,
          ativoB: sql`greatest(${cheio}::uuid, ${outro}::uuid)`,
        })),
      ),
    );
    const [um, dois] = outros.slice(99);
    const respostas = await Promise.all([
      ligar(cheio, um ?? '', 'ana'),
      ligar(cheio, dois ?? '', 'ana'),
    ]);
    expect(respostas.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(respostas.find((r) => r.statusCode === 409)?.json().detail).toBe(
      'Este ativo já tem 100 ligações. Desfaça uma para ligar outra.',
    );
    expect(await ligacoesDe(cheio)).toHaveLength(100);
    const doOutroLado = await ligar(id('switch'), cheio, 'ana');
    expect(doOutroLado.statusCode).toBe(409);
    expect(doOutroLado.json().detail).toBe('O ativo escolhido já tem 100 ligações.');
  });
});
