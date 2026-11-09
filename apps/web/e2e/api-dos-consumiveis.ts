// A API dos consumíveis simulada, para as pontas a ponta do Operação (specs consumiveis e
// modulo-operacao; change p4b-consumiveis): a lista com a busca e os filtros, a ficha, o cadastro
// e a edição com os fornecedores e os modelos, a recusa do código repetido, a inativação e a
// reativação, os modelos para escolher e os compatíveis de cada modelo. Ela fica sobre a dos
// ativos, que dá o catálogo e os fornecedores, e responde só os caminhos dela.
import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import {
  type CorDeConsumivel,
  codigoNormalizado,
  type DadosDoConsumivel,
  limparConsumivel,
  MENSAGEM_DO_CODIGO_REPETIDO,
  normalizarTexto,
  ordenarConsumiveis,
  type TipoDeConsumivel,
  validarConsumivel,
} from '@grafite/domain';
import type { Page } from '@playwright/test';
import type { EstadoDoCatalogo } from './api-do-catalogo.ts';
import type { FornecedorGuardado } from './api-dos-ativos.ts';

type Ficha = components['schemas']['FichaDoConsumivel'];
type Compativel = components['schemas']['ConsumivelCompativel'];

/** A capacidade que dá aos modelos do tipo os consumíveis compatíveis. */
export const COMPATIBILIDADE = 'consumiveis.compatibilidade';

/** Um consumível guardado na simulação, com os fornecedores e os modelos pelo id. */
export interface ConsumivelGuardado {
  id: string;
  codigo: string;
  nome: string | null;
  tipo: TipoDeConsumivel;
  cor: CorDeConsumivel | null;
  rendimento: number | null;
  situacao: 'ativo' | 'inativo';
  fornecedores: string[];
  modelos: string[];
}

const MOMENTO = '2026-10-19T12:00:00.000Z';

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

/** Os caminhos, depois do /api, que esta API responde; os outros passam adiante. */
const DOS_CONSUMIVEIS = /^\/consumiveis(\/|$)|^\/modelos\/[^/]+\/consumiveis$/;

/**
 * Liga os consumíveis simulados à página, sobre o catálogo e os fornecedores da API dos ativos.
 * Devolve os consumíveis, para o teste conferir o que mudou, os compatíveis de cada modelo, que a
 * ficha do ativo simulada lê, e os corpos das escritas.
 */
export async function simularConsumiveis(
  pagina: Page,
  { catalogo, fornecedores }: { catalogo: EstadoDoCatalogo; fornecedores: FornecedorGuardado[] },
  iniciais: readonly ConsumivelGuardado[] = [],
) {
  const consumiveis: ConsumivelGuardado[] = iniciais.map((consumivel) => ({ ...consumivel }));
  const pedidos: { metodo: string; caminho: string; corpo: unknown }[] = [];

  const tipoComCompativeis = (tipoId: string) =>
    catalogo.tipos.find((tipo) => tipo.id === tipoId)?.capacidades.includes(COMPATIBILIDADE) ??
    false;

  /** Os ativos que têm o modelo, pelo tipo e pelo código, como a API os devolve. */
  const compativeisDoModelo = (modeloId: string): Compativel[] =>
    ordenarConsumiveis(
      consumiveis.filter(
        (consumivel) => consumivel.situacao === 'ativo' && consumivel.modelos.includes(modeloId),
      ),
    ).map(({ id, codigo, nome, tipo, cor, rendimento }) => ({
      id,
      codigo,
      nome,
      tipo,
      cor,
      rendimento,
      saldo: null,
    }));

  function ficha(consumivel: ConsumivelGuardado): Ficha {
    return {
      id: consumivel.id,
      codigo: consumivel.codigo,
      nome: consumivel.nome,
      tipo: consumivel.tipo,
      cor: consumivel.cor,
      rendimento: consumivel.rendimento,
      situacao: consumivel.situacao,
      criadoEm: MOMENTO,
      atualizadoEm: MOMENTO,
      fornecedores: fornecedores
        .filter((fornecedor) => consumivel.fornecedores.includes(fornecedor.id))
        .map(({ id, nome, situacao }) => ({ id, nome, situacao })),
      modelos: catalogo.modelos
        .filter((modelo) => consumivel.modelos.includes(modelo.id))
        .map((modelo) => ({
          id: modelo.id,
          fabricante: modelo.fabricante,
          nome: modelo.nome,
          situacao: modelo.situacao,
          tipo: {
            id: modelo.tipoId,
            nome: catalogo.tipos.find((tipo) => tipo.id === modelo.tipoId)?.nome ?? '',
          },
        })),
      permite: { editar: true },
    };
  }

  /** Confere o pedido pelo domínio e pelo código único, como a API; sem recusa, os dados limpos. */
  function conferir(
    corpo: Corpo,
    atual?: ConsumivelGuardado,
  ): { erro: Resposta } | { dados: DadosDoConsumivel } {
    const dados: DadosDoConsumivel = {
      codigo: String(corpo.codigo ?? atual?.codigo ?? ''),
      nome: corpo.nome === undefined ? (atual?.nome ?? null) : (corpo.nome as string | null),
      tipo: (corpo.tipo ?? atual?.tipo ?? null) as TipoDeConsumivel | null,
      cor: corpo.cor === undefined ? (atual?.cor ?? null) : (corpo.cor as CorDeConsumivel | null),
      rendimento:
        corpo.rendimento === undefined
          ? (atual?.rendimento ?? null)
          : (corpo.rendimento as number | null),
      fornecedores: (corpo.fornecedores as string[] | undefined) ?? atual?.fornecedores ?? [],
      modelos: (corpo.modelos as string[] | undefined) ?? atual?.modelos ?? [],
    };
    const erros = validarConsumivel(dados);
    if (Object.keys(erros).length > 0) {
      return {
        erro: problema(
          400,
          'dados-invalidos',
          'Confira os campos indicados.',
          erros as Record<string, string>,
        ),
      };
    }
    const limpos = limparConsumivel(dados);
    const repetido = consumiveis.some(
      (outro) =>
        outro.id !== atual?.id &&
        codigoNormalizado(outro.codigo) === codigoNormalizado(limpos.codigo),
    );
    if (repetido) {
      return {
        erro: problema(409, 'conflito', MENSAGEM_DO_CODIGO_REPETIDO, {
          codigo: MENSAGEM_DO_CODIGO_REPETIDO,
        }),
      };
    }
    return { dados: limpos };
  }

  const guardar = (consumivel: ConsumivelGuardado, dados: DadosDoConsumivel) => {
    consumivel.codigo = dados.codigo;
    consumivel.nome = dados.nome;
    consumivel.tipo = dados.tipo as TipoDeConsumivel;
    consumivel.cor = dados.cor;
    consumivel.rendimento = dados.rendimento;
    consumivel.fornecedores = [...dados.fornecedores];
    consumivel.modelos = [...dados.modelos];
  };

  function responder(metodo: string, caminho: string, busca: URLSearchParams, corpo: Corpo) {
    const doModelo = /^\/modelos\/([^/]+)\/consumiveis$/.exec(caminho);
    if (metodo === 'GET' && doModelo) {
      const modelo = catalogo.modelos.find((outro) => outro.id === doModelo[1]);
      if (!modelo) return problema(404, 'nao-encontrado', 'Modelo não encontrado.');
      return ok({
        consumiveis: tipoComCompativeis(modelo.tipoId) ? compativeisDoModelo(modelo.id) : null,
      });
    }
    if (metodo === 'GET' && caminho === '/consumiveis') {
      const texto = busca.get('busca')?.trim() ?? '';
      const situacao = busca.get('situacao') ?? 'ativos';
      const tipo = busca.get('tipo');
      const cor = busca.get('cor');
      const itens = consumiveis
        .filter(
          (consumivel) =>
            (situacao === 'todos' ||
              (situacao === 'ativos') === (consumivel.situacao === 'ativo')) &&
            (!tipo || consumivel.tipo === tipo) &&
            (!cor || consumivel.cor === cor) &&
            (texto === '' ||
              codigoNormalizado(consumivel.codigo).includes(codigoNormalizado(texto)) ||
              normalizarTexto(consumivel.nome ?? '').includes(normalizarTexto(texto))),
        )
        .sort((a, b) => (codigoNormalizado(a.codigo) < codigoNormalizado(b.codigo) ? -1 : 1))
        .map((consumivel) => {
          const { fornecedores: _, modelos: __, permite: ___, ...semListas } = ficha(consumivel);
          return { ...semListas, modelos: consumivel.modelos.length };
        });
      return ok({ itens, total: itens.length, proximo: null, permite: { cadastrar: true } });
    }
    if (metodo === 'GET' && caminho === '/consumiveis/modelos') {
      return ok({
        modelos: catalogo.modelos
          .filter((modelo) => modelo.situacao === 'ativo' && tipoComCompativeis(modelo.tipoId))
          .map((modelo) => ({
            id: modelo.id,
            fabricante: modelo.fabricante,
            nome: modelo.nome,
            tipo: {
              id: modelo.tipoId,
              nome: catalogo.tipos.find((tipo) => tipo.id === modelo.tipoId)?.nome ?? '',
            },
          })),
      });
    }
    if (metodo === 'POST' && caminho === '/consumiveis') {
      const conferido = conferir(corpo);
      if ('erro' in conferido) return conferido.erro;
      const novo: ConsumivelGuardado = {
        id: randomUUID(),
        codigo: '',
        nome: null,
        tipo: 'toner',
        cor: null,
        rendimento: null,
        situacao: 'ativo',
        fornecedores: [],
        modelos: [],
      };
      guardar(novo, conferido.dados);
      consumiveis.push(novo);
      return ok(ficha(novo), 201);
    }
    const doConsumivel = /^\/consumiveis\/([^/]+)(\/(inativacao|reativacao))?$/.exec(caminho);
    const consumivel = consumiveis.find((outro) => outro.id === doConsumivel?.[1]);
    if (!doConsumivel || !consumivel) {
      return problema(404, 'nao-encontrado', 'Consumível não encontrado.');
    }
    if (metodo === 'GET' && !doConsumivel[3]) return ok(ficha(consumivel));
    if (metodo === 'PATCH' && !doConsumivel[3]) {
      const conferido = conferir(corpo, consumivel);
      if ('erro' in conferido) return conferido.erro;
      guardar(consumivel, conferido.dados);
      return ok(ficha(consumivel));
    }
    if (metodo === 'POST' && doConsumivel[3]) {
      consumivel.situacao = doConsumivel[3] === 'inativacao' ? 'inativo' : 'ativo';
      return ok(ficha(consumivel));
    }
    return problema(501, 'nao-simulado', `${metodo} ${caminho} não é simulado.`);
  }

  await pagina.route(
    (url) => url.pathname.startsWith('/api/'),
    async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      const caminho = url.pathname.slice('/api'.length);
      if (!DOS_CONSUMIVEIS.test(caminho)) return rota.fallback();
      const metodo = pedido.method();
      const corpo: Corpo = (metodo !== 'GET' && pedido.postDataJSON()) || {};
      pedidos.push({ metodo, caminho: url.pathname, corpo });
      const resposta = responder(metodo, caminho, url.searchParams, corpo);
      await rota.fulfill({
        status: resposta.status,
        contentType: resposta.status >= 400 ? 'application/problem+json' : 'application/json',
        body: JSON.stringify(resposta.json),
      });
    },
  );

  return {
    consumiveis,
    compativeisDoModelo,
    /** Os corpos das escritas no caminho, como "POST /api/consumiveis", na ordem. */
    corposDe: (pedidoFeito: string) =>
      pedidos
        .filter(({ metodo, caminho }) => `${metodo} ${caminho}` === pedidoFeito)
        .map(({ corpo }) => corpo),
  };
}
