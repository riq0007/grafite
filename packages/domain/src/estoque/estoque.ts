// O estoque dos consumíveis por local (spec estoque; change p4c-estoque, design, decisão 1): o
// livro-razão das entradas, saídas, transferências e ajustes, com a conferência de cada lançamento,
// o efeito dele nos saldos, a situação de cada saldo com o mínimo e os textos que as telas mostram.
// A web confere antes de enviar com as mesmas regras; a API confere de novo, com o saldo e as
// referências do banco.

export const TIPOS_DE_MOVIMENTO = ['entrada', 'saida', 'transferencia', 'ajuste'] as const;
export type TipoDeMovimento = (typeof TIPOS_DE_MOVIMENTO)[number];

export const ROTULOS_DOS_TIPOS_DE_MOVIMENTO: Readonly<Record<TipoDeMovimento, string>> = {
  entrada: 'Entrada',
  saida: 'Saída',
  transferencia: 'Transferência',
  ajuste: 'Ajuste',
};

export const MOTIVOS_DO_AJUSTE = [
  'inventario',
  'perda',
  'avaria',
  'devolucao-ao-fornecedor',
  'outro',
] as const;
export type MotivoDoAjuste = (typeof MOTIVOS_DO_AJUSTE)[number];

export const ROTULOS_DOS_MOTIVOS_DO_AJUSTE: Readonly<Record<MotivoDoAjuste, string>> = {
  inventario: 'Inventário',
  perda: 'Perda',
  avaria: 'Avaria',
  'devolucao-ao-fornecedor': 'Devolução ao fornecedor',
  outro: 'Outro',
};

export const DIRECOES_DO_AJUSTE = ['acrescentar', 'retirar'] as const;
export type DirecaoDoAjuste = (typeof DIRECOES_DO_AJUSTE)[number];

export const ROTULOS_DAS_DIRECOES_DO_AJUSTE: Readonly<Record<DirecaoDoAjuste, string>> = {
  acrescentar: 'Acrescentar',
  retirar: 'Retirar',
};

export const LIMITES_DO_ESTOQUE = {
  quantidadeMinima: 1,
  quantidadeMaxima: 100_000,
  notaFiscal: 40,
  observacao: 200,
  minimoMaximo: 100_000,
} as const;

interface ComumDoLancamento {
  consumivel: string | null;
  /** O texto que não é um número inteiro chega como `NaN` (`lerQuantidade`). */
  quantidade: number | null;
  observacao: string | null;
}

/** O lançamento como o formulário e a API o recebem, com os campos de cada tipo. */
export type DadosDoLancamento =
  | (ComumDoLancamento & {
      tipo: 'entrada';
      destino: string | null;
      fornecedor: string | null;
      notaFiscal: string | null;
    })
  | (ComumDoLancamento & { tipo: 'saida'; origem: string | null; ativo: string | null })
  | (ComumDoLancamento & {
      tipo: 'transferencia';
      origem: string | null;
      destino: string | null;
    })
  | (ComumDoLancamento & {
      tipo: 'ajuste';
      local: string | null;
      direcao: DirecaoDoAjuste | null;
      motivo: MotivoDoAjuste | null;
    });

export type CampoDoLancamento =
  | 'consumivel'
  | 'quantidade'
  | 'origem'
  | 'destino'
  | 'local'
  | 'fornecedor'
  | 'notaFiscal'
  | 'ativo'
  | 'direcao'
  | 'motivo'
  | 'observacao';

export type ErrosDoLancamento = Partial<Record<CampoDoLancamento, string>>;

// O fornecedor inativo usa a mensagem do fornecedor (MENSAGEM_DO_FORNECEDOR_INATIVO).
export const MENSAGEM_DO_CONSUMIVEL_INATIVO =
  'O consumível escolhido está inativo. Escolha um consumível ativo.';
export const MENSAGEM_DO_LOCAL_INATIVO = 'O local escolhido está inativo. Escolha um local ativo.';
export const MENSAGEM_DO_ATIVO_INATIVO = 'O ativo escolhido está inativo.';

const ESCOLHA_O_LOCAL = 'Escolha o local.';
const MENSAGEM_DA_QUANTIDADE = 'Use um número inteiro de 1 a 100.000.';
const MENSAGEM_DO_MINIMO = 'Use um número inteiro de 0 a 100.000.';

/**
 * A quantidade digitada em pt-BR, com ou sem o ponto dos milhares, como "1.000" ou "1000". O vazio é
 * nulo; o que não é um número inteiro vira `NaN`, que a conferência recusa com a mensagem do campo.
 */
export function lerQuantidade(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === '') return null;
  return /^(\d{1,3}(\.\d{3})+|\d+)$/.test(limpo) ? Number(limpo.replaceAll('.', '')) : Number.NaN;
}

const semPontas = (texto: string | null) => {
  const limpo = texto?.trim() ?? '';
  return limpo === '' ? null : limpo;
};

/** A nota e a observação sem os espaços das pontas, e o vazio como nulo. */
export function limparLancamento(dados: DadosDoLancamento): DadosDoLancamento {
  const observacao = semPontas(dados.observacao);
  if (dados.tipo === 'entrada') {
    return { ...dados, notaFiscal: semPontas(dados.notaFiscal), observacao };
  }
  return { ...dados, observacao };
}

const quantidadeValida = (quantidade: number | null) =>
  quantidade !== null &&
  Number.isInteger(quantidade) &&
  quantidade >= LIMITES_DO_ESTOQUE.quantidadeMinima &&
  quantidade <= LIMITES_DO_ESTOQUE.quantidadeMaxima;

/** A recusa da quantidade de um lançamento, também a da peça da OS; nula quando ela serve. */
export const recusaDaQuantidade = (quantidade: number | null) =>
  quantidadeValida(quantidade) ? null : MENSAGEM_DA_QUANTIDADE;

/** O motivo de cada campo recusado; vazio quando o lançamento serve. */
export function validarLancamento(dados: DadosDoLancamento): ErrosDoLancamento {
  const limpo = limparLancamento(dados);
  const erros: ErrosDoLancamento = {};
  if (limpo.consumivel === null) erros.consumivel = 'Escolha o consumível.';
  const daQuantidade = recusaDaQuantidade(limpo.quantidade);
  if (daQuantidade !== null) erros.quantidade = daQuantidade;
  switch (limpo.tipo) {
    case 'entrada':
      if (limpo.destino === null) erros.destino = ESCOLHA_O_LOCAL;
      if (limpo.fornecedor === null) erros.fornecedor = 'Escolha o fornecedor.';
      if (limpo.notaFiscal === null) erros.notaFiscal = 'Informe o número da nota fiscal.';
      else if (limpo.notaFiscal.length > LIMITES_DO_ESTOQUE.notaFiscal) {
        erros.notaFiscal = `Use até ${LIMITES_DO_ESTOQUE.notaFiscal} caracteres.`;
      }
      break;
    case 'saida':
      if (limpo.origem === null) erros.origem = ESCOLHA_O_LOCAL;
      if (limpo.ativo === null) erros.ativo = 'Escolha o ativo.';
      break;
    case 'transferencia':
      if (limpo.origem === null) erros.origem = ESCOLHA_O_LOCAL;
      if (limpo.destino === null) erros.destino = ESCOLHA_O_LOCAL;
      else if (limpo.destino === limpo.origem) {
        erros.destino = 'Escolha um destino diferente da origem.';
      }
      break;
    case 'ajuste':
      if (limpo.local === null) erros.local = ESCOLHA_O_LOCAL;
      if (limpo.direcao === null) erros.direcao = 'Escolha se o ajuste acrescenta ou retira.';
      if (limpo.motivo === null) erros.motivo = 'Escolha o motivo.';
      else if (limpo.motivo === 'outro' && limpo.observacao === null) {
        erros.observacao = 'Descreva o motivo na observação.';
      }
      break;
  }
  if (
    limpo.observacao !== null &&
    limpo.observacao.length > LIMITES_DO_ESTOQUE.observacao &&
    erros.observacao === undefined
  ) {
    erros.observacao = `Use até ${LIMITES_DO_ESTOQUE.observacao} caracteres.`;
  }
  return erros;
}

function local(id: string | null): string {
  if (id === null) throw new Error('O lançamento sem o local não foi conferido.');
  return id;
}

/**
 * Os locais do lançamento conferido: os que recebem o saldo, que precisam estar ativos, e os de onde
 * ele sai, que aceitam o local inativo, para o saldo que sobrou sair dele (spec estoque).
 */
export function locaisDoLancamento(dados: DadosDoLancamento): {
  recebem: string[];
  saem: string[];
} {
  switch (dados.tipo) {
    case 'entrada':
      return { recebem: [local(dados.destino)], saem: [] };
    case 'saida':
      return { recebem: [], saem: [local(dados.origem)] };
    case 'transferencia':
      return { recebem: [local(dados.destino)], saem: [local(dados.origem)] };
    case 'ajuste':
      return dados.direcao === 'acrescentar'
        ? { recebem: [local(dados.local)], saem: [] }
        : { recebem: [], saem: [local(dados.local)] };
  }
}

/** O efeito do lançamento conferido nos saldos: a diferença em cada local, primeiro a de onde sai. */
export function efeitoNosSaldos(dados: DadosDoLancamento): { local: string; diferenca: number }[] {
  const quantidade = dados.quantidade ?? 0;
  const { recebem, saem } = locaisDoLancamento(dados);
  return [
    ...saem.map((id) => ({ local: id, diferenca: -quantidade })),
    ...recebem.map((id) => ({ local: id, diferenca: quantidade })),
  ];
}

/**
 * Se o consumível precisa estar ativo: no lançamento que põe o saldo num local, a entrada, a
 * transferência e o ajuste de acrescentar. A saída e o ajuste de retirar tiram o que sobrou dele.
 */
export const consumivelPrecisaEstarAtivo = (dados: DadosDoLancamento) =>
  locaisDoLancamento(dados).recebem.length > 0;

/** A recusa do saldo insuficiente, no campo Quantidade. */
export const mensagemDoSaldo = (codigo: string, caminhoDoLocal: string, saldo: number) =>
  `O saldo do ${codigo} em ${caminhoDoLocal} é ${saldo.toLocaleString('pt-BR')}.`;

export const SITUACOES_DO_SALDO = ['sem-estoque', 'abaixo-do-minimo', 'em-estoque'] as const;
export type SituacaoDoSaldo = (typeof SITUACOES_DO_SALDO)[number];

export const ROTULOS_DAS_SITUACOES_DO_SALDO: Readonly<Record<SituacaoDoSaldo, string>> = {
  'sem-estoque': 'Sem estoque',
  'abaixo-do-minimo': 'Abaixo do mínimo',
  'em-estoque': 'Em estoque',
};

/** A situação do consumível no local, pelo saldo e pelo mínimo (0 é sem mínimo). */
export function situacaoDoSaldo(saldo: number, minimo: number): SituacaoDoSaldo {
  if (saldo === 0) return 'sem-estoque';
  return saldo < minimo ? 'abaixo-do-minimo' : 'em-estoque';
}

/** Abaixo do mínimo: com o mínimo maior que 0 e o saldo menor que ele, também com o saldo 0. */
export const abaixoDoMinimo = (saldo: number, minimo: number) => minimo > 0 && saldo < minimo;

/**
 * O momento em que o consumível ficou abaixo do mínimo, depois de uma mudança no saldo ou no
 * mínimo: o de antes, se ele continua abaixo; o da mudança, se entrou agora; nulo, se saiu.
 */
export function abaixoDesdeDepois({
  antes,
  saldo,
  minimo,
  momento,
}: {
  antes: Date | null;
  saldo: number;
  minimo: number;
  momento: Date;
}): Date | null {
  if (!abaixoDoMinimo(saldo, minimo)) return null;
  return antes ?? momento;
}

/** A recusa do mínimo; nulo quando ele serve. */
export function validarMinimo(minimo: number | null): string | null {
  return minimo !== null &&
    Number.isInteger(minimo) &&
    minimo >= 0 &&
    minimo <= LIMITES_DO_ESTOQUE.minimoMaximo
    ? null
    : MENSAGEM_DO_MINIMO;
}

/** O texto da ocorrência do consumível abaixo do mínimo no Início (spec modulo-operacao). */
export function textoDaOcorrencia({
  codigo,
  local: caminho,
  saldo,
  minimo,
}: {
  codigo: string;
  local: string;
  saldo: number;
  minimo: number;
}): string {
  const numero = (valor: number) => valor.toLocaleString('pt-BR');
  return saldo === 0
    ? `Sem ${codigo} em ${caminho}: mínimo ${numero(minimo)}`
    : `${codigo} abaixo do mínimo em ${caminho}: ${numero(saldo)} de ${numero(minimo)}`;
}

/** O contador de páginas guardado na saída, com o momento da leitura já escrito no fuso escolhido. */
export const textoDoContador = (paginas: number, lidoEm: string) =>
  `Total de páginas: ${paginas.toLocaleString('pt-BR')}, lido em ${lidoEm}`;
