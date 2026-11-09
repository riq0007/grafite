import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { escolherLocal } from '../../../teste/escolhas.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

// A tela do acesso remoto abre a sessão pelo noVNC, que vem sob demanda: o de verdade carregava no
// meio do teste e abria a conexão com a ponte depois dele. Aqui a sessão é simulada, como nos testes
// da tela; o noVNC tem os testes dele em remoto/sessao.test.ts.
const { sessoesAbertas } = vi.hoisted(() => ({ sessoesAbertas: [] as string[] }));
vi.mock('../remoto/sessao.ts', async (original) => ({
  ...(await original<typeof import('../remoto/sessao.ts')>()),
  abrirSessaoRemota: (_tela: HTMLElement, endereco: string) => {
    sessoesAbertas.push(endereco);
    return {
      enviarSenha: () => {},
      ctrlAltDel: () => {},
      ajustar: () => {},
      desconectar: () => {},
    };
  },
}));

afterEach(() => {
  cleanup();
  sessoesAbertas.length = 0;
  vi.restoreAllMocks();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Ficha = components['schemas']['FichaDoAtivo'];
type Campo = components['schemas']['Campo'];

const EXPEDICAO = '0199a6e0-0000-7000-8000-000000000102';
const JOAO = '0199a6e0-0000-7000-8000-000000000201';
const ANA = '0199a6e0-0000-7000-8000-0000000000c1';

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

const CAMPOS = [
  campo('c-ip', 'IP', { tipo: 'ip', grupo: 'Rede' }),
  campo('c-custo', 'Custo do contrato', { tipo: 'moeda', restrito: true }),
];

const IMPRESSORA = {
  id: 'impressora',
  nome: 'Impressora',
  icone: 'impressora' as const,
  capacidades: [],
  campos: [
    { campoId: 'c-ip', obrigatorio: true },
    { campoId: 'c-custo', obrigatorio: false },
  ],
  situacao: 'ativo' as const,
  permite: { editar: false },
};

const fichaDe = (extras: Partial<Ficha> = {}): Ficha => ({
  id: 'a1',
  rotulo: 'HP LaserJet M404',
  tipo: { id: 'impressora', nome: 'Impressora', icone: 'impressora' },
  modelo: { id: 'm404', fabricante: 'HP', nome: 'LaserJet M404', imagem: { id: 'img-1' } },
  imagem: null,
  patrimonio: 'PAT-00412',
  serie: null,
  hostname: null,
  local: { id: EXPEDICAO, caminho: 'Jundiaí › Expedição' },
  responsavel: { id: JOAO, nome: 'João da Silva' },
  uso: 'em-uso',
  situacao: 'ativo',
  criadoEm: '2026-10-09T12:00:00.000Z',
  atualizadoEm: '2026-10-09T12:00:00.000Z',
  valores: {
    'ativo.patrimonio': 'PAT-00412',
    'ativo.uso': 'em-uso',
    'ativo.local': EXPEDICAO,
    'ativo.responsavel': JOAO,
    'c-ip': '10.0.0.5',
    'c-custo': 1234.5,
  },
  estado: {
    'ativo.patrimonio': {
      origem: 'manual',
      momento: '2026-10-09T17:32:00.000Z',
      autor: { id: ANA, nome: 'Ana Souza' },
      trava: true,
    },
    'c-ip': { origem: 'planilha', momento: '2026-10-01T11:00:00.000Z', autor: null, trava: false },
  },
  referencias: {
    pessoas: { [JOAO]: 'João da Silva' },
    locais: { [EXPEDICAO]: 'Jundiaí › Expedição' },
    ativos: {},
    fornecedores: {},
    arquivos: {},
  },
  permite: { editar: true, verRestritos: true, editarRestritos: true, verResponsavel: true },
  ...extras,
});

const problema = (status: number, detalhe: string, campos?: object) =>
  Response.json(
    {
      type: 'urn:grafite:problema:dados-invalidos',
      title: 'Dados inválidos',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      ...(campos && { campos }),
    },
    { status },
  );

type Ligados = components['schemas']['LigadosDoAtivo'];

/** O lado de lá com as ligações livres dadas, todas de um ativo fora do acesso. */
const ligadosCom = (quantos: number): Ligados => ({
  porCampos: [],
  livres: Array.from({ length: quantos }, (_, indice) => ({
    id: `ligacao-${indice}`,
    outro: { foraDoAcesso: true as const },
    permite: { desfazer: false },
  })),
  permite: { ligar: true },
});

const servidorDaFicha = (ficha: () => Ficha | Response, extras: ServidorDeTeste = {}) => ({
  'GET /api/ativos/a1/ligados': () => Response.json(ligadosCom(0)),
  'GET /api/ativos/a1/historico': () => Response.json({ itens: [], proximo: null }),
  'GET /api/ativos/a1': () => {
    const resposta = ficha();
    return resposta instanceof Response ? resposta : Response.json(resposta);
  },
  'GET /api/tipos-de-ativo': () =>
    Response.json({ tipos: [IMPRESSORA], permite: { cadastrar: false } }),
  'GET /api/campos': () => Response.json({ campos: CAMPOS, permite: { cadastrar: false } }),
  'GET /api/modelos': () =>
    Response.json({
      itens: [
        {
          id: 'm404',
          tipo: { id: 'impressora', nome: 'Impressora', icone: 'impressora' },
          fabricante: 'HP',
          nome: 'LaserJet M404',
          imagem: null,
          situacao: 'ativo',
          permite: { editar: false },
        },
      ],
      proximo: null,
      total: 1,
      permite: { cadastrar: false },
    }),
  'GET /api/locais': () =>
    Response.json({
      locais: [
        {
          id: EXPEDICAO,
          paiId: null,
          nome: 'Expedição',
          tipo: 'setor',
          situacao: 'ativo',
          permite: { editar: true },
        },
      ],
      permite: { cadastrarNaRaiz: true },
    }),
  ...extras,
});

/** O servidor da ficha com a Impressora ligada à capacidade dada, que dá o cartão dela. */
const servidorComCapacidade = (
  capacidade: string,
  ficha: () => Ficha,
  extras: ServidorDeTeste = {},
) =>
  servidorDaFicha(ficha, {
    'GET /api/tipos-de-ativo': () =>
      Response.json({
        tipos: [{ ...IMPRESSORA, capacidades: [capacidade] }],
        permite: { cadastrar: false },
      }),
    // A série dos suprimentos (change suprimentos-rostos-e-backups): vazia, sem estimativa.
    'GET /api/ativos/a1/suprimentos/serie': () => Response.json({ itens: [] }),
    ...extras,
  });

function abrir(
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('ativos.editar', 'ativos.ver'),
  endereco = '/ativos/a1',
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  const canal = criarCanalDeEventos();
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return { roteador, canal };
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

/** O parágrafo com o texto inteiro, mesmo com uma referência no meio, como "Tipo: Impressora". */
const paragrafo = (texto: string) =>
  screen.getByText((_, elemento) => elemento?.tagName === 'P' && elemento.textContent === texto);
const titulo = () => screen.findByRole('heading', { level: 1, name: /HP LaserJet M404/ });
const PNG = () => new File(['png'], 'impressora.png', { type: 'image/png' });

/** A lista dos cartões da aba Dados (change ficha-em-cartoes). */
const listaDosCartoes = () => screen.getByRole('navigation', { name: 'Grupos da ficha' });
/** O cartão pelo nome, na lista dos cartões. */
const cartao = (nome: string) => within(listaDosCartoes()).getByRole('button', { name: nome });
/** O texto de um elemento pelo id, como o nome e o resumo de um cartão. */
const textoDoId = (id: string | null) => (id && document.getElementById(id)?.textContent) ?? '';
/** O resumo do cartão, que o leitor de tela lê como a descrição dele. */
const resumo = (nome: string) => textoDoId(cartao(nome).getAttribute('aria-describedby'));
/** Os nomes dos cartões, na ordem da lista. */
const nomesDosCartoes = () =>
  within(listaDosCartoes())
    .getAllByRole('button')
    .map((botao) => textoDoId(botao.getAttribute('aria-labelledby')));

/** Abre o cartão pela lista, quando a ficha já chegou, e espera o nome dele no painel. */
async function abrirCartao(nome: string) {
  await screen.findByRole('navigation', { name: 'Grupos da ficha' });
  fireEvent.click(cartao(nome));
  return screen.findByRole('heading', { level: 2, name: nome });
}

/** Escolhe o arquivo na escolha de imagem, como a escolha de arquivos do sistema. */
async function escolherArquivo(rotulo: string, arquivo: File) {
  const escolha = await screen.findByRole('group', { name: rotulo });
  const campoDeArquivo = escolha.querySelector('input[type="file"]') as HTMLElement;
  fireEvent.change(campoDeArquivo, { target: { files: [arquivo] } });
}

describe('ficha do ativo', () => {
  it('mostra o nome, a situação, o patrimônio e a imagem do modelo no título', async () => {
    abrir(servidorDaFicha(() => fichaDe()));
    const cabecalho = await titulo();
    expect(cabecalho.textContent).toContain('Em uso');
    expect(cabecalho.textContent).toContain('PAT-00412');
    expect(cabecalho.querySelector('img')?.getAttribute('src')).toBe(
      '/api/modelos/m404/imagem/img-1/128',
    );
  });

  it('mostra os cartões com o resumo de cada um, o tipo, o estado de cada campo e a trava', async () => {
    abrir(servidorDaFicha(() => fichaDe()));
    await titulo();
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    expect(nomesDosCartoes()).toEqual([
      'Visão geral',
      'Identificação',
      'Uso',
      'Rede',
      'Outros',
      'Administrativo',
    ]);
    // A Visão geral abre primeiro; sem nenhum bloco com resumo, nada pede atenção.
    expect(screen.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeTruthy();
    expect(cartao('Visão geral').getAttribute('aria-current')).toBe('true');
    expect(resumo('Visão geral')).toBe('Nada pede atenção');
    expect(resumo('Identificação')).toBe('PAT-00412');
    expect(resumo('Uso')).toBe('Em uso · Jundiaí › Expedição');
    expect(resumo('Rede')).toBe('10.0.0.5');
    expect(resumo('Outros')).toBe('R$ 1.234,50');
    expect(resumo('Administrativo')).toBe('Nada preenchido');
    expect(screen.getByText('Nenhuma alteração')).toBeTruthy();

    await abrirCartao('Identificação');
    expect(paragrafo('Tipo: Impressora')).toBeTruthy();
    expect(within(paragrafo('Tipo: Impressora')).getByRole('link').getAttribute('href')).toBe(
      '/gestao/catalogo/tipos/impressora',
    );
    expect(screen.getByText(/^Manual · Ana Souza · \d\d\/10\/2026 \d\d:32$/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Trava de Patrimônio' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await abrirCartao('Rede');
    expect(screen.getByText(/^Planilha · \d\d\/10\/2026 \d\d:00$/)).toBeTruthy();
    await abrirCartao('Outros');
    expect(
      screen.getByText('Restrito: só quem vê os campos restritos vê este valor.'),
    ).toBeTruthy();
  });

  it('salva só o que mudou, com as travas mudadas', async () => {
    const corpos: unknown[] = [];
    abrir(
      servidorDaFicha(() => fichaDe(), {
        'PATCH /api/ativos/a1': async (pedido) => {
          corpos.push(await pedido.json());
          return Response.json(fichaDe());
        },
      }),
    );
    await titulo();
    await abrirCartao('Identificação');
    fireEvent.change(await screen.findByRole('textbox', { name: 'Hostname' }), {
      target: { value: 'IMP-ALMOX-01' },
    });
    // O que mudou num cartão continua ao abrir outro, e o salvar manda os dois.
    await abrirCartao('Rede');
    fireEvent.click(screen.getByRole('button', { name: 'Trava de IP' }));
    expect(screen.getByText('2 alterações não salvas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Ativo salvo.'));
    expect(corpos).toEqual([
      { valores: { 'ativo.hostname': 'IMP-ALMOX-01' }, travas: { 'c-ip': true } },
    ]);
  });

  it('o resumo do Uso mostra o caminho do local escolhido, antes de salvar', async () => {
    const JUNDIAI = '0199a6e0-0000-7000-8000-0000000000c1';
    const RH = '0199a6e0-0000-7000-8000-0000000000c3';
    const local = (id: string, paiId: string | null, nome: string, tipo: string) => ({
      id,
      paiId,
      nome,
      tipo,
      situacao: 'ativo',
      permite: { editar: true },
    });
    abrir(
      servidorDaFicha(() => fichaDe(), {
        'GET /api/locais': () =>
          Response.json({
            locais: [
              local(JUNDIAI, null, 'Jundiaí', 'unidade'),
              local(EXPEDICAO, JUNDIAI, 'Expedição', 'setor'),
              local(RH, JUNDIAI, 'RH', 'setor'),
            ],
            permite: { cadastrarNaRaiz: true },
          }),
      }),
    );
    await abrirCartao('Uso');
    expect(resumo('Uso')).toBe('Em uso · Jundiaí › Expedição');
    await escolherLocal('Local', 'Jundiaí › RH');
    await waitFor(() => expect(resumo('Uso')).toBe('Em uso · Jundiaí › RH'));
    await abrirCartao('Identificação');
    expect(resumo('Uso')).toBe('Em uso · Jundiaí › RH');
  });

  it('só a trava mudada vai no envio, sem os valores', async () => {
    const corpos: unknown[] = [];
    abrir(
      servidorDaFicha(() => fichaDe(), {
        'PATCH /api/ativos/a1': async (pedido) => {
          corpos.push(await pedido.json());
          return Response.json(fichaDe());
        },
      }),
    );
    await titulo();
    await abrirCartao('Identificação');
    fireEvent.click(await screen.findByRole('button', { name: 'Trava de Patrimônio' }));
    expect(screen.getByText('1 alteração não salva')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Ativo salvo.'));
    expect(corpos).toEqual([{ travas: { 'ativo.patrimonio': false } }]);
  });

  it('a recusa da API abre o cartão do campo, com a recusa nele e o foco nele', async () => {
    abrir(
      servidorDaFicha(() => fichaDe(), {
        'PATCH /api/ativos/a1': () =>
          problema(400, 'Confira os campos indicados.', {
            'valores.ativo.hostname': 'Use até 200 caracteres.',
          }),
      }),
    );
    await titulo();
    await abrirCartao('Identificação');
    fireEvent.change(await screen.findByRole('textbox', { name: 'Hostname' }), {
      target: { value: 'IMP-01' },
    });
    await abrirCartao('Uso');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Use até 200 caracteres.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Identificação' })).toBeTruthy();
    const hostname = screen.getByRole('textbox', { name: 'Hostname' });
    expect((hostname as HTMLInputElement).value).toBe('IMP-01');
    await waitFor(() => expect(document.activeElement).toBe(hostname));
  });

  it('o cartão aberto fica no endereço, e a ficha volta nele', async () => {
    const { roteador } = abrir(
      servidorDaFicha(() => fichaDe()),
      undefined,
      '/ativos/a1?grupo=uso',
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Uso' })).toBeTruthy();
    expect(cartao('Uso').getAttribute('aria-current')).toBe('true');
    await abrirCartao('Rede');
    await waitFor(() =>
      expect(roteador.state.location.search).toEqual({ grupo: 'organizacao:Rede' }),
    );
    await abrirCartao('Visão geral');
    await waitFor(() => expect(roteador.state.location.search).toEqual({}));
  });

  it('sem os restritos, o campo restrito some da ficha', async () => {
    const { 'c-custo': _custo, ...valores } = fichaDe().valores;
    abrir(
      servidorDaFicha(() =>
        fichaDe({
          valores,
          permite: {
            editar: true,
            verRestritos: false,
            editarRestritos: false,
            verResponsavel: true,
          },
        }),
      ),
    );
    await titulo();
    await abrirCartao('Identificação');
    await screen.findByRole('textbox', { name: 'Patrimônio' });
    expect(screen.queryByRole('textbox', { name: 'Custo do contrato' })).toBeNull();
    // O cartão Outros só tinha o campo restrito: ele some da lista.
    expect(nomesDosCartoes()).not.toContain('Outros');
  });

  it('inativa com confirmação e reativa', async () => {
    let atual = fichaDe();
    abrir(
      servidorDaFicha(() => atual, {
        'POST /api/ativos/a1/inativacao': () => {
          atual = fichaDe({ situacao: 'inativo' });
          return Response.json(atual);
        },
        'POST /api/ativos/a1/reativacao': () => {
          atual = fichaDe();
          return Response.json(atual);
        },
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const dialogo = await screen.findByRole('alertdialog', {
      name: 'Inativar o ativo HP LaserJet M404?',
    });
    expect(dialogo.textContent).toContain(
      'O ativo sai da lista dos ativos, e os dados ficam guardados.',
    );
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar o ativo' }));
    await waitFor(() => expect(avisos()).toContain('Ativo inativado.'));
    await waitFor(async () => expect((await titulo()).textContent).toContain('Inativo'));
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(avisos()).toContain('Ativo reativado.'));
  });

  it('sem ativos.editar, a ficha é só leitura', async () => {
    abrir(
      servidorDaFicha(() =>
        fichaDe({
          permite: {
            editar: false,
            verRestritos: false,
            editarRestritos: false,
            verResponsavel: true,
          },
        }),
      ),
      naOrganizacao('ativos.ver'),
    );
    await titulo();
    // Só leitura, sem o salvar nem a contagem das alterações.
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    expect(screen.queryByText('Nenhuma alteração')).toBeNull();
    await abrirCartao('Identificação');
    const patrimonio = (await screen.findByRole('textbox', {
      name: 'Patrimônio',
    })) as HTMLInputElement;
    expect(patrimonio.readOnly).toBe(true);
    // Só leitura, o modelo, o local e o responsável são referências com cartão.
    const modelo = paragrafo('Modelo: HP LaserJet M404');
    expect(within(modelo).getByRole('link').getAttribute('href')).toBe(
      '/gestao/catalogo/modelos/m404',
    );
    expect(screen.getAllByText('Travado').length).toBeGreaterThan(0);
    await abrirCartao('Uso');
    const responsavel = paragrafo('Responsável: João da Silva');
    expect(within(responsavel).getByRole('link').getAttribute('href')).toBe(
      `/administracao/pessoas/${JOAO}`,
    );
    expect(paragrafo('Local: Jundiaí › Expedição')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Inativar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Trava de/ })).toBeNull();
  });

  it('o cabeçalho tem a linha das relações, e "Ligados" leva à aba deles', async () => {
    const { roteador } = abrir(
      servidorDaFicha(() => fichaDe(), {
        'GET /api/ativos/a1/ligados': () => Response.json(ligadosCom(5)),
      }),
      naOrganizacao('ativos.editar', 'ativos.ver', 'pessoas.ver', 'locais.editar'),
    );
    await titulo();
    const relacoes = await screen.findByRole('navigation', { name: 'Relações do ativo' });
    await waitFor(() =>
      expect(relacoes.textContent).toBe(
        'Jundiaí › Expedição · João da Silva · HP LaserJet M404 · Ligados (5)',
      ),
    );
    expect(
      within(relacoes).getByRole('link', { name: 'Jundiaí › Expedição' }).getAttribute('href'),
    ).toBe(`/administracao/locais?local=${EXPEDICAO}`);
    expect(within(relacoes).getByRole('link', { name: 'João da Silva' }).getAttribute('href')).toBe(
      `/administracao/pessoas/${JOAO}`,
    );
    fireEvent.click(within(relacoes).getByRole('link', { name: 'Ligados (5)' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({ aba: 'ligados' }));
  });

  it('sem ver a pessoa responsável, ela fica só o nome, na linha e na aba Dados', async () => {
    abrir(
      servidorDaFicha(() =>
        fichaDe({
          permite: {
            editar: false,
            verRestritos: false,
            editarRestritos: false,
            verResponsavel: false,
          },
        }),
      ),
      naOrganizacao('ativos.ver'),
    );
    await titulo();
    const relacoes = await screen.findByRole('navigation', { name: 'Relações do ativo' });
    expect(within(relacoes).queryByRole('link', { name: 'João da Silva' })).toBeNull();
    await abrirCartao('Uso');
    expect(within(paragrafo('Responsável: João da Silva')).queryByRole('link')).toBeNull();
    // Sem a tela de locais, o local também é só o texto.
    expect(within(relacoes).queryByRole('link', { name: 'Jundiaí › Expedição' })).toBeNull();
  });

  it('na busca, "Nesta tela" traz "Imprimir etiqueta" e "Ir para Ligados" (busca-global)', async () => {
    const { roteador } = abrir(servidorDaFicha(() => fichaDe()));
    await titulo();
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Busca' });
    const nestaTela = within(dialogo).getByRole('group', { name: 'Nesta tela' });
    expect(
      within(nestaTela)
        .getAllByRole('option')
        .map((opcao) => opcao.textContent),
    ).toEqual(['Imprimir etiqueta', 'Ir para Ligados']);
    fireEvent.click(within(nestaTela).getByRole('option', { name: 'Ir para Ligados' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({ aba: 'ligados' }));
  });

  it('"Imprimir etiqueta" abre a tela das etiquetas com o ativo, também a quem só vê', async () => {
    const { roteador } = abrir(
      servidorDaFicha(() =>
        fichaDe({
          permite: {
            editar: false,
            verRestritos: false,
            editarRestritos: false,
            verResponsavel: true,
          },
        }),
      ),
      naOrganizacao('ativos.ver'),
    );
    await titulo();
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir etiqueta' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ativos/etiquetas'));
    expect(roteador.state.location.search).toEqual({ ids: 'a1' });
  });

  it('"Acesso remoto" abre a tela do acesso remoto, só para quem pode no local (acesso-remoto)', async () => {
    const { roteador } = abrir(
      servidorDaFicha(() =>
        fichaDe({
          permite: {
            editar: false,
            verRestritos: false,
            editarRestritos: false,
            verResponsavel: true,
            acessoRemoto: true,
          },
        }),
      ),
      naOrganizacao('ativos.ver', 'ativos.acesso-remoto'),
    );
    await titulo();
    fireEvent.click(screen.getByRole('button', { name: 'Acesso remoto' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ativos/a1/remoto'));
    await waitFor(() =>
      expect(sessoesAbertas).toEqual([expect.stringMatching(/\/api\/ativos\/a1\/acesso-remoto$/)]),
    );
    cleanup();
    abrir(servidorDaFicha(() => fichaDe()));
    await titulo();
    expect(screen.queryByRole('button', { name: 'Acesso remoto' })).toBeNull();
  });

  it('o ativo que não existe diz isso', async () => {
    abrir(
      servidorDaFicha(() =>
        Response.json(
          {
            type: 'urn:grafite:problema:nao-encontrado',
            title: 'Não encontrado',
            status: 404,
            detail: 'Ativo não encontrado.',
            codigoDeRastreio: 'R7K2-9QXM',
          },
          { status: 404 },
        ),
      ),
    );
    expect(await screen.findByText('Ativo não encontrado.')).toBeTruthy();
  });
});

describe('segredos na ficha', () => {
  const SWITCH = {
    id: 'switch',
    nome: 'Switch do CPD',
    tipo: 'conta-administrativa' as const,
    identificador: 'admin',
    situacao: 'ativo' as const,
  };

  it('mostra os segredos ligados pelo nome, com o tipo e o identificador, e o caminho até o Cofre', async () => {
    abrir(servidorDaFicha(() => fichaDe({ segredos: [SWITCH] })));
    await titulo();
    const secao = (await screen.findByRole('heading', { name: 'Segredos' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(secao).getByRole('link', { name: 'Switch do CPD' }).getAttribute('href')).toBe(
      '/cofre/switch',
    );
    expect(within(secao).getByText('Conta administrativa · admin')).toBeTruthy();
    expect(secao.textContent).not.toMatch(/senha|valor/i);
  });

  it('sem segredo que a conta vê, ou sem o cofre, a seção não aparece', async () => {
    abrir(servidorDaFicha(() => fichaDe({ segredos: [] })));
    await titulo();
    await screen.findByRole('heading', { level: 2, name: 'Visão geral' });
    expect(screen.queryByRole('heading', { name: 'Segredos' })).toBeNull();
    cleanup();
    abrir(servidorDaFicha(() => fichaDe()));
    await titulo();
    await screen.findByRole('heading', { level: 2, name: 'Visão geral' });
    expect(screen.queryByRole('heading', { name: 'Segredos' })).toBeNull();
  });

  it('o segredo inativo, que só quem administra o cofre vê, diz a situação', async () => {
    abrir(servidorDaFicha(() => fichaDe({ segredos: [{ ...SWITCH, situacao: 'inativo' }] })));
    const secao = (await screen.findByRole('heading', { name: 'Segredos' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(secao).getByText('Inativo')).toBeTruthy();
  });
});

describe('abas da ficha', () => {
  it('a aba fica no endereço, sem a Dados, a padrão, e a troca não cria entradas', async () => {
    const { roteador } = abrir(
      servidorDaFicha(() => fichaDe()),
      undefined,
      '/ativos/a1?aba=historico',
    );
    await titulo();
    expect(screen.getByRole('tab', { name: 'Histórico' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('tab', { name: /^Ligados/ }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({ aba: 'ligados' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Dados' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({}));
    expect(roteador.history.length).toBe(1);
  });

  it('o que foi digitado na aba Dados continua depois de trocar de aba, no mesmo cartão', async () => {
    const { roteador } = abrir(servidorDaFicha(() => fichaDe()));
    await titulo();
    await abrirCartao('Identificação');
    fireEvent.change(await screen.findByRole('textbox', { name: 'Hostname' }), {
      target: { value: 'IMP-ALMOX-01' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Hostname' })).toBeNull());
    await waitFor(() =>
      expect(roteador.state.location.search).toEqual({ aba: 'historico', grupo: 'identificacao' }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Dados' }));
    const hostname = (await screen.findByRole('textbox', { name: 'Hostname' })) as HTMLInputElement;
    expect(hostname.value).toBe('IMP-ALMOX-01');
  });

  it('com a ficha aberta, o valor do servidor entra no campo intocado, e o editado fica', async () => {
    const corpos: { valores?: Record<string, unknown> }[] = [];
    let ficha = fichaDe();
    const { canal } = abrir(
      servidorDaFicha(() => ficha, {
        'PATCH /api/ativos/a1': async (pedido) => {
          corpos.push(await pedido.json());
          return Response.json(ficha);
        },
      }),
    );
    await titulo();
    await abrirCartao('Identificação');
    fireEvent.change(await screen.findByRole('textbox', { name: 'Hostname' }), {
      target: { value: 'IMP-ALMOX-01' },
    });
    // A coleta grava a série, e outra conta muda o hostname, com a ficha aberta.
    ficha = fichaDe({
      serie: 'VNB3K12345',
      hostname: 'IMP-SERVIDOR',
      valores: {
        ...fichaDe().valores,
        'ativo.serie': 'VNB3K12345',
        'ativo.hostname': 'IMP-SERVIDOR',
      },
    });
    canal.publicar({
      id: 'evento-1',
      tipo: 'ativos.mudaram',
      momento: '2026-10-09T12:00:00.000Z',
      alvo: { tipo: 'ativo', id: 'a1' },
    });
    const serie = (await screen.findByRole('textbox', {
      name: 'Número de série',
    })) as HTMLInputElement;
    await waitFor(() => expect(serie.value).toBe('VNB3K12345'));
    const hostname = screen.getByRole('textbox', { name: 'Hostname' }) as HTMLInputElement;
    expect(hostname.value).toBe('IMP-ALMOX-01');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Ativo salvo.'));
    expect(corpos.map(({ valores }) => valores)).toEqual([{ 'ativo.hostname': 'IMP-ALMOX-01' }]);
  });

  it('a aba Ligados traz quantos estão ligados, e o evento dos ativos atualiza a contagem', async () => {
    let quantos = 1;
    const { canal } = abrir(
      servidorDaFicha(() => fichaDe(), {
        'GET /api/ativos/a1/ligados': () => Response.json(ligadosCom(quantos)),
      }),
    );
    expect(await screen.findByRole('tab', { name: 'Ligados (1)' })).toBeTruthy();
    quantos = 2;
    // A mudança de outro ativo pode mudar o lado de lá deste.
    canal.publicar({
      id: 'evento-1',
      tipo: 'ativos.mudaram',
      momento: '2026-10-09T12:00:00.000Z',
      alvo: { tipo: 'ativo', id: 'a2' },
    });
    expect(await screen.findByRole('tab', { name: 'Ligados (2)' })).toBeTruthy();
  });
});

describe('aba Ligados', () => {
  type Ligado = components['schemas']['AtivoLigado'];
  const MONITOR = { id: 'monitor', nome: 'Monitor', icone: 'monitor' as const };
  const SWITCH = { id: 'switch', nome: 'Switch', icone: 'switch' as const };
  const NOBREAK = { id: 'nobreak', nome: 'Nobreak', icone: 'nobreak' as const };

  const ligado = (id: string, rotulo: string, extras: Partial<Ligado> = {}): Ligado => ({
    id,
    rotulo,
    tipo: MONITOR,
    modelo: null,
    imagem: null,
    patrimonio: null,
    serie: null,
    hostname: null,
    local: { id: EXPEDICAO, caminho: 'Jundiaí › Expedição' },
    responsavel: null,
    uso: 'em-uso',
    situacao: 'ativo',
    criadoEm: '2026-10-09T12:00:00.000Z',
    atualizadoEm: '2026-10-09T12:00:00.000Z',
    permite: { editar: true, verRestritos: false, verResponsavel: true },
    ...extras,
  });

  const DELL = ligado('a2', 'Monitor Dell P2422H', {
    patrimonio: 'PAT-00320',
    imagem: { id: 'img-dell' },
  });
  const RACK = ligado('a3', 'Switch do rack', { tipo: SWITCH, patrimonio: 'PAT-00610' });
  const VELHO = ligado('a6', 'Switch antigo', { tipo: SWITCH, situacao: 'inativo' });

  const abrirLigados = (ligados: () => Ligados, extras: ServidorDeTeste = {}) =>
    abrir(
      servidorDaFicha(() => fichaDe(), {
        'GET /api/ativos/a1/ligados': () => Response.json(ligados()),
        ...extras,
      }),
      undefined,
      '/ativos/a1?aba=ligados',
    );

  const parte = async (titulo: string) =>
    (await screen.findByRole('heading', { level: 2, name: titulo })).closest(
      'section',
    ) as HTMLElement;

  it('um grupo por campo, com o lado de lá ou o "Pelo campo", o fora do acesso e o "Mostrando"', async () => {
    const muitos = Array.from({ length: 100 }, (_, indice) =>
      ligado(`s${indice}`, `Switch ${indice + 1}`, { tipo: SWITCH }),
    );
    abrirLigados(() => ({
      porCampos: [
        {
          campo: { id: 'c-computador', rotulo: 'Computador', ladoDeLa: 'Monitores' },
          total: 2,
          ativos: [DELL, { foraDoAcesso: true }],
        },
        {
          campo: { id: 'c-nobreak', rotulo: 'Nobreak', ladoDeLa: null },
          total: 150,
          ativos: muitos,
        },
      ],
      livres: [],
      permite: { ligar: false },
    }));
    expect(await screen.findByRole('tab', { name: 'Ligados (152)' })).toBeTruthy();
    const monitores = await parte('Monitores');
    const dell = within(monitores).getByRole('link', { name: 'Monitor Dell P2422H' });
    expect(dell.getAttribute('href')).toBe('/ativos/a2');
    const item = dell.closest('li') as HTMLElement;
    expect(within(item).getByText('Monitor · PAT-00320 · Jundiaí › Expedição')).toBeTruthy();
    expect(within(item).getByText('Em uso')).toBeTruthy();
    expect(item.querySelector('img')?.getAttribute('src')).toBe(
      '/api/ativos/a2/imagem/img-dell/64',
    );
    const fora = within(monitores).getByText('Ativo fora do seu acesso');
    expect(fora.closest('a')).toBeNull();
    expect(
      within(await parte('Pelo campo Nobreak')).getByText('Mostrando 100 de 150.'),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Ligado a' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ligar a outro ativo' })).toBeNull();
  });

  it('"Ligar a outro ativo" busca entre os ativos que a conta edita, sem o próprio e os já ligados', async () => {
    let livres: Ligados['livres'] = [{ id: 'l1', outro: RACK, permite: { desfazer: true } }];
    const corpos: unknown[] = [];
    const item = (id: string, rotulo: string, patrimonio: string, editar = true) => ({
      ...ligado(id, rotulo, { patrimonio }),
      valores: {},
      permite: { editar, verRestritos: false },
    });
    abrirLigados(() => ({ porCampos: [], livres, permite: { ligar: true } }), {
      'GET /api/ativos': () =>
        Response.json({
          itens: [
            item('a1', 'HP LaserJet M404', 'PAT-00412'),
            item('a3', 'Switch do rack', 'PAT-00610'),
            item('a4', 'Nobreak APC', 'PAT-00700'),
            item('a5', 'Nobreak de Campinas', 'PAT-00900', false),
          ],
          proximo: null,
          total: 4,
          referencias: { pessoas: {}, locais: {}, ativos: {}, arquivos: {}, modelos: {} },
          permite: { cadastrar: true },
        }),
      'POST /api/ativos/a1/ligacoes': async (pedido) => {
        corpos.push(await pedido.json());
        const nova = { id: 'l2', outro: ligado('a4', 'Nobreak APC', { tipo: NOBREAK }) };
        livres = [...livres, { ...nova, permite: { desfazer: true } }];
        return Response.json(livres.at(-1), { status: 201 });
      },
    });
    const ligadoA = await parte('Ligado a');
    expect(within(ligadoA).getByRole('link', { name: 'Switch do rack' })).toBeTruthy();
    fireEvent.click(within(ligadoA).getByRole('button', { name: 'Ligar a outro ativo' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Ligar a outro ativo' });
    const busca = within(dialogo).getByRole('combobox', { name: 'Ativo' });
    busca.focus();
    fireEvent.change(busca, { target: { value: 'nobreak' } });
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Nobreak APC · PAT-00700',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Nobreak APC · PAT-00700' }));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Ligar' }));
    await waitFor(() => expect(avisos()).toContain('Ativos ligados.'));
    expect(corpos).toEqual([{ outroId: 'a4' }]);
    expect(await within(ligadoA).findByRole('link', { name: 'Nobreak APC' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Ligados (2)' })).toBeTruthy();
  });

  it('a recusa da ligação aparece na escolha, e nada muda', async () => {
    abrirLigados(() => ({ porCampos: [], livres: [], permite: { ligar: true } }), {
      'GET /api/ativos': () =>
        Response.json({
          itens: [{ ...ligado('a3', 'Switch do rack'), valores: {} }],
          proximo: null,
          total: 1,
          referencias: { pessoas: {}, locais: {}, ativos: {}, arquivos: {}, modelos: {} },
          permite: { cadastrar: true },
        }),
      'POST /api/ativos/a1/ligacoes': () => problema(409, 'O ativo escolhido já tem 100 ligações.'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ligar a outro ativo' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Ligar a outro ativo' });
    const busca = within(dialogo).getByRole('combobox', { name: 'Ativo' });
    busca.focus();
    fireEvent.change(busca, { target: { value: 'switch' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Switch do rack' }));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Ligar' }));
    expect(await within(dialogo).findByText('O ativo escolhido já tem 100 ligações.')).toBeTruthy();
    expect(avisos()).not.toContain('Ativos ligados.');
  });

  it('"Desfazer ligação" pede confirmação, e a ligação sai; o inativo ligado mostra a situação', async () => {
    let livres: Ligados['livres'] = [
      { id: 'l1', outro: RACK, permite: { desfazer: true } },
      { id: 'l3', outro: VELHO, permite: { desfazer: false } },
    ];
    const desfeitas: string[] = [];
    abrirLigados(() => ({ porCampos: [], livres, permite: { ligar: true } }), {
      'DELETE /api/ativos/a1/ligacoes/l1': () => {
        desfeitas.push('l1');
        livres = livres.filter((livre) => livre.id !== 'l1');
        return new Response(null, { status: 204 });
      },
    });
    const ligadoA = await parte('Ligado a');
    const velho = within(ligadoA).getByRole('link', { name: 'Switch antigo' }).closest('li');
    expect(within(velho as HTMLElement).getByText('Inativo')).toBeTruthy();
    expect(within(velho as HTMLElement).queryByRole('button', { name: /Desfazer/ })).toBeNull();
    fireEvent.click(
      within(ligadoA).getByRole('button', { name: 'Desfazer a ligação com Switch do rack' }),
    );
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Desfazer a ligação com Switch do rack?',
    });
    expect(confirmacao.textContent).toContain(
      'A ligação sai das fichas dos dois ativos e fica no histórico.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Desfazer ligação' }));
    await waitFor(() => expect(avisos()).toContain('Ligação desfeita.'));
    expect(desfeitas).toEqual(['l1']);
    await waitFor(() =>
      expect(within(ligadoA).queryByRole('link', { name: 'Switch do rack' })).toBeNull(),
    );
  });

  it('sem nenhum ligado, diz isso, com "Ligar a outro ativo" só a quem pode', async () => {
    abrirLigados(() => ({ porCampos: [], livres: [], permite: { ligar: true } }));
    expect(await screen.findByText('Nenhum ativo ligado.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ligar a outro ativo' })).toBeTruthy();
    cleanup();
    abrirLigados(() => ({ porCampos: [], livres: [], permite: { ligar: false } }));
    expect(await screen.findByText('Nenhum ativo ligado.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ligar a outro ativo' })).toBeNull();
  });
});

describe('aba Histórico', () => {
  type Item = components['schemas']['ItemDoHistorico'];
  const item = (id: string, extras: Partial<Item> = {}): Item => ({
    id,
    momento: '2026-10-11T14:05:00.000Z',
    acao: 'ativo.alterado',
    rotulo: 'Ativo alterado',
    quem: 'Ana Souza',
    mudancas: [],
    travas: { ligadas: [], desligadas: [] },
    outro: null,
    ...extras,
  });

  const abrirHistorico = (
    paginas: (cursor: string | null) => { itens: Item[]; proximo: string | null },
    permissoes = naOrganizacao('ativos.editar', 'ativos.ver', 'auditoria.ver'),
  ) => {
    const cursores: (string | null)[] = [];
    const resultado = abrir(
      servidorDaFicha(() => fichaDe(), {
        'GET /api/ativos/a1/historico': (pedido) => {
          const cursor = new URL(pedido.url).searchParams.get('cursor');
          cursores.push(cursor);
          return Response.json(paginas(cursor));
        },
      }),
      permissoes,
      '/ativos/a1?aba=historico',
    );
    return { ...resultado, cursores };
  };

  it('as mudanças com quem e quando, as travas, o outro ativo da ligação e "Carregar mais"', async () => {
    const { cursores } = abrirHistorico((cursor) =>
      cursor === 'c2'
        ? {
            itens: [item('h3', { acao: 'ativo.criado', rotulo: 'Ativo cadastrado' })],
            proximo: null,
          }
        : {
            itens: [
              item('h1', {
                mudancas: [
                  {
                    campo: 'Local',
                    antes: 'Jundiaí › Almoxarifado',
                    depois: 'Jundiaí › Expedição',
                  },
                  { campo: 'Hostname', antes: null, depois: 'IMP-01' },
                ],
                travas: { ligadas: ['Local'], desligadas: [] },
              }),
              item('h2', {
                acao: 'ativo.ligado',
                rotulo: 'Ligação feita',
                outro: { id: 'a3', rotulo: 'Switch do rack' },
              }),
              item('h4', {
                acao: 'ativo.desligado',
                rotulo: 'Ligação desfeita',
                outro: { id: null, rotulo: 'Ativo fora do seu acesso' },
              }),
            ],
            proximo: 'c2',
          },
    );
    const lista = await screen.findByRole('list', { name: 'Histórico do ativo' });
    const texto = lista.textContent ?? '';
    expect(texto).toContain('Ativo alterado');
    expect(texto).toMatch(/\d\d\/10\/2026 \d\d:05 · Ana Souza/);
    expect(texto).toContain('Local: Jundiaí › Almoxarifado → Jundiaí › Expedição');
    expect(texto).toContain('Hostname: — → IMP-01');
    expect(texto).toContain('Travado: Local');
    expect(within(lista).getByRole('link', { name: 'Switch do rack' }).getAttribute('href')).toBe(
      '/ativos/a3',
    );
    expect(texto).toContain('Outro ativo: Ativo fora do seu acesso');
    expect(within(lista).queryByRole('link', { name: 'Ativo fora do seu acesso' })).toBeNull();
    expect(texto).not.toContain('Ativo cadastrado');

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await within(lista).findByText('Ativo cadastrado')).toBeTruthy();
    expect(cursores).toEqual([null, 'c2']);
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('"Ver na auditoria" leva à auditoria filtrada pelo ativo, só a quem tem auditoria.ver', async () => {
    abrirHistorico(() => ({ itens: [item('h1')], proximo: null }));
    const ver = await screen.findByRole('link', { name: 'Ver na auditoria' });
    const destino = new URL(ver.getAttribute('href') ?? '', 'http://grafite');
    expect(destino.pathname).toBe('/administracao/auditoria');
    expect(destino.searchParams.get('alvo')).toContain('ativo:a1');
    expect(destino.searchParams.get('nomeDoAlvo')).toBe('HP LaserJet M404');
    cleanup();
    abrirHistorico(() => ({ itens: [item('h1')], proximo: null }), naOrganizacao('ativos.ver'));
    await screen.findByRole('list', { name: 'Histórico do ativo' });
    expect(screen.queryByRole('link', { name: 'Ver na auditoria' })).toBeNull();
  });

  it('sem registros, diz isso', async () => {
    abrirHistorico(() => ({ itens: [], proximo: null }));
    expect(await screen.findByText('Nenhum registro deste ativo.')).toBeTruthy();
  });
});

describe('os campos de arquivo e de imagem', () => {
  const NOTA_FISCAL = campo('c-nf', 'PDF da nota fiscal', { tipo: 'arquivo' });
  const ETIQUETA = campo('c-etiqueta', 'Foto da etiqueta', { tipo: 'imagem' });
  const CONTRATO = campo('c-contrato', 'Contrato assinado', { tipo: 'arquivo', restrito: true });
  const COM_ARQUIVOS = {
    ...IMPRESSORA,
    campos: [
      ...IMPRESSORA.campos,
      { campoId: 'c-nf', obrigatorio: false },
      { campoId: 'c-etiqueta', obrigatorio: false },
      { campoId: 'c-contrato', obrigatorio: false },
    ],
  };
  const NOTA = { nome: 'nota-fiscal-1234.pdf', bytes: 240 * 1024, tipo: 'application/pdf' };
  const FOTO = { nome: 'etiqueta.png', bytes: 18 * 1024, tipo: 'image/png' };
  const ENVIO = {
    origem: 'manual' as const,
    momento: '2026-10-11T14:05:00.000Z',
    autor: { id: ANA, nome: 'Ana Souza' },
    trava: false,
  };

  /** A ficha com os arquivos dados nos campos, pelo id do campo. */
  const fichaComArquivos = (
    arquivos: Partial<Record<'c-nf' | 'c-etiqueta' | 'c-contrato', string>>,
    extras: Partial<Ficha> = {},
  ) => {
    const base = fichaDe();
    const registros: Record<string, typeof NOTA> = {};
    if (arquivos['c-nf']) registros[arquivos['c-nf']] = NOTA;
    if (arquivos['c-etiqueta']) registros[arquivos['c-etiqueta']] = FOTO;
    if (arquivos['c-contrato']) registros[arquivos['c-contrato']] = NOTA;
    return fichaDe({
      valores: { ...base.valores, ...arquivos },
      estado: {
        ...base.estado,
        ...Object.fromEntries(Object.keys(arquivos).map((chave) => [chave, ENVIO])),
      },
      referencias: { ...base.referencias, arquivos: registros },
      ...extras,
    });
  };

  const comArquivos = (ficha: () => Ficha, extras: ServidorDeTeste = {}) =>
    servidorDaFicha(ficha, {
      'GET /api/tipos-de-ativo': () =>
        Response.json({ tipos: [COM_ARQUIVOS], permite: { cadastrar: false } }),
      'GET /api/campos': () =>
        Response.json({
          campos: [...CAMPOS, NOTA_FISCAL, ETIQUETA, CONTRATO],
          permite: { cadastrar: false },
        }),
      ...extras,
    });

  /** O campo de arquivo pelo nome, no cartão Outros, o dos campos sem grupo. */
  const grupo = async (nome: string) => {
    await abrirCartao('Outros');
    return screen.findByRole('group', { name: nome });
  };

  it('o arquivo mostra o nome, o tamanho, "Baixar" e o estado de quem enviou', async () => {
    abrir(comArquivos(() => fichaComArquivos({ 'c-nf': 'f-nf' })));
    const nota = await grupo('PDF da nota fiscal');
    expect(within(nota).getByText('nota-fiscal-1234.pdf')).toBeTruthy();
    expect(within(nota).getByText('240 KB')).toBeTruthy();
    expect(within(nota).getByRole('link', { name: 'Baixar' }).getAttribute('href')).toBe(
      '/api/ativos/a1/campos/c-nf/arquivo/f-nf/completa',
    );
    expect(within(nota).getByRole('button', { name: 'Trocar' })).toBeTruthy();
    expect(within(nota).getByRole('button', { name: 'Remover' })).toBeTruthy();
    expect(screen.getByText(/^Manual · Ana Souza · \d\d\/10\/2026 \d\d:05$/)).toBeTruthy();
  });

  it('envia o arquivo na hora, com o nome, e o que foi digitado no formulário continua', async () => {
    let atual = fichaComArquivos({});
    const envios: { nome: string | null; tipo: string | null }[] = [];
    abrir(
      comArquivos(() => atual, {
        'PUT /api/ativos/a1/campos/c-nf/arquivo': (pedido) => {
          envios.push({
            nome: new URL(pedido.url).searchParams.get('nome'),
            tipo: pedido.headers.get('content-type'),
          });
          atual = fichaComArquivos({ 'c-nf': 'f-nf' });
          return Response.json(atual);
        },
      }),
    );
    await abrirCartao('Identificação');
    fireEvent.change(screen.getByRole('textbox', { name: 'Hostname' }), {
      target: { value: 'IMP-ALMOX-01' },
    });
    const nota = await grupo('PDF da nota fiscal');
    expect(within(nota).getByText('Sem arquivo')).toBeTruthy();
    const campoDeArquivo = nota.querySelector('input[type="file"]') as HTMLElement;
    fireEvent.change(campoDeArquivo, {
      target: {
        files: [new File(['%PDF-1.7'], 'nota-fiscal-1234.pdf', { type: 'application/pdf' })],
      },
    });
    await waitFor(() => expect(avisos()).toContain('Arquivo enviado.'));
    expect(envios).toEqual([{ nome: 'nota-fiscal-1234.pdf', tipo: 'application/octet-stream' }]);
    expect(await within(nota).findByText('nota-fiscal-1234.pdf')).toBeTruthy();
    expect(screen.getByText(/^Manual · Ana Souza · \d\d\/10\/2026 \d\d:05$/)).toBeTruthy();
    await abrirCartao('Identificação');
    expect((screen.getByRole('textbox', { name: 'Hostname' }) as HTMLInputElement).value).toBe(
      'IMP-ALMOX-01',
    );
  });

  it('remove o arquivo com confirmação, com o nome dele', async () => {
    let atual = fichaComArquivos({ 'c-nf': 'f-nf' });
    abrir(
      comArquivos(() => atual, {
        'DELETE /api/ativos/a1/campos/c-nf/arquivo': () => {
          atual = fichaComArquivos({});
          return Response.json(atual);
        },
      }),
    );
    const nota = await grupo('PDF da nota fiscal');
    fireEvent.click(within(nota).getByRole('button', { name: 'Remover' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Remover arquivo?' });
    expect(confirmacao.textContent).toContain(
      '"nota-fiscal-1234.pdf" sai do campo na hora e não pode mais ser baixado.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover arquivo' }));
    await waitFor(() => expect(avisos()).toContain('Arquivo removido.'));
    expect(await within(nota).findByText('Sem arquivo')).toBeTruthy();
  });

  it('a imagem mostra a miniatura, que abre a imagem inteira, e se envia e se remove', async () => {
    let atual = fichaComArquivos({ 'c-etiqueta': 'f-et' });
    abrir(
      comArquivos(() => atual, {
        'PUT /api/ativos/a1/campos/c-etiqueta/arquivo': () => {
          atual = fichaComArquivos({ 'c-etiqueta': 'f-et2' });
          return Response.json(atual);
        },
        'DELETE /api/ativos/a1/campos/c-etiqueta/arquivo': () => {
          atual = fichaComArquivos({});
          return Response.json(atual);
        },
      }),
    );
    const etiqueta = await grupo('Foto da etiqueta');
    const inteira = within(etiqueta).getByRole('link', {
      name: 'Abrir a imagem inteira de Foto da etiqueta',
    });
    expect(inteira.getAttribute('href')).toBe(
      '/api/ativos/a1/campos/c-etiqueta/arquivo/f-et/completa',
    );
    expect(inteira.querySelector('img')?.getAttribute('src')).toBe(
      '/api/ativos/a1/campos/c-etiqueta/arquivo/f-et/256',
    );
    await escolherArquivo('Foto da etiqueta', PNG());
    await waitFor(() => expect(avisos()).toContain('Imagem enviada.'));
    await waitFor(() =>
      expect(etiqueta.querySelector('img')?.getAttribute('src')).toBe(
        '/api/ativos/a1/campos/c-etiqueta/arquivo/f-et2/256',
      ),
    );
    fireEvent.click(within(etiqueta).getByRole('button', { name: 'Remover imagem' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Remover imagem?' });
    expect(confirmacao.textContent).toContain('"etiqueta.png" sai do campo na hora.');
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover imagem' }));
    await waitFor(() => expect(avisos()).toContain('Imagem removida.'));
    expect(await within(etiqueta).findByText('Sem imagem')).toBeTruthy();
    expect(within(etiqueta).getByRole('button', { name: 'Enviar imagem' })).toBeTruthy();
  });

  it('sem ativos.editar, o arquivo só se baixa, e a imagem só aparece', async () => {
    abrir(
      comArquivos(() =>
        fichaComArquivos(
          { 'c-nf': 'f-nf', 'c-etiqueta': 'f-et' },
          {
            permite: {
              editar: false,
              verRestritos: false,
              editarRestritos: false,
              verResponsavel: true,
            },
          },
        ),
      ),
      naOrganizacao('ativos.ver'),
    );
    const nota = await grupo('PDF da nota fiscal');
    expect(within(nota).getByRole('link', { name: 'Baixar' })).toBeTruthy();
    expect(within(nota).queryByRole('button')).toBeNull();
    const etiqueta = await grupo('Foto da etiqueta');
    expect(
      within(etiqueta).getByRole('link', { name: 'Abrir a imagem inteira de Foto da etiqueta' }),
    ).toBeTruthy();
    expect(within(etiqueta).queryByRole('button')).toBeNull();
  });

  it('o arquivo restrito diz que é restrito, e sem editar os restritos só se baixa', async () => {
    abrir(
      comArquivos(() =>
        fichaComArquivos(
          { 'c-contrato': 'f-ct' },
          {
            permite: {
              editar: true,
              verRestritos: true,
              editarRestritos: false,
              verResponsavel: true,
            },
          },
        ),
      ),
    );
    const contrato = await grupo('Contrato assinado');
    expect(
      within(contrato).getByText('Restrito: só quem vê os campos restritos vê este valor.'),
    ).toBeTruthy();
    expect(within(contrato).getByRole('link', { name: 'Baixar' })).toBeTruthy();
    expect(within(contrato).queryByRole('button')).toBeNull();
  });
});

describe('imagem do ativo', () => {
  const COM_IMAGEM = { imagem: { id: 'img-a' } };

  it('a imagem do ativo vale no lugar da do modelo no cabeçalho e na aba Dados', async () => {
    abrir(servidorDaFicha(() => fichaDe(COM_IMAGEM)));
    expect((await titulo()).querySelector('img')?.getAttribute('src')).toBe(
      '/api/ativos/a1/imagem/img-a/128',
    );
    const imagem = await screen.findByRole('group', { name: 'Imagem de HP LaserJet M404' });
    expect(imagem.querySelector('img')?.getAttribute('src')).toBe(
      '/api/ativos/a1/imagem/img-a/256',
    );
    expect(within(imagem).getByRole('button', { name: 'Trocar imagem' })).toBeTruthy();
    expect(within(imagem).getByRole('button', { name: 'Remover imagem' })).toBeTruthy();

    // A imagem fica ao lado do conteúdo de todo cartão, não só da Visão geral.
    await abrirCartao('Uso');
    const noUso = screen.getByRole('group', { name: 'Imagem de HP LaserJet M404' });
    expect(noUso.querySelector('img')?.getAttribute('src')).toBe('/api/ativos/a1/imagem/img-a/256');
    expect(within(noUso).getByRole('button', { name: 'Trocar imagem' })).toBeTruthy();
  });

  it('envia a imagem, que aparece na hora, e a remove com confirmação, de volta à do modelo', async () => {
    let atual = fichaDe();
    abrir(
      servidorDaFicha(() => atual, {
        'PUT /api/ativos/a1/imagem': () => {
          atual = fichaDe(COM_IMAGEM);
          return Response.json(atual);
        },
        'DELETE /api/ativos/a1/imagem': () => {
          atual = fichaDe();
          return Response.json(atual);
        },
      }),
    );
    const imagem = await screen.findByRole('group', { name: 'Imagem de HP LaserJet M404' });
    // Sem imagem própria, a escolha mostra a do modelo, e não oferece a remoção.
    expect(imagem.querySelector('img')?.getAttribute('src')).toBe(
      '/api/modelos/m404/imagem/img-1/256',
    );
    expect(within(imagem).getByRole('button', { name: 'Enviar imagem' })).toBeTruthy();
    expect(within(imagem).queryByRole('button', { name: 'Remover imagem' })).toBeNull();
    await escolherArquivo('Imagem de HP LaserJet M404', PNG());
    await waitFor(() => expect(avisos()).toContain('Imagem do ativo trocada.'));
    await waitFor(() =>
      expect(imagem.querySelector('img')?.getAttribute('src')).toBe(
        '/api/ativos/a1/imagem/img-a/256',
      ),
    );
    expect((await titulo()).querySelector('img')?.getAttribute('src')).toBe(
      '/api/ativos/a1/imagem/img-a/128',
    );

    fireEvent.click(within(imagem).getByRole('button', { name: 'Remover imagem' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Remover imagem?' });
    expect(confirmacao.textContent).toContain(
      'A imagem deixa de aparecer na hora, e a ficha volta a mostrar a imagem do modelo.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover imagem' }));
    await waitFor(() => expect(avisos()).toContain('Imagem do ativo removida.'));
    await waitFor(() =>
      expect(imagem.querySelector('img')?.getAttribute('src')).toBe(
        '/api/modelos/m404/imagem/img-1/256',
      ),
    );
  });

  it('sem a imagem do modelo, a remoção diz que a ficha volta ao ícone do tipo', async () => {
    const semModelo = { modelo: null, ...COM_IMAGEM };
    abrir(servidorDaFicha(() => fichaDe(semModelo)));
    const imagem = await screen.findByRole('group', { name: 'Imagem de HP LaserJet M404' });
    fireEvent.click(within(imagem).getByRole('button', { name: 'Remover imagem' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Remover imagem?' });
    expect(confirmacao.textContent).toContain(
      'A imagem deixa de aparecer na hora, e a ficha volta a mostrar o ícone do tipo.',
    );
  });

  it('a recusa do envio aparece junto da escolha, e a imagem anterior continua', async () => {
    abrir(
      servidorDaFicha(() => fichaDe(COM_IMAGEM), {
        'PUT /api/ativos/a1/imagem': () => problema(413, 'A imagem passa de 10 MB.'),
      }),
    );
    await escolherArquivo('Imagem de HP LaserJet M404', PNG());
    const imagem = screen.getByRole('group', { name: 'Imagem de HP LaserJet M404' });
    expect((await within(imagem).findByRole('alert')).textContent).toBe('A imagem passa de 10 MB.');
    expect(imagem.querySelector('img')?.getAttribute('src')).toBe(
      '/api/ativos/a1/imagem/img-a/256',
    );
  });

  it('sem ativos.editar, a imagem só aparece', async () => {
    abrir(
      servidorDaFicha(() =>
        fichaDe({
          ...COM_IMAGEM,
          permite: {
            editar: false,
            verRestritos: false,
            editarRestritos: false,
            verResponsavel: true,
          },
        }),
      ),
      naOrganizacao('ativos.ver'),
    );
    await titulo();
    expect(
      (await screen.findByRole('img', { name: 'Imagem de HP LaserJet M404' })).getAttribute('src'),
    ).toBe('/api/ativos/a1/imagem/img-a/256');
    expect(screen.queryByRole('button', { name: /imagem/ })).toBeNull();
  });
});

describe('a disponibilidade na ficha', () => {
  // Meio minuto a mais: a idade na tela não cai para o minuto de baixo quando a resposta chega
  // depois do relógio da tela.
  const antes = (minutos: number) => new Date(Date.now() - (minutos + 0.5) * 60_000).toISOString();
  type Disponibilidade = NonNullable<Ficha['disponibilidade']>;
  const disponibilidade = (extras: Partial<Disponibilidade> = {}): Disponibilidade => ({
    situacao: 'online',
    momento: antes(1),
    desde: antes(90),
    motivo: null,
    latencia: { valor: 3, inconsistente: false },
    coletor: 'Coletor de Jundiaí',
    ...extras,
  });
  /** O painel, no cartão da capacidade. */
  const parte = async () => {
    await abrirCartao('Disponibilidade na rede');
    return screen.findByRole('region', { name: 'Disponibilidade na rede' });
  };

  it('mostra a situação, desde quando, a idade da leitura, a latência e o coletor', async () => {
    abrir(
      servidorComCapacidade('rede.disponibilidade', () =>
        fichaDe({ disponibilidade: disponibilidade() }),
      ),
    );
    const naParte = within(await parte());
    expect(
      naParte.getByText('Online').closest('[data-situacao]')?.getAttribute('data-situacao'),
    ).toBe('sucesso');
    expect(naParte.getByText(/^Online desde \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeTruthy();
    expect(naParte.getByText('há 1 min')).toBeTruthy();
    expect(naParte.getByText('3 ms')).toBeTruthy();
    expect(naParte.getByText('Coletor de Jundiaí')).toBeTruthy();
    expect(naParte.queryByText('Desatualizado')).toBeNull();
    expect(resumo('Disponibilidade na rede')).toBe('Online');
    expect(screen.getAllByRole('heading', { name: 'Disponibilidade na rede' })).toHaveLength(1);
  });

  it('a leitura velha diz "Desatualizado", e a latência impossível diz "Inconsistente"', async () => {
    abrir(
      servidorComCapacidade('rede.disponibilidade', () =>
        fichaDe({
          disponibilidade: disponibilidade({
            momento: antes(20),
            latencia: { valor: -5, inconsistente: true },
          }),
        }),
      ),
    );
    const naParte = within(await parte());
    expect(naParte.getByText('Online')).toBeTruthy();
    expect(naParte.getByText('há 20 min')).toBeTruthy();
    expect(naParte.getByText('Desatualizado')).toBeTruthy();
    expect(naParte.getByText('-5 ms')).toBeTruthy();
    expect(naParte.getByText('Inconsistente')).toBeTruthy();
  });

  it('offline e sem dado não têm latência; o não verificado diz o motivo', async () => {
    const { canal } = abrir(
      servidorComCapacidade('rede.disponibilidade', () =>
        fichaDe({
          disponibilidade: {
            situacao: 'nao-verificado',
            momento: null,
            desde: null,
            motivo: 'Nenhum coletor alcança o IP 10.9.0.5.',
            latencia: null,
            coletor: null,
          },
        }),
      ),
    );
    const naParte = within(await parte());
    expect(naParte.getByText('Não verificado')).toBeTruthy();
    expect(naParte.getByText('Nenhum coletor alcança o IP 10.9.0.5.')).toBeTruthy();
    expect(naParte.queryByText(/ms$/)).toBeNull();
    expect(canal).toBeTruthy();
  });

  it('sem a capacidade no tipo, a ficha não mostra a disponibilidade', async () => {
    abrir(servidorDaFicha(() => fichaDe({ disponibilidade: null })));
    await titulo();
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    expect(nomesDosCartoes()).not.toContain('Disponibilidade na rede');
    expect(screen.queryByRole('region', { name: 'Disponibilidade na rede' })).toBeNull();
  });

  it('o evento disponibilidade.mudou relê a ficha', async () => {
    let atual = disponibilidade();
    const { canal } = abrir(
      servidorComCapacidade('rede.disponibilidade', () => fichaDe({ disponibilidade: atual })),
    );
    const naParte = within(await parte());
    expect(naParte.getByText('Online')).toBeTruthy();
    atual = disponibilidade({ situacao: 'offline', latencia: null, desde: antes(0) });
    canal.publicar({
      id: 'e1',
      tipo: 'disponibilidade.mudou',
      momento: new Date().toISOString(),
      alvo: { tipo: 'ativo', id: 'a1' },
    });
    expect(await within(await parte()).findByText('Offline')).toBeTruthy();
  });
});

// O painel Suprimentos (spec impressoras-por-snmp, "Painel Suprimentos", "Nível dos suprimentos",
// "Contadores de páginas" e "Condições do equipamento"; change p2b-impressoras-por-snmp, design,
// decisão 10): cada estado em texto, nunca só pela cor.
describe('os suprimentos na ficha', () => {
  // Meio minuto a mais, como na disponibilidade: a idade não cai para o minuto de baixo.
  const antes = (minutos: number) => new Date(Date.now() - (minutos + 0.5) * 60_000).toISOString();
  type Painel = NonNullable<Ficha['painelDeSuprimentos']>;
  type Suprimento = Painel['suprimentos'][number];
  const suprimento = (
    item: string,
    descricao: string,
    tipo: Suprimento['tipo'],
    nivel: Suprimento['nivel'],
    minutos = 3,
  ): Suprimento => ({ item, descricao, tipo, nivel, momento: antes(minutos) });
  const painel = (extras: Partial<Painel> = {}): Painel => ({
    motivo: null,
    resposta: {
      situacao: 'respondeu',
      momento: antes(3),
      desde: antes(600),
      coletor: 'Coletor de Jundiaí',
    },
    suprimentos: [
      suprimento('1', 'Black Toner Cartridge', 'toner', { tipo: 'medido', percentual: 8 }),
      suprimento('2', 'Imaging Drum Unit', 'cilindro', { tipo: 'medido', percentual: 60 }),
    ],
    contadores: [
      {
        item: '1',
        rotulo: 'Total de páginas',
        paginas: 12500,
        inconsistente: false,
        momento: antes(3),
      },
    ],
    paginasEmPretoEBranco: 12500,
    condicoes: { itens: [], momento: antes(3) },
    mensagens: { itens: [], momento: antes(3) },
    menor: { nivel: 8, descricao: 'Black Toner Cartridge', momento: antes(3) },
    total: { paginas: 12500, momento: antes(3) },
    ...extras,
  });
  /** O painel, no cartão da capacidade. */
  const parte = async () => {
    await abrirCartao('Suprimentos e contadores');
    return screen.findByRole('region', { name: 'Suprimentos' });
  };
  /**
   * Os cartuchos dos suprimentos (change suprimentos-rostos-e-backups, design, decisão 4): o título
   * com o tipo e a descrição, o nível como o leitor de tela o anuncia e a idade da leitura.
   */
  const linhas = (regiao: HTMLElement) =>
    within(within(regiao).getByRole('list', { name: 'Níveis dos suprimentos' }))
      .getAllByRole('listitem')
      .map((item) => [
        item.getAttribute('title'),
        item.querySelector('[role="meter"]')?.getAttribute('aria-valuetext') ??
          item.querySelector('[role="img"]')?.getAttribute('aria-label'),
        within(item).getByText(/^há /).textContent,
      ]);
  /** O bloco do painel com o título dado. */
  const bloco = (regiao: HTMLElement, titulo: string) =>
    within(within(regiao).getByRole('heading', { name: titulo }).parentElement as HTMLElement);

  // O primeiro cartão da ficha (spec cadastro-de-ativos, "Aba Dados em cartões"; change
  // primeiro-cartao-da-ficha, design, decisões 3 e 4).
  it('a impressora abre nos suprimentos, com a Visão geral logo depois, e ela vai ao endereço', async () => {
    const { roteador } = abrir(
      servidorComCapacidade('snmp.suprimentos', () => fichaDe({ painelDeSuprimentos: painel() })),
    );
    expect(await screen.findByRole('region', { name: 'Suprimentos' })).toBeTruthy();
    expect(nomesDosCartoes().slice(0, 2)).toEqual(['Suprimentos e contadores', 'Visão geral']);
    expect(cartao('Suprimentos e contadores').getAttribute('aria-current')).toBe('true');
    await abrirCartao('Visão geral');
    await waitFor(() => expect(roteador.state.location.search).toEqual({ grupo: 'visao-geral' }));
    await abrirCartao('Suprimentos e contadores');
    await waitFor(() => expect(roteador.state.location.search).toEqual({}));
  });

  it('o tipo que escolhe a Visão geral abre nela', async () => {
    abrir(
      servidorComCapacidade('snmp.suprimentos', () => fichaDe({ painelDeSuprimentos: painel() }), {
        'GET /api/tipos-de-ativo': () =>
          Response.json({
            tipos: [
              { ...IMPRESSORA, capacidades: ['snmp.suprimentos'], primeiroCartao: 'visao-geral' },
            ],
            permite: { cadastrar: false },
          }),
      }),
    );
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    expect(nomesDosCartoes()[0]).toBe('Visão geral');
    expect(cartao('Visão geral').getAttribute('aria-current')).toBe('true');
  });

  it('mostra a resposta, a idade, cada suprimento com o tipo e o nível, e os contadores', async () => {
    abrir(
      servidorComCapacidade('snmp.suprimentos', () => fichaDe({ painelDeSuprimentos: painel() })),
    );
    const regiao = await parte();
    const naParte = within(regiao);
    expect(
      naParte.getByText('Respondeu').closest('[data-situacao]')?.getAttribute('data-situacao'),
    ).toBe('sucesso');
    expect(naParte.getAllByText('há 3 min').length).toBeGreaterThan(0);
    expect(naParte.getByText(/^Respondeu desde \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeTruthy();
    expect(naParte.getByText('Coletor de Jundiaí')).toBeTruthy();
    expect(linhas(regiao)).toEqual([
      ['Toner · Black Toner Cartridge', '8%', 'há 3 min'],
      ['Cilindro · Imaging Drum Unit', '60%', 'há 3 min'],
    ]);
    const contadores = bloco(regiao, 'Contadores');
    expect(contadores.getByText('Total de páginas').nextElementSibling?.textContent).toBe('12.500');
    expect(contadores.getByText('Páginas em preto e branco').nextElementSibling?.textContent).toBe(
      '12.500',
    );
    expect(bloco(regiao, 'Condições').getByText('Nenhuma condição informada.')).toBeTruthy();
    expect(naParte.queryByText('Desatualizado')).toBeNull();
    expect(resumo('Suprimentos e contadores')).toBe('8% · Black Toner Cartridge');
    expect(screen.queryByRole('heading', { name: 'Suprimentos' })).toBeNull();
  });

  it('"há suprimento", sem dado e inconsistente vêm em texto, sem percentual inventado', async () => {
    abrir(
      servidorComCapacidade('snmp.suprimentos', () =>
        fichaDe({
          painelDeSuprimentos: painel({
            suprimentos: [
              suprimento('1', 'Cyan', 'toner', { tipo: 'ha-suprimento' }),
              suprimento('2', 'Imaging Drum Unit', 'cilindro', { tipo: 'sem-dado' }),
              suprimento('3', 'Yellow', 'toner', { tipo: 'inconsistente', valor: 120 }),
            ],
          }),
        }),
      ),
    );
    const regiao = await parte();
    const naParte = within(regiao);
    expect(linhas(regiao)).toEqual([
      ['Toner · Cyan', 'Ciano: há suprimento', 'há 3 min'],
      ['Cilindro · Imaging Drum Unit', 'Cilindro: sem dado', 'há 3 min'],
      ['Toner · Yellow', 'Amarelo: inconsistente, 120%', 'há 3 min'],
    ]);
    expect(naParte.getByText('Há suprimento')).toBeTruthy();
    expect(naParte.getByText('Inconsistente')).toBeTruthy();
    expect(naParte.queryByText('100%')).toBeNull();
    expect(naParte.queryByText('0%')).toBeNull();
  });

  it('toner colorido: os cartuchos com as letras C, M, Y e K, cada um na tinta dele', async () => {
    abrir(
      servidorComCapacidade('snmp.suprimentos', () =>
        fichaDe({
          painelDeSuprimentos: painel({
            suprimentos: [
              suprimento('1', 'Cyan Toner', 'toner', { tipo: 'medido', percentual: 62 }),
              suprimento('2', 'Magenta Toner', 'toner', { tipo: 'medido', percentual: 38 }),
              suprimento('3', 'Yellow Toner', 'toner', { tipo: 'medido', percentual: 81 }),
              suprimento('4', 'Black Toner', 'toner', { tipo: 'medido', percentual: 15 }),
            ],
          }),
        }),
      ),
    );
    const naParte = within(await parte());
    for (const letra of ['C', 'M', 'Y', 'K']) expect(naParte.getByText(letra)).toBeTruthy();
    expect(
      naParte
        .getByRole('meter', { name: 'Ciano' })
        .closest('[data-tinta]')
        ?.getAttribute('data-tinta'),
    ).toBe('ciano');
    expect(naParte.getByRole('meter', { name: 'Preto' }).getAttribute('aria-valuetext')).toBe(
      '15%',
    );
  });

  it('quando o toner acaba: a estimativa pela série, escrita como estimativa', async () => {
    const dia = 24 * 60 * 60_000;
    const inicio = Date.now() - 25 * dia;
    abrir(
      servidorComCapacidade(
        'snmp.suprimentos',
        () =>
          fichaDe({
            painelDeSuprimentos: painel({
              suprimentos: [
                suprimento('1', 'Black Toner', 'toner', { tipo: 'medido', percentual: 25 }),
              ],
            }),
          }),
        {
          'GET /api/ativos/a1/suprimentos/serie': () =>
            Response.json({
              itens: [
                {
                  item: '1',
                  descricao: 'Black Toner',
                  pontos: Array.from({ length: 26 }, (_, i) => ({
                    dia: new Date(inicio + i * dia).toISOString().slice(0, 10),
                    momento: new Date(inicio + i * dia).toISOString(),
                    percentual: 75 - 2 * i,
                  })),
                },
              ],
            }),
        },
      ),
    );
    const naParte = within(await parte());
    expect(
      await naParte.findByText(
        /^Acaba em cerca de 13 dias, pelas leituras desde \d{2}\/\d{2}\/\d{4}$/,
      ),
    ).toBeTruthy();
  });

  it('a impressora que não respondeu diz desde quando e guarda os níveis da última resposta', async () => {
    abrir(
      servidorComCapacidade('snmp.suprimentos', () =>
        fichaDe({
          painelDeSuprimentos: painel({
            resposta: {
              situacao: 'nao-respondeu',
              momento: antes(1),
              desde: antes(10),
              coletor: 'Coletor de Jundiaí',
            },
            suprimentos: [
              suprimento('1', 'Black', 'toner', { tipo: 'medido', percentual: 40 }, 11),
            ],
          }),
        }),
      ),
    );
    const regiao = await parte();
    const naParte = within(regiao);
    expect(
      naParte.getByText('Não respondeu').closest('[data-situacao]')?.getAttribute('data-situacao'),
    ).toBe('critico');
    expect(naParte.getByText(/^Não respondeu desde \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeTruthy();
    expect(linhas(regiao)).toEqual([['Toner · Black', '40%', 'há 11 min']]);
  });

  it('as condições com a severidade em texto, e as mensagens do fabricante à parte', async () => {
    abrir(
      servidorComCapacidade('snmp.suprimentos', () =>
        fichaDe({
          painelDeSuprimentos: painel({
            condicoes: {
              itens: [
                { chave: 'sem-papel', rotulo: 'Sem papel', severidade: 'critico' },
                { chave: 'pouco-papel', rotulo: 'Pouco papel', severidade: 'atencao' },
              ],
              momento: antes(3),
            },
            mensagens: { itens: ['Modo de economia de energia'], momento: antes(3) },
          }),
        }),
      ),
    );
    const regiao = await parte();
    const condicoes = bloco(regiao, 'Condições');
    expect(condicoes.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Sem papelCrítico',
      'Pouco papelAtenção',
    ]);
    const mensagens = bloco(regiao, 'Mensagens do fabricante');
    expect(mensagens.getByText('Modo de economia de energia')).toBeTruthy();
    expect(condicoes.queryByText('Modo de economia de energia')).toBeNull();
  });

  it('os contadores um a um, com o preto e branco pela diferença e o inconsistente marcado', async () => {
    abrir(
      servidorComCapacidade('snmp.suprimentos', () =>
        fichaDe({
          painelDeSuprimentos: painel({
            contadores: [
              {
                item: '1',
                rotulo: 'Total de páginas',
                paginas: 12500,
                inconsistente: false,
                momento: antes(3),
              },
              {
                item: '2',
                rotulo: 'Páginas coloridas',
                paginas: 2300,
                inconsistente: false,
                momento: antes(3),
              },
              {
                item: '3',
                rotulo: 'Contador 3',
                paginas: -4,
                inconsistente: true,
                momento: antes(3),
              },
            ],
            paginasEmPretoEBranco: 10200,
          }),
        }),
      ),
    );
    const contadores = bloco(await parte(), 'Contadores');
    expect(contadores.getByText('Páginas coloridas').nextElementSibling?.textContent).toBe('2.300');
    expect(contadores.getByText('Páginas em preto e branco').nextElementSibling?.textContent).toBe(
      '10.200',
    );
    expect(contadores.getByText('Contador 3').nextElementSibling?.textContent).toBe(
      '-4Inconsistente',
    );
  });

  it('sem leitura, diz "Não verificado" com o motivo, e a leitura velha diz "Desatualizado"', async () => {
    abrir(
      servidorComCapacidade('snmp.suprimentos', () =>
        fichaDe({
          painelDeSuprimentos: painel({
            motivo: 'Aguardando a primeira leitura.',
            resposta: null,
            suprimentos: [],
            contadores: [],
            paginasEmPretoEBranco: null,
            condicoes: null,
            mensagens: null,
            menor: null,
            total: null,
          }),
        }),
      ),
    );
    let naParte = within(await parte());
    expect(naParte.getByText('Não verificado')).toBeTruthy();
    expect(naParte.getByText('Aguardando a primeira leitura.')).toBeTruthy();
    expect(naParte.queryByRole('table')).toBeNull();
    expect(resumo('Suprimentos e contadores')).toBe('Não verificado');
    cleanup();

    abrir(
      servidorComCapacidade('snmp.suprimentos', () =>
        fichaDe({
          painelDeSuprimentos: painel({
            resposta: {
              situacao: 'respondeu',
              momento: antes(31),
              desde: antes(600),
              coletor: null,
            },
          }),
        }),
      ),
    );
    naParte = within(await parte());
    expect(naParte.getByText('há 31 min')).toBeTruthy();
    expect(naParte.getByText('Desatualizado')).toBeTruthy();
  });

  it('sem a capacidade no tipo, a ficha não mostra o painel', async () => {
    abrir(servidorDaFicha(() => fichaDe({ painelDeSuprimentos: null })));
    await titulo();
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    expect(nomesDosCartoes()).not.toContain('Suprimentos e contadores');
    expect(screen.queryByRole('region', { name: 'Suprimentos' })).toBeNull();
  });
});

// O valor gravado pela coleta, como o número de série que a impressora informa (spec
// impressoras-por-snmp, "Número de série pela coleta"): a origem com o coletor no lugar do autor.
describe('o valor gravado pela coleta', () => {
  it('mostra "Coleta" com o nome do coletor e o momento', async () => {
    abrir(
      servidorDaFicha(() =>
        fichaDe({
          serie: 'VNB3K12345',
          valores: { ...fichaDe().valores, 'ativo.serie': 'VNB3K12345' },
          estado: {
            ...fichaDe().estado,
            'ativo.serie': {
              origem: 'coleta',
              momento: '2026-10-09T17:22:00.000Z',
              autor: null,
              coletor: { id: '0199a6e0-0000-7000-8000-0000000000e1', nome: 'Coletor de Jundiaí' },
              trava: false,
            },
          },
        }),
      ),
    );
    await abrirCartao('Identificação');
    expect(
      await screen.findByText(/^Coleta · Coletor de Jundiaí · \d\d\/10\/2026 \d\d:22$/),
    ).toBeTruthy();
  });
});

// A saúde do Control iD na ficha (spec saude-do-control-id, "Situação do Control iD", e
// cadastro-de-ativos, "Control iD na ficha"; change p2c-saude-do-control-id, design, decisão 8):
// cada situação em texto, com um ícone próprio, nunca só pela cor.
describe('a saúde do Control iD na ficha', () => {
  // Meio minuto a mais, como na disponibilidade: a idade não cai para o minuto de baixo.
  const antes = (minutos: number) => new Date(Date.now() - (minutos + 0.5) * 60_000).toISOString();
  type Saude = NonNullable<Ficha['controlId']>;
  const saude = (extras: Partial<Saude> = {}): Saude => ({
    situacao: 'respondendo',
    momento: antes(2),
    desde: antes(90),
    motivo: null,
    ultimoContato: antes(2),
    firmware: '6.12.2',
    produto: 'iDAccess Pro',
    login: 'tipo',
    coletor: 'Coletor de Jundiaí',
    ...extras,
  });
  /** O painel, no cartão da capacidade. */
  const parte = async () => {
    await abrirCartao('Saúde do Control iD');
    return screen.findByRole('region', { name: 'Saúde do Control iD' });
  };
  const situacaoDe = (naParte: ReturnType<typeof within>, texto: string) =>
    naParte.getByText(texto).closest('[data-situacao]')?.getAttribute('data-situacao');

  it('mostra a situação, desde quando, a idade, o último contato, o firmware com o produto, o login e o coletor', async () => {
    abrir(servidorComCapacidade('controlid.saude', () => fichaDe({ controlId: saude() })));
    const naParte = within(await parte());
    expect(situacaoDe(naParte, 'Respondendo')).toBe('sucesso');
    expect(naParte.getAllByText('há 2 min').length).toBeGreaterThan(0);
    expect(naParte.getByText(/^Respondendo desde \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeTruthy();
    expect(naParte.getByText('Último contato').nextElementSibling?.textContent).toMatch(
      /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} · há 2 min$/,
    );
    expect(naParte.getByText('Firmware').nextElementSibling?.textContent).toBe(
      '6.12.2 · iDAccess Pro',
    );
    expect(naParte.getByText('Login do tipo')).toBeTruthy();
    expect(naParte.getByText('Coletor de Jundiaí')).toBeTruthy();
    expect(naParte.queryByText('Desatualizado')).toBeNull();
    expect(resumo('Saúde do Control iD')).toBe('Respondendo');
    expect(screen.getAllByRole('heading', { name: 'Saúde do Control iD' })).toHaveLength(1);
  });

  it('o controle sem resposta diz desde quando, com o último contato e o firmware da resposta', async () => {
    abrir(
      servidorComCapacidade('controlid.saude', () =>
        fichaDe({
          controlId: saude({
            situacao: 'sem-resposta',
            momento: antes(1),
            desde: antes(6),
            ultimoContato: antes(11),
          }),
        }),
      ),
    );
    const naParte = within(await parte());
    expect(situacaoDe(naParte, 'Sem resposta')).toBe('critico');
    expect(naParte.getByText(/^Sem resposta desde \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeTruthy();
    expect(naParte.getByText('Último contato').nextElementSibling?.textContent).toMatch(
      /há 11 min$/,
    );
    expect(naParte.getByText('Firmware').nextElementSibling?.textContent).toBe(
      '6.12.2 · iDAccess Pro',
    );
  });

  it('o login recusado e a resposta inesperada têm o texto e um ícone próprio cada', async () => {
    abrir(
      servidorComCapacidade('controlid.saude', () =>
        fichaDe({ controlId: saude({ situacao: 'login-recusado' }) }),
      ),
    );
    expect(situacaoDe(within(await parte()), 'Login recusado')).toBe('atencao');
    cleanup();
    abrir(
      servidorComCapacidade('controlid.saude', () =>
        fichaDe({ controlId: saude({ situacao: 'resposta-inesperada', login: 'controle' }) }),
      ),
    );
    const naParte = within(await parte());
    expect(situacaoDe(naParte, 'Resposta inesperada')).toBe('info');
    expect(naParte.getByText('Login próprio do controle')).toBeTruthy();
  });

  it('o não verificado diz o motivo, e sem contato nenhum diz isso', async () => {
    abrir(
      servidorComCapacidade('controlid.saude', () =>
        fichaDe({
          controlId: saude({
            situacao: 'nao-verificado',
            momento: null,
            desde: null,
            motivo: 'Há mais de um login ligado a este controle no cofre.',
            ultimoContato: null,
            firmware: null,
            produto: null,
            login: null,
            coletor: null,
          }),
        }),
      ),
    );
    const naParte = within(await parte());
    expect(situacaoDe(naParte, 'Não verificado')).toBe('neutra');
    expect(naParte.getByText('Há mais de um login ligado a este controle no cofre.')).toBeTruthy();
    expect(naParte.getByText('Último contato').nextElementSibling?.textContent).toBe(
      'Nenhum contato ainda.',
    );
    expect(naParte.queryByText('Firmware')).toBeNull();
  });

  // O login escolhido na ficha do controle (spec saude-do-control-id, "Login escolhido na ficha do
  // controle"; change login-de-cada-controle, design, decisão 5).
  describe('o "Escolher login"', () => {
    const LOGINS = [
      { id: 's-norte', nome: 'Portaria norte' },
      { id: 's-sul', nome: 'Portaria sul' },
    ];
    const comEscolha = (extras: Partial<Ficha> = {}) =>
      fichaDe({
        permite: { ...fichaDe().permite, escolherLoginDoControle: true },
        ...extras,
      });
    const selecaoDoLogin = (dialogo: HTMLElement) =>
      within(dialogo).getByRole('button', { name: /Login deste controle$/ });
    const abrirDialogo = async () => {
      fireEvent.click(within(await parte()).getByRole('button', { name: 'Escolher login' }));
      return screen.findByRole('dialog', { name: 'Login do controle' });
    };

    it('quem administra o cofre escolhe o login do controle, e a ficha diz de onde ele vem', async () => {
      const corpos: unknown[] = [];
      let login: 'tipo' | 'controle' = 'tipo';
      abrir(
        servidorComCapacidade(
          'controlid.saude',
          () => comEscolha({ controlId: saude({ login }) }),
          {
            'GET /api/cofre/controles/a1/login': () =>
              Response.json({ logins: LOGINS, proprio: null, tipoTemLogin: true }),
            'PUT /api/cofre/controles/a1/login': async (pedido) => {
              corpos.push(await pedido.json());
              login = 'controle';
              return Response.json({ logins: LOGINS, proprio: 's-norte', tipoTemLogin: true });
            },
          },
        ),
      );
      const dialogo = await abrirDialogo();
      await waitFor(() => expect(selecaoDoLogin(dialogo).textContent).toContain('Login do tipo'));
      expect(
        within(dialogo).getByText(
          'O coletor usa o login novo na próxima configuração, em até 5 minutos.',
        ),
      ).toBeTruthy();
      fireEvent.click(selecaoDoLogin(dialogo));
      expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
        'Login do tipo',
        'Portaria norte',
        'Portaria sul',
      ]);
      fireEvent.click(screen.getByRole('option', { name: 'Portaria norte' }));
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(avisos()).toContain('Login do controle salvo.'));
      expect(corpos).toEqual([{ segredoId: 's-norte' }]);
      expect(screen.queryByRole('dialog', { name: 'Login do controle' })).toBeNull();
      expect(
        await within(screen.getByRole('region', { name: 'Saúde do Control iD' })).findByText(
          'Login próprio do controle',
        ),
      ).toBeTruthy();
    });

    it('no tipo sem login, a primeira opção é "Nenhum", e a recusa aparece no diálogo', async () => {
      const recusa =
        'Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido.';
      abrir(
        servidorComCapacidade(
          'controlid.saude',
          () => comEscolha({ controlId: saude({ login: 'controle' }) }),
          {
            'GET /api/cofre/controles/a1/login': () =>
              Response.json({ logins: LOGINS, proprio: 's-sul', tipoTemLogin: false }),
            'PUT /api/cofre/controles/a1/login': () =>
              problema(400, 'Confira os campos indicados.', { segredoId: recusa }),
          },
        ),
      );
      const dialogo = await abrirDialogo();
      await waitFor(() => expect(selecaoDoLogin(dialogo).textContent).toContain('Portaria sul'));
      fireEvent.click(selecaoDoLogin(dialogo));
      expect(screen.getAllByRole('option')[0]?.textContent).toBe('Nenhum');
      fireEvent.click(screen.getByRole('option', { name: 'Portaria norte' }));
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
      expect(await within(dialogo).findByText(recusa)).toBeTruthy();
      expect(screen.getByRole('dialog', { name: 'Login do controle' })).toBeTruthy();
    });

    it('sem a permissão, o cartão diz de onde vem o login, sem "Escolher login"', async () => {
      abrir(servidorComCapacidade('controlid.saude', () => fichaDe({ controlId: saude() })));
      const naParte = within(await parte());
      expect(naParte.getByText('Login do tipo')).toBeTruthy();
      expect(naParte.queryByRole('button', { name: 'Escolher login' })).toBeNull();
    });
  });

  it('a sondagem de mais de 15 minutos diz "Desatualizado"', async () => {
    abrir(
      servidorComCapacidade('controlid.saude', () =>
        fichaDe({ controlId: saude({ momento: antes(16) }) }),
      ),
    );
    const naParte = within(await parte());
    expect(naParte.getByText('Desatualizado')).toBeTruthy();
  });

  it('sem a capacidade no tipo, a ficha não mostra a saúde', async () => {
    abrir(servidorDaFicha(() => fichaDe({ controlId: null })));
    await titulo();
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    expect(nomesDosCartoes()).not.toContain('Saúde do Control iD');
    expect(screen.queryByRole('region', { name: 'Saúde do Control iD' })).toBeNull();
  });
});

// O fornecedor no ativo (spec cadastro-de-ativos, "Referências do ativo" e "Cadastro pedido por um
// campo do ativo", e campos-personalizados; change p4a-fornecedores, design, decisões 3 e 7).
describe('o fornecedor na ficha', () => {
  const HP_BRASIL = '0199a6e0-0000-7000-8000-0000000000f1';
  const LOCADORA = '0199a6e0-0000-7000-8000-0000000000f3';
  const ESCOLHA = {
    fornecedores: [
      { id: HP_BRASIL, nome: 'HP Brasil', cnpj: '12.345.678/0001-95' },
      { id: LOCADORA, nome: 'Locadora Norte', cnpj: null },
    ],
  };
  /** A ficha com a HP Brasil de fornecedor, pelo nome que a API manda nas referências. */
  const comAHp = (extras: Partial<Ficha> = {}) => {
    const base = fichaDe();
    return fichaDe({
      valores: { ...base.valores, 'ativo.fornecedor': HP_BRASIL },
      referencias: { ...base.referencias, fornecedores: { [HP_BRASIL]: 'HP Brasil' } },
      ...extras,
    });
  };
  const comAEscolha = (ficha: () => Ficha, extras: ServidorDeTeste = {}) =>
    servidorDaFicha(ficha, {
      'GET /api/fornecedores/escolha': () => Response.json(ESCOLHA),
      ...extras,
    });

  it('o cartão Administrativo diz o fornecedor pelo nome, e a escolha troca entre os ativos', async () => {
    const corpos: unknown[] = [];
    abrir(
      comAEscolha(comAHp, {
        'PATCH /api/ativos/a1': async (pedido) => {
          corpos.push(await pedido.json());
          return Response.json(comAHp());
        },
      }),
    );
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    expect(resumo('Administrativo')).toBe('HP Brasil');
    await abrirCartao('Administrativo');
    const fornecedor = screen.getByRole('combobox', { name: 'Fornecedor' }) as HTMLInputElement;
    expect(fornecedor.value).toBe('HP Brasil');
    fornecedor.focus();
    fireEvent.change(fornecedor, { target: { value: 'loca' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Locadora Norte' }));
    await waitFor(() => expect(resumo('Administrativo')).toBe('Locadora Norte'));
    expect(screen.getByText('1 alteração não salva')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Ativo salvo.'));
    expect(corpos).toEqual([{ valores: { 'ativo.fornecedor': LOCADORA } }]);
  });

  it('quem só vê lê o fornecedor como referência, que leva à ficha dele com fornecedores.ver', async () => {
    const soVer = {
      permite: { editar: false, verRestritos: false, editarRestritos: false, verResponsavel: true },
    };
    abrir(
      comAEscolha(() => comAHp(soVer)),
      naOrganizacao('ativos.ver', 'fornecedores.ver'),
    );
    await abrirCartao('Administrativo');
    expect(screen.getByRole('link', { name: 'HP Brasil' }).getAttribute('href')).toBe(
      `/administracao/fornecedores/${HP_BRASIL}`,
    );
    cleanup();

    abrir(
      comAEscolha(() => comAHp(soVer)),
      naOrganizacao('ativos.ver'),
    );
    await abrirCartao('Administrativo');
    expect(screen.queryByRole('link', { name: 'HP Brasil' })).toBeNull();
    expect(paragrafo('Fornecedor: HP Brasil')).toBeTruthy();
  });

  it('"Cadastrar novo fornecedor" volta com o fornecedor no campo e no resumo do cartão', async () => {
    abrir(
      comAEscolha(() => fichaDe(), {
        'POST /api/fornecedores': () =>
          Response.json(
            {
              id: HP_BRASIL,
              nome: 'HP Brasil',
              cnpj: '12.345.678/0001-95',
              contato: null,
              email: null,
              telefone: null,
              observacoes: null,
              situacao: 'ativo',
              criadoEm: '2026-10-19T12:00:00.000Z',
              atualizadoEm: '2026-10-19T12:00:00.000Z',
              permite: { editar: true },
            },
            { status: 201 },
          ),
      }),
      naOrganizacao('ativos.editar', 'ativos.ver', 'fornecedores.ver', 'fornecedores.editar'),
    );
    await abrirCartao('Administrativo');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo fornecedor' }));
    await screen.findByRole('heading', { level: 1, name: 'Novo fornecedor' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'HP Brasil' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'CNPJ' }), {
      target: { value: '12.345.678/0001-95' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    const fornecedor = (await screen.findByRole('combobox', {
      name: 'Fornecedor',
    })) as HTMLInputElement;
    await waitFor(() => expect(fornecedor.value).toBe('HP Brasil'));
    expect(resumo('Administrativo')).toBe('HP Brasil');
  });

  it('o campo da organização do tipo fornecedor escolhe entre os ativos', async () => {
    const ASSISTENCIA = campo('c-assistencia', 'Assistência técnica', { tipo: 'fornecedor' });
    abrir(
      comAEscolha(() => fichaDe(), {
        'GET /api/tipos-de-ativo': () =>
          Response.json({
            tipos: [
              {
                ...IMPRESSORA,
                campos: [...IMPRESSORA.campos, { campoId: 'c-assistencia', obrigatorio: false }],
              },
            ],
            permite: { cadastrar: false },
          }),
        'GET /api/campos': () =>
          Response.json({ campos: [...CAMPOS, ASSISTENCIA], permite: { cadastrar: false } }),
      }),
    );
    await abrirCartao('Outros');
    const assistencia = screen.getByRole('combobox', {
      name: 'Assistência técnica',
    }) as HTMLInputElement;
    assistencia.focus();
    fireEvent.change(assistencia, { target: { value: 'locadora' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Locadora Norte' }));
    await waitFor(() => expect(assistencia.value).toBe('Locadora Norte'));
  });
});

describe('os consumíveis compatíveis na ficha', () => {
  // Spec cadastro-de-ativos, "Consumíveis compatíveis na ficha do ativo" e "Aba Dados em cartões";
  // change p4b-consumiveis, design, decisões 5 a 7.
  type Compativel = NonNullable<Ficha['consumiveisCompativeis']>[number];
  const compativel = (
    id: string,
    codigo: string,
    extras: Partial<Compativel> = {},
  ): Compativel => ({
    id,
    codigo,
    nome: null,
    tipo: 'toner',
    cor: null,
    rendimento: null,
    saldo: null,
    ...extras,
  });
  const CF258A = compativel('cf258a', 'CF258A', { nome: 'HP 58A', cor: 'preto', rendimento: 3000 });
  const CF258X = compativel('cf258x', 'CF258X', { nome: 'HP 58X', cor: 'preto' });
  const CF232A = compativel('cf232a', 'CF232A', { tipo: 'cilindro' });
  const comCompativeis = (ficha: () => Ficha) =>
    servidorComCapacidade('consumiveis.compatibilidade', ficha);
  const CARTAO = 'Consumíveis compatíveis';

  it('Toner da impressora: o painel mostra cada compatível com o tipo, a cor e o rendimento', async () => {
    abrir(comCompativeis(() => fichaDe({ consumiveisCompativeis: [CF258A] })));
    await abrirCartao(CARTAO);
    const lista = screen.getByRole('list', { name: CARTAO });
    expect(within(lista).getByText('CF258A')).toBeTruthy();
    expect(within(lista).getByText('HP 58A')).toBeTruthy();
    expect(within(lista).getByText('Toner · Preto')).toBeTruthy();
    expect(within(lista).getByText('3.000 páginas')).toBeTruthy();
    // Sem ver os consumíveis, o código não leva à ficha do consumível.
    expect(screen.queryByRole('link', { name: 'CF258A' })).toBeNull();
  });

  it('quem vê os consumíveis abre a ficha do consumível pelo código', async () => {
    abrir(
      comCompativeis(() => fichaDe({ consumiveisCompativeis: [CF258A] })),
      naOrganizacao('ativos.ver', 'consumiveis.ver'),
    );
    await abrirCartao(CARTAO);
    expect(screen.getByRole('link', { name: 'CF258A' }).getAttribute('href')).toBe(
      '/operacao/consumiveis/cf258a',
    );
  });

  it('Resumo dos consumíveis compatíveis: o cartão diz os dois primeiros códigos e quantos mais', async () => {
    abrir(comCompativeis(() => fichaDe({ consumiveisCompativeis: [CF258A, CF258X, CF232A] })));
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    await waitFor(() => expect(resumo(CARTAO)).toBe('CF258A · CF258X e mais 1'));
  });

  it('Impressora sem modelo: o cartão diz "Sem modelo", e o painel pede o modelo', async () => {
    abrir(comCompativeis(() => fichaDe({ modelo: null, consumiveisCompativeis: [] })));
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    await waitFor(() => expect(resumo(CARTAO)).toBe('Sem modelo'));
    await abrirCartao(CARTAO);
    expect(
      screen.getByText('Escolha o modelo do ativo para ver os consumíveis compatíveis.'),
    ).toBeTruthy();
  });

  it('o modelo sem nenhum compatível: o cartão e o painel dizem isso', async () => {
    abrir(comCompativeis(() => fichaDe({ consumiveisCompativeis: [] })));
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    await waitFor(() => expect(resumo(CARTAO)).toBe('Nenhum compatível'));
    await abrirCartao(CARTAO);
    expect(screen.getByText('Nenhum consumível compatível com o modelo.')).toBeTruthy();
  });

  it('sem a capacidade no tipo ou com o Operação desligado, a ficha não tem o cartão', async () => {
    abrir(comCompativeis(() => fichaDe({ consumiveisCompativeis: null })));
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    expect(nomesDosCartoes()).not.toContain(CARTAO);
  });

  it('Toner incluído com a ficha da impressora aberta: o evento dos consumíveis relê a ficha', async () => {
    let compativeis = [CF258A];
    const { canal } = abrir(comCompativeis(() => fichaDe({ consumiveisCompativeis: compativeis })));
    await screen.findByRole('navigation', { name: 'Grupos da ficha' });
    await waitFor(() => expect(resumo(CARTAO)).toBe('CF258A'));
    compativeis = [CF258A, CF258X];
    canal.publicar({
      id: 'e1',
      tipo: 'consumiveis.mudaram',
      momento: '2026-10-19T12:00:00.000Z',
      alvo: { tipo: 'consumivel', id: 'cf258x' },
    });
    await waitFor(() => expect(resumo(CARTAO)).toBe('CF258A · CF258X'));
  });

  // Spec cadastro-de-ativos, "Consumíveis compatíveis na ficha do ativo"; change p4c-estoque.
  it('Toner em estoque: cada compatível mostra o saldo somado nos locais que a conta vê', async () => {
    abrir(
      comCompativeis(() =>
        fichaDe({
          consumiveisCompativeis: [{ ...CF258A, saldo: 9 }, { ...CF258X, saldo: 0 }, CF232A],
        }),
      ),
      naOrganizacao('ativos.ver', 'estoque.ver'),
    );
    await abrirCartao(CARTAO);
    const [cf258a, cf258x, cf232a] = within(
      screen.getByRole('list', { name: CARTAO }),
    ).getAllByRole('listitem');
    expect(cf258a?.textContent).toContain('9 em estoque');
    expect(cf258x?.textContent).toContain('Sem estoque');
    expect(cf232a?.textContent).not.toContain('estoque');
    // Quem só vê o estoque não registra a saída.
    expect(screen.queryByRole('button', { name: /Registrar saída/ })).toBeNull();
  });

  it('Troca do toner pela ficha: "Registrar saída" abre a saída do consumível para o ativo', async () => {
    const { roteador } = abrir(
      comCompativeis(() => fichaDe({ consumiveisCompativeis: [{ ...CF258A, saldo: 9 }] })),
      naOrganizacao('ativos.ver', 'estoque.ver', 'estoque.movimentar'),
    );
    await abrirCartao(CARTAO);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar saída do CF258A' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/estoque'));
    expect(roteador.state.location.search).toMatchObject({
      lancar: 'saida',
      consumivel: 'cf258a',
      ativo: 'a1',
    });
  });

  it('a saída lançada com a ficha aberta: o evento do estoque relê a ficha', async () => {
    let saldo = 9;
    const { canal } = abrir(
      comCompativeis(() => fichaDe({ consumiveisCompativeis: [{ ...CF258A, saldo }] })),
      naOrganizacao('ativos.ver', 'estoque.ver'),
    );
    await abrirCartao(CARTAO);
    expect(await screen.findByText('9 em estoque')).toBeTruthy();
    saldo = 8;
    canal.publicar({
      id: 'e1',
      tipo: 'estoque.mudou',
      momento: '2026-10-21T12:00:00.000Z',
      alvo: { tipo: 'consumivel', id: 'cf258a' },
    });
    expect(await screen.findByText('8 em estoque')).toBeTruthy();
  });
});

// Os softwares do agente do GLPI na ficha (spec inventario-pelo-agente, "Softwares na ficha do
// ativo"; change inventario-pelo-agente-glpi): a aba nos tipos com o inventário de hardware, a
// busca pelo nome ou pelo editor, a contagem, a data do inventário e a aba sem a lista.
describe('a aba Softwares', () => {
  const SOFTWARES = {
    softwares: [
      { nome: '7-Zip 23.01 (x64)', versao: '23.01', editor: 'Igor Pavlov', instaladoEm: null },
      {
        nome: 'Microsoft Office Professional Plus 2019',
        versao: '16.0',
        editor: 'Microsoft Corporation',
        instaladoEm: '2024-03-02',
      },
      { nome: 'Zoom', versao: '5.17', editor: 'Zoom Video', instaladoEm: '2024-05-10' },
    ],
    inventariadoEm: '2026-10-28T09:00:00.000Z',
  };

  it('Softwares do computador: a busca acha pelo nome e pelo editor', async () => {
    const servidor: ServidorDeTeste = {
      ...servidorComCapacidade('hardware.inventario', () => fichaDe()),
      'GET /api/ativos/a1/softwares': () => Response.json(SOFTWARES),
    };
    abrir(servidor, naOrganizacao('ativos.ver'), '/ativos/a1?aba=softwares');
    const tabela = await screen.findByRole('grid', { name: 'Softwares instalados' });
    expect(within(tabela).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('3 softwares')).toBeTruthy();
    expect(screen.getByText(/Do inventário do agente do GLPI em/)).toBeTruthy();
    expect(within(tabela).getByText('02/03/2024')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /^Buscar software/ }), {
      target: { value: 'office' },
    });
    expect(await screen.findByText('1 de 3 softwares')).toBeTruthy();
    expect(within(tabela).getByText('Microsoft Office Professional Plus 2019')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /^Buscar software/ }), {
      target: { value: 'pavlov' },
    });
    expect(await within(tabela).findByText('7-Zip 23.01 (x64)')).toBeTruthy();
  });

  it('sem a lista, a aba diz que o agente ainda não a mandou; o tipo sem o inventário não tem a aba', async () => {
    const servidor: ServidorDeTeste = {
      ...servidorComCapacidade('hardware.inventario', () => fichaDe()),
      'GET /api/ativos/a1/softwares': () => Response.json({ softwares: [], inventariadoEm: null }),
    };
    abrir(servidor, naOrganizacao('ativos.ver'), '/ativos/a1?aba=softwares');
    expect(
      await screen.findByText(
        'O agente do GLPI ainda não mandou a lista dos softwares desta máquina.',
      ),
    ).toBeTruthy();
    cleanup();
    abrir(
      servidorDaFicha(() => fichaDe()),
      naOrganizacao('ativos.ver'),
    );
    await titulo();
    expect(screen.queryByRole('tab', { name: 'Softwares' })).toBeNull();
  });

  // As distribuições de software para a máquina (change distribuicao-de-software).
  it('a aba mostra as distribuições da máquina, com a situação, e leva à ficha delas', async () => {
    const servidor: ServidorDeTeste = {
      ...servidorComCapacidade('hardware.inventario', () => fichaDe()),
      'GET /api/ativos/a1/softwares': () => Response.json(SOFTWARES),
      'GET /api/ativos/a1/distribuicoes': () =>
        Response.json({
          distribuicoes: [
            {
              distribuicaoId: 'd1',
              pacote: { nome: '7-Zip 23.01', versao: '23.01' },
              situacao: { chave: 'concluida', texto: 'Concluída', tipo: 'sucesso' },
              criadaEm: '2026-10-28T12:00:00.000Z',
              terminadaEm: '2026-10-28T12:05:00.000Z',
            },
          ],
        }),
    };
    abrir(servidor, naOrganizacao('ativos.ver'), '/ativos/a1?aba=softwares');
    const tabela = await screen.findByRole('grid', { name: 'Distribuições do ativo' });
    expect(await within(tabela).findByText('Concluída')).toBeTruthy();
    expect(
      within(tabela).getByRole('link', { name: '7-Zip 23.01 · 23.01' }).getAttribute('href'),
    ).toBe('/gestao/software/distribuicoes/d1');
  });
});
