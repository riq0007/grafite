// O layout da instalação nas duas plataformas (change servidor-linux-com-docker, design, decisões 1,
// 3 e 4): o do Windows, como o F2d o deixou, e o do Linux, em /opt/grafite, com os serviços do
// Compose, a rede interna e o endereço de cada app e de cada banco.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  enderecosDoAmbiente,
  LANCADOR_NO_LINUX,
  PG_BIN_NO_LINUX,
  pastasDaInstalacao,
  pastasDaInstalacaoNoLinux,
  RAIZ_PADRAO,
  RAIZ_PADRAO_NO_LINUX,
  REDE_NO_LINUX,
  SERVICOS,
  SERVICOS_NO_LINUX,
} from './layout.ts';

describe('o layout do Windows', () => {
  it('continua em C:\\Grafite, com os serviços do Windows e os apps e os bancos em 127.0.0.1', () => {
    expect(RAIZ_PADRAO).toBe('C:\\Grafite');
    const pastas = pastasDaInstalacao('C:\\Grafite');
    expect(pastas.estado).toBe(join('C:\\Grafite', 'operacao.json'));
    expect(pastas.lancador).toBe(join('C:\\Grafite', 'grafite.ps1'));
    expect(pastas.producao.atual).toBe(join('C:\\Grafite', 'producao', 'atual'));
    expect(SERVICOS.producao).toBe('grafite');
    expect(enderecosDoAmbiente('windows', 'producao')).toEqual({
      app: { host: '127.0.0.1', porta: 3000 },
      banco: { host: '127.0.0.1', porta: 5432, nome: 'grafite' },
    });
    expect(enderecosDoAmbiente('windows', 'teste')).toEqual({
      app: { host: '127.0.0.1', porta: 3001 },
      banco: { host: '127.0.0.1', porta: 5433, nome: 'grafite_teste' },
    });
  });
});

describe('o layout do Linux', () => {
  it('fica em /opt/grafite, com o separador do Linux em qualquer sistema', () => {
    expect(RAIZ_PADRAO_NO_LINUX).toBe('/opt/grafite');
    expect(pastasDaInstalacaoNoLinux('/opt/grafite')).toEqual({
      raiz: '/opt/grafite',
      estado: '/opt/grafite/operacao.json',
      instalacao: '/opt/grafite/instalacao.json',
      versoes: '/opt/grafite/versoes',
      compose: '/opt/grafite/compose.yaml',
      composeEnv: '/opt/grafite/.env',
      backups: '/opt/grafite/backups',
      caddy: '/opt/grafite/caddy',
      caddyEnv: '/opt/grafite/caddy/config.env',
      raizDaAcDoCaddy: '/opt/grafite/caddy/dados/pki/authorities/local/root.crt',
      acDoCaddy: '/opt/grafite/caddy/ac',
      raizDaAcPublica: '/opt/grafite/caddy/ac/raiz.crt',
      coletorEnv: '/opt/grafite/producao/coletor.env',
      filaDoColetor: '/opt/grafite/producao/coletor',
      lancador: '/usr/local/bin/grafite',
      producao: {
        pasta: '/opt/grafite/producao',
        configEnv: '/opt/grafite/producao/config.env',
        arquivos: '/opt/grafite/producao/arquivos',
        banco: '/opt/grafite/producao/banco',
        bancoEnv: '/opt/grafite/producao/banco.env',
      },
      teste: {
        pasta: '/opt/grafite/teste',
        configEnv: '/opt/grafite/teste/config.env',
        arquivos: '/opt/grafite/teste/arquivos',
        banco: '/opt/grafite/teste/banco',
        bancoEnv: '/opt/grafite/teste/banco.env',
      },
    });
    expect(LANCADOR_NO_LINUX).toBe('/usr/local/bin/grafite');
    expect(PG_BIN_NO_LINUX).toBe('/usr/lib/postgresql/18/bin');
  });

  it('tem um serviço do Compose por processo, com o nome que também vale na rede interna', () => {
    expect(SERVICOS_NO_LINUX).toEqual({
      producao: 'app-producao',
      teste: 'app-teste',
      coletor: 'coletor',
      proxy: 'proxy',
      bancoDaProducao: 'banco-producao',
      bancoDoTeste: 'banco-teste',
    });
    expect(REDE_NO_LINUX).toEqual({ nome: 'grafite', faixa: '172.30.0.0/24', proxy: '172.30.0.2' });
  });

  it('chega a cada app e a cada banco pelo nome do serviço, cada banco na porta do próprio contêiner', () => {
    expect(enderecosDoAmbiente('linux', 'producao')).toEqual({
      app: { host: 'app-producao', porta: 3000 },
      banco: { host: 'banco-producao', porta: 5432, nome: 'grafite' },
    });
    expect(enderecosDoAmbiente('linux', 'teste')).toEqual({
      app: { host: 'app-teste', porta: 3001 },
      banco: { host: 'banco-teste', porta: 5432, nome: 'grafite_teste' },
    });
  });
});
