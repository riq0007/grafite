import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  cifrarSegredo,
  decifrarSegredo,
  impressaoDaChaveMestra,
  recifrarChave,
  SegredoQueNaoAbre,
} from './cifra.ts';

const mestra = Buffer.alloc(32, 9);
const nova = Buffer.alloc(32, 11);
const chaves = { atual: mestra };
const alvo = {
  orgId: '0199a3f0-0000-7000-8000-00000000000a',
  segredoId: '0199a3f0-0000-7000-8000-000000000001',
};
const outroSegredo = { ...alvo, segredoId: '0199a3f0-0000-7000-8000-000000000002' };
const outraOrganizacao = { ...alvo, orgId: '0199a3f0-0000-7000-8000-00000000000b' };
const FRASE = 'O cofre não abre este segredo: confira a chave mestra na configuração do servidor.';

/** O erro lançado por `fazer`, para conferir a frase e o motivo. */
function erroDe(fazer: () => unknown): SegredoQueNaoAbre {
  try {
    fazer();
  } catch (erro) {
    if (erro instanceof SegredoQueNaoAbre) return erro;
    throw erro;
  }
  throw new Error('não lançou');
}

describe('impressão da chave mestra', () => {
  it('são os 16 primeiros caracteres hexadecimais do SHA-256 da chave', () => {
    const esperada = createHash('sha256').update(mestra).digest('hex').slice(0, 16);
    expect(impressaoDaChaveMestra(mestra)).toBe(esperada);
    expect(impressaoDaChaveMestra(mestra)).toMatch(/^[0-9a-f]{16}$/);
    expect(impressaoDaChaveMestra(nova)).not.toBe(esperada);
  });
});

describe('cifra do segredo', () => {
  it('decifra o valor com a chave mestra, e o cifrado guarda a impressão dela', () => {
    const cifrado = cifrarSegredo({ valor: 'S3nh@ do switch' }, chaves, alvo);
    expect(cifrado.impressaoDaChaveMestra).toBe(impressaoDaChaveMestra(mestra));
    expect(decifrarSegredo(cifrado, chaves, alvo)).toEqual({ valor: 'S3nh@ do switch' });
  });

  it('guarda os outros campos secretos no mesmo conteúdo', () => {
    const conteudo = { valor: 'autenticacao', usuario: 'grafite', privacidade: 'outra senha' };
    expect(decifrarSegredo(cifrarSegredo(conteudo, chaves, alvo), chaves, alvo)).toEqual(conteudo);
  });

  it('o valor e a chave do segredo não ficam legíveis no cifrado', () => {
    const cifrado = cifrarSegredo({ valor: 'S3nh@ do switch' }, chaves, alvo);
    expect(cifrado.conteudoCifrado.includes('S3nh@ do switch')).toBe(false);
    expect(cifrado.chaveCifrada.length).toBe(1 + 12 + 16 + 32);
  });

  it('cada cifra usa uma chave nova do segredo', () => {
    const primeira = cifrarSegredo({ valor: 'mesmo valor' }, chaves, alvo);
    const segunda = cifrarSegredo({ valor: 'mesmo valor' }, chaves, alvo);
    expect(primeira.chaveCifrada).not.toEqual(segunda.chaveCifrada);
    expect(primeira.conteudoCifrado).not.toEqual(segunda.conteudoCifrado);
    // A chave de um não abre o conteúdo do outro.
    expect(
      erroDe(() =>
        decifrarSegredo({ ...primeira, conteudoCifrado: segunda.conteudoCifrado }, chaves, alvo),
      ).motivo,
    ).toBe('cifra');
  });

  it('o valor copiado para outro segredo ou para outra organização não decifra', () => {
    const cifrado = cifrarSegredo({ valor: 'S3nh@ do switch' }, chaves, alvo);
    for (const outro of [outroSegredo, outraOrganizacao]) {
      const erro = erroDe(() => decifrarSegredo(cifrado, chaves, outro));
      expect(erro.message).toBe(FRASE);
      expect(erro.motivo).toBe('cifra');
    }
  });

  it('o conteúdo adulterado não decifra', () => {
    const cifrado = cifrarSegredo({ valor: 'S3nh@ do switch' }, chaves, alvo);
    const adulterado = Buffer.from(cifrado.conteudoCifrado);
    adulterado[adulterado.length - 1] = (adulterado[adulterado.length - 1] ?? 0) ^ 1;
    expect(
      erroDe(() => decifrarSegredo({ ...cifrado, conteudoCifrado: adulterado }, chaves, alvo))
        .motivo,
    ).toBe('cifra');
  });

  it('sem a chave mestra da impressão, recusa com a frase, sem o valor nem as chaves', () => {
    const cifrado = cifrarSegredo({ valor: 'S3nh@ do switch' }, chaves, alvo);
    const erro = erroDe(() => decifrarSegredo(cifrado, { atual: nova }, alvo));
    expect(erro.motivo).toBe('impressao');
    expect(erro.message).toBe(FRASE);
    expect(JSON.stringify(erro)).not.toContain(mestra.toString('base64'));
    expect(erro.cause).toBeUndefined();
  });

  it('a impressão certa com a chave errada recusa pela cifra', () => {
    const cifrado = cifrarSegredo({ valor: 'S3nh@ do switch' }, chaves, alvo);
    const falsa = { ...cifrado, impressaoDaChaveMestra: impressaoDaChaveMestra(nova) };
    const erro = erroDe(() => decifrarSegredo(falsa, { atual: nova }, alvo));
    expect(erro.motivo).toBe('cifra');
    expect(erro.cause).toBeUndefined();
  });
});

describe('troca da chave mestra', () => {
  it('durante a troca, decifra com a anterior o que ela cifrou e cifra só com a nova', () => {
    const antigo = cifrarSegredo({ valor: 'S3nh@ do switch' }, chaves, alvo);
    const naTroca = { atual: nova, anterior: mestra };
    expect(decifrarSegredo(antigo, naTroca, alvo)).toEqual({ valor: 'S3nh@ do switch' });
    const novo = cifrarSegredo({ valor: 'outro' }, naTroca, alvo);
    expect(novo.impressaoDaChaveMestra).toBe(impressaoDaChaveMestra(nova));
    expect(decifrarSegredo(novo, { atual: nova }, alvo)).toEqual({ valor: 'outro' });
  });

  it('recifra só a chave do segredo, e o mesmo conteúdo decifra com a nova', () => {
    const antigo = cifrarSegredo({ valor: 'S3nh@ do switch' }, chaves, alvo);
    const recifrada = recifrarChave(antigo, { atual: nova, anterior: mestra }, alvo);
    expect(recifrada.impressaoDaChaveMestra).toBe(impressaoDaChaveMestra(nova));
    expect(recifrada.chaveCifrada).not.toEqual(antigo.chaveCifrada);
    expect(
      decifrarSegredo(
        { conteudoCifrado: antigo.conteudoCifrado, ...recifrada },
        { atual: nova },
        alvo,
      ),
    ).toEqual({ valor: 'S3nh@ do switch' });
  });

  it('não recifra a chave que nenhuma das duas abre', () => {
    const deOutraChave = cifrarSegredo({ valor: 'S3nh@' }, { atual: randomBytes(32) }, alvo);
    expect(
      erroDe(() => recifrarChave(deOutraChave, { atual: nova, anterior: mestra }, alvo)).motivo,
    ).toBe('impressao');
  });
});
