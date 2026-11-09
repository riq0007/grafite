// Os consumíveis compatíveis na ficha do modelo (spec modulo-operacao, "Consumíveis compatíveis na
// ficha do modelo"; change p4b-consumiveis, design, decisões 5 e 6): referência do modelo, para quem
// vê a ficha dele, sem a permissão dos consumíveis, como o cartão da ficha do ativo. Fica fora das
// relações do registro, que somem com o módulo Operação para quem não o vê; some só com o Operação
// desligado, e o modelo de um tipo sem a capacidade não tem a seção.
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useServidor } from '../../../sessao/useSessao.tsx';
import { ListaDeCompativeis } from '../../operacao/consumiveis/ListaDeCompativeis.tsx';
import estilos from '../Ativos.module.css';

/** A chave dos compatíveis de cada modelo, com o id dele depois. */
export const CHAVE_DOS_CONSUMIVEIS_DO_MODELO = ['consumiveis-do-modelo'] as const;

export function ConsumiveisDoModelo({ id }: { id: string }) {
  const api = useApi();
  const ligado = !(useServidor()?.modulosDesligados ?? []).includes('operacao');
  const compativeis = useQuery({
    queryKey: [...CHAVE_DOS_CONSUMIVEIS_DO_MODELO, id],
    queryFn: () =>
      consultar(
        () => api.GET('/modelos/{id}/consumiveis', { params: { path: { id } } }),
        'carregar os consumíveis compatíveis',
      ),
    enabled: ligado,
  });
  const consumiveis = compativeis.data?.consumiveis;
  // Sem a capacidade no tipo, com o Operação desligado ou sem resposta, a ficha não tem a seção.
  if (!ligado || !consumiveis) return null;
  return (
    <section aria-label="Consumíveis compatíveis" className={estilos.parte}>
      <h2 className={estilos.tituloDaParte}>Consumíveis compatíveis</h2>
      {consumiveis.length === 0 ? (
        <p className={estilos.informacao}>
          Nenhum consumível compatível. A compatibilidade é escolhida na ficha de cada consumível.
        </p>
      ) : (
        <ListaDeCompativeis compativeis={consumiveis} />
      )}
    </section>
  );
}
