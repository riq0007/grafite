// As salas de reunião pela API (spec salas-de-reuniao; change salas-de-reuniao, design, decisão
// 5): o cadastro das salas e dos itens, por quem administra as salas; a Agenda, o pedido com o
// conflito de horário, as Minhas reservas e os convites, por quem vê as salas; os Pedidos, a
// aprovação e a recusa, por quem administra; o cancelamento, por quem pediu ou administra; e a
// resposta ao convite, pelo participante. Cada mudança vai para a auditoria, com o evento
// `salas.mudaram`, e as notificações saem na mesma transação.
import {
  type Banco,
  contas,
  itensDasSalas,
  locais,
  naOrganizacao,
  participantesDasReservas,
  pessoas,
  RESPOSTAS_DO_CONVITE_NO_BANCO,
  reservasDasSalas,
  SITUACOES_DA_RESERVA_NO_BANCO,
  salas,
  type Transacao,
} from '@grafite/db';
import {
  conferirItemDaSala,
  conferirReserva,
  conferirSala,
  jaMudou,
  MENSAGENS_DAS_SALAS,
  normalizarTexto,
  pode,
  SITUACOES_QUE_OCUPAM,
} from '@grafite/domain';
import { and, asc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import {
  conferirHorarioLivre,
  itemLido,
  type LinhaDaReserva,
  notificarSobreASala,
  quando,
  quemAdministraAsSalas,
  reservaNaTela,
  reservasNaTela,
  salaLida,
} from '../salas/salas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const Situacao = z.enum(['ativo', 'inativo']);

const Sala = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    local: z.object({ id: z.uuid(), caminho: z.string() }).nullable(),
    capacidade: z.number().int().nullable(),
    recursos: z.string().nullable(),
    situacao: Situacao,
  })
  .meta({ id: 'SalaDeReuniao' });

const ItemDaSala = z
  .object({ id: z.uuid(), nome: z.string(), descricao: z.string().nullable(), situacao: Situacao })
  .meta({ id: 'ItemDaSala' });

const Cadastro = z
  .object({
    salas: z.array(Sala),
    itens: z.array(ItemDaSala),
    permite: z.object({ administrar: z.boolean() }),
  })
  .meta({ id: 'CadastroDasSalas' });

const PedidoDeSala = z
  .object({
    nome: z.string(),
    localId: z.string().nullable().optional(),
    capacidade: z.number().nullable().optional(),
    recursos: z.string().nullable().optional(),
  })
  .meta({ id: 'PedidoDeSala' });

const PedidoDeItem = z
  .object({ nome: z.string(), descricao: z.string().nullable().optional() })
  .meta({ id: 'PedidoDeItemDaSala' });

const Reserva = z
  .object({
    id: z.uuid(),
    sala: z.object({ id: z.uuid(), nome: z.string() }),
    inicio: z.iso.datetime(),
    fim: z.iso.datetime(),
    assunto: z.string(),
    situacao: z.enum(SITUACOES_DA_RESERVA_NO_BANCO),
    pedidaPor: z.object({ id: z.uuid(), nome: z.string() }),
    /** Só para quem pediu, os convidados e quem administra as salas. */
    comentario: z.string().nullable(),
    motivo: z.string().nullable(),
    participantes: z
      .array(
        z.object({
          conta: z.object({ id: z.uuid(), nome: z.string() }),
          resposta: z.enum(RESPOSTAS_DO_CONVITE_NO_BANCO),
        }),
      )
      .nullable(),
    itens: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    minhaResposta: z.enum(RESPOSTAS_DO_CONVITE_NO_BANCO).nullable(),
    permite: z.object({ aprovar: z.boolean(), cancelar: z.boolean(), responder: z.boolean() }),
  })
  .meta({ id: 'ReservaDeSala' });

const ListaDeReservas = z
  .object({ reservas: z.array(Reserva) })
  .meta({ id: 'ListaDeReservasDeSala' });

const Agenda = z
  .object({
    salas: z.array(Sala),
    reservas: z.array(Reserva),
    permite: z.object({ administrar: z.boolean() }),
  })
  .meta({ id: 'AgendaDasSalas' });

const FiltrosDaAgenda = z.object({
  de: z.iso.datetime({ error: 'Informe o começo do período.' }),
  ate: z.iso.datetime({ error: 'Informe o fim do período.' }),
});

const PedidoDeReserva = z
  .object({
    salaId: z.string(),
    inicio: z.string(),
    fim: z.string(),
    assunto: z.string(),
    comentario: z.string().nullable().optional(),
    participantes: z.array(z.string()).optional(),
    itens: z.array(z.string()).optional(),
  })
  .meta({ id: 'PedidoDeReservaDeSala' });

const PedidoDeRecusa = z.object({ motivo: z.string() }).meta({ id: 'PedidoDeRecusaDeReserva' });

const PedidoDeResposta = z
  .object({ resposta: z.enum(['aceitou', 'recusou']) })
  .meta({ id: 'PedidoDeRespostaAoConvite' });

const ParametrosDoId = z.object({ id: z.uuid({ error: 'Não encontrado.' }) });

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

/** Grava o registro, trocando o nome repetido pela recusa no campo do nome. */
async function semNomeRepetido<T>(
  gravar: () => Promise<T>,
  restricao: string,
  mensagem: string,
): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, restricao)) throw conflito(mensagem, { nome: mensagem });
    throw erro;
  }
}

export const rotasDasSalas: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  fila?: FilaDeTarefas;
}> = async (app, { banco, agora, fila }) => {
  const orgDa = (requisicao: { organizacao?: { id: string } | null }) =>
    requisicao.organizacao?.id ?? '';

  /** A reserva trancada, ou 404. */
  async function lerReserva(tx: Transacao, id: string): Promise<LinhaDaReserva> {
    const [linha] = await tx
      .select()
      .from(reservasDasSalas)
      .where(eq(reservasDasSalas.id, id))
      .for('update');
    if (!linha) throw naoEncontrado('Reserva não encontrada.');
    return linha;
  }

  const recusarSeMudou = (linha: LinhaDaReserva) => {
    if (linha.situacao !== 'pendente') throw conflito(jaMudou(linha.situacao));
  };

  // O cadastro: as salas e os itens, todos, para a Agenda, a Nova reserva e o Cadastro.
  app.get(
    '/salas',
    {
      config: { permissao: 'salas.ver' },
      schema: {
        summary: 'As salas e os itens solicitáveis da organização',
        response: { 200: Cadastro, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const arvore = await lerArvore(tx);
        return {
          salas: (await tx.select().from(salas).orderBy(asc(salas.nomeNormalizado))).map((sala) =>
            salaLida(sala, arvore),
          ),
          itens: (
            await tx.select().from(itensDasSalas).orderBy(asc(itensDasSalas.nomeNormalizado))
          ).map(itemLido),
          permite: { administrar: pode(acesso, 'salas.administrar') },
        };
      });
    },
  );

  /** Grava a sala nova ou a mudança, com o local conferido no banco. */
  async function gravarSala(
    requisicao: FastifyRequest,
    pedido: z.infer<typeof PedidoDeSala>,
    id?: string,
  ) {
    const { contaId } = sessaoDa(requisicao);
    const conferida = conferirSala(pedido);
    if (!conferida.ok) throw dadosInvalidos(conferida.erros as Record<string, string>);
    const { dados } = conferida;
    const momento = agora();
    return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
      const arvore = await lerArvore(tx);
      if (dados.localId) {
        const [local] = await tx
          .select({ id: locais.id })
          .from(locais)
          .where(and(eq(locais.id, dados.localId), eq(locais.situacao, 'ativo')));
        if (!local) throw dadosInvalidos({ local: MENSAGENS_DAS_SALAS.local });
      }
      const valores = {
        nome: dados.nome,
        nomeNormalizado: normalizarTexto(dados.nome),
        localId: dados.localId,
        capacidade: dados.capacidade,
        recursos: dados.recursos,
        atualizadoEm: momento,
      };
      const [antes] = id ? await tx.select().from(salas).where(eq(salas.id, id)) : [];
      if (id && !antes) throw naoEncontrado('Sala não encontrada.');
      const [linha] = await semNomeRepetido(
        () =>
          antes
            ? tx.update(salas).set(valores).where(eq(salas.id, antes.id)).returning()
            : tx
                .insert(salas)
                .values({ orgId: orgDa(requisicao), ...valores, criadoEm: momento })
                .returning(),
        'salas_nome_unico',
        MENSAGENS_DAS_SALAS.salaRepetida,
      );
      if (!linha) throw new Error('A sala não foi gravada.');
      await registrarNaAuditoria(tx, {
        acao: antes ? 'sala.alterada' : 'sala.criada',
        ator: { tipo: 'conta', contaId },
        alvo: { tipo: 'sala', id: linha.id },
        ...(antes ? { antes: salaLida(antes, arvore) } : {}),
        depois: salaLida(linha, arvore),
        origem: origemDa(requisicao),
        momento,
      });
      return salaLida(linha, arvore);
    });
  }

  app.post(
    '/salas',
    {
      config: { permissao: 'salas.administrar' },
      schema: {
        summary: 'Cadastrar uma sala',
        body: PedidoDeSala,
        response: { 201: Sala, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) =>
      resposta.code(201).send(await gravarSala(requisicao, requisicao.body)),
  );

  app.patch(
    '/salas/:id',
    {
      config: { permissao: 'salas.administrar' },
      schema: {
        summary: 'Editar uma sala',
        params: ParametrosDoId,
        body: PedidoDeSala,
        response: { 200: Sala, ...PROBLEMAS },
      },
    },
    async (requisicao) => gravarSala(requisicao, requisicao.body, requisicao.params.id),
  );

  /** Grava o item novo ou a mudança. */
  async function gravarItem(
    requisicao: FastifyRequest,
    pedido: z.infer<typeof PedidoDeItem>,
    id?: string,
  ) {
    const { contaId } = sessaoDa(requisicao);
    const conferido = conferirItemDaSala(pedido);
    if (!conferido.ok) throw dadosInvalidos(conferido.erros as Record<string, string>);
    const { dados } = conferido;
    const momento = agora();
    return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
      const valores = {
        nome: dados.nome,
        nomeNormalizado: normalizarTexto(dados.nome),
        descricao: dados.descricao,
        atualizadoEm: momento,
      };
      const [antes] = id
        ? await tx.select().from(itensDasSalas).where(eq(itensDasSalas.id, id))
        : [];
      if (id && !antes) throw naoEncontrado('Item não encontrado.');
      const [linha] = await semNomeRepetido(
        () =>
          antes
            ? tx
                .update(itensDasSalas)
                .set(valores)
                .where(eq(itensDasSalas.id, antes.id))
                .returning()
            : tx
                .insert(itensDasSalas)
                .values({ orgId: orgDa(requisicao), ...valores, criadoEm: momento })
                .returning(),
        'itens_das_salas_nome_unico',
        MENSAGENS_DAS_SALAS.itemRepetido,
      );
      if (!linha) throw new Error('O item não foi gravado.');
      await registrarNaAuditoria(tx, {
        acao: antes ? 'item-de-sala.alterado' : 'item-de-sala.criado',
        ator: { tipo: 'conta', contaId },
        alvo: { tipo: 'item-de-sala', id: linha.id },
        ...(antes ? { antes: itemLido(antes) } : {}),
        depois: itemLido(linha),
        origem: origemDa(requisicao),
        momento,
      });
      return itemLido(linha);
    });
  }

  app.post(
    '/salas/itens',
    {
      config: { permissao: 'salas.administrar' },
      schema: {
        summary: 'Cadastrar um item solicitável',
        body: PedidoDeItem,
        response: { 201: ItemDaSala, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) =>
      resposta.code(201).send(await gravarItem(requisicao, requisicao.body)),
  );

  app.patch(
    '/salas/itens/:id',
    {
      config: { permissao: 'salas.administrar' },
      schema: {
        summary: 'Editar um item solicitável',
        params: ParametrosDoId,
        body: PedidoDeItem,
        response: { 200: ItemDaSala, ...PROBLEMAS },
      },
    },
    async (requisicao) => gravarItem(requisicao, requisicao.body, requisicao.params.id),
  );

  // Inativar e reativar a sala e o item: a sala e o item inativos saem da Nova reserva.
  for (const [caminho, situacao] of [
    ['inativacao', 'inativo'],
    ['reativacao', 'ativo'],
  ] as const) {
    app.post(
      `/salas/:id/${caminho}`,
      {
        config: { permissao: 'salas.administrar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar uma sala' : 'Reativar uma sala',
          params: ParametrosDoId,
          response: { 200: Sala, ...PROBLEMAS },
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
          const arvore = await lerArvore(tx);
          const [linha] = await tx
            .update(salas)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(salas.id, requisicao.params.id))
            .returning();
          if (!linha) throw naoEncontrado('Sala não encontrada.');
          await registrarNaAuditoria(tx, {
            acao: situacao === 'inativo' ? 'sala.inativada' : 'sala.reativada',
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'sala', id: linha.id },
            dados: { nome: linha.nome },
            origem: origemDa(requisicao),
            momento,
          });
          return salaLida(linha, arvore);
        });
      },
    );
    app.post(
      `/salas/itens/:id/${caminho}`,
      {
        config: { permissao: 'salas.administrar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um item' : 'Reativar um item',
          params: ParametrosDoId,
          response: { 200: ItemDaSala, ...PROBLEMAS },
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
          const [linha] = await tx
            .update(itensDasSalas)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(itensDasSalas.id, requisicao.params.id))
            .returning();
          if (!linha) throw naoEncontrado('Item não encontrado.');
          await registrarNaAuditoria(tx, {
            acao: situacao === 'inativo' ? 'item-de-sala.inativado' : 'item-de-sala.reativado',
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'item-de-sala', id: linha.id },
            dados: { nome: linha.nome },
            origem: origemDa(requisicao),
            momento,
          });
          return itemLido(linha);
        });
      },
    );
  }

  // As contas ativas para convidar, pelo nome, a quem vê as salas, sem precisar ver as pessoas.
  app.get(
    '/salas/convidaveis',
    {
      config: { permissao: 'salas.ver' },
      schema: {
        summary: 'As contas ativas da organização que a reserva pode convidar, pelo nome',
        querystring: z.object({ busca: z.string().default('') }),
        response: {
          200: z
            .object({ contas: z.array(z.object({ id: z.uuid(), nome: z.string() })) })
            .meta({ id: 'ContasConvidaveis' }),
          ...PROBLEMAS,
        },
      },
    },
    async (requisicao) => {
      const busca = normalizarTexto(requisicao.query.busca.trim());
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => ({
        contas: await tx
          .select({ id: contas.id, nome: pessoas.nome })
          .from(contas)
          .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
          .where(
            and(
              eq(contas.situacao, 'ativa'),
              eq(pessoas.situacao, 'ativa'),
              ...(busca === '' ? [] : [sql`${pessoas.busca} like ${`%${busca}%`}`]),
            ),
          )
          .orderBy(asc(pessoas.nome))
          .limit(8),
      }));
    },
  );

  app.get(
    '/salas/agenda',
    {
      config: { permissao: 'salas.ver' },
      schema: {
        summary: 'As salas ativas e as reservas que ocupam o período',
        querystring: FiltrosDaAgenda,
        response: { 200: Agenda, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const de = new Date(requisicao.query.de);
      const ate = new Date(requisicao.query.ate);
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const arvore = await lerArvore(tx);
        const ativas = await tx
          .select()
          .from(salas)
          .where(eq(salas.situacao, 'ativo'))
          .orderBy(asc(salas.nomeNormalizado));
        const linhas = await tx
          .select()
          .from(reservasDasSalas)
          .where(
            and(
              inArray(reservasDasSalas.situacao, [...SITUACOES_QUE_OCUPAM]),
              lt(reservasDasSalas.inicio, ate),
              gt(reservasDasSalas.fim, de),
            ),
          )
          .orderBy(asc(reservasDasSalas.inicio));
        return {
          salas: ativas.map((sala) => salaLida(sala, arvore)),
          reservas: await reservasNaTela(tx, linhas, { contaId, acesso, agora: agora() }),
          permite: { administrar: pode(acesso, 'salas.administrar') },
        };
      });
    },
  );

  app.post(
    '/salas/reservas',
    {
      config: { permissao: 'salas.ver' },
      schema: {
        summary: 'Pedir a reserva de uma sala',
        body: PedidoDeReserva,
        response: { 201: Reserva, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const momento = agora();
      const conferida = conferirReserva(requisicao.body, { agora: momento, quemPede: contaId });
      if (!conferida.ok) throw dadosInvalidos(conferida.erros as Record<string, string>);
      const { dados } = conferida;
      const administra = pode(acesso, 'salas.administrar');
      const criada = await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const [sala] = await tx
          .select()
          .from(salas)
          .where(and(eq(salas.id, dados.salaId), eq(salas.situacao, 'ativo')));
        if (!sala) throw dadosInvalidos({ sala: MENSAGENS_DAS_SALAS.sala });
        if (dados.itens.length > 0) {
          const ativos = await tx
            .select({ id: itensDasSalas.id })
            .from(itensDasSalas)
            .where(
              and(inArray(itensDasSalas.id, dados.itens), eq(itensDasSalas.situacao, 'ativo')),
            );
          if (ativos.length !== dados.itens.length) {
            throw dadosInvalidos({ itens: MENSAGENS_DAS_SALAS.itens });
          }
        }
        if (dados.participantes.length > 0) {
          const daOrganizacao = await tx
            .select({ id: contas.id })
            .from(contas)
            .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
            .where(
              and(
                inArray(contas.id, dados.participantes),
                eq(contas.situacao, 'ativa'),
                eq(pessoas.situacao, 'ativa'),
              ),
            );
          if (daOrganizacao.length !== dados.participantes.length) {
            throw dadosInvalidos({ participantes: MENSAGENS_DAS_SALAS.participantes });
          }
        }
        await conferirHorarioLivre(tx, dados);
        const situacao = administra ? 'aprovada' : 'pendente';
        const [linha] = await tx
          .insert(reservasDasSalas)
          .values({
            orgId: orgDa(requisicao),
            salaId: dados.salaId,
            inicio: dados.inicio,
            fim: dados.fim,
            assunto: dados.assunto,
            comentario: dados.comentario,
            situacao,
            itens: dados.itens,
            pedidaPor: contaId,
            pedidaEm: momento,
            ...(administra ? { decididaPor: contaId, decididaEm: momento } : {}),
          })
          .returning();
        if (!linha) throw new Error('A reserva não foi gravada.');
        if (dados.participantes.length > 0) {
          await tx.insert(participantesDasReservas).values(
            dados.participantes.map((participante) => ({
              orgId: orgDa(requisicao),
              reservaId: linha.id,
              contaId: participante,
            })),
          );
        }
        await registrarNaAuditoria(tx, {
          acao: 'reserva-de-sala.pedida',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'reserva-de-sala', id: linha.id },
          depois: {
            sala: sala.nome,
            quando: quando(dados.inicio, dados.fim),
            assunto: dados.assunto,
            situacao,
            participantes: dados.participantes.length,
          },
          origem: origemDa(requisicao),
          momento,
        });
        const titulo = `${sala.nome}, ${quando(dados.inicio, dados.fim)}`;
        if (administra) {
          await notificarSobreASala(
            tx,
            dados.participantes,
            {
              titulo: `Reserva aprovada: ${dados.assunto}, ${titulo}`,
              descricao: null,
              destino: '/salas/minhas',
            },
            momento,
            fila,
          );
        } else {
          await notificarSobreASala(
            tx,
            await quemAdministraAsSalas(tx),
            {
              titulo: `Pedido de reserva: ${titulo}`,
              descricao: dados.assunto,
              destino: '/salas/pedidos',
            },
            momento,
            fila,
          );
        }
        return reservaNaTela(tx, linha, { contaId, acesso, agora: momento });
      });
      return resposta.code(201).send(criada);
    },
  );

  app.get(
    '/salas/reservas/minhas',
    {
      config: { permissao: 'salas.ver' },
      schema: {
        summary: 'As reservas que a conta pediu e os convites dela, que ainda não terminaram',
        response: { 200: ListaDeReservas, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const convidadas = tx
          .select({ id: participantesDasReservas.reservaId })
          .from(participantesDasReservas)
          .where(eq(participantesDasReservas.contaId, contaId));
        const linhas = await tx
          .select()
          .from(reservasDasSalas)
          .where(
            and(
              gt(reservasDasSalas.fim, momento),
              or(eq(reservasDasSalas.pedidaPor, contaId), inArray(reservasDasSalas.id, convidadas)),
            ),
          )
          .orderBy(asc(reservasDasSalas.inicio));
        return { reservas: await reservasNaTela(tx, linhas, { contaId, acesso, agora: momento }) };
      });
    },
  );

  app.get(
    '/salas/reservas/pendentes',
    {
      config: { permissao: 'salas.administrar' },
      schema: {
        summary: 'As reservas aguardando aprovação, da mais próxima para a mais distante',
        response: { 200: ListaDeReservas, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const linhas = await tx
          .select()
          .from(reservasDasSalas)
          .where(and(eq(reservasDasSalas.situacao, 'pendente'), gt(reservasDasSalas.fim, momento)))
          .orderBy(asc(reservasDasSalas.inicio));
        return { reservas: await reservasNaTela(tx, linhas, { contaId, acesso, agora: momento }) };
      });
    },
  );

  /** Os participantes de uma reserva, para as notificações. */
  const participantesDa = async (tx: Transacao, reservaId: string) =>
    (
      await tx
        .select({ contaId: participantesDasReservas.contaId })
        .from(participantesDasReservas)
        .where(eq(participantesDasReservas.reservaId, reservaId))
    ).map(({ contaId }) => contaId);

  const nomeDaSala = async (tx: Transacao, salaId: string) =>
    (await tx.select({ nome: salas.nome }).from(salas).where(eq(salas.id, salaId)))[0]?.nome ?? '';

  app.post(
    '/salas/reservas/:id/aprovacao',
    {
      config: { permissao: 'salas.administrar' },
      schema: {
        summary: 'Aprovar uma reserva',
        params: ParametrosDoId,
        response: { 200: Reserva, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const antes = await lerReserva(tx, requisicao.params.id);
        recusarSeMudou(antes);
        const [depois] = await tx
          .update(reservasDasSalas)
          .set({ situacao: 'aprovada', decididaPor: contaId, decididaEm: momento })
          .where(eq(reservasDasSalas.id, antes.id))
          .returning();
        if (!depois) throw new Error('A reserva não foi aprovada.');
        await registrarNaAuditoria(tx, {
          acao: 'reserva-de-sala.aprovada',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'reserva-de-sala', id: antes.id },
          dados: { assunto: antes.assunto },
          origem: origemDa(requisicao),
          momento,
        });
        await notificarSobreASala(
          tx,
          [antes.pedidaPor, ...(await participantesDa(tx, antes.id))],
          {
            titulo: `Reserva aprovada: ${antes.assunto}, ${await nomeDaSala(tx, antes.salaId)}, ${quando(antes.inicio, antes.fim)}`,
            descricao: null,
            destino: '/salas/minhas',
          },
          momento,
          fila,
        );
        return reservaNaTela(tx, depois, { contaId, acesso, agora: momento });
      });
    },
  );

  app.post(
    '/salas/reservas/:id/recusa',
    {
      config: { permissao: 'salas.administrar' },
      schema: {
        summary: 'Recusar uma reserva, com o motivo',
        params: ParametrosDoId,
        body: PedidoDeRecusa,
        response: { 200: Reserva, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const motivo = requisicao.body.motivo.trim();
      if (motivo === '') throw dadosInvalidos({ motivo: 'Informe o motivo.' });
      if (motivo.length > 300)
        throw dadosInvalidos({ motivo: 'Use até 300 caracteres no motivo.' });
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const antes = await lerReserva(tx, requisicao.params.id);
        recusarSeMudou(antes);
        const [depois] = await tx
          .update(reservasDasSalas)
          .set({ situacao: 'recusada', decididaPor: contaId, decididaEm: momento, motivo })
          .where(eq(reservasDasSalas.id, antes.id))
          .returning();
        if (!depois) throw new Error('A reserva não foi recusada.');
        await registrarNaAuditoria(tx, {
          acao: 'reserva-de-sala.recusada',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'reserva-de-sala', id: antes.id },
          dados: { assunto: antes.assunto, motivo },
          origem: origemDa(requisicao),
          momento,
        });
        await notificarSobreASala(
          tx,
          [antes.pedidaPor],
          {
            titulo: `Reserva recusada: ${antes.assunto}`,
            descricao: motivo,
            destino: '/salas/minhas',
          },
          momento,
          fila,
        );
        return reservaNaTela(tx, depois, { contaId, acesso, agora: momento });
      });
    },
  );

  app.post(
    '/salas/reservas/:id/cancelamento',
    {
      config: { permissao: 'salas.ver' },
      schema: {
        summary: 'Cancelar uma reserva: quem pediu ou quem administra as salas',
        params: ParametrosDoId,
        response: { 200: Reserva, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const antes = await lerReserva(tx, requisicao.params.id);
        if (antes.pedidaPor !== contaId && !pode(acesso, 'salas.administrar')) {
          throw naoEncontrado('Reserva não encontrada.');
        }
        if (!SITUACOES_QUE_OCUPAM.includes(antes.situacao)) {
          throw conflito(jaMudou(antes.situacao as 'recusada' | 'cancelada'));
        }
        if (antes.fim <= momento) throw conflito('Esta reserva já terminou.');
        const [depois] = await tx
          .update(reservasDasSalas)
          .set({ situacao: 'cancelada' })
          .where(eq(reservasDasSalas.id, antes.id))
          .returning();
        if (!depois) throw new Error('A reserva não foi cancelada.');
        await registrarNaAuditoria(tx, {
          acao: 'reserva-de-sala.cancelada',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'reserva-de-sala', id: antes.id },
          dados: { assunto: antes.assunto },
          origem: origemDa(requisicao),
          momento,
        });
        if (antes.situacao === 'aprovada') {
          await notificarSobreASala(
            tx,
            await participantesDa(tx, antes.id),
            {
              titulo: `Reserva cancelada: ${antes.assunto}`,
              descricao: null,
              destino: '/salas/minhas',
            },
            momento,
            fila,
          );
        }
        return reservaNaTela(tx, depois, { contaId, acesso, agora: momento });
      });
    },
  );

  app.post(
    '/salas/reservas/:id/resposta',
    {
      config: { permissao: 'salas.ver' },
      schema: {
        summary: 'Responder ao convite de uma reserva',
        params: ParametrosDoId,
        body: PedidoDeResposta,
        response: { 200: Reserva, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const reserva = await lerReserva(tx, requisicao.params.id);
        const [convite] = await tx
          .update(participantesDasReservas)
          .set({ resposta: requisicao.body.resposta, respondidoEm: momento })
          .where(
            and(
              eq(participantesDasReservas.reservaId, reserva.id),
              eq(participantesDasReservas.contaId, contaId),
            ),
          )
          .returning();
        if (!convite) throw naoEncontrado('Convite não encontrado.');
        if (!SITUACOES_QUE_OCUPAM.includes(reserva.situacao) || reserva.fim <= momento) {
          throw conflito('Esta reserva não aceita mais respostas.');
        }
        await registrarNaAuditoria(tx, {
          acao: 'convite-de-reserva.respondido',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'reserva-de-sala', id: reserva.id },
          dados: { resposta: requisicao.body.resposta },
          origem: origemDa(requisicao),
          momento,
        });
        return reservaNaTela(tx, reserva, { contaId, acesso, agora: momento });
      });
    },
  );
};
