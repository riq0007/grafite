import { criarDataHora, descreverFuso, fusoDoSistema, listaDeFusos } from '@grafite/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AlvoDasPreferencias } from '../../../preferencias/alvo.tsx';
import { ProvedorDoAlvo } from '../../../preferencias/alvo.tsx';
import { ProvedorDePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { alvoSimulado } from '../../../teste/alvo.ts';
import { nomesDasOpcoes } from '../../../teste/escolhas.ts';
import { preferenciasDaCopia } from '../../../teste/preferencias.ts';
import { ajustes } from '../modulo.ts';
import { SecaoIdiomaERegiao } from './IdiomaERegiao.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function abrir(alvo?: AlvoDasPreferencias) {
  render(
    <ProvedorDePreferencias>
      <ProvedorDoAlvo alvo={alvo}>
        <SecaoIdiomaERegiao />
      </ProvedorDoAlvo>
    </ProvedorDePreferencias>,
  );
}

const fuso = () => screen.getByRole('combobox', { name: 'Fuso horário' }) as HTMLInputElement;
const salvas = preferenciasDaCopia;
const seguirOSistema = () =>
  `Seguir o sistema (${descreverFuso(fusoDoSistema(), new Date()).nome})`;

/** Digita na busca de fusos, com o foco nela, como o usuário. */
function buscar(texto: string) {
  fuso().focus();
  fireEvent.change(fuso(), { target: { value: texto } });
}

async function escolher(texto: string, opcao: RegExp) {
  buscar(texto);
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

describe('seção Idioma e região', () => {
  it('mostra o idioma da interface como informação, sem controle', () => {
    abrir();
    expect(screen.getByText('Idioma')).toBeTruthy();
    expect(screen.getByText('Português (Brasil)')).toBeTruthy();
    expect(screen.getAllByRole('combobox')).toEqual([fuso()]);
  });

  it('de fábrica, segue o sistema e diz qual é o fuso dele', () => {
    abrir();
    expect(fuso().value).toBe(seguirOSistema());
  });

  it('a busca de fusos acha o de Manaus por "manaus"', async () => {
    abrir();
    buscar('manaus');
    const opcoes = await screen.findAllByRole('option');
    expect(nomesDasOpcoes(opcoes)).toEqual(['Horário do Amazonas · Manaus (UTC−4)']);
  });

  it('o clique no campo abre a lista: o sistema e os fusos do Brasil sugeridos, e os outros depois', async () => {
    abrir();
    fireEvent.click(fuso());
    const opcoes = await screen.findAllByRole('option');
    expect(screen.getByText('Sugeridos')).toBeTruthy();
    const doBrasil = listaDeFusos(new Date())
      .filter((item) => item.doBrasil)
      .map((item) => item.rotulo);
    const sugeridas = opcoes.filter((opcao) => opcao.hasAttribute('data-sugerida'));
    expect(nomesDasOpcoes(sugeridas)).toEqual([seguirOSistema(), ...doBrasil]);
    // As sugeridas vêm primeiro, e os outros fusos seguem na ordem da diferença para o UTC.
    expect(nomesDasOpcoes(opcoes).slice(0, sugeridas.length)).toEqual(nomesDasOpcoes(sugeridas));
    expect(opcoes.length).toBeGreaterThan(sugeridas.length);
  });

  it('escolher o fuso de Manaus muda a prévia na hora e fica gravado', async () => {
    abrir();
    await escolher('manaus', /Manaus/);
    expect(salvas().regiao.fuso).toBe('America/Manaus');
    expect(fuso().value).toBe('Horário do Amazonas · Manaus (UTC−4)');
    const agoraEmManaus = criarDataHora('America/Manaus').formatarHorario(new Date());
    expect(screen.getByText(`Agora: ${agoraEmManaus}`)).toBeTruthy();
  });

  it('o controle fica no data-foco "fuso-horario", que a busca abre por "Fuso horário"', () => {
    abrir();
    expect(document.querySelector('[data-foco="fuso-horario"]')?.contains(fuso())).toBe(true);
    const entrada = ajustes.busca?.entradas?.find((item) => item.rotulo === 'Fuso horário');
    expect(entrada).toMatchObject({
      destino: '/ajustes/idioma-e-regiao',
      foco: 'fuso-horario',
      caminho: 'Ajustes › Idioma e região',
    });
  });

  it('"Restaurar padrões" volta a seguir o sistema', async () => {
    abrir();
    await escolher('manaus', /Manaus/);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(salvas().regiao.fuso).toBe('sistema');
    expect(fuso().value).toBe(seguirOSistema());
  });
});

describe('seção Idioma e região com outro alvo', () => {
  it('mostra o fuso do alvo, com a hora de agora nele, e muda o alvo', async () => {
    const alvo = alvoSimulado({ regiao: { fuso: 'America/Manaus' } });
    const emManaus = criarDataHora('America/Manaus');
    // A hora de quando a seção abriu ou a de agora: o minuto pode virar entre as duas.
    const antes = `Agora: ${emManaus.formatarHorario(new Date())}`;
    abrir(alvo);
    expect(fuso().value).toBe('Horário do Amazonas · Manaus (UTC−4)');
    const depois = `Agora: ${emManaus.formatarHorario(new Date())}`;
    expect(screen.getByText((texto) => texto === antes || texto === depois)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(alvo.restaurar).toHaveBeenCalledWith('regiao');
    await escolher('recife', /Recife/);
    expect(alvo.mudar).toHaveBeenCalledWith('regiao', { fuso: 'America/Recife' });
    expect(salvas().regiao.fuso).toBe('sistema');
  });
});
