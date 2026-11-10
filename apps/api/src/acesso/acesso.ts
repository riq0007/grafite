// O acesso efetivo de uma conta (design do F2b, decisão 5): as atribuições em vigor, diretas e pelos
// grupos de que ela participa, com os perfis, lidas a cada requisição e resolvidas pelo domínio.
// Uma conta inativa, ou de uma pessoa inativa, não tem acesso nenhum.
import {
  atribuicoes,
  contas,
  grupos,
  membrosDoGrupo,
  perfis,
  pessoas,
  type Transacao,
} from '@grafite/db';
import {
  type Acesso,
  type AtribuicaoParaAcesso,
  resolverAcesso,
  SEM_ACESSO,
} from '@grafite/domain';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

const colunasDoPerfil = {
  id: perfis.id,
  nome: perfis.nome,
  situacao: perfis.situacao,
  permissoes: perfis.permissoes,
  todasAsPermissoes: perfis.todasAsPermissoes,
  exigeDoisPassos: perfis.exigeDoisPassos,
  diasDeConfianca: perfis.diasDeConfianca,
};

export async function carregarAcesso(tx: Transacao, contaId: string): Promise<Acesso> {
  const [conta] = await tx
    .select({ conta: contas.situacao, pessoa: pessoas.situacao })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(eq(contas.id, contaId));
  if (conta?.conta !== 'ativa' || conta.pessoa !== 'ativa') return SEM_ACESSO;

  const diretas = await tx
    .select({ id: atribuicoes.id, localId: atribuicoes.localId, perfil: colunasDoPerfil })
    .from(atribuicoes)
    .innerJoin(
      perfis,
      and(eq(perfis.orgId, atribuicoes.orgId), eq(perfis.id, atribuicoes.perfilId)),
    )
    .where(and(eq(atribuicoes.contaId, contaId), isNull(atribuicoes.encerradaEm)));

  const pelosGrupos = await tx
    .select({
      id: atribuicoes.id,
      localId: atribuicoes.localId,
      perfil: colunasDoPerfil,
      grupo: { id: grupos.id, nome: grupos.nome, situacao: grupos.situacao },
    })
    .from(membrosDoGrupo)
    .innerJoin(
      grupos,
      and(eq(grupos.orgId, membrosDoGrupo.orgId), eq(grupos.id, membrosDoGrupo.grupoId)),
    )
    .innerJoin(
      atribuicoes,
      and(
        eq(atribuicoes.orgId, membrosDoGrupo.orgId),
        eq(atribuicoes.grupoId, membrosDoGrupo.grupoId),
      ),
    )
    .innerJoin(
      perfis,
      and(eq(perfis.orgId, atribuicoes.orgId), eq(perfis.id, atribuicoes.perfilId)),
    )
    .where(
      and(
        eq(membrosDoGrupo.contaId, contaId),
        isNull(membrosDoGrupo.encerradaEm),
        isNull(atribuicoes.encerradaEm),
      ),
    );

  const linhas: AtribuicaoParaAcesso[] = [
    ...diretas.map((linha) => ({
      id: linha.id,
      perfil: linha.perfil,
      localId: linha.localId,
      encerrada: false,
      origem: { tipo: 'conta' } as const,
    })),
    ...pelosGrupos.map((linha) => ({
      id: linha.id,
      perfil: linha.perfil,
      localId: linha.localId,
      encerrada: false,
      origem: {
        tipo: 'grupo',
        grupoId: linha.grupo.id,
        grupoNome: linha.grupo.nome,
        grupoAtivo: linha.grupo.situacao === 'ativo',
        participacaoEncerrada: false,
      } as const,
    })),
  ];
  return resolverAcesso(linhas);
}

/**
 * O acesso de cada conta ativa, de pessoa ativa, da organização do contexto, numa leitura só das
 * atribuições diretas e de outra das dos grupos (design do P3b, decisão 3): a avaliação dos
 * alertas decide quem recebe cada notificação sem uma consulta por conta.
 */
export async function carregarAcessosDaOrganizacao(
  tx: Transacao,
): Promise<{ id: string; acesso: Acesso }[]> {
  const ativas = await tx
    .select({ id: contas.id })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(and(eq(contas.situacao, 'ativa'), eq(pessoas.situacao, 'ativa')));
  if (ativas.length === 0) return [];

  const diretas = await tx
    .select({
      contaId: atribuicoes.contaId,
      id: atribuicoes.id,
      localId: atribuicoes.localId,
      perfil: colunasDoPerfil,
    })
    .from(atribuicoes)
    .innerJoin(
      perfis,
      and(eq(perfis.orgId, atribuicoes.orgId), eq(perfis.id, atribuicoes.perfilId)),
    )
    .where(and(isNotNull(atribuicoes.contaId), isNull(atribuicoes.encerradaEm)));

  const pelosGrupos = await tx
    .select({
      contaId: membrosDoGrupo.contaId,
      id: atribuicoes.id,
      localId: atribuicoes.localId,
      perfil: colunasDoPerfil,
      grupo: { id: grupos.id, nome: grupos.nome, situacao: grupos.situacao },
    })
    .from(membrosDoGrupo)
    .innerJoin(
      grupos,
      and(eq(grupos.orgId, membrosDoGrupo.orgId), eq(grupos.id, membrosDoGrupo.grupoId)),
    )
    .innerJoin(
      atribuicoes,
      and(
        eq(atribuicoes.orgId, membrosDoGrupo.orgId),
        eq(atribuicoes.grupoId, membrosDoGrupo.grupoId),
      ),
    )
    .innerJoin(
      perfis,
      and(eq(perfis.orgId, atribuicoes.orgId), eq(perfis.id, atribuicoes.perfilId)),
    )
    .where(and(isNull(membrosDoGrupo.encerradaEm), isNull(atribuicoes.encerradaEm)));

  const porConta = new Map<string, AtribuicaoParaAcesso[]>(ativas.map(({ id }) => [id, []]));
  for (const linha of diretas) {
    porConta.get(linha.contaId ?? '')?.push({
      id: linha.id,
      perfil: linha.perfil,
      localId: linha.localId,
      encerrada: false,
      origem: { tipo: 'conta' },
    });
  }
  for (const linha of pelosGrupos) {
    porConta.get(linha.contaId)?.push({
      id: linha.id,
      perfil: linha.perfil,
      localId: linha.localId,
      encerrada: false,
      origem: {
        tipo: 'grupo',
        grupoId: linha.grupo.id,
        grupoNome: linha.grupo.nome,
        grupoAtivo: linha.grupo.situacao === 'ativo',
        participacaoEncerrada: false,
      },
    });
  }
  return [...porConta].map(([id, linhas]) => ({ id, acesso: resolverAcesso(linhas) }));
}

/** A conta exige os dois passos: por ela mesma ou por um perfil em vigor. */
export const exigeDoisPassos = (conta: { exigeDoisPassos: boolean }, acesso: Acesso) =>
  conta.exigeDoisPassos || acesso.exigeDoisPassos;
