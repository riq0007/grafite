// Os nomes das pessoas para a escolha (spec administracao-de-pessoas, "Nomes das pessoas para a
// escolha"; design do P1b, decisão 10, e do escolhas-a-vista, decisão 4): toda sessão ativa busca
// as pessoas ativas pelo nome, e a resposta traz só o id e o nome de até 20, em ordem alfabética, e
// o total das que casam. Sem o texto, vêm as primeiras; com um local que a conta pode editar nos
// ativos, as pessoas do ramo dele vêm primeiro, marcadas, sem dizer o local de ninguém.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.nomes.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let bruno: Entrada = SEM_ENTRADA;
let carla: Entrada = SEM_ENTRADA;
const ids: Record<string, string> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: ids.jundiai });
  ids.doca = await criarLocal(api, org, { nome: 'Doca 3', paiId: ids.expedicao });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  // Bruno não tem nenhum perfil: não vê a Administração nem edita ativos.
  await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  bruno = await cliente.entrar('bruno');
  // Carla edita os ativos só em Jundiaí.
  const editarAtivos = await criarPerfil(api, org, {
    nome: 'Ativos',
    permissoes: ['ativos.editar'],
  });
  const contaDaCarla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, {
    perfilId: editarAtivos,
    contaId: contaDaCarla.id,
    localId: ids.jundiai,
  });
  carla = await cliente.entrar('carla');
  ids.joao = await criarPessoa(api, org, {
    nome: 'João da Silva',
    email: 'joao@empresa.com.br',
    matricula: '004512',
  });
  ids.joana = await criarPessoa(api, org, { nome: 'Joana Prado' });
  ids.inativo = await criarPessoa(api, org, { nome: 'João Inativo', situacao: 'inativa' });
  for (let numero = 1; numero <= 25; numero += 1) {
    await criarPessoa(api, org, { nome: `Zé ${String(numero).padStart(2, '0')}` });
  }
  // Na Expedição de Jundiaí e na Doca 3, dentro dela; em Campinas, outro ramo.
  ids.xavier = await criarPessoa(api, org, { nome: 'Xavier Lima', localId: ids.expedicao });
  ids.yara = await criarPessoa(api, org, { nome: 'Yara Nunes', localId: ids.doca });
  ids.wagner = await criarPessoa(api, org, { nome: 'Wagner Reis', localId: ids.campinas });
});

afterAll(async () => {
  await api?.fechar();
});

const nomes = (consulta = '', entrada = bruno) =>
  cliente.consultar(`/pessoas/nomes${consulta}`, entrada);

interface NomeDaPessoa {
  id: string;
  nome: string;
  doMesmoLocal: boolean;
}

const nomesDa = (resposta: { json: () => { pessoas: NomeDaPessoa[] } }) =>
  resposta.json().pessoas.map((pessoa) => pessoa.nome);

describe('GET /pessoas/nomes', () => {
  it('acha as pessoas ativas pelo nome, sem acento nem maiúsculas, só com o id e o nome', async () => {
    const r = await nomes('?busca=JOAO');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      pessoas: [{ id: ids.joao, nome: 'João da Silva', doMesmoLocal: false }],
      total: 1,
    });
  });

  it('casa cada palavra com o nome, e não com o e-mail nem com a matrícula', async () => {
    expect(nomesDa(await nomes('?busca=silva%20jo'))).toEqual(['João da Silva']);
    expect((await nomes('?busca=004512')).json()).toEqual({ pessoas: [], total: 0 });
    expect((await nomes('?busca=empresa')).json()).toEqual({ pessoas: [], total: 0 });
  });

  it('sem o texto, traz as primeiras 20 em ordem alfabética e o total das ativas', async () => {
    const r = await nomes();
    const lista = nomesDa(r);
    expect(lista).toHaveLength(20);
    expect(lista.slice(0, 4)).toEqual([
      'Bruno Costa',
      'Carla Dias',
      'Joana Prado',
      'João da Silva',
    ]);
    expect(lista).not.toContain('João Inativo');
    // Bruno, Carla, João, Joana, os 25 Zés, Xavier, Yara e Wagner.
    expect(r.json().total).toBe(32);
  });

  it('com o texto, o total é o das que casam, e a lista para em 20', async () => {
    const r = await nomes('?busca=ze');
    expect(nomesDa(r)).toHaveLength(20);
    expect(r.json().total).toBe(25);
  });

  it('com o local, quem edita os ativos dele vê primeiro as pessoas do ramo, marcadas', async () => {
    const r = await nomes(`?local=${ids.expedicao}`, carla);
    expect(r.statusCode).toBe(200);
    const pessoas = r.json().pessoas as NomeDaPessoa[];
    expect(pessoas.slice(0, 3)).toEqual([
      { id: ids.xavier, nome: 'Xavier Lima', doMesmoLocal: true },
      { id: ids.yara, nome: 'Yara Nunes', doMesmoLocal: true },
      expect.objectContaining({ nome: 'Bruno Costa', doMesmoLocal: false }),
    ]);
    expect(pessoas).toHaveLength(20);
    // Wagner trabalha em Campinas, fora do ramo: vem sem a marca.
    expect(pessoas.find((pessoa) => pessoa.nome === 'Wagner Reis')?.doMesmoLocal).toBe(false);
    expect(r.json().total).toBe(32);
    // A resposta não diz o local de ninguém.
    expect(JSON.stringify(r.json())).not.toContain(ids.expedicao);
    // Com o texto, o ramo continua primeiro.
    const comTexto = await nomes(`?local=${ids.expedicao}&busca=a`, carla);
    expect(nomesDa(comTexto).slice(0, 2)).toEqual(['Xavier Lima', 'Yara Nunes']);
  });

  it('com o local fora do que a conta edita, a lista vem sem a marca', async () => {
    const deFora = await nomes(`?local=${ids.campinas}`, carla);
    expect((deFora.json().pessoas as NomeDaPessoa[]).every((p) => !p.doMesmoLocal)).toBe(true);
    expect(nomesDa(deFora)[0]).toBe('Bruno Costa');
    const semPermissao = await nomes(`?local=${ids.expedicao}`, bruno);
    expect((semPermissao.json().pessoas as NomeDaPessoa[]).every((p) => !p.doMesmoLocal)).toBe(
      true,
    );
  });

  it('recusa um local que não é um id', async () => {
    expect((await nomes('?local=jundiai', carla)).statusCode).toBe(400);
  });

  it('pede uma sessão', async () => {
    expect((await nomes('?busca=joao', SEM_ENTRADA)).statusCode).toBe(401);
  });
});
