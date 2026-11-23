// O chat da conta (spec chat, "Quem usa o chat", "Conversas", "Conversa direta", "Não lidas" e
// "Silenciar uma conversa"; spec modulo-chat, "Trilha do chat" e "Lista do Chat"; change
// chat-com-chamados, design, decisões 3 e 5; tarefa 3.1): o resumo da trilha e do dock, as conversas
// da conta, com as seções e os contadores, a escolha da pessoa da direta e a foto de quem usa o chat.
// Tudo pede o `chat.usar` e o módulo Chat ligado, pela guarda do escopo. Quem participa não é
// gravado: a consulta tem o mesmo corte do domínio (`participacao`), e as outras contas passam pelo
// corte do acesso (`chat/quem-usa.ts`).
import {
  type Banco,
  chamados,
  contas,
  conversas,
  leiturasDasConversas,
  leiturasDosChamados,
  mensagensDoChat,
  mensagensDosChamados,
  naOrganizacao,
  pessoas,
  TIPOS_DE_CONVERSA_NO_BANCO,
  type Transacao,
} from '@grafite/db';
import {
  chamadosComRespostaNova,
  MAXIMO_NO_CONTADOR,
  nomeNoChat,
  normalizarTexto,
  ordemDasEquipesECanais,
  ordemDasRecentes,
  respostaNova,
  totalDoChat,
} from '@grafite/domain';
import { and, asc, eq, inArray, isNotNull, isNull, like, ne, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { carregarGrupos } from '../acesso/acesso.ts';
import { sessaoDa } from '../acesso/escopo.ts';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { type Armazenamento, VARIANTES } from '../arquivos/armazenamento.ts';
import {
  entregarImagem,
  IMAGEM_ENTREGUE,
  imagemNaoEncontrada,
} from '../arquivos/imagem-do-registro.ts';
import { contendo } from '../busca.ts';
import { ContaDoChat, colunasDaConta, contaDoChat, lerContas } from '../chat/contas.ts';
import { usaOChatNaConsulta } from '../chat/quem-usa.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

/** As não lidas de cada conversa contam até 100: o contador mostra "99+" acima de 99. */
const LIMITE_DAS_NAO_LIDAS = MAXIMO_NO_CONTADOR + 1;

/** Quantas pessoas a escolha da direta traz. */
const NA_ESCOLHA = 20;

/**
 * Quantas candidatas a busca com palavras lê, no máximo, antes do corte pelo nome: a busca da pessoa
 * também tem o e-mail e a matrícula, e as que casam só por eles saem depois.
 */
const CANDIDATAS_DA_BUSCA = 500;

const ConversaNaLista = z
  .object({
    id: z.uuid(),
    tipo: z.enum(TIPOS_DE_CONVERSA_NO_BANCO),
    /** O nome da conversa para a conta: a direta, o da outra, com o "(TI)". */
    nome: z.string(),
    /** As mensagens dos outros depois da última lida, até 100. */
    naoLidas: z.number().int(),
    silenciada: z.boolean(),
    /** ISO 8601; a equipe e o canal sem nenhuma mensagem não têm. */
    ultimaMensagemEm: z.string().nullable(),
    /** A outra conta da direta; a equipe e o canal não têm. */
    outra: ContaDoChat.nullable(),
  })
  .meta({ id: 'ConversaNaLista' });

const ListaDoChat = z
  .object({
    /** As equipes e os canais ativos de que a conta participa, pelo nome. */
    equipesECanais: z.array(ConversaNaLista),
    /** As conversas diretas da conta, a da mensagem mais nova primeiro. */
    recentes: z.array(ConversaNaLista),
  })
  .meta({ id: 'ListaDoChat' });

const ResumoDoChat = z
  .object({
    /** O total do chat: as não lidas das conversas, fora as silenciadas. */
    naoLidas: z.number().int(),
    /** Os chamados abertos da conta com resposta nova; nulo com o módulo Chamados desligado. */
    chamadosComRespostaNova: z.number().int().nullable(),
  })
  .meta({ id: 'ResumoDoChat' });

const PessoasDoChat = z
  .object({
    pessoas: z.array(
      ContaDoChat.extend({
        /** A conversa direta que já existe com a pessoa: escolhê-la abre a mesma conversa. */
        conversa: z.uuid().nullable(),
      }),
    ),
  })
  .meta({ id: 'PessoasDoChat' });

const BuscaDaPessoa = z.object({
  busca: z.string().max(100, { error: 'Use até 100 caracteres.' }).optional(),
});

const ParametrosDaFoto = z.object({
  id: z.uuid({ error: 'Imagem não encontrada.' }),
  arquivo: z.uuid({ error: 'Imagem não encontrada.' }),
  tamanho: z.enum(VARIANTES, { error: 'Use 64, 128, 256, 512 ou completa.' }),
});

const PROBLEMAS_DO_CHAT = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

/** A conversa da conta, com os contadores dela, antes dos nomes. */
interface LinhaDaConversa {
  id: string;
  tipo: (typeof TIPOS_DE_CONVERSA_NO_BANCO)[number];
  nome: string | null;
  ultimaMensagemEm: Date | null;
  contaA: string | null;
  contaB: string | null;
  silenciada: boolean;
  naoLidas: number;
}

/**
 * As conversas de que a conta participa e que ficam nas listas: as diretas dela, também com quem
 * não usa mais o chat, que ficam para ler; as equipes ativas dos grupos ativos de que ela é agora; e
 * os canais ativos. As arquivadas saem das listas, embora abram para ler pelo link. A conta da
 * sessão usa o chat, pela guarda.
 */
async function conversasDaConta(tx: Transacao, contaId: string): Promise<LinhaDaConversa[]> {
  const grupos = await carregarGrupos(tx, contaId);
  const naoLidas = sql<number>`(select count(*)::int from (
      select 1 from ${mensagensDoChat}
      where ${mensagensDoChat.conversaId} = ${conversas.id}
        and ${mensagensDoChat.especie} = 'mensagem'
        and ${mensagensDoChat.autorConta} <> ${contaId}
        and (${leiturasDasConversas.lidaAte} is null
          or ${mensagensDoChat.id} > ${leiturasDasConversas.lidaAte})
      limit ${LIMITE_DAS_NAO_LIDAS}) as nao_lidas)`;
  const linhas = await tx
    .select({
      id: conversas.id,
      tipo: conversas.tipo,
      nome: conversas.nome,
      ultimaMensagemEm: conversas.ultimaMensagemEm,
      contaA: conversas.contaA,
      contaB: conversas.contaB,
      silenciada: leiturasDasConversas.silenciada,
      naoLidas,
    })
    .from(conversas)
    .leftJoin(
      leiturasDasConversas,
      and(
        eq(leiturasDasConversas.orgId, conversas.orgId),
        eq(leiturasDasConversas.conversaId, conversas.id),
        eq(leiturasDasConversas.contaId, contaId),
      ),
    )
    .where(
      or(
        and(
          eq(conversas.tipo, 'direta'),
          or(eq(conversas.contaA, contaId), eq(conversas.contaB, contaId)),
        ),
        and(
          isNull(conversas.arquivadaEm),
          or(
            eq(conversas.tipo, 'canal'),
            grupos.length > 0
              ? and(eq(conversas.tipo, 'equipe'), inArray(conversas.grupoId, grupos))
              : undefined,
          ),
        ),
      ),
    );
  return linhas.map((linha) => ({ ...linha, silenciada: linha.silenciada ?? false }));
}

/**
 * Os chamados abertos de que a conta participa com resposta nova: os da pessoa dela e os que ela
 * abriu pelo chat (`participaDoChamado`), com as mensagens da TI de outra conta, que o domínio conta
 * depois da `vista_ate` (`respostaNova`).
 */
async function chamadosComResposta(tx: Transacao, contaId: string): Promise<number> {
  const [conta] = await tx
    .select({ pessoaId: contas.pessoaId })
    .from(contas)
    .where(eq(contas.id, contaId));
  if (!conta) return 0;
  const abertos = await tx
    .select({
      id: chamados.id,
      situacao: chamados.situacao,
      vistaAte: leiturasDosChamados.vistaAte,
    })
    .from(chamados)
    .leftJoin(
      leiturasDosChamados,
      and(
        eq(leiturasDosChamados.orgId, chamados.orgId),
        eq(leiturasDosChamados.chamadoId, chamados.id),
        eq(leiturasDosChamados.contaId, contaId),
      ),
    )
    .where(
      and(
        ne(chamados.situacao, 'resolvido'),
        or(
          eq(chamados.pessoaId, conta.pessoaId),
          and(eq(chamados.origem, 'chat'), eq(chamados.abertoPor, contaId)),
        ),
      ),
    );
  if (abertos.length === 0) return 0;
  const linhas = await tx
    .select({
      chamadoId: mensagensDosChamados.chamadoId,
      id: mensagensDosChamados.id,
      especie: mensagensDosChamados.especie,
      autorConta: mensagensDosChamados.autorConta,
    })
    .from(mensagensDosChamados)
    .where(
      and(
        inArray(
          mensagensDosChamados.chamadoId,
          abertos.map(({ id }) => id),
        ),
        eq(mensagensDosChamados.especie, 'mensagem'),
        isNotNull(mensagensDosChamados.autorConta),
      ),
    );
  return chamadosComRespostaNova(
    abertos.map((chamado) => ({
      respostaNova: respostaNova({
        situacao: chamado.situacao,
        linhas: linhas.filter(({ chamadoId }) => chamadoId === chamado.id),
        contaId,
        vistaAte: chamado.vistaAte,
        pelaTi: false,
      }),
    })),
  );
}

export const rotasDoChat: FastifyPluginAsyncZod<{
  banco: Banco;
  armazenamento: Armazenamento;
}> = async (app, deps) => {
  const { banco } = deps;

  app.get(
    '/chat/resumo',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'O total do chat e os chamados com resposta nova, para a trilha e o dock',
        response: { 200: ResumoDoChat, ...PROBLEMAS_DO_CHAT },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => ({
        naoLidas: totalDoChat(await conversasDaConta(tx, contaId)),
        chamadosComRespostaNova: (await ligadoNaTransacao(tx, 'chamados'))
          ? await chamadosComResposta(tx, contaId)
          : null,
      }));
    },
  );

  app.get(
    '/chat/conversas',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'As conversas da conta: as equipes e os canais e as diretas, com os contadores',
        response: { 200: ListaDoChat, ...PROBLEMAS_DO_CHAT },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linhas = await conversasDaConta(tx, contaId);
        const outraDa = (linha: LinhaDaConversa) =>
          linha.contaA === contaId ? linha.contaB : linha.contaA;
        const outras = [
          ...new Set(
            linhas.flatMap((linha) => (linha.tipo === 'direta' ? [outraDa(linha) ?? ''] : [])),
          ),
        ];
        const porConta = await lerContas(tx, outras);

        const naLista = (linha: LinhaDaConversa) => {
          const outra = linha.tipo === 'direta' ? porConta.get(outraDa(linha) ?? '') : undefined;
          return {
            id: linha.id,
            tipo: linha.tipo,
            nome: outra ? nomeNoChat(outra.nome, outra.daTi) : (linha.nome ?? ''),
            naoLidas: linha.naoLidas,
            silenciada: linha.silenciada,
            ultimaMensagemEm: linha.ultimaMensagemEm,
            outra: outra ? contaDoChat(outra) : null,
          };
        };
        const emTexto = <T extends { ultimaMensagemEm: Date | null }>(item: T) => ({
          ...item,
          ultimaMensagemEm: item.ultimaMensagemEm?.toISOString() ?? null,
        });
        return {
          equipesECanais: ordemDasEquipesECanais(
            linhas.filter((linha) => linha.tipo !== 'direta').map(naLista),
          ).map(emTexto),
          recentes: ordemDasRecentes(
            linhas
              .filter((linha) => linha.tipo === 'direta')
              // A direta nasce com a primeira mensagem: o banco exige a hora dela.
              .map((linha) => ({
                ...naLista(linha),
                ultimaMensagemEm: linha.ultimaMensagemEm ?? new Date(0),
              })),
          ).map(emTexto),
        };
      });
    },
  );

  app.get(
    '/chat/pessoas',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'As pessoas que usam o chat, para escolher a conversa direta, até 20',
        querystring: BuscaDaPessoa,
        response: { 200: PessoasDoChat, ...PROBLEMAS_DO_CHAT },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const palavras = normalizarTexto(requisicao.query.busca ?? '')
        .split(' ')
        .filter(Boolean);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        // O par da direta fica na ordem do banco, a menor primeiro.
        const conversa = sql<string | null>`(select ${conversas.id} from ${conversas}
          where ${conversas.tipo} = 'direta'
            and ${conversas.contaA} = least(${contaId}::uuid, ${contas.id})
            and ${conversas.contaB} = greatest(${contaId}::uuid, ${contas.id}))`;
        const consulta = tx
          .select({ ...colunasDaConta, conversa })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .where(
            and(
              ne(contas.id, contaId),
              // A busca da pessoa também tem o e-mail e a matrícula: o banco traz as candidatas, e
              // só as que casam pelo nome ficam.
              ...palavras.map((palavra) => like(pessoas.busca, contendo(palavra))),
              usaOChatNaConsulta(contas.id),
            ),
          )
          .orderBy(asc(pessoas.nome), asc(contas.id));
        const candidatas = await consulta.limit(
          palavras.length > 0 ? CANDIDATAS_DA_BUSCA : NA_ESCOLHA,
        );
        return {
          pessoas: candidatas
            .filter(({ nome }) => {
              const doNome = normalizarTexto(nome);
              return palavras.every((palavra) => doNome.includes(palavra));
            })
            .slice(0, NA_ESCOLHA)
            .map((linha) => ({ ...contaDoChat(linha), conversa: linha.conversa })),
        };
      });
    },
  );

  app.get(
    '/chat/contas/:id/foto/:arquivo/:tamanho',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Um tamanho da foto da pessoa de uma conta que usa o chat',
        params: ParametrosDaFoto,
        response: { 200: IMAGEM_ENTREGUE, ...PROBLEMAS_DO_CHAT },
      },
    },
    async (requisicao, resposta) => {
      const { id, arquivo, tamanho } = requisicao.params;
      return entregarImagem(deps, requisicao, resposta, {
        arquivo,
        tamanho,
        // A conta que não usa o chat responde como a imagem que falta.
        imagemAtual: async (tx) => {
          const [linha] = await tx
            .select({ fotoId: pessoas.fotoId })
            .from(contas)
            .innerJoin(
              pessoas,
              and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)),
            )
            .where(and(eq(contas.id, id), usaOChatNaConsulta(contas.id)));
          if (!linha) throw imagemNaoEncontrada();
          return linha.fotoId;
        },
      });
    },
  );
};
