// O Operação na ficha do fornecedor (spec fornecedores, "Consumíveis do fornecedor"; change
// p4c-estoque, design, decisões 6 e 7): os consumíveis ativos que ele vende, para quem vê os
// consumíveis, e quantas entradas dele houve nos locais que a conta vê, para quem vê o estoque.
// Cada parte aparece só com a permissão dela.
import { useDataHora } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { CHAVE_DO_CONSUMIVEL } from '../consumiveis/consultas.ts';
import estilosDaOperacao from '../Operacao.module.css';
import { CHAVE_DO_ESTOQUE } from './consultas.ts';
import estilos from './Estoque.module.css';

export function OperacaoNoFornecedor({ id, nome }: { id: string; nome?: string }) {
  const { pode } = useAcesso();
  return (
    <>
      {(pode('consumiveis.ver') || pode('consumiveis.editar')) && (
        <ConsumiveisDoFornecedor id={id} />
      )}
      {(pode('estoque.ver') || pode('estoque.movimentar')) && (
        <EntradasDoFornecedor id={id} nome={nome ?? ''} />
      )}
    </>
  );
}

function ConsumiveisDoFornecedor({ id }: { id: string }) {
  const api = useApi();
  const consumiveis = useQuery({
    // Debaixo da chave das fichas dos consumíveis: o evento `consumiveis.mudaram` a relê.
    queryKey: [...CHAVE_DO_CONSUMIVEL, 'do-fornecedor', id],
    queryFn: () =>
      consultar(
        () => api.GET('/fornecedores/{id}/consumiveis', { params: { path: { id } } }),
        'carregar os consumíveis do fornecedor',
      ),
  });
  const lista = consumiveis.data?.consumiveis;
  if (!lista) return null;
  return (
    <section aria-label="Consumíveis deste fornecedor" className={estilosDaOperacao.lista}>
      {lista.length === 0 ? (
        <p className={estilos.relacao}>Nenhum consumível deste fornecedor.</p>
      ) : (
        <p className={estilos.relacao}>
          <span>Consumíveis deste fornecedor:</span>
          {lista.map((consumivel) => (
            <Link
              key={consumivel.id}
              to="/operacao/consumiveis/$id"
              params={{ id: consumivel.id }}
              className={`mono ${estilosDaOperacao.link}`}
            >
              {consumivel.codigo}
            </Link>
          ))}
        </p>
      )}
    </section>
  );
}

function EntradasDoFornecedor({ id, nome }: { id: string; nome: string }) {
  const api = useApi();
  const dataHora = useDataHora();
  const entradas = useQuery({
    queryKey: [...CHAVE_DO_ESTOQUE, 'entradas-do-fornecedor', id],
    queryFn: () =>
      consultar(
        () => api.GET('/fornecedores/{id}/entradas', { params: { path: { id } } }),
        'carregar as entradas do fornecedor',
      ),
  });
  const dados = entradas.data;
  if (!dados) return null;
  return (
    <section aria-label="Entradas no estoque" className={estilosDaOperacao.lista}>
      {dados.entradas === 0 || !dados.ultima ? (
        <p className={estilos.relacao}>Nenhuma entrada deste fornecedor no estoque.</p>
      ) : (
        <p className={estilos.relacao}>
          <span>
            Entradas no estoque: {dados.entradas.toLocaleString('pt-BR')}, a última em{' '}
            {dataHora.formatarData(new Date(dados.ultima))}
          </span>
          <Link
            to="/operacao/movimentacoes"
            search={{ tipo: 'entrada', fornecedor: id }}
            className={estilosDaOperacao.link}
            aria-label={`Ver as entradas da ${nome}`}
          >
            Ver as entradas
          </Link>
        </p>
      )}
    </section>
  );
}
