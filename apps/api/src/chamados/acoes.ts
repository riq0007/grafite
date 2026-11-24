// As ações do atendimento (spec chamados, "Ações do atendimento", "Situação e quem atende",
// "Conversa do chamado" e "Notificações dos chamados"; change chamados-da-ti, design, decisões 3, 4,
// 10 e 12, e tarefas 4.12 a 4.14), gravadas por um lugar só, o `agirNoChamado`, numa transação:
// - o chamado, travado (`for update`) e lido para o domínio, com os locais pelo caminho, a pessoa
//   pelo nome e o desde: o de quem atende ou, sem ninguém, o da triagem, pelos eventos da conversa;
// - o que só uma ação usa: a conta escolhida do passar; no desfazer, o estado de antes do assumir,
//   do último evento que sobe a versão, com a conta de antes como está agora; no resolver, a cópia do
//   formulário e as respostas; e, no reabrir, quem resolveu, como a conta está agora;
// - a decisão do domínio, com a versão primeiro: a recusa da versão e o "mudou" do desfazer saem
//   como o `chamado-mudou`; a do texto e a dos anexos, como o 400 no campo, como as do formulário; e
//   as outras, como o conflito da abertura;
// - as opções da pergunta e o retrato do cartão do ativo, depois da decisão, com as recusas juntas no
//   400 (change chat-com-chamados, tarefa 3.10);
// - o horário da TI, só quando a ação para ou volta o relógio, lido depois da trava do chamado: a
//   troca do horário que travou o chamado antes já fechou o relógio dele pelo horário antigo, e a
//   ação conta desde a troca pelo novo (decisão 3);
// - o chamado, com o relógio, a primeira resposta, a resolução e a versão, que sobe só quando a
//   situação ou quem atende muda; a conversa, uma linha por vez, na ordem da mudança, com os anexos
//   tomados para a mensagem ou a nota; a auditoria, com o `chamados.mudaram`, das ações que mudam a
//   situação ou quem atende, e só o `chamados.mudaram` das outras, também às contas de quem participa
//   pelo chat, fora o da nota, com o `chat.mudou` da conversa de origem quando a situação ou quem
//   atende muda (change chat-com-chamados, decisão 4; tarefa 3.12); e as notificações, também as de
//   quem participa pelo chat, com o módulo Chat ligado.
import { chamados, mensagensDosChamados, pessoas, type Transacao } from '@grafite/db';
import {
  type AcaoDaAuditoria,
  type AcaoQueNotifica,
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  antesDoAssumir,
  type ChamadoParaAcao,
  conferirOpcoes,
  type DecisaoDaAcao,
  decidirAcao,
  decidirDesfazer,
  desdeDeQuemAtende,
  desdeNaTriagem,
  type EntradaDaConversa,
  type EventoNaConversa,
  estaFechado,
  mensagemDaRecusaDaAcao,
  modoDoPrazoGuardado,
  notificacoesDaAcao,
  notificacoesParaQuemParticipa,
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
import { avisarAsConversasDeOrigem } from '../chat/conversa.ts';
import { registrarEvento } from '../eventos/saida.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { chamadoMudou, conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { chamadoNaoEncontrado, publicoDoChamado } from './alcance.ts';
import { nomesDosAnexosDasMensagens, tomarAnexos } from './anexos.ts';
import { ATIVO_DO_CARTAO_NAO_ENCONTRADO, type CartaoDoAtivo, retratoDoAtivo } from './cartao.ts';
import { formularioDa } from './formulario.ts';
import { lerHorarioDaTi } from './horario.ts';
import { contasDaTriagem, lerContaQueAtende, nomeDaConta } from './quem-atende.ts';
import { comQuemParticipa, contasQueParticipam, semQuemParticipaPelaTi } from './quem-participa.ts';

/**
 * O pedido de cada rota, depois do schema: a versão que a tela mostra, nas ações dos botões, com a
 * conta escolhida do passar e o "O que foi feito" do resolver; o texto e os ids dos anexos, já
 * conferidos como UUID, na conversa.
 */
export type PedidoDoAtendimento =
  | { acao: 'assumir' | 'devolver' | 'retomar' | 'reabrir'; versao?: number | undefined }
  | { acao: 'passar'; para: string; versao?: number | undefined }
  | { acao: 'resolver'; feito: string; versao?: number | undefined }
  | { acao: 'desfazer'; versao: number }
  | {
      acao: 'mensagem' | 'esperar' | 'nota';
      texto: string;
      anexos?: readonly string[] | undefined;
      /** As opções da pergunta, na mensagem para a pessoa; a nota não as tem. */
      opcoes?: readonly string[] | undefined;
      /** O ativo do cartão, que quem escreve vê, ou nulo, sem cartão. */
      cartao?: string | null | undefined;
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
  retomar: 'chamado.retomado',
  resolver: 'chamado.resolvido',
  reabrir: 'chamado.reaberto',
  mensagem: null,
  nota: null,
} as const satisfies Record<AcaoDoAtendimento, AcaoDaAuditoria | null>;

/**
 * O chamado pelo número, travado até o fim da ação, se a conta o vê; senão, o que não existe. As
 * mudanças o travam pelo `travarParaMudar`, abaixo.
 */
export async function travarOChamado(
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
      resolvidoPor: chamados.resolvidoPor,
      resolvidoEm: chamados.resolvidoEm,
      fechadoEm: chamados.fechadoEm,
      ativo: chamados.ativoId,
      localDaPessoa: chamados.localDaPessoa,
      pessoa: pessoas.nome,
      pessoaId: chamados.pessoaId,
      origem: chamados.origem,
      abertoPor: chamados.abertoPor,
      origemConversaId: chamados.origemConversaId,
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

export type ChamadoTravado = Awaited<ReturnType<typeof travarOChamado>>;

/**
 * O chamado travado, a árvore e quem age, como as ações, a troca do ativo, do título e dos campos da
 * TI (`edicao.ts`) e o Virar OS (`os.ts`) os leem: quem age pelo alcance de `chamados.atender`.
 */
export async function travarParaMudar(tx: Transacao, numero: number, requisicao: FastifyRequest) {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const lido = await travarOChamado(tx, numero, acesso, arvore);
  const quemAge: QuemAge = { id: contaId, alcance: alcance(acesso, 'chamados.atender', arvore) };
  return { acesso, contaId, arvore, lido, quemAge };
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

/**
 * A cópia do formulário da abertura e as respostas do chamado já travado, que só o resolver e os
 * campos da TI leem (`edicao.ts`).
 */
export async function formularioDoChamado(tx: Transacao, chamadoId: string) {
  const [linha] = await tx
    .select({ formulario: chamados.formulario, respostas: chamados.respostas })
    .from(chamados)
    .where(eq(chamados.id, chamadoId));
  if (!linha) throw chamadoNaoEncontrado();
  return { formulario: formularioDa(linha), respostas: linha.respostas };
}

/**
 * A decisão do domínio, com a conta escolhida do passar, o estado de antes do desfazer, o formulário
 * do resolver e quem resolveu, no reabrir.
 */
async function decidir(
  tx: Transacao,
  chamado: ChamadoParaAcao,
  quemAge: QuemAge,
  pedido: PedidoDoAtendimento,
  {
    eventos,
    arvore,
    lido,
  }: {
    eventos: readonly EventoNaConversa[];
    arvore: ArvoreDeLocais;
    lido: { id: string; resolvidoPor: string | null };
  },
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
    case 'retomar':
      return decidirAcao(chamado, quemAge, { acao: pedido.acao, versao: pedido.versao });
    case 'resolver':
      return decidirAcao(chamado, quemAge, {
        acao: 'resolver',
        feito: pedido.feito,
        ...(await formularioDoChamado(tx, lido.id)),
        versao: pedido.versao,
      });
    case 'reabrir': {
      // O chamado que não está resolvido não tem quem resolveu, e a célula o recusa antes.
      const quemResolveu =
        lido.resolvidoPor === null ? null : await lerContaQueAtende(tx, lido.resolvidoPor, arvore);
      return decidirAcao(chamado, quemAge, {
        acao: 'reabrir',
        quemResolveu,
        versao: pedido.versao,
      });
    }
    case 'mensagem':
    case 'esperar':
    case 'nota':
      return decidirAcao(chamado, quemAge, {
        acao: pedido.acao,
        texto: pedido.texto,
        anexos: pedido.anexos?.length ?? 0,
        // A pergunta com as opções pede o texto, mesmo com os anexos (tarefa 4.18).
        pergunta: pedido.acao !== 'nota' && (pedido.opcoes?.length ?? 0) > 0,
      });
  }
}

/**
 * A recusa da versão e o "mudou" do desfazer pedem que a tela releia o chamado; a do texto e a dos
 * anexos aparecem no campo, como as do formulário: o "O que foi feito" no `feito`, e a mensagem e a
 * nota no `texto`; o resto conflita, como o campo só da TI vazio, que se preenche na ficha.
 */
function problemaDaRecusa(numero: number, recusa: RecusaDaAcao) {
  const frase = mensagemDaRecusaDaAcao(numero, recusa);
  switch (recusa.motivo) {
    case 'versao':
    case 'mudou':
      return chamadoMudou(frase);
    case 'sem-texto':
    case 'texto-longo':
      return dadosInvalidos({ [recusa.texto === 'feito' ? 'feito' : 'texto']: frase });
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
 * A ação como as notificações a leem: as contas da triagem só quando o chamado cai nela, pelo
 * devolver ou pelo reabrir de quem não atende mais; o reabrir, com quem recebe o chamado.
 */
async function comoNotifica(
  tx: Transacao,
  pedido: PedidoDoAtendimento,
  responsavel: string | null,
  arvore: ArvoreDeLocais,
): Promise<AcaoQueNotifica> {
  switch (pedido.acao) {
    case 'passar':
      return { acao: 'passar', para: pedido.para };
    case 'devolver':
      return { acao: 'devolver', contas: await contasDaTriagem(tx, arvore) };
    case 'reabrir':
      return responsavel === null
        ? { acao: 'reabrir', para: null, contas: await contasDaTriagem(tx, arvore) }
        : { acao: 'reabrir', para: responsavel };
    default:
      return { acao: pedido.acao };
  }
}

/** As opções e o cartão da mensagem ou da nota, conferidos; nulos sem eles. */
interface ExtrasDoEscrito {
  opcoes: string[] | null;
  cartao: CartaoDoAtivo | null;
}

/**
 * As opções e o cartão do pedido, conferidos depois da decisão do domínio, com as recusas juntas,
 * cada uma no campo dela: as opções pela pergunta (`conferirOpcoes`), gravadas nulas sem pergunta,
 * como o CHECK da conversa pede; e o cartão, pelo retrato do ativo que quem escreve vê.
 */
async function conferirOsExtras(
  tx: Transacao,
  pedido: PedidoDoAtendimento,
  leitura: { acesso: Acesso; arvore: ArvoreDeLocais; agora: Date },
): Promise<ExtrasDoEscrito> {
  if (pedido.acao !== 'mensagem' && pedido.acao !== 'esperar' && pedido.acao !== 'nota') {
    return { opcoes: null, cartao: null };
  }
  const erros: Record<string, string> = {};
  const conferidas = conferirOpcoes(pedido.acao === 'nota' ? [] : (pedido.opcoes ?? []));
  if (!conferidas.ok) erros.opcoes = conferidas.erro;
  let cartao: CartaoDoAtivo | null = null;
  if (pedido.cartao !== null && pedido.cartao !== undefined) {
    cartao = await retratoDoAtivo(tx, { ativo: pedido.cartao }, leitura);
    if (cartao === null) erros.cartao = ATIVO_DO_CARTAO_NAO_ENCONTRADO;
  }
  if (Object.keys(erros).length > 0 || !conferidas.ok) throw dadosInvalidos(erros);
  return { opcoes: conferidas.opcoes.length > 0 ? conferidas.opcoes : null, cartao };
}

/**
 * Grava a conversa da ação na ordem da mudança, uma linha por vez: o id vem do `uuidv7()` do banco,
 * que cresce na mesma conexão, e a conversa lida pelo momento e pelo id fica na ordem da gravação.
 * Os anexos e o cartão ficam com a mensagem ou a nota da ação, e as opções, só com a mensagem; o
 * anexo que não se toma recusa a ação inteira. Devolve a mensagem ou a nota gravada, ou nulo sem ela.
 */
async function gravarAConversa(
  tx: Transacao,
  chamadoId: string,
  conversa: readonly EntradaDaConversa[],
  {
    contaId,
    momento,
    anexos,
    extras,
  }: { contaId: string; momento: Date; anexos: readonly string[]; extras: ExtrasDoEscrito },
): Promise<string | null> {
  let escrito: string | null = null;
  for (const entrada of conversa) {
    const doEscrito =
      entrada.especie === 'evento'
        ? {}
        : {
            cartao: extras.cartao,
            opcoes: entrada.especie === 'mensagem' ? extras.opcoes : null,
          };
    const [gravada] = await tx
      .insert(mensagensDosChamados)
      .values({
        orgId: sql`app.current_org()`,
        chamadoId,
        autorConta: contaId,
        criadaEm: momento,
        ...entrada,
        ...doEscrito,
      })
      .returning({ id: mensagensDosChamados.id });
    if (entrada.especie !== 'evento' && gravada) {
      escrito = gravada.id;
      await tomarAnexos(tx, {
        arquivos: anexos,
        contaId,
        dono: { chamadoId, mensagemId: gravada.id },
        chave: 'anexos',
      });
    }
  }
  return escrito;
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
  const { acesso, contaId, arvore, lido, quemAge } = await travarParaMudar(tx, numero, requisicao);
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
    // O fechado pelo `estaFechado`, também o vencido que a tarefa ainda não fechou, no fuso do
    // horário de agora, lido só no resolvido (chat-com-chamados, tarefa 3.11).
    fechado:
      lido.situacao === 'resolvido' && estaFechado(lido, momento, (await lerHorarioDaTi(tx)).fuso),
  };
  const decisao = await decidir(tx, chamado, quemAge, pedido, { eventos, arvore, lido });
  if (!decisao.aceita) throw problemaDaRecusa(lido.numero, decisao.recusa);
  const extras = await conferirOsExtras(tx, pedido, { acesso, arvore, agora: momento });

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
  // A resolução segue a situação, como o CHECK pede: o chamado que chega a Resolvido grava quem
  // resolveu, quem age, e quando; o que sai dele a limpa, com a marca do estouro, para o reaberto que
  // passar do prazo ser avisado de novo (decisão 12); o que fica nele não muda. Hoje a matriz recusa
  // tudo no resolvido, fora o reabrir, e o "fica" protege quem resolveu de uma ação que passe por aqui
  // sem mudar a situação (revisão da 4.14).
  const resolucao =
    decisao.situacao === 'resolvido' && lido.situacao !== 'resolvido'
      ? { resolvidoEm: momento, resolvidoPor: contaId }
      : decisao.situacao !== 'resolvido' && lido.situacao === 'resolvido'
        ? { resolvidoEm: null, resolvidoPor: null, estouroAvisadoEm: null }
        : {};
  const versao = decisao.sobeAVersao ? lido.versao + 1 : lido.versao;
  await tx
    .update(chamados)
    .set({
      situacao: decisao.situacao,
      responsavelId: decisao.responsavel,
      responsavelDesde: desdeDeQuemAtende(chamado, decisao, momento),
      ...relogio,
      ...(decisao.cumpreAPrimeiraResposta ? { primeiraRespostaEm: momento } : {}),
      ...resolucao,
      versao,
    })
    .where(eq(chamados.id, lido.id));
  const escrito = await gravarAConversa(tx, lido.id, decisao.conversa, {
    contaId,
    momento,
    anexos: 'anexos' in pedido ? (pedido.anexos ?? []) : [],
    extras,
  });

  const responsavel =
    decisao.responsavel === null
      ? null
      : { id: decisao.responsavel, nome: await nomeDaConta(tx, decisao.responsavel) };
  const locais = { locais: lido.locais, semLocal: lido.semLocal };
  // Quem participa, lido uma vez para o público e para as notificações, recebe o que muda o que ele
  // lê; a nota fica só com quem vê o chamado (tarefa 3.12).
  const participante = { pessoaId: lido.pessoaId, origem: lido.origem, abertoPor: lido.abertoPor };
  const participam = await contasQueParticipam(tx, participante);
  const publico =
    pedido.acao === 'nota'
      ? publicoDoChamado(locais)
      : comQuemParticipa(publicoDoChamado(locais), participam);
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
  // O chip da conversa de origem segue a situação e quem atende (decisão 4).
  if (decisao.situacao !== lido.situacao || decisao.responsavel !== lido.responsavel) {
    await avisarAsConversasDeOrigem(tx, [lido.origemConversaId]);
  }

  await notificar(
    tx,
    notificacoesDaAcao(
      { numero: lido.numero, titulo: lido.titulo, locais },
      await comoNotifica(tx, pedido, decisao.responsavel, arvore),
      contaId,
    ),
    momento,
    enviar ? { enviar } : {},
  );
  // A mensagem para a pessoa e o resolvido vão também a quem participa pelo chat (decisão 13); a
  // mensagem só com os anexos começa pelo nome do primeiro (tarefa 4.18). Só ela lê os nomes.
  const soComOsAnexos = decisao.conversa.some(
    (entrada) => entrada.especie !== 'evento' && entrada.texto === null,
  );
  const anexos =
    escrito === null || pedido.acao === 'nota' || !soComOsAnexos
      ? []
      : ((await nomesDosAnexosDasMensagens(tx, [escrito])).get(escrito) ?? []);
  // Quem participa pela TI recebe as da TI, acima, e não estas (change andamento-e-varias-mensagens,
  // design, decisão 4). Os acessos de quem abriu só são lidos quando há a mensagem, sem a qual
  // ninguém que participa é notificado.
  const notificaQuemParticipa = decisao.conversa.some(({ especie }) => especie === 'mensagem');
  await notificar(
    tx,
    notificacoesParaQuemParticipa(
      { id: lido.id, numero: lido.numero, titulo: lido.titulo, ...participante },
      decisao,
      { contaId, nome: await nomeDaConta(tx, contaId) },
      notificaQuemParticipa
        ? await semQuemParticipaPelaTi(tx, { ...participante, ...locais }, participam, arvore)
        : [],
      anexos,
    ),
    momento,
    enviar ? { enviar } : {},
  );
  return { numero: lido.numero, versao, situacao: decisao.situacao, responsavel };
}
