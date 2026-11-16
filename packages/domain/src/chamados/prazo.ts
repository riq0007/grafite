// O horário da TI e o relógio dos chamados (spec chamados, "Prazo do chamado" e "Horário da TI";
// change chamados-da-ti, design, decisão 3). O chamado copia o prazo do tipo em minutos na
// abertura e guarda o relógio: os segundos contados até a última parada e o instante em que ele
// voltou a contar. No horário da TI, só conta o tempo dentro das janelas dos dias do horário, no
// relógio do fuso dele, com o horário de verão.
import { fusoValido, instanteDoRelogio, relogioDoFuso } from '../fuso.ts';

/** As unidades do prazo do tipo: minutos, horas e dias. */
export const UNIDADES_DO_PRAZO = ['min', 'h', 'd'] as const;
export type UnidadeDoPrazo = (typeof UNIDADES_DO_PRAZO)[number];

/** Os modos de contar o prazo: em horas corridas ou no horário da TI. */
export const MODOS_DO_PRAZO = ['corridas', 'horario'] as const;
export type ModoDoPrazo = (typeof MODOS_DO_PRAZO)[number];

/** Os dias da semana do horário da TI, de segunda (1) a domingo (7), como o banco os guarda. */
export const DIAS_DA_SEMANA_DO_HORARIO = [1, 2, 3, 4, 5, 6, 7] as const;
export type DiaDaSemana = (typeof DIAS_DA_SEMANA_DO_HORARIO)[number];

/** Um prazo como o tipo o escreve, como "8 h" ou "3 dias". */
export interface ValorDoPrazo {
  valor: number;
  unidade: UnidadeDoPrazo;
}

/** O maior número de um prazo do tipo, como em "999 dias". */
export const MAIOR_NUMERO_DO_PRAZO = 999;
/** O maior prazo em minutos: 999 dias de 24 h. O dia útil do horário da TI é mais curto. */
const MAIOR_PRAZO_EM_MINUTOS = MAIOR_NUMERO_DO_PRAZO * 24 * 60;

/** O prazo do tipo: a resposta, a resolução e o modo de contar. */
export interface PrazoDoTipo {
  modo: ModoDoPrazo;
  resposta: ValorDoPrazo;
  resolucao: ValorDoPrazo;
}

/**
 * O prazo que o chamado copia na abertura: os minutos, que não mudam depois, e o valor e a unidade
 * do tipo, só para o texto ("Prazo do tipo, 3 dias úteis, no horário da TI").
 */
export interface PrazoDoChamado {
  modo: ModoDoPrazo;
  respostaMin: number;
  resolucaoMin: number;
  resposta: ValorDoPrazo;
  resolucao: ValorDoPrazo;
}

/**
 * O horário da TI: os dias da semana; o início e o fim, em minutos do dia (de 0 a 1.439), os
 * mesmos em todos os dias; o fuso; e a carga cheia, o número de chamados abertos que enche a barra
 * de carga de uma pessoa.
 */
export interface HorarioDaTi {
  dias: readonly DiaDaSemana[];
  inicio: number;
  fim: number;
  fuso: string;
  cargaCheia: number;
}

/** O horário de quem não mudou o dele: de segunda a sexta, das 08:00 às 18:00, em São Paulo. */
export const HORARIO_DA_TI_PADRAO: HorarioDaTi = {
  dias: [1, 2, 3, 4, 5],
  inicio: 8 * 60,
  fim: 18 * 60,
  fuso: 'America/Sao_Paulo',
  cargaCheia: 5,
};

/**
 * O horário que a tela manda. O formato (os dias de 1 a 7 e o início e o fim em minutos, de 0 a
 * 1.439) é do esquema da rota, que entrega os dias já no tipo; aqui ficam as recusas da spec.
 */
export interface PedidoDoHorario {
  dias: readonly DiaDaSemana[];
  inicio: number;
  fim: number;
  fuso: string;
  cargaCheia: number;
}

export type ConferenciaDoHorario =
  | { ok: true; horario: HorarioDaTi }
  | { ok: false; erros: Partial<Record<keyof PedidoDoHorario, string>> };

const ehDiaDaSemana = (dia: number): dia is DiaDaSemana =>
  (DIAS_DA_SEMANA_DO_HORARIO as readonly number[]).includes(dia);

/** Confere o horário da TI pelas recusas da spec, com os dias sem repetir e em ordem. */
export function conferirHorario(pedido: PedidoDoHorario): ConferenciaDoHorario {
  const erros: Partial<Record<keyof PedidoDoHorario, string>> = {};
  const dias = [...new Set(pedido.dias)].sort((a, b) => a - b);
  if (dias.length === 0) erros.dias = 'Escolha ao menos um dia.';
  if (!(pedido.fim > pedido.inicio)) erros.fim = 'O fim vem depois do início.';
  if (!fusoValido(pedido.fuso.trim())) erros.fuso = 'Escolha um fuso da lista.';
  const carga = pedido.cargaCheia;
  if (!(Number.isInteger(carga) && carga >= 1 && carga <= 20)) {
    erros.cargaCheia = 'Use um número inteiro de 1 a 20.';
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    horario: {
      dias,
      inicio: pedido.inicio,
      fim: pedido.fim,
      fuso: pedido.fuso.trim(),
      cargaCheia: carga,
    },
  };
}

/**
 * Um prazo do tipo em minutos: a hora vale 60 min; o dia, 24 h em horas corridas e, no horário da
 * TI, o comprimento de um dia do horário (o dia útil).
 */
export function minutosDoPrazo(
  { valor, unidade }: ValorDoPrazo,
  modo: ModoDoPrazo,
  horario: HorarioDaTi,
): number {
  if (unidade === 'min') return valor;
  if (unidade === 'h') return valor * 60;
  return valor * (modo === 'horario' ? horario.fim - horario.inicio : 24 * 60);
}

const ehRegistro = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null;

const inteiroEntre = (valor: unknown, menor: number, maior: number): valor is number =>
  Number.isInteger(valor) && (valor as number) >= menor && (valor as number) <= maior;

const ehUnidade = (valor: unknown): valor is UnidadeDoPrazo =>
  (UNIDADES_DO_PRAZO as readonly unknown[]).includes(valor);

const ehModo = (valor: unknown): valor is ModoDoPrazo =>
  (MODOS_DO_PRAZO as readonly unknown[]).includes(valor);

function lerValorDoPrazo(valor: unknown): ValorDoPrazo | null {
  if (!ehRegistro(valor)) return null;
  const { valor: numero, unidade } = valor;
  if (!inteiroEntre(numero, 1, MAIOR_NUMERO_DO_PRAZO) || !ehUnidade(unidade)) return null;
  return { valor: numero, unidade };
}

/**
 * O prazo copiado na abertura, conferido na leitura, só com o que ele tem; `null` no estragado. O
 * banco guarda o prazo num documento sem conferência, e o estragado faria o relógio contar errado
 * ou o `momentoEmQueAlcanca` recusar o tempo. Os minutos vão de 1 ao maior prazo, 999 dias de 24 h.
 */
export function lerPrazoDoChamado(valor: unknown): PrazoDoChamado | null {
  if (!ehRegistro(valor)) return null;
  const { modo, respostaMin, resolucaoMin } = valor;
  const resposta = lerValorDoPrazo(valor.resposta);
  const resolucao = lerValorDoPrazo(valor.resolucao);
  if (
    !ehModo(modo) ||
    !inteiroEntre(respostaMin, 1, MAIOR_PRAZO_EM_MINUTOS) ||
    !inteiroEntre(resolucaoMin, 1, MAIOR_PRAZO_EM_MINUTOS) ||
    resposta === null ||
    resolucao === null
  ) {
    return null;
  }
  return { modo, respostaMin, resolucaoMin, resposta, resolucao };
}

/** O prazo que o chamado copia na abertura, com o dia útil do horário de agora. */
export function prazoEmMinutos(tipo: PrazoDoTipo, horario: HorarioDaTi): PrazoDoChamado {
  return {
    modo: tipo.modo,
    respostaMin: minutosDoPrazo(tipo.resposta, tipo.modo, horario),
    resolucaoMin: minutosDoPrazo(tipo.resolucao, tipo.modo, horario),
    resposta: { ...tipo.resposta },
    resolucao: { ...tipo.resolucao },
  };
}

/**
 * A unidade que segue o número no prazo: "min", "h" e o dia, que no horário da TI é o dia útil
 * ("dias úteis", ou "dia útil" em 1) e em horas corridas é o dia de 24 h ("dias", ou "dia").
 */
export function rotuloDaUnidadeDoPrazo(
  { valor, unidade }: ValorDoPrazo,
  modo: ModoDoPrazo,
): string {
  if (unidade !== 'd') return unidade;
  const dia = valor === 1 ? 'dia' : 'dias';
  if (modo === 'corridas') return dia;
  return `${dia} ${valor === 1 ? 'útil' : 'úteis'}`;
}

/** Um prazo do tipo em texto, como "30 min", "8 h", "3 dias" e "3 dias úteis". */
export function textoDoValorDoPrazo(prazo: ValorDoPrazo, modo: ModoDoPrazo): string {
  return `${prazo.valor} ${rotuloDaUnidadeDoPrazo(prazo, modo)}`;
}

/** O prazo do tipo como a frase do editor: "Responde em 30 min e resolve em 8 h, no horário da TI". */
export function fraseDoPrazo({ modo, resposta, resolucao }: PrazoDoTipo): string {
  const comoConta = modo === 'horario' ? 'no horário da TI' : 'em horas corridas';
  return `Responde em ${textoDoValorDoPrazo(resposta, modo)} e resolve em ${textoDoValorDoPrazo(resolucao, modo)}, ${comoConta}`;
}

const MS_POR_DIA = 86_400_000;

/** Um dia do calendário, em UTC, para andar de dia em dia sem o horário de verão. */
interface DiaDoCalendario {
  ano: number;
  mes: number;
  dia: number;
  semana: DiaDaSemana;
}

function diaDoCalendario(meiaNoite: number): DiaDoCalendario {
  const data = new Date(meiaNoite);
  return {
    ano: data.getUTCFullYear(),
    mes: data.getUTCMonth() + 1,
    dia: data.getUTCDate(),
    // O getUTCDay vai de domingo (0) a sábado (6); o horário, de segunda (1) a domingo (7).
    semana: (((data.getUTCDay() + 6) % 7) + 1) as DiaDaSemana,
  };
}

/** A meia-noite, em UTC, do dia do calendário em que o momento cai no relógio do fuso. */
function meiaNoiteDoDia(momento: Date, fuso: string): number {
  const { ano, mes, dia } = relogioDoFuso(momento, fuso);
  return Date.UTC(ano, mes - 1, dia);
}

/** A janela do horário num dia, em milissegundos: do início ao fim, no relógio do fuso. */
interface Janela {
  inicio: number;
  fim: number;
}

const janelas = new Map<string, Janela>();
const MAXIMO_DE_JANELAS_GUARDADAS = 10_000;

/**
 * A janela do horário no dia, guardada por fuso, dia e horas: a lista dos prazos calcula as mesmas
 * janelas para centenas de chamados.
 */
function janelaDoDia({ ano, mes, dia }: DiaDoCalendario, horario: HorarioDaTi): Janela {
  const chave = `${horario.fuso}|${ano}-${mes}-${dia}|${horario.inicio}|${horario.fim}`;
  const guardada = janelas.get(chave);
  if (guardada) return guardada;
  const instante = (minutos: number) =>
    instanteDoRelogio(
      ano,
      mes,
      dia,
      Math.floor(minutos / 60),
      minutos % 60,
      horario.fuso,
    ).getTime();
  const janela = { inicio: instante(horario.inicio), fim: instante(horario.fim) };
  if (janelas.size >= MAXIMO_DE_JANELAS_GUARDADAS) janelas.clear();
  janelas.set(chave, janela);
  return janela;
}

/**
 * Os segundos que o relógio conta entre dois momentos, arredondados para baixo: em horas corridas,
 * todo o tempo; no horário da TI, só o que cai nas janelas dos dias do horário.
 */
export function segundosNoHorario(
  de: Date,
  ate: Date,
  modo: ModoDoPrazo,
  horario: HorarioDaTi,
): number {
  const comeco = de.getTime();
  const fim = ate.getTime();
  if (fim <= comeco) return 0;
  if (modo === 'corridas') return Math.floor((fim - comeco) / 1000);
  let contado = 0;
  const ultimo = meiaNoiteDoDia(ate, horario.fuso);
  for (let dia = meiaNoiteDoDia(de, horario.fuso); dia <= ultimo; dia += MS_POR_DIA) {
    const doCalendario = diaDoCalendario(dia);
    if (!horario.dias.includes(doCalendario.semana)) continue;
    const janela = janelaDoDia(doCalendario, horario);
    const sobreposto = Math.min(janela.fim, fim) - Math.max(janela.inicio, comeco);
    if (sobreposto > 0) contado += sobreposto;
  }
  return Math.floor(contado / 1000);
}

/**
 * O maior tempo que falta num prazo, em segundos: o maior prazo em minutos, o mesmo que o
 * `lerPrazoDoChamado` aceita (o tipo vai até 999 na unidade, e o dia mais longo é o de 24 h, das
 * horas corridas). O tempo que falta nunca passa do prazo copiado, e o prazo lido nunca faz o
 * `momentoEmQueAlcanca` recusar o tempo.
 */
const SEGUNDOS_NO_MAIOR_PRAZO = MAIOR_PRAZO_EM_MINUTOS * 60;

/** Os dias que o vencimento anda um a um, no horário da TI, antes de pular semanas: 53 semanas. */
const DIAS_ANDADOS_UM_A_UM = 53 * 7;

/**
 * O teto da última semana, depois das semanas puladas: a janela que o horário de verão encurta
 * pede a seguinte, e um horário conferido nunca passa dele.
 */
const DIAS_NA_ULTIMA_SEMANA = 3 * 7;

/**
 * O momento em que o relógio, contando desde `desde`, completa os segundos que faltam: em horas
 * corridas, a soma; no horário da TI, andando pelas janelas dos dias do horário, dia a dia no
 * primeiro ano e, depois dele, pelas semanas inteiras de uma vez, com a última dia a dia. O tempo
 * que acaba no fim de uma janela vence no fim dela. O tempo que não é de um prazo (sem número ou
 * maior que o maior prazo) e o horário sem janela são recusados, porque o laço andaria para sempre.
 */
export function momentoEmQueAlcanca(
  desde: Date,
  segundosQueFaltam: number,
  modo: ModoDoPrazo,
  horario: HorarioDaTi,
): Date {
  if (!Number.isFinite(segundosQueFaltam) || segundosQueFaltam > SEGUNDOS_NO_MAIOR_PRAZO) {
    throw new RangeError('O tempo que falta não é de um prazo.');
  }
  if (segundosQueFaltam <= 0) return new Date(desde.getTime());
  if (modo === 'corridas') return new Date(desde.getTime() + segundosQueFaltam * 1000);
  const comprimento = (horario.fim - horario.inicio) * 60_000;
  const diasDoHorario = new Set(horario.dias.filter(ehDiaDaSemana));
  if (diasDoHorario.size === 0 || !(comprimento > 0)) {
    throw new RangeError('O horário da TI não tem janela.');
  }
  let falta = segundosQueFaltam * 1000;
  const cursor = desde.getTime();
  let dia = meiaNoiteDoDia(desde, horario.fuso);
  // Anda dia a dia pelas janelas até antes do dia `ate` e devolve o vencimento, se chega a ele.
  const andarAte = (ate: number): Date | null => {
    for (; dia < ate; dia += MS_POR_DIA) {
      const doCalendario = diaDoCalendario(dia);
      if (!diasDoHorario.has(doCalendario.semana)) continue;
      const janela = janelaDoDia(doCalendario, horario);
      if (janela.fim <= cursor) continue;
      const comeco = Math.max(janela.inicio, cursor);
      const cabe = janela.fim - comeco;
      if (cabe >= falta) return new Date(comeco + falta);
      falta -= cabe;
    }
    return null;
  };
  // O primeiro ano anda dia a dia, exato também com o horário de verão.
  const noPrimeiroAno = andarAte(dia + DIAS_ANDADOS_UM_A_UM * MS_POR_DIA);
  if (noPrimeiroAno) return noPrimeiroAno;
  // Depois dele, as semanas inteiras de uma vez, deixando a última para andar dia a dia: toda
  // semana tem cada dia do horário uma vez, com a janela inteira, fora o horário de verão, que nas
  // semanas puladas só muda a hora de um vencimento que já passa de um ano.
  const porSemana = diasDoHorario.size * comprimento;
  const semanas = Math.ceil(falta / porSemana) - 1;
  dia += semanas * 7 * MS_POR_DIA;
  falta -= semanas * porSemana;
  const naUltimaSemana = andarAte(dia + DIAS_NA_ULTIMA_SEMANA * MS_POR_DIA);
  if (naUltimaSemana) return naUltimaSemana;
  throw new RangeError('O tempo que falta não cabe no horário da TI.');
}

/**
 * Se o momento cai no horário da TI: num dia do horário, do início até antes do fim, no relógio do
 * fuso dele. No horário das 08:00 às 18:00, às 18:00 já é fora.
 */
export function noHorarioDaTi(momento: Date, horario: HorarioDaTi): boolean {
  const dia = diaDoCalendario(meiaNoiteDoDia(momento, horario.fuso));
  if (!horario.dias.includes(dia.semana)) return false;
  const janela = janelaDoDia(dia, horario);
  const instante = momento.getTime();
  return janela.inicio <= instante && instante < janela.fim;
}
