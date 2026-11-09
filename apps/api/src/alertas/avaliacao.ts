// A avaliação dos alertas de uma organização (spec alertas, "Avaliação a cada minuto", "Recuperação
// com folga" e "Encerramento quando a regra deixa de valer"; change p3a-regras-e-alertas, design,
// decisões 5 a 9). Roda numa transação, com o trinco de aviso da organização, para duas avaliações
// dela não se cruzarem: garante as regras de fábrica, observa cada regra ativa sobre o estado atual
// (as que disparam e os alertas não resolvidos dela), pergunta ao domínio o que fazer com cada alvo e
// item, grava e, se algo que a tela mostra mudou, grava um evento só. A regra inativa encerra os
// alertas dela. A coleta atrasada lê os alvos da coleta e o último contato dos coletores, e o
// coletor sem contato, os coletores. As exceções da regra valem por ativo: o "Não alertar" o tira da
// regra, e o "Outro limite" troca os parâmetros do toner dele (change regras-indicadores-e-tarefas,
// design, decisão 2). Com o módulo Alertas desligado, nada é avaliado. Os alertas que
// abrem fora do silêncio notificam, na mesma transação, as contas que os veem (design do P3b,
// decisões 3 e 4).
import {
  alertas,
  ativos,
  coletores,
  estadoDosAtivos,
  modelos,
  organizacoes,
  regrasDeAlerta,
  silenciosDosAtivos,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type AlertaQueAbriu,
  type ArvoreDeLocais,
  type AtivoDaExcecao,
  type CapacidadeDaCondicao,
  condicaoDe,
  type DadosDaRegra,
  decidirAlerta,
  type EscopoDaRegra,
  type ExcecaoDaRegra,
  excecaoDoAtivo,
  INTERVALOS_DAS_METRICAS,
  type LeituraDoEstado,
  type MetricaDaColeta,
  notificacoesDosAlertas,
  type ObservacaoDoAlvo,
  observarColetaAtrasada,
  observarColetor,
  observarLeitura,
  parametrosNoAtivo,
  rotuloDoAtivo,
  type SeveridadeDoAlerta,
} from '@grafite/domain';
import { and, eq, gt, inArray, isNull, lte, ne, or, type SQL, sql } from 'drizzle-orm';
import { carregarAcessosDaOrganizacao } from '../acesso/acesso.ts';
import { lerArvore } from '../arvore.ts';
import { type AlvoDaColeta, alvosDaColeta, type TipoDeColeta } from '../coleta/alvos.ts';
import { registrarEvento } from '../eventos/saida.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { garantirRegrasDeFabrica } from './fabrica.ts';
import { dadosDaLinha, type LinhaDaRegra } from './regras.ts';

const ATOR_DA_FABRICA = { tipo: 'sistema', descricao: 'regras de fábrica' } as const;

/** O alerta não resolvido, como a avaliação o lê. */
export interface AlertaNaoResolvido {
  id: string;
  regraId: string;
  ativoId: string | null;
  coletorId: string | null;
  item: string;
  situacao: 'pendente' | 'aberto';
  observadoEm: Date;
  texto: string;
  severidade: SeveridadeDoAlerta;
}

/** O que a regra diz de um alvo e item agora. */
export interface Observado {
  ativoId: string | null;
  coletorId: string | null;
  item: string;
  observacao: ObservacaoDoAlvo;
}

/** O que a avaliação sabe da organização, para todas as regras. */
export interface ContextoDaAvaliacao {
  agora: Date;
  /** Com o módulo Ativos desligado, as condições dos ativos não valem. */
  ativosLigado: boolean;
  /** Os ativos silenciados agora. */
  silenciados: ReadonlySet<string>;
  /** A árvore dos locais, lida só se uma regra tem um local como escopo. */
  arvore: () => Promise<ArvoreDeLocais>;
  /** Os alvos da coleta, lidos só se a coleta atrasada está ativa. */
  alvos: () => Promise<AlvoDaColeta[]>;
  /** A fila, para a entrega das notificações dos alertas que abrem (change p3c-email-e-push). */
  enviar?: EnviarTarefa;
}

const FORA_DA_REGRA = { tipo: 'fora-da-regra' } as const;
/** Quantos alertas cada escrita em lote grava. */
const LOTE_DE_ESCRITA = 500;
const SEM_DADO = { tipo: 'sem-dado' } as const;

const chave = (alvo: Pick<Observado, 'ativoId' | 'coletorId' | 'item'>) =>
  `${alvo.ativoId ?? ''}|${alvo.coletorId ?? ''}|${alvo.item}`;

/** A métrica do estado atual que cada condição lê. */
const METRICA_DA_CONDICAO = {
  'rede.offline': 'rede.disponibilidade',
  'toner.nivel': 'impressora.suprimento',
  'impressora.condicao': 'impressora.condicoes',
  'controlid.situacao': 'controlid.sondagem',
} as const;

type CondicaoDoEstado = keyof typeof METRICA_DA_CONDICAO;
type RegraDoEstado = Extract<DadosDaRegra, { condicao: CondicaoDoEstado }>;

const doEstado = (dados: DadosDaRegra): dados is RegraDoEstado =>
  Object.hasOwn(METRICA_DA_CONDICAO, dados.condicao);

/** A exceção de cada ativo pela regra, ou nada quando a regra não tem exceções. */
async function excecaoPorAtivo(
  dados: DadosDaRegra,
  contexto: ContextoDaAvaliacao,
): Promise<((ativo: AtivoDaExcecao) => ExcecaoDaRegra | null) | null> {
  const excecoes = dados.excecoes ?? [];
  if (excecoes.length === 0) return null;
  const ramos = new Map<string, ReadonlySet<string>>();
  if (excecoes.some(({ lugar }) => lugar.tipo === 'local')) {
    const arvore = await contexto.arvore();
    for (const { lugar } of excecoes) {
      if (lugar.tipo === 'local') ramos.set(lugar.id, new Set(arvore.ramo(lugar.id)));
    }
  }
  return (ativo) => excecaoDoAtivo(excecoes, ativo, (id) => ramos.get(id) ?? new Set([id]));
}

/** A regra no ativo: na do toner, os parâmetros do "Outro limite" da exceção dele. */
const regraNoAtivo = (dados: RegraDoEstado, excecao: ExcecaoDaRegra | null): RegraDoEstado =>
  dados.condicao === 'toner.nivel' && excecao?.efeito === 'outro-limite'
    ? { ...dados, parametros: parametrosNoAtivo(dados.parametros, excecao) }
    : dados;

/** Na regra do toner, o maior limite entre o dela e o das exceções, para a consulta trazer todos. */
function comOMaiorLimite(dados: RegraDoEstado): RegraDoEstado {
  if (dados.condicao !== 'toner.nivel') return dados;
  const limites = (dados.excecoes ?? []).flatMap((excecao) =>
    excecao.efeito === 'outro-limite' ? [excecao.limite] : [],
  );
  return {
    ...dados,
    parametros: { ...dados.parametros, limite: Math.max(dados.parametros.limite, ...limites) },
  };
}

/** Os ativos ativos que a regra alcança: os dos tipos com a capacidade, dentro do escopo. */
export async function ativosDoEscopo(
  escopo: EscopoDaRegra,
  capacidade: CapacidadeDaCondicao | null,
  contexto: ContextoDaAvaliacao,
): Promise<SQL> {
  const partes: SQL[] = [eq(ativos.situacao, 'ativo')];
  if (capacidade) partes.push(sql`${capacidade}::text = any(${tiposDeAtivo.capacidades})`);
  switch (escopo.tipo) {
    case 'tipo':
      partes.push(eq(ativos.tipoId, escopo.id));
      break;
    case 'modelo':
      partes.push(eq(ativos.modeloId, escopo.id));
      break;
    case 'ativo':
      partes.push(eq(ativos.id, escopo.id));
      break;
    case 'local': {
      const ramo = [...(await contexto.arvore()).ramo(escopo.id)];
      partes.push(ramo.length > 0 ? inArray(ativos.localId, ramo) : sql`false`);
      break;
    }
    case 'organizacao':
      break;
  }
  return and(...partes) as SQL;
}

/** O filtro das linhas que podem disparar a condição, para a consulta trazer só elas. */
function queDispara(dados: RegraDoEstado): SQL {
  switch (dados.condicao) {
    case 'rede.offline':
      return eq(estadoDosAtivos.valorTexto, 'offline');
    case 'toner.nivel':
      return lte(estadoDosAtivos.valorNumero, dados.parametros.limite);
    case 'impressora.condicao':
      return ne(estadoDosAtivos.valorTexto, '[]');
    case 'controlid.situacao':
      return inArray(estadoDosAtivos.valorTexto, dados.parametros.situacoes);
  }
}

/** Os itens dos alertas que uma linha pode abrir: cada condição da impressora, ou o item dela. */
function itensDaLinha(dados: RegraDoEstado, linha: LeituraDoEstado & { item: string }): string[] {
  if (dados.condicao !== 'impressora.condicao') return [linha.item];
  try {
    const lidas: unknown = JSON.parse(linha.valorTexto ?? '');
    return Array.isArray(lidas)
      ? dados.parametros.condicoes.filter((condicao) => lidas.includes(condicao))
      : [];
  } catch {
    return [];
  }
}

const ATIVO_DA_EXCECAO = {
  tipoId: ativos.tipoId,
  modeloId: ativos.modeloId,
  localId: ativos.localId,
};

const COLUNAS_DO_ESTADO = {
  ativoId: estadoDosAtivos.ativoId,
  item: estadoDosAtivos.item,
  situacao: estadoDosAtivos.situacao,
  valorNumero: estadoDosAtivos.valorNumero,
  valorTexto: estadoDosAtivos.valorTexto,
  detalhes: estadoDosAtivos.detalhes,
};

/**
 * As observações de uma regra das condições do estado atual: as linhas que disparam, dentro do
 * escopo, e cada alerta não resolvido dela, pela linha do ativo dele, ou fora da regra quando o
 * ativo saiu do escopo.
 */
async function observarPeloEstado(
  tx: Transacao,
  dados: RegraDoEstado,
  existentes: readonly AlertaNaoResolvido[],
  contexto: ContextoDaAvaliacao,
): Promise<Observado[]> {
  if (!contexto.ativosLigado) {
    return existentes.map((alerta) => ({ ...alerta, observacao: FORA_DA_REGRA }));
  }
  const metrica = METRICA_DA_CONDICAO[dados.condicao];
  const noEscopo = await ativosDoEscopo(
    dados.escopo,
    condicaoDe(dados.condicao)?.capacidade ?? null,
    contexto,
  );
  const daExcecao = await excecaoPorAtivo(dados, contexto);
  const disparando = await tx
    .select({ ...COLUNAS_DO_ESTADO, ...ATIVO_DA_EXCECAO })
    .from(estadoDosAtivos)
    .innerJoin(ativos, eq(ativos.id, estadoDosAtivos.ativoId))
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .where(
      and(
        eq(estadoDosAtivos.metrica, metrica),
        eq(estadoDosAtivos.situacao, 'valida'),
        queDispara(comOMaiorLimite(dados)),
        noEscopo,
      ),
    );
  const observados = new Map<string, Observado>();
  for (const linha of disparando) {
    const excecao = daExcecao?.({ id: linha.ativoId, ...linha }) ?? null;
    if (excecao?.efeito === 'nao-alertar') continue;
    const noAtivo = regraNoAtivo(dados, excecao);
    // O SQL trouxe até o maior limite: a linha acima do limite do ativo não dispara.
    if (
      noAtivo.condicao === 'toner.nivel' &&
      (linha.valorNumero ?? 0) > noAtivo.parametros.limite
    ) {
      continue;
    }
    for (const item of itensDaLinha(noAtivo, linha)) {
      const observado = {
        ativoId: linha.ativoId,
        coletorId: null,
        item,
        observacao: observarLeitura(noAtivo, linha, item),
      };
      observados.set(chave(observado), observado);
    }
  }

  const ativosDosExistentes = [
    ...new Set(existentes.flatMap((alerta) => (alerta.ativoId ? [alerta.ativoId] : []))),
  ];
  if (ativosDosExistentes.length === 0) return [...observados.values()];
  const aindaNoEscopo = new Map(
    (
      await tx
        .select({ id: ativos.id, ...ATIVO_DA_EXCECAO })
        .from(ativos)
        .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
        .where(and(inArray(ativos.id, ativosDosExistentes), noEscopo))
    ).map((ativo) => [ativo.id, ativo]),
  );
  const linhas = await tx
    .select(COLUNAS_DO_ESTADO)
    .from(estadoDosAtivos)
    .where(
      and(
        eq(estadoDosAtivos.metrica, metrica),
        inArray(estadoDosAtivos.ativoId, ativosDosExistentes),
      ),
    );
  const porLinha = new Map(linhas.map((linha) => [`${linha.ativoId}|${linha.item}`, linha]));
  // A linha das condições da impressora é do item vazio; a de cada toner, do item dele.
  const linhaDe = (ativoId: string, item: string) =>
    porLinha.get(`${ativoId}|${dados.condicao === 'impressora.condicao' ? '' : item}`) ?? null;
  for (const alerta of existentes) {
    if (observados.has(chave(alerta)) || !alerta.ativoId) continue;
    const ativo = aindaNoEscopo.get(alerta.ativoId);
    const excecao = ativo ? (daExcecao?.(ativo) ?? null) : null;
    observados.set(chave(alerta), {
      ativoId: alerta.ativoId,
      coletorId: null,
      item: alerta.item,
      observacao:
        ativo && excecao?.efeito !== 'nao-alertar'
          ? observarLeitura(
              regraNoAtivo(dados, excecao),
              linhaDe(alerta.ativoId, alerta.item),
              alerta.item,
            )
          : FORA_DA_REGRA,
    });
  }
  return [...observados.values()];
}

/** A métrica que diz quando cada coleta leu o ativo pela última vez, e a capacidade dela. */
const ATRASO_DA_COLETA: Record<TipoDeColeta, { metrica: MetricaDaColeta; capacidade: string }> = {
  ping: { metrica: 'rede.disponibilidade', capacidade: 'rede.disponibilidade' },
  snmp: { metrica: 'snmp.resposta', capacidade: 'snmp.suprimentos' },
  controlid: { metrica: 'controlid.sondagem', capacidade: 'controlid.saude' },
};

/** Os alertas não resolvidos sem uma observação desta avaliação ficam fora da regra. */
function comOsExistentes(
  observados: Map<string, Observado>,
  existentes: readonly AlertaNaoResolvido[],
): Observado[] {
  for (const alerta of existentes) {
    if (!observados.has(chave(alerta))) {
      observados.set(chave(alerta), { ...alerta, observacao: FORA_DA_REGRA });
    }
  }
  return [...observados.values()];
}

/**
 * A coleta atrasada de cada capacidade de cada ativo que um coletor ainda lê, dentro do escopo: a
 * última leitura dela e o último contato do coletor que a gravou. O ativo nunca lido fica de fora,
 * e o alerta do ativo que o coletor deixou de ler é encerrado.
 */
async function observarAtrasos(
  tx: Transacao,
  dados: Extract<DadosDaRegra, { condicao: 'coleta.atrasada' }>,
  existentes: readonly AlertaNaoResolvido[],
  contexto: ContextoDaAvaliacao,
): Promise<Observado[]> {
  if (!contexto.ativosLigado) {
    return existentes.map((alerta) => ({ ...alerta, observacao: FORA_DA_REGRA }));
  }
  const doEscopo =
    dados.escopo.tipo === 'organizacao'
      ? null
      : new Set(
          (
            await tx
              .select({ id: ativos.id })
              .from(ativos)
              .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
              .where(await ativosDoEscopo(dados.escopo, null, contexto))
          ).map((ativo) => ativo.id),
        );
  const daExcecao = await excecaoPorAtivo(dados, contexto);
  const doEscopoELido = (await contexto.alvos()).filter(
    (alvo) => alvo.coletorId !== null && (doEscopo === null || doEscopo.has(alvo.ativoId)),
  );
  // Na coleta atrasada, só o "Não alertar" vale.
  const foraDaRegra = new Set<string>();
  if (daExcecao && doEscopoELido.length > 0) {
    for (const ativo of await tx
      .select({ id: ativos.id, ...ATIVO_DA_EXCECAO })
      .from(ativos)
      .where(inArray(ativos.id, [...new Set(doEscopoELido.map((alvo) => alvo.ativoId))]))) {
      if (daExcecao(ativo)?.efeito === 'nao-alertar') foraDaRegra.add(ativo.id);
    }
  }
  const alvos = doEscopoELido.filter((alvo) => !foraDaRegra.has(alvo.ativoId));
  const observados = new Map<string, Observado>();
  if (alvos.length > 0) {
    const estados = await tx
      .select({
        ativoId: estadoDosAtivos.ativoId,
        metrica: estadoDosAtivos.metrica,
        momento: estadoDosAtivos.momento,
        coletorId: estadoDosAtivos.coletorId,
      })
      .from(estadoDosAtivos)
      .where(
        inArray(
          estadoDosAtivos.metrica,
          Object.values(ATRASO_DA_COLETA).map(({ metrica }) => metrica),
        ),
      );
    const estadoDe = new Map(
      estados.map((estado) => [`${estado.ativoId}|${estado.metrica}`, estado]),
    );
    const contatos = new Map(
      (
        await tx
          .select({ id: coletores.id, ultimoContatoEm: coletores.ultimoContatoEm })
          .from(coletores)
      ).map((coletor) => [coletor.id, coletor.ultimoContatoEm]),
    );
    const comAlerta = new Set(existentes.map(chave));
    for (const alvo of alvos) {
      const { metrica, capacidade } = ATRASO_DA_COLETA[alvo.coleta];
      const estado = estadoDe.get(`${alvo.ativoId}|${metrica}`);
      if (!estado) continue;
      const observado: Observado = {
        ativoId: alvo.ativoId,
        coletorId: null,
        item: capacidade,
        observacao: observarColetaAtrasada({
          momento: estado.momento,
          ultimoContato: contatos.get(estado.coletorId) ?? null,
          intervalo: INTERVALOS_DAS_METRICAS[metrica],
          ciclos: dados.parametros.ciclos,
          agora: contexto.agora,
          item: capacidade,
        }),
      };
      if (observado.observacao.tipo === 'dispara' || comAlerta.has(chave(observado))) {
        observados.set(chave(observado), observado);
      }
    }
  }
  return comOsExistentes(observados, existentes);
}

/** O último contato de cada coletor ativo; o alerta do coletor inativado é encerrado. */
async function observarColetores(
  tx: Transacao,
  dados: Extract<DadosDaRegra, { condicao: 'coletor.sem-contato' }>,
  existentes: readonly AlertaNaoResolvido[],
  contexto: ContextoDaAvaliacao,
): Promise<Observado[]> {
  const comAlerta = new Set(existentes.map(chave));
  const observados = new Map<string, Observado>();
  for (const coletor of await tx
    .select({ id: coletores.id, ultimoContatoEm: coletores.ultimoContatoEm })
    .from(coletores)
    .where(eq(coletores.situacao, 'ativo'))) {
    const observado: Observado = {
      ativoId: null,
      coletorId: coletor.id,
      item: '',
      observacao: observarColetor({
        ultimoContato: coletor.ultimoContatoEm,
        minutos: dados.parametros.minutos,
        agora: contexto.agora,
      }),
    };
    if (observado.observacao.tipo === 'dispara' || comAlerta.has(chave(observado))) {
      observados.set(chave(observado), observado);
    }
  }
  return comOsExistentes(observados, existentes);
}

/** As observações de uma regra ativa, pela condição dela. */
async function observar(
  tx: Transacao,
  dados: DadosDaRegra,
  existentes: readonly AlertaNaoResolvido[],
  contexto: ContextoDaAvaliacao,
): Promise<Observado[]> {
  if (doEstado(dados)) return observarPeloEstado(tx, dados, existentes, contexto);
  if (dados.condicao === 'coleta.atrasada') return observarAtrasos(tx, dados, existentes, contexto);
  return observarColetores(tx, dados, existentes, contexto);
}

/** Quem viu a mudança na tela: o ativo ou o coletor de cada alerta que mudou. */
interface MudancaNaTela {
  ativoId: string | null;
}

/** Um alerta que abriu nesta avaliação fora do silêncio, e que por isso notifica. */
interface AbertoNaAvaliacao {
  id: string;
  ativoId: string | null;
  coletorId: string | null;
  severidade: SeveridadeDoAlerta;
  texto: string;
}

/**
 * Decide cada alvo e item da regra e grava; devolve o que a tela passa a mostrar diferente e os
 * alertas que abriram fora do silêncio.
 */
async function aplicar(
  tx: Transacao,
  regra: LinhaDaRegra,
  existentes: readonly AlertaNaoResolvido[],
  observados: readonly Observado[],
  contexto: ContextoDaAvaliacao,
): Promise<{ mudancas: MudancaNaTela[]; abertos: AbertoNaAvaliacao[] }> {
  const { agora } = contexto;
  const mudancas: MudancaNaTela[] = [];
  const abertos: AbertoNaAvaliacao[] = [];
  // Os novos, os resolvidos e os descartados vão em lotes, para a primeira avaliação de uma
  // organização grande não fazer uma escrita por alerta.
  const novos: Omit<typeof alertas.$inferInsert, 'orgId'>[] = [];
  const resolvidos = new Map<'voltou-ao-normal' | 'regra-deixou-de-valer', string[]>();
  const descartados: string[] = [];
  const porChave = new Map(existentes.map((alerta) => [chave(alerta), alerta]));
  const alvos = new Map<string, Observado>(
    existentes.map((alerta) => [chave(alerta), { ...alerta, observacao: SEM_DADO }]),
  );
  for (const observado of observados) alvos.set(chave(observado), observado);
  for (const [chaveDoAlvo, alvo] of alvos) {
    const alerta = porChave.get(chaveDoAlvo) ?? null;
    const decisao = decidirAlerta({
      alerta,
      observacao: alvo.observacao,
      regra: { duracao: regra.duracao, severidade: regra.severidade },
      silenciado: alvo.ativoId !== null && contexto.silenciados.has(alvo.ativoId),
      agora,
    });
    switch (decisao.acao) {
      case 'nada':
        break;
      case 'criar':
        novos.push({
          regraId: regra.id,
          ativoId: alvo.ativoId,
          coletorId: alvo.coletorId,
          item: alvo.item,
          situacao: decisao.abrir ? 'aberto' : 'pendente',
          severidade: decisao.severidade,
          texto: decisao.texto,
          observadoEm: agora,
          abertoEm: decisao.abrir ? agora : null,
          abertoNoSilencio: decisao.abertoNoSilencio,
          atualizadoEm: agora,
        });
        if (decisao.abrir) mudancas.push({ ativoId: alvo.ativoId });
        break;
      case 'atualizar':
        if (!alerta) break;
        await tx
          .update(alertas)
          .set({
            texto: decisao.texto,
            severidade: decisao.severidade,
            atualizadoEm: agora,
            ...(decisao.abrir
              ? { situacao: 'aberto', abertoEm: agora, abertoNoSilencio: decisao.abertoNoSilencio }
              : {}),
          })
          .where(eq(alertas.id, alerta.id));
        if (decisao.naTela) mudancas.push({ ativoId: alvo.ativoId });
        if (decisao.abrir && !decisao.abertoNoSilencio) {
          abertos.push({
            id: alerta.id,
            ativoId: alvo.ativoId,
            coletorId: alvo.coletorId,
            severidade: decisao.severidade,
            texto: decisao.texto,
          });
        }
        break;
      case 'resolver':
        if (!alerta) break;
        resolvidos.set(decisao.como, [...(resolvidos.get(decisao.como) ?? []), alerta.id]);
        mudancas.push({ ativoId: alvo.ativoId });
        break;
      case 'descartar':
        if (alerta) descartados.push(alerta.id);
        break;
    }
  }
  for (let inicio = 0; inicio < novos.length; inicio += LOTE_DE_ESCRITA) {
    const criados = await tx
      .insert(alertas)
      .values(
        novos
          .slice(inicio, inicio + LOTE_DE_ESCRITA)
          .map((novo) => ({ ...novo, orgId: sql`app.current_org()` })),
      )
      .returning({
        id: alertas.id,
        ativoId: alertas.ativoId,
        coletorId: alertas.coletorId,
        severidade: alertas.severidade,
        texto: alertas.texto,
        situacao: alertas.situacao,
        abertoNoSilencio: alertas.abertoNoSilencio,
      });
    for (const criado of criados) {
      if (criado.situacao !== 'aberto' || criado.abertoNoSilencio) continue;
      abertos.push({
        id: criado.id,
        ativoId: criado.ativoId,
        coletorId: criado.coletorId,
        severidade: criado.severidade,
        texto: criado.texto,
      });
    }
  }
  for (const [como, ids] of resolvidos) {
    for (let inicio = 0; inicio < ids.length; inicio += LOTE_DE_ESCRITA) {
      await tx
        .update(alertas)
        .set({ situacao: 'resolvido', resolvidoEm: agora, comoTerminou: como, atualizadoEm: agora })
        .where(inArray(alertas.id, ids.slice(inicio, inicio + LOTE_DE_ESCRITA)));
    }
  }
  for (let inicio = 0; inicio < descartados.length; inicio += LOTE_DE_ESCRITA) {
    await tx
      .delete(alertas)
      .where(inArray(alertas.id, descartados.slice(inicio, inicio + LOTE_DE_ESCRITA)));
  }
  return { mudancas, abertos };
}

async function lerContexto(
  tx: Transacao,
  agora: Date,
  desligados: readonly string[],
): Promise<ContextoDaAvaliacao> {
  const silenciados = await tx
    .select({ ativoId: silenciosDosAtivos.ativoId })
    .from(silenciosDosAtivos)
    .where(or(isNull(silenciosDosAtivos.ate), gt(silenciosDosAtivos.ate, agora)));
  let arvore: Promise<ArvoreDeLocais> | undefined;
  let alvos: Promise<AlvoDaColeta[]> | undefined;
  return {
    agora,
    ativosLigado: !desligados.includes('ativos'),
    silenciados: new Set(silenciados.map((silencio) => silencio.ativoId)),
    arvore: () => {
      arvore ??= lerArvore(tx);
      return arvore;
    },
    alvos: () => {
      alvos ??= alvosDaColeta(tx);
      return alvos;
    },
  };
}

/**
 * As notificações dos alertas que abriram (design do P3b, decisões 3 e 4): o acesso das contas
 * ativas, lido uma vez, decide quem vê cada um, pelo local do ativo; o ativo vai pelo rótulo e pelo
 * patrimônio, e o coletor, pelo nome.
 */
async function notificarOsAbertos(
  tx: Transacao,
  abertos: readonly AbertoNaAvaliacao[],
  contexto: ContextoDaAvaliacao,
) {
  if (abertos.length === 0) return;
  const contas = await carregarAcessosDaOrganizacao(tx);
  if (contas.length === 0) return;
  const ativoIds = [...new Set(abertos.flatMap(({ ativoId }) => (ativoId ? [ativoId] : [])))];
  const coletorIds = [
    ...new Set(abertos.flatMap(({ coletorId }) => (coletorId ? [coletorId] : []))),
  ];
  const dosAtivos = new Map(
    (ativoIds.length > 0
      ? await tx
          .select({
            id: ativos.id,
            nome: ativos.nome,
            patrimonio: ativos.patrimonio,
            localId: ativos.localId,
            fabricante: modelos.fabricante,
            modelo: modelos.nome,
            tipo: tiposDeAtivo.nome,
          })
          .from(ativos)
          .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
          .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
          .where(inArray(ativos.id, ativoIds))
      : []
    ).map((ativo) => [ativo.id, ativo]),
  );
  const dosColetores = new Map(
    (coletorIds.length > 0
      ? await tx
          .select({ id: coletores.id, nome: coletores.nome })
          .from(coletores)
          .where(inArray(coletores.id, coletorIds))
      : []
    ).map((coletor) => [coletor.id, coletor.nome]),
  );
  const daAvaliacao: AlertaQueAbriu[] = abertos.map((aberto) => {
    const ativo = aberto.ativoId ? dosAtivos.get(aberto.ativoId) : undefined;
    if (ativo) {
      const rotulo = rotuloDoAtivo({
        nome: ativo.nome,
        modelo:
          ativo.fabricante !== null && ativo.modelo !== null
            ? { fabricante: ativo.fabricante, nome: ativo.modelo }
            : null,
        tipo: { nome: ativo.tipo },
      });
      return {
        id: aberto.id,
        severidade: aberto.severidade,
        texto: aberto.texto,
        localId: ativo.localId,
        descricao: ativo.patrimonio ? `${rotulo} · ${ativo.patrimonio}` : rotulo,
        destino: `/ativos/${ativo.id}`,
      };
    }
    return {
      id: aberto.id,
      severidade: aberto.severidade,
      texto: aberto.texto,
      localId: null,
      descricao: dosColetores.get(aberto.coletorId ?? '') ?? 'Coletor',
      destino: `/administracao/coletores/${aberto.coletorId}`,
    };
  });
  await notificar(
    tx,
    notificacoesDosAlertas(daAvaliacao, contas, await contexto.arvore()),
    contexto.agora,
    { enviar: contexto.enviar },
  );
}

/** O evento dos alertas que mudaram, para quem os vê nos locais dos ativos deles. */
async function avisarAsTelas(tx: Transacao, mudancas: readonly MudancaNaTela[]) {
  const ativoIds = [
    ...new Set(mudancas.flatMap((mudanca) => (mudanca.ativoId ? [mudanca.ativoId] : []))),
  ];
  const locais = new Set<string | null>();
  if (mudancas.some((mudanca) => mudanca.ativoId === null)) locais.add(null);
  if (ativoIds.length > 0) {
    for (const ativo of await tx
      .select({ localId: ativos.localId })
      .from(ativos)
      .where(inArray(ativos.id, ativoIds))) {
      locais.add(ativo.localId);
    }
  }
  await registrarEvento(tx, {
    tipo: 'alertas.mudaram',
    alvo: null,
    publico: { permissao: 'alertas.ver', locais: [...locais] },
  });
}

/** Avalia as regras da organização do contexto da transação, no momento dado. */
export async function avaliarOrganizacao(
  tx: Transacao,
  { agora, enviar }: { agora: Date; enviar?: EnviarTarefa },
): Promise<{ mudou: boolean }> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('alertas'), hashtext(app.current_org()::text))`,
  );
  const [organizacao] = await tx
    .select({ desligados: organizacoes.modulosDesligados })
    .from(organizacoes);
  const desligados = organizacao?.desligados ?? [];
  if (desligados.includes('alertas')) return { mudou: false };
  await garantirRegrasDeFabrica(tx, { ator: ATOR_DA_FABRICA, momento: agora });
  const mudancas: MudancaNaTela[] = [];
  // O adiamento e o silêncio vencidos saem: o alerta volta à tela inicial, se continuar aberto.
  mudancas.push(
    ...(await tx
      .update(alertas)
      .set({ adiadoAte: null, adiadoPor: null })
      .where(and(ne(alertas.situacao, 'resolvido'), lte(alertas.adiadoAte, agora)))
      .returning({ ativoId: alertas.ativoId })),
    ...(await tx
      .delete(silenciosDosAtivos)
      .where(lte(silenciosDosAtivos.ate, agora))
      .returning({ ativoId: silenciosDosAtivos.ativoId })),
  );
  const contexto = { ...(await lerContexto(tx, agora, desligados)), enviar };
  const regras = await tx.select().from(regrasDeAlerta);
  const naoResolvidos = (await tx
    .select({
      id: alertas.id,
      regraId: alertas.regraId,
      ativoId: alertas.ativoId,
      coletorId: alertas.coletorId,
      item: alertas.item,
      situacao: alertas.situacao,
      observadoEm: alertas.observadoEm,
      texto: alertas.texto,
      severidade: alertas.severidade,
    })
    .from(alertas)
    .where(ne(alertas.situacao, 'resolvido'))) as AlertaNaoResolvido[];
  const abertos: AbertoNaAvaliacao[] = [];
  for (const regra of regras) {
    const existentes = naoResolvidos.filter((alerta) => alerta.regraId === regra.id);
    const observados =
      regra.situacao === 'ativa'
        ? await observar(tx, dadosDaLinha(regra), existentes, contexto)
        : existentes.map((alerta) => ({ ...alerta, observacao: FORA_DA_REGRA }));
    if (observados.length === 0 && existentes.length === 0) continue;
    const aplicado = await aplicar(tx, regra, existentes, observados, contexto);
    mudancas.push(...aplicado.mudancas);
    abertos.push(...aplicado.abertos);
  }
  if (mudancas.length > 0) await avisarAsTelas(tx, mudancas);
  await notificarOsAbertos(tx, abertos, contexto);
  return { mudou: mudancas.length > 0 };
}
