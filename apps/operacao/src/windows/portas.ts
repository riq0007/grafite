// As portas do proxy (design do F2d, decisão 2): antes de criar qualquer coisa, a instalação confere
// que nenhum outro programa escuta na 80 e na 443, como o IIS pelo http.sys. Quem responde é o
// próprio Windows (Get-NetTCPConnection): escutar na porta para ver se ela está livre faria o firewall
// pedir permissão para o node.exe.
import type { ExecutarProcesso } from '@grafite/operacao';

export const juntar = (portas: readonly number[]) => portas.join(', ').replace(/, (\d+)$/, ' e $1');

/** O proxy precisa da 80 e da 443: outro programa nelas, como o IIS, para a instalação. */
export function conferirPortasDoProxy(ocupadas: readonly number[]): void {
  const [porta] = ocupadas;
  if (porta === undefined) return;
  if (ocupadas.length === 1) {
    throw new Error(
      `A porta ${porta} está ocupada por outro programa, como o IIS, e o proxy do Grafite precisa das portas 80 e 443: libere-a e rode a instalação de novo.`,
    );
  }
  throw new Error(
    'As portas 80 e 443 estão ocupadas por outro programa, como o IIS, e o proxy do Grafite precisa delas: libere-as e rode a instalação de novo.',
  );
}

/** As portas, dentre as dadas, em que algum programa já escuta. */
export async function portasOcupadas(
  executar: ExecutarProcesso,
  portas: readonly number[],
): Promise<number[]> {
  const consulta = [
    "$ProgressPreference = 'SilentlyContinue';",
    'Get-NetTCPConnection -State Listen -ErrorAction Stop',
    `| Where-Object { $_.LocalPort -in ${portas.join(',')} }`,
    '| ForEach-Object { $_.LocalPort }',
  ].join(' ');
  const { codigo, saida, erro } = await executar(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', consulta],
    { env: process.env },
  );
  if (codigo !== 0) {
    throw new Error(
      `Não foi possível conferir as portas ${juntar(portas)}: ${(erro || saida).trim()}`,
    );
  }
  const escutando = new Set(saida.split(/\r?\n/).map((linha) => Number(linha.trim())));
  return portas.filter((porta) => escutando.has(porta));
}
