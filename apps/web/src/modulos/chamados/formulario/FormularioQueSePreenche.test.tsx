// O formulário que se preenche (spec modulo-chamados, "Formulário que se preenche"; change
// chamados-da-ti, design, decisão 21): uma peça só para a gaveta da abertura, os "Campos do tipo"
// do chamado aberto e a prévia do colaborador, com os campos que a condição mostra, as sugestões
// do Ativo e do Local pela pessoa, os anexos enviados antes da gravação e as recusas no campo.
import {
  type CampoDoFormulario,
  type Formulario,
  RECUSA_DO_FORMULARIO,
  TIPOS_DE_CHAMADO_DE_FABRICA,
} from '@grafite/domain';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { ProvedorDaSessao } from '../../../sessao/useSessao.tsx';
import { abrirEscolhaDeLocal, escolherLocal, nomeDaOpcao } from '../../../teste/escolhas.ts';
import { comApi } from '../../../teste/provedores.tsx';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { ESTADO_VAZIO, type EstadoDoFormulario, type QuemPreenche } from './estado.ts';
import { FormularioQueSePreenche } from './FormularioQueSePreenche.tsx';

afterEach(cleanup);

function formularioDe(nome: string): Formulario {
  const tipo = TIPOS_DE_CHAMADO_DE_FABRICA.find((deFabrica) => deFabrica.nome === nome);
  if (!tipo) throw new Error(`Sem o tipo de fábrica ${nome}.`);
  return tipo.formulario;
}

const IMPRESSORA = formularioDe('Impressora');

const campo = (
  id: string,
  tipo: CampoDoFormulario['tipo'],
  rotulo: string,
  parte: Partial<CampoDoFormulario> = {},
): CampoDoFormulario => ({
  id,
  tipo,
  rotulo,
  nomeNoResumo: null,
  obrigatorio: false,
  soDaTi: false,
  apagarSeSumir: true,
  opcoes: [],
  tiposDeAtivo: [],
  condicao: [],
  ...parte,
});

const formularioCom = (...campos: CampoDoFormulario[]): Formulario => ({
  titulo: { comecaPeloTipo: true, campoId: null },
  campos,
});

const MARINA = { id: 'p-marina', nome: 'Marina Lopes' };

const PAT_00139 = {
  id: 'a-139',
  rotulo: 'Impressora Recepção 2º andar',
  patrimonio: 'PAT-00139',
  tipoId: 't-impressora',
  motivo: 'responsavel',
} as const;
const PAT_00140 = {
  id: 'a-140',
  rotulo: 'Impressora Recepção térreo',
  patrimonio: 'PAT-00140',
  tipoId: 't-impressora',
  motivo: 'local',
} as const;

const SUGESTOES = {
  local: { id: 'l-recepcao', nome: 'Jundiaí › Recepção' },
  ativos: [PAT_00139, PAT_00140],
};

const ARVORE = {
  locais: [
    { id: 'l-jundiai', paiId: null, nome: 'Jundiaí', tipo: 'unidade', situacao: 'ativo' },
    { id: 'l-recepcao', paiId: 'l-jundiai', nome: 'Recepção', tipo: 'setor', situacao: 'ativo' },
    { id: 'l-rh', paiId: 'l-jundiai', nome: 'RH', tipo: 'setor', situacao: 'ativo' },
  ].map((local) => ({ ...local, permite: { editar: true } })),
  permite: { cadastrarNaRaiz: true },
};

const ativosNaBusca = (...itens: { id: string; rotulo: string; patrimonio: string | null }[]) =>
  Response.json({ itens, proximo: null, total: itens.length, permite: { cadastrar: true } });

interface Desenho {
  formulario?: Formulario;
  quem?: QuemPreenche;
  pessoa?: { id: string; nome: string } | null;
  numero?: number;
  soLeitura?: boolean;
  erros?: Record<string, string>;
  inicial?: EstadoDoFormulario;
  permissoes?: PermissaoDaSessao[];
  servidor?: ServidorDeTeste;
  /** Na StrictMode, como o app: os efeitos montam, desmontam e montam de novo. */
  estrito?: boolean;
  visual?: 'tela' | 'aba';
}

/**
 * A peça com o estado de quem a usa, que o teste lê depois de cada mudança e também muda de fora,
 * como quem usa a peça depois de gravar.
 */
function desenhar({
  formulario = IMPRESSORA,
  quem = 'abertura',
  pessoa = MARINA,
  inicial = ESTADO_VAZIO,
  permissoes = naOrganizacao('chamados.atender', 'chamados.configurar', 'ativos.ver'),
  servidor = {},
  estrito = false,
  ...resto
}: Desenho = {}) {
  const visto = {
    estado: inicial,
    definir: (_estado: EstadoDoFormulario) => {},
    /** O tipo trocado na gaveta, com a peça na tela. */
    trocarFormulario: (_formulario: Formulario) => {},
    /** Quantas mudanças a peça pediu, também depois de desmontada. */
    mudancas: 0,
  };
  const Api = comApi(servidor);
  function Teste() {
    const [estado, definirEstado] = useState(inicial);
    const [atual, definirFormulario] = useState(formulario);
    visto.estado = estado;
    visto.definir = definirEstado;
    visto.trocarFormulario = definirFormulario;
    return (
      <FormularioQueSePreenche
        formulario={atual}
        quem={quem}
        pessoa={pessoa}
        estado={estado}
        aoMudar={(mudar) => {
          visto.mudancas += 1;
          definirEstado(mudar);
        }}
        {...resto}
      />
    );
  }
  render(
    <ProvedorDaSessao loja={sessaoAtiva(permissoes)}>
      <Api>
        <Teste />
      </Api>
    </ProvedorDaSessao>,
    { reactStrictMode: estrito },
  );
  return visto;
}

const camposNaTela = () =>
  [...document.querySelectorAll<HTMLElement>('[data-campo]')].map(
    (elemento) => elemento.dataset.campo,
  );

function campoNaTela(id: string): HTMLElement {
  const elemento = document.querySelector<HTMLElement>(`[data-campo="${id}"]`);
  if (!elemento) throw new Error(`O campo ${id} não está na tela.`);
  return elemento;
}

async function escolherNaSelecao(rotulo: RegExp, opcao: string) {
  fireEvent.click(screen.getByRole('button', { name: rotulo }));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

const nomesNaLista = () => screen.getAllByRole('option').map(nomeDaOpcao);

/** Abre a lista da busca pelo clique no campo, quando as opções já chegaram. */
async function abrirABusca(rotulo: string) {
  const busca = screen.getByRole('combobox', { name: rotulo });
  await waitFor(() => {
    fireEvent.click(busca);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
  return nomesNaLista();
}

function escolherNaBusca(nome: string) {
  const opcao = screen.getAllByRole('option').find((achada) => nomeDaOpcao(achada) === nome);
  if (!opcao) throw new Error(`Sem a opção ${nome}.`);
  fireEvent.click(opcao);
}

function digitar(rotulo: string, texto: string) {
  const busca = screen.getByRole('combobox', { name: rotulo });
  busca.focus();
  fireEvent.change(busca, { target: { value: texto } });
}

function anexar(id: string, ...arquivos: File[]) {
  const entrada = campoNaTela(id).querySelector<HTMLInputElement>('input[type="file"]');
  if (!entrada) throw new Error(`O campo ${id} não anexa.`);
  fireEvent.change(entrada, { target: { files: arquivos } });
}

const arquivo = (nome: string, bytes = 5) =>
  new File([new Uint8Array(bytes)], nome, { type: 'image/png' });

const enviado = (id: string, nome: string, bytes = 5) =>
  Response.json({ id, nome, tipo: 'image/png', bytes }, { status: 201 });

describe('os campos que aparecem', () => {
  it('na abertura, os que a condição mostra, na ordem, com os só da TI explicados', async () => {
    desenhar({ servidor: { 'GET /api/chamados/sugestoes': () => Response.json(SUGESTOES) } });
    expect(camposNaTela()).toEqual([
      'impressora',
      'problema',
      'foto',
      'contador-de-paginas',
      'contrato-de-manutencao',
    ]);
    expect(screen.getByRole('combobox', { name: 'Qual impressora?' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Contador de páginas' })).toBeTruthy();
    expect(within(campoNaTela('contador-de-paginas')).getByText('Só a TI vê.')).toBeTruthy();
    expect(within(campoNaTela('contrato-de-manutencao')).getByText('Só a TI vê.')).toBeTruthy();
    expect(within(campoNaTela('problema')).queryByText(/Só a TI vê/)).toBeNull();
  });

  it('a resposta mostra o campo que depende dela logo depois, e a troca o tira, com a resposta', async () => {
    const visto = desenhar({
      servidor: { 'GET /api/chamados/sugestoes': () => Response.json(SUGESTOES) },
    });
    await escolherNaSelecao(/O que está acontecendo\?/, 'Manchando');
    expect(camposNaTela().slice(0, 4)).toEqual(['impressora', 'problema', 'manchas', 'foto']);
    await escolherNaSelecao(/Onde as manchas aparecem\?/, 'Na borda');
    expect(visto.estado.respostas).toEqual({ problema: 'manchando', manchas: 'borda' });

    await escolherNaSelecao(/O que está acontecendo\?/, 'Atolando');
    expect(camposNaTela()).not.toContain('manchas');
    expect(visto.estado.respostas).toEqual({ problema: 'atolando' });
  });

  it('a escolha exigida não oferece "Nenhum", e o Sim ou não só da TI, opcional na abertura, sim', async () => {
    const visto = desenhar({
      servidor: { 'GET /api/chamados/sugestoes': () => Response.json(SUGESTOES) },
    });
    fireEvent.click(screen.getByRole('button', { name: /O que está acontecendo\?/ }));
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Manchando',
      'Não puxa o papel',
      'Atolando',
      'Não imprime',
    ]);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Contrato de manutenção/ }));
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Nenhum',
      'Sim',
      'Não',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Não' }));
    expect(visto.estado.respostas).toEqual({ 'contrato-de-manutencao': false });
    await escolherNaSelecao(/Contrato de manutenção/, 'Sim');
    expect(visto.estado.respostas).toEqual({ 'contrato-de-manutencao': true });
    await escolherNaSelecao(/Contrato de manutenção/, 'Nenhum');
    expect(visto.estado.respostas).toEqual({});
  });

  it('para a pessoa, na prévia, sem os campos só da TI', () => {
    desenhar({
      quem: 'pessoa',
      servidor: { 'GET /api/chamados/tipos/sugestoes': () => Response.json(SUGESTOES) },
    });
    expect(camposNaTela()).toEqual(['impressora', 'problema', 'foto']);
    expect(screen.queryByText(/Só a TI vê/)).toBeNull();
  });

  it('no chamado aberto, as respostas da pessoa só para ler, com "Sem resposta", e os só da TI para preencher', () => {
    const visto = desenhar({
      quem: 'chamado',
      numero: 1042,
      inicial: {
        respostas: { impressora: 'a-139', problema: 'manchando', manchas: 'borda' },
        citados: {
          ...ESTADO_VAZIO.citados,
          ativos: new Map([['a-139', { patrimonio: 'PAT-00139', rotulo: PAT_00139.rotulo }]]),
        },
      },
    });
    const problema = campoNaTela('problema');
    expect(within(problema).getByText('O que está acontecendo?')).toBeTruthy();
    expect(within(problema).getByText('Manchando')).toBeTruthy();
    expect(within(problema).queryByRole('button')).toBeNull();
    expect(within(campoNaTela('manchas')).getByText('Na borda')).toBeTruthy();
    expect(
      within(campoNaTela('impressora')).getByText('Impressora Recepção 2º andar · PAT-00139'),
    ).toBeTruthy();
    expect(within(campoNaTela('foto')).getByText('Sem resposta')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Anexar arquivos' })).toBeNull();

    const contador = within(campoNaTela('contador-de-paginas'));
    expect(contador.getByText('Só a TI vê.')).toBeTruthy();
    fireEvent.change(contador.getByRole('textbox', { name: 'Contador de páginas' }), {
      target: { value: '12.500' },
    });
    expect(visto.estado.respostas['contador-de-paginas']).toBe(12_500);
  });

  it('só para ler, a quem vê o chamado sem atender, nada muda', () => {
    desenhar({
      quem: 'chamado',
      numero: 1042,
      soLeitura: true,
      inicial: {
        respostas: { problema: 'nao-imprime', 'contador-de-paginas': 48_210 },
        citados: ESTADO_VAZIO.citados,
      },
      erros: { 'campos.problema': 'Escolha uma das opções.' },
    });
    const contador = within(campoNaTela('contador-de-paginas'));
    expect(contador.getByText('48.210')).toBeTruthy();
    expect(contador.getByText('Só a TI vê.')).toBeTruthy();
    expect(within(campoNaTela('contrato-de-manutencao')).getByText('Sem resposta')).toBeTruthy();
    expect(within(campoNaTela('problema')).getByText('Escolha uma das opções.')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('o só da TI obrigatório não é exigido na abertura: oferece "Nenhum", sem a marca de obrigatório', async () => {
    const visto = desenhar({
      formulario: formularioCom(
        campo('problema', 'escolha-unica', 'O que está acontecendo?', {
          obrigatorio: true,
          opcoes: [{ id: 'atolando', texto: 'Atolando' }],
        }),
        campo('diagnostico', 'escolha-unica', 'Diagnóstico', {
          obrigatorio: true,
          soDaTi: true,
          opcoes: [{ id: 'rolete', texto: 'Rolete gasto' }],
        }),
      ),
    });
    expect(within(campoNaTela('problema')).getByText('obrigatório')).toBeTruthy();
    const diagnostico = within(campoNaTela('diagnostico'));
    expect(diagnostico.queryByText('obrigatório')).toBeNull();
    expect(diagnostico.getByText('Só a TI vê. A resposta é exigida para resolver.')).toBeTruthy();
    fireEvent.click(diagnostico.getByRole('button', { name: /Diagnóstico/ }));
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Nenhum',
      'Rolete gasto',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Rolete gasto' }));
    expect(visto.estado.respostas).toEqual({ diagnostico: 'rolete' });
  });

  it('as Várias opções e o Anexo exigidos têm a marca de obrigatório, como os outros campos', () => {
    desenhar({
      formulario: formularioCom(
        campo('pecas', 'varias-opcoes', 'O que não funciona?', {
          obrigatorio: true,
          opcoes: [{ id: 'tela', texto: 'Tela' }],
        }),
        campo('extras', 'varias-opcoes', 'O que mais?', {
          opcoes: [{ id: 'som', texto: 'Som' }],
        }),
        campo('print', 'anexo', 'Print do erro', { obrigatorio: true }),
      ),
    });
    expect(within(campoNaTela('pecas')).getByText('obrigatório')).toBeTruthy();
    expect(within(campoNaTela('extras')).queryByText('obrigatório')).toBeNull();
    expect(within(campoNaTela('print')).getByText('obrigatório')).toBeTruthy();
    // Os grupos não anunciam a obrigatoriedade pelo controle: a marca entra no nome lido.
    expect(screen.getByRole('group', { name: 'O que não funciona? obrigatório' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'O que mais?' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Print do erro obrigatório' })).toBeTruthy();
    // O espaço antes da marca é do texto do rótulo: o happy-dom separa os filhos no nome, e o
    // navegador, só pelo estilo.
    const textoDoRotulo = (nome: string) => {
      const grupo = screen.getByRole('group', { name: nome });
      return document.getElementById(grupo.getAttribute('aria-labelledby') ?? '')?.textContent;
    };
    expect(textoDoRotulo('O que não funciona? obrigatório')).toBe(
      'O que não funciona? obrigatório',
    );
    expect(textoDoRotulo('Print do erro obrigatório')).toBe('Print do erro obrigatório');
  });
});

describe('o campo Ativo', () => {
  it('sugere os ativos da pessoa antes de digitar, sob a origem, e guarda o escolhido com o patrimônio', async () => {
    const pedidos: URLSearchParams[] = [];
    const buscas: string[] = [];
    const visto = desenhar({
      servidor: {
        'GET /api/chamados/sugestoes': (pedido) => {
          pedidos.push(new URL(pedido.url).searchParams);
          return Response.json(SUGESTOES);
        },
        'GET /api/ativos': (pedido) => {
          buscas.push(new URL(pedido.url).searchParams.get('busca') ?? '');
          return ativosNaBusca();
        },
      },
    });
    expect(await abrirABusca('Qual impressora?')).toEqual([
      'Impressora Recepção 2º andar · PAT-00139',
      'Impressora Recepção térreo · PAT-00140',
    ]);
    expect(screen.getByText('de Marina Lopes e do local de trabalho')).toBeTruthy();
    expect(pedidos[0]?.get('pessoa')).toBe('p-marina');
    expect(pedidos[0]?.has('tipos')).toBe(false);
    expect(buscas).toEqual([]);

    escolherNaBusca('Impressora Recepção 2º andar · PAT-00139');
    expect(visto.estado.respostas).toEqual({ impressora: 'a-139' });
    expect(visto.estado.citados.ativos.get('a-139')).toEqual({
      patrimonio: 'PAT-00139',
      rotulo: 'Impressora Recepção 2º andar',
    });
  });

  it('busca pelo texto entre os ativos que a conta vê, só dos tipos do campo, com as sugeridas no alto', async () => {
    const pedidos: URLSearchParams[] = [];
    const filtros: unknown[] = [];
    const formulario = formularioCom(
      campo('impressora', 'ativo', 'Qual impressora?', {
        tiposDeAtivo: ['t-impressora', 't-multifuncional'],
      }),
    );
    desenhar({
      formulario,
      servidor: {
        'GET /api/chamados/sugestoes': (pedido) => {
          pedidos.push(new URL(pedido.url).searchParams);
          return Response.json({ local: null, ativos: [PAT_00140] });
        },
        'GET /api/ativos': (pedido) => {
          const parametros = new URL(pedido.url).searchParams;
          filtros.push(JSON.parse(parametros.get('filtros') ?? 'null'));
          return parametros.get('busca') === 'recep'
            ? ativosNaBusca(
                { id: 'a-200', rotulo: 'Impressora Recepção 3º andar', patrimonio: 'PAT-00200' },
                PAT_00140,
              )
            : ativosNaBusca();
        },
      },
    });
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0]?.get('tipos')).toBe('t-impressora,t-multifuncional');
    expect(screen.getByRole('combobox', { name: 'Qual impressora?' })).toBeTruthy();

    digitar('Qual impressora?', 'recep');
    await waitFor(() =>
      expect(nomesNaLista()).toEqual([
        'Impressora Recepção térreo · PAT-00140',
        'Impressora Recepção 3º andar · PAT-00200',
      ]),
    );
    expect(filtros.at(-1)).toEqual([
      { chave: 'ativo.tipo', operador: 'qualquer', valores: ['t-impressora', 't-multifuncional'] },
    ]);
    expect(screen.getByText('do local de trabalho de Marina Lopes')).toBeTruthy();

    // As sugestões vêm uma vez: o texto que muda não as pede de novo.
    digitar('Qual impressora?', 'recepcao');
    await waitFor(() => expect(filtros).toHaveLength(2));
    expect(pedidos).toHaveLength(1);
  });

  it('sem a pessoa do chamado, não há sugestão: a lista abre com os primeiros ativos', async () => {
    const pedidos: string[] = [];
    desenhar({
      pessoa: null,
      servidor: {
        'GET /api/chamados/sugestoes': () => {
          pedidos.push('sugestoes');
          return Response.json(SUGESTOES);
        },
        'GET /api/ativos': () =>
          ativosNaBusca({ id: 'a-300', rotulo: 'Impressora do RH', patrimonio: null }),
      },
    });
    expect(await abrirABusca('Qual impressora?')).toEqual(['Impressora do RH']);
    expect(screen.queryByText('Sugeridos')).toBeNull();
    expect(pedidos).toEqual([]);
  });

  it('a quem não vê os ativos, o campo diz "Você não vê os ativos." no lugar da busca, e o exigido diz a saída', () => {
    desenhar({ permissoes: naOrganizacao('chamados.atender') });
    const impressora = within(campoNaTela('impressora'));
    expect(impressora.getByText('Qual impressora?')).toBeTruthy();
    expect(
      impressora.getByText('Você não vê os ativos. Quem vê os ativos pode abrir este chamado.'),
    ).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('a quem não vê os ativos, o campo também tem a marca, a explicação e a recusa', () => {
    desenhar({
      permissoes: naOrganizacao('chamados.atender'),
      formulario: formularioCom(
        campo('impressora', 'ativo', 'Qual impressora?', { obrigatorio: true }),
        campo('trocado', 'ativo', 'Equipamento trocado', { obrigatorio: true, soDaTi: true }),
      ),
      erros: { 'campos.impressora': 'Responda esta pergunta.' },
    });
    const impressora = within(campoNaTela('impressora'));
    expect(impressora.getByText('obrigatório')).toBeTruthy();
    expect(impressora.getByText('Responda esta pergunta.')).toBeTruthy();
    const trocado = within(campoNaTela('trocado'));
    expect(trocado.getByText('Você não vê os ativos.')).toBeTruthy();
    expect(trocado.getByText('Só a TI vê. A resposta é exigida para resolver.')).toBeTruthy();
    expect(trocado.queryByText('obrigatório')).toBeNull();
  });

  it('no chamado aberto, a quem não vê os ativos, a resposta que já existe aparece só com a falta, e o exigido sem resposta diz a saída', () => {
    desenhar({
      quem: 'chamado',
      permissoes: naOrganizacao('chamados.atender'),
      formulario: formularioCom(
        campo('impressora', 'ativo', 'Qual impressora?', { obrigatorio: true }),
        // Exigido e respondido: a saída não aparece.
        campo('trocado', 'ativo', 'Equipamento trocado', { obrigatorio: true, soDaTi: true }),
        campo('reserva', 'ativo', 'Equipamento de reserva', { obrigatorio: true, soDaTi: true }),
      ),
      inicial: {
        respostas: { impressora: 'a-139', trocado: 'a-140' },
        citados: {
          ...ESTADO_VAZIO.citados,
          ativos: new Map([
            ['a-139', { rotulo: 'Impressora Recepção 2º andar', patrimonio: 'PAT-00139' }],
            ['a-140', { rotulo: 'Impressora Recepção térreo', patrimonio: 'PAT-00140' }],
          ]),
        },
      },
    });
    expect(
      within(campoNaTela('impressora')).getByText('Impressora Recepção 2º andar · PAT-00139'),
    ).toBeTruthy();
    const trocado = within(campoNaTela('trocado'));
    expect(trocado.getByText('Impressora Recepção térreo · PAT-00140')).toBeTruthy();
    expect(trocado.getByText('Você não vê os ativos.')).toBeTruthy();
    expect(
      within(campoNaTela('reserva')).getByText(
        'Você não vê os ativos. Quem vê os ativos pode responder este campo.',
      ),
    ).toBeTruthy();
  });

  it('a falha das sugestões não derruba a busca: o Ativo segue pelo texto', async () => {
    desenhar({
      servidor: {
        'GET /api/chamados/sugestoes': () => Response.json({}, { status: 500 }),
        'GET /api/ativos': () =>
          ativosNaBusca({ id: 'a-300', rotulo: 'Impressora do RH', patrimonio: null }),
      },
    });
    expect(await abrirABusca('Qual impressora?')).toEqual(['Impressora do RH']);
  });

  it('na prévia, as sugestões vêm pela rota de quem configura', async () => {
    const pedidos: string[] = [];
    desenhar({
      quem: 'pessoa',
      permissoes: naOrganizacao('chamados.configurar', 'ativos.ver'),
      servidor: {
        'GET /api/chamados/tipos/sugestoes': (pedido) => {
          pedidos.push(new URL(pedido.url).searchParams.get('pessoa') ?? '');
          return Response.json(SUGESTOES);
        },
      },
    });
    expect(await abrirABusca('Qual impressora?')).toHaveLength(2);
    expect(pedidos).toEqual(['p-marina']);
  });
});

describe('os campos Local e Pessoa', () => {
  const ONDE = formularioCom(
    campo('onde', 'local', 'Onde você está?', { obrigatorio: true }),
    campo('quem-usa', 'pessoa', 'Quem usa o computador?'),
  );

  it('o Local sugere o local de trabalho da pessoa e guarda o caminho do escolhido', async () => {
    const visto = desenhar({
      formulario: ONDE,
      servidor: {
        'GET /api/locais': () => Response.json(ARVORE),
        'GET /api/chamados/sugestoes': () => Response.json(SUGESTOES),
      },
    });
    const painel = await abrirEscolhaDeLocal('Onde você está?');
    const sugerido = await within(painel).findByRole('button', { name: /Jundiaí › Recepção/ });
    expect(sugerido.textContent).toContain('Sugerido: local de trabalho de Marina Lopes');
    fireEvent.click(sugerido);
    expect(visto.estado.respostas).toEqual({ onde: 'l-recepcao' });
    expect(visto.estado.citados.locais.get('l-recepcao')).toBe('Jundiaí › Recepção');

    await escolherLocal('Onde você está?', 'Jundiaí › RH');
    expect(visto.estado.respostas).toEqual({ onde: 'l-rh' });
    expect(visto.estado.citados.locais.get('l-rh')).toBe('Jundiaí › RH');
  });

  it('o Local e o Ativo dos tipos do campo pedem as sugestões cada um com os seus tipos', async () => {
    const tipos: (string | null)[] = [];
    desenhar({
      formulario: formularioCom(
        campo('onde', 'local', 'Onde você está?'),
        campo('impressora', 'ativo', 'Qual impressora?', { tiposDeAtivo: ['t-impressora'] }),
      ),
      servidor: {
        'GET /api/locais': () => Response.json(ARVORE),
        'GET /api/chamados/sugestoes': (pedido) => {
          const doCampo = new URL(pedido.url).searchParams.get('tipos');
          tipos.push(doCampo);
          return Response.json(doCampo === null ? { ...SUGESTOES, ativos: [] } : SUGESTOES);
        },
      },
    });
    await waitFor(() => expect(tipos.toSorted()).toEqual([null, 't-impressora']));
    expect(await abrirABusca('Qual impressora?')).toEqual([
      'Impressora Recepção 2º andar · PAT-00139',
      'Impressora Recepção térreo · PAT-00140',
    ]);
  });

  it('a Pessoa se busca pelo nome, com o local de cada uma, e guarda só o nome', async () => {
    const buscas: string[] = [];
    const visto = desenhar({
      formulario: ONDE,
      servidor: {
        'GET /api/locais': () => Response.json(ARVORE),
        'GET /api/chamados/sugestoes': () => Response.json(SUGESTOES),
        'GET /api/chamados/pessoas': (pedido) => {
          const busca = new URL(pedido.url).searchParams.get('busca') ?? '';
          buscas.push(busca);
          return Response.json({
            itens:
              busca === 'ana'
                ? [
                    { id: 'p-ana-rh', nome: 'Ana Souza', local: 'Jundiaí › RH' },
                    { id: 'p-ana', nome: 'Ana Souza', local: null },
                  ]
                : [],
            total: busca === 'ana' ? 2 : 0,
          });
        },
      },
    });
    digitar('Quem usa o computador?', 'ana');
    await waitFor(() => expect(nomesNaLista()).toEqual(['Ana Souza · Jundiaí › RH', 'Ana Souza']));
    escolherNaBusca('Ana Souza · Jundiaí › RH');
    expect(visto.estado.respostas).toEqual({ 'quem-usa': 'p-ana-rh' });
    expect(visto.estado.citados.pessoas.get('p-ana-rh')).toBe('Ana Souza');
    // Sem o texto, como ao abrir e depois da escolha, a busca não pede: a API exige o nome.
    expect(buscas).toEqual(['ana']);
  });

  it('na prévia, a Pessoa se busca pela rota de quem configura', async () => {
    const buscas: string[] = [];
    desenhar({
      formulario: ONDE,
      quem: 'pessoa',
      servidor: {
        'GET /api/locais': () => Response.json(ARVORE),
        'GET /api/chamados/tipos/sugestoes': () => Response.json(SUGESTOES),
        'GET /api/chamados/tipos/pessoas': (pedido) => {
          buscas.push(new URL(pedido.url).searchParams.get('busca') ?? '');
          return Response.json({
            itens: [{ id: 'p-ana', nome: 'Ana Souza', local: null }],
            total: 1,
          });
        },
      },
    });
    digitar('Quem usa o computador?', 'ana');
    await waitFor(() => expect(nomesNaLista()).toEqual(['Ana Souza']));
    expect(buscas).toContain('ana');
  });
});

describe('as outras respostas', () => {
  it('o Número aceita só os algarismos: os pontos de milhar saem, e outro caractere não entra', () => {
    const visto = desenhar({
      servidor: { 'GET /api/chamados/sugestoes': () => Response.json(SUGESTOES) },
    });
    const contador = screen.getByRole('textbox', {
      name: 'Contador de páginas',
    }) as HTMLInputElement;
    expect(contador.inputMode).toBe('numeric');
    fireEvent.change(contador, { target: { value: '48.210' } });
    expect(visto.estado.respostas['contador-de-paginas']).toBe(48_210);
    expect(contador.value).toBe('48.210');

    fireEvent.change(contador, { target: { value: '48.210,5' } });
    expect(visto.estado.respostas['contador-de-paginas']).toBe(48_210);
    expect(contador.value).toBe('48.210');

    fireEvent.change(contador, { target: { value: '' } });
    expect(visto.estado.respostas).toEqual({});
  });

  it('o Número começa pela resposta guardada e acompanha a que muda de fora', () => {
    const visto = desenhar({
      quem: 'chamado',
      numero: 1042,
      inicial: { respostas: { 'contador-de-paginas': 48_210 }, citados: ESTADO_VAZIO.citados },
    });
    const contador = screen.getByRole('textbox', {
      name: 'Contador de páginas',
    }) as HTMLInputElement;
    expect(contador.value).toBe('48.210');
    act(() => visto.definir({ respostas: {}, citados: ESTADO_VAZIO.citados }));
    expect(contador.value).toBe('');
    act(() =>
      visto.definir({
        respostas: { 'contador-de-paginas': 12_500 },
        citados: ESTADO_VAZIO.citados,
      }),
    );
    expect(contador.value).toBe('12.500');
  });

  it('a Data, as Várias opções e os textos vão para a resposta no tipo do campo', () => {
    const OPCOES = [
      { id: 'teclado', texto: 'Teclado' },
      { id: 'mouse', texto: 'Mouse' },
      { id: 'monitor', texto: 'Monitor' },
    ];
    const visto = desenhar({
      formulario: formularioCom(
        campo('desde', 'data', 'Desde quando?'),
        campo('pecas', 'varias-opcoes', 'O que não funciona?', { opcoes: OPCOES }),
        campo('sala', 'texto-curto', 'Qual sala?'),
        campo('detalhes', 'texto-longo', 'Quer contar mais?'),
      ),
      inicial: { respostas: { desde: '2026-11-17' }, citados: ESTADO_VAZIO.citados },
    });
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: /^dia/ }), { key: 'ArrowUp' });
    expect(visto.estado.respostas.desde).toBe('2026-11-18');

    const pecas = within(screen.getByRole('group', { name: 'O que não funciona?' }));
    fireEvent.click(pecas.getByRole('checkbox', { name: 'Monitor' }));
    fireEvent.click(pecas.getByRole('checkbox', { name: 'Teclado' }));
    expect(visto.estado.respostas.pecas).toEqual(['teclado', 'monitor']);

    fireEvent.change(screen.getByRole('textbox', { name: 'Qual sala?' }), {
      target: { value: 'Sala 3' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Quer contar mais?' }), {
      target: { value: 'O monitor pisca.' },
    });
    expect(visto.estado.respostas).toEqual({
      desde: '2026-11-18',
      pecas: ['teclado', 'monitor'],
      sala: 'Sala 3',
      detalhes: 'O monitor pisca.',
    });
  });
});

describe('o campo Anexo', () => {
  const sugestoes = { 'GET /api/chamados/sugestoes': () => Response.json(SUGESTOES) };

  it('envia o arquivo na hora, antes da gravação, e o mostra com o nome, o tamanho e o download', async () => {
    const envios: { nome: string | null; tipo: string | null; bytes: number }[] = [];
    const visto = desenhar({
      servidor: {
        ...sugestoes,
        'POST /api/chamados/anexos': async (pedido) => {
          envios.push({
            nome: new URL(pedido.url).searchParams.get('nome'),
            tipo: pedido.headers.get('content-type'),
            bytes: (await pedido.arrayBuffer()).byteLength,
          });
          return enviado('f-1', 'erro-vpn.png', 48_213);
        },
      },
    });
    anexar('foto', arquivo('erro-vpn.png', 48_213));
    const foto = within(campoNaTela('foto'));
    expect(await foto.findByText('erro-vpn.png')).toBeTruthy();
    expect(foto.getByText('47 KB')).toBeTruthy();
    expect(foto.getByRole('link', { name: 'Baixar erro-vpn.png' }).getAttribute('href')).toBe(
      '/api/chamados/anexos/f-1',
    );
    expect(envios).toEqual([
      { nome: 'erro-vpn.png', tipo: 'application/octet-stream', bytes: 48_213 },
    ]);
    expect(visto.estado.respostas).toEqual({ foto: ['f-1'] });
    expect(visto.estado.citados.anexos.get('f-1')).toEqual({
      nome: 'erro-vpn.png',
      bytes: 48_213,
      onde: 'sem-dono',
    });
  });

  it('os arquivos vão um a um, e o que espera diz "Na fila"', async () => {
    const envios: string[] = [];
    let liberar: (() => void) | undefined;
    const visto = desenhar({
      servidor: {
        ...sugestoes,
        'POST /api/chamados/anexos': (pedido) => {
          const nome = new URL(pedido.url).searchParams.get('nome') ?? '';
          envios.push(nome);
          const resposta = enviado(`f-${nome}`, nome);
          if (envios.length > 1) return resposta;
          return new Promise<Response>((pronto) => {
            liberar = () => pronto(resposta);
          });
        },
      },
    });
    anexar('foto', arquivo('a.png'), arquivo('b.png'));
    await waitFor(() => expect(envios).toEqual(['a.png']));
    const foto = within(campoNaTela('foto'));
    expect(foto.getByRole('progressbar', { name: 'Enviando a.png' })).toBeTruthy();
    expect(foto.getByText('b.png')).toBeTruthy();
    expect(foto.getByText('Na fila')).toBeTruthy();
    expect(envios).toEqual(['a.png']);

    liberar?.();
    await waitFor(() => expect(visto.estado.respostas).toEqual({ foto: ['f-a.png', 'f-b.png'] }));
    expect(envios).toEqual(['a.png', 'b.png']);
    expect(foto.queryByText('Na fila')).toBeNull();
    expect(foto.queryByRole('progressbar')).toBeNull();
  });

  it('o escolhido durante um envio espera a vez, sem enviar de novo o que vai', async () => {
    const envios: string[] = [];
    let liberar: (() => void) | undefined;
    const visto = desenhar({
      servidor: {
        ...sugestoes,
        'POST /api/chamados/anexos': (pedido) => {
          const nome = new URL(pedido.url).searchParams.get('nome') ?? '';
          envios.push(nome);
          const resposta = enviado(`f-${nome}`, nome);
          if (nome !== 'a.png') return resposta;
          return new Promise<Response>((pronto) => {
            liberar = () => pronto(resposta);
          });
        },
      },
    });
    anexar('foto', arquivo('a.png'));
    await waitFor(() => expect(envios).toEqual(['a.png']));
    anexar('foto', arquivo('b.png'));
    expect(await within(campoNaTela('foto')).findByText('Na fila')).toBeTruthy();

    liberar?.();
    await waitFor(() => expect(visto.estado.respostas).toEqual({ foto: ['f-a.png', 'f-b.png'] }));
    expect(envios).toEqual(['a.png', 'b.png']);
  });

  it('a fila que esvaziou volta a andar: o escolhido depois vai', async () => {
    const envios: string[] = [];
    const visto = desenhar({
      servidor: {
        ...sugestoes,
        'POST /api/chamados/anexos': (pedido) => {
          const nome = new URL(pedido.url).searchParams.get('nome') ?? '';
          envios.push(nome);
          return enviado(`f-${nome}`, nome);
        },
      },
    });
    anexar('foto', arquivo('a.png'));
    await waitFor(() => expect(visto.estado.respostas).toEqual({ foto: ['f-a.png'] }));
    await waitFor(() => expect(within(campoNaTela('foto')).queryByRole('progressbar')).toBeNull());

    anexar('foto', arquivo('b.png'));
    await waitFor(() => expect(visto.estado.respostas).toEqual({ foto: ['f-a.png', 'f-b.png'] }));
    expect(envios).toEqual(['a.png', 'b.png']);
  });

  it('desmontado, o envio em curso acaba fora da resposta, e a fila para', async () => {
    const envios: string[] = [];
    let liberar: (() => void) | undefined;
    const visto = desenhar({
      servidor: {
        ...sugestoes,
        'POST /api/chamados/anexos': (pedido) => {
          const nome = new URL(pedido.url).searchParams.get('nome') ?? '';
          envios.push(nome);
          const resposta = enviado(`f-${nome}`, nome);
          if (nome !== 'a.png') return resposta;
          return new Promise<Response>((pronto) => {
            liberar = () => pronto(resposta);
          });
        },
      },
    });
    anexar('foto', arquivo('a.png'), arquivo('b.png'));
    await waitFor(() => expect(envios).toEqual(['a.png']));
    const mudancas = visto.mudancas;

    cleanup();
    liberar?.();
    await act(() => new Promise((pronto) => setTimeout(pronto, 50)));
    expect(envios).toEqual(['a.png']);
    expect(visto.mudancas).toBe(mudancas);
  });

  it('na StrictMode, que desmonta e monta os efeitos, a fila anda', async () => {
    const visto = desenhar({
      estrito: true,
      servidor: {
        ...sugestoes,
        'POST /api/chamados/anexos': (pedido) => {
          const nome = new URL(pedido.url).searchParams.get('nome') ?? '';
          return enviado(`f-${nome}`, nome);
        },
      },
    });
    anexar('foto', arquivo('a.png'), arquivo('b.png'));
    await waitFor(() => expect(visto.estado.respostas).toEqual({ foto: ['f-a.png', 'f-b.png'] }));
  });

  it('o envio que acaba depois do tipo trocado responde pelo formulário novo', async () => {
    let liberar: (() => void) | undefined;
    const antigo = formularioCom(
      campo('foto', 'anexo', 'Uma foto ajuda'),
      campo('gatilho', 'escolha-unica', 'Tem detalhe?', { opcoes: [{ id: 'sim', texto: 'Sim' }] }),
      campo('detalhe', 'texto-curto', 'Qual detalhe?', {
        condicao: [{ campoId: 'gatilho', juncao: null, opcaoId: 'sim' }],
      }),
    );
    const novo = formularioCom(
      campo('foto', 'anexo', 'Uma foto ajuda'),
      campo('detalhe', 'texto-curto', 'Qual detalhe?'),
    );
    const visto = desenhar({
      formulario: antigo,
      servidor: {
        'POST /api/chamados/anexos': () =>
          new Promise<Response>((pronto) => {
            liberar = () => pronto(enviado('f-a', 'a.png'));
          }),
      },
    });
    anexar('foto', arquivo('a.png'));
    await waitFor(() => expect(liberar).toBeDefined());

    act(() => visto.trocarFormulario(novo));
    fireEvent.change(screen.getByRole('textbox', { name: 'Qual detalhe?' }), {
      target: { value: 'Borda' },
    });
    liberar?.();
    await waitFor(() =>
      expect(visto.estado.respostas).toEqual({ detalhe: 'Borda', foto: ['f-a'] }),
    );
  });

  it('até 5: os escolhidos a mais ficam de fora, com o nome, e "Anexar arquivos" sai', async () => {
    const envios: string[] = [];
    const quatro = ['f-1', 'f-2', 'f-3', 'f-4'];
    desenhar({
      inicial: {
        respostas: { foto: quatro },
        citados: {
          ...ESTADO_VAZIO.citados,
          anexos: new Map(
            quatro.map((id) => [id, { nome: `${id}.png`, bytes: 5, onde: 'sem-dono' as const }]),
          ),
        },
      },
      servidor: {
        ...sugestoes,
        'POST /api/chamados/anexos': (pedido) => {
          const nome = new URL(pedido.url).searchParams.get('nome') ?? '';
          envios.push(nome);
          return enviado('f-5', nome);
        },
      },
    });
    anexar('foto', arquivo('a.png'), arquivo('b.png'), arquivo('c.png'));
    const foto = within(campoNaTela('foto'));
    expect(
      await foto.findByText('Anexe até 5 arquivos. Ficaram de fora: b.png e c.png.'),
    ).toBeTruthy();
    await waitFor(() => expect(foto.getByText('a.png')).toBeTruthy());
    expect(envios).toEqual(['a.png']);
    await waitFor(() => expect(foto.queryByRole('button', { name: 'Anexar arquivos' })).toBeNull());
  });

  it('os que ainda vão contam no limite', async () => {
    const envios: string[] = [];
    desenhar({
      servidor: {
        ...sugestoes,
        // O primeiro envio não termina: os escolhidos ficam na fila.
        'POST /api/chamados/anexos': (pedido) => {
          envios.push(new URL(pedido.url).searchParams.get('nome') ?? '');
          return new Promise<Response>(() => {});
        },
      },
    });
    anexar('foto', arquivo('a.png'), arquivo('b.png'), arquivo('c.png'), arquivo('d.png'));
    await waitFor(() => expect(envios).toEqual(['a.png']));
    const foto = within(campoNaTela('foto'));
    expect(foto.getByRole('button', { name: 'Anexar arquivos' })).toBeTruthy();
    anexar('foto', arquivo('e.png'), arquivo('f.png'));
    expect(await foto.findByText('Anexe até 5 arquivos. Ficou de fora: f.png.')).toBeTruthy();
    expect(foto.getByText('e.png')).toBeTruthy();
    expect(foto.getAllByText('Na fila')).toHaveLength(4);
    expect(foto.queryByRole('button', { name: 'Anexar arquivos' })).toBeNull();
  });

  it('o arquivo vazio e o recusado pela API ficam no campo, com o nome, e os outros seguem', async () => {
    const envios: string[] = [];
    const visto = desenhar({
      servidor: {
        ...sugestoes,
        'POST /api/chamados/anexos': (pedido) => {
          const nome = new URL(pedido.url).searchParams.get('nome') ?? '';
          envios.push(nome);
          if (nome === 'programa.exe') {
            return Response.json(
              {
                type: 'urn:grafite:problema:formato-nao-aceito',
                title: 'Formato não aceito',
                status: 415,
                detail: 'Envie PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP.',
                codigoDeRastreio: 'ABCD-1234',
              },
              { status: 415 },
            );
          }
          return enviado('f-ok', nome);
        },
      },
    });
    anexar('foto', arquivo('vazio.png', 0), arquivo('programa.exe'), arquivo('ok.png'));
    const foto = within(campoNaTela('foto'));
    expect(await foto.findByText('vazio.png: O arquivo está vazio.')).toBeTruthy();
    expect(
      await foto.findByText(
        'programa.exe: Envie PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(visto.estado.respostas).toEqual({ foto: ['f-ok'] }));
    expect(envios).toEqual(['programa.exe', 'ok.png']);
  });

  it('"Tirar" tira o arquivo da resposta, e sem arquivo a resposta sai', () => {
    const visto = desenhar({
      inicial: {
        respostas: { foto: ['f-1', 'f-2'] },
        citados: {
          ...ESTADO_VAZIO.citados,
          anexos: new Map([
            ['f-1', { nome: 'erro-vpn.png', bytes: 5, onde: 'sem-dono' as const }],
            ['f-2', { nome: 'tela.png', bytes: 5, onde: 'sem-dono' as const }],
          ]),
        },
      },
      servidor: sugestoes,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tirar tela.png' }));
    expect(visto.estado.respostas).toEqual({ foto: ['f-1'] });
    expect(screen.queryByText('tela.png')).toBeNull();
    expect(screen.getByText('erro-vpn.png')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar erro-vpn.png' }));
    expect(visto.estado.respostas).toEqual({});
  });

  it('na prévia, o arquivo não é enviado: entra na resposta só no navegador, sem o download', async () => {
    const visto = desenhar({
      quem: 'pessoa',
      servidor: { 'GET /api/chamados/tipos/sugestoes': () => Response.json(SUGESTOES) },
    });
    const foto = within(campoNaTela('foto'));
    expect(foto.getByText('Na prévia, o arquivo não é enviado.')).toBeTruthy();
    anexar('foto', arquivo('erro-vpn.png'));
    expect(await foto.findByText('erro-vpn.png')).toBeTruthy();
    expect(foto.queryByRole('link')).toBeNull();
    const ids = visto.estado.respostas.foto;
    expect(Array.isArray(ids) && ids.length === 1).toBe(true);
    const id = Array.isArray(ids) ? (ids[0] ?? '') : '';
    expect(visto.estado.citados.anexos.get(id)).toEqual({
      nome: 'erro-vpn.png',
      bytes: 5,
      onde: 'no-navegador',
    });
  });

  it('no chamado aberto, o anexo da pessoa baixa pelo chamado, e o do campo só da TI enviado agora, pela rota do sem dono', async () => {
    const formulario = formularioCom(
      campo('foto', 'anexo', 'Uma foto ajuda'),
      campo('laudo', 'anexo', 'Laudo do técnico', { soDaTi: true }),
    );
    const visto = desenhar({
      formulario,
      quem: 'chamado',
      numero: 1042,
      inicial: {
        respostas: { foto: ['f-1'] },
        citados: {
          ...ESTADO_VAZIO.citados,
          anexos: new Map([['f-1', { nome: 'folha.jpg', bytes: 5, onde: 'no-chamado' as const }]]),
        },
      },
      servidor: { 'POST /api/chamados/anexos': () => enviado('f-9', 'laudo.pdf') },
    });
    const foto = within(campoNaTela('foto'));
    expect(foto.getByRole('link', { name: 'Baixar folha.jpg' }).getAttribute('href')).toBe(
      '/api/chamados/1042/anexos/f-1',
    );
    expect(foto.queryByRole('button')).toBeNull();

    anexar('laudo', arquivo('laudo.pdf'));
    const laudo = within(campoNaTela('laudo'));
    expect(
      (await laudo.findByRole('link', { name: 'Baixar laudo.pdf' })).getAttribute('href'),
    ).toBe('/api/chamados/anexos/f-9');
    expect(visto.estado.respostas).toEqual({ foto: ['f-1'], laudo: ['f-9'] });
  });
});

describe('o visual da aba', () => {
  const COR = campo('cor', 'escolha-unica', 'Qual cor?', {
    opcoes: [
      { id: 'preto', texto: 'Preto' },
      { id: 'ciano', texto: 'Ciano' },
    ],
  });
  const URGENCIA = campo('urgencia', 'escolha-unica', 'É urgente?', {
    obrigatorio: true,
    opcoes: [
      { id: 'parou', texto: 'Sim, parou tudo' },
      { id: 'da-para-esperar', texto: 'Dá para esperar' },
    ],
  });
  const GARANTIA = campo('garantia', 'sim-ou-nao', 'Está na garantia?');
  const PECAS = campo('pecas', 'varias-opcoes', 'Quais peças?', {
    opcoes: [
      { id: 'bandeja', texto: 'Bandeja' },
      { id: 'tampa', texto: 'Tampa' },
      { id: 'fusor', texto: 'Fusor' },
    ],
  });

  /** O número de cada campo na tela, na ordem, ou nulo no campo sem número. */
  const numeros = () =>
    camposNaTela().map(
      (id) => campoNaTela(id ?? '').querySelector('[data-parte="numero"]')?.textContent ?? null,
    );
  /** O texto de cada escolha do grupo, na ordem. */
  const escolhasDe = (grupo: HTMLElement, papel: 'radio' | 'checkbox' = 'radio') =>
    within(grupo)
      .getAllByRole(papel)
      .map((escolha) => escolha.closest('label')?.textContent);
  /** O texto das escolhas do grupo que mostram o visto. */
  const comVisto = (grupo: HTMLElement) =>
    [...grupo.querySelectorAll('[data-parte="visto"]')].map(
      (visto) => visto.closest('label')?.textContent,
    );
  /** A forma das escolhas do grupo na aba: em cartões ou em chips. */
  const formaDe = (grupo: HTMLElement) => grupo.getAttribute('data-forma');
  /** Os campos na tela que se colam à pergunta de cima. */
  const continuacoes = () =>
    camposNaTela().filter((id) => campoNaTela(id ?? '').hasAttribute('data-continuacao'));
  const quando = (campoId: string) => [{ campoId, juncao: null, valor: true }];
  const responderSim = (rotulo: string) =>
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: rotulo })).getByRole('radio', { name: 'Sim' }),
    );

  it('as perguntas numeradas na ordem, fora do nome lido, e o campo da condição sem número', () => {
    desenhar({ quem: 'pessoa', visual: 'aba' });
    expect(camposNaTela()).toEqual(['impressora', 'problema', 'foto']);
    expect(numeros()).toEqual(['1', '2', '3']);
    const numero = campoNaTela('problema').querySelector('[data-parte="numero"]');
    expect(numero?.getAttribute('aria-hidden')).toBe('true');
    const problema = screen.getByRole('radiogroup', { name: 'O que está acontecendo?' });
    fireEvent.click(within(problema).getByRole('radio', { name: 'Manchando' }));
    expect(camposNaTela()).toEqual(['impressora', 'problema', 'manchas', 'foto']);
    expect(numeros()).toEqual(['1', '2', null, '3']);
  });

  it('na tela, sem números nem cartões', () => {
    desenhar({ quem: 'pessoa' });
    expect(numeros()).toEqual([null, null, null]);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('a Escolha única em cartões, com o visto na escolhida e o "Nenhum" por último no que não é exigido', () => {
    const visto = desenhar({
      formulario: formularioCom(COR, URGENCIA),
      quem: 'pessoa',
      visual: 'aba',
    });
    const cor = screen.getByRole('radiogroup', { name: 'Qual cor?' });
    const urgencia = screen.getByRole('radiogroup', { name: 'É urgente?' });
    expect(escolhasDe(cor)).toEqual(['Preto', 'Ciano', 'Nenhum']);
    expect(escolhasDe(urgencia)).toEqual(['Sim, parou tudo', 'Dá para esperar']);
    // Sem resposta, o que não é exigido fica no "Nenhum", como na lista da tela.
    expect(within(cor).getByRole('radio', { name: 'Nenhum' })).toHaveProperty('checked', true);
    expect(comVisto(urgencia)).toEqual([]);
    fireEvent.click(within(cor).getByRole('radio', { name: 'Ciano' }));
    expect(visto.estado.respostas).toEqual({ cor: 'ciano' });
    expect(comVisto(cor)).toEqual(['Ciano']);
    fireEvent.click(within(urgencia).getByRole('radio', { name: 'Dá para esperar' }));
    expect(visto.estado.respostas).toEqual({ cor: 'ciano', urgencia: 'da-para-esperar' });
    fireEvent.click(within(cor).getByRole('radio', { name: 'Nenhum' }));
    expect(visto.estado.respostas).toEqual({ urgencia: 'da-para-esperar' });
    expect(comVisto(cor)).toEqual(['Nenhum']);
  });

  it('o Sim ou não em cartões, com o "Nenhum" por último', () => {
    const visto = desenhar({ formulario: formularioCom(GARANTIA), quem: 'pessoa', visual: 'aba' });
    const garantia = screen.getByRole('radiogroup', { name: 'Está na garantia?' });
    expect(escolhasDe(garantia)).toEqual(['Sim', 'Não', 'Nenhum']);
    fireEvent.click(within(garantia).getByRole('radio', { name: 'Não' }));
    expect(visto.estado.respostas).toEqual({ garantia: false });
    expect(comVisto(garantia)).toEqual(['Não']);
    fireEvent.click(within(garantia).getByRole('radio', { name: 'Sim' }));
    expect(visto.estado.respostas).toEqual({ garantia: true });
  });

  it('o Sim ou não exigido, sem o "Nenhum"', () => {
    desenhar({
      formulario: formularioCom({ ...GARANTIA, obrigatorio: true }),
      quem: 'pessoa',
      visual: 'aba',
    });
    const garantia = screen.getByRole('radiogroup', { name: 'Está na garantia?' });
    expect(escolhasDe(garantia)).toEqual(['Sim', 'Não']);
  });

  it('as Várias opções em chips, com o visto nas ligadas, na ordem das opções', () => {
    const visto = desenhar({ formulario: formularioCom(PECAS), quem: 'pessoa', visual: 'aba' });
    const pecas = screen.getByRole('group', { name: 'Quais peças?' });
    expect(formaDe(pecas)).toBe('chips');
    expect(escolhasDe(pecas, 'checkbox')).toEqual(['Bandeja', 'Tampa', 'Fusor']);
    fireEvent.click(within(pecas).getByRole('checkbox', { name: 'Tampa' }));
    fireEvent.click(within(pecas).getByRole('checkbox', { name: 'Bandeja' }));
    expect(visto.estado.respostas).toEqual({ pecas: ['bandeja', 'tampa'] });
    expect(comVisto(pecas)).toEqual(['Bandeja', 'Tampa']);
  });

  it('cada tipo de campo tem o rótulo que o número recua, e as escolhas, as opções que a aba arruma', () => {
    const TODOS = formularioCom(
      campo('sala', 'texto-curto', 'Qual sala?'),
      campo('detalhes', 'texto-longo', 'Quer contar mais?'),
      campo('folhas', 'numero', 'Quantas folhas?'),
      campo('desde', 'data', 'Desde quando?'),
      COR,
      PECAS,
      GARANTIA,
      campo('impressora', 'ativo', 'Qual impressora?'),
      campo('onde', 'local', 'Onde você está?'),
      campo('quem-usa', 'pessoa', 'Quem usa o computador?'),
      campo('foto', 'anexo', 'Uma foto ajuda'),
    );
    desenhar({
      formulario: TODOS,
      quem: 'pessoa',
      visual: 'aba',
      servidor: { 'GET /api/locais': () => Response.json(ARVORE) },
    });
    expect(numeros()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    // Um rótulo só por campo, com o texto da pergunta: é ele que abre o espaço do número.
    expect(
      camposNaTela().map((id) =>
        [...campoNaTela(id ?? '').querySelectorAll('[data-parte="rotulo"]')].map(
          (rotulo) => rotulo.textContent,
        ),
      ),
    ).toEqual(TODOS.campos.map((deles) => [deles.rotulo]));
    const opcoesDe = (grupo: HTMLElement) =>
      [...(grupo.querySelector('[data-parte="opcoes"]')?.querySelectorAll('label') ?? [])].map(
        (opcao) => opcao.textContent,
      );
    expect(opcoesDe(screen.getByRole('radiogroup', { name: 'Qual cor?' }))).toEqual([
      'Preto',
      'Ciano',
      'Nenhum',
    ]);
    expect(opcoesDe(screen.getByRole('group', { name: 'Quais peças?' }))).toEqual([
      'Bandeja',
      'Tampa',
      'Fusor',
    ]);
    expect(opcoesDe(screen.getByRole('radiogroup', { name: 'Está na garantia?' }))).toEqual([
      'Sim',
      'Não',
      'Nenhum',
    ]);
  });

  it('o campo da condição logo depois da base se cola a ela, com as escolhas em chips, como no m05', () => {
    const visto = desenhar({ quem: 'pessoa', visual: 'aba' });
    const problema = screen.getByRole('radiogroup', { name: 'O que está acontecendo?' });
    expect(continuacoes()).toEqual([]);
    fireEvent.click(within(problema).getByRole('radio', { name: 'Manchando' }));
    expect(continuacoes()).toEqual(['manchas']);
    const manchas = screen.getByRole('radiogroup', { name: 'Onde as manchas aparecem?' });
    expect([formaDe(problema), formaDe(manchas)]).toEqual(['cartoes', 'chips']);
    // Exigida, a pergunta não tem o "Nenhum".
    expect(escolhasDe(manchas)).toEqual(['Na borda', 'Na página toda']);
    expect(comVisto(manchas)).toEqual([]);
    fireEvent.click(within(manchas).getByRole('radio', { name: 'Na borda' }));
    expect(visto.estado.respostas).toMatchObject({ problema: 'manchando', manchas: 'borda' });
    expect(comVisto(manchas)).toEqual(['Na borda']);
  });

  it('com a base mais acima, o campo da condição fica no vão normal, em cartões', () => {
    desenhar({
      formulario: formularioCom(GARANTIA, campo('sala', 'texto-curto', 'Qual sala?'), {
        ...COR,
        condicao: quando('garantia'),
      }),
      quem: 'pessoa',
      visual: 'aba',
    });
    responderSim('Está na garantia?');
    expect(camposNaTela()).toEqual(['garantia', 'sala', 'cor']);
    expect(numeros()).toEqual(['1', '2', null]);
    expect(continuacoes()).toEqual([]);
    expect(formaDe(screen.getByRole('radiogroup', { name: 'Qual cor?' }))).toBe('cartoes');
  });

  it('na continuação, o Sim ou não em chips, com o "Nenhum" por último, e as Várias opções em chips', () => {
    const visto = desenhar({
      formulario: formularioCom(
        { ...GARANTIA, obrigatorio: true },
        { ...PECAS, condicao: quando('garantia') },
        campo('troca', 'sim-ou-nao', 'Precisa trocar?', { condicao: quando('garantia') }),
      ),
      quem: 'pessoa',
      visual: 'aba',
    });
    responderSim('Está na garantia?');
    expect(continuacoes()).toEqual(['pecas', 'troca']);
    const pecas = screen.getByRole('group', { name: 'Quais peças?' });
    const troca = screen.getByRole('radiogroup', { name: 'Precisa trocar?' });
    expect([formaDe(pecas), formaDe(troca)]).toEqual(['chips', 'chips']);
    expect(escolhasDe(troca)).toEqual(['Sim', 'Não', 'Nenhum']);
    expect(comVisto(troca)).toEqual(['Nenhum']);
    fireEvent.click(within(troca).getByRole('radio', { name: 'Não' }));
    expect(visto.estado.respostas).toEqual({ garantia: true, troca: false });
    expect(comVisto(troca)).toEqual(['Não']);
  });

  it('na tela, nenhum campo se cola e as escolhas não têm forma', async () => {
    desenhar({ quem: 'pessoa' });
    await escolherNaSelecao(/O que está acontecendo\?/, 'Manchando');
    expect(camposNaTela()).toEqual(['impressora', 'problema', 'manchas', 'foto']);
    expect(continuacoes()).toEqual([]);
    expect(document.querySelector('[data-forma]')).toBeNull();
  });
});

describe('as recusas', () => {
  it('a de cada campo fica nele, e a geral, no alto do formulário', () => {
    desenhar({
      erros: {
        formulario: RECUSA_DO_FORMULARIO,
        'campos.problema': 'Responda esta pergunta.',
        'campos.foto': 'Anexe até 5 arquivos.',
      },
      servidor: { 'GET /api/chamados/sugestoes': () => Response.json(SUGESTOES) },
    });
    expect(within(campoNaTela('problema')).getByText('Responda esta pergunta.')).toBeTruthy();
    expect(within(campoNaTela('foto')).getByText('Anexe até 5 arquivos.')).toBeTruthy();
    const geral = screen.getByText(RECUSA_DO_FORMULARIO);
    expect(geral.closest('[data-campo]')).toBeNull();
    expect(
      geral.compareDocumentPosition(campoNaTela('impressora')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
