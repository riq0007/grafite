// A tarefa da importação (spec importacao-de-ativos, "Aplicação na fila"; design do P1e, decisão 7):
// grava as linhas da planilha uma a uma, cada uma numa transação que também avança `processadas`,
// com a origem "planilha", a conta que importou como autor e o acesso dela no momento. O ativo casado
// é relido com a linha travada, e a regra da linha é a da prévia: a trava ligada depois da prévia
// vale. A linha com erro não grava nada, e as recusas dela vão para `erros_da_importacao`.
// Interrompida, a tarefa volta pela fila e continua da linha seguinte à última gravada; as linhas já
// gravadas passam de novo pelo casamento, para as seguintes saberem quem elas mudaram. Falhando em
// todas as tentativas, a importação fica "Com falha", e "Tentar de novo" continua.
import {
  errosDaImportacao,
  importacoes,
  naOrganizacao,
  type TotaisDaImportacao,
} from '@grafite/db';
import {
  type AcaoDaLinha,
  criarCasamento,
  type ErroDaLinha,
  identificacaoDaLinha,
  planejarLinha,
} from '@grafite/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { carregarAcesso } from '../acesso/acesso.ts';
import { gravarAtivo } from '../ativos/escrita.ts';
import { lerAtivo } from '../ativos/leitura.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { avisarQuemImportou, publicoDaImportacao } from '../eventos/importacoes.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from '../fila/tarefas.ts';
import { ProblemaDaApi } from '../problemas.ts';
import {
  ativoAtual,
  ativoNovoNoIndice,
  contextoDaLinha,
  lerBaseDaImportacao,
  lerTipoDaImportacao,
} from './regra.ts';

export const TAREFA_DA_IMPORTACAO = 'importacao-de-ativos';

/** De quantas em quantas linhas a tela de quem importou é avisada do avanço. */
const AVISO_A_CADA = 25;

const INTERROMPIDA = 'A importação foi interrompida e continua de onde parou.';

/** As situações em que a tarefa grava: a fila, a aplicação interrompida e a que falhou. */
const QUE_GRAVAM = ['na-fila', 'aplicando', 'com-falha'] as const;

const TOTAL_DA_ACAO = {
  novo: 'novos',
  alterar: 'alterados',
  'sem-mudanca': 'semMudanca',
  'com-erro': 'comErro',
} as const satisfies Record<AcaoDaLinha, keyof TotaisDaImportacao>;

const somar = (totais: TotaisDaImportacao, acao: AcaoDaLinha): TotaisDaImportacao => ({
  ...totais,
  [TOTAL_DA_ACAO[acao]]: totais[TOTAL_DA_ACAO[acao]] + 1,
});

/** As recusas de uma gravação, como as da tela, pelos rótulos dos campos. */
function errosDoProblema(
  problema: ProblemaDaApi,
  rotuloDe: (chave: string) => string | undefined,
): ErroDaLinha[] {
  const { campos, detalhe } = problema.dados;
  if (!campos || Object.keys(campos).length === 0) return [{ campo: null, mensagem: detalhe }];
  return Object.entries(campos).map(([chave, mensagem]) => ({
    campo:
      chave === 'modeloId'
        ? 'Modelo'
        : chave.startsWith('valores.')
          ? (rotuloDe(chave.slice('valores.'.length)) ?? null)
          : null,
    mensagem,
  }));
}

interface DadosDaImportacao {
  orgId: string;
  importacaoId: string;
}

export function tarefaDaImportacao({
  banco,
  agora,
  log,
}: ContextoDasTarefas): DefinicaoDeTarefa<DadosDaImportacao> {
  return {
    nome: TAREFA_DA_IMPORTACAO,
    rotulo: 'Importação de ativos',
    dados: z.object({ orgId: z.uuid(), importacaoId: z.uuid() }),
    // Cinco novas tentativas, a partir de 1 min, até 1 h; 1 h para rodar, e o sinal de vida a cada
    // 60 s, para a tarefa de uma API que caiu voltar sem esperar a hora inteira.
    opcoes: {
      retryLimit: 5,
      retryDelay: 60,
      retryBackoff: true,
      retryDelayMax: 60 * 60,
      expireInSeconds: 60 * 60,
      heartbeatSeconds: 60,
      deadLetter: FILA_DAS_FALHAS,
    },

    async aoFalhar({ importacaoId }, tx) {
      const [falhou] = await tx
        .update(importacoes)
        .set({ situacao: 'com-falha', atualizadaEm: agora() })
        .where(
          and(
            eq(importacoes.id, importacaoId),
            inArray(importacoes.situacao, ['na-fila', 'aplicando']),
          ),
        )
        .returning({ id: importacoes.id, criadaPor: importacoes.criadaPor });
      if (falhou) await avisarQuemImportou(tx, falhou);
    },

    async trabalho({ orgId, importacaoId }, { sinal }) {
      // O começo: a importação que grava, e a base lida uma vez para a planilha inteira.
      const inicio = await naOrganizacao(banco, orgId, async (tx) => {
        const [importacao] = await tx
          .select()
          .from(importacoes)
          .where(eq(importacoes.id, importacaoId))
          .for('update');
        if (!importacao?.conteudo) return null;
        if (!(QUE_GRAVAM as readonly string[]).includes(importacao.situacao)) return null;
        if (importacao.situacao !== 'aplicando') {
          await tx
            .update(importacoes)
            .set({ situacao: 'aplicando', atualizadaEm: agora() })
            .where(eq(importacoes.id, importacao.id));
          await avisarQuemImportou(tx, importacao);
        }
        const tipo = await lerTipoDaImportacao(tx, importacao.tipoId);
        if (!tipo) throw new Error('O tipo da importação não foi encontrado.');
        return { importacao, base: await lerBaseDaImportacao(tx, tipo) };
      });
      if (!inicio) return;
      const { importacao, base } = inicio;
      const conteudo = importacao.conteudo ?? [];
      const { mapeamento } = importacao;
      const pelaImportacao = { id: importacao.id, arquivo: importacao.nomeDoArquivo };

      const casamento = criarCasamento(base.indice, base.tipo.id);
      for (const { linha, celulas } of conteudo.slice(0, importacao.processadas)) {
        casamento.casar(linha, identificacaoDaLinha(celulas, mapeamento));
      }

      for (let posicao = importacao.processadas; posicao < conteudo.length; posicao += 1) {
        if (sinal.aborted) throw new Error(INTERROMPIDA);
        const { linha, celulas } = conteudo[posicao] ?? { linha: 0, celulas: [] };
        const seguiu = await naOrganizacao(banco, orgId, async (tx) => {
          const [agoraNaImportacao] = await tx
            .select({
              situacao: importacoes.situacao,
              processadas: importacoes.processadas,
              totais: importacoes.totais,
            })
            .from(importacoes)
            .where(eq(importacoes.id, importacaoId))
            .for('update');
          // Outra execução passou desta linha, ou a importação saiu da aplicação: esta para.
          if (
            agoraNaImportacao?.situacao !== 'aplicando' ||
            agoraNaImportacao.processadas !== posicao
          ) {
            return false;
          }
          const acesso = await carregarAcesso(tx, importacao.criadaPor);
          const casado = casamento.casar(linha, identificacaoDaLinha(celulas, mapeamento));
          const doAtivo =
            casado.tipo === 'casado' ? await lerAtivo(tx, casado.ativo.id, { travar: true }) : null;
          const plano = planejarLinha(
            linha,
            celulas,
            casado,
            doAtivo ? ativoAtual(doAtivo.ativo) : null,
            contextoDaLinha(base, { mapeamento, casamento, acesso }),
          );

          let acao = plano.acao;
          let erros = plano.erros;
          if (acao === 'novo' || acao === 'alterar') {
            try {
              // Num ponto de retorno: a recusa da gravação não desfaz o avanço da importação.
              const gravado = await tx.transaction((ponto) =>
                gravarAtivo(ponto, {
                  quem: {
                    contaId: importacao.criadaPor,
                    acesso,
                    origem: 'planilha',
                    rastreio: null,
                    importacao: pelaImportacao,
                  },
                  arvore: base.arvore,
                  momento: agora(),
                  atual: doAtivo,
                  tipoId: base.tipo.id,
                  pedido: plano.pedido,
                  lerLinha: (ativoId) => lerAtivo(ponto, ativoId),
                }),
              );
              if (acao === 'novo') {
                casamento.acrescentar(linha, ativoNovoNoIndice(base, gravado.id, plano));
              } else if (!gravado.mudou) acao = 'sem-mudanca';
            } catch (erro) {
              if (!(erro instanceof ProblemaDaApi)) throw erro;
              acao = 'com-erro';
              erros = errosDoProblema(
                erro,
                (chave) => base.tipo.definicoes.porChave.get(chave)?.rotulo,
              );
            }
          }
          if (acao === 'com-erro') {
            await tx.insert(errosDaImportacao).values({
              orgId: sql`app.current_org()`,
              importacaoId,
              linha,
              mensagens: erros,
            });
          }
          await tx
            .update(importacoes)
            .set({
              processadas: posicao + 1,
              totais: somar(agoraNaImportacao.totais, acao),
              atualizadaEm: agora(),
            })
            .where(eq(importacoes.id, importacaoId));
          if ((posicao + 1) % AVISO_A_CADA === 0) await avisarQuemImportou(tx, importacao);
          return true;
        });
        if (!seguiu) return;
      }

      // O fim: concluída, sem o conteúdo da planilha, com a auditoria e o evento.
      await naOrganizacao(banco, orgId, async (tx) => {
        const [fim] = await tx
          .select({
            situacao: importacoes.situacao,
            processadas: importacoes.processadas,
            totais: importacoes.totais,
          })
          .from(importacoes)
          .where(eq(importacoes.id, importacaoId))
          .for('update');
        if (fim?.situacao !== 'aplicando' || fim.processadas !== conteudo.length) return;
        const momento = agora();
        await tx
          .update(importacoes)
          .set({
            situacao: 'concluida',
            conteudo: null,
            concluidaEm: momento,
            atualizadaEm: momento,
          })
          .where(eq(importacoes.id, importacaoId));
        await registrarNaAuditoria(tx, {
          acao: 'importacao.concluida',
          ator: { tipo: 'conta', contaId: importacao.criadaPor },
          alvo: { tipo: 'importacao', id: importacaoId },
          dados: { tipo: base.tipo.nome, arquivo: importacao.nomeDoArquivo, totais: fim.totais },
          momento,
          saida: { publico: publicoDaImportacao(importacao) },
        });
      });
      log.info(
        { orgId, importacao: importacaoId, linhas: conteudo.length },
        'importação concluída',
      );
    },
  };
}
