// Os eventos dos chamados a quem participa (spec chat, "Chamado citado numa mensagem"; spec
// chamados, "Conversa do chamado" e "Fechamento do chamado"; change chat-com-chamados, design,
// decisões 4 e 15; tarefa 3.12): o `chamados.mudaram` soma às permissões as contas da pessoa e de
// quem abriu pelo chat, na abertura, nas ações da TI, na edição, no fechamento e nas ações de quem
// participa, fora o que eles não leem, como a nota; e a mudança da situação ou de quem atende grava o
// `chat.mudou` da conversa de origem, para o chip seguir o chamado.
import { chamados, eventos, naOrganizacao } from '@grafite/db';
import { momentoDoFechamento } from '@grafite/domain';
import { and, asc, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import { HORARIO_DOS_CHAMADOS } from '../../test/chamados.ts';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { abrirEventos } from '../../test/eventos.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';
import { fecharOsVencidos } from '../chamados/fechamento.ts';

let api: ApiDeTeste;
let c: ChatDeTeste;
let host = '';
let enderecos = 0;

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T13:19:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  host = `grafite.chat-chamados-eventos-${enderecos}.local`;
  c = await montarChat(api, host);
  await c.entrar();
});

const naOrg = <T>(fn: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, c.org, fn);

const daTi = (usuario: UsuarioDoChat, acao: string, numero: number, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chamados/${numero}/${acao}`, c.como(usuario), corpo);

const doChat = (usuario: UsuarioDoChat, acao: string, numero: number, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chat/chamados/${numero}/${acao}`, c.como(usuario), corpo);

/** Os eventos do chamado, na ordem, com a permissão e as contas, estas em ordem. */
const eventosDoChamado = async (numero: number) => {
  const linhas = await naOrg((tx) =>
    tx
      .select({ tipo: eventos.tipo, permissao: eventos.permissao, contas: eventos.contas })
      .from(eventos)
      .innerJoin(chamados, eq(chamados.id, eventos.alvoId))
      .where(and(eq(eventos.alvoTipo, 'chamado'), eq(chamados.numero, numero)))
      .orderBy(asc(eventos.id)),
  );
  return linhas.map((linha) => ({ ...linha, contas: linha.contas?.toSorted() ?? null }));
};

/** Quantos `chat.mudou` a conversa já gravou. */
const chatMudouDa = async (conversa: string) =>
  (
    await naOrg((tx) =>
      tx
        .select({ id: eventos.id })
        .from(eventos)
        .where(and(eq(eventos.tipo, 'chat.mudou'), eq(eventos.alvoId, conversa))),
    )
  ).length;

/** O `chamados.mudaram` a quem vê o chamado e, com as contas, a quem participa dele. */
const mudou = (...contas: string[]) => ({
  tipo: 'chamados.mudaram',
  permissao: 'chamados.ver',
  contas: contas.length > 0 ? contas.toSorted() : null,
});

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

/** O chamado que Paulo Nunes abriu para Fernanda Rocha, da mensagem dele na equipe Financeiro. */
async function abertoPeloPaulo() {
  const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
  const mensagem = await c.mensagem(equipe, 'paulo', 'A cadeira da Fernanda quebrou.');
  return { equipe, numero: await abrirPeloChat('paulo', mensagem, 'fernanda') };
}

describe('o chamados.mudaram a quem participa', () => {
  it('a abertura, as ações e a edição da TI vão também à pessoa e a quem abriu pelo chat; a nota, não', async () => {
    const { equipe, numero } = await abertoPeloPaulo();
    const participam = [c.conta('fernanda'), c.conta('paulo')];
    expect(await eventosDoChamado(numero)).toEqual([mudou(...participam)]);
    const daAbertura = await chatMudouDa(equipe);

    // Quem atende e a situação mudam: o chip da equipe segue o chamado.
    expect((await daTi('ana', 'assumir', numero)).statusCode).toBe(200);
    expect(await chatMudouDa(equipe)).toBe(daAbertura + 1);
    // A mensagem e a troca do título mudam o que a pessoa lê, mas não o chip.
    expect((await daTi('ana', 'mensagem', numero, { texto: 'Passo aí às 14h.' })).statusCode).toBe(
      200,
    );
    const titulo = await c.cliente.enviar('PUT', `/chamados/${numero}/titulo`, c.como('ana'), {
      titulo: 'A cadeira da sala 3 quebrou',
    });
    expect(titulo.statusCode, titulo.body).toBe(200);
    expect(await chatMudouDa(equipe)).toBe(daAbertura + 1);
    // A nota fica só com quem vê o chamado.
    expect((await daTi('ana', 'nota', numero, { texto: 'Só da TI.' })).statusCode).toBe(200);
    // A espera e a resolução mudam a situação.
    expect((await daTi('ana', 'esperar', numero, { texto: 'Pode testar?' })).statusCode).toBe(200);
    const resolvido = await daTi('ana', 'resolver', numero, { feito: 'Troquei a cadeira.' });
    expect(resolvido.statusCode, resolvido.body).toBe(200);
    expect(await chatMudouDa(equipe)).toBe(daAbertura + 3);

    expect(await eventosDoChamado(numero)).toEqual([
      mudou(...participam),
      mudou(...participam),
      mudou(...participam),
      mudou(...participam),
      mudou(),
      mudou(...participam),
      mudou(...participam),
    ]);
  });

  it('o aberto pela TI vai à conta da pessoa que usa o chat, sem o chat.mudou; o da Rita e o do Chat desligado, só a quem o vê', async () => {
    const daFernanda = await c.abrirChamado('fernanda');
    const daRita = await c.abrirChamado('rita');
    expect(await eventosDoChamado(daFernanda)).toEqual([mudou(c.conta('fernanda'))]);
    expect(await eventosDoChamado(daRita)).toEqual([mudou()]);

    expect((await daTi('ana', 'mensagem', daFernanda, { texto: 'Oi.' })).statusCode).toBe(200);
    await desligarModulos(api, c.org, ['chat']);
    expect((await daTi('ana', 'mensagem', daFernanda, { texto: 'Oi de novo.' })).statusCode).toBe(
      200,
    );
    expect(await eventosDoChamado(daFernanda)).toEqual([
      mudou(c.conta('fernanda')),
      mudou(c.conta('fernanda')),
      mudou(),
    ]);
    const doChat = await naOrg((tx) =>
      tx.select({ id: eventos.id }).from(eventos).where(eq(eventos.tipo, 'chat.mudou')),
    );
    expect(doChat).toEqual([]);
  });

  it('a resposta da pessoa chega a quem abriu pelo chat, na conexão de eventos dele', async () => {
    const { numero } = await abertoPeloPaulo();
    const [chamado] = await naOrg((tx) =>
      tx.select({ id: chamados.id }).from(chamados).where(eq(chamados.numero, numero)),
    );
    const doPaulo = await abrirEventos(api, host, c.como('paulo'));
    try {
      await vi.waitFor(() => expect(doPaulo.mensagens.length).toBeGreaterThan(0));
      const r = await doChat('fernanda', 'mensagens', numero, { texto: 'Estou na sala 3.' });
      expect(r.statusCode, r.body).toBe(200);
      const doChamado = () =>
        doPaulo.mensagens.filter(
          (m) =>
            m.evento === 'chamados.mudaram' &&
            (m.dados as { alvo: { id: string } }).alvo.id === chamado?.id,
        );
      await vi.waitFor(() => expect(doChamado()).toHaveLength(1), { timeout: 2000 });
    } finally {
      doPaulo.fechar();
    }
  });

  it('a reabertura de quem participa muda o chip; a marcação como vista vai só à conta', async () => {
    const { equipe, numero } = await abertoPeloPaulo();
    expect((await daTi('ana', 'assumir', numero)).statusCode).toBe(200);
    expect((await daTi('ana', 'resolver', numero, { feito: 'Troquei.' })).statusCode).toBe(200);
    const antes = await chatMudouDa(equipe);
    const daResolucao = (await eventosDoChamado(numero)).length;

    expect((await doChat('paulo', 'vista', numero)).statusCode).toBe(200);
    const reaberto = await doChat('fernanda', 'reabertura', numero);
    expect(reaberto.statusCode, reaberto.body).toBe(200);
    expect(await chatMudouDa(equipe)).toBe(antes + 1);
    expect((await eventosDoChamado(numero)).slice(daResolucao)).toEqual([
      { tipo: 'chamados.mudaram', permissao: null, contas: [c.conta('paulo')] },
      mudou(c.conta('fernanda'), c.conta('paulo')),
    ]);
  });
});

describe('o fechamento', () => {
  it('vai a quem participa e muda o chip; a pessoa lê o "O chamado fechou"', async () => {
    const { equipe, numero } = await abertoPeloPaulo();
    expect((await daTi('ana', 'assumir', numero)).statusCode).toBe(200);
    expect((await daTi('ana', 'resolver', numero, { feito: 'Troquei.' })).statusCode).toBe(200);
    const antes = await chatMudouDa(equipe);
    const fecha = momentoDoFechamento(api.relogio.agora(), HORARIO_DOS_CHAMADOS.fuso);

    expect(await fecharOsVencidos(api.banco, c.org, { agora: fecha })).toEqual({ fechados: 1 });
    expect((await eventosDoChamado(numero)).at(-1)).toEqual(
      mudou(c.conta('fernanda'), c.conta('paulo')),
    );
    expect(await chatMudouDa(equipe)).toBe(antes + 1);

    api.relogio.avancar(fecha.getTime() - api.relogio.agora().getTime());
    await c.entrar('fernanda');
    const lido = await c.cliente.consultar(`/chat/chamados/${numero}`, c.como('fernanda'));
    expect(lido.statusCode, lido.body).toBe(200);
    const chamado = lido.json() as { fechado: boolean; conversa: { frase?: string }[] };
    expect(chamado.fechado).toBe(true);
    expect(chamado.conversa.at(-1)?.frase).toBe('O chamado fechou');
  });
});
