// A distribuição de software na web (spec distribuicao-de-software; change
// distribuicao-de-software, design, decisão 6): a base para quem só distribui, o pacote novo com o
// arquivo, a distribuição pela busca das máquinas, a lista com o progresso, a ficha com o log e o
// pedir agora, e as distribuições na ficha do ativo.
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
type Ficha = components['schemas']['FichaDaDistribuicao'];
type Maquina = components['schemas']['MaquinaDaDistribuicao'];

const PACOTE: Pacote = {
  id: '0199a6e0-0000-7000-8000-0000000000e1',
  nome: '7-Zip 23.01',
  versao: '23.01',
  descricao: null,
  comando: 'msiexec /i "7z2301-x64.msi" /qn /norestart',
  codigosDeSucesso: [0, 3010],
  arquivo: { nome: '7z2301-x64.msi', tamanho: 1_572_864 },
  situacao: 'ativo',
};

const maquina = (id: string, patrimonio: string, extras: Partial<Maquina> = {}): Maquina => ({
  id,
  ativo: { id: `ativo-${id}`, rotulo: `Computador ${patrimonio}`, patrimonio },
  situacao: { chave: 'aguardando', texto: 'Aguardando o agente', tipo: 'neutra' },
  etapa: null,
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
const base = (administrar: boolean, pacotes: Pacote[] = [PACOTE]) => ({
  'GET /api/software/pacotes': () => Response.json({ pacotes, permite: { administrar } }),
});

describe('a base de software', () => {
  it('Técnico sem a administração: vê os pacotes e distribui, mas não tem "Novo pacote"', async () => {
    abrir('/gestao/software', base(false), naOrganizacao('software.distribuir'));
    const tabela = await screen.findByRole('grid', { name: 'Base de software' });
    expect(within(tabela).getByText('7-Zip 23.01')).toBeTruthy();
    expect(within(tabela).getByText('7z2301-x64.msi · 1,5 MB')).toBeTruthy();
    expect(within(tabela).getByRole('button', { name: 'Distribuir' })).toBeTruthy();
    expect(within(tabela).queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Novo pacote' })).toBeNull();
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
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /^Nome/ }), {
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
      versao: null,
      descricao: null,
      comando: 'msiexec /i "7z2301-x64.msi" /qn /norestart',
      codigosDeSucesso: '0, 3010',
    });
    expect(new URL(pedidos[1]?.endereco ?? '').searchParams.get('nome')).toBe('7z2301-x64.msi');
  });
});

describe('a distribuição', () => {
  it('Distribuição para as máquinas: escolhe pela busca e abre a ficha', async () => {
    let corpo: unknown;
    const roteador = abrir('/gestao/software', {
      ...base(true),
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
    });
    const tabela = await screen.findByRole('grid', { name: 'Base de software' });
    fireEvent.click(within(tabela).getByRole('button', { name: 'Distribuir' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Distribuir 7-Zip 23.01' });
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
    expect(corpo).toEqual({ pacoteId: PACOTE.id, ativoIds: ['ativo-00321', 'ativo-00518'] });
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

  it('Log da máquina: a ficha abre o log da que falhou, na ordem em que chegou', async () => {
    abrir('/gestao/software/distribuicoes/d1', {
      'GET /api/software/distribuicoes/d1': () =>
        Response.json(ficha([FALHOU], '0 de 1 concluída, 1 falhou')),
    });
    const tabela = await screen.findByRole('grid', { name: 'Máquinas da distribuição' });
    expect(within(tabela).getByText('Falhou')).toBeTruthy();
    expect(within(tabela).getByText('Executando: ko, action #1 processing failure')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pedir agora' })).toBeNull();
    fireEvent.click(
      within(tabela).getByRole('button', { name: 'Ver o log de Computador PAT-00412 (PAT-00412)' }),
    );
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

  it('Agente acordado: o pedir agora diz quantos responderam', async () => {
    const agora = vi.fn(() =>
      Response.json({
        acordados: 1,
        total: 2,
        mensagem: '1 de 2 agentes acordados; os outros recebem a tarefa no próximo contato.',
      }),
    );
    abrir('/gestao/software/distribuicoes/d1', {
      'GET /api/software/distribuicoes/d1': () =>
        Response.json(
          ficha([maquina('m1', 'PAT-00321'), maquina('m3', 'PAT-00518')], '0 de 2 concluídas'),
        ),
      'POST /api/software/distribuicoes/d1/agora': agora,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir agora' }));
    await waitFor(() =>
      expect(avisos()).toContain(
        '1 de 2 agentes acordados; os outros recebem a tarefa no próximo contato.',
      ),
    );
    expect(agora).toHaveBeenCalledTimes(1);
  });
});
