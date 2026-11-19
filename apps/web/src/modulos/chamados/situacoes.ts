// A situação do chamado em texto (spec modulo-chamados, "Selos, prazo em texto e movimento" e
// "Busca dos chamados"): o rótulo do selo, o mesmo nas telas e na busca.
import type { SituacaoDoChamado } from '@grafite/domain';

export const ROTULO_DA_SITUACAO: Readonly<Record<SituacaoDoChamado, string>> = {
  triagem: 'Na triagem',
  'em-atendimento': 'Em atendimento',
  aguardando: 'Aguardando o colaborador',
  resolvido: 'Resolvido',
};
