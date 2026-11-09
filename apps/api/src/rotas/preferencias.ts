// As preferências gravadas no servidor (spec preferencias-da-interface; design do F2c, decisão 3):
// a camada da conta e a da organização, os padrões. A mudança chega como merge patch, e a resposta
// é a camada inteira. A linha é lida com `for update`: duas abas que mudam campos diferentes não se
// atropelam, e no mesmo campo vale a última.
import {
  type Banco,
  contas,
  naOrganizacao,
  organizacoes,
  type Transacao,
  visoes,
} from '@grafite/db';
import {
  type AjustesDasPreferencias as Ajustes,
  aplicarMudanca,
  LIMITES_DAS_PREFERENCIAS,
  lerAjustes,
  resolverPreferencias,
  type SecaoDePreferencias,
  VISAO_DE_FABRICA,
} from '@grafite/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirAtiva, sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { registrarEvento } from '../eventos/saida.ts';
import { AjustesDasPreferencias, MudancaDasPreferencias } from '../preferencias/esquemas.ts';
import { dadosInvalidos, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const PedidoDeMudanca = z
  .object({ mudancas: MudancaDasPreferencias })
  .meta({ id: 'PedidoDeMudancaDasPreferencias' });

type Campos = Record<string, unknown>;

/**
 * Os ajustes que mudaram de uma camada para a outra, cada um pelo caminho (`aparencia.tema`), com
 * o valor que valia antes e o que vale depois, sobre os padrões de fábrica: tirar o padrão de um
 * ajuste aparece como a volta ao de fábrica.
 */
function ajustesQueMudaram(antes: Ajustes, depois: Ajustes) {
  const valiam = resolverPreferencias(antes);
  const valem = resolverPreferencias(depois);
  const mudanca = { antes: {} as Campos, depois: {} as Campos };
  for (const secao of Object.keys(valiam) as SecaoDePreferencias[]) {
    const de: Campos = antes[secao] ?? {};
    const para: Campos = depois[secao] ?? {};
    for (const campo of new Set([...Object.keys(de), ...Object.keys(para)])) {
      if (JSON.stringify(de[campo]) === JSON.stringify(para[campo])) continue;
      mudanca.antes[`${secao}.${campo}`] = (valiam[secao] as Campos)[campo];
      mudanca.depois[`${secao}.${campo}`] = (valem[secao] as Campos)[campo];
    }
  }
  return mudanca;
}

/**
 * A visão escolhida de cada tabela pode ser usada pela camada: na conta, uma da organização ou da
 * própria conta; nos padrões da organização (`contaId` nulo), só uma da organização. A recusa
 * desfaz o pedido inteiro.
 */
async function conferirVisoesEscolhidas(
  tx: Transacao,
  mudancas: z.infer<typeof MudancaDasPreferencias>,
  contaId: string | null,
) {
  for (const [tabela, id] of Object.entries(mudancas.tabelas?.visoes ?? {})) {
    if (!id || id === VISAO_DE_FABRICA) continue;
    const [visao] = await tx
      .select({ contaId: visoes.contaId })
      .from(visoes)
      .where(and(eq(visoes.id, id), eq(visoes.tabela, tabela as 'ativos')));
    const usavel =
      visao !== undefined &&
      (visao.contaId === null || (contaId !== null && visao.contaId === contaId));
    if (!usavel) {
      throw dadosInvalidos({
        [`mudancas.tabelas.visoes.${tabela}`]:
          contaId === null
            ? 'Escolha uma visão da organização.'
            : 'Escolha uma visão que você pode usar.',
      });
    }
  }
}

/**
 * As visões fixadas no menu pela camada (change visoes-no-dock, design, decisão 1): a conta grava
 * só as dela, e os padrões da organização, só as da organização (`contaId` nulo), cada uma até 20,
 * só com as visões que a camada pode usar. A recusa desfaz o pedido inteiro. O nulo na chave da
 * outra camada passa, porque só tira o que a camada não tem, como "Restaurar padrões" pede.
 */
async function conferirFixadas(
  tx: Transacao,
  mudancas: z.infer<typeof MudancaDasPreferencias>,
  contaId: string | null,
) {
  const tabelas = mudancas.tabelas;
  if (!tabelas) return;
  const daConta = contaId !== null;
  const propria = daConta ? 'fixadas' : 'fixadasPelaOrganizacao';
  const alheia = daConta ? 'fixadasPelaOrganizacao' : 'fixadas';
  if (tabelas[alheia]) {
    throw dadosInvalidos({
      [`mudancas.tabelas.${alheia}`]: daConta
        ? 'A organização fixa as visões dela nos padrões.'
        : 'Cada conta fixa as visões dela nas preferências dela.',
    });
  }
  for (const [tabela, lista] of Object.entries(tabelas[propria] ?? {})) {
    if (!lista) continue;
    const campo = `mudancas.tabelas.${propria}.${tabela}`;
    const ids = [...new Set(lista.map((id) => id.toLowerCase()))];
    if (ids.length > LIMITES_DAS_PREFERENCIAS.fixadas) {
      throw dadosInvalidos({
        [campo]: daConta
          ? 'Você já fixou 20 visões. Desafixe uma para fixar outra.'
          : 'A organização já fixou 20 visões. Desafixe uma para fixar outra.',
      });
    }
    if (ids.length === 0) continue;
    const encontradas = await tx
      .select({ id: visoes.id, contaId: visoes.contaId })
      .from(visoes)
      .where(and(inArray(visoes.id, ids), eq(visoes.tabela, tabela as 'ativos')));
    const usaveis = ids.every((id) =>
      encontradas.some(
        (visao) =>
          visao.id === id && (visao.contaId === null || (daConta && visao.contaId === contaId)),
      ),
    );
    if (!usaveis) {
      throw dadosInvalidos({
        [campo]: daConta ? 'Fixe uma visão que você pode usar.' : 'Fixe uma visão da organização.',
      });
    }
  }
}

export const rotasDasPreferencias: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  // As preferências de cada conta não vão para a auditoria; o evento leva a mudança às outras
  // sessões da mesma conta.
  app.patch(
    '/conta/preferencias',
    {
      config: { semPermissao: 'propria-conta' },
      preHandler: exigirAtiva,
      schema: {
        summary: 'Mudar as preferências da própria conta',
        body: PedidoDeMudanca,
        response: { 200: AjustesDasPreferencias, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [linha] = await tx
          .select({ preferencias: contas.preferencias })
          .from(contas)
          .where(eq(contas.id, contaId))
          .for('update');
        if (!linha) throw new Error('A conta da sessão sumiu.');
        await conferirVisoesEscolhidas(tx, requisicao.body.mudancas, contaId);
        await conferirFixadas(tx, requisicao.body.mudancas, contaId);
        const camada = aplicarMudanca(lerAjustes(linha.preferencias), requisicao.body.mudancas);
        await tx.update(contas).set({ preferencias: camada }).where(eq(contas.id, contaId));
        await registrarEvento(tx, {
          tipo: 'preferencias.mudaram',
          alvo: { tipo: 'conta', id: contaId },
          publico: { contas: [contaId] },
        });
        return camada;
      });
    },
  );

  // Os padrões valem para quem não mudou o ajuste. A mudança vai para a auditoria, e o evento dela
  // (`padroes.mudaram`) leva os padrões novos a todas as sessões da organização. A mudança que não
  // muda nada não grava.
  app.patch(
    '/organizacao/padroes',
    {
      config: { permissao: 'organizacao.editar' },
      schema: {
        summary: 'Mudar os padrões da organização',
        body: PedidoDeMudanca,
        response: { 200: AjustesDasPreferencias, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [linha] = await tx
          .select({ id: organizacoes.id, preferencias: organizacoes.preferencias })
          .from(organizacoes)
          .for('update');
        if (!linha) throw new Error('A organização do endereço sumiu.');
        await conferirVisoesEscolhidas(tx, requisicao.body.mudancas, null);
        await conferirFixadas(tx, requisicao.body.mudancas, null);
        const antes = lerAjustes(linha.preferencias);
        const camada = aplicarMudanca(antes, requisicao.body.mudancas);
        const mudanca = ajustesQueMudaram(antes, camada);
        if (Object.keys(mudanca.antes).length === 0) return camada;
        await tx
          .update(organizacoes)
          .set({ preferencias: camada })
          .where(eq(organizacoes.id, linha.id));
        await registrarNaAuditoria(tx, {
          acao: 'padroes.alterados',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'organizacao', id: linha.id },
          antes: mudanca.antes,
          depois: mudanca.depois,
          origem: origemDa(requisicao),
          momento: agora(),
        });
        return camada;
      });
    },
  );
};
