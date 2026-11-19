// Virar OS (spec chamados, "OS e solicitação pelo chamado"; ordens-de-servico, "OS pelo chamado";
// change chamados-da-ti, design, "Virar OS (tarefa 4.16)", "O chamado na leitura da OS" e "A troca
// do ativo depois da OS"): a rota, com a abertura das OS de hoje na mesma transação, o evento da
// conversa, que não sobe a versão, a auditoria, o chamado na leitura da OS e na ficha, e as recusas;
// e os campos da OS no pedido (design, "O Virar OS com os campos da OS (tarefa 5.31)"): o outro
// ativo, que decide a permissão no local dele, e a situação em que a OS nasce, com o fornecedor.
// A ordem das recusas do chamado é do domínio (`chamados/os-e-solicitacao.test.ts`); aqui fica um
// caso de cada ligação.
import { naOrganizacao, numeracaoDasOrdens, ordensDeServico, tiposDeChamado } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarAtivoDoTipo, criarModelo, criarTipo, desligarModulos } from '../../test/alertas.ts';
import {
  type ChamadosDeTeste,
  montarChamados,
  type UsuarioDosChamados,
} from '../../test/chamados.ts';
import { criarFornecedor } from '../../test/estoque.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  criarPerfil,
  criarRelogio,
} from '../../test/integracao.ts';

const host = 'grafite.chamados-os.local';
/** A terça-feira, 17 de novembro de 2026, às 07:40 em São Paulo: a abertura dos chamados. */
const ABERTURA = new Date('2026-11-17T10:40:00.000Z');
const HORA = 60 * 60 * 1000;
const CONFLITO = 'urn:grafite:problema:conflito';

let api: ApiDeTeste;
let c: ChamadosDeTeste;
/** As impressoras: a da Recepção, em Jundiaí, e a do Administrativo, em Campinas. */
const ids = { pat139: '', pat200: '' };

const virarOs = (numero: number, usuario: UsuarioDosChamados, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chamados/${numero}/os`, c.como(usuario), corpo);
const assumir = (numero: number, usuario: UsuarioDosChamados, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chamados/${numero}/assumir`, c.como(usuario), corpo);

/** O chamado de Impressora da pessoa, com a impressora como o ativo ligado. */
const daImpressora = (
  pessoa: keyof ChamadosDeTeste['pessoas'],
  impressora: string,
  ficaComigo = true,
) => ({
  pessoa: c.pessoas[pessoa],
  tipo: c.tipos.Impressora,
  respostas: { impressora, problema: 'nao-imprime' },
  ficaComigo,
});

/** A OS pelo número, como o banco a guarda. */
const ordem = async (numero: number) => {
  const [linha] = await naOrganizacao(api.banco, c.org, (tx) =>
    tx.select().from(ordensDeServico).where(eq(ordensDeServico.numero, numero)),
  );
  return linha;
};

/** O último número de OS da organização, que a abertura desfeita não gasta. */
const ultimaOs = async () => {
  const [linha] = await naOrganizacao(api.banco, c.org, (tx) =>
    tx.select({ ultimo: numeracaoDasOrdens.ultimo }).from(numeracaoDasOrdens),
  );
  return linha?.ultimo;
};

/** A recusa sem mudança: nem a OS, nem a conversa, nem a versão, nem os eventos. */
async function nadaMudou(numero: number, recusado: () => Promise<unknown>) {
  const antes = {
    chamado: await c.lerChamado(numero),
    conversa: await c.conversaDo(numero),
    eventos: await c.eventosDo(numero),
  };
  await recusado();
  expect(await c.lerChamado(numero)).toEqual(antes.chamado);
  expect(await c.conversaDo(numero)).toEqual(antes.conversa);
  expect(await c.eventosDo(numero)).toEqual(antes.eventos);
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  c = await montarChamados(api, host);
  // Os números do mockup: a primeira OS aberta aqui é a 13.
  await naOrganizacao(api.banco, c.org, (tx) =>
    tx.insert(numeracaoDasOrdens).values({ orgId: c.org, ultimo: 12 }),
  );
  // Ana atende as OS da organização inteira; Diego, as de Jundiaí, onde vê os ativos; Elisa vê os
  // ativos de Campinas, sem atender as OS; Carla, que vê os chamados da organização inteira, atende
  // os de Jundiaí; Bruno vê as OS da organização inteira e os chamados só de Campinas.
  const atendeAsOs = await criarPerfil(api, c.org, {
    nome: 'Atende as OS',
    permissoes: ['ordens.atender', 'ativos.ver'],
  });
  await atribuir(api, c.org, { perfilId: atendeAsOs, contaId: c.conta('ana') });
  await atribuir(api, c.org, {
    perfilId: atendeAsOs,
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
  const veAsOs = await criarPerfil(api, c.org, { nome: 'Vê as OS', permissoes: ['ordens.ver'] });
  await atribuir(api, c.org, { perfilId: veAsOs, contaId: c.conta('bruno') });

  const tipoId = await criarTipo(api, c.org, { nome: 'Impressora' });
  const modeloId = await criarModelo(api, c.org, {
    tipoId,
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });
  const impressora = (patrimonio: string, localId: string) =>
    criarAtivoDoTipo(api, c.org, { tipoId, modeloId, patrimonio, localId, situacao: 'ativo' });
  ids.pat139 = await impressora('PAT-00139', c.locais.recepcao);
  ids.pat200 = await impressora('PAT-00200', c.locais.administrativo);

  await c.entrar('ana');
  // #1042: a Impressora PAT-00139 de Marina, da Recepção, com Ana.
  await c.abrir(daImpressora('marina', ids.pat139));
  // #1043: a mesma impressora, na triagem.
  await c.abrir(daImpressora('marina', ids.pat139, false));
  // #1044: o Outro de Marina, sem ativo.
  await c.abrir(c.relato('marina'));
  // #1045: a mesma impressora, resolvida.
  await c.abrir(daImpressora('marina', ids.pat139));
  const resolvido = await c.cliente.enviar('POST', '/chamados/1045/resolver', c.como('ana'), {
    feito: 'Troquei o cabo.',
  });
  expect(resolvido.statusCode, resolvido.body).toBe(200);
  // #1046: a Impressora PAT-00200 de Fernanda, do Administrativo, em Campinas.
  await c.abrir(daImpressora('fernanda', ids.pat200));
  // #1047 e #1048: a impressora da Recepção, de novo.
  await c.abrir(daImpressora('marina', ids.pat139));
  await c.abrir(daImpressora('marina', ids.pat139));
  // As sessões entram uma hora depois da abertura.
  api.relogio.avancar(HORA);
  await c.entrar();
});

describe('POST /chamados/:numero/os', () => {
  it('Impressora vira OS: a OS nasce Aberta no ativo, ligada ao chamado, que continua como estava', async () => {
    const antes = await c.lerChamado(1042);
    const eventos = await c.eventosDo(1042);
    const avisos = await c.notificacoesDo(1042);
    const agora = api.relogio.agora();
    const r = await virarOs(1042, 'diego', { problema: 'Impressora manchando' });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      numero: 13,
      situacao: 'aberta',
      ativo: { id: ids.pat139, patrimonio: 'PAT-00139' },
      local: { id: c.locais.recepcao },
      problema: 'Impressora manchando',
      abertaPor: { id: c.conta('diego'), nome: 'Diego Ramos' },
      chamado: { numero: 1042, abrir: true },
    });
    const os = await ordem(13);
    // A situação, quem atende, os locais e a versão não mudam.
    expect(await c.lerChamado(1042)).toEqual({ ...antes, osId: os?.id });
    expect((await c.conversaDo(1042)).at(-1)).toMatchObject({
      especie: 'evento',
      evento: 'os',
      autorConta: c.conta('diego'),
      texto: null,
      dados: { numero: 13 },
      criadaEm: agora,
    });
    const auditados = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditados.map(({ acao }) => acao).sort()).toEqual(['chamado.virou-os', 'ordem.aberta']);
    const virou = auditados.find(({ acao }) => acao === 'chamado.virou-os');
    expect(virou).toMatchObject({ atorContaId: c.conta('diego'), alvoId: c.chamadoId(1042) });
    expect(virou?.depois).toEqual({ os: 13 });
    // O chamado vai a quem vê os locais dele, e a OS, pela auditoria dela, a quem vê as OS.
    expect(await c.eventosDo(1042)).toEqual([
      ...eventos,
      {
        tipo: 'chamados.mudaram',
        alvoTipo: 'chamado',
        permissao: 'chamados.ver',
        locais: [c.locais.recepcao],
      },
    ]);
    expect(await c.notificacoesDo(1042)).toEqual(avisos);
  });

  it('Segunda OS do chamado: recusada, com a OS que ele já tem', async () => {
    await nadaMudou(1042, async () => {
      const r = await virarOs(1042, 'ana');
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json()).toMatchObject({
        type: CONFLITO,
        detail: 'O chamado #1042 já tem a OS 13.',
      });
    });
  });

  it('sem o problema, a OS leva o título do chamado; o problema em branco é recusado pela OS', async () => {
    const { titulo } = await c.lerChamado(1047);
    await nadaMudou(1047, async () => {
      const r = await virarOs(1047, 'ana', { problema: '   ' });
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual({ problema: 'Descreva o problema.' });
    });
    const r = await virarOs(1047, 'ana');
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ problema: titulo, chamado: { numero: 1047 } });
  });

  it('o tipo que não vira OS, pelo tipo como está agora, e o chamado sem o ativo', async () => {
    await nadaMudou(1044, async () => {
      const r = await virarOs(1044, 'ana');
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().detail).toBe('O tipo Outro não vira OS.');
    });
    // O Outro, que não virava OS na abertura do #1044, passa a virar.
    const outro = c.tipos.Outro ?? '';
    const mudarOutro = (podeVirarOs: boolean) =>
      naOrganizacao(api.banco, c.org, (tx) =>
        tx.update(tiposDeChamado).set({ podeVirarOs }).where(eq(tiposDeChamado.id, outro)),
      );
    await mudarOutro(true);
    try {
      await nadaMudou(1044, async () => {
        const r = await virarOs(1044, 'ana');
        expect(r.statusCode, r.body).toBe(409);
        expect(r.json().detail).toBe('O chamado #1044 não tem um ativo ligado.');
      });
    } finally {
      await mudarOutro(false);
    }
  });

  it('o chamado resolvido e quem não atende os locais dele são recusados no 409', async () => {
    await nadaMudou(1045, async () => {
      const r = await virarOs(1045, 'ana');
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().detail).toBe('O chamado #1045 está resolvido.');
    });
    // Carla vê o #1046, de Campinas, e atende só os de Jundiaí.
    await nadaMudou(1046, async () => {
      const r = await virarOs(1046, 'carla');
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json().detail).toBe('Você não atende os chamados de Campinas › Administrativo.');
    });
  });

  it('a OS pede o que pede hoje: quem não atende as OS no local do ativo recebe o 403, e quem só vê o chamado também', async () => {
    // Elisa atende os chamados de Campinas e vê os ativos de lá, sem atender as OS.
    await nadaMudou(1046, async () => {
      const r = await virarOs(1046, 'elisa');
      expect(r.statusCode, r.body).toBe(403);
    });
    // Bruno só vê os chamados de Campinas.
    await nadaMudou(1046, async () => {
      const r = await virarOs(1046, 'bruno');
      expect(r.statusCode, r.body).toBe(403);
    });
  });

  it('com o módulo Operação desligado, o 403 do módulo, antes das recusas do chamado', async () => {
    await desligarModulos(api, c.org, ['operacao']);
    try {
      for (const numero of [1048, 1045]) {
        await nadaMudou(numero, async () => {
          const r = await virarOs(numero, 'ana');
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

  it('Desfazer depois de virar OS: o assumir segue desfazível, e a OS fica', async () => {
    const assumido = await assumir(1043, 'ana');
    expect(assumido.statusCode, assumido.body).toBe(200);
    const r = await virarOs(1043, 'ana');
    expect(r.statusCode, r.body).toBe(201);
    const desfeito = await c.cliente.enviar('POST', '/chamados/1043/desfazer', c.como('ana'), {
      versao: assumido.json().versao,
    });
    expect(desfeito.statusCode, desfeito.body).toBe(200);
    expect(desfeito.json()).toMatchObject({ situacao: 'triagem', responsavel: null });
    expect((await c.lerChamado(1043)).osId).toBe(r.json().id);
  });

  it('Troca do ativo depois da OS: o chamado troca de ativo, e a OS fica no dela, ligada a ele', async () => {
    const r = await virarOs(1048, 'ana');
    expect(r.statusCode, r.body).toBe(201);
    const { versao } = await c.lerChamado(1048);
    const trocado = await c.cliente.enviar('PUT', '/chamados/1048/ativo', c.como('ana'), {
      ativo: ids.pat200,
      versao,
    });
    expect(trocado.statusCode, trocado.body).toBe(200);
    expect(await c.lerChamado(1048)).toMatchObject({ ativoId: ids.pat200, osId: r.json().id });
    expect(await ordem(r.json().numero)).toMatchObject({
      ativoId: ids.pat139,
      localId: c.locais.recepcao,
    });
  });
});

describe('o chamado na OS e a OS no chamado', () => {
  it('a OS mostra o chamado a quem a vê, com o abrir só para quem vê o chamado', async () => {
    const deAna = await c.cliente.consultar('/ordens/13', c.como('ana'));
    expect(deAna.statusCode, deAna.body).toBe(200);
    expect(deAna.json().chamado).toEqual({ numero: 1042, abrir: true });
    // Bruno vê as OS da organização inteira, e os chamados só de Campinas.
    const deBruno = await c.cliente.consultar('/ordens/13', c.como('bruno'));
    expect(deBruno.statusCode, deBruno.body).toBe(200);
    expect(deBruno.json().chamado).toEqual({ numero: 1042, abrir: false });
    // O #1046, de Campinas, Bruno vê sem atender.
    const deCampinas = await virarOs(1046, 'ana');
    expect(deCampinas.statusCode, deCampinas.body).toBe(201);
    const daOs = await c.cliente.consultar(`/ordens/${deCampinas.json().numero}`, c.como('bruno'));
    expect(daOs.statusCode, daOs.body).toBe(200);
    expect(daOs.json().chamado).toEqual({ numero: 1046, abrir: true });
    // A OS aberta fora de um chamado vem sem ele.
    const avulsa = await c.cliente.enviar('POST', '/ordens', c.como('ana'), {
      ativo: ids.pat139,
      problema: 'Revisão do fusor',
    });
    expect(avulsa.statusCode, avulsa.body).toBe(201);
    expect(avulsa.json().chamado).toBeNull();
  });

  it('com o módulo Chamados desligado, a OS não mostra o chamado', async () => {
    await desligarModulos(api, c.org, ['chamados']);
    try {
      const r = await c.cliente.consultar('/ordens/13', c.como('ana'));
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().chamado).toBeNull();
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });

  it('a ficha lê o evento da OS a toda conta que vê o chamado, e a OS ligada só a quem vê as OS', async () => {
    // Carla vê os chamados, sem as OS.
    const deCarla = await c.cliente.consultar('/chamados/1042', c.como('carla'));
    expect(deCarla.statusCode, deCarla.body).toBe(200);
    const [evento] = (deCarla.json().conversa as { evento?: string }[]).filter(
      (item) => item.evento === 'os',
    );
    expect(evento).toMatchObject({
      autor: { tipo: 'conta', id: c.conta('diego'), nome: 'Diego Ramos' },
      de: null,
      para: null,
      ativo: null,
      os: { numero: 13 },
    });
    expect(deCarla.json().os).toBeNull();
    const deAna = await c.cliente.consultar('/chamados/1042', c.como('ana'));
    expect(deAna.json().os).toMatchObject({ numero: 13, situacao: 'aberta' });
    // Os outros eventos vêm sem a OS.
    const outros = (deAna.json().conversa as { especie: string; evento?: string; os?: unknown }[])
      .filter((item) => item.especie === 'evento' && item.evento !== 'os')
      .map(({ os }) => os);
    expect(outros).toEqual([null]);
  });
});

describe('Virar OS com os campos da OS (tarefa 5.31)', () => {
  let tonerlab = '';

  beforeAll(async () => {
    tonerlab = await criarFornecedor(api, c.org, { nome: 'Tonerlab' });
    // Diego passa a ver os ativos de Campinas, sem atender as OS de lá.
    const veOsAtivos = await criarPerfil(api, c.org, {
      nome: 'Vê os ativos de Campinas',
      permissoes: ['ativos.ver'],
    });
    await atribuir(api, c.org, {
      perfilId: veOsAtivos,
      contaId: c.conta('diego'),
      localId: c.locais.campinas,
    });
    // #1049 a #1052: a impressora da Recepção, de Marina, com Ana.
    for (let vez = 0; vez < 4; vez += 1) await c.abrir(daImpressora('marina', ids.pat139));
  });

  it('OS que nasce no fornecedor: a Aberta e a Aguardando fornecedor no mesmo instante, a escolhida em cima, e a auditoria das duas', async () => {
    const agora = api.relogio.agora().toISOString();
    const r = await virarOs(1049, 'diego', {
      situacao: 'aguardando-fornecedor',
      fornecedor: tonerlab,
      os: ' A-778 ',
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      situacao: 'aguardando-fornecedor',
      ativo: { id: ids.pat139 },
      fornecedor: { id: tonerlab, nome: 'Tonerlab' },
      osDoFornecedor: 'A-778',
      chamado: { numero: 1049, abrir: true },
    });
    expect(r.json().historico).toMatchObject([
      { situacao: 'aguardando-fornecedor', fornecedor: { nome: 'Tonerlab' }, mudadaEm: agora },
      { situacao: 'aberta', fornecedor: null, mudadaEm: agora },
    ]);
    const auditados = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditados.map(({ acao }) => acao).sort()).toEqual([
      'chamado.virou-os',
      'ordem.aberta',
      'ordem.situacao',
    ]);
    expect(auditados.find(({ acao }) => acao === 'ordem.situacao')).toMatchObject({
      antes: { situacao: 'aberta' },
      depois: {
        situacao: 'aguardando-fornecedor',
        fornecedor: 'Tonerlab',
        osDoFornecedor: 'A-778',
      },
    });
    const ficha = await c.cliente.consultar('/chamados/1049', c.como('diego'));
    expect(ficha.statusCode, ficha.body).toBe(200);
    expect(ficha.json().os).toMatchObject({
      numero: r.json().numero,
      situacao: 'aguardando-fornecedor',
      ativo: { id: ids.pat139, patrimonio: 'PAT-00139' },
    });
  });

  it('a recusa da mudança da situação volta no campo dela, e nada fica gravado', async () => {
    const ultima = await ultimaOs();
    await nadaMudou(1050, async () => {
      const r = await virarOs(1050, 'ana', { situacao: 'aguardando-fornecedor', os: 'A-779' });
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual({ fornecedor: 'Escolha o fornecedor.' });
    });
    expect(await ultimaOs()).toBe(ultima);
  });

  it('OS noutro ativo: a OS nasce no ativo escolhido, Aberta, e o chamado fica com o dele e mostra o da OS', async () => {
    const r = await virarOs(1051, 'ana', { ativo: ids.pat200 });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      situacao: 'aberta',
      ativo: { id: ids.pat200, patrimonio: 'PAT-00200' },
      local: { id: c.locais.administrativo },
      chamado: { numero: 1051, abrir: true },
    });
    expect(r.json().historico).toHaveLength(1);
    expect(await c.lerChamado(1051)).toMatchObject({ ativoId: ids.pat139, osId: r.json().id });
    const ficha = await c.cliente.consultar('/chamados/1051', c.como('ana'));
    expect(ficha.json().os).toMatchObject({
      numero: r.json().numero,
      situacao: 'aberta',
      ativo: { id: ids.pat200, patrimonio: 'PAT-00200' },
    });
  });

  it('o outro ativo num local onde quem abre não atende as OS volta recusado no campo, e nada abre', async () => {
    const ultima = await ultimaOs();
    // Diego vê a PAT-00200, de Campinas, e atende as OS só de Jundiaí.
    await nadaMudou(1052, async () => {
      const r = await virarOs(1052, 'diego', { ativo: ids.pat200 });
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual({ ativo: 'Você não atende as OS no local deste ativo.' });
    });
    expect(await ultimaOs()).toBe(ultima);
  });
});
