// A exibição do painel no domínio (spec painel-de-dashboards, "Exibição do painel"; change
// diagnostico-dos-paineis, design, decisão 1): a leitura da resposta da verificação, sem rede.
import { describe, expect, it } from 'vitest';
import { exibicaoDaResposta, type RespostaComCabecalhos } from './exibicao.ts';

const GRAFANA = 'https://grafana.empresa.local/d/linha2';
const DA_ORGANIZACAO = ['grafite.empresa.local'];
const SEM_O_GRAFITE = 'A ferramenta manda frame-ancestors sem o endereço do Grafite.';
const APARECE = { exibicao: 'aparece', motivo: null };

/** Lê a resposta 200 do próprio endereço, com o que o caso muda nela. */
function ler(
  mudancas: Partial<RespostaComCabecalhos> = {},
  endereco = GRAFANA,
  enderecosDeAcesso: readonly string[] = DA_ORGANIZACAO,
) {
  return exibicaoDaResposta(
    {
      status: 200,
      xFrameOptions: null,
      contentSecurityPolicy: null,
      enderecoFinal: endereco,
      ...mudancas,
    },
    { endereco, enderecosDeAcesso },
  );
}

const comAPolitica = (contentSecurityPolicy: string) => ler({ contentSecurityPolicy });

describe('exibicaoDaResposta', () => {
  it('a resposta sem os cabeçalhos aparece na grade, sem motivo', () => {
    expect(ler()).toEqual(APARECE);
  });

  describe('X-Frame-Options', () => {
    it('Grafana de fábrica: deny recusa, com o cabeçalho no motivo', () => {
      expect(ler({ xFrameOptions: 'deny' })).toEqual({
        exibicao: 'recusa',
        motivo: 'A ferramenta manda X-Frame-Options: DENY.',
      });
      expect(ler({ xFrameOptions: ' SameOrigin ' })).toEqual({
        exibicao: 'recusa',
        motivo: 'A ferramenta manda X-Frame-Options: SAMEORIGIN.',
      });
    });

    it('o ALLOW-FROM, o ALLOWALL e um valor desconhecido não contam', () => {
      for (const xFrameOptions of ['ALLOW-FROM https://outro.local', 'ALLOWALL', 'qualquer', '']) {
        expect(ler({ xFrameOptions })).toEqual(APARECE);
      }
    });

    it('o cabeçalho repetido vale uma vez, e os valores em conflito recusam', () => {
      expect(ler({ xFrameOptions: 'SAMEORIGIN, SAMEORIGIN' }).motivo).toBe(
        'A ferramenta manda X-Frame-Options: SAMEORIGIN.',
      );
      expect(ler({ xFrameOptions: 'ALLOWALL, sameorigin' })).toEqual({
        exibicao: 'recusa',
        motivo: 'A ferramenta manda X-Frame-Options: ALLOWALL, SAMEORIGIN.',
      });
      expect(ler({ xFrameOptions: 'um, outro' })).toEqual(APARECE);
    });
  });

  describe('frame-ancestors', () => {
    it('frame-ancestors com o endereço do Grafite: aparece', () => {
      for (const fonte of [
        'https://grafite.empresa.local',
        'HTTPS://Grafite.Empresa.Local',
        'http://grafite.empresa.local',
        'grafite.empresa.local',
        'https://grafite.empresa.local:8443',
        'https://grafite.empresa.local:*',
        'https://grafite.empresa.local/qualquer/caminho',
        'https://*.empresa.local',
        '*.empresa.local',
        'https:',
        '*',
      ]) {
        expect(comAPolitica(`frame-ancestors ${fonte}`), fonte).toEqual(APARECE);
      }
      expect(
        comAPolitica("default-src 'self'; Frame-Ancestors 'self' https://grafite.empresa.local"),
      ).toEqual(APARECE);
    });

    it("frame-ancestors sem o Grafite: 'self', 'none' e o endereço de outro recusam", () => {
      for (const fontes of [
        "'self'",
        "'none'",
        "'SELF'",
        '',
        'https://outro.empresa.local',
        'https://*.outra.local',
        // O curinga pede um subdomínio: não casa com o próprio nome.
        'https://*.grafite.empresa.local',
        // O nome que só termina igual não é subdomínio: "empresa.local" não é de "presa.local".
        'https://*.presa.local',
        'wss://grafite.empresa.local',
        'data:',
      ]) {
        expect(comAPolitica(`frame-ancestors ${fontes}`), fontes).toEqual({
          exibicao: 'recusa',
          motivo: SEM_O_GRAFITE,
        });
      }
    });

    it('a política sem a diretiva não recusa', () => {
      expect(comAPolitica("default-src 'self'; script-src 'none'")).toEqual(APARECE);
    });

    it('com várias políticas, todas as que trazem a diretiva têm de liberar', () => {
      expect(
        comAPolitica("frame-ancestors https://grafite.empresa.local, frame-ancestors 'self'"),
      ).toEqual({ exibicao: 'recusa', motivo: SEM_O_GRAFITE });
      expect(comAPolitica("default-src 'self', frame-ancestors *")).toEqual(APARECE);
    });

    it('a diretiva repetida na mesma política não conta: vale a primeira', () => {
      expect(comAPolitica("frame-ancestors 'none'; frame-ancestors *")).toEqual({
        exibicao: 'recusa',
        motivo: SEM_O_GRAFITE,
      });
    });

    it('Os dois cabeçalhos: com o frame-ancestors, o X-Frame-Options não conta', () => {
      expect(
        ler({
          xFrameOptions: 'SAMEORIGIN',
          contentSecurityPolicy: 'frame-ancestors https://grafite.empresa.local',
        }),
      ).toEqual(APARECE);
      expect(ler({ xFrameOptions: 'DENY', contentSecurityPolicy: "default-src 'self'" })).toEqual({
        exibicao: 'recusa',
        motivo: 'A ferramenta manda X-Frame-Options: DENY.',
      });
    });
  });

  describe('a mesma origem', () => {
    const NO_GRAFITE = 'https://grafite.empresa.local/grafana/d/linha2';

    it("Ferramenta no endereço do Grafite: SAMEORIGIN e 'self' não recusam", () => {
      expect(ler({ xFrameOptions: 'SAMEORIGIN' }, NO_GRAFITE)).toEqual(APARECE);
      expect(ler({ contentSecurityPolicy: "frame-ancestors 'self'" }, NO_GRAFITE)).toEqual(APARECE);
    });

    it("o DENY e o 'none' recusam também no endereço do Grafite", () => {
      expect(ler({ xFrameOptions: 'DENY' }, NO_GRAFITE).exibicao).toBe('recusa');
      expect(ler({ contentSecurityPolicy: "frame-ancestors 'none'" }, NO_GRAFITE).exibicao).toBe(
        'recusa',
      );
    });

    it('vale o endereço da resposta, depois dos redirecionamentos', () => {
      expect(
        ler(
          { xFrameOptions: 'SAMEORIGIN', enderecoFinal: 'https://sso.empresa.local/painel' },
          NO_GRAFITE,
        ),
      ).toMatchObject({ exibicao: 'recusa' });
    });
  });

  describe('a entrada', () => {
    it('Página de entrada: o 401 e o 403 pedem a entrada, com o código no motivo', () => {
      expect(ler({ status: 401 })).toEqual({ exibicao: 'pede-entrada', motivo: 'Respondeu 401.' });
      expect(ler({ status: 403 })).toEqual({ exibicao: 'pede-entrada', motivo: 'Respondeu 403.' });
      expect(ler({ status: 404 })).toEqual(APARECE);
    });

    it('Página de entrada: o redirecionamento para a página de entrada pede a entrada', () => {
      for (const caminho of [
        '/login',
        '/Login?redirectTo=%2Fd%2Flinha2',
        '/auth/realms/empresa/protocol/openid-connect/auth',
        '/sso',
        '/usuarios/entrar',
        '/signin',
        '/conta/sign-in/',
      ]) {
        expect(ler({ enderecoFinal: `https://grafana.empresa.local${caminho}` }), caminho).toEqual({
          exibicao: 'pede-entrada',
          motivo: 'Levou à página de entrada.',
        });
      }
      expect(ler({ enderecoFinal: 'https://sso.empresa.local/login' }).exibicao).toBe(
        'pede-entrada',
      );
    });

    it('o redirecionamento para outra página aparece', () => {
      for (const caminho of ['/d/linha2?orgId=1', '/catalogo/authors', '/loginho', '/']) {
        expect(ler({ enderecoFinal: `https://grafana.empresa.local${caminho}` }), caminho).toEqual(
          APARECE,
        );
      }
    });

    it('o endereço cadastrado que já é o da entrada aparece', () => {
      expect(ler({}, 'https://grafana.empresa.local/login')).toEqual(APARECE);
      // O endereço da resposta vem sem o trecho depois do "#".
      expect(
        ler(
          { enderecoFinal: 'https://grafana.empresa.local/login' },
          'https://grafana.empresa.local/login#painel',
        ),
      ).toEqual(APARECE);
    });

    it('a recusa vence a entrada', () => {
      expect(ler({ status: 401, xFrameOptions: 'deny' })).toEqual({
        exibicao: 'recusa',
        motivo: 'A ferramenta manda X-Frame-Options: DENY.',
      });
      expect(
        ler({
          enderecoFinal: 'https://grafana.empresa.local/login',
          contentSecurityPolicy: "frame-ancestors 'self'",
        }),
      ).toEqual({ exibicao: 'recusa', motivo: SEM_O_GRAFITE });
    });
  });

  describe('o painel em http://', () => {
    const PELA_PONTE = 'http://10.0.5.21:3000';

    it('Painel em HTTP com o cabeçalho: os cabeçalhos que barram não contam', () => {
      expect(ler({ xFrameOptions: 'SAMEORIGIN' }, PELA_PONTE)).toEqual(APARECE);
      expect(ler({ contentSecurityPolicy: "frame-ancestors 'none'" }, PELA_PONTE)).toEqual(APARECE);
    });

    it('a entrada conta', () => {
      expect(ler({ status: 401, xFrameOptions: 'DENY' }, PELA_PONTE)).toEqual({
        exibicao: 'pede-entrada',
        motivo: 'Respondeu 401.',
      });
      expect(ler({ enderecoFinal: `${PELA_PONTE}/login` }, PELA_PONTE)).toEqual({
        exibicao: 'pede-entrada',
        motivo: 'Levou à página de entrada.',
      });
    });
  });

  it('o endereço de acesso da organização pode ser um IP', () => {
    expect(
      ler({ contentSecurityPolicy: 'frame-ancestors https://10.0.0.5' }, GRAFANA, ['10.0.0.5']),
    ).toEqual(APARECE);
    expect(
      ler({ contentSecurityPolicy: 'frame-ancestors https://10.0.0.5' }, GRAFANA, ['10.0.0.50']),
    ).toMatchObject({ exibicao: 'recusa' });
  });
});
