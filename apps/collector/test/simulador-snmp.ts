// O simulador de agente SNMP v1 e v2c dos testes do coletor e da ponta a ponta da pilha (change
// p2b-impressoras-por-snmp, design, decisão 6): responde GET, GETNEXT e GETBULK a partir de uma
// gravação no formato do snmpsim (`oid|tipo|valor`, em ordem de OID), e não responde a uma comunidade
// errada, como uma impressora de verdade. Ele monta e lê as mensagens BER em código próprio, porque o
// agente do net-snmp exige modelar cada tabela do MIB.
import { createSocket, type Socket } from 'node:dgram';
import { readFileSync } from 'node:fs';

// ---------- O BER que o SNMP usa ----------

const TAGS = {
  inteiro: 0x02,
  texto: 0x04,
  nulo: 0x05,
  oid: 0x06,
  sequencia: 0x30,
  ip: 0x40,
  contador32: 0x41,
  medidor32: 0x42,
  tempo: 0x43,
  contador64: 0x46,
  semObjeto: 0x80,
  semInstancia: 0x81,
  fimDaMib: 0x82,
  get: 0xa0,
  getNext: 0xa1,
  resposta: 0xa2,
  getBulk: 0xa5,
} as const;

/** Um valor BER lido: a tag, o conteúdo e, nos construídos, os filhos. */
interface Tlv {
  tag: number;
  conteudo: Buffer;
}

function lerTlv(dados: Buffer, inicio: number): { tlv: Tlv; fim: number } {
  const tag = dados[inicio];
  let posicao = inicio + 1;
  let comprimento = dados[posicao] ?? 0;
  posicao += 1;
  if (comprimento & 0x80) {
    const bytes = comprimento & 0x7f;
    comprimento = 0;
    for (let i = 0; i < bytes; i++) comprimento = comprimento * 256 + (dados[posicao + i] ?? 0);
    posicao += bytes;
  }
  if (tag === undefined || posicao + comprimento > dados.length) throw new Error('BER truncado');
  return {
    tlv: { tag, conteudo: dados.subarray(posicao, posicao + comprimento) },
    fim: posicao + comprimento,
  };
}

function filhos(conteudo: Buffer): Tlv[] {
  const lista: Tlv[] = [];
  let posicao = 0;
  while (posicao < conteudo.length) {
    const { tlv, fim } = lerTlv(conteudo, posicao);
    lista.push(tlv);
    posicao = fim;
  }
  return lista;
}

function lerInteiro(conteudo: Buffer): number {
  let valor = 0;
  for (const [indice, byte] of conteudo.entries()) {
    valor = indice === 0 && byte & 0x80 ? byte - 256 : valor * 256 + byte;
  }
  return valor;
}

function lerOid(conteudo: Buffer): number[] {
  const primeiro = conteudo[0] ?? 0;
  const oid = [Math.floor(primeiro / 40), primeiro % 40];
  let valor = 0;
  for (const byte of conteudo.subarray(1)) {
    valor = valor * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      oid.push(valor);
      valor = 0;
    }
  }
  return oid;
}

function comprimentoBer(tamanho: number): Buffer {
  if (tamanho < 0x80) return Buffer.from([tamanho]);
  const bytes: number[] = [];
  for (let resto = tamanho; resto > 0; resto = Math.floor(resto / 256)) bytes.unshift(resto % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, conteudo: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), comprimentoBer(conteudo.length), conteudo]);
}

/** O inteiro com sinal, no menor número de bytes. */
function inteiro(valor: number, tag: number = TAGS.inteiro): Buffer {
  const bytes: number[] = [];
  let resto = BigInt(valor);
  for (;;) {
    const byte = Number(resto & 0xffn);
    bytes.unshift(byte);
    resto >>= 8n;
    // Para quando o que sobra é só a extensão do sinal do byte de cima.
    if ((resto === 0n && !(byte & 0x80)) || (resto === -1n && byte & 0x80)) break;
  }
  return tlv(tag, Buffer.from(bytes));
}

/** O inteiro sem sinal dos contadores, medidores e tempos. */
function semSinal(valor: bigint, tag: number): Buffer {
  const bytes: number[] = [];
  let resto = valor;
  do {
    bytes.unshift(Number(resto & 0xffn));
    resto >>= 8n;
  } while (resto > 0n);
  if ((bytes[0] ?? 0) & 0x80) bytes.unshift(0);
  return tlv(tag, Buffer.from(bytes));
}

function oid(partes: readonly number[]): Buffer {
  const bytes: number[] = [(partes[0] ?? 0) * 40 + (partes[1] ?? 0)];
  for (const parte of partes.slice(2)) {
    const grupos: number[] = [];
    let resto = parte;
    do {
      grupos.unshift(resto % 128);
      resto = Math.floor(resto / 128);
    } while (resto > 0);
    bytes.push(...grupos.map((grupo, i) => (i < grupos.length - 1 ? grupo | 0x80 : grupo)));
  }
  return tlv(TAGS.oid, Buffer.from(bytes));
}

const sequencia = (...partes: Buffer[]) => tlv(TAGS.sequencia, Buffer.concat(partes));

// ---------- A gravação ----------

/** Uma linha da gravação: o OID, o tipo do snmpsim e o valor em BER. */
export interface EntradaDaGravacao {
  oid: number[];
  valor: Buffer;
}

const paraOid = (texto: string) => texto.split('.').filter(Boolean).map(Number);

export function compararOids(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const diferenca = (a[i] ?? 0) - (b[i] ?? 0);
    if (diferenca !== 0) return diferenca;
  }
  return a.length - b.length;
}

/** O valor de uma linha da gravação em BER, pelo tipo do snmpsim. */
function valorDaGravacao(tipo: string, texto: string): Buffer {
  switch (tipo) {
    case '2':
      return inteiro(Number(texto));
    case '4':
      return tlv(TAGS.texto, Buffer.from(texto, 'utf8'));
    case '4x':
      return tlv(TAGS.texto, Buffer.from(texto, 'hex'));
    case '5':
      return tlv(TAGS.nulo, Buffer.alloc(0));
    case '6':
      return oid(paraOid(texto));
    case '64':
      return tlv(TAGS.ip, Buffer.from(texto.split('.').map(Number)));
    case '65':
      return semSinal(BigInt(texto), TAGS.contador32);
    case '66':
      return semSinal(BigInt(texto), TAGS.medidor32);
    case '67':
      return semSinal(BigInt(texto), TAGS.tempo);
    case '70':
      return semSinal(BigInt(texto), TAGS.contador64);
    default:
      throw new Error(`Tipo da gravação desconhecido: ${tipo}`);
  }
}

/**
 * A gravação no formato do snmpsim: uma linha `oid|tipo|valor` por objeto, com as linhas de
 * comentário, que começam por `#`, no cabeçalho. A ordem fica a dos OIDs.
 */
export function lerGravacao(texto: string): EntradaDaGravacao[] {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('#'))
    .map((linha) => {
      const [oidEmTexto = '', tipo = '', ...resto] = linha.split('|');
      return { oid: paraOid(oidEmTexto), valor: valorDaGravacao(tipo, resto.join('|')) };
    })
    .sort((a, b) => compararOids(a.oid, b.oid));
}

// ---------- O agente ----------

export interface SimuladorSnmp {
  porta: number;
  /** Quantos pedidos com a comunidade certa ele respondeu. */
  respondidos: () => number;
  fechar: () => Promise<void>;
}

const MAXIMO_DE_REPETICOES = 50;

/** Responde um pedido, ou nada, quando a comunidade não é a do simulador ou o pedido não é lido. */
function responder(
  pedido: Buffer,
  comunidade: string,
  gravacao: readonly EntradaDaGravacao[],
  recusar: 'bulk' | 'tudo' | undefined,
): Buffer | null {
  const { tlv: mensagem } = lerTlv(pedido, 0);
  const [versaoTlv, comunidadeTlv, pdu] = filhos(mensagem.conteudo);
  if (!versaoTlv || !comunidadeTlv || !pdu) return null;
  const versao = lerInteiro(versaoTlv.conteudo);
  if (comunidadeTlv.conteudo.toString('utf8') !== comunidade) return null;
  const [idTlv, primeiroTlv, segundoTlv, ligacoesTlv] = filhos(pdu.conteudo);
  if (!idTlv || !primeiroTlv || !segundoTlv || !ligacoesTlv) return null;
  const pedidas = filhos(ligacoesTlv.conteudo).map((ligacao) => {
    const [nome] = filhos(ligacao.conteudo);
    return lerOid(nome?.conteudo ?? Buffer.alloc(0));
  });
  const exato = (alvo: number[]) =>
    gravacao.find((entrada) => compararOids(entrada.oid, alvo) === 0);
  const seguinte = (alvo: number[]) =>
    gravacao.find((entrada) => compararOids(entrada.oid, alvo) > 0);
  const v1 = versao === 0;
  const respostas: { oid: number[]; valor: Buffer }[] = [];
  let erro = 0;
  let indiceDoErro = 0;
  const vazio = (tag: number) => tlv(tag, Buffer.alloc(0));

  const umPorUm = (achar: (alvo: number[]) => EntradaDaGravacao | undefined, faltando: number) =>
    pedidas.forEach((alvo, indice) => {
      const achada = achar(alvo);
      if (achada) respostas.push(achada);
      else if (v1) {
        erro ||= 2;
        indiceDoErro ||= indice + 1;
        respostas.push({ oid: alvo, valor: vazio(TAGS.nulo) });
      } else respostas.push({ oid: alvo, valor: vazio(faltando) });
    });

  if (recusar === 'tudo' || (recusar === 'bulk' && pdu.tag === TAGS.getBulk)) {
    erro = 5;
    indiceDoErro = 1;
    for (const alvo of pedidas) respostas.push({ oid: alvo, valor: vazio(TAGS.nulo) });
  } else if (pdu.tag === TAGS.get) umPorUm(exato, TAGS.semObjeto);
  else if (pdu.tag === TAGS.getNext) umPorUm(seguinte, TAGS.fimDaMib);
  else if (pdu.tag === TAGS.getBulk && !v1) {
    const naoRepetidos = Math.max(0, lerInteiro(primeiroTlv.conteudo));
    const repeticoes = Math.min(MAXIMO_DE_REPETICOES, Math.max(0, lerInteiro(segundoTlv.conteudo)));
    for (const alvo of pedidas.slice(0, naoRepetidos)) {
      respostas.push(seguinte(alvo) ?? { oid: alvo, valor: vazio(TAGS.fimDaMib) });
    }
    let atuais = pedidas.slice(naoRepetidos);
    for (let vez = 0; vez < repeticoes && atuais.length > 0; vez++) {
      let todasNoFim = true;
      atuais = atuais.map((alvo) => {
        const achada = seguinte(alvo);
        if (achada) todasNoFim = false;
        respostas.push(achada ?? { oid: alvo, valor: vazio(TAGS.fimDaMib) });
        return achada?.oid ?? alvo;
      });
      if (todasNoFim) break;
    }
  } else return null;

  const ligacoes = sequencia(
    ...respostas.map((resposta) => sequencia(oid(resposta.oid), resposta.valor)),
  );
  const resposta = tlv(
    TAGS.resposta,
    Buffer.concat([
      inteiro(lerInteiro(idTlv.conteudo)),
      inteiro(erro),
      inteiro(indiceDoErro),
      ligacoes,
    ]),
  );
  return sequencia(inteiro(versao), tlv(TAGS.texto, comunidadeTlv.conteudo), resposta);
}

/**
 * Sobe o simulador numa porta UDP do 127.0.0.1, a dada ou uma livre, com a gravação dada pelo
 * caminho do arquivo ou pelo texto.
 */
export async function iniciarSimuladorSnmp({
  gravacao,
  comunidade,
  porta = 0,
  recusar,
}: {
  gravacao: { arquivo: string } | { texto: string };
  comunidade: string;
  porta?: number;
  /** Equipamentos como a HP Laser 408dn recusam GETBULK com GeneralError. */
  recusar?: 'bulk' | 'tudo';
}): Promise<SimuladorSnmp> {
  const entradas = lerGravacao(
    'arquivo' in gravacao ? readFileSync(gravacao.arquivo, 'utf8') : gravacao.texto,
  );
  const socket: Socket = createSocket('udp4');
  let respondidos = 0;
  socket.on('message', (mensagem, remetente) => {
    let resposta: Buffer | null = null;
    try {
      resposta = responder(mensagem, comunidade, entradas, recusar);
    } catch {
      // A mensagem que não se lê fica sem resposta, como numa impressora.
    }
    if (!resposta) return;
    respondidos += 1;
    socket.send(resposta, remetente.port, remetente.address);
  });
  await new Promise<void>((pronto) => socket.bind(porta, '127.0.0.1', pronto));
  return {
    porta: socket.address().port,
    respondidos: () => respondidos,
    fechar: () => new Promise<void>((fechado) => socket.close(() => fechado())),
  };
}
