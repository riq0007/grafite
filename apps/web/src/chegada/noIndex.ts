// Leva a chegada ao index.html (F1c, design, decisão 1): a camada do carregamento, que existe antes
// do JavaScript, o estilo dela e o roteiro que a mostra se a chegada passar de 500 ms. Roda na
// compilação e no servidor de desenvolvimento, pelo plugin chegadaNoIndex.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import {
  ID_DO_CARREGAMENTO,
  MOSTRAR_CARREGAMENTO_DEPOIS_DE,
  marcacaoDoCarregamento,
} from '@grafite/ui/carregamento';
import type { Plugin } from 'vite';
import { CARREGANDO_O_GRAFITE } from './etapas.ts';

const exigir = createRequire(import.meta.url);

/**
 * Roda no head, antes da primeira pintura: marca a chegada como carregando e, se o app ainda não
 * tiver terminado aos 500 ms da navegação, mostra a camada. Dali em diante, o app assume. O
 * navegador trunca o atraso do setTimeout para ms inteiros: a espera é arredondada para cima e
 * conferida de novo, para a camada nunca aparecer antes dos 500 ms.
 */
export const ROTEIRO_DA_CHEGADA = `(() => {
  const raiz = document.documentElement;
  raiz.setAttribute('data-chegada', 'carregando');
  const mostrar = () => {
    const falta = ${MOSTRAR_CARREGAMENTO_DEPOIS_DE} - performance.now();
    if (falta > 0) {
      setTimeout(mostrar, Math.ceil(falta));
    } else if (raiz.getAttribute('data-chegada') === 'carregando') {
      document.getElementById('${ID_DO_CARREGAMENTO}')?.setAttribute('data-visivel', '');
    }
  };
  setTimeout(mostrar, 0);
})();`;

const RAIZ_DO_APP = '<div id="raiz">';

/** O index.html com a chegada: o estilo e o roteiro no head, e a camada antes da raiz do app. */
export function comAChegada(html: string, { desenvolvimento }: { desenvolvimento: boolean }) {
  if (!html.includes(RAIZ_DO_APP)) {
    throw new Error(`O index.html precisa da raiz do app (${RAIZ_DO_APP}) para a chegada.`);
  }
  const estilo = readFileSync(exigir.resolve('@grafite/ui/carregamento.css'), 'utf8');
  const tokens = posix.join(
    '/@fs/',
    exigir.resolve('@grafite/ui/tokens.css').replaceAll('\\', '/'),
  );
  const cabeca = [
    // Na compilação, o CSS do app, com os tokens, já vem ligado no head, antes da primeira
    // pintura. No desenvolvimento, ele chega pelo JavaScript, tarde demais para o carregamento.
    ...(desenvolvimento ? [`<link rel="stylesheet" href="${tokens}" />`] : []),
    `<style>\n${estilo}</style>`,
    `<script>\n${ROTEIRO_DA_CHEGADA}\n</script>`,
  ];
  const camada = marcacaoDoCarregamento({
    etapa: CARREGANDO_O_GRAFITE,
    progresso: 0,
    visivel: false,
  });
  return html
    .replace('</head>', `${cabeca.join('\n')}\n</head>`)
    .replace(RAIZ_DO_APP, `${camada}\n    ${RAIZ_DO_APP}`);
}

export function chegadaNoIndex(): Plugin {
  let desenvolvimento = false;
  return {
    name: 'grafite:chegada-no-index',
    configResolved(configuracao) {
      desenvolvimento = configuracao.command === 'serve';
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html) => comAChegada(html, { desenvolvimento }),
    },
  };
}
