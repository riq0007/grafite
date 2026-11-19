// As palavras do colaborador (spec chamados, "Leitura do chamado pela pessoa"; spec modulo-chat,
// "Chamado no chat" e "Chat no celular"; change chat-com-chamados, design, decisões 9 e 15): a
// situação, as etapas, os eventos, com o "Você" a quem lê, e a previsão da resposta.
import type { SituacaoDoChamado } from './acoes.ts';
import { nivelDaAvaliacao, ROTULOS_DOS_NIVEIS_DA_AVALIACAO } from './avaliacao.ts';
import type { EtapaDoChamado } from './caminho.ts';
import { type ModoDoPrazo, textoDoValorDoPrazo, type ValorDoPrazo } from './prazo.ts';

/** A situação nas palavras de quem participa, que também nomeia as etapas. */
export const SITUACOES_PARA_QUEM_PARTICIPA: Record<SituacaoDoChamado, string> = {
  triagem: 'Aberto',
  'em-atendimento': 'Em andamento',
  aguardando: 'Aguardando você',
  resolvido: 'Resolvido',
};

/** A situação para quem participa: o resolvido que não se reabre mais é o Fechado. */
export function situacaoParaQuemParticipa(situacao: SituacaoDoChamado, fechado: boolean): string {
  return situacao === 'resolvido' && fechado ? 'Fechado' : SITUACOES_PARA_QUEM_PARTICIPA[situacao];
}

/**
 * A situação no chat, no chip da citação e em "Chamados da equipe": nas palavras do colaborador, com
 * a espera como "Aguardando o colaborador", a palavra da TI, a quem não participa do chamado, como
 * quem é da equipe ou o vê com `chamados.ver`: a resposta não é dele (change chat-com-chamados,
 * design, decisão 15).
 */
export function situacaoNoChat(
  situacao: SituacaoDoChamado,
  fechado: boolean,
  participaDoChamado: boolean,
): string {
  if (situacao === 'aguardando' && !participaDoChamado) return 'Aguardando o colaborador';
  return situacaoParaQuemParticipa(situacao, fechado);
}

/**
 * A etapa em texto: o nome e a hora da chegada, como "Aberto · ontem 17:05", que a tela escreve
 * (`hora`); a pulada, só o nome; e a que ainda não veio, "Resolvido · ainda não".
 */
export function textoDaEtapa(etapa: EtapaDoChamado, hora: (em: Date) => string): string {
  const nome = SITUACOES_PARA_QUEM_PARTICIPA[etapa.situacao];
  switch (etapa.estado) {
    case 'chegou':
      return `${nome} · ${hora(etapa.em)}`;
    case 'pulada':
      return nome;
    case 'ainda-nao':
      return `${nome} · ainda não`;
  }
}

/**
 * A previsão da resposta, pelo prazo de resposta que o chamado copiou do tipo, como "responde em
 * ~1 h", só na vez da TI: na triagem e em atendimento. No aguardando, a TI espera a pessoa, e o
 * resolvido não espera resposta.
 */
export function previsaoDaResposta({
  situacao,
  prazo,
}: {
  situacao: SituacaoDoChamado;
  prazo: { modo: ModoDoPrazo; resposta: ValorDoPrazo };
}): string | null {
  if (situacao !== 'triagem' && situacao !== 'em-atendimento') return null;
  return `responde em ~${textoDoValorDoPrazo(prazo.resposta, prazo.modo)}`;
}

/** A conta que a frase cita: quem agiu ou quem recebe o chamado. */
export interface ContaNaFrase {
  conta: string;
  nome: string;
}

/** O evento da conversa, no que a frase de quem participa lê. */
export interface EventoParaQuemParticipa {
  evento: string;
  /** Quem agiu; nulo no fechamento, o único evento sem autor. */
  autor: ContaNaFrase | null;
  /** No passar, quem recebe o chamado. */
  para?: ContaNaFrase | null;
  /** Na avaliação, o nível, como os dados do evento o guardam. */
  nivel?: unknown;
}

/**
 * A frase do evento para quem participa, com o "Você" quando a conta citada é a que lê. Fica de
 * fora, com o nulo, o que a pessoa não lê (o desfazer, a troca do ativo, a OS e a solicitação), a
 * escolha, que fica na própria pergunta, e o evento sem o dado da frase, como o de uma versão mais
 * nova.
 */
export function fraseDoEventoParaQuemParticipa(
  evento: EventoParaQuemParticipa,
  contaQueLe: string,
): string | null {
  const { autor } = evento;
  const quem = ({ conta, nome }: ContaNaFrase) => (conta === contaQueLe ? 'Você' : nome);
  switch (evento.evento) {
    case 'abertura':
      if (!autor) return null;
      return autor.conta === contaQueLe
        ? 'Recebemos o seu chamado'
        : `${autor.nome} abriu este chamado para você`;
    case 'assumiu':
      return autor ? `${quem(autor)} está atendendo o chamado` : null;
    case 'passou':
      return evento.para ? `${quem(evento.para)} está atendendo o chamado` : null;
    case 'devolveu':
      return 'O chamado voltou para a fila da TI';
    case 'aguardando':
      return 'Aguardando você';
    case 'retomou':
      return 'O atendimento continua';
    case 'resolveu':
      return autor ? `${quem(autor)} resolveu o chamado` : null;
    case 'reabriu':
      return autor ? `${quem(autor)} reabriu o chamado` : null;
    case 'avaliou': {
      const nivel = nivelDaAvaliacao(evento.nivel);
      if (!autor || !nivel) return null;
      const { nome, descricao } = ROTULOS_DOS_NIVEIS_DA_AVALIACAO[nivel];
      return `${quem(autor)} avaliou: ${nome} · ${descricao}`;
    }
    case 'fechou':
      return 'O chamado fechou';
    default:
      return null;
  }
}
