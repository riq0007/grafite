// As OS na ficha do ativo (spec cadastro-de-ativos, "Ordens de serviço na ficha do ativo"; change
// p4e-ordens-de-servico, design, decisão 8): entra pela relação do Operação com o alvo `ativo`,
// para quem vê as OS. Mostra as em aberto do ativo e as 5 resolvidas ou encerradas mais novas, cada
// uma com o número, que leva à ficha dela, o problema, a situação e há quanto tempo foi aberta, e,
// para quem atende, "Nova ordem de serviço", já com o ativo. A consulta fica debaixo da chave das
// OS, que o evento `ordens.mudaram` relê.
import { textoDaOrdem } from '@grafite/domain';
import { Carimbo, haQuantoTempo, RotuloDeSituacao } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from '../Operacao.module.css';
import { SITUACOES_DA_ORDEM_NA_TELA } from './apresentacao.ts';
import { CHAVE_DAS_ORDENS, type OrdemDeServico } from './consultas.ts';

function useOrdensDoAtivo(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_ORDENS, 'do-ativo', id],
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/{id}/ordens', { params: { path: { id } } }),
        'carregar as ordens de serviço do ativo',
      ),
  });
}

/** Uma OS do ativo: o número, que leva à ficha, o problema, a situação e há quanto tempo. */
function OrdemDoAtivo({ ordem, agora }: { ordem: OrdemDeServico; agora: Date }) {
  const situacao = SITUACOES_DA_ORDEM_NA_TELA[ordem.situacao];
  return (
    <li className={estilos.item}>
      <span className={estilos.nomeDoItem}>
        <Link
          to="/operacao/ordens/$numero"
          params={{ numero: String(ordem.numero) }}
          className={estilos.link}
        >
          {textoDaOrdem(ordem.numero)}
        </Link>
        <span>{ordem.problema}</span>
      </span>
      <span className={estilos.nomeDoItem}>
        <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>
        <time className="mono" dateTime={ordem.abertaEm}>
          {haQuantoTempo(new Date(ordem.abertaEm), agora)}
        </time>
      </span>
    </li>
  );
}

export function OrdensNaFichaDoAtivo({ id }: { id: string }) {
  const { pode } = useAcesso();
  const agora = useAgora();
  const consulta = useOrdensDoAtivo(id);
  const dados = consulta.data;
  const todas = dados ? [...dados.emAberto, ...dados.resolvidasOuEncerradas] : [];
  return (
    <section aria-labelledby={`ordens-${id}`} className={estilos.blocoDaFicha}>
      <Carimbo id={`ordens-${id}`}>Ordens de serviço</Carimbo>
      {consulta.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando as ordens de serviço…
        </p>
      ) : consulta.isError && !dados ? (
        <p className={estilos.contagem}>{consulta.error.message}</p>
      ) : todas.length === 0 ? (
        <p className={estilos.semValor}>Nenhuma ordem de serviço deste ativo.</p>
      ) : (
        <ul className={estilos.itens}>
          {todas.map((ordem) => (
            <OrdemDoAtivo key={ordem.id} ordem={ordem} agora={agora} />
          ))}
        </ul>
      )}
      {dados && pode('ordens.atender') && (
        <p className={estilos.informacao}>
          <Link to="/operacao/ordens" search={{ nova: true, ativo: id }} className={estilos.link}>
            Nova ordem de serviço
          </Link>
        </p>
      )}
    </section>
  );
}
