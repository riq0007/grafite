// Os anexos colados na caixa do chat e no campo de escrever do Chamados (spec modulo-chat, "Caixa de
// escrever do chat"; spec modulo-chamados, "Campo de escrever"; change chat-com-chamados, design,
// decisão 15, "colar e soltar", tarefa 4.19): colar arquivos, ou a imagem sem o texto, como um
// print, os anexa como o clipe. O que traz o texto cola o texto, também com a imagem junto, como a
// célula de uma planilha, que vai com a imagem dela.

/** O que se colou, como o `clipboardData` do navegador o traz. */
export type Colado = Pick<DataTransfer, 'files' | 'getData'>;

/** A imagem colada, que o navegador nomeia "image.png", e não o arquivo copiado de uma pasta. */
const IMAGEM_DO_NAVEGADOR = /^image\.([a-z0-9]+)$/i;

/**
 * "Imagem colada 22-11-2026 14.05.33.png": a data e a hora em que foi colada, no fuso da conta. A
 * hora vai com pontos, porque o ":" não vale num nome de arquivo do Windows.
 */
export function nomeDaImagemColada(agora: Date, fuso: string, extensao: string): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: fuso,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(agora)
      .map(({ type, value }) => [type, value]),
  );
  const { day, month, year, hour, minute, second } = partes;
  return `Imagem colada ${day}-${month}-${year} ${hour}.${minute}.${second}.${extensao}`;
}

/**
 * Os arquivos que a colagem anexa, na ordem, ou nulo, quando ela segue como a do navegador: com o
 * texto, que entra na caixa, ou sem arquivo. O texto só de espaços não conta, e o HTML sozinho também
 * não, como o da imagem copiada de uma página, que a caixa de texto não cola. A imagem que o
 * navegador nomeia ganha o nome de quando foi colada; o arquivo copiado de uma pasta fica com o dele.
 */
export function arquivosColados(colado: Colado, agora: Date, fuso: string): File[] | null {
  if (colado.getData('text/plain').trim() !== '') return null;
  const arquivos = [...colado.files];
  if (arquivos.length === 0) return null;
  return arquivos.map((arquivo) => {
    const extensao = IMAGEM_DO_NAVEGADOR.exec(arquivo.name)?.[1];
    if (extensao === undefined || !arquivo.type.startsWith('image/')) return arquivo;
    return new File([arquivo], nomeDaImagemColada(agora, fuso, extensao), {
      type: arquivo.type,
      lastModified: arquivo.lastModified,
    });
  });
}
