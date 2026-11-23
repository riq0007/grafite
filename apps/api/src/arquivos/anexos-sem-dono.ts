// O envio e a entrega dos anexos que nascem sem dono (spec arquivos-e-imagens, "Anexos dos chamados"
// e "Anexos do chat"; changes chamados-da-ti, design, decisão 10, e chat-com-chamados, design,
// decisão 1): um arquivo por envio, com as regras de "Arquivos aceitos". O conteúdo vai para o
// armazenamento fora da transação e, nela, entram o registro do arquivo, com quem o enviou, e o
// anexo sem dono, na tabela de quem o toma depois. O documento vai sempre para baixar, com o nome
// original, como o arquivo de um campo do ativo. A imagem que se lê ganha a miniatura de 512 px, que
// vai para exibir na página (change chat-com-chamados, tarefa 4.20).
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
import { BytesDaImagem, BytesDoArquivo } from './esquemas.ts';
import {
  apagarChaves,
  type DependenciasDasImagens,
  gravarVariantes,
  novoIdDoArquivo,
  quemMuda,
  responderComImagem,
} from './imagem-do-registro.ts';
import { ladosDaMiniatura, miniaturaDoAnexo } from './imagens.ts';

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

export const ENTREGA_DA_MINIATURA = {
  200: {
    description: 'A miniatura de 512 px do anexo de imagem, em WebP, para exibir na página',
    content: { 'image/webp': { schema: BytesDaImagem } },
  },
  401: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

/**
 * A miniatura do anexo de imagem na resposta das conversas (spec arquivos-e-imagens, "Miniatura do
 * anexo de imagem"): as dimensões dela, para a página reservar o lugar antes de ela chegar.
 */
export const MiniaturaDoAnexo = z
  .object({ largura: z.int(), altura: z.int() })
  .meta({ id: 'MiniaturaDoAnexo' });
export type MiniaturaDoAnexo = z.infer<typeof MiniaturaDoAnexo>;

/** O que o registro do arquivo diz da miniatura: a variante e as dimensões da imagem, de pé. */
export interface ArquivoComMiniatura {
  variantes: string[];
  largura: number | null;
  altura: number | null;
}

/** A miniatura do anexo, ou nula no que não a tem, como o documento e a imagem de antes dela. */
export function miniaturaDe({
  variantes,
  largura,
  altura,
}: ArquivoComMiniatura): MiniaturaDoAnexo | null {
  if (!variantes.includes('512') || largura === null || altura === null) return null;
  return ladosDaMiniatura(largura, altura);
}

/** Os tipos de imagem que ganham a miniatura no envio; o SVG não é um tipo aceito do anexo. */
const TIPOS_COM_MINIATURA: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
]);

/**
 * Recebe o arquivo enviado: confere o tipo pelo conteúdo, antes de gastar o armazenamento, grava o
 * conteúdo, com a miniatura da imagem que se lê, e, numa transação, o registro do arquivo e o anexo
 * sem dono, que `semDono` insere. O conteúdo gravado sai de novo se a transação falha.
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
  const miniatura = TIPOS_COM_MINIATURA.has(documento.tipo)
    ? await miniaturaDoAnexo(conteudo)
    : null;
  const arquivoId = await naOrganizacao(banco, quem.orgId, novoIdDoArquivo);
  const chaves = await gravarVariantes(quem, armazenamento, arquivoId, {
    completa: conteudo,
    ...(miniatura && { '512': miniatura.conteudo }),
  });
  try {
    await naOrganizacao(banco, quem.orgId, async (tx) => {
      await tx.insert(arquivos).values({
        id: arquivoId,
        orgId: sql`app.current_org()`,
        nome,
        tipo: documento.tipo,
        bytes: conteudo.length,
        // As dimensões são as da imagem enviada, de pé; a miniatura sai delas na resposta.
        largura: miniatura?.largura ?? null,
        altura: miniatura?.altura ?? null,
        variantes: miniatura ? ['completa', '512'] : ['completa'],
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

/**
 * Entrega a miniatura do anexo de imagem, para exibir na página, à mesma gente do anexo, que a rota
 * confere antes. O anexo sem ela, como o documento, falta como o arquivo que não existe.
 */
export async function entregarMiniatura(
  armazenamento: Armazenamento,
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  arquivoId: string,
  { variantes }: { variantes: string[] },
) {
  if (!variantes.includes('512')) throw arquivoNaoEncontrado();
  const conteudo = await armazenamento.abrir(
    chaveDoArquivo(requisicao.organizacao?.id ?? '', arquivoId, '512'),
  );
  if (!conteudo) throw arquivoNaoEncontrado();
  return responderComImagem(resposta, 'image/webp', conteudo);
}
