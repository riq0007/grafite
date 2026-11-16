// Os tipos de chamado de fábrica no banco (spec tipos-de-chamado, "Tipos de fábrica"; change
// chamados-da-ti, design, decisão 6): as linhas que saem da lista do domínio, Em uso e na ordem
// dela, a gravação delas na organização nova, pelo `organizacao criar`, e o texto da migration que
// as grava nas organizações que já existiam. As tabelas e as colunas vêm do schema, e o teste ao
// lado confere a migration contra a lista, para as duas não se afastarem.
import { organizacoes, type Transacao, tiposDeChamado } from '@grafite/db';
import {
  normalizarTexto,
  TIPOS_DE_CHAMADO_DE_FABRICA,
  type TipoDeChamadoDeFabrica,
} from '@grafite/domain';
import { getTableColumns, getTableName, sql } from 'drizzle-orm';
import { type Ator, registrarNaAuditoria } from '../auditoria.ts';
import { lerTiposDeChamado, visaoDoTipoDeChamado } from './tipos.ts';

/**
 * A linha de um tipo de fábrica, sem a organização. Quem atende por padrão e o tipo de ativo do
 * equipamento são de cada organização, e a migration não os conhece.
 */
function linha(tipo: TipoDeChamadoDeFabrica, ordem: number) {
  if (tipo.atendePorPadrao !== null || tipo.tipoDeAtivoDoEquipamento !== null) {
    throw new Error(
      `O tipo de fábrica ${tipo.nome} não pode ter quem atende por padrão nem o tipo de ativo do equipamento.`,
    );
  }
  return {
    nome: tipo.nome,
    nomeNormalizado: normalizarTexto(tipo.nome),
    icone: tipo.icone,
    frase: tipo.frase,
    situacao: 'em-uso' as const,
    ordem,
    respostaValor: tipo.prazo.resposta.valor,
    respostaUnidade: tipo.prazo.resposta.unidade,
    resolucaoValor: tipo.prazo.resolucao.valor,
    resolucaoUnidade: tipo.prazo.resolucao.unidade,
    modo: tipo.prazo.modo,
    semNinguem: tipo.semNinguem,
    podeVirarOs: tipo.podeVirarOs,
    geraSolicitacao: tipo.geraSolicitacao,
    pedeOAtivo: tipo.pedeOAtivo,
    apareceParaOColaborador: tipo.apareceParaOColaborador,
    soATiAbre: tipo.soATiAbre,
    formulario: tipo.formulario,
  };
}

export type LinhaDoTipoDeFabrica = ReturnType<typeof linha>;

/** As linhas dos tipos de fábrica, na ordem da lista, de 1 em diante. */
export function linhasDosTiposDeFabrica(
  tipos: readonly TipoDeChamadoDeFabrica[] = TIPOS_DE_CHAMADO_DE_FABRICA,
): LinhaDoTipoDeFabrica[] {
  return tipos.map((tipo, posicao) => linha(tipo, posicao + 1));
}

/**
 * Grava os tipos de fábrica na organização do contexto, que o `organizacao criar` acabou de criar,
 * com uma `tipo-de-chamado.criado` por tipo na auditoria, na ordem, com a visão do tipo que as
 * gravações da API também registram.
 */
export async function criarTiposDeFabrica(
  tx: Transacao,
  { ator, momento }: { ator: Ator; momento: Date },
): Promise<number> {
  await tx.insert(tiposDeChamado).values(
    linhasDosTiposDeFabrica().map((de) => ({
      ...de,
      orgId: sql`app.current_org()`,
      formulario: { ...de.formulario },
      criadoEm: momento,
    })),
  );
  const criados = await lerTiposDeChamado(tx, momento);
  for (const tipo of criados) {
    await registrarNaAuditoria(tx, {
      acao: 'tipo-de-chamado.criado',
      ator,
      alvo: { tipo: 'tipo-de-chamado', id: tipo.id },
      depois: visaoDoTipoDeChamado(tipo),
      momento,
    });
  }
  return criados.length;
}

const aspas = (nome: string) => `"${nome}"`;

/** O valor no SQL: o texto entre apóstrofos, com o apóstrofo dobrado, e o formulário em JSON. */
function literal(valor: string | number | boolean | object): string {
  if (typeof valor === 'string') return `'${valor.replaceAll("'", "''")}'`;
  if (typeof valor === 'object') return `${literal(JSON.stringify(valor))}::jsonb`;
  return String(valor);
}

/**
 * O texto da migration que grava os tipos em cada organização que já existe. O RLS das duas
 * tabelas fica solto só durante a gravação, porque o dono grava em todas as organizações de uma vez.
 */
export function sqlDosTiposDeFabrica(
  tipos: readonly TipoDeChamadoDeFabrica[] = TIPOS_DE_CHAMADO_DE_FABRICA,
): string {
  const linhas = linhasDosTiposDeFabrica(tipos);
  const colunasDoTipo = getTableColumns(tiposDeChamado);
  // O formulário vai por último e na linha de baixo, porque o JSON é longo.
  const escalares = (Object.keys(linhas[0] ?? {}) as (keyof LinhaDoTipoDeFabrica)[]).filter(
    (chave) => chave !== 'formulario',
  );
  const colunas = [...escalares, 'formulario' as const]
    .map((chave) => aspas(colunasDoTipo[chave].name))
    .join(', ');
  const valores = linhas
    .map(
      (de) =>
        `    (${escalares.map((chave) => literal(de[chave])).join(', ')},\n      ${literal(de.formulario)})`,
    )
    .join(',\n');
  const tabela = aspas(getTableName(tiposDeChamado));
  const orgs = aspas(getTableName(organizacoes));
  return [
    '-- Os tipos de chamado de fábrica nas organizações que já existem (spec tipos-de-chamado, "Tipos de',
    '-- fábrica"; change chamados-da-ti, design, decisão 6), gerados da lista do domínio pelo',
    '-- apps/api/src/chamados/fabrica.ts. Não edite à mão: o teste dele confere este texto.',
    `ALTER TABLE ${orgs} NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint`,
    `ALTER TABLE ${tabela} NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint`,
    `INSERT INTO ${tabela} (${aspas(colunasDoTipo.orgId.name)}, ${colunas})`,
    `  SELECT ${orgs}.${aspas(getTableColumns(organizacoes).id.name)}, "de_fabrica".*`,
    `  FROM ${orgs}`,
    '  CROSS JOIN (VALUES',
    valores,
    `  ) AS "de_fabrica"(${colunas});--> statement-breakpoint`,
    `ALTER TABLE ${orgs} FORCE ROW LEVEL SECURITY;--> statement-breakpoint`,
    `ALTER TABLE ${tabela} FORCE ROW LEVEL SECURITY;`,
    '',
  ].join('\n');
}
