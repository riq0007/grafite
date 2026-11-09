// O agendador da coleta (spec disponibilidade-de-rede, "Ping", e impressoras-por-snmp, "Leitura das
// impressoras"; design do P2a, decisão 8 e riscos, e do P2b, decisão 5): cada coleta de cada alvo no
// intervalo dela, com a primeira leitura logo e um atraso aleatório de até 10% do intervalo para
// espalhar as leituras, e no máximo 32 leituras ao mesmo tempo, o ping e o SNMP juntos, com as outras
// na fila, e a sondagem do Control iD com eles (design do P2c, decisão 4). A coleta que continua na
// configuração mantém o ritmo; a que muda de IP, de intervalo, de versão, de comunidade, de porta,
// de usuário ou de senha é lida logo.
import type { Coleta } from './configuracao.ts';

export interface AlvoAgendado {
  ativoId: string;
  ip: string;
  /** Em ms. */
  intervalo: number;
  coleta: Coleta;
}

/** Quantas leituras rodam ao mesmo tempo, o ping e o SNMP juntos. */
const LIMITE = 32;
/** O atraso aleatório, em fração do intervalo. */
const ESPALHAMENTO = 0.1;

interface Agendado {
  alvo: AlvoAgendado;
  temporizador: ReturnType<typeof setTimeout> | null;
  naFila: boolean;
}

/** Cada coleta do ativo tem o ritmo dela. */
const chaveDo = (alvo: AlvoAgendado) => `${alvo.ativoId} ${alvo.coleta.tipo}`;

/**
 * A mesma leitura: o IP, o intervalo e, no SNMP, a versão e a comunidade; na sondagem, a porta, o
 * usuário e a senha.
 */
function mesmaLeitura(a: AlvoAgendado, b: AlvoAgendado) {
  if (a.ip !== b.ip || a.intervalo !== b.intervalo) return false;
  if (a.coleta.tipo === 'snmp' && b.coleta.tipo === 'snmp') {
    return a.coleta.versao === b.coleta.versao && a.coleta.comunidade === b.coleta.comunidade;
  }
  if (a.coleta.tipo === 'controlid' && b.coleta.tipo === 'controlid') {
    return (
      a.coleta.porta === b.coleta.porta &&
      a.coleta.usuario === b.coleta.usuario &&
      a.coleta.senha === b.coleta.senha
    );
  }
  return a.coleta.tipo === b.coleta.tipo;
}

export function criarAgendador({
  executar,
  aleatorio = Math.random,
  limite = LIMITE,
}: {
  /** Lê o alvo; a falha de uma leitura não para as outras. */
  executar: (alvo: AlvoAgendado) => Promise<void>;
  aleatorio?: () => number;
  limite?: number;
}) {
  const agendados = new Map<string, Agendado>();
  const fila: Agendado[] = [];
  let rodando = 0;

  const vale = (agendado: Agendado) => agendados.get(chaveDo(agendado.alvo)) === agendado;

  function enfileirar(agendado: Agendado) {
    if (agendado.naFila) return;
    agendado.naFila = true;
    fila.push(agendado);
    andar();
  }

  function proxima(agendado: Agendado) {
    const { intervalo } = agendado.alvo;
    agendado.temporizador = setTimeout(
      () => {
        agendado.temporizador = null;
        enfileirar(agendado);
      },
      intervalo + aleatorio() * intervalo * ESPALHAMENTO,
    );
  }

  async function ler(agendado: Agendado) {
    try {
      await executar(agendado.alvo);
    } catch {
      // A falha de uma leitura não para o agendador; a leitura dela já diz "sem dado".
    }
    rodando -= 1;
    if (vale(agendado)) proxima(agendado);
    andar();
  }

  function andar() {
    while (rodando < limite) {
      const agendado = fila.shift();
      if (!agendado) return;
      agendado.naFila = false;
      // O alvo que saiu da configuração, ou mudou, enquanto esperava na fila.
      if (!vale(agendado)) continue;
      rodando += 1;
      void ler(agendado);
    }
  }

  function esquecer(agendado: Agendado) {
    if (agendado.temporizador) clearTimeout(agendado.temporizador);
    agendado.temporizador = null;
    agendados.delete(chaveDo(agendado.alvo));
  }

  /** Troca os alvos: o novo é lido logo, o que continua mantém o ritmo e o que saiu para. */
  function definirAlvos(alvos: AlvoAgendado[]) {
    const novos = new Map(alvos.map((alvo) => [chaveDo(alvo), alvo]));
    for (const agendado of [...agendados.values()]) {
      const novo = novos.get(chaveDo(agendado.alvo));
      if (!novo || !mesmaLeitura(novo, agendado.alvo)) esquecer(agendado);
    }
    for (const [chave, alvo] of novos) {
      if (agendados.has(chave)) continue;
      const agendado: Agendado = { alvo, temporizador: null, naFila: false };
      agendados.set(chave, agendado);
      enfileirar(agendado);
    }
  }

  function parar() {
    for (const agendado of [...agendados.values()]) esquecer(agendado);
    fila.length = 0;
  }

  return {
    definirAlvos,
    parar,
    estado: () => ({ alvos: agendados.size, rodando, naFila: fila.length }),
  };
}

export type Agendador = ReturnType<typeof criarAgendador>;
