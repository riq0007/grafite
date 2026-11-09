// A tabela dos ativos no banco (spec cadastro-de-ativos; design do P1c, decisões 3 e 4): as colunas
// que a conta pode usar, a partir do catálogo, e o SQL de cada filtro sobre todos os ativos que ela
// vê. Os campos comuns que o banco guarda em colunas são lidos delas; os outros, do JSONB dos valores,
// pela chave. Num campo restrito, o filtro só considera os ativos em que a conta vê os restritos.
import { ativos, camposDoTipo, modelos, pessoas, type Transacao, tiposDeAtivo } from '@grafite/db';
import {
  type ArvoreDeLocais,
  alcance,
  type ColunaDosAtivos,
  colunasDosAtivos,
  conferirFiltro,
  type DirecaoDaOrdem,
  type FiltroDaVisao,
  LIMITES_DA_VISAO,
  lerDefinicaoDaVisao,
  normalizarTexto,
  podeEm,
} from '@grafite/domain';
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { contendo } from '../busca.ts';
import {
  COLUNA_DO_CONTROL_ID,
  type LoginsNoBanco,
  lerLoginsNoBanco,
  ordemDoControlId,
  SEM_LOGINS,
  situacaoDoControlIdNoBanco,
} from '../coleta/control-id.ts';
import {
  COLUNA_DA_DISPONIBILIDADE,
  ordemDaDisponibilidade,
  situacaoNoBanco,
} from '../coleta/disponibilidade.ts';
import {
  COLUNA_DAS_PAGINAS,
  COLUNA_DOS_SUPRIMENTOS,
  menorNivelNoBanco,
  totalDePaginasNoBanco,
} from '../coleta/suprimentos.ts';
import { dadosInvalidos } from '../problemas.ts';
import { camposDaOrganizacao } from './escrita.ts';
import type { AtivoNaLista, ListaDeAtivos } from './esquemas.ts';
import { referenciasDos } from './leitura.ts';

/**
 * As letras que a forma sem acento troca no banco, e a troca de cada uma: as do Latin-1 e do Latin
 * Extended-A que o `normalizarTexto` muda para uma letra só, como "Ç" para "c" e "Ø" para "ø". O
 * `lower` do banco cuida das maiúsculas sem acento, em qualquer `LC_CTYPE`.
 */
function letrasTrocadas(): { de: string; para: string } {
  let de = '';
  let para = '';
  for (let codigo = 0xc0; codigo <= 0x17f; codigo++) {
    const letra = String.fromCodePoint(codigo);
    const forma = normalizarTexto(letra);
    if (forma.length === 1 && forma !== letra) {
      de += letra;
      para += forma;
    }
  }
  return { de, para };
}

export const { de: ACENTUADAS, para: SEM_ACENTO } = letrasTrocadas();

/** O texto sem acento e em minúsculas, no banco, como o `normalizarTexto` faz na aplicação. */
export const semAcento = (texto: SQL) =>
  sql`lower(translate(${texto}, ${ACENTUADAS}, ${SEM_ACENTO}))`;

/** O nome que o ativo mostra: o nome, o fabricante e o modelo, ou o nome do tipo. */
export const rotuloNoBanco = sql`coalesce(nullif(btrim(${ativos.nome}), ''), ${modelos.fabricante} || ' ' || ${modelos.nome}, ${tiposDeAtivo.nome})`;

/** As colunas da tabela `ativos` que guardam um campo comum, pela chave do campo. */
const NAS_COLUNAS: Record<string, SQL> = {
  // As colunas coletadas numéricas, pelas subconsultas no estado atual (change p2b).
  [COLUNA_DOS_SUPRIMENTOS]: menorNivelNoBanco,
  [COLUNA_DAS_PAGINAS]: totalDePaginasNoBanco,
  'ativo.patrimonio': sql`${ativos.patrimonio}`,
  'ativo.serie': sql`${ativos.serie}`,
  'ativo.hostname': sql`${ativos.hostname}`,
  'ativo.local': sql`${ativos.localId}`,
  'ativo.responsavel': sql`${ativos.responsavelId}`,
  'ativo.modelo': sql`${ativos.modeloId}`,
  'ativo.tipo': sql`${ativos.tipoId}`,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O que a lista precisa para montar o SQL das colunas da conta. */
export interface ContextoDaTabela {
  /** As colunas que a conta pode usar, pela chave. */
  colunas: ReadonlyMap<string, ColunaDosAtivos>;
  arvore: ArvoreDeLocais;
  /** Os ativos em que a conta vê os campos restritos. */
  veRestritos: SQL;
  /** O fuso dos dias do cadastro e da última mudança. */
  fuso: string;
  /** Os logins do Control iD, para a situação da coluna dele no banco. */
  loginsDoControlId: LoginsNoBanco;
}

/** As colunas da tabela dos ativos a partir do catálogo, com as dos restritos se `verRestritos`. */
export async function colunasDoCatalogo(
  tx: Transacao,
  verRestritos: boolean,
): Promise<ColunaDosAtivos[]> {
  const tipos = await tx
    .select({
      id: tiposDeAtivo.id,
      situacao: tiposDeAtivo.situacao,
      capacidades: tiposDeAtivo.capacidades,
    })
    .from(tiposDeAtivo);
  const ligacoes = await tx
    .select({
      tipoId: camposDoTipo.tipoId,
      campoId: camposDoTipo.campoId,
      obrigatorio: camposDoTipo.obrigatorio,
    })
    .from(camposDoTipo)
    .orderBy(asc(camposDoTipo.ordem));
  return colunasDosAtivos({
    tipos: tipos.map((tipo) => ({
      situacao: tipo.situacao,
      capacidades: tipo.capacidades,
      campos: ligacoes.filter((ligacao) => ligacao.tipoId === tipo.id),
    })),
    campos: await camposDaOrganizacao(tx),
    verRestritos,
  });
}

/** As colunas da conta, a partir do catálogo, e onde ela vê os restritos. */
export async function lerContextoDaTabela(
  tx: Transacao,
  sessao: SessaoDaRequisicao,
  arvore: ArvoreDeLocais,
  fuso: string,
): Promise<ContextoDaTabela> {
  const alcanceDosRestritos = alcance(sessao.acesso, 'ativos.restritos', arvore);
  const colunas = await colunasDoCatalogo(tx, alcanceDosRestritos !== null);
  const loginsDoControlId = colunas.some((coluna) => coluna.chave === COLUNA_DO_CONTROL_ID)
    ? await lerLoginsNoBanco(tx)
    : SEM_LOGINS;
  return {
    colunas: new Map(colunas.map((coluna) => [coluna.chave, coluna])),
    arvore,
    veRestritos:
      alcanceDosRestritos === 'organizacao'
        ? sql`true`
        : alcanceDosRestritos && alcanceDosRestritos.size > 0
          ? inArray(ativos.localId, [...alcanceDosRestritos])
          : sql`false`,
    fuso,
    loginsDoControlId,
  };
}

/** O valor guardado no JSONB, como texto. */
const noJsonb = (chave: string) => sql`(${ativos.valores} ->> ${chave})`;

/** O valor da coluna como o banco o guarda: a coluna da tabela ou o texto do JSONB. */
function valorGuardado(coluna: ColunaDosAtivos): SQL {
  return NAS_COLUNAS[coluna.chave] ?? noJsonb(coluna.chave);
}

/** O valor como texto, para o "contém". */
function valorEmTexto(coluna: ColunaDosAtivos): SQL {
  return coluna.chave === 'ativo.rotulo' ? rotuloNoBanco : valorGuardado(coluna);
}

/** O momento da coluna do registro. */
const momentoDa = (coluna: ColunaDosAtivos) =>
  coluna.chave === 'ativo.criado-em' ? sql`${ativos.criadoEm}` : sql`${ativos.atualizadoEm}`;

/** A lista de valores como `array[...]::text[]`. */
const comoArray = (valores: readonly string[]) =>
  sql`array[${sql.join(
    valores.map((valor) => sql`${valor}`),
    sql`, `,
  )}]::text[]`;

/** Os ids que a coluna guarda como uuid: o valor que não é um id não casa com nada. */
function entreOsIds(expressao: SQL, valores: readonly string[]): SQL {
  const validos = valores.filter((valor) => UUID.test(valor)).map((valor) => valor.toLowerCase());
  return validos.length > 0 ? sql`${expressao} in ${validos}` : sql`false`;
}

function condicaoDeSituacao(
  situacao: Extract<FiltroDaVisao, { operador: 'situacao' }>['situacao'],
) {
  switch (situacao) {
    case 'ativos':
      return eq(ativos.situacao, 'ativo');
    case 'inativos':
      return eq(ativos.situacao, 'inativo');
    case 'todos':
      return sql`true`;
    default:
      return and(eq(ativos.situacao, 'ativo'), eq(ativos.uso, situacao)) as SQL;
  }
}

/** A condição de um filtro já conferido contra a coluna. */
function condicaoDoFiltro(
  filtro: FiltroDaVisao,
  coluna: ColunaDosAtivos,
  contexto: ContextoDaTabela,
): SQL {
  const nasColunas = NAS_COLUNAS[coluna.chave];
  switch (filtro.operador) {
    case 'contem':
      return sql`${semAcento(valorEmTexto(coluna))} like ${contendo(normalizarTexto(filtro.texto))}`;
    case 'vazio':
      return nasColunas
        ? (isNull(nasColunas) as SQL)
        : sql`${ativos.valores} -> ${coluna.chave} is null`;
    case 'preenchido':
      return nasColunas
        ? (isNotNull(nasColunas) as SQL)
        : sql`${ativos.valores} -> ${coluna.chave} is not null`;
    case 'entre': {
      const partes: SQL[] = [];
      if (coluna.filtro === 'momento') {
        const momento = momentoDa(coluna);
        if (filtro.de !== undefined) {
          partes.push(
            sql`${momento} >= (${filtro.de}::date)::timestamp at time zone ${contexto.fuso}`,
          );
        }
        if (filtro.ate !== undefined) {
          partes.push(
            sql`${momento} < ((${filtro.ate}::date + 1)::timestamp at time zone ${contexto.fuso})`,
          );
        }
      } else {
        const valor =
          coluna.filtro === 'numero'
            ? sql`${valorGuardado(coluna)}::numeric`
            : valorGuardado(coluna);
        if (filtro.de !== undefined) partes.push(sql`${valor} >= ${filtro.de}`);
        if (filtro.ate !== undefined) partes.push(sql`${valor} <= ${filtro.ate}`);
      }
      return and(...partes) as SQL;
    }
    case 'qualquer':
      if (coluna.chave === COLUNA_DA_DISPONIBILIDADE) {
        return sql`${situacaoNoBanco} in ${filtro.valores}`;
      }
      if (coluna.chave === COLUNA_DO_CONTROL_ID) {
        return sql`${situacaoDoControlIdNoBanco(contexto.loginsDoControlId)} in ${filtro.valores}`;
      }
      if (nasColunas) return entreOsIds(nasColunas, filtro.valores);
      if (coluna.campo?.tipo === 'lista-multipla') {
        return sql`${ativos.valores} -> ${coluna.chave} ?| ${comoArray(filtro.valores)}`;
      }
      return sql`${valorGuardado(coluna)} in ${filtro.valores}`;
    case 'em':
    case 'igual': {
      const local = filtro.local.toLowerCase();
      const locais = filtro.operador === 'em' ? [...contexto.arvore.ramo(local)] : [local];
      return nasColunas
        ? entreOsIds(nasColunas, locais)
        : sql`${valorGuardado(coluna)} in ${locais}`;
    }
    case 'situacao':
      return condicaoDeSituacao(filtro.situacao);
  }
}

/** Como a contagem lê a coluna: um valor por ativo, ou as opções marcadas de uma lista múltipla. */
export type ValorDaContagem = { tipo: 'um'; expressao: SQL } | { tipo: 'varios'; expressao: SQL };

/**
 * O valor da coluna de escolha para a contagem (change filtros-e-barra-da-tabela, design, decisão
 * 2): o tipo, o modelo, os campos de lista e de lista múltipla e a disponibilidade. As pessoas, com
 * centenas de opções, vão pela busca, sem contagem; as outras colunas não têm. Num campo restrito,
 * o valor vale só onde a conta vê os restritos.
 */
export function valorDaContagem(
  coluna: ColunaDosAtivos,
  contexto: ContextoDaTabela,
): ValorDaContagem | null {
  if (coluna.filtro !== 'escolha') return null;
  const restrito = (expressao: SQL) =>
    coluna.restrita ? sql`(case when ${contexto.veRestritos} then ${expressao} end)` : expressao;
  if (coluna.chave === COLUNA_DA_DISPONIBILIDADE) return { tipo: 'um', expressao: situacaoNoBanco };
  if (coluna.chave === COLUNA_DO_CONTROL_ID) {
    return { tipo: 'um', expressao: situacaoDoControlIdNoBanco(contexto.loginsDoControlId) };
  }
  if (coluna.chave === 'ativo.tipo' || coluna.chave === 'ativo.modelo') {
    return { tipo: 'um', expressao: sql`(${NAS_COLUNAS[coluna.chave]})::text` };
  }
  if (coluna.campo?.tipo === 'lista')
    return { tipo: 'um', expressao: restrito(noJsonb(coluna.chave)) };
  if (coluna.campo?.tipo === 'lista-multipla') {
    const opcoes = sql`(${ativos.valores} -> ${coluna.chave})`;
    return {
      tipo: 'varios',
      expressao: restrito(
        sql`(case when jsonb_typeof(${opcoes}) = 'array' then ${opcoes} else '[]'::jsonb end)`,
      ),
    };
  }
  return null;
}

/** Lê o parâmetro `filtros`: o JSON da lista, com a forma conferida pelo domínio. */
export function lerFiltrosPedidos(bruto: string | undefined): FiltroDaVisao[] {
  if (bruto === undefined || bruto.trim() === '') return [];
  let lista: unknown;
  try {
    lista = JSON.parse(bruto);
  } catch {
    throw dadosInvalidos({ filtros: 'Os filtros não são válidos.' });
  }
  const lida = lerDefinicaoDaVisao({ colunas: [], ordenacao: null, filtros: lista });
  if (!lida.ok) {
    throw dadosInvalidos({
      filtros:
        lida.erro === 'A definição da visão não é válida.'
          ? 'Os filtros não são válidos.'
          : lida.erro,
    });
  }
  return lida.definicao.filtros;
}

/**
 * As condições dos filtros pedidos. O filtro de uma coluna que a conta não pode usar fica de fora,
 * como na web; o que não vale para a coluna é recusado com 400 em `filtros`. Num campo restrito, a
 * condição vale só nos ativos em que a conta vê os restritos.
 */
export function condicoesDosFiltros(
  filtros: readonly FiltroDaVisao[],
  contexto: ContextoDaTabela,
): SQL[] {
  const condicoes: SQL[] = [];
  for (const filtro of filtros) {
    const coluna = contexto.colunas.get(filtro.chave);
    if (!coluna) continue;
    const recusa = conferirFiltro(filtro, coluna);
    if (recusa) throw dadosInvalidos({ filtros: recusa });
    const condicao = condicaoDoFiltro(filtro, coluna, contexto);
    condicoes.push(coluna.restrita ? (and(contexto.veRestritos, condicao) as SQL) : condicao);
  }
  return condicoes;
}

/** As chaves pedidas em `colunas`, separadas por vírgula: sem repetir e até 60. */
export function lerColunasPedidas(bruto: string | undefined): string[] {
  if (bruto === undefined) return [];
  const chaves = [
    ...new Set(
      bruto
        .split(',')
        .map((chave) => chave.trim())
        .filter((chave) => chave !== ''),
    ),
  ];
  if (chaves.length > LIMITES_DA_VISAO.colunas) {
    throw dadosInvalidos({ colunas: 'Use até 60 colunas.' });
  }
  return chaves;
}

/** As chaves dos campos restritos entre as colunas da conta. */
export function chavesRestritas(contexto: ContextoDaTabela): Set<string> {
  return new Set(
    [...contexto.colunas.values()]
      .filter((coluna) => coluna.restrita)
      .map((coluna) => coluna.chave),
  );
}

/**
 * Os nomes atuais dos registros que a página e os filtros apontam: as pessoas, os locais e os
 * ativos dos valores das colunas pedidas, e os das escolhas dos filtros, com os modelos.
 */
export async function referenciasDaLista(
  tx: Transacao,
  itens: readonly z.infer<typeof AtivoNaLista>[],
  filtros: readonly FiltroDaVisao[],
  contexto: ContextoDaTabela,
  sessao: SessaoDaRequisicao,
): Promise<z.infer<typeof ListaDeAtivos>['referencias']> {
  const tipoDa = (chave: string) => contexto.colunas.get(chave)?.campo?.tipo;
  const apontados: Record<string, string[]> = {};
  const juntar = (chave: string, valores: readonly unknown[]) => {
    const ids = valores.filter(
      (valor): valor is string => typeof valor === 'string' && UUID.test(valor),
    );
    if (ids.length > 0) apontados[chave] = [...(apontados[chave] ?? []), ...ids];
  };
  for (const item of itens) {
    for (const [chave, valor] of Object.entries(item.valores)) {
      const tipo = tipoDa(chave);
      if (
        tipo === 'pessoa' ||
        tipo === 'local' ||
        tipo === 'ativo' ||
        tipo === 'fornecedor' ||
        tipo === 'arquivo' ||
        tipo === 'imagem'
      ) {
        juntar(chave, Array.isArray(valor) ? valor : [valor]);
      }
    }
  }
  const modelosEscolhidos: string[] = [];
  for (const filtro of filtros) {
    if (!contexto.colunas.has(filtro.chave)) continue;
    if (filtro.operador === 'em' || filtro.operador === 'igual') {
      juntar(filtro.chave, [filtro.local]);
    }
    if (filtro.operador !== 'qualquer') continue;
    if (filtro.chave === 'ativo.modelo') {
      modelosEscolhidos.push(...filtro.valores.filter((valor) => UUID.test(valor)));
    } else if (tipoDa(filtro.chave) === 'pessoa' || tipoDa(filtro.chave) === 'fornecedor') {
      juntar(filtro.chave, filtro.valores);
    }
  }
  const referencias = await referenciasDos(tx, apontados, tipoDa, contexto.arvore, (localId) =>
    podeEm(sessao.acesso, 'ativos.ver', localId, contexto.arvore),
  );
  const nomesDosModelos =
    modelosEscolhidos.length > 0
      ? await tx
          .select({
            id: modelos.id,
            fabricante: modelos.fabricante,
            nome: modelos.nome,
            tipoId: modelos.tipoId,
          })
          .from(modelos)
          .where(inArray(modelos.id, modelosEscolhidos))
      : [];
  return {
    ...referencias,
    modelos: Object.fromEntries(
      nomesDosModelos.map((modelo) => [modelo.id, `${modelo.fabricante} ${modelo.nome}`]),
    ),
    tiposDosModelos: Object.fromEntries(
      nomesDosModelos.map((modelo) => [modelo.id, modelo.tipoId]),
    ),
  };
}

/** O tipo do banco com que o valor da chave da ordem volta do cursor. */
type TipoDaOrdem = 'text' | 'numeric' | 'timestamptz' | 'inet';

/** A ordem pedida: a expressão da chave, o tipo dela e a direção. */
export interface OrdemDaLista {
  expressao: SQL;
  tipo: TipoDaOrdem;
  direcao: DirecaoDaOrdem;
}

/** Os ids dos locais na ordem dos caminhos: o pai antes dos filhos, e os irmãos pelo nome. */
function locaisNaOrdem(arvore: ArvoreDeLocais): string[] {
  const ordem: string[] = [];
  const visitar = (paiId: string | null) => {
    for (const filho of arvore.filhos(paiId)) {
      ordem.push(filho.id);
      visitar(filho.id);
    }
  };
  visitar(null);
  return ordem;
}

/** A chave da ordem de cada coluna que ordena, pelo que ela mostra. */
function chaveDaOrdem(
  coluna: ColunaDosAtivos,
  contexto: ContextoDaTabela,
): { expressao: SQL; tipo: TipoDaOrdem } | null {
  if (!coluna.ordena) return null;
  if (coluna.chave === COLUNA_DA_DISPONIBILIDADE) {
    return { expressao: ordemDaDisponibilidade, tipo: 'numeric' };
  }
  if (coluna.chave === COLUNA_DO_CONTROL_ID) {
    return { expressao: ordemDoControlId(contexto.loginsDoControlId), tipo: 'numeric' };
  }
  const posicaoDoLocal = (local: SQL) =>
    sql`array_position(${comoArray(locaisNaOrdem(contexto.arvore))}, ${local})`;
  switch (coluna.chave) {
    case 'ativo.rotulo':
      return { expressao: semAcento(rotuloNoBanco), tipo: 'text' };
    case 'ativo.tipo':
      return { expressao: semAcento(sql`${tiposDeAtivo.nome}`), tipo: 'text' };
    case 'ativo.modelo':
      return {
        expressao: semAcento(sql`${modelos.fabricante} || ' ' || ${modelos.nome}`),
        tipo: 'text',
      };
    case 'ativo.situacao':
      return {
        expressao: sql`case when ${ativos.situacao} = 'inativo' then 3 when ${ativos.uso} = 'em-uso' then 0 when ${ativos.uso} = 'em-estoque' then 1 else 2 end`,
        tipo: 'numeric',
      };
    case 'ativo.criado-em':
      return { expressao: sql`${ativos.criadoEm}`, tipo: 'timestamptz' };
    case 'ativo.atualizado-em':
      return { expressao: sql`${ativos.atualizadoEm}`, tipo: 'timestamptz' };
    case 'ativo.responsavel':
      return { expressao: semAcento(sql`${pessoas.nome}`), tipo: 'text' };
    case 'ativo.local':
      return { expressao: posicaoDoLocal(sql`${ativos.localId}::text`), tipo: 'numeric' };
  }
  const guardado = valorGuardado(coluna);
  switch (coluna.campo?.tipo) {
    case 'inteiro':
    case 'decimal':
    case 'moeda':
      return { expressao: sql`${guardado}::numeric`, tipo: 'numeric' };
    case 'ip':
      return { expressao: sql`${guardado}::inet`, tipo: 'inet' };
    case 'data':
      return { expressao: guardado, tipo: 'text' };
    case 'lista': {
      const opcoes = (coluna.campo.configuracao?.opcoes ?? []).map((opcao) => opcao.id);
      return { expressao: sql`array_position(${comoArray(opcoes)}, ${guardado})`, tipo: 'numeric' };
    }
    case 'pessoa':
      return {
        expressao: semAcento(
          sql`(select p.nome from pessoas p where p.org_id = ${ativos.orgId} and p.id::text = ${guardado})`,
        ),
        tipo: 'text',
      };
    case 'fornecedor':
      return {
        expressao: semAcento(
          sql`(select f.nome from fornecedores f where f.org_id = ${ativos.orgId} and f.id::text = ${guardado})`,
        ),
        tipo: 'text',
      };
    case 'local':
      return { expressao: posicaoDoLocal(guardado), tipo: 'numeric' };
    default:
      return { expressao: semAcento(guardado), tipo: 'text' };
  }
}

/**
 * A ordem pedida, ou `null` para a ordem do cadastro: a coluna que não ordena e a que a conta não
 * tem ficam de fora. Num campo restrito, o valor que a conta não vê conta como vazio.
 */
export function ordemPedida(
  chave: string | undefined,
  direcao: DirecaoDaOrdem | undefined,
  contexto: ContextoDaTabela,
): OrdemDaLista | null {
  const coluna = chave ? contexto.colunas.get(chave) : undefined;
  const daColuna = coluna ? chaveDaOrdem(coluna, contexto) : null;
  if (!coluna || !daColuna) return null;
  return {
    expressao: coluna.restrita
      ? sql`(case when ${contexto.veRestritos} then ${daColuna.expressao} end)`
      : daColuna.expressao,
    tipo: daColuna.tipo,
    direcao: direcao ?? 'crescente',
  };
}

/** A ordem da consulta: a chave, com os vazios no fim nas duas direções, e os mais novos primeiro. */
export function ordenacaoDaConsulta(ordem: OrdemDaLista): SQL[] {
  return [
    ordem.direcao === 'crescente'
      ? sql`${ordem.expressao} asc nulls last`
      : sql`${ordem.expressao} desc nulls last`,
    sql`${ativos.id} desc`,
  ];
}

/** A chave da ordem como o cursor a guarda: o texto do valor, que volta pelo tipo dela. */
export const valorDaOrdem = (ordem: OrdemDaLista) => sql<string | null>`(${ordem.expressao})::text`;

/**
 * Os ativos depois do último da página, na ordem pedida: os que vêm depois pela chave, os que têm a
 * mesma chave e o id menor, e os vazios, que ficam no fim. Depois de um vazio, só os vazios seguintes.
 */
export function depoisDoCursor(ordem: OrdemDaLista, [valor, id]: readonly [string | null, string]) {
  const anterior = lt(ativos.id, id);
  if (valor === null) return and(sql`${ordem.expressao} is null`, anterior) as SQL;
  const comparado = sql`(${valor})::${sql.raw(ordem.tipo)}`;
  const adiante =
    ordem.direcao === 'crescente'
      ? sql`${ordem.expressao} > ${comparado}`
      : sql`${ordem.expressao} < ${comparado}`;
  return or(
    adiante,
    and(sql`${ordem.expressao} = ${comparado}`, anterior),
    sql`${ordem.expressao} is null`,
  ) as SQL;
}
