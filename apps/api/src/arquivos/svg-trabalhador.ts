// A linha dos SVG: sanitiza cada SVG que a API manda, um por vez, longe do laço de eventos dela.
import { parentPort } from 'node:worker_threads';
import {
  type PedidoDeSanitizacao,
  type RespostaDaSanitizacao,
  sanitizarNoDom,
} from './svg-no-dom.ts';

if (!parentPort) throw new Error('A linha dos SVG só roda como linha de execução da API.');
const porta = parentPort;

porta.on('message', async ({ id, texto }: PedidoDeSanitizacao) => {
  let resposta: RespostaDaSanitizacao;
  try {
    resposta = { id, svg: await sanitizarNoDom(texto) };
  } catch (erro) {
    resposta = { id, erro: erro instanceof Error ? erro.message : String(erro) };
  }
  porta.postMessage(resposta);
});
