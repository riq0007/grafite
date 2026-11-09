// A foto da pessoa (specs administracao-de-pessoas e arquivos-e-imagens; design do F2c, decisões 6
// a 8): a troca, a remoção e a entrega pelo caminho comum das imagens dos registros
// (`arquivos/imagem-do-registro.ts`), com a pessoa como dona. A entrega confere a pessoa como a
// leitura dela.
import { type Banco, contas, pessoas, type Transacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirAtiva, exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { type Armazenamento, VARIANTES } from '../arquivos/armazenamento.ts';
import { BytesDaImagem, FotoDaPessoa } from '../arquivos/esquemas.ts';
import {
  aceitarImagens,
  entregarImagem,
  IMAGEM_ENTREGUE,
  type ImagemDoRegistro,
  imagemNaoEncontrada,
  quemMuda,
  TIPOS_DO_ENVIO,
  tirarImagem,
  trocarImagem,
} from '../arquivos/imagem-do-registro.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { saidaDaPessoa } from '../eventos/pessoas.ts';
import { RespostaDeProblema } from '../problemas.ts';
import {
  FichaDaPessoa,
  fichaDaPessoa,
  type LinhaDaPessoa,
  lerPessoa,
  pessoaAnonimizada,
} from './pessoas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

export interface DependenciasDasFotos {
  banco: Banco;
  agora: () => Date;
  armazenamento: Armazenamento;
}

const ParametrosDaPessoa = z.object({ id: z.uuid({ error: 'Pessoa não encontrada.' }) });

const ParametrosDaPropriaFoto = z.object({
  arquivo: z.uuid({ error: 'Imagem não encontrada.' }),
  tamanho: z.enum(VARIANTES, { error: 'Use 64, 128, 256, 512 ou completa.' }),
});

const ParametrosDaEntrega = ParametrosDaPessoa.extend(ParametrosDaPropriaFoto.shape);

/** A foto da pessoa da própria conta, depois da troca ou da remoção. */
const FotoDaConta = z.object({ foto: FotoDaPessoa.nullable() }).meta({ id: 'FotoDaConta' });

const PROBLEMAS_DA_FOTO = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  413: RespostaDeProblema,
  415: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

/** A pessoa dona da foto, como a rota a conferiu na transação; a imagem é a foto atual. */
export interface DonaDaFoto {
  pessoaId: string;
  localId: string | null;
  imagemId: string | null;
  contaId: string | null;
}

export const donaDaLinha = ({ pessoa, conta }: LinhaDaPessoa): DonaDaFoto => ({
  pessoaId: pessoa.id,
  localId: pessoa.localId,
  imagemId: pessoa.fotoId,
  contaId: conta?.id ?? null,
});

/** A foto como imagem de um registro: a pessoa aponta para ela, e a auditoria vai para a pessoa. */
function fotoDaPessoa(
  requisicao: FastifyRequest,
  conferir: ImagemDoRegistro<DonaDaFoto>['conferir'],
): ImagemDoRegistro<DonaDaFoto> {
  return {
    conferir,
    async apontar(tx, dona, imagemId, momento) {
      await tx
        .update(pessoas)
        .set({ fotoId: imagemId, atualizadaEm: momento })
        .where(eq(pessoas.id, dona.pessoaId));
    },
    async auditar(tx, dona, { arquivoId, anteriorId }, momento) {
      const comum = {
        ator: { tipo: 'conta' as const, contaId: sessaoDa(requisicao).contaId },
        alvo: { tipo: 'pessoa', id: dona.pessoaId },
        origem: origemDa(requisicao),
        momento,
        saida: saidaDaPessoa({
          pessoaId: dona.pessoaId,
          locais: [dona.localId],
          contaId: dona.contaId ?? undefined,
        }),
      };
      await registrarNaAuditoria(
        tx,
        arquivoId
          ? { ...comum, acao: 'foto.trocada', dados: { arquivoId, arquivoAnteriorId: anteriorId } }
          : { ...comum, acao: 'foto.removida', dados: { arquivoId: anteriorId } },
      );
    },
  };
}

export const rotasDasFotos: FastifyPluginAsyncZod<DependenciasDasFotos> = async (app, deps) => {
  aceitarImagens(app);

  /** A pessoa da rota, com a permissão no escopo dela e ainda mudando. */
  const pessoaDaRota =
    (requisicao: FastifyRequest, id: string): ImagemDoRegistro<DonaDaFoto>['conferir'] =>
    async (tx, travar) => {
      const linha = await lerPessoa(tx, id, { travar });
      exigirEm(requisicao, 'pessoas.editar', linha.pessoa.localId, await lerArvore(tx));
      if (linha.pessoa.situacao === 'anonimizada') throw pessoaAnonimizada();
      return donaDaLinha(linha);
    };

  /** A ficha da pessoa depois da mudança, como a leitura dela. */
  const fichaDepois = (requisicao: FastifyRequest, id: string) => async (tx: Transacao) =>
    fichaDaPessoa(
      tx,
      await lerPessoa(tx, id),
      sessaoDa(requisicao),
      await lerArvore(tx),
      deps.agora(),
    );

  const quem = (requisicao: FastifyRequest) => quemMuda(requisicao, sessaoDa(requisicao).contaId);

  app.put(
    '/pessoas/:id/foto',
    {
      config: { permissao: 'pessoas.editar' },
      schema: {
        summary: 'Trocar a foto de uma pessoa',
        params: ParametrosDaPessoa,
        consumes: TIPOS_DO_ENVIO,
        body: BytesDaImagem,
        response: { 200: FichaDaPessoa, ...PROBLEMAS_DA_FOTO },
      },
    },
    async (requisicao) =>
      trocarImagem(
        deps,
        quem(requisicao),
        fotoDaPessoa(requisicao, pessoaDaRota(requisicao, requisicao.params.id)),
        { conteudo: requisicao.body, responder: fichaDepois(requisicao, requisicao.params.id) },
      ),
  );

  app.delete(
    '/pessoas/:id/foto',
    {
      config: { permissao: 'pessoas.editar' },
      schema: {
        summary: 'Remover a foto de uma pessoa',
        params: ParametrosDaPessoa,
        response: { 200: FichaDaPessoa, ...PROBLEMAS_DA_FOTO },
      },
    },
    async (requisicao) =>
      tirarImagem(
        deps,
        quem(requisicao),
        fotoDaPessoa(requisicao, pessoaDaRota(requisicao, requisicao.params.id)),
        { responder: fichaDepois(requisicao, requisicao.params.id) },
      ),
  );

  app.get(
    '/pessoas/:id/foto/:arquivo/:tamanho',
    {
      config: { permissao: 'pessoas.ver' },
      schema: {
        summary: 'Um tamanho da foto de uma pessoa',
        params: ParametrosDaEntrega,
        response: { 200: IMAGEM_ENTREGUE, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao, resposta) => {
      const { id, arquivo, tamanho } = requisicao.params;
      return entregarImagem(deps, requisicao, resposta, {
        arquivo,
        tamanho,
        // A pessoa de outra organização nem aparece: o endereço responde como a imagem que falta.
        imagemAtual: async (tx) => {
          const [linha] = await tx
            .select({ localId: pessoas.localId, fotoId: pessoas.fotoId })
            .from(pessoas)
            .where(eq(pessoas.id, id));
          if (!linha) throw imagemNaoEncontrada();
          exigirEm(requisicao, 'pessoas.ver', linha.localId, await lerArvore(tx));
          return linha.fotoId;
        },
      });
    },
  );

  /** A pessoa da própria conta, sem permissão nenhuma: a sessão que vale basta. */
  const pessoaDaConta =
    (requisicao: FastifyRequest): ImagemDoRegistro<DonaDaFoto>['conferir'] =>
    async (tx, travar) => {
      const [conta] = await tx
        .select({ pessoaId: contas.pessoaId })
        .from(contas)
        .where(eq(contas.id, sessaoDa(requisicao).contaId));
      if (!conta) throw new Error('A conta da sessão sumiu.');
      return donaDaLinha(await lerPessoa(tx, conta.pessoaId, { travar }));
    };

  /** A foto da própria pessoa depois da mudança. */
  const fotoDaConta = (requisicao: FastifyRequest) => async (tx: Transacao) => {
    const { imagemId } = await pessoaDaConta(requisicao)(tx, false);
    return { foto: imagemId ? { id: imagemId } : null };
  };

  app.put(
    '/conta/foto',
    {
      config: { semPermissao: 'propria-conta' },
      schema: {
        summary: 'Trocar a foto da própria pessoa',
        consumes: TIPOS_DO_ENVIO,
        body: BytesDaImagem,
        response: { 200: FotoDaConta, ...PROBLEMAS_DA_FOTO },
      },
    },
    async (requisicao) =>
      trocarImagem(deps, quem(requisicao), fotoDaPessoa(requisicao, pessoaDaConta(requisicao)), {
        conteudo: requisicao.body,
        responder: fotoDaConta(requisicao),
      }),
  );

  app.delete(
    '/conta/foto',
    {
      config: { semPermissao: 'propria-conta' },
      schema: {
        summary: 'Remover a foto da própria pessoa',
        response: { 200: FotoDaConta, ...PROBLEMAS_DA_FOTO },
      },
    },
    async (requisicao) =>
      tirarImagem(deps, quem(requisicao), fotoDaPessoa(requisicao, pessoaDaConta(requisicao)), {
        responder: fotoDaConta(requisicao),
      }),
  );

  app.get(
    '/conta/foto/:arquivo/:tamanho',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Um tamanho da foto da própria pessoa',
        params: ParametrosDaPropriaFoto,
        response: { 200: IMAGEM_ENTREGUE, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao, resposta) =>
      entregarImagem(deps, requisicao, resposta, {
        arquivo: requisicao.params.arquivo,
        tamanho: requisicao.params.tamanho,
        imagemAtual: async (tx) => (await pessoaDaConta(requisicao)(tx, false)).imagemId,
      }),
  );
};
