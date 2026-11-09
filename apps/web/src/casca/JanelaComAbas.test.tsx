import { TituloDaJanela } from '@grafite/ui';
import { createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Box } from 'lucide-react';
import { type ComponentType, type ReactNode, useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { REGISTRO } from '../modulos/registro.ts';
import { definirModulo } from '../modulos/tipos.ts';
import type { criarRoteador } from '../rotas/arvore.ts';
import { raiz } from '../rotas/raiz.tsx';
import { sessaoAtiva } from '../teste/sessao.ts';
import { type PropsDoCadastroNaAba, useAbasDaJanela } from './abasDoApp.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** O formulário de um cadastro de teste: o nome, o Salvar e o Cancelar. */
function Formulario({
  titulo,
  rotulo,
  aoConcluir,
  aoCancelar,
  aoMudarPreenchido,
  children,
}: PropsDoCadastroNaAba & { titulo: string; rotulo: string; children?: ReactNode }) {
  const [nome, definirNome] = useState('');
  return (
    <>
      <TituloDaJanela>{titulo}</TituloDaJanela>
      <label>
        {rotulo}
        <input
          value={nome}
          onChange={(evento) => {
            definirNome(evento.target.value);
            aoMudarPreenchido(evento.target.value !== '');
          }}
        />
      </label>
      {children}
      <button type="button" onClick={() => aoConcluir({ id: `id-${nome}`, nome })}>
        Salvar
      </button>
      <button type="button" onClick={aoCancelar}>
        Cancelar
      </button>
    </>
  );
}

const NovoLocal = (props: PropsDoCadastroNaAba) => (
  <Formulario {...props} titulo="Novo local" rotulo="Nome do local" />
);

const NovoTipo = (props: PropsDoCadastroNaAba) => (
  <Formulario {...props} titulo="Novo tipo" rotulo="Nome do tipo" />
);

/** O Novo modelo pede o Novo tipo pelo campo Tipo dele, numa outra aba. */
const NovoModelo = (props: PropsDoCadastroNaAba) => (
  <Formulario {...props} titulo="Novo modelo" rotulo="Nome do modelo">
    <CampoQuePede rotulo="Tipo" alvo="tipo" titulo="Novo tipo" componente={NovoTipo} />
  </Formulario>
);

/** Um campo que mostra o escolhido e pede o cadastro dele numa aba, como os do ativo. */
function CampoQuePede({
  rotulo,
  alvo,
  titulo,
  componente,
}: {
  rotulo: string;
  alvo: string;
  titulo: string;
  componente: ComponentType<PropsDoCadastroNaAba>;
}) {
  const { pedir } = useAbasDaJanela();
  const [valor, definirValor] = useState('nenhum');
  const campo = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={campo} type="button">
        {rotulo}: {valor}
      </button>
      <button
        type="button"
        onClick={async () => {
          const criado = await pedir({
            alvo,
            titulo,
            campo: alvo,
            componente,
            aoVoltar: () => campo.current?.focus(),
          });
          if (criado) definirValor(criado.nome);
        }}
      >
        Cadastrar {titulo.toLowerCase()}
      </button>
    </>
  );
}

function NovoAtivo() {
  return (
    <>
      <TituloDaJanela>Novo ativo</TituloDaJanela>
      <label>
        Nome do ativo <input />
      </label>
      <CampoQuePede rotulo="Local" alvo="local" titulo="Novo local" componente={NovoLocal} />
      <CampoQuePede rotulo="Modelo" alvo="modelo" titulo="Novo modelo" componente={NovoModelo} />
    </>
  );
}

const rotas = createRoute({ getParentRoute: () => raiz, path: '/exemplo', component: NovoAtivo });
const exemplo = definirModulo({
  id: 'exemplo',
  nome: 'Exemplo',
  icone: Box,
  endereco: '/exemplo',
  prioridadeNoCelular: 5,
  rotas,
});
const comExemplo = [...REGISTRO.slice(0, -1), exemplo, ...REGISTRO.slice(-1)];

/**
 * A árvore de rotas do app vem do registro fixo; o teste monta a dele, com a rota do exemplo, que
 * só existe neste arquivo.
 */
const arvore = raiz.addChildren([...REGISTRO.map((modulo) => modulo.rotas), rotas]);

function abrir() {
  const roteador = createRouter({
    routeTree: arvore,
    history: createMemoryHistory({ initialEntries: ['/exemplo'] }),
    context: { modulos: comExemplo },
  }) as unknown as ReturnType<typeof criarRoteador>;
  render(<App roteador={roteador} sessao={sessaoAtiva()} />);
  return roteador;
}

const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });
const barra = () => screen.queryByRole('tablist', { name: 'Abas da janela' });
const nomesDasAbas = () =>
  within(screen.getByRole('tablist', { name: 'Abas da janela' }))
    .getAllByRole('tab')
    .map((aba) => aba.textContent);
const aba = (nome: string) => screen.getByRole('tab', { name: nome });
const clicar = (nome: string) => fireEvent.click(screen.getByRole('button', { name: nome }));
const digitar = (campo: string, valor: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: campo }), { target: { value: valor } });
const dock = () => screen.findByRole('navigation', { name: 'Dock' });

async function abrirONovoLocal() {
  await titulo('Novo ativo');
  clicar('Cadastrar novo local');
  return titulo('Novo local');
}

describe('a janela com as abas de cadastro', () => {
  it('trocar de tela na primeira aba volta a área que rola ao começo', async () => {
    const roteador = abrir();
    await titulo('Novo ativo');
    const area = document.querySelector('main > [data-rolagem-da-janela]') as HTMLElement;
    area.scrollTop = 120;
    expect(area.scrollTop).toBe(120);

    await roteador.navigate({ to: '/ajustes' });
    await titulo('Aparência');
    await waitFor(() => expect(area.scrollTop).toBe(0));
  });

  it('o link do campo abre o cadastro numa aba, na frente, e a tela continua atrás, com o que foi digitado', async () => {
    abrir();
    await titulo('Novo ativo');
    expect(barra()).toBeNull();
    digitar('Nome do ativo', 'IMP-01');

    clicar('Cadastrar novo local');
    const novoLocal = await titulo('Novo local');
    await waitFor(() => expect(document.activeElement).toBe(novoLocal));
    expect(nomesDasAbas()).toEqual(['Novo ativo', 'Novo local']);
    expect(aba('Novo local').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('textbox', { name: 'Nome do ativo' })).toBeNull();

    fireEvent.click(aba('Novo ativo'));
    const nome = await screen.findByRole('textbox', { name: 'Nome do ativo' });
    expect((nome as HTMLInputElement).value).toBe('IMP-01');
  });

  it('salvar fecha a aba e volta à tela com o registro no campo e o foco nele', async () => {
    abrir();
    await abrirONovoLocal();
    digitar('Nome do local', 'Sala 12');
    clicar('Salvar');

    const campo = await screen.findByRole('button', { name: 'Local: Sala 12' });
    expect(barra()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(campo));
  });

  it('cancelar sem nada preenchido fecha a aba na hora, e o campo não muda', async () => {
    abrir();
    await abrirONovoLocal();
    clicar('Cancelar');

    await waitFor(() => expect(barra()).toBeNull());
    const campo = screen.getByRole('button', { name: 'Local: nenhum' });
    await waitFor(() => expect(document.activeElement).toBe(campo));
  });

  it('fechar uma aba preenchida pergunta antes e só fecha com a confirmação', async () => {
    abrir();
    await abrirONovoLocal();
    digitar('Nome do local', 'Sala');

    clicar('Fechar Novo local');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Fechar sem salvar?' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(nomesDasAbas()).toEqual(['Novo ativo', 'Novo local']);
    expect((screen.getByRole('textbox', { name: 'Nome do local' }) as HTMLInputElement).value).toBe(
      'Sala',
    );

    clicar('Cancelar');
    const deNovo = await screen.findByRole('alertdialog', { name: 'Fechar sem salvar?' });
    fireEvent.click(within(deNovo).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(barra()).toBeNull());
    expect(screen.getByRole('button', { name: 'Local: nenhum' })).toBeTruthy();
  });

  it('o mesmo campo não abre duas abas: o link traz para a frente a que já está aberta', async () => {
    abrir();
    await abrirONovoLocal();
    fireEvent.click(aba('Novo ativo'));
    await screen.findByRole('textbox', { name: 'Nome do ativo' });

    clicar('Cadastrar novo local');
    await titulo('Novo local');
    expect(nomesDasAbas()).toEqual(['Novo ativo', 'Novo local']);
    expect(aba('Novo local').getAttribute('aria-selected')).toBe('true');
  });

  it('uma aba de cadastro abre outra, e cada uma volta à aba que a pediu', async () => {
    abrir();
    await titulo('Novo ativo');
    clicar('Cadastrar novo modelo');
    await titulo('Novo modelo');
    digitar('Nome do modelo', 'M404');
    clicar('Cadastrar novo tipo');
    await titulo('Novo tipo');
    expect(nomesDasAbas()).toEqual(['Novo ativo', 'Novo modelo', 'Novo tipo']);

    digitar('Nome do tipo', 'Impressora');
    clicar('Salvar');
    const tipo = await screen.findByRole('button', { name: 'Tipo: Impressora' });
    await waitFor(() => expect(document.activeElement).toBe(tipo));
    expect(nomesDasAbas()).toEqual(['Novo ativo', 'Novo modelo']);
    expect(
      (screen.getByRole('textbox', { name: 'Nome do modelo' }) as HTMLInputElement).value,
    ).toBe('M404');

    clicar('Salvar');
    await screen.findByRole('button', { name: 'Modelo: M404' });
    expect(barra()).toBeNull();
  });

  it('escolher um módulo no dock leva à primeira aba, que navega, e a de cadastro continua aberta', async () => {
    abrir();
    await abrirONovoLocal();
    fireEvent.click(within(await dock()).getByRole('button', { name: 'Ajustes' }));

    const aparencia = await titulo('Aparência');
    await waitFor(() => expect(document.activeElement).toBe(aparencia));
    await waitFor(() => expect(nomesDasAbas()).toEqual(['Aparência', 'Novo local']));
    expect(aba('Aparência').getAttribute('aria-selected')).toBe('true');
  });

  it('uma navegação de fora das abas, como a de uma notificação, também traz a primeira aba', async () => {
    const roteador = abrir();
    await abrirONovoLocal();
    await roteador.navigate({ to: '/ajustes' });

    await titulo('Aparência');
    await waitFor(() => expect(aba('Aparência').getAttribute('aria-selected')).toBe('true'));
    expect(nomesDasAbas()).toEqual(['Aparência', 'Novo local']);
  });

  it('salvar depois de a tela que pediu sair fecha a aba sem preencher nada', async () => {
    abrir();
    await abrirONovoLocal();
    fireEvent.click(within(await dock()).getByRole('button', { name: 'Ajustes' }));
    await titulo('Aparência');

    fireEvent.click(aba('Novo local'));
    await titulo('Novo local');
    digitar('Nome do local', 'Sala 12');
    clicar('Salvar');

    await waitFor(() => expect(barra()).toBeNull());
    const aparencia = await titulo('Aparência');
    await waitFor(() => expect(document.activeElement).toBe(aparencia));
  });
});
