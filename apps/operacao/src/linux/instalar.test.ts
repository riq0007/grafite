// O começo da instalação do zero no Linux (spec operacao-em-linux, "Instalação do zero no Linux";
// change servidor-linux-com-docker, design, decisões 2, 4, 11 e 12): as conferências do Docker, do
// pacote e das portas antes de criar qualquer coisa, as respostas sem a pasta, o pgBin e a senha do
// postgres, as pastas com o dono de cada contêiner e a marca em cada destino do backup.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../../test/console-roteirizado.ts';
import { servidorLinuxSimulado } from '../../test/servidor-linux-simulado.ts';
import { lerConfigEnv } from '../configuracao.ts';
import { lerEstado } from '../estado.ts';
import { instalarNoLinux, prepararInstalacaoNoLinux } from './instalar.ts';

let raiz: string;
let fora: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'grafite-linux-'));
  fora = await mkdtemp(join(tmpdir(), 'grafite-linux-fora-'));
});

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
  await rm(fora, { recursive: true, force: true });
});

/** O pacote no disco, com o hash ao lado. */
async function pacote() {
  const arquivo = join(fora, 'grafite-1.4.0-linux-x64.tar');
  await writeFile(arquivo, 'o tar do pacote');
  const hash = createHash('sha256').update('o tar do pacote').digest('hex');
  await writeFile(`${arquivo}.sha256`, `${hash}  grafite-1.4.0-linux-x64.tar\n`);
  return arquivo;
}

/**
 * O Docker e o tar simulados, com as portas ocupadas do servidor. O contêiner que prepara um
 * destino do backup cria a pasta e a marca, como o do servidor, e diz quando o dono não pegou.
 */
function sistemaSimulado({
  dockerResponde = true,
  ocupadas = '',
  semDono = [],
}: {
  dockerResponde?: boolean;
  ocupadas?: string;
  semDono?: string[];
} = {}) {
  const comandos: string[] = [];
  const executar: ExecutarProcesso = async (arquivo, argumentos) => {
    comandos.push([arquivo, ...argumentos].join(' '));
    if (arquivo === 'tar') {
      return {
        codigo: 0,
        saida: JSON.stringify({
          versao: '1.4.0',
          plataforma: 'linux',
          imagens: ['aplicacao', 'coletor', 'operacao', 'proxy', 'banco'],
        }),
        erro: '',
      };
    }
    if (argumentos[0] === 'version') {
      return dockerResponde
        ? { codigo: 0, saida: '27.3.1\n', erro: '' }
        : { codigo: 1, saida: '', erro: 'Cannot connect to the Docker daemon' };
    }
    if (argumentos[0] === 'compose' && argumentos[1] === 'version') {
      return { codigo: 0, saida: '2.29.7\n', erro: '' };
    }
    if (argumentos[0] === 'compose') return { codigo: 0, saida: '', erro: '' };
    if (
      argumentos[0] === 'run' &&
      argumentos.includes('--entrypoint') &&
      argumentos.includes('sh')
    ) {
      const [destino = '', , marca = ''] = argumentos.slice(-3);
      await mkdir(destino, { recursive: true });
      await writeFile(join(destino, '.grafite-destino'), `${marca}\n`);
      return { codigo: 0, saida: semDono.includes(destino) ? 'sem-dono\n' : '', erro: '' };
    }
    if (argumentos[0] === 'run') return { codigo: 0, saida: `${ocupadas}\n`, erro: '' };
    return { codigo: 1, saida: '', erro: `inesperado: ${arquivo} ${argumentos.join(' ')}` };
  };
  return { comandos, executar };
}

/** As permissões simuladas: guardam o dono e o modo pedidos para cada pasta. */
function permissoesSimuladas() {
  const donos: string[] = [];
  const modos: string[] = [];
  return {
    donos,
    modos,
    permissoes: {
      dono: async (caminho: string, uid: number, gid: number) => {
        donos.push(`${caminho} ${uid}:${gid}`);
      },
      modo: async (caminho: string, modo: number) => {
        modos.push(`${caminho} ${modo.toString(8)}`);
      },
    },
  };
}

/** As respostas do roteiro, sem a pasta, o pgBin e a senha do postgres, como no Linux. */
async function arquivoDeRespostas(destinos: string[]) {
  const caminho = join(fora, 'respostas.json');
  await writeFile(
    caminho,
    JSON.stringify({
      enderecos: ['grafite.empresa.com.br'],
      mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' },
      certificado: { modo: 'interno', ac: 'caddy' },
      backup: { destinos, janela: '01:00-05:00' },
      organizacao: { nome: 'Empresa', pessoa: 'Ana Souza', usuario: 'ana.souza' },
    }),
  );
  return caminho;
}

const dependencias = async (
  sistema: ReturnType<typeof sistemaSimulado>,
  permissoes: ReturnType<typeof permissoesSimuladas>['permissoes'],
  destinos: string[],
) => ({
  pacote: await pacote(),
  arquivoDeRespostas: await arquivoDeRespostas(destinos),
  raiz,
  fuso: 'America/Sao_Paulo',
  console: consoleRoteirizado().console,
  executar: sistema.executar,
  permissoes,
});

describe('as conferências da instalação no Linux, antes de criar qualquer coisa', () => {
  it('confere o Docker do servidor e o plugin compose', async () => {
    const sistema = sistemaSimulado({ dockerResponde: false });
    const { permissoes } = permissoesSimuladas();
    await expect(
      prepararInstalacaoNoLinux(await dependencias(sistema, permissoes, [join(raiz, 'backups')])),
    ).rejects.toThrow(
      'O Docker do servidor não respondeu: Cannot connect to the Docker daemon. Confira se o Docker Engine está instalado e rodando.',
    );
    expect(await readdir(raiz)).toEqual([]);
  });

  it('Porta do proxy ocupada: para e diz qual porta liberar, vista pela rede do servidor', async () => {
    const sistema = sistemaSimulado({ ocupadas: '443' });
    const { permissoes } = permissoesSimuladas();
    await expect(
      prepararInstalacaoNoLinux(await dependencias(sistema, permissoes, [join(raiz, 'backups')])),
    ).rejects.toThrow(
      'A porta 443 do servidor está ocupada por outro programa, e o proxy do Grafite precisa das portas 80 e 443: libere-a e rode a instalação de novo.',
    );
    expect(sistema.comandos.find((comando) => comando.startsWith('docker run'))).toMatch(
      /^docker run --rm --pull never --network host --entrypoint node grafite\/operacao:1\.4\.0 -e /,
    );
    expect(await readdir(raiz)).toEqual([]);
  });

  it('recusa a raiz que já tem uma instalação terminada', async () => {
    await writeFile(join(raiz, 'operacao.json'), '{}');
    const sistema = sistemaSimulado();
    const { permissoes } = permissoesSimuladas();
    await expect(
      prepararInstalacaoNoLinux(await dependencias(sistema, permissoes, [join(raiz, 'backups')])),
    ).rejects.toThrow(
      `O Grafite já está instalado em ${raiz}. Para uma versão nova, use sudo grafite atualizar.`,
    );
  });
});

describe('as respostas, as pastas e os destinos do backup', () => {
  it('lê as respostas sem a pasta e o pgBin, com a plataforma e o fuso do servidor', async () => {
    const sistema = sistemaSimulado();
    const { permissoes } = permissoesSimuladas();
    const destino = join(fora, 'nas');
    const preparada = await prepararInstalacaoNoLinux(
      await dependencias(sistema, permissoes, [join(raiz, 'backups'), destino]),
    );
    expect(preparada.descricao.versao).toBe('1.4.0');
    expect(preparada.respostas).toMatchObject({
      raiz,
      plataforma: 'linux',
      pgBin: '/usr/lib/postgresql/18/bin',
      fuso: 'America/Sao_Paulo',
      enderecos: ['grafite.empresa.com.br'],
      backup: { destinos: [join(raiz, 'backups'), destino], janela: '01:00-05:00' },
    });
    // As respostas ficam guardadas até a instalação terminar, para a retomada.
    expect(JSON.parse(await readFile(join(raiz, 'instalacao.json'), 'utf8'))).toMatchObject({
      enderecos: ['grafite.empresa.com.br'],
    });
  });

  it('cria as pastas com o dono de cada contêiner, a raiz só do root, e marca cada destino', async () => {
    const sistema = sistemaSimulado();
    const { donos, modos, permissoes } = permissoesSimuladas();
    const destino = join(fora, 'nas');
    await prepararInstalacaoNoLinux(
      await dependencias(sistema, permissoes, [join(raiz, 'backups'), destino]),
    );
    const naRaiz = (...partes: string[]) => posix.join(raiz, ...partes);
    expect(modos).toEqual([`${raiz} 700`, `${naRaiz('producao', 'coletor')} 700`]);
    expect(donos).toEqual([
      `${naRaiz('producao', 'arquivos')} 1000:1000`,
      `${naRaiz('teste', 'arquivos')} 1000:1000`,
      `${naRaiz('producao', 'coletor')} 1000:1000`,
    ]);
    // Cada destino, que o comando ainda não tem montado, é preparado por um contêiner da imagem do
    // comando com ele montado: a pasta, a marca e o dono dos contêineres.
    const preparos = sistema.comandos.filter((comando) => comando.includes('--entrypoint sh'));
    expect(preparos).toHaveLength(2);
    for (const [indice, pasta] of [join(raiz, 'backups'), destino].entries()) {
      expect(preparos[indice]).toContain(
        `docker run --rm --pull never --network none --volume ${pasta}:${pasta} --entrypoint sh grafite/operacao:1.4.0 -c `,
      );
      expect(preparos[indice]).toContain(` sh ${pasta} 1000:1000 Destino do backup do Grafite`);
      expect(await readFile(join(pasta, '.grafite-destino'), 'utf8')).toContain(
        'Destino do backup do Grafite',
      );
    }
    expect(await readdir(join(raiz, 'producao'))).toEqual(
      expect.arrayContaining(['arquivos', 'banco', 'coletor']),
    );
    expect(await readdir(join(raiz, 'teste'))).toEqual(
      expect.arrayContaining(['arquivos', 'banco']),
    );
  });

  it('o destino que não aceita o dono, como um compartilhamento, só ganha um aviso', async () => {
    const destino = join(fora, 'nas');
    const sistema = sistemaSimulado({ semDono: [destino] });
    const { permissoes } = permissoesSimuladas();
    const roteiro = consoleRoteirizado();
    await prepararInstalacaoNoLinux({
      ...(await dependencias(sistema, permissoes, [destino])),
      console: roteiro.console,
    });
    expect(roteiro.escritos.join('\n')).toContain(
      `O destino ${destino} não aceitou o dono dos contêineres (1000): confira se o usuário 1000 grava nele, ou o backup falhará.`,
    );
  });
});

/** O pacote de exemplo da versão, com o hash ao lado, e o servidor simulado que o conhece. */
async function servidorComPacote(versao = '1.4.0', opcoes: { semSaude?: string } = {}) {
  const arquivo = join(fora, `grafite-${versao}-linux-x64.tar`);
  await writeFile(arquivo, `o tar da ${versao}`);
  const hash = createHash('sha256').update(`o tar da ${versao}`).digest('hex');
  await writeFile(`${arquivo}.sha256`, `${hash}  grafite-${versao}-linux-x64.tar\n`);
  const servidor = servidorLinuxSimulado({
    raiz,
    enderecos: {
      'grafite.empresa.com.br': 'producao',
      'grafite-teste.empresa.com.br': 'teste',
    },
    pacotes: { [arquivo]: versao },
    ...opcoes,
  });
  return { arquivo, servidor };
}

function geradores() {
  let senhas = 0;
  let chaves = 0;
  return {
    gerarSenha: () => `senha-gerada-${++senhas}`,
    gerarChave: () => Buffer.alloc(32, ++chaves).toString('base64'),
    gerarChavesDoPush: () => ({ publica: 'publica-do-push', privada: 'privada-do-push' }),
  };
}

async function instalarComRoteiro(
  { arquivo, servidor }: Awaited<ReturnType<typeof servidorComPacote>>,
  roteiro = consoleRoteirizado(),
) {
  return instalarNoLinux({
    pacote: arquivo,
    arquivoDeRespostas: await arquivoDeRespostas([join(raiz, 'backups')]),
    raiz,
    fuso: 'America/Sao_Paulo',
    console: roteiro.console,
    executar: servidor.executar,
    ferramentas: servidor.ferramentas,
    servicos: servidor.servicos,
    saude: servidor.saude,
    permissoes: permissoesSimuladas().permissoes,
    esperarBanco: { esperar: async () => {}, tentativas: 2 },
    ...geradores(),
  });
}

describe('a instalação completa no Linux', () => {
  it('Instalação completa: os bancos, as migrations pela imagem, a organização, o coletor, o proxy, os contêineres e a saúde', async () => {
    const comPacote = await servidorComPacote();
    const roteiro = consoleRoteirizado();
    await instalarComRoteiro(comPacote, roteiro);
    const { servidor } = comPacote;
    const sqlDosPapeis =
      '-- Os papéis e o banco do Grafite (grafite instalar). Pode rodar de novo: acerta o que existe.';
    expect(servidor.eventos).toEqual([
      'docker load 1.4.0',
      'up banco-producao 1.4.0',
      'up banco-teste 1.4.0',
      `psql banco-producao ${sqlDosPapeis}`,
      `psql banco-teste ${sqlDosPapeis}`,
      'migrar banco-producao 1.4.0',
      'migrar banco-teste 1.4.0',
      'organizacao criar 1.4.0',
      'coletor criar 1.4.0',
      'caddy validate 1.4.0',
      'stop proxy',
      'up proxy 1.4.0',
      'up app-producao 1.4.0',
      'up app-teste 1.4.0',
      'up coletor 1.4.0',
      'saúde app-producao',
      'saúde app-teste',
      'saúde coletor',
      'saúde https://grafite.empresa.com.br com a raiz da AC',
      'saúde https://grafite-teste.empresa.com.br com a raiz da AC',
    ]);

    expect(await lerEstado(raiz)).toEqual({
      raiz,
      plataforma: 'linux',
      ambientes: {
        producao: {
          enderecos: ['grafite.empresa.com.br'],
          porta: 3000,
          atual: '1.4.0',
          anterior: null,
        },
        teste: {
          enderecos: ['grafite-teste.empresa.com.br'],
          porta: 3001,
          atual: '1.4.0',
          anterior: null,
        },
      },
      mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' },
      certificado: { modo: 'interno', ac: 'caddy' },
      versoes: ['1.4.0'],
      pgBin: '/usr/lib/postgresql/18/bin',
    });
    await expect(readFile(join(raiz, 'instalacao.json'))).rejects.toThrow();
    expect(await readFile(join(raiz, '.env'), 'utf8')).toContain('GRAFITE_VERSAO_TESTE=1.4.0');
    expect(await readFile(join(raiz, 'compose.yaml'), 'utf8')).toContain('"app-producao"');
    expect(await readFile(join(raiz, 'caddy', 'Caddyfile'), 'utf8')).toContain(
      'reverse_proxy app-producao:3000',
    );
    // Só a raiz pública da AC vai para a pasta que os apps montam; as chaves ficam com o proxy.
    expect(await readdir(join(raiz, 'caddy', 'ac'))).toEqual(['raiz.crt']);
    expect(await readFile(join(raiz, 'caddy', 'ac', 'raiz.crt'), 'utf8')).toBe(
      'a raiz da AC do Caddy',
    );
    const banco = await lerConfigEnv(join(raiz, 'producao', 'banco.env'));
    expect(banco.POSTGRES_PASSWORD).toMatch(/^senha-gerada-\d+$/);
    expect((await lerConfigEnv(join(raiz, 'producao', 'config.env'))).TZ).toBe('America/Sao_Paulo');

    const escritos = roteiro.escritos.join('\n');
    expect(escritos).toContain('Senha temporária de ana.souza: temporaria-123');
    expect(escritos).toContain(`Grafite 1.4.0 instalado em ${raiz}.`);
    expect(escritos).toContain('sudo grafite proxy raiz <pasta>');
    expect(escritos).toContain('sudo grafite email configurar');
    // Nenhuma senha na linha de comando dos processos, que a lista de processos mostra, e nenhuma
    // imagem buscada no Docker Hub.
    for (const argumentos of servidor.argumentosDosProcessos) {
      expect(argumentos.join(' ')).not.toMatch(/senha-gerada/);
      if (argumentos[0] === 'docker' && argumentos[1] === 'run') {
        expect(argumentos.slice(2, 5)).toEqual(['--rm', '--pull', 'never']);
      }
    }
  });

  it('Instalação interrompida: continua de onde parou, com as mesmas senhas', async () => {
    const primeira = await servidorComPacote('1.4.0', { semSaude: 'app-teste' });
    await expect(instalarComRoteiro(primeira)).rejects.toThrow(
      /A instalação parou no meio\. Corrija o problema e rode o mesmo comando de novo: ela continua de onde parou\./,
    );
    const configDeAntes = await readFile(join(raiz, 'producao', 'config.env'), 'utf8');
    const bancoDeAntes = await readFile(join(raiz, 'teste', 'banco.env'), 'utf8');

    const segunda = await servidorComPacote('1.4.0');
    // O Docker da segunda vez já tem as imagens e os contêineres da primeira.
    Object.assign(segunda.servidor.imagens, primeira.servidor.imagens);
    Object.assign(segunda.servidor.conteineres, primeira.servidor.conteineres);
    const roteiro = consoleRoteirizado();
    await instalarComRoteiro(segunda, roteiro);
    expect(roteiro.escritos).toContain(
      'Retomando a instalação interrompida, com as respostas dadas antes.',
    );
    expect(segunda.servidor.eventos).not.toContain('docker load 1.4.0');
    expect(await readFile(join(raiz, 'producao', 'config.env'), 'utf8')).toBe(configDeAntes);
    expect(await readFile(join(raiz, 'teste', 'banco.env'), 'utf8')).toBe(bancoDeAntes);
    expect((await lerEstado(raiz))?.plataforma).toBe('linux');
  });
});
