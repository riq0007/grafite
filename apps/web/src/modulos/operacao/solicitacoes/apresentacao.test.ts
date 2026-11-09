// As solicitações em texto (spec modulo-operacao, "Tela das solicitações"; change p4d-solicitacoes,
// design, decisão 8): o pedido resumido de cada tipo, os locais e o pedido ao fornecedor.
import { describe, expect, it } from 'vitest';
import { conserto, equipamento, toner } from '../../../teste/solicitacoes.ts';
import { fornecedorEmTexto, locaisEmTexto, pedidoEmTexto } from './apresentacao.ts';

describe('as solicitações em texto', () => {
  it('o pedido do toner, do conserto e do equipamento, pelo patrimônio', () => {
    expect(pedidoEmTexto(toner(42))).toBe('PAT-00412: 1 Preto');
    expect(pedidoEmTexto(conserto(43))).toBe('NB-0031: Não liga');
    expect(pedidoEmTexto(equipamento(44))).toBe('2 Notebook');
  });

  it('os locais, com o "Sem local" da impressora que não tem', () => {
    expect(locaisEmTexto(toner(42))).toBe('Jundiaí › Expedição');
    expect(locaisEmTexto(toner(42, { semLocal: true }))).toBe('Jundiaí › Expedição; Sem local');
    expect(locaisEmTexto(toner(42, { locais: [], semLocal: true }))).toBe('Sem local');
  });

  it('o fornecedor com a OS, só quando há o pedido', () => {
    expect(fornecedorEmTexto(toner(42))).toBeNull();
    expect(
      fornecedorEmTexto(
        toner(42, {
          fornecedor: { id: 'sul', nome: 'Locadora Sul', abrir: true },
          osDoFornecedor: '5555',
        }),
      ),
    ).toBe('Locadora Sul · OS 5555');
    expect(
      fornecedorEmTexto(
        toner(42, { fornecedor: { id: 'sul', nome: 'Locadora Sul', abrir: true } }),
      ),
    ).toBe('Locadora Sul');
  });
});
