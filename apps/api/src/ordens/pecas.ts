// As peças das OS (spec ordens-de-servico, "Peças da OS"; change p4e-ordens-de-servico, design,
// decisão 5), numa transação só: a OS em aberto, travada; a saída do estoque pelo lançamento da
// P4c, com as regras dela (o saldo, `estoque.movimentar` no local de origem e o ativo que a conta
// vê), para o ativo da OS e com "OS <número>" na observação; e a peça, com a saída, a auditoria e o
// evento. A recusa da saída volta no campo da peça.
import { pecasDasOrdens, type Transacao } from '@grafite/db';
import { recusaNaOrdem, textoDaOrdem, validarPecaDaOrdem } from '@grafite/domain';
import { sql } from 'drizzle-orm';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { lancar } from '../estoque/lancamento.ts';
import { dadosInvalidos, ProblemaDaApi } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { type Contexto, paraMudar, publicoDaOrdem, recusar } from './abertura.ts';
import { lerOrdem, type OrdemLida } from './leitura.ts';

/** O campo da saída no pedido da peça: a origem é o local. */
const CAMPO_NA_PECA: Record<string, string> = { origem: 'local' };

/** Lança a peça na OS em aberto e a devolve lida. */
export async function lancarPeca(
  tx: Transacao,
  numero: number,
  pedido: { consumivel: string | null; local: string | null; quantidade: number | null },
  contexto: Contexto,
): Promise<OrdemLida> {
  const { requisicao, momento } = contexto;
  const { contaId } = sessaoDa(requisicao);
  const { linha, leitor } = await paraMudar(tx, numero, contexto);
  recusar(linha, recusaNaOrdem(linha.situacao, { acao: 'lancar-peca' }));
  const erros = validarPecaDaOrdem(pedido);
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);

  let saida: Awaited<ReturnType<typeof lancar>>;
  try {
    saida = await lancar(
      tx,
      {
        tipo: 'saida',
        consumivel: pedido.consumivel,
        quantidade: pedido.quantidade,
        origem: pedido.local,
        ativo: linha.ativoId,
        observacao: textoDaOrdem(linha.numero),
      },
      contexto,
    );
  } catch (erro) {
    if (!(erro instanceof ProblemaDaApi) || !erro.dados.campos) throw erro;
    const campos = Object.fromEntries(
      Object.entries(erro.dados.campos).map(([campo, mensagem]) => [
        CAMPO_NA_PECA[campo] ?? campo,
        mensagem,
      ]),
    );
    throw new ProblemaDaApi({ ...erro.dados, campos });
  }

  const { movimento } = saida;
  await tx.insert(pecasDasOrdens).values({
    orgId: sql`app.current_org()`,
    ordemId: linha.id,
    consumivelId: movimento.consumivel.id,
    quantidade: movimento.quantidade,
    localId: pedido.local ?? '',
    movimentoId: movimento.id,
    lancadaPor: contaId,
    lancadaEm: momento,
  });
  await registrarNaAuditoria(tx, {
    acao: 'ordem.peca',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'ordem', id: linha.id },
    depois: {
      consumivel: movimento.consumivel.codigo,
      quantidade: movimento.quantidade,
      local: movimento.origem?.caminho ?? null,
    },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDaOrdem(linha.localId) },
  });
  return lerOrdem(tx, leitor, linha.id);
}
