// O ouvinte do banco (spec eventos-em-tempo-real; design do F2c, decisão 10): um cliente próprio,
// fora do pool e com o papel da aplicação, faz o LISTEN do canal dos eventos. O aviso só chega
// depois do commit, então nenhum evento desfeito é entregue. Se a ligação cai, ela é refeita com
// intervalos crescentes, e quem ouve é avisado de que eventos podem ter se perdido no meio.
import { type EventoDeSaida, TIPOS_DE_EVENTO } from '@grafite/domain';
import type pg from 'pg';

export const CANAL_DOS_EVENTOS = 'grafite_eventos';

export interface OpcoesDoOuvinte {
  /** Um cliente novo, ainda sem conectar, a cada ligação. */
  conectar: () => pg.Client;
  aoEvento: (evento: EventoDeSaida) => void;
  /** A ligação caiu e foi refeita: eventos podem ter se perdido. */
  aoReligar: () => void;
  /** Uma falha que não para o ouvinte, para o log. */
  avisar: (erro: unknown) => void;
  /** A primeira espera para religar, que dobra a cada falha seguida. */
  esperaInicial?: number;
  esperaMaxima?: number;
}

export interface OuvinteDoBanco {
  /** Faz a primeira ligação; se ela falha, tenta de novo sem parar a partida. */
  iniciar(): Promise<void>;
  parar(): Promise<void>;
  /** Se o LISTEN está valendo agora. */
  ligado(): boolean;
}

/** O aviso do gatilho, conferido: o que não é um evento conhecido não é entregue. */
function lerAviso(carga: string): EventoDeSaida {
  const evento = JSON.parse(carga) as EventoDeSaida;
  if (
    typeof evento?.id !== 'string' ||
    typeof evento.orgId !== 'string' ||
    !TIPOS_DE_EVENTO.includes(evento.tipo) ||
    typeof evento.publico !== 'object' ||
    evento.publico === null
  ) {
    throw new Error(`Aviso de evento fora do formato: ${carga.slice(0, 200)}`);
  }
  return evento;
}

export function criarOuvinte({
  conectar,
  aoEvento,
  aoReligar,
  avisar,
  esperaInicial = 1000,
  esperaMaxima = 30_000,
}: OpcoesDoOuvinte): OuvinteDoBanco {
  let atual: pg.Client | null = null;
  let parado = false;
  let jaLigou = false;
  let espera = esperaInicial;
  let religar: NodeJS.Timeout | undefined;

  /** A ligação que caiu sai de cena, e uma nova é marcada para depois da espera. */
  function cair(cliente: pg.Client, erro: unknown) {
    if (cliente !== atual && atual !== null) return;
    atual = null;
    cliente.removeAllListeners();
    cliente.on('error', () => {});
    cliente.end().catch(() => {});
    if (parado) return;
    avisar(erro);
    religar = setTimeout(() => void ligar(), espera);
    espera = Math.min(espera * 2, esperaMaxima);
  }

  async function ligar() {
    if (parado) return;
    const cliente = conectar();
    atual = null;
    let caiu = false;
    const aoCair = (erro: unknown) => {
      if (caiu) return;
      caiu = true;
      cair(cliente, erro);
    };
    cliente.on('error', aoCair);
    cliente.on('end', () => aoCair(new Error('A ligação do LISTEN terminou.')));
    cliente.on('notification', (aviso) => {
      if (aviso.channel !== CANAL_DOS_EVENTOS || !aviso.payload) return;
      try {
        aoEvento(lerAviso(aviso.payload));
      } catch (erro) {
        avisar(erro);
      }
    });
    try {
      await cliente.connect();
      await cliente.query(`LISTEN ${CANAL_DOS_EVENTOS}`);
    } catch (erro) {
      aoCair(erro);
      return;
    }
    if (caiu || parado) {
      cliente.end().catch(() => {});
      return;
    }
    atual = cliente;
    espera = esperaInicial;
    if (jaLigou) aoReligar();
    jaLigou = true;
  }

  return {
    iniciar: () => ligar(),
    async parar() {
      parado = true;
      clearTimeout(religar);
      const cliente = atual;
      atual = null;
      if (cliente) {
        cliente.removeAllListeners();
        cliente.on('error', () => {});
        await cliente.end().catch(() => {});
      }
    },
    ligado: () => atual !== null,
  };
}
