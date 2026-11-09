import { filaDeAvisos, TituloDaJanela } from '@grafite/ui';
import { createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Box } from 'lucide-react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import type { criarRoteador } from '../../../rotas/arvore.ts';
import { raiz } from '../../../rotas/raiz.tsx';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { useCadastro } from '../../cadastros.tsx';
import { REGISTRO } from '../../registro.ts';
import { definirModulo } from '../../tipos.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

/** O campo Tipo da tela de um módulo de teste, que pede o Novo tipo do catálogo. */
function TelaComOCampo() {
  const cadastro = useCadastro('tipo');
  const [escolhido, definirEscolhido] = useState('nenhum');
  return (
    <>
      <TituloDaJanela>Novo ativo</TituloDaJanela>
      <p>Tipo: {escolhido}</p>
      {cadastro && (
        <button
          type="button"
          onClick={async () => {
            const criado = await cadastro.pedir('tipo');
            if (criado) definirEscolhido(criado.nome);
          }}
        >
          {cadastro.link}
        </button>
      )}
    </>
  );
}

const rotasDoCampo = createRoute({
  getParentRoute: () => raiz,
  path: '/campo',
  component: TelaComOCampo,
});
const doCampo = definirModulo({
  id: 'campo',
  nome: 'Campo',
  icone: Box,
  endereco: '/campo',
  prioridadeNoCelular: 5,
  rotas: rotasDoCampo,
});
const modulos = [...REGISTRO.slice(0, -1), doCampo, ...REGISTRO.slice(-1)];

/** A árvore do app vem do registro fixo; o teste monta a dele, com a rota do campo. */
const arvore = raiz.addChildren([...REGISTRO.map((modulo) => modulo.rotas), rotasDoCampo]);

const problema = (status: number, codigo: string, detalhe: string, campos: object) =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      campos,
    },
    { status },
  );

const CATALOGO = 'catalogo.administrar';

function abrir(cadastrar: ServidorDeTeste[string], permissoes: PermissaoDaSessao[]) {
  noComputador();
  const roteador = createRouter({
    routeTree: arvore,
    history: createMemoryHistory({ initialEntries: ['/campo'] }),
    context: { modulos },
  }) as unknown as ReturnType<typeof criarRoteador>;
  const servidor: ServidorDeTeste = {
    'GET /api/campos': () => Response.json({ campos: [], permite: { cadastrar: true } }),
    'GET /api/capacidades': () => Response.json({ capacidades: [] }),
    'GET /api/tipos-de-ativo': () => Response.json({ tipos: [], permite: { cadastrar: true } }),
    'POST /api/tipos-de-ativo': cadastrar,
  };
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return screen.findByRole('heading', { level: 1, name: 'Novo ativo' });
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const nome = () => screen.getByRole('textbox', { name: 'Nome' }) as HTMLInputElement;

async function preencherOTipo(texto: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar novo tipo' }));
  await screen.findByRole('heading', { level: 1, name: 'Novo tipo' });
  fireEvent.change(await screen.findByRole('textbox', { name: 'Nome' }), {
    target: { value: texto },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Impressora' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
}

describe('o Novo tipo numa aba', () => {
  it('cadastra o tipo e volta ao campo com ele', async () => {
    const corpos: unknown[] = [];
    await abrir(async (pedido) => {
      corpos.push(await pedido.json());
      return Response.json({ id: 'impressora', nome: 'Impressora' }, { status: 201 });
    }, naOrganizacao(CATALOGO));
    await preencherOTipo('Impressora');

    expect(await screen.findByText('Tipo: Impressora')).toBeTruthy();
    expect(corpos).toEqual([
      {
        nome: 'Impressora',
        icone: 'impressora',
        capacidades: [],
        configuracaoDasCapacidades: {},
        campos: [],
        primeiroCartao: null,
      },
    ]);
    await waitFor(() => expect(avisos()).toContain('Tipo cadastrado.'));
  });

  it('o nome repetido fica no campo, e a aba continua aberta e preenchida', async () => {
    await abrir(
      () =>
        problema(409, 'conflito', 'Já existe um tipo com este nome.', {
          nome: 'Já existe um tipo com este nome.',
        }),
      naOrganizacao(CATALOGO),
    );
    await preencherOTipo('impressora');

    expect(await screen.findByText('Já existe um tipo com este nome.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Novo tipo' })).toBeTruthy();
    expect(nome().value).toBe('impressora');
  });

  it('sem cuidar do catálogo, o campo não oferece o Novo tipo', async () => {
    await abrir(() => new Response(null, { status: 500 }), naOrganizacao('ativos.editar'));
    expect(screen.queryByRole('button', { name: 'Cadastrar novo tipo' })).toBeNull();
  });
});
