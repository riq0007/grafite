import { criarDataHora } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

// Sem fuso escolhido nos Ajustes, a tela usa o do sistema, como aqui.
const { formatarDataEHora, inicioDoDia, fimDoDia } = criarDataHora();

const ANA = { tipo: 'conta', id: 'c-ana', nome: 'Ana Souza', usuario: 'ana.souza' };

const registro = (id: string, extras: Record<string, unknown> = {}) => ({
  id,
  momento: '2026-10-07T17:32:00.000Z',
  acao: 'senha.trocada',
  rotulo: 'Senha trocada',
  ator: ANA,
  alvo: { tipo: 'conta', id: 'c-ana', nome: 'Ana Souza', usuario: 'ana.souza' },
  antes: null,
  depois: null,
  dados: null,
  ip: '10.0.0.12',
  codigoDeRastreio: 'R7K2-9QXM',
  ...extras,
});

const TROCA = registro('r1');
const PELO_COMANDO = registro('r2', {
  acao: 'organizacao.criada',
  rotulo: 'Organização criada',
  ator: { tipo: 'sistema', descricao: 'Comando no servidor' },
  alvo: { tipo: 'organizacao', id: null, nome: null, usuario: null },
  ip: null,
  codigoDeRastreio: null,
});
const RECUSA = registro('r3', {
  acao: 'entrada.recusada',
  rotulo: 'Entrada recusada',
  ator: { tipo: 'anonimo' },
  alvo: { tipo: 'conta', id: 'c-ana', nome: 'Ana Souza', usuario: 'ana.souza' },
  dados: { motivo: 'senha-errada', usuario: 'ana.souza' },
});
const EDICAO = registro('r4', {
  acao: 'pessoa.alterada',
  rotulo: 'Pessoa editada',
  alvo: { tipo: 'pessoa', id: 'joao', nome: 'João da Silva', usuario: null },
  antes: {
    nome: 'João da Silva',
    email: 'joao@antigo.com.br',
    matricula: '004512',
    localId: 'jundiai',
    local: 'Jundiaí',
  },
  depois: {
    nome: 'João da Silva',
    email: 'joao@empresa.com.br',
    matricula: '004512',
    localId: 'expedicao',
    local: 'Jundiaí › Expedição',
  },
});

/** O GET /auditoria que guarda os parâmetros de cada pedido. */
function servidorDaAuditoria(
  responder: (parametros: URLSearchParams) => Response = () =>
    Response.json({ itens: [TROCA, PELO_COMANDO, RECUSA], proximo: null, total: 3, maisDe: false }),
) {
  const pedidos: URLSearchParams[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/auditoria': (pedido) => {
      const parametros = new URL(pedido.url).searchParams;
      pedidos.push(parametros);
      return responder(parametros);
    },
    'GET /api/auditoria/contas': (pedido) => {
      const busca = new URL(pedido.url).searchParams.get('busca') ?? '';
      return Response.json({
        itens: 'ana souza'.includes(busca.toLowerCase())
          ? [{ id: 'c-ana', nome: 'Ana Souza', usuario: 'ana.souza', situacao: 'ativa' }]
          : [],
      });
    },
  };
  return { servidor, pedidos };
}

function abrir(servidor: ServidorDeTeste, endereco = '/administracao/auditoria') {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(naOrganizacao('auditoria.ver'), servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const tabela = () => screen.findByRole('grid', { name: 'Registros da auditoria' });
const linhas = async () =>
  within(await tabela())
    .getAllByRole('row')
    .slice(1);
const filtrosAtivos = async () =>
  within(await screen.findByRole('group', { name: 'Filtros ativos' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('tela da auditoria', () => {
  it('mostra o momento, quem fez, a ação, o alvo, o IP e o código de rastreio, e o total', async () => {
    abrir(servidorDaAuditoria().servidor);
    const colunas = within(await tabela())
      .getAllByRole('columnheader')
      .map((coluna) => coluna.textContent);
    expect(colunas).toEqual(['Momento', 'Quem fez', 'Ação', 'Alvo', 'IP', 'Código de rastreio']);
    const [troca, comando, recusa] = (await linhas()).map((linha) =>
      within(linha)
        .getAllByRole('gridcell')
        .concat(within(linha).getAllByRole('rowheader'))
        .map((celula) => celula.textContent),
    );
    expect(troca).toEqual(
      expect.arrayContaining([
        formatarDataEHora(new Date('2026-10-07T17:32:00.000Z')),
        'Ana Souza (ana.souza)',
        'Senha trocada',
        'Conta: Ana Souza (ana.souza)',
        '10.0.0.12',
        'R7K2-9QXM',
      ]),
    );
    expect(comando).toEqual(expect.arrayContaining(['Comando no servidor', 'Organização']));
    expect(recusa).toEqual(expect.arrayContaining(['Sem sessão', 'Entrada recusada']));
    expect(screen.getByText('3 registros')).toBeTruthy();
  });

  it('acima de 10.000 registros, diz "mais de 10.000 registros"', async () => {
    abrir(
      servidorDaAuditoria(() =>
        Response.json({ itens: [TROCA], proximo: 'c2', total: 10000, maisDe: true }),
      ).servidor,
    );
    expect(await screen.findByText('mais de 10.000 registros')).toBeTruthy();
  });

  it('o período personalizado e a ação vão à API no fuso escolhido e ficam à vista', async () => {
    const { servidor, pedidos } = servidorDaAuditoria();
    const roteador = abrir(
      servidor,
      '/administracao/auditoria?periodo=personalizado&de=2026-10-01&ate=2026-10-02&acao=entrada.recusada',
    );
    await tabela();
    expect(pedidos.at(-1)?.get('de')).toBe(inicioDoDia('2026-10-01').toISOString());
    expect(pedidos.at(-1)?.get('ate')).toBe(fimDoDia('2026-10-02').toISOString());
    expect(pedidos.at(-1)?.get('acao')).toBe('entrada.recusada');
    expect(await filtrosAtivos()).toEqual([
      'Período · 01/10/2026 a 02/10/2026',
      'Ação · Entrada recusada',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar o filtro Ação: Entrada recusada' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('acao')).toBeNull());
    expect(roteador.state.location.search).toEqual({
      periodo: 'personalizado',
      de: '2026-10-01',
      ate: '2026-10-02',
    });
  });

  it('"Quem fez" e a ação abrem pelo clique, com as opções à vista, sem digitar', async () => {
    const { servidor } = servidorDaAuditoria();
    abrir(servidor);
    await tabela();
    fireEvent.click(screen.getByRole('combobox', { name: 'Quem fez' }));
    expect(await screen.findByRole('option', { name: 'Ana Souza (ana.souza)' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Quem fez' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    fireEvent.click(screen.getByRole('combobox', { name: 'Ação' }));
    const acoes = (await screen.findAllByRole('option')).map((opcao) => opcao.textContent ?? '');
    expect(acoes.length).toBeGreaterThan(5);
    // Em ordem alfabética do português.
    expect(acoes).toEqual(
      [...acoes].sort(new Intl.Collator('pt-BR', { sensitivity: 'base' }).compare),
    );
  });

  it('"Últimos 7 dias", quem fez e o código de rastreio filtram, e "Limpar filtros" limpa tudo', async () => {
    const { servidor, pedidos } = servidorDaAuditoria();
    const roteador = abrir(servidor);
    await tabela();
    expect(pedidos.at(-1)?.get('de')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Período/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Últimos 7 dias' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('de')).not.toBeNull());
    const de = new Date(pedidos.at(-1)?.get('de') as string).getTime();
    expect(Math.abs(Date.now() - 7 * 24 * 60 * 60 * 1000 - de)).toBeLessThan(60_000);

    const quem = screen.getByRole('combobox', { name: 'Quem fez' });
    quem.focus();
    fireEvent.change(quem, { target: { value: 'ana' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Ana Souza (ana.souza)' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('ator')).toBe('c-ana'));

    fireEvent.change(screen.getByRole('textbox', { name: 'Código de rastreio' }), {
      target: { value: ' r7k2-9qxm ' },
    });
    await waitFor(() => expect(pedidos.at(-1)?.get('rastreio')).toBe('R7K2-9QXM'));
    expect(await filtrosAtivos()).toEqual([
      'Período · Últimos 7 dias',
      'Quem fez · Ana Souza (ana.souza)',
      'Código de rastreio · R7K2-9QXM',
    ]);

    fireEvent.click(
      within(await screen.findByRole('group', { name: 'Filtros ativos' })).getByRole('button', {
        name: 'Limpar filtros',
      }),
    );
    await waitFor(() => expect(roteador.state.location.search).toEqual({}));
    await waitFor(() => expect(pedidos.at(-1)?.get('ator')).toBeNull());
    expect(pedidos.at(-1)?.get('de')).toBeNull();
    expect(pedidos.at(-1)?.get('rastreio')).toBeNull();
  });

  it('o alvo vindo de uma ficha filtra a lista e fica à vista, com o nome do registro', async () => {
    const { servidor, pedidos } = servidorDaAuditoria();
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }));
    noComputador();
    render(
      <App
        roteador={roteador}
        sessao={sessaoAtiva(naOrganizacao('auditoria.ver'), servidor)}
        consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      />,
    );
    await roteador.navigate({
      to: '/administracao/auditoria',
      search: { alvo: ['pessoa:joao', 'conta:c-joao'], nomeDoAlvo: 'João da Silva' },
    });
    await tabela();
    expect(pedidos.at(-1)?.getAll('alvo')).toEqual(['pessoa:joao', 'conta:c-joao']);
    expect(await filtrosAtivos()).toEqual(['Registro · João da Silva']);
  });

  it('"Carregar mais" traz os registros seguintes', async () => {
    const { servidor } = servidorDaAuditoria((parametros) =>
      parametros.get('cursor') === 'c2'
        ? Response.json({ itens: [RECUSA], proximo: null, total: 3, maisDe: false })
        : Response.json({ itens: [TROCA, PELO_COMANDO], proximo: 'c2', total: 3, maisDe: false }),
    );
    abrir(servidor);
    expect(await linhas()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('o clique na linha abre o detalhe na prévia, com o antes → depois, e as setas trocam de registro', async () => {
    abrir(
      servidorDaAuditoria(() =>
        Response.json({ itens: [EDICAO, RECUSA], proximo: null, total: 2, maisDe: false }),
      ).servidor,
    );
    const [edicao] = await linhas();
    fireEvent.click(within(edicao as HTMLElement).getByText('Pessoa editada'));
    const previa = await screen.findByRole('dialog', { name: /Pessoa editada/ });
    const texto = previa.textContent ?? '';
    expect(texto).toContain('joao@antigo.com.br → joao@empresa.com.br');
    expect(texto).toContain('Jundiaí → Jundiaí › Expedição');
    expect(texto).toContain('Pessoa: João da Silva');
    expect(texto).toContain('R7K2-9QXM');
    // O que não mudou e os ids internos ficam de fora.
    expect(texto).not.toContain('004512');
    expect(texto).not.toContain('expedicao');
    expect(within(previa).queryByRole('button', { name: /Excluir|Apagar|Editar/ })).toBeNull();

    fireEvent.keyDown(previa, { key: 'ArrowRight' });
    const seguinte = await screen.findByRole('dialog', { name: /Entrada recusada/ });
    expect(seguinte.textContent).toContain('senha-errada');
  });

  it('sem registros no filtro, diz isso e oferece "Limpar filtros"', async () => {
    const roteador = abrir(
      servidorDaAuditoria(() =>
        Response.json({ itens: [], proximo: null, total: 0, maisDe: false }),
      ).servidor,
      '/administracao/auditoria?rastreio=NADA',
    );
    expect(await screen.findByText('Nenhum registro encontrado.')).toBeTruthy();
    const vazio = screen.getByText('Nenhum registro encontrado.').parentElement as HTMLElement;
    fireEvent.click(within(vazio).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({}));
  });
});
