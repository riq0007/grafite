// A etapa "Conectando alertas" da chegada (spec chegada, "Carregamento com etapas reais"; change
// p3b-notificacoes-no-servidor, design, decisão 11): com a sessão valendo, a chegada espera as
// notificações recentes, as da contagem do sino, e a conexão de eventos aberta, dentro do prazo
// que divide com a sessão. Sem a sessão valendo, a etapa não vale, e o carregamento não a mostra.
// A leitura não tenta de novo: sem ela, a casca abre com o sino sem número, e o sino lê depois.
import type { QueryClient } from '@tanstack/react-query';
import type { EtapaDaChegada } from '../chegada/etapas.ts';
import type { PrazoDoServidor } from '../chegada/prazo.ts';
import type { ConexaoDeEventos } from '../eventos/conexao.ts';
import type { LojaDaSessao } from '../sessao/loja.ts';
import { opcoesDasRecentes } from './useNotificacoes.tsx';

export interface OpcoesDaEtapaDosAlertas {
  loja: LojaDaSessao;
  /** O cliente das consultas do app, onde as recentes ficam para o sino. */
  consultas: QueryClient;
  conexao: Pick<ConexaoDeEventos, 'aberta'>;
  prazo: PrazoDoServidor;
}

export function etapaDosAlertas({
  loja,
  consultas,
  conexao,
  prazo,
}: OpcoesDaEtapaDosAlertas): EtapaDaChegada {
  return {
    rotulo: 'Conectando alertas',
    vale: () => loja.ler().tipo === 'ativa',
    pronta: () =>
      prazo.esperar(
        Promise.all([
          consultas.prefetchQuery({ ...opcoesDasRecentes(loja.cliente), retry: false }),
          conexao.aberta(),
        ]),
      ),
  };
}
