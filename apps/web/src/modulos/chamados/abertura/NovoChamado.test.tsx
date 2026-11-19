// A gaveta da abertura (spec modulo-chamados, "Abrir um chamado"; spec chamados, "Abrir um chamado
// pela TI"; change chamados-da-ti, design, "A gaveta da abertura (tarefa 5.18)"): o "Novo chamado"
// dos cabeçalhos, só a quem atende, a gaveta sobre a tela em que se está, a pessoa, a grade dos
// tipos, o formulário do tipo, o título montado que se troca, o "Fica comigo", o retorno e as
// recusas, no campo, no alto do formulário e antes dos botões.
import { RECUSA_DO_FORMULARIO, TIPOS_DE_CHAMADO_DE_FABRICA } from '@grafite/domain';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import {
  AGORA_DOS_MOCKUPS,
  ANA,
  FUSO_DOS_MOCKUPS,
  saudacaoDoInicio,
  servidorDoQuadro,
} from '../../../teste/chamados.ts';
import { nomeDaOpcao } from '../../../teste/escolhas.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Os tipos de fábrica como o `GET /chamados/abertura` os devolve, na ordem. */
const TIPOS = TIPOS_DE_CHAMADO_DE_FABRICA.map((tipo, posicao) => ({
  id: `0199a6e0-0000-7000-8000-0000000001${String(posicao + 1).padStart(2, '0')}`,
  nome: tipo.nome,
  icone: tipo.icone,
  frase: tipo.frase,
  formulario: tipo.formulario,
}));

function tipo(nome: string) {
  const achado = TIPOS.find((deFabrica) => deFabrica.nome === nome);
  if (!achado) throw new Error(`Sem o tipo ${nome}.`);
  return achado;
}

const MARINA = {
  id: '0199a6e0-0000-7000-8000-0000000000d1',
  nome: 'Marina Rocha',
  local: 'Jundiaí › Recepção',
};

const ATENDE = naOrganizacao('chamados.atender');
const SO_VE = naOrganizacao('chamados.ver');

const ABERTO = Response.json(
  { numero: 1043, situacao: 'em-atendimento', responsavel: { id: ANA.conta, nome: ANA.nome } },
  { status: 201 },
);

/** O problema da API, com as recusas por campo, quando há. */
const problema = (status: number, detalhe: string, campos?: Record<string, string>) =>
  Response.json(
    {
      type: `urn:grafite:problema:${status === 409 ? 'conflito' : 'dados-invalidos'}`,
      title: status === 409 ? 'Conflito' : 'Dados inválidos',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      ...(campos && { campos }),
    },
    { status },
  );

/** As telas dos chamados, os tipos da gaveta, a busca da pessoa e a abertura, que guarda os pedidos. */
function servidorDaGaveta({
  abrir = () => ABERTO.clone(),
  tipos = () => Response.json({ tipos: TIPOS }),
}: {
  abrir?: (corpo: unknown) => Response;
  tipos?: () => Response;
} = {}) {
  const corpos: unknown[] = [];
  const { servidor: dasTelas } = servidorDoQuadro();
  const servidor: ServidorDeTeste = {
    ...dasTelas,
    'GET /api/chamados/abertura': () => tipos(),
    'GET /api/chamados/pessoas': () => Response.json({ itens: [MARINA], total: 1 }),
    'GET /api/chamados/sugestoes': () => Response.json({ local: null, ativos: [] }),
    'POST /api/chamados': async (pedido) => {
      const corpo = await pedido.json();
      corpos.push(corpo);
      return abrir(corpo);
    },
  };
  return { servidor, corpos };
}

function abrirEm(endereco: string, servidor: ServidorDeTeste, permissoes = ATENDE) {
  noComputador();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA_DOS_MOCKUPS);
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor, { regiao: { fuso: FUSO_DOS_MOCKUPS } })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const gaveta = () => screen.findByRole('dialog', { name: 'Novo chamado' });
/** O título da tela, pelo texto: com a gaveta aberta, a tela fica fora da árvore acessível. */
const tituloDaTela = () => document.querySelector('h1')?.textContent;
const semGaveta = () => expect(screen.queryByRole('dialog', { name: 'Novo chamado' })).toBeNull();
const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const texto = (dentro: HTMLElement, rotulo: string) =>
  within(dentro).getByRole('textbox', { name: rotulo }) as HTMLInputElement;

async function escolherAPessoa(dentro: HTMLElement) {
  const campo = within(dentro).getByRole('combobox', { name: 'Quem pediu' });
  campo.focus();
  fireEvent.change(campo, { target: { value: 'marina' } });
  const opcao = await waitFor(() => {
    const achada = screen
      .getAllByRole('option')
      .find((uma) => nomeDaOpcao(uma) === 'Marina Rocha · Jundiaí › Recepção');
    if (!achada) throw new Error('Sem a Marina na lista.');
    return achada;
  });
  fireEvent.click(opcao);
}

const escolherOTipo = async (dentro: HTMLElement, nome: string) =>
  fireEvent.click(await within(dentro).findByRole('radio', { name: nome }));

/** O texto dos elementos que o atributo cita pelo id, como o leitor de tela o junta. */
const textoCitado = (elemento: HTMLElement, atributo: string) =>
  (elemento.getAttribute(atributo) ?? '')
    .split(/\s+/)
    .map((id) => (id ? (document.getElementById(id)?.textContent ?? '') : ''))
    .filter(Boolean)
    .join(' ');

/** Os nomes dos tipos na grade, na ordem. */
const tiposNaGrade = (grade: HTMLElement) =>
  within(grade)
    .getAllByRole('radio')
    .map((radio) => textoCitado(radio, 'aria-labelledby'));

const escrever = (dentro: HTMLElement, rotulo: string, valor: string) =>
  fireEvent.change(texto(dentro, rotulo), { target: { value: valor } });

describe('o "Novo chamado"', () => {
  it('fica nos cabeçalhos do Início, de "Quem está com o quê" e dos Prazos, a quem atende', async () => {
    for (const endereco of ['/chamados', '/chamados/quem-esta-com-o-que', '/chamados/prazos']) {
      abrirEm(endereco, servidorDaGaveta().servidor);
      expect(await screen.findByRole('button', { name: 'Novo chamado' }), endereco).toBeTruthy();
      cleanup();
    }
  });

  it('Quem só vê não abre: sem o botão, e o endereço com a gaveta aberta não a abre', async () => {
    abrirEm('/chamados/prazos?abrir=1', servidorDaGaveta().servidor, SO_VE);
    expect(await screen.findByRole('heading', { level: 1, name: 'Prazos' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Novo chamado' })).toBeNull();
    semGaveta();
  });

  it('abre a gaveta sobre a tela em que se está, e fechar tira a gaveta do endereço', async () => {
    const roteador = abrirEm('/chamados/prazos', servidorDaGaveta().servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Novo chamado' }));
    const aberta = await gaveta();
    expect(roteador.state.location.pathname).toBe('/chamados/prazos');
    expect(roteador.state.location.search).toMatchObject({ abrir: 1 });
    // A tela continua atrás da gaveta, escondida do leitor de tela enquanto ela está aberta.
    expect(tituloDaTela()).toMatch(/^Prazos/);

    fireEvent.click(within(aberta).getByRole('button', { name: 'Cancelar' }));
    await waitFor(semGaveta);
    expect(roteador.state.location.pathname).toBe('/chamados/prazos');
    expect(roteador.state.location.search).not.toHaveProperty('abrir');
  });

  it('a ação "Abrir um chamado" da busca abre a gaveta sobre o Início', async () => {
    abrirEm('/chamados?abrir=1', servidorDaGaveta().servidor);
    await gaveta();
    expect(tituloDaTela()).toMatch(saudacaoDoInicio('Ana'));
  });
});

describe('a gaveta da abertura', () => {
  it('Abertura pela gaveta: a pessoa, o tipo, a resposta e "Chamado #1043 aberto.", com "Abrir"', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    const roteador = abrirEm('/chamados?abrir=1', servidor);
    const aberta = await gaveta();
    await escolherAPessoa(aberta);

    // A grade dos tipos, na ordem, cada um com a frase.
    const grade = within(aberta).getByRole('radiogroup', { name: 'Tipo' });
    await waitFor(() => expect(tiposNaGrade(grade)).toEqual(TIPOS.map(({ nome }) => nome)));
    expect(
      textoCitado(within(grade).getByRole('radio', { name: 'Impressora' }), 'aria-describedby'),
    ).toBe('Mancha, atola ou não imprime');
    // Sem o tipo, nem o formulário nem o título.
    expect(within(aberta).queryByRole('textbox', { name: 'Título' })).toBeNull();

    await escolherOTipo(aberta, 'Outro');
    escrever(aberta, 'Conte o que aconteceu', 'Monitor piscando');
    // O título montado acompanha as respostas.
    expect(texto(aberta, 'Título').value).toBe('Monitor piscando');
    expect(within(aberta).getByRole('switch', { name: 'Fica comigo' })).toHaveProperty(
      'checked',
      true,
    );

    fireEvent.click(within(aberta).getByRole('button', { name: 'Abrir o chamado' }));
    await waitFor(semGaveta);
    expect(corpos).toEqual([
      {
        pessoa: MARINA.id,
        tipo: tipo('Outro').id,
        titulo: null,
        respostas: { relato: 'Monitor piscando' },
        ficaComigo: true,
      },
    ]);
    expect(avisos()).toEqual(['Chamado #1043 aberto.']);
    expect(roteador.state.location.search).not.toHaveProperty('abrir');

    const [aviso] = filaDeAvisos.naTela;
    act(() => aviso?.aviso.aoAbrir?.());
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/chamados/1043'));
  });

  it('o título trocado vai como foi escrito, e "Usar o título montado" volta ao montado', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    abrirEm('/chamados?abrir=1', servidor);
    const aberta = await gaveta();
    await escolherAPessoa(aberta);
    await escolherOTipo(aberta, 'Outro');
    escrever(aberta, 'Conte o que aconteceu', 'Computador não liga');
    expect(texto(aberta, 'Título').value).toBe('Computador não liga');
    expect(within(aberta).queryByRole('button', { name: 'Usar o título montado' })).toBeNull();

    escrever(aberta, 'Título', 'Notebook da recepção não liga');
    // A resposta que muda não leva o título escrito.
    escrever(aberta, 'Conte o que aconteceu', 'Notebook não liga desde cedo');
    expect(texto(aberta, 'Título').value).toBe('Notebook da recepção não liga');
    fireEvent.click(within(aberta).getByRole('button', { name: 'Usar o título montado' }));
    expect(texto(aberta, 'Título').value).toBe('Notebook não liga desde cedo');

    escrever(aberta, 'Título', 'Notebook da recepção não liga');
    fireEvent.click(within(aberta).getByRole('button', { name: 'Abrir o chamado' }));
    await waitFor(() => expect(corpos).toHaveLength(1));
    expect(corpos[0]).toMatchObject({ titulo: 'Notebook da recepção não liga' });
  });

  it('a troca do tipo recomeça as respostas e fica com a pessoa, o título escrito e o "Fica comigo"', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    abrirEm('/chamados?abrir=1', servidor);
    const aberta = await gaveta();
    await escolherAPessoa(aberta);
    await escolherOTipo(aberta, 'Outro');
    escrever(aberta, 'Conte o que aconteceu', 'Monitor piscando');
    escrever(aberta, 'Título', 'Monitor da recepção piscando');
    fireEvent.click(within(aberta).getByRole('switch', { name: 'Fica comigo' }));

    await escolherOTipo(aberta, 'Troca de equipamento');
    expect(within(aberta).queryByRole('textbox', { name: 'Conte o que aconteceu' })).toBeNull();
    await escolherOTipo(aberta, 'Outro');
    expect(texto(aberta, 'Conte o que aconteceu').value).toBe('');
    expect(texto(aberta, 'Título').value).toBe('Monitor da recepção piscando');
    expect(within(aberta).getByRole('switch', { name: 'Fica comigo' })).toHaveProperty(
      'checked',
      false,
    );

    escrever(aberta, 'Conte o que aconteceu', 'Monitor apagou');
    fireEvent.click(within(aberta).getByRole('button', { name: 'Abrir o chamado' }));
    await waitFor(() => expect(corpos).toHaveLength(1));
    expect(corpos[0]).toEqual({
      pessoa: MARINA.id,
      tipo: tipo('Outro').id,
      titulo: 'Monitor da recepção piscando',
      respostas: { relato: 'Monitor apagou' },
      ficaComigo: false,
    });
  });

  it('as recusas: a pessoa no campo, as respostas no alto do formulário e os locais antes dos botões', async () => {
    const respostas = [
      problema(400, 'Escolha quem pediu.', {
        pessoa: 'Escolha quem pediu.',
        respostas: RECUSA_DO_FORMULARIO,
      }),
      problema(409, 'Você não atende os chamados de Jundiaí.'),
    ];
    const { servidor, corpos } = servidorDaGaveta({
      abrir: () => respostas.shift() ?? ABERTO.clone(),
    });
    abrirEm('/chamados?abrir=1', servidor);
    const aberta = await gaveta();
    await escolherOTipo(aberta, 'Outro');
    escrever(aberta, 'Conte o que aconteceu', 'Monitor piscando');

    fireEvent.click(within(aberta).getByRole('button', { name: 'Abrir o chamado' }));
    const pessoa = within(aberta).getByRole('combobox', { name: 'Quem pediu' });
    await waitFor(() => expect(pessoa.getAttribute('aria-invalid')).toBe('true'));
    expect(within(aberta).getByText('Escolha quem pediu.')).toBeTruthy();
    expect(within(aberta).getByText(RECUSA_DO_FORMULARIO)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(pessoa));

    await escolherAPessoa(aberta);
    expect(within(aberta).queryByText('Escolha quem pediu.')).toBeNull();
    fireEvent.click(within(aberta).getByRole('button', { name: 'Abrir o chamado' }));
    expect(await within(aberta).findByText('Você não atende os chamados de Jundiaí.')).toBeTruthy();
    // O que foi preenchido fica, e a gaveta continua aberta.
    expect(texto(aberta, 'Conte o que aconteceu').value).toBe('Monitor piscando');
    expect(corpos).toHaveLength(2);
    expect(avisos()).toEqual([]);
  });

  it('os tipos que não carregam dizem a falha, com "Tentar de novo"', async () => {
    let falhar = true;
    const { servidor } = servidorDaGaveta({
      tipos: () =>
        falhar
          ? problema(500, 'Erro interno.')
          : Response.json({ tipos: [tipo('Outro'), tipo('Telefone')] }),
    });
    abrirEm('/chamados?abrir=1', servidor);
    const aberta = await gaveta();
    expect(
      await within(aberta).findByText(/^Não foi possível carregar os tipos de chamado\./),
    ).toBeTruthy();
    falhar = false;
    fireEvent.click(within(aberta).getByRole('button', { name: 'Tentar de novo' }));
    const grade = await within(aberta).findByRole('radiogroup', { name: 'Tipo' });
    await waitFor(() => expect(tiposNaGrade(grade)).toEqual(['Outro', 'Telefone']));
  });
});
