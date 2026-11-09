// A entrada do comando de operação (design do F2d, decisão 4): os argumentos, a ajuda e cada
// comando, sobre uma instalação da 0.4.0 no servidor simulado.
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../test/console-roteirizado.ts';
import { instalacaoDeExemplo } from '../test/instalacao-de-exemplo.ts';
import { NODE, pacoteDeExemplo } from '../test/servidor-simulado.ts';
import { AJUDA, type AmbienteDoComando, executarComando } from './comando.ts';
import { lerConfigEnv } from './configuracao.ts';
import { lerEstado } from './estado.ts';
import { plataformaDoWindows } from './windows/plataforma.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-comando-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

type Instalacao = Awaited<ReturnType<typeof instalacaoDeExemplo>>;

/** O ambiente do comando sobre o servidor simulado, com o que ele escreve e o --confirmar dado. */
function ambienteDe(
  { servidor, raiz }: Instalacao,
  { respostas = [] as string[], pastaDoPacote = join(raiz, 'versoes', '0.4.0') } = {},
) {
  const saida: string[] = [];
  const erros: string[] = [];
  const confirmacoes: (string | undefined)[] = [];
  const roteiro = consoleRoteirizado(...respostas);
  const ambiente: AmbienteDoComando = {
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => erros.push(texto),
    console: (confirmar) => {
      confirmacoes.push(confirmar);
      return {
        ...roteiro.console,
        escrever: (texto) => saida.push(texto),
        async confirmarDigitado(pedido, esperado) {
          if (confirmar === undefined) return roteiro.console.confirmarDigitado(pedido, esperado);
          if (confirmar !== esperado) {
            throw new Error(`O texto digitado não confere com ${esperado}. Nada foi feito.`);
          }
        },
      };
    },
    executar: servidor.executar,
    juncoes: servidor.juncoes,
    saude: servidor.saude,
    ferramentas: servidor.ferramentas,
    servicos: () => servidor.servicos,
    backup: () => servidor.backup,
    plataforma: plataformaDoWindows({
      executar: servidor.executar,
      node: servidor.node,
      juncoes: servidor.juncoes,
      ferramentas: servidor.ferramentas,
      atalhoDoMenu: servidor.atalhoDoMenu,
    }),
    pastaDoPacote,
    node: servidor.node,
    versaoDoNode: '24.19.0',
    agora: () => new Date('2026-10-08T15:00:00.000Z'),
    gerarSenha: servidor.gerarSenha,
    gerarChave: servidor.gerarChave,
    gerarChavesDoPush: () => ({ publica: `B${'P'.repeat(86)}`, privada: 'Q'.repeat(43) }),
  };
  return { ambiente, saida, erros, confirmacoes };
}

describe('a ajuda e os argumentos', () => {
  it('--ajuda mostra cada comando, em pt-BR', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(executarComando(['--ajuda'], ambiente)).resolves.toBe(0);
    expect(saida).toEqual([AJUDA]);
    for (const comando of [
      'menu',
      'instalar <zip>',
      'atualizar <zip> --ambiente teste|producao',
      'voltar --ambiente teste|producao',
      'preparar-teste',
      'backup agora',
      'backup listar',
      'backup testar',
      'restaurar <backup> --ambiente producao',
      'proxy configurar',
      'proxy raiz <destino>',
      'servicos estado',
      'servicos reiniciar --ambiente teste|producao',
      'servicos iniciar --ambiente teste|producao',
      'servicos parar --ambiente teste|producao',
      'backup configurar',
      'certificado configurar --modo interno|publico',
      'enderecos acrescentar <endereço>',
      'enderecos tirar <endereço>',
      'organizacao criar --ambiente teste|producao',
      'conta criar --ambiente teste|producao',
      'conta redefinir --ambiente teste|producao',
    ]) {
      expect(AJUDA).toContain(`  ${comando}`);
    }
    // O atalho de instalação passa o --preparar (change instalador-e-menu-da-operacao).
    expect(AJUDA).toContain('Com --preparar, que o atalho de');
  });

  it('sem comando, ou com um desconhecido, mostra a ajuda como erro de uso', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const semNada = ambienteDe(instalacao);
    await expect(executarComando([], semNada.ambiente)).resolves.toBe(2);
    expect(semNada.erros).toEqual([AJUDA]);
    const desconhecido = ambienteDe(instalacao);
    await expect(executarComando(['apagar-tudo'], desconhecido.ambiente)).resolves.toBe(2);
    expect(desconhecido.erros).toEqual([`Comando desconhecido: apagar-tudo.\n\n${AJUDA}`]);
  });

  it('recusa o que falta ou não serve, com o motivo', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const casos: [string[], string][] = [
      [['atualizar', '--ambiente', 'teste'], 'Falta o zip da versão: grafite atualizar <zip>.'],
      [['atualizar', 'a.zip'], 'Falta --ambiente teste ou --ambiente producao.'],
      [
        ['voltar', '--ambiente', 'homologacao'],
        'O ambiente homologacao não existe: use teste ou producao.',
      ],
      [
        ['restaurar', '2026-10-07T0500Z', '--ambiente', 'teste'],
        'A restauração pelo comando é só da produção: --ambiente producao. O teste recebe a cópia por grafite preparar-teste.',
      ],
      [
        ['restaurar', '--ambiente', 'producao'],
        'Falta o backup: a pasta ou o nome, como 2026-10-07T0500Z.',
      ],
      [
        ['backup', 'apagar'],
        'Use backup agora, backup listar, backup testar ou backup configurar.',
      ],
      [['proxy', 'raiz'], 'Falta o destino: grafite proxy raiz <pasta ou arquivo>.'],
      [['servicos', 'reiniciar'], 'Falta --ambiente teste ou --ambiente producao.'],
      [
        ['atualizar', 'a.zip', '--ambiente', 'teste', '--sem-isso'],
        'Opção desconhecida: --sem-isso.',
      ],
    ];
    for (const [argumentos, mensagem] of casos) {
      const { ambiente, erros } = ambienteDe(instalacao);
      await expect(executarComando(argumentos, ambiente), argumentos.join(' ')).resolves.toBe(2);
      expect(erros.join('\n')).toContain(mensagem);
    }
  });
});

describe('os comandos', () => {
  it('atualizar o teste, na raiz da versão de onde o comando roda', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const zip = await pacoteDeExemplo(pasta, '0.5.0');
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(
      executarComando(['atualizar', zip, '--ambiente', 'teste'], ambiente),
    ).resolves.toBe(0);
    expect((await lerEstado(instalacao.raiz))?.ambientes.teste.atual).toBe('0.5.0');
    expect(saida.at(-1)).toContain('O teste roda a versão 0.5.0.');
  });

  it('--raiz escolhe a instalação, e o --confirmar vai para as confirmações', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const zip = await pacoteDeExemplo(pasta, '0.5.0');
    const fora = ambienteDe(instalacao, { pastaDoPacote: join(pasta, 'pacote-desempacotado') });
    await expect(
      executarComando(
        ['atualizar', zip, '--ambiente', 'teste', '--raiz', instalacao.raiz],
        fora.ambiente,
      ),
    ).resolves.toBe(0);
    const producao = ambienteDe(instalacao);
    await expect(
      executarComando(
        ['atualizar', zip, '--ambiente', 'producao', '--confirmar', 'grafite'],
        producao.ambiente,
      ),
    ).resolves.toBe(0);
    expect(producao.confirmacoes).toEqual(['grafite']);
    expect((await lerEstado(instalacao.raiz))?.ambientes.producao.atual).toBe('0.5.0');
  });

  it('a falha de um comando sai com 1 e a mensagem dele', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, erros } = ambienteDe(instalacao);
    await expect(executarComando(['voltar', '--ambiente', 'producao'], ambiente)).resolves.toBe(1);
    expect(erros).toEqual([
      'A produção não tem versão anterior: ela só existe depois de uma atualização.',
    ]);
  });

  it('servicos estado mostra cada serviço, em texto', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    instalacao.servidor.estados.set('grafite-coletor', 'parado');
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(executarComando(['servicos', 'estado'], ambiente)).resolves.toBe(0);
    expect(saida).toEqual([
      'Grafite (grafite): rodando',
      'Grafite Teste (grafite-teste): rodando',
      'Grafite Coletor (grafite-coletor): parado',
      'Grafite Proxy (grafite-proxy): rodando',
      'Grafite PostgreSQL Teste (grafite-postgresql-teste): rodando',
      'PostgreSQL da produção (postgresql-x64-18): não registrado',
    ]);
  });

  it('servicos reiniciar para e inicia o app do ambiente, com a saúde', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(
      executarComando(['servicos', 'reiniciar', '--ambiente', 'producao'], ambiente),
    ).resolves.toBe(0);
    expect(instalacao.servidor.eventos).toEqual([
      'parar grafite-coletor',
      'parar grafite',
      'iniciar grafite',
      'saúde 3000',
      'iniciar grafite-coletor',
    ]);
    expect(saida).toEqual(['A produção foi reiniciada e responde, na versão 0.4.0.']);
  });

  it('servicos parar a produção pede o nome do banco e para o coletor e o app (Produção desligada pelo comando)', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao, { respostas: ['grafite'] });
    await expect(
      executarComando(['servicos', 'parar', '--ambiente', 'producao'], ambiente),
    ).resolves.toBe(0);
    expect(instalacao.servidor.eventos).toEqual(['parar grafite-coletor', 'parar grafite']);
    expect(saida).toEqual([
      'A produção foi desligada: o app e o coletor estão parados. Para ligá-la: grafite servicos iniciar --ambiente producao.',
    ]);
    saida.length = 0;
    await expect(executarComando(['servicos', 'estado'], ambiente)).resolves.toBe(0);
    expect(saida).toContain('Grafite (grafite): parado');
    expect(saida).toContain('Grafite Coletor (grafite-coletor): parado');
  });

  it('servicos parar a produção com a confirmação que não confere não para nada', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, erros } = ambienteDe(instalacao, { respostas: ['grafite_teste'] });
    await expect(
      executarComando(['servicos', 'parar', '--ambiente', 'producao'], ambiente),
    ).resolves.toBe(1);
    expect(erros).toEqual(['O texto digitado não confere com grafite. Nada foi feito.']);
    expect(instalacao.servidor.eventos).toEqual([]);
  });

  it('servicos parar o teste para só o app do teste, sem a confirmação', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(
      executarComando(['servicos', 'parar', '--ambiente', 'teste'], ambiente),
    ).resolves.toBe(0);
    expect(instalacao.servidor.eventos).toEqual(['parar grafite-teste']);
    expect(saida).toEqual([
      'O teste foi desligado: o app do teste está parado. Para ligá-lo: grafite servicos iniciar --ambiente teste.',
    ]);
  });

  it('servicos iniciar inicia só o que está parado e confere a saúde do app', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    instalacao.servidor.estados.set('grafite', 'parado');
    instalacao.servidor.estados.set('grafite-coletor', 'parado');
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(
      executarComando(['servicos', 'iniciar', '--ambiente', 'producao'], ambiente),
    ).resolves.toBe(0);
    expect(instalacao.servidor.eventos).toEqual([
      'iniciar grafite',
      'saúde 3000',
      'iniciar grafite-coletor',
    ]);
    expect(saida).toEqual(['A produção foi ligada e responde, na versão 0.4.0.']);
  });

  it('servicos iniciar com o ambiente já ligado só confere a saúde', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(
      executarComando(['servicos', 'iniciar', '--ambiente', 'teste'], ambiente),
    ).resolves.toBe(0);
    expect(instalacao.servidor.eventos).toEqual(['saúde 3001']);
    expect(saida).toEqual(['O teste já estava ligado e responde, na versão 0.4.0.']);
  });

  it('servicos iniciar que não sobe diz o que fazer, pelo runbook', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    instalacao.servidor.opcoes.servicoQueNaoSobe = 'grafite-teste';
    instalacao.servidor.estados.set('grafite-teste', 'parado');
    const { ambiente, erros } = ambienteDe(instalacao);
    await expect(
      executarComando(['servicos', 'iniciar', '--ambiente', 'teste'], ambiente),
    ).resolves.toBe(1);
    expect(erros).toEqual([
      'O serviço grafite-teste não ficou rodando a tempo. Veja o log dele na pasta logs.\nVeja "Serviços" no runbook (docs\\operacao\\runbook.md).',
    ]);
  });

  it('backup agora, listar e testar', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(executarComando(['backup', 'agora'], ambiente)).resolves.toBe(0);
    await expect(executarComando(['backup', 'listar'], ambiente)).resolves.toBe(0);
    await expect(executarComando(['backup', 'testar'], ambiente)).resolves.toBe(0);
    const pastaDoBackup = join(instalacao.raiz, 'backups', 'grafite-producao', '2026-10-08T1500Z');
    expect(saida).toEqual([
      `Backup 2026-10-08T1500Z feito em todos os destinos e conferido: ${pastaDoBackup}.`,
      join(instalacao.raiz, 'backups'),
      '  2026-10-08T1500Z  3 MB  versão 0.4.0',
      'O backup 2026-10-08T1500Z restaurou na instância do teste: 42 tabelas, 1.234 linhas e 1 arquivo conferidos.',
    ]);
  });

  it('backup configurar confere os destinos, grava a configuração da produção e reinicia com saúde', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const compartilhamento = join(pasta, 'compartilhamento');
    await mkdir(compartilhamento);
    // O destino da instalação existe depois do primeiro backup.
    await mkdir(join(instalacao.raiz, 'backups'), { recursive: true });
    const destinos = `${join(instalacao.raiz, 'backups')};${compartilhamento}`;
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(
      executarComando(
        [
          'backup',
          'configurar',
          '--destinos',
          destinos,
          '--janela',
          '01:00-05:00',
          '--retencao',
          '14,8,12',
          '--teste-de-restauracao',
          'diario',
        ],
        ambiente,
      ),
    ).resolves.toBe(0);
    expect(await lerConfigEnv(instalacao.pastas.producao.configEnv)).toMatchObject({
      GRAFITE_BACKUP_DESTINOS: destinos,
      GRAFITE_BACKUP_JANELA: '01:00-05:00',
      GRAFITE_BACKUP_RETENCAO: '14,8,12',
      GRAFITE_BACKUP_TESTE: 'diario',
    });
    expect(instalacao.servidor.eventos).toEqual([
      'acl producao/config.env',
      'parar grafite-coletor',
      'parar grafite',
      'iniciar grafite',
      'saúde 3000',
      'iniciar grafite-coletor',
    ]);
    expect(saida).toEqual([
      `O backup da produção está configurado, e o app reiniciou com saúde: os destinos ${join(instalacao.raiz, 'backups')} e ${compartilhamento}, a janela das 01:00 às 05:00, 14 diários, 8 semanais e 12 mensais guardados e o teste de restauração diário.`,
    ]);
  });

  it('Destino do backup que não grava: recusa antes de gravar e diz qual destino não existe', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const antes = await lerConfigEnv(instalacao.pastas.producao.configEnv);
    const naoExiste = join(pasta, 'nao-existe');
    await mkdir(join(instalacao.raiz, 'backups'), { recursive: true });
    const { ambiente, erros } = ambienteDe(instalacao);
    await expect(
      executarComando(
        ['backup', 'configurar', '--destinos', `${join(instalacao.raiz, 'backups')};${naoExiste}`],
        ambiente,
      ),
    ).resolves.toBe(1);
    expect(erros).toEqual([
      `O destino ${naoExiste} não existe: crie a pasta, ou monte o compartilhamento, antes de configurá-lo. Nada foi gravado.`,
    ]);
    expect(await lerConfigEnv(instalacao.pastas.producao.configEnv)).toEqual(antes);
    expect(instalacao.servidor.eventos).toEqual([]);
  });

  it('backup configurar recusa o valor fora do formato antes de gravar, com o motivo', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const antes = await lerConfigEnv(instalacao.pastas.producao.configEnv);
    const backups = join(instalacao.raiz, 'backups');
    for (const [opcoes, motivo] of [
      [
        ['--janela', '25:00-06:00'],
        '--janela: use HH:MM-HH:MM, como 00:00-06:00, com o início antes do fim.',
      ],
      [
        ['--janela', '06:00-01:00'],
        '--janela: use HH:MM-HH:MM, como 00:00-06:00, com o início antes do fim.',
      ],
      [
        ['--retencao', '7,4'],
        '--retencao: use três inteiros, os diários, os semanais e os mensais, como 7,4,12.',
      ],
      [['--teste-de-restauracao', 'mensal'], '--teste-de-restauracao: use semanal ou diario.'],
      [
        ['--destinos', 'backups'],
        '--destinos: use pastas completas, separadas por ponto e vírgula.',
      ],
      [
        ['--destinos', `${backups};${backups}`],
        `--destinos: o destino ${backups} aparece duas vezes.`,
      ],
    ] as const) {
      const { ambiente, erros } = ambienteDe(instalacao);
      await expect(
        executarComando(['backup', 'configurar', ...opcoes], ambiente),
        opcoes.join(' '),
      ).resolves.toBe(1);
      expect(erros).toEqual([motivo]);
    }
    expect(await lerConfigEnv(instalacao.pastas.producao.configEnv)).toEqual(antes);
    expect(instalacao.servidor.eventos).toEqual([]);
  });

  it('backup configurar sem nada a configurar mostra o uso', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, erros } = ambienteDe(instalacao);
    await expect(executarComando(['backup', 'configurar'], ambiente)).resolves.toBe(2);
    expect(erros).toEqual([
      'Use backup configurar com --destinos, --janela, --retencao ou --teste-de-restauracao.',
    ]);
  });

  it('Certificado público pelo comando: o token só na configuração do proxy, sem aparecer, e o HTTPS nos dois ambientes', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { pastas, raiz, servidor } = instalacao;
    const TOKEN = 'token-da-cloudflare-que-nao-aparece';
    const { ambiente, saida, erros } = ambienteDe(instalacao, { respostas: [TOKEN] });
    await expect(
      executarComando(
        ['certificado', 'configurar', '--modo', 'publico', '--email', 'ti@empresa.com.br'],
        ambiente,
      ),
    ).resolves.toBe(0);

    expect((await lerEstado(raiz))?.certificado).toEqual({
      modo: 'publico',
      email: 'ti@empresa.com.br',
      provedorDns: 'cloudflare',
    });
    expect((await lerConfigEnv(pastas.caddyEnv)).CLOUDFLARE_API_TOKEN).toBe(TOKEN);
    for (const configEnv of [pastas.producao.configEnv, pastas.teste.configEnv]) {
      const variaveis = await lerConfigEnv(configEnv);
      expect(variaveis).not.toHaveProperty('NODE_EXTRA_CA_CERTS');
      expect(Object.values(variaveis)).not.toContain(TOKEN);
    }
    expect(await readFile(join(raiz, 'caddy', 'Caddyfile'), 'utf8')).toContain(
      'dns cloudflare {env.CLOUDFLARE_API_TOKEN}',
    );
    expect(servidor.eventos).toEqual([
      'acl caddy/config.env',
      'caddy validate',
      'parar grafite-proxy',
      'iniciar grafite-proxy',
      'acl producao/config.env',
      'acl teste/config.env',
      'parar grafite-coletor',
      'parar grafite',
      'iniciar grafite',
      'saúde 3000',
      'iniciar grafite-coletor',
      'parar grafite-teste',
      'iniciar grafite-teste',
      'saúde 3001',
      'saúde https://grafite.empresa.com.br',
      'saúde https://grafite-teste.empresa.com.br',
    ]);
    expect(saida.at(-1)).toBe(
      "O certificado do proxy está no modo público, pelo Let's Encrypt com o DNS da Cloudflare, e os dois ambientes respondem pelo HTTPS.",
    );
    const tudo = [...saida, ...erros, ...servidor.eventos, ...servidor.argumentos.flat()];
    expect(tudo.join('\n')).not.toContain(TOKEN);
  });

  it('certificado configurar de volta ao modo interno com a AC do Caddy: tira o token e põe a raiz nos apps', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { pastas, raiz, servidor } = instalacao;
    const publico = ambienteDe(instalacao, { respostas: ['token-de-antes'] });
    await executarComando(
      ['certificado', 'configurar', '--modo', 'publico', '--email', 'ti@empresa.com.br'],
      publico.ambiente,
    );
    servidor.eventos.length = 0;
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(
      executarComando(['certificado', 'configurar', '--modo', 'interno'], ambiente),
    ).resolves.toBe(0);

    expect((await lerEstado(raiz))?.certificado).toEqual({ modo: 'interno', ac: 'caddy' });
    expect(await lerConfigEnv(pastas.caddyEnv)).not.toHaveProperty('CLOUDFLARE_API_TOKEN');
    for (const configEnv of [pastas.producao.configEnv, pastas.teste.configEnv]) {
      expect((await lerConfigEnv(configEnv)).NODE_EXTRA_CA_CERTS).toBe(pastas.raizDaAcDoCaddy);
    }
    expect(servidor.eventos.slice(-2)).toEqual([
      `saúde https://grafite.empresa.com.br com caddy/dados/pki/authorities/local/root.crt`,
      `saúde https://grafite-teste.empresa.com.br com caddy/dados/pki/authorities/local/root.crt`,
    ]);
    expect(saida.at(-1)).toBe(
      'O certificado do proxy está no modo interno, com a AC do próprio proxy, e os dois ambientes respondem pelo HTTPS. Distribua o certificado raiz às máquinas e aos celulares: grafite proxy raiz <pasta>.',
    );
  });

  it('certificado configurar recusa o que não serve antes de mudar qualquer coisa', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const antes = await lerEstado(instalacao.raiz);
    for (const [opcoes, respostas, codigo, motivo] of [
      [['--modo', 'outro'], [], 1, '--modo: use interno ou publico.'],
      [
        ['--modo', 'publico'],
        [],
        1,
        "--email: com o modo público, diga o e-mail da conta do Let's Encrypt.",
      ],
      [
        ['--modo', 'interno', '--ac', 'empresa'],
        [],
        1,
        '--certificado e --chave: com a AC da empresa, diga os arquivos do certificado e da chave.',
      ],
      [['--modo', 'interno', '--ac', 'outra'], [], 1, '--ac: use caddy ou empresa.'],
      [
        ['--modo', 'publico', '--email', 'ti@empresa.com.br'],
        [''],
        1,
        'O modo público precisa do token da Cloudflare. Nada foi mudado.',
      ],
      [[], [], 2, 'Use certificado configurar --modo interno|publico.'],
    ] as const) {
      const { ambiente, erros } = ambienteDe(instalacao, { respostas: [...respostas] });
      await expect(
        executarComando(['certificado', 'configurar', ...opcoes], ambiente),
        opcoes.join(' '),
      ).resolves.toBe(codigo);
      expect(erros).toEqual([motivo]);
    }
    expect(await lerEstado(instalacao.raiz)).toEqual(antes);
    expect(instalacao.servidor.eventos).toEqual([]);
  });

  it('Endereço acrescentado: a produção e o teste atendem pelos endereços novos, que entram na organização dos dois bancos', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { raiz, servidor } = instalacao;
    const { ambiente, saida } = ambienteDe(instalacao, { respostas: [''] });
    await expect(
      executarComando(['enderecos', 'acrescentar', 'Grafite.Acme.Example'], ambiente),
    ).resolves.toBe(0);

    const estado = await lerEstado(raiz);
    expect(estado?.ambientes.producao.enderecos).toEqual([
      'grafite.empresa.com.br',
      'grafite.acme.example',
    ]);
    expect(estado?.ambientes.teste.enderecos).toEqual([
      'grafite-teste.empresa.com.br',
      'grafite-teste.acme.example',
    ]);
    expect(estado?.mapaDoTeste).toEqual({
      'grafite.empresa.com.br': 'grafite-teste.empresa.com.br',
      'grafite.acme.example': 'grafite-teste.acme.example',
    });
    expect(await readFile(join(raiz, 'caddy', 'Caddyfile'), 'utf8')).toContain(
      'grafite-teste.acme.example {',
    );
    const raizDaAc = 'caddy/dados/pki/authorities/local/root.crt';
    expect(servidor.eventos).toEqual([
      'api grafite organizacao acrescentar-endereco --endereco grafite.empresa.com.br --novo grafite.acme.example',
      'api grafite_teste organizacao acrescentar-endereco --endereco grafite-teste.empresa.com.br --novo grafite-teste.acme.example',
      'caddy validate',
      'parar grafite-proxy',
      'iniciar grafite-proxy',
      `saúde https://grafite.acme.example com ${raizDaAc}`,
      `saúde https://grafite-teste.acme.example com ${raizDaAc}`,
    ]);
    expect(saida.at(-1)).toBe(
      'A produção atende também por https://grafite.acme.example, e o teste, por https://grafite-teste.acme.example. Cadastre os dois no DNS da empresa, apontando para este servidor.',
    );
  });

  it('enderecos tirar pede o endereço digitado e tira o da produção e o do teste; o da organização operadora passa ao seguinte', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { raiz, servidor, pastas } = instalacao;
    await executarComando(
      ['enderecos', 'acrescentar', 'grafite.acme.example'],
      ambienteDe(instalacao, { respostas: [''] }).ambiente,
    );
    servidor.eventos.length = 0;
    const { ambiente, saida } = ambienteDe(instalacao, { respostas: ['grafite.empresa.com.br'] });
    await expect(
      executarComando(['enderecos', 'tirar', 'grafite.empresa.com.br'], ambiente),
    ).resolves.toBe(0);

    const estado = await lerEstado(raiz);
    expect(estado?.ambientes.producao.enderecos).toEqual(['grafite.acme.example']);
    expect(estado?.ambientes.teste.enderecos).toEqual(['grafite-teste.acme.example']);
    expect(estado?.mapaDoTeste).toEqual({
      'grafite.acme.example': 'grafite-teste.acme.example',
    });
    expect(await lerConfigEnv(pastas.producao.configEnv)).toMatchObject({
      GRAFITE_ORGANIZACAO_OPERADORA: 'grafite.acme.example',
      GRAFITE_CERTIFICADO_VIGIAR: 'grafite.acme.example',
      GRAFITE_PUSH_CONTATO: 'https://grafite.acme.example',
    });
    expect((await lerConfigEnv(pastas.coletorEnv)).GRAFITE_COLETOR_ENDERECO).toBe(
      'grafite.acme.example',
    );
    expect(servidor.eventos.slice(0, 5)).toEqual([
      'api grafite organizacao tirar-endereco --endereco grafite.empresa.com.br',
      'api grafite_teste organizacao tirar-endereco --endereco grafite-teste.empresa.com.br',
      'caddy validate',
      'parar grafite-proxy',
      'iniciar grafite-proxy',
    ]);
    expect(servidor.eventos).toContain('iniciar grafite-coletor');
    expect(saida.at(-1)).toBe(
      'A produção deixou de atender por https://grafite.empresa.com.br, e o teste, por https://grafite-teste.empresa.com.br. A organização que opera o servidor passa a ser a do endereço grafite.acme.example. Tire os dois do DNS da empresa.',
    );
  });

  it('Último endereço: recusa tirar o único endereço da produção, sem mudar nada', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const antes = await lerEstado(instalacao.raiz);
    const { ambiente, erros } = ambienteDe(instalacao);
    await expect(
      executarComando(['enderecos', 'tirar', 'grafite.empresa.com.br'], ambiente),
    ).resolves.toBe(1);
    expect(erros).toEqual([
      'A produção precisa de pelo menos um endereço: acrescente outro antes de tirar grafite.empresa.com.br.',
    ]);
    expect(await lerEstado(instalacao.raiz)).toEqual(antes);
    expect(instalacao.servidor.eventos).toEqual([]);
  });

  it('enderecos recusa o endereço fora do formato, o que já existe e o uso errado', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    for (const [argumentos, respostas, codigo, motivo] of [
      [
        ['enderecos', 'acrescentar', 'grafite_errado'],
        [],
        1,
        'O endereço grafite_errado não serve: use um nome como grafite.empresa.com.br.',
      ],
      [
        ['enderecos', 'acrescentar', 'grafite-teste.empresa.com.br'],
        [],
        1,
        'O endereço grafite-teste.empresa.com.br já é do Grafite neste servidor.',
      ],
      [
        ['enderecos', 'acrescentar', 'grafite.novo.com.br'],
        ['grafite.empresa.com.br'],
        1,
        'O endereço grafite.empresa.com.br já é do Grafite neste servidor.',
      ],
      [
        ['enderecos', 'tirar', 'grafite.outro.com.br'],
        [],
        1,
        'O endereço grafite.outro.com.br não é da produção.',
      ],
      [['enderecos'], [], 2, 'Use enderecos acrescentar <endereço> ou enderecos tirar <endereço>.'],
    ] as const) {
      const { ambiente, erros } = ambienteDe(instalacao, { respostas: [...respostas] });
      await expect(executarComando([...argumentos], ambiente), argumentos.join(' ')).resolves.toBe(
        codigo,
      );
      expect(erros).toEqual([motivo]);
    }
    expect(instalacao.servidor.eventos).toEqual([]);
  });

  it('proxy configurar gera o Caddyfile e reinicia o proxy', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(executarComando(['proxy', 'configurar'], ambiente)).resolves.toBe(0);
    expect(instalacao.servidor.eventos).toEqual([
      'caddy validate',
      'parar grafite-proxy',
      'iniciar grafite-proxy',
    ]);
    expect(saida).toEqual(['Proxy configurado e reiniciado.']);
  });

  it('organizacao e conta vão ao comando da API da versão do ambiente, com o config.env dele', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao);
    await expect(
      executarComando(
        [
          'conta',
          'redefinir',
          '--ambiente',
          'teste',
          '--endereco',
          'grafite-teste.empresa.com.br',
          '--usuario',
          'ana',
        ],
        ambiente,
      ),
    ).resolves.toBe(0);
    expect(instalacao.servidor.eventos).toEqual([
      'api grafite_teste conta redefinir --endereco grafite-teste.empresa.com.br --usuario ana',
    ]);
    const chamada = instalacao.servidor.argumentos.at(-1);
    expect(chamada?.[0]).toBe(NODE);
    expect(chamada?.[1]).toBe(
      join(instalacao.pastas.teste.atual, 'apps', 'api', 'scripts', 'grafite.ts'),
    );
    expect(saida.join('\n')).toContain('Senha temporária: TEMP-1234');
  });

  it('a ajuda do comando da API não pede o ambiente', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente } = ambienteDe(instalacao);
    await expect(executarComando(['conta', '--ajuda'], ambiente)).resolves.toBe(0);
    expect(instalacao.servidor.eventos).toEqual(['api (sem banco) conta --ajuda']);
  });

  it('organizacao e conta sem o ambiente são recusados', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, erros } = ambienteDe(instalacao);
    await expect(executarComando(['organizacao', 'criar', '--nome', 'X'], ambiente)).resolves.toBe(
      2,
    );
    expect(erros).toEqual(['Falta --ambiente teste ou --ambiente producao.']);
  });
});

// O menu da operação (change instalador-e-menu-da-operacao, design, decisão 5; spec
// operacao-servicos, "Menu da operação"): as tarefas pelo mesmo executarComando.
describe('grafite menu', () => {
  const LISTA = [
    'Menu da operação do Grafite',
    '  1. Estado dos serviços',
    '  2. Criar uma conta',
    '  3. Redefinir um acesso',
    '  4. Fazer o backup agora',
    '  5. Listar os backups',
    '  6. Configurar o e-mail',
    '  7. Testar o e-mail',
    '  8. Atualizar um ambiente',
    '  9. Preparar o teste',
    '  10. Reiniciar um ambiente',
    '  11. Abrir a pasta dos logs',
    '  0. Sair',
    'Ficam no painel da operação e no comando, como diz o runbook: a restauração, a volta à versão anterior e a troca da chave do cofre.',
  ];

  it('abre pelo comando com as tarefas numeradas, recusa a resposta fora delas e sai com o 0 (Menu pelo comando e Restauração fora do menu)', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao, { respostas: ['restaurar', '12', '0'] });

    await expect(executarComando(['menu'], ambiente)).resolves.toBe(0);

    expect(saida.slice(0, LISTA.length)).toEqual(LISTA);
    expect(saida.filter((linha) => linha === 'Escolha um número de 0 a 11.')).toHaveLength(2);
    expect(saida.join('\n')).not.toMatch(/\d+\. Restaurar/);
  });

  it('roda a tarefa pelo mesmo comando, mostra o resultado e volta à lista', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = ambienteDe(instalacao, { respostas: ['1', '0'] });

    await expect(executarComando(['menu'], ambiente)).resolves.toBe(0);

    const depois = saida.slice(LISTA.length);
    expect(depois).toContain('Grafite (grafite): rodando');
    expect(depois).toContain('Pronto: Estado dos serviços.');
    expect(depois.filter((linha) => linha === LISTA[0])).toHaveLength(1);
  });

  it('atualiza como o comando: recusa na produção a versão que não roda no teste (Atualização pelo menu)', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const zip = await pacoteDeExemplo(pasta, '0.5.0');
    const { ambiente, saida, erros } = ambienteDe(instalacao, {
      respostas: ['8', zip, 'producao', '0'],
    });

    await expect(executarComando(['menu'], ambiente)).resolves.toBe(0);

    expect(erros.join('\n')).toContain(
      'A 0.5.0 precisa rodar no teste primeiro: o teste roda a 0.4.0.',
    );
    expect(saida).toContain('Atualizar um ambiente não terminou: o motivo está acima.');
    expect(instalacao.servidor.eventos).not.toContain('backup');
  });

  it('mostra o motivo da recusa do e-mail e volta à lista, sem fechar (Tarefa que falha)', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida, erros } = ambienteDe(instalacao, {
      respostas: [
        '6',
        'smtp://grafite@smtp.empresa.com.br:587',
        'Grafite <grafite@empresa.com.br>',
        'senha-errada',
        '7',
        'ti@empresa.com.br',
        '0',
      ],
    });

    await expect(executarComando(['menu'], ambiente)).resolves.toBe(0);

    expect(saida).toContain('Pronto: Configurar o e-mail.');
    expect(erros).toContain(
      'O servidor de e-mail recusou a autenticação. (535 Authentication failed)',
    );
    expect(saida).toContain('Testar o e-mail não terminou: o motivo está acima.');
    expect(saida.at(-1)).toBe(LISTA.at(-1));
  });

  it('abre a pasta dos logs da produção pelo Explorer', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente } = ambienteDe(instalacao, { respostas: ['11', '0'] });

    await expect(executarComando(['menu'], ambiente)).resolves.toBe(0);

    expect(instalacao.servidor.eventos).toContain('explorer producao/logs');
  });

  it('fecha depois de três escolhas que não servem, como a entrada que acabou', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, erros } = ambienteDe(instalacao, { respostas: ['', '', ''] });

    await expect(executarComando(['menu'], ambiente)).resolves.toBe(1);
    expect(erros).toEqual([
      'Nenhuma tarefa foi escolhida depois de três tentativas: o menu fechou.',
    ]);
  });

  it('num servidor sem o Grafite, diz que ele não está instalado', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const raiz = join(pasta, 'OutraPasta');
    const { ambiente, erros } = ambienteDe(instalacao);

    await expect(executarComando(['menu', '--raiz', raiz], ambiente)).resolves.toBe(1);
    expect(erros).toEqual([`O Grafite não está instalado neste servidor (${raiz}).`]);
  });
});
