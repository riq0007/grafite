// O acesso da conta para os módulos (contrato de módulo): `useAcesso()` diz o que a conta da sessão
// pode, já com as permissões incluídas, e acompanha as mudanças da sessão.
import type { Permissao } from '@grafite/domain';
import { useMemo } from 'react';
import type { AcessoDaSessao } from './loja.ts';
import { useServidor, useSessao } from './useSessao.tsx';

export type PermissaoDaSessao = AcessoDaSessao['permissoes'][number];

export interface Acesso {
  /** A conta tem a permissão em algum escopo: na organização ou em algum local. */
  pode(chave: Permissao): boolean;
  /** As permissões como a API as dá, com o escopo de cada uma. */
  permissoes: readonly PermissaoDaSessao[];
}

const SEM_ACESSO: Acesso = { pode: () => false, permissoes: [] };

/**
 * As permissões que só valem na organização que opera o servidor (spec modulo-administracao): nas
 * outras, nem com o perfil Administrador a tela de backup existe.
 */
const SO_NA_OPERADORA: readonly Permissao[] = ['backup.administrar'];

function acessoDe({ permissoes }: AcessoDaSessao, operaOServidor: boolean): Acesso {
  const chaves = new Set<string>(
    permissoes
      .filter((permissao) => permissao.organizacao || permissao.locais.length > 0)
      .filter((permissao) => operaOServidor || !SO_NA_OPERADORA.includes(permissao.chave))
      .map((permissao) => permissao.chave),
  );
  return { pode: (chave) => chaves.has(chave), permissoes };
}

/**
 * Só a sessão que vale tem permissões; a desconhecida e a pendente não têm nenhuma, e as da
 * operadora só valem na organização que opera o servidor. O acesso muda só quando as permissões
 * ou a organização mudam: a loja mantém os mesmos objetos entre as validações.
 */
export function useAcesso(): Acesso {
  const sessao = useSessao();
  const operaOServidor = useServidor()?.operaOServidor ?? false;
  const acesso = sessao.tipo === 'ativa' ? sessao.acesso : null;
  return useMemo(
    () => (acesso ? acessoDe(acesso, operaOServidor) : SEM_ACESSO),
    [acesso, operaOServidor],
  );
}
