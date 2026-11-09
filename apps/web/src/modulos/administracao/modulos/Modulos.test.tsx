import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import {
  estadoDaSessaoAtiva,
  naOrganizacao,
  type ServidorDeTeste,
  sessaoAtiva,
} from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const PERMISSOES = naOrganizacao('organizacao.editar', 'ativos.ver');

const ATIVOS = {
  id: 'ativos',
  nome: 'Ativos',
  descricao: 'O catálogo, o cadastro e a lista dos ativos.',
};

/** O servidor com os módulos da organização, que muda a cada gravação, como a API. */
function servidorDosModulos(desligados: string[] = [], extras: ServidorDeTeste = {}) {
  const estado = { desligados: [...desligados], gravacoes: [] as unknown[] };
  const lista = () =>
    Response.json({ modulos: [{ ...ATIVOS, ligado: !estado.desligados.includes('ativos') }] });
  const servidor: ServidorDeTeste = {
    'GET /api/organizacao/modulos': lista,
    'PUT /api/organizacao/modulos/ativos': async (pedido) => {
      const corpo = (await pedido.json()) as { ligado: boolean };
      estado.gravacoes.push(corpo);
      estado.desligados = corpo.ligado ? [] : ['ativos'];
      return lista();
    },
    'GET /api/sessao': () =>
      estadoDaSessaoAtiva(PERMISSOES, { modulosDesligados: estado.desligados }),
    ...extras,
  };
  return { estado, servidor };
}

async function abrir(
  servidor: ServidorDeTeste,
  desligados: string[] = [],
  canal = criarCanalDeEventos(),
) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/administracao/modulos'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(PERMISSOES, servidor, {}, {}, { modulosDesligados: desligados })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  await screen.findByRole('heading', { level: 1, name: 'Módulos' });
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const interruptor = async (nome: string) =>
  (await screen.findByRole('switch', { name: nome })) as HTMLInputElement;
const noDock = async () =>
  within(await screen.findByRole('navigation', { name: 'Dock' }))
    .getAllByRole('button')
    .map((item) => item.getAttribute('aria-label'));

describe('Administração › Módulos', () => {
  it('lista os módulos opcionais com o nome, a descrição e o interruptor, que diz em texto se ele está ligado', async () => {
    await abrir(servidorDosModulos().servidor);
    const ativos = await interruptor('Ativos Ligado');
    expect(ativos.checked).toBe(true);
    expect(screen.getByText('O catálogo, o cadastro e a lista dos ativos.')).toBeTruthy();
  });

  it('desligar pede confirmação, e "Cancelar" deixa o módulo ligado, sem gravar nada', async () => {
    const { servidor, estado } = servidorDosModulos();
    await abrir(servidor);
    fireEvent.click(await interruptor('Ativos Ligado'));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Desligar o módulo Ativos?' });
    expect(dialogo.textContent).toContain(
      'O módulo Ativos some do dock e da busca de todos, e os dados dele ficam guardados.',
    );
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((await interruptor('Ativos Ligado')).checked).toBe(true);
    expect(estado.gravacoes).toEqual([]);
  });

  it('desligar confirmado grava, avisa e tira o módulo do dock na hora', async () => {
    const { servidor, estado } = servidorDosModulos();
    await abrir(servidor);
    expect(await noDock()).toContain('Ativos');
    fireEvent.click(await interruptor('Ativos Ligado'));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Desligar o módulo Ativos?' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desligar o módulo' }));
    await waitFor(() => expect(avisos()).toContain('Módulo desligado.'));
    expect(estado.gravacoes).toEqual([{ ligado: false }]);
    expect((await interruptor('Ativos Desligado')).checked).toBe(false);
    await waitFor(async () => expect(await noDock()).not.toContain('Ativos'));
  });

  it('ligar não pede confirmação, avisa e põe o módulo de volta no dock', async () => {
    const { servidor, estado } = servidorDosModulos(['ativos']);
    await abrir(servidor, ['ativos']);
    expect(await noDock()).not.toContain('Ativos');
    fireEvent.click(await interruptor('Ativos Desligado'));
    await waitFor(() => expect(avisos()).toContain('Módulo ligado.'));
    expect(screen.queryByRole('alertdialog', { name: /^Desligar o módulo/ })).toBeNull();
    expect(estado.gravacoes).toEqual([{ ligado: true }]);
    await waitFor(async () => expect(await noDock()).toContain('Ativos'));
  });

  it('a recusa aparece junto do módulo, e o interruptor volta ao que estava', async () => {
    const { servidor } = servidorDosModulos(['ativos'], {
      'PUT /api/organizacao/modulos/ativos': () =>
        Response.json(
          {
            type: 'urn:grafite:problema:nao-encontrado',
            title: 'Não encontrado',
            status: 404,
            detail: 'Módulo não encontrado.',
            codigoDeRastreio: 'R7K2-9QXM',
          },
          { status: 404 },
        ),
    });
    await abrir(servidor, ['ativos']);
    fireEvent.click(await interruptor('Ativos Desligado'));
    const modulo = (await interruptor('Ativos Desligado')).closest('li') as HTMLElement;
    expect(await within(modulo).findByText('Módulo não encontrado.')).toBeTruthy();
    expect((await interruptor('Ativos Desligado')).checked).toBe(false);
    expect(avisos()).not.toContain('Módulo ligado.');
  });

  it('a mudança feita em outra sessão aparece na tela aberta', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDosModulos();
    await abrir(servidor, [], canal);
    await interruptor('Ativos Ligado');
    estado.desligados = ['ativos'];
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000005',
      tipo: 'modulos.mudaram',
      momento: '2026-10-09T12:00:00.000Z',
      alvo: { tipo: 'modulo', id: null },
    });
    expect((await interruptor('Ativos Desligado')).checked).toBe(false);
  });

  it('sem organizacao.editar, a seção diz a quem pedir acesso, sem pedir os módulos', async () => {
    noComputador();
    const modulos = vi.fn(() => Response.json({ modulos: [] }));
    const roteador = criarRoteador(
      createMemoryHistory({ initialEntries: ['/administracao/modulos'] }),
    );
    render(
      <App
        roteador={roteador}
        sessao={sessaoAtiva(naOrganizacao('pessoas.ver'), {
          'GET /api/organizacao/modulos': modulos,
          'GET /api/acesso/administradores': () =>
            Response.json({ administradores: ['Ana Souza'] }),
        })}
      />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Módulos' });
    expect(await screen.findByText('Você não tem acesso a Módulos.')).toBeTruthy();
    expect(modulos).not.toHaveBeenCalled();
  });
});
