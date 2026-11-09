// O perfil Administrador pelo comando no servidor (spec perfis-e-grupos; design do F2b, decisão 8):
// toda organização nasce com ele, protegido e com todas as permissões, atribuído à primeira conta
// para a organização inteira; o comando também o dá a uma conta nova, para recuperar a
// administração de uma organização em que ninguém mais consegue administrar.
import { atribuicoes, perfis, type Transacao } from '@grafite/db';
import { montarArvore } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import { visaoDaAtribuicao } from '../acesso/atribuicoes.ts';
import { type Ator, registrarNaAuditoria } from '../auditoria.ts';
import { ErroDoComando } from './erros.ts';

const NOME = 'Administrador';
const DESCRICAO = 'Todas as permissões, inclusive as dos módulos que vierem.';

interface Contexto {
  ator: Ator;
  momento: Date;
}

/** Cria o Administrador da organização da transação. */
export async function semearAdministrador(
  tx: Transacao,
  { exigirDoisPassos }: { exigirDoisPassos: boolean },
  { ator, momento }: Contexto,
) {
  const [perfil] = await tx
    .insert(perfis)
    .values({
      orgId: sql`app.current_org()`,
      nome: NOME,
      nomeNormalizado: 'administrador',
      descricao: DESCRICAO,
      todasAsPermissoes: true,
      protegido: true,
      exigeDoisPassos: exigirDoisPassos,
      criadoEm: momento,
      atualizadoEm: momento,
    })
    .returning();
  if (!perfil) throw new Error('O perfil Administrador não foi criado.');
  await registrarNaAuditoria(tx, {
    acao: 'perfil.criado',
    ator,
    alvo: { tipo: 'perfil', id: perfil.id },
    depois: {
      nome: perfil.nome,
      descricao: perfil.descricao,
      permissoes: [],
      todasAsPermissoes: true,
      exigeDoisPassos: perfil.exigeDoisPassos,
      situacao: perfil.situacao,
    },
    momento,
  });
  return perfil;
}

/** Atribui o Administrador da organização à conta, para a organização inteira. */
export async function atribuirAdministrador(
  tx: Transacao,
  contaId: string,
  { ator, momento }: Contexto,
) {
  const [perfil] = await tx.select().from(perfis).where(eq(perfis.protegido, true));
  if (!perfil) throw new ErroDoComando(1, 'A organização não tem o perfil Administrador.');
  const [atribuicao] = await tx
    .insert(atribuicoes)
    .values({ orgId: sql`app.current_org()`, perfilId: perfil.id, contaId, criadaEm: momento })
    .returning();
  if (!atribuicao) throw new Error('O perfil Administrador não foi atribuído.');
  const lida = {
    id: atribuicao.id,
    perfilId: perfil.id,
    perfil: perfil.nome,
    contaId,
    grupoId: null,
    grupo: null,
    localId: null,
    encerradaEm: null,
  };
  await registrarNaAuditoria(tx, {
    acao: 'atribuicao.criada',
    ator,
    alvo: { tipo: 'conta', id: contaId },
    depois: visaoDaAtribuicao(lida, montarArvore([])),
    dados: { atribuicaoId: atribuicao.id, ignoradas: [] },
    momento,
  });
}
