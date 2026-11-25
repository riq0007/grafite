// A leitura de quem participa do chamado, pelo chat (spec chamados, "Leitura do chamado pela
// pessoa"; spec chat, "Chamado citado numa mensagem"; spec modulo-chat, "Lista do Chat", "Chamado no
// chat" e "Vista Chamados"; change chat-com-chamados, design, decisões 5, 9 e 15; tarefa 3.8): os
// chamados da conta, a conversa de um deles, o anexo, com a miniatura da imagem (tarefa 4.20), e o
// resumo do chip. As rotas ficam no escopo do Chat, que confere o módulo ligado; elas pedem o
// `chat.usar` e o módulo Chamados ligado, e nenhuma permissão dos chamados: o próprio chamado se lê
// sem ela.
import { naOrganizacao, type Transacao } from '@grafite/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirLigadoNaTransacao } from '../acesso/modulos.ts';
import {
  ENTREGA_DA_MINIATURA,
  ENTREGA_DO_ANEXO,
  entregarAnexo,
  entregarMiniatura,
  ParametrosDoAnexoSemDono,
} from '../arquivos/anexos-sem-dono.ts';
import type { DependenciasDasImagens } from '../arquivos/imagem-do-registro.ts';
import { NumeroDoChamado } from '../chamados/alcance.ts';
import {
  anexoDeQuemParticipa,
  BuscaDosChamadosDeQuemParticipa,
  ChamadosDeQuemParticipa,
  ConversaDoChamadoDeQuemParticipa,
  chamadosDeQuemParticipa,
  conversaDeQuemParticipa,
  gravarAbertura,
  ResumoDoChamadoNoChat,
  resumoDoChamadoNoChat,
} from '../chat/chamados-de-quem-participa.ts';
import type { ContaQueLeAsMensagens } from '../chat/mensagens.ts';
import { contaDaSessao } from '../chat/sessao.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const ParametrosDoChamado = z.object({ numero: NumeroDoChamado });
const ParametrosDoAnexo = ParametrosDoAnexoSemDono.extend({ numero: NumeroDoChamado });

const PROBLEMAS = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO } as const;

export const rotasDaLeituraDosChamadosDoChat: FastifyPluginAsyncZod<
  DependenciasDasImagens
> = async (app, { banco, agora, armazenamento }) => {
  /** A transação de quem lê, com o módulo Chamados ligado e a conta da sessão no chat. */
  const deQuemLe = <T>(
    requisicao: FastifyRequest,
    trabalho: (tx: Transacao, conta: ContaQueLeAsMensagens) => Promise<T>,
  ) =>
    naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
      await exigirLigadoNaTransacao(tx, 'chamados');
      return trabalho(tx, await contaDaSessao(tx, requisicao));
    });

  app.get(
    '/chat/chamados',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Os chamados de que a conta participa: os abertos e uma página dos resolvidos',
        querystring: BuscaDosChamadosDeQuemParticipa,
        response: { 200: ChamadosDeQuemParticipa, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      deQuemLe(requisicao, (tx, conta) =>
        chamadosDeQuemParticipa(tx, conta, {
          resolvidosAntes: requisicao.query.resolvidosAntes,
          agora: agora(),
        }),
      ),
  );

  app.get(
    '/chat/chamados/:numero',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'A conversa do chamado nas palavras do colaborador, a quem participa dele',
        params: ParametrosDoChamado,
        response: { 200: ConversaDoChamadoDeQuemParticipa, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      deQuemLe(requisicao, (tx, conta) =>
        conversaDeQuemParticipa(tx, conta, requisicao.params.numero, agora()),
      ),
  );

  app.post(
    '/chat/chamados/:numero/aberta',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'A conversa do chamado apareceu na tela: tira a resposta por ver, e não a nova',
        params: ParametrosDoChamado,
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      await deQuemLe(requisicao, (tx, conta) =>
        gravarAbertura(tx, conta, requisicao.params.numero, agora()),
      );
      return resposta.status(204).send(null);
    },
  );

  app.get(
    '/chat/chamados/:numero/resumo',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'O resumo do chip do chamado citado, a quem vê o resumo',
        params: ParametrosDoChamado,
        response: { 200: ResumoDoChamadoNoChat, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      deQuemLe(requisicao, (tx, conta) =>
        resumoDoChamadoNoChat(tx, conta, requisicao.params.numero, agora()),
      ),
  );

  app.get(
    '/chat/chamados/:numero/anexos/:arquivo',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Um anexo do chamado, para baixar, a quem participa dele',
        params: ParametrosDoAnexo,
        response: ENTREGA_DO_ANEXO,
      },
    },
    async (requisicao, resposta) => {
      const { numero, arquivo } = requisicao.params;
      const lido = await deQuemLe(requisicao, (tx, conta) =>
        anexoDeQuemParticipa(tx, conta, numero, arquivo),
      );
      return entregarAnexo(armazenamento, requisicao, resposta, arquivo, lido);
    },
  );

  app.get(
    '/chat/chamados/:numero/anexos/:arquivo/miniatura',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'A miniatura de um anexo de imagem do chamado, a quem participa dele',
        params: ParametrosDoAnexo,
        response: ENTREGA_DA_MINIATURA,
      },
    },
    async (requisicao, resposta) => {
      const { numero, arquivo } = requisicao.params;
      const lido = await deQuemLe(requisicao, (tx, conta) =>
        anexoDeQuemParticipa(tx, conta, numero, arquivo),
      );
      return entregarMiniatura(armazenamento, requisicao, resposta, arquivo, lido);
    },
  );
};
