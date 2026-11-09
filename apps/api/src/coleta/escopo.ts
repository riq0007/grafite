// O escopo das rotas do coletor (spec coletor-local, "Identificação do coletor na API"; design do
// P2a, decisões 1 e 2): a organização vem do endereço pedido, como nas telas, e o coletor, do token no
// cabeçalho Authorization, procurado só entre os coletores ativos dela. Não há sessão, cookie nem a
// proteção contra outros sites, que é das telas: o navegador não manda esse cabeçalho sozinho. O
// último contato e a versão ficam gravados no máximo uma vez por minuto, ou quando a versão muda.
import { type Banco, coletores, naOrganizacao } from '@grafite/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { exigirOrganizacao, type ResolvedorDeOrganizacao } from '../acesso/organizacao.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { ProblemaDaApi } from '../problemas.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** O coletor do token, nas rotas da coleta. */
    coletor: ColetorDaRequisicao | null;
  }
}

export interface ColetorDaRequisicao {
  id: string;
  /** O nome, que a auditoria mostra no que a coleta grava, como o número de série. */
  nome: string;
  /** As faixas de rede que ele alcança, na forma canônica. */
  faixas: string[];
}

/** O cabeçalho com a versão do coletor, que a tela dos coletores mostra. */
export const CABECALHO_DA_VERSAO = 'x-grafite-versao-do-coletor';

/** De quanto em quanto tempo, no máximo, o último contato é gravado. */
const CONTATO_GRAVADO_A_CADA = 60_000;

export const tokenRecusado = () =>
  new ProblemaDaApi({
    codigo: 'token-do-coletor-recusado',
    status: 401,
    titulo: 'Token recusado',
    detalhe: 'Token do coletor recusado.',
  });

/** O token do cabeçalho `Authorization: Bearer <token>`, ou `null`. */
function tokenDoCabecalho(cabecalho: string | undefined): string | null {
  const achado = /^Bearer\s+(\S+)$/i.exec(cabecalho?.trim() ?? '');
  return achado?.[1] ?? null;
}

/** A versão informada, quando ela cabe no registro: até 40 caracteres visíveis. */
function versaoDoCabecalho(cabecalho: string | string[] | undefined): string | null {
  const versao = (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho)?.trim() ?? '';
  return /^[\x21-\x7e]{1,40}$/.test(versao) ? versao : null;
}

export function instalarColeta(
  escopo: FastifyInstance,
  {
    banco,
    agora,
    resolver,
    organizacaoOperadora,
  }: {
    banco: Banco;
    agora: () => Date;
    resolver: ResolvedorDeOrganizacao;
    organizacaoOperadora?: string;
  },
) {
  exigirOrganizacao(escopo, resolver, organizacaoOperadora);
  escopo.decorateRequest('coletor', null);
  escopo.addHook('onRequest', async (requisicao) => {
    const token = tokenDoCabecalho(requisicao.headers.authorization);
    const orgId = requisicao.organizacao?.id;
    if (!token || !orgId) throw tokenRecusado();
    const versao = versaoDoCabecalho(requisicao.headers[CABECALHO_DA_VERSAO]);
    const coletor = await naOrganizacao(banco, orgId, async (tx) => {
      const [linha] = await tx
        .select({
          id: coletores.id,
          nome: coletores.nome,
          faixas: coletores.faixas,
          ultimoContatoEm: coletores.ultimoContatoEm,
          versao: coletores.versao,
        })
        .from(coletores)
        .where(and(eq(coletores.tokenHash, hashDoToken(token)), eq(coletores.situacao, 'ativo')));
      if (!linha) return null;
      const momento = agora();
      const passou =
        !linha.ultimoContatoEm ||
        momento.getTime() - linha.ultimoContatoEm.getTime() >= CONTATO_GRAVADO_A_CADA;
      const outraVersao = versao !== null && versao !== linha.versao;
      if (passou || outraVersao) {
        await tx
          .update(coletores)
          .set({ ultimoContatoEm: momento, ...(versao ? { versao } : {}) })
          .where(eq(coletores.id, linha.id));
      }
      return { id: linha.id, nome: linha.nome, faixas: linha.faixas };
    });
    if (!coletor) throw tokenRecusado();
    requisicao.coletor = coletor;
  });
}
