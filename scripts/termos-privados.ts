// A conferência dos termos privados (spec plataforma-base, "Árvore sem termos privados"; change
// limpar-arvore-para-publicar, design, decisão 9): nenhum arquivo versionado tem um termo da lista.
// A lista fica fora do repositório: no CI, no secret GRAFITE_TERMOS_PRIVADOS; na máquina de quem
// desenvolve, em .grafite/termos-privados/, que o Git ignora. A saída diz só o arquivo e o número do
// termo, nunca o termo nem a linha, porque o log do CI de um repositório público é de qualquer um.
// Uso: node scripts/termos-privados.ts [arquivo...] (sem arquivos, confere os do git ls-files)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A pasta local da lista, um arquivo por tipo de termo. */
export const PASTA_DA_LISTA = join('.grafite', 'termos-privados');
/** A lista ampla é só da verificação final da limpeza: ela acha também palavras comuns. */
const SO_DA_VERIFICACAO_FINAL = 'amplos.txt';

/** Sem caixa e sem acento: "Ação" e "ACAO" são o mesmo termo. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Um termo por linha, sem as linhas vazias e sem o CR de um arquivo salvo no Windows. */
export function lerTermos(texto: string): string[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);
}

export interface ArquivoConferido {
  caminho: string;
  conteudo: Buffer;
}

export interface Achado {
  arquivo: string;
  /** O número do termo na lista, a partir de 1. */
  termo: number;
}

/** O texto do arquivo para a busca; o binário é lido também byte a byte, para achar o termo em ASCII. */
function textosDoArquivo(conteudo: Buffer): string[] {
  const textos = [normalizar(conteudo.toString('utf8'))];
  if (conteudo.includes(0)) textos.push(normalizar(conteudo.toString('latin1')));
  return textos;
}

export function procurar(
  arquivos: readonly ArquivoConferido[],
  termos: readonly string[],
): Achado[] {
  const normalizados = termos.map(normalizar);
  const achados: Achado[] = [];
  for (const { caminho, conteudo } of arquivos) {
    const textos = textosDoArquivo(conteudo);
    normalizados.forEach((termo, indice) => {
      if (textos.some((texto) => texto.includes(termo))) {
        achados.push({ arquivo: caminho, termo: indice + 1 });
      }
    });
  }
  return achados;
}

export interface ResultadoDaConferencia {
  codigo: 0 | 1;
  mensagens: string[];
}

export function conferir({
  termos,
  arquivos,
  listaObrigatoria,
}: {
  termos: readonly string[];
  arquivos: readonly ArquivoConferido[];
  /** No push da branch principal, a falta da lista reprova. */
  listaObrigatoria: boolean;
}): ResultadoDaConferencia {
  if (termos.length === 0) {
    return listaObrigatoria
      ? {
          codigo: 1,
          mensagens: [
            'A lista dos termos privados faltou no push da branch principal: cadastre o secret GRAFITE_TERMOS_PRIVADOS no repositório.',
          ],
        }
      : {
          codigo: 0,
          mensagens: [
            'A lista dos termos privados não está aqui, e a conferência não conferiu nada. No CI, ela vem do secret GRAFITE_TERMOS_PRIVADOS; na máquina, de .grafite/termos-privados/.',
          ],
        };
  }
  const achados = procurar(arquivos, termos);
  if (achados.length === 0) {
    return {
      codigo: 0,
      mensagens: [
        arquivos.length === 1
          ? 'Nenhum termo privado no arquivo conferido.'
          : `Nenhum termo privado nos ${arquivos.length} arquivos conferidos.`,
      ],
    };
  }
  return {
    codigo: 1,
    mensagens: [
      ...achados.map(({ arquivo, termo }) => `${arquivo}: termo ${termo} da lista.`),
      'Troque cada termo pelo substituto da change limpar-arvore-para-publicar, sem escrever o termo em lugar nenhum do repositório.',
    ],
  };
}

/** A lista do secret ou, sem ele, a da pasta local, na ordem alfabética dos arquivos. */
function lerLista(): string[] {
  // O script roda direto no job e no gancho, fora do turbo: a variável não entra em cache nenhum.
  const { GRAFITE_TERMOS_PRIVADOS: doSecret } = process.env;
  if (doSecret?.trim()) return lerTermos(doSecret);
  if (!existsSync(PASTA_DA_LISTA)) return [];
  return readdirSync(PASTA_DA_LISTA)
    .filter((nome) => nome.endsWith('.txt') && nome !== SO_DA_VERIFICACAO_FINAL)
    .sort()
    .flatMap((nome) => lerTermos(readFileSync(join(PASTA_DA_LISTA, nome), 'utf8')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pedidos = process.argv.slice(2);
  const caminhos =
    pedidos.length > 0
      ? pedidos
      : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 << 20 })
          .split('\0')
          .filter(Boolean);
  const arquivos = caminhos
    .filter((caminho) => existsSync(caminho) && statSync(caminho).isFile())
    .map((caminho) => ({ caminho, conteudo: readFileSync(caminho) }));
  const { GITHUB_EVENT_NAME: evento, GITHUB_REF: ref } = process.env;
  const { codigo, mensagens } = conferir({
    termos: lerLista(),
    arquivos,
    listaObrigatoria: evento === 'push' && ref === 'refs/heads/main',
  });
  for (const mensagem of mensagens) (codigo === 0 ? console.log : console.error)(mensagem);
  process.exit(codigo);
}
