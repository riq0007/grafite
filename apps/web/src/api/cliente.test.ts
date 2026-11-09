import { describe, expect, it, vi } from 'vitest';
import { codigoDoProblema, comoProblema, criarCliente, lerProblema } from './cliente.ts';

const problema = (status: number, codigo: string, extras: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: 'Detalhe em pt-BR.',
      codigoDeRastreio: 'R7K2-9QXM',
      ...extras,
    }),
    { status, headers: { 'content-type': 'application/problem+json; charset=utf-8' } },
  );

function montar(resposta: () => Response, csrf: string | null = 'token-csrf') {
  const pedidos: Request[] = [];
  const aoPerderASessao = vi.fn();
  const aoMudarOAcesso = vi.fn();
  const cliente = criarCliente({
    csrf: () => csrf,
    aoPerderASessao,
    aoMudarOAcesso,
    buscar: async (pedido) => {
      pedidos.push(pedido);
      return resposta();
    },
  });
  return { cliente, pedidos, aoPerderASessao, aoMudarOAcesso };
}

const ok = () =>
  new Response(JSON.stringify({ organizacao: { nome: 'Empresa' }, sessao: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('criarCliente', () => {
  it('põe o token CSRF nas escritas, e só nelas', async () => {
    const { cliente, pedidos } = montar(ok);
    await cliente.GET('/sessao');
    await cliente.DELETE('/sessao');
    expect(pedidos.map((p) => [p.method, p.headers.get('x-grafite-csrf')])).toEqual([
      ['GET', null],
      ['DELETE', 'token-csrf'],
    ]);
  });

  it('sem sessão, a escrita sai sem o cabeçalho', async () => {
    const { cliente, pedidos } = montar(ok, null);
    await cliente.POST('/sessao', { body: { usuario: 'ana', senha: 'x' } });
    expect(pedidos[0]?.headers.get('x-grafite-csrf')).toBeNull();
  });

  it('chama a API pelo prefixo /api', async () => {
    const { cliente, pedidos } = montar(ok);
    await cliente.GET('/sessao');
    expect(new URL(pedidos[0]?.url ?? '').pathname).toBe('/api/sessao');
  });

  it('avisa quando a resposta diz que a sessão não vale mais', async () => {
    const { cliente, aoPerderASessao } = montar(() => problema(401, 'sem-sessao'));
    await cliente.GET('/conta');
    expect(aoPerderASessao).toHaveBeenCalledTimes(1);
  });

  it('não avisa numa recusa que não é a da sessão', async () => {
    const { cliente, aoPerderASessao } = montar(() => problema(401, 'credenciais-invalidas'));
    await cliente.POST('/sessao', { body: { usuario: 'ana', senha: 'x' } });
    expect(aoPerderASessao).not.toHaveBeenCalled();
  });

  it('avisa que o acesso mudou numa recusa pela pendência, pela permissão ou pelo módulo desligado', async () => {
    for (const codigo of ['pendencia', 'sem-permissao', 'modulo-desligado']) {
      const { cliente, aoMudarOAcesso, aoPerderASessao } = montar(() => problema(403, codigo));
      await cliente.GET('/conta');
      expect(aoMudarOAcesso, codigo).toHaveBeenCalledTimes(1);
      expect(aoPerderASessao).not.toHaveBeenCalled();
    }
  });

  it('não avisa noutra recusa', async () => {
    for (const resposta of [problema(403, 'csrf-invalido'), problema(409, 'pendencia')]) {
      const { cliente, aoMudarOAcesso } = montar(() => resposta);
      await cliente.GET('/conta');
      expect(aoMudarOAcesso).not.toHaveBeenCalled();
    }
  });
});

describe('lerProblema', () => {
  it('lê o código, o detalhe, o código de rastreio e os extras de um problem+json', async () => {
    const lido = await lerProblema(problema(403, 'pendencia', { pendencia: 'segundo-passo' }));
    expect(lido).toMatchObject({
      status: 403,
      detail: 'Detalhe em pt-BR.',
      codigoDeRastreio: 'R7K2-9QXM',
      pendencia: 'segundo-passo',
    });
    expect(codigoDoProblema(lido)).toBe('pendencia');
  });

  it('devolve nulo para uma resposta que não é um problema', async () => {
    expect(
      await lerProblema(new Response('<html>erro do proxy</html>', { status: 502 })),
    ).toBeNull();
    expect(codigoDoProblema(null)).toBeNull();
  });
});

describe('comoProblema', () => {
  it('aceita o corpo de um problem+json já lido e recusa o resto', () => {
    const corpo = {
      type: 'urn:grafite:problema:sem-sessao',
      title: 'Sem sessão',
      status: 401,
      detail: 'Entre para continuar.',
      codigoDeRastreio: 'R7K2-9QXM',
    };
    expect(comoProblema(corpo)).toBe(corpo);
    expect(comoProblema('<html>erro do proxy</html>')).toBeNull();
    expect(comoProblema({ type: 'about:blank' })).toBeNull();
    expect(comoProblema(undefined)).toBeNull();
  });
});
