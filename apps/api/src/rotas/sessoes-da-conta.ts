// As sessões da conta (spec entrada-e-sessoes): o usuário vê as próprias sessões abertas, sem token
// e sem as de outra conta, e encerra uma delas ou todas as outras. Encerrar a atual é sair.
import { type Banco, naOrganizacao } from '@grafite/db';
import { descreverDispositivo } from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { encerrarSessao, encerrarSessoesDaConta } from '../acesso/encerramento.ts';
import { exigirAtiva } from '../acesso/escopo.ts';
import { apagarCookieDaSessao, lerSessoesAbertas } from '../acesso/sessoes.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const SessaoDaConta = z
  .object({
    id: z.uuid(),
    /** O navegador e o sistema, como "Chrome no Windows". */
    dispositivo: z.string(),
    ip: z.string().nullable(),
    criadaEm: z.iso.datetime(),
    ultimoUsoEm: z.iso.datetime(),
    atual: z.boolean(),
  })
  .meta({ id: 'SessaoDaConta' });

const RespostaDeEncerramento = z
  .object({ encerradas: z.number().int().min(0) })
  .meta({ id: 'RespostaDeEncerramento' });

const naoEncontrada = () =>
  new ProblemaDaApi({
    codigo: 'nao-encontrado',
    status: 404,
    titulo: 'Não encontrado',
    detalhe: 'Sessão não encontrada.',
  });

export const rotasDasSessoesDaConta: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/conta/sessoes',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Sessões abertas da conta',
        response: { 200: z.array(SessaoDaConta), 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const momento = agora();
      const linhas = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        lerSessoesAbertas(tx, sessao.contaId, momento),
      );
      return linhas.map((linha) => ({
        id: linha.id,
        dispositivo: descreverDispositivo(linha.agente),
        ip: linha.ip,
        criadaEm: linha.criadaEm.toISOString(),
        ultimoUsoEm: linha.ultimoUsoEm.toISOString(),
        atual: linha.id === sessao.id,
      }));
    },
  );

  app.delete(
    '/conta/sessoes/:id',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Encerrar uma sessão da conta',
        params: z.object({ id: z.uuid({ error: 'Sessão não encontrada.' }) }),
        response: { 204: z.null(), 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const atual = requisicao.params.id === sessao.id;
      const encerrou = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        encerrarSessao(tx, {
          sessaoId: requisicao.params.id,
          contaId: sessao.contaId,
          motivo: atual ? 'saida' : 'encerrada-pelo-usuario',
          momento: agora(),
          ator: { tipo: 'conta', contaId: sessao.contaId },
          origem: origemDa(requisicao),
        }),
      );
      if (!encerrou) throw naoEncontrada();
      if (atual) apagarCookieDaSessao(resposta);
      return resposta.code(204).send(null);
    },
  );

  app.delete(
    '/conta/sessoes',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Encerrar todas as outras sessões da conta',
        response: { 200: RespostaDeEncerramento, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      const encerradas = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        encerrarSessoesDaConta(tx, {
          contaId: sessao.contaId,
          motivo: 'outras-encerradas',
          momento: agora(),
          ator: { tipo: 'conta', contaId: sessao.contaId },
          origem: origemDa(requisicao),
          exceto: sessao.id,
        }),
      );
      return { encerradas };
    },
  );
};
