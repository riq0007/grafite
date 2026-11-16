// A abertura do chamado pela TI (spec chamados, "Abrir um chamado pela TI", "Situação e quem
// atende", "Ativo ligado e campos da TI" e "Quem vê e quem atende os chamados"; spec
// tipos-de-chamado, "Respostas do formulário"; change chamados-da-ti, design, decisões 2, 3, 5, 7, 8
// e 10, tarefa 4.7): a pessoa e o tipo; as respostas, conferidas pelo domínio, com o ativo, o local
// e a pessoa conferidos pela API; o título montado ou o escrito; o número da organização; os locais
// da pessoa e do ativo ligado e o alcance de quem abre; o atendimento pelo "Fica comigo", por quem
// atende o tipo por padrão e pelo horário da TI; o prazo copiado em minutos; a primeira resposta
// dada; o evento de abertura, sem o resumo pronto; os anexos tomados pelo campo; a auditoria; e o
// `chamados.mudaram`. A solicitação gerada pelo tipo e os avisos chegam nas tarefas 4.18 e 4.8.
import {
  anexosDosChamados,
  chamados,
  contas,
  eventos,
  horarioDaTi,
  mensagensDosChamados,
  naOrganizacao,
  numeracaoDosChamados,
  tiposDeChamado,
} from '@grafite/db';
import {
  type CampoDoFormulario,
  type Formulario,
  MENSAGEM_DA_PESSOA_INATIVA,
  MENSAGEM_DO_ATIVO_INATIVO,
  MENSAGEM_DO_LOCAL_INATIVO,
  mensagemDosTiposAceitos,
  RECUSA_DO_FORMULARIO,
  resumoDasRespostas,
  rotuloDoAtivo,
} from '@grafite/domain';
import { asc, count, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarAtivoDoTipo, criarModelo, criarTipo, desligarModulos } from '../../test/alertas.ts';
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
  criarPessoa,
  criarRelogio,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { ANEXO_NAO_ENCONTRADO } from '../chamados/anexos.ts';
import { criarTiposDeFabrica, linhasDosTiposDeFabrica } from '../chamados/fabrica.ts';

const host = 'grafite.chamados-abertura.local';
const ATOR = { tipo: 'sistema', descricao: 'teste da abertura dos chamados' } as const;
/** A sexta-feira, 2 de outubro de 2026, às 11:00 em São Paulo, no horário da TI padrão. */
const AGORA = new Date('2026-10-02T14:00:00.000Z');
const NAO_ESTA_EM_USO = 'O tipo escolhido não está em uso.';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const contasDe: Record<string, string> = {};
const ids: Record<string, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const conta = (usuario: string) => contasDe[usuario] ?? '';
const id = (chave: string) => ids[chave] ?? '';
const tipoDe = (nome: string) => id(`tipo:${nome}`);
const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);

const abrir = (usuario: string, corpo: object) =>
  cliente.enviar('POST', '/chamados', como(usuario), corpo);

/** O chamado da Impressora manchando na borda, na PAT-00139, em nome de Marina. */
const manchando = (respostas: Record<string, unknown> = {}) => ({
  pessoa: id('marina'),
  tipo: tipoDe('Impressora'),
  respostas: { impressora: id('pat139'), problema: 'manchando', manchas: 'borda', ...respostas },
  ficaComigo: true,
});

/** O chamado de Outro, só com o relato, em nome de quem se pede. */
const relato = (pessoa: string, texto = 'A cadeira da sala 3 quebrou.') => ({
  pessoa: id(pessoa),
  tipo: tipoDe('Outro'),
  respostas: { relato: texto },
  ficaComigo: false,
});

const lerChamado = (numero: number) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx.select().from(chamados).where(eq(chamados.numero, numero));
    if (!linha) throw new Error(`O chamado #${numero} não foi gravado.`);
    return linha;
  });

const conversaDo = (chamadoId: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select()
      .from(mensagensDosChamados)
      .where(eq(mensagensDosChamados.chamadoId, chamadoId))
      .orderBy(asc(mensagensDosChamados.criadaEm)),
  );

const eventosDo = (chamadoId: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({
        tipo: eventos.tipo,
        alvoTipo: eventos.alvoTipo,
        permissao: eventos.permissao,
        locais: eventos.locais,
      })
      .from(eventos)
      .where(eq(eventos.alvoId, chamadoId)),
  );

/** O que a abertura grava: os chamados, a conversa e o último número da organização. */
const gravado = () =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [deChamados] = await tx.select({ total: count() }).from(chamados);
    const [daConversa] = await tx.select({ total: count() }).from(mensagensDosChamados);
    const [numeracao] = await tx
      .select({ ultimo: numeracaoDosChamados.ultimo })
      .from(numeracaoDosChamados);
    return {
      chamados: deChamados?.total ?? 0,
      conversa: daConversa?.total ?? 0,
      ultimo: numeracao?.ultimo ?? 0,
    };
  });

const formularioDoTipo = (nome: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [tipo] = await tx
      .select({ formulario: tiposDeChamado.formulario })
      .from(tiposDeChamado)
      .where(eq(tiposDeChamado.id, tipoDe(nome)));
    return tipo?.formulario;
  });

/** Muda o atendimento do tipo direto no banco, como a tela de ajustes o grava. */
const atendimentoDoTipo = (
  nome: string,
  atendimento: { atendePorPadrao: string | null; semNinguem: 'triagem' | 'fica' },
) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .update(tiposDeChamado)
      .set(atendimento)
      .where(eq(tiposDeChamado.id, tipoDe(nome))),
  );

/** O horário da TI da organização, das 12:00 às 18:00, ou o padrão, das 08:00 às 18:00. */
const horarioDoMeioDia = (ligado: boolean) =>
  naOrganizacao(api.banco, org, async (tx) => {
    await tx.delete(horarioDaTi);
    if (ligado) {
      await tx.insert(horarioDaTi).values({
        orgId: org,
        dias: [1, 2, 3, 4, 5],
        inicio: 12 * 60,
        fim: 18 * 60,
        fuso: 'America/Sao_Paulo',
        cargaCheia: 5,
      });
    }
  });

const PROBLEMA = (campos: Record<string, string>) => ({
  status: 400,
  type: 'urn:grafite:problema:dados-invalidos',
  campos,
});

/** O campo do formulário de teste, com os padrões do construtor. */
const campo = (
  parte: Pick<CampoDoFormulario, 'id' | 'tipo' | 'rotulo'> & Partial<CampoDoFormulario>,
): CampoDoFormulario => ({
  nomeNoResumo: null,
  obrigatorio: false,
  soDaTi: false,
  apagarSeSumir: true,
  opcoes: [],
  tiposDeAtivo: [],
  condicao: [],
  ...parte,
});

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(AGORA) });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await naOrganizacao(api.banco, org, (tx) =>
    criarTiposDeFabrica(tx, { ator: ATOR, momento: api.relogio.agora() }),
  );
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  ids.sorocaba = await criarLocal(api, org, {
    nome: 'Sorocaba',
    tipo: 'unidade',
    situacao: 'inativo',
  });

  // Os ativos: as impressoras de Jundiaí, a de Campinas, a inativa e a sem local, e o notebook.
  ids.tipoImpressora = await criarTipo(api, org, { nome: 'Impressora' });
  ids.tipoComputador = await criarTipo(api, org, { nome: 'Computador' });
  const laserjet = await criarModelo(api, org, {
    tipoId: id('tipoImpressora'),
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });
  const impressora = (patrimonio: string, localId: string | null, ativa = true) =>
    criarAtivoDoTipo(api, org, {
      tipoId: id('tipoImpressora'),
      patrimonio,
      localId,
      modeloId: laserjet,
      situacao: ativa ? 'ativo' : 'inativo',
    });
  ids.pat139 = await impressora('PAT-00139', id('jundiai'));
  ids.pat200 = await impressora('PAT-00200', id('campinas'));
  ids.pat140 = await impressora('PAT-00140', id('jundiai'), false);
  ids.pat400 = await impressora('PAT-00400', null);
  ids.pat310 = await criarAtivoDoTipo(api, org, {
    tipoId: id('tipoComputador'),
    nome: 'Notebook da recepção',
    patrimonio: 'PAT-00310',
    localId: id('jundiai'),
  });

  // Os tipos de fábrica e três de teste: o Empréstimo, com a pessoa, o local e o equipamento, que
  // aceita só impressoras, o Rascunho e o inativado.
  const outro = linhasDosTiposDeFabrica().find(({ nome }) => nome === 'Outro');
  if (!outro) throw new Error('O tipo Outro não é de fábrica.');
  const emprestimo: Formulario = {
    titulo: { comecaPeloTipo: true, campoId: 'equipamento' },
    campos: [
      campo({ id: 'quem-vai-usar', tipo: 'pessoa', rotulo: 'Quem vai usar?', obrigatorio: true }),
      campo({ id: 'sala', tipo: 'local', rotulo: 'Em que sala?' }),
      campo({
        id: 'equipamento',
        tipo: 'ativo',
        rotulo: 'Qual equipamento?',
        tiposDeAtivo: [id('tipoImpressora')],
      }),
      // O segundo campo Ativo não liga o ativo ao chamado: só o primeiro liga.
      campo({ id: 'outro-equipamento', tipo: 'ativo', rotulo: 'Se faltar, qual outro?' }),
    ],
  };
  await naOrganizacao(api.banco, org, (tx) =>
    tx.insert(tiposDeChamado).values([
      {
        ...outro,
        orgId: org,
        nome: 'Empréstimo',
        nomeNormalizado: 'emprestimo',
        ordem: 20,
        formulario: { ...emprestimo },
      },
      {
        ...outro,
        orgId: org,
        nome: 'Mudança de mesa',
        nomeNormalizado: 'mudanca de mesa',
        ordem: 21,
        situacao: 'rascunho',
        formulario: { ...outro.formulario },
      },
      {
        ...outro,
        orgId: org,
        nome: 'Ramal novo',
        nomeNormalizado: 'ramal novo',
        ordem: 22,
        situacao: 'inativo',
        formulario: { ...outro.formulario },
      },
    ]),
  );
  for (const tipo of await naOrganizacao(api.banco, org, (tx) =>
    tx.select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome }).from(tiposDeChamado),
  )) {
    ids[`tipo:${tipo.nome}`] = tipo.id;
  }

  // Os números do mockup: o último chamado da organização é o #1042.
  await naOrganizacao(api.banco, org, (tx) =>
    tx.insert(numeracaoDosChamados).values({ orgId: org, ultimo: 1042 }),
  );

  cliente = clienteDaApi(api, host);
  // Ana atende a organização inteira; Bruno, Campinas, vendo os ativos da organização; Diego e
  // Elisa, Jundiaí; Carla só vê os chamados.
  const atende = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender', 'ativos.ver'],
  });
  const veOsAtivos = await criarPerfil(api, org, {
    nome: 'Vê os ativos',
    permissoes: ['ativos.ver'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Vê os chamados', permissoes: ['chamados.ver'] });
  const nomes = {
    ana: 'Ana Souza',
    bruno: 'Bruno Costa',
    carla: 'Carla Dias',
    diego: 'Diego Ramos',
    elisa: 'Elisa Prado',
  } as const;
  for (const [usuario, nome] of Object.entries(nomes)) {
    contasDe[usuario] = (await criarConta(api, org, { usuario, nome })).id;
  }
  await atribuir(api, org, { perfilId: atende, contaId: conta('ana') });
  await atribuir(api, org, { perfilId: atende, contaId: conta('bruno'), localId: id('campinas') });
  await atribuir(api, org, { perfilId: veOsAtivos, contaId: conta('bruno') });
  await atribuir(api, org, { perfilId: ve, contaId: conta('carla') });
  await atribuir(api, org, { perfilId: atende, contaId: conta('diego'), localId: id('jundiai') });
  await atribuir(api, org, { perfilId: atende, contaId: conta('elisa'), localId: id('jundiai') });
  for (const usuario of Object.keys(nomes)) entradas[usuario] = await cliente.entrar(usuario);

  // As pessoas: Marina, de Jundiaí; Paulo, de Campinas; Rita, sem local; Otávio, inativo.
  ids.marina = await criarPessoa(api, org, { nome: 'Marina Lopes', localId: id('jundiai') });
  ids.paulo = await criarPessoa(api, org, { nome: 'Paulo Mendes', localId: id('campinas') });
  ids.rita = await criarPessoa(api, org, { nome: 'Rita Moraes' });
  ids.otavio = await criarPessoa(api, org, {
    nome: 'Otávio Nunes',
    localId: id('jundiai'),
    situacao: 'inativa',
  });
});

describe('a abertura pela TI', () => {
  it('Chamado pelo telefone: Em atendimento com quem abriu, o título montado, a primeira resposta dada e o evento de abertura', async () => {
    const r = await abrir('ana', manchando({ 'contador-de-paginas': 48210 }));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toEqual({
      numero: 1043,
      situacao: 'em-atendimento',
      responsavel: { id: conta('ana'), nome: 'Ana Souza' },
    });

    const chamado = await lerChamado(1043);
    expect(chamado).toMatchObject({
      tipoId: tipoDe('Impressora'),
      titulo: 'Impressora manchando',
      tituloNormalizado: 'impressora manchando',
      pessoaId: id('marina'),
      origem: 'ti',
      abertoPor: conta('ana'),
      abertoEm: AGORA,
      // A cópia do formulário de agora, e as respostas, com as dos campos só da TI.
      formulario: await formularioDoTipo('Impressora'),
      respostas: {
        impressora: id('pat139'),
        problema: 'manchando',
        manchas: 'borda',
        'contador-de-paginas': 48210,
      },
      ativoId: id('pat139'),
      locais: [id('jundiai')],
      semLocal: false,
      situacao: 'em-atendimento',
      responsavelId: conta('ana'),
      responsavelDesde: AGORA,
      prazo: {
        modo: 'horario',
        respostaMin: 30,
        resolucaoMin: 480,
        resposta: { valor: 30, unidade: 'min' },
        resolucao: { valor: 8, unidade: 'h' },
      },
      contadoS: 0,
      relogioDesde: AGORA,
      primeiraRespostaEm: AGORA,
      estouroAvisadoEm: null,
      resolvidoEm: null,
      resolvidoPor: null,
      osId: null,
      solicitacaoId: null,
      versao: 1,
    });

    // A conversa começa pelo evento de abertura, sem o resumo pronto: a leitura o monta da cópia.
    expect(await conversaDo(chamado.id)).toEqual([
      expect.objectContaining({
        especie: 'evento',
        evento: 'abertura',
        autorConta: conta('ana'),
        autorPessoa: null,
        texto: null,
        dados: {},
        criadaEm: AGORA,
      }),
    ]);
    const rotulo = rotuloDoAtivo({
      nome: null,
      modelo: { fabricante: 'HP', nome: 'LaserJet M404' },
      tipo: { nome: 'Impressora' },
    });
    expect(
      resumoDasRespostas(chamado.formulario as unknown as Formulario, chamado.respostas, {
        nomeDoTipo: 'Impressora',
        ativos: new Map([[id('pat139'), { patrimonio: 'PAT-00139', rotulo }]]),
      }),
    ).toBe('Problema: Manchando, na borda · Ativo: PAT-00139');

    const auditados = await auditoriaDaRequisicao(api, org, r);
    expect(auditados).toHaveLength(1);
    expect(auditados[0]).toMatchObject({
      acao: 'chamado.aberto',
      atorContaId: conta('ana'),
      alvoTipo: 'chamado',
      alvoId: chamado.id,
      antes: null,
      depois: {
        numero: 1043,
        tipo: 'Impressora',
        titulo: 'Impressora manchando',
        pessoa: 'Marina Lopes',
        situacao: 'em-atendimento',
        responsavel: 'Ana Souza',
        ativo: 'HP LaserJet M404 · PAT-00139',
      },
    });
    expect(await eventosDo(chamado.id)).toEqual([
      {
        tipo: 'chamados.mudaram',
        alvoTipo: 'chamado',
        permissao: 'chamados.ver',
        locais: [id('jundiai')],
      },
    ]);
  });

  it('Chamado para a triagem: o tipo sem quem atende por padrão, com o "Fica comigo" desligado', async () => {
    const antes = await gravado();
    const r = await abrir(
      'ana',
      relato('marina', 'A cadeira da sala 3 quebrou.\n\nPreciso de outra.'),
    );
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toEqual({ numero: antes.ultimo + 1, situacao: 'triagem', responsavel: null });
    expect(await lerChamado(antes.ultimo + 1)).toMatchObject({
      // O título montado do relato, numa linha só.
      titulo: 'A cadeira da sala 3 quebrou. Preciso de outra.',
      situacao: 'triagem',
      responsavelId: null,
      responsavelDesde: null,
      ativoId: null,
      locais: [id('jundiai')],
      semLocal: false,
      prazo: {
        modo: 'corridas',
        respostaMin: 60,
        resolucaoMin: 1440,
        resposta: { valor: 1, unidade: 'h' },
        resolucao: { valor: 24, unidade: 'h' },
      },
      // Na triagem, o relógio conta, e a primeira resposta já foi dada ao telefone.
      relogioDesde: AGORA,
      primeiraRespostaEm: AGORA,
    });
  });

  it('o "Fica comigo" vem ligado quando o pedido não o traz', async () => {
    const { ficaComigo: _, ...semFicaComigo } = relato('marina');
    const r = await abrir('diego', semFicaComigo);
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      situacao: 'em-atendimento',
      responsavel: { id: conta('diego'), nome: 'Diego Ramos' },
    });
  });

  it('numera em sequência na organização, sem buraco quando a abertura volta', async () => {
    const antes = await gravado();
    const primeira = await abrir('ana', relato('marina'));
    // A recusa do anexo vem depois do número, e a transação volta inteira.
    const recusada = await abrir('ana', {
      ...relato('marina'),
      respostas: { relato: 'Segue a foto.', foto: ['0190a8b2-7c3d-7e4f-8a9b-0c1d2e3f4a5b'] },
    });
    const segunda = await abrir('ana', relato('marina'));
    expect([primeira.statusCode, recusada.statusCode, segunda.statusCode]).toEqual([201, 400, 201]);
    expect([primeira.json().numero, segunda.json().numero]).toEqual([
      antes.ultimo + 1,
      antes.ultimo + 2,
    ]);
    expect(await gravado()).toEqual({
      chamados: antes.chamados + 2,
      conversa: antes.conversa + 2,
      ultimo: antes.ultimo + 2,
    });
  });

  it('a pessoa sem local de trabalho dá ao chamado o alcance da organização inteira', async () => {
    const r = await abrir('ana', relato('rita'));
    expect(r.statusCode, r.body).toBe(201);
    const chamado = await lerChamado(r.json().numero);
    expect(chamado).toMatchObject({ locais: [], semLocal: true });
    expect(await eventosDo(chamado.id)).toEqual([
      expect.objectContaining({ permissao: 'chamados.ver', locais: [null] }),
    ]);

    // O ativo ligado sem local também.
    const comAtivo = await abrir('ana', {
      ...manchando(),
      respostas: { impressora: id('pat400'), problema: 'nao-imprime' },
    });
    expect(comAtivo.statusCode, comAtivo.body).toBe(201);
    const daImpressora = await lerChamado(comAtivo.json().numero);
    expect(daImpressora).toMatchObject({
      ativoId: id('pat400'),
      locais: [id('jundiai')],
      semLocal: true,
    });
    expect(await eventosDo(daImpressora.id)).toEqual([
      expect.objectContaining({ locais: [id('jundiai'), null] }),
    ]);
  });

  it('os locais são o da pessoa e o do ativo ligado, o primeiro campo Ativo do formulário', async () => {
    const r = await abrir('ana', {
      pessoa: id('paulo'),
      tipo: tipoDe('Empréstimo'),
      respostas: {
        'quem-vai-usar': id('marina'),
        sala: id('jundiai'),
        equipamento: id('pat139'),
      },
      ficaComigo: true,
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(await lerChamado(r.json().numero)).toMatchObject({
      // O título montado pelo patrimônio do ativo, que a API lê na abertura.
      titulo: 'Empréstimo PAT-00139',
      ativoId: id('pat139'),
      locais: [id('campinas'), id('jundiai')],
      semLocal: false,
      respostas: {
        'quem-vai-usar': id('marina'),
        sala: id('jundiai'),
        equipamento: id('pat139'),
      },
    });

    // Sem a resposta do primeiro campo Ativo, o chamado nasce sem o ativo, mesmo com a do segundo,
    // e o título é o nome do tipo.
    const semAtivo = await abrir('ana', {
      pessoa: id('paulo'),
      tipo: tipoDe('Empréstimo'),
      respostas: { 'quem-vai-usar': id('marina'), 'outro-equipamento': id('pat310') },
      ficaComigo: true,
    });
    expect(semAtivo.statusCode, semAtivo.body).toBe(201);
    expect(await lerChamado(semAtivo.json().numero)).toMatchObject({
      titulo: 'Empréstimo',
      ativoId: null,
      locais: [id('campinas')],
      semLocal: false,
      respostas: { 'quem-vai-usar': id('marina'), 'outro-equipamento': id('pat310') },
    });

    // Com os dois, o ligado é o do primeiro, mesmo que venha depois no pedido.
    const comOsDois = await abrir('ana', {
      pessoa: id('paulo'),
      tipo: tipoDe('Empréstimo'),
      respostas: {
        'outro-equipamento': id('pat310'),
        'quem-vai-usar': id('marina'),
        equipamento: id('pat200'),
      },
      ficaComigo: true,
    });
    expect(comOsDois.statusCode, comOsDois.body).toBe(201);
    expect(await lerChamado(comOsDois.json().numero)).toMatchObject({
      ativoId: id('pat200'),
      locais: [id('campinas')],
    });
  });

  it('o prazo em dias úteis vale o dia do horário da TI de agora', async () => {
    // A resolução do Outro em 2 dias úteis, com o horário das 12:00 às 18:00: 2 dias de 6 h.
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(tiposDeChamado)
        .set({ modo: 'horario', resolucaoValor: 2, resolucaoUnidade: 'd' })
        .where(eq(tiposDeChamado.id, tipoDe('Outro'))),
    );
    await horarioDoMeioDia(true);
    try {
      const r = await abrir('ana', relato('marina'));
      expect(r.statusCode, r.body).toBe(201);
      expect((await lerChamado(r.json().numero)).prazo).toEqual({
        modo: 'horario',
        respostaMin: 60,
        resolucaoMin: 720,
        resposta: { valor: 1, unidade: 'h' },
        resolucao: { valor: 2, unidade: 'd' },
      });
    } finally {
      await horarioDoMeioDia(false);
      await naOrganizacao(api.banco, org, (tx) =>
        tx
          .update(tiposDeChamado)
          .set({ modo: 'corridas', resolucaoValor: 24, resolucaoUnidade: 'h' })
          .where(eq(tiposDeChamado.id, tipoDe('Outro'))),
      );
    }
  });
});

describe('o título', () => {
  it('Título trocado: o chamado nasce com o título que quem abre escreveu', async () => {
    const r = await abrir('ana', {
      pessoa: id('marina'),
      tipo: tipoDe('Computador'),
      titulo: '  Notebook da recepção\nnão liga  ',
      respostas: { computador: id('pat310'), problema: 'nao-liga' },
      ficaComigo: true,
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(await lerChamado(r.json().numero)).toMatchObject({
      titulo: 'Notebook da recepção não liga',
      tituloNormalizado: 'notebook da recepcao nao liga',
    });
  });

  it('o título vazio e o longo demais são recusados no campo, com as respostas', async () => {
    const antes = await gravado();
    const vazio = await abrir('ana', {
      pessoa: id('marina'),
      tipo: tipoDe('Computador'),
      titulo: ' \n ',
      respostas: {},
      ficaComigo: true,
    });
    expect(vazio.statusCode, vazio.body).toBe(400);
    expect(vazio.json()).toMatchObject(
      PROBLEMA({
        titulo: 'Escreva o título.',
        'campos.computador': 'Responda esta pergunta.',
        'campos.problema': 'Responda esta pergunta.',
      }),
    );

    // 120 caracteres passam, contados em caracteres, e não nas unidades do UTF-16.
    const noLimite = await abrir('ana', { ...relato('marina'), titulo: '🖨'.repeat(120) });
    expect(noLimite.statusCode, noLimite.body).toBe(201);
    const longo = await abrir('ana', { ...relato('marina'), titulo: '🖨'.repeat(121) });
    expect(longo.statusCode, longo.body).toBe(400);
    expect(longo.json()).toMatchObject(PROBLEMA({ titulo: 'Use até 120 caracteres.' }));
    expect(await gravado()).toMatchObject({ chamados: antes.chamados + 1 });
  });
});

describe('as respostas', () => {
  it('Obrigatório escondido e a resposta guardada de um campo escondido', async () => {
    const r = await abrir('ana', manchando({ problema: 'atolando' }));
    expect(r.statusCode, r.body).toBe(201);
    // "Onde as manchas aparecem?" está escondido: não é pedido, e a resposta guardada não entra.
    expect(await lerChamado(r.json().numero)).toMatchObject({
      titulo: 'Impressora atolando',
      respostas: { impressora: id('pat139'), problema: 'atolando' },
    });
  });

  it('Opção inventada: recusada no campo, e nada é gravado', async () => {
    const antes = await gravado();
    const r = await abrir('ana', manchando({ problema: 'fumacando' }));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json()).toMatchObject(PROBLEMA({ 'campos.problema': 'Escolha uma das opções.' }));
    expect(await gravado()).toEqual(antes);
  });

  it('a resposta fora do tipo do campo é a recusa geral do formulário', async () => {
    const foraDoTipo = await abrir('ana', manchando({ problema: 42 }));
    expect(foraDoTipo.statusCode, foraDoTipo.body).toBe(400);
    expect(foraDoTipo.json()).toMatchObject(PROBLEMA({ formulario: RECUSA_DO_FORMULARIO }));

    const naoEObjeto = await abrir('ana', { ...manchando(), respostas: ['manchando'] });
    expect(naoEObjeto.statusCode, naoEObjeto.body).toBe(400);
    expect(naoEObjeto.json()).toMatchObject(PROBLEMA({ respostas: RECUSA_DO_FORMULARIO }));
  });

  it('o ativo, o local e a pessoa das respostas: os que não existem e os inativos, cada um no campo', async () => {
    const antes = await gravado();
    const inativos = await abrir('ana', {
      pessoa: id('paulo'),
      tipo: tipoDe('Empréstimo'),
      respostas: {
        'quem-vai-usar': id('otavio'),
        sala: id('sorocaba'),
        equipamento: id('pat140'),
      },
      ficaComigo: true,
    });
    expect(inativos.statusCode, inativos.body).toBe(400);
    expect(inativos.json()).toMatchObject(
      PROBLEMA({
        'campos.quem-vai-usar': MENSAGEM_DA_PESSOA_INATIVA,
        'campos.sala': MENSAGEM_DO_LOCAL_INATIVO,
        'campos.equipamento': MENSAGEM_DO_ATIVO_INATIVO,
      }),
    );

    const desconhecido = '0190a8b2-7c3d-7e4f-8a9b-0c1d2e3f4a5b';
    const naoExistem = await abrir('ana', {
      pessoa: id('paulo'),
      tipo: tipoDe('Empréstimo'),
      respostas: { 'quem-vai-usar': desconhecido, sala: desconhecido, equipamento: desconhecido },
      ficaComigo: true,
    });
    expect(naoExistem.statusCode, naoExistem.body).toBe(400);
    expect(naoExistem.json()).toMatchObject(
      PROBLEMA({
        'campos.quem-vai-usar': 'Pessoa não encontrada.',
        'campos.sala': 'Local não encontrado.',
        'campos.equipamento': 'Ativo não encontrado.',
      }),
    );
    expect(await gravado()).toEqual(antes);
  });

  it('o ativo de um tipo que o campo não aceita é recusado com os tipos aceitos', async () => {
    const r = await abrir('ana', {
      pessoa: id('paulo'),
      tipo: tipoDe('Empréstimo'),
      respostas: { 'quem-vai-usar': id('marina'), equipamento: id('pat310') },
      ficaComigo: true,
    });
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json()).toMatchObject(
      PROBLEMA({ 'campos.equipamento': mensagemDosTiposAceitos(['Impressora']) }),
    );
  });

  it('o ativo que quem abre não vê é recusado como o que não existe', async () => {
    // Diego vê os ativos de Jundiaí, e a PAT-00200 é de Campinas.
    const r = await abrir('diego', manchando({ impressora: id('pat200') }));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json()).toMatchObject(PROBLEMA({ 'campos.impressora': 'Ativo não encontrado.' }));
  });
});

describe('a pessoa e o tipo', () => {
  it('sem a pessoa e sem o tipo, as duas recusas juntas', async () => {
    const r = await abrir('ana', { respostas: {}, ficaComigo: true });
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json()).toMatchObject(
      PROBLEMA({ pessoa: 'Escolha quem pediu.', tipo: 'Escolha o tipo.' }),
    );
    const nulos = await abrir('ana', { pessoa: null, tipo: null, ficaComigo: true });
    expect(nulos.json()).toMatchObject(
      PROBLEMA({ pessoa: 'Escolha quem pediu.', tipo: 'Escolha o tipo.' }),
    );
  });

  it('a pessoa e o tipo que não existem', async () => {
    const desconhecido = '0190a8b2-7c3d-7e4f-8a9b-0c1d2e3f4a5b';
    for (const [pessoa, tipo] of [
      [desconhecido, desconhecido],
      ['marina', 'impressora'],
    ]) {
      const r = await abrir('ana', { pessoa, tipo, respostas: {}, ficaComigo: true });
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json()).toMatchObject(
        PROBLEMA({ pessoa: 'Pessoa não encontrada.', tipo: 'Tipo de chamado não encontrado.' }),
      );
    }
  });

  it('a pessoa inativa e o tipo que não está em uso', async () => {
    const antes = await gravado();
    for (const tipo of ['Mudança de mesa', 'Ramal novo']) {
      const r = await abrir('ana', {
        ...relato('otavio'),
        tipo: tipoDe(tipo),
      });
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json()).toMatchObject(
        PROBLEMA({ pessoa: MENSAGEM_DA_PESSOA_INATIVA, tipo: NAO_ESTA_EM_USO }),
      );
    }
    expect(await gravado()).toEqual(antes);
  });
});

describe('outra organização', () => {
  const hostDaOutra = 'grafite.chamados-abertura-outra.local';
  const daOutra: Record<string, string> = {};
  let iara: Entrada = SEM_ENTRADA;
  let clienteDaOutra: ReturnType<typeof clienteDaApi>;

  beforeAll(async () => {
    const outra = await criarOrganizacao(api, { nome: 'Outra empresa', enderecos: [hostDaOutra] });
    await naOrganizacao(api.banco, outra, (tx) =>
      criarTiposDeFabrica(tx, { ator: ATOR, momento: api.relogio.agora() }),
    );
    daOutra.org = outra;
    daOutra.tipo = await naOrganizacao(
      api.banco,
      outra,
      async (tx) =>
        (
          await tx
            .select({ id: tiposDeChamado.id })
            .from(tiposDeChamado)
            .where(eq(tiposDeChamado.nome, 'Outro'))
        )[0]?.id ?? '',
    );
    daOutra.local = await criarLocal(api, outra, { nome: 'Sorocaba', tipo: 'unidade' });
    daOutra.pessoa = await criarPessoa(api, outra, {
      nome: 'Sônia Prado',
      localId: daOutra.local,
    });
    daOutra.ativo = await criarAtivoDoTipo(api, outra, {
      tipoId: await criarTipo(api, outra, { nome: 'Impressora' }),
      patrimonio: 'PAT-00500',
      localId: daOutra.local,
    });
    const atende = await criarPerfil(api, outra, {
      nome: 'Atende os chamados',
      permissoes: ['chamados.atender', 'ativos.ver'],
    });
    const conta = await criarConta(api, outra, { usuario: 'iara', nome: 'Iara Melo' });
    await atribuir(api, outra, { perfilId: atende, contaId: conta.id });
    clienteDaOutra = clienteDaApi(api, hostDaOutra);
    iara = await clienteDaOutra.entrar('iara');
  });

  const abrirNaOutra = () =>
    clienteDaOutra.enviar('POST', '/chamados', iara, {
      pessoa: daOutra.pessoa,
      tipo: daOutra.tipo,
      respostas: { relato: 'A cadeira da recepção quebrou.' },
      ficaComigo: true,
    });

  it('o primeiro chamado da organização é o #1, e cada organização numera os seus', async () => {
    const antes = await gravado();
    const primeiro = await abrirNaOutra();
    expect(primeiro.statusCode, primeiro.body).toBe(201);
    expect(primeiro.json()).toMatchObject({ numero: 1, situacao: 'em-atendimento' });
    const segundo = await abrirNaOutra();
    expect(segundo.json()).toMatchObject({ numero: 2 });

    // A primeira organização segue do número dela.
    const daPrimeira = await abrir('ana', relato('marina'));
    expect(daPrimeira.json()).toMatchObject({ numero: antes.ultimo + 1 });
  });

  it('a pessoa, o tipo, o ativo e o local de outra organização são recusados como os que não existem', async () => {
    const antes = await gravado();
    const pessoaETipo = await abrir('ana', {
      pessoa: daOutra.pessoa,
      tipo: daOutra.tipo,
      respostas: { relato: 'A cadeira quebrou.' },
      ficaComigo: true,
    });
    expect(pessoaETipo.statusCode, pessoaETipo.body).toBe(400);
    expect(pessoaETipo.json()).toMatchObject(
      PROBLEMA({ pessoa: 'Pessoa não encontrada.', tipo: 'Tipo de chamado não encontrado.' }),
    );

    const respostas = await abrir('ana', {
      pessoa: id('paulo'),
      tipo: tipoDe('Empréstimo'),
      respostas: {
        'quem-vai-usar': daOutra.pessoa,
        sala: daOutra.local,
        equipamento: daOutra.ativo,
      },
      ficaComigo: true,
    });
    expect(respostas.statusCode, respostas.body).toBe(400);
    expect(respostas.json()).toMatchObject(
      PROBLEMA({
        'campos.quem-vai-usar': 'Pessoa não encontrada.',
        'campos.sala': 'Local não encontrado.',
        'campos.equipamento': 'Ativo não encontrado.',
      }),
    );
    expect(await gravado()).toEqual(antes);
  });
});

describe('o alcance de quem abre', () => {
  it('Pessoa de outro local: recusada pelo local, e nada é gravado', async () => {
    const antes = await gravado();
    const r = await abrir('bruno', relato('marina'));
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json()).toMatchObject({
      status: 409,
      detail: 'Você não atende os chamados de Jundiaí.',
    });
    expect(r.json()).not.toHaveProperty('campos');
    expect(await gravado()).toEqual(antes);
  });

  it('o ativo de outro local e o chamado da organização inteira também', async () => {
    const recusas = [
      // Paulo é de Campinas, e o notebook, de Jundiaí.
      {
        pedido: {
          pessoa: id('paulo'),
          tipo: tipoDe('Computador'),
          respostas: { computador: id('pat310'), problema: 'lento' },
        },
        frase: 'Você não atende os chamados de Jundiaí.',
      },
      { pedido: relato('rita'), frase: 'Você não atende os chamados da organização inteira.' },
      {
        pedido: {
          pessoa: id('paulo'),
          tipo: tipoDe('Impressora'),
          respostas: { impressora: id('pat400'), problema: 'nao-imprime' },
        },
        frase: 'Você não atende os chamados da organização inteira.',
      },
    ];
    for (const { pedido, frase } of recusas) {
      const r = await abrir('bruno', { ...pedido, ficaComigo: true });
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json()).toMatchObject({ detail: frase });
    }

    // Nos locais dele, Bruno abre.
    const deCampinas = await abrir('bruno', { ...relato('paulo'), ficaComigo: true });
    expect(deCampinas.statusCode, deCampinas.body).toBe(201);
    expect(deCampinas.json()).toMatchObject({
      situacao: 'em-atendimento',
      responsavel: { id: conta('bruno'), nome: 'Bruno Costa' },
    });
  });

  it('quem só vê os chamados não abre', async () => {
    const r = await abrir('carla', relato('marina'));
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:sem-permissao' });
  });
});

describe('quem atende por padrão', () => {
  it('Atendente padrão no horário, Aberto antes do horário e o "Fica com <pessoa> mesmo assim"', async () => {
    await atendimentoDoTipo('Impressora', {
      atendePorPadrao: conta('diego'),
      semNinguem: 'triagem',
    });
    try {
      const noHorario = await abrir('ana', { ...manchando(), ficaComigo: false });
      expect(noHorario.statusCode, noHorario.body).toBe(201);
      expect(noHorario.json()).toMatchObject({
        situacao: 'em-atendimento',
        responsavel: { id: conta('diego'), nome: 'Diego Ramos' },
      });
      expect(await lerChamado(noHorario.json().numero)).toMatchObject({
        responsavelId: conta('diego'),
        responsavelDesde: AGORA,
      });

      // Às 11:00, antes do horário que começa ao meio-dia.
      await horarioDoMeioDia(true);
      const antesDoHorario = await abrir('ana', { ...manchando(), ficaComigo: false });
      expect(antesDoHorario.json()).toMatchObject({ situacao: 'triagem', responsavel: null });

      await atendimentoDoTipo('Impressora', {
        atendePorPadrao: conta('diego'),
        semNinguem: 'fica',
      });
      const mesmoAssim = await abrir('ana', { ...manchando(), ficaComigo: false });
      expect(mesmoAssim.json()).toMatchObject({
        situacao: 'em-atendimento',
        responsavel: { id: conta('diego') },
      });

      // Com o "Fica comigo", o chamado fica com quem abre, também fora do horário.
      const ficaComigo = await abrir('ana', manchando());
      expect(ficaComigo.json()).toMatchObject({ responsavel: { id: conta('ana') } });
    } finally {
      await horarioDoMeioDia(false);
      await atendimentoDoTipo('Impressora', { atendePorPadrao: null, semNinguem: 'triagem' });
    }
  });

  it('quem atende por padrão sem os locais do chamado, ou inativo, deixa o chamado na triagem', async () => {
    await atendimentoDoTipo('Impressora', {
      atendePorPadrao: conta('diego'),
      semNinguem: 'fica',
    });
    try {
      // A impressora de Campinas leva o chamado de Marina também a Campinas, que Diego não atende.
      const foraDoAlcance = await abrir('ana', {
        ...manchando({ impressora: id('pat200') }),
        ficaComigo: false,
      });
      expect(foraDoAlcance.statusCode, foraDoAlcance.body).toBe(201);
      expect(foraDoAlcance.json()).toMatchObject({ situacao: 'triagem', responsavel: null });

      await atendimentoDoTipo('Impressora', {
        atendePorPadrao: conta('elisa'),
        semNinguem: 'fica',
      });
      await naOrganizacao(api.banco, org, (tx) =>
        tx
          .update(contas)
          .set({ situacao: 'inativa' })
          .where(eq(contas.id, conta('elisa'))),
      );
      const inativa = await abrir('ana', { ...manchando(), ficaComigo: false });
      expect(inativa.json()).toMatchObject({ situacao: 'triagem', responsavel: null });
    } finally {
      await atendimentoDoTipo('Impressora', { atendePorPadrao: null, semNinguem: 'triagem' });
    }
  });
});

describe('os anexos dos campos', () => {
  const enviarAnexo = async (usuario: string, texto: string) => {
    const r = await cliente.enviarBytes(
      'POST',
      `/chamados/anexos?nome=${encodeURIComponent(`${texto}.pdf`)}`,
      como(usuario),
      PDF(texto),
    );
    expect(r.statusCode, r.body).toBe(201);
    return r.json().id as string;
  };

  const anexoDo = (arquivoId: string) =>
    naOrganizacao(api.banco, org, async (tx) => {
      const [linha] = await tx
        .select({
          chamadoId: anexosDosChamados.chamadoId,
          mensagemId: anexosDosChamados.mensagemId,
          campoId: anexosDosChamados.campoId,
        })
        .from(anexosDosChamados)
        .where(eq(anexosDosChamados.arquivoId, arquivoId));
      return linha;
    });

  it('a abertura toma os anexos do campo, só os enviados por quem abre', async () => {
    const foto = await enviarAnexo('ana', 'foto da impressora');
    const r = await abrir('ana', manchando({ foto: [foto] }));
    expect(r.statusCode, r.body).toBe(201);
    const chamado = await lerChamado(r.json().numero);
    expect(chamado.respostas).toMatchObject({ foto: [foto] });
    expect(await anexoDo(foto)).toEqual({
      chamadoId: chamado.id,
      mensagemId: null,
      campoId: 'foto',
    });

    // O anexo de Diego não é de Ana: a abertura é recusada no campo, e o anexo segue sem dono.
    const antes = await gravado();
    const deDiego = await enviarAnexo('diego', 'foto do diego');
    const recusada = await abrir('ana', manchando({ foto: [deDiego] }));
    expect(recusada.statusCode, recusada.body).toBe(400);
    expect(recusada.json()).toMatchObject(PROBLEMA({ 'campos.foto': ANEXO_NAO_ENCONTRADO }));
    expect(await anexoDo(deDiego)).toEqual({ chamadoId: null, mensagemId: null, campoId: null });
    expect(await gravado()).toEqual(antes);
  });
});

describe('o módulo desligado', () => {
  it('a abertura responde que o módulo está desligado', async () => {
    await desligarModulos(api, org, ['chamados']);
    try {
      const r = await abrir('ana', relato('marina'));
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:modulo-desligado',
        detail: 'O módulo Chamados está desligado nesta organização.',
      });
    } finally {
      await desligarModulos(api, org, []);
    }
  });
});
