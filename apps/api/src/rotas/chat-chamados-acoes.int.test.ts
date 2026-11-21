// As ações de quem participa do chamado, pelo chat (spec chamados, "Resposta da pessoa", "Pergunta
// com opções", "Avaliação do atendimento", "Resposta nova" e "Fechamento do chamado"; change
// chat-com-chamados, design, decisões 5, 9 e 15; tarefa 3.9): quem não participa e o fechado
// recusados; a resposta, com o anexo, a que retoma e a que reabre, com a auditoria e a notificação a
// quem atende; a escolha, também ao mesmo tempo; a avaliação de cada resolução; e a marcação como
// vista, com a mensagem da TI que espera a trava dela. As recusas de cada célula são do domínio; aqui
// fica um caso de cada ligação.
import {
  auditoria,
  chamados,
  leiturasDosChamados,
  mensagensDosChamados,
  naOrganizacao,
  notificacoes,
} from '@grafite/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio, esperarNaTrava } from '../../test/integracao.ts';

const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);
const MINUTO = 60_000;

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

interface ItemLido {
  especie: string;
  id: string;
  texto?: string;
  evento?: string;
  frase?: string;
  autor?: { nome: string; daTi: boolean; minha: boolean };
  anexos?: { id: string }[];
  escolhida?: { opcao: string; por: string; minha: boolean } | null;
}

interface ChamadoLido {
  numero: number;
  situacao: string;
  fechado: boolean;
  atende: { nome: string } | null;
  conversa: ItemLido[];
  respostaNova: { quantas: number; desde: string | null };
  avaliacao: { nivel: string; minha: boolean } | null;
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T13:19:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-acoes-${enderecos}.local`);
  await c.entrar();
});

const naOrg = <T>(fn: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, c.org, fn);

const daTi = (acao: string, numero: number, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chamados/${numero}/${acao}`, c.como('ana'), corpo);

const agir = (usuario: UsuarioDoChat, numero: number, acao: string, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chat/chamados/${numero}/${acao}`, c.como(usuario), corpo);

/** A ação aceita, com a conversa depois dela, como a rota a devolve. */
async function agiu(usuario: UsuarioDoChat, numero: number, acao: string, corpo: object = {}) {
  const r = await agir(usuario, numero, acao, corpo);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as ChamadoLido;
}

const ler = async (usuario: UsuarioDoChat, numero: number) => {
  const r = await c.cliente.consultar(`/chat/chamados/${numero}`, c.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as ChamadoLido;
};

const avancar = (minutos: number) => api.relogio.avancar(minutos * MINUTO);

const linhaDo = async (numero: number) => {
  const [linha] = await naOrg((tx) =>
    tx
      .select({
        id: chamados.id,
        situacao: chamados.situacao,
        responsavel: chamados.responsavelId,
        versao: chamados.versao,
        relogioDesde: chamados.relogioDesde,
      })
      .from(chamados)
      .where(eq(chamados.numero, numero)),
  );
  if (!linha) throw new Error(`O chamado #${numero} não existe.`);
  return linha;
};

const notificacoesDa = (usuario: UsuarioDoChat) =>
  naOrg((tx) =>
    tx
      .select({
        titulo: notificacoes.titulo,
        descricao: notificacoes.descricao,
        destino: notificacoes.destino,
        mensagem: notificacoes.mensagem,
        assunto: notificacoes.assunto,
        lidaEm: notificacoes.lidaEm,
      })
      .from(notificacoes)
      .where(eq(notificacoes.contaId, c.conta(usuario)))
      .orderBy(asc(notificacoes.criadaEm), asc(notificacoes.id)),
  );

const naAuditoria = (acao: string, chamadoId: string) =>
  naOrg((tx) =>
    tx
      .select({
        ator: auditoria.atorContaId,
        antes: auditoria.antes,
        depois: auditoria.depois,
      })
      .from(auditoria)
      .where(and(eq(auditoria.acao, acao), eq(auditoria.alvoId, chamadoId))),
  );

/** A pergunta da Ana, com as opções, direto no banco, como a 3.10 a manda. */
const pergunta = (numero: number, texto = 'Posso reiniciar agora?') =>
  c.mensagemDaTi(numero, texto, { opcoes: ['Pode', 'Agora não'] });

/** Trava o chamado numa conexão à parte, até a volta, para as ações esperarem a trava. */
async function segurarOChamado(numero: number) {
  let preso: () => void = () => {};
  const travado = new Promise<void>((resolve) => {
    preso = resolve;
  });
  let soltar: () => void = () => {};
  const solto = new Promise<void>((resolve) => {
    soltar = resolve;
  });
  const segurando = naOrg(async (tx) => {
    await tx
      .select({ id: chamados.id })
      .from(chamados)
      .where(eq(chamados.numero, numero))
      .for('update');
    preso();
    await solto;
  });
  await travado;
  return async () => {
    soltar();
    await segurando;
  };
}

describe('a permissão', () => {
  it('quem não participa recebe o chamado como inexistente, e quem não usa o chat é recusado', async () => {
    const numero = await c.abrirChamado('fernanda');
    const daPergunta = await pergunta(numero);
    const pedidos = [
      ['mensagens', { texto: 'É a sala 3.' }],
      ['escolha', { mensagem: daPergunta, opcao: 'Pode' }],
      ['reabertura', {}],
      ['avaliacao', { nivel: 'otimo' }],
      ['vista', {}],
    ] as const;
    const antes = await linhaDo(numero);

    // Paulo não participa; Ana atende e vê o chamado, mas não é a pessoa nem o abriu pelo chat.
    for (const usuario of ['paulo', 'ana'] as const) {
      for (const [acao, corpo] of pedidos) {
        const r = await agir(usuario, numero, acao, corpo);
        expect(r.statusCode, `${usuario} ${acao}`).toBe(404);
        expect(r.json()).toMatchObject({ detail: 'Chamado não encontrado.' });
      }
    }
    for (const [acao, corpo] of pedidos) {
      expect((await agir('rita', numero, acao, corpo)).statusCode, acao).toBe(403);
    }

    expect(await linhaDo(numero)).toEqual(antes);
    const lido = await ler('fernanda', numero);
    expect(lido.conversa.map(({ especie }) => especie)).toEqual(['evento', 'mensagem']);
    expect(lido.conversa[1]?.escolhida).toBeNull();
    expect(lido.respostaNova.quantas).toBe(1);
    const leituras = await naOrg((tx) =>
      tx.select({ conta: leiturasDosChamados.contaId }).from(leiturasDosChamados),
    );
    expect(leituras).toEqual([]);
  });

  it('o fechado recusa a mensagem, a escolha, o "Reabrir" e a avaliação, e a marcação como vista vale', async () => {
    const numero = await c.abrirChamado('fernanda');
    const daPergunta = await pergunta(numero);
    expect((await daTi('resolver', numero, { feito: 'Troquei a cadeira.' })).statusCode).toBe(200);
    await naOrg((tx) =>
      tx
        .update(chamados)
        .set({ fechadoEm: new Date(api.relogio.agora().getTime() + MINUTO) })
        .where(eq(chamados.numero, numero)),
    );
    const antes = await linhaDo(numero);
    const conversaAntes = (await ler('fernanda', numero)).conversa;

    // A célula recusa antes do conteúdo: a mensagem vazia recusa pelo fechado.
    for (const [acao, corpo] of [
      ['mensagens', { texto: 'Voltou a quebrar.' }],
      ['mensagens', { texto: '' }],
      ['escolha', { mensagem: daPergunta, opcao: 'Pode' }],
      ['reabertura', {}],
      ['avaliacao', { nivel: 'otimo' }],
    ] as const) {
      const r = await agir('fernanda', numero, acao, corpo);
      expect(r.statusCode, acao).toBe(409);
      expect(r.json()).toMatchObject({
        detail: `O chamado #${numero} está fechado. Para o mesmo problema, abra outro chamado.`,
      });
    }
    const vista = await agiu('fernanda', numero, 'vista');
    expect(vista).toMatchObject({ situacao: 'resolvido', fechado: true });

    expect(await linhaDo(numero)).toEqual(antes);
    expect((await ler('fernanda', numero)).conversa).toEqual(conversaAntes);
  });
});

describe('a resposta', () => {
  it('a mensagem com o anexo entra na conversa, e a do aguardando retoma o chamado, com a auditoria e a notificação a quem atende', async () => {
    const numero = await c.abrirChamado('fernanda');
    const enviado = await c.cliente.enviarBytes(
      'POST',
      `/chamados/anexos?nome=${encodeURIComponent('foto da cadeira.pdf')}`,
      c.como('fernanda'),
      PDF('foto da cadeira'),
    );
    expect(enviado.statusCode, enviado.body).toBe(201);
    const anexo = (enviado.json() as { id: string }).id;
    const antes = await linhaDo(numero);

    const respondido = await agiu('fernanda', numero, 'mensagens', {
      texto: '  É a sala 3.  ',
      anexos: [anexo],
    });
    expect(respondido).toMatchObject({ situacao: 'em-atendimento', atende: { nome: 'Ana Souza' } });
    expect(respondido.conversa.at(-1)).toMatchObject({
      especie: 'mensagem',
      texto: 'É a sala 3.',
      autor: { nome: 'Fernanda Rocha', daTi: false, minha: true },
      anexos: [{ id: anexo }],
    });
    // Nada muda no chamado: a versão fica.
    expect((await linhaDo(numero)).versao).toBe(antes.versao);
    expect(await notificacoesDa('ana')).toEqual([
      {
        titulo: `Fernanda Rocha respondeu o #${numero}`,
        descricao: 'É a sala 3.',
        destino: `/chamados/${numero}`,
        mensagem: true,
        assunto: `chamado:${antes.id}`,
        lidaEm: null,
      },
    ]);

    // As recusas do conteúdo vão no campo.
    const vazia = await agir('fernanda', numero, 'mensagens', { texto: '   ' });
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json().campos).toEqual({ texto: 'Escreva a mensagem.' });
    const muitos = await agir('fernanda', numero, 'mensagens', {
      texto: 'As fotos.',
      anexos: Array.from({ length: 6 }, () => anexo),
    });
    expect(muitos.statusCode).toBe(400);
    expect(muitos.json().campos).toEqual({ anexos: 'Anexe até 5 arquivos.' });

    expect((await daTi('esperar', numero, { texto: 'Qual é o andar?' })).statusCode).toBe(200);
    avancar(10);
    const aguardando = await linhaDo(numero);
    expect(aguardando).toMatchObject({ situacao: 'aguardando', relogioDesde: null });

    const retomado = await agiu('fernanda', numero, 'mensagens', { texto: 'Segundo andar.' });
    expect(retomado).toMatchObject({ situacao: 'em-atendimento', atende: { nome: 'Ana Souza' } });
    expect(
      retomado.conversa.slice(-2).map(({ especie, texto, frase }) => frase ?? texto ?? especie),
    ).toEqual(['Segundo andar.', 'O atendimento continua']);
    expect(await linhaDo(numero)).toMatchObject({
      situacao: 'em-atendimento',
      responsavel: c.conta('ana'),
      versao: aguardando.versao + 1,
      relogioDesde: api.relogio.agora(),
    });
    expect(await naAuditoria('chamado.retomado', antes.id)).toEqual([
      {
        ator: c.conta('fernanda'),
        antes: { situacao: 'aguardando', responsavel: 'Ana Souza' },
        depois: { situacao: 'em-atendimento', responsavel: 'Ana Souza' },
      },
    ]);
    expect((await notificacoesDa('ana')).map(({ titulo }) => titulo)).toEqual([
      `Fernanda Rocha respondeu o #${numero}`,
      `Fernanda Rocha respondeu o #${numero}`,
    ]);
  });

  it('a mensagem no resolvido o reabre com quem resolveu, e o "Reabrir" fora do resolvido é recusado', async () => {
    const numero = await c.abrirChamado('fernanda');
    const { id } = await linhaDo(numero);
    const foraDoResolvido = await agir('fernanda', numero, 'reabertura');
    expect(foraDoResolvido.statusCode).toBe(409);
    expect(foraDoResolvido.json()).toMatchObject({
      detail: `O chamado #${numero} não está resolvido.`,
    });

    expect((await daTi('resolver', numero, { feito: 'Troquei a cadeira.' })).statusCode).toBe(200);
    avancar(30);
    const reaberto = await agiu('fernanda', numero, 'mensagens', { texto: 'Voltou a quebrar.' });
    expect(reaberto).toMatchObject({ situacao: 'em-atendimento', atende: { nome: 'Ana Souza' } });
    expect(
      reaberto.conversa.slice(-2).map(({ especie, texto, frase }) => frase ?? texto ?? especie),
    ).toEqual(['Voltou a quebrar.', 'Você reabriu o chamado']);
    expect(await naAuditoria('chamado.reaberto', id)).toEqual([
      {
        ator: c.conta('fernanda'),
        antes: { situacao: 'resolvido', responsavel: 'Ana Souza' },
        depois: { situacao: 'em-atendimento', responsavel: 'Ana Souza' },
      },
    ]);
    // A mensagem que reabre notifica só o "com você", a quem resolveu.
    const daAna = await notificacoesDa('ana');
    expect(daAna).toHaveLength(1);
    expect(daAna[0]?.titulo).toMatch(new RegExp(`^Chamado #${numero} com você`));

    expect(
      (await daTi('resolver', numero, { feito: 'Troquei a cadeira de novo.' })).statusCode,
    ).toBe(200);
    avancar(5);
    const peloBotao = await agiu('fernanda', numero, 'reabertura');
    expect(peloBotao).toMatchObject({ situacao: 'em-atendimento', atende: { nome: 'Ana Souza' } });
    expect(peloBotao.conversa.at(-1)).toMatchObject({ frase: 'Você reabriu o chamado' });
    expect(await naAuditoria('chamado.reaberto', id)).toHaveLength(2);
  });
});

describe('a escolha', () => {
  it('fica na pergunta, a segunda é recusada, a opção de fora também, e o resolvido pede para escrever', async () => {
    const numero = await c.abrirChamado('fernanda');
    const daPergunta = await pergunta(numero);
    const outra = await pergunta(numero, 'Prefere a troca amanhã?');

    const deFora = await agir('fernanda', numero, 'escolha', {
      mensagem: daPergunta,
      opcao: 'Pode reiniciar',
    });
    expect(deFora.statusCode).toBe(400);
    expect(deFora.json().campos).toEqual({ opcao: 'Escolha uma opção da pergunta.' });

    // O id do pedido em maiúsculas: a chave da escolha é o id como o banco o devolve.
    const escolhida = await agiu('fernanda', numero, 'escolha', {
      mensagem: daPergunta.toUpperCase(),
      opcao: 'Pode',
    });
    expect(escolhida.conversa.find(({ id }) => id === daPergunta)?.escolhida).toMatchObject({
      opcao: 'Pode',
      por: 'Fernanda Rocha',
      minha: true,
    });
    const gravadas = await naOrg((tx) =>
      tx
        .select({ dados: mensagensDosChamados.dados, autor: mensagensDosChamados.autorConta })
        .from(mensagensDosChamados)
        .where(eq(mensagensDosChamados.evento, 'escolheu')),
    );
    expect(gravadas).toEqual([
      { dados: { mensagem: daPergunta, opcao: 'Pode' }, autor: c.conta('fernanda') },
    ]);
    expect(await notificacoesDa('ana')).toMatchObject([
      { titulo: `Fernanda Rocha respondeu o #${numero}`, descricao: 'Pode', mensagem: true },
    ]);

    const deNovo = await agir('fernanda', numero, 'escolha', {
      mensagem: daPergunta,
      opcao: 'Agora não',
    });
    expect(deNovo.statusCode).toBe(409);
    expect(deNovo.json()).toMatchObject({ detail: 'Esta pergunta já foi respondida.' });

    expect((await daTi('resolver', numero, { feito: 'Reiniciei.' })).statusCode).toBe(200);
    const noResolvido = await agir('fernanda', numero, 'escolha', {
      mensagem: outra,
      opcao: 'Pode',
    });
    expect(noResolvido.statusCode).toBe(409);
    expect(noResolvido.json()).toMatchObject({
      detail: `O chamado #${numero} está resolvido. Escreva para reabrir.`,
    });
  });

  it('duas escolhas ao mesmo tempo: a primeira vence, e a outra é recusada', async () => {
    const numero = await c.abrirChamado('fernanda');
    const daPergunta = await pergunta(numero);
    const soltar = await segurarOChamado(numero);
    const pode = agir('fernanda', numero, 'escolha', { mensagem: daPergunta, opcao: 'Pode' });
    const agoraNao = agir('fernanda', numero, 'escolha', {
      mensagem: daPergunta,
      opcao: 'Agora não',
    });
    await esperarNaTrava(api, 2);
    await soltar();
    const respostas = [await pode, await agoraNao];
    expect(respostas.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
    expect(respostas.find(({ statusCode }) => statusCode === 409)?.json()).toMatchObject({
      detail: 'Esta pergunta já foi respondida.',
    });
    const escolhas = await naOrg((tx) =>
      tx
        .select({ id: mensagensDosChamados.id })
        .from(mensagensDosChamados)
        .where(eq(mensagensDosChamados.evento, 'escolheu')),
    );
    expect(escolhas).toHaveLength(1);
  });
});

describe('a avaliação', () => {
  it('avalia uma vez por resolução, e o reaberto e resolvido de novo pede outra', async () => {
    const numero = await c.abrirChamado('fernanda');
    const semResolver = await agir('fernanda', numero, 'avaliacao', { nivel: 'otimo' });
    expect(semResolver.statusCode).toBe(409);
    expect(semResolver.json()).toMatchObject({ detail: 'O chamado não está resolvido.' });

    expect((await daTi('resolver', numero, { feito: 'Troquei a cadeira.' })).statusCode).toBe(200);
    expect((await ler('fernanda', numero)).avaliacao).toBeNull();
    const semNivel = await agir('fernanda', numero, 'avaliacao', {});
    expect(semNivel.statusCode).toBe(400);
    expect(semNivel.json().campos).toEqual({ nivel: 'Escolha um nível.' });
    const longo = await agir('fernanda', numero, 'avaliacao', {
      nivel: 'otimo',
      comentario: 'a'.repeat(501),
    });
    expect(longo.statusCode).toBe(400);
    expect(longo.json().campos).toEqual({ comentario: 'Use até 500 caracteres.' });

    avancar(2);
    const avaliado = await agiu('fernanda', numero, 'avaliacao', {
      nivel: 'otimo',
      comentario: 'Foi rápido.',
    });
    expect(avaliado).toMatchObject({
      situacao: 'resolvido',
      avaliacao: { nivel: 'otimo', minha: true },
    });
    const evento = avaliado.conversa.at(-1);
    expect(evento).toMatchObject({
      especie: 'evento',
      evento: 'avaliou',
      frase: 'Você avaliou: Ótimo · Resolveu muito bem',
    });
    // A avaliação move a marcação como vista até a última linha.
    const [leitura] = await naOrg((tx) =>
      tx
        .select({ vistaAte: leiturasDosChamados.vistaAte })
        .from(leiturasDosChamados)
        .where(eq(leiturasDosChamados.contaId, c.conta('fernanda'))),
    );
    expect(leitura?.vistaAte).toBe(evento?.id);

    const deNovo = await agir('fernanda', numero, 'avaliacao', { nivel: 'ruim' });
    expect(deNovo.statusCode).toBe(409);
    expect(deNovo.json()).toMatchObject({ detail: 'O atendimento já foi avaliado.' });
    // Já avaliado recusa antes do nível.
    const deNovoSemNivel = await agir('fernanda', numero, 'avaliacao', {});
    expect(deNovoSemNivel.json()).toMatchObject({ detail: 'O atendimento já foi avaliado.' });

    avancar(5);
    expect((await agiu('fernanda', numero, 'reabertura')).avaliacao).toBeNull();
    avancar(5);
    expect((await daTi('resolver', numero, { feito: 'Troquei o encosto.' })).statusCode).toBe(200);
    expect((await ler('fernanda', numero)).avaliacao).toBeNull();
    expect((await agiu('fernanda', numero, 'avaliacao', { nivel: 'bom' })).avaliacao).toMatchObject(
      { nivel: 'bom', minha: true },
    );
  });
});

describe('a marcação como vista', () => {
  it('tira a resposta nova e marca as notificações do chamado, e a mensagem seguinte a traz de volta', async () => {
    const numero = await c.abrirChamado('fernanda');
    const { id } = await linhaDo(numero);
    await c.mensagemDaTi(numero, 'Qual é a sala?');
    await naOrg((tx) =>
      tx.insert(notificacoes).values(
        [`chamado:${id}`, 'chamado:00000000-0000-0000-0000-000000000000'].map((assunto) => ({
          orgId: c.org,
          contaId: c.conta('fernanda'),
          severidade: 'info' as const,
          titulo: 'Ana Souza respondeu',
          origem: 'Chamados',
          destino: `/chat/chamados/${numero}`,
          mensagem: true,
          assunto,
        })),
      ),
    );
    expect((await ler('fernanda', numero)).respostaNova.quantas).toBe(1);

    const vista = await agiu('fernanda', numero, 'vista');
    expect(vista.respostaNova).toEqual({ quantas: 0, desde: null });
    expect(
      (await notificacoesDa('fernanda')).map(({ assunto, lidaEm }) => [assunto, lidaEm !== null]),
    ).toEqual([
      [`chamado:${id}`, true],
      ['chamado:00000000-0000-0000-0000-000000000000', false],
    ]);
    const [ultima] = await naOrg((tx) =>
      tx
        .select({ id: mensagensDosChamados.id })
        .from(mensagensDosChamados)
        .where(eq(mensagensDosChamados.chamadoId, id))
        .orderBy(desc(mensagensDosChamados.id))
        .limit(1),
    );
    const [leitura] = await naOrg((tx) =>
      tx.select({ vistaAte: leiturasDosChamados.vistaAte }).from(leiturasDosChamados),
    );
    expect(leitura?.vistaAte).toBe(ultima?.id);

    await c.mensagemDaTi(numero, 'E o andar?');
    expect((await ler('fernanda', numero)).respostaNova.quantas).toBe(1);
    // A mensagem dela também conta como vista.
    const respondido = await agiu('fernanda', numero, 'mensagens', { texto: 'Sala 3, segundo.' });
    expect(respondido.respostaNova.quantas).toBe(0);
  });

  it('a mensagem da TI que espera a trava da marcação fica como resposta nova', async () => {
    const numero = await c.abrirChamado('fernanda');
    avancar(5);
    const soltar = await segurarOChamado(numero);
    const vista = agir('fernanda', numero, 'vista');
    await esperarNaTrava(api, 1);
    // A hora da mensagem da Ana sai antes da trava, e antes da hora da marcação.
    avancar(-1);
    const daAna = daTi('mensagem', numero, { texto: 'Reiniciei o servidor.' });
    await esperarNaTrava(api, 2);
    await soltar();
    expect((await vista).statusCode).toBe(200);
    expect((await daAna).statusCode).toBe(200);
    avancar(1);

    const lido = await ler('fernanda', numero);
    expect(lido.respostaNova.quantas).toBe(1);
    expect(lido.conversa.at(-1)).toMatchObject({ texto: 'Reiniciei o servidor.' });
  });
});
