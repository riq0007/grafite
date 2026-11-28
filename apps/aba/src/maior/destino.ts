import type { TelaMaior, TemaDoWindows } from '../nativo.ts';

/** A trilha da tela maior, do começo ao lugar de agora, como "Aba › Abrir chat". */
export function trilhaDa(tela: TelaMaior): string[] {
  switch (tela.destino) {
    case 'abrir-chamado':
      return ['Aba', 'Abrir chamado'];
    case 'visualizar-chamados':
      return ['Aba', 'Visualizar chamados'];
    case 'abrir-chat':
      return ['Aba', 'Abrir chat'];
    case 'chamado':
      return ['Aba', 'Abrir chat', `#${tela.numero ?? ''}`];
  }
}

/** O chat fica no corpo da tela maior; as outras duas opções ainda não têm conteúdo nesta versão. */
export function comOChat(tela: TelaMaior): boolean {
  return tela.destino === 'abrir-chat' || tela.destino === 'chamado';
}

export interface Frase {
  titulo: string;
  texto: string;
}

/** A frase de "Abrir chamado" e "Visualizar chamados", que chegam numa versão seguinte. */
export function fraseDa(tela: TelaMaior): Frase | null {
  if (tela.destino === 'abrir-chamado') {
    return {
      titulo: 'Abrir chamado pela aba chega numa versão seguinte',
      texto: 'Por enquanto, abra o chamado pelo chat: conte o que aconteceu, e a TI responde lá.',
    };
  }
  if (tela.destino === 'visualizar-chamados') {
    return {
      titulo: 'A lista dos chamados pela aba chega numa versão seguinte',
      texto: 'Por enquanto, os seus chamados e as respostas da TI estão no chat.',
    };
  }
  return null;
}

/** O tema do Grafite no corpo da tela maior, pelo tema do Windows. */
export const TEMA_DO_CORPO: Record<TemaDoWindows, string> = {
  escuro: 'grafite',
  claro: 'papel',
  'alto-contraste': 'alto-contraste',
};
