// Os chamados pela API (spec chamados; change chamados-da-ti, tarefas 4.7 a 4.10): a abertura pela
// TI, com `chamados.atender`; as sugestões dos campos Ativo e Local pela pessoa, para a gaveta de
// quem abre e para a prévia do colaborador de quem configura; e o quadro e a lista dos prazos, com
// `chamados.ver`. As regras ficam em `chamados/abertura.ts`, `chamados/sugestoes.ts`,
// `chamados/quadro.ts` e `chamados/prazos.ts`; aqui, o formato do pedido e da resposta. A
// pessoa e o tipo da abertura chegam como ids, e o vazio deles é recusado pela abertura, com as
// outras recusas dos campos, para a gaveta mostrá-las juntas.
import { type Banco, naOrganizacao } from '@grafite/db';
import {
  fusoReconhecido,
  GRUPOS_DO_PRAZO,
  MENSAGENS_DO_TIPO_DE_CHAMADO,
  MODOS_DO_PRAZO,
  nomeDoFuso,
  RECUSA_DO_FORMULARIO,
  SITUACOES_DO_CHAMADO,
} from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { abrirChamado, RECUSAS_DA_ABERTURA } from '../chamados/abertura.ts';
import { prazosDosChamados } from '../chamados/prazos.ts';
import { quadroDosChamados } from '../chamados/quadro.ts';
import { sugestoesDaPessoa } from '../chamados/sugestoes.ts';
import { ValorDoPrazo } from '../chamados/tipos.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { HorarioDaTiLido } from './chamados-horario.ts';
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

const FUSO_DESCONHECIDO = 'Fuso horário desconhecido.';

const PedidoComOFuso = z.object({
  /**
   * O fuso de quem olha, que diz o que é hoje, trocado uma vez pelo nome que o Intl devolve: o
   * quadro e a lista leem o relógio dele em cada chamado, e o fuso escrito em outra caixa montaria
   * o formato em cada leitura (tarefa 4.23).
   */
  fuso: z
    .string({ error: FUSO_DESCONHECIDO })
    .refine(fusoReconhecido, { error: FUSO_DESCONHECIDO })
    .transform((fuso) => nomeDoFuso(fuso) ?? fuso),
});

/** O aberto há mais tempo, pela abertura: "mais antigo #1041, há 17 h". */
const MaisAntigo = z.object({ numero: z.int(), abertoEm: z.iso.datetime() }).nullable();

const QuadroDosChamados = z
  .object({
    /** A coluna "Sem responsável". */
    triagem: z.object({ abertos: z.array(z.int()), maisAntigo: MaisAntigo }),
    /** As pessoas da TI pelo nome, e depois as colunas de quem não atende mais, também pelo nome. */
    colunas: z.array(
      z.object({
        conta: z.uuid(),
        nome: z.string(),
        /** A coluna dos chamados que a conta não atende mais; a mesma conta pode ter as duas. */
        naoAtendeMais: z.boolean(),
        /** Os Em atendimento e os Aguardando o colaborador, pelo número. */
        abertos: z.array(z.int()),
        maisAntigo: MaisAntigo,
        /** A barra: tantos pedaços quanto a carga cheia, um cheio por chamado. */
        pedacos: z.object({ total: z.int(), cheios: z.int() }),
        resolvidosHoje: z.array(z.int()),
        /**
         * Onde a conta atende os chamados agora: a organização inteira ou as raízes dos ramos, como
         * no acesso da sessão. A tela confere por ele, com a árvore, a coluna que não recebe o
         * chamado arrastado ("Renato não atende Jundiaí").
         */
        atende: z.object({ organizacao: z.boolean(), locais: z.array(z.uuid()) }),
      }),
    ),
    /** Todos os resolvidos hoje que a conta vê, para a contagem do Início. */
    resolvidosHoje: z.array(z.int()),
    /** Se a tela diz "Contando só os chamados dos locais que você vê.". */
    contandoSoOsLocaisQueVe: z.boolean(),
  })
  .meta({ id: 'QuadroDosChamados' });

/** Um chamado aberto na lista dos prazos, com o que a lista e o painel mostram. */
const ChamadoNosPrazos = z.object({
  numero: z.int(),
  titulo: z.string(),
  situacao: z.enum(SITUACOES_DO_CHAMADO),
  abertoEm: z.iso.datetime(),
  tipo: z.object({ id: z.uuid(), nome: z.string(), icone: z.string() }),
  /** Quem pediu, com o caminho do local de trabalho, como "Jundiaí › Financeiro". */
  pessoa: z.object({ id: z.uuid(), nome: z.string(), local: z.string().nullable() }),
  responsavel: z.object({ conta: z.uuid(), nome: z.string() }).nullable(),
  ativo: z
    .object({
      id: z.uuid(),
      rotulo: z.string(),
      patrimonio: z.string().nullable(),
      /** O caminho do local do ativo. */
      local: z.string().nullable(),
    })
    .nullable(),
  locais: z.array(z.uuid()),
  semLocal: z.boolean(),
  /**
   * O relógio guardado, de onde a web recalcula a situação a cada minuto, com o horário da TI; nulo
   * com o prazo estragado.
   */
  relogio: z
    .object({
      /** O prazo copiado do tipo na abertura, em minutos, com o valor e a unidade do tipo. */
      prazo: z.object({
        modo: z.enum(MODOS_DO_PRAZO),
        respostaMin: z.int(),
        resolucaoMin: z.int(),
        resposta: ValorDoPrazo,
        resolucao: ValorDoPrazo,
      }),
      /** Os segundos contados até a última parada. */
      contadoS: z.int(),
      /** O instante em que o relógio voltou a contar, ou nulo, com ele parado. */
      relogioDesde: z.iso.datetime().nullable(),
      primeiraRespostaEm: z.iso.datetime().nullable(),
    })
    .nullable(),
  /** O grupo no momento da leitura, no dia do fuso de quem olha; nulo com o prazo estragado. */
  grupo: z.enum(GRUPOS_DO_PRAZO).nullable(),
  /** A última mensagem, de quem pediu ou da TI, com o começo do texto, até 280 caracteres. */
  ultimaMensagem: z
    .object({ autor: z.string(), em: z.iso.datetime(), texto: z.string() })
    .nullable(),
});

const PrazosDosChamados = z
  .object({
    horario: HorarioDaTiLido,
    /** Pelo vencimento, com o empate pelo número, e os de prazo estragado no fim, pelo número. */
    chamados: z.array(ChamadoNosPrazos),
  })
  .meta({ id: 'PrazosDosChamados' });

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

  app.get(
    '/chamados/quadro',
    {
      config: { permissao: 'chamados.ver' },
      schema: {
        summary: 'O quadro: a triagem, a carga de cada pessoa da TI e os resolvidos hoje',
        querystring: PedidoComOFuso,
        response: { 200: QuadroDosChamados, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        quadroDosChamados(tx, {
          acesso: sessaoDa(requisicao).acesso,
          arvore: await lerArvore(tx),
          fuso: requisicao.query.fuso,
          agora: agora(),
        }),
      ),
  );

  app.get(
    '/chamados/prazos',
    {
      config: { permissao: 'chamados.ver' },
      schema: {
        summary: 'Os prazos: os chamados abertos pelo vencimento, nos grupos do dia',
        querystring: PedidoComOFuso,
        response: { 200: PrazosDosChamados, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        prazosDosChamados(tx, {
          acesso: sessaoDa(requisicao).acesso,
          arvore: await lerArvore(tx),
          fuso: requisicao.query.fuso,
          agora: agora(),
        }),
      ),
  );
};
