// O firewall do Windows (design do F2d, decisão 2): só as portas do proxy, 80 e 443, ficam abertas
// para a rede; os apps atendem em 127.0.0.1. Cada regra tem nome fixo e é refeita a cada vez, então
// rodar de novo não acumula regras.
import type { ExecutarProcesso } from '@grafite/operacao';

const REGRAS = [
  { nome: 'Grafite HTTP', porta: 80 },
  { nome: 'Grafite HTTPS', porta: 443 },
];

export async function abrirPortasDoProxy(executar: ExecutarProcesso): Promise<void> {
  const netsh = (...argumentos: string[]) =>
    executar('netsh.exe', ['advfirewall', 'firewall', ...argumentos], { env: process.env });
  for (const { nome, porta } of REGRAS) {
    // Apagar a regra que não existe falha, e tudo bem.
    await netsh('delete', 'rule', `name=${nome}`);
    const { codigo, saida, erro } = await netsh(
      'add',
      'rule',
      `name=${nome}`,
      'dir=in',
      'action=allow',
      'protocol=TCP',
      `localport=${porta}`,
    );
    if (codigo !== 0) {
      throw new Error(
        `Não foi possível abrir a porta ${porta} no firewall: ${(saida || erro).trim()}`,
      );
    }
  }
}
