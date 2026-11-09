// O teste com a cópia da produção (spec operacao-servicos, "Teste com a cópia da produção"; design do
// F2d, decisão 8; foco 5 da revisão), sobre uma instalação da 0.4.0 no servidor simulado. O SQL da
// cópia e da troca dos endereços é provado no PostgreSQL de verdade (copia.int.test.ts).
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../test/console-roteirizado.ts';
import { instalacaoDeExemplo } from '../test/instalacao-de-exemplo.ts';
import type { ChamadaDaFerramenta } from '../test/servidor-simulado.ts';
import { lerConfigEnv } from './configuracao.ts';
import { type DependenciasDaPreparacao, prepararTeste } from './preparar-teste.ts';
import { plataformaDoWindows } from './windows/plataforma.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-preparar-teste-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

type Instalacao = Awaited<ReturnType<typeof instalacaoDeExemplo>>;

const AGORA = new Date('2026-10-08T15:00:00.000Z');

function dependencias(
  { raiz, servidor }: Instalacao,
  console = consoleRoteirizado('grafite_teste').console,
): DependenciasDaPreparacao {
  return {
    raiz,
    console,
    executar: servidor.executar,
    ferramentas: servidor.ferramentas,
    servicos: servidor.servicos,
    saude: servidor.saude,
    backup: () => servidor.backup,
    plataforma: plataformaDoWindows({
      executar: servidor.executar,
      node: servidor.node,
      juncoes: servidor.juncoes,
      ferramentas: servidor.ferramentas,
      atalhoDoMenu: servidor.atalhoDoMenu,
    }),
    agora: () => AGORA,
  };
}

/** Anota as chamadas do psql e responde a troca dos endereços com as linhas dadas. */
function psqlComATroca(instalacao: Instalacao, linhas: string[] = []) {
  const chamadas: ChamadaDaFerramenta[] = [];
  instalacao.servidor.opcoes.psql = (chamada) => {
    chamadas.push(chamada);
    if (!chamada.argumentos.includes('--record-separator-zero')) return undefined;
    return { saida: linhas.map((linha) => `${linha}\0`).join('') };
  };
  return chamadas;
}

describe('grafite preparar-teste', () => {
  it('com o backup das últimas 24 h, confere-o, pede o nome do banco do teste e restaura a cópia no teste, na ordem', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const backup = await instalacao.servidor.gravarBackup(new Date('2026-10-08T03:00:00.000Z'));
    await mkdir(instalacao.pastas.teste.arquivos, { recursive: true });
    await writeFile(join(instalacao.pastas.teste.arquivos, 'de-antes.txt'), 'sai');
    const chamadas = psqlComATroca(instalacao);
    const roteiro = consoleRoteirizado('grafite_teste');

    await prepararTeste(dependencias(instalacao, roteiro.console));

    expect(instalacao.servidor.eventos).toEqual([
      // 1. O backup das últimas 24 h, conferido.
      'conferir backups/grafite-producao/2026-10-08T0300Z',
      // 3. Parar o app do teste.
      'parar grafite-teste',
      // 4. Restaurar o banco, num banco novo que substitui o do teste, e as permissões.
      'psql 5433 O banco novo da cópia, grafite_teste_preparando.',
      'pg_restore grafite_teste_preparando',
      'psql 5433 A troca do banco grafite_teste pela cópia.',
      'psql 5433 grafite_teste',
      // 5. Trocar os endereços pelo mapa.
      'psql 5433 consulta grafite_teste',
      // 6. As migrations da versão do teste, a partida e a saúde.
      'migrar grafite_teste com a 0.4.0',
      'iniciar grafite-teste',
      'saúde 3001',
    ]);
    expect(roteiro.perguntas).toEqual([
      'Para trocar os dados do teste pela cópia da produção, digite o nome do banco do teste',
    ]);
    // O dump do backup, com o superusuário da instância do teste, que vem da configuração da produção.
    const restauracao = instalacao.servidor.argumentos.find(
      ([ferramenta]) => ferramenta === 'pg_restore',
    );
    expect(restauracao?.at(-1)).toBe(join(backup.pasta, 'banco.dump'));
    const { GRAFITE_RESTAURACAO_URL = '' } = await lerConfigEnv(
      instalacao.pastas.producao.configEnv,
    );
    const senha = decodeURIComponent(new URL(GRAFITE_RESTAURACAO_URL).password);
    expect(chamadas.length).toBeGreaterThan(0);
    // A troca leva o mapa do operacao.json.
    const troca = chamadas.find((c) => c.argumentos.includes('--record-separator-zero'));
    expect(troca?.entrada).toContain(
      "INSERT INTO mapa (de, para) VALUES ('grafite.empresa.com.br', 'grafite-teste.empresa.com.br');",
    );
    expect(senha).not.toBe('');
    expect(troca?.senha).toBe(senha);
    // Os arquivos do backup no lugar dos do teste.
    expect(await readdir(instalacao.pastas.teste.arquivos)).toEqual(['fotos']);
    expect(
      await readFile(join(instalacao.pastas.teste.arquivos, 'fotos', 'ana.webp'), 'utf8'),
    ).toBe('a foto da Ana');
    expect(roteiro.escritos.at(-1)).toBe(
      'O teste tem a cópia da produção do backup 2026-10-08T0300Z, com a versão 0.4.0.',
    );
  });

  it('sem backup das últimas 24 h, faz um', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    await instalacao.servidor.gravarBackup(new Date('2026-10-06T03:00:00.000Z'));
    psqlComATroca(instalacao);
    const roteiro = consoleRoteirizado('grafite_teste');
    await prepararTeste(dependencias(instalacao, roteiro.console));
    expect(instalacao.servidor.eventos.slice(0, 2)).toEqual([
      'backup da produção',
      'parar grafite-teste',
    ]);
    expect(roteiro.escritos).toContain(
      'Não há backup da produção das últimas 24 h: fazendo um agora.',
    );
  });

  it('avisa a organização que ficou sem endereço e o endereço do mapa que não existe, sem falhar', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    await instalacao.servidor.gravarBackup(new Date('2026-10-08T03:00:00.000Z'));
    psqlComATroca(instalacao, ["sem-endereco:Cliente d'Ávila", 'ausente:grafite.antigo.com.br']);
    const roteiro = consoleRoteirizado('grafite_teste');
    await prepararTeste(dependencias(instalacao, roteiro.console));
    expect(roteiro.escritos).toContain(
      "A organização Cliente d'Ávila ficou sem endereço no teste: nenhum endereço dela está no mapa do teste (operacao.json).",
    );
    expect(roteiro.escritos).toContain(
      'O endereço grafite.antigo.com.br do mapa do teste não é de nenhuma organização da produção.',
    );
    expect(instalacao.servidor.estados.get('grafite-teste')).toBe('rodando');
  });

  it('o nome do banco errado para sem mudar nada', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    await instalacao.servidor.gravarBackup(new Date('2026-10-08T03:00:00.000Z'));
    await mkdir(instalacao.pastas.teste.arquivos, { recursive: true });
    await writeFile(join(instalacao.pastas.teste.arquivos, 'de-antes.txt'), 'fica');
    await expect(
      prepararTeste(dependencias(instalacao, consoleRoteirizado('grafite').console)),
    ).rejects.toThrow('O texto digitado não confere com grafite_teste. Nada foi feito.');
    expect(instalacao.servidor.eventos).toEqual([
      'conferir backups/grafite-producao/2026-10-08T0300Z',
    ]);
    expect(await readdir(instalacao.pastas.teste.arquivos)).toEqual(['de-antes.txt']);
    expect(instalacao.servidor.estados.get('grafite-teste')).toBe('rodando');
  });

  it('uma falha depois da parada deixa o app do teste parado, com o erro e o runbook', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    await instalacao.servidor.gravarBackup(new Date('2026-10-08T03:00:00.000Z'));
    psqlComATroca(instalacao);
    instalacao.servidor.opcoes.migracaoFalhaNo = 'grafite_teste';
    await expect(prepararTeste(dependencias(instalacao))).rejects.toThrow(
      [
        'As migrations da versão 0.4.0 falharam: error: relation "x" does not exist',
        'O app do teste ficou parado. Veja "Preparação do teste que falhou" no runbook (docs\\operacao\\runbook.md).',
      ].join('\n'),
    );
    expect(instalacao.servidor.estados.get('grafite-teste')).toBe('parado');
  });
});
