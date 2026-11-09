// A atualização do teste (spec operacao-servicos, "Atualização pelo teste antes da produção"; design
// do F2d, decisão 7), sobre uma instalação da 0.4.0 no servidor simulado.
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../test/console-roteirizado.ts';
import { instalacaoDeExemplo } from '../test/instalacao-de-exemplo.ts';
import { existe, pacoteDeExemplo } from '../test/servidor-simulado.ts';
import { atualizarTeste, type DependenciasDaAtualizacao } from './atualizar.ts';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import { lerEstado } from './estado.ts';
import { plataformaDoWindows } from './windows/plataforma.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-atualizar-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

type Instalacao = Awaited<ReturnType<typeof instalacaoDeExemplo>>;

function dependencias(
  { raiz, servidor }: Instalacao,
  zip: string,
  console = consoleRoteirizado().console,
): DependenciasDaAtualizacao {
  return {
    raiz,
    pacote: zip,
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
    gerarChave: servidor.gerarChave,
    gerarChavesDoPush: servidor.gerarChavesDoPush,
  };
}

describe('grafite atualizar --ambiente teste', () => {
  it('desempacota a versão e, no teste, para, migra, troca atual e anterior, inicia e confere a saúde', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const roteiro = consoleRoteirizado();
    await atualizarTeste(
      dependencias(instalacao, await pacoteDeExemplo(pasta, '0.5.0'), roteiro.console),
    );

    expect(instalacao.servidor.eventos).toEqual([
      'junção versoes/0.5.0/node_modules/@grafite/db → versoes/0.5.0/packages/db',
      'parar grafite-teste',
      'migrar grafite_teste com a 0.5.0',
      'junção teste/anterior → versoes/0.4.0',
      'junção teste/atual → versoes/0.5.0',
      'iniciar grafite-teste',
      'saúde 3001',
    ]);
    const estado = await lerEstado(instalacao.raiz);
    expect(estado?.ambientes.teste).toMatchObject({ atual: '0.5.0', anterior: '0.4.0' });
    expect(estado?.ambientes.producao).toMatchObject({ atual: '0.4.0', anterior: null });
    expect(estado?.versoes).toEqual(['0.4.0', '0.5.0']);
    expect(await instalacao.servidor.juncoes.ler(instalacao.pastas.producao.atual)).toBe(
      join(instalacao.pastas.versoes, '0.4.0'),
    );
    expect(roteiro.escritos.at(-1)).toBe(
      'O teste roda a versão 0.5.0. Para levá-la à produção: grafite atualizar <zip> --ambiente producao.',
    );
  });

  it('completa a chave do cofre nos dois config.env antes de iniciar o teste, uma vez só', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { producao, teste } = instalacao.pastas;
    // Uma instalação de antes do cofre: nenhum dos dois ambientes tem a chave.
    for (const configEnv of [producao.configEnv, teste.configEnv]) {
      const { GRAFITE_CHAVE_DO_COFRE: _, ...resto } = await lerConfigEnv(configEnv);
      await writeFile(configEnv, gerarConfigEnv(resto));
    }
    const zip = await pacoteDeExemplo(pasta, '0.5.0');
    const roteiro = consoleRoteirizado();
    const dep = dependencias(instalacao, zip, roteiro.console);
    let chaveAoIniciar: string | undefined;
    const servicos = {
      ...dep.servicos,
      iniciar: async (id: string) => {
        if (id === 'grafite-teste') {
          chaveAoIniciar = (await lerConfigEnv(teste.configEnv)).GRAFITE_CHAVE_DO_COFRE;
        }
        await dep.servicos.iniciar(id);
      },
    };
    await atualizarTeste({ ...dep, servicos, gerarChave: () => 'chave-do-cofre-gerada' });

    expect(chaveAoIniciar).toBe('chave-do-cofre-gerada');
    expect((await lerConfigEnv(producao.configEnv)).GRAFITE_CHAVE_DO_COFRE).toBe(
      'chave-do-cofre-gerada',
    );
    expect(roteiro.escritos).toContain(
      'A chave mestra do cofre foi gerada e gravada na configuração da produção e do teste. Guarde-a fora do servidor, com a chave dos dois passos (runbook, "Guarda das chaves").',
    );
    expect(roteiro.escritos.join('\n')).not.toContain('chave-do-cofre-gerada');

    const deNovo = consoleRoteirizado();
    await atualizarTeste({
      ...dependencias(instalacao, zip, deNovo.console),
      gerarChave: () => 'outra-chave',
    });
    expect((await lerConfigEnv(teste.configEnv)).GRAFITE_CHAVE_DO_COFRE).toBe(
      'chave-do-cofre-gerada',
    );
    expect(deNovo.escritos.join('\n')).not.toContain('chave mestra do cofre foi gerada');
  });

  it('o pacote com o hash errado não muda nada', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const zip = await pacoteDeExemplo(pasta, '0.5.0');
    await writeFile(`${zip}.sha256`, '0'.repeat(64));
    await expect(atualizarTeste(dependencias(instalacao, zip))).rejects.toThrow(
      'O pacote grafite-0.5.0-windows-x64.zip não confere com o hash publicado. Nada foi mudado: baixe o pacote e o .sha256 de novo.',
    );
    expect(instalacao.servidor.eventos).toEqual([]);
    expect(await readdir(instalacao.pastas.versoes)).toEqual(['0.4.0']);
    expect((await lerEstado(instalacao.raiz))?.ambientes.teste.atual).toBe('0.4.0');
  });

  it('a mesma versão já desempacotada não desempacota de novo, e atualizar de novo não perde a anterior', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const zip = await pacoteDeExemplo(pasta, '0.5.0');
    await atualizarTeste(dependencias(instalacao, zip));
    const marca = join(instalacao.pastas.versoes, '0.5.0', 'marca-do-teste.txt');
    await writeFile(marca, 'fica');
    await rm(join(instalacao.pastas.versoes, '0.5.0', 'grafite.ps1'));

    instalacao.servidor.eventos.length = 0;
    const roteiro = consoleRoteirizado();
    await atualizarTeste(dependencias(instalacao, zip, roteiro.console));

    expect(await existe(marca)).toBe(true);
    expect(await existe(join(instalacao.pastas.versoes, '0.5.0', 'grafite.ps1'))).toBe(false);
    expect(roteiro.escritos[0]).toBe(
      `A versão 0.5.0 já estava desempacotada em ${join(instalacao.pastas.versoes, '0.5.0')}.`,
    );
    expect((await lerEstado(instalacao.raiz))?.ambientes.teste).toMatchObject({
      atual: '0.5.0',
      anterior: '0.4.0',
    });
    expect(instalacao.servidor.eventos).not.toContain('junção teste/anterior → versoes/0.5.0');
  });

  it('a migration que falha deixa o app do teste parado, na versão de antes, com o erro e o runbook', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    instalacao.servidor.opcoes.migracaoFalhaNo = 'grafite_teste';
    await expect(
      atualizarTeste(dependencias(instalacao, await pacoteDeExemplo(pasta, '0.5.0'))),
    ).rejects.toThrow(
      [
        'As migrations da versão 0.5.0 falharam: error: relation "x" does not exist',
        'O app do teste ficou parado. Veja "Atualização que falhou" no runbook (docs\\operacao\\runbook.md).',
      ].join('\n'),
    );
    expect(instalacao.servidor.estados.get('grafite-teste')).toBe('parado');
    expect((await lerEstado(instalacao.raiz))?.ambientes.teste).toMatchObject({
      atual: '0.4.0',
      anterior: null,
    });
    expect(await instalacao.servidor.juncoes.ler(instalacao.pastas.teste.atual)).toBe(
      join(instalacao.pastas.versoes, '0.4.0'),
    );
  });

  it('a saúde que não confere para o app de novo', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    instalacao.servidor.opcoes.versaoNaSaude = { 3001: '0.4.0' };
    await expect(
      atualizarTeste(dependencias(instalacao, await pacoteDeExemplo(pasta, '0.5.0'))),
    ).rejects.toThrow('O app do teste respondeu a versão 0.4.0, e a esperada é a 0.5.0.');
    expect(instalacao.servidor.eventos.slice(-3)).toEqual([
      'iniciar grafite-teste',
      'saúde 3001',
      'parar grafite-teste',
    ]);
    expect(instalacao.servidor.estados.get('grafite-teste')).toBe('parado');
  });

  it('recusa a raiz sem instalação, ou com a instalação por terminar', async () => {
    const zip = await pacoteDeExemplo(pasta, '0.5.0');
    const instalacao = await instalacaoDeExemplo(pasta);
    const semInstalacao = { ...instalacao, raiz: join(pasta, 'Outra') };
    await expect(atualizarTeste(dependencias(semInstalacao, zip))).rejects.toThrow(
      `O Grafite não está instalado em ${join(pasta, 'Outra')}: rode grafite instalar primeiro.`,
    );
    await writeFile(instalacao.pastas.instalacao, '{}');
    await expect(atualizarTeste(dependencias(instalacao, zip))).rejects.toThrow(
      `A instalação em ${instalacao.raiz} não terminou: rode grafite instalar de novo para retomá-la.`,
    );
  });
});
