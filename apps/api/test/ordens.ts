// As ordens de serviço dos testes de integração (P4e), sobre as solicitações dos testes (P4d): quem
// atende as OS de Jundiaí, que também atende as solicitações e movimenta o estoque, quem só vê as
// OS de Jundiaí, o notebook sem local, a Dell Assistência e a Fonte 65W, do tipo Peça.

import { consumiveis, naOrganizacao } from '@grafite/db';
import { codigoNormalizado, normalizarTexto } from '@grafite/domain';
import { criarAtivoDoTipo } from './alertas.ts';
import { criarFornecedor } from './estoque.ts';
import { type ApiDeTeste, atribuir, criarPerfil } from './integracao.ts';
import { montarSolicitacoes } from './solicitacoes.ts';

/**
 * Os das solicitações, com as OS:
 * - `ana`: a administradora, com todas as permissões;
 * - `carla`: atende as OS de Jundiaí, além das solicitações, do estoque e dos ativos de lá;
 * - `bruno`: só vê as OS de Jundiaí;
 * - `eva`: atende as solicitações de Jundiaí, e não as OS.
 */
export type OrdensDeTeste = Awaited<ReturnType<typeof montarOrdens>>;

export async function montarOrdens(api: ApiDeTeste, host: string) {
  const s = await montarSolicitacoes(api, host);
  const { org, locais } = s;
  const tecnico = await criarPerfil(api, org, {
    nome: 'Técnico',
    permissoes: ['ordens.atender'],
  });
  const leitura = await criarPerfil(api, org, {
    nome: 'Leitura das OS',
    permissoes: ['ordens.ver'],
  });
  await atribuir(api, org, { perfilId: tecnico, contaId: s.contas.carla, localId: locais.jundiai });
  await atribuir(api, org, { perfilId: leitura, contaId: s.contas.bruno, localId: locais.jundiai });
  return {
    ...s,
    ativos: {
      ...s.ativos,
      semLocal: await criarAtivoDoTipo(api, org, {
        tipoId: s.tipos.notebook,
        patrimonio: 'NB-0099',
      }),
    },
    fornecedores: {
      ...s.fornecedores,
      dell: await criarFornecedor(api, org, { nome: 'Dell Assistência' }),
    },
    consumiveis: {
      ...s.consumiveis,
      fnt65w: await criarPeca(api, org, { codigo: 'FNT-65W', nome: 'Fonte 65W' }),
    },
  };
}

/** Uma peça, direto no banco. */
function criarPeca(
  api: ApiDeTeste,
  org: string,
  { codigo, nome }: { codigo: string; nome: string },
): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [peca] = await tx
      .insert(consumiveis)
      .values({
        orgId: org,
        codigo,
        codigoNormalizado: codigoNormalizado(codigo),
        nome,
        nomeNormalizado: normalizarTexto(nome),
        tipo: 'peca',
        situacao: 'ativo',
      })
      .returning({ id: consumiveis.id });
    return peca?.id ?? '';
  });
}
