// As regras da pessoa (spec administracao-de-pessoas): só o necessário, com os campos opcionais
// vazios guardados como nulo. A web usa as mesmas regras para avisar antes de enviar.
import { normalizarTexto } from '../texto.ts';

export interface DadosDaPessoa {
  nome: string;
  email: string | null;
  matricula: string | null;
  telefone: string | null;
}

export type CampoDaPessoa = keyof DadosDaPessoa;
export type ErrosDaPessoa = Partial<Record<CampoDaPessoa, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MATRICULA = /^[\p{L}\p{N}./-]+$/u;
const TELEFONE = /^[0-9 ()+-]*[0-9][0-9 ()+-]*$/;

const opcional = (valor: string | null | undefined) => {
  const limpo = valor?.trim() ?? '';
  return limpo === '' ? null : limpo;
};

/** Os campos sem os espaços das pontas, o nome com espaços simples e o vazio como nulo. */
export function limparPessoa(dados: DadosDaPessoa): DadosDaPessoa {
  return {
    nome: dados.nome.replace(/\s+/g, ' ').trim(),
    email: opcional(dados.email),
    matricula: opcional(dados.matricula),
    telefone: opcional(dados.telefone),
  };
}

/** O motivo de cada campo recusado; vazio quando todos servem. */
export function validarPessoa(dados: DadosDaPessoa): ErrosDaPessoa {
  const { nome, email, matricula, telefone } = limparPessoa(dados);
  const erros: ErrosDaPessoa = {};
  if (nome === '') erros.nome = 'Informe o nome.';
  else if (nome.length > 120) erros.nome = 'Use até 120 caracteres.';
  if (email !== null && (email.length > 254 || !EMAIL.test(email))) {
    erros.email = 'Informe um e-mail válido, como nome@empresa.com.br.';
  }
  if (matricula !== null) {
    if (matricula.length > 32) erros.matricula = 'Use até 32 caracteres.';
    else if (!MATRICULA.test(matricula)) {
      erros.matricula = 'Use só letras, números, ponto, hífen e barra.';
    }
  }
  if (telefone !== null) {
    if (telefone.length > 32) erros.telefone = 'Use até 32 caracteres.';
    else if (!TELEFONE.test(telefone)) {
      erros.telefone = 'Use só números, espaços, parênteses, + e hífen.';
    }
  }
  return erros;
}

/** O texto em que a busca de pessoas procura: nome, matrícula e e-mail, sem acento. */
export function textoDeBusca({
  nome,
  matricula,
  email,
}: Pick<DadosDaPessoa, 'nome' | 'matricula' | 'email'>): string {
  return normalizarTexto([nome, matricula, email].filter(Boolean).join(' '));
}
