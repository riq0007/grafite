// A API dos coletores simulada na página, em memória (design do P2a, decisão 2): a lista, o
// cadastro com o token mostrado uma vez, a edição, a troca do token, a inativação e a reativação.
// As escritas mudam o estado, e a leitura seguinte o devolve, como a API de verdade. Os caminhos
// fora dos coletores passam adiante.
import { randomBytes, randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import { lerFaixas, normalizarTexto } from '@grafite/domain';
import type { Page } from '@playwright/test';

type Coletor = components['schemas']['Coletor'];
type Corpo = Record<string, unknown>;
type Resposta = { status: number; json: unknown };

const ok = (json: unknown, status = 200): Resposta => ({ status, json });
const problema = (
  status: number,
  codigo: string,
  detalhe: string,
  campos?: Record<string, string>,
): Resposta => ({
  status,
  json: {
    type: `urn:grafite:problema:${codigo}`,
    title: detalhe,
    status,
    detail: detalhe,
    codigoDeRastreio: 'T5EX-2E2E',
    ...(campos && { campos }),
  },
});

/** O token como a API gera: 32 bytes em base64url. */
const novoToken = () => randomBytes(32).toString('base64url');

export interface EstadoDosColetores {
  coletores: Coletor[];
  /** O último token que a API mostrou, no cadastro ou na troca. */
  ultimoToken: string | null;
}

export async function simularColetores(pagina: Page, iniciais: Coletor[] = []) {
  const estado: EstadoDosColetores = { coletores: [...iniciais], ultimoToken: null };

  function conferir(corpo: Corpo, atual?: Coletor): Resposta | Pick<Coletor, 'nome' | 'faixas'> {
    const nome = String(corpo.nome ?? atual?.nome ?? '').trim();
    const repetido = estado.coletores.some(
      (coletor) =>
        coletor.id !== atual?.id && normalizarTexto(coletor.nome) === normalizarTexto(nome),
    );
    if (repetido) {
      return problema(409, 'conflito', 'Já existe um coletor com este nome.', {
        nome: 'Já existe um coletor com este nome.',
      });
    }
    const faixas = lerFaixas(corpo.faixas ?? atual?.faixas ?? []);
    if (!faixas.ok) {
      return problema(400, 'dados-invalidos', 'Confira os campos.', { faixas: faixas.erro });
    }
    return { nome, faixas: faixas.faixas };
  }

  const comToken = (coletor: Coletor) => {
    estado.ultimoToken = novoToken();
    return { coletor, token: estado.ultimoToken };
  };

  function mudar(id: string, mudanca: Partial<Coletor>): Resposta {
    const coletor = estado.coletores.find((candidato) => candidato.id === id);
    if (!coletor) return problema(404, 'nao-encontrado', 'Coletor não encontrado.');
    Object.assign(coletor, mudanca);
    return ok(coletor);
  }

  const rotas: [string, RegExp, (partes: string[], corpo: Corpo) => Resposta][] = [
    [
      'GET',
      /^\/coletores$/,
      () =>
        ok({
          coletores: [...estado.coletores].sort((a, b) =>
            normalizarTexto(a.nome).localeCompare(normalizarTexto(b.nome)),
          ),
          permite: { cadastrar: true },
        }),
    ],
    [
      'POST',
      /^\/coletores$/,
      (_, corpo) => {
        const conferido = conferir(corpo);
        if ('status' in conferido) return conferido;
        const coletor: Coletor = {
          id: randomUUID(),
          ...conferido,
          situacao: 'ativo',
          ultimoContatoEm: null,
          versao: null,
          criadoEm: new Date().toISOString(),
        };
        estado.coletores.push(coletor);
        return ok(comToken(coletor), 201);
      },
    ],
    [
      'PATCH',
      /^\/coletores\/([^/]+)$/,
      ([id = ''], corpo) => {
        const atual = estado.coletores.find((coletor) => coletor.id === id);
        if (!atual) return problema(404, 'nao-encontrado', 'Coletor não encontrado.');
        const conferido = conferir(corpo, atual);
        if ('status' in conferido) return conferido;
        return mudar(id, conferido);
      },
    ],
    [
      'POST',
      /^\/coletores\/([^/]+)\/token$/,
      ([id = '']) => {
        const coletor = estado.coletores.find((candidato) => candidato.id === id);
        return coletor
          ? ok(comToken(coletor))
          : problema(404, 'nao-encontrado', 'Coletor não encontrado.');
      },
    ],
    [
      'POST',
      /^\/coletores\/([^/]+)\/inativacao$/,
      ([id = '']) => mudar(id, { situacao: 'inativo' }),
    ],
    ['POST', /^\/coletores\/([^/]+)\/reativacao$/, ([id = '']) => mudar(id, { situacao: 'ativo' })],
  ];

  await pagina.route(
    (url) => url.pathname.startsWith('/api/coletores'),
    async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      const caminho = url.pathname.slice('/api'.length);
      const metodo = pedido.method();
      const emJson = pedido.headers()['content-type']?.startsWith('application/json');
      const corpo: Corpo = (emJson && pedido.postDataJSON()) || {};
      const encontrada = rotas
        .map(([metodoDaRota, padrao, responder]) => ({
          partes: metodoDaRota === metodo ? caminho.match(padrao) : null,
          responder,
        }))
        .find(({ partes }) => partes !== null);
      const resposta = encontrada?.partes
        ? encontrada.responder(encontrada.partes.slice(1), corpo)
        : problema(501, 'nao-simulado', `A API simulada não responde ${metodo} ${url.pathname}.`);
      await rota.fulfill({
        status: resposta.status,
        contentType: resposta.status >= 400 ? 'application/problem+json' : 'application/json',
        body: JSON.stringify(resposta.json),
      });
    },
  );

  return estado;
}
