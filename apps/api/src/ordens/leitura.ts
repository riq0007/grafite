// A leitura das ordens de serviço (spec ordens-de-servico; change p4e-ordens-de-servico, design,
// decisão 7): várias de uma vez, com o ativo, o local, a solicitação de origem, o fornecedor e as
// contas pelo nome, o histórico das situações, as peças com a saída do estoque e se a conta atende
// cada uma.
import {
  ativos,
  consumiveis,
  contas,
  fornecedores,
  historicoDasOrdens,
  modelos,
  ordensDeServico,
  pecasDasOrdens,
  pessoas,
  solicitacoes,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import { type Acesso, type ArvoreDeLocais, pode, podeEm, rotuloDoAtivo } from '@grafite/domain';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import type { AtivoDaOrdem, OrdemDeServico } from './esquemas.ts';

/** O que a leitura sabe da conta: o acesso e a árvore dos locais. */
export interface LeitorDasOrdens {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
}

export type LinhaDaOrdem = typeof ordensDeServico.$inferSelect;
export type OrdemLida = z.infer<typeof OrdemDeServico>;

/** Os ativos pelo id, com o rótulo do domínio, o patrimônio e se a conta abre a ficha. */
async function lerAtivos(
  tx: Transacao,
  ids: readonly string[],
  { acesso, arvore }: LeitorDasOrdens,
): Promise<Map<string, z.infer<typeof AtivoDaOrdem>>> {
  if (ids.length === 0) return new Map();
  const linhas = await tx
    .select({
      id: ativos.id,
      nome: ativos.nome,
      patrimonio: ativos.patrimonio,
      localId: ativos.localId,
      tipo: { nome: tiposDeAtivo.nome },
      modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(inArray(ativos.id, [...new Set(ids)]));
  return new Map(
    linhas.map((linha) => [
      linha.id,
      {
        id: linha.id,
        rotulo: rotuloDoAtivo({ nome: linha.nome, modelo: linha.modelo, tipo: linha.tipo }),
        patrimonio: linha.patrimonio,
        abrir: podeEm(acesso, 'ativos.ver', linha.localId, arvore),
      },
    ]),
  );
}

/** Os nomes de uma lista de ids, sem repetir a consulta. */
async function nomesPorId<T extends { id: string; nome: string }>(
  consulta: (ids: string[]) => Promise<T[]>,
  ids: readonly (string | null)[],
) {
  const existentes = [...new Set(ids.filter((id): id is string => id !== null))];
  if (existentes.length === 0) return new Map<string, string>();
  return new Map((await consulta(existentes)).map(({ id, nome }) => [id, nome]));
}

function conferido<T>(valor: T | undefined): T {
  if (valor === undefined) throw new Error('A referência da OS não foi lida.');
  return valor;
}

/** As OS dadas, na ordem dos ids, como a API as devolve. */
export async function lerOrdens(
  tx: Transacao,
  leitor: LeitorDasOrdens,
  ids: readonly string[],
): Promise<OrdemLida[]> {
  if (ids.length === 0) return [];
  const { acesso, arvore } = leitor;
  const linhas = await tx
    .select()
    .from(ordensDeServico)
    .where(inArray(ordensDeServico.id, [...ids]));
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  const historico = await tx
    .select()
    .from(historicoDasOrdens)
    .where(inArray(historicoDasOrdens.ordemId, [...ids]))
    .orderBy(desc(historicoDasOrdens.mudadaEm), desc(historicoDasOrdens.id));
  const pecas = await tx
    .select({
      peca: pecasDasOrdens,
      consumivel: { id: consumiveis.id, codigo: consumiveis.codigo, nome: consumiveis.nome },
    })
    .from(pecasDasOrdens)
    .innerJoin(consumiveis, eq(consumiveis.id, pecasDasOrdens.consumivelId))
    .where(inArray(pecasDasOrdens.ordemId, [...ids]))
    .orderBy(asc(pecasDasOrdens.lancadaEm), asc(pecasDasOrdens.id));
  const deOrigem = await solicitacoesDeOrigem(
    tx,
    linhas.map(({ solicitacaoId }) => solicitacaoId),
  );

  const ativosLidos = await lerAtivos(
    tx,
    linhas.map(({ ativoId }) => ativoId),
    leitor,
  );
  const nomesDosFornecedores = await nomesPorId(
    (lista) =>
      tx
        .select({ id: fornecedores.id, nome: fornecedores.nome })
        .from(fornecedores)
        .where(inArray(fornecedores.id, lista)),
    [
      ...linhas.map(({ fornecedorId }) => fornecedorId),
      ...historico.map(({ fornecedorId }) => fornecedorId),
    ],
  );
  const nomesDasContas = await nomesPorId(
    (lista) =>
      tx
        .select({ id: contas.id, nome: pessoas.nome })
        .from(contas)
        .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
        .where(inArray(contas.id, lista)),
    [
      ...linhas.flatMap(({ abertaPor, resolvidaPor, encerradaPor }) => [
        abertaPor,
        resolvidaPor,
        encerradaPor,
      ]),
      ...historico.map(({ mudadaPor }) => mudadaPor),
      ...pecas.map(({ peca }) => peca.lancadaPor),
    ],
  );
  const verConsumiveis = pode(acesso, 'consumiveis.ver');
  const verFornecedores = pode(acesso, 'fornecedores.ver');
  const local = (id: string) => ({ id, caminho: arvore.caminho(id) });
  const conta = (id: string) => ({ id, nome: conferido(nomesDasContas.get(id)) });
  const fornecedor = (id: string | null) =>
    id === null
      ? null
      : { id, nome: conferido(nomesDosFornecedores.get(id)), abrir: verFornecedores };

  return ids.flatMap((id) => {
    const linha = porId.get(id);
    if (!linha) return [];
    return [
      {
        id: linha.id,
        numero: linha.numero,
        situacao: linha.situacao,
        ativo: conferido(ativosLidos.get(linha.ativoId)),
        local: linha.localId ? local(linha.localId) : null,
        solicitacao: linha.solicitacaoId ? conferido(deOrigem.get(linha.solicitacaoId)) : null,
        problema: linha.problema,
        fornecedor: fornecedor(linha.fornecedorId),
        osDoFornecedor: linha.osDoFornecedor,
        solucao: linha.solucao,
        motivoDoEncerramento: linha.motivoDoEncerramento,
        abertaPor: conta(linha.abertaPor),
        abertaEm: linha.abertaEm.toISOString(),
        resolvidaPor: linha.resolvidaPor ? conta(linha.resolvidaPor) : null,
        resolvidaEm: linha.resolvidaEm?.toISOString() ?? null,
        encerradaPor: linha.encerradaPor ? conta(linha.encerradaPor) : null,
        encerradaEm: linha.encerradaEm?.toISOString() ?? null,
        historico: historico
          .filter(({ ordemId }) => ordemId === id)
          .map((mudanca) => ({
            id: mudanca.id,
            situacao: mudanca.situacao,
            texto: mudanca.texto,
            fornecedor: fornecedor(mudanca.fornecedorId),
            mudadaPor: conta(mudanca.mudadaPor),
            mudadaEm: mudanca.mudadaEm.toISOString(),
          })),
        pecas: pecas
          .filter(({ peca }) => peca.ordemId === id)
          .map(({ peca, consumivel }) => ({
            id: peca.id,
            consumivel: { ...consumivel, abrir: verConsumiveis },
            quantidade: peca.quantidade,
            local: local(peca.localId),
            movimento: peca.movimentoId,
            lancadaPor: conta(peca.lancadaPor),
            lancadaEm: peca.lancadaEm.toISOString(),
          })),
        permite: { atender: podeEm(acesso, 'ordens.atender', linha.localId, arvore) },
      },
    ];
  });
}

/** As solicitações de origem pelo id, com o número e quem pediu. */
async function solicitacoesDeOrigem(tx: Transacao, ids: readonly (string | null)[]) {
  const existentes = [...new Set(ids.filter((id): id is string => id !== null))];
  if (existentes.length === 0) return new Map<string, NonNullable<OrdemLida['solicitacao']>>();
  const linhas = await tx
    .select({
      id: solicitacoes.id,
      numero: solicitacoes.numero,
      pessoa: { id: pessoas.id, nome: pessoas.nome },
    })
    .from(solicitacoes)
    .innerJoin(pessoas, eq(pessoas.id, solicitacoes.pessoaId))
    .where(inArray(solicitacoes.id, existentes));
  return new Map(linhas.map((linha) => [linha.id, linha]));
}

/** A OS lida, que precisa existir. */
export async function lerOrdem(
  tx: Transacao,
  leitor: LeitorDasOrdens,
  id: string,
): Promise<OrdemLida> {
  const [lida] = await lerOrdens(tx, leitor, [id]);
  if (!lida) throw new Error('A OS não foi lida.');
  return lida;
}
