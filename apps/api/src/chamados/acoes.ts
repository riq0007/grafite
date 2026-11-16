// As ações do atendimento (spec chamados, "Ações do atendimento", "Situação e quem atende",
// "Conversa do chamado" e "Notificações dos chamados"; change chamados-da-ti, design, decisões 3, 4 e
// 10, e tarefas 4.12 e 4.13), gravadas por um lugar só, o `agirNoChamado`, numa transação:
// - o chamado, travado (`for update`) e lido para o domínio, com os locais pelo caminho, a pessoa
//   pelo nome e o desde: o de quem atende ou, sem ninguém, o da triagem, pelos eventos da conversa;
// - a conta escolhida do passar e, no desfazer, o estado de antes do assumir, do último evento que
//   sobe a versão, com a conta de antes como está agora;
// - a decisão do domínio, com a versão primeiro: a recusa da versão e o "mudou" do desfazer saem
//   como o `chamado-mudou`; a do texto e a dos anexos, como o 400 no campo, como as do formulário; e
//   as outras, como o conflito da abertura;
// - o horário da TI, só quando a ação para ou volta o relógio, lido depois da trava do chamado: a
//   troca do horário que travou o chamado antes já fechou o relógio dele pelo horário antigo, e a
//   ação conta desde a troca pelo novo (decisão 3);
// - o chamado, com o relógio, a primeira resposta e a versão, que sobe só quando a situação ou quem
//   atende muda; a conversa, uma linha por vez, na ordem da mudança, com os anexos tomados para a
//   mensagem ou a nota; a auditoria, com o `chamados.mudaram`, das ações que mudam a situação ou quem
//   atende, e só o `chamados.mudaram` das outras; e as notificações.
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
  type EntradaDaConversa,
  type EventoNaConversa,
  mensagemDaRecusaDaAcao,
  modoDoPrazoGuardado,
  notificacoesDaAcao,
  type QuemAge,
  type RecusaDaAcao,
  relogioDepois,
  type SituacaoDoChamado,
  veOChamado,
} from '@grafite/domain';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { registrarEvento } from '../eventos/saida.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { chamadoMudou, conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { chamadoNaoEncontrado, publicoDoChamado } from './alcance.ts';
import { tomarAnexos } from './anexos.ts';
import { lerHorarioDaTi } from './horario.ts';
import { contasDaTriagem, lerContaQueAtende, nomeDaConta } from './quem-atende.ts';

/**
 * O pedido de cada rota, depois do schema: a versão que a tela mostra e a conta escolhida, nas ações
 * que mudam quem atende; o texto e os ids dos anexos, já conferidos como UUID, na conversa.
 */
export type PedidoDoAtendimento =
  | { acao: 'assumir' | 'devolver'; versao?: number | undefined }
  | { acao: 'passar'; para: string; versao?: number | undefined }
  | { acao: 'desfazer'; versao: number }
  | {
      acao: 'mensagem' | 'esperar' | 'nota';
      texto: string;
      anexos?: readonly string[] | undefined;
    };

export type AcaoDoAtendimento = PedidoDoAtendimento['acao'];

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

/**
 * A ação na auditoria, quando ela muda a situação ou quem atende. A mensagem e a nota nunca mudam,
 * e o "Enviar e esperar" no chamado que já aguarda vale como a mensagem: as três só avisam as telas.
 */
const NA_AUDITORIA = {
  assumir: 'chamado.assumido',
  passar: 'chamado.passado',
  devolver: 'chamado.devolvido',
  desfazer: 'chamado.assumir-desfeito',
  esperar: 'chamado.aguardando',
  mensagem: null,
  nota: null,
} as const satisfies Record<AcaoDoAtendimento, AcaoDaAuditoria | null>;

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
      prazo: chamados.prazo,
      contadoS: chamados.contadoS,
      relogioDesde: chamados.relogioDesde,
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
  pedido: PedidoDoAtendimento,
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
    case 'mensagem':
    case 'esperar':
    case 'nota':
      return decidirAcao(chamado, quemAge, {
        acao: pedido.acao,
        texto: pedido.texto,
        anexos: pedido.anexos?.length ?? 0,
      });
  }
}

/**
 * A recusa da versão e o "mudou" do desfazer pedem que a tela releia o chamado; a do texto e a dos
 * anexos aparecem no campo, como as do formulário; o resto conflita.
 */
function problemaDaRecusa(numero: number, recusa: RecusaDaAcao) {
  const frase = mensagemDaRecusaDaAcao(numero, recusa);
  switch (recusa.motivo) {
    case 'versao':
    case 'mudou':
      return chamadoMudou(frase);
    case 'sem-texto':
    case 'texto-longo':
      return dadosInvalidos({ texto: frase });
    case 'anexos-demais':
      return dadosInvalidos({ anexos: frase });
    default:
      return conflito(frase);
  }
}

/** A situação e quem atende, pelo nome, como a auditoria os mostra. */
const naAuditoria = (situacao: SituacaoDoChamado, responsavel: string | null) =>
  responsavel === null ? { situacao } : { situacao, responsavel };

/**
 * Grava a conversa da ação na ordem da mudança, uma linha por vez: o id vem do `uuidv7()` do banco,
 * que cresce na mesma conexão, e a conversa lida pelo momento e pelo id fica na ordem da gravação.
 * Os anexos ficam com a mensagem ou a nota da ação; o que não se toma recusa a ação inteira.
 */
async function gravarAConversa(
  tx: Transacao,
  chamadoId: string,
  conversa: readonly EntradaDaConversa[],
  { contaId, momento, anexos }: { contaId: string; momento: Date; anexos: readonly string[] },
) {
  for (const entrada of conversa) {
    const [gravada] = await tx
      .insert(mensagensDosChamados)
      .values({
        orgId: sql`app.current_org()`,
        chamadoId,
        autorConta: contaId,
        criadaEm: momento,
        ...entrada,
      })
      .returning({ id: mensagensDosChamados.id });
    if (entrada.especie !== 'evento' && gravada) {
      await tomarAnexos(tx, {
        arquivos: anexos,
        contaId,
        dono: { chamadoId, mensagemId: gravada.id },
        chave: 'anexos',
      });
    }
  }
}

/**
 * Faz a ação e devolve o chamado depois dela. Com a fila, as notificações vão também pelo e-mail e
 * pelo push.
 */
export async function agirNoChamado(
  tx: Transacao,
  numero: number,
  pedido: PedidoDoAtendimento,
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

  // O horário só entra quando o relógio para ou volta, lido depois da trava do chamado (decisão 3).
  const relogio =
    decisao.relogio === 'segue'
      ? {}
      : relogioDepois(
          {
            modo: modoDoPrazoGuardado(lido.prazo),
            contadoS: lido.contadoS,
            relogioDesde: lido.relogioDesde,
          },
          decisao.relogio,
          momento,
          await lerHorarioDaTi(tx),
        );
  const versao = decisao.sobeAVersao ? lido.versao + 1 : lido.versao;
  await tx
    .update(chamados)
    .set({
      situacao: decisao.situacao,
      responsavelId: decisao.responsavel,
      responsavelDesde: desdeDeQuemAtende(chamado, decisao, momento),
      ...relogio,
      ...(decisao.cumpreAPrimeiraResposta ? { primeiraRespostaEm: momento } : {}),
      versao,
    })
    .where(eq(chamados.id, lido.id));
  await gravarAConversa(tx, lido.id, decisao.conversa, {
    contaId,
    momento,
    anexos: 'anexos' in pedido ? (pedido.anexos ?? []) : [],
  });

  const responsavel =
    decisao.responsavel === null
      ? null
      : { id: decisao.responsavel, nome: await nomeDaConta(tx, decisao.responsavel) };
  const locais = { locais: lido.locais, semLocal: lido.semLocal };
  const publico = publicoDoChamado(locais);
  const acaoNaAuditoria = decisao.sobeAVersao ? NA_AUDITORIA[pedido.acao] : null;
  if (acaoNaAuditoria === null) {
    await registrarEvento(tx, {
      tipo: 'chamados.mudaram',
      alvo: { tipo: 'chamado', id: lido.id },
      publico,
    });
  } else {
    const nomeAntes = lido.responsavel === null ? null : await nomeDaConta(tx, lido.responsavel);
    await registrarNaAuditoria(tx, {
      acao: acaoNaAuditoria,
      ator: { tipo: 'conta', contaId },
      alvo: { tipo: 'chamado', id: lido.id },
      antes: naAuditoria(lido.situacao, nomeAntes),
      depois: naAuditoria(decisao.situacao, responsavel?.nome ?? null),
      origem: origemDa(requisicao),
      momento,
      saida: { publico },
    });
  }

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
