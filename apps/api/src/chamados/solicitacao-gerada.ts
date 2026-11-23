// A solicitação gerada pelo tipo na abertura do chamado (spec solicitacoes, "Solicitação pelo
// chamado"; tipos-de-chamado, "O que acontece depois"; change chamados-da-ti, design, "A
// solicitação gerada pelo tipo (tarefa 4.18)"), na transação da abertura:
// - com o módulo Operação desligado, nada é registrado;
// - o Toner é o "Pedir toner" sem a tela: o ativo ligado, a impressora pela conferência do registro,
//   com a trava dela, e a pendente a que o chamado se junta ou o registro com a cor do chamado;
// - o Equipamento: o tipo de ativo do tipo de chamado, a quantidade 1, o motivo pelo chamado e o
//   local de trabalho da pessoa ou, sem ele, o do ativo ligado;
// - o registro de hoje, delegado pelo tipo, num ponto de salvamento: a recusa dele volta só o ponto,
//   e o chamado abre com o motivo na conversa;
// - o evento da conversa, `solicitacao` ou `solicitacao-nao-gerada`, que não sobe a versão; o do
//   Equipamento sem local guarda só o caso, sem o nome da pessoa, que a ficha escreve com o de agora.
import {
  chamados,
  mensagensDosChamados,
  type Transacao,
  tiposDeAtivo,
  type tiposDeChamado,
} from '@grafite/db';
import {
  type CampoDoFormulario,
  type ComoOChamadoTemASolicitacao,
  type DadosDaSolicitacao,
  type DadosDaSolicitacaoNaoGerada,
  type EventoDaAcao,
  motivoDaSolicitacaoNaoGerada,
  motivoDoEquipamento,
  type SolicitacaoNaoGerada,
} from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { sessaoDa } from '../acesso/escopo.ts';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { registrarEvento } from '../eventos/saida.ts';
import { ProblemaDaApi } from '../problemas.ts';
import type { LeitorDasSolicitacoes } from '../solicitacoes/leitura.ts';
import { conferirImpressora, publicoDosLocais, registrar } from '../solicitacoes/registro.ts';
import { corDaImpressora, pendenteDa, travarAImpressora } from './toner.ts';

/** O chamado recém-aberto, como a geração o lê. */
export interface ChamadoQueGera {
  id: string;
  numero: number;
  titulo: string;
  tipo: Pick<
    typeof tiposDeChamado.$inferSelect,
    'nome' | 'geraSolicitacao' | 'tipoDeAtivoDoEquipamento'
  >;
  pessoa: { id: string; localId: string | null };
  campos: readonly CampoDoFormulario[];
  respostas: Readonly<Record<string, unknown>>;
  /** O ativo ligado, ou nulo. */
  ativo: { id: string; localId: string | null } | null;
}

interface Contexto {
  requisicao: FastifyRequest;
  momento: Date;
  leitor: LeitorDasSolicitacoes;
}

/** O que a geração pede ao registro, e os nomes que o motivo da recusa usa. */
type Pedido =
  | {
      gerar: DadosDaSolicitacao;
      nomes: () => Promise<{ tipoDeAtivo: string | null; local: string | null }>;
    }
  | { juntou: { id: string; numero: number } }
  | { naoGerada: DadosDaSolicitacaoNaoGerada };

/** Os eventos da conversa que a geração grava. */
type EventoDaSolicitacao = Extract<
  EventoDaAcao,
  { evento: 'solicitacao' | 'solicitacao-nao-gerada' }
>;

const SEM_NOMES = { tipoDeAtivo: null, local: null };

/** O motivo escrito na hora. */
const pelo = (caso: SolicitacaoNaoGerada): DadosDaSolicitacaoNaoGerada => ({
  motivo: motivoDaSolicitacaoNaoGerada(caso),
});

/** O Toner: a impressora do chamado, a pendente dela ou o registro com a cor do chamado. */
async function pedidoDoToner(
  tx: Transacao,
  chamado: ChamadoQueGera,
  leitor: LeitorDasSolicitacoes,
): Promise<Pedido> {
  if (chamado.ativo === null) return { naoGerada: pelo({ motivo: 'sem-ativo' }) };
  const impressoraId = chamado.ativo.id;
  await travarAImpressora(tx, impressoraId);
  const conferencia = await conferirImpressora(tx, impressoraId, leitor);
  if (!('impressora' in conferencia)) {
    return {
      naoGerada: pelo({ motivo: 'recusa', frase: conferencia.mensagem, nomes: SEM_NOMES }),
    };
  }
  const pendente = await pendenteDa(tx, impressoraId);
  if (pendente) {
    // A solicitação ganhou um chamado: o evento vai também a quem a vê.
    await registrarEvento(tx, {
      tipo: 'solicitacoes.mudaram',
      alvo: { tipo: 'solicitacao', id: pendente.id },
      publico: { permissao: 'solicitacoes.ver', locais: publicoDosLocais(pendente) },
    });
    return { juntou: pendente };
  }
  const cor = await corDaImpressora(tx, conferencia.impressora, chamado);
  return {
    gerar: {
      tipo: 'toner',
      pessoa: chamado.pessoa.id,
      observacao: null,
      impressoras: [impressoraId],
      itens: [{ impressora: impressoraId, cor, quantidade: 1, consumivel: null }],
    },
    nomes: async () => SEM_NOMES,
  };
}

/** O Equipamento: o tipo de ativo do tipo de chamado, 1, o motivo e o local da pessoa ou do ativo. */
function pedidoDoEquipamento(
  tx: Transacao,
  chamado: ChamadoQueGera,
  leitor: LeitorDasSolicitacoes,
): Pedido {
  const local = chamado.pessoa.localId ?? chamado.ativo?.localId ?? null;
  if (local === null) return { naoGerada: { semLocal: true } };
  const tipoDeAtivo = chamado.tipo.tipoDeAtivoDoEquipamento;
  return {
    gerar: {
      tipo: 'equipamento',
      pessoa: chamado.pessoa.id,
      observacao: null,
      tipoDeAtivo,
      quantidade: 1,
      motivo: motivoDoEquipamento(chamado.numero, chamado.titulo),
      local,
    },
    // Os nomes de agora, lidos só para o motivo da recusa.
    nomes: async () => {
      const [tipo] =
        tipoDeAtivo === null
          ? []
          : await tx
              .select({ nome: tiposDeAtivo.nome })
              .from(tiposDeAtivo)
              .where(eq(tiposDeAtivo.id, tipoDeAtivo));
      return {
        tipoDeAtivo: tipo?.nome ?? null,
        local: leitor.arvore.local(local) ? leitor.arvore.caminho(local) : null,
      };
    },
  };
}

/**
 * Gera a solicitação do tipo do chamado recém-aberto e devolve a que ficou ligada a ele, ou nulo,
 * quando o tipo não gera ou a solicitação não foi gerada.
 */
export async function gerarSolicitacao(
  tx: Transacao,
  chamado: ChamadoQueGera,
  { requisicao, momento, leitor }: Contexto,
): Promise<{ numero: number } | null> {
  const { geraSolicitacao } = chamado.tipo;
  if (geraSolicitacao === 'nao') return null;
  const { contaId } = sessaoDa(requisicao);
  const noEvento = ({ evento, dados }: EventoDaSolicitacao) =>
    tx.insert(mensagensDosChamados).values({
      orgId: sql`app.current_org()`,
      chamadoId: chamado.id,
      especie: 'evento',
      autorConta: contaId,
      criadaEm: momento,
      evento,
      dados,
    });
  const naoGerada = async (dados: DadosDaSolicitacaoNaoGerada) => {
    await noEvento({ evento: 'solicitacao-nao-gerada', dados });
    return null;
  };
  const ligar = async (
    solicitacao: { id: string; numero: number },
    como: ComoOChamadoTemASolicitacao,
  ) => {
    await tx
      .update(chamados)
      .set({ solicitacaoId: solicitacao.id })
      .where(eq(chamados.id, chamado.id));
    await noEvento({ evento: 'solicitacao', dados: { numero: solicitacao.numero, como } });
    return { numero: solicitacao.numero };
  };

  if (!(await ligadoNaTransacao(tx, 'operacao'))) {
    return naoGerada(pelo({ motivo: 'modulo-desligado' }));
  }
  const pedido =
    geraSolicitacao === 'toner'
      ? await pedidoDoToner(tx, chamado, leitor)
      : pedidoDoEquipamento(tx, chamado, leitor);
  if ('naoGerada' in pedido) return naoGerada(pedido.naoGerada);
  if ('juntou' in pedido) return ligar(pedido.juntou, 'juntou');
  try {
    const registrada = await tx.transaction((ponto) =>
      registrar(ponto, pedido.gerar, {
        requisicao,
        momento,
        doChamado: { numero: chamado.numero, tipoDeChamado: chamado.tipo.nome, leitor },
      }),
    );
    return ligar(registrada, 'gerou');
  } catch (erro) {
    // Só a recusa do registro vira o motivo: o erro inesperado derruba a abertura.
    if (!(erro instanceof ProblemaDaApi)) throw erro;
    return naoGerada(
      pelo({
        motivo: 'recusa',
        frase: erro.dados.detalhe,
        campos: erro.dados.campos,
        nomes: await pedido.nomes(),
      }),
    );
  }
}
