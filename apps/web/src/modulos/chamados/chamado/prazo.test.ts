// O quadro do prazo do chamado aberto (spec modulo-chamados, "Chamado aberto"; change
// chamados-da-ti, design, "O chamado aberto, o cabeçalho"): o prazo do tipo, a situação em destaque,
// o detalhe no tempo do relógio e a primeira resposta pendente.
import { HORARIO_DA_TI_PADRAO } from '@grafite/domain';
import { criarDataHora } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import { sp } from '../../../teste/chamados.ts';
import type { RelogioDaApi } from '../prazo.ts';
import { quadroDoPrazo } from './prazo.ts';

const dataHora = criarDataHora('America/Sao_Paulo');
const HORARIO = HORARIO_DA_TI_PADRAO;
// Quarta, 11 de novembro de 2026, às 09:40, como nos mockups.
const AGORA = sp('2026-11-11T09:40:00');

const horas = (valor: number) => ({ valor, unidade: 'h' as const });

function relogio(
  modo: 'horario' | 'corridas',
  resolucaoMin: number,
  { contadoS = 0, desde = null as string | null, respondido = false, respostaMin = 30 } = {},
): RelogioDaApi {
  return {
    prazo: {
      modo,
      respostaMin,
      resolucaoMin,
      resposta: { valor: respostaMin, unidade: 'min' },
      resolucao:
        resolucaoMin % 60 === 0
          ? horas(resolucaoMin / 60)
          : { valor: resolucaoMin, unidade: 'min' },
    },
    contadoS,
    relogioDesde: desde && sp(desde).toISOString(),
    primeiraRespostaEm: respondido ? sp('2026-11-11T08:05:00').toISOString() : null,
  };
}

const chamado = (
  abertoEm: string,
  doRelogio: RelogioDaApi | null,
  parouEm: string | null = null,
) => ({
  abertoEm: sp(abertoEm).toISOString(),
  relogio: doRelogio,
  parouEm: parouEm && sp(parouEm).toISOString(),
});

describe('quadroDoPrazo', () => {
  it('aberto fora do horário: conta da abertura do horário, e a resposta atrasada', () => {
    const quadro = quadroDoPrazo(
      chamado('2026-11-11T07:40:00', relogio('horario', 480, { desde: '2026-11-11T07:40:00' })),
      HORARIO,
      AGORA,
      dataHora,
    );
    expect(quadro).toEqual({
      prazoDoTipo: 'Prazo do tipo, 8 h, no horário da TI',
      destaque: 'Vence em 6 h',
      grupo: 'hoje',
      marca: 'neutra',
      detalhe: [
        { texto: 'Abriu às 07:40' },
        { texto: 'conta das 08:00' },
        { texto: 'vence às 16:00', mono: true },
      ],
      resposta: { texto: 'Resposta atrasada desde 08:30', atrasada: true },
    });
  });

  it('a resposta que ainda está no prazo, e sem o "conta das" quando abriu no horário', () => {
    const quadro = quadroDoPrazo(
      chamado('2026-11-11T09:20:00', relogio('horario', 480, { desde: '2026-11-11T09:20:00' })),
      HORARIO,
      AGORA,
      dataHora,
    );
    expect(quadro.detalhe).toEqual([
      { texto: 'Abriu às 09:20' },
      { texto: 'vence às 17:20', mono: true },
    ]);
    expect(quadro.resposta).toEqual({ texto: 'Responder até 09:50', atrasada: false });
  });

  it('sem a resposta pendente depois da primeira resposta', () => {
    const quadro = quadroDoPrazo(
      chamado(
        '2026-11-11T09:20:00',
        relogio('horario', 480, { desde: '2026-11-11T09:20:00', respondido: true }),
      ),
      HORARIO,
      AGORA,
      dataHora,
    );
    expect(quadro.resposta).toBeNull();
  });

  it('o estourado: "venceu", com o dia de ontem, e a cor do perigo', () => {
    const quadro = quadroDoPrazo(
      chamado(
        '2026-11-10T10:00:00',
        relogio('horario', 480, { desde: '2026-11-10T10:00:00', respondido: true }),
      ),
      HORARIO,
      AGORA,
      dataHora,
    );
    expect(quadro).toMatchObject({
      destaque: 'Estourado há 15 h',
      grupo: 'estourado',
      marca: 'critico',
      detalhe: [{ texto: 'Abriu ontem às 10:00' }, { texto: 'venceu ontem às 18:00', mono: true }],
    });
  });

  it('em horas corridas, sem o "conta das", e a atenção no que vence em até 2 h', () => {
    const quadro = quadroDoPrazo(
      chamado(
        '2026-11-11T07:40:00',
        relogio('corridas', 240, { desde: '2026-11-11T07:40:00', respondido: true }),
      ),
      HORARIO,
      AGORA,
      dataHora,
    );
    expect(quadro).toMatchObject({
      prazoDoTipo: 'Prazo do tipo, 4 h, em horas corridas',
      destaque: 'Vence em 2 h',
      grupo: 'ate-2-horas',
      marca: 'atencao',
      detalhe: [{ texto: 'Abriu às 07:40' }, { texto: 'vence às 11:40', mono: true }],
    });
  });

  it('o que vence amanhã e o prazo em dia útil', () => {
    const quadro = quadroDoPrazo(
      chamado('2026-11-11T09:00:00', {
        ...relogio('horario', 600, { desde: '2026-11-11T09:00:00', respondido: true }),
        prazo: {
          modo: 'horario',
          respostaMin: 30,
          resolucaoMin: 600,
          resposta: { valor: 30, unidade: 'min' },
          resolucao: { valor: 1, unidade: 'd' },
        },
      }),
      HORARIO,
      AGORA,
      dataHora,
    );
    expect(quadro).toMatchObject({
      prazoDoTipo: 'Prazo do tipo, 1 dia útil, no horário da TI',
      destaque: 'Vence em 23 h',
      detalhe: [{ texto: 'Abriu às 09:00' }, { texto: 'vence amanhã às 09:00', mono: true }],
    });
  });

  it('aberto na sexta à noite: conta a partir da segunda, com o dia da semana', () => {
    const sexta = sp('2026-11-13T19:30:00');
    const quadro = quadroDoPrazo(
      chamado(
        '2026-11-13T19:10:00',
        relogio('horario', 480, { desde: '2026-11-13T19:10:00', respondido: true }),
      ),
      HORARIO,
      sexta,
      dataHora,
    );
    expect(quadro).toMatchObject({
      destaque: 'Vence em 2 dias',
      detalhe: [
        { texto: 'Abriu às 19:10' },
        { texto: 'conta a partir de seg 16 nov às 08:00' },
        { texto: 'vence seg 16 nov às 16:00', mono: true },
      ],
    });
  });

  it('o relógio que já contou e voltou fora do horário não diz o "conta das"', () => {
    const quadro = quadroDoPrazo(
      chamado(
        '2026-11-10T10:00:00',
        relogio('horario', 480, {
          contadoS: 3600,
          desde: '2026-11-11T07:00:00',
          respondido: true,
        }),
      ),
      HORARIO,
      AGORA,
      dataHora,
    );
    expect(quadro.detalhe).toEqual([
      { texto: 'Abriu ontem às 10:00' },
      { texto: 'vence às 15:00', mono: true },
    ]);
  });

  it('parado antes do prazo: quando parou e o que resta, na medida em mono', () => {
    const quadro = quadroDoPrazo(
      chamado(
        '2026-11-10T17:05:00',
        relogio('horario', 240, { contadoS: 2 * 3600 + 16 * 60, respondido: true }),
        '2026-11-11T09:21:00',
      ),
      HORARIO,
      AGORA,
      dataHora,
    );
    expect(quadro).toEqual({
      prazoDoTipo: 'Prazo do tipo, 4 h, no horário da TI',
      destaque: 'Relógio parado',
      grupo: 'parado',
      marca: 'neutra',
      detalhe: [{ texto: 'Parou às 09:21' }, { texto: 'restam 1 h 44 min', mono: true }],
      resposta: null,
    });
  });

  it('parado depois do prazo: quanto passou', () => {
    const quadro = quadroDoPrazo(
      chamado(
        '2026-11-10T17:05:00',
        relogio('horario', 240, { contadoS: 4 * 3600 + 20 * 60, respondido: true }),
        '2026-11-10T17:30:00',
      ),
      HORARIO,
      AGORA,
      dataHora,
    );
    expect(quadro.detalhe).toEqual([
      { texto: 'Parou ontem às 17:30' },
      { texto: 'passou 20 min do prazo', mono: true },
    ]);
  });

  it('o singular no que resta: 1 h, 1 min e menos de 1 min', () => {
    const resta = (contadoS: number) =>
      quadroDoPrazo(
        chamado('2026-11-11T08:00:00', relogio('horario', 240, { contadoS, respondido: true })),
        HORARIO,
        AGORA,
        dataHora,
      ).detalhe;
    expect(resta(3 * 3600)).toEqual([{ texto: 'resta 1 h', mono: true }]);
    expect(resta(4 * 3600 - 60)).toEqual([{ texto: 'resta 1 min', mono: true }]);
    expect(resta(4 * 3600 - 30)).toEqual([{ texto: 'resta menos de 1 min', mono: true }]);
    expect(resta(3 * 3600 - 60)).toEqual([{ texto: 'restam 1 h 1 min', mono: true }]);
  });

  it('o prazo ilegível, sem relógio', () => {
    const quadro = quadroDoPrazo(chamado('2026-11-11T07:40:00', null), HORARIO, AGORA, dataHora);
    expect(quadro).toEqual({
      prazoDoTipo: null,
      destaque: 'Prazo ilegível',
      grupo: null,
      marca: 'neutra',
      detalhe: [{ texto: 'Abriu às 07:40' }],
      resposta: null,
    });
  });
});
