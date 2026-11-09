// Os contêineres como a peça dos serviços (change servidor-linux-com-docker, design, decisão 3): o
// mesmo contrato dos serviços do Windows, pelo docker compose do projeto da instalação, com os
// nomes dos serviços do Windows ligados aos do Compose, para o código comum dos comandos não mudar.
import type { ExecutarProcesso } from '@grafite/operacao';
import { describe, expect, it } from 'vitest';
import { SERVICO_DO_POSTGRES_DA_PRODUCAO, SERVICOS } from '../layout.ts';
import { servicosDoDocker } from './servicos.ts';

const BASE = [
  'compose',
  '--project-name',
  'grafite',
  '--file',
  '/opt/grafite/compose.yaml',
  '--env-file',
  '/opt/grafite/.env',
];

/** O Docker simulado: guarda os comandos e responde o estado de cada contêiner, como o Compose. */
function dockerSimulado(estados: Record<string, string> = {}, falhas: Record<string, string> = {}) {
  const comandos: string[] = [];
  const executar: ExecutarProcesso = async (arquivo, argumentos) => {
    expect(arquivo).toBe('docker');
    expect(argumentos.slice(0, BASE.length)).toEqual(BASE);
    const comando = argumentos.slice(BASE.length);
    comandos.push(comando.join(' '));
    const servico = comando.at(-1) ?? '';
    const [verbo] = comando;
    if (falhas[verbo ?? ''] !== undefined)
      return { codigo: 1, saida: '', erro: falhas[verbo ?? ''] ?? '' };
    if (verbo === 'ps') {
      const estado = estados[servico];
      return {
        codigo: 0,
        saida:
          estado === undefined ? '' : `${JSON.stringify({ Service: servico, State: estado })}\n`,
        erro: '',
      };
    }
    if (verbo === 'up') estados[servico] = 'running';
    if (verbo === 'stop' && estados[servico] !== undefined) estados[servico] = 'exited';
    return { codigo: 0, saida: '', erro: '' };
  };
  return { comandos, executar, estados };
}

const servicos = (docker: ReturnType<typeof dockerSimulado>, tentativas = 3) =>
  servicosDoDocker({
    executar: docker.executar,
    raiz: '/opt/grafite',
    esperar: async () => {},
    tentativas,
  });

describe('os contêineres como os serviços', () => {
  it('inicia pelo docker compose up do serviço e espera o contêiner rodar', async () => {
    const docker = dockerSimulado();
    await servicos(docker).iniciar(SERVICOS.producao);
    expect(docker.comandos).toEqual([
      'up --detach app-producao',
      'ps --all --format json app-producao',
    ]);
  });

  it('para pelo docker compose stop, e o serviço já parado não é erro', async () => {
    const docker = dockerSimulado({ 'app-teste': 'running', coletor: 'exited' });
    await servicos(docker).parar(SERVICOS.teste);
    await servicos(docker).parar(SERVICOS.coletor);
    expect(docker.comandos).toEqual([
      'stop app-teste',
      'ps --all --format json app-teste',
      'stop coletor',
      'ps --all --format json coletor',
    ]);
  });

  it('o estado vem do docker compose ps: rodando, parado, mudando e ausente', async () => {
    const docker = dockerSimulado({
      'app-producao': 'running',
      'app-teste': 'exited',
      coletor: 'created',
      proxy: 'restarting',
    });
    const peca = servicos(docker);
    expect(await peca.estado(SERVICOS.producao)).toBe('rodando');
    expect(await peca.estado(SERVICOS.teste)).toBe('parado');
    expect(await peca.estado(SERVICOS.coletor)).toBe('parado');
    expect(await peca.estado(SERVICOS.proxy)).toBe('mudando');
    expect(await peca.estado(SERVICOS.postgresDoTeste)).toBe('ausente');
  });

  it('lê também a lista em JSON das versões mais velhas do Compose', async () => {
    const executar: ExecutarProcesso = async () => ({
      codigo: 0,
      saida: JSON.stringify([{ Service: 'banco-producao', State: 'running' }]),
      erro: '',
    });
    const peca = servicosDoDocker({ executar, raiz: '/opt/grafite', esperar: async () => {} });
    expect(await peca.estado(SERVICO_DO_POSTGRES_DA_PRODUCAO)).toBe('rodando');
  });

  it('liga os nomes dos serviços do Windows aos do Compose', async () => {
    const docker = dockerSimulado();
    const peca = servicos(docker);
    for (const id of [
      SERVICOS.producao,
      SERVICOS.teste,
      SERVICOS.coletor,
      SERVICOS.proxy,
      SERVICOS.postgresDoTeste,
      SERVICO_DO_POSTGRES_DA_PRODUCAO,
    ]) {
      await peca.estado(id);
    }
    expect(docker.comandos.map((comando) => comando.split(' ').at(-1))).toEqual([
      'app-producao',
      'app-teste',
      'coletor',
      'proxy',
      'banco-teste',
      'banco-producao',
    ]);
  });

  it('a falha do docker compose diz o serviço e o motivo', async () => {
    const docker = dockerSimulado({}, { up: 'pull access denied for grafite/aplicacao' });
    await expect(servicos(docker).iniciar(SERVICOS.producao)).rejects.toThrow(
      'Não foi possível iniciar o serviço app-producao: pull access denied for grafite/aplicacao',
    );
  });

  it('desiste de esperar o contêiner que não sobe e diz onde ver o log', async () => {
    const docker = dockerSimulado();
    const executar: ExecutarProcesso = async (arquivo, argumentos) => {
      const resultado = await docker.executar(arquivo, argumentos, { env: {} });
      if (argumentos.includes('up')) docker.estados['app-producao'] = 'restarting';
      return resultado;
    };
    const peca = servicosDoDocker({
      executar,
      raiz: '/opt/grafite',
      esperar: async () => {},
      tentativas: 3,
    });
    await expect(peca.iniciar(SERVICOS.producao)).rejects.toThrow(
      'O serviço app-producao não ficou rodando a tempo. Veja o log dele: docker compose --project-name grafite logs app-producao',
    );
  });

  it('não registra nada: os serviços são os do projeto do Compose, que a instalação gera', async () => {
    const docker = dockerSimulado();
    await servicos(docker).registrar({
      id: SERVICOS.producao,
      nome: 'Grafite',
      descricao: '',
      executavel: '',
      argumentos: '',
      pastaDeTrabalho: '',
      pastaDosLogs: '',
    });
    expect(docker.comandos).toEqual([]);
  });

  it('recusa um serviço que não é do Grafite', async () => {
    await expect(servicos(dockerSimulado()).estado('w3svc')).rejects.toThrow(
      'O serviço w3svc não é um serviço do Grafite.',
    );
  });
});
