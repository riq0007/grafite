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

// O Novo fornecedor numa aba da janela, pedido pelo campo de outro módulo (spec fornecedores, "Novo
// fornecedor numa aba"; change p4a-fornecedores, design, decisão 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

/** O cadastro dos fornecedores no servidor do teste, que guarda o pedido. */
function servidorDosFornecedores() {
  const corpos: unknown[] = [];
  const servidor: ServidorDeTeste = {
    'POST /api/fornecedores': async (pedido) => {
      const corpo = (await pedido.json()) as { nome: string };
      corpos.push(corpo);
      return Response.json(
        {
          id: 'hp',
          nome: corpo.nome,
          cnpj: '12.345.678/0001-95',
          contato: null,
          email: null,
          telefone: null,
          observacoes: null,
          situacao: 'ativo',
          criadoEm: '2026-10-19T12:00:00.000Z',
          atualizadoEm: '2026-10-19T12:00:00.000Z',
          permite: { editar: true },
        },
        { status: 201 },
      );
    },
  };
  return { servidor, corpos };
}

/** O campo Fornecedor da tela de um módulo de teste, que pede o Novo fornecedor da Administração. */
function TelaComOCampo() {
  const cadastro = useCadastro('fornecedor');
  const [escolhido, definirEscolhido] = useState('nenhum');
  return (
    <>
      <TituloDaJanela>Novo ativo</TituloDaJanela>
      <p>Fornecedor: {escolhido}</p>
      {cadastro && (
        <button
          type="button"
          onClick={async () => {
            const criado = await cadastro.pedir('fornecedor');
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
  return screen.findByRole('heading', { level: 1, name: 'Novo ativo' });
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const campo = (rotulo: string) => screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement;

async function abrirONovoFornecedor() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar novo fornecedor' }));
  await screen.findByRole('heading', { level: 1, name: 'Novo fornecedor' });
  return screen.findByRole('textbox', { name: 'Nome' });
}

describe('o Novo fornecedor numa aba', () => {
  it('cadastra o fornecedor e volta ao campo com ele, com "Fornecedor cadastrado."', async () => {
    const { servidor, corpos } = servidorDosFornecedores();
    await abrir(servidor, naOrganizacao('fornecedores.ver', 'fornecedores.editar'));
    await abrirONovoFornecedor();
    fireEvent.change(campo('Nome'), { target: { value: 'HP Brasil' } });
    fireEvent.change(campo('CNPJ'), { target: { value: '12345678000195' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Fornecedor: HP Brasil')).toBeTruthy();
    expect(corpos).toEqual([
      {
        nome: 'HP Brasil',
        cnpj: '12345678000195',
        contato: null,
        email: null,
        telefone: null,
        observacoes: null,
      },
    ]);
    await waitFor(() => expect(avisos()).toContain('Fornecedor cadastrado.'));
    expect(screen.queryByRole('tablist', { name: 'Abas da janela' })).toBeNull();
  });

  it('o CNPJ recusado fica no campo, e a aba continua aberta', async () => {
    const { servidor, corpos } = servidorDosFornecedores();
    await abrir(servidor, naOrganizacao('fornecedores.ver', 'fornecedores.editar'));
    await abrirONovoFornecedor();
    fireEvent.change(campo('Nome'), { target: { value: 'HP Brasil' } });
    fireEvent.change(campo('CNPJ'), { target: { value: '12.345.678/0001-96' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('CNPJ inválido: confira os 14 caracteres.')).toBeTruthy();
    expect(corpos).toEqual([]);
    expect(screen.getByRole('heading', { level: 1, name: 'Novo fornecedor' })).toBeTruthy();
  });

  it('sem fornecedores.editar, o campo não oferece o cadastro', async () => {
    const { servidor } = servidorDosFornecedores();
    await abrir(servidor, naOrganizacao('fornecedores.ver'));
    expect(screen.getByText('Fornecedor: nenhum')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadastrar novo fornecedor' })).toBeNull();
  });
});
