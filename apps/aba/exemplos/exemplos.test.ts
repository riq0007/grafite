// @vitest-environment node
// Os exemplos do cliente em Rust contra o OpenAPI gerado (change aba-dos-colaboradores, design, "As
// rotas", e tarefa 6.2). O serviço e a aba falam com a API por um cliente escrito à mão, e os testes
// do Rust leem estes mesmos arquivos: cada pedido é o corpo que o Rust monta, e cada resposta é um
// corpo que ele lê. Aqui, cada exemplo passa pelo schema da rota no OpenAPI do packages/api-client,
// que o `pnpm contrato:verificar` confere contra a API. Um campo que muda de nome na API reprova o
// exemplo aqui; o exemplo trocado reprova o Rust lá.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

interface Corpo {
  content?: Record<string, { schema?: unknown } | undefined>;
}

interface Operacao {
  requestBody?: Corpo;
  responses?: Record<string, Corpo | undefined>;
}

interface Exemplos {
  /** O método e o caminho no OpenAPI, como "POST /aba/sessao". */
  rota: string;
  /** Os corpos que o Rust manda, por nome. */
  pedidos?: Record<string, unknown>;
  /** Os corpos que o Rust lê, por status e por nome. */
  respostas?: Record<string, Record<string, unknown>>;
}

const PASTA = import.meta.dirname;
const OPENAPI = join(PASTA, '..', '..', '..', 'packages', 'api-client', 'openapi.json');
const FONTES_DA_API = join(PASTA, '..', '..', 'api', 'src');
const JSON_ = 'application/json';
const PREFIXO_DO_PROBLEMA = 'urn:grafite:problema:';

const openapi = JSON.parse(readFileSync(OPENAPI, 'utf8')) as {
  paths: Record<string, Record<string, Operacao>>;
};

const exemplos = readdirSync(PASTA)
  .filter((nome) => nome.endsWith('.json'))
  .sort()
  .map((arquivo) => ({
    arquivo,
    ...(JSON.parse(readFileSync(join(PASTA, arquivo), 'utf8')) as Exemplos),
  }));

// O OpenAPI 3.1 usa o JSON Schema 2020-12. O documento inteiro entra como um schema, e cada corpo é
// validado pelo ponteiro dele, para os $ref de #/components/schemas resolverem. O date-time vem
// também com o pattern, e o format fica de fora.
const ID_DO_OPENAPI = 'https://grafite.invalid/openapi.json';
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
ajv.addSchema({ ...openapi, $id: ID_DO_OPENAPI });

const ponteiro = (partes: string[]) =>
  partes.map((parte) => parte.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');

function noOpenapi(partes: string[]): unknown {
  let valor: unknown = openapi;
  for (const parte of partes) {
    if (typeof valor !== 'object' || valor === null) return undefined;
    valor = (valor as Record<string, unknown>)[parte];
  }
  return valor;
}

/** Os erros do corpo contra o schema no caminho, ou a falta do schema no OpenAPI. */
function conferir(partes: string[], corpo: unknown, nome: string): string[] {
  if (noOpenapi(partes) === undefined) return [`${nome}: o OpenAPI não tem ${partes.join(' ')}`];
  const validar = ajv.compile({ $ref: `${ID_DO_OPENAPI}#/${ponteiro(partes)}` });
  if (validar(corpo)) return [];
  return (validar.errors ?? []).map(
    (erro) => `${nome}: ${erro.instancePath || '(o corpo)'} ${erro.message ?? ''}`,
  );
}

function operacaoDa(rota: string): [caminho: string, metodo: string] {
  const [metodo = '', caminho = ''] = rota.split(' ');
  return [caminho, metodo.toLowerCase()];
}

/** O texto do código da API, sem os testes, para achar os códigos dos problemas. */
function codigoDaApi(): string {
  return readdirSync(FONTES_DA_API, { recursive: true, encoding: 'utf8' })
    .filter((caminho) => caminho.endsWith('.ts') && !caminho.includes('.test.'))
    .map((caminho) => readFileSync(join(FONTES_DA_API, caminho), 'utf8'))
    .join('\n');
}

describe('os exemplos do cliente em Rust', () => {
  it('cada arquivo é de uma rota só', () => {
    const rotas = exemplos.map(({ rota }) => rota);
    expect(rotas.length).toBeGreaterThan(0);
    expect(new Set(rotas).size).toBe(rotas.length);
  });

  it.each(exemplos)('$arquivo: os pedidos e as respostas seguem o OpenAPI', (exemplo) => {
    const [caminho, metodo] = operacaoDa(exemplo.rota);
    const operacao = ['paths', caminho, metodo];
    const erros: string[] = [];
    for (const [nome, corpo] of Object.entries(exemplo.pedidos ?? {})) {
      const schema = [...operacao, 'requestBody', 'content', JSON_, 'schema'];
      erros.push(...conferir(schema, corpo, `o pedido ${nome}`));
    }
    for (const [status, porNome] of Object.entries(exemplo.respostas ?? {})) {
      for (const [nome, corpo] of Object.entries(porNome)) {
        const schema = [...operacao, 'responses', status, 'content', JSON_, 'schema'];
        erros.push(...conferir(schema, corpo, `a resposta ${status} ${nome}`));
      }
    }
    expect(erros).toEqual([]);
  });

  it('cada rota da aba com corpo em JSON tem o exemplo do pedido e o da resposta certa', () => {
    const faltas: string[] = [];
    for (const [caminho, metodos] of Object.entries(openapi.paths)) {
      if (!caminho.startsWith('/aba/')) continue;
      for (const [metodo, operacao] of Object.entries(metodos)) {
        const rota = `${metodo.toUpperCase()} ${caminho}`;
        const exemplo = exemplos.find((de) => de.rota === rota);
        if (operacao.requestBody?.content?.[JSON_] && !Object.keys(exemplo?.pedidos ?? {}).length) {
          faltas.push(`${rota}: o pedido`);
        }
        for (const [status, resposta] of Object.entries(operacao.responses ?? {})) {
          const temExemplo = Object.keys(exemplo?.respostas?.[status] ?? {}).length > 0;
          if (status.startsWith('2') && resposta?.content?.[JSON_] && !temExemplo) {
            faltas.push(`${rota}: a resposta ${status}`);
          }
        }
      }
    }
    expect(faltas).toEqual([]);
  });

  it('os problemas dos exemplos são códigos que a API responde', () => {
    const daApi = codigoDaApi();
    const codigos = exemplos.flatMap(({ respostas = {} }) =>
      Object.values(respostas)
        .flatMap((porNome) => Object.values(porNome))
        .map((corpo) => (corpo as { type?: unknown }).type)
        .filter((tipo): tipo is string => typeof tipo === 'string')
        .map((tipo) => tipo.replace(PREFIXO_DO_PROBLEMA, '')),
    );
    expect(codigos.length).toBeGreaterThan(0);
    expect(codigos.filter((codigo) => !daApi.includes(`'${codigo}'`))).toEqual([]);
  });
});
