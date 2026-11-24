// O que a aba dos colaboradores mostra (spec aba-dos-colaboradores, "Aba fechada", "Aba aberta",
// "Aviso da resposta nova", "Aba sem conexão" e "Aba durante uma apresentação"): a forma e o
// tamanho, a largura do painel, as palavras do aviso, o "chegou às" depois da apresentação e o
// motivo do sem conexão. A tela da aba e a API leem daqui; o corte do nome comprido é do CSS.
import { MENSAGENS_DO_DIRETORIO } from '../diretorio/diretorio.ts';
import { relogioDoFuso } from '../fuso.ts';

export type FormaDaAba = 'pilula' | 'entalhe';

/** A largura de tela, em px lógicos, até a qual valem os tamanhos do notebook de 1366. */
export const LARGURA_DA_TELA_PEQUENA = 1366;

/** Quanto tempo o "chegou às" fica depois da apresentação. */
export const DURACAO_DO_CHEGOU_AS = 60_000;

export interface TamanhoDaAba {
  forma: FormaDaAba;
  largura: number;
  altura: number;
}

/** A aba fechada na forma da configuração; na tela de até 1366 px, a pílula de 160×32. */
export function tamanhoDaAbaFechada(forma: FormaDaAba, larguraDaTela: number): TamanhoDaAba {
  if (forma === 'entalhe') return { forma, largura: 184, altura: 32 };
  return larguraDaTela <= LARGURA_DA_TELA_PEQUENA
    ? { forma, largura: 160, altura: 32 }
    : { forma, largura: 162, altura: 34 };
}

/** O painel aberto: o de fábrica, o com a linha da resposta e o sem conexão. */
export type PainelDaAba = 'de-fabrica' | 'com-resposta' | 'sem-conexao';

/**
 * A largura do painel aberto: 293 px de fábrica, e 372 com a linha da resposta ou sem conexão; na
 * tela de até 1366 px, 225 e 300. O painel guarda a largura até fechar, e quem a guarda é a tela.
 */
export function larguraDoPainel(painel: PainelDaAba, larguraDaTela: number): number {
  const pequena = larguraDaTela <= LARGURA_DA_TELA_PEQUENA;
  if (painel === 'de-fabrica') return pequena ? 225 : 293;
  return pequena ? 300 : 372;
}

/** A contagem de respostas nas palavras da aba: "1 resposta nova", "3 respostas novas". */
export function respostasNovas(quantas: number): string {
  return quantas === 1 ? '1 resposta nova' : `${quantas} respostas novas`;
}

/** O aviso da aba fechada: a contagem e, com uma só, quem respondeu. */
export interface AvisoDaAba {
  contagem: string;
  /** Quem respondeu, com uma só; a tela o corta com reticências. */
  quem: string | null;
}

/**
 * O aviso das respostas por ver, ou `null` sem nenhuma. Conta os chamados com resposta por ver, e
 * não as mensagens: duas mensagens seguidas de Ana no #1041 são "1 resposta nova · Ana Souza".
 */
export function avisoDaAba(
  chamadosPorVer: number,
  quemRespondeuPorUltimo: string | null,
): AvisoDaAba | null {
  if (chamadosPorVer <= 0) return null;
  return {
    contagem: respostasNovas(chamadosPorVer),
    quem: chamadosPorVer === 1 ? quemRespondeuPorUltimo : null,
  };
}

function horaEMinuto(momento: Date, fuso: string): string {
  const { hora, minuto } = relogioDoFuso(momento, fuso);
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/**
 * Depois da apresentação, por 1 minuto, o que chegou durante ela: "1 resposta nova · chegou às
 * 09:21", ou "3 respostas novas · a última às 09:30". `null` sem nada que chegou, antes do fim ou
 * depois do minuto. As `chegadas` são uma por chamado, a última de cada um, e só as que chegaram
 * durante a apresentação e seguem por ver, como o aviso conta.
 */
export function chegouAs(pedido: {
  chegadas: readonly Date[];
  fimDaApresentacao: Date;
  agora: Date;
  fuso: string;
}): string | null {
  const { chegadas, fimDaApresentacao, agora, fuso } = pedido;
  const decorrido = agora.getTime() - fimDaApresentacao.getTime();
  if (chegadas.length === 0 || decorrido < 0 || decorrido >= DURACAO_DO_CHEGOU_AS) return null;
  const ultima = new Date(Math.max(...chegadas.map((chegada) => chegada.getTime())));
  const hora = horaEMinuto(ultima, fuso);
  return chegadas.length === 1
    ? `${respostasNovas(1)} · chegou às ${hora}`
    : `${respostasNovas(chegadas.length)} · a última às ${hora}`;
}

/** Por que a aba está sem conexão (specs da aba: o aparelho, as duas entradas e a sessão). */
export type MotivoSemConexao =
  | 'nao-configurada'
  | 'sem-rede'
  | 'chave-recusada'
  | 'registrar-de-novo'
  | 'aparelho-bloqueado'
  | 'usuario-de-fora'
  | 'conta-local'
  | 'conta-inativa'
  | 'sem-grupo'
  | 'ti-fora-do-alcance'
  | 'teto-do-aparelho'
  | 'cadastrar-o-codigo'
  | 'outra-sessao-do-windows';

/** A frase de cada motivo, na aba aberta. A do "sem grupo" é a da entrada pelo diretório. */
export const FRASES_SEM_CONEXAO: Record<MotivoSemConexao, string> = {
  'nao-configurada': 'A aba não foi configurada. Fale com a TI.',
  'sem-rede': 'Sem conexão com o Grafite.',
  'chave-recusada': 'Chave da aba recusada.',
  'registrar-de-novo': 'Este computador precisa ser registrado de novo. Fale com a TI.',
  'aparelho-bloqueado': 'Este computador foi bloqueado na aba. Fale com a TI.',
  'usuario-de-fora': 'Entre no Windows com o seu usuário da empresa para usar a aba.',
  'conta-local': 'A conta deste usuário é local do Grafite e não entra pela aba.',
  'conta-inativa': 'Sua conta está inativa no Grafite. Fale com a TI.',
  'sem-grupo': MENSAGENS_DO_DIRETORIO.semAcesso,
  'ti-fora-do-alcance': 'A TI não está ao alcance agora.',
  'teto-do-aparelho': 'Este computador abriu a aba para muitas pessoas hoje. Fale com a TI.',
  'cadastrar-o-codigo': 'Cadastre o código do app pelo navegador antes de usar a aba.',
  'outra-sessao-do-windows': 'Você abriu a aba em outra sessão do Windows deste computador.',
};

/** De quanto em quanto a aba tenta de novo nas recusas da pessoa, que só a TI resolve. */
export const INTERVALO_DA_RECUSA_DA_PESSOA = 10 * 60_000;

/**
 * Quem traz a aba de volta:
 * - `aba`: ela tenta de novo logo, na rede e no AD fora do ar;
 * - `aba-devagar`: ela tenta de novo a cada 10 minutos, nas recusas da pessoa, para a mudança da
 *   TI valer sem a pessoa sair do Windows;
 * - `servico`: o contato de 60 s do serviço, nos motivos do aparelho;
 * - `pessoa`: o formulário da entrada pela senha, ou sair do Windows e entrar de novo, na sessão
 *   derrubada por outra sessão do Windows com a mesma conta.
 */
export type RetomadaDaAba = 'aba' | 'aba-devagar' | 'servico' | 'pessoa';

export const RETOMADA_DO_MOTIVO: Record<MotivoSemConexao, RetomadaDaAba> = {
  'sem-rede': 'aba',
  'ti-fora-do-alcance': 'aba',
  'usuario-de-fora': 'aba-devagar',
  'conta-local': 'aba-devagar',
  'conta-inativa': 'aba-devagar',
  'sem-grupo': 'aba-devagar',
  'teto-do-aparelho': 'aba-devagar',
  'nao-configurada': 'servico',
  'chave-recusada': 'servico',
  'registrar-de-novo': 'servico',
  'aparelho-bloqueado': 'servico',
  'cadastrar-o-codigo': 'pessoa',
  'outra-sessao-do-windows': 'pessoa',
};
