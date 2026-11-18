// O painel dos prazos (spec modulo-chamados, "Prazos"; change chamados-da-ti, design, "O painel dos
// prazos (tarefa 5.16)"; mockup m06): a barra do prazo em proporção, as ações pela permissão e a
// mensagem pronta para quem pediu, pela situação do prazo no momento da tela.
import { criarDataHora } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import {
  AGORA_DOS_MOCKUPS,
  ANA,
  CHAMADOS_DOS_MOCKUPS,
  chamadoNosPrazos,
  correndo,
  FUSO_DOS_MOCKUPS,
  PRAZOS_DOS_MOCKUPS,
  parado,
  QUADRO_DOS_MOCKUPS,
  RENATO,
  sp,
} from '../../../teste/chamados.ts';
import type { ChamadoNosPrazos } from '../consultas.ts';
import { contadorDoPrazo } from '../prazo.ts';
import { acoesDoPainel, barraDoPainel, mensagemPronta } from './painel.ts';

const dataHora = criarDataHora(FUSO_DOS_MOCKUPS);
const { horario } = PRAZOS_DOS_MOCKUPS;

const doMockup = (numero: number) => {
  const chamado = CHAMADOS_DOS_MOCKUPS.find((um) => um.numero === numero);
  if (!chamado) throw new Error(`Sem o #${numero} nos mockups.`);
  return chamado;
};

const situacaoDe = (chamado: ChamadoNosPrazos, agora = AGORA_DOS_MOCKUPS) =>
  chamado.relogio ? contadorDoPrazo(agora, FUSO_DOS_MOCKUPS)(chamado.relogio, horario) : null;

const situacaoCerta = (chamado: ChamadoNosPrazos) => {
  const situacao = situacaoDe(chamado);
  if (!situacao) throw new Error(`O #${chamado.numero} está sem relógio.`);
  return situacao;
};

const mensagem = (
  chamado: ChamadoNosPrazos,
  { agora = AGORA_DOS_MOCKUPS, conta = null }: { agora?: Date; conta?: string | null } = {},
) => mensagemPronta({ chamado, situacao: situacaoDe(chamado, agora), conta, agora, dataHora });

/** O #1033 do m06, com outro relógio, outra pessoa ou ninguém atendendo. */
const comoO1033 = (mudar: Partial<Parameters<typeof chamadoNosPrazos>[3]>) =>
  chamadoNosPrazos(1033, 'rede', 'Switch Rack 2 sem link na porta 3', {
    pessoa: 'Sandra Vieira',
    responsavel: RENATO,
    abertoEm: sp('2026-11-11T01:20:00'),
    relogio: correndo(8, -20),
    ...mudar,
  });

describe('a barra do painel', () => {
  it('no estourado, o prazo e o tempo além dele: as 8 h do #1033 e os 20 min hachurados', () => {
    const barra = barraDoPainel(situacaoCerta(doMockup(1033)));
    expect(barra.tom).toBe('critico');
    expect(barra.gasto).toBeCloseTo(96);
    expect(barra.resta).toBe(0);
    expect(barra.estouro).toBeCloseTo(4);
  });

  it('no que ainda vence, o gasto e o que resta, com a cor de atenção até 2 h', () => {
    // O #1039: 5 h de prazo, vence em 1 h.
    const barra = barraDoPainel(situacaoCerta(doMockup(1039)));
    expect(barra).toEqual({ tom: 'atencao', gasto: 80, resta: 20, estouro: 0 });
    // O #1037: 8 h de prazo, vence em 4 h, em cinza.
    expect(barraDoPainel(situacaoCerta(doMockup(1037))).tom).toBe('neutro');
  });

  it('no relógio parado, o que ele contou, em cinza, e o além do prazo, se passou', () => {
    // O #1041: 4 h de prazo, 2 h 16 min contados.
    const barra = barraDoPainel(situacaoCerta(doMockup(1041)));
    expect(barra.tom).toBe('neutro');
    expect(barra.gasto).toBeCloseTo(56.667, 2);
    expect(barra.resta).toBeCloseTo(43.333, 2);
    const passou = comoO1033({ relogio: parado(4, 5 * 60) });
    expect(barraDoPainel(situacaoCerta(passou))).toEqual({
      tom: 'neutro',
      gasto: 80,
      resta: 0,
      estouro: 20,
    });
  });
});

describe('as ações do painel', () => {
  const colunas = QUADRO_DOS_MOCKUPS.colunas;

  it('a quem só vê os chamados, nenhuma', () => {
    expect(
      acoesDoPainel(doMockup(1033), { podeAtender: false, conta: ANA.conta, colunas }),
    ).toEqual({ avisar: false, pessoas: [] });
  });

  it('a quem atende, o "Avisar" e as pessoas do quadro, fora quem está com o chamado', () => {
    const acoes = acoesDoPainel(doMockup(1033), { podeAtender: true, conta: ANA.conta, colunas });
    expect(acoes.avisar).toBe(true);
    expect(acoes.pessoas.map(({ nome, abertos }) => [nome, abertos])).toEqual([
      ['Ana Souza', 2],
      ['Bruno Lima', 2],
      ['Diego Martins', 3],
    ]);
  });

  it('sem o quadro ainda, o "Avisar" sem as pessoas', () => {
    expect(
      acoesDoPainel(doMockup(1033), { podeAtender: true, conta: ANA.conta, colunas: null }),
    ).toEqual({ avisar: true, pessoas: [] });
  });
});

describe('a mensagem pronta', () => {
  it('no estourado, a posição até a primeira meia hora cheia depois de 30 min: a do m06', () => {
    expect(mensagem(doMockup(1033))).toBe(
      'Sandra, o chamado passou do prazo e já está com Renato. Voltamos com uma posição até as 10:30.',
    );
    expect(mensagem(doMockup(1033), { agora: sp('2026-11-11T10:00:00') })).toMatch(
      /posição até as 10:30\.$/,
    );
    expect(mensagem(doMockup(1033), { agora: sp('2026-11-11T10:05:00') })).toMatch(
      /posição até as 11:00\.$/,
    );
    expect(mensagem(doMockup(1033), { agora: sp('2026-11-11T23:40:00') })).toMatch(
      /posição até amanhã às 00:30\.$/,
    );
  });

  it('na triagem, a fila da TI; com a própria conta, "comigo"', () => {
    expect(mensagem(comoO1033({ responsavel: null }))).toBe(
      'Sandra, o chamado passou do prazo e está na fila da TI. Voltamos com uma posição até as 10:30.',
    );
    expect(mensagem(doMockup(1033), { conta: RENATO.conta })).toBe(
      'Sandra, o chamado passou do prazo e já está comigo. Voltamos com uma posição até as 10:30.',
    );
  });

  it('no que ainda vence, a previsão é o vencimento, com o dia quando não é hoje', () => {
    expect(mensagem(doMockup(1039))).toBe(
      'Luiza, o chamado está com Diego. A previsão é resolver até as 10:40.',
    );
    expect(mensagem(doMockup(1040))).toBe(
      'Paulo, o chamado está na fila da TI. A previsão é resolver até as 14:52.',
    );
    expect(mensagem(comoO1033({ relogio: correndo(48, 24 * 60 + 30) }))).toBe(
      'Sandra, o chamado está com Renato. A previsão é resolver até amanhã às 10:10.',
    );
  });

  it('no relógio parado, a resposta que o chamado espera', () => {
    expect(mensagem(doMockup(1041))).toBe(
      'Fernanda, o chamado está esperando a sua resposta. Assim que você responder, a TI retoma o atendimento.',
    );
  });

  it('no prazo ilegível, a posição, sem o prazo', () => {
    expect(mensagem(comoO1033({ relogio: null }))).toBe(
      'Sandra, o chamado está com Renato. Voltamos com uma posição até as 10:30.',
    );
  });
});
