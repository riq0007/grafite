// O código de uso único e a sessão do painel (change painel-da-operacao, design, decisão 2). O
// comando gera o código de 32 bytes e abre o navegador em http://127.0.0.1:<porta>/#<código>: o
// fragmento não vai ao servidor nem aos logs. A página troca o código pelo cookie da sessão, que é
// HttpOnly e SameSite=Strict, e o código não vale de novo. Cada pedido da API precisa do cookie.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { OpcoesDoServidorDoPainel } from './servidor.ts';

const COOKIE = 'grafite_painel';

export interface SessaoDoPainel {
  /** O código que o comando põe no endereço que abre. */
  readonly codigo: string;
  /** Troca o código pelo token da sessão, uma vez só. */
  trocar(codigo: string): 'trocado' | 'usado' | 'errado';
  /** O token da sessão, depois da troca. */
  readonly token: string | null;
}

const iguais = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

/** A sessão do painel; o código dado é o do servidor simulado da página, nos testes. */
export function criarSessao(codigo = randomBytes(32).toString('base64url')): SessaoDoPainel {
  let token: string | null = null;
  return {
    codigo,
    get token() {
      return token;
    },
    trocar(digitado) {
      if (!iguais(digitado, codigo)) return 'errado';
      if (token !== null) return 'usado';
      token = randomBytes(32).toString('base64url');
      return 'trocado';
    },
  };
}

/** O valor do cookie da sessão no cabeçalho do pedido. */
function cookieDaSessao(cabecalho: string | undefined): string | null {
  for (const parte of (cabecalho ?? '').split(';')) {
    const [nome, ...valor] = parte.trim().split('=');
    if (nome === COOKIE) return valor.join('=');
  }
  return null;
}

/** A API do painel atrás da sessão: o POST /sessao troca o código, e o resto exige o cookie. */
export function comSessao(
  sessao: SessaoDoPainel,
  api: OpcoesDoServidorDoPainel['api'],
): OpcoesDoServidorDoPainel['api'] {
  return async (pedido) => {
    if (pedido.caminho === '/sessao' && pedido.metodo === 'POST') {
      const { codigo } = (pedido.corpo ?? {}) as { codigo?: unknown };
      const resultado = typeof codigo === 'string' ? sessao.trocar(codigo) : 'errado';
      if (resultado === 'usado') {
        return {
          status: 403,
          corpo: { mensagem: 'Este código já foi usado: abra o painel de novo pelo comando.' },
        };
      }
      if (resultado === 'errado') {
        return { status: 403, corpo: { mensagem: 'O código da sessão não confere.' } };
      }
      return {
        status: 200,
        corpo: {},
        cabecalhos: {
          'set-cookie': `${COOKIE}=${sessao.token}; Path=/; HttpOnly; SameSite=Strict`,
        },
      };
    }
    const token = cookieDaSessao(pedido.cabecalhos.cookie);
    if (sessao.token === null || token === null || !iguais(token, sessao.token)) {
      return {
        status: 401,
        corpo: {
          mensagem: 'Abra o painel pelo comando: o endereço que ele abre traz o código da sessão.',
        },
      };
    }
    return api(pedido);
  };
}
