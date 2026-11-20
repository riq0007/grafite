// As mensagens do chat (spec chat, "Mensagem", "Reações", "Link da mensagem" e "Chamado citado
// numa mensagem"; change chat-com-chamados, design, decisões 1, 3 e 11; tarefa 3.2): a página de 50,
// com o autor, a respondida, as reações, os anexos e as citações resolvidas para quem lê, e a
// gravação da mensagem na conversa travada. A marca do chamado em que a mensagem virou e o evento
// `virou-chamado` vêm com a abertura pelo chat (tarefa 3.7).
import {
  anexosDoChat,
  arquivos,
  chamados,
  conversas,
  ESPECIES_DO_CHAT_NO_BANCO,
  leiturasDasConversas,
  mensagensDoChat,
  reacoesDasMensagens,
  type Transacao,
} from '@grafite/db';
import {
  type Acesso,
  alcance,
  citacoesDeChamados,
  comecoDoTexto,
  conferirMensagem,
  estaFechado,
  mensagemDaRecusaDaEscrita,
  nomeNoChat,
  participacao,
  participaDoChamado,
  situacaoNoChat,
  veOChamado,
} from '@grafite/domain';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { lerArvore } from '../arvore.ts';
import { lerHorarioDaTi } from '../chamados/horario.ts';
import { registrarEvento } from '../eventos/saida.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { conflito, dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { tomarAnexosDoChat } from './anexos.ts';
import { ContaDoChat, type ContaLida, contaDoChat, lerContas } from './contas.ts';
import {
  type ContaQueLe,
  type ConversaDaConta,
  conversasParaParticipar,
  type LinhaDaConversa,
  publicoDaConversa,
} from './conversa.ts';
import { pedirANotificacao } from './notificar.ts';

/** As mensagens de uma página. */
export const TAMANHO_DA_PAGINA = 50;

/** Ao redor de uma mensagem: as 25 de antes, ela e as 24 de depois. */
const ANTES_DA_MENSAGEM = 25;

const AnexoDaMensagem = z
  .object({
    /** O id do arquivo. */
    id: z.uuid(),
    nome: z.string(),
    tipo: z.string(),
    bytes: z.int(),
  })
  .meta({ id: 'AnexoDaMensagem' });

const ReacaoDaMensagem = z
  .object({
    texto: z.string(),
    /** Quem deu a reação, na ordem em que deu, com o nome no chat (o "(TI)" de quem é da TI). */
    contas: z.array(z.object({ conta: z.uuid(), nome: z.string() })),
    /** A conta que lê deu esta reação. */
    minha: z.boolean(),
  })
  .meta({ id: 'ReacaoDaMensagem' });

const CitacaoDeChamado = z
  .object({
    numero: z.int(),
    /** O índice do "#" no texto, em unidades do UTF-16, como o `slice` corta. */
    inicio: z.int(),
    /** O índice logo depois do número. */
    fim: z.int(),
    /** A situação nas palavras do colaborador, com o Fechado. */
    situacao: z.string(),
    /** O nome de quem atende, ou nulo, sem ninguém. */
    atende: z.string().nullable(),
  })
  .meta({ id: 'CitacaoDeChamado' });

export const MensagemDoChat = z
  .object({
    id: z.uuid(),
    especie: z.enum(ESPECIES_DO_CHAT_NO_BANCO),
    /** Quem escreveu a mensagem ou agiu no evento. */
    autor: ContaDoChat,
    /** O texto da mensagem; o evento não tem. */
    texto: z.string().nullable(),
    /** O código do evento, como o `virou-chamado`; a mensagem não tem. */
    evento: z.string().nullable(),
    /** ISO 8601. */
    criadaEm: z.string(),
    /** A mensagem respondida, com o nome no chat de quem a escreveu e o começo do texto. */
    respondida: z.object({ id: z.uuid(), autor: z.string(), comeco: z.string() }).nullable(),
    /** As reações, na ordem da primeira de cada texto. */
    reacoes: z.array(ReacaoDaMensagem),
    anexos: z.array(AnexoDaMensagem),
    /** Os chamados citados de que a conta que lê vê o resumo; os outros ficam como o texto. */
    citacoes: z.array(CitacaoDeChamado),
    /**
     * O chamado em que a mensagem virou, ou o do evento `virou-chamado`, com o "Abrir chamado" a
     * quem participa dele e a quem o vê com `chamados.ver` e a mensagem de origem, que o "esta
     * mensagem" do evento cita; nulo nas outras.
     */
    chamado: z
      .object({ numero: z.int(), abrir: z.boolean(), mensagem: z.uuid().nullable() })
      .nullable(),
  })
  .meta({ id: 'MensagemDoChat' });

export type MensagemDoChat = z.infer<typeof MensagemDoChat>;

export const PaginaDeMensagens = z
  .object({
    /** As mensagens da página, da mais antiga para a mais nova. */
    itens: z.array(MensagemDoChat),
    /** A última mensagem que a conta leu, ou nulo. */
    lidaAte: z.uuid().nullable(),
    /** Há mensagens antes da primeira da página. */
    anteriores: z.boolean(),
    /** Há mensagens depois da última da página. */
    seguintes: z.boolean(),
  })
  .meta({ id: 'PaginaDeMensagens' });

/** A busca da página: as mais novas, sem nada; ou antes, depois ou ao redor de uma mensagem. */
export const BuscaDaPagina = z
  .object({
    antes: z.uuid({ error: 'A mensagem não foi encontrada.' }).optional(),
    depois: z.uuid({ error: 'A mensagem não foi encontrada.' }).optional(),
    em: z.uuid({ error: 'A mensagem não foi encontrada.' }).optional(),
  })
  .refine(
    ({ antes, depois, em }) => [antes, depois, em].filter((id) => id !== undefined).length <= 1,
    { error: 'Use só um de antes, depois e em.' },
  );

/** A conta que lê, com o que a citação pergunta: a pessoa dela e o acesso de agora. */
export interface ContaQueLeAsMensagens extends ContaQueLe {
  pessoaId: string;
  acesso: Acesso;
}

type LinhaDaMensagem = typeof mensagensDoChat.$inferSelect;

export const mensagemNaoEncontrada = () => naoEncontrado('A mensagem não foi encontrada.');

/** As linhas da conversa, da mais antiga para a mais nova, com as pontas da página. */
async function linhasDaPagina(
  tx: Transacao,
  conversaId: string,
  busca: z.infer<typeof BuscaDaPagina>,
): Promise<{ linhas: LinhaDaMensagem[]; anteriores: boolean; seguintes: boolean }> {
  const daConversa = eq(mensagensDoChat.conversaId, conversaId);
  const anteriores = (antesDe: string | null, quantas: number) =>
    tx
      .select()
      .from(mensagensDoChat)
      .where(antesDe === null ? daConversa : and(daConversa, lt(mensagensDoChat.id, antesDe)))
      .orderBy(desc(mensagensDoChat.id))
      .limit(quantas + 1);
  const seguintes = (aPartirDe: string, incluida: boolean, quantas: number) =>
    tx
      .select()
      .from(mensagensDoChat)
      .where(
        and(
          daConversa,
          incluida ? gte(mensagensDoChat.id, aPartirDe) : gt(mensagensDoChat.id, aPartirDe),
        ),
      )
      .orderBy(asc(mensagensDoChat.id))
      .limit(quantas + 1);

  const cursor = busca.antes ?? busca.depois ?? busca.em;
  if (cursor === undefined) {
    const novas = await anteriores(null, TAMANHO_DA_PAGINA);
    return {
      linhas: novas.slice(0, TAMANHO_DA_PAGINA).reverse(),
      anteriores: novas.length > TAMANHO_DA_PAGINA,
      seguintes: false,
    };
  }
  // A mensagem da busca é desta conversa, ou a página não existe.
  const [daBusca] = await tx
    .select({ id: mensagensDoChat.id })
    .from(mensagensDoChat)
    .where(and(daConversa, eq(mensagensDoChat.id, cursor)));
  if (!daBusca) throw mensagemNaoEncontrada();

  if (busca.antes !== undefined) {
    const antes = await anteriores(daBusca.id, TAMANHO_DA_PAGINA);
    return {
      linhas: antes.slice(0, TAMANHO_DA_PAGINA).reverse(),
      anteriores: antes.length > TAMANHO_DA_PAGINA,
      seguintes: true,
    };
  }
  if (busca.depois !== undefined) {
    const depois = await seguintes(daBusca.id, false, TAMANHO_DA_PAGINA);
    return {
      linhas: depois.slice(0, TAMANHO_DA_PAGINA),
      anteriores: true,
      seguintes: depois.length > TAMANHO_DA_PAGINA,
    };
  }
  const depoisDela = TAMANHO_DA_PAGINA - ANTES_DA_MENSAGEM;
  const [antes, depois] = [
    await anteriores(daBusca.id, ANTES_DA_MENSAGEM),
    await seguintes(daBusca.id, true, depoisDela),
  ];
  return {
    linhas: [...antes.slice(0, ANTES_DA_MENSAGEM).reverse(), ...depois.slice(0, depoisDela)],
    anteriores: antes.length > ANTES_DA_MENSAGEM,
    seguintes: depois.length > depoisDela,
  };
}

/**
 * As citações resolvidas para a conta que lê (design, decisão 11): a situação nas palavras do
 * colaborador e quem atende, só dos chamados de que ela vê o resumo. Nada se grava, e por isso o
 * chip segue o chamado. Com o módulo Chamados desligado, nenhuma vira o chip.
 */
async function resolverCitacoes(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  conversaId: string,
  numeros: ReadonlySet<number>,
  agora: Date,
): Promise<Map<number, { situacao: string; atende: string | null }>> {
  const resolvidas = new Map<number, { situacao: string; atende: string | null }>();
  if (numeros.size === 0 || !(await ligadoNaTransacao(tx, 'chamados'))) return resolvidas;
  const citados = await tx
    .select({
      numero: chamados.numero,
      pessoaId: chamados.pessoaId,
      origem: chamados.origem,
      abertoPor: chamados.abertoPor,
      origemConversaId: chamados.origemConversaId,
      locais: chamados.locais,
      semLocal: chamados.semLocal,
      situacao: chamados.situacao,
      resolvidoEm: chamados.resolvidoEm,
      fechadoEm: chamados.fechadoEm,
      responsavelId: chamados.responsavelId,
    })
    .from(chamados)
    .where(inArray(chamados.numero, [...numeros]));
  if (citados.length === 0) return resolvidas;

  // A conversa de origem de outra conversa, com quem participa dela agora.
  const outrasOrigens = [
    ...new Set(
      citados.flatMap(({ origemConversaId }) =>
        origemConversaId && origemConversaId !== conversaId ? [origemConversaId] : [],
      ),
    ),
  ];
  const linhasDasOrigens =
    outrasOrigens.length > 0
      ? await tx.select().from(conversas).where(inArray(conversas.id, outrasOrigens))
      : [];
  const origens = await conversasParaParticipar(tx, linhasDasOrigens);
  const participaDaOrigem = (origem: string | null) => {
    if (origem === null) return false;
    if (origem === conversaId) return true;
    const montada = origens.get(origem);
    return (
      montada !== undefined &&
      participacao({ id: conta.id, usaOChat: true, grupos: conta.grupos }, montada.conversa)
        .participa
    );
  };
  const doVer = alcance(conta.acesso, 'chamados.ver', await lerArvore(tx));
  const vistos = citados.filter(
    (chamado) =>
      participaDoChamado({ id: conta.id, pessoaId: conta.pessoaId, usaOChat: true }, chamado) ||
      veOChamado(doVer, chamado) ||
      participaDaOrigem(chamado.origemConversaId),
  );
  if (vistos.length === 0) return resolvidas;

  const { fuso } = await lerHorarioDaTi(tx);
  const responsaveis = await lerContas(
    tx,
    vistos.flatMap(({ responsavelId }) => (responsavelId ? [responsavelId] : [])),
  );
  for (const chamado of vistos) {
    resolvidas.set(chamado.numero, {
      situacao: situacaoNoChat(
        chamado.situacao,
        estaFechado(chamado, agora, fuso),
        participaDoChamado({ id: conta.id, pessoaId: conta.pessoaId, usaOChat: true }, chamado),
      ),
      atende: chamado.responsavelId
        ? (responsaveis.get(chamado.responsavelId)?.nome ?? null)
        : null,
    });
  }
  return resolvidas;
}

/**
 * A marca do chamado em que cada mensagem virou e a do evento `virou-chamado` (spec chat, "Chamados
 * da conversa"): o número e o "Abrir chamado", resolvidos para a conta que lê, como a citação. Com
 * o módulo Chamados desligado, o número fica, sem o "Abrir chamado".
 */
type MarcaDoChamado = NonNullable<MensagemDoChat['chamado']>;

async function marcasDosChamados(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  linhas: readonly LinhaDaMensagem[],
): Promise<Map<string, MarcaDoChamado>> {
  const marcas = new Map<string, MarcaDoChamado>();
  const mensagens = linhas.flatMap(({ id, especie }) => (especie === 'mensagem' ? [id] : []));
  const doEvento = new Map(
    linhas.flatMap(({ id, evento, dados }) =>
      evento === 'virou-chamado' && typeof dados?.chamadoId === 'string'
        ? [[id, dados.chamadoId] as const]
        : [],
    ),
  );
  if (mensagens.length === 0 && doEvento.size === 0) return marcas;
  const lidos = await tx
    .select({
      id: chamados.id,
      numero: chamados.numero,
      origemMensagemId: chamados.origemMensagemId,
      pessoaId: chamados.pessoaId,
      origem: chamados.origem,
      abertoPor: chamados.abertoPor,
      locais: chamados.locais,
      semLocal: chamados.semLocal,
    })
    .from(chamados)
    .where(
      or(
        mensagens.length > 0 ? inArray(chamados.origemMensagemId, mensagens) : undefined,
        doEvento.size > 0 ? inArray(chamados.id, [...new Set(doEvento.values())]) : undefined,
      ),
    );
  if (lidos.length === 0) return marcas;
  const ligado = await ligadoNaTransacao(tx, 'chamados');
  const doVer = ligado ? alcance(conta.acesso, 'chamados.ver', await lerArvore(tx)) : null;
  const daConta = { id: conta.id, pessoaId: conta.pessoaId, usaOChat: true };
  for (const chamado of lidos) {
    const marca = {
      numero: chamado.numero,
      abrir: ligado && (participaDoChamado(daConta, chamado) || veOChamado(doVer, chamado)),
      mensagem: chamado.origemMensagemId,
    };
    if (chamado.origemMensagemId) marcas.set(chamado.origemMensagemId, marca);
    for (const [eventoId, chamadoId] of doEvento) {
      if (chamadoId === chamado.id) marcas.set(eventoId, marca);
    }
  }
  return marcas;
}

/**
 * As mensagens lidas para a conta: o autor, a respondida, as reações, os anexos, as citações e a
 * marca do chamado.
 */
export async function mensagensParaAConta(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  conversaId: string,
  linhas: readonly LinhaDaMensagem[],
  agora: Date,
): Promise<MensagemDoChat[]> {
  if (linhas.length === 0) return [];
  const ids = linhas.map(({ id }) => id);
  const idsDasRespondidas = [
    ...new Set(linhas.flatMap(({ respondeA }) => (respondeA ? [respondeA] : []))),
  ];
  const respondidas =
    idsDasRespondidas.length > 0
      ? await tx
          .select({
            id: mensagensDoChat.id,
            autorConta: mensagensDoChat.autorConta,
            texto: mensagensDoChat.texto,
          })
          .from(mensagensDoChat)
          .where(inArray(mensagensDoChat.id, idsDasRespondidas))
      : [];
  const reacoes = await tx
    .select({
      mensagemId: reacoesDasMensagens.mensagemId,
      contaId: reacoesDasMensagens.contaId,
      texto: reacoesDasMensagens.texto,
    })
    .from(reacoesDasMensagens)
    .where(inArray(reacoesDasMensagens.mensagemId, ids))
    .orderBy(asc(reacoesDasMensagens.criadaEm), asc(reacoesDasMensagens.id));
  const anexos = await tx
    .select({
      mensagemId: anexosDoChat.mensagemId,
      id: arquivos.id,
      nome: arquivos.nome,
      tipo: arquivos.tipo,
      bytes: arquivos.bytes,
    })
    .from(anexosDoChat)
    .innerJoin(
      arquivos,
      and(eq(arquivos.orgId, anexosDoChat.orgId), eq(arquivos.id, anexosDoChat.arquivoId)),
    )
    .where(and(inArray(anexosDoChat.mensagemId, ids), isNull(arquivos.removidoEm)))
    .orderBy(asc(arquivos.enviadoEm), asc(arquivos.id));

  const contas = await lerContas(tx, [
    ...linhas.map(({ autorConta }) => autorConta),
    ...respondidas.map(({ autorConta }) => autorConta),
    ...reacoes.map(({ contaId }) => contaId),
  ]);
  const nomeDa = (id: string) => {
    const lida: ContaLida | undefined = contas.get(id);
    return lida ? nomeNoChat(lida.nome, lida.daTi) : '';
  };
  const autorDa = (id: string) => {
    const lida = contas.get(id);
    return lida
      ? contaDoChat(lida)
      : { conta: id, nome: '', daTi: false, foto: null as ContaDoChat['foto'] };
  };

  const citacoesDe = new Map(
    linhas.map(({ id, texto }) => [id, texto === null ? [] : citacoesDeChamados(texto)]),
  );
  const resolvidas = await resolverCitacoes(
    tx,
    conta,
    conversaId,
    new Set([...citacoesDe.values()].flat().map(({ numero }) => numero)),
    agora,
  );
  const respondidaDe = new Map(respondidas.map((linha) => [linha.id, linha]));
  const marcas = await marcasDosChamados(tx, conta, linhas);

  return linhas.map((linha) => {
    const respondida = linha.respondeA ? respondidaDe.get(linha.respondeA) : undefined;
    const porTexto = new Map<string, { conta: string; nome: string }[]>();
    for (const reacao of reacoes) {
      if (reacao.mensagemId !== linha.id) continue;
      const contasDoTexto = porTexto.get(reacao.texto) ?? [];
      contasDoTexto.push({ conta: reacao.contaId, nome: nomeDa(reacao.contaId) });
      porTexto.set(reacao.texto, contasDoTexto);
    }
    return {
      id: linha.id,
      especie: linha.especie,
      autor: autorDa(linha.autorConta),
      texto: linha.texto,
      evento: linha.evento,
      criadaEm: linha.criadaEm.toISOString(),
      respondida: respondida
        ? {
            id: respondida.id,
            autor: nomeDa(respondida.autorConta),
            comeco: comecoDoTexto(respondida.texto ?? ''),
          }
        : null,
      reacoes: [...porTexto].map(([texto, contasDoTexto]) => ({
        texto,
        contas: contasDoTexto,
        minha: contasDoTexto.some(({ conta: id }) => id === conta.id),
      })),
      anexos: anexos
        .filter(({ mensagemId }) => mensagemId === linha.id)
        .map(({ id, nome, tipo, bytes }) => ({ id, nome: nome ?? '', tipo, bytes })),
      citacoes: (citacoesDe.get(linha.id) ?? []).flatMap((citacao) => {
        const resolvida = resolvidas.get(citacao.numero);
        return resolvida ? [{ ...citacao, ...resolvida }] : [];
      }),
      chamado: marcas.get(linha.id) ?? null,
    };
  });
}

/** A página da conversa para a conta, com a última que ela leu. */
export async function lerPagina(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  conversaId: string,
  busca: z.infer<typeof BuscaDaPagina>,
  agora: Date,
): Promise<z.infer<typeof PaginaDeMensagens>> {
  const { linhas, anteriores, seguintes } = await linhasDaPagina(tx, conversaId, busca);
  const [leitura] = await tx
    .select({ lidaAte: leiturasDasConversas.lidaAte })
    .from(leiturasDasConversas)
    .where(
      and(
        eq(leiturasDasConversas.conversaId, conversaId),
        eq(leiturasDasConversas.contaId, conta.id),
      ),
    );
  return {
    itens: await mensagensParaAConta(tx, conta, conversaId, linhas, agora),
    lidaAte: leitura?.lidaAte ?? null,
    anteriores,
    seguintes,
  };
}

/**
 * Grava a mensagem na conversa já travada (`travarParaAMensagem` ou `travarADireta`): a recusa de
 * quem só lê, o texto e o número de anexos do domínio, a respondida, que é uma mensagem da mesma
 * conversa, os anexos, tomados depois da mensagem gravada, porque a chave estrangeira do anexo pede a
 * mensagem, e o `chat.mudou` a quem participa. As recusas desfazem a trava e a direta que nascia.
 */
export async function gravarMensagem(
  tx: Transacao,
  { linha, participacao: daConta }: Pick<ConversaDaConta, 'linha' | 'participacao'>,
  pedido: {
    contaId: string;
    texto: string;
    respondeA: string | null;
    anexos: readonly string[];
    momento: Date;
    /** Pede a notificação da mensagem, 10 s depois; sem a fila, nada é pedido. */
    enviar?: EnviarTarefa | undefined;
  },
): Promise<LinhaDaMensagem> {
  if (daConta.participa && !daConta.escreve) {
    throw conflito(mensagemDaRecusaDaEscrita(daConta.recusa));
  }
  const conferida = conferirMensagem({ texto: pedido.texto, anexos: 0 });
  if (!conferida.ok) throw dadosInvalidos({ texto: conferida.erro });
  const anexos = [...new Set(pedido.anexos.map((id) => id.toLowerCase()))];
  const comOsAnexos = conferirMensagem({ texto: pedido.texto, anexos: anexos.length });
  if (!comOsAnexos.ok) throw dadosInvalidos({ anexos: comOsAnexos.erro });
  if (pedido.respondeA !== null) {
    const [respondida] = await tx
      .select({ id: mensagensDoChat.id })
      .from(mensagensDoChat)
      .where(
        and(
          eq(mensagensDoChat.id, pedido.respondeA),
          eq(mensagensDoChat.conversaId, linha.id),
          eq(mensagensDoChat.especie, 'mensagem'),
        ),
      );
    if (!respondida) {
      throw dadosInvalidos({ respondeA: 'A mensagem respondida não está nesta conversa.' });
    }
  }
  const [gravada] = await tx
    .insert(mensagensDoChat)
    .values({
      orgId: linha.orgId,
      conversaId: linha.id,
      especie: 'mensagem',
      autorConta: pedido.contaId,
      texto: conferida.texto,
      respondeA: pedido.respondeA,
      criadaEm: pedido.momento,
    })
    .returning();
  if (!gravada) throw new Error('A mensagem não foi gravada.');
  await tomarAnexosDoChat(tx, {
    arquivos: anexos,
    contaId: pedido.contaId,
    conversaId: linha.id,
    mensagemId: gravada.id,
  });
  await pedirANotificacao(tx, pedido.enviar, gravada);
  await registrarEvento(tx, {
    tipo: 'chat.mudou',
    alvo: { tipo: 'conversa', id: linha.id },
    publico: publicoDaConversa(linha as LinhaDaConversa),
  });
  return gravada;
}
