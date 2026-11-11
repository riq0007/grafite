// As preferências de interface (F2c, design, decisão 1): o modelo, os padrões de fábrica e a regra
// das camadas, iguais na API, que valida o que grava, e na web, que lê e resolve. Cada camada (a da
// organização e a da conta) guarda só os campos mudados, e a que vale é resolvida campo a campo.
// As listas de opções repetem as chaves dos tokens do @grafite/ui, e um teste da web confere que
// continuam iguais: o domínio não depende do pacote visual.
import { MODULO_DOS_AJUSTES } from '../modulos/modulos.ts';
import {
  type IdDaTabelaComVisoes,
  TABELAS_COM_VISOES,
  VISAO_DE_FABRICA,
} from '../visoes/visoes.ts';

export const TEMAS = ['grafite', 'meia-noite', 'oled', 'nevoa', 'papel', 'alto-contraste'] as const;
export const DESTAQUES = ['grafite', 'azul', 'verde', 'laranja'] as const;
/**
 * As escolhas da tela: os temas e os destaques de fábrica e, no fim, o personalizado, montado pela
 * conta (change tema-personalizado, design, decisão 1).
 */
export const TEMAS_DA_ESCOLHA = [...TEMAS, 'personalizado'] as const;
export const DESTAQUES_DA_ESCOLHA = [...DESTAQUES, 'personalizado'] as const;
/** O tom do tema personalizado. */
export const TONS = ['escuro', 'claro'] as const;
export const DENSIDADES = ['compacta', 'normal', 'confortavel'] as const;
/**
 * Quando o polegar da barra de rolagem aparece: com o ponteiro sobre a área, ao rolar e com o foco
 * nela, ou sempre (change barra-de-rolagem-propria).
 */
export const BARRAS_DE_ROLAGEM = ['ao-rolar', 'sempre'] as const;
export const POSICOES_DO_DOCK = ['embaixo', 'esquerda', 'direita'] as const;
/** Tempo, em segundos, que um aviso de Atenção ou de Informação fica na tela. */
export const TEMPOS_DO_AVISO = [6, 10, 20] as const;
/** O resumo por e-mail das notificações que não foram na hora (change p3c-email-e-push). */
export const RESUMOS_POR_EMAIL = ['desligado', 'diario'] as const;
/** A largura de um bloco do Início: a inteira, de fábrica, ou a metade (change opcoes-dos-blocos-do-inicio). */
export const LARGURAS_DO_BLOCO = ['inteira', 'metade'] as const;
/** Colunas pelas quais a tela inicial ordena as ocorrências. */
export const COLUNAS_DA_TELA_INICIAL = ['severidade', 'ha', 'ativo', 'ocorrencia'] as const;

export const LIMITES_DAS_PREFERENCIAS = {
  raio: { minimo: 0, maximo: 24 },
  tamanhoDoDock: { minimo: 28, maximo: 64 },
  suavizacao: { minimo: 0, maximo: 100 },
  /** A matiz da base e a do destaque personalizados, em graus. */
  matiz: { minimo: 0, maximo: 359 },
  /** O tingimento, a intensidade e o contraste dos personalizados. */
  percentual: { minimo: 0, maximo: 100 },
  /** Quantas visões cada camada fixa no menu de cada tabela (change visoes-no-dock). */
  fixadas: 20,
  /** Quantos blocos do Início a lista guarda (change inicio-ajustavel). */
  blocosDoInicio: 20,
  /** Quantos módulos a lista do dock guarda (change dock-personalizavel). */
  modulosDoDock: 40,
  /** As opções de um bloco do Início: quantas, e o tamanho da chave, do texto e da lista. */
  opcoesDoBloco: 12,
  chaveDaOpcaoDoBloco: 30,
  textoDaOpcaoDoBloco: 80,
  listaDaOpcaoDoBloco: 50,
} as const;

export type TempoDoAviso = (typeof TEMPOS_DO_AVISO)[number];
export type ResumoPorEmail = (typeof RESUMOS_POR_EMAIL)[number];

export type LarguraDoBloco = (typeof LARGURAS_DO_BLOCO)[number];

/**
 * O valor de uma opção de um bloco do Início: verdadeiro ou falso, um número, um texto ou uma
 * lista de textos. O significado é do bloco: o domínio só confere a forma.
 */
export type ValorDaOpcaoDoBloco = boolean | number | string | string[];

/**
 * Um bloco do Início na ordem da conta: o id, como "ativos.suprimentos", e se está à vista. Pode
 * trazer a largura, que sem ela é a inteira, e as opções do bloco, pela chave (change
 * opcoes-dos-blocos-do-inicio, design, decisão 2).
 */
export interface BlocoDoInicioSalvo {
  id: string;
  visivel: boolean;
  largura?: LarguraDoBloco;
  opcoes?: Record<string, ValorDaOpcaoDoBloco>;
}

/**
 * Um módulo na ordem do dock: o id, como "operacao", e se está no dock. O que não está fica no
 * menu Mais. A forma é a dos blocos do Início (change dock-personalizavel, design, decisão 1).
 */
export interface ModuloDoDockSalvo {
  id: string;
  visivel: boolean;
}

export interface OrdenacaoDaTelaInicial {
  coluna: (typeof COLUNAS_DA_TELA_INICIAL)[number];
  direcao: 'crescente' | 'decrescente';
}

/**
 * As entradas do tema Personalizado, em escalas de gente: a matiz da base em graus, o tingimento dos
 * cinzas em porcentagem e o contraste de 0 a 100. O @grafite/ui as converte para o gerador.
 */
export interface TemaPersonalizado {
  tom: (typeof TONS)[number];
  matiz: number;
  tingimento: number;
  contraste: number;
}

/** As entradas do destaque Personalizado: a matiz em graus e a intensidade, em que 0 é o monocromático. */
export interface DestaquePersonalizado {
  matiz: number;
  intensidade: number;
}

export interface PreferenciasDaInterface {
  aparencia: {
    tema: (typeof TEMAS_DA_ESCOLHA)[number];
    destaque: (typeof DESTAQUES_DA_ESCOLHA)[number];
    densidade: (typeof DENSIDADES)[number];
    barraDeRolagem: (typeof BARRAS_DE_ROLAGEM)[number];
    raio: number;
    /** As entradas do tema Personalizado, trocadas inteiras, como a ordem da tela inicial. */
    personalizado: TemaPersonalizado;
    /** As do destaque Personalizado, trocadas inteiras. */
    destaquePersonalizado: DestaquePersonalizado;
  };
  dock: {
    posicao: (typeof POSICOES_DO_DOCK)[number];
    tamanho: number;
    ampliar: boolean;
    ocultar: boolean;
    /**
     * Os módulos na ordem escolhida, com os tirados do dock, trocados inteiros. A lista vazia é a
     * ordem de fábrica, a do registro, com todos no dock. Ajustes fica fora dela, sempre no fim.
     */
    modulos: ModuloDoDockSalvo[];
  };
  /** Suavização em %, de 0 a 100; "abracar" é o abraço dos elementos interativos. */
  cursor: { tipo: 'suavizado' | 'sistema'; suavizacao: number; abracar: boolean };
  /**
   * Se Atenção e Informação viram aviso na tela; o Crítico sempre vira. Com o Foco, só o Crítico
   * vira aviso, sem mudar as outras escolhas. Fora da aplicação (change p3c-email-e-push): o
   * e-mail do crítico na hora, o resumo diário do resto e as severidades que vão para o push, onde
   * o Foco também deixa só o Crítico.
   */
  notificacoes: {
    atencao: boolean;
    informacao: boolean;
    tempo: TempoDoAviso;
    foco: boolean;
    emailCritico: boolean;
    resumo: ResumoPorEmail;
    pushCritico: boolean;
    pushAtencao: boolean;
    pushInformacao: boolean;
  };
  /**
   * O resumo da linha ao parar o mouse, e a visão escolhida de cada tabela com visões: a de fábrica
   * ou o id de uma visão. Sem a escolha, a tabela abre na de fábrica.
   */
  tabelas: {
    linhasAlternadas: boolean;
    miniaturas: boolean;
    resumoDaLinha: boolean;
    visoes: Partial<Record<IdDaTabelaComVisoes, string>>;
    /**
     * As visões que a conta fixou no menu do módulo de cada tabela, na ordem da fixação. Só a camada
     * da conta grava (change visoes-no-dock, design, decisão 1).
     */
    fixadas: Partial<Record<IdDaTabelaComVisoes, string[]>>;
    /** As que a organização fixou no menu de todos, só nos padrões dela. */
    fixadasPelaOrganizacao: Partial<Record<IdDaTabelaComVisoes, string[]>>;
  };
  /** "sistema" segue o fuso do sistema operacional; os demais são identificadores IANA. */
  regiao: { fuso: string };
  /**
   * A ordem de "O que resolver agora" e a dos blocos do Início, com os ocultos (change
   * inicio-ajustavel). A lista vazia é a ordem do registro, com todos à vista.
   */
  inicio: { ordenacao: OrdenacaoDaTelaInicial; blocos: BlocoDoInicioSalvo[] };
  /** "sistema" segue o sistema operacional; nunca há opção de forçar animação. */
  acessibilidade: { movimento: 'sistema' | 'reduzido'; transparencia: 'sistema' | 'reduzida' };
}

export type SecaoDePreferencias = keyof PreferenciasDaInterface;

/** Uma camada: em cada seção, só os campos que ela muda. */
export type AjustesDasPreferencias = {
  [S in SecaoDePreferencias]?: Partial<PreferenciasDaInterface[S]>;
};

/**
 * Uma mudança numa camada, como merge patch (RFC 7396): o valor grava o campo, e `null` tira o
 * campo ou a seção inteira. A ordem da tela inicial é um campo só, trocado ou tirado inteiro.
 */
export type MudancaDasPreferencias = {
  [S in SecaoDePreferencias]?:
    | {
        [C in keyof PreferenciasDaInterface[S]]?: PreferenciasDaInterface[S][C] | null;
      }
    | null;
};

/**
 * Padrões de fábrica da spec mestre: os da seção 7.2 e, nas preferências que o protótipo não
 * tinha, o comportamento das seções 7.4 (avisos e tabelas) e 7.6 (a ordem da tela inicial).
 */
export const PADRAO_DE_FABRICA: PreferenciasDaInterface = {
  aparencia: {
    tema: 'grafite',
    destaque: 'grafite',
    densidade: 'normal',
    barraDeRolagem: 'ao-rolar',
    raio: 10,
    // O personalizado começa como o Grafite, e o destaque personalizado, como o azul.
    personalizado: { tom: 'escuro', matiz: 265, tingimento: 10, contraste: 45 },
    destaquePersonalizado: { matiz: 258, intensidade: 85 },
  },
  dock: { posicao: 'embaixo', tamanho: 48, ampliar: true, ocultar: false, modulos: [] },
  cursor: { tipo: 'suavizado', suavizacao: 95, abracar: true },
  notificacoes: {
    atencao: true,
    informacao: true,
    tempo: 6,
    foco: false,
    emailCritico: true,
    resumo: 'diario',
    pushCritico: true,
    pushAtencao: false,
    pushInformacao: false,
  },
  tabelas: {
    linhasAlternadas: true,
    miniaturas: true,
    resumoDaLinha: true,
    visoes: {},
    fixadas: {},
    fixadasPelaOrganizacao: {},
  },
  regiao: { fuso: 'sistema' },
  inicio: { ordenacao: { coluna: 'severidade', direcao: 'decrescente' }, blocos: [] },
  acessibilidade: { movimento: 'sistema', transparencia: 'sistema' },
};

/** Se o identificador de fuso é reconhecido, como "America/Manaus", no Node e no navegador. */
export function fusoReconhecido(fuso: string): boolean {
  if (fuso === '') return false;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

type Bruto = Record<string, unknown>;

const objeto = (valor: unknown): Bruto | null =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Bruto) : null;

/** Lê um campo: devolve o valor válido, ou `undefined` para o campo ficar de fora da camada. */
type Leitor = (valor: unknown) => unknown;

const umDe =
  (opcoes: readonly unknown[]): Leitor =>
  (valor) =>
    opcoes.includes(valor) ? valor : undefined;

const inteiroEntre =
  ({ minimo, maximo }: { minimo: number; maximo: number }): Leitor =>
  (valor) =>
    typeof valor === 'number' && Number.isFinite(valor)
      ? Math.min(maximo, Math.max(minimo, Math.round(valor)))
      : undefined;

const booleano: Leitor = (valor) => (typeof valor === 'boolean' ? valor : undefined);

const fuso: Leitor = (valor) =>
  typeof valor === 'string' && (valor === 'sistema' || fusoReconhecido(valor)) ? valor : undefined;

/** Coluna e direção valem juntas: se uma é desconhecida, a ordem inteira fica de fora. */
const ordenacao: Leitor = (valor) => {
  const bruto = objeto(valor);
  const coluna = umDe(COLUNAS_DA_TELA_INICIAL)(bruto?.coluna);
  const direcao = umDe(['crescente', 'decrescente'])(bruto?.direcao);
  return coluna !== undefined && direcao !== undefined ? { coluna, direcao } : undefined;
};

/**
 * Campos que valem juntos, como as entradas do tema personalizado: cada um é lido pelo leitor dele,
 * e, se algum falta ou é inválido, o objeto inteiro fica de fora.
 */
const juntos =
  (leitores: Record<string, Leitor>): Leitor =>
  (valor) => {
    const bruto = objeto(valor);
    if (!bruto) return undefined;
    const lido: Bruto = {};
    for (const [campo, ler] of Object.entries(leitores)) {
      const valorDoCampo = ler(bruto[campo]);
      if (valorDoCampo === undefined) return undefined;
      lido[campo] = valorDoCampo;
    }
    return lido;
  };

/**
 * O id de um item de lista ordenada, como um bloco do Início ou um módulo do dock: letras
 * minúsculas, números, ponto e hífen, até 40.
 */
const ID_DO_ITEM = /^[a-z0-9.-]{1,40}$/;

/**
 * Uma lista ordenada de itens `{ id, visivel }`, como os blocos do Início e os módulos do dock: o
 * item inválido, o repetido e o de id recusado saem, um a um, e a lista é cortada no limite. A
 * lista vazia vale; o que não é lista fica de fora.
 */
const listaOrdenada =
  (
    limite: number,
    {
      recusados = [],
      extras,
    }: {
      recusados?: readonly string[];
      /** O que o item traz além do id e da visibilidade, já lido: só os campos válidos. */
      extras?: (bruto: Bruto) => Bruto;
    } = {},
  ): Leitor =>
  (valor) => {
    if (!Array.isArray(valor)) return undefined;
    const lidos: Array<{ id: string; visivel: boolean }> = [];
    for (const item of valor) {
      if (lidos.length === limite) break;
      const bruto = objeto(item);
      const id = bruto?.id;
      const visivel = bruto?.visivel;
      if (!bruto || typeof id !== 'string' || !ID_DO_ITEM.test(id)) continue;
      if (typeof visivel !== 'boolean') continue;
      if (recusados.includes(id) || lidos.some((lido) => lido.id === id)) continue;
      lidos.push({ id, visivel, ...extras?.(bruto) });
    }
    return lidos;
  };

/** A chave de uma opção de bloco: letras minúsculas, números e hífen, até 30. */
const CHAVE_DA_OPCAO = /^[a-z0-9-]{1,30}$/;

const textoDaOpcao = (valor: unknown): valor is string =>
  typeof valor === 'string' && valor.length <= LIMITES_DAS_PREFERENCIAS.textoDaOpcaoDoBloco;

/** O valor de uma opção de bloco, se a forma dele confere: o que não confere fica de fora. */
function valorDaOpcao(valor: unknown): ValorDaOpcaoDoBloco | undefined {
  if (typeof valor === 'boolean' || textoDaOpcao(valor)) return valor;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;
  const lista =
    Array.isArray(valor) && valor.length <= LIMITES_DAS_PREFERENCIAS.listaDaOpcaoDoBloco;
  return lista && valor.every(textoDaOpcao) ? [...valor] : undefined;
}

/**
 * A largura e as opções de um bloco do Início (change opcoes-dos-blocos-do-inicio, design, decisão
 * 2): a largura desconhecida e a opção fora da forma saem, uma a uma, e o bloco continua. As
 * opções são cortadas no limite, e o bloco sem nenhuma válida fica sem o campo.
 */
function extrasDoBloco(bruto: Bruto): Bruto {
  const extras: Bruto = {};
  const largura = umDe(LARGURAS_DO_BLOCO)(bruto.largura);
  if (largura !== undefined) extras.largura = largura;
  const opcoes: Bruto = {};
  for (const [chave, valor] of Object.entries(objeto(bruto.opcoes) ?? {})) {
    if (Object.keys(opcoes).length === LIMITES_DAS_PREFERENCIAS.opcoesDoBloco) break;
    const lido = CHAVE_DA_OPCAO.test(chave) ? valorDaOpcao(valor) : undefined;
    if (lido !== undefined) opcoes[chave] = lido;
  }
  if (Object.keys(opcoes).length > 0) extras.opcoes = opcoes;
  return extras;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A visão de cada tabela conhecida: a de fábrica ou o id de uma visão. A tabela desconhecida e o
 * valor que não é uma visão ficam de fora; se nenhuma fica, o campo inteiro sai.
 */
const visoesDasTabelas: Leitor = (valor) => {
  const bruto = objeto(valor);
  if (!bruto) return undefined;
  const lidas: Bruto = {};
  for (const { id } of TABELAS_COM_VISOES) {
    const visao = bruto[id];
    if (visao === VISAO_DE_FABRICA) lidas[id] = visao;
    else if (typeof visao === 'string' && UUID.test(visao)) lidas[id] = visao.toLowerCase();
  }
  return Object.keys(lidas).length > 0 ? lidas : undefined;
};

/**
 * As visões fixadas de cada tabela com visões: os ids de visão, sem repetir, até o limite. A tabela
 * sem nenhuma fica de fora; se nenhuma fica, o campo inteiro sai.
 */
const fixadasDasTabelas: Leitor = (valor) => {
  const bruto = objeto(valor);
  if (!bruto) return undefined;
  const lidas: Bruto = {};
  for (const { id } of TABELAS_COM_VISOES) {
    const lista = bruto[id];
    if (!Array.isArray(lista)) continue;
    const ids = [
      ...new Set(
        lista
          .filter((item): item is string => typeof item === 'string' && UUID.test(item))
          .map((item) => item.toLowerCase()),
      ),
    ].slice(0, LIMITES_DAS_PREFERENCIAS.fixadas);
    if (ids.length > 0) lidas[id] = ids;
  }
  return Object.keys(lidas).length > 0 ? lidas : undefined;
};

/** O leitor de cada campo de cada seção: o que não está aqui é desconhecido. */
const LEITORES: { [S in SecaoDePreferencias]: Record<keyof PreferenciasDaInterface[S], Leitor> } = {
  aparencia: {
    tema: umDe(TEMAS_DA_ESCOLHA),
    destaque: umDe(DESTAQUES_DA_ESCOLHA),
    densidade: umDe(DENSIDADES),
    barraDeRolagem: umDe(BARRAS_DE_ROLAGEM),
    raio: inteiroEntre(LIMITES_DAS_PREFERENCIAS.raio),
    personalizado: juntos({
      tom: umDe(TONS),
      matiz: inteiroEntre(LIMITES_DAS_PREFERENCIAS.matiz),
      tingimento: inteiroEntre(LIMITES_DAS_PREFERENCIAS.percentual),
      contraste: inteiroEntre(LIMITES_DAS_PREFERENCIAS.percentual),
    }),
    destaquePersonalizado: juntos({
      matiz: inteiroEntre(LIMITES_DAS_PREFERENCIAS.matiz),
      intensidade: inteiroEntre(LIMITES_DAS_PREFERENCIAS.percentual),
    }),
  },
  dock: {
    posicao: umDe(POSICOES_DO_DOCK),
    tamanho: inteiroEntre(LIMITES_DAS_PREFERENCIAS.tamanhoDoDock),
    ampliar: booleano,
    ocultar: booleano,
    modulos: listaOrdenada(LIMITES_DAS_PREFERENCIAS.modulosDoDock, {
      recusados: [MODULO_DOS_AJUSTES],
    }),
  },
  cursor: {
    tipo: umDe(['suavizado', 'sistema']),
    suavizacao: inteiroEntre(LIMITES_DAS_PREFERENCIAS.suavizacao),
    abracar: booleano,
  },
  notificacoes: {
    atencao: booleano,
    informacao: booleano,
    tempo: umDe(TEMPOS_DO_AVISO),
    foco: booleano,
    emailCritico: booleano,
    resumo: umDe(RESUMOS_POR_EMAIL),
    pushCritico: booleano,
    pushAtencao: booleano,
    pushInformacao: booleano,
  },
  tabelas: {
    linhasAlternadas: booleano,
    miniaturas: booleano,
    resumoDaLinha: booleano,
    visoes: visoesDasTabelas,
    fixadas: fixadasDasTabelas,
    fixadasPelaOrganizacao: fixadasDasTabelas,
  },
  regiao: { fuso },
  inicio: {
    ordenacao,
    blocos: listaOrdenada(LIMITES_DAS_PREFERENCIAS.blocosDoInicio, { extras: extrasDoBloco }),
  },
  acessibilidade: {
    movimento: umDe(['sistema', 'reduzido']),
    transparencia: umDe(['sistema', 'reduzida']),
  },
};

const SECOES = Object.keys(LEITORES) as SecaoDePreferencias[];

/**
 * Lê uma camada salva (da organização, da conta ou da cópia do navegador). Cada campo é validado
 * sozinho: o inválido ou desconhecido fica de fora, para valer o da camada de baixo, e o número
 * fora do intervalo é trazido para o limite mais próximo. A seção sem nenhum campo válido sai.
 */
export function lerAjustes(bruto: unknown): AjustesDasPreferencias {
  const camada: Record<string, Bruto> = {};
  const salvo = objeto(bruto);
  if (!salvo) return {};
  for (const secao of SECOES) {
    const campos = objeto(salvo[secao]);
    if (!campos) continue;
    const lidos: Bruto = {};
    for (const [campo, ler] of Object.entries(LEITORES[secao] as Record<string, Leitor>)) {
      const valor = ler(campos[campo]);
      if (valor !== undefined) lidos[campo] = valor;
    }
    if (Object.keys(lidos).length > 0) camada[secao] = lidos;
  }
  return camada as AjustesDasPreferencias;
}

/**
 * A preferência que vale: a de fábrica e, por cima dela, cada camada na ordem dada (a da
 * organização antes da da conta), campo a campo. Cada camada passa antes pela leitura.
 */
export function resolverPreferencias(...camadas: readonly unknown[]): PreferenciasDaInterface {
  const resolvidas = structuredClone(PADRAO_DE_FABRICA) as unknown as Record<string, Bruto>;
  for (const camada of camadas) {
    for (const [secao, campos] of Object.entries(lerAjustes(camada))) {
      Object.assign(resolvidas[secao] as Bruto, structuredClone(campos));
    }
  }
  return resolvidas as unknown as PreferenciasDaInterface;
}

/**
 * Aplica uma mudança a uma camada e devolve a camada nova, já lida: o que não é válido na mudança
 * fica de fora, e a seção que fica vazia sai. Nenhum dos dois objetos dados é alterado.
 */
export function aplicarMudanca(
  camada: AjustesDasPreferencias,
  mudanca: MudancaDasPreferencias,
): AjustesDasPreferencias {
  const nova = structuredClone(lerAjustes(camada)) as Record<string, Bruto>;
  const mudancas = objeto(mudanca) ?? {};
  for (const secao of SECOES) {
    if (!(secao in mudancas)) continue;
    const campos = mudancas[secao];
    if (campos === null) {
      delete nova[secao];
      continue;
    }
    const mudados = objeto(campos);
    if (!mudados) continue;
    const atual: Bruto = { ...nova[secao] };
    for (const [campo, valor] of Object.entries(mudados)) {
      if (valor === null) delete atual[campo];
      else atual[campo] = structuredClone(valor);
    }
    nova[secao] = atual;
  }
  return lerAjustes(nova);
}
