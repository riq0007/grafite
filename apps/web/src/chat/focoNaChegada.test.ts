// O foco na chegada à janela do Chat, vindo de outro módulo (change chat-com-chamados, design,
// decisão 15): o título do item que aparece depois de carregar recebe o foco, se a conta não o
// levou a outro lugar da janela nem a um diálogo aberto depois da chegada.
import { afterEach, describe, expect, it } from 'vitest';
import { esquecerAChegada, focarAoChegar, focarNaChegada } from './focoNaChegada.ts';

afterEach(() => {
  esquecerAChegada();
  document.body.replaceChildren();
});

/**
 * A casca com o sino fora da janela do Chat, a lista dentro dela e um diálogo, como a busca; o
 * título do item ainda não está na página, como o da conversa que carrega.
 */
function montar() {
  document.body.innerHTML = `
    <header><button id="sino" type="button">Notificações</button></header>
    <div data-na-casca>
      <h1 tabindex="-1" data-titulo-de-chegada="lista">Chat</h1>
      <a id="linha" href="#paulo">Paulo Nunes</a>
    </div>
    <div role="dialog"><input id="busca" /></div>`;
  const titulo = document.createElement('h2');
  titulo.tabIndex = -1;
  titulo.dataset.tituloDeChegada = 'item';
  titulo.textContent = 'Paulo Nunes';
  return {
    titulo,
    /** O título aparece na janela, com o `ref` que o React chama. */
    aparecer: () => {
      document.querySelector('[data-na-casca]')?.append(titulo);
      focarAoChegar(titulo);
    },
    elemento: (id: string) => document.getElementById(id) as HTMLElement,
  };
}

describe('o foco na chegada à janela do Chat', () => {
  it('o título do item que aparece depois recebe o foco que ficou no título da lista', () => {
    const { titulo, aparecer } = montar();
    focarNaChegada();
    expect(document.activeElement?.textContent).toBe('Chat');
    aparecer();
    expect(document.activeElement).toBe(titulo);
  });

  it('recebe também o foco que voltou a um botão fora da janela, como o sino quando a central sai', () => {
    const { titulo, aparecer, elemento } = montar();
    focarNaChegada();
    elemento('sino').focus();
    aparecer();
    expect(document.activeElement).toBe(titulo);
  });

  it('não tira o foco de outro lugar da janela, aonde a conta o levou', () => {
    const { aparecer, elemento } = montar();
    focarNaChegada();
    elemento('linha').focus();
    aparecer();
    expect(document.activeElement).toBe(elemento('linha'));
  });

  it('não tira o foco de um diálogo aberto depois da chegada, como a busca', () => {
    const { aparecer, elemento } = montar();
    focarNaChegada();
    elemento('busca').focus();
    aparecer();
    expect(document.activeElement).toBe(elemento('busca'));
  });

  it('depois da navegação seguinte, que esquece a chegada, o título não pede o foco', () => {
    const { aparecer, elemento } = montar();
    focarNaChegada();
    esquecerAChegada();
    elemento('sino').focus();
    aparecer();
    expect(document.activeElement).toBe(elemento('sino'));
  });
});
