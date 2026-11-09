// O fornecedor da organização (spec fornecedores, "Fornecedor"; change p4a-fornecedores, design,
// decisão 1): os campos opcionais vazios guardados como nulo, o nome normalizado que decide a
// unicidade e junta as grafias na troca do texto dos ativos, e o CNPJ pelos dígitos verificadores,
// também o alfanumérico, em que os 12 primeiros caracteres podem ser letras. A web usa as mesmas
// regras para avisar antes de enviar; a API confere a unicidade no banco, com as mensagens daqui.
import { normalizarTexto } from '../texto.ts';

export interface DadosDoFornecedor {
  nome: string;
  cnpj: string | null;
  contato: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
}

export type CampoDoFornecedor = keyof DadosDoFornecedor;
export type ErrosDoFornecedor = Partial<Record<CampoDoFornecedor, string>>;

export const MENSAGEM_DO_NOME_REPETIDO = 'Já existe um fornecedor com este nome.';
export const MENSAGEM_DO_CNPJ_REPETIDO = 'Já existe um fornecedor com este CNPJ.';
export const MENSAGEM_DO_FORNECEDOR_INATIVO =
  'O fornecedor escolhido está inativo. Escolha um fornecedor ativo.';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_DO_CNPJ = /^[0-9A-Z]{12}[0-9]{2}$/;
const PESOS_DO_PRIMEIRO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DO_SEGUNDO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

const opcional = (valor: string | null | undefined) => {
  const limpo = valor?.trim() ?? '';
  return limpo === '' ? null : limpo;
};

/** O dígito verificador pela regra da Receita: o valor de cada caractere é o código menos 48. */
function digito(base: string, pesos: readonly number[]): number {
  const soma = [...base].reduce(
    (total, caractere, indice) => total + (caractere.charCodeAt(0) - 48) * (pesos[indice] ?? 0),
    0,
  );
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * O CNPJ como é guardado, com os 14 caracteres em maiúsculas, a partir do texto com ou sem a
 * pontuação; `null` quando o tamanho, os caracteres ou os dígitos verificadores não servem.
 */
export function lerCnpj(texto: string): string | null {
  const limpo = texto.toUpperCase().replace(/[\s./-]/g, '');
  if (!FORMATO_DO_CNPJ.test(limpo)) return null;
  // Os 14 caracteres iguais passam pela conta, mas não são um CNPJ.
  if (/^(.)\1{13}$/.test(limpo)) return null;
  const base = limpo.slice(0, 12);
  const primeiro = digito(base, PESOS_DO_PRIMEIRO);
  const segundo = digito(`${base}${primeiro}`, PESOS_DO_SEGUNDO);
  return limpo === `${base}${primeiro}${segundo}` ? limpo : null;
}

/** O CNPJ guardado escrito com a pontuação, como "12.345.678/0001-95". */
export const cnpjComPontuacao = (cnpj: string) =>
  `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;

/** O nome sem acento, em minúsculas e com os espaços repetidos juntos: a chave da unicidade. */
export const nomeNormalizadoDoFornecedor = (nome: string) => normalizarTexto(nome);

/**
 * Os campos sem os espaços das pontas, o nome com espaços simples, o CNPJ lido e o vazio como nulo.
 * O CNPJ que não serve fica como foi digitado, para a conferência dizer o motivo.
 */
export function limparFornecedor(dados: DadosDoFornecedor): DadosDoFornecedor {
  const cnpj = opcional(dados.cnpj);
  return {
    nome: dados.nome.replace(/\s+/g, ' ').trim(),
    cnpj: cnpj === null ? null : (lerCnpj(cnpj) ?? cnpj),
    contato: opcional(dados.contato),
    email: opcional(dados.email),
    telefone: opcional(dados.telefone),
    observacoes: opcional(dados.observacoes),
  };
}

/** O motivo de cada campo recusado; vazio quando todos servem. */
export function validarFornecedor(dados: DadosDoFornecedor): ErrosDoFornecedor {
  const { nome, cnpj, contato, email, telefone, observacoes } = limparFornecedor(dados);
  const erros: ErrosDoFornecedor = {};
  if (nome === '') erros.nome = 'Informe o nome do fornecedor.';
  else if (nome.length > 120) erros.nome = 'Use até 120 caracteres.';
  if (cnpj !== null && lerCnpj(cnpj) === null) {
    erros.cnpj = 'CNPJ inválido: confira os 14 caracteres.';
  }
  if (contato !== null && contato.length > 120) erros.contato = 'Use até 120 caracteres.';
  if (email !== null && (email.length > 254 || !EMAIL.test(email))) {
    erros.email = 'Use um e-mail, como compras@empresa.com.br.';
  }
  if (telefone !== null && telefone.length > 30) erros.telefone = 'Use até 30 caracteres.';
  if (observacoes !== null && observacoes.length > 2000) {
    erros.observacoes = 'Use até 2.000 caracteres.';
  }
  return erros;
}
