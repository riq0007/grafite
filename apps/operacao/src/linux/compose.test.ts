// O projeto do Compose do servidor Linux (change servidor-linux-com-docker, design, decisões 3, 4, 5,
// 10 e 11): os seis serviços, cada um com a imagem da versão do ambiente dele, o reinício, os logs
// em rotação, só o proxy publicando portas, a rede interna com o IP fixo do proxy e as pastas da
// instalação montadas no mesmo caminho.
import { describe, expect, it } from 'vitest';
import {
  type DadosDoCompose,
  gerarCompose,
  gerarEnvDoCompose,
  variavelDoCompose,
} from './compose.ts';

const producao = variavelDoCompose('GRAFITE_VERSAO_PRODUCAO');
const teste = variavelDoCompose('GRAFITE_VERSAO_TESTE');

const dados = (mudancas: Partial<DadosDoCompose> = {}): DadosDoCompose => ({
  raiz: '/opt/grafite',
  certificado: { modo: 'interno', ac: 'caddy' },
  destinosDoBackup: ['/opt/grafite/backups', '/mnt/nas/Backups Grafite'],
  ...mudancas,
});

interface Servico {
  image: string;
  restart: string;
  pull_policy: string;
  logging: { driver: string; options: Record<string, string> };
  ports?: string[];
  env_file?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  networks: Record<string, { ipv4_address?: string } | null>;
  depends_on?: Record<string, { condition: string }>;
  healthcheck?: { test: string[] };
  command?: string[];
}

/** O projeto gerado, lido como o Compose o lê: o comentário do topo e o JSON, que é YAML. */
function projeto(texto: string) {
  const [primeira = '', ...resto] = texto.split('\n');
  expect(primeira).toMatch(/^# Gerado por "grafite/);
  return JSON.parse(resto.join('\n')) as {
    name: string;
    services: Record<string, Servico>;
    networks: Record<string, { external: boolean; name: string }>;
  };
}

describe('o projeto do Compose', () => {
  it('tem os seis serviços, com a imagem da versão do ambiente, o reinício, os logs em rotação e nenhuma busca de imagem', () => {
    const { name, services } = projeto(gerarCompose(dados()));
    expect(name).toBe('grafite');
    expect(Object.keys(services)).toEqual([
      'proxy',
      'banco-producao',
      'app-producao',
      'coletor',
      'banco-teste',
      'app-teste',
    ]);
    expect(services.proxy?.image).toBe(`grafite/proxy:${producao}`);
    expect(services['banco-producao']?.image).toBe(`grafite/banco:${producao}`);
    expect(services['app-producao']?.image).toBe(`grafite/aplicacao:${producao}`);
    expect(services.coletor?.image).toBe(`grafite/coletor:${producao}`);
    expect(services['banco-teste']?.image).toBe(`grafite/banco:${teste}`);
    expect(services['app-teste']?.image).toBe(`grafite/aplicacao:${teste}`);
    for (const servico of Object.values(services)) {
      expect(servico.restart).toBe('unless-stopped');
      // As imagens só vêm do pacote: a que faltar não é buscada no Docker Hub.
      expect(servico.pull_policy).toBe('never');
      expect(servico.logging).toEqual({
        driver: 'json-file',
        options: { 'max-size': '10m', 'max-file': '5' },
      });
    }
  });

  it('só o proxy publica portas, a 80 e a 443, com o IP fixo na rede grafite, que vem de fora', () => {
    const { services, networks } = projeto(gerarCompose(dados()));
    expect(services.proxy?.ports).toEqual(['80:80', '443:443']);
    expect(services.proxy?.networks).toEqual({ grafite: { ipv4_address: '172.30.0.2' } });
    for (const [nome, servico] of Object.entries(services)) {
      if (nome === 'proxy') continue;
      expect(servico.ports).toBeUndefined();
      expect(servico.networks).toEqual({ grafite: null });
    }
    expect(networks).toEqual({ grafite: { external: true, name: 'grafite' } });
  });

  it('a configuração de cada contêiner vem do arquivo dele, e o fuso, do .env do Compose', () => {
    const { services } = projeto(gerarCompose(dados()));
    expect(services.proxy?.env_file).toEqual(['/opt/grafite/caddy/config.env']);
    expect(services['banco-producao']?.env_file).toEqual(['/opt/grafite/producao/banco.env']);
    expect(services['app-producao']?.env_file).toEqual(['/opt/grafite/producao/config.env']);
    expect(services.coletor?.env_file).toEqual(['/opt/grafite/producao/coletor.env']);
    expect(services['banco-teste']?.env_file).toEqual(['/opt/grafite/teste/banco.env']);
    expect(services['app-teste']?.env_file).toEqual(['/opt/grafite/teste/config.env']);
    for (const servico of Object.values(services)) {
      expect(servico.environment).toEqual({ TZ: variavelDoCompose('TZ') });
    }
  });

  it('monta as pastas no mesmo caminho: os destinos do backup só na produção', () => {
    const { services } = projeto(gerarCompose(dados()));
    expect(services.proxy?.volumes).toEqual(['/opt/grafite/caddy:/opt/grafite/caddy']);
    expect(services['banco-producao']?.volumes).toEqual([
      '/opt/grafite/producao/banco:/var/lib/postgresql',
    ]);
    expect(services['app-producao']?.volumes).toEqual([
      '/opt/grafite/producao/arquivos:/opt/grafite/producao/arquivos',
      '/opt/grafite/backups:/opt/grafite/backups',
      '/mnt/nas/Backups Grafite:/mnt/nas/Backups Grafite',
      // Só para ler: o espaço livre do disco do banco do teste, antes do teste de restauração.
      '/opt/grafite/teste/banco:/opt/grafite/teste/banco:ro',
      '/opt/grafite/caddy/ac:/opt/grafite/caddy/ac:ro',
    ]);
    expect(services.coletor?.volumes).toEqual([
      '/opt/grafite/producao/coletor:/opt/grafite/producao/coletor',
    ]);
    expect(services['banco-teste']?.volumes).toEqual([
      '/opt/grafite/teste/banco:/var/lib/postgresql',
    ]);
    expect(services['app-teste']?.volumes).toEqual([
      '/opt/grafite/teste/arquivos:/opt/grafite/teste/arquivos',
      '/opt/grafite/caddy/ac:/opt/grafite/caddy/ac:ro',
    ]);
  });

  it('fora da AC do Caddy, os apps não montam a raiz dela; com a AC da empresa, o proxy lê o certificado e a chave', () => {
    const daEmpresa = projeto(
      gerarCompose(
        dados({
          certificado: {
            modo: 'interno',
            ac: 'empresa',
            certificado: '/etc/grafite/grafite.crt',
            chave: '/etc/grafite/grafite.key',
          },
        }),
      ),
    );
    expect(daEmpresa.services['app-teste']?.volumes).toEqual([
      '/opt/grafite/teste/arquivos:/opt/grafite/teste/arquivos',
    ]);
    expect(daEmpresa.services.proxy?.volumes).toEqual([
      '/opt/grafite/caddy:/opt/grafite/caddy',
      '/etc/grafite/grafite.crt:/etc/grafite/grafite.crt:ro',
      '/etc/grafite/grafite.key:/etc/grafite/grafite.key:ro',
    ]);
    const publico = projeto(
      gerarCompose(
        dados({
          certificado: { modo: 'publico', email: 'ti@empresa.com.br', provedorDns: 'cloudflare' },
        }),
      ),
    );
    expect(publico.services['app-producao']?.volumes).not.toContain(
      '/opt/grafite/caddy/ac:/opt/grafite/caddy/ac:ro',
    );
  });

  it('os bancos respondem ao pg_isready, os apps esperam o banco deles, e o coletor, o app', () => {
    const { services } = projeto(gerarCompose(dados()));
    expect(services['banco-producao']?.healthcheck?.test).toEqual([
      'CMD-SHELL',
      'pg_isready -U postgres -d postgres',
    ]);
    expect(services['app-producao']?.depends_on).toEqual({
      'banco-producao': { condition: 'service_healthy' },
    });
    expect(services['app-teste']?.depends_on).toEqual({
      'banco-teste': { condition: 'service_healthy' },
    });
    expect(services.coletor?.depends_on).toEqual({
      'app-producao': { condition: 'service_started' },
    });
    expect(services.proxy?.command).toEqual([
      'caddy',
      'run',
      '--config',
      '/opt/grafite/caddy/Caddyfile',
      '--adapter',
      'caddyfile',
    ]);
  });
});

describe('o .env do Compose', () => {
  it('tem a versão de cada ambiente e o fuso do servidor', () => {
    expect(
      gerarEnvDoCompose({
        versoes: { producao: '1.4.0', teste: '1.5.0' },
        fuso: 'America/Sao_Paulo',
      }),
    ).toBe(
      [
        '# Gerado por "grafite". Não edite: rode o comando de novo.',
        'GRAFITE_VERSAO_PRODUCAO=1.4.0',
        'GRAFITE_VERSAO_TESTE=1.5.0',
        'TZ=America/Sao_Paulo',
        '',
      ].join('\n'),
    );
  });
});
