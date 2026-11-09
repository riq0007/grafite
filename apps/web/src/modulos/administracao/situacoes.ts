// A situação de um perfil, de um grupo ou de um local, em texto: a cor e o ícone só reforçam.
import type { Situacao } from '@grafite/ui';

export const SITUACOES_DO_REGISTRO: Record<'ativo' | 'inativo', { tipo: Situacao; texto: string }> =
  {
    ativo: { tipo: 'sucesso', texto: 'Ativo' },
    inativo: { tipo: 'neutra', texto: 'Inativo' },
  };
