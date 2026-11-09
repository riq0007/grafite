// O módulo Operação no registro (spec modulo-operacao, "Operação no dock" e "Operação atualizada
// pelos eventos"; change p4b-consumiveis, design, decisões 6 e 7; change p4c-estoque, design,
// decisão 7; change p4d-solicitacoes, design, decisão 8; change p4f-indicadores-da-operacao,
// design, decisões 6 e 10): depois do Alertas e antes do Cofre, em "Mais" no celular, para quem vê
// os consumíveis, o estoque, as solicitações ou as OS, com o menu de cada um, os indicadores, a
// busca e as consultas que os eventos relêem.
import { fechamento, type Permissao } from '@grafite/domain';
import { describe, expect, it, vi } from 'vitest';
import type { ClienteDaApi } from '../../api/cliente.ts';
import { buscarNasEntradas } from '../../busca/casamento.ts';
import { entradasDoRegistro } from '../../busca/fontes.ts';
import { REGISTRO } from '../registro.ts';
import { itensPermitidos, registroDaConta } from '../registroDaConta.ts';
import { CHAVE_DO_CONSUMIVEL, CHAVE_DOS_CONSUMIVEIS } from './consumiveis/consultas.ts';
import { CHAVE_DOS_INDICADORES_DA_OPERACAO } from './indicadores/consultas.ts';
import { operacao } from './modulo.ts';
import { CHAVE_DAS_ORDENS } from './ordens/consultas.ts';
import { CHAVE_DAS_SOLICITACOES } from './solicitacoes/consultas.ts';
import { SolicitacoesNaFichaDoAtivo } from './solicitacoes/NaFichaDoAtivo.tsx';

const com =
  (...permissoes: Permissao[]) =>
  (chave: Permissao) =>
    permissoes.includes(chave);

/** As permissões incluídas também valem, como no acesso da sessão. */
const comIncluidas = (...permissoes: Permissao[]) => {
  const todas = fechamento(permissoes);
  return (chave: Permissao) => todas.has(chave);
};

describe('o módulo Operação no registro', () => {
  it('fica depois do Alertas e antes do Mapa, e no celular em "Mais"', () => {
    const ids = REGISTRO.map((modulo) => modulo.id);
    expect(ids.indexOf('operacao')).toBe(ids.indexOf('alertas') + 1);
    expect(ids.indexOf('mapa')).toBe(ids.indexOf('operacao') + 1);
    expect(operacao).toMatchObject({
      nome: 'Operação',
      endereco: '/operacao',
      prioridadeNoCelular: 'mais',
    });
  });

  it('Conta sem a permissão: aparece para quem vê os consumíveis, o estoque, as solicitações ou as OS, e some com o módulo desligado', () => {
    const comOperacao = (pode: (chave: Permissao) => boolean, desligados: string[] = []) =>
      registroDaConta(REGISTRO, pode, desligados).some((modulo) => modulo.id === 'operacao');
    expect(comOperacao(com('consumiveis.ver'))).toBe(true);
    expect(comOperacao(com('consumiveis.editar'))).toBe(true);
    expect(comOperacao(com('estoque.ver'))).toBe(true);
    expect(comOperacao(com('estoque.movimentar'))).toBe(true);
    expect(comOperacao(com('solicitacoes.ver'))).toBe(true);
    expect(comOperacao(com('solicitacoes.atender'))).toBe(true);
    expect(comOperacao(com('ordens.ver'))).toBe(true);
    expect(comOperacao(com('ordens.atender'))).toBe(true);
    expect(comOperacao(com('operacao.administrar'))).toBe(true);
    expect(comOperacao(com('ativos.ver', 'fornecedores.ver'))).toBe(false);
    expect(comOperacao(com('estoque.ver'), ['operacao'])).toBe(false);
  });

  it('o menu tem Início, Consumíveis, Estoque, Movimentações, Solicitações, Ordens de serviço e Indicadores, cada um com a permissão dele', () => {
    const rotulos = (pode: (chave: Permissao) => boolean) =>
      itensPermitidos(operacao.menu ?? [], pode).map((item) => item.rotulo);
    expect(
      rotulos(com('consumiveis.ver', 'estoque.ver', 'solicitacoes.ver', 'ordens.ver')),
    ).toEqual([
      'Início',
      'Consumíveis',
      'Estoque',
      'Movimentações',
      'Solicitações',
      'Ordens de serviço',
      'Indicadores',
    ]);
    expect(rotulos(com('consumiveis.ver'))).toEqual(['Início', 'Consumíveis']);
    expect(operacao.menu).toContainEqual({
      rotulo: 'Indicadores',
      destino: '/operacao/indicadores',
      permissoes: ['ordens.ver', 'estoque.ver'],
    });
  });

  it('Almoxarife sem os consumíveis: o menu mostra Início, Estoque, Movimentações e Indicadores, sem Consumíveis', () => {
    expect(
      itensPermitidos(operacao.menu ?? [], comIncluidas('estoque.movimentar')).map(
        (item) => item.rotulo,
      ),
    ).toEqual(['Início', 'Estoque', 'Movimentações', 'Indicadores']);
  });

  it('Quem administra a operação: o menu mostra Início, Estoque, Movimentações, Ordens de serviço e Indicadores', () => {
    expect(
      itensPermitidos(operacao.menu ?? [], comIncluidas('operacao.administrar')).map(
        (item) => item.rotulo,
      ),
    ).toEqual(['Início', 'Estoque', 'Movimentações', 'Ordens de serviço', 'Indicadores']);
  });

  it('Atendente só das solicitações: o menu mostra só Início e Solicitações', () => {
    expect(
      itensPermitidos(operacao.menu ?? [], comIncluidas('solicitacoes.atender')).map(
        (item) => item.rotulo,
      ),
    ).toEqual(['Início', 'Solicitações']);
    expect(operacao.menu).toContainEqual({
      rotulo: 'Solicitações',
      destino: '/operacao/solicitacoes',
      permissoes: ['solicitacoes.ver', 'solicitacoes.atender'],
    });
  });

  it('Técnico só das OS: o menu mostra só Início, Ordens de serviço e Indicadores', () => {
    expect(
      itensPermitidos(operacao.menu ?? [], comIncluidas('ordens.atender')).map(
        (item) => item.rotulo,
      ),
    ).toEqual(['Início', 'Ordens de serviço', 'Indicadores']);
    expect(operacao.menu).toContainEqual({
      rotulo: 'Ordens de serviço',
      destino: '/operacao/ordens',
      permissoes: ['ordens.ver', 'ordens.atender'],
    });
  });

  it('Nova OS pela busca: a ação abre as Ordens de serviço com o formulário, para quem atende as OS', () => {
    const nova = (operacao.busca?.entradas ?? []).find((entrada) => entrada.id === 'nova-ordem');
    expect(nova).toMatchObject({
      rotulo: 'Nova ordem de serviço',
      grupo: 'acoes',
      caminho: 'Operação › Ordens de serviço',
      permissoes: ['ordens.atender'],
    });
    const navegar = vi.fn();
    nova?.executar?.({ navegar, mudarPreferencias: vi.fn(), abrirNotificacoes: vi.fn() });
    expect(navegar).toHaveBeenCalledWith('/operacao/ordens?nova=1');
    const acoes = buscarNasEntradas('ordem', entradasDoRegistro([operacao])).find(
      (grupo) => grupo.id === 'acoes',
    );
    expect(acoes?.resultados[0]?.rotulo).toBe('Nova ordem de serviço');
  });

  it('Novo consumível pela busca: a busca oferece a ação a quem edita os consumíveis', () => {
    expect(operacao.busca?.entradas).toContainEqual(
      expect.objectContaining({
        rotulo: 'Novo consumível',
        grupo: 'acoes',
        caminho: 'Operação › Consumíveis',
        destino: '/operacao/consumiveis/novo',
        permissoes: ['consumiveis.editar'],
      }),
    );
    const telas = entradasDoRegistro([operacao]);
    for (const rotulo of [
      'Consumíveis',
      'Estoque',
      'Movimentações',
      'Solicitações',
      'Ordens de serviço',
      'Indicadores',
    ]) {
      expect(telas).toContainEqual(expect.objectContaining({ rotulo, caminho: 'Operação' }));
    }
  });

  it('Indicadores pela busca: a busca oferece "Indicadores", no caminho "Operação", que leva à tela', () => {
    expect(entradasDoRegistro([operacao])).toContainEqual(
      expect.objectContaining({
        rotulo: 'Indicadores',
        grupo: 'ir-para',
        caminho: 'Operação',
        destino: '/operacao/indicadores',
      }),
    );
  });

  it('as ações de lançar abrem o Estoque com a gaveta, para quem movimenta o estoque', () => {
    const lancar = (operacao.busca?.entradas ?? []).filter((entrada) =>
      entrada.id.startsWith('lancar-'),
    );
    expect(lancar.map(({ rotulo }) => rotulo)).toEqual([
      'Nova entrada no estoque',
      'Nova saída do estoque',
      'Nova transferência no estoque',
      'Novo ajuste do estoque',
    ]);
    for (const entrada of lancar) {
      expect(entrada).toMatchObject({
        grupo: 'acoes',
        caminho: 'Operação › Estoque',
        permissoes: ['estoque.movimentar'],
      });
    }
    const navegar = vi.fn();
    const [entrada] = lancar;
    entrada?.executar?.({ navegar, mudarPreferencias: vi.fn(), abrirNotificacoes: vi.fn() });
    expect(navegar).toHaveBeenCalledWith('/operacao/estoque?lancar=entrada');
  });

  it('Toner pela busca e Conserto pela busca: as ações de registrar abrem as Solicitações com o formulário do tipo', () => {
    const registrar = (operacao.busca?.entradas ?? []).filter((entrada) =>
      entrada.id.startsWith('nova-solicitacao-'),
    );
    expect(registrar.map(({ rotulo }) => rotulo)).toEqual([
      'Nova solicitação de toner',
      'Nova solicitação de conserto',
      'Nova solicitação de equipamento',
    ]);
    for (const entrada of registrar) {
      expect(entrada).toMatchObject({
        grupo: 'acoes',
        caminho: 'Operação › Solicitações',
        permissoes: ['solicitacoes.atender'],
      });
    }
    const navegar = vi.fn();
    for (const entrada of registrar) {
      entrada.executar?.({ navegar, mudarPreferencias: vi.fn(), abrirNotificacoes: vi.fn() });
    }
    expect(navegar.mock.calls).toEqual([
      ['/operacao/solicitacoes?nova=toner'],
      ['/operacao/solicitacoes?nova=conserto'],
      ['/operacao/solicitacoes?nova=equipamento'],
    ]);
    // "toner" traz primeiro a ação que tem a palavra no nome.
    const acoes = buscarNasEntradas('toner', entradasDoRegistro([operacao])).find(
      (grupo) => grupo.id === 'acoes',
    );
    expect(acoes?.resultados[0]?.rotulo).toBe('Nova solicitação de toner');
    const conserto = buscarNasEntradas('conserto', entradasDoRegistro([operacao])).find(
      (grupo) => grupo.id === 'acoes',
    );
    expect(conserto?.resultados.map(({ rotulo }) => rotulo)).toEqual([
      'Nova solicitação de conserto',
    ]);
  });

  it('Consumível pela busca: o provedor traz os consumíveis pelo código, cada um levando à ficha', async () => {
    const [provedor] = operacao.busca?.provedores ?? [];
    expect(provedor).toMatchObject({ grupo: 'Consumíveis', permissoes: ['consumiveis.ver'] });
    const GET = vi.fn(async () => ({
      data: {
        itens: [
          {
            id: 'cf258a',
            codigo: 'CF258A',
            nome: 'HP 58A',
            tipo: 'toner',
            cor: 'preto',
            situacao: 'ativo',
          },
          {
            id: 'cf258x',
            codigo: 'CF258X',
            nome: null,
            tipo: 'toner',
            cor: null,
            situacao: 'inativo',
          },
        ],
        total: 2,
      },
      error: undefined,
    }));
    const api = { GET } as unknown as ClienteDaApi;
    const resultado = await provedor?.buscar('cf258', new AbortController().signal, api);
    expect(GET).toHaveBeenCalledWith('/consumiveis', {
      params: { query: { busca: 'cf258', situacao: 'todos', limite: 8 } },
      signal: expect.any(AbortSignal),
    });
    expect(resultado).toEqual({
      itens: [
        {
          id: 'cf258a',
          rotulo: 'CF258A',
          caminho: 'HP 58A · Toner, Preto',
          destino: '/operacao/consumiveis/cf258a',
        },
        {
          id: 'cf258x',
          rotulo: 'CF258X',
          caminho: 'Toner · Inativo',
          destino: '/operacao/consumiveis/cf258x',
        },
      ],
      total: 2,
    });
    expect(provedor?.verTodos?.('cf 258')).toBe('/operacao/consumiveis?busca=cf%20258');
  });

  it('o Novo consumível abre numa aba, no alvo consumivel, para quem edita os consumíveis', () => {
    expect(operacao.cadastros).toEqual([
      expect.objectContaining({
        alvo: 'consumivel',
        titulo: 'Novo consumível',
        link: 'Cadastrar novo consumível',
        permissoes: ['consumiveis.editar'],
      }),
    ]);
  });

  it('o evento dos consumíveis relê as listas e a ficha do consumível do alvo', () => {
    const relidas = operacao.eventos?.['consumiveis.mudaram']?.({
      id: 'e1',
      tipo: 'consumiveis.mudaram',
      momento: '2026-10-19T10:00:00.000Z',
      alvo: { tipo: 'consumivel', id: 'cf258a' },
    });
    expect(relidas).toEqual([
      CHAVE_DOS_CONSUMIVEIS,
      [...CHAVE_DO_CONSUMIVEL, 'cf258a'],
      CHAVE_DOS_INDICADORES_DA_OPERACAO,
    ]);
  });

  it('as solicitações do ativo na ficha dele, para quem vê as solicitações', () => {
    expect(operacao.relacoes).toContainEqual(
      expect.objectContaining({
        alvo: 'ativo',
        componente: SolicitacoesNaFichaDoAtivo,
        permissoes: ['solicitacoes.ver', 'solicitacoes.atender'],
      }),
    );
  });

  it('o evento das OS relê as OS, as solicitações, porque a ficha do conserto mostra a OS, e os indicadores', () => {
    const relidas = operacao.eventos?.['ordens.mudaram']?.({
      id: 'e3',
      tipo: 'ordens.mudaram',
      momento: '2026-10-22T10:00:00.000Z',
      alvo: { tipo: 'ordem', id: 'o12' },
    });
    expect(relidas).toEqual([
      CHAVE_DAS_ORDENS,
      CHAVE_DAS_SOLICITACOES,
      CHAVE_DOS_INDICADORES_DA_OPERACAO,
    ]);
  });

  it('o estoque e as metas relêem os indicadores da operação', () => {
    const evento = (tipo: 'estoque.mudou' | 'metas.mudaram') =>
      operacao.eventos?.[tipo]?.({
        id: 'e4',
        tipo,
        momento: '2026-10-22T10:00:00.000Z',
        alvo: { tipo: 'indicador', id: 'i1' },
      });
    expect(evento('estoque.mudou')).toContainEqual(CHAVE_DOS_INDICADORES_DA_OPERACAO);
    expect(evento('metas.mudaram')).toEqual([CHAVE_DOS_INDICADORES_DA_OPERACAO]);
  });

  it('o evento das solicitações relê a lista e as fichas das solicitações', () => {
    const relidas = operacao.eventos?.['solicitacoes.mudaram']?.({
      id: 'e2',
      tipo: 'solicitacoes.mudaram',
      momento: '2026-10-21T10:00:00.000Z',
      alvo: { tipo: 'solicitacao', id: 's42' },
    });
    expect(relidas).toEqual([CHAVE_DAS_SOLICITACOES]);
  });
});
