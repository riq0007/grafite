// As versões no servidor Linux (spec operacao-em-linux, "Atualização e volta pelas imagens"; change
// servidor-linux-com-docker, design, decisão 8): cada versão é o conjunto das imagens do pacote dela
// no Docker, e cada ambiente roda a versão que o .env do Compose diz. Passar o ambiente a outra
// versão grava o .env e o operacao.json; o serviço do ambiente é recriado com a imagem nova quando
// inicia. Depois de uma atualização com saúde, as imagens das versões que nenhum ambiente usa, nem
// como atual nem como anterior, são apagadas. O superusuário de cada banco tem a senha gerada na
// instalação, no banco.env do ambiente, e o que o comando grava numa pasta de um app passa ao
// usuário dos contêineres.
import { rm, writeFile } from 'node:fs/promises';
import { posix } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { lerConfigEnv } from '../configuracao.ts';
import { type EstadoDaInstalacao, gravarEstado } from '../estado.ts';
import { pastasDaInstalacaoNoLinux, SERVICOS } from '../layout.ts';
import { logsNoLinux } from '../logs.ts';
import type { MigracaoDoDiario, PlataformaDaInstalacao } from '../plataforma.ts';
import { superusuarioNoLinux } from './banco.ts';
import { gerarCompose, gerarEnvDoCompose } from './compose.ts';
import { prepararDestinoNovo } from './destinos.ts';
import {
  carregarVersao,
  conferirPacoteDoLinux,
  IMAGENS_DO_PACOTE,
  imagemDaVersao,
} from './pacote.ts';
import { acertarDonoDosConteineres, PERMISSOES_DO_SISTEMA, type Permissoes } from './permissoes.ts';
import { configurarProxyNoLinux } from './proxy.ts';
import { servicoDoCompose } from './servicos.ts';
import { scriptsDoLinux } from './versao.ts';

const env = () => ({ env: process.env });

/** Grava no .env do Compose a versão de cada ambiente do estado, com o fuso que ele já tinha. */
async function gravarVersoesNoCompose(estado: EstadoDaInstalacao): Promise<void> {
  const { composeEnv } = pastasDaInstalacaoNoLinux(estado.raiz);
  const { TZ: fuso = 'Etc/UTC' } = await lerConfigEnv(composeEnv);
  const { producao, teste } = estado.ambientes;
  if (producao.atual === null || teste.atual === null) {
    throw new Error('Cada ambiente do Linux roda uma versão, e o estado não diz a de um deles.');
  }
  await writeFile(
    composeEnv,
    gerarEnvDoCompose({ versoes: { producao: producao.atual, teste: teste.atual }, fuso }),
  );
}

export function plataformaDoLinux({
  executar,
  permissoes = PERMISSOES_DO_SISTEMA,
}: {
  executar: ExecutarProcesso;
  permissoes?: Permissoes;
}): PlataformaDaInstalacao {
  return {
    nome: 'linux',
    async conferirPacote(pacote) {
      const descricao = await conferirPacoteDoLinux(pacote, { executar });
      const { versao } = descricao;
      return {
        versao,
        async preparar({ estado }) {
          const { jaEstava } = await carregarVersao({
            pacote,
            descricao,
            pastaDasVersoes: pastasDaInstalacaoNoLinux(estado.raiz).versoes,
            executar,
          });
          return jaEstava
            ? `As imagens da versão ${versao} já estavam no Docker.`
            : `Imagens da versão ${versao} carregadas no Docker.`;
        },
      };
    },
    scripts: (_instalacao, versao) => scriptsDoLinux({ executar, versao }),
    // A versão do ambiente é a que o estado e o .env do Compose dizem.
    scriptsDoAmbiente({ estado }, ambiente) {
      const versao = estado.ambientes[ambiente].atual;
      if (versao === null) throw new Error(`O ambiente ${ambiente} não tem versão instalada.`);
      return scriptsDoLinux({ executar, versao });
    },
    async diario(_instalacao, versao) {
      const { codigo, saida, erro } = await executar(
        'docker',
        [
          'run',
          '--rm',
          '--pull',
          'never',
          '--network',
          'none',
          imagemDaVersao('aplicacao', versao),
          'cat',
          'packages/db/migrations/meta/_journal.json',
        ],
        env(),
      );
      if (codigo !== 0) {
        throw new Error(
          `Não foi possível ler o diário das migrations da imagem da ${versao}: ${(erro || saida).trim()}`,
        );
      }
      return (JSON.parse(saida) as { entries: MigracaoDoDiario[] }).entries;
    },
    async passarParaAVersao({ estado }, ambiente, versao) {
      const dados = estado.ambientes[ambiente];
      if (dados.atual !== versao) {
        estado.ambientes[ambiente] = { ...dados, anterior: dados.atual, atual: versao };
      }
      await gravarVersoesNoCompose(estado);
      await gravarEstado(estado);
    },
    async trocarAtualEAnterior({ estado }, ambiente) {
      const dados = estado.ambientes[ambiente];
      if (dados.anterior === null) {
        throw new Error(`O ambiente ${ambiente} não tem versão anterior.`);
      }
      estado.ambientes[ambiente] = { ...dados, atual: dados.anterior, anterior: dados.atual };
      await gravarVersoesNoCompose(estado);
      await gravarEstado(estado);
    },
    // O proxy roda a imagem da versão da produção, que muda com ela.
    servicosDaProducao: [SERVICOS.proxy],
    // O menu e o atalho são do servidor Windows (change instalador-e-menu-da-operacao).
    atalhoDoMenu: async () => [],
    async limparVersoes({ estado }) {
      const emUso = new Set(
        Object.values(estado.ambientes).flatMap(({ atual, anterior }) =>
          [atual, anterior].filter((versao): versao is string => versao !== null),
        ),
      );
      const linhas: string[] = [];
      const ficam: string[] = [];
      for (const versao of estado.versoes) {
        if (emUso.has(versao)) {
          ficam.push(versao);
          continue;
        }
        const imagens = IMAGENS_DO_PACOTE.map((nome) => imagemDaVersao(nome, versao));
        const { codigo, saida, erro } = await executar(
          'docker',
          ['image', 'rm', ...imagens],
          env(),
        );
        if (codigo !== 0) {
          // A atualização já deu certo: a imagem que não sai só ganha o aviso, e a versão fica.
          ficam.push(versao);
          linhas.push(
            `As imagens da versão ${versao} não foram apagadas: ${(erro || saida).trim()}. Apague-as depois com docker image rm.`,
          );
          continue;
        }
        await rm(posix.join(pastasDaInstalacaoNoLinux(estado.raiz).versoes, versao), {
          recursive: true,
          force: true,
        });
        linhas.push(`As imagens da versão ${versao}, que nenhum ambiente usa, foram apagadas.`);
      }
      if (ficam.length !== estado.versoes.length) {
        estado.versoes = ficam;
        await gravarEstado(estado);
      }
      return linhas;
    },
    async superusuarioDaProducao({ estado }) {
      const { bancoEnv } = pastasDaInstalacaoNoLinux(estado.raiz).producao;
      const { POSTGRES_PASSWORD: senha } = await lerConfigEnv(bancoEnv);
      if (!senha) throw new Error(`Falta POSTGRES_PASSWORD em ${bancoEnv}.`);
      return superusuarioNoLinux('producao', senha);
    },
    acertarDono: (pasta) => acertarDonoDosConteineres(pasta, permissoes),
    restringirAcesso: (arquivo) => permissoes.modo(arquivo, 0o600),
    nomeDoServico: servicoDoCompose,
    logs: (instalacao, id, pedido) => logsNoLinux(instalacao, id, pedido, executar),
    async regerarProjeto(estado, destinosDoBackup) {
      const { compose } = pastasDaInstalacaoNoLinux(estado.raiz);
      await writeFile(
        compose,
        gerarCompose({
          raiz: estado.raiz,
          certificado: estado.certificado,
          destinosDoBackup: [...destinosDoBackup],
        }),
        { mode: 0o644 },
      );
      await permissoes.modo(compose, 0o644);
    },
    prepararDestinoDoBackup: ({ estado }, destino) =>
      prepararDestinoNovo({
        executar,
        imagemDoComando: imagemDaVersao('operacao', estado.ambientes.producao.atual ?? ''),
        destino,
        marca: `Destino do backup do Grafite, marcado pelo backup configurar em ${estado.raiz}. Não apague: sem a marca, o backup recusa a pasta.`,
      }),
    configurarProxy: (estado, servicos) =>
      configurarProxyNoLinux({ estado, executar, servicos, permissoes }),
  };
}
