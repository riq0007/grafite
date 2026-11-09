// O envio de arquivos (design do F2c, decisão 19): os bytes crus num PUT (ou num POST, como a
// planilha que cria uma importação), com o token CSRF, e o
// progresso do envio para a barra da escolha de imagem. O `fetch` não informa o progresso do envio,
// então o navegador envia pelo XMLHttpRequest; nos testes, o envio passa pelo `fetch` simulado.

/** Um envio, como o transporte o recebe. */
export interface PedidoDeEnvio {
  metodo: 'PUT' | 'POST';
  endereco: string;
  corpo: Blob;
  cabecalhos: Record<string, string>;
  /** O progresso do envio, de 0 a 100. */
  aoProgredir: (percentual: number) => void;
}

/** Faz o envio e devolve a resposta; falha com TypeError sem rede, como o `fetch`. */
export type TransportarEnvio = (pedido: PedidoDeEnvio) => Promise<Response>;

/** Os cabeçalhos de uma resposta do XMLHttpRequest, no formato do `fetch`. */
function cabecalhosDa(xhr: XMLHttpRequest): Headers {
  const cabecalhos = new Headers();
  for (const linha of xhr
    .getAllResponseHeaders()
    .trim()
    .split(/[\r\n]+/)) {
    const separador = linha.indexOf(':');
    if (separador > 0) {
      cabecalhos.append(linha.slice(0, separador).trim(), linha.slice(separador + 1).trim());
    }
  }
  return cabecalhos;
}

/** O envio pelo XMLHttpRequest do navegador, que informa o progresso. */
export const transportarPeloNavegador: TransportarEnvio = (pedido) =>
  new Promise((resolver, rejeitar) => {
    const xhr = new XMLHttpRequest();
    xhr.open(pedido.metodo, pedido.endereco);
    for (const [nome, valor] of Object.entries(pedido.cabecalhos))
      xhr.setRequestHeader(nome, valor);
    xhr.upload.addEventListener('progress', (evento) => {
      if (evento.lengthComputable) {
        pedido.aoProgredir(Math.round((evento.loaded / evento.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      pedido.aoProgredir(100);
      const semCorpo = xhr.status === 204 || xhr.responseText === '';
      resolver(
        new Response(semCorpo ? null : xhr.responseText, {
          status: xhr.status,
          headers: cabecalhosDa(xhr),
        }),
      );
    });
    xhr.addEventListener('error', () => rejeitar(new TypeError('Falha de rede no envio.')));
    xhr.addEventListener('abort', () => rejeitar(new TypeError('Envio interrompido.')));
    xhr.send(pedido.corpo);
  });

/** O envio pelo `fetch`, sem o progresso no meio: o dos testes, com o `fetch` simulado. */
export function transportarPeloFetch(buscar: (pedido: Request) => Promise<Response>) {
  return async (pedido: PedidoDeEnvio): Promise<Response> => {
    const resposta = await buscar(
      new Request(new URL(pedido.endereco, 'http://localhost'), {
        method: pedido.metodo,
        headers: pedido.cabecalhos,
        body: pedido.corpo,
      }),
    );
    pedido.aoProgredir(100);
    return resposta;
  };
}
