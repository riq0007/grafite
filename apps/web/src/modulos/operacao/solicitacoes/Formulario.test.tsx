import { criarDataHora, filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import {
  EXPEDICAO,
  NB0031,
  PAT00412,
  servidorDasSolicitacoes,
  toner,
} from '../../../teste/solicitacoes.ts';

// A nova solicitação na gaveta (spec modulo-operacao, "Formulários das solicitações"; spec
// solicitacoes, "Solicitação" e "Itens do toner"; spec administracao-de-pessoas, "Nomes das pessoas
// para a escolha"; change p4d-solicitacoes, design, decisão 8).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const { formatarData, formatarHora } = criarDataHora();

const LIDO_EM = '2026-10-21T17:02:00.000Z';

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
];

/** A PAT-00412, que imprime só em preto: o CF258A é o compatível dela. */
const IMPRESSORA_412 = {
  ativo: PAT00412,
  local: EXPEDICAO,
  contador: { paginas: 48210, lidoEm: LIDO_EM },
  cores: [
    {
      cor: 'preto',
      sugerido: 'cf258a',
      compativeis: [{ id: 'cf258a', codigo: 'CF258A', nome: 'HP 58A', saldo: 6 }],
    },
    { cor: 'ciano', sugerido: null, compativeis: [] },
    { cor: 'magenta', sugerido: null, compativeis: [] },
    { cor: 'amarelo', sugerido: null, compativeis: [] },
    { cor: 'colorido', sugerido: null, compativeis: [] },
  ],
};

const problema = (status: number, campos: Record<string, string>) =>
  Response.json(
    {
      type: 'urn:grafite:problema:dados-invalidos',
      title: 'Dados inválidos',
      status,
      detail: Object.values(campos)[0],
      codigoDeRastreio: 'R7K2-9QXM',
      campos,
    },
    { status },
  );

/** O servidor da gaveta: as escolhas e o registro, que guarda os pedidos. */
function servidorDaGaveta({ registrar }: { registrar?: (corpo: unknown) => Response } = {}) {
  const corpos: Record<string, unknown[]> = {};
  const guardar = (caminho: string, corpo: unknown) => {
    corpos[caminho] = [...(corpos[caminho] ?? []), corpo];
  };
  const locaisDasPessoas: (string | null)[] = [];
  const { servidor: daLista } = servidorDasSolicitacoes([]);
  const servidor: ServidorDeTeste = {
    ...daLista,
    'GET /api/locais': () => Response.json({ locais: LOCAIS, permite: { cadastrarNaRaiz: false } }),
    'GET /api/pessoas/nomes': (pedido) => {
      locaisDasPessoas.push(new URL(pedido.url).searchParams.get('local'));
      return Response.json({
        pessoas: [{ id: 'joana', nome: 'Joana Prado', doMesmoLocal: true }],
        total: 1,
      });
    },
    'GET /api/solicitacoes/impressoras': () =>
      Response.json({
        itens: [
          {
            id: PAT00412.id,
            rotulo: PAT00412.rotulo,
            patrimonio: PAT00412.patrimonio,
            local: EXPEDICAO,
          },
        ],
      }),
    'GET /api/solicitacoes/impressoras/pat00412': () => Response.json(IMPRESSORA_412),
    'GET /api/ativos': () =>
      Response.json({
        itens: [{ ...NB0031, local: EXPEDICAO }],
        total: 1,
        proximo: null,
      }),
    'GET /api/ativos/nb0031/resumo': () => Response.json({ ...NB0031, local: EXPEDICAO }),
    'GET /api/tipos-de-ativo': () =>
      Response.json({
        tipos: [
          { id: 'notebook', nome: 'Notebook', situacao: 'ativo' },
          { id: 'antigo', nome: 'Desktop antigo', situacao: 'inativo' },
        ],
        permite: { cadastrar: false },
      }),
    'POST /api/solicitacoes': async (pedido) => {
      const corpo = await pedido.json();
      guardar('solicitacoes', corpo);
      return registrar ? registrar(corpo) : Response.json(toner(45), { status: 201 });
    },
    'POST /api/pessoas': async (pedido) => {
      const corpo = await pedido.json();
      guardar('pessoas', corpo);
      return Response.json({ id: 'joana-nova', nome: 'Joana Prado' }, { status: 201 });
    },
  };
  return { servidor, corpos, locaisDasPessoas };
}

const ATENDE = naOrganizacao('solicitacoes.ver', 'solicitacoes.atender', 'ativos.ver');
const ATENDE_E_CADASTRA = naOrganizacao(
  'solicitacoes.ver',
  'solicitacoes.atender',
  'ativos.ver',
  'pessoas.ver',
  'pessoas.editar',
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
const gaveta = () => screen.findByRole('dialog', { name: 'Nova solicitação' });
const texto = (dentro: HTMLElement, rotulo: string) =>
  within(dentro).getByRole('textbox', { name: rotulo }) as HTMLInputElement;

/** Escolhe a opção de uma busca com sugestões. */
async function escolherNaBusca(dentro: HTMLElement, rotulo: string, busca: string, opcao: string) {
  const campo = within(dentro).getByRole('combobox', { name: rotulo });
  campo.focus();
  fireEvent.change(campo, { target: { value: busca } });
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

/** O grupo da impressora na gaveta, pelo nome dela. */
const impressora = (dentro: HTMLElement) =>
  within(dentro).findByRole('group', { name: 'HP LaserJet M404 · PAT-00412' });

describe('a nova solicitação de toner', () => {
  it('Toner com a sugestão: o contador, o CF258A sugerido no preto e o registro, com o retorno', async () => {
    const { servidor, corpos, locaisDasPessoas } = servidorDaGaveta();
    const roteador = abrir('/operacao/solicitacoes?nova=toner', servidor, ATENDE);
    const formulario = await gaveta();
    await escolherNaBusca(
      formulario,
      'Adicionar impressora',
      '00412',
      'HP LaserJet M404 · PAT-00412',
    );
    const grupo = await impressora(formulario);
    const lido = new Date(LIDO_EM);
    expect(
      await within(grupo).findByText(
        `Total de páginas: 48.210, lido em ${formatarData(lido).slice(0, 5)} ${formatarHora(lido)}`,
      ),
    ).toBeTruthy();
    fireEvent.change(texto(grupo, 'Preto'), { target: { value: '1' } });
    expect(within(grupo).getByText('Sugerido: CF258A · HP 58A')).toBeTruthy();
    // Com a impressora escolhida, as pessoas do local dela vêm primeiro.
    await escolherNaBusca(formulario, 'Pedida por', 'joana', 'Joana Prado');
    expect(locaisDasPessoas).toContain('expedicao');
    fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(avisos()).toContain('Solicitação 45 registrada.'));
    expect(corpos.solicitacoes).toEqual([
      {
        tipo: 'toner',
        pessoa: 'joana',
        observacao: null,
        impressoras: ['pat00412'],
        itens: [{ impressora: 'pat00412', cor: 'preto', quantidade: 1, consumivel: null }],
      },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nova solicitação' })).toBeNull(),
    );
    expect(roteador.state.location.search).not.toHaveProperty('nova');
  });

  it('Cor sem compatível: o ciano diz que não há compatível e vai sem o consumível', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    abrir('/operacao/solicitacoes?nova=toner&ativo=pat00412', servidor, ATENDE);
    const formulario = await gaveta();
    const grupo = await impressora(formulario);
    const ciano = texto(grupo, 'Ciano');
    expect(within(grupo).getAllByText('Nenhum compatível dessa cor.')).toHaveLength(4);
    fireEvent.change(ciano, { target: { value: '1' } });
    await escolherNaBusca(formulario, 'Pedida por', 'joana', 'Joana Prado');
    fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar' }));
    await waitFor(() =>
      expect(corpos.solicitacoes).toEqual([
        expect.objectContaining({
          impressoras: ['pat00412'],
          itens: [{ impressora: 'pat00412', cor: 'ciano', quantidade: 1, consumivel: null }],
        }),
      ]),
    );
  });

  it('Cor repetida: a recusa da API fica no campo da cor, e o resto fica como estava', async () => {
    const { servidor } = servidorDaGaveta({
      registrar: () =>
        problema(400, { 'itens.0.cor': 'Essa cor já está pedida para essa impressora.' }),
    });
    abrir('/operacao/solicitacoes?nova=toner&ativo=pat00412', servidor, ATENDE);
    const formulario = await gaveta();
    const grupo = await impressora(formulario);
    fireEvent.change(texto(grupo, 'Preto'), { target: { value: '1' } });
    await escolherNaBusca(formulario, 'Pedida por', 'joana', 'Joana Prado');
    fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar' }));
    expect(
      await within(grupo).findByText('Essa cor já está pedida para essa impressora.'),
    ).toBeTruthy();
    expect(texto(grupo, 'Preto').value).toBe('1');
    expect(screen.getByRole('dialog', { name: 'Nova solicitação' })).toBeTruthy();
  });

  it('confere pelas regras do domínio antes de mandar, com o motivo em cada campo', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    abrir('/operacao/solicitacoes?nova=toner&ativo=pat00412', servidor, ATENDE);
    const formulario = await gaveta();
    const grupo = await impressora(formulario);
    fireEvent.change(texto(grupo, 'Preto'), { target: { value: '100' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar' }));
    expect(await within(formulario).findByText('Escolha quem pediu.')).toBeTruthy();
    expect(within(grupo).getByText('Use um número inteiro de 1 a 99.')).toBeTruthy();
    fireEvent.change(texto(grupo, 'Preto'), { target: { value: '' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar' }));
    expect(
      await within(grupo).findByText('Inclua ao menos um item para cada impressora.'),
    ).toBeTruthy();
    fireEvent.click(within(grupo).getByRole('button', { name: 'Tirar a PAT-00412' }));
    fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar' }));
    expect(await within(formulario).findByText('Escolha a impressora.')).toBeTruthy();
    expect(corpos.solicitacoes).toBeUndefined();
  });

  it('Pessoa nova pelo campo: a pessoa criada na aba volta a Pedida por, e o resto fica como estava', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    abrir('/operacao/solicitacoes?nova=toner&ativo=pat00412', servidor, ATENDE_E_CADASTRA);
    let formulario = await gaveta();
    fireEvent.change(texto(await impressora(formulario), 'Preto'), { target: { value: '1' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Cadastrar nova pessoa' }));
    await screen.findByRole('heading', { level: 1, name: 'Nova pessoa' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Joana Prado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    formulario = await gaveta();
    await waitFor(() =>
      expect(
        (within(formulario).getByRole('combobox', { name: 'Pedida por' }) as HTMLInputElement)
          .value,
      ).toBe('Joana Prado'),
    );
    expect(texto(await impressora(formulario), 'Preto').value).toBe('1');
    expect(corpos.pessoas).toEqual([expect.objectContaining({ nome: 'Joana Prado' })]);
    fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar' }));
    await waitFor(() =>
      expect(corpos.solicitacoes).toEqual([expect.objectContaining({ pessoa: 'joana-nova' })]),
    );
  });

  it('quem não cadastra pessoas não tem o link de cadastro', async () => {
    const { servidor } = servidorDaGaveta();
    abrir('/operacao/solicitacoes?nova=toner', servidor, ATENDE);
    const formulario = await gaveta();
    expect(within(formulario).queryByRole('button', { name: 'Cadastrar nova pessoa' })).toBeNull();
  });
});

describe('a nova solicitação de conserto e de equipamento', () => {
  it('Conserto pela busca: o ativo e o defeito', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    abrir('/operacao/solicitacoes?nova=conserto', servidor, ATENDE);
    const formulario = await gaveta();
    expect(
      (within(formulario).getByRole('radio', { name: 'Conserto' }) as HTMLInputElement).checked,
    ).toBe(true);
    await escolherNaBusca(formulario, 'Pedida por', 'joana', 'Joana Prado');
    await escolherNaBusca(formulario, 'Ativo', 'nb-0031', 'Dell Latitude 5440 · NB-0031');
    fireEvent.change(texto(formulario, 'Defeito'), { target: { value: ' Não liga ' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar' }));
    await waitFor(() =>
      expect(corpos.solicitacoes).toEqual([
        {
          tipo: 'conserto',
          pessoa: 'joana',
          observacao: null,
          ativo: 'nb0031',
          defeito: 'Não liga',
        },
      ]),
    );
  });

  it('o conserto aberto pela ficha do ativo já vem com ele', async () => {
    const { servidor } = servidorDaGaveta();
    abrir('/operacao/solicitacoes?nova=conserto&ativo=nb0031', servidor, ATENDE);
    const formulario = await gaveta();
    await waitFor(() =>
      expect(
        (within(formulario).getByRole('combobox', { name: 'Ativo' }) as HTMLInputElement).value,
      ).toBe('Dell Latitude 5440 · NB-0031'),
    );
  });

  it('o equipamento: o tipo ativo, a quantidade, o motivo e o local, trocando o tipo da solicitação', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    abrir('/operacao/solicitacoes?nova=toner', servidor, ATENDE);
    const formulario = await gaveta();
    await escolherNaBusca(formulario, 'Pedida por', 'joana', 'Joana Prado');
    fireEvent.click(within(formulario).getByRole('radio', { name: 'Equipamento' }));
    fireEvent.click(within(formulario).getByRole('button', { name: /Tipo de ativo/ }));
    expect(screen.queryByRole('option', { name: 'Desktop antigo' })).toBeNull();
    fireEvent.click(await screen.findByRole('option', { name: 'Notebook' }));
    fireEvent.change(texto(formulario, 'Quantidade'), { target: { value: '2' } });
    fireEvent.change(texto(formulario, 'Motivo'), { target: { value: 'Contratação' } });
    const gatilho = () =>
      within(formulario).getByRole('button', { name: /^Local/ }) as HTMLButtonElement;
    await waitFor(() => expect(gatilho().disabled).toBe(false));
    fireEvent.click(gatilho());
    const painel = await screen.findByRole('dialog', { name: 'Local' });
    const filtro = within(painel).getByRole('searchbox', { name: 'Filtrar' });
    filtro.focus();
    fireEvent.change(filtro, { target: { value: 'exped' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Jundiaí › Expedição' }));
    fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar' }));
    await waitFor(() =>
      expect(corpos.solicitacoes).toEqual([
        {
          tipo: 'equipamento',
          pessoa: 'joana',
          observacao: null,
          tipoDeAtivo: 'notebook',
          quantidade: 2,
          motivo: 'Contratação',
          local: 'expedicao',
        },
      ]),
    );
  });
});
