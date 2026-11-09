import { ROTULOS_DOS_TIPOS_DE_MOVIMENTO } from '@grafite/domain';
import { Botao, Carimbo, RotuloDeSituacao, useDataHora } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowDownToLine } from 'lucide-react';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from '../Operacao.module.css';
import { minimoEscrito, quantidadeEscrita, SITUACOES_DO_SALDO_NA_TELA } from './apresentacao.ts';
import { CHAVE_DO_ESTOQUE, type MovimentoDoEstoque } from './consultas.ts';

/** A seção, só para quem vê o estoque. */
export function EstoqueNaFichaDoConsumivel({ id, codigo }: { id: string; codigo: string }) {
  const { pode } = useAcesso();
  if (!pode('estoque.ver') && !pode('estoque.movimentar')) return null;
  return <SecaoDoEstoque id={id} codigo={codigo} />;
}

/** Os locais da movimentação, como "Jundiaí › Almoxarifado → Jundiaí › Expedição". */
const locaisDo = (movimento: MovimentoDoEstoque) =>
  [movimento.origem?.caminho, movimento.destino?.caminho].filter(Boolean).join(' → ');

/**
 * A seção Estoque da ficha do consumível (spec modulo-operacao, "Estoque na ficha do consumível"):
 * o saldo, o mínimo e a situação em cada local que a conta vê, a soma, as 10 movimentações mais
 * novas e o caminho para as movimentações dele; para quem movimenta, a entrada com o consumível.
 */
function SecaoDoEstoque({ id, codigo }: { id: string; codigo: string }) {
  const api = useApi();
  const navegar = useNavigate();
  const dataHora = useDataHora();
  const estoque = useQuery({
    queryKey: [...CHAVE_DO_ESTOQUE, 'do-consumivel', id],
    queryFn: () =>
      consultar(
        () => api.GET('/consumiveis/{id}/estoque', { params: { path: { id } } }),
        'carregar o estoque do consumível',
      ),
  });
  const dados = estoque.data;
  return (
    <section aria-label="Estoque" className={estilos.lista}>
      <div className={estilos.cabecalhoDaSecao}>
        <Carimbo nivel={3}>Estoque</Carimbo>
        {dados?.permite.movimentar && (
          <Botao
            nivel="secundario"
            icone={ArrowDownToLine}
            onPress={() =>
              void navegar({
                to: '/operacao/estoque',
                search: { lancar: 'entrada', consumivel: id },
              })
            }
          >
            Entrada
          </Botao>
        )}
      </div>
      {estoque.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando o estoque…
        </p>
      ) : estoque.isError || !dados ? (
        <p className={estilos.informacao}>{estoque.error?.message}</p>
      ) : (
        <>
          {dados.saldos.length > 0 && (
            <>
              <ul aria-label="Saldos nos locais" className={estilos.itens}>
                {dados.saldos.map((saldo) => {
                  const situacao = SITUACOES_DO_SALDO_NA_TELA[saldo.situacao];
                  return (
                    <li key={saldo.id} className={estilos.item}>
                      <span className={estilos.nomeDoItem}>
                        <span>{saldo.local.caminho}</span>
                        <span>{quantidadeEscrita(saldo.saldo)}</span>
                        <span className={estilos.semValor}>
                          {saldo.minimo === 0
                            ? minimoEscrito(saldo.minimo)
                            : `mínimo ${minimoEscrito(saldo.minimo)}`}
                        </span>
                      </span>
                      <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>
                    </li>
                  );
                })}
              </ul>
              <p className={estilos.informacao}>
                {quantidadeEscrita(dados.soma)} em estoque nos locais que você vê
              </p>
            </>
          )}
          {dados.movimentos.length > 0 ? (
            <ul aria-label="Movimentações mais novas" className={estilos.itens}>
              {dados.movimentos.map((movimento) => (
                <li key={movimento.id} className={estilos.nomeDoItem}>
                  <span>{dataHora.formatarDataEHora(new Date(movimento.momento))}</span>
                  <span>
                    {ROTULOS_DOS_TIPOS_DE_MOVIMENTO[movimento.tipo]} de{' '}
                    {quantidadeEscrita(movimento.quantidade)}
                  </span>
                  <span className={estilos.semValor}>{locaisDo(movimento)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={estilos.semValor}>Nenhuma movimentação deste consumível.</p>
          )}
          <Link
            to="/operacao/movimentacoes"
            search={{ consumivel: id }}
            className={estilos.link}
            aria-label={`Ver as movimentações do ${codigo}`}
          >
            Ver as movimentações
          </Link>
        </>
      )}
    </section>
  );
}
