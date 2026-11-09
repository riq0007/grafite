import type { OcorrenciaAberta } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarRoteador } from '../../rotas/arvore.ts';
import { preferenciasDaCopia } from '../../teste/preferencias.ts';
import { sessaoAtiva } from '../../teste/sessao.ts';
import { REGISTRO } from '../registro.ts';
import type { FonteDeOcorrencias } from '../tipos.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

const MINUTO = 60_000;

const ocorrencia = (
  id: string,
  nome: string,
  desde: Date,
  destino = `/ativos/${id}`,
): OcorrenciaAberta => ({
  id,
  severidade: 'atencao',
  texto: `Ocorrência de ${nome}`,
  ativo: { nome, tipo: 'impressora' },
  desde,
  destino,
});

/** O registro de verdade, com uma fonte de ocorrências no Início, só para o teste. */
function abrirComAFonte(fonte: FonteDeOcorrencias, sessao = sessaoAtiva()) {
  const modulos = REGISTRO.map((modulo) =>
    modulo.id === 'inicio' ? { ...modulo, ocorrencias: fonte } : modulo,
  );
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }), modulos);
  render(<App roteador={roteador} sessao={sessao} />);
  return roteador;
}

const linhas = async () => {
  const tabela = await screen.findByRole('grid', { name: 'Ocorrências abertas' });
  return within(tabela).getAllByRole('row').slice(1);
};
const ativos = async () =>
  (await linhas()).map((linha) => within(linha).getByRole('rowheader').textContent);
const salvas = preferenciasDaCopia;

describe('Início', () => {
  it('sem fontes no registro, diz que nenhum módulo registra ocorrências ainda', async () => {
    render(
      <App
        roteador={criarRoteador(createMemoryHistory({ initialEntries: ['/'] }))}
        sessao={sessaoAtiva()}
      />,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'O que resolver agora' }),
    ).toBeTruthy();
    expect(screen.getByText('Nenhum módulo registra ocorrências ainda')).toBeTruthy();
  });

  it('a fonte que exige permissão só entra para quem tem ao menos uma delas', async () => {
    const fonte: FonteDeOcorrencias = {
      buscar: async () => [ocorrencia('a', 'Aruba 2930F', new Date())],
      permissoes: ['auditoria.ver'],
    };
    abrirComAFonte(fonte);
    expect(await screen.findByText('Nenhum módulo registra ocorrências ainda')).toBeTruthy();
    cleanup();
    abrirComAFonte(fonte, sessaoAtiva([{ chave: 'auditoria.ver', organizacao: true, locais: [] }]));
    expect(await ativos()).toEqual(['Aruba 2930F']);
  });

  it('usa a ordem salva nas preferências e grava a que o usuário escolhe', async () => {
    const agora = Date.now();
    abrirComAFonte(
      {
        buscar: async () => [
          ocorrencia('a', 'Aruba 2930F', new Date(agora - 5 * MINUTO)),
          ocorrencia('h', 'HP M404dn', new Date(agora - 50 * MINUTO)),
        ],
      },
      sessaoAtiva([], {}, { inicio: { ordenacao: { coluna: 'ativo', direcao: 'decrescente' } } }),
    );
    expect(await ativos()).toEqual(['HP M404dn', 'Aruba 2930F']);
    fireEvent.click(screen.getByRole('columnheader', { name: /Há/ }));
    expect(salvas().inicio.ordenacao).toEqual({ coluna: 'ha', direcao: 'crescente' });
    expect(await ativos()).toEqual(['Aruba 2930F', 'HP M404dn']);
  });

  it('anda a idade na virada do minuto, sem recarregar a página', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // 14:32:30: a ocorrência abriu há 1 h 59 min 30 s.
    const agora = new Date('2026-09-24T17:32:30Z');
    vi.setSystemTime(agora);
    abrirComAFonte({
      buscar: async () => [
        ocorrencia('t', 'HP M404dn', new Date(agora.getTime() - (119 * MINUTO + 30_000))),
      ],
    });
    const [linha] = await linhas();
    expect(within(linha as HTMLElement).getByText('1 h')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(within(linha as HTMLElement).getByText('2 h')).toBeTruthy();
  });

  it('Enter na linha navega ao registro da ocorrência', async () => {
    const roteador = abrirComAFonte({
      buscar: async () => [ocorrencia('dock', 'Dock', new Date(), '/ajustes/dock')],
    });
    const [linha] = await linhas();
    (linha as HTMLElement).focus();
    fireEvent.keyDown(linha as HTMLElement, { key: 'Enter' });
    fireEvent.keyUp(linha as HTMLElement, { key: 'Enter' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Dock' })).toBeTruthy();
    expect(roteador.state.location.pathname).toBe('/ajustes/dock');
  });
});

// O Início em blocos (spec tela-inicial, "Início em blocos"; change inicio-ajustavel, design,
// decisões 1, 2 e 4).
describe('Início em blocos', () => {
  const blocoDeTeste = {
    id: 'teste.bloco',
    titulo: 'Bloco de teste',
    componente: () => <p>Conteúdo do bloco de teste</p>,
  };

  function abrirComOBloco() {
    const modulos = REGISTRO.map((modulo) =>
      modulo.id === 'inicio' ? { ...modulo, blocosDoInicio: [blocoDeTeste] } : modulo,
    );
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }), modulos);
    render(<App roteador={roteador} sessao={sessaoAtiva()} />);
  }

  const titulos = () => screen.getAllByRole('heading').map((titulo) => titulo.textContent ?? '');
  const posicaoDoResolver = (ordem: string[]) =>
    ordem.findIndex((titulo) => titulo.startsWith('O que resolver agora'));

  it('bloco de um módulo: aparece depois de "O que resolver agora", com o título num carimbo', async () => {
    abrirComOBloco();
    expect(await screen.findByRole('heading', { level: 2, name: 'Bloco de teste' })).toBeTruthy();
    expect(screen.getByText('Conteúdo do bloco de teste')).toBeTruthy();
    const ordem = titulos();
    expect(posicaoDoResolver(ordem)).toBeGreaterThanOrEqual(0);
    expect(posicaoDoResolver(ordem)).toBeLessThan(ordem.indexOf('Bloco de teste'));
  });

  it('bloco de um módulo que saiu: ignorado, e os outros seguem a ordem salva', async () => {
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({
        versao: 1,
        inicio: {
          blocos: [
            { id: 'salas.agenda', visivel: true },
            { id: 'teste.bloco', visivel: true },
            { id: 'inicio.resolver', visivel: true },
          ],
        },
      }),
    );
    abrirComOBloco();
    await screen.findByRole('heading', { level: 2, name: 'Bloco de teste' });
    const ordem = titulos();
    expect(ordem.indexOf('Bloco de teste')).toBeLessThan(posicaoDoResolver(ordem));
  });

  it('busca no topo: abre a busca global', async () => {
    abrirComOBloco();
    fireEvent.click(
      await screen.findByRole('button', { name: /Buscar ativos, pessoas, locais e ações/ }),
    );
    expect(await screen.findByRole('dialog', { name: 'Busca' })).toBeTruthy();
  });
  // Spec tela-inicial, "Personalizar o Início" (change inicio-ajustavel, design, decisão 3).
  const personalizar = async () =>
    fireEvent.click(await screen.findByRole('button', { name: 'Personalizar o Início' }));

  it('subir um bloco: ele passa acima de "O que resolver agora", e a ordem fica gravada', async () => {
    abrirComOBloco();
    await personalizar();
    fireEvent.click(screen.getByRole('button', { name: 'Subir Bloco de teste' }));
    const ordem = titulos();
    expect(ordem.indexOf('Bloco de teste')).toBeLessThan(posicaoDoResolver(ordem));
    expect(preferenciasDaCopia().inicio.blocos).toEqual([
      { id: 'teste.bloco', visivel: true },
      { id: 'inicio.resolver', visivel: true },
    ]);
  });

  it('ocultar e mostrar: o oculto vai para a lista, e o Mostrar o devolve ao fim', async () => {
    abrirComOBloco();
    await personalizar();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Bloco de teste' }));
    expect(screen.queryByRole('heading', { level: 2, name: 'Bloco de teste' })).toBeNull();
    const ocultos = screen.getByRole('list', { name: 'Blocos ocultos' });
    fireEvent.click(within(ocultos).getByRole('button', { name: 'Mostrar Bloco de teste' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Bloco de teste' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(screen.queryByRole('button', { name: 'Subir Bloco de teste' })).toBeNull();
  });

  it('"O que resolver agora" fica sempre à vista: sobe e desce, sem Ocultar', async () => {
    abrirComOBloco();
    await personalizar();
    expect(
      screen.getByRole('button', { name: 'Subir O que resolver agora' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Descer O que resolver agora' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ocultar O que resolver agora' })).toBeNull();
  });
});
