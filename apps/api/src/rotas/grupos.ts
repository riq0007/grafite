// Os grupos da organização (spec perfis-e-grupos; design do F2b, decisões 4 e 11): conjuntos de
// contas que recebem perfis como uma conta recebe. Quem vê os acessos vê a lista e a ficha, com os
// membros e os perfis; quem administra os acessos cadastra, edita, inativa, reativa e inclui e
// retira contas. Retirar encerra a participação, sem apagá-la, e o grupo inativo deixa de passar os
// perfis aos membros.
import {
  atribuicoes,
  type Banco,
  contas,
  grupos,
  membrosDoGrupo,
  naOrganizacao,
  perfis,
  pessoas,
  type Transacao,
} from '@grafite/db';
import { type Acesso, type ArvoreDeLocais, normalizarTexto, pode } from '@grafite/domain';
import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { mudarAcessos } from '../acesso/administradores.ts';
import { retirarDosGrupos } from '../acesso/atribuicoes.ts';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { conflito, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const PermiteNoGrupo = z
  .object({
    editar: z.boolean(),
    inativar: z.boolean(),
    reativar: z.boolean(),
    /** Incluir e retirar contas. */
    incluirMembros: z.boolean(),
    /** Atribuir um perfil ao grupo. */
    atribuir: z.boolean(),
  })
  .meta({ id: 'PermiteNoGrupo' });

const PerfilDoGrupo = z
  .object({
    atribuicaoId: z.uuid(),
    perfil: z.object({ id: z.uuid(), nome: z.string(), situacao: z.enum(['ativo', 'inativo']) }),
    /** O escopo; nulo para a organização inteira. */
    local: z
      .object({ id: z.uuid(), caminho: z.string(), situacao: z.enum(['ativo', 'inativo']) })
      .nullable(),
  })
  .meta({ id: 'PerfilDoGrupo' });

const Grupo = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    descricao: z.string().nullable(),
    situacao: z.enum(['ativo', 'inativo']),
    /** Quantas contas participam dele. */
    membros: z.number().int().min(0),
    /** Quantas atribuições de perfil em vigor ele tem. */
    perfis: z.number().int().min(0),
    /** As atribuições em vigor, com o perfil e o escopo: o que o grupo dá a quem participa. */
    perfisEmVigor: z.array(PerfilDoGrupo),
    permite: PermiteNoGrupo,
  })
  .meta({ id: 'Grupo' });

const MembroDoGrupo = z
  .object({
    contaId: z.uuid(),
    pessoaId: z.uuid(),
    nome: z.string(),
    usuario: z.string().nullable(),
    situacao: z.enum(['ativa', 'inativa', 'anonimizada']),
    incluidaEm: z.iso.datetime(),
  })
  .meta({ id: 'MembroDoGrupo' });

const FichaDoGrupo = Grupo.omit({ membros: true, perfis: true, perfisEmVigor: true })
  .extend({ membros: z.array(MembroDoGrupo), perfis: z.array(PerfilDoGrupo) })
  .meta({ id: 'FichaDoGrupo' });

const ListaDeGrupos = z
  .object({ itens: z.array(Grupo), permite: z.object({ cadastrar: z.boolean() }) })
  .meta({ id: 'ListaDeGrupos' });

const CamposDoGrupo = {
  nome: z
    .string({ error: 'Informe o nome do grupo.' })
    .trim()
    .min(1, { error: 'Informe o nome do grupo.' })
    .max(80, { error: 'Use até 80 caracteres.' }),
  descricao: z.string().trim().max(500, { error: 'Use até 500 caracteres.' }).nullable().optional(),
};

const PedidoDeGrupo = z.object(CamposDoGrupo).meta({ id: 'PedidoDeGrupo' });

const PedidoDeAlteracaoDoGrupo = z
  .object({ ...CamposDoGrupo, nome: CamposDoGrupo.nome.optional() })
  .meta({ id: 'PedidoDeAlteracaoDoGrupo' });

const PedidoDeMembro = z
  .object({ contaId: z.uuid({ error: 'Conta não encontrada.' }) })
  .meta({ id: 'PedidoDeMembro' });

const ParametrosDoGrupo = z.object({ id: z.uuid({ error: 'Grupo não encontrado.' }) });
const ParametrosDoMembro = ParametrosDoGrupo.extend({
  contaId: z.uuid({ error: 'Conta não encontrada.' }),
});

const NOME_REPETIDO = 'Já existe um grupo com este nome.';

type LinhaDoGrupo = typeof grupos.$inferSelect;

/** A descrição vazia vale como nenhuma. */
const descricaoLimpa = (descricao: string | null | undefined) => descricao?.trim() || null;

/** O que a auditoria guarda de um grupo. */
const visaoDoGrupo = (grupo: LinhaDoGrupo) => ({
  nome: grupo.nome,
  descricao: grupo.descricao,
  situacao: grupo.situacao,
});

function permiteNoGrupo(acesso: Acesso, grupo: LinhaDoGrupo) {
  const administra = pode(acesso, 'acessos.administrar');
  const ativo = grupo.situacao === 'ativo';
  return {
    editar: administra,
    inativar: administra && ativo,
    reativar: administra && !ativo,
    incluirMembros: administra,
    atribuir: administra && ativo,
  };
}

async function lerGrupo(tx: Transacao, id: string): Promise<LinhaDoGrupo> {
  const [grupo] = await tx.select().from(grupos).where(eq(grupos.id, id));
  if (!grupo) throw naoEncontrado('Grupo não encontrado.');
  return grupo;
}

async function membrosDe(tx: Transacao, grupoId: string) {
  const linhas = await tx
    .select({
      contaId: contas.id,
      pessoaId: contas.pessoaId,
      nome: pessoas.nome,
      usuario: contas.usuario,
      situacao: contas.situacao,
      incluidaEm: membrosDoGrupo.incluidaEm,
    })
    .from(membrosDoGrupo)
    .innerJoin(
      contas,
      and(eq(contas.orgId, membrosDoGrupo.orgId), eq(contas.id, membrosDoGrupo.contaId)),
    )
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(and(eq(membrosDoGrupo.grupoId, grupoId), isNull(membrosDoGrupo.encerradaEm)))
    .orderBy(pessoas.nome, contas.id);
  return linhas.map((linha) => ({ ...linha, incluidaEm: linha.incluidaEm.toISOString() }));
}

async function perfisDe(tx: Transacao, grupoId: string, arvore: ArvoreDeLocais) {
  return (await perfisDosGrupos(tx, arvore, grupoId)).get(grupoId) ?? [];
}

/** As atribuições em vigor de um grupo, ou de todos, por grupo, na ordem do nome do perfil. */
async function perfisDosGrupos(tx: Transacao, arvore: ArvoreDeLocais, grupoId?: string) {
  const linhas = await tx
    .select({
      grupoId: atribuicoes.grupoId,
      atribuicaoId: atribuicoes.id,
      perfil: { id: perfis.id, nome: perfis.nome, situacao: perfis.situacao },
      localId: atribuicoes.localId,
    })
    .from(atribuicoes)
    .innerJoin(
      perfis,
      and(eq(perfis.orgId, atribuicoes.orgId), eq(perfis.id, atribuicoes.perfilId)),
    )
    .where(
      and(
        grupoId === undefined ? isNotNull(atribuicoes.grupoId) : eq(atribuicoes.grupoId, grupoId),
        isNull(atribuicoes.encerradaEm),
      ),
    )
    .orderBy(perfis.nome, atribuicoes.id);
  const porGrupo = new Map<string, PerfilDoGrupoNaResposta[]>();
  for (const { grupoId: doGrupo, atribuicaoId, perfil, localId } of linhas) {
    if (doGrupo === null) continue;
    const local = localId === null ? undefined : arvore.local(localId);
    const lista = porGrupo.get(doGrupo) ?? [];
    lista.push({
      atribuicaoId,
      perfil,
      local: local
        ? { id: local.id, caminho: arvore.caminho(local.id), situacao: local.situacao }
        : null,
    });
    porGrupo.set(doGrupo, lista);
  }
  return porGrupo;
}

type PerfilDoGrupoNaResposta = z.infer<typeof PerfilDoGrupo>;

/** Grava o grupo; o nome de outro grupo vira a recusa no campo, mesmo numa corrida. */
async function semNomeRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'grupos_nome_unico')) {
      throw conflito(NOME_REPETIDO, { nome: NOME_REPETIDO });
    }
    throw erro;
  }
}

export const rotasDosGrupos: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  async function ficha(tx: Transacao, grupo: LinhaDoGrupo, acesso: Acesso) {
    const arvore = await lerArvore(tx);
    return {
      id: grupo.id,
      nome: grupo.nome,
      descricao: grupo.descricao,
      situacao: grupo.situacao,
      permite: permiteNoGrupo(acesso, grupo),
      membros: await membrosDe(tx, grupo.id),
      perfis: await perfisDe(tx, grupo.id, arvore),
    };
  }

  const PROBLEMAS_DO_GRUPO = {
    401: RespostaDeProblema,
    409: RespostaDeProblema,
    ...PROBLEMAS_DO_ACESSO,
  };

  const RESPOSTAS_DO_GRUPO = { 200: FichaDoGrupo, ...PROBLEMAS_DO_GRUPO };

  app.get(
    '/grupos',
    {
      config: { permissao: 'acessos.ver' },
      schema: {
        summary: 'Os grupos da organização',
        response: { 200: ListaDeGrupos, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linhas = await tx.select().from(grupos).orderBy(grupos.nome, grupos.id);
        const contar = async (consulta: Promise<{ grupoId: string | null; total: number }[]>) =>
          new Map((await consulta).map(({ grupoId, total }) => [grupoId, total]));
        const membros = await contar(
          tx
            .select({ grupoId: membrosDoGrupo.grupoId, total: count() })
            .from(membrosDoGrupo)
            .where(isNull(membrosDoGrupo.encerradaEm))
            .groupBy(membrosDoGrupo.grupoId),
        );
        const emVigor = await perfisDosGrupos(tx, await lerArvore(tx));
        return {
          itens: linhas.map((grupo) => ({
            id: grupo.id,
            nome: grupo.nome,
            descricao: grupo.descricao,
            situacao: grupo.situacao,
            membros: membros.get(grupo.id) ?? 0,
            perfis: emVigor.get(grupo.id)?.length ?? 0,
            perfisEmVigor: emVigor.get(grupo.id) ?? [],
            permite: permiteNoGrupo(acesso, grupo),
          })),
          permite: { cadastrar: pode(acesso, 'acessos.administrar') },
        };
      });
    },
  );

  app.get(
    '/grupos/:id',
    {
      config: { permissao: 'acessos.ver' },
      schema: {
        summary: 'Um grupo, com os membros e os perfis',
        params: ParametrosDoGrupo,
        response: RESPOSTAS_DO_GRUPO,
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        ficha(tx, await lerGrupo(tx, requisicao.params.id), acesso),
      );
    },
  );

  app.post(
    '/grupos',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Cadastrar um grupo',
        body: PedidoDeGrupo,
        response: { 201: FichaDoGrupo, ...PROBLEMAS_DO_GRUPO },
      },
    },
    async (requisicao, resposta) => {
      const { acesso, contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      const criado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [grupo] = await semNomeRepetido(() =>
          tx
            .insert(grupos)
            .values({
              orgId: sql`app.current_org()`,
              nome: pedido.nome,
              nomeNormalizado: normalizarTexto(pedido.nome),
              descricao: descricaoLimpa(pedido.descricao),
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(),
        );
        if (!grupo) throw new Error('O grupo não foi cadastrado.');
        await registrarNaAuditoria(tx, {
          acao: 'grupo.criado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'grupo', id: grupo.id },
          depois: visaoDoGrupo(grupo),
          origem: origemDa(requisicao),
          momento,
        });
        return ficha(tx, grupo, acesso);
      });
      return resposta.code(201).send(criado);
    },
  );

  app.patch(
    '/grupos/:id',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Editar um grupo',
        params: ParametrosDoGrupo,
        body: PedidoDeAlteracaoDoGrupo,
        response: RESPOSTAS_DO_GRUPO,
      },
    },
    async (requisicao) => {
      const { acesso, contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await lerGrupo(tx, requisicao.params.id);
        const nome = pedido.nome ?? antes.nome;
        const descricao =
          pedido.descricao === undefined ? antes.descricao : descricaoLimpa(pedido.descricao);
        if (nome === antes.nome && descricao === antes.descricao) return ficha(tx, antes, acesso);
        const [depois] = await semNomeRepetido(() =>
          tx
            .update(grupos)
            .set({ nome, nomeNormalizado: normalizarTexto(nome), descricao, atualizadoEm: momento })
            .where(eq(grupos.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('O grupo não foi alterado.');
        await registrarNaAuditoria(tx, {
          acao: 'grupo.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'grupo', id: antes.id },
          antes: visaoDoGrupo(antes),
          depois: visaoDoGrupo(depois),
          origem: origemDa(requisicao),
          momento,
        });
        return ficha(tx, depois, acesso);
      });
    },
  );

  // A inativação pode tirar quem administra os acessos pelo grupo: passa pela trava `acessos`.
  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'grupo.inativado'],
    ['reativacao', 'ativo', 'grupo.reativado'],
  ] as const) {
    app.post(
      `/grupos/:id/${caminho}`,
      {
        config: { permissao: 'acessos.administrar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um grupo' : 'Reativar um grupo',
          params: ParametrosDoGrupo,
          response: RESPOSTAS_DO_GRUPO,
        },
      },
      async (requisicao) => {
        const { acesso, contaId } = sessaoDa(requisicao);
        const momento = agora();
        const rodar = situacao === 'inativo' ? mudarAcessos : naOrganizacao;
        return rodar(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const antes = await lerGrupo(tx, requisicao.params.id);
          if (antes.situacao === situacao) return ficha(tx, antes, acesso);
          const [depois] = await tx
            .update(grupos)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(grupos.id, antes.id))
            .returning();
          if (!depois) throw new Error('O grupo não foi alterado.');
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'grupo', id: antes.id },
            antes: visaoDoGrupo(antes),
            depois: visaoDoGrupo(depois),
            origem: origemDa(requisicao),
            momento,
          });
          return ficha(tx, depois, acesso);
        });
      },
    );
  }

  app.post(
    '/grupos/:id/membros',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Incluir uma conta no grupo',
        params: ParametrosDoGrupo,
        body: PedidoDeMembro,
        response: RESPOSTAS_DO_GRUPO,
      },
    },
    async (requisicao) => {
      const { acesso, contaId } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const grupo = await lerGrupo(tx, requisicao.params.id);
        const [conta] = await tx
          .select({ id: contas.id, situacao: contas.situacao })
          .from(contas)
          .where(eq(contas.id, requisicao.body.contaId));
        if (!conta) throw naoEncontrado('Conta não encontrada.');
        if (conta.situacao === 'anonimizada') {
          throw conflito('Esta conta foi anonimizada e não muda mais.');
        }
        try {
          await tx.insert(membrosDoGrupo).values({
            orgId: sql`app.current_org()`,
            grupoId: grupo.id,
            contaId: conta.id,
            incluidaEm: momento,
          });
        } catch (erro) {
          if (violouUnicidade(erro, 'membros_do_grupo_em_vigor')) {
            throw conflito('Esta conta já participa do grupo.');
          }
          throw erro;
        }
        await registrarNaAuditoria(tx, {
          acao: 'membro.incluido',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'conta', id: conta.id },
          dados: { grupoId: grupo.id, grupo: grupo.nome },
          origem: origemDa(requisicao),
          momento,
        });
        return ficha(tx, grupo, acesso);
      });
    },
  );

  app.delete(
    '/grupos/:id/membros/:contaId',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Retirar uma conta do grupo, encerrando a participação',
        params: ParametrosDoMembro,
        response: RESPOSTAS_DO_GRUPO,
      },
    },
    async (requisicao) => {
      const { acesso, contaId } = sessaoDa(requisicao);
      const momento = agora();
      // A conta pode administrar os acessos pelo grupo: passa pela trava `acessos`.
      return mudarAcessos(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const grupo = await lerGrupo(tx, requisicao.params.id);
        const retiradas = await retirarDosGrupos(
          tx,
          and(
            eq(membrosDoGrupo.grupoId, grupo.id),
            eq(membrosDoGrupo.contaId, requisicao.params.contaId),
          ) ?? sql`false`,
          { ator: { tipo: 'conta', contaId }, origem: origemDa(requisicao), momento },
        );
        if (retiradas === 0) throw naoEncontrado('Esta conta não participa do grupo.');
        return ficha(tx, grupo, acesso);
      });
    },
  );
};
