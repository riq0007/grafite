import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  completarChaveDoCofre,
  completarChavesDoPush,
  completarSegredos,
  gravarConfiguracoes,
  lerSegredos,
  type Segredos,
  variaveisDaProducao,
  variaveisDoColetor,
  variaveisDoProxy,
  variaveisDoTeste,
} from './ambientes.ts';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import { pastasDaInstalacao } from './layout.ts';
import type { RespostasDaInstalacao } from './respostas.ts';

let raiz: string;

beforeEach(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'grafite-ambientes-'));
});

afterEach(async () => {
  await rm(raiz, { recursive: true, force: true });
});

const respostas = (
  certificado: RespostasDaInstalacao['certificado'] = { modo: 'interno', ac: 'caddy' },
): RespostasDaInstalacao => ({
  raiz,
  pgBin: join(raiz, 'PostgreSQL', '18', 'bin'),
  enderecos: ['grafite.empresa.com.br', 'grafite.matriz.empresa.com.br'],
  mapaDoTeste: {
    'grafite.empresa.com.br': 'grafite-teste.empresa.com.br',
    'grafite.matriz.empresa.com.br': 'grafite-teste.matriz.empresa.com.br',
  },
  certificado,
  backup: {
    destinos: [join(raiz, 'backups'), join(raiz, 'nas', 'Backups')],
    janela: '01:00-05:00',
  },
  organizacao: { nome: 'Empresa', pessoa: 'Ana Souza', usuario: 'ana' },
});

/** A conexão esperada, montada aqui para o texto do teste não parecer uma conexão de verdade. */
const conexao = (papel: string, senha: string, porta: number, banco: string) =>
  ['postgres://', papel, ':', senha, '@127.0.0.1:', porta, '/', banco].join('');

const SEGREDOS: Segredos = {
  producao: { dono: 'p-dono', app: 'p-app', backup: 'p-backup' },
  teste: { dono: 't-dono', app: 't-app', superusuario: 't-postgres' },
  chaveDoisPassos: 'Y2hhdmUtZGUtMzItYnl0ZXMtZGUtZXhlbXBsby4uLi4=',
  chaveDoCofre: 'Y2hhdmUtbWVzdHJhLWRvLWNvZnJlLWRlLWV4ZW1wbG8=',
  tokenDoColetor: 'token-do-coletor',
  push: { publica: 'publica-do-push', privada: 'privada-do-push' },
};

describe('as variáveis de cada ambiente', () => {
  it('a produção: o app só em 127.0.0.1:3000, o banco 5432, o backup e a operadora', () => {
    const pastas = pastasDaInstalacao(raiz);
    expect(variaveisDaProducao(respostas(), SEGREDOS)).toEqual({
      GRAFITE_AMBIENTE: 'producao',
      NODE_ENV: 'production',
      GRAFITE_API_HOST: '127.0.0.1',
      GRAFITE_API_PORTA: '3000',
      GRAFITE_DATABASE_URL: conexao('grafite_app', 'p-app', 5432, 'grafite'),
      GRAFITE_DATABASE_URL_MIGRACOES: conexao('grafite_owner', 'p-dono', 5432, 'grafite'),
      GRAFITE_WEB_PASTA: join(pastas.producao.atual, 'web'),
      GRAFITE_ARQUIVOS_PASTA: pastas.producao.arquivos,
      GRAFITE_CHAVE_DOIS_PASSOS: SEGREDOS.chaveDoisPassos,
      GRAFITE_CHAVE_DO_COFRE: SEGREDOS.chaveDoCofre,
      GRAFITE_PROXIES_CONFIAVEIS: '127.0.0.1,::1',
      GRAFITE_ORGANIZACAO_OPERADORA: 'grafite.empresa.com.br',
      GRAFITE_BACKUP_DESTINOS: `${join(raiz, 'backups')};${join(raiz, 'nas', 'Backups')}`,
      GRAFITE_BACKUP_RETENCAO: '7,4,12',
      GRAFITE_BACKUP_JANELA: '01:00-05:00',
      GRAFITE_BACKUP_TESTE: 'semanal',
      GRAFITE_BACKUP_URL: conexao('grafite_backup', 'p-backup', 5432, 'grafite'),
      GRAFITE_RESTAURACAO_URL: conexao('postgres', 't-postgres', 5433, 'postgres'),
      GRAFITE_PG_BIN: join(raiz, 'PostgreSQL', '18', 'bin'),
      GRAFITE_CERTIFICADO_VIGIAR: 'grafite.empresa.com.br',
      GRAFITE_PUSH_CHAVE_PUBLICA: 'publica-do-push',
      GRAFITE_PUSH_CHAVE_PRIVADA: 'privada-do-push',
      GRAFITE_PUSH_CONTATO: 'https://grafite.empresa.com.br',
      NODE_EXTRA_CA_CERTS: pastas.raizDaAcDoCaddy,
    });
  });

  it('o teste: o app só em 127.0.0.1:3001, a instância 5433, as mesmas chaves e nada da produção', () => {
    const pastas = pastasDaInstalacao(raiz);
    const teste = variaveisDoTeste(respostas(), SEGREDOS);
    expect(teste).toEqual({
      GRAFITE_AMBIENTE: 'teste',
      NODE_ENV: 'production',
      GRAFITE_API_HOST: '127.0.0.1',
      GRAFITE_API_PORTA: '3001',
      GRAFITE_DATABASE_URL: conexao('grafite_app', 't-app', 5433, 'grafite_teste'),
      GRAFITE_DATABASE_URL_MIGRACOES: conexao('grafite_owner', 't-dono', 5433, 'grafite_teste'),
      GRAFITE_WEB_PASTA: join(pastas.teste.atual, 'web'),
      GRAFITE_ARQUIVOS_PASTA: pastas.teste.arquivos,
      GRAFITE_CHAVE_DOIS_PASSOS: SEGREDOS.chaveDoisPassos,
      GRAFITE_CHAVE_DO_COFRE: SEGREDOS.chaveDoCofre,
      GRAFITE_PROXIES_CONFIAVEIS: '127.0.0.1,::1',
      NODE_EXTRA_CA_CERTS: pastas.raizDaAcDoCaddy,
    });
    for (const valor of Object.values(teste)) {
      for (const segredo of [
        ...Object.values(SEGREDOS.producao),
        SEGREDOS.teste.superusuario,
        SEGREDOS.push.privada,
      ]) {
        expect(valor).not.toContain(segredo);
      }
    }
  });

  it('o coletor fala com a API da produção pelo 127.0.0.1, pelo endereço da operadora, e atende só nele', () => {
    expect(variaveisDoColetor(respostas(), SEGREDOS)).toEqual({
      NODE_ENV: 'production',
      GRAFITE_COLETOR_API_URL: 'http://127.0.0.1:3000',
      GRAFITE_COLETOR_ENDERECO: 'grafite.empresa.com.br',
      GRAFITE_COLETOR_TOKEN: 'token-do-coletor',
      GRAFITE_COLETOR_PASTA: join(raiz, 'producao', 'coletor'),
      GRAFITE_COLETOR_HOST: '127.0.0.1',
      GRAFITE_COLETOR_PORTA: '3100',
    });
  });

  it('o proxy guarda os dados em caddy\\dados e, no modo público, recebe o token da zona', () => {
    const pastas = pastasDaInstalacao(raiz);
    expect(variaveisDoProxy(respostas(), SEGREDOS)).toEqual({
      XDG_DATA_HOME: join(pastas.caddy, 'dados'),
      XDG_CONFIG_HOME: join(pastas.caddy, 'config'),
    });
    const publico = respostas({
      modo: 'publico',
      email: 'ti@empresa.com.br',
      provedorDns: 'cloudflare',
    });
    expect(
      variaveisDoProxy(publico, { ...SEGREDOS, tokenDaCloudflare: 'token-da-zona' }),
    ).toMatchObject({ CLOUDFLARE_API_TOKEN: 'token-da-zona' });
    expect(() => variaveisDoProxy(publico, SEGREDOS)).toThrow(
      'O modo público precisa do token da Cloudflare.',
    );
  });

  it('fora do modo interno com a AC do Caddy, os apps não ganham a raiz extra', () => {
    const publico = respostas({
      modo: 'publico',
      email: 'ti@empresa.com.br',
      provedorDns: 'cloudflare',
    });
    expect(variaveisDaProducao(publico, SEGREDOS)).not.toHaveProperty('NODE_EXTRA_CA_CERTS');
    const empresa = respostas({
      modo: 'interno',
      ac: 'empresa',
      certificado: join(raiz, 'c.crt'),
      chave: join(raiz, 'c.key'),
    });
    expect(variaveisDoTeste(empresa, SEGREDOS)).not.toHaveProperty('NODE_EXTRA_CA_CERTS');
  });
});

/** As respostas de uma instalação no Linux, com a plataforma e o fuso que ela detecta. */
const respostasDoLinux = (
  certificado: RespostasDaInstalacao['certificado'] = { modo: 'interno', ac: 'caddy' },
): RespostasDaInstalacao => ({
  ...respostas(certificado),
  raiz: '/opt/grafite',
  plataforma: 'linux',
  pgBin: '/usr/lib/postgresql/18/bin',
  fuso: 'America/Sao_Paulo',
  backup: { destinos: ['/opt/grafite/backups', '/mnt/nas/grafite'], janela: '01:00-05:00' },
});

/** A conexão esperada no Linux: o banco pelo nome do serviço, na porta do contêiner dele. */
const conexaoNoLinux = (papel: string, senha: string, servico: string, banco: string) =>
  ['postgres://', papel, ':', senha, '@', servico, ':5432/', banco].join('');

describe('as variáveis de cada ambiente no Linux', () => {
  it('a produção: o app na rede interna, o banco no contêiner dele, o proxy pelo IP fixo, as ferramentas da imagem, o fuso e a marca dos destinos', () => {
    expect(variaveisDaProducao(respostasDoLinux(), SEGREDOS)).toEqual({
      GRAFITE_AMBIENTE: 'producao',
      NODE_ENV: 'production',
      GRAFITE_API_HOST: '0.0.0.0',
      GRAFITE_API_PORTA: '3000',
      GRAFITE_DATABASE_URL: conexaoNoLinux('grafite_app', 'p-app', 'banco-producao', 'grafite'),
      GRAFITE_DATABASE_URL_MIGRACOES: conexaoNoLinux(
        'grafite_owner',
        'p-dono',
        'banco-producao',
        'grafite',
      ),
      GRAFITE_WEB_PASTA: '/app/web',
      GRAFITE_ARQUIVOS_PASTA: '/opt/grafite/producao/arquivos',
      GRAFITE_CHAVE_DOIS_PASSOS: SEGREDOS.chaveDoisPassos,
      GRAFITE_CHAVE_DO_COFRE: SEGREDOS.chaveDoCofre,
      GRAFITE_PROXIES_CONFIAVEIS: '172.30.0.2',
      TZ: 'America/Sao_Paulo',
      GRAFITE_ORGANIZACAO_OPERADORA: 'grafite.empresa.com.br',
      GRAFITE_BACKUP_DESTINOS: '/opt/grafite/backups;/mnt/nas/grafite',
      GRAFITE_BACKUP_RETENCAO: '7,4,12',
      GRAFITE_BACKUP_JANELA: '01:00-05:00',
      GRAFITE_BACKUP_TESTE: 'semanal',
      GRAFITE_BACKUP_URL: conexaoNoLinux('grafite_backup', 'p-backup', 'banco-producao', 'grafite'),
      GRAFITE_RESTAURACAO_URL: conexaoNoLinux('postgres', 't-postgres', 'banco-teste', 'postgres'),
      GRAFITE_PG_BIN: '/usr/lib/postgresql/18/bin',
      GRAFITE_BACKUP_EXIGIR_MARCA: 'sim',
      // O disco do banco do teste, onde o teste de restauração grava, pela pasta que o app monta.
      GRAFITE_RESTAURACAO_PASTA: '/opt/grafite/teste/banco',
      GRAFITE_CERTIFICADO_VIGIAR: 'grafite.empresa.com.br',
      GRAFITE_PUSH_CHAVE_PUBLICA: 'publica-do-push',
      GRAFITE_PUSH_CHAVE_PRIVADA: 'privada-do-push',
      GRAFITE_PUSH_CONTATO: 'https://grafite.empresa.com.br',
      NODE_EXTRA_CA_CERTS: '/opt/grafite/caddy/ac/raiz.crt',
    });
  });

  it('o teste: o app na rede interna, o banco no contêiner do teste, o fuso e nada do backup nem do push', () => {
    expect(variaveisDoTeste(respostasDoLinux(), SEGREDOS)).toEqual({
      GRAFITE_AMBIENTE: 'teste',
      NODE_ENV: 'production',
      GRAFITE_API_HOST: '0.0.0.0',
      GRAFITE_API_PORTA: '3001',
      GRAFITE_DATABASE_URL: conexaoNoLinux('grafite_app', 't-app', 'banco-teste', 'grafite_teste'),
      GRAFITE_DATABASE_URL_MIGRACOES: conexaoNoLinux(
        'grafite_owner',
        't-dono',
        'banco-teste',
        'grafite_teste',
      ),
      GRAFITE_WEB_PASTA: '/app/web',
      GRAFITE_ARQUIVOS_PASTA: '/opt/grafite/teste/arquivos',
      GRAFITE_CHAVE_DOIS_PASSOS: SEGREDOS.chaveDoisPassos,
      GRAFITE_CHAVE_DO_COFRE: SEGREDOS.chaveDoCofre,
      GRAFITE_PROXIES_CONFIAVEIS: '172.30.0.2',
      TZ: 'America/Sao_Paulo',
      NODE_EXTRA_CA_CERTS: '/opt/grafite/caddy/ac/raiz.crt',
    });
  });

  it('o coletor fala com o app da produção pelo nome do serviço e atende na rede interna', () => {
    expect(variaveisDoColetor(respostasDoLinux(), SEGREDOS)).toEqual({
      NODE_ENV: 'production',
      GRAFITE_COLETOR_API_URL: 'http://app-producao:3000',
      GRAFITE_COLETOR_ENDERECO: 'grafite.empresa.com.br',
      GRAFITE_COLETOR_TOKEN: 'token-do-coletor',
      GRAFITE_COLETOR_PASTA: '/opt/grafite/producao/coletor',
      GRAFITE_COLETOR_HOST: '0.0.0.0',
      GRAFITE_COLETOR_PORTA: '3100',
      TZ: 'America/Sao_Paulo',
    });
  });

  it('o proxy guarda os dados em /opt/grafite/caddy, com o separador do Linux', () => {
    expect(variaveisDoProxy(respostasDoLinux(), SEGREDOS)).toEqual({
      XDG_DATA_HOME: '/opt/grafite/caddy/dados',
      XDG_CONFIG_HOME: '/opt/grafite/caddy/config',
    });
  });
});

describe('os segredos', () => {
  it('gera os que faltam, diferentes uns dos outros, e guarda os que já existem', () => {
    let n = 0;
    let chaves = 0;
    const gerar = {
      gerarSenha: () => `senha-${++n}`,
      gerarChave: () => `chave-${++chaves}`,
      gerarChavesDoPush: () => ({ publica: 'publica-gerada', privada: 'privada-gerada' }),
    };
    const novos = completarSegredos({}, gerar);
    expect(novos).toEqual({
      producao: { dono: 'senha-1', app: 'senha-2', backup: 'senha-3' },
      teste: { dono: 'senha-4', app: 'senha-5', superusuario: 'senha-6' },
      chaveDoisPassos: 'chave-1',
      chaveDoCofre: 'chave-2',
      tokenDoColetor: 'senha-7',
      push: { publica: 'publica-gerada', privada: 'privada-gerada' },
    });
    expect(
      completarSegredos(
        {
          producao: { app: 'de-antes' },
          chaveDoisPassos: 'chave-de-antes',
          chaveDoCofre: 'cofre-de-antes',
          tokenDaCloudflare: 'tk',
          push: { publica: 'publica-de-antes', privada: 'privada-de-antes' },
        },
        gerar,
      ),
    ).toMatchObject({
      producao: { app: 'de-antes' },
      chaveDoisPassos: 'chave-de-antes',
      chaveDoCofre: 'cofre-de-antes',
      tokenDaCloudflare: 'tk',
      push: { publica: 'publica-de-antes', privada: 'privada-de-antes' },
    });
  });

  it('grava os config.env, o do coletor, a fila dele e o do proxy só para os administradores, e lê os segredos de volta', async () => {
    const pastas = pastasDaInstalacao(raiz);
    const acls: string[] = [];
    const executar: ExecutarProcesso = async (arquivo, argumentos) => {
      if (arquivo === 'icacls.exe') acls.push(argumentos[0] ?? '');
      return { codigo: 0, saida: '', erro: '' };
    };
    const publico = respostas({
      modo: 'publico',
      email: 'ti@empresa.com.br',
      provedorDns: 'cloudflare',
    });
    const segredos = { ...SEGREDOS, tokenDaCloudflare: 'token-da-zona' };
    await gravarConfiguracoes({ pastas, respostas: publico, segredos, executar });

    expect(acls).toEqual([
      pastas.producao.configEnv,
      pastas.teste.configEnv,
      pastas.coletorEnv,
      pastas.filaDoColetor,
      pastas.caddyEnv,
    ]);
    expect((await stat(pastas.filaDoColetor)).isDirectory()).toBe(true);
    expect(await lerConfigEnv(pastas.producao.configEnv)).toEqual(
      variaveisDaProducao(publico, segredos),
    );
    expect(await lerConfigEnv(pastas.teste.configEnv)).toEqual(variaveisDoTeste(publico, segredos));
    expect(await lerConfigEnv(pastas.coletorEnv)).toEqual(variaveisDoColetor(publico, segredos));
    expect(await lerConfigEnv(pastas.caddyEnv)).toEqual(variaveisDoProxy(publico, segredos));
    expect(await readFile(pastas.producao.configEnv, 'utf8')).toMatch(/^# Gerado pelo comando/);

    await expect(lerSegredos(pastas)).resolves.toEqual(segredos);
  });

  it('a chave do cofre que falta vai para os dois config.env, a da produção primeiro, uma vez só', async () => {
    const pastas = pastasDaInstalacao(raiz);
    const executar: ExecutarProcesso = async () => ({ codigo: 0, saida: '', erro: '' });
    const { chaveDoCofre: _, ...semCofre } = SEGREDOS;
    const deAntes = { ...semCofre, chaveDoCofre: '' } as Segredos;
    await gravarConfiguracoes({ pastas, respostas: respostas(), segredos: deAntes, executar });
    for (const configEnv of [pastas.producao.configEnv, pastas.teste.configEnv]) {
      const { GRAFITE_CHAVE_DO_COFRE: __, ...resto } = await lerConfigEnv(configEnv);
      await writeFile(configEnv, gerarConfigEnv(resto));
    }
    let geradas = 0;
    const gerarChave = () => `gerada-${++geradas}`;

    expect(await completarChaveDoCofre({ executar, pastas, gerarChave })).toBe(true);
    const producao = await lerConfigEnv(pastas.producao.configEnv);
    const teste = await lerConfigEnv(pastas.teste.configEnv);
    expect(producao.GRAFITE_CHAVE_DO_COFRE).toBe('gerada-1');
    expect(teste.GRAFITE_CHAVE_DO_COFRE).toBe('gerada-1');
    expect(producao.GRAFITE_CHAVE_DOIS_PASSOS).toBe(SEGREDOS.chaveDoisPassos);

    expect(await completarChaveDoCofre({ executar, pastas, gerarChave })).toBe(false);
    expect(geradas).toBe(1);

    // O teste sem a chave recebe a da produção.
    const { GRAFITE_CHAVE_DO_COFRE: ___, ...doTeste } = teste;
    await writeFile(pastas.teste.configEnv, gerarConfigEnv(doTeste));
    expect(await completarChaveDoCofre({ executar, pastas, gerarChave })).toBe(true);
    expect((await lerConfigEnv(pastas.teste.configEnv)).GRAFITE_CHAVE_DO_COFRE).toBe('gerada-1');
    expect(geradas).toBe(1);
  });

  it('as chaves do push que faltam vão só para a produção, uma vez só, com o contato na operadora', async () => {
    const pastas = pastasDaInstalacao(raiz);
    const executar: ExecutarProcesso = async () => ({ codigo: 0, saida: '', erro: '' });
    await gravarConfiguracoes({ pastas, respostas: respostas(), segredos: SEGREDOS, executar });
    // Uma produção de antes do push: sem as chaves.
    const {
      GRAFITE_PUSH_CHAVE_PUBLICA: _,
      GRAFITE_PUSH_CHAVE_PRIVADA: __,
      GRAFITE_PUSH_CONTATO: ___,
      ...deAntes
    } = await lerConfigEnv(pastas.producao.configEnv);
    await writeFile(pastas.producao.configEnv, gerarConfigEnv(deAntes));
    const testeAntes = await lerConfigEnv(pastas.teste.configEnv);
    let geradas = 0;
    const gerarChavesDoPush = () => {
      geradas += 1;
      return { publica: `publica-${geradas}`, privada: `privada-${geradas}` };
    };

    expect(await completarChavesDoPush({ executar, pastas, gerarChavesDoPush })).toBe(true);
    expect(await lerConfigEnv(pastas.producao.configEnv)).toEqual({
      ...deAntes,
      GRAFITE_PUSH_CHAVE_PUBLICA: 'publica-1',
      GRAFITE_PUSH_CHAVE_PRIVADA: 'privada-1',
      GRAFITE_PUSH_CONTATO: 'https://grafite.empresa.com.br',
    });
    expect(await lerConfigEnv(pastas.teste.configEnv)).toEqual(testeAntes);

    expect(await completarChavesDoPush({ executar, pastas, gerarChavesDoPush })).toBe(false);
    expect(geradas).toBe(1);
  });

  it('sem os arquivos, não há segredo de antes', async () => {
    await expect(lerSegredos(pastasDaInstalacao(raiz))).resolves.toEqual({
      producao: {},
      teste: {},
    });
  });

  it('a falha ao restringir o acesso para a gravação', async () => {
    const executar: ExecutarProcesso = async () => ({ codigo: 5, saida: '', erro: '' });
    await expect(
      gravarConfiguracoes({
        pastas: pastasDaInstalacao(raiz),
        respostas: respostas(),
        segredos: SEGREDOS,
        executar,
      }),
    ).rejects.toThrow('Não foi possível restringir o acesso a');
  });
});
