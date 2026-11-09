import type { DefinicaoNoAtivo } from '@grafite/domain';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escolherLocal, nomesDasOpcoes } from '../../../teste/escolhas.ts';
import { comApi } from '../../../teste/provedores.tsx';
import { CampoDoAtivo, type EntradaDoCampo, entradaInicial } from './CampoDoAtivo.tsx';

afterEach(cleanup);

const definicao = (extras: Partial<DefinicaoNoAtivo>): DefinicaoNoAtivo => ({
  chave: 'c1',
  rotulo: 'Campo',
  tipo: 'texto',
  configuracao: {},
  grupo: 'Outros',
  obrigatorio: false,
  restrito: false,
  escrita: 'automatica',
  origem: 'organizacao',
  ...extras,
});

const CRITICIDADE = definicao({
  chave: 'c-criticidade',
  rotulo: 'Criticidade',
  tipo: 'lista',
  configuracao: {
    opcoes: [
      { id: 'op-alta', rotulo: 'Alta', situacao: 'ativa' },
      { id: 'op-media', rotulo: 'Média', situacao: 'ativa' },
      { id: 'op-baixa', rotulo: 'Baixa', situacao: 'inativa' },
    ],
  },
});

const ARVORE = {
  locais: [
    { id: 'jundiai', paiId: null, nome: 'Jundiaí', tipo: 'unidade', situacao: 'ativo' },
    { id: 'expedicao', paiId: 'jundiai', nome: 'Expedição', tipo: 'setor', situacao: 'ativo' },
  ].map((local) => ({ ...local, permite: { editar: true } })),
  permite: { cadastrarNaRaiz: true },
};

function desenhar(
  props: Partial<Parameters<typeof CampoDoAtivo>[0]> & { definicao: DefinicaoNoAtivo },
  servidor = {},
) {
  const aoMudar = vi.fn<(entrada: EntradaDoCampo, nome?: string) => void>();
  render(
    <CampoDoAtivo
      entrada={entradaInicial(props.definicao, undefined)}
      aoMudar={aoMudar}
      soLeitura={false}
      nomeDoRegistro={() => undefined}
      travado={false}
      {...props}
    />,
    { wrapper: comApi(servidor) },
  );
  return aoMudar;
}

describe('a entrada inicial', () => {
  it('mostra os números como o pt-BR digita, e o resto como está guardado', () => {
    expect(entradaInicial(definicao({ tipo: 'moeda' }), 1234.5)).toBe('1.234,50');
    expect(entradaInicial(definicao({ tipo: 'inteiro' }), 64)).toBe('64');
    expect(entradaInicial(definicao({ tipo: 'texto' }), 'IMP-01')).toBe('IMP-01');
    expect(entradaInicial(CRITICIDADE, 'op-alta')).toBe('op-alta');
    expect(entradaInicial(definicao({ tipo: 'lista-multipla' }), undefined)).toEqual([]);
    expect(entradaInicial(definicao({ tipo: 'texto' }), undefined)).toBe('');
    expect(entradaInicial(definicao({ tipo: 'local' }), undefined)).toBeNull();
  });
});

describe('CampoDoAtivo', () => {
  it('o texto é um campo de texto com o rótulo e a recusa', () => {
    const aoMudar = desenhar({
      definicao: definicao({ rotulo: 'Hostname' }),
      erro: 'Use até 200 caracteres.',
    });
    const campo = screen.getByRole('textbox', { name: 'Hostname' });
    fireEvent.change(campo, { target: { value: 'IMP-01' } });
    expect(aoMudar).toHaveBeenCalledWith('IMP-01');
    expect(screen.getByText('Use até 200 caracteres.')).toBeDefined();
  });

  it('o número tem o teclado numérico', () => {
    desenhar({ definicao: definicao({ rotulo: 'Valor de compra', tipo: 'moeda' }) });
    expect(screen.getByRole('textbox', { name: 'Valor de compra' }).getAttribute('inputmode')).toBe(
      'decimal',
    );
  });

  it('a lista oferece "Nenhum", as opções ativas e a inativa guardada, marcada', async () => {
    const aoMudar = desenhar({ definicao: CRITICIDADE, entrada: 'op-baixa' });
    fireEvent.click(screen.getByRole('button', { name: /Criticidade/ }));
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Nenhum',
      'Alta',
      'Média',
      'Baixa (inativa)',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Alta' }));
    expect(aoMudar).toHaveBeenCalledWith('op-alta');
  });

  it('a lista obrigatória não oferece "Nenhum", e "Nenhum" esvazia a opcional', async () => {
    const aoMudar = desenhar({ definicao: CRITICIDADE, entrada: 'op-alta' });
    fireEvent.click(screen.getByRole('button', { name: /Criticidade/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Nenhum' }));
    expect(aoMudar).toHaveBeenCalledWith(null);
    cleanup();
    desenhar({ definicao: { ...CRITICIDADE, obrigatorio: true }, entrada: null });
    fireEvent.click(screen.getByRole('button', { name: /Criticidade/ }));
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Alta',
      'Média',
    ]);
  });

  it('a lista múltipla marca as opções, na ordem delas', () => {
    const aoMudar = desenhar({
      definicao: { ...CRITICIDADE, tipo: 'lista-multipla', rotulo: 'Turnos' },
      entrada: ['op-media'],
    });
    const grupo = screen.getByRole('group', { name: 'Turnos' });
    fireEvent.click(within(grupo).getByRole('checkbox', { name: 'Alta' }));
    expect(aoMudar).toHaveBeenCalledWith(['op-alta', 'op-media']);
  });

  it('o local se escolhe pelo caminho', async () => {
    const aoMudar = desenhar(
      { definicao: definicao({ rotulo: 'Local', tipo: 'local' }) },
      { 'GET /api/locais': () => Response.json(ARVORE) },
    );
    await escolherLocal('Local', 'Jundiaí › Expedição');
    expect(aoMudar).toHaveBeenCalledWith('expedicao');
  });

  it('a pessoa se escolhe pelos nomes das pessoas ativas', async () => {
    const buscas: string[] = [];
    const aoMudar = desenhar(
      { definicao: definicao({ rotulo: 'Responsável', tipo: 'pessoa' }) },
      {
        'GET /api/pessoas/nomes': (pedido: Request) => {
          buscas.push(new URL(pedido.url).searchParams.get('busca') ?? '');
          return Response.json({ pessoas: [{ id: 'joao', nome: 'João da Silva' }] });
        },
      },
    );
    const campo = screen.getByRole('combobox', { name: 'Responsável' });
    campo.focus();
    fireEvent.change(campo, { target: { value: 'joao' } });
    fireEvent.click(await screen.findByRole('option', { name: 'João da Silva' }));
    expect(aoMudar).toHaveBeenCalledWith('joao', 'João da Silva');
    expect(buscas).toContain('joao');
  });

  it('sem digitar, a pessoa sugere as do local do ativo, primeiro, e diz o total', async () => {
    const pedidos: URLSearchParams[] = [];
    desenhar(
      {
        definicao: definicao({ rotulo: 'Responsável', tipo: 'pessoa' }),
        localDoAtivo: 'expedicao',
      },
      {
        'GET /api/pessoas/nomes': (pedido: Request) => {
          pedidos.push(new URL(pedido.url).searchParams);
          return Response.json({
            pessoas: [
              { id: 'xavier', nome: 'Xavier Lima', doMesmoLocal: true },
              { id: 'ana', nome: 'Ana Souza', doMesmoLocal: false },
            ],
            total: 300,
          });
        },
      },
    );
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0]?.get('local')).toBe('expedicao');
    expect(pedidos[0]?.get('busca')).toBe('');
    fireEvent.click(screen.getByRole('combobox', { name: 'Responsável' }));
    expect(nomesDasOpcoes(await screen.findAllByRole('option'))).toEqual([
      'Xavier Lima',
      'Ana Souza',
    ]);
    expect(screen.getByText('Do mesmo local do ativo')).toBeTruthy();
    expect(screen.getByText('Digite para buscar entre 300')).toBeTruthy();
  });

  it('o ativo se escolhe pelos ativos que a conta vê, sem o próprio', async () => {
    const item = (id: string, rotulo: string, patrimonio: string | null) => ({
      id,
      rotulo,
      patrimonio,
    });
    const aoMudar = desenhar(
      { definicao: definicao({ rotulo: 'Impressora vizinha', tipo: 'ativo' }), ativoAtual: 'a1' },
      {
        'GET /api/ativos': () =>
          Response.json({
            itens: [
              item('a1', 'HP LaserJet M404', 'PAT-00412'),
              item('a2', 'Impressora do RH', null),
            ],
            proximo: null,
            total: 2,
            permite: { cadastrar: true },
          }),
      },
    );
    const campo = screen.getByRole('combobox', { name: 'Impressora vizinha' });
    campo.focus();
    fireEvent.change(campo, { target: { value: 'impressora' } });
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Impressora do RH',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Impressora do RH' }));
    expect(aoMudar).toHaveBeenCalledWith('a2', 'Impressora do RH');
  });

  it('o ativo se escolhe só entre os tipos aceitos do campo', async () => {
    const filtros: (string | null)[] = [];
    desenhar(
      {
        definicao: definicao({
          rotulo: 'Computador',
          tipo: 'ativo',
          configuracao: { tipos: ['t-computador', 't-notebook'] },
        }),
      },
      {
        'GET /api/ativos': (pedido: Request) => {
          filtros.push(new URL(pedido.url).searchParams.get('filtros'));
          return Response.json({
            itens: [],
            proximo: null,
            total: 0,
            permite: { cadastrar: true },
          });
        },
      },
    );
    const campo = screen.getByRole('combobox', { name: 'Computador' });
    campo.focus();
    fireEvent.change(campo, { target: { value: 'pc' } });
    await waitFor(() => expect(filtros).not.toHaveLength(0));
    expect(JSON.parse(filtros[0] ?? 'null')).toEqual([
      { chave: 'ativo.tipo', operador: 'qualquer', valores: ['t-computador', 't-notebook'] },
    ]);
  });

  it('sem os tipos aceitos, a escolha do ativo não filtra o tipo', async () => {
    const filtros: (string | null)[] = [];
    desenhar(
      { definicao: definicao({ rotulo: 'Computador', tipo: 'ativo' }) },
      {
        'GET /api/ativos': (pedido: Request) => {
          filtros.push(new URL(pedido.url).searchParams.get('filtros'));
          return Response.json({
            itens: [],
            proximo: null,
            total: 0,
            permite: { cadastrar: true },
          });
        },
      },
    );
    const campo = screen.getByRole('combobox', { name: 'Computador' });
    campo.focus();
    fireEvent.change(campo, { target: { value: 'pc' } });
    await waitFor(() => expect(filtros).not.toHaveLength(0));
    expect(filtros[0]).toBeNull();
  });

  it('no cadastro, o arquivo e a imagem dizem que são enviados depois, sem o envio', () => {
    desenhar({ definicao: definicao({ rotulo: 'PDF da nota fiscal', tipo: 'arquivo' }) });
    const arquivo = screen.getByRole('group', { name: 'PDF da nota fiscal' });
    expect(within(arquivo).getByText('PDF da nota fiscal')).toBeTruthy();
    expect(arquivo.getAttribute('aria-describedby')).toBeTruthy();
    expect(within(arquivo).getByText('Envie depois de cadastrar o ativo.')).toBeTruthy();
    expect(within(arquivo).queryByRole('button')).toBeNull();
    cleanup();
    desenhar({ definicao: definicao({ rotulo: 'Foto da etiqueta', tipo: 'imagem' }) });
    const imagem = screen.getByRole('group', { name: 'Foto da etiqueta' });
    expect(within(imagem).getByText('Envie depois de cadastrar o ativo.')).toBeTruthy();
    expect(within(imagem).queryByRole('button')).toBeNull();
  });

  it('só para leitura, mostra o valor como texto, com as referências pelo nome', () => {
    desenhar({
      definicao: definicao({ rotulo: 'Local', tipo: 'local' }),
      entrada: 'expedicao',
      soLeitura: true,
      nomeDoRegistro: (id) => (id === 'expedicao' ? 'Jundiaí › Expedição' : undefined),
    });
    const campo = screen.getByRole('textbox', { name: 'Local' }) as HTMLInputElement;
    expect(campo.readOnly).toBe(true);
    expect(campo.value).toBe('Jundiaí › Expedição');
    cleanup();
    desenhar({ definicao: CRITICIDADE, entrada: 'op-media', soLeitura: true });
    expect((screen.getByRole('textbox', { name: 'Criticidade' }) as HTMLInputElement).value).toBe(
      'Média',
    );
  });

  it('mostra o estado do campo e a trava, que só quem edita muda', () => {
    const aoMudarTrava = vi.fn();
    desenhar({
      definicao: definicao({ rotulo: 'Hostname' }),
      estado: {
        origem: 'manual',
        momento: '2026-10-09T17:32:00.000Z',
        autor: { id: 'c1', nome: 'Ana Souza' },
        trava: false,
      },
      aoMudarTrava,
    });
    expect(screen.getByText(/^Manual · Ana Souza · \d\d\/10\/2026 \d\d:32$/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Trava de Hostname' }));
    expect(aoMudarTrava).toHaveBeenCalledWith(true);
    cleanup();
    desenhar({ definicao: definicao({ rotulo: 'Hostname' }), soLeitura: true, travado: true });
    expect(screen.queryByRole('button', { name: 'Trava de Hostname' })).toBeNull();
    expect(screen.getByText('Travado')).toBeDefined();
  });

  it('o texto longo, a lista múltipla, o arquivo e a imagem ocupam a linha inteira da grade', () => {
    const casos: [DefinicaoNoAtivo, string | undefined][] = [
      [definicao({ rotulo: 'Observações', tipo: 'texto-longo' }), 'linha'],
      [{ ...CRITICIDADE, tipo: 'lista-multipla' }, 'linha'],
      [definicao({ rotulo: 'PDF da nota fiscal', tipo: 'arquivo' }), 'linha'],
      [definicao({ rotulo: 'Foto da etiqueta', tipo: 'imagem' }), 'linha'],
      [definicao({ rotulo: 'Hostname', tipo: 'texto' }), undefined],
      [definicao({ rotulo: 'Vida útil', tipo: 'inteiro' }), undefined],
      [definicao({ rotulo: 'Garantia até', tipo: 'data' }), undefined],
      [CRITICIDADE, undefined],
    ];
    for (const [campo, largura] of casos) {
      const { container } = render(
        <CampoDoAtivo
          definicao={campo}
          entrada={entradaInicial(campo, undefined)}
          aoMudar={vi.fn()}
          soLeitura={false}
          nomeDoRegistro={() => undefined}
          travado={false}
        />,
        { wrapper: comApi({}) },
      );
      expect((container.firstElementChild as HTMLElement).dataset.largura, campo.tipo).toBe(
        largura,
      );
      cleanup();
    }
  });

  it('o campo restrito diz que é restrito', () => {
    desenhar({ definicao: definicao({ rotulo: 'Custo do contrato', restrito: true }) });
    expect(
      screen.getByText('Restrito: só quem vê os campos restritos vê este valor.'),
    ).toBeDefined();
  });
});
