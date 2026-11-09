import { z } from 'zod';
import { PORTA_DO_SNMP } from './snmp.ts';

/** Configuração inválida: lista todas as variáveis com problema, na ordem do esquema. */
export class ErroDeConfiguracao extends Error {
  variaveis: string[];

  constructor(variaveis: string[], detalhes: string[]) {
    super(`Configuração inválida do coletor:\n${detalhes.map((d) => `  - ${d}`).join('\n')}`);
    this.name = 'ErroDeConfiguracao';
    this.variaveis = variaveis;
  }
}

export interface Configuracao {
  /** O começo dos endereços da API, sem a barra do fim. */
  urlDaApi: string;
  token: string;
  /**
   * O endereço de acesso da organização, que vai no cabeçalho Host: a API acha a organização por
   * ele mesmo quando o coletor fala com ela por 127.0.0.1 (design do P2a, decisão 1).
   */
  endereco: string;
  /** A pasta da fila em disco. */
  pasta: string;
  porta: number;
  host: string;
  /** A porta do SNMP nas impressoras; outra só para o simulador dos testes. */
  portaDoSnmp: number;
}

const ENDERECO = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

const porta = (padrao: number) =>
  z.coerce
    .number({ error: 'deve ser um número' })
    .int({ error: 'deve ser inteira' })
    .min(1, { error: 'deve estar entre 1 e 65535' })
    .max(65535, { error: 'deve estar entre 1 e 65535' })
    .default(padrao);

// URL da API e token não têm padrão; o endereço vem da URL, e a pasta, as portas e o host (não
// sensíveis) têm.
const esquema = z.object({
  GRAFITE_COLETOR_API_URL: z
    .string({ error: 'obrigatória (endereço da API do Grafite)' })
    .regex(/^https?:\/\//, { error: 'deve começar com http:// ou https://' }),
  GRAFITE_COLETOR_TOKEN: z
    .string({ error: 'obrigatório (token do coletor emitido pela API)' })
    .min(32, { error: 'deve ter pelo menos 32 caracteres' }),
  GRAFITE_COLETOR_ENDERECO: z
    .string()
    .transform((endereco) => endereco.trim().toLowerCase())
    .refine((endereco) => ENDERECO.test(endereco), {
      error: 'deve ser um endereço de acesso da organização, como grafite.empresa.local, sem porta',
    })
    .optional(),
  GRAFITE_COLETOR_PASTA: z
    .string()
    .min(1, { error: 'não pode ser vazia' })
    .default('.grafite/coletor'),
  GRAFITE_COLETOR_PORTA: porta(3100),
  GRAFITE_COLETOR_HOST: z.string().min(1, { error: 'não pode ser vazio' }).default('127.0.0.1'),
  GRAFITE_COLETOR_PORTA_DO_SNMP: porta(PORTA_DO_SNMP),
});

export function carregarConfiguracao(env: Record<string, string | undefined>): Configuracao {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    const ordem = Object.keys(esquema.shape);
    const variaveis = [...new Set(resultado.error.issues.map((i) => String(i.path[0])))].sort(
      (a, b) => ordem.indexOf(a) - ordem.indexOf(b),
    );
    const detalhes = resultado.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`);
    throw new ErroDeConfiguracao(variaveis, detalhes);
  }
  const urlDaApi = resultado.data.GRAFITE_COLETOR_API_URL.replace(/\/+$/, '');
  return {
    urlDaApi,
    token: resultado.data.GRAFITE_COLETOR_TOKEN,
    endereco: resultado.data.GRAFITE_COLETOR_ENDERECO ?? new URL(urlDaApi).hostname.toLowerCase(),
    pasta: resultado.data.GRAFITE_COLETOR_PASTA,
    porta: resultado.data.GRAFITE_COLETOR_PORTA,
    host: resultado.data.GRAFITE_COLETOR_HOST,
    portaDoSnmp: resultado.data.GRAFITE_COLETOR_PORTA_DO_SNMP,
  };
}
