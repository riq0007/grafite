// A API do catálogo de ativos simulada na página, em memória (design do P1a, decisão 9): os tipos,
// os campos, as capacidades, os modelos e a imagem deles. As escritas mudam o estado, e a leitura
// seguinte o devolve, como a API de verdade, com as recusas que as telas mostram. Os caminhos fora
// do catálogo passam adiante: à API da Administração, se o teste a simula, ou à fixture.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { components } from '@grafite/api-client';
import { CAPACIDADES, conferirConfiguracao, normalizarTexto } from '@grafite/domain';
import type { Page } from '@playwright/test';

type Esquemas = components['schemas'];
type Tipo = Esquemas['TipoDeAtivo'];
type Campo = Esquemas['Campo'];
type Modelo = Esquemas['Modelo'];

const id = (numero: number) => `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`;

/** Os ids dos registros que a organização com impressoras já tem. */
export const IDS_DO_CATALOGO = {
  impressora: id(101),
  criticidade: id(111),
  m404: id(121),
};

/** A imagem que a API simulada entrega para a imagem de qualquer modelo, em todo tamanho. */
const IMAGEM = readFileSync(new URL('./exemplos/impressora.svg', import.meta.url), 'utf-8');

type TipoGuardado = Omit<Tipo, 'permite'>;
type CampoGuardado = Omit<Campo, 'permite' | 'usadoPor'>;

interface ModeloGuardado {
  id: string;
  tipoId: string;
  fabricante: string;
  nome: string;
  imagem: { id: string } | null;
  situacao: 'ativo' | 'inativo';
}

export interface EstadoDoCatalogo {
  tipos: TipoGuardado[];
  campos: CampoGuardado[];
  /** Na ordem do cadastro: a grafia do fabricante do mais antigo vale. */
  modelos: ModeloGuardado[];
}

/** Uma organização que já tem a impressora, o campo Criticidade e a HP LaserJet M404. */
function comImpressoras(): EstadoDoCatalogo {
  return {
    tipos: [
      {
        id: IDS_DO_CATALOGO.impressora,
        nome: 'Impressora',
        icone: 'impressora',
        capacidades: [],
        configuracaoDasCapacidades: {},
        campos: [{ campoId: IDS_DO_CATALOGO.criticidade, obrigatorio: false }],
        primeiroCartao: null,
        situacao: 'ativo',
      },
    ],
    campos: [
      {
        id: IDS_DO_CATALOGO.criticidade,
        rotulo: 'Criticidade',
        tipo: 'lista',
        grupo: 'Uso',
        configuracao: {
          opcoes: [
            { id: id(112), rotulo: 'Média', situacao: 'ativa' },
            { id: id(113), rotulo: 'Baixa', situacao: 'ativa' },
          ],
        },
        restrito: false,
        escrita: 'manual',
        situacao: 'ativo',
      },
    ],
    modelos: [
      {
        id: IDS_DO_CATALOGO.m404,
        tipoId: IDS_DO_CATALOGO.impressora,
        fabricante: 'HP',
        nome: 'LaserJet M404',
        imagem: null,
        situacao: 'ativo',
      },
    ],
  };
}

/** Um pedido que chegou à API simulada, com o corpo das escritas. */
interface PedidoFeito {
  metodo: string;
  caminho: string;
  busca: URLSearchParams;
  corpo: unknown;
}

type Corpo = Record<string, unknown>;
type Resposta = { status: number; json: unknown } | { status: 200; imagem: string };

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
const naoEncontrado = (detalhe: string) => problema(404, 'nao-encontrado', detalhe);
const conflito = (detalhe: string, campos?: Record<string, string>) =>
  problema(409, 'conflito', detalhe, campos);

const porNome =
  <T>(nome: (item: T) => string) =>
  (a: T, b: T) =>
    normalizarTexto(nome(a)).localeCompare(normalizarTexto(nome(b)));

export interface OpcoesDoCatalogo {
  /** Começa sem tipos, campos e modelos, como uma organização nova. */
  vazio?: boolean;
  /** O que a conta da sessão pode mudar: as respostas dizem em `permite`. */
  pode?: { catalogo: boolean; modelos: boolean };
}

/** Os caminhos, depois do /api, que esta API responde; os outros passam adiante. */
const DO_CATALOGO = /^\/(tipos-de-ativo|campos|capacidades|modelos|acesso\/administradores)(\/|$)/;

/**
 * Liga a API simulada do catálogo à página. Devolve o estado, para o teste conferir o que mudou, e
 * os corpos das escritas.
 */
export async function simularCatalogo(
  pagina: Page,
  { vazio = false, pode = { catalogo: true, modelos: true } }: OpcoesDoCatalogo = {},
) {
  const estado: EstadoDoCatalogo = vazio
    ? { tipos: [], campos: [], modelos: [] }
    : comImpressoras();
  const pedidos: PedidoFeito[] = [];

  const tipoDaResposta = (tipo: TipoGuardado): Tipo => ({
    ...tipo,
    permite: { editar: pode.catalogo },
  });
  const campoDaResposta = (campo: CampoGuardado): Campo => ({
    ...campo,
    usadoPor: estado.tipos.filter(
      (tipo) =>
        tipo.situacao === 'ativo' && tipo.campos.some((noTipo) => noTipo.campoId === campo.id),
    ).length,
    permite: { editar: pode.catalogo },
  });
  function modeloDaResposta(modelo: ModeloGuardado): Modelo {
    const tipo = estado.tipos.find((candidato) => candidato.id === modelo.tipoId) as TipoGuardado;
    return {
      id: modelo.id,
      tipo: { id: tipo.id, nome: tipo.nome, icone: tipo.icone },
      fabricante: modelo.fabricante,
      nome: modelo.nome,
      imagem: modelo.imagem,
      situacao: modelo.situacao,
      permite: { editar: pode.modelos },
    };
  }
  const exigir = (permitido: boolean) =>
    permitido ? null : problema(403, 'sem-permissao', 'Você não tem permissão para esta ação.');

  // Os tipos.
  function gravarTipo(corpo: Corpo, atual?: TipoGuardado): Resposta {
    const nome = String(corpo.nome ?? atual?.nome ?? '').trim();
    const repetido = estado.tipos.some(
      (tipo) => tipo.id !== atual?.id && normalizarTexto(tipo.nome) === normalizarTexto(nome),
    );
    if (repetido) {
      return conflito('Já existe um tipo com este nome.', {
        nome: 'Já existe um tipo com este nome.',
      });
    }
    const dados = {
      nome,
      icone: (corpo.icone ?? atual?.icone) as Tipo['icone'],
      capacidades: (corpo.capacidades ?? atual?.capacidades ?? []) as string[],
      configuracaoDasCapacidades: (corpo.configuracaoDasCapacidades ??
        atual?.configuracaoDasCapacidades ??
        {}) as Tipo['configuracaoDasCapacidades'],
      campos: (corpo.campos ?? atual?.campos ?? []) as Tipo['campos'],
      primeiroCartao: (corpo.primeiroCartao === undefined
        ? (atual?.primeiroCartao ?? null)
        : corpo.primeiroCartao) as Tipo['primeiroCartao'],
    };
    if (atual) {
      Object.assign(atual, dados);
      return ok(tipoDaResposta(atual));
    }
    const novo: TipoGuardado = { id: randomUUID(), ...dados, situacao: 'ativo' };
    estado.tipos.push(novo);
    return ok(tipoDaResposta(novo), 201);
  }

  // Os campos.
  function gravarCampo(corpo: Corpo, atual?: CampoGuardado): Resposta {
    const rotulo = String(corpo.rotulo ?? atual?.rotulo ?? '').trim();
    const repetido = estado.campos.some(
      (campo) =>
        campo.id !== atual?.id && normalizarTexto(campo.rotulo) === normalizarTexto(rotulo),
    );
    if (repetido) {
      return conflito('Já existe um campo com este rótulo.', {
        rotulo: 'Já existe um campo com este rótulo.',
      });
    }
    const tipo = (atual?.tipo ?? corpo.tipo) as Campo['tipo'];
    const conferida = conferirConfiguracao(
      tipo,
      corpo.configuracao ?? atual?.configuracao ?? {},
      randomUUID,
    );
    if (!conferida.ok) {
      return problema(
        400,
        'dados-invalidos',
        'Confira os campos.',
        Object.fromEntries(
          Object.entries(conferida.erros).map(([chave, motivo]) => [
            chave === 'configuracao' ? chave : `configuracao.${chave}`,
            motivo,
          ]),
        ),
      );
    }
    const dados = {
      rotulo,
      tipo,
      grupo: (corpo.grupo === undefined ? atual?.grupo : corpo.grupo) as string | null,
      configuracao: conferida.configuracao as Campo['configuracao'],
      restrito: Boolean(corpo.restrito ?? atual?.restrito),
      escrita: (corpo.escrita ?? atual?.escrita ?? 'automatica') as Campo['escrita'],
    };
    if (atual) {
      Object.assign(atual, dados);
      return ok(campoDaResposta(atual));
    }
    const novo: CampoGuardado = { id: randomUUID(), ...dados, situacao: 'ativo' };
    estado.campos.push(novo);
    return ok(campoDaResposta(novo), 201);
  }

  // Os modelos.
  const fabricanteQueVale = (pedido: string) =>
    estado.modelos.find((modelo) => normalizarTexto(modelo.fabricante) === normalizarTexto(pedido))
      ?.fabricante ?? pedido;

  function listarModelos(busca: URLSearchParams): Resposta {
    const situacao = busca.get('situacao') ?? 'ativos';
    const palavras = normalizarTexto(busca.get('busca') ?? '')
      .split(' ')
      .filter(Boolean);
    const limite = Number(busca.get('limite') ?? 50);
    const filtrados = estado.modelos
      .filter((modelo) => !busca.get('tipo') || modelo.tipoId === busca.get('tipo'))
      // Os modelos de qualquer dos tipos pedidos, para o filtro de Modelo seguir o de Tipo.
      .filter(
        (modelo) => !busca.get('tipos') || busca.get('tipos')?.split(',').includes(modelo.tipoId),
      )
      .filter(
        (modelo) =>
          situacao === 'todos' || modelo.situacao === (situacao === 'ativos' ? 'ativo' : 'inativo'),
      )
      .filter((modelo) => {
        const texto = normalizarTexto(`${modelo.fabricante} ${modelo.nome}`);
        return palavras.every((palavra) => texto.includes(palavra));
      })
      .sort(porNome((modelo) => `${modelo.fabricante} ${modelo.nome}`));
    return ok({
      itens: filtrados.slice(0, limite).map(modeloDaResposta),
      proximo: null,
      total: filtrados.length,
      permite: { cadastrar: pode.modelos },
    });
  }

  function fabricantes(busca: URLSearchParams): Resposta {
    const texto = normalizarTexto(busca.get('busca') ?? '');
    const vistos = new Map<string, string>();
    for (const modelo of estado.modelos) {
      const chave = normalizarTexto(modelo.fabricante);
      if (!vistos.has(chave)) vistos.set(chave, modelo.fabricante);
    }
    return ok({
      fabricantes: [...vistos.entries()]
        .filter(([chave]) => chave.includes(texto))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, grafia]) => grafia),
    });
  }

  function gravarModelo(corpo: Corpo, atual?: ModeloGuardado): Resposta {
    const tipoId = atual?.tipoId ?? String(corpo.tipoId);
    const tipo = estado.tipos.find((candidato) => candidato.id === tipoId);
    if (!tipo) return problema(400, 'dados-invalidos', 'Tipo de ativo não encontrado.');
    if (!atual && tipo.situacao === 'inativo') {
      const motivo = `O tipo ${tipo.nome} está inativo.`;
      return conflito(motivo, { tipoId: motivo });
    }
    const fabricante = fabricanteQueVale(String(corpo.fabricante ?? atual?.fabricante).trim());
    const nome = String(corpo.nome ?? atual?.nome).trim();
    const repetido = estado.modelos.some(
      (modelo) =>
        modelo.id !== atual?.id &&
        modelo.tipoId === tipoId &&
        normalizarTexto(modelo.fabricante) === normalizarTexto(fabricante) &&
        normalizarTexto(modelo.nome) === normalizarTexto(nome),
    );
    if (repetido) {
      return conflito('Já existe este modelo neste tipo.', {
        nome: 'Já existe este modelo neste tipo.',
      });
    }
    if (atual) {
      Object.assign(atual, { fabricante, nome });
      return ok(modeloDaResposta(atual));
    }
    const novo: ModeloGuardado = {
      id: randomUUID(),
      tipoId,
      fabricante,
      nome,
      imagem: null,
      situacao: 'ativo',
    };
    estado.modelos.push(novo);
    return ok(modeloDaResposta(novo), 201);
  }

  const tipoDe = (tipoId = '') => estado.tipos.find((tipo) => tipo.id === tipoId);
  const campoDe = (campoId = '') => estado.campos.find((campo) => campo.id === campoId);
  const modeloDe = (modeloId = '') => estado.modelos.find((modelo) => modelo.id === modeloId);

  /** Muda a situação do registro, se ele existe, e responde com ele. */
  const mudarSituacao = <T extends { situacao: string }>(
    registro: T | undefined,
    situacao: T['situacao'],
    resposta: (registro: T) => unknown,
    naoExiste: string,
  ): Resposta => {
    if (!registro) return naoEncontrado(naoExiste);
    registro.situacao = situacao;
    return ok(resposta(registro));
  };

  const rotas: [
    string,
    RegExp,
    (partes: string[], busca: URLSearchParams, corpo: Corpo) => Resposta,
  ][] = [
    [
      'GET',
      /^\/capacidades$/,
      () =>
        ok({
          // Como a API: a configuração vem sempre, nula na capacidade sem nenhuma.
          capacidades: CAPACIDADES.map((capacidade) => ({
            ...capacidade,
            configuracao: capacidade.configuracao ?? null,
            campos: [...capacidade.campos],
          })),
        }),
    ],
    [
      'GET',
      /^\/tipos-de-ativo$/,
      () =>
        ok({
          tipos: [...estado.tipos].sort(porNome((tipo) => tipo.nome)).map(tipoDaResposta),
          permite: { cadastrar: pode.catalogo },
        }),
    ],
    ['POST', /^\/tipos-de-ativo$/, (_, __, corpo) => exigir(pode.catalogo) ?? gravarTipo(corpo)],
    [
      'PATCH',
      /^\/tipos-de-ativo\/([^/]+)$/,
      ([tipoId], __, corpo) => {
        const tipo = tipoDe(tipoId);
        if (!tipo) return naoEncontrado('Tipo de ativo não encontrado.');
        return exigir(pode.catalogo) ?? gravarTipo(corpo, tipo);
      },
    ],
    [
      'POST',
      /^\/tipos-de-ativo\/([^/]+)\/(inativacao|reativacao)$/,
      ([tipoId, acao]) =>
        exigir(pode.catalogo) ??
        mudarSituacao(
          tipoDe(tipoId),
          acao === 'inativacao' ? 'inativo' : 'ativo',
          tipoDaResposta,
          'Tipo de ativo não encontrado.',
        ),
    ],
    [
      'GET',
      /^\/campos$/,
      () =>
        ok({
          campos: [...estado.campos].sort(porNome((campo) => campo.rotulo)).map(campoDaResposta),
          permite: { cadastrar: pode.catalogo },
        }),
    ],
    ['POST', /^\/campos$/, (_, __, corpo) => exigir(pode.catalogo) ?? gravarCampo(corpo)],
    [
      'PATCH',
      /^\/campos\/([^/]+)$/,
      ([campoId], __, corpo) => {
        const campo = campoDe(campoId);
        if (!campo) return naoEncontrado('Campo não encontrado.');
        return exigir(pode.catalogo) ?? gravarCampo(corpo, campo);
      },
    ],
    [
      'POST',
      /^\/campos\/([^/]+)\/(inativacao|reativacao)$/,
      ([campoId, acao]) =>
        exigir(pode.catalogo) ??
        mudarSituacao(
          campoDe(campoId),
          acao === 'inativacao' ? 'inativo' : 'ativo',
          campoDaResposta,
          'Campo não encontrado.',
        ),
    ],
    ['GET', /^\/modelos$/, (_, busca) => listarModelos(busca)],
    ['GET', /^\/modelos\/fabricantes$/, (_, busca) => fabricantes(busca)],
    ['POST', /^\/modelos$/, (_, __, corpo) => exigir(pode.modelos) ?? gravarModelo(corpo)],
    [
      'GET',
      /^\/modelos\/([^/]+)$/,
      ([modeloId]) => {
        const modelo = modeloDe(modeloId);
        return modelo ? ok(modeloDaResposta(modelo)) : naoEncontrado('Modelo não encontrado.');
      },
    ],
    [
      'PATCH',
      /^\/modelos\/([^/]+)$/,
      ([modeloId], __, corpo) => {
        const modelo = modeloDe(modeloId);
        if (!modelo) return naoEncontrado('Modelo não encontrado.');
        return exigir(pode.modelos) ?? gravarModelo(corpo, modelo);
      },
    ],
    [
      'POST',
      /^\/modelos\/([^/]+)\/(inativacao|reativacao)$/,
      ([modeloId, acao]) =>
        exigir(pode.modelos) ??
        mudarSituacao(
          modeloDe(modeloId),
          acao === 'inativacao' ? 'inativo' : 'ativo',
          modeloDaResposta,
          'Modelo não encontrado.',
        ),
    ],
    [
      'PUT',
      /^\/modelos\/([^/]+)\/imagem$/,
      ([modeloId]) => {
        const modelo = modeloDe(modeloId);
        if (!modelo) return naoEncontrado('Modelo não encontrado.');
        const recusa = exigir(pode.modelos);
        if (recusa) return recusa;
        modelo.imagem = { id: randomUUID() };
        return ok(modeloDaResposta(modelo));
      },
    ],
    [
      'DELETE',
      /^\/modelos\/([^/]+)\/imagem$/,
      ([modeloId]) => {
        const modelo = modeloDe(modeloId);
        if (!modelo) return naoEncontrado('Modelo não encontrado.');
        const recusa = exigir(pode.modelos);
        if (recusa) return recusa;
        modelo.imagem = null;
        return ok(modeloDaResposta(modelo));
      },
    ],
    [
      'GET',
      /^\/modelos\/([^/]+)\/imagem\/([^/]+)\/[^/]+$/,
      ([modeloId, arquivo]) =>
        modeloDe(modeloId)?.imagem?.id === arquivo
          ? { status: 200, imagem: IMAGEM }
          : naoEncontrado('Imagem não encontrada.'),
    ],
    ['GET', /^\/acesso\/administradores$/, () => ok({ administradores: ['Ana Souza'] })],
  ];

  await pagina.route(
    (url) => url.pathname.startsWith('/api/'),
    async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      const caminho = url.pathname.slice('/api'.length);
      if (!DO_CATALOGO.test(caminho)) return rota.fallback();
      const metodo = pedido.method();
      // As escritas vêm em JSON, e o envio de uma imagem, nos bytes crus dela.
      const emJson = pedido.headers()['content-type']?.startsWith('application/json');
      const corpo: Corpo = (emJson && pedido.postDataJSON()) || {};
      pedidos.push({ metodo, caminho: url.pathname, busca: url.searchParams, corpo });
      const encontrada = rotas
        .map(([metodoDaRota, padrao, responder]) => ({
          partes: metodoDaRota === metodo ? caminho.match(padrao) : null,
          responder,
        }))
        .find(({ partes }) => partes !== null);
      const resposta = encontrada?.partes
        ? encontrada.responder(encontrada.partes.slice(1), url.searchParams, corpo)
        : problema(501, 'nao-simulado', `A API simulada não responde ${metodo} ${url.pathname}.`);
      if ('imagem' in resposta) {
        await rota.fulfill({ headers: { 'content-type': 'image/svg+xml' }, body: resposta.imagem });
        return;
      }
      await rota.fulfill({
        status: resposta.status,
        contentType: resposta.status >= 400 ? 'application/problem+json' : 'application/json',
        body: JSON.stringify(resposta.json),
      });
    },
  );

  return {
    estado,
    /** Os corpos das escritas no caminho, como "POST /api/modelos", na ordem. */
    corposDe: (pedidoFeito: string) =>
      pedidos
        .filter(({ metodo, caminho }) => `${metodo} ${caminho}` === pedidoFeito)
        .map(({ corpo }) => corpo),
  };
}
