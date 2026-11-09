// O evento das importações (spec importacao-de-ativos; design do P1e, decisão 8): a importação é só
// de quem importou, e o evento `importacoes.mudaram` vai só às sessões dessa conta.
import type { Transacao } from '@grafite/db';
import type { PublicoDoEvento } from '@grafite/domain';
import { registrarEvento } from './saida.ts';

/** Quem recebe o evento de uma importação: as sessões da conta que importou. */
export const publicoDaImportacao = (importacao: { criadaPor: string }): PublicoDoEvento => ({
  contas: [importacao.criadaPor],
});

/** O evento da importação, sem auditoria, como no envio, no descarte e no avanço da tarefa. */
export const avisarQuemImportou = (tx: Transacao, importacao: { id: string; criadaPor: string }) =>
  registrarEvento(tx, {
    tipo: 'importacoes.mudaram',
    alvo: { tipo: 'importacao', id: importacao.id },
    publico: publicoDaImportacao(importacao),
  });
