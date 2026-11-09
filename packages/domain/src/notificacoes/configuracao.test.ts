// O formato da configuração dos canais de fora (spec plataforma-base, "Configuração validada na
// partida", e operacao-servicos, "E-mail configurado pelo comando de operação"; change
// p3c-email-e-push, design, decisão 10): a API e o comando de operação conferem com as mesmas
// regras.
import { describe, expect, it } from 'vitest';
import {
  conferirChavePrivadaDoPush,
  conferirChavePublicaDoPush,
  conferirContatoDoPush,
  conferirEnderecoDoSmtp,
  conferirRemetente,
  lerRemetente,
} from './configuracao.ts';

// Um par de exemplo da curva P-256, só para o formato.
const PUBLICA =
  'BMI7fnRYqz6Qk6q3RkL0xGJkV5nhb0rC1NPcWZLzPxM2YbVgqq3bqyhJ2lN0b3m7cn6nY6v9w5V7sQ4ZbYm6Xo4';
const PRIVADA = 'q3ZsJmZ0mGkZbYqZ0b8wO9n5pC1kLrW2xY3zA4bC5dE';

describe('endereço do SMTP', () => {
  it('aceita smtp:// e smtps://, com o servidor, a porta, o usuário e a senha', () => {
    expect(conferirEnderecoDoSmtp('smtp://smtp.empresa.com.br:587')).toBeNull();
    expect(conferirEnderecoDoSmtp('smtps://grafite:S3nh%40@smtp.empresa.com.br:465')).toBeNull();
    expect(conferirEnderecoDoSmtp('smtp://127.0.0.1:1025')).toBeNull();
  });

  it('recusa outro protocolo, o endereço sem servidor e o que não é um endereço', () => {
    const motivo =
      'deve começar com smtp:// ou smtps://, como smtp://usuario:senha@smtp.empresa.com.br:587';
    expect(conferirEnderecoDoSmtp('http://smtp.empresa.com.br')).toBe(motivo);
    expect(conferirEnderecoDoSmtp('smtp.empresa.com.br:587')).toBe(motivo);
    expect(conferirEnderecoDoSmtp('smtp://')).toBe(motivo);
    expect(conferirEnderecoDoSmtp('smtp://smtp.empresa.com.br/caminho')).toBe(
      'não deve ter caminho depois do servidor',
    );
  });
});

describe('remetente', () => {
  it('lê o nome e o e-mail', () => {
    expect(lerRemetente('Grafite <grafite@empresa.com.br>')).toEqual({
      nome: 'Grafite',
      email: 'grafite@empresa.com.br',
    });
    expect(lerRemetente('  TI da Empresa   < ti@empresa.com.br > ')).toEqual({
      nome: 'TI da Empresa',
      email: 'ti@empresa.com.br',
    });
    expect(conferirRemetente('Grafite <grafite@empresa.com.br>')).toBeNull();
  });

  it('recusa o remetente sem o nome ou sem o e-mail', () => {
    const motivo = 'deve ter o nome e o e-mail, como Grafite <grafite@empresa.com.br>';
    expect(conferirRemetente('Grafite')).toBe(motivo);
    expect(conferirRemetente('grafite@empresa.com.br')).toBe(motivo);
    expect(conferirRemetente('<grafite@empresa.com.br>')).toBe(motivo);
    expect(conferirRemetente('Grafite <grafite>')).toBe(motivo);
    expect(lerRemetente('Grafite')).toBeNull();
  });
});

describe('chaves do push', () => {
  it('aceita a pública de 65 bytes, começando no ponto não comprimido, e a privada de 32', () => {
    expect(conferirChavePublicaDoPush(PUBLICA)).toBeNull();
    expect(conferirChavePrivadaDoPush(PRIVADA)).toBeNull();
  });

  it('recusa o tamanho errado, o base64 comum e o ponto comprimido', () => {
    expect(conferirChavePublicaDoPush(PUBLICA.slice(1))).toBe(
      'deve ter 65 bytes em base64url, como a chave pública de um par da curva P-256',
    );
    expect(conferirChavePublicaDoPush(`A${PUBLICA.slice(1)}`)).toBe(
      'deve ter 65 bytes em base64url, como a chave pública de um par da curva P-256',
    );
    expect(conferirChavePrivadaDoPush(`${PRIVADA.slice(0, 42)}+`)).toBe(
      'deve ter 32 bytes em base64url, como a chave privada de um par da curva P-256',
    );
  });

  it('aceita o contato mailto: ou https://, e recusa o resto', () => {
    expect(conferirContatoDoPush('mailto:ti@empresa.com.br')).toBeNull();
    expect(conferirContatoDoPush('https://grafite.empresa.com.br')).toBeNull();
    const motivo = 'deve começar com mailto: ou https://, como mailto:ti@empresa.com.br';
    expect(conferirContatoDoPush('ti@empresa.com.br')).toBe(motivo);
    expect(conferirContatoDoPush('http://grafite.empresa.com.br')).toBe(motivo);
    expect(conferirContatoDoPush('mailto:')).toBe(motivo);
  });
});
