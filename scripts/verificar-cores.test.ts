import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { encontrarCoresLiterais, verificarRepositorio } from './verificar-cores.ts';

const cli = join(dirname(fileURLToPath(import.meta.url)), 'verificar-cores.ts');

describe('encontrarCoresLiterais', () => {
  it('aponta hex dentro de string num .tsx, com linha e coluna', () => {
    const fonte = "const a = 1;\nconst estilo = { color: '#ff8800' };\n";
    expect(encontrarCoresLiterais(fonte, 'tsx')).toEqual([
      { linha: 2, coluna: 26, trecho: '#ff8800' },
    ]);
  });

  it('aponta rgb() num .css', () => {
    const fonte = '.a {\n  background: rgb(10 20 30);\n}\n';
    expect(encontrarCoresLiterais(fonte, 'css')).toEqual([
      { linha: 2, coluna: 15, trecho: 'rgb(10 20 30)' },
    ]);
  });

  it('aponta nome de cor usado como valor de propriedade CSS', () => {
    expect(encontrarCoresLiterais('.b { color: white; }', 'css')).toEqual([
      { linha: 1, coluna: 13, trecho: 'white' },
    ]);
  });

  it('aponta nome de cor exato numa string de .tsx', () => {
    expect(encontrarCoresLiterais("<div style={{ color: 'red' }} />", 'tsx')).toEqual([
      { linha: 1, coluna: 23, trecho: 'red' },
    ]);
  });

  it('aceita variáveis, color-mix com variáveis, transparent e currentColor', () => {
    const fonte =
      '.c { color: var(--text); background: color-mix(in srgb, var(--ok) 15%, transparent); border-color: currentColor; }';
    expect(encontrarCoresLiterais(fonte, 'css')).toEqual([]);
  });

  it('ignora campo privado de classe e comentários em TypeScript', () => {
    const fonte = "class A {\n  #fade = 1;\n}\n// cor antiga: '#ffffff'\n/* e 'rgb(0 0 0)' */\n";
    expect(encontrarCoresLiterais(fonte, 'ts')).toEqual([]);
  });

  it('não confunde barras de URL dentro de string com comentário', () => {
    const fonte = "const u = 'http://exemplo'; const c = '#000';";
    expect(encontrarCoresLiterais(fonte, 'ts')).toEqual([{ linha: 1, coluna: 40, trecho: '#000' }]);
  });

  it('não aponta nome de cor em seletor nem dentro do nome de uma variável', () => {
    const fonte = '.btn:not(.white) {\n  border: 1px solid var(--white-line);\n}\n';
    expect(encontrarCoresLiterais(fonte, 'css')).toEqual([]);
  });

  it('ignora comentários em CSS', () => {
    const fonte = '/* antigo: #000 e white */\n.a { color: var(--text); }\n';
    expect(encontrarCoresLiterais(fonte, 'css')).toEqual([]);
  });
});

describe('verificarRepositorio', () => {
  let raiz = '';

  function arquivo(caminho: string, conteudo: string) {
    const completo = join(raiz, caminho);
    mkdirSync(dirname(completo), { recursive: true });
    writeFileSync(completo, conteudo);
  }

  function repositorioDeExemplo() {
    raiz = mkdtempSync(join(tmpdir(), 'grafite-cores-'));
    arquivo('apps/web/src/x.tsx', "export const c = '#123456';\n");
    arquivo('apps/web/src/estilo.module.css', '.a { border-color: hsl(0 0% 50%); }\n');
    arquivo('packages/ui/src/tokens/cores.ts', "export const azul = '#5aa2ff';\n");
    arquivo('apps/web/src/x.test.tsx', "const c = '#abcdef';\n");
    arquivo('node_modules/pacote/i.css', '.a{color:#fff}\n');
    arquivo('apps/web/dist/a.css', '.a{color:#fff}\n');
  }

  afterEach(() => {
    if (raiz) rmSync(raiz, { recursive: true, force: true });
    raiz = '';
  });

  it('aponta os arquivos fora dos tokens e ignora tokens, testes, node_modules e dist', async () => {
    repositorioDeExemplo();
    expect(await verificarRepositorio(raiz)).toEqual([
      { arquivo: 'apps/web/src/estilo.module.css', linha: 1, coluna: 20, trecho: 'hsl(0 0% 50%)' },
      { arquivo: 'apps/web/src/x.tsx', linha: 1, coluna: 19, trecho: '#123456' },
    ]);
  });

  it('ignora a .grafite, a pasta dos dados locais que o Git não leva', async () => {
    raiz = mkdtempSync(join(tmpdir(), 'grafite-cores-'));
    arquivo('.grafite/propostas/mockups/m01.css', '.a { color: #000; }\n');
    arquivo('.grafite/propostas/galeria/montar.mjs', "const fundo = '#111';\n");
    arquivo('apps/web/src/x.tsx', "export const c = '#123456';\n");
    expect(await verificarRepositorio(raiz)).toEqual([
      { arquivo: 'apps/web/src/x.tsx', linha: 1, coluna: 19, trecho: '#123456' },
    ]);
  });

  it('o nome de cor numa string só conta no código das telas: a cor de um consumível é dado', async () => {
    raiz = mkdtempSync(join(tmpdir(), 'grafite-cores-'));
    arquivo('packages/domain/src/consumiveis.ts', "export const CORES = ['preto', 'magenta'];\n");
    arquivo('packages/api-client/src/esquema.ts', 'export type Cor = "magenta";\n');
    arquivo('packages/domain/src/hex.ts', "export const h = '#123456';\n");
    arquivo('apps/web/src/tela.tsx', "const estilo = { color: 'magenta' };\n");
    arquivo('packages/ui/src/c.tsx', "const c = 'red';\n");
    expect(await verificarRepositorio(raiz)).toEqual([
      { arquivo: 'apps/web/src/tela.tsx', linha: 1, coluna: 26, trecho: 'magenta' },
      { arquivo: 'packages/domain/src/hex.ts', linha: 1, coluna: 19, trecho: '#123456' },
      { arquivo: 'packages/ui/src/c.tsx', linha: 1, coluna: 12, trecho: 'red' },
    ]);
  });

  it('a linha de comando sai com código 1 e lista arquivo:linha:coluna quando há cor literal', () => {
    repositorioDeExemplo();
    const r = spawnSync(process.execPath, [cli, raiz], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('apps/web/src/x.tsx:1:19');
    expect(r.stdout).toContain('apps/web/src/estilo.module.css:1:20');
  });

  it('a linha de comando sai com código 0 quando não há cor literal', () => {
    raiz = mkdtempSync(join(tmpdir(), 'grafite-cores-'));
    arquivo('apps/web/src/ok.tsx', "export const c = 'var(--accent)';\n");
    const r = spawnSync(process.execPath, [cli, raiz], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
});
