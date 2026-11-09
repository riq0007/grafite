// O formato da configuração dos canais de fora (spec plataforma-base, "Configuração validada na
// partida", e operacao-servicos, "E-mail configurado pelo comando de operação"; change
// p3c-email-e-push, design, decisão 10): o endereço do SMTP, o remetente, as chaves do push e o
// contato do servidor. Cada conferência devolve `null`, ou o motivo, sem repetir o valor dado: o
// endereço do SMTP leva a senha. O par das chaves, que pede a conta da curva, a API confere.

const MOTIVO_DO_SMTP =
  'deve começar com smtp:// ou smtps://, como smtp://usuario:senha@smtp.empresa.com.br:587';
const MOTIVO_DO_REMETENTE = 'deve ter o nome e o e-mail, como Grafite <grafite@empresa.com.br>';
const MOTIVO_DA_PUBLICA =
  'deve ter 65 bytes em base64url, como a chave pública de um par da curva P-256';
const MOTIVO_DA_PRIVADA =
  'deve ter 32 bytes em base64url, como a chave privada de um par da curva P-256';
const MOTIVO_DO_CONTATO = 'deve começar com mailto: ou https://, como mailto:ti@empresa.com.br';

const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const REMETENTE = /^\s*([^<>]*?)\s*<\s*([^<>]*?)\s*>\s*$/;
/** O ponto não comprimido (0x04) e as duas coordenadas: 65 bytes, 87 caracteres em base64url. */
const CHAVE_PUBLICA = /^B[A-Za-z0-9_-]{86}$/;
/** 32 bytes: 43 caracteres em base64url, sem preenchimento. */
const CHAVE_PRIVADA = /^[A-Za-z0-9_-]{43}$/;

/** O endereço do SMTP, com o servidor e, se houver, a porta, o usuário e a senha. */
export function conferirEnderecoDoSmtp(valor: string): string | null {
  let endereco: URL;
  try {
    endereco = new URL(valor);
  } catch {
    return MOTIVO_DO_SMTP;
  }
  if (!['smtp:', 'smtps:'].includes(endereco.protocol) || endereco.hostname === '') {
    return MOTIVO_DO_SMTP;
  }
  if (endereco.pathname !== '' && endereco.pathname !== '/') {
    return 'não deve ter caminho depois do servidor';
  }
  return null;
}

/** O nome e o e-mail do remetente, como `Grafite <grafite@empresa.com.br>`; `null` fora disso. */
export function lerRemetente(valor: string): { nome: string; email: string } | null {
  const [, nome = '', email = ''] = REMETENTE.exec(valor) ?? [];
  return nome !== '' && EMAIL.test(email) ? { nome, email } : null;
}

export function conferirRemetente(valor: string): string | null {
  return lerRemetente(valor) ? null : MOTIVO_DO_REMETENTE;
}

export function conferirChavePublicaDoPush(valor: string): string | null {
  return CHAVE_PUBLICA.test(valor) ? null : MOTIVO_DA_PUBLICA;
}

export function conferirChavePrivadaDoPush(valor: string): string | null {
  return CHAVE_PRIVADA.test(valor) ? null : MOTIVO_DA_PRIVADA;
}

/** O contato do servidor para os serviços de push: um e-mail em `mailto:` ou um endereço `https://`. */
export function conferirContatoDoPush(valor: string): string | null {
  if (valor.startsWith('mailto:')) {
    return EMAIL.test(valor.slice('mailto:'.length)) ? null : MOTIVO_DO_CONTATO;
  }
  try {
    const endereco = new URL(valor);
    return endereco.protocol === 'https:' && endereco.hostname !== '' ? null : MOTIVO_DO_CONTATO;
  } catch {
    return MOTIVO_DO_CONTATO;
  }
}
