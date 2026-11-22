// As ações de quem participa do chamado, pelo chat (spec chamados, "Resposta da pessoa", "Pergunta
// com opções", "Avaliação do atendimento" e "Resposta nova"; change chat-com-chamados, design,
// decisões 5, 9 e 15; tarefa 3.9): responder, escolher, reabrir, avaliar e marcar como vista. As
// rotas ficam no escopo do Chat, que confere o módulo ligado; elas pedem o `chat.usar` e o módulo
// Chamados ligado, e nenhuma permissão dos chamados: o próprio chamado se responde sem ela. Cada uma
// devolve a conversa depois da ação, lida na mesma transação.
import { type Banco, naOrganizacao } from '@grafite/db';
import { MENSAGENS_DA_PERGUNTA } from '@grafite/domain';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirLigadoNaTransacao } from '../acesso/modulos.ts';
import { NumeroDoChamado } from '../chamados/alcance.ts';
import { ANEXO_NAO_ENCONTRADO } from '../chamados/anexos.ts';
import {
  agirComoQuemParticipa,
  type PedidoDaRotaDeQuemParticipa,
} from '../chat/acoes-de-quem-participa.ts';
import {
  ConversaDoChamadoDeQuemParticipa,
  conversaDeQuemParticipa,
} from '../chat/chamados-de-quem-participa.ts';
import { contaDaSessao } from '../chat/sessao.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const ParametrosDoChamado = z.object({ numero: NumeroDoChamado });

/** O id de um anexo, como o envio o devolveu. */
const IdDoAnexo = z.uuid();

const PedidoDaMensagemDeQuemParticipa = z
  .object({
    /**
     * O texto, sem os espaços das pontas, com até 4.000 caracteres: o vazio vai só com um anexo, e
     * o domínio recusa o vazio sem anexo e o longo, no campo `texto`.
     */
    texto: z.string().default(''),
    /**
     * Os ids dos anexos, como o envio (`POST /chamados/anexos`) os devolveu, até 5, enviados pela
     * mesma conta e sem dono; o que nem é um id é o anexo que não se acha, no campo `anexos`.
     */
    anexos: z
      .array(z.string())
      .refine((ids) => ids.every((id) => IdDoAnexo.safeParse(id).success), {
        error: ANEXO_NAO_ENCONTRADO,
      })
      .default([]),
  })
  .meta({ id: 'PedidoDaMensagemDeQuemParticipa' });

const PedidoDaEscolha = z
  .object({
    /** A mensagem da TI com a pergunta; a que não é uma mensagem do chamado não pergunta nada. */
    mensagem: z.uuid({ error: MENSAGENS_DA_PERGUNTA.deFora }),
    /** A opção, como a pergunta a mostra. */
    opcao: z.string().default(''),
  })
  .meta({ id: 'PedidoDaEscolhaDeQuemParticipa' });

const PedidoDaAvaliacao = z
  .object({
    /** O nível, de `ruim` a `otimo`; o que falta ou não é um nível é recusado no campo `nivel`. */
    nivel: z.string().nullish(),
    /** O comentário, opcional, com até 500 caracteres sem os espaços das pontas. */
    comentario: z.string().nullish(),
  })
  .meta({ id: 'PedidoDaAvaliacaoDeQuemParticipa' });

const PROBLEMAS = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
} as const;

const RESPOSTA = { 200: ConversaDoChamadoDeQuemParticipa, ...PROBLEMAS } as const;

export const rotasDasAcoesDosChamadosDoChat: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  fila?: FilaDeTarefas | undefined;
}> = async (app, { banco, agora, fila }) => {
  /** Quem pede as notificações também pelo e-mail e pelo push. */
  const enviar = (): EnviarTarefa | undefined =>
    fila?.rodando() ? (...dados) => fila.enviar(...dados) : undefined;

  /**
   * A ação na transação de quem participa, com o módulo Chamados ligado e a conta da sessão no chat,
   * e a conversa depois dela.
   */
  const agir = (
    requisicao: FastifyRequest,
    numero: number,
    pedido: PedidoDaRotaDeQuemParticipa,
  ) => {
    const momento = agora();
    return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
      await exigirLigadoNaTransacao(tx, 'chamados');
      const conta = await contaDaSessao(tx, requisicao);
      await agirComoQuemParticipa(tx, conta, numero, pedido, {
        requisicao,
        momento,
        enviar: enviar(),
      });
      return conversaDeQuemParticipa(tx, conta, numero, momento);
    });
  };

  app.post(
    '/chat/chamados/:numero/mensagens',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary:
          'A mensagem de quem participa no chamado, que retoma o aguardando e reabre o resolvido',
        params: ParametrosDoChamado,
        body: PedidoDaMensagemDeQuemParticipa,
        response: RESPOSTA,
      },
    },
    async (requisicao) =>
      agir(requisicao, requisicao.params.numero, {
        acao: 'responder',
        texto: requisicao.body.texto,
        anexos: requisicao.body.anexos,
      }),
  );

  app.post(
    '/chat/chamados/:numero/escolha',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'A escolha de uma opção da pergunta da TI, que vale para sempre',
        params: ParametrosDoChamado,
        body: PedidoDaEscolha,
        response: RESPOSTA,
      },
    },
    async (requisicao) =>
      agir(requisicao, requisicao.params.numero, {
        acao: 'escolher',
        mensagem: requisicao.body.mensagem,
        opcao: requisicao.body.opcao,
      }),
  );

  app.post(
    '/chat/chamados/:numero/reabertura',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'O "Reabrir" do chamado resolvido, sem escrever',
        params: ParametrosDoChamado,
        response: RESPOSTA,
      },
    },
    async (requisicao) => agir(requisicao, requisicao.params.numero, { acao: 'reabrir' }),
  );

  app.post(
    '/chat/chamados/:numero/avaliacao',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'A avaliação do atendimento, uma por resolução',
        params: ParametrosDoChamado,
        body: PedidoDaAvaliacao,
        response: RESPOSTA,
      },
    },
    async (requisicao) =>
      agir(requisicao, requisicao.params.numero, {
        acao: 'avaliar',
        nivel: requisicao.body.nivel ?? null,
        comentario: requisicao.body.comentario ?? null,
      }),
  );

  app.post(
    '/chat/chamados/:numero/vista',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'O "Marcar como vista", que tira a resposta nova sem responder',
        params: ParametrosDoChamado,
        response: RESPOSTA,
      },
    },
    async (requisicao) => agir(requisicao, requisicao.params.numero, { acao: 'vista' }),
  );
};
