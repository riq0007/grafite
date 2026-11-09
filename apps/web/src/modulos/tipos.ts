// Contrato do módulo (design, decisão 2): cada módulo vive em `modulos/<id>/`, com as suas rotas e
// uma entrada no registro. Os destinos dos menus são endereços das rotas do próprio módulo, então
// um menu que aponta para uma rota inexistente não compila.
import type { Permissao, PreferenciasDaInterface, TipoDeEvento } from '@grafite/domain';
import type { OcorrenciaAberta } from '@grafite/ui';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { AnyRoute } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ClienteDaApi } from '../api/cliente.ts';
import type { ContextoDaAcao, IdDoGrupoLocal } from '../busca/tipos.ts';
import type { PropsDoCadastroNaAba } from '../casca/abasDoApp.tsx';
import type { CanalDeEventos, EventoRecebido } from '../eventos/canal.ts';

/** Endereços de uma subárvore de rotas: o da raiz dela e os de todas as rotas abaixo. */
export type EnderecosDe<TRota> = TRota extends {
  types: { fullPath: infer TEndereco extends string; children: infer TFilhas };
}
  ?
      | TEndereco
      | (unknown extends TFilhas
          ? never
          : TFilhas extends ReadonlyArray<infer TFilha>
            ? EnderecosDe<TFilha>
            : EnderecosDe<TFilhas[keyof TFilhas]>)
  : never;

/**
 * O que exige permissões aparece só para a conta que tem ao menos uma delas, em qualquer escopo
 * (spec estrutura-da-casca). Sem a lista, aparece para todos.
 */
export interface ExigePermissoes {
  permissoes?: readonly Permissao[];
}

/** Item de um menu do módulo: leva a um endereço do próprio módulo ou abre um submenu. */
export type ItemDoMenuDoModulo<TEndereco extends string> = ExigePermissoes &
  (
    | { rotulo: string; destino: TEndereco; separadoAntes?: boolean; icone?: LucideIcon }
    | { rotulo: string; filhos: readonly ItemDoMenuDoModulo<TEndereco>[]; separadoAntes?: boolean }
  );

/**
 * O destino de um item com a busca do endereço, como `/ativos?visao=<id>`: o caminho continua
 * conferido contra as rotas do módulo.
 */
export type DestinoComBusca<TEndereco extends string> = TEndereco | `${TEndereco}?${string}`;

/** Uma consulta de que o menu dinâmico precisa, como a das visões de uma tabela. */
export interface ConsultaDoMenu<TDado = unknown> {
  queryKey: QueryKey;
  queryFn: () => Promise<TDado>;
}

/** O que o módulo recebe para montar o menu com os dados. */
export interface ContextoDoMenuDinamico<TEndereco extends string> {
  /** O menu fixo do módulo, já só com o que a conta pode usar. */
  menu: readonly ItemDoMenuDoModulo<TEndereco>[];
  /** O dado de uma das consultas do menu: nenhum enquanto ela carrega ou se ela falhou. */
  ler: <TDado>(consulta: ConsultaDoMenu<TDado>) => TDado | undefined;
  /** O cliente da sessão, para montar as consultas que `ler` lê. */
  api: ClienteDaApi;
  /** As preferências resolvidas, como as visões fixadas. */
  preferencias: PreferenciasDaInterface;
}

/**
 * Os itens do menu que vêm dos dados, além dos fixos (change visoes-no-dock, design, decisão 2),
 * como as visões fixadas e os tipos de ativo. A casca carrega as consultas pelo TanStack Query, só
 * para a conta que tem a permissão e com o módulo ligado, e o menu do dock se refaz a cada vez que
 * os dados ou as preferências mudam; os eventos do módulo relêem as consultas. O item dos dados que
 * exige uma permissão que a conta não tem some, como os fixos.
 */
export interface MenuDinamicoDoModulo<TEndereco extends string> extends ExigePermissoes {
  consultas: (api: ClienteDaApi) => readonly ConsultaDoMenu[];
  /** O menu do módulo, com os itens fixos e os dos dados, na ordem que o módulo quer. */
  montar: (
    contexto: ContextoDoMenuDinamico<TEndereco>,
  ) => readonly ItemDoMenuDoModulo<DestinoComBusca<TEndereco>>[];
}

/** Menu que o módulo põe na barra superior, como Visualizar. */
export interface MenuDaBarraDoModulo<TEndereco extends string> {
  rotulo: string;
  itens: readonly ItemDoMenuDoModulo<TEndereco>[];
}

/**
 * Entrada de busca declarada pelo módulo: leva a um endereço do próprio módulo, com o foco
 * opcional num elemento marcado com `data-foco`, ou executa uma ação. O id só precisa ser único
 * dentro do módulo.
 */
export type EntradaDeBuscaDoModulo<TEndereco extends string> = ExigePermissoes & {
  id: string;
  rotulo: string;
  grupo: IdDoGrupoLocal;
  /** Onde fica, em texto secundário, como "Ajustes › Dock". */
  caminho?: string;
  palavrasChave?: readonly string[];
  icone?: LucideIcon;
} & (
    | { destino: TEndereco; foco?: string; executar?: never }
    | { executar: (contexto: ContextoDaAcao) => void; destino?: never; foco?: never }
  );

/** Resultado de um provedor: um registro do módulo, com o endereço dele. */
export interface ResultadoDoProvedor {
  id: string;
  rotulo: string;
  caminho?: string;
  destino: string;
}

/** Os resultados de um provedor que sabe quantos o servidor acha ao todo. */
export interface PaginaDoProvedor {
  itens: ResultadoDoProvedor[];
  total: number;
}

/**
 * Provedor de busca de um módulo, como a busca de ativos no servidor. É chamado só depois de uma
 * pausa na digitação, e o `sinal` aborta a chamada quando o texto muda ou a busca fecha. A `api` é
 * o cliente da sessão, o mesmo do `useApi()`. Com o total e a lista do módulo com a busca, o grupo
 * termina com "Ver todos os N" quando há mais que os mostrados (change relacoes-vivas, decisão 5).
 */
export interface ProvedorDeBusca extends ExigePermissoes {
  /** Nome do grupo dos resultados, como "Ativos". */
  grupo: string;
  buscar: (
    termo: string,
    sinal: AbortSignal,
    api: ClienteDaApi,
  ) => Promise<ResultadoDoProvedor[] | PaginaDoProvedor>;
  /** A lista do módulo com a busca preenchida, como `/ativos?busca=laserjet`. */
  verTodos?: (termo: string) => string;
}

/** O que a tela inicial dá às fontes: o cliente da sessão e o canal dos eventos dela. */
export interface ContextoDaFonte {
  api: ClienteDaApi;
  canal: CanalDeEventos;
}

/**
 * A fonte das ocorrências abertas de um módulo, que a tela inicial reúne (design do F1c, decisão
 * 5). `buscar` traz as abertas agora, e o `sinal` aborta a busca quando a tela fecha ou busca de
 * novo. Com `assinar`, a fonte avisa quando as ocorrências mudam, como pelos eventos do módulo
 * no canal, e a tela busca de novo, sem recarregar a página; devolve a função que para os avisos.
 */
export interface FonteDeOcorrencias extends ExigePermissoes {
  buscar: (sinal: AbortSignal, contexto: ContextoDaFonte) => Promise<OcorrenciaAberta[]>;
  assinar?: (aoMudar: () => void, contexto: ContextoDaFonte) => () => void;
}

/**
 * Um bloco que o módulo põe no Início (change inicio-ajustavel, design, decisão 1), como os
 * suprimentos que acabam primeiro: a conta o sobe, desce e oculta, e a escolha fica nas preferências.
 */
export interface BlocoDoInicio extends ExigePermissoes {
  /** Único entre os módulos e gravado nas preferências, como "ativos.suprimentos". */
  id: string;
  /** O título, no carimbo do bloco. */
  titulo: string;
  componente: ComponentType;
}

/** O registro de outro módulo em cuja ficha uma relação aparece. */
export type AlvoDaRelacao = 'pessoa' | 'local' | 'modelo' | 'tipo' | 'ativo' | 'fornecedor';

/**
 * O que um módulo mostra na ficha de um registro de outro (change relacoes-vivas, design, decisão
 * 4), como os ativos sob responsabilidade de uma pessoa: o componente recebe o id do registro e
 * desenha uma linha da ficha, ou nada. Some com o módulo desligado, como o dock e a busca.
 */
export interface RelacaoDoModulo extends ExigePermissoes {
  alvo: AlvoDaRelacao;
  /** Recebe o id do registro e, quando a ficha o dá, o nome dele, como o rótulo do ativo. */
  componente: ComponentType<{ id: string; nome?: string }>;
  /**
   * A linha que a relação dá ao cartão da Visão geral da ficha do ativo, como "1 alerta aberto"
   * (change ficha-em-cartoes, design, decisão 3). Feito pelo `resumoDaRelacao`.
   */
  resumo?: ResumoDaRelacao;
}

/** O que a consulta do resumo de uma relação recebe da ficha. */
export interface ContextoDoResumo {
  api: ClienteDaApi;
  consultas: QueryClient;
}

/**
 * O resumo de uma relação: a consulta que traz o que ele precisa, de preferência pelas mesmas
 * consultas do componente, para não pedir de novo, e o texto de uma linha, ou nada.
 */
export interface ResumoDaRelacao<TDados = unknown> {
  consulta: (
    id: string,
    contexto: ContextoDoResumo,
  ) => { queryKey: QueryKey; queryFn: () => Promise<TDados> };
  texto: (dados: TDados) => string | null;
}

/** O que um cadastro cria, e que o campo de outro módulo pode pedir numa aba da janela. */
export type AlvoDoCadastro = 'local' | 'pessoa' | 'tipo' | 'modelo' | 'fornecedor' | 'consumivel';

/**
 * Um cadastro do módulo que abre numa aba da janela, pedido pelo campo de outro módulo (change
 * cadastro-em-abas, design, decisão 4), como o Novo local da Administração no campo Local do
 * ativo. O corpo é o mesmo da tela do módulo. Some sem a permissão e com o módulo desligado.
 */
export interface CadastroDoModulo extends ExigePermissoes {
  alvo: AlvoDoCadastro;
  /** O título da aba, como "Novo local". */
  titulo: string;
  /** O texto do link embaixo do campo, como "Cadastrar novo local". */
  link: string;
  componente: ComponentType<PropsDoCadastroNaAba>;
}

/**
 * Para cada tipo de evento, as consultas do módulo que ele atualiza (design do F2c, decisão 12),
 * pelo começo da chave, como `['pessoas']`, ou com o alvo do evento, como `['pessoa', alvo.id]`.
 */
export type EventosDoModulo = {
  [T in TipoDeEvento]?: (evento: EventoRecebido) => readonly QueryKey[];
};

export interface ModuloRegistrado<TRota extends AnyRoute = AnyRoute> extends ExigePermissoes {
  /** Identificador estável, em minúsculas, como "ativos" ou "ajustes". */
  id: string;
  nome: string;
  icone: LucideIcon;
  /** Aonde levam o item do dock e a aba do celular. */
  endereco: EnderecosDe<TRota>;
  /** Ordem na barra de abas do celular: número menor vem antes; `'mais'` fica sempre em "Mais". */
  prioridadeNoCelular: number | 'mais';
  /**
   * O módulo opcional de que este faz parte, como a Gestão de ativos do Ativos: o interruptor da
   * organização vale para os dois, e a tela do módulo desligado mostra o nome do dono.
   */
  parteDe?: string;
  /** A subárvore de rotas do módulo, presa à raiz. */
  rotas: TRota;
  /** Menu em árvore do item do dock. */
  menu?: readonly ItemDoMenuDoModulo<EnderecosDe<TRota>>[];
  /** O menu do dock com os itens que vêm dos dados, como as visões fixadas. */
  menuDinamico?: MenuDinamicoDoModulo<EnderecosDe<TRota>>;
  /** Menus do módulo na barra superior. */
  menusDaBarra?: readonly MenuDaBarraDoModulo<EnderecosDe<TRota>>[];
  /**
   * O que o módulo põe na busca, além dele e dos itens dos menus, que entram sozinhos: entradas
   * fixas (ações e atalhos para as telas) e os provedores assíncronos, cada um com o grupo dele.
   */
  busca?: {
    entradas?: readonly EntradaDeBuscaDoModulo<EnderecosDe<TRota>>[];
    provedores?: readonly ProvedorDeBusca[];
  };
  /** As ocorrências abertas do módulo, que entram em "O que resolver agora". */
  ocorrencias?: FonteDeOcorrencias;
  /** O que o módulo mostra nas fichas dos registros de outros módulos. */
  relacoes?: readonly RelacaoDoModulo[];
  /** Os blocos do módulo no Início, depois de "O que resolver agora". */
  blocosDoInicio?: readonly BlocoDoInicio[];
  /** Os cadastros do módulo que os campos dos outros módulos abrem numa aba da janela. */
  cadastros?: readonly CadastroDoModulo[];
  /**
   * As consultas que cada tipo de evento atualiza: quando o evento chega, a casca as invalida, e as
   * telas abertas se atualizam sozinhas.
   */
  eventos?: EventosDoModulo;
}

/** Declara um módulo, conferindo os endereços dos menus contra as rotas dele. */
export function definirModulo<TRota extends AnyRoute>(
  modulo: ModuloRegistrado<TRota>,
): ModuloRegistrado<TRota> {
  return modulo;
}
