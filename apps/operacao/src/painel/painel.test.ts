// O comando painel (change painel-da-operacao, design, decisões 1, 2 e 7; spec painel-da-operacao,
// "Painel aberto só no próprio servidor"): a porta livre, o navegador aberto pela plataforma ou o
// --sem-navegador, a sessão pelo código do endereço, as tarefas pelo mesmo comando, as leituras da
// página sem os segredos e o fim depois do tempo sem uso, sobre a instalação simulada.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instalacaoDeExemplo } from '../../test/instalacao-de-exemplo.ts';
import { type AmbienteDoComando, executarComando } from '../comando.ts';
import { gerarConfigEnv, lerConfigEnv } from '../configuracao.ts';
import { plataformaDoWindows } from '../windows/plataforma.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-painel-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

type Instalacao = Awaited<ReturnType<typeof instalacaoDeExemplo>>;

/** O ambiente do comando sobre o servidor simulado, com a página do painel numa pasta. */
async function ambienteDoPainel({ servidor, raiz }: Instalacao, semUsoMs = 60_000) {
  const pagina = join(pasta, 'pagina');
  await mkdir(pagina, { recursive: true });
  await writeFile(join(pagina, 'index.html'), '<p>Painel</p>');
  const saida: string[] = [];
  const navegador: string[] = [];
  const ambiente: AmbienteDoComando = {
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => saida.push(texto),
    console: () => {
      throw new Error('O painel não usa o console do terminal.');
    },
    executar: async (arquivo, argumentos, opcoes) => {
      if (arquivo === 'explorer.exe') navegador.push(argumentos[0] ?? '');
      return servidor.executar(arquivo, argumentos, opcoes);
    },
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
    painel: { pagina, semUsoMs },
    pastaDoPacote: join(raiz, 'versoes', '0.4.0'),
    node: servidor.node,
    versaoDoNode: '24.19.0',
    agora: () => new Date('2026-10-28T12:00:00.000Z'),
    gerarSenha: servidor.gerarSenha,
    gerarChave: servidor.gerarChave,
    gerarChavesDoPush: () => ({ publica: `B${'P'.repeat(86)}`, privada: 'Q'.repeat(43) }),
  };
  return { ambiente, saida, navegador };
}

/** Espera uma condição, em passos curtos, até 5 s. */
async function esperar<T>(condicao: () => T | undefined | null | false): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const valor = condicao();
    if (valor) return valor;
    await new Promise((pronto) => setTimeout(pronto, 50));
  }
  throw new Error('A condição não aconteceu a tempo.');
}

interface Resposta {
  status: number;
  cookie?: string;
  corpo: unknown;
}

function pedir(
  endereco: string,
  {
    metodo = 'GET',
    caminho,
    corpo,
    cookie,
  }: {
    metodo?: string;
    caminho: string;
    corpo?: unknown;
    cookie?: string;
  },
): Promise<Resposta> {
  const url = new URL(endereco);
  return new Promise((resolver, recusar) => {
    const pedido = request(
      {
        host: url.hostname,
        port: url.port,
        method: metodo,
        path: caminho,
        headers: {
          host: url.host,
          ...(cookie === undefined ? {} : { cookie }),
          ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
        },
      },
      (resposta) => {
        const partes: Buffer[] = [];
        resposta.on('data', (parte: Buffer) => partes.push(parte));
        resposta.on('end', () => {
          const texto = Buffer.concat(partes).toString('utf8');
          resolver({
            status: resposta.statusCode ?? 0,
            ...(resposta.headers['set-cookie']?.[0] === undefined
              ? {}
              : { cookie: resposta.headers['set-cookie'][0].split(';')[0] }),
            corpo: texto === '' ? undefined : JSON.parse(texto),
          });
        });
      },
    );
    pedido.on('error', recusar);
    if (corpo !== undefined) pedido.write(JSON.stringify(corpo));
    pedido.end();
  });
}

/** Abre o painel, troca o código pela sessão e devolve como pedir com ela. */
async function abrirPainel(saida: string[]) {
  const linha = await esperar(() => saida.find((texto) => texto.includes('http://127.0.0.1:')));
  const endereco = /http:\/\/127\.0\.0\.1:\d+\/#[\w-]+/.exec(linha)?.[0] ?? '';
  const [base = '', codigo = ''] = endereco.split('/#');
  const sessao = await pedir(base, { metodo: 'POST', caminho: '/api/sessao', corpo: { codigo } });
  expect(sessao.status).toBe(200);
  return {
    base,
    pedir: (opcoes: Parameters<typeof pedir>[1]) =>
      pedir(base, { ...opcoes, cookie: sessao.cookie }),
  };
}

describe('grafite painel', () => {
  it('com o --sem-navegador, escreve o endereço com o código, e a sessão abre o /api/estado', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida, navegador } = await ambienteDoPainel(instalacao, 400);
    const rodando = executarComando(['painel', '--sem-navegador'], ambiente);
    const painel = await abrirPainel(saida);

    const estado = await painel.pedir({ caminho: '/api/estado' });
    expect(estado.status).toBe(200);
    expect(estado.corpo).toMatchObject({
      plataforma: 'windows',
      tarefaEmAndamento: null,
      ambientes: { producao: { atual: '0.4.0' } },
    });
    expect((estado.corpo as { servicos: { nome: string }[] }).servicos[0]?.nome).toBe('Grafite');
    expect((await pedir(painel.base, { caminho: '/api/estado' })).status).toBe(401);
    expect(navegador).toEqual([]);

    await expect(rodando).resolves.toBe(0);
    expect(saida.at(-1)).toBe('O painel encerrou, sem uso.');
  });

  it('sem o --sem-navegador, o navegador da sessão abre o painel pelo Explorer', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida, navegador } = await ambienteDoPainel(instalacao, 300);
    const rodando = executarComando(['painel'], ambiente);
    await esperar(() => navegador.length > 0);
    expect(navegador[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#[\w-]{43}$/);
    expect(saida).toContain(
      'Deixe esta janela aberta enquanto usa o painel: fechá-la encerra o painel. Ele também encerra sozinho depois de 30 minutos sem uso.',
    );
    await expect(rodando).resolves.toBe(0);
  });

  it('uma tarefa pelo painel roda o mesmo comando, e a janela diz para não fechá-la enquanto ela roda', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = await ambienteDoPainel(instalacao, 400);
    const rodando = executarComando(['painel', '--sem-navegador'], ambiente);
    const painel = await abrirPainel(saida);

    const pedida = await painel.pedir({
      metodo: 'POST',
      caminho: '/api/tarefas',
      corpo: { tarefa: 'servicos-reiniciar', campos: { ambiente: 'teste' } },
    });
    expect(pedida).toMatchObject({ status: 202, corpo: { iniciada: 'Reiniciar um ambiente' } });
    await esperar(() => saida.includes('Pronto: Reiniciar um ambiente.'));
    expect(saida).toContain(
      'Rodando "Reiniciar um ambiente": não feche esta janela até a tarefa terminar.',
    );
    expect(instalacao.servidor.eventos).toEqual(
      expect.arrayContaining(['parar grafite-teste', 'iniciar grafite-teste', 'saúde 3001']),
    );
    const recusada = await painel.pedir({
      metodo: 'POST',
      caminho: '/api/tarefas',
      corpo: { tarefa: 'email-testar', campos: {} },
    });
    expect(recusada).toEqual({
      status: 409,
      corpo: { mensagem: 'Preencha "E-mail que recebe o teste".' },
    });
    await expect(rodando).resolves.toBe(0);
  });

  it('as leituras da página: os logs, os pacotes, os backups e as configurações, sem os segredos', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { pastas } = instalacao;
    await writeFile(
      pastas.producao.configEnv,
      gerarConfigEnv({
        ...(await lerConfigEnv(pastas.producao.configEnv)),
        GRAFITE_SMTP_URL: 'smtp://grafite:S3nh4-do-smtp@smtp.empresa.com.br:587',
        GRAFITE_EMAIL_REMETENTE: 'Grafite <grafite@empresa.com.br>',
      }),
    );
    await mkdir(pastas.producao.logs, { recursive: true });
    await writeFile(join(pastas.producao.logs, 'grafite.out.log'), 'linha 1\nlinha 2\n');
    const { ambiente, saida } = await ambienteDoPainel(instalacao, 400);
    const rodando = executarComando(['painel', '--sem-navegador'], ambiente);
    const painel = await abrirPainel(saida);

    const logs = await painel.pedir({ caminho: '/api/logs?servico=grafite&linhas=1' });
    expect(logs.corpo).toEqual([
      { origem: join(pastas.producao.logs, 'grafite.out.log'), linhas: ['linha 2'] },
    ]);
    expect((await painel.pedir({ caminho: '/api/logs?servico=spooler' })).status).toBe(400);

    const configuracoes = await painel.pedir({ caminho: '/api/configuracoes' });
    expect(configuracoes.corpo).toMatchObject({
      email: {
        smtp: 'smtp://grafite@smtp.empresa.com.br:587',
        remetente: 'Grafite <grafite@empresa.com.br>',
        senhaConfigurada: true,
      },
      backup: { janela: '00:00-06:00', retencao: '7,4,12', teste: 'semanal' },
      certificado: { modo: 'interno', ac: 'caddy', tokenConfigurado: false },
      enderecos: { producao: ['grafite.empresa.com.br'], teste: ['grafite-teste.empresa.com.br'] },
    });
    expect(JSON.stringify(configuracoes.corpo)).not.toContain('S3nh4-do-smtp');

    expect((await painel.pedir({ caminho: '/api/backups' })).corpo).toEqual([
      { destino: join(instalacao.raiz, 'backups'), backups: [] },
    ]);
    expect(Array.isArray((await painel.pedir({ caminho: '/api/pacotes' })).corpo)).toBe(true);
    const tarefas = (await painel.pedir({ caminho: '/api/tarefas' })).corpo as { id: string }[];
    expect(tarefas.map(({ id }) => id)).toContain('restaurar');
    await expect(rodando).resolves.toBe(0);
  });

  it('num servidor sem o Grafite, diz que ele não está instalado, sem abrir porta', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const { ambiente, saida } = await ambienteDoPainel(instalacao);
    await expect(
      executarComando(['painel', '--sem-navegador', '--raiz', join(pasta, 'outra')], ambiente),
    ).resolves.toBe(1);
    expect(saida.join('\n')).not.toContain('http://127.0.0.1');
  });
});
