import { afterEach, describe, expect, it } from 'vitest';
import {
  type ExecutarProcesso,
  executarProcesso,
  type FerramentasDoPostgres,
  ferramentasLocais,
  ferramentasNoConteiner,
  separarSenha,
  versaoDoPgDump,
} from './postgres.ts';

interface Chamada {
  arquivo: string;
  argumentos: string[];
  env: Record<string, string | undefined>;
  entrada: string | undefined;
}

function processoFalso(resultado = { codigo: 0, saida: '', erro: '' }) {
  const chamadas: Chamada[] = [];
  const executar: ExecutarProcesso = async (arquivo, argumentos, opcoes) => {
    chamadas.push({ arquivo, argumentos, env: opcoes.env, entrada: opcoes.entrada });
    return resultado;
  };
  return { chamadas, executar };
}

const herdada = process.env.PGPASSWORD;
afterEach(() => {
  if (herdada === undefined) delete process.env.PGPASSWORD;
  else process.env.PGPASSWORD = herdada;
});

describe('ferramentasLocais', () => {
  it('roda o binário da pasta do PostgreSQL no Windows, com os argumentos como vieram', async () => {
    const { chamadas, executar } = processoFalso();
    const ferramentas = ferramentasLocais('C:\\Program Files\\PostgreSQL\\18\\bin', {
      executar,
      plataforma: 'win32',
    });
    await ferramentas.executar('pg_dump', [
      '-Fc',
      '--file=D:\\Backups\\Grafite Produção\\banco.dump',
    ]);
    expect(chamadas.map(({ arquivo, argumentos }) => ({ arquivo, argumentos }))).toEqual([
      {
        arquivo: 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
        argumentos: ['-Fc', '--file=D:\\Backups\\Grafite Produção\\banco.dump'],
      },
    ]);
  });

  it('fora do Windows, o binário não tem extensão', async () => {
    const { chamadas, executar } = processoFalso();
    await ferramentasLocais('/usr/lib/postgresql/18/bin', {
      executar,
      plataforma: 'linux',
    }).executar('pg_restore', ['--list', 'banco.dump']);
    expect(chamadas[0]?.arquivo).toBe('/usr/lib/postgresql/18/bin/pg_restore');
  });

  it('passa a senha pelo PGPASSWORD e nunca nos argumentos', async () => {
    const { chamadas, executar } = processoFalso();
    await ferramentasLocais('bin', { executar, plataforma: 'linux' }).executar(
      'psql',
      ['--dbname=postgres://grafite_backup@127.0.0.1:5432/grafite'],
      { senha: 's3gr3d0' },
    );
    expect(chamadas[0]?.env.PGPASSWORD).toBe('s3gr3d0');
    expect(chamadas[0]?.argumentos.join(' ')).not.toContain('s3gr3d0');
  });

  it('sem senha, não herda um PGPASSWORD do ambiente', async () => {
    process.env.PGPASSWORD = 'herdada';
    const { chamadas, executar } = processoFalso();
    await ferramentasLocais('bin', { executar, plataforma: 'linux' }).executar('pg_ctl', [
      'status',
    ]);
    expect(chamadas[0]?.env.PGPASSWORD).toBeUndefined();
  });

  it('manda a entrada pelo stdin', async () => {
    const { chamadas, executar } = processoFalso();
    await ferramentasLocais('bin', { executar, plataforma: 'linux' }).executar('psql', ['-tA'], {
      entrada: 'select 1;',
    });
    expect(chamadas[0]?.entrada).toBe('select 1;');
  });

  it('devolve o código e a saída do erro', async () => {
    const { executar } = processoFalso({
      codigo: 1,
      saida: '',
      erro: 'pg_dump: error: connection to server failed',
    });
    await expect(
      ferramentasLocais('bin', { executar, plataforma: 'linux' }).executar('pg_dump', ['-Fc']),
    ).resolves.toEqual({
      codigo: 1,
      saida: '',
      erro: 'pg_dump: error: connection to server failed',
    });
  });
});

describe('executarProcesso', () => {
  it('passa o ambiente e a entrada, e devolve o código, a saída e o erro', async () => {
    const roteiro = [
      "let e = '';",
      "process.stdin.on('data', (d) => (e += d));",
      "process.stdin.on('end', () => {",
      '  process.stdout.write(e.toUpperCase());',
      "  process.stderr.write(process.env.PGPASSWORD ?? '');",
      '  process.exitCode = 3;',
      '});',
    ].join('\n');
    const resultado = await executarProcesso(process.execPath, ['-e', roteiro], {
      env: { ...process.env, PGPASSWORD: 'segredo' },
      entrada: 'olá, açúcar',
    });
    expect(resultado).toEqual({ codigo: 3, saida: 'OLÁ, AÇÚCAR', erro: 'segredo' });
  });

  it('recusa com o motivo quando o binário não existe', async () => {
    await expect(
      executarProcesso('C:\\nao-existe\\pg_dump.exe', ['--version'], { env: {} }),
    ).rejects.toThrow(/Não foi possível executar C:\\nao-existe\\pg_dump\.exe/);
  });
});

describe('ferramentasNoConteiner', () => {
  it('roda a ferramenta no contêiner, com a senha no ambiente', async () => {
    const chamadas: { comando: string[]; env?: Record<string, string> }[] = [];
    const ferramentas = ferramentasNoConteiner(async (comando, opcoes) => {
      chamadas.push({ comando, env: opcoes?.env });
      return { codigo: 0, saida: 'ok', erro: '' };
    });
    await expect(ferramentas.executar('pg_dump', ['--version'], { senha: 's' })).resolves.toEqual({
      codigo: 0,
      saida: 'ok',
      erro: '',
    });
    expect(chamadas).toEqual([{ comando: ['pg_dump', '--version'], env: { PGPASSWORD: 's' } }]);
  });

  it('troca nos argumentos a pasta do host e o endereço do banco pelos de dentro do contêiner', async () => {
    const chamadas: string[][] = [];
    const ferramentas = ferramentasNoConteiner(
      async (comando) => {
        chamadas.push(comando);
        return { codigo: 0, saida: '', erro: '' };
      },
      {
        pasta: { noHost: 'C:\\Temp\\grafite-backup', noConteiner: '/compartilhada' },
        endereco: { doHost: 'localhost:54321', doConteiner: '127.0.0.1:5432' },
      },
    );
    await ferramentas.executar('pg_dump', [
      '--format=custom',
      '--file=C:\\Temp\\grafite-backup\\destino um\\2026-10-07T0500Z.parcial\\banco.dump',
      '--dbname=postgres://grafite_backup@localhost:54321/grafite',
    ]);
    expect(chamadas).toEqual([
      [
        'pg_dump',
        '--format=custom',
        '--file=/compartilhada/destino um/2026-10-07T0500Z.parcial/banco.dump',
        '--dbname=postgres://grafite_backup@127.0.0.1:5432/grafite',
      ],
    ]);
  });

  it('manda a entrada pelo ambiente para o stdin da ferramenta', async () => {
    const chamadas: { comando: string[]; env?: Record<string, string> }[] = [];
    const ferramentas = ferramentasNoConteiner(async (comando, opcoes) => {
      chamadas.push({ comando, env: opcoes?.env });
      return { codigo: 0, saida: '', erro: '' };
    });
    await ferramentas.executar('psql', ['-tA'], { entrada: 'select 1;' });
    expect(chamadas).toEqual([
      {
        comando: ['sh', '-c', 'printf "%s" "$GRAFITE_ENTRADA" | "$@"', 'sh', 'psql', '-tA'],
        env: { GRAFITE_ENTRADA: 'select 1;' },
      },
    ]);
  });
});

describe('separarSenha', () => {
  it('tira a senha da conexão e a devolve decodificada, para ir pelo PGPASSWORD', () => {
    const conexao = new URL('postgres://grafite_backup@127.0.0.1:5432/grafite?sslmode=disable');
    conexao.password = encodeURIComponent('s@nhã/1');
    expect(separarSenha(conexao.toString())).toEqual({
      url: 'postgres://grafite_backup@127.0.0.1:5432/grafite?sslmode=disable',
      senha: 's@nhã/1',
    });
  });
});

describe('versaoDoPgDump', () => {
  const ferramentasQueRespondem = (resultado: {
    codigo: number;
    saida: string;
    erro: string;
  }): FerramentasDoPostgres => ({ executar: async () => resultado });

  it('lê a versão maior e a completa', async () => {
    await expect(
      versaoDoPgDump(
        ferramentasQueRespondem({
          codigo: 0,
          saida: 'pg_dump (PostgreSQL) 18.1 (Debian 18.1-1.pgdg13+2)\n',
          erro: '',
        }),
      ),
    ).resolves.toEqual({ maior: 18, completa: '18.1' });
  });

  it('recusa com o erro da ferramenta', async () => {
    await expect(
      versaoDoPgDump(ferramentasQueRespondem({ codigo: 1, saida: '', erro: 'falhou' })),
    ).rejects.toThrow('O pg_dump não respondeu a versão: falhou');
  });

  it('recusa uma resposta que não é a de um pg_dump', async () => {
    await expect(
      versaoDoPgDump(ferramentasQueRespondem({ codigo: 0, saida: 'outro programa 1.0', erro: '' })),
    ).rejects.toThrow('O pg_dump não respondeu a versão: outro programa 1.0');
  });
});
