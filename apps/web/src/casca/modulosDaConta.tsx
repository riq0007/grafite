// Os módulos que a conta vê, para as telas (change dock-personalizavel, design, decisão 4): a casca
// do app já calcula o registro da conta, com as permissões e sem os módulos que a organização
// desligou, e o entrega por este contexto, como faz com a abertura da busca. A seção Dock dos
// Ajustes o lê para listar os módulos que a conta arruma.
import { createContext, useContext } from 'react';
import type { ModuloRegistrado } from '../modulos/tipos.ts';

/** O que uma tela precisa de um módulo da conta para mostrá-lo numa lista. */
export type ModuloDaConta = Pick<ModuloRegistrado, 'id' | 'nome' | 'icone'>;

const NENHUM: readonly ModuloDaConta[] = [];

export const ContextoDosModulosDaConta = createContext<readonly ModuloDaConta[]>(NENHUM);

/** Os módulos que a conta vê, na ordem do registro, com Ajustes; fora da casca, nenhum. */
export const useModulosDaConta = () => useContext(ContextoDosModulosDaConta);
