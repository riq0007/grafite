// A prévia do quadrado em "Quem está com o quê" (spec modulo-chamados, "Quem está com o quê"; spec
// chamados, "Ações do atendimento"; change chamados-da-ti, design, decisão 22, "A prévia e o menu"):
// o lugar dela junto do quadrado, a hora da última mensagem, quem pode receber o chamado, as ações
// que ele aceita e o relógio que a abre e a fecha. Tudo puro, para os testes com o
// tempo falso; a tela só liga os eventos do ponteiro e do foco a ele.
import type { ArvoreDeLocais } from '@grafite/domain';
import { type DataHora, tempos } from '@grafite/ui';
import type { ChamadoNosPrazos, ColunaDoQuadro } from '../consultas.ts';
import { type ChamadoArrastado, naColuna } from './arraste.ts';

/** Quanto o ponteiro fica parado sobre o quadrado para a prévia abrir, em ms. */
export const ESPERA_DA_PREVIA = 200;
/** A largura da prévia, a do m01, e o vão entre ela e o quadrado. */
export const LARGURA_DA_PREVIA = 388;
const VAO = 8;

/** Uma caixa nas coordenadas da janela, como a do `getBoundingClientRect`. */
export interface Caixa {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LugarDaPrevia {
  left: number;
  top: number;
  largura: number;
  /** A altura que cabe, quando ela não cabe inteira nem embaixo nem em cima; senão, nula. */
  alturaMaxima: number | null;
}

/**
 * Onde a prévia fica: 8 px embaixo do quadrado, alinhada à esquerda dele, e encostada na borda
 * direita da área quando não cabe, como a do #1033 no m01. Sem lugar embaixo, em cima. Sem lugar em
 * nenhum dos dois, no lado com mais espaço, até a borda da área, e o resto rola dentro dela.
 */
export function lugarDaPrevia(quadrado: Caixa, area: Caixa, altura: number): LugarDaPrevia {
  const largura = Math.max(0, Math.min(LARGURA_DA_PREVIA, area.right - area.left));
  const left = Math.max(area.left, Math.min(quadrado.left, area.right - largura));
  const embaixo = area.bottom - (quadrado.bottom + VAO);
  const emCima = quadrado.top - VAO - area.top;
  if (altura <= embaixo) return { left, top: quadrado.bottom + VAO, largura, alturaMaxima: null };
  if (altura <= emCima) {
    return { left, top: quadrado.top - VAO - altura, largura, alturaMaxima: null };
  }
  if (embaixo >= emCima) {
    return { left, top: quadrado.bottom + VAO, largura, alturaMaxima: Math.max(0, embaixo) };
  }
  return { left, top: area.top, largura, alturaMaxima: Math.max(0, emCima) };
}

/**
 * Se o quadrado passou inteiro de uma das bordas da área, com a rolagem das colunas. O que encosta
 * na borda, ou fica meio fora, continua dentro: a prévia ainda tem onde ficar junto dele.
 */
export function foraDaArea(quadrado: Caixa, area: Caixa): boolean {
  return (
    quadrado.bottom < area.top ||
    quadrado.top > area.bottom ||
    quadrado.right < area.left ||
    quadrado.left > area.right
  );
}

/**
 * A hora da última mensagem, no fuso da conta: "09:12" hoje, "ontem, 15:10" e "seg 9 nov, 16:00"
 * antes. A de outro ano leva o ano: "10/11/2025, 16:00".
 */
export function momentoDaMensagem(
  em: Date,
  agora: Date,
  { formatarHora, formatarDia, formatarData, grupoDoDia }: DataHora,
): string {
  const hora = formatarHora(em);
  const grupo = grupoDoDia(em, agora);
  if (grupo === 'Hoje') return hora;
  if (grupo === 'Ontem') return `ontem, ${hora}`;
  const ano = (data: Date) => formatarData(data).slice(-4);
  if (ano(em) !== ano(agora)) return `${formatarData(em)}, ${hora}`;
  return `${formatarDia(em)}, ${hora}`;
}

/** Quem pode receber o chamado, com os abertos dele. */
export interface PessoaParaPassar {
  conta: string;
  nome: string;
  abertos: number;
}

/**
 * As pessoas de "Passar para…": as das colunas que recebem o chamado no arraste (`naColuna`), na
 * ordem delas. Ficam de fora quem está com o chamado, a coluna de quem não atende mais os chamados
 * e quem não atende os locais do chamado.
 */
export function pessoasParaPassar(
  colunas: readonly ColunaDoQuadro[],
  chamado: ChamadoArrastado,
  arvore?: ArvoreDeLocais,
): PessoaParaPassar[] {
  return colunas
    .filter((coluna) => naColuna(chamado, coluna, arvore).recebe)
    .map(({ conta, nome, abertos }) => ({ conta, nome, abertos: abertos.length }));
}

export interface AcoesDoChamado {
  assumir: boolean;
  passar: boolean;
  devolver: boolean;
}

/**
 * As ações que o chamado aceita, pela matriz das ações (spec chamados, "Ações do atendimento"):
 * assumir e passar fora no resolvido, assumir fora no que já está com a conta, e devolver à triagem
 * só no que está em atendimento.
 */
export function acoesDoChamado(
  {
    situacao,
    responsavel,
  }: { situacao: ChamadoNosPrazos['situacao']; responsavel: { conta: string } | null },
  conta: string | null,
): AcoesDoChamado {
  const aberto = situacao !== 'resolvido';
  return {
    assumir: aberto && (responsavel === null || responsavel.conta !== conta),
    passar: aberto,
    devolver: situacao === 'em-atendimento',
  };
}

export interface ControleDaPrevia {
  /** O mouse se moveu sobre o quadrado: recomeça a espera, ou mantém a prévia dele aberta. */
  moverSobre: (numero: number) => void;
  /** O ponteiro entrou no quadrado ou na prévia dele: a prévia aberta fica. */
  ficar: (numero: number) => void;
  /** O ponteiro saiu do quadrado e da prévia dele. */
  sair: (numero: number) => void;
  /** O foco do teclado chegou ao quadrado ou à prévia dele: ela abre na hora. */
  focar: (numero: number) => void;
  /** O foco saiu do quadrado e da prévia dele. */
  focoSaiu: (numero: number) => void;
  /**
   * A rolagem ou a mudança do tamanho da janela: cancela a espera e fecha a aberta pelo ponteiro. A
   * aberta pelo foco fica e acompanha o quadrado, porque o foco que chega a um quadrado fora da área
   * rola as colunas até ele. Quando a rolagem tira o quadrado inteiro da área (`foraDaArea`), a
   * tela a fecha.
   */
  rolou: () => void;
  /**
   * O quadrado saiu da coluna em que estava, porque mudou de coluna ou saiu do quadro: ele sai de
   * baixo do ponteiro, e a aberta pelo ponteiro fecha, e a espera dele acaba. A aberta pelo foco
   * acompanha o quadrado.
   */
  quadradoSaiu: (numero: number) => void;
  /**
   * Se a prévia do quadrado está aberta pelo ponteiro. Com a resposta de uma ação, ela fecha, porque
   * o quadrado que muda de coluna sai de baixo do ponteiro; a aberta pelo foco acompanha o quadrado.
   * O foco do teclado que chega à aberta pelo ponteiro a passa ao foco.
   */
  abertaPeloPonteiro: (numero: number) => boolean;
  /** Esc, o menu ou a resposta de uma ação: fecha na hora. */
  fechar: () => void;
  /** A tela sai: cancela as esperas, sem avisar. */
  parar: () => void;
}

/**
 * O relógio da prévia. Aberta pelo ponteiro, ela fecha 300 ms depois de ele sair do quadrado e
 * dela (o `tempos.cartao.fechar`), o tempo de passar de um ao outro; aberta pelo foco, quando o foco
 * sai dos dois. Só uma fica aberta: a de outro quadrado abre no lugar dela, sem passar pelo fechar.
 */
export function controleDaPrevia({
  espera = ESPERA_DA_PREVIA,
  fechamento = tempos.cartao.fechar,
  aoAbrir,
  aoFechar,
}: {
  espera?: number;
  fechamento?: number;
  aoAbrir: (numero: number) => void;
  aoFechar: () => void;
}): ControleDaPrevia {
  let aberta: { numero: number; peloFoco: boolean } | null = null;
  let abrindo: { numero: number; temporizador: ReturnType<typeof setTimeout> } | null = null;
  let fechando: ReturnType<typeof setTimeout> | undefined;
  const cancelarAbertura = () => {
    if (abrindo) clearTimeout(abrindo.temporizador);
    abrindo = null;
  };
  const cancelarFechamento = () => {
    clearTimeout(fechando);
    fechando = undefined;
  };
  const abrir = (numero: number, peloFoco: boolean) => {
    cancelarAbertura();
    cancelarFechamento();
    const outra = aberta?.numero !== numero;
    aberta = { numero, peloFoco };
    if (outra) aoAbrir(numero);
  };
  const fechar = () => {
    cancelarAbertura();
    cancelarFechamento();
    if (!aberta) return;
    aberta = null;
    aoFechar();
  };
  return {
    moverSobre(numero) {
      if (aberta?.numero === numero) {
        cancelarAbertura();
        cancelarFechamento();
        return;
      }
      cancelarAbertura();
      abrindo = { numero, temporizador: setTimeout(() => abrir(numero, false), espera) };
    },
    ficar(numero) {
      if (aberta?.numero === numero) cancelarFechamento();
    },
    sair(numero) {
      if (abrindo?.numero === numero) cancelarAbertura();
      if (aberta?.numero === numero && !aberta.peloFoco) {
        cancelarFechamento();
        fechando = setTimeout(fechar, fechamento);
      }
    },
    focar(numero) {
      abrir(numero, true);
    },
    focoSaiu(numero) {
      if (aberta?.numero === numero && aberta.peloFoco) fechar();
    },
    rolou() {
      cancelarAbertura();
      if (aberta && !aberta.peloFoco) fechar();
    },
    quadradoSaiu(numero) {
      if (abrindo?.numero === numero) cancelarAbertura();
      if (aberta?.numero === numero && !aberta.peloFoco) fechar();
    },
    abertaPeloPonteiro(numero) {
      return aberta?.numero === numero && !aberta.peloFoco;
    },
    fechar,
    parar() {
      cancelarAbertura();
      cancelarFechamento();
    },
  };
}
