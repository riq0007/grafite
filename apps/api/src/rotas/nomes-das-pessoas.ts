// Os nomes das pessoas para a escolha (spec administracao-de-pessoas; design do P1b, decisão 10, e
// do escolhas-a-vista, decisão 4): quem escolhe o responsável de um ativo, ou o valor de um campo
// de pessoa, busca as pessoas ativas pelo nome sem precisar ver a Administração. Só o id e o nome
// saem, como os locais saem só com o caminho, e o total das que casam. Sem o texto, vêm as
// primeiras em ordem alfabética. Com o local do ativo, para quem edita os ativos dele, as pessoas
// do ramo vêm primeiro, marcadas como do mesmo local, sem dizer o local de ninguém.
import { type Banco, naOrganizacao, pessoas } from '@grafite/db';
import { normalizarTexto, podeEm } from '@grafite/domain';
import { and, asc, count, eq, inArray, isNull, like, not, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { contendo } from '../busca.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

/** Quantas pessoas a resposta traz. */
const NA_RESPOSTA = 20;

const NomesDasPessoas = z
  .object({
    pessoas: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        /** A pessoa trabalha no local pedido ou dentro dele. */
        doMesmoLocal: z.boolean(),
      }),
    ),
    /** Quantas pessoas ativas casam com a busca. */
    total: z.number().int(),
  })
  .meta({ id: 'NomesDasPessoas' });

export const rotasDosNomesDasPessoas: FastifyPluginAsyncZod<{ banco: Banco }> = async (
  app,
  { banco },
) => {
  app.get(
    '/pessoas/nomes',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Os nomes das pessoas ativas, para escolher o responsável de um ativo',
        querystring: z.object({
          busca: z.string().max(100, { error: 'Use até 100 caracteres.' }).optional(),
          local: z.uuid({ error: 'Informe o id de um local.' }).optional(),
        }),
        response: { 200: NomesDasPessoas, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const palavras = normalizarTexto(requisicao.query.busca ?? '')
        .split(' ')
        .filter(Boolean);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        // O ramo do local pedido, só para quem edita os ativos nele.
        const { local } = requisicao.query;
        let ramo: string[] = [];
        if (local) {
          const arvore = await lerArvore(tx);
          if (arvore.local(local) && podeEm(acesso, 'ativos.editar', local, arvore)) {
            ramo = [...arvore.ramo(local)];
          }
        }
        const doRamo = ramo.length > 0 ? inArray(pessoas.localId, ramo) : undefined;
        const ativas = eq(pessoas.situacao, 'ativa');
        const comAMarca = (linha: { id: string; nome: string; localId: string | null }) => ({
          id: linha.id,
          nome: linha.nome,
          doMesmoLocal: linha.localId !== null && ramo.includes(linha.localId),
        });

        if (palavras.length === 0) {
          const [contagem] = await tx.select({ total: count() }).from(pessoas).where(ativas);
          const colunas = { id: pessoas.id, nome: pessoas.nome, localId: pessoas.localId };
          const primeiras = doRamo
            ? await tx
                .select(colunas)
                .from(pessoas)
                .where(and(ativas, doRamo))
                .orderBy(asc(pessoas.nome), asc(pessoas.id))
                .limit(NA_RESPOSTA)
            : [];
          const outras = await tx
            .select(colunas)
            .from(pessoas)
            .where(and(ativas, doRamo ? or(isNull(pessoas.localId), not(doRamo)) : undefined))
            .orderBy(asc(pessoas.nome), asc(pessoas.id))
            .limit(NA_RESPOSTA - primeiras.length);
          return {
            pessoas: [...primeiras, ...outras].map(comAMarca),
            total: contagem?.total ?? 0,
          };
        }

        // A busca da pessoa também tem o e-mail e a matrícula: o banco traz as candidatas, e só
        // as que casam pelo nome contam.
        const candidatas = await tx
          .select({ id: pessoas.id, nome: pessoas.nome, localId: pessoas.localId })
          .from(pessoas)
          .where(and(ativas, ...palavras.map((palavra) => like(pessoas.busca, contendo(palavra)))))
          .orderBy(asc(pessoas.nome), asc(pessoas.id));
        const peloNome = candidatas
          .filter((linha) => {
            const nome = normalizarTexto(linha.nome);
            return palavras.every((palavra) => nome.includes(palavra));
          })
          .map(comAMarca);
        const ordenadas = [
          ...peloNome.filter((pessoa) => pessoa.doMesmoLocal),
          ...peloNome.filter((pessoa) => !pessoa.doMesmoLocal),
        ];
        return { pessoas: ordenadas.slice(0, NA_RESPOSTA), total: peloNome.length };
      });
    },
  );
};
