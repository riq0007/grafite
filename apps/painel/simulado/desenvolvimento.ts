// O painel no desenvolvimento (change painel-da-operacao, design, decisão 10): o servidor simulado,
// só com a API, e o servidor da página do Vite, que repassa o /api a ele. A página abre em localhost,
// com o estado de mentira, pelo endereço com o código que este roteiro escreve.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { abrirServidorSimulado } from './servidor.ts';

const PORTA_DA_API = 4310;
const PORTA_DA_PAGINA = 5174;
const CODIGO = 'painel-simulado-do-desenvolvimento';

const api = await abrirServidorSimulado({
  porta: PORTA_DA_API,
  codigo: CODIGO,
  origemDoDesenvolvimento: `http://localhost:${PORTA_DA_PAGINA}`,
  cenario: { esperaMs: 700 },
});
const pagina = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: {
    port: PORTA_DA_PAGINA,
    strictPort: true,
    proxy: { '/api': { target: api.endereco, changeOrigin: true } },
  },
});
await pagina.listen();
console.log(`Painel simulado: http://localhost:${PORTA_DA_PAGINA}/#${CODIGO}`);
