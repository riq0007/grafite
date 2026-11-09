// A API do cofre simulada na página, em memória (design do P6, decisão 11): a lista, a ficha, o
// cadastro, o acesso, a liberação pelo código do app e o revelar e copiar. As escritas mudam o
// estado, e a leitura seguinte o devolve, como a API de verdade; o valor só sai na revelação e na
// cópia, com o cofre liberado. Os caminhos fora do cofre passam adiante.
import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import { conferirSegredo, normalizarTexto } from '@grafite/domain';
import type { Page } from '@playwright/test';

type Ficha = components['schemas']['FichaDoSegredo'];
type Titular = NonNullable<Ficha['acesso']>[number];
type Corpo = Record<string, unknown>;
type Resposta = { status: number; json: unknown; semCache?: boolean };

/** O código do app que a simulação aceita, uma vez por liberação. */
export const CODIGO_DO_APP = '123456';

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

const CONTA = {
  tipo: 'conta' as const,
  id: '0199a6e0-0000-7000-8000-0000000000c1',
  nome: 'Ana Souza',
};
const TITULARES = {
  contas: [{ id: CONTA.id, nome: 'Ana Souza', usuario: 'ana.souza' }],
  grupos: [{ id: '0199a6e0-0000-7000-8000-00000000c501', nome: 'Suporte' }],
  perfis: [{ id: '0199a6e0-0000-7000-8000-00000000c601', nome: 'Técnico' }],
};
const PESSOAS = [
  { id: '0199a6e0-0000-7000-8000-0000000000a1', nome: 'Ana Souza' },
  { id: '0199a6e0-0000-7000-8000-00000000c701', nome: 'Carla Dias' },
];

/** Um segredo guardado: a ficha e o valor, que só a revelação e a cópia devolvem. */
export interface SegredoGuardado {
  ficha: Ficha;
  valor: string;
}

export interface EstadoDoCofre {
  segredos: SegredoGuardado[];
  liberadoAte: string | null;
  /** As revelações e as cópias, na ordem, pelo nome do segredo. */
  pedidos: string[];
}

/** Um segredo pronto, liberado à conta da sessão, para os testes que não passam pelo cadastro. */
export function segredoDeExemplo(nome: string, valor: string, extras: Partial<Ficha> = {}) {
  const momento = '2026-10-01T12:00:00.000Z';
  const ficha: Ficha = {
    id: randomUUID(),
    nome,
    tipo: 'conta-administrativa',
    classificacao: 'equipamento',
    identificador: 'admin',
    endereco: null,
    pessoa: null,
    validade: null,
    proximaRotacao: null,
    situacao: 'ativo',
    notas: null,
    ativos: [],
    valorTrocadoEm: momento,
    criadoEm: momento,
    atualizadoEm: momento,
    acesso: [CONTA],
    permite: { revelar: true, administrar: true },
    ...extras,
  };
  return { ficha, valor };
}

export async function simularCofre(
  pagina: Page,
  {
    iniciais = [],
    semDoisPassos = false,
  }: { iniciais?: SegredoGuardado[]; semDoisPassos?: boolean } = {},
) {
  const estado: EstadoDoCofre = { segredos: [...iniciais], liberadoAte: null, pedidos: [] };
  const liberado = () =>
    estado.liberadoAte !== null && new Date(estado.liberadoAte).getTime() > Date.now();
  const doId = (id: string) => estado.segredos.find((segredo) => segredo.ficha.id === id);
  const naoEncontrado = () => problema(404, 'nao-encontrado', 'Segredo não encontrado.');

  /** A ficha com o acesso e o que a conta pode, como a API a monta a cada leitura. */
  function comoFicha({ ficha }: SegredoGuardado): Ficha {
    const alcanca = (ficha.acesso ?? []).some((titular) => titular.id === CONTA.id);
    return {
      ...ficha,
      permite: { revelar: alcanca && ficha.situacao === 'ativo', administrar: true },
    };
  }

  function dados(
    corpo: Corpo,
    valorObrigatorio: boolean,
    atual?: Ficha,
  ): { recusa: Resposta } | { dados: Corpo & { valor: string | null } } {
    const conferido = conferirSegredo({ ...atual, ...corpo }, { valorObrigatorio });
    if (!conferido.ok) {
      return {
        recusa: problema(400, 'dados-invalidos', 'Confira os campos indicados.', conferido.erros),
      };
    }
    return { dados: conferido.dados as unknown as Corpo & { valor: string | null } };
  }

  const pessoaDo = (corpo: Corpo, atual: Ficha['pessoa']) =>
    corpo.pessoaId === undefined
      ? atual
      : (PESSOAS.find((pessoa) => pessoa.id === corpo.pessoaId) ?? null);

  const rotas: [
    string,
    RegExp,
    (partes: string[], corpo: Corpo, busca: URLSearchParams) => Resposta,
  ][] = [
    [
      'GET',
      /^\/cofre\/segredos$/,
      (_, __, busca) => {
        const palavras = normalizarTexto(busca.get('busca') ?? '')
          .split(' ')
          .filter(Boolean);
        const situacao = busca.get('situacao') ?? 'ativos';
        const segredos = estado.segredos
          .map(({ ficha }) => ficha)
          .filter(
            (ficha) =>
              situacao === 'todos' || (situacao === 'ativos') === (ficha.situacao === 'ativo'),
          )
          .filter((ficha) => !busca.get('tipo') || ficha.tipo === busca.get('tipo'))
          .filter(
            (ficha) =>
              !busca.get('classificacao') || ficha.classificacao === busca.get('classificacao'),
          )
          .filter((ficha) => {
            const texto = normalizarTexto(
              [ficha.nome, ficha.identificador, ficha.endereco].filter(Boolean).join(' '),
            );
            return palavras.every((palavra) => texto.includes(palavra));
          })
          .sort((a, b) => normalizarTexto(a.nome).localeCompare(normalizarTexto(b.nome)))
          .map(({ notas: _, ativos: __, acesso: ___, permite: ____, ...item }) => item);
        return ok({ segredos, permite: { cadastrar: true } });
      },
    ],
    [
      'GET',
      /^\/cofre\/segredos\/([^/]+)$/,
      ([id = '']) => {
        const segredo = doId(id);
        return segredo ? ok(comoFicha(segredo)) : naoEncontrado();
      },
    ],
    [
      'POST',
      /^\/cofre\/segredos$/,
      (_, corpo) => {
        const conferido = dados(corpo, true);
        if ('recusa' in conferido) return conferido.recusa;
        const { valor, ...resto } = conferido.dados;
        const momento = new Date().toISOString();
        const segredo: SegredoGuardado = {
          valor: valor ?? '',
          ficha: {
            ...(resto as unknown as Ficha),
            id: randomUUID(),
            pessoa: pessoaDo(corpo, null),
            situacao: 'ativo',
            ativos: [],
            valorTrocadoEm: momento,
            criadoEm: momento,
            atualizadoEm: momento,
            acesso: [CONTA],
            permite: { revelar: true, administrar: true },
          },
        };
        estado.segredos.push(segredo);
        return ok(comoFicha(segredo), 201);
      },
    ],
    [
      'PATCH',
      /^\/cofre\/segredos\/([^/]+)$/,
      ([id = ''], corpo) => {
        const segredo = doId(id);
        if (!segredo) return naoEncontrado();
        const conferido = dados(corpo, false, segredo.ficha);
        if ('recusa' in conferido) return conferido.recusa;
        const { valor, ...resto } = conferido.dados;
        if (valor !== null) segredo.valor = valor;
        segredo.ficha = {
          ...segredo.ficha,
          ...(resto as Partial<Ficha>),
          pessoa: pessoaDo(corpo, segredo.ficha.pessoa),
        };
        return ok(comoFicha(segredo));
      },
    ],
    [
      'PUT',
      /^\/cofre\/segredos\/([^/]+)\/acesso$/,
      ([id = ''], corpo) => {
        const segredo = doId(id);
        if (!segredo) return naoEncontrado();
        const nomes = new Map<string, string>([
          ...TITULARES.contas.map(({ id: idDela, nome }) => [idDela, nome] as const),
          ...TITULARES.grupos.map(({ id: idDele, nome }) => [idDele, nome] as const),
          ...TITULARES.perfis.map(({ id: idDele, nome }) => [idDele, nome] as const),
        ]);
        const titulares = (corpo.titulares as Pick<Titular, 'tipo' | 'id'>[]) ?? [];
        segredo.ficha = {
          ...segredo.ficha,
          acesso: titulares.map((titular) => ({ ...titular, nome: nomes.get(titular.id) ?? '' })),
        };
        return ok(comoFicha(segredo));
      },
    ],
    ...(['inativacao', 'reativacao'] as const).map(
      (caminho) =>
        [
          'POST',
          new RegExp(`^\\/cofre\\/segredos\\/([^/]+)\\/${caminho}$`),
          ([id = '']: string[]) => {
            const segredo = doId(id);
            if (!segredo) return naoEncontrado();
            segredo.ficha = {
              ...segredo.ficha,
              situacao: caminho === 'inativacao' ? 'inativo' : 'ativo',
            };
            return ok(comoFicha(segredo));
          },
        ] as [string, RegExp, (partes: string[]) => Resposta],
    ),
    ['GET', /^\/cofre\/titulares$/, () => ok(TITULARES)],
    ['GET', /^\/cofre\/pessoas$/, () => ok({ pessoas: PESSOAS })],
    [
      'GET',
      /^\/cofre\/liberacao$/,
      () => ok({ liberadoAte: liberado() ? estado.liberadoAte : null }),
    ],
    [
      'POST',
      /^\/cofre\/liberacao$/,
      (_, corpo) => {
        if (corpo.codigo !== CODIGO_DO_APP) {
          return problema(
            401,
            'codigo-invalido',
            'Código incorreto. Confira se o relógio do celular está certo e tente de novo.',
          );
        }
        estado.liberadoAte = new Date(Date.now() + 5 * 60_000).toISOString();
        return ok({ liberadoAte: estado.liberadoAte });
      },
    ],
    ...(['revelacao', 'copia'] as const).map(
      (pedido) =>
        [
          'POST',
          new RegExp(`^\\/cofre\\/segredos\\/([^/]+)\\/${pedido}$`),
          ([id = '']: string[]) => {
            const segredo = doId(id);
            if (!segredo) return naoEncontrado();
            if (!liberado()) {
              return problema(
                403,
                'cofre-fechado',
                'Confirme o código do app para revelar e copiar.',
              );
            }
            estado.pedidos.push(`${pedido} ${segredo.ficha.nome}`);
            return { ...ok({ valor: segredo.valor }), semCache: true };
          },
        ] as [string, RegExp, (partes: string[]) => Resposta],
    ),
  ];

  await pagina.route(
    (url) => url.pathname.startsWith('/api/cofre/'),
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
      const resposta = semDoisPassos
        ? problema(
            403,
            'cofre-sem-dois-passos',
            'Cadastre a verificação em dois passos em Ajustes › Conta para usar o cofre.',
          )
        : encontrada?.partes
          ? encontrada.responder(encontrada.partes.slice(1), corpo, url.searchParams)
          : problema(501, 'nao-simulado', `A API simulada não responde ${metodo} ${url.pathname}.`);
      await rota.fulfill({
        status: resposta.status,
        contentType: resposta.status >= 400 ? 'application/problem+json' : 'application/json',
        headers: resposta.semCache ? { 'cache-control': 'no-store', pragma: 'no-cache' } : {},
        body: JSON.stringify(resposta.json),
      });
    },
  );

  return estado;
}

export { TITULARES };
