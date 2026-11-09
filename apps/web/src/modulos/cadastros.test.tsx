import { TituloDaJanela } from '@grafite/ui';
import { createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Box } from 'lucide-react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import type { PropsDoCadastroNaAba } from '../casca/abasDoApp.tsx';
import type { criarRoteador } from '../rotas/arvore.ts';
import { raiz } from '../rotas/raiz.tsx';
import type { LojaDaSessao } from '../sessao/loja.ts';
import type { PermissaoDaSessao } from '../sessao/useAcesso.ts';
import { sessaoAtiva } from '../teste/sessao.ts';
import { useCadastro } from './cadastros.tsx';
import { REGISTRO } from './registro.ts';
import { definirModulo } from './tipos.ts';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function NovoLocal({ aoConcluir }: PropsDoCadastroNaAba) {
  return (
    <>
      <TituloDaJanela>Novo local</TituloDaJanela>
      <button type="button" onClick={() => aoConcluir({ id: 'sala-12', nome: 'Sala 12' })}>
        Salvar
      </button>
    </>
  );
}

/** O campo Local da tela de um módulo, que pede o cadastro registrado por outro. */
function TelaComOCampo() {
  const cadastro = useCadastro('local');
  const [local, definirLocal] = useState('nenhum');
  return (
    <>
      <TituloDaJanela>Novo ativo</TituloDaJanela>
      <p>Local: {local}</p>
      {cadastro && (
        <button
          type="button"
          onClick={async () => {
            const criado = await cadastro.pedir('local');
            if (criado) definirLocal(criado.nome);
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
const rotasDosLocais = createRoute({ getParentRoute: () => raiz, path: '/locais-de-teste' });
const dosLocais = definirModulo({
  id: 'locais-de-teste',
  nome: 'Locais de teste',
  icone: Box,
  endereco: '/locais-de-teste',
  prioridadeNoCelular: 6,
  rotas: rotasDosLocais,
  cadastros: [
    {
      alvo: 'local',
      titulo: 'Novo local',
      link: 'Cadastrar novo local',
      permissoes: ['locais.editar'],
      componente: NovoLocal,
    },
  ],
});
// Sem os módulos que já registram cadastros, como a Administração com o Novo local: o local do
// teste é o do módulo de teste.
const semCadastros = REGISTRO.filter((modulo) => !modulo.cadastros);
const modulos = [...semCadastros.slice(0, -1), doCampo, dosLocais, ...semCadastros.slice(-1)];

/** A árvore do app vem do registro fixo; o teste monta a dele, com as rotas dos dois módulos. */
const arvore = raiz.addChildren([
  ...REGISTRO.map((modulo) => modulo.rotas),
  rotasDoCampo,
  rotasDosLocais,
]);

function abrir(sessao: LojaDaSessao) {
  const roteador = createRouter({
    routeTree: arvore,
    history: createMemoryHistory({ initialEntries: ['/campo'] }),
    context: { modulos },
  }) as unknown as ReturnType<typeof criarRoteador>;
  render(<App roteador={roteador} sessao={sessao} />);
  return screen.findByRole('heading', { level: 1, name: 'Novo ativo' });
}

const EDITAR_LOCAIS: PermissaoDaSessao = { chave: 'locais.editar', organizacao: true, locais: [] };

describe('o cadastro pedido por um campo', () => {
  it('com a permissão, o campo mostra o link do cadastro do outro módulo, que abre numa aba e volta com o registro', async () => {
    await abrir(sessaoAtiva([EDITAR_LOCAIS]));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo local' }));
    await screen.findByRole('heading', { level: 1, name: 'Novo local' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Local: Sala 12')).toBeTruthy();
  });

  it('sem a permissão do cadastro, o link não aparece', async () => {
    await abrir(sessaoAtiva());
    expect(screen.queryByRole('button', { name: 'Cadastrar novo local' })).toBeNull();
  });

  it('com o módulo do cadastro desligado, o link não aparece', async () => {
    await abrir(
      sessaoAtiva([EDITAR_LOCAIS], {}, {}, {}, { modulosDesligados: ['locais-de-teste'] }),
    );
    expect(screen.queryByRole('button', { name: 'Cadastrar novo local' })).toBeNull();
  });
});
