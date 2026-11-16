// O Rascunho de tipo de chamado (spec tipos-de-chamado, "Rascunho, duplicar e descartar"; change
// chamados-da-ti, tarefa 4.2): os padrões do "Novo tipo", o nome com o número seguinte, o nome da
// cópia cortado para caber, e o "Gera uma Solicitação" do duplicado, que vem desligado para quem
// não atende as solicitações em todos os locais.
import type { Formulario } from './formulario.ts';
import {
  type IconeDoTipoDeChamado,
  ligaASolicitacao,
  type PedidoDoTipoDeChamado,
  type SolicitacaoQueOTipoGera,
} from './tipo.ts';

/** O mesmo limite do nome do tipo, em caracteres. */
const LIMITE_DO_NOME = 40;

export interface RascunhoDoTipoDeChamado extends Omit<PedidoDoTipoDeChamado, 'icone'> {
  icone: IconeDoTipoDeChamado;
  formulario: Formulario;
}

/**
 * O "Novo tipo": o ícone das reticências e nenhuma frase, que "Criar o tipo" pede; "Responde em
 * 1 h e resolve em 1 dia, no horário da TI", sem quem atende por padrão e "Cai na triagem"; as
 * chaves desligadas, fora "Aparece para o colaborador"; e nenhum campo no formulário.
 */
export const NOVO_TIPO_DE_CHAMADO: RascunhoDoTipoDeChamado = {
  nome: 'Novo tipo',
  icone: 'reticencias',
  frase: null,
  prazo: {
    modo: 'horario',
    resposta: { valor: 1, unidade: 'h' },
    resolucao: { valor: 1, unidade: 'd' },
  },
  atendePorPadrao: null,
  semNinguem: 'triagem',
  podeVirarOs: false,
  geraSolicitacao: 'nao',
  tipoDeAtivoDoEquipamento: null,
  pedeOAtivo: false,
  apareceParaOColaborador: true,
  soATiAbre: false,
  formulario: { titulo: { comecaPeloTipo: true, campoId: null }, campos: [] },
};

/** O nome do "Novo tipo": o primeiro sem número, os outros com ele, como "Novo tipo 2". */
export function nomeDoNovoTipo(numero: number): string {
  return numero <= 1 ? NOVO_TIPO_DE_CHAMADO.nome : `${NOVO_TIPO_DE_CHAMADO.nome} ${numero}`;
}

/**
 * O nome do duplicado: "<nome> (cópia)" e, quando já existe, "<nome> (cópia 2)". O nome da origem
 * é cortado em caracteres, e não em unidades do UTF-16, para o todo caber nos 40, sem o espaço que
 * o corte deixar no fim.
 */
export function nomeDaCopia(origem: string, numero: number): string {
  const sufixo = numero <= 1 ? ' (cópia)' : ` (cópia ${numero})`;
  const cabe = LIMITE_DO_NOME - [...sufixo].length;
  const caracteres = [...origem];
  const nome = caracteres.length <= cabe ? origem : caracteres.slice(0, cabe).join('').trimEnd();
  return `${nome}${sufixo}`;
}

/** O aviso do duplicado que veio com o "Gera uma Solicitação" desligado. */
export const AVISO_DA_SOLICITACAO_NO_DUPLICAR =
  "O 'Gera uma Solicitação' veio desligado: só quem atende as solicitações em todos os locais o liga.";

/**
 * O que o Rascunho duplicado gera: o mesmo da origem, ou nada, sem o tipo de ativo, quando o
 * duplicado ligaria o "Gera uma Solicitação" (o `ligaASolicitacao` com o antes nulo) e quem duplica
 * não atende as solicitações em todos os locais. `desligada` diz se a tela mostra o aviso.
 */
export function solicitacaoDoDuplicado(
  origem: SolicitacaoQueOTipoGera,
  alcanceDasSolicitacoes: 'organizacao' | ReadonlySet<string> | null,
): SolicitacaoQueOTipoGera & { desligada: boolean } {
  if (!ligaASolicitacao(null, origem) || alcanceDasSolicitacoes === 'organizacao') {
    return { ...origem, desligada: false };
  }
  return { geraSolicitacao: 'nao', tipoDeAtivoDoEquipamento: null, desligada: true };
}
