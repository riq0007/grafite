// O Alertas na busca (spec modulo-alertas, "Alertas no dock"): os itens do menu entram sozinhos, no
// caminho "Alertas", e quem administra os alertas tem a ação de cadastrar uma regra.
import { BellPlus } from 'lucide-react';

export const ENTRADAS_DOS_ALERTAS = [
  {
    id: 'nova-regra',
    rotulo: 'Nova regra de alerta',
    grupo: 'acoes',
    caminho: 'Alertas › Regras',
    palavrasChave: ['cadastrar', 'nova', 'regra', 'limite', 'alerta'],
    icone: BellPlus,
    destino: '/alertas/regras/nova',
    permissoes: ['alertas.administrar'],
  },
] as const;
