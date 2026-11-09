// A leitura das solicitações (spec solicitacoes; change p4d-solicitacoes, design, decisões 6 e 7):
// várias de uma vez, com quem pediu e as contas pelo nome, as impressoras com o contador congelado e
// os itens com a entrega, o ativo, o tipo, o local e o fornecedor como referência, e se a conta
// atende cada uma.
import {
  ativos,
  consumiveis,
  contas,
  fornecedores,
  impressorasDasSolicitacoes,
  itensDasSolicitacoes,
  modelos,
  movimentosDoEstoque,
  ordensDeServico,
  pessoas,
  solicitacoes,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  atendeASolicitacao,
  CORES_DE_CONSUMIVEL,
  pode,
  podeEm,
  rotuloDoAtivo,
} from '@grafite/domain';
import { asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import type { AtivoDaSolicitacao, ItemDaSolicitacao, Solicitacao } from './esquemas.ts';

/** O que a leitura sabe da conta: o acesso e a árvore dos locais. */
export interface LeitorDasSolicitacoes {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
}

export type LinhaDaSolicitacao = typeof solicitacoes.$inferSelect;

const COLUNAS_DO_ATIVO = {
  id: ativos.id,
  nome: ativos.nome,
  patrimonio: ativos.patrimonio,
  localId: ativos.localId,
  tipo: { nome: tiposDeAtivo.nome },
  modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
};

/** Os ativos pelo id, com o rótulo do domínio, o patrimônio e se a conta abre a ficha. */
async function lerAtivos(
  tx: Transacao,
  ids: readonly string[],
  { acesso, arvore }: LeitorDasSolicitacoes,
): Promise<Map<string, z.infer<typeof AtivoDaSolicitacao>>> {
  if (ids.length === 0) return new Map();
  const linhas = await tx
    .select(COLUNAS_DO_ATIVO)
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(inArray(ativos.id, [...ids]));
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

/** Os nomes das contas, pela pessoa de cada uma. */
async function nomesDasContas(tx: Transacao, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const linhas = await tx
    .select({ id: contas.id, nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(inArray(contas.id, [...ids]));
  return new Map(linhas.map(({ id, nome }) => [id, nome]));
}

async function nomesPorId<T extends { id: string; nome: string }>(
  consulta: (ids: string[]) => Promise<T[]>,
  ids: readonly (string | null)[],
) {
  const existentes = [...new Set(ids.filter((id): id is string => id !== null))];
  if (existentes.length === 0) return new Map<string, string>();
  return new Map((await consulta(existentes)).map(({ id, nome }) => [id, nome]));
}

const naOrdemDasCores = (cor: string) => (CORES_DE_CONSUMIVEL as readonly string[]).indexOf(cor);

function conferido<T>(valor: T | undefined): T {
  if (valor === undefined) throw new Error('A referência da solicitação não foi lida.');
  return valor;
}

/** As solicitações dadas, na ordem dos ids, como a API as devolve. */
export async function lerSolicitacoes(
  tx: Transacao,
  leitor: LeitorDasSolicitacoes,
  ids: readonly string[],
): Promise<z.infer<typeof Solicitacao>[]> {
  if (ids.length === 0) return [];
  const { acesso, arvore } = leitor;
  const linhas = await tx
    .select()
    .from(solicitacoes)
    .where(inArray(solicitacoes.id, [...ids]));
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  const impressoras = await tx
    .select()
    .from(impressorasDasSolicitacoes)
    .where(inArray(impressorasDasSolicitacoes.solicitacaoId, [...ids]))
    .orderBy(asc(impressorasDasSolicitacoes.incluidaEm), asc(impressorasDasSolicitacoes.id));
  const itens = await tx
    .select({
      item: itensDasSolicitacoes,
      consumivel: { id: consumiveis.id, codigo: consumiveis.codigo, nome: consumiveis.nome },
      origemId: movimentosDoEstoque.origemId,
    })
    .from(itensDasSolicitacoes)
    .leftJoin(consumiveis, eq(consumiveis.id, itensDasSolicitacoes.consumivelId))
    .leftJoin(movimentosDoEstoque, eq(movimentosDoEstoque.id, itensDasSolicitacoes.movimentoId))
    .where(inArray(itensDasSolicitacoes.solicitacaoId, [...ids]));
  const ordens = new Map(
    (
      await tx
        .select({
          solicitacaoId: ordensDeServico.solicitacaoId,
          numero: ordensDeServico.numero,
          situacao: ordensDeServico.situacao,
          localId: ordensDeServico.localId,
        })
        .from(ordensDeServico)
        .where(inArray(ordensDeServico.solicitacaoId, [...ids]))
    ).map(({ solicitacaoId, numero, situacao, localId }) => [
      solicitacaoId,
      { numero, situacao, abrir: podeEm(acesso, 'ordens.ver', localId, arvore) },
    ]),
  );

  const ativosLidos = await lerAtivos(
    tx,
    [
      ...impressoras.map(({ ativoId }) => ativoId),
      ...linhas.flatMap(({ ativoId }) => (ativoId ? [ativoId] : [])),
    ],
    leitor,
  );
  const nomesDasPessoas = await nomesPorId(
    (lista) =>
      tx
        .select({ id: pessoas.id, nome: pessoas.nome })
        .from(pessoas)
        .where(inArray(pessoas.id, lista)),
    linhas.map(({ pessoaId }) => pessoaId),
  );
  const nomesDosTipos = await nomesPorId(
    (lista) =>
      tx
        .select({ id: tiposDeAtivo.id, nome: tiposDeAtivo.nome })
        .from(tiposDeAtivo)
        .where(inArray(tiposDeAtivo.id, lista)),
    linhas.map(({ tipoDeAtivoId }) => tipoDeAtivoId),
  );
  const nomesDosFornecedores = await nomesPorId(
    (lista) =>
      tx
        .select({ id: fornecedores.id, nome: fornecedores.nome })
        .from(fornecedores)
        .where(inArray(fornecedores.id, lista)),
    [
      ...linhas.map(({ fornecedorId }) => fornecedorId),
      ...itens.map(({ item }) => item.fornecedorId),
    ],
  );
  const nomesDeContas = await nomesDasContas(tx, [
    ...new Set([
      ...linhas.flatMap(({ registradaPor, encerradaPor }) =>
        encerradaPor ? [registradaPor, encerradaPor] : [registradaPor],
      ),
      ...itens.flatMap(({ item }) => (item.entreguePor ? [item.entreguePor] : [])),
    ]),
  ]);
  const verConsumiveis = pode(acesso, 'consumiveis.ver');
  const verFornecedores = pode(acesso, 'fornecedores.ver');
  const local = (id: string) => ({ id, caminho: arvore.caminho(id) });
  const conta = (id: string) => ({ id, nome: conferido(nomesDeContas.get(id)) });
  const fornecedor = (id: string | null) =>
    id === null
      ? null
      : { id, nome: conferido(nomesDosFornecedores.get(id)), abrir: verFornecedores };
  const atender = alcance(acesso, 'solicitacoes.atender', arvore);

  const comoItem = ({
    item,
    consumivel,
    origemId,
  }: (typeof itens)[number]): z.infer<typeof ItemDaSolicitacao> => ({
    id: item.id,
    cor: item.cor,
    quantidade: item.quantidade,
    consumivel: consumivel ? { ...consumivel, abrir: verConsumiveis } : null,
    entrega:
      item.origem === null || item.entreguePor === null || item.entregueEm === null
        ? null
        : {
            origem: item.origem,
            local: origemId ? local(origemId) : null,
            movimento: item.movimentoId,
            fornecedor: fornecedor(item.fornecedorId),
            entreguePor: conta(item.entreguePor),
            entregueEm: item.entregueEm.toISOString(),
          },
  });

  return ids.flatMap((id) => {
    const linha = porId.get(id);
    if (!linha) return [];
    const dela = impressoras.filter(({ solicitacaoId }) => solicitacaoId === id);
    return [
      {
        id: linha.id,
        numero: linha.numero,
        tipo: linha.tipo,
        situacao: linha.situacao,
        pessoa: { id: linha.pessoaId, nome: conferido(nomesDasPessoas.get(linha.pessoaId)) },
        observacao: linha.observacao,
        locais: linha.locais.map(local),
        semLocal: linha.semLocal,
        impressoras: dela.map((impressora) => ({
          ativo: conferido(ativosLidos.get(impressora.ativoId)),
          contador:
            impressora.contadorPaginas === null || impressora.contadorLidoEm === null
              ? null
              : {
                  paginas: impressora.contadorPaginas,
                  lidoEm: impressora.contadorLidoEm.toISOString(),
                },
          itens: itens
            .filter(
              ({ item }) => item.solicitacaoId === id && item.impressoraId === impressora.ativoId,
            )
            .sort((a, b) => naOrdemDasCores(a.item.cor) - naOrdemDasCores(b.item.cor))
            .map(comoItem),
        })),
        ativo: linha.ativoId ? conferido(ativosLidos.get(linha.ativoId)) : null,
        defeito: linha.defeito,
        tipoDeAtivo: linha.tipoDeAtivoId
          ? { id: linha.tipoDeAtivoId, nome: conferido(nomesDosTipos.get(linha.tipoDeAtivoId)) }
          : null,
        quantidade: linha.quantidade,
        motivo: linha.motivo,
        local: linha.localId ? local(linha.localId) : null,
        fornecedor: fornecedor(linha.fornecedorId),
        osDoFornecedor: linha.osDoFornecedor,
        oQueFoiFeito: linha.oQueFoiFeito,
        motivoDoCancelamento: linha.motivoDoCancelamento,
        registradaPor: conta(linha.registradaPor),
        registradaEm: linha.registradaEm.toISOString(),
        encerradaPor: linha.encerradaPor ? conta(linha.encerradaPor) : null,
        encerradaEm: linha.encerradaEm?.toISOString() ?? null,
        permite: { atender: atendeASolicitacao(atender, linha) },
        ordem: ordens.get(linha.id) ?? null,
      },
    ];
  });
}

/** A solicitação lida, que precisa existir. */
export async function lerSolicitacao(
  tx: Transacao,
  leitor: LeitorDasSolicitacoes,
  id: string,
): Promise<z.infer<typeof Solicitacao>> {
  const [lida] = await lerSolicitacoes(tx, leitor, [id]);
  if (!lida) throw new Error('A solicitação não foi lida.');
  return lida;
}
