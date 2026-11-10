// O módulo Painéis (spec modulo-paineis; change painel-de-dashboards): o menu pelas permissões, a
// grade adaptativa com a situação de cada painel, o expandir e o Esc, o "Verificar agora" e a tela
// sem permissão.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noCelular, noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';
import { itensPermitidos } from '../registroDaConta.ts';
import { paineis } from './modulo.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Painel = components['schemas']['Painel'];

const painel = (numero: number, mudancas: Partial<Painel> = {}): Painel => ({
  id: `0199d3a0-0000-7000-8000-00000000000${numero}`,
  nome: `Painel ${numero}`,
  endereco: `http://10.0.5.2${numero}:3000`,
  local: null,
  ordem: numero,
  situacao: 'ativo',
  verificacao: {
    situacao: 'no-ar',
    momento: '2026-10-28T10:00:00.000Z',
    tempoDaResposta: 40,
    motivo: null,
  },
  exibicao: { situacao: 'aparece', motivo: null },
  ...mudancas,
});

const TRES = [
  painel(1),
  painel(2, {
    verificacao: {
      situacao: 'fora-do-ar',
      momento: '2026-10-28T10:00:00.000Z',
      tempoDaResposta: 5000,
      motivo: 'Sem resposta em 5 s',
    },
    // O painel fora do ar não tem exibição.
    exibicao: null,
  }),
  painel(3),
];

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[],
  canal: CanalDeEventos = criarCanalDeEventos(),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

const comLista = (lista: Painel[], administrar = false): ServidorDeTeste => ({
  'GET /api/paineis': () => Response.json({ paineis: lista, permite: { administrar } }),
});

describe('o módulo Painéis', () => {
  it('Quem só vê os painéis: o menu mostra só Painéis', () => {
    const rotulos = (permissoes: string[]) =>
      itensPermitidos(paineis.menu ?? [], (chave: string) => permissoes.includes(chave)).map(
        (item) => item.rotulo,
      );
    expect(rotulos(['paineis.ver'])).toEqual(['Painéis']);
    expect(rotulos(['paineis.administrar'])).toEqual(['Painéis', 'Cadastro']);
  });

  // docs/ANTISLOP.md, seção 25: o estado vazio oferece a ação como as outras telas, num botão (change
  // um-destaque-por-tela, design, decisão 5).
  it('sem painéis, quem administra abre o cadastro por um botão', async () => {
    abrir('/paineis', comLista([], true), naOrganizacao('paineis.ver', 'paineis.administrar'));
    expect(await screen.findByRole('button', { name: 'Abrir o cadastro' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Abrir o cadastro' })).toBeNull();
  });

  it('Três painéis: lado a lado, com a situação em texto e o motivo de quem está fora do ar', async () => {
    abrir('/paineis', comLista(TRES), naOrganizacao('paineis.ver'));
    const segundo = await screen.findByRole('region', { name: 'Painel 2' });
    expect(within(segundo).getByText('Fora do ar')).toBeTruthy();
    expect(within(segundo).getByText(/Sem resposta em 5 s/)).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Painel 1' })).getByText('No ar'),
    ).toBeTruthy();
    const grade = segundo.parentElement as HTMLElement;
    expect(grade.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(grade.style.gridTemplateRows).toBe('repeat(1, minmax(0, 1fr))');
    expect(within(segundo).getByTitle('Painel 2').getAttribute('src')).toBe(
      `/api/paineis/${TRES[1]?.id}/exibicao`,
    );
    expect(within(segundo).getByTitle('Painel 2').getAttribute('sandbox')).not.toContain(
      'allow-same-origin',
    );
  });

  it('mantém o painel HTTPS e o link original do painel HTTP', async () => {
    abrir(
      '/paineis',
      comLista([painel(1), painel(2, { endereco: 'https://intranet.exemplo/painel' })]),
      naOrganizacao('paineis.ver'),
    );
    const primeiro = await screen.findByRole('region', { name: 'Painel 1' });
    expect(
      within(primeiro).getByRole('link', { name: 'Abrir em outra aba' }).getAttribute('href'),
    ).toBe('http://10.0.5.21:3000');
    expect(screen.getByTitle('Painel 2').getAttribute('src')).toBe(
      'https://intranet.exemplo/painel',
    );
    expect(screen.queryByText(/O navegador não mostra/)).toBeNull();
  });

  // Spec modulo-paineis, "Grade adaptativa" (change telas-no-celular, design, decisão 3).
  it('Três painéis no celular: um embaixo do outro, com a largura toda', async () => {
    noCelular();
    abrir('/paineis', comLista(TRES), naOrganizacao('paineis.ver'));
    const segundo = await screen.findByRole('region', { name: 'Painel 2' });
    const grade = segundo.parentElement as HTMLElement;
    expect(grade.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
    expect(grade.style.gridTemplateRows).toMatch(/^repeat\(3, /);
  });

  // Spec modulo-paineis, "Grade adaptativa" (change diagnostico-dos-paineis, design, decisão 4).
  describe('o bloco pela exibição', () => {
    const NO_GRAFANA = 'https://grafana.empresa.local/d/linha2';
    const RECUSA = 'Este endereço recusa ser mostrado dentro de outra página.';
    const linha2 = (exibicao: Painel['exibicao']) =>
      painel(1, { nome: 'Linha 2', endereco: NO_GRAFANA, exibicao });
    const QUE_RECUSA = linha2({
      situacao: 'recusa',
      motivo: 'A ferramenta manda X-Frame-Options: DENY.',
    });

    it('Painel que recusa ser embutido: o motivo e o que liberar, sem o quadro em branco', async () => {
      abrir('/paineis', comLista([QUE_RECUSA, painel(2)]), naOrganizacao('paineis.ver'));
      const bloco = await screen.findByRole('region', { name: 'Linha 2' });
      expect(within(bloco).getByText('No ar')).toBeTruthy();
      expect(within(bloco).getByText('Recusa ser embutido')).toBeTruthy();
      expect(within(bloco).getByText(RECUSA)).toBeTruthy();
      expect(
        within(bloco).getByText(
          'A ferramenta manda X-Frame-Options: DENY. Libere o endereço do Grafite na ferramenta, ou use “Abrir em outra aba”.',
        ),
      ).toBeTruthy();
      expect(
        within(bloco).getByRole('link', { name: 'Abrir em outra aba' }).getAttribute('href'),
      ).toBe(NO_GRAFANA);
      // O endereço não é carregado: o navegador só mostraria o quadro em branco.
      expect(within(bloco).queryByTitle('Linha 2')).toBeNull();
      expect(screen.getByTitle('Painel 2')).toBeTruthy();
    });

    it('Painel que pede a entrada: o aviso e, abaixo dele, o conteúdo', async () => {
      const chamados = painel(1, {
        nome: 'Chamados',
        endereco: 'https://chamados.empresa.local',
        exibicao: { situacao: 'pede-entrada', motivo: 'Respondeu 401.' },
      });
      abrir('/paineis', comLista([chamados]), naOrganizacao('paineis.ver'));
      const bloco = await screen.findByRole('region', { name: 'Chamados' });
      expect(within(bloco).getByText('Pede a entrada')).toBeTruthy();
      const aviso = within(bloco).getByText(
        'Este painel pede a entrada. Se a tela de entrada voltar depois de entrar, use “Abrir em outra aba” ou libere a visualização sem entrada na ferramenta.',
      );
      const quadro = within(bloco).getByTitle('Chamados');
      expect(quadro.getAttribute('src')).toBe('https://chamados.empresa.local');
      expect(aviso.compareDocumentPosition(quadro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('o painel que aparece na grade e o sem exibição mostram o conteúdo, sem anunciar nada', async () => {
      const semExibicao = painel(2, {
        endereco: 'https://intranet.exemplo/painel',
        exibicao: null,
      });
      abrir(
        '/paineis',
        comLista([linha2({ situacao: 'aparece', motivo: null }), semExibicao]),
        naOrganizacao('paineis.ver'),
      );
      const bloco = await screen.findByRole('region', { name: 'Linha 2' });
      expect(within(bloco).getByTitle('Linha 2').getAttribute('src')).toBe(NO_GRAFANA);
      expect(screen.getByTitle('Painel 2').getAttribute('src')).toBe(
        'https://intranet.exemplo/painel',
      );
      // "Aparece na grade" é uma leitura da resposta, e não uma prova: o bloco não a anuncia.
      expect(screen.queryByText('Aparece na grade')).toBeNull();
    });

    it('Liberado com a grade aberta: o bloco passa a carregar o endereço, sem recarregar os outros', async () => {
      const canal = criarCanalDeEventos();
      let lista = [QUE_RECUSA, painel(2)];
      abrir(
        '/paineis',
        {
          'GET /api/paineis': () =>
            Response.json({ paineis: lista, permite: { administrar: false } }),
        },
        naOrganizacao('paineis.ver'),
        canal,
      );
      await screen.findByText(RECUSA);
      const doOutro = screen.getByTitle('Painel 2');

      lista = [linha2({ situacao: 'aparece', motivo: null }), painel(2)];
      act(() => {
        canal.publicar({
          id: 'e1',
          tipo: 'paineis.mudaram',
          momento: '2026-11-10T12:00:00.000Z',
          alvo: null,
        });
      });
      expect((await screen.findByTitle('Linha 2')).getAttribute('src')).toBe(NO_GRAFANA);
      expect(screen.queryByText(RECUSA)).toBeNull();
      // O quadro do outro painel é o mesmo elemento: não foi recarregado.
      expect(screen.getByTitle('Painel 2')).toBe(doOutro);
    });
  });

  it('Pelo mapa: o endereço abre o painel expandido, e Esc volta à grade', async () => {
    const roteador = abrir(
      `/paineis?expandido=${TRES[1]?.id}`,
      comLista(TRES),
      naOrganizacao('paineis.ver'),
    );
    expect(await screen.findByRole('region', { name: 'Painel 2' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Painel 1' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Painel 1' })).toBeTruthy());
    expect(roteador.state.location.search).toEqual({});
  });

  it('Verificar agora: o retorno diz a situação nova', async () => {
    const fora = TRES[1] as Painel;
    abrir(
      '/paineis/cadastro',
      {
        ...comLista(TRES, true),
        [`POST /api/paineis/${fora.id}/verificacao`]: () =>
          Response.json({ ...fora, verificacao: { ...fora.verificacao, situacao: 'no-ar' } }),
      },
      naOrganizacao('paineis.administrar', 'paineis.ver'),
    );
    const linha = (await screen.findByText('Painel 2')).closest('[role="row"]') as HTMLElement;
    fireEvent.click(within(linha).getByRole('button', { name: 'Verificar agora' }));
    expect(await screen.findByText('Painel verificado: No ar.')).toBeTruthy();
  });

  // Spec modulo-paineis, "Cadastro dos painéis" (change diagnostico-dos-paineis).
  describe('a exibição no Cadastro', () => {
    const SEM_VERIFICACAO = painel(1, {
      nome: 'Linha 2',
      endereco: 'https://grafana.empresa.local/d/linha2',
      local: { id: '0193a0b2-0000-7000-8000-00000000000e', caminho: 'Jundiaí › Produção' },
      verificacao: {
        situacao: 'sem-verificacao',
        momento: null,
        tempoDaResposta: null,
        motivo: null,
      },
      exibicao: null,
    });
    const verificado = (exibicao: Painel['exibicao']): Painel => ({
      ...SEM_VERIFICACAO,
      verificacao: {
        situacao: 'no-ar',
        momento: '2026-11-10T12:00:00.000Z',
        tempoDaResposta: 40,
        motivo: null,
      },
      exibicao,
    });
    const DE_FABRICA = verificado({
      situacao: 'recusa',
      motivo: 'A ferramenta manda X-Frame-Options: DENY.',
    });
    const linhaDe = async (nome: string) =>
      (await screen.findByText(nome)).closest('[role="row"]') as HTMLElement;

    /** O Cadastro com o painel sem verificação, que o "Verificar agora" devolve como dado. */
    function comAVerificacao(depois: Painel) {
      let lista = [SEM_VERIFICACAO];
      abrir(
        '/paineis/cadastro',
        {
          'GET /api/paineis': () =>
            Response.json({ paineis: lista, permite: { administrar: true } }),
          [`POST /api/paineis/${SEM_VERIFICACAO.id}/verificacao`]: () => {
            lista = [depois];
            return Response.json(depois);
          },
        },
        naOrganizacao('paineis.administrar', 'paineis.ver'),
      );
    }

    it('Verificar um painel que recusa ser embutido: o retorno diz as duas coisas, e a coluna, o motivo', async () => {
      comAVerificacao(DE_FABRICA);
      const linha = await linhaDe('Linha 2');
      expect(within(linha).queryByText('Recusa ser embutido')).toBeNull();
      fireEvent.click(within(linha).getByRole('button', { name: 'Verificar agora' }));
      expect(
        await screen.findByText('Painel verificado: No ar, mas recusa ser embutido.'),
      ).toBeTruthy();
      const selo = await screen.findByText('Recusa ser embutido');
      const celula = selo.closest('[role="gridcell"]') as HTMLElement;
      expect(within(celula).getByText('A ferramenta manda X-Frame-Options: DENY.')).toBeTruthy();
      // O rótulo fica inteiro, e o motivo é o que encolhe na coluna estreita.
      expect(selo.closest('[data-parte="fixo"]')).not.toBeNull();
    });

    it('o painel que pede a entrada: o retorno diz "No ar, mas pede a entrada."', async () => {
      comAVerificacao(verificado({ situacao: 'pede-entrada', motivo: 'Respondeu 401.' }));
      const linha = await linhaDe('Linha 2');
      fireEvent.click(within(linha).getByRole('button', { name: 'Verificar agora' }));
      expect(await screen.findByText('Painel verificado: No ar, mas pede a entrada.')).toBeTruthy();
      expect(await screen.findByText('Pede a entrada')).toBeTruthy();
    });

    it('a lista traz o local e a exibição em texto, com o travessão no que falta', async () => {
      abrir(
        '/paineis/cadastro',
        comLista([DE_FABRICA, TRES[1] as Painel, painel(3)], true),
        naOrganizacao('paineis.administrar', 'paineis.ver'),
      );
      const comLocal = await linhaDe('Linha 2');
      expect(screen.getByRole('columnheader', { name: 'Local' })).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: 'Exibição' })).toBeTruthy();
      expect(within(comLocal).getByText('Jundiaí › Produção')).toBeTruthy();
      expect(within(comLocal).queryByText('—')).toBeNull();
      // O painel fora do ar, sem local: o travessão no local e na exibição.
      const foraDoAr = await linhaDe('Painel 2');
      expect(within(foraDoAr).getAllByText('—')).toHaveLength(2);
      // O painel que aparece: a leitura em texto, no tom neutro, e o travessão só no local.
      const queAparece = await linhaDe('Painel 3');
      expect(within(queAparece).getByText('Aparece na grade')).toBeTruthy();
      expect(within(queAparece).getAllByText('—')).toHaveLength(1);
    });
  });

  it('sem a permissão, a tela diz que a conta não tem acesso aos painéis', async () => {
    abrir('/paineis', comLista([]), naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso aos painéis.')).toBeTruthy();
  });
});
