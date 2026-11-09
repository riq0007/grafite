// As solicitações na ficha do ativo (spec cadastro-de-ativos, "Solicitações na ficha do ativo";
// change p4d-solicitacoes, design, decisão 8): entra pela relação do Operação com o alvo `ativo`,
// para quem vê as solicitações. Mostra as pendentes do ativo e as 5 encerradas mais novas, cada
// uma levando à ficha dela, e, para quem atende, "Nova solicitação": o Toner, quando o tipo do
// ativo usa consumíveis, ou o Conserto, já com o ativo. A consulta fica debaixo da chave das
// solicitações, que o evento `solicitacoes.mudaram` relê.
import { ROTULOS_DOS_TIPOS_DE_SOLICITACAO } from '@grafite/domain';
import { Carimbo, haQuantoTempo, RotuloDeSituacao } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from '../Operacao.module.css';
import { SITUACOES_NA_TELA } from './apresentacao.ts';
import { CHAVE_DAS_SOLICITACOES, type Solicitacao } from './consultas.ts';

function useSolicitacoesDoAtivo(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_SOLICITACOES, 'do-ativo', id],
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/{id}/solicitacoes', { params: { path: { id } } }),
        'carregar as solicitações do ativo',
      ),
  });
}

/** Uma solicitação do ativo: o número, que leva à ficha, o tipo, a situação e há quanto tempo. */
function SolicitacaoDoAtivo({ solicitacao, agora }: { solicitacao: Solicitacao; agora: Date }) {
  const situacao = SITUACOES_NA_TELA[solicitacao.situacao];
  return (
    <li className={estilos.item}>
      <span className={estilos.nomeDoItem}>
        <Link
          to="/operacao/solicitacoes/$numero"
          params={{ numero: String(solicitacao.numero) }}
          className={estilos.link}
        >
          Solicitação {solicitacao.numero}
        </Link>
        <span>{ROTULOS_DOS_TIPOS_DE_SOLICITACAO[solicitacao.tipo]}</span>
      </span>
      <span className={estilos.nomeDoItem}>
        <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>
        <time className="mono" dateTime={solicitacao.registradaEm}>
          {haQuantoTempo(new Date(solicitacao.registradaEm), agora)}
        </time>
      </span>
    </li>
  );
}

export function SolicitacoesNaFichaDoAtivo({ id }: { id: string }) {
  const { pode } = useAcesso();
  const agora = useAgora();
  const consulta = useSolicitacoesDoAtivo(id);
  const dados = consulta.data;
  const todas = dados ? [...dados.pendentes, ...dados.encerradas] : [];
  return (
    <section aria-labelledby={`solicitacoes-${id}`} className={estilos.blocoDaFicha}>
      <Carimbo id={`solicitacoes-${id}`}>Solicitações</Carimbo>
      {consulta.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando as solicitações…
        </p>
      ) : consulta.isError && !dados ? (
        <p className={estilos.contagem}>{consulta.error.message}</p>
      ) : todas.length === 0 ? (
        <p className={estilos.semValor}>Nenhuma solicitação deste ativo.</p>
      ) : (
        <ul className={estilos.itens}>
          {todas.map((solicitacao) => (
            <SolicitacaoDoAtivo key={solicitacao.id} solicitacao={solicitacao} agora={agora} />
          ))}
        </ul>
      )}
      {dados && pode('solicitacoes.atender') && (
        <p className={estilos.informacao}>
          <Link
            to="/operacao/solicitacoes"
            search={{ nova: dados.usaConsumiveis ? 'toner' : 'conserto', ativo: id }}
            className={estilos.link}
          >
            Nova solicitação
          </Link>
        </p>
      )}
    </section>
  );
}
