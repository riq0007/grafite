// O projeto do Compose de exemplo do servidor Linux (change servidor-linux-com-docker, design,
// decisão 3), gerado pelo mesmo código da instalação, para conferir com o `docker compose config`
// da imagem do comando: a pasta recebe o compose.yaml, o .env e os arquivos de configuração vazios
// que ele cita, na estrutura de /opt/grafite, para ser montada nesse caminho.
// Uso: node apps/operacao/scripts/compose-de-exemplo.ts <pasta>
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pastasDaInstalacaoNoLinux, RAIZ_PADRAO_NO_LINUX } from '../src/layout.ts';
import { gerarCompose, gerarEnvDoCompose } from '../src/linux/compose.ts';

/** Grava o exemplo na pasta, como se ela fosse /opt/grafite; devolve os arquivos. */
export async function gravarComposeDeExemplo(pasta: string): Promise<string[]> {
  const raiz = RAIZ_PADRAO_NO_LINUX;
  const pastas = pastasDaInstalacaoNoLinux(raiz);
  const naPasta = (caminho: string) => join(pasta, relative(raiz, caminho));
  const arquivos: [string, string][] = [
    [
      pastas.compose,
      gerarCompose({
        raiz,
        certificado: { modo: 'interno', ac: 'caddy' },
        destinosDoBackup: [pastas.backups, '/mnt/nas/Backups Grafite'],
      }),
    ],
    [
      pastas.composeEnv,
      gerarEnvDoCompose({
        versoes: { producao: '0.1.0', teste: '0.1.0' },
        fuso: 'America/Sao_Paulo',
      }),
    ],
    [pastas.caddyEnv, ''],
    [pastas.coletorEnv, ''],
    [pastas.producao.configEnv, ''],
    [pastas.producao.bancoEnv, ''],
    [pastas.teste.configEnv, ''],
    [pastas.teste.bancoEnv, ''],
  ];
  const gravados: string[] = [];
  for (const [caminho, conteudo] of arquivos) {
    const destino = naPasta(caminho);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, conteudo);
    gravados.push(destino);
  }
  return gravados;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pasta] = process.argv.slice(2);
  if (pasta === undefined) {
    console.error('Uso: node apps/operacao/scripts/compose-de-exemplo.ts <pasta>');
    process.exit(2);
  }
  for (const arquivo of await gravarComposeDeExemplo(resolve(pasta))) console.log(arquivo);
}
