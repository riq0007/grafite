// O endereço das ordens de serviço (spec modulo-operacao, "Tela das ordens de serviço" e
// "Formulários das ordens de serviço"; change p4e-ordens-de-servico, design, decisão 8), na query
// string: a busca, a situação, com as em aberto quando ela não está, e o local, e a nova OS aberta,
// com o ativo da ficha de onde ela veio, para a busca e a ficha do ativo abrirem a gaveta pelo
// endereço.
import {
  ROTULOS_DAS_SITUACOES_DA_ORDEM,
  SITUACOES_DA_ORDEM,
  type SituacaoDaOrdem,
} from '@grafite/domain';

/** A situação do filtro: sem ela, as em aberto; "todas" traz também as resolvidas e as encerradas. */
export type SituacaoDoFiltroDasOrdens = 'todas' | SituacaoDaOrdem;

export interface FiltrosDasOrdens {
  /** O número, o ativo, o problema e a OS do fornecedor. */
  busca?: string;
  situacao?: SituacaoDoFiltroDasOrdens;
  /** O local, com os de dentro. */
  local?: string;
  /** A nova OS aberta na gaveta. */
  nova?: true;
  /** O ativo, quando a nova vem da ficha dele. */
  ativo?: string;
}

/** O filtro da situação: as em aberto primeiro, que valem sem nada no endereço. */
export const EM_ABERTO = 'em-aberto';

export const OPCOES_DA_SITUACAO = [
  { id: EM_ABERTO, rotulo: 'Em aberto' },
  ...SITUACOES_DA_ORDEM.map((id) => ({ id, rotulo: ROTULOS_DAS_SITUACOES_DA_ORDEM[id] })),
  { id: 'todas', rotulo: 'Todas' },
];

/** Um id do endereço: as letras, os números e o hífen dos ids, e nada mais. */
const ID = /^[\w-]{1,64}$/;

const id = (valor: unknown) => (typeof valor === 'string' && ID.test(valor) ? valor : undefined);

const SITUACOES_DO_FILTRO: readonly unknown[] = ['todas', ...SITUACOES_DA_ORDEM];

export function validarFiltrosDasOrdens(busca: Record<string, unknown>): FiltrosDasOrdens {
  const filtros: FiltrosDasOrdens = {};
  if (typeof busca.busca === 'string' && busca.busca.trim() !== '') filtros.busca = busca.busca;
  if (SITUACOES_DO_FILTRO.includes(busca.situacao)) {
    filtros.situacao = busca.situacao as SituacaoDoFiltroDasOrdens;
  }
  const local = id(busca.local);
  if (local) filtros.local = local;
  // O roteador lê "nova=1" como o número 1.
  if (busca.nova === 1 || busca.nova === '1' || busca.nova === true) filtros.nova = true;
  const ativo = id(busca.ativo);
  if (ativo) filtros.ativo = ativo;
  return filtros;
}
