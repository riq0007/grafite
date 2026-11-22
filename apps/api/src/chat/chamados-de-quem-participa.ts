// A leitura de quem participa do chamado (spec chamados, "Leitura do chamado pela pessoa", "Resposta
// nova", "Resumo dos tempos" e "Fechamento do chamado"; spec chat, "Chamado citado numa mensagem";
// spec modulo-chat, "Lista do Chat", "Chamado no chat" e "Vista Chamados"; change
// chat-com-chamados, design, decisões 5, 9 e 15; tarefa 3.8): os chamados da conta, a conversa do
// chamado nas palavras do colaborador, o anexo e o resumo do chip. Participa a pessoa do chamado e
// quem o abriu pelo chat; a conversa e o anexo respondem como inexistentes a quem não participa,
// também a quem o vê com `chamados.ver`, que o lê no módulo Chamados. O resumo do chip vai também a
// quem o vê e a quem participa da conversa de onde ele foi aberto.
import {
  anexosDosChamados,
  arquivos,
  chamados,
  conversas,
  leiturasDosChamados,
  mensagensDosChamados,
  type Transacao,
  tiposDeChamado,
} from '@grafite/db';
import {
  alcance,
  comecoDoTexto,
  type EtapaDoChamado,
  estaFechado,
  etapasDoChamado,
  type Formulario,
  fraseDoEventoParaQuemParticipa,
  ICONES_DO_TIPO_DE_CHAMADO,
  lerPrazoDoChamado,
  NIVEIS_DA_AVALIACAO,
  nivelDaAvaliacao,
  participacao,
  participaDoChamado,
  previsaoDaResposta,
  respostaNova,
  resumoDasRespostas,
  SITUACOES_DO_CHAMADO,
  secoesDoChat,
  situacaoNoChat,
  situacaoParaQuemParticipa,
  ultimoDiaParaReabrir,
  veOChamado,
} from '@grafite/domain';
import { and, asc, desc, eq, inArray, ne, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { arquivoNaoEncontrado } from '../arquivos/anexos-sem-dono.ts';
import { lerArvore } from '../arvore.ts';
import { chamadoNaoEncontrado } from '../chamados/alcance.ts';
import { nomesDosAnexosDasMensagens } from '../chamados/anexos.ts';
import { CartaoDoAtivo, cartaoLido } from '../chamados/cartao.ts';
import {
  type AnexoNaFicha,
  anexoNaFicha,
  ativosPorId,
  citadosPelasRespostas,
  dadoDeTexto,
  escolhasDasPerguntas,
  nomesDasPessoas,
  resumoDaResolucao,
  textoDoDia,
} from '../chamados/ficha.ts';
import { formularioDa } from '../chamados/formulario.ts';
import { lerHorarioDaTi } from '../chamados/horario.ts';
import { lerContas } from './contas.ts';
import { conversasParaParticipar } from './conversa.ts';
import type { ContaQueLeAsMensagens } from './mensagens.ts';

/** Os resolvidos por página da vista Chamados, que carrega mais ao rolar. */
export const TAMANHO_DA_PAGINA_DOS_RESOLVIDOS = 50;

/** As duas últimas mensagens do resumo do chip. */
const ULTIMAS_DO_RESUMO = 2;

const TipoNaLeitura = z.object({ nome: z.string(), icone: z.enum(ICONES_DO_TIPO_DE_CHAMADO) });

const AnexoNaLeitura = z
  .object({ id: z.uuid(), nome: z.string(), tipo: z.string(), bytes: z.int() })
  .meta({ id: 'AnexoDoChamadoNoChat' });

const AtivoNaLeitura = z.object({ nome: z.string(), patrimonio: z.string().nullable() });

export const ChamadoDeQuemParticipa = z
  .object({
    numero: z.int(),
    titulo: z.string(),
    tipo: TipoNaLeitura,
    situacao: z.enum(SITUACOES_DO_CHAMADO),
    /** O resolvido que não se reabre mais: o que a tarefa fechou e o vencido que ela não fechou. */
    fechado: z.boolean(),
    /** A situação nas palavras de quem participa, com o Fechado. */
    situacaoEmTexto: z.string(),
    /** ISO 8601. */
    abertoEm: z.string(),
    /** ISO 8601, no resolvido. */
    resolvidoEm: z.string().nullable(),
    /** O nome de quem atende, ou nulo, sem ninguém. */
    atende: z.string().nullable(),
    /** As mensagens da TI que são resposta nova para a conta; zero no resolvido. */
    respostaNova: z.int(),
    /** A última mensagem da conversa, sem as notas e sem os eventos, com quem a escreveu. */
    ultimaMensagem: z
      .object({ autor: z.string(), minha: z.boolean(), comeco: z.string(), em: z.string() })
      .nullable(),
  })
  .meta({ id: 'ChamadoDeQuemParticipa' });
type ChamadoDeQuemParticipa = z.infer<typeof ChamadoDeQuemParticipa>;

export const ChamadosDeQuemParticipa = z
  .object({
    /** Os abertos, todos, só na primeira página, na ordem da lista do Chat (`secoesDoChat`). */
    abertos: z.array(ChamadoDeQuemParticipa),
    /** Os resolvidos, os que ainda se reabrem e os fechados, o resolvido mais novo primeiro. */
    resolvidos: z.array(ChamadoDeQuemParticipa),
    /** Há resolvidos depois do último da página. */
    seguintes: z.boolean(),
  })
  .meta({ id: 'ChamadosDeQuemParticipa' });

export const BuscaDosChamadosDeQuemParticipa = z.object({
  /** O número do último resolvido da página de antes: a página seguinte vem depois dele. */
  resolvidosAntes: z.coerce
    .number({ error: 'Chamado não encontrado.' })
    .int({ error: 'Chamado não encontrado.' })
    .min(1, { error: 'Chamado não encontrado.' })
    .max(2_147_483_647, { error: 'Chamado não encontrado.' })
    .optional(),
});

const TempoDesdeAAbertura = z.object({ em: z.string(), tempo: z.string() });

export const ResumoDosTemposLido = z
  .object({
    abertoEm: z.string(),
    /** A primeira mensagem da TI para a pessoa; nula sem nenhuma, o "sem resposta". */
    primeiraResposta: TempoDesdeAAbertura.nullable(),
    resolvido: TempoDesdeAAbertura,
    atendeu: z.string(),
  })
  .meta({ id: 'ResumoDosTemposNoChat' });

const ItemDaConversaDeQuemParticipa = z
  .discriminatedUnion('especie', [
    z.object({
      especie: z.literal('mensagem'),
      id: z.uuid(),
      em: z.string(),
      autor: z.object({
        nome: z.string(),
        /** A mensagem da TI para a pessoa; a de quem participa não é. */
        daTi: z.boolean(),
        /** A conta que lê a escreveu. */
        minha: z.boolean(),
      }),
      /** O texto, nulo na mensagem só com os anexos. */
      texto: z.string().nullable(),
      anexos: z.array(AnexoNaLeitura),
      /** As opções da pergunta da TI, de 2 a 3; nulas na mensagem sem pergunta. */
      opcoes: z.array(z.string()).nullable(),
      /** A opção escolhida, que vale para sempre, com quem a escolheu e quando; nula sem resposta. */
      escolhida: z
        .object({ opcao: z.string(), por: z.string(), minha: z.boolean(), em: z.string() })
        .nullable(),
      /** O retrato do ativo, como foi mandado; o que esta versão não lê vem nulo. */
      cartao: CartaoDoAtivo.nullable(),
    }),
    z.object({
      especie: z.literal('evento'),
      id: z.uuid(),
      em: z.string(),
      /** O código do evento, como o `resolveu`. */
      evento: z.string(),
      /** A frase nas palavras do colaborador, com o "Você" a quem lê. */
      frase: z.string(),
      /** No `resolveu`, o resumo dos tempos dessa resolução; nulo nos outros. */
      resumo: ResumoDosTemposLido.nullable(),
    }),
  ])
  .meta({ id: 'ItemDaConversaDeQuemParticipa' });
type ItemDaConversaDeQuemParticipa = z.infer<typeof ItemDaConversaDeQuemParticipa>;

export const ConversaDoChamadoDeQuemParticipa = z
  .object({
    numero: z.int(),
    titulo: z.string(),
    tipo: TipoNaLeitura,
    situacao: z.enum(SITUACOES_DO_CHAMADO),
    fechado: z.boolean(),
    situacaoEmTexto: z.string(),
    abertoEm: z.string(),
    atende: z.object({ nome: z.string(), desde: z.string() }).nullable(),
    /** Aberto, Em andamento, Aguardando você e Resolvido, com a hora da última chegada a cada uma. */
    etapas: z.array(
      z.object({
        situacao: z.enum(SITUACOES_DO_CHAMADO),
        agora: z.boolean(),
        estado: z.enum(['chegou', 'pulada', 'ainda-nao']),
        /** ISO 8601, na etapa a que o chamado chegou. */
        em: z.string().nullable(),
      }),
    ),
    /** "responde em ~1 h", na triagem e em atendimento. */
    previsao: z.string().nullable(),
    /**
     * No resolvido, o último dia em que ele se reabre, como "2026-11-18", no fuso do horário da TI:
     * o "Reabrir até 18/11" e, no fechado, o "O chamado fechou em 18/11".
     */
    reabrirAte: z.string().nullable(),
    ativo: AtivoNaLeitura.nullable(),
    /** O resumo das respostas, sem os campos só da TI. */
    resumo: z.string(),
    anexosDosCampos: z.array(AnexoNaLeitura.extend({ campo: z.string() })),
    /** A mensagem do chat de onde o chamado foi aberto, como ficou na abertura. */
    origem: z
      .object({
        autor: z.string(),
        /** O texto, nulo na mensagem só com os anexos. */
        texto: z.string().nullable(),
        em: z.string(),
        anexos: z.array(AnexoNaLeitura),
      })
      .nullable(),
    conversa: z.array(ItemDaConversaDeQuemParticipa),
    /** A resposta nova: quantas e a primeira delas, onde entra o separador "Resposta nova". */
    respostaNova: z.object({ quantas: z.int(), desde: z.uuid().nullable() }),
    /**
     * A avaliação da resolução de agora, com o nível e se foi a conta que lê; nula sem ela e fora do
     * resolvido. Sem ela, o resolvido que ainda reabre oferece a avaliação.
     */
    avaliacao: z.object({ nivel: z.enum(NIVEIS_DA_AVALIACAO), minha: z.boolean() }).nullable(),
  })
  .meta({ id: 'ConversaDoChamadoDeQuemParticipa' });
type ConversaDoChamadoDeQuemParticipa = z.infer<typeof ConversaDoChamadoDeQuemParticipa>;

export const ResumoDoChamadoNoChat = z
  .object({
    numero: z.int(),
    titulo: z.string(),
    /** A situação nas palavras do colaborador, com a espera da TI a quem não participa. */
    situacao: z.string(),
    atende: z.string().nullable(),
    /** Onde o "Abrir chamado" leva: a conversa, a quem participa; o módulo, a quem o vê. */
    abrir: z.enum(['chat', 'chamados']).nullable(),
    /** A quem participa e a quem vê com `chamados.ver`; nulo a quem só é da conversa de origem. */
    detalhes: z
      .object({
        /** As duas últimas mensagens que a conta vê, da mais antiga para a mais nova. */
        ultimas: z.array(
          z.object({
            especie: z.enum(['mensagem', 'nota']),
            /** O texto ou, na mensagem só com os anexos, o nome do primeiro, pelo `comecoDoTexto`. */
            texto: z.string(),
            autor: z.string(),
            /** A mensagem da própria conta, que a tela mostra como "Você". */
            minha: z.boolean(),
            em: z.string(),
          }),
        ),
        ativo: AtivoNaLeitura.nullable(),
        abertoEm: z.string(),
      })
      .nullable(),
  })
  .meta({ id: 'ResumoDoChamadoNoChat' });
type ResumoDoChamadoNoChat = z.infer<typeof ResumoDoChamadoNoChat>;

type LinhaDoChamado = typeof chamados.$inferSelect;

/** A conta como a participação no chamado a lê: quem lê pelo chat usa o chat. */
export const daConta = (conta: ContaQueLeAsMensagens) => ({
  id: conta.id,
  pessoaId: conta.pessoaId,
  usaOChat: true,
});

/** Os chamados de que a conta participa: os da pessoa dela e os que ela abriu pelo chat. */
const deQuemParticipa = (conta: ContaQueLeAsMensagens): SQL | undefined =>
  or(
    eq(chamados.pessoaId, conta.pessoaId),
    and(eq(chamados.origem, 'chat'), eq(chamados.abertoPor, conta.id)),
  );

/** O nome de cada conta e de cada pessoa, numa leitura de cada. */
async function nomesDe(tx: Transacao, idsDasContas: Set<string>, idsDasPessoas: Set<string>) {
  const deContas = await lerContas(tx, [...idsDasContas]);
  const dePessoas = await nomesDasPessoas(tx, idsDasPessoas);
  return {
    conta: (id: string) => deContas.get(id)?.nome ?? '',
    pessoa: (id: string) => dePessoas.get(id) ?? '',
  };
}

/** A pagina dos chamados da conta: os abertos, na primeira, e os resolvidos. */
export async function chamadosDeQuemParticipa(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  { resolvidosAntes, agora }: { resolvidosAntes: number | undefined; agora: Date },
): Promise<z.infer<typeof ChamadosDeQuemParticipa>> {
  const colunas = {
    chamado: chamados,
    tipo: { nome: tiposDeChamado.nome, icone: tiposDeChamado.icone },
  };
  const participa = deQuemParticipa(conta);
  const abertos =
    resolvidosAntes === undefined
      ? await tx
          .select(colunas)
          .from(chamados)
          .innerJoin(tiposDeChamado, eq(tiposDeChamado.id, chamados.tipoId))
          .where(and(participa, ne(chamados.situacao, 'resolvido')))
      : [];
  let depoisDe: SQL | undefined;
  if (resolvidosAntes !== undefined) {
    const [cursor] = await tx
      .select({ resolvidoEm: chamados.resolvidoEm })
      .from(chamados)
      .where(and(participa, eq(chamados.numero, resolvidosAntes)));
    if (!cursor || cursor.resolvidoEm === null) throw chamadoNaoEncontrado();
    depoisDe = sql`(${chamados.resolvidoEm}, ${chamados.numero}) < (select c.resolvido_em, c.numero from ${chamados} c where c.numero = ${resolvidosAntes})`;
  }
  const resolvidos = await tx
    .select(colunas)
    .from(chamados)
    .innerJoin(tiposDeChamado, eq(tiposDeChamado.id, chamados.tipoId))
    .where(and(participa, eq(chamados.situacao, 'resolvido'), depoisDe))
    .orderBy(desc(chamados.resolvidoEm), desc(chamados.numero))
    .limit(TAMANHO_DA_PAGINA_DOS_RESOLVIDOS + 1);
  const daPagina = resolvidos.slice(0, TAMANHO_DA_PAGINA_DOS_RESOLVIDOS);
  const todos = [...abertos, ...daPagina];
  if (todos.length === 0) return { abertos: [], resolvidos: [], seguintes: false };

  const ids = todos.map(({ chamado }) => chamado.id);
  const idsDosAbertos = abertos.map(({ chamado }) => chamado.id);
  // As mensagens da TI dos abertos, para a resposta nova, e a leitura da conta em cada um.
  const daTi =
    idsDosAbertos.length > 0
      ? await tx
          .select({
            id: mensagensDosChamados.id,
            chamadoId: mensagensDosChamados.chamadoId,
            especie: mensagensDosChamados.especie,
            autorConta: mensagensDosChamados.autorConta,
          })
          .from(mensagensDosChamados)
          .where(
            and(
              inArray(mensagensDosChamados.chamadoId, idsDosAbertos),
              eq(mensagensDosChamados.especie, 'mensagem'),
              sql`${mensagensDosChamados.autorConta} is not null`,
            ),
          )
      : [];
  const leituras =
    idsDosAbertos.length > 0
      ? await tx
          .select({
            chamadoId: leiturasDosChamados.chamadoId,
            vistaAte: leiturasDosChamados.vistaAte,
          })
          .from(leiturasDosChamados)
          .where(
            and(
              eq(leiturasDosChamados.contaId, conta.id),
              inArray(leiturasDosChamados.chamadoId, idsDosAbertos),
            ),
          )
      : [];
  const vistaAte = new Map(leituras.map(({ chamadoId, vistaAte: ate }) => [chamadoId, ate]));
  // A última mensagem de cada chamado, sem as notas e os eventos.
  const ultimas = await tx
    .selectDistinctOn([mensagensDosChamados.chamadoId], {
      id: mensagensDosChamados.id,
      chamadoId: mensagensDosChamados.chamadoId,
      autorConta: mensagensDosChamados.autorConta,
      autorPessoa: mensagensDosChamados.autorPessoa,
      texto: mensagensDosChamados.texto,
      criadaEm: mensagensDosChamados.criadaEm,
    })
    .from(mensagensDosChamados)
    .where(
      and(
        inArray(mensagensDosChamados.chamadoId, ids),
        eq(mensagensDosChamados.especie, 'mensagem'),
      ),
    )
    .orderBy(
      mensagensDosChamados.chamadoId,
      desc(mensagensDosChamados.criadaEm),
      desc(mensagensDosChamados.id),
    );
  const ultimaDe = new Map(ultimas.map((ultima) => [ultima.chamadoId, ultima]));
  const anexosDaUltima = await nomesDosAnexosDasMensagens(
    tx,
    ultimas.map(({ id }) => id),
  );

  const idsDasContas = new Set<string>();
  const idsDasPessoas = new Set<string>();
  for (const { chamado } of todos) {
    if (chamado.responsavelId !== null) idsDasContas.add(chamado.responsavelId);
  }
  for (const ultima of ultimas) {
    if (ultima.autorConta !== null) idsDasContas.add(ultima.autorConta);
    if (ultima.autorPessoa !== null) idsDasPessoas.add(ultima.autorPessoa);
  }
  const nome = await nomesDe(tx, idsDasContas, idsDasPessoas);
  const { fuso } = await lerHorarioDaTi(tx);

  const item = ({
    chamado,
    tipo,
  }: {
    chamado: LinhaDoChamado;
    tipo: { nome: string; icone: (typeof ICONES_DO_TIPO_DE_CHAMADO)[number] };
  }): ChamadoDeQuemParticipa => {
    const fechado = estaFechado(chamado, agora, fuso);
    const ultima = ultimaDe.get(chamado.id);
    return {
      numero: chamado.numero,
      titulo: chamado.titulo,
      tipo,
      situacao: chamado.situacao,
      fechado,
      situacaoEmTexto: situacaoParaQuemParticipa(chamado.situacao, fechado),
      abertoEm: chamado.abertoEm.toISOString(),
      resolvidoEm: chamado.resolvidoEm?.toISOString() ?? null,
      atende: chamado.responsavelId === null ? null : nome.conta(chamado.responsavelId),
      respostaNova: respostaNova({
        situacao: chamado.situacao,
        linhas: daTi.filter(({ chamadoId }) => chamadoId === chamado.id),
        contaId: conta.id,
        vistaAte: vistaAte.get(chamado.id) ?? null,
      }),
      ultimaMensagem: ultima
        ? {
            autor:
              ultima.autorConta !== null
                ? nome.conta(ultima.autorConta)
                : nome.pessoa(ultima.autorPessoa ?? ''),
            minha: ultima.autorConta === conta.id || ultima.autorPessoa === conta.pessoaId,
            comeco: comecoDoTexto(ultima.texto, anexosDaUltima.get(ultima.id)),
            em: ultima.criadaEm.toISOString(),
          }
        : null,
    };
  };
  // Os abertos na ordem da lista do Chat: os que aguardam a conta primeiro, e o aberto mais novo.
  const naOrdem = secoesDoChat(
    abertos.map((linha) => ({
      numero: linha.chamado.numero,
      situacao: linha.chamado.situacao,
      fechado: false,
      abertoEm: linha.chamado.abertoEm,
      resolvidoEm: linha.chamado.resolvidoEm,
      linha,
    })),
  ).chamados;
  return {
    abertos: naOrdem.map(({ linha }) => item(linha)),
    resolvidos: daPagina.map(item),
    seguintes: resolvidos.length > TAMANHO_DA_PAGINA_DOS_RESOLVIDOS,
  };
}

/** O chamado de que a conta participa, com o tipo; o dos outros responde como inexistente. */
async function chamadoDeQuemParticipa(tx: Transacao, conta: ContaQueLeAsMensagens, numero: number) {
  const [lido] = await tx
    .select({
      chamado: chamados,
      tipo: { nome: tiposDeChamado.nome, icone: tiposDeChamado.icone },
    })
    .from(chamados)
    .innerJoin(tiposDeChamado, eq(tiposDeChamado.id, chamados.tipoId))
    .where(eq(chamados.numero, numero));
  if (!lido || !participaDoChamado(daConta(conta), lido.chamado)) throw chamadoNaoEncontrado();
  return lido;
}

/** O formulário sem os campos só da TI, que a pessoa não lê, nem as respostas nem os anexos. */
const formularioDeQuemParticipa = (formulario: Formulario): Formulario => ({
  ...formulario,
  campos: formulario.campos.filter(({ soDaTi }) => !soDaTi),
});

/** Os ids dos anexos dos campos que a pessoa vê, pelo campo, como as respostas os guardam. */
function anexosDosCamposQueAPessoaVe(
  formulario: Formulario,
  respostas: Readonly<Record<string, unknown>>,
) {
  const doCampo = new Map<string, string>();
  for (const campo of formulario.campos) {
    const ids = respostas[campo.id];
    if (campo.tipo !== 'anexo' || !Array.isArray(ids)) continue;
    for (const id of ids) if (typeof id === 'string') doCampo.set(id, campo.id);
  }
  return doCampo;
}

/**
 * A conversa do chamado para quem participa: sem as notas, sem os campos só da TI e os anexos dos
 * dois, sem os alertas do ativo, o prazo da resolução e os eventos que a pessoa não lê. As etapas
 * saem de todos os eventos, também do desfazer, antes de a leitura os tirar.
 */
export async function conversaDeQuemParticipa(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  numero: number,
  agora: Date,
): Promise<ConversaDoChamadoDeQuemParticipa> {
  const { chamado, tipo } = await chamadoDeQuemParticipa(tx, conta, numero);
  const formulario = formularioDeQuemParticipa(formularioDa(chamado));
  const respostas = chamado.respostas;
  const citados = citadosPelasRespostas(formulario, respostas);

  const linhas = await tx
    .select({
      id: mensagensDosChamados.id,
      especie: mensagensDosChamados.especie,
      autorConta: mensagensDosChamados.autorConta,
      autorPessoa: mensagensDosChamados.autorPessoa,
      texto: mensagensDosChamados.texto,
      evento: mensagensDosChamados.evento,
      dados: mensagensDosChamados.dados,
      opcoes: mensagensDosChamados.opcoes,
      cartao: mensagensDosChamados.cartao,
      criadaEm: mensagensDosChamados.criadaEm,
    })
    .from(mensagensDosChamados)
    .where(eq(mensagensDosChamados.chamadoId, chamado.id))
    .orderBy(asc(mensagensDosChamados.criadaEm), asc(mensagensDosChamados.id));

  const idsDasContas = new Set<string>();
  if (chamado.responsavelId !== null) idsDasContas.add(chamado.responsavelId);
  const idsDasPessoas = new Set(citados.pessoa);
  for (const linha of linhas) {
    if (linha.especie === 'nota') continue;
    if (linha.autorConta !== null) idsDasContas.add(linha.autorConta);
    if (linha.autorPessoa !== null) idsDasPessoas.add(linha.autorPessoa);
    const para = dadoDeTexto(linha.dados, 'para');
    if (linha.evento === 'passou' && para !== null) idsDasContas.add(para);
  }
  const nome = await nomesDe(tx, idsDasContas, idsDasPessoas);
  const contaNaFrase = (id: string | null) =>
    id === null ? null : { conta: id, nome: nome.conta(id) };

  // Os anexos que ainda existem, das mensagens, da origem e dos campos que a pessoa vê.
  const anexosLidos = await tx
    .select({
      id: arquivos.id,
      nome: arquivos.nome,
      tipo: arquivos.tipo,
      bytes: arquivos.bytes,
      mensagemId: anexosDosChamados.mensagemId,
    })
    .from(anexosDosChamados)
    .innerJoin(arquivos, eq(arquivos.id, anexosDosChamados.arquivoId))
    .where(and(eq(anexosDosChamados.chamadoId, chamado.id), sql`${arquivos.removidoEm} is null`))
    .orderBy(asc(arquivos.enviadoEm), asc(arquivos.id));
  const anexosDaLinha = new Map<string, AnexoNaFicha[]>();
  const anexoDoCampo = new Map<string, AnexoNaFicha>();
  for (const anexo of anexosLidos) {
    if (anexo.mensagemId === null) {
      anexoDoCampo.set(anexo.id, anexoNaFicha(anexo));
      continue;
    }
    const daLinha = anexosDaLinha.get(anexo.mensagemId) ?? [];
    daLinha.push(anexoNaFicha(anexo));
    anexosDaLinha.set(anexo.mensagemId, daLinha);
  }
  const anexosDosCampos: ConversaDoChamadoDeQuemParticipa['anexosDosCampos'] = [];
  for (const [id, campo] of anexosDosCamposQueAPessoaVe(formulario, respostas)) {
    const anexo = anexoDoCampo.get(id);
    if (anexo) anexosDosCampos.push({ campo, ...anexo });
  }

  // A escolha fica na própria pergunta: a primeira de cada uma vence (o índice único dela).
  const escolhas = escolhasDasPerguntas(linhas);
  const escolhida = (mensagemId: string) => {
    const escolha = escolhas.get(mensagemId.toLowerCase());
    return escolha
      ? {
          opcao: escolha.opcao,
          por: nome.conta(escolha.linha.autorConta ?? ''),
          minha: escolha.linha.autorConta === conta.id,
          em: escolha.linha.criadaEm.toISOString(),
        }
      : null;
  };

  let origem: ConversaDoChamadoDeQuemParticipa['origem'] = null;
  const conversa: ItemDaConversaDeQuemParticipa[] = [];
  for (const linha of linhas) {
    const em = linha.criadaEm.toISOString();
    if (linha.especie === 'nota') continue;
    if (linha.especie === 'origem') {
      origem = {
        autor: nome.conta(linha.autorConta ?? ''),
        texto: linha.texto,
        em: dadoDeTexto(linha.dados, 'em') ?? em,
        anexos: anexosDaLinha.get(linha.id) ?? [],
      };
      continue;
    }
    if (linha.especie === 'mensagem') {
      conversa.push({
        especie: 'mensagem',
        id: linha.id,
        em,
        autor: {
          nome:
            linha.autorConta !== null
              ? nome.conta(linha.autorConta)
              : nome.pessoa(linha.autorPessoa ?? ''),
          daTi: linha.autorConta !== null,
          minha: linha.autorConta === conta.id || linha.autorPessoa === conta.pessoaId,
        },
        texto: linha.texto,
        anexos: anexosDaLinha.get(linha.id) ?? [],
        opcoes: linha.opcoes,
        escolhida: escolhida(linha.id),
        cartao: cartaoLido(linha.cartao),
      });
      continue;
    }
    const evento = linha.evento ?? '';
    if (evento === 'desfez') {
      // O desfazer vem logo depois do assumir que ele desfaz (`decidirDesfazer`, no domínio): a
      // pessoa não lê nenhum dos dois, como as etapas, que voltam à chegada de antes.
      const ultimo = conversa.findLastIndex((item) => item.especie === 'evento');
      const anterior = conversa[ultimo];
      if (anterior?.especie === 'evento' && anterior.evento === 'assumiu')
        conversa.splice(ultimo, 1);
      continue;
    }
    const autor = contaNaFrase(linha.autorConta);
    const frase = fraseDoEventoParaQuemParticipa(
      {
        evento,
        autor,
        para: evento === 'passou' ? contaNaFrase(dadoDeTexto(linha.dados, 'para')) : null,
        nivel: linha.dados?.nivel,
      },
      conta.id,
    );
    if (frase === null) continue;
    const resumo =
      evento === 'resolveu'
        ? resumoDaResolucao(chamado.abertoEm, linhas, {
            criadaEm: linha.criadaEm,
            atendeu: autor?.nome ?? '',
          })
        : null;
    conversa.push({ especie: 'evento', id: linha.id, em, evento, frase, resumo });
  }

  const eventos = linhas.flatMap((linha) =>
    linha.especie === 'evento' && linha.evento !== null
      ? [{ evento: linha.evento, para: linha.dados?.para, em: linha.criadaEm }]
      : [],
  );
  const etapas = etapasDoChamado(eventos, chamado.situacao).map((etapa: EtapaDoChamado) => ({
    situacao: etapa.situacao,
    agora: etapa.agora,
    estado: etapa.estado,
    em: etapa.estado === 'chegou' ? etapa.em.toISOString() : null,
  }));

  // A resposta nova, pela regra do domínio, e a primeira mensagem dela.
  const [leitura] = await tx
    .select({ vistaAte: leiturasDosChamados.vistaAte })
    .from(leiturasDosChamados)
    .where(
      and(eq(leiturasDosChamados.chamadoId, chamado.id), eq(leiturasDosChamados.contaId, conta.id)),
    );
  const pedidoDaNova = {
    situacao: chamado.situacao,
    contaId: conta.id,
    vistaAte: leitura?.vistaAte ?? null,
  };
  const quantas = respostaNova({ ...pedidoDaNova, linhas });
  const desde =
    quantas > 0
      ? (linhas.find((linha) => respostaNova({ ...pedidoDaNova, linhas: [linha] }) > 0)?.id ?? null)
      : null;

  // A avaliação da resolução de agora, pela chave do índice: o `resolvido_em` em ISO.
  const resolucao =
    chamado.situacao === 'resolvido' ? (chamado.resolvidoEm?.toISOString() ?? null) : null;
  const avaliou = linhas.find(
    ({ evento, dados }) =>
      resolucao !== null && evento === 'avaliou' && dadoDeTexto(dados, 'resolucao') === resolucao,
  );
  const nivel = nivelDaAvaliacao(avaliou?.dados?.nivel);

  const { fuso } = await lerHorarioDaTi(tx);
  const fechado = estaFechado(chamado, agora, fuso);
  const prazo = lerPrazoDoChamado(chamado.prazo);
  const idsDosAtivos = new Set(citados.ativo);
  if (chamado.ativoId !== null) idsDosAtivos.add(chamado.ativoId);
  const ativoDe = await ativosPorId(tx, idsDosAtivos);
  const ligado = chamado.ativoId === null ? undefined : ativoDe.get(chamado.ativoId);
  const arvore = await lerArvore(tx);
  const caminhos = new Map([...citados.local].map((id) => [id, arvore.caminho(id)]));
  return {
    numero: chamado.numero,
    titulo: chamado.titulo,
    tipo,
    situacao: chamado.situacao,
    fechado,
    situacaoEmTexto: situacaoParaQuemParticipa(chamado.situacao, fechado),
    abertoEm: chamado.abertoEm.toISOString(),
    atende:
      chamado.responsavelId !== null && chamado.responsavelDesde !== null
        ? { nome: nome.conta(chamado.responsavelId), desde: chamado.responsavelDesde.toISOString() }
        : null,
    etapas,
    previsao: prazo ? previsaoDaResposta({ situacao: chamado.situacao, prazo }) : null,
    reabrirAte:
      chamado.situacao === 'resolvido' && chamado.resolvidoEm !== null
        ? textoDoDia(ultimoDiaParaReabrir(chamado.resolvidoEm, fuso))
        : null,
    ativo: ligado ? { nome: ligado.rotulo, patrimonio: ligado.patrimonio } : null,
    resumo: resumoDasRespostas(formulario, respostas, {
      nomeDoTipo: tipo.nome,
      ativos: ativoDe,
      locais: caminhos,
      pessoas: new Map([...citados.pessoa].map((id) => [id, nome.pessoa(id)])),
    }),
    anexosDosCampos,
    origem,
    conversa,
    respostaNova: { quantas, desde },
    avaliacao: avaliou && nivel ? { nivel, minha: avaliou.autorConta === conta.id } : null,
  };
}

/**
 * O arquivo de um anexo que quem participa lê: o de uma mensagem, o da origem e o de um campo que
 * não é só da TI. O da nota e o de um campo só da TI respondem como o arquivo que não existe.
 */
export async function anexoDeQuemParticipa(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  numero: number,
  arquivoId: string,
): Promise<{ nome: string | null; tipo: string }> {
  const { chamado } = await chamadoDeQuemParticipa(tx, conta, numero);
  const [lido] = await tx
    .select({
      nome: arquivos.nome,
      tipo: arquivos.tipo,
      mensagemId: anexosDosChamados.mensagemId,
      especie: mensagensDosChamados.especie,
    })
    .from(anexosDosChamados)
    .innerJoin(arquivos, eq(arquivos.id, anexosDosChamados.arquivoId))
    .leftJoin(mensagensDosChamados, eq(mensagensDosChamados.id, anexosDosChamados.mensagemId))
    .where(
      and(
        eq(anexosDosChamados.arquivoId, arquivoId),
        eq(anexosDosChamados.chamadoId, chamado.id),
        sql`${arquivos.removidoEm} is null`,
      ),
    );
  if (!lido) throw arquivoNaoEncontrado();
  const daLinha = lido.especie === 'mensagem' || lido.especie === 'origem';
  const doCampo =
    lido.mensagemId === null &&
    anexosDosCamposQueAPessoaVe(
      formularioDeQuemParticipa(formularioDa(chamado)),
      chamado.respostas,
    ).has(arquivoId);
  if (!daLinha && !doCampo) throw arquivoNaoEncontrado();
  return { nome: lido.nome, tipo: lido.tipo };
}

/** A conta participa agora da conversa do chat de onde o chamado foi aberto. */
async function participaDaOrigem(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  conversaId: string | null,
) {
  if (conversaId === null) return false;
  const linhas = await tx.select().from(conversas).where(eq(conversas.id, conversaId));
  const montada = (await conversasParaParticipar(tx, linhas)).get(conversaId);
  return (
    montada !== undefined &&
    participacao({ id: conta.id, usaOChat: true, grupos: conta.grupos }, montada.conversa).participa
  );
}

/**
 * O resumo do chip do chamado citado: a quem participa do chamado, a quem o vê com `chamados.ver` e
 * a quem participa da conversa de onde ele foi aberto. As duas últimas mensagens, o ativo e a hora
 * da abertura vão só aos dois primeiros; as notas, só a quem vê com `chamados.ver`.
 */
export async function resumoDoChamadoNoChat(
  tx: Transacao,
  conta: ContaQueLeAsMensagens,
  numero: number,
  agora: Date,
): Promise<ResumoDoChamadoNoChat> {
  const [chamado] = await tx.select().from(chamados).where(eq(chamados.numero, numero));
  if (!chamado) throw chamadoNaoEncontrado();
  const participa = participaDoChamado(daConta(conta), chamado);
  const ve = veOChamado(alcance(conta.acesso, 'chamados.ver', await lerArvore(tx)), chamado);
  if (!participa && !ve && !(await participaDaOrigem(tx, conta, chamado.origemConversaId))) {
    throw chamadoNaoEncontrado();
  }
  const { fuso } = await lerHorarioDaTi(tx);
  const nomesDasContas = await lerContas(
    tx,
    chamado.responsavelId === null ? [] : [chamado.responsavelId],
  );
  const base = {
    numero: chamado.numero,
    titulo: chamado.titulo,
    situacao: situacaoNoChat(chamado.situacao, estaFechado(chamado, agora, fuso), participa),
    atende:
      chamado.responsavelId === null
        ? null
        : (nomesDasContas.get(chamado.responsavelId)?.nome ?? null),
  };
  if (!participa && !ve) return { ...base, abrir: null, detalhes: null };

  const especies: ('mensagem' | 'nota')[] = ve ? ['mensagem', 'nota'] : ['mensagem'];
  const ultimas = (
    await tx
      .select({
        id: mensagensDosChamados.id,
        especie: mensagensDosChamados.especie,
        texto: mensagensDosChamados.texto,
        autorConta: mensagensDosChamados.autorConta,
        autorPessoa: mensagensDosChamados.autorPessoa,
        criadaEm: mensagensDosChamados.criadaEm,
      })
      .from(mensagensDosChamados)
      .where(
        and(
          eq(mensagensDosChamados.chamadoId, chamado.id),
          inArray(mensagensDosChamados.especie, especies),
        ),
      )
      .orderBy(desc(mensagensDosChamados.criadaEm), desc(mensagensDosChamados.id))
      .limit(ULTIMAS_DO_RESUMO)
  ).reverse();
  const anexosDasUltimas = await nomesDosAnexosDasMensagens(
    tx,
    ultimas.map(({ id }) => id),
  );
  const nome = await nomesDe(
    tx,
    new Set(ultimas.flatMap(({ autorConta }) => (autorConta === null ? [] : [autorConta]))),
    new Set(ultimas.flatMap(({ autorPessoa }) => (autorPessoa === null ? [] : [autorPessoa]))),
  );
  const ligado =
    chamado.ativoId === null
      ? undefined
      : (await ativosPorId(tx, new Set([chamado.ativoId]))).get(chamado.ativoId);
  return {
    ...base,
    abrir: participa ? 'chat' : 'chamados',
    detalhes: {
      ultimas: ultimas.map((ultima) => ({
        especie: ultima.especie === 'nota' ? 'nota' : 'mensagem',
        texto: ultima.texto ?? comecoDoTexto(null, anexosDasUltimas.get(ultima.id)),
        autor:
          ultima.autorConta !== null
            ? nome.conta(ultima.autorConta)
            : nome.pessoa(ultima.autorPessoa ?? ''),
        minha: ultima.autorConta === conta.id || ultima.autorPessoa === conta.pessoaId,
        em: ultima.criadaEm.toISOString(),
      })),
      ativo: ligado ? { nome: ligado.rotulo, patrimonio: ligado.patrimonio } : null,
      abertoEm: chamado.abertoEm.toISOString(),
    },
  };
}
