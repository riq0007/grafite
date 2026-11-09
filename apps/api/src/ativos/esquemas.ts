// Os esquemas dos ativos no contrato da API (spec cadastro-de-ativos; design do P1b, decisão 8).

import { SITUACOES_DO_SEGREDO, TIPOS_DE_SEGREDO_NO_BANCO } from '@grafite/db';
import {
  fusoReconhecido,
  ICONES_DE_TIPO,
  ORIGENS_DO_VALOR,
  SITUACOES_DA_DISPONIBILIDADE,
  SITUACOES_DO_CONTROL_ID,
  USOS_DO_ATIVO,
} from '@grafite/domain';
import { z } from 'zod';
import { VARIANTES } from '../arquivos/armazenamento.ts';
import { SituacaoDoCadastro } from '../catalogo/esquemas.ts';
import { ConsumivelCompativel } from '../consumiveis/compativeis.ts';
import { Cursor, Limite } from '../paginacao.ts';

export const UsoDoAtivo = z.enum(
  USOS_DO_ATIVO.map((uso) => uso.id) as [
    (typeof USOS_DO_ATIVO)[number]['id'],
    ...(typeof USOS_DO_ATIVO)[number]['id'][],
  ],
  { error: 'Escolha em uso, em estoque ou em manutenção.' },
);

/** Um valor guardado: texto, número ou os ids das opções de uma lista múltipla. */
export const ValorDoCampo = z
  .union([z.string(), z.number(), z.array(z.string())])
  .meta({ id: 'ValorDoCampo' });

export const EstadoDoCampo = z
  .object({
    origem: z.enum(ORIGENS_DO_VALOR).nullable(),
    momento: z.string().nullable(),
    /** A conta que gravou, pelo nome atual da pessoa dela. */
    autor: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    /** O coletor que gravou, na gravação pela coleta, pelo nome atual (change p2b). */
    coletor: z.object({ id: z.uuid(), nome: z.string() }).nullable().optional(),
    trava: z.boolean(),
  })
  .meta({ id: 'EstadoDoCampo' });

const TipoDoAtivo = z.object({ id: z.uuid(), nome: z.string(), icone: z.enum(ICONES_DE_TIPO) });

const ModeloDoAtivo = z.object({
  id: z.uuid(),
  fabricante: z.string(),
  nome: z.string(),
  imagem: z.object({ id: z.uuid() }).nullable(),
});

/**
 * A disponibilidade do ativo de um tipo com a capacidade (spec disponibilidade-de-rede): a situação,
 * o momento da última leitura e desde quando a situação vale, a latência da mesma leitura, o coletor
 * que a fez, ou, sem leitura, o motivo. A tela diz se a leitura está desatualizada.
 */
export const DisponibilidadeDoAtivo = z
  .object({
    situacao: z.enum(SITUACOES_DA_DISPONIBILIDADE),
    /** ISO 8601, a última leitura. */
    momento: z.string().nullable(),
    /** ISO 8601, desde quando a situação vale. */
    desde: z.string().nullable(),
    /** Por que o ativo não foi verificado. */
    motivo: z.string().nullable(),
    /** Em ms, só com a leitura online. */
    latencia: z.object({ valor: z.number(), inconsistente: z.boolean() }).nullable(),
    /** O nome do coletor da última leitura. */
    coletor: z.string().nullable(),
  })
  .meta({ id: 'DisponibilidadeDoAtivo' });

/** O nível de um suprimento: o percentual medido, "há suprimento", sem dado ou inconsistente. */
const NivelDoSuprimento = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('medido'), percentual: z.number() }),
  z.object({ tipo: z.literal('ha-suprimento') }),
  z.object({ tipo: z.literal('sem-dado') }),
  z.object({ tipo: z.literal('inconsistente'), valor: z.number().nullable() }),
]);

/** O menor nível medido, com o suprimento dele, e o total de páginas, que as colunas mostram. */
const MenorNivel = z.object({ nivel: z.number(), descricao: z.string(), momento: z.string() });
const TotalDePaginas = z.object({ paginas: z.number(), momento: z.string() });

/**
 * O painel Suprimentos da ficha (spec impressoras-por-snmp, "Painel Suprimentos"; change
 * p2b-impressoras-por-snmp, design, decisão 8). Os momentos são ISO 8601, das leituras.
 */
export const SuprimentosDoAtivo = z
  .object({
    /** Por que o ativo não foi verificado; sem ele, a resposta vale. */
    motivo: z.string().nullable(),
    /** A resposta da última leitura, com desde quando e o coletor que a fez. */
    resposta: z
      .object({
        situacao: z.enum(['respondeu', 'nao-respondeu', 'sem-dado']),
        momento: z.string(),
        desde: z.string(),
        coletor: z.string().nullable(),
      })
      .nullable(),
    /** Na ordem da impressora, com o tipo pela descrição. */
    suprimentos: z.array(
      z.object({
        item: z.string(),
        descricao: z.string(),
        tipo: z.enum(['toner', 'cilindro', 'fusor', 'outro']),
        nivel: NivelDoSuprimento,
        momento: z.string(),
      }),
    ),
    contadores: z.array(
      z.object({
        item: z.string(),
        /** "Total de páginas", "Páginas coloridas" ou "Contador" com o número. */
        rotulo: z.string(),
        paginas: z.number().nullable(),
        inconsistente: z.boolean(),
        momento: z.string(),
      }),
    ),
    /** O total menos as coloridas, ou o total na impressora de uma cor; nada sem como saber. */
    paginasEmPretoEBranco: z.number().nullable(),
    condicoes: z
      .object({
        itens: z.array(
          z.object({
            chave: z.string(),
            rotulo: z.string(),
            severidade: z.enum(['atencao', 'critico']),
          }),
        ),
        momento: z.string(),
      })
      .nullable(),
    mensagens: z.object({ itens: z.array(z.string()), momento: z.string() }).nullable(),
    menor: MenorNivel.nullable(),
    total: TotalDePaginas.nullable(),
  })
  .meta({ id: 'SuprimentosDoAtivo' });

/**
 * A série dos suprimentos (change suprimentos-rostos-e-backups, design, decisão 2): por suprimento,
 * o último percentual válido de cada dia de São Paulo, dos últimos 30 dias.
 */
export const SerieDosSuprimentos = z
  .object({
    itens: z.array(
      z.object({
        item: z.string(),
        descricao: z.string(),
        pontos: z.array(
          z.object({
            /** AAAA-MM-DD, em São Paulo. */
            dia: z.string(),
            momento: z.string(),
            percentual: z.number(),
          }),
        ),
      }),
    ),
  })
  .meta({ id: 'SerieDosSuprimentos' });

/** Na lista, o que as colunas Suprimentos e Total de páginas mostram. */
export const SuprimentosNaLista = z
  .object({ menor: MenorNivel.nullable(), total: TotalDePaginas.nullable() })
  .meta({ id: 'SuprimentosNaLista' });

/**
 * A saúde do Control iD do ativo de um tipo com a capacidade (spec saude-do-control-id, "Situação do
 * Control iD"): a situação da última sondagem, com o momento e desde quando ela vale, ou, sem
 * sondagem, o motivo; o último contato, o firmware e o produto da última sondagem respondendo; de
 * onde vem o login, sem o usuário nem a senha; e o coletor. A tela diz se a sondagem está
 * desatualizada.
 */
export const SaudeDoControlId = z
  .object({
    situacao: z.enum(SITUACOES_DO_CONTROL_ID),
    /** ISO 8601, a última sondagem. */
    momento: z.string().nullable(),
    /** ISO 8601, desde quando a situação vale. */
    desde: z.string().nullable(),
    /** Por que o controle não foi verificado. */
    motivo: z.string().nullable(),
    /** ISO 8601, a última sondagem respondendo. */
    ultimoContato: z.string().nullable(),
    firmware: z.string().nullable(),
    produto: z.string().nullable(),
    /** O login do tipo ou o próprio do controle; nenhum, sem um login que sirva. */
    login: z.enum(['tipo', 'controle']).nullable(),
    /** O nome do coletor da última sondagem. */
    coletor: z.string().nullable(),
  })
  .meta({ id: 'SaudeDoControlId' });

export const AtivoNaLista = z
  .object({
    id: z.uuid(),
    /** O nome que o ativo mostra: o nome, o fabricante e o modelo, ou o tipo. */
    rotulo: z.string(),
    tipo: TipoDoAtivo,
    modelo: ModeloDoAtivo.nullable(),
    /** A imagem própria do ativo, que vale no lugar da do modelo. */
    imagem: z.object({ id: z.uuid() }).nullable(),
    patrimonio: z.string().nullable(),
    serie: z.string().nullable(),
    hostname: z.string().nullable(),
    local: z.object({ id: z.uuid(), caminho: z.string() }).nullable(),
    responsavel: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    uso: UsoDoAtivo,
    situacao: SituacaoDoCadastro,
    /** ISO 8601. */
    criadoEm: z.string(),
    /** ISO 8601. */
    atualizadoEm: z.string(),
    /**
     * Os valores das colunas pedidas que ficam no JSONB, pela chave; os restritos só onde a conta
     * os vê.
     */
    valores: z.record(z.string(), ValorDoCampo),
    permite: z.object({
      editar: z.boolean(),
      verRestritos: z.boolean(),
      /**
       * A conta vê a pessoa responsável, com `pessoas.ver` no local de trabalho dela, e ela não
       * está anonimizada: a referência a ela é um link com cartão (change relacoes-vivas).
       */
      verResponsavel: z.boolean(),
    }),
    /**
     * Na lista e na ficha, a disponibilidade, nos ativos de um tipo com a capacidade; vazia no
     * ativo inativo e no de outro tipo.
     */
    disponibilidade: DisponibilidadeDoAtivo.nullable().optional(),
    /**
     * Na lista, o menor nível e o total de páginas, nos ativos de um tipo com os suprimentos e
     * contadores; vazio no ativo inativo e no de outro tipo.
     */
    suprimentos: SuprimentosNaLista.nullable().optional(),
    /**
     * Na lista e na ficha, a saúde do Control iD, nos ativos de um tipo com a capacidade; vazia no
     * ativo inativo e no de outro tipo.
     */
    controlId: SaudeDoControlId.nullable().optional(),
  })
  .meta({ id: 'AtivoNaLista' });

/** O ativo no cartão da referência (change relacoes-vivas, design, decisão 1). */
export const ResumoDoAtivo = AtivoNaLista.pick({
  id: true,
  rotulo: true,
  tipo: true,
  modelo: true,
  imagem: true,
  patrimonio: true,
  local: true,
  responsavel: true,
  uso: true,
  situacao: true,
})
  .extend({
    /** Quantos estão ligados a ele, como a aba Ligados os conta. */
    ligados: z.number().int().min(0),
  })
  .meta({ id: 'ResumoDoAtivo' });

/**
 * Um ativo ligado a outro: a forma do item da lista, sem os valores, ou só o aviso de que ele está
 * fora do acesso da conta, sem o id (spec ligacoes-de-ativos, "Acesso às ligações").
 */
export const AtivoLigado = z
  .union([AtivoNaLista.omit({ valores: true }), z.object({ foraDoAcesso: z.literal(true) })])
  .meta({ id: 'AtivoLigado' });

/** Uma ligação livre, o "Ligado a", com o ativo do outro lado e se a conta pode desfazê-la. */
export const LigacaoLivre = z
  .object({ id: z.uuid(), outro: AtivoLigado, permite: z.object({ desfazer: z.boolean() }) })
  .meta({ id: 'LigacaoLivre' });

/** O que está ligado a um ativo: um grupo por campo do tipo ativo que aponta para ele e os livres. */
export const LigadosDoAtivo = z
  .object({
    porCampos: z.array(
      z.object({
        campo: z.object({ id: z.uuid(), rotulo: z.string(), ladoDeLa: z.string().nullable() }),
        /** Quantos ativos apontam pelo campo; a lista traz até 100, pelo nome. */
        total: z.number().int().min(0),
        ativos: z.array(AtivoLigado),
      }),
    ),
    livres: z.array(LigacaoLivre),
    permite: z.object({ ligar: z.boolean() }),
  })
  .meta({ id: 'LigadosDoAtivo' });

export const PedidoDeLigacao = z
  .object({ outroId: z.uuid({ error: 'Ativo não encontrado.' }) })
  .meta({ id: 'PedidoDeLigacao' });

/** Um registro do histórico do ativo, com as mudanças que a conta pode ver. */
export const ItemDoHistorico = z
  .object({
    id: z.uuid(),
    /** ISO 8601. */
    momento: z.string(),
    acao: z.string(),
    /** O texto da ação em pt-BR. */
    rotulo: z.string(),
    /** Quem fez: o nome atual da pessoa da conta, ou a descrição do sistema. */
    quem: z.string(),
    /** Cada campo que mudou, pelo rótulo e pelo valor mostrado; o vazio é `null`. */
    mudancas: z.array(
      z.object({ campo: z.string(), antes: z.string().nullable(), depois: z.string().nullable() }),
    ),
    travas: z.object({ ligadas: z.array(z.string()), desligadas: z.array(z.string()) }),
    /** Nas ligações livres, o outro ativo, pelo nome atual, ou fora do acesso, sem o id. */
    outro: z.object({ id: z.uuid().nullable(), rotulo: z.string() }).nullable(),
  })
  .meta({ id: 'ItemDoHistorico' });

export const HistoricoDoAtivo = z
  .object({
    itens: z.array(ItemDoHistorico),
    /** O cursor da próxima página; nulo na última. A página pode vir menor que o limite. */
    proximo: z.string().nullable(),
  })
  .meta({ id: 'HistoricoDoAtivo' });

export const FiltrosDoHistorico = z.object({ cursor: Cursor.optional(), limite: Limite });

/** O arquivo de um campo de arquivo ou de imagem, pelo nome original. */
const ArquivoDoCampo = z
  .object({ nome: z.string(), bytes: z.number().int().min(0), tipo: z.string() })
  .meta({ id: 'ArquivoDoCampo' });

/** Os nomes atuais dos registros que os valores e os filtros apontam, pelo id. */
const Referencias = z.object({
  pessoas: z.record(z.string(), z.string()),
  locais: z.record(z.string(), z.string()),
  ativos: z.record(z.string(), z.string()),
  /** O nome atual do fornecedor, com "(inativo)" no inativo (change p4a-fornecedores). */
  fornecedores: z.record(z.string(), z.string()),
  /** Os arquivos dos campos de arquivo e de imagem. */
  arquivos: z.record(z.string(), ArquivoDoCampo),
});

export const ListaDeAtivos = z
  .object({
    itens: z.array(AtivoNaLista),
    /** O cursor da próxima página; nulo na última. */
    proximo: z.string().nullable(),
    /** Quantos ativos atendem aos filtros, em todas as páginas. */
    total: z.number().int().min(0),
    /**
     * Os nomes dos registros que os valores da página e os filtros apontam, e os dos modelos, com o
     * tipo de cada modelo, para a tela marcar o que é de outro tipo que o filtrado.
     */
    referencias: Referencias.extend({
      modelos: z.record(z.string(), z.string()),
      tiposDosModelos: z.record(z.string(), z.string()),
    }),
    permite: z.object({ cadastrar: z.boolean() }),
  })
  .meta({ id: 'ListaDeAtivos' });

/** Um segredo do cofre ligado ao ativo, como a conta o vê no cofre, sem nenhum valor (P6). */
const SegredoDoAtivo = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    tipo: z.enum(TIPOS_DE_SEGREDO_NO_BANCO),
    identificador: z.string().nullable(),
    situacao: z.enum(SITUACOES_DO_SEGREDO),
  })
  .meta({ id: 'SegredoDoAtivo' });

export const FichaDoAtivo = AtivoNaLista.extend({
  /** Os valores guardados, pela chave do campo; os restritos só para quem pode vê-los. */
  valores: z.record(z.string(), ValorDoCampo),
  /** O estado de cada campo gravado ou travado, pela mesma chave, e o do modelo. */
  estado: z.record(z.string(), EstadoDoCampo),
  /** Os nomes atuais dos registros que os valores apontam, pelo id. */
  referencias: Referencias,
  permite: z.object({
    editar: z.boolean(),
    verRestritos: z.boolean(),
    editarRestritos: z.boolean(),
    verResponsavel: z.boolean(),
    /**
     * O acesso remoto (change acesso-remoto-vnc): o ativo ativo, o tipo com a capacidade e a conta
     * com `ativos.acesso-remoto` no local dele.
     */
    acessoRemoto: z.boolean().optional(),
    /**
     * O "Escolher login" no cartão do Control iD (change login-de-cada-controle, design, decisão
     * 4): o ativo ativo, o tipo com a saúde do Control iD, o Cofre ligado e a conta com
     * `cofre.administrar`.
     */
    escolherLoginDoControle: z.boolean().optional(),
  }),
  /**
   * Os segredos do cofre ligados ao ativo que a conta vê, só com o Cofre ligado e a conta com
   * `cofre.usar` e os dois passos ativos; sem isso, a ficha não tem a seção.
   */
  segredos: z.array(SegredoDoAtivo).optional(),
  /**
   * O painel Suprimentos, nos ativos de um tipo com a capacidade; vazio nos outros e no inativo. O
   * menor nível e o total, como a lista os mostra, ficam também em `suprimentos`.
   */
  painelDeSuprimentos: SuprimentosDoAtivo.nullable().optional(),
  /**
   * Os consumíveis compatíveis do modelo do ativo, para o cartão da capacidade (change
   * p4b-consumiveis, design, decisão 5): nulo sem a capacidade no tipo ou com o Operação desligado,
   * e vazio no ativo sem modelo.
   */
  consumiveisCompativeis: z.array(ConsumivelCompativel).nullable().optional(),
}).meta({ id: 'FichaDoAtivo' });

export const FiltrosDeAtivos = z.object({
  busca: z.string().max(200, { error: 'Use até 200 caracteres.' }).optional(),
  tipo: z.uuid({ error: 'Tipo de ativo não encontrado.' }).optional(),
  local: z.uuid({ error: 'Local não encontrado.' }).optional(),
  /** Sem ele, os ativos; um filtro de situação em `filtros` fica no lugar dele. */
  situacao: z
    .enum(['ativos', 'inativos', 'todos'], { error: 'Escolha ativos, inativos ou todos.' })
    .optional(),
  uso: UsoDoAtivo.optional(),
  /** A chave da coluna da ordem; sem ela, os cadastrados por último primeiro. */
  ordem: z.string().max(200, { error: 'Coluna desconhecida.' }).optional(),
  direcao: z
    .enum(['crescente', 'decrescente'], { error: 'Escolha crescente ou decrescente.' })
    .optional(),
  /** As chaves das colunas cujos valores a resposta traz, separadas por vírgula. */
  colunas: z.string().max(8_192, { error: 'Use até 60 colunas.' }).optional(),
  /** Os filtros das colunas, a lista em JSON, como a visão os guarda. */
  filtros: z.string().max(16_384, { error: 'Os filtros não são válidos.' }).optional(),
  /** O fuso dos dias do cadastro e da última mudança; sem ele, UTC. */
  fuso: z.string().refine(fusoReconhecido, { error: 'Fuso horário desconhecido.' }).optional(),
  cursor: Cursor.optional(),
  limite: Limite,
});

/** As contagens de uma coluna de escolha, com a busca e os filtros da lista. */
export const FiltrosDasContagens = z.object({
  /** A chave da coluna de escolha, como `ativo.tipo` ou o id de um campo de lista. */
  coluna: z.string({ error: 'Esta coluna não tem contagem.' }).max(200, {
    error: 'Esta coluna não tem contagem.',
  }),
  busca: FiltrosDeAtivos.shape.busca,
  filtros: FiltrosDeAtivos.shape.filtros,
  fuso: FiltrosDeAtivos.shape.fuso,
});

export const ContagensDaColuna = z
  .object({
    coluna: z.string(),
    /** Quantos ativos a lista tem sem o filtro da própria coluna. */
    total: z.number().int(),
    /** Quantos ativos cada opção traz, os de mais primeiro; a opção sem nenhum não vem. */
    opcoes: z.array(z.object({ valor: z.string(), quantos: z.number().int() })),
  })
  .meta({ id: 'ContagensDaColuna' });

/** Um valor pedido: o texto digitado, o número, as opções de uma lista múltipla, ou `null` para esvaziar. */
const ValorPedido = z.union([z.string(), z.number(), z.array(z.string()), z.null()]);

const ModeloPedido = z.uuid({ error: 'Modelo não encontrado.' }).nullable().optional();

export const PedidoDeAtivo = z
  .object({
    tipoId: z.uuid({ error: 'Escolha o tipo do ativo.' }),
    modeloId: ModeloPedido,
    /** Os valores pela chave do campo. */
    valores: z.record(z.string(), ValorPedido).default({}),
    /** As travas a ligar e a desligar, pela chave do campo. */
    travas: z.record(z.string(), z.boolean()).default({}),
  })
  .meta({ id: 'PedidoDeAtivo' });

/** Sem o tipo: ele não muda depois do cadastro. Só as chaves que mudaram. */
export const PedidoDeAlteracaoDoAtivo = z
  .strictObject({
    modeloId: ModeloPedido,
    valores: z.record(z.string(), ValorPedido).optional(),
    travas: z.record(z.string(), z.boolean()).optional(),
  })
  .meta({ id: 'PedidoDeAlteracaoDoAtivo' });

export const ParametrosDoAtivo = z.object({ id: z.uuid({ error: 'Ativo não encontrado.' }) });

/** O pedido das etiquetas: os ids dos ativos, separados por vírgula, até 200. */
export const PedidoDasEtiquetas = z.object({
  ids: z
    .string({ error: 'Escolha os ativos das etiquetas.' })
    .max(10_000, { error: 'Escolha até 200 ativos por vez.' }),
});

/** Os ativos das etiquetas, na ordem pedida, e quantos ficaram de fora. */
export const EtiquetasDosAtivos = z
  .object({
    itens: z.array(
      z.object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() }),
    ),
    /** Os que não existem e os de fora do acesso da conta, sem dizer quais. */
    fora: z.number().int(),
  })
  .meta({ id: 'EtiquetasDosAtivos' });

export const ParametrosDaLigacao = ParametrosDoAtivo.extend({
  ligacaoId: z.uuid({ error: 'Ligação não encontrada.' }),
});

export const ParametrosDoArquivoDoCampo = ParametrosDoAtivo.extend({
  campoId: z.uuid({ error: 'Campo não encontrado.' }),
});

export const ParametrosDaEntregaDoArquivo = ParametrosDoArquivoDoCampo.extend({
  arquivo: z.uuid({ error: 'Arquivo não encontrado.' }),
  variante: z.enum(VARIANTES, { error: 'Use 64, 128, 256, 512 ou completa.' }),
});

/** O nome original do arquivo enviado, que o servidor limpa e completa com a extensão do tipo. */
export const NomeDoArquivoEnviado = z.object({
  nome: z.string().max(1_000, { error: 'Use um nome de até 200 caracteres.' }).optional(),
});

export const ParametrosDaImagemDoAtivo = ParametrosDoAtivo.extend({
  arquivo: z.uuid({ error: 'Imagem não encontrada.' }),
  tamanho: z.enum(VARIANTES, { error: 'Use 64, 128, 256, 512 ou completa.' }),
});

/** O cursor da lista: o id, em uuidv7, do último ativo, na ordem do mais novo para o mais velho. */
export const ChaveDoAtivo = z.tuple([z.uuid()]);

/** O cursor da lista na ordem de uma coluna: a chave da ordem do último ativo, em texto, e o id. */
export const ChaveDaOrdemDoAtivo = z.tuple([z.string().nullable(), z.uuid()]);

/** A chave de um campo, de um registro ou de uma etapa no rascunho. */
const ChaveNoRascunho = z
  .string()
  .min(1)
  .max(200, { error: 'Use uma chave de até 200 caracteres.' });

/**
 * O que o cadastro em etapas guarda no rascunho (change cadastro-em-etapas, design, decisão 7): a
 * forma, e não o catálogo, porque o rascunho pode estar incompleto. O tipo e o modelo pelo id, as
 * entradas e as travas pela chave do campo, os nomes dos registros apontados pelo id, a etapa aberta
 * pela chave e a origem de onde o cadastro foi aberto, como o parâmetro da tela.
 */
export const ConteudoDoRascunhoDoAtivo = z
  .object({
    tipoId: z.uuid({ error: 'Tipo inválido.' }).nullable(),
    modeloId: z.uuid({ error: 'Modelo inválido.' }).nullable(),
    valores: z.record(
      ChaveNoRascunho,
      z.union([z.string().max(20_000), z.array(z.string().max(200)).max(1_000), z.null()], {
        error: 'Use um texto, uma lista de textos ou nada.',
      }),
    ),
    travas: z.record(ChaveNoRascunho, z.boolean({ error: 'Use verdadeiro ou falso.' })),
    nomes: z.record(ChaveNoRascunho, z.string().max(500)),
    etapa: ChaveNoRascunho.nullable(),
    origem: z.string().max(2_000).nullable(),
  })
  .meta({ id: 'ConteudoDoRascunhoDoAtivo' });

export const RascunhoDoAtivo = ConteudoDoRascunhoDoAtivo.extend({
  atualizadoEm: z.iso.datetime(),
}).meta({ id: 'RascunhoDoAtivo' });

/** O rascunho da conta, ou nada: sem rascunho não é um erro. */
export const LeituraDoRascunhoDoAtivo = z
  .object({ rascunho: RascunhoDoAtivo.nullable() })
  .meta({ id: 'LeituraDoRascunhoDoAtivo' });

export const RascunhoGuardado = z
  .object({ atualizadoEm: z.iso.datetime() })
  .meta({ id: 'RascunhoGuardado' });
