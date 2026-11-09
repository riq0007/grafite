// Os executores dos workflows (spec plataforma-base, "Executores do CI"; change
// ci-nos-executores-do-github, design, decisão 1): cada job roda numa imagem fixada do GitHub, que
// começa numa máquina nova, e nenhum num executor próprio.

/** As imagens do GitHub que um job pode pedir: fixadas, e não `-latest`. */
export const IMAGENS_DO_GITHUB: readonly string[] = ['ubuntu-24.04', 'windows-2022'];

export interface ExecutorDoJob {
  arquivo: string;
  job: string;
  /** O valor do `runs-on` como o workflow o escreve; vazio quando ele vem nas linhas seguintes. */
  executor: string;
}

/**
 * O `runs-on` de cada job de um workflow, lido pelo texto: os jobs ficam com dois espaços dentro
 * de `jobs:`, e o `runs-on` com quatro, dentro de cada um.
 */
export function executoresDoWorkflow(arquivo: string, texto: string): ExecutorDoJob[] {
  const executores: ExecutorDoJob[] = [];
  let emJobs = false;
  let job = '';
  for (const linha of texto.split(/\r?\n/)) {
    if (/^jobs:\s*$/.test(linha)) {
      emJobs = true;
      continue;
    }
    if (/^\S/.test(linha)) emJobs = false;
    if (!emJobs) continue;
    const nome = /^ {2}([\w-]+):\s*$/.exec(linha);
    if (nome?.[1]) {
      job = nome[1];
      continue;
    }
    const executor = /^ {4}runs-on:(.*)$/.exec(linha);
    if (executor && job) executores.push({ arquivo, job, executor: executor[1]?.trim() ?? '' });
  }
  return executores;
}

/**
 * Se um job pode rodar no executor do `runs-on` dele: só numa das imagens fixadas do GitHub. As aspas
 * e a lista de um rótulo só são outras escritas da mesma imagem. Mais de um rótulo é sempre um
 * executor próprio, porque as imagens do GitHub têm um rótulo só. Uma expressão e o valor das linhas
 * seguintes não dão para conferir pelo texto, e são recusados.
 */
export function executorPermitido(executor: string): boolean {
  const rotulos = executor.replace(/^\[(.*)\]$/, '$1').split(',');
  if (rotulos.length !== 1) return false;
  const rotulo = (rotulos[0] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
  return IMAGENS_DO_GITHUB.includes(rotulo);
}
