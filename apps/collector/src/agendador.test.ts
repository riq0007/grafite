import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AlvoAgendado, criarAgendador } from './agendador.ts';

const alvo = (ativoId: string, ip = '10.0.0.5', intervalo = 120_000): AlvoAgendado => ({
  ativoId,
  ip,
  intervalo,
  coleta: { tipo: 'ping' },
});

/** A leitura SNMP do ativo, a cada 10 minutos (change p2b-impressoras-por-snmp, design, decisão 5). */
const snmp = (
  ativoId: string,
  comunidade = 'comunidade-1',
  versao: '1' | '2c' = '2c',
): AlvoAgendado => ({
  ativoId,
  ip: '10.0.0.5',
  intervalo: 600_000,
  coleta: { tipo: 'snmp', versao, comunidade },
});

/** A sondagem do controle, a cada 5 minutos (change p2c-saude-do-control-id, design, decisão 4). */
const controle = (ativoId: string, senha = 'senha-1', porta = 80): AlvoAgendado => ({
  ativoId,
  ip: '10.0.5.77',
  intervalo: 300_000,
  coleta: { tipo: 'controlid', porta, usuario: 'admin', senha },
});

const doTipo = (chamadas: [AlvoAgendado][], tipo: 'ping' | 'snmp' | 'controlid') =>
  chamadas.filter(([chamado]) => chamado.coleta.tipo === tipo).length;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Deixa as promessas resolvidas andarem, sem avançar o relógio. */
const andar = () => vi.advanceTimersByTimeAsync(0);

describe('o agendador da coleta', () => {
  it('pinga o alvo novo logo e depois a cada intervalo, com o atraso aleatório de até 10%', async () => {
    const executar = vi.fn(async (_alvo: AlvoAgendado) => {});
    const agendador = criarAgendador({ executar, aleatorio: () => 0.5 });
    agendador.definirAlvos([alvo('a')]);
    await andar();
    expect(executar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(125_999);
    expect(executar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(executar).toHaveBeenCalledTimes(2);
    agendador.parar();
  });

  it('mantém o alvo que continua, sem pingar de novo na hora, e tira o que saiu', async () => {
    const executar = vi.fn(async (_alvo: AlvoAgendado) => {});
    const agendador = criarAgendador({ executar, aleatorio: () => 0 });
    agendador.definirAlvos([alvo('a'), alvo('b', '10.0.0.6')]);
    await andar();
    expect(executar).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    agendador.definirAlvos([alvo('a')]);
    await andar();
    expect(executar).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(executar.mock.calls.map(([chamado]) => chamado.ativoId)).toEqual(['a', 'b', 'a']);
    agendador.parar();
  });

  it('o alvo com o IP trocado é pingado logo, no IP novo', async () => {
    const executar = vi.fn(async (_alvo: AlvoAgendado) => {});
    const agendador = criarAgendador({ executar, aleatorio: () => 0 });
    agendador.definirAlvos([alvo('a', '10.0.0.5')]);
    await andar();
    agendador.definirAlvos([alvo('a', '10.0.0.7')]);
    await andar();
    expect(executar).toHaveBeenLastCalledWith(alvo('a', '10.0.0.7'));
    agendador.parar();
  });

  it('roda até 32 pings ao mesmo tempo e põe os outros na fila', async () => {
    const pendentes: (() => void)[] = [];
    const executar = vi.fn(
      () =>
        new Promise<void>((fim) => {
          pendentes.push(fim);
        }),
    );
    const agendador = criarAgendador({ executar, aleatorio: () => 0 });
    agendador.definirAlvos(Array.from({ length: 40 }, (_, i) => alvo(`a${i}`, `10.0.0.${i + 1}`)));
    await andar();
    expect(executar).toHaveBeenCalledTimes(32);
    pendentes.shift()?.();
    await andar();
    expect(executar).toHaveBeenCalledTimes(33);
    agendador.parar();
  });

  it('agenda o ping e o SNMP do mesmo ativo à parte, cada um no intervalo dele', async () => {
    const executar = vi.fn(async (_alvo: AlvoAgendado) => {});
    const agendador = criarAgendador({ executar, aleatorio: () => 0 });
    agendador.definirAlvos([alvo('a'), snmp('a')]);
    await andar();
    expect(executar.mock.calls.map(([chamado]) => chamado.coleta.tipo)).toEqual(['ping', 'snmp']);
    expect(agendador.estado().alvos).toBe(2);
    await vi.advanceTimersByTimeAsync(480_000);
    expect([doTipo(executar.mock.calls, 'ping'), doTipo(executar.mock.calls, 'snmp')]).toEqual([
      5, 1,
    ]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect([doTipo(executar.mock.calls, 'ping'), doTipo(executar.mock.calls, 'snmp')]).toEqual([
      6, 2,
    ]);
    agendador.parar();
  });

  it('a comunidade ou a versão trocada lê o SNMP logo, e o ping do mesmo ativo mantém o ritmo', async () => {
    const executar = vi.fn(async (_alvo: AlvoAgendado) => {});
    const agendador = criarAgendador({ executar, aleatorio: () => 0 });
    agendador.definirAlvos([alvo('a'), snmp('a', 'comunidade-1', '2c')]);
    await andar();
    agendador.definirAlvos([alvo('a'), snmp('a', 'comunidade-2', '2c')]);
    await andar();
    expect(executar).toHaveBeenCalledTimes(3);
    expect(executar).toHaveBeenLastCalledWith(snmp('a', 'comunidade-2', '2c'));
    agendador.definirAlvos([alvo('a'), snmp('a', 'comunidade-2', '1')]);
    await andar();
    expect(executar).toHaveBeenCalledTimes(4);
    expect(executar).toHaveBeenLastCalledWith(snmp('a', 'comunidade-2', '1'));
    agendador.definirAlvos([alvo('a'), snmp('a', 'comunidade-2', '1')]);
    await andar();
    expect(executar).toHaveBeenCalledTimes(4);
    agendador.parar();
  });

  it('a senha ou a porta trocadas sondam o controle logo, e a mesma sondagem mantém o ritmo', async () => {
    const executar = vi.fn(async (_alvo: AlvoAgendado) => {});
    const agendador = criarAgendador({ executar, aleatorio: () => 0 });
    agendador.definirAlvos([alvo('c'), controle('c', 'senha-1')]);
    await andar();
    expect(executar.mock.calls.map(([chamado]) => chamado.coleta.tipo)).toEqual([
      'ping',
      'controlid',
    ]);
    agendador.definirAlvos([alvo('c'), controle('c', 'senha-2')]);
    await andar();
    expect(executar).toHaveBeenLastCalledWith(controle('c', 'senha-2'));
    agendador.definirAlvos([alvo('c'), controle('c', 'senha-2', 8080)]);
    await andar();
    expect(executar).toHaveBeenLastCalledWith(controle('c', 'senha-2', 8080));
    agendador.definirAlvos([alvo('c'), controle('c', 'senha-2', 8080)]);
    await andar();
    expect(executar).toHaveBeenCalledTimes(4);
    agendador.parar();
  });

  it('o limite de 32 leituras ao mesmo tempo vale para o ping e o SNMP juntos', async () => {
    const pendentes: (() => void)[] = [];
    const executar = vi.fn(
      (_alvo: AlvoAgendado) =>
        new Promise<void>((fim) => {
          pendentes.push(fim);
        }),
    );
    const agendador = criarAgendador({ executar, aleatorio: () => 0 });
    agendador.definirAlvos(
      Array.from({ length: 20 }, (_, i) => [alvo(`a${i}`), snmp(`a${i}`)]).flat(),
    );
    await andar();
    expect(executar).toHaveBeenCalledTimes(32);
    expect(agendador.estado()).toEqual({ alvos: 40, rodando: 32, naFila: 8 });
    pendentes.shift()?.();
    await andar();
    expect(executar).toHaveBeenCalledTimes(33);
    agendador.parar();
  });

  it('um ping que falha não para o agendador', async () => {
    const executar = vi.fn(async () => {
      throw new Error('falhou');
    });
    const agendador = criarAgendador({ executar, aleatorio: () => 0 });
    agendador.definirAlvos([alvo('a')]);
    await andar();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(executar).toHaveBeenCalledTimes(2);
    agendador.parar();
  });
});
