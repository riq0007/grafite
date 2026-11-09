// Os eventos de saída (F2c, design, decisão 9): o aviso de que um registro mudou, gravado na mesma
// transação da mudança e entregue às telas abertas. O evento leva só o tipo e identificadores, e o
// público diz quem pode recebê-lo; a API filtra cada conexão por `podeReceber`.
import { type Acesso, pode, podeEm } from '../acesso/acesso.ts';
import type { Permissao } from '../acesso/permissoes.ts';
import type { AcaoDaAuditoria } from '../auditoria/acoes.ts';
import type { ArvoreDeLocais } from '../locais/arvore.ts';

/** Os tipos de evento, na ordem da tabela da spec eventos-em-tempo-real. */
export const TIPOS_DE_EVENTO = [
  'pessoas.mudaram',
  'locais.mudaram',
  'acessos.mudaram',
  'padroes.mudaram',
  'preferencias.mudaram',
  'sessao.encerrada',
  'tarefas.mudaram',
  'operacao.mudou',
  'catalogo.mudou',
  'ativos.mudaram',
  'modulos.mudaram',
  'visoes.mudaram',
  'importacoes.mudaram',
  'disponibilidade.mudou',
  'coletores.mudaram',
  'cofre.mudou',
  'alertas.mudaram',
  'notificacoes.mudaram',
  'fornecedores.mudaram',
  'consumiveis.mudaram',
  'estoque.mudou',
  'solicitacoes.mudaram',
  'ordens.mudaram',
  'metas.mudaram',
  'controlid.mudaram',
  'mapa.mudou',
  'salas.mudaram',
  'paineis.mudaram',
  'diretorio.mudou',
  'software.mudou',
] as const;

export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

/**
 * Quem recebe o evento: basta uma das partes valer.
 * - `todas`: toda sessão da organização;
 * - `permissao`: quem tem a permissão, em algum escopo; com `locais`, só quem a tem no ramo de um
 *   deles (o local de antes e o de depois da mudança), e `null` é o registro sem local, que só a
 *   organização inteira alcança;
 * - `contas` e `sessoes`: essas contas e essas sessões, tenham ou não a permissão.
 */
export interface PublicoDoEvento {
  todas?: boolean;
  permissao?: Permissao;
  locais?: readonly (string | null)[];
  contas?: readonly string[];
  sessoes?: readonly string[];
}

export interface AlvoDoEvento {
  tipo: string;
  id: string | null;
}

export interface EventoDeSaida {
  /** uuidv7: ordenado pelo momento da inclusão, e não pelo do commit. */
  id: string;
  orgId: string;
  /** ISO 8601. */
  momento: string;
  tipo: TipoDeEvento;
  alvo: AlvoDoEvento | null;
  publico: PublicoDoEvento;
}

/** O evento que cada ação auditada grava; `null` nas que não mudam o que alguma tela mostra. */
export const EVENTO_DA_ACAO = {
  // Acesso (F2a)
  'entrada.concluida': null,
  'entrada.recusada': null,
  'entrada.bloqueada': null,
  'sessao.iniciada': null,
  'sessao.encerrada': 'sessao.encerrada',
  'segundo-passo.recusado': null,
  'codigo-de-recuperacao.usado': null,
  'senha.recusada': null,
  'senha.trocada': 'pessoas.mudaram',
  'dois-passos.ativados': 'pessoas.mudaram',
  'dois-passos.desativados': 'pessoas.mudaram',
  'codigos-de-recuperacao.gerados': null,
  'organizacao.criada': null,
  'endereco.registrado': null,
  'endereco.removido': null,
  'acesso.redefinido': 'pessoas.mudaram',
  // Permissões (F2b)
  'permissao.recusada': null,
  // Locais
  'local.criado': 'locais.mudaram',
  'local.alterado': 'locais.mudaram',
  'local.movido': 'locais.mudaram',
  'local.inativado': 'locais.mudaram',
  'local.reativado': 'locais.mudaram',
  // Pessoas e contas
  'pessoa.criada': 'pessoas.mudaram',
  'pessoa.alterada': 'pessoas.mudaram',
  'pessoa.inativada': 'pessoas.mudaram',
  'pessoa.reativada': 'pessoas.mudaram',
  'pessoa.anonimizada': 'pessoas.mudaram',
  'conta.criada': 'pessoas.mudaram',
  'conta.alterada': 'pessoas.mudaram',
  'conta.inativada': 'pessoas.mudaram',
  'conta.reativada': 'pessoas.mudaram',
  'dois-passos.removidos': 'pessoas.mudaram',
  'entrada.desbloqueada': 'pessoas.mudaram',
  'sessoes.encerradas': 'pessoas.mudaram',
  // Perfis, grupos e atribuições
  'perfil.criado': 'acessos.mudaram',
  'perfil.alterado': 'acessos.mudaram',
  'perfil.inativado': 'acessos.mudaram',
  'perfil.reativado': 'acessos.mudaram',
  'grupo.criado': 'acessos.mudaram',
  'grupo.alterado': 'acessos.mudaram',
  'grupo.inativado': 'acessos.mudaram',
  'grupo.reativado': 'acessos.mudaram',
  'membro.incluido': 'acessos.mudaram',
  'membro.retirado': 'acessos.mudaram',
  'atribuicao.criada': 'acessos.mudaram',
  'atribuicao.encerrada': 'acessos.mudaram',
  // Plataforma (F2c)
  'padroes.alterados': 'padroes.mudaram',
  'foto.trocada': 'pessoas.mudaram',
  'foto.removida': 'pessoas.mudaram',
  'tarefa.repetida': 'tarefas.mudaram',
  // Operação (F2d): o fim do backup pedido grava o evento, e não o pedido
  'backup.solicitado': null,
  'agenda-do-backup.alterada': 'operacao.mudou',
  // Catálogo de ativos (P1a): dado de referência, como os locais
  'tipo-de-ativo.criado': 'catalogo.mudou',
  'tipo-de-ativo.alterado': 'catalogo.mudou',
  'tipo-de-ativo.inativado': 'catalogo.mudou',
  'tipo-de-ativo.reativado': 'catalogo.mudou',
  'campo.criado': 'catalogo.mudou',
  'campo.alterado': 'catalogo.mudou',
  'campo.inativado': 'catalogo.mudou',
  'campo.reativado': 'catalogo.mudou',
  'modelo.criado': 'catalogo.mudou',
  'modelo.alterado': 'catalogo.mudou',
  'modelo.inativado': 'catalogo.mudou',
  'modelo.reativado': 'catalogo.mudou',
  'imagem-do-modelo.trocada': 'catalogo.mudou',
  'imagem-do-modelo.removida': 'catalogo.mudou',
  // Ativos (P1b): o público é dado por quem grava, pelos locais de antes e de depois
  'ativo.criado': 'ativos.mudaram',
  'ativo.alterado': 'ativos.mudaram',
  'ativo.inativado': 'ativos.mudaram',
  'ativo.reativado': 'ativos.mudaram',
  // A ficha e as ligações dos ativos (P1d), com o público dado por quem grava, como acima
  'ativo.ligado': 'ativos.mudaram',
  'ativo.desligado': 'ativos.mudaram',
  'imagem-do-ativo.trocada': 'ativos.mudaram',
  'imagem-do-ativo.removida': 'ativos.mudaram',
  // Módulos da organização (P1b)
  'modulo.ligado': 'modulos.mudaram',
  'modulo.desligado': 'modulos.mudaram',
  // Visões da organização (P1c)
  'visao.criada': 'visoes.mudaram',
  'visao.alterada': 'visoes.mudaram',
  'visao.removida': 'visoes.mudaram',
  // Importação de ativos (P1e): só as sessões de quem importou, dadas por quem grava
  'importacao.aplicada': 'importacoes.mudaram',
  'importacao.concluida': 'importacoes.mudaram',
  // Coletores (P2a); a mudança da disponibilidade vem do lote, sem ação auditada
  'coletor.criado': 'coletores.mudaram',
  'coletor.alterado': 'coletores.mudaram',
  'token-do-coletor.trocado': 'coletores.mudaram',
  'coletor.inativado': 'coletores.mudaram',
  'coletor.reativado': 'coletores.mudaram',
  // Cofre (P6): o que muda os dados, o valor ou o acesso de um segredo; a liberação, a revelação e a
  // cópia não gravam evento, e nenhum evento leva o nome ou o valor
  'segredo.criado': 'cofre.mudou',
  'segredo.alterado': 'cofre.mudou',
  'valor-do-segredo.trocado': 'cofre.mudou',
  'acesso-do-segredo.alterado': 'cofre.mudou',
  'segredo.inativado': 'cofre.mudou',
  'segredo.reativado': 'cofre.mudou',
  'cofre.liberado': null,
  'liberacao-do-cofre.recusada': null,
  'segredo.revelado': null,
  'segredo.copiado': null,
  'revelacao-do-segredo.recusada': null,
  'copia-do-segredo.recusada': null,
  'chave-do-cofre.trocada': null,
  // Alertas (P3a): o público é dado por quem grava, pelo local do ativo, ou quem vê alertas na regra
  'regra-de-alerta.criada': 'alertas.mudaram',
  'regra-de-alerta.alterada': 'alertas.mudaram',
  'regra-de-alerta.inativada': 'alertas.mudaram',
  'regra-de-alerta.reativada': 'alertas.mudaram',
  'alerta.reconhecido': 'alertas.mudaram',
  'alerta.adiado': 'alertas.mudaram',
  'alertas.silenciados': 'alertas.mudaram',
  'alertas.retomados': 'alertas.mudaram',
  // Indicadores (P3d e P4f): a meta nova muda a tela dos indicadores de quem vê aquele indicador
  'meta-de-indicador.alterada': 'metas.mudaram',
  'indicador-criado.criado': 'metas.mudaram',
  'indicador-criado.alterado': 'metas.mudaram',
  'indicador-criado.apagado': 'metas.mudaram',
  // Fornecedores (P4a): o nome aparece nas telas dos ativos de toda a organização
  'fornecedor.criado': 'fornecedores.mudaram',
  'fornecedor.alterado': 'fornecedores.mudaram',
  'fornecedor.inativado': 'fornecedores.mudaram',
  'fornecedor.reativado': 'fornecedores.mudaram',
  // Consumíveis (P4b): os compatíveis aparecem nas fichas dos modelos e dos ativos da organização
  'consumivel.criado': 'consumiveis.mudaram',
  'consumivel.alterado': 'consumiveis.mudaram',
  'consumivel.inativado': 'consumiveis.mudaram',
  'consumivel.reativado': 'consumiveis.mudaram',
  // Estoque (P4c): quem vê o estoque dos locais da movimentação ou do mínimo
  'estoque.entrada': 'estoque.mudou',
  'estoque.saida': 'estoque.mudou',
  'estoque.transferencia': 'estoque.mudou',
  'estoque.ajuste': 'estoque.mudou',
  'estoque.minimo': 'estoque.mudou',
  // Solicitações (P4d): quem vê as solicitações dos locais dela, os de antes e os de depois
  'solicitacao.registrada': 'solicitacoes.mudaram',
  'solicitacao.alterada': 'solicitacoes.mudaram',
  'solicitacao.pedida': 'solicitacoes.mudaram',
  'solicitacao.entregue': 'solicitacoes.mudaram',
  'solicitacao.situacao': 'solicitacoes.mudaram',
  'solicitacao.concluida': 'solicitacoes.mudaram',
  'solicitacao.cancelada': 'solicitacoes.mudaram',
  // Ordens de serviço (P4e): quem vê as OS do local dela, guardado na abertura
  'ordem.aberta': 'ordens.mudaram',
  'ordem.corrigida': 'ordens.mudaram',
  'ordem.situacao': 'ordens.mudaram',
  'ordem.peca': 'ordens.mudaram',
  'ordem.resolvida': 'ordens.mudaram',
  'ordem.reaberta': 'ordens.mudaram',
  'ordem.encerrada': 'ordens.mudaram',
  // Backup do Control iD (P5a): quem vê os backups do local do controle; o download não muda nada
  'backup-do-control-id.pedido': 'controlid.mudaram',
  'backup-do-control-id.concluido': 'controlid.mudaram',
  'backup-do-control-id.baixado': null,
  'backup-do-control-id.apagado': 'controlid.mudaram',
  'backups-do-control-id.retidos': 'controlid.mudaram',
  'operacao-do-control-id.pedida': 'controlid.mudaram',
  'operacao-do-control-id.concluida': 'controlid.mudaram',
  // O mapa da planta (P7): quem vê o mapa
  'planta.cadastrada': 'mapa.mudou',
  'planta.alterada': 'mapa.mudou',
  'posicao-no-mapa.salva': 'mapa.mudou',
  'posicao-no-mapa.tirada': 'mapa.mudou',
  'acesso-remoto.aberto': null,
  // As salas de reunião: quem vê as salas
  'sala.criada': 'salas.mudaram',
  'sala.alterada': 'salas.mudaram',
  'sala.inativada': 'salas.mudaram',
  'sala.reativada': 'salas.mudaram',
  'item-de-sala.criado': 'salas.mudaram',
  'item-de-sala.alterado': 'salas.mudaram',
  'item-de-sala.inativado': 'salas.mudaram',
  'item-de-sala.reativado': 'salas.mudaram',
  'reserva-de-sala.pedida': 'salas.mudaram',
  'reserva-de-sala.aprovada': 'salas.mudaram',
  'reserva-de-sala.recusada': 'salas.mudaram',
  'reserva-de-sala.cancelada': 'salas.mudaram',
  'convite-de-reserva.respondido': 'salas.mudaram',
  // Os painéis: quem vê os painéis
  'painel.criado': 'paineis.mudaram',
  'painel.alterado': 'paineis.mudaram',
  'painel.inativado': 'paineis.mudaram',
  'painel.reativado': 'paineis.mudaram',
  // O diretório: a configuração e os mapeamentos, a quem administra; o que muda no AD, nenhum
  'diretorio.configurado': 'diretorio.mudou',
  'diretorio.mapeamento-criado': 'diretorio.mudou',
  'diretorio.mapeamento-removido': 'diretorio.mudou',
  'diretorio.conta-criada': null,
  'diretorio.membro-incluido': null,
  'diretorio.membro-retirado': null,
  'diretorio.conta-ativada': null,
  'diretorio.conta-desativada': null,
  'diretorio.senha-redefinida': null,
  // Os agentes do GLPI: a tela relê depois de cada ação
  'agentes.endereco-gerado': null,
  'agentes.cadastro-configurado': null,
  'agente.ligado': null,
  'agente.desligado': null,
  // A distribuição de software: quem distribui
  'pacote.criado': 'software.mudou',
  'pacote.alterado': 'software.mudou',
  'pacote.inativado': 'software.mudou',
  'pacote.reativado': 'software.mudou',
  'pacote.arquivo-trocado': 'software.mudou',
  'distribuicao.criada': 'software.mudou',
  'distribuicao.pedida-agora': null,
} as const satisfies Record<AcaoDaAuditoria, TipoDeEvento | null>;

/** Os tipos de evento em que quem grava diz o público (`publicoDerivado` devolve `null`). */
export type TipoComPublicoDado =
  | 'pessoas.mudaram'
  | 'preferencias.mudaram'
  | 'ativos.mudaram'
  | 'visoes.mudaram'
  | 'importacoes.mudaram'
  | 'disponibilidade.mudou'
  | 'alertas.mudaram'
  | 'notificacoes.mudaram'
  | 'estoque.mudou'
  | 'solicitacoes.mudaram'
  | 'ordens.mudaram'
  | 'metas.mudaram'
  | 'controlid.mudaram';

/** As ações auditadas cujo evento precisa do público dado por quem grava, como as das pessoas. */
export type AcaoComPublicoDado = {
  [A in AcaoDaAuditoria]: (typeof EVENTO_DA_ACAO)[A] extends TipoComPublicoDado ? A : never;
}[AcaoDaAuditoria];

/**
 * O público que o tipo e o alvo já dizem. `null` nos tipos em que quem grava diz o público: o das
 * pessoas, que depende dos locais de trabalho e da conta da pessoa, o das preferências, que é a
 * conta delas, o dos ativos, que depende do local de antes e do de depois, o das visões, que é
 * toda a organização na visão compartilhada e só a conta dona na visão dela, o das importações,
 * que é a conta que importou, o da disponibilidade, que depende do local do ativo, o dos
 * alertas, que depende do local dos ativos deles e, na regra, alcança quem vê alertas, o das
 * notificações, que são as contas notificadas ou a que leu, o do estoque, que são os locais da
 * movimentação, a origem e o destino, ou o do mínimo, o das solicitações, que são os locais
 * dela, os de antes e os de depois da mudança, o das OS, que é o local guardado na abertura, e o
 * das metas, que é quem vê o indicador: os alertas, as OS ou o estoque.
 */
export function publicoDerivado(
  tipo: TipoDeEvento,
  alvo: AlvoDoEvento | null,
): PublicoDoEvento | null {
  switch (tipo) {
    case 'locais.mudaram':
    case 'acessos.mudaram':
    case 'padroes.mudaram':
    case 'catalogo.mudou':
    case 'modulos.mudaram':
    case 'fornecedores.mudaram':
    case 'consumiveis.mudaram':
      return { todas: true };
    case 'sessao.encerrada':
      return alvo?.id ? { sessoes: [alvo.id] } : null;
    case 'tarefas.mudaram':
      return { permissao: 'tarefas.administrar' };
    case 'operacao.mudou':
      return { permissao: 'backup.administrar' };
    case 'coletores.mudaram':
      return { permissao: 'coletores.administrar' };
    case 'cofre.mudou':
      return { permissao: 'cofre.usar' };
    case 'mapa.mudou':
      return { permissao: 'mapa.ver' };
    case 'salas.mudaram':
      return { permissao: 'salas.ver' };
    case 'paineis.mudaram':
      return { permissao: 'paineis.ver' };
    case 'diretorio.mudou':
      return { permissao: 'diretorio.administrar' };
    case 'software.mudou':
      return { permissao: 'software.distribuir' };
    case 'pessoas.mudaram':
    case 'preferencias.mudaram':
    case 'ativos.mudaram':
    case 'visoes.mudaram':
    case 'importacoes.mudaram':
    case 'disponibilidade.mudou':
    case 'alertas.mudaram':
    case 'notificacoes.mudaram':
    case 'estoque.mudou':
    case 'solicitacoes.mudaram':
    case 'ordens.mudaram':
    case 'metas.mudaram':
    case 'controlid.mudaram':
      return null;
  }
}

/** A conexão de eventos de uma sessão, com o acesso que a conta tem agora. */
export interface ConexaoQueRecebe {
  orgId: string;
  contaId: string;
  sessaoId: string;
  acesso: Acesso;
}

/** Se a conexão pode receber o evento: a mesma organização e uma das partes do público. */
export function podeReceber(
  evento: Pick<EventoDeSaida, 'orgId' | 'publico'>,
  conexao: ConexaoQueRecebe,
  arvore: Pick<ArvoreDeLocais, 'ancestrais'>,
): boolean {
  if (evento.orgId !== conexao.orgId) return false;
  const { todas, permissao, locais, contas, sessoes } = evento.publico;
  if (todas) return true;
  if (sessoes?.includes(conexao.sessaoId)) return true;
  if (contas?.includes(conexao.contaId)) return true;
  if (!permissao) return false;
  if (locais === undefined) return pode(conexao.acesso, permissao);
  return locais.some((localId) => podeEm(conexao.acesso, permissao, localId, arvore));
}
