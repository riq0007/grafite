import { destaqueDoTema, temaPersonalizado } from '@grafite/ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AlvoDasPreferencias } from '../../../preferencias/alvo.tsx';
import { ProvedorDoAlvo } from '../../../preferencias/alvo.tsx';
import { PADRAO_DE_FABRICA } from '../../../preferencias/preferencias.ts';
import { ProvedorDePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { alvoSimulado } from '../../../teste/alvo.ts';
import { preferenciasDaCopia } from '../../../teste/preferencias.ts';
import { SecaoAparencia } from './Aparencia.tsx';

const raiz = () => document.documentElement;
const salvas = preferenciasDaCopia;

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const nome of [...raiz().getAttributeNames()]) raiz().removeAttribute(nome);
  raiz().removeAttribute('style');
});

function abrir(alvo?: AlvoDasPreferencias) {
  render(
    <ProvedorDePreferencias>
      <ProvedorDoAlvo alvo={alvo}>
        <SecaoAparencia />
      </ProvedorDoAlvo>
    </ProvedorDePreferencias>,
  );
}

const grupo = (nome: string) => screen.getByRole('radiogroup', { name: nome });
const nomes = (elementos: HTMLElement[]) =>
  elementos.map((elemento) => elemento.closest('label')?.textContent);

describe('seção Aparência', () => {
  it('mostra os temas escuros separados dos claros', () => {
    abrir();
    const escuros = within(grupo('Tema')).getByText('Escuros').parentElement as HTMLElement;
    const claros = within(grupo('Tema')).getByText('Claros').parentElement as HTMLElement;
    expect(nomes(within(escuros).getAllByRole('radio'))).toEqual(['Grafite', 'Meia-noite', 'OLED']);
    expect(nomes(within(claros).getAllByRole('radio'))).toEqual([
      'Névoa',
      'Papel',
      'Alto contraste',
    ]);
  });

  it('abre com os padrões de fábrica escolhidos', () => {
    abrir();
    expect(within(grupo('Tema')).getByRole('radio', { name: 'Grafite' })).toHaveProperty(
      'checked',
      true,
    );
    expect(within(grupo('Destaque')).getByRole('radio', { name: 'Grafite' })).toHaveProperty(
      'checked',
      true,
    );
    expect(within(grupo('Densidade')).getByRole('radio', { name: 'Normal' })).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.getByRole('slider', { name: 'Cantos' }).getAttribute('aria-valuetext')).toBe(
      '10 px',
    );
  });

  it('um tema escolhido vale na hora e fica gravado', () => {
    abrir();
    fireEvent.click(within(grupo('Tema')).getByRole('radio', { name: 'Papel' }));
    expect(raiz().getAttribute('data-theme')).toBe('papel');
    expect(salvas().aparencia.tema).toBe('papel');
  });

  it('o destaque verde vale na hora', () => {
    abrir();
    fireEvent.click(within(grupo('Destaque')).getByRole('radio', { name: 'Verde' }));
    expect(raiz().getAttribute('data-accent')).toBe('verde');
  });

  it('a densidade muda pelo controle segmentado', () => {
    abrir();
    fireEvent.click(within(grupo('Densidade')).getByRole('radio', { name: 'Confortável' }));
    expect(raiz().getAttribute('data-density')).toBe('confortavel');
  });

  // Spec ajustes-do-sistema, "Seção Aparência" (change barra-de-rolagem-propria, design, decisão 5).
  it('a barra de rolagem abre em "Ao rolar", com a explicação de cada opção', () => {
    abrir();
    const barra = grupo('Barra de rolagem');
    expect(within(barra).getByRole('radio', { name: 'Ao rolar' })).toHaveProperty('checked', true);
    // As duas frases ficam na descrição do grupo, que o leitor de tela lê com ele.
    const descricao = screen.getByText(/Ao rolar: aparece com o ponteiro sobre a área/);
    expect(descricao.textContent).toBe(
      'Ao rolar: aparece com o ponteiro sobre a área ou enquanto ela rola. Sempre visível: fica à vista em toda área que rola.',
    );
    expect(barra.getAttribute('aria-describedby')).toContain(descricao.id);
    expect(screen.queryByText('Neste aparelho vale a barra de rolagem do sistema.')).toBeNull();
  });

  it('Escolher Sempre visível: vale na hora, sem botão de salvar, e fica gravado', () => {
    abrir();
    fireEvent.click(
      within(grupo('Barra de rolagem')).getByRole('radio', { name: 'Sempre visível' }),
    );
    expect(raiz().getAttribute('data-rolagem')).toBe('sempre');
    expect(salvas().aparencia.barraDeRolagem).toBe('sempre');
  });

  it('Barra de rolagem no celular: a seção diz que vale a do sistema, e a escolha continua gravada', () => {
    raiz().setAttribute('data-barra-do-sistema', '');
    abrir();
    expect(screen.getByText('Neste aparelho vale a barra de rolagem do sistema.')).toBeTruthy();
    fireEvent.click(
      within(grupo('Barra de rolagem')).getByRole('radio', { name: 'Sempre visível' }),
    );
    expect(salvas().aparencia.barraDeRolagem).toBe('sempre');
  });

  it('Restaurar padrões volta a barra de rolagem a "Ao rolar"', () => {
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({ versao: 1, aparencia: { barraDeRolagem: 'sempre' } }),
    );
    abrir();
    const barra = () => grupo('Barra de rolagem');
    expect(within(barra()).getByRole('radio', { name: 'Sempre visível' })).toHaveProperty(
      'checked',
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(within(barra()).getByRole('radio', { name: 'Ao rolar' })).toHaveProperty(
      'checked',
      true,
    );
    expect(raiz().getAttribute('data-rolagem')).toBe('ao-rolar');
  });

  it('os cantos mudam o raio base, com o valor e a unidade à vista', () => {
    abrir();
    const cantos = screen.getByRole('slider', { name: 'Cantos' });
    fireEvent.keyDown(cantos, { key: 'ArrowRight' });
    expect(raiz().style.getPropertyValue('--raio-base')).toBe('11px');
    expect(screen.getByText('11 px')).toBeTruthy();
  });

  // Spec ajustes-do-sistema, "Seção Aparência" (change tema-personalizado, design, decisões 5 e 6).
  it('o construtor só aparece com o tema Personalizado', () => {
    abrir();
    expect(screen.queryByRole('slider', { name: 'Matiz' })).toBeNull();
    fireEvent.click(within(grupo('Tema')).getByRole('radio', { name: 'Personalizado' }));
    expect(screen.getByRole('slider', { name: 'Matiz' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Tingimento' })).toBeTruthy();
  });

  it('montar o próprio tema: claro, na matiz 80, com o texto a pelo menos 7:1', () => {
    abrir();
    fireEvent.click(within(grupo('Tema')).getByRole('radio', { name: 'Personalizado' }));
    fireEvent.click(within(grupo('Tom')).getByRole('radio', { name: 'Claro' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Matiz' }), { target: { value: '80' } });
    const entrada = { tom: 'claro', matiz: 80, tingimento: 10, contraste: 45 } as const;
    expect(raiz().getAttribute('data-theme')).toBe('nevoa');
    expect(raiz().style.getPropertyValue('--cor-fundo')).toBe(
      temaPersonalizado(entrada).cores.fundo,
    );
    expect(salvas().aparencia).toMatchObject({ tema: 'personalizado', personalizado: entrada });
    const leitura = screen.getByText(/^Texto \d/).textContent ?? '';
    const texto = Number(/Texto (\d+,\d):1/.exec(leitura)?.[1]?.replace(',', '.'));
    expect(texto).toBeGreaterThanOrEqual(7);
  });

  it('o lápis do contraste: "HB · 45" à vista e "HB, 45 de 100" no leitor', () => {
    abrir();
    fireEvent.click(within(grupo('Tema')).getByRole('radio', { name: 'Personalizado' }));
    const contraste = screen.getByRole('slider', { name: 'Contraste' });
    expect(contraste.getAttribute('aria-valuetext')).toBe('HB, 45 de 100');
    expect(screen.getByText('HB · 45')).toBeTruthy();
    fireEvent.keyDown(contraste, { key: 'End' });
    expect(screen.getByText('4B · 100')).toBeTruthy();
  });

  it('o destaque Personalizado com a intensidade 0 é o monocromático', () => {
    abrir();
    fireEvent.click(within(grupo('Destaque')).getByRole('radio', { name: 'Personalizado' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Intensidade' }), { key: 'Home' });
    expect(raiz().getAttribute('data-accent')).toBe('grafite');
    expect(raiz().style.getPropertyValue('--cor-destaque')).toBe(
      destaqueDoTema('grafite', 'grafite').destaque,
    );
  });

  it('a leitura do contraste mostra o texto, o secundário e o destaque sobre a superfície', () => {
    abrir();
    expect(
      screen.getByText(/^Texto \d+,\d:1 · Secundário \d+,\d:1 · Destaque \d+,\d:1$/),
    ).toBeTruthy();
  });

  it('Restaurar padrões volta a aparência à fábrica, sem mexer no dock', () => {
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({
        versao: 1,
        aparencia: { tema: 'papel', destaque: 'verde', densidade: 'normal', raio: 4 },
        dock: { posicao: 'esquerda' },
      }),
    );
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(salvas().aparencia).toEqual(PADRAO_DE_FABRICA.aparencia);
    expect(salvas().dock.posicao).toBe('esquerda');
    expect(raiz().getAttribute('data-theme')).toBe('grafite');
  });
});

describe('seção Aparência com outro alvo', () => {
  it('mostra e muda o alvo, e a casca de quem edita não muda', () => {
    const alvo = alvoSimulado({ aparencia: { tema: 'nevoa', destaque: 'laranja' } });
    abrir(alvo);
    expect(within(grupo('Tema')).getByRole('radio', { name: 'Névoa' })).toHaveProperty(
      'checked',
      true,
    );
    expect(within(grupo('Destaque')).getByRole('radio', { name: 'Laranja' })).toHaveProperty(
      'checked',
      true,
    );
    fireEvent.click(within(grupo('Tema')).getByRole('radio', { name: 'Papel' }));
    expect(alvo.mudar).toHaveBeenCalledWith('aparencia', { tema: 'papel' });
    expect(raiz().getAttribute('data-theme')).toBe('grafite');
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(alvo.restaurar).toHaveBeenCalledWith('aparencia');
  });
});
