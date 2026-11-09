import { afterEach, describe, expect, it } from 'vitest';
import { atualizarCarregamento, marcacaoDoCarregamento } from './carregamento.ts';

/** Põe a marcação na página, como o index.html compilado a traz. */
function montar(marcacao: string): HTMLElement {
  document.body.innerHTML = marcacao;
  return document.getElementById('chegada') as HTMLElement;
}

const barraDe = (camada: HTMLElement) =>
  camada.querySelector('[role="progressbar"]') as HTMLElement;
const etapaDe = (camada: HTMLElement) => camada.querySelector('[role="status"]') as HTMLElement;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('marcacaoDoCarregamento', () => {
  it('traz a marca, a barra e a etapa em andamento, fora de vista até alguém mostrar', () => {
    const camada = montar(
      marcacaoDoCarregamento({ etapa: 'Carregando o Grafite', progresso: 0, visivel: false }),
    );
    expect(camada.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe('Grafite');
    const barra = barraDe(camada);
    expect(barra.getAttribute('aria-label')).toBe('Carregamento do Grafite');
    expect([
      barra.getAttribute('aria-valuemin'),
      barra.getAttribute('aria-valuemax'),
      barra.getAttribute('aria-valuenow'),
    ]).toEqual(['0', '100', '0']);
    expect(etapaDe(camada).textContent).toBe('Carregando o Grafite');
    expect(camada.hasAttribute('data-visivel')).toBe(false);
  });

  it('desenha uma etapa do meio, à vista, para o catálogo', () => {
    const camada = montar(
      marcacaoDoCarregamento({
        etapa: 'Carregando suas preferências',
        progresso: 1 / 3,
        visivel: true,
      }),
    );
    expect(barraDe(camada).getAttribute('aria-valuenow')).toBe('33');
    expect(etapaDe(camada).textContent).toBe('Carregando suas preferências');
    expect(camada.hasAttribute('data-visivel')).toBe(true);
  });

  it('escapa o texto da etapa', () => {
    const camada = montar(
      marcacaoDoCarregamento({
        etapa: 'Conectando <alertas> & mais',
        progresso: 0,
        visivel: false,
      }),
    );
    expect(etapaDe(camada).textContent).toBe('Conectando <alertas> & mais');
    expect(etapaDe(camada).children).toHaveLength(0);
  });
});

describe('atualizarCarregamento', () => {
  it('troca a etapa, avança a barra e mostra a camada', () => {
    const camada = montar(
      marcacaoDoCarregamento({ etapa: 'Carregando o Grafite', progresso: 0, visivel: false }),
    );
    atualizarCarregamento(camada, {
      etapa: 'Carregando suas preferências',
      progresso: 2 / 3,
      visivel: true,
    });
    expect(etapaDe(camada).textContent).toBe('Carregando suas preferências');
    expect(barraDe(camada).getAttribute('aria-valuenow')).toBe('67');
    expect(barraDe(camada).style.getPropertyValue('--progresso-da-chegada')).toBe(String(2 / 3));
    expect(camada.hasAttribute('data-visivel')).toBe(true);
  });

  it('não reescreve a etapa que não mudou, para o leitor de tela não a anunciar de novo', () => {
    const camada = montar(
      marcacaoDoCarregamento({ etapa: 'Carregando o Grafite', progresso: 0, visivel: false }),
    );
    const texto = etapaDe(camada).firstChild;
    atualizarCarregamento(camada, { etapa: 'Carregando o Grafite', progresso: 0, visivel: true });
    expect(etapaDe(camada).firstChild).toBe(texto);
  });

  it('esconde a camada quando ela deixa de estar à vista', () => {
    const camada = montar(marcacaoDoCarregamento({ etapa: 'Pronto', progresso: 1, visivel: true }));
    atualizarCarregamento(camada, { etapa: 'Pronto', progresso: 1, visivel: false });
    expect(camada.hasAttribute('data-visivel')).toBe(false);
  });
});
