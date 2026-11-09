// O lote de leituras que o coletor manda (spec coletor-local, "Lotes de leituras", e
// leituras-e-estado; design do P2a, decisão 4, do P2b, decisões 1 e 7, e do P2c, decisão 6): a chave
// única, até 1.000 leituras, o momento dentro do prazo, o item de cada suprimento e contador, os
// detalhes e o valor de cada métrica. A falha vira "sem dado", e o valor fora da faixa válida é
// guardado como inconsistente, sem recusar o lote.
import {
  ETAPAS_DA_SONDAGEM,
  SITUACOES_DA_SONDAGEM,
  TEXTO_MAXIMO_DA_SONDAGEM,
} from './control-id.ts';
import { CONDICOES_DA_IMPRESSORA, NIVEL_HA_SUPRIMENTO } from './impressoras.ts';
import {
  METRICAS_COM_ITEM,
  type MetricaDaColeta,
  metricaDaColeta,
  type SituacaoDaLeitura,
} from './metricas.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** O item de um suprimento ou contador: o índice dele na impressora, inteiro e positivo. */
const ITEM = /^[1-9]\d{0,9}$/;

/** Quantas leituras cabem num lote. */
export const LIMITE_DO_LOTE = 1000;
/** O quanto o relógio do coletor pode estar adiantado, em ms. */
const FUTURO_ACEITO = 5 * 60_000;
/** A leitura mais antiga que a retenção já nasceria apagada. */
const PASSADO_ACEITO = 30 * 24 * 60 * 60_000;
/** A latência válida vai de 0 ao tempo de espera do ping, em ms. */
const LATENCIA_MAXIMA = 2000;
/** As listas de condições e de mensagens: até 32 textos, cada um de até 200 caracteres. */
const ITENS_DA_LISTA = 32;
const TEXTO_MAXIMO = 200;

/** Os detalhes de um item, como a descrição, a capacidade e o nível de um suprimento. */
export type DetalhesDaLeitura = Readonly<Record<string, string | number>>;

export interface LeituraDaColeta {
  ativoId: string;
  metrica: MetricaDaColeta;
  /** O item, como o suprimento ou o contador; vazio nas métricas de um valor por ativo. */
  item: string;
  momento: Date;
  valorTexto: string | null;
  valorNumero: number | null;
  situacao: SituacaoDaLeitura;
  detalhes: DetalhesDaLeitura | null;
}

export interface LoteDaColeta {
  chave: string;
  leituras: LeituraDaColeta[];
}

export type LeituraDoLote = { ok: true; lote: LoteDaColeta } | { ok: false; erro: string };

type ValorLido = Pick<LeituraDaColeta, 'valorTexto' | 'valorNumero' | 'situacao'>;

/** As condições que a lista pode trazer, pelas chaves do domínio. */
const CHAVES_DAS_CONDICOES: ReadonlySet<unknown> = new Set(
  CONDICOES_DA_IMPRESSORA.map((condicao) => condicao.chave),
);

const semDado: ValorLido = { valorTexto: null, valorNumero: null, situacao: 'sem-dado' };
const nada = (valor: unknown) => valor === null || valor === undefined;
const inteiro = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isInteger(valor);

/** O item da leitura, ou o motivo de recusá-la. */
function lerItem(metrica: MetricaDaColeta, item: unknown): string | { erro: string } {
  if (METRICAS_COM_ITEM.includes(metrica)) {
    return typeof item === 'string' && ITEM.test(item)
      ? item
      : { erro: `o item de ${metrica} é um número inteiro positivo.` };
  }
  return nada(item) || item === '' ? '' : { erro: `a métrica ${metrica} não tem item.` };
}

/** Os detalhes do item, ou o motivo de recusar a leitura. */
function lerDetalhes(
  metrica: MetricaDaColeta,
  detalhes: unknown,
): { detalhes: DetalhesDaLeitura | null } | { erro: string } {
  const objeto =
    typeof detalhes === 'object' && detalhes !== null && !Array.isArray(detalhes)
      ? (detalhes as Record<string, unknown>)
      : null;
  switch (metrica) {
    case 'impressora.suprimento': {
      const { descricao, capacidade, nivel } = objeto ?? {};
      return typeof descricao === 'string' &&
        descricao.length <= TEXTO_MAXIMO &&
        inteiro(capacidade) &&
        inteiro(nivel)
        ? { detalhes: { descricao, capacidade, nivel } }
        : {
            erro: 'o suprimento traz a descrição, a capacidade e o nível que a impressora informa.',
          };
    }
    case 'impressora.contador': {
      if (nada(detalhes)) return { detalhes: null };
      const recusa = { erro: 'os detalhes do contador trazem só o número de cores do marcador.' };
      if (!objeto || Object.keys(objeto).some((chave) => chave !== 'cores')) return recusa;
      if (objeto.cores === undefined) return { detalhes: null };
      return inteiro(objeto.cores) && objeto.cores >= 0
        ? { detalhes: { cores: objeto.cores } }
        : recusa;
    }
    case 'controlid.sondagem': {
      if (nada(detalhes)) return { detalhes: null };
      const recusa = {
        erro: 'os detalhes da sondagem trazem a etapa, login ou informacoes, e o código HTTP.',
      };
      if (!objeto || Object.keys(objeto).some((chave) => chave !== 'etapa' && chave !== 'codigo')) {
        return recusa;
      }
      const { etapa, codigo } = objeto;
      if (!(ETAPAS_DA_SONDAGEM as readonly unknown[]).includes(etapa)) return recusa;
      if (codigo === undefined) return { detalhes: { etapa: etapa as string } };
      return inteiro(codigo) && codigo >= 100 && codigo <= 599
        ? { detalhes: { etapa: etapa as string, codigo } }
        : recusa;
    }
    case 'controlid.firmware': {
      if (nada(detalhes)) return { detalhes: null };
      const { produto } = objeto ?? {};
      const valido =
        objeto !== null &&
        Object.keys(objeto).every((chave) => chave === 'produto') &&
        (produto === undefined ||
          (typeof produto === 'string' && produto.length <= TEXTO_MAXIMO_DA_SONDAGEM));
      if (!valido) {
        return {
          erro: `os detalhes do firmware trazem só o produto, com até ${TEXTO_MAXIMO_DA_SONDAGEM} caracteres.`,
        };
      }
      return { detalhes: produto === undefined ? null : { produto: produto as string } };
    }
    default:
      return nada(detalhes)
        ? { detalhes: null }
        : { erro: `a métrica ${metrica} não tem detalhes.` };
  }
}

/** Um texto aparado de até `maximo` caracteres: o vazio é sem dado; o que não cabe, a recusa. */
function lerTexto(valor: unknown, maximo: number, recusa: string): ValorLido | string {
  const texto = typeof valor === 'string' ? valor.trim() : null;
  if (texto === null || texto.length > maximo) return recusa;
  return texto === '' ? semDado : { valorTexto: texto, valorNumero: null, situacao: 'valida' };
}

/** A lista de condições ou de mensagens, em JSON, ou nenhuma quando não é uma lista válida. */
function lerLista(valor: unknown): string | null {
  if (!Array.isArray(valor) || valor.length > ITENS_DA_LISTA) return null;
  const valida = valor.every((texto) => typeof texto === 'string' && texto.length <= TEXTO_MAXIMO);
  return valida ? JSON.stringify(valor) : null;
}

/** O valor de cada métrica, ou o motivo de recusar a leitura. */
function lerValor(
  metrica: MetricaDaColeta,
  valor: unknown,
  detalhes: DetalhesDaLeitura | null,
): ValorLido | string {
  // O suprimento que só diz haver suprimento é válido, sem número; o nível bruto fica nos detalhes.
  if (
    metrica === 'impressora.suprimento' &&
    nada(valor) &&
    detalhes?.nivel === NIVEL_HA_SUPRIMENTO
  ) {
    return { valorTexto: null, valorNumero: null, situacao: 'valida' };
  }
  if (nada(valor)) return semDado;
  switch (metrica) {
    case 'rede.disponibilidade':
      return valor === 'online' || valor === 'offline'
        ? { valorTexto: valor, valorNumero: null, situacao: 'valida' }
        : 'a disponibilidade é online, offline ou sem dado.';
    case 'rede.latencia':
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        return 'a latência é um número de milissegundos ou sem dado.';
      }
      return {
        valorTexto: null,
        valorNumero: valor,
        situacao: valor >= 0 && valor <= LATENCIA_MAXIMA ? 'valida' : 'inconsistente',
      };
    case 'snmp.resposta':
      return valor === 'respondeu' || valor === 'nao-respondeu'
        ? { valorTexto: valor, valorNumero: null, situacao: 'valida' }
        : 'a resposta do SNMP é respondeu, nao-respondeu ou sem dado.';
    case 'impressora.suprimento':
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        return 'o nível do suprimento é um percentual ou sem dado.';
      }
      return {
        valorTexto: null,
        valorNumero: valor,
        situacao: valor >= 0 && valor <= 100 ? 'valida' : 'inconsistente',
      };
    case 'impressora.contador':
      if (!inteiro(valor)) return 'o contador é um número inteiro de páginas ou sem dado.';
      return {
        valorTexto: null,
        valorNumero: valor,
        situacao: valor >= 0 ? 'valida' : 'inconsistente',
      };
    case 'impressora.condicoes':
    case 'impressora.mensagens': {
      const lista = lerLista(valor);
      const desconhecida =
        metrica === 'impressora.condicoes' && Array.isArray(valor)
          ? valor.find((chave) => !CHAVES_DAS_CONDICOES.has(chave))
          : undefined;
      if (lista !== null && desconhecida !== undefined) {
        return `condição desconhecida: ${String(desconhecida)}.`;
      }
      if (lista === null) {
        const quais = metrica === 'impressora.condicoes' ? 'as condições' : 'as mensagens';
        return `${quais} vêm numa lista de até ${ITENS_DA_LISTA} textos de até ${TEXTO_MAXIMO} caracteres.`;
      }
      return { valorTexto: lista, valorNumero: null, situacao: 'valida' };
    }
    case 'impressora.serie':
    case 'controlid.serie': {
      const maximo = metrica === 'controlid.serie' ? TEXTO_MAXIMO_DA_SONDAGEM : TEXTO_MAXIMO;
      return lerTexto(
        valor,
        maximo,
        `o número de série é um texto de até ${maximo} caracteres ou sem dado.`,
      );
    }
    case 'controlid.sondagem':
      return (SITUACOES_DA_SONDAGEM as readonly unknown[]).includes(valor)
        ? { valorTexto: valor as string, valorNumero: null, situacao: 'valida' }
        : `a sondagem do Control iD é ${SITUACOES_DA_SONDAGEM.slice(0, -1).join(', ')}, ${SITUACOES_DA_SONDAGEM.at(-1)} ou sem dado.`;
    case 'controlid.firmware':
      return lerTexto(
        valor,
        TEXTO_MAXIMO_DA_SONDAGEM,
        `o firmware é um texto de até ${TEXTO_MAXIMO_DA_SONDAGEM} caracteres ou sem dado.`,
      );
  }
}

function lerLeitura(entrada: unknown, agora: Date): LeituraDaColeta | string {
  const leitura = (entrada ?? {}) as Record<string, unknown>;
  const { ativoId, metrica, momento } = leitura;
  if (typeof ativoId !== 'string' || !UUID.test(ativoId)) return 'o ativo precisa ser um UUID.';
  if (typeof metrica !== 'string' || !metricaDaColeta(metrica)) {
    return `métrica desconhecida: ${String(metrica)}.`;
  }
  const quando = typeof momento === 'string' ? new Date(momento) : new Date(Number.NaN);
  if (Number.isNaN(quando.getTime())) return 'o momento não é válido.';
  if (quando.getTime() - agora.getTime() > FUTURO_ACEITO) {
    return 'o momento está mais de 5 minutos no futuro.';
  }
  if (agora.getTime() - quando.getTime() > PASSADO_ACEITO) return 'o momento tem mais de 30 dias.';
  const item = lerItem(metrica, leitura.item);
  if (typeof item !== 'string') return item.erro;
  const lidos = lerDetalhes(metrica, leitura.detalhes);
  if ('erro' in lidos) return lidos.erro;
  const { detalhes } = lidos;
  const valor = lerValor(metrica, leitura.valor, detalhes);
  if (typeof valor === 'string') return valor;
  return { ativoId: ativoId.toLowerCase(), metrica, momento: quando, ...valor, item, detalhes };
}

/** O lote do coletor, conferido inteiro: uma leitura recusada recusa o lote, dizendo qual. */
export function lerLote(entrada: unknown, agora: Date): LeituraDoLote {
  const lote = (entrada ?? {}) as Record<string, unknown>;
  if (typeof lote.chave !== 'string' || !UUID.test(lote.chave)) {
    return { ok: false, erro: 'A chave do lote precisa ser um UUID.' };
  }
  if (!Array.isArray(lote.leituras) || lote.leituras.length === 0) {
    return { ok: false, erro: 'O lote não tem leituras.' };
  }
  if (lote.leituras.length > LIMITE_DO_LOTE) {
    return { ok: false, erro: 'O lote tem mais de 1.000 leituras.' };
  }
  const leituras: LeituraDaColeta[] = [];
  for (const [indice, item] of lote.leituras.entries()) {
    const lida = lerLeitura(item, agora);
    if (typeof lida === 'string') return { ok: false, erro: `Leitura ${indice + 1}: ${lida}` };
    leituras.push(lida);
  }
  return { ok: true, lote: { chave: lote.chave.toLowerCase(), leituras } };
}
