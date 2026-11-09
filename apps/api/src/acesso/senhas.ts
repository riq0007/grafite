// O hash da senha (design do F2a, decisão 4): Argon2id nativo do Node, no formato PHC, que guarda
// os parâmetros junto do sal e do hash. A senha é normalizada (NFKC) antes, para a mesma senha com
// o acento composto ou separado conferir.
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

export interface ParametrosDoHash {
  /** Memória, em blocos de 1 KiB. */
  memoria: number;
  passadas: number;
  paralelismo: number;
}

/** O mínimo da OWASP para o Argon2id: 19 MiB e 2 passadas. */
export const PARAMETROS_DO_HASH: ParametrosDoHash = {
  memoria: 19_456,
  passadas: 2,
  paralelismo: 1,
};

const BYTES_DO_SAL = 16;
const BYTES_DO_HASH = 32;
/** Limites de um hash lido: um texto malformado não pode pedir memória ou tempo sem fim. */
const LIMITES = { memoria: 1_048_576, passadas: 16, paralelismo: 16 };
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function derivar(
  senha: string,
  sal: Buffer,
  { memoria, passadas, paralelismo }: ParametrosDoHash,
  bytes: number,
): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    argon2(
      'argon2id',
      {
        message: senha.normalize('NFKC'),
        nonce: sal,
        memory: memoria,
        passes: passadas,
        parallelism: paralelismo,
        tagLength: bytes,
      },
      (erro, chave) => (erro ? rejeitar(erro) : resolver(chave)),
    );
  });
}

const base64 = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');

export async function gerarHashDaSenha(
  senha: string,
  parametros: ParametrosDoHash = PARAMETROS_DO_HASH,
): Promise<string> {
  const sal = randomBytes(BYTES_DO_SAL);
  const hash = await derivar(senha, sal, parametros, BYTES_DO_HASH);
  const { memoria, passadas, paralelismo } = parametros;
  return `$argon2id$v=19$m=${memoria},t=${passadas},p=${paralelismo}$${base64(sal)}$${base64(hash)}`;
}

function lerHash(texto: string) {
  const partes = PHC.exec(texto);
  if (!partes) return null;
  const parametros = {
    memoria: Number(partes[1]),
    passadas: Number(partes[2]),
    paralelismo: Number(partes[3]),
  };
  const dentroDosLimites =
    parametros.memoria <= LIMITES.memoria &&
    parametros.passadas <= LIMITES.passadas &&
    parametros.paralelismo <= LIMITES.paralelismo;
  if (!dentroDosLimites) return null;
  return {
    parametros,
    sal: Buffer.from(partes[4] ?? '', 'base64'),
    hash: Buffer.from(partes[5] ?? '', 'base64'),
  };
}

/** Confere a senha com o hash gravado, em tempo constante. Um hash malformado não confere. */
export async function conferirSenha(senha: string, texto: string): Promise<boolean> {
  const lido = lerHash(texto);
  if (!lido) return false;
  try {
    const calculado = await derivar(senha, lido.sal, lido.parametros, lido.hash.length);
    return timingSafeEqual(calculado, lido.hash);
  } catch {
    return false;
  }
}

/** O hash foi gravado com outros parâmetros: a entrada seguinte o regrava com os atuais. */
export function precisaRegravar(
  texto: string,
  parametros: ParametrosDoHash = PARAMETROS_DO_HASH,
): boolean {
  const lido = lerHash(texto);
  if (!lido) return true;
  return (
    lido.parametros.memoria !== parametros.memoria ||
    lido.parametros.passadas !== parametros.passadas ||
    lido.parametros.paralelismo !== parametros.paralelismo ||
    lido.hash.length !== BYTES_DO_HASH
  );
}

/**
 * A conferência de um usuário que não existe: o mesmo trabalho de uma senha de verdade, contra um
 * hash gerado na partida que nenhuma senha conhecida abre, para a recusa vir no mesmo tempo.
 */
export async function criarConferenciaDeEngano(): Promise<(senha: string) => Promise<false>> {
  const deEngano = await gerarHashDaSenha(randomBytes(32).toString('base64'));
  return async (senha) => {
    await conferirSenha(senha, deEngano);
    return false;
  };
}
