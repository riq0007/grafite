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

/** O tipo do ativo na tela do campo: o Novo modelo abre com ele, quando há. */
let tipoDoAtivo: string | undefined;

/** O campo Modelo da tela de um módulo de teste, que pede o Novo modelo do catálogo. */
function TelaComOCampo() {
  const cadastro = useCadastro('modelo');
  const [escolhido, definirEscolhido] = useState('nenhum');
  return (
    <>
      <TituloDaJanela>Novo ativo</TituloDaJanela>
      <p>Modelo: {escolhido}</p>
      {cadastro && (
        <button
          type="button"
          onClick={async () => {
            const criado = await cadastro.pedir(
              'modelo',
              tipoDoAtivo ? { inicial: { tipoId: tipoDoAtivo } } : {},
            );
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

const tipo = (id: string, nome: string, icone: string) => ({
  id,
  nome,
  icone,
  capacidades: [],
  configuracaoDasCapacidades: {},
  campos: [],
  situacao: 'ativo',
  permite: { editar: true },
});

/** O catálogo no servidor do teste: os tipos crescem com o Novo tipo, e o modelo é guardado. */
function catalogo() {
  const tipos = [tipo('impressora', 'Impressora', 'impressora')];
  const modelos: { tipoId: string; fabricante: string; nome: string }[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/tipos-de-ativo': () => Response.json({ tipos, permite: { cadastrar: true } }),
    'GET /api/campos': () => Response.json({ campos: [], permite: { cadastrar: true } }),
    'GET /api/capacidades': () => Response.json({ capacidades: [] }),
    'GET /api/modelos/fabricantes': () => Response.json({ fabricantes: ['HP'], doTipo: [] }),
    'POST /api/tipos-de-ativo': async (pedido) => {
      const corpo = (await pedido.json()) as { nome: string; icone: string };
      const criado = tipo('notebook', corpo.nome, corpo.icone);
      tipos.push(criado);
      return Response.json(criado, { status: 201 });
    },
    'POST /api/modelos': async (pedido) => {
      const corpo = (await pedido.json()) as { tipoId: string; fabricante: string; nome: string };
      modelos.push(corpo);
      const doTipo = tipos.find((candidato) => candidato.id === corpo.tipoId);
      return Response.json(
        {
          id: 'm-novo',
          tipo: { id: corpo.tipoId, nome: doTipo?.nome, icone: doTipo?.icone },
          fabricante: corpo.fabricante,
          nome: corpo.nome,
          imagem: null,
          situacao: 'ativo',
          permite: { editar: true },
        },
        { status: 201 },
      );
    },
  };
  return { servidor, modelos };
}

function abrir(servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[]) {
  noComputador();
  const roteador = createRouter({
    routeTree: arvore,
    history: createMemoryHistory({ initialEntries: ['/campo'] }),
    context: { modulos },
  }) as unknown as ReturnType<typeof criarRoteador>;
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return screen.findByRole('heading', { level: 1, name: 'Novo ativo' });
}

const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });

/** O fabricante e o nome do modelo, e o cadastro. */
async function preencherECadastrar(nome: string) {
  const fabricante = screen.getByRole('combobox', { name: 'Fabricante' });
  fabricante.focus();
  fireEvent.change(fabricante, { target: { value: 'HP' } });
  // A escolha fecha as sugestões, que escondem o resto da tela do leitor de tela enquanto abertas.
  fireEvent.click(await screen.findByRole('option', { name: 'HP' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Modelo' }), { target: { value: nome } });
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
}

describe('o Novo modelo numa aba', () => {
  it('pedido pelo ativo, abre com o tipo dele, que não muda, e volta ao campo com o modelo', async () => {
    tipoDoAtivo = 'impressora';
    const { servidor, modelos } = catalogo();
    await abrir(servidor, naOrganizacao('modelos.editar'));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo modelo' }));
    await titulo('Novo modelo');
    expect(await screen.findByText('Tipo: Impressora')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadastrar novo tipo' })).toBeNull();
    await preencherECadastrar('LaserJet M404');

    expect(await screen.findByText('Modelo: LaserJet M404')).toBeTruthy();
    expect(modelos).toEqual([{ tipoId: 'impressora', fabricante: 'HP', nome: 'LaserJet M404' }]);
  });

  it('o Tipo do Novo modelo abre o Novo tipo, que volta escolhido nele', async () => {
    tipoDoAtivo = undefined;
    const { servidor, modelos } = catalogo();
    await abrir(servidor, naOrganizacao('modelos.editar', 'catalogo.administrar'));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo modelo' }));
    await titulo('Novo modelo');

    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar novo tipo' }));
    await titulo('Novo tipo');
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Notebook' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Computador' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await titulo('Novo modelo');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Tipo/ }).textContent).toContain('Notebook'),
    );
    await preencherECadastrar('ThinkPad T14');
    expect(await screen.findByText('Modelo: ThinkPad T14')).toBeTruthy();
    expect(modelos).toEqual([{ tipoId: 'notebook', fabricante: 'HP', nome: 'ThinkPad T14' }]);
  });
});
