// As notificações dos chamados (spec chamados, "Notificações dos chamados"; change chamados-da-ti,
// design, decisão 12): o chamado passado a uma conta e o que cai na triagem, na severidade
// Informação, com a origem "Chamados" e o endereço do chamado. Quem abre, assume ou reabre não é
// avisado do próprio ato. As mensagens (change chat-com-chamados, design, decisão 6): a resposta de
// quem participa a quem atende, e a mensagem da TI e o resolvido a quem participa, pelo chat.
import { comecoDoTexto } from '../chat/mensagens.ts';
import {
  type ChamadoParaParticipar,
  type ContaNoChat,
  participaDoChamado,
} from '../chat/participacao.ts';
import type { NovaNotificacao } from '../notificacoes/notificacoes.ts';
import type { MudancaDoChamado, SituacaoDoChamado } from './acoes.ts';
import type { MudancaDeQuemParticipa } from './acoes-de-quem-participa.ts';
import { type AlcanceDeQuemAtende, atendeOChamado, type LocaisDoChamado } from './atendimento.ts';

/** O módulo que notifica os chamados, como a central o mostra. */
export const ORIGEM_DOS_CHAMADOS = 'Chamados';

/** O endereço do chamado na web, para o "Abrir" da notificação. */
export const destinoDoChamado = (numero: number) => `/chamados/${numero}`;

/** O endereço do chamado no app do chat, para quem participa dele. */
export const destinoDoChamadoNoChat = (numero: number) => `/chat/chamados/${numero}`;

/**
 * O assunto do chamado nas notificações de mensagem, que a leitura de quem participa marca como
 * lido, com o id como o banco o devolve.
 */
export const assuntoDoChamado = (chamadoId: string) => `chamado:${chamadoId.toLowerCase()}`;

/** O chamado como as notificações o leem. */
export interface ChamadoQueNotifica {
  numero: number;
  titulo: string;
  situacao: SituacaoDoChamado;
  responsavelId: string | null;
  locais: LocaisDoChamado;
}

/** A conta e o alcance de `chamados.atender` dela, para a triagem. */
export interface ContaQueRecebeATriagem {
  id: string;
  alcance: AlcanceDeQuemAtende;
}

const notificacao = (
  numero: number,
  contaId: string,
  titulo: string,
  severidade: NovaNotificacao['severidade'] = 'info',
): NovaNotificacao => ({
  contaId,
  severidade,
  titulo,
  descricao: null,
  origem: ORIGEM_DOS_CHAMADOS,
  destino: destinoDoChamado(numero),
  alertaId: null,
  mensagem: false,
  assunto: null,
  mensagemDoChatId: null,
});

/** "Chamado #1043 com você: Impressora manchando", para quem recebe o chamado. */
export function notificacaoDoPassado(
  chamado: Pick<ChamadoQueNotifica, 'numero' | 'titulo'>,
  contaId: string,
): NovaNotificacao {
  return notificacao(
    chamado.numero,
    contaId,
    `Chamado #${chamado.numero} com você: ${chamado.titulo}`,
  );
}

/**
 * "Chamado #1043 na triagem: Impressora manchando", para cada conta que atende todos os locais do
 * chamado, fora a dada (quem abriu ou devolveu); o chamado sem local, só para quem atende a
 * organização inteira.
 */
export function notificacoesDaTriagem(
  chamado: Pick<ChamadoQueNotifica, 'numero' | 'titulo' | 'locais'>,
  contas: readonly ContaQueRecebeATriagem[],
  { fora }: { fora: string },
): NovaNotificacao[] {
  const titulo = `Chamado #${chamado.numero} na triagem: ${chamado.titulo}`;
  return contas
    .filter(({ id, alcance }) => id !== fora && atendeOChamado(alcance, chamado.locais))
    .map(({ id }) => notificacao(chamado.numero, id, titulo));
}

/**
 * As notificações da abertura: o chamado que nasce com outra conta, pelo atendimento do tipo, avisa
 * essa conta; o que nasce na triagem avisa quem atende os locais dele. Quem abriu não é avisado.
 */
export function notificacoesDaAbertura(
  chamado: ChamadoQueNotifica,
  { abertoPor, contas }: { abertoPor: string; contas: readonly ContaQueRecebeATriagem[] },
): NovaNotificacao[] {
  if (chamado.situacao === 'triagem') {
    return notificacoesDaTriagem(chamado, contas, { fora: abertoPor });
  }
  if (chamado.responsavelId === null || chamado.responsavelId === abertoPor) return [];
  return [notificacaoDoPassado(chamado, chamado.responsavelId)];
}

/**
 * "Chamado #1043 passou do prazo: Impressora manchando", na severidade Atenção: para quem recebe o
 * chamado, se ainda atende os locais dele; sem ele, ou com quem não atende mais (a conta inativa, o
 * alcance mudado), para cada conta que atende os locais, como a triagem.
 */
export function notificacoesDoEstouro(
  chamado: Pick<ChamadoQueNotifica, 'numero' | 'titulo' | 'locais' | 'responsavelId'>,
  contas: readonly ContaQueRecebeATriagem[],
): NovaNotificacao[] {
  const titulo = `Chamado #${chamado.numero} passou do prazo: ${chamado.titulo}`;
  const quemAtende = contas.filter(({ alcance }) => atendeOChamado(alcance, chamado.locais));
  const responsavel = quemAtende.find(({ id }) => id === chamado.responsavelId);
  return (responsavel ? [responsavel] : quemAtende).map(({ id }) =>
    notificacao(chamado.numero, id, titulo, 'atencao'),
  );
}

/**
 * A ação do atendimento, como as notificações a leem: o passar, com a conta escolhida; o devolver,
 * com as contas e o alcance de `chamados.atender` delas; o reabrir, com quem recebe o chamado, quem o
 * resolveu, ou, na triagem, com as contas; e as que não avisam ninguém.
 */
export type AcaoQueNotifica =
  | { acao: 'passar'; para: string }
  | { acao: 'devolver'; contas: readonly ContaQueRecebeATriagem[] }
  | { acao: 'reabrir'; para: string }
  | { acao: 'reabrir'; para: null; contas: readonly ContaQueRecebeATriagem[] }
  | {
      acao: 'assumir' | 'desfazer' | 'mensagem' | 'esperar' | 'nota' | 'retomar' | 'resolver';
    };

/**
 * As notificações das ações do atendimento: o passar avisa a conta escolhida, fora quem passa a si
 * mesmo; o devolver avisa quem atende os locais, fora quem devolveu; o reabrir avisa quem resolveu,
 * a quem o chamado volta, fora quando é ela que reabre, ou, na triagem, quem atende os locais, fora
 * quem reabriu. O assumir, o desfazer, a mensagem, a espera, a nota, o retomar e o resolver não
 * avisam ninguém: quem atende não muda, ou é quem age, e nada cai na triagem.
 */
export function notificacoesDaAcao(
  chamado: Pick<ChamadoQueNotifica, 'numero' | 'titulo' | 'locais'>,
  acao: AcaoQueNotifica,
  quemAge: string,
): NovaNotificacao[] {
  switch (acao.acao) {
    case 'passar':
      return acao.para === quemAge ? [] : [notificacaoDoPassado(chamado, acao.para)];
    case 'devolver':
      return notificacoesDaTriagem(chamado, acao.contas, { fora: quemAge });
    case 'reabrir':
      if (acao.para === null) return notificacoesDaTriagem(chamado, acao.contas, { fora: quemAge });
      return acao.para === quemAge ? [] : [notificacaoDoPassado(chamado, acao.para)];
    case 'assumir':
    case 'desfazer':
    case 'mensagem':
    case 'esperar':
    case 'nota':
    case 'retomar':
    case 'resolver':
      return [];
  }
}

/** O chamado nas notificações de mensagem: o id dá o assunto. */
export interface ChamadoQueNotificaAMensagem {
  id: string;
  numero: number;
  titulo: string;
}

/** A notificação de mensagem do chamado, na severidade Informação, com o assunto dele. */
const mensagemDoChamado = (
  chamado: ChamadoQueNotificaAMensagem,
  contaId: string,
  { titulo, texto, destino }: { titulo: string; texto: string; destino: string },
): NovaNotificacao => ({
  contaId,
  severidade: 'info',
  titulo,
  descricao: comecoDoTexto(texto),
  origem: ORIGEM_DOS_CHAMADOS,
  destino,
  alertaId: null,
  mensagem: true,
  assunto: assuntoDoChamado(chamado.id),
  mensagemDoChatId: null,
});

/**
 * As notificações do que quem participa faz no chamado, à TI, pela mudança que a ação decidiu
 * (`decidirAcaoDeQuemParticipa`):
 * - a mensagem e a escolha: "Fernanda Rocha respondeu o #1041", com o começo da mensagem ou a opção
 *   escolhida, como mensagem, a quem atende o chamado depois dela, fora quem escreveu (a conta da TI
 *   que é a pessoa do chamado). Na triagem, ninguém: o chamado já está na lista dela;
 * - a reabertura, pela mensagem ou pelo "Reabrir" do resolvido: só o "Chamado #1045 com você", a
 *   quem resolveu, ou, sem ele, a triagem, fora quem reabriu. A mensagem que reabre não notifica a
 *   resposta. Só a reabertura à triagem lê as contas;
 * - a avaliação e o "Marcar como vista" não notificam.
 */
export function notificacoesDeQuemParticipa(
  chamado: ChamadoQueNotificaAMensagem & Pick<ChamadoQueNotifica, 'locais'>,
  mudanca: Pick<MudancaDeQuemParticipa, 'responsavel' | 'conversa'>,
  quem: { contaId: string; nome: string },
  contas: readonly ContaQueRecebeATriagem[],
  /** Os nomes dos anexos da mensagem, na ordem do envio: o começo da que vai só com eles. */
  anexos: readonly string[] = [],
): NovaNotificacao[] {
  let resposta: string | null = null;
  for (const entrada of mudanca.conversa) {
    if (entrada.especie === 'mensagem') resposta = comecoDoTexto(entrada.texto, anexos);
    else if (entrada.evento === 'escolheu') resposta = entrada.dados.opcao;
    else if (entrada.evento === 'reabriu') {
      const { para } = entrada.dados;
      return para === null
        ? notificacoesDaAcao(chamado, { acao: 'reabrir', para, contas }, quem.contaId)
        : notificacoesDaAcao(chamado, { acao: 'reabrir', para }, quem.contaId);
    }
  }
  const quemAtende = mudanca.responsavel;
  if (resposta === null || quemAtende === null || quemAtende === quem.contaId) return [];
  return [
    mensagemDoChamado(chamado, quemAtende, {
      titulo: `${quem.nome} respondeu o #${chamado.numero}`,
      texto: resposta,
      destino: destinoDoChamado(chamado.numero),
    }),
  ];
}

/**
 * As notificações do que a TI faz no chamado a quem participa dele pelo chat (a conta da pessoa e a
 * de quem o abriu pelo chat, quando usam o chat), como mensagem, com o endereço do chamado no app
 * do chat, pela mudança que a ação decidiu (`decidirAcao`):
 * - a mensagem para a pessoa, também a da espera: "Ana Souza respondeu o #1041", com o começo dela;
 * - o resolvido: "#1045 resolvido: Impressora manchando", com o começo do "O que foi feito", e só ele.
 *
 * Quem escreveu não é notificado, também a conta da TI que é a pessoa do chamado, e cada conta
 * recebe uma vez só. As outras ações não notificam quem participa, que as vê na conversa, e a nota
 * interna não notifica ninguém.
 */
export function notificacoesParaQuemParticipa(
  chamado: ChamadoQueNotificaAMensagem & ChamadoParaParticipar,
  mudanca: Pick<MudancaDoChamado, 'conversa'>,
  autor: { contaId: string; nome: string },
  contas: readonly Pick<ContaNoChat, 'id' | 'pessoaId' | 'usaOChat'>[],
  /** Os nomes dos anexos da mensagem, na ordem do envio: o começo da que vai só com eles. */
  anexos: readonly string[] = [],
): NovaNotificacao[] {
  let texto: string | null = null;
  let resolveu = false;
  for (const entrada of mudanca.conversa) {
    if (entrada.especie === 'mensagem') texto = comecoDoTexto(entrada.texto, anexos);
    else if (entrada.especie === 'evento' && entrada.evento === 'resolveu') resolveu = true;
  }
  if (texto === null) return [];
  const titulo = resolveu
    ? `#${chamado.numero} resolvido: ${chamado.titulo}`
    : `${autor.nome} respondeu o #${chamado.numero}`;
  const destino = destinoDoChamadoNoChat(chamado.numero);
  const recebem = new Set(
    contas
      .filter((conta) => conta.id !== autor.contaId && participaDoChamado(conta, chamado))
      .map(({ id }) => id),
  );
  return [...recebem].map((contaId) =>
    mensagemDoChamado(chamado, contaId, { titulo, texto, destino }),
  );
}
