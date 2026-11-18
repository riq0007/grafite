// Quem está com o quê (spec modulo-chamados, "Quem está com o quê", "Selos, prazo em texto e
// movimento" e "Telas atualizadas e módulo desligado"; spec chamados, "Carga de cada pessoa" e
// "Ações do atendimento"; change chamados-da-ti, design, decisão 22): as colunas do quadro, com os
// quadrados da lista dos prazos pelo vencimento, numa tela que aguenta os dois pedidos fora de
// passo, e a prévia e o menu de cada quadrado, com as ações do atendimento.
import { filaDeAvisos } from '@grafite/ui';
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
  depoisDaAcao,
  FUSO_DOS_MOCKUPS,
  PRAZOS_DOS_MOCKUPS,
  passarNoQuadro,
  passarNosPrazos,
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
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
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
/** Os quadrados da coluna, pelo texto de cada um, sem a prévia que estiver aberta ao lado. */
const quadrados = (elemento: HTMLElement) =>
  within(elemento)
    .queryAllByRole('article')
    .map((quadrado) => quadrado.textContent);

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
    // O quadrado sem os detalhes fica sem o foco, sem a prévia e sem o menu.
    const semDetalhes = within(triagem).getByRole('article', { name: '#1043' });
    expect(semDetalhes.hasAttribute('tabindex')).toBe(false);
    fireEvent.contextMenu(semDetalhes);
    expect(screen.queryByRole('menu')).toBeNull();

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

/** O quadrado do chamado, pelo nome, como "#1033 Switch Rack 2 sem link na porta 3". */
const quadradoDo = (numero: number, dentro: HTMLElement = document.body) =>
  within(dentro).getByRole('article', { name: new RegExp(`^#${numero}( |$)`) });
const previaDo = (numero: number) => screen.queryByRole('group', { name: `Prévia do #${numero}` });
const aPreviaDo = (numero: number) => {
  const previa = previaDo(numero);
  if (!previa) throw new Error(`A prévia do #${numero} não está aberta.`);
  return previa;
};
const titulosDosAvisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const avisoDe = (titulo: string) =>
  filaDeAvisos.naTela.find(({ aviso }) => aviso.titulo === titulo)?.aviso;

/** O mouse entra no item do quadrado e se move sobre ele, sem botão apertado. */
function pararOMouse(quadrado: HTMLElement) {
  fireEvent.pointerEnter(quadrado.closest('li') as HTMLElement, { pointerType: 'mouse' });
  fireEvent.pointerMove(quadrado, { pointerType: 'mouse', buttons: 0 });
}
const tirarOMouse = (quadrado: HTMLElement) =>
  fireEvent.pointerLeave(quadrado.closest('li') as HTMLElement, { pointerType: 'mouse' });
const esperar = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms));
/**
 * A pessoa usa o mouse: o clique dele começa no aperto, que a tela guarda como a última interação.
 * O `fireEvent.click` sozinho é o clique virtual, sem o aperto.
 */
const comOMouse = () => fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 });
/** O clique direito no quadrado: o aperto do botão direito e o menu do navegador. */
function clicarComODireito(quadrado: HTMLElement, x: number, y: number) {
  fireEvent.pointerDown(quadrado, { pointerType: 'mouse', button: 2, buttons: 2 });
  return fireEvent.contextMenu(quadrado, { clientX: x, clientY: y });
}
/** Uma caixa na janela, como a do `getBoundingClientRect`, que o happy-dom não mede. */
const caixa = (left: number, top: number, largura: number, altura: number) =>
  ({
    left,
    top,
    right: left + largura,
    bottom: top + altura,
    x: left,
    y: top,
    width: largura,
    height: altura,
    toJSON: () => ({}),
  }) as DOMRect;

/** As linhas da lista da prévia ("Pediu", "Ativo" e "Atende"), com o que cada uma diz. */
const linhasDa = (previa: HTMLElement) =>
  [...previa.querySelectorAll('dt')].map((termo) => [
    termo.textContent,
    termo.nextElementSibling?.textContent,
  ]);
const itensDoMenu = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);

/** A ação no servidor de teste: guarda o corpo de cada pedido e responde o que o teste dá. */
function acaoNoServidor(
  servidor: ServidorDeTeste,
  chave: string,
  responder: () => Response | Promise<Response>,
) {
  const corpos: unknown[] = [];
  servidor[chave] = async (pedido) => {
    corpos.push(await pedido.json());
    return responder();
  };
  return corpos;
}

/** A recusa da versão velha, como a API a dá (409 `chamado-mudou`). */
const mudou = (numero: number, acao: string) =>
  Response.json(
    {
      type: 'urn:grafite:problema:chamado-mudou',
      title: 'Chamado mudou',
      status: 409,
      detail: `O chamado #${numero} mudou. Confira antes de ${acao}.`,
    },
    { status: 409 },
  );

describe('Quem está com o quê · a prévia e o menu do quadrado', () => {
  it('o ponteiro parado no #1033 abre a prévia do m01, e o ponteiro que só passa não a abre', async () => {
    const { servidor } = servidorDoQuadro();
    abrir(servidor);
    await esperarOQuadro();
    const doSwitch = quadradoDo(1033);
    expect(doSwitch.getAttribute('tabindex')).toBe('0');
    // O prazo descreve o quadrado, para quem chega a ele pelo foco com o leitor de tela.
    const descricao = document.getElementById(doSwitch.getAttribute('aria-describedby') ?? '');
    expect(descricao?.textContent).toBe('estourado');

    // O ponteiro que passa sem parar não abre nada.
    pararOMouse(doSwitch);
    tirarOMouse(doSwitch);
    await esperar(300);
    expect(previaDo(1033)).toBeNull();
    // Nem o toque, nem a caneta, nem o mouse com o botão apertado, o começo do arraste (5.9).
    fireEvent.pointerMove(doSwitch, { pointerType: 'touch', buttons: 0 });
    fireEvent.pointerMove(doSwitch, { pointerType: 'pen', buttons: 0 });
    fireEvent.pointerMove(doSwitch, { pointerType: 'mouse', buttons: 1 });
    await esperar(300);
    expect(previaDo(1033)).toBeNull();

    pararOMouse(doSwitch);
    const previa = await waitFor(() => aPreviaDo(1033));
    expect(doSwitch.hasAttribute('data-aberto')).toBe(true);
    const selo = within(previa).getByText('Estourado há 20 min');
    expect(selo.closest('[data-situacao]')?.getAttribute('data-situacao')).toBe('critico');
    expect(within(previa).getByText('#1033')).toBeTruthy();
    expect(within(previa).getByText('Rede e internet')).toBeTruthy();
    expect(
      within(previa).getByRole('heading', { name: 'Switch Rack 2 sem link na porta 3' }),
    ).toBeTruthy();
    expect(linhasDa(previa)).toEqual([
      ['Pediu', 'Sandra Vieira · Administrativo'],
      ['Ativo', 'PAT-00140 Switch Rack 2 · Sala de TI'],
      ['Atende', 'Renato Alves'],
    ]);
    expect(within(previa).getByText('Sandra Vieira · 09:12')).toBeTruthy();
    expect(
      within(previa).getByText('A sala do Administrativo continua sem rede. Dá para olhar agora?'),
    ).toBeTruthy();
    expect(within(previa).getByRole('button', { name: 'Assumir' })).toBeTruthy();
    // "Passar para…": as pessoas das colunas, fora Renato, com o nome inteiro no nome lido.
    const passar = within(previa).getByRole('group', { name: 'Passar para…' });
    const pessoas = within(passar).getAllByRole('button');
    expect(pessoas.map((botao) => botao.getAttribute('aria-label'))).toEqual([
      'Ana Souza, 2 abertos',
      'Bruno Lima, 2 abertos',
      'Diego Martins, 3 abertos',
    ]);
    expect(pessoas.map((botao) => botao.textContent)).toEqual([
      'ASAna2 abertos',
      'BLBruno2 abertos',
      'DMDiego3 abertos',
    ]);

    // O ponteiro que sai do quadrado e dela a fecha.
    tirarOMouse(doSwitch);
    await waitFor(() => expect(previaDo(1033)).toBeNull());
    expect(doSwitch.hasAttribute('data-aberto')).toBe(false);

    // A rolagem dentro dela não a fecha; a das colunas fecha a aberta pelo ponteiro.
    pararOMouse(doSwitch);
    fireEvent.scroll(await waitFor(() => aPreviaDo(1033)));
    expect(previaDo(1033)).not.toBeNull();
    fireEvent.scroll(document.querySelector('[data-coluna]')?.parentElement as HTMLElement);
    expect(previaDo(1033)).toBeNull();
    // A mudança do tamanho da janela também.
    pararOMouse(doSwitch);
    await waitFor(() => aPreviaDo(1033));
    fireEvent(window, new Event('resize'));
    expect(previaDo(1033)).toBeNull();
  });

  it('o foco do teclado abre a prévia na hora, ela vem antes do quadrado seguinte, e Esc a fecha', async () => {
    const { servidor } = servidorDoQuadro();
    abrir(servidor);
    await esperarOQuadro();
    const wifi = quadradoDo(1038);
    act(() => wifi.focus());
    const previa = aPreviaDo(1038);
    expect(linhasDa(previa)).toEqual([
      ['Pediu', 'Helena Prado · Diretoria'],
      ['Ativo', 'Nenhum ativo ligado'],
      ['Atende', 'Ninguém ainda, na triagem'],
    ]);
    expect(within(previa).getByText('Helena Prado · 08:55')).toBeTruthy();
    // Da triagem, as quatro pessoas.
    expect(
      within(within(previa).getByRole('group', { name: 'Passar para…' })).getAllByRole('button'),
    ).toHaveLength(4);

    // Na ordem da leitura: o quadrado, os botões da prévia e o quadrado seguinte.
    const assumir = within(previa).getByRole('button', { name: 'Assumir' });
    const toner = quadradoDo(1040);
    expect(wifi.compareDocumentPosition(assumir) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(assumir.compareDocumentPosition(toner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // O foco que passa aos botões dela a mantém, e a tecla de menu num deles não abre o menu.
    act(() => assumir.focus());
    expect(previaDo(1038)).not.toBeNull();
    fireEvent.keyDown(assumir, { key: 'ContextMenu' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(previaDo(1038)).not.toBeNull();
    // Esc a fecha, com o foco no quadrado.
    fireEvent.keyDown(assumir, { key: 'Escape' });
    expect(previaDo(1038)).toBeNull();
    expect(document.activeElement).toBe(wifi);

    // O foco no quadrado seguinte abre a dele, e só ela; sem mensagem, ela diz.
    act(() => toner.focus());
    expect(previaDo(1038)).toBeNull();
    expect(within(aPreviaDo(1040)).getByText('Nenhuma mensagem ainda.')).toBeTruthy();
    // A aberta pelo foco fica com a rolagem: o foco num quadrado fora da área rola as colunas.
    fireEvent.scroll(document.querySelector('[data-coluna]')?.parentElement as HTMLElement);
    expect(previaDo(1040)).not.toBeNull();
    // O foco que sai do quadro a fecha.
    act(() => quadradoDo(1042).focus());
    expect(previaDo(1042)).not.toBeNull();
    act(() => quadradoDo(1042).blur());
    expect(previaDo(1042)).toBeNull();
  });

  it('o foco que vem do aperto do ponteiro não abre a prévia, e o que vem depois de uma tecla abre', async () => {
    const { servidor } = servidorDoQuadro();
    abrir(servidor);
    await esperarOQuadro();
    const wifi = quadradoDo(1038);
    fireEvent.pointerDown(wifi, { pointerType: 'mouse', button: 0 });
    act(() => wifi.focus());
    fireEvent.pointerUp(wifi, { pointerType: 'mouse', button: 0 });
    expect(previaDo(1038)).toBeNull();

    act(() => wifi.blur());
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => wifi.focus());
    expect(previaDo(1038)).not.toBeNull();
  });

  it('"Assumir" na prévia manda a versão das colunas, gira até a resposta, avisa com "Desfazer" e relê sem esperar o evento', async () => {
    // A versão das colunas é a que vale: a lista, fora de passo, ainda diz 1.
    const { servidor, estado, quadro, prazos } = servidorDoQuadro({
      quadro: { ...QUADRO_DOS_MOCKUPS, versoes: { ...QUADRO_DOS_MOCKUPS.versoes, 1038: 4 } },
    });
    let soltar: () => void = () => {};
    const assumiu = acaoNoServidor(
      servidor,
      'POST /api/chamados/1038/assumir',
      () =>
        new Promise<Response>((pronto) => {
          soltar = () => {
            estado.quadro = passarNoQuadro(estado.quadro, 1038, ANA);
            estado.prazos = passarNosPrazos(estado.prazos, 1038, ANA);
            pronto(Response.json(depoisDaAcao(1038, 5, 'em-atendimento', ANA)));
          };
        }),
    );
    const desfez = acaoNoServidor(servidor, 'POST /api/chamados/1038/desfazer', () => {
      estado.quadro = passarNoQuadro(estado.quadro, 1038, null);
      estado.prazos = passarNosPrazos(estado.prazos, 1038, null);
      return Response.json(depoisDaAcao(1038, 6, 'triagem', null));
    });
    abrir(servidor);
    await esperarOQuadro();
    pararOMouse(quadradoDo(1038));
    const previa = await waitFor(() => aPreviaDo(1038));
    const leituras = { quadro: quadro.mock.calls.length, prazos: prazos.mock.calls.length };
    comOMouse();
    fireEvent.click(within(previa).getByRole('button', { name: 'Assumir' }));
    expect(await within(previa).findByRole('button', { name: /Assumindo/ })).toBeTruthy();
    await waitFor(() => expect(assumiu).toEqual([{ versao: 4 }]));
    soltar();

    await waitFor(() => expect(titulosDosAvisos()).toContain('Você assumiu o #1038.'));
    expect(avisoDe('Você assumiu o #1038.')?.situacao).toBe('sucesso');
    // Aberta pelo ponteiro, ela fecha com a resposta.
    await waitFor(() => expect(previaDo(1038)).toBeNull());
    // O #1038 vai para a coluna de Ana, sem o `chamados.mudaram`.
    await waitFor(() =>
      expect(quadrados(coluna('Ana Souza'))).toEqual([
        '#1031Senha do sistema bloqueadavence em 2 h',
        '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
        '#1041Sem acesso à pasta do Financeiroparado',
      ]),
    );
    expect(quadrados(coluna('Sem responsável'))).toEqual([
      '#1040Toner CF258A acabando no Financeirovence em 5 h',
      '#1042Impressora da Recepção manchandovence em 6 h',
    ]);
    expect(quadro.mock.calls.length).toBe(leituras.quadro + 1);
    expect(prazos.mock.calls.length).toBe(leituras.prazos + 1);

    // "Desfazer", no aviso, manda a versão que o assumir devolveu.
    const doAssumir = screen.getByRole('alertdialog', { name: /Você assumiu o #1038\./ });
    fireEvent.click(within(doAssumir).getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(titulosDosAvisos()).toContain('O #1038 voltou à triagem.'));
    expect(desfez).toEqual([{ versao: 5 }]);
    await waitFor(() =>
      expect(quadrados(coluna('Sem responsável'))[0]).toBe(
        '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
      ),
    );
  });

  it('"Passar para…" na prévia passa à pessoa escolhida, com a versão, e avisa com o primeiro nome', async () => {
    const { servidor, estado } = servidorDoQuadro();
    const passou = acaoNoServidor(servidor, 'POST /api/chamados/1033/passar', () => {
      estado.quadro = passarNoQuadro(estado.quadro, 1033, BRUNO);
      estado.prazos = passarNosPrazos(estado.prazos, 1033, BRUNO);
      return Response.json(depoisDaAcao(1033, 2, 'em-atendimento', BRUNO));
    });
    abrir(servidor);
    await esperarOQuadro();
    pararOMouse(quadradoDo(1033));
    const previa = await waitFor(() => aPreviaDo(1033));
    comOMouse();
    fireEvent.click(within(previa).getByRole('button', { name: 'Bruno Lima, 2 abertos' }));
    await waitFor(() => expect(titulosDosAvisos()).toContain('Você passou o #1033 a Bruno.'));
    expect(passou).toEqual([{ para: BRUNO.conta, versao: 1 }]);
    await waitFor(() => expect(previaDo(1033)).toBeNull());
    await waitFor(() =>
      expect(quadrados(coluna('Bruno Lima'))).toEqual([
        '#1033Switch Rack 2 sem link na porta 3estourado',
        '#1034Controle da portaria não lê o cartãovence em 7 h',
        '#1032Licença do Office expiradaparado',
      ]),
    );
  });

  it('o menu do botão direito e do teclado tem as ações que o chamado aceita, e fecha a prévia', async () => {
    const { servidor, estado } = servidorDoQuadro();
    const devolveu = acaoNoServidor(servidor, 'POST /api/chamados/1033/devolver', () => {
      estado.quadro = passarNoQuadro(estado.quadro, 1033, null);
      estado.prazos = passarNosPrazos(estado.prazos, 1033, null);
      return Response.json(depoisDaAcao(1033, 2, 'triagem', null));
    });
    abrir(servidor);
    await esperarOQuadro();
    // Esc, com o foco no menu, o fecha, e o foco volta ao quadrado sem abrir a prévia, como o Esc
    // da prévia.
    const fecharOMenu = async (numero: number) => {
      // O foco vai ao painel do menu; no navegador, ao primeiro item.
      const painel = screen
        .getByRole('menu', { name: `Ações do #${numero}` })
        .closest('[role="dialog"]');
      await waitFor(() => expect(painel?.contains(document.activeElement)).toBe(true));
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(quadradoDo(numero)));
      await esperar(50);
      expect(previaDo(numero)).toBeNull();
    };

    // O #1041 está com Ana e aguarda Fernanda: o "Abrir o chamado" e o "Passar para…". O clique
    // direito põe o foco no quadrado, sem abrir a prévia.
    clicarComODireito(quadradoDo(1041), 300, 400);
    expect(itensDoMenu(screen.getByRole('menu', { name: 'Ações do #1041' }))).toEqual([
      'Abrir o chamado',
      'Passar para…',
    ]);
    expect(previaDo(1041)).toBeNull();
    await fecharOMenu(1041);

    // Da triagem, pela tecla de menu, com a prévia aberta pelo foco: o menu a fecha.
    act(() => quadradoDo(1038).focus());
    expect(previaDo(1038)).not.toBeNull();
    fireEvent.keyDown(quadradoDo(1038), { key: 'ContextMenu' });
    expect(itensDoMenu(screen.getByRole('menu', { name: 'Ações do #1038' }))).toEqual([
      'Abrir o chamado',
      'Assumir',
      'Passar para…',
    ]);
    expect(previaDo(1038)).toBeNull();
    await fecharOMenu(1038);

    // Em atendimento com Renato, por Shift+F10: as três, com o submenu das mesmas pessoas da prévia.
    act(() => quadradoDo(1033).focus());
    fireEvent.keyDown(quadradoDo(1033), { key: 'F10', shiftKey: true });
    const menu = screen.getByRole('menu', { name: 'Ações do #1033' });
    expect(itensDoMenu(menu)).toEqual([
      'Abrir o chamado',
      'Assumir',
      'Passar para…',
      'Devolver à triagem',
    ]);
    // A linha separa o "Abrir o chamado" das ações.
    expect(within(menu).getAllByRole('separator')).toHaveLength(1);
    const passar = within(menu).getByRole('menuitem', { name: 'Passar para…' });
    act(() => passar.focus());
    fireEvent.keyDown(passar, { key: 'ArrowRight' });
    const submenu = await screen.findByRole('menu', { name: 'Passar para…' });
    expect(itensDoMenu(submenu)).toEqual([
      'Ana Souza2 abertos',
      'Bruno Lima2 abertos',
      'Diego Martins3 abertos',
    ]);

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Devolver à triagem' }));
    await waitFor(() => expect(titulosDosAvisos()).toContain('Você devolveu o #1033 à triagem.'));
    expect(devolveu).toEqual([{ versao: 1 }]);
    await waitFor(() =>
      expect(quadrados(coluna('Sem responsável'))[0]).toBe(
        '#1033Switch Rack 2 sem link na porta 3estourado',
      ),
    );
  });

  it('pelo menu do teclado, a ação leva o foco ao quadrado relido, sem abrir a prévia', async () => {
    const { servidor, estado } = servidorDoQuadro();
    acaoNoServidor(servidor, 'POST /api/chamados/1038/assumir', () => {
      estado.quadro = passarNoQuadro(estado.quadro, 1038, ANA);
      estado.prazos = passarNosPrazos(estado.prazos, 1038, ANA);
      return Response.json(depoisDaAcao(1038, 2, 'em-atendimento', ANA));
    });
    abrir(servidor);
    await esperarOQuadro();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => quadradoDo(1038).focus());
    fireEvent.keyDown(quadradoDo(1038), { key: 'F10', shiftKey: true });
    const menu = screen.getByRole('menu', { name: 'Ações do #1038' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Assumir' }));
    await waitFor(() => expect(titulosDosAvisos()).toContain('Você assumiu o #1038.'));
    await waitFor(() =>
      expect(quadrados(coluna('Ana Souza'))).toContain(
        '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
      ),
    );
    // O quadrado que mudou de coluna é outro elemento: o foco vai a ele, e a prévia, que o menu
    // fechou, continua fechada.
    const daAna = quadradoDo(1038, coluna('Ana Souza'));
    await waitFor(() => expect(document.activeElement).toBe(daAna));
    await esperar(50);
    expect(previaDo(1038)).toBeNull();
  });

  it('pelo menu, com a releitura antes de o foco voltar, o foco vai ao quadrado relido', async () => {
    const { servidor, estado } = servidorDoQuadro();
    acaoNoServidor(servidor, 'POST /api/chamados/1038/assumir', () => {
      estado.quadro = passarNoQuadro(estado.quadro, 1038, ANA);
      estado.prazos = passarNosPrazos(estado.prazos, 1038, ANA);
      return Response.json(depoisDaAcao(1038, 2, 'em-atendimento', ANA));
    });
    abrir(servidor);
    await esperarOQuadro();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => quadradoDo(1038).focus());
    fireEvent.keyDown(quadradoDo(1038), { key: 'F10', shiftKey: true });
    const menu = screen.getByRole('menu', { name: 'Ações do #1038' });
    // O menu devolve o foco na pintura seguinte da tela, que aqui só vem depois da releitura: o
    // quadrado a que ele ia devolver já saiu.
    const pinturas: FrameRequestCallback[] = [];
    const pintura = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((chamar) => pinturas.push(chamar));
    try {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Assumir' }));
      await waitFor(() =>
        expect(quadrados(coluna('Ana Souza'))).toContain(
          '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
        ),
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(quadradoDo(1038, coluna('Ana Souza'))),
      );
    } finally {
      pintura.mockRestore();
    }
    act(() => {
      for (const chamar of pinturas) chamar(0);
    });
    expect(document.activeElement).toBe(quadradoDo(1038, coluna('Ana Souza')));
    await esperar(50);
    expect(previaDo(1038)).toBeNull();
  });

  it('a recusa vai no aviso crítico com a frase da API, a tela relê, e o foco segue o quadrado', async () => {
    const { servidor, estado } = servidorDoQuadro();
    const tentou = acaoNoServidor(servidor, 'POST /api/chamados/1038/assumir', () =>
      mudou(1038, 'assumir'),
    );
    abrir(servidor);
    await esperarOQuadro();
    // Bruno assumiu o #1038 com a tela de Ana aberta, e o evento ainda não chegou a ela.
    estado.quadro = passarNoQuadro(estado.quadro, 1038, BRUNO);
    estado.prazos = passarNosPrazos(estado.prazos, 1038, BRUNO);

    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => quadradoDo(1038).focus());
    fireEvent.click(within(aPreviaDo(1038)).getByRole('button', { name: 'Assumir' }));
    await waitFor(() =>
      expect(titulosDosAvisos()).toContain('O chamado #1038 mudou. Confira antes de assumir.'),
    );
    expect(tentou).toEqual([{ versao: 1 }]);
    expect(avisoDe('O chamado #1038 mudou. Confira antes de assumir.')?.situacao).toBe('critico');
    await waitFor(() =>
      expect(quadrados(coluna('Bruno Lima'))).toContain(
        '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
      ),
    );
    // O quadrado que mudou de coluna é outro elemento, e o foco vai a ele, com a prévia de agora.
    const deBruno = quadradoDo(1038, coluna('Bruno Lima'));
    await waitFor(() => expect(document.activeElement).toBe(deBruno));
    expect(linhasDa(aPreviaDo(1038)).at(-1)).toEqual(['Atende', 'Bruno Lima']);
  });

  it('aberta pelo foco, a prévia fica com a recusa, relida, e o foco fica no botão', async () => {
    const { servidor, quadro, prazos } = servidorDoQuadro();
    const tentou = acaoNoServidor(servidor, 'POST /api/chamados/1033/passar', () =>
      Response.json(
        {
          type: 'urn:grafite:problema:conflito',
          title: 'Conflito',
          status: 409,
          detail: 'Bruno não atende os chamados de Jundiaí › Recepção.',
        },
        { status: 409 },
      ),
    );
    abrir(servidor);
    await esperarOQuadro();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => quadradoDo(1033).focus());
    const bruno = within(aPreviaDo(1033)).getByRole('button', { name: 'Bruno Lima, 2 abertos' });
    const leituras = { quadro: quadro.mock.calls.length, prazos: prazos.mock.calls.length };
    act(() => bruno.focus());
    fireEvent.click(bruno);
    await waitFor(() =>
      expect(titulosDosAvisos()).toContain('Bruno não atende os chamados de Jundiaí › Recepção.'),
    );
    expect(tentou).toEqual([{ para: BRUNO.conta, versao: 1 }]);
    await waitFor(() => {
      expect(quadro.mock.calls.length).toBe(leituras.quadro + 1);
      expect(prazos.mock.calls.length).toBe(leituras.prazos + 1);
    });
    await esperar(50);
    expect(previaDo(1033)).not.toBeNull();
    expect(document.activeElement).toBe(bruno);
  });

  it('enquanto a ação espera, os outros botões ficam desabilitados, e outra escolha não manda pedido', async () => {
    const { servidor } = servidorDoQuadro();
    const presa = respostaPresa(() => depoisDaAcao(1038, 2, 'em-atendimento', ANA));
    const assumiu = acaoNoServidor(
      servidor,
      'POST /api/chamados/1038/assumir',
      () => presa.resposta,
    );
    const passou = acaoNoServidor(servidor, 'POST /api/chamados/1038/passar', () =>
      Response.json(depoisDaAcao(1038, 2, 'em-atendimento', BRUNO)),
    );
    const doSwitch = acaoNoServidor(servidor, 'POST /api/chamados/1033/assumir', () =>
      Response.json(depoisDaAcao(1033, 2, 'em-atendimento', ANA)),
    );
    abrir(servidor);
    await esperarOQuadro();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => quadradoDo(1038).focus());
    const previa = aPreviaDo(1038);
    fireEvent.click(within(previa).getByRole('button', { name: 'Assumir' }));
    await waitFor(() => expect(assumiu).toHaveLength(1));
    const pessoas = within(
      within(previa).getByRole('group', { name: 'Passar para…' }),
    ).getAllByRole('button');
    expect(pessoas.map((botao) => botao.hasAttribute('disabled'))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    fireEvent.click(pessoas[1] as HTMLElement);
    fireEvent.click(within(previa).getByRole('button', { name: /Assumindo/ }));
    // Nem o menu de outro quadrado.
    clicarComODireito(quadradoDo(1033), 300, 400);
    const menu = screen.getByRole('menu', { name: 'Ações do #1033' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Assumir' }));
    await esperar(50);
    expect(assumiu).toHaveLength(1);
    expect(passou).toEqual([]);
    expect(doSwitch).toEqual([]);
    presa.responder();
    await waitFor(() => expect(titulosDosAvisos()).toContain('Você assumiu o #1038.'));
  });

  it('a aberta pelo ponteiro fecha quando outra pessoa muda o quadrado de coluna', async () => {
    const { servidor, estado } = servidorDoQuadro();
    const canal = abrir(servidor);
    await esperarOQuadro();
    pararOMouse(quadradoDo(1038));
    await waitFor(() => aPreviaDo(1038));
    // Bruno assume o #1038 com a prévia aberta na tela de Ana, e o evento chega.
    estado.quadro = passarNoQuadro(estado.quadro, 1038, BRUNO);
    estado.prazos = passarNosPrazos(estado.prazos, 1038, BRUNO);
    await publicarMudanca(canal);
    await waitFor(() =>
      expect(quadrados(coluna('Bruno Lima'))).toContain(
        '#1038Wi-Fi cai na Sala Atlânticovence em 2 h',
      ),
    );
    // O quadrado saiu de baixo do ponteiro: a prévia não vai com ele para a coluna de Bruno.
    expect(previaDo(1038)).toBeNull();
    expect(quadradoDo(1038).hasAttribute('data-aberto')).toBe(false);
  });

  it('a prévia do quadrado que sai do quadro fecha, e ele volta sem ela', async () => {
    const { servidor, estado } = servidorDoQuadro();
    const canal = abrir(servidor);
    await esperarOQuadro();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => quadradoDo(1040).focus());
    expect(previaDo(1040)).not.toBeNull();
    // Outra pessoa resolve o #1040, e ele sai da triagem.
    const comEle = estado.quadro;
    estado.quadro = {
      ...comEle,
      triagem: {
        ...comEle.triagem,
        abertos: comEle.triagem.abertos.filter((numero) => numero !== 1040),
      },
    };
    await publicarMudanca(canal);
    await waitFor(() => expect(screen.queryByRole('article', { name: /^#1040 / })).toBeNull());
    // Reaberto, ele volta sem a prévia.
    estado.quadro = comEle;
    await publicarMudanca(canal);
    await waitFor(() => quadradoDo(1040));
    await esperar(50);
    expect(previaDo(1040)).toBeNull();
  });

  it('a aberta pelo foco acompanha a rolagem e fecha quando o quadrado sai inteiro da área, com o foco nele', async () => {
    const { servidor } = servidorDoQuadro();
    abrir(servidor);
    await esperarOQuadro();
    // A área das colunas vai de 100 a 700 de alto, e o #1040 está nela.
    const area = document.querySelector('[data-coluna]')?.parentElement as HTMLElement;
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(caixa(0, 100, 1024, 600));
    Object.defineProperties(area, {
      clientWidth: { value: 1024, configurable: true },
      clientHeight: { value: 600, configurable: true },
    });
    const toner = quadradoDo(1040);
    const ondeEsta = vi
      .spyOn(toner, 'getBoundingClientRect')
      .mockReturnValue(caixa(20, 150, 112, 92));
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => toner.focus());
    act(() => within(aPreviaDo(1040)).getByRole('button', { name: 'Assumir' }).focus());

    // A rolagem que deixa o quadrado meio fora: ela fica.
    ondeEsta.mockReturnValue(caixa(20, 40, 112, 92));
    fireEvent.scroll(area);
    expect(previaDo(1040)).not.toBeNull();
    // A que tira o quadrado inteiro da área: ela fecha, e o foco que estava nela vai ao quadrado.
    ondeEsta.mockReturnValue(caixa(20, -10, 112, 92));
    fireEvent.scroll(area);
    expect(previaDo(1040)).toBeNull();
    expect(document.activeElement).toBe(toner);
  });

  it('o quadrado sem nenhuma ação tem o menu só com o "Abrir o chamado"', async () => {
    // Numa TI de uma pessoa só, o #1041 aguarda com a própria Ana: ela não assume, não passa e não
    // devolve.
    const { servidor } = servidorDoQuadro({
      quadro: {
        ...QUADRO_DOS_MOCKUPS,
        triagem: { abertos: [], maisAntigo: null },
        colunas: [
          colunaDoQuadro(ANA, [1041], { numero: 1041, abertoEm: sp('2026-11-10T17:05:00') }),
        ],
      },
    });
    abrir(servidor);
    await esperarOQuadro('1 aberto');
    expect(clicarComODireito(quadradoDo(1041), 300, 400)).toBe(false);
    const menu = screen.getByRole('menu', { name: 'Ações do #1041' });
    expect(itensDoMenu(menu)).toEqual(['Abrir o chamado']);
    expect(within(menu).queryByRole('separator')).toBeNull();
  });

  it('a quem só vê os chamados, a prévia vai sem as ações, e o menu só abre o chamado', async () => {
    const { servidor } = servidorDoQuadro();
    // A ficha fica carregando: basta o título do chamado aberto.
    servidor['GET /api/chamados/1033'] = () => new Promise<Response>(() => {});
    abrir(servidor, { permissoes: naOrganizacao('chamados.ver') });
    await esperarOQuadro();
    act(() => quadradoDo(1033).focus());
    const previa = aPreviaDo(1033);
    expect(linhasDa(previa)).toHaveLength(3);
    expect(within(previa).queryByRole('button')).toBeNull();
    expect(within(previa).queryByText('Passar para…')).toBeNull();
    fireEvent.contextMenu(quadradoDo(1033));
    const menu = screen.getByRole('menu', { name: 'Ações do #1033' });
    expect(itensDoMenu(menu)).toEqual(['Abrir o chamado']);
    expect(within(menu).queryByRole('separator')).toBeNull();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Abrir o chamado' }));
    await screen.findByRole('heading', { level: 1, name: '#1033' });
  });

  it('o Enter e o clique no quadrado abrem o chamado', async () => {
    const { servidor } = servidorDoQuadro();
    servidor['GET /api/chamados/1033'] = () => new Promise<Response>(() => {});
    servidor['GET /api/chamados/1041'] = () => new Promise<Response>(() => {});
    abrir(servidor);
    await esperarOQuadro();
    act(() => quadradoDo(1033).focus());
    fireEvent.keyDown(quadradoDo(1033), { key: 'Enter' });
    await screen.findByRole('heading', { level: 1, name: '#1033' });

    cleanup();
    abrir(servidor);
    await esperarOQuadro();
    fireEvent.click(quadradoDo(1041));
    await screen.findByRole('heading', { level: 1, name: '#1041' });
  });
});
