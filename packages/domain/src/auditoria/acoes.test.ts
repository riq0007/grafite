import { describe, expect, it } from 'vitest';
import { ACOES_DA_AUDITORIA, acaoConhecida, rotuloDaAcao } from './acoes.ts';

describe('ações da auditoria', () => {
  it('seguem o formato assunto.verbo que o banco confere', () => {
    for (const acao of Object.keys(ACOES_DA_AUDITORIA)) {
      expect(acao).toMatch(/^[a-z-]+[.][a-z-]+$/);
    }
  });

  it('têm rótulo em pt-BR, começando por maiúscula e sem ponto final', () => {
    for (const rotulo of Object.values(ACOES_DA_AUDITORIA)) {
      expect(rotulo).toMatch(/^\p{Lu}.*[^.]$/u);
    }
  });

  it('cobrem as ações do acesso e da administração', () => {
    expect(rotuloDaAcao('senha.trocada')).toBe('Senha trocada');
    expect(rotuloDaAcao('entrada.recusada')).toBe('Entrada recusada');
    expect(rotuloDaAcao('permissao.recusada')).toBe('Permissão recusada');
    expect(rotuloDaAcao('pessoa.anonimizada')).toBe('Pessoa anonimizada');
    expect(rotuloDaAcao('atribuicao.criada')).toBe('Perfil atribuído');
    expect(rotuloDaAcao('sessoes.encerradas')).toBe('Sessões encerradas pela administração');
  });

  it('cobrem as ações da plataforma', () => {
    expect(rotuloDaAcao('padroes.alterados')).toBe('Padrões da organização alterados');
    expect(rotuloDaAcao('foto.trocada')).toBe('Foto trocada');
    expect(rotuloDaAcao('foto.removida')).toBe('Foto removida');
    expect(rotuloDaAcao('tarefa.repetida')).toBe('Tarefa com falha repetida');
  });

  it('cobrem as ações da operação', () => {
    expect(rotuloDaAcao('backup.solicitado')).toBe('Backup pedido na hora');
    expect(rotuloDaAcao('agenda-do-backup.alterada')).toBe('Agenda do backup alterada');
  });

  it('cobrem as ações dos alertas', () => {
    expect(rotuloDaAcao('regra-de-alerta.criada')).toBe('Regra de alerta cadastrada');
    expect(rotuloDaAcao('regra-de-alerta.alterada')).toBe('Regra de alerta editada');
    expect(rotuloDaAcao('regra-de-alerta.inativada')).toBe('Regra de alerta inativada');
    expect(rotuloDaAcao('regra-de-alerta.reativada')).toBe('Regra de alerta reativada');
    expect(rotuloDaAcao('alerta.reconhecido')).toBe('Alerta reconhecido');
    expect(rotuloDaAcao('alerta.adiado')).toBe('Alerta adiado');
    expect(rotuloDaAcao('alertas.silenciados')).toBe('Alertas do ativo silenciados');
    expect(rotuloDaAcao('alertas.retomados')).toBe('Alertas do ativo retomados');
    expect(rotuloDaAcao('meta-de-indicador.alterada')).toBe('Meta de indicador alterada');
  });

  it('cobrem as ações dos consumíveis', () => {
    expect(rotuloDaAcao('consumivel.criado')).toBe('Consumível cadastrado');
    expect(rotuloDaAcao('consumivel.alterado')).toBe('Consumível editado');
    expect(rotuloDaAcao('consumivel.inativado')).toBe('Consumível inativado');
    expect(rotuloDaAcao('consumivel.reativado')).toBe('Consumível reativado');
  });

  it('cobrem as ações do estoque', () => {
    expect(rotuloDaAcao('estoque.entrada')).toBe('Entrada no estoque lançada');
    expect(rotuloDaAcao('estoque.saida')).toBe('Saída do estoque lançada');
    expect(rotuloDaAcao('estoque.transferencia')).toBe('Transferência do estoque lançada');
    expect(rotuloDaAcao('estoque.ajuste')).toBe('Ajuste do estoque lançado');
    expect(rotuloDaAcao('estoque.minimo')).toBe('Mínimo do estoque alterado');
  });

  it('cobrem as ações das solicitações', () => {
    expect(rotuloDaAcao('solicitacao.registrada')).toBe('Solicitação registrada');
    expect(rotuloDaAcao('solicitacao.alterada')).toBe('Solicitação alterada');
    expect(rotuloDaAcao('solicitacao.pedida')).toBe('Pedido ao fornecedor registrado');
    expect(rotuloDaAcao('solicitacao.entregue')).toBe('Entrega da solicitação lançada');
    expect(rotuloDaAcao('solicitacao.situacao')).toBe('Situação da solicitação alterada');
    expect(rotuloDaAcao('solicitacao.concluida')).toBe('Solicitação concluída');
    expect(rotuloDaAcao('solicitacao.cancelada')).toBe('Solicitação cancelada');
  });

  it('cobrem as ações das ordens de serviço', () => {
    expect(rotuloDaAcao('ordem.aberta')).toBe('Ordem de serviço aberta');
    expect(rotuloDaAcao('ordem.corrigida')).toBe('Ordem de serviço corrigida');
    expect(rotuloDaAcao('ordem.situacao')).toBe('Situação da ordem de serviço alterada');
    expect(rotuloDaAcao('ordem.peca')).toBe('Peça da ordem de serviço lançada');
    expect(rotuloDaAcao('ordem.resolvida')).toBe('Ordem de serviço resolvida');
    expect(rotuloDaAcao('ordem.reaberta')).toBe('Ordem de serviço reaberta');
    expect(rotuloDaAcao('ordem.encerrada')).toBe('Ordem de serviço encerrada');
  });

  it('cobrem as ações dos fornecedores', () => {
    expect(rotuloDaAcao('fornecedor.criado')).toBe('Fornecedor cadastrado');
    expect(rotuloDaAcao('fornecedor.alterado')).toBe('Fornecedor editado');
    expect(rotuloDaAcao('fornecedor.inativado')).toBe('Fornecedor inativado');
    expect(rotuloDaAcao('fornecedor.reativado')).toBe('Fornecedor reativado');
  });

  it('cobrem as ações do catálogo de ativos', () => {
    expect(rotuloDaAcao('tipo-de-ativo.criado')).toBe('Tipo de ativo cadastrado');
    expect(rotuloDaAcao('tipo-de-ativo.alterado')).toBe('Tipo de ativo alterado');
    expect(rotuloDaAcao('tipo-de-ativo.inativado')).toBe('Tipo de ativo inativado');
    expect(rotuloDaAcao('tipo-de-ativo.reativado')).toBe('Tipo de ativo reativado');
    expect(rotuloDaAcao('campo.criado')).toBe('Campo cadastrado');
    expect(rotuloDaAcao('campo.alterado')).toBe('Campo alterado');
    expect(rotuloDaAcao('campo.inativado')).toBe('Campo inativado');
    expect(rotuloDaAcao('campo.reativado')).toBe('Campo reativado');
    expect(rotuloDaAcao('modelo.criado')).toBe('Modelo cadastrado');
    expect(rotuloDaAcao('modelo.alterado')).toBe('Modelo alterado');
    expect(rotuloDaAcao('modelo.inativado')).toBe('Modelo inativado');
    expect(rotuloDaAcao('modelo.reativado')).toBe('Modelo reativado');
    expect(rotuloDaAcao('imagem-do-modelo.trocada')).toBe('Imagem do modelo trocada');
    expect(rotuloDaAcao('imagem-do-modelo.removida')).toBe('Imagem do modelo removida');
  });

  it('cobrem as ações dos ativos e dos módulos', () => {
    expect(rotuloDaAcao('ativo.criado')).toBe('Ativo cadastrado');
    expect(rotuloDaAcao('ativo.alterado')).toBe('Ativo alterado');
    expect(rotuloDaAcao('ativo.inativado')).toBe('Ativo inativado');
    expect(rotuloDaAcao('ativo.reativado')).toBe('Ativo reativado');
    expect(rotuloDaAcao('ativo.ligado')).toBe('Ligação feita');
    expect(rotuloDaAcao('ativo.desligado')).toBe('Ligação desfeita');
    expect(rotuloDaAcao('imagem-do-ativo.trocada')).toBe('Imagem do ativo trocada');
    expect(rotuloDaAcao('imagem-do-ativo.removida')).toBe('Imagem do ativo removida');
    expect(rotuloDaAcao('modulo.ligado')).toBe('Módulo ligado');
    expect(rotuloDaAcao('modulo.desligado')).toBe('Módulo desligado');
  });

  it('cobrem as ações do cofre', () => {
    expect(rotuloDaAcao('segredo.criado')).toBe('Segredo cadastrado');
    expect(rotuloDaAcao('segredo.alterado')).toBe('Segredo editado');
    expect(rotuloDaAcao('valor-do-segredo.trocado')).toBe('Valor do segredo trocado');
    expect(rotuloDaAcao('acesso-do-segredo.alterado')).toBe('Acesso do segredo alterado');
    expect(rotuloDaAcao('segredo.inativado')).toBe('Segredo inativado');
    expect(rotuloDaAcao('segredo.reativado')).toBe('Segredo reativado');
    expect(rotuloDaAcao('cofre.liberado')).toBe('Cofre liberado');
    expect(rotuloDaAcao('liberacao-do-cofre.recusada')).toBe('Liberação do cofre recusada');
    expect(rotuloDaAcao('segredo.revelado')).toBe('Segredo revelado');
    expect(rotuloDaAcao('segredo.copiado')).toBe('Segredo copiado');
    expect(rotuloDaAcao('revelacao-do-segredo.recusada')).toBe('Revelação do segredo recusada');
    expect(rotuloDaAcao('copia-do-segredo.recusada')).toBe('Cópia do segredo recusada');
    expect(rotuloDaAcao('chave-do-cofre.trocada')).toBe('Chave do cofre trocada');
  });

  it('cobrem as ações das visões da organização', () => {
    expect(rotuloDaAcao('visao.criada')).toBe('Visão criada');
    expect(rotuloDaAcao('visao.alterada')).toBe('Visão alterada');
    expect(rotuloDaAcao('visao.removida')).toBe('Visão removida');
  });

  it('dá a própria chave para a ação desconhecida', () => {
    expect(rotuloDaAcao('ativo.excluido')).toBe('ativo.excluido');
    expect(acaoConhecida('ativo.excluido')).toBe(false);
    expect(acaoConhecida('local.movido')).toBe(true);
  });
});
