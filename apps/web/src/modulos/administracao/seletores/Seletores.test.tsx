import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comApi } from '../../../teste/provedores.tsx';
import { type ContaDoSeletor, SeletorDeConta } from './SeletorDeConta.tsx';
import { SeletorDeLocal } from './SeletorDeLocal.tsx';

afterEach(cleanup);

const local = (id: string, paiId: string | null, nome: string, situacao = 'ativo') => ({
  id,
  paiId,
  nome,
  tipo: 'setor',
  situacao,
  permite: { editar: true },
});

const ARVORE = {
  locais: [
    local('jundiai', null, 'Jundiaí'),
    local('expedicao', 'jundiai', 'Expedição'),
    local('doca', 'expedicao', 'Doca 3', 'inativo'),
    local('campinas', null, 'Campinas'),
  ],
  permite: { cadastrarNaRaiz: true },
};
const servidor = { 'GET /api/locais': () => Response.json(ARVORE) };

const campo = (rotulo: string) =>
  screen.getByRole('combobox', { name: rotulo }) as HTMLInputElement;

/** O gatilho da escolha de local, que mostra o caminho do escolhido. */
const gatilho = (rotulo: string) =>
  screen.getByRole('button', { name: new RegExp(`^${rotulo}`) }) as HTMLButtonElement;

/** Abre o painel da escolha de local, quando os locais já chegaram. */
async function abrirLocais(rotulo: string) {
  await waitFor(() => expect(gatilho(rotulo).disabled).toBe(false));
  fireEvent.click(gatilho(rotulo));
  return screen.findByRole('dialog', { name: rotulo });
}

/** Os nomes das linhas da árvore à vista, sem o tipo. */
const linhas = (painel: HTMLElement) =>
  within(painel)
    .getAllByRole('row')
    .map((linha) => linha.getAttribute('aria-label')?.split(',')[0]);

/** Digita no campo, com o foco nele, como o usuário. */
function digitar(elemento: HTMLElement, texto: string) {
  elemento.focus();
  fireEvent.change(elemento, { target: { value: texto } });
}

const opcoes = async () => (await screen.findAllByRole('option')).map((opcao) => opcao.textContent);

describe('SeletorDeLocal', () => {
  it('abre a árvore dos locais ativos, sem os ramos inativos', async () => {
    render(<SeletorDeLocal rotulo="Local de trabalho" valor={null} aoMudar={() => {}} />, {
      wrapper: comApi(servidor),
    });
    const painel = await abrirLocais('Local de trabalho');
    expect(linhas(painel)).toEqual(['Campinas', 'Jundiaí']);
    fireEvent.click(within(painel).getByRole('button', { name: /^Expandir Jundiaí/ }));
    await waitFor(() => expect(linhas(painel)).toEqual(['Campinas', 'Jundiaí', 'Expedição']));
  });

  it('o filtro acha os locais pelo caminho, sem os acentos', async () => {
    render(<SeletorDeLocal rotulo="Local de trabalho" valor={null} aoMudar={() => {}} />, {
      wrapper: comApi(servidor),
    });
    const painel = await abrirLocais('Local de trabalho');
    digitar(within(painel).getByRole('searchbox', { name: 'Filtrar' }), 'jundiai');
    expect(await opcoes()).toEqual(['Jundiaí', 'Jundiaí › Expedição']);
    digitar(within(painel).getByRole('searchbox', { name: 'Filtrar' }), 'expedicao');
    await waitFor(async () => expect(await opcoes()).toEqual(['Jundiaí › Expedição']));
  });

  it('escolher um local devolve o id dele, e o campo mostra o caminho', async () => {
    const aoMudar = vi.fn();
    const { rerender } = render(
      <SeletorDeLocal rotulo="Local de trabalho" valor={null} aoMudar={aoMudar} />,
      { wrapper: comApi(servidor) },
    );
    expect(gatilho('Local de trabalho').textContent).toContain('Escolha um local');
    const painel = await abrirLocais('Local de trabalho');
    digitar(within(painel).getByRole('searchbox', { name: 'Filtrar' }), 'exped');
    fireEvent.click(await screen.findByRole('option', { name: 'Jundiaí › Expedição' }));
    expect(aoMudar).toHaveBeenCalledWith('expedicao');
    rerender(<SeletorDeLocal rotulo="Local de trabalho" valor="expedicao" aoMudar={aoMudar} />);
    expect(gatilho('Local de trabalho').textContent).toContain('Jundiaí › Expedição');
  });

  it('não oferece os locais excluídos, como o ramo do local que se move', async () => {
    render(
      <SeletorDeLocal
        rotulo="Mover para"
        valor={null}
        aoMudar={() => {}}
        excluir={new Set(['jundiai', 'expedicao'])}
      />,
      { wrapper: comApi(servidor) },
    );
    const painel = await abrirLocais('Mover para');
    // Jundiaí fica à vista, apagada, para o que estiver dentro dela ser alcançado.
    expect(linhas(painel)).toEqual(['Campinas', 'Jundiaí']);
    expect(
      within(painel)
        .getByRole('row', { name: /^Jundiaí/ })
        .getAttribute('aria-label'),
    ).toBe('Jundiaí, Setor, não pode ser escolhido');
    digitar(within(painel).getByRole('searchbox', { name: 'Filtrar' }), 'a');
    expect(await opcoes()).toEqual(['Campinas']);
  });

  it('o local sugerido pela tela aparece no topo, com a origem', async () => {
    const aoMudar = vi.fn();
    render(
      <SeletorDeLocal
        rotulo="Local"
        valor={null}
        aoMudar={aoMudar}
        sugerido={{ id: 'expedicao', origem: 'local de trabalho de Bruno' }}
      />,
      { wrapper: comApi(servidor) },
    );
    const painel = await abrirLocais('Local');
    const sugerido = within(painel).getByRole('button', { name: /Jundiaí › Expedição/ });
    expect(sugerido.textContent).toContain('Sugerido: local de trabalho de Bruno');
    fireEvent.click(sugerido);
    expect(aoMudar).toHaveBeenCalledWith('expedicao');
  });
});

describe('SeletorDeConta', () => {
  const CONTAS: ContaDoSeletor[] = [
    { id: 'c-ana', rotulo: 'Ana Souza' },
    { id: 'c-bruno', rotulo: 'Bruno Costa' },
  ];
  const filtrar = (texto: string) =>
    CONTAS.filter((conta) => conta.rotulo.toLowerCase().includes(texto.toLowerCase()));

  it('sugere as contas que vêm da API enquanto se digita', async () => {
    const buscar = vi.fn(async (texto: string) => filtrar(texto));
    const aoMudar = vi.fn();
    render(<SeletorDeConta rotulo="Quem fez" valor={null} aoMudar={aoMudar} buscar={buscar} />, {
      wrapper: comApi(),
    });
    digitar(campo('Quem fez'), 'bru');
    expect(await opcoes()).toEqual(['Bruno Costa']);
    expect(buscar).toHaveBeenLastCalledWith('bru', expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('option', { name: 'Bruno Costa' }));
    expect(aoMudar).toHaveBeenCalledWith({ id: 'c-bruno', rotulo: 'Bruno Costa' });
  });

  it('sem o texto, busca as primeiras, e o clique no campo as mostra', async () => {
    const buscar = vi.fn(async (texto: string) => filtrar(texto));
    render(<SeletorDeConta rotulo="Quem fez" valor={null} aoMudar={() => {}} buscar={buscar} />, {
      wrapper: comApi(),
    });
    await waitFor(() => expect(buscar).toHaveBeenCalledWith('', expect.any(AbortSignal)));
    fireEvent.click(campo('Quem fez'));
    expect(await opcoes()).toEqual(['Ana Souza', 'Bruno Costa']);
  });

  it('com mais contas na API que as mostradas, diz o total, e marca as sugeridas', async () => {
    const buscar = vi.fn(async () => ({
      itens: CONTAS,
      total: 300,
      sugeridas: { ids: ['c-bruno'], origem: 'Do mesmo local do ativo' },
    }));
    render(
      <SeletorDeConta rotulo="Responsável" valor={null} aoMudar={() => {}} buscar={buscar} />,
      {
        wrapper: comApi(),
      },
    );
    await waitFor(() => expect(buscar).toHaveBeenCalled());
    fireEvent.click(campo('Responsável'));
    expect(await opcoes()).toHaveLength(2);
    expect(screen.getByText('Digite para buscar entre 300')).toBeTruthy();
    expect(screen.getByText('Do mesmo local do ativo')).toBeTruthy();
  });

  it('a busca anterior é cancelada quando o texto muda', async () => {
    const sinais: AbortSignal[] = [];
    const buscar = vi.fn(async (_texto: string, sinal: AbortSignal) => {
      sinais.push(sinal);
      return [];
    });
    render(<SeletorDeConta rotulo="Quem fez" valor={null} aoMudar={() => {}} buscar={buscar} />, {
      wrapper: comApi(),
    });
    // A primeira busca, sem o texto, é a das contas para abrir a lista.
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));
    digitar(campo('Quem fez'), 'a');
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(2));
    digitar(campo('Quem fez'), 'an');
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(3));
    expect(sinais[1]?.aborted).toBe(true);
    expect(sinais[2]?.aborted).toBe(false);
  });

  it('a conta trocada de fora, como a criada numa aba, aparece no campo depois de outra escolhida', async () => {
    let trocar: (conta: ContaDoSeletor) => void = () => {};
    function ComValor() {
      const [valor, definirValor] = useState<ContaDoSeletor | null>(null);
      trocar = definirValor;
      return (
        <SeletorDeConta
          rotulo="Quem fez"
          valor={valor}
          aoMudar={definirValor}
          buscar={async (texto: string) => filtrar(texto)}
        />
      );
    }
    render(<ComValor />, { wrapper: comApi() });
    digitar(campo('Quem fez'), 'ana');
    fireEvent.click(await screen.findByRole('option', { name: 'Ana Souza' }));
    await waitFor(() => expect(campo('Quem fez').value).toBe('Ana Souza'));

    act(() => trocar({ id: 'c-carla', rotulo: 'Carla Dias' }));
    await waitFor(() => expect(campo('Quem fez').value).toBe('Carla Dias'));
  });

  it('a conta escolhida aparece no campo', () => {
    render(
      <SeletorDeConta
        rotulo="Quem fez"
        valor={{ id: 'c-ana', rotulo: 'Ana Souza' }}
        aoMudar={() => {}}
        buscar={async () => []}
      />,
      { wrapper: comApi() },
    );
    expect(campo('Quem fez').value).toBe('Ana Souza');
  });
});
