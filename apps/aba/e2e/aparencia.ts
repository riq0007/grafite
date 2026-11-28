import type { Page } from '@playwright/test';
import { chamadasDe, simularOTauri } from './tauri.ts';

// A aparência e o estado da aba que o lado nativo dá, simulados para as pontas a ponta da tela.

export interface Aparencia {
  forma: 'pilula' | 'entalhe';
  tema: 'escuro' | 'claro' | 'alto-contraste';
  movimentoReduzido: boolean;
  tela: { largura: number; altura: number };
  contato: string | null;
  apresentacao: boolean;
}

export interface RespostaPorVer {
  quem: string;
  numero: number;
  titulo: string;
  momento: string;
}

export interface Estado {
  naoLidas: number | null;
  respostasNovas: number | null;
  porVer: { quantas: number; ultima: RespostaPorVer | null } | null;
  pessoa: { nome: string; pelaSenha: boolean } | null;
  atalhoOcupado: boolean;
  semConexao: { motivo: string } | null;
  formulario: {
    passo: 'senha' | 'codigo';
    erro: string | null;
    esperaAte: string | null;
  } | null;
}

export const aparencia = (mudanca: Partial<Aparencia> = {}): Aparencia => ({
  forma: 'pilula',
  tema: 'escuro',
  movimentoReduzido: false,
  tela: { largura: 1440, altura: 900 },
  contato: 'Ramal 2000, das 8h às 18h',
  apresentacao: false,
  ...mudanca,
});

export const estado = (mudanca: Partial<Estado> = {}): Estado => ({
  naoLidas: 0,
  respostasNovas: 0,
  porVer: { quantas: 0, ultima: null },
  pessoa: { nome: 'Fernanda Rocha', pelaSenha: false },
  atalhoOcupado: false,
  semConexao: null,
  formulario: null,
  ...mudanca,
});

export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
  raioDeCima: number;
  raioDeBaixo: number;
}

/** O último retângulo da forma que a tela informou ao lado nativo. */
export async function ultimaForma(page: Page): Promise<Retangulo | undefined> {
  const chamadas = (await chamadasDe(page, 'informar_forma')) as Array<{
    retangulos: Retangulo[];
  }>;
  return chamadas.at(-1)?.retangulos[0];
}

/** Espera o movimento da tela acabar: o abrir, a cascata, o fechar e o pulso do ponto. */
export async function esperarOMovimento(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animacao) => animacao.finished.catch(() => null))),
  );
}

/** Guarda as animações que a tela pede pelo `animate`, com os quadros, a duração e a curva. */
export async function gravarAsAnimacoes(page: Page) {
  await page.addInitScript(() => {
    const janela = window as unknown as { __animacoes: unknown[] };
    janela.__animacoes = [];
    const animar = Element.prototype.animate;
    Element.prototype.animate = function (quadros, opcoes) {
      const { duration, easing } = typeof opcoes === 'object' ? opcoes : { duration: opcoes };
      janela.__animacoes.push({
        quadros: JSON.parse(JSON.stringify(quadros)),
        duracao: duration,
        curva: easing,
      });
      return animar.call(this, quadros, opcoes);
    };
  });
}

export interface AnimacaoGravada {
  quadros: Record<string, string>[];
  duracao: number;
  curva: string;
}

export async function animacoes(page: Page): Promise<AnimacaoGravada[]> {
  return page.evaluate(() => (window as unknown as { __animacoes: AnimacaoGravada[] }).__animacoes);
}

/** A cor de um token na página, como o navegador a calcula, para comparar com a de um elemento. */
export async function corDoToken(page: Page, token: string): Promise<string> {
  return page.evaluate((nome) => {
    const amostra = document.createElement('div');
    amostra.style.backgroundColor = `var(${nome})`;
    document.body.append(amostra);
    const cor = getComputedStyle(amostra).backgroundColor;
    amostra.remove();
    return cor;
  }, token);
}

/** A janela da aba: do tamanho do painel maior, com a sombra. */
export const JANELA = { width: 440, height: 560 };

/** Abre a tela da aba com o lado nativo simulado e devolve a aba fechada. */
export async function abrirATela(
  page: Page,
  mudanca: { aparencia?: Partial<Aparencia>; estado?: Partial<Estado> } = {},
) {
  await simularOTauri(page, {
    aparencia: aparencia(mudanca.aparencia),
    estado: estado(mudanca.estado),
    informar_forma: null,
    abrir_tela_maior: null,
    devolver_o_foco: null,
    sair: null,
    tela_maior: null,
    entrar: null,
    enviar_o_codigo: null,
    recomecar_a_entrada: null,
  });
  await page.goto('/');
  const aba = page.getByRole('button', { name: 'Suporte da TI' });
  await aba.waitFor();
  // As medidas e as animações dos testes são com a fonte da interface, e não com a reserva, que no
  // Linux do CI é mais larga.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return aba;
}
