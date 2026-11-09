// A distribuição de software (spec distribuicao-de-software; change distribuicao-de-software): a
// conferência do pacote e dos códigos de saída de sucesso, a situação de cada máquina pelos passos
// que o agente do GLPI manda e o progresso da distribuição em texto.

/** Os códigos de saída que contam como sucesso de fábrica: 0 e o 3010, o "reiniciar depois". */
export const CODIGOS_DE_SUCESSO_PADRAO: readonly number[] = [0, 3010];

/** O maior arquivo de um pacote, e o tamanho de cada parte antes da compressão. */
export const LIMITE_DO_ARQUIVO_DO_PACOTE = 512 * 1024 * 1024;
export const TAMANHO_DA_PARTE_DO_PACOTE = 8 * 1024 * 1024;

/** Quantas linhas do log de cada máquina ficam guardadas. */
export const LINHAS_DO_LOG = 200;

export const MENSAGENS_DO_SOFTWARE = {
  nome: 'Informe o nome do pacote.',
  nomeLongo: 'Use até 120 caracteres.',
  nomeRepetido: 'Já existe um pacote com este nome.',
  comando: 'Informe o comando que o agente roda.',
  comandoLongo: 'Use até 2.000 caracteres no comando.',
  codigos: 'Informe os códigos de sucesso como números, separados por vírgula.',
  arquivoGrande: 'O arquivo passa de 512 MB.',
  semMaquinas: 'Escolha pelo menos uma máquina.',
  pacoteInativo: 'O pacote está inativo.',
  semAgente: (ativo: string) => `O ativo ${ativo} não tem o agente do GLPI ligado.`,
} as const;

export interface DadosDoPacote {
  nome: string;
  versao: string | null;
  descricao: string | null;
  comando: string;
  codigosDeSucesso: number[];
}

export type CampoDoPacote = 'nome' | 'comando' | 'codigosDeSucesso';

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');

/** Os códigos de sucesso de um texto como "0, 3010", sem repetir; fora do formato, `null`. */
function lerCodigos(valor: unknown): number[] | null {
  if (Array.isArray(valor)) return lerCodigos(valor.join(','));
  const limpo = texto(valor);
  if (limpo === '') return [...CODIGOS_DE_SUCESSO_PADRAO];
  const codigos: number[] = [];
  for (const parte of limpo.split(',')) {
    const pedaco = parte.trim();
    if (!/^-?\d+$/.test(pedaco)) return null;
    const codigo = Number(pedaco);
    if (codigo < -2_147_483_648 || codigo > 4_294_967_295) return null;
    if (!codigos.includes(codigo)) codigos.push(codigo);
  }
  return codigos;
}

/** Confere o pacote pedido: o nome, o comando e os códigos de sucesso. */
export function conferirPacote(pedido: {
  nome?: unknown;
  versao?: unknown;
  descricao?: unknown;
  comando?: unknown;
  codigosDeSucesso?: unknown;
}):
  | { ok: true; dados: DadosDoPacote }
  | { ok: false; erros: Partial<Record<CampoDoPacote, string>> } {
  const erros: Partial<Record<CampoDoPacote, string>> = {};
  const nome = texto(pedido.nome);
  if (nome === '') erros.nome = MENSAGENS_DO_SOFTWARE.nome;
  else if (nome.length > 120) erros.nome = MENSAGENS_DO_SOFTWARE.nomeLongo;
  const comando = texto(pedido.comando);
  if (comando === '') erros.comando = MENSAGENS_DO_SOFTWARE.comando;
  else if (comando.length > 2000) erros.comando = MENSAGENS_DO_SOFTWARE.comandoLongo;
  const codigosDeSucesso = lerCodigos(pedido.codigosDeSucesso);
  if (!codigosDeSucesso) erros.codigosDeSucesso = MENSAGENS_DO_SOFTWARE.codigos;
  if (Object.keys(erros).length > 0 || !codigosDeSucesso) return { ok: false, erros };
  return {
    ok: true,
    dados: {
      nome,
      versao: texto(pedido.versao) || null,
      descricao: texto(pedido.descricao) || null,
      comando,
      codigosDeSucesso,
    },
  };
}

export const SITUACOES_DA_MAQUINA_NO_BANCO = [
  'aguardando',
  'em-andamento',
  'concluida',
  'falhou',
] as const;
export type SituacaoDaMaquina = (typeof SITUACOES_DA_MAQUINA_NO_BANCO)[number];

/** A situação da máquina na tela: o texto e o tom do rótulo. */
export const SITUACOES_DA_MAQUINA: Record<
  SituacaoDaMaquina,
  { texto: string; tipo: 'neutra' | 'info' | 'sucesso' | 'critico' }
> = {
  aguardando: { texto: 'Aguardando o agente', tipo: 'neutra' },
  'em-andamento': { texto: 'Em andamento', tipo: 'info' },
  concluida: { texto: 'Concluída', tipo: 'sucesso' },
  falhou: { texto: 'Falhou', tipo: 'critico' },
};

/** As etapas do Deploy do agente em pt-BR, pelo `currentStep`. */
const ETAPAS_DO_AGENTE: Record<string, string> = {
  checking: 'Conferindo',
  downloading: 'Baixando',
  prepare: 'Preparando',
  processing: 'Executando',
};

/** A mensagem que o agente manda no fim da tarefa que deu certo. */
const FIM_COM_SUCESSO = 'job successfully completed';

const TERMINADAS: readonly SituacaoDaMaquina[] = ['concluida', 'falhou'];

/**
 * O passo do `setStatus` do agente na máquina: a etapa, a linha do log e a situação. O "ko" faz
 * falhar, a mensagem final de sucesso conclui, e a máquina terminada não muda mais.
 */
export function aplicarPassoDoAgente(
  atual: { situacao: SituacaoDaMaquina; etapa: string | null; log: readonly string[] },
  passo: { currentStep?: string | null; status?: string | null; msg?: string | null },
): { situacao: SituacaoDaMaquina; etapa: string | null; log: string[]; terminou: boolean } {
  const etapa = passo.currentStep
    ? (ETAPAS_DO_AGENTE[passo.currentStep] ?? passo.currentStep)
    : atual.etapa;
  const onde = passo.currentStep ? etapa : passo.status ? 'Fim' : etapa;
  const partes = [passo.status, passo.msg].filter((parte): parte is string => !!parte);
  const linha = `${onde ?? 'Agente'}: ${partes.join(', ')}`;
  const log = [...atual.log, linha].slice(-LINHAS_DO_LOG);
  if (TERMINADAS.includes(atual.situacao)) {
    return { situacao: atual.situacao, etapa: atual.etapa, log, terminou: false };
  }
  const situacao: SituacaoDaMaquina =
    passo.status === 'ko'
      ? 'falhou'
      : passo.status === 'ok' && passo.msg === FIM_COM_SUCESSO
        ? 'concluida'
        : 'em-andamento';
  return { situacao, etapa, log, terminou: TERMINADAS.includes(situacao) };
}

/** O progresso da distribuição: "2 de 3 concluídas, 1 falhou". */
export function progressoDaDistribuicao(situacoes: readonly SituacaoDaMaquina[]): string {
  const total = situacoes.length;
  const concluidas = situacoes.filter((situacao) => situacao === 'concluida').length;
  const falhas = situacoes.filter((situacao) => situacao === 'falhou').length;
  const base = `${concluidas} de ${total} ${total === 1 ? 'concluída' : 'concluídas'}`;
  if (falhas === 0) return base;
  return `${base}, ${falhas} ${falhas === 1 ? 'falhou' : 'falharam'}`;
}
