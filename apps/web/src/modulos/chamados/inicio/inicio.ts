// O que o Início dos chamados monta do quadro e da lista dos prazos (spec modulo-chamados, "Início
// dos chamados"; change chamados-da-ti, design, "O Início dos chamados (tarefa 5.17)"; mockup m12):
// os números e a frase da contagem, as linhas da triagem e as ações delas, os prazos sem os parados
// e a frase dos parados. Tudo puro; a tela só desenha.
import type { ArvoreDeLocais } from '@grafite/domain';
import type {
  ChamadoNosPrazos,
  ColunaDoQuadro,
  PrazosDosChamados,
  QuadroDosChamados,
} from '../consultas.ts';
import type { ContarOPrazo } from '../prazo.ts';
import type { GrupoDosPrazos } from '../prazos/lista.ts';
import { chamadoArrastado } from '../quadro/arraste.ts';
import { acoesDoChamado, type PessoaParaPassar, pessoasParaPassar } from '../quadro/previa.ts';
import {
  abertosNoQuadro,
  listaPorNumero,
  type Quadrado,
  quadradosDaColuna,
} from '../quadro/quadro.ts';

/** O que a contagem do alto conta. */
export interface NumerosDoInicio {
  triagem: number;
  /** Os que já passaram do prazo, pela lista contada no minuto da tela. */
  estourados: number;
  /** Os abertos que a conta vê: os da triagem e os de todas as colunas. */
  abertos: number;
  resolvidosHoje: number;
}

/**
 * Os números da contagem: a triagem, os abertos e os resolvidos hoje vêm do quadro; os estourados, da
 * lista dos prazos, nos grupos que a tela contou no minuto dela.
 */
export function numerosDoInicio(
  quadro: Pick<QuadroDosChamados, 'triagem' | 'colunas' | 'resolvidosHoje'>,
  grupos: readonly GrupoDosPrazos[],
): NumerosDoInicio {
  return {
    triagem: quadro.triagem.abertos.length,
    estourados: grupos.find(({ grupo }) => grupo === 'estourado')?.linhas.length ?? 0,
    abertos: abertosNoQuadro(quadro),
    resolvidosHoje: quadro.resolvidosHoje.length,
  };
}

/** Um pedaço da frase da contagem; o forte vai em peso forte. */
export interface TrechoDaContagem {
  texto: string;
  forte: boolean;
}

const fraco = (texto: string): TrechoDaContagem => ({ texto, forte: false });

/** "nenhum resolvido hoje", "1 resolvido hoje", "3 resolvidos hoje". */
function resolvidos(quantos: number): string {
  if (quantos === 0) return 'nenhum resolvido hoje';
  return `${quantos} ${quantos === 1 ? 'resolvido' : 'resolvidos'} hoje`;
}

/**
 * A frase da contagem, como no m12: "3 esperam na triagem e 1 já passou do prazo. 12 chamados
 * abertos na equipe, 1 resolvido hoje.". O que pede a ação, a triagem e o estourado, vai em peso
 * forte quando há algum; o zero fica sem ele, porque chamaria a atenção para nada. Sem chamados
 * abertos, "Nenhum chamado aberto." no lugar das duas primeiras partes.
 */
export function contagemDoInicio({
  triagem,
  estourados,
  abertos,
  resolvidosHoje,
}: NumerosDoInicio): TrechoDaContagem[] {
  if (abertos === 0) {
    const depois = resolvidos(resolvidosHoje);
    return [fraco(`Nenhum chamado aberto. ${depois.charAt(0).toUpperCase()}${depois.slice(1)}.`)];
  }
  const naTriagem: TrechoDaContagem =
    triagem === 0
      ? fraco('Nenhum chamado espera na triagem')
      : { texto: `${triagem} ${triagem === 1 ? 'espera' : 'esperam'} na triagem`, forte: true };
  const passaram: TrechoDaContagem =
    estourados === 0
      ? fraco('nenhum passou do prazo')
      : {
          texto: `${estourados} já ${estourados === 1 ? 'passou' : 'passaram'} do prazo`,
          forte: true,
        };
  const naEquipe = `${abertos} ${abertos === 1 ? 'chamado aberto' : 'chamados abertos'} na equipe`;
  return [
    naTriagem,
    fraco(' e '),
    passaram,
    fraco(`. ${naEquipe}, ${resolvidos(resolvidosHoje)}.`),
  ];
}

/**
 * As linhas da triagem, na ordem da coluna da triagem do quadro (`quadradosDaColuna`): pelo
 * vencimento, e o número que a lista ainda não trouxe por último, sem o chamado.
 */
export function linhasDaTriagem(
  quadro: Pick<QuadroDosChamados, 'triagem'>,
  prazos: PrazosDosChamados,
  contar: ContarOPrazo,
): Quadrado[] {
  return quadradosDaColuna(quadro.triagem.abertos, {
    lista: listaPorNumero(prazos),
    horario: prazos.horario,
    contar,
  });
}

/** "Helena Prado, Diretoria": quem pediu e o local dela; sem o local, só o nome. */
export function quemPediuNaTriagem({ pessoa }: Pick<ChamadoNosPrazos, 'pessoa'>): string {
  return pessoa.local ? `${pessoa.nome}, ${pessoa.local}` : pessoa.nome;
}

/** Os botões da linha da triagem: "Assumir" e as pessoas de "Passar para…". */
export interface AcoesDaTriagem {
  assumir: boolean;
  pessoas: PessoaParaPassar[];
}

/**
 * Os botões da linha da triagem, pela permissão: a quem atende, "Assumir" e "Passar para…", com as
 * pessoas que recebem o chamado, as mesmas do arraste e da prévia (`pessoasParaPassar`); a quem só
 * vê, e ao número que a lista ainda não trouxe, nenhum, porque a versão e os locais vêm dela.
 */
export function acoesDaTriagem(
  chamado: ChamadoNosPrazos | null,
  {
    podeAtender,
    conta,
    colunas,
    arvore,
  }: {
    podeAtender: boolean;
    conta: string | null;
    colunas: readonly ColunaDoQuadro[];
    arvore?: ArvoreDeLocais;
  },
): AcoesDaTriagem | null {
  if (!podeAtender || !chamado) return null;
  const { assumir, passar } = acoesDoChamado(
    { situacao: chamado.situacao, responsavel: null },
    conta,
  );
  return {
    assumir,
    pessoas: passar ? pessoasParaPassar(colunas, chamadoArrastado(chamado, null), arvore) : [],
  };
}

/** Os grupos dos prazos do Início: os da lista compacta, sem o do relógio parado. */
export function gruposDoInicio(grupos: readonly GrupoDosPrazos[]): GrupoDosPrazos[] {
  return grupos.filter(({ grupo }) => grupo !== 'parado');
}

/** Quantos parados a frase mostra pelo número; os outros entram no "e mais 2". */
const PARADOS_NA_FRASE = 5;

/**
 * A frase do pé dos prazos: "3 com o relógio parado, esperando o colaborador: #1041, #1032 e
 * #1029.", na ordem do grupo do relógio parado da lista (o que resta, primeiro), com até 5 números e
 * "e mais 2". Sem parados, nenhuma.
 */
export function fraseDosParados(grupos: readonly GrupoDosPrazos[]): string | null {
  const linhas = grupos.find(({ grupo }) => grupo === 'parado')?.linhas ?? [];
  if (linhas.length === 0) return null;
  const numeros = linhas.map(({ chamado }) => `#${chamado.numero}`);
  const mostrados = numeros.slice(0, PARADOS_NA_FRASE);
  const resto = numeros.length - mostrados.length;
  const lista =
    resto > 0
      ? `${mostrados.join(', ')} e mais ${resto}`
      : mostrados.length === 1
        ? mostrados.join('')
        : `${mostrados.slice(0, -1).join(', ')} e ${mostrados.at(-1)}`;
  return `${linhas.length} com o relógio parado, esperando o colaborador: ${lista}.`;
}
