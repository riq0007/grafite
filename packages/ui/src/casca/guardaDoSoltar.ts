// O arquivo solto fora de um lugar de soltar (spec estrutura-da-casca, "Arquivo solto fora de um
// lugar de soltar"; change chat-com-chamados, design, decisão 15, "colar e soltar", tarefa 4.19):
// sem a guarda, o navegador troca o Grafite pelo arquivo na aba, e o que estava aberto se perde. Ela
// fica no `window`, na casca e no app do chat, e cobre também os diálogos e as gavetas, que o React
// põe no `body`. Só o arrasto de arquivos, para o texto arrastado seguir para os campos, e só na fase
// de bolha, quando ninguém tratou o evento, para os lugares de soltar, como o `DropZone` dos campos
// de arquivo e de imagem e o `LugarDeSoltar` da conversa, seguirem com a regra deles.

const comArquivos = (evento: DragEvent) => evento.dataTransfer?.types.includes('Files') ?? false;

/**
 * Liga a guarda na janela: o arquivo que ninguém tratou fica com o cursor de que não se solta, e
 * soltá-lo não faz nada. Devolve o desligar.
 */
export function ligarGuardaDoSoltar(janela: Window): () => void {
  const segurar = (evento: DragEvent) => {
    if (evento.defaultPrevented || !comArquivos(evento)) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'none';
  };
  janela.addEventListener('dragover', segurar);
  janela.addEventListener('drop', segurar);
  return () => {
    janela.removeEventListener('dragover', segurar);
    janela.removeEventListener('drop', segurar);
  };
}
