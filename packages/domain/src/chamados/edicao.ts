// A troca do ativo, do título e dos campos da TI (spec chamados, "Ativo ligado e campos da TI";
// change chamados-da-ti, design, "O ativo, o título e os campos da TI" e "O local da pessoa na
// abertura", tarefa 4.15): a recusa das três, de quem não atende os locais do chamado e do chamado
// resolvido, e a decisão da troca do ativo, com os locais refeitos pelo local da pessoa na abertura e
// o do ativo novo. O título é conferido pelo `conferirTituloDoChamado` (`titulo-e-resumo.ts`), e os
// campos, pelo `mudarCamposDaTi` (`respostas.ts`).

import { locaisDaSolicitacao } from '../solicitacoes/solicitacoes.ts';
import {
  type ChamadoParaAcao,
  type ContaQueRecebe,
  type EventoDaAcao,
  type LocaisComNome,
  type LocalDoChamado,
  mensagemDaRecusaDaAcao,
  type QuemAge,
  type RecusaDaAcao,
  recusaDeQuemAge,
  recusaDeQuemRecebe,
} from './acoes.ts';

/** O chamado como as três mudanças o leem. */
export type ChamadoParaEdicao = Pick<
  ChamadoParaAcao,
  'numero' | 'situacao' | 'locais' | 'semLocal'
>;

/** A recusa das três: quem age não atende os locais do chamado, ou ele está resolvido. */
export type RecusaDaEdicao = Extract<RecusaDaAcao, { motivo: 'voce-nao-atende' | 'resolvido' }>;

/**
 * Quem age precisa atender os locais do chamado, e o resolvido não muda, nessa ordem, como nas
 * ações. A frase é a das ações (`mensagemDaRecusaDaAcao`).
 */
export function recusaDaEdicao(
  chamado: ChamadoParaEdicao,
  quemAge: QuemAge,
): RecusaDaEdicao | null {
  const daConta = recusaDeQuemAge(quemAge, chamado);
  if (daConta) return daConta;
  return chamado.situacao === 'resolvido' ? { motivo: 'resolvido' } : null;
}

/** O chamado como a troca do ativo o lê: a versão, o ativo ligado e o local da pessoa na abertura. */
export interface ChamadoParaTrocaDoAtivo extends ChamadoParaEdicao {
  versao: number;
  /** O id do ativo ligado, ou nulo. */
  ativo: string | null;
  /** O local de trabalho da pessoa na abertura (`local_da_pessoa`), ou nulo, sem ele. */
  localDaPessoa: LocalDoChamado | null;
}

export interface PedidoDeTrocaDoAtivo {
  /** O ativo novo, já conferido pela API, com o local dele, ou nulo, para tirar o ativo. */
  ativo: { id: string; local: LocalDoChamado | null } | null;
  /** A versão que a tela mostra, quando ela a manda. */
  versao?: number | undefined;
}

/** Por que a troca não acontece; `mensagemDaRecusaDaTrocaDoAtivo` escreve a frase. */
export type RecusaDaTrocaDoAtivo =
  | RecusaDaEdicao
  | Extract<RecusaDaAcao, { motivo: 'nao-atende' }>
  /** A tela mostrava a versão de antes de outra mudança. */
  | { motivo: 'versao' };

export type DecisaoDaTrocaDoAtivo =
  /** O ativo que já está ligado, ou tirar o que não há: nada muda. */
  | { aceita: true; muda: false }
  | ({
      aceita: true;
      muda: true;
      evento: Extract<EventoDaAcao, { evento: 'ativo' }>;
    } & LocaisComNome)
  | { aceita: false; recusa: RecusaDaTrocaDoAtivo };

/**
 * Os locais da troca, pela regra da abertura (`locaisDaSolicitacao`, com os ids): o da pessoa e o do
 * ativo, sem repetir, e o chamado sem local quando um dos dois não tem. Os nomes são os dos dois
 * locais que a troca já tem.
 */
function locaisDaTroca(
  daPessoa: LocalDoChamado | null,
  ativo: PedidoDeTrocaDoAtivo['ativo'],
): LocaisComNome {
  const todos = [daPessoa, ...(ativo ? [ativo.local] : [])];
  const { locais, semLocal } = locaisDaSolicitacao(todos.map((local) => local?.id ?? null));
  const porId = new Map(todos.flatMap((local) => (local ? [[local.id, local] as const] : [])));
  return { locais: locais.flatMap((id) => porId.get(id) ?? []), semLocal };
}

/**
 * Decide a troca do ativo, na ordem das ações: a versão que a tela mandou, quem age nos locais de
 * agora e o chamado resolvido (`recusaDaEdicao`); o mesmo ativo, que não muda nada; e, com os locais
 * novos, quem age e quem está com o chamado, como a conta está agora: a inativa também é recusada,
 * porque o chamado precisa ser passado antes. Os locais novos são o da pessoa na abertura e o do
 * ativo novo, e não o local de agora da pessoa.
 */
export function decidirTrocaDoAtivo(
  chamado: ChamadoParaTrocaDoAtivo,
  quemAge: QuemAge,
  responsavel: ContaQueRecebe | null,
  pedido: PedidoDeTrocaDoAtivo,
): DecisaoDaTrocaDoAtivo {
  if (pedido.versao !== undefined && pedido.versao !== chamado.versao) {
    return { aceita: false, recusa: { motivo: 'versao' } };
  }
  const daEdicao = recusaDaEdicao(chamado, quemAge);
  if (daEdicao) return { aceita: false, recusa: daEdicao };
  const depois = pedido.ativo?.id ?? null;
  if (depois === chamado.ativo) return { aceita: true, muda: false };
  const novos = locaisDaTroca(chamado.localDaPessoa, pedido.ativo);
  const daConta = recusaDeQuemAge(quemAge, novos);
  if (daConta) return { aceita: false, recusa: daConta };
  const naoRecebe = responsavel && recusaDeQuemRecebe(responsavel, novos);
  if (naoRecebe) return { aceita: false, recusa: naoRecebe };
  return {
    aceita: true,
    muda: true,
    ...novos,
    evento: { evento: 'ativo', dados: { antes: chamado.ativo, depois } },
  };
}

/** A frase da recusa da troca do ativo, com o primeiro nome de quem está com o chamado. */
export function mensagemDaRecusaDaTrocaDoAtivo(
  numero: number,
  recusa: RecusaDaTrocaDoAtivo,
): string {
  switch (recusa.motivo) {
    case 'versao':
      return `O chamado #${numero} mudou. Confira antes de trocar o ativo.`;
    case 'nao-atende':
      return `${mensagemDaRecusaDaAcao(numero, recusa)} Passe o chamado antes de trocar o ativo.`;
    default:
      return mensagemDaRecusaDaAcao(numero, recusa);
  }
}
