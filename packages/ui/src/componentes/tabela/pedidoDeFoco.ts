/**
 * O evento que pede à tabela o foco numa linha, pela chave em `detail`: a tabela virtualizada não
 * desenha as linhas longe da área visível, e rola até a pedida antes de focá-la. A prévia o usa ao
 * fechar num registro cuja linha não está desenhada.
 */
export const PEDIDO_DE_FOCO_DA_LINHA = 'grafite:focar-linha';
