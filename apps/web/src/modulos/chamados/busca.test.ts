// O chamado achado na busca (spec modulo-chamados, "Busca dos chamados" e "Chamado fechado na tela";
// change chat-com-chamados, tarefa 4.13): o número e o título, e quem pediu com a situação no
// caminho, com o Fechado no lugar do Resolvido.
import { describe, expect, it } from 'vitest';
import { resultadoDoChamado } from './busca.ts';

const achado = {
  numero: 1042,
  titulo: 'Impressora manchando',
  pessoa: 'Marina Lopes',
  situacao: 'em-atendimento',
  fechado: false,
} as const;

describe('resultadoDoChamado', () => {
  it('"#1042 Impressora manchando", com quem pediu e a situação, levando ao chamado aberto', () => {
    expect(resultadoDoChamado(achado)).toEqual({
      id: 'chamado-1042',
      rotulo: '#1042 Impressora manchando',
      caminho: 'Marina Lopes · Em atendimento',
      destino: '/chamados/1042',
    });
  });

  it('o resolvido diz "Resolvido" até fechar, e depois "Fechado"', () => {
    const resolvido = { ...achado, situacao: 'resolvido' } as const;
    expect(resultadoDoChamado(resolvido).caminho).toBe('Marina Lopes · Resolvido');
    expect(resultadoDoChamado({ ...resolvido, fechado: true }).caminho).toBe(
      'Marina Lopes · Fechado',
    );
  });
});
