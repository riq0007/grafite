// Quem está com o quê (spec modulo-chamados, "Quem está com o quê", "Selos, prazo em texto e
// movimento" e "Telas atualizadas e módulo desligado"; spec chamados, "Carga de cada pessoa";
// change chamados-da-ti, design, decisão 22): as colunas do quadro, com os quadrados da lista dos
// prazos pelo vencimento, numa tela que aguenta os dois pedidos fora de passo.
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import {
  AGORA_DOS_MOCKUPS,
  ANA,
  BRUNO,
  CHAMADOS_DOS_MOCKUPS,
  chamadoNosPrazos,
  coluna as colunaDoQuadro,
  correndo,
  FUSO_DOS_MOCKUPS,
  PRAZOS_DOS_MOCKUPS,
  QUADRO_DOS_MOCKUPS,
  type QuadroDeTeste,
  RENATO,
  servidorDoQuadro,
  sp,
} from '../../teste/chamados.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

const ENDERECO = '/chamados/quem-esta-com-o-que';
const AVISO = 'Contando só os chamados dos locais que você vê.';

/** O 500 da API, com o código que a frase do erro cita. */
const falhou = () =>
  Response.json(
    {
      type: 'urn:grafite:problema:interno',
      title: 'Erro interno',
      status: 500,
      detail: 'Erro interno.',
      codigoDeRastreio: 'R7K2-9QXM',
    },
    { status: 500 },
  );

/** A resposta que só chega quando o teste manda. */
function respostaPresa(corpo: () => unknown) {
  let responder: () => void = () => {};
  const resposta = new Promise<Response>((pronto) => {
    responder = () => pronto(Response.json(corpo()));
  });
  return { resposta, responder: () => responder() };
}

const tituloDaTela = () => screen.getByRole('heading', { level: 1, name: /^Quem está com o quê/ });

/**
 * Abre a tela às 09:40 dos mockups, no fuso das preferências. O relógio fica parado, para o prazo e
 * a idade não andarem durante o teste, a não ser que o teste mande andar.
 */
function abrir(
  servidor: ServidorDeTeste,
  {
    permissoes = naOrganizacao('chamados.atender'),
    canal = criarCanalDeEventos(),
    relogioAnda = false,
  }: {
    permissoes?: ReturnType<typeof naOrganizacao>;
    canal?: CanalDeEventos;
    relogioAnda?: boolean;
  } = {},
) {
  noComputador();
  vi.useFakeTimers(
    relogioAnda
      ? { shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'Date'] }
      : { toFake: ['Date'] },
  );
  vi.setSystemTime(AGORA_DOS_MOCKUPS);
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [ENDERECO] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor, { regiao: { fuso: FUSO_DOS_MOCKUPS } })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return canal;
}

const publicarMudanca = (canal: CanalDeEventos) =>
  act(() =>
    canal.publicar({
      id: `e${Math.random()}`,
      tipo: 'chamados.mudaram',
      momento: AGORA_DOS_MOCKUPS.toISOString(),
      alvo: { tipo: 'chamado', id: '1038' },
    }),
  );

/** As colunas na ordem da tela, pelo título de cada uma. */
const colunas = () =>
  [...document.querySelectorAll<HTMLElement>('[data-coluna]')].map(
    (elemento) => within(elemento).getByRole('heading', { level: 2 }).textContent,
  );
const coluna = (nome: string) => screen.getByRole('region', { name: nome });
const contagem = (elemento: HTMLElement) =>
  elemento.querySelector('[data-parte="contagem"]')?.textContent;
const quadrados = (elemento: HTMLElement) =>
  within(elemento)
    .queryAllByRole('listitem')
    .map((item) => item.textContent);

/** Espera as colunas, com os abertos que a conta vê no título, como os 12 dos mockups. */
async function esperarOQuadro(abertos = '12 abertos') {
  const titulo = await screen.findByRole('heading', { level: 1, name: /^Quem está com o quê/ });
  const selo = await within(titulo).findByText(abertos, {}, { timeout: 3000 });
  await screen.findByRole('region', { name: 'Sem responsável' }, { timeout: 3000 });
  return selo;
}

describe('Quem está com o quê', () => {
  it('as colunas do m01: a triagem, uma por pessoa, pelo nome, com os quadrados pelo vencimento', async () => {
    const { servidor, quadro, prazos } = servidorDoQuadro();
    abrir(servidor);
    const abertos = await esperarOQuadro();
    expect(abertos.closest('[data-situacao]')?.getAttribute('data-situacao')).toBe('neutra');
    expect(colunas()).toEqual([
      'Sem responsável',
      'Ana Souza',
      'Bruno Lima',
      'Diego Martins',
      'Renato Alves',
    ]);

    const triagem = coluna('Sem responsável');
    expect(contagem(triagem)).toBe('3 na triagem · mais antigo #1038, há 6 h');
    expect(quadrados(triagem)).toEqual([
      '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
      '#1040Toner CF258A acabando no Financeirovence em 5 h',
      '#1042Impressora da Recepção manchandovence em 6 h',
    ]);
    // A triagem não tem a barra de carga nem o pé.
    expect(within(triagem).queryByRole('img', { name: /^Carga/ })).toBeNull();
    expect(within(triagem).queryByText(/resolvido hoje|Resolveu hoje/)).toBeNull();

    const ana = coluna('Ana Souza');
    expect(contagem(ana)).toBe('2 abertos · mais antigo #1041, há 17 h');
    // Na coluna estreita, o "mais antigo…" quebra antes da idade, e não no meio dela.
    expect(ana.querySelector('[data-parte="contagem"] [data-medida]')?.textContent).toBe('17 h');
    const carga = within(ana).getByRole('img', { name: 'Carga: 2 de 5' });
    expect(carga.getAttribute('title')).toBe('Carga: 2 de 5');
    expect([...carga.children].map((pedaco) => pedaco.hasAttribute('data-cheio'))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(quadrados(ana)).toEqual([
      '#1031Senha do sistema bloqueadavence em 2 h',
      '#1041Sem acesso à pasta do Financeiroparado',
    ]);
    expect(within(ana).getByText('Resolveu hoje: #1035')).toBeTruthy();

    const bruno = coluna('Bruno Lima');
    expect(contagem(bruno)).toBe('2 abertos · mais antigo #1032, há 2 d');
    expect(quadrados(bruno)).toEqual([
      '#1034Controle da portaria não lê o cartãovence em 7 h',
      '#1032Licença do Office expiradaparado',
    ]);
    expect(within(bruno).getByText('Nada resolvido hoje')).toBeTruthy();

    expect(contagem(coluna('Diego Martins'))).toBe('3 abertos · mais antigo #1029, há 3 d');
    expect(quadrados(coluna('Diego Martins'))).toEqual([
      '#1039Notebook não ligavence em 1 h',
      '#1036Trocar o teclado da Portariavence em 8 h',
      '#1029Monitor extra para a Sala Atlânticoparado',
    ]);

    const renato = coluna('Renato Alves');
    expect(contagem(renato)).toBe('2 abertos · mais antigo #1033, há 8 h');
    expect(quadrados(renato)).toEqual([
      '#1033Switch Rack 2 sem link na porta 3estourado',
      '#1037Ramal 214 sem tom de discagemvence em 4 h',
    ]);
    // O estourado diz a palavra, além da cor, e o quadrado tem o ícone do tipo com o nome dele.
    const [doSwitch] = within(renato).getAllByRole('listitem');
    expect(
      within(doSwitch as HTMLElement)
        .getByText('estourado')
        .closest('[data-grupo]')
        ?.getAttribute('data-grupo'),
    ).toBe('estourado');
    expect(
      within(doSwitch as HTMLElement).getByRole('img', { name: 'Rede e internet' }),
    ).toBeTruthy();

    // Os dois pedidos levam o fuso das preferências.
    for (const pedido of [quadro, prazos]) {
      const [primeiro] = pedido.mock.calls[0] ?? [];
      expect(new URL((primeiro as Request).url).searchParams.get('fuso')).toBe(FUSO_DOS_MOCKUPS);
    }
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it('quem não atende mais: a coluna depois das outras, com a marca, e a mesma conta com as duas', async () => {
    const erros = vi.spyOn(console, 'error');
    const { servidor } = servidorDoQuadro({
      quadro: {
        ...QUADRO_DOS_MOCKUPS,
        colunas: [
          ...QUADRO_DOS_MOCKUPS.colunas.slice(0, 3),
          colunaDoQuadro(RENATO, [1037], { numero: 1037, abertoEm: sp('2026-11-11T03:40:00') }),
          colunaDoQuadro(
            RENATO,
            [1033],
            { numero: 1033, abertoEm: sp('2026-11-11T01:20:00') },
            {
              naoAtendeMais: true,
            },
          ),
        ],
      },
    });
    abrir(servidor);
    await esperarOQuadro();
    expect(colunas()).toEqual([
      'Sem responsável',
      'Ana Souza',
      'Bruno Lima',
      'Diego Martins',
      'Renato Alves',
      'Renato Alves · não atende mais os chamados',
    ]);
    const naoAtende = coluna('Renato Alves · não atende mais os chamados');
    expect(within(naoAtende).getByText('não atende mais os chamados')).toBeTruthy();
    expect(contagem(naoAtende)).toBe('1 aberto · mais antigo #1033, há 8 h');
    expect(quadrados(naoAtende)).toEqual(['#1033Switch Rack 2 sem link na porta 3estourado']);
    expect(quadrados(coluna('Renato Alves'))).toEqual([
      '#1037Ramal 214 sem tom de discagemvence em 4 h',
    ]);
    // As duas colunas da mesma conta têm chaves diferentes.
    expect(erros.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('a quem não vê a organização inteira, o aviso acima das colunas', async () => {
    const { servidor } = servidorDoQuadro({
      quadro: { ...QUADRO_DOS_MOCKUPS, contandoSoOsLocaisQueVe: true },
    });
    abrir(servidor);
    const aviso = await screen.findByText(AVISO, {}, { timeout: 3000 });
    const primeira = document.querySelector('[data-coluna]') as HTMLElement;
    expect(aviso.compareDocumentPosition(primeira) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sem chamados: "0 abertos" e "0 na triagem", sem o mais antigo e sem quadrados', async () => {
    const { servidor } = servidorDoQuadro({
      quadro: {
        ...QUADRO_DOS_MOCKUPS,
        triagem: { abertos: [], maisAntigo: null },
        colunas: [colunaDoQuadro(BRUNO, [], null)],
        resolvidosHoje: [],
        versoes: {},
      },
      prazos: { ...PRAZOS_DOS_MOCKUPS, chamados: [] },
    });
    abrir(servidor);
    await esperarOQuadro('0 abertos');
    expect(colunas()).toEqual(['Sem responsável', 'Bruno Lima']);
    expect(contagem(coluna('Sem responsável'))).toBe('0 na triagem');
    const bruno = coluna('Bruno Lima');
    expect(contagem(bruno)).toBe('0 abertos');
    expect(within(bruno).getByRole('img', { name: 'Carga: 0 de 5' })).toBeTruthy();
    expect(quadrados(bruno)).toEqual([]);
    expect(within(bruno).getByText('Nada resolvido hoje')).toBeTruthy();
  });

  it('o prazo ilegível fica no fim da coluna, com "prazo ilegível"', async () => {
    const ilegivel = chamadoNosPrazos(1045, 'outro', 'Cadeira quebrada na Recepção', {
      pessoa: 'Marina Rocha',
      responsavel: ANA,
      abertoEm: sp('2026-11-11T08:00:00'),
      relogio: null,
    });
    const { servidor } = servidorDoQuadro({
      quadro: {
        ...QUADRO_DOS_MOCKUPS,
        colunas: [
          colunaDoQuadro(ANA, [1031, 1041, 1045], {
            numero: 1041,
            abertoEm: sp('2026-11-10T17:05:00'),
          }),
          ...QUADRO_DOS_MOCKUPS.colunas.slice(1),
        ],
      },
      prazos: { ...PRAZOS_DOS_MOCKUPS, chamados: [...CHAMADOS_DOS_MOCKUPS, ilegivel] },
    });
    abrir(servidor);
    await esperarOQuadro('13 abertos');
    expect(quadrados(coluna('Ana Souza'))).toEqual([
      '#1031Senha do sistema bloqueadavence em 2 h',
      '#1041Sem acesso à pasta do Financeiroparado',
      '#1045Cadeira quebrada na Recepçãoprazo ilegível',
    ]);
  });

  it('os dois pedidos fora de passo: o número que a lista não trouxe fica só com o número', async () => {
    const naTriagem = [1038, 1040, 1042, 1043];
    const novo = chamadoNosPrazos(1043, 'computador', 'Mouse sem fio parou', {
      pessoa: 'Luiza Farias',
      responsavel: null,
      abertoEm: sp('2026-11-11T09:35:00'),
      relogio: correndo(5, 4 * 60 + 55),
    });
    const soNaLista = chamadoNosPrazos(1044, 'telefone', 'Fone sem áudio', {
      pessoa: 'Tiago Moura',
      responsavel: null,
      abertoEm: sp('2026-11-11T09:38:00'),
      relogio: correndo(10, 9 * 60 + 58),
    });
    const quadro: QuadroDeTeste = {
      ...QUADRO_DOS_MOCKUPS,
      triagem: { ...QUADRO_DOS_MOCKUPS.triagem, abertos: naTriagem },
    };
    const { servidor, estado, prazos } = servidorDoQuadro({
      quadro,
      prazos: { ...PRAZOS_DOS_MOCKUPS, chamados: [...CHAMADOS_DOS_MOCKUPS, soNaLista] },
    });
    const canal = abrir(servidor);
    await esperarOQuadro('13 abertos');
    const triagem = coluna('Sem responsável');
    expect(contagem(triagem)).toBe('4 na triagem · mais antigo #1038, há 6 h');
    // Sem um pedido em curso, o número fica com o aviso de que os detalhes não vieram.
    expect(quadrados(triagem)).toEqual([
      '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
      '#1040Toner CF258A acabando no Financeirovence em 5 h',
      '#1042Impressora da Recepção manchandovence em 6 h',
      '#1043Detalhes não carregados',
    ]);
    // O que só a lista traz fica de fora.
    expect(screen.queryByText('#1044')).toBeNull();

    // Relida a tela, a lista demora: o número espera os detalhes com "Carregando…".
    let responder: () => void = () => {};
    prazos.mockImplementationOnce(
      () =>
        new Promise<Response>((pronto) => {
          responder = () => pronto(Response.json(estado.prazos));
        }),
    );
    estado.prazos = { ...PRAZOS_DOS_MOCKUPS, chamados: [...CHAMADOS_DOS_MOCKUPS, novo] };
    await publicarMudanca(canal);
    await waitFor(() => expect(quadrados(triagem).at(-1)).toBe('#1043Carregando…'));
    responder();
    await waitFor(() =>
      expect(quadrados(triagem).at(-1)).toBe('#1042Impressora da Recepção manchandovence em 6 h'),
    );
    expect(quadrados(triagem)).toEqual([
      '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
      '#1043Mouse sem fio parouvence em 4 h',
      '#1040Toner CF258A acabando no Financeirovence em 5 h',
      '#1042Impressora da Recepção manchandovence em 6 h',
    ]);
  });

  it('o chamado passado com a tela aberta muda de coluna, sem recarregar', async () => {
    const { servidor, estado } = servidorDoQuadro();
    const canal = abrir(servidor);
    await esperarOQuadro();
    estado.quadro = {
      ...QUADRO_DOS_MOCKUPS,
      triagem: {
        abertos: [1040, 1042],
        maisAntigo: { numero: 1040, abertoEm: sp('2026-11-11T06:52:00').toISOString() },
      },
      colunas: [
        ...QUADRO_DOS_MOCKUPS.colunas.slice(0, 3),
        colunaDoQuadro(RENATO, [1033, 1037, 1038], {
          numero: 1033,
          abertoEm: sp('2026-11-11T01:20:00'),
        }),
      ],
    };
    estado.prazos = {
      ...PRAZOS_DOS_MOCKUPS,
      chamados: CHAMADOS_DOS_MOCKUPS.map((chamado) =>
        chamado.numero === 1038
          ? { ...chamado, situacao: 'em-atendimento' as const, responsavel: RENATO }
          : chamado,
      ),
    };
    await publicarMudanca(canal);
    await waitFor(() =>
      expect(quadrados(coluna('Renato Alves'))).toEqual([
        '#1033Switch Rack 2 sem link na porta 3estourado',
        '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
        '#1037Ramal 214 sem tom de discagemvence em 4 h',
      ]),
    );
    expect(contagem(coluna('Renato Alves'))).toBe('3 abertos · mais antigo #1033, há 8 h');
    expect(contagem(coluna('Sem responsável'))).toBe('2 na triagem · mais antigo #1040, há 3 h');
    expect(screen.getByText('12 abertos')).toBeTruthy();
    // O quarto pedaço da barra de Renato continua vazio.
    expect(within(coluna('Renato Alves')).getByRole('img', { name: 'Carga: 3 de 5' })).toBeTruthy();
  });

  it('a idade do mais antigo e o prazo viram juntos, na virada do minuto', async () => {
    // O #1031 vence em 1 h 30 min e meio: longe da virada da hora, para o relógio que anda no teste.
    const { servidor } = servidorDoQuadro({
      prazos: {
        ...PRAZOS_DOS_MOCKUPS,
        chamados: CHAMADOS_DOS_MOCKUPS.map((chamado) =>
          chamado.numero === 1031 ? { ...chamado, relogio: correndo(4, 90.5) } : chamado,
        ),
      },
    });
    abrir(servidor, { relogioAnda: true });
    await esperarOQuadro();
    const ana = coluna('Ana Souza');
    expect(contagem(ana)).toBe('2 abertos · mais antigo #1041, há 17 h');
    expect(quadrados(ana)[0]).toBe('#1031Senha do sistema bloqueadavence em 1 h');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55 * 60_000);
    });
    expect(contagem(ana)).toBe('2 abertos · mais antigo #1041, há 18 h');
    expect(quadrados(ana)[0]).toBe('#1031Senha do sistema bloqueadavence em 35 min');
  });

  it('espera os dois pedidos, e, sem as colunas na tela, a falha de um deles fica no lugar delas, com "Tentar de novo"', async () => {
    const { servidor, quadro, prazos } = servidorDoQuadro();
    const doQuadro = respostaPresa(() => QUADRO_DOS_MOCKUPS);
    quadro.mockImplementationOnce(() => doQuadro.resposta);
    prazos.mockImplementationOnce(falhou);
    abrir(servidor);
    expect(await screen.findByText('Carregando os chamados…')).toBeTruthy();
    doQuadro.responder();
    expect(
      await screen.findByText(
        'Não foi possível carregar os prazos dos chamados. Informe à TI o código R7K2-9QXM.',
      ),
    ).toBeTruthy();
    expect(document.querySelector('[data-coluna]')).toBeNull();
    // O selo dos abertos entra com as colunas, e não com o quadro sozinho.
    expect(within(tituloDaTela()).queryByText('12 abertos')).toBeNull();

    // Sem a lista na mão, "Tentar de novo" volta ao "Carregando os chamados…" até ela chegar.
    const dosPrazos = respostaPresa(() => PRAZOS_DOS_MOCKUPS);
    prazos.mockImplementationOnce(() => dosPrazos.resposta);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Carregando os chamados…')).toBeTruthy();
    expect(screen.queryByText(/Não foi possível/)).toBeNull();
    dosPrazos.responder();
    await esperarOQuadro();
    expect(colunas()).toHaveLength(5);
  });

  it('com as colunas na tela, a falha de uma releitura vai acima delas, e as colunas ficam', async () => {
    const { servidor, estado, quadro } = servidorDoQuadro();
    const canal = abrir(servidor);
    await esperarOQuadro();
    quadro.mockImplementationOnce(falhou);
    await publicarMudanca(canal);
    const frase = await screen.findByText(
      'Não foi possível carregar o quadro dos chamados. Informe à TI o código R7K2-9QXM. As colunas mostram a última leitura.',
    );
    const falha = frase.closest('[role="alert"]') as HTMLElement | null;
    expect(falha).not.toBeNull();

    // As colunas e o selo continuam os da última leitura, com a falha antes delas.
    expect(colunas()).toHaveLength(5);
    expect(quadrados(coluna('Ana Souza'))).toEqual([
      '#1031Senha do sistema bloqueadavence em 2 h',
      '#1041Sem acesso à pasta do Financeiroparado',
    ]);
    expect(within(tituloDaTela()).getByText('12 abertos')).toBeTruthy();
    const primeira = document.querySelector('[data-coluna]') as HTMLElement;
    expect(
      (falha as HTMLElement).compareDocumentPosition(primeira) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // "Tentar de novo" relê o quadro, diz que relê, e a falha sai com a resposta.
    const doQuadro = respostaPresa(() => estado.quadro);
    quadro.mockImplementationOnce(() => doQuadro.resposta);
    fireEvent.click(within(falha as HTMLElement).getByRole('button', { name: 'Tentar de novo' }));
    expect(
      await within(falha as HTMLElement).findByRole('button', { name: /Tentando de novo/ }),
    ).toBeTruthy();
    doQuadro.responder();
    await waitFor(() => expect(screen.queryByText(frase.textContent ?? '')).toBeNull());
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(colunas()).toHaveLength(5);
  });

  it('sem chamados.ver nem chamados.atender, diz a quem pedir, sem pedir o quadro', async () => {
    const { servidor, quadro, prazos } = servidorDoQuadro();
    abrir(servidor, { permissoes: naOrganizacao('chamados.configurar') });
    expect(await screen.findByText('Você não tem acesso aos chamados.')).toBeTruthy();
    expect(quadro).not.toHaveBeenCalled();
    expect(prazos).not.toHaveBeenCalled();
  });
});
