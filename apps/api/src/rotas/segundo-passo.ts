// O código do segundo passo na entrada (spec verificacao-em-dois-passos): o código do app, nunca
// aceito duas vezes, ou um código de recuperação, de uso único. Cada código errado conta no bloqueio
// do usuário, e cinco na mesma entrada encerram a sessão pendente.
import {
  type Banco,
  contas,
  naOrganizacao,
  pessoas,
  sessoes,
  tentativasDeEntrada,
} from '@grafite/db';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { carregarAcesso, exigeDoisPassos } from '../acesso/acesso.ts';
import {
  gravarCookieDoAparelho,
  lerCookieDoAparelho,
  marcarAparelho,
  prazoDaConta,
} from '../acesso/aparelhos.ts';
import { comCredenciais } from '../acesso/credenciais.ts';
import { conferirCodigoDaConta } from '../acesso/dois-passos.ts';
import { concluirEntrada } from '../acesso/entrada.ts';
import { exigirPendencia } from '../acesso/escopo.ts';
import { pendenciaDa } from '../acesso/pendencia.ts';
import { apagarCookieDaSessao, ativarSessao, gravarCookieDaSessao } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { LIMITE_DA_ENTRADA } from '../protecao.ts';
import {
  EstadoDaSessao,
  estadoDaSessao,
  lerDadosDoEstado,
  origemDa,
  PROBLEMAS_DO_ACESSO,
  registrarRecusa,
} from './sessao.ts';

const TENTATIVAS_DE_CODIGO = 5;

const PedidoDeCodigo = z
  .object({
    codigo: z
      .string({ error: 'Informe o código.' })
      .trim()
      .min(1, { error: 'Informe o código.' })
      .max(32, { error: 'Use até 32 caracteres.' }),
    /**
     * Marcar este navegador como aparelho confiável (change aparelho-confiavel): só com o código
     * do app e o prazo da conta maior que zero; o código de recuperação não marca.
     */
    confiar: z.boolean().optional(),
  })
  .meta({ id: 'PedidoDeCodigo' });

const ResultadoDoSegundoPasso = EstadoDaSessao.extend({
  /** Depois de um código de recuperação: quantos ainda servem. */
  codigosRestantes: z.number().int().min(0).optional(),
}).meta({ id: 'ResultadoDoSegundoPasso' });

export interface DependenciasDoSegundoPasso {
  banco: Banco;
  agora: () => Date;
  chaveDoisPassos: Buffer;
  /** A fila, para a notificação do último código ir também pelo e-mail e pelo push. */
  fila?: FilaDeTarefas;
}

export const rotasDoSegundoPasso: FastifyPluginAsyncZod<DependenciasDoSegundoPasso> = async (
  app,
  { banco, agora, chaveDoisPassos, fila },
) => {
  app.post(
    '/sessao/segundo-passo',
    {
      config: { rateLimit: LIMITE_DA_ENTRADA, semPermissao: 'entrada' },
      preHandler: exigirPendencia('segundo-passo'),
      schema: {
        summary: 'Mandar o código do segundo passo da entrada',
        body: PedidoDeCodigo,
        response: {
          200: ResultadoDoSegundoPasso,
          401: RespostaDeProblema,
          409: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const orgId = requisicao.organizacao?.id ?? '';
      const { codigo } = requisicao.body;
      const momento = agora();
      const origem = origemDa(requisicao);
      const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
      const resultado = await naOrganizacao(banco, orgId, async (tx) => {
        const [linha] = await tx
          .select({ conta: contas, nome: pessoas.nome })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .where(eq(contas.id, sessao.contaId));
        if (!linha) throw new Error('A conta da sessão sumiu.');
        const conta = comCredenciais(linha.conta);

        const { aceito, restantes: codigosRestantes } = await conferirCodigoDaConta(tx, {
          contaId: sessao.contaId,
          codigo,
          momento,
          chaveDoisPassos,
          ator,
          origem,
        });

        if (!aceito) {
          const [atualizada] = await tx
            .update(sessoes)
            .set({ tentativasDeCodigo: sql`${sessoes.tentativasDeCodigo} + 1` })
            .where(eq(sessoes.id, sessao.id))
            .returning({ tentativas: sessoes.tentativasDeCodigo });
          const tentativa = atualizada?.tentativas ?? TENTATIVAS_DE_CODIGO;
          await registrarNaAuditoria(tx, {
            acao: 'segundo-passo.recusado',
            ator,
            alvo: { tipo: 'sessao', id: sessao.id },
            dados: { tentativa },
            origem,
            momento,
          });
          const bloqueadaAte = await registrarRecusa(tx, { usuario: conta.usuario, momento });
          if (bloqueadaAte) {
            await registrarNaAuditoria(tx, {
              acao: 'entrada.bloqueada',
              ator: { tipo: 'anonimo' },
              alvo: { tipo: 'conta', id: sessao.contaId },
              dados: { usuario: conta.usuario, ate: bloqueadaAte.toISOString() },
              origem,
              momento,
            });
          }
          if (tentativa < TENTATIVAS_DE_CODIGO) return { tipo: 'recusado' } as const;
          await tx
            .update(sessoes)
            .set({ encerradaEm: momento, motivoDoFim: 'tentativas-esgotadas' })
            .where(eq(sessoes.id, sessao.id));
          await registrarNaAuditoria(tx, {
            acao: 'sessao.encerrada',
            ator,
            alvo: { tipo: 'sessao', id: sessao.id },
            dados: { motivo: 'tentativas-esgotadas' },
            origem,
            momento,
          });
          return { tipo: 'esgotado' } as const;
        }

        // O último código de recuperação fica na central da conta, além do aviso na tela de entrada
        // (spec verificacao-em-dois-passos, "Último código"; design do P3b, decisão 6).
        if (codigosRestantes === 0) {
          await notificar(
            tx,
            [
              {
                contaId: sessao.contaId,
                severidade: 'atencao',
                titulo: 'Este era o seu último código de recuperação. Gere novos na sua conta.',
                descricao: null,
                origem: 'Conta',
                destino: '/ajustes/conta',
                alertaId: null,
              },
            ],
            momento,
            fila?.rodando() ? { enviar: (...dados) => fila.enviar(...dados) } : {},
          );
        }
        await tx.update(sessoes).set({ segundoPassoEm: momento }).where(eq(sessoes.id, sessao.id));
        await tx
          .update(tentativasDeEntrada)
          .set({ falhasSeguidas: 0, bloqueadaAte: null, atualizadaEm: momento })
          .where(eq(tentativasDeEntrada.usuario, conta.usuario));
        const acesso = await carregarAcesso(tx, sessao.contaId);
        // O aparelho confiável só nasce do código do app, com o prazo da conta maior que zero.
        let aparelho: { token: string; dias: number } | null = null;
        if (requisicao.body.confiar && codigosRestantes === undefined) {
          const prazo = await prazoDaConta(tx, sessao.contaId, acesso);
          if (prazo.dias > 0) {
            const marcado = await marcarAparelho(tx, {
              contaId: sessao.contaId,
              sessaoId: sessao.id,
              tokenAnterior: lerCookieDoAparelho(requisicao),
              agente: requisicao.headers['user-agent'] ?? null,
              ip: requisicao.ip,
              momento,
              origem,
            });
            aparelho = { token: marcado.token, dias: prazo.dias };
          }
        }
        const pendencia = pendenciaDa({
          conta: { ...conta, exigeDoisPassos: exigeDoisPassos(conta, acesso) },
          doisPassosAtivos: true,
          segundoPassoEm: momento,
        });
        const base = { usuario: conta.usuario, nome: linha.nome, pendencia, acesso };
        const dados = await lerDadosDoEstado(tx, sessao.contaId);
        if (pendencia !== null) {
          return {
            tipo: 'aceito',
            dados,
            token: null,
            sessao: { ...base, tokenCsrf: sessao.tokenCsrf, expiraEm: sessao.expiraEm },
            codigosRestantes,
            aparelho,
          } as const;
        }
        const ativa = await ativarSessao(tx, sessao.id, momento);
        await concluirEntrada(tx, {
          sessaoId: sessao.id,
          contaId: sessao.contaId,
          momento,
          origem,
        });
        return {
          tipo: 'aceito',
          dados,
          token: ativa.token,
          sessao: { ...base, tokenCsrf: ativa.tokenCsrf, expiraEm: ativa.expiraEm },
          codigosRestantes,
          aparelho,
        } as const;
      });

      if (resultado.tipo === 'recusado') {
        throw new ProblemaDaApi({
          codigo: 'codigo-invalido',
          status: 401,
          titulo: 'Código incorreto',
          detalhe: 'Código incorreto.',
        });
      }
      if (resultado.tipo === 'esgotado') {
        apagarCookieDaSessao(resposta);
        throw new ProblemaDaApi({
          codigo: 'tentativas-esgotadas',
          status: 401,
          titulo: 'Tentativas esgotadas',
          detalhe: 'Códigos errados demais. Entre de novo.',
        });
      }
      if (resultado.token) {
        gravarCookieDaSessao(resposta, resultado.token, resultado.sessao.expiraEm, momento);
      }
      if (resultado.aparelho) {
        gravarCookieDoAparelho(resposta, resultado.aparelho.token, resultado.aparelho.dias);
      }
      return {
        ...estadoDaSessao(requisicao, resultado.dados, resultado.sessao),
        ...(resultado.codigosRestantes === undefined
          ? {}
          : { codigosRestantes: resultado.codigosRestantes }),
      };
    },
  );
};
