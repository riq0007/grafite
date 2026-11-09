// Um servidor Linux simulado para os testes do comando de operação (change
// servidor-linux-com-docker): o Docker, com as imagens carregadas, os contêineres do Compose, os
// contêineres descartáveis das migrations, do comando da API e do Caddy, e o tar; o psql do comando,
// pelo nome do serviço do banco; e a saúde, que responde a versão do .env do Compose, só com o
// contêiner rodando. Cada passo vira um evento, na ordem. A pasta da instalação é de verdade, numa
// pasta temporária no lugar de /opt/grafite. Os serviços são a peça de verdade, sobre este Docker.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ExecutarProcesso,
  FerramentasDoPostgres,
  ResultadoDaFerramenta,
} from '@grafite/operacao';
import type { AmbienteInstalado } from '../src/estado.ts';
import { PORTAS } from '../src/layout.ts';
import { argumentosDoCompose, servicosDoDocker } from '../src/linux/servicos.ts';
import type { Saude } from '../src/saude.ts';

export const idDaImagem = (versao: string, nome: string) => {
  const digito = (
    versao
      .split('.')
      .map(Number)
      .reduce((a, b) => a * 10 + b, 0) % 10
  ).toString();
  const letra =
    { aplicacao: 'a', coletor: 'c', operacao: 'd', proxy: 'e', banco: 'b' }[nome] ?? 'f';
  return `sha256:${letra.repeat(32)}${digito.repeat(32)}`;
};

const IMAGENS = ['aplicacao', 'coletor', 'operacao', 'proxy', 'banco'];

/** A descrição do pacote de exemplo da versão, como o pacote.json dele. */
export const descricaoDaVersao = (versao: string) => ({
  versao,
  plataforma: 'linux',
  imagens: IMAGENS,
});

/** O diário das migrations da versão de exemplo: uma migration por versão menor, como 4 na 1.4.0. */
export const diarioDaVersao = (versao: string) =>
  Array.from({ length: Number(versao.split('.')[1] ?? 0) }, (_, indice) => ({
    idx: indice,
    tag: `${String(indice).padStart(4, '0')}_migracao`,
    when: 1_760_000_000_000 + indice,
  }));

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

const ok = (saida = ''): ResultadoDaFerramenta => ({ codigo: 0, saida, erro: '' });
const falha = (erro: string): ResultadoDaFerramenta => ({ codigo: 1, saida: '', erro });

/** As falhas que um teste liga no servidor, mesmo depois da instalação. */
export interface FalhasDoServidorLinux {
  /** O nome do serviço cujo app não sobe com saúde. */
  semSaude?: string;
  /** As migrations que falham, como `banco-producao 1.5.0`. */
  migracaoQueFalha?: string;
  /** O comando da API que falha uma vez, com o ambiente, como `cofre trocar-chave teste`. */
  comandoQueFalha?: string;
  /** O que o docker compose logs dá de cada serviço. */
  logs?: Record<string, string>;
}

export interface OpcoesDoServidorLinux extends FalhasDoServidorLinux {
  raiz: string;
  /** Os endereços de cada ambiente, para a saúde pelo proxy dizer o ambiente. */
  enderecos: Record<string, AmbienteInstalado>;
  /** Os pacotes, pelo caminho do tar, com a versão de cada um. */
  pacotes?: Record<string, string>;
}

export function servidorLinuxSimulado({
  raiz,
  enderecos,
  pacotes = {},
  ...falhas
}: OpcoesDoServidorLinux) {
  const eventos: string[] = [];
  const conteineres: Record<string, string> = {};
  const imagens: Record<string, string> = {};
  const argumentosDosProcessos: string[][] = [];
  const controle: FalhasDoServidorLinux = { ...falhas };
  /** As migrations aplicadas em cada banco, pelo momento do diário, como o drizzle as guarda. */
  const aplicadas: Record<string, number[]> = {};
  const base = argumentosDoCompose(raiz);

  async function versoesDoCompose(): Promise<Record<string, string>> {
    const texto = await readFile(join(raiz, '.env'), 'utf8').catch(() => '');
    return Object.fromEntries(
      texto
        .split('\n')
        .filter((linha) => linha.includes('=') && !linha.startsWith('#'))
        .map((linha) => linha.split('=') as [string, string]),
    );
  }

  const executar: ExecutarProcesso = async (arquivo, argumentos, { env }) => {
    argumentosDosProcessos.push([arquivo, ...argumentos]);
    if (arquivo === 'tar' && argumentos[0] === '-xOf') {
      const versao = pacotes[argumentos[1] ?? ''];
      return versao === undefined
        ? falha('não é um tar')
        : ok(JSON.stringify(descricaoDaVersao(versao)));
    }
    if (arquivo === 'tar' && argumentos[0] === '-xf') {
      const destino = argumentos[argumentos.indexOf('-C') + 1] ?? '';
      const versao = pacotes[argumentos[1] ?? ''] ?? '';
      await writeFile(join(destino, 'imagens.tar.gz'), versao);
      return ok();
    }
    if (arquivo !== 'docker') return falha(`inesperado: ${arquivo}`);
    const [primeiro, segundo] = argumentos;
    if (primeiro === 'version') return ok('27.3.1\n');
    if (primeiro === 'compose' && segundo === 'version') return ok('2.29.7\n');
    if (primeiro === 'image' && segundo === 'inspect') {
      const id = imagens[argumentos.at(-1) ?? ''];
      return id === undefined ? falha('Error: No such image') : ok(`${id}\n`);
    }
    if (primeiro === 'image' && segundo === 'rm') {
      for (const imagem of argumentos.slice(2)) delete imagens[imagem];
      eventos.push(`docker image rm ${argumentos.slice(2).join(' ')}`);
      return ok();
    }
    if (primeiro === 'load') {
      const versao = await readFile(argumentos.at(-1) ?? '', 'utf8');
      for (const nome of IMAGENS) imagens[`grafite/${nome}:${versao}`] = idDaImagem(versao, nome);
      eventos.push(`docker load ${versao}`);
      return ok(IMAGENS.map((nome) => `Loaded image: grafite/${nome}:${versao}\n`).join(''));
    }
    if (primeiro === 'compose') {
      const comando = argumentos.slice(base.length);
      const [verbo] = comando;
      const servico = comando.at(-1) ?? '';
      if (verbo === 'ps') {
        const estado = conteineres[servico];
        return ok(
          estado === undefined ? '' : `${JSON.stringify({ Service: servico, State: estado })}\n`,
        );
      }
      if (verbo === 'up') {
        const versoes = await versoesDoCompose();
        const ambiente = servico.endsWith('teste') ? 'TESTE' : 'PRODUCAO';
        eventos.push(`up ${servico} ${versoes[`GRAFITE_VERSAO_${ambiente}`] ?? '?'}`);
        conteineres[servico] = 'running';
        return ok();
      }
      if (verbo === 'logs') return ok(controle.logs?.[servico] ?? '');
      if (verbo === 'stop') {
        eventos.push(`stop ${servico}`);
        if (conteineres[servico] !== undefined) conteineres[servico] = 'exited';
        return ok();
      }
      return falha(`compose inesperado: ${comando.join(' ')}`);
    }
    if (primeiro === 'run') {
      if (argumentos.includes('host')) return ok('\n');
      // O contêiner que marca um destino novo do backup: o --mount recusa o que não existe.
      if (argumentos.includes('--mount')) {
        const montagem = argumentos[argumentos.indexOf('--mount') + 1] ?? '';
        const destino = /source=([^,]+)/.exec(montagem)?.[1] ?? '';
        if (!(await existe(destino))) {
          return falha(
            `docker: Error response from daemon: invalid mount config for type "bind": bind source path does not exist: ${destino}`,
          );
        }
        const [, , marca = ''] = argumentos.slice(-3);
        await writeFile(
          join(destino, '.grafite-destino'),
          `${marca}
`,
        );
        return ok();
      }
      // O contêiner que prepara um destino do backup: a pasta e a marca, como o do servidor.
      if (argumentos.includes('--entrypoint') && argumentos.includes('sh')) {
        const [destino = '', , marca = ''] = argumentos.slice(-3);
        await mkdir(destino, { recursive: true });
        await writeFile(join(destino, '.grafite-destino'), `${marca}\n`);
        return ok();
      }
      const imagem = argumentos.find((argumento) => argumento.startsWith('grafite/')) ?? '';
      const versao = imagem.split(':')[1] ?? '';
      if (imagens[imagem] === undefined) return falha(`Unable to find image '${imagem}' locally`);
      if (imagem.startsWith('grafite/proxy')) {
        eventos.push(`caddy validate ${versao}`);
        // Como o Caddy, a conferência do modo interno com a AC dele cria a AC, se ela não existe.
        const caddyfile = await readFile(
          argumentos[argumentos.indexOf('--config') + 1] ?? '',
          'utf8',
        );
        const ac = join(raiz, 'caddy', 'dados', 'pki', 'authorities', 'local');
        if (caddyfile.includes('tls internal') && !(await existe(join(ac, 'root.crt')))) {
          await mkdir(ac, { recursive: true });
          await writeFile(join(ac, 'root.crt'), 'a raiz da AC do Caddy');
          await writeFile(join(ac, 'root.key'), 'a chave da raiz');
        }
        return ok();
      }
      const [programa, ...script] = argumentos.slice(argumentos.indexOf(imagem) + 1);
      if (programa === 'cat' && script[0] === 'packages/db/migrations/meta/_journal.json') {
        return ok(
          JSON.stringify({ version: '7', dialect: 'postgresql', entries: diarioDaVersao(versao) }),
        );
      }
      if (programa !== 'node') return falha(`run inesperado: ${argumentos.join(' ')}`);
      // As variáveis passam pelo nome, com o valor no ambiente do docker: nunca na linha de comando.
      for (let i = 0; i < argumentos.length; i += 1) {
        if (argumentos[i] === '-e' && (argumentos[i + 1] ?? '').includes('=')) {
          return falha('variável com valor na linha de comando');
        }
      }
      if (script[0] === 'packages/db/src/migrar.ts') {
        const { hostname } = new URL(env.GRAFITE_DATABASE_URL_MIGRACOES ?? '');
        eventos.push(`migrar ${hostname} ${versao}`);
        if (controle.migracaoQueFalha === `${hostname} ${versao}`) {
          return falha('A migration 0004_migracao falhou: relation "ativos" already exists');
        }
        aplicadas[hostname] = diarioDaVersao(versao).map(({ when }) => when);
        return ok('Migrations aplicadas.\n');
      }
      if (script[0] === 'apps/api/scripts/grafite.ts') {
        const [, grupo, acao] = script;
        eventos.push(`${grupo} ${acao} ${versao}`);
        if (controle.comandoQueFalha === `${grupo} ${acao} ${env.GRAFITE_AMBIENTE}`) {
          // Falha uma vez só, como uma API que não respondeu.
          controle.comandoQueFalha = undefined;
          return falha('o banco não respondeu');
        }
        if (grupo === 'organizacao') {
          return ok('Organização Empresa criada.\nSenha temporária de ana.souza: temporaria-123\n');
        }
        if (grupo === 'coletor') return ok('Coletor "Servidor" ligado à organização.\n');
        return ok(`${grupo} ${acao} feito.\n`);
      }
      return falha(`run inesperado: ${argumentos.join(' ')}`);
    }
    return falha(`docker inesperado: ${argumentos.join(' ')}`);
  };

  const ferramentas: FerramentasDoPostgres = {
    executar: async (ferramenta, argumentos, opcoes) => {
      argumentosDosProcessos.push([ferramenta, ...argumentos]);
      const banco = argumentos.find((argumento) => argumento.startsWith('--dbname='));
      const host = banco ? new URL(banco.slice('--dbname='.length)).hostname : '?';
      if (argumentos.includes('--command=select 1')) {
        const servico = host;
        return conteineres[servico] === 'running' ? ok('1\n') : falha('connection refused');
      }
      const consulta = argumentos.find((argumento) => argumento.startsWith('--command='));
      if (consulta?.includes('from drizzle.__drizzle_migrations')) {
        eventos.push(`migrations de ${host}`);
        return ok((aplicadas[host] ?? []).map((when) => `${when}\n`).join(''));
      }
      // A ferramenta, o banco e a primeira linha do SQL, que diz o que ele faz.
      const [primeiraLinha = ''] = (opcoes?.entrada ?? '').split('\n');
      eventos.push([ferramenta, host, primeiraLinha].filter((parte) => parte !== '').join(' '));
      return ok();
    },
  };

  const servicos = servicosDoDocker({ executar, raiz, esperar: async () => {}, tentativas: 2 });

  async function respostaDoAmbiente(ambiente: AmbienteInstalado) {
    const versoes = await versoesDoCompose();
    return {
      status: 'ok',
      versao: versoes[`GRAFITE_VERSAO_${ambiente === 'teste' ? 'TESTE' : 'PRODUCAO'}`] ?? '',
      ambiente,
    };
  }

  const saude: Saude = {
    async local(porta) {
      const servico =
        porta === PORTAS.producao
          ? 'app-producao'
          : porta === PORTAS.teste
            ? 'app-teste'
            : 'coletor';
      if (conteineres[servico] !== 'running' || servico === controle.semSaude) {
        throw new Error(`O app em ${servico}:${porta} não respondeu com saúde em 120 s: recusado.`);
      }
      eventos.push(`saúde ${servico}`);
      if (servico === 'coletor')
        return { status: 'ok', versao: (await versoesDoCompose()).GRAFITE_VERSAO_PRODUCAO ?? '' };
      return respostaDoAmbiente(servico === 'app-teste' ? 'teste' : 'producao');
    },
    async peloProxy(endereco, opcoes) {
      if (conteineres.proxy !== 'running') {
        throw new Error(
          `O endereço https://${endereco} não respondeu com saúde em 300 s: recusado.`,
        );
      }
      eventos.push(`saúde https://${endereco}${opcoes?.raiz ? ' com a raiz da AC' : ''}`);
      return respostaDoAmbiente(enderecos[endereco] ?? 'producao');
    },
  };

  return {
    eventos,
    conteineres,
    imagens,
    argumentosDosProcessos,
    controle,
    executar,
    ferramentas,
    servicos,
    saude,
  };
}
