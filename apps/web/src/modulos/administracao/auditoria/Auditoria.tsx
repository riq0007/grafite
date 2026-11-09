import { ACOES_DA_AUDITORIA } from '@grafite/domain';
import {
  Botao,
  BuscaComSugestoes,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  CampoDeData,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  type FiltroAtivo,
  FiltrosAtivos,
  Icone,
  Linha,
  QuickLook,
  Selecao,
  Tabela,
  useDataHora,
  usePrevia,
} from '@grafite/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ScrollText } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { itensDasPaginas, paginar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { CampoComEspera } from '../CampoComEspera.tsx';
import { type ContaDoSeletor, SeletorDeConta } from '../seletores/SeletorDeConta.tsx';
import {
  type FiltrosDaAuditoria,
  intervaloDo,
  PERIODOS,
  type Periodo,
  textoDoPeriodo,
} from './filtros.ts';
import { camposDoDetalhe, textoDoAlvo, textoDoAtor } from './registro.ts';

const POR_PAGINA = 50;

const ACOES = Object.entries(ACOES_DA_AUDITORIA)
  .map(([id, rotulo]) => ({ id, rotulo }))
  .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

const rotuloDaAcao = (acao: string) => (ACOES_DA_AUDITORIA as Record<string, string>)[acao] ?? acao;

const ORDENS = [
  { id: 'recentes', rotulo: 'Mais recentes primeiro' },
  { id: 'antigos', rotulo: 'Mais antigos primeiro' },
];

const contagem = (total: number, maisDe: boolean) => {
  if (maisDe) return `mais de ${total.toLocaleString('pt-BR')} registros`;
  return total === 1 ? '1 registro' : `${total.toLocaleString('pt-BR')} registros`;
};

/**
 * A auditoria (spec consulta-da-auditoria): os filtros, os filtros ativos, o total e a lista, do
 * mais recente ao mais antigo, com "Carregar mais". O clique na linha ou a barra de espaço abrem o
 * detalhe na prévia, e as setas trocam de registro. Nada aqui altera um registro.
 */
export function Auditoria() {
  const api = useApi();
  const dataHora = useDataHora();
  const filtros = useSearch({ from: '/administracao/auditoria' });
  const navegar = useNavigate({ from: '/administracao/auditoria' });

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDaAuditoria>) =>
      void navegar({
        search: (atuais) =>
          Object.fromEntries(
            Object.entries({ ...atuais, ...mudanca }).filter(([, valor]) => valor !== undefined),
          ),
        replace: true,
      }),
    [navegar],
  );
  const limparFiltros = () => void navegar({ search: {}, replace: true });

  // O período relativo conta a partir de quando os filtros mudaram: as páginas seguintes usam o
  // mesmo intervalo da primeira, e outra renderização com os mesmos filtros também.
  const chaveDosFiltros = JSON.stringify(filtros);
  // biome-ignore lint/correctness/useExhaustiveDependencies: o instante muda com os filtros.
  const agora = useMemo(() => new Date(), [chaveDosFiltros]);
  const parametros = {
    ...intervaloDo(filtros, dataHora, agora),
    ator: filtros.ator,
    acao: filtros.acao,
    rastreio: filtros.rastreio,
    alvo: filtros.alvo,
    ordem: filtros.ordem ?? 'recentes',
  } as const;
  const registros = useInfiniteQuery({
    queryKey: ['auditoria', parametros],
    ...paginar(
      (cursor) =>
        api.GET('/auditoria', {
          params: { query: { ...parametros, cursor, limite: POR_PAGINA } },
        }),
      'carregar a auditoria',
    ),
  });
  const lista = itensDasPaginas(registros.data);
  const previa = usePrevia(lista, (registro) => registro.id);
  const primeira = registros.data?.pages[0];

  const buscarContas = useCallback(
    async (texto: string): Promise<ContaDoSeletor[]> => {
      const resultado = await pedir(
        () => api.GET('/auditoria/contas', { params: { query: { busca: texto, limite: 8 } } }),
        'buscar as contas',
      );
      if ('erro' in resultado) throw new Error(resultado.erro);
      return resultado.dados.itens.map((conta) => ({
        id: conta.id,
        rotulo: conta.usuario ? `${conta.nome} (${conta.usuario})` : conta.nome,
      }));
    },
    [api],
  );

  const ativos = filtrosAtivos(filtros);
  const comFiltro = ativos.length > 0;

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Auditoria" />
      <div className={estilos.filtros}>
        <Selecao
          rotulo="Período"
          opcoes={Object.entries(PERIODOS).map(([id, rotulo]) => ({ id, rotulo }))}
          selectedKey={filtros.periodo ?? 'tudo'}
          onSelectionChange={(chave) => {
            const periodo = String(chave) as Periodo | 'tudo';
            mudarFiltros({
              periodo: periodo === 'tudo' ? undefined : periodo,
              de: undefined,
              ate: undefined,
            });
          }}
        />
        {filtros.periodo === 'personalizado' && (
          <>
            <CampoDeData
              rotulo="De"
              valor={filtros.de ?? null}
              aoMudar={(de) => mudarFiltros({ de: de ?? undefined })}
            />
            <CampoDeData
              rotulo="Até"
              valor={filtros.ate ?? null}
              aoMudar={(ate) => mudarFiltros({ ate: ate ?? undefined })}
              erro={
                filtros.de && filtros.ate && filtros.de > filtros.ate
                  ? 'A data de fim vem antes da de início.'
                  : undefined
              }
            />
          </>
        )}
        <SeletorDeConta
          rotulo="Quem fez"
          valor={filtros.ator ? { id: filtros.ator, rotulo: filtros.quem ?? filtros.ator } : null}
          aoMudar={(conta) => mudarFiltros({ ator: conta?.id, quem: conta?.rotulo })}
          buscar={buscarContas}
        />
        <BuscaComSugestoes
          rotulo="Ação"
          sugestoes={ACOES}
          aceitaTextoLivre={false}
          selectedKey={filtros.acao ?? null}
          onSelectionChange={(chave) =>
            mudarFiltros({ acao: chave === null ? undefined : String(chave) })
          }
        />
        <CampoComEspera
          rotulo="Código de rastreio"
          placeholder="Como R7K2-9QXM"
          valor={filtros.rastreio ?? ''}
          aoMudar={(texto) =>
            mudarFiltros({ rastreio: texto.trim() === '' ? undefined : texto.trim().toUpperCase() })
          }
        />
        <Selecao
          rotulo="Ordem"
          opcoes={ORDENS}
          selectedKey={filtros.ordem ?? 'recentes'}
          onSelectionChange={(chave) =>
            mudarFiltros({ ordem: chave === 'antigos' ? 'antigos' : undefined })
          }
        />
      </div>
      <FiltrosAtivos
        filtros={ativos}
        aoLimpar={(id) => mudarFiltros(LIMPAR[id as keyof typeof LIMPAR] ?? {})}
        aoLimparTodos={limparFiltros}
      />
      {registros.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando a auditoria…
        </p>
      ) : registros.isError && !registros.data ? (
        <EstadoVazio
          titulo={registros.error.message}
          acao={<Botao onPress={() => void registros.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <>
          {lista.length > 0 && primeira && (
            <p className={estilos.contagem}>{contagem(primeira.total, primeira.maisDe)}</p>
          )}
          <Tabela
            rotulo="Registros da auditoria"
            aoAbrirLinha={previa.aoPreverLinha}
            aoPreverLinha={previa.aoPreverLinha}
            carregarMais={{
              haMais: registros.hasNextPage,
              carregando: registros.isFetchingNextPage,
              aoCarregar: () => void registros.fetchNextPage(),
            }}
          >
            <CabecalhoDaTabela>
              <Coluna id="momento" principal especie="data">
                Momento
              </Coluna>
              <Coluna id="quem">Quem fez</Coluna>
              <Coluna id="acao">Ação</Coluna>
              <Coluna id="alvo">Alvo</Coluna>
              <Coluna id="ip" especie="codigo">
                IP
              </Coluna>
              <Coluna id="rastreio" especie="codigo">
                Código de rastreio
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={lista}
              vazio={
                <EstadoVazio
                  titulo="Nenhum registro encontrado."
                  acao={
                    comFiltro ? <Botao onPress={limparFiltros}>Limpar filtros</Botao> : undefined
                  }
                />
              }
            >
              {(registro) => (
                <Linha id={registro.id}>
                  <Celula>{dataHora.formatarDataEHora(new Date(registro.momento))}</Celula>
                  <Celula>{textoDoAtor(registro.ator)}</Celula>
                  <Celula>{registro.rotulo}</Celula>
                  <Celula>{textoDoAlvo(registro.alvo)}</Celula>
                  <Celula>{registro.ip ?? '—'}</Celula>
                  <Celula>{registro.codigoDeRastreio ?? '—'}</Celula>
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        </>
      )}
      {previa.item && (
        <QuickLook
          aberta={previa.aberta}
          aoFechar={previa.aoFechar}
          titulo={previa.item.rotulo}
          subtitulo={dataHora.formatarDataEHora(new Date(previa.item.momento))}
          posicao={previa.posicao}
          total={previa.total}
          visual={<Icone icone={ScrollText} tamanho={48} />}
          campos={camposDoDetalhe(previa.item, dataHora.formatarDataEHora)}
          aoAnterior={previa.aoAnterior}
          aoSeguinte={previa.aoSeguinte}
        />
      )}
    </div>
  );
}

/** O que cada "Limpar o filtro" tira da query string. */
const LIMPAR = {
  periodo: { periodo: undefined, de: undefined, ate: undefined },
  quem: { ator: undefined, quem: undefined },
  acao: { acao: undefined },
  rastreio: { rastreio: undefined },
  alvo: { alvo: undefined, nomeDoAlvo: undefined },
} satisfies Record<string, Partial<FiltrosDaAuditoria>>;

function filtrosAtivos(filtros: FiltrosDaAuditoria): FiltroAtivo[] {
  const periodo = textoDoPeriodo(filtros);
  return [
    ...(periodo ? [{ id: 'periodo', rotulo: 'Período', valor: periodo }] : []),
    ...(filtros.ator
      ? [{ id: 'quem', rotulo: 'Quem fez', valor: filtros.quem ?? filtros.ator }]
      : []),
    ...(filtros.acao ? [{ id: 'acao', rotulo: 'Ação', valor: rotuloDaAcao(filtros.acao) }] : []),
    ...(filtros.rastreio
      ? [{ id: 'rastreio', rotulo: 'Código de rastreio', valor: filtros.rastreio }]
      : []),
    ...(filtros.alvo
      ? [{ id: 'alvo', rotulo: 'Registro', valor: filtros.nomeDoAlvo ?? 'o escolhido' }]
      : []),
  ];
}
