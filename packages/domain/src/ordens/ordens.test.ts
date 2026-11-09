// A ordem de serviço no domínio (spec ordens-de-servico; change p4e-ordens-de-servico, design,
// decisão 1).
import { describe, expect, it } from 'vitest';
import {
  acaoDoLoteDasOrdens,
  LIMITES_DA_ORDEM,
  MENSAGEM_DA_ORDEM_SO_DO_CONSERTO,
  mensagemDaRecusaNaOrdem,
  mensagemDaSolicitacaoComOrdem,
  nomeDaOrdem,
  ROTULOS_DAS_SITUACOES_DA_ORDEM,
  recusaNaOrdem,
  retornoDaAbertura,
  SITUACOES_DA_ORDEM,
  SITUACOES_DE_ATENDIMENTO,
  SITUACOES_DO_LOTE_DAS_ORDENS,
  SITUACOES_EM_ABERTO,
  situacaoDepoisDaAcao,
  situacaoEmAberto,
  textoDaOrdem,
  textoDoLoteDasOrdens,
  validarAberturaDaOrdem,
  validarCorrecaoDaOrdem,
  validarEncerramentoDaOrdem,
  validarMudancaDaOrdem,
  validarPecaDaOrdem,
  validarReaberturaDaOrdem,
  validarResolucaoDaOrdem,
} from './ordens.ts';

describe('listas da OS', () => {
  it('tem as seis situações, com os rótulos, as em aberto e as de cada mudança', () => {
    expect(SITUACOES_DA_ORDEM.map((situacao) => ROTULOS_DAS_SITUACOES_DA_ORDEM[situacao])).toEqual([
      'Aberta',
      'Em atendimento',
      'Aguardando peça',
      'Aguardando fornecedor',
      'Resolvida',
      'Encerrada',
    ]);
    expect(SITUACOES_EM_ABERTO).toEqual([
      'aberta',
      'em-atendimento',
      'aguardando-peca',
      'aguardando-fornecedor',
    ]);
    expect(situacaoEmAberto('aguardando-fornecedor')).toBe(true);
    expect(situacaoEmAberto('resolvida')).toBe(false);
    expect(SITUACOES_DE_ATENDIMENTO).toEqual([
      'em-atendimento',
      'aguardando-peca',
      'aguardando-fornecedor',
    ]);
    expect(SITUACOES_DO_LOTE_DAS_ORDENS).toEqual([
      'em-atendimento',
      'aguardando-peca',
      'encerrada',
    ]);
  });

  it('tem os limites da spec', () => {
    expect(LIMITES_DA_ORDEM).toEqual({
      problema: 1000,
      solucao: 1000,
      observacao: 500,
      motivo: 200,
      osDoFornecedor: 40,
      lote: 200,
    });
  });
});

describe('conferência', () => {
  it('aceita a abertura com o ativo e o problema', () => {
    expect(validarAberturaDaOrdem({ ativo: 'nb-0031', problema: 'Teclado falhando' })).toEqual({});
  });

  it('OS sem o problema: a abertura pede o ativo e o problema, até 1.000 caracteres', () => {
    expect(validarAberturaDaOrdem({ ativo: null, problema: '   ' })).toEqual({
      ativo: 'Escolha o ativo.',
      problema: 'Descreva o problema.',
    });
    expect(validarAberturaDaOrdem({ ativo: 'nb-0031', problema: 'a'.repeat(1001) })).toEqual({
      problema: 'Use até 1.000 caracteres.',
    });
  });

  it('corrige o problema e, na OS com o fornecedor, o fornecedor e a OS dele', () => {
    expect(validarCorrecaoDaOrdem({ problema: 'Teclado e touchpad falhando' })).toEqual({});
    expect(validarCorrecaoDaOrdem({ problema: null })).toEqual({
      problema: 'Descreva o problema.',
    });
    expect(
      validarCorrecaoDaOrdem({
        problema: 'Não liga',
        fornecedor: { fornecedor: null, os: 'a'.repeat(41) },
      }),
    ).toEqual({ fornecedor: 'Escolha o fornecedor.', os: 'Use até 40 caracteres.' });
    expect(
      validarCorrecaoDaOrdem({
        problema: 'Não liga',
        fornecedor: { fornecedor: 'dell', os: ' DL-5521 ' },
      }),
    ).toEqual({});
  });

  it('pede na mudança a situação, a observação e, na Aguardando fornecedor, o fornecedor', () => {
    expect(validarMudancaDaOrdem({ situacao: 'aguardando-peca', observacao: null })).toEqual({});
    expect(validarMudancaDaOrdem({ situacao: null, observacao: 'a'.repeat(501) })).toEqual({
      situacao: 'Escolha a situação.',
      observacao: 'Use até 500 caracteres.',
    });
    expect(validarMudancaDaOrdem({ situacao: 'aguardando-fornecedor', observacao: null })).toEqual({
      fornecedor: 'Escolha o fornecedor.',
    });
    expect(
      validarMudancaDaOrdem({
        situacao: 'aguardando-fornecedor',
        observacao: null,
        fornecedor: { fornecedor: 'dell', os: null },
      }),
    ).toEqual({});
  });

  it('pede na peça o consumível, o local e a quantidade da saída do estoque', () => {
    expect(validarPecaDaOrdem({ consumivel: 'fnt-65w', local: 'almox', quantidade: 1 })).toEqual(
      {},
    );
    expect(validarPecaDaOrdem({ consumivel: null, local: null, quantidade: Number.NaN })).toEqual({
      consumivel: 'Escolha o consumível.',
      local: 'Escolha o local.',
      quantidade: 'Use um número inteiro de 1 a 100.000.',
    });
  });

  it('pede o que foi feito na resolução e o motivo na reabertura e no encerramento', () => {
    expect(validarResolucaoDaOrdem(' ')).toBe('Descreva o que foi feito.');
    expect(validarResolucaoDaOrdem('a'.repeat(1001))).toBe('Use até 1.000 caracteres.');
    expect(validarResolucaoDaOrdem('Fonte trocada')).toBeNull();
    expect(validarReaberturaDaOrdem(null)).toBe('Informe o motivo da reabertura.');
    expect(validarReaberturaDaOrdem('a'.repeat(201))).toBe('Use até 200 caracteres.');
    expect(validarReaberturaDaOrdem('Voltou a desligar sozinho')).toBeNull();
    expect(validarEncerramentoDaOrdem('')).toBe('Informe o motivo do encerramento.');
    expect(validarEncerramentoDaOrdem('a'.repeat(201))).toBe('Use até 200 caracteres.');
    expect(validarEncerramentoDaOrdem('Aberta no ativo errado')).toBeNull();
  });
});

describe('situação', () => {
  const recusa = (numero: number, ...args: Parameters<typeof recusaNaOrdem>) => {
    const achada = recusaNaOrdem(...args);
    return achada && mensagemDaRecusaNaOrdem(numero, achada);
  };

  it('a em aberto passa às outras de atendimento, mas não à que já está', () => {
    expect(recusaNaOrdem('aberta', { acao: 'mudar', nova: 'aguardando-peca' })).toBeNull();
    expect(recusaNaOrdem('em-atendimento', { acao: 'mudar', nova: 'aguardando-peca' })).toBeNull();
    expect(recusa(12, 'aguardando-peca', { acao: 'mudar', nova: 'aguardando-peca' })).toBe(
      'A OS 12 já está aguardando peça.',
    );
    expect(situacaoDepoisDaAcao({ acao: 'mudar', nova: 'aguardando-fornecedor' })).toBe(
      'aguardando-fornecedor',
    );
  });

  it('a em aberto se resolve e só ela recebe a peça e a correção', () => {
    expect(recusaNaOrdem('aberta', { acao: 'resolver' })).toBeNull();
    expect(recusaNaOrdem('aguardando-fornecedor', { acao: 'lancar-peca' })).toBeNull();
    expect(recusaNaOrdem('em-atendimento', { acao: 'corrigir' })).toBeNull();
    expect(situacaoDepoisDaAcao({ acao: 'resolver' })).toBe('resolvida');
    expect(recusa(12, 'resolvida', { acao: 'lancar-peca' })).toBe('A OS 12 não está em aberto.');
    expect(recusa(12, 'encerrada', { acao: 'lancar-peca' })).toBe('A OS 12 não está em aberto.');
    expect(recusa(12, 'resolvida', { acao: 'corrigir' })).toBe('A OS 12 não está em aberto.');
  });

  it('Resolvida reaberta: a resolvida reabre ou se encerra, e não muda de outro jeito', () => {
    expect(recusaNaOrdem('resolvida', { acao: 'reabrir' })).toBeNull();
    expect(situacaoDepoisDaAcao({ acao: 'reabrir' })).toBe('em-atendimento');
    expect(recusaNaOrdem('resolvida', { acao: 'encerrar' })).toBeNull();
    expect(recusa(12, 'resolvida', { acao: 'mudar', nova: 'em-atendimento' })).toBe(
      'A OS 12 está resolvida: reabra ou encerre.',
    );
    expect(recusa(12, 'resolvida', { acao: 'encerrar-sem-resolver' })).toBe(
      'A OS 12 está resolvida: reabra ou encerre.',
    );
    expect(recusa(12, 'resolvida', { acao: 'resolver' })).toBe('A OS 12 já está resolvida.');
    expect(recusa(12, 'em-atendimento', { acao: 'reabrir' })).toBe(
      'A OS 12 ainda não foi resolvida.',
    );
  });

  it('Encerrada não muda: nenhuma ação, com "já está encerrada"', () => {
    expect(recusa(12, 'encerrada', { acao: 'mudar', nova: 'em-atendimento' })).toBe(
      'A OS 12 já está encerrada.',
    );
    for (const acao of ['resolver', 'reabrir', 'encerrar', 'encerrar-sem-resolver'] as const) {
      expect(recusa(12, 'encerrada', { acao })).toBe('A OS 12 já está encerrada.');
    }
  });

  it('OS aberta por engano: a em aberto se encerra só sem resolver, com o motivo', () => {
    expect(recusaNaOrdem('aberta', { acao: 'encerrar-sem-resolver' })).toBeNull();
    expect(situacaoDepoisDaAcao({ acao: 'encerrar-sem-resolver' })).toBe('encerrada');
    expect(situacaoDepoisDaAcao({ acao: 'encerrar' })).toBe('encerrada');
    expect(recusa(15, 'aberta', { acao: 'encerrar' })).toBe('A OS 15 ainda não foi resolvida.');
  });

  it('tem a recusa de quem não atende e a da OS que não existe', () => {
    expect(mensagemDaRecusaNaOrdem(12, { motivo: 'nao-atende' })).toBe(
      'Você não atende o local da OS 12.',
    );
    expect(mensagemDaRecusaNaOrdem(9999, { motivo: 'nao-encontrada' })).toBe(
      'Ordem de serviço não encontrada.',
    );
  });

  it('no lote, a Encerrada vale só para a Resolvida', () => {
    expect(acaoDoLoteDasOrdens('em-atendimento')).toEqual({
      acao: 'mudar',
      nova: 'em-atendimento',
    });
    expect(acaoDoLoteDasOrdens('encerrada')).toEqual({ acao: 'encerrar' });
    expect(recusaNaOrdem('resolvida', acaoDoLoteDasOrdens('encerrada'))).toBeNull();
    expect(recusaNaOrdem('em-atendimento', acaoDoLoteDasOrdens('encerrada'))).toEqual({
      motivo: 'nao-resolvida',
    });
  });
});

describe('textos', () => {
  it('cita a OS pelo número e tem o retorno da abertura', () => {
    expect(textoDaOrdem(12)).toBe('OS 12');
    expect(retornoDaAbertura(12)).toBe('OS 12 aberta.');
  });

  it('Conserto já com a OS: tem as recusas da OS pela solicitação', () => {
    expect(mensagemDaSolicitacaoComOrdem(43, 12)).toBe('A solicitação 43 já tem a OS 12.');
    expect(MENSAGEM_DA_ORDEM_SO_DO_CONSERTO).toBe('A OS nasce só da solicitação de conserto.');
  });

  it('dá o nome do alvo na auditoria, com a primeira linha do problema e até 60 caracteres', () => {
    expect(nomeDaOrdem({ numero: 12, ativo: 'NB-0031', problema: 'Não liga' })).toBe(
      '12 · NB-0031 · Não liga',
    );
    expect(
      nomeDaOrdem({ numero: 12, ativo: 'NB-0031', problema: 'Não liga\nDepois da queda' }),
    ).toBe('12 · NB-0031 · Não liga');
    expect(nomeDaOrdem({ numero: 12, ativo: 'NB-0031', problema: 'a'.repeat(61) })).toBe(
      `12 · NB-0031 · ${'a'.repeat(59)}…`,
    );
  });

  it('Uma em aberto no encerramento em lote: o retorno diz quantas mudaram e quais não', () => {
    const naoResolvida = recusaNaOrdem('em-atendimento', acaoDoLoteDasOrdens('encerrada'));
    if (naoResolvida === null) throw new Error('A em atendimento deveria ser recusada.');
    expect(
      textoDoLoteDasOrdens({ mudaram: 5, recusadas: [{ numero: 12, recusa: naoResolvida }] }),
    ).toBe('5 ordens de serviço mudaram. A 12 não: ainda não foi resolvida.');
    expect(textoDoLoteDasOrdens({ mudaram: 1, recusadas: [] })).toBe('1 ordem de serviço mudou.');
    expect(
      textoDoLoteDasOrdens({
        mudaram: 0,
        recusadas: [
          { numero: 12, recusa: { motivo: 'ja-esta', situacao: 'encerrada' } },
          { numero: 13, recusa: { motivo: 'resolvida' } },
          { numero: 14, recusa: { motivo: 'nao-atende' } },
          { numero: 15, recusa: { motivo: 'nao-encontrada' } },
        ],
      }),
    ).toBe(
      'Nenhuma ordem de serviço mudou. A 12 não: já está encerrada. A 13 não: está resolvida. ' +
        'A 14 não: você não atende o local dela. A 15 não: não foi encontrada.',
    );
  });
});
