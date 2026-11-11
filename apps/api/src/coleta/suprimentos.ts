// Os suprimentos das impressoras na ficha e na lista (spec impressoras-por-snmp, "Painel Suprimentos",
// e cadastro-de-ativos; change p2b-impressoras-por-snmp, design, decisão 8): a resposta do SNMP, com o
// desde e o coletor, ou "Não verificado", com o motivo; os suprimentos na ordem da impressora, com o
// tipo pela descrição e o nível; os contadores, com o preto e branco; as condições e as mensagens; e o
// menor nível e o total de páginas, que as colunas mostram. No banco, as subconsultas no estado atual
// servem ao filtro "de e até" e à ordem das colunas. O ativo inativo e o de tipo sem a capacidade não
// têm o painel. Sem o relógio: a tela diz se a leitura está desatualizada.
import {
  ativos,
  coletores,
  estadoDosAtivos,
  modelos,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  alcance,
  CONDICOES_DA_IMPRESSORA,
  contadoresDaImpressora,
  deslocado,
  diaEmSaoPaulo,
  escolhaDeColetor,
  FUSO_DO_BACKUP,
  paginasEmPretoEBranco,
  rotuloDoAtivo,
  situacaoDaDisponibilidade,
  type TipoDeSuprimento,
  tipoDoSuprimento,
} from '@grafite/domain';
import { and, eq, inArray, isNotNull, like, lte, or, type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import type {
  MenoresSuprimentos,
  SerieDosSuprimentos,
  SuprimentosDoAtivo,
} from '../ativos/esquemas.ts';
import { coletoresAtivos } from './alvos.ts';
import type { AtivoComDisponibilidade } from './disponibilidade.ts';

/** Os dias de São Paulo da série dos suprimentos. */
const DIAS_DA_SERIE = 30;

/** As colunas dos suprimentos e do total de páginas na tabela dos ativos. */
export const COLUNA_DOS_SUPRIMENTOS = 'coleta.suprimentos';
export const COLUNA_DAS_PAGINAS = 'coleta.paginas';

/** Se o tipo do ativo liga os suprimentos e contadores. */
const tipoComSuprimentos = sql`'snmp.suprimentos' = any(${tiposDeAtivo.capacidades})`;

/** O campo de IP que o tipo escolheu para o SNMP, no JSONB da configuração. */
const campoDoIpDoSnmp = sql<
  string | null
>`(${tiposDeAtivo.configuracaoDasCapacidades} -> 'snmp.suprimentos' ->> 'campoDoIp')`;

/** Um valor do estado atual do ativo da linha, numa subconsulta; vazio fora da capacidade. */
const doEstado = (expressao: string, onde: string) =>
  sql<
    number | null
  >`(case when ${ativos.situacao} = 'inativo' or not ${tipoComSuprimentos} then null
    else (select ${sql.raw(expressao)} from estado_dos_ativos e
      where e.org_id = ${ativos.orgId} and e.ativo_id = ${ativos.id} and ${sql.raw(onde)}) end)`;

/** O menor nível válido entre os suprimentos, que a coluna Suprimentos mostra, filtra e ordena. */
export const menorNivelNoBanco = doEstado(
  'min(e.valor_numero)',
  "e.metrica = 'impressora.suprimento' and e.situacao = 'valida'",
);

/** O contador do primeiro marcador, que a coluna Total de páginas mostra, filtra e ordena. */
export const totalDePaginasNoBanco = doEstado(
  'e.valor_numero',
  "e.metrica = 'impressora.contador' and e.item = '1' and e.situacao = 'valida'",
);

type Painel = z.infer<typeof SuprimentosDoAtivo>;
type LinhaDoEstado = typeof estadoDosAtivos.$inferSelect;

const iso = (momento: Date) => momento.toISOString();

const VAZIO: Omit<Painel, 'motivo'> = {
  resposta: null,
  suprimentos: [],
  contadores: [],
  paginasEmPretoEBranco: null,
  condicoes: null,
  mensagens: null,
  menor: null,
  total: null,
};

/** O nível de um suprimento pelo estado: medido, "há suprimento", sem dado ou inconsistente. */
function nivelDoEstado(estado: LinhaDoEstado): Painel['suprimentos'][number]['nivel'] {
  if (estado.situacao === 'inconsistente') {
    return { tipo: 'inconsistente', valor: estado.valorNumero };
  }
  if (estado.situacao === 'sem-dado') return { tipo: 'sem-dado' };
  return estado.valorNumero === null
    ? { tipo: 'ha-suprimento' }
    : { tipo: 'medido', percentual: estado.valorNumero };
}

/** A lista de uma métrica de lista, como as condições, lida do JSON do valor. */
function listaDoEstado(estado: LinhaDoEstado | undefined): string[] | null {
  if (!estado) return null;
  if (estado.situacao !== 'valida' || estado.valorTexto === null) return [];
  try {
    const lista = JSON.parse(estado.valorTexto) as unknown;
    return Array.isArray(lista)
      ? lista.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

const porItem = (a: LinhaDoEstado, b: LinhaDoEstado) => Number(a.item) - Number(b.item);

/** O que o painel mostra das leituras de um ativo, fora a resposta, pelos estados dele. */
function partesDosEstados(estados: readonly LinhaDoEstado[]): Omit<Painel, 'motivo' | 'resposta'> {
  const daMetrica = (metrica: string) =>
    estados.filter((estado) => estado.metrica === metrica).sort(porItem);
  const suprimentos = daMetrica('impressora.suprimento').map((estado) => {
    const descricao = String(estado.detalhes?.descricao ?? '');
    return {
      item: estado.item,
      descricao,
      tipo: tipoDoSuprimento(descricao),
      nivel: nivelDoEstado(estado),
      momento: iso(estado.momento),
    };
  });
  const doContador = daMetrica('impressora.contador');
  const validos = doContador.map((estado) => ({
    item: Number(estado.item),
    paginas: estado.situacao === 'valida' ? estado.valorNumero : null,
    cores: typeof estado.detalhes?.cores === 'number' ? estado.detalhes.cores : null,
  }));
  const rotulos = new Map(
    contadoresDaImpressora(validos).map((contador) => [contador.item, contador.rotulo]),
  );
  const contadores = doContador.map((estado) => ({
    item: estado.item,
    rotulo: rotulos.get(Number(estado.item)) ?? `Contador ${estado.item}`,
    paginas: estado.valorNumero,
    inconsistente: estado.situacao === 'inconsistente',
    momento: iso(estado.momento),
  }));
  const condicoes = estados.find((estado) => estado.metrica === 'impressora.condicoes');
  const chavesDasCondicoes = listaDoEstado(condicoes);
  const mensagens = estados.find((estado) => estado.metrica === 'impressora.mensagens');
  const textos = listaDoEstado(mensagens);
  const medidos = suprimentos.filter(
    (suprimento): suprimento is typeof suprimento & { nivel: { tipo: 'medido' } } =>
      suprimento.nivel.tipo === 'medido',
  );
  const menor = medidos.reduce<(typeof medidos)[number] | null>(
    (atual, suprimento) =>
      !atual || suprimento.nivel.percentual < atual.nivel.percentual ? suprimento : atual,
    null,
  );
  const total = doContador.find((estado) => estado.item === '1' && estado.situacao === 'valida');
  return {
    suprimentos,
    contadores,
    paginasEmPretoEBranco: paginasEmPretoEBranco(validos),
    condicoes:
      condicoes && chavesDasCondicoes
        ? {
            itens: chavesDasCondicoes.flatMap((chave) => {
              const condicao = CONDICOES_DA_IMPRESSORA.find((uma) => uma.chave === chave);
              return condicao
                ? [{ chave, rotulo: condicao.rotulo, severidade: condicao.severidade }]
                : [];
            }),
            momento: iso(condicoes.momento),
          }
        : null,
    mensagens: mensagens && textos ? { itens: textos, momento: iso(mensagens.momento) } : null,
    menor: menor
      ? { nivel: menor.nivel.percentual, descricao: menor.descricao, momento: menor.momento }
      : null,
    total:
      total && total.valorNumero !== null
        ? { paginas: total.valorNumero, momento: iso(total.momento) }
        : null,
  };
}

/** A resposta da última leitura SNMP, com desde quando e o coletor que a fez. */
const respostaDoEstado = (resposta: LinhaDoEstado, coletor: string | null): Painel['resposta'] => ({
  situacao:
    resposta.situacao === 'sem-dado' || resposta.valorTexto === null
      ? 'sem-dado'
      : resposta.valorTexto === 'respondeu'
        ? 'respondeu'
        : 'nao-respondeu',
  momento: iso(resposta.momento),
  desde: iso(resposta.desde),
  coletor,
});

/**
 * O painel Suprimentos de cada ativo, pelo id; fica de fora o inativo e o de tipo sem a capacidade.
 * Sem leitura, ou sem o IP, o painel diz por que não foi verificado; o motivo "nenhum coletor
 * alcança" só mostra o IP a quem vê o campo, como na disponibilidade.
 */
export async function suprimentosDosAtivos(
  tx: Transacao,
  linhas: readonly AtivoComDisponibilidade[],
  {
    restritos,
    veRestritos,
  }: { restritos: ReadonlySet<string>; veRestritos: (localId: string | null) => boolean },
): Promise<Map<string, Painel>> {
  const resultado = new Map<string, Painel>();
  const tipos = await tx
    .select({ id: tiposDeAtivo.id, campoDoIp: campoDoIpDoSnmp })
    .from(tiposDeAtivo)
    .where(tipoComSuprimentos);
  const campoDoTipo = new Map(tipos.map((tipo) => [tipo.id, tipo.campoDoIp]));
  const candidatos = linhas.filter(
    (linha) => linha.situacao === 'ativo' && campoDoTipo.has(linha.tipoId),
  );
  if (candidatos.length === 0) return resultado;
  const estados = await tx
    .select()
    .from(estadoDosAtivos)
    .where(
      and(
        inArray(
          estadoDosAtivos.ativoId,
          candidatos.map((linha) => linha.id),
        ),
        or(
          eq(estadoDosAtivos.metrica, 'snmp.resposta'),
          like(estadoDosAtivos.metrica, 'impressora.%'),
        ),
      ),
    );
  const nomes = new Map(
    (await tx.select({ id: coletores.id, nome: coletores.nome }).from(coletores)).map((coletor) => [
      coletor.id,
      coletor.nome,
    ]),
  );
  const escolher = escolhaDeColetor(await coletoresAtivos(tx));
  for (const linha of candidatos) {
    const campoDoIp = campoDoTipo.get(linha.tipoId) ?? null;
    const guardado = campoDoIp ? (linha.valores as Record<string, unknown>)[campoDoIp] : null;
    const ip = typeof guardado === 'string' && guardado !== '' ? guardado : null;
    const doAtivo = estados.filter((estado) => estado.ativoId === linha.id);
    const partes = partesDosEstados(doAtivo);
    const resposta = doAtivo.find((estado) => estado.metrica === 'snmp.resposta');
    const situacao = situacaoDaDisponibilidade({
      ip,
      estado: resposta ?? null,
      alcancado: ip !== null && escolher(ip) !== null,
    });
    if (situacao.situacao === 'nao-verificado' || !resposta) {
      const motivo =
        situacao.situacao === 'nao-verificado' ? situacao.motivo : 'Aguardando a primeira leitura.';
      const ipEscondido =
        campoDoIp !== null && restritos.has(campoDoIp) && !veRestritos(linha.localId);
      // O menor nível e o total ficam, como as colunas os mostram, filtram e ordenam.
      resultado.set(linha.id, {
        ...VAZIO,
        motivo: ipEscondido && ip ? motivo.replace(`o IP ${ip}`, 'o IP do ativo') : motivo,
        menor: partes.menor,
        total: partes.total,
      });
      continue;
    }
    resultado.set(linha.id, {
      motivo: null,
      resposta: respostaDoEstado(resposta, nomes.get(resposta.coletorId) ?? null),
      ...partes,
    });
  }
  return resultado;
}

/** Uma linha da série: o último percentual válido do suprimento num dia de São Paulo. */
type LinhaDaSerie = {
  item: string;
  dia: string;
  momento: Date | string;
  percentual: number;
  descricao: string | null;
};

/**
 * A série dos suprimentos de um ativo (change suprimentos-rostos-e-backups, design, decisão 2): o
 * último percentual válido de cada dia de São Paulo, dos últimos 30 dias, por suprimento, em ordem
 * do item e do dia. O que a impressora não mede fica de fora. O tipo sem a capacidade dá a lista
 * vazia.
 */
export async function serieDosSuprimentos(
  tx: Transacao,
  ativo: { id: string; tipoId: string },
  agora: Date,
): Promise<z.infer<typeof SerieDosSuprimentos>> {
  const [tipo] = await tx
    .select({ id: tiposDeAtivo.id })
    .from(tiposDeAtivo)
    .where(and(eq(tiposDeAtivo.id, ativo.tipoId), tipoComSuprimentos));
  if (!tipo) return { itens: [] };
  const primeiroDia = deslocado(diaEmSaoPaulo(agora), -(DIAS_DA_SERIE - 1));
  const desde = new Date(agora.getTime() - (DIAS_DA_SERIE + 1) * 86_400_000);
  const { rows } = await tx.execute<LinhaDaSerie>(sql`
    select distinct on (item, dia) item, dia, momento, valor_numero as percentual,
      detalhes ->> 'descricao' as descricao
    from (
      select item, momento, valor_numero, detalhes,
        to_char(momento at time zone ${FUSO_DO_BACKUP}, 'YYYY-MM-DD') as dia
      from leituras
      where ativo_id = ${ativo.id} and metrica = 'impressora.suprimento'
        and situacao = 'valida' and valor_numero is not null
        and momento > ${desde.toISOString()}::timestamptz
        and momento <= ${agora.toISOString()}::timestamptz
    ) as do_periodo
    order by item, dia, momento desc`);
  const porItem = new Map<string, LinhaDaSerie[]>();
  for (const linha of rows) {
    if (linha.dia < primeiroDia) continue;
    porItem.set(linha.item, [...(porItem.get(linha.item) ?? []), linha]);
  }
  return {
    itens: [...porItem.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([item, linhas]) => ({
        item,
        descricao: linhas.at(-1)?.descricao ?? '',
        pontos: linhas.map((linha) => ({
          dia: linha.dia,
          momento: new Date(linha.momento).toISOString(),
          percentual: Number(linha.percentual),
        })),
      })),
  };
}

/** O recorte das impressoras de menor nível, como o bloco do Início o pede. */
export interface RecorteDosSuprimentos {
  tipos: readonly TipoDeSuprimento[];
  /** Os locais pedidos, que valem com os de dentro; sem nenhum, todos os que a conta vê. */
  locais: readonly string[];
  limite: number;
  /** Só os suprimentos até este nível, em %. */
  nivel: number;
}

/**
 * As impressoras de menor nível (change opcoes-dos-blocos-do-inicio, design, decisão 5): do estado
 * atual, os suprimentos válidos e medidos dos ativos ativos que a conta vê, com o escopo pelo local,
 * nos locais pedidos e nos de dentro, até o nível pedido. Cada um ganha o tipo pela descrição, como
 * na ficha e na regra de alerta; ficam os dos tipos pedidos, e de cada impressora, o de menor nível.
 * A resposta traz as primeiras do limite, da menor para a maior.
 *
 * O tipo não está no banco: a leitura traz os suprimentos do recorte e escolhe em memória. São
 * poucas linhas por impressora.
 */
export async function menoresSuprimentos(
  tx: Transacao,
  { sessao, arvore }: { sessao: SessaoDaRequisicao; arvore: ArvoreDeLocais },
  recorte: RecorteDosSuprimentos,
): Promise<z.infer<typeof MenoresSuprimentos>> {
  const condicoes: SQL[] = [
    eq(ativos.situacao, 'ativo'),
    tipoComSuprimentos,
    eq(estadoDosAtivos.metrica, 'impressora.suprimento'),
    eq(estadoDosAtivos.situacao, 'valida'),
    isNotNull(estadoDosAtivos.valorNumero),
    lte(estadoDosAtivos.valorNumero, recorte.nivel),
  ];
  const alcanceDoVer = alcance(sessao.acesso, 'ativos.ver', arvore);
  if (alcanceDoVer !== 'organizacao') {
    // O ativo sem local só entra pela organização inteira, como na lista dos ativos.
    condicoes.push(
      alcanceDoVer && alcanceDoVer.size > 0
        ? inArray(ativos.localId, [...alcanceDoVer])
        : sql`false`,
    );
  }
  if (recorte.locais.length > 0) {
    const ramos = [...new Set(recorte.locais.flatMap((local) => [...arvore.ramo(local)]))];
    condicoes.push(ramos.length > 0 ? inArray(ativos.localId, ramos) : sql`false`);
  }
  const lidos = await tx
    .select({
      ativoId: ativos.id,
      nome: ativos.nome,
      tipo: tiposDeAtivo.nome,
      fabricante: modelos.fabricante,
      modelo: modelos.nome,
      item: estadoDosAtivos.item,
      nivel: estadoDosAtivos.valorNumero,
      detalhes: estadoDosAtivos.detalhes,
      momento: estadoDosAtivos.momento,
    })
    .from(estadoDosAtivos)
    .innerJoin(ativos, eq(ativos.id, estadoDosAtivos.ativoId))
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(and(...condicoes));

  const pedidos = new Set<TipoDeSuprimento>(recorte.tipos);
  type Item = z.infer<typeof MenoresSuprimentos>['itens'][number];
  const menorDeCada = new Map<string, Item>();
  for (const lido of lidos) {
    if (lido.nivel === null) continue;
    const descricao = String(lido.detalhes?.descricao ?? '');
    const tipo = tipoDoSuprimento(descricao);
    if (!pedidos.has(tipo)) continue;
    const atual = menorDeCada.get(lido.ativoId)?.suprimento;
    // No empate, o primeiro na ordem da impressora.
    const menor =
      !atual ||
      lido.nivel < atual.nivel ||
      (lido.nivel === atual.nivel && Number(lido.item) < Number(atual.item));
    if (!menor) continue;
    menorDeCada.set(lido.ativoId, {
      ativo: {
        id: lido.ativoId,
        rotulo: rotuloDoAtivo({
          nome: lido.nome,
          modelo:
            lido.fabricante !== null && lido.modelo !== null
              ? { fabricante: lido.fabricante, nome: lido.modelo }
              : null,
          tipo: { nome: lido.tipo },
        }),
      },
      suprimento: {
        item: lido.item,
        descricao,
        tipo,
        nivel: lido.nivel,
        momento: iso(lido.momento),
      },
    });
  }
  const ordemAlfabetica = new Intl.Collator('pt-BR');
  return {
    itens: [...menorDeCada.values()]
      .sort(
        (a, b) =>
          a.suprimento.nivel - b.suprimento.nivel ||
          ordemAlfabetica.compare(a.ativo.rotulo, b.ativo.rotulo),
      )
      .slice(0, recorte.limite),
  };
}
