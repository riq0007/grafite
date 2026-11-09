// O acesso aos arquivos com segredos (design do F2d, decisão 2): cada config.env e o caddy.env ficam
// só para os administradores e para o sistema, que é a conta dos serviços. Os grupos vão pelo SID,
// que não muda com o idioma do Windows ("Administradores" no Windows em português).
import type { ExecutarProcesso } from '@grafite/operacao';

const ADMINISTRADORES = '*S-1-5-32-544';
const SISTEMA = '*S-1-5-18';

/** Uma pasta só para os administradores e o sistema, com o que for criado dentro dela. */
export async function restringirPasta(executar: ExecutarProcesso, pasta: string): Promise<void> {
  const { codigo } = await executar(
    'icacls.exe',
    [pasta, '/inheritance:r', '/grant:r', `${ADMINISTRADORES}:(OI)(CI)F`, `${SISTEMA}:(OI)(CI)F`],
    { env: process.env },
  );
  if (codigo !== 0) throw new Error(`Não foi possível restringir o acesso a ${pasta}.`);
}

export async function restringirAcesso(executar: ExecutarProcesso, caminho: string): Promise<void> {
  const { codigo } = await executar(
    'icacls.exe',
    [caminho, '/inheritance:r', '/grant:r', `${ADMINISTRADORES}:F`, `${SISTEMA}:F`],
    { env: process.env },
  );
  if (codigo !== 0) throw new Error(`Não foi possível restringir o acesso a ${caminho}.`);
}
