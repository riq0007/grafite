// Os esquemas da importação no contrato da API (spec importacao-de-ativos; design do P1e, decisões 3
// e 5).
import { ACOES_DA_LINHA, SITUACOES_DA_IMPORTACAO } from '@grafite/domain';
import { z } from 'zod';
import { Cursor, Limite } from '../paginacao.ts';

const TotaisDaImportacao = z
  .object({
    novos: z.number().int(),
    alterados: z.number().int(),
    semMudanca: z.number().int(),
    comErro: z.number().int(),
  })
  .meta({ id: 'TotaisDaImportacao' });

const ErroDaLinha = z.object({
  /** O rótulo do campo, ou `null` na recusa da linha inteira. */
  campo: z.string().nullable(),
  mensagem: z.string(),
});

const TipoDaImportacao = z.object({ id: z.uuid(), nome: z.string() });

export const ImportacaoNaLista = z
  .object({
    id: z.uuid(),
    nomeDoArquivo: z.string(),
    tipo: TipoDaImportacao,
    situacao: z.enum(SITUACOES_DA_IMPORTACAO),
    linhas: z.number().int(),
    processadas: z.number().int(),
    totais: TotaisDaImportacao,
    /** ISO 8601. */
    criadaEm: z.string(),
    /** ISO 8601, ou `null` antes do fim. */
    concluidaEm: z.string().nullable(),
  })
  .meta({ id: 'ImportacaoNaLista' });

export const ListaDeImportacoes = z
  .object({ itens: z.array(ImportacaoNaLista), proximo: z.string().nullable() })
  .meta({ id: 'ListaDeImportacoes' });

/** Um campo que uma coluna pode receber. */
const CampoDaImportacao = z.object({
  chave: z.string(),
  rotulo: z.string(),
  grupo: z.string(),
  restrito: z.boolean(),
});

const ColunaDaImportacao = z.object({
  titulo: z.string(),
  /** A chave do campo, ou `null` em "Ignorar". */
  campo: z.string().nullable(),
  /** Até três valores da coluna, como texto, para ajudar a escolher o campo. */
  exemplos: z.array(z.string()),
});

export const Importacao = ImportacaoNaLista.extend({
  colunas: z.array(ColunaDaImportacao),
  /** Os campos que as colunas podem receber, na ordem da ficha. */
  campos: z.array(CampoDaImportacao),
  /** ISO 8601, ou `null` antes de importar. */
  aplicadaEm: z.string().nullable(),
}).meta({ id: 'Importacao' });

export const PedidoDasColunas = z.object({
  colunas: z.array(z.string().nullable(), { error: 'Escolha o campo de cada coluna.' }).max(200),
});

export const LinhaDaPrevia = z
  .object({
    linha: z.number().int(),
    acao: z.enum(ACOES_DA_LINHA),
    /** O ativo casado, quando a conta pode vê-lo. */
    ativo: z
      .object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() })
      .nullable(),
    mudancas: z.array(
      z.object({ campo: z.string(), antes: z.string().nullable(), depois: z.string().nullable() }),
    ),
    seguros: z.array(z.object({ campo: z.string(), motivo: z.enum(['Travado', 'Só manual']) })),
    erros: z.array(ErroDaLinha),
  })
  .meta({ id: 'LinhaDaPrevia' });

export const PreviaDaImportacao = z
  .object({
    /** Os totais da planilha inteira, com qualquer filtro. */
    totais: TotaisDaImportacao,
    linhas: z.array(LinhaDaPrevia),
    proximo: z.string().nullable(),
  })
  .meta({ id: 'PreviaDaImportacao' });

export const FiltrosDaPrevia = z.object({
  acao: z
    .enum(ACOES_DA_LINHA, { error: 'Filtre por novo, alterar, sem mudança ou com erro.' })
    .optional(),
  cursor: Cursor.optional(),
  limite: Limite,
});

export const FiltrosDasImportacoes = z.object({ cursor: Cursor.optional(), limite: Limite });

/** Uma linha que a aplicação não gravou, com as recusas. */
const LinhaComErro = z.object({ linha: z.number().int(), mensagens: z.array(ErroDaLinha) });

export const ErrosDaImportacao = z
  .object({ itens: z.array(LinhaComErro), proximo: z.string().nullable() })
  .meta({ id: 'ErrosDaImportacao' });

export const ParametrosDaImportacao = z.object({
  id: z.uuid({ error: 'Importação não encontrada.' }),
});

export const EnvioDaPlanilha = z.object({
  tipoId: z.uuid({ error: 'Escolha o tipo dos ativos da planilha.' }),
  nome: z.string().max(1_000, { error: 'Use um nome de até 200 caracteres.' }).optional(),
});
