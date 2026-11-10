import { describe, expect, it } from 'vitest';
import type { Acesso } from '../acesso/acesso.ts';
import type { Permissao } from '../acesso/permissoes.ts';
import { ACOES_DA_AUDITORIA } from '../auditoria/acoes.ts';
import { type LocalDaArvore, montarArvore } from '../locais/arvore.ts';
import {
  type ConexaoQueRecebe,
  EVENTO_DA_ACAO,
  type EventoDeSaida,
  podeReceber,
  publicoDerivado,
  TIPOS_DE_EVENTO,
} from './eventos.ts';

const local = (id: string, paiId: string | null, nome: string): LocalDaArvore => ({
  id,
  paiId,
  nome,
  tipo: 'outro',
  situacao: 'ativo',
});

/** Jundiaí › Expedição, e Campinas. */
const ARVORE = montarArvore([
  local('jun', null, 'Jundiaí'),
  local('exp', 'jun', 'Expedição'),
  local('cam', null, 'Campinas'),
]);

/** O acesso com cada permissão na organização inteira (`true`) ou nos ramos dados. */
function acessoCom(permissoes: Partial<Record<Permissao, true | string[]>>): Acesso {
  return {
    permissoes: new Map(
      Object.entries(permissoes).map(([chave, alcance]) => [
        chave as Permissao,
        alcance === true
          ? { organizacao: true, locais: new Set<string>() }
          : { organizacao: false, locais: new Set(alcance) },
      ]),
    ),
    exigeDoisPassos: false,
    perfisQueExigem: [],
    origens: new Map(),
    prazosDosPerfis: [],
  };
}

const conexao = (acesso: Acesso, extra: Partial<ConexaoQueRecebe> = {}): ConexaoQueRecebe => ({
  orgId: 'org-a',
  contaId: 'conta-bruno',
  sessaoId: 'sessao-bruno',
  acesso,
  ...extra,
});

const evento = (publico: EventoDeSaida['publico'], extra: Partial<EventoDeSaida> = {}) =>
  ({
    id: '0192a000-0000-7000-8000-000000000001',
    orgId: 'org-a',
    momento: '2026-10-07T12:00:00.000Z',
    tipo: 'pessoas.mudaram',
    alvo: { tipo: 'pessoa', id: 'joao' },
    publico,
    ...extra,
  }) satisfies EventoDeSaida;

const SEM_PERMISSOES = acessoCom({});
const PESSOAS_EM_JUNDIAI = acessoCom({ 'pessoas.ver': ['jun'] });
const PESSOAS_EM_CAMPINAS = acessoCom({ 'pessoas.ver': ['cam'] });
const PESSOAS_NA_ORGANIZACAO = acessoCom({ 'pessoas.ver': true });

describe('tipos de evento', () => {
  it('são os da tabela da spec', () => {
    expect(TIPOS_DE_EVENTO).toEqual([
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
    ]);
  });

  it('cada ação da auditoria diz o evento que grava, ou que não grava nenhum', () => {
    expect(Object.keys(EVENTO_DA_ACAO).sort()).toEqual(Object.keys(ACOES_DA_AUDITORIA).sort());
    for (const tipo of Object.values(EVENTO_DA_ACAO)) {
      if (tipo !== null) expect(TIPOS_DE_EVENTO).toContain(tipo);
    }
  });

  it.each([
    ['pessoa.alterada', 'pessoas.mudaram'],
    ['conta.inativada', 'pessoas.mudaram'],
    ['foto.trocada', 'pessoas.mudaram'],
    ['local.movido', 'locais.mudaram'],
    ['atribuicao.criada', 'acessos.mudaram'],
    ['membro.retirado', 'acessos.mudaram'],
    ['padroes.alterados', 'padroes.mudaram'],
    ['sessao.encerrada', 'sessao.encerrada'],
    ['tarefa.repetida', 'tarefas.mudaram'],
    ['agenda-do-backup.alterada', 'operacao.mudou'],
    ['tipo-de-ativo.alterado', 'catalogo.mudou'],
    ['campo.inativado', 'catalogo.mudou'],
    ['modelo.criado', 'catalogo.mudou'],
    ['imagem-do-modelo.trocada', 'catalogo.mudou'],
    ['ativo.criado', 'ativos.mudaram'],
    ['ativo.alterado', 'ativos.mudaram'],
    ['ativo.inativado', 'ativos.mudaram'],
    ['ativo.reativado', 'ativos.mudaram'],
    ['ativo.ligado', 'ativos.mudaram'],
    ['ativo.desligado', 'ativos.mudaram'],
    ['imagem-do-ativo.trocada', 'ativos.mudaram'],
    ['imagem-do-ativo.removida', 'ativos.mudaram'],
    ['modulo.ligado', 'modulos.mudaram'],
    ['modulo.desligado', 'modulos.mudaram'],
    ['visao.criada', 'visoes.mudaram'],
    ['visao.alterada', 'visoes.mudaram'],
    ['visao.removida', 'visoes.mudaram'],
    ['importacao.aplicada', 'importacoes.mudaram'],
    ['importacao.concluida', 'importacoes.mudaram'],
    ['coletor.criado', 'coletores.mudaram'],
    ['coletor.alterado', 'coletores.mudaram'],
    ['token-do-coletor.trocado', 'coletores.mudaram'],
    ['coletor.inativado', 'coletores.mudaram'],
    ['coletor.reativado', 'coletores.mudaram'],
    ['segredo.criado', 'cofre.mudou'],
    ['segredo.alterado', 'cofre.mudou'],
    ['valor-do-segredo.trocado', 'cofre.mudou'],
    ['acesso-do-segredo.alterado', 'cofre.mudou'],
    ['segredo.inativado', 'cofre.mudou'],
    ['segredo.reativado', 'cofre.mudou'],
    ['cofre.liberado', null],
    ['liberacao-do-cofre.recusada', null],
    ['segredo.revelado', null],
    ['segredo.copiado', null],
    ['revelacao-do-segredo.recusada', null],
    ['copia-do-segredo.recusada', null],
    ['chave-do-cofre.trocada', null],
    ['regra-de-alerta.criada', 'alertas.mudaram'],
    ['regra-de-alerta.alterada', 'alertas.mudaram'],
    ['regra-de-alerta.inativada', 'alertas.mudaram'],
    ['regra-de-alerta.reativada', 'alertas.mudaram'],
    ['alerta.reconhecido', 'alertas.mudaram'],
    ['alerta.adiado', 'alertas.mudaram'],
    ['alertas.silenciados', 'alertas.mudaram'],
    ['alertas.retomados', 'alertas.mudaram'],
    ['fornecedor.criado', 'fornecedores.mudaram'],
    ['fornecedor.alterado', 'fornecedores.mudaram'],
    ['fornecedor.inativado', 'fornecedores.mudaram'],
    ['fornecedor.reativado', 'fornecedores.mudaram'],
    ['consumivel.criado', 'consumiveis.mudaram'],
    ['consumivel.alterado', 'consumiveis.mudaram'],
    ['consumivel.inativado', 'consumiveis.mudaram'],
    ['consumivel.reativado', 'consumiveis.mudaram'],
    ['estoque.entrada', 'estoque.mudou'],
    ['estoque.saida', 'estoque.mudou'],
    ['estoque.transferencia', 'estoque.mudou'],
    ['estoque.ajuste', 'estoque.mudou'],
    ['estoque.minimo', 'estoque.mudou'],
    ['solicitacao.registrada', 'solicitacoes.mudaram'],
    ['solicitacao.alterada', 'solicitacoes.mudaram'],
    ['solicitacao.pedida', 'solicitacoes.mudaram'],
    ['solicitacao.entregue', 'solicitacoes.mudaram'],
    ['solicitacao.situacao', 'solicitacoes.mudaram'],
    ['solicitacao.concluida', 'solicitacoes.mudaram'],
    ['solicitacao.cancelada', 'solicitacoes.mudaram'],
    ['ordem.aberta', 'ordens.mudaram'],
    ['ordem.corrigida', 'ordens.mudaram'],
    ['ordem.situacao', 'ordens.mudaram'],
    ['ordem.peca', 'ordens.mudaram'],
    ['ordem.resolvida', 'ordens.mudaram'],
    ['ordem.reaberta', 'ordens.mudaram'],
    ['ordem.encerrada', 'ordens.mudaram'],
    ['meta-de-indicador.alterada', 'metas.mudaram'],
    ['backup.solicitado', null],
    ['entrada.recusada', null],
    ['permissao.recusada', null],
  ] as const)('%s grava %s', (acao, tipo) => {
    expect(EVENTO_DA_ACAO[acao]).toBe(tipo);
  });
});

describe('publicoDerivado', () => {
  it('manda a toda sessão o que toda sessão mostra', () => {
    expect(publicoDerivado('locais.mudaram', null)).toEqual({ todas: true });
    expect(publicoDerivado('acessos.mudaram', null)).toEqual({ todas: true });
    expect(publicoDerivado('padroes.mudaram', null)).toEqual({ todas: true });
    expect(publicoDerivado('catalogo.mudou', null)).toEqual({ todas: true });
    expect(publicoDerivado('modulos.mudaram', null)).toEqual({ todas: true });
    // O nome do fornecedor aparece nas telas dos ativos de toda a organização (change p4a-fornecedores).
    expect(publicoDerivado('fornecedores.mudaram', null)).toEqual({ todas: true });
    // Os compatíveis aparecem nas fichas dos modelos e dos ativos (change p4b-consumiveis).
    expect(publicoDerivado('consumiveis.mudaram', null)).toEqual({ todas: true });
  });

  it('manda o fim da sessão só à própria sessão', () => {
    expect(publicoDerivado('sessao.encerrada', { tipo: 'sessao', id: 's1' })).toEqual({
      sessoes: ['s1'],
    });
  });

  it('manda as tarefas a quem as administra', () => {
    expect(publicoDerivado('tarefas.mudaram', null)).toEqual({ permissao: 'tarefas.administrar' });
  });

  it('manda a operação a quem administra o backup', () => {
    expect(publicoDerivado('operacao.mudou', null)).toEqual({ permissao: 'backup.administrar' });
  });

  it('manda o cofre a quem o usa, sem o nome nem o valor do segredo', () => {
    expect(publicoDerivado('cofre.mudou', { tipo: 'segredo', id: 's1' })).toEqual({
      permissao: 'cofre.usar',
    });
  });

  it('manda os coletores a quem os administra', () => {
    expect(publicoDerivado('coletores.mudaram', { tipo: 'coletor', id: 'c1' })).toEqual({
      permissao: 'coletores.administrar',
    });
  });

  it('deixa a quem grava o público das pessoas e das preferências', () => {
    expect(publicoDerivado('pessoas.mudaram', { tipo: 'pessoa', id: 'joao' })).toBeNull();
    expect(publicoDerivado('preferencias.mudaram', { tipo: 'conta', id: 'c1' })).toBeNull();
    expect(publicoDerivado('ativos.mudaram', { tipo: 'ativo', id: 'a1' })).toBeNull();
    expect(publicoDerivado('visoes.mudaram', { tipo: 'visao', id: 'v1' })).toBeNull();
    expect(publicoDerivado('importacoes.mudaram', { tipo: 'importacao', id: 'i1' })).toBeNull();
    expect(publicoDerivado('disponibilidade.mudou', { tipo: 'ativo', id: 'a1' })).toBeNull();
    expect(publicoDerivado('alertas.mudaram', { tipo: 'alerta', id: 'al1' })).toBeNull();
    expect(publicoDerivado('notificacoes.mudaram', null)).toBeNull();
    // O público do estoque são os locais da movimentação ou do mínimo (change p4c-estoque).
    expect(publicoDerivado('estoque.mudou', { tipo: 'consumivel', id: 'c1' })).toBeNull();
    // O das solicitações são os locais dela, os de antes e os de depois (change p4d-solicitacoes).
    expect(publicoDerivado('solicitacoes.mudaram', { tipo: 'solicitacao', id: 's1' })).toBeNull();
    // O das OS é o local dela, guardado na abertura (change p4e-ordens-de-servico).
    expect(publicoDerivado('ordens.mudaram', { tipo: 'ordem', id: 'o1' })).toBeNull();
    // O da meta é quem vê o indicador: os alertas, as OS ou o estoque (change
    // p4f-indicadores-da-operacao).
    expect(publicoDerivado('metas.mudaram', { tipo: 'indicador', id: 'i1' })).toBeNull();
  });
});

describe('podeReceber', () => {
  it('nunca entrega a outra organização', () => {
    expect(
      podeReceber(evento({ todas: true }), conexao(SEM_PERMISSOES, { orgId: 'org-b' }), ARVORE),
    ).toBe(false);
  });

  it('entrega a toda sessão o evento de todas', () => {
    expect(podeReceber(evento({ todas: true }), conexao(SEM_PERMISSOES), ARVORE)).toBe(true);
  });

  it('entrega à sessão do alvo, e só a ela', () => {
    const fim = evento({ sessoes: ['sessao-bruno'] }, { tipo: 'sessao.encerrada' });
    expect(podeReceber(fim, conexao(SEM_PERMISSOES), ARVORE)).toBe(true);
    expect(podeReceber(fim, conexao(SEM_PERMISSOES, { sessaoId: 'outra' }), ARVORE)).toBe(false);
  });

  it('entrega à conta da pessoa, mesmo sem a permissão', () => {
    const publico = { permissao: 'pessoas.ver' as const, locais: ['exp'], contas: ['conta-bruno'] };
    expect(podeReceber(evento(publico), conexao(SEM_PERMISSOES), ARVORE)).toBe(true);
    expect(
      podeReceber(evento(publico), conexao(SEM_PERMISSOES, { contaId: 'outra' }), ARVORE),
    ).toBe(false);
  });

  it('entrega pela permissão em qualquer escopo quando o evento não tem local', () => {
    const tarefas = evento({ permissao: 'tarefas.administrar' }, { tipo: 'tarefas.mudaram' });
    expect(podeReceber(tarefas, conexao(acessoCom({ 'tarefas.administrar': true })), ARVORE)).toBe(
      true,
    );
    expect(podeReceber(tarefas, conexao(PESSOAS_NA_ORGANIZACAO), ARVORE)).toBe(false);
  });

  it.each([
    ['dentro do ramo', PESSOAS_EM_JUNDIAI, ['exp'], true],
    ['fora do ramo', PESSOAS_EM_CAMPINAS, ['exp'], false],
    ['na organização inteira', PESSOAS_NA_ORGANIZACAO, ['exp'], true],
    ['pessoa sem local, com escopo de ramo', PESSOAS_EM_JUNDIAI, [null], false],
    ['pessoa sem local, na organização inteira', PESSOAS_NA_ORGANIZACAO, [null], true],
    ['pessoa que saiu do ramo', PESSOAS_EM_JUNDIAI, ['exp', 'cam'], true],
    ['pessoa que entrou no ramo', PESSOAS_EM_CAMPINAS, ['exp', 'cam'], true],
    ['sem a permissão', SEM_PERMISSOES, ['exp'], false],
  ] as const)('com escopo de local: %s', (_caso, acesso, locais, recebe) => {
    expect(
      podeReceber(
        evento({ permissao: 'pessoas.ver', locais: [...locais] }),
        conexao(acesso),
        ARVORE,
      ),
    ).toBe(recebe);
  });

  it('não entrega o evento sem público', () => {
    expect(podeReceber(evento({}), conexao(PESSOAS_NA_ORGANIZACAO), ARVORE)).toBe(false);
  });
});
