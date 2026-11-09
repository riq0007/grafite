// O guarda das entradas do turbo (change ci-paralelo, design, decisão 4): a checagem de tipos e os
// testes unitários de um pacote sem mudança saem do cache, e o turbo só sabe dos arquivos do próprio
// pacote. Um teste que lê fora dele (um documento, uma spec, um arquivo gerado noutro pacote)
// declara essas entradas no turbo.json do pacote, ou o cache aprovaria um teste que reprovaria.
// É uma heurística: pega os padrões que o repositório usa, e não qualquer leitura possível.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

interface TurboDoPacote {
  tasks?: Record<string, { inputs?: string[] } | undefined>;
}

const SEM_COMENTARIOS = [/\/\*[\s\S]*?\*\//g, /(^|[^:])\/\/.*$/gm] as const;
const NOMES_DE_FORA = [/(['"`/])docs(['"`/])/, /(['"`/])openspec(['"`/])/, /pnpm-workspace\.yaml/];
const TEXTO = /(['"`])([^'"`\n]*)\1/g;

/** Se o teste, pelo caminho dentro do pacote e pelo conteúdo, lê algum arquivo fora do pacote. */
export function leDeForaDoPacote(caminhoNoPacote: string, conteudo: string): boolean {
  const codigo = SEM_COMENTARIOS.reduce((texto, padrao) => texto.replace(padrao, '$1'), conteudo);
  if (NOMES_DE_FORA.some((padrao) => padrao.test(codigo))) return true;
  const pasta = posix.dirname(caminhoNoPacote.split(sep).join('/'));
  for (const [, , texto = ''] of codigo.matchAll(TEXTO)) {
    if (texto !== '..' && !texto.startsWith('../')) continue;
    if (posix.normalize(posix.join(pasta, texto)).startsWith('..')) return true;
  }
  return false;
}

/** Se o turbo.json do pacote declara, na tarefa test, alguma entrada de fora dele. */
export function declaraEntradasDeFora(turbo: TurboDoPacote | undefined): boolean {
  const entradas = turbo?.tasks?.test?.inputs ?? [];
  return entradas.some((entrada) => entrada.startsWith('$TURBO_ROOT$/'));
}

const PASTAS_IGNORADAS = new Set(['node_modules', 'dist', 'test-results', 'coverage', '.turbo']);

function testesUnitarios(pasta: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      if (!PASTAS_IGNORADAS.has(entrada.name)) achados.push(...testesUnitarios(caminho));
    } else if (/\.test\.tsx?$/.test(entrada.name) && !/\.int\.test\./.test(entrada.name)) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** Os problemas do repositório: cada teste que lê fora de um pacote que não declara as entradas. */
export function verificarEntradas(raiz: string): string[] {
  const problemas: string[] = [];
  for (const grupo of ['apps', 'packages']) {
    for (const nome of readdirSync(join(raiz, grupo))) {
      const pacote = join(raiz, grupo, nome);
      if (!existsSync(join(pacote, 'package.json'))) continue;
      const arquivoDoTurbo = join(pacote, 'turbo.json');
      const turbo = existsSync(arquivoDoTurbo)
        ? (JSON.parse(readFileSync(arquivoDoTurbo, 'utf8')) as TurboDoPacote)
        : undefined;
      if (declaraEntradasDeFora(turbo)) continue;
      for (const teste of testesUnitarios(pacote)) {
        if (leDeForaDoPacote(relative(pacote, teste), readFileSync(teste, 'utf8'))) {
          const noRepositorio = relative(raiz, teste).split(sep).join('/');
          problemas.push(
            `${noRepositorio} lê fora do pacote, e o ${grupo}/${nome}/turbo.json não declara as entradas $TURBO_ROOT$/ da tarefa test.`,
          );
        }
      }
    }
  }
  return problemas;
}
