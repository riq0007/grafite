// Os módulos opcionais (spec modulos-da-organizacao; design do P1b, decisão 12): cada organização
// liga e desliga os que usa. Um módulo opcional começa ligado; o Início, a Administração e os
// Ajustes não são opcionais.

export interface ModuloOpcional {
  /** O id do módulo no registro da web, como `ativos`. */
  id: string;
  nome: string;
  descricao: string;
}

export const MODULOS_OPCIONAIS = [
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
    descricao: 'Os painéis das VMs, a verificação de cada um e a grade que os mostra lado a lado.',
  },
] as const satisfies readonly ModuloOpcional[];

export type IdDoModuloOpcional = (typeof MODULOS_OPCIONAIS)[number]['id'];

export function moduloOpcional(id: string): id is IdDoModuloOpcional {
  return MODULOS_OPCIONAIS.some((modulo) => modulo.id === id);
}
