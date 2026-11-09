// A lista dos alertas (spec alertas, "Quem vê os alertas", e modulo-alertas, "Lista dos alertas
// abertos" e "Lista dos alertas resolvidos"; change p3a-regras-e-alertas, design, decisões 8 e 10):
// os abertos ou os resolvidos que a conta vê pelo alcance de `alertas.ver`, com os filtros, o "para
// resolver" (sem os adiados nem os dos ativos silenciados), a ordem pelas colunas e o cursor, o
// total, o alvo (o ativo, com o rótulo e as imagens, ou o coletor), quem reconheceu e quem adiou,
// pelo nome atual da pessoa, e o que a conta pode tratar pelo alcance de `alertas.tratar`.
import {
  alertas,
  ativos,
  coletores,
  contas,
  modelos,
  pessoas,
  regrasDeAlerta,
  silenciosDosAtivos,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  type CondicaoDeAlerta,
  type IconeDeTipo,
  rotuloDoAtivo,
} from '@grafite/domain';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import { codificarCursor, decodificarCursor } from '../paginacao.ts';
import { dadosInvalidos } from '../problemas.ts';

export const ORDENS_DOS_ALERTAS = ['severidade', 'ha', 'ativo', 'alerta'] as const;
export type OrdemDosAlertas = (typeof ORDENS_DOS_ALERTAS)[number];

export interface FiltrosDosAlertas {
  situacao: 'abertos' | 'resolvidos';
  severidades?: readonly ('critico' | 'atencao' | 'info')[];
  regra?: string;
  ativo?: string;
  paraResolver: boolean;
  ordem: OrdemDosAlertas;
  direcao?: 'asc' | 'desc';
  limite: number;
  cursor?: string;
}

/** A direção de cada ordem quando a tela não diz: o crítico e o mais antigo primeiro. */
const DIRECAO_PADRAO: Record<OrdemDosAlertas, 'asc' | 'desc'> = {
  severidade: 'desc',
  ha: 'asc',
  ativo: 'asc',
  alerta: 'asc',
};

const PESO = sql<number>`(case ${alertas.severidade} when 'critico' then 3 when 'atencao' then 2 else 1 end)`;

/** O nome do alvo: o rótulo do ativo (o nome, o fabricante e o modelo, ou o tipo) ou o coletor. */
const ROTULO = sql<string>`lower(coalesce(nullif(trim(${ativos.nome}), ''), ${modelos.fabricante} || ' ' || ${modelos.nome}, ${tiposDeAtivo.nome}, ${coletores.nome}))`;

const TEXTO = sql<string>`lower(${alertas.texto})`;

/** Uma chave da ordem: a expressão, a direção e como o valor vai e volta no cursor. */
interface Chave {
  expressao: SQL;
  direcao: 'asc' | 'desc';
  tipo: 'numero' | 'texto' | 'momento';
}

function chavesDa(filtros: FiltrosDosAlertas): Chave[] {
  if (filtros.situacao === 'resolvidos') {
    return [
      { expressao: sql`${alertas.resolvidoEm}`, direcao: 'desc', tipo: 'momento' },
      { expressao: sql`${alertas.id}`, direcao: 'desc', tipo: 'texto' },
    ];
  }
  const direcao = filtros.direcao ?? DIRECAO_PADRAO[filtros.ordem];
  const inversa = direcao === 'asc' ? 'desc' : 'asc';
  switch (filtros.ordem) {
    case 'severidade':
      // A ordem de fábrica: o mais grave e, na mesma severidade, o mais antigo; ao contrário, o inverso.
      return [
        { expressao: PESO, direcao, tipo: 'numero' },
        { expressao: sql`${alertas.abertoEm}`, direcao: inversa, tipo: 'momento' },
        { expressao: sql`${alertas.id}`, direcao: inversa, tipo: 'texto' },
      ];
    case 'ha':
      return [
        { expressao: sql`${alertas.abertoEm}`, direcao, tipo: 'momento' },
        { expressao: sql`${alertas.id}`, direcao, tipo: 'texto' },
      ];
    case 'ativo':
      return [
        { expressao: ROTULO, direcao, tipo: 'texto' },
        { expressao: sql`${alertas.id}`, direcao, tipo: 'texto' },
      ];
    case 'alerta':
      return [
        { expressao: TEXTO, direcao, tipo: 'texto' },
        { expressao: sql`${alertas.id}`, direcao, tipo: 'texto' },
      ];
  }
}

const ValorDoCursor = z
  .array(z.union([z.string(), z.number()]))
  .min(2)
  .max(3);

/** As linhas depois do cursor, pelas chaves da ordem, cada uma na direção dela. */
function depoisDo(chaves: readonly Chave[], valores: readonly (string | number)[]): SQL {
  const [chave, ...resto] = chaves;
  if (!chave) return sql`false`;
  const bruto = valores[0];
  const valor = chave.tipo === 'momento' ? new Date(String(bruto)) : bruto;
  const passa = chave.direcao === 'asc' ? gt(chave.expressao, valor) : lt(chave.expressao, valor);
  if (resto.length === 0) return passa;
  return or(passa, and(eq(chave.expressao, valor), depoisDo(resto, valores.slice(1)))) as SQL;
}

const valorDaChave = (chave: Chave, linha: Record<string, unknown>, indice: number) => {
  const valor = linha[`chave${indice}`];
  if (chave.tipo === 'momento') return new Date(String(valor)).toISOString();
  return chave.tipo === 'numero' ? Number(valor) : String(valor);
};

export interface QuemListaOsAlertas {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
  agora: Date;
}

/** O alvo de um alerta, na lista. */
export type AlvoNaLista =
  | {
      tipo: 'ativo';
      id: string;
      nome: string;
      patrimonio: string | null;
      tipoDoAtivo: { id: string; nome: string; icone: IconeDeTipo };
      imagem: { id: string } | null;
      /** O modelo, com a imagem dele, que a miniatura usa sem a imagem própria do ativo. */
      modelo: { id: string; imagem: { id: string } | null } | null;
    }
  | { tipo: 'coletor'; id: string; nome: string };

export interface AlertaListado {
  id: string;
  regra: { id: string; nome: string };
  condicao: CondicaoDeAlerta;
  severidade: 'critico' | 'atencao' | 'info';
  texto: string;
  situacao: 'aberto' | 'resolvido';
  alvo: AlvoNaLista;
  abertoEm: string;
  resolvidoEm: string | null;
  comoTerminou: 'voltou-ao-normal' | 'regra-deixou-de-valer' | null;
  reconhecido: { nome: string; em: string } | null;
  adiado: { ate: string; nome: string } | null;
  silencio: { ate: string | null; motivo: string | null } | null;
  permite: { tratar: boolean };
}

/** Os nomes atuais das pessoas das contas dadas. */
async function nomesDasContas(tx: Transacao, ids: readonly string[]) {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map<string, string>();
  const linhas = await tx
    .select({ id: contas.id, nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
    .where(inArray(contas.id, unicos));
  return new Map(linhas.map((linha) => [linha.id, linha.nome]));
}

export async function listarAlertas(
  tx: Transacao,
  filtros: FiltrosDosAlertas,
  { acesso, arvore, agora }: QuemListaOsAlertas,
): Promise<{ itens: AlertaListado[]; total: number; proximo: string | null }> {
  const silencioAtual = and(
    eq(silenciosDosAtivos.ativoId, alertas.ativoId),
    or(isNull(silenciosDosAtivos.ate), gt(silenciosDosAtivos.ate, agora)),
  );
  const condicoes: SQL[] = [
    eq(alertas.situacao, filtros.situacao === 'abertos' ? 'aberto' : 'resolvido'),
  ];
  const doVer = alcance(acesso, 'alertas.ver', arvore);
  if (doVer !== 'organizacao') {
    // O alerta do coletor e o do ativo sem local só entram pela organização inteira.
    condicoes.push(
      doVer && doVer.size > 0
        ? (and(isNotNull(alertas.ativoId), inArray(ativos.localId, [...doVer])) as SQL)
        : sql`false`,
    );
  }
  if (filtros.severidades?.length)
    condicoes.push(inArray(alertas.severidade, [...filtros.severidades]));
  if (filtros.regra) condicoes.push(eq(alertas.regraId, filtros.regra));
  if (filtros.ativo) condicoes.push(eq(alertas.ativoId, filtros.ativo));
  if (filtros.paraResolver) {
    condicoes.push(or(isNull(alertas.adiadoAte), lte(alertas.adiadoAte, agora)) as SQL);
    condicoes.push(isNull(silenciosDosAtivos.id));
  }

  const [contagem] = await tx
    .select({ total: count() })
    .from(alertas)
    .leftJoin(ativos, eq(ativos.id, alertas.ativoId))
    .leftJoin(silenciosDosAtivos, silencioAtual)
    .where(and(...condicoes));

  const chaves = chavesDa(filtros);
  const comCursor = [...condicoes];
  if (filtros.cursor) {
    const lidos = decodificarCursor(filtros.cursor, ValorDoCursor);
    if (lidos.length !== chaves.length)
      throw dadosInvalidos({ cursor: 'A lista mudou. Recarregue a lista.' });
    comCursor.push(depoisDo(chaves, lidos));
  }
  const ordem = chaves.map((chave) =>
    chave.direcao === 'asc' ? asc(chave.expressao) : desc(chave.expressao),
  );
  const colunasDasChaves = Object.fromEntries(
    // O momento vem em ISO 8601 pelo próprio banco, para o cursor voltar igual.
    chaves.map((chave, indice) => [
      `chave${indice}`,
      chave.tipo === 'momento'
        ? sql`to_json(${chave.expressao}) #>> '{}'`
        : sql`${chave.expressao}`,
    ]),
  ) as Record<string, SQL>;
  const linhas = await tx
    .select({
      id: alertas.id,
      regraId: alertas.regraId,
      regraNome: regrasDeAlerta.nome,
      condicao: regrasDeAlerta.condicao,
      severidade: alertas.severidade,
      texto: alertas.texto,
      situacao: alertas.situacao,
      abertoEm: alertas.abertoEm,
      resolvidoEm: alertas.resolvidoEm,
      comoTerminou: alertas.comoTerminou,
      reconhecidoPor: alertas.reconhecidoPor,
      reconhecidoEm: alertas.reconhecidoEm,
      adiadoAte: alertas.adiadoAte,
      adiadoPor: alertas.adiadoPor,
      ativoId: alertas.ativoId,
      ativoNome: ativos.nome,
      patrimonio: ativos.patrimonio,
      localId: ativos.localId,
      imagemId: ativos.imagemId,
      tipoId: tiposDeAtivo.id,
      tipoNome: tiposDeAtivo.nome,
      tipoIcone: tiposDeAtivo.icone,
      fabricante: modelos.fabricante,
      modeloNome: modelos.nome,
      modeloId: modelos.id,
      modeloImagemId: modelos.imagemId,
      coletorId: alertas.coletorId,
      coletorNome: coletores.nome,
      silencioId: silenciosDosAtivos.id,
      silencioAte: silenciosDosAtivos.ate,
      silencioMotivo: silenciosDosAtivos.motivo,
      ...colunasDasChaves,
    })
    .from(alertas)
    .innerJoin(regrasDeAlerta, eq(regrasDeAlerta.id, alertas.regraId))
    .leftJoin(ativos, eq(ativos.id, alertas.ativoId))
    .leftJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .leftJoin(coletores, eq(coletores.id, alertas.coletorId))
    .leftJoin(silenciosDosAtivos, silencioAtual)
    .where(and(...comCursor))
    .orderBy(...ordem)
    .limit(filtros.limite + 1);

  const daPagina = linhas.slice(0, filtros.limite);
  const ultima = daPagina.at(-1);
  const proximo =
    linhas.length > filtros.limite && ultima
      ? codificarCursor(
          chaves.map((chave, indice) =>
            valorDaChave(chave, ultima as Record<string, unknown>, indice),
          ),
        )
      : null;
  const nomes = await nomesDasContas(
    tx,
    daPagina.flatMap((linha) =>
      [linha.reconhecidoPor, linha.adiadoPor].filter((id): id is string => id !== null),
    ),
  );
  const doTratar = alcance(acesso, 'alertas.tratar', arvore);
  const podeTratar = (linha: (typeof daPagina)[number]) =>
    linha.situacao === 'aberto' &&
    (doTratar === 'organizacao' ||
      (doTratar !== null &&
        linha.ativoId !== null &&
        linha.localId !== null &&
        doTratar.has(linha.localId)));

  return {
    total: contagem?.total ?? 0,
    proximo,
    itens: daPagina.map((linha) => ({
      id: linha.id,
      regra: { id: linha.regraId, nome: linha.regraNome },
      condicao: linha.condicao,
      severidade: linha.severidade,
      texto: linha.texto,
      situacao: linha.situacao === 'resolvido' ? 'resolvido' : 'aberto',
      alvo:
        linha.ativoId !== null && linha.tipoId !== null
          ? {
              tipo: 'ativo',
              id: linha.ativoId,
              nome: rotuloDoAtivo({
                nome: linha.ativoNome,
                modelo:
                  linha.fabricante !== null && linha.modeloNome !== null
                    ? { fabricante: linha.fabricante, nome: linha.modeloNome }
                    : null,
                tipo: { nome: linha.tipoNome ?? '' },
              }),
              patrimonio: linha.patrimonio,
              tipoDoAtivo: {
                id: linha.tipoId,
                nome: linha.tipoNome ?? '',
                icone: (linha.tipoIcone ?? 'generico') as IconeDeTipo,
              },
              imagem: linha.imagemId ? { id: linha.imagemId } : null,
              modelo: linha.modeloId
                ? {
                    id: linha.modeloId,
                    imagem: linha.modeloImagemId ? { id: linha.modeloImagemId } : null,
                  }
                : null,
            }
          : { tipo: 'coletor', id: linha.coletorId ?? '', nome: linha.coletorNome ?? '' },
      abertoEm: (linha.abertoEm ?? agora).toISOString(),
      resolvidoEm: linha.resolvidoEm ? linha.resolvidoEm.toISOString() : null,
      comoTerminou: linha.comoTerminou,
      reconhecido:
        linha.reconhecidoPor && linha.reconhecidoEm
          ? { nome: nomes.get(linha.reconhecidoPor) ?? '', em: linha.reconhecidoEm.toISOString() }
          : null,
      adiado:
        linha.adiadoPor && linha.adiadoAte && linha.adiadoAte > agora
          ? { ate: linha.adiadoAte.toISOString(), nome: nomes.get(linha.adiadoPor) ?? '' }
          : null,
      silencio: linha.silencioId
        ? {
            ate: linha.silencioAte ? linha.silencioAte.toISOString() : null,
            motivo: linha.silencioMotivo,
          }
        : null,
      permite: { tratar: podeTratar(linha) },
    })),
  };
}
