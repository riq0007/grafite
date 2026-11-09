import type { CSSProperties } from 'react';
import { CodigoQR } from '../codigoQR/CodigoQR.tsx';
import estilos from './EtiquetaDoAtivo.module.css';

export type FormatoDeEtiqueta = 'folha-a4' | 'impressora';

/** Uma medida em milímetros. */
interface Medida {
  largura: number;
  altura: number;
}

/** Um formato de etiqueta: as medidas do papel que se compra, em milímetros. */
export interface DefinicaoDoFormato {
  rotulo: string;
  descricao: string;
  etiqueta: Medida;
  pagina: Medida;
  colunas: number;
  linhas: number;
  /** A margem da página até a primeira etiqueta. */
  margem: { topo: number; esquerda: number };
  /** O espaço entre as etiquetas. */
  espaco: { colunas: number; linhas: number };
  /** O tamanho das letras, em pontos, e o respiro em volta, em milímetros. */
  texto: { patrimonio: number; nome: number; organizacao: number };
  respiro: number;
}

/**
 * Os formatos de etiqueta (spec etiquetas-de-ativos; design do P1f, decisão 1), com as medidas das
 * folhas que se compram: a A4 de 21 etiquetas, 3 × 7, de 63,5 × 38,1 mm (como a Pimaco A4356 e a
 * Avery L7160), e a impressora de etiquetas, uma por página, de 50 × 30 mm.
 */
export const FORMATOS_DE_ETIQUETA = {
  'folha-a4': {
    rotulo: 'Folha A4',
    descricao: '21 etiquetas de 63,5 × 38,1 mm',
    etiqueta: { largura: 63.5, altura: 38.1 },
    pagina: { largura: 210, altura: 297 },
    colunas: 3,
    linhas: 7,
    margem: { topo: 15.15, esquerda: 7.25 },
    espaco: { colunas: 2.5, linhas: 0 },
    texto: { patrimonio: 11, nome: 8, organizacao: 6.5 },
    respiro: 2.5,
  },
  impressora: {
    rotulo: 'Impressora de etiquetas',
    descricao: 'uma etiqueta de 50 × 30 mm por página',
    etiqueta: { largura: 50, altura: 30 },
    pagina: { largura: 50, altura: 30 },
    colunas: 1,
    linhas: 1,
    margem: { topo: 0, esquerda: 0 },
    espaco: { colunas: 0, linhas: 0 },
    texto: { patrimonio: 9, nome: 6.5, organizacao: 5.5 },
    respiro: 2,
  },
} as const satisfies Record<FormatoDeEtiqueta, DefinicaoDoFormato>;

export interface PropsDaEtiquetaDoAtivo {
  /** O endereço da ficha do ativo, que o QR code leva. */
  endereco: string;
  patrimonio: string | null;
  /** O nome que o ativo mostra. */
  nome: string;
  organizacao: string;
  formato: FormatoDeEtiqueta;
}

/**
 * A etiqueta de um ativo (spec etiquetas-de-ativos; design do P1f, decisões 1 e 2), nas medidas reais
 * do formato: o QR code da ficha à esquerda e, à direita, o patrimônio em destaque, o nome em até
 * duas linhas e a organização. Preto sobre branco em qualquer tema, na tela e no papel.
 */
export function EtiquetaDoAtivo({
  endereco,
  patrimonio,
  nome,
  organizacao,
  formato,
}: PropsDaEtiquetaDoAtivo) {
  const medidas = FORMATOS_DE_ETIQUETA[formato];
  const ladoDoQr = medidas.etiqueta.altura - medidas.respiro * 2;
  const variaveis = {
    '--largura-da-etiqueta': `${medidas.etiqueta.largura}mm`,
    '--altura-da-etiqueta': `${medidas.etiqueta.altura}mm`,
    '--respiro-da-etiqueta': `${medidas.respiro}mm`,
    '--lado-do-qr': `${ladoDoQr}mm`,
    '--texto-do-patrimonio': `${medidas.texto.patrimonio}pt`,
    '--texto-do-nome': `${medidas.texto.nome}pt`,
    '--texto-da-organizacao': `${medidas.texto.organizacao}pt`,
  } as CSSProperties;
  return (
    <div
      data-etiqueta=""
      data-formato={formato}
      data-endereco={endereco}
      className={estilos.etiqueta}
      style={variaveis}
    >
      <CodigoQR
        valor={endereco}
        rotulo={`QR code da ficha de ${patrimonio ?? nome}`}
        className={estilos.qr}
      />
      <div className={estilos.texto}>
        <span className={estilos.patrimonio}>{patrimonio ?? 'Sem patrimônio'}</span>
        <span className={estilos.nome}>{nome}</span>
        <span className={estilos.organizacao}>{organizacao}</span>
      </div>
    </div>
  );
}
