// O valor do segredo cifrado em duas camadas (spec cofre-de-segredos, "Valor cifrado em duas
// camadas" e "Troca da chave mestra"; design do P6, decisões 1 e 2). O conteúdo, um JSON com o valor,
// é cifrado com a chave própria do segredo, e ela, com a chave mestra do servidor, que nunca vai ao
// banco. Os dados associados prendem as duas cifras ao segredo e à organização. A impressão diz qual
// chave mestra cifrou a chave do segredo, sem deixar recuperá-la.
import { createHash, randomBytes } from 'node:crypto';
import { cifrarComAesGcm, decifrarComAesGcm } from '../acesso/cifra.ts';

/** A chave mestra atual e, só durante a troca, a anterior (GRAFITE_CHAVE_DO_COFRE e _ANTERIOR). */
export interface ChavesDoCofre {
  atual: Buffer;
  anterior?: Buffer;
}

/** O conteúdo secreto: o valor e, nos tipos com mais de um campo secreto, os outros campos. */
export type ConteudoDoSegredo = { valor: string } & Record<string, string>;

export interface ChaveCifradaDoSegredo {
  chaveCifrada: Buffer;
  impressaoDaChaveMestra: string;
}

export interface SegredoCifrado extends ChaveCifradaDoSegredo {
  conteudoCifrado: Buffer;
}

/** O segredo cujo valor é cifrado: a organização e o id entram nos dados associados. */
export interface AlvoDaCifra {
  orgId: string;
  segredoId: string;
}

export const FRASE_DO_SEGREDO_QUE_NAO_ABRE =
  'O cofre não abre este segredo: confira a chave mestra na configuração do servidor.';

/**
 * O segredo que o cofre não abre. A mensagem é sempre a frase da spec, sem a causa, que poderia
 * trazer um pedaço do valor; o motivo vai para o log.
 */
export class SegredoQueNaoAbre extends Error {
  /** Nenhuma das chaves mestras tem a impressão gravada, ou a cifra recusou os dados. */
  readonly motivo: 'impressao' | 'cifra';

  constructor(motivo: 'impressao' | 'cifra') {
    super(FRASE_DO_SEGREDO_QUE_NAO_ABRE);
    this.name = 'SegredoQueNaoAbre';
    this.motivo = motivo;
  }
}

/** Os 16 primeiros caracteres hexadecimais do SHA-256 da chave mestra. */
export function impressaoDaChaveMestra(chave: Buffer): string {
  return createHash('sha256').update(chave).digest('hex').slice(0, 16);
}

const associadoDoConteudo = ({ orgId, segredoId }: AlvoDaCifra) => `segredo:${orgId}:${segredoId}`;
const associadoDaChave = ({ orgId, segredoId }: AlvoDaCifra) => `chave:${orgId}:${segredoId}`;

function conteudoValido(conteudo: unknown): conteudo is ConteudoDoSegredo {
  return (
    typeof conteudo === 'object' &&
    conteudo !== null &&
    typeof (conteudo as { valor?: unknown }).valor === 'string' &&
    Object.values(conteudo).every((campo) => typeof campo === 'string')
  );
}

/** Cifra o conteúdo com uma chave nova do segredo, e ela com a chave mestra atual. */
export function cifrarSegredo(
  conteudo: ConteudoDoSegredo,
  chaves: ChavesDoCofre,
  alvo: AlvoDaCifra,
): SegredoCifrado {
  const chaveDoSegredo = randomBytes(32);
  const claro = Buffer.from(JSON.stringify(conteudo), 'utf8');
  try {
    return {
      conteudoCifrado: cifrarComAesGcm(claro, chaveDoSegredo, associadoDoConteudo(alvo)),
      chaveCifrada: cifrarComAesGcm(chaveDoSegredo, chaves.atual, associadoDaChave(alvo)),
      impressaoDaChaveMestra: impressaoDaChaveMestra(chaves.atual),
    };
  } finally {
    claro.fill(0);
    chaveDoSegredo.fill(0);
  }
}

/** Abre a chave do segredo com a chave mestra cuja impressão está gravada nele. */
function abrirChave(
  { chaveCifrada, impressaoDaChaveMestra: impressao }: ChaveCifradaDoSegredo,
  chaves: ChavesDoCofre,
  alvo: AlvoDaCifra,
): Buffer {
  const mestra = [chaves.atual, chaves.anterior].find(
    (chave) => chave !== undefined && impressaoDaChaveMestra(chave) === impressao,
  );
  if (mestra === undefined) throw new SegredoQueNaoAbre('impressao');
  try {
    return decifrarComAesGcm(chaveCifrada, mestra, associadoDaChave(alvo));
  } catch {
    throw new SegredoQueNaoAbre('cifra');
  }
}

/** Decifra o conteúdo do segredo; o que não abre lança `SegredoQueNaoAbre`. */
export function decifrarSegredo(
  cifrado: SegredoCifrado,
  chaves: ChavesDoCofre,
  alvo: AlvoDaCifra,
): ConteudoDoSegredo {
  const chaveDoSegredo = abrirChave(cifrado, chaves, alvo);
  let conteudo: unknown;
  try {
    const claro = decifrarComAesGcm(
      cifrado.conteudoCifrado,
      chaveDoSegredo,
      associadoDoConteudo(alvo),
    );
    conteudo = JSON.parse(claro.toString('utf8'));
    claro.fill(0);
  } catch {
    // Sem a causa: o erro do JSON traz um pedaço do texto decifrado.
    throw new SegredoQueNaoAbre('cifra');
  } finally {
    chaveDoSegredo.fill(0);
  }
  if (!conteudoValido(conteudo)) throw new SegredoQueNaoAbre('cifra');
  return conteudo;
}

/** Cifra de novo só a chave do segredo, com a chave mestra atual; o conteúdo não é decifrado. */
export function recifrarChave(
  cifrado: ChaveCifradaDoSegredo,
  chaves: ChavesDoCofre,
  alvo: AlvoDaCifra,
): ChaveCifradaDoSegredo {
  const chaveDoSegredo = abrirChave(cifrado, chaves, alvo);
  try {
    return {
      chaveCifrada: cifrarComAesGcm(chaveDoSegredo, chaves.atual, associadoDaChave(alvo)),
      impressaoDaChaveMestra: impressaoDaChaveMestra(chaves.atual),
    };
  } finally {
    chaveDoSegredo.fill(0);
  }
}
