import { describe, expect, it } from 'vitest';
import {
  conferirCatalogo,
  type DefinicaoDePermissao,
  descricaoDa,
  fechamento,
  PERMISSOES,
  permissaoConhecida,
  validarPermissoes,
} from './permissoes.ts';

const definicao = (
  chave: string,
  inclui: readonly string[] = [],
  descricao = 'Fazer algo',
): DefinicaoDePermissao => ({ chave, area: 'Área', descricao, escopo: 'local', inclui });

describe('catálogo de permissões', () => {
  it('tem as permissões da administração, com o escopo de cada uma', () => {
    expect(PERMISSOES.map(({ chave, escopo }) => [chave, escopo])).toEqual([
      ['pessoas.ver', 'local'],
      ['pessoas.editar', 'local'],
      ['pessoas.anonimizar', 'organizacao'],
      ['contas.administrar', 'organizacao'],
      ['acessos.ver', 'organizacao'],
      ['acessos.administrar', 'organizacao'],
      ['diretorio.administrar', 'organizacao'],
      ['locais.editar', 'local'],
      ['fornecedores.ver', 'organizacao'],
      ['fornecedores.editar', 'organizacao'],
      ['organizacao.editar', 'organizacao'],
      ['auditoria.ver', 'organizacao'],
      ['tarefas.administrar', 'organizacao'],
      ['backup.administrar', 'organizacao'],
      ['catalogo.administrar', 'organizacao'],
      ['modelos.editar', 'organizacao'],
      ['ativos.ver', 'local'],
      ['ativos.editar', 'local'],
      ['ativos.restritos', 'local'],
      ['coletores.administrar', 'organizacao'],
      ['cofre.usar', 'organizacao'],
      ['cofre.administrar', 'organizacao'],
      ['alertas.ver', 'local'],
      ['alertas.tratar', 'local'],
      ['alertas.administrar', 'organizacao'],
      ['consumiveis.ver', 'organizacao'],
      ['consumiveis.editar', 'organizacao'],
      ['estoque.ver', 'local'],
      ['estoque.movimentar', 'local'],
      ['solicitacoes.ver', 'local'],
      ['solicitacoes.atender', 'local'],
      ['ordens.ver', 'local'],
      ['ordens.atender', 'local'],
      ['operacao.administrar', 'organizacao'],
      ['controlid.ver', 'local'],
      ['controlid.backup', 'local'],
      ['controlid.restaurar', 'local'],
      ['mapa.ver', 'organizacao'],
      ['mapa.editar', 'organizacao'],
      ['software.distribuir', 'local'],
      ['software.administrar', 'organizacao'],
      ['ativos.acesso-remoto', 'local'],
      ['salas.ver', 'organizacao'],
      ['salas.administrar', 'organizacao'],
      ['paineis.ver', 'organizacao'],
      ['paineis.administrar', 'organizacao'],
    ]);
  });

  it('tem as permissões das OS, na área Ordens de serviço, por local, com o ver incluído no atender', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Ordens de serviço')).toEqual([
      {
        chave: 'ordens.ver',
        area: 'Ordens de serviço',
        descricao: 'Ver as ordens de serviço',
        escopo: 'local',
        inclui: [],
      },
      {
        chave: 'ordens.atender',
        area: 'Ordens de serviço',
        descricao:
          'Abrir e corrigir as ordens de serviço, mudar a situação, informar o fornecedor, lançar as peças, resolver, reabrir e encerrar',
        escopo: 'local',
        inclui: ['ordens.ver'],
      },
    ]);
  });

  it('tem a permissão dos indicadores da operação, na organização, com as OS e o estoque incluídos', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Operação')).toEqual([
      {
        chave: 'operacao.administrar',
        area: 'Operação',
        descricao: 'Mudar as metas dos indicadores da operação e receber o aviso de fora da meta',
        escopo: 'organizacao',
        inclui: ['ordens.ver', 'estoque.ver'],
      },
    ]);
  });

  it('tem as permissões do estoque, na área Estoque, por local, com o ver incluído no movimentar', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Estoque')).toEqual([
      {
        chave: 'estoque.ver',
        area: 'Estoque',
        descricao: 'Ver o estoque e as movimentações',
        escopo: 'local',
        inclui: [],
      },
      {
        chave: 'estoque.movimentar',
        area: 'Estoque',
        descricao:
          'Lançar as entradas, as saídas, as transferências e os ajustes do estoque e definir o mínimo',
        escopo: 'local',
        inclui: ['estoque.ver'],
      },
    ]);
  });

  it('tem as permissões das solicitações, na área Solicitações, por local, com o ver incluído no atender', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Solicitações')).toEqual([
      {
        chave: 'solicitacoes.ver',
        area: 'Solicitações',
        descricao: 'Ver as solicitações',
        escopo: 'local',
        inclui: [],
      },
      {
        chave: 'solicitacoes.atender',
        area: 'Solicitações',
        descricao:
          'Registrar e alterar as solicitações, pedir ao fornecedor, entregar, concluir, cancelar e mudar a situação',
        escopo: 'local',
        inclui: ['solicitacoes.ver'],
      },
    ]);
  });

  it('tem as permissões dos consumíveis, na área Consumíveis, com o ver incluído no editar', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Consumíveis')).toEqual([
      {
        chave: 'consumiveis.ver',
        area: 'Consumíveis',
        descricao: 'Ver os consumíveis',
        escopo: 'organizacao',
        inclui: [],
      },
      {
        chave: 'consumiveis.editar',
        area: 'Consumíveis',
        descricao:
          'Cadastrar e editar os consumíveis, com os fornecedores e os modelos compatíveis, inativar e reativar',
        escopo: 'organizacao',
        inclui: ['consumiveis.ver'],
      },
    ]);
  });

  it('tem as permissões dos fornecedores, na área Fornecedores, com o ver incluído no editar', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Fornecedores')).toEqual([
      {
        chave: 'fornecedores.ver',
        area: 'Fornecedores',
        descricao: 'Ver os fornecedores',
        escopo: 'organizacao',
        inclui: [],
      },
      {
        chave: 'fornecedores.editar',
        area: 'Fornecedores',
        descricao: 'Cadastrar e editar os fornecedores, inativar e reativar',
        escopo: 'organizacao',
        inclui: ['fornecedores.ver'],
      },
    ]);
  });

  it('tem as permissões dos alertas, na área Alertas, com o ver incluído no tratar e no administrar', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Alertas')).toEqual([
      {
        chave: 'alertas.ver',
        area: 'Alertas',
        descricao: 'Ver os alertas',
        escopo: 'local',
        inclui: [],
      },
      {
        chave: 'alertas.tratar',
        area: 'Alertas',
        descricao: 'Reconhecer e adiar os alertas e silenciar os alertas de um ativo',
        escopo: 'local',
        inclui: ['alertas.ver'],
      },
      {
        chave: 'alertas.administrar',
        area: 'Alertas',
        descricao:
          'Cadastrar e editar as regras de alerta, inativar e reativar, e mudar as metas dos indicadores',
        escopo: 'organizacao',
        inclui: ['alertas.ver'],
      },
    ]);
  });

  it('tem as permissões do cofre, na área Cofre, a de administrar incluindo a de usar', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Cofre')).toEqual([
      {
        chave: 'cofre.usar',
        area: 'Cofre',
        descricao: 'Abrir o cofre e revelar e copiar os segredos liberados à conta',
        escopo: 'organizacao',
        inclui: [],
      },
      {
        chave: 'cofre.administrar',
        area: 'Cofre',
        descricao:
          'Cadastrar e editar os segredos, trocar o valor, dar e tirar o acesso, inativar e reativar',
        escopo: 'organizacao',
        inclui: ['cofre.usar'],
      },
    ]);
  });

  it('tem as permissões do catálogo de ativos, na área Ativos', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Ativos')).toEqual([
      {
        chave: 'catalogo.administrar',
        area: 'Ativos',
        descricao: 'Cadastrar e editar os tipos de ativo e os campos, inativar e reativar',
        escopo: 'organizacao',
        inclui: [],
      },
      {
        chave: 'modelos.editar',
        area: 'Ativos',
        descricao:
          'Cadastrar e editar os modelos de equipamento e a imagem deles, inativar e reativar',
        escopo: 'organizacao',
        inclui: [],
      },
      {
        chave: 'ativos.ver',
        area: 'Ativos',
        descricao: 'Ver os ativos',
        escopo: 'local',
        inclui: [],
      },
      {
        chave: 'ativos.editar',
        area: 'Ativos',
        descricao: 'Cadastrar e editar os ativos, travar os campos, inativar e reativar',
        escopo: 'local',
        inclui: ['ativos.ver'],
      },
      {
        chave: 'ativos.restritos',
        area: 'Ativos',
        descricao: 'Ver os campos restritos dos ativos e, com a edição, editá-los',
        escopo: 'local',
        inclui: ['ativos.ver'],
      },
      {
        chave: 'ativos.acesso-remoto',
        area: 'Ativos',
        descricao: 'Acessar as máquinas por VNC',
        escopo: 'local',
        inclui: ['ativos.ver'],
      },
    ]);
  });

  it('tem a permissão dos coletores, na área Coleta, só para a organização inteira', () => {
    expect(PERMISSOES.filter((p) => p.area === 'Coleta')).toEqual([
      {
        chave: 'coletores.administrar',
        area: 'Coleta',
        descricao:
          'Cadastrar e editar os coletores e as faixas de rede deles, trocar o token, inativar e reativar',
        escopo: 'organizacao',
        inclui: [],
      },
    ]);
  });

  it('organizacao.editar define também as visões compartilhadas e os módulos', () => {
    expect(PERMISSOES.find((p) => p.chave === 'organizacao.editar')?.descricao).toBe(
      'Definir os padrões, as visões compartilhadas e os módulos da organização',
    );
  });

  it('tem a permissão do backup, que não inclui outras', () => {
    expect(PERMISSOES.find((p) => p.chave === 'backup.administrar')).toEqual({
      chave: 'backup.administrar',
      area: 'Backup',
      descricao:
        'Ver os backups, fazer um backup na hora e mudar o horário (só na organização que opera o servidor)',
      escopo: 'organizacao',
      inclui: [],
    });
  });

  it('passa na conferência', () => {
    expect(conferirCatalogo(PERMISSOES)).toEqual([]);
  });

  it('recusa chave repetida', () => {
    expect(conferirCatalogo([definicao('a.ver'), definicao('a.ver')])).toEqual([
      'A chave a.ver se repete.',
    ]);
  });

  it.each(['Pessoas.ver', 'pessoas', 'pessoas.ver.tudo', 'pessoas.vér'])(
    'recusa a chave fora do formato area.acao: %j',
    (chave) => {
      expect(conferirCatalogo([definicao(chave)])).toEqual([
        `A chave ${chave} não segue o formato area.acao.`,
      ]);
    },
  );

  it('recusa a inclusão de uma permissão que não existe', () => {
    expect(conferirCatalogo([definicao('a.ver', ['b.ver'])])).toEqual([
      'A permissão a.ver inclui b.ver, que não existe.',
    ]);
  });

  it('recusa inclusões em ciclo', () => {
    expect(
      conferirCatalogo([definicao('a.ver', ['b.ver']), definicao('b.ver', ['a.ver'])]),
    ).toEqual(['A permissão a.ver se inclui num ciclo.', 'A permissão b.ver se inclui num ciclo.']);
  });

  it('recusa descrição vazia', () => {
    expect(conferirCatalogo([definicao('a.ver', [], '  ')])).toEqual([
      'A permissão a.ver está sem descrição.',
    ]);
  });
});

describe('fechamento', () => {
  it('acrescenta as incluídas, de inclusão em inclusão', () => {
    expect([...fechamento(['acessos.administrar'])].sort()).toEqual([
      'acessos.administrar',
      'acessos.ver',
      'pessoas.ver',
    ]);
  });

  it('não acrescenta nada a quem não inclui', () => {
    expect([...fechamento(['auditoria.ver', 'locais.editar'])].sort()).toEqual([
      'auditoria.ver',
      'locais.editar',
    ]);
  });

  it('é vazio sem permissões', () => {
    expect(fechamento([]).size).toBe(0);
  });
});

describe('permissões conhecidas', () => {
  it.each([
    ['pessoas.ver', true],
    ['ativos.excluir', false],
    ['', false],
  ])('%j é conhecida: %s', (texto, conhecida) => {
    expect(permissaoConhecida(texto)).toBe(conhecida);
  });

  it('valida uma lista e diz a primeira desconhecida', () => {
    expect(validarPermissoes(['pessoas.ver', 'locais.editar'])).toBeNull();
    expect(validarPermissoes(['pessoas.ver', 'ativos.excluir', 'x.y'])).toBe(
      'Permissão desconhecida: ativos.excluir.',
    );
  });

  it('dá a descrição de cada permissão', () => {
    expect(descricaoDa('pessoas.editar')).toBe('Cadastrar e editar pessoas, inativar e reativar');
    expect(descricaoDa('auditoria.ver')).toBe('Consultar a auditoria');
    expect(descricaoDa('organizacao.editar')).toBe(
      'Definir os padrões, as visões compartilhadas e os módulos da organização',
    );
    expect(descricaoDa('tarefas.administrar')).toBe('Ver as tarefas com falha e tentar de novo');
  });
});
