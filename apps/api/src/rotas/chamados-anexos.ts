// Os anexos dos chamados pela API (spec arquivos-e-imagens, "Anexos dos chamados"; change
// chamados-da-ti, design, decisão 10, tarefa 4.6):
// - o envio, um arquivo por vez, com `chamados.atender` em algum local ou o `chat.usar`, para a
//   resposta de quem participa (change chat-com-chamados, tarefa 3.7), e as regras de "Arquivos
//   aceitos": o conteúdo vai para o armazenamento fora da transação e, nela, entram o registro do
//   arquivo, com quem o enviou, e o anexo sem dono, que a gravação da mensagem, da nota, da abertura
//   ou do campo toma depois (`tomarAnexos`);
// - a entrega do anexo sem dono, só a quem o enviou;
// - a entrega pelo chamado dono, a quem vê o chamado. O da nota e o de um campo só da TI vão só a
//   quem vê o chamado com `chamados.ver`, que nesta change é o único jeito de ver um chamado: a
//   leitura que o chat e a aba darão à pessoa recusará os dois. A miniatura da imagem vai à mesma
//   gente (change chat-com-chamados, tarefa 4.20).
// O envio e a entrega são os de `arquivos/anexos-sem-dono.ts`, também do chat. Num plugin só deles,
// porque o corpo do envio é o arquivo, até 25 MiB, e não JSON.
import { anexosDosChamados, arquivos, naOrganizacao, type Transacao } from '@grafite/db';
import { pode } from '@grafite/domain';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { moduloDesligado, modulosDesligados } from '../acesso/modulos.ts';
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
import { chamadoQueAContaVe, NumeroDoChamado } from '../chamados/alcance.ts';

const ParametrosDoAnexo = ParametrosDoAnexoSemDono.extend({ numero: NumeroDoChamado });

/** O arquivo do anexo que a condição acha, não removido, com o que a entrega informa. */
async function arquivoDoAnexo(tx: Transacao, arquivoId: string, dono: SQL | undefined) {
  const [lido] = await tx
    .select({ nome: arquivos.nome, tipo: arquivos.tipo, variantes: arquivos.variantes })
    .from(anexosDosChamados)
    .innerJoin(arquivos, eq(arquivos.id, anexosDosChamados.arquivoId))
    .where(and(eq(anexosDosChamados.arquivoId, arquivoId), isNull(arquivos.removidoEm), dono));
  if (!lido) throw arquivoNaoEncontrado();
  return lido;
}

export const rotasDosAnexosDosChamados: FastifyPluginAsyncZod<DependenciasDasImagens> = async (
  app,
  dependencias,
) => {
  const { banco, armazenamento } = dependencias;
  aceitarArquivos(app);
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';

  /**
   * Quem envia pelo `chat.usar`, sem atender chamados, usa o chat: com o módulo Chat desligado, o
   * anexo não serviria a nenhuma mensagem dela.
   */
  async function exigirOChatDeQuemNaoAtende(requisicao: FastifyRequest) {
    if (pode(sessaoDa(requisicao).acesso, 'chamados.atender')) return;
    if ((await modulosDesligados(banco, orgDa(requisicao))).includes('chat')) {
      throw moduloDesligado('chat');
    }
  }

  app.post(
    '/chamados/anexos',
    {
      config: { permissao: ['chamados.atender', 'chat.usar'] },
      schema: {
        summary: 'Enviar um anexo, sem dono até a gravação que o usa',
        querystring: NomeDoArquivoEnviado,
        consumes: ['application/octet-stream'],
        body: BytesDoArquivo,
        response: { 201: AnexoEnviado, ...PROBLEMAS_DO_ENVIO },
      },
    },
    async (requisicao, resposta) => {
      await exigirOChatDeQuemNaoAtende(requisicao);
      const enviado = await receberAnexo(
        dependencias,
        requisicao,
        { conteudo: requisicao.body, nomePedido: requisicao.query.nome ?? '' },
        (tx, arquivoId) =>
          tx.insert(anexosDosChamados).values({ orgId: sql`app.current_org()`, arquivoId }),
      );
      return resposta.code(201).send(enviado);
    },
  );

  app.get(
    '/chamados/anexos/:arquivo',
    {
      config: { permissao: ['chamados.atender', 'chat.usar'] },
      schema: {
        summary: 'O anexo ainda sem dono, para baixar, só a quem o enviou',
        params: ParametrosDoAnexoSemDono,
        response: ENTREGA_DO_ANEXO,
      },
    },
    async (requisicao, resposta) => {
      await exigirOChatDeQuemNaoAtende(requisicao);
      const { arquivo } = requisicao.params;
      const lido = await naOrganizacao(banco, orgDa(requisicao), (tx) =>
        arquivoDoAnexo(
          tx,
          arquivo,
          and(
            isNull(anexosDosChamados.chamadoId),
            eq(arquivos.enviadoPor, sessaoDa(requisicao).contaId),
          ),
        ),
      );
      return entregarAnexo(armazenamento, requisicao, resposta, arquivo, lido);
    },
  );

  /** O anexo do chamado que a conta vê. */
  const anexoDoChamado = (requisicao: FastifyRequest, numero: number, arquivoId: string) =>
    naOrganizacao(banco, orgDa(requisicao), async (tx) => {
      const chamado = await chamadoQueAContaVe(tx, requisicao, numero);
      return arquivoDoAnexo(tx, arquivoId, eq(anexosDosChamados.chamadoId, chamado.id));
    });

  app.get(
    '/chamados/:numero/anexos/:arquivo',
    {
      config: { permissao: 'chamados.ver' },
      schema: {
        summary: 'Um anexo do chamado, para baixar, a quem vê o chamado',
        params: ParametrosDoAnexo,
        response: ENTREGA_DO_ANEXO,
      },
    },
    async (requisicao, resposta) => {
      const { numero, arquivo } = requisicao.params;
      const lido = await anexoDoChamado(requisicao, numero, arquivo);
      return entregarAnexo(armazenamento, requisicao, resposta, arquivo, lido);
    },
  );

  app.get(
    '/chamados/:numero/anexos/:arquivo/miniatura',
    {
      config: { permissao: 'chamados.ver' },
      schema: {
        summary: 'A miniatura de um anexo de imagem do chamado, a quem vê o chamado',
        params: ParametrosDoAnexo,
        response: ENTREGA_DA_MINIATURA,
      },
    },
    async (requisicao, resposta) => {
      const { numero, arquivo } = requisicao.params;
      const lido = await anexoDoChamado(requisicao, numero, arquivo);
      return entregarMiniatura(armazenamento, requisicao, resposta, arquivo, lido);
    },
  );
};
