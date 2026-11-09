// As pessoas da organização (spec administracao-de-pessoas; design do F2b, decisões 9, 11 e 12): a
// lista em ordem alfabética, paginada pelo cursor, só com as pessoas que a conta pode ver, com a
// busca sem acento no nome, na matrícula, no e-mail e no usuário, e o cadastro e a edição com a
// permissão no local de trabalho. Cada pessoa vem com o local de trabalho, o resumo da conta e o
// que a conta da sessão pode fazer com ela.
import {
  arquivos,
  ativos,
  atribuicoes,
  type Banco,
  codigosDeRecuperacao,
  contas,
  doisPassos,
  membrosDoGrupo,
  mudancasDasVisoes,
  naOrganizacao,
  pessoas,
  sessoes,
  type Transacao,
  tentativasDeEntrada,
  visoes,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  alcance,
  type ErrosDaPessoa,
  limparPessoa,
  normalizarTexto,
  podeEm,
  SITUACOES_DO_LOCAL,
  textoDeBusca,
  validarPessoa,
} from '@grafite/domain';
import { and, count, eq, inArray, isNotNull, isNull, like, or, type SQL, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { mudarAcessos } from '../acesso/administradores.ts';
import { encerrarAtribuicoes, retirarDosGrupos } from '../acesso/atribuicoes.ts';
import { ContaDaFicha, lerContaDaFicha } from '../acesso/conta-administrada.ts';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { inativarConta } from '../acesso/inativacao.ts';
import { modulosDesligados } from '../acesso/modulos.ts';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { FotoDaPessoa } from '../arquivos/esquemas.ts';
import { exigirLocalAtivo, lerArvore } from '../arvore.ts';
import { registrarNaAuditoria, visaoDaPessoa } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { contendo } from '../busca.ts';
import { ativosNoEscopo, ContagemNoEscopo } from '../contagens.ts';
import { aleatoriosCrockford } from '../crockford.ts';
import { saidaDaPessoa } from '../eventos/pessoas.ts';
import { Cursor, decodificarCursor, Limite, pagina } from '../paginacao.ts';
import {
  conflito,
  dadosInvalidos,
  naoEncontrado,
  ProblemaDaApi,
  propriaConta,
  RespostaDeProblema,
} from '../problemas.ts';
import { apagarRascunhosDaConta } from './rascunho-do-ativo.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

export const SITUACOES_DA_PESSOA = ['ativa', 'inativa', 'anonimizada'] as const;

const LocalDaPessoa = z
  .object({
    id: z.uuid(),
    /** Como "Jundiaí › Expedição". */
    caminho: z.string(),
    situacao: z.enum(SITUACOES_DO_LOCAL),
  })
  .meta({ id: 'LocalDaPessoa' });

const ResumoDaConta = z
  .object({
    id: z.uuid(),
    /** Nulo na conta anonimizada. */
    usuario: z.string().nullable(),
    situacao: z.enum(['ativa', 'inativa', 'anonimizada']),
  })
  .meta({ id: 'ResumoDaConta' });

/** O que a conta da sessão pode fazer com a pessoa. A tela mostra só essas ações. */
const PermiteNaPessoa = z
  .object({
    editar: z.boolean(),
    inativar: z.boolean(),
    reativar: z.boolean(),
    anonimizar: z.boolean(),
    criarConta: z.boolean(),
    /** Redefinir, remover os dois passos, desbloquear, inativar, reativar e encerrar sessões. */
    administrarConta: z.boolean(),
  })
  .meta({ id: 'PermiteNaPessoa' });

export const Pessoa = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    email: z.string().nullable(),
    matricula: z.string().nullable(),
    telefone: z.string().nullable(),
    situacao: z.enum(SITUACOES_DA_PESSOA),
    local: LocalDaPessoa.nullable(),
    foto: FotoDaPessoa.nullable(),
    conta: ResumoDaConta.nullable(),
    permite: PermiteNaPessoa,
  })
  .meta({ id: 'Pessoa' });

const ListaDePessoas = z
  .object({
    itens: z.array(Pessoa),
    /** O cursor da próxima página; nulo na última. */
    proximo: z.string().nullable(),
    /** Quantas pessoas atendem aos filtros, em todas as páginas. */
    total: z.number().int().min(0),
  })
  .meta({ id: 'ListaDePessoas' });

/** A pessoa na ficha: a conta vem com o estado dela e o que a conta da sessão pode fazer. */
export const FichaDaPessoa = Pessoa.extend({ conta: ContaDaFicha.nullable() }).meta({
  id: 'FichaDaPessoa',
});

/**
 * A pessoa no cartão da referência (change relacoes-vivas, design, decisão 1): o que a ficha mostra
 * dela, sem os contatos, e os ativos sob a responsabilidade dela.
 */
const ResumoDaPessoa = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    situacao: z.enum(SITUACOES_DA_PESSOA),
    foto: FotoDaPessoa.nullable(),
    /** O local de trabalho, como "Jundiaí › Expedição". */
    local: z.object({ id: z.uuid(), caminho: z.string() }).nullable(),
    temConta: z.boolean(),
    /**
     * Os ativos sob a responsabilidade dela, no escopo de quem vê; nulo com o módulo Ativos
     * desligado ou para quem não vê ativos em nenhum ramo.
     */
    ativos: ContagemNoEscopo.nullable(),
  })
  .meta({ id: 'ResumoDaPessoa' });

const FiltrosDePessoas = z.object({
  busca: z.string().max(200, { error: 'Use até 200 caracteres.' }).optional(),
  situacao: z
    .enum(['ativas', 'inativas', 'todas'], { error: 'Escolha ativas, inativas ou todas.' })
    .default('ativas'),
  conta: z.enum(['com', 'sem'], { error: 'Escolha com ou sem conta.' }).optional(),
  /** O local de trabalho, com tudo o que está dentro dele. */
  local: z.uuid({ error: 'Local não encontrado.' }).optional(),
  cursor: Cursor.optional(),
  limite: Limite,
});

/** Os campos da pessoa num pedido. Os opcionais vazios valem como nulo. */
const CamposDaPessoa = {
  nome: z.string({ error: 'Informe o nome.' }),
  email: z.string().nullable().optional(),
  matricula: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  /** O local de trabalho; nulo para nenhum. */
  localId: z.uuid({ error: 'Local não encontrado.' }).nullable().optional(),
};

const PedidoDePessoa = z.object(CamposDaPessoa).meta({ id: 'PedidoDePessoa' });

const PedidoDeAlteracaoDaPessoa = z
  .object({ ...CamposDaPessoa, nome: CamposDaPessoa.nome.optional() })
  .meta({ id: 'PedidoDeAlteracaoDaPessoa' });

const ParametrosDaPessoa = z.object({ id: z.uuid({ error: 'Pessoa não encontrada.' }) });

const MATRICULA_REPETIDA = 'Esta matrícula já é de outra pessoa.';

export const pessoaNaoEncontrada = () => naoEncontrado('Pessoa não encontrada.');

export const pessoaAnonimizada = () => conflito('Esta pessoa foi anonimizada e não muda mais.');

const pessoaAtiva = () =>
  new ProblemaDaApi({
    codigo: 'pessoa-ativa',
    status: 409,
    titulo: 'Pessoa ativa',
    detalhe: 'Inative a pessoa antes de anonimizá-la.',
  });

/** Os campos pessoais que a anonimização apaga, na ordem do registro da auditoria. */
const CAMPOS_PESSOAIS = ['email', 'matricula', 'localId', 'telefone'] as const;

/** Os campos recusados pelas regras da pessoa. */
function recusarCampos(erros: ErrosDaPessoa) {
  const campos = Object.fromEntries(
    Object.entries(erros).filter((entrada): entrada is [string, string] => Boolean(entrada[1])),
  );
  if (Object.keys(campos).length > 0) throw dadosInvalidos(campos);
}

/** Grava a pessoa; a matrícula de outra pessoa vira a recusa no campo, mesmo numa corrida. */
async function semMatriculaRepetida<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'pessoas_matricula_unica')) {
      throw conflito(MATRICULA_REPETIDA, { matricula: MATRICULA_REPETIDA });
    }
    throw erro;
  }
}

export const caminhoDe = (arvore: ArvoreDeLocais, localId: string | null) =>
  localId === null ? null : arvore.caminho(localId);

/** A chave da ordem da lista: o nome e o id, que desempata. */
const ChaveDaPessoa = z.tuple([z.string(), z.uuid()]);

export const COLUNAS_DA_PESSOA = {
  pessoa: {
    id: pessoas.id,
    nome: pessoas.nome,
    email: pessoas.email,
    matricula: pessoas.matricula,
    telefone: pessoas.telefone,
    localId: pessoas.localId,
    fotoId: pessoas.fotoId,
    situacao: pessoas.situacao,
  },
  conta: { id: contas.id, usuario: contas.usuario, situacao: contas.situacao },
};

export const contaDaPessoa = and(eq(contas.orgId, pessoas.orgId), eq(contas.pessoaId, pessoas.id));

export interface LinhaDaPessoa {
  pessoa: {
    id: string;
    nome: string;
    email: string | null;
    matricula: string | null;
    telefone: string | null;
    localId: string | null;
    fotoId: string | null;
    situacao: (typeof SITUACOES_DA_PESSOA)[number];
  };
  conta: {
    id: string;
    usuario: string | null;
    situacao: 'ativa' | 'inativa' | 'anonimizada';
  } | null;
}

/** O que a conta da sessão pode fazer com a pessoa, pelo alcance de cada permissão no local dela. */
function permiteNaPessoa(
  sessao: SessaoDaRequisicao,
  arvore: ArvoreDeLocais,
  { pessoa, conta }: LinhaDaPessoa,
) {
  const { acesso } = sessao;
  const propria = conta !== null && conta.id === sessao.contaId;
  const editar =
    pessoa.situacao !== 'anonimizada' && podeEm(acesso, 'pessoas.editar', pessoa.localId, arvore);
  const administraContas = podeEm(acesso, 'contas.administrar', pessoa.localId, arvore);
  return {
    editar,
    inativar: editar && pessoa.situacao === 'ativa' && !propria,
    reativar: editar && pessoa.situacao === 'inativa',
    anonimizar:
      pessoa.situacao === 'inativa' &&
      !propria &&
      podeEm(acesso, 'pessoas.anonimizar', pessoa.localId, arvore),
    criarConta: administraContas && pessoa.situacao === 'ativa' && conta === null,
    administrarConta:
      administraContas && conta !== null && conta.situacao !== 'anonimizada' && !propria,
  };
}

/** A pessoa como a API a devolve. */
export function pessoaDaResposta(
  linha: LinhaDaPessoa,
  sessao: SessaoDaRequisicao,
  arvore: ArvoreDeLocais,
) {
  const { pessoa, conta } = linha;
  const local = pessoa.localId === null ? undefined : arvore.local(pessoa.localId);
  return {
    id: pessoa.id,
    nome: pessoa.nome,
    email: pessoa.email,
    matricula: pessoa.matricula,
    telefone: pessoa.telefone,
    situacao: pessoa.situacao,
    local: local
      ? { id: local.id, caminho: arvore.caminho(local.id), situacao: local.situacao }
      : null,
    foto: pessoa.fotoId ? { id: pessoa.fotoId } : null,
    conta,
    permite: permiteNaPessoa(sessao, arvore, linha),
  };
}

/** A pessoa na ficha, com a conta lida do banco no estado em que a transação a deixou. */
export async function fichaDaPessoa(
  tx: Transacao,
  linha: LinhaDaPessoa,
  sessao: SessaoDaRequisicao,
  arvore: ArvoreDeLocais,
  momento: Date,
) {
  const conta =
    linha.conta &&
    (await lerContaDaFicha(tx, linha.conta.id, {
      sessao,
      pessoaAtiva: linha.pessoa.situacao === 'ativa',
      momento,
    }));
  const resumo = conta && { id: conta.id, usuario: conta.usuario, situacao: conta.situacao };
  return { ...pessoaDaResposta({ pessoa: linha.pessoa, conta: resumo }, sessao, arvore), conta };
}

/** O texto como padrão do `like`, com os curingas escapados. */

/** Os filtros da lista, sem o cursor: valem também para o total. */
function condicoesDaLista(
  filtros: z.infer<typeof FiltrosDePessoas>,
  alcanceDela: 'organizacao' | Set<string> | null,
  arvore: ArvoreDeLocais,
): SQL[] {
  const condicoes: SQL[] = [];
  if (alcanceDela === null) condicoes.push(sql`false`);
  else if (alcanceDela !== 'organizacao') {
    condicoes.push(inArray(pessoas.localId, [...alcanceDela]));
  }
  if (filtros.situacao === 'ativas') condicoes.push(eq(pessoas.situacao, 'ativa'));
  if (filtros.situacao === 'inativas') condicoes.push(eq(pessoas.situacao, 'inativa'));
  if (filtros.conta === 'com') condicoes.push(isNotNull(contas.id));
  if (filtros.conta === 'sem') condicoes.push(isNull(contas.id));
  if (filtros.local) condicoes.push(inArray(pessoas.localId, [...arvore.ramo(filtros.local)]));
  const palavras = normalizarTexto(filtros.busca ?? '')
    .split(' ')
    .filter(Boolean);
  for (const palavra of palavras) {
    const padrao = contendo(palavra);
    condicoes.push(or(like(pessoas.busca, padrao), like(contas.usuario, padrao)) as SQL);
  }
  return condicoes;
}

/**
 * A pessoa e a conta dela. Com `travar`, a linha da pessoa fica presa até o fim da transação, para
 * duas mudanças da mesma pessoa não se atropelarem.
 */
export async function lerPessoa(
  tx: Transacao,
  id: string,
  { travar = false }: { travar?: boolean } = {},
): Promise<LinhaDaPessoa> {
  const consulta = tx
    .select(COLUNAS_DA_PESSOA)
    .from(pessoas)
    .leftJoin(contas, contaDaPessoa)
    .where(eq(pessoas.id, id));
  const [linha] = await (travar ? consulta.for('update', { of: pessoas }) : consulta);
  if (!linha) throw pessoaNaoEncontrada();
  return linha;
}

const PROBLEMAS_DA_PESSOA = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

const RESPOSTAS_DA_PESSOA = { 200: FichaDaPessoa, ...PROBLEMAS_DA_PESSOA };

export const rotasDasPessoas: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.get(
    '/pessoas',
    {
      config: { permissao: 'pessoas.ver' },
      schema: {
        summary: 'As pessoas que a conta pode ver, em ordem alfabética',
        querystring: FiltrosDePessoas,
        response: { 200: ListaDePessoas, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const filtros = requisicao.query;
      const depoisDe = filtros.cursor ? decodificarCursor(filtros.cursor, ChaveDaPessoa) : null;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const condicoes = condicoesDaLista(
          filtros,
          alcance(sessao.acesso, 'pessoas.ver', arvore),
          arvore,
        );
        const linhas = await tx
          .select(COLUNAS_DA_PESSOA)
          .from(pessoas)
          .leftJoin(contas, contaDaPessoa)
          .where(
            and(
              ...condicoes,
              depoisDe
                ? sql`(${pessoas.nome}, ${pessoas.id}) > (${depoisDe[0]}, ${depoisDe[1]})`
                : undefined,
            ),
          )
          .orderBy(pessoas.nome, pessoas.id)
          .limit(filtros.limite + 1);
        const [contagem] = await tx
          .select({ total: count() })
          .from(pessoas)
          .leftJoin(contas, contaDaPessoa)
          .where(and(...condicoes));
        const { linhas: daPagina, proximo } = pagina(linhas, filtros.limite, (linha) => [
          linha.pessoa.nome,
          linha.pessoa.id,
        ]);
        return {
          itens: daPagina.map((linha) => pessoaDaResposta(linha, sessao, arvore)),
          proximo,
          total: contagem?.total ?? 0,
        };
      });
    },
  );

  app.post(
    '/pessoas',
    {
      config: { permissao: 'pessoas.editar' },
      schema: {
        summary: 'Cadastrar uma pessoa',
        body: PedidoDePessoa,
        response: { 201: FichaDaPessoa, ...PROBLEMAS_DA_PESSOA },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const dados = limparPessoa({
        nome: pedido.nome,
        email: pedido.email ?? null,
        matricula: pedido.matricula ?? null,
        telefone: pedido.telefone ?? null,
      });
      recusarCampos(validarPessoa(dados));
      const localId = pedido.localId ?? null;
      const momento = agora();
      const criada = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        exigirEm(requisicao, 'pessoas.editar', localId, arvore);
        if (localId !== null) await exigirLocalAtivo(tx, localId, 'localId');
        const [pessoa] = await semMatriculaRepetida(() =>
          tx
            .insert(pessoas)
            .values({
              orgId: sql`app.current_org()`,
              ...dados,
              localId,
              busca: textoDeBusca(dados),
              criadaEm: momento,
              atualizadaEm: momento,
            })
            .returning(),
        );
        if (!pessoa) throw new Error('A pessoa não foi cadastrada.');
        await registrarNaAuditoria(tx, {
          acao: 'pessoa.criada',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'pessoa', id: pessoa.id },
          depois: visaoDaPessoa(pessoa, caminhoDe(arvore, localId)),
          origem: origemDa(requisicao),
          momento,
          saida: saidaDaPessoa({ pessoaId: pessoa.id, locais: [localId] }),
        });
        return fichaDaPessoa(tx, { pessoa, conta: null }, sessao, arvore, momento);
      });
      return resposta.code(201).send(criada);
    },
  );

  app.get(
    '/pessoas/:id',
    {
      config: { permissao: 'pessoas.ver' },
      schema: {
        summary: 'Uma pessoa, com o resumo da conta e o que a conta da sessão pode fazer',
        params: ParametrosDaPessoa,
        response: RESPOSTAS_DA_PESSOA,
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const linha = await lerPessoa(tx, requisicao.params.id);
        exigirEm(requisicao, 'pessoas.ver', linha.pessoa.localId, arvore);
        return fichaDaPessoa(tx, linha, sessao, arvore, agora());
      });
    },
  );

  app.get(
    '/pessoas/:id/resumo',
    {
      config: { permissao: 'pessoas.ver' },
      schema: {
        summary:
          'O resumo de uma pessoa, para o cartão da referência, com os ativos no escopo de quem vê',
        params: ParametrosDaPessoa,
        response: { 200: ResumoDaPessoa, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const comAtivos = !(await modulosDesligados(banco, orgId)).includes('ativos');
      return naOrganizacao(banco, orgId, async (tx) => {
        const arvore = await lerArvore(tx);
        const { pessoa, conta } = await lerPessoa(tx, requisicao.params.id);
        // Sem ver a pessoa no local dela, não há cartão: ele diria onde ela trabalha.
        exigirEm(requisicao, 'pessoas.ver', pessoa.localId, arvore);
        const local = pessoa.localId === null ? undefined : arvore.local(pessoa.localId);
        return {
          id: pessoa.id,
          nome: pessoa.nome,
          situacao: pessoa.situacao,
          foto: pessoa.fotoId ? { id: pessoa.fotoId } : null,
          local: local ? { id: local.id, caminho: arvore.caminho(local.id) } : null,
          temConta: conta !== null,
          ativos: comAtivos
            ? await ativosNoEscopo(tx, { acesso, arvore }, eq(ativos.responsavelId, pessoa.id))
            : null,
        };
      });
    },
  );

  app.patch(
    '/pessoas/:id',
    {
      config: { permissao: 'pessoas.editar' },
      schema: {
        summary: 'Editar uma pessoa',
        params: ParametrosDaPessoa,
        body: PedidoDeAlteracaoDaPessoa,
        response: RESPOSTAS_DA_PESSOA,
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const atual = await lerPessoa(tx, requisicao.params.id);
        exigirEm(requisicao, 'pessoas.editar', atual.pessoa.localId, arvore);
        if (atual.pessoa.situacao === 'anonimizada') throw pessoaAnonimizada();
        const dados = limparPessoa({
          nome: pedido.nome ?? atual.pessoa.nome,
          email: pedido.email === undefined ? atual.pessoa.email : pedido.email,
          matricula: pedido.matricula === undefined ? atual.pessoa.matricula : pedido.matricula,
          telefone: pedido.telefone === undefined ? atual.pessoa.telefone : pedido.telefone,
        });
        recusarCampos(validarPessoa(dados));
        const localId = pedido.localId === undefined ? atual.pessoa.localId : pedido.localId;
        if (localId !== atual.pessoa.localId) {
          exigirEm(requisicao, 'pessoas.editar', localId, arvore);
          if (localId !== null) await exigirLocalAtivo(tx, localId, 'localId');
        }
        const mudou =
          localId !== atual.pessoa.localId ||
          (Object.keys(dados) as (keyof typeof dados)[]).some(
            (campo) => dados[campo] !== atual.pessoa[campo],
          );
        if (!mudou) return fichaDaPessoa(tx, atual, sessao, arvore, momento);

        const [pessoa] = await semMatriculaRepetida(() =>
          tx
            .update(pessoas)
            .set({ ...dados, localId, busca: textoDeBusca(dados), atualizadaEm: momento })
            .where(eq(pessoas.id, atual.pessoa.id))
            .returning(),
        );
        if (!pessoa) throw new Error('A pessoa não foi alterada.');
        await registrarNaAuditoria(tx, {
          acao: 'pessoa.alterada',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'pessoa', id: pessoa.id },
          antes: visaoDaPessoa(atual.pessoa, caminhoDe(arvore, atual.pessoa.localId)),
          depois: visaoDaPessoa(pessoa, caminhoDe(arvore, localId)),
          origem: origemDa(requisicao),
          momento,
          saida: saidaDaPessoa({
            pessoaId: pessoa.id,
            locais: [atual.pessoa.localId, localId],
            contaId: atual.conta?.id,
          }),
        });
        return fichaDaPessoa(tx, { pessoa, conta: atual.conta }, sessao, arvore, momento);
      });
    },
  );

  app.post(
    '/pessoas/:id/inativacao',
    {
      config: { permissao: 'pessoas.editar' },
      schema: {
        summary: 'Inativar uma pessoa e a conta dela, encerrando as sessões',
        params: ParametrosDaPessoa,
        response: RESPOSTAS_DA_PESSOA,
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const momento = agora();
      const origem = origemDa(requisicao);
      const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
      // A pessoa pode ser de quem administra os acessos: a mudança passa pela trava `acessos`.
      return mudarAcessos(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const atual = await lerPessoa(tx, requisicao.params.id);
        exigirEm(requisicao, 'pessoas.editar', atual.pessoa.localId, arvore);
        if (atual.pessoa.situacao === 'anonimizada') throw pessoaAnonimizada();
        if (atual.conta?.id === sessao.contaId) {
          throw propriaConta('Use outra conta para inativar a sua.');
        }
        if (atual.pessoa.situacao === 'inativa') {
          return fichaDaPessoa(tx, atual, sessao, arvore, momento);
        }

        const [pessoa] = await tx
          .update(pessoas)
          .set({ situacao: 'inativa', atualizadaEm: momento })
          .where(eq(pessoas.id, atual.pessoa.id))
          .returning();
        if (!pessoa) throw new Error('A pessoa não foi inativada.');
        await registrarNaAuditoria(tx, {
          acao: 'pessoa.inativada',
          ator,
          alvo: { tipo: 'pessoa', id: pessoa.id },
          antes: visaoDaPessoa(atual.pessoa, caminhoDe(arvore, atual.pessoa.localId)),
          depois: visaoDaPessoa(pessoa, caminhoDe(arvore, pessoa.localId)),
          origem,
          momento,
          saida: saidaDaPessoa({
            pessoaId: pessoa.id,
            locais: [pessoa.localId],
            contaId: atual.conta?.id,
          }),
        });
        const { conta } = atual;
        if (conta?.situacao === 'ativa') {
          await inativarConta(tx, { contaId: conta.id, ator, origem, momento });
        }
        return fichaDaPessoa(tx, { pessoa, conta }, sessao, arvore, momento);
      });
    },
  );

  app.post(
    '/pessoas/:id/reativacao',
    {
      config: { permissao: 'pessoas.editar' },
      schema: {
        summary: 'Reativar uma pessoa, sem reativar a conta dela',
        params: ParametrosDaPessoa,
        response: RESPOSTAS_DA_PESSOA,
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const atual = await lerPessoa(tx, requisicao.params.id);
        exigirEm(requisicao, 'pessoas.editar', atual.pessoa.localId, arvore);
        if (atual.pessoa.situacao === 'anonimizada') throw pessoaAnonimizada();
        if (atual.pessoa.situacao === 'ativa') {
          return fichaDaPessoa(tx, atual, sessao, arvore, momento);
        }

        const [pessoa] = await tx
          .update(pessoas)
          .set({ situacao: 'ativa', atualizadaEm: momento })
          .where(eq(pessoas.id, atual.pessoa.id))
          .returning();
        if (!pessoa) throw new Error('A pessoa não foi reativada.');
        await registrarNaAuditoria(tx, {
          acao: 'pessoa.reativada',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'pessoa', id: pessoa.id },
          antes: visaoDaPessoa(atual.pessoa, caminhoDe(arvore, atual.pessoa.localId)),
          depois: visaoDaPessoa(pessoa, caminhoDe(arvore, pessoa.localId)),
          origem: origemDa(requisicao),
          momento,
          saida: saidaDaPessoa({
            pessoaId: pessoa.id,
            locais: [pessoa.localId],
            contaId: atual.conta?.id,
          }),
        });
        return fichaDaPessoa(tx, { pessoa, conta: atual.conta }, sessao, arvore, momento);
      });
    },
  );

  app.post(
    '/pessoas/:id/anonimizacao',
    {
      config: { permissao: 'pessoas.anonimizar' },
      schema: {
        summary: 'Anonimizar uma pessoa inativa, sem volta',
        params: ParametrosDaPessoa,
        response: RESPOSTAS_DA_PESSOA,
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const momento = agora();
      const origem = origemDa(requisicao);
      const ator = { tipo: 'conta', contaId: sessao.contaId } as const;
      // Design do F2b, decisão 10: tudo numa transação, pela trava `acessos`.
      return mudarAcessos(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const atual = await lerPessoa(tx, requisicao.params.id);
        exigirEm(requisicao, 'pessoas.anonimizar', atual.pessoa.localId, arvore);
        if (atual.pessoa.situacao === 'anonimizada') throw pessoaAnonimizada();
        if (atual.conta?.id === sessao.contaId) {
          throw propriaConta('Use outra conta para anonimizar a sua.');
        }
        if (atual.pessoa.situacao === 'ativa') throw pessoaAtiva();

        const camposApagados: string[] = [
          'nome',
          ...CAMPOS_PESSOAIS.filter((campo) => atual.pessoa[campo] !== null),
        ];
        // A foto deixa de ser entregue na hora; o conteúdo sai na manutenção diária seguinte.
        if (atual.pessoa.fotoId !== null) {
          await tx
            .update(arquivos)
            .set({ removidoEm: momento })
            .where(eq(arquivos.id, atual.pessoa.fotoId));
          camposApagados.push('foto');
        }
        const nome = `Pessoa anonimizada ${aleatoriosCrockford(4)}`;
        const [pessoa] = await tx
          .update(pessoas)
          .set({
            nome,
            email: null,
            matricula: null,
            localId: null,
            telefone: null,
            fotoId: null,
            busca: textoDeBusca({ nome, email: null, matricula: null }),
            situacao: 'anonimizada',
            anonimizadaEm: momento,
            atualizadaEm: momento,
          })
          .where(eq(pessoas.id, atual.pessoa.id))
          .returning();
        if (!pessoa) throw new Error('A pessoa não foi anonimizada.');

        const { conta } = atual;
        if (conta) {
          await tx
            .update(contas)
            .set({
              usuario: null,
              hashSenha: null,
              senhaTemporaria: false,
              exigeDoisPassos: false,
              situacao: 'anonimizada',
              atualizadaEm: momento,
            })
            .where(eq(contas.id, conta.id));
          camposApagados.push('usuario', 'senha');
          const chave = await tx
            .delete(doisPassos)
            .where(eq(doisPassos.contaId, conta.id))
            .returning({ id: doisPassos.id });
          if (chave.length > 0) camposApagados.push('doisPassos');
          const codigos = await tx
            .delete(codigosDeRecuperacao)
            .where(eq(codigosDeRecuperacao.contaId, conta.id))
            .returning({ id: codigosDeRecuperacao.id });
          if (codigos.length > 0) camposApagados.push('codigosDeRecuperacao');
          const dasSessoes = await tx
            .update(sessoes)
            .set({ ip: null, agente: null })
            .where(
              and(
                eq(sessoes.contaId, conta.id),
                or(isNotNull(sessoes.ip), isNotNull(sessoes.agente)),
              ),
            )
            .returning({ id: sessoes.id });
          if (dasSessoes.length > 0) camposApagados.push('ipEDispositivoDasSessoes');
          if (conta.usuario !== null) {
            const tentativas = await tx
              .delete(tentativasDeEntrada)
              .where(eq(tentativasDeEntrada.usuario, conta.usuario))
              .returning({ id: tentativasDeEntrada.id });
            if (tentativas.length > 0) camposApagados.push('tentativasDeEntrada');
          }
          // As visões da conta têm o nome que ela deu: saem com os dados pessoais. As da
          // organização que ela criou são de todos e ficam.
          const dasVisoes = await tx
            .delete(visoes)
            .where(eq(visoes.contaId, conta.id))
            .returning({ id: visoes.id });
          // As mudanças dela sobre as outras visões também saem (change visoes-da-conta).
          const dasMudancas = await tx
            .delete(mudancasDasVisoes)
            .where(eq(mudancasDasVisoes.contaId, conta.id))
            .returning({ id: mudancasDasVisoes.id });
          if (dasVisoes.length > 0 || dasMudancas.length > 0) camposApagados.push('visoes');
          // O que ela digitou nos cadastros também é dela (change cadastro-em-etapas).
          if ((await apagarRascunhosDaConta(tx, conta.id)) > 0) camposApagados.push('rascunhos');
          const contexto = { ator, origem, momento, arvore };
          await encerrarAtribuicoes(tx, eq(atribuicoes.contaId, conta.id), contexto);
          await retirarDosGrupos(tx, eq(membrosDoGrupo.contaId, conta.id), contexto);
        }

        // Sem antes nem depois: o registro diz o que se apagou, nunca os valores.
        await registrarNaAuditoria(tx, {
          acao: 'pessoa.anonimizada',
          ator,
          alvo: { tipo: 'pessoa', id: pessoa.id },
          dados: { camposApagados, conta: conta?.id ?? null },
          origem,
          momento,
          // O local de antes leva o evento a quem via a pessoa e deixa de vê-la.
          saida: saidaDaPessoa({
            pessoaId: pessoa.id,
            locais: [atual.pessoa.localId, null],
            contaId: conta?.id,
          }),
        });
        return fichaDaPessoa(tx, { pessoa, conta }, sessao, arvore, momento);
      });
    },
  );
};
