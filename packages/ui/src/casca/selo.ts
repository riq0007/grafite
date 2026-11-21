import type { ModuloDaCasca } from './tipos.ts';

/** O nome do item para o leitor de tela, com a descrição do selo depois, como "Chat, 2 não lidas". */
export const nomeComOSelo = ({ nome, selo }: Pick<ModuloDaCasca, 'nome' | 'selo'>): string =>
  selo ? `${nome}, ${selo.descricao}` : nome;
