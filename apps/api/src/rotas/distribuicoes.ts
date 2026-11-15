// As distribuições de software pela API (spec distribuicao-de-software, "Distribuição às máquinas",
// "Quando instalar", "Acordar os agentes", "Assistente da distribuição" e "Histórico das
// distribuições"; changes distribuicao-de-software e software-por-pacote): a busca das máquinas, os
// alvos e a prévia do assistente; a criação pelo alvo, sem as puladas, com o quando, o fuso, o "Para
// quem" e o acordar na fila, para agora; a lista e a ficha, com a situação, a etapa, o código e a
// explicação, o sem contato, o chamado e o log de cada máquina; o "Tentar de novo" e o "Tirar da
// fila" de cada máquina, pela permissão no local dela. As do ativo vão no software da máquina
// (`GET /ativos/:id/software`, na rota da base).
import {
  agentes,
  ativos,
  type Banco,
  contas,
  distribuicoes,
  maquinasDasDistribuicoes,
  modelos,
  naOrganizacao,
  pacotesDeSoftware,
  pessoas,
  QUANDOS_DA_DISTRIBUICAO,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  comALinha,
  conferirQuando,
  explicarOCodigoDeSaida,
  fusoReconhecido,
  fusoValido,
  LIMITE_DA_LISTA_COLADA,
  linhaDoTentarDeNovo,
  MENSAGEM_DA_LISTA_COLADA,
  MENSAGENS_DO_QUANDO,
  MENSAGENS_DO_SOFTWARE,
  normalizarTexto,
  podeSeguir,
  progressoDaDistribuicao,
  SITUACOES_DA_MAQUINA,
  SITUACOES_DA_MAQUINA_NO_BANCO,
  semContato,
  textoDoSemContato,
} from '@grafite/domain';
import { and, desc, eq, inArray, like, or, type SQL, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { lerCadastroDosAgentes } from '../agentes/cadastro.ts';
import { lerArvore } from '../arvore.ts';
import { rotuloNoBanco } from '../ativos/colunas.ts';
import { doResponsavel, pessoasVistas, veOResponsavel } from '../ativos/leitura.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { contendo } from '../busca.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { TAREFA_DE_ACORDAR } from '../software/acordar.ts';
import {
  type AlcanceDaDistribuicao,
  alcanceDaDistribuicao,
  comMaquinaNoAlcance,
  doAtivoDaMaquina,
  maquinaNoAlcance,
  noAlcance,
} from '../software/alcance.ts';
import { alvosDaConta, classificarOAlvo, resolverAlvo } from '../software/alvo.ts';
import { paraQuemNaTela } from '../software/base.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

export const SituacaoNaTela = z.object({
  chave: z.enum(SITUACOES_DA_MAQUINA_NO_BANCO),
  texto: z.string(),
  tipo: z.enum(['neutra', 'info', 'sucesso', 'critico']),
});

const ResumoDaDistribuicao = z
  .object({
    id: z.uuid(),
    pacote: z.object({ id: z.uuid(), nome: z.string(), versao: z.string().nullable() }),
    criadaPor: z.string(),
    criadaEm: z.string(),
    /** O nome da máquina, o local mais fundo que contém todas, "N locais" ou "N máquinas". */
    paraQuem: z.string(),
    /** O quando, com o dia marcado e o fuso de quem enviou. */
    quando: z.object({
      chave: z.enum(QUANDOS_DA_DISTRIBUICAO),
      aPartirDe: z.string().nullable(),
      fuso: z.string().nullable(),
    }),
    /** As máquinas nos locais em que a conta distribui; o progresso conta só elas. */
    maquinas: z.number(),
    progresso: z.string(),
    /** As máquinas da distribuição fora dos locais em que a conta distribui (design, decisão 16). */
    foraDoAlcance: z.number(),
  })
  .meta({ id: 'ResumoDaDistribuicao' });

/** O agente sem contato, pelo prazo da organização: "Sem contato · há 3 dias". */
export const SemContato = z
  .object({ dias: z.number(), texto: z.string() })
  .meta({ id: 'SemContatoDoAgente' });

const MaquinaDaDistribuicao = z
  .object({
    id: z.uuid(),
    ativo: z.object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() }),
    /** A pessoa responsável pela máquina. */
    pessoa: z.string().nullable(),
    situacao: SituacaoNaTela,
    etapa: z.string().nullable(),
    /** O código de saída do comando, com a frase dos códigos do Windows Installer. */
    codigo: z.object({ numero: z.number(), explicacao: z.string().nullable() }).nullable(),
    /** Na que aguarda, o agente sem contato pelo prazo da organização. */
    semContato: SemContato.nullable(),
    /** O último chamado ao agente, e se ele respondeu. */
    chamada: z.object({ em: z.string(), respondeu: z.boolean() }).nullable(),
    /** Até quando o agente deve voltar, pelo `expiration` do último contato. */
    voltaAte: z.string().nullable(),
    log: z.array(z.string()),
    enviadaEm: z.string().nullable(),
    atualizadaEm: z.string().nullable(),
    terminadaEm: z.string().nullable(),
  })
  .meta({ id: 'MaquinaDaDistribuicao' });

const FichaDaDistribuicao = ResumoDaDistribuicao.extend({
  maquinasDaDistribuicao: z.array(MaquinaDaDistribuicao),
}).meta({ id: 'FichaDaDistribuicao' });

const MaquinaParaDistribuir = z
  .object({
    id: z.uuid(),
    rotulo: z.string(),
    patrimonio: z.string().nullable(),
    local: z.string().nullable(),
    agente: z.object({ nome: z.string(), ultimoContato: z.string() }),
    semContato: SemContato.nullable(),
  })
  .meta({ id: 'MaquinaParaDistribuir' });

const Fuso = z.string().refine(fusoReconhecido, { error: 'Fuso horário desconhecido.' });

/**
 * O que o passo Máquinas escolheu (design, decisão 10): os locais, as visões, os ativos pelo id e a
 * lista colada, sem as tiradas da lista.
 */
const AlvoDaDistribuicao = z
  .object({
    locais: z.array(z.uuid()).max(500, { error: 'Escolha até 500 locais.' }).default([]),
    visoes: z.array(z.uuid()).max(150, { error: 'Escolha até 150 visões.' }).default([]),
    ativoIds: z
      .array(z.uuid())
      .max(LIMITE_DA_LISTA_COLADA, { error: 'Escolha até 2.000 máquinas.' })
      .default([]),
    /** Nomes, patrimônios ou hostnames, um por linha ou separados por vírgula. */
    lista: z.string().max(200_000, { error: MENSAGEM_DA_LISTA_COLADA }).default(''),
    fora: z.array(z.uuid()).max(10_000).default([]),
    /** O fuso dos filtros de data das visões; sem ele, UTC. */
    fuso: Fuso.optional(),
  })
  .meta({ id: 'AlvoDaDistribuicao' });

const MaquinaDaPrevia = z
  .object({
    id: z.uuid(),
    rotulo: z.string(),
    patrimonio: z.string().nullable(),
    hostname: z.string().nullable(),
    local: z.string().nullable(),
    /** Na ordem de precedência: pulada, na fila e vai instalar. */
    classe: z.enum(['pulada', 'na-fila', 'vai-instalar']),
    /** A versão mais alta do programa na máquina. */
    versao: z.string().nullable(),
    semContato: SemContato.nullable(),
    /** A outra instalação que o agente faz agora na máquina. */
    emAndamento: z.object({ pacote: z.string() }).nullable(),
  })
  .meta({ id: 'MaquinaDaPrevia' });

const PreviaDaDistribuicao = z
  .object({
    maquinas: z.array(MaquinaDaPrevia),
    /** Os itens da lista colada que não são máquinas em que a conta distribui. */
    naoAchados: z.array(z.string()),
    conta: z.object({
      vaoInstalar: z.number(),
      puladas: z.number(),
      naFila: z.number(),
      /** As que vão instalar sem ter o programa. */
      primeiraVez: z.number(),
      /** As que vão instalar com o programa, pela versão de hoje. */
      porVersao: z.array(z.object({ versao: z.string().nullable(), quantas: z.number() })),
    }),
    /** O "Para quem" das que entram na distribuição. */
    paraQuem: z.string(),
  })
  .meta({ id: 'PreviaDaDistribuicao' });

const AlvosDaDistribuicao = z
  .object({
    /** Os locais ativos em que a conta distribui, na ordem da árvore, com as máquinas do ramo. */
    locais: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        paiId: z.uuid().nullable(),
        maquinas: z.number(),
        semContato: z.number(),
      }),
    ),
    /** As visões da tabela do Ativos, da organização e da conta, com as máquinas que acham. */
    visoes: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        compartilhada: z.boolean(),
        maquinas: z.number(),
      }),
    ),
  })
  .meta({ id: 'AlvosDaDistribuicao' });

/** Quantas máquinas a busca devolve. */
const LIMITE_DA_BUSCA = 50;

const ParametrosDaDistribuicao = z.object({
  id: z.uuid({ error: 'Distribuição não encontrada.' }),
});

const ParametrosDaMaquina = ParametrosDaDistribuicao.extend({
  maquinaId: z.uuid({ error: MENSAGENS_DO_SOFTWARE.maquinaNaoEncontrada }),
});

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

const situacaoNaTela = (chave: keyof typeof SITUACOES_DA_MAQUINA) => ({
  chave,
  ...SITUACOES_DA_MAQUINA[chave],
});

const doTipo = and(eq(tiposDeAtivo.orgId, ativos.orgId), eq(tiposDeAtivo.id, ativos.tipoId));
const doModelo = and(eq(modelos.orgId, ativos.orgId), eq(modelos.id, ativos.modeloId));

/** O pacote escolhido para distribuir, ativo. */
async function pacoteParaDistribuir(tx: Transacao, id: string) {
  const [pacote] = await tx.select().from(pacotesDeSoftware).where(eq(pacotesDeSoftware.id, id));
  if (!pacote) throw dadosInvalidos({ pacoteId: 'Escolha o pacote.' });
  if (pacote.situacao !== 'ativo') throw conflito(MENSAGENS_DO_SOFTWARE.pacoteInativo);
  return pacote;
}

/** Os resumos das distribuições dadas, ou das 100 mais novas, com o progresso. */
/**
 * As distribuições com alguma máquina no alcance da conta (ou só as pedidas), das 100 mais novas,
 * com as máquinas e o progresso contados no alcance e as de fora à parte (design, decisão 16).
 */
async function resumos(tx: Transacao, escopo: AlcanceDaDistribuicao, ids?: readonly string[]) {
  const linhas = await tx
    .select({
      id: distribuicoes.id,
      pacote: {
        id: pacotesDeSoftware.id,
        nome: pacotesDeSoftware.nome,
        versao: pacotesDeSoftware.versao,
      },
      criadaPor: pessoas.nome,
      criadaEm: distribuicoes.criadaEm,
      paraQuem: distribuicoes.paraQuem,
      quando: distribuicoes.quando,
      aPartirDe: distribuicoes.aPartirDe,
      fuso: distribuicoes.fuso,
    })
    .from(distribuicoes)
    .innerJoin(pacotesDeSoftware, eq(pacotesDeSoftware.id, distribuicoes.pacoteId))
    .innerJoin(contas, eq(contas.id, distribuicoes.criadaPor))
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(
      and(ids ? inArray(distribuicoes.id, [...ids]) : undefined, comMaquinaNoAlcance(tx, escopo)),
    )
    .orderBy(desc(distribuicoes.criadaEm))
    .limit(100);
  if (linhas.length === 0) return [];
  const situacoes = await tx
    .select({
      distribuicaoId: maquinasDasDistribuicoes.distribuicaoId,
      situacao: maquinasDasDistribuicoes.situacao,
      localId: ativos.localId,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(ativos, doAtivoDaMaquina)
    .where(
      inArray(
        maquinasDasDistribuicoes.distribuicaoId,
        linhas.map(({ id }) => id),
      ),
    );
  return linhas.map(({ paraQuem, quando, aPartirDe, fuso, ...linha }) => {
    const todas = situacoes.filter((maquina) => maquina.distribuicaoId === linha.id);
    const noAlcanceDaConta = todas
      .filter((maquina) => noAlcance(escopo, maquina.localId))
      .map((maquina) => maquina.situacao);
    return {
      ...linha,
      criadaEm: linha.criadaEm.toISOString(),
      // A de antes da change diz o total das máquinas dela, também as de fora do alcance.
      paraQuem: paraQuemNaTela(paraQuem, todas.length),
      quando: { chave: quando, aPartirDe: aPartirDe?.toISOString() ?? null, fuso },
      maquinas: noAlcanceDaConta.length,
      progresso: progressoDaDistribuicao(noAlcanceDaConta),
      foraDoAlcance: todas.length - noAlcanceDaConta.length,
    };
  });
}

/** Quem lê a distribuição: o acesso e a árvore decidem se a pessoa da máquina aparece. */
interface Leitor {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
}

/**
 * As máquinas da distribuição (ou só a pedida) nos locais em que a conta distribui, como a ficha as
 * mostra, com a pessoa só para quem a vê (design, decisões 15 e 16).
 */
async function maquinasDa(
  tx: Transacao,
  {
    distribuicaoId,
    maquinaId,
    momento,
    leitor,
  }: { distribuicaoId: string; maquinaId?: string; momento: Date; leitor: Leitor },
): Promise<z.infer<typeof MaquinaDaDistribuicao>[]> {
  const escopo = alcanceDaDistribuicao(leitor.acesso, leitor.arvore);
  if (!escopo) return [];
  const { diasSemContato } = await lerCadastroDosAgentes(tx);
  const linhas = await tx
    .select({
      maquina: maquinasDasDistribuicoes,
      ativo: {
        id: ativos.id,
        rotulo: sql<string>`${rotuloNoBanco}`,
        patrimonio: ativos.patrimonio,
      },
      responsavel: {
        id: pessoas.id,
        nome: pessoas.nome,
        localId: pessoas.localId,
        situacao: pessoas.situacao,
      },
      ultimoContato: agentes.ultimoContato,
      voltaAte: agentes.voltaAte,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(ativos, doAtivoDaMaquina)
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo)
    .leftJoin(pessoas, doResponsavel)
    .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
    .where(
      and(
        eq(maquinasDasDistribuicoes.distribuicaoId, distribuicaoId),
        maquinaId ? eq(maquinasDasDistribuicoes.id, maquinaId) : undefined,
        maquinaNoAlcance(escopo),
      ),
    )
    .orderBy(sql`${rotuloNoBanco}`);
  return linhas.map(({ maquina, ativo, responsavel, ultimoContato, voltaAte }) => {
    const contato = semContato(ultimoContato, momento, diasSemContato);
    const codigo = maquina.codigoDeSaida;
    return {
      id: maquina.id,
      ativo,
      pessoa:
        responsavel && veOResponsavel({ responsavel }, leitor, leitor.arvore)
          ? responsavel.nome
          : null,
      situacao: situacaoNaTela(maquina.situacao),
      etapa: maquina.etapa,
      codigo:
        codigo === null ? null : { numero: codigo, explicacao: explicarOCodigoDeSaida(codigo) },
      semContato:
        maquina.situacao === 'aguardando' && contato.semContato
          ? { dias: contato.dias, texto: textoDoSemContato(contato.dias) }
          : null,
      chamada:
        maquina.chamadaEm && maquina.chamadaRespondeu !== null
          ? { em: maquina.chamadaEm.toISOString(), respondeu: maquina.chamadaRespondeu }
          : null,
      voltaAte: voltaAte?.toISOString() ?? null,
      log: maquina.log,
      enviadaEm: maquina.enviadaEm?.toISOString() ?? null,
      atualizadaEm: maquina.atualizadaEm?.toISOString() ?? null,
      terminadaEm: maquina.terminadaEm?.toISOString() ?? null,
    };
  });
}

async function ficha(tx: Transacao, id: string, momento: Date, { acesso }: { acesso: Acesso }) {
  const leitor = { acesso, arvore: await lerArvore(tx) };
  const escopo = alcanceDaDistribuicao(acesso, leitor.arvore);
  // A distribuição sem nenhuma máquina no alcance dá 404, como a que não existe (decisão 16).
  const [resumo] = escopo ? await resumos(tx, escopo, [id]) : [];
  if (!resumo) throw naoEncontrado('Distribuição não encontrada.');
  return {
    ...resumo,
    maquinasDaDistribuicao: await maquinasDa(tx, { distribuicaoId: id, momento, leitor }),
  };
}

/**
 * A máquina da distribuição, travada, com o pacote e o local, para o "Tentar de novo" e o "Tirar da
 * fila": a de outra distribuição, ou a que não existe, dá 404.
 */
async function maquinaParaMudar(tx: Transacao, distribuicaoId: string, maquinaId: string) {
  const [linha] = await tx
    .select({
      maquina: maquinasDasDistribuicoes,
      localId: ativos.localId,
      patrimonio: ativos.patrimonio,
      rotulo: sql<string>`${rotuloNoBanco}`,
      pacote: pacotesDeSoftware.nome,
      quando: distribuicoes.quando,
      aPartirDe: distribuicoes.aPartirDe,
      fuso: distribuicoes.fuso,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(distribuicoes, eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId))
    .innerJoin(pacotesDeSoftware, eq(pacotesDeSoftware.id, distribuicoes.pacoteId))
    .innerJoin(ativos, doAtivoDaMaquina)
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo)
    .where(
      and(
        eq(maquinasDasDistribuicoes.id, maquinaId),
        eq(maquinasDasDistribuicoes.distribuicaoId, distribuicaoId),
      ),
    )
    .for('update', { of: maquinasDasDistribuicoes });
  if (!linha) throw naoEncontrado(MENSAGENS_DO_SOFTWARE.maquinaNaoEncontrada);
  return linha;
}

export const rotasDasDistribuicoes: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  /** Sem ela, a distribuição de agora espera o próximo contato do agente, sem o chamado. */
  fila?: FilaDeTarefas | undefined;
}> = async (app, { banco, agora, fila }) => {
  app.get(
    '/software/maquinas',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary:
          'As máquinas com o agente do GLPI ligado, nos locais em que a conta distribui e vê, pelo nome, pelo patrimônio, pelo hostname ou pela pessoa que a conta vê',
        querystring: z.object({ busca: z.string().max(200).optional() }),
        response: { 200: z.object({ maquinas: z.array(MaquinaParaDistribuir) }), ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const doDistribuir = alcance(acesso, 'software.distribuir', arvore);
        const doVer = alcance(acesso, 'ativos.ver', arvore);
        if (doDistribuir === null || doVer === null) return { maquinas: [] };
        const condicoes: SQL[] = [eq(ativos.situacao, 'ativo')];
        // A busca roda com o escopo do ver e fica nos locais em que a conta distribui.
        for (const escopo of [doDistribuir, doVer]) {
          if (escopo !== 'organizacao') {
            condicoes.push(escopo.size > 0 ? inArray(ativos.localId, [...escopo]) : sql`false`);
          }
        }
        // A pessoa só acha a máquina para quem a vê, como na ficha do ativo (design, decisão 15).
        const dasPessoas = pessoasVistas(acesso, arvore);
        for (const palavra of normalizarTexto(requisicao.query.busca ?? '')
          .split(' ')
          .filter(Boolean)) {
          const padrao = contendo(palavra);
          const naMaquina = or(
            like(ativos.busca, padrao),
            like(modelos.busca, padrao),
            dasPessoas ? and(like(pessoas.busca, padrao), dasPessoas) : undefined,
          );
          if (naMaquina) condicoes.push(naMaquina);
        }
        const { diasSemContato } = await lerCadastroDosAgentes(tx);
        const momento = agora();
        const linhas = await tx
          .select({
            id: ativos.id,
            rotulo: sql<string>`${rotuloNoBanco}`,
            patrimonio: ativos.patrimonio,
            localId: ativos.localId,
            agente: { nome: agentes.nome, ultimoContato: agentes.ultimoContato },
          })
          .from(agentes)
          .innerJoin(ativos, and(eq(ativos.orgId, agentes.orgId), eq(ativos.id, agentes.ativoId)))
          .innerJoin(tiposDeAtivo, doTipo)
          .leftJoin(modelos, doModelo)
          .leftJoin(pessoas, doResponsavel)
          .where(and(...condicoes))
          .orderBy(desc(agentes.ultimoContato));
        // O agente do último contato, quando o ativo tem mais de um.
        const porAtivo = new Map<string, (typeof linhas)[number]>();
        for (const linha of linhas) if (!porAtivo.has(linha.id)) porAtivo.set(linha.id, linha);
        const maquinas = [...porAtivo.values()]
          .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
          .slice(0, LIMITE_DA_BUSCA)
          .map(({ localId, agente, ...maquina }) => {
            const contato = semContato(agente.ultimoContato, momento, diasSemContato);
            return {
              ...maquina,
              local: localId ? arvore.caminho(localId) : null,
              agente: { nome: agente.nome, ultimoContato: agente.ultimoContato.toISOString() },
              semContato: contato.semContato
                ? { dias: contato.dias, texto: textoDoSemContato(contato.dias) }
                : null,
            };
          });
        return { maquinas };
      });
    },
  );

  app.get(
    '/software/distribuicoes/alvos',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary:
          'Os locais e as visões do passo Máquinas do assistente, com as máquinas de cada um',
        querystring: z.object({ fuso: Fuso.optional() }),
        response: { 200: AlvosDaDistribuicao, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        alvosDaConta(tx, {
          sessao,
          arvore: await lerArvore(tx),
          momento: agora(),
          fuso: requisicao.query.fuso,
        }),
      );
    },
  );

  app.post(
    '/software/distribuicoes/previa',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary:
          'A prévia do assistente: as máquinas escolhidas, cada uma com a classe frente ao pacote, e os não achados da lista',
        body: z
          .object({ pacoteId: z.uuid({ error: 'Escolha o pacote.' }), alvo: AlvoDaDistribuicao })
          .meta({ id: 'PedidoDaPrevia' }),
        response: { 200: PreviaDaDistribuicao, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const pacote = await pacoteParaDistribuir(tx, requisicao.body.pacoteId);
        const arvore = await lerArvore(tx);
        const { maquinas, naoAchados } = await resolverAlvo(tx, {
          sessao,
          arvore,
          alvo: requisicao.body.alvo,
        });
        const previa = await classificarOAlvo(tx, { arvore, pacote, maquinas, momento: agora() });
        return {
          maquinas: previa.maquinas.map((maquina) => ({
            id: maquina.id,
            rotulo: maquina.rotulo,
            patrimonio: maquina.patrimonio,
            hostname: maquina.hostname,
            local: maquina.local,
            classe: maquina.classe,
            versao: maquina.versao,
            semContato: maquina.semContato,
            emAndamento: maquina.emAndamento,
          })),
          naoAchados,
          conta: previa.conta,
          paraQuem: previa.paraQuem,
        };
      });
    },
  );

  app.get(
    '/software/distribuicoes',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary: 'As distribuições de software, da mais nova para a mais antiga',
        response: {
          200: z.object({ distribuicoes: z.array(ResumoDaDistribuicao) }),
          ...PROBLEMAS,
        },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return {
        distribuicoes: await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const escopo = alcanceDaDistribuicao(acesso, await lerArvore(tx));
          return escopo ? resumos(tx, escopo) : [];
        }),
      };
    },
  );

  app.get(
    '/software/distribuicoes/:id',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary: 'A distribuição, com a situação, a etapa e o log de cada máquina',
        params: ParametrosDaDistribuicao,
        response: { 200: FichaDaDistribuicao, ...PROBLEMAS },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        ficha(tx, requisicao.params.id, agora(), sessaoDa(requisicao)),
      ),
  );

  app.post(
    '/software/distribuicoes/:id/maquinas/:maquinaId/tentar-de-novo',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary:
          'Tentar de novo a máquina que falhou: ela volta a aguardar o agente, que é acordado se o pedido pode seguir',
        params: ParametrosDaMaquina,
        response: { 200: MaquinaDaDistribuicao, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const { id, maquinaId } = requisicao.params;
      const orgId = requisicao.organizacao?.id ?? '';
      const momento = agora();
      return naOrganizacao(banco, orgId, async (tx) => {
        const linha = await maquinaParaMudar(tx, id, maquinaId);
        const arvore = await lerArvore(tx);
        exigirEm(requisicao, 'software.distribuir', linha.localId, arvore);
        if (linha.maquina.situacao !== 'falhou') throw conflito(MENSAGENS_DO_SOFTWARE.soAQueFalhou);
        const [quem] = await tx
          .select({ nome: pessoas.nome })
          .from(contas)
          .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
          .where(eq(contas.id, sessao.contaId));
        await tx
          .update(maquinasDasDistribuicoes)
          .set({
            situacao: 'aguardando',
            etapa: null,
            codigoDeSaida: null,
            enviadaEm: null,
            terminadaEm: null,
            atualizadaEm: momento,
            log: comALinha(linha.maquina.log, linhaDoTentarDeNovo(quem?.nome ?? '')),
          })
          .where(eq(maquinasDasDistribuicoes.id, maquinaId));
        await registrarNaAuditoria(tx, {
          acao: 'distribuicao.maquina-tentada-de-novo',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'distribuicao', id },
          dados: {
            pacote: linha.pacote,
            maquina: linha.patrimonio ?? linha.rotulo,
            codigoDeSaida: linha.maquina.codigoDeSaida,
          },
          origem: origemDa(requisicao),
          momento,
        });
        // O pedido que pode seguir acorda o agente na hora, pela fila (design, decisão 8a).
        if (podeSeguir(linha, momento) && fila?.rodando()) {
          await fila.enviar(TAREFA_DE_ACORDAR, { orgId, distribuicaoId: id, maquinaId }, { tx });
        }
        const [maquina] = await maquinasDa(tx, {
          distribuicaoId: id,
          maquinaId,
          momento,
          leitor: { acesso: sessao.acesso, arvore },
        });
        if (!maquina) throw naoEncontrado(MENSAGENS_DO_SOFTWARE.maquinaNaoEncontrada);
        return maquina;
      });
    },
  );

  app.post(
    '/software/distribuicoes/:id/maquinas/:maquinaId/tirar-da-fila',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary:
          'Tirar da fila a máquina que aguarda o agente: ela não recebe mais o pedido, com o fim marcado',
        params: ParametrosDaMaquina,
        response: { 200: MaquinaDaDistribuicao, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const { id, maquinaId } = requisicao.params;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linha = await maquinaParaMudar(tx, id, maquinaId);
        const arvore = await lerArvore(tx);
        exigirEm(requisicao, 'software.distribuir', linha.localId, arvore);
        if (linha.maquina.situacao !== 'aguardando') {
          throw conflito(MENSAGENS_DO_SOFTWARE.soAQueAguarda);
        }
        await tx
          .update(maquinasDasDistribuicoes)
          .set({ situacao: 'tirada', terminadaEm: momento, atualizadaEm: momento })
          .where(eq(maquinasDasDistribuicoes.id, maquinaId));
        await registrarNaAuditoria(tx, {
          acao: 'distribuicao.maquina-tirada-da-fila',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'distribuicao', id },
          dados: { pacote: linha.pacote, maquina: linha.patrimonio ?? linha.rotulo },
          origem: origemDa(requisicao),
          momento,
        });
        const [maquina] = await maquinasDa(tx, {
          distribuicaoId: id,
          maquinaId,
          momento,
          leitor: { acesso: sessao.acesso, arvore },
        });
        if (!maquina) throw naoEncontrado(MENSAGENS_DO_SOFTWARE.maquinaNaoEncontrada);
        return maquina;
      });
    },
  );

  app.post(
    '/software/distribuicoes',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary:
          'Distribuir um pacote às máquinas do alvo com o agente do GLPI ligado, agora, na janela da noite ou a partir de um dia',
        body: z
          .object({
            pacoteId: z.uuid({ error: 'Escolha o pacote.' }),
            alvo: AlvoDaDistribuicao,
            quando: z.enum(QUANDOS_DA_DISTRIBUICAO).default('agora'),
            /** O momento do dia marcado, no `dia`. */
            aPartirDe: z.string().max(40).nullable().optional(),
            /** O fuso IANA de quem envia: o da preferência da conta ou o do navegador. */
            fuso: z.string().max(64).nullable().optional(),
          })
          .meta({ id: 'PedidoDeDistribuicao' }),
        response: { 201: FichaDaDistribuicao, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const { pacoteId, alvo, quando, aPartirDe, fuso } = requisicao.body;
      const momento = agora();
      if (fuso && !fusoValido(fuso)) {
        throw dadosInvalidos({ fuso: MENSAGENS_DO_QUANDO.fusoDesconhecido });
      }
      const conferido = conferirQuando({ quando, aPartirDe, fuso }, momento);
      if (!conferido.ok) throw dadosInvalidos(conferido.erros);
      const orgId = requisicao.organizacao?.id ?? '';
      const criada = await naOrganizacao(banco, orgId, async (tx) => {
        const pacote = await pacoteParaDistribuir(tx, pacoteId);
        const arvore = await lerArvore(tx);
        // A mesma conta da prévia, refeita no servidor.
        const { maquinas } = await resolverAlvo(tx, { sessao, arvore, alvo });
        if (maquinas.length === 0)
          throw dadosInvalidos({ alvo: MENSAGENS_DO_SOFTWARE.semMaquinas });
        const conta = await classificarOAlvo(tx, { arvore, pacote, maquinas, momento });
        const entram = conta.maquinas.filter(({ classe }) => classe !== 'pulada');
        if (entram.length === 0) {
          throw dadosInvalidos({
            alvo: MENSAGENS_DO_SOFTWARE.todasNaVersao(pacote.versao ?? ''),
          });
        }
        const { dados } = conferido;
        const [distribuicao] = await tx
          .insert(distribuicoes)
          .values({
            orgId,
            pacoteId: pacote.id,
            criadaPor: sessao.contaId,
            criadaEm: momento,
            quando: dados.quando,
            aPartirDe: dados.aPartirDe,
            fuso: dados.fuso,
            paraQuem: conta.paraQuem,
          })
          .returning({ id: distribuicoes.id });
        if (!distribuicao) throw new Error('A distribuição não foi gravada.');
        await tx.insert(maquinasDasDistribuicoes).values(
          entram.map((maquina) => ({
            orgId,
            distribuicaoId: distribuicao.id,
            ativoId: maquina.id,
            agenteId: maquina.agenteId,
            atualizadaEm: momento,
          })),
        );
        await registrarNaAuditoria(tx, {
          acao: 'distribuicao.criada',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'distribuicao', id: distribuicao.id },
          dados: {
            pacote: pacote.nome,
            versao: pacote.versao,
            maquinas: entram.length,
            puladas: conta.conta.puladas,
            paraQuem: conta.paraQuem,
            quando: dados.quando,
            aPartirDe: dados.aPartirDe?.toISOString() ?? null,
            fuso: dados.fuso,
          },
          origem: origemDa(requisicao),
          momento,
        });
        // O agora chama os agentes na hora, pela fila, junto com a transação (design, decisão 8a).
        if (dados.quando === 'agora' && fila?.rodando()) {
          await fila.enviar(TAREFA_DE_ACORDAR, { orgId, distribuicaoId: distribuicao.id }, { tx });
        }
        return ficha(tx, distribuicao.id, momento, sessao);
      });
      return resposta.code(201).send(criada);
    },
  );
};
