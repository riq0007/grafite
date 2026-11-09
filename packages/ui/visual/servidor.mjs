// Servidor estático mínimo do Storybook compilado, para as capturas. Roda dentro do contêiner
// do Playwright, sem dependências além do Node.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const raiz = normalize(process.env.PASTA_DO_STORYBOOK ?? 'storybook-static');
const porta = Number(process.env.PORTA ?? 6007);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

createServer((pedido, resposta) => {
  const caminho = decodeURIComponent(new URL(pedido.url ?? '/', 'http://local').pathname);
  let arquivo = normalize(join(raiz, caminho));
  if (!arquivo.startsWith(raiz)) {
    resposta.writeHead(403).end();
    return;
  }
  try {
    if (statSync(arquivo).isDirectory()) arquivo = join(arquivo, 'index.html');
    statSync(arquivo);
  } catch {
    resposta.writeHead(404).end();
    return;
  }
  resposta.writeHead(200, {
    'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream',
  });
  createReadStream(arquivo).pipe(resposta);
}).listen(porta, '127.0.0.1');
