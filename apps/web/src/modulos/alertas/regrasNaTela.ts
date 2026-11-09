// As regras de alerta em texto e no formulário (spec modulo-alertas, "Regras na tela"): o resumo da
// condição com os parâmetros, a duração, o escopo e as exceções (change regras-indicadores-e-tarefas),
// e o rascunho do formulário, com os números em texto, que vira o pedido conferido pelo domínio.
import {
  CONDICOES_DA_IMPRESSORA,
  type CondicaoDeAlerta,
  condicaoDe,
  type EfeitoDaExcecao,
  type EscopoDaRegra,
  type LugarDaExcecao,
  PARAMETROS_INICIAIS,
  ROTULOS_DAS_SITUACOES_DO_CONTROL_ID,
  type SeveridadeDoAlerta,
  type TipoDeEscopo,
} from '@grafite/domain';
import type { RegraDeAlerta } from './consultas.ts';

type Parametros = RegraDeAlerta['parametros'];

const rotuloDaCondicaoDaImpressora = (chave: string) =>
  CONDICOES_DA_IMPRESSORA.find((condicao) => condicao.chave === chave)?.rotulo ?? chave;

/** Até três itens e, depois, quantos faltam: "Sem papel, Sem toner, Tampa aberta e mais 5". */
function lista(rotulos: readonly string[]): string {
  if (rotulos.length <= 3) return rotulos.join(', ');
  return `${rotulos.slice(0, 3).join(', ')} e mais ${rotulos.length - 3}`;
}

/** A condição com os parâmetros, como "Nível do toner em 10% ou menos, volta acima de 15%". */
export function resumoDaCondicao(condicao: CondicaoDeAlerta, parametros: Parametros): string {
  switch (condicao) {
    case 'rede.offline':
      return 'Ativo offline';
    case 'toner.nivel': {
      const limite = parametros.limite ?? 0;
      return `Nível do toner em ${limite}% ou menos, volta acima de ${limite + (parametros.folga ?? 0)}%`;
    }
    case 'impressora.condicao':
      return `Condição da impressora: ${lista((parametros.condicoes ?? []).map(rotuloDaCondicaoDaImpressora))}`;
    case 'controlid.situacao':
      return `Saúde do Control iD: ${lista(
        (parametros.situacoes ?? []).map(
          (situacao) =>
            ROTULOS_DAS_SITUACOES_DO_CONTROL_ID[
              situacao as keyof typeof ROTULOS_DAS_SITUACOES_DO_CONTROL_ID
            ] ?? situacao,
        ),
      )}`;
    case 'coleta.atrasada':
      return `Coleta atrasada há ${parametros.ciclos ?? 0} ciclos`;
    case 'coletor.sem-contato':
      return `Coletor sem contato há ${parametros.minutos ?? 0} minutos`;
  }
}

/** A duração: "Na hora", "5 min", ou nada nas condições sem ela. */
export function duracaoEmTexto(condicao: CondicaoDeAlerta, duracao: number): string {
  if (!condicaoDe(condicao)?.comDuracao) return '—';
  return duracao === 0 ? 'Na hora' : `${duracao} min`;
}

/** O escopo pelo nome do registro, como "Tipo: Impressora". */
export function escopoEmTexto(escopo: RegraDeAlerta['escopo']): string {
  const nome = escopo.nome ?? 'registro removido';
  switch (escopo.tipo) {
    case 'organizacao':
      return 'Organização inteira';
    case 'tipo':
      return `Tipo: ${nome}`;
    case 'modelo':
      return `Modelo: ${nome}`;
    case 'ativo':
      return `Ativo: ${nome}`;
    case 'local':
      return `Local: ${nome} e os de baixo`;
  }
}

/** Quantas exceções a regra tem: "Sem exceções", "1 exceção" ou "2 exceções". */
export function excecoesEmTexto(excecoes: readonly unknown[]): string {
  if (excecoes.length === 0) return 'Sem exceções';
  return excecoes.length === 1 ? '1 exceção' : `${excecoes.length} exceções`;
}

/** Onde a exceção vale, no campo "Onde vale". */
export const OPCOES_DO_LUGAR: { id: LugarDaExcecao['tipo']; rotulo: string }[] = [
  { id: 'tipo', rotulo: 'Um tipo' },
  { id: 'modelo', rotulo: 'Um modelo' },
  { id: 'ativo', rotulo: 'Um ativo' },
  { id: 'local', rotulo: 'Um local e os de baixo' },
];

export const OPCOES_DO_ESCOPO: { id: TipoDeEscopo; rotulo: string }[] = [
  { id: 'organizacao', rotulo: 'Organização inteira' },
  { id: 'tipo', rotulo: 'Um tipo' },
  { id: 'modelo', rotulo: 'Um modelo' },
  { id: 'ativo', rotulo: 'Um ativo' },
  { id: 'local', rotulo: 'Um local e os de baixo' },
];

/** A regra no formulário: os números em texto, como digitados. */
export interface RascunhoDaRegra {
  nome: string;
  condicao: CondicaoDeAlerta | null;
  limite: string;
  folga: string;
  condicoes: string[];
  situacoes: string[];
  ciclos: string;
  minutos: string;
  duracao: string;
  severidade: SeveridadeDoAlerta;
  escopo: TipoDeEscopo;
  /** O registro do escopo, com o nome para o campo mostrar. */
  registro: { id: string; rotulo: string } | null;
  excecoes: RascunhoDaExcecao[];
}

/** Uma exceção no formulário: o lugar, o registro escolhido, o efeito e o limite em texto. */
export interface RascunhoDaExcecao {
  /** Só para a lista do formulário: a exceção não tem id na regra. */
  chave: number;
  lugar: LugarDaExcecao['tipo'] | null;
  registro: { id: string; rotulo: string } | null;
  efeito: EfeitoDaExcecao;
  limite: string;
  folga: string;
}

let proximaChave = 0;

/** A exceção nova, sem lugar e sem alertar, com o limite da regra do toner para começar. */
export const excecaoNova = (limite: string, folga: string): RascunhoDaExcecao => ({
  chave: ++proximaChave,
  lugar: null,
  registro: null,
  efeito: 'nao-alertar',
  limite,
  folga,
});

/** Os parâmetros de fábrica de uma condição, em texto. */
export function parametrosIniciais(
  condicao: CondicaoDeAlerta,
): Pick<RascunhoDaRegra, 'limite' | 'folga' | 'condicoes' | 'situacoes' | 'ciclos' | 'minutos'> {
  const iniciais = PARAMETROS_INICIAIS[condicao] as Parametros;
  return {
    limite: String(iniciais.limite ?? PARAMETROS_INICIAIS['toner.nivel'].limite),
    folga: String(iniciais.folga ?? PARAMETROS_INICIAIS['toner.nivel'].folga),
    condicoes: [...(iniciais.condicoes ?? [])],
    situacoes: [...(iniciais.situacoes ?? [])],
    ciclos: String(iniciais.ciclos ?? PARAMETROS_INICIAIS['coleta.atrasada'].ciclos),
    minutos: String(iniciais.minutos ?? PARAMETROS_INICIAIS['coletor.sem-contato'].minutos),
  };
}

export const RASCUNHO_VAZIO: RascunhoDaRegra = {
  nome: '',
  condicao: null,
  ...parametrosIniciais('toner.nivel'),
  duracao: '0',
  severidade: 'atencao',
  escopo: 'organizacao',
  registro: null,
  excecoes: [],
};

/** A regra que existe, no formulário. */
export function rascunhoDa(regra: RegraDeAlerta): RascunhoDaRegra {
  const iniciais = parametrosIniciais(regra.condicao);
  const { parametros } = regra;
  return {
    nome: regra.nome,
    condicao: regra.condicao,
    limite: parametros.limite === undefined ? iniciais.limite : String(parametros.limite),
    folga: parametros.folga === undefined ? iniciais.folga : String(parametros.folga),
    condicoes: parametros.condicoes ?? iniciais.condicoes,
    situacoes: parametros.situacoes ?? iniciais.situacoes,
    ciclos: parametros.ciclos === undefined ? iniciais.ciclos : String(parametros.ciclos),
    minutos: parametros.minutos === undefined ? iniciais.minutos : String(parametros.minutos),
    duracao: String(regra.duracao),
    severidade: regra.severidade,
    escopo: regra.escopo.tipo,
    registro:
      regra.escopo.id === null ? null : { id: regra.escopo.id, rotulo: regra.escopo.nome ?? '' },
    excecoes: regra.excecoes.map((excecao) => ({
      chave: ++proximaChave,
      lugar: excecao.lugar.tipo,
      registro: { id: excecao.lugar.id, rotulo: excecao.lugar.nome ?? '' },
      efeito: excecao.efeito,
      limite: String(excecao.limite ?? iniciais.limite),
      folga: String(excecao.folga ?? iniciais.folga),
    })),
  };
}

/** O número digitado; o vazio e o que não é número viram `NaN`, que o domínio recusa. */
const numero = (texto: string) => (texto.trim() === '' ? Number.NaN : Number(texto.trim()));

/** O que o domínio confere, a partir do rascunho. */
export function entradaDa(rascunho: RascunhoDaRegra): Record<string, unknown> {
  const { condicao } = rascunho;
  const parametros =
    condicao === 'toner.nivel'
      ? { limite: numero(rascunho.limite), folga: numero(rascunho.folga) }
      : condicao === 'impressora.condicao'
        ? { condicoes: rascunho.condicoes }
        : condicao === 'controlid.situacao'
          ? { situacoes: rascunho.situacoes }
          : condicao === 'coleta.atrasada'
            ? { ciclos: numero(rascunho.ciclos) }
            : condicao === 'coletor.sem-contato'
              ? { minutos: numero(rascunho.minutos) }
              : {};
  const escopo: EscopoDaRegra | { tipo: TipoDeEscopo; id: string | null } =
    rascunho.escopo === 'organizacao'
      ? { tipo: 'organizacao', id: null }
      : { tipo: rascunho.escopo, id: rascunho.registro?.id ?? null };
  return {
    nome: rascunho.nome,
    condicao,
    parametros,
    duracao: numero(rascunho.duracao),
    severidade: rascunho.severidade,
    escopo,
    excecoes: rascunho.excecoes.map((excecao) => ({
      lugar: excecao.lugar ? { tipo: excecao.lugar, id: excecao.registro?.id } : undefined,
      efeito: excecao.efeito,
      ...(excecao.efeito === 'outro-limite'
        ? { limite: numero(excecao.limite), folga: numero(excecao.folga) }
        : {}),
    })),
  };
}
