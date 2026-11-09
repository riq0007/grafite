// Gerador dos temas (design da fundamentos-v3, decisões 2 e 3): cada tema sai do tom, da base
// (matiz e croma dos neutros) e do contraste, em OKLCH. Cada papel tem uma luminosidade-alvo, e a
// do texto e a da borda se movem, para longe dos fundos, até o mínimo da WCAG 2.2 AA.
import { comAlfa, compor, contraste } from './contraste.ts';
import { TINTA_DO_ROTULO } from './escalas.ts';
import { type Oklch, oklchParaHex, paraOklch } from './oklch.ts';
import {
  type CoresDoDestaque,
  type CoresDoTema,
  camadasDeEstado,
  type EstadosDoDestaque,
  estadosDoDestaque,
  OPACIDADE_DO_ANEL,
  type Tom,
} from './papeis.ts';

export interface EntradaDoTema {
  tom: Tom;
  /** A matiz (graus) e o croma (de 0 a 0,06) dos neutros. */
  base: { matiz: number; croma: number };
  /** De 0 a 100: separa as superfícies, escurece ou clareia o texto e reforça as linhas. */
  contraste: number;
  /** Fundo preto absoluto, para telas OLED. */
  oled?: boolean;
}

export interface CoresGeradas extends CoresDoTema {
  superficieAfundada: string;
  superficieElevada: string;
}

export interface TemaGerado {
  tom: Tom;
  cores: CoresGeradas;
  /** Sombra da superfície elevada: uma camada curta. */
  sombraElevada: string;
  /** Sombra das camadas sobrepostas (menus, avisos, diálogos e a busca). */
  sombraSobreposta: string;
}

const TEXTO = 4.5;
const TEXTO_PRINCIPAL = 7;
const COMPONENTE = 3;

const entre = (de: number, ate: number, fracao: number) => de + (ate - de) * fracao;

/**
 * Move a luminosidade da cor, sem mudar a matiz, na direção indicada, até a cor passar. Busca
 * binária pela luminosidade mais próxima da pedida; se nem o extremo passa, devolve o extremo.
 */
export function ajustarLuminosidade(
  cor: Oklch,
  passa: (hex: string) => boolean,
  sentido: 'clarear' | 'escurecer',
): string {
  const pedida = oklchParaHex(cor);
  if (passa(pedida)) return pedida;
  const extremo = sentido === 'clarear' ? 1 : 0;
  let falha = cor.l;
  let acerta = extremo;
  if (!passa(oklchParaHex({ ...cor, l: extremo }))) return oklchParaHex({ ...cor, l: extremo });
  for (let passo = 0; passo < 30; passo++) {
    const meio = (falha + acerta) / 2;
    if (passa(oklchParaHex({ ...cor, l: meio }))) acerta = meio;
    else falha = meio;
  }
  return oklchParaHex({ ...cor, l: acerta });
}

const passaContra = (fundos: string[], minimo: number) => (hex: string) =>
  fundos.every((fundo) => contraste(hex, fundo) >= minimo);

export function gerarTema(entrada: EntradaDoTema): TemaGerado {
  const k = Math.min(100, Math.max(0, entrada.contraste)) / 100;
  const escuro = entrada.tom === 'escuro';
  /** Neutro da base. O texto usa menos croma que as superfícies, pelo múltiplo de cada papel. */
  const neutro = (l: number, multiplo = 1): Oklch => ({
    l,
    c: entrada.base.croma * multiplo,
    h: entrada.base.matiz,
  });
  const cor = (l: number, multiplo = 1) => oklchParaHex(neutro(l, multiplo));

  const superficies = escuro
    ? entrada.oled
      ? {
          fundo: '#000000',
          superficieAfundada: '#000000',
          superficie: cor(0.15),
          superficie2: cor(0.2),
          superficieElevada: cor(0.215),
          materialSolido: cor(0.22),
          miniatura: cor(0.21),
        }
      : {
          fundo: cor(entre(0.18, 0.14, k)),
          superficieAfundada: cor(entre(0.195, 0.16, k)),
          superficie: cor(entre(0.215, 0.19, k)),
          superficie2: cor(entre(0.255, 0.235, k)),
          superficieElevada: cor(entre(0.27, 0.25, k)),
          materialSolido: cor(entre(0.285, 0.265, k)),
          miniatura: cor(entre(0.265, 0.245, k)),
        }
    : {
        fundo: cor(entre(0.935, 0.905, k)),
        superficieAfundada: cor(entre(0.955, 0.935, k)),
        superficie: cor(entre(0.99, 1, k)),
        superficie2: cor(entre(0.972, 0.962, k)),
        superficieElevada: '#ffffff',
        materialSolido: cor(0.985, 0.6),
        miniatura: cor(entre(0.962, 0.952, k)),
      };

  // Translúcidos: as linhas e a zebra puxam a cor do texto, e os materiais, a da superfície.
  const tinta = escuro ? cor(0.95, 3) : cor(0.25, 4);
  const linha = comAlfa(tinta, escuro ? entre(0.07, 0.12, k) : entre(0.08, 0.14, k));
  const linhaForte = comAlfa(tinta, escuro ? entre(0.13, 0.21, k) : entre(0.14, 0.24, k));
  const zebra = comAlfa(tinta, entre(0.018, 0.035, k));
  const opaco = !escuro && k >= 0.9;
  const barra = opaco
    ? superficies.superficie
    : comAlfa(escuro ? superficies.superficie : superficies.materialSolido, escuro ? 0.82 : 0.84);
  const material = opaco
    ? superficies.materialSolido
    : comAlfa(superficies.materialSolido, escuro ? 0.78 : 0.82);

  const fundosDeTexto = (texto: string) => {
    const { pressionado } = camadasDeEstado({ texto });
    return [
      superficies.fundo,
      superficies.superficie,
      superficies.superficie2,
      superficies.superficieAfundada,
      superficies.superficieElevada,
      superficies.materialSolido,
      compor(pressionado, superficies.superficie2),
      compor(pressionado, superficies.fundo),
      compor(material, superficies.fundo),
      compor(barra, superficies.fundo),
      compor(zebra, superficies.superficie),
    ];
  };
  const sentido = escuro ? 'clarear' : 'escurecer';
  const anel = OPACIDADE_DO_ANEL[entrada.tom];

  const texto = ajustarLuminosidade(
    neutro(escuro ? entre(0.92, 0.99, k) : entre(0.25, 0.1, k), 0.5),
    (hex) =>
      passaContra(fundosDeTexto(hex), TEXTO)(hex) &&
      contraste(hex, superficies.superficie2) >= TEXTO_PRINCIPAL &&
      [superficies.fundo, superficies.superficie, superficies.superficie2].every(
        (fundo) => contraste(compor(comAlfa(hex, anel), fundo), fundo) >= COMPONENTE,
      ),
    sentido,
  );
  const texto2 = ajustarLuminosidade(
    neutro(escuro ? entre(0.66, 0.8, k) : entre(0.52, 0.38, k), 0.8),
    (hex) =>
      passaContra(fundosDeTexto(texto), TEXTO)(hex) &&
      [superficies.superficie, superficies.superficie2].every(
        (base) => contraste(hex, compor(comAlfa(hex, 0.1), base)) >= TEXTO,
      ),
    sentido,
  );
  const bordaControle = ajustarLuminosidade(
    neutro(escuro ? entre(0.48, 0.6, k) : entre(0.66, 0.55, k), 0.8),
    passaContra([superficies.superficie, superficies.superficie2], COMPONENTE),
    sentido,
  );

  const sombra = escuro ? 'rgba(0, 0, 0, 0.5)' : comAlfa(cor(0.2, 3), 0.14);
  return {
    tom: entrada.tom,
    cores: {
      ...superficies,
      linha,
      linhaForte,
      texto,
      texto2,
      zebra,
      barra,
      material,
      materialLinha: escuro
        ? comAlfa(tinta, entre(0.1, 0.16, k))
        : opaco
          ? texto
          : comAlfa('#ffffff', 0.8),
      bordaControle,
      veu: escuro ? 'rgba(0, 0, 0, 0.55)' : `rgba(0, 0, 0, ${(0.25 + 0.3 * k * k).toFixed(2)})`,
    },
    sombraElevada: `0 1px 3px ${sombra}`,
    sombraSobreposta: escuro
      ? '0 14px 40px rgba(0, 0, 0, 0.5)'
      : `0 14px 40px ${comAlfa(cor(0.2, 3), 0.18)}`,
  };
}

export interface EntradaDoDestaque {
  matiz: number;
  /** De 0 a ~0,25. O croma 0 é o destaque monocromático. */
  croma: number;
}

export type DestaqueGerado = CoresDoDestaque & EstadosDoDestaque;

/** A parte do tema que o destaque precisa conhecer. */
type TemaDoDestaque = Pick<TemaGerado, 'tom'> & {
  cores: Pick<CoresGeradas, 'fundo' | 'superficie' | 'superficie2' | 'material' | 'texto'>;
};

/**
 * O destaque gerado para um tema (design da fundamentos-v3, decisão 5). No escuro, o preenchimento é
 * claro, com o texto escuro sobre ele; no claro, o preenchimento é escuro, com o texto branco. O
 * monocromático usa o próprio texto do tema como cor do destaque.
 */
export function gerarDestaque(tema: TemaDoDestaque, entrada: EntradaDoDestaque): DestaqueGerado {
  const { cores } = tema;
  const escuro = tema.tom === 'escuro';
  const croma = Math.max(0, entrada.croma);
  const superficies = [cores.fundo, cores.superficie, cores.superficie2];
  const monocromatico = croma === 0;
  const sobreDestaque = escuro
    ? monocromatico
      ? cores.fundo
      : oklchParaHex({ l: 0.17, c: Math.min(croma, 0.04) * 0.5, h: entrada.matiz })
    : '#ffffff';
  const passaPreenchimento = (hex: string) => {
    const estados = estadosDoDestaque({ destaque: hex, destaqueTexto: hex, sobreDestaque });
    return (
      [hex, estados.destaqueHover, estados.destaquePressionado].every(
        (fundo) => contraste(sobreDestaque, fundo) >= TEXTO,
      ) &&
      superficies.every((fundo) => contraste(hex, fundo) >= COMPONENTE) &&
      contraste(cores.texto, compor(comAlfa(hex, 0.13), cores.superficie)) >= TEXTO
    );
  };
  const destaque = ajustarLuminosidade(
    monocromatico
      ? paraOklch(cores.texto)
      : { l: escuro ? 0.74 : 0.52, c: croma, h: entrada.matiz },
    passaPreenchimento,
    escuro ? 'clarear' : 'escurecer',
  );
  const fundosDoTexto = [...superficies, compor(cores.material, cores.fundo)];
  const destaqueTexto = monocromatico
    ? cores.texto
    : ajustarLuminosidade(
        { l: escuro ? 0.78 : 0.5, c: croma, h: entrada.matiz },
        passaContra(fundosDoTexto, TEXTO),
        escuro ? 'clarear' : 'escurecer',
      );
  const cores2: CoresDoDestaque = { destaque, destaqueTexto, sobreDestaque };
  return { ...cores2, ...estadosDoDestaque(cores2) };
}

export type IdDaSituacao = 'ok' | 'atencao' | 'critico' | 'info';

export interface CoresDaSituacaoGerada {
  /** Texto e ícone, com 4,5:1 sobre as superfícies e sobre o próprio fundo. */
  cor: string;
  /** Fundo sutil do rótulo e das faixas. */
  fundo: string;
  /** Contorno do rótulo. */
  borda: string;
  /** Preenchimento forte, com o texto `sobre` a 4,5:1. */
  forte: string;
  sobre: string;
}

/** Matiz e croma de cada situação (design da fundamentos-v3, decisão 7). */
export const MATIZES_DAS_SITUACOES: Record<IdDaSituacao, { matiz: number; croma: number }> = {
  ok: { matiz: 150, croma: 0.14 },
  atencao: { matiz: 75, croma: 0.14 },
  critico: { matiz: 25, croma: 0.17 },
  info: { matiz: 245, croma: 0.12 },
};

const BORDA_DA_SITUACAO = 0.4;

export function gerarSituacoes(tema: TemaGerado): Record<IdDaSituacao, CoresDaSituacaoGerada> {
  const { cores } = tema;
  const escuro = tema.tom === 'escuro';
  const sentido = escuro ? 'clarear' : 'escurecer';
  const { pressionado } = camadasDeEstado(cores);
  const superficies = [cores.superficie, cores.superficie2];
  const fundosFixos = [
    ...superficies,
    cores.fundo,
    compor(cores.material, cores.fundo),
    compor(pressionado, cores.superficie2),
    compor(pressionado, cores.fundo),
  ];
  const gerar = ({ matiz, croma }: { matiz: number; croma: number }): CoresDaSituacaoGerada => {
    const cor = ajustarLuminosidade(
      { l: escuro ? 0.8 : 0.5, c: croma, h: matiz },
      (hex) =>
        passaContra(fundosFixos, TEXTO)(hex) &&
        superficies.every(
          (base) => contraste(hex, compor(comAlfa(hex, TINTA_DO_ROTULO.situacao), base)) >= TEXTO,
        ),
      sentido,
    );
    const sobre = escuro ? oklchParaHex({ l: 0.17, c: croma * 0.25, h: matiz }) : '#ffffff';
    const forte = ajustarLuminosidade(
      { l: escuro ? 0.72 : 0.52, c: croma, h: matiz },
      (hex) => contraste(sobre, hex) >= TEXTO && passaContra(superficies, COMPONENTE)(hex),
      sentido,
    );
    return {
      cor,
      fundo: comAlfa(cor, TINTA_DO_ROTULO.situacao),
      borda: comAlfa(cor, BORDA_DA_SITUACAO),
      forte,
      sobre,
    };
  };
  return {
    ok: gerar(MATIZES_DAS_SITUACOES.ok),
    atencao: gerar(MATIZES_DAS_SITUACOES.atencao),
    critico: gerar(MATIZES_DAS_SITUACOES.critico),
    info: gerar(MATIZES_DAS_SITUACOES.info),
  };
}

/** Matizes das séries, numa ordem que alterna o quente e o frio (decisão 8). */
export const MATIZES_DAS_SERIES = [258, 55, 175, 340, 125, 25, 210, 85] as const;

export type IdDaTinta = 'ciano' | 'magenta' | 'amarelo' | 'preto';

const TINTAS: Record<
  Exclude<IdDaTinta, 'preto'>,
  { matiz: number; croma: number; escuro: number; claro: number }
> = {
  ciano: { matiz: 220, croma: 0.13, escuro: 0.75, claro: 0.6 },
  magenta: { matiz: 350, croma: 0.2, escuro: 0.66, claro: 0.55 },
  amarelo: { matiz: 95, croma: 0.17, escuro: 0.86, claro: 0.7 },
};

export interface DadosGerados {
  series: string[];
  tintas: Record<IdDaTinta, string>;
}

export function gerarDados(tema: TemaGerado): DadosGerados {
  const { cores } = tema;
  const escuro = tema.tom === 'escuro';
  const sentido = escuro ? 'clarear' : 'escurecer';
  const series = MATIZES_DAS_SERIES.map((matiz) =>
    ajustarLuminosidade(
      { l: escuro ? 0.72 : 0.56, c: 0.13, h: matiz },
      passaContra([cores.superficie], COMPONENTE),
      sentido,
    ),
  );
  const fundosDaTinta = [cores.superficie, cores.superficie2, cores.superficieAfundada];
  const tinta = (cor: Oklch) =>
    ajustarLuminosidade(cor, passaContra(fundosDaTinta, COMPONENTE), sentido);
  return {
    series,
    tintas: {
      ciano: tinta({
        l: escuro ? TINTAS.ciano.escuro : TINTAS.ciano.claro,
        c: TINTAS.ciano.croma,
        h: TINTAS.ciano.matiz,
      }),
      magenta: tinta({
        l: escuro ? TINTAS.magenta.escuro : TINTAS.magenta.claro,
        c: TINTAS.magenta.croma,
        h: TINTAS.magenta.matiz,
      }),
      amarelo: tinta({
        l: escuro ? TINTAS.amarelo.escuro : TINTAS.amarelo.claro,
        c: TINTAS.amarelo.croma,
        h: TINTAS.amarelo.matiz,
      }),
      // O preto de verdade sumiria nos temas escuros: é um neutro com 3:1 contra as superfícies.
      preto: tinta({ l: escuro ? 0.62 : 0.25, c: 0, h: 0 }),
    },
  };
}

/** Nome de cada tinta como aparece para o usuário, ao lado do nível. */
export const NOMES_DAS_TINTAS: Record<IdDaTinta, string> = {
  ciano: 'Ciano',
  magenta: 'Magenta',
  amarelo: 'Amarelo',
  preto: 'Preto',
};
