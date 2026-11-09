import { describe, expect, it } from 'vitest';
import { carregarConfiguracao, ErroDeConfiguracao } from './config.ts';

const token = 'x'.repeat(40);

describe('carregarConfiguracao do coletor', () => {
  it('aceita URL da API e token, com o endereço da URL, a pasta, as portas e o host padrão', () => {
    expect(
      carregarConfiguracao({
        GRAFITE_COLETOR_API_URL: 'https://grafite.interno',
        GRAFITE_COLETOR_TOKEN: token,
      }),
    ).toEqual({
      urlDaApi: 'https://grafite.interno',
      token,
      endereco: 'grafite.interno',
      pasta: '.grafite/coletor',
      porta: 3100,
      host: '127.0.0.1',
      portaDoSnmp: 161,
    });
  });

  it('a porta do SNMP muda pela variável, para o simulador dos testes, e fica entre 1 e 65535', () => {
    const base = { GRAFITE_COLETOR_API_URL: 'http://127.0.0.1:3000', GRAFITE_COLETOR_TOKEN: token };
    expect(
      carregarConfiguracao({ ...base, GRAFITE_COLETOR_PORTA_DO_SNMP: '16161' }).portaDoSnmp,
    ).toBe(16161);
    expect(() => carregarConfiguracao({ ...base, GRAFITE_COLETOR_PORTA_DO_SNMP: '0' })).toThrow(
      /GRAFITE_COLETOR_PORTA_DO_SNMP: deve estar entre 1 e 65535/,
    );
  });

  it('fala com a API local pelo endereço da organização e guarda a fila na pasta dada', () => {
    expect(
      carregarConfiguracao({
        GRAFITE_COLETOR_API_URL: 'http://127.0.0.1:3000/',
        GRAFITE_COLETOR_TOKEN: token,
        GRAFITE_COLETOR_ENDERECO: ' Grafite.Empresa.Local ',
        GRAFITE_COLETOR_PASTA: 'C:\\Grafite\\producao\\coletor',
      }),
    ).toMatchObject({
      urlDaApi: 'http://127.0.0.1:3000',
      endereco: 'grafite.empresa.local',
      pasta: 'C:\\Grafite\\producao\\coletor',
    });
  });

  it('recusa o endereço com porta, caminho ou espaço', () => {
    for (const endereco of ['grafite.local:443', 'grafite.local/x', 'grafite local']) {
      expect(() =>
        carregarConfiguracao({
          GRAFITE_COLETOR_API_URL: 'http://127.0.0.1:3000',
          GRAFITE_COLETOR_TOKEN: token,
          GRAFITE_COLETOR_ENDERECO: endereco,
        }),
      ).toThrow(/GRAFITE_COLETOR_ENDERECO/);
    }
  });

  it('sem nada configurado, lista a URL da API e o token', () => {
    let erro: unknown;
    try {
      carregarConfiguracao({});
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroDeConfiguracao);
    expect((erro as ErroDeConfiguracao).variaveis).toEqual([
      'GRAFITE_COLETOR_API_URL',
      'GRAFITE_COLETOR_TOKEN',
    ]);
  });

  it('recusa token curto demais e URL sem http', () => {
    expect(() =>
      carregarConfiguracao({ GRAFITE_COLETOR_API_URL: 'grafite', GRAFITE_COLETOR_TOKEN: 'curto' }),
    ).toThrow(/GRAFITE_COLETOR_API_URL[\s\S]*GRAFITE_COLETOR_TOKEN/);
  });
});
