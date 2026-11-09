import { describe, expect, it } from 'vitest';
import { ROTULOS_DAS_SITUACOES_DA_IMPORTACAO, SITUACOES_DA_IMPORTACAO } from './situacoes.ts';

describe('situações da importação', () => {
  it('são as da spec, cada uma com o texto que a tela mostra', () => {
    expect(
      SITUACOES_DA_IMPORTACAO.map((situacao) => ROTULOS_DAS_SITUACOES_DA_IMPORTACAO[situacao]),
    ).toEqual(['Rascunho', 'Na fila', 'Importando', 'Concluída', 'Com falha', 'Descartada']);
  });
});
