// O lançamento no estoque (spec estoque; change p4c-estoque, design, decisões 3 e 4), numa
// transação: os campos pelo domínio, os locais que existem e em que a conta movimenta, as
// referências e os inativos que o tipo aceita, o ativo da saída que a conta vê e o total de páginas
// dele, o efeito nos saldos, com a diferença negativa condicional ao saldo, e a movimentação, a
// auditoria e o evento para quem vê o estoque dos locais.
import {
  ativos,
  consumiveis,
  fornecedores,
  locais,
  modelos,
  movimentosDoEstoque,
  saldosDoEstoque,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  type CampoDoLancamento,
  consumivelPrecisaEstarAtivo,
  type DadosDoLancamento,
  efeitoNosSaldos,
  limparLancamento,
  MENSAGEM_DO_ATIVO_INATIVO,
  MENSAGEM_DO_CONSUMIVEL_INATIVO,
  MENSAGEM_DO_FORNECEDOR_INATIVO,
  MENSAGEM_DO_LOCAL_INATIVO,
  mensagemDoSaldo,
  podeEm,
  rotuloDoAtivo,
  validarLancamento,
} from '@grafite/domain';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { lerContador } from '../coleta/contador.ts';
import { conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import type { LancamentoDoEstoque } from './esquemas.ts';
import { comoSaldo, type LeitorDoEstoque, lerMovimentos } from './leitura.ts';

/** Um local do lançamento, com o campo em que a recusa dele aparece. */
interface LocalDoLancamento {
  campo: CampoDoLancamento;
  id: string;
  /** O local recebe o saldo e precisa estar ativo; o de onde o saldo sai aceita o inativo. */
  recebe: boolean;
}

/** O campo que a conferência do domínio já exigiu. */
function conferido<T>(valor: T | null): T {
  if (valor === null) throw new Error('O lançamento não foi conferido.');
  return valor;
}

/** Os locais do lançamento conferido, cada um no campo dele. */
function locaisComOsCampos(dados: DadosDoLancamento): LocalDoLancamento[] {
  const local = (campo: CampoDoLancamento, id: string | null, recebe: boolean) => ({
    campo,
    id: conferido(id),
    recebe,
  });
  switch (dados.tipo) {
    case 'entrada':
      return [local('destino', dados.destino, true)];
    case 'saida':
      return [local('origem', dados.origem, false)];
    case 'transferencia':
      return [local('origem', dados.origem, false), local('destino', dados.destino, true)];
    case 'ajuste':
      return [local('local', dados.local, dados.direcao === 'acrescentar')];
  }
}

/** As colunas do tipo na movimentação: os locais, o fornecedor e a nota, o ativo ou o motivo. */
function colunasDoTipo(dados: DadosDoLancamento) {
  switch (dados.tipo) {
    case 'entrada':
      return {
        destinoId: dados.destino,
        fornecedorId: dados.fornecedor,
        notaFiscal: dados.notaFiscal,
      };
    case 'saida':
      return { origemId: dados.origem, ativoId: dados.ativo };
    case 'transferencia':
      return { origemId: dados.origem, destinoId: dados.destino };
    case 'ajuste':
      return dados.direcao === 'acrescentar'
        ? { destinoId: dados.local, motivo: dados.motivo }
        : { origemId: dados.local, motivo: dados.motivo };
  }
}

const COLUNAS_DO_CONSUMIVEL = {
  id: consumiveis.id,
  codigo: consumiveis.codigo,
  nome: consumiveis.nome,
  tipo: consumiveis.tipo,
  cor: consumiveis.cor,
  situacao: consumiveis.situacao,
};

/** O ativo da saída, que a conta vê, pelo rótulo e pelo patrimônio. */
interface AtivoDaSaida {
  id: string;
  rotulo: string;
  patrimonio: string | null;
}

/**
 * O ativo da saída: o que a conta não vê é como o que não existe, e o inativo é recusado. A linha
 * fica travada para leitura, como as outras referências.
 */
async function conferirAtivo(
  tx: Transacao,
  ativoId: string,
  { acesso, arvore }: LeitorDoEstoque,
): Promise<{ ativo: AtivoDaSaida } | { recusa: 'nao-encontrado' | 'inativo' }> {
  const [linha] = await tx
    .select({
      id: ativos.id,
      nome: ativos.nome,
      patrimonio: ativos.patrimonio,
      localId: ativos.localId,
      situacao: ativos.situacao,
      tipo: { nome: tiposDeAtivo.nome },
      modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(eq(ativos.id, ativoId))
    .for('share', { of: ativos });
  if (!linha || !podeEm(acesso, 'ativos.ver', linha.localId, arvore)) {
    return { recusa: 'nao-encontrado' };
  }
  if (linha.situacao !== 'ativo') return { recusa: 'inativo' };
  return {
    ativo: {
      id: linha.id,
      rotulo: rotuloDoAtivo({ nome: linha.nome, modelo: linha.modelo, tipo: linha.tipo }),
      patrimonio: linha.patrimonio,
    },
  };
}

/**
 * O consumível, o fornecedor, o ativo e os locais que recebem o saldo: os que não existem são
 * recusados juntos (400), e depois os inativos que o tipo não aceita (409). As linhas ficam
 * travadas para leitura até o fim da transação: a inativação, que as trava para alterar, espera o
 * lançamento.
 */
async function conferirReferencias(
  tx: Transacao,
  dados: DadosDoLancamento,
  locaisDoLancamento: LocalDoLancamento[],
  leitor: LeitorDoEstoque,
) {
  const naoEncontrados: Partial<Record<CampoDoLancamento, string>> = {};
  const inativos: Partial<Record<CampoDoLancamento, string>> = {};
  const [consumivel] = await tx
    .select(COLUNAS_DO_CONSUMIVEL)
    .from(consumiveis)
    .where(eq(consumiveis.id, conferido(dados.consumivel)))
    .for('share');
  if (!consumivel) naoEncontrados.consumivel = 'Consumível não encontrado.';
  else if (consumivel.situacao !== 'ativo' && consumivelPrecisaEstarAtivo(dados)) {
    inativos.consumivel = MENSAGEM_DO_CONSUMIVEL_INATIVO;
  }
  let fornecedor: { id: string; nome: string } | null = null;
  if (dados.tipo === 'entrada') {
    const [linha] = await tx
      .select({ id: fornecedores.id, nome: fornecedores.nome, situacao: fornecedores.situacao })
      .from(fornecedores)
      .where(eq(fornecedores.id, conferido(dados.fornecedor)))
      .for('share');
    if (!linha) naoEncontrados.fornecedor = 'Fornecedor não encontrado.';
    else if (linha.situacao !== 'ativo') inativos.fornecedor = MENSAGEM_DO_FORNECEDOR_INATIVO;
    else fornecedor = { id: linha.id, nome: linha.nome };
  }
  let ativo: AtivoDaSaida | null = null;
  if (dados.tipo === 'saida') {
    const conferencia = await conferirAtivo(tx, conferido(dados.ativo), leitor);
    if ('ativo' in conferencia) ativo = conferencia.ativo;
    else if (conferencia.recusa === 'inativo') inativos.ativo = MENSAGEM_DO_ATIVO_INATIVO;
    else naoEncontrados.ativo = 'Ativo não encontrado.';
  }
  for (const { campo, id, recebe } of locaisDoLancamento) {
    if (!recebe) continue;
    const [local] = await tx
      .select({ situacao: locais.situacao })
      .from(locais)
      .where(eq(locais.id, id))
      .for('share');
    if (local?.situacao !== 'ativo') inativos[campo] = MENSAGEM_DO_LOCAL_INATIVO;
  }
  if (Object.keys(naoEncontrados).length > 0) throw dadosInvalidos(naoEncontrados);
  const [primeira, ...outras] = Object.values(inativos);
  if (primeira !== undefined) {
    throw conflito(outras.length === 0 ? primeira : 'Confira os campos indicados.', inativos);
  }
  if (!consumivel) throw new Error('O consumível não foi conferido.');
  return { consumivel, fornecedor, ativo };
}

/**
 * A diferença no saldo de um local. A negativa só vale com o saldo que basta: o `UPDATE` trava a
 * linha do par, e o lançamento ao mesmo tempo espera e confere a condição com o saldo novo. O
 * momento do abaixo do mínimo muda no mesmo comando: passa a valer quando o par entra abaixo,
 * continua enquanto ele fica e some quando ele sai.
 */
async function aplicarDiferenca(
  tx: Transacao,
  {
    consumivel,
    localId,
    diferenca,
    momento,
    arvore,
  }: {
    consumivel: { id: string; codigo: string };
    localId: string;
    diferenca: number;
    momento: Date;
    arvore: ArvoreDeLocais;
  },
) {
  const quando = sql`${momento.toISOString()}::timestamptz`;
  if (diferenca < 0) {
    const quantidade = -diferenca;
    const [linha] = await tx
      .update(saldosDoEstoque)
      .set({
        saldo: sql`${saldosDoEstoque.saldo} - ${quantidade}`,
        abaixoDesde: sql`case when ${saldosDoEstoque.minimo} > 0
          and ${saldosDoEstoque.saldo} - ${quantidade} < ${saldosDoEstoque.minimo}
          then coalesce(${saldosDoEstoque.abaixoDesde}, ${quando}) else null end`,
        atualizadoEm: momento,
      })
      .where(
        and(
          eq(saldosDoEstoque.consumivelId, consumivel.id),
          eq(saldosDoEstoque.localId, localId),
          gte(saldosDoEstoque.saldo, quantidade),
        ),
      )
      .returning();
    if (linha) return linha;
    // O saldo não basta: a recusa diz o saldo lido agora, que pode ser o de um lançamento mais novo.
    const [atual] = await tx
      .select({ saldo: saldosDoEstoque.saldo })
      .from(saldosDoEstoque)
      .where(
        and(eq(saldosDoEstoque.consumivelId, consumivel.id), eq(saldosDoEstoque.localId, localId)),
      );
    const mensagem = mensagemDoSaldo(consumivel.codigo, arvore.caminho(localId), atual?.saldo ?? 0);
    throw conflito(mensagem, { quantidade: mensagem });
  }
  const [linha] = await tx
    .insert(saldosDoEstoque)
    .values({
      orgId: sql`app.current_org()`,
      consumivelId: consumivel.id,
      localId,
      saldo: diferenca,
      atualizadoEm: momento,
    })
    .onConflictDoUpdate({
      target: [saldosDoEstoque.orgId, saldosDoEstoque.consumivelId, saldosDoEstoque.localId],
      set: {
        saldo: sql`${saldosDoEstoque.saldo} + excluded.saldo`,
        abaixoDesde: sql`case when ${saldosDoEstoque.minimo} > 0
          and ${saldosDoEstoque.saldo} + excluded.saldo < ${saldosDoEstoque.minimo}
          then coalesce(${saldosDoEstoque.abaixoDesde}, ${quando}) else null end`,
        atualizadoEm: momento,
      },
    })
    .returning();
  if (!linha) throw new Error('O saldo não foi gravado.');
  return linha;
}

/** O que a auditoria guarda da movimentação: os nomes de agora, sem os ids, e sem o que é vazio. */
function visaoDoMovimento(
  dados: DadosDoLancamento,
  {
    consumivel,
    fornecedor,
    ativo,
    contador,
    arvore,
  }: {
    consumivel: { codigo: string };
    fornecedor: { nome: string } | null;
    ativo: AtivoDaSaida | null;
    contador: { paginas: number; lidoEm: Date } | null;
    arvore: ArvoreDeLocais;
  },
) {
  const colunas = colunasDoTipo(dados);
  const visao: Record<string, unknown> = {
    consumivel: consumivel.codigo,
    quantidade: dados.quantidade,
    origem: 'origemId' in colunas && colunas.origemId ? arvore.caminho(colunas.origemId) : null,
    destino: 'destinoId' in colunas && colunas.destinoId ? arvore.caminho(colunas.destinoId) : null,
    fornecedor: fornecedor?.nome ?? null,
    notaFiscal: 'notaFiscal' in colunas ? colunas.notaFiscal : null,
    ativo: ativo ? [ativo.rotulo, ativo.patrimonio].filter(Boolean).join(' · ') : null,
    contador: contador?.paginas ?? null,
    contadorLidoEm: contador?.lidoEm.toISOString() ?? null,
    motivo: 'motivo' in colunas ? colunas.motivo : null,
    observacao: dados.observacao,
  };
  return Object.fromEntries(Object.entries(visao).filter(([, valor]) => valor !== null));
}

/** Lança a movimentação e devolve o lançamento lido, com os saldos que mudaram. */
export async function lancar(
  tx: Transacao,
  pedido: DadosDoLancamento,
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
): Promise<z.infer<typeof LancamentoDoEstoque>> {
  const { acesso, contaId } = sessaoDa(requisicao);
  const dados = limparLancamento(pedido);
  const erros = validarLancamento(dados);
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);

  const arvore = await lerArvore(tx);
  const locaisDoLancamento = locaisComOsCampos(dados);
  const semLocal = Object.fromEntries(
    locaisDoLancamento
      .filter(({ id }) => !arvore.local(id))
      .map(({ campo }) => [campo, 'Local não encontrado.']),
  );
  if (Object.keys(semLocal).length > 0) throw dadosInvalidos(semLocal);
  for (const { id } of locaisDoLancamento) {
    exigirEm(requisicao, 'estoque.movimentar', id, arvore);
  }

  const leitor: LeitorDoEstoque = { acesso, arvore };
  const { consumivel, fornecedor, ativo } = await conferirReferencias(
    tx,
    dados,
    locaisDoLancamento,
    leitor,
  );
  const contador = ativo ? await lerContador(tx, ativo.id) : null;

  // A transferência aplica as diferenças na ordem dos locais: duas em sentidos opostos não se travam.
  const efeitos = efeitoNosSaldos(dados);
  const porLocal = new Map<string, typeof saldosDoEstoque.$inferSelect>();
  for (const { local, diferenca } of [...efeitos].sort((a, b) => (a.local < b.local ? -1 : 1))) {
    porLocal.set(
      local,
      await aplicarDiferenca(tx, { consumivel, localId: local, diferenca, momento, arvore }),
    );
  }

  const [movimento] = await tx
    .insert(movimentosDoEstoque)
    .values({
      orgId: sql`app.current_org()`,
      tipo: dados.tipo,
      consumivelId: consumivel.id,
      quantidade: dados.quantidade ?? 0,
      observacao: dados.observacao,
      lancadoPor: contaId,
      momento,
      ...colunasDoTipo(dados),
      contadorPaginas: contador?.paginas ?? null,
      contadorLidoEm: contador?.lidoEm ?? null,
    })
    .returning({ id: movimentosDoEstoque.id });
  if (!movimento) throw new Error('A movimentação não foi lançada.');
  await registrarNaAuditoria(tx, {
    acao: `estoque.${dados.tipo}`,
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'consumivel', id: consumivel.id },
    depois: visaoDoMovimento(dados, { consumivel, fornecedor, ativo, contador, arvore }),
    origem: origemDa(requisicao),
    momento,
    saida: {
      publico: { permissao: 'estoque.ver', locais: efeitos.map(({ local }) => local) },
    },
  });

  const [lido] = await lerMovimentos(tx, leitor, {
    onde: eq(movimentosDoEstoque.id, movimento.id),
  });
  if (!lido) throw new Error('A movimentação lançada não foi lida.');
  return {
    movimento: lido,
    saldos: efeitos.flatMap(({ local }) => {
      const saldo = porLocal.get(local);
      return saldo ? [comoSaldo(saldo, consumivel, leitor)] : [];
    }),
  };
}
