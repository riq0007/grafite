// Quem alcança cada segredo (spec cofre-de-segredos, "Acesso ao segredo"; design do P6, decisão 3):
// os titulares da conta, lidos a cada requisição, são ela mesma, os grupos ativos de que participa e
// os perfis ativos das atribuições em vigor dela, diretas e pelos grupos, em qualquer escopo. A lista
// filtra pelo alcance numa subconsulta; o segredo lido sozinho passa pela regra do domínio.
import {
  acessosAosSegredos,
  atribuicoes,
  contas,
  grupos,
  membrosDoGrupo,
  perfis,
  pessoas,
  segredos,
  type Transacao,
} from '@grafite/db';
import type { AcessoAoSegredo, TipoDeTitular, TitularesDaConta } from '@grafite/domain';
import { and, asc, eq, exists, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { dadosInvalidos } from '../problemas.ts';

export async function titularesDaConta(tx: Transacao, contaId: string): Promise<TitularesDaConta> {
  const dosGrupos = await tx
    .select({ id: grupos.id })
    .from(membrosDoGrupo)
    .innerJoin(
      grupos,
      and(eq(grupos.orgId, membrosDoGrupo.orgId), eq(grupos.id, membrosDoGrupo.grupoId)),
    )
    .where(
      and(
        eq(membrosDoGrupo.contaId, contaId),
        isNull(membrosDoGrupo.encerradaEm),
        eq(grupos.situacao, 'ativo'),
      ),
    );
  const grupoIds = dosGrupos.map((grupo) => grupo.id);
  const dosPerfis = await tx
    .selectDistinct({ id: perfis.id })
    .from(atribuicoes)
    .innerJoin(
      perfis,
      and(eq(perfis.orgId, atribuicoes.orgId), eq(perfis.id, atribuicoes.perfilId)),
    )
    .where(
      and(
        isNull(atribuicoes.encerradaEm),
        eq(perfis.situacao, 'ativo'),
        or(eq(atribuicoes.contaId, contaId), inArray(atribuicoes.grupoId, grupoIds)),
      ),
    );
  return { contaId, grupos: grupoIds, perfis: dosPerfis.map((perfil) => perfil.id) };
}

/** A condição da lista: o segredo da linha está liberado a algum dos titulares. */
export function alcancadoPor(tx: Transacao, { contaId, grupos, perfis }: TitularesDaConta): SQL {
  return exists(
    tx
      .select({ um: sql`1` })
      .from(acessosAosSegredos)
      .where(
        and(
          eq(acessosAosSegredos.segredoId, segredos.id),
          or(
            eq(acessosAosSegredos.contaId, contaId),
            inArray(acessosAosSegredos.grupoId, [...grupos]),
            inArray(acessosAosSegredos.perfilId, [...perfis]),
          ),
        ),
      ),
  );
}

/** Um titular do acesso, pelo nome: a pessoa da conta, o grupo ou o perfil. */
export interface TitularComNome extends AcessoAoSegredo {
  nome: string;
}

const ORDEM_DOS_TIPOS: Record<TipoDeTitular, number> = { conta: 0, grupo: 1, perfil: 2 };

/** Os titulares do acesso de um segredo, pelo tipo (contas, grupos e perfis) e pelo nome. */
export async function acessoDoSegredo(tx: Transacao, segredoId: string): Promise<TitularComNome[]> {
  const linhas = await tx
    .select({
      contaId: acessosAosSegredos.contaId,
      grupoId: acessosAosSegredos.grupoId,
      perfilId: acessosAosSegredos.perfilId,
      pessoa: pessoas.nome,
      grupo: grupos.nome,
      perfil: perfis.nome,
    })
    .from(acessosAosSegredos)
    .leftJoin(
      contas,
      and(eq(contas.orgId, acessosAosSegredos.orgId), eq(contas.id, acessosAosSegredos.contaId)),
    )
    .leftJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .leftJoin(
      grupos,
      and(eq(grupos.orgId, acessosAosSegredos.orgId), eq(grupos.id, acessosAosSegredos.grupoId)),
    )
    .leftJoin(
      perfis,
      and(eq(perfis.orgId, acessosAosSegredos.orgId), eq(perfis.id, acessosAosSegredos.perfilId)),
    )
    .where(eq(acessosAosSegredos.segredoId, segredoId))
    .orderBy(asc(acessosAosSegredos.concedidoEm));
  const titulares = linhas.map((linha): TitularComNome => {
    if (linha.contaId) return { tipo: 'conta', id: linha.contaId, nome: linha.pessoa ?? '' };
    if (linha.grupoId) return { tipo: 'grupo', id: linha.grupoId, nome: linha.grupo ?? '' };
    return { tipo: 'perfil', id: linha.perfilId ?? '', nome: linha.perfil ?? '' };
  });
  return titulares.sort(
    (a, b) =>
      ORDEM_DOS_TIPOS[a.tipo] - ORDEM_DOS_TIPOS[b.tipo] || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

const MENSAGEM_DO_INATIVO: Record<TipoDeTitular, (nome: string) => string> = {
  conta: (nome) => `A conta de ${nome} está inativa.`,
  grupo: (nome) => `O grupo ${nome} está inativo.`,
  perfil: (nome) => `O perfil ${nome} está inativo.`,
};

/**
 * O titular novo existe e está ativo; o que já estava no acesso continua, mesmo inativado, como os
 * vínculos do segredo.
 */
export async function conferirTitulares(
  tx: Transacao,
  pedidos: readonly AcessoAoSegredo[],
  atuais: readonly AcessoAoSegredo[],
) {
  const jaEstao = new Set(atuais.map(({ tipo, id }) => `${tipo}:${id}`));
  const novos = pedidos.filter(({ tipo, id }) => !jaEstao.has(`${tipo}:${id}`));
  const idsDo = (tipo: TipoDeTitular) => novos.filter((t) => t.tipo === tipo).map((t) => t.id);
  const encontrados = new Map<string, { nome: string; ativo: boolean }>();
  const dasContas = await tx
    .select({
      id: contas.id,
      nome: pessoas.nome,
      conta: contas.situacao,
      pessoa: pessoas.situacao,
    })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(inArray(contas.id, idsDo('conta')));
  for (const conta of dasContas) {
    encontrados.set(`conta:${conta.id}`, {
      nome: conta.nome,
      ativo: conta.conta === 'ativa' && conta.pessoa === 'ativa',
    });
  }
  for (const [tipo, tabela] of [
    ['grupo', grupos],
    ['perfil', perfis],
  ] as const) {
    const linhas = await tx
      .select({ id: tabela.id, nome: tabela.nome, situacao: tabela.situacao })
      .from(tabela)
      .where(inArray(tabela.id, idsDo(tipo)));
    for (const linha of linhas) {
      encontrados.set(`${tipo}:${linha.id}`, {
        nome: linha.nome,
        ativo: linha.situacao === 'ativo',
      });
    }
  }
  for (const { tipo, id } of novos) {
    const titular = encontrados.get(`${tipo}:${id}`);
    if (!titular) throw dadosInvalidos({ titulares: 'Titular não encontrado.' });
    if (!titular.ativo)
      throw dadosInvalidos({ titulares: MENSAGEM_DO_INATIVO[tipo](titular.nome) });
  }
}
