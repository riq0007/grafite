import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { declaraEntradasDeFora, leDeForaDoPacote, verificarEntradas } from './entradas-do-turbo.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('leDeForaDoPacote', () => {
  it('pega um documento lido por caminho', () => {
    expect(leDeForaDoPacote('src/a.test.ts', "readFileSync(join(RAIZ, 'docs/mapa.md'))")).toBe(
      true,
    );
    expect(leDeForaDoPacote('src/a.test.ts', "join(raiz, '..', 'docs', 'operacao')")).toBe(true);
    expect(leDeForaDoPacote('src/a.test.ts', "readdirSync(join(RAIZ, 'openspec/specs'))")).toBe(
      true,
    );
  });

  it('pega a busca da raiz do repositório', () => {
    expect(
      leDeForaDoPacote('src/a.test.ts', "existsSync(join(pasta, 'pnpm-workspace.yaml'))"),
    ).toBe(true);
  });

  it('pega um caminho relativo que sobe acima do pacote', () => {
    expect(leDeForaDoPacote('src/brand/a.test.ts', "resolve(aqui, '../../../../..')")).toBe(true);
    expect(
      leDeForaDoPacote('src/modulos/a.test.ts', "import doc from '../../../../x/y.md?raw';"),
    ).toBe(true);
  });

  it('deixa passar o que fica dentro do pacote', () => {
    expect(
      leDeForaDoPacote('src/brand/a.test.ts', "import { temas } from '../tokens/temas.ts';"),
    ).toBe(false);
    expect(leDeForaDoPacote('src/a.test.ts', "import { x } from '../test/simulado.ts';")).toBe(
      false,
    );
    expect(leDeForaDoPacote('src/a.test.ts', "import { db } from '@grafite/db';")).toBe(false);
  });

  it('ignora os comentários', () => {
    expect(
      leDeForaDoPacote('src/a.test.ts', '// a regra está em docs/ANTISLOP.md\nconst a = 1;'),
    ).toBe(false);
    expect(leDeForaDoPacote('src/a.test.ts', '/* change em openspec/changes */ const a = 1;')).toBe(
      false,
    );
    expect(leDeForaDoPacote('src/a.test.ts', "const url = 'http://localhost/docs/x';")).toBe(true);
  });
});

describe('declaraEntradasDeFora', () => {
  it('aceita a tarefa test com uma entrada da raiz', () => {
    const turbo = { tasks: { test: { inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/docs/mapa.md'] } } };
    expect(declaraEntradasDeFora(turbo)).toBe(true);
  });

  it('recusa a falta do arquivo, da tarefa ou da entrada da raiz', () => {
    expect(declaraEntradasDeFora(undefined)).toBe(false);
    expect(declaraEntradasDeFora({ tasks: {} })).toBe(false);
    expect(declaraEntradasDeFora({ tasks: { test: { inputs: ['$TURBO_DEFAULT$'] } } })).toBe(false);
  });
});

describe('o repositório', () => {
  it('todo teste unitário que lê fora do pacote tem as entradas declaradas no turbo do pacote', () => {
    expect(verificarEntradas(raiz)).toEqual([]);
  });
});
