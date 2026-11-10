import { administracao } from './administracao/modulo.ts';
import { ajustes } from './ajustes/modulo.ts';
import { alertas } from './alertas/modulo.ts';
import { ativos } from './ativos/modulo.ts';
import { cofre } from './cofre/modulo.ts';
import { gestao } from './gestao/modulo.ts';
import { inicio } from './inicio/modulo.ts';
import { mapa } from './mapa/modulo.ts';
import { operacao } from './operacao/modulo.ts';
import { paineis } from './paineis/modulo.ts';
import { salas } from './salas/modulo.ts';

/**
 * Registro de módulos, na ordem de fábrica do dock: a conta escolhe outra ordem e tira módulos do
 * dock em Ajustes › Dock. A casca monta o dock, a barra de abas e as rotas a partir dele. Um módulo
 * novo entra com uma linha aqui, antes de Ajustes, que fica sempre no fim, depois do separador do
 * dock.
 */
export const REGISTRO = [
  inicio,
  ativos,
  gestao,
  alertas,
  operacao,
  mapa,
  salas,
  paineis,
  cofre,
  administracao,
  ajustes,
] as const;
