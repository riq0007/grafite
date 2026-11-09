// O teste-guarda do mapa (change contexto-das-specs): o docs/mapa.md só cita capacidades,
// caminhos, seções da spec mestre e destinos do glossário que existem, e toda capacidade aparece
// nele. Cada caso confere antes um exemplo com o erro, para provar que o conferidor reprova.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

/** O que o conferidor sabe do disco: as pastas de `openspec/specs/` e se um caminho existe. */
interface Disco {
  capacidades: ReadonlySet<string>;
  existe: (caminho: string) => boolean;
}

/** O trecho de uma seção do mapa, pelo título: do "## N. Título" até a seção seguinte. */
function secao(mapa: string, titulo: string): string {
  const inicio = mapa.search(new RegExp(`^## \\d+\\. ${titulo}\\s*$`, 'm'));
  if (inicio < 0) return '';
  const resto = mapa.slice(inicio).replace(/^.*\n/, '');
  const fim = resto.search(/^## /m);
  return fim < 0 ? resto : resto.slice(0, fim);
}

/** As linhas de dados das tabelas de um trecho, como listas de células, sem cabeçalho nem divisória. */
function linhasDaTabela(trecho: string): string[][] {
  const linhas = trecho.split('\n').filter((linha) => linha.startsWith('|'));
  return linhas
    .filter((linha, indice) => indice > 0 && !/^\|[\s|:-]+\|$/.test(linha))
    .map((linha) =>
      linha
        .slice(1, -1)
        .split('|')
        .map((celula) => celula.trim()),
    );
}

const entreCrases = (texto: string) =>
  [...texto.matchAll(/`([^`]+)`/g)].map((achado) => achado[1] ?? '');

/** As seções da spec mestre citadas num texto: "seção 5.2" e "Apêndice A". */
const secoesCitadas = (texto: string) => [
  ...[...texto.matchAll(/\bseção (\d+(?:\.\d+)?)/g)].map((achado) => achado[1] ?? ''),
  ...[...texto.matchAll(/\bApêndice ([A-Z](?:\.\d+)?)/g)].map((achado) => achado[1] ?? ''),
];

/** A seção tem título na spec mestre: "## 5.", "### 5.2", "## Apêndice A" ou "### A.1". */
function temTitulo(mestre: string, numero: string): boolean {
  const escapado = numero.replace('.', '\\.');
  const titulo = /^[A-Z]$/.test(numero)
    ? `^## Apêndice ${numero} `
    : numero.includes('.')
      ? `^### ${escapado} `
      : `^## ${escapado}\\. `;
  return new RegExp(titulo, 'm').test(mestre);
}

const capacidadesDaTabela = (mapa: string) => linhasDaTabela(secao(mapa, 'Capacidades'));

function pastasForaDaTabela(mapa: string, disco: Disco): string[] {
  const naTabela = new Set(capacidadesDaTabela(mapa).flatMap(([nome = '']) => entreCrases(nome)));
  return [...disco.capacidades].filter((pasta) => !naTabela.has(pasta));
}

function pastasQueNaoExistem(mapa: string, disco: Disco): string[] {
  return capacidadesDaTabela(mapa)
    .flatMap(([nome = '', , juntas = '']) => [...entreCrases(nome), ...entreCrases(juntas)])
    .filter((pasta) => !disco.capacidades.has(pasta));
}

function caminhosQueNaoExistem(mapa: string, disco: Disco): string[] {
  const caminhos = entreCrases(mapa).filter((trecho) =>
    /^(docs|openspec|apps|packages)\//.test(trecho),
  );
  return [...new Set(caminhos)].filter((caminho) => !disco.existe(caminho));
}

function secoesSemTitulo(mapa: string, mestre: string): string[] {
  const citadas = [
    ...linhasDaTabela(secao(mapa, 'Spec mestre por seção')).map(([numero = '']) => numero),
    ...secoesCitadas(mapa),
  ];
  return [...new Set(citadas)].filter((numero) => !temTitulo(mestre, numero));
}

function termosSemDestino(mapa: string, disco: Disco, mestre: string): string[] {
  return linhasDaTabela(secao(mapa, 'Glossário')).flatMap(([termo = '', , onde = '']) => {
    const nomes = entreCrases(onde);
    const secoes = secoesCitadas(onde);
    if (nomes.length === 0 && secoes.length === 0) return [`${termo}: não aponta para nada`];
    return [
      ...nomes
        .filter((nome) => !(nome.includes('/') ? disco.existe(nome) : disco.capacidades.has(nome)))
        .map((nome) => `${termo}: \`${nome}\` não existe`),
      ...secoes
        .filter((numero) => !temTitulo(mestre, numero))
        .map((numero) => `${termo}: a seção ${numero} da spec mestre não existe`),
    ];
  });
}

/** A raiz do repositório: a primeira pasta com o pnpm-workspace.yaml, de onde o teste roda para cima. */
function raizDoRepositorio(): string {
  let pasta = cwd();
  while (!existsSync(join(pasta, 'pnpm-workspace.yaml'))) {
    const acima = dirname(pasta);
    if (acima === pasta) throw new Error('O teste não achou a raiz do repositório.');
    pasta = acima;
  }
  return pasta;
}

const RAIZ = raizDoRepositorio();
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

const DISCO: Disco = {
  capacidades: new Set(
    readdirSync(join(RAIZ, 'openspec/specs'), { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => entrada.name),
  ),
  existe: (caminho) => existsSync(join(RAIZ, caminho)),
};
const MAPA = ler('docs/mapa.md');
const MESTRE = ler('docs/superpowers/specs/2026-09-24-grafite-design.md');

/** Um mapa pequeno com um erro de cada tipo, sobre um disco e uma spec mestre pequenos. */
const EXEMPLO = [
  '## 2. Spec mestre por seção',
  '',
  '| Seção | O que decide |',
  '|---|---|',
  '| 5.2 | As decisões do domínio |',
  '| 99 | Uma seção que não existe |',
  '',
  '## 5. Capacidades',
  '',
  '| Capacidade | O que cobre | Muda junto com |',
  '|---|---|---|',
  '| `locais` | A árvore de locais | `fantasma` |',
  '| `inexistente` | Nada | — |',
  '',
  'Veja `docs/mapa.md` e `docs/que-nao-existe.md`.',
  '',
  '## 7. Glossário',
  '',
  '| Termo | O que é | Onde |',
  '|---|---|---|',
  '| Local | Onde as coisas ficam | `locais`; spec mestre, seção 5.2 |',
  '| Fantasma | Nada | `fantasma` |',
  '| Solto | Nada | — |',
  '| Perdido | Nada | spec mestre, seção 42 |',
].join('\n');
const DISCO_DO_EXEMPLO: Disco = {
  capacidades: new Set(['locais', 'permissoes']),
  existe: (caminho) => caminho === 'docs/mapa.md',
};
const MESTRE_DO_EXEMPLO = '## 5. Modelo de domínio\n\n### 5.2 Decisões\n';

describe('o mapa dos documentos', () => {
  it('toda pasta de openspec/specs/ aparece na tabela de capacidades', () => {
    expect(pastasForaDaTabela(EXEMPLO, DISCO_DO_EXEMPLO)).toEqual(['permissoes']);
    expect(pastasForaDaTabela(MAPA, DISCO)).toEqual([]);
  });

  it('a tabela de capacidades só cita pastas que existem', () => {
    expect(pastasQueNaoExistem(EXEMPLO, DISCO_DO_EXEMPLO)).toEqual(['fantasma', 'inexistente']);
    expect(pastasQueNaoExistem(MAPA, DISCO)).toEqual([]);
  });

  it('todo caminho entre crases existe no disco', () => {
    expect(caminhosQueNaoExistem(EXEMPLO, DISCO_DO_EXEMPLO)).toEqual(['docs/que-nao-existe.md']);
    expect(caminhosQueNaoExistem(MAPA, DISCO)).toEqual([]);
  });

  it('toda seção da spec mestre citada tem título no arquivo', () => {
    expect(secoesSemTitulo(EXEMPLO, MESTRE_DO_EXEMPLO)).toEqual(['99', '42']);
    expect(linhasDaTabela(secao(MAPA, 'Spec mestre por seção'))).not.toHaveLength(0);
    expect(secoesSemTitulo(MAPA, MESTRE)).toEqual([]);
  });

  it('todo termo do glossário aponta para uma capacidade ou um documento que existe', () => {
    expect(termosSemDestino(EXEMPLO, DISCO_DO_EXEMPLO, MESTRE_DO_EXEMPLO)).toEqual([
      'Fantasma: `fantasma` não existe',
      'Solto: não aponta para nada',
      'Perdido: a seção 42 da spec mestre não existe',
    ]);
    expect(linhasDaTabela(secao(MAPA, 'Glossário'))).not.toHaveLength(0);
    expect(termosSemDestino(MAPA, DISCO, MESTRE)).toEqual([]);
  });
});
