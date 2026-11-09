// A regra da senha (spec contas-de-acesso): tamanho e não ser adivinhável, sem exigir maiúsculas,
// números ou símbolos, como pede a NIST SP 800-63B. A tela usa a mesma função para avisar antes de
// enviar, e a API, para recusar.
import { normalizarUsuario } from './usuario.ts';

const MINIMO = 12;
const MAXIMO = 128;

/** As ordens de uma sequência simples. Os algarismos dão a volta: 9 e 0 são vizinhos. */
const ORDENS = [
  { caracteres: '0123456789', ciclica: true },
  { caracteres: 'abcdefghijklmnopqrstuvwxyz', ciclica: false },
  { caracteres: 'qwertyuiopasdfghjklzxcvbnm', ciclica: false },
];

/**
 * Senhas comuns de 12 caracteres ou mais, em português e em inglês, comparadas em minúsculas. As
 * mais curtas já caem pelo tamanho, e as sequências e repetições, pelas outras regras.
 */
const SENHAS_COMUNS = new Set([
  '123456abcdef',
  '1q2w3e4r5t6y',
  '1qaz2wsx3edc',
  'abc123456789',
  'abcd12345678',
  'admin1234567',
  'admin@123456',
  'administrador',
  'administrator',
  'bemvindo1234',
  'brasil123456',
  'brasil@12345',
  'corinthians1',
  'empresa12345',
  'empresa@2026',
  'flamengo1234',
  'grafite12345',
  'grafite123456',
  'grafite@2025',
  'grafite@2026',
  'grafite@2027',
  'iloveyou1234',
  'minhasenha123',
  'minhasenha1234',
  'mudar@123456',
  'mudarsenha123',
  'p@ssw0rd1234',
  'p@ssword1234',
  'palmeiras123',
  'passw0rd1234',
  'password1234',
  'password12345',
  'password123456',
  'password@123',
  'passwordpassword', // gitleaks:allow: senha fraca de exemplo da lista, e não um segredo
  'q1w2e3r4t5y6',
  'qwerty123456',
  'saopaulo1234',
  'senha1234567',
  'senha12345678',
  'senha@123456',
  'senhasenha12',
  'teamo1234567',
  'trocar@12345',
  'trocarsenha1',
  'vasco1234567',
  'welcome12345',
]);

function ehSequencia(caracteres: readonly string[]): boolean {
  return ORDENS.some(({ caracteres: ordem, ciclica }) =>
    [1, -1].some((passo) =>
      caracteres.every((caractere, i) => {
        if (i === 0) return ordem.includes(caractere);
        const vizinho = ordem.indexOf(caracteres[i - 1] ?? '') + passo;
        const esperado = ciclica ? (vizinho + ordem.length) % ordem.length : vizinho;
        return ordem[esperado] === caractere;
      }),
    ),
  );
}

/** Por que a senha não serve, em pt-BR, ou `null` se ela serve. */
export function avaliarSenha(senha: string, { usuario }: { usuario: string }): string | null {
  // Cada caractere conta um, e não cada metade de um emoji.
  const tamanho = Array.from(senha).length;
  if (tamanho < MINIMO) return `Use pelo menos ${MINIMO} caracteres.`;
  if (tamanho > MAXIMO) return `Use no máximo ${MAXIMO} caracteres.`;
  const minusculas = senha.toLowerCase();
  const caracteres = Array.from(minusculas);
  if (caracteres.every((c) => c === caracteres[0])) {
    return 'A senha não pode ser um caractere repetido.';
  }
  if (ehSequencia(caracteres)) return 'A senha não pode ser uma sequência, como 123456 ou abcdef.';
  const doUsuario = normalizarUsuario(usuario);
  if (doUsuario !== '' && minusculas.includes(doUsuario)) {
    return 'A senha não pode conter o seu usuário.';
  }
  if (SENHAS_COMUNS.has(minusculas)) return 'Esta senha é comum demais. Escolha outra.';
  return null;
}
