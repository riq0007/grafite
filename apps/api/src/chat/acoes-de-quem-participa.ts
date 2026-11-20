// As ações de quem participa do chamado, pelo chat (spec chamados, "Resposta da pessoa", "Pergunta
// com opções", "Avaliação do atendimento", "Resposta nova" e "Fechamento do chamado"; change
// chat-com-chamados, design, decisões 5, 9 e 15; tarefa 3.9), gravadas por um lugar só, o
// `agirComoQuemParticipa`, numa transação:
// - o chamado, travado (`for update`), de que a conta participa; o dos outros responde como
//   inexistente, como na leitura;
// - o fechado, pelo `estaFechado`, com o fuso do horário da TI lido depois da trava;
// - o que só uma ação lê, com o chamado travado: quem resolveu, como a conta está agora, na mensagem
//   e no "Reabrir" do resolvido; a pergunta e se ela já tem a escolha; e se a resolução de agora já
//   foi avaliada. A chave da escolha e a da avaliação vêm do que o banco devolve, e nunca do pedido;
// - a decisão do domínio (`decidirAcaoDeQuemParticipa`), com as recusas do conteúdo no campo e as
//   outras como o conflito, como as da TI;
// - na retomada e na reabertura, o chamado, com o relógio, quem atende desde quando e a versão, e a
//   auditoria pela conta de quem participa; nas outras, só o `chamados.mudaram`, e na marcação como
//   vista nem ele, que muda só a leitura da conta;
// - a conversa, uma linha por vez, na ordem da mudança: a mensagem pela pessoa, com os anexos, e os
//   eventos pela conta;
// - a `vista_ate`, a última linha da conversa depois da ação, lida com o chamado travado, e as
//   notificações do chamado na conta, marcadas como lidas;
// - as notificações a quem atende (`notificacoesDeQuemParticipa`), com as contas da triagem lidas só
//   na reabertura que vai a ela.
import { chamados, leiturasDosChamados, mensagensDosChamados, type Transacao } from '@grafite/db';
import {
  type ArvoreDeLocais,
  assuntoDoChamado,
  type ChamadoParaQuemParticipa,
  type ContaQueRecebe,
  type DecisaoDeQuemParticipa,
  decidirAcaoDeQuemParticipa,
  desdeDeQuemAtende,
  estaFechado,
  mensagemDaRecusaDeQuemParticipa,
  modoDoPrazoGuardado,
  notificacoesDeQuemParticipa,
  type PedidoDeQuemParticipa,
  participaDoChamado,
  type RecusaDeQuemParticipa,
  relogioDepois,
  type SituacaoDoChamado,
} from '@grafite/domain';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { chamadoNaoEncontrado, publicoDoChamado } from '../chamados/alcance.ts';
import { tomarAnexos } from '../chamados/anexos.ts';
import { lerHorarioDaTi } from '../chamados/horario.ts';
import { contasDaTriagem, lerContaQueAtende, nomeDaConta } from '../chamados/quem-atende.ts';
import { registrarEvento } from '../eventos/saida.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { marcarLidasDoAssunto } from '../notificacoes/leitura.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { daConta } from './chamados-de-quem-participa.ts';
import type { ContaQueLeAsMensagens } from './mensagens.ts';

/**
 * O pedido de cada rota, depois do schema: o texto e os ids dos anexos, já conferidos como UUID, da
 * mensagem; o id da pergunta e a opção, da escolha; o nível e o comentário, da avaliação.
 */
export type PedidoDaRotaDeQuemParticipa =
  | { acao: 'responder'; texto: string; anexos: readonly string[] }
  | { acao: 'escolher'; mensagem: string; opcao: string }
  | { acao: 'reabrir' }
  | { acao: 'avaliar'; nivel: string | null; comentario: string | null }
  | { acao: 'vista' };

/** O chamado de que a conta participa, travado até o fim da ação; o dos outros não existe. */
async function travarParaQuemParticipa(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  numero: number,
) {
  const [chamado] = await tx
    .select()
    .from(chamados)
    .where(eq(chamados.numero, numero))
    .for('update');
  if (!chamado || !participaDoChamado(daConta(conta), chamado)) throw chamadoNaoEncontrado();
  return chamado;
}

type ChamadoTravado = Awaited<ReturnType<typeof travarParaQuemParticipa>>;

/** Quem resolveu, como a conta está agora, que a reabertura do resolvido pede. */
const quemResolveu = async (
  tx: Transacao,
  chamado: ChamadoTravado,
  arvore: ArvoreDeLocais,
): Promise<ContaQueRecebe | null> =>
  chamado.situacao === 'resolvido' && chamado.resolvidoPor !== null
    ? lerContaQueAtende(tx, chamado.resolvidoPor, arvore)
    : null;

/**
 * A pergunta da escolha, lida com o chamado travado: a mensagem da conversa do chamado, com o id como
 * o banco o devolve, as opções, e se já tem a escolha de alguém. A que não é uma mensagem do chamado,
 * como a nota, que a pessoa não lê, é a que não pergunta nada, e a escolha é recusada no campo.
 */
async function lerAPergunta(tx: Transacao, chamadoId: string, mensagem: string) {
  const [lida] = await tx
    .select({ id: mensagensDosChamados.id, opcoes: mensagensDosChamados.opcoes })
    .from(mensagensDosChamados)
    .where(
      and(
        eq(mensagensDosChamados.chamadoId, chamadoId),
        eq(mensagensDosChamados.id, mensagem),
        eq(mensagensDosChamados.especie, 'mensagem'),
      ),
    );
  if (!lida) return { id: mensagem.toLowerCase(), opcoes: [], respondida: false };
  const [escolha] = await tx
    .select({ id: mensagensDosChamados.id })
    .from(mensagensDosChamados)
    .where(
      and(
        eq(mensagensDosChamados.chamadoId, chamadoId),
        eq(mensagensDosChamados.evento, 'escolheu'),
        sql`${mensagensDosChamados.dados} ->> 'mensagem' = ${lida.id}`,
      ),
    )
    .limit(1);
  return { id: lida.id, opcoes: lida.opcoes ?? [], respondida: escolha !== undefined };
}

/** A resolução de agora já tem a avaliação, pela chave do índice: o `resolvido_em` em ISO. */
async function jaAvaliado(tx: Transacao, chamado: ChamadoTravado) {
  if (chamado.resolvidoEm === null) return false;
  const [avaliacao] = await tx
    .select({ id: mensagensDosChamados.id })
    .from(mensagensDosChamados)
    .where(
      and(
        eq(mensagensDosChamados.chamadoId, chamado.id),
        eq(mensagensDosChamados.evento, 'avaliou'),
        sql`${mensagensDosChamados.dados} ->> 'resolucao' = ${chamado.resolvidoEm.toISOString()}`,
      ),
    )
    .limit(1);
  return avaliacao !== undefined;
}

/** O pedido do domínio, com o que só a ação lê, com o chamado travado. */
async function pedidoDoDominio(
  tx: Transacao,
  chamado: ChamadoTravado,
  pedido: PedidoDaRotaDeQuemParticipa,
  arvore: ArvoreDeLocais,
): Promise<PedidoDeQuemParticipa> {
  switch (pedido.acao) {
    case 'responder':
      return {
        acao: 'responder',
        texto: pedido.texto,
        anexos: pedido.anexos.length,
        quemResolveu: await quemResolveu(tx, chamado, arvore),
      };
    case 'escolher':
      return {
        acao: 'escolher',
        pergunta: await lerAPergunta(tx, chamado.id, pedido.mensagem),
        opcao: pedido.opcao,
      };
    case 'reabrir':
      return { acao: 'reabrir', quemResolveu: await quemResolveu(tx, chamado, arvore) };
    case 'avaliar':
      return {
        acao: 'avaliar',
        nivel: pedido.nivel,
        comentario: pedido.comentario,
        avaliado: await jaAvaliado(tx, chamado),
      };
    case 'vista':
      return { acao: 'vista' };
  }
}

/** As recusas do conteúdo vão no campo dele, como as da TI; as outras conflitam. */
function problemaDaRecusa(numero: number, recusa: RecusaDeQuemParticipa) {
  const frase = mensagemDaRecusaDeQuemParticipa(numero, recusa);
  switch (recusa.motivo) {
    case 'sem-texto':
    case 'texto-longo':
      return dadosInvalidos({ texto: frase });
    case 'anexos-demais':
      return dadosInvalidos({ anexos: frase });
    case 'opcao-de-fora':
      return dadosInvalidos({ opcao: frase });
    case 'sem-nivel':
      return dadosInvalidos({ nivel: frase });
    case 'comentario-longo':
      return dadosInvalidos({ comentario: frase });
    default:
      return conflito(frase);
  }
}

/** A situação e quem atende, pelo nome, como a auditoria os mostra. */
const naAuditoria = (situacao: SituacaoDoChamado, responsavel: string | null) =>
  responsavel === null ? { situacao } : { situacao, responsavel };

/** Grava o chamado depois da retomada ou da reabertura, com o relógio e quem atende desde quando. */
async function gravarOChamado(
  tx: Transacao,
  chamado: ChamadoTravado,
  decisao: Extract<DecisaoDeQuemParticipa, { aceita: true }>,
  momento: Date,
) {
  const relogio =
    decisao.relogio === 'segue'
      ? {}
      : relogioDepois(
          {
            modo: modoDoPrazoGuardado(chamado.prazo),
            contadoS: chamado.contadoS,
            relogioDesde: chamado.relogioDesde,
          },
          decisao.relogio,
          momento,
          await lerHorarioDaTi(tx),
        );
  // A reabertura limpa a resolução, com a marca do estouro, como o reabrir da TI.
  const resolucao =
    chamado.situacao === 'resolvido' && decisao.situacao !== 'resolvido'
      ? { resolvidoEm: null, resolvidoPor: null, estouroAvisadoEm: null }
      : {};
  await tx
    .update(chamados)
    .set({
      situacao: decisao.situacao,
      responsavelId: decisao.responsavel,
      // Com quem atende, o chamado tem o `responsavel_desde`; sem ninguém, o domínio dá nulo antes.
      responsavelDesde: desdeDeQuemAtende(
        { responsavel: chamado.responsavelId, desde: chamado.responsavelDesde ?? momento },
        decisao,
        momento,
      ),
      ...relogio,
      ...resolucao,
      versao: chamado.versao + 1,
    })
    .where(eq(chamados.id, chamado.id));
}

/**
 * Grava a conversa da ação na ordem da mudança, uma linha por vez, como a da TI: a mensagem pela
 * pessoa, com os anexos tomados pela conta, e os eventos pela conta.
 */
async function gravarAConversa(
  tx: Transacao,
  chamadoId: string,
  decisao: Extract<DecisaoDeQuemParticipa, { aceita: true }>,
  {
    conta,
    momento,
    anexos,
  }: { conta: ContaQueLeAsMensagens; momento: Date; anexos: readonly string[] },
) {
  for (const entrada of decisao.conversa) {
    const base = { orgId: sql`app.current_org()`, chamadoId, criadaEm: momento };
    if (entrada.especie === 'mensagem') {
      const [gravada] = await tx
        .insert(mensagensDosChamados)
        .values({ ...base, especie: 'mensagem', autorPessoa: conta.pessoaId, texto: entrada.texto })
        .returning({ id: mensagensDosChamados.id });
      if (gravada) {
        await tomarAnexos(tx, {
          arquivos: anexos,
          contaId: conta.id,
          dono: { chamadoId, mensagemId: gravada.id },
          chave: 'anexos',
        });
      }
      continue;
    }
    await tx.insert(mensagensDosChamados).values({
      ...base,
      especie: 'evento',
      autorConta: conta.id,
      evento: entrada.evento,
      dados: entrada.dados,
    });
  }
}

/**
 * A marcação como vista: a `vista_ate` vai à última linha da conversa, lida com o chamado travado,
 * pelo id, que é o `uuidv7()` e segue a ordem das gravações; e as notificações do chamado na conta
 * ficam lidas.
 */
async function marcarComoVista(
  tx: Transacao,
  chamadoId: string,
  { conta, momento }: { conta: ContaQueLeAsMensagens; momento: Date },
) {
  const [ultima] = await tx
    .select({ id: mensagensDosChamados.id })
    .from(mensagensDosChamados)
    .where(eq(mensagensDosChamados.chamadoId, chamadoId))
    .orderBy(desc(mensagensDosChamados.id))
    .limit(1);
  if (ultima) {
    await tx
      .insert(leiturasDosChamados)
      .values({ orgId: sql`app.current_org()`, chamadoId, contaId: conta.id, vistaAte: ultima.id })
      .onConflictDoUpdate({
        target: [
          leiturasDosChamados.orgId,
          leiturasDosChamados.contaId,
          leiturasDosChamados.chamadoId,
        ],
        set: { vistaAte: ultima.id },
      });
  }
  await marcarLidasDoAssunto(tx, {
    contaId: conta.id,
    assunto: assuntoDoChamado(chamadoId),
    momento,
  });
}

/**
 * Faz a ação de quem participa no chamado. Com a fila, as notificações vão também pelo e-mail e
 * pelo push.
 */
export async function agirComoQuemParticipa(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  numero: number,
  pedido: PedidoDaRotaDeQuemParticipa,
  {
    requisicao,
    momento,
    enviar,
  }: { requisicao: FastifyRequest; momento: Date; enviar?: EnviarTarefa | undefined },
): Promise<void> {
  const lido = await travarParaQuemParticipa(tx, conta, numero);
  const arvore = await lerArvore(tx);
  const { fuso } = await lerHorarioDaTi(tx);
  const chamado: ChamadoParaQuemParticipa = {
    numero: lido.numero,
    situacao: lido.situacao,
    fechado: estaFechado(lido, momento, fuso),
    responsavel: lido.responsavelId,
    resolvidoEm: lido.resolvidoEm,
    locais: lido.locais.map((id) => ({ id, nome: arvore.caminho(id) })),
    semLocal: lido.semLocal,
  };
  const decisao = decidirAcaoDeQuemParticipa(
    chamado,
    await pedidoDoDominio(tx, lido, pedido, arvore),
  );
  if (!decisao.aceita) throw problemaDaRecusa(lido.numero, decisao.recusa);

  if (decisao.sobeAVersao) await gravarOChamado(tx, lido, decisao, momento);
  await gravarAConversa(tx, lido.id, decisao, {
    conta,
    momento,
    anexos: pedido.acao === 'responder' ? pedido.anexos : [],
  });
  await marcarComoVista(tx, lido.id, { conta, momento });

  const locais = { locais: lido.locais, semLocal: lido.semLocal };
  const publico = publicoDoChamado(locais);
  const reabriu = decisao.conversa.find(
    (entrada) => entrada.especie === 'evento' && entrada.evento === 'reabriu',
  );
  if (decisao.sobeAVersao) {
    // A versão sobe só na retomada e na reabertura, as células da TI que a ação faz.
    const nome = (id: string | null) => (id === null ? null : nomeDaConta(tx, id));
    await registrarNaAuditoria(tx, {
      acao: reabriu ? 'chamado.reaberto' : 'chamado.retomado',
      ator: { tipo: 'conta', contaId: conta.id },
      alvo: { tipo: 'chamado', id: lido.id },
      antes: naAuditoria(lido.situacao, await nome(lido.responsavelId)),
      depois: naAuditoria(decisao.situacao, await nome(decisao.responsavel)),
      origem: origemDa(requisicao),
      momento,
      saida: { publico },
    });
  } else {
    // A marcação como vista muda só a leitura da conta: só as telas dela são avisadas.
    await registrarEvento(tx, {
      tipo: 'chamados.mudaram',
      alvo: { tipo: 'chamado', id: lido.id },
      publico: decisao.conversa.length > 0 ? publico : { contas: [conta.id] },
    });
  }
  if (decisao.conversa.length === 0) return;

  const vaiATriagem = reabriu?.especie === 'evento' && reabriu.dados.para === null;
  await notificar(
    tx,
    notificacoesDeQuemParticipa(
      { id: lido.id, numero: lido.numero, titulo: lido.titulo, locais },
      decisao,
      { contaId: conta.id, nome: await nomeDaConta(tx, conta.id) },
      vaiATriagem ? await contasDaTriagem(tx, arvore) : [],
    ),
    momento,
    enviar ? { enviar } : {},
  );
}
