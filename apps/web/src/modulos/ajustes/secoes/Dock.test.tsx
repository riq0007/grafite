import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Box } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextoDosModulosDaConta, type ModuloDaConta } from '../../../casca/modulosDaConta.tsx';
import type { AlvoDasPreferencias } from '../../../preferencias/alvo.tsx';
import { ProvedorDoAlvo } from '../../../preferencias/alvo.tsx';
import { ProvedorDePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { alvoSimulado } from '../../../teste/alvo.ts';
import { preferenciasDaCopia } from '../../../teste/preferencias.ts';
import { SecaoDock } from './Dock.tsx';

const raiz = () => document.documentElement;
const salvas = preferenciasDaCopia;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  for (const nome of [...raiz().getAttributeNames()]) raiz().removeAttribute(nome);
  raiz().removeAttribute('style');
});

/** Ponteiro primário fino (computador) ou de toque (tablet), na janela de teste de 1024 px. */
function comPonteiro(fino: boolean) {
  const original = window.matchMedia.bind(window);
  vi.stubGlobal('matchMedia', (consulta: string) => {
    const lista = original(consulta);
    if (consulta === '(pointer: fine)') Object.defineProperty(lista, 'matches', { value: fino });
    return lista;
  });
}
const noComputador = () => comPonteiro(true);
const noTablet = () => comPonteiro(false);

/** A seção, com o alvo dado e os módulos que a casca do app daria à conta. */
function abrir(alvo?: AlvoDasPreferencias, modulos: readonly ModuloDaConta[] = []) {
  render(
    <ProvedorDePreferencias>
      <ContextoDosModulosDaConta.Provider value={modulos}>
        <ProvedorDoAlvo alvo={alvo}>
          <SecaoDock />
        </ProvedorDoAlvo>
      </ContextoDosModulosDaConta.Provider>
    </ProvedorDePreferencias>,
  );
}

const posicao = (nome: string) =>
  within(screen.getByRole('radiogroup', { name: 'Posição' })).getByRole('radio', {
    name: nome,
  }) as HTMLInputElement;
const interruptor = (nome: string) =>
  screen.getByRole('switch', { name: nome }) as HTMLInputElement;
const tamanho = () => screen.getByRole('slider', { name: 'Tamanho' });

describe('seção Dock', () => {
  it('abre com os padrões de fábrica', () => {
    noComputador();
    abrir();
    expect(posicao('Embaixo').checked).toBe(true);
    expect(tamanho().getAttribute('aria-valuetext')).toBe('48 px');
    expect(interruptor('Ampliar ao passar o mouse').checked).toBe(true);
    expect(interruptor('Ocultar automaticamente').checked).toBe(false);
  });

  it('a posição escolhida vale na hora e fica gravada', () => {
    noComputador();
    abrir();
    fireEvent.click(posicao('À direita'));
    expect(raiz().getAttribute('data-dock')).toBe('direita');
    expect(salvas().dock.posicao).toBe('direita');
  });

  it('o tamanho vai de 28 a 64 px, com o valor à vista', () => {
    noComputador();
    abrir();
    fireEvent.keyDown(tamanho(), { key: 'Home' });
    expect(tamanho().getAttribute('aria-valuetext')).toBe('28 px');
    for (let passo = 0; passo < 8; passo++) fireEvent.keyDown(tamanho(), { key: 'ArrowRight' });
    expect(screen.getByText('36 px')).toBeTruthy();
    expect(raiz().style.getPropertyValue('--tamanho-item-dock')).toBe('36px');
    fireEvent.keyDown(tamanho(), { key: 'End' });
    expect(tamanho().getAttribute('aria-valuetext')).toBe('64 px');
  });

  it('a ampliação e o ocultar automático ligam e desligam na hora', () => {
    noComputador();
    abrir();
    fireEvent.click(interruptor('Ampliar ao passar o mouse'));
    fireEvent.click(interruptor('Ocultar automaticamente'));
    expect(salvas().dock).toMatchObject({ ampliar: false, ocultar: true });
    expect(raiz().hasAttribute('data-dock-ocultar')).toBe(true);
  });

  it('no computador, não fala da postura tablet', () => {
    noComputador();
    abrir();
    expect(screen.queryByText(/Neste aparelho/)).toBeNull();
  });

  it('no tablet, avisa que o dock fica embaixo e que a posição vale no computador', () => {
    noTablet();
    abrir();
    const grupo = screen.getByRole('radiogroup', { name: 'Posição' });
    const aviso = screen.getByText(
      'Neste aparelho, o dock fica embaixo. A posição escolhida vale no computador.',
    );
    expect(grupo.getAttribute('aria-describedby')?.split(' ')).toContain(aviso.id);
  });

  it('Restaurar padrões volta o dock à fábrica, sem mexer no tema', () => {
    noComputador();
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({
        versao: 1,
        aparencia: { tema: 'papel' },
        dock: { posicao: 'esquerda', tamanho: 36, ampliar: false, ocultar: true },
      }),
    );
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(salvas().dock).toEqual({
      posicao: 'embaixo',
      tamanho: 48,
      ampliar: true,
      ocultar: false,
      modulos: [],
    });
    expect(salvas().aparencia.tema).toBe('papel');
    expect(posicao('Embaixo').checked).toBe(true);
  });
});

describe('seção Dock com outro alvo', () => {
  it('mostra e muda o alvo, e a casca de quem edita não muda', () => {
    noComputador();
    const alvo = alvoSimulado({ dock: { posicao: 'esquerda', tamanho: 36 } });
    abrir(alvo);
    expect(posicao('À esquerda').checked).toBe(true);
    expect(tamanho().getAttribute('aria-valuetext')).toBe('36 px');
    fireEvent.click(posicao('À direita'));
    expect(alvo.mudar).toHaveBeenCalledWith('dock', { posicao: 'direita' });
    expect(raiz().getAttribute('data-dock')).toBe('embaixo');
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(alvo.restaurar).toHaveBeenCalledWith('dock');
  });
});

// Os módulos do dock (spec ajustes-do-sistema, "Seção Dock"; change dock-personalizavel, design,
// decisão 4).
describe('seção Dock: os módulos do dock', () => {
  const modulo = (id: string, nome: string): ModuloDaConta => ({ id, nome, icone: Box });
  const DA_CONTA = [
    modulo('inicio', 'Início'),
    modulo('ativos', 'Ativos'),
    modulo('operacao', 'Operação'),
    modulo('salas', 'Salas'),
    modulo('ajustes', 'Ajustes'),
  ];
  const noDock = (id: string) => ({ id, visivel: true });
  const tirado = (id: string) => ({ id, visivel: false });

  const guardar = (modulos: Array<{ id: string; visivel: boolean }>) =>
    localStorage.setItem('grafite.preferencias', JSON.stringify({ versao: 1, dock: { modulos } }));
  const botao = (nome: string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement;
  const idsDa = (lista: string) =>
    within(screen.getByRole('list', { name: lista }))
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('data-modulo'));

  it('lista os módulos da conta na ordem que vale, sem Ajustes, e diz onde Ajustes fica', () => {
    noComputador();
    abrir(undefined, DA_CONTA);
    expect(idsDa('No dock')).toEqual(['inicio', 'ativos', 'operacao', 'salas']);
    expect(screen.getByText('Nenhum módulo fora do dock.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'No Mais' })).toBeNull();
    expect(screen.getByText('Ajustes fica sempre no fim do dock.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Subir Ajustes' })).toBeNull();
    expect(botao('Subir Início').disabled).toBe(true);
    expect(botao('Descer Início').disabled).toBe(false);
    expect(botao('Descer Salas').disabled).toBe(true);
    expect(botao('Tirar Salas do dock').textContent).toBe('Tirar do dock');
  });

  it('Subir um módulo: passa para antes do vizinho, vale na hora, e o foco continua no botão', () => {
    noComputador();
    abrir(undefined, DA_CONTA);
    fireEvent.click(botao('Subir Operação'));
    expect(idsDa('No dock')).toEqual(['inicio', 'operacao', 'ativos', 'salas']);
    expect(salvas().dock.modulos).toEqual([
      noDock('inicio'),
      noDock('operacao'),
      noDock('ativos'),
      noDock('salas'),
    ]);
    expect(document.activeElement).toBe(botao('Subir Operação'));
    fireEvent.click(botao('Descer Início'));
    expect(idsDa('No dock')).toEqual(['operacao', 'inicio', 'ativos', 'salas']);
    expect(document.activeElement).toBe(botao('Descer Início'));
  });

  it('Primeiro da lista: o Subir fica desabilitado, e o foco vai ao Descer do módulo', () => {
    noComputador();
    abrir(undefined, DA_CONTA);
    fireEvent.click(botao('Subir Ativos'));
    expect(idsDa('No dock')).toEqual(['ativos', 'inicio', 'operacao', 'salas']);
    expect(botao('Subir Ativos').disabled).toBe(true);
    expect(document.activeElement).toBe(botao('Descer Ativos'));
    // E o último: o Descer fica desabilitado, e o foco vai ao Subir.
    fireEvent.click(botao('Descer Operação'));
    expect(idsDa('No dock')).toEqual(['ativos', 'inicio', 'salas', 'operacao']);
    expect(botao('Descer Operação').disabled).toBe(true);
    expect(document.activeElement).toBe(botao('Subir Operação'));
  });

  it('Tirar do dock: o módulo passa à lista "No Mais", e o foco vai ao "Pôr no dock" dele', () => {
    noComputador();
    abrir(undefined, DA_CONTA);
    fireEvent.click(botao('Tirar Salas do dock'));
    expect(idsDa('No dock')).toEqual(['inicio', 'ativos', 'operacao']);
    expect(idsDa('No Mais')).toEqual(['salas']);
    expect(screen.queryByText('Nenhum módulo fora do dock.')).toBeNull();
    expect(salvas().dock.modulos).toEqual([
      noDock('inicio'),
      noDock('ativos'),
      noDock('operacao'),
      tirado('salas'),
    ]);
    expect(botao('Pôr Salas no dock').textContent).toBe('Pôr no dock');
    expect(document.activeElement).toBe(botao('Pôr Salas no dock'));
    // O último da lista agora é a Operação.
    expect(botao('Descer Operação').disabled).toBe(true);
  });

  it('Pôr de volta no dock: o módulo volta ao fim da lista "No dock", e o foco vai ao "Tirar do dock" dele', () => {
    noComputador();
    guardar([noDock('inicio'), tirado('ativos'), noDock('operacao'), noDock('salas')]);
    abrir(undefined, DA_CONTA);
    expect(idsDa('No dock')).toEqual(['inicio', 'operacao', 'salas']);
    fireEvent.click(botao('Pôr Ativos no dock'));
    expect(idsDa('No dock')).toEqual(['inicio', 'operacao', 'salas', 'ativos']);
    expect(screen.getByText('Nenhum módulo fora do dock.')).toBeTruthy();
    expect(document.activeElement).toBe(botao('Tirar Ativos do dock'));
  });

  it('Restaurar a ordem: o dock volta à ordem de fábrica, com todos nele', () => {
    noComputador();
    guardar([noDock('operacao'), noDock('inicio'), noDock('ativos'), tirado('salas')]);
    abrir(undefined, DA_CONTA);
    expect(idsDa('No dock')).toEqual(['operacao', 'inicio', 'ativos']);
    expect(idsDa('No Mais')).toEqual(['salas']);
    fireEvent.click(botao('Restaurar padrões'));
    expect(idsDa('No dock')).toEqual(['inicio', 'ativos', 'operacao', 'salas']);
    expect(salvas().dock.modulos).toEqual([]);
  });

  it('Módulo que quem ajusta não vê: continua no lugar dele na lista guardada', () => {
    noComputador();
    guardar([
      noDock('inicio'),
      noDock('cofre'),
      noDock('operacao'),
      noDock('ativos'),
      noDock('salas'),
    ]);
    abrir(undefined, DA_CONTA);
    expect(idsDa('No dock')).toEqual(['inicio', 'operacao', 'ativos', 'salas']);
    fireEvent.click(botao('Subir Operação'));
    expect(idsDa('No dock')).toEqual(['operacao', 'inicio', 'ativos', 'salas']);
    expect(salvas().dock.modulos.map(({ id }) => id)).toEqual([
      'operacao',
      'inicio',
      'cofre',
      'ativos',
      'salas',
    ]);
  });

  it('sem os módulos da conta, as duas listas ficam vazias, sem quebrar a seção', () => {
    noComputador();
    abrir();
    expect(screen.getByText('Nenhum módulo no dock.')).toBeTruthy();
    expect(screen.getByText('Nenhum módulo fora do dock.')).toBeTruthy();
  });
});
