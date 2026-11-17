// A OS e a solicitação pelo chamado (spec chamados, "OS e solicitação pelo chamado";
// ordens-de-servico, "OS pelo chamado"; solicitacoes, "Solicitação pelo chamado"; change
// chamados-da-ti, design, "Virar OS (tarefa 4.16)", "Pedir toner (tarefa 4.17)" e "A solicitação
// gerada pelo tipo (tarefa 4.18)"): as recusas do chamado, que vêm antes das da abertura da OS e do
// registro, que a rota chama depois delas, e o motivo da solicitação que o tipo não conseguiu gerar.
import { MENSAGEM_DO_LOCAL_INATIVO } from '../estoque/estoque.ts';
import { MENSAGEM_DO_TIPO_INATIVO } from '../solicitacoes/solicitacoes.ts';
import type { QuemAge } from './acoes.ts';
import { mensagemDaRecusaDaAcao } from './acoes.ts';
import { type ChamadoParaEdicao, type RecusaDaEdicao, recusaDaEdicao } from './edicao.ts';

/** O chamado como o "Virar OS" o lê: a OS que ele já tem, o tipo como está agora e o ativo ligado. */
export interface ChamadoParaVirarOs extends ChamadoParaEdicao {
  /** O número da OS que o chamado já tem, ou nulo. */
  os: number | null;
  tipo: { nome: string; podeVirarOs: boolean };
  /** O id do ativo ligado, ou nulo. */
  ativo: string | null;
}

/** Por que o chamado não vira OS; `mensagemDaRecusaDoVirarOs` escreve a frase. */
export type RecusaDoVirarOs =
  | RecusaDaEdicao
  | { motivo: 'ja-tem-os'; os: number }
  | { motivo: 'tipo-nao-vira-os'; tipo: string }
  | { motivo: 'sem-ativo' };

/**
 * As recusas do chamado, nesta ordem: quem age precisa atender os locais dele; o resolvido; a OS
 * que ele já tem; o tipo que não vira OS; e o chamado sem o ativo ligado. O estado do chamado vem
 * primeiro, depois o ajuste do tipo, e por fim o ativo, que quem atende ainda pode ligar.
 */
export function recusaDoVirarOs(
  chamado: ChamadoParaVirarOs,
  quemAge: QuemAge,
): RecusaDoVirarOs | null {
  const daEdicao = recusaDaEdicao(chamado, quemAge);
  if (daEdicao) return daEdicao;
  if (chamado.os !== null) return { motivo: 'ja-tem-os', os: chamado.os };
  if (!chamado.tipo.podeVirarOs) return { motivo: 'tipo-nao-vira-os', tipo: chamado.tipo.nome };
  if (chamado.ativo === null) return { motivo: 'sem-ativo' };
  return null;
}

/** A frase da recusa, com a das ações para quem não atende e o resolvido. */
export function mensagemDaRecusaDoVirarOs(numero: number, recusa: RecusaDoVirarOs): string {
  switch (recusa.motivo) {
    case 'ja-tem-os':
      return `O chamado #${numero} já tem a OS ${recusa.os}.`;
    case 'tipo-nao-vira-os':
      return `O tipo ${recusa.tipo} não vira OS.`;
    case 'sem-ativo':
      return `O chamado #${numero} não tem um ativo ligado.`;
    default:
      return mensagemDaRecusaDaAcao(numero, recusa);
  }
}

/** O chamado como o "Pedir toner" o lê: a solicitação que ele já tem e o ativo ligado. */
export interface ChamadoParaPedirToner extends ChamadoParaEdicao {
  /** O número da solicitação que o chamado já tem, ou nulo. */
  solicitacao: number | null;
  /** O id do ativo ligado, ou nulo. */
  ativo: string | null;
}

/** Por que o chamado não pede toner; `mensagemDaRecusaDoPedirToner` escreve a frase. */
export type RecusaDoPedirToner =
  | RecusaDaEdicao
  | { motivo: 'ja-tem-solicitacao'; solicitacao: number }
  | { motivo: 'sem-ativo' };

/**
 * As recusas do chamado, nesta ordem: quem age precisa atender os locais dele; o resolvido; a
 * solicitação que ele já tem; e o chamado sem o ativo ligado. As da impressora e a permissão das
 * solicitações são as do registro, que a rota confere depois destas.
 */
export function recusaDoPedirToner(
  chamado: ChamadoParaPedirToner,
  quemAge: QuemAge,
): RecusaDoPedirToner | null {
  const daEdicao = recusaDaEdicao(chamado, quemAge);
  if (daEdicao) return daEdicao;
  if (chamado.solicitacao !== null) {
    return { motivo: 'ja-tem-solicitacao', solicitacao: chamado.solicitacao };
  }
  if (chamado.ativo === null) return { motivo: 'sem-ativo' };
  return null;
}

/** A frase da recusa, com a das ações para quem não atende e o resolvido. */
export function mensagemDaRecusaDoPedirToner(numero: number, recusa: RecusaDoPedirToner): string {
  switch (recusa.motivo) {
    case 'ja-tem-solicitacao':
      return `O chamado #${numero} já está na solicitação ${recusa.solicitacao}.`;
    case 'sem-ativo':
      return mensagemDaRecusaDoVirarOs(numero, recusa);
    default:
      return mensagemDaRecusaDaAcao(numero, recusa);
  }
}

/**
 * Por que a solicitação que o tipo gera não nasceu na abertura: o módulo Operação desligado, o Toner
 * sem o ativo ligado e o Equipamento sem local, que a abertura confere, ou a recusa do registro, com
 * a frase e os campos dele e os nomes do tipo de ativo e do local pedidos.
 */
export type SolicitacaoNaoGerada =
  | { motivo: 'modulo-desligado' }
  | { motivo: 'sem-ativo' }
  | { motivo: 'sem-local'; pessoa: string }
  | {
      motivo: 'recusa';
      frase: string;
      campos?: Readonly<Record<string, string>> | undefined;
      nomes: { tipoDeAtivo: string | null; local: string | null };
    };

/**
 * O motivo que a conversa guarda, depois de "A solicitação não foi gerada: ". Na recusa do registro,
 * o tipo de ativo e o local inativos vêm pelo nome, nessa ordem quando são os dois; a outra recusa é
 * a frase do primeiro campo, ou a da recusa sem campo.
 */
export function motivoDaSolicitacaoNaoGerada(caso: SolicitacaoNaoGerada): string {
  switch (caso.motivo) {
    case 'modulo-desligado':
      return 'o módulo Operação está desligado.';
    case 'sem-ativo':
      return 'o chamado não tem um ativo ligado.';
    case 'sem-local':
      return `${caso.pessoa} não tem local de trabalho.`;
    case 'recusa': {
      const { campos = {}, nomes } = caso;
      if (campos.tipoDeAtivo === MENSAGEM_DO_TIPO_INATIVO && nomes.tipoDeAtivo !== null) {
        return `o tipo de ativo ${nomes.tipoDeAtivo} está inativo.`;
      }
      if (campos.local === MENSAGEM_DO_LOCAL_INATIVO && nomes.local !== null) {
        return `o local ${nomes.local} está inativo.`;
      }
      return Object.values(campos)[0] ?? caso.frase;
    }
  }
}

/**
 * O que o evento `solicitacao-nao-gerada` guarda: o motivo escrito na hora ou, no Equipamento sem
 * local, só o caso. A frase dele tem o nome da pessoa, que é uma referência a ela: a ficha a escreve
 * com o nome de agora, e a pessoa anonimizada aparece com o nome anonimizado (spec chamados, "a
 * anonimização troca a referência à pessoa, e não o texto livre").
 */
export type DadosDaSolicitacaoNaoGerada = { motivo: string } | { semLocal: true };

/** O motivo do evento como a ficha o lê, com o nome de agora da pessoa do chamado; o ilegível é nulo. */
export function motivoDoEventoNaoGerado(
  dados: Readonly<Record<string, unknown>> | null,
  pessoa: string,
): string | null {
  if (dados?.semLocal === true)
    return motivoDaSolicitacaoNaoGerada({ motivo: 'sem-local', pessoa });
  return typeof dados?.motivo === 'string' ? dados.motivo : null;
}

/** A frase da conversa, pelo motivo guardado. */
export const fraseDaSolicitacaoNaoGerada = (motivo: string) =>
  `A solicitação não foi gerada: ${motivo}`;

/** O motivo da solicitação de Equipamento gerada pelo tipo: o número e o título do chamado. */
export const motivoDoEquipamento = (numero: number, titulo: string) =>
  `Chamado #${numero}: ${titulo}`;
