// O consumível da organização (spec consumiveis, "Consumível", "Fornecedores do consumível" e
// "Compatibilidade com os modelos"; change p4b-consumiveis, design, decisão 1): o código normalizado,
// que decide a unicidade e a busca, a conferência campo a campo, o rendimento escrito, a ordem dos
// compatíveis e o resumo do cartão deles na ficha do ativo. A web usa as mesmas regras para avisar
// antes de enviar; a API confere a unicidade no banco, com as mensagens daqui.

export const TIPOS_DE_CONSUMIVEL = [
  'toner',
  'cilindro',
  'tinta',
  'fita',
  'kit-de-manutencao',
  'peca',
  'outro',
] as const;
export type TipoDeConsumivel = (typeof TIPOS_DE_CONSUMIVEL)[number];

/** A Peça é a parte trocada num conserto, lançada nas ordens de serviço (change p4e). */
export const ROTULOS_DOS_TIPOS_DE_CONSUMIVEL: Readonly<Record<TipoDeConsumivel, string>> = {
  toner: 'Toner',
  cilindro: 'Cilindro',
  tinta: 'Tinta',
  fita: 'Fita',
  'kit-de-manutencao': 'Kit de manutenção',
  peca: 'Peça',
  outro: 'Outro',
};

export const CORES_DE_CONSUMIVEL = ['preto', 'ciano', 'magenta', 'amarelo', 'colorido'] as const;
export type CorDeConsumivel = (typeof CORES_DE_CONSUMIVEL)[number];

export const ROTULOS_DAS_CORES_DE_CONSUMIVEL: Readonly<Record<CorDeConsumivel, string>> = {
  preto: 'Preto',
  ciano: 'Ciano',
  magenta: 'Magenta',
  amarelo: 'Amarelo',
  colorido: 'Colorido',
};

export const LIMITES_DO_CONSUMIVEL = {
  codigo: 40,
  nome: 80,
  rendimentoMinimo: 1,
  rendimentoMaximo: 1_000_000,
  fornecedores: 50,
  modelos: 200,
} as const;

export interface DadosDoConsumivel {
  codigo: string;
  nome: string | null;
  tipo: TipoDeConsumivel | null;
  cor: CorDeConsumivel | null;
  /** As páginas; o texto que não é um número inteiro chega como `NaN` (`lerRendimento`). */
  rendimento: number | null;
  /** Os identificadores dos fornecedores que vendem o consumível. */
  fornecedores: readonly string[];
  /** Os identificadores dos modelos em que ele serve. */
  modelos: readonly string[];
}

export type CampoDoConsumivel = keyof DadosDoConsumivel;
export type ErrosDoConsumivel = Partial<Record<CampoDoConsumivel, string>>;

export const MENSAGEM_DO_CODIGO_REPETIDO = 'Já existe um consumível com este código.';
export const MENSAGEM_DO_MODELO_INATIVO =
  'O modelo escolhido está inativo. Escolha um modelo ativo.';
export const MENSAGEM_DO_MODELO_SEM_A_CAPACIDADE =
  'O modelo escolhido não é de um tipo com consumíveis compatíveis.';

const MENSAGEM_DO_RENDIMENTO = 'Use um número inteiro de páginas, de 1 a 1.000.000.';

/** O código sem as diferenças que não contam: em maiúsculas, sem os espaços e sem os hífens. */
export const codigoNormalizado = (codigo: string) =>
  codigo.toUpperCase().replace(/[\s\p{Pd}]/gu, '');

const tipoConhecido = (tipo: string | null): tipo is TipoDeConsumivel =>
  (TIPOS_DE_CONSUMIVEL as readonly (string | null)[]).includes(tipo);

const corConhecida = (cor: string): cor is CorDeConsumivel =>
  (CORES_DE_CONSUMIVEL as readonly string[]).includes(cor);

/**
 * Os campos sem os espaços das pontas, o nome com espaços simples, o vazio como nulo e as listas sem
 * os repetidos. O código fica como foi escrito: só a forma normalizada decide a unicidade.
 */
export function limparConsumivel(dados: DadosDoConsumivel): DadosDoConsumivel {
  const nome = dados.nome?.replace(/\s+/g, ' ').trim() ?? '';
  return {
    ...dados,
    codigo: dados.codigo.trim(),
    nome: nome === '' ? null : nome,
    fornecedores: [...new Set(dados.fornecedores)],
    modelos: [...new Set(dados.modelos)],
  };
}

/** O motivo de cada campo recusado; vazio quando todos servem. */
export function validarConsumivel(dados: DadosDoConsumivel): ErrosDoConsumivel {
  const { codigo, nome, tipo, cor, rendimento, fornecedores, modelos } = limparConsumivel(dados);
  const erros: ErrosDoConsumivel = {};
  if (codigoNormalizado(codigo) === '') erros.codigo = 'Informe o código do consumível.';
  else if (codigo.length > LIMITES_DO_CONSUMIVEL.codigo) {
    erros.codigo = `Use até ${LIMITES_DO_CONSUMIVEL.codigo} caracteres.`;
  }
  if (nome !== null && nome.length > LIMITES_DO_CONSUMIVEL.nome) {
    erros.nome = `Use até ${LIMITES_DO_CONSUMIVEL.nome} caracteres.`;
  }
  if (!tipoConhecido(tipo)) erros.tipo = 'Escolha o tipo do consumível.';
  if (cor !== null && !corConhecida(cor)) erros.cor = 'Escolha uma cor da lista.';
  if (
    rendimento !== null &&
    !(
      Number.isInteger(rendimento) &&
      rendimento >= LIMITES_DO_CONSUMIVEL.rendimentoMinimo &&
      rendimento <= LIMITES_DO_CONSUMIVEL.rendimentoMaximo
    )
  ) {
    erros.rendimento = MENSAGEM_DO_RENDIMENTO;
  }
  if (fornecedores.length > LIMITES_DO_CONSUMIVEL.fornecedores) {
    erros.fornecedores = `Use até ${LIMITES_DO_CONSUMIVEL.fornecedores} fornecedores.`;
  }
  if (modelos.length > LIMITES_DO_CONSUMIVEL.modelos) {
    erros.modelos = `Use até ${LIMITES_DO_CONSUMIVEL.modelos} modelos.`;
  }
  return erros;
}

/**
 * O rendimento digitado em pt-BR, com ou sem o ponto dos milhares, como "3.000" ou "3000". O vazio é
 * nulo; o que não é um número inteiro vira `NaN`, que a conferência recusa com a mensagem do campo.
 */
export function lerRendimento(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === '') return null;
  return /^(\d{1,3}(\.\d{3})+|\d+)$/.test(limpo) ? Number(limpo.replaceAll('.', '')) : Number.NaN;
}

/** O rendimento como a tela o mostra, como "3.000 páginas". */
export const rendimentoEscrito = (paginas: number) =>
  `${paginas.toLocaleString('pt-BR')} ${paginas === 1 ? 'página' : 'páginas'}`;

/**
 * Os consumíveis na ordem em que as fichas os mostram: pelo tipo, na ordem da lista fixa, e pelo
 * código normalizado.
 */
export function ordenarConsumiveis<T extends { codigo: string; tipo: TipoDeConsumivel }>(
  consumiveis: readonly T[],
): T[] {
  return [...consumiveis].sort((um, outro) => {
    const porTipo = TIPOS_DE_CONSUMIVEL.indexOf(um.tipo) - TIPOS_DE_CONSUMIVEL.indexOf(outro.tipo);
    if (porTipo !== 0) return porTipo;
    const [a, b] = [codigoNormalizado(um.codigo), codigoNormalizado(outro.codigo)];
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

const CODIGOS_NO_RESUMO = 2;

/**
 * O resumo do cartão "Consumíveis compatíveis" da ficha do ativo (spec cadastro-de-ativos, "Aba
 * Dados em cartões"): os códigos dos dois primeiros, na ordem das fichas, e quantos mais.
 */
export function resumoDosCompativeis({
  temModelo,
  compativeis,
}: {
  temModelo: boolean;
  compativeis: readonly { codigo: string }[];
}): string {
  if (!temModelo) return 'Sem modelo';
  if (compativeis.length === 0) return 'Nenhum compatível';
  const codigos = compativeis
    .slice(0, CODIGOS_NO_RESUMO)
    .map(({ codigo }) => codigo)
    .join(' · ');
  const mais = compativeis.length - CODIGOS_NO_RESUMO;
  return mais > 0 ? `${codigos} e mais ${mais}` : codigos;
}
