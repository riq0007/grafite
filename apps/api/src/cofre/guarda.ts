// O cofre só abre para a conta com a verificação em dois passos ativa (spec cofre-de-segredos,
// "Verificação para usar o cofre"; design do P6, decisão 7). A guarda vai depois das da rota, a da
// sessão e a da permissão, e antes da validação do pedido: a conta sem o cofre ouve que não tem a
// permissão, e a que o tem sem os dois passos ouve o caminho até o cadastro.
import type { FastifyInstance, FastifyRequest, RouteOptions } from 'fastify';
import { semSessao } from '../acesso/escopo.ts';
import { ProblemaDaApi } from '../problemas.ts';

export const FRASE_DO_COFRE_SEM_DOIS_PASSOS =
  'Cadastre a verificação em dois passos em Ajustes › Conta para usar o cofre.';

/** A conta sem a verificação em dois passos ativa (403 `cofre-sem-dois-passos`). */
export const cofreSemDoisPassos = () =>
  new ProblemaDaApi({
    codigo: 'cofre-sem-dois-passos',
    status: 403,
    titulo: 'Sem a verificação em dois passos',
    detalhe: FRASE_DO_COFRE_SEM_DOIS_PASSOS,
  });

async function exigirDoisPassosAtivos(requisicao: FastifyRequest) {
  const { sessao } = requisicao;
  if (!sessao) throw semSessao();
  if (!sessao.doisPassosAtivos) throw cofreSemDoisPassos();
}

/** Põe a guarda dos dois passos em todas as rotas do escopo, depois das guardas da rota. */
export function exigirDoisPassosNoCofre(escopo: FastifyInstance) {
  escopo.addHook('onRoute', (rota: RouteOptions) => {
    const existentes = rota.preValidation ?? [];
    rota.preValidation = [
      ...(Array.isArray(existentes) ? existentes : [existentes]),
      exigirDoisPassosAtivos,
    ];
  });
}
