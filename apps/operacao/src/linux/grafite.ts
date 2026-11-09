// O comando de operação no servidor Linux (change servidor-linux-com-docker, design, decisão 2), que
// o lançador /usr/local/bin/grafite roda na imagem do comando da versão da produção, como o root,
// com o socket do Docker, a pasta da instalação no mesmo caminho e a rede interna. As peças são as
// do Linux: os contêineres do Compose, as ferramentas do PostgreSQL 18 da imagem, a saúde pela rede
// interna e as imagens de cada versão. A pasta e o fuso vêm do lançador.
import { randomBytes } from 'node:crypto';
import { executarProcesso, ferramentasLocais } from '@grafite/operacao';
import { gerarChavesDoPush } from '../ambientes.ts';
import { backupDoServidor } from '../backup.ts';
import { executarComando } from '../comando.ts';
import { PG_BIN_NO_LINUX, RAIZ_PADRAO_NO_LINUX } from '../layout.ts';
import { saudeNoLinux } from '../saude.ts';
import { consoleDoTerminal } from '../windows/console.ts';
import { plataformaDoLinux } from './plataforma.ts';
import { servicosDoDocker } from './servicos.ts';

const raiz = process.env.GRAFITE_RAIZ || RAIZ_PADRAO_NO_LINUX;
const fuso = process.env.GRAFITE_FUSO || 'Etc/UTC';
const ferramentas = ferramentasLocais(PG_BIN_NO_LINUX);
const plataforma = plataformaDoLinux({ executar: executarProcesso });

process.exitCode = await executarComando(process.argv.slice(2), {
  escrever: (texto) => process.stdout.write(`${texto}\n`),
  escreverErro: (texto) => process.stderr.write(`${texto}\n`),
  console: (confirmar) => consoleDoTerminal({ confirmar }),
  executar: executarProcesso,
  // O Linux não tem junções: cada versão são as imagens dela.
  juncoes: {
    apontar: async () => {
      throw new Error('O servidor Linux não usa junções.');
    },
    ler: async () => null,
  },
  saude: saudeNoLinux(),
  ferramentas: () => ferramentas,
  servicos: () => servicosDoDocker({ executar: executarProcesso, raiz }),
  backup: (instalacao) =>
    backupDoServidor({ instalacao, ferramentas, acertarDono: plataforma.acertarDono }),
  plataforma,
  linux: { raiz, fuso },
  pastaDoPacote: '/app',
  node: process.execPath,
  versaoDoNode: process.versions.node,
  agora: () => new Date(),
  gerarSenha: () => randomBytes(24).toString('hex'),
  gerarChave: () => randomBytes(32).toString('base64'),
  gerarChavesDoPush,
});
// As perguntas leem o terminal; sem isso, ele seguraria o processo depois do comando.
process.stdin.destroy();
