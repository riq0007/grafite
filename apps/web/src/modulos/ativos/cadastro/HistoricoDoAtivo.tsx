import type { components } from '@grafite/api-client';
import { Botao, EstadoVazio, ListaDoHistorico } from '@grafite/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { itensDasPaginas, paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { VerNaAuditoria } from '../../administracao/auditoria/VerNaAuditoria.tsx';
import estilos from '../Ativos.module.css';
import { chaveDoHistorico, type FichaDoAtivo as Ficha } from '../consultas.ts';

type Item = components['schemas']['ItemDoHistorico'];

/** O outro ativo de uma ligação, que abre a ficha dele; fora do acesso, só o aviso. */
function OutroAtivo({ outro }: { outro: NonNullable<Item['outro']> }) {
  return (
    <>
      Outro ativo:{' '}
      {outro.id ? (
        <Link to="/ativos/$id" params={{ id: outro.id }} className={estilos.link}>
          {outro.rotulo}
        </Link>
      ) : (
        outro.rotulo
      )}
    </>
  );
}

/**
 * A aba Histórico da ficha (spec cadastro-de-ativos): o que mudou no ativo, do mais novo para o
 * mais antigo, com quem fez e quando, cada campo antes → depois e as travas, e o outro ativo das
 * ligações livres, em páginas. Os valores restritos já chegam de fora para quem não os vê. A quem
 * vê a auditoria, "Ver na auditoria" leva a ela, filtrada pelo ativo.
 */
export function HistoricoDoAtivo({ ficha }: { ficha: Ficha }) {
  const api = useApi();
  const historico = useInfiniteQuery({
    queryKey: chaveDoHistorico(ficha.id),
    ...paginar(
      (cursor) =>
        api.GET('/ativos/{id}/historico', {
          params: { path: { id: ficha.id }, query: { ...(cursor && { cursor }) } },
        }),
      'carregar o histórico',
    ),
  });

  if (historico.isPending) {
    return (
      <p role="status" className={estilos.contagem}>
        Carregando o histórico…
      </p>
    );
  }
  if (historico.isError) {
    return (
      <EstadoVazio
        titulo={historico.error.message}
        acao={<Botao onPress={() => void historico.refetch()}>Tentar de novo</Botao>}
      />
    );
  }

  return (
    <div className={estilos.dadosDoAtivo}>
      <ListaDoHistorico
        rotulo="Histórico do ativo"
        vazio="Nenhum registro deste ativo."
        itens={itensDasPaginas(historico.data).map((item) => ({
          id: item.id,
          acao: item.rotulo,
          quem: item.quem,
          momento: new Date(item.momento),
          mudancas: item.mudancas,
          travas: item.travas,
          detalhe: item.outro ? <OutroAtivo outro={item.outro} /> : undefined,
        }))}
        aoCarregarMais={historico.hasNextPage ? () => void historico.fetchNextPage() : undefined}
        carregandoMais={historico.isFetchingNextPage}
      />
      <VerNaAuditoria alvo={[`ativo:${ficha.id}`]} nome={ficha.rotulo} />
    </div>
  );
}
