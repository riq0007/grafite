// Os alertas pela API (spec alertas e modulo-alertas; change p3a-regras-e-alertas, design,
// decisões 8 e 10): a lista dos abertos e dos resolvidos que a conta vê, com os filtros, o "para
// resolver", a ordem e o cursor; o reconhecimento e o adiamento de um alerta e o silêncio dos
// alertas de um ativo, por quem trata os alertas no escopo do local do ativo (o alerta do coletor,
// na organização inteira), com a auditoria e o evento para quem vê os alertas desse local.
import {
  alertas,
  ativos,
  type Banco,
  CONDICOES_DE_ALERTA_NO_BANCO,
  contas,
  FINS_DO_ALERTA,
  naOrganizacao,
  pessoas,
  regrasDeAlerta,
  SEVERIDADES_NO_BANCO,
  silenciosDosAtivos,
  type Transacao,
} from '@grafite/db';
import { ICONES_DE_TIPO, podeEm } from '@grafite/domain';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { listarAlertas, ORDENS_DOS_ALERTAS } from '../alertas/lista.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { Cursor, Limite } from '../paginacao.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const AlvoDoAlerta = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('ativo'),
      id: z.uuid(),
      /** O rótulo do ativo: o nome, o fabricante e o modelo, ou o tipo. */
      nome: z.string(),
      patrimonio: z.string().nullable(),
      tipoDoAtivo: z.object({ id: z.uuid(), nome: z.string(), icone: z.enum(ICONES_DE_TIPO) }),
      /** A imagem própria do ativo, que vale no lugar da do modelo. */
      imagem: z.object({ id: z.uuid() }).nullable(),
      /** O modelo, com a imagem dele, que vale sem a imagem própria do ativo. */
      modelo: z.object({ id: z.uuid(), imagem: z.object({ id: z.uuid() }).nullable() }).nullable(),
    }),
    z.object({ tipo: z.literal('coletor'), id: z.uuid(), nome: z.string() }),
  ])
  .meta({ id: 'AlvoDoAlerta' });

export const AlertaNaLista = z
  .object({
    id: z.uuid(),
    regra: z.object({ id: z.uuid(), nome: z.string() }),
    condicao: z.enum(CONDICOES_DE_ALERTA_NO_BANCO),
    severidade: z.enum(SEVERIDADES_NO_BANCO),
    texto: z.string(),
    situacao: z.enum(['aberto', 'resolvido']),
    alvo: AlvoDoAlerta,
    /** ISO 8601. */
    abertoEm: z.string(),
    resolvidoEm: z.string().nullable(),
    comoTerminou: z.enum(FINS_DO_ALERTA).nullable(),
    reconhecido: z.object({ nome: z.string(), em: z.string() }).nullable(),
    /** Só enquanto o adiamento vale. */
    adiado: z.object({ ate: z.string(), nome: z.string() }).nullable(),
    /** O silêncio do ativo agora; o `ate` nulo é até alguém retomar. */
    silencio: z.object({ ate: z.string().nullable(), motivo: z.string().nullable() }).nullable(),
    permite: z.object({ tratar: z.boolean() }),
  })
  .meta({ id: 'AlertaNaLista' });

const ListaDeAlertas = z
  .object({
    itens: z.array(AlertaNaLista),
    /** Quantos alertas os filtros trazem, em todas as páginas. */
    total: z.number().int(),
    proximo: z.string().nullable(),
  })
  .meta({ id: 'ListaDeAlertas' });

const SEVERIDADE_INVALIDA = 'Escolha as severidades: critico, atencao ou info.';

const FiltrosDaLista = z.object({
  situacao: z.enum(['abertos', 'resolvidos']).default('abertos'),
  /** As severidades separadas por vírgula, como `critico,atencao`. */
  severidade: z
    .string()
    .optional()
    .transform((texto, contexto) => {
      if (!texto) return undefined;
      const lidas = texto.split(',').map((parte) => parte.trim());
      if (!lidas.every((parte) => (SEVERIDADES_NO_BANCO as readonly string[]).includes(parte))) {
        contexto.addIssue({ code: 'custom', message: SEVERIDADE_INVALIDA });
        return z.NEVER;
      }
      return lidas as (typeof SEVERIDADES_NO_BANCO)[number][];
    }),
  regra: z.uuid().optional(),
  ativo: z.uuid().optional(),
  /** Sem os adiados e sem os dos ativos silenciados, como a tela inicial. */
  paraResolver: z.enum(['true', 'false']).optional(),
  ordem: z.enum(ORDENS_DOS_ALERTAS).default('severidade'),
  direcao: z.enum(['asc', 'desc']).optional(),
  limite: Limite,
  cursor: Cursor.optional(),
});

const ParametrosDoAlerta = z.object({ id: z.uuid({ error: 'Alerta não encontrado.' }) });

const ParametrosDoAtivo = z.object({ id: z.uuid({ error: 'Ativo não encontrado.' }) });

const Reconhecimento = z
  .object({ reconhecido: z.object({ nome: z.string(), em: z.string() }) })
  .meta({ id: 'ReconhecimentoDoAlerta' });

const Adiamento = z
  .object({ adiado: z.object({ ate: z.string(), nome: z.string() }) })
  .meta({ id: 'AdiamentoDoAlerta' });

const PedidoDeAdiamento = z
  .object({
    /** Por quanto tempo: nunca mais de uma hora. */
    minutos: z.union([z.literal(15), z.literal(30), z.literal(60)], {
      error: 'Adie por 15 minutos, 30 minutos ou 1 hora.',
    }),
  })
  .meta({ id: 'PedidoDeAdiamento' });

const SilencioDoAtivo = z
  .object({
    /** O silêncio de agora; o `ate` nulo é até alguém retomar. */
    silencio: z
      .object({
        ate: z.string().nullable(),
        motivo: z.string().nullable(),
        /** Quem silenciou, pelo nome atual da pessoa. */
        nome: z.string(),
        em: z.string(),
      })
      .nullable(),
    /** Se a conta vê os alertas no local do ativo e se os trata. */
    permite: z.object({ ver: z.boolean(), tratar: z.boolean() }),
  })
  .meta({ id: 'SilencioDoAtivo' });

const PedidoDeSilencio = z
  .object({ ate: z.string().nullable(), motivo: z.string().nullable().optional() })
  .meta({ id: 'PedidoDeSilencio' });

const PROBLEMAS_DO_TRATAMENTO = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

const MOMENTO_DO_SILENCIO = 'Escolha um momento no futuro, em até um ano.';
const UM_ANO = 365 * 24 * 60 * 60_000;

/** O nome atual da pessoa da conta. */
async function nomeDaConta(tx: Transacao, contaId: string): Promise<string> {
  const [linha] = await tx
    .select({ nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(eq(contas.id, contaId));
  return linha?.nome ?? '';
}

/**
 * O alerta que a conta trata: aberto (o pendente não aparece), no alcance de `alertas.tratar` pelo
 * local do ativo, ou na organização inteira, no alerta do coletor; o resolvido é recusado.
 */
async function alertaParaTratar(tx: Transacao, requisicao: FastifyRequest, id: string) {
  const [linha] = await tx
    .select({
      id: alertas.id,
      situacao: alertas.situacao,
      texto: alertas.texto,
      ativoId: alertas.ativoId,
      localId: ativos.localId,
      reconhecidoPor: alertas.reconhecidoPor,
      reconhecidoEm: alertas.reconhecidoEm,
      regra: regrasDeAlerta.nome,
    })
    .from(alertas)
    .innerJoin(regrasDeAlerta, eq(regrasDeAlerta.id, alertas.regraId))
    .leftJoin(ativos, eq(ativos.id, alertas.ativoId))
    .where(eq(alertas.id, id));
  if (!linha || linha.situacao === 'pendente') throw naoEncontrado('Alerta não encontrado.');
  const localId = linha.ativoId ? linha.localId : null;
  exigirEm(requisicao, 'alertas.tratar', localId, await lerArvore(tx));
  if (linha.situacao === 'resolvido') throw conflito('O alerta já foi resolvido.');
  return { ...linha, localId };
}

/** O evento do tratamento vai a quem vê os alertas do local do ativo. */
const saidaDoAlerta = (id: string, localId: string | null) => ({
  publico: { permissao: 'alertas.ver' as const, locais: [localId] },
  alvo: { tipo: 'alerta', id },
});

/** O ativo do silêncio, no alcance da permissão pedida pelo local dele. */
async function ativoDoSilencio(
  tx: Transacao,
  requisicao: FastifyRequest,
  id: string,
  permissao: 'alertas.tratar',
) {
  const [ativo] = await tx
    .select({ id: ativos.id, situacao: ativos.situacao, localId: ativos.localId })
    .from(ativos)
    .where(eq(ativos.id, id));
  if (!ativo) throw naoEncontrado('Ativo não encontrado.');
  const arvore = await lerArvore(tx);
  exigirEm(requisicao, permissao, ativo.localId, arvore);
  return { ...ativo, arvore };
}

/** O silêncio de agora do ativo, com o nome de quem silenciou, ou nenhum. */
async function silencioAtual(tx: Transacao, ativoId: string, agora: Date) {
  const [silencio] = await tx
    .select({
      ate: silenciosDosAtivos.ate,
      motivo: silenciosDosAtivos.motivo,
      criadoPor: silenciosDosAtivos.criadoPor,
      criadoEm: silenciosDosAtivos.criadoEm,
      nome: pessoas.nome,
    })
    .from(silenciosDosAtivos)
    .innerJoin(contas, eq(contas.id, silenciosDosAtivos.criadoPor))
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(
      and(
        eq(silenciosDosAtivos.ativoId, ativoId),
        or(isNull(silenciosDosAtivos.ate), gt(silenciosDosAtivos.ate, agora)),
      ),
    );
  return silencio
    ? {
        ate: silencio.ate ? silencio.ate.toISOString() : null,
        motivo: silencio.motivo,
        nome: silencio.nome,
        em: silencio.criadoEm.toISOString(),
      }
    : null;
}

export const rotasDosAlertas: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.get(
    '/alertas',
    {
      config: { permissao: 'alertas.ver' },
      schema: {
        summary: 'Os alertas abertos ou resolvidos que a conta vê, com os filtros e a ordem',
        querystring: FiltrosDaLista,
        response: { 200: ListaDeAlertas, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const consulta = requisicao.query;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        listarAlertas(
          tx,
          {
            situacao: consulta.situacao,
            severidades: consulta.severidade,
            regra: consulta.regra,
            ativo: consulta.ativo,
            paraResolver: consulta.paraResolver === 'true',
            ordem: consulta.ordem,
            direcao: consulta.direcao,
            limite: consulta.limite,
            cursor: consulta.cursor,
          },
          { acesso, arvore: await lerArvore(tx), agora: agora() },
        ),
      );
    },
  );

  app.post(
    '/alertas/:id/reconhecimento',
    {
      config: { permissao: 'alertas.tratar' },
      schema: {
        summary: 'Reconhecer um alerta aberto: ele continua aberto até se resolver',
        params: ParametrosDoAlerta,
        response: { 200: Reconhecimento, ...PROBLEMAS_DO_TRATAMENTO },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const alerta = await alertaParaTratar(tx, requisicao, requisicao.params.id);
        // O reconhecimento que já existe fica: quem reconheceu primeiro é quem cuida.
        if (alerta.reconhecidoPor && alerta.reconhecidoEm) {
          return {
            reconhecido: {
              nome: await nomeDaConta(tx, alerta.reconhecidoPor),
              em: alerta.reconhecidoEm.toISOString(),
            },
          };
        }
        await tx
          .update(alertas)
          .set({ reconhecidoPor: contaId, reconhecidoEm: momento, atualizadoEm: momento })
          .where(eq(alertas.id, alerta.id));
        await registrarNaAuditoria(tx, {
          acao: 'alerta.reconhecido',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'alerta', id: alerta.id },
          dados: { alerta: alerta.texto, regra: alerta.regra },
          origem: origemDa(requisicao),
          momento,
          saida: saidaDoAlerta(alerta.id, alerta.localId),
        });
        return {
          reconhecido: { nome: await nomeDaConta(tx, contaId), em: momento.toISOString() },
        };
      });
    },
  );

  app.post(
    '/alertas/:id/adiamento',
    {
      config: { permissao: 'alertas.tratar' },
      schema: {
        summary: 'Adiar um alerta aberto por 15, 30 ou 60 minutos',
        params: ParametrosDoAlerta,
        body: PedidoDeAdiamento,
        response: { 200: Adiamento, ...PROBLEMAS_DO_TRATAMENTO },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      const ate = new Date(momento.getTime() + requisicao.body.minutos * 60_000);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const alerta = await alertaParaTratar(tx, requisicao, requisicao.params.id);
        await tx
          .update(alertas)
          .set({ adiadoAte: ate, adiadoPor: contaId, atualizadoEm: momento })
          .where(eq(alertas.id, alerta.id));
        await registrarNaAuditoria(tx, {
          acao: 'alerta.adiado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'alerta', id: alerta.id },
          dados: { alerta: alerta.texto, regra: alerta.regra, ate: ate.toISOString() },
          origem: origemDa(requisicao),
          momento,
          saida: saidaDoAlerta(alerta.id, alerta.localId),
        });
        return { adiado: { ate: ate.toISOString(), nome: await nomeDaConta(tx, contaId) } };
      });
    },
  );

  app.get(
    '/ativos/:id/silencio',
    {
      config: { permissao: 'alertas.ver' },
      schema: {
        summary: 'O silêncio dos alertas de um ativo',
        params: ParametrosDoAtivo,
        response: { 200: SilencioDoAtivo, ...PROBLEMAS_DO_TRATAMENTO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [ativo] = await tx
          .select({ id: ativos.id, localId: ativos.localId })
          .from(ativos)
          .where(eq(ativos.id, requisicao.params.id));
        if (!ativo) throw naoEncontrado('Ativo não encontrado.');
        const arvore = await lerArvore(tx);
        // Fora do alcance de quem lê, a resposta não diz nada do silêncio: a ficha não mostra o
        // bloco, sem uma recusa que faria a sessão ser validada de novo.
        if (!podeEm(acesso, 'alertas.ver', ativo.localId, arvore)) {
          return { silencio: null, permite: { ver: false, tratar: false } };
        }
        return {
          silencio: await silencioAtual(tx, ativo.id, agora()),
          permite: {
            ver: true,
            tratar: podeEm(acesso, 'alertas.tratar', ativo.localId, arvore),
          },
        };
      });
    },
  );

  app.put(
    '/ativos/:id/silencio',
    {
      config: { permissao: 'alertas.tratar' },
      schema: {
        summary: 'Silenciar os alertas de um ativo até um momento ou até alguém retomar',
        params: ParametrosDoAtivo,
        body: PedidoDeSilencio,
        response: { 200: SilencioDoAtivo, ...PROBLEMAS_DO_TRATAMENTO },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      const { ate: pedido } = requisicao.body;
      const ate = pedido === null ? null : new Date(pedido);
      if (
        ate !== null &&
        (Number.isNaN(ate.getTime()) ||
          ate.getTime() <= momento.getTime() ||
          ate.getTime() > momento.getTime() + UM_ANO)
      ) {
        throw dadosInvalidos({ ate: MOMENTO_DO_SILENCIO });
      }
      const motivo = requisicao.body.motivo?.trim() || null;
      if (motivo && motivo.length > 200) {
        throw dadosInvalidos({ motivo: 'Use até 200 caracteres no motivo.' });
      }
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const ativo = await ativoDoSilencio(tx, requisicao, requisicao.params.id, 'alertas.tratar');
        if (ativo.situacao !== 'ativo') throw conflito('O ativo está inativo.');
        const [antes] = await tx
          .select({ ate: silenciosDosAtivos.ate, motivo: silenciosDosAtivos.motivo })
          .from(silenciosDosAtivos)
          .where(eq(silenciosDosAtivos.ativoId, ativo.id));
        await tx
          .insert(silenciosDosAtivos)
          .values({
            orgId: requisicao.organizacao?.id ?? '',
            ativoId: ativo.id,
            ate,
            motivo,
            criadoPor: contaId,
            criadoEm: momento,
          })
          .onConflictDoUpdate({
            target: [silenciosDosAtivos.orgId, silenciosDosAtivos.ativoId],
            set: { ate, motivo, criadoPor: contaId, criadoEm: momento },
          });
        await registrarNaAuditoria(tx, {
          acao: 'alertas.silenciados',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'ativo', id: ativo.id },
          antes: antes
            ? { ate: antes.ate ? antes.ate.toISOString() : null, motivo: antes.motivo }
            : null,
          depois: { ate: ate ? ate.toISOString() : null, motivo },
          origem: origemDa(requisicao),
          momento,
          saida: {
            publico: { permissao: 'alertas.ver', locais: [ativo.localId] },
            alvo: { tipo: 'ativo', id: ativo.id },
          },
        });
        return {
          silencio: await silencioAtual(tx, ativo.id, momento),
          permite: { ver: true, tratar: true },
        };
      });
    },
  );

  app.delete(
    '/ativos/:id/silencio',
    {
      config: { permissao: 'alertas.tratar' },
      schema: {
        summary: 'Retomar os alertas de um ativo silenciado',
        params: ParametrosDoAtivo,
        response: { 200: SilencioDoAtivo, ...PROBLEMAS_DO_TRATAMENTO },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const ativo = await ativoDoSilencio(tx, requisicao, requisicao.params.id, 'alertas.tratar');
        const [apagado] = await tx
          .delete(silenciosDosAtivos)
          .where(eq(silenciosDosAtivos.ativoId, ativo.id))
          .returning({ ate: silenciosDosAtivos.ate, motivo: silenciosDosAtivos.motivo });
        if (apagado) {
          await registrarNaAuditoria(tx, {
            acao: 'alertas.retomados',
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'ativo', id: ativo.id },
            antes: { ate: apagado.ate ? apagado.ate.toISOString() : null, motivo: apagado.motivo },
            origem: origemDa(requisicao),
            momento,
            saida: {
              publico: { permissao: 'alertas.ver', locais: [ativo.localId] },
              alvo: { tipo: 'ativo', id: ativo.id },
            },
          });
        }
        return { silencio: null, permite: { ver: true, tratar: true } };
      });
    },
  );
};
