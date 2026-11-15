// A distribuição de software na web (spec distribuicao-de-software; changes
// distribuicao-de-software e software-por-pacote): a base de pacotes frente ao inventário para quem
// só distribui, o pacote novo com o arquivo, a distribuição pela busca das máquinas, a lista com o
// progresso e a ficha com o log.
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
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Pacote = components['schemas']['PacoteDeSoftware'];
type NaBase = components['schemas']['PacoteNaBase'];
type Ficha = components['schemas']['FichaDaDistribuicao'];
type Maquina = components['schemas']['MaquinaDaDistribuicao'];

const PACOTE: Pacote = {
  id: '0199a6e0-0000-7000-8000-0000000000e1',
  nome: '7-Zip 23.01',
  versao: '23.01',
  descricao: null,
  categoria: null,
  nomeNoInventario: null,
  comando: 'msiexec /i "7z2301-x64.msi" /qn /norestart',
  codigosDeSucesso: [0, 3010],
  tipo: { longo: 'Instalador MSI', curto: 'MSI' },
  arquivo: { nome: '7z2301-x64.msi', tamanho: 1_572_864, guardadoEm: null, guardadoPor: null },
  situacao: 'ativo',
};

const NA_BASE: NaBase = {
  ...PACOTE,
  contas: { maquinas: 47, instalado: 44, naVersao: 41, desatualizadas: 3, sem: 3 },
  ultimaDistribuicao: null,
};

const FICHA_DO_PACOTE: components['schemas']['FichaDoPacote'] = {
  pacote: { ...PACOTE, nomeNoInventario: '7-Zip' },
  partes: 1,
  contas: NA_BASE.contas,
  versoes: [
    { versao: '23.01', estado: 'alvo', quantas: 41 },
    { versao: '22.01', estado: 'abaixo', quantas: 3 },
  ],
  distribuicoes: [
    {
      id: 'd1',
      criadaEm: '2026-10-28T12:00:00.000Z',
      paraQuem: 'Financeiro',
      maquinas: 18,
      resultado: {
        concluidas: 14,
        emAndamento: 2,
        aguardando: 1,
        falharam: 1,
        tiradas: 0,
        semContato: 1,
      },
    },
  ],
  permite: { administrar: true },
};

const maquina = (id: string, patrimonio: string, extras: Partial<Maquina> = {}): Maquina => ({
  id,
  ativo: { id: `ativo-${id}`, rotulo: `Computador ${patrimonio}`, patrimonio },
  pessoa: null,
  situacao: { chave: 'aguardando', texto: 'Aguardando o agente', tipo: 'neutra' },
  etapa: null,
  codigo: null,
  semContato: null,
  chamada: null,
  voltaAte: null,
  log: [],
  enviadaEm: null,
  atualizadaEm: '2026-10-28T12:00:00.000Z',
  terminadaEm: null,
  ...extras,
});

const ficha = (maquinas: Maquina[], progresso: string): Ficha => ({
  id: 'd1',
  pacote: { id: PACOTE.id, nome: PACOTE.nome, versao: PACOTE.versao },
  criadaPor: 'Ana Souza',
  criadaEm: '2026-10-28T12:00:00.000Z',
  paraQuem: `${maquinas.length} máquinas`,
  quando: { chave: 'agora', aPartirDe: null, fuso: null },
  maquinas: maquinas.length,
  progresso,
  maquinasDaDistribuicao: maquinas,
});

const FALHOU = maquina('m2', 'PAT-00412', {
  situacao: { chave: 'falhou', texto: 'Falhou', tipo: 'critico' },
  etapa: 'Executando',
  log: [
    'Agente: job received',
    'Baixando: ok, 7z2301-x64.msi downloaded',
    'Executando: exit status: `1603`',
    'Executando: ko, action #1 processing failure',
  ],
});

const DUAS = ficha([maquina('m1', 'PAT-00321'), maquina('m3', 'PAT-00518')], '0 de 2 concluídas');

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('software.administrar', 'software.distribuir', 'ativos.ver'),
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
const base = (administrar: boolean, pacotes: NaBase[] = [NA_BASE]) => ({
  'GET /api/software/pacotes': () =>
    Response.json({ pacotes, maquinas: 47, permite: { administrar } }),
  'GET /api/software/categorias': () => Response.json({ categorias: [] }),
});

/** O botão de uma seleção, pelo rótulo. */
const selecao = (onde: HTMLElement, rotulo: RegExp) =>
  within(onde)
    .getAllByRole('button', { name: rotulo })
    .find((botao) => botao.getAttribute('aria-haspopup') === 'listbox') as HTMLElement;

describe('a base de software', () => {
  it('Técnico sem a administração: vê a base frente ao inventário, sem "Novo pacote" nem "Categorias…"', async () => {
    abrir('/gestao/software', base(false), naOrganizacao('software.distribuir'));
    const tabela = await screen.findByRole('grid', { name: 'Base de pacotes' });
    expect(await within(tabela).findByText('7-Zip 23.01')).toBeTruthy();
    expect(within(tabela).getByText('MSI · 1,5 MB')).toBeTruthy();
    expect(within(tabela).getByText('3 desatualizadas')).toBeTruthy();
    expect(screen.getByText('em 1 pacote, entre as 47 máquinas com o agente do GLPI')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Novo pacote' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Categorias…' })).toBeNull();
  });

  it('Pacote cadastrado: grava o pacote e envia o arquivo com o nome', async () => {
    const pedidos: { corpo?: unknown; endereco: string }[] = [];
    abrir('/gestao/software', {
      ...base(true, []),
      'POST /api/software/pacotes': async (pedido) => {
        pedidos.push({ endereco: pedido.url, corpo: await pedido.json() });
        return Response.json({ ...PACOTE, arquivo: null }, { status: 201 });
      },
      [`PUT /api/software/pacotes/${PACOTE.id}/arquivo`]: (pedido) => {
        pedidos.push({ endereco: pedido.url });
        return Response.json(PACOTE);
      },
    });
    const vazio = await screen.findByText('Nenhum pacote na base ainda.');
    expect(vazio).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Novo pacote' })[0] as HTMLElement);
    const gaveta = await screen.findByRole('dialog', { name: 'Novo pacote' });
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Nome(?! no)/ }), {
      target: { value: '7-Zip 23.01' },
    });
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Comando/ }), {
      target: { value: 'msiexec /i "7z2301-x64.msi" /qn /norestart' },
    });
    const escolha = within(gaveta).getByRole('group', { name: 'Arquivo' });
    fireEvent.change(escolha.querySelector('input[type="file"]') as HTMLElement, {
      target: { files: [new File(['msi'], '7z2301-x64.msi')] },
    });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar pacote' }));
    await waitFor(() => expect(avisos()).toContain('Pacote cadastrado.'));
    expect(pedidos[0]?.corpo).toEqual({
      nome: '7-Zip 23.01',
      categoriaId: null,
      nomeNoInventario: null,
      versao: null,
      descricao: null,
      comando: 'msiexec /i "7z2301-x64.msi" /qn /norestart',
      codigosDeSucesso: '0, 3010',
    });
    expect(new URL(pedidos[1]?.endereco ?? '').searchParams.get('nome')).toBe('7z2301-x64.msi');
  });
});

describe('a ficha do pacote', () => {
  it('a linha da base abre a ficha frente ao inventário, e "Inativar" grava', async () => {
    let inativo = false;
    const roteador = abrir('/gestao/software', {
      ...base(true),
      [`GET /api/software/pacotes/${PACOTE.id}`]: () =>
        Response.json(
          inativo
            ? {
                ...FICHA_DO_PACOTE,
                pacote: { ...FICHA_DO_PACOTE.pacote, situacao: 'inativo' },
              }
            : FICHA_DO_PACOTE,
        ),
      [`POST /api/software/pacotes/${PACOTE.id}/inativacao`]: () => {
        inativo = true;
        return Response.json({ ...PACOTE, situacao: 'inativo' });
      },
    });
    const tabela = await screen.findByRole('grid', { name: 'Base de pacotes' });
    fireEvent.click(await within(tabela).findByText('7-Zip 23.01'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe(`/gestao/software/pacotes/${PACOTE.id}`),
    );
    expect(await screen.findByText('Sem o 7-Zip')).toBeTruthy();
    expect(screen.getByText('7-Zip 22.01 · abaixo do alvo')).toBeTruthy();
    const distribuicoes = screen.getByRole('grid', { name: 'Distribuições deste pacote' });
    // A que aguarda está sem contato: ganha o rótulo dela, e nenhuma fica em "aguardando".
    expect(within(distribuicoes).getByText('1 sem contato')).toBeTruthy();
    expect(within(distribuicoes).queryByText(/aguardando/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Inativar' }));
    await waitFor(() => expect(avisos()).toContain('Pacote inativado.'));
    expect(await screen.findByRole('button', { name: 'Reativar' })).toBeTruthy();
  });
});

describe('a distribuição', () => {
  it('Distribuição para as máquinas: escolhe pela busca e abre a ficha', async () => {
    let corpo: unknown;
    const roteador = abrir('/gestao/software/distribuicoes', {
      ...base(true),
      'GET /api/software/distribuicoes': () => Response.json({ distribuicoes: [] }),
      'GET /api/software/maquinas': () =>
        Response.json({
          maquinas: ['00321', '00412', '00518'].map((numero) => ({
            id: `ativo-${numero}`,
            rotulo: `Computador ${numero}`,
            patrimonio: `PAT-${numero}`,
            local: 'Jundiaí',
            agente: { nome: `PC-${numero}`, ultimoContato: '2026-10-28T11:00:00.000Z' },
          })),
        }),
      'POST /api/software/distribuicoes': async (pedido) => {
        corpo = await pedido.json();
        return Response.json(DUAS, { status: 201 });
      },
      'GET /api/software/distribuicoes/d1': () => Response.json(DUAS),
      [`GET /api/software/pacotes/${PACOTE.id}`]: () => Response.json(FICHA_DO_PACOTE),
    });
    const [nova] = await screen.findAllByRole('button', { name: 'Nova distribuição' });
    fireEvent.click(nova as HTMLElement);
    const gaveta = await screen.findByRole('dialog', { name: 'Nova distribuição' });
    fireEvent.click(selecao(gaveta, /Pacote/));
    fireEvent.click(await screen.findByRole('option', { name: '7-Zip 23.01' }));
    const achadas = await within(gaveta).findByRole('list', { name: 'Máquinas achadas' });
    fireEvent.click(
      within(achadas).getByRole('checkbox', { name: 'Computador 00321 (PAT-00321)' }),
    );
    fireEvent.click(
      within(achadas).getByRole('checkbox', { name: 'Computador 00518 (PAT-00518)' }),
    );
    expect(within(gaveta).getByText('2 máquinas escolhidas')).toBeTruthy();
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Distribuir para 2 máquinas' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/software/distribuicoes/d1'),
    );
    expect(corpo).toEqual({
      pacoteId: PACOTE.id,
      alvo: {
        locais: [],
        visoes: [],
        ativoIds: ['ativo-00321', 'ativo-00518'],
        lista: '',
        fora: [],
      },
      quando: 'agora',
    });
    expect(avisos()).toContain('Distribuição criada para 2 máquinas.');
    expect(await screen.findAllByText('Aguardando o agente')).toHaveLength(2);
  });

  it('a lista das distribuições mostra o progresso em texto', async () => {
    abrir('/gestao/software?aba=distribuicoes', {
      ...base(true),
      'GET /api/software/distribuicoes': () =>
        Response.json({
          distribuicoes: [
            {
              id: 'd1',
              pacote: { id: PACOTE.id, nome: PACOTE.nome, versao: PACOTE.versao },
              criadaPor: 'Ana Souza',
              criadaEm: '2026-10-28T12:00:00.000Z',
              paraQuem: 'Jundiaí',
              quando: { chave: 'agora', aPartirDe: null, fuso: null },
              maquinas: 3,
              progresso: '1 de 3 concluídas, 1 falhou',
            },
          ],
        }),
    });
    const tabela = await screen.findByRole('grid', { name: 'Distribuições' });
    expect(await within(tabela).findByText('1 de 3 concluídas, 1 falhou')).toBeTruthy();
    expect(within(tabela).getByRole('link', { name: '7-Zip 23.01 · 23.01' })).toBeTruthy();
  });

  it('Log da máquina: o nome da que falhou abre o log, na ordem em que chegou', async () => {
    abrir('/gestao/software/distribuicoes/d1', {
      'GET /api/software/distribuicoes/d1': () =>
        Response.json(ficha([FALHOU], '0 de 1 concluída, 1 falhou')),
      [`GET /api/software/pacotes/${PACOTE.id}`]: () => Response.json(FICHA_DO_PACOTE),
    });
    expect(await screen.findByText('Precisa de você')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Computador PAT-00412' }));
    const gaveta = await screen.findByRole('dialog', {
      name: 'Log de Computador PAT-00412 (PAT-00412)',
    });
    const passos = within(gaveta).getByRole('list', { name: 'Passos do agente' });
    expect(
      within(passos)
        .getAllByRole('listitem')
        .map((linha) => linha.textContent),
    ).toEqual(FALHOU.log);
  });

  it('O que precisa de você: a que falhou tenta de novo, e a sem contato sai da fila', async () => {
    const pedidos: string[] = [];
    const falhou1603 = {
      ...FALHOU,
      codigo: {
        numero: 1603,
        explicacao: 'Erro fatal: costuma ser outra instalação em andamento.',
      },
    };
    const longe = maquina('m4', 'PAT-00777', {
      semContato: { dias: 3, texto: 'Sem contato · há 3 dias' },
    });
    const registrar = (pedido: Request) => {
      pedidos.push(new URL(pedido.url).pathname);
      return Response.json(maquina('m0', 'PAT-00000'));
    };
    abrir('/gestao/software/distribuicoes/d1', {
      'GET /api/software/distribuicoes/d1': () =>
        Response.json(ficha([falhou1603, longe], '0 de 2 concluídas, 1 falhou')),
      [`GET /api/software/pacotes/${PACOTE.id}`]: () => Response.json(FICHA_DO_PACOTE),
      'POST /api/software/distribuicoes/d1/maquinas/m2/tentar-de-novo': registrar,
      'POST /api/software/distribuicoes/d1/maquinas/m4/tirar-da-fila': registrar,
    });
    expect(await screen.findByText('Falhou · 1603')).toBeTruthy();
    expect(screen.getByText('Erro fatal: costuma ser outra instalação em andamento.')).toBeTruthy();
    expect(screen.getByText('Sem contato · há 3 dias')).toBeTruthy();
    const lista = await screen.findByRole('list', { name: 'Distribuições do pacote' });
    expect(
      within(lista)
        .getByRole('link', { name: /Financeiro/ })
        .getAttribute('aria-current'),
    ).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() =>
      expect(avisos()).toContain('Computador PAT-00412 voltou a aguardar o agente.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tirar da fila' }));
    await waitFor(() => expect(avisos()).toContain('Computador PAT-00777 saiu da fila.'));
    expect(pedidos).toEqual([
      '/api/software/distribuicoes/d1/maquinas/m2/tentar-de-novo',
      '/api/software/distribuicoes/d1/maquinas/m4/tirar-da-fila',
    ]);
  });
});
