// A chave do app autenticador guardada cifrada (design do F2a, decisão 7): AES-256-GCM com a chave
// do servidor (GRAFITE_CHAVE_DOIS_PASSOS), que nunca vai ao banco. O id da conta entra como dado
// associado: um segredo copiado para a linha de outra conta não decifra. O cofre usa o mesmo formato
// nas duas camadas dele (design do P6, decisão 1).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSAO = 1;
const BYTES_DO_IV = 12;
const BYTES_DA_ETIQUETA = 16;

/** Versão (1 byte), IV (12), etiqueta (16) e os dados cifrados, presos ao texto associado. */
export function cifrarComAesGcm(dados: Buffer, chave: Buffer, associado: string): Buffer {
  const iv = randomBytes(BYTES_DO_IV);
  const cifra = createCipheriv('aes-256-gcm', chave, iv);
  cifra.setAAD(Buffer.from(associado));
  const cifrados = Buffer.concat([cifra.update(dados), cifra.final()]);
  return Buffer.concat([Buffer.from([VERSAO]), iv, cifra.getAuthTag(), cifrados]);
}

/** Decifra; com outra chave, outro texto associado ou o texto adulterado, lança um erro. */
export function decifrarComAesGcm(cifrado: Buffer, chave: Buffer, associado: string): Buffer {
  const versao = cifrado[0];
  if (versao !== VERSAO) throw new Error(`Versão desconhecida da cifra: ${versao}.`);
  const iv = cifrado.subarray(1, 1 + BYTES_DO_IV);
  const etiqueta = cifrado.subarray(1 + BYTES_DO_IV, 1 + BYTES_DO_IV + BYTES_DA_ETIQUETA);
  const dados = cifrado.subarray(1 + BYTES_DO_IV + BYTES_DA_ETIQUETA);
  const decifra = createDecipheriv('aes-256-gcm', chave, iv);
  decifra.setAAD(Buffer.from(associado));
  decifra.setAuthTag(etiqueta);
  return Buffer.concat([decifra.update(dados), decifra.final()]);
}

export function cifrarChaveDoApp(
  chaveDoApp: Buffer,
  chaveDoServidor: Buffer,
  contaId: string,
): Buffer {
  return cifrarComAesGcm(chaveDoApp, chaveDoServidor, contaId);
}

/** Decifra a chave do app; com outra chave, outra conta ou o texto adulterado, lança um erro. */
export function decifrarChaveDoApp(
  cifrado: Buffer,
  chaveDoServidor: Buffer,
  contaId: string,
): Buffer {
  return decifrarComAesGcm(cifrado, chaveDoServidor, contaId);
}
