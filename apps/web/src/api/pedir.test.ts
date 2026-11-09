import { describe, expect, it } from 'vitest';
import { pedir, SEM_CONEXAO } from './pedir.ts';

const resposta = (status: number) => new Response(null, { status });
const problema = (status: number, codigo: string) => ({
  type: `urn:grafite:problema:${codigo}`,
  title: 'Título',
  status,
  detail: 'Detalhe para a tela.',
  codigoDeRastreio: 'R7K2-9QXM',
});

describe('pedir', () => {
  it('com sucesso, entrega os dados', async () => {
    expect(
      await pedir(async () => ({ data: { nome: 'Ana' }, response: resposta(200) }), 'x'),
    ).toEqual({
      dados: { nome: 'Ana' },
    });
  });

  it('sem resposta do servidor, diz que não há conexão', async () => {
    expect(
      await pedir(async () => {
        throw new TypeError('Failed to fetch');
      }, 'carregar a conta'),
    ).toEqual({ erro: SEM_CONEXAO, problema: null, codigo: null });
  });

  it('a resposta de um proxy também é falta de conexão', async () => {
    expect(
      await pedir(
        async () => ({ error: '<html>Bad Gateway</html>', response: resposta(502) }),
        'x',
      ),
    ).toEqual({ erro: SEM_CONEXAO, problema: null, codigo: null });
  });

  it('num erro do servidor, diz o que não foi possível, com o código de rastreio', async () => {
    const corpo = problema(500, 'erro-interno');
    expect(
      await pedir(async () => ({ error: corpo, response: resposta(500) }), 'carregar a conta'),
    ).toEqual({
      erro: 'Não foi possível carregar a conta. Informe à TI o código R7K2-9QXM.',
      problema: corpo,
      codigo: 'erro-interno',
    });
  });

  it('numa recusa, traz o detalhe da API, o problema e o código', async () => {
    const corpo = problema(409, 'dois-passos-ativos');
    expect(await pedir(async () => ({ error: corpo, response: resposta(409) }), 'x')).toEqual({
      erro: 'Detalhe para a tela.',
      problema: corpo,
      codigo: 'dois-passos-ativos',
    });
  });

  // O serviço de fora que falhou, como o AD, o canal de e-mail ou a fila: a API escreveu o motivo
  // para a tela (spec diretorio-ad, "Uma falha do AD SHALL aparecer na tela com o motivo em texto").
  it.each([502, 503])(
    'numa falha de um serviço de fora (%i), traz o motivo que a API escreveu',
    async (status) => {
      const corpo = problema(status, 'diretorio-falhou');
      expect(
        await pedir(
          async () => ({ error: corpo, response: resposta(status) }),
          'redefinir a senha',
        ),
      ).toEqual({ erro: 'Detalhe para a tela.', problema: corpo, codigo: 'diretorio-falhou' });
    },
  );
});
