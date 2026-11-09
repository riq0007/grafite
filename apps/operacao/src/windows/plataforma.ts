// As peças do servidor Windows (design do F2d, decisões 7 e 16): cada versão é o zip desempacotado em
// `versoes\<x.y.z>`, e cada ambiente roda a versão para onde as junções `atual` e `anterior` dele
// apontam. As versões desempacotadas ficam no servidor. O PostgreSQL da produção é o do servidor,
// com a senha do postgres que só quem opera sabe, e os arquivos herdam as permissões da pasta.
import { randomUUID } from 'node:crypto';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExecutarProcesso, FerramentasDoPostgres } from '@grafite/operacao';
import { conferirServidorDaProducao } from '../banco.ts';
import { mensagemDe } from '../falhas.ts';
import { passarParaAVersao, trocarAtualEAnterior } from '../instalacao.ts';
import { BANCOS, ferramentasDaProducao, pastasDaInstalacao } from '../layout.ts';
import { logsNoWindows } from '../logs.ts';
import { conferirPacote, desempacotarVersao } from '../pacote.ts';
import type { MigracaoDoDiario, PlataformaDaInstalacao } from '../plataforma.ts';
import { configurarProxy } from '../proxy.ts';
import { scriptsDoWindows } from '../versao.ts';
import { restringirAcesso } from './acl.ts';
import { type AtalhoDoMenu, instalarAtalhoDoMenu } from './atalhos.ts';
import type { Juncoes } from './juncoes.ts';

export function plataformaDoWindows({
  executar,
  node,
  juncoes,
  ferramentas,
  atalhoDoMenu,
}: {
  executar: ExecutarProcesso;
  /** O node.exe que roda os scripts da versão. */
  node: string;
  juncoes: Juncoes;
  /** As ferramentas do PostgreSQL de uma pasta de binários. */
  ferramentas: (pgBin: string) => FerramentasDoPostgres;
  /** O atalho "Grafite" da área de trabalho de todos os usuários. */
  atalhoDoMenu: AtalhoDoMenu;
}): PlataformaDaInstalacao {
  return {
    nome: 'windows',
    async conferirPacote(zip) {
      const descricao = await conferirPacote(zip);
      return {
        versao: descricao.versao,
        async preparar(instalacao) {
          const { pasta, jaEstava } = await desempacotarVersao({
            zip,
            descricao,
            pastaDasVersoes: instalacao.pastas.versoes,
            juncoes,
          });
          return jaEstava
            ? `A versão ${descricao.versao} já estava desempacotada em ${pasta}.`
            : `Versão ${descricao.versao} desempacotada em ${pasta}.`;
        },
      };
    },
    scripts: (instalacao, versao) =>
      scriptsDoWindows({
        executar,
        node,
        pastaDaVersao: join(instalacao.pastas.versoes, versao),
      }),
    // A versão do ambiente é a da junção `atual` dele.
    scriptsDoAmbiente: (instalacao, ambiente) =>
      scriptsDoWindows({ executar, node, pastaDaVersao: instalacao.pastas[ambiente].atual }),
    async diario(instalacao, versao) {
      const diario = JSON.parse(
        await readFile(
          join(
            instalacao.pastas.versoes,
            versao,
            'packages',
            'db',
            'migrations',
            'meta',
            '_journal.json',
          ),
          'utf8',
        ),
      ) as { entries: MigracaoDoDiario[] };
      return diario.entries;
    },
    passarParaAVersao: (instalacao, ambiente, versao) =>
      passarParaAVersao(instalacao, ambiente, versao, juncoes),
    trocarAtualEAnterior: (instalacao, ambiente) =>
      trocarAtualEAnterior(instalacao, ambiente, juncoes),
    servicosDaProducao: [],
    limparVersoes: async () => [],
    async atalhoDoMenu(instalacao, versao) {
      const feito = await instalarAtalhoDoMenu({
        raiz: instalacao.pastas.raiz,
        pastaDaVersao: join(instalacao.pastas.versoes, versao),
        atalhoDoMenu,
      });
      return feito === 'criado'
        ? [
            'O atalho "Grafite" da área de trabalho abre o painel da operação; o menu abre pelo grafite.ps1 menu.',
          ]
        : [];
    },
    async superusuarioDaProducao({ estado }, console) {
      const senha = await console.perguntarSegredo(
        'Senha do usuário postgres do PostgreSQL da produção',
      );
      await conferirServidorDaProducao(ferramentas(estado.pgBin), senha);
      return { porta: BANCOS.producao.porta, senha };
    },
    acertarDono: async () => {},
    restringirAcesso: (arquivo) => restringirAcesso(executar, arquivo),
    nomeDoServico: (id) => id,
    regerarProjeto: async () => {},
    logs: (instalacao, id, pedido) => logsNoWindows(instalacao, id, pedido, executar),
    async prepararDestinoDoBackup(_instalacao, destino) {
      const pasta = await stat(destino).catch(() => null);
      if (pasta === null) {
        throw new Error(
          `O destino ${destino} não existe: crie a pasta, ou monte o compartilhamento, antes de configurá-lo.`,
        );
      }
      if (!pasta.isDirectory()) throw new Error(`O destino ${destino} não é uma pasta.`);
      const prova = join(destino, `.grafite-prova-${randomUUID()}`);
      try {
        await writeFile(prova, '');
        await rm(prova, { force: true });
      } catch (erro) {
        throw new Error(`O destino ${destino} não aceita gravação: ${mensagemDe(erro)}`);
      }
    },
    configurarProxy: (estado, servicos) =>
      configurarProxy({
        estado,
        executar,
        servicos,
        caddy: ferramentasDaProducao(pastasDaInstalacao(estado.raiz)).caddy,
      }),
  };
}
