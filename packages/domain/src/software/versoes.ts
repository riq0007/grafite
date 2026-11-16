// As versões e o casamento do inventário com o pacote (spec distribuicao-de-software, "Pacote frente
// ao inventário"; change software-por-pacote, design, decisões 1 e 2). A versão é quebrada em
// pedaços, sem o "v" do começo, nos separadores e na troca entre algarismo e letra; o número compara
// pelo valor, a letra sem a maiúscula, e o número vem depois da letra ("2.4.1" depois de
// "2.4.1-beta"). Frente ao pacote, a comparação vai só até os pedaços da versão-alvo, e o pedaço que
// falta na instalada vale 0.
import { normalizarTexto } from '../texto.ts';

type Pedaco = { numero: boolean; valor: string };

/** As sequências de algarismos e as de letras; o resto separa. */
const PEDACO = /\d+|\p{L}+/gu;

const ZERO: Pedaco = { numero: true, valor: '0' };

const semOV = (versao: string) => versao.trim().replace(/^v(?=\d)/i, '');

/** Os pedaços da versão, com o número sem os zeros à esquerda e a letra em minúsculas. */
function pedacos(versao: string): Pedaco[] {
  return (semOV(versao).match(PEDACO) ?? []).map((valor) =>
    /^\d/.test(valor)
      ? { numero: true, valor: valor.replace(/^0+(?=\d)/, '') }
      : { numero: false, valor: valor.toLowerCase() },
  );
}

const ordem = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** O número pelo valor, pelo tamanho e depois pelos algarismos, sem passar pelo inteiro do JS. */
function compararPedaco(a: Pedaco, b: Pedaco): number {
  if (a.numero && b.numero) return a.valor.length - b.valor.length || ordem(a.valor, b.valor);
  if (a.numero !== b.numero) return a.numero ? 1 : -1;
  return ordem(a.valor, b.valor);
}

function compararAte(a: readonly Pedaco[], b: readonly Pedaco[], quantos: number): number {
  for (let posicao = 0; posicao < quantos; posicao++) {
    const resultado = compararPedaco(a[posicao] ?? ZERO, b[posicao] ?? ZERO);
    if (resultado !== 0) return resultado;
  }
  return 0;
}

/**
 * A versão instalada frente à versão-alvo: negativa abaixo, zero nela e positiva acima. Vai só até
 * os pedaços da versão-alvo: "131.0.6778.86" está na "131".
 */
export function compararVersoes(instalada: string, alvo: string): number {
  const doAlvo = pedacos(alvo);
  return compararAte(pedacos(instalada), doAlvo, doAlvo.length);
}

/** A ordem de duas versões pela versão inteira, para ordenar as barras ("16.0" antes de "16.0.1"). */
export function ordemDasVersoes(a: string, b: string): number {
  const deA = pedacos(a);
  const deB = pedacos(b);
  return compararAte(deA, deB, Math.max(deA.length, deB.length));
}

/** Se a versão do pacote compara: o pacote sem versão, ou com uma sem nenhum pedaço, não. */
export function temVersaoAlvo(versao: string | null | undefined): versao is string {
  return !!versao && pedacos(versao).length > 0;
}

/**
 * Se o programa do inventário é do pacote: o nome dele, normalizado, é igual ao nome no inventário,
 * ou começa por ele seguido de um espaço e de um algarismo ou de "(" ("7-Zip 23.01 (x64)" é do
 * 7-Zip, e "Google Chrome Beta" não é do Google Chrome).
 */
export function casaComOPacote(programa: string, nomeNoInventario: string): boolean {
  const nome = normalizarTexto(programa);
  const doPacote = normalizarTexto(nomeNoInventario);
  if (doPacote === '') return false;
  if (nome === doPacote) return true;
  return nome.startsWith(`${doPacote} `) && /^[0-9(]/.test(nome.slice(doPacote.length + 1));
}

/** A versão mais alta do programa na máquina, pela versão inteira; a sem versão vale menos. */
export function versaoMaisAlta(versoes: readonly (string | null)[]): string | null {
  let maior: { versao: string; pedacos: Pedaco[] } | null = null;
  for (const versao of versoes) {
    if (versao === null) continue;
    const dela = pedacos(versao);
    if (dela.length === 0) continue;
    if (
      maior &&
      compararAte(dela, maior.pedacos, Math.max(dela.length, maior.pedacos.length)) <= 0
    ) {
      continue;
    }
    maior = { versao, pedacos: dela };
  }
  return maior?.versao ?? null;
}

export type SituacaoFrenteAoPacote =
  | 'na-versao'
  | 'desatualizada'
  | 'sem-o-programa'
  | 'instalado-sem-alvo';

/**
 * A máquina frente ao pacote, pelas versões dos programas dela que casam com ele: na versão-alvo,
 * com ela ou uma mais nova; desatualizada, abaixo dela ou sem a versão no inventário; sem o
 * programa; ou, no pacote sem versão-alvo, só instalada.
 */
export function situacaoFrenteAoPacote(
  instaladas: readonly (string | null)[],
  versaoAlvo: string | null,
): { situacao: SituacaoFrenteAoPacote; versao: string | null } {
  if (instaladas.length === 0) return { situacao: 'sem-o-programa', versao: null };
  const versao = versaoMaisAlta(instaladas);
  if (!temVersaoAlvo(versaoAlvo)) return { situacao: 'instalado-sem-alvo', versao };
  if (versao === null) return { situacao: 'desatualizada', versao };
  const situacao = compararVersoes(versao, versaoAlvo) >= 0 ? 'na-versao' : 'desatualizada';
  return { situacao, versao };
}

/**
 * A versão cortada no tamanho da versão-alvo, sem o "v" do começo, que agrupa as barras da ficha do
 * pacote ("130.0.6723.117" é "130" frente à "131"); sem versão-alvo, a versão inteira.
 */
export function versaoCortada(versao: string | null, alvo: string | null): string | null {
  if (versao === null) return null;
  const texto = semOV(versao);
  const achados = [...texto.matchAll(PEDACO)];
  const quantos = Math.min((alvo ? pedacos(alvo).length : 0) || achados.length, achados.length);
  const ultimo = achados[quantos - 1];
  if (!ultimo) return null;
  return texto.slice(0, (ultimo.index ?? 0) + ultimo[0].length);
}

/** A versão frente à versão-alvo, para o estado escrito das barras; a sem versão fica abaixo. */
export function estadoDaVersao(versao: string | null, alvo: string): 'abaixo' | 'alvo' | 'acima' {
  if (versao === null) return 'abaixo';
  const resultado = compararVersoes(versao, alvo);
  return resultado < 0 ? 'abaixo' : resultado === 0 ? 'alvo' : 'acima';
}
