// O resumo do ativo ligado na ficha do chamado (spec chamados, "Ativo ligado e campos da TI"; change
// chamados-da-ti, design, decisão 5, "O resumo na ficha (tarefa 4.25)"): a quem vê o chamado, com o
// Ativos ligado, a disponibilidade e os suprimentos como a ficha do ativo os dá, com o restrito só a
// quem vê os restritos no local do ativo, a média de páginas por mês dos agregados dos últimos 90
// dias, o "Toner crítico" pelo alerta aberto a quem vê os alertas, as OS do ativo a quem as vê, os
// compatíveis com o saldo, o mínimo e o "abaixo" a quem vê o estoque, e a solicitação de Toner
// pendente a quem a vê; com o Operação desligado, as três últimas ficam de fora, e com o Alertas, o
// selo.
import { campos, leiturasPorHora, naOrganizacao, ordensDeServico, solicitacoes } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  criarAlerta,
  criarAtivoDoTipo,
  criarColetor,
  criarModelo,
  criarRegra,
  criarTipo,
  desligarModulos,
  gravarEstado,
} from '../../test/alertas.ts';
import {
  type ChamadosDeTeste,
  montarChamados,
  montarImpressorasDoToner,
} from '../../test/chamados.ts';
import { definirSaldo } from '../../test/estoque.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarPerfil,
  criarRelogio,
  type Entrada,
} from '../../test/integracao.ts';
import { criarCompativel } from '../../test/solicitacoes.ts';

const host = 'grafite.chamados-resumo.local';
/** A terça-feira, 17 de novembro de 2026, às 07:40 em São Paulo. */
const AGORA = new Date('2026-11-17T10:40:00.000Z');
const DIA = 24 * 60 * 60 * 1000;
const IP_LONGE = '192.168.77.5';

let api: ApiDeTeste;
let c: ChamadosDeTeste;
let ids: Awaited<ReturnType<typeof montarImpressorasDoToner>>;
/** A impressora de rede, com o IP restrito que nenhum coletor alcança. */
let pat700 = '';
/**
 * Olga vê os chamados da organização inteira, e o estoque, as OS, as solicitações, os alertas e os
 * restritos só em Campinas.
 */
let olga: Entrada;

const numeros = {
  /** O da PAT-00139, com o "Pedir toner". */
  pediu: 0,
  /** Outro da PAT-00139, sem a solicitação ligada. */
  outro: 0,
  pat700: 0,
  pat140: 0,
  pat200: 0,
  monitor: 0,
};

type Usuario = Parameters<ChamadosDeTeste['como']>[0];

/** A ficha do chamado, como o usuário. */
async function ficha(numero: number, usuario: Usuario | Entrada = 'livia') {
  const r = await c.cliente.consultar(
    `/chamados/${numero}`,
    typeof usuario === 'string' ? c.como(usuario) : usuario,
  );
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}

/** O resumo do ativo ligado na ficha do chamado. */
const resumo = async (numero: number, usuario: Usuario | Entrada = 'livia') =>
  (await ficha(numero, usuario)).ativo?.resumo;

/** A ficha do ativo, como Lívia, que vê tudo. */
async function fichaDoAtivo(ativoId: string) {
  const r = await c.cliente.consultar(`/ativos/${ativoId}`, c.como('livia'));
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}

/** O chamado de Impressora da pessoa, com o ativo ligado, com Ana. */
const daImpressora = (pessoa: keyof ChamadosDeTeste['pessoas'], ativo: string) => ({
  pessoa: c.pessoas[pessoa],
  tipo: c.tipos.Impressora,
  respostas: { impressora: ativo, problema: 'nao-imprime' },
  ficaComigo: true,
});

/** Um agregado por hora do contador, com o último valor válido no momento dado. */
const agregado = (ativoId: string, item: string, momento: Date, ultimo: number | null) => ({
  orgId: c.org,
  ativoId,
  metrica: 'impressora.contador',
  item,
  hora: new Date(Math.floor(momento.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000),
  leituras: 1,
  validas: ultimo === null ? 0 : 1,
  minimo: ultimo,
  maximo: ultimo,
  media: ultimo,
  ultimo,
  ultimoMomento: ultimo === null ? null : momento,
});

let ordem = 900;
/** Uma OS do ativo, direto no banco, com a situação e os momentos dados. */
const os = (
  ativoId: string,
  situacao: 'em-atendimento' | 'resolvida' | 'encerrada',
  {
    abertaEm,
    resolvidaEm = null,
    encerradaEm = null,
  }: { abertaEm: string; resolvidaEm?: string | null; encerradaEm?: string | null },
) => {
  const ana = c.conta('ana');
  return {
    orgId: c.org,
    numero: ++ordem,
    ativoId,
    localId: c.locais.recepcao,
    problema: 'Não imprime',
    situacao,
    abertaPor: ana,
    abertaEm: new Date(abertaEm),
    resolvidaPor: resolvidaEm ? ana : null,
    resolvidaEm: resolvidaEm ? new Date(resolvidaEm) : null,
    solucao: resolvidaEm ? 'Trocou o fusor.' : null,
    encerradaPor: encerradaEm ? ana : null,
    encerradaEm: encerradaEm ? new Date(encerradaEm) : null,
    motivoDoEncerramento: encerradaEm && !resolvidaEm ? 'Aberta em duplicidade.' : null,
  };
};

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(AGORA) });
  c = await montarChamados(api, host);
  ids = await montarImpressorasDoToner(api, c, AGORA);
  await c.entrar();

  // A impressora de rede, de um tipo com a disponibilidade e os suprimentos pelo IP restrito.
  const [ip] = await naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .insert(campos)
      .values({ orgId: c.org, rotulo: 'IP', rotuloNormalizado: 'ip', tipo: 'ip', restrito: true })
      .returning({ id: campos.id }),
  );
  const campoDoIp = ip?.id ?? '';
  const deRede = await criarTipo(api, c.org, {
    nome: 'Impressora de rede',
    capacidades: ['rede.disponibilidade', 'snmp.suprimentos', 'consumiveis.compatibilidade'],
    configuracao: {
      'rede.disponibilidade': { campoDoIp },
      'snmp.suprimentos': { campoDoIp, versao: '1', segredoId: null },
    },
  });
  const mono = await criarModelo(api, c.org, { tipoId: deRede, nome: 'LaserJet M404' });
  await criarCompativel(api, c.org, { codigo: 'CF258A', cor: 'preto', modeloId: mono });
  pat700 = await criarAtivoDoTipo(api, c.org, {
    tipoId: deRede,
    modeloId: mono,
    patrimonio: 'PAT-00700',
    localId: c.locais.recepcao,
    valores: { [campoDoIp]: IP_LONGE },
  });

  // O contador: 12.500 agora e 10.600 há 30 dias na PAT-00139, com uma hora sem valor e as leituras
  // de fora dos 90 dias e de outro item, que não contam; 9.000 agora e 8.000 há 3 dias na PAT-00140.
  const coletorId = await criarColetor(api, c.org);
  const contador = (ativoId: string, item: string, paginas: number) =>
    gravarEstado(api, c.org, {
      ativoId,
      coletorId,
      metrica: 'impressora.contador',
      item,
      momento: AGORA,
      valorNumero: paginas,
    });
  await contador(ids.pat139, '1', 12500);
  await contador(ids.pat139, '2', 400);
  await contador(ids.pat140, '1', 9000);
  const antes = (dias: number) => new Date(AGORA.getTime() - dias * DIA);
  await naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .insert(leiturasPorHora)
      .values([
        agregado(ids.pat139, '1', antes(100), 1000),
        agregado(ids.pat139, '1', antes(80), null),
        agregado(ids.pat139, '2', antes(60), 50),
        agregado(ids.pat139, '1', antes(30), 10600),
        agregado(ids.pat139, '1', antes(10), 11900),
        agregado(ids.pat140, '1', antes(3), 8000),
      ]),
  );

  // As OS da PAT-00139: uma em aberto desde o ano passado, uma resolvida e uma encerrada sem
  // resolver neste ano; uma resolvida às 23:00 do 31 de dezembro em São Paulo, já 1º de janeiro em
  // UTC, e uma resolvida no ano passado e encerrada neste, que são do ano passado; e a em aberto da
  // PAT-00140, que é de outro ativo.
  await naOrganizacao(api.banco, c.org, (tx) =>
    tx.insert(ordensDeServico).values([
      os(ids.pat139, 'em-atendimento', { abertaEm: '2025-12-15T13:00:00Z' }),
      os(ids.pat139, 'resolvida', {
        abertaEm: '2026-03-09T13:00:00Z',
        resolvidaEm: '2026-03-10T15:00:00Z',
      }),
      os(ids.pat139, 'encerrada', {
        abertaEm: '2026-05-30T13:00:00Z',
        encerradaEm: '2026-06-01T15:00:00Z',
      }),
      os(ids.pat139, 'resolvida', {
        abertaEm: '2025-12-30T13:00:00Z',
        resolvidaEm: '2026-01-01T02:00:00Z',
      }),
      os(ids.pat139, 'encerrada', {
        abertaEm: '2025-12-18T13:00:00Z',
        resolvidaEm: '2025-12-20T15:00:00Z',
        encerradaEm: '2026-01-05T15:00:00Z',
      }),
      os(ids.pat140, 'em-atendimento', { abertaEm: '2026-11-10T13:00:00Z' }),
    ]),
  );

  // O estoque do preto das coloridas: 3 de 6 na Recepção, de Jundiaí, abaixo do mínimo, e 10 de 1
  // no Administrativo, de Campinas; a soma, 13 de 7, não fica abaixo.
  await definirSaldo(api, c.org, {
    consumivelId: ids.pretoDaColorida,
    localId: c.locais.recepcao,
    saldo: 3,
    minimo: 6,
    abaixoDesde: AGORA,
  });
  await definirSaldo(api, c.org, {
    consumivelId: ids.pretoDaColorida,
    localId: c.locais.administrativo,
    saldo: 10,
    minimo: 1,
  });

  // Os alertas: o do toner, Crítico, aberto na PAT-00139; na PAT-00140, o do toner resolvido, o do
  // toner aberto na Atenção e o de offline aberto, Crítico; na PAT-00200, o do toner ainda pendente.
  const regra = (nome: string, condicao: 'toner.nivel' | 'rede.offline') =>
    criarRegra(api, c.org, {
      nome,
      condicao,
      parametros: condicao === 'toner.nivel' ? { limite: 10, folga: 5 } : {},
      duracao: 0,
      severidade: 'critico',
      escopo: { tipo: 'organizacao', id: null },
      excecoes: [],
    } as Parameters<typeof criarRegra>[2]);
  const doToner = await regra('Toner em 10% ou menos', 'toner.nivel');
  const offline = await regra('Ativo offline', 'rede.offline');
  await criarAlerta(api, c.org, { regraId: doToner, ativoId: ids.pat139, item: '1' });
  await criarAlerta(api, c.org, {
    regraId: doToner,
    ativoId: ids.pat140,
    item: '1',
    situacao: 'resolvido',
    resolvidoEm: AGORA,
    comoTerminou: 'voltou-ao-normal',
  });
  await criarAlerta(api, c.org, {
    regraId: doToner,
    ativoId: ids.pat140,
    item: '2',
    severidade: 'atencao',
  });
  await criarAlerta(api, c.org, { regraId: offline, ativoId: ids.pat140, texto: 'Offline' });
  await criarAlerta(api, c.org, {
    regraId: doToner,
    ativoId: ids.pat200,
    item: '1',
    situacao: 'pendente',
    abertoEm: null,
  });

  const veAOperacao = await criarPerfil(api, c.org, {
    nome: 'Vê a operação',
    permissoes: [
      'estoque.ver',
      'ordens.ver',
      'solicitacoes.ver',
      'alertas.ver',
      'ativos.restritos',
    ],
  });
  const conta = await criarConta(api, c.org, { usuario: 'olga', nome: 'Olga Martins' });
  await atribuir(api, c.org, { perfilId: c.perfis.ve, contaId: conta.id });
  await atribuir(api, c.org, {
    perfilId: veAOperacao,
    contaId: conta.id,
    localId: c.locais.campinas,
  });
  olga = await c.cliente.entrar('olga');

  numeros.pediu = await c.abrir(daImpressora('marina', ids.pat139));
  numeros.outro = await c.abrir(daImpressora('otavio', ids.pat139));
  numeros.pat700 = await c.abrir(daImpressora('marina', pat700));
  numeros.pat140 = await c.abrir(daImpressora('marina', ids.pat140));
  numeros.pat200 = await c.abrir(daImpressora('fernanda', ids.pat200));
  numeros.monitor = await c.abrir({
    pessoa: c.pessoas.marina,
    tipo: c.tipos.Outro,
    respostas: { relato: 'O monitor pisca.' },
    ficaComigo: true,
  });
  const comOMonitor = await c.cliente.enviar(
    'PUT',
    `/chamados/${numeros.monitor}/ativo`,
    c.como('ana'),
    { ativo: ids.mon001, versao: 1 },
  );
  expect(comOMonitor.statusCode, comOMonitor.body).toBe(200);
  const r = await c.cliente.enviar('POST', `/chamados/${numeros.pediu}/toner`, c.como('livia'), {
    registro: {
      tipo: 'toner',
      pessoa: c.pessoas.marina,
      observacao: null,
      impressoras: [ids.pat139],
      itens: [{ impressora: ids.pat139, cor: 'preto', quantidade: 1, consumivel: null }],
    },
  });
  expect(r.statusCode, r.body).toBe(201);
});

describe('o resumo do ativo na ficha do chamado', () => {
  it('Diego, sem ativos.ver, vê a disponibilidade e os suprimentos da ficha do ativo, sem as OS, o saldo e a solicitação', async () => {
    expect((await c.cliente.consultar(`/ativos/${ids.pat139}`, c.como('diego'))).statusCode).toBe(
      403,
    );
    const doAtivo = await fichaDoAtivo(ids.pat139);
    expect(doAtivo.painelDeSuprimentos.menor).toMatchObject({ nivel: 8, descricao: 'Black Toner' });
    expect(await resumo(numeros.pediu, 'diego')).toEqual({
      disponibilidade: doAtivo.disponibilidade,
      suprimentos: doAtivo.painelDeSuprimentos,
      paginasPorMes: 1900,
      tonerCritico: null,
      ordens: null,
      compativeis: null,
      solicitacao: null,
    });
  });

  it('o IP restrito no motivo só a quem vê os restritos no local do ativo', async () => {
    const deDiego = await resumo(numeros.pat700, 'diego');
    expect(deDiego.disponibilidade.motivo).toBe('Nenhum coletor alcança o IP do ativo.');
    expect(deDiego.suprimentos.motivo).toBe('Nenhum coletor alcança o IP do ativo.');
    // Olga vê os restritos em Campinas, e a PAT-00700 é da Recepção, de Jundiaí.
    const deOlga = await resumo(numeros.pat700, olga);
    expect(deOlga.disponibilidade.motivo).toBe('Nenhum coletor alcança o IP do ativo.');
    expect(deOlga.suprimentos.motivo).toBe('Nenhum coletor alcança o IP do ativo.');
    const deLivia = await resumo(numeros.pat700, 'livia');
    expect(deLivia.disponibilidade.motivo).toBe(`Nenhum coletor alcança o IP ${IP_LONGE}.`);
    expect(deLivia.suprimentos.motivo).toBe(`Nenhum coletor alcança o IP ${IP_LONGE}.`);
    const doAtivo = await fichaDoAtivo(pat700);
    expect(deLivia.disponibilidade).toEqual(doAtivo.disponibilidade);
    expect(deLivia.suprimentos).toEqual(doAtivo.painelDeSuprimentos);
  });

  it('a média de páginas por mês pede 7 dias de leituras, e o ativo sem coleta não tem os painéis', async () => {
    const pat140 = await resumo(numeros.pat140);
    expect(pat140.suprimentos.total).toMatchObject({ paginas: 9000 });
    expect(pat140.paginasPorMes).toBeNull();
    const pat200 = await resumo(numeros.pat200);
    expect(pat200.suprimentos.total).toBeNull();
    expect(pat200.paginasPorMes).toBeNull();
    // O tipo das coloridas não liga a disponibilidade.
    expect(pat200.disponibilidade).toBeNull();
    // O monitor é de um tipo sem as capacidades da coleta e dos compatíveis.
    expect(await resumo(numeros.monitor)).toEqual({
      disponibilidade: null,
      suprimentos: null,
      paginasPorMes: null,
      tonerCritico: false,
      ordens: { abertas: 0, concluidas: 0 },
      compativeis: null,
      solicitacao: null,
    });
  });

  it('o "Toner crítico" pelo alerta do toner aberto e Crítico, a quem vê os alertas no local do ativo', async () => {
    expect((await resumo(numeros.pediu, 'ana')).tonerCritico).toBe(true);
    expect((await resumo(numeros.pediu)).tonerCritico).toBe(true);
    // O do toner resolvido, o do toner na Atenção e o de offline, Crítico, não fazem o selo.
    expect((await resumo(numeros.pat140)).tonerCritico).toBe(false);
    // O do toner que ainda não abriu também não.
    expect((await resumo(numeros.pat200)).tonerCritico).toBe(false);
    // Diego não vê os alertas, e Olga só os vê em Campinas.
    expect((await resumo(numeros.pediu, 'diego')).tonerCritico).toBeNull();
    expect((await resumo(numeros.pediu, olga)).tonerCritico).toBeNull();
  });

  it('as OS do ativo em aberto e as concluídas no ano, no fuso da TI, a quem vê as OS no local dele', async () => {
    expect((await resumo(numeros.pediu, 'ana')).ordens).toEqual({ abertas: 1, concluidas: 2 });
    expect((await resumo(numeros.pat140, 'ana')).ordens).toEqual({ abertas: 1, concluidas: 0 });
    expect((await resumo(numeros.pediu, olga)).ordens).toBeNull();
    expect((await resumo(numeros.pediu, 'diego')).ordens).toBeNull();
  });

  it('os compatíveis com o saldo e o mínimo somados e o "abaixo" de algum local em que a conta vê o estoque', async () => {
    const doAtivo = await fichaDoAtivo(ids.pat139);
    const comOMinimo = (saldoDoPreto: number, minimoDoPreto: number, abaixo: boolean) =>
      doAtivo.consumiveisCompativeis.map((compativel: { id: string; saldo: number }) =>
        compativel.id === ids.pretoDaColorida
          ? { ...compativel, saldo: saldoDoPreto, minimo: minimoDoPreto, abaixo }
          : { ...compativel, saldo: 0, minimo: 0, abaixo: false },
      );
    expect(doAtivo.consumiveisCompativeis).toHaveLength(4);
    // A soma, 13 de 7, não fica abaixo, e a Recepção, com 3 de 6, fica.
    expect((await resumo(numeros.pediu)).compativeis).toEqual(comOMinimo(13, 7, true));
    expect((await resumo(numeros.pediu, olga)).compativeis).toEqual(comOMinimo(10, 1, false));
    expect((await resumo(numeros.pediu, 'ana')).compativeis).toBeNull();
    // A PAT-00700, de outro modelo, com o CF258A sem estoque nenhum.
    expect((await resumo(numeros.pat700)).compativeis).toEqual([
      expect.objectContaining({ codigo: 'CF258A', saldo: 0, minimo: 0, abaixo: false }),
    ]);
  });

  it('a solicitação de Toner pendente da impressora, a que o "Pedir toner" juntaria, a quem a vê', async () => {
    const [pendente] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select({
          id: solicitacoes.id,
          numero: solicitacoes.numero,
          situacao: solicitacoes.situacao,
        })
        .from(solicitacoes)
        .where(eq(solicitacoes.tipo, 'toner')),
    );
    expect(pendente).toBeDefined();
    expect((await resumo(numeros.pediu, 'ana')).solicitacao).toEqual(pendente);
    // O outro chamado da impressora não está ligado a ela, e o resumo a mostra do mesmo jeito.
    const doOutro = await ficha(numeros.outro, 'ana');
    expect(doOutro.solicitacao).toBeNull();
    expect(doOutro.ativo.resumo.solicitacao).toEqual(pendente);
    expect((await resumo(numeros.pediu, olga)).solicitacao).toBeNull();
    expect((await resumo(numeros.pediu, 'diego')).solicitacao).toBeNull();
    expect((await resumo(numeros.pat140, 'ana')).solicitacao).toBeNull();
  });

  it('com o Operação desligado, as OS, o saldo e a solicitação ficam de fora; com o Alertas, o selo; com o Ativos, o resumo', async () => {
    const ligado = await resumo(numeros.pediu);
    try {
      await desligarModulos(api, c.org, ['operacao']);
      expect(await resumo(numeros.pediu)).toEqual({
        ...ligado,
        ordens: null,
        compativeis: null,
        solicitacao: null,
      });
      await desligarModulos(api, c.org, ['alertas']);
      expect(await resumo(numeros.pediu)).toEqual({ ...ligado, tonerCritico: null });
      await desligarModulos(api, c.org, ['ativos']);
      const semAtivos = await ficha(numeros.pediu);
      expect(semAtivos.ativo).toMatchObject({ id: ids.pat139, resumo: null });
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });
});
