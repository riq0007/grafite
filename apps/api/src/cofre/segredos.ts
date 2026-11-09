// Os segredos do cofre (spec cofre-de-segredos, "Segredo" e "Vínculos com a pessoa e os ativos";
// design do P6, decisões 3 e 6): a leitura pelo que a conta vê, os ativos ligados com o rótulo, o
// que a auditoria guarda de cada segredo, nunca o valor, e a conferência dos vínculos novos.
import {
  ativos,
  modelos,
  pessoas,
  segredos,
  segredosDosAtivos,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import { type Acesso, alcancaOSegredo, pode, rotuloDoAtivo } from '@grafite/domain';
import { and, eq, inArray } from 'drizzle-orm';
import {
  COLUNAS_DO_ATIVO,
  consultarAtivos,
  doModelo,
  doResponsavel,
  doTipo,
} from '../ativos/leitura.ts';
import { dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { acessoDoSegredo, type TitularComNome, titularesDaConta } from './titulares.ts';

export type LinhaDoSegredo = typeof segredos.$inferSelect;

export const segredoNaoEncontrado = () => naoEncontrado('Segredo não encontrado.');

export const PESSOA_INATIVA = 'A pessoa escolhida está inativa. Escolha uma pessoa ativa.';

export interface AtivoDoSegredo {
  id: string;
  rotulo: string;
  patrimonio: string | null;
}

/** Os ativos ligados a cada segredo, pelo rótulo. */
export async function ativosDosSegredos(
  tx: Transacao,
  segredoIds: readonly string[],
): Promise<Map<string, AtivoDoSegredo[]>> {
  const porSegredo = new Map<string, AtivoDoSegredo[]>();
  if (segredoIds.length === 0) return porSegredo;
  const linhas = await tx
    .select({ ...COLUNAS_DO_ATIVO, segredoId: segredosDosAtivos.segredoId })
    .from(segredosDosAtivos)
    .innerJoin(
      ativos,
      and(eq(ativos.orgId, segredosDosAtivos.orgId), eq(ativos.id, segredosDosAtivos.ativoId)),
    )
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo)
    .leftJoin(pessoas, doResponsavel)
    .where(inArray(segredosDosAtivos.segredoId, [...segredoIds]));
  for (const linha of linhas) {
    const lista = porSegredo.get(linha.segredoId) ?? [];
    lista.push({
      id: linha.ativo.id,
      rotulo: rotuloDoAtivo({ nome: linha.ativo.nome, modelo: linha.modelo, tipo: linha.tipo }),
      patrimonio: linha.ativo.patrimonio,
    });
    porSegredo.set(linha.segredoId, lista);
  }
  for (const lista of porSegredo.values()) {
    lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  }
  return porSegredo;
}

/** O que a auditoria guarda de um segredo: os dados e os vínculos, nunca o valor nem a chave. */
export function visaoDoSegredo(linha: LinhaDoSegredo, ativoIds: readonly string[]) {
  return {
    nome: linha.nome,
    tipo: linha.tipo,
    classificacao: linha.classificacao,
    identificador: linha.identificador,
    endereco: linha.endereco,
    notas: linha.notas,
    validade: linha.validade,
    proximaRotacao: linha.proximaRotacao,
    pessoaId: linha.pessoaId,
    ativoIds: [...ativoIds].sort(),
    situacao: linha.situacao,
  };
}

/**
 * O vínculo novo aponta uma pessoa ativa e ativos ativos; o que já existe continua com a pessoa ou
 * o ativo inativado.
 */
export async function conferirVinculos(
  tx: Transacao,
  pedidos: { pessoaId: string | null; ativoIds: readonly string[] },
  atuais: { pessoaId: string | null; ativoIds: readonly string[] },
) {
  if (pedidos.pessoaId !== null && pedidos.pessoaId !== atuais.pessoaId) {
    const [pessoa] = await tx
      .select({ situacao: pessoas.situacao })
      .from(pessoas)
      .where(eq(pessoas.id, pedidos.pessoaId));
    if (!pessoa) throw dadosInvalidos({ pessoaId: 'Pessoa não encontrada.' });
    if (pessoa.situacao !== 'ativa') throw dadosInvalidos({ pessoaId: PESSOA_INATIVA });
  }
  const novos = pedidos.ativoIds.filter((id) => !atuais.ativoIds.includes(id));
  if (novos.length === 0) return;
  const linhas = await consultarAtivos(tx).where(inArray(ativos.id, novos));
  const porId = new Map(linhas.map((linha) => [linha.ativo.id, linha]));
  for (const id of novos) {
    const linha = porId.get(id);
    if (!linha) throw dadosInvalidos({ ativoIds: 'Ativo não encontrado.' });
    if (linha.ativo.situacao !== 'ativo') {
      const nome =
        linha.ativo.patrimonio ??
        rotuloDoAtivo({ nome: linha.ativo.nome, modelo: linha.modelo, tipo: linha.tipo });
      throw dadosInvalidos({ ativoIds: `O ativo ${nome} está inativo.` });
    }
  }
}

/** O segredo como a conta o vê, com o acesso dele e se ela o alcança. */
export interface SegredoVisto {
  linha: LinhaDoSegredo;
  acesso: TitularComNome[];
  /** A conta administra o cofre: vê todos os segredos e o acesso de cada um. */
  administra: boolean;
  /** A conta está entre os titulares do acesso. */
  alcanca: boolean;
}

/**
 * O segredo pelo id, se a conta o vê: quem administra vê todos; quem só usa, os ativos que alcança.
 * O que ela não vê não existe para ela (404). Com `travar`, a linha fica presa até o fim.
 */
export async function lerSegredoVisto(
  tx: Transacao,
  id: string,
  { contaId, acesso }: { contaId: string; acesso: Acesso },
  { travar = false } = {},
): Promise<SegredoVisto> {
  const consulta = tx.select().from(segredos).where(eq(segredos.id, id));
  const [linha] = travar ? await consulta.for('update') : await consulta;
  if (!linha) throw segredoNaoEncontrado();
  const administra = pode(acesso, 'cofre.administrar');
  const titulares = await acessoDoSegredo(tx, id);
  const alcanca = alcancaOSegredo(titulares, await titularesDaConta(tx, contaId));
  if (!administra && (linha.situacao !== 'ativo' || !alcanca)) throw segredoNaoEncontrado();
  return { linha, acesso: titulares, administra, alcanca };
}
