// O projeto do Compose do servidor Linux (change servidor-linux-com-docker, design, decisões 3, 4, 5,
// 10 e 11), gerado pelo comando de operação em compose.yaml, na raiz da instalação:
// - um serviço por processo: o proxy, o banco e o app de cada ambiente e o coletor da produção, com
//   a imagem da versão do ambiente dele, que o .env do Compose diz;
// - o reinício sozinho e os logs em rotação por tamanho;
// - só o proxy publica portas, a 80 e a 443, com o IP fixo na rede interna, que o lançador cria;
// - as pastas da instalação montadas no mesmo caminho, como o comando de operação as vê.
// O arquivo é JSON, que é YAML válido, com o comentário de que ele é gerado na primeira linha.
import { posix } from 'node:path';
import type { CertificadoDaInstalacao } from '../estado.ts';
import { pastasDaInstalacaoNoLinux, REDE_NO_LINUX, SERVICOS_NO_LINUX } from '../layout.ts';

export interface DadosDoCompose {
  raiz: string;
  certificado: CertificadoDaInstalacao;
  /** As pastas do servidor onde o backup grava, montadas só na produção. */
  destinosDoBackup: string[];
}

const CABECALHO = '# Gerado por "grafite". Não edite: rode o comando de novo.';

/** Uma variável do .env do Compose, como o Compose a interpola na hora de subir os contêineres. */
export const variavelDoCompose = (nome: string) => ['$', '{', nome, '}'].join('');

const LOGS = { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '5' } };

/** A pasta do servidor no mesmo caminho dentro do contêiner. */
const noMesmoCaminho = (pasta: string, somenteLeitura = false) =>
  `${pasta}:${pasta}${somenteLeitura ? ':ro' : ''}`;

/**
 * Um serviço com o que todos têm: a imagem, o reinício, os logs, o fuso e a rede interna. A imagem
 * só vem do pacote: a que faltar não é buscada no Docker Hub, onde o nome pode ser de outra pessoa.
 */
function servico(imagem: string, ambiente: 'PRODUCAO' | 'TESTE', resto: Record<string, unknown>) {
  return {
    image: `grafite/${imagem}:${variavelDoCompose(`GRAFITE_VERSAO_${ambiente}`)}`,
    pull_policy: 'never',
    restart: 'unless-stopped',
    logging: LOGS,
    environment: { TZ: variavelDoCompose('TZ') },
    networks: { [REDE_NO_LINUX.nome]: null },
    ...resto,
  };
}

/** O banco de um ambiente: o PostgreSQL 18 do pacote, com a pasta de dados dele. */
function banco(pastas: { banco: string; bancoEnv: string }, ambiente: 'PRODUCAO' | 'TESTE') {
  return servico('banco', ambiente, {
    env_file: [pastas.bancoEnv],
    volumes: [`${pastas.banco}:/var/lib/postgresql`],
    healthcheck: {
      test: ['CMD-SHELL', 'pg_isready -U postgres -d postgres'],
      interval: '5s',
      timeout: '3s',
      retries: 30,
    },
  });
}

export function gerarCompose({ raiz, certificado, destinosDoBackup }: DadosDoCompose): string {
  const pastas = pastasDaInstalacaoNoLinux(raiz);
  // No modo interno com a AC do Caddy, os apps confiam na raiz dela, pela cópia pública: as chaves
  // da AC ficam só com o proxy.
  const daAcDoCaddy =
    certificado.modo === 'interno' && certificado.ac === 'caddy'
      ? [noMesmoCaminho(pastas.acDoCaddy, true)]
      : [];
  // Com a AC da empresa, o proxy lê o certificado e a chave de onde a instalação os pôs.
  const daAcDaEmpresa =
    certificado.modo === 'interno' && certificado.ac === 'empresa'
      ? [noMesmoCaminho(certificado.certificado, true), noMesmoCaminho(certificado.chave, true)]
      : [];
  const projeto = {
    name: 'grafite',
    services: {
      [SERVICOS_NO_LINUX.proxy]: servico('proxy', 'PRODUCAO', {
        command: [
          'caddy',
          'run',
          '--config',
          posix.join(pastas.caddy, 'Caddyfile'),
          '--adapter',
          'caddyfile',
        ],
        env_file: [pastas.caddyEnv],
        ports: ['80:80', '443:443'],
        volumes: [noMesmoCaminho(pastas.caddy), ...daAcDaEmpresa],
        networks: { [REDE_NO_LINUX.nome]: { ipv4_address: REDE_NO_LINUX.proxy } },
      }),
      [SERVICOS_NO_LINUX.bancoDaProducao]: banco(pastas.producao, 'PRODUCAO'),
      [SERVICOS_NO_LINUX.producao]: servico('aplicacao', 'PRODUCAO', {
        env_file: [pastas.producao.configEnv],
        volumes: [
          noMesmoCaminho(pastas.producao.arquivos),
          ...destinosDoBackup.map((destino) => noMesmoCaminho(destino)),
          // Só para ler: o espaço livre do disco do banco do teste, antes do teste de restauração.
          noMesmoCaminho(pastas.teste.banco, true),
          ...daAcDoCaddy,
        ],
        depends_on: { [SERVICOS_NO_LINUX.bancoDaProducao]: { condition: 'service_healthy' } },
      }),
      [SERVICOS_NO_LINUX.coletor]: servico('coletor', 'PRODUCAO', {
        env_file: [pastas.coletorEnv],
        volumes: [noMesmoCaminho(pastas.filaDoColetor)],
        depends_on: { [SERVICOS_NO_LINUX.producao]: { condition: 'service_started' } },
      }),
      [SERVICOS_NO_LINUX.bancoDoTeste]: banco(pastas.teste, 'TESTE'),
      [SERVICOS_NO_LINUX.teste]: servico('aplicacao', 'TESTE', {
        env_file: [pastas.teste.configEnv],
        volumes: [noMesmoCaminho(pastas.teste.arquivos), ...daAcDoCaddy],
        depends_on: { [SERVICOS_NO_LINUX.bancoDoTeste]: { condition: 'service_healthy' } },
      }),
    },
    networks: { [REDE_NO_LINUX.nome]: { external: true, name: REDE_NO_LINUX.nome } },
  };
  return `${CABECALHO}\n${JSON.stringify(projeto, null, 2)}\n`;
}

/** O .env do Compose: a versão de cada ambiente e o fuso do servidor. */
export function gerarEnvDoCompose({
  versoes,
  fuso,
}: {
  versoes: { producao: string; teste: string };
  fuso: string;
}): string {
  return [
    CABECALHO,
    `GRAFITE_VERSAO_PRODUCAO=${versoes.producao}`,
    `GRAFITE_VERSAO_TESTE=${versoes.teste}`,
    `TZ=${fuso}`,
    '',
  ].join('\n');
}
