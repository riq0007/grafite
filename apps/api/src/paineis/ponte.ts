import { randomBytes } from 'node:crypto';
import { type Banco, naOrganizacao, paineis } from '@grafite/db';
import { pode } from '@grafite/domain';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { semSessao, sessaoDa } from '../acesso/escopo.ts';
import { exigirModuloLigado } from '../acesso/modulos.ts';
import { exigirOrganizacao, type ResolvedorDeOrganizacao } from '../acesso/organizacao.ts';
import { lerSessao, NOME_DO_COOKIE } from '../acesso/sessoes.ts';
import { naoEncontrado } from '../problemas.ts';
import { cssPelaPonte, destinoDoPainel, htmlPelaPonte, lerConteudoDoPainel } from './conteudo.ts';

interface AcessoAoPainel {
  orgId: string;
  painelId: string;
  endereco: string;
  tokenDaSessao: string;
  expira: number;
}

/** Acesso em memória, restrito a um painel; o token da sessão nunca sai para a página interna. */
export function criarPonteDosPaineis({ banco, agora }: { banco: Banco; agora: () => Date }) {
  const acessos = new Map<string, AcessoAoPainel>();
  const painel = (orgId: string, id: string) =>
    naOrganizacao(banco, orgId, async (tx) => {
      const [linha] = await tx
        .select()
        .from(paineis)
        .where(and(eq(paineis.id, id), eq(paineis.situacao, 'ativo')));
      if (!linha) throw naoEncontrado('Painel não encontrado ou inativo.');
      return linha;
    });

  return {
    async abrir(requisicao: FastifyRequest, resposta: FastifyReply) {
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const { id } = requisicao.params as { id: string };
      const linha = await painel(orgId, id);
      const url = new URL(linha.endereco);
      destinoDoPainel(url.href, url.origin);
      for (const [chave, acesso] of acessos)
        if (acesso.expira <= agora().getTime()) acessos.delete(chave);
      // Memória limitada, também se a pessoa recarregar a grade muitas vezes.
      if (acessos.size >= 1000) acessos.delete(acessos.keys().next().value ?? '');
      const token = randomBytes(32).toString('base64url');
      acessos.set(token, {
        orgId,
        painelId: id,
        endereco: linha.endereco,
        tokenDaSessao: requisicao.cookies[NOME_DO_COOKIE] ?? '',
        expira: sessao.expiraEm.getTime(),
      });
      return resposta
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .redirect(`/api/paineis-conteudo/${token}${url.pathname}${url.search}`, 302);
    },

    async instalar(app: FastifyInstance, resolver: ResolvedorDeOrganizacao) {
      app.addHook('onClose', async () => {
        acessos.clear();
      });
      await app.register(async (escopo) => {
        exigirOrganizacao(escopo, resolver);
        escopo.addHook('onRequest', async (requisicao, resposta) => {
          resposta.headers({
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
            'access-control-allow-origin': '*',
            'x-content-type-options': 'nosniff',
            'content-security-policy':
              "sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'self'; object-src 'none'; base-uri 'none'",
          });
          const { token } = requisicao.params as { token: string };
          const acesso = acessos.get(token);
          if (!acesso || acesso.expira <= agora().getTime()) {
            acessos.delete(token);
            throw semSessao();
          }
          if (acesso.orgId !== requisicao.organizacao?.id)
            throw naoEncontrado('Painel não encontrado.');
          requisicao.sessao = await lerSessao(banco, {
            orgId: acesso.orgId,
            token: acesso.tokenDaSessao,
            agora: agora(),
            tocar: false,
          });
          if (!requisicao.sessao || requisicao.sessao.pendencia) {
            acessos.delete(token);
            throw semSessao();
          }
          if (!pode(requisicao.sessao.acesso, 'paineis.ver'))
            return resposta.code(403).type('text/plain').send('Você não tem acesso aos painéis.');
        });
        exigirModuloLigado(escopo, { banco, modulo: 'paineis' });
        escopo.get(
          '/paineis-conteudo/:token/*',
          { logLevel: 'silent', schema: { hide: true } },
          async (requisicao, resposta) => {
            const { token } = requisicao.params as { token: string };
            const acesso = acessos.get(token);
            if (!acesso) throw semSessao();
            const linha = await painel(acesso.orgId, acesso.painelId);
            if (linha.endereco !== acesso.endereco)
              throw naoEncontrado('O endereço do painel mudou. Abra a grade novamente.');
            const prefixo = `/api/paineis-conteudo/${token}`;
            try {
              const caminho = requisicao.raw.url?.split(`/paineis-conteudo/${token}`)[1] ?? '/';
              const alvo = destinoDoPainel(caminho, new URL(linha.endereco).origin);
              const conteudo = await lerConteudoDoPainel(alvo);
              const tipo = conteudo.tipo.split(';')[0]?.trim().toLowerCase();
              if (tipo === 'text/html' || tipo === 'text/css') {
                const charset =
                  /charset\s*=\s*["']?([^;"'\s]+)/i.exec(conteudo.tipo)?.[1] ?? 'utf-8';
                const texto = new TextDecoder(charset).decode(conteudo.corpo);
                const corpo =
                  tipo === 'text/html'
                    ? htmlPelaPonte(texto, conteudo.url, prefixo)
                    : cssPelaPonte(texto, conteudo.url, prefixo);
                return resposta.code(conteudo.status).type(`${tipo}; charset=utf-8`).send(corpo);
              }
              return resposta.code(conteudo.status).type(conteudo.tipo).send(conteudo.corpo);
            } catch {
              return resposta
                .code(502)
                .type('text/plain; charset=utf-8')
                .send(
                  'Não foi possível abrir o painel. Confira o endereço e o acesso do servidor à página interna.',
                );
            }
          },
        );
      });
    },
  };
}
