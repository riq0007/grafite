// O teste-guarda das rotas (spec permissoes; design do F2b, decisão 6): toda rota do escopo de acesso
// declara a permissão que exige ou a exceção que só pede a sessão. A rota que não declara nem chega a
// ser registrada, e a API não sobe.
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { dependenciasDeTeste } from '../test/dependencias.ts';
import { instalarAcesso } from './acesso/escopo.ts';
import { criarApp } from './app.ts';

/** Um escopo de acesso como o da API, com as rotas dadas. */
async function registrarNoEscopo(rotas: (escopo: FastifyInstance) => void) {
  const { banco, agora } = dependenciasDeTeste();
  const app = Fastify();
  try {
    await app.register(async (escopo) => {
      instalarAcesso(escopo, { banco, agora, resolver: async () => null });
      rotas(escopo);
    });
    await app.ready();
  } finally {
    await app.close();
  }
}

const responder = async () => ({});

describe('declaração das rotas do escopo de acesso', () => {
  it('toda rota da API declara a permissão ou a exceção', async () => {
    const app = await criarApp(dependenciasDeTeste());
    await expect(app.ready()).resolves.toBeDefined();
    await app.close();
  });

  it('reprova a rota que não declara', async () => {
    await expect(
      registrarNoEscopo((escopo) => {
        escopo.get('/nova', responder);
      }),
    ).rejects.toThrow(
      'A rota GET /nova não declara a permissão que exige (config.permissao) nem a exceção (config.semPermissao).',
    );
  });

  it('reprova a permissão que não está no catálogo', async () => {
    await expect(
      registrarNoEscopo((escopo) => {
        // @ts-expect-error a chave errada não compila; a guarda também a recusa em tempo de execução.
        escopo.post('/ativos', { config: { permissao: 'ativos.excluir' } }, responder);
      }),
    ).rejects.toThrow('A rota POST /ativos exige uma permissão fora do catálogo: ativos.excluir.');
  });

  it('reprova a exceção desconhecida e a rota que declara as duas coisas', async () => {
    await expect(
      registrarNoEscopo((escopo) => {
        // @ts-expect-error só valem as exceções conhecidas.
        escopo.get('/livre', { config: { semPermissao: 'publica' } }, responder);
      }),
    ).rejects.toThrow('A rota GET /livre declara uma exceção desconhecida: publica.');
    await expect(
      registrarNoEscopo((escopo) => {
        escopo.get(
          '/ambas',
          { config: { permissao: 'pessoas.ver', semPermissao: 'referencia' } },
          responder,
        );
      }),
    ).rejects.toThrow('A rota GET /ambas declara a permissão e a exceção ao mesmo tempo.');
  });

  it('aceita as rotas declaradas', async () => {
    await expect(
      registrarNoEscopo((escopo) => {
        escopo.get('/lista', { config: { permissao: 'pessoas.ver' } }, responder);
        escopo.get('/referencia', { config: { semPermissao: 'referencia' } }, responder);
      }),
    ).resolves.toBeUndefined();
  });
});
