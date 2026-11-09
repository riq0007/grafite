// O diretório na API (spec diretorio-ad; change integracao-ad-ldap, design, decisões 2 e 3): a
// configuração gravada, a conta de serviço aberta do Cofre só na hora da conexão e os mapeamentos
// dos grupos do AD para os grupos do Grafite.
import { X509Certificate } from 'node:crypto';
import { diretorios, grupos, mapeamentosDoDiretorio, segredos, type Transacao } from '@grafite/db';
import { blocosDoCertificado, nomeDoDn, TIPOS_DA_CONTA_DE_SERVICO } from '@grafite/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type ChavesDoCofre, decifrarSegredo } from '../cofre/cifra.ts';
import type { AcessoAoDiretorio } from './cliente.ts';

/** O segredo que serve de conta de serviço: um login ativo, com o usuário (o DN ou o UPN). */
export const serveDeContaDeServico = and(
  inArray(segredos.tipo, [...TIPOS_DA_CONTA_DE_SERVICO]),
  eq(segredos.situacao, 'ativo'),
  sql`btrim(coalesce(${segredos.identificador}, '')) <> ''`,
);

export type LinhaDoDiretorio = typeof diretorios.$inferSelect;

/** O diretório da organização, com o nome da conta de serviço no Cofre, ou `null`. */
export async function lerDiretorio(tx: Transacao) {
  const [linha] = await tx
    .select({ diretorio: diretorios, conta: { id: segredos.id, nome: segredos.nome } })
    .from(diretorios)
    .leftJoin(
      segredos,
      and(eq(segredos.orgId, diretorios.orgId), eq(segredos.id, diretorios.segredoId)),
    );
  return linha ?? null;
}

/**
 * A conta de serviço aberta: o usuário e a senha, ou `null` quando o segredo não serve. O que o
 * cofre não abre lança a SegredoQueNaoAbre, com a frase da spec.
 */
export async function abrirContaDeServico(
  tx: Transacao,
  { orgId, segredoId, chaves }: { orgId: string; segredoId: string; chaves: ChavesDoCofre },
): Promise<{ usuario: string; senha: string } | null> {
  const [segredo] = await tx
    .select({
      id: segredos.id,
      identificador: segredos.identificador,
      conteudoCifrado: segredos.conteudoCifrado,
      chaveCifrada: segredos.chaveCifrada,
      impressaoDaChaveMestra: segredos.impressaoDaChaveMestra,
    })
    .from(segredos)
    .where(and(eq(segredos.id, segredoId), serveDeContaDeServico));
  if (!segredo) return null;
  const { valor } = decifrarSegredo(segredo, chaves, { orgId, segredoId });
  return { usuario: (segredo.identificador ?? '').trim(), senha: valor };
}

/** A configuração e a conta de serviço, como o cliente do diretório recebe. */
export function acessoAoDiretorio(
  configuracao: Pick<
    LinhaDoDiretorio,
    | 'servidor'
    | 'baseDn'
    | 'atributoDoUsuario'
    | 'filtroDasPessoas'
    | 'conferirCertificado'
    | 'acDoServidor'
  >,
  conta: { usuario: string; senha: string },
): AcessoAoDiretorio {
  return {
    servidor: configuracao.servidor,
    baseDn: configuracao.baseDn,
    atributoDoUsuario: configuracao.atributoDoUsuario,
    filtroDasPessoas: configuracao.filtroDasPessoas,
    conferirCertificado: configuracao.conferirCertificado,
    acDoServidor: configuracao.acDoServidor,
    conta,
  };
}

/**
 * O certificado da AC que abre (change guia-do-diretorio, design, decisão 2): cada bloco em PEM tem
 * de ser um certificado X.509, como o TLS do Node o lê.
 */
export function certificadoQueAbre(pem: string): boolean {
  const blocos = blocosDoCertificado(pem);
  return (
    blocos.length > 0 &&
    blocos.every((bloco) => {
      try {
        return new X509Certificate(bloco).raw.length > 0;
      } catch {
        return false;
      }
    })
  );
}

/** Os mapeamentos, com o nome do grupo do AD e o do grupo do Grafite, pelo nome no AD. */
export async function lerMapeamentos(tx: Transacao) {
  const linhas = await tx
    .select({
      id: mapeamentosDoDiretorio.id,
      grupoDn: mapeamentosDoDiretorio.grupoDn,
      grupo: { id: grupos.id, nome: grupos.nome },
    })
    .from(mapeamentosDoDiretorio)
    .innerJoin(
      grupos,
      and(
        eq(grupos.orgId, mapeamentosDoDiretorio.orgId),
        eq(grupos.id, mapeamentosDoDiretorio.grupoId),
      ),
    )
    .orderBy(asc(mapeamentosDoDiretorio.grupoDnNormalizado));
  return linhas.map((linha) => ({ ...linha, nomeNoAd: nomeDoDn(linha.grupoDn) }));
}
