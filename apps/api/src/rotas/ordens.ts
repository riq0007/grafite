// As ordens de serviço pela API (spec ordens-de-servico; change p4e-ordens-de-servico, design,
// decisões 3 a 7), no escopo do Operação: quem atende abre a OS no ativo, corrige o problema e o
// fornecedor enquanto ela está em aberto, muda a situação, resolve, reabre e encerra, também em
// lote, cada ação numa transação que confere os campos e o local em que a conta atende, e grava a
// OS, o histórico, a auditoria e o evento.
import { type Banco, naOrganizacao } from '@grafite/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { abrir, corrigir } from '../ordens/abertura.ts';
import { lerFichaDaOrdem, lerPaginaDeOrdens, ordensDoAtivo } from '../ordens/consultas.ts';
import {
  FiltrosDasOrdens,
  ListaDeOrdens,
  OrdemDeServico,
  OrdensDoAtivo,
  ParametrosDaOrdem,
  ParametrosDoAtivoDaOrdem,
  PedidoDeAbertura,
  PedidoDeCorrecao,
  PedidoDeEncerramento,
  PedidoDePeca,
  PedidoDeReabertura,
  PedidoDeResolucao,
  PedidoDeSituacaoDaOrdem,
  PedidoDoLoteDeOrdens,
  RetornoDoLoteDeOrdens,
} from '../ordens/esquemas.ts';
import { lancarPeca } from '../ordens/pecas.ts';
import { encerrar, mudarEmLote, mudarSituacao, reabrir, resolver } from '../ordens/situacao.ts';
import { abrirPelaSolicitacao } from '../ordens/solicitacao.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { ParametrosDaSolicitacao } from '../solicitacoes/esquemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const PROBLEMAS_DA_ORDEM = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

export const rotasDasOrdens: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/ordens',
    {
      config: { permissao: 'ordens.ver' },
      schema: {
        summary:
          'As OS que a conta vê, da mais nova para a mais antiga, com as em aberto por padrão, os filtros, a busca e o cursor',
        querystring: FiltrosDasOrdens,
        response: { 200: ListaDeOrdens, ...PROBLEMAS_DA_ORDEM },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        lerPaginaDeOrdens(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.query),
      );
    },
  );

  app.get(
    '/ordens/:numero',
    {
      config: { permissao: 'ordens.ver' },
      schema: {
        summary: 'A ficha da OS, pelo número, com o histórico e as peças',
        params: ParametrosDaOrdem,
        response: { 200: OrdemDeServico, ...PROBLEMAS_DA_ORDEM },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        lerFichaDaOrdem(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.params.numero),
      );
    },
  );

  app.get(
    '/ativos/:id/ordens',
    {
      config: { permissao: 'ordens.ver' },
      schema: {
        summary:
          'As OS do ativo que a conta vê: as em aberto e as 5 resolvidas ou encerradas mais novas',
        params: ParametrosDoAtivoDaOrdem,
        response: { 200: OrdensDoAtivo, ...PROBLEMAS_DA_ORDEM },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        ordensDoAtivo(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.params.id),
      );
    },
  );

  app.post(
    '/ordens',
    {
      config: { permissao: 'ordens.atender' },
      schema: {
        summary: 'Abrir uma ordem de serviço no ativo, com o problema',
        body: PedidoDeAbertura,
        response: { 201: OrdemDeServico, ...PROBLEMAS_DA_ORDEM },
      },
    },
    async (requisicao, resposta) => {
      const ordem = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        abrir(
          tx,
          { ativo: requisicao.body.ativo ?? null, problema: requisicao.body.problema ?? null },
          { requisicao, momento: agora() },
        ),
      );
      return resposta.code(201).send(ordem);
    },
  );

  app.post(
    '/solicitacoes/:numero/ordem',
    {
      config: { permissao: 'ordens.atender' },
      schema: {
        summary:
          'Abrir a OS do conserto pendente, com o ativo e o defeito; a solicitação passa a Em atendimento e segue a OS',
        params: ParametrosDaSolicitacao,
        response: { 201: OrdemDeServico, ...PROBLEMAS_DA_ORDEM },
      },
    },
    async (requisicao, resposta) => {
      const ordem = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        abrirPelaSolicitacao(tx, requisicao.params.numero, { requisicao, momento: agora() }),
      );
      return resposta.code(201).send(ordem);
    },
  );

  app.patch(
    '/ordens/:numero',
    {
      config: { permissao: 'ordens.atender' },
      schema: {
        summary:
          'Corrigir o problema da OS em aberto e, na OS com o fornecedor, o fornecedor e a OS dele',
        params: ParametrosDaOrdem,
        body: PedidoDeCorrecao,
        response: { 200: OrdemDeServico, ...PROBLEMAS_DA_ORDEM },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        corrigir(
          tx,
          requisicao.params.numero,
          { ...requisicao.body, problema: requisicao.body.problema ?? null },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/ordens/situacao',
    {
      config: { permissao: 'ordens.atender' },
      schema: {
        summary: 'Mudar a situação de várias OS de uma vez; a que não pode mudar fica como estava',
        body: PedidoDoLoteDeOrdens,
        response: { 200: RetornoDoLoteDeOrdens, ...PROBLEMAS_DA_ORDEM },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        mudarEmLote(tx, requisicao.body, { requisicao, momento: agora() }),
      ),
  );

  app.post(
    '/ordens/:numero/situacao',
    {
      config: { permissao: 'ordens.atender' },
      schema: {
        summary:
          'Passar a OS em aberto a Em atendimento, a Aguardando peça ou a Aguardando fornecedor',
        params: ParametrosDaOrdem,
        body: PedidoDeSituacaoDaOrdem,
        response: { 200: OrdemDeServico, ...PROBLEMAS_DA_ORDEM },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        mudarSituacao(
          tx,
          requisicao.params.numero,
          {
            situacao: requisicao.body.situacao,
            observacao: requisicao.body.observacao ?? null,
            fornecedor: requisicao.body.fornecedor ?? null,
            os: requisicao.body.os ?? null,
          },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/ordens/:numero/pecas',
    {
      config: { permissao: 'ordens.atender' },
      schema: {
        summary:
          'Lançar a peça na OS em aberto: a saída do estoque para o ativo dela, com "OS <número>"',
        params: ParametrosDaOrdem,
        body: PedidoDePeca,
        response: { 200: OrdemDeServico, ...PROBLEMAS_DA_ORDEM },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        lancarPeca(
          tx,
          requisicao.params.numero,
          {
            consumivel: requisicao.body.consumivel ?? null,
            local: requisicao.body.local ?? null,
            quantidade: requisicao.body.quantidade ?? null,
          },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/ordens/:numero/resolucao',
    {
      config: { permissao: 'ordens.atender' },
      schema: {
        summary: 'Resolver a OS em aberto, com o que foi feito',
        params: ParametrosDaOrdem,
        body: PedidoDeResolucao,
        response: { 200: OrdemDeServico, ...PROBLEMAS_DA_ORDEM },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        resolver(
          tx,
          requisicao.params.numero,
          { solucao: requisicao.body.solucao ?? null },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/ordens/:numero/reabertura',
    {
      config: { permissao: 'ordens.atender' },
      schema: {
        summary: 'Reabrir a OS resolvida, com o motivo',
        params: ParametrosDaOrdem,
        body: PedidoDeReabertura,
        response: { 200: OrdemDeServico, ...PROBLEMAS_DA_ORDEM },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        reabrir(
          tx,
          requisicao.params.numero,
          { motivo: requisicao.body.motivo ?? null },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/ordens/:numero/encerramento',
    {
      config: { permissao: 'ordens.atender' },
      schema: {
        summary: 'Encerrar a OS resolvida, ou a em aberto sem resolver, com o motivo',
        params: ParametrosDaOrdem,
        body: PedidoDeEncerramento,
        response: { 200: OrdemDeServico, ...PROBLEMAS_DA_ORDEM },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        encerrar(
          tx,
          requisicao.params.numero,
          { semResolver: requisicao.body.semResolver, motivo: requisicao.body.motivo ?? null },
          { requisicao, momento: agora() },
        ),
      ),
  );
};
