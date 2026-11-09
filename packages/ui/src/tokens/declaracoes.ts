// As declarações de cor de um tema e de um destaque, como o tokens.css as escreve (change
// tema-personalizado, design, decisão 2). Sem o node:fs: servem ao gerador do CSS e ao navegador, que
// aplica o tema e o destaque personalizados.
import type { DestaqueGerado } from './gerador.ts';
import { camadasDeEstado, coresDoCursor, type Tema } from './temas.ts';

export type Declaracoes = Array<[string, string]>;

export const kebab = (nome: string) =>
  nome
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-z])(\d)/g, '$1-$2')
    .toLowerCase();

export function coresDoTema(tema: Tema): Declaracoes {
  return [
    ...Object.entries(tema.cores).map(([nome, valor]): [string, string] => [
      `--cor-${kebab(nome)}`,
      valor,
    ]),
    ...Object.entries(camadasDeEstado(tema.cores)).map(([nome, valor]): [string, string] => [
      `--cor-${nome}`,
      valor,
    ]),
    ...Object.entries(coresDoCursor(tema)).map(([nome, valor]): [string, string] => [
      `--cor-${kebab(nome)}`,
      valor,
    ]),
    ['--sombra-material', tema.sombraMaterial],
    ['--sombra-elevada', tema.sombraElevada],
    ['--sombra-sobreposta', tema.sombraMaterial],
    ['color-scheme', tema.tom === 'escuro' ? 'dark' : 'light'],
  ];
}

/** Cada situação com o texto, o fundo sutil, a borda, o preenchimento e o texto sobre ele. */
export function coresDaSituacao(tema: Tema): Declaracoes {
  return Object.entries(tema.situacoes).flatMap(([nome, situacao]): Declaracoes => {
    const id = kebab(nome);
    return [
      [`--cor-${id}`, situacao.cor],
      [`--cor-${id}-fundo`, situacao.fundo],
      [`--cor-${id}-borda`, situacao.borda],
      [`--cor-${id}-forte`, situacao.forte],
      [`--cor-sobre-${id}`, situacao.sobre],
    ];
  });
}

/** As séries de dados e as tintas dos suprimentos. */
export function coresDosDados(tema: Tema): Declaracoes {
  return [
    ...tema.dados.series.map((serie, indice): [string, string] => [
      `--cor-serie-${indice + 1}`,
      serie,
    ]),
    ...Object.entries(tema.dados.tintas).map(([tinta, cor]): [string, string] => [
      `--cor-tinta-${tinta}`,
      cor,
    ]),
  ];
}

export function coresDoDestaque(cores: DestaqueGerado): Declaracoes {
  return Object.entries(cores).map(([nome, valor]) => [`--cor-${kebab(nome)}`, valor]);
}
