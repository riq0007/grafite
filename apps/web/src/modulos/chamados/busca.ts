// Os Chamados na busca (spec modulo-chamados, "Chamados no dock"; change chamados-da-ti, design,
// decisão 14, "O módulo na casca"): as telas do menu entram sozinhas, no caminho "Chamados", cada
// uma a quem a vê; quem atende tem a ação de abrir um chamado, que leva ao Início dos chamados com a
// gaveta de abrir.
import { LifeBuoy } from 'lucide-react';
import type { ContextoDaAcao } from '../../busca/tipos.ts';

export const ENTRADAS_DOS_CHAMADOS = [
  {
    id: 'abrir-chamado',
    rotulo: 'Abrir um chamado',
    grupo: 'acoes',
    caminho: 'Chamados',
    palavrasChave: ['novo', 'chamado', 'abrir', 'atendimento', 'pedido'],
    icone: LifeBuoy,
    executar: ({ navegar }: ContextoDaAcao) => navegar('/chamados?abrir=1'),
    permissoes: ['chamados.atender'],
  },
] as const;
