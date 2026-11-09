// Os painéis no domínio (spec painel-de-dashboards; change painel-de-dashboards, design, decisões 2 e
// 3): a conferência do painel que a API e a web usam, a leitura da resposta da verificação, sem
// rede, e a forma da grade que aproveita a janela. O nome repetido e o local inativo, a API confere
// no banco.

export const SITUACOES_DO_PAINEL = ['sem-verificacao', 'no-ar', 'fora-do-ar'] as const;

export type SituacaoDoPainel = (typeof SITUACOES_DO_PAINEL)[number];

/** A situação do painel em texto e no tom do rótulo. */
export const SITUACOES_DO_PAINEL_NA_TELA = {
  'sem-verificacao': { texto: 'Sem verificação', tom: 'neutra' },
  'no-ar': { texto: 'No ar', tom: 'sucesso' },
  'fora-do-ar': { texto: 'Fora do ar', tom: 'critico' },
} as const satisfies Record<SituacaoDoPainel, { texto: string; tom: string }>;

export const MENSAGENS_DOS_PAINEIS = {
  repetido: 'Já existe um painel com esse nome.',
  endereco: 'Informe o endereço, como http://10.0.0.20:3000.',
  local: 'Escolha um local ativo.',
} as const;

/** O prazo de cada pedido da verificação, em ms. */
export const PRAZO_DA_VERIFICACAO = 5000;

export interface DadosDoPainel {
  nome: string;
  endereco: string;
  localId: string | null;
  ordem: number;
}

export type CampoDoPainel = 'nome' | 'endereco' | 'local' | 'ordem';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O endereço `http://` ou `https://` com o host, sem usuário e senha, ou `null`. */
function enderecoValido(texto: string): string | null {
  if (texto.length === 0 || texto.length > 500) return null;
  let lido: URL;
  try {
    lido = new URL(texto);
  } catch {
    return null;
  }
  if (lido.protocol !== 'http:' && lido.protocol !== 'https:') return null;
  if (lido.hostname === '' || lido.username !== '' || lido.password !== '') return null;
  return texto;
}

export function conferirPainel(
  entrada: Record<string, unknown>,
):
  | { ok: true; dados: DadosDoPainel }
  | { ok: false; erros: Partial<Record<CampoDoPainel, string>> } {
  const erros: Partial<Record<CampoDoPainel, string>> = {};
  const nome = typeof entrada.nome === 'string' ? entrada.nome.trim() : '';
  if (nome === '') erros.nome = 'Informe o nome.';
  else if (nome.length > 80) erros.nome = 'Use até 80 caracteres no nome.';

  const escrito = typeof entrada.endereco === 'string' ? entrada.endereco.trim() : '';
  const endereco = enderecoValido(escrito);
  if (endereco === null) erros.endereco = MENSAGENS_DOS_PAINEIS.endereco;

  let localId: string | null = null;
  if (entrada.localId !== undefined && entrada.localId !== null && entrada.localId !== '') {
    if (typeof entrada.localId === 'string' && UUID.test(entrada.localId))
      localId = entrada.localId;
    else erros.local = MENSAGENS_DOS_PAINEIS.local;
  }

  let ordem = 100;
  if (entrada.ordem !== undefined && entrada.ordem !== null) {
    const valor = entrada.ordem;
    if (typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 999) {
      ordem = valor;
    } else erros.ordem = 'Informe uma ordem de 1 a 999.';
  }

  if (Object.keys(erros).length > 0 || endereco === null) return { ok: false, erros };
  return { ok: true, dados: { nome, endereco, localId, ordem } };
}

/** O que a verificação recebeu: o status da resposta, ou a falha antes dela. */
export type RespostaDaVerificacao = { status: number } | { falha: 'prazo' | 'conexao' };

/** A situação do painel pela resposta: abaixo de 500 está no ar; o resto, fora do ar, com o motivo. */
export function situacaoDaResposta(resposta: RespostaDaVerificacao): {
  situacao: Exclude<SituacaoDoPainel, 'sem-verificacao'>;
  motivo: string | null;
} {
  if ('falha' in resposta) {
    return {
      situacao: 'fora-do-ar',
      motivo:
        resposta.falha === 'prazo'
          ? `Sem resposta em ${PRAZO_DA_VERIFICACAO / 1000} s`
          : 'A conexão foi recusada',
    };
  }
  if (resposta.status >= 100 && resposta.status < 500) return { situacao: 'no-ar', motivo: null };
  return { situacao: 'fora-do-ar', motivo: `Respondeu ${resposta.status}` };
}

/**
 * A forma da grade: um painel ocupa tudo, dois e três ficam numa linha, e de quatro em diante as
 * colunas são a raiz quadrada arredondada para cima, com as linhas que precisar.
 */
export function formaDaGrade(quantos: number): { colunas: number; linhas: number } {
  if (quantos <= 0) return { colunas: 0, linhas: 0 };
  const colunas = quantos <= 3 ? quantos : Math.ceil(Math.sqrt(quantos));
  return { colunas, linhas: Math.ceil(quantos / colunas) };
}
