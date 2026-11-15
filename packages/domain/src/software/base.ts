// O pacote na tela e os programas da máquina frente à base (spec distribuicao-de-software, "Tela da
// base"; spec inventario-pelo-agente, "Softwares na ficha do ativo"; change software-por-pacote,
// design, decisões 4 e 13): o tipo pela extensão do arquivo, o monograma do nome, a comparação de
// cada programa com o pacote dele e a ordem "Frente à base · ação primeiro".
import { normalizarTexto } from '../texto.ts';
import {
  casaComOPacote,
  compararVersoes,
  estadoDaVersao,
  ordemDasVersoes,
  situacaoFrenteAoPacote,
  temVersaoAlvo,
  versaoCortada,
} from './versoes.ts';

/**
 * As contas do pacote nas máquinas da conta (design, decisão 2): sem versão-alvo, nada fica na
 * versão nem desatualizado, e as duas contas são `null`.
 */
export interface ContasDoPacote {
  maquinas: number;
  instalado: number;
  naVersao: number | null;
  desatualizadas: number | null;
  sem: number;
}

/** Uma barra da ficha do pacote: a versão cortada no tamanho da versão-alvo e o estado escrito. */
export interface VersaoDaFicha {
  versao: string | null;
  estado: 'alvo' | 'abaixo' | 'acima' | null;
  quantas: number;
}

/**
 * As contas do pacote e as barras das versões, pelas versões dos programas que casam com ele em
 * cada máquina que tem o programa; a máquina vale pela versão mais alta. As barras vão da versão
 * mais nova para a mais velha, com a sem versão no fim.
 */
export function contasDoPacote(
  versoesPorMaquina: readonly (readonly (string | null)[])[],
  maquinas: number,
  versaoAlvo: string | null,
): { contas: ContasDoPacote; versoes: VersaoDaFicha[] } {
  const alvo = temVersaoAlvo(versaoAlvo) ? versaoAlvo : null;
  let instalado = 0;
  let naVersao = 0;
  let desatualizadas = 0;
  const grupos = new Map<string | null, number>();
  for (const versoes of versoesPorMaquina) {
    if (versoes.length === 0) continue;
    instalado++;
    const { situacao, versao } = situacaoFrenteAoPacote(versoes, alvo);
    if (situacao === 'na-versao') naVersao++;
    if (situacao === 'desatualizada') desatualizadas++;
    const cortada = versaoCortada(versao, alvo);
    grupos.set(cortada, (grupos.get(cortada) ?? 0) + 1);
  }
  const versoes = [...grupos]
    .map(([versao, quantas]) => ({
      versao,
      estado: alvo ? estadoDaVersao(versao, alvo) : null,
      quantas,
    }))
    .sort((a, b) => {
      if (a.versao === null) return 1;
      if (b.versao === null) return -1;
      return ordemDasVersoes(b.versao, a.versao);
    });
  return {
    contas: {
      maquinas,
      instalado,
      naVersao: alvo ? naVersao : null,
      desatualizadas: alvo ? desatualizadas : null,
      sem: maquinas - instalado,
    },
    versoes,
  };
}

const TIPOS: Record<string, string> = {
  msi: 'Instalador MSI',
  exe: 'Instalador EXE',
  msix: 'Pacote MSIX',
  ps1: 'Roteiro do PowerShell',
  bat: 'Roteiro em lote',
  cmd: 'Roteiro em lote',
  zip: 'Arquivo ZIP',
};

/** O tipo do pacote pela extensão do arquivo: o longo da ficha e o curto das listas ("MSI"). */
export function tipoDoPacote(nomeDoArquivo: string | null): { longo: string; curto: string } {
  if (!nomeDoArquivo) return { longo: 'Só o comando', curto: 'Só o comando' };
  const ponto = nomeDoArquivo.lastIndexOf('.');
  const extensao = ponto > 0 ? nomeDoArquivo.slice(ponto + 1).toLowerCase() : '';
  if (!extensao) return { longo: 'Arquivo', curto: 'Arquivo' };
  const curto = extensao.toUpperCase();
  return { longo: TIPOS[extensao] ?? curto, curto };
}

/** As palavras que não entram no monograma ("Agente de backup" é "AB"). */
const CONECTIVOS = new Set([
  'a',
  'o',
  'e',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'para',
  'com',
  'of',
  'the',
  'and',
  'for',
]);

/**
 * O monograma do pacote: as iniciais das duas primeiras palavras, ou as duas primeiras letras quando
 * o nome tem uma palavra só ("Google Chrome" é "GC", e "SumatraPDF", "Su").
 */
export function monograma(nome: string): string {
  const palavras = nome
    .split(/\s+/)
    .map((palavra) => palavra.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((palavra) => palavra !== '');
  const fortes = palavras.filter((palavra) => !CONECTIVOS.has(palavra.toLowerCase()));
  const usadas = fortes.length > 0 ? fortes : palavras;
  const [primeira = '', segunda] = usadas;
  if (segunda) return `${[...primeira][0]}${[...segunda][0]}`.toUpperCase();
  const letras = [...primeira];
  return `${(letras[0] ?? '').toUpperCase()}${letras[1] ?? ''}`;
}

export type ComparacaoComABase =
  | 'ha-na-base'
  | 'na-versao'
  | 'sem-versao-alvo'
  | 'fora-da-base'
  | 'do-windows';

export interface PacoteDaBase {
  nome: string;
  nomeNoInventario: string | null;
  versao: string | null;
}

/**
 * O programa da máquina frente à base: o do sistema não se distribui; o que casa com um pacote
 * ativo fica abaixo dele, na versão dele ou sem a comparação, no pacote sem versão-alvo; e o resto
 * não está na base. Com dois pacotes que casam, vale o de nome no inventário mais longo.
 */
export function frenteABase<P extends PacoteDaBase>(
  programa: { nome: string; versao: string | null; doSistema: boolean },
  pacotes: readonly P[],
): { comparacao: ComparacaoComABase; pacote: P | null } {
  if (programa.doSistema) return { comparacao: 'do-windows', pacote: null };
  let pacote: P | null = null;
  let tamanho = -1;
  for (const candidato of pacotes) {
    const nome = candidato.nomeNoInventario || candidato.nome;
    if (!casaComOPacote(programa.nome, nome)) continue;
    const doNome = normalizarTexto(nome).length;
    if (doNome > tamanho) {
      pacote = candidato;
      tamanho = doNome;
    }
  }
  if (!pacote) return { comparacao: 'fora-da-base', pacote: null };
  if (!temVersaoAlvo(pacote.versao)) return { comparacao: 'sem-versao-alvo', pacote };
  const abaixo = programa.versao === null || compararVersoes(programa.versao, pacote.versao) < 0;
  return { comparacao: abaixo ? 'ha-na-base' : 'na-versao', pacote };
}

/** O texto do rótulo da comparação, que o rótulo mostra em maiúsculas. */
export function textoFrenteABase(
  comparacao: ComparacaoComABase,
  versaoDaBase: string | null,
): string {
  switch (comparacao) {
    case 'ha-na-base':
      return `Há a ${versaoDaBase ?? ''} na base`;
    case 'na-versao':
      return 'Na versão da base';
    case 'sem-versao-alvo':
      return 'Na base, sem versão-alvo';
    case 'fora-da-base':
      return 'Não está na base';
    case 'do-windows':
      return 'Do Windows, não se distribui';
  }
}

const ORDEM_FRENTE_A_BASE: Record<ComparacaoComABase, number> = {
  'ha-na-base': 0,
  'na-versao': 1,
  'sem-versao-alvo': 2,
  'fora-da-base': 3,
  'do-windows': 4,
};

/** A ordem "Frente à base · ação primeiro": pela comparação, nessa sequência, e pelo nome. */
export function ordenarFrenteABase<L extends { nome: string; comparacao: ComparacaoComABase }>(
  linhas: readonly L[],
): L[] {
  return [...linhas].sort(
    (a, b) =>
      ORDEM_FRENTE_A_BASE[a.comparacao] - ORDEM_FRENTE_A_BASE[b.comparacao] ||
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true }),
  );
}
