// Os campos de rede (spec campos-personalizados): o IP, o MAC e a URL, guardados numa forma única,
// para dois cadastros do mesmo endereço serem iguais.
import { aceito, type Leitura, recusado, vazio } from './tipos.ts';

const IP_INVALIDO = 'Use um IP, como 192.168.0.10.';
const MAC_INVALIDO = 'Use um MAC, como AA:BB:CC:DD:EE:FF.';
const URL_INVALIDA = 'Use um endereço que comece com http:// ou https://.';

export function octetos(texto: string): number[] | null {
  const partes = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(texto);
  if (!partes) return null;
  const numeros = partes.slice(1).map(Number);
  return numeros.every((numero) => numero <= 255) ? numeros : null;
}

/** Os oito grupos de um IPv6, com os zeros do "::" e o IPv4 do fim convertido em dois grupos. */
export function gruposDoIpv6(texto: string): number[] | null {
  let resto = texto.toLowerCase();
  const comIpv4 = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(resto);
  if (comIpv4) {
    const ipv4 = octetos(comIpv4[2] ?? '');
    if (!ipv4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = ipv4;
    resto = `${comIpv4[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const metades = resto.split('::');
  if (metades.length > 2) return null;
  const separar = (parte: string | undefined) => (parte ? parte.split(':') : []);
  const inicio = separar(metades[0]);
  const fim = separar(metades[1]);
  const lidos = [...inicio, ...fim];
  if (!lidos.every((grupo) => /^[0-9a-f]{1,4}$/.test(grupo))) return null;
  const faltam = 8 - lidos.length;
  if (metades.length === 1 ? faltam !== 0 : faltam < 1) return null;
  return [
    ...inicio.map((grupo) => Number.parseInt(grupo, 16)),
    ...Array.from({ length: metades.length === 2 ? faltam : 0 }, () => 0),
    ...fim.map((grupo) => Number.parseInt(grupo, 16)),
  ];
}

/** A forma canônica do RFC 5952: minúsculas, sem zeros à esquerda e o maior trecho de zeros em "::". */
export function ipv6Canonico(grupos: number[]): string {
  if (grupos.slice(0, 5).every((grupo) => grupo === 0) && grupos[5] === 0xffff) {
    const [c = 0, d = 0] = grupos.slice(6);
    return `::ffff:${c >> 8}.${c & 0xff}.${d >> 8}.${d & 0xff}`;
  }
  let melhor = { inicio: -1, tamanho: 1 };
  for (let i = 0; i < 8; i++) {
    let tamanho = 0;
    while (i + tamanho < 8 && grupos[i + tamanho] === 0) tamanho++;
    if (tamanho > melhor.tamanho) melhor = { inicio: i, tamanho };
  }
  const texto = grupos.map((grupo) => grupo.toString(16));
  if (melhor.inicio < 0) return texto.join(':');
  const antes = texto.slice(0, melhor.inicio).join(':');
  const depois = texto.slice(melhor.inicio + melhor.tamanho).join(':');
  return `${antes}::${depois}`;
}

export function lerIp(entrada: unknown): Leitura<string> {
  if (vazio(entrada)) return aceito(null);
  if (typeof entrada !== 'string') return recusado(IP_INVALIDO);
  const texto = entrada.trim().replace(/^\[(.*)\]$/, '$1');
  const ipv4 = octetos(texto);
  if (ipv4) return aceito(ipv4.join('.'));
  const grupos = texto.includes(':') ? gruposDoIpv6(texto) : null;
  return grupos ? aceito(ipv6Canonico(grupos)) : recusado(IP_INVALIDO);
}

const FORMAS_DO_MAC = [
  /^[0-9a-f]{12}$/i,
  /^[0-9a-f]{2}([:-])[0-9a-f]{2}(?:\1[0-9a-f]{2}){4}$/i,
  /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i,
];

export function lerMac(entrada: unknown): Leitura<string> {
  if (vazio(entrada)) return aceito(null);
  if (typeof entrada !== 'string') return recusado(MAC_INVALIDO);
  const texto = entrada.trim();
  if (!FORMAS_DO_MAC.some((forma) => forma.test(texto))) return recusado(MAC_INVALIDO);
  const algarismos = texto.replace(/[:.-]/g, '').toUpperCase();
  return aceito(algarismos.match(/.{2}/g)?.join(':') ?? algarismos);
}

export function lerUrl(entrada: unknown): Leitura<string> {
  if (vazio(entrada)) return aceito(null);
  if (typeof entrada !== 'string') return recusado(URL_INVALIDA);
  const texto = entrada.trim();
  if ([...texto].length > 2000) return recusado('Use até 2.000 caracteres.');
  try {
    const url = new URL(texto);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
      return recusado(URL_INVALIDA);
    }
    return aceito(url.href);
  } catch {
    return recusado(URL_INVALIDA);
  }
}
