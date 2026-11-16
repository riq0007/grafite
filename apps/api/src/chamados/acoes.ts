// As ações que mudam quem atende (spec chamados, "Ações do atendimento", "Situação e quem atende",
// "Conversa do chamado" e "Notificações dos chamados"; change chamados-da-ti, design, decisão 4, e
// tarefa 4.12): assumir, passar, devolver à triagem e desfazer o assumir, numa transação:
// - o chamado, travado (`for update`) e lido para o domínio, com os locais pelo caminho, a pessoa
//   pelo nome e o desde: o de quem atende ou, sem ninguém, o da triagem, pelos eventos da conversa;
// - a conta escolhida do passar e, no desfazer, o estado de antes do assumir, do último evento que
//   sobe a versão, com a conta de antes como está agora;
// - a decisão do domínio, com a versão primeiro: a recusa da versão e o "mudou" do desfazer saem
//   como o `chamado-mudou`, e as outras, como o conflito da abertura;
// - o chamado, o evento na conversa, a auditoria com o `chamados.mudaram` e as notificações.
// As quatro mudam quem atende e nenhuma mexe no relógio nem escreve à pessoa (a matriz): a versão
// sobe sempre, e o relógio e a primeira resposta ficam como estavam.
import { chamados, mensagensDosChamados, pessoas, type Transacao } from '@grafite/db';
import {
  type AcaoDaAuditoria,
  type AcaoQueNotifica,
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  antesDoAssumir,
  type ChamadoParaAcao,
  type DecisaoDaAcao,
  decidirAcao,
  decidirDesfazer,
  desdeDeQuemAtende,
  desdeNaTriagem,
  type EventoNaConversa,
  mensagemDaRecusaDaAcao,
  notificacoesDaAcao,
  type QuemAge,
  type RecusaDaAcao,
  type SituacaoDoChamado,
  veOChamado,
} from '@grafite/domain';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { chamadoMudou, conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { chamadoNaoEncontrado, publicoDoChamado } from './alcance.ts';
import { contasDaTriagem, lerContaQueAtende, nomeDaConta } from './quem-atende.ts';

/** O pedido de cada rota, depois do schema: a versão que a tela mostra e a conta escolhida. */
export type PedidoQueMudaQuemAtende =
  | { acao: 'assumir' | 'devolver'; versao?: number | undefined }
  | { acao: 'passar'; para: string; versao?: number | undefined }
  | { acao: 'desfazer'; versao: number };

export type AcaoQueMudaQuemAtende = PedidoQueMudaQuemAtende['acao'];

/** O chamado depois da ação: a versão, que o "Desfazer" do aviso do assumir manda, e quem atende. */
export interface ChamadoDepoisDaAcao {
  numero: number;
  versao: number;
  situacao: SituacaoDoChamado;
  responsavel: { id: string; nome: string } | null;
}

export const RECUSAS_DAS_ACOES = {
  semConta: 'Escolha para quem passar.',
  contaNaoEncontrada: 'Conta não encontrada.',
  versaoInvalida: 'Versão do chamado inválida.',
} as const;

const NA_AUDITORIA = {
  assumir: 'chamado.assumido',
  passar: 'chamado.passado',
  devolver: 'chamado.devolvido',
  desfazer: 'chamado.assumir-desfeito',
} as const satisfies Record<AcaoQueMudaQuemAtende, AcaoDaAuditoria>;

/** O chamado pelo número, travado até o fim da ação, se a conta o vê; senão, o que não existe. */
async function travarOChamado(
  tx: Transacao,
  numero: number,
  acesso: Acesso,
  arvore: ArvoreDeLocais,
) {
  const [chamado] = await tx
    .select({
      id: chamados.id,
      numero: chamados.numero,
      titulo: chamados.titulo,
      situacao: chamados.situacao,
      responsavel: chamados.responsavelId,
      responsavelDesde: chamados.responsavelDesde,
      abertoEm: chamados.abertoEm,
      locais: chamados.locais,
      semLocal: chamados.semLocal,
      versao: chamados.versao,
      primeiraRespostaEm: chamados.primeiraRespostaEm,
      pessoa: pessoas.nome,
    })
    .from(chamados)
    .innerJoin(pessoas, eq(pessoas.id, chamados.pessoaId))
    .where(eq(chamados.numero, numero))
    .for('update', { of: chamados });
  if (!chamado || !veOChamado(alcance(acesso, 'chamados.ver', arvore), chamado)) {
    throw chamadoNaoEncontrado();
  }
  return chamado;
}

/**
 * Os eventos da conversa, na ordem, como o "desde" os lê: a mensagem e a nota não contam nele e
 * ficam de fora da consulta.
 */
const eventosDoChamado = (tx: Transacao, chamadoId: string): Promise<EventoNaConversa[]> =>
  tx
    .select({
      evento: mensagensDosChamados.evento,
      dados: mensagensDosChamados.dados,
      autor: mensagensDosChamados.autorConta,
      em: mensagensDosChamados.criadaEm,
    })
    .from(mensagensDosChamados)
    .where(
      and(eq(mensagensDosChamados.chamadoId, chamadoId), isNotNull(mensagensDosChamados.evento)),
    )
    .orderBy(asc(mensagensDosChamados.criadaEm), asc(mensagensDosChamados.id));

/** A decisão do domínio, com a conta escolhida do passar e o estado de antes do desfazer. */
async function decidir(
  tx: Transacao,
  chamado: ChamadoParaAcao,
  quemAge: QuemAge,
  pedido: PedidoQueMudaQuemAtende,
  { eventos, arvore }: { eventos: readonly EventoNaConversa[]; arvore: ArvoreDeLocais },
): Promise<DecisaoDaAcao> {
  switch (pedido.acao) {
    case 'passar': {
      const para = await lerContaQueAtende(tx, pedido.para, arvore);
      if (!para) throw dadosInvalidos({ para: RECUSAS_DAS_ACOES.contaNaoEncontrada });
      return decidirAcao(chamado, quemAge, { acao: 'passar', para, versao: pedido.versao });
    }
    case 'desfazer': {
      const antes = antesDoAssumir(eventos, quemAge.id, chamado.situacao);
      const responsavel = antes?.de ? await lerContaQueAtende(tx, antes.de, arvore) : null;
      return decidirDesfazer(chamado, quemAge, {
        versao: pedido.versao,
        antes: antes && { situacao: antes.situacao, responsavel, desde: antes.desde },
      });
    }
    case 'assumir':
    case 'devolver':
      return decidirAcao(chamado, quemAge, { acao: pedido.acao, versao: pedido.versao });
  }
}

/** A recusa da versão e o "mudou" do desfazer pedem que a tela releia o chamado; o resto conflita. */
function problemaDaRecusa(numero: number, recusa: RecusaDaAcao) {
  const frase = mensagemDaRecusaDaAcao(numero, recusa);
  return recusa.motivo === 'versao' || recusa.motivo === 'mudou'
    ? chamadoMudou(frase)
    : conflito(frase);
}

/** A situação e quem atende, pelo nome, como a auditoria os mostra. */
const naAuditoria = (situacao: SituacaoDoChamado, responsavel: string | null) =>
  responsavel === null ? { situacao } : { situacao, responsavel };

/**
 * Faz a ação e devolve o chamado depois dela. Com a fila, as notificações vão também pelo e-mail e
 * pelo push.
 */
export async function mudarQuemAtende(
  tx: Transacao,
  numero: number,
  pedido: PedidoQueMudaQuemAtende,
  {
    requisicao,
    momento,
    enviar,
  }: { requisicao: FastifyRequest; momento: Date; enviar?: EnviarTarefa },
): Promise<ChamadoDepoisDaAcao> {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const lido = await travarOChamado(tx, numero, acesso, arvore);
  const eventos = await eventosDoChamado(tx, lido.id);
  const chamado: ChamadoParaAcao = {
    numero: lido.numero,
    situacao: lido.situacao,
    responsavel: lido.responsavel,
    desde: lido.responsavelDesde ?? desdeNaTriagem(lido.abertoEm, eventos),
    pessoa: lido.pessoa,
    locais: lido.locais.map((id) => ({ id, nome: arvore.caminho(id) })),
    semLocal: lido.semLocal,
    versao: lido.versao,
    primeiraRespostaEm: lido.primeiraRespostaEm,
  };
  const quemAge = { id: contaId, alcance: alcance(acesso, 'chamados.atender', arvore) };
  const decisao = await decidir(tx, chamado, quemAge, pedido, { eventos, arvore });
  if (!decisao.aceita) throw problemaDaRecusa(lido.numero, decisao.recusa);

  const versao = lido.versao + 1;
  await tx
    .update(chamados)
    .set({
      situacao: decisao.situacao,
      responsavelId: decisao.responsavel,
      responsavelDesde: desdeDeQuemAtende(chamado, decisao, momento),
      versao,
    })
    .where(eq(chamados.id, lido.id));
  await tx.insert(mensagensDosChamados).values(
    decisao.conversa.map((entrada) => ({
      orgId: sql`app.current_org()`,
      chamadoId: lido.id,
      autorConta: contaId,
      criadaEm: momento,
      ...entrada,
    })),
  );

  const nomeAntes = lido.responsavel === null ? null : await nomeDaConta(tx, lido.responsavel);
  const responsavel =
    decisao.responsavel === null
      ? null
      : { id: decisao.responsavel, nome: await nomeDaConta(tx, decisao.responsavel) };
  const locais = { locais: lido.locais, semLocal: lido.semLocal };
  await registrarNaAuditoria(tx, {
    acao: NA_AUDITORIA[pedido.acao],
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'chamado', id: lido.id },
    antes: naAuditoria(lido.situacao, nomeAntes),
    depois: naAuditoria(decisao.situacao, responsavel?.nome ?? null),
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDoChamado(locais) },
  });

  const comoNotifica: AcaoQueNotifica =
    pedido.acao === 'passar'
      ? { acao: 'passar', para: pedido.para }
      : pedido.acao === 'devolver'
        ? { acao: 'devolver', contas: await contasDaTriagem(tx, arvore) }
        : { acao: pedido.acao };
  await notificar(
    tx,
    notificacoesDaAcao({ numero: lido.numero, titulo: lido.titulo, locais }, comoNotifica, contaId),
    momento,
    enviar ? { enviar } : {},
  );
  return { numero: lido.numero, versao, situacao: decisao.situacao, responsavel };
}
