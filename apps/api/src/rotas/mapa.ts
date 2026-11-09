// O mapa da planta pela API (spec mapa-da-planta; change p7-mapa-da-planta, design, decisões 1 a
// 4): as plantas, o envio do arquivo (DXF ou o modelo do PMG), a alteração, o modelo navegável, os
// marcadores das camadas e as posições.
import { type Banco, naOrganizacao } from '@grafite/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import type { Armazenamento } from '../arquivos/armazenamento.ts';
import { BytesDoArquivo } from '../arquivos/esquemas.ts';
import { lerArvore } from '../arvore.ts';
import {
  EnvioDaPlanta,
  ListaDePlantas,
  MarcadoresDoMapa,
  ModeloDaPlanta,
  ParametrosDaPlanta,
  ParametrosDaPosicao,
  PedidoDaPlanta,
  PedidoDePosicao,
  PlantaDoMapa,
} from '../mapa/esquemas.ts';
import {
  alterarPlanta,
  cadastrarPlanta,
  lerPlantas,
  marcadoresDaPlanta,
  plantaAtiva,
  salvarPosicao,
  tirarPosicao,
} from '../mapa/mapa.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const PROBLEMAS_DO_MAPA = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

/** O maior arquivo da planta: 300 MiB, como um DXF grande. */
const LIMITE_DA_PLANTA = 300 * 1024 * 1024;

export const rotasDoMapa: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  armazenamento: Armazenamento;
}> = async (app, { banco, agora, armazenamento }) => {
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: LIMITE_DA_PLANTA },
    (_requisicao, corpo: Buffer, pronto: (erro: null, corpo: Buffer) => void) =>
      pronto(null, corpo),
  );
  const daOrganizacao = (requisicao: { organizacao: { id: string } | null }) =>
    requisicao.organizacao?.id ?? '';

  app.get(
    '/mapa/plantas',
    {
      config: { permissao: 'mapa.ver' },
      schema: {
        summary: 'As plantas: as ativas, para quem vê o mapa, e todas, para quem edita',
        response: { 200: ListaDePlantas, ...PROBLEMAS_DO_MAPA },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        lerPlantas(tx, { acesso, arvore: await lerArvore(tx) }),
      );
    },
  );

  app.post(
    '/mapa/plantas',
    {
      config: { permissao: 'mapa.editar' },
      schema: {
        summary: 'Cadastrar uma planta pelo arquivo: o DXF do desenho ou o modelo do PMG em JSON',
        querystring: EnvioDaPlanta,
        body: BytesDoArquivo,
        response: { 201: PlantaDoMapa, ...PROBLEMAS_DO_MAPA },
      },
    },
    async (requisicao, resposta) => {
      const orgId = daOrganizacao(requisicao);
      const planta = await naOrganizacao(banco, orgId, (tx) =>
        cadastrarPlanta(tx, {
          nome: requisicao.query.nome,
          fonte: requisicao.query.fonte ?? 'arquivo',
          conteudo: requisicao.body,
          armazenamento,
          orgId,
          requisicao,
          momento: agora(),
        }),
      );
      return resposta.code(201).send(planta);
    },
  );

  app.patch(
    '/mapa/plantas/:id',
    {
      config: { permissao: 'mapa.editar' },
      schema: {
        summary: 'Renomear, ligar a um local ou inativar a planta',
        params: ParametrosDaPlanta,
        body: PedidoDaPlanta,
        response: { 200: PlantaDoMapa, ...PROBLEMAS_DO_MAPA },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, daOrganizacao(requisicao), (tx) =>
        alterarPlanta(tx, requisicao.params.id, requisicao.body, {
          requisicao,
          momento: agora(),
        }),
      ),
  );

  app.get(
    '/mapa/plantas/:id/modelo',
    {
      config: { permissao: 'mapa.ver' },
      schema: {
        summary: 'O modelo navegável da planta: as linhas por camada, os textos e as máquinas',
        params: ParametrosDaPlanta,
        response: { 200: ModeloDaPlanta, ...PROBLEMAS_DO_MAPA },
      },
    },
    async (requisicao, resposta) => {
      const { acesso } = sessaoDa(requisicao);
      const planta = await naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        plantaAtiva(tx, requisicao.params.id, { acesso, arvore: await lerArvore(tx) }),
      );
      const conteudo = planta.modelo ? await armazenamento.abrir(planta.modelo) : null;
      if (!conteudo) throw naoEncontrado('O modelo da planta não foi encontrado.');
      resposta.headers({
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, max-age=3600',
      });
      return resposta.send(JSON.parse(conteudo.toString('utf8')));
    },
  );

  app.get(
    '/mapa/plantas/:id/marcadores',
    {
      config: { permissao: 'mapa.ver' },
      schema: {
        summary: 'Os marcadores da planta, pelas camadas dos módulos, só com o que a conta vê',
        params: ParametrosDaPlanta,
        response: { 200: MarcadoresDoMapa, ...PROBLEMAS_DO_MAPA },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        marcadoresDaPlanta(tx, requisicao.params.id, { acesso, arvore: await lerArvore(tx) }),
      );
    },
  );

  app.put(
    '/mapa/plantas/:id/posicoes',
    {
      config: { permissao: 'mapa.editar' },
      schema: {
        summary: 'Posicionar ou mover um alvo na planta',
        params: ParametrosDaPlanta,
        body: PedidoDePosicao,
        response: { 204: z.null(), ...PROBLEMAS_DO_MAPA },
      },
    },
    async (requisicao, resposta) => {
      await naOrganizacao(banco, daOrganizacao(requisicao), (tx) =>
        salvarPosicao(tx, requisicao.params.id, requisicao.body, {
          requisicao,
          momento: agora(),
        }),
      );
      return resposta.code(204).send(null);
    },
  );

  app.delete(
    '/mapa/plantas/:id/posicoes/:tipo/:alvo',
    {
      config: { permissao: 'mapa.editar' },
      schema: {
        summary: 'Tirar um alvo do mapa; só a posição sai',
        params: ParametrosDaPosicao,
        response: { 204: z.null(), ...PROBLEMAS_DO_MAPA },
      },
    },
    async (requisicao, resposta) => {
      await naOrganizacao(banco, daOrganizacao(requisicao), (tx) =>
        tirarPosicao(
          tx,
          requisicao.params.id,
          { tipo: requisicao.params.tipo, id: requisicao.params.alvo },
          { requisicao, momento: agora() },
        ),
      );
      return resposta.code(204).send(null);
    },
  );
};
