// Os Caddyfiles de exemplo dos dois modos do certificado (design do F2d, decisões 9 e 17), gerados
// pelo mesmo código da instalação, para o CI conferir com o caddy validate do binário que vai no
// pacote: o módulo do DNS da Cloudflare e cada diretiva precisam existir nele.
// Uso: node apps/operacao/scripts/caddyfiles.ts <pasta>
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EstadoDaInstalacao } from '../src/estado.ts';
import { gerarCaddyfile } from '../src/proxy.ts';

const exemplo = (
  raiz: string,
  certificado: EstadoDaInstalacao['certificado'],
): EstadoDaInstalacao => ({
  raiz,
  plataforma: 'windows',
  ambientes: {
    producao: {
      enderecos: ['grafite.empresa.com.br'],
      porta: 3000,
      atual: '0.1.0',
      anterior: null,
    },
    teste: {
      enderecos: ['grafite-teste.empresa.com.br'],
      porta: 3001,
      atual: '0.1.0',
      anterior: null,
    },
  },
  mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' },
  certificado,
  versoes: ['0.1.0'],
  pgBin: 'C:\\Program Files\\PostgreSQL\\18\\bin',
});

/** Grava os Caddyfiles na pasta; devolve os arquivos. */
export async function gravarCaddyfilesDeExemplo(pasta: string): Promise<string[]> {
  await mkdir(pasta, { recursive: true });
  const raiz = join(pasta, 'Grafite');
  const modos: [string, EstadoDaInstalacao['certificado']][] = [
    ['interno', { modo: 'interno', ac: 'caddy' }],
    ['publico', { modo: 'publico', email: 'ti@empresa.com.br', provedorDns: 'cloudflare' }],
  ];
  const arquivos: string[] = [];
  for (const [nome, certificado] of modos) {
    const arquivo = join(pasta, `${nome}.Caddyfile`);
    await writeFile(arquivo, gerarCaddyfile(exemplo(raiz, certificado)));
    arquivos.push(arquivo);
  }
  return arquivos;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pasta] = process.argv.slice(2);
  if (pasta === undefined) {
    console.error('Uso: node apps/operacao/scripts/caddyfiles.ts <pasta>');
    process.exit(2);
  }
  for (const arquivo of await gravarCaddyfilesDeExemplo(resolve(pasta))) console.log(arquivo);
}
