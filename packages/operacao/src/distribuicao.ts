// A distribuição do backup (spec backup; design do F2d, decisões 11 e 12): o backup pronto no primeiro
// destino é copiado para os outros, cada cópia numa `.parcial` conferida com o manifesto e renomeada
// no fim. O backup só conta como feito quando chegou a todos, e só então a retenção roda em cada um.
// Uma `.parcial` que sobrou de uma execução anterior é apagada na seguinte. O nome é o minuto em que
// o backup começou; o segundo do mesmo minuto ganha o sufixo -2, e assim por diante (change
// backup-no-mesmo-minuto).
import { access, copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { backupsQueFicam, type Retencao } from '@grafite/domain';
import { conferirPartes, lerManifesto } from './manifesto.ts';
import { renomearComPaciencia } from './renomear.ts';

/** A pasta dos backups da produção em cada destino. */
export const PASTA_NOS_DESTINOS = 'grafite-producao';

/**
 * A marca de um destino do backup no servidor Linux (change servidor-linux-com-docker, design,
 * decisão 11), gravada pela instalação: o destino sem ela, como o ponto de montagem vazio de um
 * compartilhamento desmontado, é recusado quando a configuração exige a marca.
 */
export const MARCA_DO_DESTINO = '.grafite-destino';

const NOME_DO_BACKUP = /^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})Z(?:-(\d+))?$/;

/** O minuto do nome e o número do sufixo, com o nome sem sufixo valendo 1. */
function partesDoNome(nome: string): { minuto: string; numero: number } {
  const [, dia = '', hora = '', minuto = '', sufixo] = NOME_DO_BACKUP.exec(nome) ?? [];
  return { minuto: `${dia}T${hora}:${minuto}`, numero: sufixo === undefined ? 1 : Number(sufixo) };
}

/** Do mais antigo ao mais novo: pelo minuto e, no mesmo minuto, pelo sufixo. */
function antesNoTempo(a: string, b: string): number {
  const [pa, pb] = [partesDoNome(a), partesDoNome(b)];
  return pa.minuto === pb.minuto ? pa.numero - pb.numero : pa.minuto < pb.minuto ? -1 : 1;
}

/** O nome do minuto se nenhum destino tem um backup pronto com ele; senão, o primeiro `-N` livre. */
export async function nomeLivre(destinos: readonly string[], nome: string): Promise<string> {
  const existe = (caminho: string) =>
    access(caminho).then(
      () => true,
      () => false,
    );
  for (let numero = 1; ; numero++) {
    const candidato = numero === 1 ? nome : `${nome}-${numero}`;
    const ocupado = await Promise.all(
      destinos.map((destino) => existe(pastasNoDestino(destino, candidato).pronta)),
    );
    if (!ocupado.includes(true)) return candidato;
  }
}

export interface ResultadoNoDestino {
  destino: string;
  situacao: 'gravado' | 'falhou';
  erro?: string;
  /** Um problema que não desfaz o backup, como um antigo que a retenção não conseguiu apagar. */
  aviso?: string;
}

export interface DependenciasDaDistribuicao {
  /** Os destinos na ordem da configuração; o backup já está pronto no primeiro. */
  destinos: readonly string[];
  retencao: Retencao;
  fuso: string;
  copiarArquivo?: (origem: string, destino: string) => Promise<void>;
  /** No Linux, o backup só grava no destino com a marca da instalação. */
  exigirMarca?: boolean;
}

/** Recusa o destino sem a marca da instalação, antes de gravar qualquer coisa nele. */
export async function conferirMarcaDoDestino(destino: string): Promise<void> {
  try {
    await access(join(destino, MARCA_DO_DESTINO));
  } catch {
    throw new Error(
      `O destino ${destino} não tem a marca do Grafite (${MARCA_DO_DESTINO}): ele pode ser um compartilhamento que não está montado, e o backup não grava no disco do servidor no lugar dele.`,
    );
  }
}

export function pastasNoDestino(destino: string, nome: string) {
  const base = join(destino, PASTA_NOS_DESTINOS);
  return { base, parcial: join(base, `${nome}.parcial`), pronta: join(base, nome) };
}

/** Copia o backup `nome` do primeiro destino para os outros e, com todos gravados, roda a retenção. */
export async function distribuirBackup(
  nome: string,
  {
    destinos,
    retencao,
    fuso,
    copiarArquivo = copyFile,
    exigirMarca = false,
  }: DependenciasDaDistribuicao,
): Promise<{ destinos: ResultadoNoDestino[]; removidos: string[] }> {
  const [primeiro, ...outros] = destinos;
  if (primeiro === undefined) throw new Error('Nenhum destino de backup configurado.');
  const origem = pastasNoDestino(primeiro, nome).pronta;
  const manifesto = await lerManifesto(origem);

  const resultados: ResultadoNoDestino[] = [{ destino: primeiro, situacao: 'gravado' }];
  for (const destino of outros) {
    const { base, parcial, pronta } = pastasNoDestino(destino, nome);
    try {
      if (exigirMarca) await conferirMarcaDoDestino(destino);
      await mkdir(parcial, { recursive: true });
      for (const arquivo of ['banco.dump', 'arquivos.zip', 'manifesto.json']) {
        await copiarArquivo(join(origem, arquivo), join(parcial, arquivo));
      }
      const problemas = await conferirPartes(parcial, manifesto);
      if (problemas.length > 0) throw new Error(problemas.join(' '));
      await mkdir(base, { recursive: true });
      await renomearComPaciencia(parcial, pronta);
      resultados.push({ destino, situacao: 'gravado' });
    } catch (erro) {
      resultados.push({ destino, situacao: 'falhou', erro: motivo(erro) });
    }
  }
  if (resultados.some((resultado) => resultado.situacao === 'falhou')) {
    return { destinos: resultados, removidos: [] };
  }

  const removidos = new Set<string>();
  for (const resultado of resultados) {
    const naoApagados = await aplicarRetencao(resultado.destino, retencao, fuso, removidos);
    if (naoApagados.length > 0) resultado.aviso = naoApagados.join(' ');
  }
  return { destinos: resultados, removidos: [...removidos].sort() };
}

/** Os backups prontos de um destino, pelo nome, do mais antigo ao mais novo. */
export async function backupsProntosNoDestino(destino: string): Promise<string[]> {
  const { base } = pastasNoDestino(destino, '');
  const nomes = await readdir(base).catch(() => [] as string[]);
  return nomes.filter((nome) => NOME_DO_BACKUP.test(nome)).sort(antesNoTempo);
}

/**
 * O momento em que o backup começou, pelo minuto do nome. O sufixo desempata em milissegundos, para
 * a retenção ver o `-2` como o mais novo do minuto.
 */
function momentoDoBackup(nome: string): Date {
  const { minuto, numero } = partesDoNome(nome);
  return new Date(new Date(`${minuto}:00Z`).getTime() + numero - 1);
}

/** Apaga, em cada destino, as `.parcial` que sobraram de execuções anteriores. */
export async function apagarSobras(destinos: readonly string[]): Promise<void> {
  for (const destino of destinos) {
    const { base } = pastasNoDestino(destino, '');
    const nomes = await readdir(base).catch(() => [] as string[]);
    for (const nome of nomes.filter((item) => item.endsWith('.parcial'))) {
      await rm(join(base, nome), { recursive: true, force: true }).catch(() => {});
    }
  }
}

/** Apaga os backups prontos que a retenção não guarda; devolve o que não conseguiu apagar. */
async function aplicarRetencao(
  destino: string,
  retencao: Retencao,
  fuso: string,
  removidos: Set<string>,
): Promise<string[]> {
  const { base } = pastasNoDestino(destino, '');
  const momentos = new Map<Date, string>();
  for (const nome of await backupsProntosNoDestino(destino)) {
    momentos.set(momentoDoBackup(nome), nome);
  }
  const ficam = new Set(backupsQueFicam([...momentos.keys()], retencao, fuso));
  const naoApagados: string[] = [];
  for (const [momento, nome] of momentos) {
    if (ficam.has(momento)) continue;
    try {
      await rm(join(base, nome), { recursive: true });
      removidos.add(nome);
    } catch (erro) {
      naoApagados.push(`Não foi possível apagar ${nome}: ${motivo(erro)}`);
    }
  }
  return naoApagados;
}

function motivo(erro: unknown): string {
  if ((erro as NodeJS.ErrnoException).code === 'ENOSPC') return 'O disco ficou sem espaço.';
  return erro instanceof Error ? erro.message : String(erro);
}
