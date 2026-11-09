// As relações do ativo à vista na tabela e na prévia (spec cadastro-de-ativos, "Relações do ativo à
// vista"; change relacoes-vivas, decisão 2): o tipo, o modelo, o local e o responsável como
// referências com cartão, e só o texto para quem não abre a ficha deles.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { naOrganizacao } from '../../../teste/sessao.ts';
import { abrir, ativo, EXPEDICAO, linhas, lista, servidorDeAtivos, tabela } from './teste.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const COM_RELACOES =
  '/ativos?visao=fabrica&colunas=ativo.rotulo,ativo.tipo,ativo.modelo,ativo.local,ativo.responsavel';

const ALMOX = ativo('a1', 'Impressora do almoxarifado', {
  modelo: { id: 'm404', fabricante: 'HP', nome: 'LaserJet M404', imagem: null },
  local: { id: EXPEDICAO, caminho: 'Jundiaí › Expedição' },
  responsavel: { id: 'ana', nome: 'Ana Souza' },
});
const DO_RH = ativo('a2', 'Impressora do RH', {
  responsavel: { id: 'joao', nome: 'João Lima' },
  permite: { editar: false, verRestritos: false, verResponsavel: false },
});

const QUEM_VE_TUDO = naOrganizacao('ativos.ver', 'pessoas.ver', 'locais.editar');

const RESUMO_DE_ANA = {
  id: 'ana',
  nome: 'Ana Souza',
  situacao: 'ativa',
  foto: null,
  local: { id: EXPEDICAO, caminho: 'Jundiaí › Expedição' },
  temConta: true,
  ativos: { quantos: 3, recortada: false },
};

const link = (dentro: HTMLElement, nome: string) =>
  within(dentro).queryByRole('link', { name: nome });

const destino = (dentro: HTMLElement, nome: string) => link(dentro, nome)?.getAttribute('href');

/** O ponteiro do mouse sobre o elemento, como o navegador avisa ao entrar nele. */
const pararOPonteiro = (elemento: Element) =>
  act(() => {
    fireEvent.pointerOver(elemento, { pointerType: 'mouse' });
  });

describe('as referências na tabela dos ativos', () => {
  it('o tipo, o modelo, o local e o responsável levam às fichas deles', async () => {
    abrir(COM_RELACOES, servidorDeAtivos(() => lista([ALMOX, DO_RH])).servidor, QUEM_VE_TUDO);
    await tabela();
    const [almox] = await linhas();
    if (!almox) throw new Error('Sem a linha do almoxarifado.');
    expect(destino(almox, 'Impressora')).toBe('/gestao/catalogo/tipos/impressora');
    expect(destino(almox, 'HP LaserJet M404')).toBe('/gestao/catalogo/modelos/m404');
    expect(destino(almox, 'Jundiaí › Expedição')).toBe(`/administracao/locais?local=${EXPEDICAO}`);
    expect(destino(almox, 'Ana Souza')).toBe('/administracao/pessoas/ana');
  });

  it('sem ver a pessoa, o responsável é só o nome; sem a tela de locais, o local também', async () => {
    abrir(
      COM_RELACOES,
      servidorDeAtivos(() => lista([ALMOX, DO_RH])).servidor,
      naOrganizacao('ativos.ver', 'pessoas.ver'),
    );
    await tabela();
    const [almox, rh] = await linhas();
    if (!almox || !rh) throw new Error('Sem as linhas.');
    expect(link(rh, 'João Lima')).toBeNull();
    expect(within(rh).getByText('João Lima')).toBeTruthy();
    expect(link(almox, 'Jundiaí › Expedição')).toBeNull();
    expect(within(almox).getByText('Jundiaí › Expedição')).toBeTruthy();
    // O catálogo é de todos: o tipo e o modelo continuam links.
    expect(link(almox, 'HP LaserJet M404')).not.toBeNull();
  });

  it('o ponteiro parado sobre o responsável abre o cartão, que busca o resumo só então', async () => {
    const { servidor } = servidorDeAtivos(() => lista([ALMOX]));
    let resumos = 0;
    servidor['GET /api/pessoas/ana/resumo'] = () => {
      resumos += 1;
      return Response.json(RESUMO_DE_ANA);
    };
    abrir(COM_RELACOES, servidor, QUEM_VE_TUDO);
    await tabela();
    const [almox] = await linhas();
    const ana = almox && link(almox, 'Ana Souza');
    if (!ana) throw new Error('Sem a referência à Ana.');
    expect(resumos).toBe(0);
    await pararOPonteiro(ana);
    const cartao = await screen.findByRole(
      'dialog',
      { name: 'Resumo de Ana Souza' },
      { timeout: 2000 },
    );
    expect(await within(cartao).findByText('3 ativos sob responsabilidade')).toBeTruthy();
    expect(within(cartao).getByText('Jundiaí › Expedição')).toBeTruthy();
    expect(within(cartao).getByRole('link', { name: 'Abrir' }).getAttribute('href')).toBe(
      '/administracao/pessoas/ana',
    );
    // "Ver ativos" abre a tabela com a origem da pessoa.
    const verAtivos = new URL(
      within(cartao).getByRole('link', { name: 'Ver ativos' }).getAttribute('href') ?? '',
      'http://grafite.local',
    );
    expect(verAtivos.pathname).toBe('/ativos');
    expect(verAtivos.searchParams.get('origem')).toBe('pessoa:ana');
    expect(resumos).toBe(1);
  });

  it('a contagem recortada pelo escopo diz "que você vê"', async () => {
    const { servidor } = servidorDeAtivos(() => lista([ALMOX]));
    servidor['GET /api/pessoas/ana/resumo'] = () =>
      Response.json({ ...RESUMO_DE_ANA, ativos: { quantos: 1, recortada: true } });
    abrir(COM_RELACOES, servidor, QUEM_VE_TUDO);
    await tabela();
    const [almox] = await linhas();
    const ana = almox && link(almox, 'Ana Souza');
    if (!ana) throw new Error('Sem a referência à Ana.');
    await pararOPonteiro(ana);
    const cartao = await screen.findByRole(
      'dialog',
      { name: 'Resumo de Ana Souza' },
      { timeout: 2000 },
    );
    expect(
      await within(cartao).findByText('1 ativo sob responsabilidade que você vê'),
    ).toBeTruthy();
  });
});

describe('as referências na prévia do ativo', () => {
  it('a prévia mostra o tipo, o modelo, o local e o responsável como links', async () => {
    abrir(COM_RELACOES, servidorDeAtivos(() => lista([ALMOX])).servidor, QUEM_VE_TUDO);
    await tabela();
    const [almox] = await linhas();
    if (!almox) throw new Error('Sem a linha do almoxarifado.');
    almox.focus();
    fireEvent.keyDown(almox, { key: ' ' });
    const previa = await screen.findByRole('dialog', {
      name: 'Prévia: Impressora do almoxarifado',
    });
    expect(destino(previa, 'Impressora')).toBe('/gestao/catalogo/tipos/impressora');
    expect(destino(previa, 'HP LaserJet M404')).toBe('/gestao/catalogo/modelos/m404');
    expect(destino(previa, 'Jundiaí › Expedição')).toBe(`/administracao/locais?local=${EXPEDICAO}`);
    expect(destino(previa, 'Ana Souza')).toBe('/administracao/pessoas/ana');
  });
});
