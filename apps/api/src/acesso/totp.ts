// O código do app autenticador (design do F2a, decisão 7): TOTP da RFC 6238 sobre o HOTP da RFC
// 4226, com HMAC-SHA1, 6 dígitos e passo de 30 s, como os apps comuns. A chave vai ao app em base32
// (RFC 4648), pelo QR code ou em texto.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PERIODO = 30_000;
const DIGITOS = 6;
const BYTES_DA_CHAVE = 20;
/** Quantos passos para cada lado o código ainda vale, para um relógio pouco adiantado ou atrasado. */
const JANELA = 1;
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A chave nova do app: 20 bytes aleatórios, o tamanho do HMAC-SHA1. */
export function gerarChaveDoApp(): Buffer {
  return randomBytes(BYTES_DA_CHAVE);
}

/** Base32 da RFC 4648, sem o preenchimento, que a URI do app dispensa. */
export function codificarBase32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

/** Lê o base32 com ou sem o preenchimento, em maiúsculas ou minúsculas e com espaços. */
export function decodificarBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const caractere of limpo) {
    const indice = ALFABETO.indexOf(caractere);
    if (indice < 0) throw new Error('Texto que não é base32.');
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function gerarCodigoHotp(chave: Buffer, contador: number, digitos = DIGITOS): string {
  const mensagem = Buffer.alloc(8);
  mensagem.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac('sha1', chave).update(mensagem).digest();
  const deslocamento = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binario = hmac.readUInt32BE(deslocamento) & 0x7fffffff;
  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

export function gerarCodigoTotp(chave: Buffer, momentoEmMs: number, digitos = DIGITOS): string {
  return gerarCodigoHotp(chave, Math.floor(momentoEmMs / PERIODO), digitos);
}

/**
 * Confere o código digitado no passo atual e nos vizinhos. Um passo igual ou anterior ao último já
 * aceito não vale de novo. Devolve o passo aceito, que quem chamou grava, ou `null`.
 */
export function conferirCodigoDoApp(
  chave: Buffer,
  digitado: string,
  momentoEmMs: number,
  ultimoPasso: number | null,
): number | null {
  const codigo = digitado.replace(/\s/g, '');
  if (!new RegExp(`^\\d{${DIGITOS}}$`).test(codigo)) return null;
  const atual = Math.floor(momentoEmMs / PERIODO);
  for (let passo = atual - JANELA; passo <= atual + JANELA; passo++) {
    if (ultimoPasso !== null && passo <= ultimoPasso) continue;
    const esperado = Buffer.from(gerarCodigoHotp(chave, passo));
    if (timingSafeEqual(esperado, Buffer.from(codigo))) return passo;
  }
  return null;
}

/** A URI do QR code, no formato que os apps autenticadores leem. */
export function uriDoApp({
  chave,
  usuario,
  organizacao,
}: {
  chave: Buffer;
  usuario: string;
  organizacao: string;
}): string {
  const rotulo = encodeURIComponent(`Grafite:${usuario} (${organizacao})`);
  const segredo = codificarBase32(chave);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=Grafite&algorithm=SHA1&digits=${DIGITOS}&period=${PERIODO / 1000}`;
}

/** A chave em texto, para digitar no app: base32 em grupos de 4. */
export function formatarChave(chave: Buffer): string {
  return codificarBase32(chave).replace(/(.{4})(?=.)/g, '$1 ');
}
