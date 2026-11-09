// A página do painel da operação (change painel-da-operacao, design, decisão 6): uma página só, sem a
// casca, com a faixa de avisos no topo e o estado do servidor lido de novo a cada 30 segundos.

import { Abas } from '@grafite/ui';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import estilos from './App.module.css';
import { type ApiDoPainel, ErroDoPainel } from './api/tipos.ts';
import { Atualizacao } from './atualizacao/Atualizacao.tsx';
import { Backups } from './backups/Backups.tsx';
import { Configuracoes } from './configuracoes/Configuracoes.tsx';
import { Logs } from './logs/Logs.tsx';
import { Sensiveis } from './sensiveis/Sensiveis.tsx';
import { useAndamento } from './tarefas/andamento.ts';
import { PainelDaTarefa } from './tarefas/PainelDaTarefa.tsx';
import { type PedirTarefa, ProvedorDasTarefas } from './tarefas/pedirTarefa.tsx';
import { FaixaDeAvisos, VisaoGeral } from './visao/VisaoGeral.tsx';

export interface PropsDoApp {
  api: ApiDoPainel;
  /** O código do endereço não abriu a sessão: ele já foi usado ou não confere. */
  sessaoRecusada?: boolean;
}

export function App({ api, sessaoRecusada = false }: PropsDoApp) {
  const [consultas] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={consultas}>
      <Pagina api={api} sessaoRecusada={sessaoRecusada} />
    </QueryClientProvider>
  );
}

const PLATAFORMA = { windows: 'Servidor Windows', linux: 'Servidor Linux, com o Docker' } as const;

function Pagina({ api, sessaoRecusada }: Required<PropsDoApp>) {
  const consultas = useQueryClient();
  const estado = useQuery({
    queryKey: ['estado'],
    queryFn: () => api.estado(),
    refetchInterval: 30_000,
  });
  // O estado é lido de novo depois de cada tarefa, como a cada 30 segundos.
  const aoTerminar = useCallback(() => void consultas.invalidateQueries(), [consultas]);
  const { andamento, recusar, fechar } = useAndamento(api, aoTerminar);
  const pedir = useCallback<PedirTarefa>(
    async (tarefa, campos = {}) => {
      const resultado = await api.iniciar(tarefa, campos);
      if ('recusada' in resultado) recusar(resultado.recusada);
      return resultado;
    },
    [api, recusar],
  );
  const semSessao = estado.error instanceof ErroDoPainel && estado.error.status === 401;
  const emAndamento = andamento.rodando
    ? andamento.tarefa
    : (estado.data?.tarefaEmAndamento ?? null);
  return (
    <ProvedorDasTarefas pedir={pedir} emAndamento={emAndamento}>
      <div className={estilos.pagina}>
        <header className={estilos.cabecalho}>
          <h1>Painel da operação</h1>
          {estado.data && <p className={estilos.nota}>{PLATAFORMA[estado.data.plataforma]}</p>}
        </header>
        {/* O código recusado só importa sem a sessão de antes, que o cookie ainda pode ter. */}
        {semSessao && (
          <p role="alert" className={estilos.alerta}>
            {sessaoRecusada
              ? 'O código deste endereço já foi usado: abra o painel de novo pelo comando.'
              : 'Abra o painel pelo comando: o endereço que ele abre traz o código da sessão.'}
          </p>
        )}
        {estado.isPending && <p className={estilos.nota}>Lendo o estado do servidor.</p>}
        {estado.isError && !semSessao && (
          <p role="alert" className={estilos.alerta}>
            {estado.error.message}
          </p>
        )}
        <PainelDaTarefa
          andamento={andamento}
          responder={(id, resposta) => void api.responder(id, resposta).catch(() => {})}
          cancelar={() => void api.cancelar()}
          fechar={fechar}
        />
        {estado.data && (
          <>
            <FaixaDeAvisos avisos={estado.data.avisos} />
            <Abas
              rotulo="Seções do painel"
              padrao="visao"
              abas={[
                {
                  id: 'visao',
                  rotulo: 'Visão geral',
                  conteudo: <VisaoGeral estado={estado.data} />,
                },
                {
                  id: 'atualizacao',
                  rotulo: 'Atualização',
                  conteudo: <Atualizacao api={api} estado={estado.data} />,
                },
                { id: 'backups', rotulo: 'Backups', conteudo: <Backups api={api} /> },
                {
                  id: 'logs',
                  rotulo: 'Logs',
                  conteudo: <Logs api={api} estado={estado.data} />,
                },
                {
                  id: 'configuracoes',
                  rotulo: 'Configurações',
                  conteudo: <Configuracoes api={api} />,
                },
                {
                  id: 'sensiveis',
                  rotulo: 'Operações sensíveis',
                  conteudo: <Sensiveis api={api} estado={estado.data} />,
                },
              ]}
            />
          </>
        )}
      </div>
    </ProvedorDasTarefas>
  );
}
