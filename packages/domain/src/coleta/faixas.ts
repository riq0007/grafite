// As faixas de rede dos coletores (spec coletor-local; design do P2a, decisões 6 e 7): IPv4 ou IPv6
// com o prefixo, guardadas na forma canônica, com o endereço da rede. Um IP só cai numa faixa da
// mesma versão, e cada ativo fica com o coletor da faixa mais específica que o alcança.
import { gruposDoIpv6, ipv6Canonico, octetos } from '../campos/rede.ts';

const FAIXA_INVALIDA = 'Use uma faixa como 10.0.0.0/24.';

/** Quantas faixas um coletor tem, no máximo. */
export const LIMITE_DE_FAIXAS = 50;

export type LeituraDaFaixa = { ok: true; faixa: string } | { ok: false; erro: string };
export type LeituraDasFaixas = { ok: true; faixas: string[] } | { ok: false; erro: string };

type Versao = 4 | 6;

/** Um IP como número, com a versão. */
interface Endereco {
  versao: Versao;
  bits: bigint;
}

interface Faixa {
  versao: Versao;
  rede: bigint;
  prefixo: number;
}

const TAMANHO: Record<Versao, number> = { 4: 32, 6: 128 };

/** O IP como número, ou `null` quando o texto não é um IP. */
function enderecoDe(texto: string): Endereco | null {
  const limpo = texto.trim().replace(/^\[(.*)\]$/, '$1');
  const ipv4 = octetos(limpo);
  if (ipv4) {
    return { versao: 4, bits: ipv4.reduce((total, octeto) => (total << 8n) | BigInt(octeto), 0n) };
  }
  const grupos = limpo.includes(':') ? gruposDoIpv6(limpo) : null;
  if (!grupos) return null;
  return { versao: 6, bits: grupos.reduce((total, grupo) => (total << 16n) | BigInt(grupo), 0n) };
}

function mascara(versao: Versao, prefixo: number): bigint {
  const tamanho = BigInt(TAMANHO[versao]);
  return prefixo === 0 ? 0n : ((1n << BigInt(prefixo)) - 1n) << (tamanho - BigInt(prefixo));
}

/** O texto canônico de um endereço: os quatro números do IPv4 ou o IPv6 do RFC 5952. */
function textoDe({ versao, bits }: Endereco): string {
  if (versao === 4) {
    return [24n, 16n, 8n, 0n]
      .map((deslocamento) => String((bits >> deslocamento) & 0xffn))
      .join('.');
  }
  const grupos = Array.from({ length: 8 }, (_, i) =>
    Number((bits >> BigInt((7 - i) * 16)) & 0xffffn),
  );
  return ipv6Canonico(grupos);
}

function faixaDe(entrada: unknown): Faixa | null {
  if (typeof entrada !== 'string') return null;
  const partes = /^(.+)\/(\d{1,3})$/.exec(entrada.trim());
  if (!partes) return null;
  const endereco = enderecoDe(partes[1] ?? '');
  const prefixo = Number(partes[2]);
  if (!endereco || prefixo > TAMANHO[endereco.versao]) return null;
  return {
    versao: endereco.versao,
    rede: endereco.bits & mascara(endereco.versao, prefixo),
    prefixo,
  };
}

const alcanca = (endereco: Endereco, faixa: Faixa) =>
  endereco.versao === faixa.versao &&
  (endereco.bits & mascara(faixa.versao, faixa.prefixo)) === faixa.rede;

/** A faixa na forma canônica, com o endereço da rede, como `10.0.0.0/24`. */
export function lerFaixa(entrada: unknown): LeituraDaFaixa {
  const faixa = faixaDe(entrada);
  if (!faixa) return { ok: false, erro: FAIXA_INVALIDA };
  const rede = textoDe({ versao: faixa.versao, bits: faixa.rede });
  return { ok: true, faixa: `${rede}/${faixa.prefixo}` };
}

/** As faixas de um coletor, na ordem em que vieram, sem repetir a mesma rede. */
export function lerFaixas(entrada: unknown): LeituraDasFaixas {
  if (!Array.isArray(entrada)) return { ok: false, erro: FAIXA_INVALIDA };
  const faixas: string[] = [];
  for (const item of entrada) {
    const lida = lerFaixa(item);
    if (!lida.ok) return lida;
    if (!faixas.includes(lida.faixa)) faixas.push(lida.faixa);
  }
  if (faixas.length > LIMITE_DE_FAIXAS) return { ok: false, erro: 'Use até 50 faixas.' };
  return { ok: true, faixas };
}

/** Se o IP está na faixa; o IP ou a faixa inválidos não alcançam nada. */
export function ipNaFaixa(ip: string, faixa: string): boolean {
  const endereco = enderecoDe(ip);
  const lida = faixaDe(faixa);
  return endereco !== null && lida !== null && alcanca(endereco, lida);
}

export interface ColetorComFaixas {
  id: string;
  faixas: readonly string[];
}

/**
 * A escolha do coletor de cada IP, com as faixas lidas uma vez: o da faixa de maior prefixo que
 * alcança o IP e, no empate, o de menor id, o cadastrado primeiro (UUIDv7). `null` quando nenhum
 * alcança.
 */
export function escolhaDeColetor(
  coletores: readonly ColetorComFaixas[],
): (ip: string) => string | null {
  const faixas = coletores.flatMap((coletor) =>
    coletor.faixas.flatMap((texto) => {
      const faixa = faixaDe(texto);
      return faixa ? [{ id: coletor.id, faixa }] : [];
    }),
  );
  return (ip) => {
    const endereco = enderecoDe(ip);
    if (!endereco) return null;
    let melhor: { id: string; prefixo: number } | null = null;
    for (const { id, faixa } of faixas) {
      if (!alcanca(endereco, faixa)) continue;
      if (
        !melhor ||
        faixa.prefixo > melhor.prefixo ||
        (faixa.prefixo === melhor.prefixo && id < melhor.id)
      ) {
        melhor = { id, prefixo: faixa.prefixo };
      }
    }
    return melhor?.id ?? null;
  };
}

export function coletorDoIp(ip: string, coletores: readonly ColetorComFaixas[]): string | null {
  return escolhaDeColetor(coletores)(ip);
}
