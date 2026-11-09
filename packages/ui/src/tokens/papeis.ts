// Os papéis de cor de um tema e as camadas de interação feitas da cor do texto, comuns ao gerador
// (gerador.ts) e aos temas (temas.ts).
import { comAlfa, compor, luminancia } from './contraste.ts';

export type Tom = 'escuro' | 'claro';

export interface CoresDoTema {
  fundo: string;
  superficie: string;
  superficie2: string;
  linha: string;
  linhaForte: string;
  texto: string;
  texto2: string;
  miniatura: string;
  zebra: string;
  barra: string;
  material: string;
  materialSolido: string;
  materialLinha: string;
  /** Borda de campos, checkbox e interruptor: 3:1 contra as superfícies (WCAG 1.4.11). */
  bordaControle: string;
  /** Véu que escurece a tela atrás de diálogos e gavetas. */
  veu: string;
}

/**
 * Camadas neutras de interação, feitas da cor do texto: vão por cima do fundo do controle.
 * O verificador mede o texto sobre a camada de pressionado, a mais forte.
 */
export const OPACIDADE_DAS_CAMADAS = { hover: 0.06, pressionado: 0.1 } as const;

export function camadasDeEstado(cores: Pick<CoresDoTema, 'texto'>): {
  hover: string;
  pressionado: string;
} {
  return {
    hover: comAlfa(cores.texto, OPACIDADE_DAS_CAMADAS.hover),
    pressionado: comAlfa(cores.texto, OPACIDADE_DAS_CAMADAS.pressionado),
  };
}

/**
 * Opacidade do anel do cursor sobre a cor do texto. O protótipo usava 45% em todos os temas; nos
 * claros, o anel ficava abaixo de 3:1 contra o fundo (2,64:1 no Papel), e subiu para 55%.
 */
export const OPACIDADE_DO_ANEL = { escuro: 0.45, claro: 0.55 } as const;

/**
 * Cores do destaque: o preenchimento (botão primário, seleção e anel de foco), o texto e o ícone na
 * cor do destaque sobre as superfícies, e o texto sobre o preenchimento.
 */
export interface CoresDoDestaque {
  destaque: string;
  destaqueTexto: string;
  sobreDestaque: string;
}

export interface EstadosDoDestaque {
  destaqueHover: string;
  destaquePressionado: string;
}

/**
 * Hover e pressionado do preenchimento de destaque. Escurecem sob texto claro e clareiam
 * sob texto escuro: o preenchimento se afasta do texto, então o contraste só sobe.
 */
export function estadosDoDestaque(cores: CoresDoDestaque): EstadosDoDestaque {
  const textoClaro = luminancia(cores.sobreDestaque) > luminancia(cores.destaque);
  const alvo = textoClaro ? '#000000' : '#ffffff';
  return {
    destaqueHover: compor(comAlfa(alvo, 0.1), cores.destaque),
    destaquePressionado: compor(comAlfa(alvo, 0.2), cores.destaque),
  };
}
