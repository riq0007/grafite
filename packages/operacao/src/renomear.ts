// A renomeação de uma pasta recém-gravada, como a `.parcial` de um backup ou de uma versão. No
// Windows, logo depois de gravar, o antivírus e o indexador abrem os arquivos novos, e renomear a
// pasta deles falha com EPERM, EACCES ou EBUSY até soltarem.
import { rename } from 'node:fs/promises';

/** Os erros que só dizem que alguém ainda segura um arquivo da pasta, por um instante. */
const PASSAGEIROS = new Set(['EPERM', 'EACCES', 'EBUSY']);

/** A primeira espera; cada uma dobra a anterior, até a maior. */
const PRIMEIRA_ESPERA = 100;
const MAIOR_ESPERA = 1000;

export interface OpcoesDaRenomeacao {
  /** A renomeação de verdade; os testes passam outra. */
  renomear?: (origem: string, destino: string) => Promise<void>;
  /** Quanto esperar, somadas as esperas, antes de desistir (padrão: 10 s). */
  limite?: number;
  esperar?: (ms: number) => Promise<void>;
}

const esperarDeVerdade = (ms: number) =>
  new Promise<void>((resolver) => {
    setTimeout(resolver, ms);
  });

/**
 * Renomeia, insistindo enquanto o erro for passageiro, com esperas crescentes. Outro erro sobe na
 * hora; o passageiro que passa do limite sobe como veio.
 */
export async function renomearComPaciencia(
  origem: string,
  destino: string,
  { renomear = rename, limite = 10_000, esperar = esperarDeVerdade }: OpcoesDaRenomeacao = {},
): Promise<void> {
  let esperado = 0;
  for (let espera = PRIMEIRA_ESPERA; ; espera = Math.min(espera * 2, MAIOR_ESPERA)) {
    try {
      await renomear(origem, destino);
      return;
    } catch (erro) {
      const codigo = (erro as NodeJS.ErrnoException).code ?? '';
      if (!PASSAGEIROS.has(codigo) || esperado + espera > limite) throw erro;
      esperado += espera;
      await esperar(espera);
    }
  }
}
