import { describe, expect, it } from 'vitest';
import { type LocalDaArvore, montarArvore } from '../locais/arvore.ts';
import {
  type AtribuicaoParaAcesso,
  alcance,
  listarPermissoes,
  type PerfilParaAcesso,
  pode,
  podeEm,
  resolverAcesso,
  SEM_ACESSO,
} from './acesso.ts';
import { PERMISSOES } from './permissoes.ts';

const local = (id: string, paiId: string | null): LocalDaArvore => ({
  id,
  paiId,
  nome: id,
  tipo: 'outro',
  situacao: 'ativo',
});

// jun › adm › sala ; jun › exp ; cps
const ARVORE = montarArvore([
  local('jun', null),
  local('adm', 'jun'),
  local('sala', 'adm'),
  local('exp', 'jun'),
  local('cps', null),
]);

const perfil = (dados: Partial<PerfilParaAcesso> = {}): PerfilParaAcesso => ({
  id: 'tec',
  nome: 'Técnico',
  situacao: 'ativo',
  permissoes: ['pessoas.ver', 'locais.editar'],
  todasAsPermissoes: false,
  exigeDoisPassos: false,
  ...dados,
});

const direta = (dados: Partial<AtribuicaoParaAcesso> = {}): AtribuicaoParaAcesso => ({
  id: 'a1',
  perfil: perfil(),
  localId: null,
  encerrada: false,
  origem: { tipo: 'conta' },
  ...dados,
});

const peloGrupo = (
  grupo: Partial<{ grupoAtivo: boolean; participacaoEncerrada: boolean }> = {},
  dados: Partial<AtribuicaoParaAcesso> = {},
): AtribuicaoParaAcesso =>
  direta({
    id: 'a2',
    origem: {
      tipo: 'grupo',
      grupoId: 'sup',
      grupoNome: 'Suporte',
      grupoAtivo: true,
      participacaoEncerrada: false,
      ...grupo,
    },
    ...dados,
  });

describe('resolverAcesso', () => {
  it('dá as permissões do perfil atribuído direto, na organização inteira', () => {
    const acesso = resolverAcesso([direta()]);
    expect(listarPermissoes(acesso)).toEqual([
      { chave: 'pessoas.ver', organizacao: true, locais: [] },
      { chave: 'locais.editar', organizacao: true, locais: [] },
    ]);
  });

  it('dá as permissões do perfil atribuído pelo grupo', () => {
    expect(pode(resolverAcesso([peloGrupo()]), 'locais.editar')).toBe(true);
  });

  it.each([
    ['a atribuição encerrada', [direta({ encerrada: true })]],
    ['o perfil inativo', [direta({ perfil: perfil({ situacao: 'inativo' }) })]],
    ['o grupo inativo', [peloGrupo({ grupoAtivo: false })]],
    ['a participação encerrada', [peloGrupo({ participacaoEncerrada: true })]],
  ])('não dá nada com %s', (_, atribuicoes) => {
    const acesso = resolverAcesso(atribuicoes);
    expect(listarPermissoes(acesso)).toEqual([]);
    expect(acesso.exigeDoisPassos).toBe(false);
  });

  it('junta as atribuições: organização e ramos', () => {
    const acesso = resolverAcesso([
      direta({ id: 'a1', localId: 'adm' }),
      direta({ id: 'a2', localId: 'cps' }),
      peloGrupo({}, { perfil: perfil({ permissoes: ['locais.editar'] }) }),
    ]);
    expect(listarPermissoes(acesso)).toEqual([
      { chave: 'pessoas.ver', organizacao: false, locais: ['adm', 'cps'] },
      { chave: 'locais.editar', organizacao: true, locais: ['adm', 'cps'] },
    ]);
  });

  it('ignora num ramo a permissão que vale só para a organização, e as que ela inclui', () => {
    const acesso = resolverAcesso([
      direta({
        localId: 'jun',
        perfil: perfil({ permissoes: ['auditoria.ver', 'acessos.administrar', 'pessoas.editar'] }),
      }),
    ]);
    expect(listarPermissoes(acesso).map((p) => p.chave)).toEqual(['pessoas.ver', 'pessoas.editar']);
  });

  it('acrescenta as incluídas', () => {
    const acesso = resolverAcesso([
      direta({ perfil: perfil({ permissoes: ['acessos.administrar'] }) }),
    ]);
    expect(listarPermissoes(acesso).map((p) => p.chave)).toEqual([
      'pessoas.ver',
      'acessos.ver',
      'acessos.administrar',
    ]);
  });

  it('dá todas as permissões do catálogo com todasAsPermissoes', () => {
    const acesso = resolverAcesso([
      direta({ perfil: perfil({ permissoes: [], todasAsPermissoes: true }) }),
    ]);
    expect(listarPermissoes(acesso).map((p) => p.chave)).toEqual(PERMISSOES.map((p) => p.chave));
  });

  it('Permissão nova no Administrador: as vinte e cinco chegam sem mudar o perfil', () => {
    const acesso = resolverAcesso([
      direta({ perfil: perfil({ permissoes: [], todasAsPermissoes: true }) }),
    ]);
    const novas = [
      'organizacao.editar',
      'tarefas.administrar',
      'backup.administrar',
      'catalogo.administrar',
      'modelos.editar',
      'ativos.ver',
      'ativos.editar',
      'ativos.restritos',
      'coletores.administrar',
      'cofre.usar',
      'cofre.administrar',
      'alertas.ver',
      'alertas.tratar',
      'alertas.administrar',
      'fornecedores.ver',
      'fornecedores.editar',
      'consumiveis.ver',
      'consumiveis.editar',
      'estoque.ver',
      'estoque.movimentar',
      'solicitacoes.ver',
      'solicitacoes.atender',
      'ordens.ver',
      'ordens.atender',
      'operacao.administrar',
    ];
    expect(novas).toHaveLength(25);
    expect(listarPermissoes(acesso).map((p) => p.chave)).toEqual(expect.arrayContaining(novas));
  });

  it('ignora chaves que saíram do catálogo', () => {
    const acesso = resolverAcesso([
      direta({ perfil: perfil({ permissoes: ['ativos.excluir', 'auditoria.ver'] }) }),
    ]);
    expect(listarPermissoes(acesso).map((p) => p.chave)).toEqual(['auditoria.ver']);
  });

  it('diz se algum perfil em vigor exige os dois passos, e quais', () => {
    const acesso = resolverAcesso([
      direta({ perfil: perfil({ id: 'adm', nome: 'Administrador', exigeDoisPassos: true }) }),
      peloGrupo({}, { perfil: perfil({ exigeDoisPassos: true }) }),
      direta({
        id: 'a3',
        perfil: perfil({ id: 'x', nome: 'Antigo', exigeDoisPassos: true }),
        encerrada: true,
      }),
    ]);
    expect(acesso.exigeDoisPassos).toBe(true);
    expect(acesso.perfisQueExigem).toEqual(['Administrador', 'Técnico']);
  });

  it('guarda de onde vem cada permissão', () => {
    const acesso = resolverAcesso([
      direta({ id: 'a1', localId: 'jun' }),
      peloGrupo(
        {},
        {
          id: 'a2',
          perfil: perfil({ id: 'ger', nome: 'Gerente', permissoes: ['pessoas.editar'] }),
        },
      ),
    ]);
    expect(acesso.origens.get('pessoas.ver')).toEqual([
      { atribuicaoId: 'a1', perfil: { id: 'tec', nome: 'Técnico' }, localId: 'jun', grupo: null },
      {
        atribuicaoId: 'a2',
        perfil: { id: 'ger', nome: 'Gerente' },
        localId: null,
        grupo: { id: 'sup', nome: 'Suporte' },
      },
    ]);
  });

  it('é vazio sem atribuições', () => {
    expect(resolverAcesso([])).toEqual(SEM_ACESSO);
  });
});

describe('pode, podeEm e alcance', () => {
  const doRamo = resolverAcesso([direta({ localId: 'adm' })]);
  const daOrganizacao = resolverAcesso([direta()]);

  it('pode em qualquer escopo', () => {
    expect(pode(doRamo, 'pessoas.ver')).toBe(true);
    expect(pode(doRamo, 'auditoria.ver')).toBe(false);
    expect(pode(SEM_ACESSO, 'pessoas.ver')).toBe(false);
  });

  it('pode no próprio local do ramo e dentro dele', () => {
    expect(podeEm(doRamo, 'pessoas.ver', 'adm', ARVORE)).toBe(true);
    expect(podeEm(doRamo, 'pessoas.ver', 'sala', ARVORE)).toBe(true);
  });

  it('não pode acima nem ao lado do ramo', () => {
    expect(podeEm(doRamo, 'pessoas.ver', 'jun', ARVORE)).toBe(false);
    expect(podeEm(doRamo, 'pessoas.ver', 'exp', ARVORE)).toBe(false);
  });

  it('não alcança o registro sem local por um ramo, só pela organização', () => {
    expect(podeEm(doRamo, 'pessoas.ver', null, ARVORE)).toBe(false);
    expect(podeEm(daOrganizacao, 'pessoas.ver', null, ARVORE)).toBe(true);
    expect(podeEm(daOrganizacao, 'pessoas.ver', 'exp', ARVORE)).toBe(true);
  });

  it('dá o alcance: a organização, os locais dos ramos juntos, ou nada', () => {
    expect(alcance(daOrganizacao, 'pessoas.ver', ARVORE)).toBe('organizacao');
    const juntos = resolverAcesso([
      direta({ id: 'a1', localId: 'adm' }),
      direta({ id: 'a2', localId: 'cps' }),
    ]);
    expect([...(alcance(juntos, 'pessoas.ver', ARVORE) as Set<string>)].sort()).toEqual([
      'adm',
      'cps',
      'sala',
    ]);
    expect(alcance(doRamo, 'auditoria.ver', ARVORE)).toBeNull();
  });

  it('Movimentar o estoque de um local: vê e movimenta só os locais do ramo', () => {
    const almoxarife = resolverAcesso([
      direta({ localId: 'jun', perfil: perfil({ permissoes: ['estoque.movimentar'] }) }),
    ]);
    expect(podeEm(almoxarife, 'estoque.movimentar', 'exp', ARVORE)).toBe(true);
    expect(podeEm(almoxarife, 'estoque.ver', 'sala', ARVORE)).toBe(true);
    expect(podeEm(almoxarife, 'estoque.ver', 'cps', ARVORE)).toBe(false);
    expect([...(alcance(almoxarife, 'estoque.ver', ARVORE) as Set<string>)].sort()).toEqual([
      'adm',
      'exp',
      'jun',
      'sala',
    ]);
  });

  it('Atender as solicitações de um local: vê e atende só os locais do ramo', () => {
    const atendente = resolverAcesso([
      direta({ localId: 'jun', perfil: perfil({ permissoes: ['solicitacoes.atender'] }) }),
    ]);
    expect(podeEm(atendente, 'solicitacoes.atender', 'exp', ARVORE)).toBe(true);
    expect(podeEm(atendente, 'solicitacoes.ver', 'sala', ARVORE)).toBe(true);
    expect(podeEm(atendente, 'solicitacoes.ver', 'cps', ARVORE)).toBe(false);
  });

  it('Atender as OS de um local: vê e atende só as do ramo, e a sem local pede a organização', () => {
    const tecnico = resolverAcesso([
      direta({ localId: 'jun', perfil: perfil({ permissoes: ['ordens.atender'] }) }),
    ]);
    expect(podeEm(tecnico, 'ordens.atender', 'exp', ARVORE)).toBe(true);
    expect(podeEm(tecnico, 'ordens.ver', 'sala', ARVORE)).toBe(true);
    expect(podeEm(tecnico, 'ordens.ver', 'cps', ARVORE)).toBe(false);
    expect(podeEm(tecnico, 'ordens.ver', null, ARVORE)).toBe(false);
  });

  it('Administrar a operação: vê as OS e o estoque da organização inteira, sem atender nem movimentar', () => {
    const gestora = resolverAcesso([
      direta({ localId: null, perfil: perfil({ permissoes: ['operacao.administrar'] }) }),
    ]);
    expect(podeEm(gestora, 'operacao.administrar', null, ARVORE)).toBe(true);
    expect(podeEm(gestora, 'ordens.ver', 'cps', ARVORE)).toBe(true);
    expect(podeEm(gestora, 'ordens.ver', null, ARVORE)).toBe(true);
    expect(podeEm(gestora, 'estoque.ver', 'exp', ARVORE)).toBe(true);
    expect(podeEm(gestora, 'ordens.atender', 'exp', ARVORE)).toBe(false);
    expect(podeEm(gestora, 'estoque.movimentar', 'exp', ARVORE)).toBe(false);
  });
});
