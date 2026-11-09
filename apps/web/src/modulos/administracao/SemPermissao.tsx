import { EstadoVazio } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';

/** "Peça acesso a Ana Souza, Bruno Costa ou Carla Dias.", ou a quem administra, sem nomes. */
export function pedirAcessoA(nomes: readonly string[]): string {
  if (nomes.length === 0) return 'Peça acesso a quem administra os acessos.';
  const ultimo = nomes.at(-1);
  const lista = nomes.length === 1 ? ultimo : `${nomes.slice(0, -1).join(', ')} ou ${ultimo}`;
  return `Peça acesso a ${lista}.`;
}

/**
 * O lugar sem permissão (spec modulo-administracao): o cadeado, "Você não tem acesso a…" e a quem
 * pedir. Os dados do lugar nem são pedidos.
 */
export function SemPermissao({ a }: { a: string }) {
  const api = useApi();
  const administradores = useQuery({
    queryKey: ['acesso', 'administradores'],
    queryFn: () =>
      consultar(() => api.GET('/acesso/administradores'), 'buscar quem administra os acessos'),
  });
  const nomes = administradores.data?.administradores ?? (administradores.isError ? [] : null);
  return (
    <EstadoVazio
      icone={Lock}
      titulo={`Você não tem acesso ${a}.`}
      descricao={nomes ? pedirAcessoA(nomes) : undefined}
    />
  );
}
