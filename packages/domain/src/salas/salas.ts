// As salas de reunião no domínio (spec salas-de-reuniao; change salas-de-reuniao, design, decisão
// 3): a conferência da sala, do item solicitável e da reserva, que a API e a web usam, o conflito de
// horário entre duas reservas e a situação da sala no mapa. O registro inativo, a conta de outra
// organização e o horário já reservado, a API confere no banco com as mensagens daqui.
import { diaEmSaoPaulo, horaEmSaoPaulo } from '../coleta/backup-do-control-id.ts';

export const SITUACOES_DA_RESERVA = ['pendente', 'aprovada', 'recusada', 'cancelada'] as const;

export type SituacaoDaReserva = (typeof SITUACOES_DA_RESERVA)[number];

/** A situação da reserva em texto, como a tela a mostra. */
export const ROTULOS_DAS_SITUACOES_DA_RESERVA = {
  pendente: 'Aguardando aprovação',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
} as const satisfies Record<SituacaoDaReserva, string>;

export const RESPOSTAS_DO_CONVITE = ['sem-resposta', 'aceitou', 'recusou'] as const;

export type RespostaDoConvite = (typeof RESPOSTAS_DO_CONVITE)[number];

export const ROTULOS_DAS_RESPOSTAS = {
  'sem-resposta': 'Sem resposta',
  aceitou: 'Aceitou',
  recusou: 'Recusou',
} as const satisfies Record<RespostaDoConvite, string>;

/** As situações que ocupam o horário da sala. */
export const SITUACOES_QUE_OCUPAM: readonly SituacaoDaReserva[] = ['pendente', 'aprovada'];

export const MENSAGENS_DAS_SALAS = {
  conflito: 'A sala já está reservada nesse horário.',
  salaRepetida: 'Já existe uma sala com esse nome.',
  itemRepetido: 'Já existe um item com esse nome.',
  sala: 'Escolha uma sala ativa.',
  participantes: 'Escolha participantes da organização.',
  itens: 'Escolha itens que estejam ativos.',
  local: 'Escolha um local ativo.',
} as const;

/** A reserva que já mudou de situação, em texto. */
export const jaMudou = (situacao: Exclude<SituacaoDaReserva, 'pendente'>) =>
  `Esta reserva já foi ${{ aprovada: 'aprovada', recusada: 'recusada', cancelada: 'cancelada' }[situacao]}.`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');

/** O nome de 1 a 80 caracteres, ou a mensagem. */
function nome(valor: unknown): string | { erro: string } {
  const lido = texto(valor);
  if (lido === '') return { erro: 'Informe o nome.' };
  if (lido.length > 80) return { erro: 'Use até 80 caracteres no nome.' };
  return lido;
}

export interface DadosDaSala {
  nome: string;
  localId: string | null;
  capacidade: number | null;
  recursos: string | null;
}

export type CampoDaSala = 'nome' | 'local' | 'capacidade' | 'recursos';

export function conferirSala(
  entrada: Record<string, unknown>,
): { ok: true; dados: DadosDaSala } | { ok: false; erros: Partial<Record<CampoDaSala, string>> } {
  const erros: Partial<Record<CampoDaSala, string>> = {};
  const lido = nome(entrada.nome);
  if (typeof lido !== 'string') erros.nome = lido.erro;
  let localId: string | null = null;
  if (entrada.localId !== undefined && entrada.localId !== null && entrada.localId !== '') {
    if (typeof entrada.localId === 'string' && UUID.test(entrada.localId))
      localId = entrada.localId;
    else erros.local = MENSAGENS_DAS_SALAS.local;
  }
  let capacidade: number | null = null;
  if (entrada.capacidade !== undefined && entrada.capacidade !== null) {
    const valor = entrada.capacidade;
    if (typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 500) {
      capacidade = valor;
    } else erros.capacidade = 'Informe uma capacidade de 1 a 500 pessoas.';
  }
  const recursos = texto(entrada.recursos);
  if (recursos.length > 500) erros.recursos = 'Use até 500 caracteres nos recursos.';
  if (Object.keys(erros).length > 0 || typeof lido !== 'string') return { ok: false, erros };
  return {
    ok: true,
    dados: { nome: lido, localId, capacidade, recursos: recursos === '' ? null : recursos },
  };
}

export interface DadosDoItemDaSala {
  nome: string;
  descricao: string | null;
}

export function conferirItemDaSala(
  entrada: Record<string, unknown>,
):
  | { ok: true; dados: DadosDoItemDaSala }
  | { ok: false; erros: Partial<Record<'nome' | 'descricao', string>> } {
  const erros: Partial<Record<'nome' | 'descricao', string>> = {};
  const lido = nome(entrada.nome);
  if (typeof lido !== 'string') erros.nome = lido.erro;
  const descricao = texto(entrada.descricao);
  if (descricao.length > 200) erros.descricao = 'Use até 200 caracteres na descrição.';
  if (Object.keys(erros).length > 0 || typeof lido !== 'string') return { ok: false, erros };
  return { ok: true, dados: { nome: lido, descricao: descricao === '' ? null : descricao } };
}

export interface DadosDaReserva {
  salaId: string;
  inicio: Date;
  fim: Date;
  assunto: string;
  comentario: string | null;
  /** As contas convidadas, sem repetir e sem quem pede. */
  participantes: string[];
  /** Os itens solicitáveis, sem repetir. */
  itens: string[];
}

export type CampoDaReserva =
  | 'sala'
  | 'inicio'
  | 'fim'
  | 'assunto'
  | 'comentario'
  | 'participantes'
  | 'itens';

const DOZE_HORAS = 12 * 60 * 60 * 1000;
const MINUTO = 60 * 1000;

const momento = (valor: unknown): Date | null => {
  if (typeof valor !== 'string') return null;
  const lido = new Date(valor);
  return Number.isNaN(lido.getTime()) ? null : lido;
};

/** Os ids sem repetir, ou `null` se algum não é um id. */
function ids(valor: unknown): string[] | null {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || !valor.every((id) => typeof id === 'string' && UUID.test(id))) {
    return null;
  }
  return [...new Set(valor as string[])];
}

/**
 * Confere o pedido de reserva: o dia e as 12 horas no fuso de São Paulo, o início a partir do minuto
 * de agora, e os participantes sem quem pede.
 */
export function conferirReserva(
  entrada: Record<string, unknown>,
  { agora, quemPede }: { agora: Date; quemPede: string },
):
  | { ok: true; dados: DadosDaReserva }
  | { ok: false; erros: Partial<Record<CampoDaReserva, string>> } {
  const erros: Partial<Record<CampoDaReserva, string>> = {};
  const salaId =
    typeof entrada.salaId === 'string' && UUID.test(entrada.salaId) ? entrada.salaId : null;
  if (salaId === null) erros.sala = MENSAGENS_DAS_SALAS.sala;

  const inicio = momento(entrada.inicio);
  const fim = momento(entrada.fim);
  if (inicio === null) erros.inicio = 'Informe o início.';
  if (fim === null) erros.fim = 'Informe o fim.';
  if (inicio && fim) {
    if (fim.getTime() <= inicio.getTime()) erros.fim = 'O fim precisa ficar depois do início.';
    else if (
      diaEmSaoPaulo(inicio) !== diaEmSaoPaulo(new Date(fim.getTime() - 1)) ||
      fim.getTime() - inicio.getTime() > DOZE_HORAS
    ) {
      erros.fim = 'A reserva fica num dia só, com até 12 horas.';
    }
    if (inicio.getTime() < Math.floor(agora.getTime() / MINUTO) * MINUTO) {
      erros.inicio = 'Escolha um horário a partir de agora.';
    }
  }

  const assunto = texto(entrada.assunto);
  if (assunto === '') erros.assunto = 'Informe o assunto.';
  else if (assunto.length > 120) erros.assunto = 'Use até 120 caracteres no assunto.';

  const comentario = texto(entrada.comentario);
  if (comentario.length > 1000) erros.comentario = 'Use até 1.000 caracteres no comentário.';

  const convidados = ids(entrada.participantes);
  if (convidados === null) erros.participantes = MENSAGENS_DAS_SALAS.participantes;
  const participantes = (convidados ?? []).filter((conta) => conta !== quemPede);
  if (participantes.length > 50) erros.participantes = 'Convide até 50 participantes.';

  const itens = ids(entrada.itens);
  if (itens === null) erros.itens = MENSAGENS_DAS_SALAS.itens;

  if (Object.keys(erros).length > 0 || !salaId || !inicio || !fim || !itens) {
    return { ok: false, erros };
  }
  return {
    ok: true,
    dados: {
      salaId,
      inicio,
      fim,
      assunto,
      comentario: comentario === '' ? null : comentario,
      participantes,
      itens,
    },
  };
}

/** Duas reservas da mesma sala conflitam quando os horários se cruzam; encostar não conflita. */
export const reservasConflitam = (a: { inicio: Date; fim: Date }, b: { inicio: Date; fim: Date }) =>
  a.inicio.getTime() < b.fim.getTime() && a.fim.getTime() > b.inicio.getTime();

export interface SituacaoDaSalaNoMapa {
  texto: string;
  tom: 'sucesso' | 'info' | 'atencao';
  /** O assunto da reunião em uso. */
  assunto: string | null;
}

/**
 * A situação da sala no mapa, pelas reservas aprovadas do dia: em uso até o fim, reservada na
 * próxima, ou livre no resto do dia. As horas vão no fuso de São Paulo.
 */
export function situacaoDaSalaNoMapa(
  aprovadasDoDia: readonly { inicio: Date; fim: Date; assunto: string }[],
  agora: Date,
): SituacaoDaSalaNoMapa {
  const emUso = aprovadasDoDia.find(
    (reserva) =>
      reserva.inicio.getTime() <= agora.getTime() && agora.getTime() < reserva.fim.getTime(),
  );
  if (emUso) {
    return {
      texto: `Em uso até ${horaEmSaoPaulo(emUso.fim)}`,
      tom: 'atencao',
      assunto: emUso.assunto,
    };
  }
  const proxima = aprovadasDoDia
    .filter((reserva) => reserva.inicio.getTime() > agora.getTime())
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0];
  if (proxima) {
    return { texto: `Reservada às ${horaEmSaoPaulo(proxima.inicio)}`, tom: 'info', assunto: null };
  }
  return { texto: 'Livre', tom: 'sucesso', assunto: null };
}
