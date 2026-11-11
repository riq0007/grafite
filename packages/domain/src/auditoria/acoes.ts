// O texto de cada ação da auditoria (design do F2b, decisão 13), para a consulta e o filtro. A API
// grava a chave ("assunto.verbo"); a tela mostra o rótulo. Uma ação que ainda não está aqui aparece
// pela própria chave, e um teste da API confere que toda ação gravada tem rótulo.

export const ACOES_DA_AUDITORIA = {
  // Acesso (F2a)
  'entrada.concluida': 'Entrada concluída',
  'entrada.recusada': 'Entrada recusada',
  'entrada.bloqueada': 'Entrada bloqueada',
  'sessao.iniciada': 'Sessão iniciada',
  'sessao.encerrada': 'Sessão encerrada',
  'segundo-passo.recusado': 'Código do segundo passo recusado',
  'codigo-de-recuperacao.usado': 'Código de recuperação usado',
  'senha.recusada': 'Troca de senha recusada',
  'senha.trocada': 'Senha trocada',
  'dois-passos.ativados': 'Dois passos ativados',
  'dois-passos.desativados': 'Dois passos desativados',
  'codigos-de-recuperacao.gerados': 'Códigos de recuperação gerados',
  'organizacao.criada': 'Organização criada',
  'endereco.registrado': 'Endereço registrado',
  'endereco.removido': 'Endereço removido',
  'acesso.redefinido': 'Acesso redefinido',
  // Aparelhos confiáveis (change aparelho-confiavel)
  'aparelho.marcado': 'Aparelho confiável marcado',
  'aparelho.esquecido': 'Aparelho confiável esquecido',
  'aparelhos.esquecidos': 'Aparelhos confiáveis esquecidos',
  'prazo-da-confianca.alterado': 'Prazo da confiança alterado',
  // Permissões (F2b)
  'permissao.recusada': 'Permissão recusada',
  // Locais
  'local.criado': 'Local cadastrado',
  'local.alterado': 'Local alterado',
  'local.movido': 'Local movido',
  'local.inativado': 'Local inativado',
  'local.reativado': 'Local reativado',
  // Pessoas e contas
  'pessoa.criada': 'Pessoa cadastrada',
  'pessoa.alterada': 'Pessoa editada',
  'pessoa.inativada': 'Pessoa inativada',
  'pessoa.reativada': 'Pessoa reativada',
  'pessoa.anonimizada': 'Pessoa anonimizada',
  'conta.criada': 'Conta criada',
  'conta.alterada': 'Conta alterada',
  'conta.inativada': 'Conta inativada',
  'conta.reativada': 'Conta reativada',
  'dois-passos.removidos': 'Dois passos removidos',
  'entrada.desbloqueada': 'Entrada desbloqueada',
  'sessoes.encerradas': 'Sessões encerradas pela administração',
  // Perfis, grupos e atribuições
  'perfil.criado': 'Perfil cadastrado',
  'perfil.alterado': 'Perfil alterado',
  'perfil.inativado': 'Perfil inativado',
  'perfil.reativado': 'Perfil reativado',
  'grupo.criado': 'Grupo cadastrado',
  'grupo.alterado': 'Grupo alterado',
  'grupo.inativado': 'Grupo inativado',
  'grupo.reativado': 'Grupo reativado',
  'membro.incluido': 'Conta incluída no grupo',
  'membro.retirado': 'Conta retirada do grupo',
  'atribuicao.criada': 'Perfil atribuído',
  'atribuicao.encerrada': 'Atribuição encerrada',
  // Plataforma (F2c)
  'padroes.alterados': 'Padrões da organização alterados',
  'foto.trocada': 'Foto trocada',
  'foto.removida': 'Foto removida',
  'tarefa.repetida': 'Tarefa com falha repetida',
  // Operação (F2d)
  'backup.solicitado': 'Backup pedido na hora',
  'agenda-do-backup.alterada': 'Agenda do backup alterada',
  // Catálogo de ativos (P1a)
  'tipo-de-ativo.criado': 'Tipo de ativo cadastrado',
  'tipo-de-ativo.alterado': 'Tipo de ativo alterado',
  'tipo-de-ativo.inativado': 'Tipo de ativo inativado',
  'tipo-de-ativo.reativado': 'Tipo de ativo reativado',
  'campo.criado': 'Campo cadastrado',
  'campo.alterado': 'Campo alterado',
  'campo.inativado': 'Campo inativado',
  'campo.reativado': 'Campo reativado',
  'modelo.criado': 'Modelo cadastrado',
  'modelo.alterado': 'Modelo alterado',
  'modelo.inativado': 'Modelo inativado',
  'modelo.reativado': 'Modelo reativado',
  'imagem-do-modelo.trocada': 'Imagem do modelo trocada',
  'imagem-do-modelo.removida': 'Imagem do modelo removida',
  // Ativos (P1b)
  'ativo.criado': 'Ativo cadastrado',
  'ativo.alterado': 'Ativo alterado',
  'ativo.inativado': 'Ativo inativado',
  'ativo.reativado': 'Ativo reativado',
  // A ficha e as ligações dos ativos (P1d): a ligação livre fica num registro em cada ativo
  'ativo.ligado': 'Ligação feita',
  'ativo.desligado': 'Ligação desfeita',
  'imagem-do-ativo.trocada': 'Imagem do ativo trocada',
  'imagem-do-ativo.removida': 'Imagem do ativo removida',
  // Módulos da organização (P1b)
  'modulo.ligado': 'Módulo ligado',
  'modulo.desligado': 'Módulo desligado',
  // Visões da organização (P1c); as de cada conta não vão para a auditoria
  'visao.criada': 'Visão criada',
  'visao.alterada': 'Visão alterada',
  'visao.removida': 'Visão removida',
  // Importação de ativos (P1e); cada ativo gravado por ela é cadastrado ou alterado, como na tela
  'importacao.aplicada': 'Importação posta na fila',
  'importacao.concluida': 'Importação concluída',
  // Coletores (P2a); as leituras e o último contato não vão para a auditoria
  'coletor.criado': 'Coletor cadastrado',
  'coletor.alterado': 'Coletor editado',
  'token-do-coletor.trocado': 'Token do coletor trocado',
  'coletor.inativado': 'Coletor inativado',
  'coletor.reativado': 'Coletor reativado',
  // Cofre (P6)
  'segredo.criado': 'Segredo cadastrado',
  'segredo.alterado': 'Segredo editado',
  'valor-do-segredo.trocado': 'Valor do segredo trocado',
  'acesso-do-segredo.alterado': 'Acesso do segredo alterado',
  'segredo.inativado': 'Segredo inativado',
  'segredo.reativado': 'Segredo reativado',
  'cofre.liberado': 'Cofre liberado',
  'liberacao-do-cofre.recusada': 'Liberação do cofre recusada',
  'segredo.revelado': 'Segredo revelado',
  'segredo.copiado': 'Segredo copiado',
  'revelacao-do-segredo.recusada': 'Revelação do segredo recusada',
  'copia-do-segredo.recusada': 'Cópia do segredo recusada',
  'chave-do-cofre.trocada': 'Chave do cofre trocada',
  // Alertas (P3a); a abertura, a resolução e o encerramento pelo motor não vão para a auditoria
  'regra-de-alerta.criada': 'Regra de alerta cadastrada',
  'regra-de-alerta.alterada': 'Regra de alerta editada',
  'regra-de-alerta.inativada': 'Regra de alerta inativada',
  'regra-de-alerta.reativada': 'Regra de alerta reativada',
  'alerta.reconhecido': 'Alerta reconhecido',
  'alerta.adiado': 'Alerta adiado',
  'alertas.silenciados': 'Alertas do ativo silenciados',
  'alertas.retomados': 'Alertas do ativo retomados',
  // Indicadores (P3d); a avaliação diária e a notificação dela não vão para a auditoria
  'meta-de-indicador.alterada': 'Meta de indicador alterada',
  'indicador-criado.criado': 'Indicador criado',
  'indicador-criado.alterado': 'Indicador criado editado',
  'indicador-criado.apagado': 'Indicador criado apagado',
  // Fornecedores (P4a); a criação a partir do texto dos ativos é do sistema, na atualização
  'fornecedor.criado': 'Fornecedor cadastrado',
  'fornecedor.alterado': 'Fornecedor editado',
  'fornecedor.inativado': 'Fornecedor inativado',
  'fornecedor.reativado': 'Fornecedor reativado',
  // Consumíveis (P4b); a edição leva os fornecedores e os modelos pelo nome, antes e depois
  'consumivel.criado': 'Consumível cadastrado',
  'consumivel.alterado': 'Consumível editado',
  'consumivel.inativado': 'Consumível inativado',
  'consumivel.reativado': 'Consumível reativado',
  // Estoque (P4c); a movimentação leva o tipo, o consumível, a quantidade, os locais e o detalhe,
  // e o mínimo, o antes e o depois
  'estoque.entrada': 'Entrada no estoque lançada',
  'estoque.saida': 'Saída do estoque lançada',
  'estoque.transferencia': 'Transferência do estoque lançada',
  'estoque.ajuste': 'Ajuste do estoque lançado',
  'estoque.minimo': 'Mínimo do estoque alterado',
  // Solicitações (P4d); cada uma leva o número, o tipo, quem pediu e o antes e o depois do que
  // mudou, e a entrega do estoque tem também o registro da saída
  'solicitacao.registrada': 'Solicitação registrada',
  'solicitacao.alterada': 'Solicitação alterada',
  'solicitacao.pedida': 'Pedido ao fornecedor registrado',
  'solicitacao.entregue': 'Entrega da solicitação lançada',
  'solicitacao.situacao': 'Situação da solicitação alterada',
  'solicitacao.concluida': 'Solicitação concluída',
  'solicitacao.cancelada': 'Solicitação cancelada',
  // Ordens de serviço (P4e); cada uma leva o número, o ativo e o antes e o depois do que mudou; a
  // peça tem também o registro da saída, e a OS da solicitação, o da mudança dela
  'ordem.aberta': 'Ordem de serviço aberta',
  'ordem.corrigida': 'Ordem de serviço corrigida',
  'ordem.situacao': 'Situação da ordem de serviço alterada',
  'ordem.peca': 'Peça da ordem de serviço lançada',
  'ordem.resolvida': 'Ordem de serviço resolvida',
  'ordem.reaberta': 'Ordem de serviço reaberta',
  'ordem.encerrada': 'Ordem de serviço encerrada',
  // Backup do Control iD (P5a); a retenção registra só quantos saíram
  'backup-do-control-id.pedido': 'Backup do Control iD pedido',
  'backup-do-control-id.concluido': 'Backup do Control iD concluído',
  'backup-do-control-id.baixado': 'Backup do Control iD baixado',
  'backup-do-control-id.apagado': 'Backup do Control iD apagado',
  'backups-do-control-id.retidos': 'Backups antigos do Control iD apagados pela retenção',
  // A comparação com o controle e a restauração (P5b)
  'operacao-do-control-id.pedida': 'Operação no Control iD pedida',
  'operacao-do-control-id.concluida': 'Operação no Control iD concluída',
  // O mapa da planta (P7)
  'planta.cadastrada': 'Planta cadastrada',
  'planta.alterada': 'Planta alterada',
  'planta.excluida': 'Planta excluída',
  'planta.desenho-substituido': 'Desenho da planta substituído',
  'posicao-no-mapa.salva': 'Posição no mapa salva',
  'posicao-no-mapa.tirada': 'Posição no mapa tirada',
  // O acesso remoto (change acesso-remoto-vnc): o acesso aberto, sem evento
  'acesso-remoto.aberto': 'Acesso remoto aberto',
  // As salas de reunião (change salas-de-reuniao)
  'sala.criada': 'Sala cadastrada',
  'sala.alterada': 'Sala editada',
  'sala.inativada': 'Sala inativada',
  'sala.reativada': 'Sala reativada',
  'item-de-sala.criado': 'Item das salas cadastrado',
  'item-de-sala.alterado': 'Item das salas editado',
  'item-de-sala.inativado': 'Item das salas inativado',
  'item-de-sala.reativado': 'Item das salas reativado',
  'reserva-de-sala.pedida': 'Reserva de sala pedida',
  'reserva-de-sala.aprovada': 'Reserva de sala aprovada',
  'reserva-de-sala.recusada': 'Reserva de sala recusada',
  'reserva-de-sala.cancelada': 'Reserva de sala cancelada',
  'convite-de-reserva.respondido': 'Convite de reserva respondido',
  // Os painéis (change painel-de-dashboards); a verificação não vai para a auditoria
  'painel.criado': 'Painel cadastrado',
  'painel.alterado': 'Painel editado',
  'painel.inativado': 'Painel inativado',
  'painel.reativado': 'Painel reativado',
  // O diretório (change integracao-ad-ldap): nenhum registro traz senha
  'diretorio.configurado': 'Diretório configurado',
  'diretorio.mapeamento-criado': 'Mapeamento do diretório criado',
  'diretorio.mapeamento-removido': 'Mapeamento do diretório removido',
  'diretorio.conta-criada': 'Conta criada pelo diretório',
  'diretorio.membro-incluido': 'Membro incluído no AD',
  'diretorio.membro-retirado': 'Membro retirado no AD',
  'diretorio.conta-ativada': 'Conta ativada no AD',
  'diretorio.conta-desativada': 'Conta desativada no AD',
  'diretorio.senha-redefinida': 'Senha redefinida no AD',
  // Os agentes do GLPI (change inventario-pelo-agente-glpi): o token nunca vai para a auditoria
  'agentes.endereco-gerado': 'Endereço dos agentes gerado',
  'agentes.cadastro-configurado': 'Cadastro automático dos agentes configurado',
  'agente.ligado': 'Agente ligado a um ativo',
  'agente.desligado': 'Agente desligado do ativo',
  // A distribuição de software (change distribuicao-de-software)
  'pacote.criado': 'Pacote de software cadastrado',
  'pacote.alterado': 'Pacote de software editado',
  'pacote.inativado': 'Pacote de software inativado',
  'pacote.reativado': 'Pacote de software reativado',
  'pacote.arquivo-trocado': 'Arquivo do pacote trocado',
  'distribuicao.criada': 'Distribuição de software criada',
  'distribuicao.pedida-agora': 'Agentes acordados para a distribuição',
} as const;

export type AcaoDaAuditoria = keyof typeof ACOES_DA_AUDITORIA;

export function acaoConhecida(acao: string): acao is AcaoDaAuditoria {
  return Object.hasOwn(ACOES_DA_AUDITORIA, acao);
}

/** O texto da ação, ou a própria chave quando ela ainda não tem rótulo. */
export function rotuloDaAcao(acao: string): string {
  return acaoConhecida(acao) ? ACOES_DA_AUDITORIA[acao] : acao;
}
