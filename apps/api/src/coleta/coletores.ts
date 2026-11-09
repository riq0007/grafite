// Os coletores da organização (spec coletor-local, "Coletor da organização"; design do P2a, decisões 2
// e 9): o cadastro, pela tela ou pelo comando no servidor, com o token aleatório guardado só pelo
// hash, e o que a auditoria guarda de cada um, sem o token.
import { randomBytes } from 'node:crypto';
import { coletores, type Transacao } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { sql } from 'drizzle-orm';
import { hashDoToken } from '../acesso/sessoes.ts';
import { type Ator, registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { conflito } from '../problemas.ts';

export const NOME_DO_COLETOR_REPETIDO = 'Já existe um coletor com este nome.';

/** O token do coletor: 32 bytes aleatórios em base64url, mostrados uma vez só. */
export const novoTokenDoColetor = () => randomBytes(32).toString('base64url');

export type LinhaDoColetor = typeof coletores.$inferSelect;

/** O que a auditoria guarda do coletor: o nome, as faixas e a situação, nunca o token. */
export const visaoDoColetor = (coletor: LinhaDoColetor) => ({
  nome: coletor.nome,
  faixas: coletor.faixas,
  situacao: coletor.situacao,
});

/** A gravação que recusa o nome repetido na organização com 409, no campo do nome. */
export async function semNomeDeColetorRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'coletores_nome_unico')) {
      throw conflito(NOME_DO_COLETOR_REPETIDO, { nome: NOME_DO_COLETOR_REPETIDO });
    }
    throw erro;
  }
}

/** Cadastra o coletor na organização do contexto, com o token dado, a auditoria e o evento. */
export async function criarColetor(
  tx: Transacao,
  {
    nome,
    faixas,
    token,
    ator,
    origem,
    momento,
  }: {
    nome: string;
    faixas: readonly string[];
    token: string;
    ator: Ator;
    origem?: { ip?: string | null; codigoDeRastreio?: string | null };
    momento: Date;
  },
): Promise<LinhaDoColetor> {
  const [coletor] = await semNomeDeColetorRepetido(() =>
    tx
      .insert(coletores)
      .values({
        orgId: sql`app.current_org()`,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        tokenHash: hashDoToken(token),
        faixas: [...faixas],
        criadoPor: ator.tipo === 'conta' ? ator.contaId : null,
        criadoEm: momento,
        atualizadoEm: momento,
      })
      .returning(),
  );
  if (!coletor) throw new Error('O coletor não foi cadastrado.');
  await registrarNaAuditoria(tx, {
    acao: 'coletor.criado',
    ator,
    alvo: { tipo: 'coletor', id: coletor.id },
    depois: visaoDoColetor(coletor),
    ...(origem ? { origem } : {}),
    momento,
  });
  return coletor;
}
