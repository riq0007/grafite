// O cofre de segredos (spec cofre-de-segredos e modulo-cofre; design do P6, decisões 1, 3, 5 e 7):
// a lista dos segredos que a conta vê, com a busca e os filtros, a ficha sem o valor e, para quem
// administra o cofre, o cadastro e a edição, com a troca do valor. Nenhuma resposta destas rotas leva
// o valor; ele é cifrado antes de ir ao banco e nunca vai à auditoria nem ao evento.

import { isDeepStrictEqual } from 'node:util';
import {
  acessosAosSegredos,
  type Banco,
  CLASSIFICACOES_DE_SEGREDO_NO_BANCO,
  naOrganizacao,
  pessoas,
  SITUACOES_DO_SEGREDO,
  segredos,
  segredosDosAtivos,
  TIPOS_DE_SEGREDO_NO_BANCO,
  type Transacao,
} from '@grafite/db';
import { conferirSegredo, normalizarTexto, pode, TIPOS_DE_TITULAR } from '@grafite/domain';
import { and, asc, eq, inArray, like, or, type SQL, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { contendo } from '../busca.ts';
import { type ChavesDoCofre, cifrarSegredo } from '../cofre/cifra.ts';
import {
  ativosDosSegredos,
  conferirVinculos,
  type LinhaDoSegredo,
  lerSegredoVisto,
  type SegredoVisto,
  visaoDoSegredo,
} from '../cofre/segredos.ts';
import { alcancadoPor, titularesDaConta } from '../cofre/titulares.ts';
import { dadosInvalidos, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const TipoDoSegredo = z.enum(TIPOS_DE_SEGREDO_NO_BANCO, { error: 'Escolha o tipo do segredo.' });
const ClassificacaoDoSegredo = z.enum(CLASSIFICACOES_DE_SEGREDO_NO_BANCO, {
  error: 'Escolha a classificação do segredo.',
});

const PessoaDoSegredo = z
  .object({ id: z.uuid(), nome: z.string() })
  .meta({ id: 'PessoaDoSegredo' });

const AtivoDoSegredo = z
  .object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() })
  .meta({ id: 'AtivoDoSegredo' });

const TitularDoSegredo = z
  .object({ tipo: z.enum(TIPOS_DE_TITULAR), id: z.uuid(), nome: z.string() })
  .meta({ id: 'TitularDoSegredo' });

const ItemDoCofre = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    tipo: TipoDoSegredo,
    classificacao: ClassificacaoDoSegredo,
    identificador: z.string().nullable(),
    endereco: z.string().nullable(),
    pessoa: PessoaDoSegredo.nullable(),
    /** Em aaaa-mm-dd. */
    validade: z.string().nullable(),
    /** Em aaaa-mm-dd. */
    proximaRotacao: z.string().nullable(),
    situacao: z.enum(SITUACOES_DO_SEGREDO),
  })
  .meta({ id: 'ItemDoCofre' });

const ListaDoCofre = z
  .object({
    segredos: z.array(ItemDoCofre),
    permite: z.object({ cadastrar: z.boolean() }),
  })
  .meta({ id: 'ListaDoCofre' });

export const FichaDoSegredo = ItemDoCofre.extend({
  notas: z.string().nullable(),
  ativos: z.array(AtivoDoSegredo),
  /** O momento em que o valor foi gravado pela última vez. */
  valorTrocadoEm: z.string(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
  /** A quem o segredo está liberado; só para quem administra o cofre. */
  acesso: z.array(TitularDoSegredo).optional(),
  permite: z.object({
    /** A conta alcança o segredo ativo: revela e copia com o cofre liberado. */
    revelar: z.boolean(),
    /** A conta administra o cofre: edita, troca o valor, muda o acesso e a situação. */
    administrar: z.boolean(),
  }),
}).meta({ id: 'FichaDoSegredo' });

const FiltrosDoCofre = z.object({
  busca: z.string().max(200, { error: 'Use até 200 caracteres.' }).optional(),
  tipo: TipoDoSegredo.optional(),
  classificacao: ClassificacaoDoSegredo.optional(),
  /** Os ativos (padrão), os inativos ou todos; quem só usa o cofre vê só os ativos. */
  situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
});

const TextoOpcional = z.string().nullable().optional();
const PessoaId = z.uuid({ error: 'Pessoa não encontrada.' }).nullable().optional();
const AtivoIds = z
  .array(z.uuid({ error: 'Ativo não encontrado.' }))
  .max(200, { error: 'Escolha até 200 ativos.' })
  .optional();

const PedidoDeSegredo = z
  .object({
    nome: z.string({ error: 'Informe o nome do segredo.' }),
    tipo: TipoDoSegredo,
    classificacao: ClassificacaoDoSegredo,
    identificador: TextoOpcional,
    endereco: TextoOpcional,
    notas: TextoOpcional,
    /** Em aaaa-mm-dd ou dd/mm/aaaa. */
    validade: TextoOpcional,
    /** Em aaaa-mm-dd ou dd/mm/aaaa. */
    proximaRotacao: TextoOpcional,
    pessoaId: PessoaId,
    ativoIds: AtivoIds,
    /** O valor secreto, que vai cifrado ao banco e nunca volta nesta resposta. */
    valor: z.string({ error: 'Informe o valor do segredo.' }),
  })
  .meta({ id: 'PedidoDeSegredo' });

const PedidoDeAlteracaoDoSegredo = z
  .object({
    nome: z.string().optional(),
    tipo: TipoDoSegredo.optional(),
    classificacao: ClassificacaoDoSegredo.optional(),
    identificador: TextoOpcional,
    endereco: TextoOpcional,
    notas: TextoOpcional,
    validade: TextoOpcional,
    proximaRotacao: TextoOpcional,
    pessoaId: PessoaId,
    /** A lista inteira dos ativos ligados, quando muda. */
    ativoIds: AtivoIds,
    /** O valor novo, só quando ele é trocado: a troca gera uma chave nova para o segredo. */
    valor: z.string().optional(),
  })
  .meta({ id: 'PedidoDeAlteracaoDoSegredo' });

export const ParametrosDoSegredo = z.object({ id: z.uuid({ error: 'Segredo não encontrado.' }) });

export const PROBLEMAS_DO_COFRE = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

export interface DependenciasDoCofre {
  banco: Banco;
  agora: () => Date;
  chavesDoCofre: ChavesDoCofre;
}

const iso = (momento: Date) => momento.toISOString();

const semRepetir = (ids: readonly string[]) => [...new Set(ids)];

/** O item da lista: os dados do segredo, sem as notas e sem nenhum valor. */
function comoItem(
  linha: LinhaDoSegredo,
  pessoa: { id: string; nome: string } | null,
): z.infer<typeof ItemDoCofre> {
  return {
    id: linha.id,
    nome: linha.nome,
    tipo: linha.tipo,
    classificacao: linha.classificacao,
    identificador: linha.identificador,
    endereco: linha.endereco,
    pessoa,
    validade: linha.validade,
    proximaRotacao: linha.proximaRotacao,
    situacao: linha.situacao,
  };
}

async function pessoaDoSegredo(tx: Transacao, pessoaId: string | null) {
  if (pessoaId === null) return null;
  const [pessoa] = await tx
    .select({ id: pessoas.id, nome: pessoas.nome })
    .from(pessoas)
    .where(eq(pessoas.id, pessoaId));
  return pessoa ?? null;
}

/** A ficha do segredo, como a conta o vê; o acesso só para quem administra o cofre. */
export async function comoFicha(
  tx: Transacao,
  { linha, acesso, administra, alcanca }: SegredoVisto,
): Promise<z.infer<typeof FichaDoSegredo>> {
  const ativos = (await ativosDosSegredos(tx, [linha.id])).get(linha.id) ?? [];
  return {
    ...comoItem(linha, await pessoaDoSegredo(tx, linha.pessoaId)),
    notas: linha.notas,
    ativos,
    valorTrocadoEm: iso(linha.valorTrocadoEm),
    criadoEm: iso(linha.criadoEm),
    atualizadoEm: iso(linha.atualizadoEm),
    ...(administra ? { acesso } : {}),
    permite: { revelar: alcanca && linha.situacao === 'ativo', administrar: administra },
  };
}

function condicoesDaLista(filtros: z.infer<typeof FiltrosDoCofre>): SQL[] {
  const condicoes: SQL[] = [];
  if (filtros.situacao !== 'todos') {
    condicoes.push(eq(segredos.situacao, filtros.situacao === 'ativos' ? 'ativo' : 'inativo'));
  }
  if (filtros.tipo) condicoes.push(eq(segredos.tipo, filtros.tipo));
  if (filtros.classificacao) condicoes.push(eq(segredos.classificacao, filtros.classificacao));
  const palavras = normalizarTexto(filtros.busca ?? '')
    .split(' ')
    .filter(Boolean);
  for (const palavra of palavras) {
    const padrao = contendo(palavra);
    condicoes.push(
      or(
        like(segredos.nomeNormalizado, padrao),
        like(sql`lower(${segredos.identificador})`, padrao),
        like(sql`lower(${segredos.endereco})`, padrao),
      ) as SQL,
    );
  }
  return condicoes;
}

/** O id do segredo, gerado antes de cifrar, porque ele entra nos dados associados da cifra. */
async function novoId(tx: Transacao): Promise<string> {
  const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
  const id = rows[0]?.id;
  if (!id) throw new Error('O banco não gerou o id do segredo.');
  return id;
}

/** O pedido conferido pelo domínio, com a recusa de cada campo como a tela mostra. */
function conferido(entrada: Record<string, unknown>, valorObrigatorio: boolean) {
  const resultado = conferirSegredo(entrada, { valorObrigatorio });
  if (!resultado.ok) throw dadosInvalidos(resultado.erros as Record<string, string>);
  return resultado.dados;
}

export const quemPede = (sessao: SessaoDaRequisicao) => ({
  contaId: sessao.contaId,
  acesso: sessao.acesso,
});

export const rotasDoCofre: FastifyPluginAsyncZod<DependenciasDoCofre> = async (
  app,
  { banco, agora, chavesDoCofre },
) => {
  app.get(
    '/cofre/segredos',
    {
      config: { permissao: 'cofre.usar' },
      schema: {
        summary: 'Os segredos que a conta vê, pelo nome, com a busca e os filtros, sem os valores',
        querystring: FiltrosDoCofre,
        response: { 200: ListaDoCofre, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const administra = pode(sessao.acesso, 'cofre.administrar');
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const condicoes = condicoesDaLista(requisicao.query);
        if (!administra) {
          condicoes.push(eq(segredos.situacao, 'ativo'));
          condicoes.push(alcancadoPor(tx, await titularesDaConta(tx, sessao.contaId)));
        }
        const linhas = await tx
          .select({ segredo: segredos, pessoa: { id: pessoas.id, nome: pessoas.nome } })
          .from(segredos)
          .leftJoin(
            pessoas,
            and(eq(pessoas.orgId, segredos.orgId), eq(pessoas.id, segredos.pessoaId)),
          )
          .where(and(...condicoes))
          .orderBy(asc(segredos.nomeNormalizado), asc(segredos.id));
        return {
          segredos: linhas.map(({ segredo, pessoa }) => comoItem(segredo, pessoa)),
          permite: { cadastrar: administra },
        };
      });
    },
  );

  app.get(
    '/cofre/segredos/:id',
    {
      config: { permissao: 'cofre.usar' },
      schema: {
        summary: 'A ficha de um segredo, sem o valor; o acesso só para quem administra o cofre',
        params: ParametrosDoSegredo,
        response: { 200: FichaDoSegredo, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        comoFicha(tx, await lerSegredoVisto(tx, requisicao.params.id, quemPede(sessao))),
      );
    },
  );

  app.post(
    '/cofre/segredos',
    {
      config: { permissao: 'cofre.administrar' },
      schema: {
        summary: 'Cadastrar um segredo, com o valor cifrado e o acesso de quem cadastra',
        body: PedidoDeSegredo,
        response: { 201: FichaDoSegredo, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const pedido = requisicao.body;
      const dados = conferido(pedido, true);
      const pessoaId = pedido.pessoaId ?? null;
      const ativoIds = semRepetir(pedido.ativoIds ?? []);
      const momento = agora();
      const ficha = await naOrganizacao(banco, orgId, async (tx) => {
        await conferirVinculos(tx, { pessoaId, ativoIds }, { pessoaId: null, ativoIds: [] });
        const id = await novoId(tx);
        const cifrado = cifrarSegredo({ valor: dados.valor ?? '' }, chavesDoCofre, {
          orgId,
          segredoId: id,
        });
        const [linha] = await tx
          .insert(segredos)
          .values({
            id,
            orgId,
            nome: dados.nome,
            nomeNormalizado: normalizarTexto(dados.nome),
            tipo: dados.tipo,
            classificacao: dados.classificacao,
            identificador: dados.identificador,
            endereco: dados.endereco,
            notas: dados.notas,
            validade: dados.validade,
            proximaRotacao: dados.proximaRotacao,
            pessoaId,
            ...cifrado,
            criadoPor: sessao.contaId,
            valorTrocadoEm: momento,
            criadoEm: momento,
            atualizadoEm: momento,
          })
          .returning();
        if (!linha) throw new Error('O segredo não foi cadastrado.');
        for (const ativoId of ativoIds) {
          await tx.insert(segredosDosAtivos).values({ orgId, segredoId: id, ativoId });
        }
        // Quem cadastra ganha o acesso na mesma transação, como parte do cadastro.
        await tx.insert(acessosAosSegredos).values({
          orgId,
          segredoId: id,
          contaId: sessao.contaId,
          concedidoPor: sessao.contaId,
          concedidoEm: momento,
        });
        await registrarNaAuditoria(tx, {
          acao: 'segredo.criado',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'segredo', id },
          depois: {
            ...visaoDoSegredo(linha, ativoIds),
            acesso: [{ tipo: 'conta', id: sessao.contaId }],
          },
          origem: origemDa(requisicao),
          momento,
        });
        return comoFicha(tx, await lerSegredoVisto(tx, id, quemPede(sessao)));
      });
      return resposta.code(201).send(ficha);
    },
  );

  app.patch(
    '/cofre/segredos/:id',
    {
      config: { permissao: 'cofre.administrar' },
      schema: {
        summary: 'Editar os dados e os vínculos de um segredo e, se vier, trocar o valor',
        params: ParametrosDoSegredo,
        body: PedidoDeAlteracaoDoSegredo,
        response: { 200: FichaDoSegredo, ...PROBLEMAS_DO_COFRE },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const pedido = requisicao.body;
      const momento = agora();
      const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
      return naOrganizacao(banco, orgId, async (tx) => {
        const visto = await lerSegredoVisto(tx, requisicao.params.id, quemPede(sessao), {
          travar: true,
        });
        const antes = visto.linha;
        const ativosAntes =
          (await ativosDosSegredos(tx, [antes.id])).get(antes.id)?.map((ativo) => ativo.id) ?? [];
        const { pessoaId: pedidaPessoa, ativoIds: pedidosAtivos, ...campos } = pedido;
        const dados = conferido(
          {
            nome: antes.nome,
            tipo: antes.tipo,
            classificacao: antes.classificacao,
            identificador: antes.identificador,
            endereco: antes.endereco,
            notas: antes.notas,
            validade: antes.validade,
            proximaRotacao: antes.proximaRotacao,
            ...campos,
          },
          false,
        );
        const pessoaId = pedidaPessoa === undefined ? antes.pessoaId : pedidaPessoa;
        const ativoIds = pedidosAtivos === undefined ? ativosAntes : semRepetir(pedidosAtivos);
        await conferirVinculos(
          tx,
          { pessoaId, ativoIds },
          { pessoaId: antes.pessoaId, ativoIds: ativosAntes },
        );
        const mudados = {
          nome: dados.nome,
          nomeNormalizado: normalizarTexto(dados.nome),
          tipo: dados.tipo,
          classificacao: dados.classificacao,
          identificador: dados.identificador,
          endereco: dados.endereco,
          notas: dados.notas,
          validade: dados.validade,
          proximaRotacao: dados.proximaRotacao,
          pessoaId,
        };
        const visaoAntes = visaoDoSegredo(antes, ativosAntes);
        const visaoDepois = visaoDoSegredo({ ...antes, ...mudados }, ativoIds);
        if (!isDeepStrictEqual(visaoAntes, visaoDepois)) {
          await tx
            .update(segredos)
            .set({ ...mudados, atualizadoEm: momento })
            .where(eq(segredos.id, antes.id));
          const saem = ativosAntes.filter((id) => !ativoIds.includes(id));
          if (saem.length > 0) {
            await tx
              .delete(segredosDosAtivos)
              .where(
                and(
                  eq(segredosDosAtivos.segredoId, antes.id),
                  inArray(segredosDosAtivos.ativoId, saem),
                ),
              );
          }
          for (const ativoId of ativoIds.filter((id) => !ativosAntes.includes(id))) {
            await tx.insert(segredosDosAtivos).values({ orgId, segredoId: antes.id, ativoId });
          }
          await registrarNaAuditoria(tx, {
            acao: 'segredo.alterado',
            ator,
            alvo: { tipo: 'segredo', id: antes.id },
            antes: visaoAntes,
            depois: visaoDepois,
            origem: origemDa(requisicao),
            momento,
          });
        }
        if (dados.valor !== null) {
          // Uma chave nova para o valor novo: a chave do segredo fica presa a um valor só.
          const cifrado = cifrarSegredo({ valor: dados.valor }, chavesDoCofre, {
            orgId,
            segredoId: antes.id,
          });
          await tx
            .update(segredos)
            .set({ ...cifrado, valorTrocadoEm: momento, atualizadoEm: momento })
            .where(eq(segredos.id, antes.id));
          await registrarNaAuditoria(tx, {
            acao: 'valor-do-segredo.trocado',
            ator,
            alvo: { tipo: 'segredo', id: antes.id },
            origem: origemDa(requisicao),
            momento,
          });
        }
        return comoFicha(tx, await lerSegredoVisto(tx, antes.id, quemPede(sessao)));
      });
    },
  );
};
