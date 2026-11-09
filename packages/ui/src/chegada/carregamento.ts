// O carregamento da chegada (F1c, design, decisão 1): a marca, a barra fina e a etapa em andamento,
// numa marcação só. O plugin do apps/web a injeta no index.html, para ela existir antes do
// JavaScript, e o catálogo desenha a mesma marcação. O estilo fica em carregamento.css, só com
// tokens. Este arquivo roda também no Node (no plugin), então só importa módulos sem DOM nem CSS.
import { MONTAGEM_DA_MARCA as montagem } from '../brand/gerado/marca.ts';
import { grupoDoSimbolo, NOME_DO_PRODUTO } from '../brand/simbolo.ts';
import { tempos } from '../tokens/tempos.ts';

/** O id da camada, irmã da raiz do app no index.html. */
export const ID_DO_CARREGAMENTO = 'chegada';

/** O carregamento só aparece se a chegada passar deste tempo, em ms. */
export const MOSTRAR_CARREGAMENTO_DEPOIS_DE = tempos.chegada.mostrarDepoisDe;

export interface SituacaoDoCarregamento {
  /** A etapa em andamento, e "Pronto" no fim. */
  etapa: string;
  /** A fração das etapas concluídas, de 0 a 1. */
  progresso: number;
  /** Se a camada está à vista: só depois de 500 ms de chegada. */
  visivel: boolean;
}

const escapar = (texto: string) =>
  texto.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const porcento = (progresso: number) => String(Math.round(progresso * 100));

const MARCA =
  `<svg class="chegada-marca" viewBox="0 0 ${montagem.largura} ${montagem.altura}" role="img" aria-label="${NOME_DO_PRODUTO}" focusable="false">` +
  grupoDoSimbolo(montagem.simbolo) +
  `<path fill="currentColor" transform="${montagem.palavra}" d="${montagem.caminhoDaPalavra}"/></svg>`;

/** A camada do carregamento, na situação pedida. */
export function marcacaoDoCarregamento({ etapa, progresso, visivel }: SituacaoDoCarregamento) {
  return (
    `<div id="${ID_DO_CARREGAMENTO}"${visivel ? ' data-visivel=""' : ''}>` +
    '<div class="chegada-conteudo">' +
    MARCA +
    `<div class="chegada-barra" role="progressbar" aria-label="Carregamento do ${NOME_DO_PRODUTO}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${porcento(progresso)}" style="--progresso-da-chegada: ${progresso}">` +
    '<div class="chegada-preenchimento"></div></div>' +
    `<p class="chegada-etapa" role="status">${escapar(etapa)}</p>` +
    '</div></div>'
  );
}

/** Leva a camada à situação nova: a etapa, a barra e se ela está à vista. */
export function atualizarCarregamento(
  camada: HTMLElement,
  { etapa, progresso, visivel }: SituacaoDoCarregamento,
): void {
  const barra = camada.querySelector<HTMLElement>('[role="progressbar"]');
  barra?.setAttribute('aria-valuenow', porcento(progresso));
  barra?.style.setProperty('--progresso-da-chegada', String(progresso));
  const texto = camada.querySelector('[role="status"]');
  // Reescrever o mesmo texto faria o leitor de tela anunciar a etapa de novo.
  if (texto && texto.textContent !== etapa) texto.textContent = etapa;
  camada.toggleAttribute('data-visivel', visivel);
}
