import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { campoDeLocal, escolherLocal } from '../../../teste/escolhas.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Tipo = components['schemas']['TipoDeAtivo'];
type Campo = components['schemas']['Campo'];

const campo = (id: string, rotulo: string, extras: Partial<Campo> = {}): Campo => ({
  id,
  rotulo,
  tipo: 'texto',
  grupo: null,
  configuracao: {},
  restrito: false,
  escrita: 'automatica',
  situacao: 'ativo',
  usadoPor: 1,
  permite: { editar: false },
  ...extras,
});

const IP = campo('c-ip', 'IP', { tipo: 'ip', grupo: 'Rede' });
const CRITICIDADE = campo('c-criticidade', 'Criticidade', {
  tipo: 'lista',
  configuracao: {
    opcoes: [
      { id: 'op-alta', rotulo: 'Alta', situacao: 'ativa' },
      { id: 'op-baixa', rotulo: 'Baixa', situacao: 'ativa' },
    ],
  },
});

const tipo = (id: string, nome: string, extras: Partial<Tipo> = {}): Tipo => ({
  id,
  nome,
  icone: 'impressora',
  capacidades: [],
  configuracaoDasCapacidades: {},
  primeiroCartao: null,
  campos: [],
  situacao: 'ativo',
  permite: { editar: false },
  ...extras,
});

const IMPRESSORA = tipo('impressora', 'Impressora', {
  campos: [
    { campoId: 'c-ip', obrigatorio: true },
    { campoId: 'c-criticidade', obrigatorio: false },
  ],
});
const CAMERA = tipo('camera', 'Câmera', { icone: 'camera', situacao: 'inativo' });
const NOTEBOOK = tipo('notebook', 'Notebook', { icone: 'computador' });

const M404 = {
  id: 'm404',
  tipo: { id: 'impressora', nome: 'Impressora', icone: 'impressora' },
  fabricante: 'HP',
  nome: 'LaserJet M404',
  imagem: { id: 'img-404' },
  situacao: 'ativo',
  permite: { editar: false },
};

// As referências são guardadas pelo id em uuid, que o motor de campos confere.
const JUNDIAI = '0199a6e0-0000-7000-8000-000000000101';
const EXPEDICAO = '0199a6e0-0000-7000-8000-000000000102';
const HP_BRASIL = '0199a6e0-0000-7000-8000-0000000000f1';
const OUTRO_FORNECEDOR = '0199a6e0-0000-7000-8000-0000000000f2';
const LOCADORA_NORTE = '0199a6e0-0000-7000-8000-0000000000f3';

/** O fornecedor que a API devolve ao cadastrar. */
const fornecedorCriado = (id: string, nome: string) => ({
  id,
  nome,
  cnpj: null,
  contato: null,
  email: null,
  telefone: null,
  observacoes: null,
  situacao: 'ativo',
  criadoEm: '2026-10-19T12:00:00.000Z',
  atualizadoEm: '2026-10-19T12:00:00.000Z',
  permite: { editar: true },
});

/** A ficha que a API devolve depois do cadastro. */
const FICHA_CRIADA = {
  id: 'a-novo',
  rotulo: 'HP LaserJet M404',
  tipo: { id: 'impressora', nome: 'Impressora', icone: 'impressora' },
  modelo: { id: 'm404', fabricante: 'HP', nome: 'LaserJet M404', imagem: null },
  patrimonio: 'PAT-00412',
  local: { id: EXPEDICAO, caminho: 'Jundiaí › Expedição' },
  responsavel: null,
  uso: 'em-uso',
  situacao: 'ativo',
  valores: { 'ativo.patrimonio': 'PAT-00412', 'ativo.uso': 'em-uso', 'c-ip': '10.0.0.5' },
  estado: {},
  referencias: { pessoas: {}, locais: { [EXPEDICAO]: 'Jundiaí › Expedição' }, ativos: {} },
  permite: { editar: true, verRestritos: false, editarRestritos: false },
};

const LOCAIS = {
  locais: [
    { id: JUNDIAI, paiId: null, nome: 'Jundiaí', tipo: 'unidade', situacao: 'ativo' },
    { id: EXPEDICAO, paiId: JUNDIAI, nome: 'Expedição', tipo: 'setor', situacao: 'ativo' },
  ].map((local) => ({ ...local, permite: { editar: true } })),
  permite: { cadastrarNaRaiz: true },
};

const problema = (status: number, detalhe: string, campos?: object) =>
  Response.json(
    {
      type: 'urn:grafite:problema:conflito',
      title: 'Conflito',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      ...(campos && { campos }),
    },
    { status },
  );

const catalogo = (tipos: Tipo[], extras: ServidorDeTeste = {}): ServidorDeTeste => ({
  'GET /api/tipos-de-ativo': () => Response.json({ tipos, permite: { cadastrar: false } }),
  'GET /api/campos': () =>
    Response.json({ campos: [IP, CRITICIDADE], permite: { cadastrar: false } }),
  'GET /api/modelos': () =>
    Response.json({ itens: [M404], proximo: null, total: 1, permite: { cadastrar: false } }),
  'GET /api/modelos/m404': () => Response.json(M404),
  'GET /api/locais': () => Response.json(LOCAIS),
  'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  // Sem rascunho guardado, e o que a tela guarda vai e volta como na API.
  'GET /api/ativos/rascunho': () => Response.json({ rascunho: null }),
  'PUT /api/ativos/rascunho': () => Response.json({ atualizadoEm: new Date().toISOString() }),
  'DELETE /api/ativos/rascunho': () => new Response(null, { status: 204 }),
  ...extras,
});

function abrir(
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('ativos.editar', 'ativos.ver'),
  endereco = '/ativos/novo',
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

/** O botão de uma seleção: o da trava do campo também leva o nome dele. */
const selecao = (rotulo: RegExp) =>
  screen
    .getAllByRole('button', { name: rotulo })
    .find((botao) => botao.getAttribute('aria-haspopup') === 'listbox') as HTMLElement;

async function escolher(rotulo: RegExp, opcao: string) {
  fireEvent.click(selecao(rotulo));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

const listaDasEtapas = () => screen.getByRole('navigation', { name: 'Etapas do cadastro' });

/** A etapa pelo nome, como "Rede", na lista das etapas. */
const etapa = (nome: string) =>
  within(listaDasEtapas()).getByRole('button', { name: new RegExp(`^\\d+ · ${nome}$`) });

/** A situação de uma etapa, que o leitor de tela lê como a descrição dela. */
const descricao = (botao: HTMLElement) =>
  document.getElementById(botao.getAttribute('aria-describedby') ?? '')?.textContent ?? '';

const situacoes = () =>
  within(listaDasEtapas())
    .getAllByRole('button')
    .map((botao) => {
      const nome = document.getElementById(botao.getAttribute('aria-labelledby') ?? '');
      const situacao = document.getElementById(botao.getAttribute('aria-describedby') ?? '');
      return `${nome?.textContent} — ${situacao?.textContent ?? ''}`;
    });

/** Abre a etapa pela lista e espera o nome dela no painel. */
async function abrirEtapa(nome: string) {
  fireEvent.click(etapa(nome));
  return screen.findByRole('heading', { level: 2, name: nome });
}

async function escolherOTipo(nome = 'Impressora') {
  await screen.findByRole('heading', { level: 1, name: 'Novo ativo' });
  fireEvent.click(await screen.findByRole('button', { name: /Tipo do ativo/ }));
  fireEvent.click(await screen.findByRole('option', { name: nome }));
  await waitFor(() => expect(etapa('Modelo').getAttribute('aria-disabled')).toBeNull());
}

/** Escolhe o modelo pela busca da etapa Modelo. */
async function escolherOModelo(texto: string, opcao: string) {
  await abrirEtapa('Modelo');
  const campo = screen.getByRole('combobox', { name: 'Modelo' });
  campo.focus();
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

const preencher = (rotulo: string, valor: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: rotulo }), { target: { value: valor } });

describe('cadastro de ativo', () => {
  it('sem tipos ativos, diz isso, e quem cuida do catálogo cadastra o tipo numa aba, que volta escolhido', async () => {
    const tipos = [CAMERA];
    abrir(
      catalogo(tipos, {
        'GET /api/tipos-de-ativo': () => Response.json({ tipos, permite: { cadastrar: true } }),
        'GET /api/capacidades': () => Response.json({ capacidades: [] }),
        'POST /api/tipos-de-ativo': async (pedido) => {
          const corpo = (await pedido.json()) as { nome: string };
          const criado = tipo('notebook', corpo.nome, { icone: 'computador' });
          tipos.push(criado);
          return Response.json(criado, { status: 201 });
        },
      }),
      naOrganizacao('ativos.editar', 'ativos.ver', 'catalogo.administrar'),
    );
    expect(await screen.findByText('Nenhum tipo de ativo ainda.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo tipo' }));
    await screen.findByRole('heading', { level: 1, name: 'Novo tipo' });
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Notebook' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Computador' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(selecao(/Tipo do ativo/).textContent).toContain('Notebook'));
    expect(descricao(etapa('Tipo'))).toBe('Notebook');
    expect(screen.queryByRole('tablist', { name: 'Abas da janela' })).toBeNull();
    // Quem cuida do catálogo tem o link também na etapa do Tipo.
    expect(screen.getByRole('button', { name: 'Cadastrar novo tipo' })).toBeTruthy();
  });

  it('sem tipos ativos e sem cuidar do catálogo, diz quem os cadastra, sem a ação', async () => {
    abrir(catalogo([CAMERA]));
    expect(
      await screen.findByText('Quem cuida do catálogo cadastra os tipos de ativo.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadastrar novo tipo' })).toBeNull();
  });

  it('antes do tipo, só o Tipo abre, e as outras etapas dizem por quê', async () => {
    abrir(catalogo([CAMERA, IMPRESSORA]));
    await screen.findByRole('navigation', { name: 'Etapas do cadastro' });
    expect(situacoes()).toEqual([
      '1 · Tipo — Falta escolher',
      '2 · Modelo — Escolha o tipo antes',
      '3 · Identificação — Escolha o tipo antes',
      '4 · Uso — Escolha o tipo antes',
      '5 · Administrativo — Escolha o tipo antes',
    ]);
    expect(etapa('Modelo').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para Modelo' }));
    expect(await screen.findByText('Escolha o tipo do ativo.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Tipo' })).toBeTruthy();
  });

  it('as etapas da impressora, na ordem da ficha, cada uma com o que falta', async () => {
    abrir(catalogo([CAMERA, IMPRESSORA]));
    await escolherOTipo();
    expect(situacoes()).toEqual([
      '1 · Tipo — Impressora',
      '2 · Modelo — Opcional',
      '3 · Identificação — Opcional',
      '4 · Uso — Preenchida',
      '5 · Rede — Falta: IP',
      '6 · Outros — Opcional',
      '7 · Administrativo — Opcional',
    ]);
    expect(etapa('Tipo').getAttribute('aria-current')).toBe('step');
  });

  it('"Continuar para …" e "Voltar" andam pelas etapas, com o foco no nome dela, e o Enter num campo continua', async () => {
    abrir(catalogo([IMPRESSORA]));
    await escolherOTipo();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para Modelo' }));
    const modelo = await screen.findByRole('heading', { level: 2, name: 'Modelo' });
    await waitFor(() => expect(document.activeElement).toBe(modelo));
    expect(etapa('Modelo').getAttribute('aria-current')).toBe('step');

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    const tipoDoAtivo = await screen.findByRole('heading', { level: 2, name: 'Tipo' });
    await waitFor(() => expect(document.activeElement).toBe(tipoDoAtivo));
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();

    await abrirEtapa('Identificação');
    preencher('Patrimônio', 'PAT-00412');
    fireEvent.submit(screen.getByRole('textbox', { name: 'Patrimônio' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Uso' })).toBeTruthy();
    expect(descricao(etapa('Identificação'))).toBe('Preenchida');
  });

  it('o modelo é procurado pelo nome, e o painel mostra a imagem dele, o fabricante e o tipo', async () => {
    const buscas: string[] = [];
    abrir(
      catalogo([IMPRESSORA], {
        'GET /api/modelos': (pedido) => {
          const parametros = new URL(pedido.url).searchParams;
          buscas.push(`${parametros.get('tipo')}:${parametros.get('busca') ?? ''}`);
          return Response.json({ itens: [M404], proximo: null, total: 1, permite: {} });
        },
      }),
    );
    await escolherOTipo();
    await escolherOModelo('laser', 'HP LaserJet M404');
    expect(buscas).toContain('impressora:laser');
    expect(await screen.findByText('Fabricante: HP')).toBeTruthy();
    expect(screen.getByText('Tipo: Impressora')).toBeTruthy();
    const imagem = await screen.findByRole('img', { name: 'Imagem de HP LaserJet M404' });
    expect(imagem.getAttribute('src')).toBe('/api/modelos/m404/imagem/img-404/256');
    expect(descricao(etapa('Modelo'))).toBe('HP LaserJet M404');
  });

  it('"Cadastrar" com o IP vazio abre a etapa Rede, com a recusa e o foco no IP', async () => {
    const corpos: unknown[] = [];
    abrir(
      catalogo([IMPRESSORA], {
        'POST /api/ativos': async (pedido) => {
          corpos.push(await pedido.json());
          return Response.json(FICHA_CRIADA, { status: 201 });
        },
      }),
    );
    await escolherOTipo();
    await abrirEtapa('Identificação');
    preencher('Patrimônio', 'PAT-00412');
    await abrirEtapa('Administrativo');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Rede' })).toBeTruthy();
    const ip = screen.getByRole('textbox', { name: 'IP' });
    expect(ip.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Preencha este campo.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(ip));
    expect(corpos).toEqual([]);
    await abrirEtapa('Identificação');
    expect((screen.getByRole('textbox', { name: 'Patrimônio' }) as HTMLInputElement).value).toBe(
      'PAT-00412',
    );
  });

  it('cadastra com o modelo, os valores e a trava, de etapa em etapa', async () => {
    const corpos: unknown[] = [];
    const roteador = abrir(
      catalogo([IMPRESSORA], {
        'POST /api/ativos': async (pedido) => {
          corpos.push(await pedido.json());
          return Response.json(FICHA_CRIADA, { status: 201 });
        },
        'GET /api/ativos/a-novo': () => Response.json(FICHA_CRIADA),
      }),
    );
    await escolherOTipo();
    await escolherOModelo('hp', 'HP LaserJet M404');
    await abrirEtapa('Identificação');
    preencher('Patrimônio', 'PAT-00412');
    fireEvent.click(screen.getByRole('button', { name: 'Trava de Patrimônio' }));
    await abrirEtapa('Uso');
    await escolherLocal('Local', 'Jundiaí › Expedição');
    await abrirEtapa('Rede');
    preencher('IP', '10.0.0.5');
    await abrirEtapa('Outros');
    await escolher(/Criticidade/, 'Alta');
    await abrirEtapa('Administrativo');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(corpos).toHaveLength(1));
    expect(corpos[0]).toEqual({
      tipoId: 'impressora',
      modeloId: 'm404',
      valores: {
        'ativo.patrimonio': 'PAT-00412',
        'ativo.uso': 'em-uso',
        'ativo.local': EXPEDICAO,
        'c-ip': '10.0.0.5',
        'c-criticidade': 'op-alta',
      },
      travas: { 'ativo.patrimonio': true },
    });
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ativos/a-novo'));
    expect(avisos()).toContain('Ativo cadastrado.');
  });

  it('trocar o tipo com algo preenchido pergunta, e só troca, limpando as etapas, se a pessoa confirmar', async () => {
    abrir(catalogo([IMPRESSORA, NOTEBOOK]));
    await escolherOTipo();
    await abrirEtapa('Identificação');
    preencher('Patrimônio', 'PAT-00412');
    await abrirEtapa('Tipo');
    await escolher(/Tipo do ativo/, 'Notebook');
    const pergunta = await screen.findByRole('alertdialog', { name: 'Trocar o tipo?' });
    expect(within(pergunta).getByText('O que foi preenchido nas outras etapas sai.')).toBeTruthy();
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Manter o tipo' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(selecao(/Tipo do ativo/).textContent).toContain('Impressora');

    await escolher(/Tipo do ativo/, 'Notebook');
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Trocar o tipo' }),
    );
    await waitFor(() => expect(selecao(/Tipo do ativo/).textContent).toContain('Notebook'));
    expect(screen.queryByText(/Rede/)).toBeNull();
    await abrirEtapa('Identificação');
    expect((screen.getByRole('textbox', { name: 'Patrimônio' }) as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('os campos que apontam outro cadastro mostram o link só para quem pode criá-lo', async () => {
    abrir(
      catalogo([CAMERA, IMPRESSORA]),
      naOrganizacao('ativos.editar', 'ativos.ver', 'modelos.editar', 'locais.editar'),
    );
    await escolherOTipo();
    expect(screen.queryByRole('button', { name: 'Cadastrar novo tipo' })).toBeNull();
    await abrirEtapa('Modelo');
    expect(screen.getByRole('button', { name: 'Cadastrar novo modelo' })).toBeTruthy();
    await abrirEtapa('Uso');
    expect(screen.getByRole('button', { name: 'Cadastrar novo local' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadastrar nova pessoa' })).toBeNull();
  });

  it('o Responsável cadastra a pessoa numa aba e volta com ela escolhida', async () => {
    abrir(
      catalogo([CAMERA, IMPRESSORA], {
        'GET /api/pessoas/nomes': () => Response.json({ pessoas: [], total: 0 }),
        'POST /api/pessoas': () =>
          Response.json(
            { id: '0199a6e0-0000-7000-8000-000000000201', nome: 'Ana Souza' },
            {
              status: 201,
            },
          ),
      }),
      naOrganizacao('ativos.editar', 'ativos.ver', 'pessoas.editar', 'pessoas.ver'),
    );
    await escolherOTipo();
    await abrirEtapa('Uso');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar nova pessoa' }));
    await screen.findByRole('heading', { level: 1, name: 'Nova pessoa' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Ana Souza' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    const responsavel = await screen.findByRole('combobox', { name: 'Responsável' });
    await waitFor(() => expect((responsavel as HTMLInputElement).value).toBe('Ana Souza'));
    await waitFor(() => expect(document.activeElement).toBe(responsavel));
  });

  it('o Fornecedor escolhe entre os ativos e cadastra o fornecedor numa aba, com o resto da etapa como estava', async () => {
    const { guardados, rotas } = servidorDoRascunho(null);
    abrir(
      catalogo([IMPRESSORA], {
        ...rotas,
        'GET /api/fornecedores/escolha': () =>
          Response.json({
            fornecedores: [
              { id: HP_BRASIL, nome: 'HP Brasil', cnpj: '12.345.678/0001-95' },
              { id: OUTRO_FORNECEDOR, nome: 'Assistência Rápida', cnpj: null },
            ],
          }),
        'POST /api/fornecedores': () =>
          Response.json(fornecedorCriado(LOCADORA_NORTE, 'Locadora Norte'), { status: 201 }),
      }),
      naOrganizacao('ativos.editar', 'ativos.ver', 'fornecedores.ver', 'fornecedores.editar'),
    );
    await escolherOTipo();
    await abrirEtapa('Administrativo');
    const fornecedor = screen.getByRole('combobox', { name: 'Fornecedor' }) as HTMLInputElement;
    fornecedor.focus();
    // A busca acha pelo nome e pelo começo do CNPJ.
    fireEvent.change(fornecedor, { target: { value: '12.345' } });
    fireEvent.click(await screen.findByRole('option', { name: 'HP Brasil' }));
    await waitFor(() => expect(fornecedor.value).toBe('HP Brasil'));
    preencher('Nota fiscal', 'NF-1234');

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo fornecedor' }));
    await screen.findByRole('heading', { level: 1, name: 'Novo fornecedor' });
    preencher('Nome', 'Locadora Norte');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    const devolvido = (await screen.findByRole('combobox', {
      name: 'Fornecedor',
    })) as HTMLInputElement;
    await waitFor(() => expect(devolvido.value).toBe('Locadora Norte'));
    expect((screen.getByRole('textbox', { name: 'Nota fiscal' }) as HTMLInputElement).value).toBe(
      'NF-1234',
    );
    // O rascunho guarda o nome do fornecedor escolhido, para o cadastro retomado o mostrar.
    await waitFor(() =>
      expect(guardados.at(-1)).toMatchObject({
        valores: { 'ativo.fornecedor': LOCADORA_NORTE, 'ativo.nota-fiscal': 'NF-1234' },
        nomes: { [LOCADORA_NORTE]: 'Locadora Norte' },
      }),
    );
  });

  it('o rascunho retomado mostra o fornecedor pelo nome guardado', async () => {
    abrir(
      catalogo(
        [IMPRESSORA],
        servidorDoRascunho({
          ...RASCUNHO,
          valores: { ...RASCUNHO.valores, 'ativo.fornecedor': HP_BRASIL },
          nomes: { [HP_BRASIL]: 'HP Brasil' },
          etapa: 'administrativo',
        }).rotas,
      ),
    );
    await screen.findByRole('heading', { level: 2, name: 'Administrativo' });
    expect((screen.getByRole('combobox', { name: 'Fornecedor' }) as HTMLInputElement).value).toBe(
      'HP Brasil',
    );
  });

  it('o Novo modelo pedido pela etapa Modelo abre com o tipo do ativo, que não muda', async () => {
    abrir(
      catalogo([CAMERA, IMPRESSORA], {
        'GET /api/modelos/fabricantes': () => Response.json({ fabricantes: ['HP'], doTipo: [] }),
      }),
      naOrganizacao('ativos.editar', 'ativos.ver', 'modelos.editar'),
    );
    await escolherOTipo();
    await abrirEtapa('Modelo');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo modelo' }));
    await screen.findByRole('heading', { level: 1, name: 'Novo modelo' });
    const aba = screen.getByRole('tabpanel', { name: 'Novo modelo' });
    expect(await within(aba).findByText('Tipo: Impressora')).toBeTruthy();
  });

  it('a partir da origem do local, o cadastro diz onde e traz o local preenchido', async () => {
    const corpos: unknown[] = [];
    abrir(
      catalogo([IMPRESSORA], {
        [`GET /api/locais/${EXPEDICAO}/resumo`]: () =>
          Response.json({
            id: EXPEDICAO,
            caminho: 'Jundiaí › Expedição',
            tipo: 'setor',
            situacao: 'ativo',
            ativos: null,
            pessoas: null,
          }),
        'POST /api/ativos': async (pedido) => {
          corpos.push(await pedido.json());
          return Response.json(FICHA_CRIADA, { status: 201 });
        },
        'GET /api/ativos/a-novo': () => Response.json(FICHA_CRIADA),
      }),
      undefined,
      `/ativos/novo?origem=local:${EXPEDICAO}`,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Novo ativo em Expedição' }),
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Tipo do ativo/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Impressora' }));
    await abrirEtapa('Uso');
    await waitFor(() => expect(campoDeLocal('Local').textContent).toContain('Expedição'));
    await abrirEtapa('Rede');
    preencher('IP', '10.0.0.5');
    await abrirEtapa('Administrativo');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(corpos).toHaveLength(1));
    expect(corpos[0]).toMatchObject({ valores: { 'ativo.local': EXPEDICAO } });
  });

  it('a partir da origem do modelo, o tipo e o modelo vêm escolhidos', async () => {
    const corpos: unknown[] = [];
    abrir(
      catalogo([IMPRESSORA], {
        'GET /api/modelos/m404/resumo': () =>
          Response.json({
            id: 'm404',
            fabricante: 'HP',
            nome: 'LaserJet M404',
            imagem: null,
            situacao: 'ativo',
            tipo: { id: 'impressora', nome: 'Impressora', icone: 'impressora' },
            ativos: null,
          }),
        'POST /api/ativos': async (pedido) => {
          corpos.push(await pedido.json());
          return Response.json(FICHA_CRIADA, { status: 201 });
        },
        'GET /api/ativos/a-novo': () => Response.json(FICHA_CRIADA),
      }),
      undefined,
      '/ativos/novo?origem=modelo:m404',
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Novo ativo do modelo HP LaserJet M404',
      }),
    ).toBeTruthy();
    await waitFor(() => expect(descricao(etapa('Modelo'))).toBe('HP LaserJet M404'));
    expect(descricao(etapa('Tipo'))).toBe('Impressora');
    await abrirEtapa('Rede');
    preencher('IP', '10.0.0.5');
    await abrirEtapa('Administrativo');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(corpos).toHaveLength(1));
    expect(corpos[0]).toMatchObject({ tipoId: 'impressora', modeloId: 'm404' });
  });

  it('a recusa da API abre a etapa do campo, com a recusa nele, e o resto continua preenchido', async () => {
    abrir(
      catalogo([IMPRESSORA], {
        'POST /api/ativos': () =>
          problema(409, 'Já existe um ativo com este patrimônio.', {
            'valores.ativo.patrimonio': 'Já existe um ativo com este patrimônio.',
          }),
      }),
    );
    await escolherOTipo();
    await abrirEtapa('Identificação');
    preencher('Patrimônio', 'pat-00412');
    await abrirEtapa('Rede');
    preencher('IP', '10.0.0.5');
    await abrirEtapa('Administrativo');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Já existe um ativo com este patrimônio.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Identificação' })).toBeTruthy();
    const patrimonio = screen.getByRole('textbox', { name: 'Patrimônio' }) as HTMLInputElement;
    expect(patrimonio.value).toBe('pat-00412');
    expect(patrimonio.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(patrimonio));
    await abrirEtapa('Rede');
    expect((screen.getByRole('textbox', { name: 'IP' }) as HTMLInputElement).value).toBe(
      '10.0.0.5',
    );
  });

  it('o arquivo e a imagem aparecem com "Envie depois de cadastrar o ativo.", e não vão no cadastro', async () => {
    const NOTA_FISCAL = campo('c-nf', 'PDF da nota fiscal', { tipo: 'arquivo' });
    const ETIQUETA = campo('c-etiqueta', 'Foto da etiqueta', { tipo: 'imagem' });
    const COM_ARQUIVOS = tipo('impressora', 'Impressora', {
      campos: [
        { campoId: 'c-ip', obrigatorio: false },
        { campoId: 'c-nf', obrigatorio: false },
        { campoId: 'c-etiqueta', obrigatorio: false },
      ],
    });
    const corpos: unknown[] = [];
    abrir(
      catalogo([COM_ARQUIVOS], {
        'GET /api/campos': () =>
          Response.json({
            campos: [IP, CRITICIDADE, NOTA_FISCAL, ETIQUETA],
            permite: { cadastrar: false },
          }),
        'POST /api/ativos': async (pedido) => {
          corpos.push(await pedido.json());
          return Response.json(FICHA_CRIADA, { status: 201 });
        },
        'GET /api/ativos/a-novo': () => Response.json(FICHA_CRIADA),
      }),
    );
    await escolherOTipo();
    await abrirEtapa('Outros');
    for (const nome of ['PDF da nota fiscal', 'Foto da etiqueta']) {
      const grupo = screen.getByRole('group', { name: nome });
      expect(within(grupo).getByText('Envie depois de cadastrar o ativo.')).toBeTruthy();
      expect(within(grupo).queryByRole('button')).toBeNull();
    }
    expect(descricao(etapa('Outros'))).toBe('Opcional');
    await abrirEtapa('Identificação');
    preencher('Patrimônio', 'PAT-00412');
    await abrirEtapa('Administrativo');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(corpos).toHaveLength(1));
    expect(corpos[0]).toEqual({
      tipoId: 'impressora',
      valores: { 'ativo.patrimonio': 'PAT-00412', 'ativo.uso': 'em-uso' },
      travas: {},
    });
  });

  it('o título do cadastro sai da vista com a barra das abas; o da falha, não', async () => {
    const tituloDaTela = () => screen.getByRole('heading', { level: 1, name: 'Novo ativo' });
    abrir(
      catalogo([IMPRESSORA], {
        'GET /api/ativos/rascunho': () => problema(500, 'Erro interno.'),
      }),
    );
    await screen.findByRole('button', { name: 'Tentar de novo' });
    expect(tituloDaTela().hasAttribute('data-ocultar-com-abas')).toBe(false);
    cleanup();

    abrir(catalogo([CAMERA, IMPRESSORA]));
    await screen.findByRole('navigation', { name: 'Etapas do cadastro' });
    expect(tituloDaTela().hasAttribute('data-ocultar-com-abas')).toBe(true);
  });

  it('sem ativos.editar, o cadastro diz que a conta não tem acesso', async () => {
    abrir(catalogo([IMPRESSORA]), naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso ao cadastro de ativos.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadastrar' })).toBeNull();
    // A lista do grupo do Ativos não aparece para quem não pode.
    expect(within(document.body).queryByRole('textbox', { name: 'Patrimônio' })).toBeNull();
  });
});

/** Um rascunho guardado: o tipo, o patrimônio e a etapa da Rede aberta. */
const RASCUNHO = {
  tipoId: 'impressora',
  modeloId: null,
  valores: { 'ativo.patrimonio': 'PAT-00412', 'ativo.uso': 'em-uso' } as Record<string, string>,
  travas: {},
  nomes: {} as Record<string, string>,
  etapa: 'organizacao:Rede',
  origem: null as string | null,
  atualizadoEm: '2026-10-18T15:10:00.000Z',
};

/** O servidor do rascunho: o guardado, os corpos dos PUT e quantos DELETE chegaram. */
function servidorDoRascunho(guardado: typeof RASCUNHO | null) {
  const guardados: unknown[] = [];
  let apagados = 0;
  const rotas: ServidorDeTeste = {
    'GET /api/ativos/rascunho': () => Response.json({ rascunho: guardado }),
    'PUT /api/ativos/rascunho': async (pedido: Request) => {
      guardados.push(await pedido.json());
      return Response.json({ atualizadoEm: new Date().toISOString() });
    },
    'DELETE /api/ativos/rascunho': () => {
      apagados += 1;
      return new Response(null, { status: 204 });
    },
  };
  return { guardados, apagados: () => apagados, rotas };
}

const RESUMO_DA_EXPEDICAO: ServidorDeTeste = {
  [`GET /api/locais/${EXPEDICAO}/resumo`]: () =>
    Response.json({
      id: EXPEDICAO,
      caminho: 'Jundiaí › Expedição',
      tipo: 'setor',
      situacao: 'ativo',
      ativos: null,
      pessoas: null,
    }),
};

describe('o rascunho do cadastro', () => {
  it('sem o rascunho lido, mostra a falha com "Tentar de novo", e não começa vazio', async () => {
    let falhar = true;
    abrir(
      catalogo([IMPRESSORA], {
        'GET /api/ativos/rascunho': () =>
          falhar ? problema(500, 'Erro interno.') : Response.json({ rascunho: RASCUNHO }),
      }),
    );
    const tentar = await screen.findByRole('button', { name: 'Tentar de novo' });
    expect(screen.queryByRole('navigation', { name: 'Etapas do cadastro' })).toBeNull();
    falhar = false;
    fireEvent.click(tentar);
    expect(await screen.findByRole('heading', { level: 2, name: 'Rede' })).toBeTruthy();
  });

  it('retoma o rascunho na etapa em que parou, com a hora em que foi guardado', async () => {
    abrir(catalogo([IMPRESSORA], servidorDoRascunho(RASCUNHO).rotas));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rede' })).toBeTruthy();
    expect(descricao(etapa('Tipo'))).toBe('Impressora');
    expect(descricao(etapa('Identificação'))).toBe('Preenchida');
    expect(screen.getByText(/^Rascunho guardado às \d{2}:\d{2}$/)).toBeTruthy();
    await abrirEtapa('Identificação');
    expect((screen.getByRole('textbox', { name: 'Patrimônio' }) as HTMLInputElement).value).toBe(
      'PAT-00412',
    );
  });

  it('guarda o que a pessoa preenche, a partir do tipo, e diz quando guardou', async () => {
    const servidor = servidorDoRascunho(null);
    abrir(catalogo([IMPRESSORA], servidor.rotas));
    await escolherOTipo();
    await abrirEtapa('Identificação');
    preencher('Patrimônio', 'PAT-00412');
    expect(await screen.findByText('Guardando o rascunho…')).toBeTruthy();
    expect(await screen.findByText('Rascunho guardado agora', {}, { timeout: 3_000 })).toBeTruthy();
    expect(servidor.guardados.at(-1)).toMatchObject({
      tipoId: 'impressora',
      valores: { 'ativo.patrimonio': 'PAT-00412' },
      etapa: 'identificacao',
    });
  });

  it('com a mesma origem do rascunho, retoma sem perguntar', async () => {
    const origem = `local:${EXPEDICAO}`;
    abrir(
      catalogo([IMPRESSORA], {
        ...RESUMO_DA_EXPEDICAO,
        ...servidorDoRascunho({ ...RASCUNHO, origem }).rotas,
      }),
      undefined,
      `/ativos/novo?origem=${origem}`,
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Rede' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Continuar o cadastro começado?' })).toBeNull();
  });

  it('com outra origem, pergunta; "Começar um novo" descarta o rascunho e começa pela origem', async () => {
    const servidor = servidorDoRascunho(RASCUNHO);
    abrir(
      catalogo([IMPRESSORA], { ...RESUMO_DA_EXPEDICAO, ...servidor.rotas }),
      undefined,
      `/ativos/novo?origem=local:${EXPEDICAO}`,
    );
    const pergunta = await screen.findByRole('dialog', {
      name: 'Continuar o cadastro começado?',
    });
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Começar um novo' }));
    await screen.findByRole('navigation', { name: 'Etapas do cadastro' });
    expect(servidor.apagados()).toBe(1);
    expect(descricao(etapa('Tipo'))).toBe('Falta escolher');
    expect(screen.getByRole('heading', { level: 1, name: 'Novo ativo em Expedição' })).toBeTruthy();
    await escolher(/Tipo do ativo/, 'Impressora');
    await abrirEtapa('Uso');
    await waitFor(() => expect(campoDeLocal('Local').textContent).toContain('Expedição'));
  });

  it('"Continuar o começado" retoma o rascunho e tira a origem do endereço', async () => {
    const servidor = servidorDoRascunho(RASCUNHO);
    const roteador = abrir(
      catalogo([IMPRESSORA], { ...RESUMO_DA_EXPEDICAO, ...servidor.rotas }),
      undefined,
      `/ativos/novo?origem=local:${EXPEDICAO}`,
    );
    const pergunta = await screen.findByRole('dialog', {
      name: 'Continuar o cadastro começado?',
    });
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Continuar o começado' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rede' })).toBeTruthy();
    expect(roteador.state.location.search).toEqual({});
    expect(servidor.apagados()).toBe(0);
  });

  it('"Descartar o rascunho" pede confirmação, apaga o rascunho e recomeça vazio', async () => {
    const servidor = servidorDoRascunho(RASCUNHO);
    abrir(catalogo([IMPRESSORA], servidor.rotas));
    await screen.findByRole('heading', { level: 2, name: 'Rede' });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar o rascunho' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Descartar o rascunho?' });
    expect(
      within(confirmacao).getByText('O que foi preenchido sai, e o cadastro recomeça vazio.'),
    ).toBeTruthy();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(descricao(etapa('Tipo'))).toBe('Falta escolher'));
    expect(servidor.apagados()).toBe(1);
    expect(screen.queryByRole('button', { name: 'Descartar o rascunho' })).toBeNull();
  });
});
