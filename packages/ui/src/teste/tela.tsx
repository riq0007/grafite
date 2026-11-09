// Utilitário do catálogo: uma tela por trás das camadas (busca, central, prévia, avisos e a
// chegada). A camada vive num portal, fora da raiz da história, ou fica fixa sobre a janela; a tela
// dá à raiz o tamanho da janela, e a captura de referência da raiz pega a camada desenhada por cima
// dela.
import type { Decorator } from '@storybook/react-vite';

export const comTelaPorTras: Decorator = (Historia) => (
  <>
    <div data-tela-por-tras="" style={{ minHeight: '100vh' }} />
    <Historia />
  </>
);
