// O cadastro das equipes e dos canais (spec chat, "Equipes e canais" e "Permissões, auditoria e
// eventos do chat"; spec modulo-chat, "Equipes e canais na tela"; change chat-com-chamados, design,
// decisões 1 e 15; tarefa 3.5): a lista e a leitura da gaveta, com os dois grupos gravados e a
// situação deles; o cadastro e a alteração, conferidos pelo domínio com o gravado lido da linha
// travada; e o arquivar e o reativar, que confere o nome e o teto. Tudo pede o `chat.configurar`.
// O teto de 100 ativos é contado com a trava da organização. A auditoria guarda o "antes →
// depois", e o `chat.mudou` vai a quem configura e a quem participa, antes e depois.
import { type Banco, conversas, grupos, naOrganizacao, type Transacao } from '@grafite/db';
import { conferirEquipeOuCanal, MENSAGENS_DA_EQUIPE_OU_CANAL, recusaDoTeto } from '@grafite/domain';
import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { type LinhaDaConversa, publicoDaConversa } from '../chat/conversa.ts';
import { registrarEvento } from '../eventos/saida.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { travar } from '../travas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const M = MENSAGENS_DA_EQUIPE_OU_CANAL;

const TIPOS = ['equipe', 'canal'] as const;

const GrupoDaEquipeOuCanal = z
  .object({ id: z.uuid(), nome: z.string(), ativo: z.boolean() })
  .meta({ id: 'GrupoDaEquipeOuCanal' });

const EquipeOuCanal = z
  .object({
    id: z.uuid(),
    tipo: z.enum(TIPOS),
    nome: z.string(),
    /** O grupo cujas contas participam, só na equipe, com a situação de agora. */
    grupo: GrupoDaEquipeOuCanal.nullable(),
    /** O grupo que escreve; sem ele, todos que participam escrevem. */
    escreve: GrupoDaEquipeOuCanal.nullable(),
    avisar: z.boolean(),
    arquivada: z.boolean(),
  })
  .meta({ id: 'EquipeOuCanal' });

const ListaDasEquipesECanais = z
  .object({
    /** As ativas primeiro, e cada parte pelo nome. */
    itens: z.array(EquipeOuCanal),
  })
  .meta({ id: 'ListaDasEquipesECanais' });

/**
 * Os grupos ativos para a escolha da gaveta, só com o id e o nome: quem configura o chat não precisa
 * do `acessos.ver` do `GET /grupos` (decisão 15).
 */
const GruposParaEscolher = z
  .object({
    /** Pelo nome, sem os acentos e as maiúsculas, com os números em ordem de valor. */
    itens: z.array(z.object({ id: z.uuid(), nome: z.string() })),
  })
  .meta({ id: 'GruposParaEscolher' });

/** O que a gaveta grava; as recusas da spec são da conferência do domínio, por campo. */
const PedidoDaEquipeOuCanal = z
  .object({
    nome: z.string().max(400, { error: M.nomeLongo }),
    /** Na alteração, o tipo gravado vale: ele não muda depois. */
    tipo: z.enum(TIPOS),
    grupoId: z.uuid({ error: M.grupo }).nullable(),
    quemEscreve: z.enum(['todos', 'grupo']),
    escreveGrupoId: z.uuid({ error: M.escreve }).nullable(),
    avisar: z.boolean(),
  })
  .meta({ id: 'PedidoDaEquipeOuCanal' });

const ParametrosDaEquipeOuCanal = z.object({
  id: z.uuid({ error: 'Equipe ou canal não encontrado.' }),
});

const PROBLEMAS = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
} as const;

const naoEncontrada = () => naoEncontrado('Equipe ou canal não encontrado.');

type Grupos = ReadonlyMap<string, { nome: string; ativo: boolean }>;

/** Os grupos da organização, com a situação de agora, para a conferência e para a leitura. */
async function lerGrupos(tx: Transacao): Promise<Grupos> {
  const linhas = await tx
    .select({ id: grupos.id, nome: grupos.nome, situacao: grupos.situacao })
    .from(grupos);
  return new Map(
    linhas.map(({ id, nome, situacao }) => [id, { nome, ativo: situacao === 'ativo' }]),
  );
}

function equipeOuCanal(linha: LinhaDaConversa, daOrganizacao: Grupos) {
  const grupo = (id: string | null) => {
    const lido = id === null ? undefined : daOrganizacao.get(id);
    return id === null ? null : { id, nome: lido?.nome ?? '', ativo: lido?.ativo ?? false };
  };
  return {
    id: linha.id,
    tipo: linha.tipo === 'equipe' ? ('equipe' as const) : ('canal' as const),
    nome: linha.nome ?? '',
    grupo: grupo(linha.grupoId),
    escreve: grupo(linha.escreveGrupoId),
    avisar: linha.avisar,
    arquivada: linha.arquivadaEm !== null,
  };
}

/** O retrato da auditoria, nos termos da tela: os grupos pelo nome e a situação em texto. */
function visaoDaEquipeOuCanal(linha: LinhaDaConversa, daOrganizacao: Grupos) {
  const nomeDo = (id: string | null) => (id === null ? null : (daOrganizacao.get(id)?.nome ?? id));
  return {
    nome: linha.nome ?? '',
    tipo: linha.tipo === 'equipe' ? 'Equipe' : 'Canal',
    grupo: nomeDo(linha.grupoId),
    escreve: nomeDo(linha.escreveGrupoId) ?? 'Todos que participam',
    avisar: linha.avisar,
    situacao: linha.arquivadaEm === null ? 'Ativo' : 'Arquivado',
  };
}

/** A ação da auditoria, no gênero do tipo: a equipe criada, o canal criado. */
function acaoDa(
  linha: LinhaDaConversa,
  mudanca: 'criacao' | 'alteracao' | 'arquivamento' | 'reativacao',
) {
  const equipe = linha.tipo === 'equipe';
  switch (mudanca) {
    case 'criacao':
      return equipe ? ('equipe.criada' as const) : ('canal.criado' as const);
    case 'alteracao':
      return equipe ? ('equipe.alterada' as const) : ('canal.alterado' as const);
    case 'arquivamento':
      return equipe ? ('equipe.arquivada' as const) : ('canal.arquivado' as const);
    case 'reativacao':
      return equipe ? ('equipe.reativada' as const) : ('canal.reativado' as const);
  }
}

/** A equipe ou o canal pelo id, travado para a mudança; a direta não é deste cadastro. */
async function lerLinha(tx: Transacao, id: string): Promise<LinhaDaConversa> {
  const [linha] = await tx
    .select()
    .from(conversas)
    .where(and(eq(conversas.id, id), ne(conversas.tipo, 'direta')))
    .for('update');
  if (!linha) throw naoEncontrada();
  return linha;
}

/**
 * O teto, com a trava da organização: as gravações que podem passar de 100 ativos rodam uma de cada
 * vez, e a contagem vem depois da trava.
 */
async function conferirOTeto(tx: Transacao) {
  await travar(tx, 'equipes-e-canais');
  const [ativas] = await tx
    .select({ quantas: count() })
    .from(conversas)
    .where(and(ne(conversas.tipo, 'direta'), isNull(conversas.arquivadaEm)));
  const recusa = recusaDoTeto(ativas?.quantas ?? 0);
  if (recusa) throw conflito(recusa);
}

/** O nome repetido entre as ativas, que o índice único recusa, vira a recusa do nome. */
async function comONomeUnico<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'conversas_nome_unico')) {
      throw conflito(M.nomeRepetido, { nome: M.nomeRepetido });
    }
    throw erro;
  }
}

export const rotasDasEquipesECanais: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';

  /**
   * A auditoria, com o evento a quem configura, e o `chat.mudou` a quem participa depois e, se o
   * grupo mudou, a quem participava antes.
   */
  async function registrarAMudanca(
    tx: Transacao,
    requisicao: FastifyRequest,
    {
      mudanca,
      antes,
      depois,
      daOrganizacao,
      momento,
    }: {
      mudanca: Parameters<typeof acaoDa>[1];
      antes: LinhaDaConversa | null;
      depois: LinhaDaConversa;
      daOrganizacao: Grupos;
      momento: Date;
    },
  ) {
    await registrarNaAuditoria(tx, {
      acao: acaoDa(depois, mudanca),
      ator: { tipo: 'conta', contaId: sessaoDa(requisicao).contaId },
      alvo: { tipo: 'conversa', id: depois.id },
      ...(antes ? { antes: visaoDaEquipeOuCanal(antes, daOrganizacao) } : {}),
      depois: visaoDaEquipeOuCanal(depois, daOrganizacao),
      origem: origemDa(requisicao),
      momento,
      saida: { publico: { permissao: 'chat.configurar' } },
    });
    const alvo = { tipo: 'conversa' as const, id: depois.id };
    await registrarEvento(tx, { tipo: 'chat.mudou', alvo, publico: publicoDaConversa(depois) });
    if (antes && antes.grupoId !== depois.grupoId) {
      await registrarEvento(tx, { tipo: 'chat.mudou', alvo, publico: publicoDaConversa(antes) });
    }
  }

  app.get(
    '/chat/equipes-e-canais',
    {
      config: { permissao: 'chat.configurar' },
      schema: {
        summary: 'As equipes e os canais da organização, com os grupos e a situação',
        response: { 200: ListaDasEquipesECanais, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const daOrganizacao = await lerGrupos(tx);
        const linhas = await tx
          .select()
          .from(conversas)
          .where(ne(conversas.tipo, 'direta'))
          .orderBy(
            sql`${conversas.arquivadaEm} is not null`,
            asc(conversas.nomeNormalizado),
            asc(conversas.id),
          );
        return { itens: linhas.map((linha) => equipeOuCanal(linha, daOrganizacao)) };
      }),
  );

  app.get(
    '/chat/grupos',
    {
      config: { permissao: 'chat.configurar' },
      schema: {
        summary: 'Os grupos ativos, para a escolha da gaveta, sem o acessos.ver',
        response: { 200: GruposParaEscolher, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const ativos = await tx
          .select({ id: grupos.id, nome: grupos.nome })
          .from(grupos)
          .where(eq(grupos.situacao, 'ativo'));
        return {
          itens: ativos.sort(
            (a, b) =>
              a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true }) ||
              a.id.localeCompare(b.id),
          ),
        };
      }),
  );

  app.get(
    '/chat/equipes-e-canais/:id',
    {
      config: { permissao: 'chat.configurar' },
      schema: {
        summary: 'A equipe ou o canal, para a gaveta, com os grupos gravados e a situação deles',
        params: ParametrosDaEquipeOuCanal,
        response: { 200: EquipeOuCanal, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const [linha] = await tx
          .select()
          .from(conversas)
          .where(and(eq(conversas.id, requisicao.params.id), ne(conversas.tipo, 'direta')));
        if (!linha) throw naoEncontrada();
        return equipeOuCanal(linha, await lerGrupos(tx));
      }),
  );

  app.post(
    '/chat/equipes-e-canais',
    {
      config: { permissao: 'chat.configurar' },
      schema: {
        summary: 'Criar a equipe ou o canal',
        body: PedidoDaEquipeOuCanal,
        response: { 201: EquipeOuCanal, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      const criada = await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const daOrganizacao = await lerGrupos(tx);
        const conferencia = conferirEquipeOuCanal(requisicao.body, {
          grupos: daOrganizacao,
          antes: null,
        });
        if (!conferencia.ok) throw dadosInvalidos(conferencia.erros);
        await conferirOTeto(tx);
        const [linha] = await comONomeUnico(() =>
          tx
            .insert(conversas)
            .values({
              orgId: sql`app.current_org()`,
              ...conferencia.conversa,
              criadaEm: momento,
            })
            .returning(),
        );
        if (!linha) throw new Error('A equipe ou o canal não foi gravado.');
        await registrarAMudanca(tx, requisicao, {
          mudanca: 'criacao',
          antes: null,
          depois: linha,
          daOrganizacao,
          momento,
        });
        return equipeOuCanal(linha, daOrganizacao);
      });
      return resposta.code(201).send(criada);
    },
  );

  app.put(
    '/chat/equipes-e-canais/:id',
    {
      config: { permissao: 'chat.configurar' },
      schema: {
        summary: 'Salvar a equipe ou o canal, com o tipo gravado',
        params: ParametrosDaEquipeOuCanal,
        body: PedidoDaEquipeOuCanal,
        response: { 200: EquipeOuCanal, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        // O gravado vem da linha travada: a outra alteração ao mesmo tempo espera esta e confere
        // o grupo inativo contra o que esta gravou.
        const antes = await lerLinha(tx, requisicao.params.id);
        const daOrganizacao = await lerGrupos(tx);
        const conferencia = conferirEquipeOuCanal(
          { ...requisicao.body, tipo: antes.tipo === 'equipe' ? 'equipe' : 'canal' },
          {
            grupos: daOrganizacao,
            antes: { grupoId: antes.grupoId, escreveGrupoId: antes.escreveGrupoId },
          },
        );
        if (!conferencia.ok) throw dadosInvalidos(conferencia.erros);
        const { tipo: _tipo, ...valores } = conferencia.conversa;
        const mudou = (Object.keys(valores) as (keyof typeof valores)[]).some(
          (coluna) => antes[coluna] !== valores[coluna],
        );
        if (!mudou) return equipeOuCanal(antes, daOrganizacao);
        const [depois] = await comONomeUnico(() =>
          tx.update(conversas).set(valores).where(eq(conversas.id, antes.id)).returning(),
        );
        if (!depois) throw naoEncontrada();
        await registrarAMudanca(tx, requisicao, {
          mudanca: 'alteracao',
          antes,
          depois,
          daOrganizacao,
          momento,
        });
        return equipeOuCanal(depois, daOrganizacao);
      });
    },
  );

  app.post(
    '/chat/equipes-e-canais/:id/arquivamento',
    {
      config: { permissao: 'chat.configurar' },
      schema: {
        summary: 'Arquivar a equipe ou o canal: sai da lista e não recebe mensagens',
        params: ParametrosDaEquipeOuCanal,
        response: { 200: EquipeOuCanal, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const antes = await lerLinha(tx, requisicao.params.id);
        const daOrganizacao = await lerGrupos(tx);
        if (antes.arquivadaEm !== null) return equipeOuCanal(antes, daOrganizacao);
        const [depois] = await tx
          .update(conversas)
          .set({ arquivadaEm: momento })
          .where(eq(conversas.id, antes.id))
          .returning();
        if (!depois) throw naoEncontrada();
        await registrarAMudanca(tx, requisicao, {
          mudanca: 'arquivamento',
          antes,
          depois,
          daOrganizacao,
          momento,
        });
        return equipeOuCanal(depois, daOrganizacao);
      });
    },
  );

  app.post(
    '/chat/equipes-e-canais/:id/reativacao',
    {
      config: { permissao: 'chat.configurar' },
      schema: {
        summary: 'Reativar a equipe ou o canal, com a conversa, se o nome e o teto deixam',
        params: ParametrosDaEquipeOuCanal,
        response: { 200: EquipeOuCanal, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        // A trava do teto antes da linha, como no cadastro, que só tem a trava.
        await travar(tx, 'equipes-e-canais');
        const antes = await lerLinha(tx, requisicao.params.id);
        const daOrganizacao = await lerGrupos(tx);
        if (antes.arquivadaEm === null) return equipeOuCanal(antes, daOrganizacao);
        await conferirOTeto(tx);
        const [depois] = await comONomeUnico(() =>
          tx
            .update(conversas)
            .set({ arquivadaEm: null })
            .where(eq(conversas.id, antes.id))
            .returning(),
        );
        if (!depois) throw naoEncontrada();
        await registrarAMudanca(tx, requisicao, {
          mudanca: 'reativacao',
          antes,
          depois,
          daOrganizacao,
          momento,
        });
        return equipeOuCanal(depois, daOrganizacao);
      });
    },
  );
};
