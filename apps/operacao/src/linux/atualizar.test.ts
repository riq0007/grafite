// A atualização e a volta pelas imagens no servidor Linux (spec operacao-em-linux, "Atualização e
// volta pelas imagens"; change servidor-linux-com-docker, design, decisões 1 e 8): o fluxo e as
// regras do Windows, com as imagens de cada versão no Docker e a versão de cada ambiente no .env do
// Compose, sobre uma instalação da 1.4.0 no servidor Linux simulado.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../../test/console-roteirizado.ts';
import { instalacaoNoLinuxDeExemplo } from '../../test/instalacao-no-linux.ts';
import {
  atualizarProducao,
  atualizarTeste,
  type DependenciasDaProducao,
  voltar,
} from '../atualizar.ts';
import type { BackupDoServidor } from '../backup.ts';
import { lerEstado } from '../estado.ts';
import { plataformaDoLinux } from './plataforma.ts';

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

type Instalada = Awaited<ReturnType<typeof instalacaoNoLinuxDeExemplo>>;

const PASTA_DO_BACKUP = () => posix.join(raiz, 'backups', 'grafite-producao', '2026-10-23T0500Z');

function dependencias(
  { servidor, pacotes }: Instalada,
  versao: string,
  console = consoleRoteirizado().console,
): DependenciasDaProducao {
  const backup = {
    async fazer() {
      servidor.eventos.push('backup da produção');
      return { nome: '2026-10-23T0500Z', pasta: PASTA_DO_BACKUP(), criadoEm: new Date() };
    },
  } as BackupDoServidor;
  return {
    raiz,
    pacote: pacotes[versao] ?? '',
    console,
    executar: servidor.executar,
    servicos: servidor.servicos,
    saude: servidor.saude,
    ferramentas: () => servidor.ferramentas,
    backup: () => backup,
    gerarChave: () => 'chave-que-nao-deve-ser-usada',
    gerarChavesDoPush: () => ({ publica: 'nao-usar', privada: 'nao-usar' }),
    plataforma: plataformaDoLinux({ executar: servidor.executar }),
  };
}

/** A versão de um ambiente no .env do Compose. */
async function versaoNoCompose(ambiente: 'PRODUCAO' | 'TESTE') {
  const texto = await readFile(join(raiz, '.env'), 'utf8');
  return new RegExp(`^GRAFITE_VERSAO_${ambiente}=(.*)$`, 'm').exec(texto)?.[1];
}

/** A instalação da 1.4.0, com o teste já na versão dada e os eventos limpos. */
async function comOTesteNa(versao: string, versoes?: string[]) {
  const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora, versoes });
  await atualizarTeste(dependencias(instalada, versao));
  instalada.servidor.eventos.length = 0;
  return instalada;
}

const RUNBOOK = 'Veja "Atualização que falhou" no runbook (docs/operacao/runbook.md).';

describe('sudo grafite atualizar --ambiente teste', () => {
  it('carrega as imagens, para o app do teste, migra pela imagem nova e troca a versão no .env', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const roteiro = consoleRoteirizado();
    await atualizarTeste(dependencias(instalada, '1.5.0', roteiro.console));

    expect(instalada.servidor.eventos).toEqual([
      'docker load 1.5.0',
      'stop app-teste',
      'migrar banco-teste 1.5.0',
      'up app-teste 1.5.0',
      'saúde app-teste',
    ]);
    expect(await versaoNoCompose('TESTE')).toBe('1.5.0');
    expect(await versaoNoCompose('PRODUCAO')).toBe('1.4.0');
    const estado = await lerEstado(raiz);
    expect(estado?.ambientes.teste).toMatchObject({ atual: '1.5.0', anterior: '1.4.0' });
    expect(estado?.ambientes.producao).toMatchObject({ atual: '1.4.0', anterior: null });
    expect(estado?.versoes).toEqual(['1.4.0', '1.5.0']);
    expect(roteiro.escritos).toContain('Imagens da versão 1.5.0 carregadas no Docker.');
    expect(roteiro.escritos).toContain(
      'O teste roda a versão 1.5.0. Para levá-la à produção: sudo grafite atualizar <tar> --ambiente producao.',
    );
  });
});

describe('sudo grafite atualizar --ambiente producao', () => {
  it('Versão que não passou pelo teste: recusa antes de mexer em qualquer coisa', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    await expect(atualizarProducao(dependencias(instalada, '1.5.0'))).rejects.toThrow(
      'A 1.5.0 precisa rodar no teste primeiro: o teste roda a 1.4.0. Rode antes sudo grafite atualizar <tar> --ambiente teste.',
    );
    expect(instalada.servidor.eventos).toEqual([]);
    expect(await versaoNoCompose('PRODUCAO')).toBe('1.4.0');
  });

  it('com a versão no teste: a guarda, o backup, o nome do banco e a produção, o coletor e o proxy na imagem nova', async () => {
    const instalada = await comOTesteNa('1.5.0');
    const roteiro = consoleRoteirizado('grafite');
    await atualizarProducao(dependencias(instalada, '1.5.0', roteiro.console));

    expect(instalada.servidor.eventos).toEqual([
      // A guarda: o teste roda a versão, com saúde, e tem todas as migrations do diário da imagem.
      'saúde app-teste',
      'migrations de banco-teste',
      'backup da produção',
      'stop coletor',
      'stop app-producao',
      'migrar banco-producao 1.5.0',
      'up app-producao 1.5.0',
      'saúde app-producao',
      'coletor criar 1.5.0',
      'up coletor 1.5.0',
      // O proxy roda a imagem da versão da produção.
      'up proxy 1.5.0',
    ]);
    expect(roteiro.perguntas).toEqual([
      'Para atualizar a produção para a 1.5.0, digite o nome do banco da produção',
    ]);
    expect(await versaoNoCompose('PRODUCAO')).toBe('1.5.0');
    expect((await lerEstado(raiz))?.ambientes.producao).toMatchObject({
      atual: '1.5.0',
      anterior: '1.4.0',
    });
    expect(roteiro.escritos).toContain('As imagens da versão 1.5.0 já estavam no Docker.');
    expect(roteiro.escritos).toContain(
      `A produção roda a versão 1.5.0. O backup de antes da atualização ficou em ${PASTA_DO_BACKUP()}.`,
    );
  });

  it('Migration que falha na produção: o app e o coletor ficam parados, com o backup e o runbook', async () => {
    const instalada = await comOTesteNa('1.5.0');
    instalada.servidor.controle.migracaoQueFalha = 'banco-producao 1.5.0';
    await expect(
      atualizarProducao(dependencias(instalada, '1.5.0', consoleRoteirizado('grafite').console)),
    ).rejects.toThrow(
      `As migrations da versão 1.5.0 falharam: A migration 0004_migracao falhou: relation "ativos" already exists\nO app e o coletor da produção ficaram parados, e o backup de antes da atualização está em ${PASTA_DO_BACKUP()}. ${RUNBOOK}`,
    );
    expect(instalada.servidor.conteineres['app-producao']).toBe('exited');
    expect(instalada.servidor.conteineres.coletor).toBe('exited');
    // A versão da produção continua a de antes, no .env e no estado.
    expect(await versaoNoCompose('PRODUCAO')).toBe('1.4.0');
    expect((await lerEstado(raiz))?.ambientes.producao.atual).toBe('1.4.0');
  });

  it('apaga as imagens das versões que nenhum ambiente usa, nem como atual nem como anterior', async () => {
    const instalada = await comOTesteNa('1.5.0', ['1.4.0', '1.5.0', '1.6.0']);
    await atualizarProducao(
      dependencias(instalada, '1.5.0', consoleRoteirizado('grafite').console),
    );
    await atualizarTeste(dependencias(instalada, '1.6.0'));
    // A produção ainda tem a 1.4.0 como anterior: nada é apagado.
    expect(instalada.servidor.eventos.filter((evento) => evento.includes('image rm'))).toEqual([]);

    const roteiro = consoleRoteirizado('grafite');
    await atualizarProducao(dependencias(instalada, '1.6.0', roteiro.console));
    expect(instalada.servidor.eventos.filter((evento) => evento.includes('image rm'))).toEqual([
      'docker image rm grafite/aplicacao:1.4.0 grafite/coletor:1.4.0 grafite/operacao:1.4.0 grafite/proxy:1.4.0 grafite/banco:1.4.0',
    ]);
    expect(
      Object.keys(instalada.servidor.imagens).some((imagem) => imagem.endsWith(':1.4.0')),
    ).toBe(false);
    expect(await readdir(join(raiz, 'versoes'))).toEqual(['1.5.0', '1.6.0']);
    expect((await lerEstado(raiz))?.versoes).toEqual(['1.5.0', '1.6.0']);
    expect(roteiro.escritos).toContain(
      'As imagens da versão 1.4.0, que nenhum ambiente usa, foram apagadas.',
    );
  });
});

describe('sudo grafite voltar', () => {
  it('Volta depois de uma atualização: a produção roda as imagens da 1.4.0 no mesmo banco', async () => {
    const instalada = await comOTesteNa('1.5.0');
    await atualizarProducao(
      dependencias(instalada, '1.5.0', consoleRoteirizado('grafite').console),
    );
    instalada.servidor.eventos.length = 0;
    const roteiro = consoleRoteirizado('grafite');
    await voltar(dependencias(instalada, '1.5.0', roteiro.console), 'producao');

    expect(instalada.servidor.eventos).toEqual([
      'stop coletor',
      'stop app-producao',
      'up app-producao 1.4.0',
      'saúde app-producao',
      'up coletor 1.4.0',
      'up proxy 1.4.0',
    ]);
    expect(await versaoNoCompose('PRODUCAO')).toBe('1.4.0');
    expect((await lerEstado(raiz))?.ambientes.producao).toMatchObject({
      atual: '1.4.0',
      anterior: '1.5.0',
    });
    expect(roteiro.escritos).toContain(
      'A produção voltou à 1.4.0. Para ir de novo à 1.5.0: sudo grafite voltar --ambiente producao.',
    );
  });
});
