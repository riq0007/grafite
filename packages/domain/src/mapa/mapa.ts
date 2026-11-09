// O mapa da planta (spec mapa-da-planta; change p7-mapa-da-planta, design, decisões 1, 2 e 4): o
// modelo navegável no formato do PMG, em português; o conversor do DXF sobre o texto do arquivo, com
// as linhas, as polilinhas, os arcos, os círculos, os textos e os blocos inseridos com a posição, a
// escala e a rotação; a leitura do modelo já convertido do PMG; e a situação do marcador do ativo.

export interface ModeloDaPlanta {
  /** Em metros. */
  largura: number;
  profundidade: number;
  /** As linhas de cada camada do desenho, em pares x1, z1, x2, z2…, em metros. */
  camadas: { nome: string; segmentos: number[] }[];
  paredes: { nome: string; pontos: [number, number][]; altura: number }[];
  rotulos: { texto: string; x: number; z: number }[];
  maquinas: { nome: string; x: number; z: number; largura: number; profundidade: number }[];
}

export const MENSAGEM_DO_FORMATO_DA_PLANTA =
  'Envie o desenho em DXF ou o modelo da planta em JSON.';

const recusa = () => new Error(MENSAGEM_DO_FORMATO_DA_PLANTA);

/** As contagens que a planta guarda e a tela mostra. */
export function contagensDoModelo(modelo: ModeloDaPlanta) {
  return {
    segmentos: modelo.camadas.reduce((soma, camada) => soma + camada.segmentos.length / 4, 0),
    rotulos: modelo.rotulos.length,
    camadas: modelo.camadas.length,
    maquinas: modelo.maquinas.length,
  };
}

const numero = (valor: unknown) =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null;

/** O modelo convertido do PMG, em JSON, com os nomes dos campos em português. */
export function lerModeloDoPmg(dados: unknown): ModeloDaPlanta {
  const modelo = dados as Record<string, unknown> | null;
  const largura = numero(modelo?.width);
  const profundidade = numero(modelo?.depth);
  if (!modelo || largura === null || profundidade === null || !Array.isArray(modelo.layers)) {
    throw recusa();
  }
  const lista = (valor: unknown) =>
    (Array.isArray(valor) ? valor : []) as Record<string, unknown>[];
  return {
    largura,
    profundidade,
    camadas: lista(modelo.layers).map((camada) => ({
      nome: String(camada.name ?? ''),
      segmentos: (Array.isArray(camada.segments) ? camada.segments : []).filter(
        (valor): valor is number => typeof valor === 'number',
      ),
    })),
    paredes: lista(modelo.walls).map((parede) => ({
      nome: String(parede.name ?? ''),
      pontos: (Array.isArray(parede.points) ? parede.points : []) as [number, number][],
      altura: numero(parede.height) ?? 0,
    })),
    rotulos: lista(modelo.labels).map((rotulo) => ({
      texto: String(rotulo.text ?? ''),
      x: numero(rotulo.x) ?? 0,
      z: numero(rotulo.z) ?? 0,
    })),
    maquinas: lista(modelo.machines).map((maquina) => ({
      nome: String(maquina.name ?? ''),
      x: numero(maquina.x) ?? 0,
      z: numero(maquina.z) ?? 0,
      largura: numero(maquina.width) ?? 0,
      profundidade: numero(maquina.depth) ?? 0,
    })),
  };
}

/** Quantos metros tem cada unidade do `$INSUNITS`; sem ela, o milímetro, como o PMG. */
const METROS_DA_UNIDADE: Record<number, number> = {
  1: 0.0254,
  2: 0.3048,
  4: 0.001,
  5: 0.01,
  6: 1,
};

/** A tolerância das curvas e o menor segmento, em metros. */
const TOLERANCIA = 0.1;
const MENOR_SEGMENTO = 0.025;
const PROFUNDIDADE_DOS_BLOCOS = 8;

type Par = [number, string];

interface Entidade {
  tipo: string;
  pares: Par[];
}

/** O primeiro valor do código na entidade. */
const valor = (entidade: Entidade, codigo: number) =>
  entidade.pares.find(([outro]) => outro === codigo)?.[1];

const real = (entidade: Entidade, codigo: number, padrao = 0) => {
  const lido = Number(valor(entidade, codigo));
  return Number.isFinite(lido) ? lido : padrao;
};

/** Os pares de código e valor do arquivo, lidos linha a linha. */
function* paresDoDxf(texto: string): Generator<Par> {
  let posicao = 0;
  const proximaLinha = () => {
    if (posicao >= texto.length) return null;
    const fim = texto.indexOf('\n', posicao);
    const linha = texto.slice(posicao, fim === -1 ? texto.length : fim);
    posicao = fim === -1 ? texto.length : fim + 1;
    return linha.replace(/\r$/, '');
  };
  for (;;) {
    const codigo = proximaLinha();
    if (codigo === null) return;
    const conteudo = proximaLinha();
    if (conteudo === null) return;
    const lido = Number(codigo.trim());
    if (!Number.isInteger(lido)) throw recusa();
    yield [lido, conteudo.trim()];
  }
}

/** O texto do MTEXT sem os códigos de formatação. */
const textoLimpo = (bruto: string) =>
  bruto
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

type Ponto = [number, number];
type Transformacao = (ponto: Ponto) => Ponto;

const identidade: Transformacao = (ponto) => ponto;

/** O arco, aproximado por segmentos dentro da tolerância, em graus no sentido anti-horário. */
function pontosDoArco(
  [cx, cy]: Ponto,
  raio: number,
  inicio: number,
  fim: number,
  tolerancia: number,
): Ponto[] {
  let varredura = fim - inicio;
  while (varredura <= 0) varredura += 360;
  const passos = Math.min(
    64,
    Math.max(4, Math.ceil((((varredura * Math.PI) / 180) * raio) / tolerancia)),
  );
  const pontos: Ponto[] = [];
  for (let i = 0; i <= passos; i++) {
    const angulo = ((inicio + (varredura * i) / passos) * Math.PI) / 180;
    pontos.push([cx + raio * Math.cos(angulo), cy + raio * Math.sin(angulo)]);
  }
  return pontos;
}

/**
 * Converte o DXF no modelo da planta (design, decisão 2): as linhas por camada e os textos, em metros,
 * com a origem no canto de cima à esquerda e z para baixo, como na tela.
 */
export function converterDxf(texto: string): ModeloDaPlanta {
  if (!/^\s*0\s*\r?\n\s*SECTION/.test(texto.slice(0, 200))) throw recusa();
  let metros = 0.001;
  const blocos = new Map<string, { base: Ponto; entidades: Entidade[] }>();
  const entidades: Entidade[] = [];

  // A leitura das seções: o HEADER, os BLOCKS e as ENTITIES.
  let secao: string | null = null;
  let atual: Entidade | null = null;
  let bloco: { nome: string; base: Ponto; entidades: Entidade[]; lendoCabecalho: boolean } | null =
    null;
  let variavel: string | null = null;
  const fechar = () => {
    if (!atual) return;
    if (secao === 'BLOCKS' && bloco && !bloco.lendoCabecalho) bloco.entidades.push(atual);
    else if (secao === 'ENTITIES') entidades.push(atual);
    atual = null;
  };
  let esperaNomeDaSecao = false;
  for (const [codigo, conteudo] of paresDoDxf(texto)) {
    if (esperaNomeDaSecao) {
      if (codigo === 2) secao = conteudo;
      esperaNomeDaSecao = false;
      continue;
    }
    if (codigo === 0) {
      fechar();
      if (conteudo === 'SECTION') {
        esperaNomeDaSecao = true;
        continue;
      }
      if (conteudo === 'ENDSEC') {
        secao = null;
        continue;
      }
      if (conteudo === 'EOF') break;
      if (secao === 'BLOCKS') {
        if (conteudo === 'BLOCK') {
          bloco = { nome: '', base: [0, 0], entidades: [], lendoCabecalho: true };
          continue;
        }
        if (conteudo === 'ENDBLK') {
          if (bloco) blocos.set(bloco.nome, { base: bloco.base, entidades: bloco.entidades });
          bloco = null;
          continue;
        }
        if (bloco) bloco.lendoCabecalho = false;
      }
      if (secao === 'BLOCKS' || secao === 'ENTITIES') atual = { tipo: conteudo, pares: [] };
      continue;
    }
    if (secao === 'HEADER') {
      if (codigo === 9) variavel = conteudo;
      else if (variavel === '$INSUNITS' && codigo === 70) {
        metros = METROS_DA_UNIDADE[Number(conteudo)] ?? metros;
      }
      continue;
    }
    if (secao === 'BLOCKS' && bloco?.lendoCabecalho) {
      if (codigo === 2) bloco.nome = conteudo;
      else if (codigo === 10) bloco.base[0] = Number(conteudo) || 0;
      else if (codigo === 20) bloco.base[1] = Number(conteudo) || 0;
      continue;
    }
    atual?.pares.push([codigo, conteudo]);
  }
  fechar();

  // A geometria em unidades do desenho; a conversão para metros vem no fim.
  const linhas = new Map<string, number[]>();
  const textos: { texto: string; x: number; y: number }[] = [];
  const tolerancia = TOLERANCIA / metros;
  const linha = (camada: string, [x1, y1]: Ponto, [x2, y2]: Ponto) => {
    let lista = linhas.get(camada);
    if (!lista) {
      lista = [];
      linhas.set(camada, lista);
    }
    lista.push(x1, y1, x2, y2);
  };
  const polilinha = (camada: string, pontos: Ponto[], fechada: boolean, t: Transformacao) => {
    for (let i = 0; i + 1 < pontos.length; i++) {
      linha(camada, t(pontos[i] as Ponto), t(pontos[i + 1] as Ponto));
    }
    if (fechada && pontos.length > 2) {
      linha(camada, t(pontos[pontos.length - 1] as Ponto), t(pontos[0] as Ponto));
    }
  };

  const desenhar = (
    lista: Entidade[],
    t: Transformacao,
    camadaDoPai: string | null,
    nivel: number,
  ) => {
    for (let i = 0; i < lista.length; i++) {
      const entidade = lista[i] as Entidade;
      const camadaPropria = valor(entidade, 8) ?? '0';
      // O que está na camada 0 de um bloco herda a camada da inserção.
      const camada = camadaPropria === '0' && camadaDoPai ? camadaDoPai : camadaPropria;
      switch (entidade.tipo) {
        case 'LINE':
          linha(
            camada,
            t([real(entidade, 10), real(entidade, 20)]),
            t([real(entidade, 11), real(entidade, 21)]),
          );
          break;
        case 'LWPOLYLINE': {
          const pontos: Ponto[] = [];
          let x: number | null = null;
          for (const [codigo, conteudo] of entidade.pares) {
            if (codigo === 10) x = Number(conteudo);
            else if (codigo === 20 && x !== null) {
              pontos.push([x, Number(conteudo)]);
              x = null;
            }
          }
          polilinha(camada, pontos, (real(entidade, 70) & 1) === 1, t);
          break;
        }
        case 'POLYLINE': {
          const pontos: Ponto[] = [];
          const fechada = (real(entidade, 70) & 1) === 1;
          while (lista[i + 1]?.tipo === 'VERTEX') {
            i += 1;
            const vertice = lista[i] as Entidade;
            pontos.push([real(vertice, 10), real(vertice, 20)]);
          }
          if (lista[i + 1]?.tipo === 'SEQEND') i += 1;
          polilinha(camada, pontos, fechada, t);
          break;
        }
        case 'CIRCLE':
          polilinha(
            camada,
            pontosDoArco(
              [real(entidade, 10), real(entidade, 20)],
              real(entidade, 40),
              0,
              360,
              tolerancia,
            ),
            false,
            t,
          );
          break;
        case 'ARC':
          polilinha(
            camada,
            pontosDoArco(
              [real(entidade, 10), real(entidade, 20)],
              real(entidade, 40),
              real(entidade, 50),
              real(entidade, 51),
              tolerancia,
            ),
            false,
            t,
          );
          break;
        case 'TEXT':
        case 'MTEXT': {
          const partes = entidade.pares
            .filter(([codigo]) => codigo === 3 || codigo === 1)
            .map(([, conteudo]) => conteudo);
          const escrito = textoLimpo(partes.join(''));
          if (escrito) {
            const [x, y] = t([real(entidade, 10), real(entidade, 20)]);
            textos.push({ texto: escrito, x, y });
          }
          break;
        }
        case 'INSERT': {
          const definido = blocos.get(valor(entidade, 2) ?? '');
          if (!definido || nivel >= PROFUNDIDADE_DOS_BLOCOS) break;
          const [bx, by] = definido.base;
          const [ix, iy] = [real(entidade, 10), real(entidade, 20)];
          const [sx, sy] = [real(entidade, 41, 1), real(entidade, 42, 1)];
          const angulo = (real(entidade, 50) * Math.PI) / 180;
          const [cos, sin] = [Math.cos(angulo), Math.sin(angulo)];
          const doBloco: Transformacao = ([x, y]) => {
            const [px, py] = [(x - bx) * sx, (y - by) * sy];
            return t([ix + px * cos - py * sin, iy + px * sin + py * cos]);
          };
          desenhar(definido.entidades, doBloco, camada, nivel + 1);
          break;
        }
        default:
          break;
      }
    }
  };
  desenhar(entidades, identidade, null, 0);

  // A caixa das linhas dá a origem: o canto de cima à esquerda, com z para baixo.
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const lista of linhas.values()) {
    for (let i = 0; i < lista.length; i += 2) {
      const [x, y] = [lista[i] as number, lista[i + 1] as number];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) throw recusa();
  const redondo = (valor: number) => Math.round(valor * 1000) / 1000;
  const emX = (x: number) => redondo((x - minX) * metros);
  const emZ = (y: number) => redondo((maxY - y) * metros);
  const camadas = [...linhas.entries()].map(([nome, lista]) => {
    const segmentos: number[] = [];
    for (let i = 0; i < lista.length; i += 4) {
      const [x1, z1, x2, z2] = [
        emX(lista[i] as number),
        emZ(lista[i + 1] as number),
        emX(lista[i + 2] as number),
        emZ(lista[i + 3] as number),
      ];
      if (Math.hypot(x2 - x1, z2 - z1) < MENOR_SEGMENTO) continue;
      segmentos.push(x1, z1, x2, z2);
    }
    return { nome, segmentos };
  });
  return {
    largura: redondo((maxX - minX) * metros),
    profundidade: redondo((maxY - minY) * metros),
    camadas: camadas.filter((camada) => camada.segmentos.length > 0),
    paredes: [],
    rotulos: textos.map(({ texto: escrito, x, y }) => ({ texto: escrito, x: emX(x), z: emZ(y) })),
    maquinas: [],
  };
}

export type TomNoMapa = 'critico' | 'atencao' | 'sucesso' | 'neutra' | 'info';

/** A pior situação do ativo no mapa, por extenso e com o tom (design, decisão 4). */
export function situacaoNoMapa({
  alertas,
  disponibilidade,
}: {
  /** As severidades dos alertas abertos do ativo. */
  alertas: readonly string[];
  disponibilidade: 'online' | 'offline' | null;
}): { texto: string; tom: TomNoMapa } {
  if (alertas.includes('critico')) return { texto: 'Alerta crítico', tom: 'critico' };
  if (disponibilidade === 'offline') return { texto: 'Offline', tom: 'critico' };
  if (alertas.includes('atencao')) return { texto: 'Atenção', tom: 'atencao' };
  if (disponibilidade === 'online') return { texto: 'Online', tom: 'sucesso' };
  return { texto: 'Sem coleta', tom: 'neutra' };
}
