// O lançador `grafite` e o `instalar.sh` do servidor Linux (spec operacao-em-linux, "Comando de
// operação no Linux" e "Instalação do zero no Linux"; change servidor-linux-com-docker, design,
// decisão 2), rodados pelo bash, com o `docker` e o `id` simulados no caminho: o simulado guarda os
// argumentos de cada chamada e responde como o Docker de um servidor.
import { execFile } from 'node:child_process';
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASH, FERRAMENTAS_DO_SISTEMA, noBash, temBash } from '../../test/bash.ts';

const executar = promisify(execFile);

const LANCADORES = join(import.meta.dirname, '..', '..', 'lancadores');
const LANCADOR = join(LANCADORES, 'grafite');
const INSTALAR = join(LANCADORES, 'instalar.sh');

const DOCKER_SIMULADO = `#!/usr/bin/env bash
# O Docker simulado: guarda os argumentos e responde como o Docker de um servidor.
{ printf '%s\\n' "$@"; echo '--'; } >> "$DOCKER_REGISTRO"
case "$1" in
  info) exit "\${DOCKER_INFO:-0}" ;;
  compose) [ "\${DOCKER_COMPOSE:-0}" = 0 ] && echo 2.29.7; exit "\${DOCKER_COMPOSE:-0}" ;;
  network) [ "$2" = inspect ] && exit "\${DOCKER_REDE:-1}"; exit 0 ;;
  load) cat > /dev/null; echo 'Loaded image: grafite/operacao:1.4.0' ;;
  run)
    # O painel escreve o endereço com o código, na porta que recebeu; o resto, só que rodou.
    porta=''; anterior=''
    for argumento in "$@"; do
      [ "$anterior" = --porta ] && porta="$argumento"
      anterior="$argumento"
    done
    if [ -n "$porta" ]; then
      echo "O painel da operação está em http://127.0.0.1:$porta/#codigo-de-teste"
    else
      echo 'o comando rodou'
    fi ;;
esac
`;

const ID_SIMULADO = `#!/usr/bin/env bash
echo "\${ID_DO_USUARIO:-0}"
`;

/** O sudo simulado guarda os argumentos, como o Docker simulado; o xdg-open só precisa existir. */
const SUDO_SIMULADO = `#!/usr/bin/env bash
{ printf '%s\\n' "$@"; echo '--'; } >> "$SUDO_REGISTRO"
`;

let pasta: string;
let simulados: string;
let registro: string;
let registroDoSudo: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-lancadores-'));
  simulados = join(pasta, 'simulados');
  registro = join(pasta, 'docker.txt');
  registroDoSudo = join(pasta, 'sudo.txt');
  await mkdir(simulados);
  await writeFile(registro, '');
  await writeFile(registroDoSudo, '');
});

afterEach(async () => {
  // O navegador do painel abre em segundo plano: no Windows, ele ainda pode segurar a pasta.
  await rm(pasta, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/**
 * Põe os simulados no caminho: o `id`, o `sudo` e o `xdg-open` sempre, e o `docker` só quando o
 * servidor o tem.
 */
async function simular({ docker = true } = {}) {
  await writeFile(join(simulados, 'id'), ID_SIMULADO, { mode: 0o755 });
  await writeFile(join(simulados, 'sudo'), SUDO_SIMULADO, { mode: 0o755 });
  await writeFile(join(simulados, 'xdg-open'), '#!/usr/bin/env bash\n', { mode: 0o755 });
  if (docker) await writeFile(join(simulados, 'docker'), DOCKER_SIMULADO, { mode: 0o755 });
  await chmod(simulados, 0o755);
}

/** As chamadas ao sudo simulado, quando houver. */
async function chamadasDoSudo() {
  return (await readFile(registroDoSudo, 'utf8'))
    .split('--\n')
    .filter((chamada) => chamada !== '')
    .map((chamada) => chamada.trimEnd().split('\n'));
}

/** Roda um script pelo bash e devolve o código, a saída, os erros e as chamadas ao Docker. */
async function rodar(script: string, argumentos: string[], ambiente: Record<string, string> = {}) {
  const env = {
    PATH: [simulados, ...FERRAMENTAS_DO_SISTEMA].join(delimiter),
    DOCKER_REGISTRO: noBash(registro),
    SUDO_REGISTRO: noBash(registroDoSudo),
    HOME: noBash(pasta),
    ...ambiente,
  };
  let resultado: { codigo: number; saida: string; erro: string };
  try {
    const { stdout, stderr } = await executar(BASH, [noBash(script), ...argumentos], {
      env,
      cwd: pasta,
    });
    resultado = { codigo: 0, saida: stdout, erro: stderr };
  } catch (falha) {
    const { code, stdout, stderr } = falha as { code: number; stdout: string; stderr: string };
    resultado = { codigo: code, saida: stdout, erro: stderr };
  }
  const chamadas = (await readFile(registro, 'utf8'))
    .split('--\n')
    .filter((chamada) => chamada !== '')
    .map((chamada) => chamada.trimEnd().split('\n'));
  return { ...resultado, chamadas };
}

/** Uma instalação na pasta dada: o .env do Compose e a configuração da produção, com os destinos. */
async function instalacaoEm(raiz: string, destinos: string[]) {
  await mkdir(join(raiz, 'producao'), { recursive: true });
  await writeFile(
    join(raiz, '.env'),
    '# Gerado por "grafite". Não edite: rode o comando de novo.\nGRAFITE_VERSAO_PRODUCAO=1.5.0\nGRAFITE_VERSAO_TESTE=1.6.0\nTZ=America/Sao_Paulo\n',
  );
  await writeFile(
    join(raiz, 'producao', 'config.env'),
    `GRAFITE_AMBIENTE='producao'\nGRAFITE_BACKUP_DESTINOS='${destinos.map(noBash).join(';')}'\n`,
  );
  for (const destino of destinos) await mkdir(destino, { recursive: true });
}

/** O pacote de exemplo: o tar com o pacote.json, as imagens e o lançador, e o .sha256 ao lado. */
async function pacoteDeExemplo(versao: string, { hashErrado = false } = {}) {
  const conteudo = join(pasta, 'conteudo');
  await mkdir(conteudo, { recursive: true });
  await writeFile(
    join(conteudo, 'pacote.json'),
    `${JSON.stringify({ versao, plataforma: 'linux', imagens: {} }, null, 2)}\n`,
  );
  await writeFile(join(conteudo, 'imagens.tar.gz'), 'as imagens');
  await writeFile(join(conteudo, 'grafite'), await readFile(LANCADOR, 'utf8'));
  const nome = `grafite-${versao}-linux-x64.tar`;
  const fora = join(pasta, 'pacotes');
  await mkdir(fora, { recursive: true });
  const tar = join(fora, nome);
  await executar(BASH, [
    '-c',
    `cd "${noBash(conteudo)}" && tar -cf "${noBash(tar)}" pacote.json imagens.tar.gz grafite`,
  ]);
  const { stdout } = await executar(BASH, ['-c', `sha256sum "${noBash(tar)}"`]);
  const hash = hashErrado ? 'f'.repeat(64) : (stdout.split(' ')[0] ?? '');
  await writeFile(`${tar}.sha256`, `${hash}  ${nome}\n`);
  return tar;
}

/** Uma cópia do instalar.sh na pasta dada, como a que a release publica ao lado do pacote. */
async function roteiroEm(pastaDoRoteiro: string) {
  await mkdir(pastaDoRoteiro, { recursive: true });
  const roteiro = join(pastaDoRoteiro, 'instalar.sh');
  await copyFile(INSTALAR, roteiro);
  return roteiro;
}

// O Docker de verdade não entra no caminho dos scripts: no Linux, ele fica em /usr/bin, ao lado das
// ferramentas do sistema, como nos executores do GitHub, e o "Docker ausente" seria impossível.
describe.runIf(temBash)('as ferramentas do sistema no caminho dos scripts', () => {
  it('têm o tar e o sha256sum, e não têm o Docker', async () => {
    const tem = (nome: string) =>
      Promise.any(
        FERRAMENTAS_DO_SISTEMA.flatMap((pasta) => [
          access(join(pasta, nome)),
          access(join(pasta, `${nome}.exe`)),
        ]),
      ).then(
        () => true,
        () => false,
      );
    expect(await tem('tar')).toBe(true);
    expect(await tem('sha256sum')).toBe(true);
    expect(await tem('docker')).toBe(false);
  });
});

describe.runIf(temBash)('o lançador grafite', () => {
  it('Sem o root: recusa e diz para rodar com o sudo, sem chamar o Docker', async () => {
    await simular();
    const { codigo, erro, chamadas } = await rodar(LANCADOR, ['servicos', 'estado'], {
      ID_DO_USUARIO: '1000',
    });
    expect(codigo).toBe(1);
    expect(erro).toContain(
      'O grafite precisa do root: rode com o sudo, como sudo grafite servicos.',
    );
    expect(chamadas).toEqual([]);
  });

  it('Docker ausente: recusa e diz o que instalar', async () => {
    await simular({ docker: false });
    const { codigo, erro } = await rodar(LANCADOR, ['servicos', 'estado']);
    expect(codigo).toBe(1);
    expect(erro).toContain(
      'O Docker não está instalado neste servidor: instale o Docker Engine e o plugin compose, como diz o runbook.',
    );
  });

  it('roda o comando da versão da produção, com o socket, a instalação, os destinos e a pasta do pacote', async () => {
    await simular();
    const raiz = join(pasta, 'opt-grafite');
    const destinos = [join(raiz, 'backups'), join(pasta, 'mnt', 'nas')];
    await instalacaoEm(raiz, destinos);
    const tar = await pacoteDeExemplo('1.6.0');

    const { codigo, saida, chamadas } = await rodar(
      LANCADOR,
      ['atualizar', noBash(tar), '--ambiente', 'producao'],
      { GRAFITE_RAIZ: noBash(raiz) },
    );

    expect(codigo).toBe(0);
    expect(saida).toContain('o comando rodou');
    expect(chamadas.slice(0, 3)).toEqual([
      ['info'],
      ['network', 'inspect', 'grafite'],
      [
        'network',
        'create',
        '--subnet',
        '172.30.0.0/24',
        '--ip-range',
        '172.30.0.128/25',
        'grafite',
      ],
    ]);
    const run = chamadas[3] ?? [];
    expect(run.slice(0, 7)).toEqual([
      'run',
      '--rm',
      '--interactive',
      '--pull',
      'never',
      '--network',
      'grafite',
    ]);
    const volumes = run.flatMap((argumento, indice) =>
      run[indice - 1] === '--volume' ? [argumento] : [],
    );
    expect(volumes[0]).toBe('/var/run/docker.sock:/var/run/docker.sock');
    expect(volumes[1]).toBe(`${noBash(raiz)}:${noBash(raiz)}`);
    // O destino de fora da instalação, no mesmo caminho, e a pasta do pacote, pelo argumento.
    expect(volumes.some((volume) => volume.endsWith(`${basename(destinos[1] ?? '')}`))).toBe(true);
    expect(volumes.some((volume) => volume.endsWith('/pacotes'))).toBe(true);
    expect(run).toContain(`GRAFITE_RAIZ=${noBash(raiz)}`);
    expect(run.some((argumento) => argumento.startsWith('GRAFITE_FUSO='))).toBe(true);
    expect(run.slice(run.indexOf('grafite/operacao:1.5.0'))).toEqual([
      'grafite/operacao:1.5.0',
      'atualizar',
      noBash(tar),
      '--ambiente',
      'producao',
    ]);
  });

  it('sem instalação, diz para instalar pelo pacote', async () => {
    await simular();
    const raiz = join(pasta, 'vazia');
    const { codigo, erro } = await rodar(LANCADOR, ['servicos', 'estado'], {
      GRAFITE_RAIZ: noBash(raiz),
    });
    expect(codigo).toBe(1);
    expect(erro).toContain(
      `O Grafite não está instalado em ${noBash(raiz)}: instale com o instalar.sh do pacote, como diz o runbook.`,
    );
  });
});

// O painel no Linux (change painel-da-operacao, design, decisão 7; spec operacao-em-linux,
// "Comando de operação no Linux"): o lançador escolhe a porta, a publica só no 127.0.0.1 do
// servidor e abre o endereço que o comando escreve no navegador de quem chamou o sudo.
describe.runIf(temBash)('o painel pelo lançador grafite', () => {
  const SESSAO_GRAFICA = { SUDO_USER: 'maria', SUDO_UID: '1000', DISPLAY: ':0' };

  /** A chamada do `docker run`, a porta publicada e os argumentos depois da imagem. */
  function doRun(chamadas: string[][]) {
    const run = chamadas.find((chamada) => chamada[0] === 'run') ?? [];
    const publicada = run[run.indexOf('--publish') + 1] ?? '';
    return {
      run,
      publicada,
      depoisDaImagem: run.slice(run.indexOf('grafite/operacao:1.5.0') + 1),
    };
  }

  it('Painel no Linux com interface: publica a porta só no 127.0.0.1 e abre o navegador de quem chamou o sudo', async () => {
    await simular();
    const raiz = join(pasta, 'opt-grafite');
    await instalacaoEm(raiz, [join(raiz, 'backups')]);

    const { codigo, saida, chamadas } = await rodar(LANCADOR, ['painel'], {
      GRAFITE_RAIZ: noBash(raiz),
      ...SESSAO_GRAFICA,
    });

    expect(codigo).toBe(0);
    const { run, publicada, depoisDaImagem } = doRun(chamadas);
    const porta = /^127\.0\.0\.1:(\d+):(\d+)$/.exec(publicada);
    expect(porta?.[1]).toBe(porta?.[2]);
    expect(Number(porta?.[1])).toBeGreaterThanOrEqual(1024);
    expect(Number(porta?.[1])).toBeLessThanOrEqual(65535);
    expect(depoisDaImagem).toEqual(['painel', '--porta', porta?.[1]]);
    expect(run).not.toContain('--tty');
    const endereco = `http://127.0.0.1:${porta?.[1]}/#codigo-de-teste`;
    expect(saida).toContain(`O painel da operação está em ${endereco}`);
    await vi.waitFor(async () =>
      expect(await chamadasDoSudo()).toEqual([
        [
          '-u',
          'maria',
          'env',
          'XDG_RUNTIME_DIR=/run/user/1000',
          'DISPLAY=:0',
          'xdg-open',
          endereco,
        ],
      ]),
    );
  });

  it('com a porta dada, publica e passa a mesma porta', async () => {
    await simular();
    const raiz = join(pasta, 'opt-grafite');
    await instalacaoEm(raiz, [join(raiz, 'backups')]);

    const { codigo, chamadas } = await rodar(LANCADOR, ['painel', '--porta', '4321'], {
      GRAFITE_RAIZ: noBash(raiz),
      ...SESSAO_GRAFICA,
    });

    expect(codigo).toBe(0);
    const { publicada, depoisDaImagem } = doRun(chamadas);
    expect(publicada).toBe('127.0.0.1:4321:4321');
    expect(depoisDaImagem).toEqual(['painel', '--porta', '4321']);
    await vi.waitFor(async () =>
      expect((await chamadasDoSudo())[0]?.at(-1)).toBe('http://127.0.0.1:4321/#codigo-de-teste'),
    );
  });

  it('Painel sem interface gráfica: diz que o painel precisa de interface e que os comandos valem, sem chamar o Docker', async () => {
    await simular();
    const raiz = join(pasta, 'opt-grafite');
    await instalacaoEm(raiz, [join(raiz, 'backups')]);

    const { codigo, erro, chamadas } = await rodar(LANCADOR, ['painel'], {
      GRAFITE_RAIZ: noBash(raiz),
      SUDO_USER: 'maria',
      SUDO_UID: '1000',
    });

    expect(codigo).toBe(1);
    expect(erro).toContain(
      'O painel precisa de um servidor com interface gráfica: rode sudo grafite painel numa sessão da área de trabalho do servidor. Os comandos continuam valendo, como sudo grafite servicos estado (sudo grafite --ajuda).',
    );
    expect(chamadas).toEqual([]);
    expect(await chamadasDoSudo()).toEqual([]);
  });

  it('com o --sem-navegador, sobe sem sessão gráfica e só escreve o endereço, como no CI', async () => {
    await simular();
    const raiz = join(pasta, 'opt-grafite');
    await instalacaoEm(raiz, [join(raiz, 'backups')]);

    const { codigo, saida, chamadas } = await rodar(
      LANCADOR,
      ['painel', '--sem-navegador', '--porta', '4321'],
      { GRAFITE_RAIZ: noBash(raiz) },
    );

    expect(codigo).toBe(0);
    const { publicada, depoisDaImagem } = doRun(chamadas);
    expect(publicada).toBe('127.0.0.1:4321:4321');
    expect(depoisDaImagem).toEqual(['painel', '--sem-navegador', '--porta', '4321']);
    expect(saida).toContain('O painel da operação está em http://127.0.0.1:4321/#codigo-de-teste');
    expect(await chamadasDoSudo()).toEqual([]);
  });
});

describe.runIf(temBash)('o instalar.sh', () => {
  it('Docker ausente: sem o Docker ou sem o plugin compose, para antes de criar qualquer coisa', async () => {
    const tar = await pacoteDeExemplo('1.4.0');
    const lancador = join(pasta, 'bin', 'grafite');
    await mkdir(dirname(lancador));
    await simular({ docker: false });
    const semDocker = await rodar(INSTALAR, [noBash(tar)], { GRAFITE_LANCADOR: noBash(lancador) });
    expect(semDocker.codigo).toBe(1);
    expect(semDocker.erro).toContain(
      'O Docker não está instalado neste servidor: instale o Docker Engine e o plugin compose, como diz o runbook, e rode a instalação de novo.',
    );

    await simular();
    const semCompose = await rodar(INSTALAR, [noBash(tar)], {
      GRAFITE_LANCADOR: noBash(lancador),
      DOCKER_COMPOSE: '1',
    });
    expect(semCompose.codigo).toBe(1);
    expect(semCompose.erro).toContain(
      'O plugin compose do Docker não está instalado: instale o docker-compose-plugin, como diz o runbook, e rode a instalação de novo.',
    );
    await expect(access(lancador)).rejects.toThrow();
  });

  it('Sem o root: recusa antes de qualquer coisa', async () => {
    await simular();
    const tar = await pacoteDeExemplo('1.4.0');
    const { codigo, erro, chamadas } = await rodar(INSTALAR, [noBash(tar)], {
      ID_DO_USUARIO: '1000',
    });
    expect(codigo).toBe(1);
    expect(erro).toContain(
      'A instalação do Grafite precisa do root: rode com o sudo, como sudo bash instalar.sh.',
    );
    expect(chamadas).toEqual([]);
  });

  it('Pacote alterado: recusa antes de carregar as imagens', async () => {
    await simular();
    const tar = await pacoteDeExemplo('1.4.0', { hashErrado: true });
    const { codigo, erro, chamadas } = await rodar(INSTALAR, [noBash(tar)]);
    expect(codigo).toBe(1);
    expect(erro).toContain(
      'O pacote grafite-1.4.0-linux-x64.tar não confere com o hash publicado. Nada foi mudado: baixe o pacote e o .sha256 de novo.',
    );
    expect(chamadas.some(([comando]) => comando === 'load')).toBe(false);
  });

  it('confere o pacote, carrega as imagens, instala o lançador e chama a instalação com a versão do pacote', async () => {
    await simular();
    const tar = await pacoteDeExemplo('1.4.0');
    const respostas = join(pasta, 'respostas.json');
    await writeFile(respostas, '{}');
    const lancador = join(pasta, 'bin', 'grafite');
    await mkdir(dirname(lancador));
    const raiz = join(pasta, 'opt-grafite');

    const { codigo, saida, chamadas } = await rodar(
      INSTALAR,
      [noBash(tar), '--respostas', noBash(respostas)],
      { GRAFITE_LANCADOR: noBash(lancador), GRAFITE_RAIZ: noBash(raiz) },
    );

    expect(codigo).toBe(0);
    expect(saida).toContain('Carregando as imagens da versão 1.4.0 no Docker.');
    expect(chamadas.map(([comando, ...resto]) => [comando, resto[0]])).toEqual([
      ['info', undefined],
      ['compose', 'version'],
      ['load', undefined],
      // O lançador instalado roda a imagem do comando do próprio pacote.
      ['info', undefined],
      ['network', 'inspect'],
      ['network', 'create'],
      ['run', '--rm'],
    ]);
    const run = chamadas.at(-1) ?? [];
    expect(run.slice(run.indexOf('grafite/operacao:1.4.0'))).toEqual([
      'grafite/operacao:1.4.0',
      'instalar',
      noBash(tar),
      '--respostas',
      noBash(respostas),
    ]);
    expect(await readFile(lancador, 'utf8')).toBe(await readFile(LANCADOR, 'utf8'));
    expect(saida).toContain('o comando rodou');
  });

  it('Roteiro baixado da release: sem argumentos, acha o pacote da pasta dele, confere e instala', async () => {
    await simular();
    const tar = await pacoteDeExemplo('1.4.0');
    const roteiro = await roteiroEm(dirname(tar));
    const lancador = join(pasta, 'bin', 'grafite');
    await mkdir(dirname(lancador));

    // Rodado de outra pasta: o pacote vem da pasta do roteiro, e não da pasta atual.
    const { codigo, chamadas } = await rodar(roteiro, [], {
      GRAFITE_LANCADOR: noBash(lancador),
      GRAFITE_RAIZ: noBash(join(pasta, 'opt-grafite')),
    });

    expect(codigo).toBe(0);
    expect(chamadas.some(([comando]) => comando === 'load')).toBe(true);
    const run = chamadas.at(-1) ?? [];
    expect(run.slice(run.indexOf('grafite/operacao:1.4.0'))).toEqual([
      'grafite/operacao:1.4.0',
      'instalar',
      noBash(tar),
    ]);
  });

  it('com as respostas e sem o pacote, acha o pacote da pasta e passa as respostas', async () => {
    await simular();
    const tar = await pacoteDeExemplo('1.4.0');
    const roteiro = await roteiroEm(dirname(tar));
    const respostas = join(pasta, 'respostas.json');
    await writeFile(respostas, '{}');
    const lancador = join(pasta, 'bin', 'grafite');
    await mkdir(dirname(lancador));

    const { codigo, chamadas } = await rodar(roteiro, ['--respostas', noBash(respostas)], {
      GRAFITE_LANCADOR: noBash(lancador),
      GRAFITE_RAIZ: noBash(join(pasta, 'opt-grafite')),
    });

    expect(codigo).toBe(0);
    const run = chamadas.at(-1) ?? [];
    expect(run.slice(run.indexOf('grafite/operacao:1.4.0'))).toEqual([
      'grafite/operacao:1.4.0',
      'instalar',
      noBash(tar),
      '--respostas',
      noBash(respostas),
    ]);
  });

  it('Pasta com mais de um pacote: sem argumentos, para antes de mudar qualquer coisa', async () => {
    await simular();
    const tar = await pacoteDeExemplo('1.4.0');
    await pacoteDeExemplo('1.5.0');
    const roteiro = await roteiroEm(dirname(tar));

    const { codigo, erro, chamadas } = await rodar(roteiro, []);

    expect(codigo).toBe(1);
    expect(erro).toContain(
      `A pasta ${noBash(dirname(tar))} tem mais de um pacote do Grafite para Linux: deixe nela só o da versão que vai instalar, ou diga qual, como sudo bash instalar.sh grafite-x.y.z-linux-x64.tar.`,
    );
    expect(chamadas).toEqual([]);
  });

  it('Pasta sem pacote: sem argumentos, para e diz para baixar o pacote e o hash para a pasta do roteiro', async () => {
    await simular();
    const vazia = join(pasta, 'vazia');
    const roteiro = await roteiroEm(vazia);

    const { codigo, erro, chamadas } = await rodar(roteiro, []);

    expect(codigo).toBe(1);
    expect(erro).toContain(
      `Falta o pacote: baixe da release o grafite-x.y.z-linux-x64.tar e o .sha256 para a pasta ${noBash(vazia)}, a do instalar.sh.`,
    );
    expect(chamadas).toEqual([]);
  });
});
