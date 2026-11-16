// Os chamados pela API (spec chamados; change chamados-da-ti, tarefas 4.7 e 4.8): a abertura pela
// TI, com `chamados.atender`, e as sugestões dos campos Ativo e Local pela pessoa, para a gaveta de
// quem abre e para a prévia do colaborador de quem configura. As regras ficam em
// `chamados/abertura.ts` e `chamados/sugestoes.ts`; aqui, o formato do pedido e da resposta. A
// pessoa e o tipo da abertura chegam como ids, e o vazio deles é recusado pela abertura, com as
// outras recusas dos campos, para a gaveta mostrá-las juntas.
import { type Banco, naOrganizacao } from '@grafite/db';
import {
  MENSAGENS_DO_TIPO_DE_CHAMADO,
  RECUSA_DO_FORMULARIO,
  SITUACOES_DO_CHAMADO,
} from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { abrirChamado, RECUSAS_DA_ABERTURA } from '../chamados/abertura.ts';
import { sugestoesDaPessoa } from '../chamados/sugestoes.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const PedidoDeAbertura = z
  .object({
    /** Quem pediu: uma pessoa ativa. */
    pessoa: z.uuid({ error: RECUSAS_DA_ABERTURA.pessoaNaoEncontrada }).nullable().optional(),
    /** O tipo de chamado, Em uso. */
    tipo: z.uuid({ error: MENSAGENS_DO_TIPO_DE_CHAMADO.naoEncontrado }).nullable().optional(),
    /** O título que quem abre escreveu, de 1 a 120 caracteres; sem ele, vale o montado. */
    titulo: z.string().nullable().optional(),
    /** As respostas do formulário do tipo, pelo id de cada campo. */
    respostas: z.record(z.string(), z.unknown(), { error: RECUSA_DO_FORMULARIO }).optional(),
    /** O "Fica comigo", que vem ligado: o chamado nasce Em atendimento com quem abre. */
    ficaComigo: z.boolean().default(true),
  })
  .meta({ id: 'PedidoDeAberturaDoChamado' });

const ChamadoAberto = z
  .object({
    numero: z.int(),
    situacao: z.enum(SITUACOES_DO_CHAMADO),
    /** Com quem o chamado nasceu, ou nulo, na triagem. */
    responsavel: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  })
  .meta({ id: 'ChamadoAberto' });

const TIPO_NAO_ENCONTRADO = 'Tipo de ativo não encontrado.';
const FORMATO_DO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PedidoDasSugestoes = z.object({
  /** A pessoa do chamado. */
  pessoa: z.uuid({ error: RECUSAS_DA_ABERTURA.pessoaNaoEncontrada }),
  /** Os tipos de ativo que o campo aceita, separados por vírgula; sem eles, todos. */
  tipos: z
    .string()
    .max(3_700, { error: TIPO_NAO_ENCONTRADO })
    .optional()
    .transform((texto, contexto) => {
      if (!texto) return [];
      const lidos = texto.split(',').map((parte) => parte.trim());
      if (!lidos.every((parte) => FORMATO_DO_UUID.test(parte))) {
        contexto.addIssue({ code: 'custom', message: TIPO_NAO_ENCONTRADO });
        return z.NEVER;
      }
      return lidos;
    }),
});

const SugestoesDoChamado = z
  .object({
    /** O local de trabalho da pessoa, com o caminho, para o campo Local; nulo sem ele ativo. */
    local: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    /** Para o campo Ativo: os sob a responsabilidade dela e depois os do local dela. */
    ativos: z.array(
      z.object({
        id: z.uuid(),
        rotulo: z.string(),
        patrimonio: z.string().nullable(),
        tipoId: z.uuid(),
        motivo: z.enum(['responsavel', 'local']),
      }),
    ),
  })
  .meta({ id: 'SugestoesDoChamado' });

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

export const rotasDosChamados: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  /** A fila, para as notificações irem também pelo e-mail e pelo push. */
  fila?: FilaDeTarefas | undefined;
}> = async (app, { banco, agora, fila }) => {
  app.post(
    '/chamados',
    {
      config: { permissao: 'chamados.atender' },
      schema: {
        summary: 'Abrir um chamado em nome de uma pessoa, com o tipo e as respostas',
        body: PedidoDeAbertura,
        response: { 201: ChamadoAberto, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const aberto = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        abrirChamado(tx, requisicao.body, {
          requisicao,
          momento: agora(),
          ...(fila?.rodando() ? { enviar: (...dados) => fila.enviar(...dados) } : {}),
        }),
      );
      return resposta.code(201).send(aberto);
    },
  );

  // As mesmas sugestões em duas rotas, porque cada rota pede uma permissão só: a da gaveta, de quem
  // abre, e a da prévia do colaborador, de quem configura, que vê o formulário como uma pessoa
  // (spec modulo-chamados, "Construtor do formulário"). As duas dão só os ativos que a conta vê.
  const ROTAS_DAS_SUGESTOES = [
    {
      endereco: '/chamados/sugestoes',
      permissao: 'chamados.atender',
      summary: 'As sugestões dos campos Ativo e Local pela pessoa do chamado',
    },
    {
      endereco: '/chamados/tipos/sugestoes',
      permissao: 'chamados.configurar',
      summary: 'As sugestões dos campos Ativo e Local na prévia do colaborador, pela pessoa',
    },
  ] as const;
  for (const { endereco, permissao, summary } of ROTAS_DAS_SUGESTOES) {
    app.get(
      endereco,
      {
        config: { permissao },
        schema: {
          summary,
          querystring: PedidoDasSugestoes,
          response: { 200: SugestoesDoChamado, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
        },
      },
      (requisicao) =>
        naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
          sugestoesDaPessoa(tx, requisicao.query.pessoa, {
            tipos: requisicao.query.tipos,
            acesso: sessaoDa(requisicao).acesso,
            arvore: await lerArvore(tx),
          }),
        ),
    );
  }
};
