// A ordem de serviço (spec ordens-de-servico; change p4e-ordens-de-servico, design, decisão 1): o
// trabalho da TI num ativo, as situações e as mudanças entre elas, a conferência de cada ação e os
// textos que as telas e a auditoria mostram. A web confere antes de enviar com as mesmas regras; a
// API confere de novo, com as referências e os saldos do banco.
import { recusaDaQuantidade } from '../estoque/estoque.ts';

export const SITUACOES_DA_ORDEM = [
  'aberta',
  'em-atendimento',
  'aguardando-peca',
  'aguardando-fornecedor',
  'resolvida',
  'encerrada',
] as const;
export type SituacaoDaOrdem = (typeof SITUACOES_DA_ORDEM)[number];

export const ROTULOS_DAS_SITUACOES_DA_ORDEM: Readonly<Record<SituacaoDaOrdem, string>> = {
  aberta: 'Aberta',
  'em-atendimento': 'Em atendimento',
  'aguardando-peca': 'Aguardando peça',
  'aguardando-fornecedor': 'Aguardando fornecedor',
  resolvida: 'Resolvida',
  encerrada: 'Encerrada',
};

/** As em aberto: a OS que ainda não foi resolvida nem encerrada. */
export const SITUACOES_EM_ABERTO = [
  'aberta',
  'em-atendimento',
  'aguardando-peca',
  'aguardando-fornecedor',
] as const;

export const situacaoEmAberto = (situacao: SituacaoDaOrdem) =>
  (SITUACOES_EM_ABERTO as readonly SituacaoDaOrdem[]).includes(situacao);

/** Para onde "Mudar a situação" leva a OS em aberto, que nunca volta a Aberta. */
export const SITUACOES_DE_ATENDIMENTO = [
  'em-atendimento',
  'aguardando-peca',
  'aguardando-fornecedor',
] as const;
export type SituacaoDeAtendimento = (typeof SITUACOES_DE_ATENDIMENTO)[number];

/** As do lote, sem a Aguardando fornecedor, que pede o fornecedor de cada uma. */
export const SITUACOES_DO_LOTE_DAS_ORDENS = [
  'em-atendimento',
  'aguardando-peca',
  'encerrada',
] as const;
export type SituacaoDoLoteDasOrdens = (typeof SITUACOES_DO_LOTE_DAS_ORDENS)[number];

export const LIMITES_DA_ORDEM = {
  problema: 1000,
  /** O que foi feito, na resolução. */
  solucao: 1000,
  observacao: 500,
  /** O da reabertura e o do encerramento sem resolver. */
  motivo: 200,
  osDoFornecedor: 40,
  lote: 200,
} as const;

export type CampoDaOrdem =
  | 'ativo'
  | 'problema'
  | 'situacao'
  | 'observacao'
  | 'fornecedor'
  | 'os'
  | 'consumivel'
  | 'local'
  | 'quantidade';

/** O motivo de cada campo recusado; vazio quando o que foi pedido serve. */
export type ErrosDaOrdem = Partial<Record<CampoDaOrdem, string>>;

/** O fornecedor da Aguardando fornecedor e da correção, com o número da OS nele. */
export interface FornecedorDaOrdem {
  fornecedor: string | null;
  os: string | null;
}

const maisQue = (limite: number) => `Use até ${limite.toLocaleString('pt-BR')} caracteres.`;

const semPontas = (texto: string | null) => {
  const limpo = texto?.trim() ?? '';
  return limpo === '' ? null : limpo;
};

/** A recusa de um texto que a ação pede; nula quando ele serve. */
function recusaDoTexto(texto: string | null, vazio: string, limite: number): string | null {
  const limpo = semPontas(texto);
  if (limpo === null) return vazio;
  return limpo.length > limite ? maisQue(limite) : null;
}

/** A recusa de um texto opcional; nula quando ele serve. */
function recusaDoOpcional(texto: string | null, limite: number): string | null {
  const limpo = semPontas(texto);
  return limpo !== null && limpo.length > limite ? maisQue(limite) : null;
}

function conferir(erros: ErrosDaOrdem, campo: CampoDaOrdem, recusa: string | null) {
  if (recusa !== null) erros[campo] = recusa;
}

function conferirFornecedor(erros: ErrosDaOrdem, { fornecedor, os }: FornecedorDaOrdem) {
  if (fornecedor === null) erros.fornecedor = 'Escolha o fornecedor.';
  conferir(erros, 'os', recusaDoOpcional(os, LIMITES_DA_ORDEM.osDoFornecedor));
}

const recusaDoProblema = (problema: string | null) =>
  recusaDoTexto(problema, 'Descreva o problema.', LIMITES_DA_ORDEM.problema);

/** A abertura: o ativo e o problema. */
export function validarAberturaDaOrdem({
  ativo,
  problema,
}: {
  ativo: string | null;
  problema: string | null;
}): ErrosDaOrdem {
  const erros: ErrosDaOrdem = {};
  if (ativo === null) erros.ativo = 'Escolha o ativo.';
  conferir(erros, 'problema', recusaDoProblema(problema));
  return erros;
}

/** A correção: o problema e, na OS com o fornecedor, o fornecedor e a OS dele. */
export function validarCorrecaoDaOrdem({
  problema,
  fornecedor,
}: {
  problema: string | null;
  fornecedor?: FornecedorDaOrdem;
}): ErrosDaOrdem {
  const erros: ErrosDaOrdem = {};
  conferir(erros, 'problema', recusaDoProblema(problema));
  if (fornecedor) conferirFornecedor(erros, fornecedor);
  return erros;
}

/** A mudança da situação: a situação, a observação e, na Aguardando fornecedor, o fornecedor. */
export function validarMudancaDaOrdem({
  situacao,
  observacao,
  fornecedor = { fornecedor: null, os: null },
}: {
  situacao: SituacaoDeAtendimento | null;
  observacao: string | null;
  fornecedor?: FornecedorDaOrdem;
}): ErrosDaOrdem {
  const erros: ErrosDaOrdem = {};
  if (situacao === null) erros.situacao = 'Escolha a situação.';
  conferir(erros, 'observacao', recusaDoOpcional(observacao, LIMITES_DA_ORDEM.observacao));
  if (situacao === 'aguardando-fornecedor') conferirFornecedor(erros, fornecedor);
  return erros;
}

/** A peça: o consumível, o local de origem e a quantidade, com a regra da saída do estoque. */
export function validarPecaDaOrdem({
  consumivel,
  local,
  quantidade,
}: {
  consumivel: string | null;
  local: string | null;
  /** O texto que não é um número inteiro chega como `NaN` (`lerQuantidade`, do estoque). */
  quantidade: number | null;
}): ErrosDaOrdem {
  const erros: ErrosDaOrdem = {};
  if (consumivel === null) erros.consumivel = 'Escolha o consumível.';
  if (local === null) erros.local = 'Escolha o local.';
  conferir(erros, 'quantidade', recusaDaQuantidade(quantidade));
  return erros;
}

/** A recusa do que foi feito, na resolução; nula quando ele serve. */
export const validarResolucaoDaOrdem = (solucao: string | null) =>
  recusaDoTexto(solucao, 'Descreva o que foi feito.', LIMITES_DA_ORDEM.solucao);

/** A recusa do motivo da reabertura; nula quando ele serve. */
export const validarReaberturaDaOrdem = (motivo: string | null) =>
  recusaDoTexto(motivo, 'Informe o motivo da reabertura.', LIMITES_DA_ORDEM.motivo);

/** A recusa do motivo do encerramento sem resolver; nula quando ele serve. */
export const validarEncerramentoDaOrdem = (motivo: string | null) =>
  recusaDoTexto(motivo, 'Informe o motivo do encerramento.', LIMITES_DA_ORDEM.motivo);

/** O que se faz numa OS, para conferir se a situação dela permite. */
export type AcaoNaOrdem =
  | { acao: 'mudar'; nova: SituacaoDeAtendimento }
  | { acao: 'resolver' }
  | { acao: 'reabrir' }
  | { acao: 'encerrar' }
  | { acao: 'encerrar-sem-resolver' }
  | { acao: 'lancar-peca' }
  | { acao: 'corrigir' };

/** Por que a OS não muda (spec ordens-de-servico, "Situação e histórico da OS"). */
export type RecusaNaOrdem =
  | { motivo: 'ja-esta'; situacao: SituacaoDaOrdem }
  | { motivo: 'resolvida' }
  | { motivo: 'nao-resolvida' }
  | { motivo: 'nao-em-aberto' }
  | { motivo: 'nao-atende' }
  | { motivo: 'nao-encontrada' };

/**
 * A recusa da ação na OS com a situação atual; nula quando ela pode. A em aberto muda entre as de
 * atendimento, recebe a peça e a correção, resolve-se ou se encerra sem resolver; a Resolvida
 * reabre ou se encerra; a Encerrada não muda mais.
 */
export function recusaNaOrdem(atual: SituacaoDaOrdem, acao: AcaoNaOrdem): RecusaNaOrdem | null {
  const emAberto = situacaoEmAberto(atual);
  if (acao.acao === 'lancar-peca' || acao.acao === 'corrigir') {
    return emAberto ? null : { motivo: 'nao-em-aberto' };
  }
  if (atual === 'encerrada') return { motivo: 'ja-esta', situacao: atual };
  switch (acao.acao) {
    case 'mudar':
      if (atual === 'resolvida') return { motivo: 'resolvida' };
      return atual === acao.nova ? { motivo: 'ja-esta', situacao: atual } : null;
    case 'resolver':
      return emAberto ? null : { motivo: 'ja-esta', situacao: atual };
    case 'reabrir':
    case 'encerrar':
      return emAberto ? { motivo: 'nao-resolvida' } : null;
    case 'encerrar-sem-resolver':
      return emAberto ? null : { motivo: 'resolvida' };
  }
}

/** A situação da OS depois da ação que muda a situação. */
export function situacaoDepoisDaAcao(
  acao: Exclude<AcaoNaOrdem, { acao: 'lancar-peca' | 'corrigir' }>,
): SituacaoDaOrdem {
  switch (acao.acao) {
    case 'mudar':
      return acao.nova;
    case 'resolver':
      return 'resolvida';
    case 'reabrir':
      return 'em-atendimento';
    case 'encerrar':
    case 'encerrar-sem-resolver':
      return 'encerrada';
  }
}

/** A ação de cada situação do lote: no lote, a Encerrada é o encerramento da Resolvida. */
export const acaoDoLoteDasOrdens = (
  nova: SituacaoDoLoteDasOrdens,
): Extract<AcaoNaOrdem, { acao: 'mudar' | 'encerrar' }> =>
  nova === 'encerrada' ? { acao: 'encerrar' } : { acao: 'mudar', nova };

const emMinusculas = (situacao: SituacaoDaOrdem) =>
  ROTULOS_DAS_SITUACOES_DA_ORDEM[situacao].toLocaleLowerCase('pt-BR');

/** A recusa numa OS só, como a API e a gaveta a mostram. */
export function mensagemDaRecusaNaOrdem(numero: number, recusa: RecusaNaOrdem): string {
  switch (recusa.motivo) {
    case 'ja-esta':
      return `A OS ${numero} já está ${emMinusculas(recusa.situacao)}.`;
    case 'resolvida':
      return `A OS ${numero} está resolvida: reabra ou encerre.`;
    case 'nao-resolvida':
      return `A OS ${numero} ainda não foi resolvida.`;
    case 'nao-em-aberto':
      return `A OS ${numero} não está em aberto.`;
    case 'nao-atende':
      return `Você não atende o local da OS ${numero}.`;
    case 'nao-encontrada':
      return 'Ordem de serviço não encontrada.';
  }
}

/** O motivo da recusa no retorno do lote, depois de "A 12 não: ". */
function motivoNoLote(recusa: RecusaNaOrdem): string {
  switch (recusa.motivo) {
    case 'ja-esta':
      return `já está ${emMinusculas(recusa.situacao)}`;
    case 'resolvida':
      return 'está resolvida';
    case 'nao-resolvida':
      return 'ainda não foi resolvida';
    case 'nao-em-aberto':
      return 'não está em aberto';
    case 'nao-atende':
      return 'você não atende o local dela';
    case 'nao-encontrada':
      return 'não foi encontrada';
  }
}

/** O retorno do lote: quantas mudaram e, para cada uma que não mudou, o motivo. */
export function textoDoLoteDasOrdens({
  mudaram,
  recusadas,
}: {
  mudaram: number;
  recusadas: { numero: number; recusa: RecusaNaOrdem }[];
}): string {
  const total =
    mudaram === 0
      ? 'Nenhuma ordem de serviço mudou.'
      : mudaram === 1
        ? '1 ordem de serviço mudou.'
        : `${mudaram.toLocaleString('pt-BR')} ordens de serviço mudaram.`;
  return [
    total,
    ...recusadas.map(({ numero, recusa }) => `A ${numero} não: ${motivoNoLote(recusa)}.`),
  ].join(' ');
}

/** "OS 12": como as telas, a busca e a observação da saída do estoque citam a OS. */
export const textoDaOrdem = (numero: number) => `OS ${numero}`;

/** O retorno da abertura. */
export const retornoDaAbertura = (numero: number) => `${textoDaOrdem(numero)} aberta.`;

/** A recusa da segunda OS de uma solicitação (spec ordens-de-servico, "OS pela solicitação"). */
export const mensagemDaSolicitacaoComOrdem = (solicitacao: number, ordem: number) =>
  `A solicitação ${solicitacao} já tem a ${textoDaOrdem(ordem)}.`;

/** A recusa da OS pelo toner e pelo equipamento. */
export const MENSAGEM_DA_ORDEM_SO_DO_CONSERTO = 'A OS nasce só da solicitação de conserto.';

/** Quanto do problema entra no nome da OS. */
const PROBLEMA_NO_NOME = 60;

/** O nome da OS como alvo da auditoria: "12 · NB-0031 · Não liga", com o problema resumido. */
export function nomeDaOrdem({
  numero,
  ativo,
  problema,
}: {
  numero: number;
  ativo: string;
  problema: string;
}): string {
  const linha = problema.trim().split('\n')[0]?.trim() ?? '';
  const resumo =
    linha.length > PROBLEMA_NO_NOME ? `${linha.slice(0, PROBLEMA_NO_NOME - 1)}…` : linha;
  return `${numero} · ${ativo} · ${resumo}`;
}
