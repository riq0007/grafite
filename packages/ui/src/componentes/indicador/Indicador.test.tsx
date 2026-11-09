// O indicador com meta e decisão (spec componentes-base, "Indicador com meta e decisão"; change
// p3d-indicadores, design, decisão 7).
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Indicador } from './Indicador.tsx';

afterEach(cleanup);

const doToner = {
  nome: 'Tempo de atendimento do toner',
  mede: 'Do alerta do toner à troca, nos toners trocados no período.',
  anterior: '2,3 dias',
  meta: '2 dias',
  decisao:
    'Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes.',
} as const;

describe('Indicador', () => {
  it('mostra o nome como título da seção, o que mede, a base, o valor, o anterior e a meta', () => {
    render(<Indicador {...doToner} valor="1,5 dia" base="Mediana de 3 trocas" situacao="dentro" />);
    const secao = screen.getByRole('region', { name: 'Tempo de atendimento do toner' });
    expect(within(secao).getByRole('heading', { level: 2 }).textContent).toBe(
      'Tempo de atendimento do toner',
    );
    expect(within(secao).getByText(doToner.mede)).toBeTruthy();
    expect(within(secao).getByText('Mediana de 3 trocas')).toBeTruthy();
    expect(within(secao).getByText('1,5 dia')).toBeTruthy();
    expect(within(secao).getByText('Antes: 2,3 dias')).toBeTruthy();
    expect(within(secao).getByText('Meta: 2 dias')).toBeTruthy();
    expect(within(secao).getByText('Dentro da meta')).toBeTruthy();
    // Dentro da meta, a decisão não aparece.
    expect(within(secao).queryByText(doToner.decisao, { exact: false })).toBeNull();
  });

  it('Fora da meta sem cor: diz "Fora da meta" e a decisão em texto', () => {
    render(<Indicador {...doToner} valor="3 dias" situacao="fora" />);
    const rotulo = screen.getByText('Fora da meta').closest('[data-situacao]');
    expect(rotulo?.getAttribute('data-situacao')).toBe('atencao');
    expect(screen.getByText(doToner.decisao, { exact: false }).textContent).toBe(
      `O que fazer: ${doToner.decisao}`,
    );
  });

  it('Indicador sem dado: mostra o motivo no lugar do número, sem zero', () => {
    render(
      <Indicador
        {...doToner}
        anterior="sem dado"
        semValor="Nenhum toner trocado nos últimos 30 dias."
        situacao="sem-dado"
      />,
    );
    const secao = screen.getByRole('region', { name: 'Tempo de atendimento do toner' });
    expect(within(secao).getByText('Nenhum toner trocado nos últimos 30 dias.')).toBeTruthy();
    expect(
      within(secao).getByText('Sem dado').closest('[data-situacao]')?.getAttribute('data-situacao'),
    ).toBe('neutra');
    expect(secao.querySelector('[data-valor]')).toBeNull();
    expect(secao.textContent).not.toMatch(/\b0\b/);
  });

  it('mostra a ação e o detalhe de quem usa, e repassa os atributos da seção', () => {
    render(
      <Indicador
        {...doToner}
        valor="3 dias"
        situacao="fora"
        acao={<button type="button">Mudar a meta</button>}
        data-foco="indicador-toner"
      >
        <p>Impressora do RH esperando há 3 dias</p>
      </Indicador>,
    );
    const secao = screen.getByRole('region', { name: 'Tempo de atendimento do toner' });
    expect(secao.getAttribute('data-foco')).toBe('indicador-toner');
    expect(within(secao).getByRole('button', { name: 'Mudar a meta' })).toBeTruthy();
    expect(within(secao).getByText('Impressora do RH esperando há 3 dias')).toBeTruthy();
  });
});
