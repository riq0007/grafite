// As visões de uma tabela na web (design do P1c, decisões 6, 7 e 10): a lista da API, as que a conta
// pode usar com a de fábrica, a visão que abre pelas duas camadas das preferências, e criar, salvar,
// renomear, remover, usar como padrão da organização e fixar no menu (change visoes-no-dock), com os
// retornos. O evento `visoes.mudaram` invalida a consulta.
import type { components } from '@grafite/api-client';
import {
  type DefinicaoDaVisao,
  type IdDaTabelaComVisoes,
  LIMITES_DAS_PREFERENCIAS,
  lerAjustes,
  tabelaComVisoes,
  VISAO_DE_FABRICA,
  visaoQueVale,
} from '@grafite/domain';
import { avisar } from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ClienteDaApi } from '../api/cliente.ts';
import { consultar } from '../api/consultas.ts';
import { pedir } from '../api/pedir.ts';
import { useApi } from '../api/useApi.tsx';
import { usePreferencias } from '../preferencias/usePreferencias.tsx';
import { useLojaDaSessao, useSessao } from '../sessao/useSessao.tsx';
import type { GravacaoDaTabela } from './useEstadoDaTabela.ts';

export type VisaoDaTabela = components['schemas']['VisaoDaTabela'];
/** As visões de uma tabela, como a API as lista, com o que a conta pode compartilhar. */
type ListaDasVisoes = components['schemas']['VisoesDaTabela'];

export const chaveDasVisoes = (tabela: IdDaTabelaComVisoes) => ['visoes', tabela] as const;

/** A consulta das visões de uma tabela, para uma tabela só ou para várias de uma vez. */
export const consultaDasVisoes = (api: ClienteDaApi, tabela: IdDaTabelaComVisoes) => ({
  queryKey: chaveDasVisoes(tabela),
  queryFn: () =>
    consultar(() => api.GET('/visoes', { params: { query: { tabela } } }), 'carregar as visões'),
});

export function useVisoes(tabela: IdDaTabelaComVisoes) {
  const api = useApi();
  return useQuery(consultaDasVisoes(api, tabela));
}

export interface VisaoUsavel {
  nome: string;
  definicao: DefinicaoDaVisao;
  /** A visão da própria conta, que guarda as mudanças nela; sem isso, a de fábrica ou da organização. */
  daConta?: boolean;
}

/** As visões que a conta pode usar, pelo id: a de fábrica e as da API; nenhuma enquanto carregam. */
export function visoesUsaveis(
  tabela: IdDaTabelaComVisoes,
  visoes: readonly VisaoDaTabela[] | undefined,
): Map<string, VisaoUsavel> | undefined {
  const fabrica = tabelaComVisoes(tabela)?.fabrica;
  if (!visoes || !fabrica) return undefined;
  return new Map<string, VisaoUsavel>([
    [VISAO_DE_FABRICA, { nome: fabrica.nome, definicao: fabrica.definicao }],
    ...visoes.map((visao): [string, VisaoUsavel] => [
      visao.id,
      { nome: visao.nome, definicao: visao.definicao, daConta: !visao.compartilhada },
    ]),
  ]);
}

/**
 * A visão que abre, pelas duas camadas: a escolhida pela conta, a padrão da organização e a de
 * fábrica, pulando a que a conta não pode usar. A escolha que ainda não chegou à conta no servidor
 * aparece só na preferência resolvida, quando ela difere da padrão da organização.
 */
export function visaoQueAbreDasCamadas(
  {
    daConta,
    daOrganizacao,
    resolvida,
  }: { daConta?: string; daOrganizacao?: string; resolvida?: string },
  usaveis: ReadonlySet<string>,
): string {
  const conta = resolvida !== undefined && resolvida !== daOrganizacao ? resolvida : daConta;
  return visaoQueVale({ conta, organizacao: daOrganizacao }, usaveis);
}

export function useVisaoQueAbre(
  tabela: IdDaTabelaComVisoes,
  usaveis: ReadonlyMap<string, unknown> | undefined,
): string {
  const sessao = useSessao();
  const loja = useLojaDaSessao();
  const { preferencias } = usePreferencias();
  const daConta =
    sessao.tipo === 'ativa'
      ? lerAjustes(sessao.conta.preferencias).tabelas?.visoes?.[tabela]
      : undefined;
  const daOrganizacao = lerAjustes(loja.lerPadroes() ?? {}).tabelas?.visoes?.[tabela];
  return visaoQueAbreDasCamadas(
    { daConta, daOrganizacao, resolvida: preferencias.tabelas.visoes[tabela] },
    new Set(usaveis?.keys() ?? []),
  );
}

/** A visão padrão da organização na tabela, quando ela tem uma, pelos padrões da sessão. */
export function useVisaoPadraoDaOrganizacao(tabela: IdDaTabelaComVisoes): string | undefined {
  const loja = useLojaDaSessao();
  useSessao();
  return lerAjustes(loja.lerPadroes() ?? {}).tabelas?.visoes?.[tabela];
}

/**
 * Grava a visão escolhida no menu como a da conta, que abre a tabela em qualquer aparelho em que a
 * conta entrar, pela sincronia das preferências.
 */
export function useGravarEscolhaDaVisao(tabela: IdDaTabelaComVisoes): (id: string) => void {
  const { preferencias, mudar } = usePreferencias();
  return (id) => mudar('tabelas', { visoes: { ...preferencias.tabelas.visoes, [tabela]: id } });
}

/** A recusa de uma ação, com o texto e, quando a API os deu, os campos recusados. */
export interface RecusaDaVisao {
  ok: false;
  erro: string;
  campos?: Record<string, string>;
}

export function useAcoesDasVisoes(tabela: IdDaTabelaComVisoes) {
  const api = useApi();
  const consultas = useQueryClient();
  const loja = useLojaDaSessao();
  const reler = () => consultas.invalidateQueries({ queryKey: chaveDasVisoes(tabela) });

  /**
   * O pedido, com o retorno no sucesso e a recusa por campo na falha. A mudança entra na lista
   * guardada assim que a API a aceita: a tela abre a visão criada e mostra a salva, a renomeada e a
   * removida sem esperar a lista relida, que vem depois sem segurar o diálogo.
   */
  async function fazer<T>(
    pedido: () => Promise<{ data?: T; error?: unknown; response: Response }>,
    acao: string,
    retorno: string,
    naLista: (dados: T, visoes: VisaoDaTabela[]) => VisaoDaTabela[],
    /** A visão cujas mudanças da conta saem da lista, na mesma troca. */
    semAsMudancasDe?: string,
  ): Promise<{ ok: true; dados: T } | RecusaDaVisao> {
    const resultado = await pedir(pedido, acao);
    if ('erro' in resultado) {
      const campos = resultado.problema?.campos;
      return { ok: false, erro: resultado.erro, ...(campos ? { campos } : {}) };
    }
    consultas.setQueryData<ListaDasVisoes>(chaveDasVisoes(tabela), (lista) =>
      lista
        ? {
            ...lista,
            visoes: naLista(resultado.dados, lista.visoes),
            ...(semAsMudancasDe === undefined
              ? {}
              : {
                  mudancas: (lista.mudancas ?? []).filter(
                    (mudancas) => mudancas.visao !== semAsMudancasDe,
                  ),
                }),
          }
        : lista,
    );
    void reler();
    avisar({ situacao: 'sucesso', titulo: retorno });
    return { ok: true, dados: resultado.dados };
  }
  /** A visão que a API devolveu no lugar da guardada, ou no fim da lista, se é nova. */
  const comAVisao = (visao: VisaoDaTabela, visoes: VisaoDaTabela[]) =>
    visoes.some((outra) => outra.id === visao.id)
      ? visoes.map((outra) => (outra.id === visao.id ? visao : outra))
      : [...visoes, visao];
  const semDados = <T>(resultado: { ok: true; dados: T } | RecusaDaVisao) =>
    resultado.ok ? { ok: true as const } : resultado;

  async function criarVisao(
    corpo: { nome: string; compartilhada: boolean; definicao: DefinicaoDaVisao },
    acao: string,
    retorno: string,
  ): Promise<{ ok: true; visao: VisaoDaTabela } | RecusaDaVisao> {
    const { nome, compartilhada, definicao } = corpo;
    const resultado = await fazer(
      () =>
        api.POST('/visoes', {
          body: { tabela, nome, compartilhada, definicao: { ...definicao } },
        }),
      acao,
      retorno,
      comAVisao,
    );
    return resultado.ok ? { ok: true, visao: resultado.dados } : resultado;
  }

  return {
    criar: (corpo: { nome: string; compartilhada: boolean; definicao: DefinicaoDaVisao }) =>
      criarVisao(corpo, 'criar a visão', 'Visão criada.'),
    /** Uma visão da conta com a tabela como está, com as mudanças da conta, que continuam. */
    duplicar: ({ nome, definicao }: { nome: string; definicao: DefinicaoDaVisao }) =>
      criarVisao({ nome, compartilhada: false, definicao }, 'duplicar a visão', 'Visão duplicada.'),
    /**
     * Grava as mudanças da conta na visão da organização, para todos, e a API as apaga: a lista
     * guardada passa à visão publicada e perde as mudanças na mesma troca, sem que a tela veja a
     * visão nova com as mudanças antigas por cima.
     */
    async publicar(id: string) {
      return semDados(
        await fazer(
          () => api.POST('/visoes/{id}/publicar', { params: { path: { id } } }),
          'salvar na visão da organização',
          'Visão salva.',
          comAVisao,
          id,
        ),
      );
    },
    async salvar(id: string, definicao: DefinicaoDaVisao) {
      return semDados(
        await fazer(
          () =>
            api.PATCH('/visoes/{id}', {
              params: { path: { id } },
              body: { definicao: { ...definicao } },
            }),
          'salvar a visão',
          'Visão salva.',
          comAVisao,
        ),
      );
    },
    async renomear(id: string, nome: string) {
      return semDados(
        await fazer(
          () => api.PATCH('/visoes/{id}', { params: { path: { id } }, body: { nome } }),
          'renomear a visão',
          'Visão renomeada.',
          comAVisao,
        ),
      );
    },
    async remover(id: string) {
      return semDados(
        await fazer(
          () => api.DELETE('/visoes/{id}', { params: { path: { id } } }),
          'remover a visão',
          'Visão removida.',
          (_, visoes) => visoes.filter((visao) => visao.id !== id),
        ),
      );
    },
    /** Grava a visão nos padrões da organização; os padrões chegam com o estado da sessão. */
    async usarComoPadrao(id: string) {
      const resultado = await pedir(
        () =>
          api.PATCH('/organizacao/padroes', {
            body: { mudancas: { tabelas: { visoes: { [tabela]: id } } } },
          }),
        'definir o padrão da organização',
      );
      if ('erro' in resultado) return { ok: false as const, erro: resultado.erro };
      await loja.validar();
      avisar({ situacao: 'sucesso', titulo: 'Padrão da organização definido.' });
      return { ok: true as const };
    },
  };
}

/**
 * A lista das fixadas de uma camada depois de fixar a visão (change visoes-no-dock, design,
 * decisão 1): no fim, só com as que ainda existem; nenhuma quando a camada já tem 20.
 */
export function listaAoFixar(
  lista: readonly string[],
  id: string,
  existe: (id: string) => boolean,
): string[] | null {
  const atuais = lista.filter((outra) => outra !== id && existe(outra));
  return atuais.length >= LIMITES_DAS_PREFERENCIAS.fixadas ? null : [...atuais, id];
}

/** A lista das fixadas depois de desafixar a visão, só com as que ainda existem. */
export const listaAoDesafixar = (
  lista: readonly string[],
  id: string,
  existe: (id: string) => boolean,
): string[] => lista.filter((outra) => outra !== id && existe(outra));

/**
 * As visões fixadas no menu do módulo da tabela (change visoes-no-dock, design, decisões 1 e 3): as
 * da conta, nas preferências dela, e as da organização, nos padrões, que chegam com o estado da
 * sessão. Fixar e desafixar gravam a lista inteira da camada.
 */
export function useFixadas(
  tabela: IdDaTabelaComVisoes,
  visoes: readonly VisaoDaTabela[] | undefined,
) {
  const api = useApi();
  const loja = useLojaDaSessao();
  const { preferencias, mudar } = usePreferencias();
  const daConta = preferencias.tabelas.fixadas[tabela] ?? [];
  const daOrganizacao = preferencias.tabelas.fixadasPelaOrganizacao[tabela] ?? [];
  // Sem a lista da API, nenhuma visão sai da lista gravada.
  const existe = (id: string) => !visoes || visoes.some((visao) => visao.id === id);
  const daOrganizacaoExiste = (id: string) =>
    !visoes || visoes.some((visao) => visao.id === id && visao.compartilhada);

  const naConta = (lista: string[], retorno: string) => {
    mudar('tabelas', { fixadas: { ...preferencias.tabelas.fixadas, [tabela]: lista } });
    avisar({ situacao: 'sucesso', titulo: retorno });
  };
  async function nosPadroes(lista: string[], acao: string, retorno: string) {
    const resultado = await pedir(
      () =>
        api.PATCH('/organizacao/padroes', {
          body: { mudancas: { tabelas: { fixadasPelaOrganizacao: { [tabela]: lista } } } },
        }),
      acao,
    );
    if ('erro' in resultado) {
      avisar({ situacao: 'atencao', titulo: resultado.erro });
      return;
    }
    await loja.validar();
    avisar({ situacao: 'sucesso', titulo: retorno });
  }

  return {
    daConta,
    daOrganizacao,
    fixar(id: string) {
      const lista = listaAoFixar(daConta, id, existe);
      if (!lista) {
        avisar({
          situacao: 'atencao',
          titulo: 'Você já fixou 20 visões. Desafixe uma para fixar outra.',
        });
        return;
      }
      naConta(lista, 'Visão fixada no menu.');
    },
    desafixar(id: string) {
      naConta(listaAoDesafixar(daConta, id, existe), 'Visão desafixada do menu.');
    },
    async fixarParaTodos(id: string) {
      const lista = listaAoFixar(daOrganizacao, id, daOrganizacaoExiste);
      if (!lista) {
        avisar({
          situacao: 'atencao',
          titulo: 'A organização já fixou 20 visões. Desafixe uma para fixar outra.',
        });
        return;
      }
      await nosPadroes(lista, 'fixar a visão no menu de todos', 'Visão fixada no menu.');
    },
    async desafixarParaTodos(id: string) {
      await nosPadroes(
        listaAoDesafixar(daOrganizacao, id, daOrganizacaoExiste),
        'desafixar a visão do menu de todos',
        'Visão desafixada do menu.',
      );
    },
  };
}

/** Quanto a gravação espera depois da última mudança, como as preferências. */
export const ESPERA_DA_GRAVACAO = 400;

/** A chave de cada gravação: a última mudança de cada visão vale. */
const chaveDaGravacao = (gravacao: GravacaoDaTabela) =>
  gravacao.tipo === 'visao' ? gravacao.id : gravacao.visao;

export interface GuardaDaTabela {
  /** Guarda a mudança 400 ms depois da última da mesma visão. */
  guardar: (gravacao: GravacaoDaTabela) => Promise<void>;
  /** Grava na hora o que espera, e acaba quando nenhuma gravação está a caminho. */
  descarregar: () => Promise<void>;
}

/**
 * Guarda a tabela como a conta a deixou (change visoes-da-conta, design, decisão 3): 400 ms depois
 * da última mudança, só a última de cada visão, e, na saída da página, na hora, com o keepalive,
 * para a última mudança não se perder ao fechar a aba. A lista das visões guardada é atualizada com
 * a resposta, sem esperar o evento. Antes de publicar as mudanças, a tela descarrega o que espera.
 */
export function useGuardarTabela(tabela: IdDaTabelaComVisoes): GuardaDaTabela {
  const api = useApi();
  const consultas = useQueryClient();
  const esperando = useRef(
    new Map<
      string,
      { gravacao: GravacaoDaTabela; temporizador: ReturnType<typeof setTimeout>; feito: () => void }
    >(),
  );
  const aCaminho = useRef(new Set<Promise<void>>());

  const enviar = useCallback(
    async (gravacao: GravacaoDaTabela, keepalive: boolean) => {
      const opcoes = { keepalive };
      const pedido =
        gravacao.tipo === 'mudancas'
          ? api.PUT('/visoes/mudancas', {
              body: { tabela, visao: gravacao.visao, definicao: { ...gravacao.definicao } },
              ...opcoes,
            })
          : gravacao.tipo === 'visao'
            ? api.PATCH('/visoes/{id}', {
                params: { path: { id: gravacao.id } },
                body: { definicao: { ...gravacao.definicao } },
                ...opcoes,
              })
            : api.DELETE('/visoes/mudancas', {
                params: { query: { tabela, visao: gravacao.visao } },
                ...opcoes,
              });
      // Sem a rede, o pedido falha como a recusa do servidor.
      const resposta = await pedido.catch(() => undefined);
      if (!resposta || resposta.error) {
        avisar({ situacao: 'critico', titulo: 'Não foi possível guardar a tabela.' });
        void consultas.invalidateQueries({ queryKey: chaveDasVisoes(tabela) });
        return;
      }
      consultas.setQueryData<ListaDasVisoes>(chaveDasVisoes(tabela), (lista) => {
        if (!lista) return lista;
        if (gravacao.tipo === 'visao') {
          return {
            ...lista,
            visoes: lista.visoes.map((visao) =>
              visao.id === gravacao.id ? { ...visao, definicao: gravacao.definicao } : visao,
            ),
          };
        }
        const outras = (lista.mudancas ?? []).filter(
          (mudancas) => mudancas.visao !== gravacao.visao,
        );
        return gravacao.tipo === 'restaurar'
          ? { ...lista, mudancas: outras }
          : {
              ...lista,
              mudancas: [
                ...outras,
                {
                  visao: gravacao.visao,
                  definicao: gravacao.definicao,
                  atualizadaEm: new Date().toISOString(),
                },
              ],
            };
      });
    },
    [api, consultas, tabela],
  );

  /** O pedido, lembrado enquanto está a caminho; ele nunca falha, a recusa vira aviso. */
  const despachar = useCallback(
    (gravacao: GravacaoDaTabela, keepalive: boolean) => {
      const pedido = enviar(gravacao, keepalive);
      aCaminho.current.add(pedido);
      void pedido.finally(() => aCaminho.current.delete(pedido));
      return pedido;
    },
    [enviar],
  );

  /** Manda na hora o que espera. */
  const esvaziar = useCallback(
    (keepalive: boolean) => {
      for (const [chave, { gravacao, temporizador, feito }] of esperando.current) {
        clearTimeout(temporizador);
        esperando.current.delete(chave);
        void despachar(gravacao, keepalive).finally(feito);
      }
    },
    [despachar],
  );

  // Na saída da página, o que espera vai na hora.
  useEffect(() => {
    const naSaida = () => esvaziar(true);
    window.addEventListener('pagehide', naSaida);
    return () => {
      window.removeEventListener('pagehide', naSaida);
      naSaida();
    };
  }, [esvaziar]);

  const guardar = useCallback(
    (gravacao: GravacaoDaTabela) =>
      new Promise<void>((resolver) => {
        const chave = chaveDaGravacao(gravacao);
        const anterior = esperando.current.get(chave);
        if (anterior) {
          clearTimeout(anterior.temporizador);
          anterior.feito();
        }
        const temporizador = setTimeout(() => {
          esperando.current.delete(chave);
          void despachar(gravacao, false).finally(resolver);
        }, ESPERA_DA_GRAVACAO);
        esperando.current.set(chave, { gravacao, temporizador, feito: resolver });
      }),
    [despachar],
  );
  const descarregar = useCallback(async () => {
    esvaziar(false);
    await Promise.all([...aCaminho.current]);
  }, [esvaziar]);
  return useMemo(() => ({ guardar, descarregar }), [guardar, descarregar]);
}

/** As mudanças da conta guardadas no servidor, pela visão, com a de fábrica como `fabrica`. */
export function mudancasDaConta(
  lista: ListaDasVisoes | undefined,
): ReadonlyMap<string, DefinicaoDaVisao> | undefined {
  if (!lista) return undefined;
  // O servidor anterior às mudanças da conta não as manda.
  return new Map((lista.mudancas ?? []).map((mudancas) => [mudancas.visao, mudancas.definicao]));
}
