// O layout da instalação no servidor (design do F2d, decisões 2 e 3): as pastas na raiz, os
// serviços do Windows, as portas e o banco de cada ambiente. As pastas do Windows usam o separador do
// sistema: no servidor, o do Windows; nos testes, o de onde eles rodam. O Linux (change
// servidor-linux-com-docker, design, decisões 1, 3 e 4) tem o próprio layout, em /opt/grafite, com o
// separador do Linux em qualquer sistema, porque os caminhos vão para o Compose.
import { join, posix } from 'node:path';
import type { AmbienteInstalado } from './estado.ts';

/** O sistema do servidor em que o Grafite está instalado. */
export const PLATAFORMAS = ['windows', 'linux'] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

/** Como as mensagens dizem o comando de operação, o pacote da versão e o runbook em cada plataforma. */
export const NO_SERVIDOR = {
  windows: { comando: 'grafite', pacote: '<zip>', runbook: 'docs\\operacao\\runbook.md' },
  linux: { comando: 'sudo grafite', pacote: '<tar>', runbook: 'docs/operacao/runbook.md' },
} as const satisfies Record<Plataforma, { comando: string; pacote: string; runbook: string }>;

export const RAIZ_PADRAO = 'C:\\Grafite';
export const PG_BIN_PADRAO = 'C:\\Program Files\\PostgreSQL\\18\\bin';

/** Os serviços do Windows, pelo nome do serviço. */
export const SERVICOS = {
  producao: 'grafite',
  teste: 'grafite-teste',
  coletor: 'grafite-coletor',
  proxy: 'grafite-proxy',
  postgresDoTeste: 'grafite-postgresql-teste',
} as const;

/** O serviço do PostgreSQL da produção, como o instalador oficial o registra. */
export const SERVICO_DO_POSTGRES_DA_PRODUCAO = 'postgresql-x64-18';

/** As portas dos apps e do coletor, que atendem só em 127.0.0.1. */
export const PORTAS = { producao: 3000, teste: 3001, coletor: 3100 } as const;

/** As portas do proxy, as únicas abertas para a rede. */
export const PORTAS_DO_PROXY = [80, 443] as const;

/** A instância do PostgreSQL de cada ambiente, em 127.0.0.1, e o banco do Grafite nela. */
export const BANCOS = {
  producao: { porta: 5432, nome: 'grafite' },
  teste: { porta: 5433, nome: 'grafite_teste' },
} as const satisfies Record<AmbienteInstalado, { porta: number; nome: string }>;

export function pastasDoAmbiente(raiz: string, ambiente: AmbienteInstalado) {
  const pasta = join(raiz, ambiente);
  return {
    pasta,
    configEnv: join(pasta, 'config.env'),
    /** A junção para a versão em uso. */
    atual: join(pasta, 'atual'),
    /** A junção para a versão de antes da última atualização. */
    anterior: join(pasta, 'anterior'),
    arquivos: join(pasta, 'arquivos'),
    logs: join(pasta, 'logs'),
  };
}

export function pastasDaInstalacao(raiz: string) {
  return {
    raiz,
    /** O estado da instalação, sem segredos. */
    estado: join(raiz, 'operacao.json'),
    /** As respostas de uma instalação que ainda não terminou, sem segredos. */
    instalacao: join(raiz, 'instalacao.json'),
    versoes: join(raiz, 'versoes'),
    /** O XML e o WinSW de cada serviço. */
    servicos: join(raiz, 'servicos'),
    backups: join(raiz, 'backups'),
    caddy: join(raiz, 'caddy'),
    /** O token do DNS e as pastas do Caddy, lidos pelo serviço do proxy. */
    caddyEnv: join(raiz, 'caddy', 'config.env'),
    /** O certificado raiz da AC do próprio Caddy, no modo interno. */
    raizDaAcDoCaddy: join(raiz, 'caddy', 'dados', 'pki', 'authorities', 'local', 'root.crt'),
    coletorEnv: join(raiz, 'producao', 'coletor.env'),
    /** A fila em disco do coletor, com os lotes que a API ainda não aceitou. */
    filaDoColetor: join(raiz, 'producao', 'coletor'),
    /** A pasta de dados da instância do PostgreSQL do teste. */
    bancoDoTeste: join(raiz, 'teste', 'banco'),
    /** O lançador do comando de operação, que roda o da versão da produção. */
    lancador: join(raiz, 'grafite.ps1'),
    producao: pastasDoAmbiente(raiz, 'producao'),
    teste: pastasDoAmbiente(raiz, 'teste'),
  };
}

export type PastasDaInstalacao = ReturnType<typeof pastasDaInstalacao>;

/** A raiz da instalação no Linux, que os contêineres montam no mesmo caminho. */
export const RAIZ_PADRAO_NO_LINUX = '/opt/grafite';

/** As ferramentas do PostgreSQL 18 das imagens da aplicação e do comando de operação. */
export const PG_BIN_NO_LINUX = '/usr/lib/postgresql/18/bin';

/** O usuário dos contêineres da aplicação e do coletor, o `node` das imagens. */
export const USUARIO_DOS_CONTEINERES = { uid: 1000, gid: 1000 } as const;

/** O lançador do comando de operação no Linux, no caminho do root, fora da raiz. */
export const LANCADOR_NO_LINUX = '/usr/local/bin/grafite';

/** Os serviços do projeto do Compose, pelo nome, que é também o nome deles na rede interna. */
export const SERVICOS_NO_LINUX = {
  producao: 'app-producao',
  teste: 'app-teste',
  coletor: 'coletor',
  proxy: 'proxy',
  bancoDaProducao: 'banco-producao',
  bancoDoTeste: 'banco-teste',
} as const;

/**
 * A rede interna do Docker, com a faixa fixa e o IP fixo do proxy, o único em quem os apps confiam
 * para o endereço do cliente (spec https-interno).
 */
export const REDE_NO_LINUX = {
  nome: 'grafite',
  faixa: '172.30.0.0/24',
  proxy: '172.30.0.2',
} as const;

/** Um serviço da instalação, como o servicos estado e o painel o mostram. */
export interface ServicoDaInstalacao {
  /** O nome do serviço no Windows, pelo qual a peça dos serviços o chama nas duas plataformas. */
  id: string;
  /** O serviço do projeto do Compose no Linux. */
  noCompose: string;
  nome: string;
  /** O ambiente que ele serve; o proxy serve aos dois. */
  ambiente: AmbienteInstalado | null;
  /**
   * O ligar, o desligar e o reiniciar do ambiente agem nele, como no app e no coletor: a linha dele
   * no painel tem os botões. O proxy e os bancos sobem com o servidor.
   */
  ligadoPeloAmbiente: boolean;
}

/**
 * A declaração única dos serviços da instalação (change painel-da-operacao, design, decisão 5): o
 * servicos estado, o Compose do Linux e o painel a leem. Um serviço novo, como o de um chat, entra
 * aqui, e a versão que o instala o mostra nos três, sem mudar a página do painel.
 */
export function servicosDaInstalacao(): readonly ServicoDaInstalacao[] {
  return [
    {
      id: SERVICOS.producao,
      noCompose: SERVICOS_NO_LINUX.producao,
      nome: 'Grafite',
      ambiente: 'producao',
      ligadoPeloAmbiente: true,
    },
    {
      id: SERVICOS.teste,
      noCompose: SERVICOS_NO_LINUX.teste,
      nome: 'Grafite Teste',
      ambiente: 'teste',
      ligadoPeloAmbiente: true,
    },
    {
      id: SERVICOS.coletor,
      noCompose: SERVICOS_NO_LINUX.coletor,
      nome: 'Grafite Coletor',
      ambiente: 'producao',
      ligadoPeloAmbiente: true,
    },
    {
      id: SERVICOS.proxy,
      noCompose: SERVICOS_NO_LINUX.proxy,
      nome: 'Grafite Proxy',
      ambiente: null,
      ligadoPeloAmbiente: false,
    },
    {
      id: SERVICOS.postgresDoTeste,
      noCompose: SERVICOS_NO_LINUX.bancoDoTeste,
      nome: 'Grafite PostgreSQL Teste',
      ambiente: 'teste',
      ligadoPeloAmbiente: false,
    },
    {
      id: SERVICO_DO_POSTGRES_DA_PRODUCAO,
      noCompose: SERVICOS_NO_LINUX.bancoDaProducao,
      nome: 'PostgreSQL da produção',
      ambiente: 'producao',
      ligadoPeloAmbiente: false,
    },
  ];
}

/** As pastas da instalação no Linux, todas na raiz, montadas nos contêineres que as usam. */
export function pastasDaInstalacaoNoLinux(raiz: string) {
  const doAmbiente = (ambiente: AmbienteInstalado) => {
    const pasta = posix.join(raiz, ambiente);
    return {
      pasta,
      configEnv: posix.join(pasta, 'config.env'),
      arquivos: posix.join(pasta, 'arquivos'),
      /** A pasta de dados do PostgreSQL do ambiente. */
      banco: posix.join(pasta, 'banco'),
      /** A senha do superusuário do PostgreSQL do ambiente, gerada na instalação. */
      bancoEnv: posix.join(pasta, 'banco.env'),
    };
  };
  return {
    raiz,
    /** O estado da instalação, sem segredos. */
    estado: posix.join(raiz, 'operacao.json'),
    /** As respostas de uma instalação que ainda não terminou, sem segredos. */
    instalacao: posix.join(raiz, 'instalacao.json'),
    /** O pacote.json de cada versão carregada. */
    versoes: posix.join(raiz, 'versoes'),
    /** O projeto do Compose, gerado pelo comando de operação. */
    compose: posix.join(raiz, 'compose.yaml'),
    /** As versões de cada ambiente e o fuso, que o Compose lê. */
    composeEnv: posix.join(raiz, '.env'),
    backups: posix.join(raiz, 'backups'),
    caddy: posix.join(raiz, 'caddy'),
    /** O token do DNS, lido pelo contêiner do proxy. */
    caddyEnv: posix.join(raiz, 'caddy', 'config.env'),
    /** O certificado raiz da AC do próprio Caddy, no modo interno, só para o root. */
    raizDaAcDoCaddy: posix.join(raiz, 'caddy', 'dados', 'pki', 'authorities', 'local', 'root.crt'),
    /** A pasta com a cópia pública da raiz, que os apps montam, sem as chaves da AC. */
    acDoCaddy: posix.join(raiz, 'caddy', 'ac'),
    /** A cópia pública da raiz da AC do Caddy, em que os apps confiam. */
    raizDaAcPublica: posix.join(raiz, 'caddy', 'ac', 'raiz.crt'),
    coletorEnv: posix.join(raiz, 'producao', 'coletor.env'),
    /** A fila em disco do coletor, com os lotes que a API ainda não aceitou. */
    filaDoColetor: posix.join(raiz, 'producao', 'coletor'),
    lancador: LANCADOR_NO_LINUX,
    producao: doAmbiente('producao'),
    teste: doAmbiente('teste'),
  };
}

export type PastasDaInstalacaoNoLinux = ReturnType<typeof pastasDaInstalacaoNoLinux>;

/** O serviço da rede interna do Linux que atende numa porta: o app de cada ambiente e o coletor. */
export function servicoDaPortaNoLinux(porta: number): string {
  if (porta === PORTAS.producao) return SERVICOS_NO_LINUX.producao;
  if (porta === PORTAS.teste) return SERVICOS_NO_LINUX.teste;
  if (porta === PORTAS.coletor) return SERVICOS_NO_LINUX.coletor;
  throw new Error(`A porta ${porta} não é a de um serviço do Grafite.`);
}

/** Onde o app de um ambiente atende e onde fica o banco dele. */
export interface EnderecosDoAmbiente {
  app: { host: string; porta: number };
  banco: { host: string; porta: number; nome: string };
}

/**
 * No Windows, o app e o banco de cada ambiente atendem em 127.0.0.1, cada um na porta dele; no
 * Linux, pelo nome do serviço na rede interna, com cada banco na porta padrão do próprio contêiner.
 */
export function enderecosDoAmbiente(
  plataforma: Plataforma,
  ambiente: AmbienteInstalado,
): EnderecosDoAmbiente {
  const { nome } = BANCOS[ambiente];
  if (plataforma === 'windows') {
    return {
      app: { host: '127.0.0.1', porta: PORTAS[ambiente] },
      banco: { host: '127.0.0.1', porta: BANCOS[ambiente].porta, nome },
    };
  }
  return {
    app: { host: SERVICOS_NO_LINUX[ambiente], porta: PORTAS[ambiente] },
    banco: {
      host:
        ambiente === 'producao'
          ? SERVICOS_NO_LINUX.bancoDaProducao
          : SERVICOS_NO_LINUX.bancoDoTeste,
      porta: 5432,
      nome,
    },
  };
}

/** As ferramentas do pacote em uso na produção: o WinSW e o Caddy. */
export function ferramentasDaProducao(pastas: PastasDaInstalacao) {
  const ferramentas = join(pastas.producao.atual, 'ferramentas');
  return { winsw: join(ferramentas, 'WinSW.exe'), caddy: join(ferramentas, 'caddy.exe') };
}
