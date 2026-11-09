// A leitura dos ativos (spec cadastro-de-ativos; design do P1b, decisões 6, 7 e 8): a linha do ativo
// com o tipo, o modelo e o responsável; o item da lista; e a ficha, com os valores pela chave, o
// estado com o nome do autor, as referências pelo nome atual e os campos restritos só para quem
// pode vê-los no local do ativo.
import {
  arquivos,
  ativos,
  campos,
  coletores,
  contas,
  fornecedores,
  modelos,
  pessoas,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  alcance,
  CAMPOS_DO_ATIVO,
  type EstadoDoCampo,
  pode,
  podeEm,
  rotuloDoAtivo,
  type TipoDeCampo,
  type ValorDeCampo,
} from '@grafite/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { cofreLigadoNaOrganizacao, segredosDoAtivo } from '../cofre/no-ativo.ts';
import { controlIdDosAtivos } from '../coleta/control-id.ts';
import { disponibilidadeDosAtivos } from '../coleta/disponibilidade.ts';
import { suprimentosDosAtivos } from '../coleta/suprimentos.ts';
import { compativeisDoAtivo } from '../consumiveis/compativeis.ts';
import { naoEncontrado } from '../problemas.ts';
import type { AtivoLigado, AtivoNaLista, FichaDoAtivo } from './esquemas.ts';

export const ATIVO_FORA_DO_ACESSO = 'Ativo fora do seu acesso';

export const COLUNAS_DO_ATIVO = {
  ativo: ativos,
  tipo: { id: tiposDeAtivo.id, nome: tiposDeAtivo.nome, icone: tiposDeAtivo.icone },
  modelo: {
    id: modelos.id,
    fabricante: modelos.fabricante,
    nome: modelos.nome,
    imagemId: modelos.imagemId,
  },
  responsavel: {
    id: pessoas.id,
    nome: pessoas.nome,
    localId: pessoas.localId,
    situacao: pessoas.situacao,
  },
};

export const doTipo = and(eq(tiposDeAtivo.orgId, ativos.orgId), eq(tiposDeAtivo.id, ativos.tipoId));
export const doModelo = and(eq(modelos.orgId, ativos.orgId), eq(modelos.id, ativos.modeloId));
export const doResponsavel = and(
  eq(pessoas.orgId, ativos.orgId),
  eq(pessoas.id, ativos.responsavelId),
);

export interface LinhaDoAtivo {
  ativo: typeof ativos.$inferSelect;
  tipo: { id: string; nome: string; icone: (typeof tiposDeAtivo.$inferSelect)['icone'] };
  modelo: { id: string; fabricante: string; nome: string; imagemId: string | null } | null;
  /** O local e a situação, para saber se a conta vê a pessoa; não saem na resposta. */
  responsavel: {
    id: string;
    nome: string;
    localId: string | null;
    situacao: (typeof pessoas.$inferSelect)['situacao'];
  } | null;
}

/** A conta vê a pessoa responsável no local de trabalho dela, e ela não está anonimizada. */
export const veOResponsavel = (
  { responsavel }: Pick<LinhaDoAtivo, 'responsavel'>,
  sessao: SessaoDaRequisicao,
  arvore: ArvoreDeLocais,
) =>
  responsavel !== null &&
  responsavel.situacao !== 'anonimizada' &&
  podeEm(sessao.acesso, 'pessoas.ver', responsavel.localId, arvore);

/** A consulta do ativo com o tipo, o modelo e o responsável. */
export function consultarAtivos(tx: Transacao) {
  return tx
    .select(COLUNAS_DO_ATIVO)
    .from(ativos)
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo)
    .leftJoin(pessoas, doResponsavel);
}

/**
 * O ativo pelo id, ou 404. Com `travar`, a linha fica travada até o fim da transação: a edição
 * seguinte do mesmo ativo espera e grava sobre esta.
 */
export async function lerAtivo(
  tx: Transacao,
  id: string,
  { travar = false } = {},
): Promise<LinhaDoAtivo> {
  if (travar)
    await tx.select({ id: ativos.id }).from(ativos).where(eq(ativos.id, id)).for('update');
  const [linha] = await consultarAtivos(tx).where(eq(ativos.id, id));
  if (!linha) throw naoEncontrado('Ativo não encontrado.');
  return linha;
}

/** Os valores guardados pela chave: os das colunas e os do JSONB, sem os vazios. */
export function valoresGuardados(ativo: typeof ativos.$inferSelect): Record<string, ValorDeCampo> {
  const valores: Record<string, ValorDeCampo> = {
    ...(ativo.valores as Record<string, ValorDeCampo>),
  };
  for (const campo of CAMPOS_DO_ATIVO) {
    if (!campo.coluna) continue;
    const valor = ativo[campo.coluna];
    if (valor !== null && valor !== undefined) valores[campo.chave] = valor;
  }
  return valores;
}

/**
 * O ativo na lista, com os valores das colunas pedidas que ficam no JSONB. Os restritos só saem onde
 * a conta tem `ativos.restritos` no local do ativo.
 */
export function ativoNaLista(
  { ativo, tipo, modelo, responsavel }: LinhaDoAtivo,
  sessao: SessaoDaRequisicao,
  arvore: ArvoreDeLocais,
  {
    pedidas = [],
    restritos = new Set<string>(),
  }: {
    pedidas?: readonly string[];
    restritos?: ReadonlySet<string>;
  } = {},
): z.infer<typeof AtivoNaLista> {
  const verRestritos = podeEm(sessao.acesso, 'ativos.restritos', ativo.localId, arvore);
  const guardados = ativo.valores as Record<string, ValorDeCampo>;
  const valores = Object.fromEntries(
    pedidas
      .filter((chave) => Object.hasOwn(guardados, chave))
      .filter((chave) => verRestritos || !restritos.has(chave))
      .map((chave) => [chave, guardados[chave] as ValorDeCampo]),
  );
  return {
    id: ativo.id,
    rotulo: rotuloDoAtivo({ nome: ativo.nome, modelo, tipo }),
    tipo,
    modelo: modelo
      ? {
          id: modelo.id,
          fabricante: modelo.fabricante,
          nome: modelo.nome,
          imagem: modelo.imagemId ? { id: modelo.imagemId } : null,
        }
      : null,
    imagem: ativo.imagemId ? { id: ativo.imagemId } : null,
    patrimonio: ativo.patrimonio,
    serie: ativo.serie,
    hostname: ativo.hostname,
    local: ativo.localId ? { id: ativo.localId, caminho: arvore.caminho(ativo.localId) } : null,
    responsavel: responsavel && { id: responsavel.id, nome: responsavel.nome },
    uso: ativo.uso,
    situacao: ativo.situacao,
    criadoEm: ativo.criadoEm.toISOString(),
    atualizadoEm: ativo.atualizadoEm.toISOString(),
    valores,
    permite: {
      editar: podeEm(sessao.acesso, 'ativos.editar', ativo.localId, arvore),
      verRestritos,
      verResponsavel: veOResponsavel({ responsavel }, sessao, arvore),
    },
  };
}

/**
 * O ativo do outro lado de uma ligação: o item da lista sem os valores, ou, fora do acesso da conta,
 * só o aviso, sem o id.
 */
export function ativoLigado(
  linha: LinhaDoAtivo,
  sessao: SessaoDaRequisicao,
  arvore: ArvoreDeLocais,
): z.infer<typeof AtivoLigado> {
  if (!podeEm(sessao.acesso, 'ativos.ver', linha.ativo.localId, arvore)) {
    return { foraDoAcesso: true };
  }
  const { valores: _, ...semValores } = ativoNaLista(linha, sessao, arvore);
  return semValores;
}

/** O tipo de campo de cada chave: os comuns pelo código, os da organização pelo catálogo. */
async function tiposDasChaves(
  tx: Transacao,
): Promise<{ tipoDa: (chave: string) => TipoDeCampo | undefined; restritos: Set<string> }> {
  const daOrganizacao = await tx
    .select({ id: campos.id, tipo: campos.tipo, restrito: campos.restrito })
    .from(campos);
  const tipos = new Map<string, TipoDeCampo>([
    ...CAMPOS_DO_ATIVO.map((campo): [string, TipoDeCampo] => [campo.chave, campo.tipo]),
    ...daOrganizacao.map((campo): [string, TipoDeCampo] => [campo.id, campo.tipo]),
  ]);
  return {
    tipoDa: (chave) => tipos.get(chave),
    restritos: new Set(daOrganizacao.filter((campo) => campo.restrito).map((campo) => campo.id)),
  };
}

/** As chaves dos campos restritos da organização. */
export async function camposRestritos(tx: Transacao): Promise<Set<string>> {
  return (await tiposDasChaves(tx)).restritos;
}

const idsDe = (valor: ValorDeCampo) => (Array.isArray(valor) ? valor : [String(valor)]);

/**
 * Os nomes atuais das pessoas, dos locais e dos ativos que os valores apontam, e os arquivos dos
 * campos de arquivo e de imagem. Um ativo que `podeVerAtivo` recusa, pelo local dele, aparece como
 * fora do acesso.
 */
export async function referenciasDos(
  tx: Transacao,
  valores: Readonly<Record<string, ValorDeCampo>>,
  tipoDa: (chave: string) => TipoDeCampo | undefined,
  arvore: ArvoreDeLocais,
  podeVerAtivo: (localId: string | null) => boolean,
): Promise<z.infer<typeof FichaDoAtivo>['referencias']> {
  const apontados = {
    pessoa: new Set<string>(),
    local: new Set<string>(),
    ativo: new Set<string>(),
    fornecedor: new Set<string>(),
    arquivo: new Set<string>(),
  };
  for (const [chave, valor] of Object.entries(valores)) {
    const tipo = tipoDa(chave);
    if (tipo === 'pessoa' || tipo === 'local' || tipo === 'ativo' || tipo === 'fornecedor') {
      for (const id of idsDe(valor)) apontados[tipo].add(id);
    }
    if (tipo === 'arquivo' || tipo === 'imagem') {
      for (const id of idsDe(valor)) apontados.arquivo.add(id);
    }
  }
  const referencias: z.infer<typeof FichaDoAtivo>['referencias'] = {
    pessoas: {},
    locais: {},
    ativos: {},
    fornecedores: {},
    arquivos: {},
  };
  for (const id of apontados.local) {
    if (arvore.local(id)) referencias.locais[id] = arvore.caminho(id);
  }
  if (apontados.pessoa.size > 0) {
    const nomes = await tx
      .select({ id: pessoas.id, nome: pessoas.nome })
      .from(pessoas)
      .where(inArray(pessoas.id, [...apontados.pessoa]));
    for (const { id, nome } of nomes) referencias.pessoas[id] = nome;
  }
  if (apontados.fornecedor.size > 0) {
    const lidos = await tx
      .select({ id: fornecedores.id, nome: fornecedores.nome, situacao: fornecedores.situacao })
      .from(fornecedores)
      .where(inArray(fornecedores.id, [...apontados.fornecedor]));
    for (const { id, nome, situacao } of lidos) {
      referencias.fornecedores[id] = situacao === 'ativo' ? nome : `${nome} (inativo)`;
    }
  }
  if (apontados.ativo.size > 0) {
    const outros = await consultarAtivos(tx).where(inArray(ativos.id, [...apontados.ativo]));
    for (const outro of outros) {
      referencias.ativos[outro.ativo.id] = podeVerAtivo(outro.ativo.localId)
        ? rotuloDoAtivo({ nome: outro.ativo.nome, modelo: outro.modelo, tipo: outro.tipo })
        : ATIVO_FORA_DO_ACESSO;
    }
  }
  if (apontados.arquivo.size > 0) {
    // Os removidos também: a auditoria mostra o nome do arquivo de antes da troca.
    const lidos = await tx
      .select({ id: arquivos.id, nome: arquivos.nome, bytes: arquivos.bytes, tipo: arquivos.tipo })
      .from(arquivos)
      .where(inArray(arquivos.id, [...apontados.arquivo]));
    for (const { id, nome, bytes, tipo } of lidos) {
      referencias.arquivos[id] = { nome: nome ?? '', bytes, tipo };
    }
  }
  return referencias;
}

/**
 * O estado guardado de cada chave, com o nome atual da pessoa da conta que gravou e o do coletor,
 * na gravação pela coleta.
 */
async function estadoComAutores(
  tx: Transacao,
  estado: Readonly<Record<string, EstadoDoCampo>>,
): Promise<z.infer<typeof FichaDoAtivo>['estado']> {
  const autorIds = [
    ...new Set(
      Object.values(estado)
        .map((campo) => campo.autorId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const nomes = new Map<string, string>();
  if (autorIds.length > 0) {
    const linhas = await tx
      .select({ id: contas.id, nome: pessoas.nome })
      .from(contas)
      .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
      .where(inArray(contas.id, autorIds));
    for (const { id, nome } of linhas) nomes.set(id, nome);
  }
  const coletorIds = [
    ...new Set(
      Object.values(estado)
        .map((campo) => campo.coletorId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const dosColetores = new Map<string, string>();
  if (coletorIds.length > 0) {
    const linhas = await tx
      .select({ id: coletores.id, nome: coletores.nome })
      .from(coletores)
      .where(inArray(coletores.id, coletorIds));
    for (const { id, nome } of linhas) dosColetores.set(id, nome);
  }
  return Object.fromEntries(
    Object.entries(estado).map(([chave, campo]) => [
      chave,
      {
        origem: campo.origem,
        momento: campo.momento,
        autor: campo.autorId ? { id: campo.autorId, nome: nomes.get(campo.autorId) ?? '' } : null,
        // O coletor só na gravação pela coleta: as outras ficam como eram.
        ...(campo.coletorId
          ? { coletor: { id: campo.coletorId, nome: dosColetores.get(campo.coletorId) ?? '' } }
          : {}),
        trava: campo.trava,
      },
    ]),
  );
}

/** O painel Suprimentos da ficha e o menor nível e o total, como a lista os mostra. */
async function painelEColunas(
  tx: Transacao,
  ativo: typeof ativos.$inferSelect,
  opcoes: Parameters<typeof suprimentosDosAtivos>[2],
) {
  const painel = (await suprimentosDosAtivos(tx, [ativo], opcoes)).get(ativo.id) ?? null;
  return {
    painelDeSuprimentos: painel,
    suprimentos: painel ? { menor: painel.menor, total: painel.total } : null,
  };
}

/**
 * A ficha do ativo: o item da lista, os valores e o estado pela chave, as referências pelo nome e
 * o que a conta pode fazer. Sem `ativos.restritos` no local do ativo, os campos restritos ficam de
 * fora, com o valor e o estado.
 */
export async function fichaDoAtivo(
  tx: Transacao,
  linha: LinhaDoAtivo,
  sessao: SessaoDaRequisicao,
  arvore: ArvoreDeLocais,
): Promise<z.infer<typeof FichaDoAtivo>> {
  const { ativo } = linha;
  const editar = podeEm(sessao.acesso, 'ativos.editar', ativo.localId, arvore);
  const verRestritos = podeEm(sessao.acesso, 'ativos.restritos', ativo.localId, arvore);
  const { tipoDa, restritos } = await tiposDasChaves(tx);
  const visivel = (chave: string) => verRestritos || !restritos.has(chave);
  const valores = Object.fromEntries(
    Object.entries(valoresGuardados(ativo)).filter(([chave]) => visivel(chave)),
  );
  const estado = Object.fromEntries(
    Object.entries(ativo.estado as Record<string, EstadoDoCampo>).filter(([chave]) =>
      visivel(chave),
    ),
  );
  const segredos = await segredosDoAtivo(tx, ativo.id, sessao);
  const [doTipo] = await tx
    .select({ capacidades: tiposDeAtivo.capacidades })
    .from(tiposDeAtivo)
    .where(eq(tiposDeAtivo.id, ativo.tipoId));
  return {
    ...ativoNaLista(linha, sessao, arvore),
    ...(segredos ? { segredos } : {}),
    valores,
    estado: await estadoComAutores(tx, estado),
    referencias: await referenciasDos(tx, valores, tipoDa, arvore, (localId) =>
      podeEm(sessao.acesso, 'ativos.ver', localId, arvore),
    ),
    permite: {
      editar,
      verRestritos,
      editarRestritos: editar && verRestritos,
      verResponsavel: veOResponsavel(linha, sessao, arvore),
      acessoRemoto:
        ativo.situacao === 'ativo' &&
        (doTipo?.capacidades.includes('acesso.vnc') ?? false) &&
        podeEm(sessao.acesso, 'ativos.acesso-remoto', ativo.localId, arvore),
      // O login do controle escolhido na ficha (change login-de-cada-controle, design, decisão 4).
      escolherLoginDoControle:
        ativo.situacao === 'ativo' &&
        (doTipo?.capacidades.includes('controlid.saude') ?? false) &&
        pode(sessao.acesso, 'cofre.administrar') &&
        (await cofreLigadoNaOrganizacao(tx)),
    },
    disponibilidade:
      (
        await disponibilidadeDosAtivos(tx, [ativo], {
          restritos,
          veRestritos: () => verRestritos,
        })
      ).get(ativo.id) ?? null,
    ...(await painelEColunas(tx, ativo, { restritos, veRestritos: () => verRestritos })),
    consumiveisCompativeis: await compativeisDoAtivo(
      tx,
      ativo,
      alcance(sessao.acesso, 'estoque.ver', arvore),
    ),
    controlId:
      (
        await controlIdDosAtivos(tx, [ativo], {
          restritos,
          veRestritos: () => verRestritos,
        })
      ).get(ativo.id) ?? null,
  };
}
