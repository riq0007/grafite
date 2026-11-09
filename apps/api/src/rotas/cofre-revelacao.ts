// A liberação do cofre e o revelar e copiar (spec cofre-de-segredos, "Liberação do cofre por 5
// minutos" e "Revelar e copiar"; design do P6, decisões 4 e 5). O código do app, conferido como na
// entrada e nunca um de recuperação, libera o cofre na sessão por 5 minutos. Revelar e copiar são
// POST, sem cache: a transação confere o alcance, o segredo ativo e o cofre liberado, grava a
// recusa, que vale depois do commit, ou a revelação, e decifra o valor só no fim.
import { type Banco, doisPassos, naOrganizacao, segredos, sessoes } from '@grafite/db';
import { alcancaOSegredo, DURACAO_DA_LIBERACAO_DO_COFRE } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { pareceCodigoDeRecuperacao } from '../acesso/codigos.ts';
import { conferirCodigoDaConta } from '../acesso/dois-passos.ts';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import {
  type ChavesDoCofre,
  decifrarSegredo,
  FRASE_DO_SEGREDO_QUE_NAO_ABRE,
  SegredoQueNaoAbre,
} from '../cofre/cifra.ts';
import { cofreSemDoisPassos } from '../cofre/guarda.ts';
import { segredoNaoEncontrado } from '../cofre/segredos.ts';
import { acessoDoSegredo, titularesDaConta } from '../cofre/titulares.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { LIMITE_DA_ENTRADA } from '../protecao.ts';
import { ParametrosDoSegredo, PROBLEMAS_DO_COFRE } from './cofre.ts';
import { origemDa } from './sessao.ts';

const PedidoDeLiberacao = z
  .object({
    codigo: z
      .string({ error: 'Informe o código.' })
      .trim()
      .min(1, { error: 'Informe o código.' })
      .max(32, { error: 'Use até 32 caracteres.' }),
  })
  .meta({ id: 'PedidoDeLiberacao' });

const LiberacaoDoCofre = z
  .object({
    /** Até quando revelar e copiar dispensam o código nesta sessão, ou nulo com o cofre fechado. */
    liberadoAte: z.string().nullable(),
  })
  .meta({ id: 'LiberacaoDoCofre' });

/** O valor revelado ou copiado: a única resposta da API que leva um valor do cofre. */
const ValorDoSegredo = z.object({ valor: z.string() }).meta({ id: 'ValorDoSegredo' });

const CODIGO_INCORRETO =
  'Código incorreto. Confira se o relógio do celular está certo e tente de novo.';

type MotivoDaRecusa =
  | 'nao-liberado'
  | 'segredo-inativo'
  | 'cofre-fechado'
  | 'liberacao-terminada'
  | 'segredo-nao-abre';

const RECUSAS: Record<MotivoDaRecusa, () => ProblemaDaApi> = {
  'nao-liberado': () =>
    new ProblemaDaApi({
      codigo: 'segredo-nao-liberado',
      status: 403,
      titulo: 'Segredo não liberado',
      detalhe: 'O segredo não está liberado para você.',
    }),
  'segredo-inativo': () =>
    new ProblemaDaApi({
      codigo: 'segredo-inativo',
      status: 409,
      titulo: 'Segredo inativo',
      detalhe: 'O segredo está inativo.',
    }),
  'cofre-fechado': () =>
    new ProblemaDaApi({
      codigo: 'cofre-fechado',
      status: 403,
      titulo: 'Cofre fechado',
      detalhe: 'Confirme o código do app para revelar e copiar.',
    }),
  'liberacao-terminada': () =>
    new ProblemaDaApi({
      codigo: 'cofre-fechado',
      status: 403,
      titulo: 'Cofre fechado',
      detalhe: 'A liberação do cofre terminou. Confirme o código do app de novo.',
    }),
  'segredo-nao-abre': () =>
    new ProblemaDaApi({
      codigo: 'segredo-nao-abre',
      status: 500,
      titulo: 'Segredo que não abre',
      detalhe: FRASE_DO_SEGREDO_QUE_NAO_ABRE,
    }),
};

/** O motivo que vai para a auditoria: a liberação terminada também é o cofre fechado. */
const motivoNaAuditoria = (motivo: MotivoDaRecusa) =>
  motivo === 'liberacao-terminada' ? 'cofre-fechado' : motivo;

export interface DependenciasDaRevelacao {
  banco: Banco;
  agora: () => Date;
  chavesDoCofre: ChavesDoCofre;
  chaveDoisPassos: Buffer;
}

export const rotasDaRevelacaoDoCofre: FastifyPluginAsyncZod<DependenciasDaRevelacao> = async (
  app,
  { banco, agora, chavesDoCofre, chaveDoisPassos },
) => {
  app.get(
    '/cofre/liberacao',
    {
      config: { permissao: 'cofre.usar' },
      schema: {
        summary: 'Até quando o cofre está liberado nesta sessão',
        response: { 200: LiberacaoDoCofre, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) => {
      const { cofreLiberadoAte } = sessaoDa(requisicao);
      const liberado = cofreLiberadoAte !== null && cofreLiberadoAte > agora();
      return { liberadoAte: liberado ? cofreLiberadoAte.toISOString() : null };
    },
  );

  app.post(
    '/cofre/liberacao',
    {
      config: { permissao: 'cofre.usar', rateLimit: LIMITE_DA_ENTRADA },
      schema: {
        summary: 'Liberar o cofre nesta sessão por 5 minutos com o código do app',
        body: PedidoDeLiberacao,
        response: { 200: LiberacaoDoCofre, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const { codigo } = requisicao.body;
      const momento = agora();
      const origem = origemDa(requisicao);
      const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
      const resultado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const recusa = async (motivo: 'codigo-de-recuperacao' | 'codigo-incorreto') => {
          // Sem o código digitado: a auditoria nunca leva um código de verificação.
          await registrarNaAuditoria(tx, {
            acao: 'liberacao-do-cofre.recusada',
            ator,
            alvo: { tipo: 'sessao', id: sessao.id },
            dados: { motivo },
            origem,
            momento,
          });
          return { tipo: 'recusado', motivo } as const;
        };
        // Um código de recuperação nunca libera o cofre e não pode ser gasto aqui.
        if (pareceCodigoDeRecuperacao(codigo)) return recusa('codigo-de-recuperacao');
        const { aceito } = await conferirCodigoDaConta(tx, {
          contaId: sessao.contaId,
          codigo,
          momento,
          chaveDoisPassos,
          ator,
          origem,
        });
        if (!aceito) return recusa('codigo-incorreto');
        const ate = new Date(momento.getTime() + DURACAO_DA_LIBERACAO_DO_COFRE);
        await tx.update(sessoes).set({ cofreLiberadoAte: ate }).where(eq(sessoes.id, sessao.id));
        await registrarNaAuditoria(tx, {
          acao: 'cofre.liberado',
          ator,
          alvo: { tipo: 'sessao', id: sessao.id },
          dados: { ate: ate.toISOString() },
          origem,
          momento,
        });
        return { tipo: 'liberado', ate } as const;
      });
      if (resultado.tipo === 'recusado' && resultado.motivo === 'codigo-de-recuperacao') {
        throw new ProblemaDaApi({
          codigo: 'codigo-de-recuperacao',
          status: 400,
          titulo: 'Código de recuperação',
          detalhe:
            'Use o código do app autenticador: os códigos de recuperação não liberam o cofre.',
        });
      }
      if (resultado.tipo === 'recusado') {
        throw new ProblemaDaApi({
          codigo: 'codigo-invalido',
          status: 401,
          titulo: 'Código incorreto',
          detalhe: CODIGO_INCORRETO,
        });
      }
      return { liberadoAte: resultado.ate.toISOString() };
    },
  );

  for (const pedido of ['revelacao', 'copia'] as const) {
    const acao = pedido === 'revelacao' ? 'segredo.revelado' : 'segredo.copiado';
    const acaoDaRecusa =
      pedido === 'revelacao' ? 'revelacao-do-segredo.recusada' : 'copia-do-segredo.recusada';
    app.post(
      `/cofre/segredos/:id/${pedido}`,
      {
        config: { permissao: 'cofre.usar' },
        schema: {
          summary:
            pedido === 'revelacao'
              ? 'Revelar o valor de um segredo, com o cofre liberado, sem cache'
              : 'Copiar o valor de um segredo, com o cofre liberado, sem cache',
          params: ParametrosDoSegredo,
          response: {
            200: ValorDoSegredo,
            409: RespostaDeProblema,
            500: RespostaDeProblema,
            ...PROBLEMAS_DO_COFRE,
          },
        },
      },
      async (requisicao, resposta) => {
        const sessao = sessaoDa(requisicao);
        const orgId = requisicao.organizacao?.id ?? '';
        const segredoId = requisicao.params.id;
        const momento = agora();
        const origem = origemDa(requisicao);
        const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
        const resultado = await naOrganizacao(banco, orgId, async (tx) => {
          const [linha] = await tx.select().from(segredos).where(eq(segredos.id, segredoId));
          if (!linha) throw segredoNaoEncontrado();
          const [verificacao] = await tx
            .select({ ativadoEm: doisPassos.ativadoEm })
            .from(doisPassos)
            .where(eq(doisPassos.contaId, sessao.contaId));
          if (!verificacao?.ativadoEm) throw cofreSemDoisPassos();
          const [daSessao] = await tx
            .select({ ate: sessoes.cofreLiberadoAte })
            .from(sessoes)
            .where(eq(sessoes.id, sessao.id));
          const alcanca = alcancaOSegredo(
            await acessoDoSegredo(tx, segredoId),
            await titularesDaConta(tx, sessao.contaId),
          );
          const ate = daSessao?.ate ?? null;
          const motivo: MotivoDaRecusa | null = !alcanca
            ? 'nao-liberado'
            : linha.situacao !== 'ativo'
              ? 'segredo-inativo'
              : ate === null
                ? 'cofre-fechado'
                : ate <= momento
                  ? 'liberacao-terminada'
                  : null;
          const recusa = async (motivoDela: MotivoDaRecusa) => {
            await registrarNaAuditoria(tx, {
              acao: acaoDaRecusa,
              ator,
              alvo: { tipo: 'segredo', id: segredoId },
              dados: { motivo: motivoNaAuditoria(motivoDela) },
              origem,
              momento,
            });
            return { tipo: 'recusado', motivo: motivoDela } as const;
          };
          if (motivo) return recusa(motivo);
          let valor: string;
          try {
            valor = decifrarSegredo(linha, chavesDoCofre, { orgId, segredoId }).valor;
          } catch (erro) {
            if (!(erro instanceof SegredoQueNaoAbre)) throw erro;
            // O caso vai para o log pelo segredo e pelo motivo, sem nenhuma chave nem valor.
            requisicao.log.error({ segredoId, motivo: erro.motivo }, 'o cofre não abre o segredo');
            return recusa('segredo-nao-abre');
          }
          await registrarNaAuditoria(tx, {
            acao,
            ator,
            alvo: { tipo: 'segredo', id: segredoId },
            origem,
            momento,
          });
          return { tipo: 'aceito', valor } as const;
        });
        // A recusa já está gravada: a resposta sai depois do commit.
        if (resultado.tipo === 'recusado') throw RECUSAS[resultado.motivo]();
        resposta.header('cache-control', 'no-store').header('pragma', 'no-cache');
        return { valor: resultado.valor };
      },
    );
  }
};
