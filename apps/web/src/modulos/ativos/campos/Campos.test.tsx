import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Campo = components['schemas']['Campo'];
type Tipo = components['schemas']['TipoDeAtivo'];

const campo = (id: string, rotulo: string, extras: Partial<Campo> = {}): Campo => ({
  id,
  rotulo,
  tipo: 'texto',
  grupo: null,
  configuracao: {},
  restrito: false,
  escrita: 'automatica',
  situacao: 'ativo',
  usadoPor: 0,
  permite: { editar: true },
  ...extras,
});

const IP = campo('ip', 'IP', { tipo: 'ip', grupo: 'Rede', usadoPor: 2 });
const CRITICIDADE = campo('criticidade', 'Criticidade', {
  tipo: 'lista',
  grupo: 'Uso',
  restrito: true,
  escrita: 'manual',
  usadoPor: 1,
  configuracao: {
    opcoes: [
      { id: 'op-media', rotulo: 'Media', situacao: 'ativa' },
      { id: 'op-baixa', rotulo: 'Baixa', situacao: 'ativa' },
    ],
  },
});
const TENSAO = campo('tensao', 'Tensão', { situacao: 'inativo' });

const tipo = (id: string, nome: string, campos: string[]): Tipo => ({
  id,
  nome,
  icone: 'generico',
  capacidades: [],
  configuracaoDasCapacidades: {},
  primeiroCartao: null,
  campos: campos.map((campoId) => ({ campoId, obrigatorio: false })),
  situacao: 'ativo',
  permite: { editar: true },
});

const TIPOS = [
  tipo('impressora', 'Impressora', ['ip', 'criticidade']),
  tipo('switch', 'Switch', ['ip']),
];

const problema = (status: number, codigo: string, detalhe: string, campos?: object) =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      ...(campos && { campos }),
    },
    { status },
  );

const catalogo = (campos: Campo[], cadastrar = true): ServidorDeTeste => ({
  'GET /api/campos': () => Response.json({ campos, permite: { cadastrar } }),
  'GET /api/tipos-de-ativo': () => Response.json({ tipos: TIPOS, permite: { cadastrar } }),
});

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('catalogo.administrar'),
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
const campoDeTexto = (rotulo: string) =>
  screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement;

async function escolherTipoDoCampo(tipoDoCampo: string) {
  fireEvent.click(screen.getByRole('button', { name: /Tipo do campo/ }));
  fireEvent.click(await screen.findByRole('option', { name: tipoDoCampo }));
}

describe('lista de campos', () => {
  it('mostra os campos ativos com o tipo, o grupo, o uso, a marca de restrito e a situação', async () => {
    const roteador = abrir('/gestao/catalogo/campos', catalogo([IP, CRITICIDADE, TENSAO]));
    const tabela = await screen.findByRole('grid', { name: 'Campos' });
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((coluna) => coluna.textContent),
    ).toEqual(['Rótulo', 'Tipo', 'Grupo', 'Uso', 'Restrito', 'Situação']);
    expect(
      within(tabela)
        .getAllByRole('row')
        .slice(1)
        .map((linha) => linha.textContent),
    ).toEqual(['IPIPRedeUsado por 2 tiposNãoAtivo', 'CriticidadeListaUsoUsado por 1 tipoSimAtivo']);
    fireEvent.click(screen.getByRole('radio', { name: 'Inativos' }));
    await waitFor(() =>
      expect(
        within(tabela)
          .getAllByRole('row')
          .slice(1)
          .map((l) => l.textContent),
      ).toEqual(['TensãoTextoSem grupoNenhum tipoNãoInativo']),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }));
    fireEvent.click(await within(tabela).findByText('Criticidade'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/campos/criticidade'),
    );
  });

  it('sem nenhum campo, diz isso e oferece o cadastro', async () => {
    abrir('/gestao/catalogo/campos', catalogo([]));
    expect(await screen.findByText('Nenhum campo ainda.')).toBeTruthy();
  });
});

describe('campo novo', () => {
  it('o grupo abre pelo clique, com os grupos já usados, sem digitar', async () => {
    abrir('/gestao/catalogo/campos/novo', catalogo([IP]));
    await screen.findByRole('button', { name: 'Cadastrar' });
    // Os grupos vêm dos campos, que chegam depois do formulário.
    await waitFor(() => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Grupo' }));
      expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual(['Rede']);
    });
  });

  it('cadastra uma lista com as opções, o grupo, a marca de restrito e a escrita manual', async () => {
    const corpos: unknown[] = [];
    const servidor = catalogo([IP]);
    servidor['POST /api/campos'] = async (pedido) => {
      corpos.push(await pedido.json());
      return Response.json(CRITICIDADE, { status: 201 });
    };
    const roteador = abrir('/gestao/catalogo/campos/novo', servidor);
    await screen.findByRole('button', { name: 'Cadastrar' });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe o rótulo do campo.')).toBeTruthy();
    expect(corpos).toEqual([]);

    fireEvent.change(campoDeTexto('Rótulo'), { target: { value: ' Criticidade ' } });
    await escolherTipoDoCampo('Lista');
    fireEvent.change(screen.getByRole('combobox', { name: 'Grupo' }), { target: { value: 'Uso' } });
    fireEvent.click(screen.getByRole('button', { name: 'Incluir opção' }));
    fireEvent.change(campoDeTexto('Opção 1'), { target: { value: 'Média' } });
    fireEvent.click(screen.getByRole('button', { name: 'Incluir opção' }));
    fireEvent.change(campoDeTexto('Opção 2'), { target: { value: 'Baixa' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /^Restrito/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Só a edição manual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/campos/criticidade'),
    );
    expect(corpos).toEqual([
      {
        rotulo: 'Criticidade',
        tipo: 'lista',
        grupo: 'Uso',
        configuracao: {
          opcoes: [
            { rotulo: 'Média', situacao: 'ativa' },
            { rotulo: 'Baixa', situacao: 'ativa' },
          ],
        },
        restrito: true,
        escrita: 'manual',
      },
    ]);
    expect(avisos()).toContain('Campo cadastrado.');
  });

  it('confere os limites de um número antes de enviar, pelas regras do domínio', async () => {
    const corpos: unknown[] = [];
    const servidor = catalogo([]);
    servidor['POST /api/campos'] = async (pedido) => {
      corpos.push(await pedido.json());
      return Response.json(campo('portas', 'Portas', { tipo: 'inteiro' }), { status: 201 });
    };
    abrir('/gestao/catalogo/campos/novo', servidor);
    await screen.findByRole('button', { name: 'Cadastrar' });
    fireEvent.change(campoDeTexto('Rótulo'), { target: { value: 'Portas' } });
    await escolherTipoDoCampo('Número inteiro');
    fireEvent.change(campoDeTexto('Mínimo'), { target: { value: '64' } });
    fireEvent.change(campoDeTexto('Máximo'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('O mínimo não pode passar do máximo.')).toBeTruthy();
    expect(corpos).toEqual([]);
    fireEvent.change(campoDeTexto('Mínimo'), { target: { value: '1' } });
    fireEvent.change(campoDeTexto('Máximo'), { target: { value: '1.024' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(corpos).toHaveLength(1));
    expect(corpos[0]).toMatchObject({ tipo: 'inteiro', configuracao: { minimo: 1, maximo: 1024 } });
  });
});

describe('o campo do tipo ativo', () => {
  // Os tipos aceitos se guardam pelo id, que o domínio confere como uuid.
  const COMPUTADOR = '0199a6e0-0000-7000-8000-00000000c001';
  const NOTEBOOK = '0199a6e0-0000-7000-8000-00000000c002';
  const NOBREAK = '0199a6e0-0000-7000-8000-00000000c003';
  const TIPOS_DE_ATIVO = [
    tipo(COMPUTADOR, 'Computador', []),
    tipo(NOTEBOOK, 'Notebook', []),
    { ...tipo(NOBREAK, 'Nobreak', []), situacao: 'inativo' as const },
  ];
  const DO_MONITOR = campo('do-monitor', 'Computador', {
    tipo: 'ativo',
    configuracao: { tipos: [COMPUTADOR, NOBREAK], ladoDeLa: 'Monitores' },
  });
  const comTipos = (campos: Campo[]): ServidorDeTeste => ({
    ...catalogo(campos),
    'GET /api/tipos-de-ativo': () =>
      Response.json({ tipos: TIPOS_DE_ATIVO, permite: { cadastrar: true } }),
  });
  const aceitos = () => screen.getByRole('group', { name: 'Tipos aceitos' });

  it('cadastra com os tipos aceitos, entre os ativos, e o nome do lado de lá', async () => {
    const corpos: unknown[] = [];
    const servidor = comTipos([]);
    servidor['POST /api/campos'] = async (pedido) => {
      corpos.push(await pedido.json());
      return Response.json(DO_MONITOR, { status: 201 });
    };
    abrir('/gestao/catalogo/campos/novo', servidor);
    await screen.findByRole('button', { name: 'Cadastrar' });
    fireEvent.change(campoDeTexto('Rótulo'), { target: { value: 'Computador' } });
    await escolherTipoDoCampo('Ativo');
    expect(
      (
        await within(await screen.findByRole('group', { name: 'Tipos aceitos' })).findAllByRole(
          'checkbox',
        )
      ).map((caixa) => caixa.closest('label')?.textContent),
    ).toEqual(['Computador', 'Notebook']);
    expect(
      screen.getByText('Sem nenhum marcado, o campo aceita ativos de qualquer tipo.'),
    ).toBeTruthy();
    fireEvent.click(within(aceitos()).getByRole('checkbox', { name: 'Notebook' }));
    fireEvent.click(within(aceitos()).getByRole('checkbox', { name: 'Computador' }));
    fireEvent.change(campoDeTexto('Nome do lado de lá'), { target: { value: ' Monitores ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(corpos).toHaveLength(1));
    expect(corpos[0]).toMatchObject({
      rotulo: 'Computador',
      tipo: 'ativo',
      configuracao: { tipos: [COMPUTADOR, NOTEBOOK], ladoDeLa: 'Monitores' },
    });
  });

  it('na ficha, os aceitos marcados, o inativo guardado à vista, e a recusa da API nos tipos', async () => {
    const corpos: unknown[] = [];
    const servidor = comTipos([DO_MONITOR]);
    servidor['PATCH /api/campos/do-monitor'] = async (pedido) => {
      corpos.push(await pedido.json());
      return problema(409, 'conflito', 'O tipo Nobreak está inativo.', {
        'configuracao.tipos': 'O tipo Nobreak está inativo.',
      });
    };
    abrir('/gestao/catalogo/campos/do-monitor', servidor);
    await screen.findByRole('heading', { level: 1, name: /Computador/ });
    const marcadas = () =>
      within(aceitos())
        .getAllByRole('checkbox')
        .map((caixa) => [caixa.closest('label')?.textContent, (caixa as HTMLInputElement).checked]);
    await waitFor(() =>
      expect(marcadas()).toEqual([
        ['Computador', true],
        ['Notebook', false],
        ['Nobreak (inativo)', true],
      ]),
    );
    expect(campoDeTexto('Nome do lado de lá').value).toBe('Monitores');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await within(aceitos()).findByText('O tipo Nobreak está inativo.')).toBeTruthy();
    expect(corpos[0]).toMatchObject({
      configuracao: { tipos: [COMPUTADOR, NOBREAK], ladoDeLa: 'Monitores' },
    });
  });

  it('sem catalogo.administrar, os tipos aceitos e o lado de lá são só leitura', async () => {
    abrir(
      '/gestao/catalogo/campos/do-monitor',
      { ...comTipos([{ ...DO_MONITOR, permite: { editar: false } }]) },
      naOrganizacao('modelos.editar'),
    );
    await screen.findByRole('heading', { level: 1, name: /Computador/ });
    await waitFor(() => expect(campoDeTexto('Nome do lado de lá').readOnly).toBe(true));
    for (const caixa of within(aceitos()).getAllByRole('checkbox')) {
      expect(caixa.getAttribute('aria-readonly') ?? caixa.closest('[data-readonly]')).toBeTruthy();
    }
  });
});

describe('ficha do campo', () => {
  it('mostra o tipo só para leitura e os tipos que usam o campo', async () => {
    abrir('/gestao/catalogo/campos/ip', catalogo([IP]));
    const titulo = await screen.findByRole('heading', { level: 1, name: /IP/ });
    expect(titulo.textContent).toContain('Ativo');
    expect(screen.queryByRole('button', { name: /Tipo do campo/ })).toBeNull();
    expect(screen.getByText('Tipo do campo: IP')).toBeTruthy();
    const usam = screen.getByRole('list', { name: 'Tipos que usam o campo' });
    expect(
      within(usam)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Impressora', 'Switch']);
  });

  it('renomeia e inativa uma opção, com os ids, e a recusa aparece nas opções', async () => {
    const corpos: unknown[] = [];
    const servidor = catalogo([CRITICIDADE]);
    servidor['PATCH /api/campos/criticidade'] = async (pedido) => {
      corpos.push(await pedido.json());
      return corpos.length === 1
        ? problema(409, 'conflito', 'As opções não são excluídas: inative a opção.', {
            'configuracao.opcoes': 'As opções não são excluídas: inative a opção.',
          })
        : Response.json(CRITICIDADE);
    };
    abrir('/gestao/catalogo/campos/criticidade', servidor);
    await screen.findByRole('heading', { level: 1, name: /Criticidade/ });
    fireEvent.change(await screen.findByRole('textbox', { name: 'Opção 1' }), {
      target: { value: 'Média' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inativar Baixa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('As opções não são excluídas: inative a opção.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Campo salvo.'));
    expect(corpos[1]).toEqual({
      rotulo: 'Criticidade',
      grupo: 'Uso',
      configuracao: {
        opcoes: [
          { id: 'op-media', rotulo: 'Média', situacao: 'ativa' },
          { id: 'op-baixa', rotulo: 'Baixa', situacao: 'inativa' },
        ],
      },
      restrito: true,
      escrita: 'manual',
    });
  });

  it('a inativação diz de quantos tipos o campo sai', async () => {
    const servidor = catalogo([IP]);
    servidor['POST /api/campos/ip/inativacao'] = () =>
      Response.json({ ...IP, situacao: 'inativo' });
    abrir('/gestao/catalogo/campos/ip', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Inativar o campo IP?' });
    expect(dialogo.textContent).toContain('O campo sai dos formulários de 2 tipos.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar o campo' }));
    await waitFor(() => expect(avisos()).toContain('Campo inativado.'));
  });

  it('sem catalogo.administrar, a ficha é só leitura', async () => {
    abrir(
      '/gestao/catalogo/campos/criticidade',
      catalogo([{ ...CRITICIDADE, permite: { editar: false } }], false),
      naOrganizacao('modelos.editar'),
    );
    await screen.findByRole('heading', { level: 1, name: /Criticidade/ });
    await waitFor(() => expect(campoDeTexto('Rótulo').readOnly).toBe(true));
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Incluir opção' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Inativar' })).toBeNull();
  });
});
