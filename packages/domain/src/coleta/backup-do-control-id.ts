// O backup do Control iD (spec backup-do-control-id; change p5a-backup-do-control-id, design,
// decisões 4, 5 e 6): as categorias que o coletor lê, na ordem do PMG, o resultado pelas
// categorias, a retenção de 7 diários, 4 semanais e 12 mensais, a agenda do dia, a expiração do
// pedido e o nome do arquivo. Os dias, as semanas e os meses são os de São Paulo.

/** As categorias do controle, na ordem em que o coletor lê e o PMG grava. */
export const CATEGORIAS_DO_BACKUP = [
  'users',
  'groups',
  'user_groups',
  'cards',
  'templates',
  'access_rules',
  'group_access_rules',
  'time_zones',
  'time_spans',
  'access_rule_time_zones',
] as const;

export type CategoriaDoBackup = (typeof CATEGORIAS_DO_BACKUP)[number];

/** A categoria das fotos dos usuários, lidas depois das outras. */
export const CATEGORIA_DAS_FOTOS = 'face_images';

/** A categoria das informações do sistema, que o PMG também conta. */
export const CATEGORIA_DAS_INFORMACOES = 'device_info';

export type CategoriaDoResultado =
  | CategoriaDoBackup
  | typeof CATEGORIA_DAS_FOTOS
  | typeof CATEGORIA_DAS_INFORMACOES;

export const ROTULOS_DAS_CATEGORIAS: Record<CategoriaDoResultado, string> = {
  users: 'Usuários',
  groups: 'Grupos',
  user_groups: 'Usuários dos grupos',
  cards: 'Cartões',
  templates: 'Biometria',
  access_rules: 'Regras de acesso',
  group_access_rules: 'Regras dos grupos',
  time_zones: 'Horários',
  time_spans: 'Intervalos dos horários',
  access_rule_time_zones: 'Horários das regras',
  face_images: 'Fotos',
  device_info: 'Informações do controle',
};

export const SITUACOES_DO_BACKUP = [
  'na-fila',
  'em-andamento',
  'sucesso',
  'parcial',
  'falha',
] as const;

export type SituacaoDoBackup = (typeof SITUACOES_DO_BACKUP)[number];

export const ROTULOS_DAS_SITUACOES_DO_BACKUP: Record<SituacaoDoBackup, string> = {
  'na-fila': 'Na fila',
  'em-andamento': 'Em andamento',
  sucesso: 'Sucesso',
  parcial: 'Parcial',
  falha: 'Falha',
};

/** As situações em que o backup ainda espera o coletor. */
export const SITUACOES_DO_PEDIDO_ABERTO = ['na-fila', 'em-andamento'] as const;

export const ORIGENS_DO_BACKUP = ['manual', 'agendado'] as const;

export type OrigemDoBackup = (typeof ORIGENS_DO_BACKUP)[number];

export const ROTULOS_DAS_ORIGENS_DO_BACKUP: Record<OrigemDoBackup, string> = {
  manual: 'Manual',
  agendado: 'Agendado',
};

export const MENSAGENS_DO_BACKUP = {
  repetido: 'Já há um backup deste controle na fila.',
  semColetor: 'Nenhum coletor alcança o IP deste controle.',
  semIp: 'O controle está sem o IP que a saúde do Control iD usa.',
  semLogin: 'O controle está sem um login válido do cofre.',
  danificado: 'O arquivo do backup chegou danificado.',
  naoBuscado: 'O coletor não buscou o pedido em 2 horas.',
  naoTerminado: 'O coletor não terminou o backup em 30 minutos.',
  semArquivo: 'Este backup não tem arquivo.',
  loginRecusado: 'O controle recusou o login do cofre.',
  aberto: 'Este backup ainda está na fila ou em andamento.',
} as const;

/** O horário do backup diário quando o tipo não escolhe outro. */
export const HORARIO_PADRAO_DO_BACKUP = '02:00';

/** `HH:MM`, de 00:00 a 23:59. */
export const FORMATO_DO_HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

/** O fuso dos dias da agenda e da retenção. */
export const FUSO_DO_BACKUP = 'America/Sao_Paulo';

/** Quanto o pedido espera o coletor: 2 horas na fila e 30 minutos em andamento. */
export const PRAZOS_DO_PEDIDO = { naFila: 2 * 60 * 60_000, emAndamento: 30 * 60_000 } as const;

/** Quantos dias as falhas ficam no histórico. */
export const DIAS_DAS_FALHAS = 30;

/** O que o coletor diz de cada categoria lida. */
export interface CategoriaLida {
  categoria: string;
  situacao: 'ok' | 'erro';
  quantidade: number;
  erro?: string;
}

const rotuloDa = (categoria: string) =>
  ROTULOS_DAS_CATEGORIAS[categoria as CategoriaDoResultado] ?? categoria;

/**
 * O resultado do backup pelas categorias: Sucesso sem nenhum erro, Falha quando todas falharam e
 * Parcial no meio, com os registros (sem as fotos), as fotos e a mensagem das que falharam.
 */
export function resultadoDoBackup(categorias: readonly CategoriaLida[]): {
  situacao: 'sucesso' | 'parcial' | 'falha';
  registros: number;
  fotos: number;
  erro: string | null;
} {
  if (categorias.length === 0) {
    return { situacao: 'falha', registros: 0, fotos: 0, erro: 'Nenhuma categoria foi lida.' };
  }
  const comErro = categorias.filter((categoria) => categoria.situacao === 'erro');
  const lidas = categorias.filter((categoria) => categoria.situacao === 'ok');
  const registros = lidas
    .filter(
      (categoria) =>
        categoria.categoria !== CATEGORIA_DAS_FOTOS &&
        categoria.categoria !== CATEGORIA_DAS_INFORMACOES,
    )
    .reduce((soma, categoria) => soma + categoria.quantidade, 0);
  const fotos = lidas
    .filter((categoria) => categoria.categoria === CATEGORIA_DAS_FOTOS)
    .reduce((soma, categoria) => soma + categoria.quantidade, 0);
  const erro =
    comErro.length === 0
      ? null
      : `Falhou a leitura de: ${comErro.map((categoria) => rotuloDa(categoria.categoria)).join(', ')}.`;
  const situacao =
    comErro.length === 0 ? 'sucesso' : comErro.length === categorias.length ? 'falha' : 'parcial';
  return { situacao, registros, fotos, erro };
}

const DIA_EM_SAO_PAULO = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_DO_BACKUP,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const HORA_EM_SAO_PAULO = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO_DO_BACKUP,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A data em São Paulo, como "2026-10-28". */
export const diaEmSaoPaulo = (momento: Date) => DIA_EM_SAO_PAULO.format(momento);

/** A hora em São Paulo, como "02:05". */
export const horaEmSaoPaulo = (momento: Date) => HORA_EM_SAO_PAULO.format(momento);

/** O dia da data "AAAA-MM-DD" como meia-noite em UTC, só para contar dias e semanas. */
const comoUtc = (dia: string) => {
  const [ano, mes, data] = dia.split('-').map(Number);
  return Date.UTC(ano ?? 0, (mes ?? 1) - 1, data ?? 1);
};

const UM_DIA = 24 * 60 * 60_000;

/** O dia "AAAA-MM-DD" deslocado de alguns dias, como "2026-10-28" com -1 dá "2026-10-27". */
export const deslocado = (dia: string, dias: number) =>
  new Date(comoUtc(dia) + dias * UM_DIA).toISOString().slice(0, 10);

/** A segunda-feira da semana do dia (semana de segunda a domingo). */
const semanaDo = (dia: string) => {
  const diaDaSemana = (new Date(comoUtc(dia)).getUTCDay() + 6) % 7;
  return deslocado(dia, -diaDaSemana);
};

const mesDo = (dia: string) => dia.slice(0, 7);

/** O backup que a retenção confere. */
export interface BackupParaReter {
  id: string;
  situacao: SituacaoDoBackup;
  pedidoEm: Date;
  concluidoEm: Date | null;
}

/**
 * Os backups de um controle que saem pela retenção (design, decisão 6): dos bons, ficam o mais
 * recente e o último de cada um dos 7 dias, das 4 semanas e dos 12 meses mais recentes, contados a
 * partir de hoje em São Paulo; as falhas ficam 30 dias; os pedidos abertos nunca saem.
 */
export function backupsQueSaem(backups: readonly BackupParaReter[], agora: Date): string[] {
  const hoje = diaEmSaoPaulo(agora);
  const dias = new Set(Array.from({ length: 7 }, (_, i) => deslocado(hoje, -i)));
  const semanas = new Set(Array.from({ length: 4 }, (_, i) => deslocado(semanaDo(hoje), -7 * i)));
  const meses = new Set<string>();
  const [ano, mes] = hoje.split('-').map(Number);
  for (let i = 0; i < 12; i++) {
    const data = new Date(Date.UTC(ano ?? 0, (mes ?? 1) - 1 - i, 1));
    meses.add(data.toISOString().slice(0, 7));
  }

  const bons = backups
    .filter(
      (backup): backup is BackupParaReter & { concluidoEm: Date } =>
        (backup.situacao === 'sucesso' || backup.situacao === 'parcial') &&
        backup.concluidoEm !== null,
    )
    .sort((a, b) => b.concluidoEm.getTime() - a.concluidoEm.getTime());
  const ficam = new Set<string>();
  const ultimoDe = new Map<string, string>();
  for (const backup of bons) {
    const dia = diaEmSaoPaulo(backup.concluidoEm);
    for (const periodo of [`d:${dia}`, `s:${semanaDo(dia)}`, `m:${mesDo(dia)}`]) {
      if (!ultimoDe.has(periodo)) ultimoDe.set(periodo, backup.id);
    }
  }
  if (bons[0]) ficam.add(bons[0].id);
  for (const [periodo, id] of ultimoDe) {
    const [tipo, chave] = [periodo.slice(0, 1), periodo.slice(2)];
    if (
      (tipo === 'd' && dias.has(chave)) ||
      (tipo === 's' && semanas.has(chave)) ||
      (tipo === 'm' && meses.has(chave))
    ) {
      ficam.add(id);
    }
  }

  const limiteDasFalhas = agora.getTime() - DIAS_DAS_FALHAS * UM_DIA;
  const saem: string[] = [];
  for (const backup of backups) {
    if (backup.situacao === 'sucesso' || backup.situacao === 'parcial') {
      if (!ficam.has(backup.id)) saem.push(backup.id);
    } else if (backup.situacao === 'falha' && backup.pedidoEm.getTime() < limiteDasFalhas) {
      saem.push(backup.id);
    }
  }
  return saem;
}

/**
 * Se o backup agendado do dia já deve entrar na fila: o horário do tipo já passou hoje, em São
 * Paulo, o último agendado não é de hoje e nenhum backup pedido hoje depois do horário, manual ou
 * agendado, vale como o do dia. O manual que termina depois do agendado passa a ser o do dia e a
 * retenção apaga o agendado: sem essa conta, a agenda pediria outro no mesmo dia. A API parada no
 * horário põe o backup quando volta.
 */
export function agendadoDevido(
  horario: string,
  agora: Date,
  ultimos: {
    /** O pedido do último backup agendado que ainda existe. */
    agendado: Date | null;
    /** O pedido do último backup, de qualquer origem. */
    qualquer: Date | null;
  },
): boolean {
  if (horaEmSaoPaulo(agora) < horario) return false;
  const hoje = diaEmSaoPaulo(agora);
  if (ultimos.agendado && diaEmSaoPaulo(ultimos.agendado) === hoje) return false;
  const doDia =
    ultimos.qualquer &&
    diaEmSaoPaulo(ultimos.qualquer) === hoje &&
    horaEmSaoPaulo(ultimos.qualquer) >= horario;
  return !doDia;
}

/** A mensagem da falha do pedido que esperou demais o coletor, ou `null`. */
export function pedidoExpirado(
  pedido: { situacao: SituacaoDoBackup; pedidoEm: Date; iniciadoEm: Date | null },
  agora: Date,
): string | null {
  const passou = (desde: Date, prazo: number) => agora.getTime() - desde.getTime() >= prazo;
  if (pedido.situacao === 'na-fila' && passou(pedido.pedidoEm, PRAZOS_DO_PEDIDO.naFila)) {
    return MENSAGENS_DO_BACKUP.naoBuscado;
  }
  if (
    pedido.situacao === 'em-andamento' &&
    passou(pedido.iniciadoEm ?? pedido.pedidoEm, PRAZOS_DO_PEDIDO.emAndamento)
  ) {
    return MENSAGENS_DO_BACKUP.naoTerminado;
  }
  return null;
}

/** O nome do ZIP baixado: o patrimônio, ou o nome, sem acento, e o momento em São Paulo. */
export function nomeDoArquivoDoBackup(
  controle: { patrimonio: string | null; nome: string },
  momento: Date,
): string {
  const base = (controle.patrimonio || controle.nome)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const hora = horaEmSaoPaulo(momento).replace(':', '');
  return `controlid-${base || 'controle'}-${diaEmSaoPaulo(momento)}-${hora}.zip`;
}
