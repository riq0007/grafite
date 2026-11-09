// A conta do usuário (specs contas-de-acesso e verificacao-em-dois-passos): os dados, sem o hash, e
// a troca da própria senha. A senha atual é conferida e conta no bloqueio, a nova segue a regra, e
// as outras sessões terminam. Na senha temporária, a troca resolve a pendência da entrada.
import {
  type Banco,
  codigosDeRecuperacao,
  contas,
  doisPassos,
  naOrganizacao,
  pessoas,
  tentativasDeEntrada,
} from '@grafite/db';
import { avaliarSenha, mensagemDoBloqueio } from '@grafite/domain';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { comCredenciais } from '../acesso/credenciais.ts';
import { encerrarSessoesDaConta } from '../acesso/encerramento.ts';
import { seguirEntrada } from '../acesso/entrada.ts';
import { exigirAtiva, exigirAtivaOu } from '../acesso/escopo.ts';
import { conferirSenha, gerarHashDaSenha } from '../acesso/senhas.ts';
import { gravarCookieDaSessao } from '../acesso/sessoes.ts';
import { registrarNaAuditoria, visaoDaConta } from '../auditoria.ts';
import { saidaDaConta } from '../eventos/pessoas.ts';
import { enviarProblema, ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import {
  EstadoDaSessao,
  estadoDaSessao,
  lerDadosDoEstado,
  origemDa,
  PROBLEMAS_DO_ACESSO,
  registrarRecusa,
  restanteDoBloqueio,
} from './sessao.ts';

const Conta = z
  .object({
    usuario: z.string(),
    nome: z.string(),
    email: z.string().nullable(),
    doisPassos: z.object({
      situacao: z.enum(['ativa', 'desativada']),
      exigida: z.boolean(),
      /** Quem exige: a própria conta e os perfis em vigor que exigem. */
      exigidaPor: z.object({ conta: z.boolean(), perfis: z.array(z.string()) }),
      codigosRestantes: z.number().int().min(0),
    }),
  })
  .meta({ id: 'Conta' });

const PedidoDeTrocaDeSenha = z
  .object({
    senhaAtual: z
      .string({ error: 'Informe a senha atual.' })
      .min(1, { error: 'Informe a senha atual.' })
      .max(1024, { error: 'Use até 1024 caracteres.' }),
    senhaNova: z
      .string({ error: 'Informe a senha nova.' })
      .min(1, { error: 'Informe a senha nova.' })
      .max(1024, { error: 'Use até 1024 caracteres.' }),
  })
  .meta({ id: 'PedidoDeTrocaDeSenha' });

const ResultadoDaTrocaDeSenha = EstadoDaSessao.extend({
  /** As outras sessões da conta, encerradas pela troca. */
  sessoesEncerradas: z.number().int().min(0),
}).meta({ id: 'ResultadoDaTrocaDeSenha' });

const senhaRecusada = (motivo: string) =>
  new ProblemaDaApi({
    codigo: 'senha-recusada',
    status: 400,
    titulo: 'Senha recusada',
    detalhe: motivo,
    campos: { senhaNova: motivo },
  });

export const rotasDaConta: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.get(
    '/conta',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Dados da própria conta',
        response: { 200: Conta, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [linha] = await tx
          .select({
            usuario: contas.usuario,
            exigeDoisPassos: contas.exigeDoisPassos,
            nome: pessoas.nome,
            email: pessoas.email,
            doisPassosAtivadoEm: doisPassos.ativadoEm,
          })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .leftJoin(doisPassos, eq(doisPassos.contaId, contas.id))
          .where(eq(contas.id, sessao.contaId));
        if (!linha || linha.usuario === null) throw new Error('A conta da sessão sumiu.');
        const [contagem] = await tx
          .select({ restantes: count() })
          .from(codigosDeRecuperacao)
          .where(
            and(
              eq(codigosDeRecuperacao.contaId, sessao.contaId),
              isNull(codigosDeRecuperacao.usadoEm),
            ),
          );
        const ativa = linha.doisPassosAtivadoEm !== null;
        return {
          usuario: linha.usuario,
          nome: linha.nome,
          email: linha.email,
          doisPassos: {
            situacao: ativa ? 'ativa' : 'desativada',
            exigida: linha.exigeDoisPassos || sessao.acesso.exigeDoisPassos,
            exigidaPor: {
              conta: linha.exigeDoisPassos,
              perfis: [...sessao.acesso.perfisQueExigem],
            },
            codigosRestantes: ativa ? (contagem?.restantes ?? 0) : 0,
          },
        } as const;
      });
    },
  );

  app.put(
    '/conta/senha',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtivaOu('trocar-senha'),
      schema: {
        summary: 'Trocar a própria senha',
        body: PedidoDeTrocaDeSenha,
        response: { 200: ResultadoDaTrocaDeSenha, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const { senhaAtual, senhaNova } = requisicao.body;
      const momento = agora();
      const origem = origemDa(requisicao);
      const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
      const resultado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [linha] = await tx.select().from(contas).where(eq(contas.id, sessao.contaId));
        if (!linha) throw new Error('A conta da sessão sumiu.');
        const conta = comCredenciais(linha);
        const restante = await restanteDoBloqueio(tx, { usuario: conta.usuario, momento });
        if (restante > 0) return { tipo: 'bloqueada', restante } as const;
        if (!(await conferirSenha(senhaAtual, conta.hashSenha))) {
          await registrarNaAuditoria(tx, {
            acao: 'senha.recusada',
            ator,
            alvo: { tipo: 'conta', id: conta.id },
            dados: { motivo: 'senha-atual-incorreta' },
            origem,
            momento,
          });
          await registrarRecusa(tx, { usuario: conta.usuario, momento });
          return { tipo: 'atual-incorreta' } as const;
        }
        const motivo =
          senhaNova === senhaAtual
            ? 'A senha nova precisa ser diferente da atual.'
            : avaliarSenha(senhaNova, { usuario: conta.usuario });
        if (motivo) return { tipo: 'recusada', motivo } as const;

        const [depois] = await tx
          .update(contas)
          .set({
            hashSenha: await gerarHashDaSenha(senhaNova),
            senhaTemporaria: false,
            senhaTrocadaEm: momento,
            atualizadaEm: momento,
          })
          .where(eq(contas.id, conta.id))
          .returning();
        await tx
          .update(tentativasDeEntrada)
          .set({ falhasSeguidas: 0, bloqueadaAte: null, atualizadaEm: momento })
          .where(eq(tentativasDeEntrada.usuario, conta.usuario));
        await registrarNaAuditoria(tx, {
          acao: 'senha.trocada',
          ator,
          alvo: { tipo: 'conta', id: conta.id },
          antes: visaoDaConta(conta),
          depois: depois ? visaoDaConta(depois) : null,
          origem,
          momento,
          saida: await saidaDaConta(tx, conta.id),
        });
        const sessoesEncerradas = await encerrarSessoesDaConta(tx, {
          contaId: conta.id,
          motivo: 'senha-trocada',
          momento,
          ator,
          origem,
          exceto: sessao.id,
        });
        const etapa = await seguirEntrada(tx, { sessao, momento, origem });
        return {
          tipo: 'trocada',
          etapa,
          sessoesEncerradas,
          dados: await lerDadosDoEstado(tx, conta.id),
        } as const;
      });

      if (resultado.tipo === 'bloqueada') {
        resposta.header('retry-after', String(Math.ceil(resultado.restante / 1000)));
        return enviarProblema(requisicao, resposta, {
          codigo: 'entrada-bloqueada',
          status: 429,
          titulo: 'Entrada bloqueada',
          detalhe: mensagemDoBloqueio(resultado.restante),
        });
      }
      if (resultado.tipo === 'atual-incorreta') {
        throw new ProblemaDaApi({
          codigo: 'senha-atual-incorreta',
          status: 400,
          titulo: 'Senha atual incorreta',
          detalhe: 'A senha atual está incorreta.',
          campos: { senhaAtual: 'A senha atual está incorreta.' },
        });
      }
      if (resultado.tipo === 'recusada') throw senhaRecusada(resultado.motivo);
      const { etapa } = resultado;
      if (etapa.token) gravarCookieDaSessao(resposta, etapa.token, etapa.expiraEm, momento);
      return {
        ...estadoDaSessao(requisicao, resultado.dados, {
          usuario: sessao.usuario,
          nome: sessao.nome,
          pendencia: etapa.pendencia,
          tokenCsrf: etapa.tokenCsrf,
          expiraEm: etapa.expiraEm,
          acesso: sessao.acesso,
        }),
        sessoesEncerradas: resultado.sessoesEncerradas,
      };
    },
  );
};
