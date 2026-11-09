// A organização de cada requisição de acesso vem do endereço pedido (design do F2a, decisão 1), pela
// função app.organizacao_do_endereco(), a única consulta que atravessa organizações. Um cache curto
// poupa a consulta; um endereço registrado pelo comando no servidor passa a valer em até 10 s.
import type { Banco } from '@grafite/db';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ProblemaDaApi } from '../problemas.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * A organização do endereço pedido, nas rotas de acesso, e se ela opera o servidor: a do
     * endereço de GRAFITE_ORGANIZACAO_OPERADORA, por qualquer endereço dela.
     */
    organizacao: { id: string; operaOServidor: boolean } | null;
  }
}

/** Por quanto tempo uma descoberta vale no cache, em ms. */
const VALIDADE = { conhecido: 60_000, desconhecido: 10_000 };
/** Um cabeçalho Host inventado a cada requisição não faz o cache crescer sem fim. */
const ENDERECOS_NO_CACHE = 1000;

/**
 * O endereço como ele é registrado: minúsculas, sem a porta, sem o ponto final e sem os colchetes
 * do IPv6. Um dois-pontos só separa a porta; o IPv6 tem pelo menos dois.
 */
export function normalizarEndereco(host: string): string {
  let endereco = host.trim().toLowerCase();
  if (endereco.startsWith('[')) {
    const fim = endereco.indexOf(']');
    endereco = endereco.slice(1, fim > 0 ? fim : undefined);
  } else if (endereco.split(':').length === 2) {
    endereco = endereco.slice(0, endereco.indexOf(':'));
  }
  return endereco.replace(/\.$/, '');
}

/** A organização de um endereço já normalizado, ou `null`: a única consulta entre organizações. */
export async function organizacaoDoEndereco(
  banco: Banco,
  endereco: string,
): Promise<string | null> {
  const { rows } = await banco.execute<{ org: string | null }>(
    sql`select app.organizacao_do_endereco(${endereco}) as org`,
  );
  return rows[0]?.org ?? null;
}

export type ResolvedorDeOrganizacao = (host: string) => Promise<string | null>;

export function criarResolvedorDeOrganizacao({
  banco,
  agora,
}: {
  banco: Banco;
  agora: () => Date;
}): ResolvedorDeOrganizacao {
  const cache = new Map<string, { org: string | null; ate: number }>();
  return async (host) => {
    const endereco = normalizarEndereco(host);
    const momento = agora().getTime();
    const guardado = cache.get(endereco);
    if (guardado && guardado.ate > momento) return guardado.org;
    const org = await organizacaoDoEndereco(banco, endereco);
    if (cache.size >= ENDERECOS_NO_CACHE) cache.delete(cache.keys().next().value ?? '');
    cache.set(endereco, {
      org,
      ate: momento + (org ? VALIDADE.conhecido : VALIDADE.desconhecido),
    });
    return org;
  };
}

/** As rotas do escopo rodam na organização do endereço pedido; um endereço desconhecido é recusado. */
export function exigirOrganizacao(
  escopo: FastifyInstance,
  resolver: ResolvedorDeOrganizacao,
  enderecoDaOperadora?: string,
) {
  escopo.addHook('onRequest', async (requisicao) => {
    const org = await resolver(requisicao.host);
    if (!org) {
      throw new ProblemaDaApi({
        codigo: 'endereco-desconhecido',
        status: 404,
        titulo: 'Endereço desconhecido',
        detalhe: 'Este endereço não está ligado a nenhuma organização.',
      });
    }
    const operadora = enderecoDaOperadora ? await resolver(enderecoDaOperadora) : null;
    requisicao.organizacao = { id: org, operaOServidor: operadora === org };
  });
}
