// A solicitação no domínio (spec solicitacoes; spec modulo-operacao, "Tela das solicitações";
// change p4d-solicitacoes, design, decisão 1).
import { describe, expect, it } from 'vitest';
import {
  atendeASolicitacao,
  type DadosDaSolicitacao,
  LIMITES_DA_SOLICITACAO,
  locaisDaSolicitacao,
  mensagemDaImpressoraComEntrega,
  mensagemDaRecusa,
  mensagemDoAtivoSemConsumiveis,
  ROTULOS_DAS_SITUACOES_DA_SOLICITACAO,
  ROTULOS_DOS_TIPOS_DE_SOLICITACAO,
  recusaDaSituacao,
  resumoDoPedido,
  retornoDoRegistro,
  SITUACOES_DA_SOLICITACAO,
  SITUACOES_PENDENTES,
  situacaoDepoisDaEntrega,
  situacaoPendente,
  sugestaoDoConsumivel,
  TIPOS_DE_SOLICITACAO,
  textoDoContadorCongelado,
  textoDoLote,
  validarCancelamento,
  validarConclusao,
  validarEntrega,
  validarPedidoAoFornecedor,
  validarSolicitacao,
  veASolicitacao,
} from './solicitacoes.ts';

const toner: DadosDaSolicitacao = {
  tipo: 'toner',
  pessoa: 'joana',
  observacao: null,
  impressoras: ['pat-00412'],
  itens: [{ impressora: 'pat-00412', cor: 'preto', quantidade: 1, consumivel: 'cf258a' }],
};

const conserto: DadosDaSolicitacao = {
  tipo: 'conserto',
  pessoa: 'joana',
  observacao: null,
  ativo: 'nb-0031',
  defeito: 'Não liga',
};

const equipamento: DadosDaSolicitacao = {
  tipo: 'equipamento',
  pessoa: 'joana',
  observacao: null,
  tipoDeAtivo: 'notebook',
  quantidade: 2,
  motivo: 'Dois contratados novos',
  local: 'expedicao',
};

describe('listas da solicitação', () => {
  it('tem os três tipos e as cinco situações, com os rótulos, e as pendentes', () => {
    expect(TIPOS_DE_SOLICITACAO.map((tipo) => ROTULOS_DOS_TIPOS_DE_SOLICITACAO[tipo])).toEqual([
      'Toner',
      'Conserto',
      'Equipamento',
    ]);
    expect(
      SITUACOES_DA_SOLICITACAO.map((situacao) => ROTULOS_DAS_SITUACOES_DA_SOLICITACAO[situacao]),
    ).toEqual(['Aberta', 'Em atendimento', 'Aguardando entrega', 'Concluída', 'Cancelada']);
    expect(SITUACOES_PENDENTES).toEqual(['aberta', 'em-atendimento', 'aguardando-entrega']);
    expect(situacaoPendente('aguardando-entrega')).toBe(true);
    expect(situacaoPendente('concluida')).toBe(false);
  });

  it('tem os limites da spec', () => {
    expect(LIMITES_DA_SOLICITACAO).toEqual({
      impressoras: 20,
      quantidadeMinima: 1,
      quantidadeMaxima: 99,
      observacao: 500,
      texto: 1000,
      motivoDoCancelamento: 200,
      osDoFornecedor: 40,
      lote: 200,
    });
  });
});

describe('conferência do registro', () => {
  it('aceita os três tipos completos', () => {
    expect(validarSolicitacao(toner)).toEqual({});
    expect(validarSolicitacao(conserto)).toEqual({});
    expect(validarSolicitacao(equipamento)).toEqual({});
  });

  it('Quem pediu em texto livre: sem a pessoa, pede quem pediu', () => {
    expect(validarSolicitacao({ ...conserto, pessoa: null })).toEqual({
      pessoa: 'Escolha quem pediu.',
    });
  });

  it('tira os espaços das pontas da observação e recusa a observação longa', () => {
    expect(validarSolicitacao({ ...conserto, observacao: '   ' })).toEqual({});
    expect(validarSolicitacao({ ...conserto, observacao: 'a'.repeat(501) })).toEqual({
      observacao: 'Use até 500 caracteres.',
    });
  });

  it('pede no conserto o ativo e o defeito, até 1.000 caracteres', () => {
    expect(validarSolicitacao({ ...conserto, ativo: null, defeito: ' ' })).toEqual({
      ativo: 'Escolha o ativo.',
      defeito: 'Descreva o defeito.',
    });
    expect(validarSolicitacao({ ...conserto, defeito: 'a'.repeat(1001) })).toEqual({
      defeito: 'Use até 1.000 caracteres.',
    });
  });

  it('pede no equipamento o tipo, a quantidade de 1 a 99, o motivo e o local', () => {
    expect(
      validarSolicitacao({
        ...equipamento,
        tipoDeAtivo: null,
        quantidade: 100,
        motivo: null,
        local: null,
      }),
    ).toEqual({
      tipoDeAtivo: 'Escolha o tipo de ativo.',
      quantidade: 'Use um número inteiro de 1 a 99.',
      motivo: 'Descreva o motivo.',
      local: 'Escolha o local.',
    });
    expect(validarSolicitacao({ ...equipamento, quantidade: Number.NaN })).toEqual({
      quantidade: 'Use um número inteiro de 1 a 99.',
    });
  });

  it('pede no toner ao menos uma impressora e até 20', () => {
    expect(validarSolicitacao({ ...toner, impressoras: [], itens: [] })).toEqual({
      impressoras: 'Escolha a impressora.',
    });
    const muitas = Array.from({ length: 21 }, (_, i) => `imp-${i}`);
    expect(
      validarSolicitacao({
        ...toner,
        impressoras: muitas,
        itens: muitas.map((impressora) => ({
          impressora,
          cor: 'preto',
          quantidade: 1,
          consumivel: null,
        })),
      }),
    ).toEqual({ impressoras: 'Escolha até 20 impressoras.' });
  });

  it('confere cada item: a cor, a quantidade e a impressora da solicitação', () => {
    expect(
      validarSolicitacao({
        ...toner,
        itens: [
          { impressora: 'pat-00412', cor: null, quantidade: 0, consumivel: null },
          { impressora: 'outra', cor: 'ciano', quantidade: 1, consumivel: null },
        ],
      }),
    ).toEqual({
      'itens.0.cor': 'Escolha a cor.',
      'itens.0.quantidade': 'Use um número inteiro de 1 a 99.',
      'itens.1.impressora': 'Escolha a impressora.',
    });
  });

  it('Cor repetida: a mesma cor duas vezes para a mesma impressora', () => {
    expect(
      validarSolicitacao({
        ...toner,
        itens: [
          { impressora: 'pat-00412', cor: 'preto', quantidade: 1, consumivel: null },
          { impressora: 'pat-00412', cor: 'preto', quantidade: 2, consumivel: null },
        ],
      }),
    ).toEqual({ 'itens.1.cor': 'Essa cor já está pedida para essa impressora.' });
  });

  it('pede ao menos um item para cada impressora', () => {
    expect(validarSolicitacao({ ...toner, impressoras: ['pat-00412', 'pat-00415'] })).toEqual({
      'impressoras.1': 'Inclua ao menos um item para cada impressora.',
    });
  });

  it('Impressora já entregue na alteração: o item entregue conta como o item dela', () => {
    const comAPat415 = { ...toner, impressoras: ['pat-00415', 'pat-00412'] };
    expect(validarSolicitacao(comAPat415, { comEntrega: new Set(['pat-00415']) })).toEqual({});
    expect(validarSolicitacao(comAPat415, { comEntrega: new Set(['pat-00412']) })).toEqual({
      'impressoras.0': 'Inclua ao menos um item para cada impressora.',
    });
  });
});

describe('situação', () => {
  it('a pendente passa às outras pendentes, à concluída e à cancelada', () => {
    expect(
      recusaDaSituacao({ tipo: 'equipamento', atual: 'aberta', nova: 'aguardando-entrega' }),
    ).toBeNull();
    expect(
      recusaDaSituacao({ tipo: 'conserto', atual: 'em-atendimento', nova: 'concluida' }),
    ).toBeNull();
    expect(recusaDaSituacao({ tipo: 'toner', atual: 'aberta', nova: 'cancelada' })).toBeNull();
  });

  it('Concluída não muda, nem a cancelada, nem para a mesma situação', () => {
    const concluida = recusaDaSituacao({ tipo: 'toner', atual: 'concluida', nova: 'cancelada' });
    expect(concluida).toEqual({ motivo: 'ja-esta', situacao: 'concluida' });
    expect(mensagemDaRecusa(42, concluida ?? { motivo: 'nao-encontrada' })).toBe(
      'A solicitação 42 já está concluída.',
    );
    const cancelada = recusaDaSituacao({
      tipo: 'conserto',
      atual: 'cancelada',
      nova: 'em-atendimento',
    });
    expect(mensagemDaRecusa(43, cancelada ?? { motivo: 'nao-encontrada' })).toBe(
      'A solicitação 43 já está cancelada.',
    );
    const mesma = recusaDaSituacao({
      tipo: 'conserto',
      atual: 'em-atendimento',
      nova: 'em-atendimento',
    });
    expect(mensagemDaRecusa(41, mesma ?? { motivo: 'nao-encontrada' })).toBe(
      'A solicitação 41 já está em atendimento.',
    );
  });

  it('Conserto que segue a OS: com a OS em aberto, a solicitação não muda por si', () => {
    const segue = recusaDaSituacao({
      tipo: 'conserto',
      atual: 'em-atendimento',
      nova: 'concluida',
      segueAOrdem: 12,
    });
    expect(segue).toEqual({ motivo: 'segue-a-ordem', ordem: 12 });
    expect(mensagemDaRecusa(43, segue ?? { motivo: 'nao-encontrada' })).toBe(
      'A solicitação 43 segue a OS 12.',
    );
    expect(
      recusaDaSituacao({
        tipo: 'conserto',
        atual: 'concluida',
        nova: 'cancelada',
        segueAOrdem: 12,
      }),
    ).toEqual({ motivo: 'ja-esta', situacao: 'concluida' });
  });

  it('Conserto sem a OS: muda como antes', () => {
    expect(
      recusaDaSituacao({
        tipo: 'conserto',
        atual: 'em-atendimento',
        nova: 'concluida',
        segueAOrdem: null,
      }),
    ).toBeNull();
  });

  it('Conserto aguardando entrega: vale só para toner e equipamento', () => {
    const recusa = recusaDaSituacao({
      tipo: 'conserto',
      atual: 'aberta',
      nova: 'aguardando-entrega',
    });
    expect(mensagemDaRecusa(40, recusa ?? { motivo: 'nao-encontrada' })).toBe(
      'Aguardando entrega vale só para toner e equipamento.',
    );
  });

  it('o toner se conclui pela entrega, ou no lote com o pedido ao fornecedor', () => {
    const fora = recusaDaSituacao({ tipo: 'toner', atual: 'aberta', nova: 'concluida' });
    expect(mensagemDaRecusa(42, fora ?? { motivo: 'nao-encontrada' })).toBe(
      'O toner se conclui pela entrega dos itens.',
    );
    expect(
      recusaDaSituacao({
        tipo: 'toner',
        atual: 'aguardando-entrega',
        nova: 'concluida',
        noLote: true,
        comFornecedor: true,
      }),
    ).toBeNull();
    expect(
      recusaDaSituacao({
        tipo: 'toner',
        atual: 'aberta',
        nova: 'concluida',
        noLote: true,
        comFornecedor: false,
      }),
    ).toEqual({ motivo: 'toner-sem-fornecedor' });
  });

  it('depois da entrega, conclui sem item pendente e espera a entrega com algum', () => {
    expect(situacaoDepoisDaEntrega(0)).toBe('concluida');
    expect(situacaoDepoisDaEntrega(1)).toBe('aguardando-entrega');
  });

  it('Cancelamento sem o motivo, e o motivo e o que foi feito longos', () => {
    expect(validarCancelamento(' ')).toBe('Informe o motivo do cancelamento.');
    expect(validarCancelamento('a'.repeat(201))).toBe('Use até 200 caracteres.');
    expect(validarCancelamento('Pedido em duplicidade')).toBeNull();
    expect(validarConclusao('a'.repeat(1001))).toBe('Use até 1.000 caracteres.');
    expect(validarConclusao(null)).toBeNull();
  });

  it('pede no pedido ao fornecedor o fornecedor e a OS até 40 caracteres', () => {
    expect(validarPedidoAoFornecedor({ fornecedor: null, os: 'a'.repeat(41) })).toEqual({
      fornecedor: 'Escolha o fornecedor.',
      os: 'Use até 40 caracteres.',
    });
    expect(validarPedidoAoFornecedor({ fornecedor: 'locadora-sul', os: null })).toEqual({});
  });
});

describe('entrega', () => {
  it('pede ao menos um item e, em cada um, o que a origem pede', () => {
    expect(validarEntrega([])).toEqual({ itens: 'Escolha os itens a entregar.' });
    expect(
      validarEntrega([
        { item: 'a', origem: 'estoque', consumivel: null, local: null },
        { item: 'b', origem: 'fornecedor', fornecedor: null, consumivel: null },
        { item: 'c', origem: 'estoque', consumivel: 'cf258a', local: 'almoxarifado' },
      ]),
    ).toEqual({
      'entregas.0.consumivel': 'Escolha o consumível.',
      'entregas.0.local': 'Escolha o local.',
      'entregas.1.fornecedor': 'Escolha o fornecedor.',
    });
  });
});

describe('sugestão do consumível', () => {
  const cf258a = { id: 'cf258a', codigo: 'CF258A', cor: 'preto' as const, ativo: true, saldo: 6 };

  it('Toner sugerido: o compatível ativo da cor', () => {
    expect(sugestaoDoConsumivel([cf258a], 'preto')).toBe('cf258a');
  });

  it('Cor sem compatível: nenhum', () => {
    expect(sugestaoDoConsumivel([cf258a], 'ciano')).toBeNull();
  });

  it('entre vários, o de maior saldo e, no empate, o de menor código, sem o inativo', () => {
    const outro = { id: 'cf258x', codigo: 'CF258X', cor: 'preto' as const, ativo: true, saldo: 9 };
    const inativo = { id: 'velho', codigo: 'AAA', cor: 'preto' as const, ativo: false, saldo: 50 };
    expect(sugestaoDoConsumivel([cf258a, outro, inativo], 'preto')).toBe('cf258x');
    const empate = { ...outro, saldo: 6 };
    expect(sugestaoDoConsumivel([empate, cf258a], 'preto')).toBe('cf258a');
    const semSaldo = { ...cf258a, saldo: null };
    const comUm = { ...outro, saldo: 1 };
    expect(sugestaoDoConsumivel([semSaldo, comUm], 'preto')).toBe('cf258x');
  });
});

describe('locais e alcance', () => {
  it('junta os locais sem repetir e marca o ativo sem local', () => {
    expect(locaisDaSolicitacao(['jun', 'jun', 'cps'])).toEqual({
      locais: ['jun', 'cps'],
      semLocal: false,
    });
    expect(locaisDaSolicitacao(['jun', null])).toEqual({ locais: ['jun'], semLocal: true });
  });

  it('vê com algum local no alcance e atende com todos', () => {
    const duas = { locais: ['jun', 'cps'], semLocal: false };
    const jundiai = new Set(['jun', 'alm']);
    expect(veASolicitacao(jundiai, duas)).toBe(true);
    expect(atendeASolicitacao(jundiai, duas)).toBe(false);
    expect(atendeASolicitacao(new Set(['jun', 'cps']), duas)).toBe(true);
    expect(veASolicitacao(null, duas)).toBe(false);
    expect(veASolicitacao(new Set(['ita']), duas)).toBe(false);
  });

  it('o ativo sem local pede a organização inteira', () => {
    const semLocal = { locais: [], semLocal: true };
    expect(veASolicitacao(new Set(['jun']), semLocal)).toBe(false);
    expect(veASolicitacao('organizacao', semLocal)).toBe(true);
    const misturada = { locais: ['jun'], semLocal: true };
    expect(veASolicitacao(new Set(['jun']), misturada)).toBe(true);
    expect(atendeASolicitacao(new Set(['jun']), misturada)).toBe(false);
    expect(atendeASolicitacao('organizacao', misturada)).toBe(true);
  });
});

describe('textos', () => {
  it('resume o pedido de cada tipo', () => {
    expect(
      resumoDoPedido({
        tipo: 'toner',
        impressoras: [
          {
            rotulo: 'PAT-00412',
            itens: [
              { cor: 'preto', quantidade: 1 },
              { cor: 'ciano', quantidade: 2 },
            ],
          },
          { rotulo: 'PAT-00415', itens: [{ cor: 'preto', quantidade: 1 }] },
        ],
      }),
    ).toBe('PAT-00412: 1 Preto, 2 Ciano; PAT-00415: 1 Preto');
    expect(resumoDoPedido({ tipo: 'conserto', ativo: 'NB-0031', defeito: 'Não liga' })).toBe(
      'NB-0031: Não liga',
    );
    expect(resumoDoPedido({ tipo: 'equipamento', quantidade: 2, tipoDeAtivo: 'Notebook' })).toBe(
      '2 Notebook',
    );
  });

  it('escreve o contador congelado, ou diz que não havia leitura', () => {
    expect(textoDoContadorCongelado(48210, '21/10 14:02')).toBe(
      'Total de páginas: 48.210, lido em 21/10 14:02',
    );
    expect(textoDoContadorCongelado(null, null)).toBe('Sem leitura do total de páginas');
  });

  it('Uma que não pode mudar: o retorno do lote diz quantas mudaram e quais não', () => {
    expect(textoDoLote({ mudaram: 3, recusadas: [] })).toBe('3 solicitações mudaram.');
    expect(textoDoLote({ mudaram: 1, recusadas: [] })).toBe('1 solicitação mudou.');
    expect(
      textoDoLote({
        mudaram: 3,
        recusadas: [{ numero: 42, recusa: { motivo: 'ja-esta', situacao: 'concluida' } }],
      }),
    ).toBe('3 solicitações mudaram. A 42 não: já está concluída.');
    expect(
      textoDoLote({
        mudaram: 0,
        recusadas: [
          { numero: 44, recusa: { motivo: 'toner-sem-fornecedor' } },
          { numero: 45, recusa: { motivo: 'nao-atende' } },
          { numero: 9999, recusa: { motivo: 'nao-encontrada' } },
        ],
      }),
    ).toBe(
      'Nenhuma solicitação mudou. A 44 não: o toner sem fornecedor se conclui pela entrega. A 45 não: você não atende todos os locais dela. A 9999 não: não foi encontrada.',
    );
  });

  it('Conserto com a OS no lote: o retorno diz que ela segue a OS', () => {
    expect(
      textoDoLote({
        mudaram: 2,
        recusadas: [{ numero: 43, recusa: { motivo: 'segue-a-ordem', ordem: 12 } }],
      }),
    ).toBe('2 solicitações mudaram. A 43 não: segue a OS 12.');
  });

  it('tem as recusas da impressora e o retorno do registro', () => {
    expect(mensagemDaImpressoraComEntrega('PAT-00412')).toBe(
      'PAT-00412 tem item entregue e fica na solicitação.',
    );
    expect(mensagemDoAtivoSemConsumiveis('NB-0031')).toBe('NB-0031 não usa consumíveis.');
    expect(retornoDoRegistro(42)).toBe('Solicitação 42 registrada.');
  });
});
