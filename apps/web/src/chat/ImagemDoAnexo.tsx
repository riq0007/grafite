import { formatarTamanho } from '@grafite/ui';
import type { CSSProperties } from 'react';
import estilos from './ImagemDoAnexo.module.css';

/** O maior lado da miniatura na conversa, em px: a de 512 px do servidor, reduzida. */
const LADO_NA_CONVERSA = 320;

export interface MiniaturaDoAnexo {
  largura: number;
  altura: number;
}

/** O tamanho da miniatura na conversa: no quadrado de 320 px, na proporção e sem ampliar. */
export function ladosNaConversa({ largura, altura }: MiniaturaDoAnexo): MiniaturaDoAnexo {
  const maior = Math.max(largura, altura);
  if (maior <= LADO_NA_CONVERSA) return { largura, altura };
  const escala = LADO_NA_CONVERSA / maior;
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

export interface PropsDaImagemDoAnexo {
  anexo: { nome: string; bytes: number; miniatura: MiniaturaDoAnexo };
  /** O endereço do anexo, que baixa o arquivo; a miniatura fica no `/miniatura` dele. */
  endereco: string;
  /**
   * Sem a legenda, só para o mouse, como na conversa do chamado, que põe embaixo o nome, o tamanho
   * e o "Baixar", o link do teclado e do leitor de tela.
   */
  semLegenda?: boolean;
}

/**
 * A imagem anexada, na miniatura (spec modulo-chat, "Conversa na tela", e modulo-chamados; change
 * chat-com-chamados, tarefa 4.20): escolher a miniatura baixa o arquivo, e o nome e o tamanho vão
 * embaixo, no mesmo link. A largura e a altura reservam o lugar antes de ela chegar, para a
 * conversa, que abre no fim, não sair dele, e ela não se arrasta, para não ser anexada de novo sem
 * querer.
 */
export function ImagemDoAnexo({ anexo, endereco, semLegenda = false }: PropsDaImagemDoAnexo) {
  const { largura, altura } = ladosNaConversa(anexo.miniatura);
  return (
    <a
      className={estilos.imagem}
      href={endereco}
      download={anexo.nome}
      draggable={false}
      style={{ '--largura-da-imagem': `${largura}px` } as CSSProperties}
      {...(semLegenda && { tabIndex: -1, 'aria-hidden': true })}
    >
      <img
        className={estilos.miniatura}
        src={`${endereco}/miniatura`}
        width={largura}
        height={altura}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
      />
      {!semLegenda && (
        <span className={estilos.legenda}>
          <span className={estilos.nome}>{anexo.nome}</span>
          <small>{formatarTamanho(anexo.bytes)}</small>
        </span>
      )}
    </a>
  );
}
