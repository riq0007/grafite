// A prévia do quadrado (spec modulo-chamados, "Quem está com o quê"; change chamados-da-ti, design,
// decisão 22): o lugar dela, a hora da última mensagem, quem pode receber o chamado, as ações que
// ele aceita e o relógio que a abre e a fecha.
import { criarDataHora } from '@grafite/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGORA_DOS_MOCKUPS,
  ANA,
  BRUNO,
  CHAMADOS_DOS_MOCKUPS,
  coluna,
  DIEGO,
  FUSO_DOS_MOCKUPS,
  QUADRO_DOS_MOCKUPS,
  RENATO,
  sp,
} from '../../../teste/chamados.ts';
import type { ColunaDoQuadro } from '../consultas.ts';
import { chamadoArrastado } from './arraste.ts';
import {
  acoesDoChamado,
  controleDaPrevia,
  ESPERA_DA_PREVIA,
  foraDaArea,
  LARGURA_DA_PREVIA,
  lugarDaPrevia,
  momentoDaMensagem,
  pessoasParaPassar,
} from './previa.ts';

/** A área das colunas do m01, sem o respiro de 16 px: de 16 a 1424 de lado, de 120 a 860 de alto. */
const AREA = { left: 16, top: 120, right: 1424, bottom: 860 };

describe('lugarDaPrevia', () => {
  it('fica 8 px embaixo do quadrado, alinhada à esquerda dele, com 388 px', () => {
    expect(LARGURA_DA_PREVIA).toBe(388);
    const quadrado = { left: 300, top: 236, right: 412, bottom: 328 };
    expect(lugarDaPrevia(quadrado, AREA, 420)).toEqual({
      left: 300,
      top: 336,
      largura: 388,
      alturaMaxima: null,
    });
  });

  it('o #1033 do m01, no primeiro quadrado da última coluna, encosta na borda direita das colunas', () => {
    // A coluna de Renato vai de 1173 a 1424; o #1033 começa a 9 px dela (o respiro e a borda).
    const doSwitch = { left: 1182, top: 236, right: 1294, bottom: 328 };
    const lugar = lugarDaPrevia(doSwitch, AREA, 420);
    expect(lugar.left).toBe(1424 - 388);
    // O m01 põe a prévia a 146 px antes do quadrado.
    expect(lugar.left - doSwitch.left).toBe(-146);
    expect(lugar.top).toBe(336);
  });

  it('na área mais estreita que ela, fica com a largura da área', () => {
    const estreita = { left: 16, top: 120, right: 336, bottom: 860 };
    expect(lugarDaPrevia({ left: 120, top: 236, right: 232, bottom: 328 }, estreita, 420)).toEqual({
      left: 16,
      top: 336,
      largura: 320,
      alturaMaxima: null,
    });
  });

  it('o quadrado que a rolagem de lado deixou meio fora: ela começa na borda esquerda da área', () => {
    // As colunas rolaram de lado, e o quadrado começa 40 px antes da área.
    expect(lugarDaPrevia({ left: -24, top: 236, right: 88, bottom: 328 }, AREA, 420)).toEqual({
      left: 16,
      top: 336,
      largura: 388,
      alturaMaxima: null,
    });
  });

  it('a altura justa cabe, embaixo e em cima', () => {
    // 420 px embaixo, de 440 a 860: inteira embaixo.
    expect(lugarDaPrevia({ left: 300, top: 340, right: 412, bottom: 432 }, AREA, 420)).toEqual({
      left: 300,
      top: 440,
      largura: 388,
      alturaMaxima: null,
    });
    // 212 px embaixo e 420 em cima, de 120 a 540: inteira em cima.
    expect(lugarDaPrevia({ left: 300, top: 548, right: 412, bottom: 640 }, AREA, 420)).toEqual({
      left: 300,
      top: 120,
      largura: 388,
      alturaMaxima: null,
    });
  });

  it('sem lugar embaixo, vai 8 px em cima do quadrado', () => {
    const embaixo = { left: 300, top: 640, right: 412, bottom: 732 };
    expect(lugarDaPrevia(embaixo, AREA, 420)).toEqual({
      left: 300,
      top: 640 - 8 - 420,
      largura: 388,
      alturaMaxima: null,
    });
  });

  it('sem lugar nem embaixo nem em cima, vai no lado com mais espaço, até a borda da área', () => {
    const baixa = { left: 16, top: 120, right: 1424, bottom: 560 };
    // 192 px em cima (de 120 a 312, fora o vão) e 120 embaixo (de 440 a 560): vai em cima.
    expect(lugarDaPrevia({ left: 300, top: 320, right: 412, bottom: 432 }, baixa, 420)).toEqual({
      left: 300,
      top: 120,
      largura: 388,
      alturaMaxima: 192,
    });
    // 72 px em cima e 260 embaixo: vai embaixo.
    expect(lugarDaPrevia({ left: 300, top: 200, right: 412, bottom: 292 }, baixa, 420)).toEqual({
      left: 300,
      top: 300,
      largura: 388,
      alturaMaxima: 260,
    });
    // 166 px em cima e 166 embaixo: com o mesmo espaço, embaixo.
    expect(lugarDaPrevia({ left: 300, top: 294, right: 412, bottom: 386 }, baixa, 420)).toEqual({
      left: 300,
      top: 394,
      largura: 388,
      alturaMaxima: 166,
    });
  });

  it('na área mais baixa que o quadrado e os vãos, a altura que cabe é zero, e não negativa', () => {
    const rasa = { left: 16, top: 120, right: 1424, bottom: 200 };
    // Faltam 3 px em cima e 25 embaixo: vai em cima.
    expect(lugarDaPrevia({ left: 300, top: 125, right: 412, bottom: 217 }, rasa, 420)).toEqual({
      left: 300,
      top: 120,
      largura: 388,
      alturaMaxima: 0,
    });
    // Faltam 18 px em cima e 10 embaixo: vai embaixo.
    expect(lugarDaPrevia({ left: 300, top: 110, right: 412, bottom: 202 }, rasa, 420)).toEqual({
      left: 300,
      top: 210,
      largura: 388,
      alturaMaxima: 0,
    });
  });
});

describe('foraDaArea', () => {
  it('o quadrado que passou inteiro de uma borda da área está fora', () => {
    expect(foraDaArea({ left: 300, top: 27, right: 412, bottom: 119 }, AREA)).toBe(true);
    expect(foraDaArea({ left: 300, top: 861, right: 412, bottom: 953 }, AREA)).toBe(true);
    expect(foraDaArea({ left: -97, top: 236, right: 15, bottom: 328 }, AREA)).toBe(true);
    expect(foraDaArea({ left: 1425, top: 236, right: 1537, bottom: 328 }, AREA)).toBe(true);
  });

  it('o que encosta numa borda ou fica meio fora dela continua dentro', () => {
    // Encostado em cada borda, por fora.
    expect(foraDaArea({ left: 300, top: 28, right: 412, bottom: 120 }, AREA)).toBe(false);
    expect(foraDaArea({ left: 300, top: 860, right: 412, bottom: 952 }, AREA)).toBe(false);
    expect(foraDaArea({ left: -96, top: 236, right: 16, bottom: 328 }, AREA)).toBe(false);
    expect(foraDaArea({ left: 1424, top: 236, right: 1536, bottom: 328 }, AREA)).toBe(false);
    // Meio fora, em cima e à esquerda.
    expect(foraDaArea({ left: 300, top: 70, right: 412, bottom: 162 }, AREA)).toBe(false);
    expect(foraDaArea({ left: -24, top: 236, right: 88, bottom: 328 }, AREA)).toBe(false);
  });
});

describe('momentoDaMensagem', () => {
  const dataHora = criarDataHora(FUSO_DOS_MOCKUPS);
  const momento = (dataHoraDaMensagem: string) =>
    momentoDaMensagem(sp(dataHoraDaMensagem), AGORA_DOS_MOCKUPS, dataHora);

  it('hoje, só a hora; ontem, "ontem" e a hora; antes, o dia e a hora', () => {
    expect(momento('2026-11-11T09:12:00')).toBe('09:12');
    expect(momento('2026-11-11T00:05:00')).toBe('00:05');
    expect(momento('2026-11-10T15:10:00')).toBe('ontem, 15:10');
    expect(momento('2026-11-09T16:00:00')).toBe('seg 9 nov, 16:00');
  });

  it('a mensagem de outro ano leva o ano', () => {
    expect(momento('2025-11-10T16:00:00')).toBe('10/11/2025, 16:00');
  });

  it('o dia é o do fuso da conta, e não o do computador', () => {
    // 00:30 de 11/11 em São Paulo são 23:30 de 10/11 em Manaus, 1 h atrás.
    const emManaus = criarDataHora('America/Manaus');
    expect(momentoDaMensagem(sp('2026-11-11T00:30:00'), AGORA_DOS_MOCKUPS, emManaus)).toBe(
      'ontem, 23:30',
    );
  });
});

describe('pessoasParaPassar', () => {
  /** O chamado dos mockups, na coluna dada; sem ela, na triagem. */
  const naColuna = (numero: number, daColuna: ColunaDoQuadro | null = null) => {
    const chamado = CHAMADOS_DOS_MOCKUPS.find((candidato) => candidato.numero === numero);
    if (!chamado) throw new Error(`Sem o #${numero}.`);
    return chamadoArrastado(chamado, daColuna);
  };
  const [, , , colunaDoRenato] = QUADRO_DOS_MOCKUPS.colunas;

  it('as pessoas das colunas, na ordem delas, fora quem está com o chamado, com os abertos', () => {
    // O #1033, com Renato: Ana, a conta da sessão, entra, como no m01.
    expect(
      pessoasParaPassar(QUADRO_DOS_MOCKUPS.colunas, naColuna(1033, colunaDoRenato ?? null)),
    ).toEqual([
      { conta: ANA.conta, nome: 'Ana Souza', abertos: 2 },
      { conta: BRUNO.conta, nome: 'Bruno Lima', abertos: 2 },
      { conta: DIEGO.conta, nome: 'Diego Martins', abertos: 3 },
    ]);
    // Da triagem, todas.
    expect(
      pessoasParaPassar(QUADRO_DOS_MOCKUPS.colunas, naColuna(1038)).map(({ nome }) => nome),
    ).toEqual(['Ana Souza', 'Bruno Lima', 'Diego Martins', 'Renato Alves']);
  });

  it('a coluna de quem não atende mais os chamados não recebe', () => {
    const naoAtendeMais = coluna(RENATO, [1033], null, { naoAtendeMais: true });
    const daAna = coluna(ANA, [1031], null);
    const colunas = [daAna, coluna(RENATO, [1037], null), naoAtendeMais];
    expect(pessoasParaPassar(colunas, naColuna(1031, daAna))).toEqual([
      { conta: RENATO.conta, nome: 'Renato Alves', abertos: 1 },
    ]);
    // Quem só tem a coluna de quem não atende mais não aparece.
    expect(pessoasParaPassar([coluna(ANA, [], null), naoAtendeMais], naColuna(1038))).toEqual([
      { conta: ANA.conta, nome: 'Ana Souza', abertos: 0 },
    ]);
  });

  it('quem não atende os locais do chamado fica de fora, como no arraste', () => {
    // Os chamados dos mockups não têm local: só quem atende a organização inteira os recebe.
    const soUmLocal = coluna(RENATO, [1037], null, {
      atende: { organizacao: false, locais: ['0199a6e0-0000-7000-8000-0000000000e1'] },
    });
    expect(
      pessoasParaPassar([coluna(ANA, [1031], null), soUmLocal], naColuna(1038)).map(
        ({ nome }) => nome,
      ),
    ).toEqual(['Ana Souza']);
  });
});

describe('acoesDoChamado', () => {
  const de = (numero: number) => {
    const chamado = CHAMADOS_DOS_MOCKUPS.find((candidato) => candidato.numero === numero);
    if (!chamado) throw new Error(`Sem o #${numero}.`);
    return chamado;
  };

  it('pela matriz das ações: assumir fora no que já está com a conta, devolver só em atendimento', () => {
    // Da triagem: assumir e passar.
    expect(acoesDoChamado(de(1038), ANA.conta)).toEqual({
      assumir: true,
      passar: true,
      devolver: false,
    });
    // Em atendimento com outra pessoa: as três.
    expect(acoesDoChamado(de(1033), ANA.conta)).toEqual({
      assumir: true,
      passar: true,
      devolver: true,
    });
    // Em atendimento com a conta: passar e devolver.
    expect(acoesDoChamado(de(1031), ANA.conta)).toEqual({
      assumir: false,
      passar: true,
      devolver: true,
    });
    // Aguardando com a conta: só passar.
    expect(acoesDoChamado(de(1041), ANA.conta)).toEqual({
      assumir: false,
      passar: true,
      devolver: false,
    });
    // Aguardando com outra pessoa: assumir e passar.
    expect(acoesDoChamado(de(1032), ANA.conta)).toEqual({
      assumir: true,
      passar: true,
      devolver: false,
    });
  });

  it('o resolvido não aceita nenhuma delas', () => {
    expect(acoesDoChamado({ situacao: 'resolvido', responsavel: BRUNO }, ANA.conta)).toEqual({
      assumir: false,
      passar: false,
      devolver: false,
    });
  });
});

describe('controleDaPrevia', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const criar = () => {
    const aoAbrir = vi.fn();
    const aoFechar = vi.fn();
    return { aoAbrir, aoFechar, controle: controleDaPrevia({ aoAbrir, aoFechar }) };
  };

  it('abre com o ponteiro parado 200 ms, e cada movimento recomeça a conta', () => {
    expect(ESPERA_DA_PREVIA).toBe(200);
    const { aoAbrir, controle } = criar();
    controle.moverSobre(1033);
    vi.advanceTimersByTime(150);
    controle.moverSobre(1033);
    vi.advanceTimersByTime(199);
    expect(aoAbrir).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith(1033);
  });

  it('o ponteiro que só passa não abre nada', () => {
    const { aoAbrir, controle } = criar();
    controle.ficar(1033);
    controle.moverSobre(1033);
    vi.advanceTimersByTime(120);
    controle.sair(1033);
    vi.advanceTimersByTime(1000);
    expect(aoAbrir).not.toHaveBeenCalled();
  });

  it('fecha 300 ms depois de o ponteiro sair do quadrado e dela, e voltar a tempo a mantém', () => {
    const { aoFechar, controle } = criar();
    controle.ficar(1033);
    controle.moverSobre(1033);
    vi.advanceTimersByTime(200);
    // O ponteiro passa do quadrado à prévia, pelo vão de 8 px.
    controle.sair(1033);
    vi.advanceTimersByTime(299);
    controle.ficar(1033);
    vi.advanceTimersByTime(1000);
    expect(aoFechar).not.toHaveBeenCalled();
    controle.sair(1033);
    vi.advanceTimersByTime(299);
    expect(aoFechar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(aoFechar).toHaveBeenCalledOnce();
  });

  it('com a prévia aberta, mover sobre o mesmo quadrado a mantém, sem abrir de novo', () => {
    const { aoAbrir, aoFechar, controle } = criar();
    controle.moverSobre(1033);
    vi.advanceTimersByTime(200);
    controle.moverSobre(1033);
    vi.advanceTimersByTime(1000);
    expect(aoAbrir).toHaveBeenCalledOnce();
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('só uma fica aberta: a de outro quadrado abre no lugar dela', () => {
    const { aoAbrir, aoFechar, controle } = criar();
    controle.moverSobre(1033);
    vi.advanceTimersByTime(200);
    controle.sair(1033);
    controle.ficar(1037);
    controle.moverSobre(1037);
    vi.advanceTimersByTime(200);
    expect(aoAbrir).toHaveBeenLastCalledWith(1037);
    // A troca não passa pelo fechar; o fechamento que contava para a outra não fecha a nova.
    vi.advanceTimersByTime(1000);
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('o foco do teclado abre na hora, e a saída do ponteiro não fecha a aberta pelo foco', () => {
    const { aoAbrir, aoFechar, controle } = criar();
    controle.focar(1038);
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith(1038);
    controle.ficar(1038);
    // O mouse que se move sobre o quadrado não a passa ao ponteiro.
    controle.moverSobre(1038);
    vi.advanceTimersByTime(200);
    controle.sair(1038);
    vi.advanceTimersByTime(1000);
    expect(aoFechar).not.toHaveBeenCalled();
    expect(controle.abertaPeloPonteiro(1038)).toBe(false);
    // O foco que sai do quadrado e dela a fecha.
    controle.focoSaiu(1038);
    expect(aoFechar).toHaveBeenCalledOnce();
  });

  it('o foco que sai de outro quadrado, ou da aberta pelo ponteiro, não fecha nada', () => {
    const { aoFechar, controle } = criar();
    controle.moverSobre(1033);
    vi.advanceTimersByTime(200);
    controle.focoSaiu(1033);
    controle.focoSaiu(1038);
    expect(aoFechar).not.toHaveBeenCalled();
    // Com a aberta pelo foco, o foco que sai de outro quadrado também não a fecha.
    controle.focar(1038);
    controle.focoSaiu(1033);
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('o foco cancela a espera do ponteiro em outro quadrado', () => {
    const { aoAbrir, controle } = criar();
    controle.moverSobre(1033);
    vi.advanceTimersByTime(100);
    controle.focar(1038);
    vi.advanceTimersByTime(1000);
    expect(aoAbrir.mock.calls).toEqual([[1038]]);
  });

  it('a rolagem fecha a aberta pelo ponteiro e cancela a espera; a aberta pelo foco fica', () => {
    const { aoAbrir, aoFechar, controle } = criar();
    controle.moverSobre(1033);
    vi.advanceTimersByTime(200);
    controle.rolou();
    expect(aoFechar).toHaveBeenCalledOnce();
    controle.moverSobre(1037);
    vi.advanceTimersByTime(100);
    controle.rolou();
    vi.advanceTimersByTime(1000);
    expect(aoAbrir.mock.calls).toEqual([[1033]]);
    controle.focar(1038);
    controle.rolou();
    expect(aoFechar).toHaveBeenCalledOnce();
  });

  it('o quadrado que sai da coluna fecha a aberta pelo ponteiro e acaba a espera dele; a aberta pelo foco fica', () => {
    const { aoAbrir, aoFechar, controle } = criar();
    controle.moverSobre(1033);
    vi.advanceTimersByTime(200);
    // O de outro quadrado não muda nada.
    controle.quadradoSaiu(1037);
    expect(aoFechar).not.toHaveBeenCalled();
    controle.quadradoSaiu(1033);
    expect(aoFechar).toHaveBeenCalledOnce();

    // A espera do quadrado que sai acaba; a de outro continua.
    controle.moverSobre(1037);
    vi.advanceTimersByTime(100);
    controle.quadradoSaiu(1037);
    vi.advanceTimersByTime(1000);
    expect(aoAbrir.mock.calls).toEqual([[1033]]);
    controle.moverSobre(1040);
    vi.advanceTimersByTime(100);
    controle.quadradoSaiu(1037);
    vi.advanceTimersByTime(100);
    expect(aoAbrir.mock.calls).toEqual([[1033], [1040]]);

    // A aberta pelo foco acompanha o quadrado.
    controle.focar(1038);
    controle.quadradoSaiu(1038);
    expect(aoFechar).toHaveBeenCalledOnce();
  });

  it('diz se a prévia do quadrado está aberta pelo ponteiro; o foco do teclado que chega a ela a leva', () => {
    const { aoAbrir, controle } = criar();
    expect(controle.abertaPeloPonteiro(1033)).toBe(false);
    controle.moverSobre(1033);
    vi.advanceTimersByTime(200);
    expect(controle.abertaPeloPonteiro(1033)).toBe(true);
    expect(controle.abertaPeloPonteiro(1038)).toBe(false);
    controle.focar(1033);
    expect(controle.abertaPeloPonteiro(1033)).toBe(false);
    // Passada ao foco, a mesma prévia não abre de novo.
    expect(aoAbrir).toHaveBeenCalledOnce();
    controle.fechar();
    expect(controle.abertaPeloPonteiro(1033)).toBe(false);
  });

  it('fechar fecha na hora e cancela as esperas; sem prévia aberta, não avisa', () => {
    const { aoAbrir, aoFechar, controle } = criar();
    controle.fechar();
    expect(aoFechar).not.toHaveBeenCalled();
    controle.focar(1038);
    controle.moverSobre(1040);
    controle.fechar();
    expect(aoFechar).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(aoAbrir.mock.calls).toEqual([[1038]]);
  });

  it('parar cancela as esperas sem avisar, para a tela que sai', () => {
    const { aoAbrir, aoFechar, controle } = criar();
    controle.moverSobre(1033);
    controle.parar();
    vi.advanceTimersByTime(1000);
    expect(aoAbrir).not.toHaveBeenCalled();
    // Nem com a prévia aberta, nem com ela fechando.
    controle.moverSobre(1033);
    vi.advanceTimersByTime(200);
    controle.sair(1033);
    controle.parar();
    vi.advanceTimersByTime(1000);
    expect(aoFechar).not.toHaveBeenCalled();
  });
});
