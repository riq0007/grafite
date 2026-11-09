// A lista, a ficha e o cadastro dos segredos pela API (spec cofre-de-segredos, "Segredo", "Valor
// cifrado em duas camadas", "Acesso ao segredo", "Verificação para usar o cofre" e "Vínculos com a
// pessoa e os ativos"; design do P6, decisões 1, 3 e 7): quem usa o cofre vê os segredos ativos que
// alcança, quem administra vê todos e cadastra, e nenhuma resposta leva o valor.
import { ativos, eventos, naOrganizacao, pessoas, segredos, segredosDosAtivos } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type CofreDeTeste,
  criarAtivo,
  liberar,
  ligarOCofre,
  montarCofre,
  mudarSituacaoDoSegredo,
  type UsuarioDoCofre,
} from '../../test/cofre.ts';
import { CHAVES_DO_COFRE_DE_TESTE } from '../../test/dependencias.ts';
import {
  type ApiDeTeste,
  abrirApi,
  auditoriaDaRequisicao,
  criarPessoa,
  incluirNoGrupo,
} from '../../test/integracao.ts';
import { decifrarSegredo, impressaoDaChaveMestra } from '../cofre/cifra.ts';

const host = 'grafite.cofre.local';
const SEM_DOIS_PASSOS =
  'Cadastre a verificação em dois passos em Ajustes › Conta para usar o cofre.';

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

const limparEventos = () => naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));

beforeEach(async () => {
  await limparEventos();
});

const consultar = (url: string, usuario: UsuarioDoCofre = 'ana') =>
  cofre.cliente.consultar(url, cofre.como(usuario));
const cadastrar = (pedido: object, usuario: UsuarioDoCofre = 'ana') =>
  cofre.cliente.enviar('POST', '/cofre/segredos', cofre.como(usuario), pedido);
const editar = (id: string, pedido: object, usuario: UsuarioDoCofre = 'ana') =>
  cofre.cliente.enviar('PATCH', `/cofre/segredos/${id}`, cofre.como(usuario), pedido);

let nomes = 0;
async function segredoNovo(pedido: object = {}) {
  nomes += 1;
  const r = await cadastrar({
    nome: `Segredo ${nomes}`,
    tipo: 'usuario-e-senha',
    classificacao: 'compartilhado',
    valor: `valor ${nomes}`,
    ...pedido,
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; nome: string };
}

const linhaGuardada = async (id: string) => {
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(segredos).where(eq(segredos.id, id)),
  );
  if (!linha) throw new Error('O segredo não foi gravado.');
  return linha;
};

const valorGuardado = async (id: string) =>
  decifrarSegredo(await linhaGuardada(id), CHAVES_DO_COFRE_DE_TESTE, { orgId: org, segredoId: id })
    .valor;

const nomesNaLista = async (usuario: UsuarioDoCofre, filtros = '') => {
  const r = await consultar(`/cofre/segredos${filtros}`, usuario);
  expect(r.statusCode, r.body).toBe(200);
  return (r.json().segredos as { nome: string }[]).map((segredo) => segredo.nome);
};

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, alvoTipo: eventos.alvoTipo, permissao: eventos.permissao })
      .from(eventos),
  );

describe('cadastro', () => {
  it('cadastra o segredo com o valor cifrado e dá o acesso a quem cadastrou', async () => {
    const r = await cadastrar({
      nome: ' Switch do CPD ',
      tipo: 'conta-administrativa',
      classificacao: 'equipamento',
      identificador: 'admin',
      endereco: 'https://10.0.5.2',
      notas: 'Trocar a cada seis meses.',
      validade: '2027-03-31',
      proximaRotacao: '2026-12-01',
      valor: ' S3nh@ do switch ',
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.body).not.toContain('S3nh@');
    const ficha = r.json();
    expect(ficha).toEqual({
      id: expect.any(String),
      nome: 'Switch do CPD',
      tipo: 'conta-administrativa',
      classificacao: 'equipamento',
      identificador: 'admin',
      endereco: 'https://10.0.5.2',
      notas: 'Trocar a cada seis meses.',
      validade: '2027-03-31',
      proximaRotacao: '2026-12-01',
      pessoa: null,
      ativos: [],
      situacao: 'ativo',
      valorTrocadoEm: api.relogio.agora().toISOString(),
      criadoEm: api.relogio.agora().toISOString(),
      atualizadoEm: api.relogio.agora().toISOString(),
      acesso: [{ tipo: 'conta', id: cofre.contas.ana.id, nome: 'Ana Souza' }],
      permite: { revelar: true, administrar: true },
    });

    const linha = await linhaGuardada(ficha.id);
    expect(linha.conteudoCifrado.includes('S3nh@')).toBe(false);
    expect(linha.impressaoDaChaveMestra).toBe(
      impressaoDaChaveMestra(CHAVES_DO_COFRE_DE_TESTE.atual),
    );
    // O valor guarda os espaços, que fazem parte de uma senha.
    expect(await valorGuardado(ficha.id)).toBe(' S3nh@ do switch ');

    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros).toMatchObject([
      {
        acao: 'segredo.criado',
        atorContaId: cofre.contas.ana.id,
        alvoTipo: 'segredo',
        alvoId: ficha.id,
        antes: null,
        depois: {
          nome: 'Switch do CPD',
          tipo: 'conta-administrativa',
          identificador: 'admin',
          acesso: [{ tipo: 'conta', id: cofre.contas.ana.id }],
        },
      },
    ]);
    expect(JSON.stringify(registros)).not.toContain('S3nh@');
    expect(await eventosGravados()).toEqual([
      { tipo: 'cofre.mudou', alvoTipo: 'segredo', permissao: 'cofre.usar' },
    ]);
  });

  it('liga a pessoa e os ativos ativos, com o caminho de cada um', async () => {
    const pessoaId = await criarPessoa(api, org, { nome: 'Carla Dias da Silva' });
    const switchDoCpd = await criarAtivo(api, org, { patrimonio: 'PAT-00610', nome: 'Switch CPD' });
    const r = await cadastrar({
      nome: 'E-mail da Carla',
      tipo: 'usuario-e-senha',
      classificacao: 'pessoal',
      pessoaId,
      ativoIds: [switchDoCpd],
      valor: 'senha da Carla',
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      pessoa: { id: pessoaId, nome: 'Carla Dias da Silva' },
      ativos: [{ id: switchDoCpd, rotulo: 'Switch CPD', patrimonio: 'PAT-00610' }],
    });
    const ligados = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ ativoId: segredosDosAtivos.ativoId })
        .from(segredosDosAtivos)
        .where(eq(segredosDosAtivos.segredoId, r.json().id)),
    );
    expect(ligados).toEqual([{ ativoId: switchDoCpd }]);
  });

  it('recusa sem o valor, sem o nome e com o tipo desconhecido', async () => {
    const base = { nome: 'Banco do ERP', tipo: 'banco-de-dados', classificacao: 'aplicacao' };
    for (const [pedido, campos] of [
      [{ ...base }, { valor: 'Informe o valor do segredo.' }],
      [{ ...base, valor: '' }, { valor: 'Informe o valor do segredo.' }],
      [{ ...base, nome: '  ', valor: 'x' }, { nome: 'Informe o nome do segredo.' }],
      [{ ...base, tipo: 'senha', valor: 'x' }, { tipo: 'Escolha o tipo do segredo.' }],
      [{ ...base, valor: 'x'.repeat(10_001) }, { valor: 'Use até 10.000 caracteres.' }],
    ] as const) {
      const r = await cadastrar(pedido);
      expect(r.statusCode, JSON.stringify(pedido).slice(0, 80)).toBe(400);
      expect(r.json().campos).toEqual(campos);
    }
  });

  it('recusa a pessoa e o ativo inativos no vínculo novo', async () => {
    const inativa = await criarPessoa(api, org, { nome: 'Pessoa inativa', situacao: 'inativa' });
    const parado = await criarAtivo(api, org, { patrimonio: 'PAT-00999', situacao: 'inativo' });
    const base = { nome: 'Wi-Fi', tipo: 'wi-fi', classificacao: 'compartilhado', valor: 'x' };
    const comPessoa = await cadastrar({ ...base, pessoaId: inativa });
    expect(comPessoa.statusCode).toBe(400);
    expect(comPessoa.json().campos).toEqual({
      pessoaId: 'A pessoa escolhida está inativa. Escolha uma pessoa ativa.',
    });
    const comAtivo = await cadastrar({ ...base, ativoIds: [parado] });
    expect(comAtivo.statusCode).toBe(400);
    expect(comAtivo.json().campos).toEqual({ ativoIds: 'O ativo PAT-00999 está inativo.' });
  });

  it('só quem administra o cofre cadastra', async () => {
    const r = await cadastrar(
      { nome: 'Token', tipo: 'token', classificacao: 'aplicacao', valor: 'x' },
      'bruno',
    );
    expect(r.statusCode).toBe(403);
    expect(r.json().type).toBe('urn:grafite:problema:sem-permissao');
  });
});

describe('lista', () => {
  let liberadoAoBruno = '';
  let doGrupo = '';
  let doTecnico = '';
  let inativo = '';

  beforeAll(async () => {
    liberadoAoBruno = (await segredoNovo({ nome: 'Roteador da filial' })).id;
    await liberar(api, org, liberadoAoBruno, { contaId: cofre.contas.bruno.id });
    doGrupo = (await segredoNovo({ nome: 'Switch do Suporte', identificador: 'suporte' })).id;
    await liberar(api, org, doGrupo, { grupoId: cofre.suporte });
    doTecnico = (await segredoNovo({ nome: 'Câmera de Jundiaí' })).id;
    await liberar(api, org, doTecnico, { perfilId: cofre.perfis.tecnico });
    inativo = (await segredoNovo({ nome: 'Servidor antigo' })).id;
    await liberar(api, org, inativo, { contaId: cofre.contas.bruno.id });
    await mudarSituacaoDoSegredo(api, org, inativo, 'inativo');
    await segredoNovo({
      nome: 'Painel do firewall',
      tipo: 'conta-administrativa',
      classificacao: 'privilegiado',
      endereco: 'https://fw.cpd.local',
    });
  });

  it('quem usa o cofre vê só os segredos ativos que alcança, sem nenhum valor', async () => {
    const r = await consultar('/cofre/segredos', 'bruno');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      segredos: [
        {
          id: liberadoAoBruno,
          nome: 'Roteador da filial',
          tipo: 'usuario-e-senha',
          classificacao: 'compartilhado',
          identificador: null,
          endereco: null,
          pessoa: null,
          validade: null,
          proximaRotacao: null,
          situacao: 'ativo',
        },
      ],
      permite: { cadastrar: false },
    });
    expect(r.body).not.toContain('valor ');
  });

  it('o acesso por grupo vale para quem entra no grupo', async () => {
    expect(await nomesNaLista('bruno')).not.toContain('Switch do Suporte');
    await incluirNoGrupo(api, org, { grupoId: cofre.suporte, contaId: cofre.contas.bruno.id });
    expect(await nomesNaLista('bruno')).toEqual(['Roteador da filial', 'Switch do Suporte']);
  });

  it('o acesso por perfil vale em qualquer escopo', async () => {
    expect(await nomesNaLista('carla')).toEqual(['Câmera de Jundiaí']);
  });

  it('a pessoa ligada não vê o segredo sem o acesso', async () => {
    expect(await nomesNaLista('carla')).not.toContain('E-mail da Carla');
  });

  it('quem administra vê todos os segredos, e os inativos pela situação', async () => {
    const ativos = await nomesNaLista('ana');
    expect(ativos).toEqual(
      expect.arrayContaining([
        'Câmera de Jundiaí',
        'Painel do firewall',
        'Roteador da filial',
        'Switch do Suporte',
      ]),
    );
    expect(ativos).not.toContain('Servidor antigo');
    expect(await nomesNaLista('ana', '?situacao=inativos')).toEqual(['Servidor antigo']);
    expect(await nomesNaLista('ana', '?situacao=todos')).toContain('Servidor antigo');
    const r = await consultar('/cofre/segredos', 'ana');
    expect(r.json().permite).toEqual({ cadastrar: true });
  });

  it('quem só usa o cofre não vê os inativos, mesmo pedindo', async () => {
    expect(await nomesNaLista('bruno', '?situacao=inativos')).toEqual([]);
  });

  it('busca pelo nome, pelo identificador e pelo endereço, sem acento', async () => {
    expect(await nomesNaLista('ana', '?busca=cpd')).toEqual(
      expect.arrayContaining(['Painel do firewall', 'Switch do CPD']),
    );
    expect(await nomesNaLista('ana', '?busca=SUPORTE')).toEqual(['Switch do Suporte']);
    expect(await nomesNaLista('ana', '?busca=camera%20jundiai')).toEqual(['Câmera de Jundiaí']);
  });

  it('filtra pelo tipo e pela classificação', async () => {
    expect(
      await nomesNaLista('ana', '?tipo=conta-administrativa&classificacao=privilegiado'),
    ).toEqual(['Painel do firewall']);
  });
});

describe('ficha', () => {
  it('quem alcança vê a ficha sem o valor e sem o acesso', async () => {
    const { id } = await segredoNovo({ nome: 'NAS do backup', notas: 'No rack 2.' });
    await liberar(api, org, id, { contaId: cofre.contas.bruno.id });
    const r = await consultar(`/cofre/segredos/${id}`, 'bruno');
    expect(r.statusCode).toBe(200);
    const ficha = r.json();
    expect(ficha).toMatchObject({
      id,
      nome: 'NAS do backup',
      notas: 'No rack 2.',
      permite: { revelar: true, administrar: false },
    });
    expect(ficha).not.toHaveProperty('acesso');
    expect(r.body).not.toContain('valor ');
  });

  it('o segredo que a conta não alcança, ou inativo, não existe para quem só usa', async () => {
    const { id } = await segredoNovo({ nome: 'Banco do ERP' });
    expect((await consultar(`/cofre/segredos/${id}`, 'bruno')).statusCode).toBe(404);
    await liberar(api, org, id, { contaId: cofre.contas.bruno.id });
    await mudarSituacaoDoSegredo(api, org, id, 'inativo');
    const r = await consultar(`/cofre/segredos/${id}`, 'bruno');
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Segredo não encontrado.');
  });

  it('quem administra vê a ficha e o acesso, mas só revela o que alcança', async () => {
    const { id } = await segredoNovo({ nome: 'Console do hipervisor' });
    await liberar(api, org, id, { grupoId: cofre.suporte });
    await liberar(api, org, id, { perfilId: cofre.perfis.tecnico });
    const r = await consultar(`/cofre/segredos/${id}`, 'ana');
    expect(r.statusCode).toBe(200);
    expect(r.json().acesso).toEqual([
      { tipo: 'conta', id: cofre.contas.ana.id, nome: 'Ana Souza' },
      { tipo: 'grupo', id: cofre.suporte, nome: 'Suporte' },
      { tipo: 'perfil', id: cofre.perfis.tecnico, nome: 'Técnico' },
    ]);
  });

  it('o segredo de outra organização não existe aqui', async () => {
    const r = await consultar('/cofre/segredos/0199a3f0-0000-7000-8000-000000000123', 'ana');
    expect(r.statusCode).toBe(404);
  });
});

describe('edição', () => {
  it('edita os dados, com o antes e o depois na auditoria', async () => {
    const { id } = await segredoNovo({ nome: 'Impressora do RH', identificador: 'adm' });
    await limparEventos();
    const r = await editar(id, { identificador: 'admin', notas: 'Senha da fábrica trocada.' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ identificador: 'admin', notas: 'Senha da fábrica trocada.' });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'segredo.alterado',
        antes: { identificador: 'adm', notas: null },
        depois: { identificador: 'admin', notas: 'Senha da fábrica trocada.' },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'cofre.mudou', alvoTipo: 'segredo', permissao: 'cofre.usar' },
    ]);
  });

  it('troca o valor com uma chave nova, sem mudar as datas e sem o valor na auditoria', async () => {
    const { id } = await segredoNovo({
      nome: 'Senha do Wi-Fi visitantes',
      validade: '2026-09-30',
      proximaRotacao: '2026-10-01',
      valor: 'antiga-123',
    });
    const antes = await linhaGuardada(id);
    api.relogio.avancar(60_000);
    const r = await editar(id, { valor: 'nova-456' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      validade: '2026-09-30',
      proximaRotacao: '2026-10-01',
      valorTrocadoEm: api.relogio.agora().toISOString(),
    });
    const depois = await linhaGuardada(id);
    expect(depois.chaveCifrada).not.toEqual(antes.chaveCifrada);
    expect(await valorGuardado(id)).toBe('nova-456');
    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros).toMatchObject([
      { acao: 'valor-do-segredo.trocado', alvoId: id, antes: null, depois: null },
    ]);
    expect(JSON.stringify(registros)).not.toMatch(/antiga-123|nova-456/);
  });

  it('o vínculo que já existe continua com a pessoa e o ativo inativados', async () => {
    const pessoaId = await criarPessoa(api, org, { nome: 'Dono da conta' });
    const ativoId = await criarAtivo(api, org, { patrimonio: 'PAT-00412' });
    const { id } = await segredoNovo({ nome: 'Conta do notebook', pessoaId, ativoIds: [ativoId] });
    await naOrganizacao(api.banco, org, async (tx) => {
      await tx.update(pessoas).set({ situacao: 'inativa' }).where(eq(pessoas.id, pessoaId));
      await tx.update(ativos).set({ situacao: 'inativo' }).where(eq(ativos.id, ativoId));
    });
    const r = await editar(id, { notas: 'A pessoa saiu da empresa.' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      pessoa: { id: pessoaId },
      ativos: [{ id: ativoId, patrimonio: 'PAT-00412' }],
    });
  });

  it('só quem administra o cofre edita', async () => {
    const { id } = await segredoNovo();
    await liberar(api, org, id, { contaId: cofre.contas.bruno.id });
    expect((await editar(id, { notas: 'x' }, 'bruno')).statusCode).toBe(403);
  });
});

describe('verificação e módulo', () => {
  it('a conta sem a verificação em dois passos é recusada com o caminho até o cadastro', async () => {
    for (const r of [
      await consultar('/cofre/segredos', 'davi'),
      await consultar('/cofre/segredos/0199a3f0-0000-7000-8000-000000000123', 'davi'),
    ]) {
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:cofre-sem-dois-passos',
        detail: SEM_DOIS_PASSOS,
      });
    }
  });

  it('a conta sem o cofre é recusada pela permissão', async () => {
    const r = await consultar('/cofre/segredos', 'eva');
    expect(r.statusCode).toBe(403);
    expect(r.json().type).toBe('urn:grafite:problema:sem-permissao');
  });

  it('com o Cofre desligado, as rotas são recusadas pelo módulo', async () => {
    await ligarOCofre(api, org, false);
    try {
      const r = await consultar('/cofre/segredos', 'ana');
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:modulo-desligado',
        detail: 'O módulo Cofre está desligado nesta organização.',
      });
    } finally {
      await ligarOCofre(api, org, true);
    }
  });
});
