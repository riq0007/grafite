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

const ficha = (maquinas: Maquina[], progresso: string, foraDoAlcance = 0): Ficha => ({
  id: 'd1',
  pacote: { id: PACOTE.id, nome: PACOTE.nome, versao: PACOTE.versao },
  criadaPor: 'Ana Souza',
  criadaEm: '2026-10-28T12:00:00.000Z',
  paraQuem: `${maquinas.length} máquinas`,
  quando: { chave: 'agora', aPartirDe: null, fuso: null },
  maquinas: maquinas.length,
  progresso,
  foraDoAlcance,
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
  it('Distribuição para as máquinas: o assistente escolhe pela busca, confere e abre a ficha', async () => {
    let corpo: { alvo: { fuso?: string }; fuso?: string } | undefined;
    const roteador = abrir('/gestao/software/distribuicoes', {
      ...base(true),
      'GET /api/software/distribuicoes': () => Response.json({ distribuicoes: [] }),
      'GET /api/software/distribuicoes/alvos': () => Response.json({ locais: [], visoes: [] }),
      'POST /api/software/distribuicoes/previa': async (pedido) => {
        const { alvo } = (await pedido.json()) as { alvo: { ativoIds: string[] } };
        return Response.json({
          maquinas: alvo.ativoIds.map((id) => ({
            id,
            rotulo: `Computador ${id.slice(6)}`,
            patrimonio: `PAT-${id.slice(6)}`,
            hostname: null,
            local: 'Jundiaí',
            classe: 'vai-instalar',
            versao: null,
            semContato: null,
            emAndamento: null,
          })),
          naoAchados: [],
          conta: {
            vaoInstalar: alvo.ativoIds.length,
            puladas: 0,
            naFila: 0,
            primeiraVez: alvo.ativoIds.length,
            porVersao: [],
          },
          paraQuem: 'Jundiaí',
        });
      },
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
    fireEvent.click(await screen.findByRole('radio', { name: /^7-Zip 23\.01/ }));
    const ateAgora = screen.getByRole('complementary', { name: 'Até agora' });
    fireEvent.click(within(ateAgora).getByRole('button', { name: 'Máquinas' }));
    fireEvent.click(await screen.findByRole('radio', { name: /^Por busca/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Procurar máquinas' }), {
      target: { value: '00' },
    });
    const achadas = await screen.findByRole('list', { name: 'Máquinas achadas' });
    fireEvent.click(within(achadas).getByRole('checkbox', { name: 'Computador 00321' }));
    fireEvent.click(within(achadas).getByRole('checkbox', { name: 'Computador 00518' }));
    expect(await within(ateAgora).findByText('máquinas escolhidas, do local Jundiaí')).toBeTruthy();
    fireEvent.click(within(ateAgora).getByRole('button', { name: 'Quando instalar' }));

    // O passo Quando: a janela da noite mostra o que acontece com cada máquina.
    expect((screen.getByRole('radio', { name: /^Agora/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /^Na janela da noite/ }));
    expect(
      screen.getByRole('heading', { name: 'Na janela da noite, se a máquina estiver…' }),
    ).toBeTruthy();
    expect(within(ateAgora).getByText(/^Toda noite, das 22:00 às 06:00/)).toBeTruthy();
    fireEvent.click(within(ateAgora).getByRole('button', { name: 'Conferir' }));

    // O Conferir: o grupo das que vão instalar e quem envia; nada saiu ainda.
    expect(screen.getByRole('heading', { name: /^2 vão instalar o 7-Zip 23\.01/ })).toBeTruthy();
    expect(within(ateAgora).getByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText('Nada foi enviado ainda.')).toBeTruthy();
    expect(corpo).toBeUndefined();
    fireEvent.click(within(ateAgora).getByRole('button', { name: 'Enviar' }));
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
        fuso: corpo?.fuso,
      },
      quando: 'noite',
      aPartirDe: null,
      fuso: expect.any(String),
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
              foraDoAlcance: 0,
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
    expect(screen.queryByText(/fora do seu alcance/)).toBeNull();
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

  it('Máquinas fora do alcance: a distribuição diz quantas ficam fora dos locais da conta', async () => {
    const abrirCom = (foraDoAlcance: number) =>
      abrir('/gestao/software/distribuicoes/d1', {
        'GET /api/software/distribuicoes/d1': () =>
          Response.json(ficha([FALHOU], '0 de 1 concluída, 1 falhou', foraDoAlcance)),
        [`GET /api/software/pacotes/${PACOTE.id}`]: () => Response.json(FICHA_DO_PACOTE),
      });
    abrirCom(4);
    expect(await screen.findByText('4 máquinas em locais fora do seu alcance')).toBeTruthy();
    expect(screen.getByText(/de 1 concluída/)).toBeTruthy();
    cleanup();
    abrirCom(1);
    expect(await screen.findByText('1 máquina num local fora do seu alcance')).toBeTruthy();
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

describe('o assistente da distribuição', () => {
  type DaPrevia = components['schemas']['MaquinaDaPrevia'];
  const daPrevia = (
    numero: number,
    classe: DaPrevia['classe'],
    extras: Partial<DaPrevia> = {},
  ) => ({
    id: `ativo-${numero}`,
    rotulo: `Computador PAT-00${numero}`,
    patrimonio: `PAT-00${numero}`,
    hostname: null,
    local: 'Financeiro',
    classe,
    versao: classe === 'pulada' ? '23.01' : null,
    semContato: null,
    emAndamento: null,
    ...extras,
  });
  const PREVIA: components['schemas']['PreviaDaDistribuicao'] = {
    maquinas: [
      ...Array.from({ length: 12 }, (_, indice) => daPrevia(100 + indice, 'vai-instalar')),
      ...Array.from({ length: 5 }, (_, indice) => daPrevia(200 + indice, 'pulada')),
      daPrevia(300, 'na-fila', { semContato: { dias: 3, texto: 'Sem contato · há 3 dias' } }),
    ],
    naoAchados: [],
    conta: {
      vaoInstalar: 12,
      puladas: 5,
      naFila: 1,
      primeiraVez: 12,
      porVersao: [{ versao: null, quantas: 12 }],
    },
    paraQuem: 'Financeiro',
  };

  it('o pacote vem do endereço, o local marcado cobre o ramo e o "Até agora" faz a conta', async () => {
    const pedidos: { alvo: { locais: string[] }; pacoteId: string }[] = [];
    abrir(`/gestao/software/distribuicoes/nova?pacote=${PACOTE.id}`, {
      ...base(true),
      'GET /api/software/distribuicoes': () => Response.json({ distribuicoes: [] }),
      'GET /api/software/distribuicoes/alvos': () =>
        Response.json({
          locais: [
            { id: 'l-sede', nome: 'Sede', paiId: null, maquinas: 21, semContato: 1 },
            { id: 'l-fin', nome: 'Financeiro', paiId: 'l-sede', maquinas: 18, semContato: 1 },
            { id: 'l-com', nome: 'Comercial', paiId: 'l-sede', maquinas: 3, semContato: 0 },
          ],
          visoes: [],
        }),
      'POST /api/software/distribuicoes/previa': async (pedido) => {
        pedidos.push(await pedido.json());
        return Response.json(PREVIA);
      },
    });
    const ateAgora = await screen.findByRole('complementary', { name: 'Até agora' });
    expect(await within(ateAgora).findByText('7-Zip 23.01')).toBeTruthy();
    expect(within(ateAgora).getByText('Marque locais, visões ou máquinas ao lado.')).toBeTruthy();
    expect(screen.getByText('17 com agente em dia · 1 sem contato')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Financeiro' }));
    expect(
      await within(ateAgora).findByText('máquinas escolhidas, do local Financeiro'),
    ).toBeTruthy();
    expect(within(ateAgora).getByText('18')).toBeTruthy();
    expect(within(ateAgora).getByText('Vão instalar')).toBeTruthy();
    expect(within(ateAgora).getByText('12')).toBeTruthy();
    expect(within(ateAgora).getByText('Já têm a 23.01 · puladas')).toBeTruthy();
    expect(within(ateAgora).getByText('Computador PAT-00300 sem contato há 3 dias.')).toBeTruthy();
    expect(pedidos.at(-1)).toMatchObject({ pacoteId: PACOTE.id, alvo: { locais: ['l-fin'] } });
    expect(within(ateAgora).getByRole('button', { name: 'Quando instalar' })).toBeTruthy();

    // A Sede cobre o Financeiro: ele fica marcado, sem desmarcar, e sai da lista do alvo.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sede' }));
    await waitFor(() => expect(pedidos.at(-1)?.alvo.locais).toEqual(['l-sede']));
    const financeiro = screen.getByRole('checkbox', { name: 'Financeiro' }) as HTMLInputElement;
    expect(financeiro.checked).toBe(true);
    expect(financeiro.disabled).toBe(true);
  });

  it('vindo da matriz, abre no Quando; a sem contato sai da lista e o dia marcado segue com o fuso', async () => {
    const marcadas = PREVIA.maquinas.map((maquina) => maquina.id);
    const pedidos: { alvo: { fora: string[] } }[] = [];
    let corpo: { quando?: string; aPartirDe?: string | null; fuso?: string } | undefined;
    const roteador = abrir(
      `/gestao/software/distribuicoes/nova?pacote=${PACOTE.id}&maquinas=${encodeURIComponent(JSON.stringify(marcadas))}&local=l-fin`,
      {
        ...base(true),
        'GET /api/software/distribuicoes': () => Response.json({ distribuicoes: [] }),
        'GET /api/software/distribuicoes/alvos': () =>
          Response.json({
            locais: [{ id: 'l-fin', nome: 'Financeiro', paiId: null, maquinas: 18, semContato: 1 }],
            visoes: [],
          }),
        'POST /api/software/distribuicoes/previa': async (pedido) => {
          const corpoDaPrevia = (await pedido.json()) as { alvo: { fora: string[] } };
          pedidos.push(corpoDaPrevia);
          const fora = new Set(corpoDaPrevia.alvo.fora);
          const maquinas = PREVIA.maquinas.filter((maquina) => !fora.has(maquina.id));
          return Response.json({
            ...PREVIA,
            maquinas,
            conta: { ...PREVIA.conta, naFila: fora.size > 0 ? 0 : 1 },
          });
        },
        'POST /api/software/distribuicoes': async (pedido) => {
          corpo = await pedido.json();
          return Response.json(DUAS, { status: 201 });
        },
        'GET /api/software/distribuicoes/d1': () => Response.json(DUAS),
        [`GET /api/software/pacotes/${PACOTE.id}`]: () => Response.json(FICHA_DO_PACOTE),
      },
    );
    expect(await screen.findByRole('heading', { name: 'Quando instalar?' })).toBeTruthy();
    expect(await screen.findByText('Vindo da matriz do local Financeiro')).toBeTruthy();
    expect(await screen.findByText('18 máquinas, vindas da matriz')).toBeTruthy();
    const ateAgora = screen.getByRole('complementary', { name: 'Até agora' });
    expect(
      await within(ateAgora).findByText('máquinas marcadas na matriz do local Financeiro'),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Máquinas marcadas na matriz' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(18);

    // O dia marcado já vem com amanhã às 22:00; o Conferir mostra a sem contato, que sai da lista.
    fireEvent.click(screen.getByRole('radio', { name: /^Escolher o dia/ }));
    fireEvent.click(within(ateAgora).getByRole('button', { name: 'Conferir' }));
    expect(
      screen.getByRole('heading', { name: /^1 sem contato: Computador PAT-00300 entra na fila/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar da lista' }));
    await waitFor(() => expect(pedidos.at(-1)?.alvo.fora).toEqual(['ativo-300']));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /sem contato/ })).toBeNull());
    fireEvent.click(within(ateAgora).getByRole('button', { name: 'Enviar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/software/distribuicoes/d1'),
    );
    expect(corpo).toMatchObject({ quando: 'dia', fuso: expect.any(String) });
    expect(Date.parse(corpo?.aPartirDe ?? '')).toBeGreaterThan(Date.now());
  });
});

describe('a matriz do software', () => {
  type PorMaquina = components['schemas']['MatrizPorMaquina'];
  const LOCAL = { id: 'l-fin', nome: 'Financeiro', caminho: 'Sede · Financeiro' };
  const naMatriz = (
    id: string,
    rotulo: string,
    extras: Partial<PorMaquina['maquinas'][number]> = {},
  ) => ({
    id,
    rotulo,
    patrimonio: null,
    hostname: rotulo,
    pessoa: null,
    semContato: null,
    ...extras,
  });
  const POR_MAQUINA: PorMaquina = {
    por: 'maquina',
    local: LOCAL,
    pacotes: [PACOTE],
    maquinas: [
      naMatriz('a1', 'PC-FIN-01'),
      naMatriz('a2', 'PC-FIN-02', { pessoa: 'Renata Lopes' }),
      naMatriz('a3', 'PC-FIN-03'),
      naMatriz('a4', 'PC-FIN-04', { semContato: { dias: 3, texto: 'Sem contato · há 3 dias' } }),
    ],
    celulas: [
      {
        pacoteId: PACOTE.id,
        ativoId: 'a1',
        situacao: 'na-versao',
        versao: '23.01',
        distribuicao: null,
      },
      {
        pacoteId: PACOTE.id,
        ativoId: 'a2',
        situacao: 'desatualizada',
        versao: '22.01',
        distribuicao: null,
      },
      {
        pacoteId: PACOTE.id,
        ativoId: 'a3',
        situacao: 'sem-o-programa',
        versao: null,
        distribuicao: { id: 'd1', situacao: 'falhou', texto: 'Falhou', codigo: 1603 },
      },
      {
        pacoteId: PACOTE.id,
        ativoId: 'a4',
        situacao: 'desatualizada',
        versao: '19.00',
        distribuicao: null,
      },
    ],
    ultimas: [],
  };
  const POR_LOCAL: components['schemas']['MatrizPorLocal'] = {
    por: 'local',
    pacotes: [PACOTE],
    locais: [{ ...LOCAL, maquinas: 4 }],
    celulas: [{ pacoteId: PACOTE.id, localId: LOCAL.id, naVersao: 1, total: 4 }],
  };

  it('a célula do local abre o painel, e as células marcadas levam ao assistente com o local', async () => {
    const roteador = abrir('/gestao/software/matriz?por=local', {
      ...base(true),
      'GET /api/software/matriz': (pedido) =>
        Response.json(
          new URL(pedido.url).searchParams.get('por') === 'local' ? POR_LOCAL : POR_MAQUINA,
        ),
    });
    expect(await screen.findByRole('heading', { name: /^Software × locais/ })).toBeTruthy();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Financeiro · 7-Zip 23.01: 1 de 4 na versão-alvo',
      }),
    );
    const painel = await screen.findByRole('complementary', { name: 'Sede · Financeiro' });
    expect(await within(painel).findByText('3 fora da versão-alvo')).toBeTruthy();
    expect(within(painel).getByText('Falhou · 1603')).toBeTruthy();
    expect(within(painel).getByText('Sem contato')).toBeTruthy();
    expect(within(painel).getByText('Abaixo da versão-alvo')).toBeTruthy();

    // "Abrir a matriz do local" troca para o "Por máquina" daquele local.
    fireEvent.click(
      within(painel).getByRole('button', { name: 'Abrir a matriz do local Financeiro' }),
    );
    await waitFor(() => expect(roteador.state.location.search).toEqual({ local: LOCAL.id }));
    expect(await screen.findByRole('heading', { name: /^Software × máquinas/ })).toBeTruthy();
    const dePc = (numero: string) =>
      screen.getByRole('button', { name: new RegExp(`^PC-FIN-${numero} · 7-Zip 23\\.01:`) });
    expect(
      await screen.findByRole('button', {
        name: 'PC-FIN-02 · 7-Zip 23.01: 22.01, abaixo da versão-alvo',
      }),
    ).toBeTruthy();
    for (const numero of ['02', '03', '04']) fireEvent.click(dePc(numero));
    expect(dePc('03').getAttribute('aria-label')).toBe('PC-FIN-03 · 7-Zip 23.01: falta, marcada');
    const barra = screen.getByRole('region', { name: '3 marcadas no 7-Zip 23.01' });
    expect(
      within(barra).getByText(
        'PC-FIN-02, PC-FIN-03 e PC-FIN-04: 1 instala, 1 falhou da última vez e 1 está sem contato.',
      ),
    ).toBeTruthy();
    fireEvent.click(
      within(barra).getByRole('button', { name: 'Distribuir 7-Zip 23.01 a estas 3' }),
    );
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/software/distribuicoes/nova'),
    );
    expect(roteador.state.location.search).toEqual({
      pacote: PACOTE.id,
      maquinas: ['a2', 'a3', 'a4'],
      local: LOCAL.id,
    });
  });
});
