// Pedir toner (spec chamados, "OS e solicitação pelo chamado"; solicitacoes, "Solicitação pelo
// chamado"; change chamados-da-ti, design, "Pedir toner (tarefa 4.17)"), numa transação, em dois
// passos na mesma rota:
// - o módulo Operação desligado responde o 403 dele antes de tudo, como o "Virar OS";
// - o chamado, travado como nas ações (`travarParaMudar`), se a conta o vê; senão, o que não existe;
// - as recusas do chamado, do domínio (`recusaDoPedirToner`), no 409;
// - a trava da impressora (`toner:<impressora>`), a mesma da solicitação gerada pelo tipo na
//   abertura, para dois pedidos dela não registrarem duas solicitações, e as recusas e a permissão
//   do registro (`conferirImpressora` e `exigirAtender`), com e sem a pendente;
// - sem o registro, o chamado se junta à pendente ou recebe o registro do Toner com a cor do chamado
//   (`corDoToner`), sem gravar nada; com ele, o registro de hoje (`registrar`) grava a solicitação;
// - o chamado guarda a solicitação, a conversa ganha o evento `solicitacao`, que não sobe a versão,
//   e a auditoria, o `chamado.pediu-toner`, com o `chamados.mudaram` pela saída dela. Nada notifica.
import {
  ativos,
  chamados,
  estadoDosAtivos,
  impressorasDasSolicitacoes,
  mensagensDosChamados,
  solicitacoes,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type CampoDoFormulario,
  type CorDeConsumivel,
  corDoToner,
  locaisDaSolicitacao,
  mensagemDaRecusaDoPedirToner,
  recusaDoPedirToner,
  SITUACOES_PENDENTES,
  type SituacaoDaSolicitacao,
  tintaDoSuprimento,
} from '@grafite/domain';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { exigirLigadoNaTransacao } from '../acesso/modulos.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { compativeisDoModelo } from '../consumiveis/compativeis.ts';
import { registrarEvento } from '../eventos/saida.ts';
import { conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import type { PedidoDoToner } from '../solicitacoes/esquemas.ts';
import {
  type AtivoConferido,
  comoDados,
  conferirImpressora,
  exigirAtender,
  identificacao,
  publicoDosLocais,
  registrar,
} from '../solicitacoes/registro.ts';
import { travar } from '../travas.ts';
import { type ChamadoTravado, travarParaMudar } from './acoes.ts';
import { publicoDoChamado } from './alcance.ts';
import { formularioDa } from './formulario.ts';

/** O pedido do "Pedir toner": sem o registro, o primeiro passo; com ele, a gravação. */
export interface PedidoDoPedirToner {
  registro?: z.infer<typeof PedidoDoToner> | undefined;
}

/** O registro do Toner que a tela abre: a pessoa do chamado, a impressora e o item da cor dele. */
export interface RegistroDoToner {
  tipo: 'toner';
  pessoa: string;
  observacao: string | null;
  impressoras: string[];
  itens: { impressora: string; cor: CorDeConsumivel; quantidade: number; consumivel: null }[];
}

export type ResultadoDoPedirToner =
  | { resultado: 'juntou'; solicitacao: { numero: number } }
  | { resultado: 'pediu'; solicitacao: { numero: number } }
  | { resultado: 'registro'; registro: RegistroDoToner };

interface Contexto {
  requisicao: FastifyRequest;
  momento: Date;
}

/**
 * A solicitação pendente, com os locais, para o público do evento dela, e a situação, para o resumo
 * do ativo no chamado.
 */
export interface Pendente {
  id: string;
  numero: number;
  situacao: SituacaoDaSolicitacao;
  locais: string[];
  semLocal: boolean;
}

/**
 * A solicitação de Toner pendente com a impressora: a de menor número, também a que a conta não vê.
 * Quem decide por ela segura antes a trava da impressora (`travarAImpressora`).
 */
export async function pendenteDa(tx: Transacao, impressoraId: string): Promise<Pendente | null> {
  const [pendente] = await tx
    .select({
      id: solicitacoes.id,
      numero: solicitacoes.numero,
      situacao: solicitacoes.situacao,
      locais: solicitacoes.locais,
      semLocal: solicitacoes.semLocal,
    })
    .from(solicitacoes)
    .innerJoin(
      impressorasDasSolicitacoes,
      eq(impressorasDasSolicitacoes.solicitacaoId, solicitacoes.id),
    )
    .where(
      and(
        eq(solicitacoes.tipo, 'toner'),
        inArray(solicitacoes.situacao, [...SITUACOES_PENDENTES]),
        eq(impressorasDasSolicitacoes.ativoId, impressoraId),
      ),
    )
    .orderBy(asc(solicitacoes.numero))
    .limit(1);
  return pendente ?? null;
}

/**
 * O nível medido de cada suprimento na última leitura válida, com a tinta pela descrição: só no
 * tipo que liga a coleta dos suprimentos, como o painel deles.
 */
async function leiturasDa(tx: Transacao, impressoraId: string) {
  const linhas = await tx
    .select({
      descricao: sql<string | null>`${estadoDosAtivos.detalhes} ->> 'descricao'`,
      percentual: estadoDosAtivos.valorNumero,
    })
    .from(estadoDosAtivos)
    .innerJoin(ativos, eq(ativos.id, estadoDosAtivos.ativoId))
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .where(
      and(
        eq(estadoDosAtivos.ativoId, impressoraId),
        eq(estadoDosAtivos.metrica, 'impressora.suprimento'),
        eq(estadoDosAtivos.situacao, 'valida'),
        isNotNull(estadoDosAtivos.valorNumero),
        sql`'snmp.suprimentos' = any(${tiposDeAtivo.capacidades})`,
      ),
    );
  return linhas.flatMap(({ descricao, percentual }) =>
    percentual === null ? [] : [{ tinta: tintaDoSuprimento(descricao ?? ''), percentual }],
  );
}

/**
 * A trava da impressora: o "Pedir toner" e a abertura do Toner decidem pela pendente um de cada vez.
 * A abertura já tem a impressora travada para leitura, e subir essa trava para a de escrita faria
 * duas aberturas esperarem uma pela outra até o PostgreSQL derrubar uma.
 */
export const travarAImpressora = (tx: Transacao, impressoraId: string) =>
  travar(tx, `toner:${impressoraId}`);

/**
 * A cor do chamado para a impressora (`corDoToner`): a respondida no formulário, a mais baixa na
 * leitura ou o preto, pelas cores dos compatíveis do modelo dela.
 */
export async function corDaImpressora(
  tx: Transacao,
  impressora: Pick<AtivoConferido, 'id' | 'modeloId'>,
  {
    campos,
    respostas,
  }: { campos: readonly CampoDoFormulario[]; respostas: Readonly<Record<string, unknown>> },
): Promise<CorDeConsumivel> {
  const compativeis =
    impressora.modeloId === null ? [] : await compativeisDoModelo(tx, impressora.modeloId);
  return corDoToner({
    campos,
    respostas,
    cores: compativeis.flatMap(({ cor }) => (cor === null ? [] : [cor])),
    leituras: await leiturasDa(tx, impressora.id),
  });
}

/** Liga o chamado à solicitação: a coluna, o evento da conversa e a auditoria. */
async function ligar(
  tx: Transacao,
  { lido, contaId }: { lido: ChamadoTravado; contaId: string },
  solicitacao: { id: string; numero: number },
  como: 'juntou' | 'pediu',
  { requisicao, momento }: Contexto,
) {
  await tx.update(chamados).set({ solicitacaoId: solicitacao.id }).where(eq(chamados.id, lido.id));
  await tx.insert(mensagensDosChamados).values({
    orgId: sql`app.current_org()`,
    chamadoId: lido.id,
    especie: 'evento',
    autorConta: contaId,
    criadaEm: momento,
    evento: 'solicitacao',
    dados: { numero: solicitacao.numero, como },
  });
  await registrarNaAuditoria(tx, {
    acao: 'chamado.pediu-toner',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'chamado', id: lido.id },
    depois: { solicitacao: solicitacao.numero, como },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDoChamado(lido) },
  });
}

/** Junta o chamado à pendente, devolve o registro do Toner ou grava a solicitação nova. */
export async function pedirToner(
  tx: Transacao,
  numero: number,
  pedido: PedidoDoPedirToner,
  contexto: Contexto,
): Promise<ResultadoDoPedirToner> {
  await exigirLigadoNaTransacao(tx, 'operacao');
  const { requisicao } = contexto;
  const { acesso, contaId, arvore, lido, quemAge } = await travarParaMudar(tx, numero, requisicao);
  const [extra] = await tx
    .select({
      pessoa: chamados.pessoaId,
      formulario: chamados.formulario,
      respostas: chamados.respostas,
      solicitacao: solicitacoes.numero,
    })
    .from(chamados)
    .leftJoin(solicitacoes, eq(solicitacoes.id, chamados.solicitacaoId))
    .where(eq(chamados.id, lido.id));
  if (!extra) throw new Error('O chamado não foi lido.');
  const recusa = recusaDoPedirToner(
    {
      numero: lido.numero,
      situacao: lido.situacao,
      locais: lido.locais.map((id) => ({ id, nome: arvore.caminho(id) })),
      semLocal: lido.semLocal,
      solicitacao: extra.solicitacao,
      ativo: lido.ativo,
    },
    quemAge,
  );
  if (recusa) throw conflito(mensagemDaRecusaDoPedirToner(lido.numero, recusa));
  const impressoraId = lido.ativo;
  if (impressoraId === null) throw new Error('O chamado sem o ativo passou da recusa.');

  // A impressora travada: o segundo pedido dela espera este terminar e encontra a pendente.
  await travarAImpressora(tx, impressoraId);
  const leitor = { acesso, arvore };
  const conferencia = await conferirImpressora(tx, impressoraId, leitor);
  if (!('impressora' in conferencia)) {
    const campos = { 'impressoras.0': conferencia.mensagem };
    throw conferencia.recusa === 'inativa'
      ? conflito(conferencia.mensagem, campos)
      : dadosInvalidos(campos);
  }
  const { impressora } = conferencia;
  exigirAtender(requisicao, locaisDaSolicitacao([impressora.localId]), arvore);
  const pendente = await pendenteDa(tx, impressoraId);
  const ligacao = { lido, contaId };

  if (pedido.registro === undefined) {
    if (pendente) {
      await ligar(tx, ligacao, pendente, 'juntou', contexto);
      // A solicitação ganhou um chamado: o evento vai também a quem a vê.
      await registrarEvento(tx, {
        tipo: 'solicitacoes.mudaram',
        alvo: { tipo: 'solicitacao', id: pendente.id },
        publico: { permissao: 'solicitacoes.ver', locais: publicoDosLocais(pendente) },
      });
      return { resultado: 'juntou', solicitacao: { numero: pendente.numero } };
    }
    const cor = await corDaImpressora(tx, impressora, {
      campos: formularioDa({ formulario: extra.formulario }).campos,
      respostas: extra.respostas,
    });
    return {
      resultado: 'registro',
      registro: {
        tipo: 'toner',
        pessoa: extra.pessoa,
        observacao: null,
        impressoras: [impressoraId],
        itens: [{ impressora: impressoraId, cor, quantidade: 1, consumivel: null }],
      },
    };
  }

  if (!(pedido.registro.impressoras ?? []).includes(impressoraId)) {
    throw dadosInvalidos({
      impressoras: `A solicitação do chamado leva a impressora dele, ${identificacao(impressora)}.`,
    });
  }
  if (pendente) {
    throw conflito(
      `A ${identificacao(impressora)} já está na solicitação ${pendente.numero}: peça o toner de novo para o chamado se juntar a ela.`,
    );
  }
  const nova = await registrar(tx, comoDados(pedido.registro), contexto);
  await ligar(tx, ligacao, nova, 'pediu', contexto);
  return { resultado: 'pediu', solicitacao: { numero: nova.numero } };
}
