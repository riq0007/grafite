// Fusos horários da seção Idioma e região (F1c, design, decisão 8): a validação de um identificador
// IANA e a lista da busca, com os fusos do Brasil primeiro.

/** Se o navegador reconhece o identificador de fuso, como "America/Manaus". */
export function fusoReconhecido(fuso: string): boolean {
  if (fuso === '') return false;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

/** O fuso do sistema operacional, como "America/Sao_Paulo": o de "Seguir o sistema". */
export function fusoDoSistema(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Os fusos do Brasil, com o nome e a cidade em português. O nome não vem do navegador porque, sem
 * horário de verão, ele diz "Horário Padrão de Brasília" no lugar de "Horário de Brasília".
 */
export const FUSOS_DO_BRASIL: Readonly<Record<string, { nome: string; cidade: string }>> = {
  'America/Noronha': { nome: 'Horário de Fernando de Noronha', cidade: 'Fernando de Noronha' },
  'America/Sao_Paulo': { nome: 'Horário de Brasília', cidade: 'São Paulo' },
  'America/Bahia': { nome: 'Horário de Brasília', cidade: 'Salvador' },
  'America/Fortaleza': { nome: 'Horário de Brasília', cidade: 'Fortaleza' },
  'America/Recife': { nome: 'Horário de Brasília', cidade: 'Recife' },
  'America/Maceio': { nome: 'Horário de Brasília', cidade: 'Maceió' },
  'America/Belem': { nome: 'Horário de Brasília', cidade: 'Belém' },
  'America/Araguaina': { nome: 'Horário de Brasília', cidade: 'Araguaína' },
  'America/Santarem': { nome: 'Horário de Brasília', cidade: 'Santarém' },
  'America/Manaus': { nome: 'Horário do Amazonas', cidade: 'Manaus' },
  'America/Cuiaba': { nome: 'Horário do Amazonas', cidade: 'Cuiabá' },
  'America/Campo_Grande': { nome: 'Horário do Amazonas', cidade: 'Campo Grande' },
  'America/Porto_Velho': { nome: 'Horário do Amazonas', cidade: 'Porto Velho' },
  'America/Boa_Vista': { nome: 'Horário do Amazonas', cidade: 'Boa Vista' },
  'America/Rio_Branco': { nome: 'Horário do Acre', cidade: 'Rio Branco' },
  'America/Eirunepe': { nome: 'Horário do Acre', cidade: 'Eirunepé' },
};

export interface FusoDescrito {
  /** Identificador IANA, como "America/Manaus". */
  id: string;
  /** "Horário do Amazonas". */
  nome: string;
  /** "Manaus"; vazia no UTC. */
  cidade: string;
  /** A diferença para o UTC no momento pedido, como "UTC−4". */
  diferenca: string;
  /** "Horário do Amazonas · Manaus (UTC−4)". */
  rotulo: string;
  doBrasil: boolean;
}

const UM_MINUTO = 60_000;

/** "UTC−4", "UTC+5:30" ou "UTC", com o sinal de menos tipográfico. */
function escreverDiferenca(minutos: number): string {
  if (minutos === 0) return 'UTC';
  const horas = Math.floor(Math.abs(minutos) / 60);
  const resto = Math.abs(minutos) % 60;
  const sinal = minutos < 0 ? '−' : '+';
  return `UTC${sinal}${horas}${resto ? `:${String(resto).padStart(2, '0')}` : ''}`;
}

const nomeLongo = (id: string, agora: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: id, timeZoneName: 'long' })
    .formatToParts(agora)
    .find((parte) => parte.type === 'timeZoneName')?.value ?? '';

/** Um formato só por fuso dá o nome genérico e o relógio de onde sai a diferença para o UTC. */
function descrever(id: string, agora: Date): { fuso: FusoDescrito; minutos: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: id,
      timeZoneName: 'longGeneric',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(agora)
      .map((parte) => [parte.type, parte.value]),
  );
  const relogio = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
  );
  // O relógio do fuso vem até o minuto: o instante também, para os segundos não entrarem na conta.
  const minutos = (relogio - (agora.getTime() - (agora.getTime() % UM_MINUTO))) / UM_MINUTO;
  const doBrasil = FUSOS_DO_BRASIL[id];
  const generico = partes.timeZoneName ?? '';
  // Sem nome genérico (o UTC), o navegador escreve só a diferença, como "GMT+00:00".
  const nome = doBrasil?.nome ?? (generico.startsWith('GMT') ? nomeLongo(id, agora) : generico);
  const cidade =
    doBrasil?.cidade ??
    (id.includes('/') ? id.slice(id.lastIndexOf('/') + 1).replaceAll('_', ' ') : '');
  const diferenca = escreverDiferenca(minutos);
  return {
    fuso: {
      id,
      nome,
      cidade,
      diferenca,
      rotulo: `${nome}${cidade ? ` · ${cidade}` : ''} (${diferenca})`,
      doBrasil: doBrasil !== undefined,
    },
    minutos,
  };
}

/** O nome, a cidade e a diferença para o UTC de um fuso no momento pedido. */
export function descreverFuso(id: string, agora: Date): FusoDescrito {
  return descrever(id, agora).fuso;
}

/** Os fusos que o navegador conhece; sem a lista dele, só os do Brasil entram. */
const fusosDoNavegador = (): string[] =>
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

/**
 * A lista da busca de fusos: os do Brasil primeiro e depois os demais, cada grupo de oeste para
 * leste e, na mesma diferença para o UTC, pela cidade.
 */
export function listaDeFusos(
  agora: Date,
  ids: readonly string[] = fusosDoNavegador(),
): FusoDescrito[] {
  return [...new Set([...Object.keys(FUSOS_DO_BRASIL), ...ids])]
    .map((id) => descrever(id, agora))
    .sort(
      (a, b) =>
        Number(b.fuso.doBrasil) - Number(a.fuso.doBrasil) ||
        a.minutos - b.minutos ||
        a.fuso.cidade.localeCompare(b.fuso.cidade, 'pt-BR') ||
        a.fuso.id.localeCompare(b.fuso.id),
    )
    .map(({ fuso }) => fuso);
}
