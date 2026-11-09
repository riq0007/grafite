// As salas de reunião na API (spec salas-de-reuniao; change salas-de-reuniao, design, decisões 1, 2,
// 4 e 7): a sala e o item como a tela os vê, a reserva com o que a conta pode ver dela, o conflito
// de horário com a sala trancada, as notificações e a camada do mapa.
import {
  contas,
  itensDasSalas,
  participantesDasReservas,
  pessoas,
  reservasDasSalas,
  salas,
  type Transacao,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  horaEmSaoPaulo,
  MENSAGENS_DAS_SALAS,
  type NovaNotificacao,
  pode,
  type RespostaDoConvite,
  SITUACOES_QUE_OCUPAM,
  type SituacaoDaReserva,
  situacaoDaSalaNoMapa,
} from '@grafite/domain';
import { and, asc, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import { carregarAcessosDaOrganizacao } from '../acesso/acesso.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import type { FornecedorDoMapa } from '../mapa/mapa.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { conflito } from '../problemas.ts';

export type LinhaDaSala = typeof salas.$inferSelect;
export type LinhaDoItem = typeof itensDasSalas.$inferSelect;
export type LinhaDaReserva = typeof reservasDasSalas.$inferSelect;

/** A sala como a tela a vê, com o caminho do local. */
export const salaLida = (linha: LinhaDaSala, arvore: ArvoreDeLocais) => ({
  id: linha.id,
  nome: linha.nome,
  local: linha.localId ? { id: linha.localId, caminho: arvore.caminho(linha.localId) } : null,
  capacidade: linha.capacidade,
  recursos: linha.recursos,
  situacao: linha.situacao,
});

export const itemLido = (linha: LinhaDoItem) => ({
  id: linha.id,
  nome: linha.nome,
  descricao: linha.descricao,
  situacao: linha.situacao,
});

/** O dia e o horário em São Paulo, como "29/10 das 14:00 às 15:00". */
const DIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
});
export const quando = (inicio: Date, fim: Date) =>
  `${DIA.format(inicio)} das ${horaEmSaoPaulo(inicio)} às ${horaEmSaoPaulo(fim)}`;

export interface ReservaNaTela {
  id: string;
  sala: { id: string; nome: string };
  inicio: string;
  fim: string;
  assunto: string;
  situacao: SituacaoDaReserva;
  pedidaPor: { id: string; nome: string };
  /** Só para quem pediu, os convidados e quem administra as salas. */
  comentario: string | null;
  motivo: string | null;
  participantes: { conta: { id: string; nome: string }; resposta: RespostaDoConvite }[] | null;
  itens: { id: string; nome: string }[];
  /** A resposta da conta, quando ela é convidada. */
  minhaResposta: RespostaDoConvite | null;
  permite: { aprovar: boolean; cancelar: boolean; responder: boolean };
}

/** As reservas com o que a conta vê de cada uma, na ordem dada. */
export async function reservasNaTela(
  tx: Transacao,
  linhas: readonly LinhaDaReserva[],
  { contaId, acesso, agora }: { contaId: string; acesso: Acesso; agora: Date },
): Promise<ReservaNaTela[]> {
  if (linhas.length === 0) return [];
  const ids = linhas.map((linha) => linha.id);
  const administra = pode(acesso, 'salas.administrar');
  const nomesDasSalas = new Map(
    (
      await tx
        .select({ id: salas.id, nome: salas.nome })
        .from(salas)
        .where(inArray(salas.id, [...new Set(linhas.map((linha) => linha.salaId))]))
    ).map((sala) => [sala.id, sala.nome]),
  );
  const convidados = await tx
    .select({
      reservaId: participantesDasReservas.reservaId,
      contaId: participantesDasReservas.contaId,
      resposta: participantesDasReservas.resposta,
      nome: pessoas.nome,
    })
    .from(participantesDasReservas)
    .innerJoin(contas, eq(contas.id, participantesDasReservas.contaId))
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(inArray(participantesDasReservas.reservaId, ids))
    .orderBy(asc(pessoas.nome));
  const nomesDasContas = new Map(
    (
      await tx
        .select({ id: contas.id, nome: pessoas.nome })
        .from(contas)
        .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
        .where(inArray(contas.id, [...new Set(linhas.map((linha) => linha.pedidaPor))]))
    ).map((conta) => [conta.id, conta.nome]),
  );
  const idsDosItens = [...new Set(linhas.flatMap((linha) => linha.itens))];
  const nomesDosItens = new Map(
    idsDosItens.length === 0
      ? []
      : (
          await tx
            .select({ id: itensDasSalas.id, nome: itensDasSalas.nome })
            .from(itensDasSalas)
            .where(inArray(itensDasSalas.id, idsDosItens))
        ).map((item) => [item.id, item.nome]),
  );
  return linhas.map((linha) => {
    const daReserva = convidados.filter((convidado) => convidado.reservaId === linha.id);
    const minha = daReserva.find((convidado) => convidado.contaId === contaId);
    const pediu = linha.pedidaPor === contaId;
    const ve = pediu || administra || minha !== undefined;
    const aberta = SITUACOES_QUE_OCUPAM.includes(linha.situacao) && linha.fim > agora;
    return {
      id: linha.id,
      sala: { id: linha.salaId, nome: nomesDasSalas.get(linha.salaId) ?? '' },
      inicio: linha.inicio.toISOString(),
      fim: linha.fim.toISOString(),
      assunto: linha.assunto,
      situacao: linha.situacao,
      pedidaPor: { id: linha.pedidaPor, nome: nomesDasContas.get(linha.pedidaPor) ?? '' },
      comentario: ve ? linha.comentario : null,
      motivo: pediu || administra ? linha.motivo : null,
      participantes: ve
        ? daReserva.map((convidado) => ({
            conta: { id: convidado.contaId, nome: convidado.nome },
            resposta: convidado.resposta,
          }))
        : null,
      itens: linha.itens.map((id) => ({ id, nome: nomesDosItens.get(id) ?? '' })),
      minhaResposta: minha?.resposta ?? null,
      permite: {
        aprovar: administra && linha.situacao === 'pendente' && linha.fim > agora,
        cancelar: (pediu || administra) && aberta,
        responder: minha !== undefined && aberta,
      },
    };
  });
}

/** Uma reserva com o que a conta vê dela. */
export async function reservaNaTela(
  tx: Transacao,
  linha: LinhaDaReserva,
  contexto: { contaId: string; acesso: Acesso; agora: Date },
): Promise<ReservaNaTela> {
  const [naTela] = await reservasNaTela(tx, [linha], contexto);
  if (!naTela) throw new Error('A reserva não foi lida.');
  return naTela;
}

/**
 * Confere, com a sala trancada, que nenhuma reserva dela aguardando aprovação ou aprovada cruza o
 * horário; duas que só se encostam não conflitam.
 */
export async function conferirHorarioLivre(
  tx: Transacao,
  { salaId, inicio, fim, menos }: { salaId: string; inicio: Date; fim: Date; menos?: string },
): Promise<void> {
  await tx.select({ id: salas.id }).from(salas).where(eq(salas.id, salaId)).for('update');
  const [cruzada] = await tx
    .select({ id: reservasDasSalas.id })
    .from(reservasDasSalas)
    .where(
      and(
        eq(reservasDasSalas.salaId, salaId),
        inArray(reservasDasSalas.situacao, [...SITUACOES_QUE_OCUPAM]),
        lt(reservasDasSalas.inicio, fim),
        gt(reservasDasSalas.fim, inicio),
        ...(menos ? [ne(reservasDasSalas.id, menos)] : []),
      ),
    )
    .limit(1);
  if (cruzada) {
    throw conflito(MENSAGENS_DAS_SALAS.conflito, { inicio: MENSAGENS_DAS_SALAS.conflito });
  }
}

/** As contas ativas com `salas.administrar`, que o pedido de reserva avisa. */
export async function quemAdministraAsSalas(tx: Transacao): Promise<string[]> {
  return (await carregarAcessosDaOrganizacao(tx))
    .filter((conta) => pode(conta.acesso, 'salas.administrar'))
    .map((conta) => conta.id);
}

/** Notifica as contas dadas, sem repetir, com a fila para os canais de fora quando ela roda. */
export async function notificarSobreASala(
  tx: Transacao,
  contasANotificar: readonly string[],
  notificacao: Pick<NovaNotificacao, 'titulo' | 'descricao' | 'destino'>,
  momento: Date,
  fila?: FilaDeTarefas,
): Promise<void> {
  const unicas = [...new Set(contasANotificar)];
  await notificar(
    tx,
    unicas.map((contaId) => ({
      contaId,
      severidade: 'info',
      origem: 'Salas',
      alertaId: null,
      ...notificacao,
    })),
    momento,
    fila?.rodando() ? { enviar: (...dados) => fila.enviar(...dados) } : {},
  );
}

/** As salas no mapa, com a situação pelas reservas aprovadas do dia. */
export const fornecedorDasSalas: FornecedorDoMapa = {
  alvoTipo: 'sala',
  camada: 'Salas de reunião',
  permissao: 'salas.ver',
  async marcadores(tx, posicoes, { acesso }) {
    if (posicoes.length === 0 || !pode(acesso, 'salas.ver')) return [];
    const ids = posicoes.map((posicao) => posicao.alvoId);
    const agora = new Date();
    const inicioDoDia = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const fimDoDia = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
    const doDia = (
      await tx
        .select({
          salaId: reservasDasSalas.salaId,
          inicio: reservasDasSalas.inicio,
          fim: reservasDasSalas.fim,
          assunto: reservasDasSalas.assunto,
        })
        .from(reservasDasSalas)
        .where(
          and(
            inArray(reservasDasSalas.salaId, ids),
            eq(reservasDasSalas.situacao, 'aprovada'),
            lt(reservasDasSalas.inicio, fimDoDia),
            gt(reservasDasSalas.fim, inicioDoDia),
          ),
        )
    ).filter(
      (reserva) => DIA.format(reserva.inicio) === DIA.format(agora) || reserva.inicio <= agora,
    );
    const dasSalas = await tx
      .select({ id: salas.id, nome: salas.nome, capacidade: salas.capacidade })
      .from(salas)
      .where(and(inArray(salas.id, ids), eq(salas.situacao, 'ativo')));
    const porId = new Map(dasSalas.map((sala) => [sala.id, sala]));
    return posicoes.flatMap((posicao) => {
      const sala = porId.get(posicao.alvoId);
      if (!sala) return [];
      const situacao = situacaoDaSalaNoMapa(
        doDia.filter((reserva) => reserva.salaId === sala.id),
        agora,
      );
      return [
        {
          alvo: { tipo: 'sala', id: sala.id },
          camada: 'Salas de reunião',
          rotulo: sala.nome,
          detalhe: situacao.assunto ?? (sala.capacidade ? `${sala.capacidade} lugares` : null),
          x: posicao.x,
          z: posicao.z,
          situacao: { texto: situacao.texto, tom: situacao.tom },
          acoes: [{ rotulo: 'Ver a agenda', destino: '/salas' }],
        },
      ];
    });
  },
  async ve(tx, alvoId, { acesso }) {
    if (!pode(acesso, 'salas.ver')) return false;
    const [sala] = await tx.select({ id: salas.id }).from(salas).where(eq(salas.id, alvoId));
    return sala !== undefined;
  },
};
