// Os contêineres como a peça dos serviços no servidor Linux (change servidor-linux-com-docker,
// design, decisão 3): o mesmo contrato dos serviços do Windows, pelo docker compose do projeto da
// instalação. O código comum dos comandos chama os serviços pelos nomes do Windows, e esta peça os
// liga aos serviços do Compose. Registrar não faz nada: os serviços são os do compose.yaml, que a
// instalação gera, e o Docker os inicia com o servidor e os reinicia depois de uma falha.
import type { ExecutarProcesso } from '@grafite/operacao';
import { pastasDaInstalacaoNoLinux, servicosDaInstalacao } from '../layout.ts';
import type { EstadoDoServico, Servicos } from '../windows/servicos.ts';

/** O serviço do Compose de cada serviço do Grafite, pelo nome que ele tem no Windows. */
const NO_COMPOSE: Record<string, string> = Object.fromEntries(
  servicosDaInstalacao().map(({ id, noCompose }) => [id, noCompose]),
);

/** O serviço do Compose de um serviço do Grafite, pelo nome que ele tem no Windows. */
export function servicoDoCompose(id: string): string {
  const servico = NO_COMPOSE[id];
  if (servico === undefined) throw new Error(`O serviço ${id} não é um serviço do Grafite.`);
  return servico;
}

/** A situação de um contêiner, como o docker compose ps a diz, no estado de um serviço. */
const ESTADOS: Record<string, EstadoDoServico> = {
  running: 'rodando',
  exited: 'parado',
  created: 'parado',
  dead: 'parado',
  restarting: 'mudando',
  paused: 'mudando',
  removing: 'mudando',
};

/** O projeto do Compose da instalação, que todo comando do docker compose recebe. */
export function argumentosDoCompose(raiz: string): string[] {
  const pastas = pastasDaInstalacaoNoLinux(raiz);
  return [
    'compose',
    '--project-name',
    'grafite',
    '--file',
    pastas.compose,
    '--env-file',
    pastas.composeEnv,
  ];
}

/** Os contêineres do docker compose ps, que responde uma linha por contêiner ou, antes, uma lista. */
function lerContaineres(saida: string): { State?: string }[] {
  const texto = saida.trim();
  if (texto === '') return [];
  if (texto.startsWith('[')) return JSON.parse(texto) as { State?: string }[];
  return texto.split('\n').map((linha) => JSON.parse(linha) as { State?: string });
}

export function servicosDoDocker({
  executar,
  raiz,
  esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
  tentativas = 60,
}: {
  executar: ExecutarProcesso;
  raiz: string;
  esperar?: (ms: number) => Promise<void>;
  /** Quantas consultas, a 1 s uma da outra, até desistir de esperar. */
  tentativas?: number;
}): Servicos {
  const compose = (...argumentos: string[]) =>
    executar('docker', [...argumentosDoCompose(raiz), ...argumentos], { env: process.env });

  async function estadoDo(servico: string): Promise<EstadoDoServico> {
    const { codigo, saida, erro } = await compose('ps', '--all', '--format', 'json', servico);
    if (codigo !== 0) {
      throw new Error(
        `Não foi possível ver o estado do serviço ${servico}: ${(erro || saida).trim()}`,
      );
    }
    const [conteiner] = lerContaineres(saida);
    if (conteiner === undefined) return 'ausente';
    return ESTADOS[conteiner.State ?? ''] ?? 'mudando';
  }

  async function esperarAte(servico: string, esperado: EstadoDoServico, verbo: string) {
    for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
      if ((await estadoDo(servico)) === esperado) return;
      await esperar(1000);
    }
    throw new Error(
      `O serviço ${servico} não ficou ${verbo} a tempo. Veja o log dele: docker compose --project-name grafite logs ${servico}`,
    );
  }

  async function rodar(verbo: string, servico: string, ...argumentos: string[]) {
    const { codigo, saida, erro } = await compose(...argumentos, servico);
    if (codigo !== 0) {
      throw new Error(`Não foi possível ${verbo} o serviço ${servico}: ${(erro || saida).trim()}`);
    }
  }

  return {
    async registrar() {},

    async iniciar(id) {
      const servico = servicoDoCompose(id);
      // O up recria o contêiner quando a imagem ou a configuração mudaram, como numa atualização.
      await rodar('iniciar', servico, 'up', '--detach');
      await esperarAte(servico, 'rodando', 'rodando');
    },

    async parar(id) {
      const servico = servicoDoCompose(id);
      await rodar('parar', servico, 'stop');
      const estado = await estadoDo(servico);
      if (estado !== 'parado' && estado !== 'ausente')
        await esperarAte(servico, 'parado', 'parado');
    },

    async estado(id) {
      return estadoDo(servicoDoCompose(id));
    },
  };
}
