import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AMBIENTE_DO_COLETOR,
  coletorDeDesenvolvimento,
  completarCanaisDoDesenvolvimento,
  completarEnvDeDesenvolvimento,
  dockerEmExecucao,
  gerarEnvDeDesenvolvimento,
  organizacaoDeDesenvolvimento,
  passosDoBanco,
  processosDoDesenvolvimento,
  SERVICOS_DO_COMPOSE,
} from './dev.ts';

function valor(env: string, chave: string): string {
  const linha = env.split('\n').find((l) => l.startsWith(`${chave}=`));
  return linha?.slice(chave.length + 1) ?? '';
}

describe('gerarEnvDeDesenvolvimento', () => {
  it('usa uma senha diferente por papel e monta as URLs com as senhas certas', () => {
    let n = 0;
    const env = gerarEnvDeDesenvolvimento(
      () => `senha${++n}`,
      () => 'chave',
      () => 'token',
    );
    expect(valor(env, 'GRAFITE_DB_SUPERUSER_PASSWORD')).toBe('senha1');
    expect(valor(env, 'GRAFITE_DB_OWNER_PASSWORD')).toBe('senha2');
    expect(valor(env, 'GRAFITE_DB_APP_PASSWORD')).toBe('senha3');
    expect(valor(env, 'GRAFITE_DB_BACKUP_PASSWORD')).toBe('senha4');
    expect(valor(env, 'GRAFITE_AMBIENTE')).toBe('desenvolvimento');

    const app = new URL(valor(env, 'GRAFITE_DATABASE_URL'));
    expect([app.protocol, app.username, app.password, app.host, app.pathname]).toEqual([
      'postgres:',
      'grafite_app',
      'senha3',
      'localhost:5433',
      '/grafite',
    ]);
    const dono = new URL(valor(env, 'GRAFITE_DATABASE_URL_MIGRACOES'));
    expect([dono.username, dono.password, dono.host]).toEqual([
      'grafite_owner',
      'senha2',
      'localhost:5433',
    ]);
  });

  it('traz a chave dos dois passos gerada', () => {
    const env = gerarEnvDeDesenvolvimento(
      () => 'senha',
      () => 'Q0hBVkUgREUgVEVTVEU=',
      () => 'token',
    );
    expect(valor(env, 'GRAFITE_CHAVE_DOIS_PASSOS')).toBe('Q0hBVkUgREUgVEVTVEU=');
  });

  it('traz a chave mestra do cofre gerada, diferente da dos dois passos', () => {
    let n = 0;
    const env = gerarEnvDeDesenvolvimento(
      () => 'senha',
      () => `chave${++n}`,
      () => 'token',
    );
    expect(valor(env, 'GRAFITE_CHAVE_DOIS_PASSOS')).toBe('chave1');
    expect(valor(env, 'GRAFITE_CHAVE_DO_COFRE')).toBe('chave2');
  });

  it('põe os arquivos numa pasta do repositório que o Git ignora', () => {
    const env = gerarEnvDeDesenvolvimento(
      () => 'senha',
      () => 'chave',
      () => 'token',
    );
    expect(valor(env, 'GRAFITE_ARQUIVOS_PASTA')).toBe('.grafite/arquivos');
  });

  it('traz o token do coletor de desenvolvimento gerado', () => {
    const env = gerarEnvDeDesenvolvimento(
      () => 'senha',
      () => 'chave',
      () => 'TOKEN-DO-COLETOR',
    );
    expect(valor(env, 'GRAFITE_COLETOR_TOKEN')).toBe('TOKEN-DO-COLETOR');
  });
});

describe('completarEnvDeDesenvolvimento', () => {
  const nova = () => 'NOVA';
  const senha = () => 'SENHA';
  const token = () => 'TOKEN';

  const pasta = 'GRAFITE_ARQUIVOS_PASTA=.grafite/arquivos\n';
  const backup =
    'GRAFITE_DB_BACKUP_PASSWORD=SENHA\nGRAFITE_AMBIENTE=desenvolvimento\nGRAFITE_COLETOR_TOKEN=TOKEN\nGRAFITE_CHAVE_DO_COFRE=NOVA\n';

  it('acrescenta a chave dos dois passos, a pasta dos arquivos e a senha do backup a um .env que não as tem', () => {
    const antigo = '# Gerado por pnpm dev. Nunca versionar.\nGRAFITE_DB_PORT=5433\n';
    expect(completarEnvDeDesenvolvimento(antigo, nova, senha, token)).toBe(
      `# Gerado por pnpm dev. Nunca versionar.\nGRAFITE_DB_PORT=5433\nGRAFITE_CHAVE_DOIS_PASSOS=NOVA\n${pasta}${backup}`,
    );
  });

  it('acrescenta numa linha própria quando o arquivo não termina em quebra de linha', () => {
    expect(completarEnvDeDesenvolvimento('GRAFITE_DB_PORT=5433', nova, senha, token)).toBe(
      `GRAFITE_DB_PORT=5433\nGRAFITE_CHAVE_DOIS_PASSOS=NOVA\n${pasta}${backup}`,
    );
  });

  it('não troca uma chave, uma pasta, uma senha nem o token do coletor que já existem', () => {
    const env = `GRAFITE_DB_PORT=5433\nGRAFITE_CHAVE_DOIS_PASSOS=ANTIGA\nGRAFITE_ARQUIVOS_PASTA=/srv/arquivos\nGRAFITE_DB_BACKUP_PASSWORD=ANTIGA\nGRAFITE_AMBIENTE=teste\nGRAFITE_COLETOR_TOKEN=ANTIGO\nGRAFITE_CHAVE_DO_COFRE=ANTIGA\n`;
    expect(completarEnvDeDesenvolvimento(env, nova, senha, token)).toBe(env);
  });

  it('acrescenta a chave do cofre a um .env de antes do cofre, sem trocar mais nada', () => {
    const env = `GRAFITE_DB_PORT=5433\nGRAFITE_CHAVE_DOIS_PASSOS=ANTIGA\nGRAFITE_ARQUIVOS_PASTA=/srv/arquivos\nGRAFITE_DB_BACKUP_PASSWORD=ANTIGA\nGRAFITE_AMBIENTE=desenvolvimento\nGRAFITE_COLETOR_TOKEN=ANTIGO\n`;
    expect(completarEnvDeDesenvolvimento(env, nova, senha, token)).toBe(
      `${env}GRAFITE_CHAVE_DO_COFRE=NOVA\n`,
    );
  });

  it('acrescenta só o que falta a um .env que já tem a chave', () => {
    const env = 'GRAFITE_DB_PORT=5433\nGRAFITE_CHAVE_DOIS_PASSOS=ANTIGA\n';
    expect(completarEnvDeDesenvolvimento(env, nova, senha, token)).toBe(`${env}${pasta}${backup}`);
  });

  it('preenche a chave deixada vazia, no mesmo lugar', () => {
    expect(
      completarEnvDeDesenvolvimento(
        'GRAFITE_CHAVE_DOIS_PASSOS=\r\nGRAFITE_DB_PORT=5433\r\nGRAFITE_ARQUIVOS_PASTA=x\r\nGRAFITE_DB_BACKUP_PASSWORD=y\r\nGRAFITE_AMBIENTE=desenvolvimento\r\nGRAFITE_COLETOR_TOKEN=\r\n',
        nova,
        senha,
        token,
      ),
    ).toBe(
      'GRAFITE_CHAVE_DOIS_PASSOS=NOVA\r\nGRAFITE_DB_PORT=5433\r\nGRAFITE_ARQUIVOS_PASTA=x\r\nGRAFITE_DB_BACKUP_PASSWORD=y\r\nGRAFITE_AMBIENTE=desenvolvimento\r\nGRAFITE_COLETOR_TOKEN=TOKEN\r\nGRAFITE_CHAVE_DO_COFRE=NOVA\n',
    );
  });
});

describe('organizacaoDeDesenvolvimento', () => {
  const argumentos = organizacaoDeDesenvolvimento();
  const valores = (opcao: string) =>
    argumentos.flatMap((argumento, i) => (argumento === opcao ? [argumentos[i + 1]] : []));

  it('cria a organização pelo comando no servidor, só se ela ainda não existe', () => {
    expect(argumentos.slice(0, 2)).toEqual(['organizacao', 'criar']);
    expect(argumentos).toContain('--se-nao-existir');
  });

  it('liga a organização aos endereços locais da web e da API', () => {
    expect(valores('--endereco')).toEqual(['localhost', '127.0.0.1']);
  });

  it('a conta admin não exige os dois passos no desenvolvimento', () => {
    expect(valores('--usuario')).toEqual(['admin']);
    expect(argumentos).toContain('--sem-exigir-dois-passos');
  });
});

describe('coletorDeDesenvolvimento', () => {
  const argumentos = coletorDeDesenvolvimento();
  const valores = (opcao: string) =>
    argumentos.flatMap((argumento, i) => (argumento === opcao ? [argumentos[i + 1]] : []));

  it('liga o coletor à organização de desenvolvimento, com a faixa do próprio computador', () => {
    expect(argumentos.slice(0, 2)).toEqual(['coletor', 'criar']);
    expect(valores('--endereco')).toEqual(['localhost']);
    expect(valores('--nome')).toEqual(['Coletor de desenvolvimento']);
    expect(valores('--faixa')).toEqual(['127.0.0.0/8']);
  });

  it('usa o token do .env, sem mostrá-lo, e não cria outro nas execuções seguintes', () => {
    expect(argumentos).toContain('--token-do-ambiente');
    expect(argumentos).toContain('--se-nao-existir');
  });
});

describe('passosDoBanco', () => {
  const passos = passosDoBanco();

  it('garante o papel do backup, aplica as migrations, cria a organização, garante a senha da conta admin e liga o coletor', () => {
    expect(passos.map(({ argumentos }) => argumentos[1])).toEqual([
      'packages/db/scripts/papel-do-backup.ts',
      'packages/db/src/migrar.ts',
      'apps/api/scripts/grafite.ts',
      'apps/api/scripts/desenvolvimento.ts',
      'apps/api/scripts/grafite.ts',
    ]);
    expect(passos[2]?.argumentos.slice(2)).toEqual(organizacaoDeDesenvolvimento());
    expect(passos[4]?.argumentos.slice(2)).toEqual(coletorDeDesenvolvimento());
  });

  it('lê o .env em cada passo', () => {
    for (const { argumentos } of passos) expect(argumentos[0]).toBe('--env-file=.env');
  });

  it('a criação da organização não mostra a senha temporária, que é trocada logo depois', () => {
    expect(passos.map(({ semSaida }) => semSaida ?? false)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
  });
});

describe('processosDoDesenvolvimento', () => {
  const processos = processosDoDesenvolvimento('win32');
  const doColetor = processos.find(({ nome }) => nome === 'coletor');

  it('sobe a API, o coletor e a web', () => {
    expect(processos.map(({ nome }) => nome)).toEqual(['api', 'coletor', 'web']);
  });

  it('o coletor lê o token do .env e fala com a API local pelo endereço da organização', () => {
    expect(doColetor?.argumentos).toEqual([
      '--watch',
      '--env-file=.env',
      'apps/collector/src/servidor.ts',
    ]);
    expect(doColetor?.ambiente).toEqual(AMBIENTE_DO_COLETOR);
    expect(AMBIENTE_DO_COLETOR).toEqual({
      GRAFITE_COLETOR_API_URL: 'http://127.0.0.1:3000',
      GRAFITE_COLETOR_ENDERECO: 'localhost',
      GRAFITE_COLETOR_PASTA: '.grafite/coletor',
    });
  });

  it('o coletor espera a API responder, para a primeira configuração não falhar', () => {
    expect(doColetor?.depoisDaApi).toBe(true);
    expect(processos.find(({ nome }) => nome === 'api')?.depoisDaApi ?? false).toBe(false);
  });
});

describe('dockerEmExecucao', () => {
  it('é falso quando o daemon do Docker não responde', () => {
    const semDaemon = {
      ...process.env,
      DOCKER_HOST:
        process.platform === 'win32'
          ? 'npipe:////./pipe/grafite_inexistente'
          : 'unix:///tmp/grafite_inexistente.sock',
    };
    expect(dockerEmExecucao(semDaemon)).toBe(false);
  });
});

describe('os canais de fora no desenvolvimento', () => {
  const CHAVES = { publica: 'PUBLICA-DO-PUSH', privada: 'PRIVADA-DO-PUSH' };

  it('o .env novo traz o e-mail do Mailpit, a origem dos links e as chaves do push geradas', () => {
    const env = gerarEnvDeDesenvolvimento(
      () => 'senha',
      () => 'chave',
      () => 'token',
      () => CHAVES,
    );
    expect(valor(env, 'GRAFITE_SMTP_URL')).toBe('smtp://127.0.0.1:1025');
    expect(valor(env, 'GRAFITE_EMAIL_REMETENTE')).toBe('"Grafite <grafite@grafite.localhost>"');
    expect(valor(env, 'GRAFITE_ORIGEM_DOS_LINKS')).toBe('http://localhost:5173');
    expect(valor(env, 'GRAFITE_PUSH_CHAVE_PUBLICA')).toBe('PUBLICA-DO-PUSH');
    expect(valor(env, 'GRAFITE_PUSH_CHAVE_PRIVADA')).toBe('PRIVADA-DO-PUSH');
    expect(valor(env, 'GRAFITE_PUSH_CONTATO')).toBe('mailto:grafite@grafite.localhost');
  });

  it('o .env de antes ganha os canais, gerados uma vez, sem trocar o que já tem', () => {
    const antigo = 'GRAFITE_DB_PORT=5433\nGRAFITE_SMTP_URL=smtp://smtp.empresa.local:25\n';
    let geradas = 0;
    const gerar = () => {
      geradas += 1;
      return CHAVES;
    };
    const completo = completarCanaisDoDesenvolvimento(antigo, gerar);
    expect(valor(completo, 'GRAFITE_SMTP_URL')).toBe('smtp://smtp.empresa.local:25');
    expect(valor(completo, 'GRAFITE_PUSH_CHAVE_PUBLICA')).toBe('PUBLICA-DO-PUSH');
    expect(valor(completo, 'GRAFITE_PUSH_CHAVE_PRIVADA')).toBe('PRIVADA-DO-PUSH');
    expect(geradas).toBe(1);
    expect(completarCanaisDoDesenvolvimento(completo, gerar)).toBe(completo);
    expect(geradas).toBe(1);
  });

  it('com só uma das chaves do push, não gera outro par', () => {
    const env = 'GRAFITE_PUSH_CHAVE_PUBLICA=ANTIGA\n';
    const completo = completarCanaisDoDesenvolvimento(env, () => CHAVES);
    expect(valor(completo, 'GRAFITE_PUSH_CHAVE_PUBLICA')).toBe('ANTIGA');
    expect(valor(completo, 'GRAFITE_PUSH_CHAVE_PRIVADA')).toBe('');
  });

  it('o compose sobe o banco e o Mailpit, com o Mailpit só no próprio computador', () => {
    expect(SERVICOS_DO_COMPOSE).toEqual(['db', 'email']);
    const compose = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'compose.yaml'),
      'utf8',
    );
    expect(compose).toContain('image: axllent/mailpit:v1.24.1');
    expect(compose).toContain('"127.0.0.1:1025:1025"');
    expect(compose).toContain('"127.0.0.1:8025:8025"');
  });
});
