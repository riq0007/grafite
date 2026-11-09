import type { ColunaDaTabela, DefinicaoDaVisao, FiltroDaVisao } from '@grafite/domain';
import { filaDeAvisos } from '@grafite/ui';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnderecoDaTabela } from './endereco.ts';
import {
  type EnderecoComLegado,
  type GravacaoDaTabela,
  useEstadoDaTabela,
} from './useEstadoDaTabela.ts';
import type { VisaoUsavel } from './visoes.ts';

const coluna = (chave: string, extras: Partial<ColunaDaTabela> = {}): ColunaDaTabela => ({
  chave,
  rotulo: chave,
  grupo: 'Identificação',
  ordena: true,
  filtro: 'texto',
  podeFicarVazia: true,
  alinhamento: 'inicio',
  mono: false,
  largura: 160,
  ...extras,
});

const DISPONIVEIS = [
  coluna('ativo.rotulo', { principal: true, podeFicarVazia: false }),
  coluna('ativo.patrimonio'),
  coluna('ativo.situacao', { filtro: 'situacao', podeFicarVazia: false }),
  coluna('ativo.tipo', { filtro: 'escolha' }),
  coluna('ativo.criado-em', { filtro: 'momento', podeFicarVazia: false }),
  coluna('ip'),
];

const SO_ATIVOS: FiltroDaVisao = {
  chave: 'ativo.situacao',
  operador: 'situacao',
  situacao: 'ativos',
};

const FABRICA: DefinicaoDaVisao = {
  colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio' }, { chave: 'ativo.situacao' }],
  ordenacao: { chave: 'ativo.criado-em', direcao: 'decrescente' },
  filtros: [SO_ATIVOS],
};

const SWITCHES_ID = '0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d';
const SWITCHES: DefinicaoDaVisao = {
  colunas: [{ chave: 'ativo.rotulo' }, { chave: 'campo.garantia' }, { chave: 'ativo.patrimonio' }],
  ordenacao: { chave: 'campo.garantia', direcao: 'crescente' },
  filtros: [SO_ATIVOS, { chave: 'ativo.tipo', operador: 'qualquer', valores: ['switch'] }],
};

const USAVEIS = new Map<string, VisaoUsavel>([
  ['fabrica', { nome: 'Todos os ativos', definicao: FABRICA }],
  [SWITCHES_ID, { nome: 'Switches', definicao: SWITCHES }],
]);

afterEach(() => {
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

/** O hook sobre um endereço que o teste guarda, como o roteador guardaria, e as trocas dele. */
function estado(
  inicial: EnderecoComLegado,
  {
    usaveis = USAVEIS,
    queAbre = 'fabrica',
    mudancasDaConta,
    guardar,
  }: {
    usaveis?: typeof USAVEIS;
    queAbre?: string;
    mudancasDaConta?: ReadonlyMap<string, DefinicaoDaVisao>;
    guardar?: (gravacao: GravacaoDaTabela) => Promise<void>;
  } = {},
) {
  let endereco: EnderecoComLegado = inicial;
  let visoes = usaveis;
  let mudancas = mudancasDaConta;
  const trocas: EnderecoDaTabela[] = [];
  type Props = {
    endereco: EnderecoComLegado;
    visoes: typeof USAVEIS;
    mudancas: ReadonlyMap<string, DefinicaoDaVisao> | undefined;
  };
  // A troca na montagem espera o hook montar, como o roteador redesenha depois.
  let redesenhar: ((props: Props) => void) | undefined;
  let pendente = false;
  const navegar = vi.fn((mudar: (atual: EnderecoComLegado) => EnderecoComLegado) => {
    endereco = mudar(endereco);
    trocas.push(endereco);
    if (redesenhar) redesenhar({ endereco, visoes, mudancas });
    else pendente = true;
  });
  const resultado = renderHook(
    ({ endereco: atual, visoes: atuais, mudancas: daConta }: Props) =>
      useEstadoDaTabela({
        endereco: atual,
        navegar,
        usaveis: atuais,
        queAbre,
        disponiveis: DISPONIVEIS,
        mudancasDaConta: daConta,
        guardar,
      }),
    { initialProps: { endereco, visoes, mudancas } },
  );
  redesenhar = resultado.rerender;
  if (pendente) act(() => resultado.rerender({ endereco, visoes, mudancas }));
  /** As visões e as mudanças da conta mudam, como depois do evento `visoes.mudaram`. */
  const trocarVisoes = (novas: typeof USAVEIS, novasMudancas = mudancas) => {
    visoes = novas;
    mudancas = novasMudancas;
    act(() => resultado.rerender({ endereco, visoes, mudancas }));
  };
  return { ...resultado, trocas, navegar, trocarVisoes, endereco: () => endereco };
}

describe('a visão aberta', () => {
  it('sem visão no endereço, o endereço é reescrito com a visão que abre', () => {
    const { result, endereco } = estado({}, { queAbre: SWITCHES_ID });
    expect(endereco()).toEqual({ visao: SWITCHES_ID });
    expect(result.current.visao).toBe(SWITCHES_ID);
    expect(result.current.alterada).toBe(false);
  });

  it('enquanto as visões carregam, nada muda no endereço e a tabela espera', () => {
    const resultado = renderHook(() =>
      useEstadoDaTabela({
        endereco: {},
        navegar: vi.fn(),
        usaveis: undefined,
        queAbre: 'fabrica',
        disponiveis: DISPONIVEIS,
      }),
    );
    expect(resultado.result.current.definicao).toBeUndefined();
  });

  it('a visão do endereço que a conta não pode usar dá lugar à que abre, com o aviso e as mudanças', () => {
    const outra = 'ffffffff-3f40-4a5b-8c6d-7e8f9a0b1c2d';
    const { result, endereco } = estado({ visao: outra, ordem: 'ip' });
    expect(endereco()).toEqual({ visao: 'fabrica', ordem: 'ip' });
    expect(result.current.definicao?.ordenacao).toEqual({ chave: 'ip', direcao: 'crescente' });
    expect(result.current.alterada).toBe(true);
    expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toEqual([
      'A visão do endereço não está disponível.',
    ]);
  });
});

describe('a visão removida em outra sessão', () => {
  it('a tabela aberta nela passa à que abre, com o aviso, e mantém as mudanças do endereço', () => {
    const { result, endereco, trocarVisoes } = estado({ visao: SWITCHES_ID, ordem: 'ip' });
    expect(result.current.visao).toBe(SWITCHES_ID);
    trocarVisoes(new Map([['fabrica', { nome: 'Todos os ativos', definicao: FABRICA }]]));
    expect(endereco()).toEqual({ visao: 'fabrica', ordem: 'ip' });
    expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toEqual([
      'A visão Switches foi removida.',
    ]);
  });

  it('a visão salva em outra sessão vale na hora, com as mudanças que não foram salvas', () => {
    const { result, trocarVisoes } = estado({ visao: 'fabrica', ordem: 'ip' });
    const salva = { ...FABRICA, colunas: [...FABRICA.colunas, { chave: 'ip' }] };
    trocarVisoes(new Map([['fabrica', { nome: 'Todos os ativos', definicao: salva }]]));
    expect(result.current.definicao?.colunas.map((coluna) => coluna.chave)).toContain('ip');
    expect(result.current.definicao?.ordenacao).toEqual({ chave: 'ip', direcao: 'crescente' });
  });
});

describe('a visão da organização mudada em outra sessão', () => {
  const COM_IP = { ...SWITCHES, colunas: [...SWITCHES.colunas, { chave: 'ip' }] };
  const MUDADA = { ...SWITCHES, ordenacao: null };
  const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

  it('com as mudanças da conta por cima, avisa uma vez, e as mudanças continuam', () => {
    const { result, trocarVisoes } = estado(
      { visao: SWITCHES_ID },
      { mudancasDaConta: new Map([[SWITCHES_ID, COM_IP]]), guardar: vi.fn(async () => {}) },
    );
    expect(result.current.estado).toBe('personalizada');
    const mudada = new Map(USAVEIS).set(SWITCHES_ID, { nome: 'Switches', definicao: MUDADA });
    trocarVisoes(mudada);
    expect(avisos()).toEqual([
      'A visão Switches foi atualizada pela organização. Suas mudanças continuam sobre ela.',
    ]);
    expect(result.current.estado).toBe('personalizada');
    expect(result.current.definicao?.colunas.map((coluna) => coluna.chave)).toContain('ip');
    expect(result.current.salva).toEqual(MUDADA);
    // A mesma mudança relida não avisa de novo.
    trocarVisoes(new Map(mudada));
    expect(avisos()).toHaveLength(1);
  });

  it('sem as mudanças da conta, a visão nova vale, sem o aviso', () => {
    const { result, trocarVisoes } = estado(
      { visao: SWITCHES_ID },
      { guardar: vi.fn(async () => {}) },
    );
    trocarVisoes(new Map(USAVEIS).set(SWITCHES_ID, { nome: 'Switches', definicao: MUDADA }));
    expect(avisos()).toEqual([]);
    expect(result.current.definicao?.ordenacao).toBeNull();
  });
});

describe('as mudanças sobre a visão', () => {
  it('mostrar uma coluna marca a tabela como alterada, e voltar a ela tira a marca', () => {
    const { result, endereco } = estado({ visao: 'fabrica' });
    act(() =>
      result.current.mudar({
        colunas: [...(result.current.definicao?.colunas ?? []), { chave: 'ip' }],
      }),
    );
    expect(endereco().colunas).toBe('ativo.rotulo,ativo.patrimonio,ativo.situacao,ip');
    expect(result.current.alterada).toBe(true);
    act(() => result.current.mudar({ colunas: FABRICA.colunas }));
    expect(endereco().colunas).toBeUndefined();
    expect(result.current.alterada).toBe(false);
  });

  it('a busca fica no endereço e não marca a tabela como alterada', () => {
    const { result, endereco } = estado({ visao: 'fabrica' });
    act(() => result.current.mudarBusca('laserjet'));
    expect(endereco().busca).toBe('laserjet');
    expect(result.current.alterada).toBe(false);
    act(() => result.current.mudarBusca('  '));
    expect(endereco().busca).toBeUndefined();
  });

  it('mudar a tabela e a busca na mesma troca, como "Limpar filtros"', () => {
    const { result, endereco, navegar } = estado({ visao: 'fabrica', busca: 'hp', ordem: 'ip' });
    const antes = navegar.mock.calls.length;
    act(() => result.current.mudar({ filtros: FABRICA.filtros }, { busca: '' }));
    expect(navegar.mock.calls.length).toBe(antes + 1);
    expect(endereco()).toEqual({ visao: 'fabrica', ordem: 'ip' });
  });

  it('descartar tira as mudanças e deixa a busca', () => {
    const { result, endereco } = estado({
      visao: 'fabrica',
      busca: 'hp',
      ordem: 'ip',
      filtros: [SO_ATIVOS, { chave: 'ip', operador: 'vazio' }],
    });
    expect(result.current.alterada).toBe(true);
    act(() => result.current.descartar());
    expect(endereco()).toEqual({ visao: 'fabrica', busca: 'hp' });
    expect(result.current.definicao).toEqual(FABRICA);
  });

  it('escolher outra visão tira as mudanças da anterior', () => {
    const { result, endereco } = estado({ visao: 'fabrica', ordem: 'ip', busca: 'hp' });
    act(() => result.current.escolher(SWITCHES_ID));
    expect(endereco()).toEqual({ visao: SWITCHES_ID, busca: 'hp' });
  });

  it('as mudanças iguais à visão saem do endereço', () => {
    const { result, endereco } = estado({ visao: 'fabrica', ordem: '-ativo.criado-em' });
    expect(endereco()).toEqual({ visao: 'fabrica' });
    expect(result.current.alterada).toBe(false);
  });
});

describe('o campo que deixou de valer (foco 1)', () => {
  it('a coluna, o filtro e a ordem por ele saem da tabela, sem marcar a visão como alterada', () => {
    const { result } = estado({ visao: SWITCHES_ID });
    expect(result.current.alterada).toBe(false);
    expect(result.current.definicao).toEqual({
      colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio' }],
      ordenacao: null,
      filtros: SWITCHES.filtros,
    });
  });

  it('a tabela para salvar mantém o que deixou de valer, e a mostrada não', () => {
    const { result } = estado({ visao: SWITCHES_ID, ordem: 'ip' });
    expect(result.current.paraSalvar).toEqual({
      ...SWITCHES,
      ordenacao: { chave: 'ip', direcao: 'crescente' },
    });
    expect(result.current.definicao?.colunas.map((coluna) => coluna.chave)).toEqual([
      'ativo.rotulo',
      'ativo.patrimonio',
    ]);
  });

  it('escolher sem o id volta à visão que abre', () => {
    const { result, endereco } = estado({ visao: SWITCHES_ID, busca: 'hp' });
    act(() => result.current.escolher());
    expect(endereco()).toEqual({ visao: 'fabrica', busca: 'hp' });
  });

  it('a mudança guarda a coluna e a ordem que deixaram de valer, para voltarem com o campo', () => {
    const { result, endereco } = estado({ visao: SWITCHES_ID });
    act(() =>
      result.current.mudar({
        colunas: [...(result.current.definicao?.colunas ?? []), { chave: 'ip' }],
      }),
    );
    expect(endereco().colunas).toBe('ativo.rotulo,campo.garantia,ativo.patrimonio,ip');
    expect(endereco().ordem).toBeUndefined();
  });
});

describe('os links antigos', () => {
  it('o tipo, o local e a situação viram filtros sobre os da visão, e saem do endereço', () => {
    const tipo: FiltroDaVisao = {
      chave: 'ativo.tipo',
      operador: 'qualquer',
      valores: ['impressora'],
    };
    const inativos: FiltroDaVisao = {
      chave: 'ativo.situacao',
      operador: 'situacao',
      situacao: 'inativos',
    };
    const { result, endereco } = estado({ legado: [tipo, inativos] });
    expect(endereco()).toEqual({ visao: 'fabrica', filtros: [tipo, inativos] });
    expect(result.current.definicao?.filtros).toEqual([tipo, inativos]);
    expect(result.current.alterada).toBe(true);
  });
});

// As mudanças da conta guardadas sozinhas (change visoes-da-conta, design, decisão 3): o endereço,
// as mudanças da conta e a visão salva, nessa ordem; a mudança grava na conta, e o endereço fica sem
// ela; numa visão da conta, a mudança vai à própria visão.
describe('as três camadas', () => {
  const COM_IP: DefinicaoDaVisao = {
    ...FABRICA,
    colunas: [...FABRICA.colunas, { chave: 'ip', largura: 140 }],
  };
  const MEUS_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  const COM_A_DA_CONTA = new Map<string, VisaoUsavel>([
    ...USAVEIS,
    [MEUS_ID, { nome: 'Meus notebooks', definicao: FABRICA, daConta: true }],
  ]);
  const gravacoes = () => {
    const feitas: GravacaoDaTabela[] = [];
    const guardar = vi.fn(async (gravacao: GravacaoDaTabela) => {
      feitas.push(gravacao);
    });
    return { feitas, guardar };
  };

  it('com as mudanças da conta, a visão abre personalizada, e o endereço fica sem elas', () => {
    const { result, endereco } = estado(
      { visao: 'fabrica' },
      { mudancasDaConta: new Map([['fabrica', COM_IP]]), guardar: gravacoes().guardar },
    );
    expect(result.current.estado).toBe('personalizada');
    expect(result.current.definicao).toEqual(COM_IP);
    expect(endereco()).toEqual({ visao: 'fabrica' });
  });

  it('mudar a tabela guarda as mudanças da conta, e o endereço continua sem elas', () => {
    const { feitas, guardar } = gravacoes();
    const { result, endereco } = estado({ visao: 'fabrica' }, { guardar });
    act(() => result.current.mudar({ colunas: COM_IP.colunas }));
    expect(feitas).toEqual([{ tipo: 'mudancas', visao: 'fabrica', definicao: COM_IP }]);
    expect(endereco()).toEqual({ visao: 'fabrica' });
    expect(result.current.estado).toBe('personalizada');
    expect(result.current.definicao?.colunas.map((coluna) => coluna.chave)).toContain('ip');
  });

  it('numa visão da conta, a mudança vai à própria visão, sem a marca', () => {
    const { feitas, guardar } = gravacoes();
    const { result } = estado({ visao: MEUS_ID }, { usaveis: COM_A_DA_CONTA, guardar });
    act(() => result.current.mudar({ colunas: COM_IP.colunas }));
    expect(feitas).toEqual([{ tipo: 'visao', id: MEUS_ID, definicao: COM_IP }]);
    expect(result.current.estado).toBe('salva');
    expect(result.current.definicao).toEqual(COM_IP);
  });

  it('o endereço que difere é "Do link"; a primeira mudança guarda a tabela como está', () => {
    const { feitas, guardar } = gravacoes();
    const { result, endereco } = estado({ visao: 'fabrica', ordem: 'ip' }, { guardar });
    expect(result.current.estado).toBe('do-link');
    expect(feitas).toEqual([]);
    act(() => result.current.mudar({ colunas: COM_IP.colunas }));
    expect(feitas).toEqual([
      {
        tipo: 'mudancas',
        visao: 'fabrica',
        definicao: { ...COM_IP, ordenacao: { chave: 'ip', direcao: 'crescente' } },
      },
    ]);
    expect(endereco()).toEqual({ visao: 'fabrica' });
    expect(result.current.estado).toBe('personalizada');
  });

  it('voltar à minha tabela tira o link e deixa as mudanças da conta', () => {
    const { result, endereco } = estado(
      { visao: 'fabrica', ordem: 'ip', busca: 'hp' },
      { mudancasDaConta: new Map([['fabrica', COM_IP]]), guardar: gravacoes().guardar },
    );
    expect(result.current.estado).toBe('do-link');
    act(() => result.current.descartar());
    expect(endereco()).toEqual({ visao: 'fabrica', busca: 'hp' });
    expect(result.current.estado).toBe('personalizada');
  });

  it('restaurar a visão apaga as mudanças da conta e mostra a visão salva', () => {
    const { feitas, guardar } = gravacoes();
    const { result } = estado(
      { visao: 'fabrica' },
      { mudancasDaConta: new Map([['fabrica', COM_IP]]), guardar },
    );
    act(() => result.current.restaurar());
    expect(feitas).toEqual([{ tipo: 'restaurar', visao: 'fabrica' }]);
    expect(result.current.estado).toBe('salva');
    expect(result.current.definicao).toEqual(FABRICA);
  });

  it('a tabela publicada na visão da organização deixa de ser uma decisão pendente', () => {
    const { guardar } = gravacoes();
    const { result, trocarVisoes } = estado({ visao: SWITCHES_ID }, { guardar });
    const nova = { ...SWITCHES, colunas: [...SWITCHES.colunas, { chave: 'ip' }] };
    act(() => result.current.mudar({ colunas: nova.colunas }));
    expect(result.current.estado).toBe('personalizada');
    // A publicação: a visão passa a ser a tabela, e as mudanças da conta saem.
    trocarVisoes(
      new Map(USAVEIS).set(SWITCHES_ID, { nome: 'Switches', definicao: nova }),
      new Map(),
    );
    expect(result.current.estado).toBe('salva');
    expect(result.current.definicao?.colunas.map((coluna) => coluna.chave)).toContain('ip');
    // A visão mudada depois pela organização vale, sem a tabela da decisão antiga por cima.
    trocarVisoes(USAVEIS, new Map());
    expect(result.current.estado).toBe('salva');
    expect(result.current.definicao?.colunas.map((coluna) => coluna.chave)).not.toContain('ip');
  });

  it('voltar a tabela à visão salva restaura em vez de guardar mudanças iguais', () => {
    const { feitas, guardar } = gravacoes();
    const { result } = estado(
      { visao: 'fabrica' },
      { mudancasDaConta: new Map([['fabrica', COM_IP]]), guardar },
    );
    act(() => result.current.mudar({ colunas: FABRICA.colunas }));
    expect(feitas).toEqual([{ tipo: 'restaurar', visao: 'fabrica' }]);
    expect(result.current.estado).toBe('salva');
  });
});
