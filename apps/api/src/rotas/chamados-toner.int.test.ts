// Pedir toner (spec chamados, "OS e solicitação pelo chamado"; solicitacoes, "Solicitação pelo
// chamado"; change chamados-da-ti, design, "Pedir toner (tarefa 4.17)"): a rota em dois passos, a
// pendente a que o chamado se junta, o registro com a cor do chamado, a gravação pelo registro das
// solicitações de hoje, o evento da conversa, que não sobe a versão, a auditoria, a ficha e as
// recusas. A ordem das recusas do chamado é do domínio (`chamados/os-e-solicitacao.test.ts`), e a
// cor, do `chamados/cor-do-toner.test.ts`; aqui fica um caso de cada ligação.
import {
  eventos,
  impressorasDasSolicitacoes,
  itensDasSolicitacoes,
  naOrganizacao,
  numeracaoDasSolicitacoes,
  solicitacoes,
  tiposDeChamado,
} from '@grafite/db';
import { asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import {
  type ChamadosDeTeste,
  montarChamados,
  montarImpressorasDoToner,
  type UsuarioDosChamados,
} from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  criarPerfil,
  criarRelogio,
} from '../../test/integracao.ts';

const host = 'grafite.chamados-toner.local';
/** A terça-feira, 17 de novembro de 2026, às 07:40 em São Paulo: a abertura dos chamados. */
const ABERTURA = new Date('2026-11-17T10:40:00.000Z');
const HORA = 60 * 60 * 1000;
const CONFLITO = 'urn:grafite:problema:conflito';

let api: ApiDeTeste;
let c: ChamadosDeTeste;
/** As impressoras do toner, do apoio dos chamados (`montarImpressorasDoToner`). */
let ids: Awaited<ReturnType<typeof montarImpressorasDoToner>>;

const pedirToner = (numero: number, usuario: UsuarioDosChamados, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chamados/${numero}/toner`, c.como(usuario), corpo);
const assumir = (numero: number, usuario: UsuarioDosChamados) =>
  c.cliente.enviar('POST', `/chamados/${numero}/assumir`, c.como(usuario), {});

/** O chamado de Impressora da pessoa, com o ativo ligado. */
const daImpressora = (
  pessoa: keyof ChamadosDeTeste['pessoas'],
  ativo: string,
  ficaComigo = true,
) => ({
  pessoa: c.pessoas[pessoa],
  tipo: c.tipos.Impressora,
  respostas: { impressora: ativo, problema: 'nao-imprime' },
  ficaComigo,
});

/** O registro que a rota dá: a pessoa, a impressora e um item da cor, com a quantidade 1. */
const registroDado = (pessoa: string, impressora: string, cor: string) => ({
  tipo: 'toner',
  pessoa,
  observacao: null,
  impressoras: [impressora],
  itens: [{ impressora, cor, quantidade: 1, consumivel: null }],
});

/** As solicitações da impressora, pelo número, como o banco as guarda. */
const solicitacoesDa = (impressora: string) =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .select({ id: solicitacoes.id, numero: solicitacoes.numero })
      .from(solicitacoes)
      .innerJoin(
        impressorasDasSolicitacoes,
        eq(impressorasDasSolicitacoes.solicitacaoId, solicitacoes.id),
      )
      .where(eq(impressorasDasSolicitacoes.ativoId, impressora))
      .orderBy(asc(solicitacoes.numero)),
  );

/** A solicitação pelo número, com os itens. */
const solicitacao = async (numero: number) => {
  const [linha] = await naOrganizacao(api.banco, c.org, (tx) =>
    tx.select().from(solicitacoes).where(eq(solicitacoes.numero, numero)),
  );
  if (!linha) throw new Error(`A solicitação ${numero} não existe.`);
  const itens = await naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .select({
        impressoraId: itensDasSolicitacoes.impressoraId,
        cor: itensDasSolicitacoes.cor,
        quantidade: itensDasSolicitacoes.quantidade,
        consumivelId: itensDasSolicitacoes.consumivelId,
      })
      .from(itensDasSolicitacoes)
      .where(eq(itensDasSolicitacoes.solicitacaoId, linha.id)),
  );
  return { ...linha, itens };
};

/** Os eventos em tempo real de um alvo qualquer, na ordem. */
const eventosDoAlvo = (alvoId: string) =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, permissao: eventos.permissao, locais: eventos.locais })
      .from(eventos)
      .where(eq(eventos.alvoId, alvoId))
      .orderBy(asc(eventos.id)),
  );

/** A recusa sem mudança: nem a solicitação, nem a conversa, nem a versão, nem os eventos. */
async function nadaMudou(numero: number, impressora: string, recusado: () => Promise<unknown>) {
  const antes = {
    chamado: await c.lerChamado(numero),
    conversa: await c.conversaDo(numero),
    eventos: await c.eventosDo(numero),
    solicitacoes: await solicitacoesDa(impressora),
  };
  await recusado();
  expect(await c.lerChamado(numero)).toEqual(antes.chamado);
  expect(await c.conversaDo(numero)).toEqual(antes.conversa);
  expect(await c.eventosDo(numero)).toEqual(antes.eventos);
  expect(await solicitacoesDa(impressora)).toEqual(antes.solicitacoes);
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  c = await montarChamados(api, host);
  // Os números do mockup: a primeira solicitação registrada aqui é a 5.
  await naOrganizacao(api.banco, c.org, async (tx) => {
    await tx.insert(numeracaoDasSolicitacoes).values({ orgId: c.org, ultimo: 4 });
    // O Toner não gera a solicitação na abertura: o "Pedir toner" decide a cor dele.
    await tx
      .update(tiposDeChamado)
      .set({ geraSolicitacao: 'nao' })
      .where(eq(tiposDeChamado.id, c.tipos.Toner ?? ''));
  });
  // Ana atende as solicitações da organização inteira; Diego, as de Jundiaí, sem ver os ativos;
  // Elisa vê os ativos de Campinas, sem atender as solicitações; Carla, que vê os chamados da
  // organização inteira, sem as solicitações, atende os de Jundiaí.
  const atendeAsSolicitacoes = await criarPerfil(api, c.org, {
    nome: 'Atende as solicitações',
    permissoes: ['solicitacoes.atender'],
  });
  await atribuir(api, c.org, { perfilId: atendeAsSolicitacoes, contaId: c.conta('ana') });
  await atribuir(api, c.org, {
    perfilId: atendeAsSolicitacoes,
    contaId: c.conta('diego'),
    localId: c.locais.jundiai,
  });
  const veOsAtivos = await criarPerfil(api, c.org, {
    nome: 'Vê os ativos',
    permissoes: ['ativos.ver'],
  });
  await atribuir(api, c.org, {
    perfilId: veOsAtivos,
    contaId: c.conta('elisa'),
    localId: c.locais.campinas,
  });
  await atribuir(api, c.org, {
    perfilId: c.perfis.atende,
    contaId: c.conta('carla'),
    localId: c.locais.jundiai,
  });

  ids = await montarImpressorasDoToner(api, c, ABERTURA);

  await c.entrar('ana');
  // #1042: a PAT-00139 de Marina, com Ana.
  await c.abrir(daImpressora('marina', ids.pat139));
  // #1043: a mesma impressora, na triagem.
  await c.abrir(daImpressora('marina', ids.pat139, false));
  // #1044: o Outro de Marina, sem ativo.
  await c.abrir(c.relato('marina'));
  // #1045: a mesma impressora, resolvida.
  await c.abrir(daImpressora('marina', ids.pat139));
  const resolvido = await c.cliente.enviar('POST', '/chamados/1045/resolver', c.como('ana'), {
    feito: 'Troquei o toner.',
  });
  expect(resolvido.statusCode, resolvido.body).toBe(200);
  // #1046: a PAT-00200 de Fernanda, do Administrativo, em Campinas.
  await c.abrir(daImpressora('fernanda', ids.pat200));
  // #1047: a PAT-00139, de novo.
  await c.abrir(daImpressora('marina', ids.pat139));
  // #1048: o monitor da Recepção.
  await c.abrir(daImpressora('marina', ids.mon001));
  // #1049: a tanque de tinta.
  await c.abrir(daImpressora('marina', ids.pat300));
  // #1050: o Toner da PAT-00140, com o Ciano respondido.
  await c.abrir({
    pessoa: c.pessoas.marina,
    tipo: c.tipos.Toner,
    respostas: { impressora: ids.pat140, cor: 'ciano' },
    ficaComigo: true,
  });
  // #1051: a impressora sem a coleta dos suprimentos.
  await c.abrir(daImpressora('marina', ids.pat500));
  // #1052 e #1053: a PAT-00200 de Fernanda, de novo.
  await c.abrir(daImpressora('fernanda', ids.pat200));
  await c.abrir(daImpressora('fernanda', ids.pat200));
  // #1054 e #1055: a PAT-00140, de novo.
  await c.abrir(daImpressora('marina', ids.pat140));
  await c.abrir(daImpressora('marina', ids.pat140));
  // As sessões entram uma hora depois da abertura.
  api.relogio.avancar(HORA);
  await c.entrar();
});

describe('POST /chamados/:numero/toner', () => {
  it('Toner pelo chamado sem pendente: o registro vem com a cor mais baixa, sem gravar nada, e a gravação liga o chamado', async () => {
    const antes = await c.lerChamado(1042);
    const eventosAntes = await c.eventosDo(1042);
    const avisos = await c.notificacoesDo(1042);
    const registro = registroDado(c.pessoas.marina, ids.pat139, 'preto');
    await nadaMudou(1042, ids.pat139, async () => {
      const r = await pedirToner(1042, 'ana');
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json()).toEqual({ resultado: 'registro', registro });
    });

    const agora = api.relogio.agora();
    const r = await pedirToner(1042, 'ana', { registro });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toEqual({ resultado: 'pediu', solicitacao: { numero: 5 } });
    const nova = await solicitacao(5);
    expect(nova).toMatchObject({
      tipo: 'toner',
      situacao: 'aberta',
      pessoaId: c.pessoas.marina,
      registradaPor: c.conta('ana'),
      locais: [c.locais.recepcao],
    });
    // O consumível nulo do registro é o compatível sugerido na gravação.
    expect(nova.itens).toEqual([
      { impressoraId: ids.pat139, cor: 'preto', quantidade: 1, consumivelId: ids.pretoDaColorida },
    ]);
    // A situação, quem atende, os locais e a versão não mudam.
    expect(await c.lerChamado(1042)).toEqual({ ...antes, solicitacaoId: nova.id });
    expect((await c.conversaDo(1042)).at(-1)).toMatchObject({
      especie: 'evento',
      evento: 'solicitacao',
      autorConta: c.conta('ana'),
      texto: null,
      dados: { numero: 5, como: 'pediu' },
      criadaEm: agora,
    });
    const auditados = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditados.map(({ acao }) => acao).sort()).toEqual([
      'chamado.pediu-toner',
      'solicitacao.registrada',
    ]);
    const pediu = auditados.find(({ acao }) => acao === 'chamado.pediu-toner');
    expect(pediu).toMatchObject({ atorContaId: c.conta('ana'), alvoId: c.chamadoId(1042) });
    expect(pediu?.depois).toEqual({ solicitacao: 5, como: 'pediu' });
    expect(await c.eventosDo(1042)).toEqual([
      ...eventosAntes,
      {
        tipo: 'chamados.mudaram',
        alvoTipo: 'chamado',
        permissao: 'chamados.ver',
        locais: [c.locais.recepcao],
      },
    ]);
    expect(await eventosDoAlvo(nova.id)).toEqual([
      { tipo: 'solicitacoes.mudaram', permissao: 'solicitacoes.ver', locais: [c.locais.recepcao] },
    ]);
    expect(await c.notificacoesDo(1042)).toEqual(avisos);
  });

  it('Pedir toner com uma solicitação pendente: o chamado se junta a ela, sem solicitação nova, e o desfazer do assumir segue valendo', async () => {
    const assumido = await assumir(1043, 'ana');
    expect(assumido.statusCode, assumido.body).toBe(200);
    const antes = await c.lerChamado(1043);
    const eventosAntes = await c.eventosDo(1043);
    const { id: daCinco } = await solicitacao(5);
    const daSolicitacao = await eventosDoAlvo(daCinco);
    const r = await pedirToner(1043, 'ana');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ resultado: 'juntou', solicitacao: { numero: 5 } });
    expect((await solicitacoesDa(ids.pat139)).map(({ numero }) => numero)).toEqual([5]);
    expect(await c.lerChamado(1043)).toEqual({ ...antes, solicitacaoId: daCinco });
    expect((await c.conversaDo(1043)).at(-1)).toMatchObject({
      evento: 'solicitacao',
      dados: { numero: 5, como: 'juntou' },
    });
    const auditados = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditados.map(({ acao }) => acao)).toEqual(['chamado.pediu-toner']);
    expect(auditados[0]?.depois).toEqual({ solicitacao: 5, como: 'juntou' });
    // O chamado vai a quem vê os locais dele, e a solicitação, que ganhou um chamado, aos dela.
    expect(await c.eventosDo(1043)).toEqual([
      ...eventosAntes,
      {
        tipo: 'chamados.mudaram',
        alvoTipo: 'chamado',
        permissao: 'chamados.ver',
        locais: [c.locais.recepcao],
      },
    ]);
    expect(await eventosDoAlvo(daCinco)).toEqual([
      ...daSolicitacao,
      { tipo: 'solicitacoes.mudaram', permissao: 'solicitacoes.ver', locais: [c.locais.recepcao] },
    ]);

    const desfeito = await c.cliente.enviar('POST', '/chamados/1043/desfazer', c.como('ana'), {
      versao: assumido.json().versao,
    });
    expect(desfeito.statusCode, desfeito.body).toBe(200);
    expect(desfeito.json()).toMatchObject({ situacao: 'triagem', responsavel: null });
    expect((await c.lerChamado(1043)).solicitacaoId).toBe(daCinco);
  });

  it('Segunda solicitação do chamado: recusada nos dois passos, com a que ele já tem', async () => {
    await nadaMudou(1042, ids.pat139, async () => {
      for (const corpo of [{}, { registro: registroDado(c.pessoas.marina, ids.pat139, 'preto') }]) {
        const r = await pedirToner(1042, 'ana', corpo);
        expect(r.statusCode, r.body).toBe(409);
        expect(r.json()).toMatchObject({
          type: CONFLITO,
          detail: 'O chamado #1042 já está na solicitação 5.',
        });
      }
    });
  });

  it('o chamado sem o ativo, o resolvido e quem não atende os locais dele são recusados no 409', async () => {
    await nadaMudou(1044, ids.pat139, async () => {
      const r = await pedirToner(1044, 'ana');
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().detail).toBe('O chamado #1044 não tem um ativo ligado.');
    });
    await nadaMudou(1045, ids.pat139, async () => {
      const r = await pedirToner(1045, 'ana');
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().detail).toBe('O chamado #1045 está resolvido.');
    });
    // Carla vê o #1046, de Campinas, e atende só os de Jundiaí.
    await nadaMudou(1046, ids.pat200, async () => {
      const r = await pedirToner(1046, 'carla');
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().detail).toBe('Você não atende os chamados de Campinas › Administrativo.');
    });
  });

  it('as recusas da impressora e a permissão são as do registro, também com a pendente', async () => {
    // Diego atende os chamados e as solicitações de Jundiaí, sem ver os ativos: a PAT-00139, que
    // está na solicitação 5, é como a que não existe.
    await nadaMudou(1047, ids.pat139, async () => {
      const r = await pedirToner(1047, 'diego');
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual({ 'impressoras.0': 'Impressora não encontrada.' });
    });
    await nadaMudou(1048, ids.mon001, async () => {
      const r = await pedirToner(1048, 'ana');
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().detail).toBe('MON-00001 não usa consumíveis.');
    });
    // Elisa atende os chamados de Campinas e vê os ativos de lá, sem atender as solicitações.
    await nadaMudou(1046, ids.pat200, async () => {
      const r = await pedirToner(1046, 'elisa');
      expect(r.statusCode, r.body).toBe(403);
    });
    // Bruno só vê os chamados de Campinas.
    await nadaMudou(1046, ids.pat200, async () => {
      const r = await pedirToner(1046, 'bruno');
      expect(r.statusCode, r.body).toBe(403);
    });
  });

  it('Toner pelo chamado na impressora que só usa o colorido: o registro vem com o colorido, e quem atende o muda antes de gravar', async () => {
    const r = await pedirToner(1049, 'ana');
    expect(r.statusCode, r.body).toBe(200);
    const { registro } = r.json();
    expect(registro).toEqual(registroDado(c.pessoas.marina, ids.pat300, 'colorido'));
    // A solicitação do chamado precisa levar a impressora dele.
    await nadaMudou(1049, ids.pat300, async () => {
      const sem = await pedirToner(1049, 'ana', {
        registro: {
          ...registro,
          impressoras: [ids.pat140],
          itens: [{ impressora: ids.pat140, cor: 'preto', quantidade: 1, consumivel: null }],
        },
      });
      expect(sem.statusCode, sem.body).toBe(400);
      expect(sem.json().campos).toEqual({
        impressoras: 'A solicitação do chamado leva a impressora dele, PAT-00300.',
      });
    });
    const mudado = await pedirToner(1049, 'ana', {
      registro: {
        ...registro,
        observacao: 'Os dois coloridos da sala.',
        itens: [{ ...registro.itens[0], quantidade: 2 }],
      },
    });
    expect(mudado.statusCode, mudado.body).toBe(201);
    const { numero } = mudado.json().solicitacao;
    expect(await solicitacao(numero)).toMatchObject({
      observacao: 'Os dois coloridos da sala.',
      itens: [{ impressoraId: ids.pat300, cor: 'colorido', quantidade: 2 }],
    });
  });

  it('Toner com a cor respondida, e a pendente nascida com o registro aberto, que recusa a gravação', async () => {
    const r = await pedirToner(1050, 'ana');
    expect(r.statusCode, r.body).toBe(200);
    const { registro } = r.json();
    expect(registro).toEqual(registroDado(c.pessoas.marina, ids.pat140, 'ciano'));
    // Antes de Ana gravar, a PAT-00140 entra numa solicitação pela tela das solicitações.
    const avulsa = await c.cliente.enviar('POST', '/solicitacoes', c.como('ana'), {
      ...registroDado(c.pessoas.fernanda, ids.pat140, 'preto'),
    });
    expect(avulsa.statusCode, avulsa.body).toBe(201);
    const pendente = avulsa.json().numero;
    await nadaMudou(1050, ids.pat140, async () => {
      const gravado = await pedirToner(1050, 'ana', { registro });
      expect(gravado.statusCode, gravado.body).toBe(409);
      expect(gravado.json().detail).toBe(
        `A PAT-00140 já está na solicitação ${pendente}: peça o toner de novo para o chamado se juntar a ela.`,
      );
    });
    const juntou = await pedirToner(1050, 'ana');
    expect(juntou.statusCode, juntou.body).toBe(200);
    expect(juntou.json()).toEqual({ resultado: 'juntou', solicitacao: { numero: pendente } });

    // Com duas pendentes da impressora, o chamado se junta à de menor número.
    const outra = await c.cliente.enviar('POST', '/solicitacoes', c.como('ana'), {
      ...registroDado(c.pessoas.fernanda, ids.pat140, 'ciano'),
    });
    expect(outra.statusCode, outra.body).toBe(201);
    const naMenor = await pedirToner(1054, 'ana');
    expect(naMenor.json()).toEqual({ resultado: 'juntou', solicitacao: { numero: pendente } });

    // Cancelar a solicitação não muda o chamado, e a cancelada não é pendente.
    const antes = await c.lerChamado(1050);
    for (const numero of [pendente, outra.json().numero]) {
      const cancelada = await c.cliente.enviar(
        'POST',
        `/solicitacoes/${numero}/cancelamento`,
        c.como('ana'),
        { motivo: 'Pedido em dobro.' },
      );
      expect(cancelada.statusCode, cancelada.body).toBe(200);
    }
    expect(await c.lerChamado(1050)).toEqual(antes);
    const semPendente = await pedirToner(1055, 'ana');
    expect(semPendente.statusCode, semPendente.body).toBe(200);
    expect(semPendente.json().resultado).toBe('registro');
  });

  it('sem a coleta dos suprimentos no tipo, a leitura não conta, e vale o preto', async () => {
    const r = await pedirToner(1051, 'ana');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().registro).toEqual(registroDado(c.pessoas.marina, ids.pat500, 'preto'));
  });

  it('dois pedidos da mesma impressora ao mesmo tempo registram uma solicitação só', async () => {
    const registro = registroDado(c.pessoas.fernanda, ids.pat200, 'preto');
    const respostas = await Promise.all(
      [1052, 1053].map((numero) => pedirToner(numero, 'ana', { registro })),
    );
    expect(respostas.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
    expect(await solicitacoesDa(ids.pat200)).toHaveLength(1);
    // Com a pendente, quem não atende as solicitações nos locais da impressora também é recusado:
    // Elisa atende os chamados de Campinas, sem as solicitações, e não junta o #1046 a ela.
    await nadaMudou(1046, ids.pat200, async () => {
      const r = await pedirToner(1046, 'elisa');
      expect(r.statusCode, r.body).toBe(403);
    });
  });

  it('com o módulo Operação desligado, o 403 do módulo, antes das recusas do chamado', async () => {
    await desligarModulos(api, c.org, ['operacao']);
    try {
      for (const numero of [1048, 1045]) {
        await nadaMudou(numero, ids.pat139, async () => {
          const r = await pedirToner(numero, 'ana');
          expect(r.statusCode, r.body).toBe(403);
          expect(r.json()).toMatchObject({
            type: 'urn:grafite:problema:modulo-desligado',
            detail: 'O módulo Operação está desligado nesta organização.',
          });
        });
      }
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });

  it('Troca do ativo depois da solicitação: o chamado troca de ativo, e a solicitação fica no dela, ligada a ele', async () => {
    const { versao, solicitacaoId } = await c.lerChamado(1042);
    const trocado = await c.cliente.enviar('PUT', '/chamados/1042/ativo', c.como('ana'), {
      ativo: ids.pat140,
      versao,
    });
    expect(trocado.statusCode, trocado.body).toBe(200);
    expect(await c.lerChamado(1042)).toMatchObject({ ativoId: ids.pat140, solicitacaoId });
    expect((await solicitacoesDa(ids.pat139)).map(({ numero }) => numero)).toEqual([5]);
  });
});

describe('a solicitação na ficha do chamado', () => {
  it('a ficha lê o evento a toda conta que vê o chamado, e a solicitação ligada só a quem vê as solicitações', async () => {
    // Carla vê os chamados, sem as solicitações.
    const deCarla = await c.cliente.consultar('/chamados/1042', c.como('carla'));
    expect(deCarla.statusCode, deCarla.body).toBe(200);
    const [evento] = (deCarla.json().conversa as { evento?: string }[]).filter(
      (item) => item.evento === 'solicitacao',
    );
    expect(evento).toMatchObject({
      autor: { tipo: 'conta', id: c.conta('ana'), nome: 'Ana Souza' },
      os: null,
      solicitacao: { numero: 5, como: 'pediu' },
    });
    expect(deCarla.json().solicitacao).toBeNull();
    const deAna = await c.cliente.consultar('/chamados/1042', c.como('ana'));
    expect(deAna.json().solicitacao).toMatchObject({ numero: 5, situacao: 'aberta' });
    // Os outros eventos vêm sem a solicitação.
    const outros = (
      deAna.json().conversa as { especie: string; evento?: string; solicitacao?: unknown }[]
    )
      .filter((item) => item.especie === 'evento' && item.evento !== 'solicitacao')
      .map(({ solicitacao: daSolicitacao }) => daSolicitacao);
    expect(outros.length).toBeGreaterThan(0);
    expect(outros.every((daSolicitacao) => daSolicitacao === null)).toBe(true);
  });
});
