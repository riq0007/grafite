// A verificação em dois passos da conta (spec verificacao-em-dois-passos): o cadastro, com a chave e
// a URI do app, e a confirmação, que só ativa com o código certo, gera os 10 códigos de recuperação,
// encerra as outras sessões e resolve a pendência do cadastro exigido.
import {
  type Banco,
  codigosDeRecuperacao,
  contas,
  doisPassos,
  naOrganizacao,
  sessoes,
  type Transacao,
} from '@grafite/db';
import { eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { cifrarChaveDoApp, decifrarChaveDoApp } from '../acesso/cifra.ts';
import { gerarCodigosDeRecuperacao, hashDoCodigo } from '../acesso/codigos.ts';
import { conferirCodigoDaConta, fecharOCofreDaConta } from '../acesso/dois-passos.ts';
import { encerrarSessoesDaConta } from '../acesso/encerramento.ts';
import { seguirEntrada } from '../acesso/entrada.ts';
import { exigirAtiva, exigirAtivaOu } from '../acesso/escopo.ts';
import { gravarCookieDaSessao } from '../acesso/sessoes.ts';
import { conferirCodigoDoApp, formatarChave, gerarChaveDoApp, uriDoApp } from '../acesso/totp.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { saidaDaConta } from '../eventos/pessoas.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import {
  EstadoDaSessao,
  estadoDaSessao,
  lerDadosDoEstado,
  nomeDaOrganizacao,
  origemDa,
  PROBLEMAS_DO_ACESSO,
} from './sessao.ts';

const CadastroDosDoisPassos = z
  .object({
    /** A chave em texto, em grupos de 4, para digitar no app. */
    chave: z.string(),
    /** A URI do QR code. */
    uri: z.string(),
  })
  .meta({ id: 'CadastroDosDoisPassos' });

export const PedidoComCodigo = z
  .object({
    codigo: z
      .string({ error: 'Informe o código.' })
      .trim()
      .min(1, { error: 'Informe o código.' })
      .max(32, { error: 'Use até 32 caracteres.' }),
  })
  .meta({ id: 'PedidoComCodigo' });

const CodigosNovos = z
  .object({ codigosDeRecuperacao: z.array(z.string()) })
  .meta({ id: 'CodigosNovos' });

const ResultadoDaAtivacao = EstadoDaSessao.extend({
  /** Mostrados uma vez só: o banco guarda só o hash deles. */
  codigosDeRecuperacao: z.array(z.string()),
  sessoesEncerradas: z.number().int().min(0),
}).meta({ id: 'ResultadoDaAtivacao' });

export const doisPassosAtivos = () =>
  new ProblemaDaApi({
    codigo: 'dois-passos-ativos',
    status: 409,
    titulo: 'Verificação já ativa',
    detalhe: 'A verificação em dois passos já está ativa.',
  });

const doisPassosInativos = () =>
  new ProblemaDaApi({
    codigo: 'dois-passos-inativos',
    status: 409,
    titulo: 'Verificação inativa',
    detalhe: 'A verificação em dois passos não está ativa.',
  });

const codigoIncorreto = () =>
  new ProblemaDaApi({
    codigo: 'codigo-invalido',
    status: 400,
    titulo: 'Código incorreto',
    detalhe: 'Código incorreto.',
  });

export const codigoInvalidoNoApp = () =>
  new ProblemaDaApi({
    codigo: 'codigo-invalido',
    status: 400,
    titulo: 'Código incorreto',
    detalhe: 'Código incorreto. Confira se o relógio do celular está certo e tente de novo.',
  });

export interface DependenciasDosDoisPassos {
  banco: Banco;
  agora: () => Date;
  chaveDoisPassos: Buffer;
}

export const rotasDosDoisPassos: FastifyPluginAsyncZod<DependenciasDosDoisPassos> = async (
  app,
  { banco, agora, chaveDoisPassos },
) => {
  app.post(
    '/conta/dois-passos/cadastro',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtivaOu('cadastrar-dois-passos'),
      schema: {
        summary: 'Começar o cadastro da verificação em dois passos',
        response: {
          200: CadastroDosDoisPassos,
          401: RespostaDeProblema,
          409: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const momento = agora();
      const chave = gerarChaveDoApp();
      const segredoCifrado = cifrarChaveDoApp(chave, chaveDoisPassos, sessao.contaId);
      const organizacao = await naOrganizacao(
        banco,
        requisicao.organizacao?.id ?? '',
        async (tx) => {
          const [atual] = await tx
            .select({ ativadoEm: doisPassos.ativadoEm })
            .from(doisPassos)
            .where(eq(doisPassos.contaId, sessao.contaId));
          if (atual?.ativadoEm) return null;
          // Recomeçar um cadastro não concluído troca a chave; um cadastro ativo nunca é trocado aqui.
          await tx
            .insert(doisPassos)
            .values({
              orgId: sql`app.current_org()`,
              contaId: sessao.contaId,
              segredoCifrado,
              criadoEm: momento,
            })
            .onConflictDoUpdate({
              target: doisPassos.contaId,
              set: { segredoCifrado, criadoEm: momento, ultimoPasso: null },
              setWhere: isNull(doisPassos.ativadoEm),
            });
          return nomeDaOrganizacao(tx);
        },
      );
      if (organizacao === null) throw doisPassosAtivos();
      return {
        chave: formatarChave(chave),
        uri: uriDoApp({ chave, usuario: sessao.usuario, organizacao }),
      };
    },
  );

  app.post(
    '/conta/dois-passos/confirmacao',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtivaOu('cadastrar-dois-passos'),
      schema: {
        summary: 'Confirmar o cadastro com o código do app e ativar a verificação',
        body: PedidoComCodigo,
        response: {
          200: ResultadoDaAtivacao,
          401: RespostaDeProblema,
          409: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const momento = agora();
      const origem = origemDa(requisicao);
      const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
      const resultado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [linha] = await tx
          .select()
          .from(doisPassos)
          .where(eq(doisPassos.contaId, sessao.contaId));
        if (!linha) return { tipo: 'sem-cadastro' } as const;
        if (linha.ativadoEm) return { tipo: 'ja-ativa' } as const;
        const chave = decifrarChaveDoApp(linha.segredoCifrado, chaveDoisPassos, sessao.contaId);
        const passo = conferirCodigoDoApp(chave, requisicao.body.codigo, momento.getTime(), null);
        if (passo === null) return { tipo: 'invalido' } as const;

        await tx
          .update(doisPassos)
          .set({ ativadoEm: momento, ultimoPasso: passo })
          .where(eq(doisPassos.id, linha.id));
        await fecharOCofreDaConta(tx, sessao.contaId);
        const codigos = gerarCodigosDeRecuperacao();
        await tx
          .delete(codigosDeRecuperacao)
          .where(eq(codigosDeRecuperacao.contaId, sessao.contaId));
        await tx.insert(codigosDeRecuperacao).values(
          codigos.map((codigo) => ({
            orgId: sql`app.current_org()`,
            contaId: sessao.contaId,
            hash: hashDoCodigo(codigo),
            criadoEm: momento,
          })),
        );
        // Quem confirma acabou de provar o aparelho: a sessão vale como se tivesse dado o código.
        await tx.update(sessoes).set({ segundoPassoEm: momento }).where(eq(sessoes.id, sessao.id));
        await tx.update(contas).set({ atualizadaEm: momento }).where(eq(contas.id, sessao.contaId));
        await registrarNaAuditoria(tx, {
          acao: 'dois-passos.ativados',
          ator,
          alvo: { tipo: 'conta', id: sessao.contaId },
          origem,
          momento,
          saida: await saidaDaConta(tx, sessao.contaId),
        });
        await registrarNaAuditoria(tx, {
          acao: 'codigos-de-recuperacao.gerados',
          ator,
          alvo: { tipo: 'conta', id: sessao.contaId },
          dados: { quantidade: codigos.length },
          origem,
          momento,
        });
        const sessoesEncerradas = await encerrarSessoesDaConta(tx, {
          contaId: sessao.contaId,
          motivo: 'dois-passos-ativados',
          momento,
          ator,
          origem,
          exceto: sessao.id,
        });
        const etapa = await seguirEntrada(tx, { sessao, momento, origem });
        return {
          tipo: 'ativada',
          codigos,
          etapa,
          sessoesEncerradas,
          dados: await lerDadosDoEstado(tx, sessao.contaId),
        } as const;
      });

      if (resultado.tipo === 'sem-cadastro') {
        throw new ProblemaDaApi({
          codigo: 'cadastro-nao-iniciado',
          status: 409,
          titulo: 'Cadastro não iniciado',
          detalhe: 'Comece o cadastro da verificação em dois passos antes de confirmar.',
        });
      }
      if (resultado.tipo === 'ja-ativa') throw doisPassosAtivos();
      if (resultado.tipo === 'invalido') throw codigoInvalidoNoApp();
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
        codigosDeRecuperacao: resultado.codigos,
        sessoesEncerradas: resultado.sessoesEncerradas,
      };
    },
  );

  /**
   * A conta tem a verificação ativa e não é obrigada a ela, nem por um perfil; a desativação só
   * passa assim.
   */
  const exigirDesativavel = async (tx: Transacao, contaId: string, exigidaPorPerfil: boolean) => {
    const [linha] = await tx
      .select({ exigeDoisPassos: contas.exigeDoisPassos, ativadoEm: doisPassos.ativadoEm })
      .from(contas)
      .leftJoin(doisPassos, eq(doisPassos.contaId, contas.id))
      .where(eq(contas.id, contaId));
    if (linha?.exigeDoisPassos || exigidaPorPerfil) return 'exigida' as const;
    if (!linha?.ativadoEm) return 'inativa' as const;
    return 'ok' as const;
  };

  app.post(
    '/conta/dois-passos/desativacao',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Desativar a verificação em dois passos, confirmando com um código',
        body: PedidoComCodigo,
        response: {
          204: z.null(),
          401: RespostaDeProblema,
          409: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const momento = agora();
      const origem = origemDa(requisicao);
      const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
      const resultado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const situacao = await exigirDesativavel(tx, sessao.contaId, sessao.acesso.exigeDoisPassos);
        if (situacao !== 'ok') return situacao;
        const { aceito } = await conferirCodigoDaConta(tx, {
          contaId: sessao.contaId,
          codigo: requisicao.body.codigo,
          momento,
          chaveDoisPassos,
          ator,
          origem,
        });
        if (!aceito) return 'invalido' as const;
        await tx.delete(doisPassos).where(eq(doisPassos.contaId, sessao.contaId));
        await tx
          .delete(codigosDeRecuperacao)
          .where(eq(codigosDeRecuperacao.contaId, sessao.contaId));
        await fecharOCofreDaConta(tx, sessao.contaId);
        await registrarNaAuditoria(tx, {
          acao: 'dois-passos.desativados',
          ator,
          alvo: { tipo: 'conta', id: sessao.contaId },
          origem,
          momento,
          saida: await saidaDaConta(tx, sessao.contaId),
        });
        return 'desativada' as const;
      });
      if (resultado === 'exigida') {
        throw new ProblemaDaApi({
          codigo: 'dois-passos-exigidos',
          status: 409,
          titulo: 'Verificação exigida',
          detalhe: 'A verificação em dois passos é exigida para a sua conta.',
        });
      }
      if (resultado === 'inativa') throw doisPassosInativos();
      if (resultado === 'invalido') throw codigoIncorreto();
      return resposta.code(204).send(null);
    },
  );

  app.post(
    '/conta/dois-passos/codigos-de-recuperacao',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Gerar códigos de recuperação novos, que invalidam os antigos',
        body: PedidoComCodigo,
        response: {
          200: CodigosNovos,
          401: RespostaDeProblema,
          409: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const momento = agora();
      const origem = origemDa(requisicao);
      const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
      const resultado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [ativa] = await tx
          .select({ ativadoEm: doisPassos.ativadoEm })
          .from(doisPassos)
          .where(eq(doisPassos.contaId, sessao.contaId));
        if (!ativa?.ativadoEm) return { tipo: 'inativa' } as const;
        const { aceito } = await conferirCodigoDaConta(tx, {
          contaId: sessao.contaId,
          codigo: requisicao.body.codigo,
          momento,
          chaveDoisPassos,
          ator,
          origem,
        });
        if (!aceito) return { tipo: 'invalido' } as const;
        const codigos = gerarCodigosDeRecuperacao();
        await tx
          .delete(codigosDeRecuperacao)
          .where(eq(codigosDeRecuperacao.contaId, sessao.contaId));
        await tx.insert(codigosDeRecuperacao).values(
          codigos.map((codigo) => ({
            orgId: sql`app.current_org()`,
            contaId: sessao.contaId,
            hash: hashDoCodigo(codigo),
            criadoEm: momento,
          })),
        );
        await registrarNaAuditoria(tx, {
          acao: 'codigos-de-recuperacao.gerados',
          ator,
          alvo: { tipo: 'conta', id: sessao.contaId },
          dados: { quantidade: codigos.length },
          origem,
          momento,
        });
        return { tipo: 'gerados', codigos } as const;
      });
      if (resultado.tipo === 'inativa') throw doisPassosInativos();
      if (resultado.tipo === 'invalido') throw codigoIncorreto();
      return { codigosDeRecuperacao: resultado.codigos };
    },
  );
};
