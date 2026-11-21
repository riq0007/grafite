// O envio e a entrega dos anexos que nascem sem dono (spec arquivos-e-imagens, "Anexos dos chamados"
// e "Anexos do chat"; changes chamados-da-ti, design, decisão 10, e chat-com-chamados, design,
// decisão 1): um arquivo por envio, com as regras de "Arquivos aceitos". O conteúdo vai para o
// armazenamento fora da transação e, nela, entram o registro do arquivo, com quem o enviou, e o
// anexo sem dono, na tabela de quem o toma depois. O documento vai sempre para baixar, com o nome
// original, como o arquivo de um campo do ativo.
import { arquivos, naOrganizacao, type Transacao } from '@grafite/db';
import { sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { nomeCodificado, nomeEmAscii } from '../ativos/arquivos-dos-campos.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from '../rotas/sessao.ts';
import { type Armazenamento, chaveDoArquivo } from './armazenamento.ts';
import { conferirDocumento, nomeDoArquivo } from './documentos.ts';
import { BytesDoArquivo } from './esquemas.ts';
import {
  apagarChaves,
  type DependenciasDasImagens,
  gravarVariantes,
  novoIdDoArquivo,
  quemMuda,
} from './imagem-do-registro.ts';

export const arquivoNaoEncontrado = () => naoEncontrado('Arquivo não encontrado.');

export const AnexoEnviado = z
  .object({
    /** O id do arquivo, que a gravação que usa o anexo toma. */
    id: z.uuid(),
    /** O nome guardado: sem o caminho e com a extensão do tipo conferido. */
    nome: z.string(),
    /** O tipo conferido pelo conteúdo. */
    tipo: z.string(),
    bytes: z.int(),
  })
  .meta({ id: 'AnexoEnviado' });
export type AnexoEnviado = z.infer<typeof AnexoEnviado>;

export const ParametrosDoAnexoSemDono = z.object({
  arquivo: z.uuid({ error: 'Arquivo não encontrado.' }),
});

export const PROBLEMAS_DO_ENVIO = {
  401: RespostaDeProblema,
  413: RespostaDeProblema,
  415: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

export const ENTREGA_DO_ANEXO = {
  200: {
    description: 'O anexo, para baixar, no tipo conferido e com o nome original',
    content: { 'application/octet-stream': { schema: BytesDoArquivo } },
  },
  401: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

/**
 * Recebe o arquivo enviado: confere o tipo pelo conteúdo, antes de gastar o armazenamento, grava o
 * conteúdo e, numa transação, o registro do arquivo e o anexo sem dono, que `semDono` insere. O
 * conteúdo gravado sai de novo se a transação falha.
 */
export async function receberAnexo(
  { banco, agora, armazenamento }: DependenciasDasImagens,
  requisicao: FastifyRequest,
  { conteudo, nomePedido }: { conteudo: Buffer; nomePedido: string },
  semDono: (tx: Transacao, arquivoId: string) => Promise<unknown>,
): Promise<AnexoEnviado> {
  const sessao = sessaoDa(requisicao);
  const quem = quemMuda(requisicao, sessao.contaId);
  const documento = conferirDocumento(conteudo, nomePedido);
  const nome = nomeDoArquivo(nomePedido, documento.extensao);
  const arquivoId = await naOrganizacao(banco, quem.orgId, novoIdDoArquivo);
  const chaves = await gravarVariantes(quem, armazenamento, arquivoId, { completa: conteudo });
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
      await semDono(tx, arquivoId);
    });
  } catch (erro) {
    await apagarChaves(quem, armazenamento, chaves);
    throw erro;
  }
  return { id: arquivoId, nome, tipo: documento.tipo, bytes: conteudo.length };
}

/** Entrega o conteúdo do anexo para baixar; o que saiu do armazenamento falta como o removido. */
export async function entregarAnexo(
  armazenamento: Armazenamento,
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  arquivoId: string,
  { nome, tipo }: { nome: string | null; tipo: string },
) {
  const conteudo = await armazenamento.abrir(
    chaveDoArquivo(requisicao.organizacao?.id ?? '', arquivoId, 'completa'),
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
