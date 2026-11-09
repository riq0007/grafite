// O SVG enviado (spec arquivos-e-imagens; design do F2c, decisão 7): reconhecido pelo texto e
// sanitizado antes de ser gravado. A sanitização roda numa linha de execução própria, a linha dos
// SVG (change ci-no-executor-proprio, design, decisão 6): o jsdom leva segundos para carregar, e um
// SVG grande, para ler, e a API continua respondendo enquanto isso. A linha nasce com o primeiro
// SVG, fica para os seguintes e não segura o processo quando não há SVG esperando.
import { Worker } from 'node:worker_threads';
import type { PedidoDeSanitizacao, RespostaDaSanitizacao } from './svg-no-dom.ts';

/** Se o conteúdo é um SVG: a raiz `<svg`, depois do BOM, da declaração XML e dos comentários. */
export function pareceSvg(conteudo: Buffer): boolean {
  let resto = conteudo
    .subarray(0, 64 * 1024)
    .toString('utf8')
    .replace(/^﻿/, '');
  for (let antes = ''; antes !== resto; ) {
    antes = resto;
    resto = resto
      .replace(/^\s+/, '')
      .replace(/^<\?xml\b[\s\S]*?\?>/, '')
      .replace(/^<!--[\s\S]*?-->/, '');
  }
  return /^<svg[\s/>]/.test(resto);
}

interface Esperando {
  resolver: (svg: string | null) => void;
  rejeitar: (erro: Error) => void;
}

/** A linha dos SVG; quando ela para, os pedidos dela falham, e o SVG seguinte começa outra. */
function criarLinha(aoParar: () => void) {
  const linha = new Worker(new URL('./svg-trabalhador.ts', import.meta.url));
  linha.unref();
  const esperando = new Map<number, Esperando>();
  let proximo = 0;
  let parada = false;

  const parar = (erro: Error) => {
    if (parada) return;
    parada = true;
    aoParar();
    for (const { rejeitar } of esperando.values()) rejeitar(erro);
    esperando.clear();
  };
  linha.on('message', (resposta: RespostaDaSanitizacao) => {
    const pedido = esperando.get(resposta.id);
    if (!pedido) return;
    esperando.delete(resposta.id);
    if (esperando.size === 0) linha.unref();
    if ('erro' in resposta) pedido.rejeitar(new Error(resposta.erro));
    else pedido.resolver(resposta.svg);
  });
  linha.on('error', parar);
  linha.on('exit', (codigo) => parar(new Error(`A linha dos SVG parou com o código ${codigo}.`)));

  return (texto: string) =>
    new Promise<string | null>((resolver, rejeitar) => {
      if (parada) {
        rejeitar(new Error('A linha dos SVG parou.'));
        return;
      }
      const id = proximo++;
      esperando.set(id, { resolver, rejeitar });
      // Com um SVG esperando, a linha segura o processo até responder.
      if (esperando.size === 1) linha.ref();
      const pedido: PedidoDeSanitizacao = { id, texto };
      linha.postMessage(pedido);
    });
}

let sanitizarNaLinha: ((texto: string) => Promise<string | null>) | undefined;

/**
 * O SVG sanitizado, como texto, ou `null` se ele não se lê como SVG ou fica sem desenho. As
 * referências internas, como as de um gradiente, de um recorte ou de um `use`, continuam.
 */
export function sanitizarSvg(texto: string): Promise<string | null> {
  sanitizarNaLinha ??= criarLinha(() => {
    sanitizarNaLinha = undefined;
  });
  return sanitizarNaLinha(texto);
}
