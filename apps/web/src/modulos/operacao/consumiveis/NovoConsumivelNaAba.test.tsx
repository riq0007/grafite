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

// O Novo consumível numa aba da janela, pedido pelo campo de outro módulo ou da entrada no estoque
// (spec consumiveis, "Novo consumível numa aba"; change p4c-estoque, design, decisão 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const conflito = (detalhe: string, campos: object) =>
  Response.json(
    {
      type: 'urn:grafite:problema:conflito',
      title: 'Conflito',
      status: 409,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      campos,
    },
    { status: 409 },
  );

/** O cadastro dos consumíveis no servidor do teste, que guarda o pedido. */
function servidorDosConsumiveis() {
  const corpos: unknown[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/consumiveis/modelos': () => Response.json({ modelos: [] }),
    'GET /api/fornecedores/escolha': () => Response.json({ fornecedores: [] }),
    'POST /api/consumiveis': async (pedido) => {
      const corpo = (await pedido.json()) as { codigo: string };
      corpos.push(corpo);
      if (corpo.codigo.toUpperCase().replace(/[\s-]/g, '') === 'CF258A') {
        return conflito('Já existe um consumível com este código.', {
          codigo: 'Já existe um consumível com este código.',
        });
      }
      return Response.json(
        {
          id: 'cf259a',
          codigo: corpo.codigo,
          nome: null,
          tipo: 'toner',
          cor: 'preto',
          rendimento: null,
          situacao: 'ativo',
          criadoEm: '2026-10-21T12:00:00.000Z',
          atualizadoEm: '2026-10-21T12:00:00.000Z',
          fornecedores: [],
          modelos: [],
          permite: { editar: true },
        },
        { status: 201 },
      );
    },
  };
  return { servidor, corpos };
}

/** O campo do consumível da entrada de um módulo de teste, que pede o Novo consumível. */
function TelaComOCampo() {
  const cadastro = useCadastro('consumivel');
  const [escolhido, definirEscolhido] = useState('nenhum');
  return (
    <>
      <TituloDaJanela>Nova entrada</TituloDaJanela>
      <p>Consumível: {escolhido}</p>
      {cadastro && (
        <button
          type="button"
          onClick={async () => {
            const criado = await cadastro.pedir('consumivel');
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
  return screen.findByRole('heading', { level: 1, name: 'Nova entrada' });
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const campo = (rotulo: string) => screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement;

async function escolher(rotulo: RegExp, opcao: string) {
  fireEvent.click(screen.getByRole('button', { name: rotulo }));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

async function abrirONovoConsumivel() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar novo consumível' }));
  await screen.findByRole('heading', { level: 1, name: 'Novo consumível' });
  return screen.findByRole('textbox', { name: 'Código' });
}

describe('o Novo consumível numa aba', () => {
  it('Consumível criado pelo campo da entrada: volta ao campo com o código, com "Consumível cadastrado."', async () => {
    const { servidor, corpos } = servidorDosConsumiveis();
    await abrir(servidor, naOrganizacao('consumiveis.editar', 'estoque.movimentar'));
    await abrirONovoConsumivel();
    fireEvent.change(campo('Código'), { target: { value: 'CF259A' } });
    await escolher(/Tipo/, 'Toner');
    await escolher(/Cor/, 'Preto');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Consumível: CF259A')).toBeTruthy();
    expect(corpos).toEqual([
      expect.objectContaining({ codigo: 'CF259A', tipo: 'toner', cor: 'preto' }),
    ]);
    await waitFor(() => expect(avisos()).toContain('Consumível cadastrado.'));
    expect(screen.queryByRole('tablist', { name: 'Abas da janela' })).toBeNull();
  });

  it('Código repetido na aba: a aba continua aberta, com a recusa no campo Código', async () => {
    const { servidor } = servidorDosConsumiveis();
    await abrir(servidor, naOrganizacao('consumiveis.editar', 'estoque.movimentar'));
    await abrirONovoConsumivel();
    fireEvent.change(campo('Código'), { target: { value: 'cf 258a' } });
    await escolher(/Tipo/, 'Toner');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Já existe um consumível com este código.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Novo consumível' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Abas da janela' })).toBeTruthy();
  });

  it('sem consumiveis.editar, o campo não oferece o cadastro', async () => {
    const { servidor } = servidorDosConsumiveis();
    await abrir(servidor, naOrganizacao('consumiveis.ver', 'estoque.movimentar'));
    expect(screen.getByText('Consumível: nenhum')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadastrar novo consumível' })).toBeNull();
  });
});
