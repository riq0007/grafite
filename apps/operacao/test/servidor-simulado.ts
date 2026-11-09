// Um servidor Windows simulado para os testes do comando de operação: os processos (o Node das
// versões, o icacls, o netsh, o sc.exe e o Caddy), as ferramentas do PostgreSQL, os serviços, as
// portas e a saúde. Cada passo vira um evento, na ordem, e cada argumento de processo fica anotado, para os
// testes conferirem a sequência e que nenhum segredo vaza. As junções e os arquivos são de verdade,
// numa pasta temporária no lugar de C:\Grafite; a saúde responde a versão para onde a junção
// `atual` do ambiente aponta, e só com o serviço rodando.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import {
  type ExecutarProcesso,
  type FerramentaDoPostgres,
  type FerramentasDoPostgres,
  type ResultadoDaFerramenta,
  sha256DoArquivo,
  zipar,
} from '@grafite/operacao';
import type { BackupDoServidor, BackupPronto } from '../src/backup.ts';
import type { AmbienteInstalado, EstadoDaInstalacao } from '../src/estado.ts';
import { PORTAS, SERVICOS } from '../src/layout.ts';
import type { Saude } from '../src/saude.ts';
import type { AtalhoDoMenu, DefinicaoDoAtalho } from '../src/windows/atalhos.ts';
import { type Juncoes, juncoesDoSistema } from '../src/windows/juncoes.ts';
import type { EstadoDoServico, Servicos } from '../src/windows/servicos.ts';

export const NODE = 'node.exe';

export const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

/**
 * As migrations do diário de uma versão de exemplo: a 0.4.0 tem duas, e cada versão menor seguinte,
 * uma a mais. O momento de cada uma é o que o migrador grava em drizzle.__drizzle_migrations.
 */
export function migracoesDaVersao(versao: string): { tag: string; when: number }[] {
  const quantas = Number(versao.split('.')[1]) - 2;
  return Array.from({ length: quantas }, (_, i) => ({
    tag: `${String(i).padStart(4, '0')}_migracao_${i}`,
    when: 1_000 * (i + 1),
  }));
}

/** O pacote de exemplo da versão, com o .sha256 ao lado, como a release publica. */
export async function pacoteDeExemplo(pasta: string, versao: string): Promise<string> {
  const origem = join(pasta, `montagem-${versao}`);
  const arquivos: Record<string, string> = {
    'pacote.json': JSON.stringify({
      versao,
      links: [{ caminho: 'node_modules/@grafite/db', alvo: 'packages/db' }],
    }),
    'grafite.ps1': '# o lançador',
    'Grafite.cmd': '@echo off\r\n',
    'grafite.ico': 'ícone',
    'ferramentas/WinSW.exe': 'winsw',
    'ferramentas/caddy.exe': 'caddy',
    'packages/db/src/migrar.ts': '// as migrations',
    'packages/db/migrations/meta/_journal.json': JSON.stringify({
      entries: migracoesDaVersao(versao),
    }),
    'apps/api/scripts/grafite.ts': '// o comando da API',
  };
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const caminho = join(origem, ...nome.split('/'));
    await mkdir(join(caminho, '..'), { recursive: true });
    await writeFile(caminho, conteudo);
  }
  const nome = `grafite-${versao}-windows-x64.zip`;
  const zip = join(pasta, nome);
  await zipar(origem, zip);
  await writeFile(`${zip}.sha256`, `${await sha256DoArquivo(zip)}  ${nome}\n`);
  return zip;
}

export interface ChamadaDaFerramenta {
  ferramenta: FerramentaDoPostgres;
  argumentos: string[];
  entrada?: string;
  senha?: string;
}

export interface OpcoesDoServidor {
  raiz: string;
  /** A pasta dos binários do PostgreSQL que o comando deve usar. */
  pgBin: string;
  /** O pg_dump não existe na pasta do PostgreSQL. */
  semPostgres?: boolean;
  /** As migrations falham, uma vez, no banco com este nome. */
  migracaoFalhaNo?: string;
  /** A versão que a saúde de uma porta responde, no lugar da versão da junção `atual`. */
  versaoNaSaude?: Partial<Record<number, string>>;
  /** Os endereços de cada ambiente, para a saúde pelo proxy. */
  enderecos?: Record<AmbienteInstalado, string[]>;
  /** Uma resposta do psql antes das padrão, como a de uma consulta. */
  psql?: (chamada: ChamadaDaFerramenta) => Partial<ResultadoDaFerramenta> | undefined;
  /** O serviço que não sobe. */
  servicoQueNaoSobe?: string;
  /** O backup da produção falha com esta mensagem. */
  backupFalha?: string;
  /** A conferência de qualquer backup acha o dump alterado. */
  backupCorrompido?: boolean;
  /** O pg_restore falha com esta mensagem. */
  pgRestoreFalha?: string;
  /** O momento dos backups feitos pelo comando. */
  agora?: () => Date;
  /** As portas que outro programa ocupa, como a 80 com o IIS. */
  portasOcupadas?: number[];
  /** O comando da API que troca a chave do cofre falha no banco com este nome, uma vez. */
  trocaDaChaveFalhaNo?: string;
}

export function servidorSimulado(iniciais: OpcoesDoServidor) {
  // As opções podem mudar no meio do teste, como uma migration que passa a falhar.
  const opcoes = { ...iniciais };
  const { raiz } = opcoes;
  const eventos: string[] = [];
  const argumentos: string[][] = [];
  const estados = new Map<string, EstadoDoServico>();
  /** A versão cujas migrations cada banco tem, pelo nome do banco. */
  const migrado = new Map<string, string>();
  /** Os tokens dos coletores ligados à organização da produção. */
  const coletores = new Set<string>();
  const naRaiz = (caminho: string) => relative(raiz, caminho).split(sep).join('/');
  /** Os atalhos criados na área de trabalho de todos os usuários, que fica fora da raiz. */
  const atalhosCriados: DefinicaoDoAtalho[] = [];
  const atalhoDoMenu: AtalhoDoMenu = {
    areaDeTrabalho: join(raiz, '..', 'Desktop'),
    atalhos: {
      existe: async (caminho) => atalhosCriados.some((atalho) => atalho.caminho === caminho),
      criar: async (definicao) => {
        atalhosCriados.push(definicao);
        eventos.push(`atalho ${basename(definicao.caminho)} → ${naRaiz(definicao.alvo)}`);
      },
    },
  };

  const executar: ExecutarProcesso = async (arquivo, args, { env }) => {
    argumentos.push([arquivo, ...args]);
    const ok = { codigo: 0, saida: '', erro: '' };
    if (arquivo === NODE && args[0]?.endsWith('migrar.ts')) {
      const banco = new URL(env.GRAFITE_DATABASE_URL_MIGRACOES ?? '').pathname.slice(1);
      const versao = basename(join(args[0], '..', '..', '..', '..'));
      eventos.push(`migrar ${banco} com a ${versao}`);
      if (opcoes.migracaoFalhaNo === banco) {
        opcoes.migracaoFalhaNo = undefined;
        return { codigo: 1, saida: '', erro: 'error: relation "x" does not exist' };
      }
      migrado.set(banco, versao);
      return { ...ok, saida: 'Migrations aplicadas.\n' };
    }
    if (arquivo === NODE && args[0]?.endsWith('grafite.ts')) {
      const url = env.GRAFITE_DATABASE_URL;
      const banco = url === undefined ? '(sem banco)' : new URL(url).pathname.slice(1);
      const token = env.GRAFITE_COLETOR_TOKEN;
      const comToken = token === undefined ? '' : ' [GRAFITE_COLETOR_TOKEN no ambiente]';
      const comAnterior =
        env.GRAFITE_CHAVE_DO_COFRE_ANTERIOR === undefined ? '' : ' [com a chave anterior]';
      eventos.push(`api ${banco} ${args.slice(1).join(' ')}${comToken}${comAnterior}`);
      if (args[1] === 'cofre' && args[2] === 'trocar-chave') {
        if (opcoes.trocaDaChaveFalhaNo === banco) {
          opcoes.trocaDaChaveFalhaNo = undefined;
          return { codigo: 1, saida: '', erro: 'não foi possível ler os segredos\n' };
        }
        return {
          ...ok,
          saida: 'Organização "Empresa": 3 segredos passaram para a chave nova.\n',
        };
      }
      if (args[1] === 'email' && args[2] === 'testar') {
        const para = args[args.indexOf('--para') + 1] ?? '';
        const smtp = env.GRAFITE_SMTP_URL;
        if (smtp === undefined) {
          return { codigo: 2, saida: '', erro: 'GRAFITE_SMTP_URL: obrigatório para o teste.\n' };
        }
        if (decodeURIComponent(new URL(smtp).password) === 'senha-errada') {
          return {
            codigo: 1,
            saida: '',
            erro: 'O servidor de e-mail recusou a autenticação. (535 Authentication failed)\n',
          };
        }
        return { ...ok, saida: `O servidor de e-mail aceitou o e-mail de teste para ${para}.\n` };
      }
      if (args[1] === 'coletor' && args[2] === 'criar') {
        if (token !== undefined && coletores.has(token) && args.includes('--se-nao-existir')) {
          return {
            ...ok,
            saida: 'O coletor "Servidor" já existe nesta organização; nada foi criado.\n',
          };
        }
        if (token !== undefined) coletores.add(token);
        return {
          ...ok,
          saida:
            'Coletor "Servidor" criado na organização do endereço grafite.empresa.com.br.\nO token é o de GRAFITE_COLETOR_TOKEN, na configuração do coletor.\nSem faixas, o coletor não coleta: cadastre as faixas na tela dos coletores.\n',
        };
      }
      return {
        ...ok,
        saida:
          'Organização "Empresa" criada, com o endereço grafite.empresa.com.br.\nSenha temporária: TEMP-1234\nGuarde esta senha agora: ela não aparece de novo.\n',
      };
    }
    if (arquivo === 'icacls.exe') eventos.push(`acl ${naRaiz(args[0] ?? '')}`);
    else if (arquivo === 'netsh.exe') {
      if (args[2] === 'add') eventos.push(`firewall ${args.at(-1)?.replace('localport=', '')}`);
    } else if (arquivo === 'sc.exe' && args[0] === 'qc') {
      // A configuração do serviço do PostgreSQL da produção, com a pasta dos dados no -D.
      const dados = join(opcoes.pgBin, '..', 'data');
      return {
        ...ok,
        saida: `        BINARY_PATH_NAME   : "${join(opcoes.pgBin, 'pg_ctl.exe')}" runservice -N "${args[1]}" -D "${dados}" -w
`,
      };
    } else if (arquivo === 'sc.exe') eventos.push(`sc ${args[0]} ${args[1]}`);
    else if (arquivo === 'explorer.exe') eventos.push(`explorer ${naRaiz(args[0] ?? '')}`);
    else if (arquivo.endsWith('caddy.exe')) eventos.push(`caddy ${args[0]}`);
    else if (arquivo === 'powershell.exe') {
      // A consulta de quem escuta nas portas: responde as ocupadas, uma por linha.
      const portas = (/-in ([\d,]+)/.exec(args.at(-1) ?? '')?.[1] ?? '').split(',').map(Number);
      eventos.push(`portas ${portas.join(' e ')}`);
      const ocupadas = portas.filter((porta) => opcoes.portasOcupadas?.includes(porta));
      return { ...ok, saida: ocupadas.map((porta) => `${porta}\r\n`).join('') };
    } else throw new Error(`Processo inesperado: ${arquivo}`);
    return ok;
  };

  const ferramentas = (pgBin: string): FerramentasDoPostgres => ({
    async executar(ferramenta, args, { entrada, senha } = {}) {
      if (pgBin !== opcoes.pgBin) throw new Error(`As ferramentas de outra pasta: ${pgBin}`);
      argumentos.push([ferramenta, ...args]);
      const ok = { codigo: 0, saida: '', erro: '' };
      if (ferramenta === 'pg_dump' && args[0] === '--version') {
        eventos.push('pg_dump --version');
        if (opcoes.semPostgres) {
          throw new Error('Não foi possível executar pg_dump.exe: spawn ENOENT');
        }
        return { ...ok, saida: 'pg_dump (PostgreSQL) 18.1\n' };
      }
      if (ferramenta === 'psql') {
        // O rótulo do evento: a consulta conhecida, o banco do \connect ou o comentário do SQL.
        const conexao = new URL(args.find((a) => a.startsWith('--dbname='))?.slice(9) ?? '');
        const banco = conexao.pathname.slice(1);
        let rotulo: string;
        if (args.some((a) => a.includes('drizzle.__drizzle_migrations'))) {
          rotulo = `migrations de ${banco}`;
        } else if (args.includes('--command=show server_version_num')) rotulo = 'versão';
        else {
          const alvo =
            /\\connect (\w+)/.exec(entrada ?? '')?.[1] ?? /^-- (.*)$/m.exec(entrada ?? '')?.[1];
          rotulo = `${args.includes('--record-separator-zero') ? 'consulta ' : ''}${alvo}`;
        }
        eventos.push(`psql ${conexao.port} ${rotulo}`);
        const resposta = opcoes.psql?.({ ferramenta, argumentos: args, entrada, senha });
        if (resposta !== undefined) return { ...ok, ...resposta };
        if (rotulo === 'versão') return { ...ok, saida: '180001\n' };
        if (rotulo.startsWith('migrations de ')) {
          const versao = migrado.get(banco);
          const momentos = versao === undefined ? [] : migracoesDaVersao(versao).map((m) => m.when);
          return { ...ok, saida: momentos.map((momento) => `${momento}\n`).join('') };
        }
        return ok;
      }
      if (ferramenta === 'pg_restore') {
        const alvo = args.find((a) => a.startsWith('--dbname='));
        eventos.push(
          `pg_restore ${alvo === undefined ? args[0] : new URL(alvo.slice(9)).pathname.slice(1)}`,
        );
        if (opcoes.pgRestoreFalha !== undefined) {
          return { codigo: 1, saida: '', erro: opcoes.pgRestoreFalha };
        }
        return ok;
      }
      if (ferramenta === 'initdb') {
        eventos.push('initdb');
        const dados = args.find((a) => a.startsWith('--pgdata='))?.slice(9) ?? '';
        await mkdir(dados, { recursive: true });
        await writeFile(join(dados, 'PG_VERSION'), '18\n');
        await writeFile(join(dados, 'postgresql.conf'), '');
        return ok;
      }
      eventos.push(`${ferramenta} ${args[0]}`);
      if (ferramenta === 'pg_ctl') estados.set(args[2] ?? '', 'parado');
      return ok;
    },
  });

  const servicos: Servicos = {
    async registrar(definicao) {
      eventos.push(`registrar ${definicao.id}`);
      if (!estados.has(definicao.id)) estados.set(definicao.id, 'parado');
    },
    async iniciar(id) {
      eventos.push(`iniciar ${id}`);
      if (id === opcoes.servicoQueNaoSobe) {
        throw new Error(
          `O serviço ${id} não ficou rodando a tempo. Veja o log dele na pasta logs.`,
        );
      }
      estados.set(id, 'rodando');
    },
    async parar(id) {
      eventos.push(`parar ${id}`);
      estados.set(id, 'parado');
    },
    estado: async (id) => estados.get(id) ?? 'ausente',
  };

  const reais = juncoesDoSistema();
  const juncoes: Juncoes = {
    async apontar(juncao, alvo) {
      eventos.push(`junção ${naRaiz(juncao)} → ${naRaiz(alvo)}`);
      await reais.apontar(juncao, alvo);
    },
    ler: (juncao) => reais.ler(juncao),
  };

  const enderecos = opcoes.enderecos ?? {
    producao: ['grafite.empresa.com.br'],
    teste: ['grafite-teste.empresa.com.br'],
  };
  const respostaDoAmbiente = async (ambiente: AmbienteInstalado, onde: string) => {
    const servico = ambiente === 'producao' ? SERVICOS.producao : SERVICOS.teste;
    if (estados.get(servico) !== 'rodando') {
      throw new Error(`${onde} não respondeu com saúde em 120 s: connect ECONNREFUSED.`);
    }
    const porta = PORTAS[ambiente];
    const versao =
      opcoes.versaoNaSaude?.[porta] ??
      basename((await reais.ler(join(raiz, ambiente, 'atual'))) ?? '');
    return { status: 'ok', versao, ambiente };
  };
  const saude: Saude = {
    async local(porta) {
      eventos.push(`saúde ${porta}`);
      const onde = `O app em 127.0.0.1:${porta}`;
      if (porta === PORTAS.producao) return respostaDoAmbiente('producao', onde);
      if (porta === PORTAS.teste) return respostaDoAmbiente('teste', onde);
      if (estados.get(SERVICOS.coletor) !== 'rodando') {
        throw new Error(`${onde} não respondeu com saúde em 120 s: connect ECONNREFUSED.`);
      }
      return { status: 'ok', versao: '0.1.0' };
    },
    async peloProxy(endereco, { raiz: raizDaAc } = {}) {
      eventos.push(`saúde https://${endereco}${raizDaAc ? ` com ${naRaiz(raizDaAc)}` : ''}`);
      // Os endereços da produção são os do estado, que o comando muda; antes dele, os das opções.
      const daProducao = await readFile(join(raiz, 'operacao.json'), 'utf8')
        .then((texto) => (JSON.parse(texto) as EstadoDaInstalacao).ambientes.producao.enderecos)
        .catch(() => enderecos.producao);
      const ambiente = daProducao.includes(endereco) ? 'producao' : 'teste';
      return respostaDoAmbiente(ambiente, `O endereço https://${endereco}`);
    },
  };

  /** Os backups da produção, do mais antigo ao mais novo. */
  const backups: BackupPronto[] = [];
  /** Grava um backup, com o dump e o zip dos arquivos de verdade, como se tivesse sido feito. */
  async function gravarBackup(criadoEm: Date): Promise<BackupPronto> {
    const nome = `${criadoEm.toISOString().slice(0, 16).replace(':', '')}Z`;
    const pasta = join(raiz, 'backups', 'grafite-producao', nome);
    await mkdir(pasta, { recursive: true });
    await writeFile(join(pasta, 'banco.dump'), 'o dump');
    const arquivos = join(raiz, '..', `arquivos-do-backup-${nome}`);
    await mkdir(join(arquivos, 'fotos'), { recursive: true });
    await writeFile(join(arquivos, 'fotos', 'ana.webp'), 'a foto da Ana');
    await zipar(arquivos, join(pasta, 'arquivos.zip'));
    const pronto = { nome, pasta, criadoEm };
    backups.push(pronto);
    return pronto;
  }
  const backup: BackupDoServidor = {
    async fazer() {
      eventos.push('backup da produção');
      if (opcoes.backupFalha !== undefined) throw new Error(opcoes.backupFalha);
      return gravarBackup(opcoes.agora?.() ?? new Date('2026-10-08T15:00:00.000Z'));
    },
    maisNovo: async () => backups.at(-1) ?? null,
    async listar() {
      eventos.push('listar os backups');
      return [
        {
          destino: join(raiz, 'backups'),
          backups: backups.map(({ nome, criadoEm }) => ({
            nome,
            criadoEm,
            tamanho: 3 * 1024 * 1024,
            versao: '0.4.0',
          })),
        },
      ];
    },
    registros: async () => ({
      ultimoBackup:
        backups.length === 0
          ? null
          : { situacao: 'feito', momento: backups.at(-1)?.criadoEm ?? new Date() },
      ultimoTeste: null,
    }),
    async testar() {
      eventos.push('testar a restauração');
      const ultimo = backups.at(-1);
      if (ultimo === undefined) throw new Error('Nenhum backup pronto para testar.');
      return { backup: ultimo.nome, detalhes: { tabelas: 42, linhas: 1234, arquivos: 1 } };
    },
    async conferir(pasta) {
      eventos.push(`conferir ${naRaiz(pasta)}`);
      if (opcoes.backupCorrompido) {
        throw new Error(
          `O backup em ${pasta} não passou na conferência: A parte banco.dump não confere com o hash do manifesto.`,
        );
      }
      return {
        versao: '0.4.0',
        migracoes: [],
        criadoEm: '2026-10-08T15:00:00.000Z',
        linhas: {},
        partes: {
          'banco.dump': { tamanho: 1, sha256: '0'.repeat(64) },
          'arquivos.zip': { tamanho: 1, sha256: '0'.repeat(64) },
        },
      };
    },
  };

  let senhas = 0;
  return {
    opcoes,
    migrado,
    coletores,
    backups,
    gravarBackup,
    backup,
    eventos,
    argumentos,
    estados,
    naRaiz,
    executar,
    ferramentas,
    servicos,
    juncoes,
    saude,
    atalhoDoMenu,
    atalhosCriados,
    node: NODE,
    gerarSenha: () => `S3GR3D0-${++senhas}`,
    gerarChave: () => 'Q0hBVkUtREUtMzItQllURVMtUEFSQS1PUy1UT1RQLi4=',
    gerarChavesDoPush: () => ({ publica: `B${'P'.repeat(86)}`, privada: 'Q'.repeat(43) }),
    segredosGerados: () => senhas,
  };
}
