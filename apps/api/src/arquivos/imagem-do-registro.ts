// A imagem de um registro (spec arquivos-e-imagens; design do F2c, decisões 6 a 8, e do P1a, decisão
// 6): o caminho comum da foto da pessoa e da imagem do modelo. A troca confere o dono antes de
// tratar a imagem, grava as variantes no armazenamento e só então, numa transação, registra o
// arquivo, aponta o dono, marca a imagem anterior como removida e audita; se a transação falha, o
// que foi gravado é apagado. A entrega confere o dono como a leitura dele. O dono entra por funções,
// e só estas rotas leem um corpo que não é JSON: os bytes da imagem, até 10 MiB.
import { arquivos, type Banco, naOrganizacao, type Transacao } from '@grafite/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { exigirAtiva } from '../acesso/escopo.ts';
import { naoEncontrado } from '../problemas.ts';
import { type Armazenamento, chaveDoArquivo, VARIANTES, type Variante } from './armazenamento.ts';
import { BytesDaImagem } from './esquemas.ts';
import { formatoNaoAceito, imagemPesadaDemais, LIMITE_DO_ENVIO, tratarImagem } from './imagens.ts';

export interface DependenciasDasImagens {
  banco: Banco;
  agora: () => Date;
  armazenamento: Armazenamento;
}

/** Quem pede a mudança: a organização, a conta e o log da requisição. */
export interface QuemMuda {
  orgId: string;
  contaId: string;
  log: { warn: (dados: object, mensagem: string) => void };
}

/** O dono de uma imagem, como a rota o conferiu na transação, com a imagem atual dele. */
export interface DonoDaImagem {
  imagemId: string | null;
}

/** A mudança que o dono audita: a imagem nova (nenhuma, na remoção) e a anterior. */
export interface MudancaDaImagem {
  arquivoId: string | null;
  anteriorId: string | null;
}

/** As funções que ligam o caminho comum ao registro dono da imagem. */
export interface ImagemDoRegistro<D extends DonoDaImagem> {
  /** Lê e confere o dono. Com `travar`, a linha dele fica presa até o fim da transação. */
  conferir(tx: Transacao, travar: boolean): Promise<D>;
  /** Aponta o dono para a imagem nova, ou para nenhuma. */
  apontar(tx: Transacao, dono: D, imagemId: string | null, momento: Date): Promise<void>;
  /** Audita a troca ou a remoção, com o evento de saída do dono. */
  auditar(tx: Transacao, dono: D, mudanca: MudancaDaImagem, momento: Date): Promise<void>;
}

/** Os tipos que o envio aceita no Content-Type; quem decide o formato é o conteúdo. */
export const TIPOS_DO_ENVIO = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'application/octet-stream',
];

/** A resposta da entrega, para o contrato. */
export const IMAGEM_ENTREGUE = {
  description: 'A imagem: a completa no tipo do registro, e as miniaturas em WebP',
  content: {
    'image/webp': { schema: BytesDaImagem },
    'image/svg+xml': { schema: BytesDaImagem },
  },
};

export const imagemNaoEncontrada = () => naoEncontrado('Imagem não encontrada.');

/** Quem muda, lido da requisição com a sessão. */
export function quemMuda(requisicao: FastifyRequest, contaId: string): QuemMuda {
  return { orgId: requisicao.organizacao?.id ?? '', contaId, log: requisicao.log };
}

/** Apaga as chaves gravadas; uma que falha não impede as outras nem esconde o erro original. */
export async function apagarChaves(quem: QuemMuda, armazenamento: Armazenamento, chaves: string[]) {
  const resultados = await Promise.allSettled(chaves.map((chave) => armazenamento.apagar(chave)));
  for (const resultado of resultados) {
    if (resultado.status === 'rejected') {
      quem.log.warn({ err: resultado.reason }, 'não foi possível apagar um arquivo');
    }
  }
}

/**
 * Grava cada variante dada, como as cinco de uma imagem ou só a completa de um documento; se uma
 * falha, as já gravadas são apagadas. Devolve as chaves gravadas.
 */
export async function gravarVariantes(
  quem: QuemMuda,
  armazenamento: Armazenamento,
  arquivoId: string,
  variantes: Partial<Record<Variante, Buffer>>,
): Promise<string[]> {
  const gravadas: string[] = [];
  try {
    for (const variante of VARIANTES) {
      const conteudo = variantes[variante];
      if (!conteudo) continue;
      const chave = chaveDoArquivo(quem.orgId, arquivoId, variante);
      await armazenamento.gravar(chave, conteudo);
      gravadas.push(chave);
    }
    return gravadas;
  } catch (erro) {
    await apagarChaves(quem, armazenamento, gravadas);
    throw erro;
  }
}

export async function novoIdDoArquivo(tx: Transacao): Promise<string> {
  const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
  const id = rows[0]?.id;
  if (!id) throw new Error('O banco não gerou o identificador do arquivo.');
  return id;
}

/** Troca a imagem do dono pela enviada e devolve o que `responder` lê depois da troca. */
export async function trocarImagem<D extends DonoDaImagem, T>(
  { banco, agora, armazenamento }: DependenciasDasImagens,
  quem: QuemMuda,
  registro: ImagemDoRegistro<D>,
  { conteudo, responder }: { conteudo: Buffer; responder: (tx: Transacao) => Promise<T> },
): Promise<T> {
  // A recusa vem antes do tratamento: quem não pode trocar não gasta o servidor nem grava nada.
  const arquivoId = await naOrganizacao(banco, quem.orgId, async (tx) => {
    await registro.conferir(tx, false);
    return novoIdDoArquivo(tx);
  });
  const imagem = await tratarImagem(conteudo);
  const chaves = await gravarVariantes(quem, armazenamento, arquivoId, imagem.variantes);
  try {
    return await naOrganizacao(banco, quem.orgId, async (tx) => {
      const dono = await registro.conferir(tx, true);
      const momento = agora();
      await tx.insert(arquivos).values({
        id: arquivoId,
        orgId: sql`app.current_org()`,
        tipo: imagem.tipo,
        bytes: imagem.variantes.completa.length,
        largura: imagem.largura,
        altura: imagem.altura,
        variantes: [...VARIANTES],
        enviadoPor: quem.contaId,
        enviadoEm: momento,
      });
      await registro.apontar(tx, dono, arquivoId, momento);
      if (dono.imagemId) {
        await tx
          .update(arquivos)
          .set({ removidoEm: momento })
          .where(eq(arquivos.id, dono.imagemId));
      }
      // Sem a imagem: o registro diz quem trocou e os arquivos, nunca o conteúdo.
      await registro.auditar(tx, dono, { arquivoId, anteriorId: dono.imagemId }, momento);
      return responder(tx);
    });
  } catch (erro) {
    await apagarChaves(quem, armazenamento, chaves);
    throw erro;
  }
}

/** Tira a imagem do dono, que deixa de ser entregue na hora; sem imagem, nada muda. */
export async function tirarImagem<D extends DonoDaImagem, T>(
  { banco, agora }: DependenciasDasImagens,
  quem: QuemMuda,
  registro: ImagemDoRegistro<D>,
  { responder }: { responder: (tx: Transacao) => Promise<T> },
): Promise<T> {
  return naOrganizacao(banco, quem.orgId, async (tx) => {
    const dono = await registro.conferir(tx, true);
    if (dono.imagemId) {
      const momento = agora();
      await registro.apontar(tx, dono, null, momento);
      await tx.update(arquivos).set({ removidoEm: momento }).where(eq(arquivos.id, dono.imagemId));
      await registro.auditar(tx, dono, { arquivoId: null, anteriorId: dono.imagemId }, momento);
    }
    return responder(tx);
  });
}

/**
 * Entrega um tamanho da imagem atual do dono. O endereço leva o arquivo, então a imagem pode ficar
 * guardada no navegador: uma imagem nova tem outro endereço, e a antiga deixa de ser entregue.
 */
export async function entregarImagem(
  { banco, armazenamento }: Pick<DependenciasDasImagens, 'banco' | 'armazenamento'>,
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  {
    arquivo,
    tamanho,
    imagemAtual,
  }: { arquivo: string; tamanho: Variante; imagemAtual: (tx: Transacao) => Promise<string | null> },
) {
  const orgId = requisicao.organizacao?.id ?? '';
  const tipo = await naOrganizacao(banco, orgId, async (tx) => {
    if ((await imagemAtual(tx)) !== arquivo) throw imagemNaoEncontrada();
    const [registro] = await tx
      .select({ tipo: arquivos.tipo, variantes: arquivos.variantes })
      .from(arquivos)
      .where(and(eq(arquivos.id, arquivo), isNull(arquivos.removidoEm)));
    if (!registro?.variantes.includes(tamanho)) throw imagemNaoEncontrada();
    return tamanho === 'completa' ? registro.tipo : 'image/webp';
  });
  const conteudo = await armazenamento.abrir(chaveDoArquivo(orgId, arquivo, tamanho));
  if (!conteudo) throw imagemNaoEncontrada();
  return responderComImagem(resposta, tipo, conteudo);
}

/** Responde um tamanho de uma imagem, para a página exibir e o navegador guardar. */
export function responderComImagem(resposta: FastifyReply, tipo: string, conteudo: Buffer) {
  resposta.headers({
    'content-type': tipo,
    'x-content-type-options': 'nosniff',
    'content-disposition': 'inline',
    'cache-control': 'private, max-age=31536000, immutable',
  });
  // Aberto direto numa aba, o SVG não roda script nem busca nada de fora.
  if (tipo === 'image/svg+xml') {
    resposta.header(
      'content-security-policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
  }
  return resposta.send(conteudo);
}

/**
 * O corpo das rotas das imagens: os bytes de uma imagem, até 10 MiB, só com a sessão que vale. O
 * resto é recusado como formato não aceito, e o corpo grande demais, como a imagem que passa de
 * 10 MB. Vale para o plugin inteiro: as rotas das imagens ficam num plugin só delas.
 */
export function aceitarImagens(app: FastifyInstance) {
  app.addHook('onRequest', async (requisicao) => {
    if (requisicao.method !== 'GET') await exigirAtiva(requisicao);
  });
  app.removeAllContentTypeParsers();
  const opcoes = { parseAs: 'buffer', bodyLimit: LIMITE_DO_ENVIO } as const;
  const comoBytes = (
    _requisicao: FastifyRequest,
    corpo: Buffer,
    pronto: (erro: null, corpo: Buffer) => void,
  ) => pronto(null, corpo);
  app.addContentTypeParser(/^image\//, opcoes, comoBytes);
  app.addContentTypeParser('application/octet-stream', opcoes, comoBytes);
  app.setErrorHandler((erro: FastifyError) => {
    if (erro.code === 'FST_ERR_CTP_BODY_TOO_LARGE') throw imagemPesadaDemais();
    if (erro.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') throw formatoNaoAceito();
    throw erro;
  });
}
