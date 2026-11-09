// As solicitações pela API (spec solicitacoes; change p4d-solicitacoes, design, decisões 3 a 7), no
// escopo do Operação: quem atende registra a solicitação em nome da pessoa e a altera enquanto ela
// está pendente, numa transação que confere os campos, as referências, os locais em que a conta
// atende, o contador das impressoras e a sugestão de cada item, e grava a solicitação, a auditoria e
// o evento.
import { type Banco, naOrganizacao } from '@grafite/db';
import type { DadosDaSolicitacao } from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { modulosDesligados } from '../acesso/modulos.ts';
import { lerArvore } from '../arvore.ts';
import { RespostaDeProblema } from '../problemas.ts';
import {
  impressoraParaSolicitacao,
  impressorasParaSolicitacao,
  lerFicha,
  lerPaginaDeSolicitacoes,
  solicitacoesDoAtivo,
} from '../solicitacoes/consultas.ts';
import { entregar } from '../solicitacoes/entrega.ts';
import {
  FiltrosDasImpressoras,
  FiltrosDasSolicitacoes,
  ImpressoraParaSolicitacao,
  ImpressorasParaSolicitacao,
  ListaDeSolicitacoes,
  ParametrosDaSolicitacao,
  ParametrosDoAtivoDaSolicitacao,
  PedidoAoFornecedor,
  PedidoDaSolicitacao,
  PedidoDeCancelamento,
  PedidoDeConclusao,
  PedidoDeEntrega,
  PedidoDeSituacao,
  PedidoDoLote,
  RetornoDoLote,
  Solicitacao,
  SolicitacoesDoAtivo,
} from '../solicitacoes/esquemas.ts';
import { alterar, registrar } from '../solicitacoes/registro.ts';
import {
  cancelar,
  concluir,
  mudarEmLote,
  mudarSituacao,
  pedirAoFornecedor,
} from '../solicitacoes/situacao.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const PROBLEMAS_DA_SOLICITACAO = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

/** O pedido da API como o domínio o confere, com o vazio como nulo. */
function comoDados(pedido: z.infer<typeof PedidoDaSolicitacao>): DadosDaSolicitacao {
  const comum = { pessoa: pedido.pessoa ?? null, observacao: pedido.observacao ?? null };
  switch (pedido.tipo) {
    case 'toner':
      return {
        tipo: 'toner',
        ...comum,
        impressoras: pedido.impressoras ?? [],
        itens: (pedido.itens ?? []).map((item) => ({
          impressora: item.impressora ?? null,
          cor: item.cor ?? null,
          quantidade: item.quantidade ?? null,
          consumivel: item.consumivel ?? null,
        })),
      };
    case 'conserto':
      return {
        tipo: 'conserto',
        ...comum,
        ativo: pedido.ativo ?? null,
        defeito: pedido.defeito ?? null,
      };
    case 'equipamento':
      return {
        tipo: 'equipamento',
        ...comum,
        tipoDeAtivo: pedido.tipoDeAtivo ?? null,
        quantidade: pedido.quantidade ?? null,
        motivo: pedido.motivo ?? null,
        local: pedido.local ?? null,
      };
  }
}

export const rotasDasSolicitacoes: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/solicitacoes',
    {
      config: { permissao: 'solicitacoes.ver' },
      schema: {
        summary:
          'As solicitações que a conta vê, da mais nova para a mais antiga, com as pendentes por padrão, os filtros, a busca e o cursor',
        querystring: FiltrosDasSolicitacoes,
        response: { 200: ListaDeSolicitacoes, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        lerPaginaDeSolicitacoes(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.query),
      );
    },
  );

  app.get(
    '/solicitacoes/impressoras',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary: 'As impressoras ativas que a conta vê e que usam consumíveis, para o toner',
        querystring: FiltrosDasImpressoras,
        response: { 200: ImpressorasParaSolicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      if ((await modulosDesligados(banco, orgId)).includes('ativos')) return { itens: [] };
      return naOrganizacao(banco, orgId, async (tx) =>
        impressorasParaSolicitacao(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.query),
      );
    },
  );

  app.get(
    '/solicitacoes/impressoras/:id',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary:
          'O contador de agora da impressora e os compatíveis de cada cor, com o saldo e o sugerido',
        params: ParametrosDoAtivoDaSolicitacao,
        response: { 200: ImpressoraParaSolicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        impressoraParaSolicitacao(
          tx,
          { acesso, arvore: await lerArvore(tx) },
          requisicao.params.id,
        ),
      );
    },
  );

  app.get(
    '/solicitacoes/:numero',
    {
      config: { permissao: 'solicitacoes.ver' },
      schema: {
        summary: 'A ficha da solicitação, pelo número',
        params: ParametrosDaSolicitacao,
        response: { 200: Solicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        lerFicha(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.params.numero),
      );
    },
  );

  app.get(
    '/ativos/:id/solicitacoes',
    {
      config: { permissao: 'solicitacoes.ver' },
      schema: {
        summary:
          'As solicitações do ativo que a conta vê: as pendentes e as 5 encerradas mais novas',
        params: ParametrosDoAtivoDaSolicitacao,
        response: { 200: SolicitacoesDoAtivo, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        solicitacoesDoAtivo(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.params.id),
      );
    },
  );

  app.post(
    '/solicitacoes',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary: 'Registrar uma solicitação de toner, de conserto ou de equipamento',
        body: PedidoDaSolicitacao,
        response: { 201: Solicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    async (requisicao, resposta) => {
      const solicitacao = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        registrar(tx, comoDados(requisicao.body), { requisicao, momento: agora() }),
      );
      return resposta.code(201).send(solicitacao);
    },
  );

  app.patch(
    '/solicitacoes/:numero',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary: 'Alterar a solicitação pendente, sem mudar o tipo',
        params: ParametrosDaSolicitacao,
        body: PedidoDaSolicitacao,
        response: { 200: Solicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        alterar(tx, requisicao.params.numero, comoDados(requisicao.body), {
          requisicao,
          momento: agora(),
        }),
      ),
  );

  app.post(
    '/solicitacoes/situacao',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary:
          'Mudar a situação de várias solicitações de uma vez; a que não pode mudar fica como estava',
        body: PedidoDoLote,
        response: { 200: RetornoDoLote, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        mudarEmLote(
          tx,
          {
            numeros: requisicao.body.numeros,
            situacao: requisicao.body.situacao,
            motivo: requisicao.body.motivo ?? null,
          },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/solicitacoes/:numero/situacao',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary: 'Passar a solicitação a Em atendimento ou a Aguardando entrega',
        params: ParametrosDaSolicitacao,
        body: PedidoDeSituacao,
        response: { 200: Solicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        mudarSituacao(tx, requisicao.params.numero, requisicao.body.situacao, {
          requisicao,
          momento: agora(),
        }),
      ),
  );

  app.post(
    '/solicitacoes/:numero/pedido',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary: 'Registrar ou corrigir o pedido ao fornecedor, com o número da OS dele',
        params: ParametrosDaSolicitacao,
        body: PedidoAoFornecedor,
        response: { 200: Solicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        pedirAoFornecedor(
          tx,
          requisicao.params.numero,
          { fornecedor: requisicao.body.fornecedor ?? null, os: requisicao.body.os ?? null },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/solicitacoes/:numero/conclusao',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary: 'Concluir o conserto ou o equipamento, com o que foi feito',
        params: ParametrosDaSolicitacao,
        body: PedidoDeConclusao,
        response: { 200: Solicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        concluir(
          tx,
          requisicao.params.numero,
          { oQueFoiFeito: requisicao.body.oQueFoiFeito ?? null },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/solicitacoes/:numero/cancelamento',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary: 'Cancelar a solicitação pendente, com o motivo',
        params: ParametrosDaSolicitacao,
        body: PedidoDeCancelamento,
        response: { 200: Solicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        cancelar(
          tx,
          requisicao.params.numero,
          { motivo: requisicao.body.motivo ?? null },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/solicitacoes/:numero/entrega',
    {
      config: { permissao: 'solicitacoes.atender' },
      schema: {
        summary: 'Entregar os itens pendentes do toner, do estoque ou pelo fornecedor',
        params: ParametrosDaSolicitacao,
        body: PedidoDeEntrega,
        response: { 200: Solicitacao, ...PROBLEMAS_DA_SOLICITACAO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        entregar(
          tx,
          requisicao.params.numero,
          requisicao.body.entregas.map((entrega) =>
            entrega.origem === 'estoque'
              ? {
                  item: entrega.item,
                  origem: 'estoque',
                  consumivel: entrega.consumivel ?? null,
                  local: entrega.local ?? null,
                }
              : {
                  item: entrega.item,
                  origem: 'fornecedor',
                  fornecedor: entrega.fornecedor ?? null,
                  consumivel: entrega.consumivel ?? null,
                },
          ),
          { requisicao, momento: agora() },
        ),
      ),
  );
};
