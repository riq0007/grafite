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
  posicoes: 0,
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
    servidor[`DELETE /api/mapa/plantas/${id}`] = () => {
      pedidos.push({ rota: `DELETE ${id}`, corpo: null });
      estado.plantas = estado.plantas.filter((atual) => atual.id !== id);
      return new Response(null, { status: 204 });
    };
  }
  return { servidor, estado, pedidos };
}

function abrir(
  servidor: ServidorDeTeste,
  podeEditar = true,
  {
    endereco = '/mapa',
    canal = criarCanalDeEventos(),
    consultas = criarClienteDeConsultas({ esperaEntreTentativas: 0 }),
  } = {},
) {
  noComputador();
  render(
    <App
      roteador={criarRoteador(createMemoryHistory({ initialEntries: [endereco] }))}
      sessao={sessaoAtiva(
        naOrganizacao(podeEditar ? 'mapa.editar' : 'mapa.ver', 'ativos.ver'),
        servidor,
      )}
      consultas={consultas}
      canal={canal}
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

// A exclusão (spec mapa-da-planta, "Exclusão da planta"; design, decisões 1, 2 e 5).
describe('a exclusão da planta pela tela', () => {
  const TESTE = planta('p9', 'Teste', 'ativa', { posicoes: 12 });

  async function abrirAExclusao(nome: string) {
    await abrirAcoes(nome);
    await escolher('Excluir…');
    return screen.findByRole('alertdialog', { name: `Excluir a planta ${nome}?` });
  }
  const botaoQueExclui = (dialogo: HTMLElement) =>
    within(dialogo).getByRole('button', { name: 'Excluir a planta' }) as HTMLButtonElement;

  it('Planta enviada por engano: a confirmação diz o que sai, pede o nome, e a planta sai da tela', async () => {
    const { servidor, pedidos } = servidorDasPlantas([TESTE]);
    abrir(servidor);
    const dialogo = await abrirAExclusao('Teste');
    expect(dialogo.textContent).toContain('12 posições');
    expect(dialogo.textContent).toContain('não se desfaz');
    expect(botaoQueExclui(dialogo).disabled).toBe(true);

    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Texto da confirmação' }), {
      target: { value: 'Teste' },
    });
    expect(botaoQueExclui(dialogo).disabled).toBe(false);
    fireEvent.click(botaoQueExclui(dialogo));

    expect(await screen.findByText('Planta Teste excluída.')).toBeTruthy();
    expect(pedidos.at(-1)).toEqual({ rota: 'DELETE p9', corpo: null });
    expect(await screen.findByText('Nenhuma planta ainda.')).toBeTruthy();
  });

  it('Nome que não confere: "Excluir a planta" continua desabilitado, e nada é apagado', async () => {
    const { servidor, pedidos } = servidorDasPlantas([planta('p1', 'Jundiaí')]);
    abrir(servidor);
    const dialogo = await abrirAExclusao('Jundiaí');
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Texto da confirmação' }), {
      target: { value: 'Jundiai' },
    });
    expect(botaoQueExclui(dialogo).disabled).toBe(true);
    fireEvent.click(botaoQueExclui(dialogo));
    expect(pedidos).toEqual([]);
  });

  it('a planta sem posição nenhuma diz isso, e a que falhou também se exclui', async () => {
    const { servidor } = servidorDasPlantas([ANEXO]);
    abrir(servidor);
    expect(await abrirAcoes('Anexo')).toContain('Excluir…');
    await escolher('Excluir…');
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir a planta Anexo?' });
    expect(dialogo.textContent).toContain('Nada está posicionado nela.');
  });
});

/** Um evento como a conexão o publicaria, avisando que o mapa mudou em outra sessão. */
const mapaMudou = () => ({
  id: `mapa-${Math.random()}`,
  tipo: 'mapa.mudou' as const,
  momento: '2026-11-10T12:00:00.000Z',
  alvo: null,
});

describe('o mapa aberto de uma planta que saiu', () => {
  /** O mapa da planta p1 no servidor do teste, com o desenho e sem marcadores. */
  function servidorDoMapa(podeEditar: boolean) {
    const { servidor, estado } = servidorDasPlantas([JUNDIAI], podeEditar);
    servidor['GET /api/mapa/plantas/p1/modelo'] = () =>
      estado.plantas.some(({ id }) => id === 'p1')
        ? Response.json({
            largura: 120,
            profundidade: 80,
            camadas: [{ nome: 'PAREDES', segmentos: [0, 0, 120, 0] }],
            paredes: [],
            rotulos: [],
            maquinas: [],
          })
        : Response.json(
            {
              type: 'urn:grafite:problema:nao-encontrado',
              title: 'Não encontrado',
              status: 404,
              detail: 'Planta não encontrada.',
              codigoDeRastreio: 'R7K2-9QXM',
            },
            { status: 404 },
          );
    servidor['GET /api/mapa/plantas/p1/marcadores'] = () =>
      Response.json({ camadas: [], posicionaveis: [], podeEditar, marcadores: [] });
    return { servidor, estado };
  }

  it('Mapa aberto em outra sessão: quem edita vê "Esta planta foi excluída." e o caminho para as plantas', async () => {
    const { servidor, estado } = servidorDoMapa(true);
    const canal = criarCanalDeEventos();
    abrir(servidor, true, { endereco: '/mapa/p1', canal });
    expect(await screen.findByRole('heading', { level: 1, name: /Jundiai/ })).toBeTruthy();

    estado.plantas = [];
    canal.publicar(mapaMudou());
    expect(await screen.findByText('Esta planta foi excluída.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver as plantas' }).getAttribute('href')).toBe('/mapa');
  });

  it('para quem só vê o mapa, a planta que saiu pode ter sido inativada: a tela não diz que foi excluída', async () => {
    const { servidor, estado } = servidorDoMapa(false);
    const canal = criarCanalDeEventos();
    abrir(servidor, false, { endereco: '/mapa/p1', canal });
    expect(await screen.findByRole('heading', { level: 1, name: /Jundiai/ })).toBeTruthy();

    estado.plantas = [];
    canal.publicar(mapaMudou());
    expect(await screen.findByText('Esta planta não está mais no mapa.')).toBeTruthy();
    expect(screen.queryByText('Esta planta foi excluída.')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ver as plantas' })).toBeTruthy();
  });
});

// A substituição do desenho (spec mapa-da-planta, "Substituição do desenho"; design, decisão 3).
describe('a substituição do desenho pela tela', () => {
  /** O servidor com a troca do desenho da planta p1: guarda o endereço e responde o que o teste der. */
  function servidorComATroca(inicial: PlantaDoMapa, resposta: () => Response) {
    const { servidor, estado } = servidorDasPlantas([inicial]);
    const enviados: string[] = [];
    servidor[`PUT /api/mapa/plantas/${inicial.id}/modelo`] = (pedido) => {
      enviados.push(pedido.url);
      return resposta();
    };
    return { servidor, estado, enviados };
  }

  async function abrirATroca(nome: string) {
    await abrirAcoes(nome);
    await escolher('Substituir o desenho…');
    return screen.findByRole('dialog', { name: 'Substituir o desenho' });
  }

  function escolherArquivo(gaveta: HTMLElement, nome: string) {
    const escolha = within(gaveta).getByRole('group', { name: 'Arquivo' });
    fireEvent.change(escolha.querySelector('input[type="file"]') as HTMLElement, {
      target: { files: [new File(['0\nSECTION'], nome, { type: 'application/dxf' })] },
    });
  }

  const titulos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

  it('Desenho corrigido: o arquivo vai para a mesma planta, com o retorno, e o modelo é relido', async () => {
    const { servidor, enviados } = servidorComATroca(JUNDIAI, () =>
      Response.json({ planta: { ...JUNDIAI, fonte: 'novo.dxf' }, posicoesFora: 0 }),
    );
    const consultas = criarClienteDeConsultas({ esperaEntreTentativas: 0 });
    // O desenho que o mapa aberto tinha lido antes da troca.
    consultas.setQueryData(['mapa', 'modelo', 'p1'], { largura: 120, profundidade: 80 });
    abrir(servidor, true, { consultas });
    const gaveta = await abrirATroca('Jundiai');
    const substituir = within(gaveta).getByRole('button', {
      name: 'Substituir',
    }) as HTMLButtonElement;
    expect(substituir.disabled).toBe(true);
    escolherArquivo(gaveta, 'novo.dxf');
    expect(await within(gaveta).findByText('novo.dxf')).toBeTruthy();
    fireEvent.click(substituir);

    await waitFor(() => expect(titulos()).toContain('Desenho da planta Jundiai substituído.'));
    expect(titulos().some((titulo) => titulo.includes('fora do desenho novo'))).toBe(false);
    expect(new URL(enviados[0] ?? '').searchParams.get('fonte')).toBe('novo.dxf');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Substituir o desenho' })).toBeNull(),
    );
    expect(consultas.getQueryState(['mapa', 'modelo', 'p1'])?.isInvalidated).toBe(true);
  });

  it('Posições fora do desenho novo: a tela avisa quantas ficaram, para reposicionar', async () => {
    const { servidor } = servidorComATroca(JUNDIAI, () =>
      Response.json({ planta: { ...JUNDIAI, largura: 60, profundidade: 40 }, posicoesFora: 3 }),
    );
    abrir(servidor);
    const gaveta = await abrirATroca('Jundiai');
    escolherArquivo(gaveta, 'menor.dxf');
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Substituir' }));
    await waitFor(() =>
      expect(titulos()).toContain(
        '3 posições ficaram fora do desenho novo. Reposicione-as no mapa.',
      ),
    );
    expect(titulos()).toContain('Desenho da planta Jundiai substituído.');
  });

  it('uma posição só fora do desenho novo: o aviso fala no singular', async () => {
    const { servidor } = servidorComATroca(JUNDIAI, () =>
      Response.json({ planta: JUNDIAI, posicoesFora: 1 }),
    );
    abrir(servidor);
    const gaveta = await abrirATroca('Jundiai');
    escolherArquivo(gaveta, 'menor.dxf');
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Substituir' }));
    await waitFor(() =>
      expect(titulos()).toContain('1 posição ficou fora do desenho novo. Reposicione-a no mapa.'),
    );
  });

  it('Arquivo recusado na substituição: a recusa aparece na escolha do arquivo, e a gaveta continua', async () => {
    const { servidor } = servidorComATroca(JUNDIAI, () =>
      dadosInvalidos({ arquivo: 'Envie o desenho em DXF ou o modelo da planta em JSON.' }),
    );
    abrir(servidor);
    const gaveta = await abrirATroca('Jundiai');
    escolherArquivo(gaveta, 'planta.pdf');
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Substituir' }));
    expect(
      await within(gaveta).findByText('Envie o desenho em DXF ou o modelo da planta em JSON.'),
    ).toBeTruthy();
    expect(titulos()).not.toContain('Desenho da planta Jundiai substituído.');
  });

  it('Planta que falhou: o menu oferece renomear, substituir o desenho e excluir', async () => {
    const { servidor } = servidorDasPlantas([ANEXO]);
    abrir(servidor);
    expect(await abrirAcoes('Anexo')).toEqual(['Renomear…', 'Substituir o desenho…', 'Excluir…']);
  });
});
