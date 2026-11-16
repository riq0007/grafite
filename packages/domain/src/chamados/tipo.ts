// O tipo de chamado (spec tipos-de-chamado, "Tipo de chamado", "Prazo e atendimento do tipo" e "O
// que acontece depois"; change chamados-da-ti, design, decisão 6): as listas do tipo e a conferência
// da gravação. O formato do pedido é do esquema da rota; aqui ficam as recusas da spec, por campo.
// O que a API lê na transação vem no contexto: a conta de quem atende por padrão como está agora,
// os tipos de ativo ativos, o formulário gravado, o que o tipo gerava antes e o alcance das
// solicitações de quem grava. O nome repetido, quem acha é o índice único do banco.
import { normalizarTexto } from '../texto.ts';
import { type ContaQueAtendePorPadrao, ehDaTi, type SemNinguem } from './atendimento.ts';
import { type Formulario, recusaDoPedeOAtivo } from './formulario.ts';
import { type HorarioDaTi, minutosDoPrazo, type PrazoDoTipo, type ValorDoPrazo } from './prazo.ts';

/** Os ícones dos tipos de chamado, mapeados para o lucide na web (decisão 6). */
export const ICONES_DO_TIPO_DE_CHAMADO = [
  'gota',
  'notebook',
  'impressora',
  'cadeado',
  'janela',
  'globo',
  'telefone',
  'reticencias',
  'setas',
  'computador',
  'torre',
  'fone',
  'chave',
  'caixa',
  'camera',
  'wi-fi',
] as const;
export type IconeDoTipoDeChamado = (typeof ICONES_DO_TIPO_DE_CHAMADO)[number];

/** As situações do tipo: Rascunho, Em uso e Inativo. Só o Em uso recebe chamados. */
export const SITUACOES_DO_TIPO_DE_CHAMADO = ['rascunho', 'em-uso', 'inativo'] as const;
export type SituacaoDoTipoDeChamado = (typeof SITUACOES_DO_TIPO_DE_CHAMADO)[number];

/** O que o "Gera uma Solicitação" registra na abertura: nada, a de Toner ou a de Equipamento. */
export const SOLICITACOES_DO_TIPO_DE_CHAMADO = ['nao', 'toner', 'equipamento'] as const;
export type SolicitacaoDoTipoDeChamado = (typeof SOLICITACOES_DO_TIPO_DE_CHAMADO)[number];

export const MENSAGENS_DO_TIPO_DE_CHAMADO = {
  nome: 'Escreva o nome.',
  nomeLongo: 'Use até 40 caracteres.',
  /** A API a põe no nome quando a gravação bate no `tipos_de_chamado_nome_unico`. */
  nomeRepetido: 'Já existe um tipo com esse nome.',
  icone: 'Escolha o ícone.',
  frase: 'Escreva a frase.',
  fraseLonga: 'Use até 80 caracteres.',
  numeroDoPrazo: 'Use um número inteiro de 1 a 999.',
  respostaMaior: 'A resposta passa da resolução. Use uma resposta menor.',
  quemAtende: 'Escolha uma conta que atende os chamados.',
  tipoDeAtivo: 'Escolha o tipo de ativo do equipamento.',
  tonerSemAtivo: "O Toner precisa do ativo: ligue 'Pede o ativo'.",
  solicitacaoSemAlcance:
    "Só quem atende as solicitações em todos os locais liga o 'Gera uma Solicitação'.",
  /** A ordem que a tela manda, com todos os tipos da organização. */
  ordem: 'A ordem precisa ter todos os tipos, uma vez cada.',
  naoEncontrado: 'Tipo de chamado não encontrado.',
  /** "Criar o tipo" e "Descartar" no tipo que já saiu do Rascunho. */
  naoERascunho: 'Este tipo não é mais um rascunho.',
  /** Inativar e reativar o Rascunho, que só entra em uso pelo "Criar o tipo". */
  rascunho: "O rascunho entra em uso pelo 'Criar o tipo'.",
} as const;

const LIMITE_DO_NOME = 40;
const LIMITE_DA_FRASE = 80;
const MAIOR_NUMERO_DO_PRAZO = 999;

/** O tipo como a tela o grava, com o formato conferido pelo esquema da rota. */
export interface PedidoDoTipoDeChamado {
  nome: string;
  icone: string;
  /** Nula ou vazia, só no Rascunho. */
  frase: string | null;
  prazo: PrazoDoTipo;
  /** A conta de quem atende por padrão; nula, o chamado vai à triagem. */
  atendePorPadrao: string | null;
  semNinguem: SemNinguem;
  podeVirarOs: boolean;
  geraSolicitacao: SolicitacaoDoTipoDeChamado;
  /** O tipo de ativo pedido no Equipamento; fora dele, a conferência o grava nulo. */
  tipoDeAtivoDoEquipamento: string | null;
  pedeOAtivo: boolean;
  apareceParaOColaborador: boolean;
  soATiAbre: boolean;
}

/** O que o "Gera uma Solicitação" de um tipo registra. */
export interface SolicitacaoQueOTipoGera {
  geraSolicitacao: SolicitacaoDoTipoDeChamado;
  tipoDeAtivoDoEquipamento: string | null;
}

/** O que a API lê na transação da gravação. */
export interface ContextoDoTipoDeChamado {
  /** A situação em que a gravação deixa o tipo: o "Criar o tipo" o grava Em uso. */
  situacao: SituacaoDoTipoDeChamado;
  /** O que o tipo gerava antes da gravação, como está no banco. */
  antes: SolicitacaoQueOTipoGera;
  /** A conta pedida em quem atende por padrão, como está agora; nula, ela não é da organização. */
  quemAtende: ContaQueAtendePorPadrao | null;
  /** Os tipos de ativo ativos da organização. */
  tiposDeAtivo: ReadonlySet<string>;
  /** O formulário do tipo, como está gravado: ele se grava à parte. */
  formulario: Formulario;
  /** O alcance de `solicitacoes.atender` de quem grava. */
  alcanceDasSolicitacoes: 'organizacao' | ReadonlySet<string> | null;
  /** O horário da TI, cujo dia útil compara a resposta e a resolução. */
  horario: HorarioDaTi;
}

export interface TipoDeChamadoConferido extends Omit<PedidoDoTipoDeChamado, 'icone'> {
  icone: IconeDoTipoDeChamado;
  /** Sem acento, em minúsculas e com espaços simples, para o nome único da organização. */
  nomeNormalizado: string;
}

export type CampoDoTipoDeChamado =
  | 'nome'
  | 'icone'
  | 'frase'
  | 'resposta'
  | 'resolucao'
  | 'atendePorPadrao'
  | 'geraSolicitacao'
  | 'tipoDeAtivoDoEquipamento'
  | 'pedeOAtivo';

export type ConferenciaDoTipoDeChamado =
  | { ok: true; tipo: TipoDeChamadoConferido }
  | { ok: false; erros: Partial<Record<CampoDoTipoDeChamado, string>> };

/** O texto numa linha, sem os espaços das pontas e com os repetidos juntados. */
const numaLinha = (texto: string) => texto.replace(/\s+/gu, ' ').trim();

/** O tamanho em caracteres, como o `length` do banco, e não em unidades do UTF-16. */
const caracteres = (texto: string) => [...texto].length;

const ehIcone = (icone: string): icone is IconeDoTipoDeChamado =>
  (ICONES_DO_TIPO_DE_CHAMADO as readonly string[]).includes(icone);

const numeroDoPrazoValido = ({ valor }: ValorDoPrazo) =>
  Number.isInteger(valor) && valor >= 1 && valor <= MAIOR_NUMERO_DO_PRAZO;

/**
 * A gravação liga o "Gera uma Solicitação" quando o tipo passa a gerar uma solicitação ou a gerar
 * outra: a de Toner no lugar da de Equipamento, ou o contrário, ou o Equipamento de outro tipo de
 * ativo. Manter e desligar não ligam. Sem o antes, como no duplicar, liga quando o tipo gera.
 */
export function ligaASolicitacao(
  antes: SolicitacaoQueOTipoGera | null,
  depois: SolicitacaoQueOTipoGera,
): boolean {
  if (depois.geraSolicitacao === 'nao') return false;
  return (
    antes === null ||
    antes.geraSolicitacao !== depois.geraSolicitacao ||
    antes.tipoDeAtivoDoEquipamento !== depois.tipoDeAtivoDoEquipamento
  );
}

/**
 * Confere a gravação do tipo pelas recusas da spec, todas de uma vez e por campo: na mesma chave,
 * vale a primeira. O "Gera uma Solicitação" pede `solicitacoes.atender` na organização inteira só
 * quando a gravação o liga (`ligaASolicitacao`).
 */
export function conferirTipoDeChamado(
  pedido: PedidoDoTipoDeChamado,
  contexto: ContextoDoTipoDeChamado,
): ConferenciaDoTipoDeChamado {
  const erros: Partial<Record<CampoDoTipoDeChamado, string>> = {};
  const anotar = (campo: CampoDoTipoDeChamado, mensagem: string) => {
    erros[campo] ??= mensagem;
  };
  const M = MENSAGENS_DO_TIPO_DE_CHAMADO;

  const nome = numaLinha(pedido.nome);
  if (nome === '') anotar('nome', M.nome);
  else if (caracteres(nome) > LIMITE_DO_NOME) anotar('nome', M.nomeLongo);

  const icone = ehIcone(pedido.icone) ? pedido.icone : null;
  if (icone === null) anotar('icone', M.icone);

  const frase = numaLinha(pedido.frase ?? '');
  if (frase === '' && contexto.situacao !== 'rascunho') anotar('frase', M.frase);
  else if (caracteres(frase) > LIMITE_DA_FRASE) anotar('frase', M.fraseLonga);

  const { resposta, resolucao, modo } = pedido.prazo;
  if (!numeroDoPrazoValido(resposta)) anotar('resposta', M.numeroDoPrazo);
  if (!numeroDoPrazoValido(resolucao)) anotar('resolucao', M.numeroDoPrazo);
  if (
    numeroDoPrazoValido(resposta) &&
    numeroDoPrazoValido(resolucao) &&
    minutosDoPrazo(resposta, modo, contexto.horario) >
      minutosDoPrazo(resolucao, modo, contexto.horario)
  ) {
    anotar('resposta', M.respostaMaior);
  }

  const conta = contexto.quemAtende;
  if (pedido.atendePorPadrao !== null) {
    const atende = conta !== null && conta.id === pedido.atendePorPadrao && ehDaTi(conta);
    if (!atende) anotar('atendePorPadrao', M.quemAtende);
  } else if (pedido.semNinguem === 'fica') {
    anotar('atendePorPadrao', M.quemAtende);
  }

  const depois: SolicitacaoQueOTipoGera = {
    geraSolicitacao: pedido.geraSolicitacao,
    tipoDeAtivoDoEquipamento:
      pedido.geraSolicitacao === 'equipamento' ? pedido.tipoDeAtivoDoEquipamento : null,
  };
  if (depois.geraSolicitacao === 'equipamento') {
    const tipoDeAtivo = depois.tipoDeAtivoDoEquipamento;
    if (tipoDeAtivo === null || !contexto.tiposDeAtivo.has(tipoDeAtivo)) {
      anotar('tipoDeAtivoDoEquipamento', M.tipoDeAtivo);
    }
  }
  if (depois.geraSolicitacao === 'toner' && !pedido.pedeOAtivo) {
    anotar('pedeOAtivo', M.tonerSemAtivo);
  }
  if (pedido.pedeOAtivo) {
    const recusa = recusaDoPedeOAtivo(contexto.formulario.campos);
    if (recusa) anotar('pedeOAtivo', recusa);
  }
  if (
    ligaASolicitacao(contexto.antes, depois) &&
    contexto.alcanceDasSolicitacoes !== 'organizacao'
  ) {
    anotar('geraSolicitacao', M.solicitacaoSemAlcance);
  }

  if (Object.keys(erros).length > 0 || icone === null) return { ok: false, erros };
  // Campo a campo, para o que vier a mais no pedido não seguir para a gravação.
  return {
    ok: true,
    tipo: {
      nome,
      nomeNormalizado: normalizarTexto(nome),
      icone,
      frase: frase === '' ? null : frase,
      prazo: { modo, resposta: { ...resposta }, resolucao: { ...resolucao } },
      atendePorPadrao: pedido.atendePorPadrao,
      semNinguem: pedido.semNinguem,
      podeVirarOs: pedido.podeVirarOs,
      geraSolicitacao: depois.geraSolicitacao,
      tipoDeAtivoDoEquipamento: depois.tipoDeAtivoDoEquipamento,
      pedeOAtivo: pedido.pedeOAtivo,
      apareceParaOColaborador: pedido.apareceParaOColaborador,
      soATiAbre: pedido.soATiAbre,
    },
  };
}
