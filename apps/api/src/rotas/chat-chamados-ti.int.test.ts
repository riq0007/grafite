// O lado da TI dos chamados com o chat (spec chamados, "Conversa do chamado", "Pergunta com opções",
// "Cartão do ativo na mensagem", "Respostas prontas" e "Notificações dos chamados"; spec
// modulo-chamados, "Campo de escrever", "Conversa com a pessoa no chamado aberto" e "Chamado fechado
// na tela"; change chat-com-chamados, design, decisões 10, 13 e 15; tarefa 3.10): o cartão de um
// ativo que a conta não vê, na prévia e no envio; o "Abrir a conversa" da origem só a quem participa
// dela; as opções; as notificações a quem participa; as respostas prontas com as opções; e a ficha
// com o que vem do chat.
import { campos, chamados, mensagensDosChamados, naOrganizacao, notificacoes } from '@grafite/db';
import { and, asc, eq, like } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  criarAlerta,
  criarAtivoDoTipo,
  criarCampoDeIp,
  criarColetor,
  criarModelo,
  criarRegra,
  criarTipo,
  desligarModulos,
  gravarEstado,
} from '../../test/alertas.ts';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;
/** A impressora PAT-00137, sem local: só quem vê os ativos da organização inteira a vê. */
let pat137 = '';
let impressora = '';
let modelo = '';

interface CartaoLido {
  ativo: string;
  icone: string;
  tipo: string;
  nome: string;
  modelo: string | null;
  patrimonio: string | null;
  ip: string | null;
  disponibilidade: { situacao: string; texto: string } | null;
  suprimento: { descricao: string; percentual: number; critico: boolean } | null;
  em: string;
}

interface ItemDaFicha {
  especie: string;
  id: string;
  em: string;
  texto?: string;
  evento?: string;
  autor?: { tipo: string; nome: string };
  opcoes?: string[] | null;
  escolhida?: { opcao: string; por: string; em: string } | null;
  cartao?: (CartaoLido & { abrir: boolean }) | null;
  avaliacao?: { nivel: string; comentario: string | null } | null;
  resumo?: { atendeu: string; primeiraResposta: { tempo: string } | null } | null;
}

interface FichaLida {
  numero: number;
  situacao: string;
  fechado: boolean;
  reabrirAte: string | null;
  pessoa: { nome: string; usaOChat: boolean };
  origem: string;
  origemNoChat: {
    conversa: { tipo: string; nome: string };
    autor: string;
    texto: string;
    em: string;
    anexos: unknown[];
    abrir: { conversa: string; mensagem: string } | null;
  } | null;
  conversa: ItemDaFicha[];
  respostasProntas: { rotulo: string; texto: string; opcoes: string[] }[];
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T13:19:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-ti-${enderecos}.local`);
  await c.entrar();
  impressora = await criarTipo(api, c.org, { nome: 'Impressora' });
  modelo = await criarModelo(api, c.org, {
    tipoId: impressora,
    fabricante: 'HP',
    nome: 'LaserJet M428',
  });
  pat137 = await criarAtivoDoTipo(api, c.org, {
    tipoId: impressora,
    modeloId: modelo,
    nome: 'Impressora Financeiro',
    patrimonio: 'PAT-00137',
  });
});

const naOrg = <T>(fn: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, c.org, fn);

const daTi = (usuario: UsuarioDoChat, acao: string, numero: number, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chamados/${numero}/${acao}`, c.como(usuario), corpo);

const doChat = (usuario: UsuarioDoChat, acao: string, numero: number, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chat/chamados/${numero}/${acao}`, c.como(usuario), corpo);

const ficha = async (usuario: UsuarioDoChat, numero: number) => {
  const r = await c.cliente.consultar(`/chamados/${numero}`, c.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as FichaLida;
};

const previa = (usuario: UsuarioDoChat, numero: number, patrimonio: string) =>
  c.cliente.consultar(
    `/chamados/${numero}/cartao?patrimonio=${encodeURIComponent(patrimonio)}`,
    c.como(usuario),
  );

/** A prévia pelo id do ativo, como o "Cartão do ativo" e o "/ativo" sozinho a pedem. */
const previaPeloId = (usuario: UsuarioDoChat, numero: number, ativo: string) =>
  c.cliente.consultar(
    `/chamados/${numero}/cartao?ativo=${encodeURIComponent(ativo)}`,
    c.como(usuario),
  );

const conversaGravada = async (numero: number) =>
  naOrg((tx) =>
    tx
      .select({
        especie: mensagensDosChamados.especie,
        texto: mensagensDosChamados.texto,
        opcoes: mensagensDosChamados.opcoes,
        cartao: mensagensDosChamados.cartao,
      })
      .from(mensagensDosChamados)
      .innerJoin(chamados, eq(chamados.id, mensagensDosChamados.chamadoId))
      .where(eq(chamados.numero, numero))
      .orderBy(asc(mensagensDosChamados.criadaEm), asc(mensagensDosChamados.id)),
  );

/** As notificações dos chamados, pela conta, com o título e o destino. */
const notificacoesDoChamado = async (numero: number) =>
  naOrg((tx) =>
    tx
      .select({
        contaId: notificacoes.contaId,
        titulo: notificacoes.titulo,
        descricao: notificacoes.descricao,
        destino: notificacoes.destino,
        mensagem: notificacoes.mensagem,
      })
      .from(notificacoes)
      .where(and(eq(notificacoes.origem, 'Chamados'), like(notificacoes.destino, `%${numero}%`)))
      .orderBy(asc(notificacoes.criadaEm), asc(notificacoes.titulo)),
  );

/** Abre pelo chat, como o usuário, o chamado do tipo Outro da pessoa, da mensagem. */
async function abrirPeloChat(usuario: UsuarioDoChat, mensagem: string, pessoa: UsuarioDoChat) {
  const r = await c.cliente.enviar('POST', `/chat/mensagens/${mensagem}/chamado`, c.como(usuario), {
    tipo: c.tipos.Outro,
    titulo: 'A cadeira quebrou',
    pessoa: c.pessoa(pessoa),
  });
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { numero: number }).numero;
}

describe('a permissão', () => {
  it('o cartão de um ativo que a conta não vê é recusado na prévia e no envio', async () => {
    const numero = await c.abrirChamado('fernanda');

    // Ana atende a organização inteira, mas não tem `ativos.ver`.
    const daAna = await previa('ana', numero, 'PAT-00137');
    expect(daAna.statusCode).toBe(404);
    expect(daAna.json()).toMatchObject({ detail: 'O ativo não foi encontrado.' });
    for (const acao of ['mensagem', 'esperar', 'nota']) {
      const r = await daTi('ana', acao, numero, { texto: 'Veja a impressora.', cartao: pat137 });
      expect(r.statusCode, acao).toBe(400);
      expect(r.json().campos).toEqual({ cartao: 'O ativo não foi encontrado.' });
    }
    expect((await conversaGravada(numero)).map(({ especie }) => especie)).toEqual(['evento']);

    // Lívia vê todos os ativos: a prévia e o envio dão o mesmo retrato.
    const daLivia = await previa('livia', numero, ' pat-00137 ');
    expect(daLivia.statusCode, daLivia.body).toBe(200);
    expect(daLivia.json()).toEqual({
      ativo: pat137,
      icone: expect.any(String),
      tipo: 'Impressora',
      nome: 'Impressora Financeiro',
      modelo: 'HP LaserJet M428',
      patrimonio: 'PAT-00137',
      ip: null,
      disponibilidade: null,
      suprimento: null,
      em: '2026-11-17T13:19:00.000Z',
    });
    const enviada = await daTi('livia', 'mensagem', numero, {
      texto: 'É esta a impressora?',
      cartao: pat137,
    });
    expect(enviada.statusCode, enviada.body).toBe(200);
    const [, gravada] = await conversaGravada(numero);
    expect(gravada?.cartao).toEqual(daLivia.json());

    // Na ficha, "Abrir a ficha" só a quem vê o ativo; no chat, o cartão como foi mandado.
    expect((await ficha('livia', numero)).conversa.at(-1)?.cartao).toMatchObject({
      nome: 'Impressora Financeiro',
      abrir: true,
    });
    expect((await ficha('ana', numero)).conversa.at(-1)?.cartao).toMatchObject({
      nome: 'Impressora Financeiro',
      abrir: false,
    });
    const lido = await c.cliente.consultar(`/chat/chamados/${numero}`, c.como('fernanda'));
    expect(lido.statusCode, lido.body).toBe(200);
    expect((lido.json() as { conversa: ItemDaFicha[] }).conversa.at(-1)?.cartao).toEqual(
      daLivia.json(),
    );

    // O patrimônio que não existe, e o cartão que nem é um id.
    expect((await previa('livia', numero, 'PAT-00999')).statusCode).toBe(404);
    const torto = await daTi('livia', 'nota', numero, { texto: 'Esta.', cartao: 'PAT-00137' });
    expect(torto.statusCode).toBe(400);
    expect(torto.json().campos).toEqual({ cartao: 'O ativo não foi encontrado.' });
  });

  it('a prévia pelo id do ativo tem a mesma recusa e o mesmo retrato', async () => {
    const numero = await c.abrirChamado('fernanda');

    // Ana não tem `ativos.ver`: o ativo que ela não vê responde como o que não existe.
    const daAna = await previaPeloId('ana', numero, pat137);
    expect(daAna.statusCode).toBe(404);
    expect(daAna.json()).toMatchObject({ detail: 'O ativo não foi encontrado.' });

    const daLivia = await previaPeloId('livia', numero, pat137);
    expect(daLivia.statusCode, daLivia.body).toBe(200);
    expect(daLivia.json()).toEqual((await previa('livia', numero, 'PAT-00137')).json());

    // O id que não é de ativo nenhum, o que nem é um id, e a prévia sem o ativo e sem o patrimônio.
    const outro = await previaPeloId('livia', numero, '0199a6e0-0000-7000-8000-000000000999');
    expect(outro.statusCode).toBe(404);
    const torto = await previaPeloId('livia', numero, 'PAT-00137');
    expect(torto.statusCode).toBe(400);
    expect(torto.json().campos).toEqual({ ativo: 'O ativo não foi encontrado.' });
    const vazia = await c.cliente.consultar(`/chamados/${numero}/cartao`, c.como('livia'));
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json().campos).toEqual({ patrimonio: 'O ativo não foi encontrado.' });
  });

  it('o "Abrir a conversa" da origem vai só a quem participa da conversa', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const daEquipe = await abrirPeloChat(
      'paulo',
      await c.mensagem(equipe, 'paulo', 'A cadeira da sala 3 quebrou.'),
      'paulo',
    );
    const direta = await c.criarDireta('paulo', 'ana');
    const daDireta = await c.mensagem(direta, 'paulo', 'A cadeira da minha mesa quebrou.');
    const pelaDireta = await abrirPeloChat('paulo', daDireta, 'paulo');

    // Ana não é do Financeiro: lê a origem, sem "Abrir a conversa".
    expect((await ficha('ana', daEquipe)).origemNoChat).toEqual({
      conversa: { tipo: 'equipe', nome: 'Equipe Financeiro' },
      autor: 'Paulo Nunes',
      texto: 'A cadeira da sala 3 quebrou.',
      em: '2026-11-17T13:19:00.000Z',
      anexos: [],
      mensagens: [
        {
          autor: 'Paulo Nunes',
          texto: 'A cadeira da sala 3 quebrou.',
          em: '2026-11-17T13:19:00.000Z',
          anexos: [],
        },
      ],
      abrir: null,
    });
    // Na direta com Paulo, ela participa; a direta diz quem escreveu e com quem.
    expect((await ficha('ana', pelaDireta)).origemNoChat).toMatchObject({
      conversa: { tipo: 'direta', nome: 'Paulo Nunes com Ana Souza' },
      abrir: { conversa: direta, mensagem: daDireta },
    });
    // Lívia, que vê tudo e não participa de nenhuma das duas, não abre nenhuma.
    for (const numero of [daEquipe, pelaDireta]) {
      expect((await ficha('livia', numero)).origemNoChat?.abrir).toBeNull();
    }
    // Com o Chat desligado, ninguém abre a conversa.
    await desligarModulos(api, c.org, ['chat']);
    expect((await ficha('ana', pelaDireta)).origemNoChat?.abrir).toBeNull();
    // O chamado aberto pela TI não tem a origem no chat.
    expect((await ficha('ana', await c.abrirChamado('fernanda'))).origemNoChat).toBeNull();
  });
});

describe('as opções e o cartão', () => {
  it('a mensagem leva as opções; a sem pergunta e a nota gravam nulo', async () => {
    const numero = await c.abrirChamado('fernanda');
    const opcoes = ['  Pode ser ', 'Daqui a meia hora, por favor'];

    for (const [pedido, campos] of [
      [['Sim'], { opcoes: 'Use de 2 a 3 opções.' }],
      [['Sim', 'Não', 'Talvez', 'Nunca'], { opcoes: 'Use de 2 a 3 opções.' }],
      [['Sim', '  '], { opcoes: 'Escreva a opção.' }],
      [['Sim', 'x'.repeat(41)], { opcoes: 'Use até 40 caracteres.' }],
      [['Sim', 'sím'], { opcoes: 'As opções precisam ser diferentes.' }],
    ] as const) {
      const r = await daTi('ana', 'mensagem', numero, { texto: 'Passo aí?', opcoes: pedido });
      expect(r.statusCode, JSON.stringify(pedido)).toBe(400);
      expect(r.json().campos).toEqual(campos);
    }
    // O texto vazio recusa no texto, antes das opções.
    const vazio = await daTi('ana', 'mensagem', numero, { texto: ' ', opcoes: ['Sim'] });
    expect(vazio.json().campos).toEqual({ texto: expect.any(String) });
    expect(await conversaGravada(numero)).toHaveLength(1);

    for (const [acao, corpo] of [
      ['mensagem', { opcoes }],
      ['esperar', { opcoes }],
      ['nota', { opcoes }],
      ['mensagem', {}],
    ] as const) {
      const r = await daTi('ana', acao, numero, { texto: `A ${acao}.`, ...corpo });
      expect(r.statusCode, r.body).toBe(200);
    }
    const escritas = (await conversaGravada(numero)).filter(({ especie }) => especie !== 'evento');
    expect(escritas.map(({ especie, opcoes: gravadas }) => [especie, gravadas])).toEqual([
      ['mensagem', ['Pode ser', 'Daqui a meia hora, por favor']],
      ['mensagem', ['Pode ser', 'Daqui a meia hora, por favor']],
      ['nota', null],
      ['mensagem', null],
    ]);
    const naFicha = (await ficha('ana', numero)).conversa.filter(
      ({ especie }) => especie !== 'evento',
    );
    expect(naFicha.map(({ opcoes: lidas }) => lidas)).toEqual([
      ['Pode ser', 'Daqui a meia hora, por favor'],
      ['Pode ser', 'Daqui a meia hora, por favor'],
      null,
      null,
    ]);
  });

  it('o cartão copia o IP, a situação e o suprimento mais baixo, como estavam', async () => {
    const campoDoIp = await criarCampoDeIp(api, c.org);
    const deRede = await criarTipo(api, c.org, {
      nome: 'Impressora de rede',
      capacidades: ['rede.disponibilidade', 'snmp.suprimentos'],
      configuracao: {
        'rede.disponibilidade': { campoDoIp },
        'snmp.suprimentos': { campoDoIp, versao: '1', segredoId: null },
      },
    });
    const pat140 = await criarAtivoDoTipo(api, c.org, {
      tipoId: deRede,
      modeloId: await criarModelo(api, c.org, { tipoId: deRede, nome: 'LaserJet M404' }),
      patrimonio: 'PAT-00140',
      valores: { [campoDoIp]: '10.0.0.37' },
    });
    const coletorId = await criarColetor(api, c.org);
    const lidaEm = new Date(api.relogio.agora().getTime() - 5 * MINUTO);
    await gravarEstado(api, c.org, {
      ativoId: pat140,
      coletorId,
      metrica: 'rede.disponibilidade',
      momento: lidaEm,
      valorTexto: 'online',
    });
    for (const [item, descricao, nivel] of [
      ['1', 'Black Toner', 6],
      ['2', 'Cyan Toner', 40],
    ] as const) {
      await gravarEstado(api, c.org, {
        ativoId: pat140,
        coletorId,
        metrica: 'impressora.suprimento',
        item,
        momento: lidaEm,
        valorNumero: nivel,
        detalhes: { descricao },
      });
    }
    const numero = await c.abrirChamado('fernanda');

    const semAlerta = (await previa('livia', numero, 'PAT-00140')).json() as CartaoLido;
    expect(semAlerta).toMatchObject({
      nome: 'HP LaserJet M404',
      modelo: 'HP LaserJet M404',
      ip: '10.0.0.37',
      disponibilidade: { situacao: 'online', texto: 'Online' },
      suprimento: { percentual: 6, critico: false },
    });

    const doToner = await criarRegra(api, c.org, {
      nome: 'Toner baixo',
      condicao: 'toner.nivel',
      parametros: { limite: 10, folga: 5 },
      duracao: 0,
      severidade: 'critico',
      escopo: { tipo: 'organizacao', id: null },
      excecoes: [],
    } as Parameters<typeof criarRegra>[2]);
    await criarAlerta(api, c.org, { regraId: doToner, ativoId: pat140, item: '1' });
    const enviada = await daTi('livia', 'mensagem', numero, { texto: 'Esta?', cartao: pat140 });
    expect(enviada.statusCode, enviada.body).toBe(200);
    const comAlerta = (await conversaGravada(numero)).at(-1)?.cartao as unknown as CartaoLido;
    expect(comAlerta.suprimento).toEqual({
      descricao: semAlerta.suprimento?.descricao,
      percentual: 6,
      critico: true,
    });

    // O cartão fica como foi mandado: a impressora que cai depois não muda a mensagem.
    await gravarEstado(api, c.org, {
      ativoId: pat140,
      coletorId,
      metrica: 'rede.disponibilidade',
      momento: new Date(lidaEm.getTime() + DIA),
      valorTexto: 'offline',
    });
    expect((await previa('livia', numero, 'PAT-00140')).json()).toMatchObject({
      disponibilidade: { situacao: 'offline', texto: 'Offline' },
    });
    expect((await ficha('livia', numero)).conversa.at(-1)?.cartao).toMatchObject({
      disponibilidade: { situacao: 'online', texto: 'Online' },
      em: '2026-11-17T13:19:00.000Z',
    });
  });

  it('o IP de um campo restrito não entra no cartão, nem pela mão de quem vê os restritos', async () => {
    // Pontos da revisão da tarefa 3.10: o cartão vai a quem participa e a quem vê o chamado sem a
    // permissão dos restritos.
    const restrito = await naOrg(async (tx) => {
      const [campo] = await tx
        .insert(campos)
        .values({
          orgId: c.org,
          rotulo: 'IP da gerência',
          rotuloNormalizado: 'ip da gerencia',
          tipo: 'ip',
          restrito: true,
        })
        .returning({ id: campos.id });
      return campo?.id ?? '';
    });
    const daGerencia = await criarTipo(api, c.org, {
      nome: 'Impressora da gerência',
      capacidades: ['rede.disponibilidade'],
      configuracao: { 'rede.disponibilidade': { campoDoIp: restrito } },
    });
    const pat150 = await criarAtivoDoTipo(api, c.org, {
      tipoId: daGerencia,
      patrimonio: 'PAT-00150',
      valores: { [restrito]: '10.0.0.50' },
    });
    const numero = await c.abrirChamado('fernanda');

    // Lívia, administradora, vê os restritos: a prévia mostra o que vai, sem o IP.
    const daLivia = await previa('livia', numero, 'PAT-00150');
    expect(daLivia.statusCode, daLivia.body).toBe(200);
    expect(daLivia.json()).toMatchObject({ patrimonio: 'PAT-00150', ip: null });

    // A nota leva o cartão, como a mensagem, e fica fora da leitura de quem participa.
    for (const acao of ['mensagem', 'nota']) {
      const r = await daTi('livia', acao, numero, { texto: `O ${acao}.`, cartao: pat150 });
      expect(r.statusCode, r.body).toBe(200);
    }
    const gravadas = (await conversaGravada(numero)).filter(({ especie }) => especie !== 'evento');
    expect(gravadas.map(({ especie, cartao }) => [especie, cartao?.ip])).toEqual([
      ['mensagem', null],
      ['nota', null],
    ]);
    expect((await ficha('ana', numero)).conversa.at(-1)).toMatchObject({
      especie: 'nota',
      cartao: { patrimonio: 'PAT-00150', ip: null, abrir: false },
    });
    const lido = await c.cliente.consultar(`/chat/chamados/${numero}`, c.como('fernanda'));
    expect(lido.statusCode, lido.body).toBe(200);
    const doChat = (lido.json() as { conversa: ItemDaFicha[] }).conversa.filter(
      ({ especie }) => especie !== 'evento',
    );
    expect(doChat.map(({ texto }) => texto)).toEqual(['O mensagem.']);
  });
});

describe('as notificações a quem participa', () => {
  it('a mensagem da TI e o resolvido vão à pessoa e a quem abriu pelo chat, fora o autor', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    // Paulo abre pelo chat o chamado de Tatiana.
    const numero = await abrirPeloChat(
      'paulo',
      await c.mensagem(equipe, 'paulo', 'A cadeira da Tatiana quebrou.'),
      'tatiana',
    );
    const antes = (await notificacoesDoChamado(numero)).length;

    expect((await daTi('ana', 'assumir', numero)).statusCode).toBe(200);
    expect((await daTi('ana', 'nota', numero, { texto: 'Só da TI.' })).statusCode).toBe(200);
    expect((await notificacoesDoChamado(numero)).length).toBe(antes);

    const r = await daTi('ana', 'mensagem', numero, { texto: 'Passo aí às 14h.' });
    expect(r.statusCode, r.body).toBe(200);
    const todas = await notificacoesDoChamado(numero);
    expect(todas).toHaveLength(antes + 2);
    const respondeu = todas.filter(({ titulo }) => titulo.includes('respondeu'));
    expect(respondeu).toHaveLength(2);
    for (const notificacao of respondeu) {
      expect(notificacao).toMatchObject({
        titulo: `Ana Souza respondeu o #${numero}`,
        descricao: 'Passo aí às 14h.',
        destino: expect.stringContaining(`${numero}`),
        mensagem: true,
      });
    }
    expect(new Set(respondeu.map(({ contaId }) => contaId))).toEqual(
      new Set([c.conta('paulo'), c.conta('tatiana')]),
    );

    const resolvido = await daTi('ana', 'resolver', numero, { feito: 'Troquei a cadeira.' });
    expect(resolvido.statusCode, resolvido.body).toBe(200);
    const depois = await notificacoesDoChamado(numero);
    expect(depois).toHaveLength(antes + 4);
    const doResolvido = depois.filter(({ titulo }) => titulo.includes('resolvido'));
    expect(doResolvido.map(({ titulo }) => titulo)).toEqual([
      `#${numero} resolvido: A cadeira quebrou`,
      `#${numero} resolvido: A cadeira quebrou`,
    ]);
    expect(new Set(doResolvido.map(({ contaId }) => contaId))).toEqual(
      new Set([c.conta('paulo'), c.conta('tatiana')]),
    );
  });

  it('a pessoa que não usa o chat e o Chat desligado não recebem nada', async () => {
    // Rita não usa o chat.
    const daRita = await c.abrirChamado('rita');
    expect((await daTi('ana', 'mensagem', daRita, { texto: 'Oi, Rita.' })).statusCode).toBe(200);
    expect(await notificacoesDoChamado(daRita)).toEqual([]);

    // Ana é a pessoa do chamado: ela não se notifica.
    const daAna = await c.abrirChamado('ana');
    expect((await daTi('ana', 'mensagem', daAna, { texto: 'Anotado.' })).statusCode).toBe(200);
    expect(await notificacoesDoChamado(daAna)).toEqual([]);

    await desligarModulos(api, c.org, ['chat']);
    const daFernanda = await c.abrirChamado('fernanda');
    const r = await daTi('ana', 'mensagem', daFernanda, { texto: 'Oi, Fernanda.' });
    expect(r.statusCode).toBe(200);
    expect(await notificacoesDoChamado(daFernanda)).toEqual([]);
  });
});

describe('as respostas prontas com as opções', () => {
  it('o cadastro confere e guarda as opções, e a ficha as traz', async () => {
    const criar = (corpo: object) =>
      c.cliente.enviar('POST', '/chamados/respostas-prontas', c.como('livia'), {
        rotulo: 'Passo aí',
        texto: 'Passo aí em 10 minutos, {nome}. Pode ser?',
        esperaAResposta: false,
        tipos: [],
        ...corpo,
      });
    const recusada = await criar({ opcoes: ['Pode ser', 'pode ser'] });
    expect(recusada.statusCode).toBe(400);
    expect(recusada.json().campos).toEqual({ opcoes: 'As opções precisam ser diferentes.' });

    const criada = await criar({
      opcoes: ['Pode ser', ' Daqui a meia hora, por favor ', 'Estou em reunião, volte às 14h'],
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const opcoes = ['Pode ser', 'Daqui a meia hora, por favor', 'Estou em reunião, volte às 14h'];
    expect(criada.json()).toMatchObject({ rotulo: 'Passo aí', opcoes });
    const semOpcoes = await criar({ rotulo: 'Bom dia' });
    expect(semOpcoes.json()).toMatchObject({ opcoes: [] });

    const lista = await c.cliente.consultar('/chamados/respostas-prontas', c.como('livia'));
    expect(
      (lista.json() as { respostas: { rotulo: string; opcoes: string[] }[] }).respostas.map(
        ({ rotulo, opcoes: dela }) => [rotulo, dela],
      ),
    ).toEqual([
      ['Passo aí', opcoes],
      ['Bom dia', []],
    ]);
    const naFicha = (await ficha('ana', await c.abrirChamado('fernanda'))).respostasProntas;
    expect(naFicha.map(({ rotulo, texto, opcoes: dela }) => [rotulo, texto, dela])).toEqual([
      ['Passo aí', 'Passo aí em 10 minutos, Fernanda. Pode ser?', opcoes],
      ['Bom dia', 'Passo aí em 10 minutos, Fernanda. Pode ser?', []],
    ]);

    // A alteração que só muda as opções grava, com a auditoria.
    const id = (criada.json() as { id: string }).id;
    const alterada = await c.cliente.enviar(
      'PUT',
      `/chamados/respostas-prontas/${id}`,
      c.como('livia'),
      {
        rotulo: 'Passo aí',
        texto: 'Passo aí em 10 minutos, {nome}. Pode ser?',
        esperaAResposta: false,
        tipos: [],
        opcoes: [],
      },
    );
    expect(alterada.statusCode, alterada.body).toBe(200);
    expect(alterada.json()).toMatchObject({ opcoes: [] });
  });
});

describe('a ficha com o que vem do chat', () => {
  it('as mensagens de quem participa, a escolha, o resumo, a avaliação e o Fechado', async () => {
    const numero = await c.abrirChamado('fernanda');
    const naFicha = await ficha('ana', numero);
    expect(naFicha.pessoa.usaOChat).toBe(true);
    expect(naFicha).toMatchObject({ fechado: false, reabrirAte: null });
    expect((await ficha('ana', await c.abrirChamado('rita'))).pessoa.usaOChat).toBe(false);

    api.relogio.avancar(10 * MINUTO);
    const pergunta = await daTi('ana', 'mensagem', numero, {
      texto: 'Passo aí às 14h?',
      opcoes: ['Pode ser', 'Mais tarde'],
    });
    expect(pergunta.statusCode, pergunta.body).toBe(200);
    const [perguntaId] = (await ficha('ana', numero)).conversa
      .filter(({ especie }) => especie === 'mensagem')
      .map(({ id }) => id);
    api.relogio.avancar(MINUTO);
    const escolheu = await doChat('fernanda', 'escolha', numero, {
      mensagem: perguntaId,
      opcao: 'Pode ser',
    });
    expect(escolheu.statusCode, escolheu.body).toBe(200);
    const respondeu = await doChat('fernanda', 'mensagens', numero, { texto: 'Estou na sala 3.' });
    expect(respondeu.statusCode, respondeu.body).toBe(200);
    api.relogio.avancar(MINUTO);
    expect((await daTi('ana', 'resolver', numero, { feito: 'Troquei.' })).statusCode).toBe(200);
    const avaliou = await doChat('fernanda', 'avaliacao', numero, {
      nivel: 'otimo',
      comentario: 'Rápido.',
    });
    expect(avaliou.statusCode, avaliou.body).toBe(200);

    const lida = await ficha('ana', numero);
    expect(lida).toMatchObject({ situacao: 'resolvido', fechado: false, reabrirAte: '2026-11-24' });
    const resumo = lida.conversa.map((item) => [
      item.especie,
      item.evento ?? item.texto,
      item.autor?.tipo,
    ]);
    expect(resumo).toEqual([
      ['evento', 'abertura', 'conta'],
      ['mensagem', 'Passo aí às 14h?', 'conta'],
      ['mensagem', 'Estou na sala 3.', 'pessoa'],
      ['mensagem', 'Troquei.', 'conta'],
      ['evento', 'resolveu', 'conta'],
      ['evento', 'avaliou', 'conta'],
    ]);
    const daPergunta = lida.conversa.find(({ id }) => id === perguntaId);
    expect(daPergunta).toMatchObject({
      opcoes: ['Pode ser', 'Mais tarde'],
      escolhida: { opcao: 'Pode ser', por: 'Fernanda Rocha', em: '2026-11-17T13:30:00.000Z' },
    });
    expect(lida.conversa.find(({ evento }) => evento === 'resolveu')?.resumo).toMatchObject({
      atendeu: 'Ana Souza',
      primeiraResposta: { tempo: '10 min' },
    });
    expect(lida.conversa.find(({ evento }) => evento === 'avaliou')).toMatchObject({
      autor: { tipo: 'conta', nome: 'Fernanda Rocha' },
      avaliacao: { nivel: 'otimo', comentario: 'Rápido.' },
    });

    // Passado o prazo de reabrir, o resolvido é o Fechado.
    api.relogio.avancar(8 * DIA);
    await c.entrar('ana');
    expect(await ficha('ana', numero)).toMatchObject({ fechado: true, reabrirAte: '2026-11-24' });
    api.relogio.avancar(-8 * DIA - 12 * MINUTO);
  });
});
