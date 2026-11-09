import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { abrirEscolhaDeLocal, filtrarLocais } from '../../../teste/escolhas.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

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
  local('expedicao', 'jundiai', 'Expedição', 'setor'),
  local('doca3', 'expedicao', 'Doca 3', 'sala', { situacao: 'inativo' }),
  local('administrativo', 'jundiai', 'Administrativo', 'predio'),
  local('andar1', 'administrativo', '1º andar', 'andar'),
  local('sala12', 'andar1', 'Sala 12', 'sala'),
  local('andar2', 'administrativo', '2º andar', 'andar'),
  local('campinas', null, 'Campinas', 'unidade', { permite: { editar: false } }),
];

const problema = (status: number, codigo: string, detalhe: string) =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
    },
    { status },
  );

/** A árvore no servidor do teste: o GET devolve como ela está, e as ações a mudam. */
function servidorDosLocais({ cadastrarNaRaiz = true } = {}) {
  const estado = { locais: [...LOCAIS] };
  const corpos: Record<string, unknown[]> = {};
  const guardar = async (pedido: Request) => {
    const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
    const texto = await pedido.text();
    const corpo = texto ? JSON.parse(texto) : null;
    corpos[caminho] = [...(corpos[caminho] ?? []), corpo];
    return corpo;
  };
  /** Muda um local e devolve ele como ficou. */
  const mudar = (id: string, mudanca: Partial<Local>) => {
    estado.locais = estado.locais.map((atual) =>
      atual.id === id ? { ...atual, ...mudanca } : atual,
    );
    return Response.json(estado.locais.find((atual) => atual.id === id));
  };
  const servidor: ServidorDeTeste = {
    'GET /api/locais': () => Response.json({ locais: estado.locais, permite: { cadastrarNaRaiz } }),
  };
  return { servidor, estado, corpos, guardar, mudar };
}

function abrir(
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('locais.editar'),
  canal: CanalDeEventos = criarCanalDeEventos(),
  endereco = '/administracao/locais',
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const arvore = () => screen.findByRole('treegrid', { name: 'Locais' });
const linha = (nome: string) => screen.getByRole('row', { name: nome });
const nomesDasLinhas = async () =>
  within(await arvore())
    .getAllByRole('row')
    .map((item) => item.getAttribute('aria-label'));
const expandir = (nome: string) =>
  fireEvent.click(within(linha(nome)).getByRole('button', { name: /^Expandir/ }));
const escolher = (nome: string) =>
  fireEvent.click(within(linha(nome)).getByText(nome.split(',')[0] as string));
const valorDe = (rotulo: string) =>
  screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling?.textContent;
const campo = (rotulo: string) => screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement;

/** Escolhe o tipo na seleção da gaveta. */
async function escolherTipo(gaveta: HTMLElement, tipo: string) {
  fireEvent.click(within(gaveta).getByRole('button', { name: /Tipo/ }));
  fireEvent.click(await screen.findByRole('option', { name: tipo }));
}

describe('tela de locais', () => {
  it('mostra a árvore com o tipo de cada local; os inativos aparecem, marcados, com "Mostrar inativos"', async () => {
    abrir(servidorDosLocais().servidor);
    await screen.findByRole('heading', { level: 1, name: 'Locais' });
    await waitFor(async () =>
      expect(await nomesDasLinhas()).toEqual([
        'Campinas, Unidade',
        'Jundiaí, Unidade',
        'Administrativo, Prédio',
        'Expedição, Setor',
      ]),
    );
    expect(
      within(linha('Expedição, Setor')).queryByRole('button', { name: /^Expandir/ }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar inativos' }));
    expandir('Expedição, Setor');
    expect(await screen.findByRole('row', { name: 'Doca 3, Sala, Inativo' })).toBeTruthy();
  });

  it('o local escolhido mostra o caminho, o tipo e a situação, e as ações só com permissão no ramo', async () => {
    abrir(servidorDosLocais().servidor);
    await arvore();
    expect(screen.getByText('Escolha um local para ver o caminho e as ações.')).toBeTruthy();
    await waitFor(() => linha('Expedição, Setor'));
    escolher('Expedição, Setor');
    expect(await screen.findByRole('heading', { level: 2, name: 'Expedição' })).toBeTruthy();
    expect(valorDe('Caminho')).toBe('Jundiaí › Expedição');
    expect(valorDe('Tipo')).toBe('Setor');
    expect(valorDe('Situação')).toBe('Ativo');
    for (const nome of ['Novo local dentro', 'Renomear', 'Mover para…', 'Inativar']) {
      expect(screen.getByRole('button', { name: nome }), nome).toBeTruthy();
    }

    escolher('Campinas, Unidade');
    expect(await screen.findByRole('heading', { level: 2, name: 'Campinas' })).toBeTruthy();
    expect(screen.getByText('Você não pode alterar este local.')).toBeTruthy();
    for (const nome of ['Novo local dentro', 'Renomear', 'Mover para…', 'Inativar']) {
      expect(screen.queryByRole('button', { name: nome }), nome).toBeNull();
    }
  });

  it('o endereço com o local, como o da referência a ele, já o escolhe e abre a árvore até ele', async () => {
    abrir(servidorDosLocais().servidor, undefined, undefined, '/administracao/locais?local=sala12');
    expect(await screen.findByRole('heading', { level: 2, name: 'Sala 12' })).toBeTruthy();
    expect(valorDe('Caminho')).toBe('Jundiaí › Administrativo › 1º andar › Sala 12');
    await waitFor(() => expect(linha('Sala 12, Sala')).toBeTruthy());
  });

  it('cadastra na raiz e dentro do escolhido, numa gaveta, com as regras antes de enviar', async () => {
    const { servidor, estado, corpos, guardar } = servidorDosLocais();
    servidor['POST /api/locais'] = async (pedido) => {
      const corpo = (await guardar(pedido)) as {
        paiId: string | null;
        nome: string;
        tipo: Local['tipo'];
      };
      const criado = local(`novo-${estado.locais.length}`, corpo.paiId, corpo.nome, corpo.tipo);
      estado.locais = [...estado.locais, criado];
      return Response.json(criado, { status: 201 });
    };
    abrir(servidor);
    await arvore();
    fireEvent.click(screen.getByRole('button', { name: 'Novo local' }));
    let gaveta = await screen.findByRole('dialog', { name: 'Novo local na raiz' });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar' }));
    expect(await within(gaveta).findByText('Informe o nome do local.')).toBeTruthy();
    expect(within(gaveta).getByText('Escolha o tipo do local.')).toBeTruthy();
    fireEvent.change(campo('Nome'), { target: { value: 'jundiai ' } });
    await escolherTipo(gaveta, 'Unidade');
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar' }));
    expect(await within(gaveta).findByText('Já existe um local com este nome aqui.')).toBeTruthy();
    expect(corpos['POST /api/locais']).toBeUndefined();

    fireEvent.change(campo('Nome'), { target: { value: 'Sorocaba' } });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(avisos()).toContain('Local cadastrado.'));
    expect(corpos['POST /api/locais']).toEqual([
      { paiId: null, nome: 'Sorocaba', tipo: 'unidade' },
    ]);
    expect(await screen.findByRole('heading', { level: 2, name: 'Sorocaba' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Novo local na raiz' })).toBeNull();

    escolher('Jundiaí, Unidade');
    await screen.findByRole('heading', { level: 2, name: 'Jundiaí' });
    fireEvent.click(screen.getByRole('button', { name: 'Novo local dentro' }));
    gaveta = await screen.findByRole('dialog', { name: 'Novo local em Jundiaí' });
    fireEvent.change(campo('Nome'), { target: { value: 'Portaria' } });
    await escolherTipo(gaveta, 'Setor');
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(corpos['POST /api/locais']?.at(-1)).toEqual({
        paiId: 'jundiai',
        nome: 'Portaria',
        tipo: 'setor',
      }),
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Portaria' })).toBeTruthy();
    expect(valorDe('Caminho')).toBe('Jundiaí › Portaria');
  });

  it('renomeia e muda o tipo numa gaveta', async () => {
    const { servidor, corpos, guardar, mudar } = servidorDosLocais();
    servidor['PATCH /api/locais/expedicao'] = async (pedido) => {
      const corpo = (await guardar(pedido)) as Partial<Local>;
      return mudar('expedicao', corpo);
    };
    abrir(servidor);
    await arvore();
    await waitFor(() => linha('Expedição, Setor'));
    escolher('Expedição, Setor');
    fireEvent.click(await screen.findByRole('button', { name: 'Renomear' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Renomear Expedição' });
    expect(campo('Nome').value).toBe('Expedição');
    fireEvent.change(campo('Nome'), { target: { value: 'Expedição Norte' } });
    await escolherTipo(gaveta, 'Outro');
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(avisos()).toContain('Local salvo.'));
    expect(corpos['PATCH /api/locais/expedicao']).toEqual([
      { nome: 'Expedição Norte', tipo: 'outro' },
    ]);
    expect(await screen.findByRole('row', { name: 'Expedição Norte, Outro' })).toBeTruthy();
  });

  it('"Mover para…" leva o local com o que está dentro, e o foco continua nele', async () => {
    const { servidor, corpos, guardar, mudar } = servidorDosLocais();
    servidor['POST /api/locais/andar1/movimento'] = async (pedido) => {
      const corpo = (await guardar(pedido)) as { paiId: string | null };
      return mudar('andar1', { paiId: corpo.paiId });
    };
    abrir(servidor);
    await arvore();
    await waitFor(() => linha('Administrativo, Prédio'));
    expandir('Administrativo, Prédio');
    escolher('1º andar, Andar');
    fireEvent.click(await screen.findByRole('button', { name: 'Mover para…' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Mover 1º andar para…' });
    const painel = await abrirEscolhaDeLocal('Para dentro de', dialogo);
    // O próprio ramo não é oferecido: o 1º andar não fica dentro dele mesmo.
    expect(await filtrarLocais(painel, 'andar')).toEqual(['Jundiaí › Administrativo › 2º andar']);
    fireEvent.click(
      within(painel).getByRole('option', { name: 'Jundiaí › Administrativo › 2º andar' }),
    );
    fireEvent.click(await within(dialogo).findByRole('button', { name: 'Mover' }));
    await waitFor(() => expect(avisos()).toContain('Local movido.'));
    expect(corpos['POST /api/locais/andar1/movimento']).toEqual([{ paiId: 'andar2' }]);
    const movido = await screen.findByRole('row', { name: '1º andar, Andar' });
    await waitFor(() => expect(movido.getAttribute('aria-level')).toBe('4'));
    await waitFor(() => expect(document.activeElement).toBe(movido));
    expect(valorDe('Caminho')).toBe('Jundiaí › Administrativo › 2º andar › 1º andar');
  });

  it('inativar mostra o motivo da recusa; reativar volta o local, ou diz o que falta', async () => {
    const { servidor, mudar } = servidorDosLocais();
    let recusar = true;
    servidor['POST /api/locais/expedicao/inativacao'] = () =>
      recusar
        ? problema(
            409,
            'local-em-uso',
            'Há 3 pessoas ativas com o local de trabalho aqui. Mude o local delas antes.',
          )
        : mudar('expedicao', { situacao: 'inativo' });
    servidor['POST /api/locais/expedicao/reativacao'] = () =>
      mudar('expedicao', { situacao: 'ativo' });
    servidor['POST /api/locais/doca3/reativacao'] = () =>
      problema(409, 'local-pai-inativo', 'Reative antes o local onde este fica.');
    abrir(servidor);
    await arvore();
    await waitFor(() => linha('Expedição, Setor'));
    escolher('Expedição, Setor');
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Inativar o local Expedição?',
    });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar o local' }));
    expect(
      await within(confirmacao).findByText(
        'Há 3 pessoas ativas com o local de trabalho aqui. Mude o local delas antes.',
      ),
    ).toBeTruthy();

    recusar = false;
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar o local' }));
    await waitFor(() => expect(avisos()).toContain('Local inativado.'));
    await waitFor(() => expect(valorDe('Situação')).toBe('Inativo'));
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(avisos()).toContain('Local reativado.'));
    await waitFor(() => expect(valorDe('Situação')).toBe('Ativo'));

    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar inativos' }));
    expandir('Expedição, Setor');
    escolher('Doca 3, Sala, Inativo');
    await screen.findByRole('heading', { level: 2, name: 'Doca 3' });
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    expect(await screen.findByText('Reative antes o local onde este fica.')).toBeTruthy();
  });

  it('sem a permissão para a organização inteira, não oferece "Novo local" na raiz', async () => {
    abrir(servidorDosLocais({ cadastrarNaRaiz: false }).servidor);
    await arvore();
    expect(screen.queryByRole('button', { name: 'Novo local' })).toBeNull();
  });

  it('com auditoria.ver, o local escolhido leva à auditoria filtrada por ele', async () => {
    noComputador();
    const roteador = criarRoteador(
      createMemoryHistory({ initialEntries: ['/administracao/locais'] }),
    );
    render(
      <App
        roteador={roteador}
        sessao={sessaoAtiva(
          naOrganizacao('locais.editar', 'auditoria.ver'),
          servidorDosLocais().servidor,
        )}
        consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      />,
    );
    await arvore();
    await waitFor(() => linha('Expedição, Setor'));
    escolher('Expedição, Setor');
    fireEvent.click(await screen.findByRole('link', { name: 'Ver na auditoria' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/administracao/auditoria'));
    expect(roteador.state.location.search).toEqual({
      alvo: ['local:expedicao'],
      nomeDoAlvo: 'Jundiaí › Expedição',
    });
  });
});

/** Um evento como a conexão o publicaria, avisando que um registro mudou em outro lugar. */
const eventoDe = (
  tipo: 'pessoas.mudaram' | 'acessos.mudaram' | 'locais.mudaram',
  alvo = null as null | { tipo: string; id: string },
) => ({
  id: `${tipo}-${Math.random()}`,
  tipo,
  momento: '2026-10-07T12:00:00.000Z',
  alvo,
});

// As contagens dos locais (spec locais, "Contagens dos locais"; change relacoes-vivas, decisão 6).
describe('as contagens dos locais', () => {
  const contagem = (quantos: number, recortada = false) => ({ quantos, recortada });
  const RESUMO_DA_EXPEDICAO = {
    id: 'expedicao',
    caminho: 'Jundiaí › Expedição',
    tipo: 'setor',
    situacao: 'ativo',
    ativos: { aqui: contagem(12), comOsDeDentro: contagem(30) },
    pessoas: { aqui: contagem(4), comOsDeDentro: contagem(4) },
  };
  const QUEM_VE_TUDO = naOrganizacao('locais.editar', 'ativos.ver', 'pessoas.ver');
  const destinoDe = (nome: string) =>
    new URL(
      screen.getByRole('link', { name: nome }).getAttribute('href') ?? '',
      'http://grafite.local',
    );

  it('os detalhes mostram os ativos e as pessoas, aqui e com os de dentro, cada um com o "Ver"', async () => {
    const { servidor } = servidorDosLocais();
    servidor['GET /api/locais/expedicao/resumo'] = () => Response.json(RESUMO_DA_EXPEDICAO);
    abrir(servidor, QUEM_VE_TUDO);
    await arvore();
    await waitFor(() => linha('Expedição, Setor'));
    escolher('Expedição, Setor');
    expect(await screen.findByText('Ativos: 12 aqui · 30 com os de dentro')).toBeTruthy();
    expect(screen.getByText('Pessoas: 4')).toBeTruthy();
    expect(destinoDe('Ver ativos').pathname).toBe('/ativos');
    expect(destinoDe('Ver ativos').searchParams.get('origem')).toBe('local:expedicao');
    expect(destinoDe('Ver pessoas').pathname).toBe('/administracao/pessoas');
    expect(destinoDe('Ver pessoas').searchParams.get('local')).toBe('expedicao');
  });

  it('com o escopo recortado, a contagem diz "que você vê"; sem ver ativos, eles não aparecem', async () => {
    const { servidor } = servidorDosLocais();
    servidor['GET /api/locais/expedicao/resumo'] = () =>
      Response.json({
        ...RESUMO_DA_EXPEDICAO,
        ativos: { aqui: contagem(1, true), comOsDeDentro: contagem(2, true) },
      });
    abrir(servidor, QUEM_VE_TUDO);
    await arvore();
    await waitFor(() => linha('Expedição, Setor'));
    escolher('Expedição, Setor');
    expect(await screen.findByText('Ativos que você vê: 1 aqui · 2 com os de dentro')).toBeTruthy();
    cleanup();
    abrir(servidor, naOrganizacao('locais.editar', 'pessoas.ver'));
    await arvore();
    await waitFor(() => linha('Expedição, Setor'));
    escolher('Expedição, Setor');
    expect(await screen.findByText('Pessoas: 4')).toBeTruthy();
    expect(screen.queryByText(/^Ativos/)).toBeNull();
  });

  it('"Mostrar contagens" põe ao lado de cada local os ativos e as pessoas, com os de dentro', async () => {
    const { servidor } = servidorDosLocais();
    let pedidas = 0;
    servidor['GET /api/locais/contagens'] = () => {
      pedidas += 1;
      return Response.json({
        locais: [
          {
            id: 'jundiai',
            ativos: { aqui: contagem(2), comOsDeDentro: contagem(32) },
            pessoas: { aqui: contagem(0), comOsDeDentro: contagem(5) },
          },
          {
            id: 'expedicao',
            ativos: { aqui: contagem(12), comOsDeDentro: contagem(30) },
            pessoas: { aqui: contagem(1), comOsDeDentro: contagem(1) },
          },
        ],
      });
    };
    abrir(servidor, QUEM_VE_TUDO);
    await arvore();
    await waitFor(() => linha('Jundiaí, Unidade'));
    expect(pedidas).toBe(0);
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar contagens' }));
    await waitFor(() => linha('Jundiaí, Unidade · 32 ativos · 5 pessoas'));
    expect(linha('Expedição, Setor · 30 ativos · 1 pessoa')).toBeTruthy();
    expect(pedidas).toBe(1);
  });

  it('"Mover para…" e "Inativar" dizem o que vai junto', async () => {
    const { servidor } = servidorDosLocais();
    servidor['GET /api/locais/expedicao/resumo'] = () => Response.json(RESUMO_DA_EXPEDICAO);
    abrir(servidor, QUEM_VE_TUDO);
    await arvore();
    await waitFor(() => linha('Expedição, Setor'));
    escolher('Expedição, Setor');
    fireEvent.click(await screen.findByRole('button', { name: 'Mover para…' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Mover Expedição para…' });
    expect(
      await within(dialogo).findByText('Vai junto: 1 local, 30 ativos e 4 pessoas.'),
    ).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Inativar' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Inativar o local Expedição?',
    });
    expect(
      await within(confirmacao).findByText('Vai junto: 1 local, 30 ativos e 4 pessoas.'),
    ).toBeTruthy();
  });
});

describe('locais relidos com outros dados', () => {
  it('a gaveta de renomear mostra o nome novo no título, e o que foi digitado continua', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDosLocais();
    abrir(servidor, undefined, canal);
    await arvore();
    await waitFor(() => linha('Expedição, Setor'));
    escolher('Expedição, Setor');
    fireEvent.click(await screen.findByRole('button', { name: 'Renomear' }));
    await screen.findByRole('dialog', { name: 'Renomear Expedição' });
    fireEvent.change(campo('Nome'), { target: { value: 'Expedição Norte' } });

    // Em outro lugar, o local é renomeado.
    estado.locais = estado.locais.map((atual) =>
      atual.id === 'expedicao' ? { ...atual, nome: 'Expedição Sul' } : atual,
    );
    canal.publicar(eventoDe('locais.mudaram', { tipo: 'local', id: 'expedicao' }));
    expect(await screen.findByRole('dialog', { name: 'Renomear Expedição Sul' })).toBeTruthy();
    expect(campo('Nome').value).toBe('Expedição Norte');
  });
});
