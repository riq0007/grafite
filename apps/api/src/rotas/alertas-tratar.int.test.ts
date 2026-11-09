// O tratamento dos alertas pela API (spec alertas, "Reconhecer o alerta", "Adiar o alerta" e
// "Silenciar os alertas de um ativo"; change p3a-regras-e-alertas, design, decisões 8 e 10): quem
// trata os alertas no escopo do local do ativo reconhece, adia e silencia, com as recusas, a
// auditoria e o evento; a avaliação tira o adiamento e o silêncio vencidos.
import {
  eventos,
  naOrganizacao,
  notificacoes,
  silenciosDosAtivos,
  alertas as tabelaDosAlertas,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';
import { avaliarOrganizacao } from '../alertas/avaliacao.ts';

const host = 'grafite.tratar-alertas.local';
const MINUTO = 60_000;

let api: ApiDeTeste;
let alertas: AlertasDeTeste;
let regra = '';
let semContato = '';
let deJundiai = '';
let deCampinas = '';
let inativo = '';
let coletor = '';

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
  const { org } = alertas;
  const impressora = await criarTipo(api, org, { capacidades: ['snmp.suprimentos'] });
  deJundiai = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora do RH',
    localId: alertas.jundiai,
  });
  deCampinas = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora de Campinas',
    localId: alertas.campinas,
  });
  inativo = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora parada',
    situacao: 'inativo',
  });
  coletor = await criarColetor(api, org, { ultimoContatoEm: api.relogio.agora() });
  regra = await criarRegra(api, org, {
    nome: 'Impressora pede atenção',
    condicao: 'impressora.condicao',
    parametros: { condicoes: ['sem-papel'] },
    duracao: 0,
    severidade: 'critico',
    escopo: { tipo: 'organizacao', id: null },
  });
  semContato = await criarRegra(api, org, {
    nome: 'Coletor sem contato',
    condicao: 'coletor.sem-contato',
    parametros: { minutos: 10 },
    duracao: 0,
    severidade: 'critico',
    escopo: { tipo: 'organizacao', id: null },
  });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, alertas.org, async (tx) => {
    await tx.delete(eventos);
    await tx.delete(notificacoes);
    await tx.delete(tabelaDosAlertas);
    await tx.delete(silenciosDosAtivos);
  });
});

const semPapel = (ativoId: string) =>
  criarAlerta(api, alertas.org, {
    regraId: regra,
    ativoId,
    item: 'sem-papel',
    texto: 'Sem papel',
  });

const reconhecer = (id: string, usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.enviar('POST', `/alertas/${id}/reconhecimento`, alertas.como(usuario));
const adiar = (id: string, minutos: number, usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.enviar('POST', `/alertas/${id}/adiamento`, alertas.como(usuario), { minutos });
const silenciar = (ativoId: string, pedido: object, usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.enviar('PUT', `/ativos/${ativoId}/silencio`, alertas.como(usuario), pedido);
const retomar = (ativoId: string, usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.enviar('DELETE', `/ativos/${ativoId}/silencio`, alertas.como(usuario));

const linha = async (id: string) => {
  const [alerta] = await naOrganizacao(api.banco, alertas.org, (tx) =>
    tx.select().from(tabelaDosAlertas).where(eq(tabelaDosAlertas.id, id)),
  );
  return alerta;
};

const avisos = () =>
  naOrganizacao(api.banco, alertas.org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, permissao: eventos.permissao, locais: eventos.locais })
      .from(eventos),
  );

describe('reconhecer', () => {
  it('guarda quem e quando, com a auditoria e o evento para o local do ativo', async () => {
    const id = await semPapel(deJundiai);
    const r = await reconhecer(id);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      reconhecido: { nome: 'Ana Souza', em: api.relogio.agora().toISOString() },
    });
    expect(await linha(id)).toMatchObject({
      situacao: 'aberto',
      reconhecidoPor: alertas.contas.ana.id,
      reconhecidoEm: api.relogio.agora(),
    });
    expect(await auditoriaDaRequisicao(api, alertas.org, r)).toMatchObject([
      {
        acao: 'alerta.reconhecido',
        alvoTipo: 'alerta',
        alvoId: id,
        dados: { alerta: 'Sem papel', regra: 'Impressora pede atenção' },
      },
    ]);
    expect(await avisos()).toEqual([
      { tipo: 'alertas.mudaram', permissao: 'alertas.ver', locais: [alertas.jundiai] },
    ]);
  });

  it('recusa quem trata só em outro local, quem só vê e o alerta resolvido', async () => {
    const id = await semPapel(deJundiai);
    expect((await reconhecer(id, 'bruno')).statusCode).toBe(403);
    expect((await reconhecer(id, 'davi')).statusCode).toBe(403);
    expect((await reconhecer(await semPapel(deCampinas), 'bruno')).statusCode).toBe(200);
    await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx
        .update(tabelaDosAlertas)
        .set({
          situacao: 'resolvido',
          resolvidoEm: api.relogio.agora(),
          comoTerminou: 'voltou-ao-normal',
        })
        .where(eq(tabelaDosAlertas.id, id)),
    );
    const resolvido = await reconhecer(id);
    expect(resolvido.statusCode).toBe(409);
    expect(resolvido.json().detail).toBe('O alerta já foi resolvido.');
  });

  it('o alerta do coletor só é tratado na organização inteira', async () => {
    const id = await criarAlerta(api, alertas.org, {
      regraId: semContato,
      coletorId: coletor,
      texto: 'Coletor sem contato',
    });
    expect((await reconhecer(id, 'bruno')).statusCode).toBe(403);
    expect((await reconhecer(id)).statusCode).toBe(200);
  });

  it('não acha o alerta pendente nem o que não existe', async () => {
    const pendente = await criarAlerta(api, alertas.org, {
      regraId: regra,
      ativoId: deJundiai,
      item: 'sem-papel',
      situacao: 'pendente',
      abertoEm: null,
    });
    const r = await reconhecer(pendente);
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Alerta não encontrado.');
  });
});

describe('adiar', () => {
  it('adia por 15, 30 ou 60 minutos, troca a hora ao adiar de novo e audita até quando', async () => {
    const id = await semPapel(deJundiai);
    const ate = (minutos: number) =>
      new Date(api.relogio.agora().getTime() + minutos * MINUTO).toISOString();
    const r = await adiar(id, 30);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ adiado: { ate: ate(30), nome: 'Ana Souza' } });
    expect(await auditoriaDaRequisicao(api, alertas.org, r)).toMatchObject([
      { acao: 'alerta.adiado', alvoId: id, dados: { alerta: 'Sem papel', ate: ate(30) } },
    ]);
    expect((await adiar(id, 15)).json()).toEqual({ adiado: { ate: ate(15), nome: 'Ana Souza' } });
    const maisDeUmaHora = await adiar(id, 90);
    expect(maisDeUmaHora.statusCode).toBe(400);
  });

  it('volta sozinho quando a hora passa, pela avaliação, com o evento', async () => {
    const id = await semPapel(deJundiai);
    await adiar(id, 15);
    await naOrganizacao(api.banco, alertas.org, (tx) => tx.delete(eventos));
    api.relogio.avancar(16 * MINUTO);
    await naOrganizacao(api.banco, alertas.org, (tx) =>
      avaliarOrganizacao(tx, { agora: api.relogio.agora() }),
    );
    expect(await linha(id)).toMatchObject({ adiadoAte: null, adiadoPor: null });
    // O evento da avaliação alcança Jundiaí, com o que mais tiver mudado nela.
    expect((await avisos()).filter((aviso) => aviso.tipo === 'alertas.mudaram')).toContainEqual({
      tipo: 'alertas.mudaram',
      permissao: 'alertas.ver',
      locais: expect.arrayContaining([alertas.jundiai]),
    });
  });
});

describe('silenciar', () => {
  it('silencia até um momento, com o motivo, e lê o silêncio do ativo', async () => {
    const ate = new Date(api.relogio.agora().getTime() + 2 * 24 * 60 * MINUTO).toISOString();
    const r = await silenciar(deJundiai, { ate, motivo: 'Em manutenção' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      silencio: {
        ate,
        motivo: 'Em manutenção',
        nome: 'Ana Souza',
        em: api.relogio.agora().toISOString(),
      },
      permite: { ver: true, tratar: true },
    });
    expect(await auditoriaDaRequisicao(api, alertas.org, r)).toMatchObject([
      {
        acao: 'alertas.silenciados',
        alvoTipo: 'ativo',
        alvoId: deJundiai,
        depois: { ate, motivo: 'Em manutenção' },
      },
    ]);
    const lido = await alertas.cliente.consultar(
      `/ativos/${deJundiai}/silencio`,
      alertas.como('davi'),
    );
    expect(lido.json()).toEqual({
      silencio: {
        ate,
        motivo: 'Em manutenção',
        nome: 'Ana Souza',
        em: api.relogio.agora().toISOString(),
      },
      permite: { ver: true, tratar: false },
    });
  });

  it('silencia até alguém retomar, e retomar apaga o silêncio, com a auditoria', async () => {
    expect((await silenciar(deJundiai, { ate: null })).json().silencio).toMatchObject({
      ate: null,
      motivo: null,
    });
    const r = await retomar(deJundiai);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ silencio: null, permite: { ver: true, tratar: true } });
    expect(await auditoriaDaRequisicao(api, alertas.org, r)).toMatchObject([
      { acao: 'alertas.retomados', alvoId: deJundiai, antes: { ate: null, motivo: null } },
    ]);
    const deNovo = await retomar(deJundiai);
    expect(await auditoriaDaRequisicao(api, alertas.org, deNovo)).toEqual([]);
  });

  it('recusa o momento que passou ou passa de um ano, o motivo longo e o ativo inativo', async () => {
    const passado = await silenciar(deJundiai, {
      ate: new Date(api.relogio.agora().getTime() - MINUTO).toISOString(),
    });
    expect(passado.statusCode).toBe(400);
    expect(passado.json().campos).toEqual({ ate: 'Escolha um momento no futuro, em até um ano.' });
    const longe = await silenciar(deJundiai, {
      ate: new Date(api.relogio.agora().getTime() + 400 * 24 * 60 * MINUTO).toISOString(),
    });
    expect(longe.json().campos).toEqual({ ate: 'Escolha um momento no futuro, em até um ano.' });
    const motivo = await silenciar(deJundiai, { ate: null, motivo: 'x'.repeat(201) });
    expect(motivo.json().campos).toEqual({ motivo: 'Use até 200 caracteres no motivo.' });
    const parado = await silenciar(inativo, { ate: null });
    expect(parado.statusCode).toBe(409);
    expect(parado.json().detail).toBe('O ativo está inativo.');
  });

  it('a quem não vê os alertas do local do ativo, a leitura não diz nada do silêncio', async () => {
    await silenciar(deJundiai, { ate: null, motivo: 'Em manutenção' });
    const deBruno = await alertas.cliente.consultar(
      `/ativos/${deJundiai}/silencio`,
      alertas.como('bruno'),
    );
    expect(deBruno.statusCode).toBe(200);
    expect(deBruno.json()).toEqual({ silencio: null, permite: { ver: false, tratar: false } });
  });

  it('recusa quem não trata os alertas no local do ativo', async () => {
    expect((await silenciar(deJundiai, { ate: null }, 'bruno')).statusCode).toBe(403);
    expect((await silenciar(deCampinas, { ate: null }, 'bruno')).statusCode).toBe(200);
    expect((await silenciar(deJundiai, { ate: null }, 'davi')).statusCode).toBe(403);
  });

  it('termina sozinho quando o momento passa, pela avaliação', async () => {
    await silenciar(deJundiai, {
      ate: new Date(api.relogio.agora().getTime() + 10 * MINUTO).toISOString(),
    });
    api.relogio.avancar(11 * MINUTO);
    await naOrganizacao(api.banco, alertas.org, (tx) =>
      avaliarOrganizacao(tx, { agora: api.relogio.agora() }),
    );
    const restantes = await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.select().from(silenciosDosAtivos),
    );
    expect(restantes).toEqual([]);
  });
});
