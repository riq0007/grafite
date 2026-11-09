// Ponte dos painéis HTTP (change corrigir-integracoes-da-rede, decisão 3).
// O documento recebe origem opaca pelo sandbox. Só o servidor conhece a sessão do Grafite.
import { JSDOM } from 'jsdom';

export const LIMITE_DO_PAINEL = 10 * 1024 * 1024;
const PRAZO = 10_000;

/** Nunca aceita que um recurso ou redirecionamento escolha outro servidor. */
export function destinoDoPainel(caminho: string, origem: string): URL {
  const url = new URL(caminho, origem);
  if (url.origin !== origem || url.username || url.password)
    throw new Error('O painel tentou acessar outro servidor.');
  return url;
}

function enderecoPelaPonte(valor: string, pagina: URL, prefixo: string): string {
  if (!valor || valor.startsWith('#') || valor.startsWith(`${prefixo}/`)) return valor;
  try {
    const url = new URL(valor, pagina);
    return url.origin === pagina.origin
      ? `${prefixo}${url.pathname}${url.search}${url.hash}`
      : valor;
  } catch {
    return valor;
  }
}

export function cssPelaPonte(css: string, pagina: URL, prefixo: string): string {
  return css
    .replace(
      /url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi,
      (_todo, _aspas, url: string) =>
        `url("${enderecoPelaPonte(url, pagina, prefixo).replaceAll('"', '%22')}")`,
    )
    .replace(
      /(@import\s+)(['"])([^'"]+)\2/gi,
      (_todo, inicio, aspas, url: string) =>
        `${inicio}${aspas}${enderecoPelaPonte(url, pagina, prefixo)}${aspas}`,
    );
}

// Executado apenas dentro do iframe opaco, antes dos scripts da página interna.
// Caminhos absolutos usados pelas páginas em fetch/XHR continuam no servidor do painel.
const ROTEIRO = `(function(pagina, prefixo) {
  const original = new URL(pagina);
  const ponte = new URL(prefixo, location.href);
  function url(valor) {
    const texto = String(valor);
    const u = new URL(texto, original);
    if (u.origin === ponte.origin && u.pathname.startsWith(ponte.pathname + '/')) return u.href;
    return u.origin === original.origin ? ponte.origin + ponte.pathname + u.pathname + u.search + u.hash : texto;
  }
  const buscar = window.fetch.bind(window);
  window.fetch = (pedido, opcoes) => {
    if (pedido instanceof Request) return buscar(new Request(url(pedido.url), pedido), {...opcoes, credentials:'omit'});
    return buscar(url(pedido), {...opcoes, credentials:'omit'});
  };
  const abrir = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(metodo, endereco, ...resto) {
    return abrir.call(this, metodo, url(endereco), ...resto);
  };
  const atributo = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(nome, valor) {
    return atributo.call(this, nome, ['src','href','action','poster'].includes(nome.toLowerCase()) ? url(valor) : valor);
  };
  for (const [tipo, nome] of [[HTMLImageElement,'src'],[HTMLScriptElement,'src'],[HTMLLinkElement,'href'],[HTMLAnchorElement,'href']]) {
    const descritor = Object.getOwnPropertyDescriptor(tipo.prototype, nome);
    if (descritor && descritor.set) Object.defineProperty(tipo.prototype, nome, {...descritor, set(valor) { descritor.set.call(this, url(valor)); }});
  }
})`;

export function htmlPelaPonte(html: string, pagina: URL, prefixo: string): string {
  const dom = new JSDOM(html);
  try {
    const doc = dom.window.document;
    const baseInformada = doc.querySelector('base[href]')?.getAttribute('href');
    const base = baseInformada
      ? destinoDoPainel(new URL(baseInformada, pagina).href, pagina.origin)
      : pagina;
    for (const elemento of doc.querySelectorAll('base, meta[http-equiv]')) {
      const tipo = elemento.getAttribute('http-equiv')?.toLowerCase();
      if (elemento.tagName === 'BASE' || tipo === 'content-security-policy') elemento.remove();
      if (tipo === 'refresh') {
        const valor = elemento.getAttribute('content') ?? '';
        elemento.setAttribute(
          'content',
          valor.replace(
            /(url\s*=\s*)(.*)$/i,
            (_t, inicio, url: string) =>
              `${inicio}${enderecoPelaPonte(url.replace(/^['"]|['"]$/g, ''), base, prefixo)}`,
          ),
        );
      }
    }
    for (const elemento of doc.querySelectorAll('*')) {
      for (const nome of ['src', 'href', 'action', 'poster']) {
        const valor = elemento.getAttribute(nome);
        if (valor !== null) elemento.setAttribute(nome, enderecoPelaPonte(valor, base, prefixo));
      }
      const srcset = elemento.getAttribute('srcset');
      if (srcset && !srcset.includes('data:'))
        elemento.setAttribute(
          'srcset',
          srcset
            .split(',')
            .map((item) =>
              item.trim().replace(/^\S+/, (url) => enderecoPelaPonte(url, base, prefixo)),
            )
            .join(', '),
        );
      const estilo = elemento.getAttribute('style');
      if (estilo) elemento.setAttribute('style', cssPelaPonte(estilo, base, prefixo));
      if (elemento.tagName === 'STYLE')
        elemento.textContent = cssPelaPonte(elemento.textContent ?? '', base, prefixo);
    }
    const script = doc.createElement('script');
    script.textContent = `${ROTEIRO}(${JSON.stringify(base.href).replaceAll('<', '\\u003c')},${JSON.stringify(prefixo)});`;
    doc.head.prepend(script);
    return dom.serialize();
  } finally {
    dom.window.close();
  }
}

/** Busca limitada à origem cadastrada, sem credenciais do navegador e sem cache compartilhado. */
export async function lerConteudoDoPainel(url: URL) {
  const origem = url.origin;
  const signal = AbortSignal.timeout(PRAZO);
  let atual = url;
  for (let saltos = 0; saltos <= 3; saltos++) {
    const resposta = await fetch(atual, { redirect: 'manual', signal, headers: { accept: '*/*' } });
    if ([301, 302, 303, 307, 308].includes(resposta.status)) {
      await resposta.body?.cancel();
      const local = resposta.headers.get('location');
      if (!local || saltos === 3)
        throw new Error('O painel excedeu o limite de redirecionamentos.');
      atual = destinoDoPainel(new URL(local, atual).href, origem);
      continue;
    }
    if (Number(resposta.headers.get('content-length')) > LIMITE_DO_PAINEL) {
      await resposta.body?.cancel();
      throw new Error('O conteúdo do painel excede 10 MB.');
    }
    const partes: Uint8Array[] = [];
    const leitor = resposta.body?.getReader();
    let tamanho = 0;
    if (leitor) {
      try {
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          tamanho += value.length;
          if (tamanho > LIMITE_DO_PAINEL) throw new Error('O conteúdo do painel excede 10 MB.');
          partes.push(value);
        }
      } finally {
        await leitor.cancel();
      }
    }
    return {
      url: atual,
      status: resposta.status,
      tipo: resposta.headers.get('content-type') ?? 'application/octet-stream',
      corpo: Buffer.concat(partes),
    };
  }
  throw new Error('Não foi possível abrir o painel.');
}
