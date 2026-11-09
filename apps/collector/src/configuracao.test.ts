import { describe, expect, it, vi } from 'vitest';
import type { RespostaDaApi } from './api.ts';
import { type ConfiguracaoDaColeta, criarFonteDaConfiguracao } from './configuracao.ts';

const AGORA = new Date('2026-10-12T12:00:00.000Z');
const alvo = (ativoId: string, ip: string) => ({
  ativoId,
  ip,
  coletas: [{ tipo: 'ping' as const, intervalo: 120 }],
});

function fonteCom(respostas: RespostaDaApi<ConfiguracaoDaColeta>[]) {
  const avisos: string[] = [];
  const api = {
    configuracao: vi.fn(
      async () => respostas.shift() ?? { tipo: 'indisponivel' as const, motivo: 'fim' },
    ),
  };
  const fonte = criarFonteDaConfiguracao({
    api,
    agora: () => AGORA,
    log: { warn: (_dados: object, mensagem: string) => avisos.push(mensagem), info: () => {} },
  });
  return { fonte, avisos, api };
}

const ok = (dados: ConfiguracaoDaColeta) => ({ tipo: 'ok' as const, dados });

describe('a configuração da coleta', () => {
  it('guarda só os alvos dentro das faixas do coletor e diz quando buscar de novo', async () => {
    const { fonte, avisos } = fonteCom([
      ok({
        faixas: ['10.0.0.0/24'],
        alvos: [alvo('a', '10.0.0.5'), alvo('b', '10.0.9.5')],
        proximaEm: 300,
      }),
    ]);
    expect(await fonte.buscar()).toBe(300_000);
    expect(fonte.estado()).toEqual({
      alvos: [alvo('a', '10.0.0.5')],
      ultimaConfiguracao: AGORA,
      tokenRecusado: false,
      apiSemResponderDesde: null,
    });
    expect(avisos).toEqual(['alvo fora das faixas do coletor recusado']);
  });

  it('com o token recusado, para de coletar e tenta de novo a cada minuto, até voltar', async () => {
    const { fonte } = fonteCom([
      ok({ faixas: ['10.0.0.0/24'], alvos: [alvo('a', '10.0.0.5')], proximaEm: 300 }),
      { tipo: 'token-recusado' },
      ok({ faixas: ['10.0.0.0/24'], alvos: [alvo('a', '10.0.0.5')], proximaEm: 300 }),
    ]);
    await fonte.buscar();
    expect(await fonte.buscar()).toBe(60_000);
    expect(fonte.estado()).toMatchObject({ alvos: [], tokenRecusado: true });
    expect(await fonte.buscar()).toBe(300_000);
    expect(fonte.estado()).toMatchObject({ alvos: [alvo('a', '10.0.0.5')], tokenRecusado: false });
  });

  it('com a API fora do ar, mantém os alvos de antes e tenta de novo em um minuto', async () => {
    const { fonte } = fonteCom([
      ok({ faixas: ['10.0.0.0/24'], alvos: [alvo('a', '10.0.0.5')], proximaEm: 300 }),
      { tipo: 'indisponivel', motivo: 'ECONNREFUSED' },
    ]);
    await fonte.buscar();
    expect(await fonte.buscar()).toBe(60_000);
    expect(fonte.estado()).toMatchObject({
      alvos: [alvo('a', '10.0.0.5')],
      tokenRecusado: false,
      apiSemResponderDesde: AGORA,
    });
  });
});
