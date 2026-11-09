// As regras de alerta (spec alertas, "Condições de alerta" e "Regras de alerta"; change
// p3a-regras-e-alertas, design, decisão 2): as condições definidas pelo sistema, com os parâmetros
// de cada uma, e a conferência da regra que a API e a web usam. O que depende do banco, como o nome
// de outra regra e o registro do escopo inativo, a API confere com as mensagens daqui.
import type { SituacaoDaSondagem } from '../coleta/control-id.ts';
import { CONDICOES_DA_IMPRESSORA } from '../coleta/impressoras.ts';
import { conferirExcecoes, type ExcecaoDaRegra } from './excecoes.ts';

export const SEVERIDADES_DO_ALERTA = ['critico', 'atencao', 'info'] as const;

export type SeveridadeDoAlerta = (typeof SEVERIDADES_DO_ALERTA)[number];

export const ROTULOS_DAS_SEVERIDADES = {
  critico: 'Crítico',
  atencao: 'Atenção',
  info: 'Informação',
} as const satisfies Record<SeveridadeDoAlerta, string>;

export const severidadeDoAlerta = (valor: unknown): valor is SeveridadeDoAlerta =>
  (SEVERIDADES_DO_ALERTA as readonly unknown[]).includes(valor);

/** As capacidades que ligam uma condição dos ativos no tipo. */
export type CapacidadeDaCondicao = 'rede.disponibilidade' | 'snmp.suprimentos' | 'controlid.saude';

export interface DefinicaoDaCondicao {
  chave: string;
  rotulo: string;
  /** De quem é o alerta: de um ativo ou de um coletor. */
  alvo: 'ativo' | 'coletor';
  /** A capacidade que o tipo do ativo precisa ligar; a coleta atrasada vale para qualquer coletada. */
  capacidade: CapacidadeDaCondicao | null;
  /** Se a regra escolhe por quanto tempo a condição dura até o alerta abrir. */
  comDuracao: boolean;
}

export const CONDICOES_DE_ALERTA = [
  {
    chave: 'rede.offline',
    rotulo: 'Ativo offline',
    alvo: 'ativo',
    capacidade: 'rede.disponibilidade',
    comDuracao: true,
  },
  {
    chave: 'toner.nivel',
    rotulo: 'Nível do toner',
    alvo: 'ativo',
    capacidade: 'snmp.suprimentos',
    comDuracao: true,
  },
  {
    chave: 'impressora.condicao',
    rotulo: 'Condição da impressora',
    alvo: 'ativo',
    capacidade: 'snmp.suprimentos',
    comDuracao: true,
  },
  {
    chave: 'controlid.situacao',
    rotulo: 'Saúde do Control iD',
    alvo: 'ativo',
    capacidade: 'controlid.saude',
    comDuracao: true,
  },
  {
    chave: 'coleta.atrasada',
    rotulo: 'Coleta atrasada',
    alvo: 'ativo',
    capacidade: null,
    comDuracao: false,
  },
  {
    chave: 'coletor.sem-contato',
    rotulo: 'Coletor sem contato',
    alvo: 'coletor',
    capacidade: null,
    comDuracao: false,
  },
] as const satisfies readonly DefinicaoDaCondicao[];

export type CondicaoDeAlerta = (typeof CONDICOES_DE_ALERTA)[number]['chave'];

export const condicaoDe = (chave: unknown) =>
  CONDICOES_DE_ALERTA.find((condicao) => condicao.chave === chave);

/** As situações do Control iD que uma regra escolhe: as da sondagem que pedem atenção. */
export const SITUACOES_DO_CONTROL_ID_EM_ALERTA = [
  'sem-resposta',
  'login-recusado',
  'resposta-inesperada',
] as const satisfies readonly SituacaoDaSondagem[];

export type SituacaoDoControlIdEmAlerta = (typeof SITUACOES_DO_CONTROL_ID_EM_ALERTA)[number];

export interface ParametrosDasCondicoes {
  'rede.offline': Record<string, never>;
  'toner.nivel': { limite: number; folga: number };
  'impressora.condicao': { condicoes: string[] };
  'controlid.situacao': { situacoes: SituacaoDoControlIdEmAlerta[] };
  'coleta.atrasada': { ciclos: number };
  'coletor.sem-contato': { minutos: number };
}

/** Os parâmetros com que o formulário começa cada condição. */
export const PARAMETROS_INICIAIS: { [C in CondicaoDeAlerta]: ParametrosDasCondicoes[C] } = {
  'rede.offline': {},
  'toner.nivel': { limite: 10, folga: 5 },
  'impressora.condicao': { condicoes: [] },
  'controlid.situacao': { situacoes: [] },
  'coleta.atrasada': { ciclos: 3 },
  'coletor.sem-contato': { minutos: 10 },
};

export const TIPOS_DE_ESCOPO = ['organizacao', 'tipo', 'modelo', 'ativo', 'local'] as const;

export type TipoDeEscopo = (typeof TIPOS_DE_ESCOPO)[number];

export type EscopoDaRegra =
  | { tipo: 'organizacao'; id: null }
  | { tipo: Exclude<TipoDeEscopo, 'organizacao'>; id: string };

/** A mensagem do escopo sem o registro, ou com o registro inativo, que a API também usa. */
export const MENSAGENS_DO_ESCOPO = {
  tipo: 'Escolha um tipo ativo.',
  modelo: 'Escolha um modelo ativo.',
  ativo: 'Escolha um ativo que não esteja inativo.',
  local: 'Escolha um local ativo.',
} as const satisfies Record<Exclude<TipoDeEscopo, 'organizacao'>, string>;

/** A mensagem do nome de outra regra da organização, que a API confere no banco. */
export const MENSAGEM_DO_NOME_REPETIDO = 'Já existe uma regra com esse nome.';

/** Os limites dos campos da regra, com o mínimo e o máximo de cada número. */
export const LIMITES_DA_REGRA = {
  nome: 80,
  limite: [1, 99],
  folga: [0, 50],
  ciclos: [2, 20],
  minutos: [5, 1440],
  duracao: [0, 1440],
} as const;

/** A regra conferida, com os parâmetros da condição dela. */
export type DadosDaRegra = {
  [C in CondicaoDeAlerta]: {
    nome: string;
    condicao: C;
    parametros: ParametrosDasCondicoes[C];
    /** Em minutos; 0 nas condições sem a duração. */
    duracao: number;
    severidade: SeveridadeDoAlerta;
    escopo: EscopoDaRegra;
    /** As exceções num tipo, num modelo, num ativo ou num local; sem elas, nenhuma. */
    excecoes?: ExcecaoDaRegra[];
  };
}[CondicaoDeAlerta];

export type CampoDaRegra =
  | 'nome'
  | 'condicao'
  | 'limite'
  | 'folga'
  | 'condicoes'
  | 'situacoes'
  | 'ciclos'
  | 'minutos'
  | 'duracao'
  | 'severidade'
  | 'escopo'
  | 'excecoes'
  | `excecoes.${number}`;

export type ConferenciaDaRegra =
  | { ok: true; dados: DadosDaRegra }
  | { ok: false; erros: Partial<Record<CampoDaRegra, string>> };

type Erros = Partial<Record<CampoDaRegra, string>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const objeto = (valor: unknown): Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};

/** O inteiro dentro dos limites, ou `null`. */
function inteiroEntre(valor: unknown, [minimo, maximo]: readonly [number, number]): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo
    ? valor
    : null;
}

/**
 * Os itens escolhidos de uma lista do sistema, sem repetir e na ordem dela; o primeiro que ela não
 * tem vira o erro.
 */
function escolhidos<T extends string>(
  valor: unknown,
  lista: readonly T[],
  vazia: string,
  desconhecido: (item: string) => string,
): { ok: true; itens: T[] } | { ok: false; erro: string } {
  if (!Array.isArray(valor) || valor.length === 0) return { ok: false, erro: vazia };
  const estranho = valor.find((item) => !(lista as readonly unknown[]).includes(item));
  if (estranho !== undefined) return { ok: false, erro: desconhecido(String(estranho)) };
  return { ok: true, itens: lista.filter((item) => valor.includes(item)) };
}

const CHAVES_DAS_CONDICOES_DA_IMPRESSORA = CONDICOES_DA_IMPRESSORA.map(({ chave }) => chave);

function conferirParametros(
  condicao: CondicaoDeAlerta,
  entrada: Record<string, unknown>,
  erros: Erros,
): DadosDaRegra['parametros'] | null {
  switch (condicao) {
    case 'rede.offline':
      return {};
    case 'toner.nivel': {
      const limite = inteiroEntre(entrada.limite, LIMITES_DA_REGRA.limite);
      const folga = inteiroEntre(entrada.folga, LIMITES_DA_REGRA.folga);
      if (limite === null) erros.limite = 'Informe um limite de 1 a 99%.';
      if (folga === null) erros.folga = 'Informe uma folga de 0 a 50 pontos.';
      if (limite === null || folga === null) return null;
      if (limite + folga >= 100) {
        erros.folga = 'O limite mais a folga precisa ficar abaixo de 100%.';
        return null;
      }
      return { limite, folga };
    }
    case 'impressora.condicao': {
      const lidas = escolhidos(
        entrada.condicoes,
        CHAVES_DAS_CONDICOES_DA_IMPRESSORA,
        'Escolha ao menos uma condição.',
        (item) => `Condição desconhecida: ${item}.`,
      );
      if (!lidas.ok) erros.condicoes = lidas.erro;
      return lidas.ok ? { condicoes: lidas.itens } : null;
    }
    case 'controlid.situacao': {
      const lidas = escolhidos(
        entrada.situacoes,
        SITUACOES_DO_CONTROL_ID_EM_ALERTA,
        'Escolha ao menos uma situação.',
        (item) => `Situação desconhecida: ${item}.`,
      );
      if (!lidas.ok) erros.situacoes = lidas.erro;
      return lidas.ok ? { situacoes: lidas.itens } : null;
    }
    case 'coleta.atrasada': {
      const ciclos = inteiroEntre(entrada.ciclos, LIMITES_DA_REGRA.ciclos);
      if (ciclos === null) erros.ciclos = 'Informe de 2 a 20 ciclos.';
      return ciclos === null ? null : { ciclos };
    }
    case 'coletor.sem-contato': {
      const minutos = inteiroEntre(entrada.minutos, LIMITES_DA_REGRA.minutos);
      if (minutos === null) erros.minutos = 'Informe de 5 a 1.440 minutos.';
      return minutos === null ? null : { minutos };
    }
  }
}

function conferirEscopo(entrada: unknown, erros: Erros): EscopoDaRegra | null {
  const { tipo, id } = objeto(entrada);
  if (tipo === 'organizacao') return { tipo, id: null };
  if (tipo === 'tipo' || tipo === 'modelo' || tipo === 'ativo' || tipo === 'local') {
    if (typeof id === 'string' && UUID.test(id)) return { tipo, id };
    erros.escopo = MENSAGENS_DO_ESCOPO[tipo];
    return null;
  }
  erros.escopo = 'Escolha o escopo.';
  return null;
}

/**
 * Confere a regra que chega da tela ou da API. Com `condicaoAtual`, a da regra que já existe, a
 * condição não muda. A duração das condições que não a aceitam fica 0.
 */
export function conferirRegra(
  entrada: Record<string, unknown>,
  { condicaoAtual }: { condicaoAtual?: CondicaoDeAlerta } = {},
): ConferenciaDaRegra {
  const erros: Erros = {};
  const nome = typeof entrada.nome === 'string' ? entrada.nome.trim() : '';
  if (nome === '') erros.nome = 'Informe o nome da regra.';
  else if (nome.length > LIMITES_DA_REGRA.nome) erros.nome = 'Use até 80 caracteres no nome.';

  const condicao = condicaoDe(entrada.condicao);
  if (!condicao) erros.condicao = 'Escolha a condição.';
  else if (condicaoAtual !== undefined && condicao.chave !== condicaoAtual) {
    erros.condicao = 'A condição de uma regra não muda: cadastre outra regra.';
  }
  const parametros = condicao
    ? conferirParametros(condicao.chave, objeto(entrada.parametros), erros)
    : null;

  const duracao = condicao?.comDuracao
    ? inteiroEntre(entrada.duracao, LIMITES_DA_REGRA.duracao)
    : 0;
  if (duracao === null) erros.duracao = 'Informe uma duração de 0 a 1.440 minutos.';

  const severidade = severidadeDoAlerta(entrada.severidade) ? entrada.severidade : null;
  if (severidade === null) erros.severidade = 'Escolha a severidade.';

  const escopo = conferirEscopo(entrada.escopo, erros);
  if (condicao?.alvo === 'coletor' && escopo !== null && escopo.tipo !== 'organizacao') {
    erros.escopo = 'A regra do coletor vale para a organização inteira.';
  }

  const excecoes = condicao ? conferirExcecoes(condicao.chave, entrada.excecoes) : null;
  if (excecoes && !excecoes.ok) Object.assign(erros, excecoes.erros);

  if (
    Object.keys(erros).length > 0 ||
    !condicao ||
    parametros === null ||
    duracao === null ||
    severidade === null ||
    escopo === null ||
    !excecoes?.ok
  ) {
    return { ok: false, erros };
  }
  return {
    ok: true,
    dados: {
      nome,
      condicao: condicao.chave,
      parametros,
      duracao,
      severidade,
      escopo,
      excecoes: excecoes.excecoes,
    } as DadosDaRegra,
  };
}
