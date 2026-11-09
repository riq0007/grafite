import { Wrench } from 'lucide-react';
import { definirModulo } from '../tipos.ts';
import { ENTRADAS_DA_OPERACAO, provedorDosConsumiveis } from './busca.ts';
import {
  CHAVE_DO_CONSUMIVEL,
  CHAVE_DOS_CONSUMIVEIS,
  CHAVE_DOS_MODELOS_PARA_ESCOLHER,
} from './consumiveis/consultas.ts';
import { NovoConsumivelNaAba } from './consumiveis/NovoConsumivelNaAba.tsx';
import { CHAVE_DO_ESTOQUE } from './estoque/consultas.ts';
import { OperacaoNoFornecedor } from './estoque/NoFornecedor.tsx';
import { fonteDoEstoque } from './estoque/ocorrencias.ts';
import { CHAVE_DOS_INDICADORES_DA_OPERACAO } from './indicadores/consultas.ts';
import { CHAVE_DAS_ORDENS } from './ordens/consultas.ts';
import { OrdensNaFichaDoAtivo } from './ordens/NaFichaDoAtivo.tsx';
import { rotasDaOperacao } from './rotas.tsx';
import { CHAVE_DAS_SOLICITACOES } from './solicitacoes/consultas.ts';
import { SolicitacoesNaFichaDoAtivo } from './solicitacoes/NaFichaDoAtivo.tsx';

/**
 * O módulo Operação no registro (spec modulo-operacao; change p4b-consumiveis, design, decisões 6 e
 * 7; change p4c-estoque, design, decisão 7; change p4d-solicitacoes, design, decisão 8; change
 * p4e-ordens-de-servico, design, decisão 8; change p4f-indicadores-da-operacao, design, decisões 6
 * e 10): para quem vê os consumíveis, o estoque, as solicitações ou as OS, com a lista dos
 * consumíveis, o estoque, as movimentações, as solicitações, as ordens de serviço e os indicadores.
 * Fica depois do Alertas e, no celular, em "Mais". Na busca, os consumíveis, "Novo consumível", as
 * ações de lançar, as de registrar uma solicitação e a de abrir uma OS; o Novo consumível também
 * abre numa aba, pelo campo que o pede. Os eventos dos consumíveis, do estoque, das solicitações e
 * das OS relêem as telas de cada um, e os das OS, do estoque, dos consumíveis e das metas, os
 * indicadores.
 */
export const operacao = definirModulo({
  id: 'operacao',
  nome: 'Operação',
  icone: Wrench,
  endereco: '/operacao',
  prioridadeNoCelular: 'mais',
  rotas: rotasDaOperacao,
  permissoes: [
    'consumiveis.ver',
    'consumiveis.editar',
    'estoque.ver',
    'estoque.movimentar',
    'solicitacoes.ver',
    'solicitacoes.atender',
    'ordens.ver',
    'ordens.atender',
    'operacao.administrar',
  ],
  menu: [
    // O Início, com as ações principais e os atalhos (change redesenho-da-interface, decisão 4).
    {
      rotulo: 'Início',
      destino: '/operacao',
      permissoes: [
        'consumiveis.ver',
        'consumiveis.editar',
        'estoque.ver',
        'estoque.movimentar',
        'solicitacoes.ver',
        'solicitacoes.atender',
        'ordens.ver',
        'ordens.atender',
      ],
    },
    {
      rotulo: 'Consumíveis',
      destino: '/operacao/consumiveis',
      permissoes: ['consumiveis.ver', 'consumiveis.editar'],
    },
    {
      rotulo: 'Estoque',
      destino: '/operacao/estoque',
      permissoes: ['estoque.ver', 'estoque.movimentar'],
    },
    {
      rotulo: 'Movimentações',
      destino: '/operacao/movimentacoes',
      permissoes: ['estoque.ver', 'estoque.movimentar'],
    },
    {
      rotulo: 'Solicitações',
      destino: '/operacao/solicitacoes',
      permissoes: ['solicitacoes.ver', 'solicitacoes.atender'],
    },
    {
      rotulo: 'Ordens de serviço',
      destino: '/operacao/ordens',
      permissoes: ['ordens.ver', 'ordens.atender'],
    },
    // Os das OS para quem as vê e o das páginas por toner para quem vê o estoque.
    {
      rotulo: 'Indicadores',
      destino: '/operacao/indicadores',
      permissoes: ['ordens.ver', 'estoque.ver'],
    },
  ],
  busca: { entradas: ENTRADAS_DA_OPERACAO, provedores: [provedorDosConsumiveis] },
  // Os consumíveis abaixo do mínimo em "O que resolver agora".
  ocorrencias: fonteDoEstoque,
  // Os consumíveis e as entradas na ficha do fornecedor, cada parte com a permissão dela.
  relacoes: [
    {
      alvo: 'fornecedor',
      componente: OperacaoNoFornecedor,
      permissoes: ['consumiveis.ver', 'consumiveis.editar', 'estoque.ver', 'estoque.movimentar'],
    },
    // As solicitações do ativo na ficha dele, com "Nova solicitação" para quem atende.
    {
      alvo: 'ativo',
      componente: SolicitacoesNaFichaDoAtivo,
      permissoes: ['solicitacoes.ver', 'solicitacoes.atender'],
    },
    // As OS do ativo na ficha dele, com "Nova ordem de serviço" para quem atende.
    {
      alvo: 'ativo',
      componente: OrdensNaFichaDoAtivo,
      permissoes: ['ordens.ver', 'ordens.atender'],
    },
  ],
  cadastros: [
    {
      alvo: 'consumivel',
      titulo: 'Novo consumível',
      link: 'Cadastrar novo consumível',
      permissoes: ['consumiveis.editar'],
      componente: NovoConsumivelNaAba,
    },
  ],
  eventos: {
    // Um consumível: as listas e a ficha dele. O evento não leva o código nem o nome. O rendimento
    // dele entra nas páginas por toner.
    'consumiveis.mudaram': ({ alvo }) => [
      CHAVE_DOS_CONSUMIVEIS,
      alvo?.tipo === 'consumivel' && alvo.id
        ? [...CHAVE_DO_CONSUMIVEL, alvo.id]
        : CHAVE_DO_CONSUMIVEL,
      CHAVE_DOS_INDICADORES_DA_OPERACAO,
    ],
    // O nome e a situação de um modelo aparecem nas fichas, e os modelos para escolher seguem a
    // capacidade dos tipos; o nome de um fornecedor também aparece nas fichas.
    'catalogo.mudou': () => [CHAVE_DO_CONSUMIVEL, CHAVE_DOS_MODELOS_PARA_ESCOLHER],
    'fornecedores.mudaram': () => [CHAVE_DO_CONSUMIVEL],
    // Uma movimentação ou um mínimo: os saldos, as movimentações e o estoque das fichas; a saída de
    // um toner, as páginas por toner.
    'estoque.mudou': () => [CHAVE_DO_ESTOQUE, CHAVE_DOS_INDICADORES_DA_OPERACAO],
    // Uma solicitação registrada, alterada, atendida ou encerrada: a lista, as fichas e a seção da
    // ficha do ativo, todas debaixo da mesma chave.
    'solicitacoes.mudaram': () => [CHAVE_DAS_SOLICITACOES],
    // Uma OS aberta, mudada ou encerrada: as listas, as fichas e a seção da ficha do ativo, as
    // solicitações, porque a ficha do conserto mostra a situação da OS dele, e os indicadores.
    'ordens.mudaram': () => [
      CHAVE_DAS_ORDENS,
      CHAVE_DAS_SOLICITACOES,
      CHAVE_DOS_INDICADORES_DA_OPERACAO,
    ],
    // A meta de um indicador, do Operação ou do Alertas: o evento não diz qual.
    'metas.mudaram': () => [CHAVE_DOS_INDICADORES_DA_OPERACAO],
  },
});
