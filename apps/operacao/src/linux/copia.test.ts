// A cópia de um backup num ambiente do servidor Linux (spec operacao-em-linux, "Teste com a cópia da
// produção no Linux" e "Backup no Linux"; change servidor-linux-com-docker, design, decisões 1 e
// 11): o fluxo e as regras do Windows, com os bancos pelo nome do serviço na rede interna, as
// migrations pela imagem da versão e os arquivos restaurados passados ao usuário dos contêineres,
// sobre uma instalação da 1.4.0 no servidor Linux simulado.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipar } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../../test/console-roteirizado.ts';
import { instalacaoNoLinuxDeExemplo } from '../../test/instalacao-no-linux.ts';
import type { BackupDoServidor, BackupPronto } from '../backup.ts';
import { prepararTeste } from '../preparar-teste.ts';
import { restaurarProducao } from '../restaurar.ts';
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

const NOME = '2026-10-23T0500Z';

/** Um backup pronto da produção no destino da instalação, com uma foto nos arquivos. */
async function backupDaProducao(): Promise<BackupPronto> {
  const pasta = join(raiz, 'backups', 'grafite-producao', NOME);
  const arquivos = join(fora, 'arquivos-da-producao');
  await mkdir(join(arquivos, 'fotos'), { recursive: true });
  await writeFile(join(arquivos, 'fotos', 'retrato.webp'), 'a foto da produção');
  await mkdir(pasta, { recursive: true });
  await zipar(arquivos, join(pasta, 'arquivos.zip'));
  await writeFile(join(pasta, 'banco.dump'), 'o dump');
  return { nome: NOME, pasta, criadoEm: new Date('2026-10-23T05:00:00.000Z') };
}

/** O backup do servidor simulado, com o backup pronto e o manifesto sem linhas. */
function backupSimulado(eventos: string[], pronto: BackupPronto): BackupDoServidor {
  const manifesto = {
    versao: '1.4.0',
    migracoes: [],
    criadoEm: pronto.criadoEm.toISOString(),
    linhas: {},
    partes: {},
  } as unknown as Awaited<ReturnType<BackupDoServidor['conferir']>>;
  return {
    async conferir(pasta) {
      eventos.push(`conferir ${pasta === pronto.pasta ? NOME : pasta}`);
      return manifesto;
    },
    maisNovo: async () => pronto,
    fazer: async () => pronto,
    listar: async () => [],
    testar: async () => ({ backup: NOME, detalhes: { tabelas: 0, linhas: 0, arquivos: 0 } }),
    registros: async () => ({ ultimoBackup: null, ultimoTeste: null }),
  };
}

/** As permissões simuladas: guardam o dono pedido para cada caminho. */
function permissoesSimuladas() {
  const donos: string[] = [];
  return {
    donos,
    permissoes: {
      dono: async (caminho: string, uid: number, gid: number) => {
        donos.push(`${caminho} ${uid}:${gid}`);
      },
      modo: async () => {},
    },
  };
}

describe('sudo grafite preparar-teste', () => {
  it('Teste preparado: a cópia vai ao banco do teste pela rede interna, e os arquivos, ao usuário dos contêineres', async () => {
    const { servidor } = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const pronto = await backupDaProducao();
    const { donos, permissoes } = permissoesSimuladas();
    const roteiro = consoleRoteirizado('grafite_teste');

    await prepararTeste({
      raiz,
      console: roteiro.console,
      executar: servidor.executar,
      ferramentas: () => servidor.ferramentas,
      servicos: servidor.servicos,
      saude: servidor.saude,
      backup: () => backupSimulado(servidor.eventos, pronto),
      plataforma: plataformaDoLinux({ executar: servidor.executar, permissoes }),
      agora: () => new Date('2026-10-23T10:00:00.000Z'),
    });

    expect(servidor.eventos).toEqual([
      `conferir ${NOME}`,
      'stop app-teste',
      'psql banco-teste -- O banco novo da cópia, grafite_teste_preparando.',
      'pg_restore banco-teste',
      'psql banco-teste -- A troca do banco grafite_teste pela cópia.',
      'psql banco-teste -- Os papéis e o banco do Grafite (grafite instalar). Pode rodar de novo: acerta o que existe.',
      'psql banco-teste -- A troca dos endereços da cópia da produção pelos do teste (grafite preparar-teste).',
      'migrar banco-teste 1.4.0',
      'up app-teste 1.4.0',
      'saúde app-teste',
    ]);
    const arquivos = join(raiz, 'teste', 'arquivos');
    expect(await readFile(join(arquivos, 'fotos', 'retrato.webp'), 'utf8')).toBe(
      'a foto da produção',
    );
    expect(donos).toEqual([
      `${arquivos} 1000:1000`,
      `${join(arquivos, 'fotos')} 1000:1000`,
      `${join(arquivos, 'fotos', 'retrato.webp')} 1000:1000`,
    ]);
    expect(roteiro.escritos).toContain(
      `O teste tem a cópia da produção do backup ${NOME}, com a versão 1.4.0.`,
    );
  });
});

describe('sudo grafite restaurar --ambiente producao', () => {
  it('restaura pelo superusuário do contêiner da produção, sem pedir senha, e os arquivos vão ao usuário dos contêineres', async () => {
    const { servidor } = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const pronto = await backupDaProducao();
    const { donos, permissoes } = permissoesSimuladas();
    const roteiro = consoleRoteirizado('grafite');

    await restaurarProducao({
      raiz,
      backup: NOME,
      console: roteiro.console,
      executar: servidor.executar,
      ferramentas: () => servidor.ferramentas,
      servicos: servidor.servicos,
      saude: servidor.saude,
      backupDoServidor: () => backupSimulado(servidor.eventos, pronto),
      plataforma: plataformaDoLinux({ executar: servidor.executar, permissoes }),
      agora: () => new Date('2026-10-23T10:00:00.000Z'),
    });

    // Só o nome do banco é pedido: a senha do superusuário é a do banco.env da produção.
    expect(roteiro.perguntas).toEqual([
      `Para restaurar a produção a partir do backup ${NOME}, digite o nome do banco da produção`,
    ]);
    expect(servidor.eventos).toEqual([
      `conferir ${NOME}`,
      'stop coletor',
      'stop app-producao',
      'psql banco-producao -- O banco novo da cópia, grafite_restaurando.',
      'pg_restore banco-producao',
      'psql banco-producao -- As linhas de cada tabela do banco grafite_restaurando.',
      'migrar banco-producao 1.4.0',
      'psql banco-producao -- A troca do banco grafite pelo grafite_restaurando, com o de antes guardado como grafite_antes_202610231000.',
      'psql banco-producao -- Os papéis e o banco do Grafite (grafite instalar). Pode rodar de novo: acerta o que existe.',
      'up app-producao 1.4.0',
      'saúde app-producao',
      'up coletor 1.4.0',
    ]);
    const arquivos = join(raiz, 'producao', 'arquivos');
    expect(await readFile(join(arquivos, 'fotos', 'retrato.webp'), 'utf8')).toBe(
      'a foto da produção',
    );
    expect(donos).toContain(`${join(arquivos, 'fotos', 'retrato.webp')} 1000:1000`);
    expect(roteiro.escritos.join('\n')).toContain(
      'apague os dois como diz "Depois da restauração" no runbook (docs/operacao/runbook.md).',
    );
  });
});
