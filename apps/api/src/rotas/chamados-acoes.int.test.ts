// As ações que mudam quem atende (spec chamados, "Ações do atendimento", "Situação e quem atende",
// "Conversa do chamado" e "Notificações dos chamados"; change chamados-da-ti, design, decisão 4, e
// tarefa 4.12): assumir, passar, devolver e desfazer pelas rotas, com a versão que a tela mostra, a
// conversa, a auditoria, o evento e as notificações. A matriz, as recusas e o "desde" são do domínio
// (`chamados/acoes.test.ts` e `chamados/desde.test.ts`); aqui fica um caso de cada ligação.
import { atribuicoes, chamados, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type ChamadosDeTeste,
  montarChamados,
  type UsuarioDosChamados,
} from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  criarRelogio,
  esperarNaTrava,
} from '../../test/integracao.ts';

const host = 'grafite.chamados-acoes.local';
/** A terça-feira, 17 de novembro de 2026, às 07:40 em São Paulo: a abertura dos chamados. */
const ABERTURA = new Date('2026-11-17T10:40:00.000Z');
const MINUTO = 60 * 1000;
const MUDOU = 'urn:grafite:problema:chamado-mudou';
const CONFLITO = 'urn:grafite:problema:conflito';
const NAO_ENCONTRADO = 'Chamado não encontrado.';
const RELATO = 'A cadeira da sala 3 quebrou.';

let api: ApiDeTeste;
let c: ChamadosDeTeste;

/** 17/11/2026 em São Paulo, como "08:10". */
const as = (hora: string) => new Date(`2026-11-17T${hora}:00-03:00`);

type Acao = 'assumir' | 'passar' | 'devolver' | 'desfazer';

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

/** O chamado passado por Ana a Diego às 08:10, direto no banco: a versão 2. */
async function comDiego(numero: number) {
  await c.mudarChamado(numero, {
    situacao: 'em-atendimento',
    responsavelId: c.conta('diego'),
    responsavelDesde: as('08:10'),
    versao: 2,
  });
  await c.incluirConversa(numero, [
    {
      especie: 'evento',
      conta: 'ana',
      evento: 'passou',
      dados: { de: null, para: c.conta('diego') },
      em: as('08:10'),
    },
  ]);
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  c = await montarChamados(api, host);
  MUDOU_O_CHAMADO.locais = [c.locais.recepcao];
  // Os chamados #1042 a #1053, de Marina, da Recepção, em Jundiaí, abertos por Ana às 07:40 na
  // triagem.
  await c.entrar('ana');
  for (let vez = 0; vez < 12; vez += 1) {
    await c.abrir(c.relato('marina', { texto: RELATO, ficaComigo: false }));
  }
  // As sessões entram às 09:40, depois da espera, que venceria a de Ana.
  api.relogio.avancar(2 * 60 * MINUTO);
  await c.entrar();
});

describe('POST /chamados/:numero/assumir', () => {
  it('da triagem: passa a Em atendimento com quem assumiu, e o evento guarda desde quando ele estava nela', async () => {
    const agora = api.relogio.agora();
    const avisos = await c.notificacoesDo(1042);
    const r = await agiu(1042, 'assumir', 'ana');
    expect(r.json()).toEqual({
      numero: 1042,
      versao: 2,
      situacao: 'em-atendimento',
      responsavel: { id: c.conta('ana'), nome: 'Ana Souza' },
    });
    expect(await c.lerChamado(1042)).toMatchObject({
      situacao: 'em-atendimento',
      responsavelId: c.conta('ana'),
      responsavelDesde: agora,
      versao: 2,
    });
    expect(await ultimoEvento(1042)).toMatchObject({
      evento: 'assumiu',
      autorConta: c.conta('ana'),
      dados: { de: null, desde: ABERTURA.toISOString() },
      criadaEm: agora,
    });

    const [auditado, ...outros] = await auditoriaDaRequisicao(api, c.org, r);
    expect(outros).toEqual([]);
    expect(auditado).toMatchObject({
      acao: 'chamado.assumido',
      atorContaId: c.conta('ana'),
      alvoTipo: 'chamado',
      alvoId: c.chamadoId(1042),
    });
    expect(auditado?.antes).toEqual({ situacao: 'triagem' });
    expect(auditado?.depois).toEqual({ situacao: 'em-atendimento', responsavel: 'Ana Souza' });
    // O da abertura e o do assumir, a quem vê o chamado nos locais dele.
    expect(await c.eventosDo(1042)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);
    // O assumir não avisa ninguém.
    expect(await c.notificacoesDo(1042)).toEqual(avisos);

    // A ficha leva o desde do assumir, para o "estava há 2 h na triagem".
    const ficha = await c.cliente.consultar('/chamados/1042', c.como('ana'));
    expect(ficha.json().conversa.at(-1)).toMatchObject({
      especie: 'evento',
      evento: 'assumiu',
      de: null,
      desde: ABERTURA.toISOString(),
    });
  });

  it('de outra conta: o evento guarda de quem e desde quando o chamado estava com ela, sem avisá-la', async () => {
    await comDiego(1043);
    const avisos = await c.notificacoesDo(1043);
    const r = await agiu(1043, 'assumir', 'ana', { versao: 2 });
    expect(r.json()).toMatchObject({ versao: 3, responsavel: { id: c.conta('ana') } });
    expect((await ultimoEvento(1043))?.dados).toEqual({
      de: c.conta('diego'),
      desde: as('08:10').toISOString(),
    });
    expect(await c.notificacoesDo(1043)).toEqual(avisos);
  });

  it('a recusa do domínio é o conflito, com a frase, e o chamado fica como estava', async () => {
    await comDiego(1044);
    const r = await agir(1044, 'assumir', 'diego');
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json()).toMatchObject({ type: CONFLITO, detail: 'O chamado #1044 já está com você.' });
    expect(await c.lerChamado(1044)).toMatchObject({ responsavelId: c.conta('diego'), versao: 2 });
    expect(await auditoriaDaRequisicao(api, c.org, r)).toEqual([]);
  });

  it('quem não atende recebe o 403, e o chamado que a conta não vê responde como o que não existe', async () => {
    // Carla só vê os chamados.
    expect((await agir(1044, 'assumir', 'carla')).statusCode).toBe(403);
    // Elisa atende os chamados de Campinas e não vê o #1044, da Recepção, em Jundiaí.
    const corpo = { versao: 2, para: c.conta('elisa') };
    for (const acao of ['assumir', 'passar', 'devolver', 'desfazer'] as const) {
      const naoVe = await agir(1044, acao, 'elisa', corpo);
      expect(naoVe.statusCode, `${acao}: ${naoVe.body}`).toBe(404);
      expect(naoVe.json().detail).toBe(NAO_ENCONTRADO);
    }
    const naoExiste = await agir(9999, 'assumir', 'ana');
    expect(naoExiste.statusCode).toBe(404);
    expect(naoExiste.json().detail).toBe(NAO_ENCONTRADO);
    // Sem entrar, a sessão é pedida antes de tudo.
    expect((await agir(1044, 'assumir', 'ninguem')).statusCode).toBe(401);
    expect(await c.lerChamado(1044)).toMatchObject({ responsavelId: c.conta('diego'), versao: 2 });
  });

  it('quem vê o chamado e não atende os locais dele recebe a recusa do domínio', async () => {
    // Carla, que vê os chamados da organização, passa a atender os de Campinas: vê o #1052, da
    // Recepção, em Jundiaí, e não o atende.
    const atribuicao = await atribuir(api, c.org, {
      perfilId: c.perfis.atende,
      contaId: c.conta('carla'),
      localId: c.locais.campinas,
    });
    try {
      const r = await agir(1052, 'assumir', 'carla');
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json()).toMatchObject({
        type: CONFLITO,
        detail: 'Você não atende os chamados de Jundiaí › Recepção.',
      });
      expect(await c.lerChamado(1052)).toMatchObject({
        situacao: 'triagem',
        responsavelId: null,
        versao: 1,
      });
    } finally {
      await naOrganizacao(api.banco, c.org, (tx) =>
        tx.delete(atribuicoes).where(eq(atribuicoes.id, atribuicao)),
      );
    }
  });

  it('com a versão de antes, o assumir, o passar e o devolver são recusados com o chamado-mudou', async () => {
    // Ana olha o #1045 pela tela de antes de Diego recebê-lo: a versão 1.
    await comDiego(1045);
    const pedidos = [
      ['assumir', { versao: 1 }],
      ['passar', { para: c.conta('ana'), versao: 1 }],
      ['devolver', { versao: 1 }],
    ] as const;
    for (const [acao, corpo] of pedidos) {
      const r = await agir(1045, acao, 'ana', corpo);
      expect(r.statusCode, `${acao}: ${r.body}`).toBe(409);
      expect(r.json()).toMatchObject({
        type: MUDOU,
        detail: `O chamado #1045 mudou. Confira antes de ${acao}.`,
      });
    }
    expect(await c.lerChamado(1045)).toMatchObject({ responsavelId: c.conta('diego'), versao: 2 });
  });
});

describe('POST /chamados/:numero/passar', () => {
  it('o chamado vai à conta escolhida, que é avisada', async () => {
    const agora = api.relogio.agora();
    const avisos = await c.notificacoesDo(1046);
    const r = await agiu(1046, 'passar', 'ana', { para: c.conta('diego'), versao: 1 });
    expect(r.json()).toEqual({
      numero: 1046,
      versao: 2,
      situacao: 'em-atendimento',
      responsavel: { id: c.conta('diego'), nome: 'Diego Ramos' },
    });
    expect(await c.lerChamado(1046)).toMatchObject({
      responsavelId: c.conta('diego'),
      responsavelDesde: agora,
      versao: 2,
    });
    expect(await ultimoEvento(1046)).toMatchObject({
      evento: 'passou',
      autorConta: c.conta('ana'),
      dados: { de: null, para: c.conta('diego') },
    });
    const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditado).toMatchObject({ acao: 'chamado.passado', alvoId: c.chamadoId(1046) });
    expect(auditado?.antes).toEqual({ situacao: 'triagem' });
    expect(auditado?.depois).toEqual({ situacao: 'em-atendimento', responsavel: 'Diego Ramos' });
    expect(await c.eventosDo(1046)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);
    expect(await c.notificacoesDo(1046)).toEqual([
      ...avisos,
      { usuario: 'diego', titulo: `Chamado #1046 com você: ${RELATO}` },
    ]);
  });

  it('quem passa a si mesmo não é avisado', async () => {
    const avisos = await c.notificacoesDo(1047);
    const r = await agiu(1047, 'passar', 'ana', { para: c.conta('ana') });
    expect(r.json()).toMatchObject({ responsavel: { id: c.conta('ana'), nome: 'Ana Souza' } });
    expect(await c.notificacoesDo(1047)).toEqual(avisos);
  });

  it('a conta escolhida que não atende os locais, a desativada e a que não existe são recusadas', async () => {
    // O #1047 está com Ana.
    const aElisa = await agir(1047, 'passar', 'ana', { para: c.conta('elisa') });
    expect(aElisa.statusCode, aElisa.body).toBe(409);
    expect(aElisa.json()).toMatchObject({
      type: CONFLITO,
      detail: 'Elisa não atende os chamados de Jundiaí › Recepção.',
    });
    await c.mudarConta('diego', 'inativa');
    try {
      const aDiego = await agir(1047, 'passar', 'ana', { para: c.conta('diego') });
      expect(aDiego.statusCode, aDiego.body).toBe(409);
      expect(aDiego.json().detail).toBe('Diego não atende os chamados de Jundiaí › Recepção.');
    } finally {
      await c.mudarConta('diego', 'ativa');
      await c.entrar('diego');
    }
    // A conta que não existe, e o que nem é o id de uma conta.
    for (const para of ['0198a3f0-0000-7000-8000-000000000000', 'conta-do-diego']) {
      const aNinguem = await agir(1047, 'passar', 'ana', { para });
      expect(aNinguem.statusCode, aNinguem.body).toBe(400);
      expect(aNinguem.json().campos).toEqual({ para: 'Conta não encontrada.' });
    }
    const semPara = await agir(1047, 'passar', 'ana', {});
    expect(semPara.statusCode, semPara.body).toBe(400);
    expect(semPara.json().campos).toEqual({ para: 'Escolha para quem passar.' });
    expect(await c.lerChamado(1047)).toMatchObject({ responsavelId: c.conta('ana'), versao: 2 });
  });

  it('duas pessoas passam o mesmo chamado ao mesmo tempo: a segunda espera a primeira e é recusada', async () => {
    // Outra conexão faz o que o passar de Diego faz: trava o #1053, que está na triagem, e o passa a
    // Diego, subindo a versão. O passar de Ana, com a versão de antes, espera a trava e relê o
    // chamado.
    let soltar = () => {};
    let preso = () => {};
    const travado = new Promise<void>((resolve) => {
      preso = resolve;
    });
    const deDiego = naOrganizacao(api.banco, c.org, async (tx) => {
      await tx
        .select({ id: chamados.id })
        .from(chamados)
        .where(eq(chamados.numero, 1053))
        .for('update');
      preso();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
      await tx
        .update(chamados)
        .set({
          situacao: 'em-atendimento',
          responsavelId: c.conta('diego'),
          responsavelDesde: api.relogio.agora(),
          versao: 2,
        })
        .where(eq(chamados.numero, 1053));
    });
    await travado;
    let deAna: ReturnType<typeof agir> | undefined;
    try {
      deAna = agir(1053, 'passar', 'ana', { para: c.conta('ana'), versao: 1 });
      await esperarNaTrava(api, 1);
    } finally {
      soltar();
      await deDiego;
    }
    const r = await deAna;
    expect(r?.statusCode, r?.body).toBe(409);
    expect(r?.json()).toMatchObject({
      type: MUDOU,
      detail: 'O chamado #1053 mudou. Confira antes de passar.',
    });
    expect(await c.lerChamado(1053)).toMatchObject({ responsavelId: c.conta('diego'), versao: 2 });
  });
});

describe('POST /chamados/:numero/devolver', () => {
  it('o chamado volta à triagem, quem atende os locais é avisado, fora quem devolveu, e a triagem conta do devolver', async () => {
    await comDiego(1048);
    const agora = api.relogio.agora();
    const avisos = await c.notificacoesDo(1048);
    const r = await agiu(1048, 'devolver', 'diego', { versao: 2 });
    expect(r.json()).toEqual({ numero: 1048, versao: 3, situacao: 'triagem', responsavel: null });
    expect(await c.lerChamado(1048)).toMatchObject({
      situacao: 'triagem',
      responsavelId: null,
      responsavelDesde: null,
      versao: 3,
    });
    expect(await ultimoEvento(1048)).toMatchObject({
      evento: 'devolveu',
      autorConta: c.conta('diego'),
      dados: { de: c.conta('diego') },
    });
    const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditado).toMatchObject({ acao: 'chamado.devolvido', atorContaId: c.conta('diego') });
    expect(auditado?.antes).toEqual({ situacao: 'em-atendimento', responsavel: 'Diego Ramos' });
    expect(auditado?.depois).toEqual({ situacao: 'triagem' });
    expect(await c.eventosDo(1048)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);
    // Ana atende a organização, e Lívia a administra; Elisa atende Campinas, e Carla só vê.
    const titulo = `Chamado #1048 na triagem: ${RELATO}`;
    const novos = (await c.notificacoesDo(1048)).slice(avisos.length);
    expect(novos.sort((a, b) => a.usuario.localeCompare(b.usuario))).toEqual([
      { usuario: 'ana', titulo },
      { usuario: 'livia', titulo },
    ]);

    // O assumir depois guarda a triagem desde o devolver.
    api.relogio.avancar(5 * MINUTO);
    await agiu(1048, 'assumir', 'ana', { versao: 3 });
    expect((await ultimoEvento(1048))?.dados).toEqual({ de: null, desde: agora.toISOString() });
  });
});

describe('POST /chamados/:numero/desfazer', () => {
  it('logo depois, mesmo com uma nota no meio, volta o chamado à triagem, desde quando estava nela, sem aviso', async () => {
    const avisos = await c.notificacoesDo(1049);
    const assumido = await agiu(1049, 'assumir', 'ana');
    // Diego grava uma nota, que não sobe a versão e não impede o desfazer.
    await c.incluirConversa(1049, [
      { especie: 'nota', conta: 'diego', texto: 'A cadeira é da sala 3.', em: api.relogio.agora() },
    ]);
    api.relogio.avancar(MINUTO);
    const r = await agiu(1049, 'desfazer', 'ana', { versao: assumido.json().versao });
    expect(r.json()).toEqual({ numero: 1049, versao: 3, situacao: 'triagem', responsavel: null });
    expect(await c.lerChamado(1049)).toMatchObject({
      situacao: 'triagem',
      responsavelId: null,
      responsavelDesde: null,
      versao: 3,
    });
    expect(await ultimoEvento(1049)).toMatchObject({
      evento: 'desfez',
      autorConta: c.conta('ana'),
      dados: { para: null, desde: ABERTURA.toISOString() },
    });
    const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditado).toMatchObject({ acao: 'chamado.assumir-desfeito', alvoId: c.chamadoId(1049) });
    expect(auditado?.antes).toEqual({ situacao: 'em-atendimento', responsavel: 'Ana Souza' });
    expect(auditado?.depois).toEqual({ situacao: 'triagem' });
    expect(await c.eventosDo(1049)).toHaveLength(3);
    expect(await c.notificacoesDo(1049)).toEqual(avisos);

    // A triagem volta a contar da abertura: o próximo assumir guarda o desde dela.
    await agiu(1049, 'assumir', 'diego', { versao: 3 });
    expect((await ultimoEvento(1049))?.dados).toEqual({
      de: null,
      desde: ABERTURA.toISOString(),
    });
  });

  it('volta o chamado a quem estava com ele, desde quando estava', async () => {
    await comDiego(1050);
    await agiu(1050, 'assumir', 'ana', { versao: 2 });
    const r = await agiu(1050, 'desfazer', 'ana', { versao: 3 });
    expect(r.json()).toEqual({
      numero: 1050,
      versao: 4,
      situacao: 'em-atendimento',
      responsavel: { id: c.conta('diego'), nome: 'Diego Ramos' },
    });
    expect(await c.lerChamado(1050)).toMatchObject({
      responsavelId: c.conta('diego'),
      responsavelDesde: as('08:10'),
      versao: 4,
    });
    expect((await ultimoEvento(1050))?.dados).toEqual({
      para: c.conta('diego'),
      desde: as('08:10').toISOString(),
    });
  });

  it('para quem não atende mais, é recusado', async () => {
    await comDiego(1051);
    await agiu(1051, 'assumir', 'ana', { versao: 2 });
    await c.mudarConta('diego', 'inativa');
    try {
      const r = await agir(1051, 'desfazer', 'ana', { versao: 3 });
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json()).toMatchObject({
        type: CONFLITO,
        detail: 'Diego não atende os chamados de Jundiaí › Recepção.',
      });
    } finally {
      await c.mudarConta('diego', 'ativa');
      await c.entrar('diego');
    }
    expect(await c.lerChamado(1051)).toMatchObject({ responsavelId: c.conta('ana'), versao: 3 });
  });

  it('depois de outra ação, ou sem o assumir de quem desfaz, é recusado com o chamado-mudou', async () => {
    const mudou = { type: MUDOU, detail: 'O chamado mudou depois. Confira antes de desfazer.' };
    await agiu(1051, 'passar', 'ana', { para: c.conta('diego'), versao: 3 });
    // A versão do assumir de Ana não é mais a do chamado.
    const velho = await agir(1051, 'desfazer', 'ana', { versao: 3 });
    expect(velho.statusCode, velho.body).toBe(409);
    expect(velho.json()).toMatchObject(mudou);
    // Diego passa o chamado de volta a Ana: com a versão de agora, o último evento que sobe a
    // versão é o passar, e não um assumir dela.
    await agiu(1051, 'passar', 'diego', { para: c.conta('ana'), versao: 4 });
    const semAssumir = await agir(1051, 'desfazer', 'ana', { versao: 5 });
    expect(semAssumir.statusCode, semAssumir.body).toBe(409);
    expect(semAssumir.json()).toMatchObject(mudou);
    // O desfazer pede a versão.
    const semVersao = await agir(1051, 'desfazer', 'ana', {});
    expect(semVersao.statusCode, semVersao.body).toBe(400);
    expect(semVersao.json().campos).toEqual({ versao: 'Versão do chamado inválida.' });
    expect(await c.lerChamado(1051)).toMatchObject({ responsavelId: c.conta('ana'), versao: 5 });
  });
});

describe('a versão nas listas', () => {
  it('o quadro e os prazos levam a versão de cada chamado aberto, de onde a tela age', async () => {
    const fuso = `fuso=${encodeURIComponent('America/Sao_Paulo')}`;
    const numeros = Array.from({ length: 12 }, (_, i) => 1042 + i);
    const versoes: Record<string, number> = {};
    for (const numero of numeros) versoes[numero] = (await c.lerChamado(numero)).versao;
    expect(new Set(Object.values(versoes)).size).toBeGreaterThan(1);

    const quadro = await c.cliente.consultar(`/chamados/quadro?${fuso}`, c.como('ana'));
    expect(quadro.statusCode, quadro.body).toBe(200);
    expect(quadro.json().versoes).toEqual(versoes);
    const prazos = await c.cliente.consultar(`/chamados/prazos?${fuso}`, c.como('ana'));
    expect(prazos.statusCode, prazos.body).toBe(200);
    expect(
      Object.fromEntries(
        prazos
          .json()
          .chamados.map((chamado: { numero: number; versao: number }) => [
            chamado.numero,
            chamado.versao,
          ]),
      ),
    ).toEqual(versoes);
    // Bruno vê só os chamados de Campinas: nenhum destes.
    const deBruno = await c.cliente.consultar(`/chamados/quadro?${fuso}`, c.como('bruno'));
    expect(deBruno.json().versoes).toEqual({});
  });
});
