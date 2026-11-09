// A conexão de eventos da casca (design do F2c, decisões 11 e 12): um EventSource aberto enquanto a
// sessão vale, que publica no canal cada evento uma vez só e trata os que são da casca. Uma aba
// escondida por mais de 5 min fecha a conexão e, ao voltar, a reabre de onde parou. Fica fora do
// React, como a loja da sessão, e é ligada no main.tsx.
import { TIPOS_DE_EVENTO } from '@grafite/domain';
import type { LojaDaSessao } from '../sessao/loja.ts';
import type { CanalDeEventos, EventoRecebido } from './canal.ts';

export const ENDERECO_DOS_EVENTOS = '/api/eventos';
/** Uma aba escondida por mais que isto fecha a conexão, e a reabre ao voltar. */
export const TEMPO_ESCONDIDA = 5 * 60_000;
/** A maior espera antes de validar o acesso: as telas abertas não releem todas juntas. */
export const ESPERA_MAXIMA_DO_ACESSO = 1000;
/** Quantos eventos recebidos a conexão lembra, para descartar os repetidos da retomada. */
export const EVENTOS_LEMBRADOS = 500;
/** Quanto esperar para abrir de novo a conexão que o servidor recusou. */
export const ESPERA_DA_NOVA_TENTATIVA = 30_000;

/** O `readyState` do EventSource que desistiu da conexão. */
const FECHADA = 2;

/** O que a conexão usa do EventSource do navegador. */
export interface FonteDeEventos {
  readonly readyState: number;
  onerror: ((evento: Event) => void) | null;
  addEventListener(tipo: string, ouvinte: (mensagem: MessageEvent) => void): void;
  close(): void;
}

export interface OpcoesDaConexao {
  loja: LojaDaSessao;
  canal: CanalDeEventos;
  /** A conexão pode ter perdido eventos ("reiniciar"): todas as consultas são relidas. */
  aoReiniciar: () => void;
  /** O EventSource do navegador; os testes passam um simulado. */
  criarFonte?: (url: string) => FonteDeEventos;
  /** Um número de 0 a 1, para a espera aleatória; os testes o fixam. */
  sortear?: () => number;
}

export interface ConexaoDeEventos {
  /** Passa a acompanhar a sessão e a visibilidade da página; devolve o que para e fecha. */
  ligar(): () => void;
  /**
   * Termina quando a conexão da sessão abriu: na hora, se ela já abriu, e senão na abertura. A
   * reconexão do próprio navegador não conta como fechada. Sem conexão, não termina: quem espera,
   * como a chegada, põe o prazo.
   */
  aberta(): Promise<void>;
}

export function criarConexaoDeEventos({
  loja,
  canal,
  aoReiniciar,
  criarFonte = (url) => new EventSource(url),
  sortear = Math.random,
}: OpcoesDaConexao): ConexaoDeEventos {
  let fonte: FonteDeEventos | null = null;
  /** O último evento recebido, para a reabertura começar dele. */
  let ultimo: string | null = null;
  const lembrados = new Set<string>();
  /** A aba ficou escondida tempo demais, e a conexão fechou até ela voltar. */
  let escondidaHaMuito = false;
  /** O servidor recusou a conexão, e ela espera a nova tentativa. */
  let aguardando = false;
  let escondida: ReturnType<typeof setTimeout> | null = null;
  let novaTentativa: ReturnType<typeof setTimeout> | null = null;
  const esperas = new Set<ReturnType<typeof setTimeout>>();
  /** A conexão atual já abriu, e quem espera a abertura dela. */
  let abriu = false;
  const esperandoAAbertura = new Set<() => void>();

  const sessaoVale = () => loja.ler().tipo === 'ativa';

  /** Lembra o evento; um já lembrado é repetido. */
  function lembrar(id: string): boolean {
    if (lembrados.has(id)) return false;
    lembrados.add(id);
    // O Set guarda a ordem: o mais antigo sai primeiro.
    if (lembrados.size > EVENTOS_LEMBRADOS) lembrados.delete(lembrados.values().next().value ?? '');
    return true;
  }

  function esperar(ms: number, fazer: () => void) {
    const espera = setTimeout(() => {
      esperas.delete(espera);
      fazer();
    }, ms);
    esperas.add(espera);
  }

  function receber(mensagem: MessageEvent) {
    let evento: EventoRecebido;
    try {
      evento = JSON.parse(mensagem.data);
    } catch {
      return;
    }
    if (typeof evento?.id !== 'string' || !lembrar(evento.id)) return;
    ultimo = evento.id;
    // Os eventos da casca: o acesso que mudou, o módulo ligado ou desligado e a sessão encerrada
    // mudam o que a tela mostra.
    if (evento.tipo === 'acessos.mudaram' || evento.tipo === 'modulos.mudaram') {
      esperar(sortear() * ESPERA_MAXIMA_DO_ACESSO, () => void loja.validar());
    }
    if (evento.tipo === 'sessao.encerrada') void loja.validar();
    // A própria pessoa ou a própria conta mudou, como a foto trocada pela administração: o estado
    // da sessão traz o que a casca mostra dela, como o menu do usuário.
    if (evento.tipo === 'pessoas.mudaram' && daPropriaConta(evento.alvo)) void loja.validar();
    canal.publicar(evento);
  }

  function daPropriaConta(alvo: EventoRecebido['alvo']): boolean {
    const sessao = loja.ler();
    if (sessao.tipo !== 'ativa' || !alvo?.id) return false;
    return alvo.tipo === 'conta'
      ? alvo.id === sessao.conta.id
      : alvo.tipo === 'pessoa' && alvo.id === sessao.conta.pessoaId;
  }

  function abrir() {
    const url = ultimo
      ? `${ENDERECO_DOS_EVENTOS}?desde=${encodeURIComponent(ultimo)}`
      : ENDERECO_DOS_EVENTOS;
    const nova = criarFonte(url);
    fonte = nova;
    abriu = false;
    nova.addEventListener('open', () => {
      if (fonte !== nova) return;
      abriu = true;
      for (const terminar of esperandoAAbertura) terminar();
      esperandoAAbertura.clear();
    });
    for (const tipo of TIPOS_DE_EVENTO) nova.addEventListener(tipo, receber);
    nova.addEventListener('reiniciar', () => {
      aoReiniciar();
      void loja.validar();
    });
    // A sessão terminou (expirou ou ficou pendente): a validação leva à tela de entrada.
    nova.addEventListener('sessao', () => void loja.validar());
    nova.onerror = () => {
      // O EventSource tenta de novo sozinho; recusado (sem sessão, conexões demais), ele desiste.
      if (nova.readyState !== FECHADA || fonte !== nova) return;
      fonte = null;
      aguardando = true;
      novaTentativa = setTimeout(() => {
        novaTentativa = null;
        aguardando = false;
        acompanhar();
      }, ESPERA_DA_NOVA_TENTATIVA);
      void loja.validar();
    };
  }

  function fechar() {
    fonte?.close();
    fonte = null;
    abriu = false;
  }

  /** Abre a conexão com a sessão que vale e a página à vista há pouco; senão, fecha. */
  function acompanhar() {
    if (!sessaoVale()) {
      fechar();
      // A próxima sessão, talvez de outra conta, começa do zero.
      ultimo = null;
      lembrados.clear();
      aguardando = false;
      if (novaTentativa !== null) clearTimeout(novaTentativa);
      novaTentativa = null;
      return;
    }
    if (escondidaHaMuito) fechar();
    else if (!fonte && !aguardando) abrir();
  }

  const aoMudarAVisibilidade = () => {
    if (document.visibilityState === 'hidden') {
      escondida ??= setTimeout(() => {
        escondida = null;
        escondidaHaMuito = true;
        acompanhar();
      }, TEMPO_ESCONDIDA);
      return;
    }
    if (escondida !== null) clearTimeout(escondida);
    escondida = null;
    escondidaHaMuito = false;
    acompanhar();
  };

  return {
    ligar() {
      const pararDeOuvirALoja = loja.assinar(acompanhar);
      document.addEventListener('visibilitychange', aoMudarAVisibilidade);
      acompanhar();
      return () => {
        pararDeOuvirALoja();
        document.removeEventListener('visibilitychange', aoMudarAVisibilidade);
        fechar();
        for (const espera of [escondida, novaTentativa, ...esperas]) {
          if (espera !== null) clearTimeout(espera);
        }
        esperas.clear();
      };
    },
    aberta() {
      if (abriu) return Promise.resolve();
      return new Promise((terminar) => {
        esperandoAAbertura.add(terminar);
      });
    },
  };
}
