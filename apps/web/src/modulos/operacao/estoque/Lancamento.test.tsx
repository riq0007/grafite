import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

// A entrada e a saída na gaveta do estoque (spec modulo-operacao, "Lançamento das movimentações";
// spec estoque, "Movimentação do estoque" e "Saldo que nunca fica negativo"; change p4c-estoque,
// design, decisão 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Saldo = components['schemas']['SaldoDoEstoque'];

const CF258A = {
  id: 'cf258a',
  codigo: 'CF258A',
  nome: 'HP 58A',
  tipo: 'toner',
  cor: 'preto',
  situacao: 'ativo',
  abrir: true,
} as const;

const local = (id: string, paiId: string | null, nome: string) => ({
  id,
  paiId,
  nome,
  tipo: 'setor',
  situacao: 'ativo',
  permite: { editar: false },
});

const LOCAIS = [
  local('jundiai', null, 'Jundiaí'),
  local('almoxarifado', 'jundiai', 'Almoxarifado'),
  local('expedicao', 'jundiai', 'Expedição'),
  local('campinas', null, 'Campinas'),
];

const saldoNoAlmoxarifado = (quantidade: number, minimo = 0): Saldo => ({
  id: 's1',
  consumivel: CF258A,
  local: { id: 'almoxarifado', caminho: 'Jundiaí › Almoxarifado' },
  saldo: quantidade,
  minimo,
  situacao: quantidade === 0 ? 'sem-estoque' : 'em-estoque',
  abaixoDesde: null,
  permite: { movimentar: true },
});

const conflito = (campos: Record<string, string>) =>
  Response.json(
    {
      type: 'urn:grafite:problema:conflito',
      title: 'Conflito',
      status: 409,
      detail: Object.values(campos)[0],
      codigoDeRastreio: 'R7K2-9QXM',
      campos,
    },
    { status: 409 },
  );

/** O estoque no servidor do teste, que guarda os lançamentos pedidos. */
function servidorDoLancamento({ saldo = 7, minimo = 0 }: { saldo?: number; minimo?: number } = {}) {
  const corpos: Record<string, unknown[]> = {};
  const guardar = (caminho: string, corpo: unknown) => {
    corpos[caminho] = [...(corpos[caminho] ?? []), corpo];
  };
  const lancamento = (tipo: string) => async (pedido: Request) => {
    const corpo = (await pedido.json()) as { quantidade: number };
    guardar(tipo, corpo);
    if (corpo.quantidade > saldo && tipo !== 'entradas') {
      return conflito({ quantidade: `O saldo do CF258A em Jundiaí › Almoxarifado é ${saldo}.` });
    }
    return Response.json({ movimento: {}, saldos: [] }, { status: 201 });
  };
  const servidor: ServidorDeTeste = {
    'GET /api/estoque/saldos': () =>
      Response.json({
        itens: [saldoNoAlmoxarifado(saldo, minimo)],
        total: 1,
        proximo: null,
        permite: { movimentar: true },
      }),
    'GET /api/locais': () => Response.json({ locais: LOCAIS, permite: { cadastrarNaRaiz: false } }),
    'GET /api/consumiveis/escolha': (pedido) => {
      const id = new URL(pedido.url).searchParams.get('id');
      const todos = [
        { id: 'cf258a', codigo: 'CF258A', nome: 'HP 58A', tipo: 'toner', cor: 'preto' },
        { id: 'cf258x', codigo: 'CF258X', nome: 'HP 58X', tipo: 'toner', cor: 'preto' },
      ];
      return Response.json({ consumiveis: id ? todos.filter((c) => c.id === id) : todos });
    },
    'GET /api/fornecedores/escolha': () =>
      Response.json({ fornecedores: [{ id: 'hp', nome: 'HP Brasil', cnpj: null }] }),
    'GET /api/estoque/ativos-para-saida': () =>
      Response.json({
        ativos: [
          {
            id: 'pat412',
            rotulo: 'HP LaserJet M404',
            patrimonio: 'PAT-00412',
            local: { id: 'expedicao', caminho: 'Jundiaí › Expedição' },
            sugerido: true,
          },
          {
            id: 'pat500',
            rotulo: 'HP LaserJet M428',
            patrimonio: 'PAT-00500',
            local: { id: 'almoxarifado', caminho: 'Jundiaí › Almoxarifado' },
            sugerido: false,
          },
        ],
      }),
    'GET /api/consumiveis/modelos': () => Response.json({ modelos: [] }),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
    'POST /api/estoque/entradas': lancamento('entradas'),
    'POST /api/estoque/saidas': lancamento('saidas'),
    'POST /api/estoque/transferencias': lancamento('transferencias'),
    'POST /api/estoque/ajustes': lancamento('ajustes'),
    'PUT /api/estoque/minimos/cf258a/almoxarifado': async (pedido) => {
      const corpo = (await pedido.json()) as { minimo: number };
      guardar('minimos', corpo);
      return Response.json({ ...saldoNoAlmoxarifado(saldo), minimo: corpo.minimo });
    },
    'POST /api/consumiveis': async (pedido) => {
      const corpo = (await pedido.json()) as { codigo: string };
      guardar('consumiveis', corpo);
      return Response.json(
        {
          id: 'cf259a',
          codigo: corpo.codigo,
          nome: null,
          tipo: 'toner',
          cor: 'preto',
          rendimento: null,
          situacao: 'ativo',
          criadoEm: '2026-10-21T12:00:00.000Z',
          atualizadoEm: '2026-10-21T12:00:00.000Z',
          fornecedores: [],
          modelos: [],
          permite: { editar: true },
        },
        { status: 201 },
      );
    },
  };
  return { servidor, corpos };
}

const MOVIMENTA_E_EDITA = naOrganizacao(
  'estoque.ver',
  'estoque.movimentar',
  'consumiveis.ver',
  'consumiveis.editar',
);

function abrir(endereco: string, servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[]) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const gaveta = (titulo: string) => screen.findByRole('dialog', { name: titulo });
const texto = (dentro: HTMLElement, rotulo: string) =>
  within(dentro).getByRole('textbox', { name: rotulo }) as HTMLInputElement;

/** Escolhe a opção de uma busca com sugestões. */
async function escolherNaBusca(dentro: HTMLElement, rotulo: string, busca: string, opcao: string) {
  const campo = within(dentro).getByRole('combobox', { name: rotulo });
  campo.focus();
  fireEvent.change(campo, { target: { value: busca } });
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

/** Escolhe um local na árvore pelo filtro. */
async function escolherLocal(dentro: HTMLElement, rotulo: string, filtro: string, caminho: string) {
  const gatilho = () =>
    within(dentro).getByRole('button', { name: new RegExp(`^${rotulo}`) }) as HTMLButtonElement;
  await waitFor(() => expect(gatilho().disabled).toBe(false));
  fireEvent.click(gatilho());
  const painel = await screen.findByRole('dialog', { name: rotulo });
  const campo = within(painel).getByRole('searchbox', { name: 'Filtrar' });
  campo.focus();
  fireEvent.change(campo, { target: { value: filtro } });
  fireEvent.click(await screen.findByRole('option', { name: caminho }));
}

describe('a entrada na gaveta', () => {
  it('lança a entrada com os campos do tipo e volta com "Entrada lançada."', async () => {
    const { servidor, corpos } = servidorDoLancamento();
    const roteador = abrir('/operacao/estoque?lancar=entrada', servidor, MOVIMENTA_E_EDITA);
    const formulario = await gaveta('Nova entrada');
    await escolherNaBusca(formulario, 'Consumível', 'cf258', 'CF258A');
    fireEvent.change(texto(formulario, 'Quantidade'), { target: { value: '10' } });
    await escolherLocal(formulario, 'Destino', 'almox', 'Jundiaí › Almoxarifado');
    await escolherNaBusca(formulario, 'Fornecedor', 'hp', 'HP Brasil');
    fireEvent.change(texto(formulario, 'Nota fiscal'), { target: { value: ' 12345 ' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));

    await waitFor(() => expect(avisos()).toContain('Entrada lançada.'));
    expect(corpos.entradas).toEqual([
      {
        consumivel: 'cf258a',
        quantidade: 10,
        destino: 'almoxarifado',
        fornecedor: 'hp',
        notaFiscal: '12345',
        observacao: null,
      },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova entrada' })).toBeNull());
    expect(roteador.state.location.search).not.toHaveProperty('lancar');
  });

  it('confere pelas regras do domínio antes de mandar, com o motivo em cada campo', async () => {
    const { servidor, corpos } = servidorDoLancamento();
    abrir('/operacao/estoque?lancar=entrada', servidor, MOVIMENTA_E_EDITA);
    const formulario = await gaveta('Nova entrada');
    fireEvent.change(texto(formulario, 'Quantidade'), { target: { value: '2,5' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));
    expect(await within(formulario).findByText('Escolha o consumível.')).toBeTruthy();
    expect(within(formulario).getByText('Use um número inteiro de 1 a 100.000.')).toBeTruthy();
    expect(within(formulario).getByText('Escolha o local.')).toBeTruthy();
    expect(within(formulario).getByText('Escolha o fornecedor.')).toBeTruthy();
    expect(within(formulario).getByText('Informe o número da nota fiscal.')).toBeTruthy();
    expect(corpos.entradas).toBeUndefined();
  });

  it('Toner novo na entrada: o consumível criado na aba volta ao campo, e o resto fica como estava', async () => {
    const { servidor, corpos } = servidorDoLancamento();
    abrir('/operacao/estoque?lancar=entrada', servidor, MOVIMENTA_E_EDITA);
    let formulario = await gaveta('Nova entrada');
    fireEvent.change(texto(formulario, 'Quantidade'), { target: { value: '10' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Cadastrar novo consumível' }));
    await screen.findByRole('heading', { level: 1, name: 'Novo consumível' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Código' }), {
      target: { value: 'CF259A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Toner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    formulario = await gaveta('Nova entrada');
    await waitFor(() =>
      expect(
        (within(formulario).getByRole('combobox', { name: 'Consumível' }) as HTMLInputElement)
          .value,
      ).toBe('CF259A'),
    );
    expect(texto(formulario, 'Quantidade').value).toBe('10');
    expect(corpos.consumiveis).toEqual([expect.objectContaining({ codigo: 'CF259A' })]);
    expect(screen.queryByRole('tablist', { name: 'Abas da janela' })).toBeNull();
  });

  it('quem não edita os consumíveis nem os fornecedores não tem os links de cadastro', async () => {
    const { servidor } = servidorDoLancamento();
    abrir(
      '/operacao/estoque?lancar=entrada',
      servidor,
      naOrganizacao('estoque.ver', 'estoque.movimentar'),
    );
    const formulario = await gaveta('Nova entrada');
    expect(
      within(formulario).queryByRole('button', { name: 'Cadastrar novo consumível' }),
    ).toBeNull();
    expect(
      within(formulario).queryByRole('button', { name: 'Cadastrar novo fornecedor' }),
    ).toBeNull();
  });
});

describe('a saída na gaveta', () => {
  it('aberta pela linha do estoque, vem com o consumível e o local dela', async () => {
    const { servidor } = servidorDoLancamento();
    abrir('/operacao/estoque', servidor, MOVIMENTA_E_EDITA);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Lançar CF258A em Jundiaí › Almoxarifado' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Saída' }));
    const formulario = await gaveta('Nova saída');
    expect(
      (within(formulario).getByRole('combobox', { name: 'Consumível' }) as HTMLInputElement).value,
    ).toBe('CF258A');
    await waitFor(() =>
      expect(within(formulario).getByRole('button', { name: /^Origem/ }).textContent).toContain(
        'Jundiaí › Almoxarifado',
      ),
    );
    expect(await within(formulario).findByText('Saldo em Jundiaí › Almoxarifado: 7')).toBeTruthy();
  });

  it('Impressoras sugeridas na saída: os ativos compatíveis vêm primeiro, como sugeridos', async () => {
    const { servidor } = servidorDoLancamento();
    abrir('/operacao/estoque?lancar=saida&consumivel=cf258a', servidor, MOVIMENTA_E_EDITA);
    const formulario = await gaveta('Nova saída');
    await waitFor(() =>
      expect(
        (within(formulario).getByRole('combobox', { name: 'Consumível' }) as HTMLInputElement)
          .value,
      ).toBe('CF258A'),
    );
    const ativo = within(formulario).getByRole('combobox', { name: 'Ativo' });
    ativo.focus();
    fireEvent.change(ativo, { target: { value: 'pat' } });
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual([
      expect.stringContaining('HP LaserJet M404 · PAT-00412'),
      expect.stringContaining('HP LaserJet M428 · PAT-00500'),
    ]);
    expect(screen.getByText('Compatíveis com o consumível')).toBeTruthy();
  });

  it('mostra o saldo do consumível na origem, perto da quantidade', async () => {
    const { servidor } = servidorDoLancamento({ saldo: 7 });
    abrir('/operacao/estoque?lancar=saida&consumivel=cf258a', servidor, MOVIMENTA_E_EDITA);
    const formulario = await gaveta('Nova saída');
    await escolherLocal(formulario, 'Origem', 'almox', 'Jundiaí › Almoxarifado');
    expect(await within(formulario).findByText('Saldo em Jundiaí › Almoxarifado: 7')).toBeTruthy();
  });

  it('Saída maior que o saldo: a recusa da API fica no campo Quantidade, e o resto fica como estava', async () => {
    const { servidor, corpos } = servidorDoLancamento({ saldo: 2 });
    abrir('/operacao/estoque?lancar=saida&consumivel=cf258a', servidor, MOVIMENTA_E_EDITA);
    const formulario = await gaveta('Nova saída');
    await waitFor(() =>
      expect(
        (within(formulario).getByRole('combobox', { name: 'Consumível' }) as HTMLInputElement)
          .value,
      ).toBe('CF258A'),
    );
    fireEvent.change(texto(formulario, 'Quantidade'), { target: { value: '3' } });
    await escolherLocal(formulario, 'Origem', 'almox', 'Jundiaí › Almoxarifado');
    await escolherNaBusca(formulario, 'Ativo', 'pat', 'HP LaserJet M404 · PAT-00412');
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));

    expect(
      await within(formulario).findByText('O saldo do CF258A em Jundiaí › Almoxarifado é 2.'),
    ).toBeTruthy();
    expect(corpos.saidas).toEqual([
      {
        consumivel: 'cf258a',
        quantidade: 3,
        origem: 'almoxarifado',
        ativo: 'pat412',
        observacao: null,
      },
    ]);
    expect(texto(formulario, 'Quantidade').value).toBe('3');
    expect(avisos()).not.toContain('Saída lançada.');
  });
});

/** Escolhe a opção de uma seleção pelo rótulo dela. */
async function escolherNaSelecao(dentro: HTMLElement, rotulo: RegExp, opcao: string) {
  fireEvent.click(within(dentro).getByRole('button', { name: rotulo }));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

describe('a transferência na gaveta', () => {
  it('Transferência para a Expedição: a origem e o destino do alcance, com o retorno', async () => {
    const { servidor, corpos } = servidorDoLancamento({ saldo: 8 });
    abrir('/operacao/estoque?lancar=transferencia&consumivel=cf258a', servidor, MOVIMENTA_E_EDITA);
    const formulario = await gaveta('Nova transferência');
    fireEvent.change(texto(formulario, 'Quantidade'), { target: { value: '3' } });
    await escolherLocal(formulario, 'Origem', 'almox', 'Jundiaí › Almoxarifado');
    expect(await within(formulario).findByText('Saldo em Jundiaí › Almoxarifado: 8')).toBeTruthy();
    await escolherLocal(formulario, 'Destino', 'almox', 'Jundiaí › Almoxarifado');
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));
    expect(
      await within(formulario).findByText('Escolha um destino diferente da origem.'),
    ).toBeTruthy();
    await escolherLocal(formulario, 'Destino', 'exped', 'Jundiaí › Expedição');
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));

    await waitFor(() => expect(avisos()).toContain('Transferência lançada.'));
    expect(corpos.transferencias).toEqual([
      {
        consumivel: 'cf258a',
        quantidade: 3,
        origem: 'almoxarifado',
        destino: 'expedicao',
        observacao: null,
      },
    ]);
  });
});

describe('o ajuste na gaveta', () => {
  it('Ajuste sem a observação: o motivo Outro pede a observação, e o ajuste vai com ela', async () => {
    const { servidor, corpos } = servidorDoLancamento();
    abrir('/operacao/estoque?lancar=ajuste&consumivel=cf258a', servidor, MOVIMENTA_E_EDITA);
    const formulario = await gaveta('Novo ajuste');
    fireEvent.change(texto(formulario, 'Quantidade'), { target: { value: '1' } });
    await escolherLocal(formulario, 'Local', 'almox', 'Jundiaí › Almoxarifado');
    await escolherNaSelecao(formulario, /Direção/, 'Retirar');
    expect(await within(formulario).findByText('Saldo em Jundiaí › Almoxarifado: 7')).toBeTruthy();
    await escolherNaSelecao(formulario, /Motivo/, 'Outro');
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));
    expect(await within(formulario).findByText('Descreva o motivo na observação.')).toBeTruthy();
    expect(corpos.ajustes).toBeUndefined();

    fireEvent.change(within(formulario).getByRole('textbox', { name: 'Observação' }), {
      target: { value: 'Caixa amassada' },
    });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));
    await waitFor(() => expect(avisos()).toContain('Ajuste lançado.'));
    expect(corpos.ajustes).toEqual([
      {
        consumivel: 'cf258a',
        quantidade: 1,
        local: 'almoxarifado',
        direcao: 'retirar',
        motivo: 'outro',
        observacao: 'Caixa amassada',
      },
    ]);
  });

  it('sem a direção e o motivo, diz o que falta em cada um', async () => {
    const { servidor } = servidorDoLancamento();
    abrir('/operacao/estoque?lancar=ajuste&consumivel=cf258a', servidor, MOVIMENTA_E_EDITA);
    const formulario = await gaveta('Novo ajuste');
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));
    expect(
      await within(formulario).findByText('Escolha se o ajuste acrescenta ou retira.'),
    ).toBeTruthy();
    expect(within(formulario).getByText('Escolha o motivo.')).toBeTruthy();
  });
});

describe('o mínimo na gaveta', () => {
  it('Mínimo zerado: define o mínimo pela linha, com o retorno', async () => {
    const { servidor, corpos } = servidorDoLancamento({ saldo: 2, minimo: 5 });
    abrir('/operacao/estoque', servidor, MOVIMENTA_E_EDITA);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Definir mínimo do CF258A em Jundiaí › Almoxarifado',
      }),
    );
    const formulario = await gaveta('Definir mínimo');
    expect(within(formulario).getByText('CF258A em Jundiaí › Almoxarifado')).toBeTruthy();
    const campo = texto(formulario, 'Mínimo');
    expect(campo.value).toBe('5');
    fireEvent.change(campo, { target: { value: '-1' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));
    expect(
      await within(formulario).findByText('Use um número inteiro de 0 a 100.000.'),
    ).toBeTruthy();
    expect(corpos.minimos).toBeUndefined();

    fireEvent.change(campo, { target: { value: '0' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(avisos()).toContain('Mínimo salvo.'));
    expect(corpos.minimos).toEqual([{ minimo: 0 }]);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Definir mínimo' })).toBeNull(),
    );
  });
});
