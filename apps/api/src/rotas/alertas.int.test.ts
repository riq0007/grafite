// A lista dos alertas pela API (spec alertas, "Quem vê os alertas", e modulo-alertas, "Lista dos
// alertas abertos" e "Lista dos alertas resolvidos"; change p3a-regras-e-alertas, design, decisões 8
// e 10): os abertos na ordem de fábrica, com o total, o alvo, a regra e o que a conta pode tratar;
// o escopo de quem vê; os filtros; a ordem pelas colunas; o cursor; o "para resolver" sem os
// adiados nem os dos ativos silenciados; e os resolvidos, do mais recente.
import { naOrganizacao, silenciosDosAtivos } from '@grafite/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AlertasDeTeste,
  criarAlerta,
  criarAtivoDoTipo,
  criarColetor,
  criarRegra,
  criarTipo,
  montarAlertas,
  type UsuarioDosAlertas,
} from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';

const host = 'grafite.lista-de-alertas.local';
const ORGANIZACAO = { tipo: 'organizacao', id: null } as const;

let api: ApiDeTeste;
let alertas: AlertasDeTeste;
const ids: Record<string, string> = {};

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
  const { org } = alertas;
  const impressora = await criarTipo(api, org, {
    nome: 'Impressora',
    capacidades: ['snmp.suprimentos'],
  });
  ids.impressora = impressora;
  ids.doRh = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora do RH',
    patrimonio: 'PAT-00412',
    localId: alertas.jundiai,
  });
  ids.daExpedicao = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora da expedição',
    patrimonio: 'PAT-00413',
    localId: alertas.jundiai,
  });
  ids.deCampinas = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora de Campinas',
    patrimonio: 'PAT-00500',
    localId: alertas.campinas,
  });
  ids.coletor = await criarColetor(api, org, { nome: 'Coletor de Jundiaí' });
  ids.toner = await criarRegra(api, org, {
    nome: 'Toner em 10% ou menos',
    condicao: 'toner.nivel',
    parametros: { limite: 10, folga: 5 },
    duracao: 0,
    severidade: 'critico',
    escopo: ORGANIZACAO,
  });
  ids.papel = await criarRegra(api, org, {
    nome: 'Impressora pede atenção',
    condicao: 'impressora.condicao',
    parametros: { condicoes: ['pouco-papel'] },
    duracao: 0,
    severidade: 'atencao',
    escopo: ORGANIZACAO,
  });
  ids.semContato = await criarRegra(api, org, {
    nome: 'Coletor sem contato',
    condicao: 'coletor.sem-contato',
    parametros: { minutos: 10 },
    duracao: 0,
    severidade: 'critico',
    escopo: ORGANIZACAO,
  });
  // Os abertos: um de Atenção de 7 h, um de Atenção de 1 h e um Crítico de 32 min, em Jundiaí; um
  // de Campinas; e o do coletor.
  ids.atencaoAntigo = await criarAlerta(api, org, {
    regraId: ids.papel,
    ativoId: ids.doRh,
    item: 'pouco-papel',
    texto: 'Pouco papel',
    severidade: 'atencao',
    abertoHa: 7 * 60,
  });
  ids.atencaoNovo = await criarAlerta(api, org, {
    regraId: ids.papel,
    ativoId: ids.daExpedicao,
    item: 'pouco-papel',
    texto: 'Pouco papel',
    severidade: 'atencao',
    abertoHa: 60,
  });
  ids.critico = await criarAlerta(api, org, {
    regraId: ids.toner,
    ativoId: ids.doRh,
    item: '1',
    texto: 'Toner preto em 8%',
    abertoHa: 32,
  });
  ids.emCampinas = await criarAlerta(api, org, {
    regraId: ids.toner,
    ativoId: ids.deCampinas,
    item: '1',
    texto: 'Toner amarelo em 4%',
    abertoHa: 20,
  });
  ids.doColetor = await criarAlerta(api, org, {
    regraId: ids.semContato,
    coletorId: ids.coletor,
    texto: 'Coletor sem contato',
    abertoHa: 15,
  });
  // Fora da lista dos abertos: o pendente e o resolvido.
  await criarAlerta(api, org, {
    regraId: ids.toner,
    ativoId: ids.daExpedicao,
    item: '2',
    texto: 'Toner ciano em 9%',
    situacao: 'pendente',
    abertoEm: null,
  });
  ids.resolvido = await criarAlerta(api, org, {
    regraId: ids.toner,
    ativoId: ids.daExpedicao,
    item: '1',
    texto: 'Toner preto em 6%',
    abertoHa: 600,
    situacao: 'resolvido',
    resolvidoEm: new Date(api.relogio.agora().getTime() - 60 * 60_000),
    comoTerminou: 'voltou-ao-normal',
  });
});

afterAll(async () => {
  await api?.fechar();
});

const listar = (consulta = '', usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.consultar(`/alertas${consulta}`, alertas.como(usuario));

const idsDe = (resposta: { json: () => { itens: { id: string }[] } }) =>
  resposta.json().itens.map((alerta) => alerta.id);

describe('lista dos alertas', () => {
  it('traz os abertos na ordem de fábrica, com o total, o alvo, a regra e o que se pode fazer', async () => {
    const r = await listar();
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.total).toBe(5);
    expect(corpo.proximo).toBeNull();
    // Os críticos, do mais antigo; depois os de Atenção, do mais antigo.
    expect(corpo.itens.map((alerta: { id: string }) => alerta.id)).toEqual([
      ids.critico,
      ids.emCampinas,
      ids.doColetor,
      ids.atencaoAntigo,
      ids.atencaoNovo,
    ]);
    expect(corpo.itens[0]).toEqual({
      id: ids.critico,
      regra: { id: ids.toner, nome: 'Toner em 10% ou menos' },
      condicao: 'toner.nivel',
      severidade: 'critico',
      texto: 'Toner preto em 8%',
      situacao: 'aberto',
      alvo: {
        tipo: 'ativo',
        id: ids.doRh,
        nome: 'Impressora do RH',
        patrimonio: 'PAT-00412',
        tipoDoAtivo: { id: ids.impressora, nome: 'Impressora', icone: 'impressora' },
        imagem: null,
        modelo: null,
      },
      abertoEm: new Date(api.relogio.agora().getTime() - 32 * 60_000).toISOString(),
      resolvidoEm: null,
      comoTerminou: null,
      reconhecido: null,
      adiado: null,
      silencio: null,
      permite: { tratar: true },
    });
    expect(corpo.itens[2].alvo).toEqual({
      tipo: 'coletor',
      id: ids.coletor,
      nome: 'Coletor de Jundiaí',
    });
  });

  it('mostra a quem vê só um local só os alertas dele, sem os dos coletores', async () => {
    const deBruno = await listar('', 'bruno');
    expect(idsDe(deBruno)).toEqual([ids.emCampinas]);
    expect(deBruno.json().total).toBe(1);
    expect(deBruno.json().itens[0].permite).toEqual({ tratar: true });
    const deDavi = await listar('', 'davi');
    expect(idsDe(deDavi)).toHaveLength(5);
    expect(
      deDavi
        .json()
        .itens.every((alerta: { permite: { tratar: boolean } }) => !alerta.permite.tratar),
    ).toBe(true);
    expect((await listar('', 'carla')).statusCode).toBe(403);
  });

  it('filtra pela severidade, pela regra e pelo ativo', async () => {
    expect(idsDe(await listar('?severidade=atencao'))).toEqual([
      ids.atencaoAntigo,
      ids.atencaoNovo,
    ]);
    expect(idsDe(await listar(`?regra=${ids.toner}`))).toEqual([ids.critico, ids.emCampinas]);
    expect(idsDe(await listar(`?ativo=${ids.doRh}`))).toEqual([ids.critico, ids.atencaoAntigo]);
  });

  it('ordena pelo ativo, pelo alerta e pelo há, nas duas direções', async () => {
    expect(idsDe(await listar('?ordem=ha&direcao=desc'))).toEqual([
      ids.doColetor,
      ids.emCampinas,
      ids.critico,
      ids.atencaoNovo,
      ids.atencaoAntigo,
    ]);
    // Pelo texto e, no empate, pelo mais antigo.
    expect(idsDe(await listar('?ordem=alerta&direcao=asc'))).toEqual([
      ids.doColetor,
      ids.atencaoAntigo,
      ids.atencaoNovo,
      ids.emCampinas,
      ids.critico,
    ]);
    // Pelo nome do ativo ou do coletor, sem diferenciar maiúsculas.
    expect(idsDe(await listar('?ordem=ativo&direcao=asc'))).toEqual([
      ids.doColetor,
      ids.atencaoNovo,
      ids.emCampinas,
      ids.atencaoAntigo,
      ids.critico,
    ]);
  });

  it('pagina pelo cursor, sem repetir nem pular', async () => {
    const primeira = await listar('?limite=2');
    expect(idsDe(primeira)).toEqual([ids.critico, ids.emCampinas]);
    expect(primeira.json().total).toBe(5);
    const proximo = primeira.json().proximo;
    expect(proximo).toEqual(expect.any(String));
    const segunda = await listar(`?limite=2&cursor=${proximo}`);
    expect(idsDe(segunda)).toEqual([ids.doColetor, ids.atencaoAntigo]);
    const terceira = await listar(`?limite=2&cursor=${segunda.json().proximo}`);
    expect(idsDe(terceira)).toEqual([ids.atencaoNovo]);
    expect(terceira.json().proximo).toBeNull();
  });

  it('o "para resolver" tira os adiados e os dos ativos silenciados', async () => {
    const ate = new Date(api.relogio.agora().getTime() + 30 * 60_000);
    const adiado = await criarAlerta(api, alertas.org, {
      regraId: ids.papel ?? '',
      ativoId: ids.deCampinas,
      item: 'pouco-papel',
      texto: 'Pouco papel',
      severidade: 'atencao',
      adiadoAte: ate,
      adiadoPor: alertas.contas.ana.id,
    });
    await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.insert(silenciosDosAtivos).values({
        orgId: alertas.org,
        ativoId: ids.daExpedicao ?? '',
        motivo: 'Em manutenção',
        criadoPor: alertas.contas.ana.id,
      }),
    );
    try {
      const todos = await listar();
      const doAdiado = todos.json().itens.find((alerta: { id: string }) => alerta.id === adiado);
      expect(doAdiado.adiado).toEqual({ ate: ate.toISOString(), nome: 'Ana Souza' });
      const daExpedicao = todos
        .json()
        .itens.find((alerta: { id: string }) => alerta.id === ids.atencaoNovo);
      expect(daExpedicao.silencio).toEqual({ ate: null, motivo: 'Em manutenção' });
      const paraResolver = idsDe(await listar('?paraResolver=true'));
      expect(paraResolver).not.toContain(adiado);
      expect(paraResolver).not.toContain(ids.atencaoNovo);
      expect(paraResolver).toContain(ids.critico);
    } finally {
      await naOrganizacao(api.banco, alertas.org, async (tx) => {
        await tx.delete(silenciosDosAtivos);
      });
    }
  });

  it('traz os resolvidos, do mais recente, com como terminaram', async () => {
    const r = await listar('?situacao=resolvidos');
    expect(r.statusCode).toBe(200);
    expect(r.json().total).toBe(1);
    expect(r.json().itens).toEqual([
      expect.objectContaining({
        id: ids.resolvido,
        situacao: 'resolvido',
        texto: 'Toner preto em 6%',
        comoTerminou: 'voltou-ao-normal',
        resolvidoEm: new Date(api.relogio.agora().getTime() - 60 * 60_000).toISOString(),
      }),
    ]);
  });
});
