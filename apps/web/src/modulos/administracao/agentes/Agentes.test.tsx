// A seção Agentes da Administração (spec inventario-pelo-agente; change inventario-pelo-agente-glpi):
// o endereço gerado uma vez só, o "Gerar outro" com a confirmação, a máquina sem ativo ligada pela
// busca e o desligar.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Agente = components['schemas']['AgenteDoGlpi'];

const ATIVO = '0199d3a0-0000-7000-8000-00000000c001';
const TIPO = '0199d3a0-0000-7000-8000-00000000b001';
const LOCAL = '0199d3a0-0000-7000-8000-00000000d001';
const ENDERECO =
  'https://grafite.empresa.com/api/agentes/glpi/abcdefghijklmnopqrstuvwxyz0123456789ABCD';

const agente = (mudancas: Partial<Agente> = {}): Agente => ({
  id: '0199d3a0-0000-7000-8000-00000000a001',
  deviceid: 'ALMOX-07-2024-01-01-00-00-00',
  nome: 'ALMOX-07',
  versao: '1.7.3',
  serie: 'XYZ999',
  sistema: 'Microsoft Windows 11 Pro',
  ip: '10.0.7.7',
  ativo: null,
  ligadoAMao: false,
  ultimoContato: '2026-10-28T10:00:00.000Z',
  ultimoInventario: null,
  situacao: { tipo: 'neutra', texto: 'Sem inventário' },
  ...mudancas,
});

function abrir(servidor: ServidorDeTeste) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/administracao/agentes'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(naOrganizacao('coletores.administrar'), {
        'GET /api/agentes/cadastro': () =>
          Response.json({ tipoId: null, localId: null, tipos: [], locais: [] }),
        'GET /api/locais': () => Response.json({ locais: [], permite: { cadastrarNaRaiz: false } }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

describe('o endereço dos agentes', () => {
  it('Endereço gerado: aparece uma vez só, no diálogo, com a instrução do server', async () => {
    let gerado = false;
    abrir({
      'GET /api/agentes': () =>
        Response.json({
          endereco: gerado
            ? { geradoEm: '2026-10-28T10:00:00.000Z', geradoPor: 'Ana Souza' }
            : null,
          agentes: [],
        }),
      'POST /api/agentes/endereco': () => {
        gerado = true;
        return Response.json({ endereco: ENDERECO }, { status: 201 });
      },
    });
    expect(await screen.findByText('Nenhum agente falou com o Grafite ainda.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar o endereço' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Endereço dos agentes' });
    expect(within(dialogo).getByText(ENDERECO)).toBeTruthy();
    expect(within(dialogo).getByText(/Este endereço aparece só agora/)).toBeTruthy();
    expect(within(dialogo).getByText(/Reinicie o serviço/)).toBeTruthy();
    expect(within(dialogo).getByText('ca-cert-file')).toBeTruthy();
    expect(within(dialogo).getByText('certificate verify failed')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Fechar' }));
    expect(await screen.findByText(/por Ana Souza\./)).toBeTruthy();
    expect(screen.queryByText(ENDERECO)).toBeNull();
  });

  it('gerar outro pede a confirmação', async () => {
    let pedidos = 0;
    abrir({
      'GET /api/agentes': () =>
        Response.json({
          endereco: { geradoEm: '2026-10-28T10:00:00.000Z', geradoPor: 'Ana Souza' },
          agentes: [],
        }),
      'POST /api/agentes/endereco': () => {
        pedidos += 1;
        return Response.json({ endereco: ENDERECO }, { status: 201 });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar outro endereço' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(within(confirmacao).getByText(/param de mandar o inventário/)).toBeTruthy();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Gerar outro' }));
    expect(await screen.findByRole('dialog', { name: 'Endereço dos agentes' })).toBeTruthy();
    expect(pedidos).toBe(1);
  });
});

describe('os agentes', () => {
  it('Máquina sem ativo: liga pela busca dos ativos', async () => {
    const corpos: unknown[] = [];
    const buscas: string[] = [];
    abrir({
      'GET /api/agentes': () => Response.json({ endereco: null, agentes: [agente()] }),
      'GET /api/ativos': (pedido) => {
        buscas.push(new URL(pedido.url).searchParams.get('busca') ?? '');
        return Response.json({
          itens: [{ id: ATIVO, rotulo: 'Estação do almoxarifado', patrimonio: 'PAT-00700' }],
          proximo: null,
          total: 1,
          referencias: {},
          permite: {},
        });
      },
      [`PUT /api/agentes/${agente().id}/ativo`]: async (pedido) => {
        corpos.push(await pedido.json());
        return new Response(null, { status: 204 });
      },
    });
    const tabela = await screen.findByRole('grid', { name: 'Agentes' });
    expect(within(tabela).getByText('Sem ativo')).toBeTruthy();
    expect(within(tabela).getByText('Sem inventário')).toBeTruthy();
    expect(within(tabela).getByText('10.0.7.7')).toBeTruthy();
    expect(within(tabela).getByRole('columnheader', { name: 'Último contato' })).toBeTruthy();
    fireEvent.click(within(tabela).getByRole('button', { name: 'Ligar ALMOX-07 a um ativo' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Ligar ALMOX-07 a um ativo' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Buscar ativos' }));
    await waitFor(() => expect(buscas).toEqual(['ALMOX-07']));
    fireEvent.click(await within(dialogo).findByRole('button', { name: /Ativo$/ }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'Estação do almoxarifado (PAT-00700)' }),
    );
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Ligar' }));
    await waitFor(() =>
      expect(avisos()).toContain(
        'ALMOX-07 ligado. O inventário entra no ativo no próximo envio do agente.',
      ),
    );
    expect(buscas).toEqual(['ALMOX-07']);
    expect(corpos).toEqual([{ ativoId: ATIVO }]);
  });

  it('o agente ligado leva à ficha e se desliga', async () => {
    const corpos: unknown[] = [];
    abrir({
      'GET /api/agentes': () =>
        Response.json({
          endereco: null,
          agentes: [
            agente({
              ativo: { id: ATIVO, rotulo: 'Estação do almoxarifado', patrimonio: 'PAT-00700' },
              ultimoInventario: '2026-10-28T09:00:00.000Z',
              situacao: { tipo: 'sucesso', texto: 'Em dia' },
            }),
          ],
        }),
      [`PUT /api/agentes/${agente().id}/ativo`]: async (pedido) => {
        corpos.push(await pedido.json());
        return new Response(null, { status: 204 });
      },
    });
    const tabela = await screen.findByRole('grid', { name: 'Agentes' });
    expect(
      within(tabela).getByRole('link', { name: 'Estação do almoxarifado (PAT-00700)' }),
    ).toBeTruthy();
    expect(within(tabela).getByText('Em dia')).toBeTruthy();
    fireEvent.click(within(tabela).getByRole('button', { name: 'Desligar ALMOX-07 do ativo' }));
    await waitFor(() => expect(avisos()).toContain('ALMOX-07 desligado do ativo.'));
    expect(corpos).toEqual([{ ativoId: null }]);
  });
});

describe('o cadastro automático dos computadores', () => {
  it('escolhe tipo e local, salva e pode desligar sem trocar o endereço dos agentes', async () => {
    let configuracao: { tipoId: string | null; localId: string | null } = {
      tipoId: null,
      localId: null,
    };
    const corpos: unknown[] = [];
    abrir({
      'GET /api/agentes': () => Response.json({ endereco: null, agentes: [] }),
      'GET /api/agentes/cadastro': () =>
        Response.json({
          ...configuracao,
          tipos: [{ id: TIPO, nome: 'Computador' }],
          locais: [{ id: LOCAL, nome: 'Entrada' }],
        }),
      'GET /api/locais': () =>
        Response.json({
          locais: [{ id: LOCAL, paiId: null, nome: 'Entrada', tipo: 'sala', situacao: 'ativo' }],
        }),
      'PUT /api/agentes/cadastro': async (pedido) => {
        configuracao = await pedido.json();
        corpos.push(configuracao);
        return new Response(null, { status: 204 });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Tipo para novos computadores/ }));
    fireEvent.click(await screen.findByRole('option', { name: /^Computador$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Local de entrada/ }));
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Filtrar' }), {
      target: { value: 'Entrada' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /^Entrada$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro automático' }));
    await waitFor(() => expect(corpos).toEqual([{ tipoId: TIPO, localId: LOCAL }]));
    await waitFor(() => expect(avisos()).toContain('Configuração do cadastro salva.'));
    fireEvent.click(screen.getByRole('button', { name: /Tipo para novos computadores/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Não cadastrar automaticamente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro automático' }));
    await waitFor(() =>
      expect(corpos).toEqual([
        { tipoId: TIPO, localId: LOCAL },
        { tipoId: null, localId: null },
      ]),
    );
  });

  it('mostra a recusa no campo e mantém a escolha para corrigir', async () => {
    abrir({
      'GET /api/agentes': () => Response.json({ endereco: null, agentes: [] }),
      'GET /api/agentes/cadastro': () =>
        Response.json({
          tipoId: null,
          localId: null,
          tipos: [{ id: TIPO, nome: 'Computador' }],
          locais: [],
        }),
      'PUT /api/agentes/cadastro': () =>
        Response.json(
          {
            type: 'urn:grafite:problema:dados-invalidos',
            title: 'Dados inválidos',
            status: 400,
            detail: 'Confira os campos indicados.',
            codigoDeRastreio: 'ABCD-1234',
            campos: { tipoId: 'O tipo foi inativado. Escolha outro.' },
          },
          { status: 400 },
        ),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Tipo para novos computadores/ }));
    fireEvent.click(await screen.findByRole('option', { name: /^Computador$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro automático' }));
    expect(await screen.findByText('O tipo foi inativado. Escolha outro.')).toBeTruthy();
    expect(avisos()).not.toContain('Configuração do cadastro salva.');
  });
});
