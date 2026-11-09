// A troca da chave mestra do cofre pelo comando no servidor (spec operacao-servicos, "Troca da chave
// do cofre"; design do P6, decisão 10), sobre uma instalação no servidor simulado: a chave nova e a
// anterior nos dois config.env, o reinício, o comando da API nos dois ambientes, a retirada da
// anterior e o reinício de novo; a falha no meio deixa as duas chaves.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../test/console-roteirizado.ts';
import { instalacaoDeExemplo } from '../test/instalacao-de-exemplo.ts';
import { trocarChaveDoCofre } from './cofre.ts';
import { AJUDA } from './comando.ts';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import { vejaNoRunbook } from './falhas.ts';
import { plataformaDoWindows } from './windows/plataforma.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-cofre-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

type Instalacao = Awaited<ReturnType<typeof instalacaoDeExemplo>>;

const NOVA = 'Q2hhdmUtbm92YS1kby1jb2ZyZS1wYXJhLWEtdHJvY2E=';

function dependencias(
  { raiz, servidor }: Instalacao,
  { console = consoleRoteirizado().console, gerarChave = () => NOVA } = {},
) {
  return {
    raiz,
    console,
    executar: servidor.executar,
    servicos: servidor.servicos,
    saude: servidor.saude,
    plataforma: plataformaDoWindows({
      executar: servidor.executar,
      node: servidor.node,
      juncoes: servidor.juncoes,
      ferramentas: servidor.ferramentas,
      atalhoDoMenu: servidor.atalhoDoMenu,
    }),
    gerarChave,
  };
}

const chavesDe = async (configEnv: string) => {
  const variaveis = await lerConfigEnv(configEnv);
  return {
    atual: variaveis.GRAFITE_CHAVE_DO_COFRE,
    anterior: variaveis.GRAFITE_CHAVE_DO_COFRE_ANTERIOR,
  };
};

const REINICIO = [
  'parar grafite-coletor',
  'parar grafite',
  'iniciar grafite',
  'saúde 3000',
  'iniciar grafite-coletor',
  'parar grafite-teste',
  'iniciar grafite-teste',
  'saúde 3001',
];

describe('grafite cofre trocar-chave', () => {
  it('põe a nova e a anterior, reinicia, recifra nos dois ambientes, tira a anterior e reinicia', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { producao, teste } = instalacao.pastas;
    const { atual: velha } = await chavesDe(producao.configEnv);
    const roteiro = consoleRoteirizado('grafite');

    await trocarChaveDoCofre(dependencias(instalacao, { console: roteiro.console }));

    expect(instalacao.servidor.eventos).toEqual([
      'acl producao/config.env',
      'acl teste/config.env',
      ...REINICIO,
      'api grafite cofre trocar-chave [com a chave anterior]',
      'api grafite_teste cofre trocar-chave [com a chave anterior]',
      'acl producao/config.env',
      'acl teste/config.env',
      ...REINICIO,
    ]);
    for (const configEnv of [producao.configEnv, teste.configEnv]) {
      expect(await chavesDe(configEnv)).toEqual({ atual: NOVA, anterior: undefined });
    }
    expect(roteiro.escritos).toContain(
      'Organização "Empresa": 3 segredos passaram para a chave nova.',
    );
    expect(roteiro.escritos.at(-1)).toBe(
      'A chave do cofre foi trocada nos dois ambientes. Atualize a cópia dos config.env guardada fora do servidor e mantenha a de antes da troca, com a chave anterior, junto dos backups feitos até hoje: só ela abre os segredos deles (runbook, "Guarda das chaves").',
    );
    const escrito = roteiro.escritos.join('\n');
    expect(escrito).not.toContain(NOVA);
    expect(escrito).not.toContain(velha ?? '-');
  });

  it('a falha no meio deixa as duas chaves, que a API aceita, e aponta o runbook', async () => {
    const instalacao = await instalacaoDeExemplo(pasta, { trocaDaChaveFalhaNo: 'grafite_teste' });
    const { producao, teste } = instalacao.pastas;
    const { atual: velha } = await chavesDe(producao.configEnv);

    await expect(
      trocarChaveDoCofre(
        dependencias(instalacao, { console: consoleRoteirizado('grafite').console }),
      ),
    ).rejects.toThrow(
      `O comando da API não terminou a troca no teste: não foi possível ler os segredos. As duas chaves ficaram na configuração, e a API aceita as duas: rode grafite cofre trocar-chave de novo. ${vejaNoRunbook('Troca da chave do cofre')}`,
    );
    for (const configEnv of [producao.configEnv, teste.configEnv]) {
      expect(await chavesDe(configEnv)).toEqual({ atual: NOVA, anterior: velha });
    }
  });

  it('rodado de novo depois da falha, continua a troca sem gerar outra chave', async () => {
    const instalacao = await instalacaoDeExemplo(pasta, { trocaDaChaveFalhaNo: 'grafite_teste' });
    const { producao } = instalacao.pastas;
    await expect(
      trocarChaveDoCofre(
        dependencias(instalacao, { console: consoleRoteirizado('grafite').console }),
      ),
    ).rejects.toThrow();
    instalacao.servidor.eventos.length = 0;
    const roteiro = consoleRoteirizado('grafite');

    await trocarChaveDoCofre(
      dependencias(instalacao, {
        console: roteiro.console,
        gerarChave: () => {
          throw new Error('Não deveria gerar outra chave.');
        },
      }),
    );

    expect(roteiro.escritos[0]).toBe(
      'A troca anterior não terminou: a configuração já tem a chave nova e a anterior. A troca continua com elas.',
    );
    expect(await chavesDe(producao.configEnv)).toEqual({ atual: NOVA, anterior: undefined });
    expect(instalacao.servidor.eventos).toContain(
      'api grafite_teste cofre trocar-chave [com a chave anterior]',
    );
  });

  it('sem a chave do cofre na configuração, recusa antes de mudar qualquer coisa', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { producao } = instalacao.pastas;
    const { GRAFITE_CHAVE_DO_COFRE: _, ...semChave } = await lerConfigEnv(producao.configEnv);
    await writeFile(producao.configEnv, gerarConfigEnv(semChave));

    await expect(trocarChaveDoCofre(dependencias(instalacao))).rejects.toThrow(
      `Falta GRAFITE_CHAVE_DO_COFRE em ${producao.configEnv}: a atualização do teste grava a chave do cofre nos dois ambientes.`,
    );
    expect(instalacao.servidor.eventos).toEqual([]);
  });

  it('Troca sem a confirmação: recusa sem gerar nem gravar nenhuma chave', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { producao, teste } = instalacao.pastas;
    const antes = [await chavesDe(producao.configEnv), await chavesDe(teste.configEnv)];
    const roteiro = consoleRoteirizado('grafite_teste');

    await expect(
      trocarChaveDoCofre(
        dependencias(instalacao, {
          console: roteiro.console,
          gerarChave: () => {
            throw new Error('Não deveria gerar a chave.');
          },
        }),
      ),
    ).rejects.toThrow('O texto digitado não confere com grafite. Nada foi feito.');

    expect(roteiro.perguntas).toEqual([
      'Para trocar a chave do cofre nos dois ambientes, digite o nome do banco da produção',
    ]);
    expect([await chavesDe(producao.configEnv), await chavesDe(teste.configEnv)]).toEqual(antes);
    expect(instalacao.servidor.eventos).toEqual([]);
  });

  it('a ajuda explica a troca', () => {
    expect(AJUDA).toContain('  cofre trocar-chave');
  });
});
