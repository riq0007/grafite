// O arrastar para passar em "Quem está com o quê" (spec modulo-chamados, "Arrastar para passar";
// change chamados-da-ti, design, decisão 22, "O arraste"; mockup m02): quem recebe o quadrado, com
// a frase de soltar ou o motivo da recusa, e o aviso no lugar de origem. A mesma regra filtra o
// "Passar para…" da prévia e do menu, para os três não divergirem. Tudo puro; a tela só a desenha.
import {
  type ArvoreDeLocais,
  atendeOChamado,
  nomeCurto,
  type SituacaoDoPrazo,
} from '@grafite/domain';
import type { ChamadoNosPrazos, ColunaDoQuadro } from '../consultas.ts';
import { chaveDaColuna } from './quadro.ts';

/** A chave do alvo da triagem; a das pessoas é a da coluna (`chaveDaColuna`). */
export const ALVO_DA_TRIAGEM = 'triagem';

/** A chave do alvo de uma coluna; nula, a triagem. */
export const chaveDoAlvo = (coluna: ColunaDoQuadro | null) =>
  coluna ? chaveDaColuna(coluna) : ALVO_DA_TRIAGEM;

/** O chamado no ar: o que a regra de quem recebe lê dele. */
export interface ChamadoArrastado {
  numero: number;
  situacao: ChamadoNosPrazos['situacao'];
  /** A conta da coluna em que ele está; nula, na triagem. */
  responsavel: string | null;
  /** A chave da coluna em que ele está, que não recebe e não diz nada. */
  origem: string;
  /** Quem pediu, que o chamado aguardando espera. */
  pessoa: string;
  locais: readonly string[];
  semLocal: boolean;
}

/** O chamado da lista, na coluna em que o quadro o pôs; nula, a triagem. */
export function chamadoArrastado(
  chamado: ChamadoNosPrazos,
  coluna: ColunaDoQuadro | null,
): ChamadoArrastado {
  return {
    numero: chamado.numero,
    situacao: chamado.situacao,
    responsavel: coluna?.conta ?? null,
    origem: chaveDoAlvo(coluna),
    pessoa: chamado.pessoa.nome,
    locais: chamado.locais,
    semLocal: chamado.semLocal,
  };
}

/** A coluna sob o chamado no ar: a frase de soltar, ou o motivo da recusa; nulo, na de origem. */
export type NaColuna = { recebe: true; frase: string } | { recebe: false; motivo: string | null };

/**
 * O que a coluna não atende do chamado: o caminho do primeiro local fora do alcance, os chamados
 * sem local, ou nada. O alcance é o `atende` do quadro, com os ramos das raízes pela árvore dos
 * locais. Sem a árvore ainda, só o chamado sem local fica de fora: a API confere o resto.
 */
function foraDoAlcance(
  chamado: ChamadoArrastado,
  { organizacao, locais }: ColunaDoQuadro['atende'],
  arvore: ArvoreDeLocais | undefined,
): string | null {
  if (organizacao) return null;
  if (!arvore)
    return chamado.semLocal || chamado.locais.length === 0 ? 'os chamados sem local' : null;
  const alcance = new Set(locais.flatMap((raiz) => [...arvore.ramo(raiz)]));
  if (atendeOChamado(alcance, chamado)) return null;
  const local = chamado.locais.find((id) => !alcance.has(id));
  if (local === undefined) return 'os chamados sem local';
  return arvore.local(local) ? arvore.caminho(local) : 'os locais do chamado';
}

/**
 * Se a coluna recebe o chamado no ar, pela matriz das ações (spec chamados, "Ações do atendimento"):
 * a triagem recebe o que está em atendimento, e a coluna de uma pessoa, o que não está com ela, se
 * ela ainda atende os chamados e atende os locais do chamado (spec chamados, "Carga de cada
 * pessoa").
 */
export function naColuna(
  chamado: ChamadoArrastado,
  coluna: ColunaDoQuadro | null,
  arvore?: ArvoreDeLocais,
): NaColuna {
  if (chaveDoAlvo(coluna) === chamado.origem) return { recebe: false, motivo: null };
  if (coluna === null) {
    if (chamado.situacao === 'aguardando') {
      const quem = nomeCurto(chamado.pessoa);
      return { recebe: false, motivo: `O #${chamado.numero} está aguardando ${quem}` };
    }
    return { recebe: true, frase: 'Soltar para devolver à triagem · o prazo continua contando' };
  }
  const nome = nomeCurto(coluna.nome);
  if (coluna.conta === chamado.responsavel) {
    return { recebe: false, motivo: `O #${chamado.numero} já está com ${nome}` };
  }
  if (coluna.naoAtendeMais) return { recebe: false, motivo: `${nome} não atende mais os chamados` };
  const fora = foraDoAlcance(chamado, coluna.atende, arvore);
  if (fora !== null) return { recebe: false, motivo: `${nome} não atende ${fora}` };
  const relogio =
    chamado.situacao === 'aguardando' ? 'o relógio continua parado' : 'o prazo continua contando';
  return { recebe: true, frase: `Soltar para passar a ${nome} · ${relogio}` };
}

/** O aviso no lugar de origem: "O #1038 está sendo movido. O prazo dele vence em 2 h." */
export function avisoDaOrigem(numero: number, situacao: SituacaoDoPrazo | null): string {
  let prazo: string;
  if (situacao === null) prazo = 'O prazo dele está ilegível.';
  else if (situacao.grupo === 'parado') prazo = 'O relógio dele está parado.';
  else if (situacao.grupo === 'estourado') prazo = `O prazo dele está ${situacao.texto}.`;
  else prazo = `O prazo dele ${situacao.texto}.`;
  return `O #${numero} está sendo movido. ${prazo}`;
}
