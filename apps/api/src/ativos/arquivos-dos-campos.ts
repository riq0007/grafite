// Os arquivos e as imagens dos campos do ativo (spec cadastro-de-ativos, "Arquivos e imagens nos
// campos do ativo", e arquivos-e-imagens; design do P1d, decisão 5). O envio confere o acesso antes
// de ler o conteúdo; o documento é conferido pelo conteúdo e guardado como chegou, e a imagem é
// tratada como as outras. O conteúdo vai para o armazenamento fora da transação e, nela, com a linha
// do ativo travada, entram o registro do arquivo com o nome, o valor do campo, o estado de uma edição
// manual, o anterior marcado como removido e a auditoria pelos nomes, com o evento. A entrega segue
// quem vê o campo: o documento sempre para baixar, com o nome original, e a imagem na página.
import { arquivos, ativos, naOrganizacao, type Transacao } from '@grafite/db';
import {
  type ArvoreDeLocais,
  type CamposDoAtivo,
  camposDoAtivo,
  type DefinicaoNoAtivo,
  type EstadoDoCampo,
  registrarGravacao,
  type ValorDeCampo,
} from '@grafite/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { exigirAtiva, exigirEm, sessaoDa } from '../acesso/escopo.ts';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { chaveDoArquivo, type Variante } from '../arquivos/armazenamento.ts';
import {
  arquivoVazio,
  conferirDocumento,
  documentoNaoAceito,
  documentoPesadoDemais,
  LIMITE_DO_DOCUMENTO,
  nomeDoArquivo,
} from '../arquivos/documentos.ts';
import {
  apagarChaves,
  type DependenciasDasImagens,
  gravarVariantes,
  imagemNaoEncontrada,
  novoIdDoArquivo,
  quemMuda,
  responderComImagem,
} from '../arquivos/imagem-do-registro.ts';
import { type OrigemDaImagem, tratarImagem } from '../arquivos/imagens.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { saidaDoAtivo } from '../eventos/ativos.ts';
import { naoEncontrado } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { camposDaOrganizacao, lerTipoDoAtivo, visaoDoAtivo } from './escrita.ts';
import { consultarAtivos, fichaDoAtivo, type LinhaDoAtivo, lerAtivo } from './leitura.ts';

const arquivoNaoEncontrado = () => naoEncontrado('Arquivo não encontrado.');

/** A extensão do nome de uma imagem, pelo formato que chegou: a guardada é regravada. */
const EXTENSAO_DA_IMAGEM: Record<OrigemDaImagem, string> = {
  png: '.png',
  jpeg: '.jpg',
  webp: '.webp',
  avif: '.avif',
  svg: '.svg',
};

/** O que vai para o registro do arquivo e para o armazenamento. */
interface ArquivoConferido {
  nome: string;
  tipo: string;
  bytes: number;
  largura: number | null;
  altura: number | null;
  variantes: Partial<Record<Variante, Buffer>>;
}

/**
 * O campo de arquivo ou de imagem do tipo do ativo, ativo, com o acesso conferido no local do ativo:
 * a permissão pedida e, num campo restrito, também `ativos.restritos`. O campo de outro tipo, tirado
 * do tipo ou inativo responde como o que não existe.
 */
async function campoDeArquivoDo(
  tx: Transacao,
  requisicao: FastifyRequest,
  linha: LinhaDoAtivo,
  campoId: string,
  { permissao, arvore }: { permissao: 'ativos.editar' | 'ativos.ver'; arvore: ArvoreDeLocais },
): Promise<{ definicoes: CamposDoAtivo; definicao: DefinicaoNoAtivo }> {
  exigirEm(requisicao, permissao, linha.ativo.localId, arvore);
  const tipo = await lerTipoDoAtivo(tx, linha.ativo.tipoId);
  const definicoes = camposDoAtivo({
    tipo: tipo ?? { capacidades: [], campos: [] },
    campos: await camposDaOrganizacao(tx),
  });
  const definicao = definicoes.porChave.get(campoId);
  if (!definicao || (definicao.tipo !== 'arquivo' && definicao.tipo !== 'imagem')) {
    throw naoEncontrado('Campo não encontrado.');
  }
  if (definicao.restrito) exigirEm(requisicao, 'ativos.restritos', linha.ativo.localId, arvore);
  return { definicoes, definicao };
}

/** O conteúdo conferido pelo tipo do campo: a imagem tratada, ou o documento como chegou. */
async function conferirConteudo(
  tipoDoCampo: DefinicaoNoAtivo['tipo'],
  conteudo: Buffer,
  nome: string,
): Promise<ArquivoConferido> {
  if (conteudo.length === 0) throw arquivoVazio();
  if (tipoDoCampo === 'imagem') {
    const imagem = await tratarImagem(conteudo);
    return {
      nome: nomeDoArquivo(nome, EXTENSAO_DA_IMAGEM[imagem.origem]),
      tipo: imagem.tipo,
      bytes: imagem.variantes.completa.length,
      largura: imagem.largura,
      altura: imagem.altura,
      variantes: imagem.variantes,
    };
  }
  const documento = conferirDocumento(conteudo, nome);
  return {
    nome: nomeDoArquivo(nome, documento.extensao),
    tipo: documento.tipo,
    bytes: conteudo.length,
    largura: null,
    altura: null,
    variantes: { completa: conteudo },
  };
}

/**
 * Grava o arquivo no campo, ou tira o que ele tem: o valor no JSONB, o estado de uma edição manual,
 * que a trava não impede, o anterior marcado como removido e a auditoria pelos nomes, com o evento.
 */
async function gravarNoCampo(
  tx: Transacao,
  {
    requisicao,
    sessao,
    arvore,
    momento,
    atual,
    definicoes,
    campoId,
    arquivoId,
  }: {
    requisicao: FastifyRequest;
    sessao: SessaoDaRequisicao;
    arvore: ArvoreDeLocais;
    momento: Date;
    atual: LinhaDoAtivo;
    definicoes: CamposDoAtivo;
    campoId: string;
    arquivoId: string | null;
  },
) {
  const valores = { ...(atual.ativo.valores as Record<string, ValorDeCampo>) };
  const anterior = valores[campoId];
  if (arquivoId) valores[campoId] = arquivoId;
  else delete valores[campoId];
  const estado = registrarGravacao(atual.ativo.estado as Record<string, EstadoDoCampo>, [campoId], {
    origem: 'manual',
    momento: momento.toISOString(),
    autorId: sessao.contaId,
  });
  await tx
    .update(ativos)
    .set({ valores, estado, atualizadoEm: momento })
    .where(eq(ativos.id, atual.ativo.id));
  if (typeof anterior === 'string') {
    await tx
      .update(arquivos)
      .set({ removidoEm: momento })
      .where(and(eq(arquivos.id, anterior), isNull(arquivos.removidoEm)));
  }
  await registrarNaAuditoria(tx, {
    acao: 'ativo.alterado',
    ator: { tipo: 'conta', contaId: sessao.contaId },
    alvo: { tipo: 'ativo', id: atual.ativo.id },
    antes: await visaoDoAtivo(tx, atual, definicoes, arvore),
    depois: await visaoDoAtivo(tx, await lerAtivo(tx, atual.ativo.id), definicoes, arvore),
    origem: origemDa(requisicao),
    momento,
    saida: saidaDoAtivo({ ativoId: atual.ativo.id, locais: [atual.ativo.localId] }),
  });
}

/** Envia ou troca o arquivo de um campo, e devolve a ficha do ativo. */
export async function trocarArquivoDoCampo(
  { banco, agora, armazenamento }: DependenciasDasImagens,
  requisicao: FastifyRequest,
  {
    ativoId,
    campoId,
    conteudo,
    nome,
  }: { ativoId: string; campoId: string; conteudo: Buffer; nome: string },
) {
  const sessao = sessaoDa(requisicao);
  const quem = quemMuda(requisicao, sessao.contaId);
  // A recusa vem antes da conferência: quem não pode mudar não gasta o servidor nem grava nada.
  const { tipoDoCampo, arquivoId } = await naOrganizacao(banco, quem.orgId, async (tx) => {
    const linha = await lerAtivo(tx, ativoId);
    const { definicao } = await campoDeArquivoDo(tx, requisicao, linha, campoId, {
      permissao: 'ativos.editar',
      arvore: await lerArvore(tx),
    });
    return { tipoDoCampo: definicao.tipo, arquivoId: await novoIdDoArquivo(tx) };
  });
  const conferido = await conferirConteudo(tipoDoCampo, conteudo, nome);
  const chaves = await gravarVariantes(quem, armazenamento, arquivoId, conferido.variantes);
  try {
    return await naOrganizacao(banco, quem.orgId, async (tx) => {
      const arvore = await lerArvore(tx);
      const atual = await lerAtivo(tx, ativoId, { travar: true });
      const { definicoes } = await campoDeArquivoDo(tx, requisicao, atual, campoId, {
        permissao: 'ativos.editar',
        arvore,
      });
      const momento = agora();
      await tx.insert(arquivos).values({
        id: arquivoId,
        orgId: sql`app.current_org()`,
        nome: conferido.nome,
        tipo: conferido.tipo,
        bytes: conferido.bytes,
        largura: conferido.largura,
        altura: conferido.altura,
        variantes: Object.keys(conferido.variantes),
        enviadoPor: sessao.contaId,
        enviadoEm: momento,
      });
      await gravarNoCampo(tx, {
        requisicao,
        sessao,
        arvore,
        momento,
        atual,
        definicoes,
        campoId,
        arquivoId,
      });
      return fichaDoAtivo(tx, await lerAtivo(tx, ativoId), sessao, arvore);
    });
  } catch (erro) {
    await apagarChaves(quem, armazenamento, chaves);
    throw erro;
  }
}

/** Tira o arquivo do campo, que deixa de ser entregue na hora; sem arquivo, nada muda. */
export async function tirarArquivoDoCampo(
  { banco, agora }: Pick<DependenciasDasImagens, 'banco' | 'agora'>,
  requisicao: FastifyRequest,
  { ativoId, campoId }: { ativoId: string; campoId: string },
) {
  const sessao = sessaoDa(requisicao);
  return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
    const arvore = await lerArvore(tx);
    const atual = await lerAtivo(tx, ativoId, { travar: true });
    const { definicoes } = await campoDeArquivoDo(tx, requisicao, atual, campoId, {
      permissao: 'ativos.editar',
      arvore,
    });
    if (Object.hasOwn(atual.ativo.valores as object, campoId)) {
      await gravarNoCampo(tx, {
        requisicao,
        sessao,
        arvore,
        momento: agora(),
        atual,
        definicoes,
        campoId,
        arquivoId: null,
      });
    }
    return fichaDoAtivo(tx, await lerAtivo(tx, ativoId), sessao, arvore);
  });
}

/** O nome do anexo sem o que sai do ASCII, para os navegadores que não leem o `filename*`. */
export const nomeEmAscii = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_');

/** O nome do anexo em UTF-8, como o `filename*` pede (RFC 8187). */
export const nomeCodificado = (nome: string) =>
  encodeURIComponent(nome).replace(
    /['()*]/g,
    (caractere) => `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * Entrega uma variante do arquivo atual do campo a quem vê o campo. O documento vai sempre para
 * baixar, com o nome original; a imagem, para a página, como as outras.
 */
export async function entregarArquivoDoCampo(
  { banco, armazenamento }: Pick<DependenciasDasImagens, 'banco' | 'armazenamento'>,
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  {
    ativoId,
    campoId,
    arquivo,
    variante,
  }: { ativoId: string; campoId: string; arquivo: string; variante: Variante },
) {
  const orgId = requisicao.organizacao?.id ?? '';
  const { imagem, registro } = await naOrganizacao(banco, orgId, async (tx) => {
    // O ativo que não existe responde como o arquivo que falta.
    const [atual] = await consultarAtivos(tx).where(eq(ativos.id, ativoId));
    if (!atual) throw arquivoNaoEncontrado();
    const { definicao } = await campoDeArquivoDo(tx, requisicao, atual, campoId, {
      permissao: 'ativos.ver',
      arvore: await lerArvore(tx),
    });
    const naoEncontradoDoCampo =
      definicao.tipo === 'imagem' ? imagemNaoEncontrada : arquivoNaoEncontrado;
    if ((atual.ativo.valores as Record<string, unknown>)[campoId] !== arquivo) {
      throw naoEncontradoDoCampo();
    }
    const [lido] = await tx
      .select({ nome: arquivos.nome, tipo: arquivos.tipo, variantes: arquivos.variantes })
      .from(arquivos)
      .where(and(eq(arquivos.id, arquivo), isNull(arquivos.removidoEm)));
    if (!lido?.variantes.includes(variante)) throw naoEncontradoDoCampo();
    return { imagem: definicao.tipo === 'imagem', registro: lido };
  });
  const conteudo = await armazenamento.abrir(chaveDoArquivo(orgId, arquivo, variante));
  if (!conteudo) throw imagem ? imagemNaoEncontrada() : arquivoNaoEncontrado();
  if (imagem) {
    return responderComImagem(
      resposta,
      variante === 'completa' ? registro.tipo : 'image/webp',
      conteudo,
    );
  }
  const nome = registro.nome ?? 'arquivo';
  resposta.headers({
    'content-type': registro.tipo,
    'x-content-type-options': 'nosniff',
    'content-disposition': `attachment; filename="${nomeEmAscii(nome)}"; filename*=UTF-8''${nomeCodificado(nome)}`,
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': 'private, max-age=31536000, immutable',
  });
  return resposta.send(conteudo);
}

/**
 * O corpo do envio dos arquivos dos campos: os bytes, até 25 MiB, só com a sessão que vale. O resto
 * é recusado como formato não aceito, e o corpo grande demais, como o arquivo que passa de 25 MB.
 * Vale para o plugin inteiro: estas rotas ficam num plugin só delas.
 */
export function aceitarArquivos(app: FastifyInstance) {
  app.addHook('onRequest', async (requisicao) => {
    if (requisicao.method !== 'GET') await exigirAtiva(requisicao);
  });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: LIMITE_DO_DOCUMENTO },
    (_requisicao: FastifyRequest, corpo: Buffer, pronto: (erro: null, corpo: Buffer) => void) =>
      pronto(null, corpo),
  );
  app.setErrorHandler((erro: FastifyError) => {
    if (erro.code === 'FST_ERR_CTP_BODY_TOO_LARGE') throw documentoPesadoDemais();
    if (erro.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') throw documentoNaoAceito();
    throw erro;
  });
}
