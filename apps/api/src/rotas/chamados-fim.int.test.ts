// O fim e a volta do chamado (spec chamados, "Ações do atendimento", "Conversa do chamado", "Prazo do
// chamado" e "Notificações dos chamados"; change chamados-da-ti, design, decisões 3, 4 e 12, e
// tarefa 4.14): retomar, resolver e reabrir pelas rotas, com a versão que a tela mostra, o relógio,
// a resolução, a conversa na ordem, a auditoria, o evento e as notificações. A matriz, as recusas e o
// relógio são do domínio (`chamados/acoes.test.ts`); aqui fica um caso de cada ligação.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type ChamadosDeTeste,
  montarChamados,
  type UsuarioDosChamados,
} from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  auditoriaDaRequisicao,
  criarRelogio,
} from '../../test/integracao.ts';

const host = 'grafite.chamados-fim.local';
/** A terça-feira, 17 de novembro de 2026, às 07:40 em São Paulo: a abertura dos chamados. */
const ABERTURA = new Date('2026-11-17T10:40:00.000Z');
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const MUDOU = 'urn:grafite:problema:chamado-mudou';
const CONFLITO = 'urn:grafite:problema:conflito';
const RELATO = 'A cadeira da sala 3 quebrou.';

let api: ApiDeTeste;
let c: ChamadosDeTeste;

/** 17/11/2026 em São Paulo, como "08:10". */
const as = (hora: string) => new Date(`2026-11-17T${hora}:00-03:00`);

/** Os segundos do relógio que conta desde a abertura, em horas corridas, como o tipo Outro. */
const contadoDesdeAAbertura = () =>
  Math.floor((api.relogio.agora().getTime() - ABERTURA.getTime()) / 1000);

type Acao = 'retomar' | 'resolver' | 'reabrir' | 'esperar' | 'assumir';

const agir = (
  numero: number,
  acao: Acao,
  usuario: UsuarioDosChamados | 'ninguem',
  corpo: object = {},
) => c.cliente.enviar('POST', `/chamados/${numero}/${acao}`, c.como(usuario), corpo);

/** A ação aceita, com a resposta. */
async function agiu(numero: number, acao: Acao, usuario: UsuarioDosChamados, corpo: object = {}) {
  const r = await agir(numero, acao, usuario, corpo);
  expect(r.statusCode, r.body).toBe(200);
  return r;
}

/** A ação recusada com o 409, do tipo e com a frase dados. */
async function recusada(
  numero: number,
  acao: Acao,
  corpo: object,
  { type, detail }: { type: string; detail: string },
) {
  const r = await agir(numero, acao, 'ana', corpo);
  expect(r.statusCode, r.body).toBe(409);
  expect(r.json()).toMatchObject({ type, detail });
}

/** O último evento da conversa do chamado. */
const ultimoEvento = async (numero: number) =>
  (await c.conversaDo(numero)).filter((linha) => linha.especie === 'evento').at(-1);

/** O evento em tempo real de cada mudança do chamado, a quem o vê na Recepção. */
const MUDOU_O_CHAMADO = {
  tipo: 'chamados.mudaram',
  alvoTipo: 'chamado',
  permissao: 'chamados.ver',
  locais: [] as string[],
};

/** O Contador de páginas, só da TI e obrigatório, como o formulário salvo o grava. */
const CONTADOR = {
  id: 'contador',
  tipo: 'numero',
  rotulo: 'Contador de páginas',
  nomeNoResumo: null,
  obrigatorio: true,
  soDaTi: true,
  apagarSeSumir: true,
  opcoes: [],
  tiposDeAtivo: [],
  condicao: [],
};

const comAna = () => ({ id: c.conta('ana'), nome: 'Ana Souza' });

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  c = await montarChamados(api, host);
  MUDOU_O_CHAMADO.locais = [c.locais.recepcao];
  // Os chamados #1042 a #1050, de Marina, da Recepção, em Jundiaí, do tipo Outro (em horas
  // corridas), abertos por Ana às 07:40 com ela, fora o #1046, que abre na triagem.
  await c.entrar('ana');
  for (let numero = 1042; numero <= 1050; numero += 1) {
    await c.abrir(c.relato('marina', { texto: RELATO, ficaComigo: numero !== 1046 }));
  }
  // As sessões entram às 09:40, com 2 h no relógio de cada chamado.
  api.relogio.avancar(2 * HORA);
  await c.entrar();
});

describe('POST /chamados/:numero/resolver', () => {
  it('em atendimento: o "O que foi feito" e a resolução, nessa ordem, com o relógio parado, quem resolveu e a primeira resposta da abertura', async () => {
    const agora = api.relogio.agora();
    const antes = await c.lerChamado(1042);
    const avisos = await c.notificacoesDo(1042);
    // Diego, que atende Jundiaí, resolve o chamado que está com Ana: quem resolveu é ele.
    const r = await agiu(1042, 'resolver', 'diego', {
      feito: '  Troquei a cadeira da sala 3.  ',
      versao: 1,
    });
    expect(r.json()).toEqual({
      numero: 1042,
      versao: 2,
      situacao: 'resolvido',
      responsavel: comAna(),
    });
    expect(await c.lerChamado(1042)).toMatchObject({
      situacao: 'resolvido',
      responsavelId: c.conta('ana'),
      responsavelDesde: ABERTURA,
      resolvidoEm: agora,
      resolvidoPor: c.conta('diego'),
      contadoS: contadoDesdeAAbertura(),
      relogioDesde: null,
      // O chamado aberto pela TI nasce com a primeira resposta, e o resolver não a muda.
      primeiraRespostaEm: antes.primeiraRespostaEm,
      versao: 2,
    });
    const gravadas = (await c.conversaDo(1042)).slice(-2);
    expect(gravadas.map(({ especie, evento, texto }) => ({ especie, evento, texto }))).toEqual([
      { especie: 'mensagem', evento: null, texto: 'Troquei a cadeira da sala 3.' },
      { especie: 'evento', evento: 'resolveu', texto: null },
    ]);
    expect(gravadas[1]?.dados).toEqual({});
    for (const linha of gravadas) {
      expect(linha).toMatchObject({ autorConta: c.conta('diego'), criadaEm: agora });
    }

    const [auditado, ...outros] = await auditoriaDaRequisicao(api, c.org, r);
    expect(outros).toEqual([]);
    expect(auditado).toMatchObject({
      acao: 'chamado.resolvido',
      atorContaId: c.conta('diego'),
      alvoId: c.chamadoId(1042),
    });
    expect(auditado?.antes).toEqual({ situacao: 'em-atendimento', responsavel: 'Ana Souza' });
    expect(auditado?.depois).toEqual({ situacao: 'resolvido', responsavel: 'Ana Souza' });
    expect(await c.eventosDo(1042)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);
    expect(await c.notificacoesDo(1042)).toEqual(avisos);

    // Resolvido, ele recusa outro resolver; a tela de antes vê primeiro que ele mudou.
    await recusada(
      1042,
      'resolver',
      { feito: 'Troquei.' },
      { type: CONFLITO, detail: 'O chamado #1042 está resolvido.' },
    );
    await recusada(
      1042,
      'resolver',
      { feito: 'Troquei.', versao: 1 },
      { type: MUDOU, detail: 'O chamado #1042 mudou. Confira antes de resolver.' },
    );
  });

  it('na triagem, fica sem ninguém e o relógio para; no aguardando, o relógio segue parado desde a espera', async () => {
    const agora = api.relogio.agora();
    const daTriagem = await agiu(1046, 'resolver', 'ana', { feito: 'Troquei a cadeira.' });
    expect(daTriagem.json()).toEqual({
      numero: 1046,
      versao: 2,
      situacao: 'resolvido',
      responsavel: null,
    });
    expect(await c.lerChamado(1046)).toMatchObject({
      situacao: 'resolvido',
      responsavelId: null,
      responsavelDesde: null,
      resolvidoEm: agora,
      resolvidoPor: c.conta('ana'),
      contadoS: contadoDesdeAAbertura(),
      relogioDesde: null,
      versao: 2,
    });
    const [auditado] = await auditoriaDaRequisicao(api, c.org, daTriagem);
    expect(auditado?.antes).toEqual({ situacao: 'triagem' });
    expect(auditado?.depois).toEqual({ situacao: 'resolvido' });

    // O #1043 aguarda Marina; 10 min depois, Ana o resolve.
    await agiu(1043, 'esperar', 'ana', { texto: 'Qual é a sala?' });
    const esperando = await c.lerChamado(1043);
    api.relogio.avancar(10 * MINUTO);
    const doAguardando = await agiu(1043, 'resolver', 'ana', {
      feito: 'Troquei a cadeira.',
      versao: 2,
    });
    expect(doAguardando.json()).toMatchObject({ versao: 3, situacao: 'resolvido' });
    expect(await c.lerChamado(1043)).toMatchObject({
      situacao: 'resolvido',
      responsavelId: c.conta('ana'),
      resolvidoEm: api.relogio.agora(),
      resolvidoPor: c.conta('ana'),
      contadoS: esperando.contadoS,
      relogioDesde: null,
      versao: 3,
    });
  });

  it('o "O que foi feito" recusado é o 400 no campo; o campo só da TI vazio, o 409, antes do texto', async () => {
    const conversa = await c.conversaDo(1044);
    const vazio = await agir(1044, 'resolver', 'ana', { feito: '   ' });
    expect(vazio.statusCode, vazio.body).toBe(400);
    expect(vazio.json().campos).toEqual({ feito: 'Escreva o que foi feito.' });
    // Sem o "O que foi feito", a frase é a da resolução, do domínio.
    const semTexto = await agir(1044, 'resolver', 'ana', {});
    expect(semTexto.statusCode, semTexto.body).toBe(400);
    expect(semTexto.json().campos).toEqual({ feito: 'Escreva o que foi feito.' });
    const longo = await agir(1044, 'resolver', 'ana', { feito: 'a'.repeat(2001) });
    expect(longo.statusCode, longo.body).toBe(400);
    expect(longo.json().campos).toEqual({ feito: 'Use até 2.000 caracteres.' });

    // A cópia do formulário do #1044 ganha o Contador de páginas, só da TI e obrigatório, vazio.
    const { formulario, respostas } = await c.lerChamado(1044);
    await c.mudarChamado(1044, {
      formulario: { ...formulario, campos: [...(formulario.campos as unknown[]), CONTADOR] },
    });
    for (const feito of ['Troquei a cadeira.', '']) {
      await recusada(
        1044,
        'resolver',
        { feito },
        { type: CONFLITO, detail: 'Preencha Contador de páginas antes de resolver.' },
      );
    }
    expect(await c.conversaDo(1044)).toEqual(conversa);
    expect(await c.lerChamado(1044)).toMatchObject({
      situacao: 'em-atendimento',
      resolvidoEm: null,
      versao: 1,
    });

    // Com o contador nas respostas do chamado, ele se resolve.
    await c.mudarChamado(1044, { respostas: { ...respostas, contador: 48210 } });
    await agiu(1044, 'resolver', 'ana', { feito: 'Troquei a cadeira.' });
    expect(await c.lerChamado(1044)).toMatchObject({ situacao: 'resolvido', versao: 2 });
  });
});

describe('POST /chamados/:numero/retomar', () => {
  it('o chamado que aguarda volta a Em atendimento com quem atendia, e o relógio volta a contar de onde parou', async () => {
    await agiu(1045, 'esperar', 'ana', { texto: 'Qual é a sala?' });
    const esperando = await c.lerChamado(1045);
    api.relogio.avancar(10 * MINUTO);
    const agora = api.relogio.agora();
    const avisos = await c.notificacoesDo(1045);
    // Diego retoma o chamado que Ana espera: ele continua com ela.
    const r = await agiu(1045, 'retomar', 'diego', { versao: 2 });
    expect(r.json()).toEqual({
      numero: 1045,
      versao: 3,
      situacao: 'em-atendimento',
      responsavel: comAna(),
    });
    expect(await c.lerChamado(1045)).toMatchObject({
      situacao: 'em-atendimento',
      responsavelId: c.conta('ana'),
      responsavelDesde: ABERTURA,
      contadoS: esperando.contadoS,
      relogioDesde: agora,
      versao: 3,
    });
    expect(await ultimoEvento(1045)).toMatchObject({
      evento: 'retomou',
      dados: {},
      autorConta: c.conta('diego'),
      criadaEm: agora,
    });
    const [auditado, ...outros] = await auditoriaDaRequisicao(api, c.org, r);
    expect(outros).toEqual([]);
    expect(auditado).toMatchObject({ acao: 'chamado.retomado', atorContaId: c.conta('diego') });
    expect(auditado?.antes).toEqual({ situacao: 'aguardando', responsavel: 'Ana Souza' });
    expect(auditado?.depois).toEqual({ situacao: 'em-atendimento', responsavel: 'Ana Souza' });
    // O da abertura, o da espera e o da retomada.
    expect(await c.eventosDo(1045)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);
    expect(await c.notificacoesDo(1045)).toEqual(avisos);

    await recusada(
      1045,
      'retomar',
      {},
      { type: CONFLITO, detail: 'O chamado #1045 não está aguardando.' },
    );
    await recusada(
      1045,
      'retomar',
      { versao: 2 },
      { type: MUDOU, detail: 'O chamado #1045 mudou. Confira antes de retomar.' },
    );
  });
});

describe('POST /chamados/:numero/reabrir', () => {
  it('Reabrir: volta a Em atendimento com quem resolveu, o relógio volta a contar das 3 h, e a resolução e a marca do estouro saem', async () => {
    // Ana resolveu o #1047 às 09:00, com 3 h contadas e o estouro avisado às 08:50.
    await c.mudarChamado(1047, {
      situacao: 'resolvido',
      contadoS: 3 * 60 * 60,
      relogioDesde: null,
      estouroAvisadoEm: as('08:50'),
      resolvidoEm: as('09:00'),
      resolvidoPor: c.conta('ana'),
      versao: 2,
    });
    await c.incluirConversa(1047, [
      { especie: 'mensagem', conta: 'ana', texto: 'Troquei a cadeira.', em: as('09:00') },
      { especie: 'evento', conta: 'ana', evento: 'resolveu', dados: {}, em: as('09:00') },
    ]);
    const agora = api.relogio.agora();
    const avisos = await c.notificacoesDo(1047);
    const r = await agiu(1047, 'reabrir', 'ana', { versao: 2 });
    expect(r.json()).toEqual({
      numero: 1047,
      versao: 3,
      situacao: 'em-atendimento',
      responsavel: comAna(),
    });
    expect(await c.lerChamado(1047)).toMatchObject({
      situacao: 'em-atendimento',
      responsavelId: c.conta('ana'),
      // O reaberto conta de agora, mesmo com Ana, que já estava com ele desde a abertura.
      responsavelDesde: agora,
      contadoS: 3 * 60 * 60,
      relogioDesde: agora,
      estouroAvisadoEm: null,
      resolvidoEm: null,
      resolvidoPor: null,
      versao: 3,
    });
    expect(await ultimoEvento(1047)).toMatchObject({
      evento: 'reabriu',
      dados: { para: c.conta('ana') },
      autorConta: c.conta('ana'),
      criadaEm: agora,
    });
    const [auditado, ...outros] = await auditoriaDaRequisicao(api, c.org, r);
    expect(outros).toEqual([]);
    expect(auditado).toMatchObject({ acao: 'chamado.reaberto', atorContaId: c.conta('ana') });
    expect(auditado?.antes).toEqual({ situacao: 'resolvido', responsavel: 'Ana Souza' });
    expect(auditado?.depois).toEqual({ situacao: 'em-atendimento', responsavel: 'Ana Souza' });
    expect(await c.eventosDo(1047)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);
    // Ana reabriu o que ela resolveu: ninguém é avisado.
    expect(await c.notificacoesDo(1047)).toEqual(avisos);

    await recusada(
      1047,
      'reabrir',
      {},
      { type: CONFLITO, detail: 'O chamado #1047 não está resolvido.' },
    );
    await recusada(
      1047,
      'reabrir',
      { versao: 2 },
      { type: MUDOU, detail: 'O chamado #1047 mudou. Confira antes de reabrir.' },
    );
  });

  it('Reaberto por outra pessoa: volta a quem resolveu, e não a quem atendia, e quem resolveu é avisado', async () => {
    // Diego resolve o #1048, que está com Ana; Lívia o reabre 10 min depois.
    await agiu(1048, 'resolver', 'diego', { feito: 'Troquei a cadeira.' });
    const resolvido = await c.lerChamado(1048);
    api.relogio.avancar(10 * MINUTO);
    const agora = api.relogio.agora();
    const avisos = await c.notificacoesDo(1048);
    const r = await agiu(1048, 'reabrir', 'livia', { versao: 2 });
    expect(r.json()).toEqual({
      numero: 1048,
      versao: 3,
      situacao: 'em-atendimento',
      responsavel: { id: c.conta('diego'), nome: 'Diego Ramos' },
    });
    expect(await c.lerChamado(1048)).toMatchObject({
      responsavelId: c.conta('diego'),
      responsavelDesde: agora,
      contadoS: resolvido.contadoS,
      relogioDesde: agora,
      resolvidoEm: null,
      resolvidoPor: null,
    });
    const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditado?.antes).toEqual({ situacao: 'resolvido', responsavel: 'Ana Souza' });
    expect(auditado?.depois).toEqual({ situacao: 'em-atendimento', responsavel: 'Diego Ramos' });
    expect((await c.notificacoesDo(1048)).slice(avisos.length)).toEqual([
      { usuario: 'diego', titulo: `Chamado #1048 com você: ${RELATO}` },
    ]);
  });

  it('Reabrir o que foi resolvido por quem não atende mais: volta Na triagem, quem atende os locais é avisado, fora quem reabriu, e a triagem conta do reabrir', async () => {
    await agiu(1049, 'resolver', 'diego', { feito: 'Troquei a cadeira.' });
    await c.mudarConta('diego', 'inativa');
    try {
      const agora = api.relogio.agora();
      const avisos = await c.notificacoesDo(1049);
      const r = await agiu(1049, 'reabrir', 'ana', { versao: 2 });
      expect(r.json()).toEqual({
        numero: 1049,
        versao: 3,
        situacao: 'triagem',
        responsavel: null,
      });
      expect(await c.lerChamado(1049)).toMatchObject({
        situacao: 'triagem',
        responsavelId: null,
        responsavelDesde: null,
        relogioDesde: agora,
        resolvidoEm: null,
        resolvidoPor: null,
        versao: 3,
      });
      expect(await ultimoEvento(1049)).toMatchObject({ evento: 'reabriu', dados: { para: null } });
      const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
      expect(auditado?.antes).toEqual({ situacao: 'resolvido', responsavel: 'Ana Souza' });
      expect(auditado?.depois).toEqual({ situacao: 'triagem' });
      // Lívia administra a organização. Ana reabriu, Diego está inativo, Elisa atende Campinas, e
      // Carla só vê.
      expect((await c.notificacoesDo(1049)).slice(avisos.length)).toEqual([
        { usuario: 'livia', titulo: `Chamado #1049 na triagem: ${RELATO}` },
      ]);

      // O assumir depois guarda a triagem desde o reabrir.
      api.relogio.avancar(5 * MINUTO);
      await agiu(1049, 'assumir', 'ana', { versao: 3 });
      expect((await ultimoEvento(1049))?.dados).toEqual({ de: null, desde: agora.toISOString() });
    } finally {
      await c.mudarConta('diego', 'ativa');
      await c.entrar('diego');
    }
  });
});

describe('o acesso', () => {
  it('quem não atende recebe o 403, e o chamado que a conta não vê responde como o que não existe', async () => {
    for (const acao of ['retomar', 'resolver', 'reabrir'] as const) {
      const naoAtende = await agir(1050, acao, 'carla', { feito: 'Troquei.' });
      expect(naoAtende.statusCode, `${acao}: ${naoAtende.body}`).toBe(403);
      const naoVe = await agir(1050, acao, 'elisa', { feito: 'Troquei.' });
      expect(naoVe.statusCode, `${acao}: ${naoVe.body}`).toBe(404);
      expect(naoVe.json().detail).toBe('Chamado não encontrado.');
    }
    expect(await c.lerChamado(1050)).toMatchObject({ situacao: 'em-atendimento', versao: 1 });
  });
});
