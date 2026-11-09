import { describe, expect, it } from 'vitest';
import { MODULOS_OPCIONAIS, moduloOpcional } from './modulos.ts';

describe('módulos opcionais', () => {
  it('Salas numa organização que já existia: o Ativos, o Cofre, o Alertas, o Operação e o Salas, com o nome e a descrição', () => {
    expect(MODULOS_OPCIONAIS).toEqual([
      { id: 'ativos', nome: 'Ativos', descricao: 'O catálogo, o cadastro e a lista dos ativos.' },
      {
        id: 'cofre',
        nome: 'Cofre',
        descricao: 'Os segredos da organização, com o acesso por segredo.',
      },
      {
        id: 'alertas',
        nome: 'Alertas',
        descricao: 'As regras de alerta e os alertas dos ativos e dos coletores.',
      },
      {
        id: 'operacao',
        nome: 'Operação',
        descricao:
          'Os consumíveis, os modelos em que eles servem, o estoque por local, as solicitações, as ordens de serviço e os indicadores da operação.',
      },
      {
        id: 'salas',
        nome: 'Salas',
        descricao: 'As salas de reunião, a agenda, os pedidos de reserva e os convites.',
      },
      {
        id: 'paineis',
        nome: 'Painéis',
        descricao:
          'Os painéis das VMs, a verificação de cada um e a grade que os mostra lado a lado.',
      },
    ]);
  });

  it('diz se um módulo é opcional', () => {
    expect(moduloOpcional('ativos')).toBe(true);
    expect(moduloOpcional('cofre')).toBe(true);
    expect(moduloOpcional('alertas')).toBe(true);
    expect(moduloOpcional('operacao')).toBe(true);
    expect(moduloOpcional('salas')).toBe(true);
    expect(moduloOpcional('paineis')).toBe(true);
    expect(moduloOpcional('administracao')).toBe(false);
    expect(moduloOpcional('inicio')).toBe(false);
  });
});
