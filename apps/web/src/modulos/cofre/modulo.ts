import { Vault } from 'lucide-react';
import { definirModulo } from '../tipos.ts';
import { ENTRADAS_DO_COFRE, provedorDeSegredos } from './busca.ts';
import { CHAVE_DO_SEGREDO, CHAVE_DOS_SEGREDOS } from './consultas.ts';
import { rotasDoCofre } from './rotas.tsx';

/**
 * O módulo Cofre no registro (spec modulo-cofre): para quem usa o cofre, inclusive por administrá-lo,
 * com a lista dos segredos. Fica depois do Ativos e, no celular, em "Mais". Na busca, os segredos e
 * "Novo segredo". O evento `cofre.mudou` relê as listas e a ficha aberta.
 */
export const cofre = definirModulo({
  id: 'cofre',
  nome: 'Cofre',
  icone: Vault,
  endereco: '/cofre',
  prioridadeNoCelular: 'mais',
  rotas: rotasDoCofre,
  permissoes: ['cofre.usar', 'cofre.administrar'],
  menu: [{ rotulo: 'Segredos', destino: '/cofre' }],
  busca: { entradas: ENTRADAS_DO_COFRE, provedores: [provedorDeSegredos] },
  eventos: {
    // Um segredo: as listas e a ficha dele. O evento não leva o nome nem o valor.
    'cofre.mudou': ({ alvo }) => [
      CHAVE_DOS_SEGREDOS,
      alvo?.tipo === 'segredo' && alvo.id ? [...CHAVE_DO_SEGREDO, alvo.id] : CHAVE_DO_SEGREDO,
    ],
  },
});
