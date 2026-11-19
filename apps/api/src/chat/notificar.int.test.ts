// A notificação do chat (spec chat, "Notificações do chat" e "Silenciar uma conversa"; change
// chat-com-chamados, design, decisão 6; tarefa 3.6): a mensagem pede a tarefa `chat.notificar` para
// 10 s depois, na transação dela, e a tarefa notifica quem participa da conversa quando ela roda,
// fora quem escreveu, quem silenciou e quem já leu. Os títulos e o corte do texto são do domínio;
// aqui fica quem recebe, lido do banco na hora da tarefa.
import { naOrganizacao, notificacoes } from '@grafite/db';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import {
  type ChatDeTeste,
  CONTAS_DO_CHAT,
  montarChat,
  type UsuarioDoChat,
} from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';
import { notificarMensagemDoChat, TAREFA_DO_CHAT, tarefaDoChat } from './notificar.ts';

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

beforeAll(async () => {
  // A fila liga com a tarefa do catálogo, mas sem o trabalho e sem a fila das falhas: a mensagem
  // pedida para 10 s depois não roda sozinha no meio dos outros testes.
  api = await abrirApi({
    relogio: criarRelogio(new Date('2026-11-17T12:00:00.000Z')),
    tarefas: (contexto) => [{ ...tarefaDoChat(contexto), opcoes: {}, trabalho: async () => {} }],
  });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `notificar-${enderecos}.grafite.test`);
  await c.entrar();
});

afterEach(async () => {
  await desligarModulos(api, c.org, []);
});

/** Roda a tarefa da mensagem agora, como a fila a rodaria. */
const rodarATarefa = (mensagemId: string) =>
  notificarMensagemDoChat(api.banco, { orgId: c.org, mensagemId }, { agora: api.relogio.agora() });

/** Quem recebeu a notificação da mensagem, pelo usuário, com o que ela diz. */
async function notificadosDa(mensagemId: string) {
  const usuarioDa = new Map(
    (Object.keys(CONTAS_DO_CHAT) as UsuarioDoChat[]).map((usuario) => [c.conta(usuario), usuario]),
  );
  const linhas = await naOrganizacao(api.banco, c.org, (tx) =>
    tx.select().from(notificacoes).where(eq(notificacoes.mensagemDoChatId, mensagemId)),
  );
  return linhas
    .map((linha) => ({ ...linha, usuario: usuarioDa.get(linha.contaId) }))
    .sort((a, b) => (a.usuario ?? '').localeCompare(b.usuario ?? ''));
}

const quemRecebeu = async (mensagemId: string) =>
  (await notificadosDa(mensagemId)).map(({ usuario }) => usuario);

describe('a mensagem pede a notificação', () => {
  it('na conversa e na direta que nasce, para 10 s depois, com a organização e a mensagem', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro, { avisar: true });
    const naEquipe = await c.cliente.enviar(
      'POST',
      `/chat/conversas/${equipe}/mensagens`,
      c.como('paulo'),
      { texto: 'Fechamos o mês hoje.' },
    );
    expect(naEquipe.statusCode, naEquipe.body).toBe(201);
    const naDireta = await c.cliente.enviar(
      'POST',
      `/chat/diretas/${c.conta('fernanda')}/mensagens`,
      c.como('paulo'),
      { texto: 'Você já falou com a TI sobre a impressora?' },
    );
    expect(naDireta.statusCode, naDireta.body).toBe(201);
    const ids = [
      (naEquipe.json() as { id: string }).id,
      (naDireta.json() as { mensagem: { id: string } }).mensagem.id,
    ];

    const { rows } = await api.banco.execute<{
      dados: { orgId: string; mensagemId: string };
      espera: number;
    }>(
      sql`select data as dados, extract(epoch from start_after - created_on)::float as espera
          from fila.job where name = ${TAREFA_DO_CHAT} and data->>'orgId' = ${c.org}
          order by created_on`,
    );
    expect(rows.map(({ dados }) => dados)).toEqual(
      ids.map((mensagemId) => ({ orgId: c.org, mensagemId })),
    );
    for (const { espera } of rows) expect(espera).toBeGreaterThanOrEqual(9.5);
  });
});

describe('a tarefa chat.notificar', () => {
  it('a direta notifica a outra conta, como mensagem, e nunca quem escreveu', async () => {
    const direta = await c.criarDireta('paulo', 'fernanda');
    const mensagem = await c.mensagem(
      direta,
      'paulo',
      'Você já falou com a TI sobre a impressora?',
    );
    expect(await rodarATarefa(mensagem)).toEqual({ notificadas: 1 });
    const [notificacao, ...outras] = await notificadosDa(mensagem);
    expect(outras).toEqual([]);
    expect(notificacao).toMatchObject({
      usuario: 'fernanda',
      severidade: 'info',
      titulo: 'Mensagem de Paulo Nunes',
      descricao: 'Você já falou com a TI sobre a impressora?',
      origem: 'Chat',
      destino: `/chat/c/${direta}?m=${mensagem}`,
      mensagem: true,
      assunto: `conversa:${direta}`,
      mensagemDoChatId: mensagem,
    });
  });

  it('a equipe com o aviso notifica quem participa, fora quem silenciou e quem já leu', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro, { avisar: true });
    await c.silenciar('tatiana', equipe);
    const primeira = await c.mensagem(equipe, 'paulo', 'Fechamos o mês hoje.');
    await rodarATarefa(primeira);
    expect(await quemRecebeu(primeira)).toEqual(['fernanda']);
    expect((await notificadosDa(primeira))[0]?.titulo).toBe('Paulo Nunes em Equipe Financeiro');

    // Quem está com a conversa à vista lê a mensagem antes dos 10 s.
    const segunda = await c.mensagem(equipe, 'paulo', 'Alguém viu o relatório?');
    await c.lerAte('fernanda', equipe, segunda);
    expect(await rodarATarefa(segunda)).toEqual({ notificadas: 0 });
  });

  it('a equipe sem o aviso não notifica ninguém', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const mensagem = await c.mensagem(equipe, 'paulo', 'Fechamos o mês hoje.');
    expect(await rodarATarefa(mensagem)).toEqual({ notificadas: 0 });
    expect(await quemRecebeu(mensagem)).toEqual([]);
  });

  it('quem participa é lido quando a tarefa roda: quem saiu do grupo nos 10 s não recebe', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro, { avisar: true });
    const mensagem = await c.mensagem(equipe, 'paulo', 'Fechamos o mês hoje.');
    await c.sairDoGrupo('tatiana', c.grupos.financeiro);
    await rodarATarefa(mensagem);
    expect(await quemRecebeu(mensagem)).toEqual(['fernanda']);
  });

  it('o canal com o aviso notifica todos que usam o chat, e quem não usa fica de fora', async () => {
    const canal = await c.criarCanal('Avisos da TI', { escreve: c.grupos.ti, avisar: true });
    const mensagem = await c.mensagem(canal, 'ana', 'A rede cai às 18h para manutenção.');
    await rodarATarefa(mensagem);
    expect(await quemRecebeu(mensagem)).toEqual(['fernanda', 'livia', 'paulo', 'tatiana']);
  });

  it('a equipe arquivada nos 10 s, e o módulo Chat desligado, não notificam', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro, { avisar: true });
    const arquivada = await c.mensagem(equipe, 'paulo', 'Fechamos o mês hoje.');
    await c.arquivar(equipe);
    expect(await rodarATarefa(arquivada)).toEqual({ notificadas: 0 });

    const direta = await c.criarDireta('paulo', 'fernanda');
    const desligado = await c.mensagem(direta, 'paulo', 'Bom dia!');
    await desligarModulos(api, c.org, ['chat']);
    expect(await rodarATarefa(desligado)).toEqual({ notificadas: 0 });
    expect(await quemRecebeu(desligado)).toEqual([]);
  });
});
