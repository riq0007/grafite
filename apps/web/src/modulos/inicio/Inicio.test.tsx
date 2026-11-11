import type { AjustesDasPreferencias } from '@grafite/domain';
import type { OcorrenciaAberta } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarRoteador } from '../../rotas/arvore.ts';
import { preferenciasDaCopia } from '../../teste/preferencias.ts';
import { type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';
import { REGISTRO } from '../registro.ts';
import type { BlocoDoInicio, FonteDeOcorrencias } from '../tipos.ts';
import { escolhasDa, numeroDa } from './opcoes.ts';

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

// As opções dos blocos (spec tela-inicial, "Opções dos blocos"; change
// opcoes-dos-blocos-do-inicio, design, decisão 1): o Início resolve o valor de cada opção que o
// bloco declara e o entrega ao bloco.
describe('opções dos blocos do Início', () => {
  /** Um bloco com um número e os locais nas opções, que escreve o que recebeu, só para o teste. */
  const comOpcoes: BlocoDoInicio = {
    id: 'teste.opcoes',
    titulo: 'Bloco com opções',
    opcoes: [
      { chave: 'limite', rotulo: 'Itens', forma: 'numero', minimo: 3, maximo: 12, padrao: 6 },
      { chave: 'locais', rotulo: 'Locais', forma: 'locais' },
    ],
    componente: ({ opcoes }) => (
      <p>
        {`Itens: ${numeroDa(opcoes, 'limite')} · Locais: ${escolhasDa(opcoes, 'locais').join(', ') || 'todos'}`}
      </p>
    ),
  };
  const semOpcoes: BlocoDoInicio = {
    id: 'teste.simples',
    titulo: 'Bloco simples',
    componente: ({ opcoes }) => <p>{`Opções recebidas: ${Object.keys(opcoes).length}`}</p>,
  };
  const LOCAIS = [
    { id: 'jundiai', paiId: null, nome: 'Jundiaí', tipo: 'unidade', situacao: 'ativo' },
    { id: 'antigo', paiId: null, nome: 'Galpão antigo', tipo: 'unidade', situacao: 'inativo' },
  ].map((local) => ({ ...local, permite: { editar: false } }));
  const locais = () => Response.json({ locais: LOCAIS, permite: { cadastrarNaRaiz: false } });

  function abrirComOsBlocos(
    blocos: readonly BlocoDoInicio[],
    preferencias: AjustesDasPreferencias = {},
    servidor: ServidorDeTeste = { 'GET /api/locais': locais },
  ) {
    const modulos = REGISTRO.map((modulo) =>
      modulo.id === 'inicio' ? { ...modulo, blocosDoInicio: blocos } : modulo,
    );
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }), modulos);
    render(<App roteador={roteador} sessao={sessaoAtiva([], servidor, preferencias)} />);
  }
  const guardado = (opcoes: Record<string, number | string[]>) => ({
    inicio: { blocos: [{ id: 'teste.opcoes', visivel: true, opcoes }] },
  });

  it('sem nada guardado, o bloco recebe as opções de fábrica', async () => {
    abrirComOsBlocos([comOpcoes]);
    expect(await screen.findByText('Itens: 6 · Locais: todos')).toBeTruthy();
  });

  it('Opção gravada: o bloco recebe o valor guardado na conta, e as outras ficam de fábrica', async () => {
    abrirComOsBlocos([comOpcoes], guardado({ limite: 9 }));
    expect(await screen.findByText('Itens: 9 · Locais: todos')).toBeTruthy();
  });

  it('o valor que a opção não aceita mais dá lugar ao de fábrica', async () => {
    abrirComOsBlocos([comOpcoes], guardado({ limite: 40, locais: ['jundiai'] }));
    expect(await screen.findByText('Itens: 6 · Locais: jundiai')).toBeTruthy();
  });

  it('Local inativado nas opções: sem nenhum local ativo, o bloco volta a todos, e o número continua', async () => {
    abrirComOsBlocos([comOpcoes], guardado({ limite: 9, locais: ['antigo'] }));
    expect(await screen.findByText('Itens: 9 · Locais: todos')).toBeTruthy();
  });

  it('Um dos locais inativado: o bloco continua com os outros', async () => {
    abrirComOsBlocos([comOpcoes], guardado({ locais: ['jundiai', 'antigo'] }));
    expect(await screen.findByText('Itens: 6 · Locais: jundiai')).toBeTruthy();
  });

  it('sem nenhum local guardado, os locais não são pedidos; com a gaveta aberta, são', async () => {
    const pedidos = vi.fn(locais);
    abrirComOsBlocos([comOpcoes], {}, { 'GET /api/locais': pedidos });
    await screen.findByText('Itens: 6 · Locais: todos');
    expect(pedidos).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Personalizar o Início' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opções de Bloco com opções' }));
    await waitFor(() => expect(pedidos).toHaveBeenCalled());
  });

  it('Bloco sem opções: recebe as opções vazias, e os locais não são pedidos', async () => {
    const pedidos = vi.fn(locais);
    abrirComOsBlocos([semOpcoes], {}, { 'GET /api/locais': pedidos });
    expect(await screen.findByText('Opções recebidas: 0')).toBeTruthy();
    expect(pedidos).not.toHaveBeenCalled();
  });
});

// A gaveta "Opções…" (spec tela-inicial, "Personalizar o Início" e "Opções dos blocos"; change
// opcoes-dos-blocos-do-inicio, design, decisão 3): cada mudança vale na hora no bloco e fica gravada
// na conta, sem botão de salvar.
describe('a gaveta das opções no Início', () => {
  /** Um bloco com os tipos e o nível nas opções, que escreve o que recebeu, só para o teste. */
  const comTipos: BlocoDoInicio = {
    id: 'teste.tipos',
    titulo: 'Bloco com tipos',
    opcoes: [
      {
        chave: 'tipos',
        rotulo: 'Tipos de suprimento',
        forma: 'escolhas',
        opcoes: [
          { id: 'toner', rotulo: 'Toner' },
          { id: 'cilindro', rotulo: 'Cilindro' },
          { id: 'fusor', rotulo: 'Fusor' },
        ],
        padrao: ['toner', 'cilindro', 'fusor'],
        minimo: 1,
      },
      {
        chave: 'nivel',
        rotulo: 'Nível até',
        forma: 'numero',
        minimo: 5,
        maximo: 100,
        passo: 5,
        unidade: '%',
        padrao: 100,
      },
    ],
    componente: ({ opcoes }) => (
      <p>{`Tipos: ${escolhasDa(opcoes, 'tipos').join(', ')} · até ${numeroDa(opcoes, 'nivel')}%`}</p>
    ),
  };
  const simples: BlocoDoInicio = {
    id: 'teste.simples',
    titulo: 'Bloco simples',
    componente: () => <p>Conteúdo do bloco simples</p>,
  };

  function abrirComOsBlocos(
    blocos: readonly BlocoDoInicio[],
    preferencias: AjustesDasPreferencias = {},
  ) {
    const modulos = REGISTRO.map((modulo) =>
      modulo.id === 'inicio' ? { ...modulo, blocosDoInicio: blocos } : modulo,
    );
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }), modulos);
    render(<App roteador={roteador} sessao={sessaoAtiva([], {}, preferencias)} />);
  }
  const personalizar = async () =>
    fireEvent.click(await screen.findByRole('button', { name: 'Personalizar o Início' }));
  const abrirAsOpcoes = async () => {
    await personalizar();
    fireEvent.click(screen.getByRole('button', { name: 'Opções de Bloco com tipos' }));
    return within(await screen.findByRole('dialog', { name: 'Opções de Bloco com tipos' }));
  };
  const doBloco = () =>
    preferenciasDaCopia().inicio.blocos.find((bloco) => bloco.id === 'teste.tipos');

  it('fora do modo Personalizar, nenhum bloco mostra "Opções…"', async () => {
    abrirComOsBlocos([comTipos]);
    await screen.findByText('Tipos: toner, cilindro, fusor · até 100%');
    expect(screen.queryByRole('button', { name: 'Opções de Bloco com tipos' })).toBeNull();
  });

  it('Bloco sem opções: no modo Personalizar, só o bloco que declara opções tem "Opções…"', async () => {
    abrirComOsBlocos([comTipos, simples]);
    await personalizar();
    const opcoes = screen.getByRole('button', { name: 'Opções de Bloco com tipos' });
    expect(opcoes.textContent).toBe('Opções…');
    expect(screen.queryByRole('button', { name: 'Opções de Bloco simples' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Opções de O que resolver agora' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Subir Bloco simples' })).toBeTruthy();
  });

  it('mudar uma opção na gaveta vale na hora no bloco e fica gravada na conta', async () => {
    abrirComOsBlocos([comTipos]);
    const gaveta = await abrirAsOpcoes();
    fireEvent.click(gaveta.getByRole('checkbox', { name: 'Fusor' }));
    expect(await screen.findByText('Tipos: toner, cilindro · até 100%')).toBeTruthy();
    expect(doBloco()).toEqual({
      id: 'teste.tipos',
      visivel: true,
      opcoes: { tipos: ['toner', 'cilindro'] },
    });
    // A segunda mudança junta as duas opções no mesmo bloco.
    const nivel = gaveta.getByRole('slider', { name: 'Nível até' });
    fireEvent.keyDown(nivel, { key: 'ArrowLeft' });
    expect(await screen.findByText('Tipos: toner, cilindro · até 95%')).toBeTruthy();
    expect(doBloco()?.opcoes).toEqual({ tipos: ['toner', 'cilindro'], nivel: 95 });
  });

  it('a última caixa marcada fica desabilitada, com a explicação', async () => {
    abrirComOsBlocos([comTipos], {
      inicio: { blocos: [{ id: 'teste.tipos', visivel: true, opcoes: { tipos: ['fusor'] } }] },
    });
    const gaveta = await abrirAsOpcoes();
    expect((gaveta.getByRole('checkbox', { name: 'Fusor' }) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(gaveta.getByText('Pelo menos um fica escolhido.')).toBeTruthy();
    expect((gaveta.getByRole('checkbox', { name: 'Toner' }) as HTMLInputElement).disabled).toBe(
      false,
    );
  });

  it('Restaurar as opções: o bloco volta às de fábrica, e o item fica sem o campo', async () => {
    abrirComOsBlocos([comTipos], {
      inicio: {
        blocos: [
          {
            id: 'teste.tipos',
            visivel: true,
            largura: 'metade',
            opcoes: { tipos: ['toner'], nivel: 30 },
          },
        ],
      },
    });
    expect(await screen.findByText('Tipos: toner · até 30%')).toBeTruthy();
    const gaveta = await abrirAsOpcoes();
    fireEvent.click(gaveta.getByRole('button', { name: 'Restaurar as opções' }));
    expect(await screen.findByText('Tipos: toner, cilindro, fusor · até 100%')).toBeTruthy();
    // A largura do bloco não é uma opção: continua.
    expect(doBloco()).toEqual({ id: 'teste.tipos', visivel: true, largura: 'metade' });
  });

  it('a opção que o bloco deixou de declarar sai do que vai gravado', async () => {
    abrirComOsBlocos([comTipos], {
      inicio: {
        blocos: [{ id: 'teste.tipos', visivel: true, opcoes: { antiga: true, nivel: 30 } }],
      },
    });
    const gaveta = await abrirAsOpcoes();
    fireEvent.click(gaveta.getByRole('checkbox', { name: 'Cilindro' }));
    expect(doBloco()?.opcoes).toEqual({ nivel: 30, tipos: ['toner', 'fusor'] });
  });
});

// A largura dos blocos (spec tela-inicial, "Largura dos blocos"; change
// opcoes-dos-blocos-do-inicio, design, decisão 4). A grade em si, lado a lado na janela larga e
// numa coluna no celular, é conferida no ponta a ponta: aqui, o controle, o que vai gravado e as
// marcas que o CSS lê.
describe('a largura dos blocos do Início', () => {
  const bloco = (id: string, titulo: string): BlocoDoInicio => ({
    id,
    titulo,
    componente: () => <p>{`Conteúdo de ${titulo}`}</p>,
  });
  const UM = bloco('teste.um', 'Bloco um');
  const DOIS = bloco('teste.dois', 'Bloco dois');

  function abrirComOsBlocos(preferencias: AjustesDasPreferencias = {}) {
    const modulos = REGISTRO.map((modulo) =>
      modulo.id === 'inicio' ? { ...modulo, blocosDoInicio: [UM, DOIS] } : modulo,
    );
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }), modulos);
    render(<App roteador={roteador} sessao={sessaoAtiva([], {}, preferencias)} />);
  }
  const personalizar = async () =>
    fireEvent.click(await screen.findByRole('button', { name: 'Personalizar o Início' }));
  const largura = (titulo: string) =>
    screen.getByRole('radiogroup', { name: `Largura de ${titulo}` });
  const escolhida = (titulo: string) =>
    (within(largura(titulo)).getByRole('radio', { checked: true }) as HTMLInputElement).value;
  const secao = (titulo: string) =>
    screen.getByRole('heading', { level: 2, name: titulo }).closest('section') as HTMLElement;
  const salvos = () => preferenciasDaCopia().inicio.blocos;

  it('no modo Personalizar, cada bloco de módulo ganha "Largura", com Inteira e Metade', async () => {
    abrirComOsBlocos();
    await personalizar();
    expect(
      within(largura('Bloco um'))
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Inteira', 'Metade']);
    expect(escolhida('Bloco um')).toBe('inteira');
    expect(escolhida('Bloco dois')).toBe('inteira');
  });

  it('"O que resolver agora" é sempre inteiro: não tem "Largura", nem com a metade guardada', async () => {
    abrirComOsBlocos({
      inicio: { blocos: [{ id: 'inicio.resolver', visivel: true, largura: 'metade' }] },
    });
    await personalizar();
    expect(
      screen.queryByRole('radiogroup', { name: 'Largura de O que resolver agora' }),
    ).toBeNull();
    const resolver = screen.getByRole('heading', { level: 1, name: 'O que resolver agora' });
    expect(resolver.closest('[data-largura]')?.getAttribute('data-largura')).toBe('inteira');
  });

  it('escolher Metade grava a largura no item e marca o bloco, e Inteira tira a largura', async () => {
    abrirComOsBlocos();
    await personalizar();
    fireEvent.click(within(largura('Bloco um')).getByRole('radio', { name: 'Metade' }));
    expect(secao('Bloco um').getAttribute('data-largura')).toBe('metade');
    expect(secao('Bloco dois').getAttribute('data-largura')).toBe('inteira');
    expect(salvos().find(({ id }) => id === 'teste.um')).toEqual({
      id: 'teste.um',
      visivel: true,
      largura: 'metade',
    });
    fireEvent.click(within(largura('Bloco um')).getByRole('radio', { name: 'Inteira' }));
    expect(secao('Bloco um').getAttribute('data-largura')).toBe('inteira');
    expect(salvos().find(({ id }) => id === 'teste.um')).toEqual({ id: 'teste.um', visivel: true });
  });

  it('a largura guardada vale ao abrir, e a ordem no documento é a da lista', async () => {
    abrirComOsBlocos({
      inicio: {
        blocos: [
          { id: 'teste.dois', visivel: true, largura: 'metade' },
          { id: 'teste.um', visivel: true, largura: 'metade' },
          { id: 'inicio.resolver', visivel: true },
        ],
      },
    });
    await screen.findByText('Conteúdo de Bloco um');
    expect(secao('Bloco dois').getAttribute('data-largura')).toBe('metade');
    expect(secao('Bloco um').getAttribute('data-largura')).toBe('metade');
    const titulos = screen.getAllByRole('heading').map((titulo) => titulo.textContent ?? '');
    expect(titulos.indexOf('Bloco dois')).toBeLessThan(titulos.indexOf('Bloco um'));
    expect(titulos.indexOf('Bloco um')).toBeLessThan(
      titulos.findIndex((titulo) => titulo.startsWith('O que resolver agora')),
    );
  });

  it('subir e ocultar o bloco levam a largura dele', async () => {
    abrirComOsBlocos({
      inicio: { blocos: [{ id: 'teste.dois', visivel: true, largura: 'metade' }] },
    });
    await personalizar();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Bloco dois' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar Bloco dois' }));
    expect(salvos().find(({ id }) => id === 'teste.dois')).toEqual({
      id: 'teste.dois',
      visivel: true,
      largura: 'metade',
    });
  });

  it('a grade tem duas colunas só no computador: no tablet e no celular, uma', async () => {
    const colunas = async () => {
      abrirComOsBlocos();
      await screen.findByText('Conteúdo de Bloco um');
      const grade = document.querySelector('[data-grade-do-inicio]');
      const lidas = grade?.getAttribute('data-colunas');
      cleanup();
      return lidas;
    };
    /** O ponteiro primário da janela de teste: fino, no computador, ou de toque, no tablet. */
    const comPonteiro = (fino: boolean) => {
      const original = window.matchMedia.bind(window);
      vi.stubGlobal('matchMedia', (consulta: string) => {
        const lista = original(consulta);
        if (consulta === '(pointer: fine)') {
          Object.defineProperty(lista, 'matches', { value: fino });
        }
        return lista;
      });
    };
    try {
      comPonteiro(true);
      expect(await colunas()).toBe('2');
      vi.unstubAllGlobals();
      comPonteiro(false);
      expect(await colunas()).toBe('1');
      vi.unstubAllGlobals();
      comPonteiro(true);
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
      expect(await colunas()).toBe('1');
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
