// A atualização da produção pela guarda do teste e a volta à versão anterior (spec
// operacao-servicos; design do F2d, decisão 7), sobre uma instalação da 0.4.0 no servidor simulado.
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../test/console-roteirizado.ts';
import { instalacaoDeExemplo } from '../test/instalacao-de-exemplo.ts';
import { pacoteDeExemplo } from '../test/servidor-simulado.ts';
import {
  atualizarProducao,
  atualizarTeste,
  type DependenciasDaProducao,
  voltar,
} from './atualizar.ts';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import { lerEstado } from './estado.ts';
import { plataformaDoWindows } from './windows/plataforma.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-producao-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

type Instalacao = Awaited<ReturnType<typeof instalacaoDeExemplo>>;

function dependencias(
  { raiz, servidor }: Instalacao,
  zip: string,
  console = consoleRoteirizado().console,
): DependenciasDaProducao {
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
    ferramentas: servidor.ferramentas,
    backup: () => servidor.backup,
    gerarChave: servidor.gerarChave,
    gerarChavesDoPush: servidor.gerarChavesDoPush,
  };
}

/** A instalação da 0.4.0 com o teste já na 0.5.0, e o zip da 0.5.0. */
async function comOTesteNa050() {
  const instalacao = await instalacaoDeExemplo(pasta);
  const zip = await pacoteDeExemplo(pasta, '0.5.0');
  await atualizarTeste(dependencias(instalacao, zip));
  instalacao.servidor.eventos.length = 0;
  return { instalacao, zip };
}

const RUNBOOK = 'Veja "Atualização que falhou" no runbook (docs\\operacao\\runbook.md).';

describe('grafite atualizar --ambiente producao', () => {
  it('com a versão no teste, faz o backup conferido, pede o nome do banco e atualiza na ordem', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    const roteiro = consoleRoteirizado('grafite');
    await atualizarProducao(dependencias(instalacao, zip, roteiro.console));

    expect(instalacao.servidor.eventos).toEqual([
      // A guarda: o teste roda a versão, com saúde, e tem todas as migrations dela.
      'saúde 3001',
      'psql 5433 migrations de grafite_teste',
      'junção versoes/0.5.0/node_modules/@grafite/db → versoes/0.5.0/packages/db',
      // 1 e 2. O backup conferido e o nome digitado.
      'backup da produção',
      // 3. Parar o coletor e o app.
      'parar grafite-coletor',
      'parar grafite',
      // 4. Migrar e trocar as junções.
      'migrar grafite com a 0.5.0',
      'junção producao/anterior → versoes/0.4.0',
      'junção producao/atual → versoes/0.5.0',
      // 5. Iniciar o app, conferir a saúde, ligar o coletor à operadora e iniciá-lo.
      'iniciar grafite',
      'saúde 3000',
      'api grafite coletor criar --endereco grafite.empresa.com.br --nome Servidor --token-do-ambiente --se-nao-existir [GRAFITE_COLETOR_TOKEN no ambiente]',
      'iniciar grafite-coletor',
    ]);
    // A instalação já ligou o coletor: a atualização não cria outro.
    expect(roteiro.escritos).toContain(
      'O coletor "Servidor" já existe nesta organização; nada foi criado.',
    );
    expect(roteiro.perguntas).toEqual([
      'Para atualizar a produção para a 0.5.0, digite o nome do banco da produção',
    ]);
    const estado = await lerEstado(instalacao.raiz);
    expect(estado?.ambientes.producao).toMatchObject({ atual: '0.5.0', anterior: '0.4.0' });
    const pastaDoBackup = join(instalacao.raiz, 'backups', 'grafite-producao', '2026-10-08T1500Z');
    expect(roteiro.escritos).toContain(
      `Backup 2026-10-08T1500Z feito e conferido em ${pastaDoBackup}.`,
    );
    expect(roteiro.escritos.at(-1)).toBe(
      `A produção roda a versão 0.5.0. O backup de antes da atualização ficou em ${pastaDoBackup}.`,
    );
  });

  it('a produção de antes do push ganha as chaves, só ela, e a atualização seguinte não as troca', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    const { configEnv } = instalacao.pastas.producao;
    const {
      GRAFITE_PUSH_CHAVE_PUBLICA: _,
      GRAFITE_PUSH_CHAVE_PRIVADA: __,
      GRAFITE_PUSH_CONTATO: ___,
      ...deAntes
    } = await lerConfigEnv(configEnv);
    await writeFile(configEnv, gerarConfigEnv(deAntes));
    const roteiro = consoleRoteirizado('grafite');
    await atualizarProducao(dependencias(instalacao, zip, roteiro.console));

    const depois = await lerConfigEnv(configEnv);
    expect(depois).toMatchObject({
      GRAFITE_PUSH_CHAVE_PUBLICA: instalacao.servidor.gerarChavesDoPush().publica,
      GRAFITE_PUSH_CONTATO: 'https://grafite.empresa.com.br',
    });
    expect(roteiro.escritos).toContain(
      'As chaves do push foram geradas na configuração da produção: os avisos no celular já podem ser ligados nos Ajustes.',
    );
    expect(await lerConfigEnv(instalacao.pastas.teste.configEnv)).not.toHaveProperty(
      'GRAFITE_PUSH_CHAVE_PRIVADA',
    );
    // A gravação vem antes de o app da produção iniciar.
    expect(instalacao.servidor.eventos.indexOf('iniciar grafite')).toBeGreaterThan(-1);

    const zip060 = await pacoteDeExemplo(pasta, '0.6.0');
    await atualizarTeste(dependencias(instalacao, zip060));
    await atualizarProducao(
      dependencias(instalacao, zip060, consoleRoteirizado('grafite').console),
    );
    expect(await lerConfigEnv(configEnv)).toMatchObject({
      GRAFITE_PUSH_CHAVE_PUBLICA: depois.GRAFITE_PUSH_CHAVE_PUBLICA,
      GRAFITE_PUSH_CHAVE_PRIVADA: depois.GRAFITE_PUSH_CHAVE_PRIVADA,
    });
  });

  it('recusa a versão que não roda no teste, antes de mexer em qualquer coisa', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const zip = await pacoteDeExemplo(pasta, '0.5.0');
    await expect(atualizarProducao(dependencias(instalacao, zip))).rejects.toThrow(
      'A 0.5.0 precisa rodar no teste primeiro: o teste roda a 0.4.0. Rode antes grafite atualizar <zip> --ambiente teste.',
    );
    expect(instalacao.servidor.eventos).toEqual([]);
    expect(await readdir(instalacao.pastas.versoes)).toEqual(['0.4.0']);
  });

  it('recusa quando o teste não responde com saúde', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    instalacao.servidor.estados.set('grafite-teste', 'parado');
    await expect(atualizarProducao(dependencias(instalacao, zip))).rejects.toThrow(
      'A 0.5.0 precisa rodar no teste, com saúde, antes da produção: O app em 127.0.0.1:3001 não respondeu com saúde em 120 s: connect ECONNREFUSED.',
    );
    expect(instalacao.servidor.eventos).not.toContain('backup da produção');
  });

  it('recusa quando o banco do teste não tem todas as migrations da versão, pelo diário do pacote', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    instalacao.servidor.migrado.set('grafite_teste', '0.4.0');
    await expect(atualizarProducao(dependencias(instalacao, zip))).rejects.toThrow(
      'O banco do teste não tem todas as migrations da 0.5.0: falta 0002_migracao_2. Rode antes grafite atualizar <zip> --ambiente teste.',
    );
    expect(instalacao.servidor.eventos).not.toContain('backup da produção');
  });

  it('o nome do banco errado para sem mudar nada', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    await expect(
      atualizarProducao(dependencias(instalacao, zip, consoleRoteirizado('Grafite').console)),
    ).rejects.toThrow('O texto digitado não confere com grafite. Nada foi feito.');
    expect(instalacao.servidor.eventos.filter((e) => e.startsWith('parar'))).toEqual([]);
    expect((await lerEstado(instalacao.raiz))?.ambientes.producao.atual).toBe('0.4.0');
    expect(instalacao.servidor.estados.get('grafite')).toBe('rodando');
  });

  it('o backup que falha para antes de mudar a produção', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    instalacao.servidor.opcoes.backupFalha = 'O backup não chegou a todos os destinos.';
    await expect(
      atualizarProducao(dependencias(instalacao, zip, consoleRoteirizado('grafite').console)),
    ).rejects.toThrow('O backup não chegou a todos os destinos.');
    expect(instalacao.servidor.eventos.filter((e) => e.startsWith('parar'))).toEqual([]);
  });

  const falhas: [string, (instalacao: Instalacao, deps: DependenciasDaProducao) => void][] = [
    [
      'a migration',
      (i) => {
        i.servidor.opcoes.migracaoFalhaNo = 'grafite';
      },
    ],
    [
      'a troca das junções',
      (i, deps) => {
        const { juncoes } = i.servidor;
        deps.plataforma = plataformaDoWindows({
          executar: i.servidor.executar,
          node: i.servidor.node,
          ferramentas: i.servidor.ferramentas,
          atalhoDoMenu: i.servidor.atalhoDoMenu,
          juncoes: {
            ...juncoes,
            async apontar(juncao, alvo) {
              if (juncao === i.pastas.producao.atual) throw new Error('Acesso negado.');
              await juncoes.apontar(juncao, alvo);
            },
          },
        });
      },
    ],
    [
      'a partida do app',
      (i) => {
        i.servidor.opcoes.servicoQueNaoSobe = 'grafite';
      },
    ],
    [
      'a saúde do app',
      (i) => {
        i.servidor.opcoes.versaoNaSaude = { 3000: '0.4.0' };
      },
    ],
    [
      'a partida do coletor',
      (i) => {
        i.servidor.opcoes.servicoQueNaoSobe = 'grafite-coletor';
      },
    ],
  ];

  for (const [passo, preparar] of falhas) {
    it(`uma falha n${passo} deixa o app e o coletor parados, com o backup e o runbook`, async () => {
      const { instalacao, zip } = await comOTesteNa050();
      const deps = dependencias(instalacao, zip, consoleRoteirizado('grafite').console);
      preparar(instalacao, deps);
      const pastaDoBackup = join(
        instalacao.raiz,
        'backups',
        'grafite-producao',
        '2026-10-08T1500Z',
      );
      await expect(atualizarProducao(deps)).rejects.toThrow(
        `O app e o coletor da produção ficaram parados, e o backup de antes da atualização está em ${pastaDoBackup}. ${RUNBOOK}`,
      );
      expect(instalacao.servidor.estados.get('grafite')).toBe('parado');
      expect(instalacao.servidor.estados.get('grafite-coletor')).toBe('parado');
    });
  }
});

describe('a produção instalada antes do coletor', () => {
  it('ganha o "Servidor", com o token que o coletor já tinha, e o coletor.env ganha o endereço e a fila', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    const { pastas, servidor } = instalacao;
    // Como numa instalação de antes do coletor: sem o endereço e a pasta, e sem o coletor na API.
    const antes = await lerConfigEnv(pastas.coletorEnv);
    const { GRAFITE_COLETOR_ENDERECO: _, GRAFITE_COLETOR_PASTA: __, ...semEndereco } = antes;
    await writeFile(pastas.coletorEnv, gerarConfigEnv(semEndereco));
    await rm(pastas.filaDoColetor, { recursive: true, force: true });
    servidor.coletores.clear();

    const roteiro = consoleRoteirizado('grafite');
    await atualizarProducao(dependencias(instalacao, zip, roteiro.console));

    expect(await lerConfigEnv(pastas.coletorEnv)).toEqual(antes);
    expect(servidor.eventos).toEqual(
      expect.arrayContaining([
        'acl producao/coletor.env',
        'acl producao/coletor',
        'api grafite coletor criar --endereco grafite.empresa.com.br --nome Servidor --token-do-ambiente --se-nao-existir [GRAFITE_COLETOR_TOKEN no ambiente]',
      ]),
    );
    const ordem = (evento: string) => servidor.eventos.indexOf(evento);
    expect(ordem('acl producao/coletor')).toBeLessThan(ordem('iniciar grafite-coletor'));
    expect(servidor.coletores).toEqual(new Set([antes.GRAFITE_COLETOR_TOKEN]));
    expect(roteiro.escritos).toContain(
      'Coletor "Servidor" criado na organização do endereço grafite.empresa.com.br.',
    );
  });
});

describe('grafite voltar', () => {
  it('na produção, troca atual e anterior, sem migrations, e a saúde informa a versão de antes', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    await atualizarProducao(dependencias(instalacao, zip, consoleRoteirizado('grafite').console));
    instalacao.servidor.eventos.length = 0;
    const roteiro = consoleRoteirizado('grafite');

    await voltar(dependencias(instalacao, zip, roteiro.console), 'producao');

    expect(instalacao.servidor.eventos).toEqual([
      'parar grafite-coletor',
      'parar grafite',
      'junção producao/atual → versoes/0.4.0',
      'junção producao/anterior → versoes/0.5.0',
      'iniciar grafite',
      'saúde 3000',
      'iniciar grafite-coletor',
    ]);
    expect((await lerEstado(instalacao.raiz))?.ambientes.producao).toMatchObject({
      atual: '0.4.0',
      anterior: '0.5.0',
    });
    expect(roteiro.escritos.at(-1)).toBe(
      'A produção voltou à 0.4.0. Para ir de novo à 0.5.0: grafite voltar --ambiente producao.',
    );
  });

  it('na produção, devolve o Grafite.cmd da versão de antes, e a volta seguinte, o da nova', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    await atualizarProducao(dependencias(instalacao, zip, consoleRoteirizado('grafite').console));
    const versoes = join(instalacao.raiz, 'versoes');
    await writeFile(join(versoes, '0.4.0', 'Grafite.cmd'), '@echo off\r\nrem o menu\r\n');
    await writeFile(join(versoes, '0.5.0', 'Grafite.cmd'), '@echo off\r\nrem o painel\r\n');

    await voltar(dependencias(instalacao, zip, consoleRoteirizado('grafite').console), 'producao');
    expect(await readFile(join(instalacao.raiz, 'Grafite.cmd'), 'utf8')).toContain('rem o menu');

    await voltar(dependencias(instalacao, zip, consoleRoteirizado('grafite').console), 'producao');
    expect(await readFile(join(instalacao.raiz, 'Grafite.cmd'), 'utf8')).toContain('rem o painel');
  });

  it('Volta da produção sem a confirmação: recusa sem mudar nada', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    await atualizarProducao(dependencias(instalacao, zip, consoleRoteirizado('grafite').console));
    instalacao.servidor.eventos.length = 0;
    const roteiro = consoleRoteirizado('grafite_teste');

    await expect(
      voltar(dependencias(instalacao, zip, roteiro.console), 'producao'),
    ).rejects.toThrow('O texto digitado não confere com grafite. Nada foi feito.');

    expect(roteiro.perguntas).toEqual([
      'Para voltar a produção à 0.4.0, digite o nome do banco da produção',
    ]);
    expect(instalacao.servidor.eventos).toEqual([]);
    expect((await lerEstado(instalacao.raiz))?.ambientes.producao).toMatchObject({
      atual: '0.5.0',
      anterior: '0.4.0',
    });
  });

  it('no teste, só o app do teste', async () => {
    const { instalacao, zip } = await comOTesteNa050();
    await voltar(dependencias(instalacao, zip), 'teste');
    expect(instalacao.servidor.eventos).toEqual([
      'parar grafite-teste',
      'junção teste/atual → versoes/0.4.0',
      'junção teste/anterior → versoes/0.5.0',
      'iniciar grafite-teste',
      'saúde 3001',
    ]);
  });

  it('sem versão anterior, diz que não há e não para nada', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    await expect(voltar(dependencias(instalacao, ''), 'producao')).rejects.toThrow(
      'A produção não tem versão anterior: ela só existe depois de uma atualização.',
    );
    expect(instalacao.servidor.eventos).toEqual([]);
  });
});

// O atalho do menu na atualização da produção (change instalador-e-menu-da-operacao, design,
// decisão 6; spec operacao-servicos, "Atualização pelo teste antes da produção").
describe('o atalho do menu na atualização da produção', () => {
  /** A instalação de antes do menu: sem o Grafite.cmd, o ícone e o atalho. */
  async function deAntesDoMenu() {
    const { instalacao, zip } = await comOTesteNa050();
    instalacao.servidor.atalhosCriados.length = 0;
    await rm(join(instalacao.raiz, 'Grafite.cmd'));
    await rm(join(instalacao.raiz, 'grafite.ico'));
    return { instalacao, zip };
  }

  it('a produção de antes do menu ganha o Grafite.cmd, o ícone e o atalho, e a seguinte não cria outro (Produção de antes do menu)', async () => {
    const { instalacao, zip } = await deAntesDoMenu();
    const roteiro = consoleRoteirizado('grafite');

    await atualizarProducao(dependencias(instalacao, zip, roteiro.console));

    expect(await readFile(join(instalacao.raiz, 'Grafite.cmd'), 'utf8')).toBe('@echo off\r\n');
    expect(await readFile(join(instalacao.raiz, 'grafite.ico'), 'utf8')).toBe('ícone');
    expect(instalacao.servidor.atalhosCriados).toHaveLength(1);
    expect(roteiro.escritos).toContain(
      'O atalho "Grafite" da área de trabalho abre o painel da operação; o menu abre pelo grafite.ps1 menu.',
    );

    const seguinte = await pacoteDeExemplo(pasta, '0.6.0');
    await atualizarTeste(dependencias(instalacao, seguinte));
    await atualizarProducao(
      dependencias(instalacao, seguinte, consoleRoteirizado('grafite').console),
    );
    expect(instalacao.servidor.atalhosCriados).toHaveLength(1);
  });

  it('o atalho que falha não desfaz a atualização, e diz o motivo', async () => {
    const { instalacao, zip } = await deAntesDoMenu();
    instalacao.servidor.atalhoDoMenu.atalhos.criar = async () => {
      throw new Error('Acesso negado.');
    };
    const roteiro = consoleRoteirizado('grafite');

    await atualizarProducao(dependencias(instalacao, zip, roteiro.console));

    expect((await lerEstado(instalacao.raiz))?.ambientes.producao.atual).toBe('0.5.0');
    expect(roteiro.escritos).toContain(
      'A produção foi atualizada, mas o atalho do menu não foi criado: Acesso negado. A próxima atualização tenta de novo.',
    );
  });
});
