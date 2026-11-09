// Os pedidos ao coletor (spec coletor-local, "Pedidos ao coletor"; change p5a-backup-do-control-id,
// design, decisão 3): cada pedido é feito e respondido, com o ZIP ou com a falha, um por vez; a
// busca que a API recusa não responde nada.
import { describe, expect, it } from 'vitest';
import { criarBuscaDePedidos, type PedidoDoColetor } from './pedidos.ts';

const pedido = (id: string): PedidoDoColetor => ({
  id,
  tipo: 'backup',
  ativoId: '0199d3a0-0000-7000-8000-0000000000d1',
  rotulo: 'Controle',
  ip: '10.0.7.78',
  porta: 80,
  usuario: 'admin',
  senha: 'x',
});

const log = { info: () => {}, warn: () => {} };

describe('a busca dos pedidos', () => {
  it('faz cada pedido e responde com o ZIP ou com a falha', async () => {
    const respostas: string[] = [];
    const busca = criarBuscaDePedidos({
      api: {
        pedidos: async () => ({
          tipo: 'ok',
          dados: { pedidos: [pedido('a'), pedido('b')], proximaEm: 15 },
        }),
        arquivoDoPedido: async (id, conteudo) => {
          respostas.push(`zip ${id} ${conteudo.length}`);
          return { tipo: 'ok', dados: {} };
        },
        zipDoPedido: async () => ({ tipo: 'ok', dados: Buffer.from('zip') }),
        resultadoDoPedido: async () => ({ tipo: 'ok', dados: {} }),
        falhaDoPedido: async (id, mensagem) => {
          respostas.push(`falha ${id} ${mensagem}`);
          return { tipo: 'ok', dados: {} };
        },
      },
      log,
      backup: async ({ id }) =>
        id === 'a'
          ? { tipo: 'zip', conteudo: Buffer.from('zip') }
          : { tipo: 'falha', mensagem: 'O controle recusou o login do cofre.' },
    });
    await busca.buscar();
    await busca.parar();
    expect(respostas).toEqual(['zip a 3', 'falha b O controle recusou o login do cofre.']);
  });

  it('não responde nada quando a API recusa a busca', async () => {
    let feitos = 0;
    const busca = criarBuscaDePedidos({
      api: {
        pedidos: async () => ({ tipo: 'indisponivel', motivo: 'HTTP 503' }),
        arquivoDoPedido: async () => ({ tipo: 'ok', dados: {} }),
        falhaDoPedido: async () => ({ tipo: 'ok', dados: {} }),
        zipDoPedido: async () => ({ tipo: 'ok', dados: Buffer.from('zip') }),
        resultadoDoPedido: async () => ({ tipo: 'ok', dados: {} }),
      },
      log,
      backup: async () => {
        feitos += 1;
        return { tipo: 'falha', mensagem: 'x' };
      },
    });
    await busca.buscar();
    await busca.parar();
    expect(feitos).toBe(0);
  });
});
