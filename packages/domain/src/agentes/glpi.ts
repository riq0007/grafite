// O inventário do agente do GLPI (spec inventario-pelo-agente; change inventario-pelo-agente-glpi,
// design, decisão 3): a leitura do `content` do INVENTORY, tolerante às seções ausentes; os valores
// dos campos do inventário de hardware; o nome da máquina pelo deviceid; e a situação do agente pela
// idade do último inventário.

export interface SoftwareDoInventario {
  nome: string;
  versao: string | null;
  editor: string | null;
  /** AAAA-MM-DD, quando o agente manda nesse formato. */
  instaladoEm: string | null;
}

export interface InventarioDoAgente {
  nome: string | null;
  serie: string | null;
  fabricante: string | null;
  modelo: string | null;
  sistema: string | null;
  versaoDoAgente: string | null;
  /** Os valores dos campos do inventário de hardware, pela chave do campo. */
  valores: Record<string, string | number>;
  /** Os IPv4 das placas de rede, sem o loopback. */
  ips: string[];
  /** Os softwares, sem repetir o nome com a versão, em ordem de nome; `null` sem a seção. */
  softwares: SoftwareDoInventario[] | null;
}

type Objeto = Record<string, unknown>;

const objeto = (valor: unknown): Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Objeto) : {};
const lista = (valor: unknown): Objeto[] => (Array.isArray(valor) ? valor.map(objeto) : []);

/** O texto sem os espaços repetidos e das pontas, ou `null` vazio. */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const limpo = String(valor).replace(/\s+/g, ' ').trim();
  return limpo === '' ? null : limpo;
}

const numero = (valor: unknown): number | null => {
  const lido = typeof valor === 'number' ? valor : Number(texto(valor));
  return Number.isFinite(lido) && lido > 0 ? lido : null;
};

/** O tamanho em MB como o disco é chamado: em GB, ou em TB acima de 1.000 GB. */
function tamanho(megabytes: number): string {
  const gigabytes = megabytes / 1024;
  if (gigabytes >= 1000) return `${(gigabytes / 1024).toFixed(1).replace('.', ',')} TB`;
  return `${Math.round(gigabytes)} GB`;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function valoresDoInventario(conteudo: Objeto): Record<string, string | number> {
  const valores: Record<string, string | number> = {};
  const hardware = objeto(conteudo.hardware);
  const uuid = texto(hardware.uuid);
  if (uuid && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(uuid))
    valores['hardware.uuid'] = uuid;
  const usuario = texto(hardware.lastloggeduser) ?? texto(lista(conteudo.users)[0]?.login);
  if (usuario) valores['software.usuario'] = usuario;
  const cpus = lista(conteudo.cpus);
  const processador = texto(cpus[0]?.name);
  if (processador) {
    valores['hardware.processador'] =
      cpus.length > 1 ? `${processador} (${cpus.length}x)` : processador;
  }
  const memoriaTotal =
    numero(objeto(conteudo.hardware).memory) ??
    lista(conteudo.memories).reduce((soma, pente) => soma + (numero(pente.capacity) ?? 0), 0);
  const memoria = Math.round(memoriaTotal / 1024);
  if (memoria > 0) valores['hardware.memoria'] = memoria;
  const discos = lista(conteudo.storages)
    .filter((disco) => texto(disco.type)?.toLowerCase() !== 'removable')
    .flatMap((disco) => {
      const nome = texto(disco.model) ?? texto(disco.name);
      const megabytes = numero(disco.disksize);
      if (!nome) return [];
      return [megabytes ? `${nome} (${tamanho(megabytes)})` : nome];
    });
  if (discos.length > 0) valores['hardware.discos'] = discos.join('\n');
  const sistema = objeto(conteudo.operatingsystem);
  const inicializacao = texto(sistema.boot_time);
  if (inicializacao) valores['software.ultima-inicializacao'] = inicializacao;
  const nomeDoSistema = texto(sistema.full_name) ?? texto(sistema.name);
  if (nomeDoSistema) valores['software.sistema'] = nomeDoSistema;
  const versao = texto(sistema.version);
  const kernel = texto(sistema.kernel_version);
  const versaoDoSistema = [versao, kernel && (versao ? `(${kernel})` : kernel)]
    .filter(Boolean)
    .join(' ');
  if (versaoDoSistema) valores['software.versao-do-sistema'] = versaoDoSistema;
  const licencas = lista(conteudo.licenseinfos);
  const chaveDa = (padrao: RegExp) =>
    texto(
      licencas.find((licenca) =>
        padrao.test(`${texto(licenca.fullname) ?? ''} ${texto(licenca.name) ?? ''}`),
      )?.key,
    );
  const windows = chaveDa(/windows/i);
  if (windows) valores['software.licenca-do-windows'] = windows;
  const office = chaveDa(/office/i);
  if (office) valores['software.licenca-do-office'] = office;
  const [antivirus] = lista(conteudo.antivirus);
  const nomeDoAntivirus = texto(antivirus?.name);
  if (antivirus && nomeDoAntivirus) {
    const detalhes = [
      typeof antivirus.enabled === 'boolean' ? (antivirus.enabled ? 'ativo' : 'desligado') : null,
      typeof antivirus.uptodate === 'boolean'
        ? antivirus.uptodate
          ? 'atualizado'
          : 'desatualizado'
        : null,
    ].filter(Boolean);
    valores['software.antivirus'] =
      detalhes.length > 0 ? `${nomeDoAntivirus} (${detalhes.join(', ')})` : nomeDoAntivirus;
  }
  return valores;
}

/** Endereços que identificam a máquina na rede, sem loopback, APIPA, zero ou multicast. */
function ipv4Utilizavel(valor: unknown): string | null {
  const ip = texto(valor);
  if (!ip || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return null;
  const partes = ip.split('.').map(Number);
  const primeiro = partes[0] ?? 0;
  if (partes.some((parte) => parte > 255) || primeiro === 0 || primeiro === 127 || primeiro >= 224)
    return null;
  if (primeiro === 169 && partes[1] === 254) return null;
  return partes.join('.');
}

function redeDoInventario(conteudo: Objeto) {
  const redes = lista(conteudo.networks).sort(
    (a, b) =>
      Number(texto(b.status)?.toLowerCase() === 'up') -
      Number(texto(a.status)?.toLowerCase() === 'up'),
  );
  const principal = (texto(objeto(conteudo.hardware).ipaddr) ?? '')
    .split(/[/,\s]+/)
    .map(ipv4Utilizavel)
    .find((ip) => ip !== null);
  const ips = [
    ...new Set(
      [principal, ...redes.map((rede) => ipv4Utilizavel(rede.ipaddress))].filter(
        (ip): ip is string => ip != null,
      ),
    ),
  ];
  const interfacePrincipal = ips[0]
    ? redes.find((rede) => ipv4Utilizavel(rede.ipaddress) === ips[0])
    : undefined;
  const mac = texto(interfacePrincipal?.macaddr)?.replaceAll('-', ':').toUpperCase();
  return { ips, mac: mac && /^(?:[\dA-F]{2}:){5}[\dA-F]{2}$/.test(mac) ? mac : null };
}

function softwaresDoInventario(conteudo: Objeto): SoftwareDoInventario[] | null {
  if (!Array.isArray(conteudo.softwares)) return null;
  const vistos = new Map<string, SoftwareDoInventario>();
  for (const software of lista(conteudo.softwares)) {
    const nome = texto(software.name);
    if (!nome) continue;
    const versao = texto(software.version);
    const data = texto(software.install_date);
    const chave = `${nome.toLowerCase()}\u0001${versao ?? ''}`;
    if (vistos.has(chave)) continue;
    vistos.set(chave, {
      nome,
      versao,
      editor: texto(software.publisher),
      instaladoEm: data && DATA.test(data) ? data : null,
    });
  }
  return [...vistos.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
  );
}

/** Lê o `content` do INVENTORY do agente; o que falta fica `null` ou fora dos valores. */
export function lerInventarioDoGlpi(conteudo: unknown): InventarioDoAgente {
  const tudo = objeto(conteudo);
  const hardware = objeto(tudo.hardware);
  const bios = objeto(tudo.bios);
  const sistema = objeto(tudo.operatingsystem);
  const { ips, mac } = redeDoInventario(tudo);
  const valores = valoresDoInventario(tudo);
  if (ips[0]) valores['hardware.ip'] = ips[0];
  if (mac) valores['hardware.mac'] = mac;
  return {
    nome: texto(hardware.name),
    serie: texto(bios.ssn),
    fabricante: texto(bios.smanufacturer),
    modelo: texto(bios.smodel),
    sistema: texto(sistema.full_name) ?? texto(sistema.name),
    versaoDoAgente: texto(tudo.versionclient),
    valores,
    ips,
    softwares: softwaresDoInventario(tudo),
  };
}

/** O nome da máquina pelo deviceid do agente, que termina com a data e a hora da instalação. */
export function nomeDoDeviceid(deviceid: string): string {
  return deviceid.replace(/-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/, '');
}

/** A série ou o hostname para comparar: sem a caixa e sem os espaços, ou `null` vazio. */
export function identificadorComparavel(valor: string | null | undefined): string | null {
  const limpo = (valor ?? '').replace(/\s+/g, '').toLowerCase();
  return limpo === '' ? null : limpo;
}

const DIA = 24 * 60 * 60 * 1000;

/** A situação do agente: em dia com o inventário das últimas 48 horas. */
export function situacaoDoAgente({
  ultimoInventario,
  agora,
}: {
  ultimoInventario: Date | null;
  agora: Date;
}): { tipo: 'sucesso' | 'atencao' | 'neutra'; texto: string } {
  if (!ultimoInventario) return { tipo: 'neutra', texto: 'Sem inventário' };
  const idade = agora.getTime() - ultimoInventario.getTime();
  if (idade <= 2 * DIA) return { tipo: 'sucesso', texto: 'Em dia' };
  const dias = Math.floor(idade / DIA);
  return { tipo: 'atencao', texto: `Parado há ${dias} dias` };
}
