// A instalação do zero (spec operacao-servicos, "Instalação do zero"; design do F2d, decisão 6), com
// as peças do Windows, o PostgreSQL e a saúde simulados e o pacote, os arquivos e as junções de
// verdade, numa pasta temporária no lugar de C:\Grafite.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../test/console-roteirizado.ts';
import {
  existe,
  type OpcoesDoServidor,
  pacoteDeExemplo,
  servidorSimulado,
} from '../test/servidor-simulado.ts';
import { lerConfigEnv } from './configuracao.ts';
import { lerEstado } from './estado.ts';
import { type DependenciasDaInstalacao, instalar, type PreparacaoDoServidor } from './instalar.ts';
import { PG_BIN_PADRAO, pastasDaInstalacao } from './layout.ts';
import type { ServicoDoSistema } from './windows/sistema.ts';

let pasta: string;
let raiz: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-instalar-'));
  raiz = join(pasta, 'Grafite');
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const SENHA_DO_POSTGRES = 'senha-do-postgres-da-producao';
const pacote = () => pacoteDeExemplo(pasta, '0.4.0');
const pgBin = () => join(pasta, 'PostgreSQL', '18', 'bin');

const respostas = () => ({
  raiz,
  pgBin: pgBin(),
  enderecos: ['grafite.empresa.com.br'],
  mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' },
  certificado: { modo: 'interno', ac: 'caddy' },
  backup: { destinos: [join(raiz, 'backups')], janela: '00:00-06:00' },
  organizacao: {
    nome: 'Empresa',
    pessoa: 'Ana Souza',
    usuario: 'ana',
    email: 'ana@empresa.com.br',
  },
});

async function arquivoDeRespostas(extra: Record<string, unknown> = {}): Promise<string> {
  const caminho = join(pasta, 'respostas.json');
  await writeFile(
    caminho,
    JSON.stringify({ ...respostas(), senhaDoPostgres: SENHA_DO_POSTGRES, ...extra }),
  );
  return caminho;
}

/** O servidor simulado e as dependências da instalação ligadas a ele. */
function servidorSimuladoDaInstalacao(opcoes: Partial<OpcoesDoServidor> = {}) {
  const servidor = servidorSimulado({ raiz, pgBin: pgBin(), ...opcoes });
  const dependencias = (
    extra: Partial<DependenciasDaInstalacao> & Pick<DependenciasDaInstalacao, 'zip' | 'console'>,
  ): DependenciasDaInstalacao => ({
    executar: servidor.executar,
    ferramentas: servidor.ferramentas,
    servicos: () => servidor.servicos,
    juncoes: servidor.juncoes,
    saude: servidor.saude,
    atalhoDoMenu: servidor.atalhoDoMenu,
    node: servidor.node,
    versaoDoNode: '24.19.0',
    gerarSenha: servidor.gerarSenha,
    gerarChave: servidor.gerarChave,
    gerarChavesDoPush: servidor.gerarChavesDoPush,
    ...extra,
  });
  return { ...servidor, dependencias };
}

/** Todos os arquivos de uma pasta, com o caminho relativo à raiz. */
async function arquivosDa(pastaDe: string): Promise<string[]> {
  return (await readdir(pastaDe, { recursive: true, withFileTypes: true }))
    .filter((item) => item.isFile())
    .map((item) => relative(raiz, join(item.parentPath, item.name)).split(sep).join('/'))
    .sort();
}

describe('grafite instalar', () => {
  it('pelo arquivo de respostas, faz o caminho completo na ordem do design, sem perguntar nada', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    const roteiro = consoleRoteirizado();
    await instalar(
      servidor.dependencias({
        zip: await pacote(),
        console: roteiro.console,
        arquivoDeRespostas: await arquivoDeRespostas(),
      }),
    );

    expect(roteiro.perguntas).toEqual([]);
    expect(servidor.eventos).toEqual([
      // 1. Conferir: o PostgreSQL 18, o servidor da produção e as portas do proxy (o Node e o pacote
      // não chamam nada).
      'pg_dump --version',
      'psql 5432 versão',
      'portas 80 e 443',
      // 3. Banco: a configuração de cada ambiente, a instância do teste e os papéis e bancos.
      'acl producao/config.env',
      'acl teste/config.env',
      'acl producao/coletor.env',
      'acl producao/coletor',
      'acl caddy/config.env',
      'initdb',
      'acl teste/banco',
      'pg_ctl register',
      'sc config grafite-postgresql-teste',
      'sc description grafite-postgresql-teste',
      'sc failure grafite-postgresql-teste',
      'iniciar grafite-postgresql-teste',
      'psql 5432 grafite',
      'psql 5433 grafite_teste',
      // 4. Primeira versão: desempacotar, as junções e as migrations nos dois bancos.
      'junção versoes/0.4.0/node_modules/@grafite/db → versoes/0.4.0/packages/db',
      'junção producao/atual → versoes/0.4.0',
      'junção teste/atual → versoes/0.4.0',
      'migrar grafite com a 0.4.0',
      'migrar grafite_teste com a 0.4.0',
      // 5. Primeira organização, na produção.
      'api grafite organizacao criar --se-nao-existir --nome Empresa --endereco grafite.empresa.com.br --pessoa Ana Souza --usuario ana --email ana@empresa.com.br',
      // O coletor da produção ligado a ela, com o token do coletor.env pelo ambiente.
      'api grafite coletor criar --endereco grafite.empresa.com.br --nome Servidor --token-do-ambiente --se-nao-existir [GRAFITE_COLETOR_TOKEN no ambiente]',
      // 6. Serviços, proxy, firewall, partida e saúde.
      'sc failure postgresql-x64-18',
      'registrar grafite',
      'registrar grafite-teste',
      'registrar grafite-coletor',
      'registrar grafite-proxy',
      'caddy validate',
      'parar grafite-proxy',
      'iniciar grafite-proxy',
      'firewall 80',
      'firewall 443',
      'iniciar grafite',
      'iniciar grafite-teste',
      'iniciar grafite-coletor',
      // O atalho do menu, depois dos serviços (change instalador-e-menu-da-operacao).
      'atalho Grafite.lnk → Grafite.cmd',
      'saúde 3000',
      'saúde 3001',
      'saúde 3100',
      'saúde https://grafite.empresa.com.br com caddy/dados/pki/authorities/local/root.crt',
      'saúde https://grafite-teste.empresa.com.br com caddy/dados/pki/authorities/local/root.crt',
    ]);

    const pastas = pastasDaInstalacao(raiz);
    expect(await lerEstado(raiz)).toEqual({
      raiz,
      plataforma: 'windows',
      ambientes: {
        producao: {
          enderecos: ['grafite.empresa.com.br'],
          porta: 3000,
          atual: '0.4.0',
          anterior: null,
        },
        teste: {
          enderecos: ['grafite-teste.empresa.com.br'],
          porta: 3001,
          atual: '0.4.0',
          anterior: null,
        },
      },
      mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' },
      certificado: { modo: 'interno', ac: 'caddy' },
      versoes: ['0.4.0'],
      pgBin: pgBin(),
    });
    expect(await existe(pastas.instalacao)).toBe(false);
    expect(await readFile(pastas.lancador, 'utf8')).toBe('# o lançador');
    expect(await readFile(join(pastas.caddy, 'Caddyfile'), 'utf8')).toContain(
      'grafite-teste.empresa.com.br {',
    );
    const saida = roteiro.escritos.join('\n');
    expect(saida).toContain('Senha temporária: TEMP-1234');
    expect(saida).toContain('Grafite 0.4.0 instalado em');
    expect(saida).toContain('grafite proxy raiz');
    expect(saida).toContain('Coletor "Servidor" criado na organização');
    expect(roteiro.escritos.slice(-3)).toEqual([
      '  O coletor "Servidor" só coleta depois que as faixas de rede dele forem cadastradas em Administração › Coletores.',
      '  O e-mail só sai depois de configurado: grafite email configurar --smtp <endereço> --remetente "Grafite <grafite@empresa.com.br>".',
      '  A operação do dia a dia abre pelo atalho "Grafite" da área de trabalho.',
    ]);
  });

  it('as chaves do push vão só para a produção, com o contato na operadora', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    await instalar(
      servidor.dependencias({
        zip: await pacote(),
        console: consoleRoteirizado().console,
        arquivoDeRespostas: await arquivoDeRespostas(),
      }),
    );
    const pastas = pastasDaInstalacao(raiz);
    expect(await lerConfigEnv(pastas.producao.configEnv)).toMatchObject({
      GRAFITE_PUSH_CHAVE_PUBLICA: servidor.gerarChavesDoPush().publica,
      GRAFITE_PUSH_CHAVE_PRIVADA: servidor.gerarChavesDoPush().privada,
      GRAFITE_PUSH_CONTATO: 'https://grafite.empresa.com.br',
    });
    const teste = await lerConfigEnv(pastas.teste.configEnv);
    expect(teste).not.toHaveProperty('GRAFITE_PUSH_CHAVE_PUBLICA');
    expect(teste).not.toHaveProperty('GRAFITE_PUSH_CHAVE_PRIVADA');
  });

  it('o token do coletor vai pelo ambiente do comando, nunca pela linha de comando', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    await instalar(
      servidor.dependencias({
        zip: await pacote(),
        console: consoleRoteirizado().console,
        arquivoDeRespostas: await arquivoDeRespostas(),
      }),
    );
    const pastas = pastasDaInstalacao(raiz);
    const { GRAFITE_COLETOR_TOKEN: token } = await lerConfigEnv(pastas.coletorEnv);
    expect(token).toBeTruthy();
    expect(servidor.coletores).toEqual(new Set([token]));
    expect(servidor.argumentos.flat().some((argumento) => argumento.includes(token ?? '?'))).toBe(
      false,
    );
  });

  it('as senhas geradas ficam só nos config.env, diferentes em cada ambiente, e a do postgres em nenhum lugar', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    const roteiro = consoleRoteirizado();
    await instalar(
      servidor.dependencias({
        zip: await pacote(),
        console: roteiro.console,
        arquivoDeRespostas: await arquivoDeRespostas(),
      }),
    );
    const pastas = pastasDaInstalacao(raiz);
    const producao = await lerConfigEnv(pastas.producao.configEnv);
    const teste = await lerConfigEnv(pastas.teste.configEnv);
    const senhaDe = (url = '') => decodeURIComponent(new URL(url).password);
    expect(senhaDe(producao.GRAFITE_DATABASE_URL)).not.toBe(senhaDe(teste.GRAFITE_DATABASE_URL));
    expect(senhaDe(producao.GRAFITE_DATABASE_URL_MIGRACOES)).not.toBe(
      senhaDe(teste.GRAFITE_DATABASE_URL_MIGRACOES),
    );

    const gerados = Array.from(
      { length: servidor.segredosGerados() },
      (_, i) => `S3GR3D0-${i + 1}`,
    );
    expect(gerados.length).toBeGreaterThanOrEqual(7);
    const comSegredos = new Set([
      'producao/config.env',
      'teste/config.env',
      'producao/coletor.env',
      'caddy/config.env',
    ]);
    for (const arquivo of await arquivosDa(raiz)) {
      const conteudo = await readFile(join(raiz, arquivo), 'utf8');
      expect(conteudo, arquivo).not.toContain(SENHA_DO_POSTGRES);
      if (comSegredos.has(arquivo)) continue;
      for (const segredo of gerados) expect(conteudo, arquivo).not.toContain(segredo);
    }
    const todos = [...gerados, SENHA_DO_POSTGRES, 'Q0hBVkUtREUtMzItQllURVMtUEFSQS1PUy1UT1RQLi4='];
    for (const linha of servidor.argumentos) {
      for (const segredo of todos) expect(linha.join(' ')).not.toContain(segredo);
    }
    for (const segredo of todos) expect(roteiro.escritos.join('\n')).not.toContain(segredo);
  });

  it('os apps e o coletor ouvem só em 127.0.0.1, e o proxy é o caminho da rede', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    await instalar(
      servidor.dependencias({
        zip: await pacote(),
        console: consoleRoteirizado().console,
        arquivoDeRespostas: await arquivoDeRespostas(),
      }),
    );
    const pastas = pastasDaInstalacao(raiz);
    expect(await lerConfigEnv(pastas.producao.configEnv)).toMatchObject({
      GRAFITE_API_HOST: '127.0.0.1',
      GRAFITE_API_PORTA: '3000',
    });
    expect(await lerConfigEnv(pastas.teste.configEnv)).toMatchObject({
      GRAFITE_API_HOST: '127.0.0.1',
      GRAFITE_API_PORTA: '3001',
    });
    expect(await lerConfigEnv(pastas.coletorEnv)).toMatchObject({
      GRAFITE_COLETOR_HOST: '127.0.0.1',
    });
    const caddyfile = await readFile(join(pastas.caddy, 'Caddyfile'), 'utf8');
    expect(caddyfile).toContain('reverse_proxy 127.0.0.1:3000');
    expect(caddyfile).toContain('reverse_proxy 127.0.0.1:3001');
    expect(servidor.eventos.filter((e) => e.startsWith('firewall'))).toEqual([
      'firewall 80',
      'firewall 443',
    ]);
  });

  it('sem o PostgreSQL 18, para antes de criar qualquer coisa e diz o que falta', async () => {
    const servidor = servidorSimuladoDaInstalacao({ semPostgres: true });
    await expect(
      instalar(
        servidor.dependencias({
          zip: await pacote(),
          console: consoleRoteirizado().console,
          arquivoDeRespostas: await arquivoDeRespostas(),
        }),
      ),
    ).rejects.toThrow(
      `O PostgreSQL 18 precisa estar instalado, à mão ou pelo atalho de instalação (Instalar-Grafite.cmd): não encontrei o pg_dump em ${pgBin()}.`,
    );
    expect(servidor.eventos).toEqual(['pg_dump --version']);
    expect(await existe(raiz)).toBe(false);
  });

  it('com a porta 80 ocupada, como pelo IIS, para antes de criar qualquer coisa e diz o que fazer', async () => {
    const servidor = servidorSimuladoDaInstalacao({ portasOcupadas: [80] });
    await expect(
      instalar(
        servidor.dependencias({
          zip: await pacote(),
          console: consoleRoteirizado().console,
          arquivoDeRespostas: await arquivoDeRespostas(),
        }),
      ),
    ).rejects.toThrow(
      'A porta 80 está ocupada por outro programa, como o IIS, e o proxy do Grafite precisa das portas 80 e 443: libere-a e rode a instalação de novo.',
    );
    expect(servidor.eventos).toEqual(['pg_dump --version', 'psql 5432 versão', 'portas 80 e 443']);
    expect(await existe(raiz)).toBe(false);
  });

  it('com as duas portas ocupadas, diz as duas', async () => {
    const servidor = servidorSimuladoDaInstalacao({ portasOcupadas: [80, 443] });
    await expect(
      instalar(
        servidor.dependencias({
          zip: await pacote(),
          console: consoleRoteirizado().console,
          arquivoDeRespostas: await arquivoDeRespostas(),
        }),
      ),
    ).rejects.toThrow(
      'As portas 80 e 443 estão ocupadas por outro programa, como o IIS, e o proxy do Grafite precisa delas: libere-as e rode a instalação de novo.',
    );
  });

  it('sem o Node 24, para antes de tudo', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    await expect(
      instalar(
        servidor.dependencias({
          zip: await pacote(),
          console: consoleRoteirizado().console,
          arquivoDeRespostas: await arquivoDeRespostas(),
          versaoDoNode: '22.11.0',
        }),
      ),
    ).rejects.toThrow('O Grafite precisa do Node 24; este servidor tem o Node 22.11.0.');
    expect(servidor.eventos).toEqual([]);
    expect(await existe(raiz)).toBe(false);
  });

  it('o pacote que não confere com o hash para antes de tudo', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    const zip = await pacote();
    await writeFile(`${zip}.sha256`, '0'.repeat(64));
    await expect(
      instalar(
        servidor.dependencias({
          zip,
          console: consoleRoteirizado().console,
          arquivoDeRespostas: await arquivoDeRespostas(),
        }),
      ),
    ).rejects.toThrow('não confere com o hash publicado');
    expect(servidor.eventos).toEqual([]);
    expect(await existe(raiz)).toBe(false);
  });

  it('numa raiz já instalada, recusa e aponta a atualização', async () => {
    await mkdir(raiz, { recursive: true });
    await writeFile(join(raiz, 'operacao.json'), '{}');
    const servidor = servidorSimuladoDaInstalacao();
    await expect(
      instalar(
        servidor.dependencias({
          zip: await pacote(),
          console: consoleRoteirizado().console,
          arquivoDeRespostas: await arquivoDeRespostas(),
        }),
      ),
    ).rejects.toThrow(
      `O Grafite já está instalado em ${raiz}. Para uma versão nova, use grafite atualizar.`,
    );
    expect(servidor.eventos).toEqual([]);
  });

  it('retoma a instalação interrompida no meio, sem perguntar de novo nem trocar as senhas', async () => {
    const servidor = servidorSimuladoDaInstalacao({ migracaoFalhaNo: 'grafite_teste' });
    const zip = await pacote();
    await expect(
      instalar(
        servidor.dependencias({
          zip,
          console: consoleRoteirizado().console,
          arquivoDeRespostas: await arquivoDeRespostas(),
        }),
      ),
    ).rejects.toThrow(
      [
        'As migrations da versão 0.4.0 falharam: error: relation "x" does not exist',
        'A instalação parou no meio. Corrija o problema e rode o mesmo comando de novo: ela continua de onde parou.',
      ].join('\n'),
    );
    const pastas = pastasDaInstalacao(raiz);
    expect(await existe(pastas.instalacao)).toBe(true);
    expect(await existe(pastas.estado)).toBe(false);
    const antes = await lerConfigEnv(pastas.producao.configEnv);
    const antesDoTeste = await lerConfigEnv(pastas.teste.configEnv);

    // A retomada: sem o arquivo de respostas, só a senha do postgres é perguntada.
    servidor.eventos.length = 0;
    const roteiro = consoleRoteirizado(join(pasta, 'Grafite'), SENHA_DO_POSTGRES);
    await instalar(servidor.dependencias({ zip, console: roteiro.console }));

    expect(roteiro.perguntas).toEqual([
      'Pasta da instalação',
      'Senha do usuário postgres do PostgreSQL da produção',
    ]);
    expect(roteiro.escritos[1]).toBe(
      'Retomando a instalação interrompida, com as respostas dadas antes.',
    );
    expect(servidor.eventos).not.toContain('initdb');
    expect(servidor.eventos).not.toContain('pg_ctl register');
    expect(servidor.eventos.filter((e) => e.startsWith('migrar'))).toEqual([
      'migrar grafite com a 0.4.0',
      'migrar grafite_teste com a 0.4.0',
    ]);
    expect(await lerConfigEnv(pastas.producao.configEnv)).toEqual(antes);
    expect(await lerConfigEnv(pastas.teste.configEnv)).toEqual(antesDoTeste);
    expect(await existe(pastas.instalacao)).toBe(false);
    expect((await lerEstado(raiz))?.ambientes.producao.atual).toBe('0.4.0');
  });

  it('a saúde com outra versão deixa a instalação por terminar', async () => {
    const servidor = servidorSimuladoDaInstalacao({ versaoNaSaude: { 3001: '0.3.0' } });
    await expect(
      instalar(
        servidor.dependencias({
          zip: await pacote(),
          console: consoleRoteirizado().console,
          arquivoDeRespostas: await arquivoDeRespostas(),
        }),
      ),
    ).rejects.toThrow('O app do teste respondeu a versão 0.3.0, e a esperada é a 0.4.0.');
    const pastas = pastasDaInstalacao(raiz);
    expect(await existe(pastas.estado)).toBe(false);
    expect(await existe(pastas.instalacao)).toBe(true);
  });

  it('na retomada com o proxy já rodando, as portas 80 e 443 são dele e não são conferidas', async () => {
    const servidor = servidorSimuladoDaInstalacao({ versaoNaSaude: { 3001: '0.3.0' } });
    const zip = await pacote();
    const respostas = await arquivoDeRespostas();
    await expect(
      instalar(
        servidor.dependencias({
          zip,
          console: consoleRoteirizado().console,
          arquivoDeRespostas: respostas,
        }),
      ),
    ).rejects.toThrow('O app do teste respondeu a versão 0.3.0');
    expect(servidor.estados.get('grafite-proxy')).toBe('rodando');

    // O proxy da instalação interrompida segura as portas; a retomada passa por elas.
    servidor.opcoes.versaoNaSaude = undefined;
    servidor.opcoes.portasOcupadas = [80, 443];
    servidor.eventos.length = 0;
    await instalar(
      servidor.dependencias({
        zip,
        console: consoleRoteirizado().console,
        arquivoDeRespostas: respostas,
      }),
    );
    expect(servidor.eventos).not.toContain('portas 80 e 443');
    expect(await existe(pastasDaInstalacao(raiz).estado)).toBe(true);
  });

  it('pelas perguntas, do zero, com a senha do postgres sem eco', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    const roteiro = consoleRoteirizado(
      raiz,
      pgBin(),
      SENHA_DO_POSTGRES,
      'grafite.empresa.com.br',
      '',
      '',
      '',
      '',
      '',
      'Empresa',
      'Ana Souza',
      'ana',
      '',
    );
    await instalar(servidor.dependencias({ zip: await pacote(), console: roteiro.console }));
    expect(roteiro.perguntas.slice(0, 3)).toEqual([
      'Pasta da instalação',
      'Pasta dos programas do PostgreSQL 18',
      'Senha do usuário postgres do PostgreSQL da produção',
    ]);
    expect(roteiro.sobra()).toBe(0);
    expect(servidor.eventos).toContain(
      'api grafite organizacao criar --se-nao-existir --nome Empresa --endereco grafite.empresa.com.br --pessoa Ana Souza --usuario ana',
    );
    expect(await existe(pastasDaInstalacao(raiz).estado)).toBe(true);
  });
});

describe('grafite instalar --preparar, pelo atalho de instalação', () => {
  const OFICIAL = 'o instalador oficial do PostgreSQL 18.6';
  const SENHA_NOVA = 'senha-nova-do-postgres';
  /** As respostas das perguntas da instalação de hoje, depois da pasta da instalação. */
  const DEPOIS_DA_RAIZ = [
    'grafite.empresa.com.br',
    '',
    '',
    '',
    '',
    '',
    'Empresa',
    'Ana Souza',
    'ana',
    '',
  ];

  /**
   * A preparação simulada sobre o servidor da instalação: o instalador da EDB passa a ter o
   * PostgreSQL 18 no servidor, e parar o IIS solta as portas.
   */
  async function preparacaoSimulada(
    servidor: ReturnType<typeof servidorSimuladoDaInstalacao>,
    { iis = false, postgres18 = false } = {},
  ) {
    const arquivo = 'postgresql-18.6-1-windows-x64.exe';
    await writeFile(join(pasta, arquivo), OFICIAL);
    const feito: string[] = [];
    const servicos: ServicoDoSistema[] = [
      ...(iis ? [{ nome: 'W3SVC', rodando: true }] : []),
      ...(postgres18 ? [{ nome: 'postgresql-x64-18', rodando: true }] : []),
    ];
    const preparacao: PreparacaoDoServidor = {
      sistema: {
        listar: async (prefixo) => servicos.filter(({ nome }) => nome.startsWith(prefixo)),
        parar: async (nome) => {
          feito.push(`parar ${nome}`);
          servidor.opcoes.portasOcupadas = [];
        },
        reiniciar: async (nome) => {
          feito.push(`reiniciar ${nome}`);
        },
        inicio: async (nome, modo) => {
          feito.push(`início ${modo} ${nome}`);
        },
      },
      discos: { fixos: async () => ['C', 'D'], temArquivos: async () => false },
      instaladorDoPostgres: {
        instalar: async () => {
          feito.push('instalar o PostgreSQL');
          servidor.opcoes.semPostgres = false;
          servicos.push({ nome: 'postgresql-x64-18', rodando: true });
        },
        atenderSoNoServidor: async (dados) => {
          feito.push(`só no servidor ${dados}`);
        },
      },
      baixador: {
        baixar: async (url) => {
          throw new Error(`Sem rede para ${url}`);
        },
      },
      pastaDaPreparacao: join(pasta, 'preparacao'),
      prerequisitos: {
        node: {
          versao: '24.22.1',
          arquivo: 'node-v24.22.1-x64.msi',
          url: 'https://nodejs.org/dist/v24.22.1/node-v24.22.1-x64.msi',
          sha256: 'a'.repeat(64),
        },
        postgres: {
          versao: '18.6',
          arquivo,
          url: `https://get.enterprisedb.com/postgresql/${arquivo}`,
          sha256: createHash('sha256').update(OFICIAL).digest('hex'),
        },
      },
      pastaDoZip: pasta,
    };
    return { preparacao, feito };
  }

  it('instala antes o PostgreSQL 18 que falta e segue sem perguntar a senha nem a pasta dos programas de novo', async () => {
    const senhas = new Set<string>();
    const servidor = servidorSimuladoDaInstalacao({
      semPostgres: true,
      pgBin: PG_BIN_PADRAO,
      psql: ({ senha }) => {
        if (senha !== undefined) senhas.add(senha);
        return undefined;
      },
    });
    const { preparacao, feito } = await preparacaoSimulada(servidor);
    const roteiro = consoleRoteirizado('', SENHA_NOVA, SENHA_NOVA, raiz, ...DEPOIS_DA_RAIZ);

    await instalar(
      servidor.dependencias({ zip: await pacote(), console: roteiro.console, preparacao }),
    );

    expect(roteiro.perguntas.slice(0, 4)).toEqual([
      'Pasta dos dados do PostgreSQL 18',
      'Senha do usuário postgres do PostgreSQL 18',
      'Repita a senha do usuário postgres',
      'Pasta da instalação',
    ]);
    expect(roteiro.perguntas).not.toContain('Pasta dos programas do PostgreSQL 18');
    expect(roteiro.perguntas).not.toContain('Senha do usuário postgres do PostgreSQL da produção');
    expect(roteiro.sobra()).toBe(0);
    expect(feito).toEqual([
      'instalar o PostgreSQL',
      'só no servidor D:\\PostgreSQL\\18\\data',
      'início automatico postgresql-x64-18',
      'reiniciar postgresql-x64-18',
    ]);
    // A senha digitada na preparação é a que a instalação usa no PostgreSQL da produção.
    expect(senhas).toContain(SENHA_NOVA);
    expect((await lerEstado(raiz))?.pgBin).toBe(PG_BIN_PADRAO);
  });

  it('com o IIS na porta 80, desliga o IIS com o sim, antes de instalar o PostgreSQL, e segue', async () => {
    const servidor = servidorSimuladoDaInstalacao({
      semPostgres: true,
      pgBin: PG_BIN_PADRAO,
      portasOcupadas: [80],
    });
    const { preparacao, feito } = await preparacaoSimulada(servidor, { iis: true });
    const roteiro = consoleRoteirizado('sim', '', SENHA_NOVA, SENHA_NOVA, raiz, ...DEPOIS_DA_RAIZ);

    await instalar(
      servidor.dependencias({ zip: await pacote(), console: roteiro.console, preparacao }),
    );

    expect(feito.slice(0, 3)).toEqual([
      'parar W3SVC',
      'início desligado W3SVC',
      'instalar o PostgreSQL',
    ]);
    expect(await existe(pastasDaInstalacao(raiz).estado)).toBe(true);
  });

  it('com o PostgreSQL 18 presente e as respostas do roteiro, a preparação não muda nada (Pré-requisitos presentes)', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    const { preparacao, feito } = await preparacaoSimulada(servidor, { postgres18: true });

    await instalar(
      servidor.dependencias({
        zip: await pacote(),
        console: consoleRoteirizado().console,
        arquivoDeRespostas: await arquivoDeRespostas(),
        preparacao,
      }),
    );

    expect(feito).toEqual([]);
    expect(await existe(pastasDaInstalacao(raiz).estado)).toBe(true);
  });
});

describe('o atalho do menu na instalação (change instalador-e-menu-da-operacao)', () => {
  it('a raiz ganha o Grafite.cmd e o ícone, e a área de trabalho de todos, o atalho (Atalho do menu na instalação)', async () => {
    const servidor = servidorSimuladoDaInstalacao();
    await instalar(
      servidor.dependencias({
        zip: await pacote(),
        console: consoleRoteirizado().console,
        arquivoDeRespostas: await arquivoDeRespostas(),
      }),
    );

    expect(await readFile(join(raiz, 'Grafite.cmd'), 'utf8')).toBe('@echo off\r\n');
    expect(await readFile(join(raiz, 'grafite.ico'), 'utf8')).toBe('ícone');
    expect(servidor.atalhosCriados).toEqual([
      {
        caminho: join(servidor.atalhoDoMenu.areaDeTrabalho, 'Grafite.lnk'),
        alvo: join(raiz, 'Grafite.cmd'),
        icone: join(raiz, 'grafite.ico'),
        pasta: raiz,
        descricao: 'Menu da operação do Grafite',
      },
    ]);
  });

  it('a instalação retomada não cria um segundo atalho', async () => {
    const servidor = servidorSimuladoDaInstalacao({ versaoNaSaude: { 3001: '0.3.0' } });
    const dependencias = async () =>
      servidor.dependencias({
        zip: await pacote(),
        console: consoleRoteirizado().console,
        arquivoDeRespostas: await arquivoDeRespostas(),
      });
    await expect(instalar(await dependencias())).rejects.toThrow('O app do teste respondeu');
    servidor.opcoes.versaoNaSaude = undefined;

    await instalar(await dependencias());

    expect(servidor.atalhosCriados).toHaveLength(1);
    expect(servidor.eventos.filter((evento) => evento.startsWith('atalho '))).toHaveLength(1);
  });
});
