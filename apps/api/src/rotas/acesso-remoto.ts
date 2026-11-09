// A rota do acesso remoto (spec acesso-remoto; change acesso-remoto-vnc, design, decisão 2): a
// conexão WebSocket da tela, que a API liga à porta VNC da máquina. A sessão, a permissão e a origem
// são conferidas antes da troca do protocolo; o ativo, a permissão no local dele e o IP, depois,
// com o motivo da recusa no fechamento, que a tela mostra. Cada acesso aberto vai para a auditoria.
import { type Banco, naOrganizacao } from '@grafite/db';
import { podeEm } from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import {
  conferirAlvo,
  FECHAMENTO_DA_PONTE,
  lerAlvoDoAcessoRemoto,
  ligarPonte,
  MOTIVOS_DO_ACESSO_REMOTO,
} from '../ativos/acesso-remoto.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { exigirMesmaOrigem } from '../protecao.ts';
import { origemDa } from './sessao.ts';

/** O fechamento por uma falha da API, como o banco fora do ar. */
const FECHAMENTO_POR_FALHA = 1011;

export const rotasDoAcessoRemoto: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  /** O prazo da primeira resposta da máquina, em milissegundos (padrão: 10 s). */
  prazo?: number;
}> = async (app, { banco, agora, prazo }) => {
  app.get(
    '/ativos/:id/acesso-remoto',
    {
      websocket: true,
      config: { permissao: 'ativos.acesso-remoto' },
      preValidation: exigirMesmaOrigem,
      schema: { hide: true, params: z.object({ id: z.uuid() }) },
    },
    async (navegador, requisicao) => {
      const sessao = sessaoDa(requisicao);
      const ativoId = requisicao.params.id;
      let conferido: { ip: string; porta: number } | { motivo: string };
      try {
        conferido = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const alvo = await lerAlvoDoAcessoRemoto(tx, ativoId);
          if (!alvo) return { motivo: MOTIVOS_DO_ACESSO_REMOTO.naoEncontrado };
          if (!podeEm(sessao.acesso, 'ativos.acesso-remoto', alvo.localId, await lerArvore(tx))) {
            await registrarNaAuditoria(tx, {
              acao: 'permissao.recusada',
              ator: { tipo: 'conta', contaId: sessao.contaId },
              alvo: { tipo: 'rota' },
              dados: {
                permissao: 'ativos.acesso-remoto',
                metodo: requisicao.method,
                rota: requisicao.routeOptions.url ?? requisicao.url,
                parametros: requisicao.params,
              },
              origem: origemDa(requisicao),
              momento: agora(),
            });
            return { motivo: MOTIVOS_DO_ACESSO_REMOTO.semPermissao };
          }
          const resultado = conferirAlvo(alvo);
          if ('motivo' in resultado) return resultado;
          await registrarNaAuditoria(tx, {
            acao: 'acesso-remoto.aberto',
            ator: { tipo: 'conta', contaId: sessao.contaId },
            alvo: { tipo: 'ativo', id: ativoId },
            dados: { ip: resultado.ip, porta: resultado.porta },
            origem: origemDa(requisicao),
            momento: agora(),
          });
          return resultado;
        });
      } catch (erro) {
        requisicao.log.error({ err: erro }, 'falha ao abrir o acesso remoto');
        navegador.close(FECHAMENTO_POR_FALHA, MOTIVOS_DO_ACESSO_REMOTO.falhou);
        return;
      }
      if ('motivo' in conferido) {
        navegador.close(FECHAMENTO_DA_PONTE, conferido.motivo);
        return;
      }
      ligarPonte(navegador, { ...conferido, prazo });
    },
  );
};
