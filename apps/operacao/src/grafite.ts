// O comando de operação no servidor (design do F2d, decisão 4), que o grafite.ps1 e o instalar.ps1
// chamam com o Node do servidor. Numa cópia do pacote desempacotada à mão, os links do workspace são
// recriados antes de tudo; só então o comando, que usa os pacotes do workspace, é carregado, com as
// peças de verdade: os processos, as junções, os serviços do Windows, o PostgreSQL da instalação, a
// saúde pela rede e as peças da preparação do servidor pelo atalho de instalação.
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerarChavesDoPush } from './ambientes.ts';
import { garantirLinksDoPacote } from './links.ts';

/** A pasta do pacote: a raiz da versão, três pastas acima deste arquivo. */
const pastaDoPacote = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
await garantirLinksDoPacote(pastaDoPacote);

const { executarProcesso, ferramentasLocais } = await import('@grafite/operacao');
const { backupDoServidor } = await import('./backup.ts');
const { executarComando } = await import('./comando.ts');
const { ferramentasDaProducao } = await import('./layout.ts');
const { saudePelaRede } = await import('./saude.ts');
const { consoleDoTerminal } = await import('./windows/console.ts');
const { juncoesDoSistema } = await import('./windows/juncoes.ts');
const { servicosDoWindows } = await import('./windows/servicos.ts');
const { plataformaDoWindows } = await import('./windows/plataforma.ts');
const { atalhosDoWindows } = await import('./windows/atalhos.ts');
const { baixadorDaRede } = await import('./windows/baixador.ts');
const { instaladorDaEdb } = await import('./windows/preparar.ts');
const { discosDoSistema, servicosDoSistema } = await import('./windows/sistema.ts');

const juncoes = juncoesDoSistema();
// O atalho "Grafite" vai para a área de trabalho de todos os usuários do servidor.
const atalhoDoMenu = {
  atalhos: atalhosDoWindows(executarProcesso),
  areaDeTrabalho: join(process.env.PUBLIC ?? 'C:\\Users\\Public', 'Desktop'),
};
process.exitCode = await executarComando(process.argv.slice(2), {
  escrever: (texto) => process.stdout.write(`${texto}\n`),
  escreverErro: (texto) => process.stderr.write(`${texto}\n`),
  console: (confirmar) => consoleDoTerminal({ confirmar }),
  executar: executarProcesso,
  juncoes,
  saude: saudePelaRede(),
  ferramentas: (pgBin) => ferramentasLocais(pgBin),
  servicos: (pastas) =>
    servicosDoWindows({
      executar: executarProcesso,
      pastaDosServicos: pastas.servicos,
      winsw: ferramentasDaProducao(pastas).winsw,
    }),
  backup: (instalacao) =>
    backupDoServidor({ instalacao, ferramentas: ferramentasLocais(instalacao.estado.pgBin) }),
  plataforma: plataformaDoWindows({
    executar: executarProcesso,
    node: process.execPath,
    juncoes,
    ferramentas: (pgBin) => ferramentasLocais(pgBin),
    atalhoDoMenu,
  }),
  windows: {
    sistema: servicosDoSistema(executarProcesso),
    discos: discosDoSistema(executarProcesso),
    instaladorDoPostgres: instaladorDaEdb(executarProcesso),
    baixador: baixadorDaRede,
    // Na pasta temporária de quem roda, como administrador; a execução seguinte a acha e apaga.
    pastaDaPreparacao: join(tmpdir(), 'grafite-preparacao'),
    atalhoDoMenu,
  },
  // Fora do pacote, como no desenvolvimento, a página do painel vem da pasta dada.
  ...(process.env.GRAFITE_PAINEL_PAGINA
    ? { painel: { pagina: process.env.GRAFITE_PAINEL_PAGINA } }
    : {}),
  pastaDoPacote,
  node: process.execPath,
  versaoDoNode: process.versions.node,
  agora: () => new Date(),
  gerarSenha: () => randomBytes(24).toString('hex'),
  gerarChave: () => randomBytes(32).toString('base64'),
  gerarChavesDoPush,
});
// As perguntas leem o terminal; sem isso, ele seguraria o processo depois do comando.
process.stdin.destroy();
