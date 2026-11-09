// A solicitação à TI (spec solicitacoes; change p4d-solicitacoes, design, decisão 1): o pedido de
// toner, de conserto ou de um equipamento, as situações e as mudanças entre elas, a conferência de
// cada tipo, a sugestão do consumível pela cor, o alcance pelos locais e os textos que as telas
// mostram. A web confere antes de enviar com as mesmas regras; a API confere de novo, com as
// referências e os saldos do banco.
import {
  type CorDeConsumivel,
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
} from '../consumiveis/consumivel.ts';
import { textoDoContador } from '../estoque/estoque.ts';

export const TIPOS_DE_SOLICITACAO = ['toner', 'conserto', 'equipamento'] as const;
export type TipoDeSolicitacao = (typeof TIPOS_DE_SOLICITACAO)[number];

export const ROTULOS_DOS_TIPOS_DE_SOLICITACAO: Readonly<Record<TipoDeSolicitacao, string>> = {
  toner: 'Toner',
  conserto: 'Conserto',
  equipamento: 'Equipamento',
};

export const SITUACOES_DA_SOLICITACAO = [
  'aberta',
  'em-atendimento',
  'aguardando-entrega',
  'concluida',
  'cancelada',
] as const;
export type SituacaoDaSolicitacao = (typeof SITUACOES_DA_SOLICITACAO)[number];
/** Uma solicitação nunca volta a Aberta: as mudanças vão sempre para uma das outras. */
export type SituacaoDeDestino = Exclude<SituacaoDaSolicitacao, 'aberta'>;

export const ROTULOS_DAS_SITUACOES_DA_SOLICITACAO: Readonly<Record<SituacaoDaSolicitacao, string>> =
  {
    aberta: 'Aberta',
    'em-atendimento': 'Em atendimento',
    'aguardando-entrega': 'Aguardando entrega',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
  };

export const SITUACOES_PENDENTES = ['aberta', 'em-atendimento', 'aguardando-entrega'] as const;

export const situacaoPendente = (situacao: SituacaoDaSolicitacao) =>
  (SITUACOES_PENDENTES as readonly SituacaoDaSolicitacao[]).includes(situacao);

export const LIMITES_DA_SOLICITACAO = {
  impressoras: 20,
  quantidadeMinima: 1,
  quantidadeMaxima: 99,
  observacao: 500,
  /** O defeito, o motivo do equipamento e o que foi feito. */
  texto: 1000,
  motivoDoCancelamento: 200,
  osDoFornecedor: 40,
  lote: 200,
} as const;

interface ComumDaSolicitacao {
  pessoa: string | null;
  observacao: string | null;
}

/** Um item do toner: a impressora, a cor e a quantidade, com o consumível sugerido ou escolhido. */
export interface ItemDoToner {
  impressora: string | null;
  cor: CorDeConsumivel | null;
  /** O texto que não é um número inteiro chega como `NaN` (`lerQuantidade`, do estoque). */
  quantidade: number | null;
  consumivel: string | null;
}

/** A solicitação como o formulário e a API a recebem, com os campos de cada tipo. */
export type DadosDaSolicitacao =
  | (ComumDaSolicitacao & { tipo: 'toner'; impressoras: string[]; itens: ItemDoToner[] })
  | (ComumDaSolicitacao & { tipo: 'conserto'; ativo: string | null; defeito: string | null })
  | (ComumDaSolicitacao & {
      tipo: 'equipamento';
      tipoDeAtivo: string | null;
      quantidade: number | null;
      motivo: string | null;
      local: string | null;
    });

/**
 * O motivo de cada campo recusado, pelo caminho do campo: `pessoa`, `observacao`, `impressoras`,
 * `impressoras.1`, `itens.0.cor`, `ativo`, `defeito`, `tipoDeAtivo`, `quantidade`, `motivo` e
 * `local`. Vazio quando a solicitação serve.
 */
export type ErrosDaSolicitacao = Record<string, string>;

export const MENSAGEM_DA_PESSOA_INATIVA =
  'A pessoa escolhida está inativa. Escolha uma pessoa ativa.';
export const MENSAGEM_DO_TIPO_INATIVO = 'O tipo escolhido está inativo. Escolha um tipo ativo.';
export const MENSAGEM_SEM_COMPATIVEL = 'Nenhum compatível dessa cor.';
export const MENSAGEM_DO_CONSUMIVEL_FORA_DA_COR = 'Escolha um compatível dessa cor.';

const MENSAGEM_DA_QUANTIDADE = 'Use um número inteiro de 1 a 99.';
const ESCOLHA_A_IMPRESSORA = 'Escolha a impressora.';
const maisQue = (limite: number) => `Use até ${limite.toLocaleString('pt-BR')} caracteres.`;

const semPontas = (texto: string | null) => {
  const limpo = texto?.trim() ?? '';
  return limpo === '' ? null : limpo;
};

const quantidadeValida = (quantidade: number | null) =>
  quantidade !== null &&
  Number.isInteger(quantidade) &&
  quantidade >= LIMITES_DA_SOLICITACAO.quantidadeMinima &&
  quantidade <= LIMITES_DA_SOLICITACAO.quantidadeMaxima;

/** Os textos sem os espaços das pontas, e o vazio como nulo. */
export function limparSolicitacao(dados: DadosDaSolicitacao): DadosDaSolicitacao {
  const observacao = semPontas(dados.observacao);
  switch (dados.tipo) {
    case 'toner':
      return { ...dados, observacao };
    case 'conserto':
      return { ...dados, observacao, defeito: semPontas(dados.defeito) };
    case 'equipamento':
      return { ...dados, observacao, motivo: semPontas(dados.motivo) };
  }
}

function conferirTexto(
  erros: ErrosDaSolicitacao,
  campo: string,
  texto: string | null,
  vazio: string,
) {
  if (texto === null) erros[campo] = vazio;
  else if (texto.length > LIMITES_DA_SOLICITACAO.texto) {
    erros[campo] = maisQue(LIMITES_DA_SOLICITACAO.texto);
  }
}

function conferirToner(
  erros: ErrosDaSolicitacao,
  dados: Extract<DadosDaSolicitacao, { tipo: 'toner' }>,
  comEntrega: ReadonlySet<string>,
) {
  if (dados.impressoras.length === 0) {
    erros.impressoras = ESCOLHA_A_IMPRESSORA;
    return;
  }
  if (dados.impressoras.length > LIMITES_DA_SOLICITACAO.impressoras) {
    erros.impressoras = `Escolha até ${LIMITES_DA_SOLICITACAO.impressoras} impressoras.`;
    return;
  }
  const pedidas = new Set<string>();
  const comItem = new Set<string>();
  dados.itens.forEach((item, indice) => {
    const campo = (nome: string) => `itens.${indice}.${nome}`;
    if (item.impressora === null || !dados.impressoras.includes(item.impressora)) {
      erros[campo('impressora')] = ESCOLHA_A_IMPRESSORA;
    } else {
      comItem.add(item.impressora);
    }
    if (item.cor === null) erros[campo('cor')] = 'Escolha a cor.';
    else if (item.impressora !== null) {
      const par = `${item.impressora}\u0000${item.cor}`;
      if (pedidas.has(par)) erros[campo('cor')] = 'Essa cor já está pedida para essa impressora.';
      pedidas.add(par);
    }
    if (!quantidadeValida(item.quantidade)) erros[campo('quantidade')] = MENSAGEM_DA_QUANTIDADE;
  });
  // O item entregue conta como o item da impressora, que fica sem item pendente na alteração.
  dados.impressoras.forEach((impressora, indice) => {
    if (!comItem.has(impressora) && !comEntrega.has(impressora)) {
      erros[`impressoras.${indice}`] = 'Inclua ao menos um item para cada impressora.';
    }
  });
}

/**
 * O motivo de cada campo recusado no registro e na alteração; vazio quando a solicitação serve. Na
 * alteração do toner, `comEntrega` traz as impressoras que já têm item entregue.
 */
export function validarSolicitacao(
  dados: DadosDaSolicitacao,
  { comEntrega = new Set<string>() }: { comEntrega?: ReadonlySet<string> } = {},
): ErrosDaSolicitacao {
  const limpo = limparSolicitacao(dados);
  const erros: ErrosDaSolicitacao = {};
  if (limpo.pessoa === null) erros.pessoa = 'Escolha quem pediu.';
  switch (limpo.tipo) {
    case 'toner':
      conferirToner(erros, limpo, comEntrega);
      break;
    case 'conserto':
      if (limpo.ativo === null) erros.ativo = 'Escolha o ativo.';
      conferirTexto(erros, 'defeito', limpo.defeito, 'Descreva o defeito.');
      break;
    case 'equipamento':
      if (limpo.tipoDeAtivo === null) erros.tipoDeAtivo = 'Escolha o tipo de ativo.';
      if (!quantidadeValida(limpo.quantidade)) erros.quantidade = MENSAGEM_DA_QUANTIDADE;
      conferirTexto(erros, 'motivo', limpo.motivo, 'Descreva o motivo.');
      if (limpo.local === null) erros.local = 'Escolha o local.';
      break;
  }
  if (limpo.observacao !== null && limpo.observacao.length > LIMITES_DA_SOLICITACAO.observacao) {
    erros.observacao = maisQue(LIMITES_DA_SOLICITACAO.observacao);
  }
  return erros;
}

/** Por que a solicitação não muda de situação (spec solicitacoes, "Situação da solicitação"). */
export type RecusaDaSituacao =
  | { motivo: 'ja-esta'; situacao: SituacaoDaSolicitacao }
  | { motivo: 'aguardando-no-conserto' }
  | { motivo: 'toner-pela-entrega' }
  | { motivo: 'toner-sem-fornecedor' }
  | { motivo: 'segue-a-ordem'; ordem: number }
  | { motivo: 'nao-atende' }
  | { motivo: 'nao-encontrada' };

/**
 * A recusa de passar a solicitação à situação nova; nula quando ela pode mudar. A concluída e a
 * cancelada não mudam mais, e a mudança para a mesma situação também é recusada. O conserto com a OS
 * em aberto segue a OS (spec solicitacoes, "Conserto com a ordem de serviço"). O toner se conclui
 * pela entrega dos itens; no lote, com o pedido ao fornecedor, os itens pendentes ficam entregues
 * por ele (spec solicitacoes, "Mudança da situação em lote").
 */
export function recusaDaSituacao({
  tipo,
  atual,
  nova,
  noLote = false,
  comFornecedor = false,
  segueAOrdem = null,
}: {
  tipo: TipoDeSolicitacao;
  atual: SituacaoDaSolicitacao;
  nova: SituacaoDeDestino;
  noLote?: boolean;
  comFornecedor?: boolean;
  /** O número da OS em aberto que a solicitação segue. */
  segueAOrdem?: number | null;
}): RecusaDaSituacao | null {
  if (!situacaoPendente(atual)) return { motivo: 'ja-esta', situacao: atual };
  if (segueAOrdem !== null) return { motivo: 'segue-a-ordem', ordem: segueAOrdem };
  if (atual === nova) return { motivo: 'ja-esta', situacao: atual };
  if (nova === 'aguardando-entrega' && tipo === 'conserto') {
    return { motivo: 'aguardando-no-conserto' };
  }
  if (nova === 'concluida' && tipo === 'toner') {
    if (!noLote) return { motivo: 'toner-pela-entrega' };
    if (!comFornecedor) return { motivo: 'toner-sem-fornecedor' };
  }
  return null;
}

const emMinusculas = (situacao: SituacaoDaSolicitacao) =>
  ROTULOS_DAS_SITUACOES_DA_SOLICITACAO[situacao].toLocaleLowerCase('pt-BR');

/** A recusa de uma solicitação só, como a API e a gaveta a mostram. */
export function mensagemDaRecusa(numero: number, recusa: RecusaDaSituacao): string {
  switch (recusa.motivo) {
    case 'ja-esta':
      return `A solicitação ${numero} já está ${emMinusculas(recusa.situacao)}.`;
    case 'aguardando-no-conserto':
      return 'Aguardando entrega vale só para toner e equipamento.';
    case 'toner-pela-entrega':
      return 'O toner se conclui pela entrega dos itens.';
    case 'toner-sem-fornecedor':
      return 'O toner sem fornecedor se conclui pela entrega.';
    case 'segue-a-ordem':
      return `A solicitação ${numero} segue a OS ${recusa.ordem}.`;
    case 'nao-atende':
      return `Você não atende todos os locais da solicitação ${numero}.`;
    case 'nao-encontrada':
      return 'Solicitação não encontrada.';
  }
}

/** O motivo da recusa no retorno do lote, depois de "A 42 não: ". */
function motivoNoLote(recusa: RecusaDaSituacao): string {
  switch (recusa.motivo) {
    case 'ja-esta':
      return `já está ${emMinusculas(recusa.situacao)}`;
    case 'aguardando-no-conserto':
      return 'aguardando entrega vale só para toner e equipamento';
    case 'toner-pela-entrega':
      return 'o toner se conclui pela entrega dos itens';
    case 'toner-sem-fornecedor':
      return 'o toner sem fornecedor se conclui pela entrega';
    case 'segue-a-ordem':
      return `segue a OS ${recusa.ordem}`;
    case 'nao-atende':
      return 'você não atende todos os locais dela';
    case 'nao-encontrada':
      return 'não foi encontrada';
  }
}

/** O retorno do lote: quantas mudaram e, para cada uma que não mudou, o motivo. */
export function textoDoLote({
  mudaram,
  recusadas,
}: {
  mudaram: number;
  recusadas: { numero: number; recusa: RecusaDaSituacao }[];
}): string {
  const total =
    mudaram === 0
      ? 'Nenhuma solicitação mudou.'
      : mudaram === 1
        ? '1 solicitação mudou.'
        : `${mudaram.toLocaleString('pt-BR')} solicitações mudaram.`;
  return [
    total,
    ...recusadas.map(({ numero, recusa }) => `A ${numero} não: ${motivoNoLote(recusa)}.`),
  ].join(' ');
}

/** A situação do toner depois de uma entrega: concluída sem item pendente, senão esperando. */
export const situacaoDepoisDaEntrega = (pendentes: number): SituacaoDeDestino =>
  pendentes === 0 ? 'concluida' : 'aguardando-entrega';

/** A recusa do motivo do cancelamento; nula quando ele serve. */
export function validarCancelamento(motivo: string | null): string | null {
  const limpo = semPontas(motivo);
  if (limpo === null) return 'Informe o motivo do cancelamento.';
  return limpo.length > LIMITES_DA_SOLICITACAO.motivoDoCancelamento
    ? maisQue(LIMITES_DA_SOLICITACAO.motivoDoCancelamento)
    : null;
}

/** A recusa do que foi feito, opcional, na conclusão; nula quando ele serve. */
export function validarConclusao(oQueFoiFeito: string | null): string | null {
  const limpo = semPontas(oQueFoiFeito);
  return limpo !== null && limpo.length > LIMITES_DA_SOLICITACAO.texto
    ? maisQue(LIMITES_DA_SOLICITACAO.texto)
    : null;
}

/** O motivo de cada campo recusado no pedido ao fornecedor; vazio quando ele serve. */
export function validarPedidoAoFornecedor({
  fornecedor,
  os,
}: {
  fornecedor: string | null;
  os: string | null;
}): Partial<Record<'fornecedor' | 'os', string>> {
  const erros: Partial<Record<'fornecedor' | 'os', string>> = {};
  if (fornecedor === null) erros.fornecedor = 'Escolha o fornecedor.';
  const limpa = semPontas(os);
  if (limpa !== null && limpa.length > LIMITES_DA_SOLICITACAO.osDoFornecedor) {
    erros.os = maisQue(LIMITES_DA_SOLICITACAO.osDoFornecedor);
  }
  return erros;
}

/** A entrega de um item pendente do toner: do estoque ou pelo fornecedor. */
export type EntregaDoItem =
  | { item: string; origem: 'estoque'; consumivel: string | null; local: string | null }
  | { item: string; origem: 'fornecedor'; fornecedor: string | null; consumivel: string | null };

/**
 * O motivo de cada campo recusado na entrega, pelo caminho `entregas.0.consumivel`; `itens` sem
 * nenhum item escolhido. Vazio quando a entrega serve.
 */
export function validarEntrega(entregas: EntregaDoItem[]): Record<string, string> {
  if (entregas.length === 0) return { itens: 'Escolha os itens a entregar.' };
  const erros: Record<string, string> = {};
  entregas.forEach((entrega, indice) => {
    const campo = (nome: string) => `entregas.${indice}.${nome}`;
    if (entrega.origem === 'estoque') {
      if (entrega.consumivel === null) erros[campo('consumivel')] = 'Escolha o consumível.';
      if (entrega.local === null) erros[campo('local')] = 'Escolha o local.';
    } else if (entrega.fornecedor === null) {
      erros[campo('fornecedor')] = 'Escolha o fornecedor.';
    }
  });
  return erros;
}

/** Um consumível compatível com a impressora, com o saldo nos locais em que a conta vê o estoque. */
export interface CompativelParaSugestao {
  id: string;
  codigo: string;
  cor: CorDeConsumivel | null;
  ativo: boolean;
  /** Nulo para quem não vê o estoque: conta como zero na sugestão. */
  saldo: number | null;
}

/**
 * O consumível sugerido para a cor: o compatível ativo dela, o de maior saldo e, no empate, o de
 * menor código. Nulo sem compatível da cor.
 */
export function sugestaoDoConsumivel(
  compativeis: readonly CompativelParaSugestao[],
  cor: CorDeConsumivel,
): string | null {
  const daCor = compativeis
    .filter((compativel) => compativel.ativo && compativel.cor === cor)
    .sort((a, b) => (b.saldo ?? 0) - (a.saldo ?? 0) || a.codigo.localeCompare(b.codigo, 'pt-BR'));
  return daCor[0]?.id ?? null;
}

/** Os locais da solicitação pelos locais das impressoras ou do ativo; o nulo é o ativo sem local. */
export function locaisDaSolicitacao(locaisDosAtivos: readonly (string | null)[]): {
  locais: string[];
  semLocal: boolean;
} {
  const locais = [...new Set(locaisDosAtivos.filter((local) => local !== null))];
  return { locais, semLocal: locaisDosAtivos.includes(null) };
}

/** O alcance de uma permissão, como `alcance` o dá: a organização, os locais, ou nada. */
type AlcanceDaPermissao = 'organizacao' | ReadonlySet<string> | null;
interface LocaisDaSolicitacao {
  locais: readonly string[];
  semLocal: boolean;
}

/**
 * Vê a solicitação quem tem `solicitacoes.ver` em algum dos locais dela. O ativo sem local só é
 * alcançado pela organização inteira (spec solicitacoes, "Quem vê e quem atende as solicitações").
 */
export function veASolicitacao(alcance: AlcanceDaPermissao, solicitacao: LocaisDaSolicitacao) {
  if (alcance === null) return false;
  if (alcance === 'organizacao') return true;
  return solicitacao.locais.some((local) => alcance.has(local));
}

/** Atende a solicitação quem tem `solicitacoes.atender` em todos os locais dela. */
export function atendeASolicitacao(alcance: AlcanceDaPermissao, solicitacao: LocaisDaSolicitacao) {
  if (alcance === null) return false;
  if (alcance === 'organizacao') return true;
  return (
    !solicitacao.semLocal &&
    solicitacao.locais.length > 0 &&
    solicitacao.locais.every((local) => alcance.has(local))
  );
}

/** O pedido resumido numa linha da lista e na ficha do ativo. */
export type PedidoParaResumo =
  | {
      tipo: 'toner';
      impressoras: {
        rotulo: string;
        itens: { cor: CorDeConsumivel; quantidade: number }[];
      }[];
    }
  | { tipo: 'conserto'; ativo: string; defeito: string }
  | { tipo: 'equipamento'; quantidade: number; tipoDeAtivo: string };

/** "PAT-00412: 1 Preto, 2 Ciano; PAT-00415: 1 Preto", "NB-0031: Não liga" ou "2 Notebook". */
export function resumoDoPedido(pedido: PedidoParaResumo): string {
  switch (pedido.tipo) {
    case 'toner':
      return pedido.impressoras
        .map(
          ({ rotulo, itens }) =>
            `${rotulo}: ${itens
              .map(({ cor, quantidade }) => `${quantidade} ${ROTULOS_DAS_CORES_DE_CONSUMIVEL[cor]}`)
              .join(', ')}`,
        )
        .join('; ');
    case 'conserto':
      return `${pedido.ativo}: ${pedido.defeito}`;
    case 'equipamento':
      return `${pedido.quantidade} ${pedido.tipoDeAtivo}`;
  }
}

/** O contador congelado da impressora, com o momento já escrito no fuso escolhido. */
export const textoDoContadorCongelado = (paginas: number | null, lidoEm: string | null) =>
  paginas === null || lidoEm === null
    ? 'Sem leitura do total de páginas'
    : textoDoContador(paginas, lidoEm);

/** A recusa de tirar da solicitação a impressora que já tem item entregue. */
export const mensagemDaImpressoraComEntrega = (rotulo: string) =>
  `${rotulo} tem item entregue e fica na solicitação.`;

/** A recusa da impressora de um tipo sem os consumíveis compatíveis. */
export const mensagemDoAtivoSemConsumiveis = (rotulo: string) => `${rotulo} não usa consumíveis.`;

/** O retorno do registro. */
export const retornoDoRegistro = (numero: number) => `Solicitação ${numero} registrada.`;
