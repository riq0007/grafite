// A primeira tela ao entrar (change chamados-da-ti, design, decisão 14): na primeira carga de cada
// aba, a raiz pura leva a conta ao módulo que declara a primeira tela, como o Chamados. A marca da
// aba, com o usuário da conta, faz o recarregar ficar onde estava; outra conta na mesma aba tem a
// primeira tela dela.
import type { HistoryLocation } from '@tanstack/react-router';
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { registroDaConta } from '../modulos/registroDaConta.ts';
import type { ModuloRegistrado } from '../modulos/tipos.ts';
import type { criarRoteador } from '../rotas/arvore.ts';
import type { LojaDaSessao } from '../sessao/loja.ts';
import { acessoDe } from '../sessao/useAcesso.ts';
import { useLojaDaSessao } from '../sessao/useSessao.tsx';

/** A marca da aba, no sessionStorage: o usuário da última conta que a casca mostrou nela. */
const MARCA = 'grafite.entrou';

/** O usuário da marca da aba. Sem o sessionStorage, nenhum, e a raiz troca em toda carga. */
function lerAMarca(): string | null {
  try {
    return sessionStorage.getItem(MARCA);
  } catch {
    return null;
  }
}

function gravarAMarca(usuario: string): void {
  try {
    sessionStorage.setItem(MARCA, usuario);
  } catch {
    // Sem a marca, a próxima carga da raiz só repete a primeira tela.
  }
}

/**
 * A casca marca a aba com a conta da sessão que vale: ao abrir, com ou sem a troca, e quando a
 * sessão desconhecida passa a ser conhecida, sem trocar a tela.
 */
export function useMarcaDaAba(usuario: string | null): void {
  useEffect(() => {
    if (usuario !== null) gravarAMarca(usuario);
  }, [usuario]);
}

/**
 * Para onde a raiz vai na primeira carga do roteador: o endereço do primeiro módulo do registro da
 * conta que declara a primeira tela, ou nenhum, e a casca fica onde está. Só a raiz pura troca, só
 * com a sessão que vale e só sem a marca da conta na aba.
 */
export function destinoAoEntrar({
  sessao,
  modulos,
  local,
  marca,
}: {
  sessao: Pick<LojaDaSessao, 'ler' | 'lerServidor'>;
  /** O registro inteiro, na ordem de fábrica. */
  modulos: readonly ModuloRegistrado[];
  /** O endereço do histórico, antes da primeira carga. */
  local: Pick<HistoryLocation, 'pathname' | 'search' | 'hash'>;
  /** O usuário da marca da aba. */
  marca: string | null;
}): string | null {
  const estado = sessao.ler();
  if (estado.tipo !== 'ativa' || marca === estado.conta.usuario) return null;
  if (local.pathname !== '/' || local.search !== '' || local.hash !== '') return null;
  const servidor = sessao.lerServidor();
  const { pode } = acessoDe(estado.acesso, servidor?.operaOServidor ?? false);
  const daConta = registroDaConta(modulos, pode, servidor?.modulosDesligados);
  return daConta.find((modulo) => modulo.primeiraTela)?.endereco ?? null;
}

/**
 * A primeira carga do roteador, quando a porta monta a casca: antes de o roteador montar, a raiz
 * pura dá lugar à primeira tela da conta no histórico (`replace`), e o roteador já carrega nela. O
 * Início não chega a abrir, o foco da abertura fica onde está, e as navegações depois não passam
 * por aqui.
 */
export function PrimeiraCarga({
  roteador,
  children,
}: {
  roteador: ReturnType<typeof criarRoteador>;
  /** O roteador, que monta depois da troca. */
  children: ReactNode;
}) {
  const sessao = useLojaDaSessao();
  const [decidida, definirDecidida] = useState(false);
  useLayoutEffect(() => {
    const destino = destinoAoEntrar({
      sessao,
      modulos: roteador.options.context.modulos,
      local: roteador.history.location,
      marca: lerAMarca(),
    });
    if (destino) roteador.history.replace(destino);
    definirDecidida(true);
  }, [roteador, sessao]);
  return decidida ? children : null;
}
