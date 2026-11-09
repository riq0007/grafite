import { describe, expect, it } from 'vitest';
import {
  type LocalDaArvore,
  MOTIVOS_DA_ARVORE,
  montarArvore,
  ROTULOS_DOS_TIPOS,
  validarNomeDoLocal,
} from './arvore.ts';

const local = (
  id: string,
  paiId: string | null,
  nome: string,
  situacao: LocalDaArvore['situacao'] = 'ativo',
): LocalDaArvore => ({ id, paiId, nome, tipo: 'outro', situacao });

/**
 * Jundiaí
 * ├─ Administrativo
 * │  ├─ 1º andar
 * │  │  └─ Sala 12
 * │  └─ Recepção
 * └─ Expedição
 * Campinas
 */
const LOCAIS = [
  local('jun', null, 'Jundiaí'),
  local('adm', 'jun', 'Administrativo'),
  local('and1', 'adm', '1º andar'),
  local('s12', 'and1', 'Sala 12'),
  local('rec', 'adm', 'Recepção', 'inativo'),
  local('exp', 'jun', 'Expedição'),
  local('cps', null, 'Campinas'),
];

/** Uma linha de 8 níveis: n1 › n2 › … › n8. */
const linha = (niveis: number) =>
  Array.from({ length: niveis }, (_, i) =>
    local(`n${i + 1}`, i === 0 ? null : `n${i}`, `Nível ${i + 1}`),
  );

describe('montarArvore', () => {
  const arvore = montarArvore(LOCAIS);

  it('dá o caminho do local, da raiz até ele', () => {
    expect(arvore.caminho('s12')).toBe('Jundiaí › Administrativo › 1º andar › Sala 12');
    expect(arvore.caminho('cps')).toBe('Campinas');
  });

  it('dá os ancestrais, da raiz até o pai', () => {
    expect(arvore.ancestrais('s12')).toEqual(['jun', 'adm', 'and1']);
    expect(arvore.ancestrais('jun')).toEqual([]);
  });

  it('dá o ramo: o local e tudo o que está dentro dele', () => {
    expect([...arvore.ramo('adm')].sort()).toEqual(['adm', 'and1', 'rec', 's12']);
    expect([...arvore.ramo('s12')]).toEqual(['s12']);
  });

  it('dá os filhos em ordem de nome, e a raiz com nulo', () => {
    expect(arvore.filhos('jun').map((l) => l.id)).toEqual(['adm', 'exp']);
    expect(arvore.filhos(null).map((l) => l.id)).toEqual(['cps', 'jun']);
  });

  it('dá a profundidade e a altura do ramo', () => {
    expect(arvore.profundidade('jun')).toBe(1);
    expect(arvore.profundidade('s12')).toBe(4);
    expect(arvore.alturaDoRamo('jun')).toBe(4);
    expect(arvore.alturaDoRamo('s12')).toBe(1);
  });

  it('diz se há filho ativo', () => {
    expect(arvore.temFilhoAtivo('adm')).toBe(true);
    expect(arvore.temFilhoAtivo('and1')).toBe(true);
    expect(arvore.temFilhoAtivo('s12')).toBe(false);
    expect(
      montarArvore([local('a', null, 'A'), local('b', 'a', 'B', 'inativo')]).temFilhoAtivo('a'),
    ).toBe(false);
  });

  it('não entra em laço com dados em ciclo', () => {
    const emCiclo = montarArvore([local('a', 'b', 'A'), local('b', 'a', 'B')]);
    expect(emCiclo.ancestrais('a')).toEqual(['b']);
  });
});

describe('cadastrar', () => {
  const arvore = montarArvore(LOCAIS);

  it('aceita um nome novo no lugar', () => {
    expect(arvore.podeCriar({ paiId: 'jun', nome: 'Portaria' })).toBeNull();
    expect(arvore.podeCriar({ paiId: null, nome: 'Sorocaba' })).toBeNull();
  });

  it('recusa o nome repetido entre irmãos, sem acento nem maiúsculas', () => {
    expect(arvore.podeCriar({ paiId: 'jun', nome: '  expedicao ' })).toBe(
      'Já existe um local com este nome aqui.',
    );
    expect(arvore.podeCriar({ paiId: null, nome: 'JUNDIAI' })).toBe(
      'Já existe um local com este nome aqui.',
    );
  });

  it('conta os irmãos inativos', () => {
    expect(arvore.podeCriar({ paiId: 'adm', nome: 'Recepcao' })).toBe(
      'Já existe um local com este nome aqui.',
    );
  });

  it('aceita o mesmo nome em outro lugar', () => {
    expect(arvore.podeCriar({ paiId: 'exp', nome: 'Sala 12' })).toBeNull();
  });

  it('recusa passar de 8 níveis', () => {
    const funda = montarArvore(linha(8));
    expect(montarArvore(linha(7)).podeCriar({ paiId: 'n7', nome: 'Oitavo' })).toBeNull();
    expect(funda.podeCriar({ paiId: 'n8', nome: 'Nono' })).toBe(
      'A árvore de locais tem no máximo 8 níveis.',
    );
  });

  it('recusa o nome inválido', () => {
    expect(arvore.podeCriar({ paiId: null, nome: '   ' })).toBe('Informe o nome do local.');
  });
});

describe('renomear', () => {
  const arvore = montarArvore(LOCAIS);

  it('aceita o próprio nome com outra grafia', () => {
    expect(arvore.podeRenomear('exp', 'EXPEDIÇÃO')).toBeNull();
  });

  it('recusa o nome de um irmão', () => {
    expect(arvore.podeRenomear('exp', 'administrativo')).toBe(
      'Já existe um local com este nome aqui.',
    );
  });
});

describe('mover', () => {
  const arvore = montarArvore(LOCAIS);

  it('aceita mover para outro ramo e para a raiz', () => {
    expect(arvore.podeMover('and1', 'exp')).toBeNull();
    expect(arvore.podeMover('exp', null)).toBeNull();
  });

  it('recusa mover para dentro de si mesmo ou de um descendente', () => {
    const ciclo = 'Um local não pode ficar dentro dele mesmo.';
    expect(arvore.podeMover('jun', 'jun')).toBe(ciclo);
    expect(arvore.podeMover('jun', 's12')).toBe(ciclo);
  });

  it('recusa o nome repetido no destino', () => {
    expect(
      montarArvore([...LOCAIS, local('s12b', 'exp', 'Sala 12')]).podeMover('s12b', 'and1'),
    ).toBe('Já existe um local com este nome aqui.');
  });

  it('recusa passar de 8 níveis levando o ramo', () => {
    const locais = [...linha(6), local('x', null, 'X'), local('y', 'x', 'Y'), local('z', 'y', 'Z')];
    const arvoreFunda = montarArvore(locais);
    expect(arvoreFunda.podeMover('y', 'n6')).toBeNull();
    expect(arvoreFunda.podeMover('x', 'n6')).toBe('A árvore de locais tem no máximo 8 níveis.');
  });
});

describe('MOTIVOS_DA_ARVORE', () => {
  it('são os motivos que as conferências devolvem, para quem precisa saber qual foi', () => {
    const arvore = montarArvore(LOCAIS);
    expect(arvore.podeCriar({ paiId: 'jun', nome: 'expedicao' })).toBe(
      MOTIVOS_DA_ARVORE.nomeRepetido,
    );
    expect(montarArvore(linha(8)).podeCriar({ paiId: 'n8', nome: 'Nono' })).toBe(
      MOTIVOS_DA_ARVORE.niveis,
    );
    expect(arvore.podeMover('jun', 's12')).toBe(MOTIVOS_DA_ARVORE.ciclo);
  });
});

describe('validarNomeDoLocal', () => {
  it.each([
    ['', 'Informe o nome do local.'],
    ['   ', 'Informe o nome do local.'],
    ['a'.repeat(81), 'Use até 80 caracteres.'],
  ])('recusa %j', (nome, motivo) => {
    expect(validarNomeDoLocal(nome)).toBe(motivo);
  });

  it('aceita até 80 caracteres, sem contar os espaços das pontas', () => {
    expect(validarNomeDoLocal(`  ${'a'.repeat(80)}  `)).toBeNull();
  });
});

describe('tipos de local', () => {
  it('tem o rótulo de cada tipo, na ordem da lista', () => {
    expect(Object.values(ROTULOS_DOS_TIPOS)).toEqual([
      'Unidade',
      'Prédio',
      'Andar',
      'Setor',
      'Sala',
      'Outro',
    ]);
  });
});
