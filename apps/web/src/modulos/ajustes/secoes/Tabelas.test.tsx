import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AlvoDasPreferencias } from '../../../preferencias/alvo.tsx';
import { ProvedorDoAlvo } from '../../../preferencias/alvo.tsx';
import { ProvedorDePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { ProvedorDaSessao } from '../../../sessao/useSessao.tsx';
import { alvoSimulado } from '../../../teste/alvo.ts';
import { preferenciasDaCopia } from '../../../teste/preferencias.ts';
import { comApi } from '../../../teste/provedores.tsx';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { SecaoTabelas } from './Tabelas.tsx';

const raiz = () => document.documentElement;
const salvas = preferenciasDaCopia;

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const nome of [...raiz().getAttributeNames()]) raiz().removeAttribute(nome);
  raiz().removeAttribute('style');
});

/** O servidor das visões, com as mudanças da conta dadas, e as leituras feitas. */
function servidorDasVisoes(mudancas: unknown[] = []) {
  const leituras: string[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/visoes': (pedido) => {
      leituras.push(new URL(pedido.url).search);
      return Response.json({ visoes: [], mudancas, permite: { compartilhar: false } });
    },
  };
  return { servidor, leituras };
}

function abrir(alvo?: AlvoDasPreferencias, servidor = servidorDasVisoes().servidor) {
  const Api = comApi(servidor);
  render(
    <ProvedorDaSessao loja={sessaoAtiva(naOrganizacao('ativos.ver'), servidor)}>
      <Api>
        <ProvedorDePreferencias>
          <ProvedorDoAlvo alvo={alvo}>
            <SecaoTabelas />
          </ProvedorDoAlvo>
        </ProvedorDePreferencias>
      </Api>
    </ProvedorDaSessao>,
  );
}

const MUDANCAS = {
  visao: 'fabrica',
  definicao: { colunas: [{ chave: 'ativo.rotulo' }], ordenacao: null, filtros: [] },
  atualizadaEm: '2026-10-13T12:00:00.000Z',
};

const interruptor = (nome: string) =>
  screen.getByRole('switch', { name: nome }) as HTMLInputElement;
const exemplo = () => screen.getByRole('grid', { name: 'Tabela de exemplo' });
const cabecalhos = () =>
  within(exemplo())
    .getAllByRole('columnheader')
    .map((coluna) => coluna.textContent);

describe('seção Tabelas', () => {
  it('abre com os padrões de fábrica: linhas alternadas e miniaturas ligadas', () => {
    abrir();
    expect(interruptor('Linhas alternadas').checked).toBe(true);
    expect(interruptor('Miniaturas').checked).toBe(true);
    expect(exemplo().hasAttribute('data-sem-linhas-alternadas')).toBe(false);
    expect(cabecalhos()[0]).toBe('Imagem');
  });

  it('o resumo da linha vem ligado, com a explicação, e desligado fica gravado', () => {
    abrir();
    const resumo = interruptor('Resumo da linha');
    expect(resumo.checked).toBe(true);
    expect(resumo.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(resumo.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Ao parar o mouse 1,5 s sobre uma linha, mostra as colunas que estão fora da tela.');
    fireEvent.click(resumo);
    expect(interruptor('Resumo da linha').checked).toBe(false);
    expect(salvas().tabelas.resumoDaLinha).toBe(false);
  });

  it('mostra a tabela de exemplo com dados fictícios marcados como exemplo', () => {
    abrir();
    expect(screen.getByText('Exemplo com dados fictícios')).toBeTruthy();
    const linhas = within(exemplo()).getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(4);
    for (const [indice, linha] of linhas.entries()) {
      expect(linha.textContent).toContain(`EXEMPLO-0${indice + 1}`);
    }
  });

  it('desligar as linhas alternadas vale na hora na tabela de exemplo e fica gravado', () => {
    abrir();
    fireEvent.click(interruptor('Linhas alternadas'));
    expect(exemplo().hasAttribute('data-sem-linhas-alternadas')).toBe(true);
    expect(salvas().tabelas.linhasAlternadas).toBe(false);
  });

  it('desligar as miniaturas tira a coluna da tabela de exemplo, e o nome passa a ser a primeira', () => {
    abrir();
    fireEvent.click(interruptor('Miniaturas'));
    expect(cabecalhos()).not.toContain('Imagem');
    expect(cabecalhos()[0]).toMatch(/^Equipamento/);
    expect(salvas().tabelas.miniaturas).toBe(false);
  });

  it('cada ajuste tem o controle marcado para o foco pelo endereço', () => {
    abrir();
    const marcados = [...document.querySelectorAll('[data-foco]')];
    expect(marcados.map((el) => el.getAttribute('data-foco'))).toEqual([
      'linhas-alternadas',
      'miniaturas',
      'resumo-da-linha',
    ]);
  });

  it('com mudanças guardadas nas visões, a seção diz quantas e oferece restaurá-las', async () => {
    abrir(undefined, servidorDasVisoes([MUDANCAS]).servidor);
    expect(await screen.findByText('Suas mudanças estão guardadas em 1 visão.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Restaurar as minhas mudanças nas tabelas' }),
    ).toBeTruthy();
  });

  it('Restaurar padrões volta as tabelas à fábrica, sem mexer nas notificações', () => {
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({
        versao: 1,
        notificacoes: { tempo: 20 },
        tabelas: { linhasAlternadas: false, miniaturas: false },
      }),
    );
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(salvas().tabelas).toEqual({
      linhasAlternadas: true,
      miniaturas: true,
      resumoDaLinha: true,
      visoes: {},
      fixadas: {},
      fixadasPelaOrganizacao: {},
    });
    expect(salvas().notificacoes.tempo).toBe(20);
    expect(cabecalhos()[0]).toBe('Imagem');
  });
});

describe('seção Tabelas com outro alvo', () => {
  it('a tabela de exemplo segue o alvo, e não as tabelas de quem edita', () => {
    const alvo = alvoSimulado({ tabelas: { linhasAlternadas: false, miniaturas: false } });
    abrir(alvo);
    expect(interruptor('Linhas alternadas').checked).toBe(false);
    expect(exemplo().hasAttribute('data-sem-linhas-alternadas')).toBe(true);
    expect(cabecalhos()).not.toContain('Imagem');
    fireEvent.click(interruptor('Miniaturas'));
    expect(alvo.mudar).toHaveBeenCalledWith('tabelas', { miniaturas: true });
    expect(salvas().tabelas.miniaturas).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(alvo.restaurar).toHaveBeenCalledWith('tabelas');
  });

  it('nos padrões da organização, as mudanças da conta não aparecem', async () => {
    const { servidor, leituras } = servidorDasVisoes([MUDANCAS]);
    abrir(alvoSimulado({}), servidor);
    await act(async () => {});
    expect(leituras).toEqual([]);
    expect(screen.queryByText(/Suas mudanças estão guardadas/)).toBeNull();
  });
});
