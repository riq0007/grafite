// As ações da planta na tela (spec mapa-da-planta, "Ações da planta na tela"; change
// gestao-das-plantas, design, decisões 1 e 4): quem edita o mapa renomeia, liga a um local, inativa
// e reativa pela tela, e quem só vê não tem as ações.
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import { escolherLocal } from '../../teste/escolhas.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';
import type { PlantaDoMapa } from './consultas.ts';

afterEach(() => {
  cleanup();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const planta = (
  id: string,
  nome: string,
  situacao: PlantaDoMapa['situacao'] = 'ativa',
  extras: Partial<PlantaDoMapa> = {},
): PlantaDoMapa => ({
  id,
  nome,
  local: null,
  largura: 120,
  profundidade: 80,
  situacao,
  erro: situacao === 'falhou' ? 'O arquivo não tem linhas.' : null,
  fonte: 'planta.dxf',
  contagens: { segmentos: 3, rotulos: 2, camadas: 1, maquinas: 0 },
  criadaEm: '2026-10-28T12:00:00.000Z',
  ...extras,
});

const LOCAIS = [
  { id: 'jundiai', paiId: null, nome: 'Jundiaí', tipo: 'unidade', situacao: 'ativo' },
  { id: 'expedicao', paiId: 'jundiai', nome: 'Expedição', tipo: 'setor', situacao: 'ativo' },
].map((local) => ({ ...local, permite: { editar: true } }));

const CAMINHOS: Record<string, string> = { jundiai: 'Jundiaí', expedicao: 'Jundiaí › Expedição' };

const dadosInvalidos = (campos: Record<string, string>) =>
  Response.json(
    {
      type: 'urn:grafite:problema:dados-invalidos',
      title: 'Dados inválidos',
      status: 400,
      detail: 'Confira os campos.',
      codigoDeRastreio: 'R7K2-9QXM',
      campos,
    },
    { status: 400 },
  );

/** As plantas no servidor do teste: o GET devolve como elas estão, e as ações as mudam. */
function servidorDasPlantas(iniciais: PlantaDoMapa[], podeEditar = true) {
  const estado = { plantas: [...iniciais] };
  const pedidos: { rota: string; corpo: unknown }[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/mapa/plantas': () =>
      Response.json({
        plantas: estado.plantas.filter(({ situacao }) => podeEditar || situacao === 'ativa'),
        podeEditar,
      }),
    'GET /api/locais': () => Response.json({ locais: LOCAIS, permite: { cadastrarNaRaiz: false } }),
  };
  for (const { id } of iniciais) {
    servidor[`PATCH /api/mapa/plantas/${id}`] = async (pedido) => {
      const corpo = (await pedido.json()) as {
        nome?: string;
        local?: string | null;
        situacao?: 'ativa' | 'inativa';
      };
      pedidos.push({ rota: `PATCH ${id}`, corpo });
      if (corpo.nome !== undefined && corpo.nome.trim() === '') {
        return dadosInvalidos({ nome: 'Dê um nome à planta.' });
      }
      estado.plantas = estado.plantas.map((atual) =>
        atual.id !== id
          ? atual
          : {
              ...atual,
              ...(corpo.nome !== undefined ? { nome: corpo.nome.trim() } : {}),
              ...(corpo.situacao !== undefined ? { situacao: corpo.situacao } : {}),
              ...(corpo.local !== undefined
                ? {
                    local: corpo.local
                      ? { id: corpo.local, caminho: CAMINHOS[corpo.local] ?? corpo.local }
                      : null,
                  }
                : {}),
            },
      );
      return Response.json(estado.plantas.find((atual) => atual.id === id));
    };
  }
  return { servidor, estado, pedidos };
}

function abrir(servidor: ServidorDeTeste, podeEditar = true) {
  noComputador();
  render(
    <App
      roteador={criarRoteador(createMemoryHistory({ initialEntries: ['/mapa'] }))}
      sessao={sessaoAtiva(
        naOrganizacao(podeEditar ? 'mapa.editar' : 'mapa.ver', 'ativos.ver'),
        servidor,
      )}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
}

const lista = () => screen.findByRole('list', { name: 'Plantas' });
const cartao = async (nome: string) => {
  const itens = within(await lista()).getAllByRole('listitem');
  const achado = itens.find((item) => item.textContent?.includes(nome));
  if (!achado) throw new Error(`A planta ${nome} não está na lista.`);
  return achado;
};

async function abrirAcoes(nome: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Ações da planta ${nome}` }));
  return (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
}

const escolher = async (acao: string) =>
  fireEvent.click(await screen.findByRole('menuitem', { name: acao }));

const JUNDIAI = planta('p1', 'Jundiai');
const GALPAO = planta('p2', 'Galpão antigo', 'inativa');
const ANEXO = planta('p3', 'Anexo', 'falhou', { largura: null, profundidade: null });

describe('a tela das plantas', () => {
  it('Quem só vê o mapa: só as plantas ativas, sem "Nova planta" e sem "Ações"', async () => {
    const { servidor } = servidorDasPlantas([ANEXO, GALPAO, JUNDIAI], false);
    abrir(servidor, false);
    const itens = within(await lista()).getAllByRole('listitem');
    expect(itens).toHaveLength(1);
    expect(itens[0]?.textContent).toContain('Jundiai');
    expect(screen.queryByRole('button', { name: 'Nova planta' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ações da planta/ })).toBeNull();
  });

  it('quem edita vê todas, com a situação em texto: as ativas e, depois, as inativas e as que falharam', async () => {
    const { servidor } = servidorDasPlantas([ANEXO, GALPAO, JUNDIAI]);
    abrir(servidor);
    const itens = within(await lista()).getAllByRole('listitem');
    expect(itens.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Jundiai',
      'Galpão antigo',
      'Anexo',
    ]);
    expect(itens[0]?.textContent).toContain('Ativa');
    expect(itens[1]?.textContent).toContain('Inativa');
    expect(itens[2]?.textContent).toContain('Falhou');
  });

  it('Renomear pela tela: o nome atual no campo, o novo na lista e o retorno', async () => {
    const { servidor, pedidos } = servidorDasPlantas([JUNDIAI]);
    abrir(servidor);
    await abrirAcoes('Jundiai');
    await escolher('Renomear…');
    const gaveta = await screen.findByRole('dialog', { name: 'Renomear a planta' });
    const nome = within(gaveta).getByRole('textbox', { name: /^Nome/ }) as HTMLInputElement;
    expect(nome.value).toBe('Jundiai');

    // O nome vazio é recusado, com a mensagem no campo.
    fireEvent.change(nome, { target: { value: '  ' } });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Salvar' }));
    expect(await within(gaveta).findByText('Dê um nome à planta.')).toBeTruthy();

    fireEvent.change(nome, { target: { value: 'Jundiaí · Térreo' } });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Planta renomeada.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Renomear a planta' })).toBeNull(),
    );
    expect((await cartao('Jundiaí · Térreo')).textContent).toContain('Jundiaí · Térreo');
    expect(pedidos.at(-1)).toEqual({ rota: 'PATCH p1', corpo: { nome: 'Jundiaí · Térreo' } });
  });

  it('Inativar pela tela, e reativar: valem na hora, com o retorno', async () => {
    const { servidor, pedidos } = servidorDasPlantas([JUNDIAI]);
    abrir(servidor);
    expect(await abrirAcoes('Jundiai')).toContain('Inativar');
    await escolher('Inativar');
    expect(await screen.findByText('Planta inativada.')).toBeTruthy();
    await waitFor(async () => expect((await cartao('Jundiai')).textContent).toContain('Inativa'));
    expect(pedidos.at(-1)).toEqual({ rota: 'PATCH p1', corpo: { situacao: 'inativa' } });

    const acoes = await abrirAcoes('Jundiai');
    expect(acoes).toContain('Reativar');
    expect(acoes).not.toContain('Inativar');
    await escolher('Reativar');
    expect(await screen.findByText('Planta reativada.')).toBeTruthy();
    expect(pedidos.at(-1)).toEqual({ rota: 'PATCH p1', corpo: { situacao: 'ativa' } });
  });

  it('Planta que falhou: o menu não oferece "Inativar" nem o local', async () => {
    const { servidor } = servidorDasPlantas([ANEXO]);
    abrir(servidor);
    const acoes = await abrirAcoes('Anexo');
    expect(acoes).toContain('Renomear…');
    expect(acoes).not.toContain('Inativar');
    expect(acoes).not.toContain('Reativar');
    expect(acoes).not.toContain('Ligar a um local…');
  });

  it('Ligar a um local: a escolha na árvore, e deixar sem local', async () => {
    const { servidor, pedidos } = servidorDasPlantas([JUNDIAI]);
    abrir(servidor);
    await abrirAcoes('Jundiai');
    await escolher('Ligar a um local…');
    let gaveta = await screen.findByRole('dialog', { name: 'Local da planta' });
    await escolherLocal('Local', 'Jundiaí › Expedição', gaveta);
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Local da planta alterado.')).toBeTruthy();
    expect(pedidos.at(-1)).toEqual({ rota: 'PATCH p1', corpo: { local: 'expedicao' } });
    await waitFor(async () =>
      expect((await cartao('Jundiai')).textContent).toContain('Jundiaí › Expedição'),
    );

    await abrirAcoes('Jundiai');
    await escolher('Ligar a um local…');
    gaveta = await screen.findByRole('dialog', { name: 'Local da planta' });
    fireEvent.click(await within(gaveta).findByRole('button', { name: 'Deixar sem local' }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(pedidos.at(-1)).toEqual({ rota: 'PATCH p1', corpo: { local: null } }),
    );
  });
});
