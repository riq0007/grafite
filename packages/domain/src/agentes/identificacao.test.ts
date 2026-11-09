import { describe, expect, it } from 'vitest';
import { capacidadeDa } from '../ativos/catalogo.ts';
import { lerInventarioDoGlpi } from './glpi.ts';

describe('a identificação e a rede do inventário', () => {
  it('usa o IP principal e o MAC da mesma interface, com UUID, usuário e inicialização', () => {
    const inventario = lerInventarioDoGlpi({
      hardware: {
        name: 'ESTACAO-01',
        ipaddr: '10.0.8.43',
        uuid: '3F2504E0-4F89-11D3-9A0C-0305E82C3301',
        lastloggeduser: 'ana.souza',
      },
      operatingsystem: { boot_time: '2026-11-03 08:00:00' },
      networks: [
        { ipaddress: '10.0.0.2', macaddr: '00:11:22:33:44:55' },
        { ipaddress: '10.0.8.43', macaddr: 'aa-bb-cc-dd-ee-ff' },
      ],
    });
    expect(inventario.ips).toEqual(['10.0.8.43', '10.0.0.2']);
    expect(inventario.valores).toMatchObject({
      'hardware.ip': '10.0.8.43',
      'hardware.mac': 'AA:BB:CC:DD:EE:FF',
      'hardware.uuid': '3F2504E0-4F89-11D3-9A0C-0305E82C3301',
      'software.usuario': 'ana.souza',
      'software.ultima-inicializacao': '2026-11-03 08:00:00',
    });
  });

  it('descarta IP inválido, loopback, zero, APIPA e multicast, e prefere interfaces ativas', () => {
    const inventario = lerInventarioDoGlpi({
      hardware: { ipaddr: '999.1.2.3' },
      networks: [
        { ipaddress: '0.0.0.0' },
        { ipaddress: '127.0.0.1' },
        { ipaddress: '169.254.8.2' },
        { ipaddress: '224.0.0.1' },
        { ipaddress: '999.1.2.3' },
        { ipaddress: 'fe80::1' },
        { ipaddress: '192.168.9.2', status: 'Down' },
        { ipaddress: '10.0.8.43', status: 'Up', macaddr: '00:11:22:33:44:55' },
        { ipaddress: '10.0.8.43' },
      ],
    });
    expect(inventario.ips).toEqual(['10.0.8.43', '192.168.9.2']);
    expect(inventario.valores['hardware.ip']).toBe('10.0.8.43');
  });

  it('tolera dados ausentes e usuário na seção users, sem aproveitar o MAC de outra interface', () => {
    const inventario = lerInventarioDoGlpi({
      hardware: { ipaddr: '10.0.8.43', uuid: 'inválido' },
      users: [{ login: 'ana', domain: 'EMPRESA' }],
      networks: [{ ipaddress: '10.0.0.1', macaddr: '00:11:22:33:44:55' }],
    });
    expect(inventario.valores['software.usuario']).toBe('ana');
    expect(inventario.valores).not.toHaveProperty('hardware.mac');
    expect(inventario.valores).not.toHaveProperty('hardware.uuid');
    expect(lerInventarioDoGlpi(null).valores).toEqual({});
  });

  it('expõe os dados como campos automáticos de hardware, para a ficha e as travas', () => {
    const campos = capacidadeDa('hardware.inventario')?.campos ?? [];
    for (const [chave, tipo] of [
      ['hardware.ip', 'ip'],
      ['hardware.mac', 'mac'],
      ['hardware.uuid', 'texto'],
      ['software.usuario', 'texto'],
      ['software.ultima-inicializacao', 'texto'],
    ]) {
      expect(campos).toContainEqual(
        expect.objectContaining({ chave, tipo, escrita: 'automatica' }),
      );
    }
  });
});
