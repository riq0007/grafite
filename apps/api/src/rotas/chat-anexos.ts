// Os anexos do chat pela API (spec arquivos-e-imagens, "Anexos do chat" e "Entrega dos arquivos";
// change chat-com-chamados, design, decisão 1; tarefa 3.4):
// - o envio, um arquivo por vez, com `chat.usar` e as regras de "Arquivos aceitos", que deixa o
//   anexo sem dono até a mensagem que o toma (`tomarAnexosDoChat`);
// - a entrega do anexo sem dono, só a quem o enviou;
// - a entrega pela conversa dona, a quem participa dela agora, com a da miniatura da imagem
//   (tarefa 4.20). A conversa de que a conta não participa, e o anexo de outra conversa, respondem
//   que o arquivo não existe.
// Num plugin só deles, porque o corpo do envio é o arquivo, até 25 MiB, e não JSON.
import { anexosDoChat, arquivos, naOrganizacao, type Transacao } from '@grafite/db';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  AnexoEnviado,
  arquivoNaoEncontrado,
  ENTREGA_DA_MINIATURA,
  ENTREGA_DO_ANEXO,
  entregarAnexo,
  entregarMiniatura,
  ParametrosDoAnexoSemDono,
  PROBLEMAS_DO_ENVIO,
  receberAnexo,
} from '../arquivos/anexos-sem-dono.ts';
import { BytesDoArquivo } from '../arquivos/esquemas.ts';
import type { DependenciasDasImagens } from '../arquivos/imagem-do-registro.ts';
import { aceitarArquivos } from '../ativos/arquivos-dos-campos.ts';
import { NomeDoArquivoEnviado } from '../ativos/esquemas.ts';
import { lerConversaDaConta } from '../chat/conversa.ts';
import { contaDaSessao } from '../chat/sessao.ts';
import { ProblemaDaApi } from '../problemas.ts';

const ParametrosDoAnexoDaConversa = ParametrosDoAnexoSemDono.extend({
  id: ParametrosDoAnexoSemDono.shape.arquivo,
});

/** O arquivo do anexo do chat que a condição acha, não removido, com o que a entrega informa. */
async function arquivoDoAnexo(tx: Transacao, arquivoId: string, dono: SQL | undefined) {
  const [lido] = await tx
    .select({ nome: arquivos.nome, tipo: arquivos.tipo, variantes: arquivos.variantes })
    .from(anexosDoChat)
    .innerJoin(arquivos, eq(arquivos.id, anexosDoChat.arquivoId))
    .where(and(eq(anexosDoChat.arquivoId, arquivoId), isNull(arquivos.removidoEm), dono));
  if (!lido) throw arquivoNaoEncontrado();
  return lido;
}

export const rotasDosAnexosDoChat: FastifyPluginAsyncZod<DependenciasDasImagens> = async (
  app,
  dependencias,
) => {
  const { banco, armazenamento } = dependencias;
  aceitarArquivos(app);

  app.post(
    '/chat/anexos',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Enviar um anexo do chat, sem dono até a mensagem que o usa',
        querystring: NomeDoArquivoEnviado,
        consumes: ['application/octet-stream'],
        body: BytesDoArquivo,
        response: { 201: AnexoEnviado, ...PROBLEMAS_DO_ENVIO },
      },
    },
    async (requisicao, resposta) => {
      const enviado = await receberAnexo(
        dependencias,
        requisicao,
        { conteudo: requisicao.body, nomePedido: requisicao.query.nome ?? '' },
        (tx, arquivoId) =>
          tx.insert(anexosDoChat).values({ orgId: sql`app.current_org()`, arquivoId }),
      );
      return resposta.code(201).send(enviado);
    },
  );

  app.get(
    '/chat/anexos/:arquivo',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'O anexo do chat ainda sem dono, para baixar, só a quem o enviou',
        params: ParametrosDoAnexoSemDono,
        response: ENTREGA_DO_ANEXO,
      },
    },
    async (requisicao, resposta) => {
      const { arquivo } = requisicao.params;
      const lido = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        return arquivoDoAnexo(
          tx,
          arquivo,
          and(isNull(anexosDoChat.conversaId), eq(arquivos.enviadoPor, conta.id)),
        );
      });
      return entregarAnexo(armazenamento, requisicao, resposta, arquivo, lido);
    },
  );

  /** O anexo da conversa, de quem participa dela agora: quem saiu da equipe não acha o arquivo. */
  const anexoDaConversa = (requisicao: FastifyRequest, conversaId: string, arquivoId: string) =>
    naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
      const conta = await contaDaSessao(tx, requisicao);
      const { linha } = await lerConversaDaConta(tx, conta, conversaId).catch((erro: unknown) => {
        throw erro instanceof ProblemaDaApi && erro.dados.status === 404
          ? arquivoNaoEncontrado()
          : erro;
      });
      return arquivoDoAnexo(tx, arquivoId, eq(anexosDoChat.conversaId, linha.id));
    });

  app.get(
    '/chat/conversas/:id/anexos/:arquivo',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Um anexo da conversa, para baixar, a quem participa dela agora',
        params: ParametrosDoAnexoDaConversa,
        response: ENTREGA_DO_ANEXO,
      },
    },
    async (requisicao, resposta) => {
      const { id, arquivo } = requisicao.params;
      const lido = await anexoDaConversa(requisicao, id, arquivo);
      return entregarAnexo(armazenamento, requisicao, resposta, arquivo, lido);
    },
  );

  app.get(
    '/chat/conversas/:id/anexos/:arquivo/miniatura',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'A miniatura de um anexo de imagem da conversa, a quem participa dela agora',
        params: ParametrosDoAnexoDaConversa,
        response: ENTREGA_DA_MINIATURA,
      },
    },
    async (requisicao, resposta) => {
      const { id, arquivo } = requisicao.params;
      const lido = await anexoDaConversa(requisicao, id, arquivo);
      return entregarMiniatura(armazenamento, requisicao, resposta, arquivo, lido);
    },
  );
};
