// Os fornecedores na API (spec fornecedores; change p4a-fornecedores, design, decisões 1 e 5): os
// dados conferidos pelo domínio, com a recusa no campo, a unicidade do nome e do CNPJ pelo banco,
// com a mensagem no campo dela, e a visão que a auditoria guarda, com o CNPJ escrito com a pontuação.
import { fornecedores, type Transacao } from '@grafite/db';
import {
  cnpjComPontuacao,
  type DadosDoFornecedor,
  limparFornecedor,
  MENSAGEM_DO_CNPJ_REPETIDO,
  MENSAGEM_DO_NOME_DO_FORNECEDOR_REPETIDO,
  nomeNormalizadoDoFornecedor,
  validarFornecedor,
} from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { violouUnicidade } from '../banco.ts';
import { conflito, dadosInvalidos, naoEncontrado } from '../problemas.ts';

export type LinhaDoFornecedor = typeof fornecedores.$inferSelect;

/** Os dados conferidos pelo domínio, prontos para gravar; a recusa sai no campo dela. */
export function dadosConferidos(dados: DadosDoFornecedor) {
  const erros = validarFornecedor(dados);
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros as Record<string, string>);
  const limpos = limparFornecedor(dados);
  return { ...limpos, nomeNormalizado: nomeNormalizadoDoFornecedor(limpos.nome) };
}

/** Grava, trocando a recusa da unicidade do nome ou do CNPJ pela mensagem no campo. */
export async function semFornecedorRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'fornecedores_nome_unico')) {
      throw conflito(MENSAGEM_DO_NOME_DO_FORNECEDOR_REPETIDO, {
        nome: MENSAGEM_DO_NOME_DO_FORNECEDOR_REPETIDO,
      });
    }
    if (violouUnicidade(erro, 'fornecedores_cnpj_unico')) {
      throw conflito(MENSAGEM_DO_CNPJ_REPETIDO, { cnpj: MENSAGEM_DO_CNPJ_REPETIDO });
    }
    throw erro;
  }
}

/** O fornecedor da organização do contexto, travado para a mudança; 404 sem ele. */
export async function lerFornecedor(tx: Transacao, id: string): Promise<LinhaDoFornecedor> {
  const [fornecedor] = await tx
    .select()
    .from(fornecedores)
    .where(eq(fornecedores.id, id))
    .for('update');
  if (!fornecedor) throw naoEncontrado('Fornecedor não encontrado.');
  return fornecedor;
}

/** O que a auditoria guarda do fornecedor, com o CNPJ escrito com a pontuação. */
export const visaoDoFornecedor = (fornecedor: LinhaDoFornecedor) => ({
  nome: fornecedor.nome,
  cnpj: fornecedor.cnpj ? cnpjComPontuacao(fornecedor.cnpj) : null,
  contato: fornecedor.contato,
  email: fornecedor.email,
  telefone: fornecedor.telefone,
  observacoes: fornecedor.observacoes,
  situacao: fornecedor.situacao,
});
