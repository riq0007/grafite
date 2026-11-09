// As regras de fábrica (spec alertas, "Regras de fábrica"; change p3a-regras-e-alertas, design,
// decisão 4): cada organização começa com elas, pela chave estável, e a API cria só as que faltam,
// sem tocar nas que existem. As condições da impressora se dividem pela severidade do catálogo do
// P2b: as que param a impressora e as que pedem atenção.
import { CONDICOES_DA_IMPRESSORA } from '../coleta/impressoras.ts';
import type { DadosDaRegra } from './regras.ts';

export interface RegraDeFabrica {
  /** Estável entre as versões: a regra da organização guarda de qual de fábrica nasceu. */
  chave: string;
  dados: DadosDaRegra;
}

const ORGANIZACAO = { tipo: 'organizacao', id: null } as const;

const condicoesDaImpressora = (severidade: 'critico' | 'atencao') =>
  CONDICOES_DA_IMPRESSORA.filter((condicao) => condicao.severidade === severidade).map(
    ({ chave }) => chave,
  );

export const REGRAS_DE_FABRICA: readonly RegraDeFabrica[] = [
  {
    chave: 'ativo-offline',
    dados: {
      nome: 'Ativo offline',
      condicao: 'rede.offline',
      parametros: {},
      duracao: 5,
      severidade: 'atencao',
      escopo: ORGANIZACAO,
      excecoes: [],
    },
  },
  {
    chave: 'toner-10',
    dados: {
      nome: 'Toner em 10% ou menos',
      condicao: 'toner.nivel',
      parametros: { limite: 10, folga: 5 },
      duracao: 0,
      severidade: 'critico',
      escopo: ORGANIZACAO,
      excecoes: [],
    },
  },
  {
    chave: 'impressora-parada',
    dados: {
      nome: 'Impressora parada',
      condicao: 'impressora.condicao',
      parametros: { condicoes: condicoesDaImpressora('critico') },
      duracao: 0,
      severidade: 'critico',
      escopo: ORGANIZACAO,
      excecoes: [],
    },
  },
  {
    chave: 'impressora-pede-atencao',
    dados: {
      nome: 'Impressora pede atenção',
      condicao: 'impressora.condicao',
      parametros: { condicoes: condicoesDaImpressora('atencao') },
      duracao: 0,
      severidade: 'atencao',
      escopo: ORGANIZACAO,
      excecoes: [],
    },
  },
  {
    chave: 'controlid-sem-resposta',
    dados: {
      nome: 'Control iD sem resposta',
      condicao: 'controlid.situacao',
      parametros: { situacoes: ['sem-resposta'] },
      duracao: 10,
      severidade: 'critico',
      escopo: ORGANIZACAO,
      excecoes: [],
    },
  },
  {
    chave: 'controlid-nao-aceita',
    dados: {
      nome: 'Control iD não aceita a sondagem',
      condicao: 'controlid.situacao',
      parametros: { situacoes: ['login-recusado', 'resposta-inesperada'] },
      duracao: 0,
      severidade: 'atencao',
      escopo: ORGANIZACAO,
      excecoes: [],
    },
  },
  {
    chave: 'coleta-atrasada',
    dados: {
      nome: 'Coleta atrasada',
      condicao: 'coleta.atrasada',
      parametros: { ciclos: 3 },
      duracao: 0,
      severidade: 'atencao',
      escopo: ORGANIZACAO,
      excecoes: [],
    },
  },
  {
    chave: 'coletor-sem-contato',
    dados: {
      nome: 'Coletor sem contato',
      condicao: 'coletor.sem-contato',
      parametros: { minutos: 10 },
      duracao: 0,
      severidade: 'critico',
      escopo: ORGANIZACAO,
      excecoes: [],
    },
  },
];
