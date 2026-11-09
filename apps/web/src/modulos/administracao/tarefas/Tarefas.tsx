import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  Carimbo,
  EstadoVazio,
  ListaDeDados,
  MensagemDoPasso,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { consultar, itensDasPaginas, paginar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import estilos from '../Administracao.module.css';
import { useFocoPerdido } from '../Parte.tsx';

const POR_PAGINA = 50;

/** A chave da lista nas consultas, que o evento `tarefas.mudaram` invalida. */
export const CHAVE_DAS_TAREFAS = ['tarefas-com-falha'] as const;

/** A situação da última execução, em texto e no tom do rótulo. */
const SITUACOES_DA_EXECUCAO = {
  concluida: { texto: 'Concluída', tom: 'sucesso' },
  'em-andamento': { texto: 'Em andamento', tom: 'info' },
  falhou: { texto: 'Falhou', tom: 'critico' },
} as const;

/**
 * As rotinas (change regras-indicadores-e-tarefas, design, decisão 4): o que o sistema faz sozinho,
 * com o que cada uma faz, quando roda, a última execução e a próxima. Elas mudam de minuto em
 * minuto, e a tela as lê de novo nesse ritmo.
 */
function Rotinas() {
  const api = useApi();
  const { formatarDataEHora } = useDataHora();
  const rotinas = useQuery({
    queryKey: ['tarefas', 'rotinas'],
    queryFn: () => consultar(() => api.GET('/tarefas/rotinas'), 'carregar as rotinas'),
    refetchInterval: 60_000,
  });
  return (
    <section className={estilos.secaoDasTarefas} aria-labelledby="rotinas-das-tarefas">
      <Carimbo id="rotinas-das-tarefas">O que roda sozinho</Carimbo>
      {rotinas.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando as rotinas…
        </p>
      ) : rotinas.isError ? (
        <EstadoVazio
          titulo={rotinas.error.message}
          acao={<Botao onPress={() => void rotinas.refetch()}>Tentar de novo</Botao>}
        />
      ) : rotinas.data.rotinas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma rotina agendada."
          descricao="As rotinas, como a manutenção diária e a avaliação dos alertas, aparecem aqui quando o servidor está com a fila de tarefas ligada."
        />
      ) : (
        <ul aria-label="Rotinas" className={estilos.rotinas}>
          {rotinas.data.rotinas.map((rotina) => (
            <li key={rotina.tarefa} className={estilos.rotina}>
              <p className={estilos.nomeDaTarefa}>{rotina.nome}</p>
              {rotina.descricao && <p className={estilos.descricaoDaRotina}>{rotina.descricao}</p>}
              <ListaDeDados
                itens={[
                  { rotulo: 'Quando roda', valor: rotina.agenda },
                  {
                    rotulo: 'Última execução',
                    valor: rotina.ultima ? (
                      <>
                        <RotuloDeSituacao
                          situacao={SITUACOES_DA_EXECUCAO[rotina.ultima.situacao].tom}
                        >
                          {SITUACOES_DA_EXECUCAO[rotina.ultima.situacao].texto}
                        </RotuloDeSituacao>{' '}
                        {formatarDataEHora(new Date(rotina.ultima.momento))}
                      </>
                    ) : (
                      'Ainda não rodou'
                    ),
                  },
                  {
                    rotulo: 'Próxima',
                    valor: rotina.proxima
                      ? formatarDataEHora(new Date(rotina.proxima))
                      : 'Sem horário',
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A tela das tarefas (spec modulo-administracao e fila-de-tarefas): as rotinas e, embaixo, as
 * tarefas com falha da organização, da mais recente para a mais antiga, com o nome, quando falhou,
 * as tentativas e o erro, e "Tentar de novo", que põe a tarefa de volta na fila. A lista se atualiza
 * sozinha pelos eventos.
 */
export function Tarefas() {
  const api = useApi();
  const consultas = useQueryClient();
  const { formatarDataEHora } = useDataHora();
  const idDosNomes = useId();
  const [repetindo, definirRepetindo] = useState<string | null>(null);
  const [falha, definirFalha] = useState<{ texto: string; vez: number } | null>(null);
  const tarefas = useInfiniteQuery({
    queryKey: CHAVE_DAS_TAREFAS,
    ...paginar(
      (cursor) =>
        api.GET('/tarefas-com-falha', { params: { query: { cursor, limite: POR_PAGINA } } }),
      'carregar as tarefas com falha',
    ),
  });
  const lista = itensDasPaginas(tarefas.data);
  // A tarefa repetida sai da lista com o botão dela: o foco perdido vai ao título da janela.
  const pedirFoco = useFocoPerdido(tarefas.data, () => focarDestino(undefined));

  async function repetir(id: string) {
    definirRepetindo(id);
    definirFalha(null);
    const resultado = await pedir(
      () => api.POST('/tarefas-com-falha/{id}/repeticao', { params: { path: { id } } }),
      'pôr a tarefa de volta na fila',
    );
    definirRepetindo(null);
    if ('erro' in resultado) {
      definirFalha((anterior) => ({ texto: resultado.erro, vez: (anterior?.vez ?? 0) + 1 }));
      return;
    }
    pedirFoco();
    await consultas.invalidateQueries({ queryKey: CHAVE_DAS_TAREFAS });
    avisar({ situacao: 'sucesso', titulo: 'Tarefa de volta na fila.' });
  }

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Tarefas" />
      <Rotinas />
      <section className={estilos.secaoDasTarefas} aria-labelledby="tarefas-com-falha">
        <Carimbo id="tarefas-com-falha">Tarefas com falha</Carimbo>
        {tarefas.isPending ? (
          <p role="status" className={estilos.contagem}>
            Carregando as tarefas com falha…
          </p>
        ) : tarefas.isError && !tarefas.data ? (
          <EstadoVazio
            titulo={tarefas.error.message}
            acao={<Botao onPress={() => void tarefas.refetch()}>Tentar de novo</Botao>}
          />
        ) : lista.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma tarefa com falha."
            descricao="Quando uma rotina ou outra tarefa falha em todas as tentativas, ela aparece aqui, com o erro e “Tentar de novo”."
          />
        ) : (
          <>
            <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
            <ul aria-label="Tarefas com falha" className={estilos.tarefas}>
              {lista.map((tarefa) => (
                <li key={tarefa.id} className={estilos.tarefa}>
                  <p id={`${idDosNomes}-${tarefa.id}`} className={estilos.nomeDaTarefa}>
                    {tarefa.nome}
                  </p>
                  <ListaDeDados
                    itens={[
                      { rotulo: 'Falhou em', valor: formatarDataEHora(new Date(tarefa.falhouEm)) },
                      { rotulo: 'Tentativas', valor: tarefa.tentativas },
                      { rotulo: 'Erro', valor: tarefa.erro },
                    ]}
                  />
                  <div>
                    <Botao
                      aria-describedby={`${idDosNomes}-${tarefa.id}`}
                      carregando={repetindo === tarefa.id}
                      rotuloCarregando="Pondo de volta na fila"
                      onPress={() => void repetir(tarefa.id)}
                    >
                      Tentar de novo
                    </Botao>
                  </div>
                </li>
              ))}
            </ul>
            {tarefas.hasNextPage && (
              <div>
                <Botao
                  carregando={tarefas.isFetchingNextPage}
                  rotuloCarregando="Carregando"
                  onPress={() => void tarefas.fetchNextPage()}
                >
                  Carregar mais
                </Botao>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
