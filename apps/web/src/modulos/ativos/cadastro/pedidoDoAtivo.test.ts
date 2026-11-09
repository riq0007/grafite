import { type CampoNoCatalogo, CHAVE_DO_MODELO, camposDoAtivo } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import { errosDaRecusa, montarPedidoDoAtivo } from './pedidoDoAtivo.ts';

const IP: CampoNoCatalogo = {
  id: 'c-ip',
  rotulo: 'IP',
  tipo: 'ip',
  grupo: 'Rede',
  configuracao: {},
  restrito: false,
  escrita: 'automatica',
  situacao: 'ativo',
};

const definicoes = camposDoAtivo({
  tipo: { capacidades: [], campos: [{ campoId: 'c-ip', obrigatorio: true }] },
  campos: [IP],
});

describe('montarPedidoDoAtivo', () => {
  it('no cadastro, vai o que foi preenchido, o modelo escolhido e as travas ligadas', () => {
    const montagem = montarPedidoDoAtivo({
      definicoes,
      entradas: { 'c-ip': '10.0.4.12', 'ativo.patrimonio': 'PAT-0142', 'ativo.nome': '' },
      iniciais: {},
      travas: { 'ativo.local': true },
      travasIniciais: {},
      modeloId: 'm-404',
      ficha: null,
    });
    expect(montagem).toEqual({
      ok: true,
      pedido: {
        modeloId: 'm-404',
        valores: { 'c-ip': '10.0.4.12', 'ativo.patrimonio': 'PAT-0142' },
        travas: { 'ativo.local': true },
      },
    });
  });

  it('no cadastro, o obrigatório vazio é recusado no campo, pelo motor de campos', () => {
    const montagem = montarPedidoDoAtivo({
      definicoes,
      entradas: { 'ativo.patrimonio': 'PAT-0142' },
      iniciais: {},
      travas: {},
      travasIniciais: {},
      modeloId: null,
      ficha: null,
    });
    expect(montagem).toEqual({ ok: false, erros: { 'c-ip': 'Preencha este campo.' } });
  });

  it('na ficha, vai só o que mudou: o valor, a trava e o modelo', () => {
    const montagem = montarPedidoDoAtivo({
      definicoes,
      entradas: { 'c-ip': '10.0.4.13', 'ativo.patrimonio': 'PAT-0142' },
      iniciais: { 'c-ip': '10.0.4.12', 'ativo.patrimonio': 'PAT-0142' },
      travas: { 'c-ip': true, 'ativo.local': false },
      travasIniciais: { 'ativo.local': false },
      modeloId: 'm-404',
      ficha: {
        valores: { 'c-ip': '10.0.4.12', 'ativo.patrimonio': 'PAT-0142' },
        modeloId: 'm-404',
      },
    });
    expect(montagem).toEqual({
      ok: true,
      pedido: { valores: { 'c-ip': '10.0.4.13' }, travas: { 'c-ip': true } },
    });
  });
});

describe('errosDaRecusa', () => {
  it('traz a recusa da API para a chave do campo do formulário', () => {
    expect(
      errosDaRecusa({
        'valores.c-ip': 'Use um IPv4.',
        modeloId: 'Modelo inativo.',
        outro: undefined,
      }),
    ).toEqual({ 'c-ip': 'Use um IPv4.', [CHAVE_DO_MODELO]: 'Modelo inativo.', outro: '' });
  });
});
