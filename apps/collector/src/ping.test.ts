import { describe, expect, it, vi } from 'vitest';
import { argumentosDoPing, executarPing, leiturasDoPing, lerSaidaDoPing } from './ping.ts';

// Saídas reais do comando ping de cada sistema, com a resposta, sem ela e com a falha.
const WINDOWS_PT_BR = `
Disparando 10.0.0.5 com 32 bytes de dados:
Resposta de 10.0.0.5: bytes=32 tempo=3ms TTL=255

Estatísticas do Ping para 10.0.0.5:
    Pacotes: Enviados = 1, Recebidos = 1, Perdidos = 0 (0% de
             perda),
Aproximar um número redondo de vezes em milissegundos:
    Mínimo = 3ms, Máximo = 3ms, Média = 3ms
`;
const WINDOWS_PT_BR_LOCAL = `
Disparando 127.0.0.1 com 32 bytes de dados:
Resposta de 127.0.0.1: bytes=32 tempo<1ms TTL=128

Estatísticas do Ping para 127.0.0.1:
    Pacotes: Enviados = 1, Recebidos = 1, Perdidos = 0 (0% de
             perda),
Aproximar um número redondo de vezes em milissegundos:
    Mínimo = 0ms, Máximo = 0ms, Média = 0ms
`;
const WINDOWS_PT_BR_IPV6 = `
Disparando ::1 com 32 bytes de dados:
Resposta de ::1: tempo<1ms

Estatísticas do Ping para ::1:
    Pacotes: Enviados = 1, Recebidos = 1, Perdidos = 0 (0% de
             perda),
Aproximar um número redondo de vezes em milissegundos:
    Mínimo = 0ms, Máximo = 0ms, Média = 0ms
`;
const WINDOWS_PT_BR_TEMPO_ESGOTADO = `
Disparando 192.0.2.1 com 32 bytes de dados:
Esgotado o tempo limite do pedido.

Estatísticas do Ping para 192.0.2.1:
    Pacotes: Enviados = 1, Recebidos = 0, Perdidos = 1 (100% de
             perda),
`;
const WINDOWS_PT_BR_INACESSIVEL = `
Disparando 10.0.9.9 com 32 bytes de dados:
Resposta de 10.0.0.1: Host de destino inacessível.

Estatísticas do Ping para 10.0.9.9:
    Pacotes: Enviados = 1, Recebidos = 1, Perdidos = 0 (0% de
             perda),
`;
const WINDOWS_PT_BR_SEM_HOST =
  'A solicitação ping não pôde encontrar o host 300.1.1.1. Verifique o nome e tente\nnovamente.\n';
const WINDOWS_EN_US = `
Pinging 10.0.0.5 with 32 bytes of data:
Reply from 10.0.0.5: bytes=32 time=14ms TTL=64

Ping statistics for 10.0.0.5:
    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 14ms, Maximum = 14ms, Average = 14ms
`;
const WINDOWS_EN_US_TEMPO_ESGOTADO = `
Pinging 192.0.2.1 with 32 bytes of data:
Request timed out.

Ping statistics for 192.0.2.1:
    Packets: Sent = 1, Received = 0, Lost = 1 (100% loss),
`;
const WINDOWS_EN_US_INACESSIVEL = `
Pinging 10.0.9.9 with 32 bytes of data:
Reply from 10.0.0.1: Destination host unreachable.

Ping statistics for 10.0.9.9:
    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),
`;
const LINUX = `PING 10.0.0.5 (10.0.0.5) 56(84) bytes of data.
64 bytes from 10.0.0.5: icmp_seq=1 ttl=64 time=0.412 ms

--- 10.0.0.5 ping statistics ---
1 packets transmitted, 1 received, 0% packet loss, time 0ms
rtt min/avg/max/mdev = 0.412/0.412/0.412/0.000 ms
`;
const LINUX_SEM_RESPOSTA = `PING 192.0.2.1 (192.0.2.1) 56(84) bytes of data.

--- 192.0.2.1 ping statistics ---
1 packets transmitted, 0 received, 100% packet loss, time 0ms

`;
const LINUX_SEM_ROTA = 'ping: connect: Network is unreachable\n';
const BUSYBOX = `PING 127.0.0.1 (127.0.0.1): 56 data bytes
64 bytes from 127.0.0.1: seq=0 ttl=64 time=0.078 ms

--- 127.0.0.1 ping statistics ---
1 packets transmitted, 1 packets received, 0% packet loss
round-trip min/avg/max = 0.078/0.078/0.078 ms
`;
const BUSYBOX_SEM_PERMISSAO = 'ping: permission denied (are you root?)\n';

describe('lerSaidaDoPing', () => {
  it('lê a resposta do Windows em português e em inglês, com a latência', () => {
    expect(lerSaidaDoPing(WINDOWS_PT_BR, { ip: '10.0.0.5', codigo: 0 })).toEqual({
      resultado: 'online',
      latencia: 3,
    });
    expect(lerSaidaDoPing(WINDOWS_PT_BR_LOCAL, { ip: '127.0.0.1', codigo: 0 })).toEqual({
      resultado: 'online',
      latencia: 0,
    });
    expect(lerSaidaDoPing(WINDOWS_EN_US, { ip: '10.0.0.5', codigo: 0 })).toEqual({
      resultado: 'online',
      latencia: 14,
    });
  });

  it('lê a resposta do IPv6 do Windows, que vem sem o TTL, pelo IP do alvo', () => {
    expect(lerSaidaDoPing(WINDOWS_PT_BR_IPV6, { ip: '::1', codigo: 0 })).toEqual({
      resultado: 'online',
      latencia: 0,
    });
  });

  it('lê a resposta do Linux e do BusyBox', () => {
    expect(lerSaidaDoPing(LINUX, { ip: '10.0.0.5', codigo: 0 })).toEqual({
      resultado: 'online',
      latencia: 0.412,
    });
    expect(lerSaidaDoPing(BUSYBOX, { ip: '127.0.0.1', codigo: 0 })).toEqual({
      resultado: 'online',
      latencia: 0.078,
    });
  });

  it('sem a resposta, a estatística da perda diz offline, mesmo com o código 0 do Windows', () => {
    expect(lerSaidaDoPing(WINDOWS_PT_BR_TEMPO_ESGOTADO, { ip: '192.0.2.1', codigo: 1 })).toEqual({
      resultado: 'offline',
    });
    expect(lerSaidaDoPing(WINDOWS_EN_US_TEMPO_ESGOTADO, { ip: '192.0.2.1', codigo: 1 })).toEqual({
      resultado: 'offline',
    });
    // O roteador responde que o destino está inacessível, e o Windows sai com 0.
    expect(lerSaidaDoPing(WINDOWS_PT_BR_INACESSIVEL, { ip: '10.0.9.9', codigo: 0 })).toEqual({
      resultado: 'offline',
    });
    expect(lerSaidaDoPing(WINDOWS_EN_US_INACESSIVEL, { ip: '10.0.9.9', codigo: 0 })).toEqual({
      resultado: 'offline',
    });
    expect(lerSaidaDoPing(LINUX_SEM_RESPOSTA, { ip: '192.0.2.1', codigo: 1 })).toEqual({
      resultado: 'offline',
    });
  });

  it('sem a resposta e sem a estatística, o ping falhou: sem dado, com a mensagem', () => {
    expect(lerSaidaDoPing(WINDOWS_PT_BR_SEM_HOST, { ip: '300.1.1.1', codigo: 1 })).toEqual({
      resultado: 'sem-dado',
      motivo: 'A solicitação ping não pôde encontrar o host 300.1.1.1. Verifique o nome e tente',
    });
    expect(lerSaidaDoPing(LINUX_SEM_ROTA, { ip: '10.0.0.5', codigo: 2 })).toEqual({
      resultado: 'sem-dado',
      motivo: 'ping: connect: Network is unreachable',
    });
    expect(lerSaidaDoPing(BUSYBOX_SEM_PERMISSAO, { ip: '10.0.0.5', codigo: 1 })).toEqual({
      resultado: 'sem-dado',
      motivo: 'ping: permission denied (are you root?)',
    });
    expect(lerSaidaDoPing('', { ip: '10.0.0.5', codigo: 3 })).toEqual({
      resultado: 'sem-dado',
      motivo: 'O ping terminou com o código 3, sem dizer o motivo.',
    });
  });

  it('o texto que não se reconhece fica online, sem a latência, quando o ping sai com 0', () => {
    expect(lerSaidaDoPing('ok\n', { ip: '10.0.0.5', codigo: 0 })).toEqual({
      resultado: 'online',
      latencia: null,
    });
  });
});

describe('argumentosDoPing', () => {
  it('um pacote, até 2 segundos de espera, no formato de cada sistema', () => {
    expect(argumentosDoPing('10.0.0.5', 'win32')).toEqual(['-n', '1', '-w', '2000', '10.0.0.5']);
    expect(argumentosDoPing('10.0.0.5', 'linux')).toEqual(['-c', '1', '-W', '2', '10.0.0.5']);
  });
});

describe('executarPing', () => {
  it('roda o ping do sistema e lê a saída, mesmo com o código de saída de erro', async () => {
    const executar = vi.fn(async () => ({ saida: LINUX_SEM_RESPOSTA, codigo: 1 }));
    expect(await executarPing('192.0.2.1', { executar, plataforma: 'linux' })).toEqual({
      resultado: 'offline',
    });
    expect(executar).toHaveBeenCalledWith('ping', ['-c', '1', '-W', '2', '192.0.2.1']);
  });

  it('o ping que não pôde ser executado fica sem dado, nunca offline', async () => {
    const executar = vi.fn(async () => {
      throw Object.assign(new Error('spawn ping ENOENT'), { code: 'ENOENT' });
    });
    expect(await executarPing('10.0.0.5', { executar, plataforma: 'linux' })).toEqual({
      resultado: 'sem-dado',
      motivo: 'spawn ping ENOENT',
    });
  });
});

describe('leiturasDoPing', () => {
  const ativoId = '0199d3a0-0000-7000-8000-0000000000a1';
  const momento = new Date('2026-10-12T12:00:00.000Z');

  it('online vira a disponibilidade e a latência', () => {
    expect(leiturasDoPing(ativoId, { resultado: 'online', latencia: 3 }, momento)).toEqual([
      { ativoId, metrica: 'rede.disponibilidade', momento: momento.toISOString(), valor: 'online' },
      { ativoId, metrica: 'rede.latencia', momento: momento.toISOString(), valor: 3 },
    ]);
  });

  it('online sem a latência manda a latência sem dado', () => {
    expect(leiturasDoPing(ativoId, { resultado: 'online', latencia: null }, momento)).toEqual([
      { ativoId, metrica: 'rede.disponibilidade', momento: momento.toISOString(), valor: 'online' },
      { ativoId, metrica: 'rede.latencia', momento: momento.toISOString(), valor: null },
    ]);
  });

  it('offline e sem dado viram só a disponibilidade, sem a latência', () => {
    expect(leiturasDoPing(ativoId, { resultado: 'offline' }, momento)).toEqual([
      {
        ativoId,
        metrica: 'rede.disponibilidade',
        momento: momento.toISOString(),
        valor: 'offline',
      },
    ]);
    expect(
      leiturasDoPing(ativoId, { resultado: 'sem-dado', motivo: 'spawn ping ENOENT' }, momento),
    ).toEqual([
      { ativoId, metrica: 'rede.disponibilidade', momento: momento.toISOString(), valor: null },
    ]);
  });
});
