// O rascunho do cadastro do ativo (spec cadastro-de-ativos, "Rascunho do cadastro do ativo"; change
// cadastro-em-etapas, design, decisões 6 e 7): um por conta, sempre o da conta da sessão, para quem
// edita ativos em algum escopo. A rota confere a forma, e não o catálogo, porque o rascunho pode estar
// incompleto; quem confere os valores é o cadastro. O tamanho é o do banco, até 256 KB. Nada vai à
// auditoria nem gera evento: o rascunho não é um registro do ativo.
import {
  type Banco,
  type CadastroComRascunho,
  LIMITE_DO_RASCUNHO,
  naOrganizacao,
  rascunhosDeCadastro,
  type Transacao,
} from '@grafite/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import {
  ConteudoDoRascunhoDoAtivo,
  LeituraDoRascunhoDoAtivo,
  RascunhoGuardado,
} from '../ativos/esquemas.ts';
import { violouVerificacao } from '../banco.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const CADASTRO: CadastroComRascunho = 'ativo';

const rascunhoGrandeDemais = () =>
  new ProblemaDaApi({
    codigo: 'rascunho-grande-demais',
    status: 413,
    titulo: 'Rascunho grande demais',
    detalhe: 'O rascunho passa de 256 KB.',
  });

/** Apaga os rascunhos da conta: o do cadastro dado, ou todos, como na anonimização da pessoa. */
export async function apagarRascunhosDaConta(
  tx: Transacao,
  contaId: string,
  cadastro?: CadastroComRascunho,
): Promise<number> {
  const apagados = await tx
    .delete(rascunhosDeCadastro)
    .where(
      and(
        eq(rascunhosDeCadastro.contaId, contaId),
        cadastro === undefined ? undefined : eq(rascunhosDeCadastro.cadastro, cadastro),
      ),
    )
    .returning({ id: rascunhosDeCadastro.id });
  return apagados.length;
}

const daConta = (contaId: string) =>
  and(eq(rascunhosDeCadastro.contaId, contaId), eq(rascunhosDeCadastro.cadastro, CADASTRO));

export const rotasDoRascunhoDoAtivo: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/ativos/rascunho',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'O rascunho do cadastro do ativo da conta, ou nada',
        response: {
          200: LeituraDoRascunhoDoAtivo,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const [linha] = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        tx
          .select({
            conteudo: rascunhosDeCadastro.conteudo,
            atualizadoEm: rascunhosDeCadastro.atualizadoEm,
          })
          .from(rascunhosDeCadastro)
          .where(daConta(sessao.contaId)),
      );
      // O rascunho guardado numa forma que a versão atual não lê não volta: o cadastro começa de novo.
      const lido = ConteudoDoRascunhoDoAtivo.safeParse(linha?.conteudo);
      if (!linha || !lido.success) return { rascunho: null };
      return { rascunho: { ...lido.data, atualizadoEm: linha.atualizadoEm.toISOString() } };
    },
  );

  app.put(
    '/ativos/rascunho',
    {
      config: { permissao: 'ativos.editar' },
      // O corpo bem maior que o limite nem chega ao banco; perto dele, o banco mede o JSON guardado.
      bodyLimit: 2 * LIMITE_DO_RASCUNHO,
      schema: {
        summary: 'Guardar o rascunho do cadastro do ativo da conta, inteiro',
        body: ConteudoDoRascunhoDoAtivo,
        response: {
          200: RascunhoGuardado,
          401: RespostaDeProblema,
          413: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const momento = agora();
      try {
        await naOrganizacao(banco, orgId, (tx) =>
          tx
            .insert(rascunhosDeCadastro)
            .values({
              orgId,
              contaId: sessao.contaId,
              cadastro: CADASTRO,
              conteudo: requisicao.body,
              atualizadoEm: momento,
            })
            .onConflictDoUpdate({
              target: [
                rascunhosDeCadastro.orgId,
                rascunhosDeCadastro.contaId,
                rascunhosDeCadastro.cadastro,
              ],
              set: { conteudo: requisicao.body, atualizadoEm: momento },
            }),
        );
      } catch (erro) {
        if (violouVerificacao(erro, 'rascunhos_de_cadastro_conteudo_valido')) {
          throw rascunhoGrandeDemais();
        }
        throw erro;
      }
      return { atualizadoEm: momento.toISOString() };
    },
  );

  app.delete(
    '/ativos/rascunho',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Descartar o rascunho do cadastro do ativo da conta',
        response: { 204: z.null(), 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        apagarRascunhosDaConta(tx, sessao.contaId, CADASTRO),
      );
      return resposta.code(204).send(null);
    },
  );
};
