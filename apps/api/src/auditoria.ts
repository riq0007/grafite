// A auditoria única (design do F2a, decisão 10): todo registro é gravado na mesma transação do
// dado, pelo `tx` da naOrganizacao, e nunca leva senha, hash, token, chave ou código de verificação.
// A pessoa e a conta entram pelas visões auditáveis, que já deixam esses campos de fora.
import { auditoria, type contas, type pessoas, type Transacao } from '@grafite/db';
import {
  type AcaoComPublicoDado,
  type AcaoDaAuditoria,
  type AlvoDoEvento,
  acaoConhecida,
  EVENTO_DA_ACAO,
  type PublicoDoEvento,
  publicoDerivado,
} from '@grafite/domain';
import { sql } from 'drizzle-orm';
import { registrarEvento } from './eventos/saida.ts';

export type Ator =
  | { tipo: 'conta'; contaId: string }
  | { tipo: 'sistema'; descricao: string }
  | { tipo: 'anonimo' };

/** O evento de saída de uma ação, com o público e, se não for o da auditoria, o alvo. */
export interface SaidaDoEvento {
  publico: PublicoDoEvento;
  alvo?: AlvoDoEvento;
}

interface RegistroDeAuditoria {
  /**
   * "assunto.verbo", como `sessao.encerrada`: só as do catálogo, que têm rótulo na consulta
   * (design do F2b, decisão 13). Uma ação nova entra antes em `ACOES_DA_AUDITORIA`.
   */
  acao: AcaoDaAuditoria;
  ator: Ator;
  alvo: { tipo: string; id?: string | null };
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  dados?: Record<string, unknown> | null;
  origem?: { ip?: string | null; codigoDeRastreio?: string | null };
  /** Do relógio da aplicação, como as regras que o registro descreve. */
  momento: Date;
  /**
   * O evento de saída da ação (design do F2c, decisão 9), quando quem grava diz o público, como o
   * das pessoas, ou um alvo diferente do da auditoria. Sem ele, o público sai do tipo e do alvo.
   */
  saida?: SaidaDoEvento;
}

/**
 * Um registro de auditoria. Nas ações cujo evento depende de quem grava, como as das pessoas, o
 * público do evento é obrigatório: o TypeScript recusa a chamada sem ele, e a gravação também.
 */
export type EventoDeAuditoria =
  | (RegistroDeAuditoria & { acao: Exclude<AcaoDaAuditoria, AcaoComPublicoDado> })
  | (RegistroDeAuditoria & { acao: AcaoComPublicoDado; saida: SaidaDoEvento });

/** Chaves que nunca vão para a auditoria, em qualquer nível do antes, do depois ou dos dados. */
const CHAVES_PROIBIDAS = new Set([
  'senha',
  'senhaAtual',
  'senhaNova',
  'hash',
  'hashSenha',
  'token',
  'tokenHash',
  'tokenCsrf',
  'csrf',
  'segredo',
  'segredoCifrado',
  'chave',
  'chaveDoApp',
  'codigo',
  'codigos',
  'codigosDeRecuperacao',
]);

function conferirSemSegredos(valor: unknown, caminho: string): void {
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => {
      conferirSemSegredos(item, `${caminho}[${i}]`);
    });
    return;
  }
  if (valor === null || typeof valor !== 'object' || valor instanceof Date) return;
  for (const [chave, interno] of Object.entries(valor)) {
    if (CHAVES_PROIBIDAS.has(chave)) {
      throw new Error(`O campo ${caminho}.${chave} não pode ir para a auditoria.`);
    }
    conferirSemSegredos(interno, `${caminho}.${chave}`);
  }
}

/**
 * Grava o registro na transação dada: se o dado ou o registro falhar, os dois são desfeitos. A
 * organização é a do contexto da transação, a mesma que o RLS confere.
 */
export async function registrarNaAuditoria(tx: Transacao, evento: EventoDeAuditoria) {
  const { acao, ator, alvo, antes, depois, dados, origem, momento, saida } = evento;
  conferirSemSegredos({ antes, depois, dados }, 'registro');
  if (!acaoConhecida(acao)) {
    throw new Error(`A ação ${acao} não tem rótulo em ACOES_DA_AUDITORIA.`);
  }
  await tx.insert(auditoria).values({
    orgId: sql`app.current_org()`,
    momento,
    acao,
    atorTipo: ator.tipo,
    atorContaId: ator.tipo === 'conta' ? ator.contaId : null,
    atorDescricao: ator.tipo === 'sistema' ? ator.descricao : null,
    alvoTipo: alvo.tipo,
    alvoId: alvo.id ?? null,
    antes: antes ?? null,
    depois: depois ?? null,
    dados: dados ?? null,
    ip: origem?.ip ?? null,
    codigoDeRastreio: origem?.codigoDeRastreio ?? null,
  });
  // O evento de saída vai na mesma transação: não existe mudança auditada sem o aviso às telas.
  const tipo = EVENTO_DA_ACAO[acao];
  if (tipo) {
    const alvoDoEvento = saida?.alvo ?? { tipo: alvo.tipo, id: alvo.id ?? null };
    const publico = saida?.publico ?? publicoDerivado(tipo, alvoDoEvento);
    if (!publico) throw new Error(`A ação ${acao} precisa do público do evento ${tipo}.`);
    await registrarEvento(tx, { tipo, alvo: alvoDoEvento, publico });
  }
}

/**
 * O que a auditoria guarda de uma pessoa: os dados dela, sem o texto de busca, que é derivado, e o
 * caminho do local de trabalho no momento da mudança.
 */
export function visaoDaPessoa(
  pessoa: Pick<
    typeof pessoas.$inferSelect,
    'nome' | 'email' | 'matricula' | 'localId' | 'telefone' | 'situacao'
  >,
  caminhoDoLocal: string | null = null,
) {
  return {
    nome: pessoa.nome,
    email: pessoa.email,
    matricula: pessoa.matricula,
    localId: pessoa.localId,
    local: caminhoDoLocal,
    telefone: pessoa.telefone,
    situacao: pessoa.situacao,
  };
}

/** O que a auditoria guarda de uma conta: tudo o que muda nela, menos o hash da senha. */
export function visaoDaConta(conta: typeof contas.$inferSelect) {
  return {
    usuario: conta.usuario,
    pessoaId: conta.pessoaId,
    senhaTemporaria: conta.senhaTemporaria,
    exigeDoisPassos: conta.exigeDoisPassos,
    situacao: conta.situacao,
  };
}
