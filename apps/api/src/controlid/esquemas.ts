// Os esquemas do backup do Control iD pela API (spec backup-do-control-id; change
// p5a-backup-do-control-id, design, decisões 2, 3 e 8): o backup lido, a lista e o histórico do
// controle, o conteúdo do ZIP na tela e os pedidos do coletor.
import { ORIGENS_DO_BACKUP, SITUACOES_DO_BACKUP, TIPOS_DE_OPERACAO } from '@grafite/domain';
import { z } from 'zod';
import { Cursor, Limite } from '../paginacao.ts';

/** O controle do backup; `abrir` diz se a conta vê o ativo. */
export const ControleDoBackup = z
  .object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() })
  .meta({ id: 'ControleDoBackup' });

/** O que o coletor leu de cada categoria, com o rótulo em pt-BR. */
export const CategoriaDoBackupLida = z
  .object({
    categoria: z.string(),
    rotulo: z.string(),
    situacao: z.enum(['ok', 'erro']),
    quantidade: z.number().int(),
    erro: z.string().nullable(),
  })
  .meta({ id: 'CategoriaDoBackupLida' });

export const BackupDoControlId = z
  .object({
    id: z.uuid(),
    controle: ControleDoBackup,
    origem: z.enum(ORIGENS_DO_BACKUP),
    situacao: z.enum(SITUACOES_DO_BACKUP),
    /** O nome de quem pediu; o agendado não tem. */
    pedidoPor: z.string().nullable(),
    pedidoEm: z.string(),
    iniciadoEm: z.string().nullable(),
    concluidoEm: z.string().nullable(),
    /** O nome do coletor que buscou o pedido. */
    coletor: z.string().nullable(),
    temArquivo: z.boolean(),
    /** Em bytes. */
    tamanho: z.number().int().nullable(),
    registros: z.number().int().nullable(),
    fotos: z.number().int().nullable(),
    serie: z.string().nullable(),
    firmware: z.string().nullable(),
    modelo: z.string().nullable(),
    categorias: z.array(CategoriaDoBackupLida),
    erro: z.string().nullable(),
    /** A conta pode apagá-lo: tem `controlid.backup` no local, e ele não está aberto. */
    podeApagar: z.boolean(),
  })
  .meta({ id: 'BackupDoControlId' });

export const FiltrosDosBackups = z.object({
  ativo: z.uuid().optional(),
  situacao: z.enum(SITUACOES_DO_BACKUP).optional(),
  cursor: Cursor.optional(),
  limite: Limite,
});

/** O resumo pedido: um controle só, ou todos os que a conta vê, e os dias, de 7 a 90. */
export const FiltrosDoResumo = z.object({
  ativo: z.uuid().optional(),
  dias: z.coerce
    .number()
    .int()
    .min(7, { error: 'Peça de 7 a 90 dias.' })
    .max(90, { error: 'Peça de 7 a 90 dias.' })
    .default(30),
});

const ContagensDoBackup = z.object({
  usuarios: z.number().int().nullable(),
  rostos: z.number().int().nullable(),
});

/**
 * O resumo dos backups por controle (change suprimentos-rostos-e-backups, design, decisão 6): os
 * dias de São Paulo com a melhor situação, o último e o anterior bons, com os usuários e os rostos, e
 * a série dos rostos.
 */
export const ResumoDosBackups = z
  .object({
    controles: z.array(
      z.object({
        controle: ControleDoBackup,
        dias: z.array(
          z.object({
            data: z.string(),
            situacao: z.enum(['ok', 'parcial', 'falha', 'nada']),
          }),
        ),
        ultimo: ContagensDoBackup.extend({
          concluidoEm: z.string(),
          situacao: z.enum(['sucesso', 'parcial']),
        }).nullable(),
        anterior: ContagensDoBackup.nullable(),
        rostos: z.array(z.object({ momento: z.string(), valor: z.number().int() })),
      }),
    ),
  })
  .meta({ id: 'ResumoDosBackups' });

export const ListaDeBackups = z
  .object({
    itens: z.array(BackupDoControlId),
    proximo: z.string().nullable(),
    /** A conta pode pedir o backup de algum controle. */
    podeFazer: z.boolean(),
  })
  .meta({ id: 'ListaDeBackups' });

export const BackupsDoControle = z
  .object({
    itens: z.array(BackupDoControlId),
    podeFazer: z.boolean(),
    /** O horário do backup diário do tipo. */
    horario: z.string(),
  })
  .meta({ id: 'BackupsDoControle' });

export const ParametrosDoBackup = z.object({ id: z.uuid() });

export const ResultadoDoPedidoDeTodos = z
  .object({
    pedidos: z.number().int(),
    jaNaFila: z.number().int(),
    falhas: z.number().int(),
  })
  .meta({ id: 'ResultadoDoPedidoDeTodos' });

export const ABAS_DO_CONTEUDO = ['pessoas', 'grupos', 'regras', 'horarios'] as const;

export const FiltrosDoConteudo = z.object({
  aba: z.enum(ABAS_DO_CONTEUDO).default('pessoas'),
  busca: z.string().max(100).optional(),
  cursor: z.coerce.number().int().min(0).optional(),
});

/** Uma linha do conteúdo: o título, os detalhes em pares e se a pessoa tem foto. */
export const LinhaDoConteudoDoBackup = z
  .object({
    id: z.string(),
    titulo: z.string(),
    detalhes: z.array(z.object({ rotulo: z.string(), valor: z.string() })),
    foto: z.boolean(),
  })
  .meta({ id: 'LinhaDoConteudoDoBackup' });

export const ConteudoDoBackup = z
  .object({
    abas: z.array(
      z.object({ aba: z.enum(ABAS_DO_CONTEUDO), rotulo: z.string(), total: z.number().int() }),
    ),
    aba: z.enum(ABAS_DO_CONTEUDO),
    /** Quantas linhas a busca acha na aba. */
    total: z.number().int(),
    linhas: z.array(LinhaDoConteudoDoBackup),
    /** O deslocamento da página seguinte, ou nulo na última. */
    proximo: z.number().int().nullable(),
  })
  .meta({ id: 'ConteudoDoBackup' });

export const ParametrosDaFotoDoBackup = z.object({
  id: z.uuid(),
  usuario: z.coerce.number().int().min(0),
});

/** Um pedido para o coletor: o backup de um controle, com o login decifrado só para ele. */
export const PedidoDoColetor = z
  .object({
    id: z.uuid(),
    /** O backup, ou uma operação no controle (change p5b-comparacao-e-restauracao). */
    tipo: z.enum(['backup', 'restauracao', 'comparacao']),
    /** O backup da operação, cujo ZIP o coletor baixa pelo pedido. */
    backupId: z.uuid().nullable(),
    /** As categorias da restauração; nulo para todas. */
    categorias: z.array(z.string()).nullable(),
    ativoId: z.uuid(),
    rotulo: z.string(),
    ip: z.string(),
    porta: z.number().int(),
    usuario: z.string(),
    senha: z.string(),
  })
  .meta({ id: 'PedidoDoColetor' });

export const PedidosDoColetor = z
  .object({
    pedidos: z.array(PedidoDoColetor),
    /** Em quantos segundos buscar de novo. */
    proximaEm: z.number().int(),
  })
  .meta({ id: 'PedidosDoColetor' });

export const FalhaDoPedido = z
  .object({ mensagem: z.string().min(1).max(2000) })
  .meta({ id: 'FalhaDoPedido' });

export const RespostaDoPedido = z
  .object({ situacao: z.enum(SITUACOES_DO_BACKUP) })
  .meta({ id: 'RespostaDoPedido' });

export const ParametrosDoPedido = z.object({ id: z.uuid() });

// As operações e o comparador (change p5b-comparacao-e-restauracao, design, decisões 1, 2 e 6).

export const OperacaoDoControlId = z
  .object({
    id: z.uuid(),
    backupId: z.uuid(),
    ativoId: z.uuid(),
    tipo: z.enum(TIPOS_DE_OPERACAO),
    situacao: z.enum(SITUACOES_DO_BACKUP),
    categorias: z.array(z.object({ categoria: z.string(), rotulo: z.string() })).nullable(),
    pedidoPor: z.string().nullable(),
    pedidoEm: z.string(),
    iniciadoEm: z.string().nullable(),
    concluidoEm: z.string().nullable(),
    coletor: z.string().nullable(),
    /** Por categoria: na restauração, o total, os criados, os ignorados e os erros; na comparação, os iguais, os só no backup, os só no controle e os divergentes. */
    resultado: z.array(z.record(z.string(), z.unknown())),
    aviso: z.string().nullable(),
    erro: z.string().nullable(),
  })
  .meta({ id: 'OperacaoDoControlId' });

export const OperacoesDoControle = z
  .object({
    itens: z.array(OperacaoDoControlId),
    podeRestaurar: z.boolean(),
    podeComparar: z.boolean(),
  })
  .meta({ id: 'OperacoesDoControle' });

export const PedidoDeOperacao = z
  .object({
    tipo: z.enum(TIPOS_DE_OPERACAO),
    ativo: z.uuid({ error: 'Escolha um controle com o backup ligado.' }),
    categorias: z.array(z.string()).nullable().optional(),
    codigo: z.string().max(20).nullable().optional(),
  })
  .meta({ id: 'PedidoDeOperacao' });

/** O resultado que o coletor manda de uma operação. */
export const ResultadoDoPedido = z
  .object({
    categorias: z
      .array(
        z
          .object({
            categoria: z.string(),
            situacao: z.enum(['ok', 'erro', 'pulado']),
          })
          .catchall(z.union([z.number(), z.string(), z.array(z.string())])),
      )
      .max(30),
  })
  .meta({ id: 'ResultadoDoPedido' });

/** O arquivo guardado na memória para o comparador. */
export const ArquivoParaComparar = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    pessoas: z.number().int(),
    cartoes: z.number().int(),
  })
  .meta({ id: 'ArquivoParaComparar' });

const LadoDoComparador = z.union([z.object({ backup: z.uuid() }), z.object({ arquivo: z.uuid() })]);

export const PedidoDoComparador = z
  .object({ a: LadoDoComparador, b: LadoDoComparador })
  .meta({ id: 'PedidoDoComparador' });

const Registro = z.object({ id: z.string(), nome: z.string() });

export const ComparacaoDeBackups = z
  .object({
    a: z.string(),
    b: z.string(),
    tabelas: z.array(
      z.object({
        tabela: z.string(),
        rotulo: z.string(),
        identicos: z.number().int(),
        divergentes: z.array(
          Registro.extend({
            campos: z.array(z.object({ campo: z.string(), a: z.string(), b: z.string() })),
          }),
        ),
        soEmA: z.array(Registro),
        soEmB: z.array(Registro),
      }),
    ),
  })
  .meta({ id: 'ComparacaoDeBackups' });

/** Os controles com o backup ligado que a conta vê, para escolher o destino da restauração. */
export const ControlesComBackup = z
  .object({ controles: z.array(ControleDoBackup) })
  .meta({ id: 'ControlesComBackup' });
