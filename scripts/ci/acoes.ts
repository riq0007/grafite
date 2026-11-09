// As ações dos workflows (spec plataforma-base, "Repositório público protegido"; change
// publicar-no-repositorio-novo, design, decisão 4): no repositório público, o GitHub só roda as ações
// dele e as do dono. O teste-guarda recusa antes, no pnpm test, a ação de outra conta, com o arquivo,
// o job e o passo, em vez de o erro só aparecer no GitHub, como um run recusado.
import { parse } from 'yaml';

export interface UsoDeAcao {
  arquivo: string;
  /** O job do workflow, ou "(ação composta)" nos passos de uma ação local. */
  job: string;
  /** O nome do passo, "passo N" pela posição dele no job, ou "(o job inteiro)" num workflow reutilizado. */
  passo: string;
  uses: string;
}

/** As contas do próprio GitHub, que publicam as ações oficiais. */
const CONTAS_DO_GITHUB: readonly string[] = ['actions', 'github'];

const texto = (valor: unknown): string | undefined =>
  typeof valor === 'string' ? valor : undefined;

function usosDosPassos(arquivo: string, job: string, passos: unknown): UsoDeAcao[] {
  const lista: unknown[] = Array.isArray(passos) ? passos : [];
  return lista.flatMap((item, indice) => {
    const passo = (item ?? {}) as { name?: unknown; uses?: unknown };
    const uses = texto(passo.uses);
    if (uses === undefined) return [];
    return [{ arquivo, job, passo: texto(passo.name) ?? `passo ${indice + 1}`, uses: uses.trim() }];
  });
}

/** Os `uses` de um workflow, por passo e por job reutilizado, ou os de uma ação composta. */
export function acoesDoArquivo(arquivo: string, conteudo: string): UsoDeAcao[] {
  const definicao = (parse(conteudo) ?? {}) as {
    jobs?: Record<string, { uses?: unknown; steps?: unknown } | null>;
    runs?: { steps?: unknown };
  };
  if (definicao.runs) return usosDosPassos(arquivo, '(ação composta)', definicao.runs.steps);
  return Object.entries(definicao.jobs ?? {}).flatMap(([job, corpo]) => {
    const reutilizado = texto(corpo?.uses);
    if (reutilizado !== undefined) {
      return [{ arquivo, job, passo: '(o job inteiro)', uses: reutilizado.trim() }];
    }
    return usosDosPassos(arquivo, job, corpo?.steps);
  });
}

/**
 * Se o workflow pode usar a ação: uma do próprio repositório (`./`) ou uma das contas do GitHub, no
 * formato `conta/repositório@versão`. A conta é comparada inteira, para `actions-mirror` não passar
 * por `actions`. A imagem de contêiner (`docker://`), a ação sem versão e o valor vazio são recusados.
 */
export function acaoPermitida(uses: string): boolean {
  if (uses.startsWith('./')) return true;
  const conta = /^([^/@\s]+)\/[^@\s]+@\S+$/.exec(uses)?.[1];
  return conta !== undefined && CONTAS_DO_GITHUB.includes(conta.toLowerCase());
}
