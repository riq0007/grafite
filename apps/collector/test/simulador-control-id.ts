// O simulador da API do Control iD (change p2c-saude-do-control-id, design, decisão 5): um servidor
// HTTP do Node numa porta livre, que responde como um controle de acesso ao login (`login.fcgi`), às
// informações do sistema (`system_information.fcgi`) e à saída (`logout.fcgi`), com os pedidos POST
// em JSON e a sessão no endereço, como o PMG fala com eles. Os modos:
// - `aceita`: o usuário e a senha certos dão a sessão, e a sessão dá as informações da gravação;
// - `recusa`: o login responde 401;
// - `sem-sessao`: o login responde 200 sem a sessão;
// - `cala`: nada responde;
// - `outro`: tudo responde 404, como uma impressora no IP do controle.
// Ele guarda as sessões abertas, para o teste conferir que cada sondagem sai da sua. A gravação é a
// resposta das informações do sistema, em JSON; as chaves que começam com `_`, como a `_origem`, que
// diz de onde ela veio, ficam fora da resposta.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type ModoDoSimulador = 'aceita' | 'recusa' | 'sem-sessao' | 'cala' | 'outro';

export interface PedidoRecebido {
  /** O caminho, sem a sessão. */
  caminho: string;
  sessao: string | null;
  corpo: unknown;
}

export interface SimuladorControlId {
  porta: number;
  definirModo: (modo: ModoDoSimulador) => void;
  /** As sessões que entraram e ainda não saíram. */
  sessoesAbertas: () => number;
  pedidos: () => readonly PedidoRecebido[];
  fechar: () => Promise<void>;
}

/** A resposta das informações do sistema na gravação, sem as chaves que começam com `_`. */
export function lerGravacaoDoControle(texto: string): Record<string, unknown> {
  const lida = JSON.parse(texto) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(lida).filter(([chave]) => !chave.startsWith('_')));
}

const responder = (resposta: ServerResponse, status: number, corpo?: unknown) => {
  resposta.writeHead(status, { 'content-type': 'application/json' });
  resposta.end(corpo === undefined ? '' : JSON.stringify(corpo));
};

async function lerCorpo(pedido: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  for await (const parte of pedido) partes.push(parte as Buffer);
  // A foto enviada pela restauração chega em bytes.
  if (String(pedido.headers['content-type'] ?? '').startsWith('application/octet-stream')) {
    return Buffer.concat(partes);
  }
  const texto = Buffer.concat(partes).toString('utf8');
  if (texto.trim() === '') return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

export async function iniciarSimuladorControlId({
  gravacao,
  usuario,
  senha,
  modo: modoInicial = 'aceita',
  porta = 0,
  objetos = {},
  fotos = {},
  falhar = [],
}: {
  gravacao: { arquivo: string } | { texto: string };
  usuario: string;
  senha: string;
  modo?: ModoDoSimulador;
  porta?: number;
  /** As linhas de cada objeto do controle, que o `load_objects.fcgi` devolve (P5a). */
  objetos?: Record<string, unknown[]>;
  /** A foto JPEG de cada usuário, pelo id, que o `user_get_image.fcgi` devolve. */
  fotos?: Record<number, Buffer>;
  /** Os objetos cuja leitura responde 500. */
  falhar?: readonly string[];
}): Promise<
  SimuladorControlId & {
    /** Os objetos de agora, com os criados pela restauração (P5b). */
    objetos: () => Record<string, unknown[]>;
    /** As fotos recebidas pelo user_set_image.fcgi, pelo id do usuário. */
    fotosRecebidas: () => ReadonlyMap<number, Buffer>;
  }
> {
  const guardados: Record<string, unknown[]> = Object.fromEntries(
    Object.entries(objetos).map(([nome, linhas]) => [nome, [...linhas]]),
  );
  const recebidas = new Map<number, Buffer>();
  const informacoes = lerGravacaoDoControle(
    'arquivo' in gravacao ? readFileSync(gravacao.arquivo, 'utf8') : gravacao.texto,
  );
  let modo = modoInicial;
  const sessoes = new Set<string>();
  const recebidos: PedidoRecebido[] = [];
  /** Os pedidos que o modo `cala` deixou sem resposta, fechados no fim. */
  const calados = new Set<ServerResponse>();

  const servidor = createServer(async (pedido, resposta) => {
    const endereco = new URL(pedido.url ?? '/', 'http://simulador');
    const sessao = endereco.searchParams.get('session');
    const corpo = await lerCorpo(pedido);
    recebidos.push({ caminho: endereco.pathname, sessao, corpo });
    if (modo === 'cala') {
      calados.add(resposta);
      resposta.on('close', () => calados.delete(resposta));
      return;
    }
    if (modo === 'outro' || pedido.method !== 'POST') return responder(resposta, 404);
    switch (endereco.pathname) {
      case '/login.fcgi': {
        if (modo === 'recusa') return responder(resposta, 401, { error: 'Invalid login' });
        if (modo === 'sem-sessao') return responder(resposta, 200, {});
        const { login, password } = (corpo ?? {}) as { login?: unknown; password?: unknown };
        if (login !== usuario || password !== senha) {
          return responder(resposta, 401, { error: 'Invalid login' });
        }
        const nova = randomUUID().replaceAll('-', '');
        sessoes.add(nova);
        return responder(resposta, 200, { session: nova });
      }
      case '/system_information.fcgi':
        if (!sessao || !sessoes.has(sessao)) {
          return responder(resposta, 401, { error: 'Invalid session' });
        }
        return responder(resposta, 200, informacoes);
      case '/load_objects.fcgi': {
        if (!sessao || !sessoes.has(sessao)) {
          return responder(resposta, 401, { error: 'Invalid session' });
        }
        const objeto = String((corpo as { object?: unknown } | null)?.object ?? '');
        if (falhar.includes(objeto)) return responder(resposta, 500, { error: 'Internal error' });
        return responder(resposta, 200, { [objeto]: guardados[objeto] ?? [] });
      }
      case '/create_objects.fcgi': {
        if (!sessao || !sessoes.has(sessao)) {
          return responder(resposta, 401, { error: 'Invalid session' });
        }
        const { object, values } = (corpo ?? {}) as { object?: unknown; values?: unknown };
        const objeto = String(object ?? '');
        if (falhar.includes(objeto) || !Array.isArray(values)) {
          return responder(resposta, 500, { error: 'Internal error' });
        }
        guardados[objeto] = [...(guardados[objeto] ?? []), ...values];
        return responder(resposta, 200, {
          ids: values.map((valor) => (valor as { id?: unknown }).id),
        });
      }
      case '/user_set_image.fcgi': {
        if (!sessao || !sessoes.has(sessao)) {
          return responder(resposta, 401, { error: 'Invalid session' });
        }
        const usuario = Number(endereco.searchParams.get('user_id'));
        recebidas.set(usuario, Buffer.isBuffer(corpo) ? corpo : Buffer.from(String(corpo ?? '')));
        return responder(resposta, 200, {});
      }
      case '/user_get_image.fcgi': {
        if (!sessao || !sessoes.has(sessao)) {
          return responder(resposta, 401, { error: 'Invalid session' });
        }
        const foto = fotos[Number((corpo as { user_id?: unknown } | null)?.user_id)];
        if (!foto) return responder(resposta, 404, { error: 'No image' });
        resposta.writeHead(200, { 'content-type': 'image/jpeg' });
        return resposta.end(foto);
      }
      case '/logout.fcgi':
        if (sessao) sessoes.delete(sessao);
        return responder(resposta, 200, {});
      default:
        return responder(resposta, 404);
    }
  });
  await new Promise<void>((pronto) => servidor.listen(porta, '127.0.0.1', pronto));
  return {
    porta: (servidor.address() as AddressInfo).port,
    definirModo: (novo) => {
      modo = novo;
    },
    sessoesAbertas: () => sessoes.size,
    objetos: () => guardados,
    fotosRecebidas: () => recebidas,
    pedidos: () => recebidos,
    fechar: () =>
      new Promise<void>((pronto) => {
        for (const calado of calados) calado.destroy();
        servidor.closeAllConnections();
        servidor.close(() => pronto());
      }),
  };
}
