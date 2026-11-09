// Funções puras dos instrumentos de visualização (change visualizacoes-de-dados, design): a posição
// na régua, os números em pt-BR, o resumo da faixa de dias e o caminho da tendência.

/** A posição de um valor na régua, em percentual, limitada às pontas. */
export function posicaoNaRegua(valor: number, maximo: number): number {
  if (!(maximo > 0)) return 0;
  return Math.min(100, Math.max(0, (valor / maximo) * 100));
}

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * O número com os milhares do pt-BR. O percentual vai colado, como no "8%" dos suprimentos; as
 * outras unidades vão com o espaço que não quebra.
 */
export function formatarNumero(valor: number, unidade?: string): string {
  const numero = NUMERO.format(valor);
  if (!unidade) return numero;
  return unidade === '%' ? `${numero}%` : `${numero} ${unidade}`;
}

export interface DiaDaFaixa {
  /** AAAA-MM-DD. */
  data: string;
  situacao: 'ok' | 'parcial' | 'falha' | 'nada';
  detalhe?: string;
}

export interface ResumoDosDias {
  total: number;
  /** Os dias com o que se conta: o concluído e o parcial. */
  comAlgo: number;
  ok: number;
  parcial: number;
  falha: number;
  nada: number;
  texto: string;
}

const plural = (quantidade: number, singular: string, varios: string) =>
  `${quantidade} ${quantidade === 1 ? singular : varios}`;

/** As contagens da faixa e o resumo em texto, como "26 de 30 dias com backup · 2 falhas". */
export function resumoDosDias(dias: DiaDaFaixa[], oQue: string): ResumoDosDias {
  const contagem = { ok: 0, parcial: 0, falha: 0, nada: 0 };
  for (const dia of dias) contagem[dia.situacao] += 1;
  const total = dias.length;
  const comAlgo = contagem.ok + contagem.parcial;
  if (total === 0) return { total, comAlgo, ...contagem, texto: 'Nenhum dia' };
  const partes = [`${comAlgo} de ${plural(total, 'dia', 'dias')} com ${oQue}`];
  if (contagem.falha > 0) partes.push(plural(contagem.falha, 'falha', 'falhas'));
  if (contagem.parcial > 0) partes.push(plural(contagem.parcial, 'parcial', 'parciais'));
  return { total, comAlgo, ...contagem, texto: partes.join(' · ') };
}

export interface PontoDaTendencia {
  momento: string;
  valor: number;
}

interface Xy {
  x: number;
  y: number;
}

export interface CaminhoDaTendencia {
  /** O caminho da linha, no atributo `d` do SVG. */
  linha: string;
  ultimo: Xy | null;
  /** O caminho tracejado do último ponto até a projeção. */
  projecao: string | null;
}

const MARGEM = 2;
const umaCasa = (n: number) => n.toFixed(1);

/**
 * O caminho de uma série no SVG, com o tempo na horizontal e o valor na vertical, o maior em cima.
 * A projeção entra na mesma escala. Com um ponto só, ele fica no meio.
 */
export function caminhoDaTendencia(
  pontos: PontoDaTendencia[],
  largura: number,
  altura: number,
  projecao?: PontoDaTendencia,
): CaminhoDaTendencia {
  if (pontos.length === 0) return { linha: '', ultimo: null, projecao: null };
  const emOrdem = [...pontos].sort((a, b) => Date.parse(a.momento) - Date.parse(b.momento));
  const todos = projecao ? [...emOrdem, projecao] : emOrdem;
  const tempos = todos.map((p) => Date.parse(p.momento));
  const valores = todos.map((p) => p.valor);
  const [t0, t1] = [Math.min(...tempos), Math.max(...tempos)];
  const [v0, v1] = [Math.min(...valores), Math.max(...valores)];
  const x = (t: number) =>
    t1 === t0 ? largura / 2 : MARGEM + ((t - t0) / (t1 - t0)) * (largura - 2 * MARGEM);
  const y = (v: number) =>
    v1 === v0 ? altura / 2 : altura - MARGEM - ((v - v0) / (v1 - v0)) * (altura - 2 * MARGEM);
  const xy = emOrdem.map((p) => ({ x: x(Date.parse(p.momento)), y: y(p.valor) }));
  const linha = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${umaCasa(p.x)} ${umaCasa(p.y)}`).join(' ');
  const ultimo = xy.at(-1) ?? null;
  const fimDaProjecao = projecao
    ? { x: x(Date.parse(projecao.momento)), y: y(projecao.valor) }
    : null;
  return {
    linha,
    ultimo: ultimo && { x: Math.round(ultimo.x * 10) / 10, y: Math.round(ultimo.y * 10) / 10 },
    projecao:
      ultimo && fimDaProjecao
        ? `M${umaCasa(ultimo.x)} ${umaCasa(ultimo.y)} L${umaCasa(fimDaProjecao.x)} ${umaCasa(fimDaProjecao.y)}`
        : null,
  };
}
