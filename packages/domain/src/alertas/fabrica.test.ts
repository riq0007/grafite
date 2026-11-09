import { describe, expect, it } from 'vitest';
import { REGRAS_DE_FABRICA } from './fabrica.ts';
import { conferirRegra } from './regras.ts';

describe('regras de fábrica', () => {
  it('as oito, com a chave estável, a condição, os parâmetros, a duração e a severidade', () => {
    expect(
      REGRAS_DE_FABRICA.map(({ chave, dados }) => [
        chave,
        dados.nome,
        dados.condicao,
        dados.parametros,
        dados.duracao,
        dados.severidade,
      ]),
    ).toEqual([
      ['ativo-offline', 'Ativo offline', 'rede.offline', {}, 5, 'atencao'],
      ['toner-10', 'Toner em 10% ou menos', 'toner.nivel', { limite: 10, folga: 5 }, 0, 'critico'],
      [
        'impressora-parada',
        'Impressora parada',
        'impressora.condicao',
        {
          condicoes: [
            'sem-papel',
            'sem-toner',
            'tampa-aberta',
            'atolamento',
            'servico-solicitado',
            'bandeja-de-entrada-ausente',
            'suprimento-ausente',
            'bandeja-de-saida-cheia',
          ],
        },
        0,
        'critico',
      ],
      [
        'impressora-pede-atencao',
        'Impressora pede atenção',
        'impressora.condicao',
        {
          condicoes: [
            'pouco-papel',
            'toner-baixo',
            'bandeja-de-saida-ausente',
            'bandeja-de-saida-quase-cheia',
            'bandeja-de-entrada-vazia',
            'manutencao-vencida',
          ],
        },
        0,
        'atencao',
      ],
      [
        'controlid-sem-resposta',
        'Control iD sem resposta',
        'controlid.situacao',
        { situacoes: ['sem-resposta'] },
        10,
        'critico',
      ],
      [
        'controlid-nao-aceita',
        'Control iD não aceita a sondagem',
        'controlid.situacao',
        { situacoes: ['login-recusado', 'resposta-inesperada'] },
        0,
        'atencao',
      ],
      ['coleta-atrasada', 'Coleta atrasada', 'coleta.atrasada', { ciclos: 3 }, 0, 'atencao'],
      [
        'coletor-sem-contato',
        'Coletor sem contato',
        'coletor.sem-contato',
        { minutos: 10 },
        0,
        'critico',
      ],
    ]);
  });

  it('todas valem para a organização inteira e passam pela conferência', () => {
    for (const { dados } of REGRAS_DE_FABRICA) {
      expect(dados.escopo).toEqual({ tipo: 'organizacao', id: null });
      expect(conferirRegra({ ...dados })).toEqual({ ok: true, dados });
    }
  });
});
