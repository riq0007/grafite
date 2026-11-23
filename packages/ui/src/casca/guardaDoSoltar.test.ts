// A guarda do arquivo solto fora de um lugar de soltar (spec estrutura-da-casca, "Arquivo solto fora
// de um lugar de soltar"; change chat-com-chamados, tarefa 4.19): ela segura o arquivo que ninguém
// tratou, com o cursor de que não se solta, e deixa o texto arrastado e os lugares de soltar.
import { afterEach, describe, expect, it } from 'vitest';
import { ligarGuardaDoSoltar } from './guardaDoSoltar.ts';

let desligar: (() => void) | null = null;

afterEach(() => {
  desligar?.();
  desligar = null;
  document.body.replaceChildren();
});

/** O arrasto que chega ao elemento, com os tipos dele e o efeito que o navegador mostra. */
function arrastar(alvo: EventTarget, tipo: 'dragover' | 'drop', tipos: string[]) {
  const evento = new Event(tipo, { bubbles: true, cancelable: true });
  const dados = { types: tipos, dropEffect: 'copy' };
  Object.defineProperty(evento, 'dataTransfer', { value: dados });
  alvo.dispatchEvent(evento);
  return { cancelado: evento.defaultPrevented, efeito: dados.dropEffect };
}

/** Um elemento no `body`, como o dock, ou o diálogo que o React põe no `body`. */
function noBody() {
  const elemento = document.createElement('div');
  document.body.append(elemento);
  return elemento;
}

describe('a guarda do soltar', () => {
  it('segura o arquivo solto fora de um lugar de soltar, com o cursor de que não se solta', () => {
    desligar = ligarGuardaDoSoltar(window);
    const dock = noBody();
    expect(arrastar(dock, 'dragover', ['Files'])).toEqual({ cancelado: true, efeito: 'none' });
    expect(arrastar(dock, 'drop', ['Files']).cancelado).toBe(true);
  });

  it('deixa o texto arrastado seguir para os campos', () => {
    desligar = ligarGuardaDoSoltar(window);
    const campo = noBody();
    expect(arrastar(campo, 'dragover', ['text/plain', 'text/html'])).toEqual({
      cancelado: false,
      efeito: 'copy',
    });
    expect(arrastar(campo, 'drop', ['text/plain']).cancelado).toBe(false);
  });

  it('deixa o lugar de soltar, que tratou o arquivo antes dela, com a regra dele', () => {
    desligar = ligarGuardaDoSoltar(window);
    const lugar = noBody();
    // O lugar de soltar trata o evento na fase de bolha, como o `useDrop` do React Aria.
    lugar.addEventListener('dragover', (evento) => evento.preventDefault());
    lugar.addEventListener('drop', (evento) => evento.preventDefault());
    expect(arrastar(lugar, 'dragover', ['Files'])).toEqual({ cancelado: true, efeito: 'copy' });
  });

  it('desligada, não segura nada', () => {
    desligar = ligarGuardaDoSoltar(window);
    desligar();
    desligar = null;
    expect(arrastar(noBody(), 'dragover', ['Files'])).toEqual({ cancelado: false, efeito: 'copy' });
  });
});
