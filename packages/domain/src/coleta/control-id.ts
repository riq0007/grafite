// A saúde do Control iD (spec saude-do-control-id; change p2c-saude-do-control-id, design, decisões 1,
// 3, 6 e 7): a sondagem de cada controle de acesso resulta numa das quatro situações, e a resposta
// inesperada diz em que etapa, com o código HTTP, quando houver. O firmware, o produto e a série que
// o controle informa têm até 100 caracteres. O login de cada controle é o segredo ligado a ele no
// cofre ou o do tipo, e a situação na tela é a da última sondagem, ou "Não verificado", com o motivo,
// como a disponibilidade na rede.
import { desatualizada } from './disponibilidade.ts';
import type { SituacaoDaLeitura } from './metricas.ts';

export const SITUACOES_DA_SONDAGEM = [
  'respondendo',
  'login-recusado',
  'sem-resposta',
  'resposta-inesperada',
] as const;

export type SituacaoDaSondagem = (typeof SITUACOES_DA_SONDAGEM)[number];

/** As etapas da sondagem em que o controle pode responder como um Control iD não responde. */
export const ETAPAS_DA_SONDAGEM = ['login', 'informacoes'] as const;

export type EtapaDaSondagem = (typeof ETAPAS_DA_SONDAGEM)[number];

/** O maior texto que a sondagem grava: o firmware, o produto e a série. */
export const TEXTO_MAXIMO_DA_SONDAGEM = 100;

/** A porta HTTP dos controles, que o tipo já traz escolhida. */
export const PORTA_DO_CONTROL_ID = 80;

/** Os tipos de segredo que servem de login de um controle: o usuário é o identificador. */
export const TIPOS_DO_LOGIN_DO_CONTROL_ID = ['usuario-e-senha', 'conta-administrativa'] as const;

/** A situação na tela: a da última sondagem, sem dado ou não verificado. */
export const SITUACOES_DO_CONTROL_ID = [
  ...SITUACOES_DA_SONDAGEM,
  'sem-dado',
  'nao-verificado',
] as const;

export type SituacaoDoControlId = (typeof SITUACOES_DO_CONTROL_ID)[number];

export const ROTULOS_DAS_SITUACOES_DO_CONTROL_ID = {
  respondendo: 'Respondendo',
  'login-recusado': 'Login recusado',
  'sem-resposta': 'Sem resposta',
  'resposta-inesperada': 'Resposta inesperada',
  'sem-dado': 'Sem dado',
  'nao-verificado': 'Não verificado',
} as const satisfies Record<SituacaoDoControlId, string>;

/** A ordem da coluna, crescente: o que pede atenção primeiro. */
export const ORDEM_DAS_SITUACOES_DO_CONTROL_ID: readonly SituacaoDoControlId[] = [
  'sem-resposta',
  'login-recusado',
  'resposta-inesperada',
  'sem-dado',
  'respondendo',
  'nao-verificado',
];

/** O que a escolha do login precisa saber de um segredo do cofre. */
export interface SegredoDoLogin {
  id: string;
  tipo: string;
  situacao: 'ativo' | 'inativo';
  /** O usuário. */
  identificador: string | null;
}

/** O login com que o controle é sondado, e de onde ele vem, ou o motivo de não sondá-lo. */
export type LoginDoControle =
  | { ok: true; origem: 'controle' | 'tipo'; segredoId: string }
  | { ok: false; motivo: string };

/** O segredo ligado ao controle que serve de login: ativo, de um dos dois tipos, com o usuário. */
const serveDeLogin = (segredo: SegredoDoLogin) =>
  segredo.situacao === 'ativo' &&
  (TIPOS_DO_LOGIN_DO_CONTROL_ID as readonly string[]).includes(segredo.tipo) &&
  (segredo.identificador ?? '').trim() !== '';

/**
 * O login de um controle (design, decisão 3): o segredo ligado a ele no cofre, quando há um só que
 * serve de login; senão, o do tipo, enquanto ativo, porque o tipo e o usuário dele já foram
 * conferidos na escolha. Com dois ou mais ligados, com o do tipo inativo ou com o tipo sem login
 * (change login-de-cada-controle, design, decisão 2), o controle não é sondado, e o motivo vai à
 * tela.
 */
export function loginDoControle({
  doTipo,
  escolhidoNoTipo = true,
  ligados,
}: {
  /** O segredo escolhido no tipo, ou nenhum, quando ele não existe mais. */
  doTipo: SegredoDoLogin | null;
  /** Se o tipo tem um login escolhido; o tipo sem login não tem `doTipo`. */
  escolhidoNoTipo?: boolean;
  /** Os segredos ligados ao controle no cofre. */
  ligados: readonly SegredoDoLogin[];
}): LoginDoControle {
  const proprios = ligados.filter(serveDeLogin);
  const [proprio] = proprios;
  if (proprios.length > 1) {
    return { ok: false, motivo: 'Há mais de um login ligado a este controle no cofre.' };
  }
  if (proprio) return { ok: true, origem: 'controle', segredoId: proprio.id };
  if (!escolhidoNoTipo) {
    return { ok: false, motivo: 'Sem login: escolha o login deste controle ou o do tipo.' };
  }
  if (doTipo?.situacao === 'ativo') return { ok: true, origem: 'tipo', segredoId: doTipo.id };
  return { ok: false, motivo: 'O login escolhido no tipo está inativo.' };
}

/** O estado atual da sondagem de um controle. */
export interface EstadoDaSondagem {
  momento: Date;
  valorTexto: string | null;
  situacao: SituacaoDaLeitura;
  desde: Date;
}

export type SaudeDoControlId =
  | {
      situacao: Exclude<SituacaoDoControlId, 'nao-verificado'>;
      momento: Date;
      desde: Date;
      desatualizado: boolean;
    }
  | { situacao: 'nao-verificado'; motivo: string };

/**
 * A situação do Control iD (design, decisão 7). Sem IP, ou sem um login que sirva, o controle não é
 * verificado, mesmo com uma sondagem de antes; senão, vale a última sondagem, que fica
 * desatualizada depois de 3 intervalos, 15 minutos.
 */
export function situacaoDoControlId({
  ip,
  login,
  estado,
  alcancado,
  agora,
}: {
  /** O IP do campo que o tipo escolheu, ou `null` vazio. */
  ip: string | null;
  login: LoginDoControle;
  estado: EstadoDaSondagem | null;
  /** Se algum coletor ativo alcança o IP. */
  alcancado: boolean;
  agora?: Date;
}): SaudeDoControlId {
  if (!ip) return { situacao: 'nao-verificado', motivo: 'Sem IP' };
  if (!login.ok) return { situacao: 'nao-verificado', motivo: login.motivo };
  if (estado) {
    const lida = estado.valorTexto as SituacaoDaSondagem | null;
    const situacao =
      estado.situacao === 'sem-dado' || lida === null || !SITUACOES_DA_SONDAGEM.includes(lida)
        ? 'sem-dado'
        : lida;
    return {
      situacao,
      momento: estado.momento,
      desde: estado.desde,
      desatualizado: agora ? desatualizada(estado.momento, agora, 'controlid.sondagem') : false,
    };
  }
  return {
    situacao: 'nao-verificado',
    motivo: alcancado ? 'Aguardando a primeira sondagem.' : `Nenhum coletor alcança o IP ${ip}.`,
  };
}
