// Os comandos de depois da instalação no servidor Linux (spec operacao-em-linux, "Comando de operação
// no Linux"; change servidor-linux-com-docker, design, decisões 1, 2 e 7): o proxy, o cofre, o
// e-mail, a organização e a conta, pela mesma entrada do Windows com as peças do Linux, sobre uma
// instalação da 1.4.0 no servidor Linux simulado.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../../test/console-roteirizado.ts';
import { instalacaoNoLinuxDeExemplo, pacoteDoLinux } from '../../test/instalacao-no-linux.ts';
import { servidorLinuxSimulado } from '../../test/servidor-linux-simulado.ts';
import { atualizarTeste } from '../atualizar.ts';
import type { AmbienteDoComando } from '../comando.ts';
import { executarComando } from '../comando.ts';
import { lerConfigEnv } from '../configuracao.ts';
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

/** Um processo do Docker, com o ambiente do cliente, por onde as variáveis passam pelo nome. */
interface ProcessoDoDocker {
  argumentos: string[];
  env: Record<string, string | undefined>;
}

/**
 * O ambiente do comando no Linux, sobre o servidor simulado, com o que ele escreve e o que roda, e
 * com a pasta da instalação e o fuso que o lançador passa.
 */
function ambienteNoLinux({ servidor }: Pick<Instalada, 'servidor'>, respostas: string[] = []) {
  const saida: string[] = [];
  const erros: string[] = [];
  const modos: string[] = [];
  const processos: ProcessoDoDocker[] = [];
  const executar: ExecutarProcesso = (arquivo, argumentos, opcoes) => {
    if (arquivo === 'docker') processos.push({ argumentos, env: opcoes.env });
    return servidor.executar(arquivo, argumentos, opcoes);
  };
  const permissoes = {
    dono: async () => {},
    modo: async (caminho: string, modo: number) => {
      modos.push(`${caminho} ${modo.toString(8)}`);
    },
  };
  const roteiro = consoleRoteirizado(...respostas);
  const ambiente: AmbienteDoComando = {
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => erros.push(texto),
    console: () => ({ ...roteiro.console, escrever: (texto) => saida.push(texto) }),
    executar,
    juncoes: {
      apontar: async () => {
        throw new Error('O Linux não tem junções.');
      },
      ler: async () => null,
    },
    saude: servidor.saude,
    ferramentas: () => servidor.ferramentas,
    servicos: () => servidor.servicos,
    backup: () => {
      throw new Error('O backup não entra nestes testes.');
    },
    plataforma: plataformaDoLinux({ executar, permissoes }),
    linux: { raiz, fuso: 'America/Sao_Paulo', permissoes },
    pastaDoPacote: '/app',
    node: 'node',
    versaoDoNode: '24.19.0',
    agora: () => new Date('2026-10-23T10:00:00.000Z'),
    gerarSenha: () => 'senha-nova',
    gerarChave: () => Buffer.alloc(32, 9).toString('base64'),
    gerarChavesDoPush: () => ({ publica: 'publica-nova', privada: 'privada-nova' }),
  };
  return { ambiente, saida, erros, modos, processos, roteiro };
}

/** Os processos do comando da API: a imagem e os argumentos depois do script. */
const comandosDaApi = (processos: ProcessoDoDocker[]) =>
  processos
    .filter(({ argumentos }) => argumentos.includes('apps/api/scripts/grafite.ts'))
    .map(({ argumentos, env }) => ({
      imagem: argumentos.find((argumento) => argumento.startsWith('grafite/')),
      argumentos: argumentos.slice(argumentos.indexOf('apps/api/scripts/grafite.ts') + 1),
      env,
    }));

describe('organizacao e conta no Linux', () => {
  it('Conta criada na produção: pelo comando da API da versão do ambiente, com a configuração dele', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    // O teste roda outra versão: cada ambiente usa a imagem da dele.
    const { ambiente: noTeste } = ambienteNoLinux(instalada);
    await atualizarTeste({
      raiz,
      pacote: instalada.pacotes['1.5.0'] ?? '',
      console: consoleRoteirizado().console,
      executar: noTeste.executar,
      servicos: instalada.servidor.servicos,
      saude: instalada.servidor.saude,
      plataforma: noTeste.plataforma,
      gerarChave: noTeste.gerarChave,
      gerarChavesDoPush: noTeste.gerarChavesDoPush,
    });
    const { ambiente, saida, processos } = ambienteNoLinux(instalada);
    const opcoes = ['--pessoa', 'Bruno Lima', '--usuario', 'bruno.lima', '--raiz', raiz];

    await expect(
      executarComando(['conta', 'criar', '--ambiente', 'producao', ...opcoes], ambiente),
    ).resolves.toBe(0);
    await expect(
      executarComando(['conta', 'criar', '--ambiente', 'teste', ...opcoes], ambiente),
    ).resolves.toBe(0);

    const [producao, teste] = comandosDaApi(processos);
    expect(producao?.imagem).toBe('grafite/aplicacao:1.4.0');
    expect(producao?.argumentos).toEqual([
      'conta',
      'criar',
      '--pessoa',
      'Bruno Lima',
      '--usuario',
      'bruno.lima',
    ]);
    const daProducao = await lerConfigEnv(join(raiz, 'producao', 'config.env'));
    expect(producao?.env.GRAFITE_DATABASE_URL).toBe(daProducao.GRAFITE_DATABASE_URL);
    expect(producao?.env.GRAFITE_AMBIENTE).toBe('producao');
    expect(teste?.imagem).toBe('grafite/aplicacao:1.5.0');
    expect(teste?.env.GRAFITE_AMBIENTE).toBe('teste');
    expect(saida).toContain('conta criar feito.');
  });
});

describe('proxy no Linux', () => {
  it('configurar gera o Caddyfile com o nome do serviço de cada app, confere pela imagem e copia a raiz pública', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, saida, modos } = ambienteNoLinux(instalada);

    await expect(executarComando(['proxy', 'configurar', '--raiz', raiz], ambiente)).resolves.toBe(
      0,
    );

    expect(instalada.servidor.eventos).toEqual([
      'caddy validate 1.4.0',
      'stop proxy',
      'up proxy 1.4.0',
    ]);
    const caddyfile = await readFile(join(raiz, 'caddy', 'Caddyfile'), 'utf8');
    expect(caddyfile).toContain('\treverse_proxy app-producao:3000');
    expect(caddyfile).toContain('\treverse_proxy app-teste:3001');
    expect(await readFile(join(raiz, 'caddy', 'ac', 'raiz.crt'), 'utf8')).toBe(
      'a raiz da AC do Caddy',
    );
    expect(modos.some((modo) => modo.endsWith(`raiz.crt 644`))).toBe(true);
    expect(saida).toContain('Proxy configurado e reiniciado.');
  });

  it('raiz copia a raiz da AC da pasta do Caddy para o destino', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, saida } = ambienteNoLinux(instalada);
    const destino = join(fora, 'para-distribuir');
    await mkdir(destino);

    await expect(
      executarComando(['proxy', 'raiz', destino, '--raiz', raiz], ambiente),
    ).resolves.toBe(0);

    expect(await readFile(join(destino, 'grafite-raiz.crt'), 'utf8')).toBe('a raiz da AC do Caddy');
    expect(saida.join('\n')).toContain(
      `Certificado raiz copiado para ${join(destino, 'grafite-raiz.crt')}.`,
    );
  });
});

describe('email no Linux', () => {
  it('configurar grava na configuração da produção, só para o root, e recria o app com ela', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, saida, modos } = ambienteNoLinux(instalada, ['senha-do-smtp']);

    await expect(
      executarComando(
        [
          'email',
          'configurar',
          '--smtp',
          'smtp://grafite@smtp.empresa.com.br:587',
          '--remetente',
          'Grafite <grafite@empresa.com.br>',
          '--raiz',
          raiz,
        ],
        ambiente,
      ),
    ).resolves.toBe(0);

    const configEnv = join(raiz, 'producao', 'config.env');
    expect((await lerConfigEnv(configEnv)).GRAFITE_SMTP_URL).toBe(
      'smtp://grafite:senha-do-smtp@smtp.empresa.com.br:587',
    );
    expect(modos).toContain(`${configEnv} 600`);
    expect(instalada.servidor.eventos).toEqual([
      'stop coletor',
      'stop app-producao',
      'up app-producao 1.4.0',
      'saúde app-producao',
      'up coletor 1.4.0',
    ]);
    expect(saida).toContain(
      'O e-mail da produção está configurado, e o app reiniciou com saúde. Confira o envio com sudo grafite email testar --para <e-mail>.',
    );
  });

  it('testar manda pelo comando da API da versão da produção', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, saida, processos } = ambienteNoLinux(instalada);

    await expect(
      executarComando(['email', 'testar', '--para', 'ti@empresa.com.br', '--raiz', raiz], ambiente),
    ).resolves.toBe(0);

    expect(comandosDaApi(processos)).toMatchObject([
      {
        imagem: 'grafite/aplicacao:1.4.0',
        argumentos: ['email', 'testar', '--para', 'ti@empresa.com.br'],
      },
    ]);
    expect(saida).toContain('email testar feito.');
  });
});

describe('cofre no Linux', () => {
  it('trocar-chave recifra nos dois ambientes pela imagem de cada um, com os contêineres recriados', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, processos } = ambienteNoLinux(instalada, ['grafite']);
    const configs = [join(raiz, 'producao', 'config.env'), join(raiz, 'teste', 'config.env')];
    const [chaveDeAntes] = await Promise.all(
      configs.map(async (caminho) => (await lerConfigEnv(caminho)).GRAFITE_CHAVE_DO_COFRE),
    );

    await expect(
      executarComando(['cofre', 'trocar-chave', '--raiz', raiz], ambiente),
    ).resolves.toBe(0);

    const nova = Buffer.alloc(32, 9).toString('base64');
    for (const caminho of configs) {
      const variaveis = await lerConfigEnv(caminho);
      expect(variaveis.GRAFITE_CHAVE_DO_COFRE).toBe(nova);
      expect(variaveis).not.toHaveProperty('GRAFITE_CHAVE_DO_COFRE_ANTERIOR');
    }
    expect(chaveDeAntes).not.toBe(nova);
    const trocas = comandosDaApi(processos);
    expect(trocas.map(({ imagem, env }) => `${imagem} ${env.GRAFITE_AMBIENTE}`)).toEqual([
      'grafite/aplicacao:1.4.0 producao',
      'grafite/aplicacao:1.4.0 teste',
    ]);
    // Cada reinício recria o contêiner do app com a configuração nova.
    expect(instalada.servidor.eventos.filter((evento) => evento.startsWith('up app-'))).toEqual([
      'up app-producao 1.4.0',
      'up app-teste 1.4.0',
      'up app-producao 1.4.0',
      'up app-teste 1.4.0',
    ]);
  });

  it('a troca retomada depois de uma falha continua com as mesmas chaves', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    instalada.servidor.controle.comandoQueFalha = 'cofre trocar-chave teste';
    const primeira = ambienteNoLinux(instalada, ['grafite']);

    await expect(
      executarComando(['cofre', 'trocar-chave', '--raiz', raiz], primeira.ambiente),
    ).resolves.toBe(1);
    expect(primeira.erros.join('\n')).toContain(
      'As duas chaves ficaram na configuração, e a API aceita as duas: rode sudo grafite cofre trocar-chave de novo.',
    );
    const doTeste = await lerConfigEnv(join(raiz, 'teste', 'config.env'));
    const nova = doTeste.GRAFITE_CHAVE_DO_COFRE;
    expect(doTeste.GRAFITE_CHAVE_DO_COFRE_ANTERIOR).toBeDefined();

    const segunda = ambienteNoLinux(instalada, ['grafite']);
    await expect(
      executarComando(['cofre', 'trocar-chave', '--raiz', raiz], {
        ...segunda.ambiente,
        gerarChave: () => 'nao-deve-ser-gerada',
      }),
    ).resolves.toBe(0);
    expect(segunda.saida).toContain(
      'A troca anterior não terminou: a configuração já tem a chave nova e a anterior. A troca continua com elas.',
    );
    expect((await lerConfigEnv(join(raiz, 'producao', 'config.env'))).GRAFITE_CHAVE_DO_COFRE).toBe(
      nova,
    );
  });
});

describe('a entrada do comando no Linux', () => {
  it('instalar usa a pasta da instalação e o fuso que o lançador passa', async () => {
    const pacote = await pacoteDoLinux(fora, '1.4.0');
    const servidor = servidorLinuxSimulado({
      raiz,
      enderecos: { 'grafite.empresa.com.br': 'producao', 'grafite-teste.empresa.com.br': 'teste' },
      pacotes: { [pacote]: '1.4.0' },
    });
    const respostas = join(fora, 'respostas.json');
    await writeFile(
      respostas,
      JSON.stringify({
        enderecos: ['grafite.empresa.com.br'],
        mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' },
        certificado: { modo: 'interno', ac: 'caddy' },
        backup: { destinos: [join(raiz, 'backups')], janela: '01:00-05:00' },
        organizacao: { nome: 'Empresa', pessoa: 'Ana Souza', usuario: 'ana.souza' },
      }),
    );
    const { ambiente, saida } = ambienteNoLinux({ servidor });

    await expect(
      executarComando(['instalar', pacote, '--respostas', respostas], ambiente),
    ).resolves.toBe(0);

    expect((await lerEstado(raiz))?.plataforma).toBe('linux');
    expect(await readFile(join(raiz, '.env'), 'utf8')).toContain('TZ=America/Sao_Paulo');
    expect(saida).toContain(`Grafite 1.4.0 instalado em ${raiz}.`);
  });

  it('a ajuda fala do sudo, do pacote tar e de /opt/grafite', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, saida } = ambienteNoLinux(instalada);
    await expect(executarComando(['--ajuda'], ambiente)).resolves.toBe(0);
    const [ajuda = ''] = saida;
    expect(ajuda).toContain('Uso: sudo grafite <comando> [opções]');
    expect(ajuda).toContain('instalar <tar>');
    expect(ajuda).toContain('atualizar <tar> --ambiente teste|producao');
    expect(ajuda).toContain('(padrão: /opt/grafite)');
    // Os comandos do painel da operação (change painel-da-operacao).
    for (const comando of [
      'servicos iniciar --ambiente teste|producao',
      'servicos parar --ambiente teste|producao',
      'backup configurar',
      'certificado configurar --modo interno|publico',
      'enderecos acrescentar <endereço>',
      'enderecos tirar <endereço>',
    ]) {
      expect(ajuda).toContain(`  ${comando}`);
    }
    expect(ajuda).toContain('O runbook (docs/operacao/runbook.md)');
    expect(ajuda).not.toContain('<zip>');
  });

  it('servicos estado mostra cada contêiner pelo nome do serviço do Compose', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, saida } = ambienteNoLinux(instalada);
    await expect(executarComando(['servicos', 'estado'], ambiente)).resolves.toBe(0);
    expect(saida).toEqual([
      'Grafite (app-producao): rodando',
      'Grafite Teste (app-teste): rodando',
      'Grafite Coletor (coletor): rodando',
      'Grafite Proxy (proxy): rodando',
      'Grafite PostgreSQL Teste (banco-teste): rodando',
      'PostgreSQL da produção (banco-producao): rodando',
    ]);
  });

  it('Certificado público pelo comando, no Linux: o token só na configuração do proxy, fora dos argumentos do Docker, e o HTTPS nos dois ambientes', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const TOKEN = 'token-da-cloudflare-que-nao-aparece';
    const acDoCaddy = posix.join(raiz, 'caddy', 'ac');
    const montaAAc = async () => {
      const compose = JSON.parse(
        (await readFile(join(raiz, 'compose.yaml'), 'utf8')).replace(/^#.*\n/gm, ''),
      ) as { services: Record<string, { volumes?: string[] }> };
      return (compose.services['app-producao']?.volumes ?? []).some((volume) =>
        volume.startsWith(acDoCaddy),
      );
    };
    expect(await montaAAc()).toBe(true);
    const { ambiente, saida, erros, processos } = ambienteNoLinux(instalada, [TOKEN]);
    await expect(
      executarComando(
        [
          'certificado',
          'configurar',
          '--modo',
          'publico',
          '--email',
          'ti@empresa.com.br',
          '--raiz',
          raiz,
        ],
        ambiente,
      ),
    ).resolves.toBe(0);

    expect((await lerConfigEnv(join(raiz, 'caddy', 'config.env'))).CLOUDFLARE_API_TOKEN).toBe(
      TOKEN,
    );
    expect(await lerConfigEnv(join(raiz, 'producao', 'config.env'))).not.toHaveProperty(
      'NODE_EXTRA_CA_CERTS',
    );
    // Sem a AC do Caddy, os apps deixam de montar a cópia pública da raiz.
    expect(await montaAAc()).toBe(false);
    expect(instalada.servidor.eventos).toEqual(
      expect.arrayContaining([
        'caddy validate 1.4.0',
        'up proxy 1.4.0',
        'saúde https://grafite.empresa.com.br',
        'saúde https://grafite-teste.empresa.com.br',
      ]),
    );
    const argumentos = processos.flatMap(({ argumentos: lista }) => lista);
    expect([...argumentos, ...saida, ...erros].join('\n')).not.toContain(TOKEN);
  });

  it('backup configurar confere cada destino num contêiner que não o cria, grava a marca e reinicia a produção', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const compartilhamento = join(fora, 'compartilhamento');
    await mkdir(compartilhamento);
    const destinos = `${join(raiz, 'backups')};${compartilhamento}`;
    const { ambiente, saida, processos } = ambienteNoLinux(instalada);
    await expect(
      executarComando(['backup', 'configurar', '--destinos', destinos, '--raiz', raiz], ambiente),
    ).resolves.toBe(0);
    const montagens = processos
      .filter(({ argumentos }) => argumentos[0] === 'run' && argumentos.includes('--mount'))
      .map(({ argumentos }) => argumentos[argumentos.indexOf('--mount') + 1]);
    expect(montagens).toEqual([
      `type=bind,source=${join(raiz, 'backups')},target=${join(raiz, 'backups')}`,
      `type=bind,source=${compartilhamento},target=${compartilhamento}`,
    ]);
    expect(await readFile(join(compartilhamento, '.grafite-destino'), 'utf8')).toContain(
      'Destino do backup do Grafite',
    );
    expect((await lerConfigEnv(join(raiz, 'producao', 'config.env'))).GRAFITE_BACKUP_DESTINOS).toBe(
      destinos,
    );
    // O contêiner do app da produção passa a montar o destino novo.
    const compose = JSON.parse(
      (await readFile(join(raiz, 'compose.yaml'), 'utf8')).replace(/^#.*\n/gm, ''),
    ) as { services: Record<string, { volumes?: string[] }> };
    expect(compose.services['app-producao']?.volumes).toContain(
      `${compartilhamento}:${compartilhamento}`,
    );
    expect(instalada.servidor.eventos).toEqual([
      'stop coletor',
      'stop app-producao',
      'up app-producao 1.4.0',
      'saúde app-producao',
      'up coletor 1.4.0',
    ]);
    expect(saida.at(-1)).toContain('O backup da produção está configurado');
  });

  it('Destino do backup que não grava: o contêiner não monta o destino que não existe, e nada é criado', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const naoExiste = join(fora, 'nao-existe');
    const { ambiente, erros } = ambienteNoLinux(instalada);
    await expect(
      executarComando(['backup', 'configurar', '--destinos', naoExiste, '--raiz', raiz], ambiente),
    ).resolves.toBe(1);
    expect(erros).toEqual([
      `O destino ${naoExiste} não existe: crie a pasta, ou monte o compartilhamento, antes de configurá-lo. Nada foi gravado.`,
    ]);
    expect(existsSync(naoExiste)).toBe(false);
    expect(instalada.servidor.eventos).toEqual([]);
  });

  it('servicos parar e iniciar a produção, com a confirmação e a saúde (Produção desligada pelo comando)', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, saida } = ambienteNoLinux(instalada, ['grafite']);
    await expect(
      executarComando(['servicos', 'parar', '--ambiente', 'producao'], ambiente),
    ).resolves.toBe(0);
    expect(instalada.servidor.eventos).toEqual(['stop coletor', 'stop app-producao']);
    expect(saida).toEqual([
      'A produção foi desligada: o app e o coletor estão parados. Para ligá-la: sudo grafite servicos iniciar --ambiente producao.',
    ]);
    instalada.servidor.eventos.length = 0;
    saida.length = 0;
    await expect(
      executarComando(['servicos', 'iniciar', '--ambiente', 'producao'], ambiente),
    ).resolves.toBe(0);
    expect(instalada.servidor.eventos).toEqual([
      'up app-producao 1.4.0',
      'saúde app-producao',
      'up coletor 1.4.0',
    ]);
    expect(saida).toEqual(['A produção foi ligada e responde, na versão 1.4.0.']);
  });
});

describe('o que é só do servidor Windows (change instalador-e-menu-da-operacao)', () => {
  it('instalar recusa o --preparar, que é do atalho do Windows, antes de mudar qualquer coisa', async () => {
    const pacote = await pacoteDoLinux(fora, '1.4.0');
    const servidor = servidorLinuxSimulado({
      raiz,
      enderecos: { 'grafite.empresa.com.br': 'producao' },
      pacotes: { [pacote]: '1.4.0' },
    });
    const { ambiente, erros } = ambienteNoLinux({ servidor });

    await expect(executarComando(['instalar', pacote, '--preparar'], ambiente)).resolves.toBe(2);
    expect(erros).toEqual([
      'A opção --preparar é do servidor Windows: no Linux, o Docker é o único pré-requisito, e o instalar.sh o confere.',
    ]);
    expect(await lerEstado(raiz)).toBeNull();
  });

  it('a ajuda do Linux não fala do --preparar', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, saida } = ambienteNoLinux(instalada);
    await expect(executarComando(['--ajuda'], ambiente)).resolves.toBe(0);
    expect(saida.join('\n')).not.toContain('--preparar');
  });
});

describe('o menu, que é só do servidor Windows (change instalador-e-menu-da-operacao)', () => {
  it('sudo grafite menu diz que o menu é do Windows e que aqui a operação é pelos comandos', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, erros } = ambienteNoLinux(instalada);

    await expect(executarComando(['menu'], ambiente)).resolves.toBe(2);
    expect(erros).toEqual([
      'O menu da operação é do servidor Windows. No Linux, a operação é pelos comandos: sudo grafite --ajuda.',
    ]);
  });

  it('a ajuda do Linux não mostra o menu', async () => {
    const instalada = await instalacaoNoLinuxDeExemplo({ raiz, fora });
    const { ambiente, saida } = ambienteNoLinux(instalada);
    await expect(executarComando(['--ajuda'], ambiente)).resolves.toBe(0);
    expect(saida.join('\n')).not.toMatch(/^ {2}menu/m);
  });
});
