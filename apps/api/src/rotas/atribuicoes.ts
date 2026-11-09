// As atribuições de perfil (spec perfis-e-grupos; design do F2b, decisões 4, 5 e 11): um perfil
// ativo dado a uma conta ou a um grupo, para a organização inteira ou o ramo de um local ativo, e o
// encerramento, que nunca apaga e respeita o último administrador. O acesso de uma conta mostra as
// atribuições, os grupos e cada permissão efetiva com a origem dela, pela mesma resolução do domínio
// que decide na API.
import {
  atribuicoes,
  type Banco,
  contas,
  grupos,
  membrosDoGrupo,
  naOrganizacao,
  perfis,
  pessoas,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  definicaoDa,
  listarPermissoes,
  PERMISSOES,
  type Permissao,
  pode,
} from '@grafite/domain';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { carregarAcesso } from '../acesso/acesso.ts';
import { mudarAcessos } from '../acesso/administradores.ts';
import { alvoDaAtribuicao, encerrarAtribuicoes, visaoDaAtribuicao } from '../acesso/atribuicoes.ts';
import { sessaoDa } from '../acesso/escopo.ts';
import { exigirLocalAtivo, lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { conflito, naoEncontrado, ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const CHAVES = PERMISSOES.map((permissao) => permissao.chave) as [Permissao, ...Permissao[]];

const LocalDoEscopo = z
  .object({ id: z.uuid(), caminho: z.string(), situacao: z.enum(['ativo', 'inativo']) })
  .meta({ id: 'LocalDoEscopo' });

const PerfilAtribuido = z.object({
  id: z.uuid(),
  nome: z.string(),
  situacao: z.enum(['ativo', 'inativo']),
});

const GrupoDaAtribuicao = z.object({
  id: z.uuid(),
  nome: z.string(),
  situacao: z.enum(['ativo', 'inativo']),
});

const Atribuicao = z
  .object({
    id: z.uuid(),
    perfil: PerfilAtribuido,
    conta: z
      .object({
        id: z.uuid(),
        pessoaId: z.uuid(),
        nome: z.string(),
        usuario: z.string().nullable(),
      })
      .nullable(),
    grupo: GrupoDaAtribuicao.nullable(),
    /** O escopo; nulo para a organização inteira. */
    local: LocalDoEscopo.nullable(),
    criadaEm: z.iso.datetime(),
  })
  .meta({ id: 'Atribuicao' });

const AtribuicaoCriada = z
  .object({
    atribuicao: Atribuicao,
    /** As permissões do perfil que valem só para a organização inteira e não valem no local. */
    ignoradas: z.array(z.enum(CHAVES)),
  })
  .meta({ id: 'AtribuicaoCriada' });

const PedidoDeAtribuicao = z
  .object({
    perfilId: z.uuid({ error: 'Perfil não encontrado.' }),
    contaId: z.uuid({ error: 'Conta não encontrada.' }).nullable().optional(),
    grupoId: z.uuid({ error: 'Grupo não encontrado.' }).nullable().optional(),
    /** O local do escopo; nulo (o padrão) para a organização inteira. */
    localId: z.uuid({ error: 'Local não encontrado.' }).nullable().default(null),
  })
  .meta({ id: 'PedidoDeAtribuicao' });

const AtribuicaoDaConta = z
  .object({
    id: z.uuid(),
    perfil: PerfilAtribuido,
    local: LocalDoEscopo.nullable(),
    /** O grupo, quando a conta tem o perfil por ele. */
    grupo: GrupoDaAtribuicao.nullable(),
    criadaEm: z.iso.datetime(),
    permite: z.object({ encerrar: z.boolean() }),
  })
  .meta({ id: 'AtribuicaoDaConta' });

const OrigemDaPermissao = z
  .object({
    atribuicaoId: z.uuid(),
    perfil: z.object({ id: z.uuid(), nome: z.string() }),
    grupo: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    local: z.object({ id: z.uuid(), caminho: z.string() }).nullable(),
  })
  .meta({ id: 'OrigemDaPermissao' });

const AcessoDaConta = z
  .object({
    atribuicoes: z.array(AtribuicaoDaConta),
    grupos: z.array(
      GrupoDaAtribuicao.extend({ incluidaEm: z.iso.datetime() }).meta({ id: 'GrupoDaConta' }),
    ),
    /** O que a conta pode fazer: cada permissão efetiva, com o escopo e de onde ela vem. */
    permissoes: z.array(
      z
        .object({
          chave: z.enum(CHAVES),
          organizacao: z.boolean(),
          locais: z.array(z.object({ id: z.uuid(), caminho: z.string() })),
          origens: z.array(OrigemDaPermissao),
        })
        .meta({ id: 'PermissaoEfetiva' }),
    ),
    exigeDoisPassos: z.object({ conta: z.boolean(), perfis: z.array(z.string()) }),
    permite: z.object({ atribuir: z.boolean() }),
  })
  .meta({ id: 'AcessoDaConta' });

const ParametrosDaAtribuicao = z.object({ id: z.uuid({ error: 'Atribuição não encontrada.' }) });
const ParametrosDaConta = z.object({ id: z.uuid({ error: 'Conta não encontrada.' }) });

const escolhaUmaContaOuUmGrupo = () =>
  new ProblemaDaApi({
    codigo: 'dados-invalidos',
    status: 400,
    titulo: 'Dados inválidos',
    detalhe: 'Escolha uma conta ou um grupo.',
  });

/** As permissões do perfil que valem só para a organização inteira: num local, não valem. */
function ignoradasNoLocal(perfil: { permissoes: string[]; todasAsPermissoes: boolean }) {
  const declaradas = perfil.todasAsPermissoes
    ? CHAVES
    : CHAVES.filter((chave) => perfil.permissoes.includes(chave));
  return declaradas.filter((chave) => definicaoDa(chave).escopo === 'organizacao');
}

function localDoEscopo(arvore: ArvoreDeLocais, localId: string | null) {
  const local = localId === null ? undefined : arvore.local(localId);
  return local
    ? { id: local.id, caminho: arvore.caminho(local.id), situacao: local.situacao }
    : null;
}

export const rotasDasAtribuicoes: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.post(
    '/atribuicoes',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Atribuir um perfil a uma conta ou a um grupo, com o escopo',
        body: PedidoDeAtribuicao,
        response: {
          201: AtribuicaoCriada,
          401: RespostaDeProblema,
          409: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) => {
      const { contaId: ator } = sessaoDa(requisicao);
      const { perfilId, contaId = null, grupoId = null, localId } = requisicao.body;
      if ((contaId === null) === (grupoId === null)) throw escolhaUmaContaOuUmGrupo();
      const momento = agora();
      const criada = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const [perfil] = await tx.select().from(perfis).where(eq(perfis.id, perfilId));
        if (!perfil) throw naoEncontrado('Perfil não encontrado.');
        if (perfil.situacao !== 'ativo') throw conflito('Reative o perfil antes de atribuí-lo.');
        let conta: { id: string; pessoaId: string; nome: string; usuario: string | null } | null =
          null;
        if (contaId !== null) {
          const [linha] = await tx
            .select({
              id: contas.id,
              pessoaId: contas.pessoaId,
              nome: pessoas.nome,
              usuario: contas.usuario,
              situacao: contas.situacao,
            })
            .from(contas)
            .innerJoin(
              pessoas,
              and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)),
            )
            .where(eq(contas.id, contaId));
          if (!linha) throw naoEncontrado('Conta não encontrada.');
          if (linha.situacao === 'anonimizada') {
            throw conflito('Esta conta foi anonimizada e não muda mais.');
          }
          conta = {
            id: linha.id,
            pessoaId: linha.pessoaId,
            nome: linha.nome,
            usuario: linha.usuario,
          };
        }
        let grupo: { id: string; nome: string; situacao: 'ativo' | 'inativo' } | null = null;
        if (grupoId !== null) {
          const [linha] = await tx
            .select({ id: grupos.id, nome: grupos.nome, situacao: grupos.situacao })
            .from(grupos)
            .where(eq(grupos.id, grupoId));
          if (!linha) throw naoEncontrado('Grupo não encontrado.');
          grupo = linha;
        }
        if (localId !== null) await exigirLocalAtivo(tx, localId, 'localId');

        let atribuicao: typeof atribuicoes.$inferSelect | undefined;
        try {
          [atribuicao] = await tx
            .insert(atribuicoes)
            .values({
              orgId: sql`app.current_org()`,
              perfilId,
              contaId,
              grupoId,
              localId,
              criadaEm: momento,
            })
            .returning();
        } catch (erro) {
          if (violouUnicidade(erro, 'atribuicoes_em_vigor')) {
            throw conflito('Esta atribuição já existe.');
          }
          throw erro;
        }
        if (!atribuicao) throw new Error('A atribuição não foi gravada.');
        const ignoradas = localId === null ? [] : ignoradasNoLocal(perfil);
        const lida = {
          id: atribuicao.id,
          perfilId,
          perfil: perfil.nome,
          contaId,
          grupoId,
          grupo: grupo?.nome ?? null,
          localId,
          encerradaEm: null,
        };
        await registrarNaAuditoria(tx, {
          acao: 'atribuicao.criada',
          ator: { tipo: 'conta', contaId: ator },
          alvo: alvoDaAtribuicao(lida),
          depois: visaoDaAtribuicao(lida, arvore),
          dados: { atribuicaoId: atribuicao.id, ignoradas },
          origem: origemDa(requisicao),
          momento,
        });
        return {
          atribuicao: {
            id: atribuicao.id,
            perfil: { id: perfil.id, nome: perfil.nome, situacao: perfil.situacao },
            conta,
            grupo,
            local: localDoEscopo(arvore, localId),
            criadaEm: atribuicao.criadaEm.toISOString(),
          },
          ignoradas,
        };
      });
      return resposta.code(201).send(criada);
    },
  );

  app.delete(
    '/atribuicoes/:id',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Encerrar uma atribuição, sem apagá-la',
        params: ParametrosDaAtribuicao,
        response: {
          204: z.null(),
          401: RespostaDeProblema,
          409: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      // A atribuição pode ser a de quem administra os acessos: passa pela trava `acessos`.
      await mudarAcessos(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const encerradas = await encerrarAtribuicoes(tx, eq(atribuicoes.id, requisicao.params.id), {
          ator: { tipo: 'conta', contaId },
          origem: origemDa(requisicao),
          momento,
          arvore,
        });
        if (encerradas === 0) throw naoEncontrado('Atribuição não encontrada.');
      });
      return resposta.code(204).send(null);
    },
  );

  app.get(
    '/contas/:id/acesso',
    {
      config: { permissao: 'acessos.ver' },
      schema: {
        summary: 'O acesso de uma conta: perfis, grupos e o que ela pode fazer, com as origens',
        params: ParametrosDaConta,
        response: { 200: AcessoDaConta, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [conta] = await tx.select().from(contas).where(eq(contas.id, requisicao.params.id));
        if (!conta) throw naoEncontrado('Conta não encontrada.');
        const arvore = await lerArvore(tx);
        const administra = pode(sessao.acesso, 'acessos.administrar');

        const participacoes = await tx
          .select({
            id: grupos.id,
            nome: grupos.nome,
            situacao: grupos.situacao,
            incluidaEm: membrosDoGrupo.incluidaEm,
          })
          .from(membrosDoGrupo)
          .innerJoin(
            grupos,
            and(eq(grupos.orgId, membrosDoGrupo.orgId), eq(grupos.id, membrosDoGrupo.grupoId)),
          )
          .where(and(eq(membrosDoGrupo.contaId, conta.id), isNull(membrosDoGrupo.encerradaEm)))
          .orderBy(grupos.nome, grupos.id);
        const doGrupo = new Map(participacoes.map((grupo) => [grupo.id, grupo]));

        const linhas = await tx
          .select({
            id: atribuicoes.id,
            perfil: { id: perfis.id, nome: perfis.nome, situacao: perfis.situacao },
            grupoId: atribuicoes.grupoId,
            localId: atribuicoes.localId,
            criadaEm: atribuicoes.criadaEm,
          })
          .from(atribuicoes)
          .innerJoin(
            perfis,
            and(eq(perfis.orgId, atribuicoes.orgId), eq(perfis.id, atribuicoes.perfilId)),
          )
          .where(
            and(
              isNull(atribuicoes.encerradaEm),
              or(
                eq(atribuicoes.contaId, conta.id),
                inArray(atribuicoes.grupoId, [...doGrupo.keys()]),
              ),
            ),
          )
          .orderBy(perfis.nome, atribuicoes.id);

        const acesso = await carregarAcesso(tx, conta.id);
        const caminho = (id: string) => ({ id, caminho: arvore.caminho(id) });
        return {
          atribuicoes: linhas
            .map((linha) => {
              const grupo = linha.grupoId === null ? undefined : doGrupo.get(linha.grupoId);
              return {
                id: linha.id,
                perfil: linha.perfil,
                local: localDoEscopo(arvore, linha.localId),
                grupo: grupo ? { id: grupo.id, nome: grupo.nome, situacao: grupo.situacao } : null,
                criadaEm: linha.criadaEm.toISOString(),
                permite: { encerrar: administra && linha.grupoId === null },
              };
            })
            .sort((a, b) => Number(a.grupo !== null) - Number(b.grupo !== null)),
          grupos: participacoes.map((grupo) => ({
            ...grupo,
            incluidaEm: grupo.incluidaEm.toISOString(),
          })),
          permissoes: listarPermissoes(acesso).map(({ chave, organizacao, locais }) => ({
            chave,
            organizacao,
            locais: locais.map(caminho).sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR')),
            origens: (acesso.origens.get(chave) ?? []).map((origem) => ({
              atribuicaoId: origem.atribuicaoId,
              perfil: origem.perfil,
              grupo: origem.grupo,
              local: origem.localId === null ? null : caminho(origem.localId),
            })),
          })),
          exigeDoisPassos: { conta: conta.exigeDoisPassos, perfis: [...acesso.perfisQueExigem] },
          permite: { atribuir: administra && conta.situacao !== 'anonimizada' },
        };
      });
    },
  );
};
