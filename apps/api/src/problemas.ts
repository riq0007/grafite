// Erros em formato único (spec plataforma-base, seção 10.1 da spec mestre): toda resposta de erro é
// problem+json (RFC 9457), com o código de rastreio da requisição, que também vai no cabeçalho
// x-codigo-de-rastreio e no log. Uma rota recusa algo lançando um ProblemaDaApi.
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { aleatoriosCrockford } from './crockford.ts';

/** O código que a pessoa informa à TI: 8 caracteres de Crockford em dois grupos, como "R7K2-9QXM". */
export function gerarCodigoDeRastreio(): string {
  const codigo = aleatoriosCrockford(8);
  return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
}

/** O corpo de toda resposta de erro. Os dados extras de um problema (como a pendência) vão junto. */
export const RespostaDeProblema = z
  .looseObject({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    codigoDeRastreio: z.string(),
    campos: z.record(z.string(), z.string()).optional(),
  })
  .meta({ id: 'Problema' });

export interface DadosDoProblema {
  /** O fim do `type`: `urn:grafite:problema:<codigo>`. */
  codigo: string;
  status: number;
  titulo: string;
  detalhe: string;
  /** A mensagem de cada campo recusado, em pt-BR. */
  campos?: Record<string, string>;
  extras?: Record<string, unknown>;
}

/** A recusa que uma rota lança; o tratamento de erros a responde como problem+json. */
export class ProblemaDaApi extends Error {
  readonly dados: DadosDoProblema;

  constructor(dados: DadosDoProblema) {
    super(dados.detalhe);
    this.name = 'ProblemaDaApi';
    this.dados = dados;
  }
}

/** Os campos recusados pelas regras do domínio, como os do schema (400 `dados-invalidos`). */
export const dadosInvalidos = (campos: Record<string, string>) =>
  new ProblemaDaApi({
    codigo: 'dados-invalidos',
    status: 400,
    titulo: 'Dados inválidos',
    detalhe: 'Confira os campos indicados.',
    campos,
  });

/** O pedido esbarra no que já existe, como um nome repetido (409 `conflito`). */
export const conflito = (detalhe: string, campos?: Record<string, string>) =>
  new ProblemaDaApi({ codigo: 'conflito', status: 409, titulo: 'Conflito', detalhe, campos });

/** A ação sobre a própria conta ou a própria pessoa, que se cuida pelos Ajustes (409). */
export const propriaConta = (detalhe: string) =>
  new ProblemaDaApi({ codigo: 'propria-conta', status: 409, titulo: 'Própria conta', detalhe });

/** O registro não existe nesta organização (404 `nao-encontrado`). */
export const naoEncontrado = (detalhe: string) =>
  new ProblemaDaApi({ codigo: 'nao-encontrado', status: 404, titulo: 'Não encontrado', detalhe });

export function enviarProblema(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  { codigo, status, titulo, detalhe, campos, extras }: DadosDoProblema,
) {
  return resposta
    .code(status)
    .type('application/problem+json; charset=utf-8')
    .send({
      ...extras,
      type: `urn:grafite:problema:${codigo}`,
      title: titulo,
      status,
      detail: detalhe,
      codigoDeRastreio: requisicao.id,
      ...(campos ? { campos } : {}),
    });
}

const RECUSAS_DO_FASTIFY: Record<number, Omit<DadosDoProblema, 'status'>> = {
  400: {
    codigo: 'dados-invalidos',
    titulo: 'Dados inválidos',
    detalhe: 'O corpo da requisição não é um JSON válido.',
  },
  413: {
    codigo: 'corpo-grande-demais',
    titulo: 'Corpo grande demais',
    detalhe: 'O corpo da requisição é grande demais.',
  },
  415: { codigo: 'tipo-nao-aceito', titulo: 'Tipo não aceito', detalhe: 'A API só aceita JSON.' },
};

/** Cada campo recusado pelo schema, pelo caminho dele (`endereco.cep`), com a mensagem. */
function camposDaValidacao(validacao: { instancePath: string; message?: string }[]) {
  const campos: Record<string, string> = {};
  for (const { instancePath, message } of validacao) {
    const campo = instancePath.replace(/^\//, '').replaceAll('/', '.');
    if (campo && !(campo in campos)) campos[campo] = message ?? 'Valor inválido.';
  }
  return Object.keys(campos).length > 0 ? campos : undefined;
}

/** Liga o tratamento de erros e de rotas inexistentes da API inteira. */
export function registrarProblemas(app: FastifyInstance) {
  app.setErrorHandler((erro: FastifyError, requisicao, resposta) => {
    if (erro instanceof ProblemaDaApi) return enviarProblema(requisicao, resposta, erro.dados);
    if (hasZodFastifySchemaValidationErrors(erro)) {
      return enviarProblema(requisicao, resposta, {
        codigo: 'dados-invalidos',
        status: 400,
        titulo: 'Dados inválidos',
        detalhe: 'Confira os campos indicados.',
        campos: camposDaValidacao(erro.validation),
      });
    }
    const status = erro.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      const conhecida = RECUSAS_DO_FASTIFY[status] ?? {
        codigo: 'requisicao-recusada',
        titulo: 'Requisição recusada',
        detalhe: 'A requisição foi recusada.',
      };
      return enviarProblema(requisicao, resposta, { ...conhecida, status });
    }
    requisicao.log.error({ err: erro }, 'erro inesperado');
    return enviarProblema(requisicao, resposta, {
      codigo: 'erro-interno',
      status: 500,
      titulo: 'Erro interno do servidor',
      detalhe: `Informe à TI o código ${requisicao.id}.`,
    });
  });

  app.setNotFoundHandler((requisicao, resposta) => {
    return enviarProblema(requisicao, resposta, {
      codigo: 'nao-encontrado',
      status: 404,
      titulo: 'Não encontrado',
      detalhe: 'Este endereço não existe.',
    });
  });
}
