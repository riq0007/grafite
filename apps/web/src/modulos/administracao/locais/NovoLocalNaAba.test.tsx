import { filaDeAvisos, TituloDaJanela } from '@grafite/ui';
import { createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Box } from 'lucide-react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import type { criarRoteador } from '../../../rotas/arvore.ts';
import { raiz } from '../../../rotas/raiz.tsx';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { abrirEscolhaDeLocal, escolherLocal, filtrarLocais } from '../../../teste/escolhas.ts';
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

interface Local {
  id: string;
  paiId: string | null;
  nome: string;
  tipo: 'unidade' | 'predio' | 'andar' | 'setor' | 'sala' | 'outro';
  situacao: 'ativo' | 'inativo';
  permite: { editar: boolean };
}

const local = (
  id: string,
  paiId: string | null,
  nome: string,
  tipo: Local['tipo'],
  extras: Partial<Local> = {},
): Local => ({ id, paiId, nome, tipo, situacao: 'ativo', permite: { editar: true }, ...extras });

const LOCAIS: Local[] = [
  local('jundiai', null, 'Jundiaí', 'unidade'),
  local('administrativo', 'jundiai', 'Administrativo', 'predio'),
  local('andar1', 'administrativo', '1º andar', 'andar'),
  local('sala12', 'andar1', 'Sala 12', 'sala'),
  local('campinas', null, 'Campinas', 'unidade', { permite: { editar: false } }),
];

/** Os locais no servidor do teste, com o cadastro que guarda o pedido. */
function servidorDosLocais({ cadastrarNaRaiz = true } = {}) {
  const estado = { locais: [...LOCAIS] };
  const corpos: unknown[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/locais': () => Response.json({ locais: estado.locais, permite: { cadastrarNaRaiz } }),
    'POST /api/locais': async (pedido) => {
      const corpo = (await pedido.json()) as Pick<Local, 'paiId' | 'nome' | 'tipo'>;
      corpos.push(corpo);
      const criado = local(`novo-${estado.locais.length}`, corpo.paiId, corpo.nome, corpo.tipo);
      estado.locais = [...estado.locais, criado];
      return Response.json(criado, { status: 201 });
    },
  };
  return { servidor, corpos };
}

/** O campo Local da tela de um módulo de teste, que pede o Novo local da Administração. */
function TelaComOCampo() {
  const cadastro = useCadastro('local');
  const [escolhido, definirEscolhido] = useState('nenhum');
  return (
    <>
      <TituloDaJanela>Novo ativo</TituloDaJanela>
      <p>Local: {escolhido}</p>
      {cadastro && (
        <button
          type="button"
          onClick={async () => {
            const criado = await cadastro.pedir('local');
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

async function abrirONovoLocal() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar novo local' }));
  await screen.findByRole('heading', { level: 1, name: 'Novo local' });
  // O título vem antes dos locais: o formulário aparece quando eles chegam.
  return screen.findByRole('textbox', { name: 'Nome' });
}

async function escolherTipo(tipo: string) {
  fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
  fireEvent.click(await screen.findByRole('option', { name: tipo }));
}

describe('o Novo local numa aba', () => {
  it('cadastra o local dentro do escolhido e volta ao campo com ele', async () => {
    const { servidor, corpos } = servidorDosLocais();
    await abrir(servidor, naOrganizacao('locais.editar'));
    await abrirONovoLocal();
    fireEvent.change(campo('Nome'), { target: { value: 'Sala 13' } });
    await escolherTipo('Sala');
    await escolherLocal('Dentro de', 'Jundiaí › Administrativo › 1º andar');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Local: Sala 13')).toBeTruthy();
    expect(corpos).toEqual([{ nome: 'Sala 13', tipo: 'sala', paiId: 'andar1' }]);
    await waitFor(() => expect(avisos()).toContain('Local cadastrado.'));
    expect(screen.queryByRole('tablist', { name: 'Abas da janela' })).toBeNull();
  });

  it('o nome repetido entre os irmãos fica no campo do nome, e a aba continua aberta', async () => {
    const { servidor, corpos } = servidorDosLocais();
    await abrir(servidor, naOrganizacao('locais.editar'));
    await abrirONovoLocal();
    fireEvent.change(campo('Nome'), { target: { value: 'sala 12' } });
    await escolherTipo('Sala');
    await escolherLocal('Dentro de', 'Jundiaí › Administrativo › 1º andar');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Já existe um local com este nome aqui.')).toBeTruthy();
    expect(corpos).toEqual([]);
    expect(screen.getByRole('heading', { level: 1, name: 'Novo local' })).toBeTruthy();
  });

  it('em "Dentro de", os locais que a conta não altera ficam à vista, sem a escolha, e fora do filtro', async () => {
    const { servidor } = servidorDosLocais();
    await abrir(servidor, naOrganizacao('locais.editar'));
    await abrirONovoLocal();
    const painel = await abrirEscolhaDeLocal('Dentro de');
    expect(
      within(painel).getByRole('row', { name: /^Campinas.*não pode ser escolhido$/ }),
    ).toBeTruthy();
    expect(await filtrarLocais(painel, 'Sala')).toEqual([
      'Jundiaí › Administrativo › 1º andar › Sala 12',
    ]);
    const filtro = within(painel).getByRole('searchbox', { name: 'Filtrar' });
    fireEvent.change(filtro, { target: { value: 'Campinas' } });
    await waitFor(() =>
      expect(within(painel).queryByRole('option', { name: /Sala 12/ })).toBeNull(),
    );
    expect(within(painel).queryByRole('option', { name: 'Campinas' })).toBeNull();
  });

  it('sem poder cadastrar na raiz, o local de dentro é obrigatório', async () => {
    const { servidor, corpos } = servidorDosLocais({ cadastrarNaRaiz: false });
    await abrir(servidor, naOrganizacao('locais.editar'));
    await abrirONovoLocal();
    fireEvent.change(campo('Nome'), { target: { value: 'Portaria' } });
    await escolherTipo('Setor');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Escolha onde o local fica.')).toBeTruthy();
    expect(corpos).toEqual([]);
  });
});
