// A restauração da produção (spec backup, "Restauração da produção"; design do F2d, decisão 16), sobre
// uma instalação da 0.4.0 no servidor simulado. O SQL da troca dos bancos e da contagem das linhas é
// provado no PostgreSQL de verdade (copia.int.test.ts).
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../test/console-roteirizado.ts';
import { instalacaoDeExemplo } from '../test/instalacao-de-exemplo.ts';
import { type DependenciasDaRestauracao, restaurarProducao } from './restaurar.ts';
import { plataformaDoWindows } from './windows/plataforma.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-restaurar-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

type Instalacao = Awaited<ReturnType<typeof instalacaoDeExemplo>>;

const SENHA = 'senha-do-postgres-da-producao';

function dependencias(
  { raiz, servidor }: Instalacao,
  backup: string,
  console = consoleRoteirizado(SENHA, 'grafite').console,
): DependenciasDaRestauracao {
  return {
    raiz,
    backup,
    console,
    executar: servidor.executar,
    ferramentas: servidor.ferramentas,
    servicos: servidor.servicos,
    saude: servidor.saude,
    backupDoServidor: () => servidor.backup,
    plataforma: plataformaDoWindows({
      executar: servidor.executar,
      node: servidor.node,
      juncoes: servidor.juncoes,
      ferramentas: servidor.ferramentas,
      atalhoDoMenu: servidor.atalhoDoMenu,
    }),
    agora: () => new Date('2026-10-08T15:00:00.000Z'),
  };
}

/** A instalação com um backup de ontem e um arquivo na pasta dos arquivos da produção. */
async function comBackupDeOntem() {
  const instalacao = await instalacaoDeExemplo(pasta);
  const backup = await instalacao.servidor.gravarBackup(new Date('2026-10-07T05:00:00.000Z'));
  await mkdir(instalacao.pastas.producao.arquivos, { recursive: true });
  await writeFile(join(instalacao.pastas.producao.arquivos, 'de-hoje.webp'), 'a foto de hoje');
  return { instalacao, backup };
}

const RUNBOOK = 'Veja "Restauração que falhou" no runbook (docs\\operacao\\runbook.md).';

describe('grafite restaurar --ambiente producao', () => {
  it('confere o backup, pede a senha e o nome do banco, e troca o banco e os arquivos guardando os de antes', async () => {
    const { instalacao, backup } = await comBackupDeOntem();
    const roteiro = consoleRoteirizado(SENHA, 'grafite');

    await restaurarProducao(dependencias(instalacao, backup.pasta, roteiro.console));

    expect(instalacao.servidor.eventos).toEqual([
      // 1. Os hashes do backup, a senha do postgres e o nome do banco.
      'conferir backups/grafite-producao/2026-10-07T0500Z',
      'psql 5432 versão',
      // 2. Parar o coletor e o app.
      'parar grafite-coletor',
      'parar grafite',
      // 3 e 4. Restaurar num banco novo, conferir as linhas e trazê-lo à versão em uso.
      'psql 5432 O banco novo da cópia, grafite_restaurando.',
      'pg_restore grafite_restaurando',
      'psql 5432 consulta grafite_restaurando',
      'migrar grafite_restaurando com a 0.4.0',
      // O banco de antes é guardado com outro nome, e o restaurado fica no lugar dele.
      'psql 5432 A troca do banco grafite pelo grafite_restaurando, com o de antes guardado como grafite_antes_202610081500.',
      'psql 5432 grafite',
      // 6. Iniciar e conferir a saúde.
      'iniciar grafite',
      'saúde 3000',
      'iniciar grafite-coletor',
    ]);
    expect(roteiro.perguntas).toEqual([
      'Senha do usuário postgres do PostgreSQL da produção',
      'Para restaurar a produção a partir do backup 2026-10-07T0500Z, digite o nome do banco da produção',
    ]);
    // 5. Os arquivos do backup no lugar, e os de antes guardados.
    const { arquivos } = instalacao.pastas.producao;
    expect(await readdir(arquivos)).toEqual(['fotos']);
    expect(await readFile(join(`${arquivos}-antes-202610081500`, 'de-hoje.webp'), 'utf8')).toBe(
      'a foto de hoje',
    );
    expect(roteiro.escritos.slice(-2)).toEqual([
      'A produção foi restaurada do backup 2026-10-07T0500Z.',
      `O banco de antes ficou como grafite_antes_202610081500, e os arquivos de antes, em ${arquivos}-antes-202610081500. Confira a produção e apague os dois como diz "Depois da restauração" no runbook (docs\\operacao\\runbook.md).`,
    ]);
  });

  it('aceita o backup pelo nome, no primeiro destino', async () => {
    const { instalacao } = await comBackupDeOntem();
    await restaurarProducao(dependencias(instalacao, '2026-10-07T0500Z'));
    expect(instalacao.servidor.eventos[0]).toBe(
      'conferir backups/grafite-producao/2026-10-07T0500Z',
    );
  });

  it('o backup com o hash errado não muda nada', async () => {
    const { instalacao, backup } = await comBackupDeOntem();
    instalacao.servidor.opcoes.backupCorrompido = true;
    await expect(restaurarProducao(dependencias(instalacao, backup.pasta))).rejects.toThrow(
      'não passou na conferência: A parte banco.dump não confere com o hash do manifesto.',
    );
    expect(instalacao.servidor.eventos).toEqual([
      'conferir backups/grafite-producao/2026-10-07T0500Z',
    ]);
    expect(instalacao.servidor.estados.get('grafite')).toBe('rodando');
  });

  it('o nome do banco errado para sem mudar nada', async () => {
    const { instalacao, backup } = await comBackupDeOntem();
    await expect(
      restaurarProducao(
        dependencias(instalacao, backup.pasta, consoleRoteirizado(SENHA, 'grafite_teste').console),
      ),
    ).rejects.toThrow('O texto digitado não confere com grafite. Nada foi feito.');
    expect(instalacao.servidor.eventos.filter((e) => e.startsWith('parar'))).toEqual([]);
  });

  it('uma falha na restauração deixa o banco antigo com o nome dele e os serviços parados', async () => {
    const { instalacao, backup } = await comBackupDeOntem();
    instalacao.servidor.opcoes.pgRestoreFalha = 'pg_restore: error: could not read input file';
    await expect(restaurarProducao(dependencias(instalacao, backup.pasta))).rejects.toThrow(
      [
        'O pg_restore falhou: pg_restore: error: could not read input file',
        'Nada foi trocado: o banco e os arquivos da produção continuam os de antes.',
        `O app e o coletor da produção ficaram parados. ${RUNBOOK}`,
      ].join('\n'),
    );
    expect(instalacao.servidor.eventos.some((e) => e.includes('A troca do banco'))).toBe(false);
    expect(instalacao.servidor.estados.get('grafite')).toBe('parado');
    expect(instalacao.servidor.estados.get('grafite-coletor')).toBe('parado');
    expect(await readdir(instalacao.pastas.producao.arquivos)).toEqual(['de-hoje.webp']);
  });

  it('as linhas que não batem com o manifesto param antes da troca', async () => {
    const { instalacao, backup } = await comBackupDeOntem();
    instalacao.servidor.opcoes.psql = ({ argumentos }) =>
      argumentos.includes('--record-separator-zero')
        ? { saida: 'public.organizacoes:2\0' }
        : undefined;
    await expect(restaurarProducao(dependencias(instalacao, backup.pasta))).rejects.toThrow(
      'As linhas restauradas não batem com o manifesto: public.organizacoes não está no manifesto.',
    );
    expect(instalacao.servidor.eventos.some((e) => e.includes('A troca do banco'))).toBe(false);
  });

  it('uma falha depois da troca a desfaz: o banco e os arquivos de antes voltam ao nome deles', async () => {
    const { instalacao, backup } = await comBackupDeOntem();
    instalacao.servidor.opcoes.servicoQueNaoSobe = 'grafite';
    await expect(restaurarProducao(dependencias(instalacao, backup.pasta))).rejects.toThrow(
      [
        'O serviço grafite não ficou rodando a tempo. Veja o log dele na pasta logs.',
        'A troca foi desfeita: o banco e os arquivos da produção voltaram a ser os de antes, e os restaurados ficaram como grafite_restaurado_202610081500.',
        `O app e o coletor da produção ficaram parados. ${RUNBOOK}`,
      ].join('\n'),
    );
    expect(instalacao.servidor.eventos).toContain(
      'psql 5432 A troca do banco grafite pelo grafite_antes_202610081500, com o de antes guardado como grafite_restaurado_202610081500.',
    );
    const { arquivos } = instalacao.pastas.producao;
    expect(await readdir(arquivos)).toEqual(['de-hoje.webp']);
    expect(await readdir(`${arquivos}-restaurados-202610081500`)).toEqual(['fotos']);
    expect(instalacao.servidor.estados.get('grafite')).toBe('parado');
  });
});
