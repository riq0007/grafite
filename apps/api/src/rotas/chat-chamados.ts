// A abertura de um chamado pelo chat (spec chamados, "Abrir um chamado pelo chat"; spec chat,
// "Chamados da conversa"; change chat-com-chamados, design, decisões 8 e 14; tarefa 3.7): os tipos
// que o chat oferece, os ativos sugeridos para a pessoa e a abertura a partir da mensagem ou de até
// 20 da conversa (change andamento-e-varias-mensagens, decisão 6; tarefa 3.4). As rotas
// ficam no escopo do Chat, que confere o módulo ligado; elas pedem `chamados.pedir`, o `chat.usar`
// e o módulo Chamados ligado.
import { type Banco, naOrganizacao, type Transacao } from '@grafite/db';
import {
  ICONES_DO_TIPO_DE_CHAMADO,
  MENSAGENS_DA_ABERTURA_PELO_CHAT as M,
  MAXIMO_DE_MENSAGENS_NUM_CHAMADO,
  pode,
} from '@grafite/domain';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RecusaDePermissao, sessaoDa } from '../acesso/escopo.ts';
import { exigirLigadoNaTransacao } from '../acesso/modulos.ts';
import {
  abrirPeloChat,
  ativosSugeridosPeloChat,
  tiposDaAberturaPeloChat,
} from '../chat/abertura-pelo-chat.ts';
import { contaDaSessao } from '../chat/sessao.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const TipoParaAbrirPeloChat = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    icone: z.enum(ICONES_DO_TIPO_DE_CHAMADO),
    /** A frase para o colaborador; o tipo Em uso sempre a tem. */
    frase: z.string().nullable(),
    /** O tipo pede o ativo, entre os sugeridos para a pessoa. */
    pedeOAtivo: z.boolean(),
  })
  .meta({ id: 'TipoParaAbrirPeloChat' });

const TiposParaAbrirPeloChat = z
  .object({ itens: z.array(TipoParaAbrirPeloChat) })
  .meta({ id: 'TiposParaAbrirPeloChat' });

const AtivosSugeridosPeloChat = z
  .object({
    /** Os sob a responsabilidade da pessoa e depois os do local dela; o primeiro vem escolhido. */
    ativos: z.array(
      z.object({ id: z.uuid(), nome: z.string(), patrimonio: z.string().nullable() }),
    ),
  })
  .meta({ id: 'AtivosSugeridosPeloChat' });

const BuscaDosSugeridos = z.object({
  tipo: z.uuid({ error: M.tipoIndisponivel }),
  pessoa: z.uuid({ error: M.pessoaNaoEncontrada }),
});

const PedidoDaAberturaPeloChat = z
  .object({
    tipo: z.uuid({ error: M.tipoIndisponivel }).nullish(),
    /** O título passa pelo domínio, que conta os caracteres sem os espaços das pontas. */
    titulo: z.string().max(1200, { error: 'Use até 120 caracteres.' }),
    /** A pessoa de "No nome de". */
    pessoa: z.uuid({ error: M.pessoaNaoEncontrada }).nullish(),
    /** O ativo, um dos sugeridos, no tipo que pede o ativo. */
    ativo: z.uuid({ error: M.ativoForaDaLista }).nullish(),
  })
  .meta({ id: 'PedidoDaAberturaPeloChat' });

const PedidoDaAberturaDasMensagens = PedidoDaAberturaPeloChat.extend({
  /**
   * As mensagens da conversa, de 1 a 20, em qualquer ordem: o chamado as cita na ordem da conversa.
   * O domínio tira as repetidas e conta as que sobram.
   */
  mensagens: z
    .array(z.uuid({ error: M.mensagemNaoEncontrada }))
    .max(10 * MAXIMO_DE_MENSAGENS_NUM_CHAMADO, { error: M.mensagensDemais }),
}).meta({ id: 'PedidoDaAberturaDasMensagens' });

const ChamadoAbertoPeloChat = z.object({ numero: z.int() }).meta({ id: 'ChamadoAbertoPeloChat' });

const ParametrosDaMensagem = z.object({ id: z.uuid({ error: M.mensagemNaoEncontrada }) });

const ParametrosDaConversa = z.object({ id: z.uuid({ error: M.mensagemNaoEncontrada }) });

const PROBLEMAS = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
} as const;

export const rotasDosChamadosDoChat: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  fila?: FilaDeTarefas | undefined;
}> = async (app, { banco, agora, fila }) => {
  /** Quem pede as notificações da abertura também pelo e-mail e pelo push. */
  const enviar = (): EnviarTarefa | undefined =>
    fila?.rodando() ? (...dados) => fila.enviar(...dados) : undefined;

  /**
   * A transação de quem abre pelo chat: o `chamados.pedir` vem da guarda da rota; o `chat.usar` e o
   * módulo Chamados, daqui.
   */
  const deQuemAbre = <T>(requisicao: FastifyRequest, trabalho: (tx: Transacao) => Promise<T>) => {
    if (!pode(sessaoDa(requisicao).acesso, 'chat.usar')) throw new RecusaDePermissao('chat.usar');
    return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
      await exigirLigadoNaTransacao(tx, 'chamados');
      return trabalho(tx);
    });
  };

  app.get(
    '/chat/chamados/tipos',
    {
      config: { permissao: 'chamados.pedir' },
      schema: {
        summary: 'Os tipos que a abertura pelo chat oferece, na ordem dos tipos',
        response: { 200: TiposParaAbrirPeloChat, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      deQuemAbre(requisicao, async (tx) => ({ itens: await tiposDaAberturaPeloChat(tx) })),
  );

  app.get(
    '/chat/chamados/sugestoes',
    {
      config: { permissao: 'chamados.pedir' },
      schema: {
        summary: 'Os ativos sugeridos para a pessoa no tipo, só com o id, o nome e o patrimônio',
        querystring: BuscaDosSugeridos,
        response: { 200: AtivosSugeridosPeloChat, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      deQuemAbre(requisicao, async (tx) => ({
        ativos: await ativosSugeridosPeloChat(tx, requisicao.query.tipo, requisicao.query.pessoa),
      })),
  );

  app.post(
    '/chat/mensagens/:id/chamado',
    {
      config: { permissao: 'chamados.pedir' },
      schema: {
        summary: 'Abre um chamado a partir da mensagem, que vira um chamado só',
        params: ParametrosDaMensagem,
        body: PedidoDaAberturaPeloChat,
        response: { 201: ChamadoAbertoPeloChat, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      const { numero } = await deQuemAbre(requisicao, async (tx) =>
        abrirPeloChat(
          tx,
          await contaDaSessao(tx, requisicao),
          // A rota de uma mensagem, que o app do chat da versão anterior ainda chama, pelo mesmo
          // código (change andamento-e-varias-mensagens, design, decisão 6).
          { conversa: null, ids: [requisicao.params.id] },
          {
            tipo: requisicao.body.tipo ?? null,
            titulo: requisicao.body.titulo,
            pessoa: requisicao.body.pessoa ?? null,
            ativo: requisicao.body.ativo ?? null,
          },
          { requisicao, momento, enviar: enviar() },
        ),
      );
      return resposta.status(201).send({ numero });
    },
  );

  app.post(
    '/chat/conversas/:id/chamado',
    {
      config: { permissao: 'chamados.pedir' },
      schema: {
        summary:
          'Abre um chamado a partir de até 20 mensagens da conversa, cada uma num chamado só, citadas na ordem da conversa',
        params: ParametrosDaConversa,
        body: PedidoDaAberturaDasMensagens,
        response: { 201: ChamadoAbertoPeloChat, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      const { numero } = await deQuemAbre(requisicao, async (tx) =>
        abrirPeloChat(
          tx,
          await contaDaSessao(tx, requisicao),
          { conversa: requisicao.params.id, ids: requisicao.body.mensagens },
          {
            tipo: requisicao.body.tipo ?? null,
            titulo: requisicao.body.titulo,
            pessoa: requisicao.body.pessoa ?? null,
            ativo: requisicao.body.ativo ?? null,
          },
          { requisicao, momento, enviar: enviar() },
        ),
      );
      return resposta.status(201).send({ numero });
    },
  );
};
