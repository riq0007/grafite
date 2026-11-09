// Os esquemas dos arquivos na API (design do F2c, decisão 8): a foto vai como o identificador do
// arquivo, e o cliente da API monta o endereço de cada tamanho.
import { z } from 'zod';

/** A foto de uma pessoa: o arquivo, que muda a cada troca. */
export const FotoDaPessoa = z.object({ id: z.uuid() }).meta({ id: 'FotoDaPessoa' });

/** O conteúdo de uma imagem, em bytes: o corpo do envio e a resposta da entrega. */
export const BytesDaImagem = z
  .custom<Buffer>((valor) => Buffer.isBuffer(valor), {
    error: 'Envie a imagem no corpo do pedido.',
  })
  .meta({ type: 'string', format: 'binary' });

/** O conteúdo do arquivo de um campo, em bytes: o corpo do envio e a resposta da entrega. */
export const BytesDoArquivo = z
  .custom<Buffer>((valor) => Buffer.isBuffer(valor), {
    error: 'Envie o arquivo no corpo do pedido.',
  })
  .meta({ type: 'string', format: 'binary' });
