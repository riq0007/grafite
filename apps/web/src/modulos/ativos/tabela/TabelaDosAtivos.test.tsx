import { filaDeAvisos } from '@grafite/ui';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { naOrganizacao } from '../../../teste/sessao.ts';
import {
  abrir,
  CUSTO,
  cabecalhos,
  celula,
  colunasGuardadas,
  DONO,
  FOTO,
  IP,
  linhas,
  linhasAgora,
  lista,
  M404,
  NOTA,
  RH,
  SENHA,
  servidorDeAtivos,
  tabela,
} from './teste.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

describe('a tabela dos ativos', () => {
  it('abre na visão de fábrica: a miniatura, o ativo com o tipo, o patrimônio, o local e a situação', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    const roteador = abrir('/ativos', servidor);
    expect(await cabecalhos()).toEqual(['Imagem', 'Ativo', 'Patrimônio', 'Local', 'Situação']);
    const [m404, rh] = await linhas();
    expect(m404?.textContent).toBe('HP LaserJet M404ImpressoraPAT-00412Jundiaí › ExpediçãoEm uso');
    expect(m404?.querySelector('img')?.getAttribute('src')).toBe(
      '/api/modelos/m404/imagem/img-1/64',
    );
    expect(rh?.textContent).toBe('Impressora do RHImpressora——Em manutenção');
    expect(screen.getByText('2 ativos')).toBeTruthy();
    await waitFor(() => expect(roteador.state.location.search).toEqual({ visao: 'fabrica' }));
    const pedido = pedidos[0];
    expect(pedido?.get('colunas')).toBe('ativo.rotulo,ativo.patrimonio,ativo.local,ativo.situacao');
    expect(pedido?.get('ordem')).toBe('ativo.criado-em');
    expect(pedido?.get('direcao')).toBe('decrescente');
    expect(JSON.parse(pedido?.get('filtros') ?? '')).toEqual([
      { chave: 'ativo.situacao', operador: 'situacao', situacao: 'ativos' },
    ]);
    expect(pedido?.has('situacao')).toBe(false);
    expect(pedido?.get('fuso')).toBeTruthy();
  });

  it('a miniatura é a imagem do próprio ativo, quando ele tem uma, e não a do modelo', async () => {
    const comImagem = { ...M404, imagem: { id: 'img-a' } };
    abrir('/ativos', servidorDeAtivos(() => lista([comImagem, RH])).servidor);
    const [m404, rh] = await linhas();
    expect(m404?.querySelector('img')?.getAttribute('src')).toBe('/api/ativos/a1/imagem/img-a/64');
    expect(rh?.querySelector('img')).toBeNull();
  });

  it('as colunas do endereço: as referências, a fonte mono, os números à direita e o restrito', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    abrir(`/ativos?visao=fabrica&colunas=ativo.rotulo,${IP},${DONO},${CUSTO},${SENHA}`, servidor);
    expect(await cabecalhos()).toEqual(['Imagem', 'Ativo', 'IP', 'Dono', 'Custo', 'Senha do BIOS']);
    const [m404, rh] = await linhas();
    expect(celula(m404, 2).textContent).toBe('10.0.0.12');
    expect(celula(m404, 2).getAttribute('data-mono')).toBe('');
    expect(celula(m404, 3).textContent).toBe('Bruno Lima');
    expect(celula(m404, 4).textContent).toBe('R$ 1.500,50');
    expect(celula(m404, 4).getAttribute('data-alinhamento')).toBe('fim');
    expect(celula(m404, 5).textContent).toBe('segredo');
    expect(celula(rh, 5).textContent).toBe('Fora do seu acesso');
    expect(pedidos[0]?.get('colunas')).toBe(`ativo.rotulo,${IP},${DONO},${CUSTO},${SENHA}`);
  });

  it('o arquivo aparece pelo nome, e a imagem, pela miniatura do tamanho da linha', async () => {
    abrir(
      `/ativos?visao=fabrica&colunas=ativo.rotulo,${NOTA},${FOTO}`,
      servidorDeAtivos().servidor,
    );
    expect(await cabecalhos()).toEqual([
      'Imagem',
      'Ativo',
      'PDF da nota fiscal',
      'Foto da etiqueta',
    ]);
    const [m404, rh] = await linhas();
    expect(celula(m404, 2).textContent).toBe('nota-fiscal-1234.pdf');
    const foto = celula(m404, 3).querySelector('img');
    expect(foto?.getAttribute('src')).toBe(`/api/ativos/a1/campos/${FOTO}/arquivo/f-et/64`);
    expect(foto?.getAttribute('alt')).toBe('etiqueta.png');
    expect(celula(rh, 2).textContent).toBe('—');
    expect(celula(rh, 3).textContent).toBe('—');
  });

  it('sem os restritos, a coluna do campo restrito não é oferecida', async () => {
    abrir(
      `/ativos?visao=fabrica&colunas=ativo.rotulo,${SENHA}`,
      servidorDeAtivos().servidor,
      naOrganizacao('ativos.ver'),
    );
    expect(await cabecalhos()).toEqual(['Imagem', 'Ativo']);
  });

  it('o painel "Colunas" mostra a coluna marcada no fim, guardada na conta', async () => {
    const { servidor, pedidos, gravacoes } = servidorDeAtivos();
    const roteador = abrir('/ativos', servidor);
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }));
    const painel = await screen.findByRole('dialog', { name: 'Colunas' });
    fireEvent.click(within(painel).getByRole('checkbox', { name: 'IP' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('colunas')).toContain(IP));
    expect((await cabecalhos()).at(-1)).toBe('IP');
    await waitFor(() =>
      expect(gravacoes.at(-1)).toMatchObject({ metodo: 'PUT', visao: 'fabrica' }),
    );
    expect(colunasGuardadas(gravacoes)).toEqual([
      'ativo.rotulo',
      'ativo.patrimonio',
      'ativo.local',
      'ativo.situacao',
      IP,
    ]);
    expect(roteador.state.location.search).toEqual({ visao: 'fabrica' });
  });

  it('ocultar pelo menu da coluna e ordenar pelo rótulo mudam o pedido e ficam na conta', async () => {
    const { servidor, pedidos, gravacoes } = servidorDeAtivos();
    const roteador = abrir('/ativos', servidor);
    await tabela();
    fireEvent.click(screen.getByRole('button', { name: 'Opções da coluna Local' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ocultar coluna' }));
    await waitFor(() =>
      expect(pedidos.at(-1)?.get('colunas')).toBe('ativo.rotulo,ativo.patrimonio,ativo.situacao'),
    );
    fireEvent.click(await screen.findByRole('columnheader', { name: /Patrimônio/ }));
    await waitFor(() => expect(pedidos.at(-1)?.get('ordem')).toBe('ativo.patrimonio'));
    expect(pedidos.at(-1)?.get('direcao')).toBe('crescente');
    await waitFor(() =>
      expect(gravacoes.at(-1)).toMatchObject({
        metodo: 'PUT',
        visao: 'fabrica',
        definicao: { ordenacao: { chave: 'ativo.patrimonio', direcao: 'crescente' } },
      }),
    );
    expect(colunasGuardadas(gravacoes)).toEqual([
      'ativo.rotulo',
      'ativo.patrimonio',
      'ativo.situacao',
    ]);
    expect(roteador.state.location.search).toEqual({ visao: 'fabrica' });
  });

  it('a primeira faixa diz quantos ativos a tabela tem, e a segunda some sem filtro nem seleção', async () => {
    abrir('/ativos', servidorDeAtivos().servidor);
    await tabela();
    const primeira = document.querySelector('[data-faixa="primeira"]') as HTMLElement;
    expect(within(primeira).getByText('2 ativos')).toBeTruthy();
    expect(document.querySelector('[data-faixa="segunda"]')).toBeNull();
  });

  it('com linhas selecionadas, a segunda faixa vira a das ações em lote, na ordem do menu', async () => {
    abrir('/ativos', servidorDeAtivos().servidor);
    await tabela();
    const [m404, rh] = await linhas();
    fireEvent.click(within(m404 as HTMLElement).getByText('PAT-00412'), { ctrlKey: true });
    fireEvent.click(within(rh as HTMLElement).getByText('Impressora do RH'), { ctrlKey: true });
    const acoes = screen.getByRole('toolbar', { name: 'Ações da seleção' });
    expect(within(acoes).getByText('2 selecionados')).toBeTruthy();
    expect(
      within(acoes)
        .getAllByRole('button')
        .map((botao) => botao.textContent),
    ).toEqual(['Prévia', 'Copiar linhas', 'Imprimir etiquetas', 'Limpar seleção']);
    fireEvent.click(within(acoes).getByRole('button', { name: 'Limpar seleção' }));
    await waitFor(() =>
      expect(screen.queryByRole('toolbar', { name: 'Ações da seleção' })).toBeNull(),
    );
  });

  it('na primeira carga, o esqueleto das linhas sob as colunas, sem texto solto', async () => {
    const { servidor } = servidorDeAtivos(() => lista([M404, RH]));
    let responder: (resposta: Response) => void = () => {};
    servidor['GET /api/ativos'] = () =>
      new Promise<Response>((resolver) => {
        responder = resolver;
      });
    abrir('/ativos', servidor);
    const grade = await tabela();
    await waitFor(() => expect(grade.getAttribute('aria-busy')).toBe('true'));
    expect(document.querySelectorAll('[data-esqueleto-da-linha]').length).toBeGreaterThan(0);
    expect(within(grade).getAllByRole('columnheader').length).toBeGreaterThan(1);
    expect(screen.queryByText('Carregando os ativos…')).toBeNull();
    responder(lista([M404, RH]));
    await waitFor(() => expect(grade.getAttribute('aria-busy')).toBeNull());
    expect(document.querySelector('[data-esqueleto-da-linha]')).toBeNull();
  });

  it('trocar a busca mantém as linhas de antes, ocupadas, e a contagem diz "Atualizando"', async () => {
    const { servidor } = servidorDeAtivos();
    abrir('/ativos', servidor);
    const grade = await tabela();
    await linhas();
    let responder: (resposta: Response) => void = () => {};
    servidor['GET /api/ativos'] = () =>
      new Promise<Response>((resolver) => {
        responder = resolver;
      });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar ativos' }), {
      target: { value: 'laserjet' },
    });
    await waitFor(() => expect(grade.getAttribute('aria-busy')).toBe('true'));
    expect(linhasAgora(grade)).toHaveLength(2);
    const primeira = document.querySelector('[data-faixa="primeira"]') as HTMLElement;
    expect(within(primeira).getByText('Atualizando…')).toBeTruthy();
    responder(lista([M404]));
    await waitFor(() => expect(grade.getAttribute('aria-busy')).toBeNull());
    expect(await linhas()).toHaveLength(1);
    expect(within(primeira).getByText('1 ativo')).toBeTruthy();
  });

  it('a busca vai ao endereço e ao pedido, sem marcar a visão como alterada', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    const roteador = abrir('/ativos', servidor);
    await tabela();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar ativos' }), {
      target: { value: 'laserjet' },
    });
    await waitFor(() => expect(pedidos.at(-1)?.get('busca')).toBe('laserjet'));
    expect(roteador.state.location.search).toEqual({ visao: 'fabrica', busca: 'laserjet' });
  });

  it('o link antigo com o tipo vira o filtro da coluna', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    const roteador = abrir('/ativos?tipo=impressora', servidor);
    await tabela();
    const tipo = { chave: 'ativo.tipo', operador: 'qualquer', valores: ['impressora'] };
    await waitFor(() =>
      expect(roteador.state.location.search).toEqual({
        visao: 'fabrica',
        filtros: [{ chave: 'ativo.situacao', operador: 'situacao', situacao: 'ativos' }, tipo],
      }),
    );
    await waitFor(() =>
      expect(JSON.parse(pedidos.at(-1)?.get('filtros') ?? '')).toContainEqual(tipo),
    );
  });

  it('Ctrl+C copia a linha em foco com os rótulos, e diz quantas copiou', async () => {
    const escrever = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escrever },
      configurable: true,
    });
    abrir('/ativos', servidorDeAtivos().servidor);
    const [m404] = await linhas();
    (m404 as HTMLElement).focus();
    fireEvent.keyDown(m404 as HTMLElement, { key: 'c', ctrlKey: true });
    await waitFor(() =>
      expect(escrever).toHaveBeenCalledWith(
        'Ativo\tPatrimônio\tLocal\tSituação\nHP LaserJet M404\tPAT-00412\tJundiaí › Expedição\tEm uso',
      ),
    );
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain('1 linha copiada.'),
    );
  });

  it('a linha abre a ficha, e "Novo ativo" abre o cadastro', async () => {
    const roteador = abrir('/ativos', servidorDeAtivos().servidor);
    const [primeira] = await linhas();
    fireEvent.click(within(primeira as HTMLElement).getByText('PAT-00412'));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ativos/a1'));
    await roteador.navigate({ to: '/ativos' });
    fireEvent.click(await screen.findByRole('button', { name: 'Novo ativo' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ativos/novo'));
  });

  it('sem as visões, diz a falha e tenta de novo', async () => {
    let falhar = true;
    const { servidor } = servidorDeAtivos();
    abrir('/ativos', {
      ...servidor,
      'GET /api/visoes': () =>
        falhar
          ? Response.json(
              {
                type: 'urn:grafite:problema:erro-interno',
                title: 'Erro',
                status: 500,
                detail: 'Erro interno.',
                codigoDeRastreio: 'R7K2-9QXM',
              },
              { status: 500 },
            )
          : Response.json({ visoes: [], permite: { compartilhar: false } }),
    });
    const tentar = await screen.findByRole('button', { name: 'Tentar de novo' });
    expect(screen.getByText(/Não foi possível carregar as visões/)).toBeTruthy();
    falhar = false;
    fireEvent.click(tentar);
    expect(await tabela()).toBeTruthy();
  });

  it('vazia, diz que não achou e oferece "Novo ativo"', async () => {
    abrir('/ativos', servidorDeAtivos(() => lista([])).servidor);
    const vazio = (await screen.findByText('Nenhum ativo encontrado.'))
      .parentElement as HTMLElement;
    expect(within(vazio).getByRole('button', { name: 'Novo ativo' })).toBeTruthy();
  });

  it('só com ativos.ver, sem "Novo ativo"; e quem só cuida do catálogo vai aos tipos', async () => {
    abrir('/ativos', servidorDeAtivos().servidor, naOrganizacao('ativos.ver'));
    await tabela();
    expect(screen.queryByRole('button', { name: 'Novo ativo' })).toBeNull();
    cleanup();
    const roteador = abrir(
      '/ativos',
      servidorDeAtivos().servidor,
      naOrganizacao('catalogo.administrar'),
    );
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/catalogo/tipos'));
  });
});
