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
import { campoDeLocal } from '../../../teste/escolhas.ts';
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

/** O campo Responsável da tela de um módulo de teste, que pede a Nova pessoa da Administração. */
function TelaComOCampo() {
  const cadastro = useCadastro('pessoa');
  const [escolhida, definirEscolhida] = useState('ninguém');
  return (
    <>
      <TituloDaJanela>Novo ativo</TituloDaJanela>
      <p>Responsável: {escolhida}</p>
      {cadastro && (
        <button
          type="button"
          onClick={async () => {
            const criada = await cadastro.pedir('responsavel');
            if (criada) definirEscolhida(criada.nome);
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

function abrir(
  cadastrar: ServidorDeTeste[string],
  extras: ServidorDeTeste = {},
  permissoes = naOrganizacao('pessoas.editar', 'pessoas.ver'),
) {
  noComputador();
  const roteador = createRouter({
    routeTree: arvore,
    history: createMemoryHistory({ initialEntries: ['/campo'] }),
    context: { modulos },
  }) as unknown as ReturnType<typeof criarRoteador>;
  const servidor: ServidorDeTeste = {
    'GET /api/locais': () => Response.json({ locais: [], permite: { cadastrarNaRaiz: true } }),
    'POST /api/pessoas': cadastrar,
    ...extras,
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
const preencher = (rotulo: string, valor: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: rotulo }), { target: { value: valor } });

async function abrirANovaPessoa() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar nova pessoa' }));
  return screen.findByRole('heading', { level: 1, name: 'Nova pessoa' });
}

describe('a Nova pessoa numa aba', () => {
  it('cadastra a pessoa e volta ao campo com ela', async () => {
    const corpos: unknown[] = [];
    await abrir(async (pedido) => {
      corpos.push(await pedido.json());
      return Response.json({ id: 'p-ana', nome: 'Ana Souza' }, { status: 201 });
    });
    await abrirANovaPessoa();
    preencher('Nome', 'Ana Souza');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Responsável: Ana Souza')).toBeTruthy();
    expect(corpos).toEqual([
      { nome: 'Ana Souza', email: null, matricula: null, telefone: null, localId: null },
    ]);
    await waitFor(() => expect(avisos()).toContain('Pessoa cadastrada.'));
  });

  it('a matrícula repetida fica no campo dela, e a aba continua aberta e preenchida', async () => {
    await abrir(() =>
      problema(409, 'conflito', 'Esta matrícula já é de outra pessoa.', {
        matricula: 'Esta matrícula já é de outra pessoa.',
      }),
    );
    await abrirANovaPessoa();
    preencher('Nome', 'João da Silva');
    preencher('Matrícula', '004512');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Esta matrícula já é de outra pessoa.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Nova pessoa' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Nome' }) as HTMLInputElement).value).toBe(
      'João da Silva',
    );
  });
});

describe('a cadeia da Nova pessoa ao Novo local', () => {
  it('o Local de trabalho abre o Novo local, e cada um volta à aba que o pediu', async () => {
    const locais = [
      {
        id: 'jundiai',
        paiId: null,
        nome: 'Jundiaí',
        tipo: 'unidade',
        situacao: 'ativo',
        permite: { editar: true },
      },
    ];
    const corpos: unknown[] = [];
    await abrir(
      async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json({ id: 'p-ana', nome: 'Ana Souza' }, { status: 201 });
      },
      {
        'GET /api/locais': () => Response.json({ locais, permite: { cadastrarNaRaiz: true } }),
        'POST /api/locais': async (pedido) => {
          const corpo = (await pedido.json()) as object;
          const criado = { id: 'portaria', situacao: 'ativo', permite: { editar: true }, ...corpo };
          locais.push(criado as (typeof locais)[number]);
          return Response.json(criado, { status: 201 });
        },
      },
      naOrganizacao('pessoas.editar', 'pessoas.ver', 'locais.editar'),
    );
    await abrirANovaPessoa();
    preencher('Nome', 'Ana Souza');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo local' }));
    await screen.findByRole('heading', { level: 1, name: 'Novo local' });
    preencher('Nome', 'Portaria');
    fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Setor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await screen.findByRole('heading', { level: 1, name: 'Nova pessoa' });
    await waitFor(() =>
      expect(campoDeLocal('Local de trabalho').textContent).toContain('Portaria'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Responsável: Ana Souza')).toBeTruthy();
    expect(corpos).toEqual([
      { nome: 'Ana Souza', email: null, matricula: null, telefone: null, localId: 'portaria' },
    ]);
  });
});
