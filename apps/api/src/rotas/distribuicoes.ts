// As distribuições de software pela API (spec distribuicao-de-software, "Distribuição às máquinas",
// "Pedir agora" e "Histórico das distribuições"; change distribuicao-de-software, design, decisões 4
// e 5): a criação para as máquinas com o agente ligado, nos locais em que a conta distribui; a lista
// e a ficha, com a situação, a etapa e o log de cada máquina; as do ativo; o acordar dos agentes; e
// a busca das máquinas com o agente ligado, para a escolha na tela.
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
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  alcance,
  fusoReconhecido,
  LIMITE_DA_LISTA_COLADA,
  MENSAGEM_DA_LISTA_COLADA,
  MENSAGENS_DO_SOFTWARE,
  normalizarTexto,
  podeEm,
  progressoDaDistribuicao,
  SITUACOES_DA_MAQUINA,
  SITUACOES_DA_MAQUINA_NO_BANCO,
  semContato,
  textoDoSemContato,
} from '@grafite/domain';
import { and, desc, eq, inArray, like, or, type SQL, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirEm, RecusaDePermissao, sessaoDa } from '../acesso/escopo.ts';
import { lerCadastroDosAgentes } from '../agentes/cadastro.ts';
import { lerArvore } from '../arvore.ts';
import { rotuloNoBanco } from '../ativos/colunas.ts';
import { doResponsavel, lerAtivo } from '../ativos/leitura.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { contendo } from '../busca.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { alvosDaConta, classificarOAlvo, resolverAlvo } from '../software/alvo.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

/** Acorda o agente pelo IP: `true` quando ele respondeu. */
export type AcordarAgente = (ip: string) => Promise<boolean>;

/** O `/now` do agente do GLPI, na porta 62354, com 5 s de prazo. */
export const acordarPeloHttp: AcordarAgente = async (ip) => {
  try {
    const resposta = await fetch(`http://${ip}:62354/now`, { signal: AbortSignal.timeout(5000) });
    return resposta.ok;
  } catch {
    return false;
  }
};

const SituacaoNaTela = z.object({
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
    maquinas: z.number(),
    progresso: z.string(),
  })
  .meta({ id: 'ResumoDaDistribuicao' });

const MaquinaDaDistribuicao = z
  .object({
    id: z.uuid(),
    ativo: z.object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() }),
    situacao: SituacaoNaTela,
    etapa: z.string().nullable(),
    log: z.array(z.string()),
    enviadaEm: z.string().nullable(),
    atualizadaEm: z.string().nullable(),
    terminadaEm: z.string().nullable(),
  })
  .meta({ id: 'MaquinaDaDistribuicao' });

const FichaDaDistribuicao = ResumoDaDistribuicao.extend({
  maquinasDaDistribuicao: z.array(MaquinaDaDistribuicao),
}).meta({ id: 'FichaDaDistribuicao' });

const DistribuicaoDoAtivo = z
  .object({
    distribuicaoId: z.uuid(),
    pacote: z.object({ nome: z.string(), versao: z.string().nullable() }),
    situacao: SituacaoNaTela,
    criadaEm: z.string(),
    terminadaEm: z.string().nullable(),
  })
  .meta({ id: 'DistribuicaoDoAtivo' });

/** O agente sem contato, pelo prazo da organização: "Sem contato · há 3 dias". */
const SemContato = z
  .object({ dias: z.number(), texto: z.string() })
  .meta({ id: 'SemContatoDoAgente' });

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

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

const situacaoNaTela = (chave: keyof typeof SITUACOES_DA_MAQUINA) => ({
  chave,
  ...SITUACOES_DA_MAQUINA[chave],
});

const doAtivo = and(
  eq(ativos.orgId, maquinasDasDistribuicoes.orgId),
  eq(ativos.id, maquinasDasDistribuicoes.ativoId),
);
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
async function resumos(tx: Transacao, ids?: readonly string[]) {
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
    })
    .from(distribuicoes)
    .innerJoin(pacotesDeSoftware, eq(pacotesDeSoftware.id, distribuicoes.pacoteId))
    .innerJoin(contas, eq(contas.id, distribuicoes.criadaPor))
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(ids ? inArray(distribuicoes.id, [...ids]) : undefined)
    .orderBy(desc(distribuicoes.criadaEm))
    .limit(100);
  if (linhas.length === 0) return [];
  const situacoes = await tx
    .select({
      distribuicaoId: maquinasDasDistribuicoes.distribuicaoId,
      situacao: maquinasDasDistribuicoes.situacao,
    })
    .from(maquinasDasDistribuicoes)
    .where(
      inArray(
        maquinasDasDistribuicoes.distribuicaoId,
        linhas.map(({ id }) => id),
      ),
    );
  return linhas.map((linha) => {
    const daDistribuicao = situacoes
      .filter((maquina) => maquina.distribuicaoId === linha.id)
      .map((maquina) => maquina.situacao);
    return {
      ...linha,
      criadaEm: linha.criadaEm.toISOString(),
      maquinas: daDistribuicao.length,
      progresso: progressoDaDistribuicao(daDistribuicao),
    };
  });
}

async function ficha(tx: Transacao, id: string) {
  const [resumo] = await resumos(tx, [id]);
  if (!resumo) throw naoEncontrado('Distribuição não encontrada.');
  const maquinas = await tx
    .select({
      maquina: maquinasDasDistribuicoes,
      ativo: {
        id: ativos.id,
        rotulo: sql<string>`${rotuloNoBanco}`,
        patrimonio: ativos.patrimonio,
      },
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(ativos, doAtivo)
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo)
    .where(eq(maquinasDasDistribuicoes.distribuicaoId, id))
    .orderBy(sql`${rotuloNoBanco}`);
  return {
    ...resumo,
    maquinasDaDistribuicao: maquinas.map(({ maquina, ativo }) => ({
      id: maquina.id,
      ativo,
      situacao: situacaoNaTela(maquina.situacao),
      etapa: maquina.etapa,
      log: maquina.log,
      enviadaEm: maquina.enviadaEm?.toISOString() ?? null,
      atualizadaEm: maquina.atualizadaEm?.toISOString() ?? null,
      terminadaEm: maquina.terminadaEm?.toISOString() ?? null,
    })),
  };
}

export const rotasDasDistribuicoes: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  acordar: AcordarAgente;
}> = async (app, { banco, agora, acordar }) => {
  app.get(
    '/software/maquinas',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary:
          'As máquinas com o agente do GLPI ligado, nos locais em que a conta distribui e vê, pelo nome, pelo patrimônio, pelo hostname ou pela pessoa',
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
        for (const palavra of normalizarTexto(requisicao.query.busca ?? '')
          .split(' ')
          .filter(Boolean)) {
          const padrao = contendo(palavra);
          const naMaquina = or(
            like(ativos.busca, padrao),
            like(modelos.busca, padrao),
            like(pessoas.busca, padrao),
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
    async (requisicao) => ({
      distribuicoes: await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        resumos(tx),
      ),
    }),
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
        ficha(tx, requisicao.params.id),
      ),
  );

  app.post(
    '/software/distribuicoes',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary: 'Distribuir um pacote às máquinas com o agente do GLPI ligado',
        body: z
          .object({
            pacoteId: z.uuid({ error: 'Escolha o pacote.' }),
            ativoIds: z.array(z.uuid()).max(500, { error: 'Escolha até 500 máquinas.' }),
          })
          .meta({ id: 'PedidoDeDistribuicao' }),
        response: { 201: FichaDaDistribuicao, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const ativoIds = [...new Set(requisicao.body.ativoIds)];
      if (ativoIds.length === 0)
        throw dadosInvalidos({ ativoIds: MENSAGENS_DO_SOFTWARE.semMaquinas });
      const momento = agora();
      const criada = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [pacote] = await tx
          .select()
          .from(pacotesDeSoftware)
          .where(eq(pacotesDeSoftware.id, requisicao.body.pacoteId));
        if (!pacote) throw dadosInvalidos({ pacoteId: 'Escolha o pacote.' });
        if (pacote.situacao !== 'ativo') throw conflito(MENSAGENS_DO_SOFTWARE.pacoteInativo);
        const arvore = await lerArvore(tx);
        const linhas = await tx
          .select({
            id: ativos.id,
            localId: ativos.localId,
            situacao: ativos.situacao,
            patrimonio: ativos.patrimonio,
            rotulo: sql<string>`${rotuloNoBanco}`,
          })
          .from(ativos)
          .innerJoin(tiposDeAtivo, doTipo)
          .leftJoin(modelos, doModelo)
          .where(inArray(ativos.id, ativoIds));
        const agentesDosAtivos = await tx
          .select({ id: agentes.id, ativoId: agentes.ativoId })
          .from(agentes)
          .where(inArray(agentes.ativoId, ativoIds))
          .orderBy(desc(agentes.ultimoContato));
        const maquinas: { ativoId: string; agenteId: string }[] = [];
        for (const ativoId of ativoIds) {
          const ativo = linhas.find((linha) => linha.id === ativoId);
          if (ativo?.situacao !== 'ativo') {
            throw dadosInvalidos({ ativoIds: 'Escolha só ativos ativos.' });
          }
          if (!podeEm(acesso, 'software.distribuir', ativo.localId, arvore)) {
            throw new RecusaDePermissao('software.distribuir');
          }
          const agente = agentesDosAtivos.find((candidato) => candidato.ativoId === ativoId);
          if (!agente) {
            throw dadosInvalidos({
              ativoIds: MENSAGENS_DO_SOFTWARE.semAgente(ativo.patrimonio ?? ativo.rotulo),
            });
          }
          maquinas.push({ ativoId, agenteId: agente.id });
        }
        const [distribuicao] = await tx
          .insert(distribuicoes)
          .values({
            orgId: requisicao.organizacao?.id ?? '',
            pacoteId: pacote.id,
            criadaPor: contaId,
            criadaEm: momento,
          })
          .returning({ id: distribuicoes.id });
        if (!distribuicao) throw new Error('A distribuição não foi gravada.');
        await tx.insert(maquinasDasDistribuicoes).values(
          maquinas.map((maquina) => ({
            orgId: requisicao.organizacao?.id ?? '',
            distribuicaoId: distribuicao.id,
            ...maquina,
            atualizadaEm: momento,
          })),
        );
        await registrarNaAuditoria(tx, {
          acao: 'distribuicao.criada',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'distribuicao', id: distribuicao.id },
          dados: { pacote: pacote.nome, versao: pacote.versao, maquinas: maquinas.length },
          origem: origemDa(requisicao),
          momento,
        });
        return ficha(tx, distribuicao.id);
      });
      return resposta.code(201).send(criada);
    },
  );

  app.post(
    '/software/distribuicoes/:id/agora',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary: 'Acordar os agentes das máquinas que aguardam a distribuição',
        params: ParametrosDaDistribuicao,
        response: {
          200: z.object({ acordados: z.number(), total: z.number(), mensagem: z.string() }),
          ...PROBLEMAS,
        },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const ips = await naOrganizacao(banco, orgId, async (tx) => {
        await ficha(tx, requisicao.params.id);
        return tx
          .select({ ip: agentes.ip })
          .from(maquinasDasDistribuicoes)
          .innerJoin(agentes, eq(agentes.id, maquinasDasDistribuicoes.agenteId))
          .where(
            and(
              eq(maquinasDasDistribuicoes.distribuicaoId, requisicao.params.id),
              eq(maquinasDasDistribuicoes.situacao, 'aguardando'),
            ),
          );
      });
      const total = ips.length;
      const respostas = await Promise.all(
        ips.map(({ ip }) => (ip ? acordar(ip) : Promise.resolve(false))),
      );
      const acordados = respostas.filter(Boolean).length;
      await naOrganizacao(banco, orgId, (tx) =>
        registrarNaAuditoria(tx, {
          acao: 'distribuicao.pedida-agora',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'distribuicao', id: requisicao.params.id },
          dados: { acordados, total },
          origem: origemDa(requisicao),
          momento: agora(),
        }),
      );
      const mensagem =
        total === 0
          ? 'Nenhuma máquina aguarda o agente.'
          : acordados === total
            ? `${total === 1 ? 'O agente foi acordado' : `Os ${total} agentes foram acordados`}.`
            : `${acordados} de ${total} agentes acordados; os outros recebem a tarefa no próximo contato.`;
      return { acordados, total, mensagem };
    },
  );

  app.get(
    '/ativos/:id/distribuicoes',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary: 'As distribuições de software do ativo, da mais nova para a mais antiga',
        params: z.object({ id: z.uuid({ error: 'Ativo não encontrado.' }) }),
        response: {
          200: z.object({ distribuicoes: z.array(DistribuicaoDoAtivo) }),
          ...PROBLEMAS,
        },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linha = await lerAtivo(tx, requisicao.params.id);
        exigirEm(requisicao, 'ativos.ver', linha.ativo.localId, await lerArvore(tx));
        const linhas = await tx
          .select({
            distribuicaoId: distribuicoes.id,
            pacote: { nome: pacotesDeSoftware.nome, versao: pacotesDeSoftware.versao },
            situacao: maquinasDasDistribuicoes.situacao,
            criadaEm: distribuicoes.criadaEm,
            terminadaEm: maquinasDasDistribuicoes.terminadaEm,
          })
          .from(maquinasDasDistribuicoes)
          .innerJoin(distribuicoes, eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId))
          .innerJoin(pacotesDeSoftware, eq(pacotesDeSoftware.id, distribuicoes.pacoteId))
          .where(eq(maquinasDasDistribuicoes.ativoId, linha.ativo.id))
          .orderBy(desc(distribuicoes.criadaEm))
          .limit(50);
        return {
          distribuicoes: linhas.map((distribuicao) => ({
            ...distribuicao,
            situacao: situacaoNaTela(distribuicao.situacao),
            criadaEm: distribuicao.criadaEm.toISOString(),
            terminadaEm: distribuicao.terminadaEm?.toISOString() ?? null,
          })),
        };
      }),
  );
};
