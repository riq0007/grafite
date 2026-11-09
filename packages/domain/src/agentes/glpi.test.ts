import { describe, expect, it } from 'vitest';
import { ORIGENS_DO_VALOR, ROTULOS_DAS_ORIGENS } from '../ativos/estado-do-campo.ts';
import {
  identificadorComparavel,
  lerInventarioDoGlpi,
  nomeDoDeviceid,
  situacaoDoAgente,
} from './glpi.ts';

/** Um inventário do agente do GLPI 1.x, como ele manda no `content`. */
const INVENTARIO = {
  hardware: { name: 'RECEPCAO-01', memory: 16_249, uuid: 'abc' },
  bios: { ssn: ' BRJ1234567 ', smanufacturer: 'Dell Inc.', smodel: 'OptiPlex 7070' },
  cpus: [{ name: 'Intel(R) Core(TM)  i5-9500 CPU @ 3.00GHz', core: 6 }],
  memories: [{ capacity: 8192 }, { capacity: 8192 }],
  storages: [
    { name: 'Disco 0', model: 'Samsung SSD 860 EVO', disksize: 476_940, type: 'disk' },
    { name: 'Pendrive', model: 'SanDisk Cruzer', disksize: 15_000, type: 'removable' },
  ],
  operatingsystem: {
    name: 'Windows',
    full_name: 'Microsoft Windows 10 Pro',
    version: '22H2',
    kernel_version: '10.0.19045',
  },
  licenseinfos: [
    {
      name: 'Windows',
      fullname: 'Microsoft Windows 10 Pro',
      key: 'VK7JG-NPHTM-C97JM-9MPGT-3V66T', // gitleaks:allow: chave genérica pública da Microsoft
    },
    {
      name: 'Office',
      fullname: 'Microsoft Office Professional Plus 2019',
      key: 'NMMKJ-6RK4F-KMJVX-8D9MJ-6MWKP', // gitleaks:allow: chave genérica pública da Microsoft
    },
  ],
  antivirus: [{ name: 'Windows Defender', enabled: true, uptodate: false }],
  networks: [
    { description: 'Ethernet', ipaddress: '10.0.5.21', macaddr: '00:11:22:33:44:55' },
    { description: 'Loopback', ipaddress: '127.0.0.1' },
    { description: 'Wi-Fi', ipaddress: '10.0.9.4' },
  ],
  softwares: [
    {
      name: 'Microsoft Office Professional Plus 2019',
      version: '16.0.10827',
      publisher: 'Microsoft Corporation',
      install_date: '2024-03-02',
    },
    { name: '7-Zip 23.01 (x64)', version: '23.01', publisher: 'Igor Pavlov' },
    { name: '7-Zip 23.01 (x64)', version: '23.01', publisher: 'Igor Pavlov' },
    { name: '  ', version: '1.0' },
  ],
  versionclient: 'GLPI-Agent_v1.7.3',
};

describe('a leitura do inventário do agente do GLPI', () => {
  it('lê a máquina, os valores do inventário de hardware, os IPs e os softwares', () => {
    const lido = lerInventarioDoGlpi(INVENTARIO);
    expect(lido).toMatchObject({
      nome: 'RECEPCAO-01',
      serie: 'BRJ1234567',
      fabricante: 'Dell Inc.',
      modelo: 'OptiPlex 7070',
      sistema: 'Microsoft Windows 10 Pro',
      versaoDoAgente: 'GLPI-Agent_v1.7.3',
      ips: ['10.0.5.21', '10.0.9.4'],
    });
    expect(lido.valores).toEqual({
      'hardware.ip': '10.0.5.21',
      'hardware.mac': '00:11:22:33:44:55',
      'hardware.processador': 'Intel(R) Core(TM) i5-9500 CPU @ 3.00GHz',
      'hardware.memoria': 16,
      'hardware.discos': 'Samsung SSD 860 EVO (466 GB)',
      'software.sistema': 'Microsoft Windows 10 Pro',
      'software.versao-do-sistema': '22H2 (10.0.19045)',
      'software.licenca-do-windows': 'VK7JG-NPHTM-C97JM-9MPGT-3V66T',
      'software.licenca-do-office': 'NMMKJ-6RK4F-KMJVX-8D9MJ-6MWKP',
      'software.antivirus': 'Windows Defender (ativo, desatualizado)',
    });
    expect(lido.softwares).toEqual([
      { nome: '7-Zip 23.01 (x64)', versao: '23.01', editor: 'Igor Pavlov', instaladoEm: null },
      {
        nome: 'Microsoft Office Professional Plus 2019',
        versao: '16.0.10827',
        editor: 'Microsoft Corporation',
        instaladoEm: '2024-03-02',
      },
    ]);
  });

  it('tolera as seções que faltam: sem softwares, a lista é null, e sem a memória total, soma os pentes', () => {
    const lido = lerInventarioDoGlpi({
      hardware: { name: 'SEM-DADOS' },
      memories: [{ capacity: 4096 }, { capacity: 4096 }],
      cpus: [{ name: 'AMD Ryzen 5' }, { name: 'AMD Ryzen 5' }],
    });
    expect(lido.softwares).toBeNull();
    expect(lido.serie).toBeNull();
    expect(lido.valores).toEqual({
      'hardware.processador': 'AMD Ryzen 5 (2x)',
      'hardware.memoria': 8,
    });
    expect(lerInventarioDoGlpi(null)).toMatchObject({ nome: null, valores: {}, softwares: null });
  });

  it('a data de instalação fora do formato fica sem data', () => {
    const lido = lerInventarioDoGlpi({
      softwares: [{ name: 'Velho', install_date: '02/03/2024' }],
    });
    expect(lido.softwares).toEqual([
      { nome: 'Velho', versao: null, editor: null, instaladoEm: null },
    ]);
  });
});

describe('o agente', () => {
  it('o nome da máquina vem do deviceid, sem a data do fim', () => {
    expect(nomeDoDeviceid('RECEPCAO-01-2024-03-02-10-15-00')).toBe('RECEPCAO-01');
    expect(nomeDoDeviceid('maquina')).toBe('maquina');
  });

  it('compara a série e o hostname sem a caixa e sem os espaços', () => {
    expect(identificadorComparavel(' BRJ 123 4567 ')).toBe('brj1234567');
    expect(identificadorComparavel('   ')).toBeNull();
    expect(identificadorComparavel(null)).toBeNull();
  });

  it('a situação vem pela idade do último inventário', () => {
    const agora = new Date('2026-10-28T12:00:00Z');
    expect(situacaoDoAgente({ ultimoInventario: null, agora })).toEqual({
      tipo: 'neutra',
      texto: 'Sem inventário',
    });
    expect(situacaoDoAgente({ ultimoInventario: new Date('2026-10-27T13:00:00Z'), agora })).toEqual(
      { tipo: 'sucesso', texto: 'Em dia' },
    );
    expect(situacaoDoAgente({ ultimoInventario: new Date('2026-10-23T12:00:00Z'), agora })).toEqual(
      { tipo: 'atencao', texto: 'Parado há 5 dias' },
    );
  });

  it('a origem nova do valor é a do agente do GLPI', () => {
    expect(ORIGENS_DO_VALOR).toContain('agente');
    expect(ROTULOS_DAS_ORIGENS.agente).toBe('Agente do GLPI');
  });
});
