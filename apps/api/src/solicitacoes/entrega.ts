// A entrega do toner (spec solicitacoes, "Entrega do toner"; change p4d-solicitacoes, design,
// decisão 4), numa transação só: os itens pendentes escolhidos, cada um do estoque, pela saída que o
// `lancar` da P4c lança para a impressora, ou pelo fornecedor, sem movimentação. A recusa de um item
// desfaz a entrega inteira. Depois, a situação: Concluída sem item pendente, ou Aguardando entrega.
import {
  ativos,
  consumiveis,
  consumiveisDosModelos,
  fornecedores,
  itensDasSolicitacoes,
  solicitacoes,
  type Transacao,
} from '@grafite/db';
import {
  type EntregaDoItem,
  MENSAGEM_DO_CONSUMIVEL_FORA_DA_COR,
  MENSAGEM_DO_FORNECEDOR_INATIVO,
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  situacaoDepoisDaEntrega,
  validarEntrega,
} from '@grafite/domain';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { lancar } from '../estoque/lancamento.ts';
import { conflito, dadosInvalidos, ProblemaDaApi } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import type { Solicitacao } from './esquemas.ts';
import { lerSolicitacao } from './leitura.ts';
import { exigirPendente, publicoDosLocais } from './registro.ts';
import { paraMudar } from './situacao.ts';

type SolicitacaoLida = z.infer<typeof Solicitacao>;

/** O campo do lançamento no campo do item da entrega: a origem é o local, e o ativo é o item. */
const CAMPO_NA_ENTREGA: Record<string, string> = { origem: 'local', ativo: 'item' };

/** O item da solicitação, com a impressora pelo patrimônio e pelo modelo. */
interface ItemParaEntregar {
  id: string;
  impressoraId: string;
  cor: (typeof itensDasSolicitacoes.$inferSelect)['cor'];
  quantidade: number;
  consumivelId: string | null;
  entregueEm: Date | null;
  impressora: { patrimonio: string | null; nome: string | null; modeloId: string | null };
}

/** O consumível é compatível com o modelo da impressora e tem a cor do item; aceita o inativo. */
async function compativelDaCor(
  tx: Transacao,
  item: ItemParaEntregar,
  consumivelId: string,
): Promise<{ codigo: string } | null> {
  if (item.impressora.modeloId === null) return null;
  const [linha] = await tx
    .select({ codigo: consumiveis.codigo, cor: consumiveis.cor })
    .from(consumiveisDosModelos)
    .innerJoin(consumiveis, eq(consumiveis.id, consumiveisDosModelos.consumivelId))
    .where(
      and(
        eq(consumiveisDosModelos.modeloId, item.impressora.modeloId),
        eq(consumiveisDosModelos.consumivelId, consumivelId),
      ),
    );
  return linha?.cor === item.cor ? { codigo: linha.codigo } : null;
}

/** Entrega os itens escolhidos e devolve a solicitação lida. */
export async function entregar(
  tx: Transacao,
  numero: number,
  pedidas: EntregaDoItem[],
  contexto: { requisicao: FastifyRequest; momento: Date },
): Promise<SolicitacaoLida> {
  const { requisicao, momento } = contexto;
  const { contaId } = sessaoDa(requisicao);
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  if (linha.tipo !== 'toner') throw conflito('A entrega vale só para o toner.');
  exigirPendente(linha);

  // Pelo fornecedor, sem outro escolhido, vale o do pedido ao fornecedor.
  const entregas = pedidas.map((entrega) =>
    entrega.origem === 'fornecedor' && entrega.fornecedor === null
      ? { ...entrega, fornecedor: linha.fornecedorId }
      : entrega,
  );
  const erros = validarEntrega(entregas);
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);

  const itens: ItemParaEntregar[] = await tx
    .select({
      id: itensDasSolicitacoes.id,
      impressoraId: itensDasSolicitacoes.impressoraId,
      cor: itensDasSolicitacoes.cor,
      quantidade: itensDasSolicitacoes.quantidade,
      consumivelId: itensDasSolicitacoes.consumivelId,
      entregueEm: itensDasSolicitacoes.entregueEm,
      impressora: { patrimonio: ativos.patrimonio, nome: ativos.nome, modeloId: ativos.modeloId },
    })
    .from(itensDasSolicitacoes)
    .innerJoin(ativos, eq(ativos.id, itensDasSolicitacoes.impressoraId))
    .where(eq(itensDasSolicitacoes.solicitacaoId, linha.id))
    .for('update', { of: itensDasSolicitacoes });

  const naoEncontrados: Record<string, string> = {};
  const recusas: Record<string, string> = {};
  const vistos = new Set<string>();
  const doItem: ItemParaEntregar[] = [];
  const codigos = new Map<number, string>();
  const nomesDosFornecedores = new Map<number, string>();
  for (const [indice, entrega] of entregas.entries()) {
    const campo = (nome: string) => `entregas.${indice}.${nome}`;
    const item = itens.find(({ id }) => id === entrega.item);
    if (!item) {
      naoEncontrados[campo('item')] = 'Item não encontrado.';
      continue;
    }
    doItem[indice] = item;
    if (item.entregueEm !== null || vistos.has(item.id)) {
      recusas[campo('item')] = 'O item já foi entregue.';
      continue;
    }
    vistos.add(item.id);
    if (entrega.consumivel !== null) {
      const compativel = await compativelDaCor(tx, item, entrega.consumivel);
      if (compativel) codigos.set(indice, compativel.codigo);
      else recusas[campo('consumivel')] = MENSAGEM_DO_CONSUMIVEL_FORA_DA_COR;
    }
    if (entrega.origem === 'fornecedor' && entrega.fornecedor !== null) {
      const [fornecedor] = await tx
        .select({ nome: fornecedores.nome, situacao: fornecedores.situacao })
        .from(fornecedores)
        .where(eq(fornecedores.id, entrega.fornecedor))
        .for('share');
      if (!fornecedor) naoEncontrados[campo('fornecedor')] = 'Fornecedor não encontrado.';
      else if (fornecedor.situacao !== 'ativo') {
        recusas[campo('fornecedor')] = MENSAGEM_DO_FORNECEDOR_INATIVO;
      } else nomesDosFornecedores.set(indice, fornecedor.nome);
    }
  }
  if (Object.keys(naoEncontrados).length > 0) throw dadosInvalidos(naoEncontrados);
  const [primeira, ...outras] = Object.values(recusas);
  if (primeira !== undefined) {
    throw conflito(outras.length === 0 ? primeira : 'Confira os campos indicados.', recusas);
  }

  // As saídas na ordem do consumível e do local: duas entregas ao mesmo tempo não se travam em ciclo.
  const doEstoque = entregas
    .flatMap((entrega, indice) => (entrega.origem === 'estoque' ? [{ entrega, indice }] : []))
    .sort(
      (a, b) =>
        (a.entrega.consumivel ?? '').localeCompare(b.entrega.consumivel ?? '') ||
        (a.entrega.local ?? '').localeCompare(b.entrega.local ?? '') ||
        a.indice - b.indice,
    );
  const movimentos = new Map<number, { id: string; caminho: string | null }>();
  for (const { entrega, indice } of doEstoque) {
    if (entrega.origem !== 'estoque') continue;
    const item = doItem[indice];
    if (!item) throw new Error('O item da entrega não foi conferido.');
    try {
      const { movimento } = await lancar(
        tx,
        {
          tipo: 'saida',
          consumivel: entrega.consumivel,
          quantidade: item.quantidade,
          origem: entrega.local,
          ativo: item.impressoraId,
          observacao: `Solicitação ${linha.numero}`,
        },
        contexto,
      );
      movimentos.set(indice, { id: movimento.id, caminho: movimento.origem?.caminho ?? null });
    } catch (erro) {
      if (!(erro instanceof ProblemaDaApi) || !erro.dados.campos) throw erro;
      const campos = Object.fromEntries(
        Object.entries(erro.dados.campos).map(([campo, mensagem]) => [
          `entregas.${indice}.${CAMPO_NA_ENTREGA[campo] ?? campo}`,
          mensagem,
        ]),
      );
      throw new ProblemaDaApi({ ...erro.dados, campos });
    }
  }

  const entregues: string[] = [];
  for (const [indice, entrega] of entregas.entries()) {
    const item = doItem[indice];
    if (!item) throw new Error('O item da entrega não foi conferido.');
    const movimento = movimentos.get(indice) ?? null;
    await tx
      .update(itensDasSolicitacoes)
      .set({
        origem: entrega.origem,
        consumivelId: entrega.consumivel ?? item.consumivelId,
        movimentoId: movimento?.id ?? null,
        fornecedorId: entrega.origem === 'fornecedor' ? entrega.fornecedor : null,
        entreguePor: contaId,
        entregueEm: momento,
      })
      .where(and(eq(itensDasSolicitacoes.id, item.id), isNull(itensDasSolicitacoes.entregueEm)));
    const impressora = item.impressora.patrimonio ?? item.impressora.nome ?? '';
    const pedido = `${impressora}: ${item.quantidade} ${ROTULOS_DAS_CORES_DE_CONSUMIVEL[item.cor]}`;
    entregues.push(
      entrega.origem === 'estoque'
        ? `${pedido} do estoque, ${codigos.get(indice) ?? ''} de ${movimento?.caminho ?? ''}`
        : `${pedido} pela ${nomesDosFornecedores.get(indice) ?? ''}`,
    );
  }

  const [{ pendentes } = { pendentes: 0 }] = await tx
    .select({ pendentes: count() })
    .from(itensDasSolicitacoes)
    .where(
      and(
        eq(itensDasSolicitacoes.solicitacaoId, linha.id),
        isNull(itensDasSolicitacoes.entregueEm),
      ),
    );
  const nova = situacaoDepoisDaEntrega(pendentes);
  await tx
    .update(solicitacoes)
    .set({
      situacao: nova,
      ...(nova === 'concluida' ? { encerradaPor: contaId, encerradaEm: momento } : {}),
    })
    .where(eq(solicitacoes.id, linha.id));
  await registrarNaAuditoria(tx, {
    acao: 'solicitacao.entregue',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'solicitacao', id: linha.id },
    antes: { situacao: linha.situacao },
    depois: { situacao: nova, entregues },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: { permissao: 'solicitacoes.ver', locais: publicoDosLocais(linha) } },
  });
  return lerSolicitacao(tx, leitor, linha.id);
}
