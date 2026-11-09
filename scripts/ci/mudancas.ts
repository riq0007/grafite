// O que o PR muda (change ci-paralelo, design, decisão 5): num PR só de documentação e specs, o CI
// pula a integração, as pontas a ponta e a regressão visual. Na dúvida, roda tudo.
// Uso no job: node scripts/ci/mudancas.ts <evento>. Num PR, o checkout é o commit de merge, e a
// diferença para o primeiro pai é exatamente o que o PR muda.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SO_DOCUMENTACAO = ['docs/', 'openspec/'];

/** Se o evento, com a lista de arquivos mudados, pede as verificações do código. */
export function codigoMudou(evento: string, arquivos: readonly string[]): boolean {
  if (evento !== 'pull_request' || arquivos.length === 0) return true;
  return arquivos.some((arquivo) => !SO_DOCUMENTACAO.some((pasta) => arquivo.startsWith(pasta)));
}

function arquivosDoPr(): string[] {
  try {
    const saida = execFileSync('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], {
      encoding: 'utf8',
    });
    return saida.split('\n').filter(Boolean);
  } catch (erro) {
    console.error(`Não deu para listar o que o PR muda, e tudo roda: ${(erro as Error).message}`);
    return [];
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evento = process.argv[2] ?? '';
  const arquivos = evento === 'pull_request' ? arquivosDoPr() : [];
  const codigo = codigoMudou(evento, arquivos);
  console.log(
    codigo
      ? 'O código mudou, ou o evento pede tudo: rodam todas as verificações.'
      : `Só a documentação e as specs mudaram (${arquivos.length} arquivos).`,
  );
  // O script roda direto no job, fora do turbo: as variáveis do executor não entram em cache nenhum.
  const { GITHUB_OUTPUT: saida, GITHUB_STEP_SUMMARY: resumo } = process.env;
  if (saida) appendFileSync(saida, `codigo=${codigo}\n`);
  if (!codigo && resumo) {
    appendFileSync(
      resumo,
      'A integração, as pontas a ponta e a regressão visual foram puladas: só a documentação e as specs mudaram.\n',
    );
  }
}
