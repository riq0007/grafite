import { Siren } from 'lucide-react';
import { definirModulo } from '../tipos.ts';
import { AlertasNaFicha } from './AlertasNaFicha.tsx';
import { ENTRADAS_DOS_ALERTAS } from './busca.ts';
import {
  CHAVE_DA_REGRA,
  CHAVE_DAS_REGRAS,
  CHAVE_DO_SILENCIO,
  CHAVE_DOS_ALERTAS,
  CHAVE_DOS_INDICADORES,
} from './consultas.ts';
import { fonteDosAlertas } from './ocorrencias.ts';
import { resumoDosAlertas } from './resumo.ts';
import { rotasDosAlertas } from './rotas.tsx';

/**
 * O módulo Alertas no registro (spec modulo-alertas): para quem vê os alertas, inclusive por
 * tratá-los ou administrá-los, com os abertos, os resolvidos, os indicadores e, para quem
 * administra, as regras.
 * Fica depois do Ativos e, no celular, na barra de abas, depois dele. O evento `alertas.mudaram`
 * relê as listas, as regras e o silêncio dos ativos, e o `metas.mudaram`, os indicadores (change
 * p4f-indicadores-da-operacao, design, decisão 6). Na ficha do ativo, o bloco Alertas.
 */
export const alertas = definirModulo({
  id: 'alertas',
  nome: 'Alertas',
  icone: Siren,
  endereco: '/alertas',
  prioridadeNoCelular: 3,
  rotas: rotasDosAlertas,
  permissoes: ['alertas.ver', 'alertas.tratar', 'alertas.administrar'],
  menu: [
    { rotulo: 'Abertos', destino: '/alertas' },
    { rotulo: 'Resolvidos', destino: '/alertas/resolvidos' },
    // Os indicadores dos alertas, com as metas da organização (change p3d-indicadores).
    { rotulo: 'Indicadores', destino: '/alertas/indicadores' },
    {
      rotulo: 'Regras',
      destino: '/alertas/regras',
      separadoAntes: true,
      permissoes: ['alertas.administrar'],
    },
  ],
  busca: { entradas: ENTRADAS_DOS_ALERTAS },
  // Os alertas para resolver em "O que resolver agora".
  ocorrencias: fonteDosAlertas,
  // O bloco Alertas na ficha do ativo, para quem vê os alertas (a API diz se no local dele).
  relacoes: [
    {
      alvo: 'ativo',
      componente: AlertasNaFicha,
      // "1 alerta aberto" no cartão da Visão geral (change ficha-em-cartoes).
      resumo: resumoDosAlertas,
      permissoes: ['alertas.ver', 'alertas.tratar', 'alertas.administrar'],
    },
  ],
  eventos: {
    // O evento não leva o texto do alerta nem o nome da regra: as consultas leem de novo.
    'alertas.mudaram': () => [
      CHAVE_DOS_ALERTAS,
      CHAVE_DAS_REGRAS,
      CHAVE_DA_REGRA,
      CHAVE_DO_SILENCIO,
    ],
    // A meta de um indicador, do Alertas ou do Operação: o evento não diz qual.
    'metas.mudaram': () => [CHAVE_DOS_INDICADORES],
  },
});
