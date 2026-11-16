// Os anexos dos chamados pela API (spec arquivos-e-imagens, "Anexos dos chamados"; change
// chamados-da-ti, design, decisão 10, tarefa 4.6):
// - o envio, um arquivo por vez, com `chamados.atender` em algum local e as regras de "Arquivos
//   aceitos": o conteúdo vai para o armazenamento fora da transação e, nela, entram o registro do
//   arquivo, com quem o enviou, e o anexo sem dono, que a gravação da mensagem, da nota, da abertura
//   ou do campo toma depois (`tomarAnexos`);
// - a entrega do anexo sem dono, só a quem o enviou;
// - a entrega pelo chamado dono, a quem vê o chamado. O da nota e o de um campo só da TI vão só a
//   quem vê o chamado com `chamados.ver`, que nesta change é o único jeito de ver um chamado: a
//   leitura que o chat e a aba darão à pessoa recusará os dois.
// O documento vai sempre para baixar, com o nome original, como o arquivo de um campo do ativo. Num
// plugin só deles, porque o corpo do envio é o arquivo, até 25 MiB, e não JSON.
import { anexosDosChamados, arquivos, naOrganizacao, type Transacao } from '@grafite/db';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { chaveDoArquivo } from '../arquivos/armazenamento.ts';
import { conferirDocumento, nomeDoArquivo } from '../arquivos/documentos.ts';
import { BytesDoArquivo } from '../arquivos/esquemas.ts';
import {
  apagarChaves,
  type DependenciasDasImagens,
  gravarVariantes,
  novoIdDoArquivo,
  quemMuda,
} from '../arquivos/imagem-do-registro.ts';
import { aceitarArquivos, nomeCodificado, nomeEmAscii } from '../ativos/arquivos-dos-campos.ts';
import { NomeDoArquivoEnviado } from '../ativos/esquemas.ts';
import { chamadoQueAContaVe, NumeroDoChamado } from '../chamados/alcance.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const arquivoNaoEncontrado = () => naoEncontrado('Arquivo não encontrado.');

const AnexoEnviado = z
  .object({
    /** O id do arquivo, que a gravação da mensagem, da nota, da abertura ou do campo toma. */
    id: z.uuid(),
    /** O nome guardado: sem o caminho e com a extensão do tipo conferido. */
    nome: z.string(),
    /** O tipo conferido pelo conteúdo. */
    tipo: z.string(),
    bytes: z.int(),
  })
  .meta({ id: 'AnexoEnviado' });

const ParametrosDoAnexoSemDono = z.object({
  arquivo: z.uuid({ error: 'Arquivo não encontrado.' }),
});

const ParametrosDoAnexo = ParametrosDoAnexoSemDono.extend({ numero: NumeroDoChamado });

const PROBLEMAS_DO_ENVIO = {
  401: RespostaDeProblema,
  413: RespostaDeProblema,
  415: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

const ENTREGA = {
  200: {
    description: 'O anexo, para baixar, no tipo conferido e com o nome original',
    content: { 'application/octet-stream': { schema: BytesDoArquivo } },
  },
  401: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

/** O arquivo do anexo que a condição acha, não removido, com o que a entrega informa. */
async function arquivoDoAnexo(tx: Transacao, arquivoId: string, dono: SQL | undefined) {
  const [lido] = await tx
    .select({ nome: arquivos.nome, tipo: arquivos.tipo })
    .from(anexosDosChamados)
    .innerJoin(arquivos, eq(arquivos.id, anexosDosChamados.arquivoId))
    .where(and(eq(anexosDosChamados.arquivoId, arquivoId), isNull(arquivos.removidoEm), dono));
  if (!lido) throw arquivoNaoEncontrado();
  return lido;
}

export const rotasDosAnexosDosChamados: FastifyPluginAsyncZod<DependenciasDasImagens> = async (
  app,
  { banco, agora, armazenamento },
) => {
  aceitarArquivos(app);
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';

  /** Entrega o conteúdo do anexo para baixar; o que saiu do armazenamento falta como o removido. */
  async function entregar(
    requisicao: FastifyRequest,
    resposta: FastifyReply,
    arquivoId: string,
    { nome, tipo }: { nome: string | null; tipo: string },
  ) {
    const conteudo = await armazenamento.abrir(
      chaveDoArquivo(orgDa(requisicao), arquivoId, 'completa'),
    );
    if (!conteudo) throw arquivoNaoEncontrado();
    const baixado = nome ?? 'arquivo';
    resposta.headers({
      'content-type': tipo,
      'x-content-type-options': 'nosniff',
      'content-disposition': `attachment; filename="${nomeEmAscii(baixado)}"; filename*=UTF-8''${nomeCodificado(baixado)}`,
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, max-age=31536000, immutable',
    });
    return resposta.send(conteudo);
  }

  app.post(
    '/chamados/anexos',
    {
      config: { permissao: 'chamados.atender' },
      schema: {
        summary: 'Enviar um anexo, sem dono até a gravação que o usa',
        querystring: NomeDoArquivoEnviado,
        consumes: ['application/octet-stream'],
        body: BytesDoArquivo,
        response: { 201: AnexoEnviado, ...PROBLEMAS_DO_ENVIO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const quem = quemMuda(requisicao, sessao.contaId);
      const conteudo = requisicao.body;
      // O tipo vem do conteúdo, antes de gastar o armazenamento.
      const documento = conferirDocumento(conteudo, requisicao.query.nome ?? '');
      const nome = nomeDoArquivo(requisicao.query.nome ?? '', documento.extensao);
      const arquivoId = await naOrganizacao(banco, quem.orgId, novoIdDoArquivo);
      const chaves = await gravarVariantes(quem, armazenamento, arquivoId, {
        completa: conteudo,
      });
      try {
        await naOrganizacao(banco, quem.orgId, async (tx) => {
          await tx.insert(arquivos).values({
            id: arquivoId,
            orgId: sql`app.current_org()`,
            nome,
            tipo: documento.tipo,
            bytes: conteudo.length,
            variantes: ['completa'],
            enviadoPor: sessao.contaId,
            enviadoEm: agora(),
          });
          await tx.insert(anexosDosChamados).values({ orgId: sql`app.current_org()`, arquivoId });
        });
      } catch (erro) {
        await apagarChaves(quem, armazenamento, chaves);
        throw erro;
      }
      return resposta
        .code(201)
        .send({ id: arquivoId, nome, tipo: documento.tipo, bytes: conteudo.length });
    },
  );

  app.get(
    '/chamados/anexos/:arquivo',
    {
      config: { permissao: 'chamados.atender' },
      schema: {
        summary: 'O anexo ainda sem dono, para baixar, só a quem o enviou',
        params: ParametrosDoAnexoSemDono,
        response: ENTREGA,
      },
    },
    async (requisicao, resposta) => {
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
      return entregar(requisicao, resposta, arquivo, lido);
    },
  );

  app.get(
    '/chamados/:numero/anexos/:arquivo',
    {
      config: { permissao: 'chamados.ver' },
      schema: {
        summary: 'Um anexo do chamado, para baixar, a quem vê o chamado',
        params: ParametrosDoAnexo,
        response: ENTREGA,
      },
    },
    async (requisicao, resposta) => {
      const { numero, arquivo } = requisicao.params;
      const lido = await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const chamado = await chamadoQueAContaVe(tx, requisicao, numero);
        return arquivoDoAnexo(tx, arquivo, eq(anexosDosChamados.chamadoId, chamado.id));
      });
      return entregar(requisicao, resposta, arquivo, lido);
    },
  );
};
