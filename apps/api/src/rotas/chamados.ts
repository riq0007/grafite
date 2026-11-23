// Os chamados pela API (spec chamados; change chamados-da-ti, tarefas 4.7 a 4.16): a abertura pela
// TI, com `chamados.atender`; as sugestões dos campos Ativo e Local pela pessoa, para a gaveta de
// quem abre e para a prévia do colaborador de quem configura; o quadro, a lista dos prazos e a ficha
// do chamado, com `chamados.ver`; e as ações do atendimento, as que mudam quem atende, a conversa, o
// fim e a volta, a troca do ativo, do título e dos campos da TI, e o Virar OS, com
// `chamados.atender`. As regras ficam em `chamados/abertura.ts`, `chamados/sugestoes.ts`,
// `chamados/quadro.ts`, `chamados/prazos.ts`, `chamados/ficha.ts`, `chamados/acoes.ts`,
// `chamados/edicao.ts` e `chamados/os.ts`; aqui, o formato do pedido e da resposta. A pessoa e o
// tipo da abertura chegam como ids, e o vazio deles é recusado pela abertura, com as outras recusas
// dos campos, para a gaveta mostrá-las juntas.
import { type Banco, naOrganizacao } from '@grafite/db';
import {
  COMO_O_CHAMADO_TEM_A_SOLICITACAO,
  CORES_DE_CONSUMIVEL,
  fusoReconhecido,
  GRUPOS_DO_PRAZO,
  MENSAGENS_DO_TIPO_DE_CHAMADO,
  MODOS_DO_PRAZO,
  NIVEIS_DA_AVALIACAO,
  nomeDoFuso,
  ORIGENS_DO_CHAMADO,
  RECUSA_DO_FORMULARIO,
  SEVERIDADES_DO_ALERTA,
  SITUACOES_DA_ORDEM,
  SITUACOES_DA_SOLICITACAO,
  SITUACOES_DE_ATENDIMENTO,
  SITUACOES_DO_CHAMADO,
} from '@grafite/domain';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { MiniaturaDoAnexo } from '../arquivos/anexos-sem-dono.ts';
import { lerArvore } from '../arvore.ts';
import { DisponibilidadeDoAtivo, SuprimentosDoAtivo } from '../ativos/esquemas.ts';
import { abrirChamado, RECUSAS_DA_ABERTURA } from '../chamados/abertura.ts';
import { agirNoChamado, type PedidoDoAtendimento, RECUSAS_DAS_ACOES } from '../chamados/acoes.ts';
import { NumeroDoChamado } from '../chamados/alcance.ts';
import { ANEXO_NAO_ENCONTRADO } from '../chamados/anexos.ts';
import { buscarChamados } from '../chamados/busca.ts';
import {
  ATIVO_DO_CARTAO_NAO_ENCONTRADO,
  CartaoDoAtivo,
  previaDoCartao,
} from '../chamados/cartao.ts';
import { mudarOsCamposDaTi, trocarOAtivo, trocarOTitulo } from '../chamados/edicao.ts';
import { EVENTOS_DA_FICHA, fichaDoChamado } from '../chamados/ficha.ts';
import { FormularioDeChamado } from '../chamados/formulario.ts';
import { virarOs } from '../chamados/os.ts';
import { buscarPessoas } from '../chamados/pessoas.ts';
import { prazosDosChamados } from '../chamados/prazos.ts';
import { quadroDosChamados } from '../chamados/quadro.ts';
import { sugestoesDaPessoa } from '../chamados/sugestoes.ts';
import { lerTiposDaAbertura, TipoDaAbertura, ValorDoPrazo } from '../chamados/tipos.ts';
import { pedirToner } from '../chamados/toner.ts';
import { ResumoDosTemposLido } from '../chat/chamados-de-quem-participa.ts';
import { ConsumivelCompativel } from '../consumiveis/compativeis.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import { OrdemDeServico } from '../ordens/esquemas.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PedidoDoToner } from '../solicitacoes/esquemas.ts';
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

const TiposDaAbertura = z
  .object({ tipos: z.array(TipoDaAbertura) })
  .meta({ id: 'TiposDaAbertura' });

/** O termo da busca dos chamados (design, decisão 17): o número, com ou sem o "#", ou as palavras. */
const PedidoDaBusca = z.object({
  termo: z
    .string({ error: 'Informe o que buscar.' })
    .trim()
    .min(1, { error: 'Informe o que buscar.' })
    .max(100, { error: 'Use até 100 caracteres.' }),
});

const ChamadosNaBusca = z
  .object({
    /** Até 8: o do número primeiro, os abertos antes dos resolvidos, o mais novo primeiro. */
    itens: z.array(
      z.object({
        numero: z.int(),
        titulo: z.string(),
        /** O nome de agora de quem pediu. */
        pessoa: z.string(),
        situacao: z.enum(SITUACOES_DO_CHAMADO),
        /**
         * O resolvido que fechou, pela tarefa do fechamento ou pelo sétimo dia depois da resolução
         * já passado, no fuso do horário da TI; a tela o mostra como "Fechado".
         */
        fechado: z.boolean(),
      }),
    ),
  })
  .meta({ id: 'ChamadosNaBusca' });

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

const PedidoDaBuscaDaPessoa = z.object({
  /** As palavras do nome, de 1 a 100 caracteres, sem os espaços das pontas. */
  busca: z
    .string({ error: 'Informe o que buscar.' })
    .trim()
    .min(1, { error: 'Informe o que buscar.' })
    .max(100, { error: 'Use até 100 caracteres.' }),
});

const PessoasNaBusca = z
  .object({
    /** Até 10 pessoas ativas, pela ordem do nome sem acento, sem os contatos. */
    itens: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        /** O caminho do local de trabalho, como o chamado o mostra; nulo sem o local. */
        local: z.string().nullable(),
      }),
    ),
    /** Quantas pessoas ativas casam com o termo, também as que passam das 10. */
    total: z.number().int(),
  })
  .meta({ id: 'PessoasNaBuscaDosChamados' });

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
    /**
     * A versão de cada chamado aberto que a conta vê, pelo número: a tela a manda no assumir, no
     * passar e no devolver, e o chamado que mudou depois é recusado com o `chamado-mudou`.
     */
    versoes: z.record(z.string(), z.int()),
    /** Se a tela diz "Contando só os chamados dos locais que você vê.". */
    contandoSoOsLocaisQueVe: z.boolean(),
  })
  .meta({ id: 'QuadroDosChamados' });

/**
 * O relógio guardado, de onde a web recalcula a situação a cada minuto, com o horário da TI; nulo
 * com o prazo estragado.
 */
const RelogioDoChamado = z
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
  .nullable();

/** Um chamado aberto na lista dos prazos, com o que a lista e o painel mostram. */
const ChamadoNosPrazos = z.object({
  numero: z.int(),
  titulo: z.string(),
  situacao: z.enum(SITUACOES_DO_CHAMADO),
  /** A versão, que a tela manda no assumir, no passar e no devolver. */
  versao: z.int(),
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
  relogio: RelogioDoChamado,
  /** O grupo no momento da leitura, no dia do fuso de quem olha; nulo com o prazo estragado. */
  grupo: z.enum(GRUPOS_DO_PRAZO).nullable(),
  /**
   * A última mensagem, de quem pediu ou da TI, com o começo do texto, até 280 caracteres, ou, só com
   * os anexos, o nome do primeiro.
   */
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

/** O anexo, para a tela baixá-lo pelo `GET /chamados/:numero/anexos/:arquivo`. */
const AnexoDaFicha = z.object({
  /** O id do arquivo. */
  id: z.uuid(),
  nome: z.string(),
  tipo: z.string(),
  bytes: z.int(),
  /** A miniatura da imagem, que `/miniatura` entrega; nula no anexo sem ela (tarefa 4.20). */
  miniatura: MiniaturaDoAnexo.nullable(),
});

/** Quem escreveu ou agiu: uma conta, ou a pessoa que pediu, com o nome de agora. */
const AutorNaConversa = z.object({
  tipo: z.enum(['conta', 'pessoa']),
  id: z.uuid(),
  nome: z.string(),
});

/** Uma conta dos dados do evento, com o nome de agora; nula quando o evento não a tem. */
const ContaDoEvento = z.object({ conta: z.uuid(), nome: z.string() }).nullable();

/** O ativo do evento do ativo, com o rótulo e o patrimônio de agora, ou nulo, sem ativo. */
const AtivoDoEvento = z
  .object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() })
  .nullable();

const EscritoNaConversa = z.object({
  id: z.uuid(),
  em: z.iso.datetime(),
  autor: AutorNaConversa,
  /** O texto, nulo na mensagem e na nota só com os anexos. */
  texto: z.string().nullable(),
  anexos: z.array(AnexoDaFicha),
  /** As opções da pergunta da TI, de 2 a 3; nulas na mensagem sem pergunta e na nota. */
  opcoes: z.array(z.string()).nullable(),
  /** A opção escolhida por quem participa, com quem a escolheu e quando; nula sem resposta. */
  escolhida: z.object({ opcao: z.string(), por: z.string(), em: z.iso.datetime() }).nullable(),
  /** O cartão do ativo, como foi mandado, com o "Abrir a ficha" a quem vê o ativo agora. */
  cartao: CartaoDoAtivo.extend({ abrir: z.boolean() })
    .meta({ id: 'CartaoDoAtivoNaFicha' })
    .nullable(),
});

/**
 * A conversa na ordem: a mensagem para a pessoa, a nota interna, o evento, de que a web monta a
 * frase com os nomes de agora, e o alerta do ativo ligado, na hora em que abriu.
 */
const ItemDaConversa = z.discriminatedUnion('especie', [
  EscritoNaConversa.extend({ especie: z.literal('mensagem') }),
  EscritoNaConversa.extend({ especie: z.literal('nota') }),
  z.object({
    especie: z.literal('evento'),
    id: z.uuid(),
    em: z.iso.datetime(),
    /** Quem agiu; nulo no `fechou`, que ninguém faz. */
    autor: AutorNaConversa.nullable(),
    evento: z.enum(EVENTOS_DA_FICHA),
    /** De quem o chamado saiu, no `assumiu`, no `passou` e no `devolveu`. */
    de: ContaDoEvento,
    /** Para quem ele foi, no `passou`, ou voltou, no `desfez` e no `reabriu`; nulo na triagem. */
    para: ContaDoEvento,
    /**
     * No `assumiu`, desde quando o chamado estava na triagem, ou com quem estava, para o "estava há
     * 2 h na triagem"; no `desfez`, o de antes, que ele devolve; nulo nos outros.
     */
    desde: z.iso.datetime().nullable(),
    /** No `ativo`, o ativo de antes e o de depois da troca; nulo nos outros. */
    ativo: z.object({ antes: AtivoDoEvento, depois: AtivoDoEvento }).nullable(),
    /** No `os`, o número da OS em que o chamado virou; nulo nos outros. */
    os: z.object({ numero: z.int() }).nullable(),
    /**
     * No `solicitacao`, o número da solicitação e como o chamado a tem: se juntou a ela, a pediu
     * pelo "Pedir toner" ou a gerou pelo tipo na abertura; nulo nos outros.
     */
    solicitacao: z
      .object({ numero: z.int(), como: z.enum(COMO_O_CHAMADO_TEM_A_SOLICITACAO) })
      .nullable(),
    /**
     * No `solicitacao-nao-gerada`, o motivo, escrito na abertura (o do Equipamento sem local, com o
     * nome de agora da pessoa), que vem depois de "A solicitação não foi gerada: "; nulo nos outros.
     */
    motivo: z.string().nullable(),
    /** No `avaliou` de quem participa, o nível e o comentário; nulo nos outros. */
    avaliacao: z
      .object({ nivel: z.enum(NIVEIS_DA_AVALIACAO), comentario: z.string().nullable() })
      .nullable(),
    /** No `resolveu`, o resumo dos tempos dessa resolução; nulo nos outros. */
    resumo: ResumoDosTemposLido.nullable(),
  }),
  z.object({
    especie: z.literal('alerta'),
    id: z.uuid(),
    em: z.iso.datetime(),
    texto: z.string(),
    severidade: z.enum(SEVERIDADES_DO_ALERTA),
  }),
]);

/**
 * O resumo do ativo ligado (change chamados-da-ti, design, decisão 5, "O resumo na ficha"): as
 * leituras como a ficha do ativo as dá, e as OS, os compatíveis e a solicitação, nulos a quem não
 * os vê e com o Operação desligado.
 */
const ResumoDoAtivo = z
  .object({
    /** Nula no ativo inativo e no tipo sem a capacidade, como na ficha do ativo. */
    disponibilidade: DisponibilidadeDoAtivo.nullable(),
    /** Nulo no ativo inativo e no tipo sem a capacidade, como na ficha do ativo. */
    suprimentos: SuprimentosDoAtivo.nullable(),
    /** A média dos últimos 90 dias do contador; nula com menos de 7 dias de leituras. */
    paginasPorMes: z.int().nullable(),
    /**
     * O "Toner crítico": um alerta do toner aberto, na severidade Crítico; nulo sem `alertas.ver` no
     * local do ativo.
     */
    tonerCritico: z.boolean().nullable(),
    /** As em aberto agora e as concluídas no ano, no fuso da TI; nulo sem `ordens.ver` no local. */
    ordens: z.object({ abertas: z.int(), concluidas: z.int() }).nullable(),
    /**
     * Com o saldo e o mínimo somados onde a conta vê o estoque, e o `abaixo` quando algum desses
     * locais está abaixo do mínimo; nulo sem `estoque.ver`.
     */
    compativeis: z
      .array(
        ConsumivelCompativel.extend({ saldo: z.int(), minimo: z.int(), abaixo: z.boolean() }).meta({
          id: 'CompativelNoResumoDoAtivo',
        }),
      )
      .nullable(),
    /** A de Toner pendente que o "Pedir toner" juntaria, a quem a vê. */
    solicitacao: z
      .object({ id: z.uuid(), numero: z.int(), situacao: z.enum(SITUACOES_DA_SOLICITACAO) })
      .nullable(),
  })
  .meta({ id: 'ResumoDoAtivoNoChamado' });

const FichaDoChamado = z
  .object({
    numero: z.int(),
    titulo: z.string(),
    situacao: z.enum(SITUACOES_DO_CHAMADO),
    /** A versão, que sobe nas ações que mudam a situação ou quem atende. */
    versao: z.int(),
    origem: z.enum(ORIGENS_DO_CHAMADO),
    /**
     * Na origem `chat`, a conversa de onde o chamado foi aberto, pelo nome de agora (na direta, "Paulo
     * Nunes com Ana Souza", quem escreveu primeiro), e a mensagem citada, como ficou na abertura,
     * com os anexos; o "Abrir a conversa", só a quem usa o chat e participa dela agora.
     */
    origemNoChat: z
      .object({
        conversa: z.object({ tipo: z.enum(['direta', 'equipe', 'canal']), nome: z.string() }),
        autor: z.string(),
        /** O texto, nulo na mensagem citada só com os anexos. */
        texto: z.string().nullable(),
        em: z.iso.datetime(),
        anexos: z.array(AnexoDaFicha),
        abrir: z.object({ conversa: z.uuid(), mensagem: z.uuid() }).nullable(),
      })
      .nullable(),
    abertoEm: z.iso.datetime(),
    /** O resolvido que não se reabre mais: o que a tarefa fechou e o vencido que ela não fechou. */
    fechado: z.boolean(),
    /** No resolvido, o último dia em que ele se reabre, como "2026-11-18", no fuso da TI. */
    reabrirAte: z.string().nullable(),
    /** O tipo, com o `podeVirarOs`, para a tela mostrar o "Virar OS" só no tipo que vira OS. */
    tipo: z.object({
      id: z.uuid(),
      nome: z.string(),
      icone: z.string(),
      podeVirarOs: z.boolean(),
    }),
    /**
     * Quem pediu, com o caminho do local de trabalho. O atalho da ficha e os contatos vão a quem tem
     * `pessoas.ver` no local dela; a anonimizada vem com o nome anonimizado, sem os dois.
     */
    pessoa: z.object({
      id: z.uuid(),
      nome: z.string(),
      local: z.string().nullable(),
      abrir: z.boolean(),
      contatos: z
        .object({ email: z.string().nullable(), telefone: z.string().nullable() })
        .nullable(),
      /** A conta da pessoa usa o chat, com o módulo ligado: a mensagem chega a ela. */
      usaOChat: z.boolean(),
    }),
    /**
     * Quem atende, desde quando, e se não atende mais os chamados: a conta inativa ou fora de um dos
     * locais do chamado, como no quadro.
     */
    responsavel: z
      .object({
        conta: z.uuid(),
        nome: z.string(),
        desde: z.iso.datetime(),
        naoAtendeMais: z.boolean(),
      })
      .nullable(),
    /** O ativo ligado, a toda conta que vê o chamado; o atalho, a quem tem `ativos.ver` no local dele. */
    ativo: z
      .object({
        id: z.uuid(),
        rotulo: z.string(),
        patrimonio: z.string().nullable(),
        local: z.string().nullable(),
        abrir: z.boolean(),
        /** O tipo do ativo, com o ícone da miniatura. */
        tipo: z.object({ nome: z.string(), icone: z.string() }),
        /** Se o tipo usa consumíveis, para o "Pedir toner". */
        usaConsumiveis: z.boolean(),
        /** O resumo da seção "Ativo ligado", também sem `ativos.ver`; nulo com o Ativos desligado. */
        resumo: ResumoDoAtivo.nullable(),
      })
      .nullable(),
    locais: z.array(z.uuid()),
    semLocal: z.boolean(),
    /** Se a conta atende todos os locais do chamado. */
    permite: z.object({ atender: z.boolean() }),
    relogio: RelogioDoChamado,
    /** O momento em que o relógio parou, o "Parou às 09:21"; nulo com ele contando. */
    parouEm: z.iso.datetime().nullable(),
    horario: HorarioDaTiLido,
    /** A OS do chamado, a quem a vê, com o ativo dela, que pode não ser o do chamado. */
    os: z
      .object({
        id: z.uuid(),
        numero: z.int(),
        situacao: z.enum(SITUACOES_DA_ORDEM),
        ativo: z.object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() }),
      })
      .nullable(),
    /** A solicitação do chamado, a quem a vê. */
    solicitacao: z
      .object({ id: z.uuid(), numero: z.int(), situacao: z.enum(SITUACOES_DA_SOLICITACAO) })
      .nullable(),
    /** O formulário copiado na abertura e as respostas guardadas, pelo id de cada campo. */
    formulario: FormularioDeChamado,
    respostas: z.record(z.string(), z.unknown()),
    /** O que as respostas citam pelo id, com os nomes de agora, na ordem do formulário. */
    citados: z.object({
      ativos: z.array(
        z.object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() }),
      ),
      locais: z.array(z.object({ id: z.uuid(), caminho: z.string() })),
      pessoas: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    }),
    /** Os anexos dos campos Anexo, com o id do campo, na ordem das respostas. */
    anexosDosCampos: z.array(AnexoDaFicha.extend({ campo: z.string() })),
    /** A linha da abertura, montada das respostas que a pessoa vê, com os nomes de agora. */
    resumo: z.string(),
    conversa: z.array(ItemDaConversa),
    /** As respostas prontas do tipo, na ordem, com o `{nome}` trocado pelo primeiro nome da pessoa. */
    respostasProntas: z.array(
      z.object({
        id: z.uuid(),
        rotulo: z.string(),
        texto: z.string(),
        esperaAResposta: z.boolean(),
        /** As opções da pergunta, que o campo de escrever traz com o texto; nenhuma, sem pergunta. */
        opcoes: z.array(z.string()),
      }),
    ),
  })
  .meta({ id: 'FichaDoChamado' });

/**
 * A versão que a tela mostra, do quadro, dos prazos ou da ficha. Ela só é comparada com a do
 * chamado: a que não existe dá o `chamado-mudou`, como a velha.
 */
const VersaoDoChamado = z.int({ error: RECUSAS_DAS_ACOES.versaoInvalida });

const PedidoDaAcao = z
  .object({
    /** A versão que a tela mostra; a que o chamado não tem mais é recusada com o `chamado-mudou`. */
    versao: VersaoDoChamado.optional(),
  })
  .meta({ id: 'PedidoDaAcaoDoChamado' });

const PedidoDoPassar = z
  .object({
    /** A conta que recebe o chamado: ativa, e que atende todos os locais dele. */
    para: z.uuid({
      error: (problema) =>
        problema.input === undefined
          ? RECUSAS_DAS_ACOES.semConta
          : RECUSAS_DAS_ACOES.contaNaoEncontrada,
    }),
    versao: VersaoDoChamado.optional(),
  })
  .meta({ id: 'PedidoDoPassarDoChamado' });

const PedidoDoDesfazer = z
  .object({
    /** A versão que o assumir devolveu; a que o chamado não tem mais é recusada. */
    versao: VersaoDoChamado,
  })
  .meta({ id: 'PedidoDoDesfazerDoChamado' });

const PedidoDoResolver = z
  .object({
    /**
     * O que foi feito, que vai à pessoa, sem os espaços das pontas, com até 2.000 caracteres: o vazio
     * e o longo são recusados pelo domínio, no campo `feito`.
     */
    feito: z.string().default(''),
    /** A versão que a tela mostra; a que o chamado não tem mais é recusada com o `chamado-mudou`. */
    versao: VersaoDoChamado.optional(),
  })
  .meta({ id: 'PedidoDoResolverDoChamado' });

/** O id de um anexo, como o envio o devolveu. */
const IdDoAnexo = z.uuid();

const PedidoDaConversa = z
  .object({
    /**
     * O texto, sem os espaços das pontas, com até 4.000 caracteres: o vazio e o longo são recusados
     * pelo domínio, com a frase de cada ação, no campo `texto`.
     */
    texto: z.string().default(''),
    /**
     * Os ids dos anexos, como o envio os devolveu, até 5, enviados pela mesma conta e sem dono; o que
     * nem é um id é o anexo que não se acha, também no campo `anexos`.
     */
    anexos: z
      .array(z.string())
      .refine((ids) => ids.every((id) => IdDoAnexo.safeParse(id).success), {
        error: ANEXO_NAO_ENCONTRADO,
      })
      .optional(),
    /**
     * O cartão do ativo, pelo id, de um ativo que quem escreve vê; nulo ou ausente, sem cartão. O
     * retrato é montado na hora de mandar.
     */
    cartao: z.uuid({ error: ATIVO_DO_CARTAO_NAO_ENCONTRADO }).nullish(),
  })
  .meta({ id: 'PedidoDaNotaDoChamado' });

const PedidoDaMensagemDoChamado = PedidoDaConversa.extend({
  /**
   * As opções da pergunta, de 2 a 3, cada uma de 1 a 40 caracteres e diferentes entre si; nenhuma, a
   * mensagem sem pergunta. As recusas vêm no campo `opcoes`.
   */
  opcoes: z.array(z.string()).optional(),
}).meta({ id: 'PedidoDaConversaDoChamado' });

const BuscaDoCartao = z
  .object({
    /**
     * O id do ativo, como o "Cartão do ativo" o escolhe e como o "/ativo" sozinho o tem, pelo ativo
     * do chamado; com ele, o patrimônio não conta.
     */
    ativo: z.uuid({ error: ATIVO_DO_CARTAO_NAO_ENCONTRADO }).optional(),
    /**
     * O patrimônio do ativo, como o "/ativo" o escreve, sem contar os acentos, as maiúsculas e os
     * espaços das pontas. Sem o id, ele é pedido.
     */
    patrimonio: z
      .string({ error: ATIVO_DO_CARTAO_NAO_ENCONTRADO })
      .trim()
      .min(1, { error: ATIVO_DO_CARTAO_NAO_ENCONTRADO })
      .max(200, { error: ATIVO_DO_CARTAO_NAO_ENCONTRADO })
      .optional(),
  })
  .refine(({ ativo, patrimonio }) => ativo !== undefined || patrimonio !== undefined, {
    error: ATIVO_DO_CARTAO_NAO_ENCONTRADO,
    path: ['patrimonio'],
  });

/** O ativo da prévia: pelo id, quando vem, ou pelo patrimônio. */
const ondeDoCartao = ({
  ativo,
  patrimonio = '',
}: z.infer<typeof BuscaDoCartao>): { ativo: string } | { patrimonio: string } =>
  ativo === undefined ? { patrimonio } : { ativo };

const PedidoDaTrocaDoAtivo = z
  .object({
    /** O ativo que o chamado passa a ter, que quem age vê e está ativo, ou nulo, para tirar o ativo. */
    ativo: z.uuid({ error: RECUSAS_DA_ABERTURA.ativoNaoEncontrado }).nullable(),
    /** A versão que a tela mostra; a que o chamado não tem mais é recusada com o `chamado-mudou`. */
    versao: VersaoDoChamado.optional(),
  })
  .meta({ id: 'PedidoDaTrocaDoAtivoDoChamado' });

const PedidoDaTrocaDoTitulo = z
  .object({
    /**
     * O título, numa linha só, de 1 a 120 caracteres: o vazio e o longo são recusados pelo domínio,
     * com as frases da abertura, no campo `titulo`.
     */
    titulo: z.string().default(''),
  })
  .meta({ id: 'PedidoDaTrocaDoTituloDoChamado' });

const PedidoDosCamposDaTi = z
  .object({
    /**
     * As respostas dos campos só da TI que mudam, pelo id de cada campo, com o vazio ou o nulo para
     * apagar; a chave que não é um campo só da TI é recusada no `formulario`.
     */
    respostas: z.record(z.string(), z.unknown(), { error: RECUSA_DO_FORMULARIO }),
  })
  .meta({ id: 'PedidoDosCamposDaTiDoChamado' });

const PedidoDoVirarOs = z
  .object({
    /**
     * O problema da OS, que a tela traz com o título do chamado para quem abre corrigir; sem ele, o
     * título. O vazio é recusado pela abertura da OS, no campo `problema`.
     */
    problema: z.string().max(5000).optional(),
    /** O ativo da OS, que quem abre troca só para ela; sem ele, o do chamado. */
    ativo: z.uuid({ error: 'Ativo não encontrado.' }).optional(),
    /** A situação em que a OS nasce: a Aberta, a de sempre, ou já uma das do atendimento. */
    situacao: z
      .enum(['aberta', ...SITUACOES_DE_ATENDIMENTO], { error: 'Escolha a situação.' })
      .optional(),
    /** Na Aguardando fornecedor: o fornecedor e o número da OS nele. */
    fornecedor: z.uuid({ error: 'Fornecedor não encontrado.' }).nullable().optional(),
    os: z.string().max(5000).nullable().optional(),
  })
  .meta({ id: 'PedidoDoVirarOsDoChamado' });

const PedidoDoPedirToner = z
  .object({
    /**
     * O registro do Toner que a tela abriu, para gravar; sem ele, o chamado se junta à pendente ou
     * recebe o registro, sem gravar nada.
     */
    registro: PedidoDoToner.optional(),
  })
  .meta({ id: 'PedidoDoPedirToner' });

const SolicitacaoDoToner = z.object({ numero: z.int() });

const TonerDoChamado = z
  .discriminatedUnion('resultado', [
    z.object({ resultado: z.literal('juntou'), solicitacao: SolicitacaoDoToner }),
    z.object({
      resultado: z.literal('registro'),
      /** O registro do Toner para a tela abrir, com a pessoa, a impressora e a cor do chamado. */
      registro: z.object({
        tipo: z.literal('toner'),
        pessoa: z.uuid(),
        observacao: z.string().nullable(),
        impressoras: z.array(z.uuid()),
        itens: z.array(
          z.object({
            impressora: z.uuid(),
            cor: z.enum(CORES_DE_CONSUMIVEL),
            quantidade: z.int(),
            consumivel: z.uuid().nullable(),
          }),
        ),
      }),
    }),
  ])
  .meta({ id: 'TonerDoChamado' });

const TonerPedidoPeloChamado = z
  .object({ resultado: z.literal('pediu'), solicitacao: SolicitacaoDoToner })
  .meta({ id: 'TonerPedidoPeloChamado' });

const ChamadoDepoisDaAcao = z
  .object({
    numero: z.int(),
    /** A versão depois da ação; a do assumir é a que o "Desfazer" do aviso manda. */
    versao: z.int(),
    situacao: z.enum(SITUACOES_DO_CHAMADO),
    /** Com quem o chamado ficou, ou nulo, na triagem. */
    responsavel: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  })
  .meta({ id: 'ChamadoDepoisDaAcao' });

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

  // Os tipos da gaveta, a quem atende: a lista e o formulário de cada tipo, em `/chamados/tipos`,
  // são de quem configura (design, decisão 18, "Os tipos da gaveta").
  app.get(
    '/chamados/abertura',
    {
      config: { permissao: 'chamados.atender' },
      schema: {
        summary: 'Os tipos que a abertura aceita, na ordem, com o formulário de cada um',
        response: { 200: TiposDaAbertura, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => ({
      tipos: await naOrganizacao(banco, requisicao.organizacao?.id ?? '', lerTiposDaAbertura),
    }),
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

  // A busca da pessoa em duas rotas, como as sugestões: a da gaveta, de quem abre, e a do "Ver
  // como" da prévia, de quem configura. A lista das pessoas pede `pessoas.ver`, que as duas contas
  // podem não ter, e esta dá só o que o chamado mostra a quem o vê: o nome e o local de trabalho.
  const ROTAS_DA_BUSCA_DA_PESSOA = [
    {
      endereco: '/chamados/pessoas',
      permissao: 'chamados.atender',
      summary: 'A busca da pessoa do chamado pelo nome, para abrir o chamado',
    },
    {
      endereco: '/chamados/tipos/pessoas',
      permissao: 'chamados.configurar',
      summary: 'A busca da pessoa pelo nome, para o "Ver como" da prévia do colaborador',
    },
  ] as const;
  for (const { endereco, permissao, summary } of ROTAS_DA_BUSCA_DA_PESSOA) {
    app.get(
      endereco,
      {
        config: { permissao },
        schema: {
          summary,
          querystring: PedidoDaBuscaDaPessoa,
          response: { 200: PessoasNaBusca, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
        },
      },
      (requisicao) =>
        naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
          buscarPessoas(tx, requisicao.query.busca, await lerArvore(tx)),
        ),
    );
  }

  app.get(
    '/chamados/busca',
    {
      config: { permissao: 'chamados.ver' },
      schema: {
        summary: 'A busca dos chamados pelo número, com ou sem o "#", ou pelas palavras do título',
        querystring: PedidoDaBusca,
        response: { 200: ChamadosNaBusca, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        buscarChamados(tx, requisicao.query.termo, {
          acesso: sessaoDa(requisicao).acesso,
          arvore: await lerArvore(tx),
          agora: agora(),
        }),
      ),
  );

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

  app.get(
    '/chamados/:numero',
    {
      config: { permissao: 'chamados.ver' },
      schema: {
        summary: 'A ficha do chamado, com o prazo, as respostas, a conversa e as respostas prontas',
        params: z.object({ numero: NumeroDoChamado }),
        response: { 200: FichaDoChamado, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        fichaDoChamado(tx, requisicao.params.numero, {
          acesso: sessaoDa(requisicao).acesso,
          contaId: sessaoDa(requisicao).contaId,
          arvore: await lerArvore(tx),
          agora: agora(),
        }),
      ),
  );

  app.get(
    '/chamados/:numero/cartao',
    {
      config: { permissao: 'chamados.atender' },
      schema: {
        summary:
          'A prévia do cartão do ativo pelo id ou pelo patrimônio, o mesmo retrato que a mensagem grava',
        params: z.object({ numero: NumeroDoChamado }),
        querystring: BuscaDoCartao,
        response: { 200: CartaoDoAtivo, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        previaDoCartao(tx, requisicao.params.numero, ondeDoCartao(requisicao.query), {
          acesso: sessaoDa(requisicao).acesso,
          arvore: await lerArvore(tx),
          agora: agora(),
        }),
      ),
  );

  // As ações do atendimento (tarefas 4.12 a 4.14), com `chamados.atender`, cada uma com o pedido
  // dela, gravadas pelo `agirNoChamado`.
  const agir = (requisicao: FastifyRequest, numero: number, pedido: PedidoDoAtendimento) =>
    naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
      agirNoChamado(tx, numero, pedido, {
        requisicao,
        momento: agora(),
        ...(fila?.rodando() ? { enviar: (...dados) => fila.enviar(...dados) } : {}),
      }),
    );
  const DA_ACAO = {
    config: { permissao: 'chamados.atender' },
    params: z.object({ numero: NumeroDoChamado }),
    response: { 200: ChamadoDepoisDaAcao, ...PROBLEMAS },
  } as const;

  app.post(
    '/chamados/:numero/assumir',
    {
      config: DA_ACAO.config,
      schema: {
        summary: 'Assumir o chamado: ele fica com quem assume',
        params: DA_ACAO.params,
        body: PedidoDaAcao,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      agir(requisicao, requisicao.params.numero, { acao: 'assumir', ...requisicao.body }),
  );

  app.post(
    '/chamados/:numero/passar',
    {
      config: DA_ACAO.config,
      schema: {
        summary: 'Passar o chamado a uma conta que atende os locais dele',
        params: DA_ACAO.params,
        body: PedidoDoPassar,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      agir(requisicao, requisicao.params.numero, { acao: 'passar', ...requisicao.body }),
  );

  app.post(
    '/chamados/:numero/devolver',
    {
      config: DA_ACAO.config,
      schema: {
        summary: 'Devolver o chamado à triagem',
        params: DA_ACAO.params,
        body: PedidoDaAcao,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      agir(requisicao, requisicao.params.numero, { acao: 'devolver', ...requisicao.body }),
  );

  app.post(
    '/chamados/:numero/desfazer',
    {
      config: DA_ACAO.config,
      schema: {
        summary: 'Desfazer o assumir, se nada mudou o chamado depois dele',
        params: DA_ACAO.params,
        body: PedidoDoDesfazer,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      agir(requisicao, requisicao.params.numero, { acao: 'desfazer', ...requisicao.body }),
  );

  // A conversa (tarefa 4.13): a mensagem para a pessoa, o "Enviar e esperar a resposta" e a nota
  // interna, com o texto e os anexos.
  const ROTAS_DA_CONVERSA = [
    {
      acao: 'mensagem',
      summary: 'Enviar uma mensagem à pessoa do chamado, com os anexos, as opções e o cartão',
      body: PedidoDaMensagemDoChamado,
    },
    {
      acao: 'esperar',
      summary: 'Enviar a mensagem e esperar a resposta: o chamado fica aguardando a pessoa',
      body: PedidoDaMensagemDoChamado,
    },
    {
      acao: 'nota',
      summary: 'Gravar uma nota interna no chamado, com os anexos e o cartão',
      body: PedidoDaConversa,
    },
  ] as const;
  for (const { acao, summary, body } of ROTAS_DA_CONVERSA) {
    app.post(
      `/chamados/:numero/${acao}`,
      {
        config: DA_ACAO.config,
        schema: {
          summary,
          params: DA_ACAO.params,
          body,
          response: DA_ACAO.response,
        },
      },
      (requisicao) => agir(requisicao, requisicao.params.numero, { acao, ...requisicao.body }),
    );
  }

  // O fim e a volta (tarefa 4.14): retomar o que aguarda a pessoa, resolver com o que foi feito e
  // reabrir o resolvido, com a versão que a tela mostra.
  app.post(
    '/chamados/:numero/retomar',
    {
      config: DA_ACAO.config,
      schema: {
        summary: 'Retomar o chamado que aguarda a pessoa: ele volta ao atendimento',
        params: DA_ACAO.params,
        body: PedidoDaAcao,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      agir(requisicao, requisicao.params.numero, { acao: 'retomar', ...requisicao.body }),
  );

  app.post(
    '/chamados/:numero/resolver',
    {
      config: DA_ACAO.config,
      schema: {
        summary: 'Resolver o chamado, com o que foi feito, que vai à pessoa',
        params: DA_ACAO.params,
        body: PedidoDoResolver,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      agir(requisicao, requisicao.params.numero, { acao: 'resolver', ...requisicao.body }),
  );

  app.post(
    '/chamados/:numero/reabrir',
    {
      config: DA_ACAO.config,
      schema: {
        summary: 'Reabrir o chamado resolvido: ele volta a quem resolveu, ou à triagem',
        params: DA_ACAO.params,
        body: PedidoDaAcao,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      agir(requisicao, requisicao.params.numero, { acao: 'reabrir', ...requisicao.body }),
  );

  // O ativo, o título e os campos da TI (tarefa 4.15), gravados pelo `chamados/edicao.ts`, fora das
  // ações, porque não mudam a situação nem quem atende.
  app.put(
    '/chamados/:numero/ativo',
    {
      config: DA_ACAO.config,
      schema: {
        summary: 'Ligar, trocar ou tirar o ativo do chamado: os locais seguem a pessoa e o ativo',
        params: DA_ACAO.params,
        body: PedidoDaTrocaDoAtivo,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        trocarOAtivo(tx, requisicao.params.numero, requisicao.body, {
          requisicao,
          momento: agora(),
        }),
      ),
  );

  app.put(
    '/chamados/:numero/titulo',
    {
      config: DA_ACAO.config,
      schema: {
        summary: 'Trocar o título do chamado',
        params: DA_ACAO.params,
        body: PedidoDaTrocaDoTitulo,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        trocarOTitulo(tx, requisicao.params.numero, requisicao.body, {
          requisicao,
          momento: agora(),
        }),
      ),
  );

  app.patch(
    '/chamados/:numero/campos',
    {
      config: DA_ACAO.config,
      schema: {
        summary:
          'Preencher os campos só da TI do chamado: só os que mudam, com o vazio para apagar',
        params: DA_ACAO.params,
        body: PedidoDosCamposDaTi,
        response: DA_ACAO.response,
      },
    },
    (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        mudarOsCamposDaTi(tx, requisicao.params.numero, requisicao.body, {
          requisicao,
          momento: agora(),
        }),
      ),
  );

  // Virar OS (tarefa 4.16), pela abertura das OS de hoje, no `chamados/os.ts`.
  app.post(
    '/chamados/:numero/os',
    {
      config: DA_ACAO.config,
      schema: {
        summary:
          'Virar OS: abrir a OS no ativo do chamado, ou noutro só para ela, com o problema, ou o título dele, e a situação em que nasce, e ligar os dois',
        params: DA_ACAO.params,
        body: PedidoDoVirarOs,
        response: { 201: OrdemDeServico, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const ordem = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        virarOs(tx, requisicao.params.numero, requisicao.body, {
          requisicao,
          momento: agora(),
        }),
      );
      return resposta.code(201).send(ordem);
    },
  );

  // Pedir toner (tarefa 4.17), pelo registro das solicitações de hoje, no `chamados/toner.ts`.
  app.post(
    '/chamados/:numero/toner',
    {
      config: DA_ACAO.config,
      schema: {
        summary:
          'Pedir toner: juntar o chamado à solicitação pendente da impressora, ou dar o registro do Toner e gravá-lo',
        params: DA_ACAO.params,
        body: PedidoDoPedirToner,
        response: { 200: TonerDoChamado, 201: TonerPedidoPeloChamado, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const resultado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        pedirToner(tx, requisicao.params.numero, requisicao.body, {
          requisicao,
          momento: agora(),
        }),
      );
      if (resultado.resultado === 'pediu') return resposta.code(201).send(resultado);
      return resposta.code(200).send(resultado);
    },
  );
};
