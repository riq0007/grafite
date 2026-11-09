// O download dos instaladores dos pré-requisitos (change instalador-e-menu-da-operacao, design,
// decisões 3 e 4): o arquivo é gravado em disco com o SHA-256 calculado enquanto grava, e quem
// baixa confere o hash com o fixado antes de rodar qualquer coisa.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';

export interface Baixador {
  /** Baixa a URL para o arquivo e devolve o SHA-256 do que gravou. */
  baixar(url: string, arquivo: string): Promise<string>;
}

/** O download pela rede, com o `fetch` do Node. Um download que falha não deixa arquivo. */
export const baixadorDaRede: Baixador = {
  async baixar(url, arquivo) {
    const resposta = await fetch(url);
    if (!resposta.ok || resposta.body === null) {
      throw new Error(`O download de ${url} falhou: HTTP ${resposta.status}.`);
    }
    const hash = createHash('sha256');
    const calcular = new Transform({
      transform(pedaco: Buffer, _codificacao, seguir) {
        hash.update(pedaco);
        seguir(null, pedaco);
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(resposta.body as ReadableStream),
        calcular,
        createWriteStream(arquivo),
      );
    } catch (erro) {
      await rm(arquivo, { force: true });
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new Error(`O download de ${url} falhou: ${motivo}`, { cause: erro });
    }
    return hash.digest('hex');
  },
};
