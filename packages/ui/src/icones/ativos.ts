// Ícones próprios dos tipos de ativo (spec iconografia): grade de 24 px, traço e
// terminações da família do projeto (criados com o mesmo motor do Lucide).
import { createLucideIcon, type LucideIcon } from 'lucide-react';

const impressora = createLucideIcon('impressora', [
  ['path', { d: 'M7 8V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4', key: 'papel' }],
  [
    'path',
    {
      d: 'M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
      key: 'corpo',
    },
  ],
  ['path', { d: 'M7 14h10v6a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z', key: 'saida' }],
  ['path', { d: 'M17.5 11h.01', key: 'luz' }],
]);

const computador = createLucideIcon('computador', [
  ['rect', { x: '6', y: '2', width: '12', height: '20', rx: '2', key: 'gabinete' }],
  ['path', { d: 'M10 6h4M10 9h4', key: 'entradas' }],
  ['circle', { cx: '12', cy: '16', r: '1.5', key: 'botao' }],
]);

const notebook = createLucideIcon('notebook', [
  ['rect', { x: '4', y: '4', width: '16', height: '11', rx: '1.5', key: 'tela' }],
  ['path', { d: 'M2 19.5h20l-1.5-3h-17z', key: 'base' }],
]);

const monitor = createLucideIcon('monitor', [
  ['rect', { x: '2', y: '3', width: '20', height: '13', rx: '2', key: 'tela' }],
  ['path', { d: 'M12 16v4M8 21h8', key: 'pe' }],
]);

// Caixa com setas opostas: a convenção dos diagramas de rede, legível em 16 px
// (portas desenhadas viram borrões nesse tamanho).
const switchDeRede = createLucideIcon('switch', [
  ['rect', { x: '2', y: '5', width: '20', height: '14', rx: '2', key: 'chassi' }],
  ['path', { d: 'M6 10h11M14.5 7.5 17 10l-2.5 2.5', key: 'ida' }],
  ['path', { d: 'M18 14H7M9.5 11.5 7 14l2.5 2.5', key: 'volta' }],
]);

const rack = createLucideIcon('rack', [
  ['rect', { x: '4', y: '2', width: '16', height: '20', rx: '1.5', key: 'armario' }],
  ['path', { d: 'M4 8h16M4 14h16', key: 'unidades' }],
  ['path', { d: 'M7 5h.01M7 11h.01M7 17h.01', key: 'luzes' }],
]);

const controleDeAcesso = createLucideIcon('controle-de-acesso', [
  ['rect', { x: '6', y: '2', width: '12', height: '20', rx: '2.5', key: 'terminal' }],
  ['circle', { cx: '12', cy: '9', r: '2.5', key: 'rosto' }],
  ['path', { d: 'M8.5 15.5a4 4 0 0 1 7 0', key: 'ombros' }],
  ['path', { d: 'M11 19h2', key: 'leitor' }],
]);

const camera = createLucideIcon('camera', [
  ['rect', { x: '3', y: '5', width: '12', height: '7', rx: '1.5', key: 'corpo' }],
  ['path', { d: 'M15 7.5 20 6v5l-5-1.5', key: 'lente' }],
  ['path', { d: 'M9 12v8M6 20h6', key: 'suporte' }],
]);

// Cilindro em dois discos: o símbolo de armazenamento dos diagramas de TI.
const storage = createLucideIcon('storage', [
  ['ellipse', { cx: '12', cy: '5.5', rx: '8', ry: '2.5', key: 'topo' }],
  ['path', { d: 'M4 5.5v13c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5v-13', key: 'corpo' }],
  ['path', { d: 'M4 12c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5', key: 'divisao' }],
]);

const nobreak = createLucideIcon('nobreak', [
  ['rect', { x: '5', y: '3', width: '14', height: '18', rx: '2', key: 'gabinete' }],
  ['path', { d: 'M13 7l-3 5h4l-3 5', key: 'raio' }],
]);

const generico = createLucideIcon('ativo', [
  ['path', { d: 'M12 3 20 7.5v9L12 21l-8-4.5v-9z', key: 'cubo' }],
  ['path', { d: 'M4 7.5 12 12l8-4.5M12 12v9', key: 'arestas' }],
]);

export const iconesDeAtivo = {
  impressora,
  computador,
  notebook,
  monitor,
  switch: switchDeRede,
  rack,
  'controle-de-acesso': controleDeAcesso,
  camera,
  storage,
  nobreak,
  generico,
} as const satisfies Record<string, LucideIcon>;

export type TipoComIconeProprio = keyof typeof iconesDeAtivo;

/** Ícone do tipo de ativo; um tipo sem ícone próprio recebe o genérico. */
export function iconeDoTipo(tipo: string): LucideIcon {
  return (iconesDeAtivo as Record<string, LucideIcon>)[tipo] ?? iconesDeAtivo.generico;
}
