// As ações de quem participa do chamado (spec chamados, "Resposta da pessoa", "Pergunta com opções",
// "Avaliação do atendimento", "Resposta nova" e "Fechamento do chamado"; change chat-com-chamados,
// design, decisão 9): a matriz situação × ação, com o Fechado, ao lado da matriz da TI
// (`MATRIZ_DAS_ACOES`), cujo retomar e reabrir a mensagem, a escolha e o "Reabrir" fazem; a mudança
// que a rota aplica, com o chamado travado; e a recusa com a frase da spec. Quem participa pela TI
// fala pela TI (change andamento-e-varias-mensagens, decisão 4).
import { lerTexto } from '../campos/textos.ts';
import {
  type AcaoDoChamado,
  type ContaQueRecebe,
  type EfeitoNoRelogio,
  LIMITES_DA_CONVERSA,
  type LocaisComNome,
  MATRIZ_DAS_ACOES,
  mensagemDaRecusaDaAcao,
  type RecusaDaAcao,
  recusaDeQuemRecebe,
  SITUACOES_DO_CHAMADO,
  type SituacaoDoChamado,
} from './acoes.ts';
import { conferirAvaliacao, LIMITE_DO_COMENTARIO, type NivelDaAvaliacao } from './avaliacao.ts';
import type { SituacaoComOFechado } from './fechamento.ts';
import { MENSAGENS_DA_PERGUNTA } from './pergunta.ts';

/** As ações de quem participa, na ordem da spec. */
export const ACOES_DE_QUEM_PARTICIPA = [
  'responder',
  'escolher',
  'reabrir',
  'avaliar',
  'vista',
] as const;
export type AcaoDeQuemParticipa = (typeof ACOES_DE_QUEM_PARTICIPA)[number];

/** As situações para quem participa: as do banco e o Fechado, o resolvido vencido (`estaFechado`). */
export const SITUACOES_DE_QUEM_PARTICIPA = [
  ...SITUACOES_DO_CHAMADO,
  'fechado',
] as const satisfies readonly SituacaoComOFechado[];

/** A recusa da célula, que vale para toda conta que participa. */
export type RecusaDaCelulaDeQuemParticipa =
  | 'fechado'
  | 'escreva-para-reabrir'
  | 'nao-resolvido'
  | 'avaliar-sem-resolver';

/**
 * Uma célula da matriz: nada muda no chamado; a ação da TI que a de quem participa faz, o retomar
 * do aguardando ou o reabrir do resolvido, pela `MATRIZ_DAS_ACOES`; ou a recusa.
 */
export type CelulaDeQuemParticipa =
  | { faz: 'nada' }
  | { faz: Extract<AcaoDoChamado, 'retomar' | 'reabrir'> }
  | { recusa: RecusaDaCelulaDeQuemParticipa };

/**
 * A tabela da spec, ação por ação, situação por situação. O Fechado recusa tudo, fora a marcação
 * como vista, que muda só a leitura da conta, e não o chamado (design, decisão 15).
 */
export const MATRIZ_DE_QUEM_PARTICIPA: Readonly<
  Record<AcaoDeQuemParticipa, Readonly<Record<SituacaoComOFechado, CelulaDeQuemParticipa>>>
> = {
  responder: {
    triagem: { faz: 'nada' },
    'em-atendimento': { faz: 'nada' },
    aguardando: { faz: 'retomar' },
    resolvido: { faz: 'reabrir' },
    fechado: { recusa: 'fechado' },
  },
  escolher: {
    triagem: { faz: 'nada' },
    'em-atendimento': { faz: 'nada' },
    aguardando: { faz: 'retomar' },
    resolvido: { recusa: 'escreva-para-reabrir' },
    fechado: { recusa: 'fechado' },
  },
  reabrir: {
    triagem: { recusa: 'nao-resolvido' },
    'em-atendimento': { recusa: 'nao-resolvido' },
    aguardando: { recusa: 'nao-resolvido' },
    resolvido: { faz: 'reabrir' },
    fechado: { recusa: 'fechado' },
  },
  avaliar: {
    triagem: { recusa: 'avaliar-sem-resolver' },
    'em-atendimento': { recusa: 'avaliar-sem-resolver' },
    aguardando: { recusa: 'avaliar-sem-resolver' },
    resolvido: { faz: 'nada' },
    fechado: { recusa: 'fechado' },
  },
  vista: {
    triagem: { faz: 'nada' },
    'em-atendimento': { faz: 'nada' },
    aguardando: { faz: 'nada' },
    resolvido: { faz: 'nada' },
    fechado: { faz: 'nada' },
  },
};

/** O chamado como as ações de quem participa o leem, lido com ele travado. */
export interface ChamadoParaQuemParticipa extends LocaisComNome {
  numero: number;
  situacao: SituacaoDoChamado;
  /** O resolvido vencido, pelo `estaFechado`: também o que a tarefa do fechamento ainda não fechou. */
  fechado: boolean;
  /**
   * A conta de quem atende, ou nulo, sem ninguém. No resolvido, a de quem atendia, que o resolver
   * mantém; a reabertura volta a quem resolveu, que vem no pedido.
   */
  responsavel: string | null;
  /** A resolução de agora, a chave da avaliação; nula fora do resolvido. */
  resolvidoEm: Date | null;
  /**
   * A conta que age participa dele pela TI (`participaPelaTi`), com os acessos de agora: ela
   * responde pela TI e não avalia.
   */
  pelaTi: boolean;
}

/** A pergunta da TI que a escolha responde, lida com o chamado travado. */
export interface PerguntaParaEscolher {
  /** O id da mensagem, como o banco o devolve: a chave da escolha (tarefa 3.9). */
  id: string;
  /** As opções, como foram gravadas; vazias, a mensagem não pergunta nada. */
  opcoes: readonly string[];
  /** A pergunta já tem a escolha de alguém. */
  respondida: boolean;
}

/**
 * O pedido da ação. A mensagem e o "Reabrir" levam quem resolveu, como a conta está agora, que a
 * reabertura do resolvido pede, ou nulo, sem a conta; fora do resolvido, a rota passa nulo. A
 * avaliação leva se a resolução de agora já foi avaliada, que a rota lê com o chamado travado.
 */
export type PedidoDeQuemParticipa =
  | { acao: 'responder'; texto: string; anexos: number; quemResolveu: ContaQueRecebe | null }
  | { acao: 'escolher'; pergunta: PerguntaParaEscolher; opcao: string }
  | { acao: 'reabrir'; quemResolveu: ContaQueRecebe | null }
  | { acao: 'avaliar'; nivel: string | null; comentario: string | null; avaliado: boolean }
  | { acao: 'vista' };

/** O evento que a ação de quem participa grava, com a conta dela como autora. */
export type EventoDeQuemParticipa =
  | { evento: 'retomou'; dados: Record<string, never> }
  | { evento: 'reabriu'; dados: { para: string | null } }
  /** A escolha, com o id da mensagem da pergunta e a opção, como foi gravada. */
  | { evento: 'escolheu'; dados: { mensagem: string; opcao: string } }
  /** A avaliação, com o nível, o comentário e a resolução, o `resolvido_em` em ISO. */
  | {
      evento: 'avaliou';
      dados: { nivel: NivelDaAvaliacao; comentario: string | null; resolucao: string };
    };

/**
 * O que a ação grava na conversa: a mensagem, da pessoa (a `autor_pessoa`), e os eventos, da conta
 * de quem participa (a `autor_conta`).
 */
export type EntradaDeQuemParticipa =
  /** O texto, nulo na mensagem só com os anexos. */
  { especie: 'mensagem'; texto: string | null } | ({ especie: 'evento' } & EventoDeQuemParticipa);

/** O que a rota aplica no chamado. */
export interface MudancaDeQuemParticipa {
  situacao: SituacaoDoChamado;
  /** A conta de quem atende depois, ou nulo, na triagem. */
  responsavel: string | null;
  relogio: EfeitoNoRelogio;
  /** Sobe quando a situação ou quem atende muda: na retomada e na reabertura. */
  sobeAVersao: boolean;
  /** O que a rota grava na conversa, nesta ordem. */
  conversa: readonly EntradaDeQuemParticipa[];
}

/** Por que a ação não acontece; `mensagemDaRecusaDeQuemParticipa` escreve a frase. */
export type RecusaDeQuemParticipa =
  | { motivo: 'fechado' }
  | { motivo: 'escreva-para-reabrir' }
  | { motivo: 'avaliar-sem-resolver' }
  | { motivo: 'ja-avaliado' }
  | { motivo: 'sem-nivel' }
  | { motivo: 'comentario-longo' }
  | { motivo: 'ja-respondida' }
  | { motivo: 'opcao-de-fora' }
  | { motivo: 'responda-pela-ti' }
  | { motivo: 'quem-atende-nao-avalia' }
  | Extract<
      RecusaDaAcao,
      { motivo: 'nao-resolvido' | 'sem-texto' | 'texto-longo' | 'anexos-demais' }
    >;

export type DecisaoDeQuemParticipa =
  | ({ aceita: true } & MudancaDeQuemParticipa)
  | { aceita: false; recusa: RecusaDeQuemParticipa };

const recusada = (recusa: RecusaDeQuemParticipa): DecisaoDeQuemParticipa => ({
  aceita: false,
  recusa,
});

/**
 * A mensagem, como a da TI: o texto sem os espaços das pontas, contado em caracteres, e os anexos.
 * Sem o texto, ela vai só com os anexos, e o texto fica nulo (tarefa 4.18).
 */
function lerAMensagem(
  texto: string,
  anexos: number,
): { texto: string | null } | { recusa: RecusaDeQuemParticipa } {
  const lido = lerTexto(texto, LIMITES_DA_CONVERSA.mensagem);
  if (!lido.ok) return { recusa: { motivo: 'texto-longo', texto: 'mensagem' } };
  if (lido.valor === null && anexos === 0) {
    return { recusa: { motivo: 'sem-texto', texto: 'mensagem' } };
  }
  if (anexos > LIMITES_DA_CONVERSA.anexos) return { recusa: { motivo: 'anexos-demais' } };
  return { texto: lido.valor };
}

/**
 * Decide a ação de quem participa pela matriz, com o chamado travado. A célula confere primeiro;
 * depois, o que a ação leva: o texto e os anexos da mensagem, a pergunta e a opção da escolha, e a
 * avaliação, com a já feita antes do nível. A mensagem e a escolha do aguardando retomam o chamado,
 * como o retomar da TI, com quem atende; a mensagem e o "Reabrir" do resolvido o reabrem, como o
 * reabrir da TI: com quem resolveu, se a conta ainda atende os locais, ou na triagem. A versão sobe
 * só na retomada e na reabertura.
 *
 * Quem participa pela TI é recusada antes da célula, como quem age na TI antes do fechado: a
 * mensagem, a escolha e o "Reabrir" vão pela TI, e quem atende não avalia. A marcação como vista
 * segue, porque muda só a leitura dela.
 */
export function decidirAcaoDeQuemParticipa(
  chamado: ChamadoParaQuemParticipa,
  pedido: PedidoDeQuemParticipa,
): DecisaoDeQuemParticipa {
  if (chamado.pelaTi && pedido.acao !== 'vista') {
    return recusada({
      motivo: pedido.acao === 'avaliar' ? 'quem-atende-nao-avalia' : 'responda-pela-ti',
    });
  }
  const partida: SituacaoComOFechado = chamado.fechado ? 'fechado' : chamado.situacao;
  const celula = MATRIZ_DE_QUEM_PARTICIPA[pedido.acao][partida];
  if ('recusa' in celula) return recusada({ motivo: celula.recusa });
  const conversa: EntradaDeQuemParticipa[] = [];
  switch (pedido.acao) {
    case 'responder': {
      const lida = lerAMensagem(pedido.texto, pedido.anexos);
      if ('recusa' in lida) return recusada(lida.recusa);
      conversa.push({ especie: 'mensagem', texto: lida.texto });
      break;
    }
    case 'escolher': {
      const { pergunta, opcao } = pedido;
      if (pergunta.respondida) return recusada({ motivo: 'ja-respondida' });
      if (!pergunta.opcoes.includes(opcao)) return recusada({ motivo: 'opcao-de-fora' });
      conversa.push({
        especie: 'evento',
        evento: 'escolheu',
        dados: { mensagem: pergunta.id, opcao },
      });
      break;
    }
    case 'avaliar': {
      if (pedido.avaliado) return recusada({ motivo: 'ja-avaliado' });
      const avaliacao = conferirAvaliacao(pedido);
      if (!avaliacao.ok) return recusada({ motivo: avaliacao.motivo });
      // A matriz só avalia o resolvido, que o banco guarda com o `resolvido_em`.
      if (chamado.resolvidoEm === null) {
        throw new Error(`O chamado #${chamado.numero} resolvido sem a resolução.`);
      }
      conversa.push({
        especie: 'evento',
        evento: 'avaliou',
        dados: {
          nivel: avaliacao.nivel,
          comentario: avaliacao.comentario,
          resolucao: chamado.resolvidoEm.toISOString(),
        },
      });
      break;
    }
    case 'reabrir':
    case 'vista':
      break;
  }
  if (celula.faz === 'nada') {
    return {
      aceita: true,
      situacao: chamado.situacao,
      responsavel: chamado.responsavel,
      relogio: 'segue',
      sobeAVersao: false,
      conversa,
    };
  }
  // A retomada e a reabertura são as da TI, pela matriz dela.
  const daTi = MATRIZ_DAS_ACOES[celula.faz][chamado.situacao];
  if ('recusa' in daTi) {
    throw new Error(`O ${celula.faz} da TI recusa o chamado #${chamado.numero} ${partida}.`);
  }
  let situacao: SituacaoDoChamado = daTi.chega;
  let responsavel = chamado.responsavel;
  if (celula.faz === 'retomar') {
    conversa.push({ especie: 'evento', evento: 'retomou', dados: {} });
  } else {
    // Sem a conta de quem resolveu, como sem quem atende os locais, o chamado volta à triagem.
    const quemResolveu = 'quemResolveu' in pedido ? pedido.quemResolveu : null;
    const recebe = quemResolveu !== null && recusaDeQuemRecebe(quemResolveu, chamado) === null;
    situacao = recebe ? daTi.chega : 'triagem';
    responsavel = recebe ? quemResolveu.id : null;
    conversa.push({ especie: 'evento', evento: 'reabriu', dados: { para: responsavel } });
  }
  return {
    aceita: true,
    situacao,
    responsavel,
    relogio: daTi.relogio,
    sobeAVersao: situacao !== chamado.situacao || responsavel !== chamado.responsavel,
    conversa,
  };
}

/** A frase da recusa, com o número do chamado onde a spec o pede. */
export function mensagemDaRecusaDeQuemParticipa(
  numero: number,
  recusa: RecusaDeQuemParticipa,
): string {
  switch (recusa.motivo) {
    case 'fechado':
      return `O chamado #${numero} está fechado. Para o mesmo problema, abra outro chamado.`;
    case 'escreva-para-reabrir':
      return `O chamado #${numero} está resolvido. Escreva para reabrir.`;
    case 'avaliar-sem-resolver':
      return 'O chamado não está resolvido.';
    case 'ja-avaliado':
      return 'O atendimento já foi avaliado.';
    case 'sem-nivel':
      return 'Escolha um nível.';
    case 'comentario-longo':
      return `Use até ${LIMITE_DO_COMENTARIO} caracteres.`;
    case 'ja-respondida':
      return MENSAGENS_DA_PERGUNTA.respondida;
    case 'opcao-de-fora':
      return MENSAGENS_DA_PERGUNTA.deFora;
    case 'responda-pela-ti':
      return `Você atende o chamado #${numero}. Responda pela TI.`;
    case 'quem-atende-nao-avalia':
      return `Quem atende o chamado #${numero} não o avalia.`;
    default:
      return mensagemDaRecusaDaAcao(numero, recusa);
  }
}
