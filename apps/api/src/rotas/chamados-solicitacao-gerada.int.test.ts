// A solicitação gerada pelo tipo na abertura do chamado (spec solicitacoes, "Solicitação pelo
// chamado"; tipos-de-chamado, "O que acontece depois"; change chamados-da-ti, design, "A solicitação
// gerada pelo tipo (tarefa 4.18)"): o Toner com a cor do chamado, que se junta à pendente, o
// Equipamento com o local da pessoa ou do ativo, o registro delegado a quem abre, a auditoria com o
// chamado e o tipo, a recusa que não impede a abertura, com o motivo na conversa, e os chamados na
// leitura da solicitação. As frases do motivo são do domínio (`chamados/os-e-solicitacao.test.ts`);
// aqui fica um caso de cada ligação.
import {
  ativos,
  impressorasDasSolicitacoes,
  itensDasSolicitacoes,
  locais,
  naOrganizacao,
  numeracaoDasSolicitacoes,
  pessoas,
  solicitacoes,
  tiposDeAtivo,
  tiposDeChamado,
} from '@grafite/db';
import type { DadosDaSolicitacaoNaoGerada } from '@grafite/domain';
import { asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarTipo, desligarModulos } from '../../test/alertas.ts';
import {
  type ChamadosDeTeste,
  montarChamados,
  montarImpressorasDoToner,
} from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  criarLocal,
  criarPerfil,
  criarPessoa,
  criarRelogio,
  esperarNaTrava,
} from '../../test/integracao.ts';
import { travar } from '../travas.ts';

const host = 'grafite.chamados-solicitacao-gerada.local';
/** A terça-feira, 17 de novembro de 2026, às 07:40 em São Paulo: a abertura dos chamados. */
const ABERTURA = new Date('2026-11-17T10:40:00.000Z');

let api: ApiDeTeste;
let c: ChamadosDeTeste;
/** As impressoras do toner, do apoio dos chamados (`montarImpressorasDoToner`). */
let ids: Awaited<ReturnType<typeof montarImpressorasDoToner>>;
let notebook: string;
let financeiro: string;
/** Marina Lopes, do Financeiro, da spec. */
let marinaLopes: string;
/** O chamado de Rita, sem local, que não gerou o Equipamento. */
let semLocal: number;
/** O "Equipamento novo", que gera a solicitação de Equipamento de Notebook, sem o campo Ativo. */
let equipamentoNovo: string;

const abrir = (corpo: object) => c.cliente.enviar('POST', '/chamados', c.como('ana'), corpo);

/** O chamado de Toner da pessoa, com a impressora e a cor respondida. */
const doToner = (pessoa: string, impressora: string | null, cor = 'preto') => ({
  pessoa,
  tipo: c.tipos.Toner,
  respostas: impressora === null ? { cor } : { impressora, cor },
  ficaComigo: true,
});

/** O chamado de "Equipamento novo" da pessoa, com o título escrito. */
const doEquipamento = (pessoa: string, titulo = 'Equipamento novo para Marina') => ({
  pessoa,
  tipo: equipamentoNovo,
  titulo,
  respostas: { relato: 'Preciso de um notebook para o trabalho.' },
  ficaComigo: true,
});

/** Abre o chamado pela rota, guarda o id pelo número e devolve a resposta e o número. */
async function abrirChamado(corpo: object) {
  const r = await abrir(corpo);
  expect(r.statusCode, r.body).toBe(201);
  const { numero } = r.json() as { numero: number };
  await c.guardar(numero);
  return { r, numero };
}

/** As solicitações, pelo número, como o banco as guarda. */
const todasAsSolicitacoes = () =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx.select().from(solicitacoes).orderBy(asc(solicitacoes.numero)),
  );

/** A solicitação pelo número, com as impressoras e os itens. */
const solicitacao = async (numero: number) => {
  const [linha] = await naOrganizacao(api.banco, c.org, (tx) =>
    tx.select().from(solicitacoes).where(eq(solicitacoes.numero, numero)),
  );
  if (!linha) throw new Error(`A solicitação ${numero} não existe.`);
  const impressoras = await naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .select({ ativoId: impressorasDasSolicitacoes.ativoId })
      .from(impressorasDasSolicitacoes)
      .where(eq(impressorasDasSolicitacoes.solicitacaoId, linha.id)),
  );
  const itens = await naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .select({
        impressoraId: itensDasSolicitacoes.impressoraId,
        cor: itensDasSolicitacoes.cor,
        quantidade: itensDasSolicitacoes.quantidade,
      })
      .from(itensDasSolicitacoes)
      .where(eq(itensDasSolicitacoes.solicitacaoId, linha.id)),
  );
  return { ...linha, impressoras: impressoras.map(({ ativoId }) => ativoId), itens };
};

/** O último número de solicitação da organização. */
const ultimaSolicitacao = async () => {
  const [linha] = await naOrganizacao(api.banco, c.org, (tx) =>
    tx.select({ ultimo: numeracaoDasSolicitacoes.ultimo }).from(numeracaoDasSolicitacoes),
  );
  return linha?.ultimo ?? 0;
};

/** Os eventos da conversa do chamado, sem a abertura: o código e os dados. */
const eventosDaConversa = async (numero: number) =>
  (await c.conversaDo(numero))
    .filter(({ especie, evento }) => especie === 'evento' && evento !== 'abertura')
    .map(({ evento, dados, autorConta }) => ({ evento, dados, autorConta }));

/**
 * A abertura com a recusa do registro: o chamado abre, sem a solicitação nem o número dela gasto, e
 * a conversa ganha o motivo, logo depois da abertura.
 */
async function abreSemASolicitacao(
  corpo: object,
  motivo: string,
  guardado: DadosDaSolicitacaoNaoGerada = { motivo },
) {
  const antes = { ultima: await ultimaSolicitacao(), todas: await todasAsSolicitacoes() };
  const { r, numero } = await abrirChamado(corpo);
  expect(await ultimaSolicitacao()).toBe(antes.ultima);
  expect(await todasAsSolicitacoes()).toEqual(antes.todas);
  expect((await c.lerChamado(numero)).solicitacaoId).toBeNull();
  expect((await c.conversaDo(numero)).map(({ evento }) => evento)).toEqual([
    'abertura',
    'solicitacao-nao-gerada',
  ]);
  expect(await eventosDaConversa(numero)).toEqual([
    { evento: 'solicitacao-nao-gerada', dados: guardado, autorConta: c.conta('ana') },
  ]);
  const auditados = await auditoriaDaRequisicao(api, c.org, r);
  expect(auditados.map(({ acao }) => acao)).toEqual(['chamado.aberto']);
  expect(auditados[0]?.depois).not.toHaveProperty('solicitacao');
  return numero;
}

/** Muda o tipo de chamado direto no banco, pelo id. */
const mudarTipo = (id: string, mudanca: Partial<typeof tiposDeChamado.$inferInsert>) =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx.update(tiposDeChamado).set(mudanca).where(eq(tiposDeChamado.id, id)),
  );

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  c = await montarChamados(api, host);
  ids = await montarImpressorasDoToner(api, c, ABERTURA);
  notebook = await criarTipo(api, c.org, { nome: 'Notebook' });
  financeiro = await criarLocal(api, c.org, { nome: 'Financeiro', tipo: 'unidade' });
  marinaLopes = await criarPessoa(api, c.org, { nome: 'Marina Lopes', localId: financeiro });
  await naOrganizacao(api.banco, c.org, async (tx) => {
    // Os números do mockup: a primeira solicitação registrada aqui é a 5.
    await tx.insert(numeracaoDasSolicitacoes).values({ orgId: c.org, ultimo: 4 });
    // O "Equipamento novo", copiado do Outro: o relato, o local e a foto, sem o campo Ativo.
    const [outro] = await tx
      .select()
      .from(tiposDeChamado)
      .where(eq(tiposDeChamado.id, c.tipos.Outro ?? ''));
    if (!outro) throw new Error('O tipo Outro não existe.');
    const { id: _id, ...doOutro } = outro;
    const [novo] = await tx
      .insert(tiposDeChamado)
      .values({
        ...doOutro,
        nome: 'Equipamento novo',
        nomeNormalizado: 'equipamento novo',
        ordem: 99,
        geraSolicitacao: 'equipamento',
        tipoDeAtivoDoEquipamento: notebook,
      })
      .returning({ id: tiposDeChamado.id });
    equipamentoNovo = novo?.id ?? '';
  });
  // A Troca de equipamento gera o Equipamento de Notebook, com o campo Ativo obrigatório.
  await mudarTipo(c.tipos['Troca de equipamento'] ?? '', {
    geraSolicitacao: 'equipamento',
    tipoDeAtivoDoEquipamento: notebook,
  });
  // Bruno vê as solicitações da organização inteira e os chamados só de Campinas.
  const veAsSolicitacoes = await criarPerfil(api, c.org, {
    nome: 'Vê as solicitações',
    permissoes: ['solicitacoes.ver'],
  });
  await atribuir(api, c.org, { perfilId: veAsSolicitacoes, contaId: c.conta('bruno') });
  // Ana abre os chamados sem atender as solicitações: o registro é delegado pelo tipo.
  await c.entrar('ana', 'bruno', 'carla');
});

describe('a solicitação gerada pelo tipo na abertura', () => {
  it('Toner com a cor respondida: a solicitação nasce na abertura, registrada por Ana, que não atende as solicitações, com o chamado e o tipo na auditoria', async () => {
    const { r, numero } = await abrirChamado(doToner(c.pessoas.marina, ids.pat139, 'ciano'));
    expect(numero).toBe(1042);
    const gerada = await solicitacao(5);
    expect(gerada).toMatchObject({
      tipo: 'toner',
      situacao: 'aberta',
      pessoaId: c.pessoas.marina,
      registradaPor: c.conta('ana'),
      registradaEm: ABERTURA,
      locais: [c.locais.recepcao],
      semLocal: false,
      impressoras: [ids.pat139],
      // O ciano respondido, e não o preto, que está mais baixo na leitura.
      itens: [{ impressoraId: ids.pat139, cor: 'ciano', quantidade: 1 }],
    });
    expect((await c.lerChamado(1042)).solicitacaoId).toBe(gerada.id);
    expect((await c.conversaDo(1042)).map(({ evento }) => evento)).toEqual([
      'abertura',
      'solicitacao',
    ]);
    expect(await eventosDaConversa(1042)).toEqual([
      { evento: 'solicitacao', dados: { numero: 5, como: 'gerou' }, autorConta: c.conta('ana') },
    ]);
    const auditados = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditados.map(({ acao }) => acao)).toEqual(['solicitacao.registrada', 'chamado.aberto']);
    const [registrada, aberto] = auditados;
    expect(registrada).toMatchObject({ atorContaId: c.conta('ana'), alvoId: gerada.id });
    expect(registrada?.depois).toMatchObject({
      numero: 5,
      chamado: 1042,
      tipoDeChamado: 'Toner',
    });
    expect(aberto?.depois).toMatchObject({ numero: 1042, solicitacao: 5 });
    // O módulo Operação ficou com a solicitação: o evento dela vai a quem vê as solicitações.
    expect(await c.eventosDoAlvo(gerada.id)).toEqual([
      { tipo: 'solicitacoes.mudaram', permissao: 'solicitacoes.ver', locais: [c.locais.recepcao] },
    ]);
  });

  it('Toner gerado com uma solicitação pendente: o chamado se junta a ela, sem solicitação nova', async () => {
    const { r, numero } = await abrirChamado(doToner(c.pessoas.otavio, ids.pat139));
    expect(numero).toBe(1043);
    expect(await ultimaSolicitacao()).toBe(5);
    const pendente = await solicitacao(5);
    expect((await c.lerChamado(1043)).solicitacaoId).toBe(pendente.id);
    expect(await eventosDaConversa(1043)).toEqual([
      { evento: 'solicitacao', dados: { numero: 5, como: 'juntou' }, autorConta: c.conta('ana') },
    ]);
    const auditados = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditados.map(({ acao }) => acao)).toEqual(['chamado.aberto']);
    expect(auditados[0]?.depois).toMatchObject({ numero: 1043, solicitacao: 5 });
    // A solicitação ganhou um chamado: o evento vai também a quem a vê.
    expect(await c.eventosDoAlvo(pendente.id)).toEqual([
      { tipo: 'solicitacoes.mudaram', permissao: 'solicitacoes.ver', locais: [c.locais.recepcao] },
      { tipo: 'solicitacoes.mudaram', permissao: 'solicitacoes.ver', locais: [c.locais.recepcao] },
    ]);
  });

  it('Equipamento gerado pelo tipo: o local de trabalho da pessoa ou, sem ele, o do ativo ligado', async () => {
    const { r, numero } = await abrirChamado(doEquipamento(marinaLopes));
    expect(numero).toBe(1044);
    const gerada = await solicitacao(6);
    expect(gerada).toMatchObject({
      tipo: 'equipamento',
      situacao: 'aberta',
      pessoaId: marinaLopes,
      tipoDeAtivoId: notebook,
      quantidade: 1,
      motivo: 'Chamado #1044: Equipamento novo para Marina',
      localId: financeiro,
      locais: [financeiro],
      observacao: null,
      registradaPor: c.conta('ana'),
    });
    expect((await c.lerChamado(1044)).solicitacaoId).toBe(gerada.id);
    expect(await eventosDaConversa(1044)).toEqual([
      { evento: 'solicitacao', dados: { numero: 6, como: 'gerou' }, autorConta: c.conta('ana') },
    ]);
    const registrada = (await auditoriaDaRequisicao(api, c.org, r)).find(
      ({ acao }) => acao === 'solicitacao.registrada',
    );
    expect(registrada?.depois).toMatchObject({
      tipoDeAtivo: 'Notebook',
      chamado: 1044,
      tipoDeChamado: 'Equipamento novo',
    });

    // Rita não tem local de trabalho: vale o da PAT-00140, ligada pela Troca de equipamento.
    const troca = await abrirChamado({
      pessoa: c.pessoas.rita,
      tipo: c.tipos['Troca de equipamento'],
      respostas: { equipamento: ids.pat140, motivo: 'A tela quebrou.' },
      ficaComigo: true,
    });
    const { titulo } = await c.lerChamado(troca.numero);
    expect(await solicitacao(7)).toMatchObject({
      tipo: 'equipamento',
      pessoaId: c.pessoas.rita,
      localId: c.locais.recepcao,
      motivo: `Chamado #${troca.numero}: ${titulo}`,
    });

    // Marina Lopes tem local de trabalho: vale o dela, e não o da PAT-00140, da Recepção.
    await abrirChamado({
      pessoa: marinaLopes,
      tipo: c.tipos['Troca de equipamento'],
      respostas: { equipamento: ids.pat140, motivo: 'O teclado falha.' },
      ficaComigo: true,
    });
    expect(await solicitacao(8)).toMatchObject({
      tipo: 'equipamento',
      pessoaId: marinaLopes,
      localId: financeiro,
      locais: [financeiro],
    });
  });

  it('Solicitação recusada na abertura: o chamado abre sem ela, e a conversa diz o motivo', async () => {
    // Sem local para o equipamento: Rita, sem local, e o "Equipamento novo", sem o ativo.
    semLocal = await abreSemASolicitacao(
      doEquipamento(c.pessoas.rita, 'Equipamento novo para Rita'),
      'Rita Moraes não tem local de trabalho.',
      // Sem o nome, que a ficha escreve com o de agora.
      { semLocal: true },
    );
    // A impressora que não usa consumíveis, com a frase do registro.
    await abreSemASolicitacao(
      doToner(c.pessoas.marina, ids.mon001),
      'MON-00001 não usa consumíveis.',
    );

    // O tipo de ativo e o local inativados depois de o tipo ser gravado.
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx.update(tiposDeAtivo).set({ situacao: 'inativo' }).where(eq(tiposDeAtivo.id, notebook)),
    );
    try {
      await abreSemASolicitacao(
        doEquipamento(marinaLopes),
        'o tipo de ativo Notebook está inativo.',
      );
    } finally {
      await naOrganizacao(api.banco, c.org, (tx) =>
        tx.update(tiposDeAtivo).set({ situacao: 'ativo' }).where(eq(tiposDeAtivo.id, notebook)),
      );
    }
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx.update(locais).set({ situacao: 'inativo' }).where(eq(locais.id, financeiro)),
    );
    try {
      await abreSemASolicitacao(doEquipamento(marinaLopes), 'o local Financeiro está inativo.');
    } finally {
      await naOrganizacao(api.banco, c.org, (tx) =>
        tx.update(locais).set({ situacao: 'ativo' }).where(eq(locais.id, financeiro)),
      );
    }
  });

  it('com a pendente, a impressora que deixou de usar consumíveis não se junta a ela, como no "Pedir toner"', async () => {
    const gerou = await abrirChamado(doToner(c.pessoas.marina, ids.pat500));
    expect(await eventosDaConversa(gerou.numero)).toEqual([
      expect.objectContaining({
        evento: 'solicitacao',
        dados: expect.objectContaining({ como: 'gerou' }),
      }),
    ]);
    // O tipo da PAT-00500 deixa de ligar os consumíveis, com a solicitação dela pendente.
    const [daSemColeta] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select({ tipoId: ativos.tipoId }).from(ativos).where(eq(ativos.id, ids.pat500)),
    );
    const capacidades = (capacidadesDoTipo: string[]) =>
      naOrganizacao(api.banco, c.org, (tx) =>
        tx
          .update(tiposDeAtivo)
          .set({ capacidades: capacidadesDoTipo })
          .where(eq(tiposDeAtivo.id, daSemColeta?.tipoId ?? '')),
      );
    await capacidades([]);
    try {
      await abreSemASolicitacao(
        doToner(c.pessoas.otavio, ids.pat500),
        'PAT-00500 não usa consumíveis.',
      );
    } finally {
      await capacidades(['consumiveis.compatibilidade']);
    }
  });

  it('o Toner sem o ativo ligado e o módulo Operação desligado não geram, e o chamado abre', async () => {
    // O campo da impressora deixado opcional, como a TI pode montar.
    const [toner] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select()
        .from(tiposDeChamado)
        .where(eq(tiposDeChamado.id, c.tipos.Toner ?? '')),
    );
    const formulario = toner?.formulario as { campos: { id: string; obrigatorio: boolean }[] };
    await mudarTipo(c.tipos.Toner ?? '', {
      formulario: {
        ...formulario,
        campos: formulario.campos.map((campo) =>
          campo.id === 'impressora' ? { ...campo, obrigatorio: false } : campo,
        ),
      },
    });
    try {
      await abreSemASolicitacao(
        doToner(c.pessoas.marina, null),
        'o chamado não tem um ativo ligado.',
      );
    } finally {
      await mudarTipo(c.tipos.Toner ?? '', { formulario: toner?.formulario ?? {} });
    }

    await desligarModulos(api, c.org, ['operacao']);
    try {
      await abreSemASolicitacao(
        doToner(c.pessoas.marina, ids.pat140),
        'o módulo Operação está desligado.',
      );
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });

  it('a abertura do Toner espera a trava da impressora e se junta à pendente registrada enquanto esperava', async () => {
    // Outra transação, com a trava da impressora, registra a solicitação 90 da PAT-00200 e a segura
    // até a abertura estar esperando a trava. Sem ela, a abertura não veria a 90 e registraria outra.
    let soltar = () => {};
    let presa = () => {};
    const travada = new Promise<void>((resolve) => {
      presa = resolve;
    });
    const registrando = naOrganizacao(api.banco, c.org, async (tx) => {
      await travar(tx, `toner:${ids.pat200}`);
      const [pendente] = await tx
        .insert(solicitacoes)
        .values({
          orgId: c.org,
          numero: 90,
          tipo: 'toner',
          situacao: 'aberta',
          pessoaId: c.pessoas.paulo,
          locais: [c.locais.administrativo],
          semLocal: false,
          registradaPor: c.conta('ana'),
          registradaEm: ABERTURA,
        })
        .returning({ id: solicitacoes.id });
      await tx.insert(impressorasDasSolicitacoes).values({
        orgId: c.org,
        solicitacaoId: pendente?.id ?? '',
        ativoId: ids.pat200,
        incluidaEm: ABERTURA,
      });
      presa();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await travada;
    let aberta: ReturnType<typeof abrir> | undefined;
    try {
      aberta = abrir(doToner(c.pessoas.fernanda, ids.pat200));
      await esperarNaTrava(api, 1);
    } finally {
      soltar();
      await registrando;
    }
    if (!aberta) throw new Error('A abertura não começou.');
    const r = await aberta;
    expect(r.statusCode, r.body).toBe(201);
    const { numero } = r.json() as { numero: number };
    await c.guardar(numero);
    expect(await eventosDaConversa(numero)).toEqual([
      { evento: 'solicitacao', dados: { numero: 90, como: 'juntou' }, autorConta: c.conta('ana') },
    ]);
  });
});

describe('os chamados na leitura da solicitação', () => {
  it('a solicitação mostra os chamados a quem a vê, com o abrir só para quem vê o chamado', async () => {
    const daAna = await c.cliente.consultar('/solicitacoes/5', c.como('ana'));
    expect(daAna.statusCode, daAna.body).toBe(200);
    expect(daAna.json().chamados).toEqual([
      { numero: 1042, abrir: true },
      { numero: 1043, abrir: true },
    ]);
    // Bruno vê as solicitações da organização inteira e os chamados só de Campinas.
    const deBruno = await c.cliente.consultar('/solicitacoes/5', c.como('bruno'));
    expect(deBruno.statusCode, deBruno.body).toBe(200);
    expect(deBruno.json().chamados).toEqual([
      { numero: 1042, abrir: false },
      { numero: 1043, abrir: false },
    ]);
    const lista = await c.cliente.consultar('/solicitacoes', c.como('ana'));
    expect(
      (lista.json().itens as { numero: number; chamados: unknown }[]).find(
        ({ numero }) => numero === 6,
      )?.chamados,
    ).toEqual([{ numero: 1044, abrir: true }]);
  });

  it('com o módulo Chamados desligado, a solicitação vem sem os chamados', async () => {
    await desligarModulos(api, c.org, ['chamados']);
    try {
      const r = await c.cliente.consultar('/solicitacoes/5', c.como('ana'));
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().chamados).toEqual([]);
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });
});

describe('a solicitação gerada na ficha do chamado', () => {
  it('a ficha lê os dois eventos a toda conta que vê o chamado, com o como e o motivo', async () => {
    // Carla vê os chamados, sem as solicitações.
    const gerou = await c.cliente.consultar('/chamados/1042', c.como('carla'));
    expect(gerou.statusCode, gerou.body).toBe(200);
    const eventosDa = (ficha: { conversa: { especie: string; evento?: string }[] }) =>
      ficha.conversa.filter((item) => item.especie === 'evento');
    expect(eventosDa(gerou.json())).toEqual([
      expect.objectContaining({ evento: 'abertura', solicitacao: null, motivo: null }),
      expect.objectContaining({
        evento: 'solicitacao',
        autor: { tipo: 'conta', id: c.conta('ana'), nome: 'Ana Souza' },
        solicitacao: { numero: 5, como: 'gerou' },
        motivo: null,
      }),
    ]);
    const naoGerou = await c.cliente.consultar(`/chamados/${semLocal}`, c.como('carla'));
    expect(naoGerou.statusCode, naoGerou.body).toBe(200);
    expect(eventosDa(naoGerou.json())).toEqual([
      expect.objectContaining({ evento: 'abertura', motivo: null }),
      expect.objectContaining({
        evento: 'solicitacao-nao-gerada',
        solicitacao: null,
        motivo: 'Rita Moraes não tem local de trabalho.',
      }),
    ]);

    // O nome é uma referência à pessoa: anonimizada, o motivo vem com o nome anonimizado.
    await c.entrar('livia');
    for (const passo of ['inativacao', 'anonimizacao']) {
      const r = await c.cliente.enviar(
        'POST',
        `/pessoas/${c.pessoas.rita}/${passo}`,
        c.como('livia'),
      );
      expect(r.statusCode, r.body).toBe(200);
    }
    const [rita] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select({ nome: pessoas.nome }).from(pessoas).where(eq(pessoas.id, c.pessoas.rita)),
    );
    expect(rita?.nome).toMatch(/^Pessoa anonimizada /);
    const anonimizada = await c.cliente.consultar(`/chamados/${semLocal}`, c.como('carla'));
    expect(eventosDa(anonimizada.json())).toContainEqual(
      expect.objectContaining({
        evento: 'solicitacao-nao-gerada',
        motivo: `${rita?.nome} não tem local de trabalho.`,
      }),
    );
  });
});
