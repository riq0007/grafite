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

type Tipo = components['schemas']['TipoDeAtivo'];
type Campo = components['schemas']['Campo'];

const tipo = (id: string, nome: string, extras: Partial<Tipo> = {}): Tipo => ({
  id,
  nome,
  icone: 'generico',
  capacidades: [],
  configuracaoDasCapacidades: {},
  primeiroCartao: null,
  campos: [],
  situacao: 'ativo',
  permite: { editar: true },
  ...extras,
});

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

const IP = campo('ip', 'IP', { tipo: 'ip', grupo: 'Rede' });
const MAC = campo('mac', 'Endereço MAC', { tipo: 'mac', grupo: 'Rede' });
const TENSAO = campo('tensao', 'Tensão', { tipo: 'lista', situacao: 'inativo' });

const IMPRESSORA = tipo('impressora', 'Impressora', {
  icone: 'impressora',
  campos: [
    { campoId: 'ip', obrigatorio: true },
    { campoId: 'mac', obrigatorio: false },
  ],
});
const COMPUTADOR = tipo('computador', 'Computador', {
  icone: 'computador',
  capacidades: ['hardware.inventario'],
});
const CAMERA = tipo('camera', 'Câmera', { icone: 'camera', situacao: 'inativo' });

const CAPACIDADES = {
  capacidades: [
    {
      chave: 'hardware.inventario',
      nome: 'Inventário de hardware',
      descricao: 'Processador, memória, discos, sistema e licenças do computador.',
      configuracao: null,
      campos: [
        {
          chave: 'hardware.processador',
          rotulo: 'Processador',
          tipo: 'texto',
          grupo: 'Hardware',
          configuracao: {},
          escrita: 'automatica',
        },
        {
          chave: 'software.sistema',
          rotulo: 'Sistema operacional',
          tipo: 'texto',
          grupo: 'Software',
          configuracao: {},
          escrita: 'automatica',
        },
      ],
    },
    {
      chave: 'rede.disponibilidade',
      nome: 'Disponibilidade na rede',
      descricao: 'Confere pelo ping, a cada 2 minutos, se o ativo responde na rede.',
      configuracao: 'campo-de-ip',
      campos: [],
    },
  ],
};

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

/** O servidor do catálogo, com os tipos dados. */
const catalogo = (tipos: Tipo[], cadastrar = true): ServidorDeTeste => ({
  'GET /api/tipos-de-ativo': () => Response.json({ tipos, permite: { cadastrar } }),
  'GET /api/campos': () => Response.json({ campos: [MAC, IP, TENSAO], permite: { cadastrar } }),
  'GET /api/capacidades': () => Response.json(CAPACIDADES),
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

describe('o módulo Ativos', () => {
  it('aparece no dock depois do Início para quem cuida do catálogo, e não para os outros', async () => {
    abrir('/gestao/catalogo/tipos', catalogo([IMPRESSORA]));
    const dock = await screen.findByRole('navigation', { name: 'Dock' });
    expect(
      within(dock)
        .getAllByRole('button')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['Início', 'Gestão de ativos', 'Ajustes']);
    cleanup();
    abrir('/ajustes', {}, naOrganizacao('pessoas.ver'));
    const outro = await screen.findByRole('navigation', { name: 'Dock' });
    expect(within(outro).queryByRole('button', { name: 'Ativos' })).toBeNull();
    expect(within(outro).queryByRole('button', { name: 'Gestão de ativos' })).toBeNull();
  });

  it('o endereço do módulo leva à seção de tipos', async () => {
    const roteador = abrir('/ativos', catalogo([IMPRESSORA]));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/catalogo/tipos'));
  });
});

describe('lista de tipos', () => {
  it('mostra os tipos ativos pelo nome, com os campos, as capacidades e a situação', async () => {
    const roteador = abrir('/gestao/catalogo/tipos', catalogo([COMPUTADOR, IMPRESSORA, CAMERA]));
    const tabela = await screen.findByRole('grid', { name: 'Tipos de ativo' });
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas.map((linha) => linha.textContent)).toEqual([
      'ComputadorNenhumInventário de hardwareAtivo',
      'Impressora2 camposNenhumaAtivo',
    ]);
    fireEvent.click(screen.getByRole('radio', { name: 'Inativos' }));
    await waitFor(() =>
      expect(
        within(tabela)
          .getAllByRole('row')
          .slice(1)
          .map((l) => l.textContent),
      ).toEqual(['CâmeraNenhumNenhumaInativo']),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }));
    fireEvent.click(await within(tabela).findByText('Impressora'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/tipos/impressora'),
    );
  });

  it('sem nenhum tipo, diz isso e oferece o primeiro cadastro', async () => {
    const roteador = abrir('/gestao/catalogo/tipos', catalogo([]));
    expect(await screen.findByText('Nenhum tipo de ativo ainda.')).toBeTruthy();
    const botoes = screen.getAllByRole('button', { name: 'Novo tipo' });
    fireEvent.click(botoes[botoes.length - 1] as HTMLElement);
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/tipos/novo'),
    );
  });

  it('quem não cuida do catálogo vê a lista sem "Novo tipo"', async () => {
    abrir('/gestao/catalogo/tipos', catalogo([IMPRESSORA], false), naOrganizacao('modelos.editar'));
    await screen.findByRole('grid', { name: 'Tipos de ativo' });
    expect(screen.queryByRole('button', { name: 'Novo tipo' })).toBeNull();
  });
});

describe('tipo novo', () => {
  it('cadastra com o ícone, as capacidades e os campos em ordem, e abre a ficha', async () => {
    const corpos: unknown[] = [];
    const servidor = catalogo([]);
    servidor['POST /api/tipos-de-ativo'] = async (pedido) => {
      corpos.push(await pedido.json());
      return Response.json(IMPRESSORA, { status: 201 });
    };
    const roteador = abrir('/gestao/catalogo/tipos/novo', servidor);
    await screen.findByRole('button', { name: 'Cadastrar' });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe o nome do tipo.')).toBeTruthy();
    expect(screen.getByText('Escolha o ícone do tipo.')).toBeTruthy();
    expect(corpos).toEqual([]);

    fireEvent.change(campoDeTexto('Nome'), { target: { value: ' Impressora ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Impressora' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Inventário de hardware/ }));
    for (const rotulo of ['IP', 'Endereço MAC']) {
      fireEvent.click(screen.getByRole('button', { name: `Incluir ${rotulo}` }));
    }
    fireEvent.click(screen.getByRole('checkbox', { name: 'IP obrigatório' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover Endereço MAC para cima' }));
    expect(screen.queryByRole('button', { name: 'Incluir Tensão' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/tipos/impressora'),
    );
    expect(corpos).toEqual([
      {
        nome: 'Impressora',
        icone: 'impressora',
        capacidades: ['hardware.inventario'],
        configuracaoDasCapacidades: {},
        campos: [
          { campoId: 'mac', obrigatorio: false },
          { campoId: 'ip', obrigatorio: true },
        ],
        primeiroCartao: null,
      },
    ]);
    expect(avisos()).toContain('Tipo cadastrado.');
  });

  it('o nome repetido aparece no campo, e o formulário continua preenchido', async () => {
    const servidor = catalogo([]);
    servidor['POST /api/tipos-de-ativo'] = () =>
      problema(409, 'conflito', 'Já existe um tipo com este nome.', {
        nome: 'Já existe um tipo com este nome.',
      });
    abrir('/gestao/catalogo/tipos/novo', servidor);
    await screen.findByRole('textbox', { name: 'Nome' });
    fireEvent.change(campoDeTexto('Nome'), { target: { value: 'impressora' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Impressora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Já existe um tipo com este nome.')).toBeTruthy();
    expect(campoDeTexto('Nome').getAttribute('aria-invalid')).toBe('true');
    expect(campoDeTexto('Nome').value).toBe('impressora');
  });
});

/** O destino de um link, como caminho e parâmetros. */
const destinoDe = (link: HTMLElement) =>
  new URL(link.getAttribute('href') ?? '', 'http://grafite.local');

describe('ficha do tipo', () => {
  it('mostra quantos ativos são do tipo, com "Ver na tabela", ou que não há nenhum', async () => {
    let quantos = 3;
    const servidor = catalogo([IMPRESSORA]);
    servidor['GET /api/tipos-de-ativo/impressora/resumo'] = () =>
      Response.json({
        id: 'impressora',
        nome: 'Impressora',
        icone: 'impressora',
        situacao: 'ativo',
        ativos: { quantos, recortada: false },
      });
    abrir(
      '/gestao/catalogo/tipos/impressora',
      servidor,
      naOrganizacao('catalogo.administrar', 'ativos.ver'),
    );
    expect(await screen.findByText('Ativos: 3')).toBeTruthy();
    expect(
      destinoDe(screen.getByRole('link', { name: 'Ver na tabela' })).searchParams.get('origem'),
    ).toBe('tipo:impressora');
    cleanup();
    quantos = 0;
    abrir(
      '/gestao/catalogo/tipos/impressora',
      servidor,
      naOrganizacao('catalogo.administrar', 'ativos.ver'),
    );
    expect(await screen.findByText('Nenhum ativo deste tipo.')).toBeTruthy();
  });
  it('mostra os campos do tipo e, só para leitura, os das capacidades ligadas', async () => {
    abrir('/gestao/catalogo/tipos/computador', catalogo([COMPUTADOR, IMPRESSORA]));
    const titulo = await screen.findByRole('heading', { level: 1, name: /Computador/ });
    expect(titulo.textContent).toContain('Ativo');
    const daCapacidade = await screen.findByRole('list', {
      name: 'Campos do Inventário de hardware',
    });
    expect(
      within(daCapacidade)
        .getAllByRole('listitem')
        .map((i) => i.textContent),
    ).toEqual(['ProcessadorHardware', 'Sistema operacionalSoftware']);
    expect(within(daCapacidade).queryByRole('button')).toBeNull();
  });

  it('salva a lista de campos com o obrigatório mudado', async () => {
    const corpos: unknown[] = [];
    const servidor = catalogo([IMPRESSORA]);
    servidor['PATCH /api/tipos-de-ativo/impressora'] = async (pedido) => {
      corpos.push(await pedido.json());
      return Response.json(IMPRESSORA);
    };
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'IP obrigatório' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Endereço MAC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([
      {
        nome: 'Impressora',
        icone: 'impressora',
        capacidades: [],
        configuracaoDasCapacidades: {},
        campos: [{ campoId: 'ip', obrigatorio: false }],
        primeiroCartao: null,
      },
    ]);
  });

  it('o arquivo marcado como obrigatório é recusado antes do envio, com o motivo', async () => {
    const NOTA = campo('nota', 'PDF da nota fiscal', { tipo: 'arquivo' });
    const NOTEBOOK = tipo('notebook', 'Notebook', {
      campos: [{ campoId: 'nota', obrigatorio: false }],
    });
    const corpos: unknown[] = [];
    const servidor = catalogo([NOTEBOOK]);
    servidor['GET /api/campos'] = () =>
      Response.json({ campos: [MAC, IP, NOTA], permite: { cadastrar: true } });
    servidor['PATCH /api/tipos-de-ativo/notebook'] = async (pedido) => {
      corpos.push(await pedido.json());
      return Response.json(NOTEBOOK);
    };
    abrir('/gestao/catalogo/tipos/notebook', servidor);
    await screen.findByRole('heading', { level: 1, name: /Notebook/ });
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'PDF da nota fiscal obrigatório' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(
      await screen.findByText(
        'Arquivo e imagem não podem ser obrigatórios: eles são enviados depois do cadastro.',
      ),
    ).toBeTruthy();
    expect(corpos).toEqual([]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'PDF da nota fiscal obrigatório' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toHaveLength(1);
  });

  it('inativa com confirmação, e a situação muda na ficha', async () => {
    const servidor = catalogo([IMPRESSORA]);
    servidor['POST /api/tipos-de-ativo/impressora/inativacao'] = () =>
      Response.json({ ...IMPRESSORA, situacao: 'inativo' });
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const dialogo = await screen.findByRole('alertdialog', {
      name: 'Inativar o tipo Impressora?',
    });
    expect(dialogo.textContent).toContain('sai das escolhas');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar o tipo' }));
    await waitFor(() => expect(avisos()).toContain('Tipo inativado.'));
    const titulo = await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    await waitFor(() => expect(titulo.textContent).toContain('Inativo'));
  });

  it('sem catalogo.administrar, a ficha é só leitura', async () => {
    abrir(
      '/gestao/catalogo/tipos/impressora',
      catalogo([{ ...IMPRESSORA, permite: { editar: false } }], false),
      naOrganizacao('modelos.editar'),
    );
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    await waitFor(() => expect(campoDeTexto('Nome').readOnly).toBe(true));
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Inativar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Incluir/ })).toBeNull();
  });

  it('o tipo que não existe diz isso', async () => {
    abrir('/gestao/catalogo/tipos/outro', catalogo([IMPRESSORA]));
    expect(await screen.findByText('Tipo de ativo não encontrado.')).toBeTruthy();
  });
});

describe('disponibilidade na rede no tipo', () => {
  const IP_DA_GERENCIA = campo('ip-gerencia', 'IP da gerência', { tipo: 'ip', grupo: 'Rede' });
  const HOSTNAME = campo('hostname', 'Hostname de gerência', { grupo: 'Rede' });
  const SWITCH = tipo('switch', 'Switch', {
    icone: 'switch',
    campos: [
      { campoId: 'ip', obrigatorio: false },
      { campoId: 'ip-gerencia', obrigatorio: false },
      { campoId: 'hostname', obrigatorio: false },
    ],
  });
  const IMPRESSORA_PINGADA = tipo('impressora', 'Impressora', {
    icone: 'impressora',
    capacidades: ['rede.disponibilidade'],
    configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: 'ip' } },
    campos: [
      { campoId: 'ip', obrigatorio: true },
      { campoId: 'mac', obrigatorio: false },
    ],
  });

  /** O catálogo com o switch, os dois campos de IP e o de texto, e o PATCH guardado. */
  function comSwitch(tipos: Tipo[]) {
    const corpos: unknown[] = [];
    const servidor = catalogo(tipos);
    servidor['GET /api/campos'] = () =>
      Response.json({ campos: [MAC, IP, IP_DA_GERENCIA, HOSTNAME], permite: { cadastrar: true } });
    for (const { id } of tipos) {
      servidor[`PATCH /api/tipos-de-ativo/${id}`] = async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(tipos.find((t) => t.id === id));
      };
    }
    return { servidor, corpos };
  }

  const disponibilidade = () =>
    screen.getByRole('checkbox', { name: /^Disponibilidade na rede/ }) as HTMLInputElement;

  it('pede o campo de IP do ping e oferece só os campos do tipo IP que estão no tipo', async () => {
    const { servidor, corpos } = comSwitch([SWITCH]);
    abrir('/gestao/catalogo/tipos/switch', servidor);
    await screen.findByRole('heading', { level: 1, name: /Switch/ });
    expect(
      screen.getByText('Confere pelo ping, a cada 2 minutos, se o ativo responde na rede.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Campo de IP do ping/ })).toBeNull();
    fireEvent.click(disponibilidade());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Escolha o campo de IP que o ping usa.')).toBeTruthy();
    expect(corpos).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: /Campo de IP do ping/ }));
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual(['IP', 'IP da gerência']);
    fireEvent.click(screen.getByRole('option', { name: 'IP da gerência' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([
      expect.objectContaining({
        capacidades: ['rede.disponibilidade'],
        configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: 'ip-gerencia' } },
      }),
    ]);
  });

  it('com um campo de IP só, ele já vem escolhido', async () => {
    const { servidor, corpos } = comSwitch([IMPRESSORA]);
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    fireEvent.click(disponibilidade());
    expect(screen.getByRole('button', { name: /Campo de IP do ping/ }).textContent).toContain('IP');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([
      expect.objectContaining({
        configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: 'ip' } },
      }),
    ]);
  });

  it('o tipo sem campo de IP vê a capacidade sem poder ligá-la, com o motivo', async () => {
    const { servidor } = comSwitch([COMPUTADOR]);
    abrir('/gestao/catalogo/tipos/computador', servidor);
    await screen.findByRole('heading', { level: 1, name: /Computador/ });
    expect(
      screen.getByText('Inclua no tipo um campo do tipo IP para ligar a disponibilidade na rede.'),
    ).toBeTruthy();
    expect(disponibilidade().disabled).toBe(true);
  });

  it('desligar a capacidade tira a configuração dela, e o IP continua no tipo', async () => {
    const { servidor, corpos } = comSwitch([IMPRESSORA_PINGADA]);
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    await waitFor(() => expect(disponibilidade().checked).toBe(true));
    fireEvent.click(disponibilidade());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([
      expect.objectContaining({
        capacidades: [],
        configuracaoDasCapacidades: {},
        campos: [
          { campoId: 'ip', obrigatorio: true },
          { campoId: 'mac', obrigatorio: false },
        ],
      }),
    ]);
  });

  it('tirar o campo que é o IP do ping é recusado antes do envio, na lista de campos', async () => {
    const { servidor, corpos } = comSwitch([IMPRESSORA_PINGADA]);
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    fireEvent.click(await screen.findByRole('button', { name: 'Tirar IP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(
      await screen.findByText(
        'O campo IP é o IP da disponibilidade neste tipo: escolha outro antes de tirá-lo.',
      ),
    ).toBeTruthy();
    expect(corpos).toEqual([]);
  });

  it('a recusa da API aparece no campo de IP do ping', async () => {
    const { servidor } = comSwitch([IMPRESSORA_PINGADA]);
    servidor['PATCH /api/tipos-de-ativo/impressora'] = () =>
      problema(400, 'dados-invalidos', 'Dados inválidos.', {
        configuracaoDasCapacidades: 'O campo IP está inativo.',
      });
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    await waitFor(() => expect(disponibilidade().checked).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const erro = await screen.findByText('O campo IP está inativo.');
    expect(
      screen.getByRole('button', { name: /Campo de IP do ping/ }).closest('[data-invalid]'),
    ).toBeTruthy();
    expect(erro).toBeTruthy();
  });

  it('só leitura, mostra o campo de IP escolhido em texto', async () => {
    const { servidor } = comSwitch([{ ...IMPRESSORA_PINGADA, permite: { editar: false } }]);
    abrir('/gestao/catalogo/tipos/impressora', servidor, naOrganizacao('modelos.editar'));
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    expect(await screen.findByText('Campo de IP do ping: IP')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Campo de IP do ping/ })).toBeNull();
  });
});

// Os suprimentos e contadores no tipo (spec catalogo-de-ativos, "Capacidades", e cofre-de-segredos,
// "Comunidade SNMP usada pelo coletor"; change p2b-impressoras-por-snmp, design, decisão 10): o
// campo de IP, a versão num segmentado e a comunidade numa seleção, com o aviso da inativa.
describe('suprimentos e contadores no tipo', () => {
  const DAS_IMPRESSORAS = '0199d3a0-0000-7000-8000-00000000c001';
  const ANTIGA = '0199d3a0-0000-7000-8000-00000000c002';
  const IP_DA_GERENCIA = campo('ip-gerencia', 'IP da gerência', { tipo: 'ip', grupo: 'Rede' });
  const SUPRIMENTOS = {
    chave: 'snmp.suprimentos',
    nome: 'Suprimentos e contadores',
    descricao:
      'Lê por SNMP, a cada 10 minutos, os suprimentos, os contadores e as condições da impressora.',
    configuracao: 'snmp' as const,
    campos: [],
  };
  const LIDA = tipo('impressora', 'Impressora', {
    icone: 'impressora',
    capacidades: ['snmp.suprimentos'],
    configuracaoDasCapacidades: {
      'snmp.suprimentos': { campoDoIp: 'ip', versao: '2c', segredoId: ANTIGA },
    },
    campos: [
      { campoId: 'ip', obrigatorio: true },
      { campoId: 'mac', obrigatorio: false },
    ],
  });

  /** O catálogo com os suprimentos entre as capacidades, as comunidades dadas e o PATCH guardado. */
  function comSuprimentos(
    tipos: Tipo[],
    comunidades: { comunidades: { id: string; nome: string }[]; motivo: string | null } = {
      comunidades: [{ id: DAS_IMPRESSORAS, nome: 'Comunidade das impressoras' }],
      motivo: null,
    },
  ) {
    const corpos: unknown[] = [];
    const pedidosDasComunidades: string[] = [];
    const servidor = catalogo(tipos);
    servidor['GET /api/capacidades'] = () =>
      Response.json({ capacidades: [...CAPACIDADES.capacidades, SUPRIMENTOS] });
    servidor['GET /api/campos'] = () =>
      Response.json({ campos: [MAC, IP, IP_DA_GERENCIA], permite: { cadastrar: true } });
    servidor['GET /api/catalogo/comunidades-snmp'] = () => {
      pedidosDasComunidades.push('pedido');
      return Response.json(comunidades);
    };
    for (const { id } of tipos) {
      servidor[`PATCH /api/tipos-de-ativo/${id}`] = async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(tipos.find((t) => t.id === id));
      };
    }
    return { servidor, corpos, pedidosDasComunidades };
  }

  const suprimentos = () =>
    screen.getByRole('checkbox', { name: /^Suprimentos e contadores/ }) as HTMLInputElement;
  const selecao = (nome: RegExp) => screen.getByRole('button', { name: nome });

  it('liga com o campo de IP, a versão e uma comunidade do cofre, e salva', async () => {
    const { servidor, corpos } = comSuprimentos([IMPRESSORA]);
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    expect(
      screen.getByText(
        'Lê por SNMP, a cada 10 minutos, os suprimentos, os contadores e as condições da impressora.',
      ),
    ).toBeTruthy();
    fireEvent.click(suprimentos());
    expect(selecao(/Campo de IP do SNMP/).textContent).toContain('IP');
    expect((screen.getByRole('radio', { name: 'v2c' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'v1' }));
    await waitFor(() => expect(selecao(/Comunidade$/).textContent).toContain('public (padrão)'));
    fireEvent.click(selecao(/Comunidade$/));
    await waitFor(() =>
      expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
        'public (padrão)',
        'Comunidade das impressoras',
      ]),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Comunidade das impressoras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([
      expect.objectContaining({
        capacidades: ['snmp.suprimentos'],
        configuracaoDasCapacidades: {
          'snmp.suprimentos': { campoDoIp: 'ip', versao: '1', segredoId: DAS_IMPRESSORAS },
        },
      }),
    ]);
  });

  it('a comunidade escolhida que ficou inativa tem o aviso de que o coletor usa a public', async () => {
    const { servidor } = comSuprimentos([LIDA]);
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    expect(
      await screen.findByText('A comunidade escolhida está inativa: o coletor usa a public.'),
    ).toBeTruthy();
    expect(selecao(/Comunidade$/).textContent).toContain('Comunidade inativa');
  });

  it('com o Cofre desligado, a comunidade escolhida fica, e a escolha de outra espera o módulo', async () => {
    const motivo =
      'Com o módulo Cofre desligado, a comunidade escolhida continua, e a escolha de outra espera o módulo ser ligado.';
    const { servidor } = comSuprimentos([LIDA], { comunidades: [], motivo });
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    expect(await screen.findByText(motivo)).toBeTruthy();
    expect(
      screen.queryByText('A comunidade escolhida está inativa: o coletor usa a public.'),
    ).toBeNull();
    expect(selecao(/Comunidade$/).hasAttribute('disabled')).toBe(true);
  });

  it('a recusa do campo de IP do SNMP aparece no campo dele, e não no do ping', async () => {
    const PINGADA = tipo('impressora', 'Impressora', {
      icone: 'impressora',
      capacidades: ['rede.disponibilidade'],
      configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: 'ip' } },
      campos: [
        { campoId: 'ip', obrigatorio: true },
        { campoId: 'ip-gerencia', obrigatorio: false },
      ],
    });
    const { servidor, corpos } = comSuprimentos([PINGADA]);
    abrir('/gestao/catalogo/tipos/impressora', servidor);
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    fireEvent.click(suprimentos());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Escolha o campo de IP que o SNMP usa.')).toBeTruthy();
    expect(selecao(/Campo de IP do SNMP/).closest('[data-invalid]')).toBeTruthy();
    expect(selecao(/Campo de IP do ping/).closest('[data-invalid]')).toBeNull();
    expect(corpos).toEqual([]);
  });

  it('só leitura, mostra a configuração em texto, sem pedir as comunidades', async () => {
    const { servidor, pedidosDasComunidades } = comSuprimentos([
      {
        ...LIDA,
        configuracaoDasCapacidades: {
          'snmp.suprimentos': { campoDoIp: 'ip', versao: '2c', segredoId: null },
        },
        permite: { editar: false },
      },
    ]);
    abrir('/gestao/catalogo/tipos/impressora', servidor, naOrganizacao('modelos.editar'));
    await screen.findByRole('heading', { level: 1, name: /Impressora/ });
    expect(await screen.findByText('Campo de IP do SNMP: IP')).toBeTruthy();
    expect(screen.getByText('Versão do SNMP: v2c')).toBeTruthy();
    expect(screen.getByText('Comunidade: public (padrão)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Campo de IP do SNMP/ })).toBeNull();
    expect(pedidosDasComunidades).toEqual([]);
  });
});

// A saúde do Control iD no tipo (spec saude-do-control-id, "Saúde do Control iD", e
// cofre-de-segredos, "Login do Control iD usado pelo coletor"; change p2c-saude-do-control-id,
// design, decisão 8): o campo de IP, a porta num campo numérico e o login numa seleção com os nomes
// do cofre, com o aviso do login inativo.
describe('saúde do Control iD no tipo', () => {
  const ADMIN = '0199d3a0-0000-7000-8000-00000000d001';
  const ANTIGO = '0199d3a0-0000-7000-8000-00000000d002';
  const SAUDE = {
    chave: 'controlid.saude',
    nome: 'Saúde do Control iD',
    descricao: 'Confere, a cada 5 minutos, se o controle de acesso responde e aceita o login.',
    configuracao: 'control-id' as const,
    campos: [],
  };
  const CONTROLE = tipo('controle', 'Controle de acesso', {
    campos: [
      { campoId: 'ip', obrigatorio: true },
      { campoId: 'mac', obrigatorio: false },
    ],
  });
  const SONDADO = tipo('controle', 'Controle de acesso', {
    capacidades: ['controlid.saude'],
    configuracaoDasCapacidades: {
      'controlid.saude': { campoDoIp: 'ip', porta: 80, segredoId: ANTIGO },
    },
    campos: [
      { campoId: 'ip', obrigatorio: true },
      { campoId: 'mac', obrigatorio: false },
    ],
  });

  /** O catálogo com a saúde entre as capacidades, os logins dados e o PATCH guardado. */
  function comASaude(
    tipos: Tipo[],
    logins: { logins: { id: string; nome: string }[]; motivo: string | null } = {
      logins: [{ id: ADMIN, nome: 'Admin dos controles' }],
      motivo: null,
    },
  ) {
    const corpos: unknown[] = [];
    const pedidosDosLogins: string[] = [];
    const servidor = catalogo(tipos);
    servidor['GET /api/capacidades'] = () =>
      Response.json({ capacidades: [...CAPACIDADES.capacidades, SAUDE] });
    servidor['GET /api/catalogo/logins-do-control-id'] = () => {
      pedidosDosLogins.push('pedido');
      return Response.json(logins);
    };
    for (const { id } of tipos) {
      servidor[`PATCH /api/tipos-de-ativo/${id}`] = async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(tipos.find((t) => t.id === id));
      };
    }
    return { servidor, corpos, pedidosDosLogins };
  }

  const saude = () =>
    screen.getByRole('checkbox', { name: /^Saúde do Control iD/ }) as HTMLInputElement;
  const selecao = (nome: RegExp) => screen.getByRole('button', { name: nome });
  const porta = () => screen.getByRole('textbox', { name: /^Porta/ }) as HTMLInputElement;
  const salvar = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

  it('liga com o campo de IP, a porta e um login do cofre, e salva', async () => {
    const { servidor, corpos } = comASaude([CONTROLE]);
    abrir('/gestao/catalogo/tipos/controle', servidor);
    await screen.findByRole('heading', { level: 1, name: /Controle de acesso/ });
    expect(
      screen.getByText(
        'Confere, a cada 5 minutos, se o controle de acesso responde e aceita o login.',
      ),
    ).toBeTruthy();
    fireEvent.click(saude());
    expect(selecao(/Campo de IP da sondagem/).textContent).toContain('IP');
    expect(porta().value).toBe('80');
    fireEvent.change(porta(), { target: { value: '8080' } });
    await waitFor(() => expect(selecao(/Login$/).textContent).toContain('Nenhum'));
    fireEvent.click(selecao(/Login$/));
    await waitFor(() =>
      expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
        'Nenhum',
        'Admin dos controles',
      ]),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Admin dos controles' }));
    salvar();
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([
      expect.objectContaining({
        capacidades: ['controlid.saude'],
        configuracaoDasCapacidades: {
          'controlid.saude': { campoDoIp: 'ip', porta: 8080, segredoId: ADMIN },
        },
      }),
    ]);
  });

  // O login do tipo é opcional (change login-de-cada-controle, design, decisões 1 e 5).
  it('salva sem o login, com "Nenhum"; a porta fora da faixa é recusada na porta', async () => {
    const { servidor, corpos } = comASaude([CONTROLE]);
    abrir('/gestao/catalogo/tipos/controle', servidor);
    await screen.findByRole('heading', { level: 1, name: /Controle de acesso/ });
    fireEvent.click(saude());
    await waitFor(() => expect(selecao(/Login$/).textContent).toContain('Nenhum'));
    expect(
      screen.getByText(
        'Os logins vêm do cofre, pelo nome. Sem nenhum, só os controles com login próprio, escolhido na ficha deles, são sondados.',
      ),
    ).toBeTruthy();
    fireEvent.change(porta(), { target: { value: '0' } });
    salvar();
    expect(await screen.findByText('Informe uma porta de 1 a 65535.')).toBeTruthy();
    expect(porta().closest('[data-invalid]')).toBeTruthy();
    expect(corpos).toEqual([]);
    fireEvent.change(porta(), { target: { value: '80' } });
    salvar();
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([
      expect.objectContaining({
        configuracaoDasCapacidades: {
          'controlid.saude': { campoDoIp: 'ip', porta: 80, segredoId: null },
        },
      }),
    ]);
  });

  it('voltar a "Nenhum" tira o login escolhido', async () => {
    const { servidor, corpos } = comASaude([
      tipo('controle', 'Controle de acesso', {
        capacidades: ['controlid.saude'],
        configuracaoDasCapacidades: {
          'controlid.saude': { campoDoIp: 'ip', porta: 80, segredoId: ADMIN },
        },
        campos: [
          { campoId: 'ip', obrigatorio: true },
          { campoId: 'mac', obrigatorio: false },
        ],
      }),
    ]);
    abrir('/gestao/catalogo/tipos/controle', servidor);
    await screen.findByRole('heading', { level: 1, name: /Controle de acesso/ });
    await waitFor(() => expect(selecao(/Login$/).textContent).toContain('Admin dos controles'));
    fireEvent.click(selecao(/Login$/));
    fireEvent.click(await screen.findByRole('option', { name: 'Nenhum' }));
    salvar();
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([
      expect.objectContaining({
        configuracaoDasCapacidades: {
          'controlid.saude': { campoDoIp: 'ip', porta: 80, segredoId: null },
        },
      }),
    ]);
  });

  it('o login escolhido que ficou inativo tem o aviso de que os controles sem login próprio não são sondados', async () => {
    const { servidor } = comASaude([SONDADO]);
    abrir('/gestao/catalogo/tipos/controle', servidor);
    await screen.findByRole('heading', { level: 1, name: /Controle de acesso/ });
    expect(
      await screen.findByText(
        'O login escolhido está inativo: os controles sem login próprio não são sondados.',
      ),
    ).toBeTruthy();
    expect(selecao(/Login$/).textContent).toContain('Login inativo');
  });

  it('com o Cofre desligado, o login escolhido fica, e a escolha de outro espera o módulo', async () => {
    const motivo =
      'Com o módulo Cofre desligado, o login escolhido continua, e a escolha de outro espera o módulo ser ligado.';
    const { servidor } = comASaude([SONDADO], { logins: [], motivo });
    abrir('/gestao/catalogo/tipos/controle', servidor);
    await screen.findByRole('heading', { level: 1, name: /Controle de acesso/ });
    expect(await screen.findByText(motivo)).toBeTruthy();
    expect(
      screen.queryByText(
        'O login escolhido está inativo: os controles sem login próprio não são sondados.',
      ),
    ).toBeNull();
    expect(selecao(/Login$/).hasAttribute('disabled')).toBe(true);
  });

  it('o tipo sem campo de IP vê a capacidade sem poder ligá-la, com o motivo', async () => {
    const { servidor } = comASaude([COMPUTADOR]);
    abrir('/gestao/catalogo/tipos/computador', servidor);
    await screen.findByRole('heading', { level: 1, name: /Computador/ });
    expect(
      screen.getByText('Inclua no tipo um campo do tipo IP para ligar a saúde do Control iD.'),
    ).toBeTruthy();
    expect(saude().disabled).toBe(true);
  });

  it('só leitura, mostra a configuração em texto, sem pedir os logins', async () => {
    const { servidor, pedidosDosLogins } = comASaude([{ ...SONDADO, permite: { editar: false } }]);
    abrir('/gestao/catalogo/tipos/controle', servidor, naOrganizacao('modelos.editar'));
    await screen.findByRole('heading', { level: 1, name: /Controle de acesso/ });
    expect(await screen.findByText('Campo de IP da sondagem: IP')).toBeTruthy();
    expect(screen.getByText('Porta: 80')).toBeTruthy();
    expect(screen.getByText('Login: escolhido no cofre')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /^Porta/ })).toBeNull();
    expect(pedidosDosLogins).toEqual([]);
  });
});

// O primeiro cartão da ficha no tipo (spec catalogo-de-ativos, "Primeiro cartão da ficha"; change
// primeiro-cartao-da-ficha, design, decisão 5): o automático com o cartão que ele abre, a Visão geral
// e as capacidades ligadas com cartão, e a escolha esquecida quando a capacidade sai.
describe('primeiro cartão da ficha no tipo', () => {
  const PINGADO = tipo('switch', 'Switch', {
    icone: 'switch',
    capacidades: ['rede.disponibilidade'],
    configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: 'ip' } },
    campos: [{ campoId: 'ip', obrigatorio: true }],
  });
  const selecao = () => screen.getByRole('button', { name: /Primeiro cartão da ficha$/ });
  const salvar = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

  /** O catálogo com o PATCH guardado. */
  function comOPatch(tipos: Tipo[]) {
    const corpos: unknown[] = [];
    const servidor = catalogo(tipos);
    for (const { id } of tipos) {
      servidor[`PATCH /api/tipos-de-ativo/${id}`] = async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(tipos.find((t) => t.id === id));
      };
    }
    return { servidor, corpos };
  }

  it('diz o automático, oferece a Visão geral e as capacidades com cartão, e salva a escolha', async () => {
    const { servidor, corpos } = comOPatch([PINGADO]);
    abrir('/gestao/catalogo/tipos/switch', servidor);
    await screen.findByRole('heading', { level: 1, name: /Switch/ });
    expect(selecao().textContent).toContain('Automático: Disponibilidade na rede');
    fireEvent.click(selecao());
    expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      'Automático: Disponibilidade na rede',
      'Visão geral',
      'Disponibilidade na rede',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Visão geral' }));
    salvar();
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([expect.objectContaining({ primeiroCartao: 'visao-geral' })]);
  });

  it('desmarcar a capacidade escolhida volta ao automático', async () => {
    const { servidor, corpos } = comOPatch([
      { ...PINGADO, primeiroCartao: 'rede.disponibilidade' },
    ]);
    abrir('/gestao/catalogo/tipos/switch', servidor);
    await screen.findByRole('heading', { level: 1, name: /Switch/ });
    expect(selecao().textContent).toContain('Disponibilidade na rede');
    expect(selecao().textContent).not.toContain('Automático');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Disponibilidade na rede/ }));
    expect(selecao().textContent).toContain('Automático: Visão geral');
    salvar();
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([expect.objectContaining({ capacidades: [], primeiroCartao: null })]);
  });

  it('só leitura, mostra a escolha em texto', async () => {
    abrir(
      '/gestao/catalogo/tipos/switch',
      catalogo([{ ...PINGADO, primeiroCartao: 'visao-geral', permite: { editar: false } }]),
      naOrganizacao('modelos.editar'),
    );
    expect(await screen.findByText('Primeiro cartão da ficha: Visão geral')).toBeTruthy();
  });
});

// O acesso remoto no tipo (spec acesso-remoto, "Capacidade do acesso remoto"; change
// acesso-remoto-vnc): a porta num campo numérico, com a 5900 já escolhida, e o IP da
// disponibilidade na rede do mesmo tipo.
describe('acesso remoto no tipo', () => {
  const VNC = {
    chave: 'acesso.vnc',
    nome: 'Acesso remoto por VNC',
    descricao: 'Abre a tela da máquina no navegador, pelo VNC.',
    configuracao: 'acesso-remoto' as const,
    campos: [],
  };
  const PINGADO = tipo('computador', 'Computador', {
    capacidades: ['rede.disponibilidade'],
    configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: 'ip' } },
    campos: [{ campoId: 'ip', obrigatorio: true }],
  });

  function comOVnc(tipos: Tipo[]) {
    const corpos: unknown[] = [];
    const servidor = catalogo(tipos);
    servidor['GET /api/capacidades'] = () =>
      Response.json({ capacidades: [...CAPACIDADES.capacidades, VNC] });
    for (const { id } of tipos) {
      servidor[`PATCH /api/tipos-de-ativo/${id}`] = async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(tipos.find((t) => t.id === id));
      };
    }
    return { servidor, corpos };
  }

  const vnc = () =>
    screen.getByRole('checkbox', { name: /^Acesso remoto por VNC/ }) as HTMLInputElement;
  const porta = () => screen.getByRole('textbox', { name: /^Porta do VNC/ }) as HTMLInputElement;
  const salvar = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

  it('Tipo com o acesso remoto: liga na porta 5900, troca a porta e salva', async () => {
    const { servidor, corpos } = comOVnc([PINGADO]);
    abrir('/gestao/catalogo/tipos/computador', servidor);
    await screen.findByRole('heading', { level: 1, name: /Computador/ });
    fireEvent.click(vnc());
    expect(porta().value).toBe('5900');
    fireEvent.change(porta(), { target: { value: '0' } });
    salvar();
    expect(await screen.findByText('Informe a porta de 1 a 65535.')).toBeTruthy();
    expect(corpos).toEqual([]);
    fireEvent.change(porta(), { target: { value: '5901' } });
    salvar();
    await waitFor(() => expect(avisos()).toContain('Tipo salvo.'));
    expect(corpos).toEqual([
      expect.objectContaining({
        capacidades: ['rede.disponibilidade', 'acesso.vnc'],
        configuracaoDasCapacidades: {
          'rede.disponibilidade': { campoDoIp: 'ip' },
          'acesso.vnc': { porta: 5901 },
        },
      }),
    ]);
  });

  it('sem a disponibilidade na rede, a recusa diz que o acesso remoto usa o mesmo IP', async () => {
    const { servidor, corpos } = comOVnc([
      tipo('computador', 'Computador', { campos: [{ campoId: 'ip', obrigatorio: true }] }),
    ]);
    abrir('/gestao/catalogo/tipos/computador', servidor);
    await screen.findByRole('heading', { level: 1, name: /Computador/ });
    fireEvent.click(vnc());
    salvar();
    expect(
      await screen.findByText(
        'Ligue a disponibilidade na rede no tipo: o acesso remoto usa o mesmo IP.',
      ),
    ).toBeTruthy();
    expect(corpos).toEqual([]);
  });

  it('só leitura, mostra a porta em texto', async () => {
    const { servidor } = comOVnc([
      {
        ...PINGADO,
        capacidades: ['rede.disponibilidade', 'acesso.vnc'],
        configuracaoDasCapacidades: {
          'rede.disponibilidade': { campoDoIp: 'ip' },
          'acesso.vnc': { porta: 5900 },
        },
        permite: { editar: false },
      },
    ]);
    abrir('/gestao/catalogo/tipos/computador', servidor, naOrganizacao('modelos.editar'));
    await screen.findByRole('heading', { level: 1, name: /Computador/ });
    expect(await screen.findByText('Porta do VNC: 5900')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /^Porta do VNC/ })).toBeNull();
  });
});
