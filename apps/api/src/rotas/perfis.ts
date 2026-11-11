// Os perfis da organização (spec perfis-e-grupos; design do F2b, decisões 4 e 11): conjuntos de
// permissões do catálogo, com "Exige verificação em dois passos". Quem vê os acessos vê a lista e a
// ficha, com quem tem cada perfil; quem administra os acessos cadastra, edita, inativa e reativa. O
// Administrador é protegido, e a mudança que deixaria a organização sem ninguém para administrar os
// acessos é desfeita.
import {
  atribuicoes,
  type Banco,
  contas,
  grupos,
  naOrganizacao,
  perfis,
  pessoas,
  type Transacao,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  normalizarTexto,
  PERMISSOES,
  type Permissao,
  permissaoConhecida,
  pode,
  validarPermissoes,
} from '@grafite/domain';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { mudarAcessos } from '../acesso/administradores.ts';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import {
  conflito,
  dadosInvalidos,
  naoEncontrado,
  ProblemaDaApi,
  RespostaDeProblema,
} from '../problemas.ts';
import { DiasDeConfianca } from './aparelhos.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const CHAVES = PERMISSOES.map((permissao) => permissao.chave) as [Permissao, ...Permissao[]];

const PermiteNoPerfil = z
  .object({
    editar: z.boolean(),
    inativar: z.boolean(),
    reativar: z.boolean(),
    /** Atribuir o perfil a uma conta ou a um grupo. */
    atribuir: z.boolean(),
    /** Mudar o prazo da confiança nos aparelhos, também no Administrador. */
    mudarPrazo: z.boolean(),
  })
  .meta({ id: 'PermiteNoPerfil' });

const Perfil = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    descricao: z.string().nullable(),
    /** As permissões declaradas, na ordem do catálogo. As incluídas vêm do catálogo. */
    permissoes: z.array(z.enum(CHAVES)),
    /** Só o Administrador: todas as permissões, inclusive as que vierem depois. */
    todasAsPermissoes: z.boolean(),
    protegido: z.boolean(),
    exigeDoisPassos: z.boolean(),
    /**
     * O prazo da confiança nos aparelhos de quem tem o perfil (change aparelho-confiavel), ou
     * `null` para seguir a organização.
     */
    diasDeConfianca: z.number().int().min(0).max(90).nullable(),
    situacao: z.enum(['ativo', 'inativo']),
    /** Quantas atribuições em vigor ele tem. */
    atribuicoes: z.number().int().min(0),
    permite: PermiteNoPerfil,
  })
  .meta({ id: 'Perfil' });

const QuemTemOPerfil = z
  .object({
    atribuicaoId: z.uuid(),
    conta: z
      .object({
        id: z.uuid(),
        pessoaId: z.uuid(),
        nome: z.string(),
        usuario: z.string().nullable(),
        situacao: z.enum(['ativa', 'inativa', 'anonimizada']),
      })
      .nullable(),
    grupo: z
      .object({ id: z.uuid(), nome: z.string(), situacao: z.enum(['ativo', 'inativo']) })
      .nullable(),
    /** O escopo; nulo para a organização inteira. */
    local: z
      .object({ id: z.uuid(), caminho: z.string(), situacao: z.enum(['ativo', 'inativo']) })
      .nullable(),
  })
  .meta({ id: 'QuemTemOPerfil' });

const FichaDoPerfil = Perfil.extend({ quemTem: z.array(QuemTemOPerfil) }).meta({
  id: 'FichaDoPerfil',
});

const ListaDePerfis = z
  .object({ itens: z.array(Perfil), permite: z.object({ cadastrar: z.boolean() }) })
  .meta({ id: 'ListaDePerfis' });

const CamposDoPerfil = {
  nome: z
    .string({ error: 'Informe o nome do perfil.' })
    .trim()
    .min(1, { error: 'Informe o nome do perfil.' })
    .max(80, { error: 'Use até 80 caracteres.' }),
  descricao: z.string().trim().max(500, { error: 'Use até 500 caracteres.' }).nullable().optional(),
  permissoes: z.array(z.string()),
  exigeDoisPassos: z.boolean(),
};

const PedidoDePerfil = z
  .object({
    ...CamposDoPerfil,
    permissoes: CamposDoPerfil.permissoes.default([]),
    exigeDoisPassos: CamposDoPerfil.exigeDoisPassos.default(false),
  })
  .meta({ id: 'PedidoDePerfil' });

const PedidoDeAlteracaoDoPerfil = z
  .object({
    nome: CamposDoPerfil.nome.optional(),
    descricao: CamposDoPerfil.descricao,
    permissoes: CamposDoPerfil.permissoes.optional(),
    exigeDoisPassos: CamposDoPerfil.exigeDoisPassos.optional(),
  })
  .meta({ id: 'PedidoDeAlteracaoDoPerfil' });

const ParametrosDoPerfil = z.object({ id: z.uuid({ error: 'Perfil não encontrado.' }) });

const NOME_REPETIDO = 'Já existe um perfil com este nome.';

const perfilProtegido = () =>
  new ProblemaDaApi({
    codigo: 'perfil-protegido',
    status: 409,
    titulo: 'Perfil protegido',
    detalhe: 'O perfil Administrador é protegido e não muda.',
  });

type LinhaDoPerfil = typeof perfis.$inferSelect;

/** As permissões pedidas que estão no catálogo, sem repetir e na ordem dele. */
function permissoesPedidas(textos: readonly string[]): Permissao[] {
  const motivo = validarPermissoes(textos);
  if (motivo) throw dadosInvalidos({ permissoes: motivo });
  return CHAVES.filter((chave) => textos.includes(chave));
}

/** Uma chave que saiu do catálogo não aparece, e some na próxima gravação. */
const conhecidas = (permissoes: readonly string[]) => permissoes.filter(permissaoConhecida);

/** A descrição vazia vale como nenhuma. */
const descricaoLimpa = (descricao: string | null | undefined) => descricao?.trim() || null;

/** O que a auditoria guarda de um perfil. */
const visaoDoPerfil = (perfil: LinhaDoPerfil) => ({
  nome: perfil.nome,
  descricao: perfil.descricao,
  permissoes: conhecidas(perfil.permissoes),
  todasAsPermissoes: perfil.todasAsPermissoes,
  exigeDoisPassos: perfil.exigeDoisPassos,
  situacao: perfil.situacao,
});

function permiteNoPerfil(acesso: Acesso, perfil: LinhaDoPerfil) {
  const administra = pode(acesso, 'acessos.administrar');
  const ativo = perfil.situacao === 'ativo';
  return {
    editar: administra && !perfil.protegido,
    inativar: administra && !perfil.protegido && ativo,
    reativar: administra && !ativo,
    atribuir: administra && ativo,
    mudarPrazo: administra,
  };
}

function perfilDaResposta(perfil: LinhaDoPerfil, emVigor: number, acesso: Acesso) {
  return {
    id: perfil.id,
    nome: perfil.nome,
    descricao: perfil.descricao,
    permissoes: conhecidas(perfil.permissoes),
    todasAsPermissoes: perfil.todasAsPermissoes,
    protegido: perfil.protegido,
    exigeDoisPassos: perfil.exigeDoisPassos,
    diasDeConfianca: perfil.diasDeConfianca,
    situacao: perfil.situacao,
    atribuicoes: emVigor,
    permite: permiteNoPerfil(acesso, perfil),
  };
}

/** Quem tem o perfil: as atribuições em vigor, as das contas antes das dos grupos. */
async function quemTem(tx: Transacao, perfilId: string, arvore: ArvoreDeLocais) {
  const linhas = await tx
    .select({
      atribuicaoId: atribuicoes.id,
      contaId: contas.id,
      pessoaId: contas.pessoaId,
      nome: pessoas.nome,
      usuario: contas.usuario,
      situacaoDaConta: contas.situacao,
      grupoId: grupos.id,
      grupo: grupos.nome,
      situacaoDoGrupo: grupos.situacao,
      localId: atribuicoes.localId,
    })
    .from(atribuicoes)
    .leftJoin(contas, and(eq(contas.orgId, atribuicoes.orgId), eq(contas.id, atribuicoes.contaId)))
    .leftJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .leftJoin(grupos, and(eq(grupos.orgId, atribuicoes.orgId), eq(grupos.id, atribuicoes.grupoId)))
    .where(and(eq(atribuicoes.perfilId, perfilId), isNull(atribuicoes.encerradaEm)));
  return linhas
    .map((linha) => {
      const local = linha.localId === null ? undefined : arvore.local(linha.localId);
      return {
        atribuicaoId: linha.atribuicaoId,
        conta:
          linha.contaId === null || linha.pessoaId === null || linha.situacaoDaConta === null
            ? null
            : {
                id: linha.contaId,
                pessoaId: linha.pessoaId,
                nome: linha.nome ?? '',
                usuario: linha.usuario,
                situacao: linha.situacaoDaConta,
              },
        grupo:
          linha.grupoId === null || linha.situacaoDoGrupo === null
            ? null
            : { id: linha.grupoId, nome: linha.grupo ?? '', situacao: linha.situacaoDoGrupo },
        local: local
          ? { id: local.id, caminho: arvore.caminho(local.id), situacao: local.situacao }
          : null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.conta === null) - Number(b.conta === null) ||
        (a.conta?.nome ?? a.grupo?.nome ?? '').localeCompare(
          b.conta?.nome ?? b.grupo?.nome ?? '',
          'pt-BR',
        ),
    );
}

async function emVigorPorPerfil(tx: Transacao): Promise<Map<string, number>> {
  const contagens = await tx
    .select({ perfilId: atribuicoes.perfilId, total: count() })
    .from(atribuicoes)
    .where(isNull(atribuicoes.encerradaEm))
    .groupBy(atribuicoes.perfilId);
  return new Map(contagens.map(({ perfilId, total }) => [perfilId, total]));
}

async function lerPerfil(tx: Transacao, id: string): Promise<LinhaDoPerfil> {
  const [perfil] = await tx.select().from(perfis).where(eq(perfis.id, id));
  if (!perfil) throw naoEncontrado('Perfil não encontrado.');
  return perfil;
}

/** Grava o perfil; o nome de outro perfil vira a recusa no campo, mesmo numa corrida. */
async function semNomeRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'perfis_nome_unico'))
      throw conflito(NOME_REPETIDO, { nome: NOME_REPETIDO });
    throw erro;
  }
}

export const rotasDosPerfis: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  async function ficha(tx: Transacao, perfil: LinhaDoPerfil, acesso: Acesso) {
    const arvore = await lerArvore(tx);
    const tem = await quemTem(tx, perfil.id, arvore);
    return { ...perfilDaResposta(perfil, tem.length, acesso), quemTem: tem };
  }

  const PROBLEMAS_DO_PERFIL = {
    401: RespostaDeProblema,
    409: RespostaDeProblema,
    ...PROBLEMAS_DO_ACESSO,
  };

  const RESPOSTAS_DO_PERFIL = { 200: FichaDoPerfil, ...PROBLEMAS_DO_PERFIL };

  app.get(
    '/perfis',
    {
      config: { permissao: 'acessos.ver' },
      schema: {
        summary: 'Os perfis da organização',
        response: { 200: ListaDePerfis, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linhas = await tx.select().from(perfis).orderBy(perfis.nome, perfis.id);
        const emVigor = await emVigorPorPerfil(tx);
        return {
          itens: linhas.map((perfil) =>
            perfilDaResposta(perfil, emVigor.get(perfil.id) ?? 0, acesso),
          ),
          permite: { cadastrar: pode(acesso, 'acessos.administrar') },
        };
      });
    },
  );

  app.get(
    '/perfis/:id',
    {
      config: { permissao: 'acessos.ver' },
      schema: {
        summary: 'Um perfil, com quem o tem',
        params: ParametrosDoPerfil,
        response: RESPOSTAS_DO_PERFIL,
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        ficha(tx, await lerPerfil(tx, requisicao.params.id), acesso),
      );
    },
  );

  app.post(
    '/perfis',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Cadastrar um perfil',
        body: PedidoDePerfil,
        response: { 201: FichaDoPerfil, ...PROBLEMAS_DO_PERFIL },
      },
    },
    async (requisicao, resposta) => {
      const { acesso, contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const permissoes = permissoesPedidas(pedido.permissoes);
      const momento = agora();
      const criado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [perfil] = await semNomeRepetido(() =>
          tx
            .insert(perfis)
            .values({
              orgId: sql`app.current_org()`,
              nome: pedido.nome,
              nomeNormalizado: normalizarTexto(pedido.nome),
              descricao: descricaoLimpa(pedido.descricao),
              permissoes,
              exigeDoisPassos: pedido.exigeDoisPassos,
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(),
        );
        if (!perfil) throw new Error('O perfil não foi cadastrado.');
        await registrarNaAuditoria(tx, {
          acao: 'perfil.criado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'perfil', id: perfil.id },
          depois: visaoDoPerfil(perfil),
          origem: origemDa(requisicao),
          momento,
        });
        return ficha(tx, perfil, acesso);
      });
      return resposta.code(201).send(criado);
    },
  );

  app.patch(
    '/perfis/:id',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Editar um perfil',
        params: ParametrosDoPerfil,
        body: PedidoDeAlteracaoDoPerfil,
        response: RESPOSTAS_DO_PERFIL,
      },
    },
    async (requisicao) => {
      const { acesso, contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const permissoes = pedido.permissoes && permissoesPedidas(pedido.permissoes);
      const momento = agora();
      // Tirar acessos.administrar de um perfil pode deixar a organização sem administrador.
      return mudarAcessos(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await lerPerfil(tx, requisicao.params.id);
        if (antes.protegido) throw perfilProtegido();
        const nome = pedido.nome ?? antes.nome;
        const valores = {
          nome,
          nomeNormalizado: normalizarTexto(nome),
          descricao:
            pedido.descricao === undefined ? antes.descricao : descricaoLimpa(pedido.descricao),
          permissoes: permissoes ?? conhecidas(antes.permissoes),
          exigeDoisPassos: pedido.exigeDoisPassos ?? antes.exigeDoisPassos,
        };
        const mudou =
          valores.nome !== antes.nome ||
          valores.descricao !== antes.descricao ||
          valores.exigeDoisPassos !== antes.exigeDoisPassos ||
          valores.permissoes.join() !== antes.permissoes.join();
        if (!mudou) return ficha(tx, antes, acesso);
        const [depois] = await semNomeRepetido(() =>
          tx
            .update(perfis)
            .set({ ...valores, atualizadoEm: momento })
            .where(eq(perfis.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('O perfil não foi alterado.');
        await registrarNaAuditoria(tx, {
          acao: 'perfil.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'perfil', id: antes.id },
          antes: visaoDoPerfil(antes),
          depois: visaoDoPerfil(depois),
          origem: origemDa(requisicao),
          momento,
        });
        return ficha(tx, depois, acesso);
      });
    },
  );

  // O prazo da confiança do perfil (change aparelho-confiavel, design, decisão 5): rota própria,
  // porque o Administrador é protegido e não muda pelo formulário, e o prazo dele muda.
  app.put(
    '/perfis/:id/prazo-da-confianca',
    {
      config: { permissao: 'acessos.administrar' },
      schema: {
        summary: 'Mudar o prazo da confiança de um perfil; `null` segue a organização',
        params: ParametrosDoPerfil,
        body: z.object({ dias: DiasDeConfianca.nullable() }).meta({ id: 'PedidoDePrazoDoPerfil' }),
        response: RESPOSTAS_DO_PERFIL,
      },
    },
    async (requisicao) => {
      const { acesso, contaId } = sessaoDa(requisicao);
      const { dias } = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await lerPerfil(tx, requisicao.params.id);
        if (antes.diasDeConfianca === dias) return ficha(tx, antes, acesso);
        const [depois] = await tx
          .update(perfis)
          .set({ diasDeConfianca: dias, atualizadoEm: momento })
          .where(eq(perfis.id, antes.id))
          .returning();
        if (!depois) throw new Error('O prazo do perfil não foi alterado.');
        await registrarNaAuditoria(tx, {
          acao: 'prazo-da-confianca.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'perfil', id: antes.id },
          antes: { dias: antes.diasDeConfianca },
          depois: { dias },
          origem: origemDa(requisicao),
          momento,
        });
        return ficha(tx, depois, acesso);
      });
    },
  );

  /** Inativa ou reativa um perfil; a inativação pode tirar quem administra os acessos. */
  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'perfil.inativado'],
    ['reativacao', 'ativo', 'perfil.reativado'],
  ] as const) {
    app.post(
      `/perfis/:id/${caminho}`,
      {
        config: { permissao: 'acessos.administrar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um perfil' : 'Reativar um perfil',
          params: ParametrosDoPerfil,
          response: RESPOSTAS_DO_PERFIL,
        },
      },
      async (requisicao) => {
        const { acesso, contaId } = sessaoDa(requisicao);
        const momento = agora();
        const rodar = situacao === 'inativo' ? mudarAcessos : naOrganizacao;
        return rodar(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const antes = await lerPerfil(tx, requisicao.params.id);
          if (antes.protegido) throw perfilProtegido();
          if (antes.situacao === situacao) return ficha(tx, antes, acesso);
          const [depois] = await tx
            .update(perfis)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(perfis.id, antes.id))
            .returning();
          if (!depois) throw new Error('O perfil não foi alterado.');
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'perfil', id: antes.id },
            antes: visaoDoPerfil(antes),
            depois: visaoDoPerfil(depois),
            origem: origemDa(requisicao),
            momento,
          });
          return ficha(tx, depois, acesso);
        });
      },
    );
  }
};
