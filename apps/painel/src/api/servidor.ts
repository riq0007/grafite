// A API do painel pelo servidor de verdade (change painel-da-operacao, design, decisões 1 a 3): os
// pedidos vão ao /api da mesma origem, com o cookie da sessão, e os eventos chegam pelo SSE. A
// sessão abre com o código que o comando pôs no fragmento do endereço, que sai dele em seguida.
import { type ApiDoPainel, ErroDoPainel } from './tipos.ts';

async function pedir<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`/api${caminho}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  if (resposta.status === 204) return undefined as T;
  const corpo = (await resposta.json().catch(() => ({}))) as { mensagem?: string };
  if (!resposta.ok) {
    throw new ErroDoPainel(
      resposta.status,
      corpo.mensagem ?? `O painel respondeu ${resposta.status}.`,
    );
  }
  return corpo as T;
}

const enviar = (corpo: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(corpo) });

export function apiDoServidor(): ApiDoPainel {
  return {
    estado: () => pedir('/estado'),
    tarefas: () => pedir('/tarefas'),
    async iniciar(tarefa, campos) {
      try {
        return await pedir<{ iniciada: string }>('/tarefas', enviar({ tarefa, campos }));
      } catch (erro) {
        if (erro instanceof ErroDoPainel && erro.status === 409) return { recusada: erro.message };
        throw erro;
      }
    },
    responder: (id, resposta) => pedir('/respostas', enviar({ id, resposta })),
    cancelar: () => pedir('/cancelar', { method: 'POST' }),
    logs(servico, linhas, busca) {
      const consulta = new URLSearchParams({ servico, linhas: String(linhas) });
      if (busca) consulta.set('busca', busca);
      return pedir(`/logs?${consulta}`);
    },
    pacotes: () => pedir('/pacotes'),
    backups: () => pedir('/backups'),
    configuracoes: () => pedir('/configuracoes'),
    eventos(aoReceber) {
      const fonte = new EventSource('/api/eventos');
      fonte.onmessage = (mensagem) => aoReceber(JSON.parse(mensagem.data as string));
      return () => fonte.close();
    },
  };
}

/**
 * Troca o código do fragmento pela sessão e tira o fragmento do endereço. Sem código, a sessão de
 * antes, do cookie, pode valer ainda.
 */
export async function abrirSessao(): Promise<'aberta' | 'sem-codigo' | 'recusada'> {
  const codigo = window.location.hash.slice(1);
  if (codigo === '') return 'sem-codigo';
  window.history.replaceState(null, '', window.location.pathname);
  try {
    await pedir('/sessao', enviar({ codigo }));
    return 'aberta';
  } catch {
    return 'recusada';
  }
}
